import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countValue, progress } from '../app/js/motion.js';

test('a count-up never starts below zero', () => {
  // A frame can be time-stamped a little before the count began.
  assert.equal(progress(-16, 900), 0);
  assert.equal(countValue(1700000, progress(-16, 900)), 0);
  assert.ok(countValue(87, progress(-3, 1100)) >= 0);
});

test('a count-up ends on its target', () => {
  assert.equal(countValue(87, progress(900, 900)), 87);
  assert.equal(countValue(87, progress(5000, 900)), 87);
  const half = countValue(100, progress(450, 900));
  assert.ok(half > 50 && half < 100);
});
