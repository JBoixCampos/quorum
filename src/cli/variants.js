// Slide variants: other versions of one slide, kept as plain files in
// variants/<slide-id>/ so they can be committed and pushed. An agent writes
// them (`quorum variant add`), Quorum remixes them (`quorum variant remix`),
// and a person or agent picks one (`quorum variant pick`).
//
// A variant file is one slide, with a first line saying where it came from:
//   <!-- variant: by=claude; direction=data first -->

import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { slug } from '../shared/markdown.js';
import { cut } from './repo.js';

export const VARIANTS = 'variants';
const HEADER = /^<!--\s*variant\s*:\s*(.*?)\s*-->\s*$/;

export function variantFolder(dir, id) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`"${id}" is not a slide id.`);
  return join(dir, VARIANTS, id);
}

export function parseVariant(content) {
  const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  const info = { by: '', direction: '' };
  let body = lines;
  const m = first >= 0 && lines[first].match(HEADER);
  if (m) {
    m[1].split(';').forEach((part) => {
      const [k, ...v] = part.split('=');
      if (['by', 'direction'].includes(k.trim())) info[k.trim()] = v.join('=').trim();
    });
    body = lines.slice(first + 1);
  }
  return { ...info, text: `${body.join('\n').replace(/^\n+|\n+$/g, '')}\n` };
}

const oneLine = (text) => String(text).replace(/[;\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const headerLine = ({ by, direction }) => `<!-- variant: by=${oneLine(by || 'unknown')}; direction=${oneLine(direction || '')} -->`;

export function listVariants(dir, id) {
  const folder = variantFolder(dir, id);
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((f) => f.endsWith('.md')).sort().map((file) => {
    const v = parseVariant(readFileSync(join(folder, file), 'utf8'));
    return { file, name: file.replace(/\.md$/, ''), ...v };
  });
}

export function addVariant(dir, id, text, { by = 'unknown', direction = '', name = '' } = {}) {
  const parsed = parseVariant(text);
  if (cut(parsed.text).slides.length !== 1) throw new Error('A variant is one slide: it cannot contain a line that is only "---".');
  const folder = variantFolder(dir, id);
  mkdirSync(folder, { recursive: true });
  const taken = readdirSync(folder).map((f) => Number.parseInt(f, 10)).filter(Number.isFinite);
  const n = (taken.length ? Math.max(...taken) : 0) + 1;
  const label = slug(name || parsed.direction || direction || parsed.by || by) || 'variant';
  const file = `${String(n).padStart(3, '0')}-${label}.md`;
  writeFileSync(join(folder, file), `${headerLine({ by: parsed.by || by, direction: parsed.direction || direction })}\n\n${parsed.text}`);
  return { file: join(VARIANTS, id, file), name: file.replace(/\.md$/, '') };
}

// A variant by number (1), file name (001-cards) or a part of its name.
export function findVariant(list, ref) {
  const r = String(ref);
  const n = Number(r);
  return list.find((v) => v.name === r || v.file === r)
    || (Number.isInteger(n) ? list.find((v) => Number.parseInt(v.file, 10) === n) : null)
    || list.find((v) => v.name.includes(r)) || null;
}

export function removeVariant(dir, id, variant) {
  rmSync(join(variantFolder(dir, id), variant.file), { force: true });
}

export function clearVariants(dir, id) {
  rmSync(variantFolder(dir, id), { recursive: true, force: true });
}
