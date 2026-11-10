/* scripts/tests/tgridscreen.js — the Grid Atlas screen of a portfolio site
   (api/_lib/portfolio/grid-screen.js) and where it lands (diligence.js
   change('screen')). © 2025–2026 ClearSky Energy Solutions LLC.
   Proprietary and Confidential.

   Offline: the three handlers are stubs answering the shapes the real ones
   answer (api/grid-atlas.js, api/network-proximity.js,
   api/hosting-capacity.js, read 2026-10-25), so nothing reaches a network. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var G = require('../../api/_lib/portfolio/grid-screen'), D = require('../../api/_lib/portfolio/diligence');
var SRC = fs.readFileSync(path.join(ROOT, 'api/_lib/portfolio/grid-screen.js'), 'utf8');
var NOW = '2026-10-25T15:00:00.000Z';
var passed = 0, failed = 0, queue = [];
function test(name, fn) { queue.push([name, fn]); }

/* the real handlers' answers, cut to what the screen reads */
function atlasOk(extra) {
  return { status: 200, body: Object.assign({ lat: 41.8781, lng: -87.6298, geocode: { provider: 'census', precision: 'exact', queried: '233 S Wacker Dr, Chicago, IL 60606' }, resolvedAddress: '233 S Wacker Dr, Chicago, IL 60606',
    substations: [{ name: 'TSS 55 Ohio', lat: 41.89, lng: -87.63, distanceKm: 2.25, voltageKv: 138, owner: 'ComEd' }, { name: 'Far', distanceKm: 9, voltageKv: 34.5 }], lines: [], sources: { substations: 'HIFLD substations (mirror)' } }, extra || {}) };
}
function networkSkipped() {
  return { status: 200, body: { fcc: { status: 'skipped', fiber: null, providers: [], note: 'not checked — FCC_BB_KEY is not set' },
    facilities: { status: 'ok', nearestMajor: { name: 'Equinix CH1', mi: 0.3, nets: 250 }, nearestCarrier: { name: 'Equinix CH1', mi: 0.3 } },
    fiber: { verdict: 'likely', lateral: { mi: 0.3, to: 'carrier facility Equinix CH1', basis: 'construction only' } } } };
}
function networkRead() {
  var n = networkSkipped();
  n.body.fcc = { status: 'ok', fiber: true, providers: [{ name: 'Lumen', down: 10000, up: 10000 }, { name: 'Comcast Business', down: 1000, up: 35 }, { name: 'Lumen', down: 1000, up: 1000 }], note: '2 fiber ISPs' };
  return n;
}
function hostingRead() {
  return { status: 200, body: { utility: { key: 'comed', display: 'ComEd', eiaId: '4110' }, coverage: 'read', source: { key: 'comed', label: 'ComEd hosting capacity (feeder)' },
    best: { id: 'D553', name: 'D553', substation: 'TSS 55', kv: 12.5, genKw: 900, loadKw: 2400, storageKw: 1500, basis: 'published', refreshed: '2026-09' }, circuits: [] } };
}
function stubs(over) {
  var calls = { atlas: [], network: [], hosting: [] };
  var deps = Object.assign({
    atlas: function (b) { calls.atlas.push(b); return Promise.resolve(atlasOk()); },
    network: function (b) { calls.network.push(b); return Promise.resolve(networkSkipped()); },
    hosting: function (b) { calls.hosting.push(b); return Promise.resolve(hostingRead()); },
    fcc: { keySet: false, left: 0 }
  }, over || {});
  return { deps: deps, calls: calls };
}
var SITE = { siteId: 's_chi', name: 'Wacker garage', address: { street: '233 S Wacker Dr', city: 'Chicago', state: 'IL', zip: '60606' } };

