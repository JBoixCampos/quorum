// What an agent needs to work on one slide, and the talk's decision log.
//
// Agents are disposable: one that starts fresh should be able to pick up the
// work from the files alone. `quorum context <slide>` prints that slice (the
// slide and its hash, its neighbours, the theme, the decisions so far and the
// open requests for it). `quorum decide` adds to the log, one file per entry
// in decisions/, so two agents writing at once never touch the same file.
//
//   <!-- decision: by=claude; slide=intro; at=2026-01-01T10:00:00.000Z -->
//   Kept the intro to one sentence because the room is small.

import { randomBytes } from 'node:crypto';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { readTalk } from './load.js';
import { findSlide, slideHash, slideText } from './repo.js';
import { listRequests } from './requests.js';

export const DECISIONS = 'decisions';
const HEADER = /^<!--\s*decision\s*:\s*(.*?)\s*-->\s*$/;
const plain = (value) => String(value ?? '').replace(/[;\s]+/g, ' ').trim();

export function addDecision(dir, { text, by = 'unknown', slide = '', now = new Date() } = {}) {
  const body = String(text || '').trim();
  if (!body) throw new Error('Say what was decided: quorum decide "what and why".');
  if (slide && !/^[\w-]+$/.test(slide)) throw new Error(`"${slide}" is not a slide id.`);
  const folder = join(dir, DECISIONS);
  mkdirSync(folder, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  let name = `${stamp}-${randomBytes(2).toString('hex')}.md`;
  while (existsSync(join(folder, name))) name = `${stamp}-${randomBytes(2).toString('hex')}.md`;
  const fields = [['by', plain(by) || 'unknown'], ...(slide ? [['slide', slide]] : []), ['at', now.toISOString()]];
  // "wx": never replace an entry written at the same moment.
  writeFileSync(join(folder, name), `<!-- decision: ${fields.map(([k, v]) => `${k}=${v}`).join('; ')} -->\n${body}\n`, { flag: 'wx' });
  return { file: `${DECISIONS}/${name}`, by: plain(by), slide, at: now.toISOString(), text: body };
}

// Oldest first. `slide` keeps the entries about that slide and the general ones.
export function listDecisions(dir, { slide = '', limit = 0 } = {}) {
  const folder = join(dir, DECISIONS);
  if (!existsSync(folder)) return [];
  let list = readdirSync(folder).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const lines = readFileSync(join(folder, f), 'utf8').replace(/\r\n?/g, '\n').split('\n');
    const m = lines[0].match(HEADER);
    const info = { by: '', slide: '', at: '' };
    if (m) {
      m[1].split(';').forEach((part) => {
        const [k, ...v] = part.split('=');
        if (k.trim() in info) info[k.trim()] = v.join('=').trim();
      });
    }
    return { file: `${DECISIONS}/${f}`, ...info, text: lines.slice(m ? 1 : 0).join('\n').trim() };
  });
  if (slide) list = list.filter((d) => !d.slide || d.slide === slide);
  return limit > 0 ? list.slice(-limit) : list;
}

export function buildContext(dir, file, ref) {
  const talk = readTalk(dir, file);
  const slide = findSlide(talk, ref);
  const text = slideText(dir, file, slide);
  const at = talk.slides.indexOf(slide);
  const near = (s) => (s ? { id: s.id, title: s.title, layout: s.layout || '' } : null);
  return {
    talk: {
      title: talk.meta.title, preset: talk.meta.preset || '', mode: talk.meta.mode || '', slides: talk.slides.length,
    },
    slide: {
      id: slide.id, number: slide.index + 1, title: slide.title, layout: slide.layout || '', file: slide.file || file, hash: slideHash(text), text,
    },
    previous: near(talk.slides[at - 1]),
    next: near(talk.slides[at + 1]),
    decisions: listDecisions(dir, { slide: slide.id, limit: 10 }),
    requests: listRequests(dir, { all: false }).filter((r) => r.slide === slide.id).map((r) => ({
      id: r.id, kind: r.kind, status: r.status, wish: r.wish, claimedBy: r.claimedBy,
    })),
  };
}

export function describeContext(c) {
  const out = [];
  out.push(`Talk: ${c.talk.title} (${c.talk.slides} slides${c.talk.preset ? `, theme ${c.talk.preset}` : ''}${c.talk.mode ? `, ${c.talk.mode}` : ''})`);
  out.push(`Slide ${c.slide.number} of ${c.talk.slides}: "${c.slide.title}" (id ${c.slide.id}), in ${c.slide.file}`);
  if (c.previous) out.push(`Before it: "${c.previous.title}" (${c.previous.id})`);
  if (c.next) out.push(`After it: "${c.next.title}" (${c.next.id})`);
  out.push('', `The slide as it is now (hash ${c.slide.hash}). Write changes back with \`quorum slide set ${c.slide.id} --base ${c.slide.hash}\`:`, '');
  out.push(...c.slide.text.replace(/\n+$/, '').split('\n').map((l) => `    ${l}`));
  if (c.decisions.length) {
    out.push('', 'Decisions so far:');
    c.decisions.forEach((d) => out.push(`  - ${d.text.split('\n')[0]}${d.by ? ` (${d.by})` : ''}${d.slide ? '' : ' [whole talk]'}`));
  }
  if (c.requests.length) {
    out.push('', 'Open requests for this slide:');
    c.requests.forEach((r) => out.push(`  - ${r.id} ${r.status}${r.claimedBy ? ` by ${r.claimedBy}` : ''}: ${r.wish || '(no words)'}`));
  }
  out.push('', 'Record anything a later agent should know: quorum decide "what and why" --slide ' + c.slide.id + ' --by <your name>');
  return out.join('\n');
}
