// The editing operations behind `quorum studio`. Every change a person makes
// on the canvas, in the inspector or in the source view is one of these: an
// edit to the talk's own files (talk.md, or the slide files of a split talk).
// There is no second format and no database: after each operation the files
// are what they would be if someone had typed the change in an editor.
//
// Each operation can be undone and redone (in memory, for this session).
// Git is the real history.

import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { CLASSES } from '../shared/design.js';
import { parseAttrs, slug } from '../shared/markdown.js';
import { assemble, frontMatterOf, readTalk } from './load.js';
import { cut } from './repo.js';

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/;
const DIRECTIVE = /^\s*(:{3,})\s*([a-z][\w-]*)?/i;
const ATTR_GROUP = /\s*\{([^{}]*)\}\s*$/;
const pad = (n) => String(n).padStart(3, '0');

export class StudioError extends Error {}
const fail = (message) => { throw new StudioError(message); };

// --- attributes: "{#id .class key=value}" ----------------------------------

export function writeAttrs(a) {
  const parts = [];
  if (a.id) parts.push(`#${a.id}`);
  a.classes.forEach((c) => parts.push(`.${c}`));
  Object.entries(a.kv).forEach(([k, v]) => parts.push(/^[^\s"'}]+$/.test(String(v)) ? `${k}=${v}` : `${k}="${String(v).replace(/"/g, "'")}"`));
  return parts.length ? `{${parts.join(' ')}}` : '';
}

// Changes the trailing attributes of one line of Markdown.
// change: { add: [classes], remove: [classes], kv: { key: value | null } }
export function changeAttrs(line, change) {
  const m = line.match(ATTR_GROUP);
  let text = line;
  let attrs = { id: '', classes: [], kv: {} };
  if (m) {
    const parsed = parseAttrs(m[1]);
    // "{not attributes}" in a sentence stays text.
    if (parsed.valid) {
      attrs = parsed;
      text = line.slice(0, m.index);
    }
  }
  (change.remove || []).forEach((c) => { attrs.classes = attrs.classes.filter((x) => x !== c); });
  (change.add || []).forEach((c) => {
    if (!CLASSES[c]) fail(`"${c}" is not a class Quorum knows.`);
    if (!attrs.classes.includes(c)) attrs.classes.push(c);
  });
  Object.entries(change.kv || {}).forEach(([k, v]) => {
    if (!/^[a-z][\w-]*$/.test(k)) fail(`"${k}" is not an attribute name.`);
    if (v === null || v === undefined || v === '') delete attrs.kv[k];
    else attrs.kv[k] = String(v);
  });
  const written = writeAttrs(attrs);
  if (!written) return text.replace(/\s+$/, '');
  // Images keep the group right after the closing bracket.
  return /\)\s*$/.test(text) && /^\s*!\[/.test(text) ? `${text.replace(/\s+$/, '')}${written}` : `${text.replace(/\s+$/, '')} ${written}`;
}

// --- a working copy of the talk's files with undo ---------------------------

class Transaction {
  constructor(workspace) {
    this.w = workspace;
    this.before = new Map();
  }

  touch(rel) {
    if (this.before.has(rel)) return;
    const full = join(this.w.dir, rel);
    this.before.set(rel, existsSync(full) ? readFileSync(full, 'utf8') : null);
  }

  write(rel, text) {
    this.touch(rel);
    const full = join(this.w.dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }

  remove(rel) {
    this.touch(rel);
    rmSync(join(this.w.dir, rel), { force: true });
  }

  // What the files look like now, for the files this transaction touched.
  after() {
    const out = new Map();
    this.before.forEach((_, rel) => {
      const full = join(this.w.dir, rel);
      out.set(rel, existsSync(full) ? readFileSync(full, 'utf8') : null);
    });
    return out;
  }
}

export class Workspace {
  constructor(dir, file = 'talk.md') {
    this.dir = dir;
    this.file = file;
    this.undoStack = [];
    this.redoStack = [];
    this.version = 0;
  }

  talk() {
    return readTalk(this.dir, this.file, { sourceMap: true });
  }

  parts() {
    return assemble(this.dir, this.file);
  }

  read(rel) {
    return readFileSync(join(this.dir, rel), 'utf8').replace(/\r\n?/g, '\n');
  }

  slideById(talk, id) {
    const slide = talk.slides.find((s) => s.id === String(id));
    if (!slide) fail(`There is no slide "${id}" (it may have been renamed: reload).`);
    return slide;
  }

  // Which file holds a slide, and how to turn a line of the whole talk into
  // a line of that file.
  where(talk, slide) {
    if (!talk.split) return { file: this.file, base: 1 };
    const seg = this.parts().segments.find((s) => s.file === slide.file);
    return { file: slide.file, base: seg ? seg.from : 1 };
  }

  // Runs `fn` on the lines of the file that holds a slide.
  edit(tx, talk, slide, fn) {
    const { file, base } = this.where(talk, slide);
    const lines = this.read(file).split('\n');
    fn(lines, (n) => n - base);
    tx.write(file, lines.join('\n'));
  }

  // --- applying -------------------------------------------------------------

  apply(op) {
    const handler = OPS[op && op.op];
    if (!handler) fail(`Unknown operation "${op && op.op}".`);
    const tx = new Transaction(this);
    let result;
    try {
      result = handler.call(this, tx, op, this.talk()) || {};
    } catch (error) {
      // Put back whatever was written before the failure.
      tx.before.forEach((text, rel) => (text === null ? rmSync(join(this.dir, rel), { force: true }) : writeFileSync(join(this.dir, rel), text)));
      throw error;
    }
    if (tx.before.size) {
      this.undoStack.push({ before: tx.before, after: tx.after() });
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
      this.version += 1;
    }
    return result;
  }

  restore(files) {
    files.forEach((text, rel) => {
      const full = join(this.dir, rel);
      if (text === null) rmSync(full, { force: true });
      else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, text);
      }
    });
    this.version += 1;
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) fail('Nothing to undo.');
    this.restore(entry.before);
    this.redoStack.push(entry);
    return { ok: true };
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) fail('Nothing to redo.');
    this.restore(entry.after);
    this.undoStack.push(entry);
    return { ok: true };
  }

  get canUndo() { return this.undoStack.length > 0; }

  get canRedo() { return this.redoStack.length > 0; }
}

// --- helpers on lines ----------------------------------------------------------

const blank = (l) => l === undefined || l.trim() === '';

// Removes lines a..b (indexes), and one blank line next to them so the
// slide does not grow empty gaps.
function removeLines(lines, a, b) {
  let end = b;
  if (blank(lines[end + 1]) && (a === 0 || blank(lines[a - 1]))) end += 1;
  lines.splice(a, end - a + 1);
}

// Puts `text` after line index `after` with a blank line around it.
function insertAfter(lines, after, text) {
  const add = text.replace(/\n+$/, '').split('\n');
  const padBefore = after >= 0 && !blank(lines[after]) ? [''] : [];
  const padAfter = !blank(lines[after + 1]) && after + 1 < lines.length ? [''] : [];
  lines.splice(after + 1, 0, ...padBefore, ...add, ...padAfter);
}

// The slide's own text (so far as the lines of the whole file go).
function slideRange(talk, slide, toIndex) {
  return [toIndex(slide.lines[0]), toIndex(slide.lines[1])];
}

function inside(slide, from, to) {
  if (!(Number.isInteger(from) && Number.isInteger(to) && from <= to) || from < slide.lines[0] || to > slide.lines[1]) fail('That part is outside the slide.');
}

// --- moving things inside a slide -------------------------------------------------

// Finds the "+++" columns of the block that holds line index `at`.
function columnsAround(lines, at) {
  let open = -1;
  let depth = 0;
  for (let i = at; i >= 0; i -= 1) {
    const m = lines[i].match(DIRECTIVE);
    if (!m) continue;
    if (m[2]) {
      if (depth === 0) { open = i; break; }
      depth -= 1;
    } else depth += 1;
  }
  if (open < 0) return null;
  const colons = lines[open].match(DIRECTIVE)[1].length;
  let close = -1;
  let level = 0;
  for (let i = open + 1; i < lines.length; i += 1) {
    const m = lines[i].match(DIRECTIVE);
    if (!m || m[1].length !== colons) continue;
    if (m[2]) level += 1;
    else if (level === 0) { close = i; break; } else level -= 1;
  }
  if (close < 0) return null;
  const units = [];
  let start = open + 1;
  for (let i = open + 1; i <= close; i += 1) {
    if (i === close || lines[i].trim() === '+++') {
      units.push([start, i - 1]);
      start = i + 1;
    }
  }
  return { open, close, units };
}

function moveBlock(lines, from, to, where) {
  const [a, b] = from;
  const [c, d] = to;
  if (!(b < c || d < a)) fail('You cannot drop something onto itself.');

  // Columns of cards or a comparison: reorder them, keeping the separators.
  const parent = columnsAround(lines, a);
  if (parent && c > parent.open && d < parent.close) {
    const find = (x, y) => parent.units.findIndex(([u, v]) => {
      let s = u;
      let e = v;
      while (s < e && blank(lines[s])) s += 1;
      while (e > s && blank(lines[e])) e -= 1;
      return s === x && e === y;
    });
    const i = find(a, b);
    const j = find(c, d);
    if (i >= 0 && j >= 0 && parent.units.length > 1) {
      const texts = parent.units.map(([u, v]) => lines.slice(u, v + 1).join('\n').replace(/^\n+|\n+$/g, ''));
      const [moved] = texts.splice(i, 1);
      const target = j > i ? j - 1 : j;
      texts.splice(where === 'after' ? target + 1 : target, 0, moved);
      lines.splice(parent.open + 1, parent.close - parent.open - 1, ...texts.join('\n\n+++\n\n').split('\n'));
      return;
    }
  }

  // A list item next to other list items: move the line.
  if (a === b && c === d && LIST_ITEM.test(lines[a]) && LIST_ITEM.test(lines[c])) {
    const [lo, hi] = [Math.min(a, c), Math.max(a, c)];
    if (lines.slice(lo, hi + 1).every((l) => LIST_ITEM.test(l))) {
      const [line] = lines.splice(a, 1);
      const target = c > a ? c - 1 : c;
      lines.splice(where === 'after' ? target + 1 : target, 0, line);
      return;
    }
  }

  // Blocks of the slide: cut, and put before or after the other one.
  const text = lines.slice(a, b + 1).join('\n');
  let anchor = where === 'after' ? d : c - 1;
  const count = lines.length;
  removeLines(lines, a, b);
  if (anchor > b) anchor -= count - lines.length;
  insertAfter(lines, anchor, text);
}

// --- slide order in a split talk ------------------------------------------------

function numberOf(name) {
  const m = String(name).match(/(?:^|\/)(\d+)-/);
  return m ? Number.parseInt(m[1], 10) : null;
}

function newName(folder, title, files, afterFile) {
  const at = afterFile ? files.indexOf(afterFile) : -1;
  const prev = at >= 0 ? numberOf(files[at]) : 0;
  const next = at + 1 < files.length ? numberOf(files[at + 1]) : null;
  let n = null;
  if (prev !== null && (next === null || next - prev >= 2)) n = next === null ? prev + 10 : Math.floor((prev + next) / 2);
  return n === null ? null : `${folder}/${pad(n)}-${slug(title) || 'slide'}.md`;
}

// --- the operations ---------------------------------------------------------------

const OPS = {
  // The whole text of one slide.
  'replace-slide'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    const text = String(op.text || '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
    if (!text) fail('A slide cannot be empty. Delete it instead.');
    if (cut(text).slides.length !== 1) fail('A slide cannot contain a line that is only "---": that would be two slides.');
    if (talk.split) {
      tx.write(slide.file, `${text}\n`);
    } else {
      this.edit(tx, talk, slide, (lines, ix) => {
        const [a, b] = slideRange(talk, slide, ix);
        lines.splice(a, b - a + 1, ...text.split('\n'));
      });
    }
    return { slide: slide.id };
  },

  // New text for some lines of a slide (global line numbers, as in data-src).
  'replace-lines'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    inside(slide, op.from, op.to);
    this.edit(tx, talk, slide, (lines, ix) => {
      lines.splice(ix(op.from), op.to - op.from + 1, ...String(op.text).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n'));
    });
    return { slide: slide.id };
  },

  'insert-lines'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    const after = op.after === null || op.after === undefined ? slide.lines[1] : op.after;
    if (after < slide.lines[0] - 1 || after > slide.lines[1]) fail('That place is outside the slide.');
    this.edit(tx, talk, slide, (lines, ix) => insertAfter(lines, ix(after), String(op.text)));
    return { slide: slide.id };
  },

  'delete-lines'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    inside(slide, op.from, op.to);
    this.edit(tx, talk, slide, (lines, ix) => {
      const a = ix(op.from);
      const b = ix(op.to);
      // A card or a side of a comparison: take its "+++" separator with it.
      const parent = columnsAround(lines, a);
      if (parent && parent.units.length > 1) {
        const k = parent.units.findIndex(([u, v]) => {
          let s = u;
          let e = v;
          while (s < e && blank(lines[s])) s += 1;
          while (e > s && blank(lines[e])) e -= 1;
          return s === a && e === b;
        });
        if (k >= 0) {
          const texts = parent.units.map(([u, v]) => lines.slice(u, v + 1).join('\n').replace(/^\n+|\n+$/g, '')).filter((_, i) => i !== k);
          lines.splice(parent.open + 1, parent.close - parent.open - 1, ...texts.join('\n\n+++\n\n').split('\n'));
          return;
        }
      }
      removeLines(lines, a, b);
    });
    return { slide: slide.id };
  },

  'move-block'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    inside(slide, op.from[0], op.from[1]);
    inside(slide, op.to[0], op.to[1]);
    this.edit(tx, talk, slide, (lines, ix) => moveBlock(lines, [ix(op.from[0]), ix(op.from[1])], [ix(op.to[0]), ix(op.to[1])], op.where === 'after' ? 'after' : 'before'));
    return { slide: slide.id };
  },

  // Classes and attributes on one element: { range: [from, to], add, remove, kv }.
  'set-attrs'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    inside(slide, op.range[0], op.range[1]);
    this.edit(tx, talk, slide, (lines, ix) => {
      const first = ix(op.range[0]);
      const last = ix(op.range[1]);
      // Headings, blocks and pictures carry it on their first line; a
      // paragraph on its last.
      const onFirst = /^\s*(#{1,6}\s|:{3,}\s*[a-z]|!\[)/i.test(lines[first]) || first === last;
      if (LIST_ITEM.test(lines[first]) && !/^\s*!\[/.test(lines[first])) fail('List items cannot take classes. Select the whole list.');
      const at = onFirst ? first : last;
      lines[at] = changeAttrs(lines[at], op);
    });
    return { slide: slide.id };
  },

  // The alternative text of a picture.
  'set-alt'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    inside(slide, op.line, op.line);
    this.edit(tx, talk, slide, (lines, ix) => {
      const line = lines[ix(op.line)];
      if (!/!\[[^\]]*\]\(/.test(line)) fail('There is no picture on that line.');
      lines[ix(op.line)] = line.replace(/!\[[^\]]*\]\(/, `![${String(op.alt).replace(/[[\]\n]/g, ' ')}](`);
    });
    return { slide: slide.id };
  },

  // A setting of the slide: <!-- layout: split -->, transition, background...
  'set-slide-attr'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    if (!/^[a-z]+$/.test(op.key)) fail('Not a slide setting.');
    const value = op.value === null || op.value === undefined ? '' : String(op.value).replace(/\n/g, ' ').trim();
    this.edit(tx, talk, slide, (lines, ix) => {
      const [a, b] = slideRange(talk, slide, ix);
      const pattern = new RegExp(`^\\s*<!--\\s*${op.key}\\s*:.*-->\\s*$`, 'i');
      const at = lines.findIndex((l, i) => i >= a && i <= b && pattern.test(l));
      if (at >= 0) {
        if (value) lines[at] = `<!-- ${op.key}: ${value} -->`;
        else removeLines(lines, at, at);
      } else if (value) {
        // After the comments that already open the slide.
        let k = a;
        while (k <= b && /^\s*<!--\s*[a-z]+\s*:.*-->\s*$/i.test(lines[k])) k += 1;
        lines.splice(k, 0, `<!-- ${op.key}: ${value} -->`, ...(blank(lines[k]) ? [] : ['']));
      }
    });
    return { slide: slide.id };
  },

  'set-notes'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    const text = String(op.text || '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
    this.edit(tx, talk, slide, (lines, ix) => {
      const [a, b] = slideRange(talk, slide, ix);
      let open = -1;
      for (let i = a; i <= b; i += 1) if (/^\s*:{3,}\s*notes\b/i.test(lines[i])) { open = i; break; }
      if (open >= 0) {
        let close = open + 1;
        while (close <= b && !/^\s*:{3,}\s*$/.test(lines[close])) close += 1;
        if (text) lines.splice(open + 1, close - open - 1, ...text.split('\n'));
        else removeLines(lines, open, Math.min(close, lines.length - 1));
      } else if (text) {
        insertAfter(lines, b, `::: notes\n${text}\n:::`);
      }
    });
    return { slide: slide.id };
  },

  // A line of the front matter in talk.md.
  'set-front'(tx, op) {
    if (!/^[A-Za-z][\w-]*$/.test(op.key)) fail('Not a setting name.');
    const value = op.value === null || op.value === undefined ? '' : String(op.value).replace(/\n/g, ' ').trim();
    const text = this.read(this.file);
    const { head } = frontMatterOf(text);
    const lines = text.split('\n');
    const line = value ? `${op.key}: ${value}` : null;
    if (!head.length) {
      if (line) tx.write(this.file, `---\n${line}\n---\n\n${text.replace(/^\n+/, '')}`);
      return {};
    }
    const close = head.length - 1;
    const at = lines.findIndex((l, i) => i > 0 && i < close && new RegExp(`^\\s*${op.key}\\s*:`).test(l));
    if (at >= 0) {
      if (line) lines[at] = line;
      else lines.splice(at, 1);
    } else if (line) {
      lines.splice(close, 0, line);
    }
    tx.write(this.file, lines.join('\n'));
    return {};
  },

  // --- slides ---------------------------------------------------------------

  'insert-slide'(tx, op, talk) {
    const text = String(op.text || '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
    if (!text) fail('A slide cannot be empty.');
    if (cut(text).slides.length !== 1) fail('That is more than one slide.');
    const after = op.after ? this.slideById(talk, op.after) : null;
    if (talk.split) {
      this.insertFile(tx, talk, after, text);
    } else if (!talk.slides.length) {
      const full = this.read(this.file);
      tx.write(this.file, `${full.replace(/\n+$/, '')}\n\n${text}\n`);
    } else if (after) {
      this.edit(tx, talk, after, (lines, ix) => {
        const end = ix(after.lines[1]);
        lines.splice(end + 1, 0, '', '---', '', ...text.split('\n'));
      });
    } else {
      const first = talk.slides[0];
      this.edit(tx, talk, first, (lines, ix) => {
        const start = ix(first.lines[0]);
        lines.splice(start, 0, ...text.split('\n'), '', '---', '');
      });
    }
    return {};
  },

  'duplicate-slide'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    const text = this.slideText(talk, slide).replace(/^\s*<!--\s*id\s*:.*-->\s*\n/im, '').replace(/\{([^}]*)#[\w-]+([^}]*)\}/, '{$1$2}');
    return OPS['insert-slide'].call(this, tx, { after: slide.id, text }, talk);
  },

  'delete-slide'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    if (talk.slides.length === 1) fail('A talk needs at least one slide.');
    if (talk.split) {
      tx.remove(slide.file);
      this.updateOrder(tx, talk, (names) => names.filter((n) => n !== slide.file));
      return {};
    }
    this.edit(tx, talk, slide, (lines, ix) => {
      const a = ix(slide.lines[0]);
      const b = ix(slide.lines[1]);
      // The separator before it, or after it for the first slide.
      let start = a;
      if (slide.index > 0) while (start > 0 && blank(lines[start - 1])) start -= 1;
      let end = b;
      if (slide.index > 0 && start > 0 && lines[start - 1].trim() === '---') start -= 1;
      else {
        let k = b + 1;
        while (k < lines.length && blank(lines[k])) k += 1;
        if (k < lines.length && lines[k].trim() === '---') {
          end = k;
          while (end + 1 < lines.length && blank(lines[end + 1])) end += 1;
        }
      }
      lines.splice(start, end - start + 1);
    });
    return {};
  },

  'move-slide'(tx, op, talk) {
    const slide = this.slideById(talk, op.slide);
    const after = op.after ? this.slideById(talk, op.after) : null;
    if (after && after.id === slide.id) return {};
    if (talk.split) {
      const names = talk.sources.filter((n) => n !== slide.file);
      const prev = after ? after.file : null;
      const target = newName(talk.folder, slide.title, names, prev);
      const ordered = !!frontMatterOf(this.read(this.file)).meta.order;
      if (ordered) {
        this.updateOrder(tx, talk, (all) => {
          const rest = all.filter((n) => n !== slide.file);
          rest.splice(prev ? rest.indexOf(prev) + 1 : 0, 0, slide.file);
          return rest;
        });
        return {};
      }
      if (target) {
        tx.write(target, this.read(slide.file));
        tx.remove(slide.file);
      } else {
        this.renumber(tx, talk, (all) => {
          const rest = all.filter((n) => n !== slide.file);
          rest.splice(prev ? rest.indexOf(prev) + 1 : 0, 0, slide.file);
          return rest;
        });
      }
      return {};
    }
    const text = this.slideText(talk, slide);
    // Delete, then insert after the target (found again by position: lines moved).
    OPS['delete-slide'].call(this, tx, { slide: slide.id }, talk);
    const next = this.talk();
    const afterAt = after ? talk.slides.indexOf(after) : -1;
    const anchor = afterAt >= 0 ? next.slides[afterAt > slide.index ? afterAt - 1 : afterAt] : null;
    OPS['insert-slide'].call(this, tx, { after: anchor ? anchor.id : null, text }, next);
    return {};
  },
};
// --- slide files ------------------------------------------------------------------

