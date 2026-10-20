/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Grid Atlas is one layer on the Site Plan map. It is off until asked.
 * The page does not carry a service URL, and it does not judge a circuit.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');

require(path.join(ROOT, 'omega-editor-v2-geom.js'));
require(path.join(ROOT, 'omega-grid-layers.js'));
require(path.join(ROOT, 'omega-grid-verdict.js'));
require(path.join(ROOT, 'omega-comed-layers.js'));
require(path.join(ROOT, 'omega-editor-v2-grid.js'));
require(path.join(ROOT, 'omega-editor-v2-doc.js'));
require(path.join(ROOT, 'omega-editor-v2-design.js'));

if (!global.OmegaComEdLayers) global.OmegaComEdLayers = require(path.join(ROOT, 'omega-comed-layers.js')).OmegaComEdLayers;
if (!global.OmegaGridVerdict) global.OmegaGridVerdict = require(path.join(ROOT, 'omega-grid-verdict.js')).OmegaGridVerdict;

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

check(Grid.stateOf('Sample parcel') === null, 'the sample address has no state');
check(Grid.stateOf('Los Angeles, CA 90001') === 'CA', 'a state before a ZIP is read');
check(Grid.routeOf(33.306, -112.074, 'Sample parcel') === 'none', 'Phoenix with no state does not pick a hosting route');
check(Grid.routeOf(41.88, -87.63, 'Chicago, IL 60601') === 'comed', 'a point in the ComEd map uses the parcel probe');
check(Grid.routeOf(39.78, -89.65, 'Springfield, IL 62701') === 'none', 'Illinois outside that map is not sent to the other-state route');
check(Grid.routeOf(34.05, -118.25, 'Los Angeles, CA 90001') === 'hosting', 'another state uses the hosting route');

var body = Grid.verdictBody(Grid.unitOf({ bessKw: 500, bessKwh: 1000 }), null, null);
check(body.circuit === null && body.unit.kw === 500, 'no circuit is sent as no circuit, with the battery on the drawing');
var judged = Judge.judge(body);
check(judged.verdict.label === 'Needs a study' && judged.circuit.reason === 'no-circuit', 'the server calls a missing circuit a study');
var applied = Grid.applyAnswer(judged, 'none', null, null);
check(applied.verdict.label === 'Needs a study', 'the page shows the server verdict');
check(applied.sourceLine.indexOf('No hosting map') >= 0 && applied.sourceLine.indexOf('ComEd') < 0, 'a site outside ComEd does not claim the ComEd map');
var shown = Grid.summaryLines(scene, applied, '');
var blob = shown.map(function (row) { return row.text; }).join('\n');
check(blob.indexOf('Needs a study') >= 0 && blob.indexOf('Test Sub') >= 0, 'the card names the feeding substation and the verdict');
check(blob.indexOf('kW net') < 0, 'a study with no circuit does not invent a hosting figure');

var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
var app = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-app.js'), 'utf8');
var self = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-grid.js'), 'utf8');
check(page.indexOf('omega-grid-layers.js') >= 0 && page.indexOf('omega-editor-v2-grid.js') >= 0, 'the page loads the shared layer list and this layer');
check(page.indexOf('id="grid-detail"') >= 0, 'a click has a detail card');
check(app.indexOf('id = \'layer-grid-atlas\'') >= 0 || app.indexOf('id="layer-grid-atlas"') >= 0, 'the layers list has one Grid Atlas row');
check(self.indexOf('arcgis.com') < 0 && self.indexOf('geoplatform.gov') < 0, 'the editor layer does not carry a service URL');
check(page.indexOf('arcgis.com') < 0 && app.indexOf('arcgis.com') < 0, 'the page does not carry a service URL');
check(self.indexOf('judge(') < 0, 'the page does not judge a circuit');

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

/* Any other state: the national door (api/hosting-capacity.js) names the
   utility, reads what it publishes and judges the circuit. Site Plan keeps
   that answer as the record and never asks the verdict twice. The answers
   below are in the door's own shape (compose()). */
