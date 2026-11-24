import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { themeBrief, themeGuide } from '../src/cli/theme.js';

function talkDir() {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-guide-'));
  writeFileSync(join(dir, 'talk.md'), '---\ntitle: T\n---\n\n# Hello\n');
  return dir;
}

test('guidelines as text are kept, and a starter theme file is made', () => {
  const dir = talkDir();
  try {
    const guide = themeGuide(dir, 'acme', { text: 'Blue #0b5fff. No gradients.' });
    assert.equal(guide.guidelines, 'themes/acme.guidelines.md');
    assert.match(readFileSync(join(dir, 'themes', 'acme.guidelines.md'), 'utf8'), /No gradients/);
    assert.match(readFileSync(join(dir, 'themes', 'acme.yaml'), 'utf8'), /^extends: clean$/m);
    assert.match(guide.prompt, /Blue #0b5fff/);
    assert.match(guide.prompt, /themes\/acme\.yaml/);
    assert.match(guide.prompt, /themes\/acme\.md/);
    assert.match(guide.prompt, /quorum schema --json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a text file is copied and put in the brief; a PDF is copied and named', () => {
  const dir = talkDir();
  try {
    writeFileSync(join(dir, 'brand.md'), '# Brand\nCoral #ff6b4a.\n');
    writeFileSync(join(dir, 'brand.pdf'), '%PDF-1.4 fake');
    const text = themeGuide(dir, 'a', { from: join(dir, 'brand.md') });
    assert.match(text.prompt, /Coral #ff6b4a/);
    const pdf = themeGuide(dir, 'b', { from: join(dir, 'brand.pdf'), text: 'Also: calm.' });
    assert.ok(existsSync(join(dir, 'themes', 'b.guidelines.pdf')));
    assert.ok(existsSync(join(dir, 'themes', 'b.guidelines-notes.md')));
    assert.match(pdf.prompt, /themes\/b\.guidelines\.pdf/);
    assert.match(pdf.prompt, /Also: calm\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing theme file is refined, never replaced', () => {
  const dir = talkDir();
  try {
    themeGuide(dir, 'acme', { text: 'First.' });
    writeFileSync(join(dir, 'themes', 'acme.yaml'), 'extends: signal\naccent: "#0b5fff"\n');
    const again = themeGuide(dir, 'acme', { text: 'Second.' });
    assert.equal(again.isNew, false);
    assert.match(readFileSync(join(dir, 'themes', 'acme.yaml'), 'utf8'), /accent/);
    assert.match(again.prompt, /refine it/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('it needs guidelines and a plain name', () => {
  const dir = talkDir();
  try {
    assert.throws(() => themeGuide(dir, 'acme', {}), /Pass the guidelines/);
    assert.throws(() => themeGuide(dir, '../x', { text: 'a' }), /theme name/);
    assert.throws(() => themeGuide(dir, 'a', { from: join(dir, 'missing.md') }), /no file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a long guideline is referenced by file, not pasted', () => {
  const brief = themeBrief({ name: 'a', guidelines: ['themes/a.guidelines.md'], inline: '' });
  assert.match(brief, /The guidelines are in themes\/a\.guidelines\.md/);
});
