// Quorum Studio: the place to shape a talk, then give it or export it.
// Every edit asks the server to change the talk's own files (talk.md, or the
// slide files of a split talk); the slide is drawn from those files again
// after each change, so what you see is always what is on disk.

import {
  COMPONENT_LABELS, EDITORS, LIBRARY, LIBRARY_ITEMS, editorFor, inlineEditable, inlineToMarkdown, placeOnCanvas, readBlock,
} from './studio-blocks.js';
import { attachCanvas } from './studio-canvas.js';
import { icon } from './studio-icons.js';
import { TEMPLATES } from './studio-templates.js';

const params = new URLSearchParams(location.search);
const KEY = params.get('key') || '';
const $ = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const BLOCK_TYPE = 'application/x-quorum-block';

const S = {
  state: null,
  index: 0,
  canvas: null,
  selected: null,
  textLines: [],
  revision: 0,
  busy: 0,
  selectToken: 0,
  tab: 'insert',
  editing: null,
  zoom: 0, // 0 is "fit"
  problems: { problems: [], suggestions: [] },
  live: null,
  options: null,
  asked: null,
  sync: null,
};

const el = {
  frame: $('[data-frame]'),
  canvas: $('[data-canvas]'),
  wrap: $('[data-wrap]'),
  rail: $('[data-rail]'),
  status: $('[data-status]'),
  title: $('[data-title]'),
  editor: $('[data-editor]'),
  editorText: $('[data-editor-text]'),
  source: $('[data-source]'),
  sourceText: $('[data-source-text]'),
  sourceNote: $('[data-source-note]'),
  modal: $('[data-modal]'),
  side: $('[data-side]'),
  float: $('[data-float]'),
  drop: $('[data-drop]'),
  live: $('[data-live]'),
  where: $('[data-where]'),
};

