/* omega-plot-editable.js — the path grammar the sheets actually emit.

   The incoming converter refused six SVG features, and the sheet generators
   in editor.html emit five of them: 220 rounded rectangles, 12 marker
   references, 10 <use> instances, 9 elliptical arcs, 1 smooth curve. A
   refusal is not a safe default here — the export stops on the first sheet
   that contains one, so "supported" was a much smaller set of drawings than
   it appeared.

   This covers the pure geometry: arcs and rounded corners. Both are the kind
   of wrong that still draws — an arc with a bad centre produces a shape in
   the wrong place rather than an error — so the assertions check positions,
   not just that something came back. The DOM-dependent parts (use, markers,
   images) are exercised by tdrawing-critical.js and by the browser run
   recorded in the validation report. */
const path = require('path');
const fs = require('fs');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.01 : tol); }

const root = {};
new Function('window', fs.readFileSync(
  path.join(__dirname, '..', '..', 'omega-plot-editable.js'), 'utf8'))(root);
const M = root.OmegaEditablePlotPPT;
const I = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };   /* identity CTM */

console.log('elliptical arcs');
/* A quarter circle, r=10, from (10,0) to (0,10). Of the four arcs through
   that pair, sweep=1 is the one centred on the origin, so every point on it
   must satisfy x^2 + y^2 = 100. (sweep=0 is centred on (10,10) and is a
   different, equally valid arc — which is the point of the flags.) */
let segs = M.arcToCubics(10, 0, 10, 10, 0, false, true, 0, 10);
ok(segs.length === 1, 'a 90 degree arc is one cubic');
ok(near(segs[0].x, 0) && near(segs[0].y, 10), 'it ends where the arc ends');
let mid = segs[0];
/* Bezier midpoint at t=0.5 for P0=(10,0). */
let bx = 0.125 * 10 + 0.375 * mid.x1 + 0.375 * mid.x2 + 0.125 * mid.x;
let by = 0.125 * 0 + 0.375 * mid.y1 + 0.375 * mid.y2 + 0.125 * mid.y;
ok(near(Math.hypot(bx, by), 10, 0.02),
   'and its midpoint sits on the circle (r=' + Math.hypot(bx, by).toFixed(4) + ')');

/* Chord 20 with r=10 is exactly a semicircle: 180 degrees, two quadrants. */
ok(M.arcToCubics(0, 0, 10, 10, 0, true, true, 20, 0).length === 2,
   'a semicircle splits into two cubics');
/* Chord 10 with r=10: the minor arc is 60 degrees, so largeArc takes the
   300-degree way round and needs four quadrant segments. */
ok(M.arcToCubics(0, 0, 10, 10, 0, true, true, 10, 0).length === 4,
   'a 300 degree arc splits into four, rather than one badly-bulging cubic');
ok(M.arcToCubics(5, 5, 0, 10, 0, false, false, 9, 9)[0].line === true,
   'a zero radius degenerates to a line, per the SVG spec');
ok(M.arcToCubics(3, 3, 4, 4, 0, false, false, 3, 3).length === 0,
   'an arc that ends where it starts draws nothing');
/* F.6.6: radii too small for the endpoints are scaled up, not left to
   produce NaN. */
let scaled = M.arcToCubics(0, 0, 1, 1, 0, false, true, 20, 0);
ok(scaled.length > 0 && scaled.every(s => isFinite(s.x) && isFinite(s.y)),
   'radii too small for the span are scaled up rather than yielding NaN');
ok(near(scaled[scaled.length - 1].x, 20) && near(scaled[scaled.length - 1].y, 0),
   'and the arc still lands on its endpoint');

/* The two flags are the whole difference between four arcs through the same
   pair of points. If they were ignored, these would coincide. */
function endsBelow(la, sw) {
  const s = M.arcToCubics(0, 0, 10, 10, 0, la, sw, 10, 10);
  const m = s[Math.floor(s.length / 2)];
  return m.y1 > m.x1;
}
ok(endsBelow(false, false) !== endsBelow(false, true), 'the sweep flag changes which way the arc bows');

