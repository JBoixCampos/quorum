// Charts as HTML and SVG strings. The same code draws `::: chart` blocks
// (from numbers in talk.md) and the results of polls (from live votes),
// so both look alike. Runs in Node and in the browser.
//
// The screen updates live charts in place (app/js/morph.js), so widths,
// heights and positions are inline styles: CSS transitions animate them.

import { escapeHtml as esc } from './text.js';
import { iconSvg } from './icons.js';

export function formatValue(v, { digits = 2, unit = '' } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const text = v.toLocaleString('en', { maximumFractionDigits: digits });
  return unit ? `${text}${/^[%°]/.test(unit) ? '' : ' '}${unit}` : text;
}

const color = (i, series) => (series ? `var(--series-${(i % 8) + 1})` : 'var(--accent)');

// rows: [{ label, value, state: 'correct' | 'dim' | '' }]
// opts: {
//   total      for percentages (results); without it values are shown as numbers
//   max        the top of the scale (default: the largest value)
//   show       false hides the values (voting has not started)
//   series     true gives each row its own colour from the palette
//   unit, icon, per, title, clickable
// }
export function chartHtml(type, rows, opts = {}) {
  const t = { bar: 'bars', column: 'columns', pie: 'donut' }[type] || type;
  const draw = DRAW[t] || DRAW.bars;
  const prepared = prepare(rows, opts);
  const title = opts.title ? `<p class="q-chart-title">${esc(opts.title)}</p>` : '';
  return `${draw(prepared, opts)}${title}`;
}

function prepare(rows, opts) {
  const show = opts.show !== false;
  const percent = Number.isFinite(opts.total);
  const max = opts.max || Math.max(1, ...rows.map((r) => r.value || 0));
  return rows.map((r, i) => {
    const value = r.value || 0;
    const share = percent ? (opts.total ? value / opts.total : 0) : value / max;
    let text = '';
    if (show) text = percent ? `${opts.total ? Math.round((value / opts.total) * 100) : 0}%` : formatValue(value, { unit: opts.unit });
    return {
      ...r,
      i,
      value,
      share: show ? Math.max(0, Math.min(1, share)) : 0,
      text,
      color: color(i, opts.series),
      cls: `${r.state ? ` ${r.state}` : ''}${opts.clickable ? ' clickable' : ''}`,
    };
  });
}

const pctStyle = (x) => `${(x * 100).toFixed(2)}%`;

