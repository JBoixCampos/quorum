// `quorum remix <slide>` (also `quorum explore --slide`): other layouts for
// one slide, rendered for real in the talk and shown on one picture, numbered,
// for a person to look at and choose. There is no score: the only thing
// flagged is a real problem (the slide does not fit, or the checks complain).
// `quorum explore --themes` shows the first slides of the talk in several
// themes. Needs Playwright.

import {
  cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PRESETS } from '../shared/design.js';
import { escapeHtml as esc } from '../shared/text.js';
import { checkTalk } from './check.js';
import { assemble, readTalk } from './load.js';
import { cut, findSlide, slideText } from './repo.js';
import { remix } from './remix.js';
import { listVariants } from './variants.js';
import { openRenderer } from './visual.js';

const SKIP = /(^|\/)(node_modules|\.git|dist|export|\.quorum-snapshots|\.quorum|variants|\.github)(\/|$)/;

// A copy of the talk folder to render in, with talk.md as one file.
function scratchOf(dir, file, transform) {
  const tmp = mkdtempSync(join(tmpdir(), 'quorum-explore-'));
  cpSync(dir, tmp, { recursive: true, filter: (src) => !SKIP.test(src.slice(dir.length)) });
  const parts = assemble(dir, file);
  const text = transform(parts.source);
  const { head, slides } = cut(text);
  const front = head.filter((l) => !/^\s*(slides|order)\s*:/.test(l));
  rmSync(join(tmp, 'slides'), { recursive: true, force: true });
  writeFileSync(join(tmp, 'talk.md'), `${front.length ? `${front.join('\n')}\n\n` : ''}${slides.map((s) => s.join('\n').trim()).join('\n\n---\n\n')}\n`);
  return tmp;
}

// Variants for one slide: stored files, then remixes.
export function candidatesFor(dir, file, talk, slide, { remixToo = true } = {}) {
  const current = slideText(dir, file, slide);
  const list = [{ name: 'current', source: 'current', by: '', direction: 'the slide as it is', text: current }];
  const seen = new Set([current.trim()]);
  const skipped = [];
  const add = (c) => {
    if (seen.has(c.text.trim())) return;
    if (cut(c.text).slides.length !== 1) { skipped.push(`${c.name}: more than one slide`); return; }
    seen.add(c.text.trim());
    list.push(c);
  };
  listVariants(dir, slide.id).forEach((v) => add({ name: v.name, source: 'variant', by: v.by, direction: v.direction, text: v.text }));
  let reason = '';
  if (remixToo) {
    const r = remix(current);
    reason = r.reason || '';
    r.variants.forEach((v) => add({ name: v.name, source: 'remix', by: 'quorum', direction: v.direction, text: v.text }));
  }
  return { list, skipped, reason };
}


// The options for one slide: the slide as it is, then variants kept in
// variants/, then Quorum's own remixes. Numbered from 1 in that order.
export function optionsFor(dir, file, slideRef, { remixToo = true } = {}) {
  const talk = readTalk(dir, file);
  const slide = findSlide(talk, slideRef);
  return { talk, slide, ...candidatesFor(dir, file, talk, slide, { remixToo }) };
}

