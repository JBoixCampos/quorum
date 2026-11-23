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
  talk.slides.forEach((slide) => {
    if (slide.interaction) {
      const { id, kind, title } = slide.interaction;
      interactions.push({ slide: slide.index + 1, id, kind, title });
    }
    slide.components.forEach((c) => {
      if (BUILT_IN_COMPONENTS.includes(c.name)) return;
      if (!existsSync(join(dir, 'components', `${c.name}.js`))) {
        warnings.push(`Slide ${slide.index + 1}: the component "${c.name}" has no file components/${c.name}.js.`);
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
