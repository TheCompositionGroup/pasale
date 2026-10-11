import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReference } from '../src/reference.js';

test('reference looks like PS-7K42M and avoids ambiguous characters', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const ref = makeReference();
    assert.match(ref, /^PS-[A-HJ-KM-NP-Z2-9]{5}$/);
    for (const ch of ref.slice(3)) seen.add(ch);
  }
  for (const bad of ['0', 'O', '1', 'I', 'L']) assert.ok(!seen.has(bad), `ambiguous ${bad}`);
  assert.equal(seen.size, 31, 'every allowed character is used');
});
