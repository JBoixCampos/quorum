// Draws site/og.png, the picture that WhatsApp, Slack, LinkedIn and others
// show when someone shares a link to the website. 1200 x 630, the size they
// all expect, with everything important in the middle so a square crop
// still reads. Needs Playwright:
//
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/og-image.js

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'og.png');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const font = (file) => pathToFileURL(join(ROOT, 'app', 'fonts', file)).href;
const logo = readFileSync(join(ROOT, 'app', 'favicon.svg'), 'utf8');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: 'Inter Display'; src: url('${font('InterDisplay-Bold.woff')}'); font-weight: 700; }
  @font-face { font-family: 'Inter'; src: url('${font('Inter-Medium.woff')}'); font-weight: 500; }
  html, body { margin: 0; }
  body {
    position: relative; width: 1200px; height: 630px; overflow: hidden;
    background: #0e0f11 radial-gradient(ellipse 70% 60% at 50% 0%, rgba(110, 92, 240, 0.35), transparent 70%);
    color: #ececef; font-family: 'Inter', sans-serif;
  }
  .text { position: absolute; left: 0; right: 0; top: 92px; text-align: center; }
  .brand { display: inline-flex; align-items: center; gap: 14px; font: 700 38px/1 'Inter Display', sans-serif; letter-spacing: -0.02em; }
  .brand svg { width: 50px; height: 50px; }
  h1 { margin: 44px auto 0; max-width: 1000px; font: 700 86px/1.02 'Inter Display', sans-serif; letter-spacing: -0.045em; }
  h1 span { color: #8b7bff; }
  p { margin: 30px 0 0; font: 500 28px/1.3 'Inter', sans-serif; color: #b5b8c0; }
</style>
</head>
<body>
  <div class="text">
    <div class="brand">${logo}Quorum</div>
    <h1>Your agent writes the talk. <span>You shape it.</span></h1>
    <p>Present it live, or export it to PowerPoint.</p>
  </div>
</body>
</html>`;

const dir = mkdtempSync(join(tmpdir(), 'quorum-og-'));
try {
  const file = join(dir, 'og.html');
  writeFileSync(file, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log(`Wrote ${OUT}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
