// Builds the website in _site/, which GitHub Pages publishes:
//
//   index.html             the landing page (site/index.html)
//   docs/ ...              one page per docs/*.md, rendered at build time
//   examples/              a gallery of the example components
//   playground/            Markdown next to the live slide
//   demo/                  a playable static build of examples/demo
//   showcase/              a playable static build of examples/showcase (themes, layouts, blocks)
//   llms.txt, llms-full.txt   the docs for AI agents
//
// docs/*.md stay the single source of truth. Every link is relative, so the
// site works under /quorum/ on GitHub Pages and from any local folder.
// The build fails if any internal link is broken.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkLinks } from './site/links.js';
import { escapeHtml, firstParagraph, inline, render } from './site/markdown.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, '_site'));
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const SITE_URL = PKG.homepage.replace(/\/?$/, '/');
const REPO = 'https://github.com/JBoixCampos/quorum';
const BLOB = `${REPO}/blob/main/`;
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

// The docs, in reading order. Every docs/*.md must be listed here.
const DOCS = [
  { file: 'README.md', slug: '', label: 'Overview' },
  { file: 'format.md', slug: 'format', label: 'The talk format' },
  { file: 'design.md', slug: 'design', label: 'Design and themes' },
  { file: 'components.md', slug: 'components', label: 'Components' },
  { file: 'powerpoint.md', slug: 'powerpoint', label: 'PowerPoint and PDF' },
  { file: 'repository.md', slug: 'repository', label: 'Working in a repository' },
  { file: 'studio.md', slug: 'studio', label: 'Studio' },
  { file: 'remix.md', slug: 'remix', label: 'Remixing slides' },
  { file: 'giving-a-talk.md', slug: 'giving-a-talk', label: 'Giving a talk' },
  { file: 'agents.md', slug: 'agents', label: 'Built for agents' },
];

// Components the playground can render: they are in the demo build.
const BUILT_IN = ['countdown', 'qr'];
const PLAYABLE = new Set([...BUILT_IN, 'word-cloud', 'counter']);

// --- paths ------------------------------------------------------------------

const docPath = (doc) => (doc.slug ? `docs/${doc.slug}/` : 'docs/');
const fileOf = (path) => (path.endsWith('/') || path === '' ? `${path}index.html` : path);

// A relative link from the page at `from` (a site path such as
// "docs/format/") to `to` ("examples/", "llms.txt", "" for home).
export function href(from, to) {
  const fromDir = posix.dirname(fileOf(from));
  const [path, fragment] = to.split('#');
  const isDir = path === '' || path.endsWith('/');
  let r = posix.relative(fromDir, path.replace(/\/$/, '') || '.');
  if (isDir) r = r ? `${r}/` : './';
  return fragment !== undefined ? `${r}#${fragment}` : r;
}

