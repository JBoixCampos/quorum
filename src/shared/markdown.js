// Quorum talk format: a Markdown file with front matter, `---` between
// slides, `--` between steps, and `::: name` blocks for layouts,
// interactions, speaker notes and components.
//
// The parser has no dependencies and runs both in Node (the server needs
// the interaction definitions to validate votes) and in the browser.

import { isDark } from './color.js';

const INTERACTIONS = new Set(['poll', 'multi', 'estimate', 'rounds', 'sentence', 'questions']);
const LAYOUTS = new Set(['columns', 'center', 'stat', 'callout']);

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A safe URL for links and images: http(s), relative paths, anchors, mailto.
function safeUrl(url) {
  const u = url.trim();
  if (/^(https?:|mailto:|\/|\.\/|\.\.\/|#)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  return '#';
}

// Inline Markdown: code, images, links, bold, italics, strikethrough, line breaks.
export function inline(text) {
  const tokens = [];
  const hold = (html) => {
    tokens.push(html);
    return `\u0000${tokens.length - 1}\u0000`;
  };
  let s = String(text);
  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, src, title) => hold(
    `<img src="${escapeHtml(safeUrl(src))}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`,
  ));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => hold(
    `<a href="${escapeHtml(safeUrl(href))}" target="_blank" rel="noopener">${inline(label)}</a>`,
  ));
  s = escapeHtml(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}\n|\\\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
}

// Front matter: simple `key: value` lines between two `---` lines at the top.
function frontMatter(lines) {
  const meta = {};
  if (lines[0] !== undefined && lines[0].trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) {
      lines.slice(1, end).forEach((l) => {
        const m = l.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/);
        // "key: value   # a comment": the comment is dropped.
        if (m) meta[m[1]] = unquote(m[2].replace(/\s+#\s.*$/, '').trim());
      });
      return { meta, rest: lines.slice(end + 1) };
    }
  }
  return { meta, rest: lines };
}

// A CSS colour: #hex, a name (navy) or rgb()/hsl().
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(rgb|hsl)a?\([\d\s.,%/]+\))$/i;