test('G01 where the site is: the record\'s coordinates, else its street with a city or ZIP; nothing to locate is said', function () {
  assert.deepEqual(G.locationOf({ lat: 41.1, lng: -87.2 }), { lat: 41.1, lng: -87.2 });
  assert.deepEqual(G.locationOf(SITE), { address: '233 S Wacker Dr, Chicago, IL 60606' });
  assert.deepEqual(G.locationOf({ address: '233 S Wacker Dr', city: 'Chicago', state: 'IL' }), { address: '233 S Wacker Dr, Chicago, IL' });
  assert.ok(/No street address/.test(G.locationOf({ city: 'Chicago' }).error));
  assert.ok(G.locationOf({ lat: 0, lng: 0, address: { street: '1 A St', zip: '60606' } }).address, '0,0 is not a point');
});

test('G02 the grid atlas answer: the nearest substation in miles with its kV; an approximate match is usable for nothing', function () {
  var a = G.fromAtlas(atlasOk());
  assert.equal(a.ok, true); assert.deepEqual(a.power, { substation: 'TSS 55 Ohio', kv: 138, distanceMi: 1.4, owner: 'ComEd' });
  assert.equal(a.located.usable, true); assert.equal(a.located.precision, 'exact'); assert.equal(a.source, 'HIFLD substations (mirror)');
  var ap = G.fromAtlas(atlasOk({ geocode: { precision: 'area', note: 'city centre only' } }));
  assert.equal(ap.located.usable, false); assert.equal(ap.located.approximate, true);
  assert.equal(G.fromAtlas(atlasOk({ geocode: null })).located.precision, 'coordinates');
  assert.equal(G.fromAtlas(atlasOk({ substations: [] })).power, null);
  assert.equal(G.fromAtlas({ status: 422, body: { error: 'Address needs a city' } }).ok, false);
  assert.equal(G.fromAtlas({ status: 200, body: { lat: '41.8', lng: null } }).ok, false, 'a point that is not a number is no point');
});

test('G03 the network answer: carriers only from the FCC read at the address; the key unset says carrier names need it; 1 Gbps symmetric from the speeds; the carrier hotel from PeeringDB', function () {
  var n = G.fromNetwork(networkSkipped());
  assert.deepEqual(n.fiber.carriers, []); assert.equal(n.fiber.carriersRead, false); assert.equal(n.fiber.carriersStatus, 'needs-key');
  assert.equal(n.fiber.carriersNote, 'carrier names need the FCC key'); assert.equal(n.fiber.symmetric1g, null, 'not read is not "no"');
  assert.equal(n.fiber.carrierHotel, 'Equinix CH1'); assert.equal(n.fiber.carrierHotelMi, 0.3); assert.equal(n.fiber.lateralMi, 0.3);
  assert.equal(n.sources.fcc, null); assert.equal(n.sources.peeringdb, 'PeeringDB');
  var r = G.fromNetwork(networkRead());
  assert.deepEqual(r.fiber.carriers, ['Lumen', 'Comcast Business'], 'one name once'); assert.equal(r.fiber.symmetric1g, true); assert.equal(r.fiber.symmetricCount, 2); assert.equal(r.sources.fcc, 'FCC broadband data (BDC)');
  var noSym = networkRead(); noSym.body.fcc.providers = [{ name: 'Comcast Business', down: 1000, up: 35 }];
  assert.equal(G.fromNetwork(noSym).fiber.symmetric1g, false);
  var lim = networkSkipped(); lim.body.fcc = { status: 'failed', providers: [], note: 'not checked — FCC rate limit reached' };
  assert.equal(G.fromNetwork(lim).fiber.carriersNote, 'carrier names not read: FCC rate limit reached');
  assert.equal(G.fromNetwork({ status: 504, body: { error: 'timed out' } }).ok, false);
});

