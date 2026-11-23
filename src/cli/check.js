// `quorum check`: reads a talk and lists what looks wrong. The result is
// plain data, so the command can print it for people or as JSON for tools
// and AI agents (`quorum check --json`).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseTalk } from '../shared/markdown.js';

// Components that ship with Quorum (app/js/components.js).
export const BUILT_IN_COMPONENTS = ['countdown', 'qr', 'embed'];

export function checkTalk(dir, file = 'talk.md') {
  const path = join(dir, file);
  if (!existsSync(path)) {
    return { ok: false, title: '', slides: 0, interactions: [], warnings: [`No ${file} in ${dir}.`] };
  }
  const talk = parseTalk(readFileSync(path, 'utf8'));
  const warnings = [...talk.warnings];
  const interactions = [];
  const missing = (rel) => !existsSync(join(dir, rel));
  const { meta } = talk;
  [['logo', meta.logo], ['style', meta.style], ['font', meta.fontFile], ['text-font', meta.textFontFile]].forEach(([key, rel]) => {
    if (rel && missing(rel)) warnings.push(`The ${key} file ${rel} does not exist.`);
  });
  talk.slides.forEach((slide) => {
    const where = `Slide ${slide.index + 1}`;
    if (slide.background && slide.background.image && missing(slide.background.image)) {
      warnings.push(`${where}: the background ${slide.background.image} does not exist.`);
    }
    // Images in the talk folder (not links to other sites).
    [...slide.html.matchAll(/<(?:img|source|video)[^>]* src="([^"]+)"/g)].forEach(([, src]) => {
      const rel = src.replace(/&amp;/g, '&').replace(/^\.\//, '');
      if (/^([a-z]+:|\/|#)/i.test(rel)) return;
      if (missing(rel)) warnings.push(`${where}: the image ${rel} does not exist.`);
    });
    if (slide.interaction) {
      const { id, kind, title } = slide.interaction;
      interactions.push({ slide: slide.index + 1, id, kind, title });
    }
    slide.components.forEach((c) => {
      if (c.name === 'embed') {
        const url = String((c.params && c.params.url) || '');
        if (/^https:\/\//.test(url)) return;
        if (!url || /^[a-z][\w+.-]*:/i.test(url) || url.startsWith('/') || url.split('/').includes('..')) {
          warnings.push(`${where}: embed needs an https:// url or a file in the talk folder.`);
        } else if (missing(url)) {
          warnings.push(`${where}: the embedded page ${url} does not exist.`);
        }
        return;
      }
      if (BUILT_IN_COMPONENTS.includes(c.name)) return;
      if (!existsSync(join(dir, 'components', `${c.name}.js`))) {
        warnings.push(`${where}: the component "${c.name}" has no file components/${c.name}.js.`);
      }
    });
  });
  return {
    ok: warnings.length === 0,
    title: talk.meta.title,
    slides: talk.slides.length,
    interactions,
    warnings,
  };
}
