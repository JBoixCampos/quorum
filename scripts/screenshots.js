// Takes the screenshots in docs/images/: what the room sees (the shared
// screen), what the speaker sees (the panel) and what a phone sees, all
// during the same poll of the showcase talk, the same kind of poll in a talk
// with a brand of its own (examples/brand), and one slide of
// examples/showcase in each theme (themes.png). Needs Playwright:
//
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/screenshots.js

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../src/server/server.js';
import { PRESETS } from '../src/shared/design.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'images');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const POLL = 5; // "What makes the holes in bread?" in examples/showcase/talk.md
const VOTES = { 'Air you knead in': 7, 'Gas from the yeast': 11, 'Steam from the water': 5 };
const wait = (ms) => new Promise((done) => { setTimeout(done, ms); });

const dir = mkdtempSync(join(tmpdir(), 'quorum-shots-'));
cpSync(join(ROOT, 'examples', 'showcase'), dir, { recursive: true });
// SHOT_THEME=editorial node scripts/...: the same talk in another preset.
if (process.env.SHOT_THEME) {
  const file = join(dir, 'talk.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^theme: .*$/m, `theme: ${process.env.SHOT_THEME}`));
}
const server = await startServer({ talkDir: dir, port: 0, key: 'example', log: () => {} });
const base = `http://localhost:${server.port}`;
server.setPublicUrl('https://your-talk.trycloudflare.com');

// Phones in the room, as plain requests.
const phone = (n) => `screenshot-phone-${String(n).padStart(3, '0')}`;
const act = (device, action) => fetch(`${base}/api/action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ device, action }),
});
const presenter = (action) => fetch(`${base}/api/action?key=example`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action }),
});

const browser = await chromium.launch();
try {
  mkdirSync(OUT, { recursive: true });
  const present = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await present.goto(`${base}/present?key=example`);
  const panel = await browser.newPage({ viewport: { width: 1600, height: 820 } });
  // The example link is not real: answer the panel's check of it.
  await panel.route('https://your-talk.trycloudflare.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: true, connected: 24 }),
  }));
  await panel.goto(`${base}/panel?key=example`);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 600 }, deviceScaleFactor: 2 });
  await mobile.goto(`${base}/`);

  await presenter({ type: 'stage', slide: POLL, step: 0 });
  await presenter({ type: 'control', id: 'guess', action: 'phase', phase: 1 });
  let n = 0;
  for (const [option, count] of Object.entries(VOTES)) {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      await act(phone(n), { type: 'vote', id: 'guess', value: option });
    }
  }
  await act(phone(1), { type: 'ask', text: 'Does this work without internet?' });
  await act(phone(2), { type: 'ask', text: 'Can I use my own slides and colours?' });
  await wait(2500);
  // The thumbnails load on their own: wait until "Next" shows the next slide.
  await panel.waitForFunction(() => {
    const frame = document.querySelector('[data-thumb="1"] iframe');
    const doc = frame && frame.contentDocument;
    return doc && doc.querySelector('.q-slide') && doc.querySelector('.q-slide').textContent.includes('A little history');
  }, null, { timeout: 15000 });
  await wait(500);

  await present.screenshot({ path: join(OUT, 'screen.png') });
  await panel.screenshot({ path: join(OUT, 'panel.png') });
  await mobile.screenshot({ path: join(OUT, 'phone.png') });
  // A branded talk: examples/brand, on its poll.
  const brandDir = mkdtempSync(join(tmpdir(), 'quorum-shots-'));
  cpSync(join(ROOT, 'examples', 'brand'), brandDir, { recursive: true });
  const brand = await startServer({ talkDir: brandDir, port: 0, key: 'example', log: () => {} });
  try {
    const brandBase = `http://localhost:${brand.port}`;
    brand.setPublicUrl('https://your-talk.trycloudflare.com');
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(`${brandBase}/present?key=example`);
    const call = (action, device) => fetch(`${brandBase}/api/action${device ? '' : '?key=example'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(device ? { device, action } : { action }),
    });
    await call({ type: 'stage', slide: 2, step: 0 });
    await call({ type: 'control', id: 'next', action: 'phase', phase: 1 });
    const brandVotes = { 'Faster search': 6, 'The mobile app': 13, 'Simpler billing': 9 };
    let m = 0;
    for (const [option, count] of Object.entries(brandVotes)) {
      for (let i = 0; i < count; i += 1) {
        m += 1;
        await call({ type: 'vote', id: 'next', value: option }, phone(m));
      }
    }
    await call({ type: 'control', id: 'next', action: 'phase', phase: 2 });
    await wait(2000);
    await page.screenshot({ path: join(OUT, 'brand.png') });
  } finally {
    await brand.close();
    rmSync(brandDir, { recursive: true, force: true });
  }
  // The same slide of the showcase in every theme, as one image.
  const THEME_SLIDE = 3; // "Four ingredients": cards with icons
  const shots = [];
  for (const name of Object.keys(PRESETS)) {
    const themeDir = mkdtempSync(join(tmpdir(), 'quorum-shots-'));
    cpSync(join(ROOT, 'examples', 'showcase'), themeDir, { recursive: true });
    const talkFile = join(themeDir, 'talk.md');
    writeFileSync(talkFile, readFileSync(talkFile, 'utf8').replace(/^theme: .*$/m, `theme: ${name}`));
    const preview = await startServer({ talkDir: themeDir, port: 0, preview: true, log: () => {} });
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      await page.goto(`http://localhost:${preview.port}/present?preview=1&slide=${THEME_SLIDE}`);
      await page.addStyleTag({ content: '.q-preview-bar, .q-reactions { display: none !important; }' });
      await page.waitForFunction(() => document.querySelector('.q-content'));
      await page.evaluate((i) => window.quorum.go(i, 9), THEME_SLIDE);
      await wait(1500);
      shots.push({ name, data: (await page.screenshot()).toString('base64') });
      await page.close();
    } finally {
      await preview.close();
      rmSync(themeDir, { recursive: true, force: true });
    }
  }
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 500 } });
  await sheet.setContent(`<style>body{margin:0;padding:12px;background:#e9e6e1;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;font:600 15px system-ui;color:#333}figure{margin:0}img{width:100%;display:block;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.15)}figcaption{padding:6px 2px 0}</style>
    ${shots.map((x) => `<figure><img src="data:image/png;base64,${x.data}"><figcaption>${x.name}</figcaption></figure>`).join('')}`);
  await sheet.screenshot({ path: join(OUT, 'themes.png'), fullPage: true });
  console.log(`Screenshots saved in ${OUT}`);
} finally {
  await browser.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
}
