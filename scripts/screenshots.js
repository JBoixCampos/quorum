// Takes the screenshots in docs/images/: what the room sees (the shared
// screen), what the speaker sees (the panel) and what a phone sees, all
// during the same poll of the demo talk, and the same kind of poll in a
// talk with a brand of its own (examples/brand). Needs Playwright:
//
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/screenshots.js

import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../src/server/server.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'images');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const POLL = 1; // "Pineapple on pizza?" in examples/demo/talk.md
const VOTES = { 'Yes, always': 7, 'Only if nobody is watching': 11, Never: 5 };
const wait = (ms) => new Promise((done) => { setTimeout(done, ms); });

const dir = mkdtempSync(join(tmpdir(), 'quorum-shots-'));
cpSync(join(ROOT, 'examples', 'demo'), dir, { recursive: true });
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
  await presenter({ type: 'control', id: 'warmup', action: 'phase', phase: 1 });
  let n = 0;
  for (const [option, count] of Object.entries(VOTES)) {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      await act(phone(n), { type: 'vote', id: 'warmup', value: option });
    }
  }
  await act(phone(1), { type: 'ask', text: 'Does this work without internet?' });
  await act(phone(2), { type: 'ask', text: 'Can I use my own slides and colours?' });
  await wait(2500);
  // The thumbnails load on their own: wait until "Next" shows the next slide.
  await panel.waitForFunction(() => {
    const frame = document.querySelector('[data-thumb="1"] iframe');
    const doc = frame && frame.contentDocument;
    return doc && doc.querySelector('.q-slide') && doc.querySelector('.q-slide').textContent.includes('One word');
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
  console.log(`Screenshots saved in ${OUT}`);
} finally {
  await browser.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
}