// --- small helpers -------------------------------------------------------------

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  });
  children.flat(Infinity).forEach((c) => {
    if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return node;
}
const ic = (name) => h('span', { html: icon(name), style: 'display:contents' });
const btn = (cls, label, onclick, extra = {}) => h('button', { type: 'button', class: cls, onclick, ...extra }, label);

function setIcon(button, name, label = '') {
  button.innerHTML = `${icon(name)}${label ? `<span>${label}</span>` : ''}`;
}

function toast(text, { error = false, action = null } = {}) {
  const box = $('[data-toasts]');
  const node = h('div', { class: `toast${error ? ' error' : ''}` }, h('span', {}, text), action ? btn('', action.label, () => { action.run(); node.remove(); }) : null);
  box.append(node);
  setTimeout(() => node.remove(), error ? 6000 : 3500);
}

function say(text, kind = '') {
  el.status.textContent = text;
  el.status.className = `saved${kind ? ` ${kind}` : ''}`;
}

async function api(path, { method = 'GET', body } = {}) {
  const joiner = path.includes('?') ? '&' : '?';
  const r = await fetch(`/api/studio/${path}${joiner}key=${encodeURIComponent(KEY)}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({ ok: false, error: 'No answer from Studio. Is `quorum studio` still running?' }));
  if (!r.ok || data.ok === false) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

const slides = () => (S.state ? S.state.slides : []);
const current = () => slides()[S.index];
const isCanvasSlide = () => !!current() && current().layout === 'canvas';

// Applies operations to the files, then draws everything again.
async function run(ops, { select = null, message = '', side = true } = {}) {
  S.busy += 1;
  say('Saving', 'busy');
  const token = S.selectToken;
  try {
    await api('op', { method: 'POST', body: { ops: Array.isArray(ops) ? ops : [ops] } });
    await refresh({ select: token === S.selectToken ? select : null, side });
    say(`Saved to ${current() ? current().file : S.state.file}`);
    if (message) toast(message);
    return true;
  } catch (error) {
    say('Not saved', 'error');
    toast(error.message, { error: true });
    await refresh({}).catch(() => {});
    return false;
  } finally {
    S.busy -= 1;
  }
}

// --- loading ----------------------------------------------------------------------

async function refresh({ select = null, side = true } = {}) {
  const data = await api('state');
  S.state = data;
  S.revision = data.revision;
  S.index = clamp(S.index, 0, Math.max(0, data.slides.length - 1));
  el.title.textContent = data.title;
  document.title = `${data.title} · Quorum Studio`;
  $('[data-act="undo"]').disabled = !data.canUndo;
  $('[data-act="redo"]').disabled = !data.canRedo;
  $('[data-count]').textContent = String(data.slides.length);
  await loadText();
  renderRail(true);
  await reloadCanvas();
  if (select && S.canvas) S.selected = named(S.canvas.select(select));
  else if (S.canvas && S.selected) S.selected = named(S.canvas.info());
  // A form saving itself keeps its own fields (and rows not filled in yet).
  if (side) {
    S.options = null;
    renderSide();
  }
  placeFloat();
  updateWhere();
  loadProblems();
  loadSync();
}

async function loadText() {
  const slide = current();
  if (!slide) { S.textLines = []; return; }
  const data = await api(`slide?id=${encodeURIComponent(slide.id)}`);
  S.textLines = data.text.split('\n');
  if (document.activeElement !== el.sourceText) el.sourceText.value = data.text.replace(/\n+$/, '');
  el.sourceNote.textContent = `${data.file}, lines ${data.lines[0]} to ${data.lines[1]}`;
}

// The Markdown of lines a..b of the whole talk, from the slide's own text.
function sourceOf(range) {
  const first = S.textLines.findIndex((l) => l.trim() !== '');
  const start = current().lines[0];
  return S.textLines.slice(range[0] - start + Math.max(0, first), range[1] - start + Math.max(0, first) + 1).join('\n');
}

let problemsTimer = null;
function loadProblems() {
  clearTimeout(problemsTimer);
  problemsTimer = setTimeout(async () => {
    try {
      S.problems = await api('check');
      paintProblems();
      renderRail(false);
    } catch { /* checked again on the next change */ }
  }, 400);
}

function paintProblems() {
  const b = $('[data-act="problems"]');
  const n = S.problems.problems.length;
  const m = S.problems.suggestions.length;
  b.innerHTML = `${icon(n ? 'triangle-alert' : 'circle-check')}<span>${n ? 'Problems' : 'Checks'}</span><span class="badge ${n ? 'warn' : (m ? '' : 'ok')}">${n || m || '0'}</span>`;
  b.dataset.tip = n ? `${n} to fix before you give the talk` : (m ? `${m} suggestions` : 'Everything checks out');
}

function updateWhere() {
  const slide = current();
  el.where.textContent = slide ? `Slide ${slide.index + 1} of ${slides().length}${slide.layout ? ` · ${slide.layout}` : ''}${S.selected ? ` · ${S.selected.label}` : ''}` : '';
}

// --- the canvas ---------------------------------------------------------------------

let frameReady = null;
const frameWindow = () => el.frame.contentWindow;

async function reloadCanvas() {
  const slide = current();
  if (!slide) return;
  if (!frameReady) {
    frameReady = new Promise((done) => {
      el.frame.addEventListener('load', async () => {
        for (let i = 0; i < 100 && !frameWindow().document.querySelector('[data-slide] .q-content'); i += 1) await sleep(50);
        if (S.canvas) S.canvas.detach();
        S.canvas = attachCanvas(el.frame, canvasApi);
        done();
      }, { once: true });
      el.frame.src = `/present?preview=1&view=studio&map=1&nosim=1&slide=${S.index}`;
    });
    await frameReady;
    return;
  }
  await frameReady;
  const q = frameWindow().quorum;
  if (q && q.reloadTalk) {
    q.show(S.index);
    await q.reloadTalk();
    q.show(S.index);
  }
  await sleep(30);
  if (S.canvas) S.canvas.redraw();
}

function fit() {
  const w = el.wrap.clientWidth - 64;
  const h = el.wrap.clientHeight - 64;
  if (w <= 0 || h <= 0) return;
  const fitted = Math.min(w, (h * 16) / 9);
  const width = S.zoom ? 1280 * S.zoom : fitted;
  el.canvas.style.width = `${Math.floor(width)}px`;
  el.canvas.style.height = `${Math.floor((width * 9) / 16)}px`;
  $('[data-zoom]').textContent = S.zoom ? `${Math.round(S.zoom * 100)}%` : 'Fit';
  setTimeout(() => { if (S.canvas) S.canvas.redraw(); placeFloat(); }, 220);
}
new ResizeObserver(fit).observe(el.wrap);

function zoom(step) {
  const now = S.zoom || (el.canvas.clientWidth / 1280);
  const levels = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];
  const next = step > 0 ? levels.find((l) => l > now + 0.01) : [...levels].reverse().find((l) => l < now - 0.01);
  S.zoom = next || now;
  fit();
}

const canvasApi = {
  isCanvas: isCanvasSlide,
  labelFor: (range) => blockLabel(range, ''),
  onSelect(info) {
    S.selectToken += 1;
    S.selected = named(info);
    closeEditor();
    if (info && S.tab === 'insert') S.tab = 'format';
    renderSide();
    placeFloat();
    updateWhere();
  },
  onEdit(info) { editSelected(info); },
  onKey: handleKey,
  onMoveBlock({ from, to, where }) {
    S.selected = null;
    run({ op: 'move-block', slide: current().id, from, to, where });
  },
  onPosition({ range, kv }) {
    run({ op: 'set-attrs', slide: current().id, range, kv }, { select: range });
  },
  onDragFiles(on) { el.drop.hidden = !on; },
  onDropFiles: handleDropFiles,
  onDropBlock(id, place) {
    const item = LIBRARY_ITEMS[id] || componentItem(id);
    if (item) insertItem(item, place);
  },
};

// Names a selected block after what it is (Poll, Quiz, Chart...), from its Markdown.
const BLOCK_LABELS = {
  poll: 'Poll', multi: 'Several answers', estimate: 'Guess a number', rounds: 'Rounds', sentence: 'Write together', questions: 'Questions', component: 'Component', join: 'Join code', chart: 'Chart', callout: 'Callout',
};
function blockLabel(range, fallback) {
  if (!current()) return fallback;
  const b = readBlock(sourceOf(range));
  if (!b) return fallback;
  if (b.name === 'poll' && /^\s*[-*+]\s+\[[xX]\]/m.test(b.body.join('\n'))) return 'Quiz';
  if (b.name === 'component' && COMPONENT_LABELS[String(b.title).trim().toLowerCase()]) return COMPONENT_LABELS[String(b.title).trim().toLowerCase()];
  return BLOCK_LABELS[b.name] || fallback;
}
function named(info) {
  if (!info) return info;
  const label = blockLabel;
  info.label = label(info.range, info.label);
  info.chain = info.chain.map((c) => ({ ...c, label: label(c.range, c.label) }));
  return info;
}

// The floating toolbar above the selected element.
function placeFloat() {
  const sel = S.selected;
  if (!sel || !S.canvas || (S.canvas.editing && S.canvas.editing())) { el.float.hidden = true; return; }
  const r = S.canvas.rect();
  if (!r) { el.float.hidden = true; return; }
  const frame = el.frame.getBoundingClientRect();
  const stage = $('.stage').getBoundingClientRect();
  const x = frame.left - stage.left + r.left + r.width / 2;
  let y = frame.top - stage.top + r.top - 32;
  if (y < 52) y = frame.top - stage.top + r.bottom + 52;
  el.float.style.left = `${clamp(x, 160, stage.width - 160)}px`;
  el.float.style.top = `${y}px`;
  el.float.replaceChildren(
    h('span', { class: 'label' }, sel.label),
    h('button', { type: 'button', class: 'ib', 'data-tip': 'Edit the text  Enter', onclick: () => editSelected(S.selected), html: icon('pencil') }),
    h('button', { type: 'button', 'data-tip': 'Write the request for your agent', onclick: () => askAgent('edit'), html: `${icon('sparkles')}<span>Ask agent</span>` }),
    h('button', { type: 'button', class: 'ib', 'data-tip': 'Duplicate', onclick: duplicateSelected, html: icon('copy') }),
    h('button', { type: 'button', class: 'ib', 'data-tip': 'Delete  Del', onclick: deleteSelected, html: icon('trash-2') }),
  );
  el.float.hidden = false;
}
el.wrap.addEventListener('scroll', placeFloat);

// --- the rail ----------------------------------------------------------------------------

let thumbObserver = null;
function renderRail(stale) {
  const list = slides();
  const problemSlides = new Set(S.problems.problems.map((p) => p.slide).filter(Boolean));
  const askedSlides = new Set(((S.state && S.state.requests) || []).filter((r) => r.status !== 'done').map((r) => r.slide));
  const incomingSlides = new Set(((S.sync && S.sync.incoming) || []).map((x) => x.id));
  const existing = new Map(all('.slide', el.rail).map((n) => [n.dataset.key, n]));
  const nodes = [];
  list.forEach((slide, i) => {
    if (slide.section) nodes.push(h('div', { class: 'section-label' }, slide.section.name));
    const key = `${i}`;
    let item = existing.get(key);
    if (!item) {
      item = h('div', { class: 'slide', draggable: 'true', 'data-key': key },
        h('span', { class: 'n' }),
        h('div', { class: 'thumb' }, h('iframe', { tabindex: '-1', title: '' })),
        h('div', { class: 'flags' }),
        h('div', { class: 'tools' },
          h('button', { type: 'button', 'data-do': 'dup', 'data-tip': 'Duplicate slide', html: icon('copy') }),
          h('button', { type: 'button', 'data-do': 'del', 'data-tip': 'Delete slide', html: icon('trash-2') })));
      wireRailItem(item);
    }
    item.dataset.index = String(i);
    item.setAttribute('aria-current', i === S.index ? 'true' : 'false');
    $('.n', item).textContent = String(i + 1);
    const frame = $('iframe', item);
    frame.title = `Slide ${i + 1}: ${slide.title}`;
    if (stale) frame.dataset.stale = 'yes';
    const flags = $('.flags', item);
    flags.replaceChildren(...[
      slide.asks ? h('span', { class: 'flag', 'data-tip': 'The audience answers on this slide', html: `${icon('vote')}` }) : null,
      problemSlides.has(i + 1) ? h('span', { class: 'flag warn', 'data-tip': 'Something to fix here', html: icon('triangle-alert') }) : null,
      askedSlides.has(slide.id) ? h('span', { class: 'flag', 'data-tip': 'Your agent has a request for this slide', html: icon('sparkles') }) : null,
      incomingSlides.has(slide.id) ? h('span', { class: 'flag new', 'data-tip': 'Someone pushed a change to this slide: pull it in the Team tab', html: icon('git-branch') }) : null,
    ].filter(Boolean));
    nodes.push(item);
  });
  el.rail.replaceChildren(...nodes);
  if (!thumbObserver) {
    thumbObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) drawThumb(entry.target); });
    }, { root: el.rail, rootMargin: '300px' });
  }
  all('.thumb', el.rail).forEach((thumb) => {
    const frame = $('iframe', thumb);
    const scale = thumb.clientWidth / 1280;
    if (scale > 0) frame.style.transform = `scale(${scale})`;
    thumbObserver.unobserve(thumb);
    thumbObserver.observe(thumb);
  });
}

function drawThumb(thumb) {
  const frame = $('iframe', thumb);
  const index = Number(thumb.closest('.slide').dataset.index);
  if (frame.dataset.stale !== 'yes' && frame.src) return;
  frame.dataset.stale = '';
  const q = frame.contentWindow && frame.contentWindow.quorum;
  if (frame.src && q && q.reloadTalk) {
    q.show(index);
    q.reloadTalk().catch(() => {});
  } else {
    frame.src = `/present?preview=1&view=still&nosim=1&slide=${index}`;
  }
}

function railDropIndex(item, e) {
  const r = item.getBoundingClientRect();
  return Number(item.dataset.index) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
}

function wireRailItem(item) {
  item.addEventListener('click', (e) => {
    const action = e.target.closest('[data-do]');
    const i = Number(item.dataset.index);
    if (action) {
      e.stopPropagation();
      const slide = slides()[i];
      if (action.dataset.do === 'dup') run({ op: 'duplicate-slide', slide: slide.id }).then(() => selectSlide(i + 1));
      else deleteSlide(slide);
      return;
    }
    selectSlide(i);
  });
  item.addEventListener('dragstart', (e) => {
    S.dragIndex = Number(item.dataset.index);
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(S.dragIndex));
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    S.dragIndex = undefined;
    all('.slide', el.rail).forEach((n) => n.classList.remove('over-before', 'over-after'));
  });
  item.addEventListener('dragover', (e) => {
    const types = [...e.dataTransfer.types];
    if (S.dragIndex === undefined && !types.includes(BLOCK_TYPE)) return;
    e.preventDefault();
    const r = item.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    all('.slide', el.rail).forEach((n) => n.classList.remove('over-before', 'over-after'));
    item.classList.add(before ? 'over-before' : 'over-after');
  });
  item.addEventListener('drop', (e) => {
    e.preventDefault();
    all('.slide', el.rail).forEach((n) => n.classList.remove('over-before', 'over-after'));
    const insertAt = railDropIndex(item, e);
    const block = e.dataTransfer.getData(BLOCK_TYPE);
    if (block) {
      const lib = LIBRARY_ITEMS[block] || componentItem(block);
      if (lib) newSlideWith(lib, insertAt);
      return;
    }
    if (S.dragIndex === undefined) return;
    const from = S.dragIndex;
    S.dragIndex = undefined;
    if (insertAt === from || insertAt === from + 1) return;
    const after = [...slides()].reverse().find((s) => s.index < insertAt && s.index !== from);
    const landing = insertAt > from ? insertAt - 1 : insertAt;
    run({ op: 'move-slide', slide: slides()[from].id, after: after ? after.id : null }).then(() => selectSlide(landing));
  });
}

async function selectSlide(i) {
  if (i < 0 || i >= slides().length) return;
  S.index = i;
  S.selected = null;
  S.options = null;
  closeEditor();
  if (S.canvas) S.canvas.clear();
  await loadText();
  all('.slide', el.rail).forEach((n) => n.setAttribute('aria-current', String(Number(n.dataset.index) === i)));
  await frameReady;
  const q = frameWindow().quorum;
  if (q) q.show(i);
  await sleep(40);
  if (S.canvas) S.canvas.redraw();
  const item = all('.slide', el.rail).find((n) => Number(n.dataset.index) === i);
  if (item && item.scrollIntoView) item.scrollIntoView({ block: 'nearest' });
  if (S.tab === 'format' && !S.selected) S.tab = 'format';
  renderSide();
  placeFloat();
  updateWhere();
}

async function deleteSlide(slide) {
  const ok = await run({ op: 'delete-slide', slide: slide.id });
  if (ok) toast(`Deleted "${slide.title}".`, { action: { label: 'Undo', run: undo } });
}

// --- the side panel --------------------------------------------------------------------------

const TABS = [
  { id: 'insert', label: 'Insert', icon: 'plus' },
  { id: 'format', label: 'Edit', icon: 'pencil' },
  { id: 'alternatives', label: 'Alternatives', icon: 'sparkles' },
  { id: 'theme', label: 'Theme', icon: 'palette' },
  { id: 'team', label: 'Team', icon: 'list-checks' },
];

function renderTabs() {
  $('[data-tabs]').replaceChildren(...TABS.map((t) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(S.tab === t.id), 'data-tab': t.id, onclick: () => { S.tab = t.id; renderSide(); }, html: `${icon(t.icon)}<span>${t.label}</span>`,
  })));
}

// Not while someone types in the panel: it is drawn again when they leave it.
let sideDirty = false;
function typingInSide() {
  const a = document.activeElement;
  return !!a && el.side.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}
el.side.addEventListener('focusout', (e) => {
  if (sideDirty && !el.side.contains(e.relatedTarget)) setTimeout(() => { if (!typingInSide()) renderSide(true); }, 0);
});

function renderSide(force = false) {
  renderTabs();
  if (!S.state) return;
  if (!force && typingInSide()) { sideDirty = true; return; }
  sideDirty = false;
  const body = { insert: insertTab, format: formatTab, alternatives: alternativesTab, theme: themeTab, team: teamTab }[S.tab]();
  el.side.replaceChildren(...[body].flat().filter(Boolean));
}

const group = (title, ...children) => h('section', { class: 'group' }, title ? h('div', { class: 'group-title' }, title) : null, ...children);
const field = (label, ...children) => h('div', { class: 'field' }, label ? h('span', { class: 'label' }, label) : null, ...children);

function input(value, onChange, attrs = {}) {
  const node = h('input', { type: 'text', value: value || '', ...attrs });
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

function selectBox(options, value, onChange, blank = '') {
  const node = h('select', { onchange: (e) => onChange(e.target.value) }, blank ? h('option', { value: '' }, blank) : null, options.map((o) => (Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : h('option', { value: o }, o))));
  node.value = value || '';
  return node;
}

function chips(options, active, onPick, tips = {}) {
  return h('div', { class: 'chips' }, options.map((o) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(active.includes(o)), 'data-tip': tips[o] || '', onclick: () => onPick(o, !active.includes(o)),
  }, o)));
}

// --- Insert -----------------------------------------------------------------------------------

function componentItem(id) {
  const name = String(id).replace(/^component:/, '');
  if (!String(id).startsWith('component:') || !(S.state.components || []).includes(name)) return null;
  return { id, name, icon: 'square-stack', about: `components/${name}.js`, text: `::: component ${name}\n:::` };
}

function insertTab() {
  const groups = [...LIBRARY];
  const own = (S.state.components || []).map((c) => componentItem(`component:${c}`)).filter(Boolean);
  if (own.length) groups.push({ group: 'Your components', items: own });
  const libItem = (item) => {
    const node = h('button', {
      type: 'button', class: `lib-item${item.audience ? ' audience' : ''}`, draggable: 'true', 'data-item': item.id,
      onclick: () => insertItem(item, null),
      'data-tip': item.about,
    }, h('span', { class: 'ic', html: icon(item.icon) }), h('span', {}, h('b', {}, item.name)));
    node.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData(BLOCK_TYPE, item.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    return node;
  };
  return [
    group(null, h('p', { class: 'hint' }, 'Click to add to this slide, or drag onto the slide or between slides in the list.')),
    ...groups.map((g) => group(g.group, h('div', { class: 'lib' }, g.items.map(libItem)))),
    group('A whole new slide', h('button', { type: 'button', class: 'outline', onclick: openAdd, html: `${icon('layout-template')}<span>Start from a slide template</span>` })),
  ];
}

async function newSlideWith(item, at) {
  if (item.picture) { pickPicture(); return; }
  const text = item.audience ? item.text : `## New slide\n\n${item.text}`;
  const after = at > 0 ? slides()[at - 1] : null;
  const ok = await run({ op: 'insert-slide', after: after ? after.id : null, text });
  if (ok) selectSlide(at);
}

async function insertItem(item, place) {
  if (item.picture) { pickPicture(place); return; }
  const slide = current();
  if (!slide) { newSlideWith(item, 0); return; }
  // One slide asks the audience one thing: another one gets its own slide.
  if (item.audience && slide.asks) {
    toast('This slide already asks the audience something, so the new question got its own slide.');
    newSlideWith(item, S.index + 1);
    return;
  }
  let text = item.text;
  if (isCanvasSlide() && place && Number.isFinite(place.x)) text = placeOnCanvas(text, place.x, place.y);
  let after = null;
  if (place && place.anchor) after = place.where === 'before' ? place.anchor[0] - 1 : place.anchor[1];
  if (after !== null && after < slide.lines[0]) after = null;
  await run({ op: 'insert-lines', slide: slide.id, after, text }, { message: `Added ${item.name.toLowerCase()}.` });
  S.tab = 'format';
  renderSide();
}

// --- Edit -----------------------------------------------------------------------------------

const CLASS_GROUPS = {
  heading: ['center', 'left', 'right', 'accent', 'secondary', 'muted', 'huge', 'big', 'small', 'hand', 'upper', 'outline', 'gradient'],
  paragraph: ['center', 'left', 'right', 'accent', 'secondary', 'muted', 'huge', 'big', 'small', 'hand', 'card', 'shadow', 'glow'],
  image: ['left', 'right', 'center', 'cover', 'contain', 'round', 'bleed', 'shadow'],
  block: ['steps', 'vertical', 'card', 'shadow', 'glow', 'center', 'wide', 'plain'],
  column: ['card', 'shadow', 'glow', 'center', 'accent', 'muted'],
  list: ['steps', 'center', 'muted', 'big', 'small'],
  code: ['big', 'small', 'wide'],
  table: ['wide', 'small', 'big'],
  quote: ['center', 'big', 'muted'],
};

function formatTab() {
  const sel = S.selected;
  const out = [];
  if (sel) out.push(...elementGroups(sel));
  else out.push(group(null, h('div', { class: 'empty', html: `${icon('move')}<div>Click something on the slide to edit it.<br>Double click to type. Drag to move it.</div>` })));
  out.push(...slideGroups());
  return out;
}

function elementGroups(sel) {
  const slide = current();
  const range = sel.range;
  const crumbs = h('div', { class: 'crumbs' }, sel.chain.map((c, k) => [
    k ? ic('chevron-right') : null,
    h('button', { type: 'button', 'aria-current': String(k === sel.chain.length - 1), onclick: () => { S.selected = named(S.canvas.select(c.range, c.nth)); renderSide(); placeFloat(); } }, c.label),
  ]));
  const groups = [group(null, crumbs, h('div', { class: 'row' },
    btn('outline sm', [ic('pencil'), 'Edit text'], () => editSelected(sel)),
    btn('outline sm', [ic('sparkles'), 'Ask agent'], () => askAgent('edit')),
    btn('ghost sm danger', [ic('trash-2'), 'Delete'], deleteSelected)))];

  // A form for the block, when Quorum knows it.
  const top = sel.chain[0];
  const blockText = top ? sourceOf(top.range) : '';
  const block = readBlock(blockText);
  const editor = block ? editorFor(block.name, block, S.state.schema.components) : null;
  if (editor) groups.push(blockEditor(editor, block, top.range, slide));

  if (sel.kind === 'image') {
    groups.push(group('Picture', field('Description, for people who cannot see it', input(sel.alt, (v) => run({ op: 'set-alt', slide: slide.id, line: range[0], alt: v }, { select: range }), { placeholder: 'What the picture shows' }))));
  }
  if (sel.kind !== 'item') {
    const names = [...new Set([...(CLASS_GROUPS[sel.kind] || CLASS_GROUPS.block), ...sel.classes])];
    groups.push(group('Style', chips(names, sel.classes, (name, on) => run({
      op: 'set-attrs', slide: slide.id, range, add: on ? [name] : [], remove: on ? [] : [name],
    }, { select: range }), S.state.schema.classes)));
  }
  if (isCanvasSlide() && sel.topLevel) {
    const b = sel.box;
    const num = (key) => {
      const node = h('input', { type: 'number', step: '0.5', value: String(Math.round(b[key] * 10) / 10) });
      node.addEventListener('change', () => run({
        op: 'set-attrs', slide: slide.id, range, kv: { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.w * 10) / 10, [key]: node.value },
      }, { select: range }));
      return h('label', {}, key, node);
    };
    groups.push(group('Position', h('div', { class: 'grid4' }, ['x', 'y', 'w', 'h'].map(num)), h('p', { class: 'hint', style: 'margin-top:8px' }, 'Shares of the slide, 0 to 100. Drag on the slide; hold Alt to stop snapping.')));
  }
  return groups;
}

// --- forms for blocks -----------------------------------------------------------------------------

function listEditor(rows, render, onChange, addLabel, blank) {
  const box = h('div', { class: 'items' });
  let dragFrom = null;
  const paint = () => {
    box.replaceChildren(...rows.map((row, k) => {
      const line = h('div', { class: `item${render.two ? ' two' : ''}`, draggable: 'true' },
        h('span', { class: 'grip', html: icon('grip-vertical') }), ...render(row, k, () => onChange(rows)),
        h('button', { type: 'button', class: 'x', 'data-tip': 'Remove', html: icon('x'), onclick: () => { rows.splice(k, 1); paint(); onChange(rows); } }));
      line.addEventListener('dragstart', (e) => { dragFrom = k; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'row'); });
      line.addEventListener('dragover', (e) => { if (dragFrom !== null) { e.preventDefault(); line.classList.add('over'); } });
      line.addEventListener('dragleave', () => line.classList.remove('over'));
      line.addEventListener('drop', (e) => {
        e.preventDefault();
        line.classList.remove('over');
        if (dragFrom === null || dragFrom === k) return;
        const [moved] = rows.splice(dragFrom, 1);
        rows.splice(k, 0, moved);
        dragFrom = null;
        paint();
        onChange(rows);
      });
      return line;
    }), btn('add', [ic('plus'), addLabel], () => { rows.push(blank()); paint(); setTimeout(() => { const ins = all('input', box); if (ins.length) ins[ins.length - (render.two ? 2 : 1)].focus(); }); }));
  };
  paint();
  return box;
}

