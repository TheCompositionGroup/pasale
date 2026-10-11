// Runs the Worker exactly as the platform would call it: worker.fetch(request, env).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startInbox } from './helpers.js';

const inbox = await startInbox();
const env = { RESEND_API_KEY: 'cf-key', RESEND_API_URL: inbox.url };
const { default: worker } = await import('../adapters/worker.js');
test.after(() => inbox.close());

const call = (path, init = {}, ip = '203.0.113.7') =>
  worker.fetch(new Request(`https://pasale.example${path}`, { ...init, headers: { 'cf-connecting-ip': ip, ...(init.headers ?? {}) } }), env);

test('GET /api/config works and does not leak secrets', async () => {
  const res = await call('/api/config');
  assert.equal(res.status, 200);
  const raw = JSON.stringify(await res.json());
  assert.ok(!raw.includes('cf-key') && !raw.includes('owner@example.com'));
});

test('POST /api/book delivers by email and returns a matching reference', async () => {
  const cfg = await (await call('/api/config')).json();
  const day = cfg.days[0];
  const res = await call('/api/book', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attemptId: 'cf-attempt-0000000001', name: 'Cloud Test', phone: '555 010 1234', services: [cfg.services[0].id], date: day.date, time: day.slots[0], consent: true, language: 'en' }),
  });
  assert.equal(res.status, 200);
  const { ref } = await res.json();
  assert.match(ref, /^PS-[A-HJ-KM-NP-Z2-9]{5}$/);
  assert.equal(inbox.requests.length, 1);
  assert.equal(inbox.requests[0].headers.authorization, 'Bearer cf-key');
  assert.ok(inbox.requests[0].body.subject.includes(ref));
});

test('the visitor address comes from cf-connecting-ip for rate limiting', async () => {
  const cfg = await (await call('/api/config')).json();
  const body = (n) => JSON.stringify({ attemptId: `cf-attempt-rate-${n}-0000`, name: 'R', phone: '5550101234', services: [cfg.services[0].id], date: cfg.days[0].date, time: cfg.days[0].slots[0], language: 'en' });
  const post = (n, ip) => call('/api/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body(n) }, ip);
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await post(i, '198.51.100.9')).status);
  assert.deepEqual(statuses.slice(-2), [429, 429]);
  assert.equal((await post(99, '198.51.100.10')).status, 200); // a different visitor is unaffected
});

test('GET /sign works and unknown API paths 404', async () => {
  const sign = await call('/sign');
  assert.equal(sign.status, 200);
  assert.match(await sign.text(), /COME BY\./);
  assert.equal((await call('/api/nope')).status, 404);
});
