/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/tests/teditorv23d.js — the one-click 3D view of a Site Plan.
 * Pure. No network. The page keeps a single 3D button.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var D = require('../../omega-editor-v2-doc.js');
var V = require('../../omega-editor-v2-3d.js');
/* Config status is pure; authentication is covered by teditorv2gates. */
var adminId = require.resolve('../../api/_lib/admin');
require.cache[adminId] = { id: adminId, filename: adminId, loaded: true, exports: { handler: function (fn) { return fn; } } };
var accessId = require.resolve('../../api/_lib/package-access');
require.cache[accessId] = { id: accessId, filename: accessId, loaded: true, exports: {} };
var cfg = require('../../api/editor-v2-3d-config.js');
var tiles = require('../../api/_lib/editor-v2-3d-tiles.js');

var n = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  n++;
}
function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, msg + ' (' + a + ' vs ' + b + ')');
  n++;
}

function sample() {
  var doc = D.create({
    name: 'Sample industrial site',
    address: 'Sample parcel',
    anchor: { lat: 33.306, lng: -112.074 },
    assignment: { customerName: 'Sample customer' }
  });
  var parcel = { id: 'e_parcel', type: 'polygon', layer: 'site', closed: true, pts: [
    { x: 0, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 280 }, { x: 0, y: 280 }
  ]};
  doc.entities.push(parcel);
  doc.entities.push({
    id: 'e_array', type: 'array', layer: 'array', boundaryId: parcel.id,
    mount: 'fixed-ground', setbackFt: 15
  });
  doc.entities.push({
    id: 'e_bldg', type: 'obstruction', layer: 'obstruction', closed: true,
    pts: [{ x: 300, y: 170 }, { x: 390, y: 170 }, { x: 390, y: 245 }, { x: 300, y: 245 }]
  });
  doc.entities.push({ id: 'e_bess', type: 'equip', layer: 'equipment', key: 'bess', label: 'BESS', x: 48, y: 36, w: 28, h: 10, rot: 0, kw: 500, kwh: 1000 });
  doc.entities.push({ id: 'e_pcs', type: 'equip', layer: 'equipment', key: 'pcs', label: 'PCS', x: 78, y: 36, w: 8, h: 4, rot: 0, kw: 250, kwh: 0 });
  doc.entities.push({ id: 'e_xfmr', type: 'equip', layer: 'equipment', key: 'transformer', label: 'Transformer', x: 36, y: 18, w: 8, h: 6, rot: 0 });
  doc.entities.push({ id: 'e_meter', type: 'equip', layer: 'equipment', key: 'meter', label: 'Meter', x: 22, y: 16, w: 3, h: 2, rot: 0 });
  doc.entities.push({ id: 'e_poi', type: 'equip', layer: 'equipment', key: 'poi', label: 'POI', x: 12, y: 12, w: 4, h: 4, rot: 0 });
  doc.entities.push({
    id: 'e_conduit', type: 'conduit', layer: 'conduit', spec: 'RMC',
    pts: [{ x: 12, y: 12 }, { x: 12, y: 36 }, { x: 48, y: 36 }]
  });
  doc.entities.push({
    id: 'e_note', type: 'callout', layer: 'annotation',
    target: { x: 345, y: 200 }, anchor: { x: 250, y: 255 }, text: 'Existing building'
  });
  return doc;
}

var doc = sample();
var scene = V.sceneOf(doc);
var lay = D.arrayLayout(doc, D.find(doc, 'e_array'));
check(lay.ok && scene.tables.length === lay.tables.length, 'every array table is in the scene');
check(scene.tables.length > 0, 'the sample field has tables');
var bess = null, i;
for (i = 0; i < scene.objects.length; i++) if (scene.objects[i].id === 'e_bess') bess = scene.objects[i];
check(bess && bess.h === 9.5 && bess.w === 28 && bess.d === 10, 'the battery is 28 × 10 ft and 9.5 ft tall');
var arr = null;
for (i = 0; i < scene.objects.length; i++) if (scene.objects[i].kind === 'array') arr = scene.objects[i];
check(arr && arr.tilt === 25, 'fixed tilt at this latitude is 25°');
check(V.tiltDeg('fixed-ground', 33.306) === 25, 'tilt rounds |lat| × 0.76 into 10–35');
check(scene.prisms.length === 1 && scene.prisms[0].h === 18 && /building/i.test(scene.prisms[0].label), 'a called-out building is 18 ft');

