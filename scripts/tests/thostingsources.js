#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * National hosting capacity (DESIGN C6, 2026-10-17). Offline. Holds:
 *   - the ONE registry (api/_lib/hosting-sources.js): its shape, an explicit
 *     entry (verified, account or none) for every utility the editor's
 *     jurisdiction table names in IL FL GA NJ AZ CA CT MA RI, ComEd named
 *     through comed-service.js and never pasted, and a coverage projection
 *     that carries no URL and no field;
 *   - the parse rules and the adapters, on attribute rows recorded from the
 *     live services on 2026-10-17 (research and verification files), one or
 *     more per verified source, with the kW each must give;
 *   - the territory rules (api/_lib/utility-territory.js) and the door
 *     (api/hosting-capacity.js) run end to end on a fake network and a fake
 *     Firestore: Rockford, Decatur, Phoenix, Panama City, Norwalk, Atlanta,
 *     the cache (7 days, 24 hours, never an error), a bot wall, a moved
 *     service, a timeout, outside the states, outside every territory;
 *   - the door's gate, and the browser client's fromHosting in a VM. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function ok(v, m) { assert.ok(v, m); count++; }
function eq(a, b, m) { assert.equal(a, b, m); count++; }
function deq(a, b, m) { assert.deepEqual(a, b, m); count++; }
/* firebase-admin is intercepted at load, as tclientadmin.js and thomeclaim.js
   do: CI runs this with no npm install (tests.yml), and api/_lib/admin.js
   requires it at load. Nothing here reaches Firestore or Auth; the stand-in
   only lets the modules load, the same in CI as on a laptop with
   node_modules. */
var Module = require('module'), _load = Module._load;
function noFirebase() { throw new Error('firebase-admin is a stand-in in this test'); }
var FAKE_ADMIN = { apps: [], initializeApp: function () { FAKE_ADMIN.apps.push({}); }, credential: { cert: function (k) { return k; } }, firestore: noFirebase, auth: noFirebase };
Module._load = function (request) { return request === 'firebase-admin' ? FAKE_ADMIN : _load.apply(this, arguments); };
try { require(path.join(ROOT, 'api/_lib/admin.js')); } finally { Module._load = _load; }
var HS = require(path.join(ROOT, 'api/_lib/hosting-sources'));
var UT = require(path.join(ROOT, 'api/_lib/utility-territory'));
var CS = require(path.join(ROOT, 'api/_lib/comed-service'));
var GV = require(path.join(ROOT, 'api/_lib/grid-verdict'));
var H = require(path.join(ROOT, 'api/hosting-capacity'))._helpers;
var T = HS._t;

