// Requests, claims, the decision log, guarded slide writes and Sync.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { addDecision, buildContext, describeContext, listDecisions } from '../src/cli/context.js';
import { readTalk } from '../src/cli/load.js';
import { findSlide, replaceSlide, slideHash, slideText } from '../src/cli/repo.js';
import {
  addRequest, claimRequest, doneRequest, findRequest, listRequests, parseRequest, releaseRequest, removeRequest, requestPrompt, requestsSignature,
} from '../src/cli/requests.js';
import {
  fetchRemote, pullChanges, sendChanges, syncStatus,
} from '../src/cli/sync.js';
import { agentRequest } from '../src/server/studio-agent.js';
import { Workspace } from '../src/cli/studio-ops.js';

const TALK = `---
title: Requests
---

# One

first

---

## Two

second

---

## Three

third
`;

const folder = (talk = TALK) => {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-req-'));
  writeFileSync(join(dir, 'talk.md'), talk);
  return dir;
};

test('a request is a file, and parses back to what was asked', () => {
  const dir = folder();
  const r = addRequest(dir, { slide: 'two', wish: 'make it a chart', by: 'studio', part: '## Two\n\nsecond' });
  assert.match(r.id, /^r-[0-9a-f]{6}$/);
  assert.ok(existsSync(join(dir, r.file)));
  const [read] = listRequests(dir);
  assert.equal(read.slide, 'two');
  assert.equal(read.wish, 'make it a chart');
  assert.equal(read.part, '## Two\n\nsecond');
  assert.equal(read.status, 'open');
  assert.equal(read.by, 'studio');
});

test('a wish can have several lines and header characters are kept out of the header', () => {
  const dir = folder();
  const r = addRequest(dir, { slide: 'two', wish: 'line one\nline two; with a semicolon', by: 'a; b\nc' });
  const [read] = listRequests(dir);
  assert.equal(read.id, r.id);
  assert.equal(read.wish, 'line one\nline two; with a semicolon');
  assert.equal(read.by, 'a b c');
  assert.throws(() => addRequest(dir, { slide: 'bad id' }), /not a slide id/);
  assert.throws(() => addRequest(dir, { slide: 'two', kind: 'nope' }), /edit/);
});

test('only one agent can claim a request, and a claim that ran out is taken over', () => {
  const dir = folder();
  const { id } = addRequest(dir, { slide: 'two', wish: 'x' });
  const start = new Date('2026-01-01T10:00:00Z');
  claimRequest(dir, id, { by: 'claude', now: start });
  assert.throws(() => claimRequest(dir, id, { by: 'codex', now: new Date(start.getTime() + 60000) }), /already being worked on by claude/);
  assert.equal(listRequests(dir, { now: new Date(start.getTime() + 60000) })[0].status, 'claimed');
  const later = new Date(start.getTime() + 31 * 60000);
  assert.equal(listRequests(dir, { now: later })[0].status, 'open');
  claimRequest(dir, id, { by: 'codex', now: later });
  assert.equal(listRequests(dir, { now: later })[0].claimedBy, 'codex');
});

test('releasing puts a request back, done closes it with a note, cancel removes it', () => {
  const dir = folder();
  const a = addRequest(dir, { slide: 'one', wish: 'a' });
  const b = addRequest(dir, { slide: 'two', wish: 'b' });
  const c = addRequest(dir, { slide: 'three', wish: 'c' });
  claimRequest(dir, a.id, { by: 'claude' });
  releaseRequest(dir, a.id);
  assert.equal(listRequests(dir).find((r) => r.id === a.id).status, 'open');
  claimRequest(dir, b.id, { by: 'claude' });
  doneRequest(dir, b.id, { note: 'made a bar chart' });
  const done = listRequests(dir).find((r) => r.id === b.id);
  assert.equal(done.status, 'done');
  assert.equal(done.note, 'made a bar chart');
  assert.equal(done.doneBy, 'claude');
  assert.equal(done.wish, 'b');
  assert.ok(!existsSync(join(dir, 'requests', `${b.id}.claim`)));
  assert.throws(() => claimRequest(dir, b.id), /already done/);
  removeRequest(dir, c.id);
  assert.deepEqual(listRequests(dir, { all: false }).map((r) => r.id), [a.id]);
});