var hidden = sample();
var layer, li;
for (li = 0; li < hidden.layers.length; li++) if (hidden.layers[li].id === 'equipment') layer = hidden.layers[li];
layer.visible = false;
var hiddenScene = V.sceneOf(hidden);
var still = false;
for (i = 0; i < hiddenScene.objects.length; i++) if (hiddenScene.objects[i].kind === 'equip') still = true;
check(!still, 'a hidden equipment layer is omitted');

var sun = V.sunPosition(33.306, -112.074, new Date(Date.UTC(2026, 5, 21, 19, 30)));
check(sun.altitude > 70 && sun.altitude < 85, 'Phoenix solar noon on 21 June is high');
check(sun.azimuth > 150 && sun.azimuth < 210, 'that sun is to the south');
var shadow = V.shadowOffset(10, { altitude: 45, azimuth: 180 });
near(shadow.x, 0, 1e-6, 'a noon shadow has no easting');
near(shadow.z, 10, 1e-6, 'a noon shadow falls 10 ft north');
var toward = V.sunVector({ altitude: 45, azimuth: 180 });
near(toward[0], 0, 1e-6, 'toward the noon sun, x is 0');
near(toward[1], Math.sin(Math.PI / 4), 1e-6, 'toward the noon sun, y is sin of altitude');
near(toward[2], -Math.cos(Math.PI / 4), 1e-9, 'toward the noon sun, z is south');

var grade = V.gradePad({ w: 20, d: 8 }, [100, 100, 102, 102, 101]);
near(grade.meanFt, 101, 1e-9, 'pad mean');
near(grade.cutCy, 0.4 * 160 / 27, 1e-9, 'cut cubic yards from a 0.4 ft average depth');
near(grade.fillCy, 0.4 * 160 / 27, 1e-9, 'fill cubic yards from a 0.4 ft average depth');
near(grade.slopePct, 2 / Math.sqrt(20 * 20 + 8 * 8) * 100, 1e-6, 'slope across the diagonal');

var trench = V.trenchLength([{ x: 0, y: 0 }, { x: 100, y: 0 }], function (x) { return x * 0.3; });
near(trench.planFt, 100, 1e-9, 'plan length');
near(trench.terrainFt, Math.sqrt(100 * 100 + 30 * 30), 1e-6, 'terrain length');

var ramp = V.gridFrom({
  n: 3, minX: 0, minY: 0, maxX: 20, maxY: 20,
  z: function (ix, iy) { return iy * 10; },
  source: 'usgs-3dep'
});
var contours = V.contours(ramp, 10);
check(contours.segments.length > 0, 'a ramp produces a contour');

var flatCivil = V.civilOf(scene, { source: 'pending' });
check(flatCivil.cutCy === null && flatCivil.fillCy === null, 'cut and fill stay blank until 3DEP answers');
var readyFlat = V.readiness(scene, null);
check(readyFlat.score === 100, 'pending terrain is left out of the score');
var sloped = V.gridFrom({
  n: 2, minX: scene.bounds.minX, minY: scene.bounds.minY, maxX: scene.bounds.maxX, maxY: scene.bounds.maxY,
  z: function (ix, iy) { return 1000 + iy * 40; },
  source: 'usgs-3dep'
});
var civil = V.civilOf(scene, sloped);
check(civil.source === 'usgs-3dep' && civil.cutCy > 0 && civil.trenchTerrainFt > civil.trenchPlanFt, 'a real grade reports cut and a longer trench');
var readyGrade = V.readiness(scene, civil);
var gradeStep = null;
for (i = 0; i < readyGrade.steps.length; i++) if (readyGrade.steps[i].id === 'grade') gradeStep = readyGrade.steps[i];
check(gradeStep && gradeStep.state === 'fail' && civil.overLimit > 0, 'a pad over the screening slope fails the grade step');

