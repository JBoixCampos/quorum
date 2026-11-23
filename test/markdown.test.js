import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inline, parseTalk, withoutAudience } from '../src/shared/markdown.js';

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

test('branding: colours, logo, fonts and stylesheet from the front matter', () => {
  const talk = parseTalk([
    '---',
    'title: We are #1',
    'accent: "#0b5fff"   # buttons and bars',
    'primary: navy',
    'secondary: rgb(0, 160, 120)',
    'background: "#101820"',
    'logo: ./images/logo.svg',
    'font: fonts/Brand-Bold.woff2',
    'text-font: Georgia, serif',
    'style: brand.css',
    '---',
    '# Hi',
  ].join('\n'));
  assert.equal(talk.meta.title, 'We are #1');
  assert.equal(talk.meta.accent, '#0b5fff');
  assert.equal(talk.meta.primary, 'navy');
  assert.equal(talk.meta.secondary, 'rgb(0, 160, 120)');
  assert.equal(talk.meta.theme, 'dark', 'a dark background makes the theme dark');
  assert.equal(talk.meta.logo, 'images/logo.svg');
  assert.equal(talk.meta.fontFile, 'fonts/Brand-Bold.woff2');
  assert.equal(talk.meta.font, '');
  assert.equal(talk.meta.textFont, 'Georgia, serif');
  assert.equal(talk.meta.style, 'brand.css');
  assert.deepEqual(talk.warnings, []);
});

test('branding: values that cannot be used are dropped with a warning', () => {
  const talk = parseTalk('---\naccent: not a colour\nlogo: ../outside.png\nstyle: https://example.com/x.css\n---\n# Hi\n');
  assert.equal(talk.meta.accent, '#ff6a00');
  assert.equal(talk.meta.logo, '');
  assert.equal(talk.meta.style, '');
  assert.equal(talk.warnings.length, 3);
});

test('slide backgrounds and hiding the logo', () => {
  const talk = parseTalk([
    '<!-- background: images/photo.jpg, dim -->', '<!-- logo: off -->', '# Photo',
    '', '---', '', '<!-- background: #ffeedd -->', '# Colour',
    '', '---', '', '# Plain',
  ].join('\n'));
  assert.deepEqual(talk.slides[0].background, { color: '', image: 'images/photo.jpg', dim: true });
  assert.equal(talk.slides[0].logo, false);
  assert.deepEqual(talk.slides[1].background, { color: '#ffeedd', image: '', dim: false });
  assert.equal(talk.slides[2].background, null);
  assert.equal(talk.slides[2].logo, true);
});

test('withoutAudience keeps only the slides nobody answers', () => {
  const talk = parseTalk([
    '# Title', '', '::: join', ':::', '', '---', '', '## Plain', '', '---', '',
    '::: poll {#p} Pick', '- A', '- B', ':::', '', '---', '',
    '::: component word-cloud', 'audience: text', ':::', '', '---', '',
    '::: component countdown', 'seconds: 30', ':::',
  ].join('\n'));
  const slides = withoutAudience(talk).slides;
  assert.deepEqual(slides.map((s) => s.title).slice(0, 2), ['Title', 'Plain']);
  assert.equal(slides.length, 3);
  assert.deepEqual(slides.map((s) => s.index), [0, 1, 2]);
  assert.equal(slides[0].join, false);
  assert.equal(slides[2].components[0].name, 'countdown');
});
