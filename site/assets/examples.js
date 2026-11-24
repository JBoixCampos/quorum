// The Examples page: every example is a row that opens to a live frame.
//
// - A frame loads when its row is open and near the screen, not before, so a
//   page with 65 examples starts as fast as a list.
// - "Expand all" opens every row of a group (or of the page).
// - "Enlarge" shows one frame in a dialog, big enough to read.
// - A link such as examples/#poll opens that row.
//
// Without JavaScript the rows still open and close, and the Markdown shows.

const rows = [...document.querySelectorAll('details.ex')];
const modal = document.querySelector('[data-modal]');
const modalFrame = document.querySelector('[data-modal-frame]');

// Frames load once, when their row is open and within reach of the viewport.
const seen = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        load(entry.target);
        seen.unobserve(entry.target);
      }
    });
  }, { rootMargin: '300px 0px' })
  : null;

function load(frame) {
  if (!frame.getAttribute('src')) frame.setAttribute('src', frame.dataset.src);
}

function watchFrames(row) {
  const frame = row.querySelector('iframe');
  if (!frame || frame.getAttribute('src')) return;
  if (seen) seen.observe(frame);
  else load(frame);
}

rows.forEach((row) => {
  row.addEventListener('toggle', () => {
    if (row.open) watchFrames(row);
    refreshButtons();
  });
  const enlarge = row.querySelector('[data-max]');
  if (enlarge) {
    enlarge.hidden = false;
    enlarge.addEventListener('click', () => openModal(row));
  }
});

// --- expand all ------------------------------------------------------------

function groupRows(button) {
  const scope = button.closest('.group-block');
  return scope ? [...scope.querySelectorAll('details.ex')] : rows;
}

function refreshButtons() {
  document.querySelectorAll('[data-all], [data-all-page]').forEach((button) => {
    const list = button.hasAttribute('data-all-page') ? rows : groupRows(button);
    const all = list.length > 0 && list.every((r) => r.open);
    button.setAttribute('aria-expanded', String(all));
    button.textContent = all ? 'Collapse all' : 'Expand all';
  });
}

document.querySelectorAll('[data-all], [data-all-page]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', () => {
    const list = button.hasAttribute('data-all-page') ? rows : groupRows(button);
    const open = !list.every((r) => r.open);
    list.forEach((r) => { r.open = open; });
    refreshButtons();
  });
});
refreshButtons();

// --- the dialog ------------------------------------------------------------

function openModal(row) {
  if (!modal || typeof modal.showModal !== 'function') {
    window.open(row.querySelector('iframe').dataset.src, '_blank', 'noopener');
    return;
  }
  const frame = row.querySelector('iframe');
  modal.querySelector('[data-modal-title]').textContent = row.querySelector('.ex-name').firstChild.textContent;
  const note = row.querySelector('.try');
  modal.querySelector('[data-modal-note]').textContent = note ? note.textContent.replace(/^\s*Live\s*/, '').replace(/Try it in the playground/, '').trim() : '';
  modalFrame.src = frame.dataset.src;
  modal.showModal();
}

if (modal) {
  const close = () => { if (modal.open) modal.close(); };
  modal.querySelector('[data-modal-close]').addEventListener('click', close);
  // A click on the dark area around the dialog closes it.
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  // Closing stops the frame (and its simulated audience).
  modal.addEventListener('close', () => { modalFrame.removeAttribute('src'); });
}

// --- links to one example --------------------------------------------------

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const row = id && document.getElementById(id);
  if (row && row.matches('details.ex')) {
    row.open = true;
    row.scrollIntoView({ block: 'start' });
  }
}
window.addEventListener('hashchange', openFromHash);
openFromHash();