test('a request is found by id or by the start of its id', () => {
  const dir = folder();
  const r = addRequest(dir, { slide: 'two', wish: 'x' });
  const list = listRequests(dir);
  assert.equal(findRequest(list, r.id).id, r.id);
  assert.equal(findRequest(list, r.id.slice(0, 4)).id, r.id);
  assert.throws(() => findRequest(list, 'r-zzzz'), /no request/);
});

test('the signature changes when a request is added or claimed', () => {
  const dir = folder();
  const empty = requestsSignature(dir);
  const { id } = addRequest(dir, { slide: 'two', wish: 'x' });
  const added = requestsSignature(dir);
  assert.notEqual(added, empty);
  claimRequest(dir, id, { by: 'claude' });
  assert.notEqual(requestsSignature(dir), added);
});

test('the full request names the request id, how to claim it and how to close it', () => {
  const text = requestPrompt({
    title: 'Two', id: 'two', where: 'talk.md, lines 9 to 13', wish: 'a chart', requestId: 'r-aaaaaa',
  });
  assert.match(text, /change the slide "Two" \(id: two\), in talk\.md, lines 9 to 13/);
  assert.match(text, /quorum requests claim r-aaaaaa/);
  assert.match(text, /quorum requests done r-aaaaaa/);
  const alts = requestPrompt({ title: 'Two', id: 'two', where: 'x', kind: 'alternatives', count: 2 });
  assert.match(alts, /write 2 alternative versions/);
  assert.match(alts, /quorum variant add two/);
  assert.doesNotMatch(alts, /requests claim/);
});

test('Ask agent in Studio saves a request and returns the instruction', () => {
  const dir = folder();
  const ws = new Workspace(dir, 'talk.md');
  const out = agentRequest(ws, { kind: 'edit', slide: 'two', text: 'shorter', range: [9, 11] });
  assert.match(out.id, /^r-/);
  assert.match(out.instruction, /quorum requests/);
  assert.match(out.prompt, new RegExp(`request ${out.id}`));
  const [saved] = listRequests(dir);
  assert.equal(saved.wish, 'shorter');
  assert.equal(saved.by, 'studio');
  assert.ok(saved.part.includes('Two'));
  const unsaved = agentRequest(ws, { kind: 'edit', slide: 'two', text: 'x', save: false });
  assert.equal(unsaved.id, '');
  assert.equal(listRequests(dir).length, 1);
});

test('parseRequest copes with a file that has no header', () => {
  const r = parseRequest('Just some words\n', 'r-123456');
  assert.equal(r.wish, 'Just some words');
  assert.equal(r.status, 'open');
});

test('a slide write is refused when the slide changed since it was read', () => {
  const dir = folder();
  const slide = findSlide(readTalk(dir, 'talk.md'), 'two');
  const hash = slideHash(slideText(dir, 'talk.md', slide));
  replaceSlide(dir, 'talk.md', slide, '## Two\n\nsomeone else wrote this\n');
  const now = slideHash(slideText(dir, 'talk.md', findSlide(readTalk(dir, 'talk.md'), 'two')));
  assert.notEqual(now, hash);
  assert.equal(slideHash('x\n\n'), slideHash('x'));
});

