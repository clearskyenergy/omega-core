#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Omega Prime sets up the real project (2026-10-16, Tommy: "it does the set
 * up and system like the artifact sandbox"); Clean Cell's units are its
 * battery list and FENECON's XXL is FENECON's own (2026-10-17). Holds:
 *   - omega-prime-project.js units() (contract C1): the workspace's own
 *     products, then Clean Cell's Rev H units biggest first, then the R60;
 *     the XXL first for FENECON's workspace only; own-only manufacturers see
 *     their own; placeholders dropped; nobody gets an empty list; no price;
 *     the R60 and the XXL pinned to editor.html and api/_lib/omega-core.js;
 *   - arrange(), feed(), conduitPath(), pathFt() and layout v2 (C2): the
 *     gear row and its integration flags, the editor's own ground length,
 *     the hash, v1 → v2;
 *   - projectDoc(), patch(), restore(), runInput() (C3): the record a
 *     project is created and resumed with, touching no drawing key beyond
 *     the empty arrays a new project starts with; unitFor(), the ONE rule
 *     for the unit a record resumes with (Prime, the quote server, Site
 *     Map), which knows the shipped R60 and XXL by key;
 *   - omega-prime.html holds no verdict rule and no price arithmetic: it asks
 *     the national hosting door through the one client (omega-grid-verdict.js
 *     hosting / fromHosting / hostingSummary), lists units through PP.units
 *     with Clean Cell's catalog, creates the project at Start and patches it
 *     (PP.projectDoc / PP.patch, no drawing key), draws with PP.arrange and
 *     layout v2, asks the rates for the utility the circuit named, writes the
 *     proposal through /api/customer-quote and omega-quote-deck.js, names no
 *     utility of its own, and links Omega Logic in the workspace it is in. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function json(f) { return JSON.parse(read(f)); }
/* Prime first, before any browser global exists: its own fallback judge is
   then the one under test where no isOwn is passed. */
var PP = require(path.join(ROOT, 'omega-prime-project.js'));
var CC = require(path.join(ROOT, 'omega-cleancell-catalog.js'));
var OC = require(path.join(ROOT, 'api/_lib/omega-core.js'));
var REFS = CC.entries();
function keysOf(list) { return list.map(function (u) { return u.key; }); }
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, msg + ' (' + a + ' vs ' + b + ')'); count++; }
var LGK = 'CLEANCELL-LGJP2-1000-REV-H', SMK = 'CLEANCELL-SM-1000-REV-H', CCK = 'CLEANCELL-CC290-125-REV-H';
var HERO = [LGK, SMK, CCK, 'CC-R60'];

/* ── the editor's own records ───────────────────────────────────────── */
var ed = read('editor.html');
function bodyFrom(src, needle) {
  var at = src.indexOf(needle);
  if (at < 0 || src.indexOf(needle, at + 1) >= 0) throw new Error(needle + ' must appear exactly once');
  var k = src.indexOf('{', at), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(at, k + 1);
}
var bcSrc = ed.slice(ed.indexOf('const BESS_CATALOG = {'), ed.indexOf('/* ── THE TENANT\'S OWN PRODUCTS LEAD'));
var BC = vm.runInNewContext('(' + bcSrc.slice(bcSrc.indexOf('{'), bcSrc.lastIndexOf('}') + 1) + ')');
var dimSrc = bodyFrom(ed, 'const GOTION_CATALOG_DIMS = {');
var DIMS = vm.runInNewContext('(' + dimSrc.slice(dimSrc.indexOf('{')) + ')');
var groundPolyFt = vm.runInNewContext('(' + bodyFrom(ed, 'function _groundPolyFt(geo, n){') + ')');

/* ── 1 · the unit list ──────────────────────────────────────────────── */
var noTenant = PP.units(null, REFS);
assert.deepEqual(keysOf(noTenant), HERO, 'Clean Cell\'s units, biggest first, then the R60'); count++;
assert.equal(noTenant[0].key, LGK, 'the LG JP-2 is the hero'); count++;
assert.ok(noTenant.every(function (u) { return !/fenecon/i.test(JSON.stringify(u)); }), 'FENECON is not on a generic workspace\'s list'); count++;
assert.deepEqual(keysOf(PP.units(null)), ['CC-R60'], 'no catalog loaded still leaves a unit: nobody gets an empty list'); count++;
assert.deepEqual(keysOf(PP.units({ ownOnly: true, owner: ['acme'] }, REFS)), HERO, 'own-only with nothing of its own falls back to the reference list'); count++;
noTenant.forEach(function (u) { assert.deepEqual(Object.keys(u), PP.UNIT_KEYS, 'a unit is exactly the C1 shape: ' + u.key); count++; });

var LG = noTenant[0], SM = noTenant[1], C290 = noTenant[2], R6 = noTenant[3];
assert.equal(LG.short, 'LG JP-2'); assert.equal(SM.short, 'Smart Module'); assert.equal(C290.short, 'CC290/125'); assert.equal(R6.short, 'R60'); count += 4;
assert.equal(LG.name, 'CleanCell US LG JP-2'); assert.equal(R6.name, 'Clean Cell R60'); count += 2;
assert.equal(LG.sku, 'CC-LGJP2-1000'); assert.equal(C290.sku, 'CC290-125'); assert.equal(R6.sku, 'CC-R60'); count += 3;
assert.equal(LG.kw, 1000); assert.equal(LG.kwh, 2294); assert.equal(LG.usable, null, 'the 2000 kWh modeled figure is not usable kWh'); assert.equal(LG.hours, 2.294); count += 4;
assert.match(LG.caveat, /modeled usable ONLY/); assert.match(LG.caveat, /^Planning specification, verify before release\./); count += 2;
assert.equal(SM.kwhApprox, true, 'the Smart Module\'s ~2 MWh keeps its "~"'); assert.match(SM.note, /~2,000 kWh/); assert.equal(LG.kwhApprox, false); count += 3;
/* a footprint the maker has not RELEASED is drawn at its REFERENCE size
   (2026-10-20, Tommy, of a CC290/125 placed as a point where FENECON's
   unit draws a block: "it does it for fenecon unit but not on cleancell get
   that fixed"): the CC290/125 at its reference cabinet, the LG JP-2 and
   the Smart Module, whose brochure names a 20 ft container, as one
   (20 × 8 ft, PP.CONTAINER_20); 'reference', never 'catalog' */
assert.equal(LG.footprint, 'reference'); assert.equal(LG.lFt, 20); assert.equal(LG.wFt, 8); count += 3;
assert.equal(SM.footprint, 'reference'); assert.equal(SM.lFt, 20); assert.equal(SM.wFt, 8); count += 3;
assert.deepEqual(PP.CONTAINER_20, { lFt: BC['FENECON-IND-XXL'] ? DIMS['FENECON-IND-XXL'].lf : 20, wFt: BC['FENECON-IND-XXL'] ? DIMS['FENECON-IND-XXL'].wf : 8 }, 'a 20 ft container as editor.html draws the XXL\'s'); count++;
assert.equal(C290.footprint, 'reference'); assert.equal(C290.lFt, 4.36); assert.equal(C290.wFt, 3.94); assert.equal(C290.hFt, 7.71, 'the cabinet height is still the brochure\'s'); count += 4;
assert.match(C290.caveat, /cabinet reference ONLY; separate PCS footprint to confirm/, 'and it says the PCS is still to confirm'); count++;
var NODIMS = PP.fromEntry('X-NONE', { mfr: 'Acme', model: 'Box', kw: 100, kwh: 200, dimensionsStatus: 'pending-release', dims: 'to confirm' });
assert.equal(NODIMS.footprint, 'none'); assert.equal(NODIMS.lFt, null, 'no figure and no named container: still unknown, never a guess'); count += 2;
assert.equal(PP.snapshot(C290).footprint, 'reference', 'a reference size survives the snapshot'); count++;
var REL = PP.fromEntry('X-REL', { mfr: 'CleanCell US', model: 'Released', kw: 100, kwh: 200, widthFt: 3.94, depthFt: 4.36, dimensionsStatus: 'released' });
assert.equal(REL.footprint, 'catalog'); assert.equal(REL.lFt, 4.36, 'a released footprint: long axis first, 2 dp'); assert.equal(REL.wFt, 3.94); count += 3;
assert.equal(C290.weightLb, Math.round(2900 * 2.20462)); assert.equal(C290.weightBasis, 'reference'); assert.equal(LG.weightLb, null); assert.equal(LG.weightBasis, ''); count += 4;
assert.equal(C290.ac, '480 V 3-ph 60 Hz'); assert.equal(LG.ac, '480 V 3-ph 60 Hz'); count += 2;
assert.equal(LG.incPcs, true); assert.equal(SM.incPcs, false); assert.equal(C290.incPcs, false); count += 3;
[LG, SM, C290].forEach(function (u) {
  assert.equal(u.incXfmr, false); assert.equal(u.incDisco, false); assert.equal(u.source, 'reference');
  assert.equal(u.catalogStatus, 'planning-verify'); assert.match(u.sourceDoc, /Rev H/); assert.ok(u.sourcePages.indexOf(19) >= 0);
  assert.equal(u.vendorOrgId, null); assert.equal(u.mfr, 'CleanCell US'); count += 8;
});
assert.deepEqual(LG.sourcePages, REFS[LGK].sourcePages); count++;
assert.ok(noTenant.every(function (u) { return u.note.indexOf('\n') < 0 && u.note.length < 90; }), 'the note is one line'); count++;

