// Reads a talk from its folder, with the files it refers to (theme files).
// The parser itself cannot read files: it also runs in the browser.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';

import { keyValues, parseTalk } from '../shared/markdown.js';

// Reads a file inside `dir`, or returns null (missing, or outside the folder).
export function reader(dir) {
  const base = resolve(dir);
  return (rel) => {
    const full = normalize(join(base, rel));
    if (!full.startsWith(base + sep) || !existsSync(full)) return null;
    try {
      return readFileSync(full, 'utf8');
    } catch {
      return null;
    }
  };
}

// Front matter of a talk file: the lines between the first two "---" lines.
export function frontMatterOf(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] === undefined || lines[0].trim() !== '---') return { head: [], meta: {}, body: lines };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return { head: [], meta: {}, body: lines };
  return { head: lines.slice(0, end + 1), meta: keyValues(lines.slice(1, end)), body: lines.slice(end + 1) };
}

// The slide files of a split talk, in order: `order:` (a comma separated
// list of names) first, then every other .md file, alphabetically.
export function slideFiles(dir, folder, order = '') {
  const base = join(resolve(dir), folder);
  if (!existsSync(base) || !statSync(base).isDirectory()) return { files: [], missing: [] };
  const present = readdirSync(base).filter((f) => f.endsWith('.md') && !f.startsWith('.')).sort();
  const listed = String(order).split(',').map((x) => x.trim()).filter(Boolean)
    .map((x) => (x.endsWith('.md') ? x : `${x}.md`));
  const missing = listed.filter((f) => !present.includes(f));
  const files = [...listed.filter((f) => present.includes(f)), ...present.filter((f) => !listed.includes(f))];
  return { files: files.map((f) => join(folder, f).split(sep).join('/')), missing };
}

// The text of a talk, and where each line came from. A talk is one file
// (talk.md), or a talk.md with only the front matter plus `slides: slides/`,
// a folder with one Markdown file per slide.
export function assemble(dir, file = 'talk.md') {
  const text = readFileSync(join(dir, file), 'utf8');
  const { head, meta, body } = frontMatterOf(text);
  const folder = meta.slides ? meta.slides.replace(/\/+$/, '') : '';
  if (!folder) return { source: text, split: false, folder: '', files: [], segments: [], notes: [] };
  const notes = [];
  if (!/^[\w.-]+(\/[\w.-]+)*$/.test(folder) || folder.split('/').includes('..')) {
    notes.push(`"slides: ${meta.slides}" must be a folder inside the talk folder.`);
    return { source: text, split: false, folder: '', files: [], segments: [], notes };
  }
  const { files, missing } = slideFiles(dir, folder, meta.order);
  missing.forEach((f) => notes.push(`order: lists ${f}, but ${folder}/${f} does not exist.`));
  if (body.some((l) => l.trim() !== '')) notes.push(`${file} has text after its front matter; with "slides:" only the slide files are used.`);
  if (!files.length) notes.push(`The folder ${folder}/ has no slide files (.md).`);
  const out = [...head];
  const segments = [];
  files.forEach((f, k) => {
    if (k > 0 || head.length) out.push('---');
    const content = readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
    // A slide file may not contain a bare "---" line (that would be two slides).
    segments.push({ file: f, from: out.length + 1, to: out.length + content.length });
    out.push(...content);
  });
  return { source: out.join('\n'), split: true, folder, files, segments, notes };
}

// The file and line (inside that file) a line of the assembled text came from.
export function locate(parts, line) {
  const seg = parts.segments.find((s) => line >= s.from && line <= s.to);
  return seg ? { file: seg.file, line: line - seg.from + 1 } : { file: null, line };
}

export function readTalk(dir, file = 'talk.md', options = {}) {
  const parts = assemble(dir, file);
  const talk = parseTalk(parts.source, { readFile: reader(dir), ...options });
  talk.split = parts.split;
  talk.folder = parts.folder;
  talk.sources = parts.files;
  // In a split talk, "line 12" would be a line of the assembled text: say which file.
  if (parts.split) {
    talk.warnings = talk.warnings.map((w) => w.replace(/\b([Ll])ine (\d+)/, (match, l, n) => {
      const at = locate(parts, Number(n));
      return at.file ? `${at.file} line ${at.line}` : match;
    }));
  }
  talk.warnings.push(...parts.notes);
  talk.slides.forEach((slide) => {
    const seg = parts.segments.find((s) => slide.lines[0] >= s.from && slide.lines[0] <= s.to);
    slide.file = seg ? seg.file : file;
  });
  return talk;
}

// The theme file a talk uses, if any (so the server can watch it).
export function themeFile(talkSource) {
  const m = String(talkSource).match(/^\s*theme\s*:\s*["']?([^\s"'#]+\.ya?ml)/m);
  return m ? m[1].replace(/^\.\//, '') : null;
}
