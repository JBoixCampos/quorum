// Example component: explore how a language model picks its next word,
// with a model running on your own laptop.
//
// It is not part of Quorum: it shows how far a component can go. Copy it
// into your talk's components/ folder and use it in talk.md:
//
//   ::: component next-word-explorer
//   text: The capital of France is
//   model: http://127.0.0.1:8081
//   :::
//
// It needs a llama.cpp server running a small model, for example:
//
//   llama-server -hf bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M --port 8081
//
// Without one, "model: sample" uses a small table of made-up probabilities,
// so you can try the component (the website does). It says so on the slide.
//
// Only the presenter's screen talks to the model (phones never do). What is
// shown is kept in shared state, so the window you share and the preview in
// your panel always show the same thing.

const ROWS = 10;

function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Reads the top candidates from a llama.cpp /completion answer (old and new formats).
function candidates(json) {
  const first = (json.completion_probabilities || [])[0] || {};
  const raw = first.top_probs || first.top_logprobs || first.probs || [];
  return raw.map((c) => ({
    text: c.token ?? c.tok_str ?? '',
    p: c.prob ?? (c.logprob !== undefined ? Math.exp(c.logprob) : 0),
  })).filter((c) => c.text !== '');
}

// "model: sample": invented probabilities for a few contexts, by the last
// word of the text. Enough to show how the component works, not a model.
const SAMPLE = {
  is: [[' Paris', 62], [' a', 8], [' the', 6], [' located', 5], [' known', 4], [' also', 4], [' not', 3], [' one', 3], [' home', 3], [' called', 2]],
  paris: [['.', 48], [',', 30], [' and', 6], [' which', 4], [' (', 3], [' since', 3], [' with', 2], [' but', 2], [' in', 1], [' as', 1]],
  '.': [[' It', 34], [' The', 22], [' Paris', 12], ['\n', 9], [' This', 7], [' France', 6], [' Its', 4], [' A', 3], [' In', 2], [' However', 1]],
  ',': [[' which', 30], [' and', 22], [' a', 14], [' the', 10], [' known', 8], [' home', 6], [' located', 4], [' with', 3], [' also', 2], [' but', 1]],
  it: [[' is', 52], [' has', 14], [' was', 10], [' became', 7], [' sits', 5], [' lies', 4], [' hosts', 3], [' remains', 2], [' stands', 2], [' also', 1]],
  the: [[' city', 28], [' capital', 20], [' largest', 14], [' country', 10], [' most', 8], [' river', 6], [' Eiffel', 6], [' French', 4], [' home', 2], [' world', 2]],
  a: [[' city', 30], [' major', 16], [' global', 12], [' popular', 10], [' beautiful', 9], [' center', 8], [' place', 6], [' river', 4], [' small', 3], [' famous', 2]],
};
const SAMPLE_ANY = [[' the', 22], [' and', 18], [' of', 14], [' a', 12], [' in', 10], ['.', 8], [',', 6], [' city', 4], [' to', 4], [' is', 2]];