/* ── the registry ───────────────────────────────────────────────────── */
var STATUS = ['verified', 'metadata', 'candidate', 'account', 'none'];
var keys = {};
HS.ENTRIES.forEach(function (e) {
  ok(/^[a-z0-9-]+$/.test(e.key) && !keys[e.key], 'a unique key: ' + e.key); keys[e.key] = true;
  ok(e.display && Array.isArray(e.eiaIds) && Array.isArray(e.states) && e.states.length, e.key + ' names, ids, states');
  ok(STATUS.indexOf(e.status) >= 0, e.key + ' status');
  ok(e.verifiedAt === HS.VERIFIED_AT || (e.verifiedAt === HS.AZ_VERIFIED_AT && e.states.indexOf('AZ') >= 0)
    || (e.verifiedAt === HS.TX_VERIFIED_AT && e.states.indexOf('TX') >= 0), e.key + ' verified on ' + e.verifiedAt);
  ok(typeof e.note === 'string' && e.note.length > 20, e.key + ' says something plain');
  ok(e.terms, e.key + ' terms');
  e.eiaIds.forEach(function (id) { ok(/^\d{1,6}$/.test(id), e.key + ' EIA id ' + id); });
  if (e.status === 'verified') {
    ok(['arcgis', 'comed', 'envelio'].indexOf(e.kind) >= 0, e.key + ' kind');
    ok(Array.isArray(e.test) && e.test.length === 2 && Array.isArray(e.bbox), e.key + ' test point and box');
    ok(/^https:\/\//.test(e.viewerUrl), e.key + ' hands the person the utility\'s own map');
    ok(['subtract', 'netted', 'context'].indexOf(e.queue) >= 0, e.key + ' states its queue rule');
    ok(e.units && e.grain && e.publishes, e.key + ' units, grain, what it publishes');
    if (e.kind === 'envelio') ok(/\.envelio\.com$/.test(e.envelio.host), e.key + ' navigator host');
    var specs = [e].concat(e.fallback ? [e.fallback] : []);
    specs.forEach(function (sp) {
      (sp.layers || []).forEach(function (l) {
        ok(l.comed || /^https:\/\/[^/]+\/.+\/(Feature|Map)Server$/.test(l.url), e.key + ' layer url ' + l.url);
        ok(Array.isArray(l.ids) && l.ids.length && l.outFields.length && typeof l.read === 'function', e.key + ' layer ids, fields, reader');
        ok(l.outFields.indexOf('*') < 0, e.key + ' asks for named fields only');
      });
    });
  }
});
ok(HS.ENTRIES.length >= 50, HS.ENTRIES.length + ' entries');
/* every utility the editor's jurisdiction table names, in the nine states, is explicit */
var ed = read('editor.html');
var jur = ed.slice(ed.indexOf('var PQ_JURISDICTION = {'), ed.indexOf('var PQ_JURISDICTION = {') + 20000);
var NAMED = {
  'ComEd': 'comed', 'Ameren Illinois': 'ameren-il', 'Florida Power & Light (FPL)': 'fpl', 'Duke Energy Florida': 'duke-fl', 'Tampa Electric (TECO)': 'teco',
  'Florida Public Utilities': 'fpu', 'JEA': 'jea', 'OUC': 'ouc', 'municipals and co-ops': ['fl-munis', 'fl-coops'], 'Georgia Power': 'georgia-power',
  'EMCs (co-ops)': 'ga-emcs', 'municipals': 'ga-munis', 'PSE&G': 'pseg', 'JCP&L': 'jcpl', 'Atlantic City Electric': 'ace', 'Rockland Electric': 'reco',
  'APS': 'aps', 'Tucson Electric Power': 'tep', 'SRP': 'srp', 'PG&E': 'pge', 'SCE': 'sce', 'SDG&E': 'sdge', 'Eversource CT': 'eversource-ct',
  'United Illuminating': 'ui', 'Eversource': 'eversource-ma', 'National Grid': 'ngrid-ma', 'Unitil': 'unitil-ma', 'Rhode Island Energy': 'ri-energy',
  'Oncor': 'oncor', 'CenterPoint Energy': 'centerpoint', 'AEP Texas': 'aep-texas', 'TNMP': 'tnmp', 'Austin Energy': 'austin-energy', 'CPS Energy': 'cps-energy', 'co-ops': 'tx-coops' };
HS.STATES.forEach(function (st) {
  var m = new RegExp('\\b' + st + ":\\{utils:\\[([^\\]]*)\\]").exec(jur);
  ok(m, st + ' is in the editor\'s jurisdiction table');
  m[1].split(/',\s*'/).map(function (s) { return s.replace(/^'|'$/g, ''); }).forEach(function (u) {
    var ks = NAMED[u];
    ok(ks, st + ': ' + u + ' is mapped to a registry entry');
    [].concat(ks).forEach(function (k) {
      var e = HS.byKey(k);
      ok(e && e.states.indexOf(st) >= 0 && STATUS.indexOf(e.status) >= 0, st + ': ' + u + ' → ' + k + ' (' + (e && e.status) + ')');
    });
  });
});
/* the large public systems too, explicitly */
['ladwp', 'smud', 'iid', 'jea', 'ouc', 'srp', 'cwlp-il', 'vineland', 'pascoag', 'biud', 'ma-mlps', 'ct-munis'].forEach(function (k) { ok(HS.byKey(k), k); });
eq(HS.byKey('georgia-power').status, 'account'); eq(HS.byKey('unitil-ma').status, 'account'); eq(HS.byKey('naperville-il').status, 'candidate');
['fpl', 'duke-fl', 'teco', 'aps', 'srp', 'tep', 'unse', 'midamerican-il'].forEach(function (k) { eq(HS.byKey(k).status, 'none', k + ' publishes nothing'); });
['comed', 'ameren-il', 'pseg', 'jcpl', 'ace', 'reco', 'pge', 'sce', 'sdge', 'ladwp', 'eversource-ct', 'ui', 'eversource-ma', 'ngrid-ma', 'ri-energy'].forEach(function (k) {
  eq(HS.byKey(k).status, 'verified', k + ' verified'); });
eq(HS.byKey('sdge').cache, false, 'SDG&E\'s terms forbid replicating its map: never cached');
eq(HS.byEia('7801').key, 'fpl', 'Gulf Power\'s old id is FPL'); eq(HS.byEia('13214').key, 'ri-energy'); eq(HS.byEia('17040').key, 'il-coops');
eq(HS.forCandidate({ eiaId: '12341' }, ['IL']).key, 'midamerican-il'); eq(HS.forCandidate({ eiaId: '14354' }, []), null, 'PacifiCorp outside California is not researched');
eq(HS.forCandidate({ eiaId: '999999', type: 'COOPERATIVE' }, ['GA']).key, 'ga-emcs', 'an unknown co-op falls to its state\'s group');
eq(HS.forCandidate({ eiaId: null, name: 'Bear Valley Electric Service', type: 'INVESTOR OWNED' }, ['CA']).key, 'bear-valley');
/* review hosting:5 — a group answers only for a utility OF its state: the
   row's own STATE when it has one, never the padded box the point falls in */
deq(HS.statesAt(39.008, -75.578), ['NJ'], 'Felton, Delaware is inside New Jersey\'s padded box');
eq(HS.forCandidate({ eiaId: '5070', name: 'DELAWARE ELECTRIC COOPERATIVE', type: 'COOPERATIVE', state: 'DE' }, ['NJ']), null, 'a Delaware co-op is never named Sussex REC');
eq(HS.forCandidate({ eiaId: '999996', name: 'CITY OF DOVER - (DE)', type: 'MUNICIPAL', state: 'DE' }, ['NJ']), null, 'nor a Delaware city a New Jersey borough');
eq(HS.forCandidate({ eiaId: '999998', type: 'COOPERATIVE', state: 'IN' }, ['IL']), null, 'an Indiana co-op inside Illinois\'s box gets no Illinois words');
eq(HS.forCandidate({ eiaId: '999998', type: 'COOPERATIVE', state: 'AL' }, ['GA']), null, 'nor an Alabama co-op the Territorial Act');
eq(HS.forCandidate({ eiaId: '999998', type: 'COOPERATIVE', state: 'IL' }, ['IL']).key, 'il-coops', 'an Illinois co-op the list does not name is still Illinois\'s');
eq(HS.forCandidate({ eiaId: '999997', type: 'COOPERATIVE', state: 'NJ' }, ['NJ']), null, 'Sussex REC is matched by its EIA id only');
eq(HS.forCandidate({ eiaId: '40299', type: 'COOPERATIVE', state: 'NJ' }, ['NJ']).key, 'sussex-rec');
eq(HS.forCandidate({ eiaId: '9726', type: 'INVESTOR OWNED', state: 'OH' }, ['NJ']).key, 'jcpl', 'an EIA id still answers where the national layer tags JCP&L "OH"');
ok(HS.ENTRIES.every(function (e) { return !e.group || e.type === 'group'; }), 'only a group entry carries a group');
deq(HS.statesAt(41.88, -87.63), ['IL']); deq(HS.statesAt(31.97, -99.9), ['TX'], 'Texas is researched since 2026-10-28');
deq(HS.statesAt(31.7619, -106.485), ['TX'], 'El Paso is inside Texas\'s padded box'); deq(HS.statesAt(39.74, -104.99), [], 'Denver is outside the ten');
deq(HS.statesAt(32.3199, -106.7637), [], 'Las Cruces is outside it: EPE\'s New Mexico side is the NMPRC\'s, never answered with Texas\'s rules');

/* ── Arizona, utility by utility (2026-10-20, docs/HOSTING-ARIZONA.md) ─
   No Arizona utility publishes distribution hosting capacity: each entry is
   checked on 2026-10-20, says so in plain words, and hands the person the
   route its utility offers instead and its own pages. */
var AZE = HS.ENTRIES.filter(function (e) { return e.states.indexOf('AZ') >= 0; });
AZE.forEach(function (e) {
  eq(e.verifiedAt, HS.AZ_VERIFIED_AT, e.key + ' checked again on 2026-10-20');
  eq(e.status, 'none', e.key + ': nothing is published in Arizona');
  eq(e.publishes.gen || e.publishes.load || e.publishes.storage, false, e.key + ' publishes nothing');
  if (e.type !== 'group') ok((/^https:\/\//.test(e.viewerUrl || '') || e.noPage === true) && e.route, e.key + ' links its own page (or says it has none) and names its route');
});
ok(/no new load unless no other utility can serve/.test(HS.byKey('scip').route) && /11 May 2026/.test(HS.byKey('scip').note), 'SCIP\'s 2026 notice: no new load where another utility can serve');
ok(/no generation or storage in parallel/.test(HS.byKey('wickenburg').note) && /cannot run on the town/.test(HS.byKey('wickenburg').note), 'Wickenburg takes nothing in parallel: a battery is told so');
['40355', '2469', '19016', '8139', '13961', '12191'].forEach(function (id) {
  eq(HS.byEia(id), null, id + ': a region-sized water district stays out of the registry, so it reads as a water district, never a point\'s utility'); });
eq(HS.byKey('ajo').noPage, true, 'Ajo has no website: said, never a made-up page');
ok(/R14-2-2616/.test(HS.byKey('morenci').route) && /R14-2-2616/.test(HS.byKey('ajo').route), 'Morenci and Ajo are on the ACC\'s list');
ok(/Yuma/.test(HS.byKey('wmidd').note) && /reservation/.test(HS.byKey('cra-es').note), 'the two region-sized district polygons say where they overreach');
['aps', 'tep', 'unse'].forEach(function (k) { ok(/R14-2-2616/.test(HS.byKey(k).route) && /R14-2-2616/.test(HS.byKey(k).note), k + ' answers a Pre-Application Report under the ACC\'s rule'); });
ok(!/R14-2-2616/.test(HS.byKey('srp').route) && /not under the ACC/.test(HS.byKey('srp').note) && /Screen A/.test(HS.byKey('srp').route), 'SRP is not under the ACC\'s rules: its own Screen A');
/* every co-op is on the ACC's list of regulated utilities (2024-07-01), so
   the rule is theirs whatever their manual says; a tribal utility is not */
['trico', 'ssvec', 'navopache', 'mohave', 'graham-county', 'duncan-valley', 'columbus-az', 'garkane-az', 'dixie-az'].forEach(function (k) {
  var e = HS.byKey(k); ok(e && e.type === 'coop' && /R14-2-2616/.test(e.route) && /R14-2-2616/.test(e.note), k + ': an ACC-regulated co-op answers a Pre-Application Report'); });
['ntua', 'gricua', 'toua', 'aha-macav'].forEach(function (k) {
  var e = HS.byKey(k); ok(e && e.type === 'tribal' && /not under the ACC/.test(e.note) && !/R14-2-2616/.test(e.route), k + ': a tribal utility is not under the ACC\'s rules'); });
ok(/\$125/.test(HS.byKey('ssvec').route), 'SSVEC\'s own fee for the report'); ok(/sign-in/.test(HS.byKey('garkane-az').note) && /asset map/.test(HS.byKey('garkane-az').note), 'Garkane\'s map: assets, not capacity, now behind a sign-in');
eq(HS.forCandidate({ eiaId: '58123', type: 'NOT AVAILABLE', state: 'AZ' }, ['AZ', 'CA']).key, 'aha-macav'); eq(HS.forCandidate({ eiaId: '58123', type: 'NOT AVAILABLE' }, ['CA']).key, 'aha-macav', 'Fort Mojave across the river too');
eq(HS.forCandidate({ eiaId: '4071', type: 'COOPERATIVE' }, []), null, 'Columbus in New Mexico is not researched');
eq(HS.forCandidate({ eiaId: '999995', type: 'COOPERATIVE', state: 'AZ' }, ['AZ']).key, 'az-coops', 'an Arizona co-op the list does not name falls to the group');
ok(/transmission/.test(HS.byKey('srp').note), 'SRP\'s OASIS study is said to be transmission-level, never a site\'s circuit');
eq(HS.byKey('srp').check.url, 'https://www.srpnet.com/about/service-area-territory', 'SRP\'s own address lookup');
ok(/^https:\/\/apsc\.maps\.arcgis\.com\/apps\/View\/index\.html\?appid=/.test(HS.byKey('aps').check.url), 'APS\'s own Service Areas Viewer');
ok(/never queries it/.test(HS.byKey('srp').termsNote) && /never queries it/.test(HS.byKey('aps').termsNote), 'the licences say why neither boundary layer is read');
eq(HS.byEia('12351').key, 'mesa'); eq(HS.byKey('mesa').display, 'City of Mesa');
ok(/Electric_Service_Area\.pdf$/.test(HS.byKey('mesa').check.url), 'the city\'s own service-area map');
/* what a person is handed: words, a route, pages — never a service */
deq(Object.keys(HS.publication(HS.byKey('aps'))).sort(), ['check', 'link', 'route', 'says', 'status', 'verifiedAt']);
eq(HS.publication(HS.byKey('aps')).says, 'publishes no hosting capacity'); eq(HS.publication(HS.byKey('comed')).says, 'publishes hosting capacity');
eq(HS.publication(HS.byKey('georgia-power')).says, 'publishes hosting capacity to registered users only');
deq(HS.publication(null), { status: 'unknown', says: 'not researched by OMEGA', route: null, link: null, check: null, verifiedAt: null }, 'an unknown utility is never guessed');
HS.ENTRIES.forEach(function (e) {
  var p = HS.publication(e);
  [p.link, p.check].forEach(function (l) { if (l) ok(/^https:\/\//.test(l.url) && !/\/rest\/services\/|FeatureServer|MapServer/.test(l.url) && l.label, e.key + ' hands a page, never a service: ' + l.url); });
});
/* the licences: SRP's boundary may be used only by SRP's own web app, APS's
   only inside ArcGIS Online, and APS's DG_Locations carries meters */
var regSrc = read('api/_lib/hosting-sources.js') + read('api/_lib/utility-territory.js');
ok(['ICaY8VX3lsUsMBRl', 'SRP_PSA', 'wF9gckwE55J0Ayag', 'CCN_ServiceTerritory', 'DG_Locations/'].every(function (s) { return regSrc.indexOf(s) < 0; }), 'neither SRP\'s nor APS\'s own boundary layer is in the code');

/* ── Texas, utility by utility (2026-10-28, docs/HOSTING-TEXAS.md) ─
   No Texas utility publishes distribution hosting capacity (no PUCT rule,
   no DOE atlas entry, no utility map): each entry is checked on 2026-10-28,
   says so plainly, and hands the person the route its utility offers
   instead, its own pages and the PUCT's own public boundary viewer. */
var TXE = HS.ENTRIES.filter(function (e) { return e.states.indexOf('TX') >= 0; });
ok(TXE.length >= 13, TXE.length + ' Texas entries');
TXE.forEach(function (e) {
  eq(e.verifiedAt, HS.TX_VERIFIED_AT, e.key + ' checked on 2026-10-28');
  eq(e.status, 'none', e.key + ': nothing is published in Texas');
  eq(e.publishes.gen || e.publishes.load || e.publishes.storage, false, e.key + ' publishes nothing');
  ok(/^https:\/\//.test(e.viewerUrl || '') && e.route, e.key + ' links its own page and names its route');
  if (e.type !== 'group') ok(e.check && /experience\.arcgis\.com/.test(e.check.url) && /PUCT/.test(e.check.label), e.key + ' hands the PUCT\'s own boundary viewer');
});
/* the EIA ids, each proven at a live point of the national layer on 2026-10-28 */
eq(HS.byEia('44372').key, 'oncor'); eq(HS.byEia('8901').key, 'centerpoint'); eq(HS.byEia('40051').key, 'tnmp'); eq(HS.byEia('11292').key, 'lpl');
eq(HS.byEia('3278').key, 'aep-texas', 'AEP Texas Central\'s legacy id'); eq(HS.byEia('20404').key, 'aep-texas', 'AEP Texas North\'s legacy id');
eq(HS.byEia('5701').key, 'epe-tx'); eq(HS.byEia('17718').key, 'sps'); eq(HS.byEia('17698').key, 'swepco'); eq(HS.byEia('55937').key, 'entergy-tx');
eq(HS.byEia('1015').key, 'austin-energy'); eq(HS.byEia('16604').key, 'cps-energy');
eq(HS.byEia('14626').key, 'tx-coops', 'Pedernales'); eq(HS.byEia('5078').key, 'tx-coops', 'CoServ (Denton County EC)'); eq(HS.byEia('11501').key, 'tx-coops', 'Magic Valley');
eq(HS.byEia('6958').key, 'tx-munis', 'Garland'); eq(HS.byEia('5063').key, 'tx-munis', 'Denton');
eq(HS.byEia('6173').key, 'tx-coops', 'Fannin County EC: typed NOT AVAILABLE on the layer, named so it never reads as a water district');
eq(HS.byEia('1287').key, 'tx-munis', 'the City of Bartlett\'s electric: same, the Coleman County precedent');
/* the layer tags AEP Texas's rows with AEP's Ohio state code: the EIA id still answers in Texas */
eq(HS.forCandidate({ eiaId: '3278', type: 'INVESTOR OWNED', state: 'OK' }, ['TX']).key, 'aep-texas');
eq(HS.forCandidate({ eiaId: '999994', type: 'COOPERATIVE', state: 'TX' }, ['TX']).key, 'tx-coops', 'a Texas co-op the list does not name falls to the group');
eq(HS.forCandidate({ eiaId: '999993', type: 'MUNICIPAL', state: 'TX' }, ['TX']).key, 'tx-munis');
eq(HS.forCandidate({ eiaId: '999992', type: 'COOPERATIVE', state: 'OK' }, ['TX']), null, 'an Oklahoma co-op inside Texas\'s box gets no Texas words');
/* the routes: the TDUs answer under 16 TAC §25.211/§25.212, never a map */
['oncor', 'centerpoint', 'aep-texas', 'tnmp'].forEach(function (k) { ok(/25\.211/.test(HS.byKey(k).route || HS.byKey(k).note), k + ' names the PUCT\'s interconnection rule'); });
ok(/pre-screen in lieu of a hosting capacity map/.test(HS.byKey('centerpoint').note) && /56211/.test(HS.byKey('centerpoint').note), 'CenterPoint\'s own docket answer is quoted');
ok(/prescreen options/.test(HS.byKey('oncor').note), 'Oncor\'s own page offers a pre-screen');
ok(/Minnesota and Colorado only/.test(HS.byKey('sps').note), 'Xcel\'s maps are other states\'; SPS\'s Texas system has none');
ok(/QUEUE/.test(HS.byKey('epe-tx').note) && /not capacity/.test(HS.byKey('epe-tx').note), 'EPE\'s public queue is never read as capacity');
ok(/likelier utility/.test(HS.byKey('epe-tx').note), 'Rio Grande EC\'s polygon over the city of El Paso says where it overreaches');
ok(/wires company/.test(HS.byKey('oncor').note) && /retail provider/.test(HS.byKey('oncor').note), 'retail choice: the TDU answers, never the provider on the bill');
ok(/March and April 2024/.test(HS.byKey('lpl').note) && /stays the wires company/.test(HS.byKey('lpl').note), 'LP&L is in ERCOT retail choice and keeps the wires');
ok(/refuse scripted reads/.test(HS.byKey('lpl').note), 'LP&L\'s bot wall is said, never papered over');
ok(/IPODG/.test(HS.byKey('entergy-tx').route), 'Entergy Texas\'s own schedule');
ok(/Distributed Generation Manual/.test(HS.byKey('cps-energy').route), 'CPS\'s own manual');
ok(/New Braunfels Utilities is missing/.test(HS.byKey('tx-munis').note), 'a muni the national layer misses is said');
/* the PUCT's own boundary layers are licensed to Platts MSA holders and are never queried */
ok(regSrc.indexOf('N6Lzvtb46cpxThhu') < 0, 'the PUCT\'s Platts-licensed service is not in the code');
ok(/Platts/.test(regSrc), 'and the licence is recorded where the layer would have been wired');
/* geometry: inside or out, and how far the edge is */
var eIn = HS.edgeOf(ring(40, -75, 100), 40, -75); eq(eIn.inside, true); ok(Math.abs(eIn.edgeM - 100) < 1, 'well inside: 100 m to the edge');
var eOut = HS.edgeOf(ring(40 + 150 / 111320, -75, 100), 40, -75); eq(eOut.inside, false); ok(Math.abs(eOut.edgeM - 50) < 1, '50 m outside');
var eHole = HS.edgeOf({ rings: ring(40, -75, 100).rings.concat(ring(40, -75, 30).rings) }, 40, -75); eq(eHole.inside, false, 'a hole is outside'); ok(Math.abs(eHole.edgeM - 30) < 1);
eq(HS.edgeOf({ paths: [[[-75, 40], [-74.9, 40.1]]] }, 40, -75), null, 'a line is not an area'); eq(HS.edgeOf(null, 40, -75), null);

/* ComEd is named through comed-service, never pasted */
var src = read('api/_lib/hosting-sources.js');
ok(src.indexOf('usrsvcs') < 0 && src.indexOf('ComEd_BESS') < 0 && src.indexOf('2ee23dc4') < 0, 'no ComEd URL is pasted in the registry');
ok(/require\('\.\/comed-service'\)/.test(src)); eq(HS.byKey('comed').viewerUrl, CS.REFERER); eq(HS.byKey('comed').radii[0], CS.NEAREST_M, 'ComEd\'s own 46 m rule');
var cq = HS.comedQuery(HS.byKey('comed').layers[0], 42.2711, -89.094);
ok(cq.indexOf(CS.SERVICE + '/75/query?') === 0, 'the ComEd query is comed-service\'s'); ok(/distance=46/.test(cq) && /Queue_RD/.test(cq));
deq(HS.comedHeaders(), CS.headers());
/* the URLs the door may ask are the registry's: no body names one */
var aq = HS.arcgisQuery(HS.byKey('ri-energy').layers[0], 0, 41.8787, -71.3826, 60, 'line');
ok(/\/RI_Hosting_Capacity_2025\/FeatureServer\/0\/query\?/.test(aq) && /outSR=4326/.test(aq) && /geometryType=esriGeometryEnvelope/.test(aq), 'RI asks in WGS84 with an envelope');
ok(!/resultRecordCount/.test(HS.arcgisQuery(HS.byKey('eversource-ct').fallback.layers[0], 0, 41.4, -73.45, 60, 'line')), 'Eversource\'s ArcGIS 10.41 is never sent resultRecordCount');
ok(HS.byKey('eversource-ma').fallback.layers.every(function (l) { return l.outFields.indexOf('DATE_UPDATED') < 0; }), 'the MA legacy map is never asked its date field (it answers nothing)');
ok(/where=REGION%3D'RECO'/.test(HS.arcgisQuery(HS.byKey('reco').layers[0], 0, 41.05, -74.02, 60, 'line')), 'Rockland keeps New Jersey rows');

/* the projection: who and how, never a URL or a field */
var proj = HS.coverage(), pj = JSON.stringify(proj);
eq(proj.length, HS.ENTRIES.length); ok(pj.indexOf('http') < 0 && pj.indexOf('arcgis') < 0 && pj.indexOf('envelio') < 0, 'no URL in the projection');
var fieldNames = {};
HS.ENTRIES.forEach(function (e) { [e].concat(e.fallback ? [e.fallback] : []).forEach(function (sp) { (sp.layers || []).forEach(function (l) { l.outFields.forEach(function (f) { if (f.length > 4) fieldNames[f] = 1; }); }); }); });
Object.keys(fieldNames).forEach(function (f) { ok(pj.indexOf(f) < 0, 'no field in the projection: ' + f); });
deq(Object.keys(proj[0]).sort(), ['display', 'grain', 'key', 'publishes', 'states', 'status', 'type', 'verifiedAt']);

/* ── parse rules ────────────────────────────────────────────────────── */
eq(T.num('.2663'), 0.2663); eq(T.num('Redacted'), null); eq(T.num(''), null); eq(T.num('1,200'), 1200); eq(T.num(null), null); eq(T.num('0.0'), 0);
eq(T.kwString('3630.7 kW'), 3630.7); eq(T.kwString('1.2 MW'), 1200); eq(T.kwString('5526.2'), 5526.2); eq(T.kwString('n/a'), null);
eq(T.toKw('0.38', 'MW'), 380); eq(T.toKw(7045.56, 'kW'), 7045.56); eq(T.toKw('Redacted', 'MW'), null);
deq(T.band('Less than 100 kW AC', 'kW'), { minKw: 0, maxKw: 100, text: 'Less than 100 kW AC' }, 'JCP&L\'s bucket');
deq(T.band('450 - 600', 'kW'), { minKw: 450, maxKw: 600, text: '450 - 600' }); deq(T.band('>7500', 'kW'), { minKw: 7500, maxKw: null, text: '>7500' });
deq(T.band('NO CAPACITY', 'kW'), { minKw: 0, maxKw: 0, text: 'NO CAPACITY' }); eq(T.band('CAPACITY VALUE UNAVAILABLE', 'kW'), null);
deq(T.band('0 - 0.3', 'MW'), { minKw: 0, maxKw: 300, text: '0 - 0.3' });
deq(T.list('A42002, A42004'), ['A42002', 'A42004']); eq(T.kvOf('13.2KV'), 13.2); eq(T.kvOf('4kV'), 4); eq(T.kvOf('4.8-KV'), 4.8); eq(T.kvOf('310'), 69); eq(T.kvOf('300'), 34.5); eq(T.kvOf(''), null);
eq(T.dateOf(1756080000000), '2025-08-25'); eq(T.dateOf('11/21/2025, 11:39 AM'), '2025-11-21'); eq(T.dateOf('2026-10-05 00:00:00'), '2026-10-05'); eq(T.dateOf('08/31/2026'), '2026-08-31'); eq(T.dateOf('Jun 2026'), 'Jun 2026');
/* geometry: a point inside a ring is 0 m; a line 100 m north is about 100 m */
var LAT = 40.0, LNG = -75.0, D = 100 / 111320;
function ring(lat, lng, m) { var a = m / 111320, b = m / (111320 * Math.cos(lat * Math.PI / 180)); return { rings: [[[lng - b, lat - a], [lng + b, lat - a], [lng + b, lat + a], [lng - b, lat + a], [lng - b, lat - a]]] }; }
function line(lat, lng, dm) { var a = dm / 111320; return { paths: [[[lng - 0.001, lat + a], [lng + 0.001, lat + a]]] }; }
function pt(lat, lng, dm) { return { x: lng, y: lat + dm / 111320 }; }
eq(T.distanceM(ring(LAT, LNG, 20), LAT, LNG), 0); ok(Math.abs(T.distanceM(line(LAT, LNG, 100), LAT, LNG) - 100) < 1); ok(Math.abs(T.distanceM({ x: LNG, y: LAT + D }, LAT, LNG) - 100) < 1);
ok(Math.abs(T.distanceM(ring(LAT + 300 / 111320, LNG, 20), LAT, LNG) - 280) < 2, 'a cell 300 m away is 280 m to its edge');

/* ── adapters, on recorded rows ─────────────────────────────────────── */
function norm(key, rowsByLayer, opts) {
  var e = HS.byKey(key), spec = opts && opts.fallback ? e.fallback : e;
  var fbl = rowsByLayer.map(function (x) { return { layer: spec.layers[x[0]], features: x[1] }; });
  return HS.normalize(e, spec, fbl, { lat: (opts && opts.lat) || LAT, lng: (opts && opts.lng) || LNG, mode: (opts && opts.mode) || 'storage' });
}
function F(a, g) { return { attributes: a, geometry: g || null }; }

/* ComEd (Schaumburg; Rockford): BESS_HC is the published two-way figure, Feeder_Q is subtracted */
var ce = norm('comed', [[0, [F({ Feeder: 'E141Y', Feeder_N: 'F3496', SS_N: 'S0531', PV_HC_kW: 102.09, EV_HC_kW: 3860, BESS_HC: 102.09, Feeder_Q: 0, Queue_RD: '08/31/2026' }),
  F({ Feeder: 'R6505', SS_N: 'S0682', PV_HC_kW: 361.81, EV_HC_kW: 1620, BESS_HC: 361.81, Feeder_Q: 165, Queue_RD: '08/31/2026' })]]]);
eq(ce[0].id, 'R6505', 'ComEd ties at distance go to the most room (362 − 165 > 102)'); eq(ce[0].storageKw, 362); eq(ce[0].genKw, 362); eq(ce[0].loadKw, 1620);
eq(ce[0].queuedKw, 165); eq(ce[0].queueNetted, false); eq(ce[0].basis, 'storage'); eq(ce[0].refreshed, '2026-08-31'); eq(ce[0].distanceM, 0);
eq(ce[1].publishedKw, 102); eq(ce[1].substation, 'S0531');

/* Ameren (Decatur): two grids, MW as text, comma lists by position */
var AL = 39.8403, AG = -88.9548;
var am = norm('ameren-il', [
  [0, [F({ FEEDERID: 'L36215', OPERATINGVOLTAGE: '4KV', GENLIMITER: 'RevFlow', MAXGENMW_TXT: '0.73' }, ring(AL, AG, 19)),
       F({ FEEDERID: 'K94603,K94602', OPERATINGVOLTAGE: '12KV,12KV', GENLIMITER: 'RevFlow,MaxVlt', MAXGENMW_TXT: '0.61,0.22' }, ring(AL + 60 / 111320, AG, 19))]],
  [1, [F({ FEEDERID: 'L36215', LOADLIMITER: 'Loading', MAXLOADMW_TXT: '0.99' }, ring(AL, AG, 19)),
       F({ FEEDERID: 'K94604,K94602,K94603,K94601', LOADLIMITER: 'Loading,Loading,Loading,Loading', MAXLOADMW_TXT: '5.04,4.19,4.17,3.65' }, ring(AL + 70 / 111320, AG, 19))]]], { lat: AL, lng: AG });
eq(am[0].id, 'L36215', 'the cell under the point first'); eq(am[0].genKw, 730); eq(am[0].loadKw, 990); eq(am[0].storageKw, 730); eq(am[0].substation, 'L36', 'substation = the first three characters');
eq(am[0].kv, 4); eq(am[0].queuedKw, null, 'Ameren\'s queue is not on the grid'); ok(am[0].notes.indexOf('generation limited by RevFlow') >= 0);
var k3 = am.filter(function (c) { return c.id === 'K94603'; })[0], k2 = am.filter(function (c) { return c.id === 'K94602'; })[0], k4 = am.filter(function (c) { return c.id === 'K94604'; })[0];
eq(k3.storageKw, 610); eq(k2.storageKw, 220); eq(k2.loadKw, 4190, 'position 2 of 4 is K94602\'s'); eq(k4.publishedKw, null, 'a circuit with only its load side near the point is not judged as storage');
ok(k4.notes.some(function (n) { return /only the load side/.test(n); }));
var peoria = norm('ameren-il', [[0, [F({ FEEDERID: 'A42002', OPERATINGVOLTAGE: '13.2KV', GENLIMITER: 'RevFlow', MAXGENMW_TXT: '0.38' }, ring(LAT, LNG, 19))]],
  [1, [F({ FEEDERID: 'A42002', LOADLIMITER: 'Loading', MAXLOADMW_TXT: '0.0' }, ring(LAT, LNG, 19))]]]);
eq(peoria[0].storageKw, 0, 'Peoria A42002: 0.38 MW out, 0.0 MW in → 0'); eq(peoria[0].genKw, 380);

/* PSE&G (Newark): the binding figure is already net of solar; 26 kV rows carry nothing */
var ps = norm('pseg', [[0, [F({ BASE_CIRCUITID: 'FED4001', VVT_VOLTAGE: '4kV', circuittype: 'Network', circuitavailability: 1200, stationavailability: 14.89, TotalAvailabilitySymbol: 14.89, PendingSolar: 0, stationname: 'Federal Square' }, pt(LAT, LNG, 12)),
  F({ BASE_CIRCUITID: 'PAT9999', VVT_VOLTAGE: '26kV', circuitavailability: null, stationavailability: null, TotalAvailabilitySymbol: null }, pt(LAT, LNG, 2))]],
  [0, [F({ BASE_CIRCUITID: 'NEB8001', VVT_VOLTAGE: '13kV', circuittype: 'Network', circuitavailability: 4875, stationavailability: 34875, TotalAvailabilitySymbol: 4875, PendingSolar: 125, stationname: 'Newark Switch' }, pt(LAT, LNG, 30))]],
  [1, [F({ EV_CID: 'NEB8010', CAPACITY_REMAINING: 8 }, pt(LAT, LNG, 40)), F({ EV_CID: 'NEB8001', CAPACITY_REMAINING: -1.98948 }, pt(LAT, LNG, 45))]]]);
var fed = ps.filter(function (c) { return c.id === 'FED4001'; })[0], neb1 = ps.filter(function (c) { return c.id === 'NEB8001'; })[0];
ok(!ps.some(function (c) { return c.id === 'PAT9999'; }), 'a 26 kV row with no figure is skipped');
eq(fed.genKw, 15, 'FED4001: min(circuit 1,200, station 14.89) → 15 kW'); eq(fed.upstream.substationKw, 15); ok(fed.notes.indexOf('network circuit') >= 0);
eq(neb1.genKw, 4875); eq(neb1.loadKw, 0, 'a negative EV remaining is clipped to 0'); eq(neb1.storageKw, 0); eq(neb1.queuedKw, 125); eq(neb1.queueNetted, true, 'PSE&G nets its solar queue');
var psExp = norm('pseg', [[0, [F({ BASE_CIRCUITID: 'NEB8003', VVT_VOLTAGE: '13kV', circuitavailability: 4908, stationavailability: 34761.9, TotalAvailabilitySymbol: 4908, PendingSolar: 0, stationname: 'Newark Switch' }, pt(LAT, LNG, 10))]]], { mode: 'export' });
eq(psExp[0].publishedKw, 4908); eq(psExp[0].basis, 'gen'); eq(psExp[0].upstream.substationKw, 34762);

/* JCP&L (Morristown): one value per transformer point; under 100 is a bucket */
var jc = norm('jcpl', [[0, [F({ RemainNum: 50, Remaining: 'Less than 100 kW AC' }, pt(LAT, LNG, 20)), F({ RemainNum: 4000, Remaining: '4000 kW AC' }, pt(LAT, LNG, 90))]],
  [1, [F({ remainnum: 5864, remaining: '5864' }, pt(LAT, LNG, 30))]]]);
eq(jc.length, 1, 'no circuit id: the nearest point of each kind'); eq(jc[0].genKw, 0, 'Less than 100 kW AC is judged at its low end'); eq(jc[0].storageKw, 0); eq(jc[0].loadKw, 5864);
var jcx = norm('jcpl', [[0, [F({ RemainNum: 50, Remaining: 'Less than 100 kW AC' }, pt(LAT, LNG, 20))]]], { mode: 'export' });
deq(jcx[0].band, { minKw: 0, maxKw: 100, text: 'Less than 100 kW AC' }); eq(jcx[0].publishedKw, 0); eq(jcx[0].queuedKw, null);
eq(norm('jcpl', [[0, [F({ RemainNum: 4000, Remaining: '4000 kW AC' }, pt(LAT, LNG, 20))]]], { mode: 'export' })[0].publishedKw, 4000);
/* review hosting:2 — the band survives storage mode (the default): the
   smaller side sets the figure and ITS band rides with it, so the verdict
   says "a band of 0–100 kW, judged at its low end", never "0 kW published" */
eq(jc[0].basis, 'storage'); eq(jc[0].publishedKw, 0); deq(jc[0].band, { minKw: 0, maxKw: 100, text: 'Less than 100 kW AC' }, 'storage mode keeps JCP&L\'s <100 kW AC band');
var jcv = GV.judge({ unit: { kw: 500 }, circuit: HS.body(HS.byKey('jcpl'), { addressResolved: false, grainWords: 'the nearest transformer point' }, jc[0], 'storage') });
ok(/published as a band of 0–100 kW, judged at its low end/.test(jcv.verdict.say), jcv.verdict.say); ok(!/0 kW published/.test(jcv.verdict.say), 'never "0 kW published"');
deq(jcv.circuit.band, { minKw: 0, maxKw: 100, text: 'Less than 100 kW AC' });
var jcEv = norm('jcpl', [[0, [F({ RemainNum: 4000, Remaining: '4000 kW AC' }, pt(LAT, LNG, 20))]], [1, [F({ remainnum: 300, remaining: 'Less than 500' }, pt(LAT, LNG, 30))]]]);
eq(jcEv[0].storageKw, 0); deq(jcEv[0].band, { minKw: 0, maxKw: 500, text: 'Less than 500' }, 'the EV map\'s "Less than 500" sets the storage figure and its band rides with it');
var jcTie = norm('jcpl', [[0, [F({ RemainNum: 50, Remaining: 'Less than 100 kW AC' }, pt(LAT, LNG, 20))]], [1, [F({ remainnum: 0, remaining: '0' }, pt(LAT, LNG, 30))]]]);
eq(jcTie[0].publishedKw, 0); eq(jcTie[0].band, null, 'on a tie an exact 0 kW on the other side is the figure, not the band');
var jcBig = norm('jcpl', [[0, [F({ RemainNum: 50, Remaining: 'Less than 100 kW AC' }, pt(LAT, LNG, 20))]], [1, [F({ remainnum: 300, remaining: 'Less than 500' }, pt(LAT, LNG, 30))]]]);
deq(jcBig[0].band, { minKw: 0, maxKw: 100, text: 'Less than 100 kW AC' }, 'two bands with the same low end: the tighter one');

/* ACE (Atlantic City, Glassboro): min(allowable, transformer), the restriction caps it */
var ac = norm('ace', [[0, [F({ FeederID: 'NJ0692', Substation: 'Ontario 12KV', Voltage: 12.9, Allowable_PV_kW: 7045.56, Transformer_Large_Gen_HC: 23500, Total_Pending_Gen_kW: 5.7, Last_Updated: 1790702051000 }, line(LAT, LNG, 20))]]], { mode: 'export' });
eq(ac[0].genKw, 7046, 'NJ0692: 7,046 kW'); eq(ac[0].queuedKw, 6, 'pending 5.7 kW'); eq(ac[0].upstream.transformerKw, 23500); eq(ac[0].refreshed, '2026-09-29'); eq(ac[0].substation, 'Ontario 12KV'); eq(ac[0].kv, 12.9);
var gb = norm('ace', [[0, [F({ FeederID: 'NJ0748', Substation: 'Glassboro', Voltage: 12.9, Allowable_PV_kW: 3353.45, Transformer_Large_Gen_HC: 18904.41, Total_Pending_Gen_kW: 2448.07 }, line(LAT, LNG, 7))]],
  [1, [F({ FEEDERID: 'NJ0748', Restriction_kW: 50, Restriction_Category: 'C' }, line(LAT, LNG, 7))]], [2, [F({ FEEDERID: 'NJ0748', Substation: 'GLASSBORO', Capacity_MW: 5.86 }, line(LAT, LNG, 7))]]]);
eq(gb[0].genKw, 50, 'Glassboro NJ0748 is restricted to 50 kW of new DER'); eq(gb[0].loadKw, 5860); eq(gb[0].storageKw, 50); eq(gb[0].queuedKw, 2448);
ok(gb[0].notes.indexOf('restricted to 50 kW of new DER (category C)') >= 0);
/* review hosting:3 — the restriction caps what the queue LEAVES:
   min(max(0, min(allow, xf) − pending), restriction); it was 0 kW */
eq(gb[0].publishedKw, 50); eq(gb[0].queueNetted, true, 'the queue is already in the restriction: shown, never subtracted again');
ok(gb[0].notes.some(function (n) { return /3,353 kW published less 2,448 kW queued leaves 905 kW, more than the 50 kW restriction/.test(n); }), gb[0].notes);
var gbv = GV.judge({ unit: { kw: 50, name: '50 kW' }, circuit: HS.body(HS.byKey('ace'), { addressResolved: true }, gb[0], 'storage') });
eq(gbv.circuit.netKw, 50, 'Glassboro NJ0748: 3,353 − 2,448 = 905, restricted to 50 → 50 kW, never 0'); eq(gbv.verdict.key, 'fits');
ok(/50 kW published, net of the queue as published \(2,448 kW queued\)/.test(gbv.verdict.say), gbv.verdict.say);
var r500 = norm('ace', [[0, [F({ FeederID: 'NJ0001', Allowable_PV_kW: 5202, Transformer_Large_Gen_HC: 9000, Total_Pending_Gen_kW: 505 }, line(LAT, LNG, 7))]],
  [1, [F({ FEEDERID: 'NJ0001', Restriction_kW: 500, Restriction_Category: 'F' }, line(LAT, LNG, 7))]]], { mode: 'export' });
var r500v = GV.judge({ unit: { kw: 500 }, circuit: HS.body(HS.byKey('ace'), { addressResolved: true }, r500[0], 'export') });
eq(r500v.circuit.netKw, 500, 'min(5,202 − 505, 500) = 500'); eq(r500v.verdict.key, 'fits', 'a 500 kW unit fits a 500 kW restriction (it read "Needs a study")');
var rB = norm('ace', [[0, [F({ FeederID: 'NJ0002', Allowable_PV_kW: 3353, Transformer_Large_Gen_HC: 9000, Total_Pending_Gen_kW: 3200 }, line(LAT, LNG, 7))]],
  [1, [F({ FEEDERID: 'NJ0002', Restriction_kW: 500, Restriction_Category: 'F' }, line(LAT, LNG, 7))]]], { mode: 'export' });
eq(rB[0].publishedKw, 3353, 'where the queue leaves less than the restriction, the figure and the queue stand'); eq(rB[0].queuedKw, 3200); eq(rB[0].queueNetted, false);
eq(GV.judge({ unit: { kw: 100 }, circuit: HS.body(HS.byKey('ace'), { addressResolved: true }, rB[0], 'export') }).circuit.netKw, 153, 'min(3,353 − 3,200, 500) = 153');
var r0 = norm('ace', [[0, [F({ FeederID: 'NJ0041', Allowable_PV_kW: 0, Transformer_Large_Gen_HC: 9000, Total_Pending_Gen_kW: 0 }, line(LAT, LNG, 7))]],
  [1, [F({ FEEDERID: 'NJ0041', Restriction_kW: 0, Restriction_Category: 'A' }, line(LAT, LNG, 7))]]], { mode: 'export' });
eq(r0[0].publishedKw, 0, 'a feeder restricted to 0 kW stays 0'); ok(HS.byKey('ace').layers[1].required && HS.byKey('ace').fallback.layers[1].required, 'the restriction layer is required in both publications');
var gbOld = norm('ace', [[0, [F({ FeederID: 'NJ0748', Allowable_PV_kW: 3363, Transformer_Large_Gen_HC: 18904 }, line(LAT, LNG, 7))]], [1, [F({ FEEDERID: 'NJ0748', Restriction_kW: 50, Restriction_Category: 'C' }, line(LAT, LNG, 7))]]], { fallback: true, mode: 'export' });
eq(gbOld[0].genKw, 50, 'the older ACE publication is capped by the same restriction layer'); eq(HS.byKey('ace').fallback.layers.length, 3); eq(HS.byKey('ace').fallback.stale, true);
var woodstown = norm('ace', [[0, [F({ FeederID: 'NJ0202', Allowable_PV_kW: 2503, Transformer_Large_Gen_HC: 2025 }, line(LAT, LNG, 5))]]], { mode: 'export' });
eq(woodstown[0].genKw, 2025, 'the transformer limit binds (Woodstown)');

/* Rockland (Montvale): section MW; charge and discharge separate; New York rows dropped */
var rc = norm('reco', [[0, [F({ CIRCUIT: '29-9-13', SUBSTATION: '29A', LOCAL_VOLTAGE: 13.2, PV_SECTION: 2.3, QUEUED_DER: 0, HC_REFESH_DATE: 1790899200000 }, line(LAT, LNG, 30))]],
  [1, [F({ CIRCUIT: '29-9-13', SC_SECTION: 2, STORAGE_UPDATEDATE: 1790899200000 }, line(LAT, LNG, 30)), F({ CIRCUIT: '109-3-13', SC_SECTION: 5 }, line(LAT, LNG, 10))]],
  [2, [F({ CIRCUIT: '29-9-13', SD_SECTION: 2.3 }, line(LAT, LNG, 30))]]]);
eq(rc.length, 1, 'a New York storage row without a New Jersey circuit is dropped'); eq(rc[0].genKw, 2300); eq(rc[0].storageKw, 2000, 'min(charge 2.0, discharge 2.3) MW');
/* review hosting:6 changed this one: it was eq(rc[0].queuedKw, 0). QUEUED_DER is
   "Feeder DG In Queue (MW)" beside PV_SECTION, "Section Hosting Capacity",
   so the queue is context, shown beside the figure and never subtracted */
eq(rc[0].queuedKw, null, 'a feeder queue beside a section figure is not taken from it'); eq(rc[0].upstream.feederQueuedKw, 0); eq(rc[0].refreshed, '2026-10-02');
/* feeder 17-2-13 (live): 5 MW queued on the feeder, 2.5 MW on this section;
   subtracting would read every section on the feeder as 0 kW */
eq(HS.byKey('reco').queue, 'context');
var rq = norm('reco', [[0, [F({ CIRCUIT: '17-2-13', SUBSTATION: '17A', LOCAL_VOLTAGE: 13.2, PV_SECTION: 2.5, QUEUED_DER: 5, HC_REFESH_DATE: 1790899200000 }, line(LAT, LNG, 20))]]], { mode: 'export' });
eq(rq[0].publishedKw, 2500); eq(rq[0].queuedKw, null); eq(rq[0].upstream.feederQueuedKw, 5000); ok(rq[0].notes.some(function (n) { return /feeder queue 5,000 kW, shown beside the figure/.test(n); }));
var rqv = GV.judge({ unit: { kw: 500 }, circuit: HS.body(HS.byKey('reco'), { addressResolved: true }, rq[0], 'export') });
eq(rqv.circuit.netKw, 2500, 'Rockland 17-2-13: the section\'s 2,500 kW, the feeder\'s 5 MW queue beside it'); eq(rqv.verdict.key, 'fits');
ok(/no queue is published with this figure, so nothing was subtracted/.test(rqv.verdict.say), rqv.verdict.say);

/* PG&E (San Jose, Fresno): kW; nearest section WITH a value; the feeder queue is context */
var pg = norm('pge', [[0, [F({ FeederId: '082261111', FeederName: 'SAN JOSE B 1111', LoadCapacity_kW: 2363, GenCapacity_kW: 0, voltage_kv: 12, ICA_Analysis_Date: 'Mar 2026' }, line(LAT, LNG, 15))]]]);
eq(pg[0].storageKw, 0, 'SAN JOSE B 1111: load 2,363, generation 0 → 0'); eq(pg[0].name, 'SAN JOSE B 1111'); eq(pg[0].refreshed, 'Mar 2026');
var fr = norm('pge', [[0, [F({ FeederId: '253921105', FeederName: 'MANCHESTER 1105', LoadCapacity_kW: 2174, GenCapacity_kW: 92, GenCapacity_no_OpFlex_kW: 994, voltage_kv: 12 }, line(LAT, LNG, 40)),
  F({ FeederId: '253921110', FeederName: 'MANCHESTER 1110', LoadCapacity_kW: null, GenCapacity_kW: null, GenCapacity_no_OpFlex_kW: null }, line(LAT, LNG, 5))]],
  [1, [F({ FeederID: '253921105', Substation: 'MANCHESTER', Queued_DG: 2873 }, line(LAT, LNG, 40))]]]);
eq(fr[0].id, '253921105', 'the nearest section with a figure leads; a blank one nearer is listed after'); eq(fr[0].storageKw, 92); eq(fr[0].substation, 'MANCHESTER');
eq(fr[0].queuedKw, null, 'a feeder queue beside a section figure is not subtracted'); eq(fr[0].upstream.feederQueuedKw, 2873); ok(fr[0].notes.some(function (n) { return /feeder queue 2,873 kW/.test(n); }));
eq(fr[1].publishedKw, null);
var st = norm('pge', [[0, [F({ FeederId: '253701110', GenCapacity_kW: null, GenCapacity_no_OpFlex_kW: 198, LoadCapacity_kW: 686 }, line(LAT, LNG, 10))]]]);
eq(st[0].genKw, 198); ok(st[0].notes.some(function (n) { return /static-grid/.test(n); }), 'a static-grid figure says so');

/* SCE (Irvine, Ontario): MW strings; OpFlex redacted → static, said */
var sb = norm('sce', [[0, [F({ circuit_name: 'Bardeen', substation_name: 'Cabrillo', uniform_generation: 3.334, uniform_generation_op_flex: 'Redacted', ica_overall_load: '5.09' }, line(LAT, LNG, 20))]]]);
eq(sb[0].storageKw, 3334, 'Bardeen: generation 3.334 MW, load 5.09 MW → 3,334 kW'); eq(sb[0].loadKw, 5090);
var bz = norm('sce', [[0, [F({ circuit_name: 'Ballzak', substation_name: 'Narod', substation_voltage: '66/12 kV', circuit_voltage: '12', uniform_generation: 3.3531, uniform_generation_op_flex: 'Redacted', ica_overall_load: '0.13', changed_date: '12/08/2025' }, line(LAT, LNG, 20))]]]);
eq(bz[0].genKw, 3353); eq(bz[0].storageKw, 130); eq(bz[0].substation, 'Narod 66/12 kV'); eq(bz[0].refreshed, '2025-12-08'); eq(bz[0].queuedKw, null, 'SCE publishes no queue with the section');
eq(norm('sce', [[0, [F({ circuit_name: 'Brittan', uniform_generation: 2.934, uniform_generation_op_flex: '.2663', ica_overall_load: '2.49' }, line(LAT, LNG, 20))]]])[0].genKw, 266, 'the OpFlex figure leads when published');

/* SDG&E (Kearny Mesa): MW grid cells, generation view carries load too */
var sd = norm('sdge', [[0, [F({ VOLTAGE: 12, CIRCUIT_NAME: '1286', SUBID: 'MESA HEIGHTS', ICAWOF_UNIGENERATION: 1.8, ICAWNOF_UNIGENERATION: 10, ICAWOF_UNILOAD: 5.8 }, ring(LAT, LNG, 32))]]]);
eq(sd[0].genKw, 1800); eq(sd[0].storageKw, 1800); eq(sd[0].substation, 'MESA HEIGHTS');

/* LADWP: load only, kVA ranges */
var la = norm('ladwp', [[0, [F({ GISID: 'UGP29271155', Capacity_Range_KW: '>7500', Voltage_Class: '34.5-KV' }, line(LAT, LNG, 60)), F({ GISID: 'OHP2146520', Capacity_Range_KW: '450 - 600', Voltage_Class: '4.8-KV' }, line(LAT, LNG, 8))]]]);
eq(la.length, 1); eq(la[0].basis, 'load', 'LADWP publishes load only'); eq(la[0].publishedKw, 450); deq(la[0].band, { minKw: 450, maxKw: 600, text: '450 - 600' }); eq(la[0].kv, 4.8);
eq(norm('ladwp', [[0, [F({ Capacity_Range_KW: 'NO CAPACITY', Voltage_Class: '34.5-KV' }, line(LAT, LNG, 8))]]])[0].publishedKw, 0);

/* UI (Milford): charge and discharge location figures in kW; the '… kW' string only as a fallback */
var UIA = { Circuit: '3631', Substation: 'MILVON', Operating_Voltage: '13.8', Phase: '3', Transmission_PNode_ID: '4432' };
function ui(o) { var a = {}, k; for (k in UIA) a[k] = UIA[k]; for (k in o) a[k] = o[k]; return a; }
var u1 = norm('ui', [[0, [F(ui({ Calc_Location_HC: 0, Remaining_Load_Capacity: '0.0 kW', Remaining_Capacity__MW_: 15.22, Queued_Capacity__MW_: 0 }), line(LAT, LNG, 20))]],
  [1, [F(ui({ Calc_Location_HC: 5526.2, Remaining_Load_Capacity: '5526.2 kW', Remaining_Capacity__MW_: 72.97758903, DER_in_Queue__MW_: 0 }), line(LAT, LNG, 20))]]]);
eq(u1[0].storageKw, 0, 'Milford 3631: charging 0 kW → 0'); eq(u1[0].genKw, 5526); eq(u1[0].upstream.substationKw, 15220, 'the tighter substation figure'); eq(u1[0].upstream.pnode, 'ISO-NE pnode 4432');
var u2 = norm('ui', [[0, [F(ui({ Circuit: '3642', Calc_Location_HC: 898.73, Remaining_Capacity__MW_: 72.98 }), line(LAT, LNG, 20))]], [1, [F(ui({ Circuit: '3642', Calc_Location_HC: 5492.1 }), line(LAT, LNG, 20))]]]);
eq(u2[0].storageKw, 899, 'charging 898.73 vs discharging 5,492.1 → 899 kW');
var u3 = norm('ui', [[0, [F(ui({ Calc_Location_HC: null, Remaining_Load_Capacity: '3630.7 kW' }), line(LAT, LNG, 20))]], [1, [F(ui({ Calc_Location_HC: 4000 }), line(LAT, LNG, 20))]]]);
eq(u3[0].storageKw, 3631, 'the "3630.7 kW" string is read when the figure is blank');

/* Eversource legacy map (CT): section MW, 0.05 is a placeholder, the EV layer is load */
var ev = norm('eversource-ct', [[0, [F({ CIRCUITID: '147', BULK_SUB_NAME: 'SOUTH_MEADOW_1A', SECTION_OPERATING_VOLTAGE: 22.8, HOSTING_CAPACITY_MW: 3.7, BULK_SUB_HC_MW: 152, IN_QUEUE_DG_KW: 1235, DATE_UPDATED: '11/21/2025, 11:39 AM' }, line(LAT, LNG, 20)),
  F({ CIRCUITID: '11A53', HOSTING_CAPACITY_MW: 0.05 }, line(LAT, LNG, 5))]], [1, [F({ CIRCUIT_NAME: '147', SBSTA_NM: 'SOUTH MEADOW', VOLTAGE: '23', FEEDER_CAPACITY_TO_MAP_MW: 1.7 }, line(LAT, LNG, 20))]]], { fallback: true });
var e147 = ev.filter(function (c) { return c.id === '147'; })[0], e11 = ev.filter(function (c) { return c.id === '11A53'; })[0];
eq(e147.genKw, 3700); eq(e147.loadKw, 1700); eq(e147.storageKw, 1700); eq(e147.upstream.substationKw, 152000); eq(e147.refreshed, '2025-11-21'); eq(e147.queuedKw, null); eq(e147.upstream.feederQueuedKw, 1235);
eq(e11.genKw, null, '0.05 MW is the single-phase placeholder, never 50 kW'); ok(e11.notes.indexOf('single-phase section: not studied') >= 0); eq(ev[0].id, '147');

/* Eversource's navigator (Danbury): seasons, the smallest of each */
function side(b, s, hc, extra) {
  var d = { phase: '3ph', hosting_capacity: hc, line_voltage_in_kv: 13.8, distance_in_meters: 0, section_id: '143398103_UG',
    customer_values: { feeder_name: '11A53', generators_online_in_kw: 532.02, generators_in_queue_in_kw: 52.3, primary_station_name: 'TRIANGLE_11A (BULK)',
      primary_station_hc_in_kw: b === 'gen' ? 83760.3984375 : 9403, date_last_updated: '2026-10-05 00:00:00' } };
  var k; for (k in (extra || {})) d[k] = extra[k];
  return { behavior: b, season: s, data: d };
}
var en = HS.normalize(HS.byKey('eversource-ct'), HS.byKey('eversource-ct'), [{ envelio: [side('gen', 'SUMMER', 800), side('gen', 'WINTER', 810), side('gen', 'SPRING', 820), side('gen', 'AUTUMN', 805),
  side('load', 'SUMMER', 200), side('load', 'WINTER', 200), side('load', 'SPRING', 210), side('load', 'AUTUMN', 200)] }], { lat: LAT, lng: LNG });
eq(en[0].genKw, 800); eq(en[0].loadKw, 200); eq(en[0].storageKw, 200); eq(en[0].id, '11A53'); eq(en[0].substation, 'TRIANGLE_11A (BULK)'); eq(en[0].kv, 13.8);
eq(en[0].refreshed, '2026-10-05'); eq(en[0].upstream.substationKw, 9403); eq(en[0].upstream.feederQueuedKw, 52);
var en1 = HS.normalize(HS.byKey('eversource-ct'), HS.byKey('eversource-ct'), [{ envelio: [side('gen', 'SUMMER', 50, { phase: '1ph' }), side('load', 'SUMMER', 100)] }], { lat: LAT, lng: LNG });
eq(en1[0].genKw, null, 'a single-phase section\'s 50 kW is the placeholder'); eq(en1[0].basis, 'load'); ok(en1[0].notes.indexOf('single-phase section: generation not studied') >= 0);

/* National Grid MA (Haverhill): layer 2 at the point, layer 0 joined for the substation */
var ng = norm('ngrid-ma', [[0, [F({ feeder_cdf: '05_14_31L2', primary_voltage: 13.2, primary_hc: 0.6, distance_to_substation: '3780.9' }, line(LAT, LNG, 12))]],
  [1, [F({ feeder_cdf: '05_14_31L2', Master_CDF: '05_14_31L2', substation_name: 'WATER STREET 31', feeder_voltage: 13.2, feeder_queued_dg: 0, hca_refresh_date: '10/02/2026' }, line(LAT, LNG, 12)),
       F({ feeder_cdf: '05_14_31L1', substation_name: 'WATER STREET 31', feeder_queued_dg: 0 }, line(LAT, LNG, 50))]]]);
eq(ng.length, 1, 'a feeder line with no segment near the point is context, not a circuit'); eq(ng[0].genKw, 600); eq(ng[0].basis, 'gen', 'National Grid publishes generation only');
eq(ng[0].substation, 'WATER STREET 31'); eq(ng[0].refreshed, '2026-10-02'); eq(ng[0].loadKw, null);
var ng10 = norm('ngrid-ma', [[0, [F({ feeder_cdf: '05_07_91W44', primary_hc: 10 }, line(LAT, LNG, 12))]]]);
eq(ng10[0].publishedKw, 10000); eq(ng10[0].band.maxKw, null, '10 MW is the published cap: "10 MW or more"');

/* Rhode Island Energy (Pawtucket; Warwick single phase) */
var ri = norm('ri-energy', [[0, [F({ Network_ID: '107W60', Substation: 'PAWTUCKET', Substation_Bank: 'Pawtucket No.1 #107 T73A', Voltage: 13.8, HC: 2.58, DG_In_Queue: 0.73, Map_Refresh_Date: 1756080000000, Substation_Bank_Anti_Islanding_: 4.67 }, line(LAT, LNG, 15))]],
  [1, [F({ Network_ID: '3F1', Substation: 'APPONAUG', Voltage: 12.47, DG_In_Queue: 0.140472, Map_Refresh_Date: 1756080000000 }, line(LAT, LNG, 5))]]]);
var p107 = ri.filter(function (c) { return c.id === '107W60'; })[0], f3 = ri.filter(function (c) { return c.id === '3F1'; })[0];
eq(p107.genKw, 2580); eq(p107.upstream.bankKw, 4670); eq(p107.refreshed, '2025-08-25'); eq(p107.substation, 'PAWTUCKET (Pawtucket No.1 #107 T73A)');
eq(f3.publishedKw, null, 'single and two phase: no section figure'); ok(f3.notes.indexOf('single or two phase: no section figure published') >= 0); eq(ri[0].id, '107W60');

/* the body the engine reads */
var bd = HS.body(HS.byKey('ace'), { label: 'Atlantic City Electric\'s published hosting capacity', addressResolved: true, grainWords: 'the nearest line section' }, gb[0], 'storage');
deq(Object.keys(bd).sort(), ['addressResolved', 'band', 'basis', 'grain', 'id', 'mode', 'publishedKw', 'queueNetted', 'queuedKw', 'source', 'substation', 'utility']);
eq(bd.utility, 'Atlantic City Electric'); eq(bd.publishedKw, 50);
var gj = GV.judge({ unit: { kw: 250 }, circuit: HS.body(HS.byKey('ngrid-ma'), { addressResolved: true }, ng[0], 'storage') });
ok(/Published for generation \(export\) only; the charging side is not published for this circuit/.test(gj.verdict.say), 'a generation-only figure never reads as storage');
eq(gj.circuit.queuedKw, null); ok(/no queue is published with this figure, so nothing was subtracted/.test(gj.verdict.say), 'a feeder queue beside a section figure is not taken from it');

/* ── territory ──────────────────────────────────────────────────────── */
eq(UT._t.mapNj({ OBJECTID: 17, NAME: ' ', LABEL: 'Municipal', TYPE: ' ' }).eiaId, '19856', 'the blank Vineland polygon is Vineland');
eq(UT._t.mapNj({ OBJECTID: 26, NAME: 'Municipal- Butler', LABEL: 'Municipal', TYPE: 'MUA' }).eiaId, '2650');
eq(UT._t.mapNj({ LABEL: 'JCP&L', NAME: 'Jersey Central Power & Light' }).eiaId, '9726');
eq(UT._t.mapCec({ Utility: 'Metropolitan Water District of So. Cal', Type: 'POU' }), null, 'a wholesale overlay is not a wires utility');
eq(UT._t.mapCec({ Utility: 'Marin Clean Energy', Type: 'CCA' }), null); eq(UT._t.mapCec({ Utility: 'Southern California Edison', Type: 'IOU', HIFLD_ID: '17609' }).eiaId, '17609');
eq(UT._t.mapCec({ Utility: 'Los Angeles Department of Water & Power', Acronym: 'LADWP', Type: 'POU' }).eiaId, '11208');
eq(UT._t.mapGa({ Utility_Name: 'North Georgia EMC', Utility_Type: 'EMC', CLASSIFICA: 'Wildlife Management Area' }), null, 'an overlay is not a service area');
eq(UT._t.mapGa({ Utility_Name: 'Jackson EMC', Utility_Type: 'EMC', CLASSIFICA: 'EMC' }).eiaId, '9601'); eq(UT._t.mapGa({ Utility_Name: null, Utility_Type: 'Unassigned', CLASSIFICA: 'Unassigned Area B' }).unassigned, true);
deq(UT._t.mapMa({ ELEC: 'Westfield Gas and Electric Light Department, Eversource Energy (NSTAR Electric)' }).map(function (c) { return c.eiaId; }), [null, '54913'], 'a split town names both');
eq(UT._t.mapFl2019({ ID: '7801', NAME: 'GULF POWER CO' }).eiaId, '6452'); eq(UT._t.mapLee({ type: 'LCEC' }).eiaId, '10857');
ok(UT._t.pointUrl(UT.NATIONAL[0], 41.88, -87.63).indexOf('Electricity_Rates_H3_Res5/FeatureServer/7/query?') > 0);
/* the City of Mesa's own electric service area (2026-10-20): asked inside
   Mesa's box only, as an envelope 40 m across with its polygon back */
var MSA = UT.SERVICE_AREAS.filter(function (l) { return l.key === 'mesa-electric-service-area'; })[0];
ok(MSA && MSA.utility.eiaId === '12351' && MSA.nearM === 40 && MSA.states[0] === 'AZ', 'the city\'s own map names the City of Mesa');
var mau = UT._t.areaUrl(MSA, 33.4152, -111.8329);
ok(mau.indexOf('https://gis.mesaaz.gov/mesaaz/rest/services/Geocortex/GCX_ExploreMesa/MapServer/13/query?') === 0 && /returnGeometry=true/.test(mau) && /outSR=4326/.test(mau) && /geometryType=esriGeometryEnvelope/.test(mau), mau);
eq(UT._t.cautionOf('16572', {}), 'Salt River Project\'s boundary encloses Arizona Public Service and City of Mesa islands that the public territory maps cannot separate; confirm the utility with the customer\'s bill.');
eq(UT._t.cautionOf('16572', { '12351': true }), 'Salt River Project\'s boundary encloses Arizona Public Service islands that the public territory maps cannot separate; confirm the utility with the customer\'s bill.', 'an island the city\'s own map settles leaves the caution');
eq(UT._t.cautionOf('803', {}), null);

/* ── the door, end to end on a fake network and a fake Firestore ────── */
function Esri(rows) { return { features: rows.map(function (r) { return { attributes: { NAME: r[1], Utility_ID: r[0], TYPE: r[2], STATE: r[3] || '', HOLDING_CO: r[1], Total_Customer_Count_2024: r[4] || null, Shape__Area: r[5] || null } }; }) }; }
function Places(names) { return { features: names.map(function (n) { return { attributes: { NAME: n + ' city', BASENAME: n } }; }) }; }
function fakeDb() {
  var docs = {}, writes = [];
  return { docs: docs, writes: writes, fn: function () { return { collection: function (c) { return { doc: function (id) { return {
    get: function () { var d = docs[c + '/' + id]; return Promise.resolve({ exists: !!d, data: function () { return d; } }); },
    set: function (d) { writes.push(c + '/' + id); docs[c + '/' + id] = JSON.parse(JSON.stringify(d)); return Promise.resolve(); } }; } }; } }; } };
}
function net(routes) {
  var calls = [];
  function fetchJson(url, opts) {
    calls.push({ url: url, headers: opts && opts.headers });
    for (var i = 0; i < routes.length; i++) if (routes[i][0].test(url)) {
      var r = routes[i][1]; r = typeof r === 'function' ? r(url) : r;
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(JSON.parse(JSON.stringify(r)));
    }
    return Promise.resolve({ features: [] });
  }
  return { calls: calls, fetchJson: fetchJson };
}
var clock = 1790000000000;
function deps(n, db) { return { fetchJson: n.fetchJson, db: db ? db.fn : function () { return null; }, now: function () { return clock; }, log: function () {} }; }
var UNIT = { kw: 250, kwh: 500, name: 'test 250 kW' };
function err(kind) { var e = new Error(kind); if (kind === 'timeout') e.name = 'AbortError'; if (kind === 'blocked') e.blocked = true; return e; }
var COMED = { features: [F({ Feeder: 'R6519', Feeder_N: 'F2724', SS_N: 'S0682', BESS_HC: 0, PV_HC_kW: 0, EV_HC_kW: 4690, Feeder_Q: 0, Queue_RD: '08/31/2026' }),
  F({ Feeder: 'R6514', Feeder_N: 'F2720', SS_N: 'S0682', BESS_HC: 420, PV_HC_kW: 420, EV_HC_kW: 4910, Feeder_Q: 0, Queue_RD: '08/31/2026' })] };
var comedEsc = CS.SERVICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

var tests = [];
/* Rockford: a Wisconsin co-op beside ComEd; ComEd's map answers, so the wire is ComEd's */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['16196', 'ROCK ENERGY COOPERATIVE', 'COOPERATIVE', 'WI', 18168, 2.4e10], ['4110', 'COMMONWEALTH EDISON CO', 'INVESTOR OWNED', 'IL', 4130749, 6.1e10]])],
    [/tigerweb/, Places(['Rockford'])], [new RegExp('^' + comedEsc + '/75/query\\?'), COMED]]);
  return H.run({ lat: 42.2711, lng: -89.094, unit: UNIT, substation: { name: 'TSS165', kv: 138, km: 2 } }, deps(n)).then(function (r) {
    eq(r.version, 'hosting-v1'); eq(r.coverage, 'read'); eq(r.utility.key, 'comed'); eq(r.utility.display, 'ComEd'); eq(r.utility.eiaId, '4110');
    /* review hosting:1 changed this one: it was eq(…confident, true, 'one map
       answered at the point'). Rock Energy Cooperative is a strong candidate
       with no map to ask, so ComEd's answer cannot rule it out */
    eq(r.territory.confident, false, 'a rival with no map keeps the answer unconfident'); eq(r.territory.evidence, 'hosting-layer');
    ok(/The territory maps also name Rock Energy Cooperative here; confirm the utility with a bill/.test(r.note), r.note);
    deq(r.territory.candidates.map(function (c) { return c.registryKey; }), ['rock-energy', 'comed']);
    deq(r.territory.candidates.map(function (c) { return c.hosting.says; }), ['publishes no hosting capacity', 'publishes hosting capacity'], 'every candidate says what its utility publishes');
    eq(r.territory.candidates[1].hosting.link.url, CS.REFERER, 'with its own page');
    eq(r.best, 0); eq(r.circuits[0].id, 'R6514'); eq(r.body.publishedKw, 420); eq(r.body.basis, 'storage'); eq(r.body.addressResolved, true);
    eq(r.verdict.verdict.key, 'fits'); eq(r.verdict.circuit.netKw, 420); eq(r.verdict.substation.name, 'TSS165');
    eq(r.source.key, 'comed'); eq(r.source.layer, /services\/([^/]+)\/FeatureServer/.exec(CS.SERVICE)[1] + ' layer 75'); eq(r.source.refreshed, '2026-08-31');
    eq(r.verify.viewerUrl, CS.REFERER);
    var cc = n.calls.filter(function (c) { return c.url.indexOf(CS.SERVICE) === 0; });
    eq(cc.length, 1, 'ComEd asked once, at its own 46 m rule'); deq(cc[0].headers, CS.headers(), 'with ComEd\'s Referer, set server-side');
    ok(r.tried.some(function (t) { return t.source === 'comed' && /^features/.test(t.outcome); }));
    ok(JSON.stringify(r).indexOf('usrsvcs') < 0 && JSON.stringify(r).indexOf('https://utility.arcgis') < 0, 'no upstream URL in the answer');
    eq(r.circuits[0].ledgerId, 'R6514', 'ComEd keeps its bare circuit ids for the ledger');
  });
});
/* Decatur: Shelby co-op beside Ameren; Ameren's grids answer */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['56697', 'AMEREN ILLINOIS COMPANY', 'INVESTOR OWNED', 'MO', 1224108, 1.96e11], ['17040', 'SHELBY ELECTRIC COOP, INC', 'COOPERATIVE', 'IL', 10054, 8.3e9]])],
    [/tigerweb/, Places(['Decatur'])],
    [/IL_HC_Grids\/FeatureServer\/0\/query/, { features: [F({ FEEDERID: 'L36215', OPERATINGVOLTAGE: '4KV', GENLIMITER: 'RevFlow', MAXGENMW_TXT: '0.73' }, ring(39.8403, -88.9548, 19))] }],
    [/AIC_LC_Grids\/FeatureServer\/0\/query/, { features: [F({ FEEDERID: 'L36215', LOADLIMITER: 'Loading', MAXLOADMW_TXT: '0.99' }, ring(39.8403, -88.9548, 19))] }]]);
  return H.run({ lat: 39.8403, lng: -88.9548, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.utility.key, 'ameren-il'); eq(r.circuits[0].storageKw, 730); eq(r.body.addressResolved, false, 'a grid cell is never address-resolved');
    ok(/surrounding block/.test(r.verdict.verdict.say)); eq(r.circuits[0].ledgerId, 'ameren-il:L36215', 'a national circuit id is namespaced for the ledger');
    eq(r.territory.candidates[0].registryKey, 'il-coops'); ok(/Ameren Illinois publishes hosting capacity/.test(r.note));
  });
});
/* Phoenix: twelve overlapping polygons; APS is the one, and publishes nothing */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['19604', 'USBIA-SAN CARLOS PROJECT', 'FEDERAL', 'AZ', 13341, 1.2e11], ['65261', 'GILA RIVER INDIAN UTILITY AUTHORITY (GRICUA)', 'COOPERATIVE', 'AZ', 3433, 5.4e10],
    ['40355', 'MARICOPA COUNTY M W C DIST #1', 'NOT AVAILABLE', 'AZ', null, 3.4e10], ['2469', 'BUCKEYE WATER C&D DISTRICT', 'NOT AVAILABLE', 'AZ', null, 3.4e10], ['5729', 'ELECTRICAL DIST NO8 MARICOPA', 'POLITICAL SUBDIVISION', 'AZ', 695, 3.4e10],
    ['12351', 'CITY OF MESA - (AZ)', 'MUNICIPAL', 'AZ', 18101, 4.3e9], ['27000', 'WAPA-- WESTERN AREA POWER ADMINISTRATION', 'FEDERAL', 'CO', 223, 2.7e12], ['19016', 'TONOPAH IRRIGATION DISTRICT', 'NOT AVAILABLE', 'AZ', null, 3.4e10],
    ['8139', 'HARQUAHALA VALLEY PWR DISTRICT', 'NOT AVAILABLE', 'AZ', null, 3.4e10], ['14543', "TOHONO O'ODHAM UTILITY AUTHORITY", 'NOT AVAILABLE', 'AZ', null, 8.7e10],
    ['13961', 'OCOTILLO WATER CONSERV. DIST.', 'NOT AVAILABLE', 'AZ', null, 3.4e10], ['803', 'ARIZONA PUBLIC SERVICE CO', 'INVESTOR OWNED', 'AZ', 1400037, 1.3e11]])], [/tigerweb/, Places(['Phoenix'])]]);
  return H.run({ lat: 33.4484, lng: -112.074, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'no-public-map'); eq(r.utility.key, 'aps'); eq(r.territory.confident, true, 'APS is the one non-weak candidate'); eq(r.territory.candidates[0].registryKey, 'aps');
    ok(!r.territory.candidates.some(function (c) { return c.eiaId === '27000'; }), 'WAPA is never a point\'s retail utility');
    ok(r.territory.candidates.filter(function (c) { return c.weak; }).length === r.territory.candidates.length - 1);
    eq(r.circuits.length, 0); eq(r.best, null); eq(r.body, null); eq(r.verdict.verdict.key, 'study'); ok(/R14-2-2616/.test(r.note)); eq(r.verify.viewerUrl, 'https://www.aps.com/dg');
    ok(!n.calls.some(function (c) { return /aps\.com/.test(c.url); }), 'nothing is asked of a utility that publishes nothing');
    ok(!n.calls.some(function (c) { return /GCX_ExploreMesa/.test(c.url); }), 'outside Mesa\'s box the city\'s map is never asked');
    var aps = r.territory.candidates[0].hosting;
    ok(/R14-2-2616/.test(aps.route) && /Service Areas Viewer/.test(aps.check.label) && aps.link.url === 'https://www.aps.com/dg', 'APS: its route, its own lookup and its page');
  });
});
/* Downtown Mesa (Tommy's 29 W Main St; 2026-10-17, then 2026-10-20): the
   City of Mesa's own electric service area map puts the point 1.5 km inside
   the city's area, so the city serves it, with confidence; SRP's boundary
   (which encloses the island) is weak there, and its caution does not apply */
