// Colours, for the branding of a talk. Runs in Node and in the browser.

// A few CSS colour names people use in front matter. Others are accepted by
// the browser but cannot be measured (contrast checks skip them).
const NAMES = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', navy: '#000080',
  teal: '#008080', orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080', silver: '#c0c0c0',
  maroon: '#800000', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff', yellow: '#ffff00',
  gold: '#ffd700', crimson: '#dc143c', tomato: '#ff6347', coral: '#ff7f50', salmon: '#fa8072', indigo: '#4b0082',
  ivory: '#fffff0', beige: '#f5f5dc', tan: '#d2b48c', brown: '#a52a2a', pink: '#ffc0cb', hotpink: '#ff69b4',
  skyblue: '#87ceeb', steelblue: '#4682b4', royalblue: '#4169e1', midnightblue: '#191970', darkblue: '#00008b',
  darkgreen: '#006400', forestgreen: '#228b22', seagreen: '#2e8b57', darkred: '#8b0000', slategray: '#708090',
  darkslategray: '#2f4f4f', whitesmoke: '#f5f5f5', snow: '#fffafa', linen: '#faf0e6', cornsilk: '#fff8dc',
  chocolate: '#d2691e', orchid: '#da70d6', turquoise: '#40e0d0', violet: '#ee82ee', khaki: '#f0e68c',
};

// [r, g, b] in 0..255, or null for anything that cannot be read.
export function parseColor(color) {
  const c = String(color || '').trim().toLowerCase();
  if (NAMES[c]) return parseColor(NAMES[c]);
  let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) {
    const hex = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Number(x))));
  return null;
}

export function luminance(color) {
  const rgb = Array.isArray(color) ? color : parseColor(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((x) => x / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The WCAG contrast ratio between two colours (1 to 21), or null.
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Whether a colour is dark: white text on it reads better than black.
// Null for a colour that cannot be read.
export function isDark(color) {
  const l = luminance(color);
  return l === null ? null : l < 0.179;
}

export function toHex([r, g, b]) {
  return `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
}

export function toHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl([h, s, l]) {
  const hue = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(hue + 1 / 3) * 255, f(hue) * 255, f(hue - 1 / 3) * 255];
}

// Five colours that go with `accent`, for charts when the talk sets none.
export function paletteFrom(accent) {
  const rgb = parseColor(accent);
  if (!rgb) return [];
  const [h, s, l] = toHsl(rgb);
  const sat = Math.max(0.45, Math.min(0.8, s));
  const light = Math.max(0.38, Math.min(0.55, l));
  return [0, 165, 215, 45, 285].map((turn, i) => (i === 0 ? toHex(rgb) : toHex(fromHsl([h + turn, sat, light]))));
}
