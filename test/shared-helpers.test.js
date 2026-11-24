import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { frontMatterOf } from '../src/cli/load.js';
import { cut } from '../src/cli/repo.js';
import { readJson } from '../src/server/http.js';
import { esc } from '../src/cli/pptx/xml.js';
import { escapeHtml } from '../src/shared/text.js';

test('escapeHtml escapes the five characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('the XML escaper drops characters XML 1.0 does not allow', () => {
  assert.equal(esc('a\u0001b\u000bc & <d>'), 'abc &amp; &lt;d&gt;');
});

test('readJson keeps characters split across chunks', async () => {
  const bytes = Buffer.from(JSON.stringify({ text: 'café €' }));
  const req = Readable.from([bytes.subarray(0, 14), bytes.subarray(14)]);
  assert.deepEqual(await readJson(req, 1000), { text: 'café €' });
});

test('readJson refuses a body over the limit and invalid JSON', async () => {
  class Mine extends Error {}

  const big = Readable.from([Buffer.alloc(50, 'a')]);
  big.destroy = () => {};
  await assert.rejects(readJson(big, 10, Mine), Mine);

  await assert.rejects(readJson(Readable.from([Buffer.from('{nope')]), 100, Mine), Mine);
});

test('the front matter reader and the parser agree on quotes', () => {
  const { meta } = frontMatterOf('---\ntitle: "Don\'t\nslides: slides/ # comment\n---\n# A');
  assert.equal(meta.title, '"Don\'t');
  assert.equal(meta.slides, 'slides/');
});

test('cut splits on --- outside code fences only', () => {
  const { slides } = cut('---\ntitle: T\n---\n# A\n\n---\n\n```\n---\n```\n');
  assert.equal(slides.length, 2);
});
