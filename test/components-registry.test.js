// The built-in components are listed once (COMPONENTS in design.js); the
// browser code, the checker, the schema and the docs must agree with it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { BUILT_IN_COMPONENTS } from '../src/cli/check.js';
import { COMPONENTS, schema } from '../src/shared/design.js';
import { parseTalk } from '../src/shared/markdown.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const names = Object.keys(COMPONENTS);

test('the browser draws exactly the registered built-in components', () => {
  const source = read('app/js/components.js');
  const block = source.slice(source.indexOf('const BUILT_IN = {'), source.indexOf('// A path inside the talk folder'));
  const drawn = [...block.matchAll(/^ {2}([a-z-]+): \{$/gm)].map((m) => m[1]);
  assert.deepEqual(drawn.sort(), [...names].sort());
});

test('the checker and the schema know the built-in components', () => {
  assert.deepEqual(BUILT_IN_COMPONENTS, names);
  assert.deepEqual(Object.keys(schema().components), names);
});

test('every registered example is a valid component block', () => {
  names.forEach((name) => {
    const c = COMPONENTS[name];
    assert.ok(c.about && c.params && Object.keys(c.params).length, `${name} has a description and settings`);
    const talk = parseTalk(c.example);
    assert.deepEqual(talk.warnings, [], name);
    assert.ok(c.example.startsWith(`::: component ${name}\n`), name);
  });
});

test('the components guide describes every built-in component', () => {
  const guide = read('docs/components.md');
  names.forEach((name) => {
    assert.ok(guide.includes(`| \`${name}\` |`), `docs/components.md has no row for ${name}`);
    assert.ok(guide.includes(`::: component ${name}`), `docs/components.md has no example of ${name}`);
  });
});
