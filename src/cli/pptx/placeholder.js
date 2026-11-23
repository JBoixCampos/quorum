// What stands in for the audience's part of a slide in a PowerPoint file.
// A poll cannot vote inside PowerPoint, so the slide says what it is and
// how to run it: with Quorum. Built from the slide's own data, in the
// talk's colours and fonts, as ordinary text boxes and shapes.

export const QUORUM_URL = 'https://github.com/JBoixCampos/quorum';
const SHOWN_AS = {
  poll: 'poll', multi: 'multiple choice poll', estimate: 'guessing game', rounds: 'series of polls', sentence: 'sentence written together', questions: 'questions from the audience',
};

const lines = (text, size, width) => Math.max(1, Math.ceil((String(text).length * size * 0.52) / Math.max(width, 1)));

export function placeholderItems(item, interaction, theme) {
  const fg = theme.colors.fg || { r: 20, g: 20, b: 20, a: 1 };
  const muted = theme.colors.muted || { ...fg, a: 0.7 };
  const accent = theme.colors.accent || { r: 70, g: 90, b: 200, a: 1 };
  const surface = theme.colors.surface || { ...fg, a: 0.06 };
  const line = theme.colors.line || { ...fg, a: 0.25 };
  const run = (text, size, extra = {}) => ({
    text, font: theme.fonts.body, size, bold: false, italic: false, underline: false, strike: false, color: fg, highlight: null, spacing: 0, href: '', ...extra,
  });
  const out = [];
  const pad = 48;
  let y = item.y;
  const x = item.x;

  if (item.kind === 'join') {
    const w = Math.max(item.w, 900);
    const h = 200;
    out.push({ type: 'box', x, y, w, h, step: item.step, radius: 24, fill: surface, gradient: null, line: { w: 2, color: line } });
    out.push({
      type: 'text', x: x + pad, y: y + 36, w: w - 2 * pad, h: 130, step: item.step, align: 'l', lineHeight: 1.35, bullet: null,
      paras: [
        [run('Your audience joins from their phones with Quorum', 34, { bold: true, font: theme.fonts.title })],
        [run('A QR code appears here when you run the talk live. ', 28, { color: muted }), run(QUORUM_URL.replace('https://', ''), 28, { color: accent, underline: true, href: QUORUM_URL })],
      ],
    });
    return out;
  }

  const width = Math.max(item.w, 1100);
  const inner = width - 2 * pad;
  const kind = SHOWN_AS[interaction && interaction.kind] || 'interactive part';
  const title = interaction && interaction.title ? interaction.title : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  const options = interaction && Array.isArray(interaction.options) ? interaction.options.slice(0, 6) : [];
  let hint = '';
  if (interaction && interaction.kind === 'estimate') hint = `The audience guesses a number${Number.isFinite(interaction.min) && Number.isFinite(interaction.max) ? ` between ${interaction.min} and ${interaction.max}` : ''}.`;
  if (interaction && interaction.kind === 'sentence') hint = 'The audience writes a sentence together, one word at a time.';
  if (interaction && interaction.kind === 'questions') hint = 'The audience sends questions and votes on them.';

  const titleLines = lines(title, 60, inner);
  const titleH = titleLines * 60 * 1.2;
  const optionsH = options.length ? options.length * 46 + 16 : 0;
  const hintH = hint ? 46 : 0;
  const noteH = lines('PowerPoint cannot run this part. Run your own Quorum to use it live with your audience.', 30, inner) * 30 * 1.4;
  const total = pad + 36 + 16 + titleH + 16 + optionsH + hintH + 24 + noteH + 20 + 40 + pad;

  out.push({ type: 'box', x, y, w: width, h: total, step: item.step, radius: 24, fill: surface, gradient: null, line: { w: 2, color: line } });
  y += pad;
  out.push({
    type: 'text', x: x + pad, y, w: inner, h: 36, step: item.step, align: 'l', lineHeight: 1.2, bullet: null,
    paras: [[run(`Interactive slide: ${kind}`, 28, { color: accent, bold: true })]],
  });
  y += 36 + 16;
  out.push({
    type: 'text', x: x + pad, y, w: inner, h: titleH, step: item.step, align: 'l', lineHeight: 1.2, bullet: null, name: '!!title', heading: 2,
    paras: [[run(title, 60, { bold: true, font: theme.fonts.title })]],
  });
  y += titleH + 16;
  if (options.length) {
    out.push({
      type: 'text', x: x + pad, y, w: inner, h: optionsH - 16, step: item.step, align: 'l', lineHeight: 1.3, bullet: { kind: 'char', char: '•' },
      paras: options.map((o) => [run(String(o), 36)]),
    });
    y += optionsH;
  }
  if (hint) {
    out.push({
      type: 'text', x: x + pad, y, w: inner, h: 40, step: item.step, align: 'l', lineHeight: 1.3, bullet: null,
      paras: [[run(hint, 32)]],
    });
    y += hintH;
  }
  y += 24;
  out.push({
    type: 'text', x: x + pad, y, w: inner, h: noteH, step: item.step, align: 'l', lineHeight: 1.4, bullet: null,
    paras: [[run('PowerPoint cannot run this part. Run your own Quorum to use it live with your audience.', 30, { color: muted })]],
  });
  y += noteH + 20;
  out.push({
    type: 'text', x: x + pad, y, w: inner, h: 40, step: item.step, align: 'l', lineHeight: 1.3, bullet: null,
    paras: [[run(QUORUM_URL.replace('https://', ''), 30, { color: accent, underline: true, bold: true, href: QUORUM_URL })]],
  });
  return out;
}
