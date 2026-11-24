// Quorum talk format: a Markdown file with front matter, `---` between
// slides, `--` between steps, and `::: name` blocks for layouts,
// interactions, visual blocks, speaker notes and components.
//
// The parser has no dependencies and runs both in Node (the server needs
// the interaction definitions to validate votes) and in the browser.

import { chartHtml } from './charts.js';
import { isDark, paletteFrom } from './color.js';
import {
  ATTRIBUTES, CHART_TYPES, CLASSES, GRADIENTS, LAYOUTS, PRESETS, RESULT_STYLES, STEP_EFFECTS, TOKENS,
} from './design.js';
import { highlight, splitLines } from './highlight.js';
import { iconName, iconSvg } from './icons.js';
import { escapeHtml } from './text.js';

export { escapeHtml };

const INTERACTIONS = new Set(['poll', 'multi', 'estimate', 'rounds', 'sentence', 'questions']);
const SIMPLE_BLOCKS = new Set(['columns', 'center', 'stat', 'callout']);
const VISUAL_BLOCKS = new Set(['cards', 'timeline', 'steps', 'kpis', 'compare', 'chart']);
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

// A safe URL for links and images: http(s), relative paths, anchors, mailto.
function safeUrl(url) {
  const u = url.trim();
  if (/^(https?:|mailto:|\/|\.\/|\.\.\/|#)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  return '#';
}

// --- {#id .class key=value} --------------------------------------------------

const ATTR_TOKEN = String.raw`(?:[#.][\w-]+|[a-z][\w-]*=(?:"[^"]*"|'[^']*'|[^\s}"']+)|[a-z][\w-]*)`;
const ATTR_GROUP = new RegExp(String.raw`\{\s*(${ATTR_TOKEN}(?:\s+${ATTR_TOKEN})*)\s*\}`, 'i');
const TRAILING_ATTRS = new RegExp(String.raw`\s*\{\s*(${ATTR_TOKEN}(?:\s+${ATTR_TOKEN})*)\s*\}\s*$`, 'i');

// Reads "#id .a .b key=value word" into { id, classes, kv }. A bare word
// counts only when it is a known class, so ordinary text in braces stays text.
export function parseAttrs(text) {
  const a = { id: '', classes: [], kv: {}, valid: true };
  const tokens = String(text).match(/[#.][\w-]+|[a-z][\w-]*=(?:"[^"]*"|'[^']*'|[^\s}"']+)|[a-z][\w-]*/gi) || [];
  tokens.forEach((t) => {
    if (t[0] === '#') a.id = t.slice(1);
    else if (t[0] === '.') a.classes.push(t.slice(1).toLowerCase());
    else if (t.includes('=')) {
      const [k, ...v] = t.split('=');
      a.kv[k.toLowerCase()] = unquote(v.join('='));
    } else if (CLASSES[t.toLowerCase()]) a.classes.push(t.toLowerCase());
    else a.valid = false;
  });
  return a;
}

// Splits trailing attributes off a line of text: "Title {.center}".
function trailingAttrs(text) {
  const m = String(text).match(TRAILING_ATTRS);
  if (!m) return { text, attrs: null };
  const attrs = parseAttrs(m[1]);
  if (!attrs.valid) return { text, attrs: null };
  return { text: text.slice(0, m.index), attrs };
}

const EMPTY_ATTRS = { id: '', classes: [], kv: {} };

function colorValue(v) {
  if (v === 'accent') return 'var(--accent-text)';
  if (v === 'secondary') return 'var(--secondary-text)';
  return COLOR.test(v) ? v : '';
}

// HTML attributes for an element with { id, classes, kv }.
function attrsHtml(a, base = '') {
  if (!a) return base ? ` class="${base}"` : '';
  const classes = [base, ...a.classes.map((c) => `is-${c}`)].filter(Boolean).join(' ');
  const style = [];
  if (a.kv.width) style.push(`width:${cssSize(a.kv.width)}`);
  if (a.kv.height) style.push(`height:${cssSize(a.kv.height)}`);
  if (a.kv.color && colorValue(a.kv.color)) style.push(`color:${colorValue(a.kv.color)}`);
  // layout: canvas, free positions: percentages of the slide.
  if (a.kv.x !== undefined || a.kv.y !== undefined) {
    style.push('position:absolute');
    if (a.kv.x !== undefined) style.push(`left:${cssPercent(a.kv.x)}`);
    if (a.kv.y !== undefined) style.push(`top:${cssPercent(a.kv.y)}`);
    if (a.kv.w !== undefined) style.push(`width:${cssPercent(a.kv.w)}`);
    if (a.kv.h !== undefined) style.push(`height:${cssPercent(a.kv.h)}`);
  }
  return `${classes ? ` class="${escapeHtml(classes)}"` : ''}${a.id ? ` data-morph="${escapeHtml(a.id)}"` : ''}${style.length ? ` style="${escapeHtml(style.join(';'))}"` : ''}`;
}

const CANVAS_KEYS = ['x', 'y', 'w', 'h'];

// A position or size on a canvas slide: "40" or "40%" is a share of the slide.
function cssPercent(v) {
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? `${n}%` : '0%';
}

function cssSize(v) {
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return `${s}px`;
  return /^\d+(\.\d+)?(px|%|em|rem|vw|vh)$/.test(s) ? s : 'auto';
}

// --- inline Markdown ---------------------------------------------------------

function media(alt, src, title, attrText) {
  const a = attrText ? parseAttrs(attrText) : null;
  const url = escapeHtml(safeUrl(src));
  if (VIDEO.test(src)) {
    const play = a && a.classes.includes('controls') ? 'controls' : 'autoplay muted loop playsinline';
    return `<video src="${url}" ${play} preload="metadata"${alt ? ` aria-label="${escapeHtml(alt)}"` : ''}${attrsHtml(a)}></video>`;
  }
  return `<img src="${url}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''}${attrsHtml(a)}>`;
}

// Inline Markdown: code, images (and videos), links, icons, badges, bold,
// italics, highlights, strikethrough, line breaks.
export function inline(text) {
  const tokens = [];
  const hold = (html) => {
    tokens.push(html);
    return `\u0000${tokens.length - 1}\u0000`;
  };
  let s = String(text);
  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\{([^}]*)\})?/g, (_, alt, src, title, attrs) => hold(media(alt, src, title, attrs)));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => hold(
    `<a href="${escapeHtml(safeUrl(href))}" target="_blank" rel="noopener">${inline(label)}</a>`,
  ));
  s = s.replace(/:icon\[([\w-]+)\]/g, (whole, name) => (iconName(name) ? hold(iconSvg(name, 'q-icon q-icon-inline')) : whole));
  s = s.replace(/:badge\[([^\]]+)\](?:\{([^}]*)\})?/g, (_, label, attrs) => hold(
    `<span${attrsHtml(attrs ? parseAttrs(attrs) : null, 'q-badge')}>${inline(label)}</span>`,
  ));
  s = escapeHtml(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/==(?=\S)(.+?)(?<=\S)==/g, '<mark>$1</mark>');
  s = s.replace(/ {2,}\n|\\\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
}