var summary = D.summary(doc);
var card = V.analyze(arr, scene, summary, civil, { sub: { name: 'SINNOTT', kv: 69, mi: 1.2 } });
check(card.cost === null, 'browser does not price solar');
check(card.connections.join(' ').indexOf('SINNOTT') >= 0, 'the card names the feeding substation');
var bessCard = V.analyze(bess, scene, summary, civil, null);
check(bessCard.cost === null, 'browser does not price storage');

var plan = V.providerPlan({});
check(plan.active === 'free' && plan.elevation === 'usgs-3dep' && plan.ionTerrain === false && plan.photorealisticAvailable === false, 'the free path needs no key');
check(V.providerPlan({ photorealistic: true }).photorealisticAvailable === true, 'photorealistic is only a flag');

var cam = { target: { x: 10, y: 0, z: 20 }, yaw: 0.4, pitch: 0.5, radius: 200, fovy: Math.PI / 4 };
var projected = V.projectPoint(cam, 1.5, 900, 600, [10, 0, 20]);
near(projected.x, 450, 1.5, 'the camera target lands on the horizontal center');
near(projected.y, 300, 1.5, 'the camera target lands on the vertical center');

var built = V.compose(scene, sloped, { altitude: 45, azimuth: 180 }, {});
check(built.triangles > 100, 'the scene has a mesh');
var picked = false;
for (i = 0; i < built.pick.length; i++) if (built.pick[i].id === 'e_bess') picked = true;
check(picked, 'the battery can be picked');
var contoured = V.compose(scene, sloped, { altitude: 45, azimuth: 180 }, { contours: true });
check(contoured.lines.length > built.lines.length, 'contours add lines and nothing else on the plan');

var stops = V.tourStops(scene);
check(stops[0].kind === 'overview' && stops.length > 3, 'the walk starts with the whole site');

var root = path.join(__dirname, '../..');
var page = fs.readFileSync(path.join(root, 'editor-v2.html'), 'utf8');
check((page.split('id="btn-3d"').length - 1) === 1, 'the plan has one 3D button');
check(page.indexOf('data-hook="view3d"') > page.indexOf('id="ribbon"'), 'the 3D button is the View hook on the ribbon');
check(page.indexOf('data-act="view3d"') < 0 && page.indexOf('class="btn view3d"') < 0, 'there is no second 3D button');
check(page.indexOf('>3D</button>') >= 0, 'the button reads 3D');
var scriptAt = page.indexOf('omega-editor-v2-3d.js');
var appAt = page.indexOf('omega-editor-v2-app.js');
check(scriptAt > 0 && scriptAt < appAt, 'the 3D module loads before the page');
check(page.indexOf('<b>3D</b>') >= 0, 'help names the 3D command');
var app = fs.readFileSync(path.join(root, 'omega-editor-v2-app.js'), 'utf8');
var viewAt = app.indexOf("map[word] === 'view3d'");
var toolAt = app.indexOf('setTool(map[word])');
check(viewAt > 0 && viewAt < toolAt, '3D is handled before a drawing tool');
check(app.indexOf("register('view3d'") >= 0, 'the ribbon hook opens the 3D view');
check(app.indexOf('Type 2D to return to the plan.') >= 0, 'the command line says how to come back');
check(fs.readFileSync(path.join(root, 'editor.html'), 'utf8').indexOf('omega-editor-v2') < 0, 'Site Map does not load the preview');

var files = ['omega-editor-v2-3d.js', 'editor-v2.html', 'omega-editor-v2-app.js', 'api/editor-v2-3d-config.js', 'api/editor-v2-3d-tiles.js', 'api/_lib/editor-v2-3d-tiles.js'];
for (i = 0; i < files.length; i++) {
  check(fs.readFileSync(path.join(root, files[i]), 'utf8').indexOf('AIza') < 0, files[i] + ' has no key');
}

