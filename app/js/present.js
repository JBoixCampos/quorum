// The presentation: what you share on screen. Also runs inside the panel
// (a live, clickable preview), as still thumbnails, and on its own as a
// rehearsal with a simulated audience.
//
//   /present?key=...            the real thing, in sync with the server
//   /present?key=...&view=panel the preview inside the panel
//   /present?key=...&view=still&slide=3   a thumbnail: one slide, all steps done
//   /present?rehearse=1         rehearsal: everything runs here, nothing is sent

import { Session } from '../shared/session.js';
import { mountError, loadComponent } from './components.js';
import { connect, esc, send } from './net.js';
import { qrSvg } from './qr.js';
import { mountInteraction, mountJoin } from './screen.js';
import { Simulator } from './simulator.js';

const params = new URLSearchParams(location.search);
const STATIC = window.QUORUM_STATIC || null; // set by `quorum build`
const KEY = params.get('key') || '';
const VIEW = params.get('view') || '';
const STILL = VIEW === 'still';
const IN_PANEL = VIEW === 'panel';
const REHEARSE = !!STATIC || params.get('rehearse') === '1' || !KEY;

const stage = document.querySelector('[data-stage]');
const slideEl = document.querySelector('[data-slide]');
const footer = document.querySelector('[data-footer]');
const corner = document.querySelector('[data-corner]');
const notesEl = document.querySelector('[data-notes]');
const bar = document.querySelector('[data-rehearse]');

const state = {
  talk: null,
  index: 0,
  step: 0,
  view: { stage: { slide: 0, step: 0, rev: 0 }, connected: 0, questions: [], ui: {} },
  mounted: [],
  mountedFor: '',
  pending: 0,
  serverRev: -1,
  uiLocal: {},
  notes: false,
};

let session = null;
let simulator = null;

// --- scaling the 1920x1080 stage to the window ------------------------------

function fit() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${(window.innerWidth - 1920 * s) / 2}px`;
  stage.style.top = `${(window.innerHeight - 1080 * s) / 2}px`;
}
window.addEventListener('resize', fit);
fit();

// --- loading the talk --------------------------------------------------------

async function loadTalk() {
  const url = STATIC ? STATIC.talk : `/api/talk?${KEY ? `key=${encodeURIComponent(KEY)}` : 'rehearse=1'}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 403 ? 'Wrong presenter key.' : `Could not load the talk (${r.status}).`);
  return r.json();
}

function applyTheme(meta) {
  const root = document.documentElement;
  root.style.setProperty('--accent', meta.accent);
  root.dataset.theme = meta.theme;
  if (meta.font) root.style.setProperty('--font-display', meta.font);
  document.title = STILL || IN_PANEL ? 'Preview' : meta.title;
}