function textIn(value, onInput, attrs = {}) {
  const node = h('input', { type: 'text', value: value || '', ...attrs });
  node.addEventListener('input', () => onInput(node.value));
  node.addEventListener('change', () => onInput(node.value, true));
  return node;
}

function blockEditor(editor, block, start, slide) {
  const model = editor.read(block, S.state.schema.components);
  // The block's lines move as it grows or shrinks: keep track.
  let range = [...start];
  let timer = null;
  const save = (now = false) => {
    clearTimeout(timer);
    const go = () => {
      const text = editor.write(block, model);
      if (text.trim() === sourceOf(range).trim()) return;
      const from = range[0];
      const to = range[1];
      range = [from, from + text.split('\n').length - 1];
      run({ op: 'replace-lines', slide: slide.id, from, to, text }, { select: range, side: false });
    };
    if (now) go(); else timer = setTimeout(go, 900);
  };
  const changed = (_, final) => save(!!final);
  const nodes = [];

  if (editor === EDITORS.poll) {
    nodes.push(field('Question', textIn(model.question, (v, f) => { model.question = v; changed(v, f); })));
    const optRender = (row) => [
      textIn(row.text, (v, f) => { row.text = v; changed(v, f); }, { placeholder: 'An option' }),
      h('button', { type: 'button', class: 'right', 'aria-pressed': String(!!row.right), 'data-tip': 'The right answer (hidden until you reveal it)', html: icon('check'), onclick: (e) => { row.right = !row.right; e.currentTarget.setAttribute('aria-pressed', String(row.right)); save(true); } }),
    ];
    nodes.push(field('Options', listEditor(model.options, optRender, () => save(true), 'Add an option', () => ({ text: '', right: false }))));
    const looks = S.state.schema.resultStyles[block.name === 'multi' ? 'multi' : 'poll'] || S.state.schema.resultStyles.poll || [];
    nodes.push(field('Results drawn as', selectBox(looks, model.chart, (v) => { model.chart = v; save(true); }, 'The theme default')));
    if (model.options.some((o) => o.right)) {
      nodes.push(field('How the answer appears', selectBox(['highlight', 'flip', 'spotlight'], model.reveal, (v) => { model.reveal = v; save(true); }, 'The theme default')));
      const ex = h('textarea', { placeholder: 'Shown with the answer' }, model.explanation);
      ex.addEventListener('input', () => { model.explanation = ex.value; save(); });
      nodes.push(field('Explanation', ex));
    }
  } else if (editor === EDITORS.estimate) {
    nodes.push(field('Question', textIn(model.question, (v, f) => { model.question = v; changed(v, f); })));
    const num = (key, label) => h('label', {}, label, textIn(model[key], (v, f) => { model[key] = v; changed(v, f); }));
    nodes.push(h('div', { class: 'grid4', style: 'grid-template-columns:repeat(3,1fr);margin-bottom:12px' }, num('answer', 'Answer'), num('min', 'Lowest'), num('max', 'Highest')));
    nodes.push(field('Unit', textIn(model.unit, (v, f) => { model.unit = v; changed(v, f); }, { placeholder: 'litres, km, people...' })));
    nodes.push(field('Scale', selectBox([['log', 'Logarithmic, for guesses far apart']], model.scale, (v) => { model.scale = v; save(true); }, 'Even')));
    const ex = h('textarea', { placeholder: 'Shown with the answer' }, model.explanation || '');
    ex.addEventListener('input', () => { model.explanation = ex.value; save(); });
    nodes.push(field('Explanation', ex));
  } else if (editor === EDITORS.questions) {
    nodes.push(field('Title', textIn(model.question, (v, f) => { model.question = v; changed(v, f); })));
  } else if (editor === EDITORS.chart) {
    nodes.push(field('Chart', h('div', { class: 'seg' }, S.state.schema.chartTypes.map((t) => h('button', { type: 'button', 'aria-pressed': String(model.type === t), onclick: () => { model.type = t; save(true); } }, t)))));
    const rowRender = (row) => [
      textIn(row.label, (v, f) => { row.label = v; changed(v, f); }, { placeholder: 'Label' }),
      textIn(row.value, (v, f) => { row.value = v; changed(v, f); }, { placeholder: '0', inputmode: 'decimal' }),
    ];
    rowRender.two = true;
    nodes.push(field('Data', listEditor(model.rows, rowRender, () => save(true), 'Add a row', () => ({ label: '', value: '' }))));
    nodes.push(h('div', { class: 'grid4', style: 'grid-template-columns:1fr 2fr' },
      h('label', {}, 'Unit', textIn(model.unit, (v, f) => { model.unit = v; changed(v, f); }, { placeholder: 'min' })),
      h('label', {}, 'Title under it', textIn(model.title, (v, f) => { model.title = v; changed(v, f); }))));
  } else if (editor === EDITORS.items) {
    const label = { kpis: ['Figure', 'What it means'], timeline: ['When', 'What happened'], steps: ['Step', 'What happens'] }[block.name] || ['Label', 'Text'];
    const rowRender = (row) => [
      textIn(row.label, (v, f) => { row.label = v; changed(v, f); }, { placeholder: label[0] }),
      textIn(row.detail, (v, f) => { row.detail = v; changed(v, f); }, { placeholder: label[1] }),
    ];
    rowRender.two = true;
    nodes.push(field('Items', listEditor(model.items, rowRender, () => save(true), 'Add an item', () => ({ label: '', detail: '' }))));
    nodes.push(h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: model.steps, onchange: (e) => { model.steps = e.target.checked; save(true); } }), 'Show one item per click'));
  } else if (editor === EDITORS.component) {
    const spec = S.state.schema.components[model.name].params;
    const labels = { seconds: 'Seconds', url: 'Link, or a file in the talk folder', label: 'Caption', title: 'Title for screen readers' };
    Object.keys(model.values).forEach((key) => {
      nodes.push(field(model.name === 'qr' && key === 'url' ? 'Link' : (labels[key] || key), textIn(model.values[key], (v, f) => { model.values[key] = v; changed(v, f); }, { placeholder: spec[key] })));
    });
  } else if (editor === EDITORS.cards) {
    const cardRender = (row) => [h('div', { class: 'card-edit' },
      h('div', { class: 'row nowrap' }, textIn(row.title, (v, f) => { row.title = v; changed(v, f); }, { placeholder: 'Title' }), textIn(row.icon, (v, f) => { row.icon = v; changed(v, f); }, { placeholder: 'icon', style: 'width:90px', 'data-tip': '`quorum schema --icons` lists the names' })),
      (() => { const t = h('textarea', { placeholder: 'Text', style: 'min-height:48px' }, row.text); t.addEventListener('input', () => { row.text = t.value; save(); }); return t; })())];
    nodes.push(field(block.name === 'compare' ? 'Sides' : 'Cards', listEditor(model.cards, cardRender, () => save(true), block.name === 'compare' ? 'Add a side' : 'Add a card', () => ({ title: '', icon: '', text: '', level: 3, extra: '' }))));
    if (block.name === 'cards') nodes.push(h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: model.steps, onchange: (e) => { model.steps = e.target.checked; save(true); } }), 'Show one card per click'));
  }
  return group(h('span', {}, editor === EDITORS.items ? { kpis: 'Key figures', timeline: 'Timeline', steps: 'Steps' }[block.name] : (block.name === 'multi' ? 'Several answers' : (block.name === 'compare' ? 'Compare' : (editor === EDITORS.component ? COMPONENT_LABELS[model.name] : editor.label))), ' ', h('span', { class: 'muted' }, 'saved as you type')), ...nodes);
}