var secret = 'test-map-tiles-secret';
var prev = process.env.GOOGLE_MAP_TILES_API_KEY;
process.env.GOOGLE_MAP_TILES_API_KEY = secret;
var status = cfg.publicStatus(process.env);
check(status.photorealistic === true && status.ionTerrain === false, 'config reports the upgrade as a boolean');
check(Object.keys(status).length === 2, 'config has two fields');
check(JSON.stringify(status).indexOf(secret) < 0, 'config does not return the key');
delete process.env.GOOGLE_MAP_TILES_API_KEY;
check(cfg.publicStatus(process.env).photorealistic === false, 'an empty key leaves photorealistic off');
if (prev) process.env.GOOGLE_MAP_TILES_API_KEY = prev;

check(tiles.allowed('https://tile.googleapis.com/v1/3dtiles/root.json') === true, 'the Google tiles host is allowed');
check(tiles.allowed('http://tile.googleapis.com/v1/3dtiles/root.json') === false, 'plain http is refused');
check(tiles.allowed('https://tile.googleapis.com.evil.example/root.json') === false, 'a lookalike host is refused');
check(tiles.allowed('https://evil.example/root.json') === false, 'another host is refused');
check(tiles.followRedirects === false && tiles.isRedirect(302) === true, 'a redirect is not followed');
check(tiles.targetOf('/api/editor-v2-3d-tiles?u=' + encodeURIComponent('https://evil.example/x')) === null, 'the proxy refuses an open target');
var base = 'https://tile.googleapis.com/v1/3dtiles/root.json';
var raw = JSON.stringify({
  root: {
    content: { uri: 'https://tile.googleapis.com/v1/3dtiles/tile.json?key=' + secret },
    children: [{ content: { uri: 'child.json', url: 'https://evil.example/steal.json' } }]
  }
});
var rewritten = tiles.rewrite(raw, base, secret);
check(rewritten.indexOf(secret) < 0, 'a rewritten tileset does not contain the key');
var parsed = JSON.parse(rewritten);
check(parsed.root.content.uri.indexOf('/api/editor-v2-3d-tiles?u=') === 0, 'a Google uri goes back through the proxy');
check(parsed.root.children[0].content.uri.indexOf('child.json') >= 0, 'a relative tile stays on the Google host');
check(parsed.root.children[0].content.url.indexOf('evil.example') >= 0 && parsed.root.children[0].content.url.indexOf('/api/editor-v2-3d-tiles') < 0, 'another host is not proxied');
check(V.open({ doc: doc }).ok === false, 'opening without a document returns a reason');

/* What a build places is the same document the 3D view reads. */
var built = D.create({
  name: 'Built site',
  anchor: { lat: 33.306, lng: -112.074 },
  assignment: { customerName: 'Built customer' }
});
var plot = { id: 'e_plot', type: 'polygon', layer: 'site', closed: true, pts: [
  { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }
]};
built.entities.push(plot);
built.entities.push({ id: 'e_arr', type: 'array', layer: 'array', boundaryId: plot.id, mount: 'fixed-ground', setbackFt: 10 });
built.entities.push({ id: 'e_bat', type: 'equip', layer: 'equipment', key: 'bess', label: 'BESS', x: 30, y: 20, w: 20, h: 8, kw: 100, kwh: 200 });
built.entities.push({ id: 'e_pcs2', type: 'equip', layer: 'equipment', key: 'pcs', label: 'PCS', x: 48, y: 20, w: 8, h: 4, kw: 100 });
built.entities.push({ id: 'e_xf', type: 'equip', layer: 'equipment', key: 'transformer', label: 'Transformer', x: 20, y: 12, w: 8, h: 6 });
built.entities.push({ id: 'e_ch', type: 'equip', layer: 'equipment', key: 'charger', label: 'EV charger', x: 70, y: 16, w: 3, h: 2, kw: 180 });
built.entities.push({ id: 'e_poi2', type: 'equip', layer: 'equipment', key: 'poi', label: 'POI', x: 8, y: 8, w: 4, h: 4 });
built.entities.push({ id: 'e_tr', type: 'conduit', layer: 'conduit', spec: 'RMC', pts: [{ x: 8, y: 8 }, { x: 30, y: 20 }] });
built.entities.push({ id: 'e_ln', type: 'line', layer: 'site', a: { x: 0, y: 60 }, b: { x: 200, y: 60 } });
var builtScene = V.sceneOf(built);
function seen(list, id) {
  var j;
  for (j = 0; j < list.length; j++) if (list[j].id === id) return list[j];
  return null;
}
check(seen(builtScene.objects, 'e_arr') && V.sceneOf(built).tables.length === D.arrayLayout(built, D.find(built, 'e_arr')).tables.length, 'the array the build placed is the array in 3D');
check(seen(builtScene.objects, 'e_bat') && seen(builtScene.objects, 'e_pcs2') && seen(builtScene.objects, 'e_xf'), 'battery, PCS and transformer come from the design');
check(seen(builtScene.objects, 'e_ch') && seen(builtScene.objects, 'e_ch').h === 7.2, 'a charger placed on the plan is in the scene');
check(seen(builtScene.objects, 'e_poi2') && seen(builtScene.objects, 'e_tr'), 'the point of interconnection and the conduit are in the scene');
check(seen(builtScene.lines, 'e_ln') && seen(builtScene.lines, 'e_ln').pts.length === 2, 'a drawn line is in the scene');
var chCard = V.analyze(seen(builtScene.objects, 'e_ch'), builtScene, D.summary(built), null, null);
check(chCard.kw === 180 && chCard.connections.length > 0, 'clicking a charger reports its kilowatts and how it connects');
check(V.sync(built) === false, 'sync does nothing until the view is open');

