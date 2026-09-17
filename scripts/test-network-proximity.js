#!/usr/bin/env node
/* Regression tests for api/network-proximity.js — the pure pieces (geometry,
   score, verdict, lateral) and the handler's contract. No network: every
   source is behind fetch, and these never call it.
   node scripts/test-network-proximity.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const NP = require('../api/network-proximity.js');
const T = NP._test;

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

/* ── geometry ─────────────────────────────────────────────────────────── */
const nycChi = T.distMi(40.7128, -74.0060, 41.8781, -87.6298);
ok('NYC–Chicago is ~711 mi great-circle', Math.abs(nycChi - 711) < 4, nycChi);
const b = T.bboxFor(40.72, -74.08, 10);
ok('a 10 mi bbox spans ~0.29° of latitude', Math.abs((b.ymax - b.ymin) - 0.2899) < 0.001, b);
/* A north–south line one mile east of the site. */
const eastMi = 1 / (69.0 * Math.cos(40.72 * Math.PI / 180));
const feats = [{ geometry: { type: 'LineString', coordinates: [[-74.08 + eastMi, 40.60], [-74.08 + eastMi, 40.85]] }, properties: { OWNER: 'Test Co' } }];
const hit = T.nearestLineMi(feats, 40.72, -74.08);
ok('nearest segment to a line 1 mi east is ~1 mi', hit && Math.abs(hit.dist - 1) < 0.02, hit && hit.dist);
ok('and it carries the feature\'s properties', hit && hit.props.OWNER === 'Test Co');
const wm = T.webMercToWgs(-8245000, 4970000);
ok('Web Mercator converts back to New Jersey', Math.abs(wm[0] + 74.07) < 0.05 && Math.abs(wm[1] - 40.7) < 0.1, wm);
ok('a Web Mercator line is normalised, WGS84 is passed through',
   T.normGeom({ type: 'LineString', coordinates: [[-8245000, 4970000], [-8240000, 4975000]] }).coordinates[0][0] < -70 &&
   T.normGeom({ type: 'LineString', coordinates: [[-74, 40], [-73, 41]] }).coordinates[0][0] === -74);
/* State-plane feet are numerically inside the Web Mercator range, so the
   projection heuristic cannot refuse them; the guard is distance from the
   site. A misprojected feature lands off West Africa and must be dropped. */
ok('state-plane feet are dropped, not measured',
   T.nearestFrom([{ geometry: { type: 'LineString', coordinates: [[600000, 700000], [600100, 700100]] }, properties: {} }], 40.72, -74.08, 'x') === null);
ok('a real feature inside the bbox survives the same guard',
   T.nearestFrom(feats, 40.72, -74.08, 'x') !== null);

/* ── long-haul conduits: a point on the Trenton–Edison chord ──────────── */
const lh = T.longhaul(40.37, -74.60);
ok('a site between Trenton and Edison is ~0 mi from that conduit', lh.status === 'ok' && lh.mi < 2 && /Trenton|Edison/.test(lh.conduit.a + lh.conduit.b), lh);
const lhFar = T.longhaul(28.9, -99.1);
ok('Frio County is far from every published conduit', lhFar.status === 'ok' && lhFar.mi > 100, lhFar.mi);

/* ── score: ordered and bounded ───────────────────────────────────────── */
const base = { nearestCarrier: { mi: 5, name: 'A' }, netsWithin80: 300, ixWithin80: 2, fccFiber: null, longhaulMi: null };
const near = T.score(base).score;
const far  = T.score(Object.assign({}, base, { nearestCarrier: { mi: 60, name: 'B' } })).score;
const none = T.score(Object.assign({}, base, { nearestCarrier: null, netsWithin80: 0, ixWithin80: 0 })).score;
ok('a closer carrier scores higher, none scores lowest', near > far && far > none, [near, far, none]);
ok('score stays within 0..100', [near, far, none].every(v => v >= 0 && v <= 100));
const sTrue = T.score(Object.assign({}, base, { fccFiber: true })).score;
const sFalse = T.score(Object.assign({}, base, { fccFiber: false })).score;
ok('FCC fiber at the point beats not-checked beats no-fiber', sTrue > near && near > sFalse, [sTrue, near, sFalse]);
ok('long-haul is a bonus that cannot push past 100',
   T.score(Object.assign({}, base, { nearestCarrier: { mi: 0, name: 'A' }, netsWithin80: 5000, ixWithin80: 9, fccFiber: true, longhaulMi: 0, longhaul: { a: 'X', b: 'Y' } })).score === 100);
ok('components are shown, so the number is auditable', T.score(base).parts.length >= 4);

