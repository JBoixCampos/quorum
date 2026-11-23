// Looks at a talk in a real browser: measures whether each slide fits
// (`quorum check --visual`) and takes a picture of each one, plus a contact
// sheet of the whole talk (`quorum snapshot`). Interactions are played with
// the simulated audience, so their results are measured and pictured too.
//
// Needs Playwright, which Quorum does not depend on. When it is missing,
// the functions return { available: false } and the commands say how to
// install it.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server/server.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INSTALL_PLAYWRIGHT = 'npm install --no-save playwright && npx playwright install chromium';

// Playwright from the current folder, from Quorum's folder or global.
export function loadPlaywright() {
  const places = [join(process.cwd(), 'noop.js'), join(ROOT, 'noop.js')];
  try {
    places.push(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 'noop.js'));
  } catch {
    // npm is not on the PATH: try the other places.
  }
  for (const place of places) {
    try {
      return createRequire(place)('playwright').chromium;
    } catch {
      // not here
    }
  }
  return null;
}

const wait = (ms) => new Promise((done) => { setTimeout(done, ms); });

// How far the content of the slide on screen goes past its space, in stage
// pixels (the stage is 1920 x 1080).
function measure() {
  const content = document.querySelector('[data-slide] .q-content');
  if (!content) return { y: 0, x: 0 };
  return {
    y: Math.max(0, content.scrollHeight - content.clientHeight),
    x: Math.max(0, content.scrollWidth - content.clientWidth),
  };
}

// Presses the main button of the interaction on screen; false when there
// is none left (results shown, or no interaction).
function pressMain() {
  const b = [...document.querySelectorAll('[data-slide] [data-do]')].find((x) => !x.hidden && x.classList.contains('main'));
  if (!b) return false;
  b.click();
  return true;
}

// Renders a talk. Options: file, out (a folder for pictures, or null to
// only measure), results (play interactions), width (pictures' width).
export async function renderTalk(dir, { file = 'talk.md', out = null, results = true, width = 1280, onSlide = () => {} } = {}) {
  const chromium = loadPlaywright();
  if (!chromium) return { available: false };
  const server = await startServer({ talkDir: dir, file, port: 0, preview: true, log: () => {} });
  const browser = await chromium.launch();
  const report = { available: true, slides: [], pictures: [], contact: null, errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width, height: Math.round((width * 9) / 16) } });
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(`http://localhost:${server.port}/present?preview=1`);
    await page.addStyleTag({ content: '.q-preview-bar, .q-reactions { display: none !important; }' });
    await page.waitForFunction(() => document.querySelector('[data-slide] .q-content'), null, { timeout: 15000 });
    await wait(1500);
    const talk = server.talk();
    if (out) mkdirSync(out, { recursive: true });
    for (const slide of talk.slides) {
      const n = String(slide.index + 1).padStart(2, '0');
      await page.evaluate(([i, step]) => window.quorum.go(i, step), [slide.index, slide.steps - 1]);
      await wait(800);
      const entry = { slide: slide.index + 1, title: slide.title, overflow: await page.evaluate(measure) };
      if (out) {
        const path = join(out, `slide-${n}.png`);
        await page.screenshot({ path });
        report.pictures.push(path);
      }
      if (results && slide.interaction && slide.interaction.kind !== 'questions') {
        // Open voting, give the simulated room time to answer, then close
        // and reveal.
        let presses = 0;
        while (presses < 4 && await page.evaluate(pressMain)) {
          presses += 1;
          await wait(presses === 1 ? 4500 : 1000);
        }
        const after = await page.evaluate(measure);
        entry.overflowResults = after;
        if (out) {
          const path = join(out, `slide-${n}-results.png`);
          await page.screenshot({ path });
          report.pictures.push(path);
        }
      }
      report.slides.push(entry);
      onSlide(entry);
    }
    if (out && report.pictures.length) {
      const cells = report.pictures.map((p) => `<figure><img src="data:image/png;base64,${readFileSync(p).toString('base64')}"><figcaption>${p.split('/').pop().replace('.png', '')}</figcaption></figure>`).join('');
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.setContent(`<style>body{margin:0;padding:16px;background:#202326;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;font:14px system-ui;color:#ccc}figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style>${cells}`);
      report.contact = join(out, 'contact.png');
      await page.screenshot({ path: report.contact, fullPage: true });
      writeFileSync(join(out, 'report.json'), JSON.stringify({ slides: report.slides, errors: report.errors }, null, 2));
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return report;
}

// Slides that do not fit, as check issues.
export function overflowIssues(report, tolerance = 8) {
  const issues = [];
  report.slides.forEach((s) => {
    const parts = [];
    if (s.overflow.y > tolerance) parts.push(`${s.overflow.y}px too tall`);
    if (s.overflow.x > tolerance) parts.push(`${s.overflow.x}px too wide`);
    if (parts.length) issues.push({ kind: 'overflow', slide: s.slide, message: `Slide ${s.slide} does not fit: ${parts.join(' and ')} (on a 1920 x 1080 screen). Cut text, split the slide or use a smaller layout.` });
    const r = s.overflowResults;
    if (r && (r.y > tolerance || r.x > tolerance)) {
      issues.push({ kind: 'overflow', slide: s.slide, message: `Slide ${s.slide} does not fit once its results are shown (${r.y}px too tall). Shorten the question, the options or the explanation.` });
    }
  });
  return issues;
}
