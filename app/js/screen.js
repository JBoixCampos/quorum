// How each interaction looks on the shared screen, with the presenter's
// buttons. The right arrow runs each kind's next action (open, close,
// reveal...) before moving on to the next slide.

import { chartHtml } from '../shared/charts.js';
import { KINDS, sentenceOptions } from '../shared/kinds.js';
import { animateNumber } from './motion.js';
import { morph } from './morph.js';
import { esc } from './net.js';
import { qrSvg } from './qr.js';

export function formatNumber(v, { year = false, digits = 0 } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  return v.toLocaleString('en', { maximumFractionDigits: digits, useGrouping: !year });
}

function ring(count, connected, label) {
  const share = Math.min(1, count / Math.max(1, connected || 1));
  return `<div class="q-ring" style="--share:${share}"><div><b>${count}</b><span>${esc(label)}</span></div></div>`;
}

function controls(list) {
  return `<div class="q-controls">${list.map(([name, text, main]) => `<button type="button" class="q-btn${main ? ' main' : ''}" data-do="${name}">${esc(text)}</button>`).join('')}</div>`;
}

// How results are drawn: {chart=...} on the block, else the talk's
// "charts:" setting, else bars.
function lookOf(spec, ctx, fallback = 'bars') {
  if (spec.chart) return spec.chart;
  const meta = ctx.talk && ctx.talk.meta;
  const look = meta && meta.tokens && meta.tokens.charts;
  return look && ['poll', 'multi', 'rounds'].includes(spec.kind) ? look : fallback;
}

function revealOf(spec, ctx) {
  const meta = ctx.talk && ctx.talk.meta;
  return spec.revealStyle || (meta && meta.tokens && meta.tokens.reveal) || 'highlight';
}

// Draws results into `host`, patching the DOM in place so that bars grow,
// columns rise and slices turn instead of jumping.
function drawResults(host, look, options, counts, total, ctx, { show = true, correct = null, highlight = true, clickable = false } = {}) {
  const max = Math.max(0, ...options.map((o) => counts[o] || 0));
  const rows = options.map((o) => {
    const n = counts[o] || 0;
    const isCorrect = correct !== null && (Array.isArray(correct) ? correct.includes(o) : correct === o);
    const dim = correct !== null ? !isCorrect : (highlight && show && total > 0 && n < max);
    return { label: o, value: n, state: isCorrect ? 'correct' : (dim ? 'dim' : '') };
  });
  const meta = ctx.talk && ctx.talk.meta;
  const series = !!(meta && meta.series) || ['donut', 'bubbles'].includes(look);
  morph(host, chartHtml(look, rows, { total, show, series, clickable }));
}

const instructions = (open, how) => (open ? how : 'Get your phone ready.');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Clicks on the [data-do] buttons of an interaction.
function onButtons(el, actions) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]');
    if (b && actions[b.dataset.do]) {
      e.stopPropagation();
      actions[b.dataset.do]();
    }
  });
}

// Phases (0 waiting, 1 open, 2 closed, 3 revealed) set from the screen.
// Two quick presses of the right arrow count as two steps, even before
// the first one comes back from the server.
function phaseControl(spec, getCtx, getState) {
  let requested = null;
  const set = (p) => {
    requested = { p, at: Date.now() };
    return getCtx().act({ type: 'control', id: spec.id, action: 'phase', phase: p });
  };
  return {
    set,
    current() {
      const p = getState().phase;
      return requested && Date.now() - requested.at < 3000 && requested.p > p ? requested.p : p;
    },
    reopen() { requested = null; return set(1); },
    reset() { requested = null; return getCtx().act({ type: 'control', id: spec.id, action: 'reset' }); },
  };
}

// Ignores the same action pressed twice before the first one comes back.
function once() {
  let last = null;
  return (key) => {
    if (last && last.key === key && Date.now() - last.at < 1500) return false;
    last = { key, at: Date.now() };
    return true;
  };
}

// --- poll, multi, estimate: open, close, reveal ------------------------------

