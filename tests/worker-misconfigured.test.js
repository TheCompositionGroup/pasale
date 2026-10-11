import test from 'node:test';
import assert from 'node:assert/strict';

test('missing secrets give a plain error to visitors, never a fake success', async () => {
  const { default: worker } = await import('../adapters/worker.js?misconfigured'); // fresh module state
  const orig = console.error;
  let logged = '';
  console.error = (m) => { logged += m; };
  const res = await worker.fetch(new Request('https://pasale.example/api/config'), {});
  console.error = orig;
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { ok: false, error: 'misconfigured' });
  assert.match(logged, /RESEND_API_KEY is not set/);
});

test('the shipped wrangler vars (DEMO_MODE=true) make the Worker valid with no secrets', async () => {
  const { default: worker } = await import('../adapters/worker.js?demo'); // fresh module state
  const res = await worker.fetch(new Request('https://pasale.example/api/config'), { DEMO_MODE: 'true' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).demo, true);
});
