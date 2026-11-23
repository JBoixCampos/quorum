// Takes the screenshots of Studio and of a PowerPoint export for the
// website and the docs: studio.png (editing a slide), studio-insert.png
// (dragging in a poll), studio-alternatives.png (alternatives, one from an
// agent), studio-live.png (a talk being given) and pptx.png (the exported
// file, opened in LibreOffice, next to the slides). Needs Playwright, and
// LibreOffice with pdftoppm for pptx.png:
//
//   node scripts/screenshots-studio.js

import { execFileSync } from 'node:child_process';
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportTalk } from '../src/cli/pptx/export.js';
import { has } from '../src/cli/system.js';
import { startServer } from '../src/server/server.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'images');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const wait = (ms) => new Promise((done) => { setTimeout(done, ms); });

const dir = mkdtempSync(join(tmpdir(), 'quorum-studio-shots-'));
cpSync(join(ROOT, 'examples', 'showcase'), dir, { recursive: true });
const variants = join(dir, 'variants', 'one-loaf-step-by-step');
mkdirSync(variants, { recursive: true });
writeFileSync(join(variants, '001-one-big-number.md'), '<!-- variant: by=claude; direction=one big number -->\n\n<!-- layout: big-number -->\n\n## 4 steps\n\nfrom flour to bread, in about three and a half hours\n');
const server = await startServer({ talkDir: dir, port: 0, preview: true, studio: true, key: 'shots', log: () => {} });
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 920 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${server.port}/studio?key=shots&nowindows=1`);
  await page.waitForFunction(() => document.querySelectorAll('.slide').length > 10);
  await wait(2500);
  const canvas = page.frameLocator('[data-frame]');
  const go = async (title) => {
    const titles = await page.$$eval('.slide iframe', (n) => n.map((x) => x.title));
    await page.locator('.slide').nth(titles.findIndex((t) => t.includes(title))).click();
    await wait(1500);
  };

  await go('Four ingredients');
  await canvas.locator('.q-card').first().click({ modifiers: ['Shift'] });
  await wait(1200);
  await page.screenshot({ path: join(OUT, 'studio.png') });

  await go('Yeast eats sugar');
  await page.click('[data-tab="insert"]');
  await page.hover('.lib-item[data-item="poll"]');
  await wait(900);
  await page.screenshot({ path: join(OUT, 'studio-insert.png') });

  await go('One loaf');
  await page.click('[data-tab="alternatives"]');
  await wait(4000);
  await page.screenshot({ path: join(OUT, 'studio-alternatives.png') });

  await go('What makes the holes');
  await page.click('[data-act="present"]');
  await page.locator('label.option', { hasText: 'This network only' }).click();
  await page.locator('.dialog button', { hasText: 'Start' }).click();
  await page.waitForSelector('[data-live]:not([hidden])');
  await wait(2500);
  await page.screenshot({ path: join(OUT, 'studio-live.png') });
  await page.evaluate(() => fetch('/api/studio/live?key=shots', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"stop"}' }));

  // The PowerPoint file, opened in LibreOffice, next to the slides.
  if (has('soffice') && has('pdftoppm')) {
    const out = join(dir, 'export');
    mkdirSync(out, { recursive: true });
    await exportTalk(join(ROOT, 'examples', 'showcase'), { out: join(out, 'talk.pptx') });
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, join(out, 'talk.pptx')], { stdio: 'ignore', timeout: 180000 });
    const picks = [4, 13, 14];
    picks.forEach((n) => execFileSync('pdftoppm', ['-r', '90', '-f', String(n), '-l', String(n), '-png', '-singlefile', join(out, 'talk.pdf'), join(out, `p${n}`)]));
    const img = (n) => `data:image/png;base64,${readFileSync(join(out, `p${n}.png`)).toString('base64')}`;
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 400 }, deviceScaleFactor: 1 });
    await sheet.setContent(`<style>body{margin:0;padding:18px;background:#e9e6e1;font:600 15px system-ui;color:#333}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}img{width:100%;display:block;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.18)}p{margin:12px 2px 0;font-weight:500;color:#555}</style>
      <div class="g">${picks.map((n) => `<div><img src="${img(n)}"><p>Slide ${n}, in PowerPoint format</p></div>`).join('')}</div>`);
    await sheet.screenshot({ path: join(OUT, 'pptx.png'), fullPage: true });
  } else {
    console.log('LibreOffice or pdftoppm is not installed: pptx.png was not taken.');
  }
  console.log(`Screenshots saved in ${OUT}`);
} finally {
  await browser.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
}