/* the R60, figure by figure: editor.html BESS_CATALOG, its footprint row, api/_lib/omega-core.js */
var E60 = BC['CC-R60'], D60 = DIMS['CC-R60'], B60 = OC.PRODUCT.battery;
assert.equal(PP.R60.key, 'CC-R60'); assert.equal(PP.R60.mfr, E60.mfr); assert.equal(PP.R60.model, E60.model); assert.equal(PP.R60.chem, E60.chem); count += 4;
assert.equal(PP.R60.kw, E60.kw); assert.equal(PP.R60.kwh, E60.kwh); assert.equal(PP.R60.hours, E60.dur); assert.equal(PP.R60.usable, E60.usable); count += 4;
assert.equal(PP.R60.inv, E60.inv); assert.equal(PP.R60.xfmr, E60.xfmr); assert.equal(PP.R60.disco, E60.disco); assert.equal(PP.R60.ac, E60.gridConnectV); count += 4;
assert.equal(PP.R60.incPcs, E60._incPCS); assert.equal(PP.R60.incXfmr, E60._incXfmr); assert.equal(PP.R60.incDisco, E60._incDisco); count += 3;
assert.equal(PP.R60.ems, E60.controller); assert.equal(PP.R60.sourceDoc, E60.verified); assert.equal(E60.evSkid, true); assert.match(PP.R60.note, /EV-charging skid: BESS \+ 2 Autel DCFC/, 'labelled as the skid it is'); count += 4;
assert.equal(PP.R60.lFt, D60.lf); assert.equal(PP.R60.wFt, D60.wf); assert.equal(PP.R60.hFt, D60.hf); assert.equal(D60.wt, 'SEE MFR SUBMITTAL'); assert.equal(PP.R60.weightLb, null, 'weight unpublished stays null'); count += 5;
assert.equal(PP.R60.kwh, B60.kwh); assert.equal(PP.R60.kw, B60.kw); assert.equal(PP.R60.key, B60.catalogKey); assert.equal(PP.R60.chem, B60.chemistry); assert.equal(PP.R60.ac, B60.acV); count += 5;
assert.equal(PP.R60.lFt, OC.PRODUCT.skid.lengthFt); assert.equal(PP.R60.wFt, OC.PRODUCT.skid.depthFt); near(PP.R60.hFt, OC.PRODUCT.skid.heightIn / 12, 0.005, 'the skid drawing\'s 82.75 in overall'); count += 2;
assert.equal(B60.make.toLowerCase().replace(/[^a-z]/g, '').indexOf(PP.R60.mfr.toLowerCase().replace(/[^a-z]/g, '')), 0, 'one maker: Clean Cell'); count++;
assert.deepEqual(R6, PP.R60, 'the list carries the constant as it is'); assert.notEqual(R6, PP.R60, 'as a copy'); count += 2;
/* the XXL against its editor entry */
var EX = BC['FENECON-IND-XXL'], DX = DIMS['FENECON-IND-XXL'];
assert.equal(PP.XXL.kw, EX.kw); assert.equal(PP.XXL.kwh, EX.kwh); assert.equal(PP.XXL.usable, EX.usable); assert.equal(PP.XXL.hours, EX.dur); assert.equal(PP.XXL.inv, EX.inv); count += 5;
assert.equal(PP.XXL.lFt, DX.lf); assert.equal(PP.XXL.wFt, DX.wf); assert.equal(PP.XXL.hFt, DX.hf); assert.equal(PP.XXL.weightLb, +DX.wt.replace(/[^\d]/g, '')); count += 4;
assert.deepEqual(Object.keys(PP.R60), PP.UNIT_KEYS); assert.deepEqual(Object.keys(PP.XXL), PP.UNIT_KEYS); count += 2;

/* no isOwn passed and none on the page: only a workspace product is its own */
assert.deepEqual(keysOf(PP.units({ orgId: 'fenecon.com', owner: ['fenecon'] }, REFS)), HERO, 'no judge, no XXL'); count++;

/* the readers */
assert.equal(PP.zipOf('3400 S Federal St, Chicago, IL, 60616'), '60616'); assert.equal(PP.zipOf('12 Main St, Joliet IL 60435-1234'), '60435'); assert.equal(PP.zipOf('no zip here'), ''); count += 3;
assert.deepEqual(PP.peaks('1,420  1,388\n1402, 1510 kW'), [1420, 1388, 1402, 1510]); assert.equal(PP.peaks('1 2 3 4 5 6 7 8 9 10 11 12 13 14').length, 12); assert.deepEqual(PP.peaks(''), []); count += 3;

/* ── 2 · arrangement, ground length, layout v2 ──────────────────────── */
var R = 6378137, RAD = Math.PI / 180, FTM = 3.280839895;
var equator = R * 0.001 * RAD * FTM;                 /* along the equator a great circle IS R·Δλ: 365.2214 ft */
near(PP.pathFt([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]), equator, 1e-9, 'pathFt: 0.001° of longitude on the equator');
near(equator, 365.2214, 1e-4, 'the hand figure');
near(PP.pathFt([{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 }]), equator, 1e-9, 'and of latitude on a meridian');
var Lp = PP.conduitPath({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0.002 });
assert.deepEqual(Lp, [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.002 }, { lat: 0.001, lng: 0.002 }], 'L-shaped: along the feed\'s latitude, then to the POI'); count++;
near(PP.pathFt(Lp), 3 * equator, 1e-6, 'the L run is its two legs: 1,095.66 ft');
var poly = [{ lat: 41.81522, lng: -87.62261 }, { lat: 41.81522, lng: -87.6224 }, { lat: 41.81571, lng: -87.6224 }, { lat: 41.8159, lng: -87.6229 }];
assert.equal(PP.pathFt(poly), groundPolyFt(poly, poly.length), 'the editor\'s _groundPolyFt, to the last digit'); count++;
assert.equal(PP.pathFt([{ lat: 1, lng: 2 }]), null); assert.equal(PP.pathFt([{ lat: 1, lng: 2 }, { lat: NaN, lng: 2 }]), null); assert.equal(PP.pathFt(null), null); count += 3;

var C = { lat: 41.81522, lng: -87.62261 };
function offFt(a, b) { return PP.pathFt([a, b]); }
var gLG = PP.arrange(LG, C);
assert.deepEqual(gLG.unit, { c: C, lFt: 20, wFt: 8, rotDeg: 0, footprint: 'reference' }, 'the LG JP-2 is a block at its 20 ft container reference size'); count++;
var gNone = PP.arrange(NODIMS, C);
assert.deepEqual(gNone.unit, { c: C, lFt: null, wFt: null, rotDeg: 0, footprint: 'none' }, 'no size at all: a marked point'); count++;
near(offFt(C, gNone.xfmr.c), 0 + 5 + 4, 0.05, 'transformer: 5 ft clear of a 0 ft unit');
assert.ok(gLG.xfmr && gLG.disco, 'the LG JP-2 has a transformer and a disconnect drawn'); count++;
assert.equal(gLG.xfmr.c.lat, C.lat); assert.equal(gLG.disco.c.lat, C.lat); assert.ok(gLG.xfmr.c.lng > C.lng && gLG.disco.c.lng > gLG.xfmr.c.lng, 'the gear runs east'); count += 3;
near(offFt(C, gLG.xfmr.c), 10 + 5 + 4, 0.05, 'transformer: 5 ft clear of the 20 ft block');
near(offFt(C, gLG.disco.c), 10 + 5 + 8 + 5 + 1.5, 0.05, 'disconnect: 5 ft clear of the transformer');
assert.deepEqual([gLG.xfmr.lFt, gLG.xfmr.wFt, gLG.xfmr.rotDeg, gLG.disco.lFt, gLG.disco.wFt, gLG.disco.rotDeg], [8, 8, 0, 3, 4, 0]); count++;
var g290 = PP.arrange(C290, C);
near(offFt(C, g290.xfmr.c), 4.36 / 2 + 5 + 4, 0.05, 'CC290/125 at its reference cabinet: the transformer sits 5 ft clear of the block');
near(offFt(g290.xfmr.c, g290.disco.c) - 4 - 1.5, 5, 0.05, 'and the disconnect clears the transformer by 5 ft');
var g60 = PP.arrange(R6, C);
assert.equal(g60.xfmr, null, 'the R60 integrates its transformer: none is drawn'); assert.ok(g60.disco, 'its site disconnect is'); count += 2;
near(offFt(C, g60.disco.c), 28 / 2 + 5 + 1.5, 0.05, 'the disconnect sits 5 ft east of the 28 ft skid');
assert.deepEqual(g60.unit, { c: C, lFt: 28, wFt: 7.25, rotDeg: 0, footprint: 'catalog' }); count++;
var both = PP.arrange({ key: 'X', lFt: 10, wFt: 8, footprint: 'catalog', incXfmr: true, incDisco: true }, C);
assert.equal(both.xfmr, null); assert.equal(both.disco, null); assert.equal(PP.feed(both), both.unit, 'nothing integrated outside: the service leaves the unit'); count += 3;
var xOnly = PP.arrange({ key: 'Y', incDisco: true }, C);
assert.equal(PP.feed(xOnly), xOnly.xfmr); assert.equal(PP.feed(gLG), gLG.disco); assert.equal(PP.feed(null), null); count += 3;
assert.equal(PP.arrange(LG, null), null); count++;
var repLG = PP.repFootprint(LG, 10, 30);
assert.equal(repLG.footprint, 'rep'); assert.equal(repLG.lFt, 30); assert.equal(repLG.wFt, 10); assert.equal(LG.footprint, 'reference', 'the list\'s unit is untouched'); count += 4;
near(offFt(C, PP.arrange(repLG, C).xfmr.c), 15 + 5 + 4, 0.05, 'a footprint the rep typed is drawn at size, over the reference one');

