/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Two pieces of the Design with AI fix (2026-10-03) that are not the planner:
 *
 * 1. THE ARRAY'S KEEP-OUTS ARE TESTED WHOLE. computeGroundLayoutV2's
 *    fitAtAngle refused a table only when one of the table's own corners
 *    fell inside an exclusion, so anything smaller than a table sat under it:
 *    a 20 x 40 ft carport table covered a 14 x 20 ft battery pad without one
 *    corner on it. The autopilot now reserves its equipment pads as
 *    exclusions, so that miss would draw panels over the battery. Cut out of
 *    editor.html: segInBox, boxHitsRing and fitAtAngle with the helpers they
 *    use, run at several azimuths against pads, slivers and touching edges.
 *
 * 2. AN EMPTY OVERPASS ANSWER FROM A FALLBACK IS NOT BELIEVED. osm.ch serves
 *    Switzerland and answers an empty 200 everywhere else; it was the
 *    autopilot's last mirror, and on 780 W Martin Luther King Jr Blvd the
 *    HUD said "0 roads · 0 buildings - no public road nearby" in central Los
 *    Angeles. The autopilot's overpass() is cut out and run on a fake fetch.
 */
'use strict';
var fs = require('fs'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');
var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('ok   ' + name); } else { fail++; console.log('FAIL ' + name); } }

/* ── 1. the array engine ─────────────────────────────────────────────── */
var a0 = src.indexOf('  /* ── geometry ──────────────────────────────────────────────────────── */\n  function bbox(p)');
var a1 = src.indexOf('  /* Candidate azimuths: every polygon edge', a0);
if (a0 < 0 || a1 < 0) { console.log('FAIL the V2 array geometry was not found in editor.html'); process.exit(1); }
var E = new Function(src.slice(a0, a1) + '\nreturn {fitAtAngle:fitAtAngle, boxHitsRing:boxHitsRing, segInBox:segInBox, inPoly:inPoly, bbox:bbox};')();

console.log('the overlap test');
function upright(x0, y0, x1, y1) { var p = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; return { p: p, b: E.bbox(p) }; }
ok(E.boxHitsRing(0, 0, 20, 40, upright(3, 10, 17, 30)), 'a pad wholly under a table (no table corner on it) is a hit - the shipped miss');
ok(E.boxHitsRing(0, 0, 20, 40, upright(-5, -5, 25, 45)), 'a pad bigger than the table, wholly over it, is a hit');
ok(E.boxHitsRing(0, 0, 20, 40, upright(-5, 18, 25, 22)), 'a thin strip right across the table, no corner of either inside the other, is a hit');
ok(!E.boxHitsRing(0, 0, 20, 40, upright(30, 0, 50, 40)), 'a pad beside the table is not');
ok(!E.boxHitsRing(0, 0, 20, 40, upright(20, 0, 40, 40)), 'a pad sharing an edge is not (touching is not covering)');
ok(!E.boxHitsRing(0, 0, 20, 40, upright(20, 40, 30, 50)), 'a pad meeting only at a corner is not');
ok(!E.segInBox(0, 0, 10, 0, 0, 0, 10, 10), 'a segment along an edge is not inside');
ok(E.segInBox(-5, 5, 15, 5, 0, 0, 10, 10), 'a segment straight through is');
ok(!E.segInBox(-5, -5, 15, -5, 0, 0, 10, 10), 'a segment that misses is not');

console.log('\nthe fill, at several azimuths');
/* world-frame overlap of a (possibly rotated) table and a polygon, independently */
function tablePoly(t) {
  var c = Math.cos(t.a), s = Math.sin(t.a), cx = t.x + t.w / 2, cy = t.y + t.h / 2, hw = t.w / 2, hh = t.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (q) { return { x: cx + q[0] * c - q[1] * s, y: cy + q[0] * s + q[1] * c }; });
}
function inside(pt, poly) { return E.inPoly(pt.x, pt.y, poly); }
function cross(a, b, c, d) {
  function o(p, q, r) { var v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0; }
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0 && o(a, b, d) !== 0;
}
function overlaps(P, Q) {
  var i, j;
  for (i = 0; i < P.length; i++) if (inside(P[i], Q)) return true;
  for (i = 0; i < Q.length; i++) if (inside(Q[i], P)) return true;
  for (i = 0; i < P.length; i++) for (j = 0; j < Q.length; j++) if (cross(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length])) return true;
  return false;
}
function shrink(z) {
  var c = z.reduce(function (m, p) { return { x: m.x + p.x / z.length, y: m.y + p.y / z.length }; }, { x: 0, y: 0 });
  return z.map(function (p) { var dx = p.x - c.x, dy = p.y - c.y, L = Math.sqrt(dx * dx + dy * dy) || 1; return { x: p.x - dx / L * 0.01, y: p.y - dy / L * 0.01 }; });
}
/* the corners-only rule this replaced, for the before/after */
function cornersOnly(t, excl) { return tablePoly(t).some(function (c) { return excl.some(function (z) { return inside(c, z); }); }); }

