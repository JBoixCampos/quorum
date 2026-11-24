// The editing operations behind `quorum studio`: each one is an edit to
// the talk's files, so each test checks the exact text that results.

import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { splitTalk } from '../src/cli/repo.js';
import { changeAttrs, StudioError, Workspace } from '../src/cli/studio-ops.js';

const TALK = `---
title: Studio
---

# One

first

---

## Two {.center}

Some words
over two lines.

- A
- B
- C

::: cards
### Flour
Proteins.

+++

### Water
Enzymes.

+++

### Yeast
Gas.
:::

---

# Three

third
`;

function make(text = TALK, { split = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-studio-'));
  writeFileSync(join(dir, 'talk.md'), text);
  if (split) splitTalk(dir);
  const w = new Workspace(dir);
  const file = (rel = 'talk.md') => readFileSync(join(dir, rel), 'utf8');
  return { dir, w, file };
}

const lineOf = (text, needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;

test('changeAttrs adds, removes and sets attributes on a line', () => {
  assert.equal(changeAttrs('## Title', { add: ['center'] }), '## Title {.center}');
  assert.equal(changeAttrs('## Title {.center}', { add: ['accent'], remove: ['center'] }), '## Title {.accent}');
  assert.equal(changeAttrs('## Title {.center}', { remove: ['center'] }), '## Title');
  assert.equal(changeAttrs('![A loaf](a.jpg)', { kv: { x: 10, y: 20 } }), '![A loaf](a.jpg){x=10 y=20}');
  assert.equal(changeAttrs('![A loaf](a.jpg){x=10 y=20}', { kv: { x: 30, y: null } }), '![A loaf](a.jpg){x=30}');
  assert.equal(changeAttrs('::: cards {.steps}', { add: ['shadow'] }), '::: cards {.steps .shadow}');
  assert.equal(changeAttrs('Plain {not attributes}', { add: ['muted'] }), 'Plain {not attributes} {.muted}');
  assert.throws(() => changeAttrs('## T', { add: ['nonsense'] }), StudioError);
});

test('changeAttrs keeps a ::: line\'s attributes in its first group, where the parser reads them', () => {
  const place = { kv: { x: 10, y: 20 } };
  assert.equal(changeAttrs('::: poll {#guess .wide chart=donut} What makes the holes?', place), '::: poll {#guess .wide chart=donut x=10 y=20} What makes the holes?');
  assert.equal(changeAttrs('::: poll What makes the holes?', place), '::: poll What makes the holes? {x=10 y=20}');
  assert.equal(changeAttrs('::: poll {#g x=1 y=2} Q?', { kv: { x: null, y: null } }), '::: poll {#g} Q?');
  assert.equal(changeAttrs('::: poll {x=1} Q?', { kv: { x: null } }), '::: poll Q?');
  assert.equal(changeAttrs('```js', place), '```js {x=10 y=20}');
});

test('replace-lines changes only those lines, and refuses lines outside the slide', () => {
  const { w, file } = make();
  const talk = w.talk();
  const two = talk.slides[1];
  const para = lineOf(TALK, 'Some words');
  w.apply({ op: 'replace-lines', slide: two.id, from: para, to: para + 1, text: 'New words.' });
  assert.equal(file(), TALK.replace('Some words\nover two lines.', 'New words.'));
  assert.throws(() => w.apply({ op: 'replace-lines', slide: two.id, from: 1, to: 2, text: 'x' }), /outside the slide/);
  assert.equal(file(), TALK.replace('Some words\nover two lines.', 'New words.'));
});

test('set-attrs puts classes on headings, paragraphs (last line) and blocks', () => {
  const { w, file } = make();
  const two = w.talk().slides[1];
  const heading = lineOf(TALK, '## Two');
  w.apply({ op: 'set-attrs', slide: two.id, range: [heading, heading], add: ['accent'], remove: ['center'] });
  assert.match(file(), /## Two \{\.accent\}/);
  const para = lineOf(TALK, 'Some words');
  w.apply({ op: 'set-attrs', slide: two.id, range: [para, para + 1], add: ['muted'] });
  assert.match(file(), /over two lines\. \{\.muted\}/);
  const cards = lineOf(TALK, '::: cards');
  w.apply({ op: 'set-attrs', slide: two.id, range: [cards, cards + 13], add: ['steps'] });
  assert.match(file(), /::: cards \{\.steps\}/);
  const list = lineOf(TALK, '- A');
  assert.throws(() => w.apply({ op: 'set-attrs', slide: two.id, range: [list, list + 2], add: ['muted'] }), /List items/);
});

test('set-attrs places lists on their last line and code on its fence, and the talk reads it back', () => {
  const { w, file } = make();
  const two = w.talk().slides[1];
  const list = lineOf(TALK, '- A');
  const end = list + file().split('\n').slice(list - 1).findIndex((l) => !/^\s*[-*+]\s/.test(l)) - 1;
  w.apply({ op: 'set-attrs', slide: two.id, range: [list, end], kv: { x: 5, y: 60, w: 40 } });
  assert.match(file().split('\n')[end - 1], /\{x=5 y=60 w=40\}$/);
  assert.match(w.talk().slides[1].html, /<ul[^>]* class="q-placed" style="position:absolute;left:5%;top:60%;width:40%">/);
  assert.throws(() => w.apply({ op: 'set-attrs', slide: two.id, range: [list, list], kv: { x: 5 } }), /whole list/);
});

test('move-block reorders blocks, list items and cards', () => {
  const { w, file } = make();
  const two = () => w.talk().slides[1];
  // The list before the paragraph.
  let p = lineOf(TALK, 'Some words');
  let l = lineOf(TALK, '- A');
  w.apply({ op: 'move-block', slide: two().id, from: [l, l + 2], to: [p, p + 1], where: 'before' });
  assert.match(file(), /## Two \{\.center\}\n\n- A\n- B\n- C\n\nSome words\nover two lines\.\n\n::: cards/);
  // List item C to the top of its list.
  const a = lineOf(file(), '- A');
  const c = lineOf(file(), '- C');
  w.apply({ op: 'move-block', slide: two().id, from: [c, c], to: [a, a], where: 'before' });
  assert.match(file(), /- C\n- A\n- B\n/);
  // The Yeast card first.
  const yeast = lineOf(file(), '### Yeast');
  const flour = lineOf(file(), '### Flour');
  w.apply({ op: 'move-block', slide: two().id, from: [yeast, yeast + 1], to: [flour, flour + 1], where: 'before' });
  assert.match(file(), /::: cards\n### Yeast\nGas\.\n\n\+\+\+\n\n### Flour\nProteins\.\n\n\+\+\+\n\n### Water\nEnzymes\.\n:::/);
  assert.throws(() => w.apply({ op: 'move-block', slide: two().id, from: [flour, flour + 1], to: [flour, flour + 1], where: 'after' }), /onto itself|outside/);
  p = 0;
});

test('slide settings and notes are added, changed and removed', () => {
  const { w, file } = make();
  const id = () => w.talk().slides[1].id;
  w.apply({ op: 'set-slide-attr', slide: id(), key: 'layout', value: 'split' });
  assert.match(file(), /<!-- layout: split -->\n\n## Two/);
  w.apply({ op: 'set-slide-attr', slide: id(), key: 'layout', value: 'center' });
  assert.match(file(), /<!-- layout: center -->\n\n## Two/);
  w.apply({ op: 'set-slide-attr', slide: id(), key: 'transition', value: 'zoom' });
  assert.match(file(), /<!-- layout: center -->\n<!-- transition: zoom -->\n\n## Two/);
  w.apply({ op: 'set-slide-attr', slide: id(), key: 'layout', value: null });
  assert.ok(!/layout: center/.test(file()));
  w.apply({ op: 'set-notes', slide: id(), text: 'Say this first.' });
  assert.match(file(), /::: notes\nSay this first\.\n:::\n\n---/);
  w.apply({ op: 'set-notes', slide: id(), text: 'Changed.' });
  assert.match(file(), /::: notes\nChanged\.\n:::/);
  w.apply({ op: 'set-notes', slide: id(), text: '' });
  assert.ok(!/notes/.test(file()));
  assert.equal(w.talk().slides.length, 3);
});

test('front matter lines are set, replaced and removed', () => {
  const { w, file } = make();
  w.apply({ op: 'set-front', key: 'theme', value: 'midnight' });
  assert.match(file(), /^---\ntitle: Studio\ntheme: midnight\n---/);
  w.apply({ op: 'set-front', key: 'theme', value: 'paper' });
  assert.match(file(), /theme: paper/);
  w.apply({ op: 'set-front', key: 'theme', value: null });
  assert.ok(!/theme:/.test(file()));
  const bare = make('# Only\n');
  bare.w.apply({ op: 'set-front', key: 'theme', value: 'bold' });
  assert.equal(bare.file(), '---\ntheme: bold\n---\n\n# Only\n');
});

test('slides are inserted, duplicated, moved and deleted in one file', () => {
  const { w, file } = make();
  const titles = () => w.talk().slides.map((s) => s.title);
  w.apply({ op: 'insert-slide', after: w.talk().slides[0].id, text: '## Inserted\n\nnew' });
  assert.deepEqual(titles(), ['One', 'Inserted', 'Two', 'Three']);
  w.apply({ op: 'insert-slide', after: null, text: '# Very first' });
  assert.deepEqual(titles(), ['Very first', 'One', 'Inserted', 'Two', 'Three']);
  w.apply({ op: 'duplicate-slide', slide: w.talk().slides[4].id });
  assert.deepEqual(titles(), ['Very first', 'One', 'Inserted', 'Two', 'Three', 'Three']);
  w.apply({ op: 'move-slide', slide: w.talk().slides[3].id, after: w.talk().slides[0].id });
  assert.deepEqual(titles(), ['Very first', 'Two', 'One', 'Inserted', 'Three', 'Three']);
  w.apply({ op: 'move-slide', slide: w.talk().slides[1].id, after: null });
  assert.deepEqual(titles(), ['Two', 'Very first', 'One', 'Inserted', 'Three', 'Three']);
  w.apply({ op: 'delete-slide', slide: w.talk().slides[0].id });
  w.apply({ op: 'delete-slide', slide: w.talk().slides[4].id });
  assert.deepEqual(titles(), ['Very first', 'One', 'Inserted', 'Three']);
  assert.match(file(), /^---\ntitle: Studio\n---\n\n# Very first/);
  assert.deepEqual(w.talk().warnings, []);
  assert.throws(() => w.apply({ op: 'insert-slide', after: null, text: '# A\n\n---\n\n# B' }), /more than one/);
});

test('a talk can lose slides down to one, but not to none', () => {
  const { w } = make('# A\n\n---\n\n# B\n');
  w.apply({ op: 'delete-slide', slide: 'a' });
  assert.throws(() => w.apply({ op: 'delete-slide', slide: 'b' }), /at least one/);
});

test('in a split talk slides are files: inserted between, moved by renaming', () => {
  const { dir, w, file } = make(TALK, { split: true });
  const names = () => readdirSync(join(dir, 'slides')).sort();
  assert.deepEqual(names(), ['010-one.md', '020-two.md', '030-three.md']);
  w.apply({ op: 'insert-slide', after: 'one', text: '## Between\n\nnew' });
  assert.deepEqual(names(), ['010-one.md', '015-between.md', '020-two.md', '030-three.md']);
  w.apply({ op: 'insert-slide', after: 'between', text: '## Squeezed\n\nnew' });
  assert.deepEqual(w.talk().slides.map((s) => s.title), ['One', 'Between', 'Squeezed', 'Two', 'Three']);
  assert.ok(names().every((n) => /^\d{3}-/.test(n)));
  w.apply({ op: 'move-slide', slide: 'three', after: null });
  assert.equal(w.talk().slides[0].title, 'Three');
  w.apply({ op: 'delete-slide', slide: 'squeezed' });
  assert.deepEqual(w.talk().slides.map((s) => s.title), ['Three', 'One', 'Between', 'Two']);
  assert.equal(file(), '---\ntitle: Studio\nslides: slides/\n---\n');
  w.apply({ op: 'replace-lines', slide: 'two', from: w.talk().slides[3].lines[0], to: w.talk().slides[3].lines[0], text: '## Two, edited {.center}' });
  assert.match(readFileSync(join(dir, 'slides', names().find((n) => n.endsWith('-two.md'))), 'utf8'), /## Two, edited/);
});

test('a split talk with order: keeps the list in step', () => {
  const { dir, w, file } = make(TALK, { split: true });
  writeFileSync(join(dir, 'talk.md'), file().replace('slides: slides/\n', 'slides: slides/\norder: 010-one, 020-two, 030-three\n'));
  w.apply({ op: 'insert-slide', after: 'one', text: '## Between\n\nnew' });
  assert.deepEqual(w.talk().slides.map((s) => s.title), ['One', 'Between', 'Two', 'Three']);
  assert.match(file(), /order: 010-one, 015-between, 020-two, 030-three/);
  w.apply({ op: 'move-slide', slide: 'between', after: 'three' });
  assert.deepEqual(w.talk().slides.map((s) => s.title), ['One', 'Two', 'Three', 'Between']);
  w.apply({ op: 'delete-slide', slide: 'two' });
  assert.match(file(), /order: 010-one, 030-three, 015-between/);
});

test('undo and redo put the files back, and a failed operation changes nothing', () => {
  const { dir, w, file } = make(TALK, { split: true });
  const before = readdirSync(join(dir, 'slides')).map((n) => readFileSync(join(dir, 'slides', n), 'utf8'));
  w.apply({ op: 'insert-slide', after: 'one', text: '## Between\n\nnew' });
  w.apply({ op: 'delete-slide', slide: 'three' });
  assert.equal(w.canUndo, true);
  w.undo();
  w.undo();
  assert.deepEqual(readdirSync(join(dir, 'slides')).map((n) => readFileSync(join(dir, 'slides', n), 'utf8')), before);
  assert.equal(w.canRedo, true);
  w.redo();
  assert.equal(w.talk().slides.length, 4);
  const snapshot = file();
  assert.throws(() => w.apply({ op: 'delete-slide', slide: 'no-such-slide' }), StudioError);
  assert.equal(file(), snapshot);
  assert.throws(() => w.apply({ op: 'nope' }), /Unknown operation/);
  mkdirSync(join(dir, 'x'), { recursive: true });
  assert.ok(!existsSync(join(dir, 'slides', '999-new-between.md')));
});

test('set-alt changes the description of a picture only', () => {
  const { w, file } = make('# One\n\n![Old](a.jpg){x=1 y=2}\n\ntext\n');
  w.apply({ op: 'set-alt', slide: 'one', line: 3, alt: 'A loaf, cut open' });
  assert.equal(file(), '# One\n\n![A loaf, cut open](a.jpg){x=1 y=2}\n\ntext\n');
  assert.throws(() => w.apply({ op: 'set-alt', slide: 'one', line: 5, alt: 'x' }), /no picture/);
});

test('deleting a card takes its separator with it', () => {
  const { w, file } = make();
  const water = lineOf(TALK, '### Water');
  w.apply({ op: 'delete-lines', slide: 'two', from: water, to: water + 1 });
  assert.match(file(), /::: cards\n### Flour\nProteins\.\n\n\+\+\+\n\n### Yeast\nGas\.\n:::/);
  assert.deepEqual(w.talk().warnings, []);
});

test('lines of a list item are removed without leaving a gap', () => {
  const { w, file } = make();
  const b = lineOf(TALK, '- B');
  w.apply({ op: 'delete-lines', slide: 'two', from: b, to: b });
  assert.match(file(), /- A\n- C\n/);
});
