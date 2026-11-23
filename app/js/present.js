// The presentation: what you share on screen. Also runs inside the panel
// (a live, clickable preview), as still thumbnails, and on its own as a
// preview with a simulated audience.
//
//   /present?key=...            the real thing, in sync with the server
//   /present?key=...&view=panel the preview inside the panel
//   /present?key=...&view=still&slide=3   a thumbnail: one slide, all steps done
//   /present?preview=1          `quorum preview`: everything runs here, with a
//                               simulated audience, and nothing is sent
//
// A static build (`quorum build`) is always a preview; `quorum export`
// builds one without the audience slides and without a simulated audience.
// Both accept:
//
//   ?slide=3                    start on that slide (counted from 0)
//   ?playground=1               wait for Markdown from the page that embeds
//                               it (same origin only) and render that instead

import { chartHtml, formatValue } from '../shared/charts.js';
import { iconSvg } from '../shared/icons.js';
import { parseTalk } from '../shared/markdown.js';
import { Session } from '../shared/session.js';
import { applyBrand, logoHtml, themeOf } from './brand.js';
import { mountError, loadComponent } from './components.js';
import {
  animateNumber, captureLeaving, codeRanges, countUp, playTransition, reactionLayer,
} from './motion.js';
import { connect, esc, send } from './net.js';
import { qrSvg } from './qr.js';
import { mountInteraction, mountJoin } from './screen.js';
import { Simulator } from './simulator.js';

const params = new URLSearchParams(location.search);
const STATIC = window.QUORUM_STATIC || null; // set by `quorum build`
const KEY = params.get('key') || '';
const VIEW = params.get('view') || '';
// "studio" is the editor's canvas: one slide, every step shown, with a source map.
const STILL = VIEW === 'still' || VIEW === 'studio';
const STUDIO = VIEW === 'studio';
// The editor's thumbnails and canvas: no simulated audience, no polling.
const NOSIM = params.get('nosim') === '1';
const IN_PANEL = VIEW === 'panel';
const PREVIEW = !!STATIC || !KEY;
const PLAYGROUND = !!STATIC && params.get('playground') === '1';
// `quorum export`: the slides alone, with no audience at all.
const AUDIENCE = !STATIC || STATIC.audience !== false;
// Where the talk folder (images, components, fonts) is served.
const ASSETS = STATIC ? STATIC.assets : '/talk/';

const stage = document.querySelector('[data-stage]');
const slideEl = document.querySelector('[data-slide]');
const footer = document.querySelector('[data-footer]');
const corner = document.querySelector('[data-corner]');
const logo = document.querySelector('[data-logo]');
const notesEl = document.querySelector('[data-notes]');
const bar = document.querySelector('[data-preview]');
const reactions = reactionLayer(document.querySelector('[data-reactions]'));

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
  // The slide on screen, so the next one can animate from it.
  shown: null,
  theme: null,
};

let session = null;
let simulator = null;
// The slide a thumbnail shows (?slide=N, then whatever the panel asks).
let stillSlide = Number(params.get('slide') || 0);

// --- scaling the 1920x1080 stage to the window ------------------------------

let stageScale = 1;
function fit() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stageScale = s;
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${(window.innerWidth - 1920 * s) / 2}px`;
  stage.style.top = `${(window.innerHeight - 1080 * s) / 2}px`;
}
window.addEventListener('resize', fit);
fit();

// --- loading the talk --------------------------------------------------------

async function loadTalk() {
  const extra = ['map', 'override'].filter((k) => params.get(k)).map((k) => `&${k}=${encodeURIComponent(params.get(k))}`).join('');
  const url = STATIC ? STATIC.talk : `/api/talk?${KEY ? `key=${encodeURIComponent(KEY)}` : 'preview=1'}${extra}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 403 ? 'Wrong presenter key.' : `Could not load the talk (${r.status}).`);
  return r.json();
}

function applyTheme(meta) {
  applyBrand(meta, { assets: ASSETS, style: true });
  state.theme = null;
  const html = logoHtml(meta, ASSETS);
  if (logo.innerHTML !== html) logo.innerHTML = html;
  document.title = STILL || IN_PANEL ? 'Preview' : meta.title;
}

