import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { checkLinks } from '../scripts/site/links.js';
import { render } from '../scripts/site/markdown.js';

test('docs renderer: title, headings with ids and paragraphs', () => {
  const r = render('# Title\n\nSome **bold** and *soft* text\non two lines.\n\n## A section\n\n### A section\n');
  assert.equal(r.title, 'Title');
  assert.match(r.html, /<p>Some <strong>bold<\/strong> and <em>soft<\/em> text on two lines\.<\/p>/);
  assert.deepEqual(r.headings.map((h) => h.id), ['a-section', 'a-section-2']);
});

test('docs renderer: code is escaped and kept as written', () => {
  const r = render('```markdown\n::: poll <b>\n- A\n```\n\nUse `<tag>` here.');
  assert.match(r.html, /<pre><code class="language-markdown">::: poll &lt;b&gt;\n- A<\/code><\/pre>/);
  assert.match(r.html, /<code>&lt;tag&gt;<\/code>/);
});

test('docs renderer: tables keep escaped pipes inside cells', () => {
  const r = render('| Key | Example |\n| --- | --- |\n| `examples:` | `a \\| b` |\n');
  assert.match(r.html, /<td><code>a \| b<\/code><\/td>/);
  assert.equal((r.html.match(/<td>/g) || []).length, 2);
});

test('docs renderer: lists, links and rewritten targets', () => {
  const r = render('1. First\n   continued\n2. [Second](format.md#poll)\n\n- one\n- two\n', {
    link: (href) => href.replace(/^format\.md/, '../format/'),
  });
  assert.match(r.html, /<ol><li>First continued<\/li><li><a href="\.\.\/format\/#poll">Second<\/a><\/li><\/ol>/);
  assert.match(r.html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

test('docs renderer: build markers in HTML comments', () => {
  const r = render('Before\n\n<!-- demo-slide: 4 -->\n\nAfter');
  assert.deepEqual(r.blocks.filter((b) => typeof b !== 'string'), [{ marker: 'demo-slide', value: '4' }]);
  assert.doesNotMatch(r.html, /demo-slide/);
});

test('link checker finds missing files, anchors and absolute paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quorum-links-'));
  try {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'index.html'), '<a href="docs/">ok</a><a href="docs/#here">ok</a>'
      + '<a href="docs/#nowhere">bad</a><a href="missing.html">bad</a><a href="/docs/">bad</a>'
      + '<a href="https://example.com/">external</a><pre><a href="ignored.html"></a></pre>');
    writeFileSync(join(dir, 'docs', 'index.html'), '<h2 id="here">Here</h2><a href="../">ok</a><img src="../logo.svg">');
    const problems = checkLinks(dir).map((p) => `${p.page} ${p.link}`).sort();
    assert.deepEqual(problems, [
      'docs/index.html ../logo.svg',
      'index.html /docs/',
      'index.html docs/#nowhere',
      'index.html missing.html',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
