// `quorum theme`: theme files a company can share between talks, and a
// palette proposed from a logo.
//
//   quorum theme new <name> [folder]   save the talk's look as themes/<name>.yaml
//   quorum theme from <logo>           colours and a preset from an SVG or PNG logo

import {
  copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { extname, join, relative } from 'node:path';
import { inflateSync } from 'node:zlib';

import { isDark, parseColor, toHex, toHsl } from '../shared/color.js';
import { TOKENS } from '../shared/design.js';
import { readTalk } from './load.js';

const FILE_KEYS = ['logo', 'style'];

// The talk's look as the lines of a theme file. Paths become relative to
// the themes/ folder.
export function themeFileFor(dir, file = 'talk.md') {
  const talk = readTalk(dir, file);
  const m = talk.meta;
  const fromThemes = (p) => relative(join(dir, 'themes'), join(dir, p)).split('\\').join('/');
  const lines = [
    `# A Quorum theme. Use it with "theme: themes/<name>.yaml" in a talk.`,
    `extends: ${m.preset}`,
    `mode: ${m.mode}`,
  ];
  const add = (key, value) => { if (value) lines.push(`${key}: ${JSON.stringify(value)}`); };
  add('accent', m.accent);
  add('primary', m.primary);
  add('secondary', m.secondary);
  add('background', m.background);
  add('text', m.text);
  if (m.series && m.palette.length) lines.push(`palette: [${m.palette.map((c) => `"${c}"`).join(', ')}]`);
  if (m.fontFile) add('font', fromThemes(m.fontFile));
  else add('font', m.font);
  if (m.textFontFile) add('text-font', fromThemes(m.textFontFile));
  else add('text-font', m.textFont);
  if (m.accentFontFile) add('accent-font', fromThemes(m.accentFontFile));
  else add('accent-font', m.accentFont);
  FILE_KEYS.forEach((k) => { if (m[k]) add(k, fromThemes(m[k])); });
  Object.keys(TOKENS).filter((k) => k !== 'mode').forEach((k) => {
    if (m.tokens[k]) lines.push(`${k}: ${m.tokens[k]}`);
  });
  const footerSource = readFileSync(join(dir, file), 'utf8').match(/^footer\s*:\s*(.*)$/m);
  if (footerSource) lines.push(`footer: ${footerSource[1].trim()}`);
  return `${lines.join('\n')}\n`;
}

export function saveTheme(dir, name, file = 'talk.md') {
  if (!/^[\w-]+$/.test(name)) throw new Error('A theme name is letters, digits, - and _.');
  const out = join(dir, 'themes', `${name}.yaml`);
  mkdirSync(join(dir, 'themes'), { recursive: true });
  writeFileSync(out, themeFileFor(dir, file));
  return out;
}

// --- colours from a logo ----------------------------------------------------

function svgColors(text) {
  const found = [];
  const re = /#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\([^)]*\)/gi;
  let m;
  while ((m = re.exec(text))) {
    const rgb = parseColor(m[0]);
    if (rgb) found.push(rgb);
  }
  return found;
}

// A minimal PNG reader: 8-bit greyscale, RGB, RGBA and palette images.
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file.');
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let palette = null;
  const data = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      if (body[12]) throw new Error('Interlaced PNG files are not supported: save it without interlacing, or use an SVG.');
    } else if (name === 'PLTE') palette = body;
    else if (name === 'IDAT') data.push(body);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error('Only 8-bit PNG files are supported. Use an SVG logo, or save the PNG as 8-bit.');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error('This kind of PNG is not supported.');
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      }
      out[x] = v & 255;
    }
    prev = out;
  }
  const rgb = [];
  const step = Math.max(1, Math.floor((width * height) / 40000));
  for (let i = 0; i < width * height; i += step) {
    const o = i * channels;
    if (type === 3) {
      const k = pixels[o] * 3;
      rgb.push([palette[k], palette[k + 1], palette[k + 2]]);
    } else if (type === 0 || type === 4) {
      if (type === 4 && pixels[o + 1] < 128) continue;
      rgb.push([pixels[o], pixels[o], pixels[o]]);
    } else {
      if (type === 6 && pixels[o + 3] < 128) continue;
      rgb.push([pixels[o], pixels[o + 1], pixels[o + 2]]);
    }
  }
  return rgb;
}

