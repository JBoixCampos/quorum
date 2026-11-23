import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inline, parseTalk } from '../src/shared/markdown.js';

test('front matter and slides', () => {
  const t = parseTalk('---\ntitle: My talk\naccent: "#123456"\nduration: 45\n---\n# One\n\nHello\n\n---\n\n# Two\n');
  assert.equal(t.meta.title, 'My talk');
  assert.equal(t.meta.accent, '#123456');
  assert.equal(t.meta.duration, 45);
  assert.equal(t.slides.length, 2);
  assert.equal(t.slides[1].title, 'Two');
  assert.deepEqual(t.warnings, []);
});

test('inline formatting is escaped and safe', () => {
  assert.equal(inline('**a** <b> *c*'), '<strong>a</strong> &lt;b&gt; <em>c</em>');
  assert.match(inline('[x](javascript:alert(1))'), /href="#"/);
  assert.match(inline('`<code>`'), /<code>&lt;code&gt;<\/code>/);
});

test('steps split with --', () => {
  const t = parseTalk('# A\n\nfirst\n\n--\n\nsecond\n\n--\n\nthird');
  assert.equal(t.slides[0].steps, 3);
  assert.match(t.slides[0].html, /data-step="2"/);
});

test('poll with answer and reveal text', () => {
  const t = parseTalk('::: poll {#lie} Which one is the lie?\n- A\n- [x] B\n- C\n\nIt was B.\n:::');
  const i = t.slides[0].interaction;
  assert.equal(i.id, 'lie');
  assert.deepEqual(i.options, ['A', 'B', 'C']);
  assert.equal(i.answer, 'B');
  assert.match(i.reveal, /It was B/);
});

test('estimate options and log scale', () => {
  const t = parseTalk('::: estimate How many?\nanswer: 57,000\nmax: 100000000\nscale: log\nlabel: about 57,000\n:::');
  const i = t.slides[0].interaction;
  assert.equal(i.answer, 57000);
  assert.equal(i.scale, 'log');
  assert.equal(i.answerLabel, 'about 57,000');
});

test('sentence routes', () => {
  const t = parseTalk('::: sentence Photosynthesis turns light\nmax: 6\nstart: into | energy\ninto: energy | food\n*: and | .\n:::');
  const i = t.slides[0].interaction;
  assert.deepEqual(i.routes[''], ['into', 'energy']);
  assert.deepEqual(i.routes.into, ['energy', 'food']);
  assert.deepEqual(i.routes['*'], ['and', '.']);
  assert.equal(i.maxWords, 6);
});

test('rounds', () => {
  const t = parseTalk('::: rounds Would you delegate it?\noptions: Yes | No | Depends\n- Task one\n- Task two\n:::');
  const i = t.slides[0].interaction;
  assert.deepEqual(i.options, ['Yes', 'No', 'Depends']);
  assert.deepEqual(i.items, ['Task one', 'Task two']);
});

test('columns, notes, components and attributes', () => {
  const t = parseTalk('<!-- section: Intro, 5 -->\n# Title\n::: columns\nleft\n+++\nright\n:::\n::: notes\nSay hi.\n:::\n::: component countdown\nseconds: 30\n:::');
  const s = t.slides[0];
  assert.match(s.html, /q-columns/);
  assert.equal(s.notes, 'Say hi.');
  assert.equal(s.components[0].name, 'countdown');
  assert.equal(s.components[0].params.seconds, '30');
  assert.deepEqual(s.section, { name: 'Intro', minutes: 5 });
});

test('nested blocks with the same fence', () => {
  const t = parseTalk('::: columns\n::: stat 42\nthe answer\n:::\n+++\nright side\n:::');
  assert.match(t.slides[0].html, /q-stat-value">42/);
  assert.match(t.slides[0].html, /right side/);
  assert.deepEqual(t.warnings, []);
});

test('warnings point at problems', () => {
  const t = parseTalk('::: poll Only one?\n- A\n:::\n\n---\n\n::: wat\nx\n:::');
  assert.equal(t.warnings.length, 2);
  assert.match(t.warnings[0], /at least two options/);
  assert.match(t.warnings[1], /Unknown block/);
});

test('code fences hide --- and ::: lines', () => {
  const t = parseTalk('```\n---\n::: poll\n```');
  assert.equal(t.slides.length, 1);
  assert.equal(t.slides[0].interaction, null);
});

test('components can ask the audience', () => {
  const talk = parseTalk(`::: component word-cloud {#feel}
audience: text
prompt: One word
length: 20
:::

---

::: component chart
audience: choice
options: A | B
:::

---

::: component broken
audience: video
:::`);
  const [a, b] = talk.slides;
  assert.equal(a.interaction.kind, 'input');
  assert.equal(a.interaction.id, 'feel');
  assert.equal(a.interaction.length, 20);
  assert.equal(a.components[0].interaction, 'feel');
  assert.deepEqual(b.interaction.options, ['A', 'B']);
  assert.ok(b.interaction.id.startsWith('chart-'));
  assert.equal(talk.slides[2].interaction, null);
  assert.ok(talk.warnings.some((w) => w.includes('audience: video')));
});