// --- the slide's own settings ----------------------------------------------------------------------

const LAYOUT_PICS = {
  none: [[10, 18, 60, 10], [10, 34, 80, 6], [10, 46, 70, 6]],
  center: [[25, 30, 50, 12], [20, 50, 60, 6]],
  canvas: [[8, 10, 40, 14], [55, 40, 37, 40], [10, 60, 30, 10]],
  title: [[10, 30, 70, 16], [10, 54, 40, 6]],
  section: [[0, 0, 100, 100]],
  split: [[0, 0, 48, 100], [56, 30, 36, 10], [56, 48, 30, 6]],
  full: [[0, 0, 100, 100]],
  statement: [[10, 34, 80, 26]],
  quote: [[12, 30, 76, 18], [12, 56, 30, 6]],
  grid: [[8, 14, 26, 32], [37, 14, 26, 32], [66, 14, 26, 32], [8, 54, 26, 32], [37, 54, 26, 32], [66, 54, 26, 32]],
  'big-number': [[20, 18, 60, 44], [30, 70, 40, 6]],
  compare: [[8, 20, 38, 60], [54, 20, 38, 60]],
  agenda: [[10, 14, 30, 8], [10, 32, 60, 6], [10, 44, 60, 6], [10, 56, 60, 6]],
  closing: [[25, 36, 50, 16], [30, 58, 40, 6]],
};

function slideGroups() {
  const slide = current();
  if (!slide) return [group(null, h('div', { class: 'empty' }, 'This talk has no slides yet.'), btn('primary', 'Add the first slide', openAdd))];
  const set = (key, value) => run({ op: 'set-slide-attr', slide: slide.id, key, value: value || null });
  const layouts = ['none', ...Object.keys(S.state.schema.layouts)];
  const pics = h('div', { class: 'layouts' }, layouts.map((name) => h('button', {
    type: 'button', 'aria-pressed': String((slide.layout || 'none') === name), 'data-tip': name === 'none' ? 'Text that flows from the top' : S.state.schema.layouts[name], onclick: () => set('layout', name === 'none' ? '' : name),
  }, h('span', { class: 'pic', html: (LAYOUT_PICS[name] || LAYOUT_PICS.none).map(([x, y, w, hh]) => `<i style="left:${x}%;top:${y}%;width:${w}%;height:${hh}%;${name === 'section' ? 'background:#7a6cf0' : ''}${name === 'full' ? 'background:#4b505b' : ''}"></i>`).join('') }), name === 'none' ? 'flow' : name)));
  const notes = h('textarea', { rows: 5, placeholder: 'What to say. Only you see it, in the presenter view.' }, slide.notes || '');
  notes.addEventListener('change', () => run({ op: 'set-notes', slide: slide.id, text: notes.value }));
  const bg = slide.background;
  const bgText = bg ? (bg.gradient || `${bg.image || bg.color || ''}${bg.dim && bg.image ? ', dim' : ''}`) : '';
  return [
    group(h('span', {}, 'Slide ', h('span', { class: 'muted' }, `${slide.index + 1}`)), field('Layout', pics),
      field('How it comes in', selectBox(S.state.schema.tokens.transition.values, slide.transition, (v) => set('transition', v), 'Same as the talk')),
      field('Background', input(bgText, (v) => set('background', v.trim()), { placeholder: 'A colour, a picture or a gradient' }),
        chips(S.state.schema.tokens.gradient.values.filter((g) => g !== 'none'), bg && bg.gradient ? [bg.gradient] : [], (g, on) => set('background', on ? g : ''))),
      field('Starts a section', input(slide.section ? `${slide.section.name}${slide.section.minutes ? `, ${slide.section.minutes}` : ''}` : '', (v) => set('section', v.trim()), { placeholder: 'Name, minutes' }))),
    group('Speaker notes', notes),
  ];
}