var MESA_ROWS = [['16572', 'SALT RIVER PROJECT', 'POLITICAL SUBDIVISION', 'AZ', 1166094, 9.1e9], ['12351', 'CITY OF MESA - (AZ)', 'MUNICIPAL', 'AZ', 18101, 4.3e9],
  ['5729', 'ELECTRICAL DIST NO8 MARICOPA', 'POLITICAL SUBDIVISION', 'AZ', 695, 3.4e10], ['19016', 'TONOPAH IRRIGATION DISTRICT', 'NOT AVAILABLE', 'AZ', null, 3.4e10]];
var MESA_ESA = /GCX_ExploreMesa\/MapServer\/13\/query/, MESA_PT = { lat: 33.4152, lng: -111.8329 };
function mesaArea(dLatM, halfM) { return { features: [F({ FACILITYID: 'ELSA2' }, ring(MESA_PT.lat + dLatM / 111320, MESA_PT.lng, halfM))] }; }
function who(r, id) { return r.territory.candidates.filter(function (c) { return c.eiaId === id; })[0]; }
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places(['Mesa'])], [MESA_ESA, mesaArea(0, 1500)]]);
  return H.run({ lat: MESA_PT.lat, lng: MESA_PT.lng, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.territory.confident, true, 'the city\'s own map settles downtown Mesa'); eq(r.coverage, 'no-public-map');
    eq(r.utility.key, 'mesa'); eq(r.utility.display, 'City of Mesa'); eq(r.utility.eiaId, '12351');
    var mesa = who(r, '12351'), srp = who(r, '16572');
    eq(mesa.weak, false); eq(mesa.fromState, true); ok(/inside its own electric service area \(the city's map\)/.test(mesa.why), mesa.why);
    eq(srp.weak, true); ok(/the point is inside the City of Mesa's own electric service area/.test(srp.why), srp.why);
    eq(r.territory.candidates[0].eiaId, '12351', 'the city leads the list');
    eq(r.territory.caution, null); ok(!/islands/.test(r.note), 'SRP\'s caution does not apply where the city\'s own map answered');
    ok(/publishes no hosting capacity/.test(r.note) && /Electric_Service_Area\.pdf/.test(mesa.hosting.check.url), r.note);
    eq(mesa.hosting.says, 'publishes no hosting capacity'); eq(srp.hosting.check.url, 'https://www.srpnet.com/about/service-area-territory');
    eq(r.verdict.verdict.key, 'study'); ok(!/ComEd/.test(JSON.stringify(r)), 'no ComEd wording outside ComEd');
    ok(r.tried.some(function (t) { return t.source === 'mesa-electric-service-area' && /^inside \(1500 m from the edge\)$/.test(t.outcome); }), r.tried);
    var asked = n.calls.filter(function (c) { return MESA_ESA.test(c.url); });
    ok(asked.length === 1 && /returnGeometry=true/.test(asked[0].url) && /geometryType=esriGeometryEnvelope/.test(asked[0].url), 'the city\'s map is asked once, an envelope with its polygon');
    ok(/City of Mesa's electric service area/.test(r.territory.source), r.territory.source);
  });
});
/* 20 m inside the city's line: a geocoded address can land a lot over, so
   the city leads but nothing is confident, and both islands stay in SRP's caution */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places(['Mesa'])], [MESA_ESA, mesaArea(1520, 1500)]]);
  return H.run({ lat: MESA_PT.lat, lng: MESA_PT.lng, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.territory.confident, false, 'on the edge of the city\'s area nothing is confident'); eq(r.utility.key, 'mesa', 'the city\'s own map still leads');
    ok(/within 40 m of the edge/.test(who(r, '12351').why)); eq(who(r, '16572').weak, false);
    ok(/encloses Arizona Public Service and City of Mesa islands/.test(r.note), r.note);
  });
});
/* Mesa Riverview (in the city, outside its electric area): the city's own
   map says no, so SRP leads and the caution names APS's islands alone */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places(['Mesa'])], [MESA_ESA, { features: [] }]]);
  return H.run({ lat: 33.437, lng: -111.865, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.utility.key, 'srp'); eq(r.territory.confident, false, 'SRP\'s APS islands keep it unconfident');
    var mesa = who(r, '12351');
    eq(mesa.weak, true); ok(/outside the City of Mesa's own electric service area/.test(mesa.why), mesa.why);
    ok(/encloses Arizona Public Service islands/.test(r.note) && !/City of Mesa islands/.test(r.note), r.note);
    eq(r.verify.viewerUrl.indexOf('https://www.srpnet.com/'), 0);
  });
});
/* the city's map down: said in the note, and the answer is never kept */
tests.push(function () {
  var db = fakeDb();
  var n = net([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places(['Mesa'])], [MESA_ESA, err('timeout')]]);
  return H.run({ lat: MESA_PT.lat, lng: MESA_PT.lng, unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.territory.confident, false); eq(r.territory.partial, true);
    ok(/The City of Mesa's own service-area map did not answer/.test(r.note), r.note);
    eq(who(r, '12351').weak, false, 'without its map the city stays a candidate inside the city'); ok(/serves part of the city/.test(who(r, '12351').why));
    ok(/encloses Arizona Public Service and City of Mesa islands/.test(r.note));
    ok(!db.writes.some(function (w) { return /_territory__/.test(w); }), 'a territory answer missing the city\'s map is never kept');
  });
});
/* East Mesa, outside the city's place: City of Mesa is a stand-in there, SRP leads, still never confident */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places(['Gilbert'])]]);
  return H.run({ lat: 33.3528, lng: -111.789, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.utility.key, 'srp'); eq(r.territory.confident, false, 'SRP\'s islands keep it unconfident');
    eq(who(r, '12351').weak, true, 'outside Mesa the city polygon is a stand-in');
    ok(/islands/.test(r.note)); eq(r.verify.viewerUrl.indexOf('https://www.srpnet.com/'), 0);
    ok(n.calls.some(function (c) { return MESA_ESA.test(c.url); }), 'inside Mesa\'s box the city\'s map is asked');
  });
});
/* Panama City: the national layer says Duke alone; the 2019 Florida IOU layer says Gulf Power, now FPL */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['6455', 'DUKE ENERGY FLORIDA, LLC', 'INVESTOR OWNED', 'FL', 2009464, 9.9e10]])], [/tigerweb/, Places(['Panama City'])],
    [/Retail_Service_Territories_FL_InvestorOwned\/FeatureServer\/5/, { features: [{ attributes: { ID: '6455', NAME: 'DUKE ENERGY FLORIDA, LLC' } }, { attributes: { ID: '7801', NAME: 'GULF POWER CO' } }] }]]);
  return H.run({ lat: 30.1588, lng: -85.6602, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.utility.key, 'fpl', 'FPL (former Gulf Power), not a lone Duke hit'); eq(r.coverage, 'no-public-map'); eq(r.territory.confident, false);
    ok(/Duke Energy Florida/.test(r.note) && /confirm the utility with a bill/.test(r.note)); ok(/15% of the line section/.test(r.note));
  });
});
/* Norwalk: four utilities on the map; UI's map is empty, Eversource's navigator has no parcel, its legacy map answers */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['19497', 'UNITED ILLUMINATING CO', 'INVESTOR OWNED', 'CT', 345877, 5.8e9], ['13825', 'NORWALK THIRD TAXING DISTRICT', 'NOT AVAILABLE', 'CT', null, 1.66e8],
    ['4176', 'CONNECTICUT LIGHT & POWER CO', 'INVESTOR OWNED', 'CT', 1290878, 2.3e10], ['17569', 'CITY OF SOUTH NORWALK - (CT)', 'NOT AVAILABLE', 'CT', null, 1.66e8]])], [/tigerweb/, Places(['Norwalk'])],
    [/eversource-ct\.envelio\.com/, { __noContent: true }],
    [/DG_Hosting_CT_Final\/MapServer\/0\/query/, { features: [F({ CIRCUITID: '9S16', BULK_SUB_NAME: 'NORWALK_9S', SECTION_OPERATING_VOLTAGE: 13.8, HOSTING_CAPACITY_MW: 1.6, BULK_SUB_HC_MW: 89.2, IN_QUEUE_DG_KW: 52, DATE_UPDATED: '11/21/2025, 11:39 AM' }, line(41.1177, -73.4082, 25))] }],
    [/EV_HC_Capacity_CT\/MapServer\/0\/query/, { features: [F({ CIRCUIT_NAME: '9S16', SBSTA_NM: 'NORWALK', VOLTAGE: '13.8', FEEDER_CAPACITY_TO_MAP_MW: 0.9 }, line(41.1177, -73.4082, 25))] }]]);
  return H.run({ lat: 41.1177, lng: -73.4082, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.utility.key, 'eversource-ct', 'the map that answers decides, not the smallest polygon');
    eq(r.circuits[0].id, '9S16'); eq(r.circuits[0].storageKw, 900); ok(/legacy circuit map/.test(r.source.label)); ok(/older copy/.test(r.note), 'a stale source says so');
    eq(n.calls.filter(function (c) { return /envelio/.test(c.url); }).length, 5, 'the point, then four nearby points, before the legacy map');
    ok(r.tried.some(function (t) { return t.source === 'ui' && t.outcome === 'empty'; }) && r.tried.some(function (t) { return t.source === 'eversource-ct:fallback'; }));
    ok(!n.calls.some(function (c) { return /resultRecordCount/.test(c.url); }));
  });
});
/* Milford: UI's map answers; Eversource's navigator has no parcel, and its slow legacy map is never waited on */
tests.push(function () {
  var db = fakeDb();
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['19497', 'UNITED ILLUMINATING CO', 'INVESTOR OWNED', 'CT', 345877, 5.8e9], ['4176', 'CONNECTICUT LIGHT & POWER CO', 'INVESTOR OWNED', 'CT', 1290878, 2.3e10]])],
    [/tigerweb/, Places(['Milford'])], [/eversource-ct\.envelio\.com/, { __noContent: true }],
    [/UI_BESS_HC_CHARGING\/FeatureServer\/0\/query/, { features: [F(ui({ Calc_Location_HC: 898.73 }), line(41.2307, -73.064, 14))] }],
    [/UI_BESS_HC_DISCHARGING\/FeatureServer\/1\/query/, { features: [F(ui({ Calc_Location_HC: 5492.1 }), line(41.2307, -73.064, 14))] }]]);
  return H.run({ lat: 41.2307, lng: -73.064, unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.utility.key, 'ui'); eq(r.circuits[0].storageKw, 899);
    ok(!n.calls.some(function (c) { return /dghostingexternalmapprod/.test(c.url); }), 'the legacy map is not asked when a neighbour\'s map answered');
    ok(!db.writes.some(function (w) { return /eversource-ct__/.test(w); }), 'an answer whose fallback was skipped is not cached');
    ok(db.writes.some(function (w) { return /\/ui__/.test(w); }));
  });
});
/* Atlanta: Georgia Power's map is behind a licence; OMEGA never reads it */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['7140', 'GEORGIA POWER CO', 'INVESTOR OWNED', 'GA', 2804103, 2.2e11]])], [/tigerweb/, Places(['Atlanta'])],
    [/GA_EMCTerritories_SELC_Clip/, { features: [{ attributes: { Utility_Name: 'Georgia Power', Utility_Type: 'IOU', CLASSIFICA: 'GP' } }] }]]);
  return H.run({ lat: 33.749, lng: -84.388, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'account-required'); eq(r.utility.key, 'georgia-power'); ok(/hosting-capacity-tool/.test(r.verify.viewerUrl)); ok(/OMEGA does not read it/.test(r.note));
    ok(!n.calls.some(function (c) { return /gpchstcaptl|southernco/.test(c.url); }));
  });
});
/* the cache: a hit for 7 days (nothing asked again), an empty answer for 24 hours, an error never */
tests.push(function () {
  var db = fakeDb();
  function decatur(failGen) {
    return net([[/Electricity_Rates_H3_Res5/, Esri([['56697', 'AMEREN ILLINOIS COMPANY', 'INVESTOR OWNED', 'IL', 1224108, 1.96e11]])], [/tigerweb/, Places(['Decatur'])],
      [/IL_HC_Grids/, failGen ? err('timeout') : { features: [F({ FEEDERID: 'L36215', MAXGENMW_TXT: '0.73' }, ring(39.8403, -88.9548, 19))] }],
      [/AIC_LC_Grids/, failGen ? err('timeout') : { features: [F({ FEEDERID: 'L36215', MAXLOADMW_TXT: '0.99' }, ring(39.8403, -88.9548, 19))] }]]);
  }
  var bad = decatur(true);
  return H.run({ lat: 39.8403, lng: -88.9548, unit: UNIT }, deps(bad, db)).then(function (r) {
    eq(r.coverage, 'unreachable', 'a timeout is unreachable, never "nothing published"'); ok(/did not answer \(it timed out\)/.test(r.note));
    ok(!db.writes.some(function (w) { return /ameren-il__/.test(w); }), 'an error is never cached');
    var good = decatur(false);
    return H.run({ lat: 39.8403, lng: -88.9548, unit: UNIT }, deps(good, db)).then(function (r2) {
      eq(r2.coverage, 'read'); var id = H.CACHE + '/' + H.cacheId('ameren-il', 39.8403, -88.9548);
      ok(db.docs[id] && db.docs[id].expiresAt === clock + H.HIT_TTL_MS, 'a hit is kept 7 days');
      ok(db.docs[H.CACHE + '/' + H.cacheId('_territory', 39.8403, -88.9548)], 'the territory answer is cached too');
      var again = decatur(false);
      return H.run({ lat: 39.84031, lng: -88.95479, unit: UNIT }, deps(again, db)).then(function (r3) {
        eq(again.calls.length, 0, 'the same ~11 m cell twice asks nothing upstream'); eq(r3.circuits[0].storageKw, 730);
        ok(r3.tried.some(function (t) { return t.source === 'ameren-il' && t.outcome === 'cache (features)'; }));
        clock += H.HIT_TTL_MS + 1;
        var later = decatur(false);
        return H.run({ lat: 39.8403, lng: -88.9548, unit: UNIT }, deps(later, db)).then(function () { ok(later.calls.length > 0, 'a week later it asks again'); });
      });
    });
  }).then(function () {
    var n = net([[/Electricity_Rates_H3_Res5/, Esri([['19497', 'UNITED ILLUMINATING CO', 'INVESTOR OWNED', 'CT', 345877, 5.8e9]])], [/tigerweb/, Places(['New Haven'])]]);
    return H.run({ lat: 41.3083, lng: -72.9279, unit: UNIT }, deps(n, db)).then(function (r) {
      eq(r.coverage, 'none-here', 'downtown New Haven is unmapped'); ok(/not a zero/.test(r.note)); eq(r.utility.key, 'ui');
      var d = db.docs[H.CACHE + '/' + H.cacheId('ui', 41.3083, -72.9279)];
      ok(d && d.result.outcome === 'empty' && d.expiresAt === clock + H.EMPTY_TTL_MS, 'an empty answer is kept 24 hours');
      eq(n.calls.filter(function (c) { return /UI_BESS_HC_CHARGING/.test(c.url); }).length, 6, 'both layers at three widths before saying none here');
    });
  });
});
/* a cache document from another release of the registry is a miss */
tests.push(function () {
  var db = fakeDb();
  db.docs[H.CACHE + '/' + H.cacheId('_territory', 39.8403, -88.9548)] = { v: 'hosting-sources-1999', expiresAt: clock + 1e9, territory: { candidates: [] } };
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['56697', 'AMEREN ILLINOIS COMPANY', 'INVESTOR OWNED', 'IL', 1224108, 1.96e11]])], [/tigerweb/, Places(['Decatur'])]]);
  return H.run({ lat: 39.8403, lng: -88.9548, unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.utility.key, 'ameren-il', 'an old release\'s territory is not served'); ok(n.calls.some(function (c) { return /Electricity_Rates_H3_Res5/.test(c.url); }));
    eq(db.docs[H.CACHE + '/' + H.cacheId('_territory', 39.8403, -88.9548)].v, HS.VERSION, 'rewritten under this release');
  });
});
/* the territory chain stops at its share of the time: three slow national layers never take 24 s */
tests.push(function () {
  var slow = function () { clock += 6000; var e = new Error('timeout'); e.name = 'AbortError'; return e; };
  var n = net([[/Electricity_Rates_H3_Res5|Electric_Retail_Service_Territories/, slow], [/tigerweb/, Places(['Chicago'])], [new RegExp('^' + comedEsc), COMED]]);
  var start = clock;
  return H.run({ lat: 41.8819, lng: -87.6278, unit: UNIT }, deps(n)).then(function (r) {
    ok(r.tried.some(function (t) { return t.source === 'hifld-2021-territories' && /out of time/.test(t.outcome); }), 'the third copy is skipped once the territory\'s share is spent');
    ok(clock - start <= H.TERRITORY_MS + 6000, 'the territory took its share, not 24 s'); eq(r.territory.approximate, true);
  });
});
/* both of Eversource's maps empty: the answer names the wider search */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['4176', 'CONNECTICUT LIGHT & POWER CO', 'INVESTOR OWNED', 'CT', 1290878, 2.3e10]])], [/tigerweb/, Places(['Hartford'])], [/envelio\.com/, { __noContent: true }]]);
  return H.run({ lat: 41.7637, lng: -72.6851, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'none-here'); ok(/no circuit within 400 m/.test(r.note), r.note);
  });
});
/* SDG&E is never cached (its terms) */
tests.push(function () {
  var db = fakeDb();
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['16609', 'SAN DIEGO GAS & ELECTRIC CO', 'INVESTOR OWNED', 'CA', 1525968, 1.5e10]])], [/tigerweb/, Places(['San Diego'])],
    [/ElectricLoadServingEntities_IOU_POU/, { features: [{ attributes: { Utility: 'San Diego Gas & Electric', Acronym: 'SDG&E', Type: 'IOU', HIFLD_ID: '16609' } }] }],
    [/ICA_MAP_PROD_GenerationCapacityGrids_VW/, { features: [F({ VOLTAGE: 12, CIRCUIT_NAME: '1286', SUBID: 'MESA HEIGHTS', ICAWOF_UNIGENERATION: 1.8, ICAWOF_UNILOAD: 5.8 }, ring(32.825, -117.155, 32))] }]]);
  return H.run({ lat: 32.825, lng: -117.155, unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.circuits[0].storageKw, 1800); ok(!db.writes.some(function (w) { return /sdge/.test(w); }), 'SDG&E\'s answer is never stored');
  });
});
/* SCE's own host answers with a bot wall: the ArcGIS Online copy is read, and the answer says it is older */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['17609', 'SOUTHERN CALIFORNIA EDISON CO', 'INVESTOR OWNED', 'CA', 5e6, 1e11]])], [/tigerweb/, Places(['Irvine'])],
    [/ElectricLoadServingEntities_IOU_POU/, { features: [{ attributes: { Utility: 'Southern California Edison', Acronym: 'SCE', Type: 'IOU', HIFLD_ID: '17609' } }] }],
    [/drpep\.sce\.com/, err('blocked')],
    [/z6hI6KRjKHvhNO0r\/arcgis\/rest\/services\/ICA_Layer\/FeatureServer\/2\/query/, { features: [F({ circuit_name: 'Bardeen', substation_name: 'Cabrillo', uniform_generation: 3.334, ica_overall_load: '5.09', changed_date: '08/08/2025' }, line(33.6846, -117.8265, 20))] }]]);
  return H.run({ lat: 33.6846, lng: -117.8265, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.circuits[0].storageKw, 3334); ok(/ArcGIS Online copy/.test(r.source.label)); eq(r.source.refreshed, '2025-08-08', 'labelled with its own date');
    ok(r.tried.some(function (t) { return t.source === 'sce' && t.outcome === 'blocked'; }), 'an HTML answer is a failure, never a zero');
  });
});
/* ACE's dated service moves: found again through ACE's own web map */
tests.push(function () {
  var moved = 'https://services3.arcgis.com/agWTKEK7X5K1Bx7o/arcgis/rest/services/PHI_Hosting_Capacity1_15_2027/FeatureServer';
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['963', 'ATLANTIC CITY ELECTRIC CO', 'INVESTOR OWNED', 'NJ', 573000, 1e10]])], [/tigerweb/, Places(['Glassboro'])],
    [/mapsdep\.nj\.gov/, { features: [{ attributes: { OBJECTID: 7, NAME: 'Atlantic City Electric', LABEL: 'ACE', TYPE: 'LDC' } }] }],
    [/PHI_Hosting_Capacity10_2_2026/, { error: { code: 400, message: 'Invalid URL' } }],
    [/sharing\/rest\/content\/items\/5a5650aece5f462f9266ac792e4380fb\/data/, { operationalLayers: [{ title: 'old', layers: [{ url: 'https://services3.arcgis.com/agWTKEK7X5K1Bx7o/arcgis/rest/services/PHI_Hosting_Capacity10_2_2026/FeatureServer/4' }] }, { title: 'new', layers: [{ title: 'ACE', url: moved + '/4' }] }] }],
    [/PHI_Hosting_Capacity1_15_2027\/FeatureServer\/4\/query/, { features: [F({ FeederID: 'NJ0748', Substation: 'Glassboro', Allowable_PV_kW: 3353.45, Transformer_Large_Gen_HC: 18904.41, Total_Pending_Gen_kW: 2448.07 }, line(39.7029, -75.1118, 7))] }],
    [/PHI_EV_Load_Serving_Capacity/, { features: [F({ FEEDERID: 'NJ0748', Capacity_MW: 5.86 }, line(39.7029, -75.1118, 7))] }]]);
  return H.run({ lat: 39.7029, lng: -75.1118, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.utility.key, 'ace'); eq(r.circuits[0].genKw, 3353); eq(r.circuits[0].storageKw, 3353);
    ok(n.calls.some(function (c) { return c.url.indexOf(moved + '/4/query?') === 0; }), 'the moved service is asked');
    eq(HS.resolveFromWebmap({ operationalLayers: [{ url: 'https://evil.example.com/arcgis/rest/services/PHI_Hosting_Capacity9_9_2099/FeatureServer/4' }] }, HS.byKey('ace').layers[0].resolve.match), null, 'only an ArcGIS Online host is ever followed');
  });
});
/* Dallas (2026-10-28): the national layer names Oncor, TNMP and three co-op
   polygons drawn over the metro (the live rows of 2026-10-28); no Texas
   utility publishes a map and the PUCT's own boundary layers are licence-
   blocked, so every candidate is listed, nothing is confident, and no
   figure is invented. The smallest polygon (a co-op) leads the list — the
   bill or the PUCT's viewer decides (docs/HOSTING-TEXAS.md). */
