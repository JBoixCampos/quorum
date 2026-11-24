import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, readdirSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'quorum.js');
const STARTER = join(ROOT, 'templates', 'starter');
const SHOWCASE = join(ROOT, 'examples', 'showcase');

test('the starter talk is the showcase talk, pictures included', () => {
  assert.equal(readFileSync(join(STARTER, 'talk.md'), 'utf8'), readFileSync(join(SHOWCASE, 'talk.md'), 'utf8'), 'change templates/starter/talk.md and examples/showcase/talk.md together');
  const pictures = readdirSync(join(SHOWCASE, 'images')).sort();
  assert.deepEqual(readdirSync(join(STARTER, 'images')).sort(), pictures);
  pictures.forEach((name) => {
    assert.ok(readFileSync(join(STARTER, 'images', name)).equals(readFileSync(join(SHOWCASE, 'images', name))), `images/${name} differs`);
  });
});

test('quorum new creates the bread talk with its pictures, and it checks clean', () => {
  const parent = mkdtempSync(join(tmpdir(), 'quorum-new-'));
  try {
    const dir = join(parent, 'my-talk');
    const made = spawnSync(process.execPath, [CLI, 'new', dir], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    assert.match(readFileSync(join(dir, 'talk.md'), 'utf8'), /^title: Why bread rises$/m);
    assert.ok(existsSync(join(dir, 'images', 'dough.svg')));
    assert.ok(existsSync(join(dir, '.gitignore')));
    const checked = spawnSync(process.execPath, [CLI, 'check', dir, '--json'], { encoding: 'utf8' });
    const report = JSON.parse(checked.stdout);
    assert.equal(report.ok, true, JSON.stringify(report.warnings));
    assert.equal(report.slides, 21);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
