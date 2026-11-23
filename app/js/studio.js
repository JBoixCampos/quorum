// Quorum Studio: edit a talk on a canvas. Everything here asks the server
// to change the talk's own files (talk.md, or the slide files of a split
// talk); the slide you see is drawn from those files again after each change.

import { attachCanvas } from './studio-canvas.js';
import { TEMPLATES } from './studio-templates.js';

const params = new URLSearchParams(location.search);
const KEY = params.get('key') || '';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const S = {
  state: null,
  index: 0,
  canvas: null,
  selected: null,
  text: '',
  textLines: [],
  revision: 0,
  busy: 0,
  selectToken: 0,
  tab: 'slide',
  editing: null,
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
  toast: $('[data-toast]'),
  drop: $('[data-drop]'),
};

// --- talking to the server --------------------------------------------------

async function api(path, { method = 'GET', body } = {}) {
  const joiner = path.includes('?') ? '&' : '?';
  const r = await fetch(`/api/studio/${path}${joiner}key=${encodeURIComponent(KEY)}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({ ok: false, error: 'No answer from the server.' }));
  if (!r.ok || data.ok === false) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

function say(text, error = false) {
  el.status.textContent = text;
  el.status.classList.toggle('error', error);
}

let toastTimer = null;
function toast(text) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3500);
}

const slides = () => (S.state ? S.state.slides : []);
const current = () => slides()[S.index];

// Applies operations to the files, then draws everything again.
async function run(ops, { select = null, quiet = false } = {}) {
  S.busy += 1;
  say('Saving');
  // If you pick something else while this is saved, keep what you picked.
  const token = S.selectToken;
  try {
    await api('op', { method: 'POST', body: { ops: Array.isArray(ops) ? ops : [ops] } });
    await refresh({ select: token === S.selectToken ? select : null });
    say(quiet ? 'Saved' : `Saved to ${S.state.file}`);
    return true;
  } catch (error) {
    say('Not saved', true);
    toast(error.message);
    await refresh({}).catch(() => {});
    return false;
  } finally {
    S.busy -= 1;
  }
}

// --- loading --------------------------------------------------------------------

async function refresh({ select = null, thumbs = true } = {}) {
  const data = await api('state');
  S.state = data;
  S.revision = data.revision;
  S.index = clamp(S.index, 0, Math.max(0, data.slides.length - 1));
  el.title.textContent = data.title;
  document.title = `${data.title} · Studio`;
  $('[data-act="undo"]').disabled = !data.canUndo;
  $('[data-act="redo"]').disabled = !data.canRedo;
  const warn = $('[data-act="warnings"]');
  warn.hidden = !data.warnings.length;
  warn.textContent = `${data.warnings.length} ${data.warnings.length === 1 ? 'warning' : 'warnings'}`;
  await loadText();
  renderRail(thumbs);
  await reloadCanvas();
  if (select && S.canvas) S.selected = S.canvas.select(select);
  else if (S.canvas && S.selected) S.selected = S.canvas.info();
  renderInspector();
}

async function loadText() {
  const slide = current();
  if (!slide) { S.text = ''; S.textLines = []; return; }
  const data = await api(`slide?id=${encodeURIComponent(slide.id)}`);
  S.text = data.text;
  S.textLines = data.text.split('\n');
  if (document.activeElement !== el.sourceText) el.sourceText.value = data.text.replace(/\n+$/, '');
  el.sourceNote.textContent = `${data.file}, lines ${data.lines[0]} to ${data.lines[1]}`;
}

// The Markdown of lines a..b of the whole talk, from the slide's own text.
function sourceOf(range) {
  const first = S.textLines.findIndex((l) => l.trim() !== '');
  const start = current().lines[0];
  const a = range[0] - start + Math.max(0, first);
  const b = range[1] - start + Math.max(0, first);
  return S.textLines.slice(a, b + 1).join('\n');
}

// --- the canvas -------------------------------------------------------------------

const canvasUrl = (index) => `/present?preview=1&view=studio&map=1&nosim=1&slide=${index}`;
let frameReady = null;

function frameWindow() {
  return el.frame.contentWindow;
}

async function reloadCanvas() {
  const slide = current();
  if (!slide) return;
  if (!frameReady) {
    frameReady = new Promise((done) => {
      el.frame.addEventListener('load', async () => {
        // The page loads the talk, then draws it: wait for the slide.
        for (let i = 0; i < 100 && !(frameWindow().document.querySelector('[data-slide] [data-src], [data-slide] .q-content')); i += 1) await sleep(50);
        if (S.canvas) S.canvas.detach();
        S.canvas = attachCanvas(el.frame, canvasApi);
        done();
      }, { once: true });
      el.frame.src = canvasUrl(S.index);
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
  const w = el.wrap.clientWidth - 32;
  const h = el.wrap.clientHeight - 32;
  if (w <= 0 || h <= 0) return;
  const width = Math.min(w, (h * 16) / 9);
  el.canvas.style.width = `${Math.floor(width)}px`;
  el.canvas.style.height = `${Math.floor((width * 9) / 16)}px`;
  if (S.canvas) S.canvas.redraw();
}
new ResizeObserver(fit).observe(el.wrap);

const isCanvasSlide = () => !!current() && current().layout === 'canvas';

const canvasApi = {
  isCanvas: isCanvasSlide,
  onSelect(info) {
    S.selectToken += 1;
    S.selected = info;
    closeEditor();
    if (info) setTab('element');
    renderInspector();
  },
  onEdit(info) { openEditor(info); },
  onKey: handleKey,
  onMoveBlock({ from, to, where }) {
    S.selected = null;
    run({ op: 'move-block', slide: current().id, from, to, where }, { quiet: true });
  },
  onPosition({ range, kv }) {
    run({ op: 'set-attrs', slide: current().id, range, kv }, { select: range, quiet: true });
  },
  onDragFiles(on) { el.drop.hidden = !on; },
  onDropFiles: handleDrop,
};

// --- the rail -----------------------------------------------------------------------

const observers = { thumbs: null };
function renderRail(reloadThumbs) {
  const list = slides();
  // One item per slide; thumbnails show "slide n" and are only drawn when seen.
  while (el.rail.children.length > list.length) el.rail.lastElementChild.remove();
  list.forEach((slide, i) => {
    let item = el.rail.children[i];
    if (!item) {
      item = document.createElement('div');
      item.className = 's-slide';
      item.draggable = true;
      item.innerHTML = '<span class="n"></span><div class="s-thumb"><iframe tabindex="-1" title=""></iframe></div><span class="t"></span><div class="tools"><button type="button" data-do="dup" title="Duplicate this slide">Copy</button><button type="button" data-do="del" title="Delete this slide">Delete</button></div>';
      el.rail.appendChild(item);
      wireRailItem(item);
    }
    item.dataset.index = String(i);
    item.setAttribute('aria-current', i === S.index ? 'true' : 'false');
    $('.n', item).textContent = String(i + 1);
    $('.t', item).textContent = slide.title;
    let tag = $('.tag', item);
    if (slide.interactive) {
      if (!tag) { tag = document.createElement('span'); tag.className = 'tag'; item.appendChild(tag); }
      tag.textContent = 'audience';
    } else if (tag) tag.remove();
    const frame = $('iframe', item);
    frame.title = `Slide ${i + 1}: ${slide.title}`;
    frame.dataset.stale = reloadThumbs ? 'yes' : frame.dataset.stale || '';
  });
  watchThumbs();
}

function watchThumbs() {
  if (!observers.thumbs) {
    observers.thumbs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) drawThumb(entry.target); });
    }, { root: el.rail, rootMargin: '200px' });
  }
  $$('.s-thumb', el.rail).forEach((thumb) => {
    const frame = $('iframe', thumb);
    const scale = thumb.clientWidth / 1280;
    if (scale > 0) frame.style.transform = `scale(${scale})`;
    observers.thumbs.unobserve(thumb);
    observers.thumbs.observe(thumb);
  });
}

function drawThumb(thumb) {
  const frame = $('iframe', thumb);
  const index = Number(thumb.closest('.s-slide').dataset.index);
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

function wireRailItem(item) {
  item.addEventListener('click', (e) => {
    const action = e.target.closest('[data-do]');
    const i = Number(item.dataset.index);
    if (action) {
      e.stopPropagation();
      const slide = slides()[i];
      if (action.dataset.do === 'dup') run({ op: 'duplicate-slide', slide: slide.id }, { quiet: true }).then(() => selectSlide(i + 1));
      else run({ op: 'delete-slide', slide: slide.id }, { quiet: true });
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
    $$('.s-slide', el.rail).forEach((n) => n.classList.remove('over-before', 'over-after'));
  });
  item.addEventListener('dragover', (e) => {
    if (S.dragIndex === undefined || [...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    const r = item.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    $$('.s-slide', el.rail).forEach((n) => n.classList.remove('over-before', 'over-after'));
    item.classList.add(before ? 'over-before' : 'over-after');
  });
  item.addEventListener('drop', (e) => {
    if (S.dragIndex === undefined) return;
    e.preventDefault();
    const target = Number(item.dataset.index);
    const r = item.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    const from = S.dragIndex;
    S.dragIndex = undefined;
    const insertAt = before ? target : target + 1;
    if (insertAt === from || insertAt === from + 1) return;
    const list = slides().filter((s) => s.index !== from);
    const after = [...list].reverse().find((s) => s.index < insertAt);
    const landing = insertAt > from ? insertAt - 1 : insertAt;
    run({ op: 'move-slide', slide: slides()[from].id, after: after ? after.id : null }, { quiet: true }).then(() => selectSlide(landing));
  });
}

async function selectSlide(i) {
  if (i < 0 || i >= slides().length) return;
  S.index = i;
  S.selected = null;
  closeEditor();
  if (S.canvas) S.canvas.clear();
  await loadText();
  renderRail(false);
  await frameReady;
  const q = frameWindow().quorum;
  if (q) q.show(i);
  await sleep(40);
  if (S.canvas) S.canvas.redraw();
  const item = el.rail.children[i];
  if (item && item.scrollIntoView) item.scrollIntoView({ block: 'nearest' });
  setTab(S.tab === 'element' ? 'slide' : S.tab);
  renderInspector();
}

// --- the inspector ------------------------------------------------------------------------

function setTab(name) {
  S.tab = name;
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
}
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => { setTab(b.dataset.tab); renderInspector(); }));

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  });
  children.flat(Infinity).forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return node;
}

const field = (label, ...body) => h('div', { class: 's-field' }, h('span', { class: 'label' }, label), ...body);

function chips(options, active, onPick, tip = {}) {
  return h('div', { class: 's-row' }, options.map((o) => h('button', {
    type: 'button', class: 's-chip', 'aria-pressed': String(active.includes(o)), title: tip[o] || '', onclick: () => onPick(o, !active.includes(o)),
  }, o)));
}

function select(options, value, onChange, blank = '') {
  const node = h('select', { onchange: (e) => onChange(e.target.value) }, blank ? h('option', { value: '' }, blank) : null, options.map((o) => h('option', { value: o }, o)));
  node.value = value || '';
  return node;
}

function renderInspector() {
  const state = S.state;
  if (!state) return;
  if (S.tab === 'slide') renderSlideTab(state);
  else if (S.tab === 'element') renderElementTab(state);
  else renderTalkTab(state);
}

function setSlide(key, value) {
  return run({ op: 'set-slide-attr', slide: current().id, key, value: value || null }, { quiet: true });
}

function backgroundText(bg) {
  if (!bg) return '';
  if (bg.gradient) return bg.gradient;
  const base = bg.image || bg.color || '';
  return bg.dim && bg.image ? `${base}, dim` : base;
}

function renderSlideTab(state) {
  const panel = $('[data-panel="slide"]');
  const slide = current();
  panel.replaceChildren();
  if (!slide) { panel.append(h('p', { class: 's-empty' }, 'This talk has no slides yet.'), h('button', { type: 'button', class: 'main', onclick: openAdd }, 'Add the first slide')); return; }
  const layouts = Object.keys(state.schema.layouts);
  const notes = h('textarea', { rows: 5, placeholder: 'What to say. Only you see it.' });
  notes.value = slide.notes || '';
  notes.addEventListener('change', () => run({ op: 'set-notes', slide: slide.id, text: notes.value }, { quiet: true }));
  const bg = h('input', { type: 'text', placeholder: 'colour, image or gradient', value: backgroundText(slide.background) });
  bg.addEventListener('change', () => setSlide('background', bg.value.trim()));
  const section = h('input', { type: 'text', placeholder: 'Name, minutes', value: slide.section ? `${slide.section.name}${slide.section.minutes ? `, ${slide.section.minutes}` : ''}` : '' });
  section.addEventListener('change', () => setSlide('section', section.value.trim()));
  const problems = state.warnings.filter((w) => w.startsWith(`Slide ${slide.index + 1}:`) || w.startsWith(`Slide ${slide.index + 1},`));
  nodes(panel,
    field('Layout', chips(['none', ...layouts], [slide.layout || 'none'], (name) => setSlide('layout', name === 'none' ? '' : name), state.schema.layouts)),
    field('How it comes in', select(state.schema.tokens.transition.values, slide.transition, (v) => setSlide('transition', v), 'Same as the talk')),
    field('Background', bg, h('div', { class: 's-row' }, state.schema.tokens.gradient.values.filter((g) => g !== 'none').map((g) => h('button', { type: 'button', class: 's-chip', onclick: () => setSlide('background', g) }, g)))),
    field('Section', section),
    field('Notes', notes),
    h('div', { class: 's-row' },
      h('button', { type: 'button', onclick: () => run({ op: 'duplicate-slide', slide: slide.id }, { quiet: true }).then(() => selectSlide(S.index + 1)) }, 'Duplicate'),
      h('button', { type: 'button', class: 'danger', onclick: () => run({ op: 'delete-slide', slide: slide.id }, { quiet: true }) }, 'Delete')),
    problems.length ? field('To fix', h('ul', { class: 's-hint' }, problems.map((p) => h('li', {}, p.replace(/^Slide \d+[:,]\s*/, ''))))) : null,
  );
}

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

function renderElementTab(state) {
  const panel = $('[data-panel="element"]');
  panel.replaceChildren();
  const sel = S.selected;
  if (!sel) {
    panel.append(h('p', { class: 's-empty' }, 'Click something on the slide to change it. Double click to edit its text. Drag to move it.'));
    return;
  }
  const slide = current();
  const crumbs = h('div', { class: 's-crumbs' }, sel.chain.map((c, k) => [
    k ? h('span', { class: 's-muted' }, '/') : null,
    h('button', { type: 'button', 'aria-pressed': String(k === sel.chain.length - 1), onclick: () => { S.selected = S.canvas.select(c.range, c.nth); renderInspector(); } }, c.label),
  ]));
  const nodes = [crumbs];
  const range = sel.range;
  nodes.push(h('div', { class: 's-row' },
    h('button', { type: 'button', class: 'main', onclick: () => openEditor(sel) }, 'Edit text'),
    h('button', { type: 'button', class: 'danger', onclick: () => deleteSelected() }, 'Delete')));
  if (sel.kind === 'image') {
    const alt = h('input', { type: 'text', value: sel.alt, placeholder: 'Describe the picture for people who cannot see it' });
    alt.addEventListener('change', () => run({ op: 'set-alt', slide: slide.id, line: range[0], alt: alt.value }, { select: range, quiet: true }));
    nodes.push(field('Description of the picture', alt));
  }
  if (sel.kind === 'item') {
    nodes.push(h('p', { class: 's-hint' }, 'A single item: drag it to reorder. To style it, select the list or the block that holds it.'));
  } else {
    const names = [...new Set([...(CLASS_GROUPS[sel.kind] || CLASS_GROUPS.block), ...sel.classes])];
    nodes.push(field('Style', chips(names, sel.classes, (name, on) => run({
      op: 'set-attrs', slide: slide.id, range, add: on ? [name] : [], remove: on ? [] : [name],
    }, { select: range, quiet: true }), state.schema.classes)));
  }
  if (isCanvasSlide() && sel.topLevel) {
    const box = sel.box;
    const num = (key) => {
      const input = h('input', { type: 'number', step: '0.5', value: String(Math.round(box[key] * 10) / 10) });
      input.addEventListener('change', () => run({ op: 'set-attrs', slide: slide.id, range, kv: { x: Math.round(box.x * 10) / 10, y: Math.round(box.y * 10) / 10, w: Math.round(box.w * 10) / 10, ...(key === 'h' ? { h: input.value } : {}), [key]: input.value } }, { select: range, quiet: true }));
      return h('label', { class: 's-field' }, h('span', { class: 'label' }, key), input);
    };
    nodes.push(field('Position and size, as a share of the slide', h('div', { class: 's-grid4' }, ['x', 'y', 'w', 'h'].map(num))));
  } else if (!isCanvasSlide() && sel.topLevel) {
    nodes.push(h('p', { class: 's-hint' }, 'To place this anywhere on the slide, choose the canvas layout in the Slide tab.'));
  }
  if (sel.chain.length > 1) nodes.push(h('p', { class: 's-hint' }, 'Shift and click selects the whole card or group around what you point at.'));
  nodes.push(h('p', { class: 's-hint' }, `Lines ${range[0]} to ${range[1]} of ${S.state.file}.`));
  panel.append(...nodes);
}

function renderTalkTab(state) {
  const panel = $('[data-panel="talk"]');
  panel.replaceChildren();
  const front = state.front || {};
  const preset = state.meta.preset;
  const setFront = (key, value) => run({ op: 'set-front', key, value: value || null }, { quiet: true });
  const presets = h('div', { class: 's-presets' }, Object.entries(state.schema.presets).map(([name, p]) => h('button', {
    type: 'button', class: 's-preset', 'aria-pressed': String(name === preset), title: p.about, onclick: () => setFront('theme', name),
  }, h('span', { class: 'sw' }, (p.palette || [p.accent]).slice(0, 5).map((c) => h('i', { style: `background:${c}` }))), name)));
  nodes(panel,
    front.theme && /\.ya?ml$/i.test(front.theme) ? h('p', { class: 's-hint' }, `This talk uses the theme file ${front.theme}. Choosing a theme here replaces it.`) : null,
    field('Theme', presets),
    field('Light or dark', select(state.schema.tokens.mode.values, front.mode, (v) => setFront('mode', v), 'As the theme')),
  );
  const tokens = Object.entries(state.schema.tokens).filter(([k]) => k !== 'mode');
  const defaults = (state.schema.presets[preset] || {}).tokens || {};
  nodes(panel, ...tokens.map(([key, def]) => field(`${key[0].toUpperCase()}${key.slice(1)}`, select(def.values, front[key], (v) => setFront(key, v), `Theme default (${defaults[key] || '-'})`))));
  const colours = ['accent', 'primary', 'secondary', 'background', 'text'];
  const swatches = colours.map((key) => {
    const input = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(front[key] || '') ? front[key] : (key === 'accent' && state.schema.presets[preset] ? state.schema.presets[preset].accent : '#888888') });
    input.addEventListener('change', () => setFront(key, input.value));
    return h('div', { class: 's-row' }, input, h('span', {}, key), front[key] ? h('button', { type: 'button', class: 's-chip', onclick: () => setFront(key, '') }, 'Use the theme') : h('span', { class: 's-hint' }, 'from the theme'));
  });
  nodes(panel, field('Your colours', ...swatches));
  const footer = h('input', { type: 'text', value: front.footer || '', placeholder: '{title} | {n} / {total}' });
  footer.addEventListener('change', () => setFront('footer', footer.value.trim()));
  nodes(panel, field('Footer', footer), h('p', { class: 's-hint' }, 'Fonts, logo and everything else are in talk.md, or in a theme file. Every change here is a line in the front matter.'));
}

function nodes(panel, ...list) {
  list.flat().forEach((n) => { if (n) panel.append(n); });
}

// --- editing text -----------------------------------------------------------------------

function openEditor(info) {
  if (!info) return;
  const rect = S.canvas.rect();
  const frame = el.frame.getBoundingClientRect();
  S.editing = { info, base: sourceOf(info.range) };
  el.editorText.value = S.editing.base;
  el.editor.hidden = false;
  const width = Math.min(460, window.innerWidth - 20);
  let x = frame.left + (rect ? rect.left : 20);
  let y = frame.top + (rect ? rect.bottom + 10 : 20);
  if (y + 200 > window.innerHeight) y = Math.max(60, frame.top + (rect ? rect.top : 20) - 190);
  x = clamp(x, 8, window.innerWidth - width - 8);
  Object.assign(el.editor.style, { left: `${x}px`, top: `${y}px` });
  el.editorText.focus();
  el.editorText.select();
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
  if (text === e.base) return;
  const slide = current();
  const now = sourceOf(e.info.range);
  if (now !== e.base && !window.confirm('This slide changed on disk while you were editing. Save over it?')) return;
  const [from, to] = e.info.range;
  if (!text.trim()) { await run({ op: 'delete-lines', slide: slide.id, from, to }, { quiet: true }); return; }
  const count = text.split('\n').length;
  await run({ op: 'replace-lines', slide: slide.id, from, to, text }, { select: [from, from + count - 1], quiet: true });
}

$('[data-editor-save]').addEventListener('click', saveEditor);
$('[data-editor-cancel]').addEventListener('click', closeEditor);
el.editorText.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditor(); }
});

async function deleteSelected() {
  const sel = S.selected;
  if (!sel) return;
  S.selected = null;
  await run({ op: 'delete-lines', slide: current().id, from: sel.range[0], to: sel.range[1] }, { quiet: true });
}

// --- the source view ---------------------------------------------------------------------

let sourceTimer = null;
el.sourceText.addEventListener('input', () => {
  clearTimeout(sourceTimer);
  say('Editing');
  sourceTimer = setTimeout(async () => {
    const text = el.sourceText.value;
    if (!text.trim()) return;
    S.busy += 1;
    try {
      await api('op', { method: 'POST', body: { op: 'replace-slide', slide: current().id, text } });
      await refresh({});
      say(`Saved to ${S.state.file}`);
    } catch (error) {
      say(error.message, true);
    } finally {
      S.busy -= 1;
    }
  }, 700);
});

// --- keys ------------------------------------------------------------------------------------

function handleKey(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '');
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    (e.shiftKey ? redo : undo)();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (typing) return;
  if (e.key === 'Escape') {
    if (!el.modal.hidden) closeModal();
    else if (S.canvas) { S.canvas.clear(); S.selected = null; closeEditor(); renderInspector(); }
    return;
  }
  if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); selectSlide(S.index + 1); return; }
  if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); selectSlide(S.index - 1); return; }
  const sel = S.selected;
  if (!sel) return;
  if (e.key === 'Enter') { e.preventDefault(); openEditor(sel); return; }
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
    run({ op: 'set-attrs', slide: current().id, range: sel.range, kv }, { select: sel.range, quiet: true });
  }
}
document.addEventListener('keydown', handleKey);

async function undo() {
  try { await api('undo', { method: 'POST' }); await refresh({}); say('Undone'); } catch (error) { toast(error.message); }
}
async function redo() {
  try { await api('redo', { method: 'POST' }); await refresh({}); say('Redone'); } catch (error) { toast(error.message); }
}

// --- pictures dropped on the slide -------------------------------------------------------------

const toBase64 = (file) => new Promise((done, failed) => {
  const reader = new FileReader();
  reader.onload = () => done(String(reader.result).split(',')[1] || '');
  reader.onerror = () => failed(new Error('Could not read that file.'));
  reader.readAsDataURL(file);
});

async function handleDrop(files, point) {
  const images = files.filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name));
  if (!images.length) { toast('Only pictures can be dropped here (png, jpg, gif, webp or svg).'); return; }
  S.busy += 1;
  try {
    const ops = [];
    let after = point.at && point.at.chain.length ? point.at.chain[0].range[1] : null;
    for (const file of images) {
      const { path } = await api('upload', { method: 'POST', body: { name: file.name, data: await toBase64(file) } });
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      const where = isCanvasSlide() ? `{x=${Math.round(clamp(point.x - 15, 0, 70))} y=${Math.round(clamp(point.y - 10, 0, 70))} w=30 h=30}` : '';
      ops.push({ op: 'insert-lines', slide: current().id, after, text: `![${alt}](${path})${where}` });
      after = null;
    }
    await api('op', { method: 'POST', body: { ops } });
    await refresh({});
    say('Picture added');
    toast('Picture added. Describe it in the Element tab, for people who cannot see it.');
  } catch (error) {
    toast(error.message);
  } finally {
    S.busy -= 1;
  }
}

// --- modals: add a slide, remix, warnings ------------------------------------------------------------

function openModal(title, body) {
  $('[data-modal-title]').textContent = title;
  $('[data-modal-body]').replaceChildren(body);
  el.modal.hidden = false;
}
function closeModal() { el.modal.hidden = true; $('[data-modal-body]').replaceChildren(); }
$('[data-modal-close]').addEventListener('click', closeModal);
el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeModal(); });

function openAdd() {
  const after = current();
  openModal('Add a slide', h('div', { class: 's-menu' }, TEMPLATES.map((t) => h('button', {
    type: 'button',
    onclick: async () => {
      closeModal();
      const ok = await run({ op: 'insert-slide', after: after ? after.id : null, text: t.text }, { quiet: true });
      if (ok) selectSlide(after ? S.index + 1 : 0);
    },
  }, h('b', {}, t.name), h('small', {}, t.about)))));
}

async function openRemix() {
  const slide = current();
  if (!slide) return;
  let data;
  try {
    data = await api(`options?slide=${encodeURIComponent(slide.id)}`);
  } catch (error) { toast(error.message); return; }
  if (data.options.length < 2) {
    openModal(`Remix: ${slide.title}`, h('p', { class: 's-empty' }, data.reason || 'No other layouts to show for this slide.'));
    return;
  }
  const grid = h('div', { class: 's-options' }, data.options.map((o) => {
    const frame = h('iframe', { tabindex: '-1', title: o.name, loading: 'lazy' });
    frame.src = `/present?preview=1&view=still&nosim=1&slide=${slide.index}${o.token ? `&override=${o.token}` : ''}`;
    const thumb = h('div', { class: 's-thumb' }, frame);
    requestAnimationFrame(() => { frame.style.transform = `scale(${(thumb.clientWidth || 300) / 1280})`; });
    return h('div', { class: 's-option' }, thumb, h('div', { class: 'cap' },
      h('span', {}, h('b', {}, `${o.number}. ${o.name}`), h('small', {}, o.source === 'current' ? 'the slide as it is' : `${o.direction}${o.by && o.source === 'variant' ? ` (${o.by})` : ''}`)),
      o.source === 'current' ? null : h('button', {
        type: 'button', class: 'main',
        onclick: async () => { closeModal(); await run({ op: 'replace-slide', slide: slide.id, text: o.text }, { quiet: true }); },
      }, 'Use this')));
  }));
  openModal(`Remix: ${slide.title}`, grid);
  $$('.s-option .s-thumb', grid).forEach((t) => { $('iframe', t).style.transform = `scale(${t.clientWidth / 1280})`; });
}

function openWarnings() {
  const list = S.state.warnings;
  openModal('Things to check', h('ul', {}, list.map((w) => h('li', {}, w))));
}

// --- the top bar ---------------------------------------------------------------------------------------

$('[data-act="undo"]').addEventListener('click', undo);
$('[data-act="redo"]').addEventListener('click', redo);
$('[data-act="remix"]').addEventListener('click', openRemix);
$('[data-act="add"]').addEventListener('click', openAdd);
$('[data-act="warnings"]').addEventListener('click', openWarnings);
$('[data-act="source"]').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  el.source.hidden = !on;
  fit();
  if (on) el.sourceText.focus();
});

// --- changes made outside the studio (an editor, an agent, git) --------------------------------------------

async function watchDisk() {
  for (;;) {
    try {
      const data = await api(`wait?since=${S.revision}`);
      if (data.revision !== S.revision && !S.busy) {
        // The canvas finds the selected element again by its lines.
        await refresh({});
        say('Updated from disk');
      }
    } catch {
      await sleep(1500);
    }
  }
}

// --- start --------------------------------------------------------------------------------------------------

async function start() {
  if (!KEY) { say('Open Studio with `quorum studio`: its address holds a key.', true); return; }
  try {
    await refresh({});
    say(`Saved to ${S.state.file}`);
    fit();
    watchDisk();
  } catch (error) {
    say(error.message, true);
  }
}

window.studio = { S, run, selectSlide };
start();
