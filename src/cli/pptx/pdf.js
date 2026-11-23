// A PDF with one page per slide, each a picture of the slide (JPEG). No
// dependencies: the JPEG data goes into the file as it is.

const jpegSize = (data) => {
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) { i += 1; continue; }
    const marker = data[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { h: data.readUInt16BE(i + 5), w: data.readUInt16BE(i + 7) };
    i += 2 + data.readUInt16BE(i + 2);
  }
  throw new Error('Not a JPEG picture.');
};

// pages: [Buffer (JPEG)]; the page is 13.333 x 7.5 in (960 x 540 pt).
export function pdfFromJpegs(pages, title = '') {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const tree = add(null);
  const kids = [];
  pages.forEach((jpeg, i) => {
    const { w, h } = jpegSize(jpeg);
    const image = add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      Buffer.from('\nendstream'),
    ]));
    const content = `q 960 0 0 540 0 0 cm /Im${i} Do Q`;
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 960 540] /Resources << /XObject << /Im${i} ${image} 0 R >> >> /Contents ${stream} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] >>`;
  const info = add(`<< /Title (${String(title).replace(/[()\\]/g, '').replace(/[^\x20-\x7e]/g, '?')}) /Producer (Quorum) >>`);
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(body) ? body : Buffer.from(body), Buffer.from('\nendobj\n')]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}
