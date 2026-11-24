// The blocks Studio knows how to insert and edit with a form instead of
// Markdown. Each editor reads the block's Markdown into fields and writes
// the fields back as Markdown: lines it does not understand are kept.

// How Studio names the built-in components (COMPONENTS in src/shared/design.js,
// which Studio gets from the schema).
export const COMPONENT_LABELS = { countdown: 'Countdown', qr: 'QR code', embed: 'Web page' };

// --- the Insert library --------------------------------------------------------

// `audience`: the block asks the audience something (one per slide).
export const LIBRARY = [
  { group: 'Ask the audience', items: [
    { id: 'poll', name: 'Poll', icon: 'vote', about: 'Everyone picks one option', audience: true, text: '::: poll Which one do you prefer?\n- First option\n- Second option\n- Third option\n:::' },
    { id: 'quiz', name: 'Quiz', icon: 'circle-check', about: 'A poll with a right answer', audience: true, text: '::: poll Which one is true?\n- A wrong answer\n- [x] The right answer\n- Another wrong answer\n\nWhy it is the right one.\n:::' },
    { id: 'multi', name: 'Several answers', icon: 'list-checks', about: 'People pick more than one', audience: true, text: '::: multi What do you use?\n- One thing\n- Another thing\n- Something else\n:::' },
    { id: 'estimate', name: 'Guess a number', icon: 'gauge', about: 'Every guess as a dot, then the answer', audience: true, text: '::: estimate How many keys does a piano have?\nanswer: 88\nmin: 1\nmax: 1000\n\nA standard piano has 88 keys.\n:::' },
    { id: 'sentence', name: 'Write together', icon: 'text-cursor-input', about: 'A sentence, one word at a time', audience: true, text: '::: sentence Finish the sentence\nstart: A good talk is\n:::' },
    { id: 'questions', name: 'Questions', icon: 'message-circle', about: 'The audience asks and upvotes', audience: true, text: '::: questions Ask me anything\n:::' },
    { id: 'join', name: 'Join code', icon: 'qr-code', about: 'The QR code to join', audience: false, text: '::: join Scan to join\n:::' },
    { id: 'countdown', name: 'Countdown', icon: 'timer', about: 'A timer on the slide', audience: false, text: '::: component countdown\nseconds: 60\n:::' },
    { id: 'qr', name: 'QR code', icon: 'qr-code', about: 'A code for any link', audience: false, text: '::: component qr\nurl: https://example.com\nlabel: Scan to open\n:::' },
    { id: 'embed', name: 'Web page', icon: 'globe', about: 'Another page inside the slide', audience: false, text: '::: component embed\nurl: https://example.com\n:::' },
  ] },
  { group: 'Text', items: [
    { id: 'heading', name: 'Heading', icon: 'heading', about: 'A title', text: '## A heading' },
    { id: 'text', name: 'Text', icon: 'pilcrow', about: 'A paragraph', text: 'Some text.' },
    { id: 'list', name: 'List', icon: 'list', about: 'Points, one per line', text: '- First point\n- Second point\n- Third point' },
    { id: 'quote', name: 'Quote', icon: 'quote', about: 'A quotation', text: '> The quotation goes here.' },
    { id: 'callout', name: 'Callout', icon: 'lightbulb', about: 'A highlighted note', text: '::: callout Good to know\nSomething worth remembering.\n:::' },
    { id: 'code', name: 'Code', icon: 'code', about: 'Highlighted code', text: '```js\nconst answer = 42;\n```' },
  ] },
  { group: 'Visual', items: [
    { id: 'picture', name: 'Picture', icon: 'image', about: 'Choose a file to add', picture: true, text: '' },
    { id: 'cards', name: 'Cards', icon: 'layout-grid', about: 'Ideas side by side', text: '::: cards\n### First {icon=lightbulb}\nWhat it is.\n\n+++\n\n### Second {icon=target}\nWhat it does.\n\n+++\n\n### Third {icon=rocket}\nWhy it matters.\n:::' },
    { id: 'steps', name: 'Steps', icon: 'list-ordered', about: 'A process', text: '::: steps\n- First: what happens\n- Second: what happens next\n- Third: the result\n:::' },
    { id: 'timeline', name: 'Timeline', icon: 'milestone', about: 'Things in order', text: '::: timeline\n- 2020: the start\n- 2022: the turn\n- 2024: today\n:::' },
    { id: 'kpis', name: 'Key figures', icon: 'hash', about: 'Numbers that count up', text: '::: kpis\n- 120: people\n- 4: countries\n- 98%: happy\n:::' },
    { id: 'chart', name: 'Chart', icon: 'chart-column', about: 'From your numbers', text: '::: chart column\nFirst: 10\nSecond: 25\nThird: 18\n:::' },
    { id: 'compare', name: 'Compare', icon: 'columns-2', about: 'Two sides', text: '::: compare {vs="or"}\n### This\nIts good points.\n\n+++\n\n### That\nIts good points.\n:::' },
  ] },
];