var AREA = { s: 41.8151, w: -87.6227, n: 41.8153, e: -87.6225 };
var st = { unit: LG, area: AREA, unitAt: C, poi: { lat: 41.81561, lng: -87.6231 }, conduit: true };
var L2 = PP.layout(st);
assert.equal(L2.v, 2); assert.equal(L2.unitKey, LGK); assert.match(L2.hash, /^[0-9a-f]{8}$/); count += 3;
assert.deepEqual(Object.keys(L2), ['v', 'unitKey', 'hash', 'area', 'unit', 'xfmr', 'disco', 'poi', 'conduit', 'conduitFt']); count++;
assert.equal(L2.area.wFt, Math.round(PP.pathFt([{ lat: AREA.s, lng: AREA.w }, { lat: AREA.s, lng: AREA.e }]))); assert.equal(L2.area.hFt, Math.round(PP.pathFt([{ lat: AREA.s, lng: AREA.w }, { lat: AREA.n, lng: AREA.w }]))); count += 2;
assert.deepEqual(L2.unit, gLG.unit); assert.deepEqual(L2.xfmr, gLG.xfmr); assert.deepEqual(L2.disco, gLG.disco); count += 3;
assert.deepEqual(L2.conduit.pts, PP.conduitPath(gLG.disco.c, st.poi), 'the service leaves the disconnect'); assert.equal(L2.conduit.type, 'PVC-UG'); count += 2;
assert.equal(L2.conduit.ft, Math.round(PP.pathFt(L2.conduit.pts) * 10) / 10); assert.equal(L2.conduitFt, L2.conduit.ft); count += 2;
assert.equal(PP.hash(L2), L2.hash, 'the hash is of the geometry, without itself'); count++;
assert.equal(PP.layout(st).hash, L2.hash, 'stable'); count++;
var shuffled = JSON.parse(JSON.stringify(L2, Object.keys(L2).reverse().concat(['c', 'lat', 'lng', 'lFt', 'wFt', 'rotDeg', 'footprint', 's', 'w', 'n', 'e', 'hFt', 'sqft', 'pts', 'ft', 'type'])));
assert.equal(PP.hash(shuffled), L2.hash, 'and the same after a store that reorders keys'); count++;
assert.notEqual(PP.layout({ unit: LG, area: AREA, unitAt: C, poi: { lat: 41.81562, lng: -87.6231 }, conduit: true }).hash, L2.hash, 'a moved POI is a new hash'); count++;
assert.equal(PP.fnv1a(''), '811c9dc5'); assert.equal(PP.fnv1a('a'), 'e40c292c'); assert.equal(PP.fnv1a('foobar'), 'bf9cf968'); count += 3;
assert.equal(PP.layout({ unit: LG, area: AREA, unitAt: C, poi: st.poi }).conduit, null, 'no conduit until it is drawn'); count++;
assert.equal(PP.layout({ unit: LG, area: AREA, unitAt: C, conduit: true }).conduit, null, 'nor without a service point'); count++;
var unplaced = PP.layout({ unit: LG, area: AREA });
assert.equal(unplaced.unit, null); assert.equal(unplaced.xfmr, null); assert.equal(unplaced.conduitFt, null); count += 3;
var L60 = PP.layout({ unit: R6, area: AREA, unitAt: C, poi: st.poi, conduit: true });
assert.equal(L60.xfmr, null); assert.deepEqual(L60.conduit.pts[0], L60.disco.c); count += 2;
assert.deepEqual(JSON.parse(JSON.stringify(L2)), L2, 'storable as it is'); count++;

/* v1 → v2 */
var v1 = { area: { s: AREA.s, w: AREA.w, n: AREA.n, e: AREA.e, wFt: 55, hFt: 72, sqft: 3960 }, unit: { lat: C.lat, lng: C.lng }, poi: st.poi, conduitFt: 88 };
var up = PP.upgrade(v1, LG);
assert.deepEqual(up, PP.layout({ unit: LG, area: v1.area, unitAt: v1.unit, poi: v1.poi, conduit: true }), 'v1 is replayed through arrange'); count++;
assert.equal(up.v, 2); assert.equal(up.area.wFt, 55, 'the v1 area\'s measured sides are kept'); assert.ok(up.xfmr && up.disco); count += 3;
assert.equal(PP.upgrade(v1, R6).xfmr, null, 'an R60 sketch loses the transformer Prime used to draw'); count++;
assert.equal(PP.upgrade({ area: v1.area, unit: v1.unit, poi: v1.poi, conduitFt: null }, LG).conduit, null); count++;
assert.equal(PP.upgrade(L2, R6), L2, 'a v2 layout is returned as it is'); count++;
var noHash = JSON.parse(JSON.stringify(L2)); noHash.hash = '';
assert.equal(PP.upgrade(noHash, LG).hash, L2.hash); assert.equal(noHash.hash, '', 'without touching the input'); count += 2;
assert.equal(PP.upgrade(null, LG), null); count++;

/* what /api/price-site is sent */
assert.deepEqual(PP.runInput(LG, L2), { kw: 1000, hours: 2.294, poiFt: Math.round(L2.conduitFt), padArea: L2.area.sqft }); count++;
assert.deepEqual(PP.runInput(LG, unplaced), { kw: 1000, hours: 2.294, poiFt: null, padArea: unplaced.area.sqft }); count++;
assert.equal(PP.runInput({ kw: 500, kwh: 1000 }, null).hours, 2, 'hours from the energy when none is on the unit'); assert.equal(PP.runInput(null, L2), null); count += 2;

/* ── 3 · the project record ─────────────────────────────────────────── */
var grid = { lat: 41.81522, lng: -87.62261, substation: { name: 'Crawford', kv: 138, miles: 1.4 }, circuit: { id: 'Z13733', netKw: 240 }, verdict: { key: 'study' }, source: 'omega-prime' };
var who = { uid: 'u1', email: 'Rep@ClearSky-USA.com', name: 'Rep', orgId: 'clearsky-usa.com' };
var base = { addr: '3400 S Federal St, Chicago, IL 60616', lat: 41.81522, lng: -87.62261, geoSrc: 'U.S. Census geocoder', geoLabel: '3400 S FEDERAL ST, CHICAGO, IL, 60616',
  step: 'start', unit: LG, grid: grid, load: { utility: 'ComEd', demandRate: 19.85, peaksKw: [1420], peakKw: 1420 },
  sub: { name: 'Crawford', kv: 138, minkv: undefined, owner: 'ComEd', status: 'IN SERVICE', lines: 4, lat: 41.83, lng: -87.7, mi: 1.4, src: 'https://services.example/hifld' } };
var d = PP.projectDoc(base, who, 'TS');
assert.equal(d.orgId, 'clearsky-usa.com'); assert.equal(d.uid, 'u1'); assert.equal(d.ownerEmail, 'rep@clearsky-usa.com'); count += 3;
assert.equal(d.type, 'bess'); assert.deepEqual(d.siteScopes, ['bess']); assert.equal(d.stage, 'candidate'); assert.equal(d.name, base.addr); assert.equal(d.address, base.addr); count += 5;
assert.deepEqual(d.mapState, { lat: 41.81522, lng: -87.62261, zoom: 19 }); count++;
assert.equal(d.grid, grid); assert.equal(d.load.demandRate, 19.85); assert.equal(d.createdAt, 'TS'); assert.equal(d.updatedAt, 'TS'); count += 4;
assert.deepEqual(d.elements, []); assert.deepEqual(d.conduits, []); assert.deepEqual(d.annotations, []); assert.ok(!('shapes' in d) && !('geoElements' in d), 'no drawing is forged'); count += 4;
assert.equal(d.prime.v, 2, 'prime v2 from the first write'); assert.equal(d.prime.step, 'start'); assert.equal(d.prime.savedAt, 'TS'); count += 3;
assert.deepEqual(d.prime.by, { uid: 'u1', email: 'rep@clearsky-usa.com' }); count++;
assert.deepEqual(d.prime.site, { lat: 41.81522, lng: -87.62261, label: base.geoLabel, src: 'U.S. Census geocoder', zip: '60616', addr: base.addr }); count++;
assert.equal(d.prime.unitKey, LGK); assert.deepEqual(d.prime.unit, LG, 'the unit as offered, snapshotted'); assert.notEqual(d.prime.unit, LG); count += 3;
assert.deepEqual(d.prime.sub, { name: 'Crawford', kv: 138, minkv: null, owner: 'ComEd', status: 'IN SERVICE', lines: 4, lat: 41.83, lng: -87.7, mi: 1.4 }, 'the substation without its source URL or an undefined'); count++;
assert.equal(d.prime.hosting, null); assert.ok(!('layout' in d.prime), 'no layout until something is drawn'); assert.ok(!('run' in d.prime)); count += 3;
assert.ok(!('quote' in d.prime) && !('order' in d.prime), 'the quote and the order are the server\'s'); count++;
assert.deepEqual(JSON.parse(JSON.stringify(d)), d, 'nothing undefined: Firestore takes it as it is'); count++;
var b0 = d.bessList[0];
assert.equal(d.bessList.length, 1); assert.equal(b0.catalogKey, LGK); assert.equal(b0.sku, 'CC-LGJP2-1000'); assert.equal(b0.kw, '1000'); assert.equal(b0.kwh, '2294'); assert.equal(b0.dur, '2.294'); count += 6;
assert.equal(b0._fromPrime, true); assert.equal(b0._incPCS, true); assert.equal(b0._incXfmr, false); assert.equal(b0.usable, ''); assert.equal(b0.acv, '480'); count += 5;
assert.equal(PP.bessEntry(R6)._incXfmr, true, 'the R60\'s entry tells Site Map not to add a transformer'); count++;
assert.ok(!('grid' in PP.projectDoc({ addr: 'x', lat: 1, lng: 2, unit: LG }, who)), 'no grid answer, no grid field'); count++;
assert.equal(PP.projectDoc({ addr: 'x', lat: 1, lng: 2, unit: LG, step: 'nowhere' }, who).prime.step, 'start'); count++;
var dDrawn = PP.projectDoc({ addr: base.addr, lat: C.lat, lng: C.lng, unit: LG, step: 'map', area: AREA, unitAt: C, poi: st.poi, conduit: true }, who, 'TS');
assert.deepEqual(dDrawn.prime.layout, L2, 'a drawing made before the record is the same layout v2'); count++;
['price', 'eqcost', 'listPrice', 'unitCost', 'cost'].forEach(function (k) {
  assert.ok(JSON.stringify(dDrawn).indexOf('"' + k + '"') < 0, 'no price on the record: ' + k); count++;
});

/* the update after the record exists */
var answer = { total: { base: 1140000, lo: 960000, hi: 1390000 }, divisions: [{ id: 'eq', name: 'Equipment & storage hardware', base: 700000, lines: [{}], perKwh: 300 }],
  estimateClass: 'Class 4', estimateClassPlain: 'A screening estimate', pricedBy: 'api/price-site', at: '2026-10-17T12:00:00.000Z', markups: [{}], financial: {} };
