/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Grid Atlas is one layer on the Site Plan map. It is off until asked.
 * The page does not carry a service URL, and it does not judge a circuit.
 * 2026-10-17: the circuit is one question to the national door Omega Prime
 * and Site Map's Grid panel ask (POST /api/hosting-capacity through
 * omega-grid-verdict.js GV.hosting). The layer routes nothing by state; the
 * VM at the end runs the real layer, the real client and the REAL door's
 * run() on a fake network: ComEd reads its sentence byte for byte, Mesa AZ
 * names the City of Mesa beside Salt River Project, Springfield IL (outside
 * ComEd, never asked before) names CWLP, and a door that fails says so.
 * 2026-10-20: who may serve the point is the one list Omega Prime's Circuit
 * step draws (GV.whoServes), a card line each: downtown Mesa lists the City
 * of Mesa with the city's service-area map and folds Salt River Project and
 * APS away with the reason; the city's map down lists all three with their
 * routes and pages. Each is held to Prime's own candidatesBlock on the same
 * answer: the same words, in the same order, with the same links.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');

require(path.join(ROOT, 'omega-editor-v2-geom.js'));
require(path.join(ROOT, 'omega-grid-layers.js'));
/* the client attaches to its module here, not to global: hand it over */
global.OmegaGridVerdict = require(path.join(ROOT, 'omega-grid-verdict.js')).OmegaGridVerdict;
require(path.join(ROOT, 'omega-editor-v2-grid.js'));
require(path.join(ROOT, 'omega-editor-v2-doc.js'));
require(path.join(ROOT, 'omega-editor-v2-design.js'));

var Grid = global.OmegaEditorV2Grid;
var GL = global.OmegaGridLayers;
var Design = global.OmegaEditorV2Design;
var D = global.OmegaEditorV2Doc;
var Judge = require(path.join(ROOT, 'api/_lib/grid-verdict.js'));

var n = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  n++;
}

check(Grid.enabled() === false, 'the layer is off until it is switched on');
check(Grid.COLORS.distribution === '#1F4E79', 'distribution is the map blue');
check(Grid.COLORS.transmission === '#e0533d', 'transmission is the atlas red');
check(Grid.COLORS.substation === '#c98a2b', 'a substation is the atlas gold');

var anchor = { lat: 33.306, lng: -112.074 };
var subs = { features: [{ attributes: { NAME: 'Test Sub', MAX_VOLT: 69, OWNER: 'Utility Co' }, geometry: { x: -112.07, y: 33.31 } }] };
var lines = { features: [
  { attributes: { VOLTAGE: 12, OWNER: 'Dist Co', ID: 'D1' }, geometry: { paths: [[[-112.074, 33.306], [-112.07, 33.308]]] } },
  { attributes: { VOLTAGE: 230, OWNER: 'Tx Co', ID: 'T1' }, geometry: { paths: [[[-112.08, 33.3], [-112.06, 33.31]]] } },
  { attributes: { OWNER: 'Blank Co', ID: 'U1' }, geometry: { paths: [[[-112.074, 33.306], [-112.073, 33.307]]] } }
] };
var scene = Grid.sceneFrom(subs, lines, anchor);
check(scene.feeding && scene.feeding.name === 'Test Sub' && scene.feeding.feeding === true, 'the nearest substation is the feeding one');
check(scene.feeding.kv === 69 && scene.feeding.x != null, 'the feeding substation keeps its published voltage and a map point');
var kinds = {};
scene.lines.forEach(function (line) { kinds[line.kind] = line; });
check(kinds.distribution && kinds.distribution.kv === 12, 'a published voltage under 69 kV is distribution');
check(kinds.transmission && kinds.transmission.kv === 230, '69 kV and above is transmission');
check(kinds.line && kinds.line.kv == null && kinds.line.kind === 'line' && kinds.line.name === 'Blank Co', 'a blank voltage stays a line and keeps its owner');
check(kinds.line.name.indexOf('Transmission') < 0, 'a blank voltage is not labeled transmission');
check(Grid.colorOf('distribution') === '#1F4E79' && Grid.colorOf('transmission') === '#e0533d', 'the map uses those colors');

