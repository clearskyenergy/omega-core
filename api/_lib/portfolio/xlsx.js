/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/xlsx.js — read the first worksheet of an .xlsx as rows,
   and write a workbook
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE, on top of zip.js. An .xlsx is a ZIP of XML; this reads the shared
   strings and the first sheet's cells into rows of strings. It is enough for
   a site list — it is not a spreadsheet engine: formulas are read by their
   cached value, styles are ignored. Anything richer, the customer sends CSV.
   The `xlsx` package in node_modules is extraneous (not in package.json) and
   would be missing in production, which is why this exists.

   THE ONE WRITER. workbook(spec) writes several sheets with a fixed house
   style (STYLES), column widths, frozen panes, a filter, merged cells and
   formulas that carry their cached value, so a preview that never
   recalculates still shows the numbers and Excel recalculates on open
   (fullCalcOnLoad). build(rows) is the upload template, one sheet of it.
   The Compute Site Pro Forma's portfolio workbook
   (api/_lib/compute-portfolio.js) is written here too.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var zip = require('./zip');

function fail(msg) { var e = new Error(msg); e.status = 400; throw e; }
function unescape(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&'); }
function textOf(xml) { return unescape(String(xml).replace(/<[^>]+>/g, '')); }
function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref || ''); if (!m) return 0; var n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }

function sheetRows(buf, opts) {
  opts = opts || {};
  var entries = zip.list(buf), byName = {};
  entries.forEach(function (e) { byName[e.name] = e; });
  var wbEntry = byName['xl/workbook.xml'];
  if (!wbEntry) fail('Not an Excel workbook (.xlsx)');
  var shared = [];
  if (byName['xl/sharedStrings.xml']) {
    var ss = zip.read(buf, byName['xl/sharedStrings.xml']).toString('utf8');
    var re = /<si>([\s\S]*?)<\/si>/g, m;
    while ((m = re.exec(ss))) shared.push(textOf(m[1]));
  }
  /* The first sheet in workbook order, resolved through the relationships. */
  var wb = zip.read(buf, wbEntry).toString('utf8'), sheetMatch = /<sheet [^>]*r:id="([^"]+)"[^>]*>/.exec(wb);
  var target = 'xl/worksheets/sheet1.xml';
  if (sheetMatch && byName['xl/_rels/workbook.xml.rels']) {
    var rels = zip.read(buf, byName['xl/_rels/workbook.xml.rels']).toString('utf8');
    var rel = new RegExp('<Relationship [^>]*Id="' + sheetMatch[1] + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + sheetMatch[1] + '"').exec(rels);
    if (rel) target = rel[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  var sheetEntry = byName[target] || byName['xl/worksheets/sheet1.xml'];
  if (!sheetEntry) fail('The workbook has no readable worksheet');
  var xml = zip.read(buf, sheetEntry).toString('utf8'), rows = [], rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g, r, max = opts.maxRows || 5000;
  while ((r = rowRe.exec(xml)) && rows.length < max) {
    var cells = [], cellRe = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
    while ((c = cellRe.exec(r[1]))) {
      var attrs = c[1], body = c[2] || '', ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1], type = (/t="([a-zA-Z]+)"/.exec(attrs) || [])[1], v = '';
      if (type === 's') { var idx = +textOf((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1] || '0'); v = shared[idx] != null ? shared[idx] : ''; }
      else if (type === 'inlineStr') v = textOf((/<is>([\s\S]*?)<\/is>/.exec(body) || [])[1] || '');
      else v = textOf((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1] || '');
      var col = colIndex(ref);
      while (cells.length < col) cells.push('');
      cells[col] = v;
    }
    if (cells.some(function (x) { return String(x).trim() !== ''; })) rows.push(cells);
  }
  return rows;
}
function isXlsx(buf) { return Buffer.isBuffer(buf) && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; }

