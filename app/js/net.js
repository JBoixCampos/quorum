// Talking to the Quorum server with long polling: ask for anything newer
// than the version we have; the server answers as soon as something
// changes, or after 20 s, and we ask again. Works through tunnels and
// proxies, which hold back open streams but not complete responses.

const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

export function connect({ role, key = '', device = '', onChange, onStatus }) {
  const params = new URLSearchParams({ role });
  if (key) params.set('key', key);
  if (device) params.set('d', device);
  const query = params.toString();

  let version = '';
  let status = '';
  let failures = 0;
  let active = true;
  let control = null;
  let restart = false;

  const report = (next) => {
    if (next !== status) {
      status = next;
      if (onStatus) onStatus(next);
    }
  };

  async function loop() {
    while (active) {
      control = new AbortController();
      const limit = setTimeout(() => control.abort(), 30000);
      try {
        const r = await fetch(`/api/wait?${query}&v=${encodeURIComponent(version)}&_=${Date.now()}`, {
          cache: 'no-store',
          signal: control.signal,
        });
        if (!r.ok) throw new Error(`Status ${r.status}`);
        const data = await r.json();
        failures = 0;
        report('connected');
        if (data.v !== version) {
          version = data.v;
          onChange(data.view);
        }
      } catch {
        if (!active) return;
        if (restart) {
          // Cancelled on purpose: the page came back to the foreground.
          restart = false;
        } else {
          failures += 1;
          report(failures >= 3 ? 'offline' : 'reconnecting');
          await sleep(Math.min(3000, 400 * failures));
        }
      } finally {
        clearTimeout(limit);
      }
    }
  }

  // When the tab comes back or the phone is unlocked, ask right away.
  const onBack = () => {
    if (document.visibilityState === 'visible' && control) {
      restart = true;
      control.abort();
    }
  };
  document.addEventListener('visibilitychange', onBack);
  window.addEventListener('online', onBack);
  loop();

  return {
    close() {
      active = false;
      if (control) control.abort();
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('online', onBack);
    },
  };
}

export async function send(action, { key = '', device = '' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['X-Key'] = key;
  try {
    const r = await fetch('/api/action', { method: 'POST', headers, body: JSON.stringify({ action, device }) });
    return await r.json();
  } catch {
    return { ok: false, error: 'No connection. Try again in a few seconds.' };
  }
}

export function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A stable random id for this phone, kept in the browser.
export function deviceId() {
  const KEY = 'quorum-device';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, '');
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `tmp-${Math.random().toString(36).slice(2, 14)}`;
  }
}
