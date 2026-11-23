// How each interaction looks on the shared screen, with the presenter's
// buttons. The right arrow runs each kind's next action (open, close,
// reveal...) before moving on to the next slide.

import { KINDS, readNumber, sentenceOptions } from '../shared/kinds.js';
import { esc } from './net.js';
import { qrSvg } from './qr.js';

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '0%');

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

// Bars that keep their DOM between updates (so widths animate).
function barsHtml(options, { clickable = false } = {}) {
  return `<div class="q-bars${options.length > 5 ? ' many' : ''}">${options.map((o) => `
    <div class="q-bar${clickable ? ' clickable' : ''}" data-option="${esc(o)}">
      <span class="q-bar-label">${esc(o)}</span>
      <span class="q-bar-track"><span class="q-bar-fill"></span></span>
      <span class="q-bar-value"></span>
    </div>`).join('')}</div>`;
}

function setBars(root, options, counts, total, { show = true, correct = null, highlight = true } = {}) {
  const max = Math.max(0, ...options.map((o) => counts[o] || 0));
  root.querySelectorAll('.q-bar').forEach((row) => {
    const o = row.dataset.option;
    const n = counts[o] || 0;
    row.querySelector('.q-bar-fill').style.width = show && total ? `${(n / total) * 100}%` : '0';
    row.querySelector('.q-bar-value').textContent = show ? pct(n, total) : '';
    const isCorrect = correct !== null && (Array.isArray(correct) ? correct.includes(o) : correct === o);
    row.classList.toggle('correct', isCorrect);
    row.classList.toggle('dim', correct !== null ? !isCorrect : (highlight && show && total > 0 && n < max));
  });
}

