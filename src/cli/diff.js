// `quorum diff [revision]`: which slides changed since a git revision (a
// branch, a tag, a commit), and with --pictures what they looked like
// before and after.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { readTalk } from './load.js';
import { openRenderer } from './visual.js';

const git = (cwd, args, options = {}) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();

// The talk's folder as it was at `rev`, copied to a temporary folder.
export function checkoutRevision(dir, rev) {
  const root = git(dir, ['rev-parse', '--show-toplevel']);
  const rel = relative(root, resolve(dir)) || '.';
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  } catch {
    throw new Error(`"${rev}" is not a branch, tag or commit in this repository. (In CI, fetch it first: fetch-depth: 0.)`);
  }
  const tmp = mkdtempSync(join(tmpdir(), 'quorum-diff-'));
  const archive = execFileSync('git', ['archive', '--format=tar', rev, ...(rel === '.' ? [] : ['--', rel])], { cwd: root, maxBuffer: 1 << 30 });
  const r = spawnSync('tar', ['-x', '-C', tmp], { input: archive });
  if (r.status !== 0) throw new Error('Could not unpack the earlier version of the talk (is tar installed?).');
  return { dir: rel === '.' ? tmp : join(tmp, rel), tmp };
}

const words = (html) => new Set(String(html).replace(/<[^>]+>/g, ' ').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
function similarity(a, b) {
  const [x, y] = [words(a), words(b)];
  if (!x.size && !y.size) return 1;
  let both = 0;
  x.forEach((w) => { if (y.has(w)) both += 1; });
  return both / (x.size + y.size - both);
}

const FIELDS = {
  html: 'text', media: 'picture', notes: 'notes', layout: 'layout', layoutOptions: 'layout', transition: 'transition', background: 'background', steps: 'steps', logo: 'logo', footer: 'footer',
};

function reasons(a, b) {
  const out = new Set();
  Object.entries(FIELDS).forEach(([key, name]) => {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out.add(name);
  });
  if (JSON.stringify(a.interaction) !== JSON.stringify(b.interaction)) out.add('interaction');
  return [...out];
}

// The indexes (in `list`) that are not part of the longest increasing run:
// the slides that moved.
function moved(order) {
  const n = order.length;
  const best = Array(n).fill(1);
  const from = Array(n).fill(-1);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (order[j] < order[i] && best[j] + 1 > best[i]) { best[i] = best[j] + 1; from[i] = j; }
    }
  }
  let end = best.indexOf(Math.max(0, ...best));
  const keep = new Set();
  while (end >= 0) { keep.add(end); end = from[end]; }
  return order.map((_, i) => i).filter((i) => !keep.has(i));
}

// Compares two parsed talks. Slides are matched by id; a slide whose title
// changed is matched with the removed slide that reads most like it.
export function diffParsed(before, after) {
  const oldById = new Map(before.slides.map((s) => [s.id, s]));
  const pairs = [];
  const added = [];
  const used = new Set();
  after.slides.forEach((s) => {
    if (oldById.has(s.id)) {
      pairs.push([oldById.get(s.id), s]);
      used.add(s.id);
    } else added.push(s);
  });
  let removed = before.slides.filter((s) => !used.has(s.id));
  [...added].forEach((s) => {
    let best = null;
    let score = 0.5;
    removed.forEach((r) => {
      const v = similarity(r.html + r.title, s.html + s.title);
      if (v >= score) { best = r; score = v; }
    });
    if (best) {
      pairs.push([best, s]);
      removed = removed.filter((r) => r !== best);
      added.splice(added.indexOf(s), 1);
    }
  });
  pairs.sort((a, b) => a[1].index - b[1].index);
  const changed = [];
  pairs.forEach(([a, b]) => {
    const why = reasons(a, b);
    if (a.title !== b.title) why.unshift('title');
    if (why.length) changed.push({ id: b.id, title: b.title, index: b.index, was: a.index, reasons: why });
  });
  const shifted = moved(pairs.map(([a]) => a.index)).map((i) => pairs[i]);
  const metaKeys = ['title', 'preset', 'mode', 'tokens', 'accent', 'primary', 'secondary', 'background', 'text', 'font', 'footer', 'reactions', 'phone', 'logo'];
  const themeChanged = metaKeys.some((k) => JSON.stringify(before.meta[k]) !== JSON.stringify(after.meta[k]));
  const row = (s) => ({ id: s.id, title: s.title, index: s.index });
  return {
    added: added.map(row),
    removed: removed.map(row),
    changed,
    moved: shifted.map(([a, b]) => ({ ...row(b), was: a.index })),
    themeChanged,
    unchanged: pairs.length - changed.length,
    slides: after.slides.length,
  };
}

