/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/xlsx.js — read the first worksheet of an .xlsx as rows
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE, on top of zip.js. An .xlsx is a ZIP of XML; this reads the shared
   strings and the first sheet's cells into rows of strings. It is enough for
   a site list — it is not a spreadsheet engine: formulas are read by their
   cached value, styles are ignored. Anything richer, the customer sends CSV.
   The `xlsx` package in node_modules is extraneous (not in package.json) and
   would be missing in production, which is why this exists.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var zip = require('./zip');

function fail(msg) { var e = new Error(msg); e.status = 400; throw e; }
function unescape(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&'); }
function textOf(xml) { return unescape(String(xml).replace(/<[^>]+>/g, '')); }
/* Strict-OOXML/.NET writers prefix every element (<x:sheet>, <x:row>, <x:c>):
   drop element prefixes so one set of patterns reads both. Attributes such as
   r:id are untouched. Found on a real EVCS model workbook, 2026-10-10. */
function unprefix(xml) { return String(xml).replace(/<(\/?)[A-Za-z][A-Za-z0-9]*:(?=[A-Za-z])/g, '<$1'); }
function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref || ''); if (!m) return 0; var n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }

function sheetRows(buf, opts) {
  opts = opts || {};
  var entries = zip.list(buf), byName = {};
  entries.forEach(function (e) { byName[e.name] = e; });
  var wbEntry = byName['xl/workbook.xml'];
  if (!wbEntry) fail('Not an Excel workbook (.xlsx)');
  var shared = [];
  if (byName['xl/sharedStrings.xml']) {
    var ss = unprefix(zip.read(buf, byName['xl/sharedStrings.xml']).toString('utf8'));
    var re = /<si>([\s\S]*?)<\/si>/g, m;
    while ((m = re.exec(ss))) shared.push(textOf(m[1]));
  }
  /* The first sheet in workbook order, resolved through the relationships. */
  var wb = unprefix(zip.read(buf, wbEntry).toString('utf8')), sheetMatch = /<sheet [^>]*r:id="([^"]+)"[^>]*>/.exec(wb);
  var target = 'xl/worksheets/sheet1.xml';
  if (sheetMatch && byName['xl/_rels/workbook.xml.rels']) {
    var rels = unprefix(zip.read(buf, byName['xl/_rels/workbook.xml.rels']).toString('utf8'));
    var rel = new RegExp('<Relationship [^>]*Id="' + sheetMatch[1] + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + sheetMatch[1] + '"').exec(rels);
    if (rel) target = rel[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  var sheetEntry = byName[target] || byName['xl/worksheets/sheet1.xml'];
  if (!sheetEntry) fail('The workbook has no readable worksheet');
  var xml = unprefix(zip.read(buf, sheetEntry).toString('utf8')), rows = [], rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g, r, max = opts.maxRows || 5000;
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

/* A minimal writer (one sheet, inline strings) so the template can be offered
   as .xlsx and tests can round-trip without a spreadsheet library. */
function build(rows) {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function ref(c, r) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s + r; }
  var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    + rows.map(function (row, ri) { return '<row r="' + (ri + 1) + '">' + row.map(function (v, ci) { return typeof v === 'number' ? '<c r="' + ref(ci, ri + 1) + '"><v>' + v + '</v></c>' : '<c r="' + ref(ci, ri + 1) + '" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>'; }).join('') + '</row>'; }).join('')
    + '</sheetData></worksheet>';
  return zip.build([
    { name: '[Content_Types].xml', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sites" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', bytes: sheet }
  ]);
}

/* ── Workbook inspection and a positional grid (Portfolio & Assets, 2026-10) ──
   The asset register needs three things sheetRows() deliberately drops: the
   SHEET NAMES (an import profile is recognised by its sheet/header signature,
   not its filename), the REAL ROW NUMBER of every row (provenance points at a
   cell, e.g. Intake!V7, and blank rows must not shift it), and a REFUSAL of
   active content. A workbook carrying macros (vbaProject.bin), external
   workbook links, OLE objects or ActiveX is rejected before a cell is read;
   formulas are never evaluated, only their cached value is taken, and the
   count of formula cells is reported so the importer can say so. */
function inspect(buf) {
  var entries = zip.list(buf), names = entries.map(function (e) { return e.name; }), byName = {};
  entries.forEach(function (e) { byName[e.name] = e; });
  if (!byName['xl/workbook.xml']) fail('Not an Excel workbook (.xlsx)');
  var wb = unprefix(zip.read(buf, byName['xl/workbook.xml']).toString('utf8')), rels = byName['xl/_rels/workbook.xml.rels'] ? unprefix(zip.read(buf, byName['xl/_rels/workbook.xml.rels']).toString('utf8')) : '';
  var sheets = [], re = /<sheet ([^>]*?)\/?>/g, m;
  while ((m = re.exec(wb))) {
    var a = m[1], name = unescape((/name="([^"]*)"/.exec(a) || [])[1] || ''), rid = (/r:id="([^"]+)"/.exec(a) || [])[1], target = null;
    if (rid && rels) { var rel = new RegExp('<Relationship [^>]*Id="' + rid + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + rid + '"').exec(rels); if (rel) target = rel[1].replace(/^\/?(xl\/)?/, 'xl/'); }
    sheets.push({ name: name, target: target || ('xl/worksheets/sheet' + (sheets.length + 1) + '.xml') });
  }
  return {
    sheets: sheets,
    macros: names.some(function (n) { return /vbaProject\.bin$/i.test(n) || /^xl\/macrosheets\//i.test(n); }),
    externalLinks: names.some(function (n) { return /^xl\/externalLinks\//i.test(n); }) || /TargetMode="External"[^>]*Type="[^"]*externalLink/i.test(rels) || /externalLink/i.test(rels),
    activeContent: names.some(function (n) { return /^xl\/(activeX|embeddings)\//i.test(n); }),
    names: names
  };
}
function assertSafe(info) {
  if (info.macros) fail('This workbook contains macros. Save it as a plain .xlsx (no macros) and upload again.');
  if (info.externalLinks) fail('This workbook links to other workbooks. Break the external links (or paste values) and upload again.');
  if (info.activeContent) fail('This workbook contains embedded objects or ActiveX controls. Remove them and upload again.');
}
/* One sheet as positional rows: [{ r: <1-based row>, cells: [string] }].
   Booleans read as 'TRUE'/'FALSE' (so a blank cell and FALSE stay distinct);
   a formula contributes only its cached value. */
function sheetGrid(buf, opts) {
  opts = opts || {};
  var info = inspect(buf); assertSafe(info);
  var byName = {}; zip.list(buf).forEach(function (e) { byName[e.name] = e; });
  var shared = [];
  if (byName['xl/sharedStrings.xml']) { var ss = unprefix(zip.read(buf, byName['xl/sharedStrings.xml']).toString('utf8')), sre = /<si>([\s\S]*?)<\/si>/g, sm; while ((sm = sre.exec(ss))) shared.push(textOf(sm[1].replace(/<rPh[\s\S]*?<\/rPh>/g, ''))); }
  var sheet = opts.sheet ? info.sheets.filter(function (s) { return s.name === opts.sheet; })[0] : info.sheets[0];
  if (!sheet) fail('The workbook has no sheet named ' + String(opts.sheet).slice(0, 60));
  var entry = byName[sheet.target];
  if (!entry) fail('The workbook has no readable worksheet');
  var xml = unprefix(zip.read(buf, entry).toString('utf8')), rows = [], rowRe = /<row([^>]*)>([\s\S]*?)<\/row>/g, r, max = opts.maxRows || 5000, formulas = 0, seq = 0;
  while ((r = rowRe.exec(xml)) && rows.length < max) {
    seq++;
    var rn = +((/\br="(\d+)"/.exec(r[1]) || [])[1] || seq); seq = rn;
    var cells = [], cellRe = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
    while ((c = cellRe.exec(r[2]))) {
      var attrs = c[1], body = c[2] || '', ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1], type = (/t="([a-zA-Z]+)"/.exec(attrs) || [])[1], v = '';
      if (/<f[ >\/]/.test(body)) formulas++;
      var cached = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
      if (type === 's') { v = shared[+textOf(cached || '0')]; if (v == null) v = ''; }
      else if (type === 'inlineStr') v = textOf((/<is>([\s\S]*?)<\/is>/.exec(body) || [])[1] || '');
      else if (type === 'b') v = cached == null ? '' : (textOf(cached) === '1' ? 'TRUE' : 'FALSE');
      else if (type === 'e') v = '';
      else v = cached == null ? '' : textOf(cached);
      var col = ref ? colIndex(ref) : cells.length;
      while (cells.length < col) cells.push('');
      cells[col] = v;
    }
    rows.push({ r: rn, cells: cells });
  }
  return { sheet: sheet.name, sheets: info.sheets.map(function (s) { return s.name; }), rows: rows, formulas: formulas };
}
function colName(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
/* A multi-sheet writer for fixtures: sheets = [{ name, rows: [{ r, cells }] }];
   a cell may be a string, number, boolean, null (absent) or { f, v } (a
   formula with a cached value). opts.externalLink / opts.macro add the parts
   the reader must refuse, so the refusal itself is testable. */
function buildBook(sheets, opts) {
  opts = opts || {};
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cell(v, ci, r) {
    var ref = colName(ci) + r;
    if (v == null || v === '') return '';
    if (typeof v === 'object' && v.f) return '<c r="' + ref + '"' + (typeof v.v === 'number' ? '' : ' t="str"') + '><f>' + esc(v.f) + '</f><v>' + esc(v.v) + '</v></c>';
    if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
    if (typeof v === 'number') return '<c r="' + ref + '"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>';
  }
  var files = [], ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
  var wbSheets = '', rels = '';
  sheets.forEach(function (sh, i) {
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      sh.rows.map(function (row) { return '<row r="' + row.r + '">' + row.cells.map(function (v, ci) { return cell(v, ci, row.r); }).join('') + '</row>'; }).join('') + '</sheetData></worksheet>';
    files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', bytes: xml });
    ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    wbSheets += '<sheet name="' + esc(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    rels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
  });
  if (opts.externalLink) { files.push({ name: 'xl/externalLinks/externalLink1.xml', bytes: '<externalLink/>' }); rels += '<Relationship Id="rIdX" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="externalLinks/externalLink1.xml"/>'; }
  if (opts.macro) files.push({ name: 'xl/vbaProject.bin', bytes: Buffer.from('not really vba') });
  ct += '</Types>';
  return zip.build([
    { name: '[Content_Types].xml', bytes: ct },
    { name: '_rels/.rels', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbSheets + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', bytes: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>' }
  ].concat(files));
}
module.exports = { sheetRows: sheetRows, isXlsx: isXlsx, build: build, inspect: inspect, assertSafe: assertSafe, sheetGrid: sheetGrid, buildBook: buildBook, colName: colName, colIndex: colIndex };