var ppf = 2;
var lot = [{ x: 0, y: 0 }, { x: 320 * ppf, y: 0 }, { x: 320 * ppf, y: 140 * ppf }, { x: 0, y: 140 * ppf }];
function pad(cx, cy, wft, hft) { var w = wft * ppf / 2, h = hft * ppf / 2; return [{ x: cx - w, y: cy - h }, { x: cx + w, y: cy - h }, { x: cx + w, y: cy + h }, { x: cx - w, y: cy + h }]; }
/* a battery pad, a transformer pad and a tiny pedestal, as the autopilot reserves them */
var pads = [pad(160 * ppf, 70 * ppf, 26, 20), pad(100 * ppf, 40 * ppf, 16, 14), pad(230 * ppf, 100 * ppf, 8, 8)];
/* GM_TABLE's own sizes: fixed-ground 20 x 12, carport 20 x 40, tracker-1ax
   6 x 180 (the tracker on a lot deep enough to take its 180 ft rows at
   every azimuth tried; a fill with no tables proves nothing, so each one
   must lay some and lose some to the pads) */
var bigLot = [{ x: 0, y: 0 }, { x: 460 * ppf, y: 0 }, { x: 460 * ppf, y: 460 * ppf }, { x: 0, y: 460 * ppf }];
var bigPads = [pad(230 * ppf, 230 * ppf, 26, 20), pad(150 * ppf, 120 * ppf, 16, 14), pad(330 * ppf, 340 * ppf, 8, 8)];
[['fixed-ground', 20, 12, lot, pads], ['carport', 20, 40, lot, pads], ['tracker-1ax', 6, 180, bigLot, bigPads]].forEach(function (tb) {
  var tw = tb[1] * ppf, th = tb[2] * ppf, pitch = th / 0.4, gap = Math.max(2 * ppf, tw * 0.08), field = tb[3], keep = tb[4];
  if (tb[0] === 'tracker-1ax') pitch = tw / 0.33;   /* the tracker fix: chord is the pitch axis */
  [0, 15, 30, 90, 137].forEach(function (deg) {
    var ang = deg * Math.PI / 180;
    var clear = E.fitAtAngle(field, ang, tw, th, pitch, gap, 0, [], 100000, 0, 0).tables;
    var withPads = E.fitAtAngle(field, ang, tw, th, pitch, gap, 0, keep, 100000, 0, 0).tables;
    /* overlap of the INSIDES: a table that only touches a pad's edge (the
       grid lands on one exactly at 0° and 90°) is not over it */
    var under = withPads.filter(function (t) { var P = tablePoly(t); return keep.some(function (z) { return overlaps(P, shrink(z)); }); });
    ok(clear.length > 0 && withPads.length < clear.length && under.length === 0,
       tb[0] + ' at ' + deg + '°: no table over a reserved pad (' + withPads.length + ' of ' + clear.length + ' tables kept)');
    if (tb[0] === 'carport' && deg === 0) {
      var missed = clear.filter(function (t) { var P = tablePoly(t); return pads.some(function (z) { return overlaps(P, shrink(z)); }) && !cornersOnly(t, pads); });
      ok(missed.length > 0, 'carport at 0°: the corners-only rule would have kept ' + missed.length + ' table(s) over a pad - the miss, reproduced');
    }
  });
});
(function () {
  var tw = 20 * ppf, th = 12 * ppf, pitch = th / 0.4, gap = Math.max(2 * ppf, tw * 0.08);
  var a = E.fitAtAngle(lot, 0, tw, th, pitch, gap, 0, [], 100000, 0, 0).tables.length;
  var far = [pad(-500, -500, 10, 10)];
  var b = E.fitAtAngle(lot, 0, tw, th, pitch, gap, 0, far, 100000, 0, 0).tables.length;
  ok(a === b, 'an exclusion off the lot costs no table (' + a + ' = ' + b + ')');
  var bad = E.fitAtAngle(lot, 0, tw, th, pitch, gap, 0, [[{ x: 1, y: 1 }, { x: 2, y: 2 }]], 100000, 0, 0).tables.length;
  ok(bad === a, 'a degenerate exclusion (two points) is ignored, not a crash');
})();