var stMap = { addr: base.addr, lat: C.lat, lng: C.lng, geoSrc: base.geoSrc, geoLabel: base.geoLabel, unit: LG, step: 'map', area: AREA, unitAt: C, poi: st.poi, conduit: true, run: answer, load: base.load };
var pt = PP.patch(stMap, who, 'TS2', { grid: { verdict: { key: 'fits' }, circuit: { id: 'Z1' } }, unitChanged: true });
assert.deepEqual(pt['prime.layout'], L2); assert.equal(pt['prime.step'], 'map'); assert.equal(pt['prime.savedAt'], 'TS2'); assert.equal(pt.updatedAt, 'TS2'); count += 4;
assert.deepEqual(pt['prime.run'], { input: PP.runInput(LG, L2), totalUsd: 1140000, loUsd: 960000, hiUsd: 1390000, divisions: [{ id: 'eq', name: 'Equipment & storage hardware', base: 700000 }],
  estimateClass: 'Class 4', estimateClassPlain: 'A screening estimate', pricedBy: 'api/price-site', at: '2026-10-17T12:00:00.000Z' }, 'the Run as the record keeps it, priced for exactly this drawing'); count++;
assert.deepEqual(pt['grid.verdict'], { key: 'fits' }); assert.ok(!('grid' in pt), 'the grid by its parts, never the whole map the editor keeps lists in'); count += 2;
assert.equal(pt.bessList[0].catalogKey, LGK); count++;
var pe = PP.patch(stMap, who, 'TS3', { editedInSiteMap: true, unitChanged: true });
assert.ok(!('updatedAt' in pe), 'once Site Map has saved, updatedAt is the editor\'s'); assert.equal(pe['prime.savedAt'], 'TS3'); assert.ok(!('bessList' in pe), 'and so is the battery list'); count += 3;
assert.equal(PP.patch({ unit: LG, area: AREA, unitAt: C }, who, 'TS')['prime.run'], null, 'a drawing with no Run clears a stale one'); count++;
assert.ok(Object.keys(pt).concat(Object.keys(pe)).every(function (k) { return k !== 'prime.quote' && k !== 'prime.order' && k.indexOf('prime.quote.') !== 0 && k.indexOf('prime.order.') !== 0; }), 'Prime never writes the quote or the order'); count++;

/* ── project types, from the editor's catalogs ─────────────────────── */
assert.equal(PP.primeType('evl2'), 'ev'); assert.equal(PP.primeType('datacenter'), 'compute'); assert.equal(PP.primeType('microgrid'), 'microgrid'); assert.equal(PP.primeType('solar+bess'), 'microgrid'); assert.equal(PP.primeType(''), ''); count += 5;
assert.equal(PP.linkQuery({ addr: '3400 S Federal St, Chicago, IL 60616', lat: 41.8, lng: -87.6, projectId: 'p1', type: 'evl2', step: 'logic' }),
  'addr=' + encodeURIComponent('3400 S Federal St, Chicago, IL 60616') + '&lat=41.8&lng=-87.6&project=p1&type=ev&step=logic'); count++;
assert.equal(PP.linkQuery({ step: 'quote' }), 'step=quote'); count++;
assert.equal(PP.linkQuery({ org: 'ClearSky-USA.com', projectId: 'p' }), 'project=p&org=clearsky-usa.com'); count++;
assert.equal(PP.linkQuery({ org: 'fenecon.de' }), 'org=fenecon.com'); count++;
assert.equal(PP.orgId('not an org'), ''); assert.equal(PP.linkQuery({ org: '../omega_orgs' }), ''); count += 2;
var CAT = require(path.join(ROOT, 'omega-site-catalogs.js'));
var edSrc = read('editor.html');
function sliceObj(name) {
  var token = 'var ' + name + ' = {', start = edSrc.indexOf(token), i = edSrc.indexOf('{', start), depth = 0, inStr = false, q = '', esc = false;
  if (start < 0) throw new Error(name);
  for (; i < edSrc.length; i++) {
    var c = edSrc[i];
    if (inStr) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '/' && edSrc[i + 1] === '/') { while (i < edSrc.length && edSrc[i] !== '\n') i++; continue; }
    if (c === '/' && edSrc[i + 1] === '*') { i += 2; while (i < edSrc.length && !(edSrc[i] === '*' && edSrc[i + 1] === '/')) i++; i++; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return edSrc.slice(start, i + 1); }
  }
  throw new Error('unclosed ' + name);
}
var catSrc = [sliceObj('EVC_POST'), sliceObj('EVC_UNIT'), sliceObj('EVC_L2'), sliceObj('EVC_CAB'), sliceObj('DC_CATALOG'), sliceObj('DER_PV_MODULES'), sliceObj('DERC_ALT')].join(';\n')
  + ';\nthis.EVC_POST=EVC_POST;this.EVC_UNIT=EVC_UNIT;this.EVC_L2=EVC_L2;this.EVC_CAB=EVC_CAB;this.DC=DC_CATALOG;this.MOD=DER_PV_MODULES;this.ALT=DERC_ALT;';
var live = {};
vm.runInNewContext(catSrc.replace(/img:EVIMG_[A-Z0-9_]+,?/g, ''), live);
function sameNums(got, src, fields, label) {
  fields.forEach(function (f) {
    var a = got[f] == null ? null : got[f], b = src[f] == null ? null : src[f];
    assert.equal(a, b, label + ' ' + f);
    count++;
  });
}
var ev = PP.forType('ev', null, CAT);
assert.ok(ev.some(function (u) { return u.key === 'tesla_v4_post'; }) && ev.some(function (u) { return u.key === 'autel_dh480'; }) && ev.some(function (u) { return u.key === 'autel_ac_pro'; }), 'EV chargers from the editor catalog'); count++;
ev.forEach(function (u) {
  var src = live.EVC_POST[u.key] || live.EVC_UNIT[u.key] || live.EVC_L2[u.key] || live.EVC_CAB[u.key];
  assert.ok(src, 'ev unit is in the editor catalog: ' + u.key); count++;
  sameNums(u, src, ['kw'], u.key);
  assert.equal(u.lFt, src.lf || null); assert.equal(u.wFt, src.wf || null); count += 2;
  ['price', 'eqcost', 'cost', 'listPrice'].forEach(function (f) { assert.ok(!(f in u), 'no price on ' + u.key); count++; });
});
var comp = PP.forType('compute', null, CAT);
Object.keys(live.DC).forEach(function (k) {
  var u = comp.filter(function (x) { return x.key === k; })[0];
  assert.ok(u, 'compute catalog unit ' + k); count++;
  assert.equal(u.kw, live.DC[k].kw); assert.equal(u.lFt, live.DC[k].lf); assert.equal(u.wFt, live.DC[k].wf); count += 3;
});
var sol = PP.forType('solar', null, CAT);
assert.equal(sol.filter(function (u) { return u.key === 'nextnrg-eagle-g7b'; })[0].watts, live.MOD['nextnrg-eagle-g7b'].watts); count++;
assert.equal(sol.filter(function (u) { return u.key === 'generic-550'; })[0].watts, live.MOD['generic-550'].watts); count++;
assert.ok(sol.some(function (u) { return u.key === 'array:rooftop'; }) && sol.some(function (u) { return u.key === 'array:fixed-ground'; }), 'array layouts from DER_SOLAR_PRESETS'); count++;
assert.ok(sol.every(function (u) { return u.kw == null; }), 'a module wattage is not invented into a system kW'); count++;
var mg = PP.forType('microgrid', null, CAT).map(function (u) { return u.key; });
HERO.concat(['nextnrg-eagle-g7b', 'array:rooftop', 'fuelcell', 'gen_diesel', 'gen_ng', 'microturbine']).forEach(function (k) {
  assert.ok(mg.indexOf(k) >= 0, 'microgrid includes ' + k); count++;
});
assert.ok(mg.indexOf('FENECON-IND-XXL') < 0, 'a microgrid offers FENECON\'s XXL only where FENECON is the workspace, as the battery list does'); count++;
assert.deepEqual(keysOf(PP.forType('bess', null)), HERO, 'a battery list is units(), Clean Cell\'s catalog found by itself'); assert.deepEqual(keysOf(PP.forType('bess', null, CAT, {})), ['CC-R60'], 'or the catalog the caller hands'); count += 2;
assert.deepEqual(keysOf(PP.forType('', null, CAT)), HERO, 'an unknown type is a battery'); count++;
assert.equal(PP.forType('microgrid', null, CAT).filter(function (u) { return u.key === 'fuelcell'; })[0].kw, live.ALT.fuelcell.kw); count++;
var evDoc = PP.projectDoc({ addr: base.addr, lat: base.lat, lng: base.lng, unit: ev[0], type: 'ev' }, who);
assert.equal(evDoc.type, 'ev'); assert.deepEqual(evDoc.bessList, []); assert.equal(evDoc.prime.type, 'ev'); count += 3;
assert.deepEqual(evDoc.siteScopes, ['ev']); assert.equal(evDoc.prime.unit.kind, 'ev'); assert.deepEqual(Object.keys(evDoc.prime.unit), PP.UNIT_KEYS, 'a charger is kept in the one unit shape'); count += 3;
assert.equal(d.prime.type, 'bess', 'a battery record says so'); assert.equal(PP.projectDoc({ addr: 'x', lat: 1, lng: 2, unit: LG, type: 'microgrid' }, who).siteScopes.join(','), 'bess,solar,der'); count += 2;
/* the unit rule: a battery, or not */
assert.ok(PP.screenable(LG) && PP.screenable(R6) && !PP.screenable(ev[0]) && !PP.screenable(sol[0]) && !PP.screenable(comp[0]) && !PP.screenable(null), 'screenable: a battery with power and energy'); count++;
assert.equal(LG.kind, 'bess'); assert.equal(PP.UNIT_KEYS[1], 'kind'); count += 2;
var gEv = PP.arrange(ev[0], C);
assert.equal(gEv.xfmr, null); assert.equal(gEv.disco, null); assert.equal(gEv.unit.footprint, 'catalog', 'a charger at its catalog footprint, with no battery gear beside it'); count += 3;
var LEv = PP.layout({ unit: ev[0], area: AREA, unitAt: C, poi: st.poi, conduit: true });
assert.deepEqual(LEv.conduit.pts[0], LEv.unit.c, 'its service run leaves the unit itself'); count++;
var evStored = JSON.parse(JSON.stringify(PP.projectDoc({ addr: base.addr, lat: C.lat, lng: C.lng, unit: ev[0], type: 'ev', step: 'map', area: AREA, unitAt: C, poi: st.poi, conduit: true }, who, 'TS')));
assert.equal(PP.typeOf(evStored), 'ev'); assert.equal(PP.typeOf({ type: 'bess', prime: { v: 2 } }), 'bess', 'a record before #348 is a battery'); assert.equal(PP.typeOf({ prime: { unit: { kind: 'gen' } } }), 'microgrid'); assert.equal(PP.typeOf({ type: 'evl2' }), 'ev'); count += 4;
var rEv = PP.restore(evStored, PP.forType('ev', null, CAT));
assert.equal(rEv.type, 'ev'); assert.equal(rEv.unit.key, ev[0].key); assert.equal(rEv.unit.kind, 'ev'); assert.deepEqual(rEv.layout, evStored.prime.layout); count += 4;
var rEvB = PP.restore(evStored, noTenant);
assert.equal(rEvB.unit.kind, 'ev', 'against a battery list it is still the charger it was, never a battery'); assert.ok(!PP.screenable(rEvB.unit)); count += 2;
assert.deepEqual(PP.patch({ unit: ev[0], type: 'ev' }, who, 'TS', { unitChanged: true }).bessList, [], 'a charger never writes a battery list'); assert.equal(PP.patch({ unit: ev[0], type: 'ev' }, who, 'TS')['prime.type'], 'ev'); count += 2;
assert.equal(PP.linkQuery({ lat: null, lng: null, step: 'quote' }), 'step=quote', 'no point is never lat=0'); count++;
assert.equal(PP.projectDoc({ addr: 'x', lat: 1, lng: 2, unit: PP.XXL, type: 'microgrid' }, who).type, 'microgrid'); count++;
var pgSrc = read('omega-prime.html');
assert.ok(pgSrc.indexOf('data-t="microgrid"') > 0 && pgSrc.indexOf('<small>next</small>') < 0 && !/data-t="ev"[^>]*disabled/.test(pgSrc), 'EV, Solar, Compute and Microgrid are selectable'); count++;
assert.match(pgSrc, /qp\('lat'\)/); assert.match(pgSrc, /PP\.primeType\(qp\('type'\)\)/); assert.match(pgSrc, /Sized in Site Map/); count += 3;

