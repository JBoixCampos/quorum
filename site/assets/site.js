// Copy buttons: <button data-copy="#id"> copies the text of that element.
document.querySelectorAll('[data-copy]').forEach((button) => {
  const label = button.textContent;
  button.addEventListener('click', () => {
    const source = document.querySelector(button.dataset.copy);
    if (!source || !navigator.clipboard) return;
    navigator.clipboard.writeText(source.textContent.trim()).then(() => {
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = label; }, 1600);
    }, () => {});
  });
});

// The theme toggle. Without a saved choice the page follows the system
// setting (in CSS); the first click saves the opposite of what is showing.
document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
  const root = document.documentElement;
  const dark = () => (root.dataset.theme
    ? root.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches);
  const sync = () => {
    button.setAttribute('aria-pressed', String(dark()));
    button.setAttribute('aria-label', dark() ? 'Switch to light mode' : 'Switch to dark mode');
  };
  button.addEventListener('click', () => {
    const next = dark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('quorum-theme', next); } catch (e) { /* private mode: it lasts for this visit */ }
    sync();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
  sync();
});

// A copy button on code blocks: the commands in "Get started", the docs and the
// examples. A leading "$ " (the prompt) is not copied.
document.querySelectorAll('.startsteps pre, .prose pre, .ex-text pre').forEach((pre) => {
  if (!navigator.clipboard) return;
  const box = document.createElement('div');
  box.className = 'codebox';
  pre.parentNode.insertBefore(box, pre);
  box.appendChild(pre);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-code';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', 'Copy this code');
  box.appendChild(button);
  button.addEventListener('click', () => {
    const text = pre.textContent.replace(/^\$ /gm, '').replace(/\n+$/, '');
    navigator.clipboard.writeText(text).then(() => {
      button.textContent = 'Copied';
      button.classList.add('done');
      setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('done'); }, 1600);
    }, () => {});
  });
});

// "What does Quorum mean?": the i button in the first screen opens a small dialog.
document.querySelectorAll('[data-name-open]').forEach((button) => {
  const dialog = document.getElementById('name-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') { button.hidden = true; return; }
  button.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
});
