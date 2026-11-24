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
