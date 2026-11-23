// The talk's branding, from its front matter: colours, fonts and (on the
// presentation) a stylesheet of its own. Used by the presentation, the
// panel and phones. The values were checked by the parser.

import { isDark } from '../shared/color.js';

const DISPLAY = "'Inter Display', 'Inter', system-ui, sans-serif";
const TEXT = "'Inter', system-ui, sans-serif";

function element(selector, create) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.append(el);
  }
  return el;
}

// assets: where the talk folder is served ('/talk/', or 'talk/' in a
// static build). style: also load the talk's own stylesheet.
export function applyBrand(meta, { assets = '/talk/', style = false } = {}) {
  const root = document.documentElement;
  const set = (name, value) => {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  };
  root.dataset.theme = meta.theme;
  set('--accent', meta.accent);
  const dark = isDark(meta.accent);
  set('--on-accent', dark === null ? '' : (dark ? '#fff' : '#111'));
  set('--primary', meta.primary);
  set('--secondary', meta.secondary);
  set('--bg', meta.background);
  set('--fg', meta.text);
  // With a background or text colour of its own, the greys follow them.
  root.classList.toggle('custom-colors', !!(meta.background || meta.text));

  const faces = [];
  const family = (name, file, css, fallback) => {
    if (file) {
      faces.push(`@font-face { font-family: '${name}'; src: url("${assets}${file}"); font-display: swap; }`);
      return `'${name}', ${fallback}`;
    }
    return css ? `${css}, ${fallback}` : '';
  };
  set('--font-display', family('Talk Display', meta.fontFile, meta.font, DISPLAY));
  set('--font-text', family('Talk Text', meta.textFontFile, meta.textFont, TEXT));
  const fontStyle = element('style[data-brand-fonts]', () => {
    const el = document.createElement('style');
    el.dataset.brandFonts = '';
    return el;
  });
  if (fontStyle.textContent !== faces.join('\n')) fontStyle.textContent = faces.join('\n');

  if (style) {
    const link = element('link[data-brand-style]', () => {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.dataset.brandStyle = '';
      return el;
    });
    const href = meta.style ? `${assets}${meta.style}` : '';
    if (link.getAttribute('href') !== href) {
      if (href) link.setAttribute('href', href);
      else link.removeAttribute('href');
    }
  }
}

// The talk's logo as an <img>, or '' when it has none.
export function logoHtml(meta, assets = '/talk/') {
  return meta.logo ? `<img src="${assets}${meta.logo}" alt="">` : '';
}
