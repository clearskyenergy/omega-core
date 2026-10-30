/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The buildings already on the lot (omega-editor-v2-buildings.js; Tommy,
 * 2026-10-21: "generate on the parcel for the address the building … useful
 * especially for the 3d"). FEMA's USA Structures answer is read as it
 * comes (the 51st Avenue warehouse's own record: 8.85 m, Industrial ·
 * Light, NGA), OpenStreetMap's when FEMA has none; only the buildings whose
 * middle is on the lot; each an obstruction in feet from the site point,
 * never twice; and 3D stands it at its source's height.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
global.window = global;
var ROOT = path.join(__dirname, '..', '..');
var G = require('../../omega-editor-v2-geom.js');
require('../../omega-editor-v2-doc.js');
var B = require('../../omega-editor-v2-buildings.js');
var V3 = require('../../omega-editor-v2-3d.js');

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }

var anchor = { lat: 33.4387666, lng: -112.1706532 };
function sq(lat, lng, ft) {
  var d = ft / 2 / 364000, e = d / Math.cos(lat * Math.PI / 180);
  return [[lng - e, lat - d], [lng + e, lat - d], [lng + e, lat + d], [lng - e, lat + d], [lng - e, lat - d]];
}
/* the shape FEMA's query answers (outSR 4326), from the warehouse's record */
var fema = { features: [
  { attributes: { OBJECTID: 2146536, BUILD_ID: 11511792, OCC_CLS: 'Industrial', PRIM_OCC: 'Light', HEIGHT: 8.85, SQFEET: 95934.73, SOURCE: 'NGA', PROD_DATE: 1412467200000, IMAGE_DATE: null },
    geometry: { rings: [sq(anchor.lat, anchor.lng, 300)] } },
  { attributes: { OBJECTID: 9, BUILD_ID: 9, OCC_CLS: 'Commercial', PRIM_OCC: 'Unclassified', HEIGHT: null, SQFEET: 1200, SOURCE: 'ORNL' },
    geometry: { rings: [sq(anchor.lat + 0.0030, anchor.lng, 40)] } }
] };

/* 1. FEMA's record, as it says */
var f = B.parseFema(fema);
check(f.length === 2, 'both footprints are read');
check(f[0].heightFt === 29 && f[0].use === 'Industrial · Light' && f[0].areaSqFt === 95935 && f[0].source === 'FEMA USA Structures (NGA)' && f[0].year === 2014,
  'the warehouse: 8.85 m is 29 ft, Industrial · Light, 95,935 sq ft, NGA, 2014: ' + JSON.stringify(f[0]));
check(f[1].heightFt === null && f[1].use === 'Commercial', 'a record with no height has none (never a guess), and "Unclassified" is left out');
check(f[0].ring[0].length === 2 && Math.abs(f[0].ring[0][0] - anchor.lat) < 0.001, 'rings come back as [lat, lng]');
check(B.parseFema({ error: { code: 400 } }).length === 0 && B.parseFema(null).length === 0, 'an error or nothing reads as no buildings');

/* 2. OpenStreetMap's, when FEMA has none */
var osm = B.parseOsm({ elements: [
  { id: 1, tags: { building: 'warehouse', height: '12' }, geometry: sq(anchor.lat, anchor.lng, 100).map(function (p) { return { lat: p[1], lon: p[0] }; }) },
  { id: 2, tags: { building: 'yes', 'building:levels': '3' }, geometry: sq(anchor.lat, anchor.lng, 60).map(function (p) { return { lat: p[1], lon: p[0] }; }) },
  { id: 3, tags: { building: 'yes' }, geometry: sq(anchor.lat, anchor.lng, 50).map(function (p) { return { lat: p[1], lon: p[0] }; }) }
] });
check(osm[0].heightFt === 39.4 && osm[0].use === 'warehouse' && osm[0].source === 'OpenStreetMap', 'a height tag in metres: 12 m is 39.4 ft');
check(osm[1].heightFt === 31.5 && osm[1].heightFrom === 'levels', 'three levels at 3.2 m: 31.5 ft, and it says it came from the levels');
check(osm[2].heightFt === null && osm[2].use === null, 'no height and a plain "yes": nothing invented');