test('G04 the hosting answer: the utility by territory, and the load hosting figure only where the utility publishes it at the point', function () {
  var h = G.fromHosting(hostingRead());
  assert.deepEqual(h.utility, { name: 'ComEd', key: 'comed', eiaId: '4110', basis: 'territory' });
  assert.equal(h.hosting.coverage, 'read'); assert.equal(h.hosting.loadKw, 2400); assert.equal(h.hosting.circuit, 'D553'); assert.equal(h.hosting.source, 'ComEd hosting capacity (feeder)');
  var none = G.fromHosting({ status: 200, body: { utility: { key: 'midamerican', display: 'MidAmerican Energy' }, coverage: 'none', note: 'not published' } });
  assert.equal(none.hosting.coverage, 'none'); assert.equal(none.hosting.loadKw, undefined); assert.equal(none.utility.name, 'MidAmerican Energy');
  /* the rate book by ZIP only when it knows the ZIP itself: never its fallback or a state default */
  assert.equal(G.utilityByZip('60601').key, 'comed'); assert.equal(G.utilityByZip('00000'), null); assert.equal(G.utilityByZip('90012'), null, 'a state default (PG&E for Los Angeles) is not the ZIP’s utility');
  assert.equal(G.utilityByZip('12'), null);
});

test('G05 one site in two phases: the grid, then fiber and hosting in parallel at the point; errors are answers, never a throw', async function () {
  var st = stubs(), a = await G.step(SITE, null, st.deps, { now: NOW });
  assert.equal(a.phase, 'grid'); assert.equal(a.done, false); assert.equal(st.calls.atlas.length, 1); assert.deepEqual(st.calls.atlas[0], { address: '233 S Wacker Dr, Chicago, IL 60606', radiusKm: 25 });
  assert.equal(st.calls.network.length, 0, 'phase one asks the grid only');
  var b = await G.step(SITE, a.screen, st.deps, { now: NOW, unitKw: 450 });
  assert.equal(b.done, true); assert.deepEqual(st.calls.network[0], { lat: 41.8781, lng: -87.6298 });
  assert.equal(st.calls.hosting[0].mode, 'load'); assert.equal(st.calls.hosting[0].unit.kw, 450);
  var sc = b.screen;
  assert.equal(sc.complete, true); assert.equal(sc.at, NOW); assert.equal(sc.power.kv, 138); assert.equal(sc.fiber.carriersStatus, 'needs-key'); assert.equal(sc.hosting.loadKw, 2400); assert.equal(sc.utility.key, 'comed');
  assert.deepEqual(sc.errors, []);
  /* a handler that fails leaves an error, and the rest still lands */
  var bad = stubs({ network: function () { return Promise.resolve({ status: 504, body: { error: 'timed out' } }); } });
  var whole = await G.run(SITE, bad.deps, { now: NOW });
  assert.equal(whole.fiber, null); assert.equal(whole.errors[0].source, 'network-proximity'); assert.equal(whole.hosting.loadKw, 2400);
  /* the atlas cannot place it: done, and said */
  var lost = stubs({ atlas: function () { return Promise.resolve({ status: 422, body: { error: 'Address needs a city, state or ZIP' } }); } });
  whole = await G.run(SITE, lost.deps, { now: NOW });
  assert.equal(whole.complete, true); assert.equal(whole.located, null); assert.ok(/needs a city/.test(whole.errors[0].message)); assert.equal(lost.calls.network.length, 0);
  /* an approximate match stops before the network */
  var approx = stubs({ atlas: function () { return Promise.resolve(atlasOk({ geocode: { precision: 'area', note: 'ZIP centroid' } })); } });
  whole = await G.run(SITE, approx.deps, { now: NOW });
  assert.equal(approx.calls.network.length, 0); assert.ok(/matched only approximately/.test(whole.notes[0]));
  /* a handler that throws, or rejects, is an answer too */
  var boom = stubs({ hosting: function () { throw new Error('boom'); }, network: function () { return Promise.reject(Object.assign(new Error('nope'), { status: 403 })); } });
  whole = await G.run(SITE, boom.deps, { now: NOW });
  assert.deepEqual(whole.errors.map(function (e) { return e.source; }).sort(), ['hosting-capacity', 'network-proximity']); assert.equal(whole.power.kv, 138);
  /* nothing to locate */
  whole = await G.run({ name: 'No address' }, stubs().deps, { now: NOW });
  assert.equal(whole.errors[0].source, 'location');
});

