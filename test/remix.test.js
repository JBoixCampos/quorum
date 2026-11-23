// Remix (other layouts for one slide), variant files and replacing a slide
// in place. No browser needed.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { optionsFor } from '../src/cli/explore.js';
import { readTalk } from '../src/cli/load.js';
import { remix } from '../src/cli/remix.js';
import { findSlide, replaceSlide, slideText, splitTalk } from '../src/cli/repo.js';
import {
  addVariant, findVariant, listVariants, parseVariant, removeVariant,
} from '../src/cli/variants.js';
import { parseTalk } from '../src/shared/markdown.js';

const names = (text) => remix(text).variants.map((v) => v.name);

// Every remix must be a valid single slide, with no warnings.
function valid(text) {
  remix(text).variants.forEach((v) => {
    const talk = parseTalk(v.text);
    assert.equal(talk.slides.length, 1, `${v.name} is one slide`);
    assert.deepEqual(talk.warnings, [], `${v.name}: ${talk.warnings.join('; ')}`);
  });
}

test('a list of short items becomes cards, steps, a timeline or reveals', () => {
  const text = '## Ingredients\n\n- Flour: proteins that become gluten\n- Water: wakes up the enzymes\n- Yeast: a living fungus\n- Salt: slows the yeast\n';
  const got = names(text);
  ['cards', 'steps', 'reveal', 'centered'].forEach((n) => assert.ok(got.includes(n), `${n} in ${got}`));
  valid(text);
  const cards = remix(text).variants.find((v) => v.name === 'cards').text;
  assert.match(cards, /::: cards\n### Flour\nproteins that become gluten/);
  assert.match(cards, /\+\+\+/);
});

test('items with dates become a timeline and numbers become key figures or charts', () => {
  assert.ok(names('## History\n\n- 1857: Pasteur publishes\n- 1928: sliced bread\n- 1961: Chorleywood\n').includes('timeline'));
  assert.ok(names('## Numbers\n\n- 215 min: from flour to bread\n- 4: ingredients\n- 2: rises\n').includes('kpis'));
  const sales = '## Sales\n\n- Tacos: 56\n- Ramen: 33\n- Pizza: 11\n';
  assert.ok(names(sales).includes('chart-columns') && names(sales).includes('chart-donut'));
  valid(sales);
  const minutes = remix('## Time\n\n- Mix: 10 min\n- Knead: 10 min\n- Bake: 35 min\n').variants.find((v) => v.name === 'chart-bars');
  assert.match(minutes.text, /::: chart bar \{unit=min\}/);
});

test('a chart can become another chart, key figures or cards', () => {
  const text = '## Time\n\n::: chart column {unit=min}\nMix: 10\nKnead: 10\nBake: 35\n:::\n';
  const got = names(text);
  assert.ok(got.includes('chart-bars') && got.includes('chart-line') && got.includes('kpis') && got.includes('cards'));
  assert.ok(!got.includes('chart-columns'));
  valid(text);
});

test('cards can become steps, a timeline or a plain list', () => {
  const text = '## Four\n\n::: cards\n### Flour {icon=wheat}\nProteins.\n\n+++\n\n### Water {icon=droplet}\nEnzymes.\n\n+++\n\n### Yeast\nGas.\n:::\n';
  const got = names(text);
  assert.ok(got.includes('steps') && got.includes('list'));
  assert.ok(!got.includes('cards'));
  valid(text);
});

test('a table of numbers becomes a chart or key figures', () => {
  const text = '## Revenue\n\n| Quarter | Revenue |\n| --- | --- |\n| Q1 | 12 |\n| Q2 | 18 |\n| Q3 | 25 |\n';
  const got = names(text);
  assert.ok(got.includes('table-columns') && got.includes('table-bars') && got.includes('table-kpis'));
  valid(text);
});

test('two sides become a comparison, a picture and words a split', () => {
  const sides = '## Choice\n\n### Fresh\n\nCrisp crust.\n\n### Sliced\n\nLasts longer.\n';
  assert.ok(names(sides).includes('compare') && names(sides).includes('two-cards'));
  valid(sides);
  const picture = '## Yeast\n\n![A bowl of dough](images/dough.jpg)\n\nIt eats sugar.\n';
  assert.deepEqual(names(picture).filter((n) => n.startsWith('picture')), ['picture-left', 'picture-right', 'picture-full']);
  assert.match(remix(picture).variants.find((v) => v.name === 'picture-right').text, /<!-- layout: split, right -->/);
});

test('one strong sentence becomes a statement, a big number or a quote', () => {
  assert.ok(names('## Bread is mostly patience.\n').includes('statement'));
  const big = remix('## 87 keys on a standard piano\n').variants.find((v) => v.name === 'big-number');
  assert.match(big.text, /<!-- layout: big-number -->\n\n## 87\n\nkeys on a standard piano/);
  assert.ok(names('## Bread\n\n"Bread is the king of the table."\n').includes('quote'));
  valid('## 87 keys on a standard piano\n');
});

test('notes and other attributes are kept, the layout is replaced', () => {
  const text = '<!-- layout: center -->\n<!-- section: Kitchen, 5 -->\n\n## Steps\n\n- One: a\n- Two: b\n- Three: c\n\n::: notes\nSay this.\n:::\n';
  const cards = remix(text).variants.find((v) => v.name === 'cards').text;
  assert.match(cards, /<!-- section: Kitchen, 5 -->/);
  assert.match(cards, /::: notes\nSay this\.\n:::/);
  assert.ok(!/layout: center/.test(cards));
});

test('slides where the audience answers are left alone, with a reason', () => {
  const r = remix('::: poll {#p} Where?\n- A\n- B\n:::\n');
  assert.deepEqual(r.variants, []);
  assert.match(r.reason, /audience answers/);
});

test('a variant file records who made it and what it tries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-var-'));
  const made = addVariant(dir, 'intro', '## Intro\n\n- A\n- B\n', { by: 'claude', direction: 'minimal; calm' });
  assert.equal(made.file, 'variants/intro/001-minimal-calm.md');
  addVariant(dir, 'intro', '<!-- variant: by=ana; direction=data first -->\n\n## Intro\n\n- C\n');
  const list = listVariants(dir, 'intro');
  assert.deepEqual(list.map((v) => [v.by, v.direction]), [['claude', 'minimal calm'], ['ana', 'data first']]);
  assert.equal(findVariant(list, '2').by, 'ana');
  assert.equal(findVariant(list, 'data').by, 'ana');
  assert.equal(parseVariant(readFileSync(join(dir, 'variants', 'intro', '001-minimal-calm.md'), 'utf8')).text, '## Intro\n\n- A\n- B\n');
  assert.throws(() => addVariant(dir, 'intro', '## A\n\n---\n\n## B\n'), /one slide/);
  assert.throws(() => addVariant(dir, '../x', '## A\n'), /not a slide id/);
  removeVariant(dir, 'intro', list[0]);
  assert.equal(listVariants(dir, 'intro').length, 1);
});