export const LIBRARY_ITEMS = Object.fromEntries(LIBRARY.flatMap((g) => g.items).map((i) => [i.id, i]));

// Puts x, y and w on the first line of a block, for a canvas slide.
export function placeOnCanvas(text, x, y) {
  const lines = text.split('\n');
  const where = `x=${Math.round(Math.max(0, Math.min(80, x)))} y=${Math.round(Math.max(0, Math.min(85, y)))} w=40`;
  const first = lines[0];
  const group = first.match(/\{([^{}]*)\}\s*$/);
  if (/^\s*(```|~~~|>|[-*+]\s)/.test(first)) return text; // these cannot carry a position
  lines[0] = group ? first.replace(/\{([^{}]*)\}\s*$/, `{$1 ${where}}`) : (/^\s*:::/.test(first) ? first.replace(/^(\s*:{3,}\s*[\w-]+)(.*)$/, `$1 {${where}}$2`) : `${first} {${where}}`);
  return lines.join('\n');
}

// --- reading a ::: block ---------------------------------------------------------

const HEADER = /^(\s*)(:{3,})\s*([a-z][\w-]*)\s*(.*)$/i;

export function readBlock(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const m = lines[0].match(HEADER);
  if (!m) return null;
  let last = lines.length - 1;
  while (last > 0 && lines[last].trim() === '') last -= 1;
  const closed = /^\s*:{3,}\s*$/.test(lines[last]);
  const body = lines.slice(1, closed ? last : lines.length);
  let rest = m[4];
  let attrs = '';
  let attrsFirst = true;
  const a = rest.match(/\{([^{}]*)\}/);
  if (a) {
    attrsFirst = rest.slice(0, a.index).trim() === '';
    attrs = a[1].trim();
    rest = (rest.slice(0, a.index) + rest.slice(a.index + a[0].length)).trim();
  }
  return {
    indent: m[1], colons: m[2], name: m[3].toLowerCase(), attrs, attrsFirst, title: rest.trim(), body,
  };
}

export function writeBlock(b, body) {
  const group = b.attrs ? ` {${b.attrs}}` : '';
  const title = b.title ? ` ${b.title}` : '';
  // "::: poll {#id} Question" or "::: chart column {unit=min}": as it was written.
  const head = `${b.indent}${b.colons} ${b.name}${b.attrsFirst === false ? `${title}${group}` : `${group}${title}`}`;
  return [head, ...body, `${b.indent}${b.colons}`].join('\n');
}

export function attrValue(attrs, key) {
  const m = String(attrs).match(new RegExp(`(?:^|\\s)${key}=("[^"]*"|'[^']*'|[^\\s}]+)`));
  return m ? m[1].replace(/^["']|["']$/g, '') : '';
}

export function setAttr(attrs, key, value) {
  if ((attrValue(attrs, key) || '') === String(value ?? '')) return attrs;
  const re = new RegExp(`(^|\\s)${key}=("[^"]*"|'[^']*'|[^\\s}]+)`);
  const clean = String(attrs).replace(re, '').replace(/\s+/g, ' ').trim();
  if (value === '' || value === null || value === undefined) return clean;
  const v = /^[^\s"'}]+$/.test(String(value)) ? value : `"${String(value).replace(/"/g, "'")}"`;
  return `${clean} ${key}=${v}`.trim();
}

const LIST = /^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/;
const KEYVAL = /^\s*([a-z][\w-]*)\s*:\s*(.*)$/i;

// Splits a body into leading "key: value" lines, list items and the rest.
function sortBody(body, keys) {
  const kv = {};
  const items = [];
  const rest = [];
  let head = true;
  body.forEach((line) => {
    const item = line.match(LIST);
    const pair = line.match(KEYVAL);
    if (head && pair && keys.includes(pair[1].toLowerCase()) && !item) { kv[pair[1].toLowerCase()] = pair[2].replace(/\s+#\s.*$/, '').trim(); return; }
    if (line.trim() !== '') head = false;
    if (item) { items.push({ text: item[2], checked: !!item[1] && item[1] !== ' ' }); return; }
    rest.push(line);
  });
  while (rest.length && rest[0].trim() === '') rest.shift();
  while (rest.length && rest[rest.length - 1].trim() === '') rest.pop();
  return { kv, items, rest };
}

const splitPair = (text) => {
  const m = String(text).match(/^(.{1,60}?):\s+(.*)$/);
  return m ? [m[1].trim(), m[2].trim()] : ['', String(text).trim()];
};

// --- the editors: { fields(block) -> model, write(block, model) -> text } ----------

export const EDITORS = {
  poll: {
    label: 'Poll',
    read(b) {
      const { items, rest, kv } = sortBody(b.body, []);
      return { question: b.title, options: items.map((i) => ({ text: i.text, right: i.checked })), explanation: rest.join('\n'), chart: attrValue(b.attrs, 'chart'), reveal: attrValue(b.attrs, 'reveal'), kv };
    },
    write(b, m) {
      const attrs = setAttr(setAttr(b.attrs, 'chart', m.chart), 'reveal', m.reveal);
      const body = m.options.filter((o) => o.text.trim()).map((o) => `- ${o.right ? '[x] ' : ''}${o.text.trim()}`);
      if (m.explanation.trim()) body.push('', ...m.explanation.trim().split('\n'));
      return writeBlock({ ...b, attrs, title: m.question.trim() }, body);
    },
  },
  estimate: {
    label: 'Guess a number',
    read(b) {
      const { kv, rest } = sortBody(b.body, ['answer', 'min', 'max', 'unit', 'scale', 'label', 'format']);
      return { question: b.title, ...kv, explanation: rest.join('\n') };
    },
    write(b, m) {
      const body = ['answer', 'min', 'max', 'unit', 'scale', 'label', 'format'].filter((k) => String(m[k] || '').trim()).map((k) => `${k}: ${String(m[k]).trim()}`);
      if (m.explanation && m.explanation.trim()) body.push('', ...m.explanation.trim().split('\n'));
      return writeBlock({ ...b, title: m.question.trim() }, body);
    },
  },
  questions: {
    label: 'Questions',
    read(b) { return { question: b.title, rest: b.body }; },
    write(b, m) { return writeBlock({ ...b, title: m.question.trim() }, m.rest); },
  },
  chart: {
    label: 'Chart',
    read(b) {
      const [type, ...more] = b.title.split(/\s+/);
      const rows = b.body.filter((l) => l.trim()).map((l) => {
        const t = l.replace(/^\s*[-*+]\s+/, '');
        const m = t.match(/^(.+?):\s*(.*)$/);
        return m ? { label: m[1].trim(), value: m[2].trim() } : { label: t.trim(), value: '' };
      });
      return { type: type || 'bar', extra: more.join(' '), rows, unit: attrValue(b.attrs, 'unit'), title: attrValue(b.attrs, 'title') };
    },
    write(b, m) {
      const attrs = setAttr(setAttr(b.attrs, 'unit', m.unit), 'title', m.title);
      return writeBlock({ ...b, attrs, title: [m.type, m.extra].filter(Boolean).join(' ') }, m.rows.filter((r) => r.label.trim()).map((r) => `${r.label.trim()}: ${String(r.value).trim() || 0}`));
    },
  },
  items: {
    label: 'Items',
    read(b) {
      const { items, rest } = sortBody(b.body, []);
      return { items: items.map((i) => { const [label, detail] = splitPair(i.text); return { label, detail }; }), rest, steps: /(^|\s)\.steps\b/.test(b.attrs) };
    },
    write(b, m) {
      const attrs = m.steps ? (/(^|\s)\.steps\b/.test(b.attrs) ? b.attrs : `${b.attrs} .steps`.trim()) : b.attrs.replace(/(^|\s)\.steps\b/, '').trim();
      const body = m.items.filter((i) => i.label.trim() || i.detail.trim()).map((i) => `- ${i.label.trim() ? `${i.label.trim()}: ` : ''}${i.detail.trim()}`);
      return writeBlock({ ...b, attrs }, [...body, ...(m.rest.length ? ['', ...m.rest] : [])]);
    },
  },
  cards: {
    label: 'Cards',
    read(b) {
      const cols = b.body.join('\n').split(/^\s*\+\+\+\s*$/m).map((col) => {
        const lines = col.split('\n').filter((l, k, all) => !(l.trim() === '' && (k === 0 || k === all.length - 1)));
        const head = lines.findIndex((l) => /^\s*#{1,6}\s+/.test(l));
        if (head < 0) return { title: '', icon: '', text: lines.join('\n').trim(), level: 3 };
        const h = lines[head].match(/^\s*(#{1,6})\s+(.*?)\s*(\{[^}]*\})?\s*$/);
        return { title: h[2], icon: h[3] ? attrValue(h[3].slice(1, -1), 'icon') : '', extra: h[3] ? h[3].slice(1, -1).replace(/(^|\s)icon=\S+/, '').trim() : '', text: lines.filter((_, k) => k !== head).join('\n').trim(), level: h[1].length };
      });
      return { cards: cols, steps: /(^|\s)\.steps\b/.test(b.attrs) };
    },
    write(b, m) {
      const attrs = m.steps ? (/(^|\s)\.steps\b/.test(b.attrs) ? b.attrs : `${b.attrs} .steps`.trim()) : b.attrs.replace(/(^|\s)\.steps\b/, '').trim();
      const cols = m.cards.filter((c) => c.title.trim() || c.text.trim()).map((c) => {
        const group = [c.extra, c.icon ? `icon=${c.icon}` : ''].filter(Boolean).join(' ');
        const head = c.title.trim() ? `${'#'.repeat(c.level || 3)} ${c.title.trim()}${group ? ` {${group}}` : ''}` : '';
        return [head, c.text.trim()].filter(Boolean).join('\n');
      });
      return writeBlock({ ...b, attrs }, cols.join('\n\n+++\n\n').split('\n'));
    },
  },
  // A built-in component (countdown, qr, embed): one field per setting.
  component: {
    label: 'Component',
    read(b, components) {
      const name = String(b.title).trim().toLowerCase();
      const keys = Object.keys(components[name].params);
      const values = Object.fromEntries(keys.map((k) => [k, '']));
      const order = [];
      const rest = [];
      b.body.forEach((line) => {
        const pair = line.match(KEYVAL);
        const key = pair && pair[1].toLowerCase();
        if (key && keys.includes(key) && !order.includes(key)) {
          values[key] = pair[2].replace(/\s+#\s.*$/, '').trim();
          order.push(key);
        } else rest.push(line);
      });
      while (rest.length && rest[0].trim() === '') rest.shift();
      while (rest.length && rest[rest.length - 1].trim() === '') rest.pop();
      return { name, values, order, rest };
    },
    write(b, m) {
      const keys = [...m.order, ...Object.keys(m.values).filter((k) => !m.order.includes(k))];
      const lines = keys.filter((k) => String(m.values[k]).trim() !== '').map((k) => `${k}: ${String(m.values[k]).trim()}`);
      return writeBlock(b, [...lines, ...m.rest]);
    },
  },
};

// `components`: the built-in components, from the schema.
export function editorFor(name, block = null, components = {}) {
  if (name === 'component') return block && components[String(block.title).trim().toLowerCase()] ? EDITORS.component : null;
  if (name === 'poll' || name === 'multi') return EDITORS.poll;
  if (name === 'estimate') return EDITORS.estimate;
  if (name === 'questions') return EDITORS.questions;
  if (name === 'chart') return EDITORS.chart;
  if (['steps', 'timeline', 'kpis'].includes(name)) return EDITORS.items;
  if (name === 'cards' || name === 'compare') return EDITORS.cards;
  return null;
}

// --- typing on the slide -----------------------------------------------------------

// Whether a heading or paragraph can be typed into on the slide: only plain
// text with bold, italics, code and links maps back to Markdown exactly.
export function inlineEditable(source) {
  const lines = String(source).split('\n');
  if (!lines.length || lines.length > 6) return false;
  const text = lines.join(' ')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/\s*\{[^{}]*\}\s*$/, '');
  if (/^\s*([-*+>|]|\d+[.)]|:::|```|~~~|<|!\[)/.test(lines[0])) return false;
  return !/(:icon\[|:badge\[|==|~~|!\[|<[a-z/]|\\)/i.test(text);
}

// The Markdown for what was typed, keeping the line's heading marks and
// its {attributes}.
export function inlineToMarkdown(html, source) {
  const first = String(source).split('\n')[0];
  const prefix = (first.match(/^\s*#{1,6}\s+/) || [''])[0];
  const lastLine = String(source).split('\n').slice(-1)[0];
  const group = (lastLine.match(/\s*(\{[^{}]*\})\s*$/) || ['', ''])[1];
  const box = document.createElement('div');
  box.innerHTML = html;
  const walk = (node) => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    const inner = [...node.childNodes].map(walk).join('');
    const tag = node.tagName.toLowerCase();
    if (tag === 'svg') return '';
    if (tag === 'br') return ' ';
    if (!inner.trim()) return inner;
    if (tag === 'strong' || tag === 'b') return `**${inner}**`;
    if (tag === 'em' || tag === 'i') return `*${inner}*`;
    if (tag === 'code') return `\`${node.textContent}\``;
    if (tag === 'a') return `[${inner}](${node.getAttribute('href') || ''})`;
    return inner;
  };
  let text = [...box.childNodes].map(walk).join('').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return `${prefix}${text}${group ? ` ${group}` : ''}`;
}
