import { DEFAULT_COPY } from './defaults.js';
import { toMinutes } from './slots.js';
import { ICON_NAMES } from '../public/icons.js';
import { contrastRatio } from './contrast.js';

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

const HEX = /^#[0-9a-fA-F]{6}$/;
const IMAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(jpe?g|png|webp|avif)$/i;
const MAX_GALLERY = 3;
const THEME_TOKENS = ['background', 'surface', 'text', 'textMuted', 'border', 'accent', 'accentHover', 'accentSecondary', 'notice', 'noticeText', 'footer'];

// Optional features. Every one is off when its field is absent.
function validateOptionalFeatures(c, problems) {
  const langs = c.languages ?? [];
  const perLang = (value, name) => {
    for (const lang of langs) if (typeof value?.[lang] !== 'string' || !value[lang].trim()) problems.push(`${name} needs text for "${lang}"`);
  };

  if (c.serviceSelect !== undefined && !['single', 'multiple'].includes(c.serviceSelect)) problems.push('serviceSelect must be "single" or "multiple"');

  if (c.servicePrompts !== undefined) {
    const known = new Set((c.services ?? []).map((s) => s.id));
    for (const [id, prompt] of Object.entries(c.servicePrompts ?? {})) {
      if (!known.has(id)) problems.push(`servicePrompts."${id}" is not a service id`);
      else perLang(prompt, `servicePrompts.${id}`);
    }
  }

  if (c.gallery !== undefined) {
    if (!Array.isArray(c.gallery) || c.gallery.length > MAX_GALLERY) problems.push(`gallery must be a list of at most ${MAX_GALLERY} items`);
    else {
      c.gallery.forEach((g, i) => {
        const n = `gallery[${i}]`;
        if (g.image && !IMAGE_FILE.test(g.image)) problems.push(`${n}.image must be a local file name in the example's images folder (jpg, png, webp or avif), not a URL or path`);
        if (g.link && !HTTP_URL.test(g.link)) problems.push(`${n}.link must be an http(s) URL`);
        perLang(g.title, `${n}.title`);
      });
    }
  }

  if (c.theme !== undefined) {
    // Every token is optional; one that is left out keeps the default look.
    for (const [k, v] of Object.entries(c.theme ?? {})) {
      if (!THEME_TOKENS.includes(k)) problems.push(`theme.${k} is not a theme token (use: ${THEME_TOKENS.join(', ')})`);
      else if (!HEX.test(v ?? '')) problems.push(`theme.${k} must be a hex color like #1f4d3a`);
    }
    // The main button is drawn in the accent color with surface-colored text.
    if (HEX.test(c.theme?.accent ?? '') && HEX.test(c.theme?.surface ?? '') && contrastRatio(c.theme.accent, c.theme.surface) < 4.5) {
      problems.push('theme.accent and theme.surface need a contrast of at least 4.5:1 (button text)');
    }
  }
  if (c.hoursNote !== undefined) perLang(c.hoursNote, 'hoursNote');
  if (c.attribution !== undefined) perLang(c.attribution, 'attribution');
  if (c.header !== undefined) {
    for (const k of ['line', 'subline', 'location']) if (c.header?.[k] !== undefined) perLang(c.header[k], `header.${k}`);
  }
  if (c.layout !== undefined && !['default', 'compact'].includes(c.layout)) problems.push('layout must be "default" or "compact"');
  if (c.showConfig !== undefined && typeof c.showConfig !== 'boolean') problems.push('showConfig must be true or false');
  // The config file is shown to visitors, so it must hold sample or public data only.
  if (c.showConfig && !c.demo) problems.push('showConfig requires demo: true (the config file is shown to visitors)');
}

// Validates the raw config plus environment and returns the resolved config.
// Fails loudly at startup so a mistake never becomes a silent runtime fault.
export function resolveConfig(raw, env = {}) {
  const problems = [];
  const c = structuredClone(raw);
  c.demo = Boolean(c.demo) || env.DEMO_MODE === 'true';

  const b = c.business ?? {};
  if (!b.name) problems.push('business.name is required');
  // A demo page may leave phone and address empty; a real page needs both so visitors can reach the business.
  const phoneDigits = String(b.phone ?? '').replace(/\D/g, '').length;
  if (!(c.demo && !b.phone) && phoneDigits < 7) problems.push('business.phone must be a phone number');
  if (!b.address && !c.demo) problems.push('business.address is required');
  if (!b.address) b.address = '';
  if (!b.phone) b.phone = '';
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

  validateOptionalFeatures(c, problems);

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

  // Hours left empty: every day closed. With a hoursNote, a demo page lets visitors request a visit without picking a time.
  c.hoursUnset = DAY_KEYS.every((d) => c.hours?.[d] === null);
  c.timeOptional = Boolean(c.demo && c.hoursUnset && c.hoursNote);

  if (problems.length) throw new ConfigError(problems);
  return c;
}
