// The playground: Markdown on one side, the real slide on the other.
//
//   <div class="playground" data-playground data-frame="demo/?playground=1">
//     <textarea aria-label="Markdown">::: poll ...</textarea>
//   </div>
//
// The preview is the static build of the demo talk opened with
// ?playground=1: it renders whatever Markdown this page posts to it, with a
// simulated audience, so voting works. Optional attributes:
//   data-persist="key"   keep the draft in this browser
//   data-hash            read a starting draft from #md=... in the address

const CHIPS = [
  ['Title', 'title', '<!-- layout: center -->\n\n# My talk\n\nA subtitle, or your name.'],
  ['Join', 'join', '<!-- layout: center -->\n\n# Welcome\n\n::: join Scan to join\n:::'],
  ['Poll', 'poll', '::: poll {#pizza} Pineapple on pizza?\n- Yes, always\n- Only if nobody is watching\n- Never\n:::'],
  ['Quiz', 'quiz', '::: poll {#capital} Which one is true?\n- Paris is the capital of Italy\n- [x] Rome is the capital of Italy\n\nRome has been the capital since 1871.\n:::'],
  ['Several answers', 'multi', '::: multi {#uses} What do you use every day?\n- Email\n- Chat\n- Video calls\n- Paper\n:::'],
  ['Estimate', 'estimate', '::: estimate {#keys} How many keys does a piano have?\nanswer: 88\nmin: 1\nmax: 500\n\nA standard piano has 88 keys: 52 white and 36 black.\n:::'],
  ['Rounds', 'rounds', '::: rounds {#would} Would you hand this to an AI?\noptions: Yes | No | It depends\n- Writing a birthday message\n- Planning a holiday\n:::'],
  ['Sentence', 'sentence', '::: sentence {#story} Once upon a time\nmax: 6\nstart: there | a | in\nthere: was | lived | were\na: dragon | robot | cat\n*: and | the | .\n:::'],
  ['Word cloud', 'word-cloud', '## One word\n\n::: component word-cloud {#feeling}\naudience: text\nprompt: One word: how do you feel today?\nlength: 24\nexamples: curious | tired | happy | busy | calm\n:::'],
  ['Questions', 'questions', '::: questions\n:::'],
  ['Steps', 'steps', '## One idea at a time\n\nThis shows first.\n\n--\n\nThis shows on the next click.'],
  ['Columns', 'columns', '::: columns\n### Before\nSlides you watch.\n\n+++\n\n### After\nSlides you take part in.\n:::'],
  ['Big number', 'stat', '<!-- layout: center -->\n\n::: stat 88\nkeys on a standard piano.\n:::'],
  ['Callout', 'callout', '## A slide with a callout\n\n::: callout Remember\nA highlighted box with an optional title.\n:::'],
  ['Countdown', 'countdown', '<!-- layout: center -->\n\n## Two minutes to discuss\n\n::: component countdown\nseconds: 120\n:::'],
];

// Which slide the caret is on, counted like the talk parser counts them:
// front matter skipped, `---` outside code fences, empty slides dropped.
export function slideAt(text, caret) {
  const lines = text.slice(0, caret).split('\n');
  const all = text.split('\n');
  let start = 0;
  if (all[0] !== undefined && all[0].trim() === '---') {
    const end = all.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) start = end + 1;
  }
  const filled = [];
  let fence = null;
  let current = 0;
  let blank = true;
  all.forEach((line, n) => {
    if (n < start) return;
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) fence = fence && line.trim().startsWith(fence) ? null : (fence || f[1]);
    if (!fence && line.trim() === '---') {
      filled.push(!blank);
      current += 1;
      blank = true;
    } else if (line.trim() !== '') {
      blank = false;
    }
    if (n === lines.length - 1) filled.caret = current;
  });
  filled.push(!blank);
  const at = filled.caret === undefined ? 0 : filled.caret;
  return filled.slice(0, at).filter(Boolean).length;
}

// Gives a pasted block a fresh {#id} if the text already uses it.
function uniqueIds(snippet, text) {
  return snippet.replace(/\{#([\w-]+)\}/g, (all, id) => {
    let next = id;
    for (let n = 2; text.includes(`{#${next}}`); n += 1) next = `${id}-${n}`;
    return `{#${next}}`;
  });
}