// --- Alternatives -----------------------------------------------------------------------------------

function alternativesTab() {
  const slide = current();
  if (!slide) return group(null, h('div', { class: 'empty' }, 'No slide selected.'));
  if (!S.options || S.options.slide !== slide.id) {
    S.options = { slide: slide.id, loading: true, list: [] };
    api(`options?slide=${encodeURIComponent(slide.id)}`).then((data) => {
      if (S.options && S.options.slide === slide.id) {
        S.options = { slide: slide.id, list: data.options, reason: data.reason };
        if (S.tab === 'alternatives') renderSide();
      }
    }).catch((error) => toast(error.message, { error: true }));
  }
  const opts = S.options;
  const card = (o) => {
    const frame = h('iframe', { tabindex: '-1', title: o.name, loading: 'lazy' });
    frame.src = `/present?preview=1&view=still&nosim=1&slide=${slide.index}${o.token ? `&override=${o.token}` : ''}`;
    const thumb = h('div', { class: 'thumb' }, frame);
    requestAnimationFrame(() => { frame.style.transform = `scale(${(thumb.clientWidth || 300) / 1280})`; });
    const fromAgent = o.source === 'variant';
    return h('div', { class: 'alt' }, thumb, h('div', { class: 'alt-foot' },
      h('div', {}, fromAgent ? h('span', { class: 'from', html: `${icon('sparkles')}${o.by || 'your agent'}` }) : null, h('b', {}, o.direction || o.name), h('small', {}, o.name)),
      fromAgent ? h('button', { type: 'button', class: 'ib sm', 'data-tip': 'Dismiss', html: icon('x'), onclick: () => api('variant', { method: 'POST', body: { slide: slide.id, name: o.name } }).then(() => { S.options = null; renderSide(); }) }) : null,
      btn('outline sm', 'Use this', async () => {
        const ok = await run({ op: 'replace-slide', slide: slide.id, text: o.text }, { message: 'Done. Undo brings the old slide back.' });
        if (ok && fromAgent) api('variant', { method: 'POST', body: { slide: slide.id, name: o.name } }).catch(() => {});
      })));
  };
  const list = (opts.list || []).slice(1);
  const agents = list.filter((o) => o.source === 'variant');
  const ours = list.filter((o) => o.source !== 'variant');
  const wish = h('textarea', { placeholder: 'What you want, for example: more visual, a chart, fewer words. Leave it empty for three different directions.' });
  return [
    group(h('span', { html: `${icon('sparkles')}<span>From your agent</span>` }),
      h('p', { class: 'hint', style: 'margin-bottom:10px' }, 'Studio saves the request in this folder; your agent (Claude Code, Codex, Cursor, or one in the cloud) writes the alternatives, and they appear here.'),
      wish,
      h('div', { class: 'row', style: 'margin-top:8px' }, btn('primary sm', [ic('sparkles'), 'Ask your agent'], () => askAgent('alternatives', wish.value))),
      S.asked && S.asked.slide === slide.id && !agents.length ? h('div', { class: 'waiting', style: 'margin-top:12px', html: `${icon('loader-circle', 'i spin')}<span>Waiting for your agent. Its alternatives show up here.</span>` }) : null,
      agents.length ? h('div', { class: 'alts', style: 'margin-top:12px' }, agents.map(card)) : null),
    group(h('span', {}, 'Other layouts ', h('span', { class: 'muted' }, 'by Quorum, instant')),
      opts.loading ? h('div', { class: 'waiting', html: `${icon('loader-circle', 'i spin')}<span>Drawing them</span>` })
        : (ours.length ? h('div', { class: 'alts' }, ours.map(card)) : h('p', { class: 'hint' }, opts.reason || 'Quorum has no other layout for this slide.'))),
  ];
}

// "Ask your agent": the request goes to the clipboard and is shown.
async function askAgent(kind, wish = '') {
  const slide = current();
  if (!slide) return;
  let text = wish;
  if (kind === 'edit' && !wish) {
    const area = h('textarea', { placeholder: 'What should change? For example: make this a chart, shorter, add a picture, turn it into a quiz.' });
    openModal('Ask your agent', h('div', {},
      h('p', {}, S.selected ? `About the ${S.selected.label.toLowerCase()} you selected on "${slide.title}".` : `About the slide "${slide.title}".`),
      area,
      h('div', { class: 'actions' }, btn('ghost', 'Cancel', closeModal), btn('primary', [ic('clipboard-copy'), 'Save the request'], async () => { text = area.value; await showRequest(kind, text); }))));
    setTimeout(() => area.focus(), 50);
    return;
  }
  await showRequest(kind, text);
}

async function showRequest(kind, text) {
  const slide = current();
  const data = await api('agent', { method: 'POST', body: { kind, slide: slide.id, range: kind === 'edit' && S.selected ? S.selected.range : null, text } });
  const copy = (value) => navigator.clipboard.writeText(value).then(() => toast('Copied.')).catch(() => toast('Select the text and copy it.'));
  S.asked = { slide: slide.id, at: Date.now() };
  await refresh({ side: false });
  openModal('Request saved', h('div', {},
    h('p', {}, `Saved as ${data.file}. An agent working in this folder finds it with \`quorum requests\`; for an agent in the cloud, send it from the Team tab first. Tell your agent once:`),
    h('pre', { class: 'prompt' }, data.instruction),
    h('div', { class: 'actions' }, btn('primary', [ic('clipboard-copy'), 'Copy the instruction'], () => copy(data.instruction))),
    h('p', { class: 'hint', style: 'margin-top:14px' }, 'An agent that cannot see this folder needs the full request instead:'),
    h('div', { class: 'actions' }, btn('ghost', [ic('copy'), 'Copy the full request'], () => copy(data.prompt)), btn('ghost', 'Done', closeModal))));
  try {
    await navigator.clipboard.writeText(data.instruction);
  } catch { /* the page may not be allowed to write to the clipboard */ }
  S.tab = kind === 'alternatives' ? 'alternatives' : S.tab;
  renderSide();
}

// --- Team: the queue for your agent, and sync with others ------------------------------------------------

