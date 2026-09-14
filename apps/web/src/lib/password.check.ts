/**
 * Self-check for the signup password rules. Run it with:
 *   node --experimental-strip-types src/lib/password.check.ts
 *
 * Covers the parts a silent bug would let a weak password through:
 * the run detector and the HIBP range parser.
 */

import assert from 'node:assert/strict';
import { countInRange, hasRun, unmetRules } from './password.ts';

assert.equal(hasRun('aaa'), true, 'repeated characters');
assert.equal(hasRun('abc'), true, 'ascending run');
assert.equal(hasRun('321'), true, 'descending run');
assert.equal(hasRun('Ab1'), false, 'unrelated characters');
assert.equal(hasRun('P@ssw0rd!x'), false, 'no run');

assert.equal(unmetRules('Korfa-Health-2026!').length, 0, 'a strong password meets every rule');
assert.equal(unmetRules('short').length > 0, true, 'a weak password fails rules');
assert.deepEqual(
  unmetRules('thisisonelowercase').map((r) => r.label.slice(0, 5)),
  ['Upper', 'At le', 'At le'],
  'reports exactly the unmet rules'
);

// "password" → SHA-1 5BAA6..., suffix 1E4C9B93F3F0682250B6CF8331B7EE68FD8
const body = '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\n0018A45C4D1DEF81644B54AB7F969B88D65:1';
assert.equal(countInRange(body, '1E4C9B93F3F0682250B6CF8331B7EE68FD8'), 9659365, 'found in breach data');
assert.equal(countInRange(body, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), 0, 'not in breach data');
assert.equal(countInRange('', 'ANY'), 0, 'empty response');

console.log('password.check.ts — all assertions passed');
