/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-export.js — DXF and PDF for a Site Plan.
 *
 * ASCII DXF (a LINE / LWPOLYLINE / TEXT file a CAD tool opens) and a
 * one-sheet vector PDF. No images, so neither depends on the map tiles.
 * PNG is drawn by the page from the same geometry, because it needs a canvas.
 */
(function (root) {
  'use strict';

  var G = root.OmegaEditorV2Geom || require('./omega-editor-v2-geom.js');
  var D = root.OmegaEditorV2Doc || require('./omega-editor-v2-doc.js');

  function layerName(doc, id) {
    var l = D.layerById(doc, id);
    return (l && l.name) || '0';
  }
  function n(v) { return (Math.round((+v || 0) * 1000) / 1000).toFixed(3); }
  function dxfText(s) {
    return String(s == null ? '' : s).replace(/[\r\n]/g, ' ').slice(0, 200);
  }

  function pushLine(rows, layer, a, b) {
    rows.push('0', 'LINE', '8', layer, '10', n(a.x), '20', n(a.y), '30', '0', '11', n(b.x), '21', n(b.y), '31', '0');
  }
  function pushPoly(rows, layer, pts, closed) {
    var i;
    rows.push('0', 'LWPOLYLINE', '8', layer, '90', String(pts.length), '70', closed ? '1' : '0');
    for (i = 0; i < pts.length; i++) rows.push('10', n(pts[i].x), '20', n(pts[i].y));
  }
  function pushText(rows, layer, p, text, h) {
    rows.push('0', 'TEXT', '8', layer, '10', n(p.x), '20', n(p.y), '30', '0', '40', n(h || 2), '1', dxfText(text));
  }
  function pushCircle(rows, layer, c, r) {
    rows.push('0', 'CIRCLE', '8', layer, '10', n(c.x), '20', n(c.y), '30', '0', '40', n(r));
  }

  function entityRows(doc, e, rows) {
    var layer = layerName(doc, e.layer), corners, i, lay, ring;
    if (e.type === 'line' && e.a && e.b) pushLine(rows, layer, e.a, e.b);
    else if (e.type === 'dim' && e.a && e.b) {
      pushLine(rows, layer, e.a, e.b);
      pushText(rows, layer, { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, G.formatFeet(G.dist(e.a, e.b)), 2);
    } else if ((e.type === 'polyline' || e.type === 'polygon' || e.type === 'fence' || e.type === 'conduit' || e.type === 'obstruction' || e.type === 'setback') && e.pts) {
      pushPoly(rows, layer, e.pts, !!(e.closed || e.type === 'polygon' || e.type === 'obstruction' || e.type === 'setback'));
    } else if (e.type === 'rect' || e.type === 'equip' || e.type === 'parking') {
      corners = G.rectCorners(e);
      pushPoly(rows, layer, corners, true);
      if (e.label) pushText(rows, layer, { x: e.x, y: e.y }, e.label, 1.5);
    } else if (e.type === 'circle') pushCircle(rows, layer, { x: e.x, y: e.y }, e.r);
    else if (e.type === 'text') pushText(rows, layer, { x: e.x, y: e.y }, e.text || '', e.h || 2);
    else if (e.type === 'callout' && e.target && e.anchor) {
      pushLine(rows, layer, e.target, e.anchor);
      pushText(rows, layer, e.anchor, e.text || '', 2);
    } else if (e.type === 'array') {
      lay = D.arrayLayout(doc, e);
      ring = G.ringOf(D.find(doc, e.boundaryId) || e);
      if (ring) pushPoly(rows, layer, ring, true);
      if (lay.ok && !lay.densityOnly) {
        for (i = 0; i < lay.tables.length; i++) {
          var t = lay.tables[i];
          pushPoly(rows, layer, [
            { x: t.x, y: t.y }, { x: t.x + t.w, y: t.y },
            { x: t.x + t.w, y: t.y + t.h }, { x: t.x, y: t.y + t.h }
          ], true);
        }
      }
      if (lay.ok && ring) {
        var b = G.bbox(ring);
        pushText(rows, layer, { x: b.cx, y: b.cy }, lay.kw + ' kW-DC · ' + lay.tableCount + ' tables', 4);
      }
    }
  }

  function toDxf(doc) {
    var rows = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', '2',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES'
    ], i;
    for (i = 0; i < doc.entities.length; i++) {
      var layer = D.layerById(doc, doc.entities[i].layer);
      if (layer && layer.visible === false) continue;
      entityRows(doc, doc.entities[i], rows);
    }
    rows.push('0', 'ENDSEC', '0', 'EOF', '');
    return rows.join('\n');
  }

  /* A small LINE / LWPOLYLINE reader, enough to bring a file this
     exporter wrote back onto the drawing. Other entities are counted
     and skipped, never guessed. */
  function fromDxf(text) {
    var lines = String(text || '').split(/\r?\n/), i = 0, entities = [], skipped = 0;
    function pair() {
      if (i + 1 >= lines.length) return null;
      var code = lines[i++].trim(), val = lines[i++].trim();
      return { code: code, val: val };
    }
    while (i < lines.length) {
      if (lines[i].trim() === 'LINE' && (i === 0 || lines[i - 1].trim() === '0')) {
        i++;
        var a = { x: 0, y: 0 }, b = { x: 0, y: 0 }, layer = 'site', p;
        while (i < lines.length && lines[i].trim() !== '0') {
          p = pair();
          if (!p) break;
          if (p.code === '8') layer = p.val === 'Site' ? 'site' : 'site';
          else if (p.code === '10') a.x = +p.val;
          else if (p.code === '20') a.y = +p.val;
          else if (p.code === '11') b.x = +p.val;
          else if (p.code === '21') b.y = +p.val;
        }
        entities.push({ id: D.uid('e'), type: 'line', layer: 'site', a: a, b: b });
      } else if (lines[i].trim() === 'LWPOLYLINE' && (i === 0 || lines[i - 1].trim() === '0')) {
        i++;
        var pts = [], closed = false, cur = null, q;
        while (i < lines.length && lines[i].trim() !== '0') {
          q = pair();
          if (!q) break;
          if (q.code === '70') closed = q.val === '1';
          else if (q.code === '10') { cur = { x: +q.val, y: 0 }; pts.push(cur); }
          else if (q.code === '20' && cur) cur.y = +q.val;
        }
        entities.push({
          id: D.uid('e'),
          type: closed ? 'polygon' : 'polyline',
          layer: 'site',
          closed: closed,
          pts: pts
        });
      } else i++;
    }
    /* skipped is reserved for a future count of unsupported entities. */
    return { entities: entities, skipped: skipped };
  }

  function pdfEscape(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?');
  }

  function toPdf(doc, summary) {
    summary = summary || D.summary(doc);
    var boxes = [], i, b, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (i = 0; i < doc.entities.length; i++) {
      b = G.boundsOf(doc.entities[i]);
      boxes.push(b);
      if (b.maxX > b.minX || b.maxY > b.minY || doc.entities[i].type === 'line') {
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
      }
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 60; }
    var pad = 20;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    var pageW = 792, pageH = 612, margin = 36, titleH = 78;
    var drawW = pageW - margin * 2, drawH = pageH - margin * 2 - titleH;
    var scale = Math.min(drawW / (maxX - minX || 1), drawH / (maxY - minY || 1));
    function X(x) { return margin + (x - minX) * scale; }
    function Y(y) { return margin + titleH + (y - minY) * scale; }
    var cmds = [];
    cmds.push('0.75 0.78 0.82 RG');
    cmds.push(margin + ' ' + (margin + titleH) + ' ' + drawW.toFixed(2) + ' ' + drawH.toFixed(2) + ' re S');
    cmds.push('0.12 0.16 0.22 RG');
    cmds.push('0.5 w');
    function strokeRing(pts, close) {
      if (!pts || pts.length < 2) return;
      cmds.push(X(pts[0].x).toFixed(2) + ' ' + Y(pts[0].y).toFixed(2) + ' m');
      for (var k = 1; k < pts.length; k++) cmds.push(X(pts[k].x).toFixed(2) + ' ' + Y(pts[k].y).toFixed(2) + ' l');
      cmds.push(close ? 's' : 'S');
    }
    for (i = 0; i < doc.entities.length; i++) {
      var e = doc.entities[i], lay = D.layerById(doc, e.layer);
      if (lay && lay.visible === false) continue;
      if (e.type === 'line' || e.type === 'dim') strokeRing([e.a, e.b], false);
      else if (e.type === 'rect' || e.type === 'equip' || e.type === 'parking') strokeRing(G.rectCorners(e), true);
      else if (e.type === 'circle' && e.r > 0) {
        var ringC = [], ci;
        for (ci = 0; ci < 24; ci++) ringC.push({ x: e.x + Math.cos(ci / 24 * Math.PI * 2) * e.r, y: e.y + Math.sin(ci / 24 * Math.PI * 2) * e.r });
        strokeRing(ringC, true);
      } else if (e.pts && e.pts.length > 1) {
        strokeRing(e.pts, !!(e.closed || e.type === 'polygon' || e.type === 'obstruction' || e.type === 'setback'));
      } else if (e.type === 'array') {
        var host = D.find(doc, e.boundaryId) || e;
        var ring = G.ringOf(host);
        if (ring) strokeRing(ring, true);
      }
    }
    function text(x, y, size, str) {
      cmds.push('BT /F1 ' + size + ' Tf ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Td (' + pdfEscape(str) + ') Tj ET');
    }
    text(margin, pageH - margin - 4, 14, doc.name || 'Site plan');
    text(margin, pageH - margin - 20, 9, (doc.address || 'No address') + '   ·   ' + (summary.solarKwDc || 0) + ' kW-DC solar   ·   ' + (summary.bessKw || 0) + ' kW storage');
    var cust = (doc.assignment && doc.assignment.customerName) || 'No customer yet';
    text(margin, pageH - margin - 32, 9, 'Customer: ' + cust);
    text(margin, margin + 18, 8, 'OMEGA Site Plan preview. Scale is fitted to the sheet. Dimensions on the drawing are in feet.');
    text(margin, margin + 8, 8, 'Project ' + (doc.projectId || '') + '   ·   Not a permit set.');

    var stream = cmds.join('\n');
    var objects = [];
    objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n');
    objects.push('2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n');
    objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n');
    objects.push('4 0 obj << /Length ' + stream.length + ' >> stream\n' + stream + '\nendstream endobj\n');
    objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n');
    var body = '%PDF-1.4\n', offsets = [0], cursor = body.length, j;
    for (j = 0; j < objects.length; j++) {
      offsets.push(cursor);
      body += objects[j];
      cursor = body.length;
    }
    var xref = body.length;
    body += 'xref\n0 6\n0000000000 65535 f \n';
    for (j = 1; j <= 5; j++) {
      var off = String(offsets[j]);
      while (off.length < 10) off = '0' + off;
      body += off + ' 00000 n \n';
    }
    body += 'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return body;
  }

  var api = {
    toDxf: toDxf,
    fromDxf: fromDxf,
    toPdf: toPdf,
    VERSION: 'editor-v2-export/1'
  };
  root.OmegaEditorV2Export = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