export function diffTalk(dir, rev = 'HEAD', { file = 'talk.md' } = {}) {
  const old = checkoutRevision(dir, rev);
  try {
    const before = existsSync(join(old.dir, file)) ? readTalk(old.dir, file) : { slides: [], meta: {} };
    const after = readTalk(dir, file);
    return { base: rev, ...diffParsed(before, after), oldDir: old.dir, tmp: old.tmp };
  } catch (error) {
    rmSync(old.tmp, { recursive: true, force: true });
    throw error;
  }
}

export function describe(d) {
  const lines = [];
  const n = d.changed.length + d.added.length + d.removed.length + d.moved.length;
  lines.push(n || d.themeChanged
    ? `Changes since ${d.base}: ${d.changed.length} changed, ${d.added.length} added, ${d.removed.length} removed, ${d.moved.length} moved (${d.slides} slides now).`
    : `No slide changed since ${d.base}.`);
  d.changed.forEach((s) => lines.push(`- changed: slide ${s.index + 1}, ${s.title} (${s.reasons.join(', ')})`));
  d.added.forEach((s) => lines.push(`- added: slide ${s.index + 1}, ${s.title}`));
  d.removed.forEach((s) => lines.push(`- removed: ${s.title} (was slide ${s.index + 1})`));
  d.moved.forEach((s) => lines.push(`- moved: ${s.title} (slide ${s.was + 1} to ${s.index + 1})`));
  if (d.themeChanged) lines.push('- the title, theme, colours or other front matter changed');
  return lines.join('\n');
}

// One picture of the slides that changed: before on the left, after on the
// right. Needs Playwright. Returns the path, or null.
export async function diffPictures(dir, d, { out, file = 'talk.md' } = {}) {
  const rows = [
    ...d.changed.map((s) => ({ label: `Changed: ${s.title}`, before: s.was, after: s.index })),
    ...d.added.map((s) => ({ label: `Added: ${s.title}`, before: null, after: s.index })),
    ...d.removed.map((s) => ({ label: `Removed: ${s.title}`, before: s.index, after: null })),
  ];
  if (!rows.length) return null;
  const now = await openRenderer(dir, { file });
  if (!now) return null;
  const old = await openRenderer(d.oldDir, { file });
  const shot = async (r, index) => {
    await r.show(index);
    return (await r.page.screenshot()).toString('base64');
  };
  try {
    const cells = [];
    for (const row of rows) {
      cells.push({
        label: row.label,
        before: row.before === null ? null : await shot(old, row.before),
        after: row.after === null ? null : await shot(now, row.after),
      });
    }
    const img = (b) => (b ? `<img src="data:image/png;base64,${b}">` : '<div class="none">no slide</div>');
    await now.page.setViewportSize({ width: 2600, height: 800 });
    await now.page.setContent(`<style>body{margin:0;padding:20px;background:#202326;font:20px system-ui;color:#ddd}h3{margin:28px 0 10px;font-weight:600}.r{display:grid;grid-template-columns:1fr 1fr;gap:20px}img{width:100%;display:block;border-radius:8px}.none{aspect-ratio:16/9;border:2px dashed #666;border-radius:8px;display:grid;place-items:center;color:#888}small{color:#999}</style>${cells.map((c) => `<h3>${c.label.replace(/</g, '&lt;')}</h3><div class="r"><div><small>before</small>${img(c.before)}</div><div><small>after</small>${img(c.after)}</div></div>`).join('')}`);
    mkdirSync(out, { recursive: true });
    const path = join(out, 'diff.png');
    await now.page.screenshot({ path, fullPage: true });
    return path;
  } finally {
    await old.close();
    await now.close();
  }
}

export function cleanup(d) {
  rmSync(d.tmp, { recursive: true, force: true });
}

export const _test = { moved, writeFileSync };
