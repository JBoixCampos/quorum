// `quorum export --pptx` and `--pdf`: opens the talk in a browser, reads
// every slide (see extract.js) and writes the file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { hasVotes, openRenderer } from '../visual.js';
import { buildPptx, SAFE_FONTS } from './build.js';
import { extractStage } from './extract.js';
import { pdfFromJpegs } from './pdf.js';
import { placeholderItems } from './placeholder.js';
import { checkPptx } from './verify.js';

const STAGE_CSS = `
[data-qx-bgonly], [data-qx-bgonly] * { text-shadow: none !important; }
[data-qx-bgonly] * { visibility: hidden !important; }
[data-qx-stagebg] [data-slide] *, [data-qx-stagebg] .q-footer, [data-qx-stagebg] .q-logo,
[data-qx-stagebg] .q-corner-qr, [data-qx-stagebg] .q-reactions { visibility: hidden !important; }
*, *::before, *::after { animation: none !important; transition: none !important; }
[data-qx-np="::before"]::before, [data-qx-np="::after"]::after { display: none !important; }
[data-qx-raster] body, [data-qx-raster] .q-stage, [data-qx-raster] .q-slide { background: transparent !important; background-image: none !important; }
[data-qx-raster] .q-slide::before, [data-qx-raster] .q-slide::after, [data-qx-raster] .q-stage::before, [data-qx-raster] .q-stage::after { display: none !important; }
`;

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/gif': 'gif' };

async function fetchBytes(r, src) {
  const out = await r.evaluate(async (url) => {
    const res = await fetch(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { type: (res.headers.get('content-type') || '').split(';')[0], b64: btoa(text) };
  }, src);
  return { type: out.type, data: Buffer.from(out.b64, 'base64') };
}

async function shoot(r, item) {
  const locator = r.page.locator(`[data-qx="${item.id}"]`).first();
  if (await locator.count() === 0) return null;
  try {
    await r.page.evaluate(() => document.documentElement.setAttribute('data-qx-raster', ''));
    if (item.bgOnly) await locator.evaluate((el) => el.setAttribute('data-qx-bgonly', ''));
    const data = await locator.screenshot({ omitBackground: true, timeout: 3000 });
    if (item.bgOnly) await locator.evaluate((el) => el.removeAttribute('data-qx-bgonly'));
    return data;
  } catch {
    return null;
  } finally {
    await r.page.evaluate(() => document.documentElement.removeAttribute('data-qx-raster')).catch(() => {});
  }
}

// What the PowerPoint export needs from one slide, ready to write.
async function collect(r, slide, fallbacks, options) {
  const ex = await r.evaluate(extractStage, { placeholders: options.placeholders });
  const items = [];
  for (const item of ex.items) {
    if (item.type === 'placeholder') {
      items.push(...placeholderItems(item, slide.interaction, { colors: ex.colors, fonts: ex.fonts }));
    } else if (item.type === 'image') {
      const got = await fetchBytes(r, item.src).catch(() => null);
      const ext = got && EXT[got.type];
      if (ext) {
        items.push({ ...item, data: got.data, ext });
      } else {
        const data = await shoot(r, item);
        if (data) items.push({ type: 'raster', ...item, data });
        fallbacks.push(`Slide ${slide.index + 1}: a picture that PowerPoint cannot show (${got ? got.type : 'unreadable'}) became a PNG.`);
      }
    } else if (item.type === 'raster') {
      const data = await shoot(r, item);
      if (!data) continue;
      let svg = null;
      if (item.svgMarkup) svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${item.svgMarkup}`);
      else if (item.svgSrc) svg = await fetchBytes(r, item.svgSrc).then((x) => x.data).catch(() => null);
      items.push({ ...item, data, svg });
    } else {
      items.push(item);
    }
  }
  let image = null;
  if (ex.background.complex) {
    await r.page.evaluate(() => document.querySelector('[data-stage]').setAttribute('data-qx-stagebg', ''));
    const data = await r.page.locator('[data-stage]').screenshot({ type: 'jpeg', quality: 92 }).catch(() => null);
    await r.page.evaluate(() => document.querySelector('[data-stage]').removeAttribute('data-qx-stagebg'));
    if (data) image = { data, ext: 'jpeg' };
  }
  ex.report.forEach((m) => fallbacks.push(`Slide ${slide.index + 1}: ${m}.`));
  return { ex, items, image };
}

// Exports the talk. Options: file, out (path), pdf (a PDF instead),
// safeFonts, onSlide(n, total).
export async function exportTalk(dir, {
  file = 'talk.md', out, pdf = false, safeFonts = false, results = false, audience = true, onSlide = () => {},
} = {}) {
  if (results && !hasVotes(dir)) {
    return { available: true, error: 'There are no votes to show yet. Give the talk with `quorum live` first, or leave out --results.' };
  }
  const r = await openRenderer(dir, { file, width: 1920, scale: 2, live: results });
  if (!r) return { available: false };
  const fallbacks = [];
  try {
    await r.page.addStyleTag({ content: STAGE_CSS });
    const talk = r.talk();
    const chosen = talk.slides.filter((slide) => audience || !slide.interaction);
    const target = resolve(out);
    mkdirSync(dirname(target), { recursive: true });

    if (pdf) {
      const pages = [];
      for (const slide of chosen) {
        await r.show(slide.index);
        pages.push(await r.page.locator('[data-stage]').screenshot({ type: 'jpeg', quality: 92 }));
        onSlide(slide.index + 1, talk.slides.length);
      }
      writeFileSync(target, pdfFromJpegs(pages, talk.meta.title));
      return { available: true, file: target, slides: chosen.length, fallbacks, errors: r.errors };
    }

    const slides = [];
    let theme = null;
    for (const slide of chosen) {
      await r.show(slide.index);
      // Numbers that count up need a moment to arrive.
      if (slide.html.includes('data-count')) await new Promise((done) => { setTimeout(done, 2200); });
      const got = await collect(r, slide, fallbacks, { placeholders: !results });
      if (!theme) theme = got.ex;
      slides.push({
        items: got.items,
        background: { color: got.ex.background.color, gradient: got.ex.background.gradient, image: got.image },
        notes: slide.notes,
        transition: slide.transition || (talk.meta.tokens && talk.meta.tokens.transition) || 'none',
      });
      onSlide(slide.index + 1, talk.slides.length);
    }
    const built = buildPptx({
      title: talk.meta.title,
      author: talk.meta.author,
      lang: talk.meta.lang || 'en',
      colors: theme.colors,
      fonts: theme.fonts,
      safeFonts,
      slides,
    });
    const problems = checkPptx(built.buffer);
    writeFileSync(target, built.buffer);
    const needs = built.fonts.filter((f) => !SAFE_FONTS.includes(f));
    return {
      available: true, file: target, slides: slides.length, charts: built.charts, fonts: built.fonts, needsFonts: needs, fallbacks, problems, errors: r.errors,
    };
  } finally {
    await r.close();
  }
}