var clip = V.clipPath([{ x: -20, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 80 }], { minX: 0, minY: 0, maxX: 40, maxY: 40 });
check(clip.length === 1 && Math.abs(clip[0][0].x) < 1e-6 && Math.abs(clip[0][1].x - 40) < 1e-6, 'a line is clipped to the model instead of dropped');
var G = require('../../omega-editor-v2-geom.js');
function ll(x, y) { var p = G.ftToLatLng(x, y, built.anchor); return [p.lng, p.lat]; }
var crossing = { geometry: { paths: [[ll(-40, 40), ll(240, 40)]] }, attributes: { VOLTAGE: 69, SUB_1: 'IRVIN', SUB_2: 'SINNOTT' } };
var far = { name: 'RUPPERS', kv: 69, mi: 1.4, x: 9000, y: 4000 };
var grid = V.placeGrid([crossing], far, builtScene, { minX: 0, minY: 0, maxX: 200, maxY: 120 }, built.anchor);
var crossed = false;
for (i = 0; i < grid.wires.length; i++) if (grid.wires[i].label === '69 kV') crossed = true;
check(crossed, 'a transmission line that crosses the parcel is kept');
check(grid.yard && grid.yard.x >= 0 && grid.yard.x <= 200 && grid.yard.y >= 0 && grid.yard.y <= 120, 'an off-site substation sits on the edge of the model');
check(grid.yard.label.indexOf('RUPPERS') >= 0, 'the substation keeps its published name');

/* True vertical scale. A side-on 16.9% grade is 16.9% on screen, and
   doubling the picture does not double the slope the Run reads. */
