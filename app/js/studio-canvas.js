// The layer over the canvas: pick things on the slide, drag them, edit them.
// The canvas is the real slide, drawn by the same page that presents it
// (view=studio), in an iframe of the same origin. Every block of the slide
// carries `data-src="12-14"`, the lines of the talk it was written on, so a
// click on the slide is a place in the Markdown.
//
// This file only looks and reports: it never changes the talk. What a drag
// means (move these lines, set these numbers) is sent to the page through
// `api`, which writes it to the files.

const CSS = `
html.in-studio, html.in-studio body { cursor: default; }
html.in-studio [data-slide] [data-src] { cursor: pointer; }
html.in-studio .q-footer, html.in-studio .q-logo, html.in-studio .q-reactions { pointer-events: none; }
#qs-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font: 12px/1.2 system-ui, sans-serif; }
#qs-overlay > * { position: absolute; box-sizing: border-box; }
.qs-box { border: 2px solid #6ea8fe; border-radius: 3px; }
.qs-hover { border: 1px solid rgba(110, 168, 254, 0.8); background: rgba(110, 168, 254, 0.1); }
.qs-tag { background: #6ea8fe; color: #0b1220; padding: 2px 7px; border-radius: 3px; white-space: nowrap; }
.qs-handle { width: 12px; height: 12px; background: #fff; border: 2px solid #6ea8fe; border-radius: 2px; pointer-events: auto; }
.qs-line { background: #6ea8fe; border-radius: 2px; }
.qs-guide { background: #ff6bd6; }
.qs-editing { outline: 2px solid #6ea8fe !important; outline-offset: 4px; cursor: text !important; caret-color: currentColor; }
.qs-editing:focus { outline: 2px solid #6ea8fe !important; }
`;

const LABELS = {
  heading: 'Heading', paragraph: 'Text', list: 'List', item: 'Item', image: 'Picture', column: 'Card', block: 'Block', code: 'Code', table: 'Table', quote: 'Quote',
};

const BLOCK_NAMES = {
  'q-cards': 'Cards', 'q-compare': 'Comparison', 'q-kpis': 'Key figures', 'q-timeline': 'Timeline', 'q-process': 'Steps', 'q-chart': 'Chart', 'q-callout': 'Callout', 'q-columns': 'Columns', 'q-stat': 'Big number',
};

