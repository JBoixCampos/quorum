// Working on a talk in a git repository: one file per slide (`quorum split`
// and `quorum join`), a merge driver that merges slide by slide, and the
// files that set a talk's repository up (merge driver, CI workflow).
//
// A talk's Markdown is cut into a front matter block and slides at lines
// that are exactly `---` (outside code fences), the same rule the parser
// uses. Slides are matched across versions by an id: `<!-- id: x -->`, a
// `{#id}` on a heading or block, or else the title.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assemble, frontMatterOf } from './load.js';
import { parseTalk, slug } from '../shared/markdown.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// --- cutting a talk into pieces ------------------------------------------

// { head: [lines], slides: [[lines]] }: the front matter (with its `---`
// lines, or none) and the text of each slide, exactly as written.
export function cut(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const { head, body } = frontMatterOf(lines.join('\n'));
  const slides = [[]];
  let fence = null;
  body.forEach((line) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) fence = fence && line.trim().startsWith(fence) ? null : (fence || f[1]);
    if (!fence && line.trim() === '---') slides.push([]);
    else slides[slides.length - 1].push(line);
  });
  return { head, slides: slides.filter((s) => s.some((l) => l.trim() !== '')) };
}

const trimEnds = (lines) => {
  const out = [...lines];
  while (out.length && out[0].trim() === '') out.shift();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
};

export function put({ head, slides }) {
  const body = slides.map((s) => trimEnds(s).join('\n')).join('\n\n---\n\n');
  return `${head.length ? `${head.join('\n')}\n\n` : ''}${body}\n`;
}

