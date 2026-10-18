#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The analysis harness and the bugs it is there to keep fixed. */
'use strict';
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '../..');
var C = require(path.join(ROOT, 'api/_lib/analysis-checks'));
var H = require(path.join(ROOT, 'api/_lib/hosting-capacity'));
var Rates = require(path.join(ROOT, 'api/_lib/utility-rates'));
var Screen = require(path.join(ROOT, 'omega-demand-screen'));
var count = 0;

var report = C.run({ now: new Date('2026-10-17T15:00:00Z') });
assert.equal(report.ok, true, JSON.stringify(report.checks.filter(function (c) { return !c.ok; }), null, 2));
count++;
assert.ok(report.summary.errors === 0);
assert.ok(report.checks.some(function (c) { return c.id === 'ref.pjm.capacity.4h' && c.ok; }));
assert.ok(report.checks.some(function (c) { return c.id === 'ref.bill.flat' && c.ok; }));
assert.ok(report.checks.some(function (c) { return c.id === 'ref.demand-screen' && c.ok; }));
count += 3;

/* The old screen added (ratchet − 0.5) × the full-year saving. At ComEd's
   0.70 ratchet that was a 20% overstatement. */
var shaved = Screen.savings({ peakKw: 200, shavePct: 0.25, demandRate: 19.85, peakHours: 4, ratchet: 0.7 });
assert.equal(shaved.shaveKW, 50);
assert.equal(shaved.annualSavingsDemand, 11910);
assert.equal(shaved.ratchetSavings, 0);
assert.equal(shaved.totalAnnualSavings, 11910);
assert.equal(shaved.battKWh, 200);
count += 5;
var basis = Screen.basis({ annualBill: 120000, demandRate: 20, energyRate: 0.1, demandBillPct: 0.4 });
assert.equal(basis.peakKw, 200);
assert.equal(basis.annualEnergyKwh, 720000);
count += 2;

var stale = C.run({ now: new Date('2027-06-01T00:00:00Z'), staleDays: 45, errorDays: 400 });
var read = stale.checks.filter(function (c) { return c.id === 'freshness.incentive-reads'; })[0];
assert.equal(read.ok, false);
assert.equal(read.severity, 'warn');
var comedFar = stale.checks.filter(function (c) { return c.id === 'freshness.comed-service'; })[0];
assert.equal(comedFar.severity, 'error', 'a hosting-service name several months behind is an error');
count += 3;
var expired = C.run({ now: new Date('2027-06-01T00:00:00Z'), staleDays: 45, errorDays: 180 });
var dead = expired.checks.filter(function (c) { return c.id === 'freshness.incentive-reads'; })[0];
assert.equal(dead.severity, 'error');
assert.equal(expired.ok, false);
count += 2;

var ng = H.normalize('ng-ma-feeder', { attributes: {
  feeder_cdf: '05_01_11J314', substation_name: 'FARADAYSTREET11',
  feeder_max_hc: 1.1, feeder_min_hc: 0.1, feeder_queued_dg: 0, feeder_installed_dg: 0.01452,
  feeder_voltage: 4.16, hca_refresh_date: '10/02/2026'
} });
assert.equal(ng.pvKw, 1100);
assert.equal(ng.pvMinKw, 100);
assert.equal(ng.installedKw, 14.52);
assert.equal(ng.queuedKw, 0);
assert.equal(ng.voltageKv, 4.16);
count += 5;
var ny = H.normalize('ng-ny-feeder', { attributes: {
  Master_CDF: '36_01_12161', substation_bank_name: '121 CLINTON ST TB 1',
  feeder_max_hc: 2, feeder_min_hc: 0.2, feeder_voltage: 4.8,
  hca_refresh_date: 1774915200000
} });
assert.equal(ny.feederId, '36_01_12161');
assert.equal(ny.substation, '121 CLINTON ST TB 1');
assert.equal(ny.pvKw, 2000);
assert.equal(ny.pvMinKw, 200);
assert.equal(ny.asOf, '2026-03-31');
count += 5;
var nyUrl = H.queryUrl('ng-ny-feeder', 42.87, -78.77);
assert.match(nyUrl, /outFields=Master_CDF/);
assert.equal(nyUrl.indexOf('feeder_cdf'), -1);
count += 2;
var pge = H.normalize('pge-grip', { attributes: {
  FeederId: '022011121', FeederName: 'SF X (MISSION) 1121', LoadCapacity_kW: 315,
  GenCapacity_kW: null, voltage_kv: 12, Last_Update_On_Map: 1785601543000
} });
assert.equal(pge.loadKw, 315);
assert.equal(pge.genKw, null);
assert.equal(pge.feederId, '022011121');
assert.ok(/^2026-/.test(pge.asOf));
count += 4;
var url = H.queryUrl('pge-grip', 37.77, -122.42);
assert.match(url, /^https:\/\/services2\.arcgis\.com\//);
assert.match(url, /geometry=-122\.42%2C37\.77/);
assert.throws(function () { H.queryUrl('nope', 1, 2); });
count += 3;

var ed = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
assert.ok(ed.indexOf('ratchet - 0.5') < 0, 'the editor still adds a second ratchet credit');
assert.ok(ed.indexOf('/omega-demand-screen.js') > 0);
assert.ok(ed.indexOf('OmegaDemandScreen.basis') > 0);
assert.ok(ed.indexOf('OmegaDemandScreen.savings') > 0);
count += 4;
var zipMatch = ed.match(/const _FOM_ZIP3_STATE = (\[[\s\S]*?\n\]);/);
assert.ok(zipMatch, 'editor ZIP table');
var editorZip = JSON.parse(JSON.stringify(vm.runInNewContext('(' + zipMatch[1] + ')')));
assert.deepEqual(editorZip, Rates._tables.zip3);
count += 2;

assert.equal(Rates.lookup('62201').key, 'ameren');
assert.equal(Rates.lookup('61201').key, 'midamerican');
assert.equal(Rates.lookup('02903').name, 'Rhode Island Energy');
assert.equal(Rates.stateForZip('05501'), 'MA');
assert.equal(Rates.isComedZip('60915'), true);
assert.equal(Rates.isComedZip('61201'), false);
count += 6;

console.log('tanalysisvalidate: ' + count + ' assertions passed');
