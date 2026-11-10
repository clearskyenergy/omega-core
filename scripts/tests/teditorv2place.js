/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Where a guided build lands (omega-editor-v2-build.js situate). The planner
 * lays a build out from one point; on a drawn lot that point sat under the
 * array tables, so a placed build read as nothing (Tommy, 2026-10-20: "i go
 * to click it and nothings on to place"). The plan is moved, whole, to the
 * first clear ground on the lot, else just beside it. Uses the REAL planner
 * (api/_lib/guided-build.js) on a lot like the sample site.
 */
'use strict';
var assert = require('assert');
global.window = global;
var G = require('../../omega-editor-v2-geom.js');
require('../../omega-editor-v2-assign.js');
var D = require('../../omega-editor-v2-doc.js');
var Bld = require('../../omega-editor-v2-build.js');
var GB = require('../../api/_lib/guided-build.js');

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }

function lot(w, h, fill) {
  var doc = D.create({ name: 'Place check', anchor: { lat: 33.306, lng: -112.074 } });
  var parcel = { id: D.uid('e'), type: 'polygon', layer: 'site', closed: true, pts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] };
  doc.entities.push(parcel);
  if (fill) doc.entities.push({ id: D.uid('e'), type: 'array', layer: 'array', boundaryId: parcel.id, mount: 'fixed-ground', setbackFt: fill });
  return { doc: doc, parcel: parcel };
}
function boxes(doc, skipIds) {
  var out = [], i, j, e, lay;
  for (i = 0; i < doc.entities.length; i++) {
    e = doc.entities[i];
    if (skipIds[e.id]) continue;
    if (e.type === 'array') {
      lay = D.arrayLayout(doc, e);
      for (j = 0; lay.ok && j < lay.tables.length; j++) out.push({ minX: lay.tables[j].x, minY: lay.tables[j].y, maxX: lay.tables[j].x + lay.tables[j].w, maxY: lay.tables[j].y + lay.tables[j].h });
    } else if (e.type === 'equip' || e.type === 'obstruction') out.push(G.boundsOf(e));
  }
  return out;
}
function overlap(a, b) { return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY; }
function placeBess(doc) {
  var site = Bld.contextOf(doc, 6);
  var plan = GB.plan('bess', { mode: 'btm', kw: 1000, hours: 2, origin: site.origin, pxPerFt: 6 });
  check(plan.ok && plan.equipment.length >= 4, 'the real planner lays a BESS build out');
  var before = JSON.stringify(plan.equipment.map(function (e) { return [e.x, e.y]; }));
  var where = Bld.situate(doc, plan, site);
  var state = D.createState(doc);
  var placed = Bld.place(state, plan);
  return { site: site, plan: plan, where: where, state: state, placed: placed, before: before };
}

/* 1. The sample: a 420 × 280 ft lot full of tables, an obstruction, gear in the corner. */
var s = lot(420, 280, 15);
s.doc.entities.push({ id: D.uid('e'), type: 'obstruction', layer: 'obstruction', closed: true, pts: [{ x: 300, y: 170 }, { x: 390, y: 170 }, { x: 390, y: 245 }, { x: 300, y: 245 }] });
s.doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'bess', label: 'BESS', x: 48, y: 36, w: 28, h: 10, rot: 0, kw: 500, kwh: 1000 });
s.doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'pcs', label: 'PCS', x: 78, y: 36, w: 8, h: 4, rot: 0, kw: 250 });
var tablesBefore = D.arrayLayout(s.doc, s.doc.entities[1]).tables.length;
var r1 = placeBess(s.doc);
var newIds = {}; r1.placed.ids.forEach(function (id) { newIds[id] = 1; });
var placedBoxes = r1.state.doc.entities.filter(function (e) { return newIds[e.id] && e.type === 'equip'; }).map(function (e) { return G.boundsOf(e); });
var others = boxes(r1.state.doc, newIds);
var clash = 0;
placedBoxes.forEach(function (a) { others.forEach(function (b) { if (overlap(a, b)) clash++; }); });
check(r1.placed.ok && placedBoxes.length >= 4, 'the build is placed');
check(clash === 0, 'nothing it places sits on a table, the obstruction or the gear already there: ' + clash + ' overlaps');
var ring = G.ringOf(s.parcel), onLot = placedBoxes.every(function (b) { return G.pointInPoly(b.minX, b.minY, ring) && G.pointInPoly(b.maxX, b.maxY, ring); });
var beside = placedBoxes.every(function (b) { return b.minX >= 420 + 20; });
check(onLot || (r1.where.onLot === false && beside), 'it is on clear ground on the lot, or just beside the lot and says so: onLot=' + r1.where.onLot);
check(D.arrayLayout(r1.state.doc, r1.state.doc.entities[1]).tables.length === tablesBefore, 'the array keeps every table');
var conduitsInside = r1.state.doc.entities.filter(function (e) { return newIds[e.id] && e.type === 'conduit'; }).every(function (c) {
  return c.pts.every(function (p) { return placedBoxes.some(function (b) { return p.x >= b.minX - 8 && p.x <= b.maxX + 8 && p.y >= b.minY - 8 && p.y <= b.maxY + 8; }); });
});
check(conduitsInside, 'the conduit moved with its gear');
check(r1.placed.ids.length > 0 && r1.state.selection.join() === r1.placed.ids.join(), 'the placed build is selected');

