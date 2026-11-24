// Builds the website in _site/, which GitHub Pages publishes:
//
//   index.html             the landing page (site/index.html)
//   docs/ ...              one page per docs/*.md, rendered at build time
//   examples/              a gallery of the example components
//   playground/            Markdown next to the live slide
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

import { COMPONENTS, schema } from '../src/shared/design.js';
import { GROUPS } from './site/builtin.js';
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
  { file: 'README.md', slug: '', label: 'Get started' },
  { file: 'agents.md', slug: 'agents', label: 'Ask your agent' },
  { file: 'studio.md', slug: 'studio', label: 'Edit in Studio' },
  { file: 'giving-a-talk.md', slug: 'giving-a-talk', label: 'Present on the day' },
  { file: 'teamwork.md', slug: 'teamwork', label: 'Work as a team' },
  { file: 'powerpoint.md', slug: 'powerpoint', label: 'PowerPoint and PDF' },
  { file: 'remix.md', slug: 'remix', label: 'Alternatives for a slide' },
  { file: 'repository.md', slug: 'repository', label: 'Git and repositories' },
  { file: 'format.md', slug: 'format', label: 'The talk format' },
  { file: 'design.md', slug: 'design', label: 'Design and themes' },
  { file: 'components.md', slug: 'components', label: 'Components' },
];

// Components the playground can render: they are in the showcase build.
// (embed needs a page from the talk folder, so it is not one of them.)
const PLAYABLE = new Set(['countdown', 'qr', 'word-cloud', 'counter']);

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
  ['How it works', '#how'],
  ['Docs', 'docs/'],
  ['Playground', 'playground/'],
];