var hitSub = Grid.hit(scene, { x: scene.feeding.x, y: scene.feeding.y }, 8);
check(hitSub && hitSub.feature === 'substation' && hitSub.name === 'Test Sub', 'a click on a substation hits it');
check(Grid.hit(scene, { x: scene.feeding.x + 40, y: scene.feeding.y + 40 }, 8) !== hitSub, 'a click away from the substation is not that substation');
var dist = kinds.distribution;
var mid = { x: (dist.paths[0][0].x + dist.paths[0][1].x) / 2, y: (dist.paths[0][0].y + dist.paths[0][1].y) / 2 };
var hitLine = Grid.hit(scene, mid, 15);
check(hitLine && hitLine.feature === 'line' && hitLine.kind === 'distribution', 'a click on a line hits that line');
var detail = Grid.featureLines(hitLine);
check(detail[0].text.indexOf('Distribution') >= 0 && detail[0].text.indexOf('12 kV') >= 0, 'the line detail says distribution and the published voltage');
check(Grid.featureLines(kinds.line)[0].text.indexOf('voltage not published') >= 0, 'a line with no voltage says so');

/* the door decides whose wire it is, in every state: the layer routes nothing */
check(Grid.routeOf === undefined && Grid.stateOf === undefined && Grid.verdictBody === undefined, 'the layer does not route by state');
var body = Grid.hostingBody(anchor, Grid.unitOf({ bessKw: 500, bessKwh: 1000 }), null);
check(body.lat === 33.306 && body.lng === -112.074 && body.mode === 'storage', 'the door is asked at the site point, for a battery');
check(body.unit.kw === 500 && body.unit.kwh === 1000 && body.substation === null, 'with the battery on the drawing, and no substation invented');
var bare = Grid.hostingBody(anchor, Grid.unitOf({}), scene.feeding);
check(bare.unit === null && bare.substation.name === 'Test Sub' && bare.substation.kv === 69, 'no battery sends no unit; the feeding substation rides along');
var judged = Judge.judge({ unit: body.unit, substation: null, circuit: null });
check(judged.verdict.label === 'Needs a study' && judged.circuit.reason === 'no-circuit', 'the server calls a missing circuit a study');
/* the door's shape, for a utility that publishes nothing (Phoenix: APS) */
function answerOf(o) {
  return Object.assign({ version: 'hosting-v1', mode: 'storage', territory: { confident: true, candidates: [], source: 'a test territory layer' },
    source: null, circuits: [], best: null, verify: null, tried: [] }, o);
}
var applied = Grid.applyAnswer(answerOf({ coverage: 'no-public-map', utility: { key: 'aps', display: 'Arizona Public Service', eiaId: '803' },
  verdict: judged, note: 'APS publishes no hosting capacity.', verify: { viewerUrl: 'https://www.aps.com/dg', label: 'Arizona Public Service\'s interconnection page' } }));
