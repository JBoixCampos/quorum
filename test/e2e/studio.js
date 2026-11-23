// End-to-end test of Quorum Studio: drives the real editor in a headless
// browser and checks what each action wrote to the talk's files.
// Needs Playwright.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const base = `http://localhost:${server.port}`;
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/studio?key=k`);
  await page.waitForFunction(() => document.querySelectorAll('.s-slide').length === 21, null, { timeout: 15000 });
  const canvas = page.frameLocator('[data-frame]');
  const titles = () => page.$$eval('.s-slide .t', (n) => n.map((x) => x.textContent));
  const status = () => page.textContent('[data-status]');
  const goTo = async (n) => {
    await page.locator('.s-slide').nth(n).click();
    await page.waitForTimeout(500);
  };

  check('the rail shows every slide with a picture of it', (await page.$$('.s-thumb iframe')).length === 21);
  check('no warnings on the showcase talk', await page.isHidden('[data-act="warnings"]'));
  check('the canvas draws the real slide', await until(async () => (await canvas.locator('[data-slide] h1').count()) > 0));

  // --- select, edit text, classes ---------------------------------------------
  await goTo(3);
  await canvas.locator('.q-card h3').first().waitFor();
  await canvas.locator('.q-card h3').first().click();
  check('clicking selects, and the Element tab opens', await until(async () => (await page.getAttribute('[data-tab="element"]', 'aria-selected')) === 'true'));
  check('the selection is drawn on the slide', (await canvas.locator('.qs-box').count()) === 1);
  await canvas.locator('.q-card h3').first().dblclick();
  check('double click opens the text editor', await page.isVisible('[data-editor]'));
  check('the editor holds the Markdown of that line', (await page.inputValue('[data-editor-text]')).startsWith('### Flour'));
  await page.fill('[data-editor-text]', '### Plain flour {icon=wheat}');
  await page.keyboard.press('Control+Enter');
  check('saving writes the line to talk.md', await until(() => file().includes('### Plain flour {icon=wheat}')));
  check('the slide is drawn again with the change', await until(async () => (await canvas.locator('.q-card h3').first().textContent()).includes('Plain flour')));

  await canvas.locator('.q-card p').first().click();
  await page.waitForTimeout(400);
  await page.locator('.s-chip', { hasText: /^muted$/ }).click();
  check('a style chip adds a class to that line', await until(() => /Proteins that become gluten\. \{\.muted\}/.test(file())));
  await page.locator('.s-chip[aria-pressed="true"]', { hasText: /^muted$/ }).waitFor();
  await page.locator('.s-chip', { hasText: /^muted$/ }).click();
  check('and the chip again removes it', await until(() => !file().includes('{.muted}')));

  // --- undo ----------------------------------------------------------------------
  const undone = [];
  for (let i = 0; i < 3; i += 1) {
    await page.click('[data-act="undo"]');
    await page.waitForTimeout(300);
    undone.push(file() === original);
  }
  check('undo puts the file back, step by step', undone[2] === true, JSON.stringify(undone));
  await page.click('[data-act="redo"]');
  check('redo does it again', await until(() => file().includes('Plain flour')));
  await page.click('[data-act="undo"]');
  await until(() => file() === original);

  // --- drag a card to the end ---------------------------------------------------
  await goTo(3);
  await canvas.locator('.q-card').first().waitFor();
  const first = await canvas.locator('.q-card').first().boundingBox();
  const last = await canvas.locator('.q-card').last().boundingBox();
  // Shift selects the whole card instead of the text under the pointer.
  await page.keyboard.down('Shift');
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.keyboard.up('Shift');
  await page.mouse.move(last.x + last.width / 2 + 30, last.y + last.height / 2, { steps: 12 });
  await page.mouse.up();
  check('dragging a card reorders it in the Markdown', await until(() => /::: cards \{\.steps\}\n### Water/.test(file()) && /### Flour \{icon=wheat\}\nProteins that become gluten\.\n:::/.test(file())), file().slice(file().indexOf('::: cards'), file().indexOf('::: cards') + 200));
  await page.click('[data-act="undo"]');
  await until(() => file() === original);

  // --- reorder slides in the rail ----------------------------------------------------
  const before = await titles();
  const target = page.locator('.s-slide').nth(3);
  const targetBox = await target.boundingBox();
  await page.locator('.s-slide').nth(1).dragTo(target, { targetPosition: { x: 60, y: targetBox.height - 8 } });
  check('dragging a slide in the rail moves it in the file', await until(async () => (await titles())[3] === before[1]), JSON.stringify((await titles()).slice(0, 5)));
  await page.click('[data-act="undo"]');
  await until(async () => (await titles()).join() === before.join());
  check('and undo puts it back', (await titles()).join() === before.join());

  // --- add a slide ---------------------------------------------------------------------
  await goTo(0);
  await page.click('[data-act="add"]');
  await page.locator('.s-menu button', { hasText: 'Chart' }).click();
  check('adding a slide from a template inserts it after the current one', await until(async () => (await titles()).length === 22 && (await titles())[1] === 'Where the time goes'));
  check('and the new slide is selected', (await page.getAttribute('.s-slide:nth-child(2)', 'aria-current')) === 'true');
  await page.click('[data-act="undo"]');
  await until(async () => (await titles()).length === 21);

  // --- remix -------------------------------------------------------------------------------
  const loaf = (await titles()).indexOf('One loaf, step by step');
  await goTo(loaf);
  await page.click('[data-act="remix"]');
  await page.waitForSelector('.s-option');
  const options = await page.$$eval('.s-option b', (n) => n.map((x) => x.textContent));
  check('remix shows the slide and other layouts', options.length >= 5 && options[0].includes('current'), options.join(', '));
  await page.locator('.s-option', { hasText: 'cards' }).first().locator('button', { hasText: 'Use this' }).click();
  check('using an option rewrites the slide', await until(() => /::: cards\n### Mix\nflour, water, yeast, salt/.test(file())));
  await page.click('[data-act="undo"]');
  await until(() => file() === original);

  // --- the talk tab ----------------------------------------------------------------------------
  await page.click('[data-tab="talk"]');
  await page.locator('.s-preset', { hasText: 'paper' }).click();
  check('choosing a theme sets it in the front matter', await until(() => /^theme: paper$/m.test(file())));
  await page.click('[data-act="undo"]');
  await until(() => file() === original);

  // --- the canvas layout ----------------------------------------------------------------------------
  await goTo(0);
  await page.click('[data-act="add"]');
  await page.locator('.s-menu button', { hasText: 'Canvas' }).click();
  await until(async () => (await titles()).length === 22);
  await page.waitForTimeout(600);
  const heading = canvas.locator('[data-slide] h2').first();
  await heading.waitFor();
  const box = await heading.boundingBox();
  await heading.click();
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 90, { steps: 10 });
  await page.mouse.up();
  check('dragging on a canvas slide sets x and y', await until(() => /## Place things anywhere \{x=(\d+(\.\d)?) y=(\d+(\.\d)?) w=70 h=14\}/.test(file()) && !file().includes('{x=6 y=6 w=70 h=14}')), file().slice(-300));
  // The handles are drawn again after each change: wait until they hold still.
  let handle = null;
  await until(async () => {
    const a = await canvas.locator('.qs-handle[data-handle="se"]').boundingBox();
    await new Promise((r) => { setTimeout(r, 250); });
    const b = await canvas.locator('.qs-handle[data-handle="se"]').boundingBox();
    handle = b;
    return a && b && a.x === b.x && a.y === b.y;
  });
  await page.mouse.move(handle.x + 6, handle.y + 6);
  await page.mouse.down();
  await page.mouse.move(handle.x + 106, handle.y + 46, { steps: 8 });
  await page.mouse.up();
  check('and a handle changes w and h', await until(() => !/w=70 h=14\}/.test(file().split('## Place things anywhere')[1].split('\n')[0])));

  // --- drop a picture ----------------------------------------------------------------------------
  const frame = await (await page.locator('[data-frame]').elementHandle()).contentFrame();
  await frame.evaluate(() => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255, 255, 63, 0, 5, 254, 2, 254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
    const data = new DataTransfer();
    data.items.add(new File([png], 'warm loaf.png', { type: 'image/png' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
  });
  check('dropping a picture saves it in images/', await until(() => existsSync(join(dir, 'images', 'warm-loaf.png'))));
  check('and puts it on the slide, at the drop point', await until(() => /!\[warm loaf\]\(images\/warm-loaf\.png\)\{x=\d+ y=\d+ w=30 h=30\}/.test(file())), file().slice(-200));
  check('the picture shows on the canvas', await until(async () => (await canvas.locator('figure.q-positioned img').count()) === 1));

  // --- a change made outside the studio ----------------------------------------------------------------
  writeFileSync(join(dir, 'talk.md'), file().replace('# Why bread rises {#title}', '# Why bread rises, changed {#title}'));
  check('a change on disk shows up without reloading', await until(async () => (await titles())[0] === 'Why bread rises, changed', 10000));
} finally {
  // the studio only answers this computer, with the key
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
