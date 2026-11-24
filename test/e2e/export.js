// End-to-end test of the PowerPoint and PDF export: exports a talk with every
// interaction (test/fixtures/every-feature, called "starter" below) and
// showcase talks with a headless browser, checks the files, and (when
// LibreOffice is installed) opens the PowerPoint file in it. Needs Playwright.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { exploreSlide } from '../../src/cli/explore.js';
import { exportTalk } from '../../src/cli/pptx/export.js';
import { unzip } from '../../src/cli/pptx/unzip.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
try {
  require('playwright');
} catch {
  console.log('Playwright is not installed: npm install --no-save playwright');
  process.exit(1);
}

const results = [];
function check(name, ok, detail = '') {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`);
}

const out = mkdtempSync(join(tmpdir(), 'quorum-export-'));
const has = (cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

try {
  const starter = await exportTalk(join(ROOT, 'test', 'fixtures', 'every-feature'), { out: join(out, 'starter.pptx') });
  check('starter: exports', starter.file && starter.slides === 13, JSON.stringify(starter).slice(0, 200));
  check('starter: no structural problems', starter.problems && starter.problems.length === 0, (starter.problems || []).join('; '));
  const files = unzip(readFileSync(join(out, 'starter.pptx')));
  const slide1 = files.get('ppt/slides/slide1.xml').toString();
  check('starter: titles are native text', /My talk/.test(slide1) && /<a:t>/.test(slide1));
  check('starter: speaker notes are kept', [...files.keys()].some((n) => n.startsWith('ppt/notesSlides/notesSlide')));

  const showcase = await exportTalk(join(ROOT, 'examples', 'showcase'), { out: join(out, 'showcase.pptx'), safeFonts: true });
  check('showcase: exports 21 slides', showcase.slides === 21);
  check('showcase: no structural problems', showcase.problems.length === 0, showcase.problems.join('; '));
  check('showcase: has an editable chart', showcase.charts >= 1);
  check('showcase: safe fonts leave nothing to install', showcase.needsFonts.length === 0, showcase.needsFonts.join(', '));
  const show = unzip(readFileSync(join(out, 'showcase.pptx')));
  const slideXml = [...show.entries()].filter(([n]) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(([, d]) => d.toString());
  check('showcase: backgrounds and the morph transition are written', slideXml.some((x) => /<p:bg>/.test(x)) && slideXml.some((x) => /p159:morph/.test(x)));
  check('showcase: step animations are written', [...show.entries()].some(([n, d]) => n.startsWith('ppt/slides/slide') && /<p:timing>/.test(d.toString())));

  const noAudience = await exportTalk(join(ROOT, 'test', 'fixtures', 'every-feature'), { out: join(out, 'plain.pptx'), audience: false });
  check('no-audience leaves out the interactive slides', noAudience.slides < 13 && noAudience.slides > 3, String(noAudience.slides));
  const needsVotes = await exportTalk(join(ROOT, 'test', 'fixtures', 'every-feature'), { out: join(out, 'r.pptx'), results: true });
  check('--results explains when there are no votes', /no votes/.test(needsVotes.error || ''));

  const pdf = await exportTalk(join(ROOT, 'test', 'fixtures', 'every-feature'), { out: join(out, 'starter.pdf'), pdf: true });
  const pdfText = readFileSync(join(out, 'starter.pdf')).toString('latin1');
  check('pdf: one page per slide', pdf.slides === 13 && /\/Count 13/.test(pdfText));

  const explored = await exploreSlide(join(ROOT, 'examples', 'showcase'), { slide: 'one-loaf-step-by-step', out: join(out, 'explore') });
  check('remix: shows the slide and at least four other layouts', explored.candidates.length >= 5 && explored.candidates[0].name === 'current', String(explored.candidates.length));
  check('remix: options are numbered from 1', explored.candidates.every((c, k) => c.number === k + 1));
  check('remix: writes one picture to choose from', explored.grid && readFileSync(explored.grid).length > 20000);
  check('remix: nothing fails to fit', explored.candidates.every((c) => !c.problems.some((p) => p.startsWith('does not fit'))), JSON.stringify(explored.candidates.map((c) => c.problems)));

  if (has('soffice')) {
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, join(out, 'showcase.pptx')], { stdio: 'ignore', timeout: 180000 });
    const converted = readFileSync(join(out, 'showcase.pdf')).toString('latin1');
    const pages = (converted.match(/\/Type\s*\/Page[^s]/g) || []).length;
    check('LibreOffice opens the showcase file and shows 21 pages', pages === 21, String(pages));
  } else {
    console.log('skip LibreOffice is not installed, so the file was not opened in an office program');
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
