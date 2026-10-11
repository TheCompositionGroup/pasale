const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toMinutes(hhmm) {
  const m = HHMM.exec(hhmm);
  if (!m) throw new Error(`Invalid time "${hhmm}", expected HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

const pad = (n) => String(n).padStart(2, '0');

// Wall-clock fields for `date` in the business time zone.
function wallClock(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute };
}

const isBlackedOut = (iso, list) => list.some((b) => (typeof b === 'string' ? b === iso : iso >= b.from && iso <= b.to));

const iso = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// Every calendar day from today (business time zone) for daysAhead days, with:
//   closed: the config says the business is closed (weekly closed day or blackout date)
//   slots:  preferred times still available (empty when closed, or when open but none are left)
// Compares wall-clock times, so a DST change inside the notice window can shift the cutoff
// by an hour, which is fine for "preferred" times.
function scanDays({ timezone, hours, slotMinutes, minNoticeHours, daysAhead, blackoutDates = [] }, now) {
  const w = wallClock(now, timezone);
  const earliest = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm) + minNoticeHours * 3600000;
  const days = [];
  for (let i = 0; i < daysAhead; i++) {
    const dayMs = Date.UTC(w.y, w.m - 1, w.d + i);
    const date = iso(dayMs);
    const range = hours[DAY_KEYS[new Date(dayMs).getUTCDay()]];
    if (isBlackedOut(date, blackoutDates) || !range) {
      days.push({ date, closed: true, slots: [] });
      continue;
    }
    const open = toMinutes(range[0]);
    const close = toMinutes(range[1]);
    const slots = [];
    for (let t = open; t + slotMinutes <= close; t += slotMinutes) {
      if (dayMs + t * 60000 >= earliest) slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
    }
    days.push({ date, closed: false, slots });
  }
  return days;
}

// Days with at least one preferred time that can be asked for. Pure function of the schedule and `now`.
export function computeDays(scheduling, now = new Date()) {
  return scanDays(scheduling, now).filter((d) => d.slots.length).map(({ date, slots }) => ({ date, slots }));
}

// What the date picker draws, in business time zone: the first and last day, plus the open days
// that have no times left. Days not listed and without times are closed by config.
// The grid starts at the first selectable day: leading days with nothing to pick (closed, or open
// but no times left, such as today after closing) are dropped. Closed and no-times days that fall
// after the first selectable day stay, drawn as disabled tiles.
export function calendarRange(scheduling, now = new Date()) {
  const all = scanDays(scheduling, now);
  let start = 0;
  while (start < all.length && all[start].slots.length === 0) start += 1;
  const shown = start < all.length ? all.slice(start) : all; // nothing selectable at all: keep the window as is
  return {
    from: shown[0].date,
    to: shown[shown.length - 1].date,
    noTimes: shown.filter((d) => !d.closed && d.slots.length === 0).map((d) => d.date),
  };
}