const ago = (iso) => {
  const t = Date.parse(iso);
  if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

async function loadSync() {
  try {
    S.sync = await api('sync');
    renderRail(false);
    if (S.tab === 'team') renderSide();
  } catch { /* Studio is not reachable right now; the next try will do */ }
}

async function syncDo(action, extra = {}, doing = 'Working') {
  say(`${doing}...`);
  try {
    S.sync = await api('sync', { method: 'POST', body: { action, ...extra } });
    say(action === 'pull' ? 'Pulled' : (action === 'send' ? 'Sent' : 'Checked'));
    if (action === 'pull') await refresh({});
    else renderSide();
    renderRail(false);
  } catch (error) {
    say('Sync did not work', 'error');
    toast(error.message, { error: true });
    loadSync();
  }
}

function teamTab() {
  const state = S.state;
  const list = state.requests || [];
  const open = list.filter((r) => r.status !== 'done');
  const finished = list.filter((r) => r.status === 'done').reverse().slice(0, 5);
  const title = (id) => { const x = slides().find((sl) => sl.id === id); return x ? x.title : `${id} (gone)`; };
  const copy = (value) => navigator.clipboard.writeText(value).then(() => toast('Copied.')).catch(() => toast('Select the text and copy it.'));
  const row = (r) => h('div', { class: `req ${r.status}` },
    h('div', { class: 'req-top' },
      h('span', { class: `pill ${r.status}` }, r.status === 'claimed' ? `working: ${r.claimedBy}` : r.status),
      h('b', { onclick: () => { const i = slides().findIndex((x) => x.id === r.slide); if (i >= 0) selectSlide(i); } }, title(r.slide)),
      r.status === 'done' ? null : h('button', { type: 'button', class: 'ib sm', 'data-tip': 'Copy the full request', html: icon('copy'), onclick: () => api('requests', { method: 'POST', body: { action: 'prompt', id: r.id } }).then((d) => copy(d.prompt)).catch((e) => toast(e.message, { error: true })) }),
      r.status === 'claimed' ? h('button', { type: 'button', class: 'ib sm', 'data-tip': 'Put it back in the queue', html: icon('undo-2'), onclick: () => api('requests', { method: 'POST', body: { action: 'release', id: r.id } }).then(() => refresh({ side: false }).then(renderSide)) }) : null,
      r.status === 'done' ? null : h('button', { type: 'button', class: 'ib sm', 'data-tip': 'Cancel this request', html: icon('x'), onclick: () => api('requests', { method: 'POST', body: { action: 'cancel', id: r.id } }).then(() => refresh({ side: false }).then(renderSide)) })),
    h('p', {}, r.kind === 'alternatives' ? `Alternatives${r.wish ? `: ${r.wish}` : ''}` : (r.wish || 'Improve it.')),
    h('small', {}, r.status === 'done' ? `${r.doneBy ? `${r.doneBy}: ` : ''}${r.note || 'done'} (${ago(r.doneAt)})` : `${r.id}, asked ${ago(r.at)}`));
  const requests = group(h('span', { html: `${icon('sparkles')}<span>Requests for your agent</span>` }),
    h('p', { class: 'hint' }, 'Ask agent saves a request here. Your agent finds the queue with `quorum requests` and closes each one when it is done.'),
    open.length ? h('div', { class: 'row', style: 'margin-top:8px' }, btn('primary sm', [ic('clipboard-copy'), 'Copy the instruction'], () => copy(state.instruction))) : null,
    list.length ? h('div', { class: 'reqs' }, [...open, ...finished].map(row)) : h('p', { class: 'hint', style: 'margin-top:10px' }, 'No requests yet. Select a slide and press Ask agent.'));

  const y = S.sync;
  const sync = [group(h('span', { html: `${icon('git-branch')}<span>Sync with others</span>` }))];
  if (!y) sync[0].append(h('p', { class: 'hint' }, 'Looking...'));
  else if (!y.git) sync[0].append(h('p', { class: 'hint' }, 'This folder is not a git repository, so there is nothing to sync. `quorum repo` sets one up so several people and agents can work on the same talk.'));
  else {
    const box = h('div', { class: 'syncbox' },
      h('div', {}, `Branch ${y.branch}${y.upstream ? ` (follows ${y.upstream})` : ': not on a remote yet'}`),
      y.changed.length ? h('div', {}, `${y.changed.length} file${y.changed.length === 1 ? '' : 's'} changed here, not yet sent.`) : null,
      y.ahead ? h('div', {}, `${y.ahead} saved change${y.ahead === 1 ? '' : 's'} not pushed yet.`) : null,
      y.behind ? h('div', {}, `${y.behind} new change${y.behind === 1 ? '' : 's'} from others.`) : (y.upstream ? h('div', {}, 'You have everything others pushed (as of the last check).') : null),
      y.incoming && y.incoming.length ? h('ul', { class: 'incoming' }, y.incoming.map((x) => h('li', {}, `${x.title} (${x.what}${x.reasons.length ? `: ${x.reasons.join(', ')}` : ''})`))) : null,
      y.merging ? h('div', {}, 'A merge is waiting to be finished in a terminal.') : null,
      h('div', { class: 'row' },
        btn('outline sm', [ic('download'), 'Pull'], () => syncDo('pull', {}, 'Pulling'), { disabled: !y.behind || y.merging }),
        btn('outline sm', 'Send', () => {
          const msg = h('input', { type: 'text', placeholder: 'A few words about what you changed', value: '' });
          openModal('Send your changes', h('div', {},
            h('p', {}, `Commits the talk's files (not .quorum/) and pushes branch ${y.branch}.`),
            msg,
            h('div', { class: 'actions' }, btn('ghost', 'Cancel', closeModal), btn('primary', 'Send', () => { closeModal(); syncDo('send', { message: msg.value }, 'Sending'); }))));
          setTimeout(() => msg.focus(), 50);
        }, { disabled: (!y.changed.length && !y.ahead && y.upstream) || y.behind > 0 || y.merging }),
        btn('ghost sm', 'Check now', () => syncDo('fetch', {}, 'Checking'), { disabled: !y.upstream })),
      y.behind > 0 && y.ahead + y.changed.length > 0 ? h('div', { class: 'hint' }, 'Pull before you send: others pushed first.') : null);
    sync[0].append(box);
  }
  return [requests, ...sync];
}

// --- Theme ---------------------------------------------------------------------------------------------

function themeTab() {
  const state = S.state;
  const front = state.front || {};
  const preset = state.meta.preset;
  const setFront = (key, value) => run({ op: 'set-front', key, value: value || null });
  const presets = h('div', { class: 'presets' }, Object.entries(state.schema.presets).map(([name, p]) => h('button', {
    type: 'button', class: 'preset', 'aria-pressed': String(name === preset), 'data-tip': p.about, onclick: () => setFront('theme', name),
  }, h('span', { class: 'sw', html: (p.palette || [p.accent]).slice(0, 5).map((c) => `<i style="background:${c}"></i>`).join('') }), h('span', {}, name))));
  const defaults = (state.schema.presets[preset] || {}).tokens || {};
  const tokens = Object.entries(state.schema.tokens).filter(([k]) => k !== 'mode').map(([key, def]) => field(`${key[0].toUpperCase()}${key.slice(1)}`, selectBox(def.values, front[key], (v) => setFront(key, v), `Theme default (${defaults[key] || '-'})`)));
  const colours = ['accent', 'primary', 'secondary', 'background', 'text'].map((key) => {
    const value = /^#[0-9a-f]{6}$/i.test(front[key] || '') ? front[key] : ((state.schema.presets[preset] || {}).accent || '#888888');
    const picker = h('input', { type: 'color', value });
    picker.addEventListener('change', () => setFront(key, picker.value));
    return h('div', { class: 'row nowrap', style: 'margin-bottom:6px' }, picker, h('span', { class: 'grow' }, key), front[key] ? btn('ghost sm', 'Reset', () => setFront(key, '')) : h('span', { class: 'muted' }, 'theme'));
  });
  return [
    front.theme && /\.ya?ml$/i.test(front.theme) ? group(null, h('p', { class: 'hint' }, `This talk uses the theme file ${front.theme}. Choosing a theme here replaces it.`)) : null,
    group('Theme', presets, h('div', { style: 'margin-top:10px' }, field('Light or dark', h('div', { class: 'seg' }, [['', 'As the theme'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String((front.mode || '') === v), onclick: () => setFront('mode', v) }, l)))))),
    group('Your colours', ...colours),
    group('Type, shapes and motion', ...tokens),
    group('Footer', input(front.footer, (v) => setFront('footer', v.trim()), { placeholder: '{title} | {n} / {total}' }), h('p', { class: 'hint', style: 'margin-top:8px' }, 'Each change here is a line at the top of talk.md. Fonts and the logo are set there too.')),
  ];
}

// --- editing text -----------------------------------------------------------------------------------------

function editSelected(info) {
  if (!info) return;
  const source = sourceOf(info.range);
  // Plain headings and paragraphs are typed into on the slide.
  if ((info.kind === 'heading' || info.kind === 'paragraph') && inlineEditable(source) && S.canvas.editInline((html) => {
    placeFloat();
    if (html === null) return;
    const text = inlineToMarkdown(html, source);
    if (text.trim() && text !== source) run({ op: 'replace-lines', slide: current().id, from: info.range[0], to: info.range[1], text }, { select: [info.range[0], info.range[0]] });
  })) {
    el.float.hidden = true;
    return;
  }
  openEditor(info);
}

function openEditor(info) {
  const rect = S.canvas.rect();
  const frame = el.frame.getBoundingClientRect();
  S.editing = { info, base: sourceOf(info.range) };
  el.editorText.value = S.editing.base;
  el.editor.hidden = false;
  el.float.hidden = true;
  const width = Math.min(480, window.innerWidth - 20);
  let x = frame.left + (rect ? rect.left : 20);
  let y = frame.top + (rect ? rect.bottom + 10 : 20);
  if (y + 240 > window.innerHeight) y = Math.max(60, frame.top + (rect ? rect.top : 20) - 240);
  x = clamp(x, 8, window.innerWidth - width - 8);
  Object.assign(el.editor.style, { left: `${x}px`, top: `${y}px` });
  el.editorText.focus();
}

function closeEditor() {
  el.editor.hidden = true;
  S.editing = null;
}

async function saveEditor() {
  const e = S.editing;
  if (!e) return;
  const text = el.editorText.value.replace(/\n+$/, '');
  closeEditor();
  if (text === e.base) { placeFloat(); return; }
  const slide = current();
  if (sourceOf(e.info.range) !== e.base && !window.confirm('This slide changed on disk while you were editing. Save over it?')) return;
  const [from, to] = e.info.range;
  if (!text.trim()) { await run({ op: 'delete-lines', slide: slide.id, from, to }); return; }
  await run({ op: 'replace-lines', slide: slide.id, from, to, text }, { select: [from, from + text.split('\n').length - 1] });
}

$('[data-editor-save]').addEventListener('click', saveEditor);
$('[data-editor-cancel]').addEventListener('click', () => { closeEditor(); placeFloat(); });
el.editorText.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeEditor(); placeFloat(); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditor(); }
});

async function deleteSelected() {
  const sel = S.selected;
  if (!sel) return;
  S.selected = null;
  el.float.hidden = true;
  const ok = await run({ op: 'delete-lines', slide: current().id, from: sel.range[0], to: sel.range[1] });
  if (ok) toast(`Deleted the ${sel.label.toLowerCase()}.`, { action: { label: 'Undo', run: undo } });
}

async function duplicateSelected() {
  const sel = S.selected;
  if (!sel) return;
  if (sel.kind === 'item') { toast('Duplicate the list or block that holds it.'); return; }
  await run({ op: 'insert-lines', slide: current().id, after: sel.range[1], text: sourceOf(sel.range) });
}

// --- the source drawer ---------------------------------------------------------------------------------------

let sourceTimer = null;
el.sourceText.addEventListener('input', () => {
  clearTimeout(sourceTimer);
  say('Editing', 'busy');
  sourceTimer = setTimeout(async () => {
    const text = el.sourceText.value;
    if (!text.trim()) return;
    S.busy += 1;
    try {
      await api('op', { method: 'POST', body: { op: 'replace-slide', slide: current().id, text } });
      await refresh({});
      say(`Saved to ${current().file}`);
    } catch (error) {
      say(error.message, 'error');
    } finally {
      S.busy -= 1;
    }
  }, 700);
});

function toggleSource() {
  const b = $('[data-act="source"]');
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  el.source.hidden = !on;
  fit();
  if (on) el.sourceText.focus();
}

// --- pictures --------------------------------------------------------------------------------------------------