// A file in the talk folder: a relative path, never outside it.
export function isLocalPath(p) {
  return typeof p === 'string' && /^[^\s"'()<>\\:]+$/.test(p) && !p.startsWith('/') && !p.split('/').includes('..');
}

const FONT_FILE = /\.(woff2?|ttf|otf)$/i;

// The branding settings of the front matter, checked. `warn` gets a
// message for each value that cannot be used.
function brand(meta, warn) {
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
  const font = (key) => {
    const v = meta[key] || '';
    if (!FONT_FILE.test(v)) return { family: v, file: '' };
    return { family: '', file: file(key) };
  };
  const display = font('font');
  const text = font('text-font');
  return {
    accent: color('accent', '#ff6a00'),
    primary: color('primary'),
    secondary: color('secondary'),
    background: color('background'),
    text: color('text'),
    logo: file('logo'),
    style: file('style'),
    font: display.family,
    fontFile: display.file,
    textFont: text.family,
    textFontFile: text.file,
  };
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

// A slide background: <!-- background: images/photo.jpg, dim --> or a colour.
function slideBackground(value, warn) {
  if (!value) return null;
  const [what, ...flags] = value.split(',').map((x) => x.trim());
  const dim = flags.includes('dim');
  if (COLOR.test(what)) return { color: what, image: '', dim };
  if (isLocalPath(what)) return { color: '', image: what.replace(/^\.\//, ''), dim };
  warn(`the background "${what}" is not a colour or a file in the talk folder.`);
  return null;
}

function unquote(v) {
  const m = v.match(/^(["'])(.*)\1$/);
  return m ? m[2] : v;
}

// Splits the body into slides on lines that are exactly `---`, ignoring
// those inside code fences.
function splitSlides(lines) {
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

// `Question {#my-id}` -> { title: 'Question', id: 'my-id' }
function titleAndId(rest, kind) {
  const m = rest.match(/\{#([a-z0-9][\w-]{0,40})\}/i);
  const title = (m ? rest.replace(m[0], ' ') : rest).replace(/\s+/g, ' ').trim();
  return { title, id: m ? m[1] : `${kind}-${hashId(title)}` };
}

function listItems(body) {
  return body
    .map((l) => l.text.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/))
    .filter(Boolean)
    .map((m) => ({ text: m[2].trim(), checked: m[1] === 'x' || m[1] === 'X' }));
}

function number(v, fallback) {
  if (v === undefined || v === '') return fallback;
  const n = Number(String(v).replace(/[_,\s]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

class SlideParser {
  constructor(lines, slideIndex, warn) {
    this.lines = lines;
    this.slideIndex = slideIndex;
    this.warn = warn;
    this.step = 0;
    this.notes = [];
    this.interactions = [];
    this.components = [];
    this.attrs = {};
  }

  at(line, message) {
    this.warn(`Line ${line.n}: ${message}`);
  }

  // Wraps a block so it appears at the current step.
  stepped(html) {
    return this.step > 0 ? `<div class="q-step" data-step="${this.step}">${html}</div>` : html;
  }

  blocks(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const t = line.text;
      const trimmed = t.trim();

      if (trimmed === '') { i += 1; continue; }

      // Slide attributes: <!-- layout: center --> <!-- id: intro --> <!-- section: Welcome, 5 -->
      const attr = trimmed.match(/^<!--\s*([a-z]+)\s*:\s*(.*?)\s*-->$/i);
      if (attr) {
        this.attrs[attr[1].toLowerCase()] = attr[2];
        i += 1;
        continue;
      }

      if (trimmed === '--') { this.step += 1; i += 1; continue; }

      const fence = t.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
      if (fence) {
        const end = lines.findIndex((l, k) => k > i && l.text.trim().startsWith(fence[1]));
        const stop = end < 0 ? lines.length : end;
        const code = lines.slice(i + 1, stop).map((l) => l.text).join('\n');
        out.push(this.stepped(`<pre><code${fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : ''}>${escapeHtml(code)}</code></pre>`));
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
        if (!this.title) this.title = heading[2];
        out.push(this.stepped(`<h${level}>${inline(heading[2])}</h${level}>`));
        i += 1;
        continue;
      }

      if (/^\s*>/.test(t)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i].text)) {
          quote.push({ ...lines[i], text: lines[i].text.replace(/^\s*>\s?/, '') });
          i += 1;
        }
        const inner = new SlideParser(quote, this.slideIndex, this.warn);
        out.push(this.stepped(`<blockquote>${inner.blocks(quote).join('')}</blockquote>`));
        continue;
      }

      if (/^\s*([-*+]|\d+[.)])\s+/.test(t)) {
        const items = [];
        while (i < lines.length && lines[i].text.trim() !== '' && !/^\s*(:{3,}|--\s*$)/.test(lines[i].text)) {
          items.push(lines[i]);
          i += 1;
        }
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
      while (i < lines.length) {
        const l = lines[i].text;
        if (l.trim() === '' || /^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|:{3,}|```|~~~|--\s*$|<!--)/.test(l)) break;
        para.push(l);
        i += 1;
      }
      if (para.length === 0) { i += 1; continue; }
      const textP = para.join('\n');
      const onlyImage = textP.trim().match(/^!\[[^\]]*\]\([^)]+\)$/);
      out.push(this.stepped(onlyImage ? `<figure>${inline(textP.trim())}</figure>` : `<p>${inline(textP)}</p>`));
    }
    return out;
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
      html.push(`<li>${box}${inline(m[4])}`);
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
      this.notes.push(body.map((l) => l.text).join('\n').trim());
      return '';
    }
    if (INTERACTIONS.has(name)) return this.stepped(this.interaction(name, rest, body, line));
    if (name === 'component') return this.stepped(this.component(rest, body, line));
    if (name === 'join') {
      this.hasJoin = true;
      return this.stepped(`<div class="q-join" data-join>${inline(rest || '')}</div>`);
    }
    if (LAYOUTS.has(name)) return this.layout(name, rest, body);
    this.at(line, `Unknown block "::: ${name}". Its content is shown as plain text.`);
    return this.blocks(body).join('');
  }

  layout(name, rest, body) {
    if (name === 'columns') {
      const cols = [[]];
      body.forEach((l) => {
        if (l.text.trim() === '+++') cols.push([]);
        else cols[cols.length - 1].push(l);
      });
      const html = cols.map((c) => `<div class="q-col">${this.blocks(c).join('')}</div>`).join('');
      return `<div class="q-columns" style="--cols:${cols.length}">${html}</div>`;
    }
    if (name === 'stat') {
      const inner = this.blocks(body).join('');
      return this.stepped(`<div class="q-stat"><p class="q-stat-value">${inline(rest)}</p>${inner}</div>`);
    }
    if (name === 'callout') {
      return this.stepped(`<div class="q-callout">${rest ? `<p class="q-callout-title">${inline(rest)}</p>` : ''}${this.blocks(body).join('')}</div>`);
    }
    // center
    return `<div class="q-center">${this.blocks(body).join('')}</div>`;
  }

  component(rest, body, line) {
    const { title: name, id } = titleAndId(rest, 'component');
    const { opts, rest: content } = readOptions(body);
    if (!/^[a-z][\w-]*$/i.test(name)) {
      this.at(line, '"::: component" needs a component name, for example "::: component countdown".');
      return '';
    }
    const spec = { id: `${id}-${this.components.length}`, name, params: opts, text: content.map((l) => l.text).join('\n').trim() };
    this.components.push(spec);
    const html = `<div class="q-component" data-component="${escapeHtml(spec.id)}"></div>`;
    if (!opts.audience) return html;
    // "audience:" makes the component ask the audience something.
    const ask = this.componentInput(id, name, opts, line);
    if (!ask) return html;
    spec.interaction = ask.id;
    this.interactions.push(ask);
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
    if (this.interactions.length) this.at(line, 'A slide can only ask the audience one thing at a time.');
    return ask;
  }

  interaction(kind, rest, body, line) {
    const { title, id } = titleAndId(rest, kind);
    const { opts, rest: content } = readOptions(body, kind === 'sentence' ? null : OPTION_KEYS[kind]);
    const notes = [];
    const spec = { id, kind, title: title || '' };

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
      const inner = new SlideParser(explanation, this.slideIndex, this.warn);
      spec.reveal = inner.blocks(explanation).join('');
    }
    if (this.interactions.some((x) => x.id === spec.id) && kind !== 'questions') {
      this.at(line, `Two interactions share the id "${spec.id}". Give one of them {#another-id}.`);
    }
    notes.forEach((n) => this.notes.push(n));
    this.interactions.push(spec);
    return `<div class="q-interaction" data-interaction="${escapeHtml(spec.id)}"></div>`;
  }
}

// Parses a whole talk. Returns { meta, slides, warnings }.
export function parseTalk(source) {
  const warnings = [];
  const all = String(source).replace(/\r\n?/g, '\n').split('\n');
  const { meta, rest } = frontMatter(all);
  const offset = all.length - rest.length;
  const slides = splitSlides(rest).map((lines, index) => {
    lines.forEach((l) => { l.n += offset; });
    const p = new SlideParser(lines, index, (m) => warnings.push(`Slide ${index + 1}, ${m.charAt(0).toLowerCase()}${m.slice(1)}`));
    const html = p.blocks(lines).join('');
    if (p.interactions.length > 1) {
      warnings.push(`Slide ${index + 1} has ${p.interactions.length} interactions; only the first one is shown on phones.`);
    }
    const plain = (p.title || '').replace(/<[^>]+>/g, '');
    const section = p.attrs.section ? p.attrs.section.split(',').map((x) => x.trim()) : null;
    return {
      index,
      id: p.attrs.id || `s${index + 1}`,
      title: plain || (p.interactions[0] && p.interactions[0].title) || `Slide ${index + 1}`,
      html,
      steps: p.step + 1,
      layout: p.attrs.layout || '',
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
      // Without a theme, a dark background makes it dark.
      theme: (meta.theme ? meta.theme === 'dark' : isDark(meta.background)) ? 'dark' : 'light',
      lang: meta.lang || 'en',
      duration: number(meta.duration, null),
      ...brand(meta, (m) => warnings.push(m)),
      footer: footer(meta.footer),
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