// Relative image and video paths in talk.md live next to it.
function fixAssets(root) {
  const base = ASSETS;
  root.querySelectorAll('img[src], video[src], source[src]').forEach((n) => {
    const src = n.getAttribute('src');
    if (!/^([a-z]+:|\/|#|data:)/i.test(src)) n.setAttribute('src', base + src.replace(/^\.\//, ''));
  });
}

// --- helpers for components: ctx.ui ----------------------------------------

const UI = {
  // A chart drawn like Quorum's own: ctx.ui.chart('donut', [{ label, value }], { total }).
  chart: (type, rows, opts = {}) => chartHtml(type, rows, { series: true, ...opts }),
  icon: (name, cls = 'q-icon') => iconSvg(name, cls),
  // The colour of answer n (from the talk's palette), as a CSS value.
  color: (n) => `var(--series-${(Math.abs(n) % 8) + 1})`,
  countUp: (el, to, opts) => animateNumber(el, to, opts),
  format: formatValue,
};

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
  if (PREVIEW) {
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
    publicUrl: state.view.publicUrl || '',
    // Where the talk folder is served, for files in it: `${assets}images/a.png`.
    assets: ASSETS,
    // True with a simulated audience (quorum preview, a static build).
    preview: PREVIEW,
    // Older names, kept so existing components keep working.
    rehearse: PREVIEW,
    chatMode: false,
    // Which copy of the slide this is: the shared screen, the panel's
    // preview, or a still thumbnail. Only "screen" should start slow work.
    where: STILL ? 'thumbnail' : (IN_PANEL ? 'preview' : 'screen'),
    // The talk's resolved look: colours, palette, fonts, tokens.
    get theme() {
      if (!state.theme && state.talk) state.theme = themeOf(state.talk.meta);
      return state.theme;
    },
    ui: UI,
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
  const prev = state.shown;
  const moving = !STILL && prev && prev.version === state.talk.version && prev.index !== state.index;
  const kind = slide.transition || (state.talk.meta.tokens || {}).transition || 'none';
  const leaving = moving ? captureLeaving(slideEl, kind) : null;
  state.shown = { index: state.index, version: state.talk.version };
  unmount();
  const bg = slide.background;
  const options = (slide.layoutOptions || []).filter((o) => /^[a-z-]+$/.test(o)).map((o) => ` opt-${o}`).join('');
  slideEl.className = `q-slide${slide.layout ? ` layout-${slide.layout}` : ''}${options}${bg && (bg.color || bg.image) ? ' has-bg' : ''}${bg && bg.dim ? ' bg-dim' : ''}`;
  slideEl.dataset.sid = slide.id;
  if (bg && bg.gradient) slideEl.dataset.gradient = bg.gradient;
  else delete slideEl.dataset.gradient;
  slideEl.style.backgroundColor = bg && bg.color ? bg.color : '';
  slideEl.style.backgroundImage = bg && bg.image ? `url("${ASSETS}${bg.image}")` : '';
  slideEl.innerHTML = `${slide.media ? `<div class="q-media">${slide.media}</div>` : ''}<div class="q-content">${slide.html}</div>`;
  fixAssets(slideEl);
  logo.hidden = !slide.logo || !logo.innerHTML;
  stage.classList.toggle('dim', !!(bg && bg.dim));

  if (slide.interaction) {
    const el = slideEl.querySelector(`[data-interaction="${CSS.escape(slide.interaction.id)}"]`);
    if (el) state.mounted.push({ type: 'interaction', handle: mountInteraction(el, slide.interaction, context()) });
  }
  slideEl.querySelectorAll('[data-join]').forEach((el) => {
    if (!AUDIENCE) {
      el.remove();
      return;
    }
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
  if (leaving) {
    const back = prev.index > state.index;
    // Steps of the new slide must be in place before measuring it.
    slideEl.querySelectorAll('.q-step').forEach((n) => {
      n.classList.toggle('shown', Number(n.dataset.step) <= state.step);
    });
    playTransition(leaving, slideEl, { dir: back ? -1 : 1, scale: stageScale });
  }
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

// The footer of the talk ("footer:" in the front matter) with its
// placeholders filled in. Where the audience can answer, its right side
// says how to join, next to the corner QR code.
function footerHtml(slide, showJoin, url) {
  const { meta, slides } = state.talk;
  const on = slide.footer === 'on' || (slide.footer !== 'off' && state.index > 0);
  const parts = on && meta.footer ? { ...meta.footer } : { left: '', right: '' };
  if (showJoin) parts.right = `Join at <b>${esc(url.replace(/^https?:\/\//, ''))}</b>`;
  if (!parts.left && !parts.right) return '';
  const section = slides.slice(0, state.index + 1).reverse().find((s) => s.section);
  const values = {
    title: meta.title,
    author: meta.author,
    section: section ? section.section.name : '',
    n: String(state.index + 1),
    total: String(slides.length),
  };
  // An empty placeholder takes the separator next to it along: "Talk · {section}".
  const fill = (text) => text.replace(/\{(title|author|section|n|total)\}/g, (_, k) => esc(values[k]))
    .replace(/^\s*[·•|/-]\s*|\s*[·•|/-]\s*$/g, '')
    .replace(/\s*[·•]\s*(?=\s*[·•])/g, '');
  return `<span>${fill(parts.left)}</span><span>${showJoin ? parts.right : fill(parts.right)}</span>`;
}

function paintFooter() {
  const slide = state.talk.slides[state.index];
  const url = state.view.publicUrl || '';
  const votes = !!slide.interaction;
  const showJoin = votes && !slide.join && url;
  const html = footerHtml(slide, showJoin, url);
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
  codeRanges(slideEl, state.step);
  countUp(slideEl, { still: STILL });
  if (!STILL && !IN_PANEL) reactions.show((state.view.reactions || {}).recent);
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
    <p class="q-notes-keys">→ next · ← back · N notes · F fullscreen</p>`;
}

function paintBar() {
  if (!bar) return;
  bar.hidden = !PREVIEW || STILL || IN_PANEL || !!STATIC;
  if (bar.hidden) return;
  bar.innerHTML = `Preview: ${simulator ? simulator.joined : 0} simulated people.
    <button type="button" data-sim>${simulator && simulator.paused ? 'Resume' : 'Pause'} audience</button>`;
}

if (bar) {
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-sim]') && simulator) simulator.paused = !simulator.paused;
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
  if (PREVIEW) {
    session.apply({ type: 'stage', slide: state.index, step: state.step }, { presenter: true });
    refreshLocalView();
    return;
  }
  state.pending += 1;
  send({ type: 'stage', slide: state.index, step: state.step }, { key: KEY }).then((r) => {
    state.pending -= 1;
    // Only go back to what the server says if it refused the change: the
    // last view it sent may still show the previous slide, and jumping
    // back to it would replay the transition.
    if (state.pending === 0 && !(r && r.ok)) syncFromServer();
  });
}

// Whether an interaction or component that reacts to "next" is on screen
// (not hidden in a later step).
function interactionVisible() {
  return state.mounted.some((m) => {
    if (!m.handle || !m.handle.primary) return false;
    const el = m.type === 'interaction' ? slideEl.querySelector('[data-interaction]') : null;
    const stepEl = el && el.closest('.q-step');
    return !stepEl || Number(stepEl.dataset.step) <= state.step;
  });
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
  // The editor changed the talk: read it again and draw the same slide.
  async reloadTalk() {
    const talk = await loadTalk();
    talk.version = (state.talk ? state.talk.version || 0 : 0) + 1;
    state.talk = talk;
    applyTheme(talk.meta);
    session = new Session(talk, null, { moderation: false });
    refreshLocalView();
    state.index = Math.min(state.index, talk.slides.length - 1);
    window.quorum.show(state.index);
    return talk.slides.length;
  },
  next,
  previous,
  go: (i, step = 0) => go(i, step),
  show(index) {
    // Thumbnails: one slide with every step shown. The panel may ask for
    // another slide before the talk has loaded: remember it for then.
    stillSlide = index;
    if (!state.talk) return;
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
  }
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

// --- playground: Markdown sent by the page around this one -------------------

const EMPTY = '<!-- layout: center -->\n\nWrite some Markdown to see a slide here.';

function loadSource(markdown) {
  let talk = parseTalk(String(markdown || ''));
  // Only front matter, or nothing at all: show a hint instead of no slide.
  if (!talk.slides.length) talk = parseTalk(`${markdown || ''}\n\n${EMPTY}`);
  talk.version = (state.talk ? state.talk.version || 0 : 0) + 1;
  state.talk = talk;
  applyTheme(talk.meta);
  // Keep the votes of interactions that are still there.
  session = new Session(talk, session ? session.toJSON() : null, { moderation: false });
  if (simulator) simulator.session = session;
  else if (AUDIENCE) simulator = new Simulator(session, () => refreshLocalView());
  state.index = Math.min(state.index, talk.slides.length - 1);
  return talk;
}

function listenToPlayground() {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const data = e.data || {};
    if (data.type !== 'quorum:source') return;
    const talk = loadSource(data.markdown);
    refreshLocalView();
    const target = Number.isInteger(data.slide) ? Math.max(0, Math.min(data.slide, talk.slides.length - 1)) : state.index;
    if (target !== state.index) go(target, 0);
    window.parent.postMessage({
      type: 'quorum:parsed',
      slides: talk.slides.length,
      slide: state.index,
      warnings: talk.warnings,
    }, location.origin);
  });
  window.parent.postMessage({ type: 'quorum:ready' }, location.origin);
}

async function start() {
  if (PLAYGROUND) {
    document.documentElement.classList.add('playground');
    loadSource('');
    refreshLocalView();
    listenToPlayground();
    return;
  }
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
  if (STUDIO) document.documentElement.classList.add('in-studio');
  if (STILL) {
    document.documentElement.classList.add('still');
    window.quorum.show(stillSlide);
  }

  if (PREVIEW) {
    session = new Session(talk, null, { moderation: false });
    if (!STATIC) session.apply({ type: 'url', url: location.origin }, { presenter: true });
    if (AUDIENCE && !NOSIM) simulator = new Simulator(session, () => refreshLocalView());
    refreshLocalView();
    // A static build can be opened on a given slide: ?slide=3
    if (STATIC && !STILL && params.has('slide')) {
      const n = Number(params.get('slide'));
      if (Number.isInteger(n)) go(Math.max(0, Math.min(n, talk.slides.length - 1)), 0);
    }
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