function phased(el, spec, ctx) {
  const kind = KINDS[spec.kind];
  const isEstimate = spec.kind === 'estimate';
  el.innerHTML = `
    <div class="q-int">
      <p class="q-question">${esc(spec.title)}</p>
      <p class="q-hint" data-hint></p>
      <div class="q-int-body">
        <div class="q-int-main">${isEstimate ? `
          <div class="q-estimate">
            <div data-before><p class="q-big">?</p></div>
            <div data-after hidden>
              <div class="q-figures">
                <div><p class="q-small">Audience average</p><p class="q-big" data-mean></p><p class="q-small" data-median></p></div>
                <div data-answer hidden><p class="q-small">Actual</p><p class="q-big accent" data-answer-value></p></div>
              </div>
              <div data-strip></div>
            </div>
          </div>` : '<div class="q-bars-host" data-results></div>'}
          <div class="q-reveal" data-reveal hidden>${spec.reveal || ''}</div>
        </div>
        <div class="q-int-side" data-ring></div>
      </div>
      ${controls([['open', 'Open voting', true], ['close', 'Close voting', true], ['reveal', 'Reveal', true], ['reopen', 'Reopen'], ['reset', 'Start over']])}
    </div>`;

  let c = ctx;
  const st = () => (c.view.interaction && c.view.interaction.id === spec.id ? c.view.interaction : { phase: 0, total: 0, counts: {}, mean: null, values: [] });
  const max = kind.maxPhase(spec);
  const look = lookOf(spec, ctx, isEstimate ? 'strip' : 'bars');
  const reveal = revealOf(spec, ctx);
  const box = el.querySelector('.q-int');
  box.classList.add(`look-${look}`, `reveal-${reveal}`);
  let meanShown = false;
  const phase = phaseControl(spec, () => c, st);
  onButtons(el, {
    open: () => phase.set(1),
    close: () => phase.set(2),
    reveal: () => phase.set(3),
    reopen: phase.reopen,
    reset: phase.reset,
  });

  const paint = () => {
    const s = st();
    const p = s.phase;
    el.querySelector('[data-hint]').textContent = p >= 2
      ? `${plural(s.total, 'answer')}.`
      : instructions(p === 1, { poll: 'Tap one option on your phone.', multi: 'Pick all that apply on your phone.', estimate: 'Type your guess on your phone.' }[spec.kind]);
    if (isEstimate) {
      const has = p >= 2 && s.total > 0;
      el.querySelector('[data-before]').hidden = has;
      el.querySelector('[data-after]').hidden = !has;
      if (has) {
        const digits = spec.year ? 0 : (Math.abs(s.mean) < 10 ? 2 : 0);
        const meanEl = el.querySelector('[data-mean]');
        meanEl.textContent = formatNumber(s.mean, { year: spec.year, digits });
        if (!meanShown && c.where !== 'thumbnail') animateNumber(meanEl, s.mean, { ms: 900 });
        meanShown = true;
        el.querySelector('[data-median]').textContent = `Median: ${formatNumber(s.median, { year: spec.year, digits })}`;
        el.querySelector('[data-answer]').hidden = p < 3;
        el.querySelector('[data-answer-value]').textContent = spec.answerLabel || `${formatNumber(spec.answer, { year: spec.year, digits: 2 })}${spec.unit ? ` ${spec.unit}` : ''}`;
        el.querySelector('[data-strip]').innerHTML = (ESTIMATE_LOOKS[look] || strip)(spec, s, p >= 3);
      } else meanShown = false;
    } else {
      drawResults(el.querySelector('[data-results]'), look, spec.options, s.counts || {}, s.total, c, { show: p >= 1, correct: p >= 3 && spec.answer !== undefined ? spec.answer : null });
    }
    box.classList.toggle('revealed', p >= 3);
    el.querySelector('[data-reveal]').hidden = p < 3 || !spec.reveal;
    el.querySelector('[data-ring]').innerHTML = ring(s.total, c.view.connected, s.total === 1 ? 'answer' : 'answers');
    const show = (name, yes) => { el.querySelector(`[data-do="${name}"]`).hidden = !yes; };
    show('open', p === 0);
    show('close', p === 1);
    show('reveal', p === 2 && max === 3);
    show('reopen', p >= 2);
    show('reset', p >= 2);
  };
  paint();
  return {
    update(next) { c = next; paint(); },
    primary() {
      const p = phase.current();
      if (p >= max) return false;
      phase.set(p + 1);
      return true;
    },
  };
}