/* ── 2. the autopilot's overpass() ───────────────────────────────────── */
console.log('\nthe road lookup');
var o0 = src.indexOf("  var OVERPASS = ['https://overpass.kumi.systems/api/interpreter'");
var o1 = src.indexOf("  /* Roads are named 'road <name>'", o0);
if (o0 < 0 || o1 < 0) { console.log('FAIL the autopilot overpass() was not found in editor.html'); process.exit(1); }
function overpassWith(answers) {
  /* answers: per mirror host fragment -> {status, json} | 'reject' | 'hang' */
  var asked = [], timers = [];
  /* The mirror's 9 s timer is held, not run: a mirror that hangs fires its
     own (the last one set, which is set just before its fetch) at once; any
     other answers first, and its timer is never fired. */
  function fakeSetTimeout(fn) { timers.push(fn); return timers.length; }
  function fakeFetch(url) {
    var host = String(url).split('/')[2]; asked.push(host);
    var a = answers[host];
    if (a === 'reject') return Promise.reject(new Error('Failed to fetch'));
    if (a === 'hang') { var fire = timers[timers.length - 1]; setImmediate(fire); return new Promise(function () {}); }
    return Promise.resolve({ ok: a.status === 200, status: a.status, json: function () { return Promise.resolve(a.json); } });
  }
  var f = new Function('fetch', 'setTimeout', 'clearTimeout', 'AbortController',
    src.slice(o0, o1) + '\nreturn overpass;')(fakeFetch, fakeSetTimeout, function () {}, undefined);
  return { run: function () { return f('q'); }, asked: asked };
}
var KUMI = 'overpass.kumi.systems', DE = 'overpass-api.de', CH = 'overpass.osm.ch';
var ROADS = { status: 200, json: { elements: [{ type: 'way', tags: { highway: 'primary' }, geometry: [] }] } };
var EMPTY = { status: 200, json: { elements: [] } };
var cases = [
  ['the 780 W MLK case: first two fail, osm.ch answers empty', (function () { var a = {}; a[KUMI] = 'hang'; a[DE] = 'reject'; a[CH] = EMPTY; return a; })(),
    function (r) { return r.err && /osm\.ch empty/.test(r.err) && /kumi\.systems timeout/.test(r.err); }, 'refused as a failure, naming each mirror'],
  ['the first mirror empty, the second has the roads', (function () { var a = {}; a[KUMI] = EMPTY; a[DE] = ROADS; a[CH] = EMPTY; return a; })(),
    function (r) { return r.els && r.els.length === 1; }, 'an empty answer moves on, and the roads come back'],
  ['every mirror empty, the first among them', (function () { var a = {}; a[KUMI] = EMPTY; a[DE] = EMPTY; a[CH] = EMPTY; return a; })(),
    function (r) { return r.els && r.els.length === 0; }, 'the first mirror\'s empty is believed: no roads, honestly'],
  ['the first mirror fails, the second has the roads', (function () { var a = {}; a[KUMI] = 'reject'; a[DE] = ROADS; a[CH] = EMPTY; return a; })(),
    function (r) { return r.els && r.els.length === 1; }, 'the fallback\'s data is used'],
  ['a busy mirror\'s remark, then data', (function () { var a = {}; a[KUMI] = { status: 200, json: { elements: [], remark: 'runtime error: timeout' } }; a[DE] = ROADS; a[CH] = EMPTY; return a; })(),
    function (r) { return r.els && r.els.length === 1; }, 'a remark is a failure, not an empty block'],
  ['every mirror refuses', (function () { var a = {}; a[KUMI] = { status: 429, json: {} }; a[DE] = { status: 504, json: {} }; a[CH] = 'reject'; return a; })(),
    function (r) { return r.err && /HTTP 429/.test(r.err) && /HTTP 504/.test(r.err); }, 'refused, with each mirror\'s status']
];
var chain = Promise.resolve();
cases.forEach(function (c) {
  chain = chain.then(function () {
    var t = overpassWith(c[1]);
    return t.run().then(function (els) { return { els: els }; }, function (e) { return { err: e.message }; }).then(function (r) {
      ok(c[2](r), c[0] + ': ' + c[3] + (r.err ? ' ("' + r.err + '")' : ' (' + r.els.length + ' element' + (r.els.length === 1 ? '' : 's') + ')'));
    });
  });
});
chain.then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
