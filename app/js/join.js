// The audience app: what a phone shows after scanning the QR code.
// No sign-up, no names: each phone gets a random id kept in the browser.

import { applyBrand, logoHtml } from './brand.js';
import { connect, deviceId, esc, send } from './net.js';
import { morph } from './morph.js';

const DEVICE = deviceId();
const main = document.querySelector('[data-main]');
const statusEl = document.querySelector('[data-status]');
const askButton = document.querySelector('[data-open-ask]');
const dialog = document.querySelector('[data-ask-dialog]');

let view = null;
let mountedKey = '';
let picked = new Set(); // "multi" choices not sent yet
let messages = {};

function setMessage(where, text, bad = false) {
  messages[where] = { text, bad };
  const el = document.querySelector(`[data-message="${where}"]`);
  if (el) {
    el.textContent = text;
    el.classList.toggle('bad', bad);
  }
}

async function act(action, where, success) {
  const r = await send(action, { device: DEVICE });
  if (r.view) {
    view = r.view;
    render();
  }
  if (r.ok) {
    if (success) setMessage(where, success);
    if (navigator.vibrate) navigator.vibrate(12);
  } else {
    setMessage(where, r.error || 'Something went wrong.', true);
  }
  return r.ok;
}

// Which screen to show. When the key changes, the screen is rebuilt;
// otherwise it is patched in place.
function screenKey(v) {
  const i = v.interaction;
  if (v.slideKind === 'questions') return 'questions';
  if (!i) return 'wait';
  const s = i.summary || {};
  if (i.spec.kind === 'sentence') {
    if (i.canVote) return `sentence-${s.round}`;
    return s.words.length || s.finished ? 'sentence-wait' : 'ready';
  }
  if (i.spec.kind === 'rounds') {
    if (i.canVote) return `rounds-${s.index}`;
    return s.done ? `rounds-wait-${s.index}` : 'ready';
  }
  if (i.canVote) return `vote-${i.spec.id}`;
  if (!s.phase) return 'ready';
  return `closed-${i.spec.id}-${s.phase}`;
}

function needsAction(v) {
  return !!v.interaction && v.interaction.canVote;
}

