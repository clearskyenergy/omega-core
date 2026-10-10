/* scripts/tests/tportfolioassets-real.js — the same acceptance checks against
   the REAL, PRIVATE EVCS workbooks. © 2025–2026 ClearSky Energy Solutions LLC.

   Never commit the workbooks (.gitignore lists their names). Run with paths
   outside the repository:

     EVCS_WB1_PATH=/secure/COMPUTE_DC_intake_2026-10-07_formatted(1).xlsx \
     EVCS_WB2_PATH=/secure/EVCS_Solela_Site_Model.xlsx \
     node scripts/tests/tportfolioassets-real.js

   Without EVCS_WB1_PATH it prints SKIP and exits 0, so it can sit in CI.
   Expected values are the spec's audited counts (§3.3–3.4, §13). Output never
   prints site names, addresses or account labels — IDs and counts only. */
'use strict';
var fs = require('fs'), crypto = require('crypto'), assert = require('assert');
var AS = require('../../api/_lib/portfolio/assets'), X = require('../../api/_lib/portfolio/xlsx');
var WB1 = process.env.EVCS_WB1_PATH, WB2 = process.env.EVCS_WB2_PATH;
var FINGERPRINT = { wb1: 'f601bbcdb0a92c9a55a743ad2701a3c06092988124d20d19877bfb0177807bd6', wb2: 'b21d530023fd7916107b88005eef8f6c29f165f299cd6ddcc88485e9f6f02ea3' };
if (!WB1) { console.log('SKIP real-workbook tests: set EVCS_WB1_PATH (and EVCS_WB2_PATH) to the private files'); process.exit(0); }
var passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } }
var buf = fs.readFileSync(WB1), sha = crypto.createHash('sha256').update(buf).digest('hex');
console.log(sha === FINGERPRINT.wb1 ? 'WB1 fingerprint matches the audited version' : 'NOTE: WB1 fingerprint differs from the audited version; counts below may legitimately differ');
var u = AS.readUpload({ name: require('path').basename(WB1), bytes: buf }), by = {};
u.records.forEach(function (r) { by[r.externalSiteId] = r; });
function count(fn) { return u.records.filter(fn).length; }
t('T01 profile, header row 3, 49 columns, rows 4–295, footer row 297', function () { assert.equal(u.profile, 'evcs-intake-v1'); assert.equal(u.meta.headerRow, 3); assert.equal(u.meta.columns, 49); assert.equal(u.meta.firstDataRow, 4); assert.equal(u.meta.lastDataRow, 295); assert(u.meta.footer.some(function (f) { return f.row === 297; })); });
t('T01 292 unique IDs; CA 212 / OR 46 / WA 34', function () { assert.equal(u.records.length, 292); var s = {}; u.records.forEach(function (r) { s[r.address.state] = (s[r.address.state] || 0) + 1; }); assert.deepEqual(s, { CA: 212, OR: 46, WA: 34 }); });
t('Installed nameplate 50,839.5 kW', function () { var k = 0; u.records.forEach(function (r) { if (r.facts.installedChargerKw) k += r.facts.installedChargerKw.value; }); assert.equal(Math.round(k * 10) / 10, 50839.5); });
t('Missing evidence 61 / 145 / 11 / 21 / 9', function () { assert.deepEqual(['utility', 'rateSchedule', 'reportedPowerKw', 'switchgearAmps', 'shaRemainingYears'].map(function (k) { return count(function (r) { return !r.facts[k]; }); }), [61, 145, 11, 21, 9]); });
t('T05 meter true/false/blank 153 / 136 / 3 (blanks 196, 202, 400)', function () { assert.equal(count(function (r) { return r.facts.evcsOwnsMeter && r.facts.evcsOwnsMeter.value === true; }), 153); assert.equal(count(function (r) { return r.facts.evcsOwnsMeter && r.facts.evcsOwnsMeter.value === false; }), 136); assert.deepEqual(u.records.filter(function (r) { return !r.facts.evcsOwnsMeter; }).map(function (r) { return r.externalSiteId; }).sort(), ['196', '202', '400']); });
t('T05 revenue share stored as fraction (no value above 1)', function () { assert(!u.records.some(function (r) { return r.facts.revShare && r.facts.revShare.value > 1; })); });
t('46 zero remaining terms flagged for agreement review', function () { assert.equal(count(function (r) { return r.flags.some(function (f) { return f.code === 'TERM_ZERO_REVIEW'; }); }), 46); });
t('T06 definition footer retained', function () { assert(u.meta.definitionNotes.length >= 1); });
t('T07 eleven missing power → unable, legacy zero separate', function () { var m = u.records.filter(function (r) { return !r.facts.reportedPowerKw; }); assert.equal(m.length, 11); m.forEach(function (r) { assert.equal(r.opportunity.legacyProxy.status, 'unable'); assert.strictEqual(r.opportunity.legacyProxy.legacyHistoricalPods, 0); }); });
t('T08 the fifteen power > installed IDs exactly', function () { assert.deepEqual(u.records.filter(function (r) { return r.flags.some(function (f) { return f.code === 'POWER_EXCEEDS_INSTALLED'; }); }).map(function (r) { return r.externalSiteId; }).sort(), ['423', '426', '429', '440', '442', '458', '466', '471', '472', '474', '475', '478', '479', '483', '493']); });
t('Swinomish example (ID 415, row 7): 11 pods / 825 kW IT / 990 kW facility (proxy)', function () { var lp = by['415'].opportunity.legacyProxy; assert.equal(by['415'].row, 7); assert.equal(lp.pods, 11); assert.equal(lp.itKw, 825); assert.equal(lp.facilityKw, 990); });
t('Legacy proxy parity preview (Phase 2 T09): 90 sites / 215 pods / 16,125 kW IT; meter-term 40 sites / 124 pods / 9,300 kW', function () {
  var lp = u.records.map(function (r) { return r.opportunity.legacyProxy; });
  assert.equal(lp.filter(function (x) { return x.pods > 0; }).length, 90); assert.equal(lp.reduce(function (t, x) { return t + (x.pods || 0); }, 0), 215); assert.equal(lp.reduce(function (t, x) { return t + (x.itKw || 0); }, 0), 16125);
  assert.equal(lp.filter(function (x) { return x.meterTermPods > 0; }).length, 40); assert.equal(lp.reduce(function (t, x) { return t + (x.meterTermPods || 0); }, 0), 124);
});
if (WB2) {
  var b2 = fs.readFileSync(WB2), s2 = crypto.createHash('sha256').update(b2).digest('hex');
  console.log(s2 === FINGERPRINT.wb2 ? 'WB2 fingerprint matches the audited version' : 'NOTE: WB2 fingerprint differs from the audited version');
  t('WB2 is a five-sheet analysis package (Phase 2 imports it; here: recognised, not imported as sites)', function () { var info = X.inspect(b2); X.assertSafe(info); ['Summary', 'Inputs', 'Monthly', 'Portfolio', '10 Sites'].forEach(function (n) { assert(info.sheets.some(function (s) { return s.name === n; }), 'sheet ' + n); }); });
} else console.log('SKIP WB2 checks: EVCS_WB2_PATH not set');
console.log('portfolio assets (real workbooks): ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
