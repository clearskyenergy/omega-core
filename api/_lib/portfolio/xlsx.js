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
module.exports = { sheetRows: sheetRows, isXlsx: isXlsx, build: build };
