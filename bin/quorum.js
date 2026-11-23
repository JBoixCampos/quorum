#!/usr/bin/env node
// Quorum command line.
//
//   quorum new <folder>        create a talk from the starter template
//   quorum preview [folder]    see the talk with a simulated audience
//   quorum live [folder]       give the talk: server, public link, QR, windows
//   quorum check [folder]      check talk.md for mistakes (--json for tools, --visual to measure)
//   quorum snapshot [folder]   a picture of every slide and a contact sheet
//   quorum schema              every theme, layout, block and class (--json)
//   quorum theme ...           save a theme file, or propose one from a logo
//   quorum build [folder]      a static, playable copy of the talk
//   quorum export [folder]     the slides without the audience parts, as a fallback
//   quorum clean [folder]      delete votes and questions saved by a live session
//   quorum skill               install the agent skill for Claude Code

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkTalk } from '../src/cli/check.js';
import { frontMatterFor, saveTheme, themeFromLogo } from '../src/cli/theme.js';
import { INSTALL_PLAYWRIGHT, overflowIssues, renderTalk } from '../src/cli/visual.js';
import { schema } from '../src/shared/design.js';
import { ICONS } from '../src/shared/icons.js';
import { readTalk } from '../src/cli/load.js';
import { cleanup, describe, diffPictures, diffTalk } from '../src/cli/diff.js';
import { exploreSlide, exploreThemes, optionsFor } from '../src/cli/explore.js';
import { exportTalk } from '../src/cli/pptx/export.js';
import { remix } from '../src/cli/remix.js';
import {
  addVariant, clearVariants, findVariant, listVariants, removeVariant,
} from '../src/cli/variants.js';
import {
  findSlide, joinTalk, mergeText, mergeTalks, replaceSlide, setupRepo, slideText, splitTalk,
} from '../src/cli/repo.js';
import {
  INSTALL, findChromium, lanUrl, openAppWindow, openUrl, startTunnel,
} from '../src/cli/system.js';
import { startServer } from '../src/server/server.js';
import { withoutAudience } from '../src/shared/markdown.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('-') && ['port', 'out', 'file', 'to', 'save', 'slide', 'by', 'direction', 'from', 'themes', 'count', 'pick'].includes(k)) {
        args[k] = argv[i + 1];
        i += 1;
      } else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

const HELP = `Quorum ${VERSION}: talks your agent writes, you shape, and the room takes part in.

The workflow
  1. quorum new my-talk       Start a talk (or "Use this template" on GitHub)
  2. Your agent writes it     Claude Code, Codex, Cursor... in the folder; AGENTS.md tells it how
  3. quorum studio            Shape it: edit, insert polls, try layouts, rehearse
  4. Present or Export        From Studio, or with the commands below

For you
  quorum                     Open Studio (in a talk folder)
  quorum new <folder>        Start a talk: talk.md, AGENTS.md, package.json, CI
  quorum studio [folder]     Edit, rehearse, present and export
  quorum present [folder]    Give the talk live: public link, QR code, windows
  quorum preview [folder]    The talk with a simulated audience
  quorum export --pptx       A PowerPoint file (--pdf for a PDF, --results with the votes)
  quorum clean [folder]      Delete the votes and questions of the last session

For agents and CI
  quorum check [--json] [--visual]   Mistakes, contrast, slides that do not fit
  quorum snapshot             A picture of every slide, and a contact sheet
  quorum schema [--json]      Every theme, layout, block, class and icon
  quorum remix <slide>        Other layouts for a slide (--pick <n> applies one)
  quorum variant add <slide>  Save a version of a slide for the person to choose in Studio
  quorum diff [rev]           Which slides changed since a branch, tag or commit (--pictures)
  quorum explore --themes     The first slides in several themes
  quorum split / join         One file per slide in slides/, and back
  quorum repo                 Slide by slide merging in this clone, and the CI workflow
  quorum theme new|from       Save the look as a theme file, or make one from a logo
  quorum build                A static, playable copy of the talk
  quorum export               The slides without the audience parts, as a website
  quorum skill                Install the agent skill for Claude Code (--to <folder>)

Options
  --port <n>  --file <name>  --out <path>  --no-open  --no-tunnel  --no-moderation
  --json  --visual  --icons  --no-results  --pictures  --pick <n>  --no-remix  --themes a,b
  --pptx  --pdf  --results  --no-audience  --safe-fonts  --repo  --save <name>  --to <folder>
  --by <name>  --direction <text>  --from <file>  --quiet

Docs: https://jboixcampos.github.io/quorum/docs/
`;

