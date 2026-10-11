import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolveConfig } from '../src/config.js';
import { computeDays } from '../src/slots.js';

const files = readdirSync('examples').filter((f) => f.endsWith('.config.js'));

test('there are four example configs', () => {
  assert.deepEqual(files.sort(), ['barber.config.js', 'clinic-nonprofit.config.js', 'mobile-mechanic.config.js', 'showroom.config.js']);
});

for (const f of files) {
  test(`example ${f} is valid, has open times, and uses sample data only`, async () => {
    const raw = (await import(`../examples/${f}`)).default;
    const c = resolveConfig(raw, { RESEND_API_KEY: 'k' });
    assert.ok(computeDays(c, new Date()).length > 0);
    assert.match(c.business.phone, /\(555\) 010-01\d\d|\(555\) 010-0000/);
    assert.equal(c.business.ownerEmail, 'owner@example.com');
    assert.match(readFileSync(`examples/${f}`, 'utf8'), /Sample/);
  });
}
