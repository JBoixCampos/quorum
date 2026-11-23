// Requests: what a person asks of an agent, kept as plain files in
// requests/ so Studio, a local agent and an agent in the cloud all see the
// same queue (through git, for the cloud).
//
//   requests/<id>.md      the request: a header line, then what the person wants
//   requests/<id>.claim   exists while an agent works on it (JSON, with a time limit)
//
// One file per request and an exclusive create for claims mean two people or
// agents never write the same file by accident. A request is "open" until an
// agent claims it, "claimed" while the claim lasts, and "done" once an agent
// closes it with a note.
//
// A request file looks like this:
//   <!-- request: id=r-4f2a1c; slide=four-ingredients; kind=edit; by=studio; at=2026-01-01T10:00:00.000Z -->
//   Make this a chart.
//   <!-- part -->
//   (the lines the person selected, optional)
//   <!-- note -->
//   (what the agent did, once it is done)

import { randomBytes } from 'node:crypto';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const REQUESTS = 'requests';
export const CLAIM_MINUTES = 30;
export const INSTRUCTION = 'Work through the open Quorum requests: run `quorum requests`, claim each one, and follow AGENTS.md.';

const HEADER = /^<!--\s*request\s*:\s*(.*?)\s*-->\s*$/;
const PART = '<!-- part -->';
const NOTE = '<!-- note -->';
const KINDS = ['edit', 'alternatives'];
const DIRECTIONS = ['data first: numbers and a chart', 'one picture and one sentence', 'playful', 'minimal: as few words as possible'];

export const requestFolder = (dir) => join(dir, REQUESTS);

// Values go in a header line separated by ";": keep them to one plain line.
const plain = (value) => String(value ?? '').replace(/[;\s]+/g, ' ').trim();

function checkId(id) {
  if (!/^r-[0-9a-f]{4,12}$/.test(String(id))) throw new Error(`"${id}" is not a request id (they look like r-4f2a1c; \`quorum requests\` lists them).`);
  return String(id);
}

export function parseRequest(content, id = '') {
  const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  const info = {
    id, slide: '', kind: 'edit', by: '', at: '', count: 3, status: 'open', doneAt: '', doneBy: '',
  };
  let body = lines;
  const m = first >= 0 && lines[first].match(HEADER);
  if (m) {
    m[1].split(';').forEach((part) => {
      const [k, ...v] = part.split('=');
      const value = v.join('=').trim();
      const key = k.trim();
      if (key === 'id' && value) info.id = value;
      else if (key === 'slide') info.slide = value;
      else if (key === 'kind' && KINDS.includes(value)) info.kind = value;
      else if (key === 'by') info.by = value;
      else if (key === 'at') info.at = value;
      else if (key === 'count') info.count = Math.max(1, Math.min(6, Number(value) || 3));
      else if (key === 'status' && ['open', 'done'].includes(value)) info.status = value;
      else if (key === 'done_at') info.doneAt = value;
      else if (key === 'done_by') info.doneBy = value;
    });
    body = lines.slice(first + 1);
  }
  const text = body.join('\n');
  const noteAt = text.indexOf(`\n${NOTE}`);
  const withoutNote = noteAt >= 0 ? text.slice(0, noteAt) : text;
  const note = noteAt >= 0 ? text.slice(noteAt + NOTE.length + 1).trim() : '';
  const partAt = withoutNote.indexOf(`\n${PART}`);
  const wish = (partAt >= 0 ? withoutNote.slice(0, partAt) : withoutNote).trim();
  const part = partAt >= 0 ? withoutNote.slice(partAt + PART.length + 1).replace(/^\n+|\n+$/g, '') : '';
  return { ...info, wish, part, note };
}

