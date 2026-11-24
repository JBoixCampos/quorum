// A small Markdown renderer for the documentation pages. It covers what
// docs/*.md uses: headings, paragraphs, lists, tables, fenced code, inline
// code, images, links, bold and emphasis. It has no dependencies on purpose.

import { escapeHtml } from '../../src/shared/text.js';

export { escapeHtml };

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Inline Markdown. `link(href)` may rewrite link targets.
export function inline(text, link = (href) => href) {
  const held = [];
  const hold = (html) => {
    held.push(html);
    return `\u0000${held.length - 1}\u0000`;
  };
  let s = String(text);
  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => hold(
    `<img src="${escapeHtml(link(src))}" alt="${escapeHtml(alt)}" loading="lazy">`,
  ));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const target = link(href);
    const external = /^https?:/.test(target);
    return hold(`<a href="${escapeHtml(target)}"${external ? ' rel="noopener"' : ''}>${inline(label, link)}</a>`);
  });
  s = escapeHtml(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]);
}

function splitRow(row) {
  const cells = [];
  let cell = '';
  let code = false;
  const body = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '\\' && body[i + 1] === '|') {
      cell += '|';
      i += 1;
    } else if (c === '`') {
      code = !code;
      cell += c;
    } else if (c === '|' && !code) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += c;
    }
  }
  cells.push(cell.trim());
  return cells;
}

const BLOCK_START = /^\s*(#{1,6}\s|```|~~~|[-*+]\s|\d+[.)]\s|\||>)/;

// Renders Markdown to HTML. Options:
//   link(href)            rewrites link targets
//   code(lang, text)      returns extra HTML to put after a code block
// Returns { html, title, headings: [{ level, text, id }] }.
export function render(source, { link, code } = {}) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const ids = new Set();
  let title = '';
  let i = 0;

  const uniqueId = (text) => {
    const base = slugify(text) || 'section';
    let id = base;
    for (let n = 2; ids.has(id); n += 1) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') { i += 1; continue; }

    // HTML comments are left out (docs use them as build markers).
    if (/^<!--.*-->$/.test(t)) {
      const marker = t.match(/^<!--\s*([a-z-]+):\s*(.*?)\s*-->$/);
      if (marker) out.push({ marker: marker[1], value: marker[2] });
      i += 1;
      continue;
    }

    const fence = line.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      const text = body.join('\n');
      const lang = fence[2];
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(text)}</code></pre>${code ? code(lang, text) : ''}`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1 && !title) {
        title = text;
        i += 1;
        continue;
      }
      const id = uniqueId(text);
      headings.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(text, link)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && lines[i + 1] && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const th = head.map((c) => `<th>${inline(c, link)}</th>`).join('');
      const body = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, link)}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="table"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }

    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (m) {
          items.push(m[3]);
        } else if (lines[i].trim() !== '' && /^\s+/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
        } else {
          break;
        }
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x, link)}</li>`).join('')}</${tag}>`);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${render(quote.join('\n'), { link }).html}</blockquote>`);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && (para.length === 0 || !BLOCK_START.test(lines[i]))) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '), link)}</p>`);
  }

  return {
    title,
    headings,
    // Markers (<!-- name: value -->) are objects until a caller replaces them.
    blocks: out,
    html: out.filter((b) => typeof b === 'string').join('\n'),
  };
}

// The first paragraph as plain text, for descriptions.
export function firstParagraph(source) {
  const { blocks } = render(source);
  const p = blocks.find((b) => typeof b === 'string' && b.startsWith('<p>'));
  return p ? p.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
}
