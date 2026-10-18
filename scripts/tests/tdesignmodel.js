/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The design model is rebuilt from the drawing. A guided build's chain
 * is the one-line. A detail the older permit set invented is a gap.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');

require(path.join(ROOT, 'omega-editor-v2-geom.js'));
require(path.join(ROOT, 'omega-editor-v2-doc.js'));
require(path.join(ROOT, 'omega-editor-v2-build.js'));
require(path.join(ROOT, 'omega-editor-v2-design.js'));

var D = global.OmegaEditorV2Doc;
var G = global.OmegaEditorV2Geom;
var Build = global.OmegaEditorV2Build;
var Design = global.OmegaEditorV2Design;
var GB = require(path.join(ROOT, 'api/_lib/guided-build.js'));

var n = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  n++;
}
function byRole(model) {
  var out = {}, i, e;
  for (i = 0; i < model.equipment.length; i++) {
    e = model.equipment[i];
    if (!out[e.role]) out[e.role] = e;
  }
  return out;
}
function gap(model, id) {
  var i;
  for (i = 0; i < model.parity.length; i++) if (model.parity[i].id === id) return model.parity[i];
  return null;
}

var doc = D.create({ name: 'Chain', address: '1 Test', anchor: { lat: 33.3, lng: -112.07 } });
doc.entities.push({
  id: 'parcel', type: 'polygon', layer: 'site', closed: true,
  pts: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 250 }, { x: 0, y: 250 }]
});
var state = D.createState(doc);
var plan = GB.plan('bess', { mode: 'btm', kw: 1000, hours: 2, origin: { x: 40, y: 40 } });
check(plan.ok, 'the behind-the-meter build plans');
var placed = Build.place(state, plan);
check(placed.ok, 'the build places');
var model = Design.fromDoc(state.doc);

check(model.schema === 'omega.design/1', 'schema omega.design/1');
check(model.equipment.map(function (e) { return e.role; }).join() === 'bess,xfmr,disco,panel,meter,utility', 'behind the meter roles');
check(model.oneLine.wires.map(function (w) { return w.spec; }).join() === 'EV-MAIN,MV-UG,MV-UG,EMT-BMS,EV-FEEDER', 'behind-the-meter raceways');
var roles = byRole(model);
var expect = [['bess', 'xfmr'], ['xfmr', 'disco'], ['disco', 'panel'], ['panel', 'meter'], ['meter', 'utility']];
var wi;
for (wi = 0; wi < expect.length; wi++) {
  check(model.oneLine.wires[wi].fromId === roles[expect[wi][0]].id && model.oneLine.wires[wi].toId === roles[expect[wi][1]].id, 'wire ' + expect[wi][0] + ' to ' + expect[wi][1]);
  check(model.oneLine.wires[wi].kind === 'ac', 'the battery chain is AC');
}
check(model.equipment[0].corners.length === 4, 'corners are the canvas footprint');
check(model.equipment[0].x === plan.equipment[0].x && model.equipment[0].y === plan.equipment[0].y, 'stored x,y are the placement record');
var drawn = G.rectCorners(plan.equipment[0]);
check(model.equipment[0].corners[0].x === drawn[0].x && model.equipment[0].corners[0].y === drawn[0].y, 'corners match rectCorners');
check(model.schedule.equipment.length === 6 && model.schedule.conduits.length === 5, 'the schedule data is the chain');
check(gap(model, 'equipment-footprint').status === 'on-drawing', 'footprints are on the drawing');
check(gap(model, 'one-line').status === 'on-drawing' && gap(model, 'raceway').status === 'on-drawing' && gap(model, 'schedule').status === 'on-drawing', 'the one-line, the raceway, and the schedule data are on the drawing');

var blanks = ['manufacturer', 'model', 'voltage', 'amps', 'strings-kva', 'gauge', 'height', 'signage', 'placards', 'grounding', 'fence', 'demolition', 'structural-pad', 'burial'];
for (wi = 0; wi < blanks.length; wi++) check(gap(model, blanks[wi]).status === 'gap', blanks[wi] + ' is a gap against the older sheets');
check(model.equipment.every(function (e) { return e.mfr == null && e.model == null && e.voltage == null && e.heightFt == null; }), 'no manufacturer, model, voltage, or height is filled in');
check(model.conduits.every(function (c) { return c.gauge == null && c.depthFt == null; }), 'no gauge or burial depth is filled in');
var dumped = JSON.stringify(model);
check(dumped.indexOf('480') < 0 && dumped.indexOf('Great Power') < 0, 'a cover default is not copied into the model');
check(model.parity.every(function (r) { return r.status === 'on-drawing' || r.status === 'partial' || r.status === 'gap'; }), 'parity status is on-drawing, partial, or gap');

