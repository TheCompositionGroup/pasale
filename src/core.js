// Host-neutral core: Fetch API Request in, Response out. No Node-only APIs, so
// the same code runs under the Node adapter and Cloudflare Pages Functions.
import { computeDays, calendarRange } from './slots.js';
import { validateRequest } from './validate.js';
import { createRateLimiter } from './ratelimit.js';
import { deliver, DeliveryError } from './deliver.js';
import { makeReference } from './reference.js';
import { renderSign } from './sign.js';
import { SECURITY_HEADERS } from './headers.js';

const MAX_BODY = 8 * 1024;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function readJson(request) {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) throw new HttpError(415, 'unsupported_media_type');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) throw new HttpError(413, 'too_large');
  const chunks = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) {
        reader.cancel().catch(() => {});
        throw new HttpError(413, 'too_large');
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

const json = (status, payload, extra = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', ...extra } });

// Never pass request bodies, contact details or IPs to the logger.
const defaultLogger = { info: (o) => console.log(JSON.stringify(o)) };

export function createCore({ config, env = {}, now = () => new Date(), logger = defaultLogger }) {
  const limiter = createRateLimiter({
    max: config.security.rateLimit.max,
    windowMs: config.security.rateLimit.windowMinutes * 60000,
  });
  // attemptId -> { result: Promise<{status, body}>, expires }. A double click
  // shares one attempt and one reference. Failures are dropped so retries work.
  const attempts = new Map();

  function days() {
    return computeDays(config, now());
  }

  function publicConfig() {
    return {
      business: { name: config.business.name, phone: config.business.phone, address: config.business.address },
      languages: config.languages,
      defaultLanguage: config.defaultLanguage,
      services: config.services,
      demo: config.demo,
      showCredit: config.showCredit !== false,
      creditUrl: config.creditUrl,
      hours: config.hours,
      copy: config.resolvedCopy,
      calendar: calendarRange(config, now()),
      days: days(),
      // Optional features. Each is left out of the response unless the config turns it on.
      serviceSelect: config.serviceSelect === 'single' ? 'single' : undefined,
      servicePrompts: config.servicePrompts,
      gallery: config.gallery?.map((g) => ({ image: g.image ? `/gallery/${g.image}` : '', title: g.title, link: g.link ?? '' })),
      theme: config.theme,
      layout: config.layout === 'compact' ? 'compact' : undefined,
      hoursNote: config.hoursNote,
      hoursUnset: config.hoursUnset || undefined,
      timeOptional: config.timeOptional || undefined,
      attribution: config.attribution,
      header: config.header,
      showConfig: config.showConfig === true ? true : undefined,
    };
  }

  async function book(request) {
    const body = await readJson(request);
    if (typeof body.website === 'string' && body.website !== '') throw new HttpError(400, 'rejected');

    const check = validateRequest(body, config, days());
    if (!check.ok) return { status: 400, body: { ok: false, error: 'invalid', fields: check.fields } };
    const req = check.value;

    const t = now().getTime();
    for (const [k, v] of attempts) if (v.expires <= t) attempts.delete(k);
    const existing = attempts.get(req.attemptId);
    if (existing) return existing.result;

    const ref = makeReference();
    const result = (async () => {
      if (config.demo) return { status: 200, body: { ok: true, demo: true, ref } };
      try {
        await deliver(req, config, env, ref);
        return { status: 200, body: { ok: true, ref } };
      } catch (e) {
        if (!(e instanceof DeliveryError)) throw e;
        attempts.delete(req.attemptId);
        return { status: 502, body: { ok: false, error: 'delivery_failed' } };
      }
    })();
    attempts.set(req.attemptId, { result, expires: t + DUPLICATE_WINDOW_MS });
    try {
      return await result;
    } catch (e) {
      attempts.delete(req.attemptId);
      throw e;
    }
  }

  // ctx.ip is supplied by the host adapter (never taken from the request here).
  return async function handle(request, ctx = {}) {
    const id = crypto.randomUUID().slice(0, 8);
    const url = new URL(request.url);
    const path = url.pathname;
    let response;
    try {
      if (request.method === 'GET' && path === '/api/config') {
        response = json(200, publicConfig(), { 'cache-control': 'no-store' });
      } else if (request.method === 'GET' && path === '/api/health') {
        response = json(200, { ok: true });
      } else if (request.method === 'GET' && path === '/sign') {
        response = new Response(renderSign(config), { status: 200, headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
      } else if (request.method === 'POST' && path === '/api/book') {
        if (!limiter.allow(ctx.ip ?? 'unknown')) {
          response = json(429, { ok: false, error: 'rate_limited' });
        } else {
          const r = await book(request);
          response = json(r.status, r.body);
        }
      } else {
        response = json(404, { ok: false, error: 'not_found' });
      }
    } catch (e) {
      response = e instanceof HttpError
        ? json(e.status, { ok: false, error: e.code }, e.status === 413 ? { connection: 'close' } : {})
        : json(500, { ok: false, error: 'server_error' });
    }
    logger.info({ event: 'request', id, method: request.method, path, status: response.status });
    return response;
  };
}
