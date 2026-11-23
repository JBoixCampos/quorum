// Components: custom pieces of a slide written in JavaScript, used from
// Markdown with `::: component name`. Quorum ships a few; a talk can add
// its own in `components/<name>.js` next to talk.md.
//
// A component is a module whose default export is:
//
//   export default {
//     mount(el, ctx) {
//       // draw into el; return what to do on updates
//       return {
//         update(ctx) {},      // new votes, new step, new shared state...
//         primary() {},        // optional: handle the right arrow; return true if handled
//         destroy() {},        // optional
//       };
//     },
//   };
//
// ctx has: params (the `key: value` lines), text (the rest of the block),
// state (shared between the screen and the presenter's preview), setState(),
// answers (what the audience answered, when the block has `audience:`),
// step, view (live session data), act() (send a session action), talk,
// where ('screen', 'preview' or 'thumbnail'), preview (true with a
// simulated audience), publicUrl, assets (where the talk folder is served,
// for files in it). Older names still set: rehearse (same as
// preview) and chatMode (always false).
//
// docs/components.md explains all of it with examples.

import { esc } from './net.js';
import { qrSvg } from './qr.js';

const BUILT_IN = {
  // A QR code for any link: `url: https://...`, optional `label:`.
  qr: {
    mount(el, ctx) {
      el.innerHTML = `<figure class="q-qr-figure">${qrSvg(ctx.params.url || '', { label: ctx.params.label || 'QR code' })}${ctx.params.label ? `<figcaption>${esc(ctx.params.label)}</figcaption>` : ''}</figure>`;
      return {};
    },
  },

  // A countdown: `seconds: 60`. Click it (or press the right arrow) to start
  // and pause. Shared, so the preview shows the same time.
  countdown: {
    mount(el, ctx) {
      const total = Number(ctx.params.seconds || 60);
      el.innerHTML = '<button type="button" class="q-countdown" data-no-advance></button>';
      const button = el.querySelector('button');
      let c = ctx;
      const left = () => {
        const s = c.state;
        if (!s || !s.startedAt) return s && s.left !== undefined ? s.left : total;
        return Math.max(0, s.left - (Date.now() - s.startedAt) / 1000);
      };
      const toggle = () => {
        const s = c.state || {};
        if (s.startedAt) c.setState({ startedAt: null, left: left() });
        else c.setState({ startedAt: Date.now(), left: left() > 0 ? left() : total });
      };
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
      });
      const paint = () => {
        const l = Math.ceil(left());
        button.textContent = `${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}`;
        button.classList.toggle('done', l <= 0);
      };
      const timer = setInterval(paint, 250);
      paint();
      return {
        update(next) { c = next; paint(); },
        primary() {
          if (c.state && c.state.startedAt) return false;
          toggle();
          return true;
        },
        destroy() { clearInterval(timer); },
      };
    },
  },

  // Another web page inside the slide: `url: https://...`, or a page in the
  // talk folder (`url: pages/chart.html`), which works without internet.
  embed: {
    mount(el, ctx) {
      const url = String(ctx.params.url || '');
      const src = /^https:\/\//.test(url) ? url : (isTalkFile(url) ? `${ctx.assets || '/talk/'}${url}` : '');
      el.innerHTML = src
        ? `<iframe class="q-embed" src="${esc(src)}" title="${esc(ctx.params.title || 'Embedded page')}" loading="lazy"></iframe>`
        : '<p class="q-small">The embed component needs an https:// url or a file in the talk folder.</p>';
      return {};
    },
  },
};

// A path inside the talk folder: no scheme, not absolute, no "..".
export function isTalkFile(url) {
  return /^[\w][\w./-]*$/.test(url) && !url.split('/').includes('..');
}

const cache = new Map();

export async function loadComponent(name, { base = '/talk/components/' } = {}) {
  if (BUILT_IN[name]) return BUILT_IN[name];
  if (!cache.has(name)) {
    const url = new URL(`${base}${encodeURIComponent(name)}.js`, document.baseURI).href;
    cache.set(name, import(url).then((m) => m.default));
  }
  return cache.get(name);
}

export function mountError(el, name, error) {
  el.innerHTML = `<div class="q-component-error"><b>Component "${esc(name)}" could not load.</b><br>${esc(error && error.message ? error.message : String(error))}</div>`;
}