var DALLAS_ROWS = [['18976', 'TRINITY VALLEY ELEC COOP INC', 'COOPERATIVE', 'TX', 88305, 2.0e10], ['8620', 'HILCO ELECTRIC COOPERATIVE, INC.', 'COOPERATIVE', 'TX', 35322, 1.68e10],
  ['6182', 'FARMERS ELECTRIC COOP, INC - (TX)', 'COOPERATIVE', 'TX', 100359, 2.85e10], ['40051', 'TEXAS-NEW MEXICO POWER CO', 'INVESTOR OWNED', 'TX', null, 1.67e11],
  ['44372', 'ONCOR ELECTRIC DELIVERY COMPANY LLC', 'INVESTOR OWNED', 'TX', null, 3.0e11]];
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri(DALLAS_ROWS)], [/tigerweb/, Places(['Dallas'])]]);
  return H.run({ lat: 32.7767, lng: -96.797, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'no-public-map'); eq(r.territory.confident, false, 'overlapping polygons with no authority layer: never confident');
    eq(r.circuits.length, 0); eq(r.best, null); eq(r.body, null); eq(r.verdict.verdict.key, 'study', 'no figure is invented anywhere in Texas');
    var keys = r.territory.candidates.map(function (c) { return c.registryKey; });
    ok(keys.indexOf('oncor') >= 0 && keys.indexOf('tnmp') >= 0 && keys.indexOf('tx-coops') >= 0, 'Oncor, TNMP and the co-ops are all named: ' + keys);
    var on = r.territory.candidates.filter(function (c) { return c.registryKey === 'oncor'; })[0];
    eq(on.hosting.says, 'publishes no hosting capacity'); ok(/25\.211/.test(on.hosting.route), 'Oncor\'s route rides with it');
    ok(/experience\.arcgis\.com/.test(on.hosting.check.url), 'and the PUCT\'s own boundary viewer');
    ok(/confirm the utility with a bill/.test(r.note), r.note);
    ok(!n.calls.some(function (c) { return /oncor\.com|N6Lzvtb46cpxThhu/.test(c.url); }), 'nothing is asked of a utility that publishes nothing, and never the PUCT\'s Platts-licensed layers');
  });
});
/* Lewisville: the CoServ (Denton County EC) seam beside Oncor and TNMP —
   a seam point lists both sides and never answers one with confidence */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['4262', 'COOKE COUNTY ELEC COOP ASSN', 'COOPERATIVE', 'TX', 17997, 1.75e10], ['5078', 'DENTON COUNTY ELEC COOP, INC', 'COOPERATIVE', 'TX', 323783, 2.06e10],
    ['19159', 'TRI-COUNTY ELECTRIC COOP, INC (TX)', 'COOPERATIVE', 'TX', 139316, 5.23e10], ['20948', 'WISE ELECTRIC COOP INC', 'COOPERATIVE', 'TX', 26734, 2.48e10],
    ['40051', 'TEXAS-NEW MEXICO POWER CO', 'INVESTOR OWNED', 'TX', null, 1.67e11], ['44372', 'ONCOR ELECTRIC DELIVERY COMPANY LLC', 'INVESTOR OWNED', 'TX', null, 3.0e11]])],
    [/tigerweb/, Places(['Lewisville'])]]);
  return H.run({ lat: 33.0462, lng: -96.9942, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.territory.confident, false, 'the CoServ/Oncor seam is never answered with confidence');
    var keys = r.territory.candidates.map(function (c) { return c.registryKey; });
    ok(keys.indexOf('tx-coops') >= 0 && keys.indexOf('oncor') >= 0, 'both sides of the seam are listed');
    ok(/confirm the utility with a bill/.test(r.note), r.note);
  });
});
/* Beaumont: Entergy Texas alone on the layer — one strong candidate, so the
   answer is confident, and it says plainly what Entergy offers instead */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['55937', 'ENTERGY TEXAS INC.', 'INVESTOR OWNED', 'TX', 519216, 8.36e10]])], [/tigerweb/, Places(['Beaumont'])]]);
  return H.run({ lat: 30.0802, lng: -94.1266, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'no-public-map'); eq(r.utility.key, 'entergy-tx'); eq(r.utility.display, 'Entergy Texas'); eq(r.utility.eiaId, '55937');
    eq(r.territory.confident, true, 'Entergy Texas is the one candidate at Beaumont');
    eq(r.verdict.verdict.key, 'study'); ok(/IPODG/.test(r.note), r.note); ok(/entergytexas\.com/.test(r.verify.viewerUrl));
    ok(!/ComEd/.test(JSON.stringify(r)), 'no ComEd wording in Texas');
  });
});
/* outside the covered states, and outside every territory */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['15466', 'PUBLIC SERVICE CO OF COLORADO', 'INVESTOR OWNED', 'CO', 1500000, 1e11]])]]);
  return H.run({ lat: 39.7392, lng: -104.9903, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'not-wired'); eq(r.utility.display, 'Public Service CO of Colorado'); eq(r.verify.viewerUrl, HS.DOE_ATLAS); ok(/outside the utilities OMEGA has researched/.test(r.note));
    ok(/IL, FL, GA, NJ, AZ, CA, CT, MA, RI, TX/.test(r.note), 'the note names the ten states off the registry, never a stale copy');
    ok(!n.calls.some(function (c) { return /tigerweb/.test(c.url); }), 'no place lookup outside the covered states');
  }).then(function () {
    var o = net([[/Electricity_Rates_H3_Res5/, { features: [] }]]);
    return H.run({ lat: 25.0, lng: -70.0, unit: UNIT }, deps(o)).then(function (r) { eq(r.coverage, 'outside'); eq(r.utility, null); eq(r.verdict.verdict.key, 'study'); });
  });
});
/* every territory layer down: the registry's own boxes, said so; never cached */
tests.push(function () {
  var db = fakeDb();
  var n = net([[/FeatureServer\/7\/query|Electric_Retail_Service_Territories|tigerweb/, err('timeout')], [new RegExp('^' + comedEsc), COMED]]);
  return H.run({ lat: 41.8819, lng: -87.6278, unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.territory.approximate, true); eq(r.utility.key, 'comed'); eq(r.coverage, 'read'); ok(/rough guess/.test(r.note));
    ok(!db.writes.some(function (w) { return /_territory/.test(w); }), 'an approximate territory is never cached');
  });
});
/* the mode: export reads generation, load reads load */
tests.push(function () {
  eq(H.modeOf('non-export'), 'load'); eq(H.modeOf('pv'), 'export'); eq(H.modeOf(undefined), 'storage'); eq(H.modeOf('junk'), 'storage');
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['4110', 'COMMONWEALTH EDISON CO', 'INVESTOR OWNED', 'IL', 4e6, 6e10]])], [/tigerweb/, Places(['Chicago'])], [new RegExp('^' + comedEsc), COMED]]);
  return H.run({ lat: 41.8819, lng: -87.6278, unit: UNIT, mode: 'load' }, deps(n)).then(function (r) {
    eq(r.mode, 'load'); eq(r.circuits[0].basis, 'load'); eq(r.circuits[0].publishedKw, 4910, 'the most load room first'); eq(r.circuits[0].queuedKw, null, 'a generation queue never comes off a load figure');
  });
});