// Relative image and video paths in talk.md live next to it.
function fixAssets(root) {
  const base = STATIC ? STATIC.assets : '/talk/';
  root.querySelectorAll('img[src], video[src], source[src]').forEach((n) => {
    const src = n.getAttribute('src');
    if (!/^([a-z]+:|\/|#|data:)/i.test(src)) n.setAttribute('src', base + src.replace(/^\.\//, ''));
  });
}

// --- shared component state (screen and preview stay identical) --------------

function uiOf(key) {
  const remote = (state.view.ui || {})[key];
  const local = state.uiLocal[key];
  if (!remote) return local || null;
  if (!local) return remote;
  return local.seq >= remote.seq ? local : remote;
}

function setUi(key, partial) {
  const current = uiOf(key) || { seq: 0 };
  const next = { ...current, ...partial, seq: current.seq + 1 };
  state.uiLocal[key] = next;
  act({ type: 'ui', key, state: next });
  refresh();
  return next;
}

// --- actions -----------------------------------------------------------------

function act(action) {
  if (STILL) return Promise.resolve({ ok: true });
  if (REHEARSE) {
    const r = session.apply(action, { presenter: true });
    refreshLocalView();
    return Promise.resolve(r);
  }
  return send(action, { key: KEY });
}

function refreshLocalView() {
  state.view = { ...session.screenView(), connected: simulator ? simulator.joined : 0 };
  if (!STILL) {
    state.index = state.view.stage.slide;
    state.step = state.view.stage.step;
  }
  refresh();
}

// --- rendering ---------------------------------------------------------------

function context(extra = {}) {
  return {
    view: state.view,
    step: state.step,
    talk: state.talk,
    chatMode: !!state.view.chatMode,
    publicUrl: state.view.publicUrl || '',
    rehearse: REHEARSE,
    // Which copy of the slide this is: the shared screen, the panel's
    // preview, or a still thumbnail. Only "screen" should start slow work.
    where: STILL ? 'thumbnail' : (IN_PANEL ? 'preview' : 'screen'),
    act,
    ...extra,
  };
}

function unmount() {
  state.mounted.forEach((m) => { if (m.handle && m.handle.destroy) m.handle.destroy(); });
  state.mounted = [];
}

function renderSlide() {
  const slide = state.talk.slides[state.index];
  const key = `${state.talk.version}:${state.index}`;
  if (state.mountedFor === key) return;
  state.mountedFor = key;
  unmount();
  slideEl.className = `q-slide${slide.layout ? ` layout-${slide.layout}` : ''}`;
  slideEl.innerHTML = `<div class="q-content">${slide.html}</div>`;
  fixAssets(slideEl);

  if (slide.interaction) {
    const el = slideEl.querySelector(`[data-interaction="${CSS.escape(slide.interaction.id)}"]`);
    if (el) state.mounted.push({ type: 'interaction', handle: mountInteraction(el, slide.interaction, context()) });
  }
  slideEl.querySelectorAll('[data-join]').forEach((el) => {
    state.mounted.push({ type: 'join', handle: mountJoin(el, context()) });
  });
  slide.components.forEach((spec) => {
    const el = slideEl.querySelector(`[data-component="${CSS.escape(spec.id)}"]`);
    if (!el) return;
    const entry = { type: 'component', spec, handle: null };
    state.mounted.push(entry);
    const base = STATIC ? STATIC.components : '/talk/components/';
    loadComponent(spec.name, { base }).then((component) => {
      if (!state.mounted.includes(entry)) return;
      entry.handle = component.mount(el, componentContext(spec)) || {};
    }).catch((error) => mountError(el, spec.name, error));
  });
}

function componentContext(spec) {
  return context({
    params: spec.params,
    text: spec.text,
    state: uiOf(spec.id),
    setState: (partial) => setUi(spec.id, partial),
    // What the audience answered, when the block has "audience:".
    answers: spec.interaction && state.view.interaction && state.view.interaction.id === spec.interaction
      ? state.view.interaction : (spec.interaction ? { phase: 0, total: 0, values: [] } : null),
  });
}

function paintFooter() {
  const slide = state.talk.slides[state.index];
  const url = state.view.publicUrl || '';
  const votes = !!(slide.interaction && slide.interaction.kind !== 'questions') || (slide.interaction && slide.interaction.kind === 'questions');
  const showJoin = votes && !slide.join && url && !state.view.chatMode;
  const left = state.index === 0 ? '' : esc(state.talk.meta.title);
  const right = showJoin ? `Join at <b>${esc(url.replace(/^https?:\/\//, ''))}</b>` : `${state.index + 1} / ${state.talk.slides.length}`;
  const html = `<span>${left}</span><span>${right}</span>`;
  if (footer.innerHTML !== html) footer.innerHTML = html;
  const cornerKey = showJoin ? url : '';
  if (corner.dataset.url !== cornerKey) {
    corner.dataset.url = cornerKey;
    corner.innerHTML = cornerKey ? qrSvg(cornerKey, { label: 'Scan to join' }) : '';
  }
  corner.hidden = !cornerKey;
  stage.classList.toggle('audience', votes);
}

function refresh() {
  if (!state.talk) return;
  renderSlide();
  slideEl.querySelectorAll('.q-step').forEach((n) => {
    n.classList.toggle('shown', Number(n.dataset.step) <= state.step);
  });
  state.mounted.forEach((m) => {
    if (!m.handle || !m.handle.update) return;
    m.handle.update(m.type === 'component' ? componentContext(m.spec) : context());
  });
  paintFooter();
  paintNotes();
  paintBar();
}

function paintNotes() {
  if (!notesEl) return;
  notesEl.hidden = !state.notes || IN_PANEL || STILL;
  if (notesEl.hidden) return;
  const slide = state.talk.slides[state.index];
  const next = state.talk.slides[state.index + 1];
  notesEl.innerHTML = `<p class="q-notes-title">${esc(slide.title)} · step ${state.step + 1} of ${slide.steps}</p>
    <div class="q-notes-text">${esc(slide.notes || 'No notes for this slide.')}</div>
    ${next ? `<p class="q-notes-next">Next: ${esc(next.title)}</p>` : ''}
    <p class="q-notes-keys">→ next · ← back · N notes · F fullscreen · B chat mode</p>`;
}

function paintBar() {
  if (!bar) return;
  bar.hidden = !REHEARSE || STILL || IN_PANEL || !!STATIC;
  if (bar.hidden) return;
  bar.innerHTML = `Rehearsal: ${simulator ? simulator.joined : 0} simulated people.
    <button type="button" data-sim>${simulator && simulator.paused ? 'Resume' : 'Pause'} audience</button>
    <button type="button" data-chat>${state.view.chatMode ? 'Phone mode' : 'Chat mode'}</button>`;
}

if (bar) {
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-sim]') && simulator) simulator.paused = !simulator.paused;
    if (e.target.closest('[data-chat]')) act({ type: 'chatMode', on: !state.view.chatMode });
    paintBar();
  });
}

