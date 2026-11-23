// Updates the DOM in place instead of replacing it, so a button is not
// recreated while someone is tapping it (and the vote is not lost).
export function morph(target, html) {
  const next = document.createElement(target.tagName);
  next.innerHTML = html;
  morphChildren(target, next);
}

function morphChildren(a, b) {
  const old = [...a.childNodes];
  const fresh = [...b.childNodes];
  if (old.length !== fresh.length || old.some((n, i) => n.nodeName !== fresh[i].nodeName)) {
    a.replaceChildren(...fresh);
    return;
  }
  old.forEach((n, i) => {
    const m = fresh[i];
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.textContent !== m.textContent) n.textContent = m.textContent;
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    [...n.attributes].forEach((at) => { if (!m.hasAttribute(at.name)) n.removeAttribute(at.name); });
    [...m.attributes].forEach((at) => {
      if (n.getAttribute(at.name) !== at.value) n.setAttribute(at.name, at.value);
    });
    if ('disabled' in n) n.disabled = m.hasAttribute('disabled');
    morphChildren(n, m);
  });
}
