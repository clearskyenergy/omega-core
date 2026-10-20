/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-sheets.js — permit plan set.
 *
 * One model, three sizes (ANSI D, ARCH D, 11×17), PDF and DXF.
 * The single-line sheet is the same diagram as the single-line export.
 * Drawing units on the sheet are inches. The site plan states its scale.
 */
(function (root) {
  'use strict';

  var G = root.OmegaEditorV2Geom || require('./omega-editor-v2-geom.js');
  var D = root.OmegaEditorV2Doc || require('./omega-editor-v2-doc.js');
  var E = root.OmegaEditorV2Electrical || require('./omega-editor-v2-electrical.js');
  var SLD = root.OmegaEditorV2Sld || require('./omega-editor-v2-sld.js');

  var SIZES = {
    'ansi-d': { id: 'ansi-d', name: 'ANSI D', w: 34, h: 22 },
    'arch-d': { id: 'arch-d', name: 'ARCH D', w: 36, h: 24 },
    tabloid: { id: 'tabloid', name: '11×17', w: 17, h: 11 }
  };
  var SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 200, 300, 400, 500, 800, 1000];
  var INK = [0.09, 0.16, 0.25];
  var MUTED = [0.30, 0.38, 0.46];
  var HAIR = [0.55, 0.62, 0.70];
  var NAVY = [0.12, 0.31, 0.47];

  function customerName(doc) {
    return (doc.assignment && doc.assignment.customerName) || '';
  }

  function wrap(text, widthIn, pt) {
    var max = Math.max(8, Math.floor(widthIn / ((pt / 72) * 0.52)));
    var words = String(text == null ? '' : text).split(/\s+/), lines = [], cur = '', i, next;
    for (i = 0; i < words.length; i++) {
      if (!words[i]) continue;
      next = cur ? cur + ' ' + words[i] : words[i];
      if (next.length > max && cur) { lines.push(cur); cur = words[i]; }
      else cur = next;
    }
    if (cur) lines.push(cur);
    if (!lines.length) lines.push('');
    return lines;
  }

  function lineH(pt) { return (pt / 72) * 1.28; }

  function Paper(size) {
    this.w = size.w;
    this.h = size.h;
    this.ops = [];
    this.number = '';
    this.title = '';
  }
  Paper.prototype.line = function (x1, y1, x2, y2, sw, rgb, dash) {
    this.ops.push({ t: 'l', x1: x1, y1: y1, x2: x2, y2: y2, sw: sw || 0.6, rgb: rgb || INK, dash: !!dash });
  };
  Paper.prototype.rect = function (x, y, w, h, sw, rgb, fill) {
    this.ops.push({ t: 'r', x: x, y: y, w: w, h: h, sw: sw || 0.6, rgb: rgb || INK, fill: fill || null });
  };
  Paper.prototype.circle = function (x, y, r, sw, rgb) {
    this.ops.push({ t: 'c', x: x, y: y, r: r, sw: sw || 0.6, rgb: rgb || INK });
  };
  /* Helvetica in the PDF has no em dash, degree sign, or phi. Map the
     ones this set uses so a sheet never prints a question mark. */
  function latin(s) {
    return String(s == null ? '' : s)
      .replace(/\u2014/g, '-')
      .replace(/\u2013/g, '-')
      .replace(/\u00b7/g, '|')
      .replace(/\u00d7/g, 'x')
      .replace(/\u00b0/g, ' deg ')
      .replace(/\u03a6/g, '-ph');
  }

  Paper.prototype.text = function (x, y, size, text, anchor, rgb) {
    this.ops.push({ t: 'tx', x: x, y: y, size: size, text: latin(text), anchor: anchor || 'start', rgb: rgb || INK });
  };
  Paper.prototype.image = function (x, y, w, h, img) {
    if (!img || !img.jpeg) return;
    this.ops.push({
      t: 'img', x: x, y: y, w: w, h: h,
      b64: img.jpeg, pxW: img.width || 1, pxH: img.height || 1
    });
  };

  function frame(paper, meta) {
    var m = 0.38;
    paper.rect(m, m, paper.w - m * 2, paper.h - m * 2, 1.1, INK);
    var top = paper.h - m - 1.22;
    paper.line(m, top, paper.w - m, top, 1.0, INK);
    var stampW = 1.7;
    var stampX = paper.w - m - stampW;
    paper.line(stampX, top, stampX, paper.h - m, 0.7, INK);
    var mid = m + (stampX - m) * 0.46;
    var mid2 = m + (stampX - m) * 0.78;
    paper.line(mid, top, mid, paper.h - m, 0.5, HAIR);
    paper.line(mid2, top, mid2, paper.h - m, 0.5, HAIR);
    paper.text(m + 0.08, top + 0.16, 8, meta.project || 'Untitled site', 'start', NAVY);
    paper.text(m + 0.08, top + 0.32, 7, meta.address || 'Address not on the project', 'start', MUTED);
    paper.text(m + 0.08, top + 0.48, 7, 'Customer: ' + (meta.customer || 'Not named'), 'start', INK);
    paper.text(m + 0.08, top + 0.66, 6.5, meta.status, 'start', meta.ready ? MUTED : [0.62, 0.18, 0.18]);
    paper.text(m + 0.08, top + 0.84, 6.5, 'OMEGA Site Plan  ·  Not a sealed drawing', 'start', MUTED);
    paper.text(mid + 0.08, top + 0.2, 9, meta.title, 'start', INK);
    paper.text(mid + 0.08, top + 0.4, 7, meta.sizeName, 'start', MUTED);
    paper.text(mid2 + 0.08, top + 0.16, 8, meta.number, 'start', NAVY);
    paper.text(mid2 + 0.08, top + 0.34, 7, 'Rev ' + (meta.rev || '0'), 'start', INK);
    paper.text(mid2 + 0.08, top + 0.5, 6.5, meta.date, 'start', MUTED);
    paper.text(mid2 + 0.08, top + 0.66, 6.5, 'Issued for review', 'start', MUTED);
    paper.text(stampX + 0.08, top + 0.14, 6, 'ENGINEER OF RECORD', 'start', NAVY);
    paper.rect(stampX + 0.12, top + 0.28, 0.7, 0.7, 0.6, HAIR);
    paper.text(stampX + 0.47, top + 0.68, 6, 'SEAL', 'middle', HAIR);
    paper.text(stampX + 0.9, top + 0.48, 6, 'Signature', 'start', MUTED);
    paper.line(stampX + 0.9, top + 0.62, stampX + stampW - 0.08, top + 0.62, 0.4, HAIR);
    paper.text(stampX + 0.9, top + 0.78, 6, 'Date', 'start', MUTED);
    paper.line(stampX + 0.9, top + 0.92, stampX + stampW - 0.08, top + 0.92, 0.4, HAIR);
    return { x: m + 0.12, y: m + 0.12, w: paper.w - m * 2 - 0.24, h: top - m - 0.22 };
  }

  function measureItem(item, width) {
    var pt, lines;
    if (item.type === 'h') return lineH(11) + 0.06;
    if (item.type === 'p' || item.type === 'note') {
      pt = item.type === 'note' ? 7.5 : 8;
      lines = wrap(item.text, width, pt);
      return lines.length * lineH(pt) + 0.06;
    }
    if (item.type === 'gap') return item.h == null ? 0.12 : item.h;
    if (item.type === 'vicinity') return 2.35;
    if (item.type === 'table') return 0.28 + Math.max(1, item.rows.length) * 0.22 + 0.08;
    if (item.type === 'faces') return 0.22 + Math.max(1, (item.faces || []).length) * 1.85;
    return 0.2;
  }

  function drawParagraph(paper, x, y, width, text, pt, rgb, maxH) {
    var lines = wrap(text, width, pt), lh = lineH(pt), i, used = 0, rest = [];
    for (i = 0; i < lines.length; i++) {
      if (maxH != null && (used + 1) * lh > maxH && used > 0) { rest = lines.slice(i); break; }
      paper.text(x, y + used * lh + pt / 72, pt, lines[i], 'start', rgb || INK);
      used++;
    }
    return { y: y + used * lh, rest: rest.length ? rest.join(' ') : '' };
  }

  function drawTable(paper, x, y, width, maxH, item) {
    var cols = item.columns, rows = item.rows, i, j, cx, lh = 0.22;
    var head = 0.26;
    if (y + head + lh > y + maxH) return { y: y, rest: item };
    paper.text(x, y + 0.12, 8, item.title || '', 'start', NAVY);
    y += 0.18;
    var widths = [], sum = 0;
    for (i = 0; i < cols.length; i++) { widths.push(cols[i].w || 1); sum += widths[i]; }
    for (i = 0; i < widths.length; i++) widths[i] = widths[i] / sum * width;
    function rowLine(ry, cells, pt, rgb, fill) {
      if (fill) paper.rect(x, ry, width, lh, 0, null, fill);
      paper.line(x, ry + lh, x + width, ry + lh, 0.3, HAIR);
      cx = x;
      for (j = 0; j < cells.length; j++) {
        paper.text(cx + 0.04, ry + 0.15, pt, cells[j] == null ? '' : String(cells[j]), 'start', rgb);
        cx += widths[j];
      }
    }
    var heads = [];
    for (i = 0; i < cols.length; i++) heads.push(cols[i].label);
    rowLine(y, heads, 6.5, NAVY, [0.90, 0.93, 0.96]);
    y += lh;
    var kept = 0;
    for (i = 0; i < rows.length; i++) {
      if (y + lh > y + (maxH - (y - (y))) ) {
        /* compared against the bottom passed in via maxH as a height budget */
      }
      if (kept > 0 && (head + (kept + 2) * lh) > maxH) break;
      rowLine(y, rows[i], 6.5, INK, null);
      y += lh;
      kept++;
    }
    if (kept < rows.length) {
      return { y: y, rest: { type: 'table', title: (item.title || '') + ' (continued)', columns: cols, rows: rows.slice(kept) } };
    }
    return { y: y + 0.06, rest: null };
  }

  function flow(paper, box, items) {
    var y = box.y, i, item, bottom = box.y + box.h, drew = false, part, h;
    for (i = 0; i < items.length; i++) {
      item = items[i];
      h = measureItem(item, box.w);
      if (y + Math.min(h, 0.4) > bottom && drew) return items.slice(i);
      if (item.type === 'h') {
        paper.text(box.x, y + 0.14, 11, item.text, 'start', NAVY);
        y += lineH(11) + 0.04;
      } else if (item.type === 'gap') {
        y += item.h == null ? 0.12 : item.h;
      } else if (item.type === 'p' || item.type === 'note') {
        var pt = item.type === 'note' ? 7.5 : 8;
        part = drawParagraph(paper, box.x, y, box.w, item.text, pt, item.type === 'note' ? MUTED : INK, bottom - y);
        y = part.y + 0.05;
        if (part.rest) return [{ type: item.type, text: part.rest }].concat(items.slice(i + 1));
      } else if (item.type === 'vicinity') {
        if (y + 2.3 > bottom && drew) return items.slice(i);
        drawVicinity(paper, box.x, y, 3.4, 2.15, item.doc);
        paper.text(box.x + 3.55, y + 0.16, 8, 'Vicinity — not to scale', 'start', NAVY);
        paper.text(box.x + 3.55, y + 0.36, 7, 'North is up. The scaled plan is sheet C-001.', 'start', MUTED);
        y += 2.3;
      } else if (item.type === 'table') {
        var budget = bottom - y;
        if (budget < 0.7 && drew) return items.slice(i);
        var left = drawTable(paper, box.x, y, box.w, budget, item);
        y = left.y;
        if (left.rest) return [left.rest].concat(items.slice(i + 1));
      } else if (item.type === 'faces') {
        var faceH = 1.85;
        var room = bottom - y;
        if (room < faceH && drew) return items.slice(i);
        var fit = Math.max(1, Math.floor(room / faceH));
        var batch = (item.faces || []).slice(0, fit);
        var restFaces = (item.faces || []).slice(fit);
        y = drawFaces(paper, box.x, y, box.w, batch);
        if (restFaces.length) return [{ type: 'faces', faces: restFaces }].concat(items.slice(i + 1));
      }
      drew = true;
      if (y > bottom) return items.slice(i + 1);
    }
    return [];
  }

  function drawVicinity(paper, x, y, w, h, doc) {
    paper.rect(x, y, w, h, 0.6, HAIR);
    var b = boundsOfDoc(doc);
    if (!isFinite(b.minX)) {
      paper.text(x + 0.1, y + 0.3, 7, 'No site geometry yet', 'start', MUTED);
      return;
    }
    var sc = Math.min((w - 0.3) / (b.maxX - b.minX || 1), (h - 0.3) / (b.maxY - b.minY || 1));
    function X(px) { return x + 0.15 + (px - b.minX) * sc; }
    function Y(py) { return y + h - 0.15 - (py - b.minY) * sc; }
    strokeDoc(paper, doc, X, Y, true);
    paper.text(x + w - 0.2, y + 0.16, 7, 'N', 'middle', NAVY);
    paper.line(x + w - 0.2, y + 0.22, x + w - 0.2, y + 0.55, 0.8, NAVY);
  }

  function boundsOfDoc(doc) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, e, b;
    var list = (doc && doc.entities) || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type === 'text' || e.type === 'callout') continue;
      b = G.boundsOf(e);
      if (!isFinite(b.minX)) continue;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function strokeDoc(paper, doc, X, Y, skipText) {
    var i, e, pts, k, ring, lay;
    var list = doc.entities || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type === 'line' || e.type === 'dim') {
        if (e.a && e.b) paper.line(X(e.a.x), Y(e.a.y), X(e.b.x), Y(e.b.y), 0.6, INK);
      } else if (e.type === 'rect' || e.type === 'equip' || e.type === 'parking') {
        ring = G.rectCorners(e);
        poly(paper, ring, X, Y, true, 0.7, INK);
      } else if (e.type === 'circle' && e.r > 0) {
        paper.circle(X(e.x), Y(e.y), Math.abs(X(e.x + e.r) - X(e.x)), 0.6, INK);
      } else if (e.pts && e.pts.length > 1 && e.type !== 'array') {
        var closed = !!(e.closed || e.type === 'polygon' || e.type === 'obstruction' || e.type === 'setback');
        poly(paper, e.pts, X, Y, closed, e.type === 'conduit' ? 0.9 : 0.7, e.type === 'conduit' ? [0.35, 0.2, 0.55] : INK, e.type === 'setback');
      } else if (e.type === 'array') {
        var host = D.find(doc, e.boundaryId) || e;
        ring = G.ringOf(host);
        if (ring) poly(paper, ring, X, Y, true, 0.8, [0.11, 0.31, 0.6]);
        lay = D.arrayLayout(doc, e);
        if (lay && lay.ok && lay.tables && lay.tables.length <= 400) {
          for (k = 0; k < lay.tables.length; k++) {
            var t = lay.tables[k];
            poly(paper, [
              { x: t.x, y: t.y }, { x: t.x + t.w, y: t.y },
              { x: t.x + t.w, y: t.y + t.h }, { x: t.x, y: t.y + t.h }
            ], X, Y, true, 0.25, [0.11, 0.31, 0.6]);
          }
        }
      }
    }
  }

  function poly(paper, pts, X, Y, closed, sw, rgb, dash) {
    var i;
    for (i = 1; i < pts.length; i++) paper.line(X(pts[i - 1].x), Y(pts[i - 1].y), X(pts[i].x), Y(pts[i].y), sw, rgb, dash);
    if (closed && pts.length > 2) paper.line(X(pts[pts.length - 1].x), Y(pts[pts.length - 1].y), X(pts[0].x), Y(pts[0].y), sw, rgb, dash);
  }

  function metaOf(doc, model, date, size) {
    return {
      project: doc.name || 'Untitled site',
      address: doc.address || '',
      customer: customerName(doc),
      date: date,
      ready: model.ready,
      status: model.ready ? 'Issued for review. Not sealed.' : 'NOT FOR PERMIT — see the checks sheet.',
      sizeName: size.name,
      rev: model.assumptions.revNote || '0',
      jobNo: model.assumptions.jobNo || '',
      apn: model.assumptions.apn || '',
      designedBy: model.assumptions.designedBy || '',
      checkedBy: model.assumptions.checkedBy || ''
    };
  }

  function addFlow(pages, size, base, number, title, items) {
    var rest = items, part = 1, guard = 0, paper, box, meta;
    while (rest.length && guard < 12) {
      paper = new Paper(size);
      meta = {
        project: base.project, address: base.address, customer: base.customer, date: base.date,
        ready: base.ready, status: base.status, sizeName: base.sizeName,
        rev: base.rev, jobNo: base.jobNo, apn: base.apn, designedBy: base.designedBy, checkedBy: base.checkedBy,
        number: number + (part > 1 ? ' (' + part + ')' : ''),
        title: title
      };
      paper.number = meta.number;
      paper.title = title;
      box = frame(paper, meta);
      rest = flow(paper, box, rest);
      pages.push(paper);
      part++;
      guard++;
    }
  }

  function dedicated(size, base, number, title, draw) {
    var paper = new Paper(size);
    var meta = {
      project: base.project, address: base.address, customer: base.customer, date: base.date,
      ready: base.ready, status: base.status, sizeName: base.sizeName,
      rev: base.rev, jobNo: base.jobNo, apn: base.apn, designedBy: base.designedBy, checkedBy: base.checkedBy,
      number: number, title: title
    };
    paper.number = number;
    paper.title = title;
    var box = frame(paper, meta);
    draw(paper, box);
    return paper;
  }

  function trenchLine(model) {
    var list = model.trenches || [], i, ft = 0;
    if (!list.length) return 'No trench corridor is drawn. Conduit length above is the run on the drawing, not a trench quantity.';
    for (i = 0; i < list.length; i++) ft += list[i].lengthFt || 0;
    return 'Trench: ' + list.length + ' corridor' + (list.length === 1 ? '' : 's') + ', ' + (Math.round(ft * 10) / 10) + ' ft. Shared corridors are counted once.';
  }

  function scopeLine(kind, model) {
    if (kind === 'bess') return 'The project is to install a new Battery Energy Storage System (BESS) and associated electrical equipment. It interconnects with the serving utility. All construction follows the codes the AHJ has adopted.';
    if (kind === 'dcfc') return 'The project is to install DC fast chargers and the distribution that serves them.';
    if (kind === 'l2') return 'The project is to install Level 2 chargers on the service shown.';
    if (kind === 'pv' || kind === 'der') return 'The project is to install a photovoltaic array and the equipment that connects it.';
    if (kind === 'compute') return 'The project is to install a compute load and the equipment that serves it.';
    if (model.equipment.some(function (e) { return e.key === 'bess'; })) return 'The project is to install a new Battery Energy Storage System (BESS) and associated electrical equipment.';
    return 'The project is the equipment drawn on the site plan.';
  }

  function signFaces(doc, model) {
    var rows = [];
    var bess = false, pv = false, ev = false, compute = false, i;
    for (i = 0; i < model.equipment.length; i++) {
      if (model.equipment[i].key === 'bess') bess = true;
      if (model.equipment[i].key === 'charger') ev = true;
      if (model.equipment[i].key === 'compute' || model.equipment[i].key === 'load') compute = true;
    }
    if (model.arrays.length) pv = true;
    if (bess) {
      rows.push(['EMERGENCY SHUTOFF', 'NEC 2023 706.15; IFC 1207.6', 'Emergency power off for the energy storage system. The drawing does not locate the button.']);
      rows.push(['ESS NAMEPLATE', 'NEC 2023 706.16(A)', 'Energy storage system nameplate: maximum voltage and current, energy and power, from the equipment schedule.']);
      rows.push(['NO SMOKING', 'IFC 1207.11', 'No smoking, no open flame, no ignition sources at the battery.']);
    }
    if (pv) {
      rows.push(['PV SYSTEM DISCONNECT', 'NEC 2023 690.13', 'Photovoltaic system AC disconnect, at the location 690.13 requires.']);
      rows.push(['PV DC NAMEPLATE', 'NEC 2023 690.53', 'Maximum voltage and maximum circuit current. Blank until Voc and Isc are on the array.']);
    }
    if (ev) {
      rows.push(['EVSE NAMEPLATE', 'NEC 2023 625.15', 'Electric vehicle supply equipment: voltage, amperes and kW from the schedule.']);
      rows.push(['EV DISCONNECT', 'NEC 2023 625.43', 'Warning: disconnect before servicing.']);
    }
    if (compute) {
      rows.push(['ARC FLASH', 'NEC 2023 110.16', 'Arc-flash warning. Incident energy is not calculated.']);
    }
    if (!rows.length) rows.push(['—', '', 'No sign face is added until the drawing has equipment that requires one.']);
    return rows;
  }

  function coverItems(doc, model) {
    var a = model.assumptions;
    var items = [
      { type: 'h', text: 'Project' },
      { type: 'p', text: (doc.name || 'Untitled site') + (doc.address ? ' — ' + doc.address : ' — address not on the project') + '.' },
      { type: 'p', text: 'Customer: ' + (customerName(doc) || 'not named') + '. Sheets are filled from the project record and from the drawing. Blank fields were not on the drawing.' },
      { type: 'h', text: 'Site information' },
      { type: 'p', text: 'APN: ' + (a.apn || 'not on the project') + '. Serving utility: ' + (a.utility || 'not on the project') + '. System voltage: ' + a.voltage + ' V, ' + (a.phases === 1 ? 'single-phase' : 'three-phase') + (a.voltageAssumed ? ' (assumed)' : '') + '.' },
      { type: 'p', text: 'Lat / Long: ' + ((doc.anchor && isFinite(doc.anchor.lat)) ? (doc.anchor.lat + ', ' + doc.anchor.lng) : 'not on the project') + '. Zoning district: ' + (a.zoning || 'not on the project') + '. Flood zone: ' + (a.flood || 'not on the project') + '.' },
      a.locationNote ? { type: 'p', text: a.locationNote } : { type: 'gap', h: 0 },
      { type: 'p', text: 'JOB NO.: ' + (a.jobNo || 'not on the project') + '. DESIGNED BY: ' + (a.designedBy || 'not on the project') + '. CHECKED BY: ' + (a.checkedBy || 'not on the project') + '.' },
      { type: 'h', text: 'General notes' },
      { type: 'p', text: 'All construction shall comply with the codes adopted by the AHJ, including the current electrical, fire and building codes. Before work starts, the contractor tells the engineer of record about any discrepancy in the existing conditions. The contractor is responsible for safety on the site, for installing equipment to the manufacturer\'s instructions, and for reading the drawings and the equipment manuals before energizing. Work started before the AHJ approves the set is at the contractor\'s risk.' },
      { type: 'h', text: 'Electrical notes' },
      { type: 'p', text: (model.equipment.some(function (e) { return e.key === 'bess'; })
        ? 'Battery energy storage shall be clearly marked per NEC 706 where a battery is drawn. '
        : '') + (model.arrays.length
        ? 'A photovoltaic system is marked per NEC 690, including the disconnect at 690.13. '
        : '') + 'Grounding follows NEC 250, and 690.47 where a PV system is present. Circuits are identified at pull boxes and terminals. Flexible conduit is used only where this set or the engineer of record calls for it.' },
      { type: 'h', text: 'Scope of work' },
      { type: 'p', text: scopeLine(a.kind, model) },
      { type: 'vicinity', doc: doc },
      { type: 'h', text: 'Codes this set used' },
      { type: 'p', text: 'National Electrical Code, ' + a.nec + ' edition, for the sections cited on the schedules and the checks sheet.' + (a.adoptedNec ? ' The project names the jurisdiction\'s adopted edition as ' + a.adoptedNec + '.' : ' The jurisdiction\'s adopted edition is not on the project.') },
      { type: 'p', text: 'NFPA 855, 2023 edition, is cited for outdoor energy storage clearances where a battery is drawn. IFC ' + (a.ifcEdition || 'edition not on the project') + ' is the fire code the AHJ adopts; article numbers in the checks sheet follow the section titles used in recent IFC editions and have to be confirmed against the adopted printing.' },
      { type: 'p', text: 'NFPA 70E is the electrical safe-work standard. This set does not calculate incident energy. NEC 110.16 is the label requirement where equipment is likely to be examined while energized.' },
      { type: 'p', text: 'Authority having jurisdiction: ' + (a.ahj || 'not named') + (a.jurisdiction ? ' (' + a.jurisdiction + ').' : '. The jurisdiction is not named.') },
      { type: 'h', text: 'Sheet index' }
    ];
    items.push({
      type: 'table', title: '',
      columns: [{ label: 'Sheet', w: 1 }, { label: 'Title', w: 3 }, { label: 'What it is taken from', w: 4 }],
      rows: [
        ['G-001', 'Cover', 'Project, customer, codes'],
        ['C-001', 'Site plan', 'Property, equipment, routes, to scale'],
        ['E-001', 'Equipment layout', 'Plan dimensions of what was placed'],
        ['E-002', 'Single-line diagram', 'Topology of the drawing'],
        ['E-003', 'Three-line diagram', 'Service phases'],
        ['E-004', 'Conductor and conduit schedule', 'NEC sizing from the ratings on the drawing'],
        ['E-005', 'Equipment schedule', 'Placed equipment'],
        ['E-006', 'Strings and inverters', 'Array layout'],
        ['E-007', 'Labels and placards', 'Sections cited on the sheet'],
        ['E-008', 'Grounding and bonding', 'Table 250.122'],
        ['E-009', 'Design checks', 'What passed, and what is still open'],
        ['A-001', 'Specifications', 'Catalog fields on file']
      ]
    });
    var marked = (doc.entities || []).filter(function (e) { return e && (e.type === 'demo' || e.demo); });
    items.push({
      type: 'p',
      text: marked.length
        ? 'Demolition is sheet C-002. Only items marked on the drawing are listed.'
        : 'No demolition is marked on the drawing. An empty demolition sheet is not issued.'
    });
    return items;
  }

  function siteScale(b, box) {
    var spanX = Math.max(1, b.maxX - b.minX), spanY = Math.max(1, b.maxY - b.minY);
    var need = Math.max(spanX / (box.w - 1.6), spanY / (box.h - 0.7));
    var i, scale = SCALES[SCALES.length - 1];
    for (i = 0; i < SCALES.length; i++) if (SCALES[i] >= need - 1e-6) { scale = SCALES[i]; break; }
    return scale;
  }

  function underlayCaption(doc, opts) {
    var drawing = (doc && doc.drawing) || {};
    var anchor = doc && doc.anchor && isFinite(+doc.anchor.lat) && isFinite(+doc.anchor.lng);
    if (opts.underlay && opts.underlay.jpeg) {
      var credit = opts.underlay.attribution || 'U.S. Geological Survey, The National Map';
      return 'Imagery: ' + credit + '. Public domain. The photo is registered to the site point. It is not a survey.';
    }
    if (drawing.aerial === false) return 'Aerial photo is turned off.';
    if (!anchor) return 'No site point is on the project, so no aerial photo is registered.';
    if (opts.aerialUnavailable) return 'Aerial imagery was not available.';
    return 'Aerial imagery was not attached to this sheet.';
  }

  function drawUnderlay(paper, doc, opts, x, y, w, h) {
    if (!opts.underlay || !opts.underlay.jpeg || !(w > 0) || !(h > 0)) return;
    paper.image(x, y, w, h, opts.underlay);
  }

  function drawFace(paper, x, y, w, face) {
    var h = 1.15;
    paper.rect(x, y, Math.min(w, 8.8), h, 1.1, face.border || INK, face.fill || [1, 1, 1]);
    var ink = face.ink || INK;
    var size = face.min ? 27 : 9;
    paper.text(x + 0.12, y + (face.min ? 0.55 : 0.28), size, face.title, 'start', ink);
    var ly = y + (face.min ? 0.95 : 0.48);
    var i;
    if (!face.min) {
      for (i = 0; i < (face.lines || []).length && i < 2; i++) {
        paper.text(x + 0.12, ly, 7.5, face.lines[i], 'start', ink);
        ly += 0.16;
      }
    }
    drawParagraph(paper, x, y + h + 0.02, w, face.cite + '. ' + face.note, 6.5, MUTED, 0.55);
    return y + 1.85;
  }

  function drawFaces(paper, x, y, w, faces) {
    var i;
    for (i = 0; i < faces.length; i++) y = drawFace(paper, x, y, w, faces[i]);
    return y;
  }

  function placardArt(model) {
    var faces = [];
    var pv = model.arrays.length > 0;
    var ess = false, i;
    for (i = 0; i < model.equipment.length; i++) if (model.equipment[i].key === 'bess') ess = true;
    if (pv) {
      faces.push({
        title: 'SOLAR PV SYSTEM IS EQUIPPED WITH RAPID SHUTDOWN.',
        lines: ['TURN RAPID SHUTDOWN SWITCH TO THE OFF POSITION TO SHUT DOWN PV SYSTEM AND REDUCE SHOCK HAZARD IN ARRAY.'],
        fill: [1, 1, 1], ink: [0.08, 0.08, 0.08], border: [0.08, 0.08, 0.08],
        cite: 'NEC 2023 690.12(D)',
        note: 'Title capitals, at least 3/8 in. All text must contrast with the background. The Code does not name a color. The label also requires a simple building diagram, which this sheet does not invent. 690.12 applies to a PV system on or in a building. This drawing does not decide that.'
      });
      faces.push({
        min: true,
        title: 'RAPID SHUTDOWN SWITCH FOR SOLAR PV SYSTEM',
        lines: [],
        fill: [0.75, 0.05, 0.08], ink: [1, 1, 1], border: [0.45, 0.02, 0.04],
        cite: 'NEC 2023 690.12(D)(2)',
        note: 'White on red, reflective, capitals, at least 3/8 in, on or within 3 ft of the switch. The drawing does not locate the switch.'
      });
      faces.push({
        title: 'PHOTOVOLTAIC POWER SOURCE',
        lines: ['or SOLAR PV DC CIRCUIT'],
        fill: [1, 1, 1], ink: [0.08, 0.08, 0.08], border: [0.08, 0.08, 0.08],
        cite: 'NEC 2023 690.31(D)(2)',
        note: 'Either wording, on exposed DC raceways on or in a building. This section does not name a color, so the face is not drawn red.'
      });
    }
    if (model.sources && model.sources.length) {
      faces.push({
        title: 'POWER SOURCE DIRECTORY',
        lines: ['A permanent directory of every power source on the premises.'],
        fill: [1, 1, 1], ink: [0.08, 0.12, 0.2], border: [0.12, 0.31, 0.47],
        cite: 'NEC 2023 705.10',
        note: '705.10 requires the directory. It does not name a color.'
      });
    }
    if (model.interconnect && model.interconnect.method === '120' && model.interconnect.ok) {
      faces.push({
        title: 'DO NOT RELOCATE THIS OVERCURRENT DEVICE',
        lines: ['Keep this source device at the opposite end of the bus from the primary source.'],
        fill: [1, 1, 1], ink: [0.08, 0.08, 0.08], border: [0.08, 0.08, 0.08],
        cite: 'NEC 2023 705.12',
        note: 'The do-not-relocate warning. The Code does not name a color for this plaque.'
      });
    }
    if (ess) {
      faces.push({
        title: 'ENERGY STORAGE SYSTEM DISCONNECT',
        lines: ['Plaque or directory at the ESS disconnecting means.'],
        fill: [1, 1, 1], ink: [0.08, 0.08, 0.08], border: [0.08, 0.08, 0.08],
        cite: 'NEC 2023 706.15',
        note: '706.15 requires the plaque. The section does not name a color, so this face is not drawn red. The drawing does not locate the disconnect.'
      });
    }
    return faces;
  }

  function fillRows(model) {
    var rows = [], i, c, f;
    for (i = 0; i < model.circuits.length; i++) {
      c = model.circuits[i];
      f = c.fill;
      if (!f) {
        rows.push([c.label, '', '', '', '', 'Not sized, so fill is not selected.']);
        continue;
      }
      rows.push([
        c.label,
        f.trade ? (f.trade + ' in') : '',
        f.raceway + (f.racewayAssumed ? ' (assumed)' : ''),
        String(f.conductors || ''),
        f.fillPct == null ? '' : (f.fillPct + '% of ' + f.limitPct + '%'),
        f.selected ? 'selected, not a field measurement' : (f.over ? 'over Table 1' : (f.fromDrawing ? 'on the drawing' : f.note))
      ]);
    }
    if (!rows.length) rows.push(['—', '', '', '', '', 'No sized circuit']);
    return rows;
  }

  function drawSite(paper, box, doc, model, opts) {
    var b = boundsOfDoc(doc);
    paper.text(box.x, box.y + 0.14, 8, 'North is up. Dimensions are feet.', 'start', MUTED);
    if (!isFinite(b.minX)) {
      paper.text(box.x, box.y + 0.4, 9, 'No site geometry on the drawing.', 'start', INK);
      return;
    }
    var pad = 8;
    b = { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
    var area = { x: box.x, y: box.y + 0.28, w: box.w - 1.7, h: box.h - 0.55 };
    var scale = siteScale(b, area);
    var dw = (b.maxX - b.minX) / scale, dh = (b.maxY - b.minY) / scale;
    var ox = area.x + Math.max(0, (area.w - dw) / 2);
    var oy = area.y + Math.max(0, (area.h - dh) / 2);
    function X(px) { return ox + (px - b.minX) / scale; }
    function Y(py) { return oy + dh - (py - b.minY) / scale; }
    paper.rect(area.x, area.y, area.w, area.h, 0.4, HAIR);
    drawUnderlay(paper, doc, opts || {}, ox, oy, dw, dh);
    strokeDoc(paper, doc, X, Y);
    var seen = {}, i;
    for (i = 0; i < (doc.entities || []).length; i++) {
      var e = doc.entities[i];
      if (e.type !== 'equip') continue;
      var corners = G.rectCorners(e);
      var c = G.bbox(corners);
      if (!seen[e.key]) seen[e.key] = 0;
      var tag = tagFor(model, e, seen[e.key]);
      seen[e.key]++;
      if (e.key === 'bess' || e.key === 'pcs' || e.key === 'charger' || e.key === 'transformer' || e.key === 'poi' || e.key === 'meter' || e.key === 'compute' || e.key === 'load') {
        paper.text(X(c.cx), Y(c.maxY) - 0.02, 6, tag, 'middle', NAVY);
      }
      if (e.key === 'bess') {
        var clr = [
          { x: c.minX - 10, y: c.minY - 10 }, { x: c.maxX + 10, y: c.minY - 10 },
          { x: c.maxX + 10, y: c.maxY + 10 }, { x: c.minX - 10, y: c.maxY + 10 }
        ];
        poly(paper, clr, X, Y, true, 0.45, [0.55, 0.32, 0.1], true);
        paper.text(X(c.minX - 10), Y(c.maxY + 10) - 0.02, 5.5, '10 ft exposure check', 'start', [0.55, 0.32, 0.1]);
      }
    }
    var ci;
    for (ci = 0; ci < model.conduits.length; ci++) {
      var conduit = model.conduits[ci];
      if (!conduit.pts || conduit.pts.length < 2) continue;
      var mid = conduit.pts[Math.floor(conduit.pts.length / 2)];
      paper.text(X(mid.x) + 0.04, Y(mid.y), 6, conduit.tag + ' ' + conduit.lengthFt + ' ft', 'start', [0.35, 0.2, 0.55]);
    }
    for (i = 0; i < (doc.entities || []).length; i++) {
      var s = doc.entities[i];
      if (s.type === 'setback' && s.distance) {
        var sb = G.bbox(s.pts);
        paper.text(X(sb.minX), Y(sb.minY), 6, 'Setback ' + s.distance + ' ft', 'start', [0.45, 0.28, 0.05]);
      }
      if (s.type === 'dim' && s.a && s.b) {
        paper.text(X((s.a.x + s.b.x) / 2), Y((s.a.y + s.b.y) / 2) - 0.08, 6, G.formatFeet(G.dist(s.a, s.b)), 'middle', INK);
      }
    }
    var nx = area.x + area.w - 0.45, ny = area.y + 0.15;
    paper.text(nx, ny + 0.12, 8, 'N', 'middle', NAVY);
    paper.text(nx + 0.16, ny + 0.42, 6, 'TRUE NORTH', 'start', NAVY);
    paper.line(nx, ny + 0.16, nx, ny + 0.55, 1, NAVY);
    paper.line(nx, ny + 0.16, nx - 0.06, ny + 0.28, 0.8, NAVY);
    paper.line(nx, ny + 0.16, nx + 0.06, ny + 0.28, 0.8, NAVY);
    var barFt = scale * 2;
    var barX = area.x + 0.15, barY = area.y + area.h - 0.28;
    paper.line(barX, barY, barX + 2, barY, 1.4, INK);
    paper.line(barX, barY - 0.06, barX, barY + 0.06, 0.8, INK);
    paper.line(barX + 2, barY - 0.06, barX + 2, barY + 0.06, 0.8, INK);
    paper.text(barX + 1, barY - 0.14, 7, barFt + ' ft', 'middle', INK);
    drawParagraph(paper, area.x + 0.12, barY - 0.55, Math.max(2.2, area.w - 2.4), underlayCaption(doc, opts || {}), 6.5, INK, 0.42);
    paper.text(box.x + box.w - 1.6, box.y + 0.28, 7.5, 'SCALE', 'start', NAVY);
    paper.text(box.x + box.w - 1.6, box.y + 0.46, 8, '1 in = ' + scale + ' ft', 'start', INK);
    paper.text(box.x + box.w - 1.6, box.y + 0.7, 6.5, 'Property line, equipment,', 'start', MUTED);
    paper.text(box.x + box.w - 1.6, box.y + 0.84, 6.5, 'setbacks, conduit.', 'start', MUTED);
    paper.text(box.x + box.w - 1.6, box.y + 1.04, 6.5, 'Dashed box: 10 ft', 'start', MUTED);
    paper.text(box.x + box.w - 1.6, box.y + 1.18, 6.5, 'around each battery.', 'start', MUTED);
    if (model.fences) {
      paper.text(box.x + box.w - 1.6, box.y + 1.72, 6, 'Fence is drawn.', 'start', INK);
      paper.text(box.x + box.w - 1.6, box.y + 1.86, 5.5, 'A fencing detail (post,', 'start', MUTED);
      paper.text(box.x + box.w - 1.6, box.y + 1.98, 5.5, 'fabric, foundation) is', 'start', MUTED);
      paper.text(box.x + box.w - 1.6, box.y + 2.1, 5.5, 'not designed in this set.', 'start', MUTED);
    }
    if (model.spacing && model.spacing.minUnitFt != null) {
      paper.text(box.x + box.w - 1.6, box.y + 1.4, 6.5, 'Battery separation', 'start', MUTED);
      paper.text(box.x + box.w - 1.6, box.y + 1.54, 6.5, model.spacing.minUnitFt + ' ft', 'start', INK);
    }
  }

  function tagFor(model, e, indexAmongKey) {
    var i, n = -1;
    for (i = 0; i < model.equipment.length; i++) {
      if (model.equipment[i].key !== e.key) continue;
      n++;
      if (n === indexAmongKey) return model.equipment[i].tag;
    }
    return e.label || e.key || '';
  }

  function drawElev(paper, box, doc, model) {
    paper.text(box.x, box.y + 0.14, 8, 'Rectangles are the plan size on the drawing. This is not a surveyed elevation. A structural pad section is not designed in this set.', 'start', MUTED);
    var eqs = [], i, e;
    for (i = 0; i < (doc.entities || []).length; i++) {
      e = doc.entities[i];
      if (e.type === 'equip') eqs.push(e);
    }
    if (!eqs.length) {
      paper.text(box.x, box.y + 0.4, 9, 'No equipment placed.', 'start', INK);
      return;
    }
    var x = box.x, y = box.y + 0.4, rowH = 1.5;
    for (i = 0; i < eqs.length; i++) {
      e = eqs[i];
      var pw = Math.max(0.4, Math.min(2.2, (e.w || 1) / 20));
      var ph = Math.max(0.35, Math.min(1.1, (e.heightFt || e.h || 1) / 16));
      if (x + pw + 1.4 > box.x + box.w) { x = box.x; y += rowH; }
      if (y + rowH > box.y + box.h) break;
      paper.rect(x, y, pw, ph, 0.8, INK);
      paper.text(x, y + ph + 0.16, 7, tagFor(model, e, countBefore(eqs, i)), 'start', NAVY);
      paper.text(x, y + ph + 0.32, 6.5, (e.w || 0) + ' × ' + (e.h || 0) + ' ft plan', 'start', MUTED);
      x += Math.max(pw, 1.3) + 0.45;
    }
  }

  function countBefore(list, index) {
    var n = 0, i;
    for (i = 0; i < index; i++) if (list[i].key === list[index].key) n++;
    return n;
  }

  function drawSld(paper, box, model) {
    paper.text(box.x, box.y + 0.12, 7.5, 'Generated from the equipment on the drawing. Ratings are the schedule on E-004. A blank rating was not on the drawing.', 'start', MUTED);
    var area = { x: box.x, y: box.y + 0.28, w: box.w, h: box.h - 0.36 };
    var lay = SLD.layout(model.sld, area.w, area.h);
    SLD.draw(lay, area.x, area.y, paper.ops);
    paper._sld = lay;
  }

  function drawThree(paper, box, model) {
    var a = model.assumptions;
    if (a.phases === 1) {
      paper.text(box.x, box.y + 0.2, 10, 'Single-phase service.', 'start', INK);
      paper.text(box.x, box.y + 0.45, 8, 'A three-line diagram is not drawn. The project is marked single-phase. The single-line is E-002.', 'start', MUTED);
      return;
    }
    paper.text(box.x, box.y + 0.14, 8, 'Service three-line. Branch circuits stay on the single-line. Phase rotation is not a field measurement.', 'start', MUTED);
    var y0 = box.y + 1.1, x0 = box.x + 0.8, x1 = box.x + box.w - 0.8;
    var phases = ['L1', 'L2', 'L3'], i;
    for (i = 0; i < 3; i++) {
      var y = y0 + i * 0.55;
      paper.text(x0 - 0.4, y + 0.03, 8, phases[i], 'start', NAVY);
      paper.line(x0, y, x1, y, 0.9, INK);
      paper.rect(x0 + 1.4, y - 0.12, 0.26, 0.24, 0.7, INK);
      paper.line(x0 + 1.4, y + 0.12, x0 + 1.66, y - 0.12, 0.6, INK);
    }
    paper.line(x0, y0 + 1.85, x1, y0 + 1.85, 0.6, HAIR, true);
    paper.text(x0 - 0.4, y0 + 1.88, 8, 'N', 'start', MUTED);
    paper.line(x0, y0 + 2.25, x0 + 0.5, y0 + 2.25, 0.8, INK);
    paper.line(x0 + 0.08, y0 + 2.38, x0 + 0.42, y0 + 2.38, 0.7, INK);
    paper.line(x0 + 0.16, y0 + 2.5, x0 + 0.34, y0 + 2.5, 0.6, INK);
    paper.text(x0 + 0.6, y0 + 2.4, 8, 'Equipment ground', 'start', MUTED);
    var spec = '';
    for (i = 0; i < model.circuits.length; i++) if (model.circuits[i].spec) { spec = model.circuits[i].label + ': ' + model.circuits[i].spec; break; }
    paper.text(box.x, y0 + 3.0, 8, a.voltage + ' V, 3-phase, 4-wire assumed where the project does not say otherwise.', 'start', INK);
    paper.text(box.x, y0 + 3.22, 8, spec ? ('Example feeder: ' + spec + '. Every circuit is on E-004.') : 'Conductors are on E-004.', 'start', INK);
    paper.text(box.x, y0 + 3.5, 7.5, 'The breaker symbol is the overcurrent device. It is not a shop drawing of a cubicle.', 'start', MUTED);
  }

  function circuitRows(model) {
    return model.circuits.map(function (c) {
      return [
        c.label,
        c.role,
        c.volts + ' V',
        c.currentA == null ? '' : String(c.currentA),
        c.designA == null ? '' : String(c.designA),
        c.ocpdA == null ? '' : String(c.ocpdA),
        c.spec || c.error || c.note || '',
        c.egc ? c.egc + ' Cu' : '',
        c.lengthFt == null ? '' : String(c.lengthFt),
        c.dropPct == null ? '' : String(c.dropPct) + '%',
        c.cite
      ];
    });
  }

  function build(doc, opts) {
    opts = opts || {};
    var size = SIZES[opts.size] || SIZES['ansi-d'];
    var model = E.analyze(doc, opts.catalog || {});
    var date = opts.date || '2026-10-18';
    var base = metaOf(doc, model, date, size);
    var pages = [];
    addFlow(pages, size, base, 'G-001', 'Cover / title', coverItems(doc, model));
    pages.push(dedicated(size, base, 'C-001', 'Site plan', function (p, box) { drawSite(p, box, doc, model, opts); }));
    var demos = (doc.entities || []).filter(function (e) { return e && (e.type === 'demo' || e.demo); });
    if (demos.length) {
      pages.push(dedicated(size, base, 'C-002', 'Demolition', function (p, box) {
        p.text(box.x, box.y + 0.16, 9, 'Items marked for removal', 'start', INK);
        var y = box.y + 0.42, di;
        for (di = 0; di < demos.length && y < box.y + box.h - 0.3; di++) {
          p.text(box.x, y, 8, (demos[di].label || 'Unnamed') + ' — remove. Existing conditions beyond this list are not surveyed here.', 'start', INK);
          y += 0.22;
        }
      }));
    }
    pages.push(dedicated(size, base, 'E-001', 'Equipment layout', function (p, box) { drawElev(p, box, doc, model); }));
    pages.push(dedicated(size, base, 'E-002', 'Single-line diagram', function (p, box) { drawSld(p, box, model); }));
    pages.push(dedicated(size, base, 'E-003', 'Three-line diagram', function (p, box) { drawThree(p, box, model); }));

    var conduitRows = model.conduits.map(function (c) {
      return [c.tag, String(c.lengthFt), c.spec || 'not stated', c.from || '—', c.to || '—', c.trade || 'trade size not stated'];
    });
    if (!conduitRows.length) conduitRows.push(['—', '', '', '—', '—', 'No conduit on the drawing']);
    addFlow(pages, size, base, 'E-004', 'Conductor and conduit schedule', [
      { type: 'p', text: model.factorNote },
      { type: 'p', text: 'Continuous circuits are sized at 125% of the nameplate current. The section is on each row. Voltage drop uses Chapter 9 Table 8 uncoated-copper resistance (K = 12.9) and is the informational note in 210.19(A)(1) and 215.2(A)(1), not a pass/fail rule by itself. One drawn conduit is applied as the length of every circuit, and the sheet says so. Several conduits are listed and not assigned.' },
      { type: 'table', title: 'Circuits', columns: [
        { label: 'Circuit', w: 1.4 }, { label: 'Role', w: 0.7 }, { label: 'V', w: 0.6 },
        { label: 'A', w: 0.6 }, { label: '125%', w: 0.6 }, { label: 'OCPD', w: 0.6 },
        { label: 'Conductor', w: 1.6 }, { label: 'EGC', w: 0.7 }, { label: 'ft', w: 0.5 },
        { label: 'VD', w: 0.5 }, { label: 'Section', w: 1.6 }
      ], rows: circuitRows(model).length ? circuitRows(model) : [['—', '', '', '', '', '', 'No sized circuit', '', '', '', '']] },
      { type: 'table', title: 'Conduit on the drawing', columns: [
        { label: 'Run', w: 0.7 }, { label: 'Length ft', w: 0.8 }, { label: 'Spec', w: 1 },
        { label: 'From', w: 1.2 }, { label: 'To', w: 1.2 }, { label: 'Trade size', w: 1.4 }
      ], rows: conduitRows },
      { type: 'p', text: 'Field-verify all routing and lengths before ordering.' },
      { type: 'note', text: 'Add vertical risers, equipment stub-ups, pull-box slack and terminations before ordering. Conduit and conductor sizes are the design basis; the engineer of record confirms ampacity, voltage drop and fill. Trench corridors shared by multiple services are counted once. Trench footage is not the sum of the conduit lengths it carries. Underground routing is diagrammatic. All runs to be installed per NEC Article 300 and the conduit type on this schedule.' },
      { type: 'p', text: trenchLine(model) },
      { type: 'table', title: 'Raceway fill, each circuit in its own raceway', columns: [
        { label: 'Circuit', w: 1.3 }, { label: 'Trade', w: 0.8 }, { label: 'Type', w: 1.3 },
        { label: 'Wires', w: 0.6 }, { label: 'Fill', w: 1.1 }, { label: 'Flag', w: 2.2 }
      ], rows: fillRows(model) },
      { type: 'p', text: 'Each sized circuit is its own raceway unless the drawing names the run that carries it. The trade size is the smallest Chapter 9 Table 4 size whose Table 1 fill holds the phase conductors and the equipment grounding conductor. Insulation is THHN/THWN-2, Table 5. One wire is 53 percent, two wires are 31 percent, and more than two are 40 percent. Nipple fill is not used. A trade size written on the run is kept, and a fill over Table 1 is flagged. PVC Schedule 40 is used when the run says PVC. Otherwise the area is rigid metal conduit. A selected size is not a field measurement. NEC 310.10(G) parallel sets, where used, are 1/0 AWG or larger. 310.15(C) bundling is not applied.' }
    ]);

    addFlow(pages, size, base, 'E-005', 'Equipment schedule', [
      { type: 'table', title: 'Placed equipment', columns: [
        { label: 'Tag', w: 1 }, { label: 'Name', w: 2 }, { label: 'kW', w: 0.8 }, { label: 'kWh', w: 0.8 },
        { label: 'Plan ft', w: 1.4 }, { label: 'Nameplate note', w: 2.5 }
      ], rows: model.equipment.length ? model.equipment.map(function (e) {
        return [e.tag, e.label, e.kw ? String(e.kw) : '', e.kwh ? String(e.kwh) : '', (e.w || '') + ' × ' + (e.h || ''),
          [e.mfr, e.model, e.zPct ? 'Z ' + e.zPct + '%' : '', e.config || ''].filter(Boolean).join(' ') || 'No nameplate fields on the drawing'];
      }) : [['—', 'None placed', '', '', '', '']] },
      { type: 'p', text: model.transformer
        ? ('Transformer duty ' + model.transformer.requiredKva + ' kVA at power factor ' + model.transformer.pf + (model.transformer.pfAssumed ? ' (assumed)' : '') + '. Standard nameplate ' + (model.transformer.nameplateKva || 'above the sizes used here') + ' kVA. NEC 450 does not require a multiplier; 450.3 overcurrent is not calculated without the nameplate.')
        : 'No transformer is placed. One is not invented.' }
    ]);

    var stringItems = [{ type: 'h', text: 'Modules' }];
    if (!model.arrays.length) {
      stringItems.push({ type: 'p', text: 'No photovoltaic array is on the drawing. Nothing is invented for a stringing plan.' });
    } else {
      var ai;
      for (ai = 0; ai < model.arrays.length; ai++) {
        var ar = model.arrays[ai];
        stringItems.push({ type: 'p', text: ar.tag + ': ' + ar.kwDc + ' kW-DC, ' + ar.kwAc + ' kW-AC (' + (ar.kwAcFrom === 'nameplate' ? 'inverter kW entered on the array' : 'array layout DC divided by 1.25, which is the layout ratio, not a code factor') + '), ' + ar.tables + ' tables, ' + ar.modules + ' modules, mount ' + ar.mount + '. Module ' + G.MODULE.make + ' ' + G.MODULE.line + ', ' + G.MODULE.watts + ' W.' });
      }
      stringItems.push({ type: 'p', text: 'Where module Isc and Voc are blank, string length and 690.7 maximum voltage are not calculated. 690.8(A)(1)(a)(1) is 125% of the parallel module short-circuit current for a PV system under 100 kW. At 100 kW and above, 690.8(A)(1)(a)(2) applies and is not run from wattage alone.' });
    }
    addFlow(pages, size, base, 'E-006', 'Strings and inverters', stringItems);

    var placardItems = [
      { type: 'p', text: 'Wording below is the requirement in ordinary language. The sealed placard has to match the adopted edition\'s exact legend. This sheet does not letter a placard the code does not specify word for word.' },
      { type: 'table', title: 'Placards', columns: [
        { label: 'Section', w: 1.6 }, { label: 'Where', w: 2 }, { label: 'What it has to say', w: 4 }
      ], rows: model.placards.map(function (p) { return [p.cite, p.where, p.text]; }) },
      { type: 'p', text: 'The faces below are drawn to the minimum the cited section names. A color is used only where that section names one. Where the Code requires contrast and does not name a color, the face is a bordered plaque and the note says so.' }
    ];
    var art = placardArt(model);
    if (art.length) placardItems.push({ type: 'faces', faces: art });
    placardItems.push({ type: 'table', title: 'Sign index', columns: [
      { label: 'Face', w: 1.8 }, { label: 'Section', w: 2.2 }, { label: 'Legend', w: 4 }
    ], rows: signFaces(doc, model) });
    addFlow(pages, size, base, 'E-007', 'Labels and placards', placardItems);

    addFlow(pages, size, base, 'E-008', 'Grounding and bonding', [
      { type: 'p', text: 'Equipment grounding conductors are sized from NEC 2023 Table 250.122 for the overcurrent device ahead of the equipment. The grounding electrode system is required by 250.50. A PV system also follows 690.47. Electrode resistance, ground-rod count and the bonding jumper length are not on the drawing, so they are not designed here.' },
      { type: 'table', title: 'Equipment grounding conductors', columns: [
        { label: 'Circuit', w: 2 }, { label: 'OCPD A', w: 1 }, { label: 'Copper EGC', w: 1.4 }, { label: 'Section', w: 2 }
      ], rows: model.circuits.filter(function (c) { return c.ocpdA; }).map(function (c) {
        return [c.label, String(c.ocpdA), c.egc ? c.egc + ' AWG or kcmil Cu' : '', 'Table 250.122'];
      }) }
    ]);

    var checkRows = model.checks.map(function (c) {
      var state = c.ok ? 'Meets' : (c.severity === 'block' ? 'Not met' : (c.severity === 'review' ? 'Open' : 'Note'));
      return [state, c.title, c.cite || '', c.detail];
    });
    addFlow(pages, size, base, 'E-009', 'Design checks', [
      { type: 'p', text: model.ready ? 'No blocking item. Notes marked Open are for the engineer. They are printed here so the drawing does not have to grow a second panel.' : 'Not ready to issue. Items marked Not met have to be resolved. The export from the editor is held until they are.' },
      { type: 'table', title: 'Checks', columns: [
        { label: 'Result', w: 0.8 }, { label: 'Item', w: 2 }, { label: 'Section', w: 1.8 }, { label: 'Detail', w: 4 }
      ], rows: checkRows.length ? checkRows : [['—', 'None', '', '']] }
    ]);

    addFlow(pages, size, base, 'A-001', 'Specifications', [
      { type: 'p', text: 'Rows are the fields on the drawing plus the module the array layout already uses. A datasheet file is listed only when the equipment or the catalog handed to this set carries one. A missing datasheet is not replaced with a guessed PDF.' },
      { type: 'table', title: 'On file', columns: [
        { label: 'Item', w: 2 }, { label: 'SKU', w: 1.6 }, { label: 'Facts on file', w: 3 }, { label: 'Datasheet', w: 2 }
      ], rows: model.specs.map(function (s) { return [s.item, s.sku, s.fact, s.sheet]; }) }
    ]);

    return { pages: pages, model: model, size: size, date: date };
  }

  function pdfEscape(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?');
  }
  function xmlEscape(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function opsStream(ops, pageH) {
    var cmd = [], i, o, k = 0.5522847498;
    function X(x) { return (x * 72).toFixed(2); }
    function Y(y) { return ((pageH - y) * 72).toFixed(2); }
    function rgb(c, stroke) {
      c = c || INK;
      cmd.push(c[0].toFixed(3) + ' ' + c[1].toFixed(3) + ' ' + c[2].toFixed(3) + (stroke ? ' RG' : ' rg'));
    }
    for (i = 0; i < ops.length; i++) {
      o = ops[i];
      if (o.t === 'l') {
        rgb(o.rgb, true);
        cmd.push(o.dash ? '[3 2] 0 d' : '[] 0 d');
        cmd.push((o.sw || 0.6).toFixed(2) + ' w');
        cmd.push(X(o.x1) + ' ' + Y(o.y1) + ' m ' + X(o.x2) + ' ' + Y(o.y2) + ' l S');
      } else if (o.t === 'r') {
        if (o.fill) {
          rgb(o.fill, false);
          cmd.push(X(o.x) + ' ' + Y(o.y + o.h) + ' ' + (o.w * 72).toFixed(2) + ' ' + (o.h * 72).toFixed(2) + ' re f');
        }
        if (o.rgb) {
          rgb(o.rgb, true);
          cmd.push('[] 0 d');
          cmd.push((o.sw || 0.6).toFixed(2) + ' w');
          cmd.push(X(o.x) + ' ' + Y(o.y + o.h) + ' ' + (o.w * 72).toFixed(2) + ' ' + (o.h * 72).toFixed(2) + ' re S');
        }
      } else if (o.t === 'c') {
        rgb(o.rgb, true);
        cmd.push((o.sw || 0.6).toFixed(2) + ' w');
        var cx = o.x * 72, cy = (pageH - o.y) * 72, r = o.r * 72;
        cmd.push([
          (cx + r).toFixed(2) + ' ' + cy.toFixed(2) + ' m',
          (cx + r).toFixed(2) + ' ' + (cy + k * r).toFixed(2) + ' ' + (cx + k * r).toFixed(2) + ' ' + (cy + r).toFixed(2) + ' ' + cx.toFixed(2) + ' ' + (cy + r).toFixed(2) + ' c',
          (cx - k * r).toFixed(2) + ' ' + (cy + r).toFixed(2) + ' ' + (cx - r).toFixed(2) + ' ' + (cy + k * r).toFixed(2) + ' ' + (cx - r).toFixed(2) + ' ' + cy.toFixed(2) + ' c',
          (cx - r).toFixed(2) + ' ' + (cy - k * r).toFixed(2) + ' ' + (cx - k * r).toFixed(2) + ' ' + (cy - r).toFixed(2) + ' ' + cx.toFixed(2) + ' ' + (cy - r).toFixed(2) + ' c',
          (cx + k * r).toFixed(2) + ' ' + (cy - r).toFixed(2) + ' ' + (cx + r).toFixed(2) + ' ' + (cy - k * r).toFixed(2) + ' ' + (cx + r).toFixed(2) + ' ' + cy.toFixed(2) + ' c S'
        ].join('\n'));
      } else if (o.t === 'img' && o.name) {
        cmd.push('q ' + (o.w * 72).toFixed(2) + ' 0 0 ' + (o.h * 72).toFixed(2) + ' ' + (o.x * 72).toFixed(2) + ' ' + ((pageH - o.y - o.h) * 72).toFixed(2) + ' cm /' + o.name + ' Do Q');
      } else if (o.t === 'tx') {
        rgb(o.rgb, false);
        var tw = String(o.text).length * (o.size * 0.52);
        var tx = o.x * 72;
        if (o.anchor === 'middle') tx -= tw / 2;
        else if (o.anchor === 'end') tx -= tw;
        cmd.push('BT /F1 ' + o.size.toFixed(2) + ' Tf ' + tx.toFixed(2) + ' ' + Y(o.y).toFixed ? Y(o.y) : Y(o.y));
        cmd[cmd.length - 1] = 'BT /F1 ' + o.size.toFixed(2) + ' Tf ' + tx.toFixed(2) + ' ' + Y(o.y) + ' Td (' + pdfEscape(o.text) + ') Tj ET';
      }
    }
    return cmd.join('\n');
  }

  function toPdf(built) {
    return assemblePdf(built.pages);
  }

  function b64ToBinary(b64) {
    var clean = String(b64 || '').replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('latin1');
    var bin = atob(clean), i, out = '';
    for (i = 0; i < bin.length; i++) out += bin.charAt(i);
    return out;
  }

  function collectImages(pages) {
    var list = [], seen = {}, i, k, o, name;
    for (i = 0; i < pages.length; i++) {
      for (k = 0; k < pages[i].ops.length; k++) {
        o = pages[i].ops[k];
        if (o.t !== 'img' || !o.b64) continue;
        name = seen[o.b64];
        if (!name) {
          name = 'Im' + list.length;
          seen[o.b64] = name;
          list.push(o);
        }
        o.name = name;
      }
    }
    return list;
  }

  function assemblePdf(pages) {
    var fontObj = 3;
    var contents = [], pageObjs = [], imageObjs = [], i, k, stream, o, xo, bytes;
    var images = collectImages(pages);
    var next = 4;
    for (i = 0; i < images.length; i++) {
      bytes = b64ToBinary(images[i].b64);
      images[i].objId = next;
      imageObjs.push({
        id: next,
        body: '<< /Type /XObject /Subtype /Image /Width ' + (images[i].pxW || 1) + ' /Height ' + (images[i].pxH || 1) +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bytes.length + ' >>\nstream\n' + bytes + '\nendstream'
      });
      next++;
    }
    for (i = 0; i < pages.length; i++) {
      stream = opsStream(pages[i].ops, pages[i].h);
      xo = '';
      for (k = 0; k < pages[i].ops.length; k++) {
        o = pages[i].ops[k];
        if (o.t === 'img' && o.name && o.objId) xo += '/' + o.name + ' ' + o.objId + ' 0 R ';
      }
      contents.push({ id: next, body: '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream' });
      pageObjs.push({
        id: next + 1,
        body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + (pages[i].w * 72).toFixed(0) + ' ' + (pages[i].h * 72).toFixed(0) + '] /Contents ' + next + ' 0 R /Resources << /Font << /F1 ' + fontObj + ' 0 R >>' +
          (xo ? ' /XObject << ' + xo + '>>' : '') + ' >> >>'
      });
      next += 2;
    }
    var kids = pageObjs.map(function (p) { return p.id + ' 0 R'; }).join(' ');
    var all = [];
    all.push({ id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });
    all.push({ id: 2, body: '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + kids + '] >>' });
    all.push({ id: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' });
    for (i = 0; i < imageObjs.length; i++) all.push(imageObjs[i]);
    for (i = 0; i < contents.length; i++) {
      all.push(contents[i]);
      all.push(pageObjs[i]);
    }
    var body = '%PDF-1.4\n', offsets = [0], n, chunk, xref;
    for (n = 0; n < all.length; n++) {
      offsets[all[n].id] = body.length;
      chunk = all[n].id + ' 0 obj ' + all[n].body + ' endobj\n';
      body += chunk;
    }
    xref = body.length;
    var size = next;
    body += 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (n = 1; n < size; n++) {
      var off = String(offsets[n] || 0);
      while (off.length < 10) off = '0' + off;
      body += off + ' 00000 n \n';
    }
    body += 'trailer << /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return body;
  }

  function toSvg(page) {
    var w = page.w, h = page.h, i, o, parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + 'in" height="' + h + 'in">');
    parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    function col(c) { c = c || INK; return 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')'; }
    for (i = 0; i < page.ops.length; i++) {
      o = page.ops[i];
      if (o.t === 'l') {
        parts.push('<line x1="' + o.x1.toFixed(3) + '" y1="' + o.y1.toFixed(3) + '" x2="' + o.x2.toFixed(3) + '" y2="' + o.y2.toFixed(3) + '" stroke="' + col(o.rgb) + '" stroke-width="' + ((o.sw || 0.6) / 72).toFixed(4) + '"' + (o.dash ? ' stroke-dasharray="0.06 0.04"' : '') + '/>');
      } else if (o.t === 'r') {
        if (o.fill) parts.push('<rect x="' + o.x.toFixed(3) + '" y="' + o.y.toFixed(3) + '" width="' + o.w.toFixed(3) + '" height="' + o.h.toFixed(3) + '" fill="' + col(o.fill) + '"/>');
        if (o.rgb) parts.push('<rect x="' + o.x.toFixed(3) + '" y="' + o.y.toFixed(3) + '" width="' + o.w.toFixed(3) + '" height="' + o.h.toFixed(3) + '" fill="none" stroke="' + col(o.rgb) + '" stroke-width="' + ((o.sw || 0.6) / 72).toFixed(4) + '"/>');
      } else if (o.t === 'c') {
        parts.push('<circle cx="' + o.x.toFixed(3) + '" cy="' + o.y.toFixed(3) + '" r="' + o.r.toFixed(3) + '" fill="none" stroke="' + col(o.rgb) + '" stroke-width="' + ((o.sw || 0.6) / 72).toFixed(4) + '"/>');
      } else if (o.t === 'img' && o.b64) {
        parts.push('<image href="data:image/jpeg;base64,' + String(o.b64).replace(/\s/g, '') + '" x="' + o.x.toFixed(3) + '" y="' + o.y.toFixed(3) + '" width="' + o.w.toFixed(3) + '" height="' + o.h.toFixed(3) + '" preserveAspectRatio="none"/>');
      } else if (o.t === 'tx') {
        var anchor = o.anchor === 'middle' ? 'middle' : (o.anchor === 'end' ? 'end' : 'start');
        parts.push('<text x="' + o.x.toFixed(3) + '" y="' + o.y.toFixed(3) + '" font-family="Helvetica, Arial, sans-serif" font-size="' + (o.size / 72).toFixed(4) + '" text-anchor="' + anchor + '" fill="' + col(o.rgb) + '">' + xmlEscape(o.text) + '</text>');
      }
    }
    parts.push('</svg>');
    return parts.join('');
  }

  function dxfText(s) {
    return String(s == null ? '' : s).replace(/[\r\n]/g, ' ').slice(0, 240);
  }

  function toDxf(built) {
    var rows = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
    var i, p, o, k, ox, pageH;
    function n(v) { return (Math.round(v * 1000) / 1000).toFixed(3); }
    for (i = 0; i < built.pages.length; i++) {
      p = built.pages[i];
      ox = i * (p.w + 1);
      pageH = p.h;
      var layer = (p.number || ('S' + (i + 1))).replace(/[^\w.-]+/g, '_');
      function y(v) { return pageH - v; }
      for (k = 0; k < p.ops.length; k++) {
        o = p.ops[k];
        if (o.t === 'l') {
          rows.push('0', 'LINE', '8', layer, '10', n(ox + o.x1), '20', n(y(o.y1)), '30', '0', '11', n(ox + o.x2), '21', n(y(o.y2)), '31', '0');
        } else if (o.t === 'r' && o.rgb) {
          rows.push('0', 'LWPOLYLINE', '8', layer, '90', '4', '70', '1',
            '10', n(ox + o.x), '20', n(y(o.y)),
            '10', n(ox + o.x + o.w), '20', n(y(o.y)),
            '10', n(ox + o.x + o.w), '20', n(y(o.y + o.h)),
            '10', n(ox + o.x), '20', n(y(o.y + o.h)));
        } else if (o.t === 'c') {
          rows.push('0', 'CIRCLE', '8', layer, '10', n(ox + o.x), '20', n(y(o.y)), '30', '0', '40', n(o.r));
        } else if (o.t === 'tx' && o.text) {
          rows.push('0', 'TEXT', '8', layer, '10', n(ox + o.x), '20', n(y(o.y)), '30', '0', '40', n(o.size / 72), '1', dxfText(o.text));
        }
      }
    }
    rows.push('0', 'ENDSEC', '0', 'EOF', '');
    return rows.join('\n');
  }

  function pageText(page) {
    var i, out = [];
    for (i = 0; i < page.ops.length; i++) if (page.ops[i].t === 'tx') out.push(page.ops[i].text);
    return out.join('\n');
  }

  var api = {
    SIZES: SIZES,
    build: build,
    toPdf: toPdf,
    toSvg: toSvg,
    toDxf: toDxf,
    pageText: pageText,
    VERSION: 'editor-v2-sheets/1'
  };
  root.OmegaEditorV2Sheets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