export function attachCanvas(frame, api) {
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const overlay = doc.createElement('div');
  overlay.id = 'qs-overlay';
  doc.body.appendChild(overlay);

  let selected = null; // { el, range, nth }
  let pending = null;
  let drag = null;
  let hover = null;

  const slide = () => doc.querySelector('[data-slide]');
  const rangeOf = (el) => el.getAttribute('data-src').split('-').map(Number);
  const key = (el) => el.getAttribute('data-src');
  const nthOf = (el) => [...doc.querySelectorAll(`[data-src="${key(el)}"]`)].indexOf(el);
  const find = (range, nth = 0) => doc.querySelectorAll(`[data-src="${range[0]}-${range[1]}"]`)[nth] || null;

  function pick(target) {
    if (!target || !target.closest) return null;
    const el = target.closest('[data-src]');
    return el && slide() && slide().contains(el) ? el : null;
  }

  function kindOf(el) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'p') return 'paragraph';
    if (tag === 'ul' || tag === 'ol') return el.classList.contains('q-timeline') || el.classList.contains('q-process') ? 'block' : 'list';
    if (tag === 'li' || el.matches('.q-tl-item, .q-process-item, .q-kpi')) return 'item';
    if (tag === 'figure') return el.classList.contains('q-chart') ? 'block' : 'image';
    if (el.matches('.q-card, .q-compare-side')) return 'column';
    if (tag === 'pre') return 'code';
    if (tag === 'table') return 'table';
    if (tag === 'blockquote') return 'quote';
    return 'block';
  }

  function labelOf(el) {
    const kind = kindOf(el);
    if (kind === 'block') {
      const name = Object.keys(BLOCK_NAMES).find((c) => el.classList.contains(c));
      if (name) return BLOCK_NAMES[name];
      if (el.hasAttribute('data-interaction') || el.querySelector('[data-interaction]')) return 'Audience';
    }
    return LABELS[kind];
  }

  // A share of the slide, from 0 to 100.
  function percentBox(el) {
    const s = slide().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: ((r.left - s.left) / s.width) * 100, y: ((r.top - s.top) / s.height) * 100, w: (r.width / s.width) * 100, h: (r.height / s.height) * 100,
    };
  }

  const inCanvas = () => api.isCanvas();
  const isTopLevel = (el) => !!el.parentElement && el.parentElement.classList.contains('q-content');

  function refOf(el) {
    return { range: rangeOf(el), nth: nthOf(el) };
  }

  function infoOf(el) {
    const chain = [];
    for (let n = el; n && n !== slide(); n = n.parentElement) if (n.hasAttribute && n.hasAttribute('data-src')) chain.unshift({ ...refOf(n), kind: kindOf(n), label: labelOf(n) });
    return {
      ...refOf(el),
      kind: kindOf(el),
      label: labelOf(el),
      tag: el.tagName.toLowerCase(),
      classes: [...el.classList].filter((c) => c.startsWith('is-')).map((c) => c.slice(3)),
      chain,
      positioned: el.style.position === 'absolute',
      topLevel: isTopLevel(el),
      box: percentBox(el),
      alt: el.tagName === 'FIGURE' ? ((el.querySelector('img') || {}).alt || '') : '',
    };
  }

  // --- drawing ---------------------------------------------------------------

  function clearOverlay(selector) {
    overlay.querySelectorAll(selector).forEach((n) => n.remove());
  }

  function add(cls, rect, extra = {}) {
    const n = doc.createElement('div');
    n.className = cls;
    Object.assign(n.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    Object.entries(extra).forEach(([k, v]) => n.setAttribute(k, v));
    overlay.appendChild(n);
    return n;
  }

  function drawSelection() {
    clearOverlay('.qs-box, .qs-tag, .qs-handle');
    if (!selected || !selected.el.isConnected) return;
    const r = selected.el.getBoundingClientRect();
    add('qs-box', r);
    const tag = add('qs-tag', { left: r.left, top: Math.max(0, r.top - 22), width: 0, height: 0 });
    tag.style.width = 'auto';
    tag.style.height = 'auto';
    tag.textContent = (api.labelFor && api.labelFor(rangeOf(selected.el))) || labelOf(selected.el);
    if (inCanvas() && isTopLevel(selected.el)) {
      [['nw', r.left, r.top], ['ne', r.right, r.top], ['sw', r.left, r.bottom], ['se', r.right, r.bottom]].forEach(([name, x, y]) => {
        const h = add('qs-handle', { left: x - 6, top: y - 6, width: 12, height: 12 }, { 'data-handle': name });
        h.style.cursor = `${name}-resize`;
      });
    }
  }

  function drawHover(el) {
    clearOverlay('.qs-hover');
    if (!el || (selected && el === selected.el) || drag) return;
    add('qs-hover', el.getBoundingClientRect());
  }

  // --- selecting ----------------------------------------------------------------

  function select(el, quiet = false) {
    selected = el ? { el, ...refOf(el) } : null;
    drawSelection();
    if (!quiet) api.onSelect(el ? infoOf(el) : null);
  }

  // After the slide was drawn again: find the same element by its lines.
  function refind() {
    if (!selected) return;
    if (selected.el.isConnected) { drawSelection(); return; }
    const again = find(selected.range, selected.nth) || find(selected.range, 0);
    if (again) select(again, true);
    else { selected = null; drawSelection(); api.onSelect(null); }
  }

  // --- snapping (canvas) -------------------------------------------------------------

  function snap(box, el, free) {
    const guides = [];
    const round = (v) => Math.round(v * 10) / 10;
    if (free) return { box: { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) }, guides };
    const others = [...slide().querySelectorAll('.q-content > [data-src]')].filter((n) => n !== el).map(percentBox);
    const xs = [0, 50, 100, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const ys = [0, 50, 100, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
    const fit = (lo, size, list, axis) => {
      let best = null;
      [[lo, 0], [lo + size / 2, size / 2], [lo + size, size]].forEach(([edge, offset]) => {
        list.forEach((c) => {
          const d = c - edge;
          if (Math.abs(d) <= 1 && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c, offset };
        });
      });
      if (best) {
        guides.push({ axis, at: best.at });
        return lo + best.d;
      }
      return Math.round(lo);
    };
    return { box: { x: round(fit(box.x, box.w, xs, 'x')), y: round(fit(box.y, box.h, ys, 'y')), w: round(box.w), h: round(box.h) }, guides };
  }

  function drawGuides(guides) {
    clearOverlay('.qs-guide');
    const s = slide().getBoundingClientRect();
    guides.forEach((g) => {
      if (g.axis === 'x') add('qs-guide', { left: s.left + (g.at / 100) * s.width, top: s.top, width: 1, height: s.height });
      else add('qs-guide', { left: s.left, top: s.top + (g.at / 100) * s.height, width: s.width, height: 1 });
    });
  }

  function place(el, box) {
    Object.assign(el.style, {
      position: 'absolute', left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: box.h ? `${box.h}%` : '',
    });
  }

  // --- dragging --------------------------------------------------------------------------

  function startDrag(e) {
    const { el } = pending;
    const canvas = inCanvas() && isTopLevel(el);
    if (canvas) {
      const box = percentBox(el);
      const had = el.style.position === 'absolute';
      drag = { type: 'move', el, box, had, startX: e.clientX, startY: e.clientY, last: box };
      if (!had) place(el, { ...box, h: 0 });
      return;
    }
    const siblings = [...el.parentElement.children].filter((n) => n !== el && n.hasAttribute('data-src'));
    if (!siblings.length) { pending = null; return; }
    const tops = siblings.map((n) => n.getBoundingClientRect().top);
    const horizontal = siblings.length > 1 && Math.max(...tops) - Math.min(...tops) < 24;
    drag = { type: 'reorder', el, siblings, horizontal, target: null, where: 'before' };
    el.style.opacity = '0.4';
  }

  function updateDrag(e) {
    if (drag.type === 'move') {
      const s = slide().getBoundingClientRect();
      const dx = ((e.clientX - drag.startX) / s.width) * 100;
      const dy = ((e.clientY - drag.startY) / s.height) * 100;
      const moved = { ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy };
      const { box, guides } = snap(moved, drag.el, e.altKey);
      drag.last = box;
      place(drag.el, { ...box, h: drag.had ? box.h : 0 });
      drawGuides(guides);
      drawSelection();
      return;
    }
    // reorder: the nearest sibling, and which side of it
    const axis = drag.horizontal ? 'x' : 'y';
    let best = null;
    drag.siblings.forEach((n) => {
      const r = n.getBoundingClientRect();
      const centre = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
      const d = Math.abs((axis === 'x' ? e.clientX : e.clientY) - centre);
      if (!best || d < best.d) best = { n, d, r, centre };
    });
    drag.target = best.n;
    drag.where = (axis === 'x' ? e.clientX : e.clientY) < best.centre ? 'before' : 'after';
    clearOverlay('.qs-line');
    const r = best.r;
    if (axis === 'x') add('qs-line', { left: (drag.where === 'before' ? r.left : r.right) - 2, top: r.top, width: 4, height: r.height });
    else add('qs-line', { left: r.left, top: (drag.where === 'before' ? r.top : r.bottom) - 2, width: r.width, height: 4 });
  }

  function endDrag() {
    const d = drag;
    drag = null;
    pending = null;
    clearOverlay('.qs-line, .qs-guide');
    if (!d) return;
    if (d.type === 'move') {
      const kv = { x: d.last.x, y: d.last.y };
      if (!d.had) kv.w = Math.round(Math.min(d.box.w, 100 - d.last.x) * 10) / 10;
      api.onPosition({ ...refOf(d.el), kv });
      return;
    }
    d.el.style.opacity = '';
    if (d.target) api.onMoveBlock({ from: rangeOf(d.el), to: rangeOf(d.target), where: d.where });
  }

  function startResize(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    const el = selected.el;
    drag = { type: 'resize', el, handle, box: percentBox(el), startX: e.clientX, startY: e.clientY, last: percentBox(el) };
    if (el.style.position !== 'absolute') place(el, drag.box);
  }

  function updateResize(e) {
    const s = slide().getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / s.width) * 100;
    const dy = ((e.clientY - drag.startY) / s.height) * 100;
    const b = drag.box;
    let { x, y, w, h } = b;
    if (drag.handle.includes('e')) w = b.w + dx;
    if (drag.handle.includes('s')) h = b.h + dy;
    if (drag.handle.includes('w')) { x = b.x + dx; w = b.w - dx; }
    if (drag.handle.includes('n')) { y = b.y + dy; h = b.h - dy; }
    w = Math.max(4, w);
    h = Math.max(3, h);
    const { box, guides } = snap({ x, y, w, h }, drag.el, e.altKey);
    drag.last = box;
    place(drag.el, box);
    drawGuides(guides);
    drawSelection();
  }

  function endResize() {
    const d = drag;
    drag = null;
    clearOverlay('.qs-guide');
    api.onPosition({ ...refOf(d.el), kv: { x: d.last.x, y: d.last.y, w: d.last.w, h: d.last.h } });
  }

  // --- events --------------------------------------------------------------------------------

  doc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (editing() && e.target.closest && e.target.closest('[contenteditable="true"]')) return;
    const handle = e.target.closest && e.target.closest('[data-handle]');
    if (handle) { startResize(e, handle.getAttribute('data-handle')); return; }
    e.preventDefault();
    e.stopPropagation();
    let el = pick(e.target);
    if (!el) { select(null); return; }
    // Shift selects the whole thing around it: the card, not its text.
    if (e.shiftKey && el.parentElement) el = pick(el.parentElement) || el;
    select(el);
    pending = { el, x: e.clientX, y: e.clientY };
  }, true);

  doc.addEventListener('pointermove', (e) => {
    if (editing()) return;
    if (drag && drag.type === 'resize') { updateResize(e); return; }
    if (pending && !drag && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 5) startDrag(e);
    if (drag) { updateDrag(e); return; }
    hover = pick(e.target);
    drawHover(hover);
  }, true);

  doc.addEventListener('pointerup', () => {
    if (drag && drag.type === 'resize') { endResize(); return; }
    if (drag) { endDrag(); return; }
    pending = null;
  }, true);

  doc.addEventListener('pointerleave', () => { clearOverlay('.qs-hover'); });
  doc.addEventListener('click', (e) => {
    if (editing() && e.target.closest && e.target.closest('[contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  doc.addEventListener('dblclick', (e) => {
    if (editing()) return;
    e.preventDefault();
    e.stopPropagation();
    if (selected) api.onEdit(infoOf(selected.el));
  }, true);
  doc.addEventListener('keydown', (e) => { if (!editing()) api.onKey(e); }, true);

  // --- dropping: pictures from the desktop, blocks from the Insert library -----

  const BLOCK_TYPE = 'application/x-quorum-block';
  const typesOf = (e) => [...(e.dataTransfer ? e.dataTransfer.types : [])];

  // Where a block dropped at (x, y) goes: before or after the nearest block.
  function dropPlace(e) {
    const blocks = [...slide().querySelectorAll('.q-content > [data-src], .q-media[data-src], .q-content > .q-step > [data-src]')]
      .filter((n) => n.getBoundingClientRect().height > 0);
    let best = null;
    blocks.forEach((n) => {
      const r = n.getBoundingClientRect();
      const d = e.clientY < r.top ? r.top - e.clientY : (e.clientY > r.bottom ? e.clientY - r.bottom : 0);
      if (!best || d < best.d) best = { n, d, r };
    });
    const s = slide().getBoundingClientRect();
    const point = { x: ((e.clientX - s.left) / s.width) * 100, y: ((e.clientY - s.top) / s.height) * 100 };
    if (!best) return { anchor: null, where: 'after', ...point };
    const where = e.clientY < best.r.top + best.r.height / 2 ? 'before' : 'after';
    return { anchor: rangeOf(best.n), where, rect: best.r, ...point };
  }

  doc.addEventListener('dragover', (e) => {
    const types = typesOf(e);
    if (types.includes(BLOCK_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const place = dropPlace(e);
      clearOverlay('.qs-line');
      if (inCanvas()) {
        add('qs-line', { left: e.clientX - 2, top: e.clientY - 2, width: 4, height: 4 });
      } else if (place.rect) {
        const r = place.rect;
        add('qs-line', { left: r.left, top: (place.where === 'before' ? r.top : r.bottom) - 2, width: r.width, height: 4 });
      }
      return;
    }
    if (!types.includes('Files')) return;
    e.preventDefault();
    api.onDragFiles(true);
  });
  doc.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && doc.contains(e.relatedTarget)) return;
    clearOverlay('.qs-line');
    api.onDragFiles(false);
  });
  doc.addEventListener('drop', (e) => {
    const types = typesOf(e);
    if (types.includes(BLOCK_TYPE)) {
      e.preventDefault();
      clearOverlay('.qs-line');
      const place = dropPlace(e);
      delete place.rect;
      api.onDropBlock(e.dataTransfer.getData(BLOCK_TYPE), place);
      return;
    }
    const files = [...(e.dataTransfer ? e.dataTransfer.files : [])];
    if (!files.length) return;
    e.preventDefault();
    api.onDragFiles(false);
    const el = pick(doc.elementFromPoint(e.clientX, e.clientY));
    const s = slide().getBoundingClientRect();
    api.onDropFiles(files, { at: el ? infoOf(el) : null, x: ((e.clientX - s.left) / s.width) * 100, y: ((e.clientY - s.top) / s.height) * 100 });
  });

  // --- typing on the slide -------------------------------------------------------

  // Makes the selected heading or paragraph editable in place. done(html)
  // gets what was typed; Esc gives back null.
  function editInline(done) {
    if (!selected || !selected.el.isConnected) return false;
    const el = selected.el;
    const before = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.classList.add('qs-editing');
    clearOverlay('.qs-box, .qs-tag, .qs-handle, .qs-hover');
    el.focus();
    const range = doc.createRange();
    range.selectNodeContents(el);
    const sel = win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let finished = false;
    const finish = (keep) => {
      if (finished) return;
      finished = true;
      el.removeAttribute('contenteditable');
      el.classList.remove('qs-editing');
      el.removeEventListener('keydown', onKey, true);
      el.removeEventListener('blur', onBlur);
      const html = el.innerHTML;
      if (!keep) el.innerHTML = before;
      drawSelection();
      done(keep && html !== before ? html : null);
    };
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && ['b', 'i'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        doc.execCommand(e.key.toLowerCase() === 'b' ? 'bold' : 'italic');
      }
    };
    const onBlur = () => finish(true);
    el.addEventListener('keydown', onKey, true);
    el.addEventListener('blur', onBlur);
    // Pasting keeps the text, not the formatting of where it came from.
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      doc.execCommand('insertText', false, (e.clipboardData || win.clipboardData).getData('text/plain').replace(/\s+/g, ' '));
    }, { once: false });
    return true;
  }
  const editing = () => !!doc.querySelector('[contenteditable="true"]');

  // The slide is drawn again after every change: find the selection again.
  let queued = false;
  const observer = new win.MutationObserver(() => {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(() => { queued = false; refind(); });
  });
  if (slide()) observer.observe(slide(), { childList: true, subtree: true });
  win.addEventListener('resize', () => { drawSelection(); });
  win.addEventListener('scroll', () => { drawSelection(); }, true);

  return {
    select(range, nth = 0) {
      const el = range ? find(range, nth) : null;
      select(el, true);
      return el ? infoOf(el) : null;
    },
    clear() { select(null, true); },
    redraw: drawSelection,
    editInline,
    editing,
    info() { return selected && selected.el.isConnected ? infoOf(selected.el) : null; },
    rect() { return selected && selected.el.isConnected ? selected.el.getBoundingClientRect() : null; },
    slideBox: () => slide().getBoundingClientRect(),
    elementAt(range, nth = 0) { return find(range, nth); },
    detach() {
      observer.disconnect();
      overlay.remove();
      style.remove();
    },
  };
}
