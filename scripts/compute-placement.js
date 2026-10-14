#!/usr/bin/env node
/* scripts/compute-placement.js — how much compute the EVCS sites can carry,
   site by site, by the platform's own rule.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Thomas, 2026-10-13: "an employee that is going to go and work through the
   EVCS list and determine how much compute we can place, how many pods". The
   Compute Project Development desk (jarvis agents/office/projectdev.md) runs
   this every run; a person can run it by hand. It reads the EVCS intake
   workbook (OSA_DC_intake_*.xlsx: one row per location) and writes a
   placement table. Nothing here is a new rule: the service derating is
   api/_lib/omega-core.js serviceKw, the skid is PRODUCT.meter (75 kW firm,
   135 kW at peak with the battery recharging) and the arithmetic is the
   power gate's (headroom ÷ firm kW, floor).

   What it does NOT do, on purpose: it never calls a utility, a county or a
   carrier, never writes to Firestore, and never calls a site "qualified"
   while its fiber is unverified or its host agreement does not allow
   compute. Those are the desk's gaps to work, named per site.

     node scripts/compute-placement.js --intake <OSA_DC_intake.xlsx> [--out work/placement] [--volts 480]

   Output: <out>/placement.csv, placement.json, summary.md. Offline. */
'use strict';
var fs = require('fs'), path = require('path');
var X = require('../api/_lib/portfolio/xlsx');
var OC = require('../api/_lib/omega-core');