/* 2. An open lot: the build lands on the lot, clear of the lot line. */
var o = lot(300, 200, 0);
var r2 = placeBess(o.doc);
var b2 = r2.state.doc.entities.filter(function (e) { return e.type === 'equip'; }).map(function (e) { return G.boundsOf(e); });
check(r2.where.onLot === true && b2.every(function (b) { return b.minX >= 0 && b.maxX <= 300 && b.minY >= 0 && b.maxY <= 200; }), 'on an open lot it stays inside the lot line');

/* 3. A lot with no room: beside it, never under the tables. */
var full = lot(150, 60, 2);
var r3 = placeBess(full.doc);
var b3 = r3.state.doc.entities.filter(function (e) { return e.type === 'equip'; }).map(function (e) { return G.boundsOf(e); });
check(r3.where.onLot === false && b3.every(function (b) { return b.minX >= 150 + 20; }), 'a full lot puts it just beside the lot and says so');

/* 4. A second build does not land on the first. */
var r4 = placeBess(r2.state.doc);
var first = {}; r2.placed.ids.forEach(function (id) { first[id] = 1; });
var second = {}; r4.placed.ids.forEach(function (id) { second[id] = 1; });
var a4 = r4.state.doc.entities.filter(function (e) { return second[e.id] && e.type === 'equip'; }).map(function (e) { return G.boundsOf(e); });
var f4 = r4.state.doc.entities.filter(function (e) { return first[e.id] && e.type === 'equip'; }).map(function (e) { return G.boundsOf(e); });
var c4 = 0; a4.forEach(function (a) { f4.forEach(function (b) { if (overlap(a, b)) c4++; }); });
check(c4 === 0, 'a second build lands clear of the first');

/* 5. An array the plan lays is its boundary's and never moves. */
var plan5 = { ok: true, builder: 'autolayout', equipment: [{ type: 'array', layer: 'array', boundaryId: o.parcel.id, mount: 'fixed-ground' }], conduits: [], notes: [] };
var w5 = Bld.situate(o.doc, plan5, Bld.contextOf(o.doc, 6));
check(w5.moved === false && plan5.equipment[0].boundaryId === o.parcel.id && plan5.equipment[0].x === undefined, 'an Auto layout array stays bound to its boundary');

/* 6. Where the person is looking: the clear ground nearest the middle of
   the view (site.prefer), not always the lot's south-west corner. */
function centreOf(doc, ids) {
  var want = {}; ids.forEach(function (id) { want[id] = 1; });
  var bs = doc.entities.filter(function (e) { return want[e.id] && e.type === 'equip'; }).map(function (e) { return G.boundsOf(e); });
  var minX = Math.min.apply(null, bs.map(function (b) { return b.minX; })), maxX = Math.max.apply(null, bs.map(function (b) { return b.maxX; }));
  var minY = Math.min.apply(null, bs.map(function (b) { return b.minY; })), maxY = Math.max.apply(null, bs.map(function (b) { return b.maxY; }));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, inside: bs.every(function (b) { return b.minX >= 0 && b.maxX <= 600 && b.minY >= 0 && b.maxY <= 400; }) };
}
function placeLooking(prefer) {
  var l = lot(600, 400, 0), site = Bld.contextOf(l.doc, 6);
  if (prefer) site.prefer = prefer;
  var plan = GB.plan('bess', { mode: 'btm', kw: 1000, hours: 2, origin: site.origin, pxPerFt: 6 });
  Bld.situate(l.doc, plan, site);
  var st = D.createState(l.doc), placed = Bld.place(st, plan);
  return centreOf(st.doc, placed.ids);
}
var plain = placeLooking(null), ne = placeLooking({ x: 520, y: 330 }), mid = placeLooking({ x: 300, y: 200 });
function dist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
check(plain.inside && ne.inside && mid.inside, 'every placement stays inside the lot line');
check(dist(ne, { x: 520, y: 330 }) < dist(plain, { x: 520, y: 330 }) - 150, 'looking at the north-east corner puts it there: ' + JSON.stringify({ ne: ne, plain: plain }));
check(dist(mid, { x: 300, y: 200 }) < 80, 'looking at the middle of the lot puts it in the middle: ' + JSON.stringify(mid));

/* 7. In hand (Tommy, 2026-10-21: "it is just auto placing it, it should
   work almost identical to how the other function does"): the editor holds
   the plan; it moves whole and turns a quarter at a time about its middle,
   the plan itself untouched; what it would stand on is judged by real
   outlines; and it goes down where it was put. */
