import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'quorum.js');

function talk() {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-build-'));
  writeFileSync(join(dir, 'talk.md'), '# A talk\n\n![A picture](images/a.svg)\n');
  mkdirSync(join(dir, 'images'));
  writeFileSync(join(dir, 'images', 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  mkdirSync(join(dir, '.quorum'));
  writeFileSync(join(dir, '.quorum', 'session.json'), '{}');
  mkdirSync(join(dir, 'node_modules'));
  return dir;
}

const build = (args) => spawnSync(process.execPath, [CLI, 'build', ...args], { encoding: 'utf8' });

// The CI workflow of a new talk runs `quorum build . --out build`: the
// output is inside the talk folder, which a plain copy refuses.
test('quorum build writes into a folder inside the talk, as the CI does', () => {
  const dir = talk();
  try {
    for (const out of ['build', join('site', 'deep'), null]) {
      const r = build(out ? [dir, '--out', join(dir, out)] : [dir]);
      assert.equal(r.status, 0, r.stderr);
      const talkCopy = join(dir, out || 'dist', 'talk');
      assert.ok(existsSync(join(talkCopy, 'talk.md')), `${out || 'dist'}: the talk is copied`);
      assert.ok(existsSync(join(talkCopy, 'images', 'a.svg')), `${out || 'dist'}: its pictures too`);
      assert.ok(!existsSync(join(talkCopy, '.quorum')), 'never the session data');
      assert.ok(!existsSync(join(talkCopy, 'node_modules')), 'nor the dependencies');
      assert.ok(!existsSync(join(talkCopy, out || 'dist')), 'nor the build itself');
    }
    // A second build next to the first does not copy the first one in.
    const again = build([dir, '--out', join(dir, 'build')]);
    assert.equal(again.status, 0, again.stderr);
    assert.ok(!existsSync(join(dir, 'build', 'talk', 'dist')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
