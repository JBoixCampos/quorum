// Escapes text for XML (the Office files). Characters XML 1.0 does not allow
// are dropped, or the file would not open.

export const esc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
