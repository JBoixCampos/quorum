// A structural check of a .pptx: every part is well formed XML, has a
// content type, every relationship points at a part that exists, and shape
// ids are unique in each slide. It cannot say how PowerPoint will draw the
// file, but it catches the mistakes that make PowerPoint ask to "repair" it.

import { unzip } from './unzip.js';

// Is this XML text well formed? Returns an error message, or null.
export function xmlError(text) {
  const stack = [];
  const tokens = text.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<|>|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g);
  let last = 0;
  for (const m of tokens) {
    const between = text.slice(last, m.index);
    if (between.includes('<') || between.includes('>')) return `Stray "<" or ">" near position ${last}.`;
    last = m.index + m[0].length;
    if (m[0] === '<' || m[0] === '>') return `Stray "${m[0]}" near position ${m.index}.`;
    if (m[0].startsWith('&')) return `A bare "&" near position ${m.index}.`;
    if (m[2] === undefined) continue;
    if (m[1]) {
      const open = stack.pop();
      if (open !== m[2]) return `</${m[2]}> closes <${open || 'nothing'}>.`;
    } else if (!m[4]) {
      stack.push(m[2]);
    }
  }
  if (text.slice(last).includes('<')) return 'The file ends inside a tag.';
  return stack.length ? `<${stack[stack.length - 1]}> is never closed.` : null;
}

const dir = (name) => name.split('/').slice(0, -1).join('/');
function resolveTarget(from, target) {
  const parts = (target.startsWith('/') ? target.slice(1) : `${dir(from)}/${target}`).split('/');
  const out = [];
  parts.forEach((p) => {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  });
  return out.join('/');
}

export function checkPptx(buffer) {
  const problems = [];
  let files;
  try {
    files = unzip(buffer);
  } catch (error) {
    return [`The file is not a valid zip: ${error.message}`];
  }
  if (![...files.keys()][0].startsWith('[Content_Types]')) problems.push('[Content_Types].xml must be the first part.');
  const types = files.get('[Content_Types].xml') ? files.get('[Content_Types].xml').toString('utf8') : '';
  const defaults = new Set([...types.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase()));
  const overrides = new Set([...types.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1]));

  files.forEach((data, name) => {
    if (/\.(xml|rels)$/.test(name)) {
      const error = xmlError(data.toString('utf8'));
      if (error) problems.push(`${name}: ${error}`);
    }
    if (name === '[Content_Types].xml') return;
    const ext = name.split('.').pop().toLowerCase();
    if (!overrides.has(`/${name}`) && !defaults.has(ext)) problems.push(`${name} has no content type.`);
    if (name.endsWith('.xml') && !name.startsWith('_rels') && !overrides.has(`/${name}`) && ext === 'xml' && !name.startsWith('[')) {
      problems.push(`${name} only has the generic XML content type.`);
    }
    if (name.endsWith('.rels')) {
      const owner = name.replace(/_rels\/([^/]+)\.rels$/, '$1');
      const base = name.includes('/') ? name.replace(/\/_rels\/[^/]+$/, '/x') : 'x';
      const ids = new Set();
      [...data.toString('utf8').matchAll(/<Relationship\s+([^>]*?)\/>/g)].forEach(([, attrs]) => {
        const id = (attrs.match(/Id="([^"]+)"/) || [])[1];
        const target = (attrs.match(/Target="([^"]+)"/) || [])[1];
        if (ids.has(id)) problems.push(`${name}: the relationship ${id} is used twice.`);
        ids.add(id);
        if (/TargetMode="External"/.test(attrs)) return;
        const full = resolveTarget(owner === name ? 'x' : (name.startsWith('_rels/') ? 'x' : base), target);
        if (!files.has(full)) problems.push(`${name}: ${id} points at ${full}, which does not exist.`);
      });
    }
  });

  overrides.forEach((part) => {
    if (!files.has(part.slice(1))) problems.push(`The content type lists ${part}, which is not in the file.`);
  });

  files.forEach((data, name) => {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) return;
    const xml = data.toString('utf8');
    const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1]);
    const seen = new Set();
    ids.forEach((id) => {
      if (seen.has(id)) problems.push(`${name}: the shape id ${id} is used twice.`);
      seen.add(id);
    });
    const rels = files.get(name.replace('slides/', 'slides/_rels/') + '.rels');
    const known = new Set(rels ? [...rels.toString('utf8').matchAll(/Id="([^"]+)"/g)].map((m) => m[1]) : []);
    [...xml.matchAll(/r:(?:embed|id)="([^"]+)"/g)].forEach(([, id]) => {
      if (!known.has(id)) problems.push(`${name}: uses ${id}, which is not in its relationships.`);
    });
  });
  return problems;
}