/* ── THE WRITER ──────────────────────────────────────────────────────────
   spec = { sheets: [{ name, rows, cols, freeze, filter, merges, heights,
                       landscape, gridlines }], props: { title, creator,
                       created } }
   rows[r][c] is null (nothing), a number, a string, or
   { v, f, s }: v the value (a formula's cached result: a number, a string
   or an '#ERR!'-style error), f a formula without its '=', s a STYLES name.
   cols are widths in characters; freeze the first scrolling cell ('C5');
   filter and merges are ranges ('A4:X29'); heights { rowNumber: points }.
   Nothing here reads a clock: props.created comes from the caller. */
var FONTS = [
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="15"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>',
  '<font><i/><sz val="10"/><color rgb="FF526071"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="11"/><color rgb="FF1D4ED8"/><name val="Calibri"/><family val="2"/></font>',
  '<font><sz val="10"/><color rgb="FF526071"/><name val="Calibri"/><family val="2"/></font>'
];
var FILLS = [
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF4FF"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F5F8"/><bgColor indexed="64"/></patternFill></fill>'
];
var BORDERS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFCBD3DE"/></bottom><diagonal/></border>',
  '<border><left/><right/><top style="thin"><color rgb="FF334155"/></top><bottom/><diagonal/></border>'
];
/* Custom formats from 164; 0 General, 3 #,##0, 2 0.00, 10 0.00% are built in. */
var NUMFMTS = {
  164: '"$"#,##0;\\("$"#,##0\\);"-"',
  165: '0.00%;\\(0.00%\\);"-"',
  166: '0.00"x"',
  167: '#,##0.0',
  168: '0.0',
  169: '0.0%;\\(0.0%\\);"-"',
  170: '"$"#,##0.00;\\("$"#,##0.00\\);"-"'
};
var NUM = { int: 3, dec1: 167, dec2: 2, money: 164, cents: 170, pct: 165, pct1: 169, moic: 166, yrs: 168 };
/* name -> [numFmtId, fontId, fillId, borderId, alignment] */
var STYLES = { text: [0, 0, 0, 0, ''] };
(function () {
  STYLES.wrap = [0, 0, 0, 0, '<alignment vertical="top" wrapText="1"/>'];
  STYLES.title = [0, 2, 0, 0, ''];
  STYLES.note = [0, 3, 0, 0, '<alignment vertical="top" wrapText="1"/>'];
  STYLES.section = [0, 4, 0, 0, ''];
  STYLES.label = [0, 1, 0, 0, '<alignment vertical="top" wrapText="1"/>'];
  STYLES.muted = [0, 5, 0, 0, '<alignment vertical="top" wrapText="1"/>'];
  STYLES.head = [0, 1, 2, 1, '<alignment vertical="bottom" wrapText="1"/>'];
  STYLES.headR = [0, 1, 2, 1, '<alignment horizontal="right" vertical="bottom" wrapText="1"/>'];
  STYLES.headC = [0, 1, 2, 1, '<alignment horizontal="center" vertical="bottom" wrapText="1"/>'];
  STYLES.textR = [0, 0, 0, 0, '<alignment horizontal="right"/>'];
  STYLES.center = [0, 0, 0, 0, '<alignment horizontal="center"/>'];
  STYLES.textT = [0, 1, 3, 2, ''];
  STYLES.textRT = [0, 1, 3, 2, '<alignment horizontal="right"/>'];
  STYLES.centerT = [0, 1, 3, 2, '<alignment horizontal="center"/>'];
  Object.keys(NUM).forEach(function (k) {
    STYLES[k] = [NUM[k], 0, 0, 0, ''];
    STYLES[k + 'T'] = [NUM[k], 1, 3, 2, ''];
  });
})();
var STYLE_NAMES = Object.keys(STYLES);

