#!/usr/bin/env node
/* Regression tests for omega-site-intel.js.  node scripts/test-site-intel.js
   Fixtures are trimmed from real site KMZs — the naming quirks are the point,
   so do not "tidy" them.  © 2025–2026 ClearSky Energy Solutions LLC. */
'use strict';
global.window = global;
const SI = require('../omega-site-intel.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}
const kml = (body) => `<?xml version="1.0"?><kml><Document>${body}</Document></kml>`;
const pt   = (n, c) => `<Placemark><name>${n}</name><Point><coordinates>${c}</coordinates></Point></Placemark>`;
const line = (n, c) => `<Placemark><name>${n}</name><LineString><coordinates>${c}</coordinates></LineString></Placemark>`;

/* A ~640 ac square near Deggendorf-free Texas latitudes, closed. */
const RING = '-98.0000,32.0000,0 -97.9700,32.0000,0 -97.9700,32.0230,0 -98.0000,32.0230,0 -98.0000,32.0000,0';

/* ── the classifier vocabulary, taken off live files ─────────────────── */
const C = (n, type, coords) => SI.classify({ type, coords: coords || [[0,0],[1,1]], props:{name:n} });

ok('345kV parses (the old \\bkv\\b rule could not)', C('345kV PNM','line').attrs.kv === 345);
ok('owner survives voltage stripping',              C('138kV AEP TX north','line').attrs.owner === 'AEP TX north');
ok('2/345kV on a LINE is two circuits',             C('2/345kV PNM','line').attrs.circuits === 2, C('2/345kV PNM','line').attrs);
ok('69/138kV on a POINT is a transformer',          C('69/138kV AEP sub','point').attrs.kvLow === 69 &&
                                                    C('69/138kV AEP sub','point').attrs.kvHigh === 138);
ok('a bare SUB is a substation of unknown voltage', C('SUB','point').kind === 'substation' &&
                                                    C('SUB','point').attrs.kvUnknown === true);
ok('"layout" is a parcel',                          C('layout','line').kind === 'parcel');
ok('"aerial" is a parcel',                          C('aerial','line').kind === 'parcel');
ok('an acreage pin is a label, not a place',        C('1,203 acres','point').kind === 'acreage_label' &&
                                                    C('1,203 acres','point').attrs.acres === 1203);
ok('natural gas is an asset',                       C('natural gas - West texas gas utility, llc - 4.5"','line').kind === 'pipeline_gas');
ok('crude oil is a hazard, not fuel',               C('crude oil - MAGELLAN PIPELINE COMPANY, L.P. - 20"','line').kind === 'pipeline_hazard');
ok('HVL is a hazard',                               C('highly volatile liquid - ENTERPRISE - 30"','line').kind === 'pipeline_hazard');
ok('gen-tie is not a transmission line',            C('gen-tie','line').kind === 'gentie');

/* THE ENTITY BUG: KML escapes the inch mark, so diameters read as null and
   every gas line scored zero on a site that had three. */
ok('diameter parses through &quot;', (function () {
  const p = SI.parseKML(kml(line('natural gas, Williams mlp operating llc, 5.56&quot;', '-98,32,0 -97.99,32,0')));
  return SI.classify(p.features[0]).attrs.diameterIn === 5.56;
})());

/* ── acreage: stated vs traced, default lower over 5% ─────────────────────
   The fixtures are derived from the ring's own measured area rather than
   hardcoded. A hardcoded figure only tests that I did the arithmetic right
   when writing the test, and the first version of this file got it wrong by
   a factor of three while the engine was correct. */
const RING_AC = SI.geo.areaAcres(SI.parseKML(kml(line('layout', RING))).features[0].coords);
ok('the fixture ring measures a sane area', RING_AC > 1 && RING_AC < 1e6, RING_AC);

(function () {
  const agree = Math.round(RING_AC * 1.02);            /* 2% out: inside tolerance */
  const near = SI.intake(SI.parseKML(kml(line('layout', RING) + pt(agree + ' acres','-98,32,0'))).features, 't');
  ok('within 5%: the stated figure stands', Math.round(near.grossAcres) === agree, near.grossAcres);
  ok('within 5%: nothing is flagged', !near.flags.some(f => f.code === 'acreage_discrepancy'));

  /* Stated HIGHER than traced by 30% — the direction that matters, because it
     is the one where believing the seller costs you land you do not have. */
  const over = Math.round(RING_AC * 1.30);
  const hi = SI.intake(SI.parseKML(kml(line('layout', RING) + pt(over + ' acres','-98,32,0'))).features, 't');
  ok('stated over traced: takes the traced figure', Math.round(hi.grossAcres) === Math.round(RING_AC), hi.grossAcres);
  ok('stated over traced: and says so', hi.flags.some(f => f.code === 'acreage_discrepancy'));

  /* Stated LOWER than traced — the deed says less than the polygon. Still
     defaults down; a ring drawn wide must not create acreage. */
  const under = Math.round(RING_AC * 0.70);
  const lo = SI.intake(SI.parseKML(kml(line('layout', RING) + pt(under + ' acres','-98,32,0'))).features, 't');
  ok('traced over stated: still takes the lower', Math.round(lo.grossAcres) === under, lo.grossAcres);
})();

/* Two rings over the same ground are one parcel, not two. */
(function () {
  const dup = SI.intake(SI.parseKML(kml(line('layout', RING) + line('Boundary', RING) + pt('640 acres','-98,32,0'))).features, 't');
  ok('overlapping rings are not double-counted', dup.parcelRings.length === 1, dup.parcelRings.length);
  ok('and the overlap is flagged', dup.flags.some(f => f.code === 'overlapping_parcels'));
})();

/* ── the hazard band ──────────────────────────────────────────────────── */
(function () {
  /* A 30" HVL line ~120 ft off the boundary. The old test was "distance < 1 m",
     which called five such lines on one real site clean. */
  const near = '-98.0004,32.0000,0 -98.0004,32.0230,0';
  const s = SI.intake(SI.parseKML(kml(line('layout', RING) + pt('640 acres','-98,32,0') +
    line('highly volatile liquid - ENTERPRISE - 30"', near))).features, 't');
  ok('a hazard just off the line counts as on-parcel', s.hazardOnParcel === 1, s.hazardOnParcel);
  ok('and its setback comes off the buildable area',   s.buildableCeilingAcres < s.grossAcres);
  ok('and it is flagged',                              s.flags.some(f => f.code === 'hazard_pipeline_on_site'));
})();

/* ── the score is ordered and bounded ─────────────────────────────────── */
(function () {
  const site = (v, sub) => SI.gridScore(SI.intake(SI.parseKML(kml(
    line('layout', RING) + pt('640 acres','-98,32,0') +
    line(v + 'kV UTIL', '-98.001,32.0000,0 -98.001,32.0230,0') +
    pt(sub + ' UTIL sub', '-98.002,32.011,0'))).features, 't'));
  const a = site(345, '69/345'), b = site(138, '69/138'), c = site(69, '69');
  ok('345 kV outranks 138 outranks 69', a.score > b.score && b.score > c.score, [a.score,b.score,c.score]);
  ok('score stays within 0..100', [a,b,c].every(x => x.score >= 0 && x.score <= 100));
  ok('components are shown, so the number is auditable', a.components.length >= 5);
  ok('evidence is never claimed as verified', a.evidence === 'kmz_traced');

  const bare = SI.gridScore(SI.intake(SI.parseKML(kml(line('layout', RING))).features, 't'));
  ok('a file with no grid scores low and says why', bare.score < 40 && bare.confidence === 'low', bare.score);
})();

console.log((fail ? '✗' : '✓') + ' site-intel: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
