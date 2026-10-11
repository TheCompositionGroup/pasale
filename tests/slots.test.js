import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDays } from '../src/slots.js';
import { NOW, testConfig } from './helpers.js';

const cfg = testConfig();
const byDate = Object.fromEntries(computeDays(cfg, NOW).map((d) => [d.date, d.slots]));

test('minimum notice removes today and early slots tomorrow', () => {
  assert.equal(byDate['2030-03-04'], undefined);
  assert.deepEqual(byDate['2030-03-05'].slice(0, 2), ['10:00', '11:00']); // now 10:00 + 24h
});

test('past slots for today are hidden when notice is 0', () => {
  const d = computeDays({ ...cfg, minNoticeHours: 0 }, NOW)[0];
  assert.equal(d.date, '2030-03-04');
  assert.deepEqual(d.slots.slice(0, 1), ['10:00']); // 09:00 already passed
});

test('blackout dates and closed days are skipped', () => {
  assert.equal(byDate['2030-03-06'], undefined);
  assert.equal(byDate['2030-03-10'], undefined);
});

test('slots end before closing; Saturday uses its own hours', () => {
  assert.equal(byDate['2030-03-05'].at(-1), '16:00');
  assert.deepEqual(byDate['2030-03-09'], ['10:00', '11:00', '12:00', '13:00']);
});

test('blackout ranges work and daysAhead is respected', () => {
  const out = computeDays({ ...cfg, blackoutDates: [{ from: '2030-03-11', to: '2030-03-13' }] }, NOW).map((d) => d.date);
  assert.ok(!out.includes('2030-03-12'));
  assert.ok(out.every((d) => d <= '2030-03-17'));
});

test('uses the business time zone, not the server zone', () => {
  // 03:30Z on Mar 5 is still 22:30 on Mar 4 in New York; notice runs to 22:30 on Mar 5.
  // Mar 5 has nothing left, Mar 6 is blacked out, so the first day is Mar 7.
  assert.equal(computeDays(cfg, new Date('2030-03-05T03:30:00Z'))[0].date, '2030-03-07');
});

test('the same instant is a different local time in different zones', () => {
  const at = new Date('2030-03-05T03:30:00Z');
  const ny = computeDays({ ...cfg, minNoticeHours: 0 }, at)[0]; // Mar 4 22:30 in New York: shop closed, first open is Mar 5
  const tokyo = computeDays({ ...cfg, timezone: 'Asia/Tokyo', minNoticeHours: 0 }, at)[0]; // Mar 5 12:30 in Tokyo
  assert.deepEqual([ny.date, ny.slots[0]], ['2030-03-05', '09:00']);
  assert.deepEqual([tokyo.date, tokyo.slots[0]], ['2030-03-05', '13:00']);
});

test('calendarRange: the grid starts at the first selectable day, so today is hidden once it is over', async () => {
  const { calendarRange } = await import('../src/slots.js');
  // Mon Mar 4, 10:00 in New York with 24h notice: today has hours but no times left -> hidden. Tue is the first day shown.
  assert.deepEqual(calendarRange(cfg, NOW), { from: '2030-03-05', to: '2030-03-17', noTimes: [] });
  // With no notice period, today still has times, so it stays.
  assert.equal(calendarRange({ ...cfg, minNoticeHours: 0 }, NOW).from, '2030-03-04');
  // 03:30Z on Mar 5 is still Mar 4 in New York (after 22:00): today is over, Mar 5 is inside the 24h notice, and Mar 6 is a blackout date. First selectable day: Mar 7.
  assert.equal(calendarRange(cfg, new Date('2030-03-05T03:30:00Z')).from, '2030-03-07');
  assert.deepEqual(calendarRange({ ...cfg, timezone: 'Asia/Tokyo', minNoticeHours: 0 }, new Date('2030-03-05T03:30:00Z')).from, '2030-03-05');
});

