/* scripts/fixtures/evcs-wb1-synthetic.js — a SYNTHETIC workbook in the shape
   of the EVCS site intake (WB1). © 2025–2026 ClearSky Energy Solutions LLC.

   NOT CUSTOMER DATA. Names, addresses, utilities and values are generated
   from a fixed seed. What is reproduced is the SHAPE and the import traps
   the asset register must survive (docs/PORTFOLIO-ASSET-MANAGER-PLAN.md §7):
   sheet "Intake", title + merged group headings, headers on row 3, 292 site
   rows (4–295), a blank row and a source/definition footer on row 297, 49
   columns A–AW, CA 212 / OR 46 / WA 34, installed nameplate 50,839.5 kW,
   whole-percent revenue share, TRUE/FALSE/blank meter flags (153/136/3, the
   three blanks on IDs 202, 400, 196), 61/145/11/21/9 missing utility /
   tariff / power / switchgear-amps / remaining-term cells, 46 zero remaining
   terms, the power header/footer conflict, and reported power above
   installed kW on the fifteen listed IDs. The real workbooks stay private;
   scripts/tests/tportfolioassets-real.js runs against them when supplied. */
'use strict';
var X = require('../../api/_lib/portfolio/xlsx');
var E = require('../../api/_lib/portfolio/evcs');

var DISCREPANCY = [472, 474, 475, 478, 479, 483, 493, 423, 426, 429, 440, 442, 458, 466, 471];
var BLANK_METER = [202, 400, 196];
var SHORTLIST = [130, 330, 399, 476, 397, 491, 378, 353, 381, 415];
var FOOTER = 'Source: synthetic fixture modelled on the EVCS intake. p95 avg power = 95th percentile of 15-minute average site power over the last six months, idle intervals excluded. Installed capacity is charger nameplate (L2+L3).';

