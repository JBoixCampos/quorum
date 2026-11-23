// What Studio can start besides editing: the live talk (a server for the
// audience, a public link, the presentation and panel windows), exports to
// PowerPoint and PDF, and the checks. One of each at a time.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { checkTalk } from '../cli/check.js';
import { exportTalk } from '../cli/pptx/export.js';
import { hasVotes, loadPlaywright, INSTALL_PLAYWRIGHT } from '../cli/visual.js';
import {
  INSTALL, findChromium, has, lanUrl, openAppWindow, openUrl, startTunnel,
} from '../cli/system.js';
import { startServer } from './server.js';

const slugOf = (title) => String(title || 'talk').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'talk';

export function createControls({ dir, file, talk, onChange = () => {} }) {
  let live = null;
  let job = null;

  // --- the live talk -------------------------------------------------------

  function liveState() {
    if (!live) return { running: false, tunnels: { cloudflared: has('cloudflared'), ngrok: has('ngrok') }, install: INSTALL.cloudflared };
    return {
      running: true,
      phase: live.phase,
      publicUrl: live.publicUrl,
      scope: live.scope,
      connected: live.server.connected ? live.server.connected() : null,
      present: live.server.urls.present,
      panel: live.server.urls.panel,
      note: live.note,
      interactive: live.interactive,
    };
  }

  // Opens the shared screen (its own window, to share or project) and the panel.
  function openWindows() {
    if (!live || !live.open) return;
    const browser = findChromium();
    if (browser) {
      const profile = join(dir, '.quorum', 'browser');
      mkdirSync(profile, { recursive: true });
      openAppWindow(browser, live.server.urls.present, profile);
    } else {
      openUrl(live.server.urls.present);
    }
    setTimeout(() => openUrl(live.server.urls.panel), 1200);
  }

  async function startLive({ tunnel = true, open = true } = {}) {
    if (live) return liveState();
    const current = talk();
    const interactive = current.slides.some((s) => s.interaction || s.join || s.components.some((c) => c.params && c.params.audience));
    const server = await startServer({ talkDir: dir, file, port: 0, log: () => {} });
    live = {
      server, phase: 'starting', publicUrl: '', scope: '', note: '', tunnel: null, open, interactive,
    };
    const useLocal = (note) => {
      const url = lanUrl(server.port);
      if (url) server.setPublicUrl(url);
      Object.assign(live, { phase: 'live', publicUrl: url || '', scope: url ? 'network' : 'computer', note });
      openWindows();
      onChange();
    };
    // Without slides that ask the audience, there is nobody to let in.
    if (!interactive || !tunnel) {
      useLocal(interactive ? 'Only people on the same network can join.' : '');
      return liveState();
    }
    live.tunnel = startTunnel(server.port, {
      onUrl: (url) => {
        if (!live) return;
        server.setPublicUrl(url);
        Object.assign(live, { phase: 'live', publicUrl: url, scope: 'public', note: '' });
        openWindows();
        onChange();
      },
      onExit: () => {
        if (!live || live.stopping) return;
        const url = lanUrl(server.port);
        if (url) server.setPublicUrl(url);
        Object.assign(live, { publicUrl: url || '', scope: url ? 'network' : 'computer', note: 'The public link stopped. People on the same network can still join; votes are kept.' });
        onChange();
      },
    });
    if (!live.tunnel) {
      useLocal(`No tunnel program is installed, so only people on the same network can join. For a public link install cloudflared: ${INSTALL.cloudflared}`);
      return liveState();
    }
    setTimeout(() => {
      if (live && live.phase === 'starting') useLocal('The public link is taking long: using the local network for now.');
    }, 25000);
    return liveState();
  }

  async function stopLive() {
    if (!live) return liveState();
    const { server, tunnel } = live;
    live.stopping = true;
    live = null;
    try { if (tunnel) tunnel.kill(); } catch { /* already gone */ }
    await server.close();
    onChange();
    return liveState();
  }

  // --- export ------------------------------------------------------------------

  function jobState() {
    return job ? { ...job, promise: undefined } : null;
  }

  function startExport({ format = 'pptx', results = false, audience = true, safeFonts = false } = {}) {
    if (job && job.status === 'running') return jobState();
    if (!loadPlaywright()) {
      job = { status: 'failed', format, error: 'Exporting draws every slide in a browser, which needs Playwright.', install: INSTALL_PLAYWRIGHT };
      return jobState();
    }
    if (results && !hasVotes(dir)) {
      job = { status: 'failed', format, error: 'There are no votes yet. Give the talk first, or export without the results.' };
      return jobState();
    }
    const title = talk().meta.title;
    const out = join(dir, 'export', `${slugOf(title)}${results ? '-results' : ''}.${format}`);
    job = { status: 'running', format, slide: 0, total: talk().slides.length, file: out };
    exportTalk(dir, {
      file, out, pdf: format === 'pdf', safeFonts, results, audience,
      onSlide: (n, total) => { if (job) Object.assign(job, { slide: n, total }); },
    }).then((res) => {
      if (res.available === false) job = { status: 'failed', format, error: 'Playwright is not installed.', install: INSTALL_PLAYWRIGHT };
      else if (res.error) job = { status: 'failed', format, error: res.error };
      else {
        job = {
          status: 'done', format, file: res.file, slides: res.slides, charts: res.charts || 0,
          needsFonts: res.needsFonts || [], fallbacks: [...new Set(res.fallbacks || [])], problems: res.problems || [],
        };
      }
      onChange();
    }).catch((error) => {
      job = { status: 'failed', format, error: error.message };
      onChange();
    });
    return jobState();
  }

  function openFile(path) {
    if (job && job.file === path) openUrl(path);
  }

  // --- checks ---------------------------------------------------------------------

  function check() {
    const r = checkTalk(dir, file);
    return {
      clean: r.ok,
      problems: r.issues.map((i) => ({ ...i, level: 'warning' })),
      suggestions: r.suggestions.map((i) => ({ ...i, level: 'suggestion' })),
      votes: hasVotes(dir),
    };
  }

  return {
    liveState, startLive, stopLive, startExport, jobState, openFile, check,
    async close() { await stopLive(); },
  };
}