// Shows one slide in each of its options. Options: file, slide (id or
// number), remix (default true), out (folder for the pictures).
export async function exploreSlide(dir, { file = 'talk.md', slide: ref, remix: remixToo = true, out } = {}) {
  const { slide, list, skipped, reason } = optionsFor(dir, file, ref, { remixToo });
  if (list.length < 2) return { available: true, slide: { id: slide.id, title: slide.title }, candidates: [], skipped, reason: reason || 'No other layouts to try. Add some with `quorum variant add`.' };

  // A deck with the current slide followed by every option, so each is
  // drawn in the talk's own theme, with the slides around it.
  const at = slide.lines;
  const scratch = scratchOf(dir, file, (source) => {
    const lines = source.split('\n');
    const joined = list.map((c) => c.text.replace(/\n+$/, '')).join('\n\n---\n\n');
    lines.splice(at[0] - 1, at[1] - at[0] + 1, ...joined.split('\n'));
    return lines.join('\n');
  });
  let r = null;
  try {
    const checked = checkTalk(scratch, 'talk.md');
    r = await openRenderer(scratch, { file: 'talk.md' });
    if (!r) return { available: false };
    if (out) mkdirSync(out, { recursive: true });
    for (let k = 0; k < list.length; k += 1) {
      const index = slide.index + k;
      await r.show(index);
      const overflow = await r.measure();
      const c = list[k];
      c.number = k + 1;
      c.problems = checked.issues.filter((i) => i.slide === index + 1).map((i) => i.message.replace(/^Slide \d+[:,]?\s*/, ''));
      if (overflow.y > 8 || overflow.x > 8) c.problems.unshift(`does not fit (${overflow.y > 8 ? `${overflow.y}px too tall` : `${overflow.x}px too wide`})`);
      c.picture = (await r.page.screenshot()).toString('base64');
    }
    let grid = null;
    if (out) {
      const cells = list.map((c) => `<figure><img src="data:image/png;base64,${c.picture}"><figcaption><b>${c.number}. ${esc(c.name)}</b><br><small>${esc(c.source === 'current' ? 'the slide as it is' : c.direction)}${c.by && c.source === 'variant' ? ` (${esc(c.by)})` : ''}</small>${c.problems.length ? `<ul>${c.problems.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</figcaption></figure>`).join('');
      await r.page.setViewportSize({ width: 2000, height: 800 });
      await r.page.setContent(`<style>body{margin:0;padding:18px;background:#202326;font:18px system-ui;color:#ddd}h2{margin:0 0 14px;font-weight:600}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}figure{margin:0}img{width:100%;display:block;border-radius:8px}figcaption{padding:8px 2px}small{color:#9aa}ul{margin:6px 0 0;padding-left:20px;color:#e9b;font-size:15px}</style><h2>${esc(slide.title)}: ${list.length - 1} other layouts</h2><div class="g">${cells}</div>`);
      grid = join(out, 'options.png');
      await r.page.screenshot({ path: grid, fullPage: true });
      list.forEach((c) => writeFileSync(join(out, `${String(c.number).padStart(2, '0')}-${c.name.replace(/[^\w-]+/g, '-')}.png`), Buffer.from(c.picture, 'base64')));
    }
    return {
      available: true,
      slide: { id: slide.id, title: slide.title, index: slide.index },
      candidates: list.map(({ picture, ...rest }) => rest),
      skipped,
      grid,
      errors: r.errors,
    };
  } finally {
    if (r) await r.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

// The first slides of the talk in several themes.
export async function exploreThemes(dir, { file = 'talk.md', themes = null, count = 4, out } = {}) {
  const names = themes && themes.length ? themes : ['editorial', 'bold', 'midnight', 'paper'];
  const bad = names.filter((n) => !PRESETS[n] && !['light', 'dark'].includes(n));
  if (bad.length) throw new Error(`Not a theme: ${bad.join(', ')}. Use: ${Object.keys(PRESETS).join(', ')}.`);
  const rows = [];
  for (const name of names) {
    const scratch = scratchOf(dir, file, (source) => {
      const { head, slides } = cut(source);
      const front = head.filter((l) => !/^\s*(theme|preset)\s*:/.test(l)).slice(1, -1);
      const lines = ['---', `theme: ${name}`, ...front, '---', '', slides.map((s) => s.join('\n').trim()).join('\n\n---\n\n')];
      return lines.join('\n');
    });
    let r = null;
    try {
      const checked = checkTalk(scratch, 'talk.md');
      r = await openRenderer(scratch, { file: 'talk.md' });
      if (!r) return { available: false };
      const talk = r.talk();
      const pictures = [];
      for (let i = 0; i < Math.min(count, talk.slides.length); i += 1) {
        await r.show(i);
        pictures.push((await r.page.screenshot()).toString('base64'));
      }
      rows.push({ theme: name, warnings: checked.warnings.length, suggestions: checked.suggestions.length, pictures });
    } finally {
      if (r) await r.close();
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  let grid = null;
  if (out && rows.length) {
    mkdirSync(out, { recursive: true });
    const r = await openRenderer(dir, { file });
    try {
      const html = rows.map((row) => `<h3>${esc(row.theme)} <small>${row.warnings} warnings, ${row.suggestions} suggestions</small></h3><div class="g">${row.pictures.map((p) => `<img src="data:image/png;base64,${p}">`).join('')}</div>`).join('');
      await r.page.setViewportSize({ width: 2400, height: 800 });
      await r.page.setContent(`<style>body{margin:0;padding:18px;background:#202326;font:20px system-ui;color:#ddd}h3{margin:22px 0 10px;font-weight:600}small{color:#9aa;font-weight:400;margin-left:10px}.g{display:grid;grid-template-columns:repeat(${count},1fr);gap:14px}img{width:100%;display:block;border-radius:8px}</style>${html}`);
      grid = join(out, 'themes.png');
      await r.page.screenshot({ path: grid, fullPage: true });
    } finally {
      await r.close();
    }
  }
  return { available: true, themes: rows.map(({ pictures, ...rest }) => rest), grid };
}

