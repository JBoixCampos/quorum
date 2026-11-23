// Syntax highlighting for code blocks: a small tokenizer for common
// languages, enough to colour keywords, strings, comments, numbers and
// function names. No dependencies; runs in Node and in the browser.

import { escapeHtml } from './text.js';

const words = (s) => new Set(s.split(/\s+/));

const C_LIKE = 'if else for while do switch case break continue return function const let var new class extends this super import export from default try catch finally throw typeof instanceof in of async await yield void delete null undefined true false static public private protected interface type enum implements package';

const LANGS = {
  js: { keywords: words(C_LIKE), line: '//', block: ['/*', '*/'], strings: ['"', "'", '`'] },
  python: { keywords: words('def class if elif else for while return import from as with try except finally raise lambda yield pass break continue and or not in is None True False global nonlocal async await self print'), line: '#', strings: ['"""', "'''", '"', "'"] },
  bash: { keywords: words('if then else elif fi for while do done case esac function return in export local echo cd sudo npm npx node git quorum'), line: '#', strings: ['"', "'"] },
  json: { keywords: words('true false null'), strings: ['"'] },
  css: { keywords: words('important'), block: ['/*', '*/'], strings: ['"', "'"] },
  html: { keywords: words(''), block: ['<!--', '-->'], strings: ['"', "'"] },
  sql: { keywords: words('select from where and or not insert into values update set delete create table drop alter join left right inner outer on group by order having limit as distinct count sum avg min max null is like in between union all case when then else end primary key'), line: '--', block: ['/*', '*/'], strings: ["'", '"'], ignoreCase: true },
  go: { keywords: words('package import func var const type struct interface map chan go defer if else for range switch case default return break continue select nil true false make new len append'), line: '//', block: ['/*', '*/'], strings: ['"', '`', "'"] },
  rust: { keywords: words('fn let mut const static struct enum impl trait pub use mod crate self Self if else match for while loop return break continue as in ref move async await where dyn true false Some None Ok Err'), line: '//', block: ['/*', '*/'], strings: ['"'] },
  java: { keywords: words(`${C_LIKE} void int long double float boolean char byte short final abstract synchronized throws`), line: '//', block: ['/*', '*/'], strings: ['"', "'"] },
  c: { keywords: words('int long short char float double void unsigned signed struct union enum typedef const static extern return if else for while do switch case break continue default sizeof include define NULL true false auto class namespace template public private std'), line: '//', block: ['/*', '*/'], strings: ['"', "'"] },
  ruby: { keywords: words('def class module if elsif else unless end while until for in do return yield begin rescue ensure raise nil true false self require puts attr_accessor'), line: '#', strings: ['"', "'"] },
  php: { keywords: words(`${C_LIKE} echo foreach as elseif endif array fn`), line: '//', block: ['/*', '*/'], strings: ['"', "'"] },
};

const ALIASES = {
  javascript: 'js', ts: 'js', typescript: 'js', jsx: 'js', tsx: 'js', mjs: 'js', node: 'js',
  py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', yaml: 'python', yml: 'python', toml: 'python',
  xml: 'html', svg: 'html', vue: 'html', scss: 'css', less: 'css', golang: 'go', rs: 'rust', kotlin: 'java', kt: 'java',
  swift: 'java', cs: 'java', csharp: 'java', cpp: 'c', 'c++': 'c', h: 'c', rb: 'ruby', psql: 'sql', postgres: 'sql',
};

export function languageOf(name) {
  const n = String(name || '').toLowerCase();
  if (LANGS[n]) return n;
  return ALIASES[n] || null;
}

const span = (cls, text) => `<span class="tok-${cls}">${escapeHtml(text)}</span>`;

// Highlighted HTML for `code`, or escaped text for an unknown language.
export function highlight(code, lang) {
  const name = languageOf(lang);
  if (!name) return escapeHtml(code);
  const L = LANGS[name];
  let out = '';
  let i = 0;
  const src = String(code);
  const at = (s) => s && src.startsWith(s, i);
  while (i < src.length) {
    const ch = src[i];
    if (L.line && at(L.line)) {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      out += span('comment', src.slice(i, stop));
      i = stop;
      continue;
    }
    if (L.block && at(L.block[0])) {
      const end = src.indexOf(L.block[1], i + L.block[0].length);
      const stop = end < 0 ? src.length : end + L.block[1].length;
      out += span('comment', src.slice(i, stop));
      i = stop;
      continue;
    }
    const quote = (L.strings || []).find((q) => at(q));
    if (quote) {
      let j = i + quote.length;
      while (j < src.length && !src.startsWith(quote, j)) {
        if (src[j] === '\\') j += 1;
        if (quote.length === 1 && src[j] === '\n' && quote !== '`') break;
        j += 1;
      }
      j = Math.min(src.length, j + quote.length);
      out += span('string', src.slice(i, j));
      i = j;
      continue;
    }
    if (name === 'html' && ch === '<') {
      const m = src.slice(i).match(/^<\/?[a-zA-Z][\w-]*/);
      if (m) {
        out += span('keyword', m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (/[0-9]/.test(ch) && !/[\w$]/.test(src[i - 1] || '')) {
      const m = src.slice(i).match(/^(0x[0-9a-f]+|\d[\d_]*(\.\d+)?(e[+-]?\d+)?)/i);
      out += span('number', m[0]);
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$@-]/.test(ch) && !/[\w$-]/.test(src[i - 1] || '')) {
      const m = src.slice(i).match(name === 'css' ? /^[A-Za-z_-][\w-]*/ : /^[A-Za-z_$@][\w$]*/);
      if (m) {
        const word = m[0];
        const key = L.ignoreCase ? word.toLowerCase() : word;
        const after = src.slice(i + word.length);
        if (L.keywords.has(key)) out += span('keyword', word);
        else if (name === 'css' && /^\s*:/.test(after)) out += span('property', word);
        else if (/^\s*\(/.test(after) && name !== 'css') out += span('function', word);
        else out += escapeHtml(word);
        i += word.length;
        continue;
      }
    }
    out += escapeHtml(ch);
    i += 1;
  }
  return out;
}

// Splits highlighted HTML into lines, keeping spans open across lines.
export function splitLines(html) {
  const lines = [];
  let open = [];
  html.split('\n').forEach((line) => {
    const prefix = open.join('');
    const tags = line.match(/<span class="[^"]*">|<\/span>/g) || [];
    tags.forEach((t) => {
      if (t === '</span>') open.pop();
      else open.push(t);
    });
    lines.push(prefix + line + '</span>'.repeat(open.length));
  });
  return lines;
}