Workspace.prototype.slideText = function slideText(talk, slide) {
  if (talk.split) return this.read(slide.file).replace(/\n+$/, '');
  const lines = this.read(this.file).split('\n');
  return lines.slice(slide.lines[0] - 1, slide.lines[1]).join('\n');
};

// A new slide file after `after` (a slide, or null for the start).
Workspace.prototype.insertFile = function insertFile(tx, talk, after, text) {
  const title = (text.match(/^\s*#{1,6}\s+(.*?)\s*(\{.*\})?\s*$/m) || [])[1] || 'slide';
  const files = talk.sources;
  const target = newName(talk.folder, title, files, after ? after.file : null);
  if (target && !existsSync(join(this.dir, target))) {
    tx.write(target, `${text}\n`);
    this.updateOrder(tx, talk, (names) => {
      const out = names.filter((n) => n !== target);
      out.splice(after ? out.indexOf(after.file) + 1 : 0, 0, target);
      return out;
    });
    return;
  }
  // No gap in the numbers: number every file again, with the new one in place.
  const temp = `${talk.folder}/999-new-${slug(title) || 'slide'}.md`;
  tx.write(temp, `${text}\n`);
  this.renumber(tx, talk, (names) => {
    const all = [...names, temp];
    const out = all.filter((n) => n !== temp);
    out.splice(after ? out.indexOf(after.file) + 1 : 0, 0, temp);
    return out;
  }, [temp]);
};

// Renames the slide files 010, 020, 030... in the order `arrange` gives.
Workspace.prototype.renumber = function renumber(tx, talk, arrange, extra = []) {
  const order = arrange([...talk.sources, ...extra]);
  const plan = order.map((name, i) => ({ from: name, to: `${talk.folder}/${pad((i + 1) * 10)}-${name.replace(/^.*\/\d+-/, '').replace(/^.*\//, '')}` }));
  const texts = new Map(plan.map((p) => [p.from, this.read(p.from)]));
  plan.forEach((p) => { if (p.from !== p.to) tx.remove(p.from); });
  plan.forEach((p) => tx.write(p.to, texts.get(p.from)));
  this.updateOrder(tx, talk, null, plan);
};

// Keeps "order:" in the front matter in step, when the talk uses it.
Workspace.prototype.updateOrder = function updateOrder(tx, talk, arrange, renames = []) {
  const text = this.read(this.file);
  const { meta } = frontMatterOf(text);
  if (!meta.order) return;
  const map = new Map(renames.map((r) => [r.from.replace(/^.*\//, '').replace(/\.md$/, ''), r.to.replace(/^.*\//, '').replace(/\.md$/, '')]));
  let names = String(meta.order).split(',').map((x) => x.trim()).filter(Boolean).map((n) => map.get(n.replace(/\.md$/, '')) || n.replace(/\.md$/, ''));
  if (arrange) {
    const full = names.map((n) => `${talk.folder}/${n}.md`);
    const all = [...full, ...talk.sources.filter((s) => !full.includes(s))];
    names = arrange(all).map((n) => n.replace(/^.*\//, '').replace(/\.md$/, ''));
  }
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^\s*order\s*:/.test(l));
  lines[at] = `order: ${names.join(', ')}`;
  tx.write(this.file, lines.join('\n'));
};
