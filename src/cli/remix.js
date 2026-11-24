// Remix: other ways to lay out the same slide, without an agent. Quorum
// knows its own blocks and layouts, so it can read what a slide holds (a
// list of short items, numbers, two sides, a picture and a paragraph, one
// strong sentence) and write the same content in the structures that fit.
// Free, fast and predictable: a baseline for agents and people to beat.
//
// Input and output are the Markdown text of one slide.

const ATTR = /^<!--\s*([a-z]+)\s*:\s*(.*?)\s*-->$/i;
const INTERACTIVE = ['poll', 'multi', 'estimate', 'rounds', 'sentence', 'questions', 'component', 'join'];

// --- reading a slide ---------------------------------------------------------

function directiveEnd(lines, start, colons) {
  let depth = 0;
  for (let k = start + 1; k < lines.length; k += 1) {
    const m = lines[k].match(/^\s*(:{3,})\s*([a-z][\w-]*)?/i);
    if (!m || m[1].length !== colons) continue;
    if (m[2]) depth += 1;
    else if (depth === 0) return k;
    else depth -= 1;
  }
  return lines.length;
}

export function readSlide(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const attrs = [];
  const blocks = [];
  let title = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') { i += 1; continue; }
    const attr = t.match(ATTR);
    if (attr) { attrs.push({ key: attr[1].toLowerCase(), value: attr[2], line: t }); i += 1; continue; }
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      let end = lines.findIndex((l, k) => k > i && l.trim().startsWith(fence[1]));
      if (end < 0) end = lines.length - 1;
      blocks.push({ type: 'code', raw: lines.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    const dir = line.match(/^\s*(:{3,})\s*([a-z][\w-]*)\s*(.*)$/i);
    if (dir) {
      const end = directiveEnd(lines, i, dir[1].length);
      blocks.push({
        type: 'directive', name: dir[2].toLowerCase(), rest: dir[3].trim(), body: lines.slice(i + 1, end), raw: lines.slice(i, end + 1),
      });
      i = end + 1;
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const block = { type: 'heading', level: heading[1].length, text: heading[2], raw: [line.trim()] };
      if (!title) title = block;
      else blocks.push(block);
      i += 1;
      continue;
    }
    if (/^--(\s+[a-z]+)?$/i.test(t)) { blocks.push({ type: 'step', raw: [t] }); i += 1; continue; }
    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i]); i += 1; }
      blocks.push({ type: 'quote', raw: q, text: q.map((l) => l.replace(/^\s*>\s?/, '')).join(' ').trim() });
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items = [];
      const raw = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^\s*(:{3,}|--(\s+[a-z]+)?\s*$)/i.test(lines[i])) {
        raw.push(lines[i]);
        if (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '').trim());
        else if (items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        i += 1;
      }
      blocks.push({ type: 'list', items, raw, nested: raw.some((l) => /^\s{2,}([-*+]|\d+[.)])\s+/.test(l)) });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i += 1; }
      blocks.push({ type: 'table', raw: rows });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|:{3,}|```|~~~|--(\s+[a-z]+)?\s*$|<!--)/i.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (!para.length) { i += 1; continue; }
    const joined = para.join(' ').trim();
    blocks.push({ type: /^!\[[^\]]*\]\([^)]+\)(\{[^}]*\})?$/.test(joined) ? 'image' : 'para', raw: para, text: joined });
  }
  return { attrs, title, blocks };
}

// --- items ---------------------------------------------------------------------

const stripAttrs = (s) => s.replace(/\s*\{[^}]*\}\s*$/, '').trim();

function splitItem(text) {
  const m = text.match(/^(.{1,40}?)\s*:\s+(.+)$/);
  return m ? { label: m[1].trim(), detail: m[2].trim() } : { label: text.trim(), detail: '' };
}

// The short items a slide holds, whichever block they are in.
function itemsOf(block) {
  if (block.type === 'list' && !block.nested) return block.items.map(splitItem);
  if (block.type !== 'directive') return null;
  if (['steps', 'timeline', 'kpis'].includes(block.name)) {
    return block.body.filter((l) => /^\s*[-*+]\s+/.test(l)).map((l) => splitItem(l.replace(/^\s*[-*+]\s+/, '')));
  }
  if (block.name === 'chart') {
    const unit = (block.rest.match(/unit=("[^"]*"|\S+)/) || [])[1];
    return block.body.filter((l) => /^[^:]+:\s*-?\d/.test(l)).map((l) => {
      const m = l.match(/^(.+?):\s*(-?\d[\d.,]*)\s*(\S*)$/);
      return { label: m[1].trim(), detail: `${m[2]}${unit ? ` ${unit.replace(/"/g, '')}` : (m[3] ? ` ${m[3]}` : '')}`, chart: true };
    });
  }
  if (block.name === 'cards') {
    const columns = block.body.join('\n').split(/^\s*\+\+\+\s*$/m);
    return columns.map((col) => {
      const rows = col.split('\n').filter((l) => l.trim() !== '');
      const head = rows.find((l) => /^\s*#{1,6}\s+/.test(l));
      const detail = rows.filter((l) => l !== head).join(' ').trim();
      const label = head ? stripAttrs(head.replace(/^\s*#{1,6}\s+/, '')) : (rows[0] || '');
      const icon = head && head.match(/\{[^}]*icon=([\w-]+)/);
      return { label, detail: head ? detail : rows.slice(1).join(' ').trim(), icon: icon ? icon[1] : '' };
    }).filter((x) => x.label);
  }
  return null;
}

const NUMBER = /^[~$€£]?\s?-?\d[\d.,]*\s?(%|[a-zA-Z]{1,8})?$/;
function parseNumber(text) {
  const m = String(text).match(/^[~$€£]?\s?(-?\d[\d.,]*)\s?(%|[a-zA-Z]{1,8})?\b/);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(value) ? { value, unit: m[2] || '' } : null;
}

// --- writing ---------------------------------------------------------------------

const heading = (level, text) => `${'#'.repeat(level)} ${text}`;

function writeCards(items, steps = false) {
  const cols = items.map((it) => `${heading(3, `${it.label}${it.icon ? ` {icon=${it.icon}}` : ''}`)}${it.detail ? `\n${it.detail}` : ''}`);
  return [`::: cards${steps ? ' {.steps}' : ''}`, cols.join('\n\n+++\n\n'), ':::'].join('\n');
}
const writeList = (name, items, rest = '') => [`::: ${name}${rest}`, ...items.map((it) => `- ${it.detail ? `${it.label}: ${it.detail}` : it.label}`), ':::'].join('\n');

function chartRows(items) {
  const rows = items.map((it) => {
    const n = parseNumber(it.detail || '');
    return n ? { label: it.label, ...n } : null;
  });
  if (rows.some((r) => r === null)) return null;
  return rows;
}

// --- recipes -----------------------------------------------------------------------

const KINDS = ['cards', 'steps', 'timeline', 'kpis'];

export function remix(text) {
  const slide = readSlide(text);
  const layoutAttr = slide.attrs.find((a) => a.key === 'layout');
  const current = layoutAttr ? layoutAttr.value.split(',')[0].trim().toLowerCase() : '';
  if (slide.blocks.some((b) => b.type === 'directive' && INTERACTIVE.includes(b.name))) {
    return { variants: [], reason: 'The audience answers on this slide, so Quorum does not rearrange it. Explore the slides around it.' };
  }
  const out = [];
  const seen = new Set([text.trim()]);
  const header = (layout) => [...slide.attrs.filter((a) => a.key !== 'layout').map((a) => a.line), ...(layout ? [`<!-- layout: ${layout} -->`] : [])];
  const build = (name, direction, { layout = '', blocks = slide.blocks, title = slide.title }) => {
    const parts = [];
    const head = header(layout);
    if (head.length) parts.push(head.join('\n'));
    if (title) parts.push(title.raw.join('\n'));
    blocks.forEach((b) => parts.push(typeof b === 'string' ? b : b.raw.join('\n')));
    const result = `${parts.join('\n\n')}\n`.trim();
    if (!result || seen.has(result.trim())) return;
    seen.add(result.trim());
    out.push({ name, direction, text: `${result}\n` });
  };
  const withLayout = (name, direction, layout) => { if (layout !== current) build(name, direction, { layout }); };

  // The primary block: the one with the items.
  const at = slide.blocks.findIndex((b) => itemsOf(b) && itemsOf(b).length >= 2);
  const primary = at >= 0 ? slide.blocks[at] : null;
  const items = primary ? itemsOf(primary) : null;
  const swap = (block, layout = '') => (name, direction) => {
    const blocks = slide.blocks.map((b, k) => (k === at ? block : b));
    build(name, direction, { blocks, layout });
  };

  if (items && items.length >= 2 && items.every((it) => it.label.length <= 90 && (it.detail || '').length <= 140)) {
    const n = items.length;
    const own = primary.type === 'directive' ? primary.name : 'list';
    const chartType = own === 'chart' ? (primary.rest.match(/^(?:chart\s+)?(\w+)/) || [])[1] : '';
    const short = items.filter((it) => it.label.length <= 40).length === n;
    if (n >= 2 && n <= 6 && short && own !== 'cards') swap(writeCards(items))('cards', 'as cards');
    if (n >= 3 && n <= 6 && short && own !== 'steps') swap(writeList('steps', items))('steps', 'as the steps of a process');
    if (n >= 3 && n <= 7 && own !== 'timeline' && items.filter((it) => it.detail && it.label.length <= 16).length >= Math.ceil(n * 0.6)) {
      swap(writeList('timeline', items))('timeline', 'as a timeline');
    }
    const numeric = items.filter((it) => NUMBER.test(it.label) || /^[~$€£]?\s?-?\d[\d.,]*\s?(%|[a-zA-Z]{1,8})?(\s|$)/.test(it.label)).length;
    if (n >= 2 && n <= 4 && own !== 'kpis' && numeric >= Math.ceil(n * 0.6)) swap(writeList('kpis', items))('kpis', 'as key figures');
    if (own !== 'list' && n >= 2 && !items.some((it) => it.chart)) {
      swap(items.map((it) => `- ${it.detail ? `**${it.label}**: ${it.detail}` : it.label}`).join('\n'))('list', 'as a plain list');
    }
    if (own === 'chart' && n <= 4) {
      const figures = items.map((it) => ({ label: it.detail, detail: it.label }));
      swap(writeList('kpis', figures))('kpis', 'as key figures');
    }
    const rows = chartRows(items);
    if (rows && n >= 3 && n <= 8) {
      const units = new Set(rows.map((r) => r.unit));
      const unit = units.size === 1 && [...units][0] ? ` unit=${[...units][0]}` : '';
      const data = rows.map((r) => `${r.label}: ${r.value}`).join('\n');
      const chart = (type) => `::: chart ${type}${unit ? ` {${unit.trim()}}` : ''}\n${data}\n:::`;
      const only = (type) => !(own === 'chart' && chartType === type);
      if (only('bar')) swap(chart('bar'))('chart-bars', 'as a bar chart');
      if (only('column')) swap(chart('column'))('chart-columns', 'as a column chart');
      if (n <= 6 && rows.every((r) => r.value >= 0) && only('donut')) swap(chart('donut'))('chart-donut', 'as a donut chart');
      if (own === 'chart' && only('line')) swap(chart('line'))('chart-line', 'as a line chart');
    }
    if (n >= 3 && own === 'list') {
      const spaced = [];
      primary.items.forEach((it, k) => {
        if (k > 0) spaced.push('--');
        spaced.push(`- ${it}`);
      });
      swap(spaced.join('\n\n'))('reveal', 'one item at a time, one click each');
    }
    if (n >= 3 && n <= 4 && own !== 'cards' && short) {
      const cards = writeCards(items, true);
      swap(cards)('cards-reveal', 'as cards that appear one by one');
    }
  }

  // A table of numbers.
  const table = slide.blocks.find((b) => b.type === 'table');
  if (table) {
    const rows = table.raw.filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l)).map((l) => l.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()));
    const data = rows.slice(1).map((r) => ({ label: r[0], n: parseNumber(r[1] || '') }));
    if (data.length >= 3 && data.length <= 8 && data.every((d) => d.n)) {
      const units = new Set(data.map((d) => d.n.unit));
      const unit = units.size === 1 && [...units][0] ? ` {unit=${[...units][0]}}` : '';
      const lines = data.map((d) => `${d.label}: ${d.n.value}`).join('\n');
      const replace = (block, name, direction) => build(name, direction, { blocks: slide.blocks.map((b) => (b === table ? block : b)) });
      replace(`::: chart column${unit}\n${lines}\n:::`, 'table-columns', 'the table as a column chart');
      replace(`::: chart bar${unit}\n${lines}\n:::`, 'table-bars', 'the table as a bar chart');
      if (data.length <= 4) replace(`::: kpis\n${data.map((d) => `- ${d.n.value}${d.n.unit ? ` ${d.n.unit}` : ''}: ${d.label}`).join('\n')}\n:::`, 'table-kpis', 'the table as key figures');
    }
  }

  // Two sides: two headings with content, or two lists.
  const heads = slide.blocks.filter((b) => b.type === 'heading');
  if (heads.length === 2 && !slide.blocks.some((b) => b.type === 'directive' && ['compare', 'cards'].includes(b.name))) {
    const [a, b] = heads;
    const ia = slide.blocks.indexOf(a);
    const ib = slide.blocks.indexOf(b);
    const first = slide.blocks.slice(ia + 1, ib);
    const second = slide.blocks.slice(ib + 1);
    const before = slide.blocks.slice(0, ia);
    if (first.length && second.length) {
      const side = (h, rest) => [h.raw.join('\n'), ...rest.map((x) => x.raw.join('\n'))].join('\n\n');
      const body = `${side(a, first)}\n\n+++\n\n${side(b, second)}`;
      build('compare', 'as two sides to compare', { blocks: [...before, `::: compare {vs="or"}\n${body}\n:::`] });
      build('two-cards', 'as two cards', { blocks: [...before, `::: cards\n${body}\n:::`] });
    }
  }

  // A picture and some words.
  const image = slide.blocks.find((b) => b.type === 'image');
  const words = slide.blocks.filter((b) => ['para', 'list'].includes(b.type));
  if (image && words.length && !['split', 'full'].includes(current)) {
    build('picture-left', 'the picture on the left half', { layout: 'split' });
    build('picture-right', 'the picture on the right half', { layout: 'split, right' });
    build('picture-full', 'the picture fills the slide, text on a panel', { layout: 'full' });
  }

  // One strong sentence.
  const paras = slide.blocks.filter((b) => b.type === 'para');
  const onlyWords = slide.blocks.every((b) => ['para', 'step', 'directive'].includes(b.type) && (b.type !== 'directive' || b.name === 'notes'));
  if (slide.title && onlyWords && paras.length <= 1 && !image) {
    const sentence = `${slide.title.text}${paras[0] ? ` ${paras[0].text}` : ''}`;
    if (sentence.length <= 140) withLayout('statement', 'one big sentence', 'statement');
    const m = slide.title.text.match(/^([~$€£]?\d[\d.,]*(?:%|[a-zA-Z]{1,3})?)\s+(\D.*)$/);
    if (m && current !== 'big-number') {
      const num = { type: 'heading', level: slide.title.level, text: m[1], raw: [heading(slide.title.level, m[1])] };
      build('big-number', 'the number as the slide', {
        layout: 'big-number', title: num, blocks: [{ type: 'para', raw: [m[2]] }, ...slide.blocks],
      });
    }
    if (paras[0] && /^["“].+["”]$/.test(paras[0].text)) {
      build('quote', 'as a quotation', {
        layout: 'quote', title: null, blocks: [`> ${paras[0].text.replace(/^["“]|["”]$/g, '')}`, slide.title.text, ...slide.blocks.filter((b) => b !== paras[0])],
      });
    }
  }
  if (slide.title) {
    if (!['center', 'title', 'section', 'statement', 'big-number', 'quote'].includes(current)) withLayout('centered', 'everything centred', 'center');
  }
  return { variants: out };
}