/* ── the review of 2026-10-17 (hosting:0 … hosting:7), on the same fake network ── */
function Njdep(rows) { return { features: rows.map(function (r) { return { attributes: { OBJECTID: r[0], NAME: r[1], LABEL: r[2], TYPE: r[3] || '' } }; }) }; }
var JCPL_SOLAR = /Solar_Accommodation_Limit_2020\/FeatureServer\/0\/query/, JCPL_EV = /HostingCapacityEV\/FeatureServer\/0\/query/;
var BUTLER = [41.0294, -74.3154], BRANCH = [41.1468, -74.7488];
/* hosting:0 — Butler: NJDEP (the state's own layer) names only the borough,
   so JCP&L is weak there; its transformer points 37 m away are never asked
   and never become the wire */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['9726', 'JERSEY CENTRAL POWER & LIGHT CO', 'INVESTOR OWNED', 'OH', 1100000, 8e9]])], [/tigerweb/, Places(['Butler'])],
    [/mapsdep\.nj\.gov/, Njdep([[26, 'Municipal- Butler', 'Municipal', 'MUA']])],
    [JCPL_SOLAR, { features: [F({ RemainNum: 50, Remaining: 'Less than 100 kW AC' }, pt(BUTLER[0], BUTLER[1], 37))] }],
    [JCPL_EV, { features: [F({ remainnum: 1765, remaining: '1765' }, pt(BUTLER[0], BUTLER[1], 37))] }]]);
  return H.run({ lat: BUTLER[0], lng: BUTLER[1], unit: { kw: 500, kwh: 1000, name: '500 kW' } }, deps(n)).then(function (r) {
    var jc = r.territory.candidates.filter(function (c) { return c.registryKey === 'jcpl'; })[0];
    eq(jc.weak, true, 'NJDEP names only Butler here'); ok(/state's own territory layer/.test(jc.why));
    ok(!n.calls.some(function (c) { return JCPL_SOLAR.test(c.url) || JCPL_EV.test(c.url); }), 'a weak candidate\'s map is never asked while a strong one is on the list');
    eq(r.coverage, 'no-public-map'); eq(r.utility.key, 'nj-munis'); eq(r.utility.display, 'Municipal Electric: Butler'); eq(r.utility.eiaId, '2650');
    eq(r.territory.evidence, 'territory'); eq(r.territory.confident, true, 'the state\'s own layer names one utility'); eq(r.circuits.length, 0);
    ok(/A neighbouring utility's figures do not apply/.test(r.note), r.note); ok(!/JCP&L publishes/.test(r.note));
    var weakWire = H.compose({ unit: UNIT }, 'storage', r.territory, [{ entry: HS.byKey('jcpl'), r: { outcome: 'features', circuits: [{ id: '', publishedKw: 0, distanceM: 37, basis: 'storage' }], source: null } }], [], BUTLER[0], BUTLER[1]);
    eq(weakWire.coverage, 'no-public-map', 'and a weak candidate\'s hit, were it ever asked, never becomes the wire over a strong one'); eq(weakWire.utility.key, 'nj-munis');
  });
});
/* hosting:1 — Branchville: NJDEP names JCP&L AND Sussex REC; JCP&L's map
   answers 47 m away, Sussex REC has no map to ask: never confident */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['9726', 'JERSEY CENTRAL POWER & LIGHT CO', 'INVESTOR OWNED', 'OH', 1100000, 8e9], ['40299', 'SUSSEX RURAL ELECTRIC COOP INC', 'COOPERATIVE', 'NJ', 9000, 5e8]])],
    [/tigerweb/, Places(['Branchville'])],
    [/mapsdep\.nj\.gov/, Njdep([[11, 'Jersey Central Power & Light', 'JCP&L', 'LDC'], [15, 'Sussex Rural Electric Cooperative', 'Cooperative', 'Cooperative']])],
    [JCPL_SOLAR, { features: [F({ RemainNum: 703, Remaining: '703 kW AC' }, pt(BRANCH[0], BRANCH[1], 47))] }],
    [JCPL_EV, { features: [F({ remainnum: 2017, remaining: '2017' }, pt(BRANCH[0], BRANCH[1], 47))] }]]);
  return H.run({ lat: BRANCH[0], lng: BRANCH[1], unit: UNIT }, deps(n)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.utility.key, 'jcpl'); eq(r.circuits[0].storageKw, 703);
    ok(r.territory.candidates.every(function (c) { return !c.weak && c.fromState; }), 'both are on the state\'s own layer');
    eq(r.territory.confident, false, 'Sussex REC has no map, so JCP&L\'s answer cannot prove the point is not the co-op\'s');
    ok(/The territory maps also name Sussex Rural Electric Cooperative here; confirm the utility with a bill/.test(r.note), r.note);
  });
});
/* … and confident when the rival's own map was asked and came back empty
   (an overlap of JCP&L and PSE&G: PSE&G's three widths say nothing is there) */
