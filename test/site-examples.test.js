import assert from 'node:assert/strict';
import { test } from 'node:test';

import { schema } from '../src/shared/design.js';
import { coverage, GROUPS } from '../scripts/site/builtin.js';

test('the examples page has an example for everything built in', () => {
  const { missing, missingLooks } = coverage(schema());
  assert.deepEqual(missing, [], `Add these to scripts/site/builtin.js: ${missing.join(', ')}`);
  assert.deepEqual(missingLooks, [], `Add these result looks to scripts/site/builtin.js: ${missingLooks.join(', ')}`);
});

test('every example has a unique key and some Markdown', () => {
  const seen = new Set();
  GROUPS.forEach((g) => g.items.forEach((i) => {
    const id = `${g.id}-${i.key}`;
    assert.ok(!seen.has(id), `${id} appears twice`);
    seen.add(id);
    assert.ok(i.source && i.source.trim(), `${id} has no source`);
  }));
});
