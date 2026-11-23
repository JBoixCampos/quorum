// Checks every internal link in a built site: href and src attributes in
// HTML files must point to a file that exists, and a #fragment must match
// an id in the target page. External links (http, https, mailto) are not
// fetched.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(path);
    return e.name.endsWith('.html') ? [path] : [];
  });
}

function decode(text) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    idCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => decode(m[1]))));
  }
  return idCache.get(file);
}

// Returns a list of { page, link, problem }.
export function checkLinks(root) {
  idCache.clear();
  const base = resolve(root);
  const problems = [];
  htmlFiles(base).forEach((page) => {
    // Code samples are not links: leave out <pre> and the body of scripts
    // (a <script src> is still checked).
    const html = readFileSync(page, 'utf8')
      .replace(/<pre[\s\S]*?<\/pre>/g, '')
      .replace(/(<script[^>]*>)[\s\S]*?<\/script>/g, '$1</script>')
      .replace(/<textarea[\s\S]*?<\/textarea>/g, '');
    for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const link = decode(m[1]);
      const rel = relative(base, page);
      if (/^(https?:|mailto:|data:|javascript:)/i.test(link)) continue;
      if (link.startsWith('/')) {
        problems.push({ page: rel, link, problem: 'absolute path (breaks under /quorum/)' });
        continue;
      }
      const [path, fragment] = link.split('#');
      let target = path ? resolve(dirname(page), path.split('?')[0]) : page;
      if (!target.startsWith(base + sep) && target !== base) {
        problems.push({ page: rel, link, problem: 'outside the site' });
        continue;
      }
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
      if (!existsSync(target)) {
        problems.push({ page: rel, link, problem: 'no such file' });
        continue;
      }
      // "#md=..." on the playground is data for its script, not an anchor.
      if (fragment && !fragment.includes('=') && target.endsWith('.html') && !idsOf(target).has(fragment)) {
        problems.push({ page: rel, link, problem: `no id "${fragment}"` });
      }
    }
  });
  return problems;
}
