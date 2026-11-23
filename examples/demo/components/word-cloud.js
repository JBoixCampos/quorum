// Example component: a word cloud of what the audience writes.
//
//   ::: component word-cloud
//   audience: text
//   prompt: One word: how do you feel about AI?
//   length: 24
//   examples: curious | worried | excited | tired | hopeful
//   :::
//
// "audience: text" is what makes phones show a text box. Quorum handles
// opening and closing, phones and the simulated audience of a preview;
// this file only draws ctx.answers.values, the list of answers.

function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function tally(values) {
  const counts = new Map();
  values.forEach((v) => {
    const word = String(v).trim().toLowerCase().replace(/[.!?,;:]+$/, '');
    if (word) counts.set(word, (counts.get(word) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
}

export default {
  mount(el, ctx) {
    el.innerHTML = `<div class="cloud" style="display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:12px 36px;min-height:420px;max-width:1500px;margin:0 auto;text-align:center"></div>`;
    const cloud = el.firstElementChild;

    const paint = (c) => {
      const a = c.answers || { phase: 0, values: [] };
      const words = tally(a.values || []);
      if (!words.length) {
        cloud.innerHTML = `<p class="q-small">${a.phase ? 'Words will appear here as they arrive.' : 'Press → to open it.'}</p>`;
        return;
      }
      const max = words[0][1];
      // Biggest in the middle: alternate sides as the words get smaller.
      const order = [];
      words.forEach((w, i) => (i % 2 ? order.push(w) : order.unshift(w)));
      cloud.innerHTML = order.map(([word, n]) => {
        const k = n / max;
        const size = Math.round(34 + 96 * Math.sqrt(k));
        const mix = Math.round(35 + 65 * k);
        return `<span title="${n}" style="font:700 ${size}px/1.1 var(--font-display);color:color-mix(in srgb, var(--accent-text) ${mix}%, var(--muted))">${esc(word)}</span>`;
      }).join('');
    };

    paint(ctx);
    return { update: paint };
  },
};