function talkDir(args) {
  return resolve(args._[1] || '.');
}

function talkFile(args) {
  return args.file || 'talk.md';
}

function ensureTalk(dir, file) {
  if (!existsSync(join(dir, file))) {
    console.error(`No ${file} in ${dir}.\nCreate one with: quorum new my-talk`);
    process.exit(1);
  }
}

function printWarnings(talk) {
  if (!talk.warnings.length) return;
  console.log('\nThings to check in your talk:');
  talk.warnings.forEach((w) => console.log(`  - ${w}`));
}

// This computer's address on the local network, for people on the same wifi.
function cmdNew(args) {
  const name = args._[1];
  if (!name) {
    console.error('Usage: quorum new <folder>');
    process.exit(1);
  }
  const dir = resolve(name);
  if (existsSync(dir) && readdirSync(dir).length) {
    console.error(`${dir} already exists and is not empty.`);
    process.exit(1);
  }
  // Never the votes or keys of a session someone ran in the template itself.
  cpSync(join(ROOT, 'templates', 'starter'), dir, { recursive: true, filter: (src) => !/[\\/]\.quorum([\\/]|$)/.test(src) });
  // npm drops files named .gitignore when publishing, so it is stored as "gitignore".
  if (existsSync(join(dir, 'gitignore'))) cpSync(join(dir, 'gitignore'), join(dir, '.gitignore'));
  rmSync(join(dir, 'gitignore'), { force: true });
  for (const f of ['gitattributes']) {
    if (existsSync(join(dir, f))) {
      cpSync(join(dir, f), join(dir, `.${f}`));
      rmSync(join(dir, f), { force: true });
    }
  }
  // The package is named after the folder.
  const pkg = join(dir, 'package.json');
  if (existsSync(pkg)) {
    const data = JSON.parse(readFileSync(pkg, 'utf8'));
    data.name = basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-talk';
    writeFileSync(pkg, `${JSON.stringify(data, null, 2)}\n`);
  }
  // The CI workflow, and with --repo a git repository with slide by slide merging.
  const r = setupRepo(dir, { init: !!args.repo });
  const repoNote = args.repo ? `\nA git repository${r.driver ? ', with slides that merge one by one' : ''}.` : '';
  console.log(`Created ${dir}${repoNote}

Next:
  cd ${name}
  npm install          Quorum for this folder (or use a global quorum)
  npm run studio       Open Studio

Then ask your agent (Claude Code, Codex, Cursor...) in that folder for the talk
you want: AGENTS.md tells it the format and how to check its work.`);
}