var side = { target: { x: 50, y: 8.45, z: 0 }, yaw: 0, pitch: 0.001, radius: 500, fovy: Math.PI / 4 };
var sideA = V.projectPoint(side, 16 / 9, 1600, 900, [0, 0, 0]);
var sideB = V.projectPoint(side, 16 / 9, 1600, 900, [100, 16.9, 0]);
near(Math.abs((sideB.y - sideA.y) / (sideB.x - sideA.x)) * 100, 16.9, 0.05, 'a 16.9% grade is 16.9% on screen at 1:1');
var horiz = V.projectPoint(side, 16 / 9, 1600, 900, [100, 0, 0]);
var vert = V.projectPoint(side, 16 / 9, 1600, 900, [0, 100, 0]);
var origin = V.projectPoint(side, 16 / 9, 1600, 900, [0, 0, 0]);
near(Math.hypot(horiz.x - origin.x, horiz.y - origin.y), Math.hypot(vert.x - origin.x, vert.y - origin.y), 0.2, '100 ft across and 100 ft up are the same length');
var reliefGrid = V.gridFrom({
  n: 3, minX: 0, minY: 0, maxX: 200, maxY: 100,
  z: function (ix) { return 1000 + ix * 5; },
  source: 'usgs-3dep', datum: 1000
});
function ySpan(tris) {
  var lo = Infinity, hi = -Infinity, ti, vk, yy;
  for (ti = 0; ti < tris.length; ti++) for (vk = 0; vk < 3; vk++) {
    yy = tris[ti].p[vk][1];
    if (yy < lo) lo = yy;
    if (yy > hi) hi = yy;
  }
  return hi - lo;
}
var sunFlat = { altitude: 50, azimuth: 180 };
near(ySpan(V.compose(scene, reliefGrid, sunFlat, { exag: 1 }).terrain), 10, 1e-6, 'the mesh relief matches the samples at 1×');
near(ySpan(V.compose(scene, reliefGrid, sunFlat, { exag: 2 }).terrain), 20, 1e-6, 'the exaggeration slider doubles only the picture');

/* USGS 3DEP for this parcel, 2026-10-18. The service does not return
   points in the order we asked, so a sample is placed by its lng/lat.
   Reading the body by index built a false ridge (about 16.9% on the
   array and 6.1% on the battery). Placed by location, the same points
   are 12.3% and 11.8%, and the west edge no longer jumps a storey. */
var dem = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sample-3dep-meters.json'), 'utf8'));
var Gfix = require('../../omega-editor-v2-geom.js');
var sw = Gfix.ftToLatLng(dem.box.minX, dem.box.minY, dem.anchor);
var ne = Gfix.ftToLatLng(dem.box.maxX, dem.box.maxY, dem.anchor);
var demGeo = {
  south: Math.min(sw.lat, ne.lat), north: Math.max(sw.lat, ne.lat),
  west: Math.min(sw.lng, ne.lng), east: Math.max(sw.lng, ne.lng)
};
var demGrid = V.samplesToGrid(dem.samples, demGeo, dem.box, dem.n);
var indexed = V.gridFrom({
  n: dem.n, minX: dem.box.minX, minY: dem.box.minY, maxX: dem.box.maxX, maxY: dem.box.maxY,
  z: function (ix, iy) { return dem.samples[iy * dem.n + ix].meters * 3.280839895; },
  source: 'usgs-3dep'
});
function neighborStep(grid) {
  var step = 0, j, i, d;
  for (j = 0; j < grid.n; j++) for (i = 0; i < grid.n; i++) {
    if (i + 1 < grid.n) { d = Math.abs(grid.z[j][i + 1] - grid.z[j][i]); if (d > step) step = d; }
    if (j + 1 < grid.n) { d = Math.abs(grid.z[j + 1][i] - grid.z[j][i]); if (d > step) step = d; }
  }
  return step;
}
check(neighborStep(indexed) > 40 && neighborStep(demGrid) < 20, 'placing samples by location removes the false ridge');
var demCivil = V.civilOf(scene, demGrid);
function padSlope(list, key) {
  var pi;
  for (pi = 0; pi < list.length; pi++) if (list[pi].key === key) return list[pi].slopePct;
  return null;
}
function riseRun(grid, x, y, w, d) {
  var hw = w / 2, hd = d / 2, pts = [[x - hw, y - hd], [x + hw, y - hd], [x + hw, y + hd], [x - hw, y + hd], [x, y]];
  var vals = [], pi;
  for (pi = 0; pi < pts.length; pi++) vals.push(V.elevAt(grid, pts[pi][0], pts[pi][1]));
  return (Math.max.apply(null, vals) - Math.min.apply(null, vals)) / Math.sqrt(w * w + d * d) * 100;
}
near(padSlope(demCivil.pads, 'array'), 12.27, 0.05, 'the array is 12.3% once each sample sits on its own point');
near(padSlope(demCivil.pads, 'bess'), 11.78, 0.05, 'the battery pad is 11.8% on the same samples');
near(padSlope(demCivil.pads, 'array'), riseRun(demGrid, 210, 140, 420, 280), 1e-6, 'the array percent is the USGS rise over the diagonal');
near(padSlope(demCivil.pads, 'bess'), riseRun(demGrid, 48, 36, 28, 10), 1e-6, 'the battery percent is the USGS rise over its diagonal');
near(demCivil.slopePct, 12.27, 0.05, 'the parcel slope is that same rise over run');