// The section of the site a page belongs to, for the current link.
function current(path, to) {
  if (to.startsWith('#')) return false;
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
        <button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch to dark mode" aria-pressed="false"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
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
          <p>Make a talk with your AI agent, and let the room join in. Free and open source, under the MIT licence.</p>
        </div>
        <nav aria-label="Learn">
          <h2>Learn</h2>
          <ul>
            <li><a href="${to('docs/')}">Get started</a></li>
            <li><a href="${to('docs/studio/')}">Edit in Studio</a></li>
            <li><a href="${to('docs/giving-a-talk/')}">Present on the day</a></li>
            <li><a href="${to('docs/teamwork/')}">Work as a team</a></li>
            <li><a href="${to('docs/powerpoint/')}">PowerPoint and PDF</a></li>
            <li><a href="${to('docs/format/')}">The talk format</a></li>
          </ul>
        </nav>
        <nav aria-label="Try">
          <h2>Try</h2>
          <ul>
            <li><a href="${to('playground/')}">Playground</a></li>
            <li><a href="${to('showcase/')}">Showcase</a></li>
            <li><a href="${to('examples/')}">Examples</a></li>
          </ul>
        </nav>
        <nav aria-label="For agents">
          <h2>For agents</h2>
          <ul>
            <li><a href="${to('docs/agents/')}">Ask your agent</a></li>
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
  <meta name="theme-color" content="#f4f2ec">`;
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
  <script>try{var t=localStorage.getItem('quorum-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
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

// --- the showcase talk, slide by slide -------------------------------------

const SHOWCASE_SOURCE = read('examples', 'showcase', 'talk.md');
const SHOWCASE_SLIDES = SHOWCASE_SOURCE.replace(/^---\n[\s\S]*?\n---\n/, '').split(/^---$/m).map((s) => s.trim()).filter(Boolean);

// The Markdown of one showcase slide (counted from 1) next to the live slide.
function showcaseSlide(from, n) {
  const source = SHOWCASE_SLIDES[n - 1];
  if (!source) throw new Error(`The showcase talk has no slide ${n}.`);
  const shown = source.replace(/\n*::: notes[\s\S]*?\n:::/g, '').trim();
  return `<div class="side-by-side">
  <pre><code class="language-markdown">${escapeHtml(shown)}</code></pre>
  <figure>
    <div class="screen"><iframe src="${href(from, 'showcase/')}?slide=${n - 1}&only=1" title="The slide, live, with a simulated audience" loading="lazy"></iframe></div>
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
      if (b.marker === 'showcase-slide') return showcaseSlide(path, Number(b.value));
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
        <div class="screen"><iframe src="${href(from, 'examples/live/')}?slide=${slide}&only=1" title="The ${escapeHtml(humanName(name))} component, live" loading="lazy"></iframe></div>
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

// The built-in components come from the registry (src/shared/design.js). The
// QR example points at this website, so the live slide can be scanned.
const BUILT_IN_DOCS = Object.entries(COMPONENTS).map(([name, c]) => {
  const example = name === 'qr' ? `::: component qr\nurl: ${SITE_URL}\nlabel: This website\n:::` : c.example;
  return { name, markdown: `${c.about}\n\n\`\`\`markdown\n${example}\n\`\`\`` };
});

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
  body { display: grid; place-content: center; gap: 28px; padding: 40px; background: #f4f2ec; color: #222522; font: 400 28px/1.4 system-ui, sans-serif; }
  h1 { margin: 0; font-size: 44px; }
  p { margin: 0; color: #5f635c; max-width: 32em; }
  .bars { display: flex; align-items: flex-end; gap: 18px; height: 220px; }
  .bars span { width: 64px; border-radius: 10px 10px 4px 4px; background: #e25536; transform-origin: bottom; animation: grow 1.2s cubic-bezier(.2,.7,.2,1) both; }
  .bars span:nth-child(2n) { background: #222522; }
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

// The live slide of a built-in example: the source alone, or the source under
// a heading ("## Cards\n\n"), or a slide of its own.
function liveSlide(item) {
  if (item.slide === undefined) return item.source;
  return item.slide.endsWith('\n\n') ? item.slide + item.source : item.slide;
}

// One talk with a slide per example, built into examples/live/ so every card
// can show its example working. `entries` are components and `tiles` are the
// built-in blocks, layouts and so on. Returns the slide index of each, by id.
function buildLiveExamples(entries, tiles) {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-examples-'));
  try {
    mkdirSync(join(dir, 'components'));
    mkdirSync(join(dir, 'pages'));
    cpSync(join(ROOT, 'examples', 'showcase', 'images'), join(dir, 'images'), { recursive: true });
    writeFileSync(join(dir, 'pages', 'chart.html'), CHART_PAGE);
    const slides = entries.map((e) => {
      if (e.file) cpSync(join(ROOT, e.file), join(dir, 'components', `${e.name}.js`));
      const source = (LIVE[e.name] && LIVE[e.name].source) || (e.markdown.match(/```markdown\n([\s\S]*?)\n```/) || [])[1];
      if (!source) throw new Error(`The example ${e.name} has no usage block to show live.`);
      return { id: e.name, markdown: `## ${humanName(e.name)}\n\n${source}` };
    });
    tiles.forEach((t) => slides.push({ id: t.id, markdown: liveSlide(t.item) }));
    writeFileSync(join(dir, 'talk.md'), `---\ntitle: Quorum examples\ntheme: editorial\n---\n\n${slides.map((x) => x.markdown).join('\n\n---\n\n')}\n`);
    execFileSync(process.execPath, [join(ROOT, 'bin', 'quorum.js'), 'build', dir, '--out', join(OUT, 'examples', 'live')], { stdio: 'ignore' });
    return new Map(slides.map((x, i) => [x.id, i]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// What a built-in example is, in a sentence: from the registry when it has one.
function aboutOf(group, item) {
  if (item.about) return item.about;
  const s = schema();
  if (group.id === 'blocks' || group.id === 'audience') return s.blocks[item.key] || '';
  if (group.id === 'layouts') return s.layouts[item.key] || '';
  if (group.id === 'charts') return `A ${item.chart} chart from "label: value" lines.`;
  if (group.id === 'motion') return `Each step comes in with a ${item.effect} effect.`;
  if (item.look) {
    const [kind, look] = item.look.split(':');
    return `The results of ${kind === 'sentence' ? 'a sentence' : kind === 'questions' ? 'the questions' : `a${kind === 'estimate' ? 'n' : ''} ${kind}`} drawn as ${look}.`;
  }
  return '';
}

// A compact example: the live slide, a sentence, and the Markdown that makes it.
function tile(from, group, item, slide) {
  const id = `${group.id}-${item.key}`;
  const about = aboutOf(group, item);
  const play = !item.noplay && playable(item.source);
  return `<article class="tile" id="${id}">
        <div class="screen"><iframe src="${href(from, 'examples/live/')}?slide=${slide}&only=1${item.play ? `&play=${item.play === true ? 1 : item.play}` : ''}" title="${escapeHtml(item.label)}, live" loading="lazy"></iframe></div>
        <h3>${escapeHtml(item.label)}</h3>
        ${about ? `<p>${escapeHtml(about).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>` : ''}
        <pre><code class="language-markdown">${escapeHtml(item.source)}</code></pre>
        <p class="try">${item.caption ? `<span class="live">Live</span> ${escapeHtml(item.caption)}${play ? ' ' : ''}` : ''}${play ? `<a href="${href(from, 'playground/')}#md=${encodeURIComponent(play)}">Try it in the playground</a>` : ''}</p>
      </article>`;
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
  const tiles = GROUPS.flatMap((g) => g.items.map((item) => ({ id: `${g.id}-${item.key}`, group: g, item })));
  const slideOf = buildLiveExamples([...own, ...builtInEntries], tiles);
  const cards = own.map((e) => exampleCard(path, { ...e, slide: slideOf.get(e.name) }));
  const builtIn = builtInEntries.map((e) => exampleCard(path, { ...e, slide: slideOf.get(e.name) }));
  const sections = GROUPS.map((g) => `<section class="group-block" aria-labelledby="${g.id}">
      <h2 class="group" id="${g.id}">${g.title}</h2>
      <p class="group-intro">${g.intro}</p>
      <div class="tiles">
      ${g.items.map((item) => tile(path, g, item, slideOf.get(`${g.id}-${item.key}`))).join('\n      ')}
      </div>
    </section>`);
  const nav = [...GROUPS.map((g) => [g.id, g.title]), ['built-in', 'Built-in components'], ['components', 'Components to copy']]
    .map(([id, label]) => `<a href="#${id}">${label}</a>`).join('');
  const count = tiles.length + builtInEntries.length;

  write(path, page({
    path,
    title: 'Examples · Quorum',
    description: 'Everything built into Quorum, running live: polls, quizzes, estimates, visual blocks, layouts, charts, result looks and effects, plus components you can copy into a talk.',
    body: `    <div class="wrap page-head">
      <p class="kicker">examples / built in</p>
      <h1>Examples</h1>
      <p class="lede">Everything that comes with Quorum, ${count} examples, each running live below with a simulated audience. Click a slide to try it, copy the Markdown into <code>talk.md</code>, and change it. At the end are components you can copy and change. <a href="${href(path, 'docs/components/')}">How components work</a>.</p>
      <nav class="group-nav" aria-label="On this page">${nav}</nav>
    </div>
    <div class="wrap gallery">
      ${sections.join('\n      ')}
      <section class="group-block" aria-labelledby="built-in">
      <h2 class="group" id="built-in">Built-in components</h2>
      <p class="group-intro">Used with <code>::: component name</code>. No file needed.</p>
      ${builtIn.join('\n      ')}
      </section>
      <section class="group-block" aria-labelledby="components">
      <h2 class="group" id="components">Components to copy</h2>
      <p class="group-intro">One JavaScript file in your talk's <code>components/</code> folder each. Copy it, use it from <code>talk.md</code>, and change it.</p>
      ${cards.join('\n      ')}
      </section>
    </div>`,
  }));
}

// --- playground -------------------------------------------------------------

function buildPlayground() {
  const path = 'playground/';
  const start = `---
title: My talk
theme: editorial
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
      <div class="playground tall" data-playground data-persist="page" data-hash data-frame="${href(path, 'showcase/')}?playground=1&theme=editorial">
        <textarea aria-label="Markdown of the talk">${escapeHtml(start)}</textarea>
      </div>
    </div>`,
  }));
}

// --- landing ----------------------------------------------------------------

function buildLanding() {
  const html = read('site', 'index.html')
    .replace('{{social}}', social('', 'Quorum: your agent writes the talk, you shape it, the room takes part',
      'Start from a template, let your coding agent write the talk, shape it in Studio, then present it live with the audience on their phones or export it to PowerPoint. Open source, runs from your laptop.'))
    .replace('{{header}}', header(''))
    .replace('{{footer}}', footer(''));
  writeFileSync(join(OUT, 'index.html'), html);
}

// --- llms.txt ---------------------------------------------------------------

function buildLlms() {
  const index = `# Quorum

> Quorum is an open-source toolkit for talks that a coding agent writes, a person shapes in Quorum Studio, and the audience takes part in from their phones; they can also be exported to PowerPoint. A talk is one Markdown file (talk.md) with ::: blocks for polls, estimates, rounds, a shared sentence, questions and custom JavaScript components, in a git repository. Everything runs from the speaker's laptop with the quorum command (Node 18 or newer, no dependencies).

Start a talk with \`npx github:JBoixCampos/quorum new <folder>\` (Node.js 18 or newer), then \`npm install\` in it. To write or edit a talk: read AGENTS.md in the folder, edit talk.md, and run \`npx quorum check --json\` until it reports no warnings. To offer the person alternatives for a slide, save them with \`quorum variant add <slide>\`; they choose in Studio. Never touch the .quorum/ folder and never share the presenter key.

## Docs

${DOCS.map((d) => `- [${d.label}](${SITE_URL}${docPath(d)}): ${d.description}`).join('\n')}
- [Full reference in one file](${SITE_URL}llms-full.txt): every doc above, plus the example components, as plain text

## Examples

- [Example components](${SITE_URL}examples/): a word cloud, a next-word explorer with a local language model, a counter
- [Showcase talk source](${BLOB}examples/showcase/talk.md): the talk quorum new creates. A theme, layouts, cards, a timeline, a chart, result looks, morphing titles and reactions
- [Slide patterns](${BLOB}agents/quorum/patterns.md): proven slides to build a talk from, and how to choose a theme
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
    'examples/brand/talk.md',
    'examples/showcase/talk.md',
    'agents/quorum/patterns.md',
  ].map((f) => `${'='.repeat(72)}\nFile: ${f}\n${'='.repeat(72)}\n\n${read(f).trim()}\n`);
  const full = `# Quorum: the full reference

This file has the whole Quorum documentation, then an example component, the
counter component, the branded talk, the showcase talk (the one \`quorum new\`
creates), and the slide patterns.
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
// The brand tokens shared with Studio.
cpSync(join(ROOT, 'app', 'css', 'quorum.css'), join(OUT, 'assets', 'quorum.css'));
execFileSync(process.execPath, [join(ROOT, 'bin', 'quorum.js'), 'build', join(ROOT, 'examples', 'showcase'), '--out', join(OUT, 'showcase')], { stdio: 'inherit' });
// The playground renders through the showcase build: give it every example.
cpSync(join(ROOT, 'templates', 'starter', 'components', 'counter.js'), join(OUT, 'showcase', 'talk', 'components', 'counter.js'));
cpSync(join(ROOT, 'examples', 'components', 'word-cloud.js'), join(OUT, 'showcase', 'talk', 'components', 'word-cloud.js'));

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