// --- front matter ------------------------------------------------------------

// `key: value` lines. "key: value   # a comment": the comment is dropped.
export function keyValues(lines) {
  const meta = {};
  lines.forEach((l) => {
    const m = l.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (m) meta[m[1]] = unquote(m[2].replace(/\s+#\s.*$/, '').trim());
  });
  return meta;
}

function frontMatter(lines) {
  if (lines[0] !== undefined && lines[0].trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) return { meta: keyValues(lines.slice(1, end)), rest: lines.slice(end + 1) };
  }
  return { meta: {}, rest: lines };
}

// A CSS colour: #hex, a name (navy) or rgb()/hsl().
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(rgb|hsl)a?\([\d\s.,%/]+\))$/i;

// A file in the talk folder: a relative path, never outside it.
export function isLocalPath(p) {
  return typeof p === 'string' && /^[^\s"'()<>\\:]+$/.test(p) && !p.startsWith('/') && !p.split('/').includes('..');
}

const FONT_FILE = /\.(woff2?|ttf|otf)$/i;

// A list in the front matter: ["#a", "#b"], #a, #b or #a | #b.
function list(value) {
  return String(value || '').replace(/^\[|\]$/g, '').split(/[,|]/).map((x) => unquote(x.trim())).filter(Boolean);
}

// Joins a path from a theme file's folder, e.g. ("themes", "../logo.svg").
function joinPath(dir, rel) {
  const parts = [];
  `${dir ? `${dir}/` : ''}${rel}`.split('/').forEach((p) => {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  });
  return parts.join('/');
}

const FILE_KEYS = ['logo', 'style', 'font', 'text-font', 'accent-font', 'phone-background'];

// The theme of a talk: a preset, plus a theme file, plus the front matter.
// Returns the merged settings and the preset to fill in what is missing.
function theme(meta, warn, readFile) {
  let name = String(meta.theme || '').trim();
  let mode = '';
  let fromFile = {};
  if (/\.ya?ml$/i.test(name)) {
    const path = name.replace(/^\.\//, '');
    const text = isLocalPath(path) && readFile ? readFile(path) : null;
    if (!isLocalPath(path)) warn(`The theme file "${name}" must be in the talk folder.`);
    else if (!readFile) warn(`The theme file ${path} can only be read by the quorum command, not here.`);
    else if (text === null || text === undefined) warn(`The theme file ${path} does not exist.`);
    if (text) {
      fromFile = keyValues(String(text).replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '---'));
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      FILE_KEYS.forEach((k) => {
        const v = fromFile[k];
        if (v && (k === 'logo' || k === 'style' || FONT_FILE.test(v) || (k === 'phone-background' && /\.\w{3,4}$/.test(v)))) {
          fromFile[k] = joinPath(dir, v);
        }
      });
    }
    name = String(fromFile.extends || fromFile.theme || 'clean').trim();
    delete fromFile.extends;
    delete fromFile.theme;
  }
  if (name === 'light' || name === 'dark') {
    mode = name;
    name = 'clean';
  }
  if (name && !PRESETS[name]) {
    warn(`The theme "${name}" does not exist. Use one of: ${Object.keys(PRESETS).join(', ')}, light, dark, or a theme file (.yaml).`);
    name = 'clean';
  }
  const source = { ...fromFile, ...meta };
  delete source.theme;
  return { preset: name || 'clean', mode, source };
}

// The branding settings, checked. `warn` gets a message for each value
// that cannot be used.
function brand(meta, preset, warn) {
  const color = (key, fallback = '') => {
    const v = meta[key];
    if (v === undefined || v === '') return fallback;
    if (COLOR.test(v)) return v;
    warn(`The ${key} colour "${v}" is not a colour. Use #hex, a name or rgb().`);
    return fallback;
  };
  const file = (key) => {
    const v = meta[key];
    if (!v) return '';
    if (isLocalPath(v)) return v.replace(/^\.\//, '');
    warn(`The ${key} "${v}" must be a file in the talk folder, like images/logo.svg.`);
    return '';
  };
  // A font is a CSS font-family, or a font file in the talk folder.
  const font = (key, fallback) => {
    const v = meta[key] || '';
    if (!v) return { family: fallback || '', file: '' };
    if (!FONT_FILE.test(v)) return { family: v, file: '' };
    return { family: '', file: file(key) };
  };
  const display = font('font', preset.font);
  const text = font('text-font', preset.textFont);
  const accentFont = font('accent-font', preset.accentFont);
  const own = list(meta.palette).filter((c) => {
    if (COLOR.test(c)) return true;
    warn(`The palette colour "${c}" is not a colour.`);
    return false;
  });
  const accent = color('accent', preset.accent);
  // A preset's palette starts with its accent: a new accent takes its place.
  let palette = own;
  if (!palette.length && preset.palette.length) palette = [accent, ...preset.palette.filter((c) => c !== preset.accent)];
  return {
    accent,
    primary: color('primary', preset.primary || ''),
    secondary: color('secondary', preset.secondary || ''),
    background: color('background', preset.background || ''),
    text: color('text', preset.text || ''),
    logo: file('logo'),
    style: file('style'),
    font: display.family,
    fontFile: display.file,
    textFont: text.family,
    textFontFile: text.file,
    accentFont: accentFont.family,
    accentFontFile: accentFont.file,
    // Own colours per answer: from the talk, or the preset. Without either,
    // charts that need several colours make them from the accent.
    palette: palette.length ? palette : paletteFrom(accent),
    series: palette.length > 0,
  };
}

function tokens(meta, preset, warn) {
  const out = {};
  Object.entries(TOKENS).forEach(([key, def]) => {
    if (key === 'mode') return;
    const v = meta[key];
    if (v === undefined || v === '') out[key] = preset.tokens[key];
    else if (def.values.includes(String(v).toLowerCase())) out[key] = String(v).toLowerCase();
    else {
      warn(`"${key}: ${v}" is not a value Quorum knows. Use one of: ${def.values.join(', ')}.`);
      out[key] = preset.tokens[key];
    }
  });
  return out;
}

// What phones show besides the questions: a welcome, a thank-you, a background.
function phone(meta, warn) {
  const bg = meta['phone-background'];
  let background = null;
  if (bg) {
    if (COLOR.test(bg)) background = { color: bg, image: '' };
    else if (isLocalPath(bg)) background = { color: '', image: bg.replace(/^\.\//, '') };
    else warn(`The phone-background "${bg}" is not a colour or a file in the talk folder.`);
  }
  return {
    welcome: meta['phone-welcome'] ? inline(meta['phone-welcome']) : '',
    thanks: meta['phone-thanks'] ? inline(meta['phone-thanks']) : '',
    background,
  };
}

function reactions(value, warn) {
  if (!value || /^(off|none)$/i.test(value)) return [];
  const list = String(value).split(/[\s,|]+/).filter(Boolean);
  const ok = list.filter((r) => r.length <= 8 && !/[<>"'&]/.test(r));
  if (ok.length !== list.length) warn('Each reaction must be one emoji or a short word.');
  if (ok.length > 6) warn('Use at most 6 reactions; the rest are left out.');
  return [...new Set(ok)].slice(0, 6);
}

// The footer: "left | right", with {title}, {author}, {section}, {n} and
// {total}. Null when it is turned off.
export const DEFAULT_FOOTER = '{title} | {n} / {total}';

function footer(value) {
  const v = value === undefined ? DEFAULT_FOOTER : String(value).trim();
  if (!v || /^(off|none)$/i.test(v)) return null;
  const bar = v.indexOf('|');
  const [left, right] = bar < 0 ? [v, ''] : [v.slice(0, bar), v.slice(bar + 1)];
  return { left: inline(left.trim()), right: inline(right.trim()) };
}

// A slide background: <!-- background: images/photo.jpg, dim -->, a
// colour or a gradient name.
function slideBackground(value, warn) {
  if (!value) return null;
  const [what, ...flags] = value.split(',').map((x) => x.trim());
  const dim = flags.includes('dim');
  if (GRADIENTS.includes(what.toLowerCase())) return { color: '', image: '', gradient: what.toLowerCase(), dim };
  if (COLOR.test(what)) return { color: what, image: '', dim };
  if (isLocalPath(what)) return { color: '', image: what.replace(/^\.\//, ''), dim };
  warn(`the background "${what}" is not a colour, a gradient (${GRADIENTS.join(', ')}) or a file in the talk folder.`);
  return null;
}

function unquote(v) {
  const m = String(v).match(/^(["'])(.*)\1$/);
  return m ? m[2] : v;
}

// Splits the body into slides on lines that are exactly `---`, ignoring
// those inside code fences.
export function splitSlides(lines) {
  const slides = [[]];
  let fence = null;
  lines.forEach((line, n) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) fence = fence && line.trim().startsWith(fence) ? null : (fence || f[1]);
    if (!fence && line.trim() === '---') slides.push([]);
    else slides[slides.length - 1].push({ text: line, n: n + 1 });
  });
  return slides.filter((s) => s.some((l) => l.text.trim() !== ''));
}

// `key: value` lines at the top of a block body, until the first other line.
// With a list of allowed keys, other `word: text` lines are left as content.
function readOptions(body, allowed = null) {
  const opts = {};
  let i = 0;
  for (; i < body.length; i += 1) {
    const t = body[i].text;
    if (t.trim() === '') continue;
    const m = t.match(/^\s*("[^"]*"|[^:"]+?)\s*:\s+(.*)$/);
    if (!m || /^\s*([-*+]\s|#|>)/.test(t)) break;
    const key = unquote(m[1].trim());
    if (allowed && !allowed.includes(key.toLowerCase())) break;
    opts[allowed ? key.toLowerCase() : key] = m[2].trim();
  }
  return { opts, rest: body.slice(i) };
}

// What a component can ask the audience with "audience:".
const INPUTS = ['text', 'number', 'choice', 'choices'];

const OPTION_KEYS = {
  poll: [],
  multi: [],
  estimate: ['answer', 'min', 'max', 'scale', 'unit', 'label', 'format'],
  rounds: ['options'],
  questions: ['mode'],
};

function hashId(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// `Question {#my-id .wide chart=donut}` -> { title, id, attrs }
function titleAndId(rest, kind) {
  const m = rest.match(ATTR_GROUP);
  const attrs = m ? parseAttrs(m[1]) : null;
  const usable = attrs && (attrs.valid || attrs.id);
  const title = (usable ? rest.replace(m[0], ' ') : rest).replace(/\s+/g, ' ').trim();
  const id = usable && attrs.id && /^[a-z0-9][\w-]{0,40}$/i.test(attrs.id) ? attrs.id : `${kind}-${hashId(title)}`;
  return { title, id, attrs: usable ? attrs : { ...EMPTY_ATTRS } };
}

function listItems(body) {
  return body
    .map((l) => ({ m: l.text.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/), n: l.n }))
    .filter((x) => x.m)
    .map(({ m, n }) => ({ text: m[2].trim(), checked: m[1] === 'x' || m[1] === 'X', n }));
}

// "1857: Pasteur explains it" -> ['1857', 'Pasteur explains it']
function splitPair(text) {
  const m = text.match(/^(.+?):\s+(.*)$/);
  return m ? [m[1].trim(), m[2].trim()] : ['', text.trim()];
}

function number(v, fallback) {
  if (v === undefined || v === '') return fallback;
  const n = Number(String(v).replace(/[_,\s]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

// The first number in a text: "4.5 h" -> 4.5, "1,200 kg" -> 1200.
function leadingNumber(text) {
  const m = String(text).replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Line numbers for code: "1-3|5" -> [[1, 2, 3], [5]]
function lineRanges(value) {
  return String(value || '').split('|').map((part) => {
    const out = [];
    part.split(',').forEach((p) => {
      const [a, b] = p.split('-').map((x) => Number(x.trim()));
      if (!Number.isInteger(a)) return;
      for (let k = a; k <= (Number.isInteger(b) ? b : a); k += 1) out.push(k);
    });
    return out;
  }).filter((r) => r.length);
}

// Scopes a slide's CSS to the slide, with CSS nesting.
function scopedCss(css, sid) {
  const safe = String(css).replace(/<\/?style/gi, '');
  return `<style data-slide-style>.q-slide[data-sid="${escapeHtml(sid)}"] {\n${safe}\n}</style>`;
}

class SlideParser {
  constructor(lines, slideIndex, warn, ctx = {}) {
    this.lines = lines;
    this.slideIndex = slideIndex;
    this.warn = warn;
    this.ctx = ctx;
    this.root = this;
    this.stepValue = 0;
    this.fx = {};
    this.notes = [];
    this.interactions = [];
    this.components = [];
    this.attrs = {};
    this.css = [];
  }

  // A parser for the inside of a block, sharing steps and results.
  child(lines) {
    const p = Object.create(this);
    p.lines = lines;
    return p;
  }

  at(line, message) {
    this.warn(`Line ${line.n}: ${message}`);
  }

  // Checks {…} attributes against what Quorum knows.
  checkAttrs(a, line, { keys = null } = {}) {
    if (!a) return;
    a.classes.forEach((c) => {
      if (!CLASSES[c]) this.at(line, `".${c}" is not a class Quorum knows. Use one of: ${Object.keys(CLASSES).join(', ')}.`);
    });
    Object.entries(a.kv).forEach(([k, v]) => {
      if (!ATTRIBUTES[k] || (keys && !keys.includes(k) && !CANVAS_KEYS.includes(k))) {
        this.at(line, `"${k}=" does not apply here.${keys ? ` Use: ${keys.join(', ')}.` : ''}`);
      }
      if (k === 'icon' && !iconName(v)) this.at(line, `There is no icon called "${v}". \`quorum schema --icons\` lists them.`);
      if (CANVAS_KEYS.includes(k) && !/^-?\d+(\.\d+)?%?$/.test(String(v).trim())) this.at(line, `"${k}=${v}" should be a number: a share of the slide (x=10 y=20 w=40 h=30).`);
    });
    if (CANVAS_KEYS.some((k) => a.kv[k] !== undefined)) {
      this.root.canvas = this.root.canvas || [];
      const n = (k) => (a.kv[k] === undefined ? null : Number.parseFloat(a.kv[k]));
      this.root.canvas.push({ line: line.n, x: n('x'), y: n('y'), w: n('w'), h: n('h') });
    }
  }

  // The lines of an element as a source map ("12-14"), when asked for.
  srcOf(lines) {
    if (!this.ctx.sourceMap) return '';
    const filled = lines.filter((l) => l.text.trim() !== '');
    return filled.length ? ` data-src="${filled[0].n}-${filled[filled.length - 1].n}"` : '';
  }

  srcAt(n) {
    return this.ctx.sourceMap && n ? ` data-src="${n}-${n}"` : '';
  }

  // Inline syntax that can be wrong: icon names, image attributes.
  checkInline(text, line) {
    [...String(text).matchAll(/:icon\[([\w-]+)\]/g)].forEach(([, name]) => {
      if (!iconName(name)) this.at(line, `There is no icon called "${name}". \`quorum schema --icons\` lists them.`);
    });
    [...String(text).matchAll(/!\[[^\]]*\]\([^)]*\)\{([^}]*)\}/g)].forEach(([, attrs]) => {
      const a = parseAttrs(attrs);
      this.checkAttrs(a, line, { keys: ['width', 'height'] });
    });
  }

  // Wraps a block so it appears at the given step (default: the current one).
  stepped(html, step = this.step) {
    if (step <= 0) return html;
    const fx = this.root.fx[step];
    return `<div class="q-step${fx ? ` fx-${fx}` : ''}" data-step="${step}">${html}</div>`;
  }

  // For items that appear one per click ({.steps}): the attributes of item i.
  itemStep(i, each) {
    if (each && i > 0) this.root.step += 1;
    const s = this.root.step;
    const fx = this.root.fx[s];
    return s > 0 ? { cls: ` q-step${fx ? ` fx-${fx}` : ''}`, attr: ` data-step="${s}"` } : { cls: '', attr: '' };
  }

  get step() { return this.root === this ? this.stepValue : this.root.step; }

  set step(v) {
    if (this.root === this) this.stepValue = v;
    else this.root.step = v;
  }

  blocks(lines) {
    const out = [];
    let i = 0;
    // Source maps: every block remembers the lines it came from.
    let sealFrom = 0;
    let sealStart = null;
    const seal = () => {
      if (sealStart === null || !this.ctx.sourceMap) return;
      const end = lines[Math.min(i, lines.length) - 1];
      for (let k = sealFrom; k < out.length; k += 1) {
        out[k] = out[k].replace(/^<([a-z][\w-]*)/i, `<$1 data-src="${sealStart}-${end ? end.n : sealStart}"`);
      }
    };
    while (i < lines.length) {
      seal();
      sealFrom = out.length;
      sealStart = lines[i].n;
      const line = lines[i];
      const t = line.text;
      const trimmed = t.trim();

      if (trimmed === '') { i += 1; continue; }

      // Slide attributes: <!-- layout: center --> <!-- id: intro --> <!-- section: Welcome, 5 -->
      const attr = trimmed.match(/^<!--\s*([a-z]+)\s*:\s*(.*?)\s*-->$/i);
      if (attr) {
        this.root.attrs[attr[1].toLowerCase()] = attr[2];
        this.root.attrLines = { ...(this.root.attrLines || {}), [attr[1].toLowerCase()]: line };
        i += 1;
        continue;
      }

      // "--" starts the next step; "-- fly" also chooses how it appears.
      const step = trimmed.match(/^--(?:\s+([a-z]+))?$/i);
      if (step) {
        this.step += 1;
        if (step[1]) {
          const fx = step[1].toLowerCase();
          if (STEP_EFFECTS.includes(fx)) this.root.fx[this.step] = fx;
          else this.at(line, `"-- ${step[1]}" is not a step effect. Use one of: ${STEP_EFFECTS.join(', ')}.`);
        }
        i += 1;
        continue;
      }

      const fence = t.match(/^\s*(```+|~~~+)\s*([\w+#-]*)\s*(.*)$/);
      if (fence) {
        const end = lines.findIndex((l, k) => k > i && l.text.trim().startsWith(fence[1]));
        const stop = end < 0 ? lines.length : end;
        const code = lines.slice(i + 1, stop).map((l) => l.text).join('\n');
        out.push(this.code(code, fence[2], fence[3], line));
        i = stop + 1;
        continue;
      }

      const dir = t.match(/^\s*(:{3,})\s*([a-z][\w-]*)\s*(.*)$/i);
      if (dir) {
        const colons = dir[1].length;
        let depth = 0;
        let end = -1;
        for (let k = i + 1; k < lines.length; k += 1) {
          const m = lines[k].text.match(/^\s*(:{3,})\s*([a-z][\w-]*)?/i);
          if (!m) continue;
          if (m[2] && m[1].length === colons) depth += 1;
          else if (!m[2] && m[1].length === colons) {
            if (depth === 0) { end = k; break; }
            depth -= 1;
          }
        }
        if (end < 0) {
          this.at(line, `"::: ${dir[2]}" is never closed with ":::". Closing it at the end of the slide.`);
          end = lines.length;
        }
        out.push(this.directive(dir[2].toLowerCase(), dir[3].trim(), lines.slice(i + 1, end), line));
        i = end + 1;
        continue;
      }

      const heading = t.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        const { text, attrs } = trailingAttrs(heading[2]);
        this.checkAttrs(attrs, line, { keys: ['icon', 'color'] });
        this.checkInline(text, line);
        if (!this.root.title) this.root.title = text;
        const icon = attrs && attrs.kv.icon ? iconSvg(attrs.kv.icon) : '';
        out.push(this.stepped(`<h${level}${attrsHtml(attrs)}>${icon}${inline(text)}</h${level}>`));
        i += 1;
        continue;
      }

      if (/^\s*>/.test(t)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i].text)) {
          quote.push({ ...lines[i], text: lines[i].text.replace(/^\s*>\s?/, '') });
          i += 1;
        }
        const inner = this.child(quote);
        const start = this.step;
        out.push(this.stepped(`<blockquote>${inner.blocks(quote).join('')}</blockquote>`, start));
        continue;
      }

      if (/^\s*([-*+]|\d+[.)])\s+/.test(t)) {
        const items = [];
        while (i < lines.length && lines[i].text.trim() !== '' && !/^\s*(:{3,}|--(\s+[a-z]+)?\s*$)/i.test(lines[i].text)) {
          items.push(lines[i]);
          i += 1;
        }
        items.forEach((l) => this.checkInline(l.text, l));
        out.push(this.list(items));
        continue;
      }

      if (/^\s*\|.*\|\s*$/.test(t) && lines[i + 1] && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1].text)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i].text)) {
          rows.push(lines[i].text);
          i += 1;
        }
        out.push(this.stepped(this.table(rows)));
        continue;
      }

      // Raw HTML block (the talk author is trusted).
      if (/^\s*<[a-z!/]/i.test(t)) {
        const html = [];
        while (i < lines.length && lines[i].text.trim() !== '') {
          html.push(lines[i].text);
          i += 1;
        }
        out.push(this.stepped(html.join('\n')));
        continue;
      }

      const para = [];
      const first = line;
      while (i < lines.length) {
        const l = lines[i].text;
        if (l.trim() === '' || /^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|:{3,}|```|~~~|--(\s+[a-z]+)?\s*$|<!--)/i.test(l)) break;
        para.push(l);
        i += 1;
      }
      if (para.length === 0) { i += 1; continue; }
      let textP = para.join('\n');
      this.checkInline(textP, first);
      const onlyMedia = textP.trim().match(/^!\[[^\]]*\]\([^)]+\)(\{[^}]*\})?$/);
      if (onlyMedia) {
        // On a canvas the picture is positioned: x, y, w and h go on its figure.
        const pos = textP.trim().match(/^(!\[[^\]]*\]\([^)]+\))\{([^}]*)\}$/);
        const posAttrs = pos ? parseAttrs(pos[2]) : null;
        if (posAttrs && CANVAS_KEYS.some((k) => posAttrs.kv[k] !== undefined)) {
          const kv = Object.fromEntries(CANVAS_KEYS.filter((k) => posAttrs.kv[k] !== undefined).map((k) => [k, posAttrs.kv[k]]));
          out.push(this.stepped(`<figure${attrsHtml({ id: '', classes: [], kv }, 'q-positioned')}>${inline(pos[1])}</figure>`));
          continue;
        }
        out.push(this.stepped(`<figure>${inline(textP.trim())}</figure>`));
        continue;
      }
      const { text, attrs } = trailingAttrs(textP);
      if (attrs) {
        this.checkAttrs(attrs, first, { keys: ['color'] });
        textP = text;
      }
      out.push(this.stepped(`<p${attrsHtml(attrs)}>${inline(textP)}</p>`));
    }
    seal();
    return out;
  }

  code(code, lang, rest, line) {
    const { attrs } = trailingAttrs(` ${rest}`);
    if (rest.trim() && !attrs) this.at(line, `"${rest.trim()}" after the code fence is not understood. Use {lines=1-2|4} or {.class}.`);
    this.checkAttrs(attrs, line, { keys: ['lines'] });
    const lines = splitLines(highlight(code, lang));
    const ranges = attrs && attrs.kv.lines ? lineRanges(attrs.kv.lines) : [];
    const start = this.step;
    let data = '';
    if (ranges.length) {
      const steps = ranges.map((r, k) => [start + k, r]);
      this.step += ranges.length - 1;
      data = ` data-ranges="${escapeHtml(JSON.stringify(steps))}"`;
    }
    const body = lines.map((l, k) => `<span class="q-line" data-n="${k + 1}">${l}</span>`).join('\n');
    const cls = `${lang ? ` class="language-${escapeHtml(lang)}"` : ''}`;
    return this.stepped(`<pre${attrsHtml(attrs, 'q-code')}${data}><code${cls}>${body}</code></pre>`, start);
  }

  list(items) {
    // One level of nesting: lines indented by 2+ spaces become a sub-list.
    const ordered = /^\s*\d+[.)]/.test(items[0].text);
    const tag = ordered ? 'ol' : 'ul';
    const html = [];
    let open = false;
    let sub = [];
    const flushSub = () => {
      if (sub.length) {
        html.push(`<ul>${sub.map((s) => `<li>${inline(s)}</li>`).join('')}</ul>`);
        sub = [];
      }
    };
    items.forEach((line) => {
      const m = line.text.match(/^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/);
      if (!m) {
        // A continuation line belongs to the previous item.
        if (html.length) html[html.length - 1] = html[html.length - 1].replace(/<\/li>$/, ` ${inline(line.text.trim())}</li>`);
        return;
      }
      if (m[1].length >= 2 && open) {
        sub.push(m[4]);
        return;
      }
      flushSub();
      if (html.length) html[html.length - 1] += '</li>';
      const box = m[3] ? `<span class="q-check${m[3] !== ' ' ? ' on' : ''}" aria-hidden="true"></span>` : '';
      html.push(`<li${this.srcOf([line])}>${box}${inline(m[4])}`);
      open = true;
    });
    flushSub();
    if (html.length) html[html.length - 1] += '</li>';
    return this.stepped(`<${tag}>${html.join('').replace(/<\/li><\/li>/g, '</li>')}</${tag}>`);
  }

  table(rows) {
    const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const head = cells(rows[0]);
    const align = cells(rows[1]).map((c) => (/^:-+:$/.test(c) ? 'center' : (/-:$/.test(c) ? 'right' : '')));
    const td = (c, k, tagName) => `<${tagName}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tagName}>`;
    const body = rows.slice(2).map((r) => `<tr>${cells(r).map((c, k) => td(c, k, 'td')).join('')}</tr>`).join('');
    return `<table><thead><tr>${head.map((c, k) => td(c, k, 'th')).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  directive(name, rest, body, line) {
    if (name === 'notes') {
      this.root.notes.push(body.map((l) => l.text).join('\n').trim());
      return '';
    }
    if (name === 'style') {
      this.root.css.push(body.map((l) => l.text).join('\n'));
      return '';
    }
    if (INTERACTIONS.has(name)) return this.stepped(this.interaction(name, rest, body, line));
    if (name === 'component') return this.stepped(this.component(rest, body, line));
    if (name === 'join') {
      this.root.hasJoin = true;
      return this.stepped(`<div class="q-join" data-join>${inline(rest || '')}</div>`);
    }
    if (SIMPLE_BLOCKS.has(name)) return this.layout(name, rest, body, line);
    if (VISUAL_BLOCKS.has(name)) return this.visual(name, rest, body, line);
    this.at(line, `Unknown block "::: ${name}". Its content is shown as plain text.`);
    return this.blocks(body).join('');
  }

  // Splits a block body on "+++" lines.
  static parts(body) {
    const parts = [[]];
    body.forEach((l) => {
      if (l.text.trim() === '+++') parts.push([]);
      else parts[parts.length - 1].push(l);
    });
    return parts;
  }

  layout(name, rest, body, line) {
    const { title, attrs } = titleAndId(rest, name);
    this.checkAttrs(attrs, line, { keys: [] });
    if (name === 'columns') {
      const cols = SlideParser.parts(body);
      const html = cols.map((c) => `<div class="q-col">${this.child(c).blocks(c).join('')}</div>`).join('');
      return `<div${attrsHtml(attrs, 'q-columns')} style="--cols:${cols.length}">${html}</div>`;
    }
    if (name === 'stat') {
      const start = this.step;
      const inner = this.child(body).blocks(body).join('');
      const n = leadingNumber(title);
      return this.stepped(`<div${attrsHtml(attrs, 'q-stat')}><p class="q-stat-value"${n !== null ? ` data-count="${n}"` : ''}>${inline(title)}</p>${inner}</div>`, start);
    }
    if (name === 'callout') {
      const start = this.step;
      const inner = this.child(body).blocks(body).join('');
      return this.stepped(`<div${attrsHtml(attrs, 'q-callout')}>${title ? `<p class="q-callout-title">${inline(title)}</p>` : ''}${inner}</div>`, start);
    }
    // center
    return `<div${attrsHtml(attrs, 'q-center')}>${this.child(body).blocks(body).join('')}</div>`;
  }

  visual(name, rest, body, line) {
    const { title, attrs } = titleAndId(rest, name);
    const each = attrs.classes.includes('steps');
    const start = this.step;
    const keys = {
      cards: [], timeline: [], steps: [], kpis: ['unit'], compare: ['vs'], chart: ['title', 'unit', 'max', 'icon', 'per'],
    }[name];
    this.checkAttrs(attrs, line, { keys });

    if (name === 'cards') {
      const parts = SlideParser.parts(body);
      const html = parts.map((p, k) => {
        const s = this.itemStep(k, each);
        return `<div class="q-card${s.cls}"${s.attr}${this.srcOf(p)}>${this.child(p).blocks(p).join('')}</div>`;
      }).join('');
      return this.stepped(`<div${attrsHtml(attrs, 'q-cards')} style="--cols:${parts.length}">${html}</div>`, start);
    }

    if (name === 'compare') {
      const parts = SlideParser.parts(body);
      if (parts.length !== 2) this.at(line, '"::: compare" needs two sides separated by a "+++" line.');
      const vs = attrs.kv.vs || 'vs';
      const html = parts.slice(0, 2).map((p, k) => {
        const s = this.itemStep(k, each);
        return `<div class="q-compare-side${s.cls}"${s.attr}${this.srcOf(p)}>${this.child(p).blocks(p).join('')}</div>`;
      });
      return this.stepped(`<div${attrsHtml(attrs, 'q-compare')}>${html[0] || ''}<span class="q-vs">${escapeHtml(vs)}</span>${html[1] || ''}</div>`, start);
    }

    const items = listItems(body);
    items.forEach((it) => this.checkInline(it.text, line));

    if (name === 'timeline') {
      if (!items.length) this.at(line, '"::: timeline" needs a list of "date: text" items.');
      const html = items.map((it, k) => {
        const [when, what] = splitPair(it.text);
        const s = this.itemStep(k, each);
        return `<li class="q-tl-item${s.cls}"${s.attr}${this.srcAt(it.n)}><span class="q-tl-dot"></span>${when ? `<span class="q-tl-when">${inline(when)}</span>` : ''}<span class="q-tl-what">${inline(what)}</span></li>`;
      }).join('');
      return this.stepped(`<ol${attrsHtml(attrs, 'q-timeline')} style="--n:${items.length}">${html}</ol>`, start);
    }

    if (name === 'steps') {
      if (!items.length) this.at(line, '"::: steps" needs a list, one item per step.');
      const html = items.map((it, k) => {
        const [head, text] = splitPair(it.text);
        const s = this.itemStep(k, each);
        return `<li class="q-process-item${s.cls}"${s.attr}${this.srcAt(it.n)}><span class="q-process-n">${k + 1}</span><div>${head ? `<p class="q-process-head">${inline(head)}</p>` : ''}<p class="q-process-text">${inline(text)}</p></div></li>`;
      }).join('');
      return this.stepped(`<ol${attrsHtml(attrs, 'q-process')} style="--n:${items.length}">${html}</ol>`, start);
    }

    if (name === 'kpis') {
      if (!items.length) this.at(line, '"::: kpis" needs a list of "value: label" items.');
      const unit = attrs.kv.unit ? ` ${attrs.kv.unit}` : '';
      const html = items.map((it, k) => {
        const [value, label] = splitPair(it.text);
        const n = leadingNumber(value || label);
        const s = this.itemStep(k, each);
        return `<div class="q-kpi${s.cls}"${s.attr}${this.srcAt(it.n)}><p class="q-kpi-value"${n !== null ? ` data-count="${n}"` : ''}>${inline((value || label) + unit)}</p>${value ? `<p class="q-kpi-label">${inline(label)}</p>` : ''}</div>`;
      }).join('');
      return this.stepped(`<div${attrsHtml(attrs, 'q-kpis')} style="--cols:${items.length}">${html}</div>`, start);
    }

    // chart: "label: value" lines (or list items).
    const type = (title.split(/\s+/)[0] || 'bar').toLowerCase();
    if (!CHART_TYPES.includes(type)) this.at(line, `"::: chart ${type}" is not a chart type. Use one of: ${CHART_TYPES.join(', ')}.`);
    const rows = body.map((l) => l.text.replace(/^\s*[-*+]\s+/, '')).filter((t) => t.trim()).map((t) => {
      const [label, value] = splitPair(t);
      return { label: label || t, value: leadingNumber(value) };
    });
    const bad = rows.filter((r) => r.value === null);
    if (bad.length) this.at(line, `"::: chart" needs "label: number" lines; "${bad[0].label}" has no number.`);
    if (!rows.length) this.at(line, '"::: chart" needs data: one "label: number" line per bar.');
    const good = rows.filter((r) => r.value !== null);
    const series = this.ctx.series || ['donut', 'pictogram'].includes(type);
    const html = chartHtml(CHART_TYPES.includes(type) ? type : 'bar', good, {
      series, unit: attrs.kv.unit || '', max: number(attrs.kv.max, null), icon: attrs.kv.icon, per: number(attrs.kv.per, null), title: attrs.kv.title,
    });
    return this.stepped(`<figure${attrsHtml(attrs, `q-chart q-chart-${type}`)}>${html}</figure>`, start);
  }

  component(rest, body, line) {
    const { title: name, id } = titleAndId(rest, 'component');
    const { opts, rest: content } = readOptions(body);
    if (!/^[a-z][\w-]*$/i.test(name)) {
      this.at(line, '"::: component" needs a component name, for example "::: component countdown".');
      return '';
    }
    const spec = { id: `${id}-${this.root.components.length}`, name, params: opts, text: content.map((l) => l.text).join('\n').trim() };
    this.root.components.push(spec);
    const html = `<div class="q-component" data-component="${escapeHtml(spec.id)}"></div>`;
    if (!opts.audience) return html;
    // "audience:" makes the component ask the audience something.
    const ask = this.componentInput(id, name, opts, line);
    if (!ask) return html;
    spec.interaction = ask.id;
    this.root.interactions.push(ask);
    return `${html}<div class="q-interaction" data-interaction="${escapeHtml(ask.id)}"></div>`;
  }

  componentInput(id, name, opts, line) {
    const kind = String(opts.audience).trim().toLowerCase();
    if (!INPUTS.includes(kind)) {
      this.at(line, `"audience: ${opts.audience}" should be one of: ${INPUTS.join(', ')}.`);
      return null;
    }
    const ask = { id: id.startsWith('component-') ? `${name}-${id.slice(10)}` : id, kind: 'input', input: kind, title: opts.prompt || '' };
    if (kind === 'choice' || kind === 'choices') {
      ask.options = (opts.options || '').split('|').map((o) => o.trim()).filter(Boolean);
      if (ask.options.length < 2) this.at(line, `"audience: ${kind}" needs "options: A | B | C".`);
    } else if (kind === 'number') {
      ask.min = number(opts.min, null);
      ask.max = number(opts.max, null);
    } else {
      ask.length = Math.min(140, Math.max(1, number(opts.length, 40)));
      ask.examples = (opts.examples || '').split('|').map((o) => o.trim()).filter(Boolean);
    }
    if (this.root.interactions.length) this.at(line, 'A slide can only ask the audience one thing at a time.');
    return ask;
  }

  interaction(kind, rest, body, line) {
    const { title, id, attrs } = titleAndId(rest, kind);
    this.checkAttrs(attrs, line, { keys: ['chart', 'reveal'] });
    const { opts, rest: content } = readOptions(body, kind === 'sentence' ? null : OPTION_KEYS[kind]);
    const spec = { id, kind, title: title || '' };
    if (attrs.kv.chart) {
      const styles = RESULT_STYLES[kind] || [];
      if (styles.includes(attrs.kv.chart)) spec.chart = attrs.kv.chart;
      else this.at(line, `"chart=${attrs.kv.chart}" is not a look for ${kind}. Use one of: ${styles.join(', ')}.`);
    }
    if (attrs.kv.reveal) {
      if (TOKENS.reveal.values.includes(attrs.kv.reveal)) spec.revealStyle = attrs.kv.reveal;
      else this.at(line, `"reveal=${attrs.kv.reveal}" is not a reveal. Use one of: ${TOKENS.reveal.values.join(', ')}.`);
    }

    if (kind === 'poll' || kind === 'multi') {
      const items = listItems(content);
      spec.options = items.map((it) => it.text);
      const correct = items.filter((it) => it.checked).map((it) => it.text);
      if (correct.length) spec.answer = kind === 'poll' ? correct[0] : correct;
      if (spec.options.length < 2) this.at(line, `"::: ${kind}" needs at least two options as a list ("- Option").`);
      if (new Set(spec.options).size !== spec.options.length) this.at(line, `"::: ${kind}" has repeated options.`);
    } else if (kind === 'estimate') {
      spec.answer = number(opts.answer, undefined);
      spec.min = number(opts.min, 0);
      spec.max = number(opts.max, spec.answer !== undefined ? Math.max(spec.answer * 1000, 100) : 1e9);
      spec.scale = opts.scale === 'log' ? 'log' : 'linear';
      spec.unit = opts.unit || '';
      if (opts.label) spec.answerLabel = opts.label;
      spec.year = opts.format === 'year';
      if (spec.answer !== undefined && (spec.answer < spec.min || spec.answer > spec.max)) {
        this.at(line, `"::: estimate" answer ${spec.answer} is outside min/max.`);
      }
    } else if (kind === 'rounds') {
      spec.options = (opts.options || 'Yes | No').split('|').map((o) => o.trim()).filter(Boolean);
      spec.items = listItems(content).map((it) => it.text);
      if (!spec.items.length) this.at(line, '"::: rounds" needs a list of items, one per round.');
    } else if (kind === 'sentence') {
      spec.start = title;
      spec.maxWords = number(opts.max, 8);
      spec.routes = {};
      Object.entries(opts).forEach(([k, v]) => {
        if (k === 'max') return;
        const key = k === 'start' ? '' : k.toLowerCase().trim();
        spec.routes[key] = v.split('|').map((o) => o.trim()).filter(Boolean).slice(0, 6);
      });
      if (!spec.routes['']) this.at(line, '"::: sentence" needs a "start:" line with the first options, for example "start: into | energy | sugar".');
    } else if (kind === 'questions') {
      spec.mode = opts.mode === 'latest' ? 'latest' : 'top';
      spec.id = 'questions';
    }

    // Anything else inside the block is shown when the answer is revealed.
    const extra = content.filter((l) => !/^\s*[-*+]\s/.test(l.text) || kind === 'sentence');
    const explanation = kind === 'sentence' || kind === 'rounds' ? [] : extra;
    if (explanation.some((l) => l.text.trim())) {
      const inner = new SlideParser(explanation, this.slideIndex, this.warn, this.ctx);
      spec.reveal = inner.blocks(explanation).join('');
    }
    if (this.root.interactions.some((x) => x.id === spec.id) && kind !== 'questions') {
      this.at(line, `Two interactions share the id "${spec.id}". Give one of them {#another-id}.`);
    }
    this.root.interactions.push(spec);
    return `<div class="q-interaction" data-interaction="${escapeHtml(spec.id)}"></div>`;
  }
}

// Layouts with a picture on its own: the first figure of the slide moves out
// of the content into a media pane.
const MEDIA_LAYOUTS = ['split', 'full'];

function takeMedia(html) {
  // The figure may carry a source map (data-src) in the studio.
  const m = html.match(/<figure(?: data-src="[\d-]+")?>(?:(?!<\/figure>)[\s\S])*?<(?:img|video)[\s\S]*?<\/figure>/);
  if (!m) return { html, media: '' };
  return { html: html.slice(0, m.index) + html.slice(m.index + m[0].length), media: m[0] };
}

// A slide id from its title: "Why bread rises!" becomes "why-bread-rises".
export function slug(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

function uniqueId(base, index, used) {
  let id = base || `s${index + 1}`;
  let n = 2;
  while (used.has(id)) { id = `${base || `s${index + 1}`}-${n}`; n += 1; }
  used.add(id);
  return id;
}

// Parses a whole talk. Returns { meta, slides, warnings }.
//
// options.readFile(path): reads a file in the talk folder (for theme files),
// returning its text, or null when it does not exist. Only the quorum
// command has one; in the browser theme files are already merged.
export function parseTalk(source, { readFile = null, sourceMap = false } = {}) {
  const warnings = [];
  const all = String(source).replace(/\r\n?/g, '\n').split('\n');
  const { meta: front, rest } = frontMatter(all);
  const offset = all.length - rest.length;
  const warn = (m) => warnings.push(m);

  const t = theme(front, warn, readFile);
  const preset = PRESETS[t.preset];
  const meta = t.source;
  const branding = brand(meta, preset, warn);
  const tokenValues = tokens(meta, preset, warn);
  let mode = t.mode;
  if (meta.mode) {
    if (TOKENS.mode.values.includes(meta.mode)) mode = meta.mode;
    else warn(`"mode: ${meta.mode}" should be light or dark.`);
  }
  if (!mode) mode = meta.background ? (isDark(meta.background) ? 'dark' : 'light') : preset.mode;
  // Themes whose colours were chosen for one mode: the other mode keeps the
  // accent and lets Quorum pick the greys.
  if (mode !== preset.mode && !meta.background) {
    branding.background = '';
    if (!meta.text) branding.text = '';
    if (!meta.primary) branding.primary = '';
  }

  const ctx = { series: branding.series, sourceMap };
  const usedIds = new Set();
  const slides = splitSlides(rest).map((lines, index) => {
    lines.forEach((l) => { l.n += offset; });
    const slideWarn = (m) => warnings.push(`Slide ${index + 1}, ${m.charAt(0).toLowerCase()}${m.slice(1)}`);
    const p = new SlideParser(lines, index, slideWarn, ctx);
    p.step = 0;
    let html = p.blocks(lines).join('');
    if (p.interactions.length > 1) {
      warnings.push(`Slide ${index + 1} has ${p.interactions.length} interactions; only the first one is shown on phones.`);
    }
    const plain = (p.title || '').replace(/<[^>]+>/g, '');
    const section = p.attrs.section ? p.attrs.section.split(',').map((x) => x.trim()) : null;
    const [layoutName, ...layoutOptions] = (p.attrs.layout || '').split(',').map((x) => x.trim().toLowerCase());
    if (layoutName && !LAYOUTS[layoutName]) {
      warnings.push(`Slide ${index + 1}: the layout "${layoutName}" does not exist. Use one of: ${Object.keys(LAYOUTS).join(', ')}.`);
    }
    let transition = '';
    if (p.attrs.transition) {
      const v = p.attrs.transition.toLowerCase();
      if (TOKENS.transition.values.includes(v)) transition = v;
      else warnings.push(`Slide ${index + 1}: the transition "${p.attrs.transition}" does not exist. Use one of: ${TOKENS.transition.values.join(', ')}.`);
    }
    let mediaHtml = '';
    if (MEDIA_LAYOUTS.includes(layoutName)) {
      const taken = takeMedia(html);
      html = taken.html;
      mediaHtml = taken.media;
      if (!mediaHtml) warnings.push(`Slide ${index + 1}: the layout "${layoutName}" needs an image or a video on its own line.`);
    }
    const titleText = plain || (p.interactions[0] && p.interactions[0].title) || '';
    if (p.canvas && p.canvas.length) {
      const at = (m) => warnings.push(`Slide ${index + 1}: ${m}`);
      const boxes = p.canvas;
      if (layoutName !== 'canvas') at('x=, y=, w= and h= place things freely only with <!-- layout: canvas -->.');
      boxes.forEach((b) => {
        if ([b.x, b.y].some((v) => v !== null && (v < 0 || v > 100)) || (b.x !== null && b.w !== null && b.x + b.w > 100.5) || (b.y !== null && b.h !== null && b.y + b.h > 100.5)) {
          at(`line ${b.line}: this element sticks out of the slide (x, y, w and h are shares of the slide, from 0 to 100).`);
        }
      });
      const sized = boxes.filter((b) => [b.x, b.y, b.w, b.h].every((v) => v !== null));
      for (let i = 0; i < sized.length; i += 1) {
        for (let j = i + 1; j < sized.length; j += 1) {
          const [a, c] = [sized[i], sized[j]];
          const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
          const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
          if (ox > 0 && oy > 0 && (ox * oy) / Math.min(a.w * a.h, c.w * c.h) > 0.25) at(`lines ${a.line} and ${c.line} overlap. Move one of them.`);
        }
      }
    }
    const id = uniqueId(p.attrs.id ? slug(p.attrs.id) : slug(titleText), index, usedIds);
    const filled = lines.filter((l) => l.text.trim() !== '');
    if (p.css.length) html += scopedCss(p.css.join('\n'), id);
    return {
      index,
      id,
      lines: [filled[0].n, filled[filled.length - 1].n],
      title: plain || (p.interactions[0] && p.interactions[0].title) || `Slide ${index + 1}`,
      html,
      media: mediaHtml,
      steps: p.step + 1,
      layout: LAYOUTS[layoutName] ? layoutName : '',
      layoutOptions,
      transition,
      background: slideBackground(p.attrs.background, (m) => warnings.push(`Slide ${index + 1}: ${m}`)),
      logo: p.attrs.logo !== 'off',
      // "on", "off" or "" (the default: everywhere but the first slide).
      footer: ['on', 'off'].includes(p.attrs.footer) ? p.attrs.footer : '',
      notes: p.notes.join('\n\n'),
      interaction: p.interactions[0] || null,
      components: p.components,
      join: !!p.hasJoin,
      section: section ? { name: section[0], minutes: number(section[1], null) } : null,
    };
  });

  // Sections: numbers for section dividers and lists for agenda slides.
  const sections = slides.filter((s) => s.section).map((s) => ({ name: s.section.name, index: s.index }));
  slides.forEach((s) => {
    if (s.layout === 'section') {
      const k = sections.findIndex((x) => x.index >= s.index);
      if (k >= 0 && (s.section || sections[k].index === s.index)) {
        s.html = `<p class="q-section-number">${String(k + 1).padStart(2, '0')}</p>${s.html}`;
      }
    }
    if (s.layout === 'agenda') {
      if (!sections.length) warnings.push(`Slide ${s.index + 1}: the agenda layout lists the sections, but the talk has none. Add <!-- section: Name, minutes --> to the slides that start one.`);
      const current = s.section ? s.index : (sections.find((x) => x.index > s.index) || {}).index;
      s.html += `<ol class="q-agenda">${sections.map((x, k) => {
        const state = x.index === current ? 'current' : (x.index < (current ?? Infinity) ? 'done' : '');
        return `<li class="q-agenda-item${state ? ` ${state}` : ''}"><span class="q-agenda-n">${String(k + 1).padStart(2, '0')}</span><span>${escapeHtml(x.name)}</span></li>`;
      }).join('')}</ol>`;
    }
  });

  const ids = new Set();
  slides.forEach((s) => {
    if (s.interaction && s.interaction.kind !== 'questions') {
      if (ids.has(s.interaction.id)) warnings.push(`The interaction id "${s.interaction.id}" is used twice.`);
      ids.add(s.interaction.id);
    }
  });
  return {
    meta: {
      title: meta.title || (slides[0] && slides[0].title) || 'Untitled talk',
      author: meta.author || '',
      // "light" or "dark" (named "theme" before presets existed).
      theme: mode,
      mode,
      preset: t.preset,
      lang: meta.lang || 'en',
      duration: number(meta.duration, null),
      ...branding,
      tokens: tokenValues,
      footer: footer(meta.footer),
      reactions: reactions(meta.reactions, warn),
      phone: phone(meta, warn),
    },
    slides,
    warnings,
  };
}

// Slides only: none where the audience answers. Slides with a join block
// stay (it is often the title slide); the presentation hides the block.
export function withoutAudience(talk) {
  const slides = talk.slides
    .filter((slide) => !slide.interaction)
    .map((slide, index) => ({ ...slide, index, join: false }));
  return { ...talk, slides };
}
