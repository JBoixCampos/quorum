// Writes a .pptx (Office Open XML) from slides read in the browser.
// No dependencies: a .pptx is a zip of XML files (see zip.js).
//
// Units: the stage is 1920 x 1080 px; the slide is 13.333 x 7.5 in
// (12192000 x 6858000 EMU), so one stage pixel is 6350 EMU and 0.5 pt.

import { esc } from './xml.js';
import { workbook } from './xlsx.js';
import { zip } from './zip.js';

const EMU = 6350;
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const emu = (v) => Math.round(v * EMU);
const hex = (c) => [c.r, c.g, c.b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('').toUpperCase();
const clr = (c) => (c.a !== undefined && c.a < 0.99
  ? `<a:srgbClr val="${hex(c)}"><a:alpha val="${Math.round(c.a * 100000)}"/></a:srgbClr>`
  : `<a:srgbClr val="${hex(c)}"/>`);
const solid = (c) => `<a:solidFill>${clr(c)}</a:solidFill>`;

// Fonts every Office install has, and a fallback for the ones Quorum bundles.
export const SAFE_FONTS = ['Arial', 'Arial Narrow', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Segoe UI', 'Segoe Print', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
export const FONT_FALLBACK = {
  Inter: 'Arial', Fraunces: 'Georgia', Newsreader: 'Georgia', Oswald: 'Arial Narrow', 'JetBrains Mono': 'Consolas', Caveat: 'Segoe Print', 'Space Grotesk': 'Arial',
};

// --- shapes ---------------------------------------------------------------

class SlideWriter {
  constructor(deck, slide, index) {
    this.deck = deck;
    this.slide = slide;
    this.index = index;
    this.nextId = 2;
    this.rels = [{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }];
    this.shapes = [];
    // spid per step, for the click animations.
    this.steps = new Map();
    this.links = new Map();
    this.media = [];
    this.charts = [];
  }

  rel(type, target, external = false) {
    const id = `rId${this.rels.length + 1}`;
    this.rels.push({ id, type, target, external });
    return id;
  }

  id() {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  track(item, id, kind) {
    if (item.step > 0) {
      if (!this.steps.has(item.step)) this.steps.set(item.step, []);
      this.steps.get(item.step).push({ id, kind });
    }
  }

  fontName(name) {
    const fixed = this.deck.safeFonts ? (FONT_FALLBACK[name] || name) : name;
    this.deck.fontsUsed.add(fixed);
    return fixed;
  }

  xfrm(item, tag = 'a:xfrm') {
    return `<${tag}><a:off x="${emu(item.x)}" y="${emu(item.y)}"/><a:ext cx="${emu(Math.max(item.w, 1))}" cy="${emu(Math.max(item.h, 1))}"/></${tag}>`;
  }

  fill(item) {
    if (item.gradient) {
      const stops = item.gradient.stops.map((s) => `<a:gs pos="${Math.round(s.pos * 1000)}">${clr(s.color)}</a:gs>`).join('');
      // CSS angles run clockwise from "up"; OOXML from "right".
      const ang = Math.round((((item.gradient.angle - 90) % 360) + 360) % 360 * 60000);
      return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`;
    }
    return item.fill ? solid(item.fill) : '<a:noFill/>';
  }

  box(item) {
    const id = this.id();
    const min = Math.min(item.w, item.h);
    let geom = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
    if (item.radius > 0.5) {
      if (item.radius >= min / 2 - 0.5 && Math.abs(item.w - item.h) < 2) geom = '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>';
      else geom = `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (item.radius / min) * 100000))}"/></a:avLst></a:prstGeom>`;
    }
    const line = item.line && item.line.color
      ? `<a:ln w="${emu(item.line.w)}">${solid(item.line.color)}</a:ln>` : '<a:ln><a:noFill/></a:ln>';
    const shadow = item.shadow
      ? '<a:effectLst><a:outerShdw blurRad="190500" dist="50800" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="22000"/></a:srgbClr></a:outerShdw></a:effectLst>' : '';
    this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(item.name || `Shape ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${this.xfrm(item)}${geom}${this.fill(item)}${line}${shadow}</p:spPr><p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`);
    this.track(item, id, 'box');
  }

  runXml(run) {
    const size = Math.max(100, Math.round(run.size * 50));
    let link = '';
    if (run.href && /^(https?:|mailto:)/i.test(run.href)) {
      if (!this.links.has(run.href)) this.links.set(run.href, this.rel('hyperlink', run.href, true));
      link = `<a:hlinkClick r:id="${this.links.get(run.href)}"/>`;
    }
    const font = this.fontName(run.font);
    const attrs = `lang="${esc(this.deck.lang)}" sz="${size}"${run.bold ? ' b="1"' : ''}${run.italic ? ' i="1"' : ''}${run.underline ? ' u="sng"' : ''}${run.strike ? ' strike="sngStrike"' : ''}${Math.abs(run.spacing) > 0.2 ? ` spc="${Math.round(run.spacing * 50)}"` : ''} dirty="0"`;
    const highlight = run.highlight ? `<a:highlight>${clr(run.highlight)}</a:highlight>` : '';
    return `<a:r><a:rPr ${attrs}>${solid(run.color)}${highlight}<a:latin typeface="${esc(font)}"/><a:cs typeface="${esc(font)}"/>${link}</a:rPr><a:t>${esc(run.text)}</a:t></a:r>`;
  }

  text(item) {
    const id = this.id();
    const first = item.paras.find((p) => p.length)[0];
    const lineH = Math.max(first.size * 1.05, item.lineHeight * first.size);
    const lines = Math.round(item.h / lineH);
    const oneLine = item.paras.length === 1 && lines <= 1;
    const markIndent = item.bullet ? first.size * 0.9 : 0;
    const x = item.x - markIndent;
    let w = item.w + markIndent;
    let dx = 0;
    if (!oneLine) {
      // PowerPoint wraps a little differently: leave some room.
      const extra = Math.max(10, w * 0.08);
      w += extra;
      if (item.align === 'ctr') dx = -extra / 2;
      else if (item.align === 'r') dx = -extra;
    }
    const box = { x: x + dx, y: item.y, w: oneLine ? w + Math.max(8, w * 0.03) : w, h: item.h };
    if (oneLine && item.align === 'ctr') box.x -= Math.max(8, w * 0.03) / 2;
    if (oneLine && item.align === 'r') box.x -= Math.max(8, w * 0.03);
    const paras = item.paras.map((runs, k) => {
      const ppr = [`algn="${item.align}"`];
      let inner = `<a:lnSpc><a:spcPts val="${Math.round(lineH * 50)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef>`;
      if (item.bullet) {
        const mar = emu(markIndent);
        ppr.push(`marL="${mar}"`, `indent="${-mar}"`);
        if (item.bullet.kind === 'num') {
          inner += `<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod" startAt="${item.bullet.startAt}"/>`;
        } else {
          inner += `<a:buFont typeface="Arial"/><a:buChar char="${esc(item.bullet.char)}"/>`;
        }
      } else {
        ppr.push('marL="0"', 'indent="0"');
        inner += '<a:buNone/>';
      }
      const end = runs.length ? runs[runs.length - 1] : first;
      const body = runs.map((r) => this.runXml(r)).join('');
      return `<a:p><a:pPr ${ppr.join(' ')}>${inner}</a:pPr>${body}<a:endParaRPr lang="${esc(this.deck.lang)}" sz="${Math.round(end.size * 50)}" dirty="0"/></a:p>`;
    }).join('');
    const name = item.name || `Text ${id}`;
    this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${this.xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="${oneLine ? 'none' : 'square'}" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`);
    this.track(item, id, 'text');
  }

  addMedia(data, ext) {
    const name = this.deck.addMedia(data, ext);
    return this.rel('image', `../media/${name}`);
  }

  picture(item, rid, svgRid = '', crop = null, geom = '') {
    const id = this.id();
    const blip = svgRid
      ? `<a:blip r:embed="${rid}"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svgRid}"/></a:ext></a:extLst></a:blip>`
      : `<a:blip r:embed="${rid}"/>`;
    const src = crop ? `<a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/>` : '';
    const shape = geom || '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
    const alt = item.alt ? ` descr="${esc(item.alt)}"` : '';
    this.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(item.alt ? `Picture: ${item.alt}`.slice(0, 60) : `Picture ${id}`)}"${alt}/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill>${blip}${src}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${this.xfrm(item)}${shape}</p:spPr></p:pic>`);
    this.track(item, id, 'pic');
  }

  image(item) {
    if (!item.data) return;
    const rid = this.addMedia(item.data, item.ext);
    let frame = { ...item };
    let crop = null;
    const { w: nw, h: nh } = item.natural;
    if (nw && nh && item.fit !== 'fill') {
      const scale = item.fit === 'contain' || item.fit === 'scale-down' ? Math.min(item.w / nw, item.h / nh) : Math.max(item.w / nw, item.h / nh);
      const shownW = nw * scale;
      const shownH = nh * scale;
      const [px, py] = (item.position || '50% 50%').split(' ').map((p) => (p.endsWith('%') ? Number.parseFloat(p) / 100 : 0.5));
      if (item.fit === 'contain' || item.fit === 'scale-down') {
        frame = { ...item, x: item.x + (item.w - shownW) * px, y: item.y + (item.h - shownH) * py, w: shownW, h: shownH };
      } else if (item.fit === 'cover') {
        const cutX = Math.max(0, 1 - item.w / shownW);
        const cutY = Math.max(0, 1 - item.h / shownH);
        crop = {
          l: Math.round(cutX * px * 100000), r: Math.round(cutX * (1 - px) * 100000),
          t: Math.round(cutY * py * 100000), b: Math.round(cutY * (1 - py) * 100000),
        };
      }
    }
    const min = Math.min(item.w, item.h);
    const geom = item.radius > 0.5
      ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (item.radius / min) * 100000))}"/></a:avLst></a:prstGeom>` : '';
    this.picture(frame, rid, '', crop, geom);
  }

  raster(item) {
    if (!item.data) return;
    const rid = this.addMedia(item.data, 'png');
    const svgRid = item.svg ? this.addMedia(item.svg, 'svg') : '';
    this.picture(item, rid, svgRid);
  }

  chart(item) {
    const n = this.deck.nextChart();
    const part = chartXml(item);
    this.deck.parts.push({ name: `ppt/charts/chart${n}.xml`, data: part, type: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml' });
    this.deck.parts.push({ name: `ppt/charts/_rels/chart${n}.xml.rels`, data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/package" Target="../embeddings/Microsoft_Excel_Sheet${n}.xlsx"/></Relationships>` });
    const percent = item.rows.every((r) => r.percent);
    this.deck.parts.push({ name: `ppt/embeddings/Microsoft_Excel_Sheet${n}.xlsx`, data: workbook(['', percent ? 'Share (%)' : 'Value'], item.rows.map((r) => [r.label, r.value])) });
    const rid = this.rel('chart', `../charts/chart${n}.xml`);
    const id = this.id();
    this.shapes.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart ${id}" descr="${esc(item.rows.map((r) => `${r.label}: ${r.text || r.value}`).join('; '))}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${this.xfrm(item, 'p:xfrm')}<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`);
    this.track(item, id, 'frame');
  }

  table(item) {
    const id = this.id();
    const grid = item.cols.map((w) => `<a:gridCol w="${emu(w)}"/>`).join('');
    const rows = item.rows.map((row) => {
      const cells = row.cells.map((cell) => {
        const first = cell.paras.find((p) => p.length);
        const paras = cell.paras.length ? cell.paras.map((runs) => `<a:p><a:pPr algn="${cell.align}"/>${runs.map((r) => this.runXml(r)).join('')}</a:p>`).join('') : '<a:p><a:endParaRPr lang="en-US"/></a:p>';
        const border = (tag, line) => (line && line.color ? `<a:${tag} w="${emu(line.w)}">${solid(line.color)}</a:${tag}>` : `<a:${tag} w="0"><a:noFill/></a:${tag}>`);
        const pad = `marL="${emu(cell.pad.l)}" marR="${emu(cell.pad.r)}" marT="${emu(cell.pad.t)}" marB="${emu(cell.pad.b)}"`;
        return `<a:tc${cell.span > 1 ? ` gridSpan="${cell.span}"` : ''}><a:txBody><a:bodyPr/><a:lstStyle/>${paras}</a:txBody><a:tcPr ${pad} anchor="ctr">${border('lnL')}${border('lnR')}${border('lnT')}${border('lnB', cell.line)}${cell.fill ? solid(cell.fill) : '<a:noFill/>'}</a:tcPr></a:tc>${'<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></a:txBody><a:tcPr/></a:tc>'.repeat(Math.max(0, cell.span - 1))}`;
      }).join('');
      return `<a:tr h="${emu(row.h)}">${cells}</a:tr>`;
    }).join('');
    this.shapes.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>${this.xfrm(item, 'p:xfrm')}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
    this.track(item, id, 'frame');
  }

  background() {
    const bg = this.slide.background;
    if (bg.image) {
      const rid = this.addMedia(bg.image.data, bg.image.ext);
      return `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`;
    }
    return `<p:bg><p:bgPr>${this.fill({ fill: bg.color, gradient: bg.gradient })}<a:effectLst/></p:bgPr></p:bg>`;
  }

  transition() {
    const kind = this.slide.transition;
    if (!kind || kind === 'none') return '';
    const inner = { fade: '<p:fade/>', slide: '<p:push dir="l"/>', zoom: '<p:zoom dir="in"/>', morph: '<p:fade/>' }[kind] || '<p:fade/>';
    if (kind === 'morph') {
      return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159"><p:transition spd="slow"><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="med">${inner}</p:transition></mc:Fallback></mc:AlternateContent>`;
    }
    return `<p:transition spd="med">${inner}</p:transition>`;
  }

  // One click per step: the shapes of that step appear (fade in).
  timing() {
    if (!this.steps.size) return '';
    let n = 2;
    const next = () => { n += 1; return n; };
    const clicks = [...this.steps.keys()].sort((a, b) => a - b).map((step) => {
      const effects = this.steps.get(step).map((s, k) => {
        const a = next();
        const b = next();
        const c = next();
        return `<p:par><p:cTn id="${a}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold"${s.kind === 'pic' || s.kind === 'frame' ? '' : ' grpId="0"'} nodeType="${k === 0 ? 'clickEffect' : 'withEffect'}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${s.id}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${c}" dur="500"/><p:tgtEl><p:spTgt spid="${s.id}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
      }).join('');
      const outer = next();
      const inner = next();
      return `<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
    }).join('');
    const bld = [...this.steps.values()].flat().filter((s) => s.kind === 'text' || s.kind === 'box')
      .map((s) => `<p:bldP spid="${s.id}" grpId="0"${s.kind === 'box' ? ' animBg="1"' : ''}/>`).join('');
    return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clicks}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${bld ? `<p:bldLst>${bld}</p:bldLst>` : ''}</p:timing>`;
  }

  xml() {
    this.slide.items.forEach((item) => {
      if (item.type === 'box') this.box(item);
      else if (item.type === 'text') this.text(item);
      else if (item.type === 'image') this.image(item);
      else if (item.type === 'raster') this.raster(item);
      else if (item.type === 'chart') this.chart(item);
      else if (item.type === 'table') this.table(item);
    });
    const bg = this.background();
    const transition = this.transition();
    const timing = this.timing();
    if (this.slide.notes) this.notesRel = this.rel('notesSlide', `../notesSlides/notesSlide${this.index + 1}.xml`);
    return `${HEAD}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${this.shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transition}${timing}</p:sld>`;
  }
}

// --- charts ----------------------------------------------------------------

function txPr(font, size, color) {
  return `<c:txPr><a:bodyPr wrap="none" anchor="ctr"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round(size * 50)}" b="0">${solid(color)}<a:latin typeface="${esc(font)}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
}

function chartXml(item) {
  const rows = item.rows;
  const n = rows.length;
  const percent = rows.every((r) => r.percent);
  const unit = item.unit ? esc(item.unit.replace(/"/g, '')) : '';
  const fmt = percent ? '0&quot;%&quot;' : (unit ? `General&quot; ${unit}&quot;` : 'General');
  const color = item.color || { r: 40, g: 40, b: 40 };
  const text = txPr(item.font, Math.max(16, item.size * 0.8), color);
  const cat = `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${n + 1}</c:f><c:strCache><c:ptCount val="${n}"/>${rows.map((r, i) => `<c:pt idx="${i}"><c:v>${esc(r.label)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>Sheet1!$B$2:$B$${n + 1}</c:f><c:numCache><c:formatCode>${fmt}</c:formatCode><c:ptCount val="${n}"/>${rows.map((r, i) => `<c:pt idx="${i}"><c:v>${r.value}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>`;
  const tx = `<c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${percent ? 'Share (%)' : 'Value'}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
  const fallback = { r: 90, g: 90, b: 200 };
  const point = (r, i) => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${solid(r.color || fallback)}<a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`;
  const labels = (position) => `<c:dLbls><c:numFmt formatCode="${fmt}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${text}${position ? `<c:dLblPos val="${position}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const horizontal = item.chart === 'bars';
  const axes = (catPos, valPos, reverse) => `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="${reverse ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${text}<c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="1"/><c:axPos val="${valPos}"/><c:numFmt formatCode="${fmt}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  let plot;
  let legend = '';
  if (item.chart === 'donut') {
    plot = `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx}${rows.map((r, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${solid(r.color || fallback)}<a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`).join('')}${labels('')}${cat}${val}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="62"/></c:doughnutChart>`;
    legend = `<c:legend><c:legendPos val="r"/><c:overlay val="0"/>${text}</c:legend>`;
  } else if (item.chart === 'line') {
    const c0 = rows[0].color || fallback;
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx}<c:spPr><a:ln w="44450" cap="rnd">${solid(c0)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="9"/><c:spPr>${solid(c0)}<a:ln><a:noFill/></a:ln></c:spPr></c:marker>${labels('t')}${cat}${val}<c:smooth val="0"/></c:ser><c:marker val="1"/><c:axId val="111"/><c:axId val="222"/></c:lineChart>${axes('b', 'l', false)}`;
  } else {
    const c0 = rows[0].color || fallback;
    plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/>${tx}<c:spPr>${solid(c0)}</c:spPr><c:invertIfNegative val="0"/>${rows.map(point).join('')}${labels('outEnd')}${cat}${val}</c:ser><c:gapWidth val="55"/><c:axId val="111"/><c:axId val="222"/></c:barChart>${horizontal ? axes('l', 't', true) : axes('b', 'l', false)}`;
  }
  const layout = horizontal && item.chart === 'bars'
    ? `<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="${(item.labelWidth || 0.2).toFixed(3)}"/><c:y val="0.02"/><c:w val="${(0.9 - (item.labelWidth || 0.2)).toFixed(3)}"/><c:h val="0.96"/></c:manualLayout></c:layout>` : '<c:layout/>';
  return `${HEAD}<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea>${layout}${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${text}<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}

// --- the package -----------------------------------------------------------

function theme(deck, name) {
  const c = deck.colors;
  const pick = (v, d) => v || d;
  const fg = pick(c.fg, { r: 20, g: 20, b: 20 });
  const bg = pick(c.bg, { r: 255, g: 255, b: 255 });
  const accent = pick(c.accent, { r: 70, g: 90, b: 200 });
  const series = (c.series || []).map((s, i) => s || [accent, c.primary, c.secondary, accent, accent, accent][i] || accent);
  const slot = (tag, color) => `<a:${tag}>${clr({ ...color, a: 1 })}</a:${tag}>`;
  const major = deck.safeFonts ? (FONT_FALLBACK[deck.fonts.title] || deck.fonts.title) : deck.fonts.title;
  const minor = deck.safeFonts ? (FONT_FALLBACK[deck.fonts.body] || deck.fonts.body) : deck.fonts.body;
  const line = (w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>`;
  return `${HEAD}<a:theme xmlns:a="${NS_A}" name="${esc(name)}"><a:themeElements><a:clrScheme name="Quorum">${slot('dk1', fg)}${slot('lt1', bg)}${slot('dk2', pick(c.primary, fg))}${slot('lt2', pick(c.secondary, bg))}${slot('accent1', accent)}${slot('accent2', series[1])}${slot('accent3', series[2])}${slot('accent4', series[3])}${slot('accent5', series[4])}${slot('accent6', series[5])}${slot('hlink', accent)}${slot('folHlink', accent)}</a:clrScheme><a:fontScheme name="Quorum"><a:majorFont><a:latin typeface="${esc(major)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(minor)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Quorum"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

function level(n, size, fontRef) {
  return `<a:lvl${n}pPr marL="${(n - 1) * 457200}" indent="0" algn="l"><a:buNone/><a:defRPr sz="${size}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="${fontRef}"/></a:defRPr></a:lvl${n}pPr>`;
}

function master(deck) {
  const bg = deck.colors.bg ? { ...deck.colors.bg, a: 1 } : { r: 255, g: 255, b: 255 };
  const styles = (font) => [1, 2, 3, 4, 5].map((n) => level(n, 2400, font)).join('');
  return `${HEAD}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgPr>${solid(bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld>${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${level(1, 4400, '+mj-lt')}</p:titleStyle><p:bodyStyle>${styles('+mn-lt')}</p:bodyStyle><p:otherStyle>${styles('+mn-lt')}</p:otherStyle></p:txStyles></p:sldMaster>`;
}

const LAYOUT = `${HEAD}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const NOTES_MASTER = `${HEAD}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>${CLR_MAP}<p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;

function notesSlide(text) {
  const paras = String(text).split(/\n{2,}|\n/).filter((p) => p.trim()).map((p) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(p)}</a:t></a:r></a:p>`).join('');
  return `${HEAD}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${GROUP}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

const relsXml = (list) => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((r) => `<Relationship Id="${r.id}" Type="${r.type.startsWith('http') ? r.type : `${REL}/${r.type}`}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;

// deck: {
//   title, author, lang, colors, fonts, safeFonts,
//   slides: [{ items, background: { color, gradient, image }, notes, transition }]
// }
export function buildPptx(input) {
  const deck = {
    ...input,
    lang: input.lang || 'en-US',
    fontsUsed: new Set(),
    parts: [],
    media: [],
    charts: 0,
    addMedia(data, ext) {
      const name = `image${this.media.length + 1}.${ext}`;
      this.media.push({ name: `ppt/media/${name}`, data });
      return name;
    },
    nextChart() {
      this.charts += 1;
      return this.charts;
    },
  };
  const slides = deck.slides.map((slide, i) => {
    const writer = new SlideWriter(deck, slide, i);
    const xml = writer.xml();
    return { writer, xml };
  });
  const count = slides.length;
  const files = [];
  const overrides = [];
  const add = (name, data, type) => {
    files.push({ name, data });
    if (type) overrides.push({ name: `/${name}`, type });
  };
  const P = 'application/vnd.openxmlformats-officedocument.presentationml';

  add('_rels/.rels', relsXml([
    { id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' },
    { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
    { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml' },
  ]));
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  add('docProps/core.xml', `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(deck.title || 'Talk')}</dc:title><dc:creator>${esc(deck.author || 'Quorum')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`, 'application/vnd.openxmlformats-package.core-properties+xml');
  add('docProps/app.xml', `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Quorum</Application><Slides>${count}</Slides></Properties>`, 'application/vnd.openxmlformats-officedocument.extended-properties+xml');

  const presRels = [{ id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' }];
  slides.forEach((s, i) => presRels.push({ id: `rId${i + 2}`, type: 'slide', target: `slides/slide${i + 1}.xml` }));
  const notesMasterRel = `rId${count + 2}`;
  presRels.push({ id: notesMasterRel, type: 'notesMaster', target: 'notesMasters/notesMaster1.xml' });
  presRels.push({ id: `rId${count + 3}`, type: 'theme', target: 'theme/theme1.xml' });
  add('ppt/presentation.xml', `${HEAD}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRel}"/></p:notesMasterIdLst><p:sldIdLst>${slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>`, `${P}.presentation.main+xml`);
  add('ppt/_rels/presentation.xml.rels', relsXml(presRels));
  add('ppt/slideMasters/slideMaster1.xml', master(deck), `${P}.slideMaster+xml`);
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', relsXml([
    { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
    { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' },
  ]));
  add('ppt/slideLayouts/slideLayout1.xml', LAYOUT, `${P}.slideLayout+xml`);
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relsXml([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]));
  add('ppt/theme/theme1.xml', theme(deck, deck.title || 'Quorum'), 'application/vnd.openxmlformats-officedocument.theme+xml');
  add('ppt/theme/theme2.xml', theme(deck, 'Notes'), 'application/vnd.openxmlformats-officedocument.theme+xml');
  add('ppt/notesMasters/notesMaster1.xml', NOTES_MASTER, `${P}.notesMaster+xml`);
  add('ppt/notesMasters/_rels/notesMaster1.xml.rels', relsXml([{ id: 'rId1', type: 'theme', target: '../theme/theme2.xml' }]));

  slides.forEach(({ writer, xml }, i) => {
    add(`ppt/slides/slide${i + 1}.xml`, xml, `${P}.slide+xml`);
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, relsXml(writer.rels));
    if (writer.slide.notes) {
      add(`ppt/notesSlides/notesSlide${i + 1}.xml`, notesSlide(writer.slide.notes), `${P}.notesSlide+xml`);
      add(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, relsXml([
        { id: 'rId1', type: 'notesMaster', target: '../notesMasters/notesMaster1.xml' },
        { id: 'rId2', type: 'slide', target: `../slides/slide${i + 1}.xml` },
      ]));
    }
  });
  deck.parts.forEach((p) => add(p.name, p.data, p.type));
  deck.media.forEach((m) => add(m.name, m.data));

  const defaults = { rels: 'application/vnd.openxmlformats-package.relationships+xml', xml: 'application/xml', png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  const types = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${Object.entries(defaults).map(([e, t]) => `<Default Extension="${e}" ContentType="${t}"/>`).join('')}${overrides.map((o) => `<Override PartName="${o.name}" ContentType="${o.type}"/>`).join('')}</Types>`;
  return {
    buffer: zip([{ name: '[Content_Types].xml', data: types }, ...files]),
    fonts: [...deck.fontsUsed].sort(),
    charts: deck.charts,
  };
}