function format(v) {
  if (typeof v === 'number') return v.toLocaleString('en');
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function questionsHtml(v) {
  const list = v.questions.filter((q) => !q.answered);
  return list.length ? `<ul class="j-questions">${list.map((q) => `
    <li class="${q.pending ? 'pending' : ''}">
      <span>${esc(q.text)}${q.pending ? '<small>Waiting for the speaker to approve it.</small>' : ''}</span>
      ${q.pending || q.mine ? `<b class="j-count">${q.votes}</b>` : `<button type="button" class="j-up${q.voted ? ' on' : ''}" data-up="${esc(q.id)}" aria-pressed="${q.voted}" aria-label="Vote for this question">▲ ${q.votes}</button>`}
    </li>`).join('')}</ul>` : '<p class="j-muted">No questions yet.</p>';
}

function askForm(id = 'ask') {
  return `<form class="j-ask" data-ask-form="${id}">
    <textarea maxlength="140" rows="3" placeholder="Your question (anonymous)" data-ask-text></textarea>
    <button type="submit" class="j-button">Send question</button>
    <p class="j-message" data-message="${id}" role="status"></p>
  </form>`;
}

function build(key, v) {
  const i = v.interaction;
  if (key === 'ready') {
    return '<div class="j-center"><div class="j-dot"></div><h1>Get ready</h1><p class="j-muted">A question is coming. It will appear here.</p></div>';
  }
  if (key === 'wait') {
    return '<div class="j-center"><div class="j-dot"></div><h1>You are in</h1><p class="j-muted">Look at the screen. When there is something to answer, it will appear here.</p></div>';
  }
  if (key === 'questions') {
    return `<h1>Questions</h1>${askForm('ask-inline')}<h2>Vote for the ones you want answered</h2><div data-list></div>`;
  }
  const spec = i.spec;
  const look = spec.kind === 'input' ? { text: 'text', number: 'estimate', choice: 'poll', choices: 'multi' }[spec.input] : spec.kind;
  if (key.startsWith('closed-') || key.startsWith('rounds-wait') || key === 'sentence-wait') {
    return `<div class="j-center"><h1>Look at the screen</h1><p class="j-muted" data-result></p></div>`;
  }
  if (look === 'poll') {
    return `<p class="j-label">${spec.kind === 'input' ? 'Pick one' : 'Vote'}</p><h1>${esc(spec.title)}</h1>
      <div class="j-options">${spec.options.map((o) => `<button type="button" class="j-option" data-one="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <p class="j-message" data-message="vote" role="status"></p>`;
  }
  if (look === 'multi') {
    picked = new Set(Array.isArray(i.mine) ? i.mine : []);
    return `<p class="j-label">Pick all that apply</p><h1>${esc(spec.title)}</h1>
      <div class="j-options">${spec.options.map((o) => `<button type="button" class="j-option j-check" data-toggle="${esc(o)}"><span class="j-box" aria-hidden="true"></span>${esc(o)}</button>`).join('')}</div>
      <button type="button" class="j-button" data-send-multi>Send</button>
      <p class="j-message" data-message="vote" role="status"></p>`;
  }
  if (look === 'estimate') {
    return `<p class="j-label">${spec.kind === 'input' ? 'A number' : 'Your guess'}</p><h1>${esc(spec.title)}</h1>
      <input class="j-number" type="text" inputmode="decimal" autocomplete="off" data-number
        value="${i.mine === null ? '' : esc(String(i.mine))}" aria-label="Your number">
      <button type="button" class="j-button" data-send-number>Send</button>
      <p class="j-message" data-message="vote" role="status"></p>`;
  }
  if (look === 'text') {
    return `<p class="j-label">Your answer</p><h1>${esc(spec.title || 'Write your answer')}</h1>
      <input class="j-number j-text" type="text" autocomplete="off" maxlength="${spec.length}" data-number
        value="${i.mine === null ? '' : esc(String(i.mine))}" aria-label="Your answer">
      <button type="button" class="j-button" data-send-number>Send</button>
      <p class="j-message" data-message="vote" role="status"></p>`;
  }
  if (spec.kind === 'rounds') {
    const s = i.summary;
    return `<p class="j-label">Round ${s.index + 1} of ${s.rounds}</p><h1>${esc(s.item)}</h1><p class="j-muted">${esc(spec.title)}</p>
      <div class="j-options">${spec.options.map((o) => `<button type="button" class="j-option" data-one="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <p class="j-message" data-message="vote" role="status"></p>`;
  }
  if (spec.kind === 'sentence') {
    const s = i.summary;
    return `<p class="j-label">You are the language model</p>
      <p class="j-sentence">${esc(spec.start)} ${s.words.map((w) => `<b>${esc(w.text)}</b>`).join(' ')} <span class="j-blank"></span></p>
      <h2>Pick the next word</h2>
      <div class="j-options j-words">${s.options.map((o) => `<button type="button" class="j-option" data-one="${esc(o)}">${esc(o === '.' ? '. (end)' : o)}</button>`).join('')}</div>
      <p class="j-message" data-message="vote" role="status"></p>`;
  }
  return '<div class="j-center"><h1>Look at the screen</h1></div>';
}

function update(key, v) {
  const i = v.interaction;
  main.querySelectorAll('[data-one]').forEach((b) => {
    const on = i && i.mine === b.dataset.one;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  main.querySelectorAll('[data-toggle]').forEach((b) => {
    const on = picked.has(b.dataset.toggle);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  const sendMulti = main.querySelector('[data-send-multi]');
  if (sendMulti) sendMulti.textContent = i && i.mine ? 'Update my answer' : 'Send';
  const result = main.querySelector('[data-result]');
  if (result && i) {
    const spec = i.spec;
    const parts = [];
    if (i.mine !== null && i.mine !== undefined) parts.push(`Your answer: ${format(i.mine)}.`);
    if (spec.answer !== undefined) parts.push(`Answer: ${spec.answerLabel || format(spec.answer)}.`);
    result.textContent = parts.join(' ');
  }
  const list = main.querySelector('[data-list]');
  if (list) morph(list, questionsHtml(v));
  Object.entries(messages).forEach(([where, m]) => {
    const el = document.querySelector(`[data-message="${where}"]`);
    if (el && !el.textContent) {
      el.textContent = m.text;
      el.classList.toggle('bad', m.bad);
    }
  });
}

function render() {
  if (!view) return;
  const key = screenKey(view);
  if (key !== mountedKey) {
    mountedKey = key;
    messages = {};
    main.innerHTML = build(key, view);
    const input = main.querySelector('[data-number]');
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') main.querySelector('[data-send-number]').click(); });
  }
  update(key, view);
  document.body.classList.toggle('j-your-turn', needsAction(view));
  askButton.hidden = key === 'questions';
}

main.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !view) return;
  const i = view.interaction;
  if (b.dataset.one !== undefined && i) {
    await act({ type: 'vote', id: i.spec.id, value: b.dataset.one }, 'vote', 'Sent. You can change it while voting is open.');
  } else if (b.dataset.toggle !== undefined) {
    const o = b.dataset.toggle;
    if (picked.has(o)) picked.delete(o);
    else picked.add(o);
    update(mountedKey, view);
  } else if (b.hasAttribute('data-send-multi') && i) {
    if (!picked.size) {
      setMessage('vote', 'Pick at least one option.', true);
      return;
    }
    await act({ type: 'vote', id: i.spec.id, value: [...picked] }, 'vote', 'Sent. You can change it while voting is open.');
  } else if (b.hasAttribute('data-send-number') && i) {
    const input = main.querySelector('[data-number]');
    const ok = await act({ type: 'vote', id: i.spec.id, value: input.value.trim() }, 'vote', 'Sent. You can change it while voting is open.');
    if (ok) input.blur();
  } else if (b.dataset.up) {
    await act({ type: 'upvote', id: b.dataset.up }, 'ask-inline');
  }
});

async function submitAsk(form) {
  const text = form.querySelector('[data-ask-text]');
  const where = form.dataset.askForm;
  if (!text.value.trim()) {
    setMessage(where, 'Write your question first.', true);
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  const r = await send({ type: 'ask', text: text.value }, { device: DEVICE });
  button.disabled = false;
  if (r.ok) {
    text.value = '';
    setMessage(where, r.pending ? 'Sent. It will appear once the speaker approves it.' : 'Sent.');
    if (r.view) {
      view = r.view;
      render();
    }
  } else {
    setMessage(where, r.error || 'Could not send it.', true);
  }
}

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-ask-form]');
  if (!form) return;
  e.preventDefault();
  submitAsk(form);
});

askButton.addEventListener('click', () => {
  dialog.hidden = false;
  dialog.querySelector('textarea').focus();
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog || e.target.closest('[data-close-ask]')) dialog.hidden = true;
});

async function start() {
  try {
    const r = await fetch('/api/talk', { cache: 'no-store' });
    const t = await r.json();
    applyBrand(t.meta);
    document.title = t.meta.title;
    document.querySelector('[data-logo]').innerHTML = logoHtml(t.meta);
    document.querySelector('[data-title]').textContent = t.meta.title;
  } catch {
    // The title and branding are only decoration.
  }
  send({ type: 'join' }, { device: DEVICE });
  connect({
    role: 'audience',
    device: DEVICE,
    onChange: (v) => {
      view = v;
      render();
    },
    onStatus: (s) => {
      statusEl.textContent = { connected: 'Connected', reconnecting: 'Reconnecting…', offline: 'No connection' }[s] || '';
      statusEl.dataset.state = s;
    },
  });
}

start();
