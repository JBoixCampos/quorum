// Slide ids, source maps and split talks (one file per slide).

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readTalk } from '../src/cli/load.js';
import { parseTalk, slug } from '../src/shared/markdown.js';

test('slide ids come from the title and stay unique', () => {
  const talk = parseTalk('# Why bread rises!\n\n---\n\n# Why bread rises!\n\n---\n\n<!-- id: custom -->\n# Other\n\n---\n\n::: poll {#p} Q?\n- a\n- b\n:::\n');
  assert.deepEqual(talk.slides.map((s) => s.id), ['why-bread-rises', 'why-bread-rises-2', 'custom', 'q']);
  assert.equal(slug('Café  au lait'), 'cafe-au-lait');
  assert.equal(slug('???'), '');
});

test('every slide knows its lines', () => {
  const talk = parseTalk('# One\n\n---\n# Two\n\ntext\n');
  assert.deepEqual(talk.slides[0].lines, [1, 1]);
  assert.deepEqual(talk.slides[1].lines, [4, 6]);
});

test('source maps mark each block with its lines, only when asked', () => {
  const source = '# Title\n\nA paragraph\nover two lines.\n\n- one\n- two\n\n```js\nconst a = 1;\n```\n';
  const plain = parseTalk(source).slides[0].html;
  assert.ok(!plain.includes('data-src'));
  const mapped = parseTalk(source, { sourceMap: true }).slides[0].html;
  assert.match(mapped, /<h1 data-src="1-1">/);
  assert.match(mapped, /<p data-src="3-4">/);
  assert.match(mapped, /<ul data-src="6-7">/);
  assert.match(mapped, /data-src="9-11"/);
});

function splitTalk(files, front = 'title: Split\nslides: slides/\n') {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-split-'));
  mkdirSync(join(dir, 'slides'));
  writeFileSync(join(dir, 'talk.md'), `---\n${front}---\n`);
  Object.entries(files).forEach(([name, text]) => writeFileSync(join(dir, 'slides', name), text));
  return dir;
}

test('a split talk reads one slide per file, in alphabetical order', () => {
  const dir = splitTalk({ '020-two.md': '# Two\n', '010-one.md': '# One\n\nhello\n' });
  const talk = readTalk(dir);
  assert.deepEqual(talk.slides.map((s) => s.title), ['One', 'Two']);
  assert.deepEqual(talk.slides.map((s) => s.file), ['slides/010-one.md', 'slides/020-two.md']);
  assert.equal(talk.split, true);
  assert.deepEqual(talk.warnings, []);
});

test('order: puts listed slides first and warns about missing ones', () => {
  const dir = splitTalk({ 'a.md': '# A\n', 'b.md': '# B\n', 'c.md': '# C\n' }, 'slides: slides/\norder: c, a, nope\n');
  const talk = readTalk(dir);
  assert.deepEqual(talk.slides.map((s) => s.title), ['C', 'A', 'B']);
  assert.ok(talk.warnings.some((w) => w.includes('nope.md')));
});

test('line numbers in warnings can be traced back to a slide file', () => {
  const dir = splitTalk({ 'a.md': '# A\n', 'b.md': '# B\n\n::: poll {#p} Q?\n- one\n:::\n' });
  const talk = readTalk(dir);
  assert.equal(talk.slides[1].file, 'slides/b.md');
  assert.ok(talk.slides[1].lines[0] > talk.slides[0].lines[1]);
});

test('a slides folder outside the talk is refused', () => {
  const dir = splitTalk({}, 'slides: ../elsewhere\n');
  const talk = readTalk(dir);
  assert.ok(talk.warnings.some((w) => w.includes('must be a folder inside')));
});
