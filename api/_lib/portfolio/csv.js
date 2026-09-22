/* api/_lib/portfolio/csv.js — RFC 4180 parsing, forgiving about line endings
   and delimiters. © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
function parse(text, opts) {
  opts = opts || {};
  var s = String(text == null ? '' : text), rows = [], row = [], cell = '', q = false, i = 0, max = opts.maxRows || 5000;
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  var delim = opts.delimiter || detect(s);
  for (; i < s.length; i++) {
    var c = s.charAt(i);
    if (q) {
      if (c === '"') { if (s.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s.charAt(i + 1) === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(function (v) { return v.trim() !== ''; })) rows.push(row);
      row = [];
      if (rows.length >= max) break;
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(function (v) { return v.trim() !== ''; })) rows.push(row); }
  return rows;
}
function detect(s) {
  var head = s.split(/\r?\n/)[0] || '', counts = [[',', 0], [';', 0], ['\t', 0]];
  counts.forEach(function (c) { c[1] = head.split(c[0]).length - 1; });
  counts.sort(function (a, b) { return b[1] - a[1]; });
  return counts[0][1] > 0 ? counts[0][0] : ',';
}
function stringify(rows) {
  return rows.map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n') + '\r\n';
}
module.exports = { parse: parse, stringify: stringify, detect: detect };