// --- navigation --------------------------------------------------------------

function go(index, step) {
  const slides = state.talk.slides;
  if (index < 0 || index >= slides.length) return;
  state.index = index;
  state.step = Math.max(0, Math.min(step, slides[index].steps - 1));
  refresh();
  if (STILL) return;
  if (REHEARSE) {
    session.apply({ type: 'stage', slide: state.index, step: state.step }, { presenter: true });
    refreshLocalView();
    return;
  }
  state.pending += 1;
  send({ type: 'stage', slide: state.index, step: state.step }, { key: KEY }).finally(() => {
    state.pending -= 1;
    if (state.pending === 0) syncFromServer();
  });
}

function interactionVisible() {
  const slide = state.talk.slides[state.index];
  const handles = state.mounted.filter((m) => m.handle && m.handle.primary);
  return handles.filter((m) => {
    const el = m.type === 'interaction' ? slideEl.querySelector('[data-interaction]') : null;
    const stepEl = el && el.closest('.q-step');
    return !stepEl || Number(stepEl.dataset.step) <= state.step;
  }).length > 0 && slide;
}

export function next() {
  const slide = state.talk.slides[state.index];
  // First, whatever the visible interaction or component wants to do next.
  if (interactionVisible()) {
    for (const m of state.mounted) {
      if (m.handle && m.handle.primary && m.handle.primary()) return;
    }
  }
  if (state.step < slide.steps - 1) go(state.index, state.step + 1);
  else go(state.index + 1, 0);
}

export function previous() {
  if (state.step > 0) go(state.index, state.step - 1);
  else if (state.index > 0) go(state.index - 1, state.talk.slides[state.index - 1].steps - 1);
}

function syncFromServer() {
  const s = state.view.stage;
  if (s.slide !== state.index || s.step !== state.step) {
    state.index = s.slide;
    state.step = s.step;
  }
  refresh();
}

window.quorum = {
  next,
  previous,
  go: (i, step = 0) => go(i, step),
  show(index) {
    // Thumbnails: one slide with every step shown.
    state.index = index;
    state.step = state.talk.slides[index] ? state.talk.slides[index].steps - 1 : 0;
    refresh();
  },
};

document.addEventListener('keydown', (e) => {
  if (STILL || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const k = e.key;
  if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(k)) { e.preventDefault(); next(); }
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); previous(); }
  else if (k === 'Home') go(0, 0);
  else if (k === 'End') go(state.talk.slides.length - 1, 0);
  else if (k === 'n' || k === 'N') { state.notes = !state.notes; paintNotes(); }
  else if (k === 'f' || k === 'F') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  } else if (k === 'b' || k === 'B') act({ type: 'chatMode', on: !state.view.chatMode });
});

// Click to advance (left third goes back), except on buttons and controls.
stage.addEventListener('click', (e) => {
  if (STILL) return;
  if (e.target.closest('button, a, input, textarea, select, [data-no-advance], .q-bar.clickable, [data-question]')) return;
  const rect = stage.getBoundingClientRect();
  if (e.clientX - rect.left < rect.width * 0.3) previous();
  else next();
});

// --- start -------------------------------------------------------------------

function showError(message) {
  slideEl.innerHTML = `<div class="q-content q-center"><h2>Quorum</h2><p>${esc(message)}</p></div>`;
}

async function start() {
  let talk;
  try {
    talk = await loadTalk();
  } catch (error) {
    showError(error.message);
    return;
  }
  state.talk = talk;
  applyTheme(talk.meta);
  if (IN_PANEL) document.documentElement.classList.add('in-panel');
  if (STILL) {
    document.documentElement.classList.add('still');
    window.quorum.show(Number(params.get('slide') || 0));
  }

  if (REHEARSE) {
    session = new Session(talk, null, { moderation: false });
    if (!STATIC) session.apply({ type: 'url', url: location.origin }, { presenter: true });
    simulator = new Simulator(session, () => refreshLocalView());
    refreshLocalView();
    return;
  }

  connect({
    role: 'screen',
    key: KEY,
    onChange: async (view) => {
      state.view = view;
      if (view.talkVersion !== state.talk.version) {
        // talk.md changed: load it again and keep going.
        try {
          state.talk = await loadTalk();
          applyTheme(state.talk.meta);
        } catch {
          // Keep the old version until the next change.
        }
      }
      if (!STILL && state.pending === 0 && view.stage.rev !== state.serverRev) {
        state.serverRev = view.stage.rev;
        state.index = Math.min(view.stage.slide, state.talk.slides.length - 1);
        state.step = view.stage.step;
      }
      if (STILL) window.quorum.show(Math.min(state.index, state.talk.slides.length - 1));
      else refresh();
    },
    onStatus: (s) => document.documentElement.classList.toggle('offline', s === 'offline'),
  });
}

start();