console.log('\nthe arc command inside a path');
let pts = M.path('M 10 0 A 10 10 0 0 0 0 10', I);
ok(pts.length === 2 && pts[0].moveTo === true, 'M then one converted arc segment');
ok(pts[1].curve && pts[1].curve.type === 'cubic', 'the arc arrives as a cubic');
/* Flags may be written without separators: "a1 1 0 011 1" is legal SVG. */
ok(M.path('M 0 0 a1 1 0 011 1', I).length === 2, 'unseparated arc flags parse');
/* Two semicircles: one moveTo plus two cubics each. */
ok(M.path('M 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0', I).length === 5,
   'consecutive arcs both convert, and the second starts where the first ended');
ok(near(M.path('M 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0', I)[4].x, 20),
   'the pair lands on the final endpoint');

console.log('\nsmooth curves reflect through the current point');
/* S reflects the previous cubic's second control point. After C with c2 at
   (2,2) ending at (3,3), the reflected control is (4,4). */
let sm = M.path('M 0 0 C 1 1 2 2 3 3 S 5 5 6 6', I);
ok(sm.length === 3, 'M, C, S');
ok(near(sm[2].curve.x1, 4) && near(sm[2].curve.y1, 4),
   'S reflects to (4,4), not the current point');
/* An S with no preceding cubic sits its first control on the current point. */
let s0 = M.path('M 1 1 S 5 5 6 6', I);
ok(near(s0[1].curve.x1, 1) && near(s0[1].curve.y1, 1),
   'a leading S puts the first control on the current point');
let tq = M.path('M 0 0 Q 1 1 2 2 T 4 4', I);
ok(tq[2].curve.type === 'quadratic' && near(tq[2].curve.x1, 3) && near(tq[2].curve.y1, 3),
   'T reflects the previous quadratic control to (3,3)');

/* Reflection happens in user space, before the CTM. Under a 2x scale the
   reflected control must be 2x the user-space answer, not a reflection of
   already-scaled numbers. */
let scaledCtm = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
let sr = M.path('M 0 0 C 1 1 2 2 3 3 S 5 5 6 6', scaledCtm);
ok(near(sr[2].curve.x1, 8) && near(sr[2].curve.y1, 8),
   'the reflection is computed in user space, then transformed');

console.log('\nrounded rectangles');
ok(/^M 12 10 /.test(M.roundRectPath(10, 10, 100, 50, 2, 2)),
   'the path starts after the first corner radius');
ok((M.roundRectPath(10, 10, 100, 50, 2, 2).match(/A /g) || []).length === 4,
   'four corners, four arcs');
ok(!/A /.test(M.roundRectPath(10, 10, 100, 50, 0, 0)),
   'a zero radius stays a plain rectangle');
/* SVG 1.1 §9.2: a missing rx takes ry, and radii clamp to half the side. */
ok(M.roundRectPath(0, 0, 100, 50, null, 6) === M.roundRectPath(0, 0, 100, 50, 6, 6),
   'a missing rx is filled in from ry');
ok(M.roundRectPath(0, 0, 100, 50, 6, null) === M.roundRectPath(0, 0, 100, 50, 6, 6),
   'and a missing ry from rx');
ok(M.roundRectPath(0, 0, 10, 10, 999, 999) === M.roundRectPath(0, 0, 10, 10, 5, 5),
   'radii clamp to half the side rather than inverting the corner');
let rr = M.path(M.roundRectPath(0, 0, 100, 50, 8, 8), I);
ok(rr.every(v => v.close || (isFinite(v.x) && isFinite(v.y))),
   'a rounded rect round-trips through the path grammar with finite points');
ok(rr.some(v => v.close), 'and closes');

console.log('\nstill refused, because nothing emits them');
let refused = 0;
try { M.path('M 0 0 B 1 1', I); } catch (e) { refused++; ok(/Unsupported path command/.test(e.message), 'an unknown command still stops the export'); }
ok(refused === 1, 'and it throws rather than returning a short path');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
