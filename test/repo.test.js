// Working in a git repository: cutting a talk into slides, the slide by
// slide merge, split and join, and setting a repository up.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { describe as describeDiff, diffParsed, diffTalk } from '../src/cli/diff.js';
import { readTalk } from '../src/cli/load.js';
import {
  cut, joinTalk, keyOf, mergeTalks, put, setupRepo, splitTalk,
} from '../src/cli/repo.js';
import { parseTalk } from '../src/shared/markdown.js';

const talk = (...slides) => `---\ntitle: T\n---\n\n${slides.join('\n\n---\n\n')}\n`;
const A = '# Alpha\n\nfirst';
const B = '# Beta\n\nsecond';
const C = '# Gamma\n\nthird';

test('a talk is cut at --- lines, not inside code fences, and put back', () => {
  const source = talk(A, '# Code\n\n```\n---\nnot a slide\n```', C);
  const { head, slides } = cut(source);
  assert.equal(slides.length, 3);
  assert.deepEqual(head, ['---', 'title: T', '---']);
  assert.equal(put({ head, slides }), source);
  assert.equal(put(cut('# Only\n')), '# Only\n');
});

test('slides are matched by id, then by title', () => {
  assert.equal(keyOf(['# Why bread rises {.center}', '', 'x']), 'why-bread-rises');
  assert.equal(keyOf(['<!-- id: intro -->', '# Hello']), 'intro');
  assert.equal(keyOf(['::: poll {#lunch} Where?', '- a', ':::']), 'lunch');
});

test('slides added on two branches are both kept', () => {
  const base = talk(A, B);
  const ours = talk(A, '# Ours\n\nnew on our side', B);
  const theirs = talk(A, B, '# Theirs\n\nnew on their side');
  const { text, conflicts } = mergeTalks(base, ours, theirs);
  assert.equal(conflicts, 0);
  assert.equal(text, talk(A, '# Ours\n\nnew on our side', B, '# Theirs\n\nnew on their side'));
});

test('a slide edited on one side and moved on the other keeps both changes', () => {
  const base = talk(A, B, C);
  const ours = talk(A, '# Beta\n\nsecond, edited', C);
  const theirs = talk(C, A, B);
  const { text, conflicts } = mergeTalks(base, ours, theirs);
  assert.equal(conflicts, 0);
  assert.equal(text, talk(C, A, '# Beta\n\nsecond, edited'));
});

test('a slide deleted on one side and untouched on the other is removed', () => {
  const { text, conflicts } = mergeTalks(talk(A, B, C), talk(A, C), talk(A, B, C));
  assert.equal(conflicts, 0);
  assert.equal(text, talk(A, C));
});

test('different lines of the same slide merge, the same line conflicts', () => {
  const base = talk('# Alpha\n\nline one\n\nline two\n\nline three');
  const ours = talk('# Alpha\n\nline ONE\n\nline two\n\nline three');
  const theirs = talk('# Alpha\n\nline one\n\nline two\n\nline THREE');
  const clean = mergeTalks(base, ours, theirs);
  assert.equal(clean.conflicts, 0);
  assert.ok(clean.text.includes('line ONE') && clean.text.includes('line THREE'));

  const other = talk('# Alpha\n\nline 1\n\nline two\n\nline three');
  const clash = mergeTalks(base, ours, other);
  assert.ok(clash.conflicts > 0);
  assert.match(clash.text, /<<<<<<< ours/);
});

test('a slide edited on one side and deleted on the other is a conflict', () => {
  const { text, conflicts } = mergeTalks(talk(A, B), talk(A, '# Beta\n\nedited'), talk(A));
  assert.equal(conflicts, 1);
  assert.match(text, /<<<<<<< /);
  assert.ok(text.includes('edited'));
});

test('front matter changes on both sides merge', () => {
  const base = '---\ntitle: T\ntheme: light\n---\n\n# A\n';
  const ours = '---\ntitle: New title\ntheme: light\n---\n\n# A\n';
  const theirs = '---\ntitle: T\ntheme: midnight\n---\n\n# A\n';
  const { text, conflicts } = mergeTalks(base, ours, theirs);
  assert.equal(conflicts, 0);
  assert.match(text, /title: New title/);
  assert.match(text, /theme: midnight/);
});

function makeSplit(files) {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-split-'));
  mkdirSync(join(dir, 'slides'));
  writeFileSync(join(dir, 'talk.md'), '---\ntitle: T\nslides: slides/\n---\n');
  Object.entries(files).forEach(([name, text]) => writeFileSync(join(dir, 'slides', name), text));
  return dir;
}

function folder(source) {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-repo-'));
  writeFileSync(join(dir, 'talk.md'), source);
  return dir;
}