function instructions(ctx, open, how) {
  if (ctx.chatMode) return open ? 'Answer in the chat.' : 'Answers will be read from the chat.';
  if (!open) return 'Get your phone ready.';
  return how;
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
          </div>` : barsHtml(spec.options, { clickable: true })}
          <div class="q-reveal" data-reveal hidden>${spec.reveal || ''}</div>
        </div>
        <div class="q-int-side" data-ring></div>
      </div>
      <div class="q-chat" data-chat hidden>
        ${isEstimate ? '<input class="q-chat-input" data-chat-input inputmode="decimal" placeholder="Number from the chat + Enter" aria-label="Add a number read in the chat">' : '<span class="q-small">Click an option to add a vote from the chat.</span>'}
        <button type="button" class="q-btn" data-do="chatUndo">Undo last chat vote</button>
      </div>
      ${controls([['open', 'Open voting', true], ['close', 'Close voting', true], ['reveal', 'Reveal', true], ['reopen', 'Reopen'], ['reset', 'Start over']])}
    </div>`;

  let c = ctx;
  let requested = null;
  const st = () => (c.view.interaction && c.view.interaction.id === spec.id ? c.view.interaction : { phase: 0, total: 0, counts: {}, mean: null, values: [] });
  const max = kind.maxPhase(spec);
  const phase = (p) => {
    requested = { p, at: Date.now() };
    return c.act({ type: 'control', id: spec.id, action: 'phase', phase: p });
  };
  // Two quick presses: the second one already counts the first.
  const currentPhase = () => {
    const p = st().phase;
    return requested && Date.now() - requested.at < 3000 && requested.p > p ? requested.p : p;
  };
  const actions = {
    open: () => phase(1),
    close: () => phase(2),
    reveal: () => phase(3),
    reopen: () => { requested = null; return phase(1); },
    reset: () => { requested = null; return c.act({ type: 'control', id: spec.id, action: 'reset' }); },
    chatUndo: () => c.act({ type: 'chatUndo' }),
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]');
    if (b && actions[b.dataset.do]) {
      e.stopPropagation();
      actions[b.dataset.do]();
      return;
    }
    const row = e.target.closest('.q-bar.clickable');
    if (row && c.chatMode && st().phase === 1) {
      e.stopPropagation();
      const o = row.dataset.option;
      c.act({ type: 'chatVote', id: spec.id, value: spec.kind === 'multi' ? [o] : o });
    }
  });
  const chatInput = el.querySelector('[data-chat-input]');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && chatInput.value.trim()) {
        c.act({ type: 'chatVote', id: spec.id, value: chatInput.value.trim() });
        chatInput.value = '';
      }
    });
  }

  const paint = () => {
    const s = st();
    const p = s.phase;
    el.querySelector('[data-hint]').textContent = p >= 2
      ? `${s.total} ${s.total === 1 ? 'answer' : 'answers'}.`
      : instructions(c, p === 1, { poll: 'Tap one option on your phone.', multi: 'Pick all that apply on your phone.', estimate: 'Type your guess on your phone.' }[spec.kind]);
    if (isEstimate) {
      const has = p >= 2 && s.total > 0;
      el.querySelector('[data-before]').hidden = has;
      el.querySelector('[data-after]').hidden = !has;
      if (has) {
        const digits = spec.year ? 0 : (Math.abs(s.mean) < 10 ? 2 : 0);
        el.querySelector('[data-mean]').textContent = formatNumber(s.mean, { year: spec.year, digits });
        el.querySelector('[data-median]').textContent = `Median: ${formatNumber(s.median, { year: spec.year, digits })}`;
        el.querySelector('[data-answer]').hidden = p < 3;
        el.querySelector('[data-answer-value]').textContent = spec.answerLabel || `${formatNumber(spec.answer, { year: spec.year, digits: 2 })}${spec.unit ? ` ${spec.unit}` : ''}`;
        el.querySelector('[data-strip]').innerHTML = strip(spec, s, p >= 3);
      }
    } else {
      setBars(el, spec.options, s.counts || {}, s.total, { show: p >= 1, correct: p >= 3 && spec.answer !== undefined ? spec.answer : null });
    }
    el.querySelector('[data-reveal]').hidden = p < 3 || !spec.reveal;
    el.querySelector('[data-ring]').innerHTML = ring(s.total, c.view.connected, s.total === 1 ? 'answer' : 'answers');
    el.querySelector('[data-chat]').hidden = !(c.chatMode && p === 1);
    el.classList.toggle('chat-clickable', c.chatMode && p === 1 && !isEstimate);
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
      const p = currentPhase();
      if (p >= max) return false;
      phase(p + 1);
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
          ${barsHtml(spec.options, { clickable: true })}
        </div>
        <div class="q-int-side" data-ring></div>
      </div>
      <div class="q-chat" data-chat hidden><span class="q-small">Click an option to add a vote from the chat.</span><button type="button" class="q-btn" data-do="chatUndo">Undo last chat vote</button></div>
      ${controls([['open', 'Open voting', true], ['close', 'Close voting', true], ['next', 'Next round', true], ['previous', 'Previous round'], ['reset', 'Start over']])}
    </div>`;
  let c = ctx;
  const st = () => (c.view.interaction && c.view.interaction.id === spec.id ? c.view.interaction : { index: 0, open: false, done: false, total: 0, counts: {}, rounds: spec.items.length, item: spec.items[0] });
  const act = (action) => c.act({ type: 'control', id: spec.id, action });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]');
    if (b) {
      e.stopPropagation();
      if (b.dataset.do === 'chatUndo') c.act({ type: 'chatUndo' });
      else act(b.dataset.do);
      return;
    }
    const row = e.target.closest('.q-bar.clickable');
    if (row && c.chatMode && st().open) {
      e.stopPropagation();
      c.act({ type: 'chatVote', id: spec.id, value: row.dataset.option });
    }
  });
  const paint = () => {
    const s = st();
    el.querySelector('[data-counter]').textContent = `Round ${s.index + 1} of ${s.rounds}`;
    el.querySelector('[data-item]').textContent = s.item;
    el.querySelector('[data-hint]').textContent = s.done ? `${s.total} ${s.total === 1 ? 'vote' : 'votes'}.` : instructions(c, s.open, 'Vote on your phone.');
    setBars(el, spec.options, s.counts, s.total, { show: s.open || s.done });
    el.querySelector('[data-ring]').innerHTML = ring(s.total, c.view.connected, s.total === 1 ? 'vote' : 'votes');
    el.querySelector('[data-chat]').hidden = !(c.chatMode && s.open);
    el.classList.toggle('chat-clickable', c.chatMode && s.open);
    const show = (name, yes) => { el.querySelector(`[data-do="${name}"]`).hidden = !yes; };
    show('open', !s.open);
    show('close', s.open);
    show('next', !s.open && s.done && s.index < s.rounds - 1);
    show('previous', !s.open && s.index > 0);
    show('reset', !s.open && (s.done || s.index > 0));
  };
  paint();
  let last = null;
  return {
    update(next) { c = next; paint(); },
    primary() {
      const s = st();
      const kindState = { index: s.index, open: s.open, results: s.done ? { [s.index]: true } : {} };
      const p = KINDS.rounds.primary(spec, kindState);
      if (!p) return false;
      // Ignore a second press before the first one comes back.
      const key = `${p.action}-${s.index}-${s.open}`;
      if (last && last.key === key && Date.now() - last.at < 1500) return true;
      last = { key, at: Date.now() };
      act(p.action);
      return true;
    },
  };
}

// --- sentence: written one word at a time ------------------------------------

function sentence(el, spec, ctx) {
  el.innerHTML = `
    <div class="q-int q-sentence">
      <p class="q-sentence-text" data-text></p>
      <p class="q-hint" data-hint></p>
      <div class="q-int-body">
        <div class="q-int-main" data-bars></div>
        <div class="q-int-side" data-ring></div>
      </div>
      <div class="q-chat" data-chat hidden><span class="q-small">Click a word to add a vote from the chat.</span><button type="button" class="q-btn" data-do="chatUndo">Undo last chat vote</button></div>
      ${controls([['open', 'Open voting', true], ['close', 'Pick the most voted', true], ['draw', 'Draw by votes'], ['undo', 'Undo word'], ['reset', 'Start over']])}
    </div>`;
  let c = ctx;
  let shownOptions = '';
  const st = () => (c.view.interaction && c.view.interaction.id === spec.id ? c.view.interaction
    : { words: [], options: sentenceOptions(spec, []), counts: {}, total: 0, open: false, finished: false });
  const act = (action, extra = {}) => c.act({ type: 'control', id: spec.id, action, ...extra });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]');
    if (b) {
      e.stopPropagation();
      if (b.dataset.do === 'chatUndo') c.act({ type: 'chatUndo' });
      else act(b.dataset.do);
      return;
    }
    const row = e.target.closest('.q-bar.clickable');
    if (!row) return;
    e.stopPropagation();
    // In chat mode a click adds a vote; otherwise it picks that word.
    if (c.chatMode && st().open) c.act({ type: 'chatVote', id: spec.id, value: row.dataset.option });
    else act('fix', { word: row.dataset.option });
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
      el.querySelector('[data-bars]').innerHTML = s.options.length ? barsHtml(s.options, { clickable: true }) : '<p class="q-small">The sentence is finished.</p>';
    }
    if (s.options.length) setBars(el, s.options, s.counts, s.total, { show: s.open || s.total > 0 });
    el.querySelector('[data-hint]').textContent = s.finished ? '' : instructions(c, s.open, 'Vote for the next word on your phone.');
    el.querySelector('[data-ring]').innerHTML = s.finished ? '' : ring(s.total, c.view.connected, s.total === 1 ? 'vote' : 'votes');
    el.querySelector('[data-chat]').hidden = !(c.chatMode && s.open);
    el.classList.toggle('chat-clickable', true);
    const show = (name, yes) => { el.querySelector(`[data-do="${name}"]`).hidden = !yes; };
    show('open', !s.open && !s.finished);
    show('close', s.open);
    show('draw', !s.finished && (s.open || s.total > 0));
    show('undo', !s.open && s.words.length > 0);
    show('reset', !s.open && s.words.length > 0);
  };
  paint();
  let last = null;
  return {
    update(next) { c = next; paint(); },
    primary() {
      const s = st();
      if (s.finished) return false;
      const action = s.open ? 'close' : 'open';
      const key = `${action}-${s.words.length}`;
      if (last && last.key === key && Date.now() - last.at < 1500) return true;
      last = { key, at: Date.now() };
      act(action);
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
    list = list.slice(0, 6);
    const pending = v.pendingQuestions || 0;
    const total = (v.questions || []).length + pending;
    el.querySelector('[data-hint]').textContent = c.chatMode
      ? 'Ask in the chat.'
      : `Ask from your phone, anonymously${spec.mode === 'top' ? ', and vote for the ones you want answered' : ''}.${total ? ` ${total} received${pending ? `, ${pending} waiting` : ''}.` : ''}`;
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
      <span class="q-chat" data-chat hidden>
        <input class="q-chat-input" data-chat-input placeholder="Answer from the chat + Enter" aria-label="Add an answer read in the chat">
        <button type="button" class="q-btn" data-do="chatUndo">Undo</button>
      </span>
      ${controls([['open', 'Open', true], ['close', 'Close', true], ['reopen', 'Reopen'], ['reset', 'Start over']])}
    </div>`;
  let c = ctx;
  let requested = null;
  const st = () => (c.view.interaction && c.view.interaction.id === spec.id ? c.view.interaction : { phase: 0, total: 0 });
  const phase = (p) => {
    requested = { p, at: Date.now() };
    return c.act({ type: 'control', id: spec.id, action: 'phase', phase: p });
  };
  const currentPhase = () => {
    const p = st().phase;
    return requested && Date.now() - requested.at < 3000 && requested.p > p ? requested.p : p;
  };
  const actions = {
    open: () => phase(1),
    close: () => phase(2),
    reopen: () => { requested = null; return phase(1); },
    reset: () => { requested = null; return c.act({ type: 'control', id: spec.id, action: 'reset' }); },
    chatUndo: () => c.act({ type: 'chatUndo' }),
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]');
    if (b && actions[b.dataset.do]) {
      e.stopPropagation();
      actions[b.dataset.do]();
    }
  });
  const chatInput = el.querySelector('[data-chat-input]');
  chatInput.addEventListener('keydown', async (e) => {
    e.stopPropagation();
    if (e.key !== 'Enter' || !chatInput.value.trim()) return;
    const value = spec.input === 'choices' ? [chatInput.value.trim()] : chatInput.value.trim();
    const r = await c.act({ type: 'chatVote', id: spec.id, value });
    if (r && r.ok) chatInput.value = '';
  });
  const paint = (next) => {
    c = next;
    const s = st();
    const n = `${s.total} ${s.total === 1 ? 'answer' : 'answers'}`;
    const how = c.chatMode ? 'Answer in the chat' : 'Answer on your phone';
    el.querySelector('[data-status]').textContent = [
      c.chatMode ? 'Answers will be read from the chat.' : 'Get your phone ready.',
      `${how} · ${n}`,
      `Closed · ${n}`,
    ][s.phase] || '';
    const show = (name, yes) => { el.querySelector(`[data-do="${name}"]`).hidden = !yes; };
    show('open', s.phase === 0);
    show('close', s.phase === 1);
    show('reopen', s.phase === 2);
    show('reset', s.phase > 0);
    el.querySelector('[data-chat]').hidden = !(c.chatMode && s.phase === 1);
  };
  paint(ctx);
  return {
    update: paint,
    primary() {
      const p = currentPhase();
      if (p >= 2) return false;
      phase(p + 1);
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
    const url = c.chatMode ? '' : c.view.publicUrl || (c.rehearse ? location.origin : '');
    if (url !== shown) {
      shown = url;
      el.querySelector('[data-qr]').innerHTML = url ? qrSvg(url, { label: 'Scan to join' }) : '';
      el.querySelector('[data-url]').textContent = c.chatMode ? 'Today we take part through the chat.' : url.replace(/^https?:\/\//, '') || 'The link will appear here.';
    }
    el.querySelector('[data-people]').textContent = c.view.connected || 0;
  };
  paint(ctx);
  return { update: paint, primary: () => false };
}

export { readNumber };