var flatPick = V.gridFrom({
  n: 2, minX: -40, minY: -40, maxX: 460, maxY: 320,
  z: function () { return 1000; }, source: 'usgs-3dep', datum: 1000
});
var pickScene = V.compose(scene, flatPick, sunFlat, { exag: 1, yard: { x: 400, y: 250, label: 'RUPPERS' } });
function meshHit(target, point, id) {
  var cam = { target: target, yaw: 0.15, pitch: 1.15, radius: 40, fovy: Math.PI / 4 };
  var scr = V.projectPoint(cam, 1.2, 800, 640, point);
  var hit = V.pickMesh(pickScene, cam, 1.2, 800, 640, scr.x, scr.y);
  check(hit && hit.id === id, id + ' is picked from its mesh');
}
meshHit({ x: 48, y: 8, z: 36 }, [48, 9.7, 36], 'e_bess');
meshHit({ x: 78, y: 6, z: 36 }, [78, 8.4, 36], 'e_pcs');
meshHit({ x: 36, y: 6, z: 18 }, [36, 8.6, 18], 'e_xfmr');
meshHit({ x: 345, y: 10, z: 207 }, [345, 18, 207], 'e_bldg');
meshHit({ x: 12, y: 2, z: 24 }, [12, 0.4, 24], 'e_conduit');
meshHit({ x: 400, y: 10, z: 250 }, [400, 12, 250], 'grid-sub');
var row = scene.tables[40];
var rowCam = { target: { x: row.x, y: 4, z: row.y }, yaw: 0.15, pitch: 1.15, radius: 40, fovy: Math.PI / 4 };
var rowScr = V.projectPoint(rowCam, 1.2, 800, 640, [row.x, 3, row.y]);
var rowHit = V.pickMesh(pickScene, rowCam, 1.2, 800, 640, rowScr.x, rowScr.y);
check(rowHit && rowHit.id === 'e_array' && rowHit.part.indexOf('#') > 0, 'one array row is picked on its own');
var emptyCam = { target: { x: 210, y: 0, z: -80 }, yaw: 0, pitch: 1.2, radius: 50, fovy: Math.PI / 4 };
var emptyScr = V.projectPoint(emptyCam, 1.2, 800, 640, [210, 0, -80]);
check(V.pickMesh(pickScene, emptyCam, 1.2, 800, 640, emptyScr.x, emptyScr.y) === null, 'empty ground is not a component');

/* The 3D view is the plan, not its mirror (Tommy, 2026-10-20: "its like reversed"):
   the world is east, up, north, and from every side the screen keeps the map's hand. */
(function () {
  function at(yaw) {
    var cam = { target: { x: 0, y: 0, z: 0 }, yaw: yaw, pitch: 0.6, radius: 500, fovy: Math.PI / 4, near: 1, far: 20000 };
    function P(p) { return V.projectPoint(cam, 1.6, 1600, 1000, p); }
    return { E: P([100, 0, 0]), W: P([-100, 0, 0]), N: P([0, 0, 100]), S: P([0, 0, -100]) };
  }
  var s0 = at(0), e90 = at(Math.PI / 2), n180 = at(Math.PI), w270 = at(-Math.PI / 2);
  check(s0.E.x > s0.W.x && s0.N.y < s0.S.y, 'from the south, east is on the right and north is ahead');
  check(e90.N.x > e90.S.x, 'from the east, north is on the right');
  check(n180.W.x > n180.E.x, 'from the north, west is on the right');
  check(w270.S.x > w270.N.x, 'from the west, south is on the right');
})();
console.log('teditorv23d: ' + n + ' checks passed');
