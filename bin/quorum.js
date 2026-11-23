#!/usr/bin/env node
// Quorum command line.
//
//   quorum new <folder>        create a talk from the starter template
//   quorum rehearse [folder]   rehearse with a simulated audience
//   quorum live [folder]       give the talk: server, public link, QR, windows
//   quorum offline [folder]    give it without a public link (votes typed from the chat)
//   quorum check [folder]      check talk.md for mistakes (--json for tools)
//   quorum build [folder]      a static, playable demo of the talk (rehearsal mode)
//   quorum clean [folder]      delete votes and questions saved by a live session

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkTalk } from '../src/cli/check.js';
import { INSTALL, findChromium, openAppWindow, openUrl, startTunnel } from '../src/cli/system.js';
import { startServer } from '../src/server/server.js';
import { parseTalk } from '../src/shared/markdown.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('-') && ['port', 'out', 'key', 'file'].includes(k)) {
        args[k] = argv[i + 1];
        i += 1;
      } else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

const HELP = `Quorum ${VERSION}: presentations where the audience takes part.

Usage:
  quorum new <folder>        Create a new talk
  quorum rehearse [folder]   Rehearse with a simulated audience
  quorum live [folder]       Give the talk (server, public link, QR code, windows)
  quorum offline [folder]    Give it without a public link: you type in votes from the chat
  quorum check [folder]      Check talk.md for mistakes
  quorum build [folder]      Build a static, playable demo (rehearsal mode)
  quorum clean [folder]      Delete the votes and questions of the last session

Options:
  --port <n>      Local port (default 8080)
  --file <name>   Talk file inside the folder (default talk.md)
  --no-tunnel     Do not open a public link
  --no-open       Do not open any window
  --no-moderation Show questions without approving them first
  --out <folder>  Where "build" writes the site (default <folder>/dist)
  --json          "check" prints { ok, title, slides, interactions, warnings }
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
function lanUrl(port) {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) return `http://${a.address}:${port}`;
    }
  }
  return null;
}

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
  cpSync(join(ROOT, 'templates', 'starter'), dir, { recursive: true });
  // npm drops files named .gitignore when publishing, so it is stored as "gitignore".
  if (existsSync(join(dir, 'gitignore'))) cpSync(join(dir, 'gitignore'), join(dir, '.gitignore'));
  rmSync(join(dir, 'gitignore'), { force: true });
  console.log(`Created ${dir}

Next:
  1. Edit ${join(name, 'talk.md')} (it explains the format as it goes)
  2. quorum rehearse ${name}    try it with a simulated audience
  3. quorum live ${name}        give it`);
}

function cmdCheck(args) {
  const dir = talkDir(args);
  const file = talkFile(args);
  const result = checkTalk(dir, file);
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
  process.exit(result.ok ? 0 : 1);
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

async function serve(args, { rehearse = false, chat = false } = {}) {
  const dir = talkDir(args);
  const file = talkFile(args);
  ensureTalk(dir, file);
  const port = Number(args.port || 8080);
  let server;
  try {
    server = await startServer({ talkDir: dir, file, port, moderation: !args['no-moderation'] });
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Try --port ${port + 1}.` : error.message);
    process.exit(1);
  }
  const talk = server.talk();
  printWarnings(talk);

  if (rehearse) {
    console.log(`\nRehearsal of "${talk.meta.title}" (${talk.slides.length} slides).
  Open:  ${server.urls.rehearse}
  A simulated audience joins and votes. Edit ${file} and the slides update.
  Ctrl+C to stop.\n`);
    if (!args['no-open']) openUrl(server.urls.rehearse);
    return;
  }

  server.setChatMode(chat);
  const children = [];
  const stop = () => {
    children.forEach((c) => { try { c.kill(); } catch { /* already gone */ } });
    server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const opened = { done: false };
  const openWindows = () => {
    if (opened.done || args['no-open']) return;
    opened.done = true;
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

  const summary = (publicUrl) => {
    console.log(`
=============== ${talk.meta.title} ===============
  Presentation (share this window): ${server.urls.present}
  Panel (only for you):             ${server.urls.panel}
  ${chat ? 'Chat mode: no public link. Type in the votes you read in the chat by clicking the options.' : (publicUrl ? `Audience link:                    ${publicUrl}` : 'Audience link:                    none (only people on this network can join)')}
  Keep the presenter key private. Ctrl+C stops everything.
`);
    openWindows();
  };

  const wantTunnel = !chat && !args['no-tunnel'];
  const local = () => {
    const url = lanUrl(server.port);
    if (url && !chat) server.setPublicUrl(url);
    summary(url && !chat ? `${url} (same network only)` : null);
  };
  if (!wantTunnel) {
    local();
    return;
  }
  const tunnel = startTunnel(server.port, {
    onUrl: (url) => {
      server.setPublicUrl(url);
      summary(url);
    },
    onExit: (code) => {
      console.error(`\nThe public link stopped (code ${code}). People cannot join any more.
Press B in the presentation (or "Switch to chat mode" in the panel) and carry on through the chat.`);
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
    if (!opened.done) {
      console.log('The public link is taking a while. Using the local network for now.');
      local();
    }
  }, 25000);
}

function cmdBuild(args) {
  const dir = talkDir(args);
  const file = talkFile(args);
  ensureTalk(dir, file);
  const out = resolve(args.out || join(dir, 'dist'));
  const talk = parseTalk(readFileSync(join(dir, file), 'utf8'));
  printWarnings(talk);
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
      return !name.startsWith('.') && resolve(src) !== out && name !== 'dist' && name !== 'node_modules';
    },
  });
  writeFileSync(join(out, 'talk.json'), JSON.stringify({ ...talk, version: 1 }));
  writeFileSync(join(out, 'static-config.js'),
    "window.QUORUM_STATIC = { talk: 'talk.json', assets: 'talk/', components: 'talk/components/' };\n");
  const html = readFileSync(join(ROOT, 'app', 'present.html'), 'utf8')
    .replace('<script type="module"', '<script src="static-config.js"></script>\n  <script type="module"');
  writeFileSync(join(out, 'index.html'), html);
  console.log(`Built a playable demo of "${talk.meta.title}" in ${out}
Open ${join(out, 'index.html')} through any static web server (for example GitHub Pages).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (args.version || cmd === 'version') {
    console.log(VERSION);
    return;
  }
  switch (cmd) {
    case 'new': cmdNew(args); break;
    case 'check': cmdCheck(args); break;
    case 'clean': cmdClean(args); break;
    case 'build': cmdBuild(args); break;
    case 'rehearse': await serve(args, { rehearse: true }); break;
    case 'live': await serve(args); break;
    case 'offline': await serve(args, { chat: true }); break;
    default:
      console.log(HELP);
      if (cmd && cmd !== 'help') process.exit(1);
  }
}

main();
