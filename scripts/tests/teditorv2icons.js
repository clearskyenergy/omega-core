/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * View › Icons (omega-editor-v2-icons.js; Tommy, 2026-10-21: "a function
 * that puts the icons or images of the units like we had in the first
 * editor"). The pictures are Site Map's own: omega-equipment-icons.js is
 * written from editor.html's ICONS by scripts/build-equipment-icons.js and
 * must match it; every kind a build or the ribbon places has its icon; the
 * icon sits on the middle of the unit's box at the box's size on screen
 * (22 to 72 px), once its picture has loaded.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var child = require('child_process');
global.window = global;
var ROOT = path.join(__dirname, '..', '..');

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }

/* 1. the copy is Site Map's library, as editor.html has it today */
var built = child.spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-equipment-icons.js'), '--check'], { encoding: 'utf8' });
check(built.status === 0, 'omega-equipment-icons.js matches editor.html\'s ICONS: ' + (built.stderr || built.stdout).trim());
require('../../omega-equipment-icons.js');
var LIB = global.OmegaEquipmentIcons;
check(LIB.keys().length >= 30 && /^<svg /.test(LIB.SVG.bess) && /^<svg /.test(LIB.SVG.charger) && /^<svg /.test(LIB.SVG.util_poi), 'its ' + LIB.keys().length + ' icons are SVG, the BESS, the charger and the utility pole among them');

/* a stand-in for the browser's Image */
var made = [];
global.Image = function () { this.onload = null; this.src = ''; made.push(this); };
require('../../omega-editor-v2-icons.js');
var I = global.OmegaEditorV2Icons;

/* 2. every kind a build or the ribbon places has its own icon */
var placed = fs.readFileSync(path.join(ROOT, 'api/_lib/guided-build.js'), 'utf8').match(/key: *'([a-z_-]+)'/g).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
var ribbon = (fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8').match(/data-equip="([a-z_-]+)"/g) || []).map(function (s) { return /"([^"]+)"/.exec(s)[1]; });
placed.concat(ribbon).filter(function (k, i, a) { return a.indexOf(k) === i; }).forEach(function (k) {
  var id = I.iconOf({ key: k });
  check(id !== 'jbox' && LIB.SVG[id], k + ' has Site Map\'s icon "' + id + '"');
});
check(I.iconOf({ key: 'bess' }) === 'bess' && I.iconOf({ key: 'transformer' }) === 'xfmr' && I.iconOf({ key: 'poi' }) === 'util_poi' && I.iconOf({ key: 'charger' }) === 'charger', 'the BESS, a transformer, the point of interconnection and a charger are Site Map\'s');
check(I.iconOf({ key: '', label: 'DCFC 3' }) === 'charger' && I.iconOf({ key: 'mystery' }) === 'jbox', 'a unit is read by its name when its key is unknown, else a junction box');

/* 3. the size: the box on screen, between 22 and 72 px */
check(I.size({ w: 28, h: 10 }, 3) === 30, 'a 28 by 10 ft BESS at 3 px a foot: a 30 px icon');
check(I.size({ w: 4, h: 3 }, 3) === 22 && I.size({ w: 60, h: 60 }, 3) === 72, 'never under 22 px or over 72 px');

/* 4. drawn on the middle of the box, once the picture has loaded */
var calls = [], ctx = { drawImage: function () { calls.push([].slice.call(arguments, 1)); } }, ready = 0;
var e = { key: 'bess', x: 0, y: 0, w: 28, h: 10, rot: 30 };
check(I.draw(ctx, e, { x: 300, y: 200 }, 3, function () { ready++; }) === false && calls.length === 0, 'nothing is drawn before the picture loads');
var img = made[made.length - 1];
check(/^data:image\/svg\+xml;charset=utf-8,/.test(img.src) && decodeURIComponent(img.src).indexOf('<svg width="128" height="128"') > 0, 'the picture is Site Map\'s SVG, drawn large enough to stay sharp');
img.onload();
check(ready === 1, 'the drawing is asked to repaint when it loads');
check(I.draw(ctx, e, { x: 300, y: 200 }, 3) === true && JSON.stringify(calls[0]) === JSON.stringify([285, 185, 30, 30]), 'then the 30 px icon sits on the middle of the box, upright: ' + JSON.stringify(calls[0]));
check(I.draw(ctx, { key: 'bess', w: 0, h: 10 }, { x: 0, y: 0 }, 3) === false, 'a unit with no size gets no icon');

/* 5. the page: Icons in View, the library before the drawing before the editor */
var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
check(/data-act="icons" aria-pressed="false"[^>]*>Icons</.test(page), 'View has an Icons switch, off until it is pressed');
var a = page.indexOf('omega-equipment-icons.js'), b = page.indexOf('omega-editor-v2-icons.js'), c = page.indexOf('omega-editor-v2-app.js');
check(a > 0 && a < b && b < c, 'the icon library loads before the icons, and both before the editor');

console.log('teditorv2icons: ' + n + ' checks passed');
