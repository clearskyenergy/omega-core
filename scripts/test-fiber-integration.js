#!/usr/bin/env node
/* Structural tests for the fiber-evidence integration in editor.html and
   grid-atlas.html, plus the shared library's boundary mode.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY STRUCTURAL
   editor.html has no module boundary to import, so the invariants that
   actually break are asserted against the source. Two of them are bug classes
   this repo has already been bitten by:

     1. saveProject()'s payload is an ALLOWLIST, not a spread of S. A field set
        by a saveProject wrapper is never written — S.omegaVersion is set by
        OmegaVersion.stamp() and provably never persists.
     2. A field saved without a matching restore line in _loadProject is
        written forever and read never.

   node scripts/test-fiber-integration.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

const ed = R('editor.html');

/* ── persistence: both halves, or the data is a leak ──────────────────── */
ok('omegaFiber is in the save payload literal', /^\s*omegaFiber:\s+S\.omegaFiber/m.test(ed));
ok('omegaFiberAt is in the save payload literal', /^\s*omegaFiberAt:\s+S\.omegaFiberAt/m.test(ed));
ok('omegaFiber is restored in _loadProject', /S\.omegaFiber\s*=\s*\(d\.omegaFiber/.test(ed));
ok('omegaFiberAt is restored in _loadProject', /S\.omegaFiberAt\s*=\s*d\.omegaFiberAt/.test(ed));
/* The payload literal and the restore block must both mention it — a save
   without a restore is the exact failure this pins. */
ok('save and restore are both present, not just one',
   /omegaFiber:\s+S\.omegaFiber/.test(ed) && /S\.omegaFiber\s*=\s*\(d\.omegaFiber/.test(ed));

/* ── staleness ────────────────────────────────────────────────────────── */
ok('_npxSiteKey exists', /function _npxSiteKey\(\)/.test(ed));
ok('the stored record carries the site key', /siteKey:_npxSiteKey\(\)/.test(ed));
ok('a key mismatch raises the stale banner', /prev\.siteKey!==_npxSiteKey\(\)/.test(ed));
ok('the key covers the boundary ring, not only the point',
   /ring:'\+ring\.length/.test(ed) || /'ring:'\+ring\.length/.test(ed));

/* ── unknowns are stored as unknowns ──────────────────────────────────── */
ok('siteHasFiber is stored null, never false', /siteHasFiber:null/.test(ed));
ok('availableCapacityGbps is stored null, never 0', /availableCapacityGbps:null/.test(ed));
ok('serviceability defaults to unconfirmed', /serviceability:PF\.site_serviceability\|\|'unconfirmed'/.test(ed));

/* ── the boundary path is wired end to end ────────────────────────────── */
ok('editor builds a ring', /function _npxSiteRing\(\)/.test(ed));
ok('editor sends the ring to the service', /req\.boundary=ring/.test(ed));
ok('the client forwards a boundary', /if \(site && site\.boundary\) body\.boundary = site\.boundary;/.test(R('omega-grid-atlas-client.js')));
const np = R('api/network-proximity.js');
ok('the service accepts a boundary', /var boundary = body\.boundary \|\| null;/.test(np));
ok('the service screens by area when given one', /fiberEvidence\.screenArea\(opts\)/.test(np));
ok('the service falls back to the point and SAYS so', /boundary_note/.test(np));
ok('public evidence is folded into no existing score',
   !/score\(\{[^}]*publicFiber/.test(np) && /publicFiber: pf,/.test(np));

/* ── concurrency ──────────────────────────────────────────────────────── */
ok('the panel guards against an older response painting over a newer one',
   /gen!==window\.__npxGen/.test(ed));
ok('a prior modal is removed so the id stays unique',
   /prior\.parentNode\.removeChild\(prior\)/.test(ed));

/* ── the four buckets stay four ───────────────────────────────────────── */
const lib = R('api/_lib/fiber-evidence.js');
['routes', 'facilities', 'planning_routes', 'unknown_medium_routes'].forEach(k => {
  ok('screenArea returns ' + k, new RegExp(k + ':').test(lib));
});
ok('planning is never merged into routes',
   /p\.feature_kind==='fiber_route' && p\.proximity_eligible===true\) routes\.push/.test(lib));

/* ── boundary geometry actually works ─────────────────────────────────── */
const ev = require('../api/_lib/fiber-evidence.js');
const ring = [[-87.64, 41.87], [-87.62, 41.87], [-87.62, 41.885], [-87.64, 41.885], [-87.64, 41.87]];
ok('a point inside the ring is inside', ev.pointInRing([-87.63, 41.877], ring));
ok('a point outside the ring is outside', !ev.pointInRing([-87.50, 41.877], ring));
ok('a line crossing the parcel measures zero',
   ev.geometryToRing({ type: 'LineString', coordinates: [[-87.70, 41.877], [-87.55, 41.877]] }, ring) === 0);
ok('a line outside measures a real distance', ev.geometryToRing(
   { type: 'LineString', coordinates: [[-87.50, 41.80], [-87.50, 41.95]] }, ring) > 5000);
ok('a ring is normalised from a GeoJSON Polygon',
   (ev.normalizeRing({ type: 'Polygon', coordinates: [ring] }) || []).length === ring.length);
ok('a degenerate ring is refused', ev.normalizeRing([[1, 2], [3, 4]]) === null);
const area = ev.screenArea({ boundary: ring, radius_km: 25 });
ok('screenArea labels its measurement method',
   area.measurement_method === 'shortest_distance_from_site_boundary_to_published_geometry');
ok('screenArea preserves every unknown',
   area.site_has_fiber === null && area.available_capacity_gbps === null && area.meets_requested_capacity === null);
ok('screenArea never claims a complete inventory', area.complete_national_inventory === false);

/* ── grid-atlas Site Analysis: the two finders return different shapes ── */
const ga = R('grid-atlas.html');
ok('the public-evidence section exists in Site Analysis', /Public route evidence/.test(ga));
/* nearestLine -> {props, km}; nearestPoint -> {f, km}. Reading .props off a
   nearestPoint result is undefined, and .operator on undefined threw and took
   the entire panel down, because analyze() builds one string and renders once. */
ok('it reads props from BOTH finder shapes',
   /hit\.props\|\|\(hit\.f&&hit\.f\.props\)/.test(ga));
ok('nearestPoint really does return {f, km}', /return best\?\{f:best,km:bd\}:null;/.test(ga));
ok('the four datasets are NOT in fiberKeys, so no score moves',
   !/fiberKeys=\[[^\]]*pf_routes/.test(ga));
ok('the four datasets ARE registered as layers',
   /pf_routes: \{/.test(ga) && /pf_unknown: \{/.test(ga) && /pf_design: \{/.test(ga) && /pf_facilities: \{/.test(ga));
ok('unknown-medium is labelled as not-confirmed-optical',
   /optical NOT confirmed/.test(ga));
ok('planning records are labelled as not-built',
   /planning\/design record, not a built route/.test(ga));
ok('attribution is rendered, not just carried',
   /OpenStreetMap contributors \(ODbL\)/.test(ga));

console.log((fail ? '✗' : '✓') + ' fiber integration: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
