import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { checkTalk } from '../src/cli/check.js';
import { estimateHeight } from '../src/cli/design-check.js';
import { readTalk } from '../src/cli/load.js';
import { decodePng, saveTheme, themeFromLogo } from '../src/cli/theme.js';
import { chartHtml } from '../src/shared/charts.js';
import { contrast, paletteFrom } from '../src/shared/color.js';
import { LAYOUTS, PRESETS, schema } from '../src/shared/design.js';
import { highlight } from '../src/shared/highlight.js';
import { parseAttrs, parseTalk } from '../src/shared/markdown.js';
import { Session } from '../src/shared/session.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'quorum.js');
const talk = (front, body = '# Hi') => parseTalk(`---\n${front}\n---\n${body}\n`);
const slide = (body, front = 'title: T') => talk(front, body).slides[0];

function folder(files) {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-design-'));
  Object.entries(files).forEach(([name, text]) => {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  });
  return dir;
}

// --- themes and tokens -------------------------------------------------------

test('a preset sets the look, and the front matter overrides it', () => {
  const { meta, warnings } = talk('theme: midnight\naccent: "#ff0066"\nradius: none');
  assert.deepEqual(warnings, []);
  assert.equal(meta.preset, 'midnight');
  assert.equal(meta.mode, 'dark');
  assert.equal(meta.theme, 'dark');
  assert.equal(meta.accent, '#ff0066');
  assert.equal(meta.background, PRESETS.midnight.background);
  assert.equal(meta.tokens.radius, 'none');
  assert.equal(meta.tokens.surface, 'glass');
  assert.equal(meta.palette[0], '#ff0066', 'a new accent leads the preset palette');
  assert.equal(meta.series, true);
  assert.match(meta.font, /Space Grotesk/);
});

test('theme: light and dark still work, on the clean preset', () => {
  assert.equal(talk('theme: dark').meta.mode, 'dark');
  assert.equal(talk('theme: dark').meta.preset, 'clean');
  assert.equal(talk('theme: light').meta.theme, 'light');
  assert.equal(talk('background: "#0f1b2d"').meta.mode, 'dark');
  assert.equal(talk('title: x').meta.series, false);
  assert.ok(talk('title: x').meta.palette.length >= 3, 'a palette is made from the accent');
});

test('a preset in the other mode drops its own background', () => {
  const { meta } = talk('theme: midnight\nmode: light');
  assert.equal(meta.mode, 'light');
  assert.equal(meta.background, '');
  assert.equal(meta.accent, PRESETS.midnight.accent);
});

test('unknown themes, tokens and colours are warnings', () => {
  const { warnings, meta } = talk('theme: neon\nradius: huge\npalette: ["#fff", "nope!"]\nmode: grey');
  assert.equal(meta.preset, 'clean');
  assert.ok(warnings.some((w) => w.includes('The theme "neon" does not exist')));
  assert.ok(warnings.some((w) => w.includes('"radius: huge"')));
  assert.ok(warnings.some((w) => w.includes('palette colour "nope!"')));
  assert.ok(warnings.some((w) => w.includes('mode: grey')));
});

