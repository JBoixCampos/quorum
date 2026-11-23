// The presenter's panel. Keep it in front and share the presentation
// window: the preview is the presentation itself, so every click on it
// also happens on the shared screen.

import { connect, esc, send } from './net.js';

const params = new URLSearchParams(location.search);
const KEY = params.get('key') || '';
const $ = (s) => document.querySelector(s);

let talk = null;
let view = null;
let publicOk = null;

const preview = $('[data-preview]');
const thumbs = [...document.querySelectorAll('[data-thumb]')].map((figure) => ({
  figure,
  frame: figure.querySelector('iframe'),
  label: figure.querySelector('figcaption span'),
  index: null,
}));

const act = (action) => send(action, { key: KEY });
const presentUrl = (extra) => `/present?key=${encodeURIComponent(KEY)}&${extra}`;

async function loadTalk() {
  const r = await fetch(`/api/talk?key=${encodeURIComponent(KEY)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 403 ? 'Wrong presenter key.' : 'Could not load the talk.');
  talk = await r.json();
  document.documentElement.style.setProperty('--accent', talk.meta.accent);
  document.title = `Panel · ${talk.meta.title}`;
}

// Moving through the preview runs the same logic as the shared window
// (an open vote is closed before moving on, and so on).
function move(delta) {
  const q = preview.contentWindow && preview.contentWindow.quorum;
  if (q) {
    if (delta > 0) q.next();
    else q.previous();
  }
}

function sections() {
  const list = [];
  talk.slides.forEach((s, i) => {
    if (s.section) list.push({ ...s.section, start: i });
  });
  return list;
}

function paintSections() {
  const list = sections();
  const ol = $('[data-sections]');
  if (!list.length) {
    ol.hidden = true;
    return;
  }
  ol.hidden = false;
  const current = list.filter((s) => s.start <= view.stage.slide).pop();
  ol.innerHTML = list.map((s, k) => `<li class="${s === current ? 'current' : ''}"><button type="button" data-section="${s.start}" title="${s.minutes ? `${s.minutes} min` : ''}">${k + 1}. ${esc(s.name)}</button></li>`).join('');
}

// Elapsed time against the plan: sections with minutes, or the duration.
function paintClock() {
  const clock = $('[data-clock]');
  const pace = $('[data-pace]');
  if (!view || !view.startedAt) {
    clock.textContent = '0:00';
    pace.textContent = talk && talk.meta.duration ? `${talk.meta.duration} min planned` : '';
    return;
  }
  const minutes = (Date.now() - view.startedAt) / 60000;
  clock.textContent = `${Math.floor(minutes)}:${String(Math.floor((minutes % 1) * 60)).padStart(2, '0')}`;
  const list = sections();
  let planned = null;
  if (list.length && list.every((s) => s.minutes)) {
    const current = list.filter((s) => s.start <= view.stage.slide).pop();
    planned = current ? list.slice(0, list.indexOf(current)).reduce((a, s) => a + s.minutes, 0) : 0;
  }
  if (planned === null) {
    pace.textContent = talk.meta.duration ? `of ${talk.meta.duration} min` : '';
    pace.className = talk.meta.duration && minutes > talk.meta.duration ? 'late' : '';
    return;
  }
  const diff = Math.round(minutes - planned);
  pace.textContent = diff > 1 ? `${diff} min behind plan` : (diff < -1 ? `${-diff} min ahead` : 'on time');
  pace.className = diff > 2 ? 'late' : '';
}

function paintThumbs() {
  thumbs.forEach((t, k) => {
    const index = view.stage.slide + k;
    const slide = talk.slides[index];
    if (!slide) {
      t.figure.classList.add('empty');
      t.label.textContent = 'end of the talk';
      t.index = null;
      return;
    }
    t.figure.classList.remove('empty');
    t.label.textContent = slide.title;
    if (t.index === index) return;
    t.index = index;
    const q = t.frame.contentWindow && t.frame.contentWindow.quorum;
    if (t.frame.src && q && q.show) q.show(index);
    else t.frame.src = presentUrl(`view=still&slide=${index}`);
  });
}

function paintInteraction() {
  const box = $('[data-int-box]');
  const slide = talk.slides[view.stage.slide];
  const spec = slide && slide.interaction;
  const s = view.interaction;
  box.hidden = !spec || spec.kind === 'questions';
  if (box.hidden || !s) return;
  $('[data-int-title]').textContent = spec.title || spec.kind;
  let text = '';
  if (spec.kind === 'sentence') {
    text = s.finished ? 'The sentence is finished.' : `${s.open ? 'Voting open' : 'Voting closed'}: ${s.total} of ${view.connected} voted. ${s.options.map((o) => `${o} ${s.counts[o] || 0}`).join(' · ')}`;
  } else if (spec.kind === 'rounds') {
    text = `Round ${s.index + 1} of ${s.rounds}, ${s.open ? 'open' : (s.done ? 'closed' : 'not opened yet')}: ${s.total} votes. ${spec.options.map((o) => `${o} ${s.counts[o] || 0}`).join(' · ')}`;
  } else {
    const phase = ['Not opened yet', 'Voting open', 'Voting closed', 'Answer revealed'][s.phase];
    text = `${phase}: ${s.total} of ${view.connected} answered.`;
    if (spec.kind === 'estimate' && s.mean !== null) text += ` Average ${Math.round(s.mean * 100) / 100}.`;
    else if (s.counts) text += ` ${spec.options.map((o) => `${o} ${s.counts[o] || 0}`).join(' · ')}`;
  }
  $('[data-int-status]').textContent = `${text} Press → or use the buttons on the preview.`;
}

function paintQuestions() {
  const qs = view.allQuestions || [];
  const pending = qs.filter((q) => q.status === 'pending').length;
  $('[data-pending]').textContent = pending || '';
  const order = { pending: 0, approved: 1, hidden: 2 };
  const list = [...qs].sort((a, b) => order[a.status] - order[b.status] || b.votes - a.votes || b.created - a.created);
  $('[data-moderation]').innerHTML = list.length ? list.map((q) => `
    <li class="${q.status === 'pending' ? 'pending' : ''}${q.status === 'hidden' ? ' hidden-q' : ''}">
      <span class="text">${esc(q.text)}<span class="meta">${q.status}${q.status === 'approved' ? ` · ${q.votes} votes` : ''}${q.answered ? ' · answered' : ''}</span></span>
      <span class="mini">
        ${q.status !== 'approved' ? `<button type="button" data-mod="${esc(q.id)}" data-status="approved">Approve</button>` : ''}
        ${q.status !== 'hidden' ? `<button type="button" data-mod="${esc(q.id)}" data-status="hidden">Hide</button>` : ''}
        ${q.answered ? `<button type="button" data-answered="${esc(q.id)}">Reopen</button>` : ''}
      </span>
    </li>`).join('') : '<li class="p-muted" style="background:none">Nothing yet.</li>';
}

async function checkPublic() {
  const el = $('[data-public]');
  const url = view && view.publicUrl;
  if (!url) {
    el.textContent = 'No public link';
    el.className = '';
    return;
  }
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/api/health?_=${Date.now()}`, { cache: 'no-store' });
    publicOk = r.ok;
  } catch {
    publicOk = false;
  }
  el.textContent = publicOk ? 'Public link works' : 'Public link NOT responding';
  el.className = publicOk ? 'good' : 'bad';
}

