/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Omega Maximus's satellite photo is Google's (omega-editor-v2-satellite.js;
 * Tommy, 2026-10-20: "switch to google satellite"), placed under the
 * editor's own view. This holds the camera: the zoom for a scale is the
 * editor's own map scale, the map is magnified by CSS one level at most
 * past the deepest imagery and hands over to Esri past that, and the key is
 * a machine's override first and then config.js, which carries the same
 * browser key as Site Map's built-in default.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
global.window = global;
var ROOT = path.join(__dirname, '..', '..');
var G = require('../../omega-editor-v2-geom.js');
require('../../omega-editor-v2-satellite.js');
var S = global.OmegaEditorV2Satellite;

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

/* 1. the zoom for a scale is the editor's own (geom's, where geom does not clamp) */
[[33.44, 0.5], [33.44, 1.5], [41.86, 2.1], [47.6, 0.9]].forEach(function (c) {
  check(near(S.zoomFor(c[0], c[1]), G.zoomForScale(c[0], c[1]), 1e-9), 'the zoom for ' + c[1] + ' px a foot at ' + c[0] + ' is the editor\'s: ' + S.zoomFor(c[0], c[1]));
});
check(S.zoomFor(33.44, 8) > 20, 'and it does not stop at 20 the way the tile picker does');

/* 2. the camera: to the deepest imagery, then one level of CSS, then Esri */
var at = { lat: 33.4387666, lng: -112.1706532 };
var ppfAt = function (z) { return Math.pow(2, z) * 0.3048 / (156543.03392 * Math.cos(at.lat * Math.PI / 180)); };
var c1 = S.camera(at, ppfAt(19.4), 21);
check(c1.show && near(c1.zoom, 19.4, 1e-9) && c1.scale === 1 && c1.center.lat === at.lat, 'inside the imagery: the zoom as drawn, no magnification');
var c2 = S.camera(at, ppfAt(21.5), 21);
check(c2.show && c2.zoom === 21 && near(c2.scale, Math.SQRT2, 1e-9), 'half a level past it: the deepest level, magnified by √2');
var c3 = S.camera(at, ppfAt(22), 21);
check(c3.show && near(c3.scale, 2, 1e-9), 'one level past it still shows, magnified twice');
var c4 = S.camera(at, ppfAt(22.3), 21);
check(!c4.show, 'further than that Google steps aside and Esri\'s tiles show');
check(!S.camera(at, 0, 21).show && !S.camera({ lat: NaN, lng: 0 }, 1, 21).show, 'a view with no scale or no place shows nothing');

/* 3. the key: a machine's override first, then config.js */
var store = {};
global.localStorage = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); } };
global.CLEARSKY_CONFIG = { googleMapsKey: 'config-key' };
check(S.key() === 'config-key', 'the key comes from config.js');
store.omegaMapsKey = '  machine-key  ';
check(S.key() === 'machine-key', 'Settings › API Keys (omegaMapsKey) overrides it, as on Site Map');
delete store.omegaMapsKey; global.CLEARSKY_CONFIG = {};
check(S.key() === '', 'no key, no Google: the editor keeps Esri');

/* 4. one browser key: config.js carries Site Map's built-in default */
var cfg = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), ed = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var k1 = /googleMapsKey:\s*'([^']+)'/.exec(cfg), k2 = /googleMapsKey:\s*"([^"]+)"/.exec(ed);
check(k1 && k2 && k1[1] === k2[1], 'config.js and Site Map\'s default are the same key; change both or neither');

/* 5. the page loads it, under the drawing, before the editor */
var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
check(page.indexOf('<div id="gsat"') >= 0 && page.indexOf('<div id="gsat"') < page.indexOf('<div id="map"'), 'the photo sits under the Esri tiles and the drawing');
check(page.indexOf('omega-editor-v2-satellite.js') > 0 && page.indexOf('omega-editor-v2-satellite.js') < page.indexOf('omega-editor-v2-app.js'), 'the satellite script loads before the editor');
check(page.indexOf('src="config.js"') > 0 && page.indexOf('src="config.js"') < page.indexOf('omega-editor-v2-satellite.js'), 'after config.js, which carries the key');

console.log('teditorv2satellite: ' + n + ' checks passed');
