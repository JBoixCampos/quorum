// Quorum's live server. Node built-ins only, no dependencies.
//
// Serves the presenter, panel and audience apps, keeps the session, and
// pushes changes with long polling: every screen asks "anything newer than
// version X?" and the server answers as soon as something changes (or after
// 20 s). Short, complete responses go through any tunnel or proxy, unlike
// an open stream, which some tunnels buffer.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTalk } from '../shared/markdown.js';
import { Session, isDevice } from '../shared/session.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(ROOT, 'app');
const SHARED = join(ROOT, 'src', 'shared');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

const PAGES = { '/': 'join.html', '/present': 'present.html', '/panel': 'panel.html' };
const WAIT_MAX = 20000;
const SEEN_RECENTLY = 30000;

function inside(base, path) {
  const full = normalize(join(base, path));
  return full === base || full.startsWith(base + sep) ? full : null;
}

function readKey(file) {
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const key = randomBytes(6).toString('hex');
  writeFileSync(file, key);
  return key;
}

// Starts the server for the talk in `talkDir`. Returns a handle with the
// URLs, the presenter key and close(). With `preview`, anyone who opens
// /present gets the whole talk (notes and answers included) and plays it
// with a simulated audience: only for `quorum preview`, never for a live talk.
export function startServer({
  talkDir,
  file = 'talk.md',
  port = 8080,
  key = null,
  publicUrl = '',
  moderation = true,
  preview = false,
  log = console.log,
} = {}) {
  const dir = resolve(talkDir);
  const talkFile = join(dir, file);
  if (!existsSync(talkFile)) throw new Error(`No ${file} found in ${dir}`);
  const dataDir = join(dir, '.quorum');
  mkdirSync(dataDir, { recursive: true });
  const stateFile = join(dataDir, 'state.json');
  const KEY = key || readKey(join(dataDir, 'key.txt'));

  let talk = parseTalk(readFileSync(talkFile, 'utf8'));
  talk.warnings.forEach((w) => log(`  Warning: ${w}`));
  let talkVersion = 1;
  let saved = null;
  try {
    saved = JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    saved = null;
  }
  let session = new Session(talk, saved, { moderation });
  if (publicUrl) session.apply({ type: 'url', url: publicUrl }, { presenter: true });

  const boot = Date.now().toString(36);
  let version = 0;
  const currentVersion = () => `${boot}-${version}`;
  const waiting = new Set();
  const seen = new Map();

  let saveTimer = null;
  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const tmp = `${stateFile}.tmp`;
      const data = JSON.stringify(session.toJSON());
      try {
        writeFileSync(tmp, data);
        renameSync(tmp, stateFile);
      } catch {
        // On Windows an antivirus can lock the rename for a moment.
        writeFileSync(stateFile, data);
      }
    }, 250);
  }

  function connected() {
    const now = Date.now();
    let n = 0;
    seen.forEach((t) => { if (now - t < SEEN_RECENTLY) n += 1; });
    return n;
  }

  function see(device) {
    const before = seen.get(device);
    seen.set(device, Date.now());
    if (!before || Date.now() - before > SEEN_RECENTLY) broadcast();
  }

  function viewFor(role, device) {
    const extra = { connected: connected(), talkVersion };
    if (role === 'panel') return { ...session.panelView(), ...extra };
    if (role === 'screen') return { ...session.screenView(), ...extra };
    return { ...session.audienceView(device), talkVersion };
  }

  // Groups changes for 60 ms, then answers everyone who is waiting.
  let broadcastTimer = null;
  function broadcast() {
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      version += 1;
      const list = [...waiting];
      waiting.clear();
      list.forEach(answer);
    }, 60);
  }

  function answer(w) {
    clearTimeout(w.timer);
    if (w.res.writableEnded || w.res.destroyed) return;
    send(w.res, 200, { v: currentVersion(), view: viewFor(w.role, w.device) });
  }

  function send(res, code, body, headers = {}) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }

  const isPresenter = (req, url) => (req.headers['x-key'] || url.searchParams.get('key')) === KEY;

  function readBody(req) {
    return new Promise((done, failed) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 30000) {
          failed(new Error('Body too large'));
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          done(JSON.parse(data || '{}'));
        } catch (error) {
          failed(error);
        }
      });
    });
  }

  function wait(req, res, url) {
    const role = url.searchParams.get('role') || 'audience';
    const device = url.searchParams.get('d') || '';
    if (!['audience', 'screen', 'panel'].includes(role)) return send(res, 400, { ok: false, error: 'Not a valid role.' });
    if (role !== 'audience' && !isPresenter(req, url)) return send(res, 403, { ok: false, error: 'Wrong key.' });
    if (role === 'audience') {
      if (!isDevice(device)) return send(res, 400, { ok: false, error: 'Not a valid device.' });
      see(device);
    }
    const w = { res, role, device, timer: null };
    if (url.searchParams.get('v') !== currentVersion()) return answer(w);
    w.timer = setTimeout(() => {
      waiting.delete(w);
      answer(w);
    }, WAIT_MAX);
    waiting.add(w);
    res.on('close', () => {
      clearTimeout(w.timer);
      waiting.delete(w);
    });
    return undefined;
  }

  async function action(req, res, url) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return send(res, 400, { ok: false, error: 'Not a valid request.' });
    }
    const presenter = isPresenter(req, url);
    const device = presenter ? null : body.device;
    if (!presenter && isDevice(device)) see(device);
    const result = session.apply(body.action, { presenter, device });
    if (result.ok && body.action.type !== 'join') {
      save();
      broadcast();
    }
    return send(res, result.ok ? 200 : 400, {
      ok: result.ok,
      error: result.error,
      pending: result.pending,
      view: presenter ? null : session.audienceView(device),
    });
  }

  // The talk itself. The presenter (or anyone, in a preview) gets
  // everything; phones only what they need to look right (title, colours).
  function talkJson(req, res, url) {
    if (isPresenter(req, url) || preview) {
      return send(res, 200, { ...talk, version: talkVersion });
    }
    // Branding too, so phones look like the talk (not its stylesheet).
    const { style, ...meta } = talk.meta;
    return send(res, 200, { meta, version: talkVersion });
  }

  async function serveFile(res, base, path, longCache = false) {
    const full = inside(base, path);
    if (!full) return send(res, 404, { ok: false, error: 'Not found.' });
    try {
      const info = await stat(full);
      if (!info.isFile()) throw new Error('Not a file');
      const type = TYPES[extname(full).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        // Nothing is cached except fonts, so a reload always brings the
        // latest version, also through the tunnel.
        'Cache-Control': longCache || type.startsWith('font/') ? 'public, max-age=86400' : 'no-store',
      });
      res.end(await readFile(full));
    } catch {
      send(res, 404, { ok: false, error: 'Not found.' });
    }
    return undefined;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; "
      + "font-src 'self' data:; connect-src 'self' http: https:; frame-src 'self' https:");
    try {
      if (path === '/api/health') {
        send(res, 200, { ok: true, connected: connected() }, { 'Access-Control-Allow-Origin': '*' });
      } else if (path === '/api/wait' && req.method === 'GET') {
        wait(req, res, url);
      } else if (path === '/api/action' && req.method === 'POST') {
        await action(req, res, url);
      } else if (path === '/api/talk' && req.method === 'GET') {
        talkJson(req, res, url);
      } else if (req.method !== 'GET') {
        send(res, 405, { ok: false, error: 'Method not allowed.' });
      } else if (PAGES[path]) {
        await serveFile(res, APP, PAGES[path]);
      } else if (path.startsWith('/shared/')) {
        await serveFile(res, SHARED, path.slice('/shared/'.length));
      } else if (path.startsWith('/talk/')) {
        // Images, videos and components that live next to talk.md. Not
        // talk.md itself: it has the notes and the right answers.
        const rel = path.slice('/talk/'.length);
        const dotted = rel.split('/').some((p) => p.startsWith('.'));
        const isTalk = normalize(rel) === normalize(file) && !preview && !isPresenter(req, url);
        if (dotted || isTalk) send(res, 404, { ok: false, error: 'Not found.' });
        else await serveFile(res, dir, rel);
      } else {
        await serveFile(res, APP, path.replace(/^\/+/, ''));
      }
    } catch (error) {
      log(String(error && error.stack ? error.stack : error));
      if (!res.headersSent) send(res, 500, { ok: false, error: 'Internal error.' });
    }
  });

  // Edit talk.md and the slides update on their own, keeping every vote.
  let reloadTimer = null;
  const watcher = watch(dir, (event, name) => {
    if (name !== file) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      try {
        const next = parseTalk(readFileSync(talkFile, 'utf8'));
        talk = next;
        talkVersion += 1;
        session = new Session(talk, session.toJSON(), { moderation });
        log(`  ${file} reloaded (${talk.slides.length} slides).`);
        talk.warnings.forEach((w) => log(`  Warning: ${w}`));
        broadcast();
      } catch (error) {
        log(`  Could not reload ${file}: ${error.message}`);
      }
    }, 150);
  });

  // If someone leaves, the "connected" count updates.
  let lastCount = 0;
  const counter = setInterval(() => {
    const n = connected();
    if (n !== lastCount) {
      lastCount = n;
      broadcast();
    }
  }, 5000);

  return new Promise((done, failed) => {
    server.once('error', failed);
    // A preview is only for this computer.
    server.listen(port, preview ? '127.0.0.1' : undefined, () => {
      const base = `http://localhost:${server.address().port}`;
      done({
        key: KEY,
        port: server.address().port,
        urls: {
          audience: `${base}/`,
          present: `${base}/present?key=${KEY}`,
          panel: `${base}/panel?key=${KEY}`,
          preview: `${base}/present?preview=1`,
        },
        talk: () => talk,
        setPublicUrl(u) {
          session.apply({ type: 'url', url: u }, { presenter: true });
          save();
          broadcast();
        },
        close() {
          clearInterval(counter);
          watcher.close();
          waiting.forEach((w) => w.res.end());
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}