const TALK = '---\ntitle: T\n---\n\n# One\n\nfirst\n\n---\n\n## Two\n\n- A: a\n- B: b\n- C: c\n\n---\n\n# Three\n\nthird\n';

test('replacing a slide changes only that slide, in one file or in a split talk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-rep-'));
  writeFileSync(join(dir, 'talk.md'), TALK);
  const slide = findSlide(readTalk(dir), 'two');
  assert.equal(slideText(dir, 'talk.md', slide), '## Two\n\n- A: a\n- B: b\n- C: c\n');
  replaceSlide(dir, 'talk.md', slide, '## Two\n\n::: steps\n- A: a\n- B: b\n- C: c\n:::\n');
  const after = readFileSync(join(dir, 'talk.md'), 'utf8');
  assert.equal(after, TALK.replace('- A: a\n- B: b\n- C: c\n', '::: steps\n- A: a\n- B: b\n- C: c\n:::\n'));
  assert.equal(readTalk(dir).slides.length, 3);

  const dir2 = mkdtempSync(join(tmpdir(), 'quorum-rep-'));
  writeFileSync(join(dir2, 'talk.md'), TALK);
  splitTalk(dir2);
  replaceSlide(dir2, 'talk.md', findSlide(readTalk(dir2), 'two'), '## Two\n\nchanged\n');
  assert.equal(readFileSync(join(dir2, 'slides', '020-two.md'), 'utf8'), '## Two\n\nchanged\n');
  assert.equal(readFileSync(join(dir2, 'slides', '010-one.md'), 'utf8'), '# One\n\nfirst\n');
  assert.throws(() => replaceSlide(dir, 'talk.md', findSlide(readTalk(dir), 'one'), '# A\n\n---\n\n# B\n'), /two slides/);
});

test('options are the slide, then stored variants, then remixes, numbered from 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-opt-'));
  writeFileSync(join(dir, 'talk.md'), TALK);
  addVariant(dir, 'two', '## Two\n\nan agent wrote this\n', { by: 'claude', direction: 'calm' });
  const { list, slide } = optionsFor(dir, 'talk.md', '2');
  assert.equal(slide.id, 'two');
  assert.deepEqual(list.slice(0, 2).map((c) => [c.name, c.source]), [['current', 'current'], ['001-calm', 'variant']]);
  assert.ok(list.slice(2).every((c) => c.source === 'remix') && list.length > 3);
  assert.equal(optionsFor(dir, 'talk.md', 'two', { remixToo: false }).list.length, 2);
  mkdirSync(join(dir, 'x'), { recursive: true });
});