function xesc(s) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function colName(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
function cellRef(c, r) { return colName(c) + r; }
/* 'C5' -> { c: 2, r: 5 } */
function parseRef(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref || ''); return m ? { c: colIndex(m[1]), r: +m[2] } : null; }
/* A sheet name as a formula writes it: 'After-tax cash flow'!A1. */
function sheetRef(name) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : "'" + String(name).replace(/'/g, "''") + "'"; }
function safeSheetName(name, i) {
  var s = String(name || '').replace(/[\[\]:*?\/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31);
  return s || ('Sheet' + (i + 1));
}
function isNum(v) { return typeof v === 'number' && isFinite(v); }

function cellXml(ref, cell) {
  var o = cell !== null && typeof cell === 'object' ? cell : { v: cell };
  var si = o.s ? STYLE_NAMES.indexOf(o.s) : 0, s = si > 0 ? ' s="' + si + '"' : '';
  if (o.f) {
    var f = '<f>' + xesc(String(o.f).replace(/^=/, '')) + '</f>';
    if (isNum(o.v)) return '<c r="' + ref + '"' + s + '>' + f + '<v>' + o.v + '</v></c>';
    if (typeof o.v === 'string' && /^#[A-Z0-9\/]+[!?]?$/.test(o.v)) return '<c r="' + ref + '"' + s + ' t="e">' + f + '<v>' + xesc(o.v) + '</v></c>';
    if (typeof o.v === 'string') return '<c r="' + ref + '"' + s + ' t="str">' + f + '<v>' + xesc(o.v) + '</v></c>';
    return '<c r="' + ref + '"' + s + '>' + f + '</c>';
  }
  if (isNum(o.v)) return '<c r="' + ref + '"' + s + '><v>' + o.v + '</v></c>';
  if (o.v != null && o.v !== '' && typeof o.v !== 'number') {
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(o.v) + '</t></is></c>';
  }
  return si > 0 ? '<c r="' + ref + '"' + s + '/>' : '';
}

function sheetXml(sh, first) {
  var rows = sh.rows || [], maxC = 0, body = '', heights = sh.heights || {};
  rows.forEach(function (row, ri) {
    var cells = '', r = ri + 1;
    (row || []).forEach(function (cell, ci) {
      if (cell == null) return;
      var x = cellXml(cellRef(ci, r), cell);
      if (x) { cells += x; if (ci + 1 > maxC) maxC = ci + 1; }
    });
    var ht = heights[r] ? ' ht="' + heights[r] + '" customHeight="1"' : '';
    if (cells || ht) body += '<row r="' + r + '"' + ht + '>' + cells + '</row>';
  });
  var dim = rows.length && maxC ? 'A1:' + cellRef(maxC - 1, rows.length) : 'A1';
  var view = '<sheetView' + (sh.gridlines === false ? ' showGridLines="0"' : '') + (first ? ' tabSelected="1"' : '') + ' workbookViewId="0"';
  var fz = parseRef(sh.freeze);
  if (fz && (fz.c > 0 || fz.r > 1)) {
    var xs = fz.c, ys = fz.r - 1, pane = xs && ys ? 'bottomRight' : (ys ? 'bottomLeft' : 'topRight');
    view += '><pane' + (xs ? ' xSplit="' + xs + '"' : '') + (ys ? ' ySplit="' + ys + '"' : '') + ' topLeftCell="' + sh.freeze +
      '" activePane="' + pane + '" state="frozen"/><selection pane="' + pane + '" activeCell="' + sh.freeze + '" sqref="' + sh.freeze + '"/></sheetView>';
  } else view += '/>';
  var cols = '';
  (sh.cols || []).forEach(function (w, i) {
    if (isNum(w) && w > 0) cols += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
  });
  var merges = (sh.merges || []).map(function (m) { return '<mergeCell ref="' + xesc(m) + '"/>'; });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    (sh.landscape ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
    '<dimension ref="' + dim + '"/><sheetViews>' + view + '</sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? '<cols>' + cols + '</cols>' : '') +
    '<sheetData>' + body + '</sheetData>' +
    (sh.filter ? '<autoFilter ref="' + xesc(sh.filter) + '"/>' : '') +
    (merges.length ? '<mergeCells count="' + merges.length + '">' + merges.join('') + '</mergeCells>' : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    (sh.landscape ? '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : '') +
    '</worksheet>';
}

function stylesXml() {
  var ids = Object.keys(NUMFMTS);
  var xfs = STYLE_NAMES.map(function (k) {
    var d = STYLES[k];
    return '<xf numFmtId="' + d[0] + '" fontId="' + d[1] + '" fillId="' + d[2] + '" borderId="' + d[3] + '" xfId="0"' +
      (d[0] ? ' applyNumberFormat="1"' : '') + (d[1] ? ' applyFont="1"' : '') + (d[2] ? ' applyFill="1"' : '') + (d[3] ? ' applyBorder="1"' : '') +
      (d[4] ? ' applyAlignment="1">' + d[4] + '</xf>' : '/>');
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="' + ids.length + '">' + ids.map(function (id) { return '<numFmt numFmtId="' + id + '" formatCode="' + xesc(NUMFMTS[id]) + '"/>'; }).join('') + '</numFmts>' +
    '<fonts count="' + FONTS.length + '">' + FONTS.join('') + '</fonts>' +
    '<fills count="' + FILLS.length + '">' + FILLS.join('') + '</fills>' +
    '<borders count="' + BORDERS.length + '">' + BORDERS.join('') + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

function workbook(spec) {
  spec = spec || {};
  var props = spec.props || {}, seen = {};
  var sheets = (spec.sheets || []).map(function (sh, i) {
    var name = safeSheetName(sh.name, i), base = name, n = 2;
    while (seen[name.toLowerCase()]) name = base.slice(0, 28) + ' ' + (n++);
    seen[name.toLowerCase()] = true;
    var o = {}; for (var k in sh) if (Object.prototype.hasOwnProperty.call(sh, k)) o[k] = sh[k];
    o.name = name;
    return o;
  });
  if (!sheets.length) sheets.push({ name: 'Sheet1', rows: [] });
  var MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var defined = sheets.map(function (sh, i) {
    return sh.filter ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' + xesc(sheetRef(sh.name) + '!' +
      String(sh.filter).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')) + '</definedName>' : '';
  }).join('');
  var files = [
    { name: '[Content_Types].xml', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map(function (sh, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
    { name: '_rels/.rels', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + REL + '/extended-properties" Target="docProps/app.xml"/></Relationships>' },
    { name: 'docProps/core.xml', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      (props.title ? '<dc:title>' + xesc(props.title) + '</dc:title>' : '') + (props.creator ? '<dc:creator>' + xesc(props.creator) + '</dc:creator>' : '') +
      (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(props.created || '') ? '<dcterms:created xsi:type="dcterms:W3CDTF">' + props.created + '</dcterms:created>' : '') +
      '</cp:coreProperties>' },
    { name: 'docProps/app.xml', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>' + xesc(props.application || 'ClearSky-OMEGA') + '</Application></Properties>' },
    { name: 'xl/workbook.xml', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="' + MAIN + '" xmlns:r="' + REL + '">' +
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000" activeTab="0"/></bookViews><sheets>' +
      sheets.map(function (sh, i) { return '<sheet name="' + xesc(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets>' + (defined ? '<definedNames>' + defined + '</definedNames>' : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (sh, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + REL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + REL + '/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', bytes: stylesXml() }
  ];
  sheets.forEach(function (sh, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', bytes: sheetXml(sh, i === 0) }); });
  return zip.build(files, { deflate: true });
}

/* The upload template: one sheet of plain rows. */
function build(rows) { return workbook({ sheets: [{ name: 'Sites', rows: rows }] }); }

module.exports = { sheetRows: sheetRows, isXlsx: isXlsx, build: build, workbook: workbook, colName: colName, cellRef: cellRef, sheetRef: sheetRef, STYLES: STYLE_NAMES };