test('split and join round trip a talk', () => {
  const source = `---\ntitle: Round trip\ntheme: midnight\n---\n\n# Hello\n\n---\n\n${B}\n\n---\n\n::: poll {#p} Q?\n- a\n- b\n:::\n`;
  const dir = folder(source);
  const before = readTalk(dir);
  const { files } = splitTalk(dir);
  assert.deepEqual(files, ['slides/010-hello.md', 'slides/020-beta.md', 'slides/030-q.md']);
  const split = readTalk(dir);
  assert.deepEqual(split.slides.map((s) => s.html), before.slides.map((s) => s.html));
  assert.equal(split.meta.title, 'Round trip');
  assert.match(readFileSync(join(dir, 'talk.md'), 'utf8'), /slides: slides\//);
  assert.throws(() => splitTalk(dir), /already split/);
  joinTalk(dir);
  assert.equal(readFileSync(join(dir, 'talk.md'), 'utf8'), source);
  assert.ok(!existsSync(join(dir, 'slides')));
});

test('a split talk merges without a driver: one file per slide', () => {
  const dir = folder(talk(A, B));
  splitTalk(dir);
  const names = readTalk(dir).slides.map((s) => s.file);
  assert.deepEqual(names, ['slides/010-alpha.md', 'slides/020-beta.md']);
});

test('setting a repository up adds the workflow, attributes and the merge driver', () => {
  const dir = folder(talk(A));
  const { done, driver } = setupRepo(dir, { init: true });
  assert.ok(done.includes('.github/workflows/quorum.yml') && done.includes('.gitattributes'));
  assert.equal(driver, true);
  assert.match(execFileSync('git', ['config', 'merge.quorum.driver'], { cwd: dir, encoding: 'utf8' }), /merge-driver %O %A %B/);
  assert.deepEqual(setupRepo(dir).done, []);
  mkdirSync(join(dir, 'x'), { recursive: true });
});

test('warnings in a split talk name the slide file and its own line', () => {
  const dir = makeSplit({ 'a.md': '# A\n', 'b.md': '# B\n\nhello\n\n## Oops {.nonsense}\n' });
  const warnings = readTalk(dir).warnings.join(' ');
  assert.match(warnings, /slides\/b\.md line 5/);
  assert.ok(!/[Ll]ine 1\d/.test(warnings), warnings);
});

test('git uses the merge driver on a real conflict', () => {
  const dir = folder(talk(A, B));
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  setupRepo(dir, { init: true });
  git('checkout', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'one');
  writeFileSync(join(dir, 'talk.md'), talk(A, '# One\n\nadded on one', B));
  git('commit', '-qam', 'one');
  git('checkout', '-q', 'main');
  git('checkout', '-q', '-b', 'two');
  writeFileSync(join(dir, 'talk.md'), talk(A, B, '# Two\n\nadded on two'));
  git('commit', '-qam', 'two');
  git('merge', '-q', '--no-edit', 'one');
  const merged = readFileSync(join(dir, 'talk.md'), 'utf8');
  assert.ok(merged.includes('# One') && merged.includes('# Two'));
  assert.ok(!merged.includes('<<<<<<<'));
});

// --- quorum diff -----------------------------------------------------------


const parse = (...slides) => parseTalk(talk(...slides));

test('diff finds changed, added, removed and moved slides', () => {
  const before = parse(A, B, C, '# Delta\n\nfourth');
  const after = parse(A, '# Beta\n\nsecond, with more words', '# Epsilon\n\nbrand new', '# Delta\n\nfourth', C.replace('third', 'third'));
  const d = diffParsed(before, after);
  assert.deepEqual(d.changed.map((s) => s.title), ['Beta']);
  assert.deepEqual(d.changed[0].reasons, ['text']);
  assert.deepEqual(d.added.map((s) => s.title), ['Epsilon']);
  assert.deepEqual(d.removed, []);
  assert.deepEqual(d.moved.map((s) => s.title), ['Gamma']);
});

test('a slide with a new title is a change, not a removal and an addition', () => {
  const before = parse(A, '# Yeast makes gas\n\nYeast eats sugar and makes carbon dioxide gas');
  const after = parse(A, '# Why dough rises\n\nYeast eats sugar and makes carbon dioxide gas that rises');
  const d = diffParsed(before, after);
  assert.equal(d.added.length + d.removed.length, 0);
  assert.deepEqual(d.changed[0].reasons.slice(0, 1), ['title']);
});

test('a talk with no changes says so, and a theme change is reported', () => {
  const same = diffParsed(parse(A, B), parse(A, B));
  assert.match(describeDiff({ ...same, base: 'main' }), /No slide changed since main/);
  const themed = diffParsed(parse(A), parseTalk('---\ntitle: T\ntheme: midnight\n---\n\n# Alpha\n\nfirst\n'));
  assert.equal(themed.themeChanged, true);
});

test('diff reads an earlier revision from git', () => {
  const dir = folder(talk(A, B));
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'talk.md'), talk(A, '# Beta\n\nsecond, edited', '# New\n\nadded'));
  const d = diffTalk(dir, 'main');
  assert.deepEqual(d.changed.map((s) => s.title), ['Beta']);
  assert.deepEqual(d.added.map((s) => s.title), ['New']);
  assert.throws(() => diffTalk(dir, 'nope'), /not a branch, tag or commit/);
});

test('diff works for a split talk and a talk in a subfolder', () => {
  const repo = mkdtempSync(join(tmpdir(), 'quorum-sub-'));
  const dir = join(repo, 'decks', 'q3');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'talk.md'), talk(A, B));
  splitTalk(dir);
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'slides', '020-beta.md'), '# Beta\n\nsecond, edited\n');
  const d = diffTalk(dir, 'HEAD');
  assert.deepEqual(d.changed.map((s) => s.title), ['Beta']);
  assert.equal(d.unchanged, 1);
});
