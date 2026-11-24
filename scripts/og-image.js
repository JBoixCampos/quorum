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
  @font-face { font-family: 'Space Grotesk'; src: url('${font('SpaceGrotesk-Bold.woff2')}'); font-weight: 700; }
  @font-face { font-family: 'Inter'; src: url('${font('Inter-Medium.woff')}'); font-weight: 500; }
  html, body { margin: 0; }
  body {
    position: relative; width: 1200px; height: 630px; overflow: hidden;
    background: #f4f2ec; color: #222522; font-family: 'Inter', sans-serif;
  }
  .rule { position: absolute; left: 72px; right: 72px; top: 64px; height: 3px; background: #222522; }
  .brand { position: absolute; left: 72px; top: 92px; display: inline-flex; align-items: center; gap: 14px; font: 700 36px/1 'Space Grotesk', sans-serif; letter-spacing: -0.03em; }
  .brand svg { width: 46px; height: 46px; }
  h1 { position: absolute; left: 72px; top: 200px; width: 1100px; margin: 0; font: 700 74px/1.04 'Space Grotesk', sans-serif; letter-spacing: -0.05em; }
  h1 span { display: block; color: #e25536; }
  .dots { position: absolute; left: 72px; bottom: 56px; display: flex; gap: 14px; }
  .dots i { width: 22px; height: 22px; border-radius: 50%; background: #222522; }
  .dots i.b { background: #e25536; }
  .dots i.c { background: #69796a; }
  p { position: absolute; right: 72px; top: 104px; margin: 0; font: 500 26px/1 'Inter', sans-serif; color: #5f635c; }
</style>
</head>
<body>
  <div class="rule"></div>
  <div class="brand">${logo}Quorum</div>
  <h1>Make a talk with your AI agent. <span>The room joins in.</span></h1>
  <div class="dots"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="c"></i><i class="c"></i><i class="c"></i><i class="c"></i><i class="c"></i></div>
  <p>Open source. Agent ready.</p>
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