function readHash() {
  const m = location.hash.match(/^#md=(.*)$/s);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage: the draft just is not kept.
  }
  return null;
}

function setup(root) {
  const textarea = root.querySelector('textarea');
  const initial = textarea.value;
  const persist = root.dataset.persist ? `quorum-playground-${root.dataset.persist}` : '';
  const fromHash = root.hasAttribute('data-hash') ? readHash() : null;
  const saved = persist ? store(persist) : null;
  if (fromHash !== null) textarea.value = fromHash;
  else if (saved) textarea.value = saved;

  const chips = document.createElement('div');
  chips.className = 'chips';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Add a slide');
  chips.innerHTML = '<span class="chips-label">Add a slide:</span>';
  CHIPS.forEach(([label, name]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.chip = name;
    b.textContent = label;
    chips.appendChild(b);
  });

  const panes = document.createElement('div');
  panes.className = 'pg-panes';
  const editor = document.createElement('div');
  editor.className = 'pg-editor';
  textarea.spellcheck = false;
  textarea.replaceWith(panes);
  editor.appendChild(textarea);
  const tools = document.createElement('div');
  tools.className = 'pg-tools';
  tools.innerHTML = `<button type="button" class="button" data-pg-copy>Copy Markdown</button>
    <button type="button" class="button" data-pg-reset>Start again</button>`;
  editor.appendChild(tools);

  const preview = document.createElement('div');
  preview.innerHTML = `<div class="screen"><iframe title="Live preview of the slide" src="${root.dataset.frame}"></iframe></div>
    <p class="pg-status" data-pg-status aria-live="polite">Loading the preview.</p>`;
  panes.append(editor, preview);
  root.prepend(chips);

  const frame = preview.querySelector('iframe');
  const status = preview.querySelector('[data-pg-status]');
  let ready = false;
  let timer = 0;

  const send = () => {
    if (!ready) return;
    frame.contentWindow.postMessage({
      type: 'quorum:source',
      markdown: textarea.value,
      slide: slideAt(textarea.value, textarea.selectionStart),
    }, location.origin);
  };
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(send, 200);
  };

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const data = e.data || {};
    if (data.type === 'quorum:ready') {
      ready = true;
      send();
    } else if (data.type === 'quorum:parsed') {
      const hint = 'Click the slide or focus it and press → to open voting: 24 simulated people answer.';
      status.classList.toggle('warn', data.warnings.length > 0);
      if (data.warnings.length) {
        const items = data.warnings.map((w) => `<li>${w.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('');
        status.innerHTML = `Things to check:<ul>${items}</ul>`;
      } else {
        status.textContent = hint;
      }
    }
  });

  textarea.addEventListener('input', () => {
    if (persist) store(persist, textarea.value);
    soon();
  });
  ['click', 'keyup'].forEach((type) => textarea.addEventListener(type, (e) => {
    if (e.type === 'keyup' && !/^(Arrow|Page|Home|End)/.test(e.key)) return;
    soon();
  }));

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip]');
    if (!b) return;
    const snippet = CHIPS.find((c) => c[1] === b.dataset.chip)[2];
    const text = textarea.value.replace(/\s+$/, '');
    const block = uniqueIds(snippet, text);
    textarea.value = text ? `${text}\n\n---\n\n${block}\n` : `${block}\n`;
    const caret = textarea.value.length - 1;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(caret, caret);
    textarea.scrollTop = textarea.scrollHeight;
    if (persist) store(persist, textarea.value);
    send();
  });

  tools.addEventListener('click', (e) => {
    if (e.target.closest('[data-pg-reset]')) {
      textarea.value = initial;
      if (persist) store(persist, initial);
      send();
    }
    const copy = e.target.closest('[data-pg-copy]');
    if (copy && navigator.clipboard) {
      navigator.clipboard.writeText(textarea.value).then(() => {
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy Markdown'; }, 1600);
      }, () => {});
    }
  });
}

document.querySelectorAll('[data-playground]').forEach(setup);