/* 3. only the buildings whose middle is on the lot */
var lot = sq(anchor.lat, anchor.lng, 600).map(function (p) { return [p[1], p[0]]; });
var on = B.onLot(f, lot);
check(on.length === 1 && on[0].id === 'fema:11511792', 'the neighbour 1,000 ft north is not on the lot');

/* 4. obstructions in feet from the site point, never twice */
var ents = B.toEntities(on, anchor, []);
check(ents.length === 1 && ents[0].type === 'obstruction' && ents[0].layer === 'obstruction' && ents[0].closed === true && ents[0].label === 'Building', 'the warehouse becomes an obstruction');
var xs = ents[0].pts.map(function (p) { return p.x; }), ys = ents[0].pts.map(function (p) { return p.y; });
check(ents[0].pts.length === 4 && Math.abs(Math.max.apply(null, xs) - 150) < 1 && Math.abs(Math.min.apply(null, ys) + 150) < 1, 'its corners are 150 ft either side of the site point, the closing point dropped');
check(ents[0].building.heightFt === 29 && ents[0].building.source === 'FEMA USA Structures (NGA)' && ents[0].building.id === 'fema:11511792', 'it carries what its source said');
check(B.toEntities(on, anchor, ents).length === 0, 'found again, it is not added twice');
var drawn = [{ type: 'obstruction', pts: [{ x: -200, y: -200 }, { x: 200, y: -200 }, { x: 200, y: 200 }, { x: -200, y: 200 }] }];
check(B.toEntities(on, anchor, drawn).length === 0, 'an obstruction already drawn over it stands for it');

/* 5. what the status bar says */
var said = B.describe(on, 'FEMA USA Structures');
check(/^Found 1 building on the lot \(FEMA USA Structures, 2014\): industrial · light, 29 ft tall\. It is an obstruction now/.test(said), said);
check(/^No building footprints on this lot/.test(B.describe([], null)), 'none: it says so and says how to draw one');
check(/1 without a height, shown at the default in 3D/.test(B.describe(f, 'FEMA USA Structures')), 'a footprint with no height is named as such');

/* 6. the query: the lot's box, west-south-east-north, in degrees */
var u = B.femaUrl({ s: 33.43, w: -112.18, n: 33.44, e: -112.16 });
check(/USA_Structures_View\/FeatureServer\/0\/query\?/.test(u) && u.indexOf(encodeURIComponent('-112.18,33.43,-112.16,33.44')) > 0 && /outSR=4326/.test(u) && /returnGeometry=true/.test(u), 'FEMA is asked for the lot\'s box');

/* 7. 3D stands it at its height */
var doc = { name: 'Check', anchor: anchor, entities: [ents[0], { id: 'o2', type: 'obstruction', layer: 'obstruction', closed: true, pts: [{ x: 300, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 20 }, { x: 300, y: 20 }] }], layers: [] };
ents[0].id = 'b1';
var scene = V3.sceneOf(doc), prisms = scene.prisms || [];
var b1 = prisms.filter(function (p) { return p.id === 'b1'; })[0], o2 = prisms.filter(function (p) { return p.id === 'o2'; })[0];
check(b1 && b1.h === 29 && /^Building · Industrial · Light$/.test(b1.label), 'the warehouse stands 29 ft in 3D, named for its use: ' + JSON.stringify(b1 && { h: b1.h, label: b1.label }));
check(o2 && o2.h === 12, 'a hand-drawn obstruction keeps the default it always had');

/* 8. the page: the Site tab's button, the script before the editor */
var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
check(page.indexOf('id="site-buildings"') > 0 && page.indexOf('omega-editor-v2-buildings.js') > 0 && page.indexOf('omega-editor-v2-buildings.js') < page.indexOf('omega-editor-v2-app.js'), 'the Site tab has Find buildings, and the script loads before the editor');

console.log('teditorv2buildings: ' + n + ' checks passed');