const DRAW = {
  bars(rows) {
    return `<div class="q-bars${rows.length > 5 ? ' many' : ''}">${rows.map((r) => `
    <div class="q-bar${r.cls}" data-option="${esc(r.label)}" style="--c:${r.color}">
      <span class="q-bar-label">${esc(r.label)}</span>
      <span class="q-bar-track"><span class="q-bar-fill" style="width:${pctStyle(r.share)}"></span></span>
      <span class="q-bar-value">${esc(r.text)}</span>
    </div>`).join('')}</div>`;
  },

  columns(rows) {
    return `<div class="q-colchart" style="--n:${rows.length}">${rows.map((r) => `
    <div class="q-colchart-item q-bar${r.cls}" data-option="${esc(r.label)}" style="--c:${r.color}">
      <span class="q-colchart-value q-bar-value">${esc(r.text)}</span>
      <span class="q-colchart-track"><span class="q-colchart-fill" style="height:${pctStyle(r.share)}"></span></span>
      <span class="q-colchart-label">${esc(r.label)}</span>
    </div>`).join('')}</div>`;
  },

  donut(rows, opts) {
    const R = 150;
    const C = 2 * Math.PI * R;
    const sum = rows.reduce((a, r) => a + (opts.show === false ? 0 : r.value), 0);
    let start = 0;
    const arcs = rows.map((r) => {
      const len = sum ? (r.value / sum) * C : 0;
      const arc = `<circle class="q-donut-arc${r.cls}" cx="200" cy="200" r="${R}" style="stroke:${r.color};stroke-dasharray:${len.toFixed(2)} ${C.toFixed(2)};stroke-dashoffset:${(-start).toFixed(2)}"/>`;
      start += len;
      return arc;
    }).join('');
    const top = rows.reduce((a, r) => (r.value > a.value ? r : a), rows[0] || { value: 0, text: '' });
    const middle = opts.show === false || !sum ? '' : esc(Number.isFinite(opts.total) ? top.text : formatValue(sum, { unit: opts.unit }));
    return `<div class="q-donut">
      <svg viewBox="0 0 400 400" aria-hidden="true"><circle class="q-donut-track" cx="200" cy="200" r="${R}"/><g transform="rotate(-90 200 200)">${arcs}</g>
      <text x="200" y="215" text-anchor="middle" class="q-donut-middle">${middle}</text></svg>
      <ul class="q-legend">${rows.map((r) => `<li class="q-bar${r.cls}" data-option="${esc(r.label)}" style="--c:${r.color}"><span class="q-swatch"></span><span class="q-bar-label">${esc(r.label)}</span><span class="q-bar-value">${esc(r.text)}</span></li>`).join('')}</ul>
    </div>`;
  },

  pictogram(rows, opts) {
    const N = 10;
    const icon = iconSvg(opts.icon || 'user', 'q-picto-icon') || iconSvg('user', 'q-picto-icon');
    const per = opts.per && !Number.isFinite(opts.total) ? opts.per : null;
    return `<div class="q-picto">${rows.map((r) => {
      const on = per ? Math.round(r.value / per) : Math.round(r.share * N);
      const count = per ? Math.max(on, 1) : N;
      const icons = Array.from({ length: Math.min(count, 40) }, (_, k) => `<span class="q-picto-cell${k < on ? ' on' : ''}" style="transition-delay:${k * 40}ms">${icon}</span>`).join('');
      return `<div class="q-picto-row q-bar${r.cls}" data-option="${esc(r.label)}" style="--c:${r.color}">
        <span class="q-bar-label">${esc(r.label)}</span><span class="q-picto-icons">${icons}</span><span class="q-bar-value">${esc(r.text)}</span>
      </div>`;
    }).join('')}</div>`;
  },

  race(rows) {
    const order = [...rows].sort((a, b) => b.value - a.value || a.i - b.i);
    const rank = new Map(order.map((r, k) => [r.i, k]));
    const ROW = rows.length > 5 ? 74 : 96;
    return `<div class="q-race" style="height:${rows.length * ROW}px">${rows.map((r) => `
    <div class="q-race-row q-bar${r.cls}" data-option="${esc(r.label)}" style="--c:${r.color};transform:translateY(${rank.get(r.i) * ROW}px);height:${ROW - 18}px">
      <span class="q-bar-label">${esc(r.label)}</span>
      <span class="q-bar-track"><span class="q-bar-fill" style="width:${pctStyle(r.share)}"></span></span>
      <span class="q-bar-value">${esc(r.text)}</span>
    </div>`).join('')}</div>`;
  },

  bubbles(rows) {
    const MAX = 360;
    const top = Math.max(...rows.map((r) => r.share), 0) || 1;
    return `<div class="q-bubbles">${rows.map((r) => {
      const size = Math.round(110 + (MAX - 110) * Math.sqrt(r.share / top || 0));
      return `<div class="q-bubble q-bar${r.cls}" data-option="${esc(r.label)}" style="--c:${r.color};width:${size}px;height:${size}px">
        <span class="q-bar-value">${esc(r.text)}</span><span class="q-bar-label">${esc(r.label)}</span>
      </div>`;
    }).join('')}</div>`;
  },

  line(rows, opts) {
    const W = 1500;
    const H = 520;
    const pad = { l: 40, r: 40, t: 60, b: 70 };
    const n = Math.max(1, rows.length - 1);
    const max = opts.max || Math.max(1, ...rows.map((r) => r.value));
    const min = Math.min(0, ...rows.map((r) => r.value));
    const x = (i) => pad.l + (i / n) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);
    const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.value).toFixed(1)}`);
    const area = `M${x(0)},${y(min)} L${pts.join(' L')} L${x(rows.length - 1)},${y(min)} Z`;
    return `<svg class="q-linechart" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <line class="q-line-axis" x1="${pad.l}" x2="${W - pad.r}" y1="${y(min)}" y2="${y(min)}"/>
      <path class="q-line-area" d="${area}"/>
      <polyline class="q-line-path" points="${pts.join(' ')}"/>
      ${rows.map((r, i) => `<circle class="q-line-dot" cx="${x(i)}" cy="${y(r.value)}" r="10"/>
      <text class="q-line-value" x="${x(i)}" y="${y(r.value) - 24}" text-anchor="middle">${esc(r.text)}</text>
      <text class="q-line-label" x="${x(i)}" y="${H - 20}" text-anchor="middle">${esc(r.label)}</text>`).join('')}
    </svg>`;
  },
};
