import http from 'node:http';
import { createCore } from '../src/core.js';
import { createNodeHandler } from '../adapters/node.js';
import { resolveConfig } from '../src/config.js';
import base from '../config/pasale.config.js';

// Monday 2030-03-04 10:00 in New York (EST)
export const NOW = new Date('2030-03-04T15:00:00Z');

export const testConfig = (over = {}) => ({
  ...base,
  business: { ...base.business, name: 'Test Shop', phone: '(555) 010-0000', ownerEmail: 'owner@example.com' },
  hours: { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], wed: ['09:00', '17:00'], thu: ['09:00', '17:00'], fri: ['09:00', '17:00'], sat: ['10:00', '14:00'], sun: null },
  slotMinutes: 60,
  minNoticeHours: 24,
  daysAhead: 14,
  blackoutDates: ['2030-03-06'],
  delivery: { type: 'webhook' },
  security: { rateLimit: { max: 50, windowMinutes: 10 }, trustProxy: false },
  ...over,
});

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

// A stand-in for the business inbox / email provider. mode: 'ok' | 'fail' | status number
export async function startInbox(mode = 'ok') {
  const received = [];
  const requests = [];
  const inbox = { mode, received, requests };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      received.push(parsed);
      requests.push({ headers: req.headers, body: parsed });
      if (inbox.mode === 'ok') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"id":"stub"}');
      res.writeHead(inbox.mode === 'fail' ? 500 : inbox.mode).end('nope');
    });
  });
  const port = await listen(server);
  inbox.url = `http://127.0.0.1:${port}/inbox`;
  inbox.close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
  return inbox;
}

export async function startApp({ inbox, config = testConfig(), env = {}, handlerOptions = {} } = {}) {
  const logs = [];
  const fullEnv = { PASALE_WEBHOOK_URL: inbox?.url ?? 'http://127.0.0.1:1/unreachable', ...env };
  const core = createCore({ config: resolveConfig(config, fullEnv), env: fullEnv, now: () => NOW, logger: { info: (o) => logs.push(o) } });
  const server = http.createServer(createNodeHandler(core, { trustProxy: false, ...handlerOptions }));
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    base: baseUrl,
    logs,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
    post: (body, headers = {}) => fetch(`${baseUrl}/api/book`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    config: () => fetch(`${baseUrl}/api/config`).then((r) => r.json()),
  };
}

let n = 0;
export const goodBody = (over = {}) => ({
  attemptId: `try-${String(++n).padStart(6, '0')}-abcdefghij`,
  name: 'Ana Pérez',
  phone: '(555) 123-4567',
  services: ['browse'],
  date: '2030-03-05',
  time: '11:00',
  note: '',
  consent: true,
  language: 'es',
  ...over,
});