function sampleWords(text) {
  const last = (text.trim().match(/([\w']+|[^\w\s])$/) || [''])[0].toLowerCase();
  return (SAMPLE[last] || SAMPLE_ANY).map(([word, p]) => ({ text: word, p: p / 100 }));
}

async function nextWords(model, text) {
  if (model === 'sample') return sampleWords(text);
  const r = await fetch(`${model.replace(/\/$/, '')}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: text, n_predict: 1, n_probs: ROWS, temperature: 1, top_k: 0, top_p: 1, min_p: 0, cache_prompt: true,
    }),
  });
  if (!r.ok) throw new Error(`The model answered ${r.status}`);
  return candidates(await r.json()).slice(0, ROWS);
}

// With temperature t, probabilities are re-weighted as p^(1/t).
function withTemperature(top, t) {
  if (Math.abs(t - 1) < 1e-9) return top.map((c) => ({ ...c, q: c.p }));
  const w = top.map((c) => Math.max(c.p, 1e-9) ** (1 / t));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return top.map((c, i) => ({ ...c, q: w[i] / sum }));
}

export default {
  mount(el, ctx) {
    const model = ctx.params.model || 'http://127.0.0.1:8081';
    const startText = ctx.params.text || ctx.text || 'Once upon a time';
    el.innerHTML = `
      <div class="nwe" data-no-advance style="display:grid;grid-template-columns:minmax(0,1fr) 900px;gap:56px;align-items:center;width:100%">
        <div>
          <p data-sentence style="font:700 60px/1.3 var(--font-display);margin:0 0 24px"></p>
          <p data-status class="q-small"></p>
        </div>
        <div data-rows style="display:grid;gap:8px"></div>
      </div>
      <div class="q-controls" data-no-advance>
        <label class="q-small" style="display:flex;align-items:center;gap:14px">Temperature
          <input type="range" min="0.1" max="2" step="0.1" value="1" data-temp style="width:320px;accent-color:var(--accent)">
          <b data-temp-value>1.0</b></label>
        <button type="button" class="q-btn main" data-do="draw">Draw by probability</button>
        <button type="button" class="q-btn" data-do="undo">Undo</button>
        <button type="button" class="q-btn" data-do="reset">Start over</button>
      </div>`;

    let c = ctx;
    let asking = '';
    const st = () => ({ base: startText, picked: [], top: [], t: 1, error: '', ...(c.state || {}) });
    const textOf = (s) => s.base + s.picked.map((w) => w.text).join('');

    async function ask(text) {
      asking = text;
      try {
        const top = await nextWords(model, text);
        if (asking === text) c.setState({ top, error: '', loading: false });
      } catch (error) {
        if (asking === text) c.setState({ top: [], error: `Could not reach the model at ${model}: ${error.message}`, loading: false });
      }
    }
    function change(next) {
      c.setState({ ...next, loading: true });
      ask(textOf({ ...st(), ...next }));
    }

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = st();
      const row = e.target.closest('[data-row]');
      const rows = withTemperature(s.top, s.t);
      if (row && !s.loading) {
        const r = rows[Number(row.dataset.row)];
        if (r) change({ picked: [...s.picked, { text: r.text, q: r.q }] });
      }
      const b = e.target.closest('[data-do]');
      if (!b || s.loading) return;
      if (b.dataset.do === 'draw' && rows.length) {
        let x = Math.random();
        const r = rows.find((w) => (x -= w.q) < 0) || rows[0];
        change({ picked: [...s.picked, { text: r.text, q: r.q }] });
      } else if (b.dataset.do === 'undo' && s.picked.length) {
        change({ picked: s.picked.slice(0, -1) });
      } else if (b.dataset.do === 'reset') {
        change({ picked: [] });
      }
    });
    el.querySelector('[data-temp]').addEventListener('input', (e) => {
      c.setState({ t: Number(e.target.value) });
    });

    const paint = () => {
      const s = st();
      el.querySelector('[data-sentence]').innerHTML = esc(s.base) + s.picked.map((w) => `<span style="color:var(--accent-text)">${esc(w.text)}</span>`).join('') + ' <span style="display:inline-block;width:1.4em;border-bottom:5px solid var(--accent)"></span>';
      const which = model === 'sample' ? 'Made-up probabilities (model: sample), not a real model.' : 'The 10 most likely next words.';
      const hint = s.top.length ? `${which} Click one to add it.` : 'Waiting for the model…';
      el.querySelector('[data-status]').textContent = s.error || (s.loading ? 'Asking the model…' : hint);
      el.querySelector('[data-temp-value]').textContent = s.t.toFixed(1);
      const slider = el.querySelector('[data-temp]');
      if (document.activeElement !== slider) slider.value = s.t;
      const rows = withTemperature(s.top, s.t);
      const max = Math.max(1e-9, ...rows.map((r) => r.q));
      el.querySelector('[data-rows]').innerHTML = rows.map((r, i) => `
        <button type="button" data-row="${i}" style="position:relative;display:flex;justify-content:space-between;align-items:center;height:56px;padding:0 20px;border:0;border-radius:10px;background:var(--surface);cursor:pointer;overflow:hidden;font-size:30px">
          <span style="position:absolute;inset:0 auto 0 0;width:${(r.q / max) * 100}%;background:color-mix(in srgb, var(--accent) ${30 + 50 * (r.q / max)}%, transparent);transition:width 250ms"></span>
          <span style="position:relative;font-weight:600;white-space:pre">${esc(r.text.replace(/\n/g, '⏎'))}</span>
          <span style="position:relative;font-variant-numeric:tabular-nums">${(r.q * 100).toFixed(1)}%</span>
        </button>`).join('');
    };

    // First time on this slide: the shared screen asks for the first words.
    if (!c.state && c.where === 'screen') change({ base: startText, picked: [] });
    paint();
    return {
      update(next) {
        c = next;
        paint();
      },
    };
  },
};
