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

function businessPanel() {
  const c = t();
  const b = cfg.business;
  const hours = el('details', { class: 'hours' }, el('summary', { text: c.labelHours }), el('dl', {}, hoursRows()));
  if (matchMedia('(min-width: 960px)').matches) hours.open = true;
  return el('aside', { class: 'biz-panel' }, el('div', { class: 'biz-inner' },
    el('h1', { class: 'biz-name', text: b.name }),
    el('p', { class: 'intro', text: c.intro }),
    el('a', { class: 'call-card', href: telHref(b.phone) },
      el('span', { class: 'label', text: c.labelCall }), el('strong', { text: b.phone })),
    el('div', { class: 'info' },
      el('span', { class: 'label', text: c.labelAddress }),
      el('a', { href: mapsHref(b.address), rel: 'noopener', target: '_blank', text: b.address })),
    hours));
}

// Both panels on every screen. Desktop: side by side. Phones: stacked.
function mount(content, focus, cls = '') {
  root.replaceChildren(el('div', { class: `layout ${cls}`.trim() }, businessPanel(), el('main', { class: 'form-panel' }, content)));
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
  else if (state.failure === 'send') summary.append(el('strong', { text: c.errorTitle }), el('br'), c.errorBody, ' ', el('a', { class: 'call', href: telHref(cfg.business.phone), text: fill(c.callUs, { phone: cfg.business.phone }) }));
  else if (hasErrors) summary.textContent = c.fixErrors;

  const grid = cfg.days.length ? dateTiles() : null;
  const dateErr = errs.date ? c.fieldErrors.date : '';
  const servicesErr = errs.services ? c.fieldErrors.services : '';

  const form = el('form', { novalidate: true, onsubmit: submit },
    cfg.demo ? el('p', { class: 'demo', text: c.demoBanner }) : null,
    langButtons(() => renderForm('.langs button[aria-pressed=true]')),
    el('h2', { class: 'form-title', tabindex: '-1', text: c.title }),
    summary,

    el('fieldset', { class: servicesErr ? 'bad' : '', 'aria-describedby': servicesErr ? 'services-err' : false },
      el('legend', { class: 'step', text: c.stepWhat }),
      el('p', { class: 'note', text: c.whatHint }),
      el('div', { class: 'tiles services' }, cfg.services.map((s) =>
        tile('checkbox', 'services', s.id, state.services.has(s.id), [
          s.icon && ICONS[s.icon] ? el('span', { class: 'ico', 'aria-hidden': 'true' }, svgIcon(s.icon)) : null,
          el('span', { class: 'tlabel', text: s.label[lang] }),
        ], (e) => { e.target.checked ? state.services.add(s.id) : state.services.delete(s.id); }))),
      servicesErr ? el('p', { class: 'err', id: 'services-err', text: servicesErr }) : null),

    el('fieldset', { class: 'section' },
      el('legend', { class: 'step', text: c.stepWhen }),
      cfg.days.length === 0
        ? el('p', { class: 'note', text: c.noTimes })
        : [
            el('p', { class: 'note', text: c.preferredNote }),
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
        el('label', { class: 'field', for: 'note', text: c.noteLabel }),
        el('textarea', { id: 'note', name: 'note', rows: '3', maxlength: '300', oninput: (e) => { state.note = e.target.value; } }, state.note)),
      el('label', { class: 'check gap' },
        el('input', { type: 'checkbox', name: 'consent', checked: state.consent, onchange: (e) => { state.consent = e.target.checked; } }),
        el('span', { text: c.consent })),
      // Honeypot: invisible to people, tempting to bots.
      el('div', { class: 'hp', 'aria-hidden': 'true' }, el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' }))),

    el('p', { class: 'privacy', text: c.privacy }),
    el('button', { class: 'submit', type: 'submit', disabled: state.sending, 'aria-busy': String(state.sending), text: state.sending ? c.sending : c.submit }),
    cfg.showCredit ? el('p', { class: 'credit' }, el('a', { href: cfg.creditUrl, rel: 'noopener', target: '_blank', text: c.credit })) : null);

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
      ticketRow(c.ticketPreferred, fmtLong(tk.date, tk.time)),
      ticketRow(c.ticketServices, services),
      ticketRow(c.ticketYou, `${tk.name} · ${tk.phone}`),
      tk.note ? ticketRow(lang === 'es' ? 'Nota' : 'Note', tk.note) : null,
      ticketRow(c.ticketTextOk, tk.consent ? c.yes : c.no),
      ticketRow(c.ticketAddress, el('a', { href: mapsHref(cfg.business.address), rel: 'noopener', target: '_blank', text: cfg.business.address }))),
    el('p', { class: 'follow', text: [c.responseWindow, c.followUp].filter(Boolean).join(' ') }),
    el('a', { class: 'submit callbtn', href: telHref(cfg.business.phone), text: fill(c.ticketCall, { phone: cfg.business.phone }) }),
    el('p', { class: 'note', text: c.ticketKeep }),
    el('button', { class: 'again', type: 'button', text: c.again, onclick: () => { const keep = state; state = newState(); state.name = keep.name; state.phone = keep.phone; renderForm('.form-title'); } })), '#ref', 'is-ticket');
}

async function submit(e) {
  e.preventDefault();
  if (state.sending) return;
  const errors = {};
  if (!state.services.size) errors.services = true;
  if (!state.date) errors.date = true;
  else if (!state.time) errors.time = true;
  if (!state.name.trim()) errors.name = true;
  if (!state.phone.trim()) errors.phone = true;
  state.errors = errors;
  state.failure = '';
  if (Object.keys(errors).length) return renderForm('#summary');

  state.sending = true;
  renderForm();
  const website = root.querySelector('input[name=website]')?.value ?? '';
  const snapshot = { name: state.name.trim(), phone: state.phone.trim(), services: [...state.services], date: state.date, time: state.time, note: state.note.trim(), consent: state.consent };
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
  state = newState();
  renderForm();
} catch {
  root.replaceChildren(el('p', { text: 'Could not load the page. Please call the business directly.' }));
}