/* Site Map's push builds the same query */
var factsFn = edSrc.slice(edSrc.indexOf('function omegaAddrOk'), edSrc.indexOf('function omegaPushLogic'));
var fx = { document: { getElementById: function (id) { return id === 'addr-in' ? { value: '' } : (id === 'omega-addr-in' ? { value: '' } : null); } },
  _lastAddr: '3400 S Federal St, Chicago, IL 60616', _lastCenter: { lat: 41.81522, lng: -87.62261 }, _projectId: 'proj-9',
  OmegaProjectTypes: { current: function () { return 'datacenter'; } }, OmegaPrimeProject: PP, opened: '' };
fx.window = fx; fx.window.open = function (url) { fx.opened = url; };
vm.createContext(fx); vm.runInContext(factsFn + '\nomegaPushPrime();', fx);
assert.equal(fx.opened, '/omega-prime?' + PP.linkQuery({ addr: '3400 S Federal St, Chicago, IL 60616', lat: 41.81522, lng: -87.62261, projectId: 'proj-9', type: 'datacenter' })); count++;
vm.runInContext('omegaPushPrime("logic");', fx);
assert.ok(/step=logic$/.test(fx.opened), fx.opened); count++;
assert.match(edSrc, /<script src="\/omega-prime-project\.js"><\/script>/); assert.match(edSrc, /window\._lastAddr=addr/); assert.match(factsFn, /OmegaProjectTypes\.get/); count += 3;
fx.OmegaProjectTypes = { get: function () { return 'ev'; }, current: function () { return 'bess'; } };
fx._projectOrgId = 'nextnrg.com';
fx._projOrgId = function () { return 'clearsky-usa.com'; };
vm.runInContext('omegaPushPrime();', fx);
assert.ok(/type=ev(?:&|$)/.test(fx.opened) && /(?:^|&)org=nextnrg\.com(?:&|$)/.test(fx.opened.split('?')[1] || ''), fx.opened); count++;
fx._projectOrgId = '';
vm.runInContext('omegaPushPrime();', fx);
assert.ok(/(?:^|&)org=clearsky-usa\.com(?:&|$)/.test(fx.opened.split('?')[1] || ''), fx.opened); count++;

/* Site Map reads every field the record is made with */
assert.match(ed, /if\(d\.bessList\)S\.bessList=d\.bessList;/); assert.match(ed, /const ms = d\.mapState \|\| \{\};/); assert.match(ed, /S\.grid\s+= \(d\.grid\s+&& typeof d\.grid==='object'\)/);
assert.match(ed, /const savedAddr = d\.address/); assert.match(ed, /OmegaWorkspaces\.setProject\(d\.type, d\.siteScopes, true\)/); count += 5;
/* and none of what Prime writes or updates is a drawing key: the record is
   created with the drawing arrays EMPTY (a create is not subject to
   drawingWriteAllowed), and every update key's top segment is not one */