// Each guess as a dot, with the average and (after the reveal) the answer.
function strip(spec, s, revealed) {
  const values = s.values || [];
  if (!values.length) return '';
  const W = 1500;
  const M = 60;
  const all = [...values, s.mean, revealed ? spec.answer : null].filter((v) => Number.isFinite(v));
  let x;
  let ticks = [];
  if (spec.scale === 'log') {
    const pos = all.filter((v) => v > 0);
    const lo = Math.log10(Math.max(0.5, Math.min(...pos) / 2));
    const hi = Math.log10(Math.max(...pos) * 2);
    x = (v) => M + ((Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo || 1)) * (W - 2 * M);
    for (let k = Math.ceil(lo); k <= Math.floor(hi); k += 1) ticks.push(10 ** k);
  } else {
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || 1;
    x = (v) => M + ((v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (W - 2 * M);
    const stepSize = (hi - lo + 2 * pad) / 6;
    const mag = 10 ** Math.floor(Math.log10(stepSize || 1));
    const nice = [1, 2, 5, 10].map((m) => m * mag).find((m) => m >= stepSize) || mag * 10;
    for (let v = Math.ceil((lo - pad) / nice) * nice; v <= hi + pad; v += nice) ticks.push(v);
  }
  const dots = values.map((v, i) => `<circle cx="${x(v).toFixed(1)}" cy="${40 + ((i * 37) % 70)}" r="9" class="dot"/>`).join('');
  const tickHtml = ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="150" y2="160" class="tick"/><text x="${x(t)}" y="192" text-anchor="middle" class="tick-label">${formatNumber(t, { year: spec.year, digits: 2 })}</text>`).join('');
  const meanFirst = !revealed || s.mean <= spec.answer;
  const marker = (v, cls, label, left) => `<line x1="${x(v)}" x2="${x(v)}" y1="18" y2="150" class="${cls}"/><text x="${x(v) + (left ? -10 : 10)}" y="30" text-anchor="${left ? 'end' : 'start'}" class="${cls}-label">${label}</text>`;
  return `<svg class="q-strip" viewBox="0 0 ${W} 200" aria-hidden="true">
    <line x1="40" x2="${W - 40}" y1="150" y2="150" class="axis"/>${tickHtml}${dots}
    ${s.mean !== null ? marker(s.mean, 'mean', 'Average', meanFirst) : ''}
    ${revealed ? marker(spec.answer, 'answer', 'Actual', !meanFirst) : ''}
  </svg>`;
}

// The horizontal scale shared by the estimate looks.
function axis(spec, s, revealed, W = 1500, M = 60) {
  const values = s.values || [];
  const all = [...values, s.mean, revealed ? spec.answer : null].filter((v) => Number.isFinite(v));
  const ticks = [];
  let x;
  let lo;
  let hi;
  if (spec.scale === 'log') {
    const pos = all.filter((v) => v > 0);
    lo = Math.log10(Math.max(0.5, Math.min(...pos) / 2));
    hi = Math.log10(Math.max(...pos) * 2);
    x = (v) => M + ((Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo || 1)) * (W - 2 * M);
    for (let k = Math.ceil(lo); k <= Math.floor(hi); k += 1) ticks.push(10 ** k);
    return { x, ticks, inv: (px) => 10 ** (lo + ((px - M) / (W - 2 * M)) * (hi - lo)) };
  }
  const a = Math.min(...all);
  const b = Math.max(...all);
  const pad = (b - a) * 0.08 || 1;
  lo = a - pad;
  hi = b + pad;
  x = (v) => M + ((v - lo) / (hi - lo)) * (W - 2 * M);
  const stepSize = (hi - lo) / 6;
  const mag = 10 ** Math.floor(Math.log10(stepSize || 1));
  const nice = [1, 2, 5, 10].map((m) => m * mag).find((m) => m >= stepSize) || mag * 10;
  for (let v = Math.ceil(lo / nice) * nice; v <= hi; v += nice) ticks.push(v);
  return { x, ticks, inv: (px) => lo + ((px - M) / (W - 2 * M)) * (hi - lo) };
}

const tickMarks = (spec, a, y) => a.ticks.map((t) => `<text x="${a.x(t)}" y="${y}" text-anchor="middle" class="tick-label">${formatNumber(t, { year: spec.year, digits: 2 })}</text>`).join('');

// Guesses in bins, as columns.
function histogram(spec, s, revealed) {
  const values = s.values || [];
  if (!values.length) return '';
  const W = 1500;
  const H = 300;
  const a = axis(spec, s, revealed, W);
  const BINS = 16;
  const width = (W - 120) / BINS;
  const counts = new Array(BINS).fill(0);
  values.forEach((v) => {
    const k = Math.max(0, Math.min(BINS - 1, Math.floor((a.x(v) - 60) / width)));
    counts[k] += 1;
  });
  const top = Math.max(...counts, 1);
  const bars = counts.map((n, k) => {
    const h = (n / top) * (H - 70);
    return `<rect x="${60 + k * width + 4}" y="${H - 40 - h}" width="${width - 8}" height="${h}" rx="6"/>`;
  }).join('');
  const answer = revealed ? `<line x1="${a.x(spec.answer)}" x2="${a.x(spec.answer)}" y1="10" y2="${H - 40}" class="answer"/><text x="${a.x(spec.answer) + 12}" y="30" class="answer-label">Actual</text>` : '';
  return `<svg class="q-strip q-hist" viewBox="0 0 ${W} ${H + 10}" aria-hidden="true">${bars}${answer}${tickMarks(spec, a, H)}</svg>`;
}

// Every guess as a dot, stacked so none hides another.
function beeswarm(spec, s, revealed) {
  const values = s.values || [];
  if (!values.length) return '';
  const W = 1500;
  const R = 11;
  const a = axis(spec, s, revealed, W);
  const columns = new Map();
  const dots = [...values].sort((p, q) => p - q).map((v) => {
    const col = Math.round(a.x(v) / (R * 2));
    const n = columns.get(col) || 0;
    columns.set(col, n + 1);
    const lift = Math.ceil(n / 2) * (R * 2 + 2) * (n % 2 ? -1 : 1);
    return `<circle class="dot" cx="${col * R * 2}" cy="${100 + Math.max(-80, Math.min(80, lift))}" r="${R}"/>`;
  }).join('');
  const marker = (v, cls, label) => `<line x1="${a.x(v)}" x2="${a.x(v)}" y1="0" y2="190" class="${cls}"/><text x="${a.x(v) + 10}" y="18" class="${cls}-label">${label}</text>`;
  return `<svg class="q-strip q-swarm" viewBox="0 0 ${W} 230" aria-hidden="true">${dots}
    ${s.mean !== null ? marker(s.mean, 'mean', 'Average') : ''}${revealed ? marker(spec.answer, 'answer', 'Actual') : ''}${tickMarks(spec, a, 222)}</svg>`;
}

// The average as a level in a tube, with the answer as a mark.
function thermometer(spec, s, revealed) {
  if (!(s.values || []).length) return '';
  const W = 1500;
  const a = axis(spec, s, revealed, W);
  const level = Math.max(0, a.x(s.mean) - 60);
  const answer = revealed ? `<line x1="${a.x(spec.answer)}" x2="${a.x(spec.answer)}" y1="20" y2="150" class="mark"/><text x="${a.x(spec.answer) + 12}" y="30" class="answer-label">Actual</text>` : '';
  return `<svg class="q-strip q-thermo" viewBox="0 0 ${W} 220" aria-hidden="true">
    <rect class="tube" x="60" y="60" width="${W - 120}" height="60" rx="30"/>
    <rect class="mercury" x="60" y="60" width="${level}" height="60" rx="30"/>
    ${answer}${tickMarks(spec, a, 190)}</svg>`;
}

const ESTIMATE_LOOKS = { histogram, beeswarm, thermometer };

// --- rounds: the same question over several items ----------------------------

function rounds(el, spec, ctx) {
  el.innerHTML = `
    <div class="q-int">
      <p class="q-question">${esc(spec.title)}</p>
      <p class="q-hint" data-hint></p>
      <div class="q-int-body">
        <div class="q-int-main">
          <p class="q-small" data-counter></p>
          <p class="q-item" data-item></p>
          <div class="q-bars-host" data-results></div>
        </div>
        <div class="q-int-side" data-ring></div>
      </div>
      ${controls([['open', 'Open voting', true], ['close', 'Close voting', true], ['next', 'Next round', true], ['previous', 'Previous round'], ['reset', 'Start over']])}
    </div>`;
  let c = ctx;
  const st = () => (c.view.interaction && c.view.interaction.id === spec.id ? c.view.interaction : { index: 0, open: false, done: false, total: 0, counts: {}, rounds: spec.items.length, item: spec.items[0] });
  const act = (action) => c.act({ type: 'control', id: spec.id, action });
  const look = lookOf(spec, ctx);
  const names = ['open', 'close', 'next', 'previous', 'reset'];
  onButtons(el, Object.fromEntries(names.map((name) => [name, () => act(name)])));
  const paint = () => {
    const s = st();
    el.querySelector('[data-counter]').textContent = `Round ${s.index + 1} of ${s.rounds}`;
    el.querySelector('[data-item]').textContent = s.item;
    el.querySelector('[data-hint]').textContent = s.done ? `${plural(s.total, 'vote')}.` : instructions(s.open, 'Vote on your phone.');
    drawResults(el.querySelector('[data-results]'), look, spec.options, s.counts, s.total, c, { show: s.open || s.done });
    el.querySelector('[data-ring]').innerHTML = ring(s.total, c.view.connected, s.total === 1 ? 'vote' : 'votes');
    const show = (name, yes) => { el.querySelector(`[data-do="${name}"]`).hidden = !yes; };
    show('open', !s.open);
    show('close', s.open);
    show('next', !s.open && s.done && s.index < s.rounds - 1);
    show('previous', !s.open && s.index > 0);
    show('reset', !s.open && (s.done || s.index > 0));
  };
  paint();
  const fresh = once();
  return {
    update(next) { c = next; paint(); },
    primary() {
      const s = st();
      const kindState = { index: s.index, open: s.open, results: s.done ? { [s.index]: true } : {} };
      const p = KINDS.rounds.primary(spec, kindState);
      if (!p) return false;
      if (fresh(`${p.action}-${s.index}-${s.open}`)) act(p.action);
      return true;
    },
  };
}

// --- sentence: written one word at a time ------------------------------------

function sentence(el, spec, ctx) {
  el.innerHTML = `
    <div class="q-int q-sentence">
      <p class="q-sentence-text" data-text></p>
      ${lookOf(spec, ctx) === 'tree' ? '<div class="q-tree" data-tree></div>' : ''}
      <p class="q-hint" data-hint></p>
      <div class="q-int-body">
        <div class="q-int-main" data-bars></div>
        <div class="q-int-side" data-ring></div>
      </div>
      ${controls([['open', 'Open voting', true], ['close', 'Pick the most voted', true], ['draw', 'Draw by votes'], ['undo', 'Undo word'], ['reset', 'Start over']])}
    </div>`;
  let c = ctx;
  let shownOptions = '';
  const st = () => (c.view.interaction && c.view.interaction.id === spec.id ? c.view.interaction
    : { words: [], options: sentenceOptions(spec, []), counts: {}, total: 0, open: false, finished: false });
  const act = (action, extra = {}) => c.act({ type: 'control', id: spec.id, action, ...extra });
  const names = ['open', 'close', 'draw', 'undo', 'reset'];
  onButtons(el, Object.fromEntries(names.map((name) => [name, () => act(name)])));
  // Clicking a word picks it, whatever the votes say.
  el.addEventListener('click', (e) => {
    const row = e.target.closest('.q-bar.clickable');
    if (!row) return;
    e.stopPropagation();
    act('fix', { word: row.dataset.option });
  });
  const paint = () => {
    const s = st();
    const words = s.words.map((w) => {
      const attached = /^[.,;:!?]/.test(w.text);
      const tag = w.share !== null && w.share !== undefined ? `<span class="q-share">${Math.round(w.share * 100)}%</span>` : '';
      return `${attached ? '' : ' '}<span class="q-word${w.drawn ? ' drawn' : ''}">${esc(w.text)}${tag}</span>`;
    }).join('');
    el.querySelector('[data-text]').innerHTML = `${esc(spec.start)}${words}${s.finished ? '' : ' <span class="q-blank"></span>'}`;
    const key = s.options.join('|');
    if (key !== shownOptions) {
      shownOptions = key;
      el.querySelector('[data-bars]').innerHTML = s.options.length ? '<div class="q-bars-host" data-results></div>' : '<p class="q-small">The sentence is finished.</p>';
    }
    if (s.options.length) drawResults(el.querySelector('[data-results]'), 'bars', s.options, s.counts, s.total, c, { show: s.open || s.total > 0, clickable: true });
    const tree = el.querySelector('[data-tree]');
    if (tree) {
      tree.innerHTML = s.words.map((w) => `<div class="q-tree-step"><span class="q-tree-word">${esc(w.text)}</span>${(w.alts || []).map((a) => `<span class="q-tree-alt">${esc(a)}</span>`).join('')}</div>`).join('');
    }
    el.querySelector('[data-hint]').textContent = s.finished ? '' : instructions(s.open, 'Vote for the next word on your phone.');
    el.querySelector('[data-ring]').innerHTML = s.finished ? '' : ring(s.total, c.view.connected, s.total === 1 ? 'vote' : 'votes');
    const show = (name, yes) => { el.querySelector(`[data-do="${name}"]`).hidden = !yes; };
    show('open', !s.open && !s.finished);
    show('close', s.open);
    show('draw', !s.finished && (s.open || s.total > 0));
    show('undo', !s.open && s.words.length > 0);
    show('reset', !s.open && s.words.length > 0);
  };
  paint();
  const fresh = once();
  return {
    update(next) { c = next; paint(); },
    primary() {
      const s = st();
      if (s.finished) return false;
      const action = s.open ? 'close' : 'open';
      if (fresh(`${action}-${s.words.length}`)) act(action);
      return true;
    },
  };
}

// --- questions: approved questions, most voted or latest first ---------------

function questions(el, spec, ctx) {
  el.innerHTML = `
    <div class="q-int q-questions-board">
      <p class="q-hint" data-hint></p>
      <div class="q-questions" data-list></div>
    </div>`;
  let c = ctx;
  const look = lookOf(spec, ctx, 'list');
  if (look === 'wall') el.querySelector('[data-list]').classList.add('wall');
  el.addEventListener('click', (e) => {
    const hide = e.target.closest('[data-hide]');
    if (hide) {
      e.stopPropagation();
      c.act({ type: 'moderate', id: hide.dataset.hide, status: 'hidden' });
      return;
    }
    const row = e.target.closest('[data-question]');
    if (row) {
      e.stopPropagation();
      c.act({ type: 'onScreen', id: row.dataset.question });
    }
  });
  const paint = () => {
    const v = c.view;
    let list = (v.questions || []).filter((q) => !q.answered);
    if (spec.mode === 'latest') list = [...list].sort((a, b) => b.created - a.created);
    if (look === 'spotlight') {
      const on = list.find((q) => q.id === v.questionOnScreen) || list[0];
      list = on ? [on, ...list.filter((q) => q !== on)] : list;
    }
    list = list.slice(0, look === 'wall' ? 9 : 6);
    const pending = v.pendingQuestions || 0;
    const total = (v.questions || []).length + pending;
    el.querySelector('[data-hint]').textContent = `Ask from your phone, anonymously${spec.mode === 'top' ? ', and vote for the ones you want answered' : ''}.${total ? ` ${total} received${pending ? `, ${pending} waiting` : ''}.` : ''}`;
    if (look === 'spotlight' && list.length) {
      const [top, ...others] = list;
      el.querySelector('[data-list]').innerHTML = `<div data-question="${esc(top.id)}"><p class="q-spotlight">${esc(top.text)}</p><p class="q-spotlight-meta">${spec.mode === 'top' ? `${plural(top.votes, 'vote')} · ` : ''}${others.length} more waiting</p></div>
        ${others.slice(0, 3).map((q) => `<div class="q-question-row" data-question="${esc(q.id)}"><span class="q-question-text">${esc(q.text)}</span>${spec.mode === 'top' ? `<span class="q-votes">${q.votes}</span>` : ''}<button type="button" class="q-hide" data-hide="${esc(q.id)}" aria-label="Hide this question">×</button></div>`).join('')}`;
      return;
    }
    el.querySelector('[data-list]').innerHTML = list.length ? list.map((q) => `
      <div class="q-question-row${v.questionOnScreen === q.id ? ' on' : ''}" data-question="${esc(q.id)}">
        <span class="q-question-text">${esc(q.text)}</span>
        ${spec.mode === 'top' ? `<span class="q-votes">${q.votes}</span>` : ''}
        <button type="button" class="q-hide" data-hide="${esc(q.id)}" aria-label="Hide this question">×</button>
      </div>`).join('') : '<p class="q-empty">No questions yet. Be the first!</p>';
  };
  paint();
  return { update(next) { c = next; paint(); }, primary: () => false };
}

// A component that asks the audience something ("audience:" in its block).
// The component draws the answers; this adds the status line and buttons.
function input(el, spec, ctx) {
  el.innerHTML = `
    <div class="q-input-bar">
      <span class="q-small" data-status></span>
      ${controls([['open', 'Open', true], ['close', 'Close', true], ['reopen', 'Reopen'], ['reset', 'Start over']])}
    </div>`;
  let c = ctx;
  const st = () => (c.view.interaction && c.view.interaction.id === spec.id ? c.view.interaction : { phase: 0, total: 0 });
  const phase = phaseControl(spec, () => c, st);
  onButtons(el, {
    open: () => phase.set(1),
    close: () => phase.set(2),
    reopen: phase.reopen,
    reset: phase.reset,
  });
  const paint = (next) => {
    c = next;
    const s = st();
    const n = plural(s.total, 'answer');
    el.querySelector('[data-status]').textContent = [
      'Get your phone ready.',
      `Answer on your phone · ${n}`,
      `Closed · ${n}`,
    ][s.phase] || '';
    const show = (name, yes) => { el.querySelector(`[data-do="${name}"]`).hidden = !yes; };
    show('open', s.phase === 0);
    show('close', s.phase === 1);
    show('reopen', s.phase === 2);
    show('reset', s.phase > 0);
  };
  paint(ctx);
  return {
    update: paint,
    primary() {
      const p = phase.current();
      if (p >= 2) return false;
      phase.set(p + 1);
      return true;
    },
  };
}

const MOUNT = { poll: phased, multi: phased, estimate: phased, rounds, sentence, questions, input };

export function mountInteraction(el, spec, ctx) {
  const mount = MOUNT[spec.kind];
  return mount ? mount(el, spec, ctx) : { update() {}, primary: () => false };
}

// The join block: a big QR code, the link and how many people are in.
export function mountJoin(el, ctx) {
  const title = el.innerHTML;
  el.innerHTML = `<div class="q-join-card"><div data-qr></div><div><p class="q-join-title">${title || 'Join from your phone'}</p><p class="q-join-url" data-url></p><p class="q-small"><b data-people>0</b> connected</p></div></div>`;
  let shown = null;
  const paint = (c) => {
    const url = c.view.publicUrl || (c.preview ? location.origin : '');
    if (url !== shown) {
      shown = url;
      el.querySelector('[data-qr]').innerHTML = url ? qrSvg(url, { label: 'Scan to join' }) : '';
      el.querySelector('[data-url]').textContent = url.replace(/^https?:\/\//, '') || 'The link will appear here.';
    }
    el.querySelector('[data-people]').textContent = c.view.connected || 0;
  };
  paint(ctx);
  return { update: paint, primary: () => false };
}