/* the map stays the source */
var before = model.equipment.length;
state.doc.entities.push({ id: 'ch', type: 'equip', key: 'charger', level: 'l2', label: 'Level 2', x: 10, y: 10, w: 3, h: 2, kw: 7.7 });
var again = Design.fromDoc(state.doc);
check(again.equipment.length === before + 1 && again.equipment.some(function (e) { return e.role === 'evl2'; }), 'a later edit is in the next reading');
check(model.equipment.length === before && !model.equipment.some(function (e) { return e.role === 'evl2'; }), 'the earlier reading is not rewritten');
var snap = JSON.stringify(state.doc);
var seen = null;
var unsub = Design.subscribe(function (m) { seen = m; });
Design.publish(Design.fromDoc(state.doc));
check(seen && seen.schema === 'omega.design/1' && seen.equipment.length === before + 1, 'publish hands the current drawing to a listener');
check(JSON.stringify(state.doc) === snap, 'publish does not write the model onto the drawing');
unsub();

/* DER: DC into the inverter, AC out */
var derState = D.createState(D.create({ name: 'DER' }));
var der = GB.plan('der', { source: 'pv', mw: 0.5, cols: 1, xfmr: true, origin: { x: 0, y: 0 } });
check(Build.place(derState, der).ok, 'the DER build places');
var derModel = Design.fromDoc(derState.doc);
var derRoles = {};
derModel.oneLine.nodes.forEach(function (node) { derRoles[node.role] = true; });
check(derRoles.dersolar && derRoles.pcs && derRoles.xfmr && derRoles.utility, 'DER nodes are solar, inverter, transformer, collector');
var dc = derModel.oneLine.wires.filter(function (w) { return w.spec === 'RMC-DC'; })[0];
var ac = derModel.oneLine.wires.filter(function (w) { return w.spec === 'RMC-AC'; })[0];
check(dc && dc.kind === 'dc' && dc.fromId && dc.toId, 'the DC leg has two ends');
var dcFrom = derModel.equipment.filter(function (e) { return e.id === dc.fromId; })[0];
var dcTo = derModel.equipment.filter(function (e) { return e.id === dc.toId; })[0];
check(dcFrom.role === 'dersolar' && dcTo.role === 'pcs', 'DC runs from the array block to the inverter');
check(ac && ac.kind === 'ac', 'AC leaves the inverter');

/* an array layout names its module; racking stays partial */
var lay = D.create({ name: 'Array' });
lay.entities.push({
  id: 'parcel', type: 'polygon', layer: 'site', closed: true,
  pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 160 }, { x: 0, y: 160 }]
});
var auto = GB.plan('autolayout', { boundary: lay.entities[0].pts, boundaryId: 'parcel', mount: 'fixed-ground', setbackFt: 10 });
var layState = D.createState(lay);
check(Build.place(layState, auto).ok, 'auto-layout places the array');
var layModel = Design.fromDoc(layState.doc);
check(layModel.arrays.length === 1 && layModel.arrays[0].moduleKey === 'nextnrg-eagle-g7b', 'the array names the module the layout used');
check(gap(layModel, 'module-racking').status === 'partial', 'module and racking is partial');

/* a hand-drawn conduit that meets stored centers still connects */
var hand = D.create({ name: 'Hand' });
hand.entities.push({ id: 'poi', type: 'equip', key: 'poi', x: 12, y: 12, w: 4, h: 4 });
hand.entities.push({ id: 'bess', type: 'equip', key: 'bess', x: 48, y: 36, w: 28, h: 10, kw: 500, kwh: 1000 });
hand.entities.push({ id: 'run', type: 'conduit', spec: 'RMC', pts: [{ x: 12, y: 12 }, { x: 12, y: 36 }, { x: 48, y: 36 }] });
var handModel = Design.fromDoc(hand);
check(handModel.oneLine.wires[0].fromId === 'poi' && handModel.oneLine.wires[0].toId === 'bess', 'a conduit drawn to the stored points still connects');

/* a recorded voltage is copied, and only then */
hand.entities[1].voltage = 208;
hand.entities[1].heightFt = 9;
var stamped = Design.fromDoc(hand);
var batt = stamped.equipment.filter(function (e) { return e.id === 'bess'; })[0];
check(batt.voltage === 208 && batt.heightFt === 9, 'a voltage and a height already on the equipment are kept');
check(gap(stamped, 'voltage').status === 'partial' && gap(stamped, 'height').status === 'partial', 'a stored voltage and height are partial, not a cover default');

var app = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-app.js'), 'utf8');
check(app.indexOf('OmegaEditorV2Design.fromDoc') >= 0, 'the page rebuilds the model from the drawing');
check(app.indexOf("reason: 'build'") >= 0, 'a placed build tells 3D and the drawings why they are being called');
var editor = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
check(editor.indexOf('omega-editor-v2-design') < 0, 'Site Map does not load the design model');

console.log('tdesignmodel: ' + n + ' checks passed');
