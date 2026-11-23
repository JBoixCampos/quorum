// Makes the contents of the "quorum-talk" template repository: what
// "Use this template" on GitHub copies. It is exactly what `quorum new`
// makes, so the two ways to start stay the same.
//
//   node scripts/template-repo.js [folder]     (default _template/)
//
// To publish: push the folder to github.com/JBoixCampos/quorum-talk and,
// in its Settings, tick "Template repository". Run this again after a
// change to templates/starter and push the result.

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(ROOT, '_template'));
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
execFileSync('node', [join(ROOT, 'bin', 'quorum.js'), 'new', out], { stdio: 'ignore' });
console.log(`The template repository is in ${out}.
Push it to github.com/JBoixCampos/quorum-talk and tick "Template repository" in its Settings.`);
