import test from 'node:test';
import assert from 'node:assert/strict';
import { startInbox, startApp, goodBody, testConfig } from './helpers.js';

const REF = /^PS-[A-HJ-KM-NP-Z2-9]{5}$/;
const resendConfig = () => testConfig({ delivery: { type: 'resend', from: 'Pásale <noreply@example.com>' } });
const resendEnv = (inbox) => ({ RESEND_API_KEY: 'test-key', RESEND_API_URL: inbox.url });

test('webhook: request reaches the inbox and the customer gets the same reference', async () => {
  const inbox = await startInbox();
  const app = await startApp({ inbox });
  const res = await app.post(goodBody({ note: 'Side door please' }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.match(json.ref, REF);
  const m = inbox.received[0];
  assert.equal(m.ref, json.ref);
  assert.equal(m.name, 'Ana Pérez');
  assert.equal(m.phone, '(555) 123-4567');
  assert.deepEqual(m.preferred, { date: '2030-03-05', time: '11:00', timeZone: 'America/New_York' });
  assert.equal(m.note, 'Side door please');
  assert.equal(m.consentToText, true);
  assert.equal(m.language, 'es');
  assert.match(m.text, /preferred time only/i);
  await app.close(); await inbox.close();
});

test('email: owner gets the matching reference, details, tap-to-call and prefilled tap-to-text', async () => {
  const inbox = await startInbox();
  const app = await startApp({ config: resendConfig(), env: resendEnv(inbox) });
  const json = await (await app.post(goodBody({ services: ['browse', 'advice'] }))).json();
  assert.equal(inbox.requests.length, 1);
  const { headers, body } = inbox.requests[0];
  assert.equal(headers.authorization, 'Bearer test-key');
  assert.deepEqual(body.to, ['owner@example.com']);
  assert.ok(body.subject.includes(json.ref));
  assert.ok(body.text.includes(json.ref) && body.html.includes(json.ref));
  assert.ok(body.text.includes('Look around, Talk to someone'));
  assert.ok(body.html.includes('href="tel:+15551234567"'));
  // Customer chose Spanish: the prefilled confirmation is in Spanish, with the reference.
  const sms = /href="(sms:[^"]+)"/.exec(body.html)[1];
  const decoded = decodeURIComponent(sms.split('body=')[1]);
  assert.match(decoded, /^Hola Ana Pérez, te escribe Test Shop\./);
  assert.ok(decoded.includes(json.ref));
  await app.close(); await inbox.close();
});

test('email: English customers get an English prefilled text', async () => {
  const inbox = await startInbox();
  const app = await startApp({ config: resendConfig(), env: resendEnv(inbox) });
  await app.post(goodBody({ language: 'en' }));
  const sms = /href="(sms:[^"]+)"/.exec(inbox.requests[0].body.html)[1];
  assert.match(decodeURIComponent(sms.split('body=')[1]), /^Hi Ana Pérez, this is Test Shop\./);
  await app.close(); await inbox.close();
});

test('email: no text link when the customer did not agree to texts', async () => {
  const inbox = await startInbox();
  const app = await startApp({ config: resendConfig(), env: resendEnv(inbox) });
  await app.post(goodBody({ consent: false }));
  const { html, text } = inbox.requests[0].body;
  assert.ok(!html.includes('sms:') && !text.includes('sms:'));
  assert.match(text, /OK to text: NO/);
  assert.ok(html.includes('tel:'));
  await app.close(); await inbox.close();
});

test('email: customer text is HTML-escaped', async () => {
  const inbox = await startInbox();
  const app = await startApp({ config: resendConfig(), env: resendEnv(inbox) });
  await app.post(goodBody({ name: '<img src=x onerror=alert(1)>', note: '"><script>alert(2)</script>' }));
  const { html } = inbox.requests[0].body;
  assert.ok(!html.includes('<img') && !html.includes('<script'));
  assert.ok(html.includes('&lt;img') && html.includes('&lt;script&gt;'));
  await app.close(); await inbox.close();
});

for (const mode of ['fail', 401, 422, 429]) {
  test(`email: provider answering ${mode} means no ticket, only an error`, async () => {
    const inbox = await startInbox(mode);
    const app = await startApp({ config: resendConfig(), env: resendEnv(inbox) });
    const res = await app.post(goodBody());
    assert.equal(res.status, 502);
    const json = await res.json();
    assert.deepEqual(json, { ok: false, error: 'delivery_failed' });
    assert.ok(!('ref' in json));
    await app.close(); await inbox.close();
  });
}

test('unreachable provider is also an error, never a ticket', async () => {
  const app = await startApp({ config: resendConfig(), env: { RESEND_API_KEY: 'k', RESEND_API_URL: 'http://127.0.0.1:1/x' } });
  const res = await app.post(goodBody());
  assert.equal(res.status, 502);
  assert.equal((await res.json()).ok, false);
  await app.close();
});

test('a failed attempt can be retried with the same attempt id once delivery recovers', async () => {
  const inbox = await startInbox('fail');
  const app = await startApp({ inbox });
  const body = goodBody();
  assert.equal((await app.post(body)).status, 502);
  inbox.mode = 'ok';
  const retry = await app.post(body);
  assert.equal(retry.status, 200);
  assert.match((await retry.json()).ref, REF);
  await app.close(); await inbox.close();
});

test('double submit delivers once and both answers carry the same reference', async () => {
  const inbox = await startInbox();
  const app = await startApp({ inbox });
  const a = goodBody();
  const [r1, r2] = await Promise.all([app.post(a), app.post(a)]);
  const [j1, j2] = [await r1.json(), await r2.json()];
  assert.deepEqual([r1.status, r2.status], [200, 200]);
  assert.equal(j1.ref, j2.ref);
  const j3 = await (await app.post(a)).json();
  assert.equal(j3.ref, j1.ref);
  assert.equal(inbox.received.length, 1);
  await app.close(); await inbox.close();
});

test('demo mode (config flag or DEMO_MODE=true) shows a ticket and sends nothing', async () => {
  const inbox = await startInbox();
  const byConfig = await startApp({ inbox, config: testConfig({ demo: true }) });
  const byEnv = await startApp({ inbox, env: { DEMO_MODE: 'true' } });
  for (const app of [byConfig, byEnv]) {
    const json = await (await app.post(goodBody())).json();
    assert.equal(json.demo, true);
    assert.match(json.ref, REF);
    assert.equal((await app.config()).demo, true);
    await app.close();
  }
  assert.equal(inbox.received.length, 0);
  await inbox.close();
});