function arg(k, d) { var i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
var INTAKE = arg('--intake'), OUT = arg('--out', 'work/placement'), VOLTS = Number(arg('--volts', 480)) || 480;
if (!INTAKE || !fs.existsSync(INTAKE)) { console.error('--intake <OSA_DC_intake.xlsx> is required'); process.exit(2); }

var M = OC.PRODUCT.meter;           /* { firmKw: 75, peakKw: 135, volts: 480, phases: 3, powerFactor: 0.95 } */
var MIN_SHA_YEARS = 5;              /* the skid's own minimum term */

function num(v) { if (v == null || v === '') return null; var n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }
function str(v) { return v == null ? '' : String(v).trim(); }

/* The intake's header row is the one that starts with "Location ID". */
var rows = X.sheetRows(fs.readFileSync(INTAKE), { maxRows: 5000 });
var hi = -1;
for (var i = 0; i < rows.length; i++) if (str(rows[i][0]).toLowerCase() === 'location id') { hi = i; break; }
if (hi < 0) { console.error('No "Location ID" header row found; is this the EVCS intake workbook?'); process.exit(3); }
var H = rows[hi].map(function (h) { return str(h).toLowerCase(); });
function col(re) { for (var c = 0; c < H.length; c++) if (re.test(H[c])) return c; return -1; }
var C = {
  id: col(/^location id/), name: col(/^location name/), street: col(/^street/), city: col(/^city/), state: col(/^state/),
  zip: col(/^zip/), county: col(/^county/), host: col(/account name/), shaTerm: col(/sha term/), shaLeft: col(/sha remaining/),
  type: col(/location type/), utility: col(/^utility$/), ownsMeter: col(/owns meter/), installed: col(/installed capacity/),
  swText: col(/switchgear size/), swAmps: col(/switchgear \(amps\)/), peak: col(/peak power/), carriers: col(/carriers/),
  zoning: col(/zoning/), acres: col(/usable/)
};

var sites = [], skipped = 0;
for (var r = hi + 1; r < rows.length; r++) {
  var row = rows[r], id = str(row[C.id]);
  if (!/^\d+$/.test(id)) { skipped++; continue; }
  var amps = num(row[C.swAmps]) || num(row[C.swText]);
  var peak = num(row[C.peak]), installed = num(row[C.installed]);
  var shaLeft = num(row[C.shaLeft]), ownsMeter = str(row[C.ownsMeter]);
  var svcKw = amps ? OC.serviceKw(amps, VOLTS, 3) : null;      /* derated continuous kW on the host's switchgear (480 V assumed) */
  var hostPeak = peak != null ? peak : (installed != null ? installed : null);
  var headroom = svcKw != null ? Math.max(0, svcKw - (hostPeak || 0)) : null;
  var skidsFirm = headroom != null ? Math.floor(headroom / M.firmKw) : null;
  var skidsPeak = headroom != null ? Math.floor(headroom / M.peakKw) : null;
  var fiber = str(row[C.carriers]) ? 'on-record-unverified' : 'unverified';
  var gaps = [];
  if (amps == null) gaps.push('no switchgear rating on record');
  if (peak == null) gaps.push(installed != null ? 'no measured peak (installed capacity used)' : 'no host load on record');
  if (!str(row[C.carriers])) gaps.push('fiber carriers blank');
  if (!str(row[C.zoning])) gaps.push('zoning blank');
  if (shaLeft == null) gaps.push('SHA remaining blank');
  else if (shaLeft < MIN_SHA_YEARS) gaps.push('SHA remaining ' + shaLeft.toFixed(1) + ' yr (< ' + MIN_SHA_YEARS + ')');
  if (ownsMeter !== '1' && ownsMeter.toLowerCase() !== 'yes' && ownsMeter.toLowerCase() !== 'true') gaps.push('host meter (new 480 V service for the skid is its own)');
  var verdict;
  if (skidsFirm != null && skidsFirm >= 1) verdict = (shaLeft != null && shaLeft >= MIN_SHA_YEARS) ? 'qualified-on-record' : 'needs-site-rights';
  else verdict = 'needs-utility';
  sites.push({
    locationId: id, name: str(row[C.name]), address: [str(row[C.street]), str(row[C.city]), str(row[C.state]), str(row[C.zip])].filter(Boolean).join(', '),
    county: str(row[C.county]), host: str(row[C.host]), locationType: str(row[C.type]), utility: str(row[C.utility]),
    evcsOwnsMeter: ownsMeter === '1' || /^(yes|true)$/i.test(ownsMeter), shaTermYears: num(row[C.shaTerm]), shaRemainingYears: shaLeft,
    switchgearAmps: amps, serviceKwDerated: svcKw != null ? Math.round(svcKw) : null, hostPeakKw: hostPeak, installedEvKw: installed,
    headroomKw: headroom != null ? Math.round(headroom) : null,
    skidsOnRecord: skidsFirm, skidsAtPeak: skidsPeak,
    skidsPitched: skidsFirm == null ? null : Math.min(2, skidsFirm),   /* the offer as sold: 75–150 kW a site, one or two skids */
    gpusOnRecord: skidsFirm != null ? skidsFirm * 48 : null,          /* 48 H100-class per 75 kW skid (omega-compute-model) */
    fiber: fiber, zoning: str(row[C.zoning]) || 'blank', verdict: verdict, gaps: gaps
  });
}

/* Rank: qualified first, then needs-site-rights, then needs-utility; within a verdict, by headroom. */
var order = { 'qualified-on-record': 0, 'needs-site-rights': 1, 'needs-utility': 2 };
sites.sort(function (a, b) { return (order[a.verdict] - order[b.verdict]) || ((b.headroomKw || 0) - (a.headroomKw || 0)); });

fs.mkdirSync(OUT, { recursive: true });
var cols = ['locationId', 'name', 'address', 'county', 'host', 'locationType', 'utility', 'evcsOwnsMeter', 'shaTermYears', 'shaRemainingYears',
  'switchgearAmps', 'serviceKwDerated', 'hostPeakKw', 'installedEvKw', 'headroomKw', 'skidsOnRecord', 'skidsAtPeak', 'skidsPitched', 'gpusOnRecord', 'fiber', 'zoning', 'verdict', 'gaps'];
function csv(v) { v = Array.isArray(v) ? v.join('; ') : (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
fs.writeFileSync(path.join(OUT, 'placement.csv'), [cols.join(',')].concat(sites.map(function (s) { return cols.map(function (c) { return csv(s[c]); }).join(','); })).join('\n') + '\n');
var totals = {
  sites: sites.length, skipped: skipped, voltsAssumed: VOLTS,
  qualifiedOnRecord: sites.filter(function (s) { return s.verdict === 'qualified-on-record'; }).length,
  needsSiteRights: sites.filter(function (s) { return s.verdict === 'needs-site-rights'; }).length,
  needsUtility: sites.filter(function (s) { return s.verdict === 'needs-utility'; }).length,
  withSwitchgear: sites.filter(function (s) { return s.switchgearAmps != null; }).length,
  fiberVerified: 0,
  skidsOnRecord: sites.reduce(function (t, s) { return t + (s.skidsOnRecord || 0); }, 0),
  skidsAtPeak: sites.reduce(function (t, s) { return t + (s.skidsAtPeak || 0); }, 0),
  skidsPitched: sites.reduce(function (t, s) { return t + (s.skidsPitched || 0); }, 0),
  evcsOwnsMeter: sites.filter(function (s) { return s.evcsOwnsMeter; }).length,
  shaUnder5: sites.filter(function (s) { return s.shaRemainingYears != null && s.shaRemainingYears < MIN_SHA_YEARS; }).length
};
totals.gpusOnRecord = totals.skidsOnRecord * 48;
totals.mwOnRecord = Math.round(totals.skidsOnRecord * M.firmKw / 10) / 100;
fs.writeFileSync(path.join(OUT, 'placement.json'), JSON.stringify({ asOf: new Date().toISOString(), source: path.basename(INTAKE), rule: 'api/_lib/omega-core.js serviceKw + PRODUCT.meter (75 kW firm / 135 kW peak per skid); 48 H100-class GPUs per skid', totals: totals, sites: sites }, null, 1));
var top = sites.slice(0, 25).map(function (s) {
  return '| ' + s.locationId + ' | ' + s.name + ' | ' + s.address + ' | ' + (s.switchgearAmps || '—') + ' A | ' + (s.headroomKw == null ? '—' : s.headroomKw) + ' | ' + (s.skidsOnRecord == null ? '—' : s.skidsOnRecord) + ' | ' + (s.shaRemainingYears == null ? '—' : s.shaRemainingYears.toFixed(1)) + ' | ' + s.verdict + ' |';
});
var md = [
  '# Compute placement on the EVCS list — ' + new Date().toISOString().slice(0, 10),
  '',
  'Source: `' + path.basename(INTAKE) + '` (' + totals.sites + ' locations; ' + skipped + ' non-site rows skipped). Rule: the host switchgear derated as `omega-core.js serviceKw` (' + VOLTS + ' V three-phase assumed; the workbook carries no voltage), minus the measured peak (installed EV kW where no peak is on record) = headroom; one Omega-Core skid is ' + M.firmKw + ' kW firm / ' + M.peakKw + ' kW at peak and carries 48 H100-class GPUs. The skid runs on its own meter; the host headroom is the evidence on record for what the site\'s utility feed can carry, not a will-serve.',
  '',
  '| | |', '|---|---|',
  '| Sites with a switchgear rating | ' + totals.withSwitchgear + ' of ' + totals.sites + ' |',
  '| Skids placeable on record (firm) | ' + totals.skidsOnRecord + ' (' + totals.mwOnRecord + ' MW, ' + totals.gpusOnRecord + ' GPUs) |',
  '| Skids placeable at peak draw | ' + totals.skidsAtPeak + ' |',
  '| Skids as pitched (at most 2 a site, 75–150 kW) | ' + totals.skidsPitched + ' (' + Math.round(totals.skidsPitched * M.firmKw / 10) / 100 + ' MW) |',
  '| qualified-on-record (≥1 skid, SHA ≥ ' + MIN_SHA_YEARS + ' yr) | ' + totals.qualifiedOnRecord + ' |',
  '| needs-site-rights (≥1 skid, SHA < ' + MIN_SHA_YEARS + ' yr or blank) | ' + totals.needsSiteRights + ' |',
  '| needs-utility (< 1 skid or no switchgear on record) | ' + totals.needsUtility + ' |',
  '| EVCS owns the meter | ' + totals.evcsOwnsMeter + ' |',
  '| SHA remaining under ' + MIN_SHA_YEARS + ' years | ' + totals.shaUnder5 + ' |',
  '| Fiber verified | ' + totals.fiberVerified + ' (the carrier column is blank for every site; fiber at 1 Gbps bidirectional is the hard gate and is UNVERIFIED everywhere) |',
  '',
  'NOT a qualification: every site above still needs (1) a utility will-serve for a new 480 V service, (2) fiber verified at the address, (3) zoning, and (4) a host agreement that allows compute (the SHA restricts use to charging; the EVCS–Solela/Infra cooperation agreement is with Legal). The verdict words are the only ones used.',
  '',
  '## Top 25 by verdict and headroom', '',
  '| ID | Site | Address | Switchgear | Headroom kW | Skids | SHA left | Verdict |', '|---|---|---|---|---|---|---|---|'
].concat(top).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
console.log(JSON.stringify(totals));
console.log('wrote ' + OUT + '/placement.csv, placement.json, summary.md');