const toBase64 = (file) => new Promise((done, failed) => {
  const reader = new FileReader();
  reader.onload = () => done(String(reader.result).split(',')[1] || '');
  reader.onerror = () => failed(new Error('Could not read that file.'));
  reader.readAsDataURL(file);
});

function pickPicture(place = null) {
  const chooser = h('input', { type: 'file', accept: 'image/*', multiple: true });
  chooser.addEventListener('change', () => handleDropFiles([...chooser.files], place || {}));
  chooser.click();
}

async function handleDropFiles(files, point) {
  const images = files.filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name));
  if (!images.length) { toast('Only pictures can be added here (png, jpg, gif, webp or svg).', { error: true }); return; }
  if (!current()) { toast('Add a slide first.'); return; }
  S.busy += 1;
  try {
    const ops = [];
    let after = point && point.at && point.at.chain.length ? point.at.chain[0].range[1] : (point && point.anchor ? point.anchor[1] : null);
    for (const file of images) {
      const { path } = await api('upload', { method: 'POST', body: { name: file.name, data: await toBase64(file) } });
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      const x = point && Number.isFinite(point.x) ? point.x : 50;
      const y = point && Number.isFinite(point.y) ? point.y : 50;
      const where = isCanvasSlide() ? `{x=${Math.round(clamp(x - 15, 0, 70))} y=${Math.round(clamp(y - 10, 0, 70))} w=30 h=30}` : '';
      ops.push({ op: 'insert-lines', slide: current().id, after, text: `![${alt}](${path})${where}` });
      after = null;
    }
    await api('op', { method: 'POST', body: { ops } });
    await refresh({});
    say('Picture added');
    toast('Picture added. Describe it in the Edit tab, for people who cannot see it.');
  } catch (error) {
    toast(error.message, { error: true });
  } finally {
    S.busy -= 1;
  }
}

// --- dialogs ------------------------------------------------------------------------------------------------------

function openModal(title, body, { wide = false } = {}) {
  $('[data-modal-title]').textContent = title;
  $('[data-modal-body]').replaceChildren(body);
  $('.dialog', el.modal).classList.toggle('wide', wide);
  el.modal.hidden = false;
}
function closeModal() {
  el.modal.hidden = true;
  $('[data-modal-body]').replaceChildren();
  if (S.exportTimer) { clearTimeout(S.exportTimer); S.exportTimer = null; }
}
$('[data-modal-close]').innerHTML = icon('x');
$('[data-modal-close]').addEventListener('click', closeModal);
el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeModal(); });

function openAdd() {
  const after = current();
  openModal('Add a slide', h('div', { class: 'tmpl' }, TEMPLATES.map((t) => h('button', {
    type: 'button',
    onclick: async () => {
      closeModal();
      const ok = await run({ op: 'insert-slide', after: after ? after.id : null, text: t.text });
      if (ok) selectSlide(after ? S.index + 1 : 0);
    },
  }, h('b', {}, t.name), h('small', {}, t.about)))), { wide: true });
}

function openProblems() {
  const { problems, suggestions } = S.problems;
  const row = (p) => h('div', { class: `problem ${p.level}` }, h('span', { html: icon(p.level === 'warning' ? 'triangle-alert' : 'lightbulb') }), h('span', {}, p.message),
    p.slide ? btn('ghost sm', `Slide ${p.slide}`, () => { closeModal(); selectSlide(p.slide - 1); }) : h('span'));
  openModal(problems.length ? `${problems.length} ${problems.length === 1 ? 'thing' : 'things'} to fix` : 'Checks', h('div', {},
    problems.length ? null : h('p', {}, 'Nothing to fix: every slide checks out.'),
    ...problems.map(row),
    suggestions.length ? h('p', { style: 'margin-top:16px' }, h('b', {}, 'Suggestions'), ' to make it easier to watch') : null,
    ...suggestions.map(row)), { wide: true });
}

// --- export -----------------------------------------------------------------------------------------------------

function openExport() {
  const opt = { format: 'pptx', audience: true, results: false, safeFonts: false };
  const choice = (name, value, title, about, checked) => h('label', { class: 'option' }, h('input', { type: 'radio', name, value, checked, onchange: () => { opt[name] = value; } }), h('span', {}, h('b', {}, title), h('small', {}, about)));
  const check = (key, title, about, disabled = false) => h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: opt[key], disabled, onchange: (e) => { opt[key] = e.target.checked; } }), h('span', {}, h('b', {}, title), h('small', {}, about)));
  const asks = slides().filter((s) => s.asks).length;
  openModal('Export', h('div', {},
    h('div', { class: 'options' },
      choice('format', 'pptx', 'PowerPoint (.pptx)', 'Editable text, shapes, tables and charts, with your notes. Slides where the audience answers become a panel that points to Quorum.', true),
      choice('format', 'pdf', 'PDF', 'One page per slide, exactly as it looks. The text cannot be selected.', false)),
    h('div', { class: 'options', style: 'margin-top:14px' },
      asks ? check('audience', 'Keep the slides where the audience answers', `${asks} ${asks === 1 ? 'slide' : 'slides'}, as a placeholder`) : null,
      check('results', 'With the results of the last session', S.problems.votes ? 'The real votes, as charts: a report of the talk' : 'Give the talk first: there are no votes yet', !S.problems.votes),
      check('safeFonts', 'Fonts every computer has', 'For a file going to people whose computers you do not know (PowerPoint only)')),
    h('div', { class: 'actions' }, btn('ghost', 'Cancel', closeModal), btn('primary', [ic('file-down'), 'Export'], () => startExport(opt)))));
}

async function startExport(opt) {
  try {
    const { job } = await api('export', { method: 'POST', body: opt });
    paintExport(job);
  } catch (error) {
    toast(error.message, { error: true });
  }
}

