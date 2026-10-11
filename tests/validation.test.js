import test from 'node:test';
import assert from 'node:assert/strict';
import { startInbox, startApp, goodBody } from './helpers.js';

let inbox; let app;
test.before(async () => { inbox = await startInbox(); app = await startApp({ inbox }); });
test.after(async () => { await app.close(); await inbox.close(); });

const bad = {
  'empty name': { name: '  ' },
  'name with control characters': { name: 'Ana\r\nBcc: x@evil.test' },
  'overlong name': { name: 'x'.repeat(101) },
  'no services': { services: [] },
  'services not a list': { services: 'browse' },
  'unknown service': { services: ['browse', 'hack'] },
  'short phone': { phone: '123' },
  'letters in phone': { phone: 'call me maybe' },
  'overlong phone': { phone: '1'.repeat(31) },
  'blackout date': { date: '2030-03-06' },
  'closed day': { date: '2030-03-10', time: '11:00' },
  'inside notice period': { date: '2030-03-05', time: '09:00' },
  'time outside hours': { time: '23:00' },
  'past date': { date: '2030-03-01' },
  'overlong note': { note: 'x'.repeat(301) },
  'note with control characters': { note: 'hi\u0007there' },
  'missing attempt id': { attemptId: undefined },
};

for (const [label, over] of Object.entries(bad)) {
  test(`rejects ${label}`, async () => {
    const before = inbox.received.length;
    const res = await app.post(goodBody(over));
    assert.equal(res.status, 400, label);
    assert.equal((await res.json()).error, 'invalid');
    assert.equal(inbox.received.length, before, 'nothing may be delivered');
  });
}

test('field errors are reported per field', async () => {
  const json = await (await app.post(goodBody({ name: '', phone: '1', services: [] }))).json();
  assert.deepEqual(Object.keys(json.fields).sort(), ['name', 'phone', 'services']);
});

test('malformed JSON, wrong content type and oversized bodies are refused', async () => {
  assert.equal((await app.post('{nope')).status, 400);
  assert.equal((await app.post('{}', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await app.post(JSON.stringify({ name: 'x'.repeat(20000) }))).status, 413);
});

test('honeypot field rejects bots without delivering', async () => {
  const before = inbox.received.length;
  assert.equal((await app.post(goodBody({ website: 'http://spam.test' }))).status, 400);
  assert.equal(inbox.received.length, before);
});

test('several services, note and unicode names are accepted; consent defaults to false', async () => {
  const res = await app.post(goodBody({ services: ['browse', 'pickup', 'browse'], note: 'Ring twice', name: 'José Núñez', consent: undefined }));
  assert.equal(res.status, 200);
  const m = inbox.received.at(-1);
  assert.equal(m.name, 'José Núñez');
  assert.deepEqual(m.services.map((s) => s.id), ['browse', 'pickup']);
  assert.equal(m.consentToText, false);
});

test('both languages deliver and ship complete copy, labels and headings', async () => {
  for (const language of ['en', 'es']) {
    assert.equal((await app.post(goodBody({ language }))).status, 200);
    assert.equal(inbox.received.at(-1).language, language);
  }
  const cfg = await app.config();
  assert.equal(cfg.copy.en.stepWhat, '01 / What');
  assert.equal(cfg.copy.en.stepWhen, '02 / When');
  assert.equal(cfg.copy.en.stepDetails, '03 / Your details');
  assert.equal(cfg.copy.es.stepWhat, '01 / Qué');
  assert.equal(cfg.copy.en.submit, 'Request a time');
  assert.equal(cfg.copy.es.submit, 'Pide tu cita');
  assert.match(cfg.copy.en.ticketStatus, /Not confirmed yet/);
  assert.match(cfg.copy.es.ticketStatus, /Aún no confirmada/);
  for (const l of ['en', 'es']) assert.ok(cfg.services.every((s) => s.label[l]));
});

test('public config carries what the business panel needs, in both languages', async () => {
  const cfg = await app.config();
  assert.equal(cfg.business.phone, '(555) 010-0000');
  assert.ok(cfg.business.address);
  assert.equal(cfg.hours.sun, null);
  assert.deepEqual(cfg.calendar, { from: '2030-03-05', to: '2030-03-17', noTimes: [] }); // today (no times left) is hidden; closed days inside the range are drawn
  assert.ok(!cfg.days.some((d) => d.date === '2030-03-06' || d.date === '2030-03-10'), 'blackout and Sunday are not selectable');
  assert.deepEqual(cfg.hours.mon, ['09:00', '17:00']);
  for (const l of ['en', 'es']) for (const k of ['labelCall', 'labelAddress', 'labelHours', 'closed', 'dayClosed', 'dayNoTimes', 'pickDayFirst']) assert.ok(cfg.copy[l][k], `${l}.${k}`);
});

test('wording: "closed" only for days the config closes, "No times left" / "Sin horarios" otherwise', async () => {
  const cfg = await app.config();
  assert.equal(cfg.copy.en.dayClosed, 'Closed');
  assert.equal(cfg.copy.en.dayNoTimes, 'No times left');
  assert.equal(cfg.copy.es.dayClosed, 'Cerrado');
  assert.equal(cfg.copy.es.dayNoTimes, 'Sin horarios');
  assert.deepEqual(cfg.calendar.noTimes, []); // the test shop has no open-but-empty day in this window
});
