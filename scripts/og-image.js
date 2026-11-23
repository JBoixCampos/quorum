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

// The auditorium from the landing page: seats on curved rows, most taken,
// below the text.
function hall() {
  const cx = 600;
  const cy = 900;
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const seats = [];
  for (let row = 0; row < 7; row += 1) {
    const r = 230 + row * 34;
    const spread = 0.95 + row * 0.025;
    const count = Math.round((r * spread * 2) / 25);
    for (let i = 0; i < count; i += 1) {
      const a = -Math.PI / 2 - spread + (2 * spread * i) / (count - 1);
      const taken = random() < 0.72;
      seats.push(`<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cy + r * Math.sin(a)).toFixed(1)}" r="8" fill="${taken ? '#ff6a00' : '#ddd6ca'}"/>`);
    }
  }
  return `<svg class="hall" viewBox="0 0 1200 630" aria-hidden="true">${seats.join('')}</svg>`;
}

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
    background: #f7f5f0 radial-gradient(circle, #e4ded3 1.6px, transparent 2px) 0 0 / 24px 24px;
    color: #16140f; font-family: 'Inter', sans-serif;
  }
  .hall { position: absolute; inset: 0; width: 1200px; height: 630px; }
  .text {
    position: absolute; left: 0; right: 0; top: 64px; text-align: center;
  }
  .brand { display: inline-flex; align-items: center; gap: 14px; font: 700 40px/1 'Inter Display', sans-serif; letter-spacing: -0.02em; }
  .brand svg { width: 52px; height: 52px; }
  h1 { margin: 34px 0 0; font: 700 96px/0.98 'Inter Display', sans-serif; letter-spacing: -0.045em; }
  h1 span { color: #ff6a00; }
  .ready {
    display: inline-block; margin-top: 22px; padding: 10px 22px 12px; border-radius: 14px;
    background: #16140f; color: #ece7dd;
    font: 600 34px/1 ui-monospace, 'DejaVu Sans Mono', monospace; letter-spacing: -0.02em;
    font-variant-ligatures: none;
  }
  .ready b { color: #7fdca4; font-weight: 600; }
</style>
</head>
<body>
  ${hall()}
  <div class="text">
    <div class="brand">${logo}Quorum</div>
    <h1>Presentations,<br><span>but interactive.</span></h1>
    <div class="ready"><b>&gt;</b> Agent ready</div>
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