check(applied.verdict.label === 'Needs a study', 'the page shows the server verdict');
check(applied.circuit === null && applied.coverage === 'no-public-map', 'no circuit, none recorded');
check(applied.sourceLine.indexOf('No hosting map') >= 0 && applied.sourceLine.indexOf('ComEd') < 0, 'a site outside ComEd does not claim the ComEd map');
var shown = Grid.summaryLines(scene, applied, '');
var blob = shown.map(function (row) { return row.text; }).join('\n');
check(blob.indexOf('Needs a study') >= 0 && blob.indexOf('Test Sub') >= 0, 'the card names the feeding substation and the verdict');
check(blob.indexOf('kW net') < 0, 'a study with no circuit does not invent a hosting figure');
check(blob.indexOf('Serving utility: Arizona Public Service · publishes no hosting capacity') >= 0, 'the card names the utility the server named, in Prime\'s words');
check(blob.indexOf('APS publishes no hosting capacity.') >= 0, 'and says why in the server\'s words');
check(shown.some(function (r) { return r.href === 'https://www.aps.com/dg' && /^Check it on Arizona Public Service's interconnection page$/.test(r.text); }), 'and links the utility\'s own page');
check(!shown.some(function (r) { return r.href && !/^https:\/\//.test(r.href); }), 'only an https link');
/* the queue and side words follow the answer */
function readOf(c) {
  var b = Object.assign({ utility: 'Eastfield Electric', id: 'EF-12', substation: 'Eastfield North', addressResolved: true, grain: 'the nearest line section', mode: 'storage' }, c);
  return Grid.applyAnswer(answerOf({ coverage: 'read', utility: { key: 'eastfield', display: 'Eastfield Electric', eiaId: '99001' },
    source: { key: 'eastfield', label: 'Eastfield Electric\'s published hosting capacity', layer: 'EF layer 0', refreshed: '2026-10-01', addressResolved: true },
    circuits: [Object.assign({ name: '', kv: 13.2, upstream: { bankKw: 9800 }, distanceM: 14, notes: [] }, b)], best: 0,
    verdict: Judge.judge({ unit: body.unit, circuit: b }), note: 'Eastfield Electric publishes hosting capacity.' }));
}
function cardText(rec) { return Grid.summaryLines(scene, rec, '').map(function (r) { return r.text; }).join('\n'); }
var t1 = cardText(readOf({ publishedKw: 5000, queuedKw: null }));
check(t1.indexOf('Circuit EF-12 · 5,000 kW published · no queue published with this figure · 5,000 kW as published') >= 0, 'an unpublished queue is said, never 0');
check(t1.indexOf('0 kW queued') < 0 && t1.indexOf('net of the queue') < 0, 'and nothing is netted');
var t2 = cardText(readOf({ publishedKw: 4875, queuedKw: 125, queueNetted: true }));
check(t2.indexOf('4,875 kW published · 125 kW queued, already in the figure · 4,875 kW net of the queue') >= 0, 'a netted queue is shown, not subtracted twice');
var t3 = cardText(readOf({ publishedKw: 7000, queuedKw: 0, basis: 'gen' }));
check(t3.indexOf('7,000 kW published (generation only)') >= 0 && /not a storage figure/.test(t3), 'a generation-only figure says so, with the server\'s caveat');
var t4 = cardText(readOf({ publishedKw: null, queuedKw: null, basis: 'load', band: { minKw: 7500, maxKw: null, text: '7.5 MW or more' } }));
check(t4.indexOf('published as 7.5 MW or more (load only), judged at its low end') >= 0, 'a band is judged at its low end');
check(/Where the power comes from: substation Eastfield North · 13\.2 kV · upstream bank 9,800 kW · 14 m from the point\./.test(t1), 'where the power comes from');
check(/^Source: Eastfield Electric's published hosting capacity · EF layer 0 · refreshed 2026-10-01, resolved at the parcel\./m.test(t1), 'the source, in the answer\'s words');

var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
var app = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-app.js'), 'utf8');
var self = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-grid.js'), 'utf8');
check(page.indexOf('omega-grid-layers.js') >= 0 && page.indexOf('omega-editor-v2-grid.js') >= 0, 'the page loads the shared layer list and this layer');
check(page.indexOf('id="grid-detail"') >= 0, 'a click has a detail card');
check(app.indexOf('id = \'layer-grid-atlas\'') >= 0 || app.indexOf('id="layer-grid-atlas"') >= 0, 'the layers list has one Grid Atlas row');
check(self.indexOf('arcgis.com') < 0 && self.indexOf('geoplatform.gov') < 0, 'the editor layer does not carry a service URL');
check(page.indexOf('arcgis.com') < 0 && app.indexOf('arcgis.com') < 0, 'the page does not carry a service URL');
check(self.indexOf('judge(') < 0, 'the page does not judge a circuit');
check(/GV\.hosting\(body\)/.test(self) && self.indexOf("fetch('/api/hosting-capacity'") < 0 && self.indexOf('function token()') < 0, 'the circuit is one question through the shared client, which holds the session');
check(self.indexOf('probePoint') < 0 && self.indexOf('OmegaComEdLayers') < 0 && self.indexOf('circuitSourceLine') < 0, 'the ComEd-only probe and its sentence are gone from the layer');
check(page.indexOf('omega-comed-layers.js') < 0, 'Site Plan no longer loads the ComEd-only module');
check(app.indexOf('row.href') >= 0 && /\^https:/.test(app.slice(app.indexOf('row.href') - 40, app.indexOf('row.href') + 120)), 'the card draws a link only for https');
check(/rec\.who = GV\.whoServes \? GV\.whoServes\(res\) : null;/.test(self) && self.indexOf('rec.candidates') < 0, 'who serves the point is the one list (GV.whoServes), not the layer\'s own');
check(/if \(row\.fold\) \{/.test(app) && app.indexOf('createElement(\'details\')') >= 0 && app.indexOf('createElement(\'summary\')') >= 0, 'the card folds what the list folds');
check(/row\.bold && String\(row\.text\)\.indexOf\(row\.bold\) === 0/.test(app), 'a utility\'s name is bold, the rest of its line is not');

var blank = GL.lineOf({ attributes: { OWNER: '' }, geometry: { paths: [[[-112.07, 33.306], [-112.06, 33.31]]] } });
check(blank.kind === 'line' && blank.name === 'Line', 'the shared reader leaves a blank voltage unlabeled');

var doc = D.create({ name: 'Sample', anchor: anchor, address: 'Sample parcel' });
var model = Design.fromDoc(doc);
var row = null, i;
for (i = 0; i < model.parity.length; i++) if (model.parity[i].id === 'grid-atlas') row = model.parity[i];
check(row && row.status === 'gap', 'Grid Atlas is a gap on the drawing: it is a layer, not a sheet fact');
check(JSON.stringify(model).indexOf('480') < 0, 'the parity note does not invent a voltage');

var editor = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
check(editor.indexOf('omega-editor-v2-grid') < 0, 'Site Map does not load this layer');


/* ── the whole path in a VM ─────────────────────────────────────────── */
/* The real layer, the real client and the REAL national door's run() on a
   fake network (the public layers, the territory layers and the utility's
   own map are the only things faked). firebase-admin is intercepted at load,
   as thostingsources.js and tgridverdict.js do: CI runs this with no npm
   install, and the door never reaches Firestore here (db is null). */
var vm = require('vm');
var H = (function () {
  var Module = require('module'), load = Module._load;
  function noFirebase() { throw new Error('firebase-admin is a stand-in in this test'); }
  var FAKE_ADMIN = { apps: [], initializeApp: noFirebase, credential: { cert: noFirebase }, firestore: noFirebase, auth: noFirebase };
  Module._load = function (request) { return request === 'firebase-admin' ? FAKE_ADMIN : load.apply(this, arguments); };
  try { return require(path.join(ROOT, 'api/hosting-capacity'))._helpers; } finally { Module._load = load; }
})();
var CS = require(path.join(ROOT, 'api/_lib/comed-service'));
function Esri(rows) { return { features: rows.map(function (r) { return { attributes: { NAME: r[1], Utility_ID: r[0], TYPE: r[2], STATE: r[3] || '', HOLDING_CO: r[1], Total_Customer_Count_2024: r[4] || null, Shape__Area: r[5] || null } }; }) }; }
function Places(name) { return { features: [{ attributes: { NAME: name + ' city', BASENAME: name } }] }; }
var asked = [];
function network(routes) {
  return function (url) {
    asked.push(url);
    for (var i = 0; i < routes.length; i++) if (routes[i][0].test(url)) {
      if (routes[i][1] instanceof Error) return Promise.reject(routes[i][1]);
      return Promise.resolve(JSON.parse(JSON.stringify(routes[i][1])));
    }
    return Promise.resolve({ features: [] });
  };
}
/* the City of Mesa's own electric service area (2026-10-20): a polygon
   1.5 km around downtown, as the city's map answers at 29 W Main St */
var MESA_AREA = /GCX_ExploreMesa\/MapServer\/13\/query/;
function square(lat, lng, m) { var a = m / 111320, b = m / (111320 * Math.cos(lat * Math.PI / 180)); return { rings: [[[lng - b, lat - a], [lng + b, lat - a], [lng + b, lat + a], [lng - b, lat + a], [lng - b, lat - a]]] }; }
var MESA_ROWS = [['12351', 'CITY OF MESA - (AZ)', 'MUNICIPAL', 'AZ', 18101, 4.3e9], ['16572', 'SALT RIVER PROJECT', 'POLITICAL SUBDIVISION', 'AZ', 1166094, 3e10],
  ['803', 'ARIZONA PUBLIC SERVICE CO', 'INVESTOR OWNED', 'AZ', 1400037, 1.3e11]];
var MESA_SUB = { attributes: { NAME: 'Mesa Downtown', MAX_VOLT: 69, OWNER: 'Salt River Project' }, geometry: { x: -111.8270, y: 33.4190 } };
var COMED_AT = new RegExp('^' + CS.SERVICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/' + CS.ATTRIB_LAYER + '/query\\?');
var SITES = {
  chicago: { anchor: { lat: 41.81522, lng: -87.62261 }, address: '3400 S Federal St, Chicago, IL 60616',
    sub: { attributes: { NAME: 'Crawford', MAX_VOLT: 138, OWNER: 'Commonwealth Edison' }, geometry: { x: -87.6150, y: 41.8210 } },
    net: network([[/Electricity_Rates_H3_Res5/, Esri([['4110', 'COMMONWEALTH EDISON CO', 'INVESTOR OWNED', 'IL', 4130749, 6.1e10]])], [/tigerweb/, Places('Chicago')],
      [COMED_AT, { features: [{ attributes: { Feeder: 'F0297', SS_N: 'Crawford TSS 21', BESS_HC: 15620, PV_HC_kW: 15620, EV_HC_kW: 16100, Feeder_Q: 4895, Queue_RD: '09/30/2026' } }] }]]) },
  mesa: { anchor: { lat: 33.4152, lng: -111.8329 }, address: '29 W Main St, Mesa, AZ 85201', sub: MESA_SUB,
    net: network([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places('Mesa')],
      [MESA_AREA, { features: [{ attributes: { FACILITYID: 'ELSA2' }, geometry: square(33.4152, -111.8329, 1500) }] }]]) },
  /* the city's map down: every utility on the national map, the bill decides */
  mesaDown: { anchor: { lat: 33.4152, lng: -111.8329 }, address: '29 W Main St, Mesa, AZ 85201', sub: MESA_SUB,
    net: network([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places('Mesa')], [MESA_AREA, new Error('the city\'s map is down')]]) },
  /* Illinois outside ComEd: the old layer never asked here */
  springfield: { anchor: { lat: 39.7817, lng: -89.6501 }, address: 'Springfield, IL 62701',
    sub: { attributes: { NAME: 'Dallman', MAX_VOLT: 138, OWNER: 'City of Springfield' }, geometry: { x: -89.6050, y: 39.7560 } },
    net: network([[/Electricity_Rates_H3_Res5/, Esri([['17828', 'CITY OF SPRINGFIELD - (IL)', 'MUNICIPAL', 'IL', 70000, 2.5e8]])], [/tigerweb/, Places('Springfield')]]) }
};
var HERE = SITES.chicago, DOOR_FAIL = null, posted = [], lastAnswer = null;
function respond(body, status) { return Promise.resolve({ ok: status === 200, status: status, json: function () { return Promise.resolve(JSON.parse(JSON.stringify(body))); } }); }
var ctx = {
  console: { info: function () {}, log: function () {} }, Promise: Promise, JSON: JSON, Math: Math, Date: Date, isFinite: isFinite, setTimeout: setTimeout,
  OmegaEditorV2Auth: { idToken: function () { return Promise.resolve('tok'); } },
  fetch: function (url, opts) {
    if (url === '/api/hosting-capacity') {
      var b = JSON.parse(opts.body);
      posted.push({ body: b, auth: opts.headers.Authorization, method: opts.method });
      if (DOOR_FAIL) { var f = DOOR_FAIL; DOOR_FAIL = null; return respond(f.body, f.status); }
      return H.run({ lat: b.lat, lng: b.lng, unit: b.unit, substation: b.substation, mode: b.mode },
        { fetchJson: HERE.net, db: function () { return null; }, now: function () { return 1790000000000; }, log: function () {} }).then(function (r) { lastAnswer = JSON.parse(JSON.stringify(r)); return respond(r, 200); });
    }
    if (/Substations\/FeatureServer\/0\/query/i.test(url)) return respond({ features: [HERE.sub] }, 200);
    if (/Transmission_Lines\/FeatureServer\/0\/query/.test(url)) return respond({ features: [{ attributes: { VOLTAGE: 138, OWNER: 'Tx Co', ID: 'T9' }, geometry: { paths: [[[HERE.anchor.lng - 0.01, HERE.anchor.lat], [HERE.anchor.lng + 0.01, HERE.anchor.lat + 0.002]]] } }] }, 200);
    return respond({}, 404);
  }
};
ctx.window = ctx;
vm.createContext(ctx);
['omega-editor-v2-geom.js', 'omega-grid-layers.js', 'omega-grid-verdict.js', 'omega-editor-v2-grid.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
});
var VG = ctx.OmegaEditorV2Grid;
var BESS = { bessKw: 2508, bessKwh: 5015 };
/* Omega Prime's own candidatesBlock (cut out of the page with its esc and
   safeHref, run on the same client): the list the card is held to, word
   for word, link for link */
var HS = require(path.join(ROOT, 'api/_lib/hosting-sources'));
var primeSrc = fs.readFileSync(path.join(ROOT, 'omega-prime.html'), 'utf8');
function cut(src, name) {
  var i = src.indexOf('function ' + name + '('), j = src.indexOf('{', i), d = 0, k;
  check(i >= 0, 'omega-prime.html has ' + name);
  for (k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) break; }
  return src.slice(i, k + 1);
}
var primeCtx = { GV: ctx.OmegaGridVerdict };
vm.createContext(primeCtx);
vm.runInContext(cut(primeSrc, 'esc') + '\n' + cut(primeSrc, 'safeHref') + '\n' + cut(primeSrc, 'candidatesBlock'), primeCtx, { filename: 'omega-prime.html' });
function primeWords(res) {
  return primeCtx.candidatesBlock(JSON.parse(JSON.stringify(res))).replace(/<[^>]*>/g, '').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function primeLinks(res) { var out = [], re = /<a href="([^"]*)"/g, h = primeCtx.candidatesBlock(JSON.parse(JSON.stringify(res))), m; while ((m = re.exec(h))) out.push(m[1].replace(/&amp;/g, '&')); return out; }
/* the card's who-serves lines, read as the card paints them */
function whoOf(lines) { return lines.filter(function (r) { return r.who; }); }
function cardWords(lines) {
  return whoOf(lines).map(function (r) { return r.text + (r.href ? ' ↗' : '') + (r.fold ? r.fold.map(function (x) { return x.text; }).join('') : ''); }).join('');
}
function samePrime(lines, res, what) {
  check(cardWords(lines).length > 0 && cardWords(lines) === primeWords(res), what + ': the list in Omega Prime\'s words and order');
  check(JSON.stringify(whoOf(lines).filter(function (r) { return r.href; }).map(function (r) { return r.href; })) === JSON.stringify(primeLinks(res)), what + ': the same links, in the same order');
}
function wait(cond, tries) { return new Promise(function (res, rej) { (function tick(i) { if (cond()) return res(); if (i > (tries || 400)) return rej(new Error('timed out')); setTimeout(function () { tick(i + 1); }, 5); })(0); }); }
function at(site) {
  HERE = site; var before = posted.length;
  VG.reload({ anchor: site.anchor, address: site.address }, BESS);
  return wait(function () { return posted.length > before && (VG.record() || /did not answer/.test(JSON.stringify(VG.card().lines))); }).then(function () {
    return { rec: VG.record(), lines: VG.card().lines, text: VG.card().lines.map(function (r) { return r.text; }).join('\n'), body: posted[posted.length - 1] };
  });
}
VG.setEnabled(true, { anchor: SITES.chicago.anchor, address: SITES.chicago.address }, BESS);
var COMED_SAY = 'Circuit F0297 has about 10,725 kW of room: 15,620 kW published, less 4,895 kW already queued. The 2.5 MW unit fits with 8,217 kW to spare.';
wait(function () { return !!VG.record(); }).then(function () {
  /* ComEd, through the door: the same sentence the probe gave */
  var rec = VG.record(), text = VG.card().lines.map(function (r) { return r.text; }).join('\n'), p0 = posted[0];
  check(posted.length === 1 && p0.method === 'POST' && p0.auth === 'Bearer tok', 'one question, to the national door, on the Site Plan session');
  check(p0.body.lat === 41.81522 && p0.body.lng === -87.62261 && p0.body.unit.kw === 2508 && p0.body.unit.kwh === 5015 && p0.body.mode === 'storage', 'at the site point, with the battery on the drawing');
  check(p0.body.substation && p0.body.substation.name === 'Crawford' && p0.body.substation.kv === 138 && p0.body.substation.km > 0, 'and the feeding substation off the public layer');
  check(asked.filter(function (u) { return COMED_AT.test(u); }).length === 1, 'ComEd\'s map is read by the door, server-side');
  check(rec.verdict.key === 'fits' && rec.verdict.say === COMED_SAY, 'the ComEd sentence, byte for byte');
  check(rec.circuit.utility === 'ComEd' && rec.circuit.netKw === 10725 && rec.circuit.coverage === 'read' && rec.utility.key === 'comed', 'the record is the one Prime and Site Map write');
  check(text.indexOf('Serving utility: ComEd · hosting capacity') >= 0, 'ComEd named, from the answer');
  check(text.indexOf('Circuit F0297 · 15,620 kW published · 4,895 kW queued · 10,725 kW net of the queue') >= 0, 'the net of the queue, as ComEd publishes it gross');
  check(VG.card().lines.some(function (r) { return r.href === CS.REFERER; }), 'ComEd\'s own map, to check it');
  check(/Source: ComEd's published hosting capacity · ComEd_BESS_Hosting_Capacity_[A-Z]{3}20\d\d layer 75 · refreshed 2026-09-30, resolved at the parcel\./.test(text), 'the source, in the answer\'s words');
  check(!/Feeder_Q|BESS_HC/.test(text), 'no upstream field name on the card');
  check(!whoOf(VG.card().lines).length && primeWords(lastAnswer) === '', 'a figure read for the one utility mapped: no list, here or in Prime');
  return at(SITES.mesa);
}).then(function (m) {
  /* Mesa, Arizona: the real utility, never one utility's words */
  check(m.body.body.lat === 33.4152 && m.body.body.substation.name === 'Mesa Downtown', 'Mesa: one question at the new point');
  check(m.rec.utility.display === 'City of Mesa' && m.rec.coverage === 'no-public-map' && m.rec.circuit === null && m.rec.verdict.key === 'study', 'Mesa: the City of Mesa, nothing published, a study');
  check(m.text.indexOf('Serving utility: City of Mesa · publishes no hosting capacity') >= 0, 'Mesa: named in Prime\'s words');
  check(m.text.indexOf('More than one utility') < 0 && m.text.indexOf('islands') < 0, 'Mesa: the city\'s own service-area map settles it; one utility, no SRP caution');
  check(/City of Mesa publishes no hosting capacity/.test(m.text), 'Mesa: in the server\'s words');
  check(!/comed|feeder_q/i.test(JSON.stringify(m.lines)), 'Mesa: no ComEd word anywhere');
  /* who serves the point: the City of Mesa by its own map, with the city's
     service-area map; Salt River Project and APS folded away with the reason */
  var MESA_E = HS.byKey('mesa'), INSIDE = 'the point is inside the City of Mesa\'s own electric service area (the city\'s map)', mw = whoOf(m.lines);
  check(JSON.stringify(mw.map(function (r) { return [r.who, r.text]; })) === JSON.stringify([['head', 'Who serves this point'], ['name', 'City of Mesa'],
    ['why', 'inside its own electric service area (the city\'s map)'], ['says', 'Publishes no hosting capacity.'], ['link', MESA_E.check.label],
    ['fold', 'Also on the territory maps, not this point (2)']]), 'Mesa: who serves the point, a line each, in Prime\'s order');
  check(mw[1].bold === 'City of Mesa' && mw[4].href === MESA_E.check.url, 'Mesa: the City of Mesa in bold, and the city\'s own service-area map to check');
  check(JSON.stringify(mw[5].fold) === JSON.stringify([{ text: 'Salt River Project (' + INSIDE + ')' }, { text: 'Arizona Public Service (' + INSIDE + ')' }]), 'Mesa: Salt River Project and APS folded, each with the reason');
  samePrime(m.lines, lastAnswer, 'Mesa');
  check(JSON.stringify(m.lines.filter(function (r) { return r.href; }).map(function (r) { return r.href; })) === JSON.stringify([MESA_E.check.url, MESA_E.viewerUrl]),
    'Mesa: the city\'s service-area map in the list and its page to check it on; never a hosting map that does not exist');
  return at(SITES.mesaDown);
}).then(function (md) {
  /* the city's map down: every utility on the national map named, each with
     what it publishes, the route it offers instead and its own pages; the
     bill decides */
  check(md.rec.utility.display === 'City of Mesa' && md.rec.coverage === 'no-public-map', 'Mesa, the city\'s map down: the city still leads inside the city');
  var dw = whoOf(md.lines), MESA_E = HS.byKey('mesa'), SRP_E = HS.byKey('srp'), APS_E = HS.byKey('aps');
  check(dw[0].text === 'More than one utility is mapped at this point.' && dw[dw.length - 1].text === 'Confirm the utility with the customer’s bill.' && !dw.some(function (r) { return r.fold; }),
    'Mesa, the city\'s map down: more than one utility mapped, the bill decides, nothing folded');
  check(JSON.stringify(dw.filter(function (r) { return r.who === 'name'; }).map(function (r) { return r.text; })) === JSON.stringify(['City of Mesa — the one read here', 'Salt River Project', 'Arizona Public Service']),
    'Mesa, the city\'s map down: all three, the city first and marked');
  check(JSON.stringify(dw.filter(function (r) { return r.who === 'says'; }).map(function (r) { return r.text; })) === JSON.stringify(['Publishes no hosting capacity.',
    'Publishes no hosting capacity. Instead: ' + SRP_E.route + '.', 'Publishes no hosting capacity. Instead: ' + APS_E.route + '.']), 'Mesa, the city\'s map down: what each publishes, and the route the others offer');
  check(JSON.stringify(dw.filter(function (r) { return r.href; }).map(function (r) { return r.href; })) === JSON.stringify([MESA_E.check.url, SRP_E.viewerUrl, SRP_E.check.url, APS_E.viewerUrl, APS_E.check.url]),
    'Mesa, the city\'s map down: each utility\'s own pages');
  samePrime(md.lines, lastAnswer, 'Mesa, the city\'s map down');
  check(/encloses Arizona Public Service and City of Mesa islands/.test(md.text) && /The City of Mesa's own service-area map did not answer/.test(md.text), 'Mesa, the city\'s map down: the server\'s caution, and the map that did not answer');
  return at(SITES.springfield);
}).then(function (sp) {
  /* Illinois outside ComEd: asked now, and named */
  check(sp.body.body.lat === 39.7817 && sp.rec && sp.rec.utility.display === 'City Water, Light & Power (Springfield)', 'Springfield IL is asked, and CWLP named');
  check(sp.text.indexOf('Serving utility: City Water, Light & Power (Springfield) · publishes no hosting capacity') >= 0 && /CWLP publishes no hosting capacity/.test(sp.text), 'in the server\'s words');
  check(sp.lines.some(function (r) { return r.href === 'https://www.cwlp.com/Renewable.aspx'; }), 'with CWLP\'s own page');
  check(whoOf(sp.lines)[0].text === 'Who serves this point', 'Springfield: who serves the point, where no figure is read');
  samePrime(sp.lines, lastAnswer, 'Springfield');
  DOOR_FAIL = { status: 503, body: { error: 'offline' } };
  return at(SITES.mesa);
}).then(function (f) {
  /* a door that does not answer: said, nothing judged */
  check(f.rec === null && /The hosting capacity check did not answer: offline/.test(f.text), 'a failed door is said, and nothing is judged');
  console.log('tgridlayer: ' + n + ' checks passed');
}).catch(function (e) { console.error(e); process.exit(1); });
