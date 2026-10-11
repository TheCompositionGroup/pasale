// Renders the page from /api/config. All text goes through textContent, never
// innerHTML, so configuration or server data can't inject markup.
import { ICONS } from '/icons.js';

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);

let cfg;
let lang;
let state;

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
}

const t = () => cfg.copy[lang];
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const hasPhone = () => Boolean(cfg.business.phone);
const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const mapsHref = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const fmtWeekday = (iso) => new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const fmtMonth = (iso) => new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const fmtTime = (hhmm) => new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(`2000-01-01T${hhmm}:00Z`));
const fmtLong = (iso, hhmm) => new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T${hhmm}:00Z`));

const newState = () => ({ attemptId: crypto.randomUUID(), services: new Set(), date: '', time: '', name: '', phone: '', note: '', consent: false, errors: {}, sending: false, failure: '', ticket: null });

function langButtons(onPick) {
  if (cfg.languages.length < 2) return null;
  return el('div', { class: 'langs', role: 'group' }, cfg.languages.map((l) =>
    el('button', { type: 'button', lang: l, 'aria-pressed': String(l === lang), text: cfg.copy[l].languageName, onclick: () => { lang = l; onPick(); } })));
}

// One selectable tile (native radio or checkbox, so keyboard and screen readers just work).
function tile(type, name, value, checked, content, onchange) {
  return el('label', { class: 'tile' },
    el('input', { type, name, value, checked, onchange }),
    el('span', {}, content));
}

// Optional theme tokens become CSS variables; no theme, no change.
function readableInk(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff';
}
function applyTheme(theme) {
  if (!theme) return;
  const set = (k, v) => document.documentElement.style.setProperty(k, v);
  const has = (k) => Boolean(theme[k]);
  if (has('background')) set('--page', theme.background);
  if (has('surface')) { set('--panel', theme.surface); set('--card', theme.surface); set('--field', theme.surface); }
  if (has('text')) set('--ink', theme.text);
  set('--tile', 'color-mix(in srgb, var(--page) 55%, var(--card))');
  set('--muted', has('textMuted') ? theme.textMuted : 'color-mix(in srgb, var(--ink) 72%, var(--card))');
  if (has('textMuted')) set('--step-ink', 'var(--muted)'); // section labels such as "01 / WHAT"
  set('--line', has('border') ? theme.border : 'color-mix(in srgb, var(--ink) 20%, var(--card))');
  // Fields need a 3:1 edge: a darker mix of border and text; darker still on focus.
  set('--input-border', 'color-mix(in srgb, var(--line) 45%, var(--ink))');
  set('--input-border-focus', 'var(--ink)');
  set('--card-border', 'var(--input-border)'); // cards need a visible edge too
  if (has('accent')) {
    set('--accent', theme.accent);
    set('--accent-ink', has('surface') ? theme.surface : readableInk(theme.accent));
  }
  if (has('accentHover')) set('--accent-hover', theme.accentHover);
  // accentSecondary is for non-text only: rules, heading underline, focus rings.
  if (has('accentSecondary')) { set('--rule', theme.accentSecondary); set('--focus', theme.accentSecondary); set('--field-ring', theme.accentSecondary); }
  set('--ring', `color-mix(in srgb, ${theme.accentSecondary ?? theme.accent ?? 'var(--accent)'} 22%, transparent)`);
  if (has('notice')) set('--warn-bg', theme.notice);
  if (has('noticeText')) set('--warn', theme.noticeText);
  if (has('footer')) set('--footer', theme.footer);
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// 2024-01-01 was a Monday, so index i is the i-th weekday name in the visitor's language.
const dayName = (i, style) => new Intl.DateTimeFormat(lang, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));

// Weekly hours as short rows, merging neighbours with the same hours ("Mon–Fri 9:00 AM – 5:00 PM").
function hoursRows() {
  const c = t();
  const groups = [];
  DAY_KEYS.forEach((k, i) => {
    const h = cfg.hours[k];
    const key = h ? h.join('-') : 'closed';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.to = i;
    else groups.push({ key, from: i, to: i, h });
  });
  return groups.map((g) => el('div', { class: 'hrow' },
    el('dt', { text: g.from === g.to ? dayName(g.from, 'short') : `${dayName(g.from, 'short')}–${dayName(g.to, 'short')}` }),
    el('dd', { text: g.h ? `${fmtTime(g.h[0])} – ${fmtTime(g.h[1])}` : c.closed })));
}

// Optional gallery: a missing or broken image becomes a placeholder frame.
function galleryStrip() {
  if (!cfg.gallery?.length) return null;
  const c = t();
  return el('ul', { class: 'gallery', 'aria-label': c.galleryLabel }, cfg.gallery.map((g) => {
    const title = g.title[lang];
    const frame = el('span', { class: 'frame' });
    const placeholder = () => frame.replaceChildren(el('span', { class: 'ph', text: c.galleryPlaceholder }));
    if (g.image) {
      const img = el('img', { src: g.image, alt: title, loading: 'lazy' });
      img.addEventListener('error', placeholder);
      frame.append(img);
    } else placeholder();
    const inner = [frame, el('span', { class: 'cap', text: title })];
    return el('li', {}, g.link ? el('a', { href: g.link, rel: 'noopener', target: '_blank' }, inner) : el('span', { class: 'item' }, inner));
  }));
}

// Hours: weekly rows; if unset, the hoursNote, or nothing.
function hoursBlock() {
  const c = t();
  if (cfg.hoursUnset) {
    return cfg.hoursNote ? el('div', { class: 'info hours-note' }, el('span', { class: 'label', text: c.labelHours }), el('p', { text: cfg.hoursNote[lang] })) : null;
  }
  const hours = el('details', { class: 'hours' }, el('summary', { text: c.labelHours }), el('dl', {}, hoursRows()), cfg.hoursNote ? el('p', { class: 'note', text: cfg.hoursNote[lang] }) : null);
  if (matchMedia('(min-width: 960px)').matches) hours.open = true;
  return hours;
}

function businessPanel() {
  const c = t();
  const b = cfg.business;
  const h = cfg.header;
  const place = h?.location ? el('span', { text: h.location[lang] }) : b.address ? el('a', { href: mapsHref(b.address), rel: 'noopener', target: '_blank', text: b.address }) : null;
  return el('aside', { class: 'biz-panel' }, el('div', { class: 'biz-inner' },
    // With a header configured, the headline (copy.title) is the page's top heading and the header line sits under it.
    el('h1', { class: 'biz-name', text: h ? c.title : b.name }),
    h?.line ? el('p', { class: 'kicker', text: h.line[lang] }) : null,
    h?.subline ? el('p', { class: 'subline', text: h.subline[lang] }) : null,
    el('p', { class: 'intro', text: c.intro }),
    galleryStrip(),
    hasPhone() ? el('a', { class: 'call-card', href: telHref(b.phone) },
      el('span', { class: 'label', text: c.labelCall }), el('strong', { text: b.phone })) : null,
    place ? el('div', { class: 'info' }, el('span', { class: 'label', text: c.labelAddress }), place) : null,
    hoursBlock()));
}

// Both panels on every screen. Desktop: side by side. Phones: stacked.
function mount(content, focus, cls = '') {
  const foot = cfg.attribution ? el('footer', { class: 'attribution', text: cfg.attribution[lang] }) : null;
  root.replaceChildren(el('div', { class: `layout ${cls}`.trim() }, businessPanel(), el('main', { class: 'form-panel' }, content)), foot);
  if (focus) root.querySelector(focus)?.focus();
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// Decorative line icon from the shared set. Hidden from assistive tech; the tile's text label names it.
function svgIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '44', height: '44', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const DAY_MS = 86400000;
const isoToMs = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

// Dates laid out by calendar week, Sun to Sat. Days without times are shown as disabled
// "closed" tiles; cells outside the bookable range are blank so columns stay aligned.
function dateTiles() {
  const c = t();
  const open = new Map(cfg.days.map((d) => [d.date, d]));
  const noTimes = new Set(cfg.calendar.noTimes);
  const kinds = new Set(); // which kinds of unavailable day appear, for the key under the grid
  const from = isoToMs(cfg.calendar.from);
  const to = isoToMs(cfg.calendar.to);
  const cells = [];
  for (let ms = from - new Date(from).getUTCDay() * DAY_MS; ms <= to + (6 - new Date(to).getUTCDay()) * DAY_MS; ms += DAY_MS) {
    if (ms < from || ms > to) {
      cells.push(el('span', { class: 'tile spacer', 'aria-hidden': 'true' }));
      continue;
    }
    const iso = new Date(ms).toISOString().slice(0, 10);
    const firstOfMonth = ms === from || new Date(ms).getUTCDate() === 1;
    const day = open.get(iso);
    const content = [
      el('span', { class: 'wd', text: fmtWeekday(iso) }),
      el('span', { class: 'dn', text: String(new Date(ms).getUTCDate()) }),
      el('span', { class: firstOfMonth ? 'mo' : 'sr', text: fmtMonth(iso) }),
    ];
    if (day) {
      cells.push(tile('radio', 'date', iso, iso === state.date, content, () => {
        state.date = iso;
        if (!day.slots.includes(state.time)) state.time = '';
        document.getElementById('times').replaceWith(timesFieldset());
      }));
    } else {
      // Closed by the business's config, or open that day but no preferred times left.
      const kind = noTimes.has(iso) ? 'full' : 'closed';
      kinds.add(kind);
      cells.push(el('label', { class: `tile is-${kind}` },
        el('input', { type: 'radio', name: 'date', value: iso, disabled: true, 'aria-disabled': 'true' }),
        el('span', {}, content, el('span', { class: 'sr', text: `, ${kind === 'full' ? c.dayNoTimes : c.dayClosed}` }))));
    }
  }
  return { cells, kinds };
}

// Visual key under the grid for the kinds of unavailable day that are actually showing.
function dateKey(kinds) {
  const c = t();
  if (!kinds.size) return null;
  const item = (kind, label) => el('span', { class: 'key' }, el('span', { class: `swatch is-${kind}`, text: '12' }), label);
  return el('p', { class: 'keys', 'aria-hidden': 'true' },
    kinds.has('closed') ? item('closed', c.dayClosed) : null,
    kinds.has('full') ? item('full', c.dayNoTimes) : null);
}

function timesFieldset() {
  const c = t();
  const day = cfg.days.find((d) => d.date === state.date);
  if (!day) {
    return el('fieldset', { id: 'times' },
      el('legend', { text: c.timeLabel }),
      el('div', { class: 'times-empty', 'aria-disabled': 'true', text: c.pickDayFirst }));
  }
  const err = state.errors.time ? c.fieldErrors.time : '';
  return el('fieldset', { id: 'times', class: err ? 'bad' : '', 'aria-describedby': err ? 'time-err' : false },
    el('legend', { text: c.timeLabel }),
    el('div', { class: 'tiles times' }, day.slots.map((s) => tile('radio', 'time', s, s === state.time, fmtTime(s), () => { state.time = s; }))),
    err ? el('p', { class: 'err', id: 'time-err', text: err }) : null);
}

// servicePrompts: the message prompt follows the selected visit type.
function noteLabelText() {
  const c = t();
  const picked = cfg.services.find((s) => state.services.has(s.id) && cfg.servicePrompts?.[s.id]);
  return picked ? `${cfg.servicePrompts[picked.id][lang]} ${c.optionalTag}` : c.noteLabel;
}

function configViewer() {
  if (!cfg.showConfig) return null;
  const c = t();
  const pre = el('pre', { class: 'source', tabindex: '0' });
  let loaded = false;
  const details = el('details', { class: 'howbuilt' }, el('summary', { text: c.showConfigTitle }), el('p', { class: 'note', text: c.showConfigNote }), pre);
  details.addEventListener('toggle', async () => {
    if (!details.open || loaded) return;
    loaded = true;
    pre.textContent = c.showConfigLoading;
    try {
      const res = await fetch('/config-source.txt');
      if (!res.ok) throw new Error('missing');
      pre.textContent = await res.text();
    } catch {
      loaded = false;
      pre.textContent = c.showConfigError;
    }
  });
  return details;
}

function field(id, label, input, errKey) {
  const err = state.errors[errKey] ? t().fieldErrors[errKey] : '';
  return el('div', { class: 'gap' },
    el('label', { class: 'field', for: id, text: label }),
    input,
    err ? el('p', { class: 'err', id: `${id}-err`, text: err }) : null);
}

function renderForm(focus) {
  const c = t();
  document.documentElement.lang = lang;
  document.title = `${c.title} · ${cfg.business.name}`;
  const errs = state.errors;
  const hasErrors = Object.keys(errs).length > 0;

  const summary = el('div', { class: 'summary', id: 'summary', role: 'alert', tabindex: '-1' });
  if (state.failure === 'rate') summary.textContent = c.rateLimited;
  else if (state.failure === 'send') summary.append(el('strong', { text: c.errorTitle }), el('br'), c.errorBody, ' ', hasPhone() ? el('a', { class: 'call', href: telHref(cfg.business.phone), text: fill(c.callUs, { phone: cfg.business.phone }) }) : null);
  else if (hasErrors) summary.textContent = c.fixErrors;

  const grid = cfg.days.length && !cfg.timeOptional ? dateTiles() : null;
  const dateErr = errs.date ? c.fieldErrors.date : '';
  const servicesErr = errs.services ? c.fieldErrors.services : '';
  const single = cfg.serviceSelect === 'single';

  const form = el('form', { novalidate: true, onsubmit: submit },
    cfg.demo ? el('p', { class: 'demo', text: c.demoBanner }) : null,
    langButtons(() => renderForm('.langs button[aria-pressed=true]')),
    el('h2', { class: 'form-title', tabindex: '-1', text: cfg.header ? c.formTitle : c.title }),
    summary,

    el('fieldset', { class: servicesErr ? 'bad' : '', 'aria-describedby': servicesErr ? 'services-err' : false },
      el('legend', { class: 'step', text: c.stepWhat }),
      el('p', { class: 'note', text: single ? c.whatHintSingle : c.whatHint }),
      el('div', { class: 'tiles services' }, cfg.services.map((s) =>
        tile(single ? 'radio' : 'checkbox', 'services', s.id, state.services.has(s.id), [
          s.icon && ICONS[s.icon] ? el('span', { class: 'ico', 'aria-hidden': 'true' }, svgIcon(s.icon)) : null,
          el('span', { class: 'tlabel', text: s.label[lang] }),
        ], (e) => {
          if (single) state.services.clear();
          e.target.checked ? state.services.add(s.id) : state.services.delete(s.id);
          const lab = document.getElementById('note-label');
          if (lab) lab.textContent = noteLabelText();
        }))),
      servicesErr ? el('p', { class: 'err', id: 'services-err', text: servicesErr }) : null),

    el('fieldset', { class: 'section' },
      el('legend', { class: 'step', text: c.stepWhen }),
      cfg.timeOptional
        ? el('p', { class: 'note', text: cfg.hoursNote[lang] })
        : cfg.days.length === 0
        ? el('p', { class: 'note', text: c.noTimes })
        : [
            el('p', { class: 'note', text: c.preferredNote }),
            cfg.hoursNote ? el('p', { class: 'note hours-sample', text: cfg.hoursNote[lang] }) : null,
            el('fieldset', { class: dateErr ? 'bad' : '', 'aria-describedby': dateErr ? 'date-err' : false },
              el('legend', { text: c.dateLabel }),
              el('div', { class: 'tiles dates' }, grid.cells),
              dateKey(grid.kinds),
              dateErr ? el('p', { class: 'err', id: 'date-err', text: dateErr }) : null),
            timesFieldset(),
          ]),

    el('fieldset', { class: 'section' },
      el('legend', { class: 'step', text: c.stepDetails }),
      field('name', c.nameLabel, el('input', { id: 'name', type: 'text', name: 'name', autocomplete: 'name', maxlength: '100', value: state.name, 'aria-invalid': errs.name ? 'true' : false, 'aria-describedby': errs.name ? 'name-err' : false, oninput: (e) => { state.name = e.target.value; } }), 'name'),
      field('phone', c.phoneLabel, el('input', { id: 'phone', type: 'tel', name: 'phone', autocomplete: 'tel', inputmode: 'tel', maxlength: '30', value: state.phone, 'aria-invalid': errs.phone ? 'true' : false, 'aria-describedby': errs.phone ? 'phone-err' : false, oninput: (e) => { state.phone = e.target.value; } }), 'phone'),
      el('div', { class: 'gap' },
        el('label', { class: 'field', id: 'note-label', for: 'note', text: noteLabelText() }),
        el('textarea', { id: 'note', name: 'note', rows: '3', maxlength: '300', oninput: (e) => { state.note = e.target.value; } }, state.note)),
      el('label', { class: 'check gap' },
        el('input', { type: 'checkbox', name: 'consent', checked: state.consent, onchange: (e) => { state.consent = e.target.checked; } }),
        el('span', { text: c.consent })),
      // Honeypot: invisible to people, tempting to bots.
      el('div', { class: 'hp', 'aria-hidden': 'true' }, el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' }))),

    el('p', { class: 'privacy', text: c.privacy }),
    el('button', { class: 'submit', type: 'submit', disabled: state.sending, 'aria-busy': String(state.sending), text: state.sending ? c.sending : c.submit }),
    cfg.showCredit ? el('p', { class: 'credit' }, el('a', { href: cfg.creditUrl, rel: 'noopener', target: '_blank', text: c.credit })) : null,
    configViewer());

  mount(form, focus);
}

function ticketRow(label, value) {
  return el('div', { class: 'row' }, el('dt', { text: label }), el('dd', {}, value));
}

function renderTicket() {
  const c = t();
  const tk = state.ticket;
  document.documentElement.lang = lang;
  const services = cfg.services.filter((s) => tk.services.includes(s.id)).map((s) => s.label[lang]).join(', ');
  mount(el('div', { class: 'ticket' },
    langButtons(() => renderTicket()),
    cfg.demo ? el('p', { class: 'demo', text: c.demoBanner }) : null,
    el('p', { class: 'label', text: cfg.business.name }),
    el('h2', { class: 'form-title', text: c.ticketTitle }),
    el('p', { class: 'ref' }, el('span', { class: 'label', text: c.ticketRef }), el('strong', { id: 'ref', tabindex: '-1', text: tk.ref })),
    el('p', { class: 'status', text: c.ticketStatus }),
    cfg.demo ? el('p', { class: 'note', text: c.demoTicket }) : null,
    el('dl', {},
      tk.date ? ticketRow(c.ticketPreferred, fmtLong(tk.date, tk.time)) : null,
      ticketRow(c.ticketServices, services),
      ticketRow(c.ticketYou, `${tk.name} · ${tk.phone}`),
      tk.note ? ticketRow(c.ticketNote, tk.note) : null,
      ticketRow(c.ticketTextOk, tk.consent ? c.yes : c.no),
      cfg.business.address ? ticketRow(c.ticketAddress, el('a', { href: mapsHref(cfg.business.address), rel: 'noopener', target: '_blank', text: cfg.business.address })) : null),
    el('p', { class: 'follow', text: [c.responseWindow, c.followUp].filter(Boolean).join(' ') }),
    hasPhone() ? el('a', { class: 'submit callbtn', href: telHref(cfg.business.phone), text: fill(c.ticketCall, { phone: cfg.business.phone }) }) : null,
    el('p', { class: 'note', text: c.ticketKeep }),
    el('button', { class: 'again', type: 'button', text: c.again, onclick: () => { const keep = state; state = newState(); state.name = keep.name; state.phone = keep.phone; renderForm('.form-title'); } })), '#ref', 'is-ticket');
}

// Same alphabet as src/reference.js.
function demoReference() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  while (out.length < 5) for (const b of crypto.getRandomValues(new Uint8Array(8))) if (b < 248 && out.length < 5) out += alphabet[b % 31];
  return `PS-${out}`;
}

async function submit(e) {
  e.preventDefault();
  if (state.sending) return;
  const errors = {};
  if (!state.services.size) errors.services = true;
  if (!cfg.timeOptional) {
    if (!state.date) errors.date = true;
    else if (!state.time) errors.time = true;
  }
  if (!state.name.trim()) errors.name = true;
  if (!/^[+()\d\s.-]{7,30}$/.test(state.phone.trim()) || state.phone.replace(/\D/g, '').length < 7) errors.phone = true;
  state.errors = errors;
  state.failure = '';
  if (Object.keys(errors).length) return renderForm('#summary');

  const snapshot = { name: state.name.trim(), phone: state.phone.trim(), services: [...state.services], date: state.date, time: state.time, note: state.note.trim(), consent: state.consent };
  // Demo mode: local confirmation only, no network.
  if (cfg.demo) {
    state.ticket = { ...snapshot, ref: demoReference() };
    return renderTicket();
  }

  state.sending = true;
  renderForm();
  const website = root.querySelector('input[name=website]')?.value ?? '';
  let result;
  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attemptId: state.attemptId, ...snapshot, language: lang, website }),
    });
    result = { status: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    result = { status: 0, body: {} };
  }
  state.sending = false;

  if (result.status === 200 && result.body.ok && result.body.ref) {
    state.ticket = { ...snapshot, ref: result.body.ref };
    return renderTicket();
  }
  if (result.status === 400 && result.body.error === 'invalid') {
    state.errors = { ...(result.body.fields ?? {}) };
    delete state.errors.attemptId;
    delete state.errors.note;
  } else {
    state.failure = result.status === 429 ? 'rate' : 'send';
  }
  renderForm('#summary');
}

try {
  cfg = await (await fetch('/api/config')).json();
  const wanted = params.get('lang') || navigator.language?.slice(0, 2);
  lang = cfg.languages.includes(wanted) ? wanted : cfg.defaultLanguage;
  applyTheme(cfg.theme);
  if (cfg.layout === 'compact') document.documentElement.classList.add('compact');
  state = newState();
  renderForm();
} catch {
  // No config loaded yet, so there is no dictionary: show both languages.
  root.replaceChildren(el('p', { text: 'Could not load the page. Please call the business directly. / No se pudo cargar la página. Llama directamente al negocio.' }));
}
