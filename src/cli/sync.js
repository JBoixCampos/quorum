// Studio's Sync: see what others pushed, pull it, and send your own changes.
//
// Two people on different computers share a talk through git and nothing
// else, so this is a thin layer over git for the steps a speaker needs:
// `fetch` (only looks), `pull` (brings changes in, slide by slide when
// `quorum repo` was run), and `send` (commits the talk's files and pushes).
// Nothing here pulls or pushes on its own: a person presses the button.

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

import { checkoutRevision, diffParsed } from './diff.js';
import { readTalk } from './load.js';

// Never staged by `send`: votes, questions, presenter keys and pictures of slides.
const EXCLUDE = [':(exclude).quorum', ':(exclude).quorum-snapshots', ':(exclude)node_modules'];

function run(dir, args, { timeout = 60000 } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  } catch (error) {
    const text = String(error.stderr || error.stdout || error.message || '').trim();
    const e = new Error(text.split('\n').filter(Boolean).slice(0, 4).join(' ').slice(0, 400) || 'git failed.');
    e.code = error.status;
    throw e;
  }
}

function attempt(dir, args) {
  try {
    return run(dir, args);
  } catch {
    return null;
  }
}

export function isRepo(dir) {
  return attempt(dir, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

// The slides the other side changed since you and they last agreed.
export function incomingSlides(dir, file) {
  const base = attempt(dir, ['merge-base', 'HEAD', '@{u}']);
  if (!base) return [];
  let then = null;
  let now = null;
  try {
    then = checkoutRevision(dir, base);
    now = checkoutRevision(dir, '@{u}');
    const read = (d) => {
      try {
        return readTalk(d.dir, file);
      } catch {
        return { slides: [], meta: {} };
      }
    };
    const d = diffParsed(read(then), read(now));
    return [
      ...d.changed.map((s) => ({ id: s.id, title: s.title, what: 'changed', reasons: s.reasons })),
      ...d.added.map((s) => ({ id: s.id, title: s.title, what: 'added', reasons: [] })),
      ...d.removed.map((s) => ({ id: s.id, title: s.title, what: 'removed', reasons: [] })),
      ...d.moved.map((s) => ({ id: s.id, title: s.title, what: 'moved', reasons: [] })),
    ];
  } catch {
    return [];
  } finally {
    [then, now].forEach((c) => { if (c) rmSync(c.tmp, { recursive: true, force: true }); });
  }
}

// Where this folder stands against its remote. Does not touch the network.
export function syncStatus(dir, file = 'talk.md', { incoming = true } = {}) {
  if (!isRepo(dir)) return { git: false };
  const branch = attempt(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || '';
  const upstream = attempt(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) || '';
  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = attempt(dir, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']) || '0\t0';
    [ahead, behind] = counts.split(/\s+/).map((n) => Number(n) || 0);
  }
  const changed = (attempt(dir, ['status', '--porcelain', '--', '.', ...EXCLUDE]) || '').split('\n').filter(Boolean).map((l) => l.slice(3));
  const merging = attempt(dir, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']) !== null;
  return {
    git: true,
    branch,
    upstream,
    ahead,
    behind,
    changed,
    merging,
    remoteHead: upstream ? (attempt(dir, ['rev-parse', '@{u}']) || '') : '',
    incoming: incoming && behind > 0 ? incomingSlides(dir, file) : [],
  };
}

// Looks at the remote without changing any file.
export function fetchRemote(dir) {
  if (!isRepo(dir)) throw new Error('This folder is not a git repository.');
  run(dir, ['fetch', '--quiet'], { timeout: 30000 });
}

// Brings in what others pushed. When both sides changed the same slide, the
// merge is undone and nothing changes: that needs a person (or an agent).
export function pullChanges(dir) {
  const status = syncStatus(dir);
  if (!status.git) throw new Error('This folder is not a git repository.');
  if (!status.upstream) throw new Error(`The branch "${status.branch}" has no remote yet: use Send first.`);
  try {
    run(dir, ['pull', '--no-rebase', '--no-edit']);
  } catch (error) {
    if (attempt(dir, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']) !== null) {
      attempt(dir, ['merge', '--abort']);
      throw new Error('You and someone else changed the same slide, so nothing was merged. Ask your agent to merge origin into this branch, or run `git pull` in a terminal and fix the slides it marks.');
    }
    throw error;
  }
  return syncStatus(dir);
}

// Commits the talk's files (not .quorum/) and pushes the branch.
export function sendChanges(dir, { message = '' } = {}) {
  const status = syncStatus(dir);
  if (!status.git) throw new Error('This folder is not a git repository.');
  if (status.merging) throw new Error('A merge is in progress: finish it in a terminal first.');
  if (status.behind > 0) throw new Error('Others pushed changes first. Pull them in, then send yours.');
  let committed = false;
  if (status.changed.length) {
    run(dir, ['add', '-A', '--', '.', ...EXCLUDE]);
    const staged = attempt(dir, ['diff', '--cached', '--quiet']) === null;
    if (staged) {
      run(dir, ['commit', '-m', String(message || '').trim() || 'Update the talk from Studio']);
      committed = true;
    }
  }
  const pushed = committed || status.ahead > 0 || !status.upstream;
  if (pushed) run(dir, status.upstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'], { timeout: 60000 });
  return { committed, pushed, status: syncStatus(dir) };
}
