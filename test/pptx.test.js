// The PowerPoint writer, without a browser: zip, XML checks and a deck
// built from hand made slide data.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPptx } from '../src/cli/pptx/build.js';
import { pdfFromJpegs } from '../src/cli/pptx/pdf.js';
import { unzip } from '../src/cli/pptx/unzip.js';
import { checkPptx, xmlError } from '../src/cli/pptx/verify.js';
import { workbook } from '../src/cli/pptx/xlsx.js';
import { zip } from '../src/cli/pptx/zip.js';

const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const INK = { r: 20, g: 20, b: 30, a: 1 };
const run = (text, extra = {}) => ({
  text, font: 'Inter', size: 40, bold: false, italic: false, underline: false, strike: false, color: INK, highlight: null, spacing: 0, href: '', ...extra,
});

function deck(slides, extra = {}) {
  return {
    title: 'Test & <talk>',
    author: 'Someone',
    lang: 'en',
    colors: { accent: { r: 255, g: 100, b: 0, a: 1 }, fg: INK, bg: WHITE, series: [] },
    fonts: { title: 'Fraunces', body: 'Inter' },
    slides,
    ...extra,
  };
}

const textItem = (extra = {}) => ({
  type: 'text', x: 100, y: 100, w: 800, h: 60, step: 0, align: 'l', lineHeight: 1.2, bullet: null, paras: [[run('Hello & <welcome>')]], ...extra,
});

test('zip files can be read back, with checksums', () => {
  const files = unzip(zip([{ name: 'a.txt', data: 'hello hello hello hello hello' }, { name: 'd/b.bin', data: Buffer.from([1, 2, 3]) }]));
  assert.equal(files.get('a.txt').toString(), 'hello hello hello hello hello');
  assert.deepEqual([...files.get('d/b.bin')], [1, 2, 3]);
});

test('xmlError finds the mistakes that make PowerPoint ask to repair a file', () => {
  assert.equal(xmlError('<?xml version="1.0"?><a x="1"><b/><c>t &amp; u</c></a>'), null);
  assert.match(xmlError('<a><b></a>'), /closes/);
  assert.match(xmlError('<a>'), /never closed/);
  assert.match(xmlError('<a>fish & chips</a>'), /bare "&"/);
  assert.match(xmlError('<a>1 < 2</a>'), /Stray/);
});

test('a deck of text, shapes and notes passes the structural check', () => {
  const { buffer, fonts } = buildPptx(deck([
    {
      items: [
        { type: 'box', x: 0, y: 0, w: 400, h: 300, step: 0, radius: 24, fill: { r: 200, g: 200, b: 255, a: 0.5 }, gradient: null, line: { w: 2, color: INK }, shadow: true },
        textItem({ name: '!!h1', heading: 1 }),
        textItem({ y: 300, bullet: { kind: 'char', char: '•' }, paras: [[run('One')], [run('Two', { bold: true, href: 'https://example.com/?a=1&b=2' })]] }),
      ],
      background: { color: WHITE, gradient: null, image: null },
      notes: 'Say this & that.\n\nThen this.',
      transition: 'fade',
    },
    {
      items: [textItem({ step: 1 }), textItem({ y: 300, step: 2 })],
      background: { color: INK, gradient: { angle: 135, stops: [{ pos: 0, color: INK }, { pos: 100, color: WHITE }] }, image: null },
      notes: '',
      transition: 'morph',
    },
  ]));
  assert.deepEqual(checkPptx(buffer), []);
  assert.deepEqual(fonts, ['Inter']);
  const files = unzip(buffer);
  const slide = files.get('ppt/slides/slide1.xml').toString();
  assert.match(slide, /Hello &amp; &lt;welcome&gt;/);
  assert.match(slide, /name="!!h1"/);
  assert.ok(files.has('ppt/notesSlides/notesSlide1.xml'));
  assert.ok(!files.has('ppt/notesSlides/notesSlide2.xml'));
  assert.match(files.get('ppt/slides/slide2.xml').toString(), /p159:morph/);
  assert.match(files.get('ppt/slides/slide2.xml').toString(), /<p:timing>/);
  assert.equal([...files.get('ppt/slides/slide2.xml').toString().matchAll(/nodeType="clickEffect"/g)].length, 2);
  assert.match(files.get('ppt/slides/_rels/slide1.xml.rels').toString(), /TargetMode="External"/);
});

test('charts carry their data in an embedded workbook', () => {
  const rows = [
    { label: 'Tacos', text: '56%', value: 56, share: 0.56, percent: true, color: { r: 255, g: 100, b: 0, a: 1 } },
    { label: 'Ramen', text: '44%', value: 44, share: 0.44, percent: true, color: { r: 0, g: 100, b: 255, a: 1 } },
  ];
  const item = { type: 'chart', chart: 'bars', x: 0, y: 0, w: 900, h: 400, step: 0, rows, unit: '', font: 'Inter', size: 30, color: INK, labelWidth: 0.2 };
  ['bars', 'columns', 'donut', 'line'].forEach((chart) => {
    const { buffer, charts } = buildPptx(deck([{ items: [{ ...item, chart }], background: { color: WHITE }, notes: '', transition: 'none' }]));
    assert.equal(charts, 1);
    assert.deepEqual(checkPptx(buffer), [], chart);
    const files = unzip(buffer);
    assert.match(files.get('ppt/charts/chart1.xml').toString(), /<c:v>Tacos<\/c:v>/);
    const book = unzip(files.get('ppt/embeddings/Microsoft_Excel_Sheet1.xlsx'));
    assert.match(book.get('xl/worksheets/sheet1.xml').toString(), /Ramen/);
  });
});

test('the structural check reports a missing part and a broken relationship', () => {
  const { buffer } = buildPptx(deck([{ items: [textItem()], background: { color: WHITE }, notes: '', transition: 'none' }]));
  const files = unzip(buffer);
  files.set('ppt/slides/slide1.xml', Buffer.from(files.get('ppt/slides/slide1.xml').toString().replace('</p:sld>', '<p:oops></p:sld>')));
  files.delete('ppt/slideLayouts/slideLayout1.xml');
  const problems = checkPptx(zip([...files].map(([name, data]) => ({ name, data }))));
  assert.ok(problems.some((p) => p.includes('slide1.xml') && p.includes('closes')));
  assert.ok(problems.some((p) => p.includes('slideLayout1.xml')));
});

test('safe fonts swap the bundled fonts for ones every Office install has', () => {
  const slide = { items: [textItem({ paras: [[run('x', { font: 'Fraunces' })]] })], background: { color: WHITE }, notes: '', transition: 'none' };
  assert.deepEqual(buildPptx(deck([slide])).fonts, ['Fraunces']);
  assert.deepEqual(buildPptx(deck([slide], { safeFonts: true })).fonts, ['Georgia']);
});

test('a workbook is a valid zip with the values in it', () => {
  const book = unzip(workbook(['', 'Value'], [['A & B', 3]]));
  assert.match(book.get('xl/worksheets/sheet1.xml').toString(), /A &amp; B/);
});

test('a PDF has one page per picture', () => {
  // A JPEG header with a start-of-frame segment: 16 high, 32 wide.
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
  const pdf = pdfFromJpegs([jpeg, jpeg, jpeg], 'Talk (1)').toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /\/Count 3/);
  assert.match(pdf, /\/Width 32 \/Height 16/);
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
});
