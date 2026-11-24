// End-to-end test of Quorum Studio: drives the real editor in a headless
// browser and checks what each action wrote to the talk's files, then
// presents and exports from it. Needs Playwright.

import {
  cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../../src/server/server.js';

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

const dir = mkdtempSync(join(tmpdir(), 'quorum-studio-e2e-'));
cpSync(join(ROOT, 'examples', 'showcase'), dir, { recursive: true });
const file = () => readFileSync(join(dir, 'talk.md'), 'utf8');
const original = file();
const server = await startServer({ talkDir: dir, port: 0, preview: true, studio: true, key: 'k', log: () => {} });
const browser = await chromium.launch();
const errors = [];

async function until(fn, ms = 8000) {
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

function http(path, headers = {}) {
  return new Promise((done) => {
    const req = request({ host: 'localhost', port: server.port, path, headers }, (res) => {
      res.resume();
      res.on('end', () => done(res.statusCode));
    });
    req.on('error', () => done(0));
    req.end();
  });
}

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${server.port}/studio?key=k&nowindows=1`);
  await page.waitForFunction(() => document.querySelectorAll('.slide').length === 21, null, { timeout: 15000 });
  const canvas = page.frameLocator('[data-frame]');
  const titles = () => page.$$eval('.slide iframe', (n) => n.map((x) => x.title.replace(/^Slide \d+: /, '')));
  const goTo = async (title) => {
    const at = (await titles()).indexOf(title);
    await idle();
    await page.locator('.slide').nth(at).click();
    await page.waitForTimeout(600);
    await idle();
    return at;
  };
  // Studio saves and draws again after each change: wait until it is quiet.
  const idle = async () => {
    await until(() => page.evaluate(() => window.studio.S.busy === 0));
    await page.waitForTimeout(350);
  };
  const tab = async (name) => {
    await idle();
    await page.click(`[data-tab="${name}"]`);
  };
  const libClick = async (id) => {
    await tab('insert');
    await page.locator(`.lib-item[data-item="${id}"]`).click();
    await idle();
  };
  const undoAll = async () => {
    for (let i = 0; i < 12 && file() !== original; i += 1) {
      await idle();
      await page.click('[data-act="undo"]');
      await page.waitForTimeout(250);
    }
    return file() === original;
  };

  check('the rail shows every slide, grouped by section', (await page.$$('.slide')).length === 21 && (await page.$$('.section-label')).length >= 3);
  check('the slides that ask the audience are marked', (await page.$$('.slide .flag')).length >= 3);
  check('the checks pass on the showcase', await until(async () => (await page.textContent('[data-act="problems"]')).includes('Checks')));
  check('the canvas draws the real slide', await until(async () => (await canvas.locator('[data-slide] h1').count()) > 0));

  // --- typing on the slide -------------------------------------------------------
  await goTo('Four ingredients');
  await canvas.locator('[data-slide] h2').first().click();
  check('clicking selects and the floating toolbar appears', await until(() => page.isVisible('[data-float]')));
  await canvas.locator('[data-slide] h2').first().dblclick();
  check('double click on a heading makes it editable on the slide', await until(async () => (await canvas.locator('[contenteditable="true"]').count()) === 1));
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Four simple ingredients');
  await page.keyboard.press('Enter');
  check('typing on the slide writes the heading, keeping its attributes', await until(() => file().includes('## Four simple ingredients {#title}')), file().split('\n').find((l) => l.includes('ingredients')));
  check('undo puts it back', await undoAll());

  // --- the cards form ---------------------------------------------------------------
  await goTo('Four ingredients');
  await canvas.locator('.q-card p').first().click();
  await page.waitForSelector('.card-edit');
  const firstTitle = page.locator('.card-edit input').first();
  await firstTitle.fill('Strong flour');
  await firstTitle.press('Tab');
  check('the cards form rewrites the card title', await until(() => file().includes('### Strong flour {icon=wheat}')));
  await page.locator('.add', { hasText: 'Add a card' }).click();
  await page.locator('.card-edit').last().locator('input').first().fill('Sugar');
  await page.locator('.card-edit').last().locator('input').first().press('Tab');
  check('adding a card adds a column with its separator', await until(() => /\+\+\+\n\n### Sugar\n:::/.test(file())), file().slice(file().indexOf('::: cards'), file().indexOf('::: cards') + 400));
  check('undo puts it back', await undoAll());

  // --- insert from the library ------------------------------------------------------------
  await goTo('Yeast eats sugar');
  await libClick('kpis');
  check('clicking a block in the library adds it to the slide', await until(() => /The gas gets trapped[\s\S]*::: kpis\n- 120: people/.test(file().split('---')[5] + file())));
  const before = (await titles()).length;
  await libClick('poll');
  check('a poll on a slide without one goes on that slide', await until(() => file().includes('::: poll Which one do you prefer?')) && (await titles()).length === before);
  await libClick('estimate');
  check('a second question gets its own slide', await until(async () => (await titles()).length === before + 1));
  check('undo puts it all back', await undoAll());

  // the built-in components, from the library and with a form
  await goTo('Four ingredients');
  await libClick('qr');
  check('the QR code component can be inserted', await until(() => file().includes('::: component qr\nurl: https://example.com\nlabel: Scan to open\n:::')));
  await canvas.locator('.q-qr-figure').first().click();
  const link = page.locator('.field', { has: page.locator('.label', { hasText: /^Link$/ }) }).locator('input');
  await link.waitFor();
  await link.fill('https://example.org/slides');
  await link.press('Tab');
  check('the component form rewrites its link', await until(() => file().includes('::: component qr\nurl: https://example.org/slides\nlabel: Scan to open\n:::')));
  check('undo puts it back', await undoAll());
  await libClick('embed');
  check('the web page component can be inserted', await until(() => file().includes('::: component embed\nurl: https://example.com\n:::')));
  check('undo puts it back', await undoAll());

  // drag a block from the library onto the slide
  await goTo('Four ingredients');
  await tab('insert');
  // Playwright cannot drag between a page and its iframe, so the drop the
  // browser would deliver is sent to the slide directly.
  const frame = await (await page.locator('[data-frame]').elementHandle()).contentFrame();
  await frame.evaluate(() => {
    const h2 = document.querySelector('[data-slide] h2').getBoundingClientRect();
    const data = new DataTransfer();
    data.setData('application/x-quorum-block', 'quote');
    const at = { dataTransfer: data, bubbles: true, cancelable: true, clientX: h2.left + 40, clientY: h2.bottom + 4 };
    document.dispatchEvent(new DragEvent('dragover', at));
    document.dispatchEvent(new DragEvent('drop', at));
  });
  check('dragging a block onto the slide puts it where it was dropped', await until(() => /## Four ingredients \{#title\}\n\n> The quotation goes here\.\n\n::: cards/.test(file())), file().slice(file().indexOf('## Four ingredients'), file().indexOf('## Four ingredients') + 120));
  check('undo puts it back', await undoAll());

  // drag a block between slides in the rail
  await tab('insert');
  const rail = page.locator('.slide').nth(1);
  const rb = await rail.boundingBox();
  await page.locator('.lib-item[data-item="chart"]').dragTo(rail, { targetPosition: { x: 60, y: rb.height - 6 } });
  check('dragging a block between slides makes a new slide', await until(async () => (await titles())[2] === 'New slide'));
  check('undo puts it back', await undoAll());

  // --- the poll form ------------------------------------------------------------------------
  await goTo('What makes the holes in bread?');
  await canvas.locator('[data-interaction]').first().click();
  await page.waitForSelector('.item .right');
  const options = page.locator('.item input');
  await options.first().fill('Air bubbles from kneading');
  await options.first().press('Tab');
  check('the poll form rewrites an option', await until(() => file().includes('- Air bubbles from kneading')));
  check('the right answer stays marked', /- \[x\] /.test(file()));
  check('undo puts it back', await undoAll());

  // --- alternatives and the agent ------------------------------------------------------------------
  await goTo('One loaf, step by step');
  await tab('alternatives');
  check('alternatives show other layouts by Quorum', await until(async () => (await page.$$('.alt')).length >= 4));
  await page.locator('[data-side] textarea').first().fill('more visual');
  await page.locator('button', { hasText: 'Ask your agent' }).click();
  check('the request is saved and the instruction for the agent is shown', await until(async () => (await page.textContent('.prompt')).includes('quorum requests')));
  const saved = readdirSync(join(dir, 'requests')).filter((f) => f.endsWith('.md'));
  check('the request is a file in requests/', saved.length === 1 && readFileSync(join(dir, 'requests', saved[0]), 'utf8').includes('more visual'));
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('and the instruction is on the clipboard', clip.includes('quorum requests'));
  await page.click('.dialog .actions .ghost:last-child');
  // the Team tab shows the queue, and follows the agent as it claims and closes the request
  await tab('team');
  check('the Team tab lists the request as open', await until(async () => /open/.test(await page.textContent('[data-side] .req')) && (await page.textContent('[data-side] .req')).includes('more visual')));
  const reqs = await import('../../src/cli/requests.js');
  const reqId = saved[0].slice(0, -3);
  reqs.claimRequest(dir, reqId, { by: 'claude' });
  check('a claim by the agent shows as working', await until(async () => (await page.textContent('[data-side] .req')).includes('working: claude'), 12000));
  reqs.doneRequest(dir, reqId, { note: 'three alternatives saved' });
  check('closing it shows the note', await until(async () => (await page.textContent('[data-side] .req')).includes('three alternatives saved'), 12000));
  check('Sync says this folder is not a repository', (await page.textContent('[data-side]')).includes('not a git repository'));
  await tab('alternatives');
  // the agent answers by writing a variant file
  const variant = join(dir, 'variants', 'one-loaf-step-by-step');
  cpSync(join(ROOT, 'templates', 'starter', 'talk.md'), join(dir, 'unused.md'));
  await import('node:fs').then(({ mkdirSync }) => mkdirSync(variant, { recursive: true }));
  writeFileSync(join(variant, '001-big.md'), '<!-- variant: by=claude; direction=one big number -->\n\n<!-- layout: big-number -->\n\n## 4 steps\n\nfrom flour to bread\n');
  check('a variant written by the agent appears in Studio', await until(async () => (await page.textContent('[data-side]')).includes('one big number'), 12000));
  await page.locator('.alt', { hasText: 'one big number' }).locator('button', { hasText: 'Use this' }).click();
  check('using it replaces the slide', await until(() => file().includes('<!-- layout: big-number -->\n\n## 4 steps')));
  check('and removes its file', await until(() => !existsSync(join(variant, '001-big.md'))));
  check('undo puts it back', await undoAll());

  // --- theme ---------------------------------------------------------------------------------------------
  await tab('theme');
  await page.locator('.preset', { hasText: 'paper' }).click();
  check('choosing a theme sets it in the front matter', await until(() => /^theme: paper$/m.test(file())));
  check('undo puts it back', await undoAll());

  // --- problems ---------------------------------------------------------------------------------------------
  writeFileSync(join(dir, 'talk.md'), original.replace('## Four ingredients {#title}', '## Four ingredients {#title .nonsense}'));
  check('a problem made outside Studio shows up in the bar', await until(async () => (await page.textContent('[data-act="problems"]')).includes('Problems'), 10000));
  await page.click('[data-act="problems"]');
  check('the problems list says which slide', await until(async () => (await page.textContent('.dialog')).includes('nonsense')));
  await page.locator('.problem button').first().click();
  check('and goes there', await until(async () => (await page.getAttribute('.slide[aria-current="true"] iframe', 'title')).includes('Four ingredients')));
  writeFileSync(join(dir, 'talk.md'), original);
  await until(async () => (await page.textContent('[data-act="problems"]')).includes('Checks'), 10000);

  // --- present ---------------------------------------------------------------------------------------------
  await page.click('[data-act="present"]');
  await page.waitForSelector('.dialog');
  check('presenting a talk with questions asks how people join', (await page.textContent('.dialog')).includes('This network only'));
  await page.locator('label.option', { hasText: 'This network only' }).click();
  await page.locator('.dialog button', { hasText: 'Start' }).click();
  check('the talk goes live', await until(() => page.isVisible('[data-live]')));
  const live = await page.evaluate(() => window.studio.S.live);
  const status = live && live.present ? await new Promise((done) => {
    const u = new URL(live.present);
    request({ host: 'localhost', port: u.port, path: `/api/talk?key=${u.searchParams.get('key')}` }, (res) => { res.resume(); done(res.statusCode); }).end();
  }) : 0;
  check('a live server for the audience answers', status === 200, JSON.stringify(live));
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-live] button', { hasText: 'Stop' }).click();
  check('stop ends it', await until(async () => !(await page.isVisible('[data-live]'))));

  // --- export ---------------------------------------------------------------------------------------------------
  await page.click('[data-act="export"]');
  await page.locator('label.option', { hasText: 'PDF' }).first().click();
  await page.locator('.dialog button', { hasText: 'Export' }).click();
  check('export shows its progress, then the result', await until(async () => (await page.textContent('[data-modal-title]')) === 'Exported', 120000));
  check('and the file is in export/', existsSync(join(dir, 'export', 'why-bread-rises.pdf')));
} finally {
  check('no key, no answer', (await http('/api/studio/state')) === 403);
  check('a wrong key gets nothing', (await http('/api/studio/state?key=nope')) === 403);
  check('a request for another host is refused', (await http('/api/studio/state?key=k', { host: 'evil.example' })) === 403);
  check('so is one from another website', (await http('/api/studio/state?key=k', { origin: 'https://evil.example' })) === 403);
  check('with the key and this computer it answers', (await http('/api/studio/state?key=k')) === 200);
  check('no errors in the page', errors.length === 0, errors.join(' | '));
  await browser.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