test('a theme file is read with paths from its own folder, and the talk wins', () => {
  const dir = folder({
    'themes/acme.yaml': 'extends: signal\naccent: "#0b5fff"\nlogo: ../images/logo.svg\nfont: fonts/Acme.woff2\nradius: round\n',
    'talk.md': '---\ntitle: T\ntheme: themes/acme.yaml\nradius: pill\n---\n# Hi\n',
  });
  try {
    const t = readTalk(dir);
    assert.deepEqual(t.warnings, []);
    assert.equal(t.meta.preset, 'signal');
    assert.equal(t.meta.accent, '#0b5fff');
    assert.equal(t.meta.logo, 'images/logo.svg');
    assert.equal(t.meta.fontFile, 'themes/fonts/Acme.woff2');
    assert.equal(t.meta.tokens.radius, 'pill');
    const missing = parseTalk('---\ntheme: themes/none.yaml\n---\n# x', { readFile: () => null });
    assert.ok(missing.warnings.some((w) => w.includes('does not exist')));
    const browser = parseTalk('---\ntheme: themes/acme.yaml\n---\n# x');
    assert.ok(browser.warnings.some((w) => w.includes('can only be read by the quorum command')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('quorum theme new saves the look, and a talk can use it', () => {
  const dir = folder({ 'talk.md': '---\ntitle: T\ntheme: paper\naccent: "#123456"\nlogo: images/logo.svg\n---\n# Hi\n' });
  try {
    saveTheme(dir, 'house');
    writeFileSync(join(dir, 'other.md'), '---\ntitle: O\ntheme: themes/house.yaml\n---\n# Hi\n');
    const t = readTalk(dir, 'other.md');
    assert.deepEqual(t.warnings, []);
    assert.equal(t.meta.preset, 'paper');
    assert.equal(t.meta.accent, '#123456');
    assert.equal(t.meta.logo, 'images/logo.svg');
    assert.equal(t.meta.tokens.texture, 'grain');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reactions and phone settings', () => {
  const { meta, warnings } = talk('reactions: 👏 😂 <b>\nphone-welcome: Hello *there*\nphone-thanks: Bye\nphone-background: "#123"');
  assert.deepEqual(meta.reactions, ['👏', '😂']);
  assert.ok(warnings.some((w) => w.includes('reaction')));
  assert.equal(meta.phone.welcome, 'Hello <em>there</em>');
  assert.deepEqual(meta.phone.background, { color: '#123', image: '' });
  assert.deepEqual(talk('title: x').meta.reactions, []);
});

// --- attributes and inline ----------------------------------------------------

test('attributes on headings, paragraphs and images', () => {
  const s = slide('## Big idea {.center .accent #hero}\n\nA line {.muted}\n\n![Cat](cat.jpg){.round width=300}');
  assert.match(s.html, /<h2 class="is-center is-accent" data-morph="hero">Big idea<\/h2>/);
  assert.match(s.html, /<p class="is-muted">A line<\/p>/);
  assert.match(s.html, /<img src="cat.jpg" alt="Cat" class="is-round" style="width:300px">/);
});

test('ordinary braces stay text, unknown classes are warnings', () => {
  assert.match(slide('Use {name} here').html, /Use \{name\} here/);
  const t = talk('title: T', '## Hi {.sparkly}');
  assert.ok(t.warnings.some((w) => w.includes('".sparkly" is not a class')));
  assert.deepEqual(parseAttrs('#a .b c=d steps').classes, ['b', 'steps']);
});

test('icons, badges, highlights and videos inline', () => {
  const s = slide('## Flour {icon=wheat}\n\nNew :badge[beta] and ==this== :icon[heart]\n\n![Loop](clip.mp4)');
  assert.match(s.html, /<h2><svg class="q-icon"[^>]*data-icon="wheat"/);
  assert.match(s.html, /<span class="q-badge">beta<\/span>/);
  assert.match(s.html, /<mark>this<\/mark>/);
  assert.match(s.html, /data-icon="heart"/);
  assert.match(s.html, /<video src="clip.mp4" autoplay muted loop playsinline/);
  const t = talk('title: T', ':icon[nope] and ## x\n\n### Y {icon=nothing}');
  assert.equal(t.warnings.filter((w) => w.includes('no icon called')).length, 2);
});

// --- layouts --------------------------------------------------------------------

test('every layout in the registry is accepted, others are warnings', () => {
  Object.keys(LAYOUTS).filter((l) => !['split', 'full', 'agenda'].includes(l)).forEach((l) => {
    const t = talk('title: T', `<!-- layout: ${l} -->\n# Hi`);
    assert.deepEqual(t.warnings, [], l);
    assert.equal(t.slides[0].layout, l);
  });
  const bad = talk('title: T', '<!-- layout: sideways -->\n# Hi');
  assert.ok(bad.warnings[0].includes('the layout "sideways" does not exist'));
});

test('split and full move the first picture into a media pane', () => {
  const s = slide('<!-- layout: split, right -->\n## Title\n\n![Dough](d.jpg)\n\nText');
  assert.equal(s.layout, 'split');
  assert.deepEqual(s.layoutOptions, ['right']);
  assert.match(s.media, /<figure><img src="d.jpg"/);
  assert.doesNotMatch(s.html, /<img/);
  const t = talk('title: T', '<!-- layout: full -->\n## No picture');
  assert.ok(t.warnings.some((w) => w.includes('needs an image')));
});

test('sections get numbers, agendas list them', () => {
  const t = talk('title: T', '<!-- layout: agenda -->\n## Plan\n\n---\n\n<!-- layout: section -->\n<!-- section: One, 2 -->\n# One\n\n---\n\n<!-- section: Two, 3 -->\n# Two');
  assert.match(t.slides[0].html, /q-agenda-item current"><span class="q-agenda-n">01<\/span><span>One/);
  assert.match(t.slides[0].html, /<span>Two<\/span>/);
  assert.match(t.slides[1].html, /^<p class="q-section-number">01<\/p>/);
});

test('slide transitions and gradient backgrounds', () => {
  const t = talk('title: T\ntransition: slide', '<!-- transition: zoom -->\n<!-- background: aurora -->\n# A\n\n---\n\n<!-- transition: spin -->\n# B');
  assert.equal(t.meta.tokens.transition, 'slide');
  assert.equal(t.slides[0].transition, 'zoom');
  assert.equal(t.slides[0].background.gradient, 'aurora');
  assert.ok(t.warnings.some((w) => w.includes('the transition "spin"')));
});

// --- blocks ---------------------------------------------------------------------

test('cards with icons, one per click with {.steps}', () => {
  const s = slide('::: cards {.steps}\n### A {icon=star}\nOne\n\n+++\n\n### B\nTwo\n:::');
  assert.match(s.html, /<div class="q-cards is-steps" style="--cols:2">/);
  assert.match(s.html, /<div class="q-card">.*data-icon="star"/);
  assert.match(s.html, /<div class="q-card q-step" data-step="1">/);
  assert.equal(s.steps, 2);
});

test('timeline, steps, kpis and compare', () => {
  const s = slide('::: timeline {.vertical}\n- 1857: Pasteur\n- 1928: Sliced bread\n:::\n\n::: steps\n- Mix: everything\n- Bake\n:::\n\n::: kpis {unit=%}\n- 42: done\n:::\n\n::: compare {vs="or"}\nA\n\n+++\n\nB\n:::');
  assert.match(s.html, /<ol class="q-timeline is-vertical" style="--n:2">/);
  assert.match(s.html, /<span class="q-tl-when">1857<\/span><span class="q-tl-what">Pasteur<\/span>/);
  assert.match(s.html, /q-process-n">1<\/span><div><p class="q-process-head">Mix<\/p>/);
  assert.match(s.html, /<p class="q-kpi-value" data-count="42">42 %<\/p><p class="q-kpi-label">done<\/p>/);
  assert.match(s.html, /<span class="q-vs">or<\/span>/);
});

test('charts from label: value lines', () => {
  const s = slide('::: chart donut {title="Share" unit=kg}\nA: 3\nB: 1,000\n:::');
  assert.match(s.html, /<figure class="q-chart q-chart-donut">/);
  assert.match(s.html, /data-option="A"/);
  assert.match(s.html, /1,000 kg/);
  assert.match(s.html, /q-chart-title">Share</);
  const t = talk('title: T', '::: chart pie3d\nA: x\n:::');
  assert.ok(t.warnings.some((w) => w.includes('not a chart type')));
  assert.ok(t.warnings.some((w) => w.includes('has no number')));
});

test('::: style is scoped to its slide', () => {
  const s = talk('title: T', '<!-- id: intro -->\n# Hi\n\n::: style\nh1 { color: red; }\n:::').slides[0];
  assert.match(s.html, /<style data-slide-style>\.q-slide\[data-sid="intro"\] \{\nh1 \{ color: red; \}\n\}<\/style>/);
});

test('code is highlighted, and {lines=} adds a step per range', () => {
  const s = slide('```js {lines=1|2-3}\nconst a = 1;\nlet b = "x";\nfoo();\n```');
  assert.match(s.html, /<pre class="q-code" data-ranges="\[\[0,\[1\]\],\[1,\[2,3\]\]\]">/);
  assert.match(s.html, /<span class="q-line" data-n="1"><span class="tok-keyword">const<\/span>/);
  assert.equal(s.steps, 2);
  assert.equal(highlight('<b>', 'unknown'), '&lt;b&gt;');
  assert.match(highlight('# hi\nx = 1', 'python'), /tok-comment">#/);
});

test('step effects', () => {
  const t = talk('title: T', 'A\n\n-- fly\n\nB\n\n-- spin\n\nC');
  assert.match(t.slides[0].html, /<div class="q-step fx-fly" data-step="1"><p>B<\/p>/);
  assert.ok(t.warnings.some((w) => w.includes('"-- spin" is not a step effect')));
});

test('interactions take a result look and a reveal', () => {
  const s = slide('::: poll {#p chart=donut reveal=flip} Q?\n- A\n- B\n:::');
  assert.equal(s.interaction.id, 'p');
  assert.equal(s.interaction.chart, 'donut');
  assert.equal(s.interaction.revealStyle, 'flip');
  const t = talk('title: T', '::: estimate {#e chart=donut} Q?\nanswer: 3\n:::');
  assert.ok(t.warnings.some((w) => w.includes('"chart=donut" is not a look for estimate')));
});

// --- charts, colours, schema ----------------------------------------------------

test('chart looks keep data-option and percentages', () => {
  const rows = [{ label: 'A', value: 3 }, { label: 'B', value: 1, state: 'correct' }];
  ['bars', 'columns', 'donut', 'pictogram', 'race', 'bubbles'].forEach((look) => {
    const html = chartHtml(look, rows, { total: 4, series: true });
    assert.match(html, /data-option="A"/, look);
    assert.match(html, /75%/, look);
    assert.match(html, /correct/, look);
  });
  assert.match(chartHtml('line', rows, {}), /<svg class="q-linechart"/);
  assert.doesNotMatch(chartHtml('bars', rows, { total: 4, show: false }), /75%/);
});

test('colour contrast and palettes', () => {
  assert.equal(Math.round(contrast('#000', '#fff')), 21);
  assert.equal(contrast('white', 'white'), 1);
  assert.equal(contrast('var(--x)', '#fff'), null);
  const p = paletteFrom('#0b5fff');
  assert.equal(p.length, 5);
  assert.equal(p[0], '#0b5fff');
});

test('the schema lists every preset, layout and block', () => {
  const s = schema();
  assert.deepEqual(Object.keys(s.presets), Object.keys(PRESETS));
  assert.ok(s.layouts.split && s.blocks.cards && s.classes.steps);
  const r = spawnSync(process.execPath, [CLI, 'schema', '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  const json = JSON.parse(r.stdout);
  assert.ok(json.icons.includes('wheat'));
  assert.ok(json.tokens.radius.values.includes('pill'));
});

// --- reactions --------------------------------------------------------------------

test('reactions: only the talk\'s emoji, not too fast, never who sent them', () => {
  const t = talk('title: T\nreactions: 👏 🤯');
  const s = new Session(t, null, { moderation: false });
  const d = 'phone-0001';
  assert.equal(s.apply({ type: 'react', emoji: '💩' }, { device: d, now: 1000 }).ok, false);
  assert.equal(s.apply({ type: 'react', emoji: '👏' }, { device: d, now: 1000 }).ok, true);
  assert.equal(s.apply({ type: 'react', emoji: '👏' }, { device: d, now: 1100 }).ok, false);
  assert.equal(s.apply({ type: 'react', emoji: '🤯' }, { device: 'phone-0002', now: 1100 }).ok, true);
  const view = s.recentReactions(2000);
  assert.deepEqual(view.counts, { '👏': 1, '🤯': 1 });
  assert.equal(view.recent.length, 2);
  assert.deepEqual(Object.keys(view.recent[0]).sort(), ['emoji', 'id']);
  assert.equal(s.recentReactions(60000).recent.length, 0);
  assert.equal(new Session(talk('title: T'), null).apply({ type: 'react', emoji: '👏' }, { device: d }).ok, false);
});

// --- check -------------------------------------------------------------------------

test('check: contrast is a warning, density and variety are suggestions', () => {
  const plain = Array.from({ length: 5 }, (_, i) => `## Point ${i}\n\nSome words.`).join('\n\n---\n\n');
  const long = Array.from({ length: 60 }, () => 'word').join(' ');
  const dir = folder({ 'talk.md': `---\ntitle: T\ntext: "#dddddd"\nbackground: "#ffffff"\n---\n${plain}\n\n---\n\n## Long\n\n${long}\n\n![](x.png)\n` });
  try {
    const r = checkTalk(dir);
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.kind === 'contrast'));
    assert.ok(r.issues.some((i) => i.kind === 'file' && i.slide === 6));
    assert.ok(r.suggestions.some((s) => s.kind === 'variety' && s.slide === 1));
    assert.ok(r.suggestions.some((s) => s.kind === 'text' && s.slide === 6));
    assert.ok(r.suggestions.some((s) => s.kind === 'alt'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the overflow estimate flags long slides, not side-by-side blocks', () => {
  const many = Array.from({ length: 14 }, (_, i) => `- A rather long list item number ${i} that goes on for a while`).join('\n');
  assert.ok(estimateHeight(slide(`## Title\n\n${many}`)) > 820);
  const cards = Array.from({ length: 4 }, (_, i) => `### Card ${i}\nSome text in the card.`).join('\n\n+++\n\n');
  assert.ok(estimateHeight(slide(`## Title\n\n::: cards\n${cards}\n:::`)) < 820);
});

// --- logos -------------------------------------------------------------------------

function png(width, height, pixel) {
  const crc = (buf) => {
    let c = -1;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ -1) >>> 0;
  };
  const chunk = (name, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const head = Buffer.concat([Buffer.from(name, 'latin1'), body]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(head));
    return Buffer.concat([len, head, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    for (let x = 0; x < width; x += 1) rows.push(Buffer.from(pixel(x, y)));
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('a theme from a logo: the main vivid colour becomes the accent', () => {
  const dir = folder({ 'logo.svg': '<svg><rect fill="#ffffff"/><path fill="#e63946"/><path fill="#e63946"/><path fill="#1d3557"/></svg>' });
  try {
    writeFileSync(join(dir, 'logo.png'), png(10, 10, (x) => (x < 7 ? [10, 120, 230] : [250, 250, 250])));
    assert.equal(themeFromLogo(join(dir, 'logo.svg')).accent, '#e63946');
    const pixels = decodePng(png(2, 1, (x) => (x ? [1, 2, 3] : [4, 5, 6])));
    assert.deepEqual(pixels, [[4, 5, 6], [1, 2, 3]]);
    assert.equal(themeFromLogo(join(dir, 'logo.png')).accent, '#0a78e6');
    assert.throws(() => themeFromLogo(join(dir, 'none.svg')), /does not exist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
