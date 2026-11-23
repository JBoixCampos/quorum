// Design checks for `quorum check`: things that make a talk hard to read
// or dull to watch. Problems (low contrast) become warnings; advice (too
// many words, ten slides that look the same) becomes suggestions, which do
// not fail the check.
//
// Without a browser, whether a slide fits is estimated from its text. With
// `quorum check --visual` (Playwright) it is measured (see visual.js).

import { contrast } from '../shared/color.js';

const DEFAULTS = {
  light: { background: '#fbfaf8', text: '#16181a' },
  dark: { background: '#111315', text: '#f3f1ee' },
};

const plainText = (html) => html
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const words = (html) => (plainText(html).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

// Roughly how tall a slide's content is, in stage pixels (1080 high), from
// its text: the size of each kind of element times the lines it needs.
// Blocks whose items sit side by side: removed from the text estimate and
// counted as one row each.
const ROW_BLOCKS = {
  'q-cards': 400, 'q-kpis': 240, 'q-timeline': 280, 'q-process': 280, 'q-compare': 340, 'q-columns': 0,
};

function takeBlocks(html) {
  let out = html;
  let extra = 0;
  for (;;) {
    const m = out.match(/<(div|ol|figure)[^>]*class="(q-cards|q-kpis|q-timeline|q-process|q-compare)[^"]*"[^>]*>/);
    if (!m) break;
    // Find the matching closing tag.
    const tag = m[1];
    const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
    re.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = out.length;
    let x;
    while ((x = re.exec(out))) {
      depth += x[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = x.index + x[0].length;
        break;
      }
    }
    const inner = out.slice(m.index, end);
    const vertical = /is-vertical/.test(m[0]);
    extra += vertical ? (inner.match(/<li/g) || []).length * 100 : ROW_BLOCKS[m[2]];
    out = out.slice(0, m.index) + out.slice(end);
  }
  return { html: out, extra };
}

export function estimateHeight(slide) {
  if (slide.interaction || slide.components.length || slide.join) return 0;
  const taken = takeBlocks(slide.html.replace(/<style[\s\S]*?<\/style>/g, ''));
  const html = taken.html;
  const narrow = ['split', 'full'].includes(slide.layout);
  const width = narrow ? 780 : 1600;
  const lines = (text, size) => Math.max(1, Math.ceil((text.length * size * 0.5) / width));
  let h = 0;
  const each = (re, fn) => { [...html.matchAll(re)].forEach((m) => { h += fn(plainText(m[1] || '')); }); };
  each(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (t) => lines(t, 104) * 108 + 32);
  each(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (t) => lines(t, 76) * 82 + 28);
  each(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (t) => lines(t, 52) * 60 + 20);
  each(/<p(?: [^>]*)?>([\s\S]*?)<\/p>/g, (t) => lines(t, 40) * 54 + 24);
  each(/<li[^>]*>([\s\S]*?)<\/li>/g, (t) => lines(t, 40) * 54 + 14);
  each(/<tr[^>]*>([\s\S]*?)<\/tr>/g, () => 64);
  // Code: one line of 44 px per line of code, plus padding.
  h += [...html.matchAll(/<pre[\s\S]*?<\/pre>/g)].reduce((n, m) => n + ((m[0].match(/\n/g) || []).length + 1) * 44 + 56, 0);
  if (/<figure>\s*<(img|video)/.test(html) && !narrow) h += 420;
  h += taken.extra;
  if (/q-chart/.test(html)) h += 460;
  return h;
}

const AVAILABLE = 1080 - 260;

export function designCheck(talk) {
  const issues = [];
  const suggestions = [];
  const { meta } = talk;
  const mode = meta.mode || meta.theme || 'light';
  const bg = meta.background || DEFAULTS[mode].background;
  const fg = meta.text || DEFAULTS[mode].text;

  const pairs = [
    ['text', fg, 'background', bg, 4.5],
    ['primary', meta.primary || fg, 'background', bg, 3],
  ];
  pairs.forEach(([a, ca, b, cb, min]) => {
    const r = contrast(ca, cb);
    if (r !== null && r < min) {
      issues.push({ kind: 'contrast', slide: null, message: `The ${a} colour ${ca} on the ${b} ${cb} has a contrast of ${r.toFixed(1)}:1; it needs at least ${min}:1 to be read from the back of a room.` });
    }
  });
  const accent = contrast(meta.accent, bg);
  if (accent !== null && accent < 1.6) {
    suggestions.push({ kind: 'contrast', slide: null, message: `The accent ${meta.accent} is very close to the background (${accent.toFixed(1)}:1): bars and buttons will be hard to see.` });
  }

  let plainRun = [];
  const flushRun = () => {
    if (plainRun.length >= 4) {
      suggestions.push({
        kind: 'variety',
        slide: plainRun[0] + 1,
        message: `Slides ${plainRun[0] + 1} to ${plainRun[plainRun.length - 1] + 1} are all text on the default layout. Break them up: a layout (split, statement, big-number, quote), a block (cards, timeline, kpis, chart) or an image.`,
      });
    }
    plainRun = [];
  };

  talk.slides.forEach((slide) => {
    const n = slide.index + 1;
    const html = slide.html + (slide.media || '');
    const count = words(slide.html);
    const visual = /<(img|video|figure|table|pre|svg)|q-(cards|kpis|timeline|process|compare|chart|stat|columns|callout)/.test(html);
    const plain = !slide.interaction && !slide.components.length && !slide.join && !slide.layout && !visual && !slide.background;
    if (plain) plainRun.push(slide.index);
    else flushRun();

    if (!slide.interaction && count > 45) {
      suggestions.push({ kind: 'text', slide: n, message: `Slide ${n} has ${count} words. People read it instead of listening: keep it under about 40, and move the rest to ::: notes.` });
    }
    const bullets = (slide.html.match(/<li[ >]/g) || []).length;
    if (bullets > 6 && !/q-(timeline|process)/.test(slide.html)) {
      suggestions.push({ kind: 'text', slide: n, message: `Slide ${n} has ${bullets} list items. Split it, or use {.steps} on a block so they appear one by one.` });
    }
    [...html.matchAll(/<img [^>]*alt=""[^>]*>/g)].forEach(() => {
      suggestions.push({ kind: 'alt', slide: n, message: `Slide ${n} has an image without a description: ![A short description](file.jpg).` });
    });
    const h = estimateHeight(slide);
    if (h > AVAILABLE * 1.05) {
      suggestions.push({ kind: 'overflow', slide: n, message: `Slide ${n} may not fit on the screen (about ${Math.round((h / AVAILABLE) * 100)}% of the space). Cut text or split the slide. \`quorum check --visual\` measures it.` });
    }
  });
  flushRun();

  const visualSlides = talk.slides.filter((s) => s.layout || s.media || /<(img|video)|q-(cards|kpis|timeline|process|compare|chart)/.test(s.html)).length;
  if (talk.slides.length >= 8 && visualSlides === 0) {
    suggestions.push({ kind: 'variety', slide: null, message: 'No slide uses a layout, an image or a visual block. A preset (theme: editorial, midnight...) and a few layouts make the talk much easier to watch. `quorum schema` lists them.' });
  }
  return { issues, suggestions };
}
