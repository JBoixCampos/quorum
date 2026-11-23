// The endpoints of `quorum studio`: read the talk with a source map, apply
// edits to its files, preview alternatives, upload pictures. Only for the
// person at this computer: every call needs the key, and the Host and Origin
// of the request must be this computer (a web page open in the same browser
// cannot reach it).

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { candidatesFor } from '../cli/explore.js';
import { assemble, frontMatterOf, reader } from '../cli/load.js';
import { StudioError, Workspace } from '../cli/studio-ops.js';
import { schema } from '../shared/design.js';
import { parseTalk } from '../shared/markdown.js';

const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const MAX_UPLOAD = 15 * 1024 * 1024;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function readJson(req, limit) {
  return new Promise((done, failed) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        failed(new StudioError('That is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        failed(new StudioError('Not valid JSON.'));
      }
    });
  });
}

export function createStudio({
  dir, file, key, reload, send,
}) {
  const workspace = new Workspace(dir, file);
  const tokens = new Map();
  const waiting = new Set();
  let revision = 1;

  // Called after the talk was loaded again, from any cause.
  function notify() {
    revision += 1;
    const list = [...waiting];
    waiting.clear();
    list.forEach((w) => {
      clearTimeout(w.timer);
      if (!w.res.writableEnded && !w.res.destroyed) send(w.res, 200, { ok: true, revision });
    });
  }

  function remember(slideId, text) {
    const token = randomBytes(9).toString('hex');
    tokens.set(token, { slideId, text });
    if (tokens.size > 200) tokens.delete(tokens.keys().next().value);
    return token;
  }

  // The talk with one slide's text replaced, for previews of alternatives.
  function overrideTalk(token) {
    const entry = tokens.get(token);
    if (!entry) return null;
    const talk = workspace.talk();
    const slide = talk.slides.find((s) => s.id === entry.slideId);
    if (!slide) return null;
    const lines = assemble(dir, file).source.split('\n');
    lines.splice(slide.lines[0] - 1, slide.lines[1] - slide.lines[0] + 1, ...entry.text.replace(/\n+$/, '').split('\n'));
    const out = parseTalk(lines.join('\n'), { readFile: reader(dir), sourceMap: true });
    out.version = `o-${token}`;
    return out;
  }

  function state() {
    const talk = workspace.talk();
    const text = workspace.read(file);
    return {
      title: talk.meta.title,
      file,
      split: !!talk.split,
      revision,
      canUndo: workspace.canUndo,
      canRedo: workspace.canRedo,
      front: frontMatterOf(text).meta,
      meta: { preset: talk.meta.preset, mode: talk.meta.mode, tokens: talk.meta.tokens },
      warnings: talk.warnings,
      slides: talk.slides.map((s) => ({
        id: s.id,
        index: s.index,
        title: s.title,
        layout: s.layout,
        layoutOptions: s.layoutOptions,
        transition: s.transition,
        background: s.background,
        notes: s.notes,
        section: s.section,
        steps: s.steps,
        lines: s.lines,
        file: s.file || file,
        interactive: !!s.interaction || s.components.length > 0 || s.join,
      })),
      schema: schema(),
    };
  }

  function safeName(name) {
    const base = basename(String(name || 'picture.png')).toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
    const ext = extname(base);
    if (!IMAGE_TYPES.has(ext)) throw new StudioError('Pictures can be png, jpg, gif, webp or svg.');
    return base.length > ext.length ? base : `picture${ext}`;
  }

  function upload(body) {
    const name = safeName(body.name);
    const data = Buffer.from(String(body.data || ''), 'base64');
    if (!data.length) throw new StudioError('That picture is empty.');
    if (data.length > MAX_UPLOAD) throw new StudioError('That picture is larger than 15 MB.');
    const folder = join(dir, 'images');
    mkdirSync(folder, { recursive: true });
    const ext = extname(name);
    const stem = name.slice(0, -ext.length);
    let target = name;
    for (let n = 2; existsSync(join(folder, target)); n += 1) target = `${stem}-${n}${ext}`;
    writeFileSync(join(folder, target), data);
    return { path: `images/${target}` };
  }

  // Returns true when it answered the request.
  async function handle(req, res, url, path) {
    if (path !== '/studio' && !path.startsWith('/api/studio/')) return false;
    const host = req.headers.host || '';
    const origin = req.headers.origin;
    if (!LOCAL_HOST.test(host) || (origin && !LOCAL_HOST.test(origin.replace(/^https?:\/\//, '')))) {
      send(res, 403, { ok: false, error: 'Studio is only for this computer.' });
      return true;
    }
    if (path === '/studio') return false; // the page itself (it asks for the key)
    if ((req.headers['x-key'] || url.searchParams.get('key')) !== key) {
      send(res, 403, { ok: false, error: 'Wrong key.' });
      return true;
    }
    try {
      const route = path.slice('/api/studio/'.length);
      if (route === 'state' && req.method === 'GET') send(res, 200, { ok: true, ...state() });
      else if (route === 'slide' && req.method === 'GET') {
        const talk = workspace.talk();
        const slide = workspace.slideById(talk, url.searchParams.get('id'));
        send(res, 200, { ok: true, text: workspace.slideText(talk, slide), lines: slide.lines, file: slide.file || file });
      } else if (route === 'wait' && req.method === 'GET') {
        if (Number(url.searchParams.get('since')) !== revision) send(res, 200, { ok: true, revision });
        else {
          const w = { res, timer: null };
          w.timer = setTimeout(() => { waiting.delete(w); send(res, 200, { ok: true, revision }); }, 20000);
          waiting.add(w);
          res.on('close', () => { clearTimeout(w.timer); waiting.delete(w); });
        }
      } else if (route === 'op' && req.method === 'POST') {
        const body = await readJson(req, 1_000_000);
        const list = Array.isArray(body.ops) ? body.ops : [body];
        const results = list.map((op) => workspace.apply(op));
        reload();
        send(res, 200, { ok: true, results, ...{ canUndo: workspace.canUndo, canRedo: workspace.canRedo } });
      } else if ((route === 'undo' || route === 'redo') && req.method === 'POST') {
        workspace[route]();
        reload();
        send(res, 200, { ok: true });
      } else if (route === 'preview' && req.method === 'POST') {
        const body = await readJson(req, 1_000_000);
        send(res, 200, { ok: true, token: remember(String(body.slide), String(body.text || '')) });
      } else if (route === 'options' && req.method === 'GET') {
        const talk = workspace.talk();
        const slide = workspace.slideById(talk, url.searchParams.get('slide'));
        const { list, reason } = candidatesFor(dir, file, talk, slide, { remixToo: true });
        send(res, 200, {
          ok: true,
          reason,
          options: list.map((c, k) => ({
            number: k + 1, name: c.name, source: c.source, by: c.by, direction: c.direction, text: c.text, token: k === 0 ? '' : remember(slide.id, c.text),
          })),
        });
      } else if (route === 'upload' && req.method === 'POST') {
        send(res, 200, { ok: true, ...upload(await readJson(req, MAX_UPLOAD * 1.4)) });
      } else {
        send(res, 404, { ok: false, error: 'Not found.' });
      }
    } catch (error) {
      send(res, error instanceof StudioError ? 400 : 500, { ok: false, error: error.message });
    }
    return true;
  }

  return { handle, notify, overrideTalk, workspace };
}
