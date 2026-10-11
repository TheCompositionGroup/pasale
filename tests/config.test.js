import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, ConfigError } from '../src/config.js';
import { testConfig } from './helpers.js';

const webhookEnv = { PASALE_WEBHOOK_URL: 'https://example.com/h' };

test('valid config resolves with merged copy; followUp and responseWindow come from the top level', () => {
  const c = resolveConfig(testConfig({ responseWindow: { en: 'We reply within 1 business day.', es: 'Respondemos en 1 día hábil.' } }), webhookEnv);
  assert.equal(c.resolvedCopy.es.submit, 'Pide tu cita');
  assert.equal(c.resolvedCopy.en.followUp, "Haven't heard back? Call us.");
  assert.equal(c.resolvedCopy.es.followUp, '¿No te han respondido? Llámanos.');
  assert.equal(c.resolvedCopy.en.responseWindow, 'We reply within 1 business day.');
});

test('follow-up text is configurable per language', () => {
  const c = resolveConfig(testConfig({ followUp: { en: 'Still waiting? Text us.', es: '¿Sigues esperando? Escríbenos.' } }), webhookEnv);
  assert.equal(c.resolvedCopy.en.followUp, 'Still waiting? Text us.');
  assert.equal(c.resolvedCopy.es.followUp, '¿Sigues esperando? Escríbenos.');
});

test('misconfiguration fails loudly with every problem listed', () => {
  const bad = testConfig({ delivery: { type: 'resend', from: '' }, defaultLanguage: 'fr', timezone: 'Mars/Base' });
  bad.hours.mon = ['18:00', '09:00'];
  bad.business.ownerEmail = 'nope';
  assert.throws(() => resolveConfig(bad, {}), (e) => {
    assert.ok(e instanceof ConfigError);
    for (const part of ['defaultLanguage', 'timezone', 'opening must be before closing', 'RESEND_API_KEY', 'ownerEmail', 'delivery.from']) assert.match(e.message, new RegExp(part));
    return true;
  });
});

test('a language without full copy is rejected', () => {
  const c = testConfig({ languages: ['en', 'fr'] });
  c.services = c.services.map((s) => ({ ...s, label: { ...s.label, fr: 'x' } }));
  assert.throws(() => resolveConfig(c, webhookEnv), /copy\.fr is missing/);
});

test('demo mode (config or DEMO_MODE=true) needs no delivery credentials', () => {
  assert.doesNotThrow(() => resolveConfig(testConfig({ demo: true, delivery: undefined }), {}));
  assert.equal(resolveConfig(testConfig({ delivery: { type: 'resend', from: 'x' } }), { DEMO_MODE: 'true' }).demo, true);
});

test('publicUrl is required for the sign QR code; credit can be removed', () => {
  const c = testConfig();
  c.business.publicUrl = '';
  assert.throws(() => resolveConfig(c, webhookEnv), /publicUrl/);
  assert.equal(resolveConfig(testConfig({ showCredit: false, creditUrl: '' }), webhookEnv).showCredit, false);
});

test('service icons are chosen by name from the built-in set; emoji and unknown names are rejected', () => {
  const ok = testConfig();
  ok.services[0].icon = 'scissors';
  assert.doesNotThrow(() => resolveConfig(ok, webhookEnv));
  for (const bad of ['🛋️', 'unicorn']) {
    const c = testConfig();
    c.services[0].icon = bad;
    assert.throws(() => resolveConfig(c, webhookEnv), /icon .* is not one of: store, box, chat, scissors, wrench, heart, document, car/);
  }
  const none = testConfig();
  delete none.services[0].icon;
  assert.doesNotThrow(() => resolveConfig(none, webhookEnv)); // icon stays optional
});