function serialize(r) {
  const fields = [
    ['id', r.id], ['slide', r.slide], ['kind', r.kind], ['status', r.status === 'done' ? 'done' : ''],
    ['by', r.by], ['at', r.at], ['count', r.kind === 'alternatives' ? r.count : ''],
    ['done_by', r.doneBy], ['done_at', r.doneAt],
  ].filter(([, v]) => v !== '' && v !== undefined && v !== null);
  const out = [`<!-- request: ${fields.map(([k, v]) => `${k}=${plain(v)}`).join('; ')} -->`, r.wish || ''];
  if (r.part) out.push(PART, r.part);
  if (r.note) out.push(NOTE, r.note);
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

export function newId() {
  return `r-${randomBytes(3).toString('hex')}`;
}

export function addRequest(dir, {
  slide, wish = '', kind = 'edit', by = 'you', part = '', count = 3, now = new Date(),
} = {}) {
  if (!/^[\w-]+$/.test(String(slide || ''))) throw new Error(`"${slide}" is not a slide id.`);
  if (!KINDS.includes(kind)) throw new Error(`A request is "edit" or "alternatives", not "${kind}".`);
  const folder = requestFolder(dir);
  mkdirSync(folder, { recursive: true });
  let id = newId();
  while (existsSync(join(folder, `${id}.md`))) id = newId();
  const request = {
    id, slide, kind, by: plain(by) || 'you', at: now.toISOString(), count, wish: String(wish).trim(), part: String(part || '').replace(/^\n+|\n+$/g, ''), status: 'open', note: '',
  };
  // "wx": never replace a request that appeared in the meantime.
  writeFileSync(join(folder, `${id}.md`), serialize(request), { flag: 'wx' });
  return { ...request, file: `${REQUESTS}/${id}.md` };
}

function readClaim(dir, id, now) {
  const path = join(requestFolder(dir), `${id}.claim`);
  if (!existsSync(path)) return null;
  try {
    const claim = JSON.parse(readFileSync(path, 'utf8'));
    const expires = Date.parse(claim.at) + (Number(claim.minutes) || CLAIM_MINUTES) * 60000;
    return { by: String(claim.by || 'an agent'), at: claim.at, expires: new Date(expires).toISOString(), expired: !(expires > now.getTime()) };
  } catch {
    // A claim that cannot be read counts as expired: the request is not stuck.
    return { by: 'an agent', at: '', expires: '', expired: true };
  }
}

// All requests, oldest first. `all: false` leaves out the ones that are done.
export function listRequests(dir, { all = true, now = new Date() } = {}) {
  const folder = requestFolder(dir);
  if (!existsSync(folder)) return [];
  const list = readdirSync(folder).filter((f) => /^r-[0-9a-f]{4,12}\.md$/.test(f)).map((f) => {
    const id = f.slice(0, -3);
    const request = parseRequest(readFileSync(join(folder, f), 'utf8'), id);
    request.id = id;
    const claim = request.status === 'done' ? null : readClaim(dir, id, now);
    const live = claim && !claim.expired ? claim : null;
    return {
      ...request, file: `${REQUESTS}/${f}`, claim: live, claimedBy: live ? live.by : '', status: request.status === 'done' ? 'done' : (live ? 'claimed' : 'open'),
    };
  });
  list.sort((a, b) => (a.at || '').localeCompare(b.at || '') || a.id.localeCompare(b.id));
  return all ? list : list.filter((r) => r.status !== 'done');
}

// By id, or by the start of an id when only one request matches.
export function findRequest(list, ref) {
  const wanted = String(ref || '').trim();
  const exact = list.find((r) => r.id === wanted);
  if (exact) return exact;
  const starts = wanted ? list.filter((r) => r.id.startsWith(wanted) || r.id.startsWith(`r-${wanted}`)) : [];
  if (starts.length === 1) return starts[0];
  if (starts.length > 1) throw new Error(`"${ref}" matches ${starts.length} requests: ${starts.map((r) => r.id).join(', ')}.`);
  throw new Error(`There is no request "${ref}". \`quorum requests\` lists them.`);
}

function load(dir, ref, now = new Date()) {
  return findRequest(listRequests(dir, { now }), ref);
}

// An agent takes a request. The claim file is created exclusively, so when two
// agents try at once only one wins. A claim that ran out is taken over.
export function claimRequest(dir, ref, { by = 'an agent', minutes = CLAIM_MINUTES, now = new Date() } = {}) {
  const request = load(dir, ref, now);
  if (request.status === 'done') throw new Error(`${request.id} is already done.`);
  const path = join(requestFolder(dir), `${checkId(request.id)}.claim`);
  const body = JSON.stringify({ by: plain(by) || 'an agent', at: now.toISOString(), minutes: Number(minutes) || CLAIM_MINUTES });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(path, `${body}\n`, { flag: 'wx' });
      return { ...request, status: 'claimed', claimedBy: plain(by) };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const claim = readClaim(dir, request.id, now);
      if (claim && !claim.expired) throw new Error(`${request.id} is already being worked on by ${claim.by} (until ${claim.expires}). Take another request.`);
      rmSync(path, { force: true });
    }
  }
  throw new Error(`${request.id} was just taken by another agent. Take another request.`);
}