// Rewrites a link found in docs/<file> for the page at `from`.
function docLink(from) {
  return (link) => {
    if (link.startsWith(SITE_URL)) return href(from, link.slice(SITE_URL.length));
    if (/^(https?:|mailto:|#)/.test(link)) return link;
    const [path, fragment] = link.split('#');
    const repoPath = posix.normalize(posix.join('docs', path));
    // Screenshots and other images are copied to the same place.
    if (repoPath.startsWith('docs/images/')) return href(from, repoPath);
    const doc = DOCS.find((d) => `docs/${d.file}` === repoPath);
    if (doc) return href(from, docPath(doc) + (fragment ? `#${fragment}` : ''));
    const example = repoPath.match(/^examples\/components\/([\w-]+)\.js$/);
    if (example) return href(from, `examples/#${example[1]}`);
    return BLOB + repoPath + (fragment ? `#${fragment}` : '');
  };
}

// --- the shared page template -----------------------------------------------

const NAV = [
  ['Docs', 'docs/'],
  ['Examples', 'examples/'],
  ['Playground', 'playground/'],
  ['For agents', 'docs/agents/'],
];

// The section of the site a page belongs to, for the current link.
function current(path, to) {
  if (to === 'docs/agents/') return path === to;
  if (to === 'docs/') return path.startsWith('docs/') && path !== 'docs/agents/';
  return path.startsWith(to);
}

function header(path) {
  const links = NAV.map(([label, to]) => `<a href="${href(path, to)}"${current(path, to) ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('\n        ');
  return `<header class="top">
    <div class="wrap">
      <a class="brand" href="${href(path, '')}"><img src="${href(path, 'favicon.svg')}" alt="">Quorum</a>
      <div class="top-right">
        <nav class="links" aria-label="Main">
        ${links}
        <a href="${REPO}">GitHub</a>
        </nav>
        <a class="button ink" href="${href(path, '#start')}">Get started</a>
      </div>
    </div>
  </header>`;
}

function footer(path) {
  const to = (p) => href(path, p);
  return `<footer class="site">
    <div class="wrap">
      <div class="grid">
        <div>
          <a class="brand" href="${to('')}"><img src="${to('favicon.svg')}" alt="">Quorum</a>
          <p>Presentations, but interactive. Agent ready. Open source, under the MIT license.</p>
        </div>
        <nav aria-label="Learn">
          <h2>Learn</h2>
          <ul>
            <li><a href="${to('docs/')}">Overview</a></li>
            <li><a href="${to('docs/format/')}">The talk format</a></li>
            <li><a href="${to('docs/design/')}">Design and themes</a></li>
            <li><a href="${to('docs/components/')}">Components</a></li>
            <li><a href="${to('docs/giving-a-talk/')}">Giving a talk</a></li>
          </ul>
        </nav>
        <nav aria-label="Try">
          <h2>Try</h2>
          <ul>
            <li><a href="${to('playground/')}">Playground</a></li>
            <li><a href="${to('demo/')}">Demo talk</a></li>
            <li><a href="${to('showcase/')}">Showcase</a></li>
            <li><a href="${to('examples/')}">Examples</a></li>
          </ul>
        </nav>
        <nav aria-label="For agents">
          <h2>For agents</h2>
          <ul>
            <li><a href="${to('docs/agents/')}">Set up your agent</a></li>
            <li><a href="${to('llms.txt')}">llms.txt</a></li>
            <li><a href="${to('llms-full.txt')}">llms-full.txt</a></li>
            <li><a href="${BLOB}agents/quorum/SKILL.md">The skill</a></li>
          </ul>
        </nav>
      </div>
      <div class="base">
        <span>No accounts. No cloud. No trackers.</span>
        <a href="${REPO}">github.com/JBoixCampos/quorum</a>
      </div>
    </div>
  </footer>`;
}

// What WhatsApp, Slack, LinkedIn and others show for a shared link: a
// title, a description and site/og.png (made by scripts/og-image.js).
// They need absolute URLs, so these point at the published site.
function social(path, title, description) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  return `<meta property="og:type" content="website">
  <meta property="og:site_name" content="Quorum">
  <meta property="og:title" content="${t}">
  <meta property="og:description" content="${d}">
  <meta property="og:url" content="${SITE_URL}${path}">
  <meta property="og:image" content="${SITE_URL}og.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Quorum: presentations, but interactive. Agent ready.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#ff6a00">`;
}

function page({ path, title, description, body, scripts = [] }) {
  const to = (p) => href(path, p);
  const extra = scripts.map((s) => `\n  <script type="module" src="${to(s)}"></script>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${social(path, title, description)}
  <link rel="icon" href="${to('favicon.svg')}">
  <link rel="stylesheet" href="${to('assets/site.css')}">
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  ${header(path)}
  <main id="main">
${body}
  </main>
  ${footer(path)}
  <script type="module" src="${to('assets/site.js')}"></script>${extra}
</body>
</html>
`;
}

function write(path, html) {
  const file = join(OUT, fileOf(path));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

// --- playground links -------------------------------------------------------

// A Markdown sample that the playground can show: blocks it can render,
// without the "# explanation" comments the docs add to some lines.
function playable(text) {
  if (!/^\s*:::\s*[a-z]|^#{1,3}\s|^---$/m.test(text)) return null;
  if (/-->\s+\S/.test(text)) return null;
  const names = [...text.matchAll(/^\s*:::\s*([a-z][\w-]*)\s*([\w-]*)/gm)];
  if (!names.length && !/^---$/m.test(text)) return null;
  if (names.length && names.every((m) => m[1] === 'notes')) return null;
  if (names.some((m) => m[1] === 'component' && !PLAYABLE.has(m[2]))) return null;
  return text.split('\n').map((l) => l.replace(/\s{2,}#\s.*$/, '')).join('\n');
}

function tryLink(from, markdown) {
  return `<p class="try"><a href="${href(from, 'playground/')}#md=${encodeURIComponent(markdown)}">Try it in the playground</a></p>`;
}

// --- the demo talk, slide by slide -----------------------------------------

const DEMO_SOURCE = read('examples', 'demo', 'talk.md');
const DEMO_SLIDES = DEMO_SOURCE.replace(/^---\n[\s\S]*?\n---\n/, '').split(/^---$/m).map((s) => s.trim()).filter(Boolean);

// The Markdown of one demo slide (counted from 1) next to the live slide.
function demoSlide(from, n) {
  const source = DEMO_SLIDES[n - 1];
  if (!source) throw new Error(`The demo talk has no slide ${n}.`);
  const shown = source.replace(/\n*::: notes[\s\S]*?\n:::/g, '').trim();
  return `<div class="side-by-side">
  <pre><code class="language-markdown">${escapeHtml(shown)}</code></pre>
  <figure>
    <div class="screen"><iframe src="${href(from, 'demo/')}?slide=${n - 1}" title="The slide, live, with a simulated audience" loading="lazy"></iframe></div>
  </figure>
</div>`;
}

// --- docs pages -------------------------------------------------------------

function buildDocs() {
  const files = readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
  const missing = files.filter((f) => !DOCS.some((d) => d.file === f));
  if (missing.length) throw new Error(`Add ${missing.join(', ')} to DOCS in scripts/build-site.js.`);

  DOCS.forEach((doc, n) => {
    const path = docPath(doc);
    const source = read('docs', doc.file);
    const result = render(source, {
      link: docLink(path),
      code: (lang, text) => {
        const md = lang === 'markdown' ? playable(text) : null;
        return md ? tryLink(path, md) : '';
      },
    });
    const body = result.blocks.map((b) => {
      if (typeof b === 'string') return b;
      if (b.marker === 'demo-slide') return demoSlide(path, Number(b.value));
      return '';
    }).join('\n');
    doc.title = result.title;
    doc.description = firstParagraph(source);

    const pages = DOCS.map((d) => `<li><a href="${href(path, docPath(d))}"${d === doc ? ' aria-current="page"' : ''}>${d.label}</a></li>`).join('');
    const toc = result.headings.filter((h) => h.level <= 3)
      .map((h) => `<li><a class="${h.level === 3 ? 'sub' : ''}" href="#${h.id}">${inline(h.text)}</a></li>`).join('');
    const prev = DOCS[n - 1];
    const next = DOCS[n + 1];
    const pager = `<nav class="pager" aria-label="Pages">
      ${prev ? `<a href="${href(path, docPath(prev))}"><span>Previous</span>${prev.label}</a>` : ''}
      ${next ? `<a class="next" href="${href(path, docPath(next))}"><span>Next</span>${next.label}</a>` : ''}
    </nav>`;
    const edit = `<p class="try"><a href="${BLOB}docs/${doc.file}">Edit this page on GitHub</a></p>`;

    write(path, page({
      path,
      title: doc.slug ? `${result.title} · Quorum docs` : 'Quorum docs',
      description: doc.description,
      body: `    <div class="wrap page-head">
      <p class="kicker${doc.slug === 'agents' ? ' agent' : ''}">${doc.slug === 'agents' ? 'agent ready' : `docs / ${escapeHtml(doc.label.toLowerCase())}`}</p>
      <h1>${inline(result.title)}</h1>
    </div>
    <div class="wrap docs">
      <aside class="side" aria-label="Documentation">
        <h2>Docs</h2>
        <ul class="pages">${pages}</ul>
        ${toc ? `<div class="toc-wrap"><h2>On this page</h2><ul class="toc">${toc}</ul></div>` : ''}
      </aside>
      <article class="prose">
${body}
      ${edit}
      ${pager}
      </article>
    </div>`,
    }));
  });
}

// --- examples gallery -------------------------------------------------------

// The comment at the top of a component file, as Markdown: indented lines
// become code blocks.
function headerComment(source) {
  const lines = [];
  for (const line of source.split('\n')) {
    if (!line.startsWith('//')) break;
    lines.push(line.replace(/^\/\/ ?/, ''));
  }
  const out = [];
  let code = null;
  lines.forEach((l) => {
    const indented = /^ {2}\S/.test(l) || (code && /^ {2}/.test(l));
    if (indented) {
      if (!code) {
        code = [];
        out.push(code);
      }
      code.push(l.slice(2));
    } else if (l.trim() === '' && code) {
      code.push('');
    } else {
      code = null;
      out.push(l);
    }
  });
  return out.map((x) => {
    if (typeof x === 'string') return x;
    const text = x.join('\n').replace(/\n+$/, '');
    const lang = text.startsWith(':::') ? 'markdown' : (/^(llama|npm|quorum)/.test(text) ? 'bash' : 'js');
    return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
  }).join('\n');
}

const NAMES = { qr: 'QR code' };

function humanName(name) {
  if (NAMES[name]) return NAMES[name];
  const s = name.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function exampleCard(from, { name, file, markdown, tag, slide }) {
  const result = render(markdown, { link: docLink('docs/') });
  const blocks = result.blocks.filter((b) => typeof b === 'string');
  const first = blocks.findIndex((b) => b.startsWith('<p>'));
  const summary = blocks[first].replace(/ Used in talk\.md as:<\/p>$/, '</p>').replace(/<p>(?:An? )?(?:example component: )?/i, '<p>').replace(/<p>(.)/, (_, c) => `<p>${c.toUpperCase()}`);
  const usageIndex = blocks.findIndex((b) => b.includes('class="language-markdown"'));
  const usageSource = (markdown.match(/```markdown\n([\s\S]*?)\n```/) || [])[1] || '';
  // Sentences that pointed at the usage block, which now sits on its own.
  const rest = blocks.filter((_, i) => i !== first && i !== usageIndex)
    .map((b, i, all) => (b.startsWith('<p>') && !(all[i + 1] || '').startsWith('<pre')
      ? b.replace(/ Used in talk\.md as:<\/p>$/, '</p>').replace(/:<\/p>$/, '.</p>') : b));
  const links = [];
  if (file) links.push(`<a class="button" href="${BLOB}${file}">Source on GitHub</a>`);
  if (PLAYABLE.has(name) && usageSource) {
    links.push(`<a class="button" href="${href(from, 'playground/')}#md=${encodeURIComponent(usageSource)}">Try it in the playground</a>`);
  }
  const preview = slide >= 0
    ? `<figure class="preview">
        <div class="screen"><iframe src="${href(from, 'examples/live/')}?slide=${slide}" title="The ${escapeHtml(humanName(name))} component, live" loading="lazy"></iframe></div>
        <figcaption><span class="live">Live</span>${escapeHtml(LIVE[name] ? LIVE[name].caption : 'With a simulated audience. Click the slide to start it.')}</figcaption>
      </figure>`
    : '';
  return `<article class="card" id="${name}">
      <div class="prose">
        <h3>${escapeHtml(humanName(name))}${tag ? `<span class="tag">${tag}</span>` : ''}</h3>
        ${summary}
        ${rest.join('\n')}
        <div class="links">${links.join('')}</div>
      </div>
      <div class="prose">
        ${blocks[usageIndex] || ''}
        ${preview}
      </div>
    </article>`;
}

const BUILT_IN_DOCS = [
  { name: 'countdown', markdown: 'A countdown on the slide. Click it, or press the right arrow, to start and pause it. The time is shared, so your panel shows the same.\n\n```markdown\n::: component countdown\nseconds: 90\n:::\n```' },
  { name: 'qr', markdown: `A QR code for any link, for example to your slides or a survey.\n\n\`\`\`markdown\n::: component qr\nurl: ${SITE_URL}\nlabel: This website\n:::\n\`\`\`` },
  { name: 'embed', markdown: 'Another web page inside the slide: an `https://` link (the site must allow being shown in a frame), or an HTML file in your talk folder, which works without internet.\n\n```markdown\n::: component embed\nurl: pages/chart.html\n:::\n```' },
];

// What each live example needs beyond its usage block: the slide's
// Markdown when it differs, and the line under the slide.
const LIVE = {
  'word-cloud': { caption: 'Click the slide to open it, and the simulated audience starts answering.' },
  counter: { caption: 'Click the number. The count is shared state.' },
  'next-word-explorer': {
    caption: 'Here with model: sample, a small table of made-up probabilities, so it runs without a model. Click a word or draw one.',
    source: '::: component next-word-explorer\ntext: The capital of France is\nmodel: sample\n:::',
  },
  countdown: { caption: 'Click the time to start it, and again to pause it.' },
  qr: { caption: 'Drawn in the browser, with no request to any service. Scan it to open this website.' },
  embed: { caption: 'The page is pages/chart.html, a file in the talk folder.' },
};

// The page the embed example shows: any HTML file in a talk folder works.
const CHART_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>A page in the talk folder</title>
<style>
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-content: center; gap: 28px; padding: 40px; background: #fbfaf8; color: #16181a; font: 400 28px/1.4 system-ui, sans-serif; }
  h1 { margin: 0; font-size: 44px; }
  p { margin: 0; color: #5d6468; max-width: 32em; }
  .bars { display: flex; align-items: flex-end; gap: 18px; height: 220px; }
  .bars span { width: 64px; border-radius: 10px 10px 4px 4px; background: #ff6a00; transform-origin: bottom; animation: grow 1.2s cubic-bezier(.2,.7,.2,1) both; }
  .bars span:nth-child(2n) { background: #ffb37a; }
  @keyframes grow { from { transform: scaleY(0); } }
  @media (prefers-reduced-motion: reduce) { .bars span { animation: none; } }
</style>
</head>
<body>
  <h1>pages/chart.html</h1>
  <p>Any HTML file in your talk folder can fill a slide: a chart, a map, a small app. It works without internet.</p>
  <div class="bars" aria-hidden="true">
    <span style="height:35%"></span><span style="height:60%;animation-delay:.1s"></span><span style="height:45%;animation-delay:.2s"></span><span style="height:80%;animation-delay:.3s"></span><span style="height:100%;animation-delay:.4s"></span><span style="height:70%;animation-delay:.5s"></span>
  </div>
</body>
</html>
`;

// One talk with a slide per example, built into examples/live/ so every card
// can show its component working. Returns the slide index of each example.
function buildLiveExamples(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-examples-'));
  try {
    mkdirSync(join(dir, 'components'));
    mkdirSync(join(dir, 'pages'));
    writeFileSync(join(dir, 'pages', 'chart.html'), CHART_PAGE);
    const slides = entries.map((e) => {
      if (e.file) cpSync(join(ROOT, e.file), join(dir, 'components', `${e.name}.js`));
      const source = (LIVE[e.name] && LIVE[e.name].source) || (e.markdown.match(/```markdown\n([\s\S]*?)\n```/) || [])[1];
      if (!source) throw new Error(`The example ${e.name} has no usage block to show live.`);
      return `## ${humanName(e.name)}\n\n${source}`;
    });
    writeFileSync(join(dir, 'talk.md'), `---\ntitle: Quorum components\ntheme: light\n---\n\n${slides.join('\n\n---\n\n')}\n`);
    execFileSync(process.execPath, [join(ROOT, 'bin', 'quorum.js'), 'build', dir, '--out', join(OUT, 'examples', 'live')], { stdio: 'ignore' });
    return new Map(entries.map((e, i) => [e.name, i]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildExamples() {
  const path = 'examples/';
  // The simplest first; anything new in examples/components goes at the end.
  const first = ['examples/components/word-cloud.js', 'templates/starter/components/counter.js'];
  const files = [...first, ...readdirSync(join(ROOT, 'examples', 'components')).filter((f) => f.endsWith('.js')).sort()
    .map((f) => `examples/components/${f}`).filter((f) => !first.includes(f))];
  const tags = { 'templates/starter/components/counter.js': 'in every new talk' };
  const own = files.map((file) => ({
    name: file.split('/').pop().replace(/\.js$/, ''),
    file,
    markdown: headerComment(read(file)),
    tag: tags[file] || (file.includes('next-word') ? 'needs a local model' : ''),
  }));
  const builtInEntries = BUILT_IN_DOCS.map((b) => ({ ...b, tag: 'built in' }));
  const slideOf = buildLiveExamples([...own, ...builtInEntries]);
  const cards = own.map((e) => exampleCard(path, { ...e, slide: slideOf.get(e.name) }));
  const builtIn = builtInEntries.map((e) => exampleCard(path, { ...e, slide: slideOf.get(e.name) }));

  write(path, page({
    path,
    title: 'Examples · Quorum',
    description: 'Components you can copy into a talk: a word cloud, a language model on your laptop, a counter and the built-in countdown, QR code and embed.',
    body: `    <div class="wrap page-head">
      <p class="kicker">examples / components</p>
      <h1>Examples</h1>
      <p class="lede">A component is one JavaScript file in your talk's <code>components/</code> folder. Each one runs live below, with a simulated audience. Copy any of these, use it from <code>talk.md</code>, and change it. <a href="${href(path, 'docs/components/')}">How components work</a>.</p>
    </div>
    <div class="wrap gallery">
      ${cards.join('\n      ')}
      <h2 class="group" id="built-in">Built in</h2>
      ${builtIn.join('\n      ')}
    </div>`,
  }));
}

// --- playground -------------------------------------------------------------

function buildPlayground() {
  const path = 'playground/';
  const start = `---
title: My talk
---

<!-- layout: center -->

# My talk

Write on the left. Add slides with the buttons above.

---

::: poll {#lunch} Where should we go for lunch?
- Tacos
- Ramen
- [x] The place with the long queue

The queue is long for a reason.
:::
`;
  write(path, page({
    path,
    title: 'Playground · Quorum',
    description: 'Write a Quorum slide in Markdown and see it live, with a simulated audience that votes.',
    scripts: ['assets/playground.js'],
    body: `    <div class="wrap page-head">
      <p class="kicker">playground</p>
      <h1>Playground</h1>
      <p class="lede">Write Markdown on the left and the real slide appears on the right, with 24 simulated people ready to vote. Your draft stays in this browser. When you like it, copy it into <code>talk.md</code>. <a href="${href(path, 'docs/format/')}">Every block is in the format guide</a>.</p>
    </div>
    <div class="wrap" style="padding-bottom:88px">
      <div class="playground tall" data-playground data-persist="page" data-hash data-frame="${href(path, 'demo/')}?playground=1">
        <textarea aria-label="Markdown of the talk">${escapeHtml(start)}</textarea>
      </div>
    </div>`,
  }));
}

// --- landing ----------------------------------------------------------------

function buildLanding() {
  const html = read('site', 'index.html')
    .replace('{{social}}', social('', 'Quorum: presentations, but interactive. Agent ready.',
      'Presentations where the room takes part, written in Markdown so your AI agent can write, check and extend them. Open source, runs from your laptop.'))
    .replace('{{header}}', header(''))
    .replace('{{footer}}', footer(''));
  writeFileSync(join(OUT, 'index.html'), html);
}

// --- llms.txt ---------------------------------------------------------------

function buildLlms() {
  const index = `# Quorum

> Quorum is an open-source toolkit for presentations where the audience takes part, built so AI agents can write and check them. A talk is one Markdown file (talk.md) with ::: blocks for polls, estimates, rounds, a shared sentence, questions and custom JavaScript components. People answer from their phones through a QR code, and everything runs from the speaker's laptop with the quorum command (Node 18 or newer, no dependencies).

Install with \`npm install -g github:JBoixCampos/quorum\` (Node.js 18 or newer). To write or edit a talk: run \`quorum new <folder>\`, edit talk.md, and run \`quorum check <folder> --json\` until it reports no warnings. Never touch the .quorum/ folder and never share the presenter key.

## Docs

${DOCS.map((d) => `- [${d.label}](${SITE_URL}${docPath(d)}): ${d.description}`).join('\n')}
- [Full reference in one file](${SITE_URL}llms-full.txt): every doc above, plus the example components, as plain text

## Examples

- [Example components](${SITE_URL}examples/): a word cloud, a next-word explorer with a local language model, a counter
- [Demo talk source](${BLOB}examples/demo/talk.md): seven slides, one feature each
- [Showcase talk source](${BLOB}examples/showcase/talk.md): a theme, layouts, cards, a timeline, a chart, result looks, morphing titles and reactions
- [Slide patterns](${BLOB}agents/quorum/patterns.md): proven slides to build a talk from, and how to choose a theme
- [Starter talk source](${BLOB}templates/starter/talk.md): every feature, as created by quorum new
- [Branded talk source](${BLOB}examples/brand/talk.md): colours, logo, fonts and footer of its own

## Optional

- [Agent skill](${BLOB}agents/quorum/SKILL.md): write and check a talk, and build components for it
- [AGENTS.md](${BLOB}AGENTS.md): for agents working on Quorum itself
- [Source code](${REPO})
`;
  const parts = DOCS.map((d) => `${'='.repeat(72)}\n${d.label} (${SITE_URL}${docPath(d)})\n${'='.repeat(72)}\n\n${read('docs', d.file).trim()}\n`);
  const sources = [
    'examples/components/word-cloud.js',
    'templates/starter/components/counter.js',
    'templates/starter/talk.md',
    'examples/brand/talk.md',
    'examples/showcase/talk.md',
    'agents/quorum/patterns.md',
  ].map((f) => `${'='.repeat(72)}\nFile: ${f}\n${'='.repeat(72)}\n\n${read(f).trim()}\n`);
  const full = `# Quorum: the full reference

This file has the whole Quorum documentation, then an example component, the
counter component, the starter talk that \`quorum new\` creates, the branded and
showcase talks, and the slide patterns.
Source: ${REPO}

${[...parts, ...sources].join('\n')}`;
  writeFileSync(join(OUT, 'llms.txt'), index);
  writeFileSync(join(OUT, 'llms-full.txt'), full);
}

// --- build ------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'site'), OUT, { recursive: true });
cpSync(join(ROOT, 'app', 'favicon.svg'), join(OUT, 'favicon.svg'));
cpSync(join(ROOT, 'docs', 'images'), join(OUT, 'docs', 'images'), { recursive: true });
cpSync(join(ROOT, 'app', 'fonts'), join(OUT, 'fonts'), { recursive: true });
execFileSync(process.execPath, [join(ROOT, 'bin', 'quorum.js'), 'build', join(ROOT, 'examples', 'demo'), '--out', join(OUT, 'demo')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(ROOT, 'bin', 'quorum.js'), 'build', join(ROOT, 'examples', 'showcase'), '--out', join(OUT, 'showcase')], { stdio: 'inherit' });
// The playground renders through the demo build: give it every example.
cpSync(join(ROOT, 'templates', 'starter', 'components', 'counter.js'), join(OUT, 'demo', 'talk', 'components', 'counter.js'));

buildDocs();
buildExamples();
buildPlayground();
buildLanding();
buildLlms();

const problems = checkLinks(OUT);
if (problems.length) {
  console.error(`\n${problems.length} broken links:`);
  problems.forEach((p) => console.error(`  ${p.page}: ${p.link} (${p.problem})`));
  process.exit(1);
}
console.log(`Site ready in ${OUT}. All internal links work.`);
