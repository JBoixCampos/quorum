// Motion on the shared screen: slide transitions, elements that morph from
// one slide to the next, numbers that count up, code lines highlighted step
// by step and reactions floating up from the audience.
//
// Everything is skipped in thumbnails and when the system asks for less
// motion.

const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Attributes that tests and clicks use to find live elements: a leaving
// copy of the slide must not answer to them.
const HOOKS = ['data-do', 'data-option', 'data-interaction', 'data-component', 'data-join', 'data-question', 'data-hide', 'data-slide'];

// Before a slide is replaced: a copy of it, and where its morphing
// elements were. Returns null when there is nothing to animate.
export function captureLeaving(slideEl, kind) {
  if (!kind || kind === 'none' || reduced()) return null;
  const rects = new Map();
  if (kind === 'morph') {
    slideEl.querySelectorAll('[data-morph]').forEach((n) => {
      if (!n.closest('.q-step') || n.closest('.q-step').classList.contains('shown')) {
        rects.set(n.dataset.morph, { rect: n.getBoundingClientRect(), color: getComputedStyle(n).color });
      }
    });
  }
  const ghost = slideEl.cloneNode(true);
  ghost.querySelectorAll('iframe').forEach((n) => n.remove());
  HOOKS.forEach((h) => {
    ghost.removeAttribute(h);
    ghost.querySelectorAll(`[${h}]`).forEach((n) => n.removeAttribute(h));
  });
  const wrap = document.createElement('div');
  wrap.className = 'q-leaving';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.append(ghost);
  return { wrap, ghost, rects, kind };
}

const EASE = 'cubic-bezier(.2, .7, .2, 1)';

// After the new slide is drawn: animate from the copy to it.
// dir: 1 forwards, -1 backwards. scale: how much the stage is scaled.
export function playTransition(leaving, slideEl, { dir = 1, scale = 1 } = {}) {
  if (!leaving) return;
  const { wrap, ghost, rects, kind } = leaving;
  slideEl.after(wrap);
  const ms = kind === 'morph' ? 650 : 480;
  const frames = {
    fade: [[{ opacity: 0 }, { opacity: 1 }], [{ opacity: 1 }, { opacity: 0 }]],
    slide: [
      [{ opacity: 0, transform: `translateX(${dir * 160}px)` }, { opacity: 1, transform: 'none' }],
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 160}px)` }],
    ],
    zoom: [
      [{ opacity: 0, transform: `scale(${dir > 0 ? 1.08 : 0.92})` }, { opacity: 1, transform: 'none' }],
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `scale(${dir > 0 ? 0.94 : 1.06})` }],
    ],
    morph: [[{ opacity: 0 }, { opacity: 1 }], [{ opacity: 1 }, { opacity: 0 }]],
  }[kind] || null;
  if (!frames) {
    wrap.remove();
    return;
  }
  const morphed = [];
  if (kind === 'morph' && rects.size) {
    slideEl.querySelectorAll('[data-morph]').forEach((n) => {
      const before = rects.get(n.dataset.morph);
      if (!before) return;
      const after = n.getBoundingClientRect();
      if (!after.width || !after.height) return;
      const dx = (before.rect.left - after.left) / scale;
      const dy = (before.rect.top - after.top) / scale;
      const sx = before.rect.width / after.width;
      const sy = before.rect.height / after.height;
      ghost.querySelectorAll(`[data-morph="${CSS.escape(n.dataset.morph)}"]`).forEach((g) => { g.style.visibility = 'hidden'; });
      morphed.push(n);
      n.animate([
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, color: before.color },
        { transformOrigin: '0 0', transform: 'none' },
      ], { duration: ms, easing: EASE });
    });
  }
  const options = { duration: ms, easing: EASE };
  if (morphed.length) {
    // Morphing elements stay visible while the rest of the slide fades in.
    slideEl.querySelectorAll('.q-content > *, .q-media').forEach((n) => {
      if (morphed.some((m) => m === n || n.contains(m))) return;
      n.animate(frames[0], options);
    });
  } else {
    slideEl.animate(frames[0], options);
  }
  const out = ghost.animate(frames[1], { ...options, fill: 'forwards' });
  out.onfinish = () => wrap.remove();
  out.oncancel = () => wrap.remove();
  setTimeout(() => wrap.remove(), ms + 200);
}

// Numbers that count up when they appear: kpis, stats ([data-count]).
export function countUp(root, { still = false } = {}) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    if (el.dataset.counted) return;
    const step = el.closest('.q-step');
    if (step && !step.classList.contains('shown')) return;
    el.dataset.counted = '1';
    if (still || reduced()) return;
    animateNumber(el, Number(el.dataset.count));
  });
}

// Counts the first number in el's text up to `to`.
export function animateNumber(el, to, { ms = 1100 } = {}) {
  const html = el.innerHTML;
  const m = html.match(/-?\d[\d,]*(\.\d+)?/);
  if (!m || !Number.isFinite(to)) return;
  const digits = m[1] ? m[1].length - 1 : 0;
  const grouped = m[0].includes(',');
  const start = performance.now();
  const before = html.slice(0, m.index);
  const after = html.slice(m.index + m[0].length);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    const v = to * eased;
    const text = v.toLocaleString('en', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouped });
    el.innerHTML = `${before}${text}${after}`;
    if (t < 1 && el.isConnected) requestAnimationFrame(tick);
    else el.innerHTML = html;
  };
  requestAnimationFrame(tick);
}

// Code blocks with {lines=1-2|4}: the lines of the current range stand out.
export function codeRanges(root, step) {
  root.querySelectorAll('pre[data-ranges]').forEach((pre) => {
    let ranges = [];
    try {
      ranges = JSON.parse(pre.dataset.ranges);
    } catch {
      return;
    }
    let active = ranges[0] ? ranges[0][1] : [];
    ranges.forEach(([s, lines]) => { if (s <= step) active = lines; });
    pre.querySelectorAll('.q-line').forEach((line) => {
      line.classList.toggle('on', active.includes(Number(line.dataset.n)));
    });
  });
}

// Reactions: each new one floats up from the bottom of the screen.
export function reactionLayer(el) {
  const seen = new Set();
  let first = true;
  return {
    show(list = []) {
      list.forEach((r) => {
        if (seen.has(r.id)) return;
        seen.add(r.id);
        // Reactions sent before this screen opened are not replayed.
        if (first || reduced()) return;
        const n = document.createElement('span');
        n.className = 'q-reaction';
        n.textContent = r.emoji;
        n.style.left = `${8 + Math.random() * 84}%`;
        n.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 220)}px`);
        n.style.fontSize = `${64 + Math.random() * 40}px`;
        el.append(n);
        setTimeout(() => n.remove(), 3400);
      });
      first = false;
      if (seen.size > 500) [...seen].slice(0, 250).forEach((id) => seen.delete(id));
    },
  };
}