tests.push(function () {
  var P = [40.52, -74.41];
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['9726', 'JERSEY CENTRAL POWER & LIGHT CO', 'INVESTOR OWNED', 'OH', 1100000, 8e9], ['15477', 'PUBLIC SERVICE ELECTRIC & GAS CO', 'INVESTOR OWNED', 'NJ', 2300000, 1e10]])],
    [/tigerweb/, Places(['Edison'])], [/mapsdep\.nj\.gov/, Njdep([[8, 'Jersey Central Power & Light', 'JCP&L'], [40, 'Public Service Electric & Gas', 'PSE&G']])],
    [JCPL_SOLAR, { features: [F({ RemainNum: 703, Remaining: '703 kW AC' }, pt(P[0], P[1], 40))] }], [JCPL_EV, { features: [F({ remainnum: 2017, remaining: '2017' }, pt(P[0], P[1], 40))] }]]);
  return H.run({ lat: P[0], lng: P[1], unit: UNIT }, deps(n)).then(function (r) {
    eq(r.utility.key, 'jcpl'); ok(r.tried.some(function (t) { return t.source === 'pseg' && t.outcome === 'empty'; }));
    eq(r.territory.confident, true, 'every rival\'s own map was asked and is empty'); ok(!/also name/.test(r.note));
  });
});
/* hosting:3 — at the door: Glassboro NJ0748 restricted to 50 kW with 2,448 kW pending is 50 kW, never 0 */
var GLASS = [39.7029, -75.1118];
function aceNet(cap) {
  return net([[/Electricity_Rates_H3_Res5/, Esri([['963', 'ATLANTIC CITY ELECTRIC CO', 'INVESTOR OWNED', 'NJ', 573000, 1e10]])], [/tigerweb/, Places(['Glassboro'])],
    [/mapsdep\.nj\.gov/, Njdep([[7, 'Atlantic City Electric', 'ACE', 'LDC']])],
    [/PHI_Restrictions_Public\/FeatureServer\/0\/query/, cap],
    [/PHI_Hosting_Capacity(10_2_2026|_Public)\/FeatureServer\/[45]\/query/, { features: [F({ FeederID: 'NJ0748', Substation: 'Glassboro', Allowable_PV_kW: 3353.45, Transformer_Large_Gen_HC: 18904.41, Total_Pending_Gen_kW: 2448.07 }, line(GLASS[0], GLASS[1], 7))] }],
    [/PHI_EV_Load_Serving_Capacity/, { features: [F({ FEEDERID: 'NJ0748', Capacity_MW: 5.86 }, line(GLASS[0], GLASS[1], 7))] }]]);
}
tests.push(function () {
  var n = aceNet({ features: [F({ FEEDERID: 'NJ0748', Restriction_kW: 50, Restriction_Category: 'C' }, line(GLASS[0], GLASS[1], 7))] });
  return H.run({ lat: GLASS[0], lng: GLASS[1], unit: { kw: 50, kwh: 100, name: '50 kW' } }, deps(n)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.circuits[0].publishedKw, 50); eq(r.circuits[0].queuedKw, 2448); eq(r.verdict.circuit.netKw, 50, 'min(3,353 − 2,448, 50) = 50');
    eq(r.verdict.verdict.key, 'fits'); ok(/restricted to 50 kW of new DER/.test(JSON.stringify(r.circuits[0].notes)));
  });
});
/* hosting:4 (c) — the restriction layer down: ACE's figure is never judged without it, and nothing is kept */
tests.push(function () {
  var db = fakeDb(), n = aceNet(err('error'));
  return H.run({ lat: GLASS[0], lng: GLASS[1], unit: { kw: 500, kwh: 1000, name: '500 kW' } }, deps(n, db)).then(function (r) {
    eq(r.coverage, 'unreachable', 'without its restriction ACE would read 905 kW and "Fits" where it allows 50'); ok(r.verdict.verdict.key !== 'fits');
    ok(r.tried.some(function (t) { return t.source === 'ace:fallback'; }), 'the older publication is asked, and needs the restriction too');
    ok(!db.writes.some(function (w) { return /\/ace__/.test(w); }), 'never kept');
  });
});
/* hosting:4 (a) — a search the time budget cut short is a timeout, never an
   "empty" kept for a day (Norwalk: the legacy EV layer takes 15 s) */
