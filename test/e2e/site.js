// End-to-end test of the website: builds it into a temporary folder, serves
// it under /quorum/ (as GitHub Pages does) and drives the playground, the
// demo and the docs in a headless browser. Needs Playwright.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function until(fn, ms = 6000) {
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

const out = mkdtempSync(join(tmpdir(), 'quorum-site-'));
execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-site.js'), out], { stdio: 'ignore' });
// quorum export of the starter talk, served next to the site.
execFileSync(process.execPath, [join(ROOT, 'bin', 'quorum.js'), 'export', join(ROOT, 'templates', 'starter'), '--out', join(out, 'export')], { stdio: 'ignore' });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.txt': 'text/plain' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith('/quorum/')) {
    res.writeHead(404).end();
    return;
  }
  let file = normalize(join(out, path.slice('/quorum/'.length)));
  if (!file.startsWith(out)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => { server.listen(0, r); });
const base = `http://localhost:${server.address().port}/quorum/`;
const browser = await chromium.launch();
const errors = [];

function watch(page, name) {
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('request', (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith('data:')) errors.push(`${name}: external request to ${r.url()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${name}: ${r.status()} for ${r.url()}`);
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, 'landing');
  await page.goto(base);
  const frame = page.frameLocator('#write iframe');
  const slideText = () => frame.locator('.q-slide').textContent();

  check('the landing playground renders the Markdown', await until(async () => (await slideText()).includes('Where should we go for lunch?')));
  check('it says how to try the slide, without a slide counter', await until(async () => {
    const text = await page.textContent('[data-pg-status]');
    return text.includes('simulated people') && !/Slide \d+ of/.test(text);
  }));

  await page.click('[data-chip="estimate"]');
  check('a chip adds a slide and the preview follows it', await until(async () => (await slideText()).includes('How many keys does a piano have?')));
  check('the editor has the new block', (await page.inputValue('#write textarea')).includes('::: estimate {#keys}'));

  await page.click('[data-chip="estimate"]');
  check('adding the same block twice gives it a new id', await until(async () => (await page.inputValue('#write textarea')).includes('{#keys-2}')));

  await page.fill('#write textarea', '::: poll {#solo} Only one option\n- A\n:::\n');
  check('typing updates the slide', await until(async () => (await slideText()).includes('Only one option')));
  check('warnings from the parser are shown', await until(async () => (await page.textContent('[data-pg-status]')).includes('at least two options')));

  await page.fill('#write textarea', '::: poll {#pick} Pick one\n- Red\n- Blue\n:::\n');
  await until(async () => (await slideText()).includes('Pick one'));
  await frame.locator('[data-do="open"]').click();
  check('the simulated audience votes in the preview', await until(async () => Number(await frame.locator('.q-ring b').textContent()) > 2, 10000));

  await page.click('[data-pg-reset]');
  check('start again restores the first draft', await until(async () => (await slideText()).includes('lunch')));

  // The demo opens on a given slide.
  const demo = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watch(demo, 'demo');
  await demo.goto(`${base}demo/?slide=3`);
  check('?slide=3 opens the demo on its fourth slide', await until(async () => (await demo.textContent('.q-slide')).includes('When did ChatGPT come out?')));
  await demo.keyboard.press('ArrowRight');
  check('the static demo still plays from there', await until(async () => Number(await demo.textContent('.q-ring b')) > 2, 10000));

  // quorum export: the slides without the audience parts.
  const exported = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watch(exported, 'export');
  await exported.goto(`${base}export/`);
  check('export keeps the title slide, without its QR code', await until(() => exported.$('.q-slide h1'))
    && !(await exported.$('[data-join], .q-join-card')));
  const exportedTalk = await (await fetch(`${base}export/talk.json`)).json();
  check('export has no slide where the audience answers', exportedTalk.slides.length > 0
    && exportedTalk.slides.every((x) => !x.interaction));
  await exported.keyboard.press('ArrowRight');
  check('export moves on with no simulated audience', await until(async () => (await exported.textContent('.q-slide')) !== '')
    && !(await exported.isVisible('[data-preview]')));

  // A "Try it" link in the docs opens the playground with that block.
  const docs = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(docs, 'docs');
  await docs.goto(`${base}docs/format/`);
  const link = docs.locator('#rounds ~ .try a').first();
  await link.click();
  await docs.waitForURL(/playground\/#md=/);
  check('a docs example opens in the playground', await until(async () => (await docs.inputValue('[data-playground] textarea')).includes('::: rounds')));
  check('and the playground shows it', await until(async () => (await docs.frameLocator('[data-playground] iframe').locator('.q-slide').textContent()).includes('Would you hand this to an AI?')));

  // Every page loads, with the same header.
  for (const path of ['docs/', 'docs/components/', 'docs/giving-a-talk/', 'docs/agents/', 'examples/']) {
    await docs.goto(base + path);
    check(`${path} has the site navigation`, (await docs.$$('nav.links a')).length === 5);
  }
  const llms = await docs.goto(`${base}llms.txt`);
  check('llms.txt is published', llms.ok() && (await llms.text()).includes('llms-full.txt'));
  const full = await docs.goto(`${base}llms-full.txt`);
  check('llms-full.txt has the whole format', full.ok() && (await full.text()).includes('::: sentence'));

  check('no errors and no external requests', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
  rmSync(out, { recursive: true, force: true });
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed} of ${results.length} site checks passed.`);
process.exit(passed === results.length ? 0 : 1);
