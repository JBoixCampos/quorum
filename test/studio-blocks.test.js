// The forms Studio shows for blocks read the block's Markdown into fields
// and write it back: unknown lines are kept, and a block read and written
// without changes comes back the same.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EDITORS, LIBRARY, editorFor, inlineEditable, placeOnCanvas, readBlock,
} from '../app/js/studio-blocks.js';
import { parseTalk } from '../src/shared/markdown.js';

const round = (text) => {
  const b = readBlock(text);
  const e = editorFor(b.name);
  return e.write(b, e.read(b));
};

test('a poll is read and written back unchanged', () => {
  const text = '::: poll {#holes chart=donut reveal=spotlight} What makes the holes?\n- Air\n- [x] Gas from the yeast\n- Steam\n\nYeast gas makes most of them.\n:::';
  assert.equal(round(text), text);
  const b = readBlock(text);
  const m = EDITORS.poll.read(b);
  assert.deepEqual(m.options.map((o) => o.right), [false, true, false]);
  m.options.push({ text: 'Magic', right: false });
  m.options[0].right = true;
  m.chart = '';
  const out = EDITORS.poll.write(b, m);
  assert.match(out, /^::: poll \{#holes reveal=spotlight\} What makes the holes\?\n- \[x\] Air\n/);
  assert.match(out, /- Magic\n\nYeast gas/);
  assert.deepEqual(parseTalk(out).warnings, []);
});

test('an estimate keeps its settings and explanation', () => {
  const text = '::: estimate {#keys} How many keys?\nanswer: 88\nmin: 1\nmax: 1000\nunit: keys\n\nA standard piano.\n:::';
  assert.equal(round(text), text);
  const b = readBlock(text);
  const m = EDITORS.estimate.read(b);
  m.answer = '87';
  m.scale = 'log';
  assert.match(EDITORS.estimate.write(b, m), /answer: 87\nmin: 1\nmax: 1000\nunit: keys\nscale: log\n\nA standard piano\./);
});

test('a chart becomes rows and back', () => {
  const text = '::: chart column {unit=min title="Minutes"}\nMix: 10\nKnead: 10\nBake: 35\n:::';
  assert.equal(round(text), text);
  const b = readBlock(text);
  const m = EDITORS.chart.read(b);
  m.type = 'donut';
  m.rows.push({ label: 'Rest', value: '' });
  m.unit = '';
  assert.equal(EDITORS.chart.write(b, m), '::: chart donut {title="Minutes"}\nMix: 10\nKnead: 10\nBake: 35\nRest: 0\n:::');
});

test('steps, timelines and key figures share one form', () => {
  ['steps', 'timeline', 'kpis'].forEach((name) => {
    const text = `::: ${name} {.steps}\n- First: one\n- Second: two\n:::`;
    assert.equal(round(text), text, name);
  });
  const b = readBlock('::: kpis\n- 4: ingredients\n:::');
  const m = EDITORS.items.read(b);
  m.steps = true;
  m.items.push({ label: '2', detail: 'rises' });
  assert.equal(EDITORS.items.write(b, m), '::: kpis {.steps}\n- 4: ingredients\n- 2: rises\n:::');
});

test('cards keep their icons and other attributes', () => {
  const text = '::: cards {.steps}\n### Flour {icon=wheat}\nProteins.\n\n+++\n\n### Water {#w icon=droplet}\nEnzymes.\n:::';
  assert.equal(round(text), text);
  const b = readBlock(text);
  const m = EDITORS.cards.read(b);
  m.cards.reverse();
  m.cards[0].icon = '';
  assert.equal(EDITORS.cards.write(b, m), '::: cards {.steps}\n### Water {#w}\nEnzymes.\n\n+++\n\n### Flour {icon=wheat}\nProteins.\n:::');
});

test('only plain headings and paragraphs are typed into on the slide', () => {
  assert.equal(inlineEditable('## A **bold** title {.center}'), true);
  assert.equal(inlineEditable('Some text with a [link](https://example.com).'), true);
  assert.equal(inlineEditable('Ready :icon[clock] now'), false);
  assert.equal(inlineEditable('A ==highlight=='), false);
  assert.equal(inlineEditable('- a list item'), false);
  assert.equal(inlineEditable('![A picture](a.jpg)'), false);
});

test('every block in the Insert library parses without warnings', () => {
  LIBRARY.flatMap((g) => g.items).filter((i) => i.text).forEach((item) => {
    const talk = parseTalk(`## Slide\n\n${item.text}\n`);
    assert.deepEqual(talk.warnings, [], item.id);
    assert.equal(talk.slides.length, 1, item.id);
  });
});

test('a block dropped on a canvas slide gets a position', () => {
  assert.equal(placeOnCanvas('## Title', 10, 20), '## Title {x=10 y=20 w=40}');
  assert.equal(placeOnCanvas('::: cards\n### A\n:::', 5, 5), '::: cards {x=5 y=5 w=40}\n### A\n:::');
  assert.equal(placeOnCanvas('::: chart column {unit=min}\nA: 1\n:::', 5, 5), '::: chart column {unit=min x=5 y=5 w=40}\nA: 1\n:::');
  assert.equal(placeOnCanvas('- a list', 5, 5), '- a list');
});