test('the decision log is one file per entry and reaches the next agent through context', () => {
  const dir = folder();
  const a = addDecision(dir, { text: 'Keep the intro short', by: 'claude', slide: 'one', now: new Date('2026-01-01T10:00:00Z') });
  const b = addDecision(dir, { text: 'Use the warm theme', by: 'codex', now: new Date('2026-01-01T10:00:00Z') });
  assert.notEqual(a.file, b.file);
  assert.equal(listDecisions(dir).length, 2);
  assert.deepEqual(listDecisions(dir, { slide: 'two' }).map((d) => d.text), ['Use the warm theme']);
  addRequest(dir, { slide: 'one', wish: 'bigger title' });
  const c = buildContext(dir, 'talk.md', 'one');
  assert.equal(c.slide.id, 'one');
  assert.equal(c.slide.number, 1);
  assert.equal(c.next.id, 'two');
  assert.equal(c.previous, null);
  assert.equal(c.decisions.length, 2);
  assert.equal(c.requests[0].wish, 'bigger title');
  const text = describeContext(c);
  assert.match(text, /quorum slide set one --base /);
  assert.match(text, /Keep the intro short/);
  assert.throws(() => addDecision(dir, { text: '  ' }), /Say what was decided/);
});

// --- Sync, with a real remote and two clones --------------------------------------------------

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function twoClones() {
  const root = mkdtempSync(join(tmpdir(), 'quorum-sync-'));
  const remote = join(root, 'remote.git');
  mkdirSync(remote);
  git(remote, 'init', '--bare', '-b', 'main');
  const a = join(root, 'a');
  git(root, 'clone', remote, 'a');
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
  });
  writeFileSync(join(a, 'talk.md'), TALK);
  git(a, 'add', '.');
  git(a, 'commit', '-m', 'start');
  git(a, 'push', '-u', 'origin', 'HEAD:main');
  git(root, 'clone', remote, 'b');
  return { a, b: join(root, 'b') };
}

test('Sync shows what others pushed, pulls it, and sends your own changes', () => {
  const { a, b } = twoClones();
  const first = syncStatus(a);
  assert.equal(first.git, true);
  assert.equal(first.behind, 0);
  assert.equal(first.ahead, 0);

  // b edits slide two and sends it.
  writeFileSync(join(b, 'talk.md'), TALK.replace('second', 'second, changed by b'));
  addRequest(b, { slide: 'two', wish: 'x' });
  const sent = sendChanges(b, { message: 'b edits two' });
  assert.equal(sent.committed, true);
  assert.equal(sent.status.ahead, 0);
  assert.ok(sent.status.changed.length === 0);

  // a only learns of it after looking at the remote, and then sees which slide.
  assert.equal(syncStatus(a).behind, 0);
  fetchRemote(a);
  const seen = syncStatus(a);
  assert.equal(seen.behind, 1);
  assert.deepEqual(seen.incoming.map((s) => s.id), ['two']);
  assert.throws(() => sendChanges(a), /pushed changes first|Pull/);

  const after = pullChanges(a);
  assert.equal(after.behind, 0);
  assert.match(readFileSync(join(a, 'talk.md'), 'utf8'), /changed by b/);
  assert.equal(listRequests(a).length, 1);
});

test('a pull where both sides changed the same slide is undone, not left half merged', () => {
  const { a, b } = twoClones();
  writeFileSync(join(b, 'talk.md'), TALK.replace('second', 'second from b'));
  sendChanges(b, { message: 'b' });
  writeFileSync(join(a, 'talk.md'), TALK.replace('second', 'second from a'));
  git(a, 'commit', '-am', 'a edits two');
  fetchRemote(a);
  assert.throws(() => pullChanges(a), /changed the same slide/);
  const status = syncStatus(a);
  assert.equal(status.merging, false);
  assert.match(readFileSync(join(a, 'talk.md'), 'utf8'), /second from a/);
});

test('Send never stages .quorum/ and a folder that is not a repository says so', () => {
  const { a } = twoClones();
  mkdirSync(join(a, '.quorum'));
  writeFileSync(join(a, '.quorum', 'key'), 'secret');
  writeFileSync(join(a, 'talk.md'), TALK.replace('third', 'third, edited'));
  sendChanges(a, { message: 'edit' });
  assert.equal(git(a, 'ls-files', '.quorum'), '');
  assert.equal(syncStatus(a).changed.some((f) => f.includes('.quorum')), false); // not even counted as a change
  const lonely = folder();
  const status = syncStatus(lonely);
  assert.equal(status.git, false);
  assert.throws(() => pullChanges(lonely), /not a git repository/);
});
