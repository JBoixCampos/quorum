// End-to-end test: a real server, the presentation, the panel and several
// phones in a headless browser. Needs Playwright:
//
//   npm install --no-save playwright && npx playwright install chromium
//   npm run test:e2e

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { startServer } from '../../src/server/server.js';
import { startFakeModel } from './fake-model.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('Playwright is not installed: npm install --no-save playwright');
  process.exit(1);
}

const results = [];
function check(name, ok, detail = '') {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`);
}

async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await fn()) return true;
    } catch {
      // the page may be changing
    }
    await new Promise((r) => { setTimeout(r, 100); });
  }
  return false;
}

const PHONES = 3;
const dir = mkdtempSync(join(tmpdir(), 'quorum-e2e-'));
// A talk with every kind of interaction (the starter of earlier versions).
cpSync(join(ROOT, 'test', 'fixtures', 'every-feature'), dir, { recursive: true });
['next-word-explorer.js', 'word-cloud.js'].forEach((f) => cpSync(join(ROOT, 'examples', 'components', f), join(dir, 'components', f)));
const model = await startFakeModel();
const server = await startServer({ talkDir: dir, port: 0, key: 'testkey', log: () => {} });
const base = `http://localhost:${server.port}`;
server.setPublicUrl(base);
const browser = await chromium.launch();
const errors = [];

try {
  const present = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  present.on('pageerror', (e) => errors.push(`present: ${e.message}`));
  await present.goto(`${base}/present?key=testkey`);
  const panel = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  panel.on('pageerror', (e) => errors.push(`panel: ${e.message}`));
  await panel.goto(`${base}/panel?key=testkey`);
  const phones = [];
  for (let i = 0; i < PHONES; i += 1) {
    const p = await browser.newPage({ viewport: { width: 390, height: 800 } });
    p.on('pageerror', (e) => errors.push(`phone ${i}: ${e.message}`));
    await p.goto(`${base}/`);
    phones.push(p);
  }
  const slideTitle = () => panel.textContent('[data-slide-title]');
  const goTo = async (n) => {
    await panel.evaluate((i) => document.querySelector('[data-preview]').contentWindow.quorum.go(i, 0), n);
    await until(async () => (await slideTitle()).startsWith(`${n + 1}.`));
  };

  check('phones join and are counted', await until(async () => (await panel.textContent('[data-people]')).startsWith(`${PHONES} `)));
  check('the join slide shows a QR code', await until(() => present.$('.q-join-card svg path')));

  // Poll: open, vote, close
  await goTo(2);
  check('before opening, phones get ready', await until(() => phones[0].$('text=Get ready')));
  await panel.click('[data-go="1"]');
  check('opening from the panel shows the options on phones', await until(() => phones[0].$('[data-one="Tea"]')));
  for (const p of phones) await p.click('[data-one="Tea"]');
  check('votes reach the screen', await until(async () => (await present.textContent('.q-bar[data-option="Tea"] .q-bar-value')) === '100%'));
  await present.keyboard.press('ArrowRight');
  check('the arrow closes voting without leaving the slide', await until(() => phones[0].$('text=Look at the screen')) && (await slideTitle()).startsWith('3.'));

  // Quiz with a reveal
  await goTo(3);
  await present.keyboard.press('ArrowRight');
  await until(() => phones[0].$('[data-one]'));
  await phones[0].click('[data-one="Rome is the capital of Italy"]');
  await present.keyboard.press('ArrowRight');
  await present.keyboard.press('ArrowRight');
  check('the reveal marks the right answer', await until(() => present.$('.q-bar.correct[data-option="Rome is the capital of Italy"]')));
  check('phones see the answer after the reveal', await until(async () => (await phones[0].textContent('[data-result]')).includes('Answer: Rome')));

  // Multi
  await goTo(4);
  await present.keyboard.press('ArrowRight');
  await until(() => phones[0].$('[data-toggle]'));
  await phones[0].click('[data-toggle="A phone"]');
  await phones[0].click('[data-toggle="A laptop"]');
  await phones[0].click('[data-send-multi]');
  check('several options count separately', await until(async () => (await present.textContent('.q-bar[data-option="A laptop"] .q-bar-value')) === '100%'));

  // Estimate
  await goTo(5);
  await present.keyboard.press('ArrowRight');
  await until(() => phones[0].$('[data-number]'));
  const guesses = ['80', '90', '5,000'];
  for (let i = 0; i < PHONES; i += 1) {
    await phones[i].fill('[data-number]', guesses[i]);
    await phones[i].click('[data-send-number]');
  }
  check('a number out of range is refused', await until(async () => (await phones[2].textContent('[data-message="vote"]')).includes('between')));
  await phones[2].fill('[data-number]', '100');
  await phones[2].click('[data-send-number]');
  await until(async () => (await present.textContent('.q-ring b')) === '3');
  await present.keyboard.press('ArrowRight');
  check('closing shows the average', await until(async () => (await present.textContent('[data-mean]')) === '90'));
  await present.keyboard.press('ArrowRight');
  check('revealing shows the real answer', await until(() => present.isVisible('[data-answer]')));

  // Rounds
  await goTo(6);
  await present.keyboard.press('ArrowRight');
  await until(() => phones[0].$('[data-one="Yes"]'));
  await phones[0].click('[data-one="Yes"]');
  await present.keyboard.press('ArrowRight');
  await until(() => phones[0].$('text=Look at the screen'));
  await present.keyboard.press('ArrowRight');
  check('rounds move to the next item', await until(async () => (await present.textContent('[data-item]')).includes('holiday')));

  // Sentence
  await goTo(7);
  await present.keyboard.press('ArrowRight');
  await until(() => phones[0].$('[data-one="there"]'));
  for (const p of phones) await p.click('[data-one="a"]');
  await until(async () => (await present.textContent('.q-ring b')) === `${PHONES}`);
  await present.keyboard.press('ArrowRight');
  check('closing adds the most voted word', await until(async () => (await present.textContent('[data-text]')).includes('Once upon a time a')));
  check('phones get the next options', await until(async () => {
    await present.keyboard.press('ArrowRight');
    return phones[0].$('[data-one="dragon"]');
  }, 3000));

  // Shared component state between the window and the panel preview
  await goTo(10);
  await until(() => present.$('.counter'));
  await present.click('.counter');
  await present.click('.counter');
  const frame = panel.frameLocator('[data-preview]');
  check('a component\'s shared state reaches the preview', await until(async () => (await frame.locator('.counter').textContent()) === '2'));

  // Questions with moderation
  await goTo(11);
  await phones[0].fill('[data-ask-form="ask-inline"] textarea', 'Can I use this at work?');
  await phones[0].click('[data-ask-form="ask-inline"] button');
  check('a question waits for approval', await until(async () => (await panel.textContent('[data-pending]')) === '1')
    && !(await present.$('[data-question]')));
  await panel.click('[data-approve-all]');
  check('once approved it appears on screen', await until(() => present.$('[data-question]')));
  await until(() => phones[1].$('[data-up]'));
  await phones[1].click('[data-up]');
  check('others can vote for it', await until(async () => (await present.textContent('.q-votes')) === '1'));

  // Thumbnails
  await goTo(2);
  check('thumbnails show this slide and the next two', await until(async () => {
    const ids = await panel.$$eval('[data-thumb] iframe', (fs) => fs.map((f) => {
      const t = f.contentDocument && f.contentDocument.querySelector('.q-question, h1, h2');
      return t ? t.textContent : '';
    }));
    return ids[0].includes('Coffee') || ids[0].includes('prefer');
  }, 6000));

  // Editing talk.md updates the slides
  const file = join(dir, 'talk.md');
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n---\n\n# A slide added while presenting\n
---

## What comes next?

::: component next-word-explorer
text: Photosynthesis turns light
model: http://127.0.0.1:${model.port}
:::

---

## How do you feel?

::: component word-cloud {#feel}
audience: text
prompt: One word
:::
`);
  check('editing talk.md updates the panel', await until(async () => {
    await goTo(13);
    return (await slideTitle()).includes('added while presenting');
  }, 6000));

  // The example component that calls a local language model
  await goTo(14);
  check('the next-word explorer gets words from the model', await until(async () => (await present.$$('[data-row]')).length === 10, 6000));
  await present.click('[data-row="0"]');
  check('picking a word shows it in the preview too', await until(async () => {
    const text = await frame.locator('[data-sentence]').textContent();
    return text.split(' ').length > 3;
  }, 6000));

  // A component that asks the audience
  await goTo(15);
  await present.keyboard.press('ArrowRight');
  check('a component can ask phones for text', await until(() => phones[0].$('.j-text')));
  const feelings = ['Curious', 'curious', 'hopeful'];
  for (let i = 0; i < PHONES; i += 1) {
    await phones[i].fill('.j-text', feelings[i]);
    await phones[i].click('[data-send-number]');
  }
  check('the component draws the answers', await until(async () => {
    const words = await present.$$eval('.cloud span', (ss) => ss.map((x) => x.textContent));
    return words.length === 2 && words.includes('curious');
  }));

  // The state is saved
  check('the session is saved to disk', await until(() => readFileSync(join(dir, '.quorum', 'state.json'), 'utf8').includes('Can I use this at work?')));

  // A live server never gives the whole talk (notes, answers) to phones
  const leaked = await (await fetch(`${base}/api/talk?preview=1`)).json();
  check('phones cannot read the notes and answers', !leaked.slides);
  check('nor the talk file itself', (await fetch(`${base}/talk/talk.md`)).status === 404);

  // quorum preview: the talk with a simulated audience
  const previewServer = await startServer({ talkDir: dir, port: 0, key: 'testkey', preview: true, log: () => {} });
  const preview = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  preview.on('pageerror', (e) => errors.push(`preview: ${e.message}`));
  await preview.goto(previewServer.urls.preview);
  await until(() => preview.$('.q-slide h1'));
  await preview.evaluate(() => window.quorum.go(2, 0));
  await preview.keyboard.press('ArrowRight');
  check('preview: the simulated audience votes', await until(async () => Number(await preview.textContent('.q-ring b')) > 3, 8000));
  await previewServer.close();

  // The design system: examples/showcase uses a preset, layouts, blocks,
  // result looks, morphing titles and reactions.
  const showDir = mkdtempSync(join(tmpdir(), 'quorum-e2e-showcase-'));
  cpSync(join(ROOT, 'examples', 'showcase'), showDir, { recursive: true });
  const show = await startServer({ talkDir: showDir, port: 0, key: 'showkey', log: () => {} });
  const showBase = `http://localhost:${show.port}`;
  const showPages = [];
  try {
    const screen = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    showPages.push(screen);
    screen.on('pageerror', (e) => errors.push(`showcase: ${e.message}`));
    await screen.goto(`${showBase}/present?key=showkey`);
    await until(() => screen.$('.q-slide.layout-title'));
    check('showcase: the preset is applied', await screen.evaluate(() => document.documentElement.dataset.preset === 'midnight' && document.documentElement.dataset.surface === 'glass'));
    const slides = show.talk().slides;
    const layouts = new Set();
    for (const s of slides) {
      await screen.evaluate((i) => window.quorum.go(i, 0), s.index);
      await until(() => screen.evaluate((i) => document.querySelector('[data-slide]').dataset.sid === `s${i + 1}`, s.index));
      layouts.add(await screen.evaluate(() => document.querySelector('[data-slide]').className));
    }
    check('showcase: every slide renders', layouts.size > 8, [...layouts].join(' | '));
    await screen.evaluate((i) => window.quorum.go(i, 0), slides.findIndex((s) => s.layout === 'split'));
    check('showcase: split moves the picture into a media pane', await until(() => screen.$('.layout-split .q-media img')));
    await screen.evaluate((i) => window.quorum.go(i, 0), slides.findIndex((s) => /q-cards/.test(s.html)));
    check('showcase: cards appear one per click', await until(async () => (await screen.$$('.q-card.q-step:not(.shown)')).length === 3));
    await screen.evaluate((i) => window.quorum.go(i, 0), slides.findIndex((s) => s.interaction && s.interaction.chart === 'donut'));
    check('showcase: a poll can draw its results as a donut', await until(() => screen.$('[data-slide] .q-donut')));

    // Reactions: a phone sends one, the screen and the panel show it floating.
    const showPanel = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    showPages.push(showPanel);
    showPanel.on('pageerror', (e) => errors.push(`showcase panel: ${e.message}`));
    await showPanel.goto(`${showBase}/panel?key=showkey`);
    const panelPreview = showPanel.frameLocator('[data-preview]');
    await until(async () => (await panelPreview.locator('[data-slide]').count()) > 0);
    const phone = await browser.newPage({ viewport: { width: 390, height: 700 } });
    showPages.push(phone);
    phone.on('pageerror', (e) => errors.push(`showcase phone: ${e.message}`));
    await phone.goto(`${showBase}/`);
    check('showcase: phones show the reactions', await until(async () => (await phone.$$('[data-react]')).length === 4));
    await phone.click('[data-react="👏"]');
    check('showcase: a reaction floats up on the screen', await until(async () => (await screen.textContent('[data-reactions]')).includes('👏')));
    check('showcase: and in the preview of the presenter\'s panel', await until(async () => (await panelPreview.locator('[data-reactions]').textContent()).includes('👏')));
    check('showcase: phones use the palette for options', await phone.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--series-2').trim() === '#22d3ee'));
  } finally {
    await Promise.all(showPages.map((p) => p.close()));
    await show.close();
    rmSync(showDir, { recursive: true, force: true });
  }

  check('no errors in any page', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
  model.close();
  rmSync(dir, { recursive: true, force: true });
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
