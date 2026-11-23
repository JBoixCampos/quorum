// Reads a slide as it is drawn in the browser: every box, text block,
// picture and chart with its position (in stage pixels, a 1920 x 1080
// stage), so the PowerPoint export can write a native shape in the same
// place. Runs inside the page: it must not use anything from outside the
// function.

export function extractStage(options = {}) {
  const stage = document.querySelector('[data-stage]');
  const origin = stage.getBoundingClientRect();
  const S = 1920 / origin.width;
  const items = [];
  const report = [];
  let counter = 0;

  // --- colours -----------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  function rgba(css) {
    if (!css) return null;
    if (cache.has(css)) return cache.get(css);
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#000';
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    const out = d[3] === 0 ? null : { r: d[0], g: d[1], b: d[2], a: Math.round((d[3] / 255) * 100) / 100 };
    cache.set(css, out);
    return out;
  }

  // The opacity an element inherits from itself and its parents.
  function opacityOf(el) {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number.parseFloat(getComputedStyle(n).opacity);
    return Number.isFinite(o) ? o : 1;
  }

  const px = (v) => (Number.parseFloat(v) || 0) * S;
  const rectOf = (r) => ({
    x: (r.left - origin.left) * S,
    y: (r.top - origin.top) * S,
    w: r.width * S,
    h: r.height * S,
  });
  const stepOf = (el) => {
    const s = el.closest('[data-step]');
    return s ? Number(s.dataset.step) || 0 : 0;
  };
  const mark = (el) => {
    counter += 1;
    el.setAttribute('data-qx', String(counter));
    return counter;
  };

  function hidden(el, cs) {
    if (el.hidden || cs.display === 'none' || cs.visibility === 'hidden') return true;
    if (Number.parseFloat(cs.opacity) < 0.02) return true;
    if (el.matches('.q-reactions, .q-preview-bar, script, style, noscript, button, [data-do], [data-qx-skip], [data-corner], .q-corner-qr')) return true;
    return false;
  }

  // --- gradients (linear only) ------------------------------------------
  function gradientOf(image) {
    const m = image.match(/^linear-gradient\((.*)\)$/s);
    if (!m) return null;
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of m[1]) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    parts.push(cur.trim());
    let angle = 180;
    if (/^-?[\d.]+deg$/.test(parts[0])) angle = Number.parseFloat(parts.shift());
    else if (/^to /.test(parts[0])) {
      const dir = parts.shift();
      angle = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to bottom right': 135, 'to bottom left': 225, 'to top left': 315 }[dir] ?? 180;
    }
    const stops = parts.map((p, i) => {
      const pos = p.match(/\s(-?[\d.]+)%$/);
      const colorText = pos ? p.slice(0, pos.index) : p;
      return { color: rgba(colorText), pos: pos ? Number.parseFloat(pos[1]) : Math.round((i / Math.max(1, parts.length - 1)) * 100) };
    }).filter((s) => s.color);
    return stops.length >= 2 ? { angle, stops } : null;
  }

  // --- boxes ------------------------------------------------------------
  function sideWidth(cs, side) {
    return cs[`border${side}Style`] === 'none' ? 0 : px(cs[`border${side}Width`]);
  }

  // `flat`: for stand-ins that are removed right after measuring, so an
  // unsupported background becomes its first colour instead of a picture.
  function boxOf(el, cs, r, flat = false) {
    const rc = rectOf(r);
    if (rc.w < 1 || rc.h < 1) return;
    const fade = opacityOf(el);
    const paint = rgba(cs.backgroundColor);
    const bg = paint ? { ...paint, a: Math.round(paint.a * fade * 100) / 100 } : null;
    const image = cs.backgroundImage;
    const gradient = image && image !== 'none' && image.startsWith('linear-gradient') ? gradientOf(image) : null;
    const url = image && image.includes('url(');
    const widths = ['Top', 'Right', 'Bottom', 'Left'].map((s) => sideWidth(cs, s));
    const colors = ['Top', 'Right', 'Bottom', 'Left'].map((s) => rgba(cs[`border${s}Color`]));
    const radius = Math.min(px(cs.borderTopLeftRadius), Math.min(rc.w, rc.h) / 2);
    const step = stepOf(el);
    const uniform = widths.every((w) => w > 0 && Math.abs(w - widths[0]) < 0.5);
    const hasImage = url || (image && image !== 'none' && !gradient);
    const approx = flat && hasImage && !url ? rgba((image.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i) || [''])[0]) : null;
    if (hasImage && !(flat && !url)) {
      const id = mark(el);
      items.push({ type: 'raster', id, bgOnly: true, ...rc, step });
      report.push('a background drawn with an image or a pseudo element became a picture');
    } else if (bg || gradient || uniform || approx) {
      items.push({
        type: 'box', ...rc, step, radius, fill: bg || approx, gradient,
        line: uniform ? { w: widths[0], color: colors[0] } : null,
        shadow: cs.boxShadow && cs.boxShadow !== 'none',
        name: el.dataset.name || '',
      });
    }
    if (!uniform) {
      const [t, rr, b, l] = widths;
      const side = (x, y, w, h, color) => color && items.push({ type: 'box', x, y, w, h, step, radius: 0, fill: color, gradient: null, line: null });
      if (t > 0) side(rc.x, rc.y, rc.w, t, colors[0]);
      if (b > 0) side(rc.x, rc.y + rc.h - b, rc.w, b, colors[2]);
      if (l > 0) side(rc.x, rc.y, l, rc.h, colors[3]);
      if (rr > 0) side(rc.x + rc.w - rr, rc.y, rr, rc.h, colors[1]);
    }
  }

  // --- text -------------------------------------------------------------
  const GENERIC = { 'sans-serif': 'Arial', serif: 'Georgia', monospace: 'Consolas', 'system-ui': 'Arial', 'ui-sans-serif': 'Arial', 'ui-monospace': 'Consolas', 'ui-serif': 'Georgia' };
  function fontOf(cs) {
    const first = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    return GENERIC[first] || first;
  }

  function styleOf(el) {
    const cs = getComputedStyle(el);
    const size = px(cs.fontSize);
    const own = rgba(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
    const fade = opacityOf(el);
    const color = { ...own, a: Math.round(own.a * fade * 100) / 100 };
    const bg = rgba(cs.backgroundColor);
    return {
      font: fontOf(cs),
      mono: /mono|consol|courier|menlo/i.test(cs.fontFamily),
      size,
      bold: Number.parseInt(cs.fontWeight, 10) >= 600,
      italic: cs.fontStyle === 'italic',
      underline: cs.textDecorationLine.includes('underline'),
      strike: cs.textDecorationLine.includes('line-through'),
      color,
      highlight: bg && bg.a > 0.5 && el.tagName !== 'LI' ? bg : null,
      spacing: px(cs.letterSpacing) || 0,
      href: el.closest('a') ? el.closest('a').getAttribute('href') : '',
      transform: cs.textTransform,
      pre: /^pre/.test(cs.whiteSpace),
    };
  }

  const TEXT_INLINE = /^(A|ABBR|B|BDI|CITE|CODE|DEL|EM|I|INS|KBD|MARK|Q|S|SAMP|SMALL|SPAN|STRONG|SUB|SUP|TIME|U|VAR|BR|LABEL|FONT)$/;
  const MEDIA = /^(IMG|SVG|VIDEO|CANVAS|IFRAME|OBJECT|BUTTON|INPUT|TEXTAREA|SELECT)$/i;

  function isInlineText(node) {
    if (!TEXT_INLINE.test(node.tagName)) return false;
    const cs = getComputedStyle(node);
    if (!cs.display.startsWith('inline')) return false;
    return !node.querySelector('img, svg, video, canvas, iframe, table, ul, ol, p, div, h1, h2, h3, h4, h5, h6, figure, pre, blockquote');
  }

  function transformText(text, how) {
    if (how === 'uppercase') return text.toUpperCase();
    if (how === 'lowercase') return text.toLowerCase();
    if (how === 'capitalize') return text.replace(/\b(\p{L})/gu, (c) => c.toUpperCase());
    return text;
  }

  function collectRuns(nodes) {
    const runs = [];
    const visit = (node) => {
      if (node.nodeType === 3) {
        const style = styleOf(node.parentElement);
        let text = node.textContent;
        if (!style.pre) text = text.replace(/\s+/g, ' ');
        text = transformText(text, style.transform);
        if (text) runs.push({ text, ...style });
      } else if (node.nodeType === 1) {
        if (node.tagName === 'BR') {
          runs.push({ text: '\n', ...styleOf(node.parentElement) });
        } else if (hiddenQuick(node)) {
          // skip
        } else {
          node.childNodes.forEach(visit);
        }
      }
    };
    nodes.forEach(visit);
    return runs;
  }
  function hiddenQuick(node) {
    const cs = getComputedStyle(node);
    return cs.display === 'none' || cs.visibility === 'hidden';
  }

  // Splits runs into paragraphs at line breaks; trims the edges.
  function paragraphsOf(runs) {
    const paras = [[]];
    runs.forEach((run) => {
      const pieces = run.text.split('\n');
      pieces.forEach((piece, k) => {
        if (k > 0) paras.push([]);
        if (piece !== '') paras[paras.length - 1].push({ ...run, text: piece });
      });
    });
    const out = paras.map((p) => {
      if (p.length) {
        p[0].text = p[0].text.replace(/^\s+/, '');
        p[p.length - 1].text = p[p.length - 1].text.replace(/\s+$/, '');
      }
      return p.filter((r) => r.text !== '');
    });
    return out.filter((p, k) => p.length || (k > 0 && k < out.length - 1));
  }

  function bulletOf(el, size) {
    if (el.tagName !== 'LI') return null;
    const cs = getComputedStyle(el);
    const before = getComputedStyle(el, '::before');
    const content = before.content;
    const type = cs.listStyleType;
    const parent = el.parentElement;
    const ordered = parent && parent.tagName === 'OL';
    if (content && content !== 'none' && content !== 'normal') {
      const text = content.replace(/^["']|["']$/g, '');
      if (/^\d/.test(text) || ordered) {
        const index = [...parent.children].filter((c) => c.tagName === 'LI').indexOf(el);
        return { kind: 'num', startAt: index + (Number.parseInt(parent.getAttribute('start'), 10) || 1) };
      }
      return { kind: 'char', char: text && text.length <= 2 ? text : '•' };
    }
    if (type === 'none') return null;
    if (ordered || type.includes('decimal')) {
      const index = [...parent.children].filter((c) => c.tagName === 'LI').indexOf(el);
      return { kind: 'num', startAt: index + (Number.parseInt(parent.getAttribute('start'), 10) || 1) };
    }
    return { kind: 'char', char: type === 'square' ? '▪' : (type === 'circle' ? '◦' : '•'), size };
  }

  function emitText(el, nodes) {
    const runs = collectRuns(nodes);
    const paras = paragraphsOf(runs);
    // "Join at localhost:8080" means nothing in a PowerPoint file.
    if (el.closest('[data-footer]') && /^\s*Join at\b/.test(runs.map((x) => x.text).join(''))) return;
    if (!paras.length || !paras.some((p) => p.some((r) => r.text.trim() !== ''))) return;
    const range = document.createRange();
    range.setStartBefore(nodes[0]);
    range.setEndAfter(nodes[nodes.length - 1]);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const rc = rectOf({ left, top, width: right - left, height: bottom - top });
    const cs = getComputedStyle(el);
    const first = paras[0][0];
    const lh = Number.parseFloat(cs.lineHeight);
    const align = { center: 'ctr', right: 'r', end: 'r', justify: 'just' }[cs.textAlign] || 'l';
    const bullet = bulletOf(el, first.size);
    items.push({
      type: 'text',
      ...rc,
      step: stepOf(el),
      align,
      lineHeight: Number.isFinite(lh) ? (lh * S) / first.size : 1.2,
      bullet,
      paras,
      name: el.dataset.name || (/^H[1-3]$/.test(el.tagName) ? `!!${el.tagName.toLowerCase()}` : ''),
      src: el.closest('[data-src]') ? el.closest('[data-src]').dataset.src : '',
      heading: /^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : 0,
      chrome: !!el.closest('[data-footer], [data-logo]'),
    });
  }

  // --- media ------------------------------------------------------------
  function emitRaster(el, r, extra = {}) {
    const rc = rectOf(r);
    if (rc.w < 1 || rc.h < 1) return;
    const id = mark(el);
    items.push({ type: 'raster', id, ...rc, step: stepOf(el), ...extra });
  }

  function emitImage(el, cs, r) {
    const rc = rectOf(r);
    if (rc.w < 1 || rc.h < 1) return;
    const src = el.currentSrc || el.src;
    const radius = Math.min(px(cs.borderTopLeftRadius), Math.min(rc.w, rc.h) / 2);
    if (/\.svg(\?|$)/i.test(src) || /^data:image\/svg/.test(src) || /\.webp(\?|$)/i.test(src)) {
      emitRaster(el, r, { svgSrc: /svg/.test(src) ? src : '', alt: el.alt || '' });
      return;
    }
    items.push({
      type: 'image', id: mark(el), src, ...rc, step: stepOf(el), alt: el.alt || '', radius,
      fit: cs.objectFit, natural: { w: el.naturalWidth, h: el.naturalHeight },
      position: cs.objectPosition,
    });
  }

  function emitSvg(el, r) {
    const id = mark(el);
    const rc = rectOf(r);
    if (rc.w < 1 || rc.h < 1) return;
    let markup = '';
    try {
      const copy = el.cloneNode(true);
      const color = getComputedStyle(el).color;
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      copy.setAttribute('width', String(Math.round(rc.w)));
      copy.setAttribute('height', String(Math.round(rc.h)));
      markup = new XMLSerializer().serializeToString(copy).replace(/currentColor/g, color);
      if (/var\(|<style|class=/.test(markup)) markup = '';
    } catch {
      markup = '';
    }
    items.push({ type: 'raster', id, ...rc, step: stepOf(el), svgMarkup: markup, alt: el.getAttribute('aria-label') || '' });
  }

  // --- charts -----------------------------------------------------------
  const CHART_ROOTS = [
    ['.q-bars', 'bars'], ['.q-colchart', 'columns'], ['.q-donut', 'donut'], ['.q-race', 'bars'], ['.q-picto', 'bars'], ['.q-linechart', 'line'],
  ];

  function chartRows(root) {
    return [...root.querySelectorAll('.q-bar[data-option]')].map((row) => {
      const valueText = (row.querySelector('.q-bar-value') || {}).textContent || '';
      const number = Number.parseFloat(valueText.replace(/,/g, '').replace(/[^\d.\-]/g, ''));
      const fill = row.querySelector('.q-bar-fill, .q-colchart-fill');
      let share = 0;
      if (fill && fill.parentElement) {
        const f = fill.getBoundingClientRect();
        const t = fill.parentElement.getBoundingClientRect();
        const upright = row.classList.contains('q-colchart-item');
        share = upright ? (t.height ? f.height / t.height : 0) : (t.width ? f.width / t.width : 0);
      }
      const color = rgba(getComputedStyle(fill || row).backgroundColor);
      const swatch = row.querySelector('.q-swatch');
      const swatchColor = swatch ? rgba(getComputedStyle(swatch).backgroundColor) : null;
      return {
        label: (row.querySelector('.q-bar-label, .q-colchart-label') || {}).textContent || row.dataset.option || '',
        text: valueText.trim(),
        value: Number.isFinite(number) ? number : null,
        share,
        percent: valueText.includes('%'),
        color: swatchColor || color,
        state: row.className.includes('correct') ? 'correct' : '',
      };
    });
  }

  function emitChart(el, type, r) {
    const rows = chartRows(el);
    if (!rows.length) return false;
    const rc = rectOf(r);
    const shown = rows.some((x) => x.text !== '' || x.share > 0);
    const label = el.querySelector('.q-bar-label, .q-colchart-label');
    const ls = label ? styleOf(label) : styleOf(el);
    if (!shown) {
      // Voting has not started: the options as a list.
      items.push({
        type: 'text', ...rc, step: stepOf(el), align: 'l', lineHeight: 1.3,
        bullet: { kind: 'char', char: '•' },
        paras: rows.map((x) => [{ text: x.label, ...ls }]),
      });
      return true;
    }
    rows.forEach((x) => {
      if (x.value === null) x.value = Math.round(x.share * 1000) / 10;
    });
    // A unit shared by every value ("min", "km"), kept as a number format.
    const units = rows.map((x) => x.text.replace(/^[\d.,\-\s%]+/, '').trim());
    const unit = units.every((u) => u === units[0]) && !rows.some((x) => x.percent) ? units[0] : '';
    const longest = Math.max(...rows.map((x) => x.label.length));
    items.push({ type: 'chart', chart: type, ...rc, step: stepOf(el), rows, unit, labelWidth: Math.min(0.42, Math.max(0.1, (longest * ls.size * 0.58) / Math.max(rc.w, 1) + 0.03)), font: ls.font, size: ls.size, color: ls.color });
    return true;
  }

  // --- tables -----------------------------------------------------------
  function emitTable(el, r) {
    const rc = rectOf(r);
    const trs = [...el.querySelectorAll('tr')];
    if (!trs.length) return;
    const firstCells = [...trs[0].children];
    const cols = firstCells.map((c) => c.getBoundingClientRect().width * S);
    const rows = trs.map((tr) => ({
      h: tr.getBoundingClientRect().height * S,
      cells: [...tr.children].map((cell) => {
        const cs = getComputedStyle(cell);
        const runs = collectRuns([...cell.childNodes]);
        return {
          paras: paragraphsOf(runs),
          fill: rgba(cs.backgroundColor) || rgba(getComputedStyle(tr).backgroundColor),
          align: { center: 'ctr', right: 'r', end: 'r' }[cs.textAlign] || 'l',
          line: sideWidth(cs, 'Bottom') > 0 ? { w: sideWidth(cs, 'Bottom'), color: rgba(cs.borderBottomColor) } : null,
          span: cell.colSpan || 1,
          pad: { l: px(cs.paddingLeft), r: px(cs.paddingRight), t: px(cs.paddingTop), b: px(cs.paddingBottom) },
        };
      }),
    }));
    items.push({ type: 'table', ...rc, step: stepOf(el), cols, rows });
  }

  // ::before and ::after cannot be measured, so each one is swapped for a
  // real element with the same style while it is measured.
  function emitPseudo(el, which) {
    const ps = getComputedStyle(el, which);
    if (!ps || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none' || ps.visibility === 'hidden') return;
    if (Number.parseFloat(ps.opacity) < 0.02) return;
    const isText = /^["']/.test(ps.content) && ps.content.slice(1, -1).trim() !== '';
    if (el.tagName === 'LI' && isText) return;
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((side) => ps[`border${side}Style`] !== 'none' && Number.parseFloat(ps[`border${side}Width`]) > 0);
    const hasBox = rgba(ps.backgroundColor) || (ps.backgroundImage && ps.backgroundImage !== 'none') || border;
    if (!isText && !hasBox) return;
    const clone = document.createElement('span');
    for (let i = 0; i < ps.length; i += 1) {
      const name = ps[i];
      if (name !== 'content') clone.style.setProperty(name, ps.getPropertyValue(name));
    }
    clone.style.animation = 'none';
    clone.style.transition = 'none';
    clone.setAttribute('data-qx-skip', '');
    if (isText) clone.textContent = ps.content.slice(1, -1).replace(/\\(.)/g, '$1');
    el.setAttribute('data-qx-np', which);
    if (which === '::before') el.prepend(clone);
    else el.append(clone);
    try {
      const r = clone.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        boxOf(clone, getComputedStyle(clone), r, true);
        if (isText) emitText(clone, [clone.firstChild]);
      }
    } finally {
      clone.remove();
      el.removeAttribute('data-qx-np');
    }
  }

  // --- the walk ---------------------------------------------------------
  function walkChildren(el) {
    let group = [];
    const flush = () => {
      if (group.length) {
        emitText(el, group);
        group = [];
      }
    };
    el.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        if (node.textContent.trim() || group.length) group.push(node);
        return;
      }
      if (node.nodeType !== 1) return;
      if (isInlineText(node)) {
        if (!hiddenQuick(node)) group.push(node);
        return;
      }
      flush();
      walk(node);
    });
    flush();
  }

  function walk(el) {
    const cs = getComputedStyle(el);
    if (hidden(el, cs)) return;
    const r = el.getBoundingClientRect();
    const tag = el.tagName;
    // The audience's part cannot run in PowerPoint: a placeholder marks the spot.
    if (el.matches('[data-join]') || (options.placeholders && el.matches('[data-interaction]'))) {
      items.push({ type: 'placeholder', kind: el.matches('[data-join]') ? 'join' : 'interaction', ...rectOf(r), step: stepOf(el) });
      return;
    }
    if (tag === 'IMG') { emitImage(el, cs, r); return; }
    if (tag === 'SVG' || tag === 'svg') { emitSvg(el, r); return; }
    if (/^(VIDEO|CANVAS|IFRAME|OBJECT)$/.test(tag)) {
      emitRaster(el, r);
      report.push(`a ${tag.toLowerCase()} became a picture`);
      return;
    }
    if (tag === 'TABLE') { emitTable(el, r); return; }
    for (const [selector, type] of CHART_ROOTS) {
      if (el.matches(selector) && emitChart(el, type, r)) return;
    }
    if (el.matches('[data-component], .q-bubbles, .q-picto-icons, .q-beeswarm, .q-hist, .q-qr, .q-corner-qr')) {
      emitRaster(el, r);
      report.push(`${el.dataset.component ? `the component "${el.dataset.component}"` : 'a drawing'} became a picture`);
      return;
    }
    if (tag === 'FIGURE' && el.querySelector(':scope > .q-chart-title') === null && el.querySelector('video, canvas')) {
      emitRaster(el, r);
      return;
    }
    boxOf(el, cs, r);
    emitPseudo(el, '::before');
    walkChildren(el);
    emitPseudo(el, '::after');
  }

  // --- the slide itself ---------------------------------------------------
  const slideEl = stage.querySelector('[data-slide]');
  const scs = getComputedStyle(slideEl);
  const background = {
    color: rgba(scs.backgroundColor) || rgba(getComputedStyle(stage).backgroundColor) || rgba(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 },
    gradient: scs.backgroundImage && scs.backgroundImage.startsWith('linear-gradient') && !slideEl.dataset.gradient ? gradientOf(scs.backgroundImage) : null,
    complex: !!(slideEl.dataset.gradient || (scs.backgroundImage && scs.backgroundImage !== 'none' && !scs.backgroundImage.startsWith('linear-gradient')) || slideEl.classList.contains('bg-dim')
      || (document.documentElement.dataset.texture && document.documentElement.dataset.texture !== 'none')
      || (document.documentElement.dataset.gradient && document.documentElement.dataset.gradient !== 'none')),
  };

  stage.querySelectorAll('[data-qx]').forEach((n) => n.removeAttribute('data-qx'));
  // The slide's own box is the background; its children are the content.
  walkChildren(slideEl);
  [...stage.children].filter((c) => c !== slideEl).forEach((c) => walk(c));

  const root = getComputedStyle(slideEl);
  const heading = slideEl.querySelector('h1, h2, h3');
  const read = (name) => rgba(root.getPropertyValue(name).trim());
  return {
    items,
    background,
    report,
    colors: {
      accent: read('--accent'), primary: read('--primary'), secondary: read('--secondary'), bg: read('--bg'), fg: read('--fg'),
      surface: read('--surface'), line: read('--line'), muted: read('--muted'),
      series: [1, 2, 3, 4, 5, 6].map((i) => read(`--series-${i}`)),
    },
    fonts: {
      title: heading ? fontOf(getComputedStyle(heading)) : fontOf(root),
      body: fontOf(root),
    },
  };
}