var GVc = global.OmegaGridVerdict;
var unit500 = Grid.unitOf({ bessKw: 500, bessKwh: 1000 });
var pgeCircuit = { utility: 'Pacific Gas and Electric', id: 'F-1101', substation: 'Oakland', publishedKw: 1500, queuedKw: 0, addressResolved: false, grain: 'line section' };
var readAnswer = { version: 'test', point: { lat: 34.05, lng: -118.25 }, coverage: 'read',
  utility: { key: 'pge', display: 'Pacific Gas and Electric', eiaId: '14328' },
  source: { key: 'pge-grip', label: 'PG&E published hosting capacity', grain: 'line section', refreshed: '2026-09-30', addressResolved: false, distanceM: 40 },
  circuits: [{ id: 'F-1101', name: 'Feeder 1101', substation: 'Oakland', basis: 'storage', publishedKw: 1500, queuedKw: 0 }], best: 0, body: pgeCircuit,
  verdict: Judge.judge({ unit: unit500, substation: null, circuit: pgeCircuit }),
  note: 'Pacific Gas and Electric publishes hosting capacity; this is its figure for the nearest line section, 40 m from the point. A screening figure: Pacific Gas and Electric decides in its interconnection review.' };
var recRead = Grid.hostingRecord(readAnswer);
check(recRead && recRead.kind === 'hosting' && recRead.verdict.key === readAnswer.verdict.verdict.key && recRead.verdict.label === 'Fits', 'the door\'s judged answer is the record');
check(recRead.circuit && recRead.circuit.id === 'F-1101' && recRead.circuit.utility === 'Pacific Gas and Electric' && recRead.circuit.netKw === 1500, 'the circuit and its utility come from the answer');
check(recRead.sourceLine.indexOf('Source: PG&E published hosting capacity, refreshed 2026-09-30.') === 0 && recRead.sourceLine.indexOf('A screening figure') > 0 && recRead.sourceLine.indexOf(readAnswer.verdict.version) > 0, 'the source line is the answer\'s own words and the verdict version');
check(recRead.sourceLine.indexOf('ComEd') < 0 && recRead.sourceLine.indexOf('undefined') < 0, 'it claims no other map and prints nothing undefined');
var noMap = { version: 'test', coverage: 'no-public-map', utility: { key: 'mesa', display: 'City of Mesa Electric' }, source: null, circuits: [], best: null, body: null,
  verdict: Judge.judge({ unit: unit500, substation: null, circuit: null }), note: 'City of Mesa Electric does not publish hosting capacity; ask its interconnection team.' };
var recNone = Grid.hostingRecord(noMap);
check(recNone && recNone.circuit === null && recNone.verdict.label === 'Needs a study', 'a utility with no public map is a study, with no circuit recorded');
var noneBlob = Grid.summaryLines(scene, recNone, '').map(function (r) { return r.text; }).join('\n');
check(noneBlob.indexOf('City of Mesa Electric does not publish hosting capacity') >= 0 && noneBlob.indexOf('kW net') < 0, 'the card says who serves the point and invents no figure');
check(Grid.hostingRecord(null) === null, 'no answer, no record');

/* readCircuit sends the point and the battery to the door once, through the
   shared client, and does not ask /api/grid-verdict again. */
var asked = [], verdictAsks = 0, realHosting = GVc.hosting, realAsk = GVc.ask;
var la = D.create({ name: 'LA', anchor: { lat: 34.05, lng: -118.25 }, address: '1 Main St, Los Angeles, CA 90001' });
GVc.hosting = function (b) { asked.push(b); return Promise.resolve(readAnswer); };
GVc.ask = function () { verdictAsks++; return Promise.reject(new Error('not expected')); };
new Promise(function (resolve) {
  Grid.readCircuit(la, { bessKw: 500, bessKwh: 1000 }, function (kind, circuit, probe, status, judged) { resolve({ kind: kind, status: status, judged: judged }); });
}).then(function (got) {
  check(asked.length === 1 && asked[0].lat === 34.05 && asked[0].lng === -118.25 && asked[0].unit.kw === 500 && asked[0].unit.kwh === 1000, 'the door is asked once, with the point and the battery');
  check(got.kind === 'hosting' && got.judged && got.judged.verdict.label === 'Fits' && got.status === '', 'its judged answer comes back as the record');
  check(verdictAsks === 0, 'the verdict is not asked a second time');
  GVc.hosting = function () { return Promise.reject(new Error('Sign in to check the grid.')); };
  return new Promise(function (resolve) {
    Grid.readCircuit(la, {}, function (kind, circuit, probe, status, judged) { resolve({ kind: kind, status: status, judged: judged }); });
  });
}).then(function (got) {
  check(got.kind === 'hosting' && !got.judged && got.status === 'Sign in to check the grid.', 'a refused request says why and records nothing');
  GVc.hosting = realHosting; GVc.ask = realAsk;
  console.log('tgridlayer: ' + n + ' checks passed');
}).catch(function (e) { GVc.hosting = realHosting; GVc.ask = realAsk; console.error(e); process.exit(1); });