tests.push(function () {
  var db = fakeDb();
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['4176', 'CONNECTICUT LIGHT & POWER CO', 'INVESTOR OWNED', 'CT', 1290878, 2.3e10]])], [/tigerweb/, Places(['Norwalk'])],
    [/eversource-ct\.envelio\.com/, { __noContent: true }], [/EV_HC_Capacity_CT\/MapServer\/0\/query/, function () { clock += H.SOURCE_MS; return err('timeout'); }]]);
  return H.run({ lat: 41.0979, lng: -73.4204, unit: UNIT }, deps(n, db)).then(function (r) {
    ok(r.tried.some(function (t) { return t.source === 'eversource-ct:fallback' && t.outcome === 'timeout'; }), 'out of time before 150 m and 400 m were asked: a timeout');
    eq(n.calls.filter(function (c) { return /DG_Hosting_CT_Final/.test(c.url); }).length, 1, 'the wider radii were never asked');
    eq(r.coverage, 'unreachable'); ok(/timed out/.test(r.note), r.note); ok(!/no circuit within/.test(r.note), 'never "nothing here"');
    ok(!db.writes.some(function (w) { return /eversource-ct__/.test(w); }), 'a timed-out legacy layer is never kept');
  });
});
/* hosting:4 (b) — one side's layer failed: the answer is read, said to be partial, and never kept */
tests.push(function () {
  var db = fakeDb(), P = [41.7637, -72.6851];
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['4176', 'CONNECTICUT LIGHT & POWER CO', 'INVESTOR OWNED', 'CT', 1290878, 2.3e10]])], [/tigerweb/, Places(['Hartford'])],
    [/eversource-ct\.envelio\.com/, { __noContent: true }],
    [/DG_Hosting_CT_Final\/MapServer\/0\/query/, { features: [F({ CIRCUITID: '147', BULK_SUB_NAME: 'SOUTH_MEADOW_1A', SECTION_OPERATING_VOLTAGE: 22.8, HOSTING_CAPACITY_MW: 1.6, IN_QUEUE_DG_KW: 52 }, line(P[0], P[1], 20))] }],
    [/EV_HC_Capacity_CT\/MapServer\/0\/query/, err('error')]]);
  return H.run({ lat: P[0], lng: P[1], unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.circuits[0].basis, 'gen'); eq(r.circuits[0].publishedKw, 1600);
    ok(/its charging side did not, so ask again for the storage figure/.test(r.note), r.note); ok(!/the charging side is not published\./.test(r.note), 'a side that did not answer is never "not published"');
    ok(r.tried.some(function (t) { return t.source === 'eversource-ct:fallback' && /\(partial\)$/.test(t.outcome); }));
    ok(!db.writes.some(function (w) { return /eversource-ct__/.test(w); }), 'a partial reading is never kept');
  });
});
/* hosting:4 (d) — a season that did not answer: the navigator's figure is the smallest of fewer seasons, so it is partial and never kept */
tests.push(function () {
  var db = fakeDb(), P = [41.3948, -73.454];
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['4176', 'CONNECTICUT LIGHT & POWER CO', 'INVESTOR OWNED', 'CT', 1290878, 2.3e10]])], [/tigerweb/, Places(['Danbury'])],
    [/parcels\/from_lat_lng/, { data: { parcel_id: 77, name: 'P77' } }],
    [/parcel_sidebar_general_tab\/77\/\?behavior=load&voltage_level=3&category=WINTER/, err('error')],
    [/parcel_sidebar_general_tab\/77\/\?behavior=gen/, side('gen', 'X', 800)], [/parcel_sidebar_general_tab\/77\/\?behavior=load/, side('load', 'X', 200)]]);
  return H.run({ lat: P[0], lng: P[1], unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.coverage, 'read'); eq(r.circuits[0].storageKw, 200); ok(r.tried.some(function (t) { return t.source === 'eversource-ct' && t.outcome === 'features 1 (partial)'; }), JSON.stringify(r.tried));
    ok(/Part of its map did not answer, so this reading may be incomplete and is not kept/.test(r.note), r.note);
    ok(!db.writes.some(function (w) { return /eversource-ct__/.test(w); }), 'never kept');
  });
});
/* hosting:7 — once the budget is (all but) spent no further navigator batch
   is sent: the first four seasons leave 100 ms, and the next four are not
   sent with it (nor with nothing, which within() refuses on its own) */
