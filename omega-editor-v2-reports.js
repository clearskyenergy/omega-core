/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Reports from the drawing. Every figure names where it came from.
 * A number that is not on the drawing is left blank. Nothing here is a
 * price, a tariff, or an IRR.
 */
(function (root) {
  'use strict';

  function intelligence() { return root.OmegaProjectIntelligence; }
  var MILESTONES = [
    { id: 'control', name: 'Site control' },
    { id: 'interconnection', name: 'Interconnection' },
    { id: 'permitting', name: 'Permitting' },
    { id: 'procurement', name: 'Procurement lead time' },
    { id: 'construction', name: 'Construction' },
    { id: 'cod', name: 'Commercial operation' }
  ];

  function pdfEscape(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?');
  }
  function line(text, size) { return { text: String(text), size: size || 11 }; }
  function source(text) { return { text: 'Source: ' + text, size: 9 }; }

  function pdf(lines) {
    var pageW = 612, pageH = 792, margin = 54, pages = [], current = [], y = pageH - margin, i, item, size, leading;
    for (i = 0; i < lines.length; i++) {
      item = typeof lines[i] === 'string' ? { text: lines[i], size: 11 } : lines[i];
      size = item.size || 11;
      leading = size + 5;
      if (y - leading < margin && current.length) { pages.push(current); current = []; y = pageH - margin; }
      current.push({ text: item.text, size: size, x: margin, y: y - size });
      y -= leading;
    }
    if (current.length || !pages.length) pages.push(current);
    var objects = [];
    objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n');
    var kids = [], p, stream, contentId, pageId;
    for (p = 0; p < pages.length; p++) {
      pageId = 3 + p * 2;
      contentId = pageId + 1;
      kids.push(pageId + ' 0 R');
    }
    objects.push('2 0 obj << /Type /Pages /Count ' + pages.length + ' /Kids [' + kids.join(' ') + '] >> endobj\n');
    var fontId = 3 + pages.length * 2;
    for (p = 0; p < pages.length; p++) {
      pageId = 3 + p * 2;
      contentId = pageId + 1;
      var cmds = ['0 0 0 rg'];
      for (i = 0; i < pages[p].length; i++) {
        item = pages[p][i];
        cmds.push('BT /F1 ' + item.size + ' Tf ' + item.x.toFixed(1) + ' ' + item.y.toFixed(1) + ' Td (' + pdfEscape(item.text) + ') Tj ET');
      }
      stream = cmds.join('\n');
      objects.push(pageId + ' 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] /Contents ' + contentId + ' 0 R /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> >> endobj\n');
      objects.push(contentId + ' 0 obj << /Length ' + stream.length + ' >> stream\n' + stream + '\nendstream endobj\n');
    }
    objects.push(fontId + ' 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n');
    var body = '%PDF-1.4\n', offsets = [0], cursor = body.length, j;
    for (j = 0; j < objects.length; j++) {
      offsets.push(cursor);
      body += objects[j];
      cursor = body.length;
    }
    var xref = body.length, size = objects.length + 1;
    body += 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (j = 1; j < size; j++) {
      var off = String(offsets[j]);
      while (off.length < 10) off = '0' + off;
      body += off + ' 00000 n \n';
    }
    body += 'trailer << /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return body;
  }

  function head(facts, title) {
    return [
      line(title, 16),
      line(facts.name || 'Untitled site', 13),
      line(facts.address || 'No address on the drawing', 11),
      source('the project name and the address on the drawing'),
      line(' ', 8)
    ];
  }
  function blank(what) { return [line(what, 11), source('not on this drawing')]; }

  function bomRows(doc) {
    var map = {}, order = [], i, e, k, row;
    var list = (doc && doc.entities) || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type !== 'equip') continue;
      k = (e.key || 'equip') + '|' + (e.label || '');
      if (!map[k]) {
        map[k] = { key: e.key || '', label: e.label || e.key || 'Equipment', qty: 0, kw: 0, kwh: 0 };
        order.push(k);
      }
      row = map[k];
      row.qty++;
      row.kw += +e.kw || 0;
      row.kwh += +e.kwh || 0;
    }
    var out = [];
    for (i = 0; i < order.length; i++) out.push(map[order[i]]);
    return out;
  }

  function rom(facts) {
    var lines = head(facts, 'ROM / feasibility');
    lines.push(line('Solar  ' + (facts.solarKw || 0) + ' kW-DC', 12));
    lines.push(source('modules placed on the drawing'));
    lines.push(line('Storage  ' + (facts.bessKw || 0) + ' kW / ' + (facts.bessKwh || 0) + ' kWh', 12));
    lines.push(source('battery nameplates on the drawing'));
    lines.push(line('Chargers  ' + (facts.chargerCount || 0) + (facts.chargerKw ? ('  ·  ' + facts.chargerKw + ' kW') : ''), 12));
    lines.push(source('chargers placed on the drawing'));
    if (facts.derKw > 0) {
      lines.push(line('DER nameplate  ' + facts.derKw + ' kW', 12));
      lines.push(source('the DER blocks placed by the guided build'));
    }
    if (facts.cost > 0) {
      lines.push(line('Installed estimate  $' + Math.round(facts.cost).toLocaleString(), 12));
      lines.push(source('the cost stored on this project'));
    } else lines = lines.concat(blank('No installed estimate is stored on this project.'));
    return pack('rom', 'ROM / feasibility', facts, lines);
  }
  function valueStack(facts) {
    var lines = head(facts, 'Value stack');
    var vs = facts.valueStack;
    if (vs && vs.streams && vs.streams.length) {
      var i, s, max = 0;
      for (i = 0; i < vs.streams.length; i++) if (+vs.streams[i].usd > max) max = +vs.streams[i].usd;
      for (i = 0; i < vs.streams.length; i++) {
        s = vs.streams[i];
        lines.push(line((s.name || 'Stream') + '   $' + Math.round(+s.usd || 0).toLocaleString(), 12));
      }
      lines.push(source(vs.source || 'the value-stack run stored on this project'));
    } else {
      lines.push(line('Battery on the drawing: ' + (facts.bessKw || 0) + ' kW / ' + (facts.bessKwh || 0) + ' kWh.', 11));
      lines = lines.concat(blank('No dispatch is stored. The revenue streams are a server run, and this drawing does not have one.'));
    }
    return pack('valuestack', 'Value stack', facts, lines);
  }
  function memo(facts) {
    var lib = intelligence();
    var x = (lib && lib.assess(facts)) || { score: 0, decision: '', checks: [], scenarios: [], weights: {} };
    var lines = head(facts, 'Project intelligence');
    lines.push(line(x.decision + '   ' + x.score + ' / 100', 14));
    lines.push(source('readiness ' + Math.round(x.weights.readiness * 100) + '%, site quality ' + Math.round(x.weights.site * 100) + '%, economics ' + Math.round(x.weights.economics * 100) + '%. Site quality is the site screen when one is stored.'));
    var i, c;
    for (i = 0; i < (x.checks || []).length; i++) {
      c = x.checks[i];
      lines.push(line((c.ok ? 'Yes  ' : 'No   ') + c.n + '  —  ' + c.d, 11));
    }
    lines.push(line(' ', 8));
    if (facts.cost > 0 && facts.revenue > 0) {
      lines.push(line('Three cases. Simple payback is net cost divided by year-one value. It is not an IRR.', 11));
      for (i = 0; i < x.scenarios.length; i++) {
        c = x.scenarios[i];
        lines.push(line(c.name + '   $' + Math.round(c.cost).toLocaleString() + '   $' + Math.round(c.revenue).toLocaleString() + '/yr   ' + (c.paybackYears != null ? (c.paybackYears.toFixed(1) + ' yr') : ''), 11));
      }
      lines.push(source('the cost and the year-one value stored on this project, scaled the way Project Intelligence scales them'));
    } else lines = lines.concat(blank('No cost and no year-one value, so the three cases are blank.'));
    return pack('memo', 'Project intelligence', facts, lines);
  }
  function schedule(facts) {
    var lines = head(facts, 'Project schedule');
    var dates = facts.milestones || {};
    var i, m, when;
    lines.push(line('The six milestones a funding package asks for, in order.', 11));
    for (i = 0; i < MILESTONES.length; i++) {
      m = MILESTONES[i];
      when = dates[m.id] ? String(dates[m.id]) : 'not set';
      lines.push(line((i + 1) + '   ' + m.name + '   ' + when, 12));
    }
    lines.push(source('a date is printed only when the project has one. No duration is assumed.'));
    return pack('schedule', 'Project schedule', facts, lines);
  }
  function proforma(facts) {
    var lines = head(facts, 'IRR / pro forma');
    if (!(facts.cost > 0 && facts.revenue > 0)) {
      lines = lines.concat(blank('IRR, NPV, and payback need a cost and a year-one value. Neither is stored as a complete pair.'));
      lines.push(line('An IRR is produced by the value stack. None is stored on this drawing.', 11));
      return pack('proforma', 'Pro forma', facts, lines);
    }
    var x = intelligence().assess(facts);
    var base = x.scenarios[1];
    lines.push(line('Simple payback   ' + (base.paybackYears != null ? (base.paybackYears.toFixed(1) + ' years') : '—'), 12));
    lines.push(line('Cash on cash, year one   ' + (base.cashOnCash != null ? ((base.cashOnCash * 100).toFixed(1) + '%') : '—'), 12));
    lines.push(source('net cost divided by the year-one value stored on this project. This is not an IRR and not an NPV.'));
    lines.push(line('IRR is produced by the value stack. ' + (facts.valueStack && facts.valueStack.irr != null ? (facts.valueStack.irr + ' is the stored figure.') : 'None is stored on this drawing.'), 11));
    if (facts.valueStack && facts.valueStack.irr != null) lines.push(source('the value-stack run stored on this project'));
    return pack('proforma', 'Pro forma', facts, lines);
  }
  function bom(facts, doc) {
    var lines = head(facts, 'Bill of materials');
    var rows = bomRows(doc), i, r;
    if (!rows.length) lines = lines.concat(blank('No equipment is on the drawing.'));
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      lines.push(line(r.qty + '   ' + r.label + (r.kw ? ('   ' + r.kw + ' kW') : '') + (r.kwh ? (' / ' + r.kwh + ' kWh') : ''), 11));
    }
    lines.push(source('counted from the equipment on the drawing. No prices.'));
    return pack('bom', 'Bill of materials', facts, lines);
  }
  function cost(facts) {
    var lines = head(facts, 'Cost estimate');
    var rows = facts.costLines || [], i;
    if (facts.cost > 0) {
      lines.push(line('Total   $' + Math.round(facts.cost).toLocaleString(), 13));
      lines.push(source('the cost stored on this project'));
    }
    if (!rows.length && !(facts.cost > 0)) lines = lines.concat(blank('No cost lines are stored. The cost model runs on the server.'));
    for (i = 0; i < rows.length; i++) {
      lines.push(line((rows[i].name || 'Line') + '   ' + (rows[i].usd != null ? ('$' + Math.round(+rows[i].usd).toLocaleString()) : ''), 11));
    }
    if (rows.length) lines.push(source('the cost lines stored on this project'));
    return pack('cost', 'Cost estimate', facts, lines);
  }

  var KINDS = {
    rom: { title: 'ROM / feasibility', build: rom },
    valuestack: { title: 'Value stack', build: valueStack },
    memo: { title: 'Investment memo', build: memo },
    schedule: { title: 'Project schedule', build: schedule },
    proforma: { title: 'Pro forma', build: proforma },
    bom: { title: 'Bill of materials', build: bom },
    cost: { title: 'Cost estimate', build: cost }
  };

  function pack(id, title, facts, lines) {
    return { id: id, title: title, filename: (facts.name || 'site').replace(/[^\w.-]+/g, '-') + '-' + id + '.pdf', lines: lines, pdf: pdf(lines) };
  }
  function build(kind, facts, doc) {
    var spec = KINDS[kind];
    if (!spec) return null;
    if (kind === 'bom') return bom(facts, doc);
    return spec.build(facts, doc);
  }
  function list() {
    var out = [], k;
    for (k in KINDS) if (Object.prototype.hasOwnProperty.call(KINDS, k)) out.push({ id: k, title: KINDS[k].title });
    return out;
  }

  var api = { build: build, list: list, pdf: pdf, milestones: MILESTONES, VERSION: 'editor-v2-reports/1' };
  root.OmegaEditorV2Reports = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
