import { DEFAULT_COPY } from './defaults.js';
import { toMinutes } from './slots.js';
import { ICON_NAMES } from '../public/icons.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL = /^https?:\/\/[^\s]+$/;

export class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid Pásale configuration:\n - ${problems.join('\n - ')}`);
    this.problems = problems;
  }
}

function merge(defaults = {}, overrides = {}) {
  const out = { ...defaults };
  for (const [k, v] of Object.entries(overrides)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(defaults[k], v) : v;
  }
  return out;
}

function missingKeys(defaults, actual, prefix = '') {
  const missing = [];
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in actual)) missing.push(prefix + k);
    else if (v && typeof v === 'object') missing.push(...missingKeys(v, actual[k], `${prefix}${k}.`));
  }
  return missing;
}

// Validates the raw config plus environment and returns the resolved config.
// Fails loudly at startup so a mistake never becomes a silent runtime fault.
export function resolveConfig(raw, env = {}) {
  const problems = [];
  const c = structuredClone(raw);
  c.demo = Boolean(c.demo) || env.DEMO_MODE === 'true';

  const b = c.business ?? {};
  if (!b.name) problems.push('business.name is required');
  if (!b.phone || String(b.phone).replace(/\D/g, '').length < 7) problems.push('business.phone must be a phone number');
  if (!b.address) problems.push('business.address is required');
  if (!HTTP_URL.test(b.publicUrl ?? '')) problems.push('business.publicUrl must be a full http(s) URL (used by the /sign QR code)');

  if (!Array.isArray(c.languages) || !c.languages.length) problems.push('languages must be a non-empty list');
  if (!c.languages?.includes(c.defaultLanguage)) problems.push('defaultLanguage must be one of languages');

  c.resolvedCopy = {};
  for (const lang of c.languages ?? []) {
    const merged = merge(DEFAULT_COPY[lang] ?? {}, c.copy?.[lang] ?? {});
    for (const key of ['followUp', 'responseWindow']) if (typeof c[key]?.[lang] === 'string') merged[key] = c[key][lang];
    const gaps = missingKeys(DEFAULT_COPY.en, merged);
    if (gaps.length) problems.push(`copy.${lang} is missing: ${gaps.join(', ')}`);
    c.resolvedCopy[lang] = merged;
  }

  if (!Array.isArray(c.services) || !c.services.length) problems.push('services must be a non-empty list');
  const ids = new Set();
  for (const s of c.services ?? []) {
    if (!/^[a-z0-9_-]{1,40}$/.test(s.id ?? '')) problems.push(`service id "${s.id}" must be lowercase letters, digits, - or _`);
    if (ids.has(s.id)) problems.push(`duplicate service id "${s.id}"`);
    ids.add(s.id);
    if (s.icon !== undefined && !ICON_NAMES.includes(s.icon)) problems.push(`service "${s.id}" icon "${s.icon}" is not one of: ${ICON_NAMES.join(', ')}`);
    for (const lang of c.languages ?? []) if (!s.label?.[lang]) problems.push(`service "${s.id}" needs a label for "${lang}"`);
  }

  try {
    new Intl.DateTimeFormat('en', { timeZone: c.timezone });
  } catch {
    problems.push(`timezone "${c.timezone}" is not a valid IANA time zone`);
  }
  for (const d of DAY_KEYS) {
    const r = c.hours?.[d];
    if (r === undefined) problems.push(`hours.${d} is missing (use null for closed)`);
    else if (r !== null) {
      try {
        if (toMinutes(r[0]) >= toMinutes(r[1])) problems.push(`hours.${d}: opening must be before closing`);
      } catch (e) {
        problems.push(`hours.${d}: ${e.message}`);
      }
    }
  }
  if (!Number.isInteger(c.slotMinutes) || c.slotMinutes < 15) problems.push('slotMinutes must be an integer >= 15');
  if (!(c.minNoticeHours >= 0)) problems.push('minNoticeHours must be >= 0');
  if (!Number.isInteger(c.daysAhead) || c.daysAhead < 1 || c.daysAhead > 90) problems.push('daysAhead must be 1-90');
  for (const x of c.blackoutDates ?? []) {
    const ok = typeof x === 'string' ? ISO_DATE.test(x) : ISO_DATE.test(x?.from) && ISO_DATE.test(x?.to);
    if (!ok) problems.push(`blackoutDates entry ${JSON.stringify(x)} must be "YYYY-MM-DD" or { from, to }`);
  }

  if (!c.demo) {
    const d = c.delivery ?? {};
    if (d.type === 'resend') {
      if (!b.ownerEmail || !String(b.ownerEmail).includes('@')) problems.push('business.ownerEmail must be an email address');
      if (!d.from) problems.push('delivery.from is required');
      if (!env.RESEND_API_KEY) problems.push('RESEND_API_KEY is not set');
    } else if (d.type === 'webhook') {
      if (!HTTP_URL.test(env.PASALE_WEBHOOK_URL ?? '')) problems.push('PASALE_WEBHOOK_URL must be set to an http(s) URL');
    } else {
      problems.push('delivery.type must be "resend" or "webhook"');
    }
  }

  if (c.showCredit !== false && !HTTP_URL.test(c.creditUrl ?? '')) problems.push('creditUrl must be a URL (or set showCredit: false)');
  const rl = c.security?.rateLimit;
  if (!(rl?.max >= 1) || !(rl?.windowMinutes > 0)) problems.push('security.rateLimit needs max >= 1 and windowMinutes > 0');

  if (problems.length) throw new ConfigError(problems);
  return c;
}
