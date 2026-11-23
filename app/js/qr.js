import { esc } from './net.js';
import { qrMatrix } from './vendor/qr.js';

// A QR code as an SVG string: dark modules on white, with a 4-module margin.
export function qrSvg(text, { label = 'QR code', className = 'q-qr' } = {}) {
  if (!text) return '';
  const m = qrMatrix(text);
  const n = m.length;
  let d = '';
  m.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  }));
  return `<svg class="${className}" viewBox="0 0 ${n + 8} ${n + 8}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges">`
    + `<rect width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