function paintExport(job) {
  if (!job) return;
  if (job.status === 'running') {
    const pct = job.total ? Math.round((job.slide / job.total) * 100) : 5;
    openModal('Exporting', h('div', {}, h('p', {}, `Drawing slide ${job.slide || 1} of ${job.total || '?'}. Each slide is drawn in a browser, then written as native ${job.format === 'pdf' ? 'pages' : 'PowerPoint shapes'}.`), h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` }))));
    S.exportTimer = setTimeout(async () => { const { job: next } = await api('export'); paintExport(next); }, 700);
    return;
  }
  if (job.status === 'failed') {
    openModal('Export did not work', h('div', {}, h('p', {}, job.error), job.install ? h('pre', { class: 'prompt' }, job.install) : null, job.install ? h('p', { class: 'hint' }, 'Run that once in the talk folder, then export again.') : null, h('div', { class: 'actions' }, btn('primary', 'Close', closeModal))));
    return;
  }
  const notes = [];
  if (job.needsFonts && job.needsFonts.length) notes.push(`It uses ${job.needsFonts.join(', ')}. Computers without these fonts show a substitute: export with "Fonts every computer has" if that matters.`);
  if (job.fallbacks && job.fallbacks.length) notes.push(`${job.fallbacks.length} ${job.fallbacks.length === 1 ? 'part became a picture' : 'parts became pictures'} (they cannot be edited in PowerPoint).`);
  openModal('Exported', h('div', {},
    h('p', {}, h('b', {}, job.file.split(/[\\/]/).pop()), ` with ${job.slides} slides${job.charts ? ` and ${job.charts} editable ${job.charts === 1 ? 'chart' : 'charts'}` : ''}. It is in the export folder of the talk.`),
    ...notes.map((n) => h('p', { class: 'hint' }, n)),
    h('div', { class: 'actions' }, btn('ghost', 'Close', closeModal), btn('primary', [ic('external-link'), 'Open it'], () => api('export', { method: 'POST', body: { action: 'open', file: job.file } }).then(closeModal)))));
}

// --- present and rehearse --------------------------------------------------------------------------------------------

function rehearse() {
  window.open(`/present?preview=1&slide=${S.index}`, '_blank', 'noopener');
}

function openPresent() {
  const asks = slides().filter((s) => s.asks || s.interactive).length;
  if (!asks) { startLive({ tunnel: false }); return; }
  api('live').then((live) => {
    const tunnel = live.tunnels && (live.tunnels.cloudflared || live.tunnels.ngrok);
    let scope = tunnel ? 'public' : 'network';
    const choice = (value, title, about, disabled = false) => h('label', { class: 'option' }, h('input', { type: 'radio', name: 'scope', value, checked: scope === value, disabled, onchange: () => { scope = value; } }), h('span', {}, h('b', {}, title), h('small', {}, about)));
    openModal('Give the talk', h('div', {},
      h('p', {}, `${asks} ${asks === 1 ? 'slide asks' : 'slides ask'} the audience. People join by scanning the QR code on your slides.`),
      h('div', { class: 'options' },
        choice('public', 'A public link', tunnel ? 'Anyone with the link can join, from any network. It stops when you stop.' : `Install cloudflared for this: ${live.install}`, !tunnel),
        choice('network', 'This network only', 'People on the same wifi as this computer can join.')),
      h('p', { class: 'hint', style: 'margin-top:12px' }, 'Two windows open: the presentation, to share or put on the projector, and your panel with the notes, the clock and the questions.'),
      h('div', { class: 'actions' }, btn('ghost', 'Cancel', closeModal), btn('primary', [ic('play'), 'Start'], () => { closeModal(); startLive({ tunnel: scope === 'public' }); }))));
  }).catch((error) => toast(error.message, { error: true }));
}

async function startLive({ tunnel }) {
  try {
    say('Starting the talk', 'busy');
    S.live = await api('live', { method: 'POST', body: { tunnel, open: params.get('nowindows') !== '1' } });
    paintLive();
    pollLive();
  } catch (error) {
    toast(error.message, { error: true });
  }
}

async function stopLive() {
  if (!window.confirm('Stop the talk? Phones can no longer join or vote. The votes are kept.')) return;
  S.live = await api('live', { method: 'POST', body: { action: 'stop' } });
  paintLive();
}

let liveTimer = null;
function pollLive() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    try {
      S.live = await api('live');
      paintLive();
      if (S.live.running) pollLive();
    } catch { pollLive(); }
  }, 2000);
}

function paintLive() {
  const live = S.live;
  const present = $('[data-act="present"]');
  if (!live || !live.running) {
    el.live.hidden = true;
    present.hidden = false;
    say(`Saved to ${current() ? current().file : 'talk.md'}`);
    return;
  }
  present.hidden = true;
  el.live.hidden = false;
  const where = live.phase === 'starting' ? 'Opening a public link' : (live.publicUrl ? live.publicUrl.replace(/^https?:\/\//, '') : 'This computer only');
  el.live.replaceChildren(
    h('span', { class: 'dot' }),
    h('b', {}, 'Live'),
    live.publicUrl ? h('a', { href: live.publicUrl, target: '_blank', rel: 'noopener', 'data-tip': live.scope === 'public' ? 'Anyone with this link can join' : 'People on the same network can join' }, where) : h('span', { class: 'muted' }, where),
    live.interactive && live.connected !== null ? h('span', { class: 'badge', 'data-tip': 'Phones connected' }, String(live.connected)) : null,
    h('button', { type: 'button', class: 'ghost sm', 'data-tip': 'Open the presentation and the panel again', onclick: () => { window.open(live.present, '_blank'); window.open(live.panel, '_blank'); }, html: icon('external-link') }),
    h('button', { type: 'button', class: 'outline sm', onclick: stopLive, html: `${icon('circle-stop')}<span>Stop</span>` }),
  );
  if (live.note && live.note !== S.liveNote) { S.liveNote = live.note; toast(live.note); }
}

// --- the command palette ----------------------------------------------------------------------------------------------

function commands() {
  const list = [
    { label: 'Add a slide', kind: 'slide', run: openAdd },
    { label: 'Present', kind: 'talk', run: openPresent },
    { label: 'Rehearse with a simulated audience', kind: 'talk', run: rehearse },
    { label: 'Export to PowerPoint or PDF', kind: 'talk', run: openExport },
    { label: 'Show problems and suggestions', kind: 'talk', run: openProblems },
    { label: 'Ask your agent about this slide', kind: 'agent', run: () => askAgent('edit') },
    { label: 'Ask your agent for alternatives', kind: 'agent', run: () => { S.tab = 'alternatives'; renderSide(); } },
    { label: 'Show the Markdown', kind: 'view', run: toggleSource },
    { label: 'Undo', kind: 'edit', run: undo },
    { label: 'Redo', kind: 'edit', run: redo },
    { label: 'Duplicate this slide', kind: 'slide', run: () => current() && run({ op: 'duplicate-slide', slide: current().id }).then(() => selectSlide(S.index + 1)) },
    { label: 'Delete this slide', kind: 'slide', run: () => current() && deleteSlide(current()) },
    ...LIBRARY.flatMap((g) => g.items).map((item) => ({ label: `Insert ${item.name.toLowerCase()}`, kind: 'insert', run: () => insertItem(item, null) })),
    ...Object.keys(S.state.schema.presets).map((name) => ({ label: `Theme: ${name}`, kind: 'theme', run: () => run({ op: 'set-front', key: 'theme', value: name }) })),
    ...Object.keys(S.state.schema.layouts).map((name) => ({ label: `Layout: ${name}`, kind: 'layout', run: () => current() && run({ op: 'set-slide-attr', slide: current().id, key: 'layout', value: name }) })),
    ...slides().map((s, i) => ({ label: `${i + 1}. ${s.title}`, kind: 'go to', run: () => selectSlide(i) })),
  ];
  return list;
}

function openPalette() {
  const wrap = $('[data-palette]');
  const box = $('[data-palette-input]');
  const listEl = $('[data-palette-list]');
  let items = [];
  let at = 0;
  const paint = () => {
    const q = box.value.trim().toLowerCase();
    items = commands().filter((c) => !q || q.split(/\s+/).every((w) => `${c.label} ${c.kind}`.toLowerCase().includes(w))).slice(0, 40);
    at = clamp(at, 0, Math.max(0, items.length - 1));
    listEl.replaceChildren(...items.map((c, k) => h('button', { type: 'button', role: 'option', 'aria-selected': String(k === at), onclick: () => choose(k) }, h('span', {}, c.label), h('span', { class: 'kind' }, c.kind))));
    const on = listEl.children[at];
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { wrap.hidden = true; box.onkeydown = null; box.oninput = null; };
  const choose = (k) => { const c = items[k]; close(); if (c) c.run(); };
  box.value = '';
  box.oninput = () => { at = 0; paint(); };
  box.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); at += 1; paint(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); at -= 1; paint(); }
    if (e.key === 'Enter') { e.preventDefault(); choose(at); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  wrap.hidden = false;
  paint();
  box.focus();
}

// --- keys ------------------------------------------------------------------------------------------------------------------

function handleKey(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || (e.target && e.target.isContentEditable);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd' && !typing) { e.preventDefault(); duplicateSelected(); return; }
  if (typing) return;
  if (e.key === 'Escape') {
    if (!el.modal.hidden) closeModal();
    else if (S.canvas) { S.canvas.clear(); S.selected = null; closeEditor(); renderSide(); placeFloat(); updateWhere(); }
    return;
  }
  if ((e.altKey && e.key === 'ArrowDown') || e.key === 'PageDown') { e.preventDefault(); selectSlide(S.index + 1); return; }
  if ((e.altKey && e.key === 'ArrowUp') || e.key === 'PageUp') { e.preventDefault(); selectSlide(S.index - 1); return; }
  const sel = S.selected;
  if (!sel) return;
  if (e.key === 'Enter') { e.preventDefault(); editSelected(sel); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
  if (isCanvasSlide() && sel.topLevel && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    const b = sel.box;
    const kv = { x: Math.round(b.x), y: Math.round(b.y) };
    if (e.key === 'ArrowLeft') kv.x -= step;
    if (e.key === 'ArrowRight') kv.x += step;
    if (e.key === 'ArrowUp') kv.y -= step;
    if (e.key === 'ArrowDown') kv.y += step;
    if (!sel.positioned) kv.w = Math.round(b.w);
    run({ op: 'set-attrs', slide: current().id, range: sel.range, kv }, { select: sel.range });
  }
}
document.addEventListener('keydown', handleKey);

async function undo() {
  try { await api('undo', { method: 'POST' }); await refresh({}); say('Undone'); } catch (error) { toast(error.message); }
}
async function redo() {
  try { await api('redo', { method: 'POST' }); await refresh({}); say('Redone'); } catch (error) { toast(error.message); }
}

// --- tooltips ----------------------------------------------------------------------------------------------------------------

const tipBox = $('[data-tip-box]');
let tipTimer = null;
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  clearTimeout(tipTimer);
  if (!t || !t.dataset.tip) { tipBox.hidden = true; return; }
  tipTimer = setTimeout(() => {
    tipBox.textContent = t.dataset.tip;
    tipBox.hidden = false;
    const r = t.getBoundingClientRect();
    const w = tipBox.offsetWidth;
    tipBox.style.left = `${clamp(r.left + r.width / 2 - w / 2, 6, window.innerWidth - w - 6)}px`;
    tipBox.style.top = `${r.bottom + 8 + tipBox.offsetHeight > window.innerHeight ? r.top - tipBox.offsetHeight - 8 : r.bottom + 8}px`;
  }, 450);
});
document.addEventListener('mousedown', () => { tipBox.hidden = true; clearTimeout(tipTimer); });

// --- the top bar ------------------------------------------------------------------------------------------------------------

function setupBar() {
  setIcon($('[data-act="undo"]'), 'undo-2');
  setIcon($('[data-act="redo"]'), 'redo-2');
  $('[data-act="palette"]').innerHTML = `${icon('command')}<span>Commands</span><span class="kbd">Ctrl K</span>`;
  setIcon($('[data-act="rehearse"]'), 'eye', 'Rehearse');
  setIcon($('[data-act="export"]'), 'file-down', 'Export');
  setIcon($('[data-act="present"]'), 'play', 'Present');
  setIcon($('[data-act="add"]'), 'plus');
  setIcon($('[data-act="source"]'), 'code', 'Markdown');
  setIcon($('[data-act="zoom-in"]'), 'zoom-in');
  setIcon($('[data-act="zoom-out"]'), 'zoom-out');
  paintProblems();
  const acts = {
    undo, redo, palette: openPalette, rehearse, export: openExport, present: openPresent, add: openAdd, problems: openProblems, source: toggleSource,
    'zoom-in': () => zoom(1), 'zoom-out': () => zoom(-1), 'zoom-fit': () => { S.zoom = 0; fit(); },
  };
  Object.entries(acts).forEach(([name, fn]) => $(`[data-act="${name}"]`).addEventListener('click', fn));
}

// --- changes made outside Studio (an editor, an agent, git) -----------------------------------------------------------------

async function watchDisk() {
  for (;;) {
    try {
      const data = await api(`wait?since=${S.revision}`);
      if (data.revision !== S.revision && !S.busy) {
        await refresh({});
        say('Updated from disk');
      }
    } catch {
      await sleep(1500);
    }
  }
}

// --- start ---------------------------------------------------------------------------------------------------------------------

async function start() {
  setupBar();
  renderTabs();
  if (!KEY) { say('Open Studio with `quorum studio`: its address holds a key.', 'error'); return; }
  try {
    await refresh({});
    say(`Saved to ${current() ? current().file : S.state.file}`);
    fit();
    watchDisk();
    setInterval(loadSync, 20000);
    S.live = await api('live');
    paintLive();
    if (S.live.running) pollLive();
  } catch (error) {
    say(error.message, 'error');
  }
}

window.studio = {
  S, run, selectSlide, insertItem, refresh,
};
start();