/* ── verdict: the rule, case by case ──────────────────────────────────── */
const V = (d) => T.verdict(Object.assign({ nearestCarrier: null, fccFiber: null, plantMi: null, harvestMi: null, osmLineMi: null, osmExchangeMi: null, osmDataCenterMi: null }, d));
ok('FCC fiber at the point → likely',            V({ fccFiber: true }).verdict === 'likely');
ok('surveyed plant 0.4 mi → likely',             V({ plantMi: 0.4, plantSource: 'City' }).verdict === 'likely');
ok('carrier facility 2 mi → likely',             V({ nearestCarrier: { mi: 2, name: 'H', nets: 30 } }).verdict === 'likely');
ok('an exchange 0.5 mi away → likely',           V({ osmExchangeMi: 0.5 }).verdict === 'likely');
ok('plant 3 mi → plausible (a lateral)',         V({ harvestMi: 3, harvestSource: 'County' }).verdict === 'plausible');
ok('carrier 12 mi → plausible',                  V({ nearestCarrier: { mi: 12, name: 'H', nets: 30 } }).verdict === 'plausible');
ok('nothing at all → uncertain, not unlikely',   V({}).verdict === 'uncertain');
ok('a dense market 17 mi out → plausible',       V({ nearestCarrier: { mi: 17, name: 'PH1', nets: 24 }, netsWithin80: 462 }).verdict === 'plausible');
ok('the same distance in a thin market → uncertain', V({ nearestCarrier: { mi: 17, name: 'X', nets: 12 }, netsWithin80: 40 }).verdict === 'uncertain');
ok('density does not override an FCC "no fiber"', V({ nearestCarrier: { mi: 30, name: 'X', nets: 12 }, netsWithin80: 900, fccFiber: false }).verdict === 'unlikely');
ok('FCC says none, nothing within 10, carrier 60 → unlikely',
   V({ fccFiber: false, nearestCarrier: { mi: 60, name: 'H', nets: 30 } }).verdict === 'unlikely');
ok('FCC says none but a carrier at 8 mi → plausible, not unlikely',
   V({ fccFiber: false, nearestCarrier: { mi: 8, name: 'H', nets: 30 } }).verdict === 'plausible');
const u = V({ nearestCarrier: { mi: 52, name: 'H5', nets: 21 } });
ok('uncertain says the FCC point was not checked', u.reasons.some(r => /not checked/.test(r)), u.reasons);
ok('dataReady only for likely/plausible', V({ fccFiber: true }).dataReady === true && V({}).dataReady === false);

/* ── lateral: to the nearest hard evidence, else the carrier ──────────── */
const L1 = V({ plantMi: 2.5, plantSource: 'City', nearestCarrier: { mi: 40, name: 'H', nets: 30 } }).lateral;
ok('lateral measures to the plant, not the farther carrier', L1 && L1.mi === 2.5, L1);
ok('lateral cost is miles × the planning band', L1 && L1.costLow === Math.round(2.5 * T.constants.LATERAL_COST_PER_MI.low) && L1.costHigh === Math.round(2.5 * T.constants.LATERAL_COST_PER_MI.high));
ok('no evidence and no carrier → no lateral', V({}).lateral === null);

/* ── handler contract (fetch is never reached) ────────────────────────── */
function handlerWith(authImpl) {
  const box = { module: { exports: {} }, require: n => n.includes('verify-token') ? authImpl : require(n),
    fetch: () => { throw new Error('fetch must not be called in tests'); }, AbortController, setTimeout, clearTimeout, console, Promise, process, Object, Math, Number, String, Date, Array, Buffer };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/network-proximity.js'), 'utf8'), box);
  return box.module.exports;
}
async function call(h, req) {
  const out = {}; const res = { setHeader() {}, status(n) { out.status = n; return this; }, json(j) { out.body = j; return this; }, end() { out.ended = true; return this; } };
  await h(req, res); return out;
}
const httpError = (s, m) => Object.assign(new Error(m), { status: s });
(async () => {
  const real = require('../api/_lib/verify-token');
  const h1 = handlerWith(real);
  ok('OPTIONS is answered 204 before anything else', (await call(h1, { method: 'OPTIONS', headers: {} })).status === 204);
  ok('PUT is refused 405', (await call(h1, { method: 'PUT', headers: {} })).status === 405);
  const noTok = await call(h1, { method: 'POST', headers: {}, body: { lat: 40.72, lng: -74.08 } });
  ok('POST without a bearer token is 401', noTok.status === 401, noTok);
  const staff = { authenticateWithTier: () => Promise.resolve({ tier: 'trial', caller: { staff: true }, billing: {} }), httpError };
  const h2 = handlerWith(staff);
  ok('POST with no coordinates is 400', (await call(h2, { method: 'POST', headers: {}, body: {} })).status === 400);
  ok('POST with 0,0 is 400 (Null Island is not a site)', (await call(h2, { method: 'POST', headers: {}, body: { lat: 0, lng: 0 } })).status === 400);
  const gated = { authenticateWithTier: () => Promise.resolve({ tier: 'standard', caller: { staff: false }, billing: { toolOverrides: { gridatlas: false } } }), httpError };
  ok('a tenant with gridatlas switched off is 403', (await call(handlerWith(gated), { method: 'POST', headers: {}, body: { lat: 40.72, lng: -74.08 } })).status === 403);
  console.log((fail ? '✗' : '✓') + ' network-proximity: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
