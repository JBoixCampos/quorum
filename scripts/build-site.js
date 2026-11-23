// Builds the website: the landing page in site/ plus a playable build of
// examples/demo in _site/demo. GitHub Pages publishes _site.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'site'), OUT, { recursive: true });
cpSync(join(ROOT, 'app', 'favicon.svg'), join(OUT, 'favicon.svg'));
cpSync(join(ROOT, 'app', 'fonts'), join(OUT, 'fonts'), { recursive: true });
execFileSync(process.execPath, [join(ROOT, 'bin', 'quorum.js'), 'build', join(ROOT, 'examples', 'demo'), '--out', join(OUT, 'demo')], { stdio: 'inherit' });
console.log(`Site ready in ${OUT}`);