var rules = read('firestore.rules'), keys = JSON.parse(rules.match(/function drawingKeys\(\) \{\s*return (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
['grid', 'load', 'prime', 'bessList', 'mapState', 'updatedAt', 'name', 'address', 'type', 'siteScopes'].forEach(function (k) { assert.ok(keys.indexOf(k) < 0, 'Prime writes a drawing key: ' + k); count++; });
[d, dDrawn].forEach(function (doc) {
  Object.keys(doc).forEach(function (k) {
    assert.ok(keys.indexOf(k) < 0 || (Array.isArray(doc[k]) && doc[k].length === 0), 'projectDoc forges a drawing in ' + k); count++;
  });
});
[pt, pe].forEach(function (p) {
  Object.keys(p).forEach(function (k) { assert.ok(keys.indexOf(k.split('.')[0]) < 0, 'a Prime update touches a drawing key: ' + k); count++; });
});

/* ── 4 · resume: /omega-prime?id= ───────────────────────────────────── */
var saved = PP.projectDoc({ addr: base.addr, lat: C.lat, lng: C.lng, geoSrc: base.geoSrc, geoLabel: base.geoLabel, unit: LG, step: 'quote',
  area: AREA, unitAt: C, poi: st.poi, conduit: true, run: answer, grid: grid, load: base.load, sub: base.sub, hosting: { utility: 'ComEd', coverage: 'read', at: 'x', extra: undefined } }, who, 'TS');
saved = JSON.parse(JSON.stringify(saved));
var rs = PP.restore(saved, noTenant);
assert.equal(rs.isPrime, true); assert.equal(rs.v, 2); assert.equal(rs.addr, base.addr); assert.equal(rs.lat, C.lat); assert.equal(rs.lng, C.lng); count += 5;
assert.equal(rs.geoSrc, base.geoSrc); assert.equal(rs.geoLabel, base.geoLabel); assert.equal(rs.zip, '60616'); count += 3;
assert.deepEqual(rs.unit, LG, 'the unit, by key, from the list'); assert.deepEqual(rs.layout, L2); assert.equal(rs.layout.hash, L2.hash); count += 3;
assert.equal(rs.runFresh, true, 'the Run was priced for exactly this drawing'); assert.equal(rs.run.totalUsd, 1140000); assert.equal(rs.step, 'quote'); count += 3;
assert.deepEqual(rs.sub, saved.prime.sub); assert.deepEqual(rs.hosting, { utility: 'ComEd', coverage: 'read', at: 'x', extra: null }); assert.deepEqual(rs.grid, grid); assert.deepEqual(rs.load, base.load); count += 4;
assert.equal(rs.quote, null); assert.equal(rs.order, null); assert.equal(rs.editedInSiteMap, false); assert.equal(rs.editedAt, null); count += 4;
var moved = JSON.parse(JSON.stringify(saved)); moved.prime.layout = PP.layout({ unit: LG, area: AREA, unitAt: C, poi: { lat: 41.8158, lng: -87.6233 }, conduit: true });
assert.equal(PP.restore(moved, noTenant).runFresh, false, 'a drawing changed since the Run needs a Run'); count++;
var other = PP.restore(saved, [R6]);
assert.deepEqual(other.unit, LG, 'a unit no longer offered comes back from the snapshot'); count++;
var bare = JSON.parse(JSON.stringify(saved)); delete bare.prime.unit; bare.prime.unitKey = 'GONE';
var fromList = PP.restore(bare, [R6]).unit;
assert.equal(fromList.key, LGK); assert.equal(fromList.kw, 1000); assert.equal(fromList.footprint, 'none'); assert.deepEqual(Object.keys(fromList), PP.UNIT_KEYS, 'else from the battery entry'); count += 4;
var repDoc = JSON.parse(JSON.stringify(saved)); repDoc.prime.unit = PP.repFootprint(LG, 20, 8);
var repBack = PP.restore(repDoc, noTenant).unit;
assert.equal(repBack.footprint, 'rep'); assert.equal(repBack.lFt, 20); assert.equal(repBack.wFt, 8); count += 3;
/* a v1 record (what Prime wrote before 2026-10-17) */
var oldDoc = { address: base.addr, name: base.addr, mapState: { lat: 41.9, lng: -87.9, zoom: 19 }, bessList: [PP.bessEntry(LG)], grid: grid,
  prime: { v: 1, unitKey: LGK, geocode: 'U.S. Census geocoder', layout: v1, run: { totalUsd: 1, loUsd: 1, hiUsd: 1, pricedBy: 'api/price-site', at: 'x' } } };
var rOld = PP.restore(oldDoc, noTenant);
assert.equal(rOld.v, 1); assert.equal(rOld.lat, C.lat, 'the site point is the sketch\'s unit, not the editor\'s map centre'); assert.equal(rOld.geoSrc, 'U.S. Census geocoder'); count += 3;
assert.deepEqual(rOld.layout, up, 'its layout comes back as v2'); assert.equal(rOld.step, 'map'); assert.equal(rOld.runFresh, false, 'a v1 Run carries no input, so it is run again'); count += 3;
assert.deepEqual(rOld.sub, { name: 'Crawford', kv: 138, minkv: null, owner: '', status: '', lines: null, lat: null, lng: null, mi: 1.4 }, 'the substation from the grid answer'); count++;
var edited = JSON.parse(JSON.stringify(saved)); edited.savedBy = { tab: 't1', at: 1760700000000 };
var rEd = PP.restore(edited, noTenant);
assert.equal(rEd.editedInSiteMap, true); assert.equal(rEd.editedAt, 1760700000000); count += 2;
var withEls = JSON.parse(JSON.stringify(saved)); withEls.elements = [{ id: 'e1' }];
assert.equal(PP.restore(withEls, noTenant).editedInSiteMap, true, 'a drawing on the record is Site Map\'s'); count++;
var oneTab = JSON.parse(JSON.stringify(saved)); oneTab.docTabs = [{ id: 'main' }];
assert.equal(PP.restore(oneTab, noTenant).editedInSiteMap, false); oneTab.docTabs.push({ id: 'two' }); assert.equal(PP.restore(oneTab, noTenant).editedInSiteMap, true); count += 2;
var ordered = JSON.parse(JSON.stringify(saved)); delete ordered.prime.step; ordered.prime.order = { org: 'cleancell.us', id: 'prime_x', orderNo: 'PO-1', at: 'x' }; ordered.prime.quote = { id: 'qt-1', status: 'approved' };
var rOr = PP.restore(ordered, noTenant);
assert.equal(rOr.step, 'track'); assert.equal(rOr.order.orderNo, 'PO-1'); assert.equal(rOr.quote.status, 'approved'); count += 3;
var notPrime = PP.restore({ address: '1 Main St', mapState: { lat: 1, lng: 2 }, elements: [{}] }, noTenant);
assert.equal(notPrime.isPrime, false); assert.equal(notPrime.step, 'start'); assert.equal(notPrime.unit, null); assert.equal(notPrime.layout, null); assert.equal(notPrime.lat, 1); count += 5;

/* the unit a record resumes with: ONE rule, PP.unitFor(doc, units), which
   Prime's resume, the quote server's Run and Site Map's build all ask
   (through restore()). A v1 record kept no unit snapshot and gave every
   workspace without products the FENECON XXL; the shipped constants are
   known by key, so its sketch is replayed at the XXL's size wherever it
   resumes (review prime-editor:1, 2026-10-17). */
assert.deepEqual(PP.unitFor(saved, noTenant), LG, 'the list\'s own entry by key'); count++;
var kDoc = { prime: { unitKey: SMK, unit: PP.snapshot(LG) }, bessList: [PP.bessEntry(C290)] };
assert.equal(PP.unitFor(kDoc, noTenant).key, SMK, 'prime.unitKey first'); delete kDoc.prime.unitKey;
assert.equal(PP.unitFor(kDoc, noTenant).key, LGK, 'then the snapshot\'s key'); delete kDoc.prime.unit;
assert.equal(PP.unitFor(kDoc, noTenant).key, CCK, 'then the battery entry\'s catalog key'); count += 3;
assert.deepEqual(PP.unitFor(repDoc, noTenant), PP.repFootprint(LG, 20, 8), 'a footprint the rep typed survives the list\'s entry'); count++;
assert.deepEqual(PP.unitFor(saved, [R6]), LG, 'not on the list: the snapshot Prime kept'); count++;
var v1x = { bessList: [{ id: 'prime-1', name: 'BESS-01', mfr: 'FENECON', model: 'Industrial XXL', chem: 'LFP, liquid-cooled', kwh: '5015', usable: '4750', kw: '2508', dur: '2', acv: '480', qty: '1', catalogKey: 'FENECON-IND-XXL', _fromPrime: true }],
  prime: { v: 1, unitKey: 'FENECON-IND-XXL', geocode: 'U.S. Census geocoder', layout: v1 } };
assert.deepEqual(PP.unitFor(v1x, noTenant), PP.snapshot(PP.XXL), 'a v1 XXL record on a list without it: the shipped XXL, never a unit with no footprint'); count++;
assert.deepEqual(PP.unitFor(v1x, []), PP.XXL); assert.deepEqual(PP.unitFor(v1x), PP.XXL, 'with no list at all'); assert.notEqual(PP.unitFor(v1x), PP.XXL, 'as a copy'); count += 3;
assert.deepEqual(PP.unitFor({ bessList: [PP.bessEntry(R6)], prime: { v: 1, unitKey: 'CC-R60', layout: v1 } }, []), PP.R60, 'the R60 likewise'); count++;
var fenXxl = PP.snapshot(PP.XXL); fenXxl.vendorOrgId = 'fenecon.com'; fenXxl.source = 'own-shipped';
assert.deepEqual(PP.unitFor(v1x, [fenXxl]), fenXxl, 'a list that carries the XXL (FENECON\'s own) still wins'); count++;
var v1o = { bessList: [{ id: 'prime-1', mfr: 'Acme', model: 'Box 9', kwh: '400', kw: '200', qty: '1', catalogKey: 'ACME-BOX-9' }], prime: { v: 1, unitKey: 'ACME-BOX-9', layout: v1 } };
var boxU = PP.unitFor(v1o, noTenant);
assert.equal(boxU.key, 'ACME-BOX-9'); assert.equal(boxU.footprint, 'none', 'any other unit no list carries: the battery entry, footprint unknown'); assert.deepEqual(Object.keys(boxU), PP.UNIT_KEYS); count += 3;
assert.equal(PP.unitFor({}, noTenant), null, 'nothing to go on: no unit'); assert.equal(PP.unitFor(null), null); count += 2;
var rX = PP.restore(JSON.parse(JSON.stringify(v1x)), noTenant);
assert.deepEqual(rX.unit, PP.snapshot(PP.XXL), 'restore() resumes with unitFor\'s unit'); assert.deepEqual(rX.layout, PP.upgrade(v1, PP.XXL), 'so the v1 XXL sketch comes back at the XXL\'s size'); count += 2;
assert.equal(rX.layout.unit.footprint, 'catalog'); assert.equal(rX.layout.unit.lFt, 20); count += 2;
near(PP.pathFt([rX.layout.unit.c, rX.layout.xfmr.c]), 10 + 5 + 4, 0.05, 'its transformer 5 ft clear of a 20 ft container, not of a point');
near(PP.pathFt([rX.layout.unit.c, rX.layout.disco.c]), 10 + 5 + 8 + 5 + 1.5, 0.05, 'its disconnect 5 ft clear of the transformer');
assert.deepEqual(PP.restore(JSON.parse(JSON.stringify(v1x)), [fenXxl]).layout, rX.layout, 'the same layout in FENECON\'s workspace and in any other'); count++;
assert.equal(PP.runInput(rX.unit, rX.layout).poiFt, Math.round(rX.layout.conduit.ft), 'and the same Run input'); count++;

/* ── the page ───────────────────────────────────────────────────────── */
var pg = read('omega-prime.html');
var js = pg.slice(pg.lastIndexOf('<script>'), pg.lastIndexOf('</script>'));
/* holds no verdict rule: the circuit is the server's (POST /api/hosting-capacity) through the one client */
['net >= UNIT.kw', 'else if (net > 0)', 'SMALLEST_OFFER_KW', "'<b>Fits.</b>", 'publishedKw - ', 'publishedKw -', '- c.queuedKw', '- vc.queuedKw'].forEach(function (t) { assert.ok(js.indexOf(t) < 0, 'a verdict rule is in Omega Prime: ' + t); count++; });
assert.ok(!/netKw\s*=[^=]|headroomKw\s*=[^=]/.test(js), 'the page computes no room on a circuit'); count++;
assert.match(js, /hostingAsk = GV\.hosting\(body\)\.then\(/, 'the circuit is asked of the national door through the one client'); count++;
assert.match(js, /var f = GV && S\.hosting \? GV\.fromHosting\(S\.hosting\) : null;/, 'the grid record is the client\'s fromHosting'); count++;
assert.match(js, /S\.hostingSum = GV\.hostingSummary\(res\)/, 'prime.hosting is the client\'s hostingSummary'); count++;
assert.ok(js.indexOf('GV.ask(') < 0 && js.indexOf('GV.circuitBody(') < 0 && js.indexOf('probePoint') < 0 && js.indexOf('OmegaComEdLayers') < 0, 'the one-utility probe is gone'); count++;
assert.ok(pg.indexOf('omega-comed-layers.js') < 0, 'omega-comed-layers.js is not loaded'); count++;
/* the shared modules, in order: the products, Clean Cell's catalog, the grid client, Prime's pure half, the deck */
var order = ['/omega-bess-products.js', '/omega-cleancell-catalog.js?v=20261010-revh2', '/omega-site-catalogs.js', '/omega-grid-verdict.js', '/omega-prime-project.js', '/omega-quote-deck.js'].map(function (f) { return pg.indexOf('<script src="' + f + '"></script>'); });
assert.ok(order.every(function (i, k) { return i > 0 && (k === 0 || i > order[k - 1]); }), 'the shared modules load in order: ' + order.join(',')); count++;
/* the units: the project type's list (main #348) — a battery's is the
   workspace's list and Clean Cell's catalog through PP.forType → units; no
   XXL default */
assert.match(js, /var l = PP\.forType\(t, tenantList, window\.OmegaSiteCatalogs, CCOK \? OmegaCleanCellCatalog\.entries\(\) : \{\}\);/); count++;
assert.match(js, /var UNITS = listFor\('bess'\);/); count++;
assert.match(js, /B\.load\(\)\.then\(function \(t\) \{\s*tenantList = t;\s*if \(!S\.addr\) \{ showType\(S\.type, true\); return; \}/, 'the workspace\'s list redraws the type, a pick kept'); count++;
assert.ok(js.indexOf('PP.XXL') < 0, 'no FENECON default unit on the page'); count++;
assert.ok(!/fenecon/i.test(pg) && !/--fen\b/.test(pg), 'no FENECON name or colour on the page'); count++;
/* the customer's Email field and the Email-it button are two ids: one id
   for both sent the proposal when the rep clicked into the field (review,
   2026-10-17) */
assert.equal((pg.match(/id=\\?"pq-email\\?"/g) || []).length, 1, 'one #pq-email: the address field'); count++;
assert.match(pg, /id="pq-send-email"/); assert.match(pg, /\$\('#pq-send-email'\)\)\) b\.onclick = function \(\) \{ if \(!this\.getAttribute\('aria-disabled'\)\) send\('email'\)/); count += 2;
assert.ok(!/\$\('#pq-email'\)\)\) b\.onclick/.test(pg), 'the address field never sends'); count++;
assert.match(js, /PP\.repFootprint\(BASE, \$\('#fpL'\)\.value, \$\('#fpW'\)\.value\)/, 'a unit with no released footprint takes the submittal\'s'); count++;
assert.ok(js.indexOf('95,000') < 0 && js.indexOf('unitWords(UNIT)') > 0, 'the guide\'s words come from the unit'); count++;
/* the record: created at Start by projectDoc, every change after a PP.patch */
assert.match(js, /db\.collection\('projects'\)\.add\(PP\.projectDoc\(docState\('start'\), w, FV\.serverTimestamp\(\)\)\)/); count++;
assert.match(js, /history\.replaceState\(null, '', '\/omega-prime\?id=' \+ encodeURIComponent\(ref\.id\)\)/); count++;
assert.match(js, /var p = PP\.patch\(docState\(\), S\.who \|\| \{\}, FV\.serverTimestamp\(\), \{ grid: parts, editedInSiteMap: S\.editedInSiteMap \}\);/); count++;
assert.match(js, /\.doc\(S\.projectId\)\.update\(p\)/); count++;
assert.equal((js.match(/\.update\(/g) || []).length, 1, 'one write path after the create: the patch'); count++;
assert.ok(!/\.set\(|updatedAt:/.test(js), 'no whole-document write and no updatedAt of its own (PP.patch decides it)'); count++;
keys.forEach(function (k) { assert.ok(!new RegExp("['\"]" + k + "['\"]\\s*:|\\." + k + "\\s*=").test(js), 'the page writes no drawing key: ' + k); count++; });
assert.match(js, /var d = snap\.data\(\) \|\| \{\}, T = PP\.typeOf\(d\), list = listFor\(T\);\s*var R = PP\.restore\(d, list\);/, 'resume restores through PP.restore, against the record\'s own type'); count++;
assert.match(js, /if \(!R\.isPrime\) \{[^\n]*return; \}\s*S\.type = T; UNITS = list; paintTypes\(\);/, 'and takes the type only for a Prime record'); count++;
/* the geometry is Prime's pure half: arrange, the conduit from the feed, its ground length, layout v2 */
assert.match(js, /PP\.arrange\(UNIT, S\.unitAt\)/); assert.match(js, /PP\.conduitPath\(PP\.feed\(G\)\.c, S\.poi\), ft = PP\.pathFt\(pts\)/); assert.match(js, /PP\.layout\(\{ unit: UNIT, area: S\.area, unitAt: S\.unitAt, poi: S\.poi, conduit: S\.conduit \}\)/); count += 3;
assert.ok(js.indexOf('function miles(a, b) { var R = ') < 0 && js.indexOf('111320') < 0, 'no second geometry on the page'); count++;
/* the Run is the one input */
assert.match(js, /input = PP\.runInput\(UNIT, layout\)/); assert.match(js, /S\.run = PP\.runRecord\(j, input\)/); count += 2;
/* the rates: the utility the circuit named, the ZIP kept as the literal prefix */
assert.match(js, /fetch\('\/api\/utility-rates\?zip=' \+ encodeURIComponent\(zip\) \+ \(u && u\.eiaId \? '&eia=' \+ encodeURIComponent\(u\.eiaId\) \+ '&name=' \+ encodeURIComponent\(u\.display \|\| ''\) : ''\)/); count++;
assert.match(js, /r\._rateNote/); count++;
/* one utility's name only where that utility serves the site: the page names none itself */
var bare = js.replace(/if \([^)]*key === 'comed'[^)]*\) \{[^}]*\}/g, '');
assert.ok(!/ComEd/.test(bare), 'no ComEd wording outside a branch for a site ComEd serves'); count++;
assert.match(js, /Check it on ' \+ esc\(res\.verify\.label/, 'the utility\'s own map, named from the answer'); count++;
/* homed as userOrg() is: the claim, then the email domain */
assert.match(js, /var claim = r && r\.claims && r\.claims\.orgId;/); assert.match(js, /orgId: claim \? String\(claim\) : \(B && B\.orgOf \? B\.orgOf\(u\.email\) : ''\)/); count += 2;
/* Site Map: the saved project, the Guided Build only when Prime placed no unit, the pending save written first */
assert.match(js, /'\/editor\.html\?id=' \+ encodeURIComponent\(S\.projectId\) \+ \(S\.unitAt && bat\(\) \? '' : '&from=prime'\)/); count++;
assert.match(js, /flushSave\(\)\.then\(function \(\) \{\s*if \(SV\.state === 'error'\)[\s\S]{0,200}location\.href = href;/, 'the editor link waits for the save'); count++;
/* the proposal: the door, the deck, the seller's company through tenant-branding */
assert.match(js, /fetch\('\/api\/customer-quote' \+ \(query \? '\?' \+ query : ''\), o\)/); count++;
assert.match(js, /cq\('POST', formBody\('preview'\)\)/); assert.match(js, /cq\('POST', formBody\('save'\)\)/); assert.match(js, /action: 'send', id: q\.id, sendId: QS\.sendId, deliver: deliver/); count += 3;
assert.match(js, /'projectId=' \+ encodeURIComponent\(S\.projectId\)/, 'the screen reopens the project\'s latest quote'); count++;
assert.match(js, /D\.body\(v\)/); assert.match(js, /D\.print\(QS\.view\)/); assert.match(js, /st\.textContent = D\.css\(\)/); count += 3;
assert.match(js, /fetch\('\/api\/tenant-branding', \{ method: 'POST'[\s\S]{0,200}JSON\.stringify\(\{ orgId: wsOrg\(\), company: co \}\)/); count++;
assert.ok(!/markupPct \* |\* \(1 \+|sellCents|marginCents/.test(js), 'the page does no arithmetic on the price: the server does'); count++;
/* Track: the ladder, and Omega Logic in the workspace you are in */
assert.match(js, /return '\/omega-logic\?org=' \+ encodeURIComponent\(ws\) \+ '&order=' \+ encodeURIComponent\(h\.orderId\) \+ '#orders';/); assert.match(js, /return '\/omega-logic\?org=' \+ encodeURIComponent\(ws\);/); count += 2;
assert.match(js, /var ws = wsOrg\(\)/); assert.match(js, /function wsOrg\(\) \{ return S\.orgId \|\| \(S\.who && S\.who\.orgId\) \|\| ''; \}/); count += 2;
assert.match(js, /\/rfq\.html#customer-' \+ encodeURIComponent\(q\.id\)/); assert.match(js, /\/logic-custody\.html\?org=' \+ encodeURIComponent\(custodyOrg\)/); assert.match(js, /action: 'handoff', id: q\.id/); count += 3;
assert.match(pg, /\['start', 'Site'\], \['atlas', 'Grid Atlas'\], \['circuit', 'Circuit'\], \['load', 'Load'\], \['map', 'Site Map'\], \['quote', 'Proposal'\], \['track', 'Track'\]/, 'the path bar'); count++;
assert.ok(!/=>|`|\bconst\s|\blet\s|\basync\s/.test(js), 'the page script is ES5'); count++;
/* main #348 on this page: every project type, Site Map's link read, a
   unit that is not a battery carried through as quote required, Omega
   Logic opened on the project's org or the person's own — never the bare
   directory, and a link org is the safe id */
assert.ok(pg.indexOf('data-t="microgrid"') > 0 && pg.indexOf('<small>next</small>') < 0 && !/data-t="(ev|solar|compute|microgrid)"[^>]*disabled/.test(pg), 'EV, Solar, Compute and Microgrid are selectable'); count++;
assert.match(js, /type: S\.type, unit: UNIT,/, 'the record is made with the type'); count++;
assert.match(js, /var lat = parseFloat\(qp\('lat'\)\), lng = parseFloat\(qp\('lng'\)\);/); assert.match(js, /var t = PP\.primeType\(qp\('type'\)\); if \(t\) showType\(t\);/); assert.match(js, /var org = PP\.orgId\(qp\('org'\)\); if \(org\) S\.linkOrg = org;/); count += 3;
assert.match(js, /if \(!hit && S\.handed && S\.handed\.addr === q\) hit = \{ lat: S\.handed\.lat, lng: S\.handed\.lng, label: q, src: 'Site Map' \};/, 'Site Map\'s point stands in for its own, unedited address'); count++;
assert.ok(js.indexOf('S.projectId = pid') < 0 && /S\.editorProjectId = pid/.test(js), 'Site Map\'s project id is never taken as Prime\'s own: resumePushed decides'); count++;
assert.match(js, /function logicOrg\(\) \{ return PP\.orgId\(S\.orgId\) \|\| S\.linkOrg \|\| PP\.orgId\(S\.who && S\.who\.orgId\) \|\| ''; \}/, 'Omega Logic\'s org: the project, the link, the person — each the safe id'); count++;
assert.match(js, /href="\/omega-logic\?org=' \+ encodeURIComponent\(org\)/); assert.match(js, /href="\/logic-custody\.html\?org=' \+ encodeURIComponent\(org\)/); count += 2;
assert.ok(!/href="\/omega-logic"/.test(pg), 'never the bare /omega-logic directory'); count++;
assert.match(js, /if \(!bat\(\)\) \{ otherQuote\(\); return; \}/); assert.match(js, /if \(!bat\(\)\) \{ otherCircuit\(null, msg\); return; \}/); assert.match(js, /if \(!bat\(\)\) \{ otherCircuit\(res, ''\); return; \}/); count += 3;
assert.match(js, /unit: asked \? \{ kw: UNIT\.kw, kwh: UNIT\.kwh, name: UNIT\.name \} : null/, 'a unit that is not a battery is never judged at the door'); assert.match(js, /var g = asked \? gridRecord\(\) : null;/, 'nor written to the grid record'); count += 2;
assert.match(js, /st\('#ed-run', S\.conduit && bat\(\), !!S\.run\);/); assert.match(js, /st\('#ed-quote', !!S\.run \|\| !bat\(\), false\);/); count += 2;
assert.ok((pg.match(/Sized in Site Map/g) || []).length >= 3 && (pg.match(/Quote required/g) || []).length >= 3, 'the words a non-battery step says'); count++;
/* main (Editor v2 and the design order) on this page: a v2 project opens
   in /editor-v2, and Send to the OEM opens the maker's purchase order
   through /api/rfq, by the maker's SKU, on the rep's side of the Proposal
   step — never on the customer's deck */
assert.match(js, /S\.editorVersion = qp\('editor'\) === 'v2' \? 'v2' : 'classic';/); assert.match(js, /if \(d\.editor === 'v2'\) S\.editorVersion = 'v2';/); count += 2;
assert.match(js, /if \(S\.projectId && S\.editorVersion === 'v2'\) return '\/editor-v2\?id=' \+ encodeURIComponent\(S\.projectId\) \+ '&from=prime';/); count++;
assert.match(js, /fetch\('\/api\/rfq', \{ method: 'POST'/); assert.match(js, /sku: UNIT\.sku \|\| UNIT\.key \|\| ''/); assert.match(js, /estimateUsd: S\.run && S\.run\.totalUsd != null \? S\.run\.totalUsd : null/); count += 3;
assert.ok(js.indexOf("+ oemBox() + listHtml('pq')") > 0 && js.indexOf('h += oemBox();') > 0 && /'<\/div>' \+ oemBox\(\);/.test(js), 'Send to the OEM sits on the rep\'s side, battery or not'); count++;
assert.ok(!/q-oem|api\/rfq/.test(read('omega-quote-deck.js')), 'never on the customer\'s deck'); count++;
/* a calendar day stays that day in every time zone: the ladder carries
   custody's days as midnight UTC, and Track read "Shipped Sep 27" in
   Chicago for a unit shipped on Sep 28 (2026-10-20). The page's own reader,
   run under real time zones west and east of UTC. */
var dayFns = pg.slice(pg.indexOf('function ymdOf('), pg.indexOf('/* a valid-until DATE'));
function daysIn(tz) {
  return JSON.parse(require('child_process').execFileSync(process.execPath, ['-e', dayFns + ';process.stdout.write(JSON.stringify([day("2026-09-28T00:00:00.000Z"), day("2026-09-28"), day("2026-09-28T15:00:00.000Z"), day("2026-10-06T00:00:00Z")]))'],
    { env: Object.assign({}, process.env, { TZ: tz }) }).toString());
}
['America/Chicago', 'America/Phoenix', 'Pacific/Honolulu', 'UTC', 'Asia/Tokyo'].forEach(function (tz) {
  /* a real instant (3 pm UTC) still reads in local time: past midnight in Tokyo */
  assert.deepEqual(daysIn(tz), ['Sep 28, 2026', 'Sep 28, 2026', tz === 'Asia/Tokyo' ? 'Sep 29, 2026' : 'Sep 28, 2026', 'Oct 6, 2026'], 'a ladder day is its calendar day in ' + tz); count++;
});
assert.match(ed, /<script src="\/omega-grid-panel\.js"><\/script>[\s\S]{0,400}<script src="\/omega-prime-handoff\.js"><\/script>/); count++;

/* The Site Map hand-off's VM checks moved to scripts/tests/tprimetransfer.js (2026-10-17). */

/* ── 5 · whose list: the workspaces, through the real loader ────────── */
global.window = global;
var BP = require(path.join(ROOT, 'omega-bess-products.js'));
var OPT = { isOwn: BP.isOwn };
function fakeFirebase(record, products) {
  return { apps: [1], firestore: function () { return { collection: function () { return { doc: function () { return {
    collection: function () { return { doc: function () { return { get: function () { return Promise.resolve({ exists: true, data: function () { return { products: products || [] }; } }); } }; } }; },
    get: function () { return Promise.resolve({ exists: !!record, data: function () { return record; } }); }
  }; } }; } }; } };
}
function tenantOf(org, record, products) {
  global.CLEARSKY_CONFIG = { tenant: { orgId: org } };
  global.firebase = fakeFirebase(record, products);
  BP._reset();
  return BP.load();
}
var CLEAN = json('tenants/cleancell/tenant.json'), FEN = json('tenants/fenecon/tenant.json');
var PLACEHOLDERS = json('tenants/cleancell/products.json');
var ACME = { name: 'Acme Power', vertical: 'oem', whiteLabel: { enabled: true, shortName: 'Acme' } };
var ACME_PRODUCTS = [{ sku: 'AP-500', name: 'AP 500 cabinet', kw: 250, kwh: 500, widthFt: 10, depthFt: 8, heightFt: 8.5, chem: 'LFP', integrates: { pcs: true, xfmr: false, disco: true } }];

assert.deepEqual(CLEAN.brands, ['cleancell us', 'cleancell', 'clean cell'], 'Clean Cell\'s lines route to its workspace (api/rfq.js brands)'); count++;
assert.ok(CLEAN.brands.indexOf(String(PP.R60.mfr).toLowerCase()) >= 0 && CLEAN.brands.indexOf(String(LG.mfr).toLowerCase()) >= 0, 'by both names its units are made under'); count++;

tenantOf('cleancell.us', CLEAN, []).then(function (t) {
  assert.equal(t.ownOnly, true, 'Clean Cell is an own-only manufacturer'); count++;
  var list = PP.units(t, REFS, OPT);
  assert.deepEqual(keysOf(list), HERO, 'Clean Cell\'s own workspace: its Rev H units and the R60'); count++;
  assert.ok(list.every(function (u) { return u.source === 'own-shipped' && u.vendorOrgId === 'cleancell.us'; }), 'counted as its own, made by it'); count++;
  return tenantOf('cleancell.us', CLEAN, PLACEHOLDERS);
}).then(function (t) {
  assert.equal(t.count, PLACEHOLDERS.length, 'the placeholder slots load as products'); count++;
  var list = PP.units(t, REFS, OPT);
  assert.deepEqual(keysOf(list), HERO, 'and Prime drops every PLACEHOLDER SPEC row'); count++;
  assert.ok(PLACEHOLDERS.every(function (p) { return /PLACEHOLDER SPEC/.test(p.notes); })); count++;
  return tenantOf('cleancell.us', CLEAN, [{ sku: 'CC290-125', name: 'CC290/125 cabinet', kw: 125, kwh: 289.3, widthFt: 3.94, depthFt: 4.36, mfr: 'CleanCell US' }]);
}).then(function (t) {
  var list = PP.units(t, REFS, OPT);
  assert.deepEqual(keysOf(list), ['CLEANCELL-CC290-125', LGK, SMK, 'CC-R60'], 'its own published CC290 leads, and the reference copy is not listed twice'); count++;
  assert.equal(list[0].source, 'tenant'); assert.equal(list[0].sourceDoc, 'Clean Cell product list'); count += 2;
  return tenantOf('fenecon.com', FEN, []);
}).then(function (t) {
  assert.equal(t.ownOnly, false, 'FENECON is not own-only (no white label)'); count++;
  var list = PP.units(t, REFS, OPT);
  assert.deepEqual(keysOf(list), ['FENECON-IND-XXL'].concat(HERO), 'FENECON\'s workspace: its XXL first, then the list'); count++;
  assert.equal(list[0].source, 'own-shipped'); assert.equal(list[0].vendorOrgId, 'fenecon.com'); assert.equal(list[1].source, 'reference'); count += 3;
  assert.deepEqual(list[0], (function () { var x = JSON.parse(JSON.stringify(PP.XXL)); x.vendorOrgId = 'fenecon.com'; return x; })()); count++;
  return tenantOf('fenecon.com', FEN, [{ sku: 'IND-XXL', name: 'Industrial XXL', kw: 2508, kwh: 5015, widthFt: 20, depthFt: 8 }]);
}).then(function (t) {
  var list = PP.units(t, REFS, OPT);
  assert.equal(list.filter(function (u) { return /xxl/i.test(u.name); }).length, 1, 'no second XXL when its own list carries one'); count++;
  return tenantOf('clearsky-usa.com', { name: 'ClearSky', vertical: 'developer' }, []);
}).then(function (t) {
  var list = PP.units(t, REFS, OPT);
  assert.deepEqual(keysOf(list), HERO, 'a generic workspace: Clean Cell\'s units, no XXL'); count++;
  assert.ok(list.every(function (u) { return u.source === 'reference' && u.vendorOrgId === null; })); count++;
  return tenantOf('acmepower.com', ACME, ACME_PRODUCTS);
}).then(function (t) {
  var list = PP.units(t, REFS, OPT);
  assert.deepEqual(keysOf(list), ['ACMEPOWER-AP-500'], 'another own-only manufacturer: its own unit, Clean Cell\'s hidden'); count++;
  var a = list[0];
  assert.equal(a.source, 'tenant'); assert.equal(a.vendorOrgId, 'acmepower.com'); assert.equal(a.mfr, 'Acme'); assert.equal(a.lFt, 10); assert.equal(a.wFt, 8); count += 5;
  assert.equal(a.incPcs, true); assert.equal(a.incDisco, true); assert.equal(a.incXfmr, false); count += 3;
  var g = PP.arrange(a, C);
  assert.ok(g.xfmr && !g.disco, 'a disconnect it integrates is not drawn'); assert.equal(PP.feed(g), g.xfmr); count += 2;
  return tenantOf('acmepower.com', ACME, []);
}).then(function (t) {
  assert.deepEqual(keysOf(PP.units(t, REFS, OPT)), HERO, 'with none of its own it falls back to Clean Cell\'s: nobody gets an empty list'); count++;
  /* no price on any unit, on any list */
  return Promise.all([tenantOf('cleancell.us', CLEAN, []), tenantOf('fenecon.com', FEN, [])]);
}).then(function (ts) {
  var every = PP.units(ts[0], REFS, OPT).concat(PP.units(ts[1], REFS, OPT), noTenant, [PP.XXL, PP.R60]);
  every.forEach(function (u) {
    ['price', 'eqcost', 'cost', 'listPrice', 'unitCost', 'priceMode', 'usd'].forEach(function (k) { assert.ok(!(k in u), 'no price on a unit: ' + u.key + '.' + k); count++; });
    assert.ok(!/\$\s?\d|24,?000|639,?000/.test(JSON.stringify(u)), 'no dollar figure on ' + u.key); count++;
  });
  console.log('tomegaprime: ' + count + ' assertions passed');
}).catch(function (e) { console.error(e); process.exit(1); });
