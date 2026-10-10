/* scripts/fixtures/evcs-wb2-synthetic.js — a SYNTHETIC model package in the
   shape of the EVCS revised model (WB2): Summary / Inputs / Monthly /
   Portfolio / 10 Sites, written with x:-prefixed XML elements like the real
   file's writer. NOT CUSTOMER DATA: derived from the synthetic WB1 with the
   legacy proxy. © 2025–2026 ClearSky Energy Solutions LLC. */
'use strict';
var X = require('../../api/_lib/portfolio/xlsx'), Z = require('../../api/_lib/portfolio/zip'), AS = require('../../api/_lib/portfolio/assets'), W1 = require('./evcs-wb1-synthetic');
function build() {
  var u = AS.readUpload({ name: 'wb1.xlsx', bytes: W1.build().buffer });
  var port = [{ r: 2, cells: ['All sites: screening only (SYNTHETIC)'] }, { r: 4, cells: ['ID', 'Site', 'State', 'Source row', 'EVCS meter', 'SHA years left', 'Installed kW', 'Reported peak kW', 'EV reserve kW', 'Screen kW', '75 kW pods', 'IT kW', 'Facility kW', 'Meter + term pods', 'Readiness'] }];
  u.records.forEach(function (r, i) { var lp = r.opportunity.legacyProxy, f = function (k) { return r.facts[k] ? r.facts[k].value : 0; };
    port.push({ r: 5 + i, cells: [r.externalSiteId, r.name, r.address.state, r.row, f('evcsOwnsMeter') === true ? 1 : 0, f('shaRemainingYears'), f('installedChargerKw'), f('reportedPowerKw'), lp.reserveKw || 0, lp.screenKw || 0, lp.legacyHistoricalPods, (lp.legacyHistoricalPods || 0) * 75, (lp.legacyHistoricalPods || 0) * 90, lp.meterTermPods || 0, 'unconfirmed'] }); });
  var short = u.records.filter(function (r) { return r.opportunity.legacyProxy.meterTermPods > 0; }).slice(0, 3);
  var ten = [{ r: 4, cells: ['ID', 'Site', 'Pods', 'IT kW', 'BESS kW', 'BESS usable kWh', 'Investor capital'] }].concat(short.map(function (r, i) { var p = r.opportunity.legacyProxy.pods; return { r: 5 + i, cells: [r.externalSiteId, r.name, p, p * 75, p * 90, p * 180, p * 2111375] }; }));
  var tp = short.reduce(function (a, r) { return a + r.opportunity.legacyProxy.pods; }, 0);
  ten.push({ r: 5 + short.length, cells: ['', 'TOTAL', tp, tp * 75, tp * 90, tp * 180, tp * 2111375] });
  var book = X.buildBook([
    { name: 'Summary', rows: [{ r: 4, cells: ['Metric', 'One pod', 'Sample'] }, { r: 5, cells: ['Investor capital', 2111375, tp * 2111375] }] },
    { name: 'Inputs', rows: [{ r: 4, cells: ['Driver', 'Value', 'Basis / source'] }, { r: 5, cells: ['IT capacity per pod (kW)', 75, 'synthetic'] }, { r: 6, cells: ['PUE', 1.2, 'synthetic'] }] },
    { name: 'Monthly', rows: [{ r: 4, cells: ['Month', 'GPU revenue'] }, { r: 5, cells: [0, 0] }, { r: 6, cells: [1, 100] }] },
    { name: 'Portfolio', rows: port }, { name: '10 Sites', rows: ten }]);
  /* rewrite element tags with an x: prefix, as the real writer does */
  var files = Z.extract(book).map(function (f) { return /\.xml$/.test(f.name) && /^xl\/(workbook|worksheets\/)/.test(f.name) ? { name: f.name, bytes: f.bytes.toString('utf8').replace(/<(\/?)(workbook|sheets|sheet|worksheet|sheetData|row|c|v|is|t|f)([\s>\/])/g, '<$1x:$2$3') } : f; });
  return { buffer: Z.build(files), shortlist: short.map(function (r) { return r.externalSiteId; }), shortlistPods: tp };
}
module.exports = { build: build };