function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function build(opts) {
  opts = opts || {};
  var R = rng(20261007), required = DISCREPANCY.concat(BLANK_METER, SHORTLIST), ids = required.slice();
  for (var n = 100; ids.length < 292; n++) if (ids.indexOf(n) < 0) ids.push(n);
  /* deterministic shuffle, then Swinomish-like 415 on row 7 */
  for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
  ids.splice(ids.indexOf(415), 1); ids.splice(3, 0, 415);
  var N = ids.length, special = function (id) { return required.indexOf(id) >= 0; };
  var states = ids.map(function (_, k) { return k < 212 ? 'CA' : k < 258 ? 'OR' : 'WA'; });
  var pool = ids.filter(function (id) { return !special(id); });
  function pick(count, from, salt) { var r = rng(salt), a = from.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a.slice(0, count); }
  var noPower = pick(11, pool, 11), noUtility = pick(61, ids, 61), noTariff = pick(145, ids, 145), noAmps = pick(21, ids, 21);
  var noTerm = pick(9, pool.filter(function (x) { return noPower.indexOf(x) < 0; }), 9), zeroTerm = pick(46, pool.filter(function (x) { return noTerm.indexOf(x) < 0; }), 46);
  var meterTrue = SHORTLIST.slice().concat(pick(153 - SHORTLIST.length, ids.filter(function (x) { return BLANK_METER.indexOf(x) < 0 && SHORTLIST.indexOf(x) < 0; }), 153));
  var sharedAddr = pool.filter(function (x) { return noPower.indexOf(x) < 0 && ids.indexOf(x) < 212; }).slice(0, 2);
  var rows = [], installedTotal = 0;
  ids.forEach(function (id, k) {
    var inst = id === 415 ? 1343 : Math.round((50 + R() * 230) * 2) / 2, power;
    if (id === 415) power = 134.8;
    else if (noPower.indexOf(id) >= 0) power = null;
    else if (DISCREPANCY.indexOf(id) >= 0) power = Math.round(inst * (1.1 + R() * 0.6) * 10) / 10;
    else power = Math.round(inst * (0.05 + R() * 0.4) * 10) / 10;
    installedTotal += inst;
    var term = 10, rem = noTerm.indexOf(id) >= 0 ? null : zeroTerm.indexOf(id) >= 0 ? 0 : SHORTLIST.indexOf(id) >= 0 ? 6 + Math.round(R() * 8 * 10) / 10 : Math.max(0.1, Math.round(R() * 10 * 10) / 10);
    if (rem === 0 && SHORTLIST.indexOf(id) >= 0) rem = 6;
    var meter = BLANK_METER.indexOf(id) >= 0 ? null : meterTrue.indexOf(id) >= 0;
    var street = sharedAddr.indexOf(id) >= 0 ? '100 Shared Plaza Way' : (100 + id) + ' Synthetic ' + ['Ave', 'St', 'Rd', 'Blvd'][id % 4];
    var city = sharedAddr.indexOf(id) >= 0 ? 'Fixture City' : 'Town ' + (id % 37), zip = sharedAddr.indexOf(id) >= 0 ? '90001' : states[k] === 'CA' ? String(90000 + id) : states[k] === 'OR' ? String(97000 + id) : String(98000 + id);
    var cells = [String(id), 'Synthetic Site ' + id, street, city, states[k], zip, 'County ' + (id % 11), null, null, null,
      'Host Account ' + (id % 23), term, rem, ['Hotel', 'Retail', 'Casino', 'Parking', 'Fuel'][id % 5],
      noUtility.indexOf(id) >= 0 ? null : ['PG&E', 'SCE', 'PGE', 'PSE', 'SDG&E'][id % 5], noTariff.indexOf(id) >= 0 ? null : ['B-19', 'TOU-GS-2', 'Sch 85', 'E-19'][id % 4], 'Utility portal export',
      meter, inst, noAmps.indexOf(id) >= 0 ? '' : (400 + (id % 4) * 200) + 'A 480V 3ph', noAmps.indexOf(id) >= 0 ? null : 400 + (id % 4) * 200, power,
      id % 7 === 0 ? 'Requested' : null, null, null, null, null, null,
      id % 3 === 0 ? 450 : null, id % 3 === 1 ? 6 : null, id % 5 === 0 ? 0.02 : null];
    while (cells.length < 49) cells.push(null);
    rows.push({ id: id, cells: cells });
  });
  /* hit the reference nameplate total exactly, on a non-special site */
  var fixId = pool[pool.length - 1], fix = rows.filter(function (r) { return r.id === fixId; })[0], diff = 50839.5 - installedTotal;
  fix.cells[18] = Math.round((fix.cells[18] + diff) * 2) / 2;
  if (fix.cells[18] <= 0) throw new Error('fixture nameplate adjustment went non-positive');
  if (fix.cells[21] != null && fix.cells[21] > fix.cells[18]) fix.cells[21] = Math.round(fix.cells[18] * 0.3 * 10) / 10;
  /* one formula cell with a cached value: read, never evaluated */
  rows[10].cells[18] = { f: 'ROUND(' + rows[10].cells[18] + ',1)', v: rows[10].cells[18] };
  if (typeof opts.mutate === 'function') opts.mutate(rows);
  if (opts.reorder) rows.reverse();
  var title = ['COMPUTE DC intake — SYNTHETIC FIXTURE (not customer data)'];
  var groups = []; groups[0] = 'Site'; groups[7] = 'Land'; groups[10] = 'Host agreement'; groups[14] = 'Utility & power'; groups[23] = 'Fiber & entitlements'; groups[28] = 'Economics'; groups[31] = 'Diligence';
  for (var g = 0; g < 49; g++) if (groups[g] === undefined) groups[g] = null;
  var sheetRows = [{ r: 1, cells: title }, { r: 2, cells: groups }, { r: 3, cells: E.COLUMNS.map(function (c) { return c.header; }) }]
    .concat(rows.map(function (row, k) { return { r: 4 + k, cells: row.cells }; }))
    .concat([{ r: 4 + rows.length + 1, cells: [FOOTER] }]);
  var book = X.buildBook([{ name: 'Intake', rows: sheetRows }, { name: 'Notes', rows: [{ r: 1, cells: ['Synthetic fixture notes'] }] }], { externalLink: !!opts.externalLink, macro: !!opts.macro });
  return { buffer: book, ids: ids.map(String), rows: rows, expected: { sites: 292, states: { CA: 212, OR: 46, WA: 34 }, installedKw: 50839.5, meter: { true: 153, false: 136, unknown: 3 }, missing: { utility: 61, rateSchedule: 145, reportedPowerKw: 11, switchgearAmps: 21, shaRemainingYears: 9 }, zeroTerm: 46,
    discrepancy: DISCREPANCY.map(String), blankMeter: BLANK_METER.map(String), noPower: noPower.map(String), sharedAddress: sharedAddr.map(String), headerRow: 3, footerRow: 297, columns: 49 } };
}
module.exports = { build: build, DISCREPANCY: DISCREPANCY, BLANK_METER: BLANK_METER, SHORTLIST: SHORTLIST, FOOTER: FOOTER };
if (require.main === module) { var out = build(); require('fs').writeFileSync(process.argv[2] || '/tmp/evcs-wb1-synthetic.xlsx', out.buffer); console.log('wrote', process.argv[2] || '/tmp/evcs-wb1-synthetic.xlsx', out.buffer.length, 'bytes'); }