function paint() {
  if (!talk || !view) return;
  const i = Math.min(view.stage.slide, talk.slides.length - 1);
  const slide = talk.slides[i];
  $('[data-slide-title]').textContent = `${i + 1}. ${slide.title}`;
  $('[data-step]').textContent = slide.steps > 1 ? `Step ${view.stage.step + 1} of ${slide.steps}` : '';
  const next = talk.slides[i + 1];
  $('[data-next]').textContent = next ? `Next: ${next.title}` : 'Last slide';
  $('[data-notes]').textContent = slide.notes || '';
  $('[data-people]').textContent = `${view.connected} ${view.connected === 1 ? 'person' : 'people'} connected`;
  const urlInput = $('[data-url]');
  if (document.activeElement !== urlInput) urlInput.value = view.publicUrl || '';
  paintSections();
  paintThumbs();
  paintInteraction();
  paintQuestions();
  paintClock();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.go) move(Number(b.dataset.go));
  else if (b.dataset.section) {
    const q = preview.contentWindow && preview.contentWindow.quorum;
    if (q) q.go(Number(b.dataset.section), 0);
  } else if (b.dataset.mod) act({ type: 'moderate', id: b.dataset.mod, status: b.dataset.status });
  else if (b.dataset.answered) act({ type: 'answered', id: b.dataset.answered });
  else if (b.hasAttribute('data-approve-all')) act({ type: 'approveAll' });
  else if (b.hasAttribute('data-reset')) {
    // A deliberate second click instead of a browser dialog.
    if (b.dataset.armed) {
      act({ type: 'resetAll' });
      b.textContent = 'Reset everything';
      delete b.dataset.armed;
    } else {
      b.dataset.armed = '1';
      b.textContent = 'Click again to confirm';
      setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset everything'; }, 4000);
    }
  }
});

$('[data-url-form]').addEventListener('submit', (e) => {
  e.preventDefault();
  act({ type: 'url', url: $('[data-url]').value.trim() });
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); move(1); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); move(-1); }
});

async function start() {
  try {
    await loadTalk();
  } catch (error) {
    document.body.innerHTML = `<p style="padding:24px">${esc(error.message)}</p>`;
    return;
  }
  preview.src = presentUrl('view=panel');
  connect({
    role: 'panel',
    key: KEY,
    onChange: async (v) => {
      const urlChanged = !view || v.publicUrl !== view.publicUrl;
      if (talk && v.talkVersion !== talk.version) {
        await loadTalk().catch(() => {});
        thumbs.forEach((t) => { t.index = null; t.frame.removeAttribute('src'); });
      }
      view = v;
      paint();
      if (urlChanged) checkPublic();
    },
    onStatus: (s) => {
      const el = $('[data-conn]');
      el.textContent = { connected: 'Server connected', reconnecting: 'Reconnecting…', offline: 'Server not responding' }[s];
      el.className = s === 'connected' ? 'good' : 'bad';
    },
  });
  setInterval(paintClock, 1000);
  setInterval(checkPublic, 20000);
}

start();