// The id of a slide's text: explicit, or from its first heading or line.
export function keyOf(lines) {
  const text = lines.join('\n');
  const explicit = text.match(/<!--\s*id\s*:\s*([\w-]+)\s*-->/i) || text.match(/\{[^}]*#([\w-]+)[^}]*\}/);
  if (explicit) return slug(explicit[1]) || explicit[1];
  const heading = lines.find((l) => /^\s*#{1,6}\s+\S/.test(l));
  const first = heading ? heading.replace(/^\s*#{1,6}\s+/, '').replace(/\{[^}]*\}\s*$/, '') : (lines.find((l) => l.trim() !== '' && !/^\s*<!--/.test(l)) || '');
  return slug(first.replace(/[:#>*`_[\]()!]/g, ' ')) || 'slide';
}

// Keys that are unique in a version: a repeated key gets -2, -3, ...
function keyed(slides) {
  const seen = new Map();
  return slides.map((lines) => {
    const base = keyOf(lines);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { key: n === 1 ? base : `${base}-${n}`, text: trimEnds(lines).join('\n') };
  });
}

// --- three-way merge ---------------------------------------------------------

// git's own line merge for two edits of the same text: { text, conflicts }.
export function mergeText(base, ours, theirs, labels = ['ours', 'base', 'theirs']) {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-merge-'));
  try {
    const files = [ours, base, theirs].map((text, i) => {
      const f = join(dir, `f${i}`);
      writeFileSync(f, `${text}\n`);
      return f;
    });
    const r = spawnSync('git', ['merge-file', '-p', '--diff3', '-L', labels[0], '-L', labels[1], '-L', labels[2], ...files], { encoding: 'utf8' });
    if (r.error || r.status === null || r.status < 0 || r.status > 127) return { text: null, conflicts: -1 };
    return { text: r.stdout.replace(/\n$/, ''), conflicts: r.status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Which slides of `list` (an ordered array of keys) come first: the order
// of the keys they all share.
const sameOrder = (a, b) => {
  const inB = new Set(b);
  const inA = new Set(a);
  const x = a.filter((k) => inB.has(k));
  const y = b.filter((k) => inA.has(k));
  return x.length === y.length && x.every((k, i) => k === y[i]);
};

// A front matter block (with its --- lines) as [key, line] pairs.
const entries = (head) => (head.length ? head.slice(1, -1) : []).map((line) => {
  const m = line.match(/^\s*([A-Za-z][\w-]*)\s*:/);
  return [m ? m[1] : `#${line}`, line];
});

function mergeFront(base, ours, theirs) {
  if (ours.join('\n') === theirs.join('\n')) return { lines: ours, conflicts: 0 };
  const [b, o, t] = [entries(base), entries(ours), entries(theirs)];
  const lookup = (list) => new Map(list);
  const [mb, mo, mt] = [lookup(b), lookup(o), lookup(t)];
  const result = new Map();
  let conflicts = 0;
  new Set([...mb.keys(), ...mo.keys(), ...mt.keys()]).forEach((key) => {
    const [x, y, z] = [mb.get(key), mo.get(key), mt.get(key)];
    if (y === z) { if (y !== undefined) result.set(key, y); } else if (y === x) { if (z !== undefined) result.set(key, z); } else if (z === x) { if (y !== undefined) result.set(key, y); } else {
      conflicts += 1;
      result.set(key, `<<<<<<< ours\n${y === undefined ? '' : `${y}\n`}=======\n${z === undefined ? '' : `${z}\n`}>>>>>>> theirs`.replace(/\n$/, ''));
    }
  });
  const order = o.map(([k]) => k).filter((k) => result.has(k));
  t.forEach(([k], i) => {
    if (!result.has(k) || order.includes(k)) return;
    let p = i - 1;
    while (p >= 0 && !order.includes(t[p][0])) p -= 1;
    order.splice(p >= 0 ? order.indexOf(t[p][0]) + 1 : 0, 0, k);
  });
  [...result.keys()].forEach((k) => { if (!order.includes(k)) order.push(k); });
  const inner = order.map((k) => result.get(k));
  const wrap = ours.length ? ours : theirs;
  return { lines: inner.length || wrap.length ? ['---', ...inner, '---'] : [], conflicts };
}

// Merges two versions of a talk that both started from `base`. Slides are
// matched by id: a slide changed on one side keeps that change, a slide
// added on either side is kept, and only a slide changed on both sides is
// merged line by line. Returns { text, conflicts }.
export function mergeTalks(baseText, oursText, theirsText) {
  const B = cut(baseText);
  const O = cut(oursText);
  const T = cut(theirsText);
  let conflicts = 0;

  // The front matter merges key by key (git would call two neighbouring
  // lines a conflict).
  const front = mergeFront(B.head, O.head, T.head);
  conflicts += front.conflicts;
  const head = front.lines;

  const b = keyed(B.slides);
  const o = keyed(O.slides);
  const t = keyed(T.slides);
  const get = (list) => new Map(list.map((s) => [s.key, s.text]));
  const [mb, mo, mt] = [get(b), get(o), get(t)];
  const keys = new Set([...mb.keys(), ...mo.keys(), ...mt.keys()]);
  const result = new Map();
  keys.forEach((key) => {
    const [x, y, z] = [mb.get(key), mo.get(key), mt.get(key)];
    if (y === z) {
      if (y !== undefined) result.set(key, y);
    } else if (y === x) {
      if (z !== undefined) result.set(key, z);
    } else if (z === x) {
      if (y !== undefined) result.set(key, y);
    } else if (y !== undefined && z !== undefined) {
      const m = mergeText(x === undefined ? '' : x, y, z);
      if (m.text === null) {
        conflicts += 1;
        result.set(key, `<<<<<<< ours\n${y}\n=======\n${z}\n>>>>>>> theirs`);
      } else {
        conflicts += m.conflicts;
        result.set(key, m.text);
      }
    } else {
      // Changed on one side, deleted on the other.
      conflicts += 1;
      const kept = y !== undefined ? y : z;
      const marker = y !== undefined ? ['ours (theirs deleted the slide)', 'theirs'] : ['ours', 'theirs (ours deleted the slide)'];
      result.set(key, y !== undefined
        ? `<<<<<<< ${marker[0]}\n${kept}\n=======\n>>>>>>> ${marker[1]}`
        : `<<<<<<< ${marker[0]}\n=======\n${kept}\n>>>>>>> ${marker[1]}`);
    }
  });

  // The order: the side that moved slides wins; the other side's new
  // slides go after the slide that came before them there.
  const keysOf = (list) => list.map((s) => s.key);
  const bo = keysOf(b);
  const oo = keysOf(o);
  const to = keysOf(t);
  const oursMoved = !sameOrder(oo, bo);
  const [lead, other] = oursMoved || sameOrder(to, bo) ? [oo, to] : [to, oo];
  const order = lead.filter((k) => result.has(k));
  other.forEach((k, i) => {
    if (!result.has(k) || order.includes(k)) return;
    let p = i - 1;
    while (p >= 0 && !order.includes(other[p])) p -= 1;
    order.splice(p >= 0 ? order.indexOf(other[p]) + 1 : 0, 0, k);
  });
  [...result.keys()].forEach((k) => { if (!order.includes(k)) order.push(k); });

  const slides = order.map((k) => result.get(k).split('\n'));
  return { text: put({ head, slides }), conflicts };
}

// --- one file per slide ---------------------------------------------------------

const pad = (n) => String(n).padStart(3, '0');

// talk.md -> talk.md (front matter + `slides: slides/`) and slides/NNN-id.md.
export function splitTalk(dir, file = 'talk.md', folder = 'slides') {
  const full = join(dir, file);
  const text = readFileSync(full, 'utf8');
  if (frontMatterOf(text).meta.slides) throw new Error(`${file} is already split into ${frontMatterOf(text).meta.slides}.`);
  const { head, slides } = cut(text);
  const ids = parseTalk(text).slides.map((s) => s.id);
  if (ids.length !== slides.length) throw new Error('Could not match the slides to their ids. Run `quorum check` and fix the warnings first.');
  const target = join(dir, folder);
  if (existsSync(target) && readdirSync(target).length) throw new Error(`${folder}/ already has files in it.`);
  mkdirSync(target, { recursive: true });
  const names = slides.map((lines, i) => `${pad((i + 1) * 10)}-${ids[i]}.md`);
  slides.forEach((lines, i) => writeFileSync(join(target, names[i]), `${trimEnds(lines).join('\n')}\n`));
  const front = head.length ? head.slice(0, -1) : ['---'];
  front.push(`slides: ${folder}/`, '---', '');
  writeFileSync(full, front.join('\n'));
  return { files: names.map((n) => `${folder}/${n}`) };
}

// The reverse: one talk.md again, and the slide files are removed.
export function joinTalk(dir, file = 'talk.md') {
  const parts = assemble(dir, file);
  if (!parts.split) throw new Error(`${file} is not split into slide files (it has no "slides:" line).`);
  const { head, slides } = cut(parts.source);
  const front = head.filter((l) => !/^\s*(slides|order)\s*:/.test(l));
  writeFileSync(join(dir, file), put({ head: front, slides }));
  parts.files.forEach((f) => rmSync(join(dir, f), { force: true }));
  const folder = join(dir, parts.folder);
  if (existsSync(folder) && !readdirSync(folder).length) rmSync(folder, { recursive: true });
  return { files: parts.files };
}

// --- setting up a repository ----------------------------------------------------

export const WORKFLOW = `# Checks this Quorum talk on every push and pull request, and keeps what
# reviewers need: a playable copy, pictures of the slides, a PowerPoint file
# and, on a pull request, which slides changed. Edit it freely.
name: Quorum

on:
  push:
  pull_request:

jobs:
  talk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install Quorum and a browser
        run: |
          if [ -f package.json ]; then npm install; else npm install --no-save github:JBoixCampos/quorum; fi
          npm install --no-save playwright
          npx playwright install --with-deps chromium
      - name: Check the talk (mistakes, contrast, slides that do not fit)
        run: npx quorum check . --visual
      - name: Build a playable copy
        run: npx quorum build . --out build
      - name: Take a picture of every slide
        run: npx quorum snapshot . --no-results --out snapshots
      - name: Export a PowerPoint file
        run: npx quorum export . --pptx --safe-fonts --out deck.pptx
      - name: Which slides changed
        if: github.event_name == 'pull_request'
        run: |
          npx quorum diff "origin/\${{ github.base_ref }}" . | tee -a "$GITHUB_STEP_SUMMARY"
          npx quorum diff "origin/\${{ github.base_ref }}" . --pictures --out diff-pictures
      - uses: actions/upload-artifact@v4
        with:
          name: quorum-talk
          path: |
            build
            snapshots
            diff-pictures
            deck.pptx
`;

export const GITATTRIBUTES = `# Merge talk.md slide by slide (needs \`quorum repo\` to be run once per clone).
talk.md merge=quorum
`;

const inGit = (dir) => {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// Adds the merge driver, the CI workflow and .gitattributes to a talk's
// folder, and sets the driver up in this clone. Existing files are kept.
export function setupRepo(dir, { init = false } = {}) {
  const done = [];
  const write = (rel, text) => {
    const full = join(dir, rel);
    if (existsSync(full)) return;
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    done.push(rel);
  };
  if (init && !inGit(dir)) {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    done.push('git init');
  }
  write('.github/workflows/quorum.yml', WORKFLOW);
  write('.gitattributes', GITATTRIBUTES);
  let driver = false;
  if (inGit(dir)) {
    const bin = join(ROOT, 'bin', 'quorum.js');
    execFileSync('git', ['config', 'merge.quorum.name', 'Quorum, slide by slide'], { cwd: dir });
    execFileSync('git', ['config', 'merge.quorum.driver', `node "${bin}" merge-driver %O %A %B`], { cwd: dir });
    driver = true;
  }
  return { done, driver };
}


// --- one slide's text, in place ---------------------------------------------

// Finds a slide of a parsed talk by id or by its number (1 is the first).
export function findSlide(talk, ref) {
  const byId = talk.slides.find((s) => s.id === String(ref));
  if (byId) return byId;
  const n = Number(ref);
  if (Number.isInteger(n) && n >= 1 && n <= talk.slides.length) return talk.slides[n - 1];
  throw new Error(`There is no slide "${ref}". Use a slide id (quorum diff and quorum check show them) or its number.`);
}

// The Markdown of one slide, as written in its file.
export function slideText(dir, file, slide) {
  if (slide.file && slide.file !== file) return readFileSync(join(dir, slide.file), 'utf8').replace(/\r\n?/g, '\n').replace(/\n+$/, '\n');
  const lines = readFileSync(join(dir, file), 'utf8').replace(/\r\n?/g, '\n').split('\n');
  return `${lines.slice(slide.lines[0] - 1, slide.lines[1]).join('\n')}\n`;
}

// A short fingerprint of a slide's text. An agent reads it with the slide and
// hands it back when it writes (`quorum slide set --base`): the write is
// refused when someone changed the slide in between.
export function slideHash(text) {
  const clean = `${String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '')}\n`;
  return createHash('sha1').update(clean).digest('hex').slice(0, 10);
}

// Writes new text for one slide into its file, leaving the rest alone.
export function replaceSlide(dir, file, slide, text) {
  const clean = `${String(text).replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')}\n`;
  if (cut(clean).slides.length !== 1) throw new Error('A slide cannot contain a line that is only "---": that would be two slides.');
  if (slide.file && slide.file !== file) {
    writeFileSync(join(dir, slide.file), clean);
    return slide.file;
  }
  const full = join(dir, file);
  const lines = readFileSync(full, 'utf8').replace(/\r\n?/g, '\n').split('\n');
  lines.splice(slide.lines[0] - 1, slide.lines[1] - slide.lines[0] + 1, ...clean.replace(/\n$/, '').split('\n'));
  writeFileSync(full, lines.join('\n'));
  return file;
}
