import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkTalk } from '../src/cli/check.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'quorum.js');

function talkFolder(markdown, components = []) {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-check-'));
  writeFileSync(join(dir, 'talk.md'), markdown);
  if (components.length) mkdirSync(join(dir, 'components'));
  components.forEach((name) => writeFileSync(join(dir, 'components', `${name}.js`), 'export default { mount() {} };\n'));
  return dir;
}

function runJson(dir) {
  const r = spawnSync(process.execPath, [CLI, 'check', dir, '--json'], { encoding: 'utf8' });
  return { status: r.status, result: JSON.parse(r.stdout) };
}

test('check --json reports a clean talk and exits 0', () => {
  const dir = talkFolder('---\ntitle: Clean\n---\n# Hi\n\n---\n\n::: poll {#p} Pick one\n- A\n- B\n:::\n');
  try {
    const { status, result } = runJson(dir);
    assert.equal(status, 0);
    assert.deepEqual(Object.keys(result).sort(), ['interactions', 'ok', 'slides', 'title', 'warnings']);
    assert.equal(result.ok, true);
    assert.equal(result.slides, 2);
    assert.deepEqual(result.interactions, [{ slide: 2, id: 'p', kind: 'poll', title: 'Pick one' }]);
    assert.deepEqual(result.warnings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check --json lists warnings and exits non-zero', () => {
  const dir = talkFolder('::: poll Only one option\n- A\n:::\n\n---\n\n::: component missing\n:::\n');
  try {
    const { status, result } = runJson(dir);
    assert.equal(status, 1);
    assert.equal(result.ok, false);
    assert.equal(result.warnings.length, 2);
    assert.match(result.warnings[0], /at least two options/);
    assert.match(result.warnings[1], /components\/missing\.js/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('built-in and local components are not reported as missing', () => {
  const dir = talkFolder('::: component countdown\nseconds: 10\n:::\n\n---\n\n::: component mine\n:::\n', ['mine']);
  try {
    assert.equal(checkTalk(dir).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check --json without a talk file still prints JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-check-'));
  try {
    const { status, result } = runJson(dir);
    assert.equal(status, 1);
    assert.equal(result.ok, false);
    assert.match(result.warnings[0], /No talk\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check warns about missing logo, background and image files', () => {
  const dir = talkFolder([
    '---', 'logo: images/logo.svg', 'style: brand.css', '---', '',
    '<!-- background: images/photo.jpg, dim -->', '# Hi', '', '![A cat](images/cat.jpg)',
    '', '![Remote](https://example.com/a.png)', '',
  ].join('\n'));
  try {
    writeFileSync(join(dir, 'brand.css'), 'h1 { color: red; }\n');
    const result = checkTalk(dir);
    assert.deepEqual(result.warnings, [
      'The logo file images/logo.svg does not exist.',
      'Slide 1: the background images/photo.jpg does not exist.',
      'Slide 1: the image images/cat.jpg does not exist.',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('quorum skill copies the agent skill into a skills folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-skill-'));
  try {
    const r = spawnSync(process.execPath, [CLI, 'skill', '--to', dir], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    const skill = readFileSync(join(dir, 'quorum', 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\nname: quorum\n/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check: embed takes an https url or a page in the talk folder', () => {
  const dir = talkFolder([
    '::: component embed\nurl: https://example.com\n:::',
    '::: component embed\nurl: pages/chart.html\n:::',
    '::: component embed\nurl: pages/missing.html\n:::',
    '::: component embed\nurl: http://example.com\n:::',
    '::: component embed\nurl: ../outside.html\n:::',
  ].join('\n\n---\n\n'));
  try {
    mkdirSync(join(dir, 'pages'));
    writeFileSync(join(dir, 'pages', 'chart.html'), '<p>Chart</p>\n');
    const { result } = runJson(dir);
    assert.deepEqual(result.warnings, [
      'Slide 3: the embedded page pages/missing.html does not exist.',
      'Slide 4: embed needs an https:// url or a file in the talk folder.',
      'Slide 5: embed needs an https:// url or a file in the talk folder.',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
