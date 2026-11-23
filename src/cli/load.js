// Reads a talk from its folder, with the files it refers to (theme files).
// The parser itself cannot read files: it also runs in the browser.

import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';

import { parseTalk } from '../shared/markdown.js';

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

export function readTalk(dir, file = 'talk.md') {
  return parseTalk(readFileSync(join(dir, file), 'utf8'), { readFile: reader(dir) });
}

// The theme file a talk uses, if any (so the server can watch it).
export function themeFile(talkSource) {
  const m = String(talkSource).match(/^\s*theme\s*:\s*["']?([^\s"'#]+\.ya?ml)/m);
  return m ? m[1].replace(/^\.\//, '') : null;
}
