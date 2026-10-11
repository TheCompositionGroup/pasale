import test from 'node:test';
import assert from 'node:assert/strict';
import { startInbox, startApp, goodBody, testConfig } from './helpers.js';

test('rate limit stops a flood and delivers nothing beyond the limit', async () => {
  const inbox = await startInbox();
  const app = await startApp({ inbox, config: testConfig({ security: { rateLimit: { max: 3, windowMinutes: 10 }, trustProxy: false } }) });
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await app.post(goodBody())).status);
  assert.deepEqual(statuses, [200, 200, 200, 429, 429, 429]);
  assert.equal(inbox.received.length, 3);
  await app.close(); await inbox.close();
});

test('proxy header is ignored unless trustProxy is on', async () => {
  const inbox = await startInbox();
  const app = await startApp({ inbox, config: testConfig({ security: { rateLimit: { max: 1, windowMinutes: 10 }, trustProxy: false } }) });
  await app.post(goodBody(), { 'x-forwarded-for': '1.1.1.1' });
  assert.equal((await app.post(goodBody(), { 'x-forwarded-for': '2.2.2.2' })).status, 429);
  await app.close(); await inbox.close();
});

test('logs never contain names, phone numbers, notes or IPs', async () => {
  const inbox = await startInbox();
  const app = await startApp({ inbox });
  await app.post(goodBody({ name: 'Zelda Secretname', phone: '555-987-6543', note: 'private-note-xyz' }));
  await app.post(goodBody({ name: '' }));
  const dump = JSON.stringify(app.logs);
  assert.ok(app.logs.length >= 2);
  for (const s of ['Zelda', '987-6543', 'private-note', '127.0.0.1']) assert.ok(!dump.includes(s), `log leaked ${s}`);
  await app.close(); await inbox.close();
});

test('public config never exposes the owner email, API keys or webhook URL', async () => {
  const app = await startApp({ env: { RESEND_API_KEY: 'sekrit-key' } });
  const raw = JSON.stringify(await app.config());
  for (const s of ['owner@example.com', 'sekrit-key', '127.0.0.1:1']) assert.ok(!raw.includes(s), `exposed ${s}`);
  await app.close();
});

test('security headers are set and only whitelisted files are served', async () => {
  const app = await startApp({});
  const res = await fetch(`${app.base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  for (const p of ['/server.js', '/package.json', '/_headers', '/..%2fpackage.json', '/config/pasale.config.js']) assert.equal((await fetch(`${app.base}${p}`)).status, 404, p);
  await app.close();
});