export function releaseRequest(dir, ref) {
  const request = load(dir, ref);
  rmSync(join(requestFolder(dir), `${checkId(request.id)}.claim`), { force: true });
  return request;
}

export function doneRequest(dir, ref, { by = '', note = '', now = new Date() } = {}) {
  const request = load(dir, ref, now);
  const path = join(requestFolder(dir), `${checkId(request.id)}.md`);
  const done = {
    ...parseRequest(readFileSync(path, 'utf8'), request.id), id: request.id, status: 'done', doneAt: now.toISOString(), doneBy: plain(by || request.claimedBy), note: String(note).trim(),
  };
  writeFileSync(path, serialize(done));
  rmSync(join(requestFolder(dir), `${request.id}.claim`), { force: true });
  return { ...request, ...done };
}

// Cancels a request: the person changed their mind.
export function removeRequest(dir, ref) {
  const request = load(dir, ref);
  rmSync(join(requestFolder(dir), `${checkId(request.id)}.md`), { force: true });
  rmSync(join(requestFolder(dir), `${request.id}.claim`), { force: true });
  return request;
}

// Changes whenever a request or claim file is added, changed or removed.
export function requestsSignature(dir) {
  const folder = requestFolder(dir);
  let sign = '';
  try {
    if (existsSync(folder)) readdirSync(folder).sort().forEach((f) => { sign += `${f}:${statSync(join(folder, f)).mtimeMs};`; });
  } catch {
    sign = '';
  }
  return sign;
}

// The words an agent gets, written for one request. Used by `quorum requests
// show` and by Studio when it copies the full request. `where` says where the
// slide is ("talk.md, lines 38 to 58" or "the slide file slides/020-x.md").
export function requestPrompt({
  title, id, where, wish = '', part = '', kind = 'edit', count = 3, requestId = '',
}) {
  const lines = [];
  const quoted = String(part || '').trim();
  const partBlock = quoted ? `The part to change:\n\n${quoted.split('\n').map((l) => `    ${l}`).join('\n')}\n` : '';
  if (kind === 'alternatives') {
    const n = Math.max(1, Math.min(6, Number(count) || 3));
    const wanted = String(wish || '').trim();
    lines.push(
      `In this Quorum talk, write ${n} alternative versions of the slide "${title}" (id: ${id}), in ${where}.`,
      wanted ? `What I want from them: ${wanted}` : `Give each a different direction, for example: ${DIRECTIONS.slice(0, n).join('; ')}.`,
      '',
      'Keep the content and the talk\'s theme. Use Quorum\'s layouts and blocks (`quorum schema` lists them). Each alternative is exactly one slide: no line that is only "---".',
      'Save each one as a variant, without changing the slide itself:',
      `  quorum variant add ${id} --by <your name> --direction "<what it tries>" < alternative.md`,
      'Run `quorum check` on the talk afterwards. The alternatives appear in Quorum Studio, where I will choose one.',
    );
  } else {
    const wanted = String(wish || '').trim() || 'Improve it.';
    lines.push(
      `In this Quorum talk, change the slide "${title}" (id: ${id}), in ${where}.`,
      ...(partBlock ? [partBlock] : []),
      `What I want: ${wanted}`,
      '',
      'Edit the Markdown in place and leave the other slides alone. Use Quorum\'s layouts and blocks (`quorum schema` lists them).',
      'Run `quorum check --json` and fix any warning on this slide. Quorum Studio shows the change as soon as the file is saved.',
    );
  }
  if (requestId) {
    lines.push(
      '',
      `This is request ${requestId}, saved in requests/${requestId}.md. Take it with \`quorum requests claim ${requestId} --by <your name>\` before you start, `
      + `and close it with \`quorum requests done ${requestId} --note "<what you did>"\` when the work is saved.`,
    );
  }
  lines.push('', 'If you work on a copy of the repository (in the cloud), commit and push to a branch so I can pull it.');
  return lines.join('\n');
}