tests.push(function () {
  var db = fakeDb(), P = [41.3948, -73.454];
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['4176', 'CONNECTICUT LIGHT & POWER CO', 'INVESTOR OWNED', 'CT', 1290878, 2.3e10]])], [/tigerweb/, Places(['Danbury'])],
    [/parcels\/from_lat_lng/, { data: { parcel_id: 77 } }],
    [/parcel_sidebar_general_tab/, function (u) { clock += (H.SOURCE_MS - 100) / 4; return /behavior=gen/.test(u) ? side('gen', 'X', 800) : side('load', 'X', 200); }]]);
  return H.run({ lat: P[0], lng: P[1], unit: UNIT }, deps(n, db)).then(function (r) {
    eq(n.calls.filter(function (c) { return /parcel_sidebar_general_tab/.test(c.url); }).length, 4, 'the first four seasons used the budget; the next four are never sent');
    eq(r.circuits[0].basis, 'gen'); ok(/its charging side did not/.test(r.note), r.note);
    ok(!db.writes.some(function (w) { return /eversource-ct__/.test(w); }), 'a reading the budget cut short is never kept');
  });
});
/* hosting:4 (e) — an older copy read because the current map FAILED is kept an hour, not a week */
tests.push(function () {
  var db = fakeDb();
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['17609', 'SOUTHERN CALIFORNIA EDISON CO', 'INVESTOR OWNED', 'CA', 5e6, 1e11]])], [/tigerweb/, Places(['Irvine'])],
    [/ElectricLoadServingEntities_IOU_POU/, { features: [{ attributes: { Utility: 'Southern California Edison', Acronym: 'SCE', Type: 'IOU', HIFLD_ID: '17609' } }] }],
    [/drpep\.sce\.com/, err('blocked')],
    [/z6hI6KRjKHvhNO0r\/arcgis\/rest\/services\/ICA_Layer\/FeatureServer\/2\/query/, { features: [F({ circuit_name: 'Bardeen', uniform_generation: 3.334, ica_overall_load: '5.09', changed_date: '08/08/2025' }, line(33.6846, -117.8265, 20))] }]]);
  return H.run({ lat: 33.6846, lng: -117.8265, unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.coverage, 'read'); var d = db.docs[H.CACHE + '/' + H.cacheId('sce', 33.6846, -117.8265)];
    ok(d && d.expiresAt === clock + H.STALE_TTL_MS && H.STALE_TTL_MS === 3600000, 'kept an hour, so SCE\'s own map is read again soon');
  });
});
/* hosting:4 (f) — the state's own territory layer did not answer: the answer stands on the rest, is said so, and is never kept */
tests.push(function () {
  var db = fakeDb();
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['963', 'ATLANTIC CITY ELECTRIC CO', 'INVESTOR OWNED', 'NJ', 573000, 1e10]])], [/tigerweb/, Places(['Glassboro'])], [/mapsdep\.nj\.gov/, err('timeout')]]);
  return H.run({ lat: GLASS[0], lng: GLASS[1], unit: UNIT }, deps(n, db)).then(function (r) {
    eq(r.territory.partial, true); ok(!db.writes.some(function (w) { return /_territory__/.test(w); }), 'a territory missing the state\'s authority is never kept');
    ok(/The state's own territory layer did not answer/.test(r.note), r.note); eq(r.utility.key, 'ace');
    return UT.at(GLASS[0], GLASS[1], { fetchJson: n.fetchJson }).then(function (t) { eq(t.partial, true); deq(t.failed, ['njdep-territories']); });
  }).then(function () {
    var m = net([[/Electricity_Rates_H3_Res5/, Esri([['963', 'ATLANTIC CITY ELECTRIC CO', 'INVESTOR OWNED', 'NJ', 573000, 1e10]])], [/tigerweb/, err('error')], [/mapsdep\.nj\.gov/, Njdep([[7, 'Atlantic City Electric', 'ACE']])]]);
    return UT.at(GLASS[0], GLASS[1], { fetchJson: m.fetchJson }).then(function (t) { eq(t.partial, true, 'Census places failing is partial too'); deq(t.failed, ['census-places']); });
  }).then(function () {
    var k = net([[/Electricity_Rates_H3_Res5/, Esri([['963', 'ATLANTIC CITY ELECTRIC CO', 'INVESTOR OWNED', 'NJ', 573000, 1e10]])], [/tigerweb/, Places(['Glassboro'])], [/mapsdep\.nj\.gov/, Njdep([[7, 'Atlantic City Electric', 'ACE']])]]);
    return UT.at(GLASS[0], GLASS[1], { fetchJson: k.fetchJson }).then(function (t) { eq(t.partial, false); deq(t.failed, []); });
  });
});
/* hosting:5 — Felton, Delaware (inside New Jersey's padded box): Delaware Electric Cooperative is named by its own name, never as Sussex REC */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['5070', 'DELAWARE ELECTRIC COOPERATIVE', 'COOPERATIVE', 'DE', 106000, 8.5e9], ['5027', 'DELMARVA POWER', 'INVESTOR OWNED', 'DE', 540000, 2.4e10]])],
    [/tigerweb/, Places(['Felton'])], [/mapsdep\.nj\.gov/, { features: [] }]]);
  return H.run({ lat: 39.008, lng: -75.578, unit: UNIT }, deps(n)).then(function (r) {
    eq(r.utility.display, 'Delaware Electric Cooperative'); eq(r.utility.key, null); eq(r.coverage, 'not-wired'); eq(r.verify.viewerUrl, HS.DOE_ATLAS);
    eq(r.territory.candidates[0].registryKey, null); eq(r.territory.candidates[0].state, 'DE');
    ok(!/Sussex|sussexrec|34\.5 kV/i.test(JSON.stringify(r)), 'never Sussex REC, its note or its link');
  });
});
/* hosting:7 — at the door: a request with no budget left is never sent (ACE's
   dated service says "moved" only once the whole budget is gone: its web map
   is not asked with nothing left) */
tests.push(function () {
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['963', 'ATLANTIC CITY ELECTRIC CO', 'INVESTOR OWNED', 'NJ', 573000, 1e10]])], [/tigerweb/, Places(['Glassboro'])],
    [/mapsdep\.nj\.gov/, Njdep([[7, 'Atlantic City Electric', 'ACE', 'LDC']])],
    [/PHI_Hosting_Capacity10_2_2026/, function () { clock += H.SOURCE_MS; return { error: { code: 400, message: 'Invalid URL' } }; }]]);
  return H.run({ lat: GLASS[0], lng: GLASS[1], unit: UNIT }, deps(n)).then(function (r) {
    ok(!n.calls.some(function (c) { return /sharing\/rest\/content\/items/.test(c.url); }), 'no request is sent with no time left');
    eq(r.utility.key, 'ace');
  });
});
/* hosting:7 — the transport: no time left is no request (never the 8 s default); a little is at least 250 ms */
tests.push(function () {
  var real = global.fetch, sent = 0;
  global.fetch = function (u, o) { sent++; return new Promise(function (res, rej) { o.signal.addEventListener('abort', function () { var e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); }); };
  var t0 = Date.now();
  return H.liveFetchJson('https://x.test/none', { timeoutMs: 0 }).then(function () { throw new Error('should refuse'); }, function (e) {
    eq(sent, 0, 'a request with no budget left is never sent'); eq(e.timeout, true); ok(Date.now() - t0 < 200, 'and nothing waits 8 s');
    var t1 = Date.now();
    return H.liveFetchJson('https://x.test/little', { timeoutMs: 1 }).then(function () { throw new Error('should abort'); }, function (e2) {
      var waited = Date.now() - t1;
      eq(sent, 1); eq(e2.name, 'AbortError'); ok(waited >= 240 && waited < 2000, 'a little time left is at least 250 ms, never 8 s: ' + waited + ' ms');
    });
  }).then(function () {
    var asked = [];
    return UT.at(GLASS[0], GLASS[1], { fetchJson: function (u, o) { asked.push(o.timeoutMs); return Promise.resolve({ features: [] }); }, timeoutMs: 0 }).then(function () {
      ok(asked.length && asked.every(function (ms) { return ms === 0; }), 'the territory never turns timeoutMs 0 into 8 s');
    });
  }).then(function () { global.fetch = real; }, function (e) { global.fetch = real; throw e; });
});

/* ── the door's gate (the same regexes tgridverdict holds for /api/grid-verdict) ── */
var door = read('api/hosting-capacity.js');
ok(/req\.method !== 'POST' && req\.method !== 'GET'/.test(door)); ok(/A\.authenticate\(req\)/.test(door)); ok(/caller\.orgId \|\| caller\.staff/.test(door));
ok(/withCaller\(caller, MODULES, \{ produce: false \}\)/.test(door)); ok(/\['gridatlas', 'siteintel', 'sitefinder', 'compute'\]/.test(door), 'the set /api/grid-atlas asks');
ok(/rateLimit\('hosting:'/.test(door)); ok(/'Cache-Control', 'no-store'/.test(door)); ok(/GV\.judge\(/.test(door), 'the one engine, in-process');
ok(door.indexOf('SMALLEST_OFFER_KW') < 0 && door.indexOf('THIN_SHARE') < 0, 'no verdict rule copied into the door');
ok(door.indexOf('usrsvcs') < 0 && door.indexOf('ComEd_BESS') < 0, 'no ComEd URL pasted in the door');
/* the transport: a bot wall's HTML is `blocked` with no body kept; a 204 is no content; a bad status names only the status */
tests.push(function () {
  var real = global.fetch, answers = [
    { status: 200, ok: true, text: function () { return Promise.resolve('<html><script>incapsula secret-token</script></html>'); } },
    { status: 204, ok: true, text: function () { return Promise.resolve(''); } },
    { status: 502, ok: false, text: function () { return Promise.resolve('{"message":"upstream secret"}'); } }];
  global.fetch = function () { return Promise.resolve(answers.shift()); };
  return H.liveFetchJson('https://x.test/a', { timeoutMs: 1000 }).then(function () { throw new Error('should refuse'); }, function (e) {
    eq(e.blocked, true); ok(String(e.message + JSON.stringify(e)).indexOf('secret') < 0, 'nothing of the body is kept');
    return H.liveFetchJson('https://x.test/b', { timeoutMs: 1000 });
  }).then(function (j) {
    deq(j, { __noContent: true });
    return H.liveFetchJson('https://x.test/c', { timeoutMs: 1000 }).then(function () { throw new Error('should refuse'); }, function (e) {
      eq(e.status, 502); ok(String(e.message + JSON.stringify(e)).indexOf('secret') < 0);
    });
  }).then(function () { global.fetch = real; }, function (e) { global.fetch = real; throw e; });
});
eq(H.MODULES.join(','), 'gridatlas,siteintel,sitefinder,compute'); eq(H.TOTAL_MS, 20000); eq(H.SOURCE_MS, 8000);

/* ── the browser client, in a VM ────────────────────────────────────── */
tests.push(function () {
  var posted = [];
  var ctx = { console: console, Promise: Promise, JSON: JSON, Date: Date,
    firebase: { auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('tok'); } } }; } },
    fetch: function (url, opts) { posted.push({ url: url, opts: opts }); return Promise.resolve({ ok: true, json: function () { return Promise.resolve(RESP); } }); } };
  ctx.window = ctx; vm.createContext(ctx);
  var RESP = null;
  vm.runInContext(read('omega-grid-verdict.js'), ctx, { filename: 'omega-grid-verdict.js' });
  var n = net([[/Electricity_Rates_H3_Res5/, Esri([['4110', 'COMMONWEALTH EDISON CO', 'INVESTOR OWNED', 'IL', 4e6, 6e10]])], [/tigerweb/, Places(['Rockford'])], [new RegExp('^' + comedEsc), COMED]]);
  return H.run({ lat: 42.2711, lng: -89.094, unit: UNIT, substation: { name: 'TSS165', kv: 138, km: 2 } }, deps(n)).then(function (r) {
    RESP = JSON.parse(JSON.stringify(r));
    return ctx.OmegaGridVerdict.hosting({ lat: 42.2711, lng: -89.094, unit: UNIT });
  }).then(function (a) {
    eq(posted[0].url, '/api/hosting-capacity'); eq(posted[0].opts.method, 'POST'); eq(posted[0].opts.headers.Authorization, 'Bearer tok');
    deq(JSON.parse(posted[0].opts.body), { lat: 42.2711, lng: -89.094, unit: UNIT });
    var g = ctx.OmegaGridVerdict.fromHosting(a, 'T');
    deq(Object.keys(g).sort(), ['circuit', 'substation', 'verdict'], 'the same record fields() makes');
    deq(Object.keys(g.substation).sort(), ['chip', 'km', 'kv', 'miles', 'name', 'source', 'state']);
    eq(g.circuit.utility, 'ComEd'); eq(g.circuit.id, 'R6514'); eq(g.circuit.netKw, 420); eq(g.circuit.basis, 'storage'); eq(g.circuit.coverage, 'read'); eq(g.circuit.eiaId, '4110');
    ok(/^ComEd's published hosting capacity · ComEd_BESS_Hosting_Capacity_[A-Z]{3}20\d\d layer 75 · refreshed 2026-08-31$/.test(g.circuit.source), 'the source named from the answer');
    eq(g.verdict.key, 'fits'); eq(g.verdict.at, 'T'); eq(g.circuit.at, 'T');
    var s = ctx.OmegaGridVerdict.hostingSummary(a, 'T');
    eq(s.utility.key, 'comed'); eq(s.coverage, 'read'); eq(s.circuit.id, 'R6514'); eq(s.verify.viewerUrl, CS.REFERER); ok(s.note);
    ok(JSON.stringify(s).indexOf('undefined') < 0 && (function walk(o) { for (var k in o) { if (o[k] === undefined) return false; if (o[k] && typeof o[k] === 'object' && !walk(o[k])) return false; } return true; })(s), 'nothing undefined for Firestore');
    eq(ctx.OmegaGridVerdict.fromHosting(null), null);
    var none = ctx.OmegaGridVerdict.fromHosting({ coverage: 'no-public-map', utility: { key: 'aps', display: 'Arizona Public Service' }, verdict: GV.judge({ unit: UNIT }), circuits: [], best: null }, 'T');
    eq(none.circuit, null, 'no circuit, none recorded'); eq(none.verdict.key, 'study');
    return ctx.OmegaGridVerdict.coverage();
  }).then(function () {
    eq(posted[1].url, '/api/hosting-capacity?coverage=1'); eq(posted[1].opts.method, 'GET');
    var client = read('omega-grid-verdict.js');
    ['SMALLEST_OFFER_KW', 'THIN_SHARE', 'maxKm', 'minKv'].forEach(function (t) { ok(client.indexOf(t) < 0, 'no rule in the browser client: ' + t); });
    /* a utility's field is never READ in the browser: the server maps it.
       main's provenance sentence (circuitSourceLine) may name ComEd's
       BESS_HC and Feeder_Q in words, never as a key or a property */
    ['Allowable_PV_kW', 'BESS_HC', 'MAXGENMW_TXT', 'Feeder_Q'].forEach(function (t) {
      ok(!new RegExp('[.\\[]\\s*[\'"]?' + t + '\\b|[\'"]' + t + '[\'"]\\s*[\\]:]|\\b' + t + '\\s*:').test(client), 'no field read in the browser client: ' + t);
    });
    var probe = 'var a = x.BESS_HC; b = y["Feeder_Q"]; c = { MAXGENMW_TXT: 1 };';
    ok(['BESS_HC', 'Feeder_Q', 'MAXGENMW_TXT'].every(function (t) { return new RegExp('[.\\[]\\s*[\'"]?' + t + '\\b|[\'"]' + t + '[\'"]\\s*[\\]:]|\\b' + t + '\\s*:').test(probe); }), 'and the check catches a read, a quoted key and an object key');
  });
});

/* run in order */
tests.reduce(function (p, t) { return p.then(t); }, Promise.resolve()).then(function () {
  console.log('thostingsources: ' + count + ' assertions passed');
}).catch(function (e) { console.error(e); process.exit(1); });