var h = lot(600, 400, 0), hsite = Bld.contextOf(h.doc, 6);
var hplan = GB.plan('bess', { mode: 'btm', kw: 1000, hours: 2, origin: hsite.origin, pxPerFt: 6 });
Bld.situate(h.doc, hplan, hsite);
var keep = JSON.stringify(hplan), c0 = Bld.centreOf(hplan);
check(Bld.movable(hplan) && c0 && c0.w > c0.h, 'a BESS build is a row that can be moved: ' + JSON.stringify(c0));
var moved = Bld.movePlan(hplan, 40, -25, 0);
check(JSON.stringify(hplan) === keep, 'moving makes a copy: the plan is untouched');
check(moved.equipment.every(function (e, i) { return Math.abs(e.x - hplan.equipment[i].x - 40) < 1e-9 && Math.abs(e.y - hplan.equipment[i].y + 25) < 1e-9; }), 'every unit moves by the same 40, -25 ft');
check(moved.conduits.every(function (cd, i) { return cd.pts.every(function (q, k) { return Math.abs(q.x - hplan.conduits[i].pts[k].x - 40) < 1e-9 && Math.abs(q.y - hplan.conduits[i].pts[k].y + 25) < 1e-9; }); }), 'its conduit moves with it');
var turned = Bld.movePlan(hplan, 0, 0, 1), c1 = Bld.centreOf(turned);
check(Math.abs(c1.x - c0.x) < 0.2 && Math.abs(c1.y - c0.y) < 0.2 && Math.abs(c1.w - c0.h) < 0.2 && Math.abs(c1.h - c0.w) < 0.2, 'a quarter turn keeps its middle and stands the row on end: ' + JSON.stringify(c1));
check(turned.equipment.every(function (e) { return e.rot === 90; }), 'each unit is turned 90° with it');
check(turned.equipment.every(function (e) { return Math.round(e.x * 10) === e.x * 10 && Math.round(e.y * 10) === e.y * 10; }), 'a turned unit sits on whole tenths of a foot');
var round = Bld.movePlan(hplan, 0, 0, 4);
check(JSON.stringify(round.equipment.map(function (e) { return [e.x, e.y, e.rot % 360]; })) === JSON.stringify(hplan.equipment.map(function (e) { return [e.x, e.y, e.rot % 360]; })), 'four quarter turns bring it back');
check(Bld.movePlan(hplan, 0, 0, -1).equipment[0].rot === 270, 'a turn the other way is three quarters');
/* standing on something: an L-shaped building claims its walls, not its yard */
var Lbuilding = { id: D.uid('e'), type: 'obstruction', layer: 'obstruction', closed: true, label: 'Building',
  pts: [{ x: 200, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 140 }, { x: 240, y: 140 }, { x: 240, y: 300 }, { x: 200, y: 300 }] };
h.doc.entities.push(Lbuilding);
var unit = function (x, y, w, hh) { return { ok: true, equipment: [{ type: 'equip', key: 'bess', label: 'BESS', x: x, y: y, w: w, h: hh, rot: 0 }], conduits: [], notes: [] }; };
check(Bld.clashes(h.doc, unit(300, 120, 20, 8)) === 1, 'a BESS on the building\'s wing stands on it');
check(Bld.clashes(h.doc, unit(320, 220, 20, 8)) === 0, 'in the yard the L wraps it is clear (its box would have said otherwise)');
check(Bld.clashes(h.doc, unit(200, 200, 20, 8)) === 1 && Bld.clashes(h.doc, unit(191, 200, 20, 8)) === 1, 'half over a wall, or a foot over it, is on it');
check(Bld.clashes(h.doc, unit(190, 200, 20, 8)) === 0, 'touching the wall is not standing on it');
h.doc.entities.push({ id: D.uid('e'), type: 'conduit', layer: 'conduit', pts: [{ x: 0, y: 50 }, { x: 600, y: 50 }] });
check(Bld.clashes(h.doc, unit(100, 50, 20, 8)) === 0, 'conduit under it is not in the way');
var sol = Bld.solids(h.doc);
check(Bld.clashes(h.doc, unit(300, 120, 20, 8), sol) === 1 && sol.length === 1, 'what is in the way is read once and asked again (one building here)');
/* where it goes down: inside the lot, or not */
check(Bld.onLotAll(Bld.movePlan(hplan, 40, 25, 0), hsite.boundary) === true && Bld.onLotAll(moved, hsite.boundary) === false && Bld.onLotAll(Bld.movePlan(hplan, 1000, 0, 0), hsite.boundary) === false,
  'it says when it went down off the lot (25 ft south of a row 10 ft in is over the line)');
var hst = D.createState(h.doc), put = Bld.place(hst, Bld.movePlan(hplan, 40, -25, 1));
var got = hst.doc.entities.filter(function (e) { return put.ids.indexOf(e.id) >= 0 && e.type === 'equip'; });
check(put.ok && got.length === hplan.equipment.length && got.every(function (e) { return e.rot === 90; }) && hst.selection.join() === put.ids.join(), 'put down turned and moved, as one group, selected');

console.log('teditorv2place: ' + n + ' checks passed');
