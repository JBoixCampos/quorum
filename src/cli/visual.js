// Looks at a talk in a real browser: measures whether each slide fits
// (`quorum check --visual`) and takes a picture of each one, plus a contact
// sheet of the whole talk (`quorum snapshot`). Interactions are played with
// the simulated audience, so their results are measured and pictured too.
//
// Needs Playwright, which Quorum does not depend on. When it is missing,
// the functions return { available: false } and the commands say how to
// install it.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

// A browser looking at a talk with a simulated audience. One browser and
// one page stay open, so showing many slides is fast. Used by the checks,
// snapshots, the PowerPoint export, diffs and the variant grid.
//
// With `live`, the page shows the real votes saved in the talk's .quorum
// folder instead of a simulated audience. It works on a copy of the talk
// folder, so nothing in the real one changes.
export function hasVotes(dir) {
  const file = join(dir, '.quorum', 'state.json');
  if (!existsSync(file)) return false;
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    return Object.values(state.interactions || {}).some((i) => i && Object.keys(i.votes || {}).length > 0) || (state.questions || []).length > 0;
  } catch {
    return false;
  }
}

export async function openRenderer(dir, { file = 'talk.md', width = 1280, scale = 1, live = false } = {}) {
  const chromium = loadPlaywright();
  if (!chromium) return null;
  let scratch = null;
  let folder = dir;
  if (live) {
    scratch = mkdtempSync(join(tmpdir(), 'quorum-live-'));
    cpSync(dir, scratch, { recursive: true, filter: (src) => !/(^|\/)(node_modules|\.git|dist|export|\.quorum-snapshots)(\/|$)/.test(src.slice(dir.length)) });
    folder = scratch;
  }
  const server = await startServer({ talkDir: folder, file, port: 0, preview: !live, log: () => {} });
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width, height: Math.round((width * 9) / 16) }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${server.port}/present?${live ? `key=${encodeURIComponent(server.key)}` : 'preview=1'}`);
  await page.addStyleTag({ content: '.q-preview-bar, .q-reactions { display: none !important; }' });
  await page.waitForFunction(() => document.querySelector('[data-slide] .q-content'), null, { timeout: 15000 });
  await wait(1500);
  return {
    page,
    errors,
    talk: () => server.talk(),
    // Goes to a slide, at its last step (everything visible) unless told.
    async show(index, step = null) {
      const slide = server.talk().slides[index];
      await page.evaluate(([i, st]) => window.quorum.go(i, st), [index, step === null ? slide.steps - 1 : step]);
      await wait(800);
    },
    measure: () => page.evaluate(measure),
    // Presses the main button until the results are shown.
    async playResults() {
      let presses = 0;
      while (presses < 4 && await page.evaluate(pressMain)) {
        presses += 1;
        await wait(presses === 1 ? 4500 : 1000);
      }
      return presses;
    },
    picture: (path) => page.screenshot({ path }),
    // Runs a function in the page (it must not use variables from outside).
    evaluate: (fn, arg) => page.evaluate(fn, arg),
    async close() {
      await browser.close();
      await server.close();
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    },
  };
}

// Renders a talk. Options: file, out (a folder for pictures, or null to
// only measure), results (play interactions), width (pictures' width).
export async function renderTalk(dir, { file = 'talk.md', out = null, results = true, width = 1280, onSlide = () => {} } = {}) {
  const r = await openRenderer(dir, { file, width });
  if (!r) return { available: false };
  const report = { available: true, slides: [], pictures: [], contact: null, errors: r.errors };
  try {
    const { page } = r;
    const talk = r.talk();
    if (out) mkdirSync(out, { recursive: true });
    for (const slide of talk.slides) {
      const n = String(slide.index + 1).padStart(2, '0');
      await r.show(slide.index);
      const entry = { slide: slide.index + 1, id: slide.id, title: slide.title, overflow: await r.measure() };
      if (out) {
        const path = join(out, `slide-${n}.png`);
        await r.picture(path);
        report.pictures.push(path);
      }
      if (results && slide.interaction && slide.interaction.kind !== 'questions') {
        await r.playResults();
        entry.overflowResults = await r.measure();
        if (out) {
          const path = join(out, `slide-${n}-results.png`);
          await r.picture(path);
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
    await r.close();
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
