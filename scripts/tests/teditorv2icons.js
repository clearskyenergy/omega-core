/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * View › Icons (omega-editor-v2-icons.js; Tommy, 2026-10-20: "a toggle in
 * view that allows us to do icons on the items like for instance the bess
 * … should be a bess container"). Every kind of equipment a guided build or
 * the ribbon places has its own icon; each is drawn inside the piece's own
 * box (its centre, its rotation, its size); a box too small on screen keeps
 * its plain fill; and the BESS is a container: ribbed roof, doors, the
 * cooling unit on the roof. Drawn here into a recording canvas.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
global.window = global;
var ROOT = path.join(__dirname, '..', '..');
require('../../omega-editor-v2-icons.js');
var I = global.OmegaEditorV2Icons;

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }

/* a canvas that records what is drawn */
function recorder() {
  var log = [], m = [];
  function rec(name) { return function () { log.push([name].concat([].slice.call(arguments))); }; }
  var ctx = {
    log: log, lineWidth: 1, strokeStyle: '', fillStyle: '', lineJoin: '', lineCap: '',
    save: function () { m.push(1); log.push(['save']); }, restore: function () { m.pop(); log.push(['restore']); },
    translate: rec('translate'), rotate: rec('rotate'), scale: rec('scale'),
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'), rect: rec('rect'), arc: rec('arc'), closePath: rec('closePath'),
    fill: rec('fill'), stroke: rec('stroke'), setLineDash: rec('setLineDash')
  };
  ctx.depth = function () { return m.length; };
  return ctx;
}
function count(ctx, op) { return ctx.log.filter(function (l) { return l[0] === op; }).length; }

/* 1. every kind a build or the ribbon places has an icon of its own */
var placed = fs.readFileSync(path.join(ROOT, 'api/_lib/guided-build.js'), 'utf8').match(/key: *'([a-z_-]+)'/g).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
var ribbon = (fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8').match(/data-equip="([a-z_-]+)"/g) || []).map(function (s) { return /"([^"]+)"/.exec(s)[1]; });
var keys = placed.concat(ribbon).filter(function (k, i, a) { return a.indexOf(k) === i; });
check(keys.length >= 10, 'the builds and the ribbon place ' + keys.length + ' kinds');
keys.forEach(function (k) { check(I.kindOf({ key: k }) !== 'other', k + ' has its own icon: ' + I.kindOf({ key: k })); });
check(I.kindOf({ key: 'equip', label: 'BESS container' }) === 'bess' && I.kindOf({ key: '', label: 'DCFC 3' }) === 'charger', 'a piece without a known key is read by its name');

/* 2. each icon is drawn, in the piece's own box, and leaves the canvas as it found it */
I.KINDS.forEach(function (kind) {
  var key = kind === 'other' ? 'mystery' : Object.keys({ bess: 1, pcs: 1, transformer: 1, panel: 1, disco: 1, meter: 1, poi: 1, charger: 1, ems: 1, ups: 1, racks: 1, cooling: 1, genset: 1, fuelcell: 1, substation: 1, pv: 1 }).filter(function (k) { return I.kindOf({ key: k }) === kind; })[0];
  var ctx = recorder(), ok = I.draw(ctx, { key: key, x: 10, y: 20, w: 20, h: 8, rot: 30 }, { x: 300, y: 200 }, 4);
  check(ok && count(ctx, 'fill') + count(ctx, 'stroke') >= 2, kind + ' is drawn');
  check(ctx.depth() === 0 && count(ctx, 'save') === count(ctx, 'restore'), kind + ' restores the canvas');
  var t = ctx.log.filter(function (l) { return l[0] === 'translate'; })[0], r = ctx.log.filter(function (l) { return l[0] === 'rotate'; })[0], s = ctx.log.filter(function (l) { return l[0] === 'scale'; })[0];
  check(t[1] === 300 && t[2] === 200 && Math.abs(r[1] + Math.PI / 6) < 1e-9 && s[1] === 4 && s[2] === -4, kind + ' is drawn at the piece\'s centre, turned with it, to its scale');
});

/* 3. too small on screen: the plain box stays */
check(I.draw(recorder(), { key: 'bess', w: 20, h: 8 }, { x: 0, y: 0 }, 0.5) === false, 'a box under 6 px across keeps its plain fill');
check(I.draw(recorder(), { key: 'bess', w: 0, h: 8 }, { x: 0, y: 0 }, 4) === false, 'and a box with no size draws nothing');

/* 4. the BESS is a container: the roof's ribs, two door leaves, the fan */
var b = recorder();
I.draw(b, { key: 'bess', x: 0, y: 0, w: 40, h: 8, rot: 0 }, { x: 0, y: 0 }, 5);
check(count(b, 'moveTo') >= 14, 'a 40 ft container has its ribbed roof: ' + count(b, 'moveTo') + ' strokes');
check(count(b, 'arc') >= 1 && count(b, 'rect') >= 4, 'and its doors, its cooling unit and fan');
var tall = recorder();
I.draw(tall, { key: 'bess', x: 0, y: 0, w: 8, h: 40, rot: 0 }, { x: 0, y: 0 }, 5);
check(tall.log.filter(function (l) { return l[0] === 'rotate'; }).length === 2, 'drawn along its long side whichever way the box is set');

/* 5. the page: the toggle in View, the script before the editor */
var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
check(/data-act="icons" aria-pressed="false"[^>]*>Icons</.test(page), 'View has an Icons switch, off until it is pressed');
check(page.indexOf('omega-editor-v2-icons.js') > 0 && page.indexOf('omega-editor-v2-icons.js') < page.indexOf('omega-editor-v2-app.js'), 'the icons load before the editor');

console.log('teditorv2icons: ' + n + ' checks passed');