// The main colours of a list of pixels: grouped, most common first.
function dominant(colors) {
  const groups = new Map();
  colors.forEach((c) => {
    const key = c.map((x) => x >> 4).join(',');
    const g = groups.get(key) || { n: 0, sum: [0, 0, 0] };
    g.n += 1;
    c.forEach((x, i) => { g.sum[i] += x; });
    groups.set(key, g);
  });
  return [...groups.values()].sort((a, b) => b.n - a.n).map((g) => ({ rgb: g.sum.map((x) => x / g.n), n: g.n }));
}

const hueDistance = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// Proposes a theme from a logo: accent, secondary, a background and a preset.
export function themeFromLogo(path) {
  if (!existsSync(path)) throw new Error(`${path} does not exist.`);
  const ext = extname(path).toLowerCase();
  let colors;
  if (ext === '.svg') colors = svgColors(readFileSync(path, 'utf8'));
  else if (ext === '.png') colors = decodePng(readFileSync(path));
  else throw new Error('Use an SVG or PNG logo.');
  const all = dominant(colors);
  if (!all.length) throw new Error('No colours found in the logo.');
  const vivid = all.filter((c) => {
    const [, s, l] = toHsl(c.rgb);
    return s > 0.25 && l > 0.15 && l < 0.85;
  });
  const accent = (vivid[0] || all[0]).rgb;
  const accentHue = toHsl(accent)[0];
  const second = vivid.find((c) => hueDistance(toHsl(c.rgb)[0], accentHue) > 35);
  const darkest = all.find((c) => toHsl(c.rgb)[2] < 0.2);
  const darkLogo = all.length && isDark(toHex(all[0].rgb));
  const preset = vivid.length >= 3 ? 'studio' : (darkLogo && darkest ? 'midnight' : 'signal');
  const result = { preset, accent: toHex(accent) };
  if (second) result.secondary = toHex(second.rgb);
  if (darkest && preset !== 'midnight') result.primary = toHex(darkest.rgb);
  if (preset === 'midnight' && darkest) result.background = toHex(darkest.rgb);
  const palette = [accent, ...vivid.slice(1).map((c) => c.rgb)]
    .filter((c, i, list) => list.findIndex((d) => hueDistance(toHsl(d)[0], toHsl(c)[0]) < 20) === i)
    .slice(0, 5)
    .map(toHex);
  if (palette.length >= 3) result.palette = palette;
  return result;
}

export function frontMatterFor(theme, logo) {
  const lines = [`theme: ${theme.preset}`, `accent: "${theme.accent}"`];
  if (theme.secondary) lines.push(`secondary: "${theme.secondary}"`);
  if (theme.primary) lines.push(`primary: "${theme.primary}"`);
  if (theme.background) lines.push(`background: "${theme.background}"`);
  if (theme.palette) lines.push(`palette: [${theme.palette.map((c) => `"${c}"`).join(', ')}]`);
  if (logo) lines.push(`logo: ${logo}`);
  return lines.join('\n');
}

// --- a design guide from a company's guidelines ------------------------------
//
// `quorum theme guide <name> --from brand.md` (or --text "...") does the part
// that needs no AI: it keeps the guidelines in the talk folder, starts an empty
// theme file the talk can already use, and writes the brief an agent follows
// to turn the guidelines into a theme file and a written design guide.

const TEXT_TYPES = new Set(['.md', '.markdown', '.txt', '.text', '']);

export function themeGuide(dir, name, { text = '', from = '', file = 'talk.md' } = {}) {
  if (!/^[\w-]+$/.test(name || '')) throw new Error('A theme name is letters, digits, - and _.');
  if (!String(text).trim() && !from) {
    throw new Error('Pass the guidelines as text (--text "...") or as a file (--from brand.md, brand.pdf).');
  }
  const folder = join(dir, 'themes');
  mkdirSync(folder, { recursive: true });
  const kept = [];
  let inline = '';
  if (from) {
    if (!existsSync(from)) throw new Error(`There is no file ${from}.`);
    const ext = extname(from).toLowerCase();
    const isText = TEXT_TYPES.has(ext);
    const copy = join(folder, `${name}.guidelines${isText ? '.md' : ext}`);
    copyFileSync(from, copy);
    kept.push(copy);
    // A text file goes into the brief itself; a PDF or an image is read by the agent.
    if (isText) inline = readFileSync(from, 'utf8').trim();
  }
  if (String(text).trim()) {
    const copy = join(folder, `${name}.guidelines${kept.length ? '-notes' : ''}.md`);
    writeFileSync(copy, `${String(text).trim()}\n`);
    kept.push(copy);
    inline = [inline, String(text).trim()].filter(Boolean).join('\n\n');
  }
  const themeFile = join(folder, `${name}.yaml`);
  const isNew = !existsSync(themeFile);
  if (isNew) {
    writeFileSync(themeFile, `# The ${name} theme. An agent fills this in from the guidelines in themes/.\n# Use it with "theme: themes/${name}.yaml" in a talk.\nextends: clean\n`);
  }
  const rel = (path) => relative(dir, path).split('\\').join('/');
  const prompt = themeBrief({
    name, file, guidelines: kept.map(rel), inline: inline.length <= 6000 ? inline : '', isNew,
  });
  return {
    guidelines: kept.map(rel).join(', '), kept, themeFile, isNew, prompt,
  };
}

