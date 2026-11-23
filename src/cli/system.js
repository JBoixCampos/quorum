// Running other programs (cloudflared, ngrok, the browser) the same way on
// Windows, macOS and Linux.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

export const WINDOWS = process.platform === 'win32';
export const MAC = process.platform === 'darwin';

export const INSTALL = {
  cloudflared: WINDOWS ? 'winget install --id Cloudflare.cloudflared' : (MAC ? 'brew install cloudflared' : 'see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'),
  ngrok: WINDOWS ? 'winget install --id Ngrok.Ngrok' : (MAC ? 'brew install ngrok' : 'see https://ngrok.com/download'),
};

export function has(program) {
  return spawnSync(WINDOWS ? 'where' : 'which', [program], { stdio: 'ignore' }).status === 0;
}

export function run(program, args, options = {}) {
  return spawn(program, args, { windowsHide: true, ...options });
}

// The public URL that cloudflared or ngrok prints.
export function tunnelUrl(text) {
  const m = String(text).match(/https:\/\/[a-z0-9-]+\.(trycloudflare\.com|ngrok-free\.app|ngrok\.app|ngrok\.io)/i);
  return m ? m[0] : null;
}

// Starts a tunnel to the local port. Calls onUrl(url) once it is up and
// onExit(code) if it stops. Returns the child process, or null.
export function startTunnel(port, { onUrl, onExit }) {
  let child = null;
  if (has('cloudflared')) {
    child = run('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`]);
  } else if (has('ngrok')) {
    child = run('ngrok', ['http', String(port), '--log', 'stdout']);
  } else {
    return null;
  }
  let found = false;
  const read = (chunk) => {
    if (found) return;
    const url = tunnelUrl(chunk);
    if (url) {
      found = true;
      onUrl(url);
    }
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  child.on('exit', (code) => onExit(code));
  child.on('error', () => onExit(-1));
  return child;
}

// Chrome or Edge, to open the presentation in its own window.
export function findChromium() {
  if (WINDOWS) {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const path of ['Google\\Chrome\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe']) {
      for (const root of roots) {
        if (existsSync(`${root}\\${path}`)) return `${root}\\${path}`;
      }
    }
    return null;
  }
  if (MAC) {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ].find((p) => existsSync(p)) || null;
  }
  return ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'].find((p) => has(p)) || null;
}

// Opens the presentation as an app window with its own profile. The flags
// keep it painting while another window covers it: if it froze, the video
// call would share a still image.
export function openAppWindow(browser, url, profileDir) {
  const child = spawn(browser, [
    `--app=${url}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1600,900',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

// Opens a URL in the default browser.
export function openUrl(url) {
  let program = 'xdg-open';
  let args = [url];
  if (WINDOWS) {
    program = 'rundll32';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (MAC) {
    program = 'open';
  }
  const child = spawn(program, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

// This computer's address on the local network, for phones on the same wifi.
export function lanUrl(port) {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) return `http://${a.address}:${port}`;
    }
  }
  return null;
}