test('G06 the FCC allowance: with the key set and today\'s lookups used up, the network check is not called and the note says when the names come', async function () {
  var st = stubs({ fcc: { keySet: true, left: 0 } }), whole = await G.run(SITE, st.deps, { now: NOW });
  assert.equal(st.calls.network.length, 0); assert.equal(whole.fiber.carriersStatus, 'limit'); assert.ok(/used up/.test(whole.fiber.carriersNote)); assert.equal(st.calls.hosting.length, 1);
  st = stubs({ fcc: { keySet: true, left: 12 }, network: function () { return Promise.resolve(networkRead()); } });
  whole = await G.run(SITE, st.deps, { now: NOW });
  assert.equal(whole.fccSpent, true); assert.deepEqual(whole.fiber.carriers, ['Lumen', 'Comcast Business']);
  st = stubs(); whole = await G.run(SITE, st.deps, { now: NOW });
  assert.equal(whole.fccSpent, false, 'no key: no FCC lookup is spent'); assert.equal(st.calls.network.length, 1);
  assert.equal(G.FCC_DAILY_CAP < 100, true, 'under the FCC’s 100 a day');
});

test('G07 the in-process call: the handler\'s own answer, a thrown error as an answer, a deadline as a 504', async function () {
  var ok = await G.invoke(function (req, res) { res.status(200).json({ hi: req.body.x }); }, { body: { x: 1 } }, 1000);
  assert.deepEqual(ok, { status: 200, body: { hi: 1 } });
  var thrown = await G.invoke(function () { var e = new Error('No'); e.status = 403; throw e; }, {}, 1000);
  assert.equal(thrown.status, 403); assert.equal(thrown.body.error, 'No');
  var rejected = await G.invoke(function () { return Promise.reject(Object.assign(new Error('Plan'), { status: 402 })); }, {}, 1000);
  assert.equal(rejected.status, 402);
  var slow = await G.invoke(function () { return new Promise(function () {}); }, {}, 20);
  assert.equal(slow.status, 504);
});

test('G08 it lands through the diligence\'s own rule, and it reads nothing it must not: no fabricated fiber layer, no licensed geometry, no key', async function () {
  var whole = await G.run(SITE, stubs({ network: function () { return Promise.resolve(networkRead()); } }).deps, { now: NOW });
  var cfg = D.normalizeConfig(null), r = D.change(null, 'screen', { screen: whole }, { site: SITE, config: cfg, now: NOW, by: 'thomas@solelacapital.com', canEdit: true });
  assert.deepEqual(r.event.moved.sort(), ['fiber', 'interconnection', 'power']);
  assert.deepEqual(r.diligence.gates.fiber.value.carriers, ['Lumen', 'Comcast Business']); assert.equal(r.diligence.gates.interconnection.value.utility, 'ComEd');
  var code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  ['geodataviewer', 'fiber_verified', 'fiber_estimated', 'll_backbone', 'FIBER_VENDOR', 'FCC_BB_KEY', 'process.env', 'fetch(', 'require(\'https\')', 'require(\'http\')'].forEach(function (w) { assert.ok(code.indexOf(w) < 0, 'grid-screen reads ' + w); });
  assert.deepEqual(code.match(/require\([^)]*\)/g), ["require('../utility-rates')"], 'the handlers are handed in; the library requires only the rate book');
  assert.ok(SRC.indexOf('© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.') > 0);
});

(async function () {
  for (var i = 0; i < queue.length; i++) {
    try { await queue[i][1](); passed++; console.log('PASS ' + queue[i][0]); }
    catch (e) { failed++; console.log('FAIL ' + queue[i][0] + '\n     ' + (e && e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log('grid screen: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