// The words an agent gets. Written so a fresh agent with no other context can
// do the whole job, and say honestly what it could not express.
export function themeBrief({
  name, file = 'talk.md', guidelines = [], inline = '', isNew = true,
}) {
  const lines = [
    `Create a Quorum theme and a design guide called "${name}" from these guidelines.`,
    '',
    inline
      ? `Guidelines (saved in ${guidelines.join(' and ')}):\n\n${inline.split('\n').map((l) => `    ${l}`).join('\n')}`
      : `The guidelines are in ${guidelines.join(' and ')}. Read all of it first.`,
    ...(inline && guidelines.some((g) => !g.endsWith('.md')) ? ['', `The guidelines also include ${guidelines.filter((g) => !g.endsWith('.md')).join(', ')}: read it too.`] : []),
    '',
    'What to make:',
    `1. themes/${name}.yaml${isNew ? ' (an empty theme file is there now)' : ' (it exists: refine it, keep what already matches the guidelines)'}. A theme file is the front matter keys of a talk, one per line, with \`extends: <preset>\` first. Run \`quorum schema --json\` for every valid key and value: do not guess names. Express the guidelines with:`,
    '   - colours: `accent`, `primary`, `secondary`, `background`, `text`, `palette` (the series colours for charts and results), and `mode: light` or `dark`;',
    '   - type: `font` (titles), `text-font` (body), `accent-font`. If the brand fonts are files (woff2, woff, ttf, otf) copy them into the talk folder and point to them relative to the theme file. If you do not have them, use the closest of the fonts Quorum bundles and say so;',
    '   - the logo: copy the file into images/ and set `logo:`; and `footer:` if the guidelines say what goes there;',
    '   - the feel: `scale`, `weight`, `case`, `radius`, `density`, `surface`, `texture`, `gradient`, `transition`, `charts`, `reveal`. Start from the preset whose mood is closest (`extends:`), then change what the guidelines say;',
    '   - `style:` (a CSS file) only for something no key can express, and keep it small.',
    `2. themes/${name}.md, a short design guide for the people and agents who write slides with this theme: the palette with the role of each colour, the type, which layouts and blocks fit the brand and which to avoid, how to use the logo, and the tone of voice or wording rules from the guidelines. Write it as rules a slide writer can follow, in plain language.`,
    `3. A line in this talk's AGENTS.md (create it if it is missing) saying the talk uses themes/${name}.yaml and that slides follow themes/${name}.md.`,
    `4. \`theme: themes/${name}.yaml\` in the front matter of ${file}.`,
    '',
    'Rules:',
    '- Use only what the guidelines say. Where they say nothing, keep the preset\'s default; never invent a brand colour, a font name or a rule.',
    '- Text and background must keep enough contrast (`quorum check` reports it). If a brand colour fails as text, use it for accents and shapes and say so in the guide.',
    '- Where a guideline cannot be expressed in Quorum, list it under "Not covered" at the end of the guide instead of leaving it out.',
    '',
    'Check your work:',
    '- Run `quorum check --json` and fix every warning. With Playwright installed, run `quorum check --visual` and `quorum snapshot`, look at `.quorum-snapshots/contact.png`, and adjust until the slides look like the brand.',
    '- Finish by telling me what you set, what you chose without guidance, and what is not covered.',
    '',
    'If you work on a copy of the repository (in the cloud), commit and push to a branch so I can pull it.',
  ];
  return lines.join('\n');
}
