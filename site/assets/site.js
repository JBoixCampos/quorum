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