async function cmdCheck(args) {
  const dir = talkDir(args);
  const file = talkFile(args);
  const result = checkTalk(dir, file);
  if (args.visual && existsSync(join(dir, file))) {
    const report = await renderTalk(dir, { file, results: true });
    if (!report.available) {
      result.visual = false;
      result.note = `--visual needs Playwright: ${INSTALL_PLAYWRIGHT}`;
      if (!args.json) console.log(result.note);
    } else {
      result.visual = true;
      // The browser measured: its answer replaces the estimate.
      result.suggestions = result.suggestions.filter((s) => s.kind !== 'overflow');
      overflowIssues(report).forEach((i) => {
        result.issues.push(i);
        result.warnings.push(i.message);
      });
      report.errors.forEach((e) => {
        const i = { kind: 'error', slide: null, message: `The page reported an error: ${e}` };
        result.issues.push(i);
        result.warnings.push(i.message);
      });
      result.ok = result.warnings.length === 0;
    }
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  ensureTalk(dir, file);
  const kinds = [...new Set(result.interactions.map((i) => i.kind))];
  console.log(`${result.title}: ${result.slides} slides, ${result.interactions.length} interactions${kinds.length ? ` (${kinds.join(', ')})` : ''}.`);
  if (result.ok) console.log('No problems found.');
  else {
    console.log('\nThings to check in your talk:');
    result.warnings.forEach((w) => console.log(`  - ${w}`));
  }
  if (result.suggestions.length) {
    console.log('\nSuggestions to make it better:');
    result.suggestions.forEach((s) => console.log(`  - ${s.message}`));
  }
  process.exit(result.ok ? 0 : 1);
}

async function cmdSnapshot(args) {
  const dir = talkDir(args);
  const file = talkFile(args);
  ensureTalk(dir, file);
  const out = resolve(args.out || join(dir, '.quorum-snapshots'));
  console.log(`Taking a picture of every slide of ${join(dir, file)}…`);
  const report = await renderTalk(dir, {
    file,
    out,
    results: !args['no-results'],
    onSlide: (s) => process.stdout.write(`  ${s.slide}`),
  });
  if (!report.available) {
    console.error(`\nquorum snapshot needs Playwright: ${INSTALL_PLAYWRIGHT}`);
    process.exit(1);
  }
  console.log(`\n\n${report.pictures.length} pictures in ${out}
Contact sheet: ${report.contact}`);
  const issues = overflowIssues(report);
  issues.forEach((i) => console.log(`  - ${i.message}`));
  report.errors.forEach((e) => console.log(`  - The page reported an error: ${e}`));
  process.exit(issues.length || report.errors.length ? 1 : 0);
}

function cmdSchema(args) {
  if (args.icons) {
    const names = Object.keys(ICONS);
    if (args.json) console.log(JSON.stringify(names));
    else console.log(`${names.length} icons, for {icon=name} and :icon[name]:\n\n${names.join(' ')}`);
    return;
  }
  const s = schema();
  if (args.json) {
    console.log(JSON.stringify({ ...s, icons: Object.keys(ICONS) }, null, 2));
    return;
  }
  const section = (title, entries) => {
    console.log(`\n${title}`);
    Object.entries(entries).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${typeof v === 'string' ? v : v.about || ''}${v.values ? ` (${v.values.join(', ')})` : ''}`));
  };
  console.log('Everything a talk can use. `quorum schema --json` prints it for tools.');
  section('Themes (theme:)', s.presets);
  section('Tokens (front matter)', s.tokens);
  section('Brand (front matter)', s.brand);
  section('Layouts (<!-- layout: name -->)', s.layouts);
  section('Blocks (::: name)', s.blocks);
  section('Classes ({.name})', s.classes);
  section('Attributes ({key=value})', s.attributes);
  section('Result looks ({chart=name} on an interaction)', Object.fromEntries(Object.entries(s.resultStyles).map(([k, v]) => [k, v.join(', ')])));
  console.log(`\nChart types (::: chart type): ${s.chartTypes.join(', ')}`);
  console.log(`Step effects (-- name): ${s.stepEffects.join(', ')}`);
  console.log(`Icons: ${Object.keys(ICONS).length}, listed by \`quorum schema --icons\`.`);
}

function cmdTheme(args) {
  const [, sub, value] = args._;
  try {
    if (sub === 'new') {
      if (!value) throw new Error('Usage: quorum theme new <name> [folder]');
      const dir = resolve(args._[3] || '.');
      ensureTalk(dir, talkFile(args));
      const out = saveTheme(dir, value, talkFile(args));
      console.log(`Saved ${out}
Use it in any talk folder that has it: theme: themes/${value}.yaml`);
      return;
    }
    if (sub === 'from') {
      if (!value) throw new Error('Usage: quorum theme from <logo.svg|logo.png> [--save name]');
      const theme = themeFromLogo(resolve(value));
      const lines = frontMatterFor(theme, value);
      console.log(`A theme for this logo. Put these lines in the front matter of talk.md:\n\n${lines}\n`);
      if (args.save) {
        const dir = resolve(args._[3] || '.');
        mkdirSync(join(dir, 'themes'), { recursive: true });
        const out = join(dir, 'themes', `${args.save}.yaml`);
        writeFileSync(out, `# A Quorum theme made from ${value}.\n${lines.replace(/^theme: /, 'extends: ').replace(/^logo: .*$/m, '')}\n`);
        console.log(`Saved ${out} (theme: themes/${args.save}.yaml)`);
      }
      return;
    }
    throw new Error('Usage: quorum theme new <name> [folder] | quorum theme from <logo>');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function cmdClean(args) {
  const dir = talkDir(args);
  const data = join(dir, '.quorum');
  ['state.json', 'state.json.tmp'].forEach((f) => rmSync(join(data, f), { force: true }));
  try {
    rmSync(join(data, 'browser'), { recursive: true, force: true });
  } catch {
    console.log('Close the presentation window to delete its browser profile too.');
  }
  if (args.key) rmSync(join(data, 'key.txt'), { force: true });
  console.log(`Session data deleted in ${data}.${args.key ? ' A new presenter key will be created next time.' : ''}`);
}

async function startFor(args, options = {}) {
  const dir = talkDir(args);
  const file = talkFile(args);
  ensureTalk(dir, file);
  const port = Number(args.port || 8080);
  try {
    const server = await startServer({ talkDir: dir, file, port, moderation: !args['no-moderation'], ...options });
    printWarnings(server.talk());
    return { dir, file, server };
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Try --port ${port + 1}.` : error.message);
    process.exit(1);
  }
}

async function cmdStudio(args) {
  const { file, server } = await startFor(args, { preview: true, studio: true });
  const talk = server.talk();
  console.log(`\nStudio for "${talk.meta.title}" (${talk.slides.length} slides).
  Open:  ${server.urls.studio}
  Every change you make is written to ${file} (or its slide files): \`git diff\` shows it.
  This page is only for this computer, and its address holds a key: do not share it.
  Ctrl+C to stop.\n`);
  if (!args['no-open']) openUrl(server.urls.studio);
}

async function cmdPreview(args) {
  const { file, server } = await startFor(args, { preview: true });
  const talk = server.talk();
  console.log(`\nPreview of "${talk.meta.title}" (${talk.slides.length} slides).
  Open:  ${server.urls.preview}
  A simulated audience joins and votes. Edit ${file} and the slides update.
  Ctrl+C to stop.\n`);
  if (!args['no-open']) openUrl(server.urls.preview);
}

async function cmdLive(args) {
  const { dir, server } = await startFor(args);
  const talk = server.talk();
  const children = [];
  const stop = () => {
    children.forEach((c) => { try { c.kill(); } catch { /* already gone */ } });
    server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  let opened = false;
  const openWindows = () => {
    if (opened || args['no-open']) return;
    opened = true;
    const browser = findChromium();
    if (browser) {
      const profile = join(dir, '.quorum', 'browser');
      mkdirSync(profile, { recursive: true });
      openAppWindow(browser, server.urls.present, profile);
      console.log('Presentation opened in its own window: share that window in your call.');
    } else {
      console.log('Chrome or Edge not found: open the presentation link yourself.');
    }
    setTimeout(() => openUrl(server.urls.panel), 1500);
  };

  const summary = (audience) => {
    console.log(`
=============== ${talk.meta.title} ===============
  Presentation (share this window): ${server.urls.present}
  Panel (only for you):             ${server.urls.panel}
  Audience link:                    ${audience || 'none (only this computer can join)'}
  Keep the presenter key private. Ctrl+C stops everything.
`);
    openWindows();
  };

  // Without a public link, people on the same network can still join.
  const local = () => {
    const url = lanUrl(server.port);
    if (url) server.setPublicUrl(url);
    summary(url && `${url} (same network only)`);
  };
  if (args['no-tunnel']) {
    local();
    return;
  }
  const tunnel = startTunnel(server.port, {
    onUrl: (url) => {
      server.setPublicUrl(url);
      summary(url);
    },
    onExit: (code) => {
      const url = lanUrl(server.port);
      console.error(`\nThe public link stopped (code ${code}). New phones cannot join through it.
${url ? `People on the same network can still join at ${url}. ` : ''}Votes are saved: restart quorum live for a new link.`);
      if (url) server.setPublicUrl(url);
    },
  });
  if (!tunnel) {
    console.log(`No tunnel program found, so only people on your network can join.
  For a public link, install cloudflared: ${INSTALL.cloudflared}`);
    local();
    return;
  }
  console.log('Opening a public link…');
  children.push(tunnel);
  setTimeout(() => {
    if (!opened) {
      console.log('The public link is taking a while. Using the local network for now.');
      local();
    }
  }, 25000);
}

// A static site of the talk. With `audience`, a simulated room plays the
// interactions (quorum build); without, only the other slides are kept
// (quorum export), for when nobody can join.
function buildStatic(args, { audience = true } = {}) {
  const dir = talkDir(args);
  const file = talkFile(args);
  ensureTalk(dir, file);
  const out = resolve(args.out || join(dir, audience ? 'dist' : 'export'));
  let talk = readTalk(dir, file);
  printWarnings(talk);
  if (!audience) talk = withoutAudience(talk);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  ['css', 'js', 'fonts'].forEach((d) => cpSync(join(ROOT, 'app', d), join(out, d), { recursive: true }));
  cpSync(join(ROOT, 'app', 'favicon.svg'), join(out, 'favicon.svg'));
  cpSync(join(ROOT, 'src', 'shared'), join(out, 'shared'), { recursive: true });
  // The talk's own files (images, components), without session data.
  cpSync(dir, join(out, 'talk'), {
    recursive: true,
    filter: (src) => {
      const name = basename(src);
      return !name.startsWith('.') && resolve(src) !== out
        && !['dist', 'export', 'node_modules', 'variants', '.github'].includes(name);
    },
  });
  writeFileSync(join(out, 'talk.json'), JSON.stringify({ ...talk, version: 1 }));
  writeFileSync(join(out, 'static-config.js'),
    `window.QUORUM_STATIC = { talk: 'talk.json', assets: 'talk/', components: 'talk/components/', audience: ${audience} };\n`);
  const html = readFileSync(join(ROOT, 'app', 'present.html'), 'utf8')
    .replace('<script type="module"', '<script src="static-config.js"></script>\n  <script type="module"');
  writeFileSync(join(out, 'index.html'), html);
  if (audience) {
    console.log(`Built a playable copy of "${talk.meta.title}" in ${out}
Open ${join(out, 'index.html')} through any static web server (for example GitHub Pages).`);
  } else {
    console.log(`Exported the ${talk.slides.length} slides of "${talk.meta.title}" without the audience parts, in ${out}
Present it from any static web server, for example: python3 -m http.server -d ${out}`);
  }
}

// Copies the agent skill where Claude Code (or another agent, with --to)
// finds it: <skills folder>/quorum/SKILL.md.
async function cmdExportFile(args) {
  const dir = talkDir(args);
  const file = talkFile(args);
  ensureTalk(dir, file);
  const talk = readTalk(dir, file);
  printWarnings(talk);
  const pdf = !!args.pdf;
  const slug = (talk.meta.title || 'talk').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'talk';
  const out = resolve(args.out || join(dir, 'export', `${slug}${args.results ? '-results' : ''}.${pdf ? 'pdf' : 'pptx'}`));
  const res = await exportTalk(dir, {
    file, out, pdf, safeFonts: !!args['safe-fonts'], results: !!args.results, audience: !args['no-audience'],
    onSlide: (n, total) => process.stdout.write(`\r  slide ${n} of ${total}  `),
  });
  process.stdout.write('\r                    \r');
  if (res.available === false) {
    console.error(`Exporting needs Playwright, which Quorum does not install itself:\n  ${INSTALL_PLAYWRIGHT}`);
    process.exit(1);
  }
  if (res.error) {
    console.error(res.error);
    process.exit(1);
  }
  console.log(`Wrote ${res.file} (${res.slides} slides${res.charts ? `, ${res.charts} editable chart${res.charts === 1 ? '' : 's'}` : ''}).`);
  if (res.problems && res.problems.length) {
    console.log('\nThe file has structural problems, PowerPoint may ask to repair it:');
    res.problems.forEach((p) => console.log(`  - ${p}`));
  }
  if (res.needsFonts && res.needsFonts.length) {
    console.log(`\nFonts: this file uses ${res.needsFonts.join(', ')}. Computers without them show a substitute.\nInstall them (they are in app/fonts of Quorum) or export with --safe-fonts.`);
  }
  if (res.fallbacks && res.fallbacks.length) {
    const unique = [...new Set(res.fallbacks)];
    console.log(`\nSome parts became pictures, so they cannot be edited in PowerPoint:\n${unique.slice(0, 12).map((f) => `  - ${f}`).join('\n')}${unique.length > 12 ? `\n  ... and ${unique.length - 12} more` : ''}`);
  }
  if (pdf) console.log('The PDF has one picture per slide: text in it cannot be selected.');
}

function cmdSplit(args) {
  const dir = talkDir(args);
  ensureTalk(dir, talkFile(args));
  try {
    const { files } = splitTalk(dir, talkFile(args));
    console.log(`Split ${talkFile(args)} into ${files.length} files in slides/:\n${files.map((f) => `  ${f}`).join('\n')}\nOne file per slide: two people or agents on two slides never touch the same file. Put new slides between others by numbering (015-new-idea.md), or list the order with "order:" in the front matter.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function cmdJoin(args) {
  const dir = talkDir(args);
  ensureTalk(dir, talkFile(args));
  try {
    const { files } = joinTalk(dir, talkFile(args));
    console.log(`Joined ${files.length} slide files into ${talkFile(args)} and removed them.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// git calls this to merge talk.md: quorum merge-driver %O %A %B
function cmdMergeDriver(args) {
  const [, base, ours, theirs] = args._;
  if (!base || !ours || !theirs) {
    console.error('Usage: quorum merge-driver <base> <ours> <theirs> (git runs this; see `quorum repo`)');
    process.exit(2);
  }
  const read = (f) => readFileSync(f, 'utf8');
  let result = mergeTalks(read(base), read(ours), read(theirs));
  if (result.text === null) result = mergeText(read(base), read(ours), read(theirs));
  if (result.text === null) process.exit(1);
  writeFileSync(ours, result.text.endsWith('\n') ? result.text : `${result.text}\n`);
  process.exit(result.conflicts ? 1 : 0);
}

function cmdRepo(args) {
  const dir = talkDir(args);
  const r = setupRepo(dir, { init: false });
  // "npm install" runs this (the prepare script): only a word when it matters.
  if (args.quiet) {
    if (r.driver) console.log('Quorum: slides in talk.md merge one by one in this clone.');
    return;
  }
  console.log(r.done.length ? `Added: ${r.done.join(', ')}` : 'The workflow and .gitattributes are already there.');
  console.log(r.driver
    ? 'Slides now merge one by one in this clone. Every other clone runs `quorum repo` once too.'
    : 'This folder is not in a git repository yet: run `git init`, then `quorum repo` again to set the merge driver up.');
}

async function cmdDiff(args) {
  // quorum diff [rev] [folder]
  const rev = args._[1] || 'HEAD';
  const dir = resolve(args._[2] || '.');
  const file = talkFile(args);
  ensureTalk(dir, file);
  let d;
  try {
    d = diffTalk(dir, rev, { file });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  try {
    const { oldDir, tmp, ...plain } = d;
    if (args.json) console.log(JSON.stringify(plain, null, 2));
    else console.log(describe(d));
    if (args.pictures) {
      const path = await diffPictures(dir, d, { out: resolve(args.out || join(dir, '.quorum-snapshots', 'diff')), file });
      if (path) console.error(`Before and after pictures: ${path}`);
      else if (d.changed.length + d.added.length + d.removed.length) console.error(`--pictures needs Playwright: ${INSTALL_PLAYWRIGHT}`);
    }
  } finally {
    cleanup(d);
  }
}

const NEEDS = `needs Playwright: ${INSTALL_PLAYWRIGHT}`;

async function cmdExplore(args) {
  const dir = talkDir(args);
  const file = talkFile(args);
  ensureTalk(dir, file);
  const out = resolve(args.out || join(dir, '.quorum-snapshots', 'explore'));
  try {
    if (args.themes) {
      const names = typeof args.themes === 'string' ? args.themes.split(',').map((x) => x.trim()).filter(Boolean) : null;
      const res = await exploreThemes(dir, { file, themes: names, count: Number(args.count) || 4, out });
      if (!res.available) { console.error(`quorum explore ${NEEDS}`); process.exit(1); }
      if (args.json) { console.log(JSON.stringify(res, null, 2)); return; }
      console.log('The first slides of the talk in each theme:');
      res.themes.forEach((t) => console.log(`  ${t.theme.padEnd(10)} ${t.warnings} warnings, ${t.suggestions} suggestions`));
      console.log(`\nPicture: ${res.grid}\nUse one: set "theme: <name>" in the front matter.`);
      return;
    }
    if (!args.slide) {
      console.error('Usage: quorum explore --slide <id or number> [folder]    (or: quorum explore --themes [a,b,c])');
      process.exit(1);
    }
    if (args.pick) {
      // Option numbers are the ones in the picture: no browser needed.
      const { slide, list } = optionsFor(dir, file, args.slide, { remixToo: !args['no-remix'] });
      const n = Number(args.pick);
      const chosen = Number.isInteger(n) ? list[n - 1] : list.find((c) => c.name === args.pick);
      if (!chosen || chosen.source === 'current') throw new Error(`There is no option "${args.pick}" to pick (1 is the slide as it is; 2 to ${list.length} are the alternatives).`);
      const where = replaceSlide(dir, file, slide, chosen.text);
      const stored = chosen.source === 'variant' ? findVariant(listVariants(dir, slide.id), chosen.name) : null;
      if (stored) removeVariant(dir, slide.id, stored);
      console.log(`${slide.id} now uses "${chosen.name}". Written to ${where}; \`git diff\` shows the change.`);
      return;
    }
    const res = await exploreSlide(dir, { file, slide: args.slide, remix: !args['no-remix'], out: join(out, String(args.slide)) });
    if (!res.available) { console.error(`quorum remix ${NEEDS}`); process.exit(1); }
    if (args.json) { console.log(JSON.stringify(res, null, 2)); return; }
    if (!res.candidates.length) { console.log(res.reason); return; }
    console.log(`${res.slide.title}: ${res.candidates.length - 1} other layouts\n`);
    res.candidates.forEach((c) => {
      console.log(`${String(c.number).padStart(3)}  ${c.name.padEnd(16)} ${c.source === 'current' ? 'the slide as it is' : c.direction}${c.by && c.source === 'variant' ? ` (${c.by})` : ''}`);
      c.problems.slice(0, 2).forEach((p) => console.log(`       ! ${p}`));
    });
    console.log(`\nLook at them: ${res.grid}\nChoose one: quorum remix ${res.slide.id} --pick <number>`);
    res.skipped.forEach((x) => console.log(`Skipped ${x}`));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// quorum variant add|list|remix|pick|clear <slide> [folder]
async function cmdVariant(args) {
  const [, sub, ref] = args._;
  const file = talkFile(args);
  const usage = 'Usage: quorum variant <add|list|remix|pick|clear> <slide> [folder]';
  if (!sub || !ref) { console.error(usage); process.exit(1); }
  const folderAt = sub === 'pick' ? 4 : 3;
  const dir = resolve(args._[folderAt] || '.');
  ensureTalk(dir, file);
  try {
    const talk = readTalk(dir, file);
    const slide = findSlide(talk, ref);
    if (sub === 'add') {
      const source = args.from ? readFileSync(resolve(args.from), 'utf8') : readFileSync(0, 'utf8');
      if (!source.trim()) throw new Error('Nothing to add: pipe the slide in, or use --from <file>.');
      const made = addVariant(dir, slide.id, source, { by: args.by || 'unknown', direction: args.direction || '' });
      console.log(`Saved ${made.file}\nSee it next to the others: quorum explore --slide ${slide.id}`);
    } else if (sub === 'list') {
      const list = listVariants(dir, slide.id);
      console.log(list.length ? list.map((v) => `${v.name}  ${v.direction || '(no direction)'}${v.by ? ` (${v.by})` : ''}`).join('\n') : `No variants for ${slide.id} yet. \`quorum variant remix ${slide.id}\` makes some.`);
    } else if (sub === 'remix') {
      const r = remix(slideText(dir, file, slide));
      if (!r.variants.length) { console.log(r.reason || 'Nothing to rearrange on this slide.'); return; }
      r.variants.forEach((v) => addVariant(dir, slide.id, v.text, { by: 'quorum', direction: v.direction, name: v.name }));
      console.log(`Saved ${r.variants.length} variants in variants/${slide.id}/: ${r.variants.map((v) => v.name).join(', ')}`);
    } else if (sub === 'clear') {
      clearVariants(dir, slide.id);
      console.log(`Removed the variants of ${slide.id}.`);
    } else if (sub === 'pick') {
      let chosen = null;
      let stored = null;
      {
        const which = args._[3];
        if (!which) throw new Error('Say which one: quorum variant pick <slide> <name or number> (quorum variant list shows them).');
        stored = findVariant(listVariants(dir, slide.id), which);
        if (stored) chosen = { name: stored.name, text: stored.text };
        else {
          const made = remix(slideText(dir, file, slide)).variants.find((v) => v.name === which);
          if (!made) throw new Error(`There is no variant "${which}" for ${slide.id}.`);
          chosen = made;
        }
      }
      const where = replaceSlide(dir, file, slide, chosen.text);
      if (stored) removeVariant(dir, slide.id, stored);
      console.log(`${slide.id} now uses "${chosen.name}". Written to ${where}. \`git diff\` shows the change; quorum check to verify.`);
    } else {
      console.error(usage);
      process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function cmdSkill(args) {
  const to = resolve(args.to || join(homedir(), '.claude', 'skills'), 'quorum');
  mkdirSync(to, { recursive: true });
  cpSync(join(ROOT, 'agents', 'quorum'), to, { recursive: true });
  console.log(`Installed the Quorum skill in ${join(to, 'SKILL.md')}
Your agent can now write and check Quorum talks. Start a new agent session to load it.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let cmd = args._[0];
  // Just "quorum" in a talk folder opens Studio.
  if (!cmd && !args.help && existsSync(join(process.cwd(), 'talk.md'))) {
    cmd = 'studio';
    args._ = ['studio'];
  }
  if (args.version || cmd === 'version') {
    console.log(VERSION);
    return;
  }
  switch (cmd) {
    case 'new': cmdNew(args); break;
    case 'check': await cmdCheck(args); break;
    case 'snapshot': await cmdSnapshot(args); break;
    case 'schema': cmdSchema(args); break;
    case 'split': cmdSplit(args); break;
    case 'join': cmdJoin(args); break;
    case 'merge-driver': cmdMergeDriver(args); break;
    case 'repo': cmdRepo(args); break;
    case 'diff': await cmdDiff(args); break;
    case 'remix':
      args.slide = args._[1];
      args._ = ['remix', args._[2]];
      await cmdExplore(args);
      break;
    case 'explore': await cmdExplore(args); break;
    case 'variant': await cmdVariant(args); break;
    case 'theme': cmdTheme(args); break;
    case 'clean': cmdClean(args); break;
    case 'skill': cmdSkill(args); break;
    case 'build': buildStatic(args); break;
    case 'export':
      if (args.pptx || args.pdf) await cmdExportFile(args);
      else buildStatic(args, { audience: false });
      break;
    case 'preview':
    case 'rehearse': await cmdPreview(args); break; // "rehearse" is the old name
    case 'live':
    case 'present': await cmdLive(args); break;
    case 'studio': await cmdStudio(args); break;
    default:
      console.log(HELP);
      if (cmd && cmd !== 'help') process.exit(1);
  }
}

main();
