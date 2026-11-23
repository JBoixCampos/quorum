import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readNumber } from '../src/shared/kinds.js';
import { parseTalk } from '../src/shared/markdown.js';
import { Session } from '../src/shared/session.js';

const TALK = parseTalk(`# Welcome

---

::: poll {#lie} Which one is the lie?
- A
- [x] B
:::

---

::: multi {#have} What do you have?
- Phone
- Laptop
- Coffee
:::

---

::: estimate {#year} When did ChatGPT launch?
answer: 2022
min: 2000
max: 2026
:::

---

::: rounds {#delegate} Would you delegate it?
options: Yes | No
- One
- Two
:::

---

::: sentence {#s} Light turns
max: 3
start: into | to
into: energy | food
*: and | .
:::
`);

const P = { presenter: true };
const A = (n) => ({ device: `device-0000${n}` });

test('stage moves only for the presenter and stays in range', () => {
  const s = new Session(TALK);
  assert.equal(s.apply({ type: 'stage', slide: 1, step: 0 }, A(1)).ok, false);
  assert.equal(s.apply({ type: 'stage', slide: 1, step: 0 }, P).ok, true);
  assert.equal(s.apply({ type: 'stage', slide: 99, step: 0 }, P).ok, false);
  assert.ok(s.d.startedAt);
});

test('poll: votes only while open, answer hidden until the reveal', () => {
  const s = new Session(TALK);
  s.apply({ type: 'stage', slide: 1 }, P);
  assert.equal(s.apply({ type: 'vote', id: 'lie', value: 'A' }, A(1)).ok, false);
  s.apply({ type: 'control', id: 'lie', action: 'phase', phase: 1 }, P);
  assert.equal(s.apply({ type: 'vote', id: 'lie', value: 'A' }, A(1)).ok, true);
  assert.equal(s.apply({ type: 'vote', id: 'lie', value: 'Z' }, A(2)).ok, false);
  assert.equal(s.audienceView('device-00001').interaction.spec.answer, undefined);
  s.apply({ type: 'control', id: 'lie', action: 'phase', phase: 3 }, P);
  assert.equal(s.audienceView('device-00001').interaction.spec.answer, 'B');
  assert.deepEqual(s.screenView().interaction.counts, { A: 1, B: 0 });
});

test('multi and estimate', () => {
  const s = new Session(TALK);
  s.apply({ type: 'stage', slide: 2 }, P);
  s.apply({ type: 'control', id: 'have', action: 'phase', phase: 1 }, P);
  s.apply({ type: 'vote', id: 'have', value: ['Phone', 'Coffee', 'Nope'] }, A(1));
  assert.deepEqual(s.screenView().interaction.counts, { Phone: 1, Laptop: 0, Coffee: 1 });
  s.apply({ type: 'stage', slide: 3 }, P);
  s.apply({ type: 'control', id: 'year', action: 'phase', phase: 1 }, P);
  assert.equal(s.apply({ type: 'vote', id: 'year', value: '2021' }, A(1)).ok, true);
  assert.equal(s.apply({ type: 'vote', id: 'year', value: '2023' }, A(2)).ok, true);
  assert.equal(s.apply({ type: 'vote', id: 'year', value: '1990' }, A(3)).ok, false);
  assert.equal(s.screenView().interaction.mean, 2022);
});

test('reading numbers', () => {
  assert.equal(readNumber('57.000'), 57000);
  assert.equal(readNumber('57,000'), 57000);
  assert.equal(readNumber('2,5'), 2.5);
  assert.equal(readNumber('1 000'), 1000);
  assert.ok(Number.isNaN(readNumber('lots')));
});

test('rounds keep each result', () => {
  const s = new Session(TALK);
  s.apply({ type: 'stage', slide: 4 }, P);
  s.apply({ type: 'control', id: 'delegate', action: 'open' }, P);
  s.apply({ type: 'vote', id: 'delegate', value: 'Yes' }, A(1));
  s.apply({ type: 'control', id: 'delegate', action: 'close' }, P);
  s.apply({ type: 'control', id: 'delegate', action: 'next' }, P);
  assert.equal(s.screenView().interaction.item, 'Two');
  s.apply({ type: 'control', id: 'delegate', action: 'previous' }, P);
  assert.equal(s.screenView().interaction.counts.Yes, 1);
});

test('sentence: the most voted word is fixed and the sentence ends', () => {
  const s = new Session(TALK);
  s.apply({ type: 'stage', slide: 5 }, P);
  s.apply({ type: 'control', id: 's', action: 'open' }, P);
  s.apply({ type: 'vote', id: 's', value: 'into' }, A(1));
  s.apply({ type: 'vote', id: 's', value: 'into' }, A(2));
  s.apply({ type: 'vote', id: 's', value: 'to' }, A(3));
  s.apply({ type: 'control', id: 's', action: 'close' }, P);
  let v = s.screenView().interaction;
  assert.deepEqual(v.words.map((w) => w.text), ['into']);
  assert.deepEqual(v.options, ['energy', 'food']);
  s.apply({ type: 'control', id: 's', action: 'fix', word: 'energy' }, P);
  s.apply({ type: 'control', id: 's', action: 'fix', word: '.' }, P);
  v = s.screenView().interaction;
  assert.equal(v.finished, true);
});

test('questions: moderated, voted, highlighted', () => {
  const s = new Session(TALK);
  const r = s.apply({ type: 'ask', text: '  Why?  ' }, A(1));
  assert.equal(r.ok, true);
  assert.equal(s.screenView().questions.length, 0);
  assert.equal(s.apply({ type: 'ask', text: 'Again' }, A(1)).ok, false);
  s.apply({ type: 'approveAll' }, P);
  const id = s.screenView().questions[0].id;
  assert.equal(s.apply({ type: 'upvote', id }, A(1)).ok, false);
  s.apply({ type: 'upvote', id }, A(2));
  assert.equal(s.screenView().questions[0].votes, 1);
  s.apply({ type: 'onScreen', id }, P);
  s.apply({ type: 'onScreen', id: null }, P);
  assert.equal(s.screenView().questions[0].answered, true);
});

test('state saved with a chat mode by older versions still loads', () => {
  const s = new Session(TALK, { chatMode: true, chat: { n: 2, stack: [] } });
  assert.equal(s.toJSON().chatMode, undefined);
  assert.ok(!s.apply({ type: 'chatVote', id: 'lie', value: 'B' }, P).ok);
});

test('saved state survives a reload', () => {
  const s = new Session(TALK);
  s.apply({ type: 'stage', slide: 1 }, P);
  s.apply({ type: 'control', id: 'lie', action: 'phase', phase: 1 }, P);
  s.apply({ type: 'vote', id: 'lie', value: 'A' }, A(1));
  const again = new Session(TALK, JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(again.screenView().interaction.counts.A, 1);
});

test('input: text answers for a component', () => {
  const talk = parseTalk(`# Hi

---

::: component word-cloud
audience: text
length: 10
:::`);
  const s = new Session(talk);
  const id = talk.slides[1].interaction.id;
  s.apply({ type: 'stage', slide: 1 }, P);
  s.apply({ type: 'control', id, action: 'phase', phase: 1 }, P);
  assert.ok(s.apply({ type: 'vote', id, value: '  Curious ' }, A(1)).ok);
  assert.ok(!s.apply({ type: 'vote', id, value: 'far too long for this' }, A(2)).ok);
  assert.ok(!s.apply({ type: 'vote', id, value: '   ' }, A(2)).ok);
  assert.deepEqual(s.screenView().interaction.values, ['Curious']);
});