test('calendarRange: later closed days stay, and only open-but-empty days are "no times left"', async () => {
  const { calendarRange, computeDays } = await import('../src/slots.js');
  // Saturdays are open 10:00-10:30, shorter than a 60 minute slot: open per config, but never any time to pick.
  const short = { ...cfg, minNoticeHours: 0, blackoutDates: ['2030-03-06'], hours: { ...cfg.hours, sat: ['10:00', '10:30'] } };
  const cal = calendarRange(short, NOW);
  assert.deepEqual(cal.noTimes, ['2030-03-09', '2030-03-16']); // the two Saturdays
  assert.ok(!cal.noTimes.includes('2030-03-06'), 'a blackout date is closed, not "no times left"');
  assert.ok(!cal.noTimes.includes('2030-03-10'), 'a weekly closed day (Sunday) is closed, not "no times left"');
  const selectable = computeDays(short, NOW).map((d) => d.date);
  for (const d of [...cal.noTimes, '2030-03-06', '2030-03-10']) assert.ok(!selectable.includes(d), `${d} is not selectable`);
  assert.equal(cal.from, '2030-03-04'); // first selectable day
  assert.equal(cal.to, '2030-03-17'); // last day of the window, even though it is a closed Sunday
});

test('calendarRange: every leading unselectable day is dropped, closed or not; later ones stay in the window', async () => {
  const { calendarRange, computeDays } = await import('../src/slots.js');
  const noBlackout = { ...cfg, blackoutDates: [] };
  // 60h notice from Mon 10:00: earliest is Wed 22:00, so Mon, Tue, Wed are open-but-empty and dropped. Thu is first.
  assert.equal(calendarRange({ ...noBlackout, minNoticeHours: 60 }, NOW).from, '2030-03-07');
  // 36h notice: earliest is Tue 22:00, so Mon and Tue are dropped and Wed is first.
  assert.equal(calendarRange({ ...noBlackout, minNoticeHours: 36 }, NOW).from, '2030-03-06');
  // A blackout date inside the leading run is closed, and it is dropped too: Mon, Tue, Wed(blackout) -> Thu.
  assert.equal(calendarRange({ ...cfg, minNoticeHours: 60 }, NOW).from, '2030-03-07');
  // Today is a closed Sunday: hidden, the grid starts Monday.
  const sunday = new Date('2030-03-10T15:00:00Z');
  assert.equal(calendarRange(noBlackout, sunday).from, '2030-03-11');
  // Saturday afternoon (today over) followed by a closed Sunday: both dropped, Monday is first.
  const satPm = new Date('2030-03-09T21:00:00Z'); // Sat 16:00 EST, shop closes 14:00
  const cal = calendarRange({ ...noBlackout, minNoticeHours: 0 }, satPm);
  assert.equal(cal.from, '2030-03-11');
  assert.equal(cal.from, computeDays({ ...noBlackout, minNoticeHours: 0 }, satPm)[0].date, 'first shown day is the first selectable day');
  // Closed days AFTER the first selectable day stay in the window: from a Sunday start the window ends on Sunday Mar 23 (closed).
  assert.equal(calendarRange(noBlackout, sunday).to, '2030-03-23');
  assert.equal(cal.to, '2030-03-22');
});

test('calendarRange: the first shown day is always selectable (unless nothing is)', async () => {
  const { calendarRange, computeDays } = await import('../src/slots.js');
  for (const hours of [0, 1, 5, 24, 48, 100]) {
    for (const at of ['2030-03-04T15:00:00Z', '2030-03-09T21:00:00Z', '2030-03-10T15:00:00Z', '2030-03-05T03:30:00Z']) {
      const c = { ...cfg, minNoticeHours: hours };
      assert.equal(calendarRange(c, new Date(at)).from, computeDays(c, new Date(at))[0].date, `${hours}h at ${at}`);
    }
  }
});

test('calendarRange: if nothing is selectable at all, the window is left as is', async () => {
  const { calendarRange, computeDays } = await import('../src/slots.js');
  const allShort = { ...cfg, blackoutDates: [], minNoticeHours: 0, hours: Object.fromEntries(Object.keys(cfg.hours).map((k) => [k, ['10:00', '10:30']])) };
  assert.equal(computeDays(allShort, NOW).length, 0);
  const cal = calendarRange(allShort, NOW);
  assert.deepEqual([cal.from, cal.to], ['2030-03-04', '2030-03-17']);
});
