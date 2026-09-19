#!/usr/bin/env node
/* The yard fit study — geometry, against answers worked out by hand.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   This library draws a scaled plan of a stranger's own property and prints a
   unit count next to it. Wrong by six feet still looks right, so every case
   below has a closed-form answer computed independently in the test rather
   than a snapshot of whatever the code said first.

   THE BUG THIS EXISTS TO CATCH, and it was real: the first packing pass used
   clearance only and reported 378 containers on a 3.67-acre lot. Exact, and
   physically absurd — nothing could be delivered, serviced or reached by a
   fire apparatus. `aisle spacing is charged` below is the assertion that
   would have caught it.

   node scripts/test-site-fit.js */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var F = require(path.join(ROOT, 'api', '_lib', 'site-fit.js'));

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}
function near(a, b, tol) { return typeof a === 'number' && Math.abs(a - b) <= (tol || 0.5); }

/* ── A lat/lng square whose local feet we know exactly ─────────────────── */
var LAT = 41.0, LNG = -88.0;
var LAT_FT = 364000, LNG_FT = LAT_FT * Math.cos(LAT * Math.PI / 180);
function ll(xFt, yFt) { return [LAT + yFt / LAT_FT, LNG + xFt / LNG_FT]; }
function square(side) { return [ll(0, 0), ll(side, 0), ll(side, side), ll(0, side)]; }

var UNIT = { model: 'TEST-500', widthFt: 20, depthFt: 8, kw: 250, kwh: 500 };

/* ── 1 · Projection ────────────────────────────────────────────────────── */
var poly = F.toLocal(square(400), { lat: LAT, lng: LNG });
ok('projection puts the first corner at the origin', near(poly[0].x, 0) && near(poly[0].y, 0), poly[0]);
ok('projection recovers 400 ft east', near(poly[1].x, 400, 0.6), poly[1].x);
ok('projection recovers 400 ft north', near(poly[2].y, 400, 0.6), poly[2].y);
ok('area is side squared', near(F.areaFt2(poly), 160000, 200), F.areaFt2(poly));

/* Round trip, because a sign error in toWgs would mirror every drawing and a
   mirrored plan of your own lot is worse than no plan. */
var back = F.toWgs({ x: 400, y: 400 }, { lat: LAT, lng: LNG });
ok('toWgs inverts toLocal (lat)', near(back[0], square(400)[2][0], 1e-6), back[0]);
ok('toWgs inverts toLocal (lng)', near(back[1], square(400)[2][1], 1e-6), back[1]);
ok('toWgs moves north for +y', F.toWgs({ x: 0, y: 100 }, { lat: LAT, lng: LNG })[0] > LAT);
ok('toWgs moves east for +x', F.toWgs({ x: 100, y: 0 }, { lat: LAT, lng: LNG })[1] > LNG);

/* ── 2 · Point in polygon, on the ring api/parcel.js actually returns ──
   That ring is OPEN — the duplicate closing vertex is stripped upstream — so
   a containment test that needed a closed ring would be wrong for every real
   parcel and right for every hand-written fixture. */
ok('centre is inside', F.inside(poly, 200, 200) === true);
ok('outside is outside', F.inside(poly, 500, 200) === false);
ok('just inside an edge is inside', F.inside(poly, 0.5, 200) === true);
ok('just outside an edge is outside', F.inside(poly, -0.5, 200) === false);

ok('distance to boundary at the centre is half the side', near(F.distToBoundary(poly, 200, 200), 200, 1), F.distToBoundary(poly, 200, 200));
ok('distance to boundary near a corner is small', F.distToBoundary(poly, 3, 3) < 5, F.distToBoundary(poly, 3, 3));

/* ── 3 · The setback actually sets back ────────────────────────────────── */
var ras = F.buildable(poly, { setbackFt: 20, gridFt: 4 });
var lr = F.largestRect(ras);
ok('the buildable rectangle is inset by the setback on both axes',
   near(lr.w, 360, 8) && near(lr.h, 360, 8), { w: lr.w, h: lr.h });
ok('the buildable rectangle starts at the setback', near(lr.x, 20, 8) && near(lr.y, 20, 8), { x: lr.x, y: lr.y });

/* A bigger setback must give a strictly smaller envelope. A sign error or an
   off-by-one grid cell would make this non-monotonic. */
var lr40 = F.largestRect(F.buildable(poly, { setbackFt: 40, gridFt: 4 }));
ok('a larger setback yields a smaller envelope', lr40.w < lr.w && lr40.h < lr.h, { w20: lr.w, w40: lr40.w });

/* ── 4 · fitRun is the run-length formula, written out ─────────────────
   n units of size s, each separated AND bounded by clearance c, in length L:
       n*s + (n+1)*c <= L
   The trailing +1 is the one people drop, and dropping it claims a unit
   pressed against the setback line. */
[[100, 20, 5], [105, 20, 5], [104, 20, 5], [10, 20, 5], [26, 20, 5], [25, 20, 5],
 [1000, 40, 10], [0, 20, 5]].forEach(function (t) {
  var L = t[0], sz = t[1], c = t[2];
  var expect = Math.max(0, Math.floor((L - c) / (sz + c)));
  var got = F.fitRun(L, sz, c);
  ok('fitRun(' + L + ',' + sz + ',' + c + ') = ' + expect, got === expect, got);
  if (got > 0) {
    ok('  and ' + got + ' units physically fit in ' + L, got * sz + (got + 1) * c <= L);
    ok('  and one more would not', (got + 1) * sz + (got + 2) * c > L);
  }
});

/* ── 5 · Aisles are charged for ───────────────────────────────────────── */
var rect = { x: 0, y: 0, w: 360, h: 360 };
var noAisle = F.packRect(rect, UNIT, { clearanceFt: 5, aisleFt: 0, rowsPerBlock: 999 });
var withAisle = F.packRect(rect, UNIT, { clearanceFt: 5, aisleFt: 20, rowsPerBlock: 2 });
ok('aisle spacing is charged: fewer units than a naive pack',
   withAisle.count < noAisle.count, { naive: noAisle.count, aisled: withAisle.count });
ok('an aisled pack still fits something', withAisle.count > 0, withAisle.count);
ok('the default aisle is not zero',
   F.packRect(rect, UNIT, { clearanceFt: 5 }).count === withAisle.count,
   F.packRect(rect, UNIT, { clearanceFt: 5 }).count);

/* Every drawn unit must be inside the yard it was packed into, and no two may
   overlap. A drawing that violates either is the thing a customer screenshots. */
(function geometryIsSane() {
  var pk = F.packRect(rect, UNIT, { clearanceFt: 5, aisleFt: 20, rowsPerBlock: 2 });
  var bad = 0, over = 0;
  pk.units.forEach(function (u) {
    if (u.x < rect.x - 0.01 || u.y < rect.y - 0.01 ||
        u.x + u.w > rect.x + rect.w + 0.01 || u.y + u.h > rect.y + rect.h + 0.01) bad++;
  });
  for (var i = 0; i < pk.units.length; i++) {
    for (var j = i + 1; j < pk.units.length; j++) {
      var a = pk.units[i], b = pk.units[j];
      if (a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 &&
          a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01) over++;
    }
  }
  ok('every drawn unit is inside the marked yard', bad === 0, bad);
  ok('no two drawn units overlap', over === 0, over);
  ok('units drawn matches the count when uncapped', pk.units.length === pk.count,
     { drawn: pk.units.length, count: pk.count });
})();

/* ── The DRAWN block is centred on its own extent ─────────────────────
   The capped case is the normal one — the customer is shown what they need,
   not the yard's capacity — and the first render laid those few units out on
   the capacity grid, which parked four cabinets in the bottom-left corner of
   a 1.66-acre yard and read as a rendering fault. */
(function drawnBlockIsCentred() {
  var yard = { x: 0, y: 0, w: 600, h: 400 };
  [1, 2, 4, 9, 20, 60].forEach(function (n) {
    var pk = F.packRect(yard, { widthFt: 8, depthFt: 4 },
      { clearanceFt: 5, aisleFt: 20, rowsPerBlock: 2, maxUnits: n });
    ok('cap ' + n + ': draws exactly ' + n, pk.drawn === n && pk.units.length === n, pk.drawn);
    var xs = pk.units.map(function (u) { return u.x; });
    var ys = pk.units.map(function (u) { return u.y; });
    var cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs) + 8) / 2;
    var cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys) + 4) / 2;
    ok('cap ' + n + ': the block is centred in the yard, not cornered',
       Math.abs(cx - 300) < 20 && Math.abs(cy - 200) < 20, { cx: cx, cy: cy });
    /* And roughly square rather than a single 60-wide line. */
    var bw = Math.max.apply(null, xs) + 8 - Math.min.apply(null, xs);
    var bh = Math.max.apply(null, ys) + 4 - Math.min.apply(null, ys);
    ok('cap ' + n + ': the block is not a degenerate strip',
       n < 3 || (bw / bh < 6 && bh / bw < 6), { bw: bw, bh: bh });
  });
})();

/* A yard too small for one unit is an answer with a reason, not a crash. */
var tiny = F.packRect({ x: 0, y: 0, w: 22, h: 10 }, UNIT, { clearanceFt: 5 });
ok('a yard too small fits nothing', tiny.count === 0, tiny.count);
ok('and says why', typeof tiny.why === 'string' && tiny.why.length > 10, tiny.why);

/* ── 6 · The study draws what is needed, reports what fits ────────────── */
var s1 = F.study(square(400), UNIT, { kw: 600, kwh: 2400 }, { setbackFt: 20, clearanceFt: 5 });
ok('study: fits', s1.fits === true);
ok('study: 2400 kWh at 500 kWh/unit needs 5', s1.packing.unitsNeeded === 5, s1.packing.unitsNeeded);
ok('study: draws exactly what is needed, not the yard maximum',
   s1.packing.unitsDrawn === 5 && s1.packing.units.length === 5,
   { drawn: s1.packing.unitsDrawn, len: s1.packing.units.length });
ok('study: still reports the yard capacity beside it',
   s1.packing.unitsThatFit > s1.packing.unitsNeeded, s1.packing.unitsThatFit);
ok('study: acres are right for a 400 ft square', near(s1.parcelAcres, 3.67, 0.02), s1.parcelAcres);
ok('study: kwhPlaceable is capacity × unit kWh',
   s1.packing.kwhPlaceable === s1.packing.unitsThatFit * UNIT.kwh, s1.packing.kwhPlaceable);

/* A system the lot cannot hold must say so rather than draw a lie. */
var s2 = F.study(square(400), UNIT, { kw: 1e6, kwh: 400000 }, { setbackFt: 20, clearanceFt: 5 });
ok('study: an oversized system does not fit', s2.fits === false);
ok('study: and unitsNeeded exceeds capacity',
   s2.packing.unitsNeeded > s2.packing.unitsThatFit,
   { need: s2.packing.unitsNeeded, fit: s2.packing.unitsThatFit });

/* A lot the setback consumes entirely. */
var s3 = F.study(square(30), UNIT, { kw: 1, kwh: 500 }, { setbackFt: 20, clearanceFt: 5 });
ok('study: a sliver lot does not fit', s3.fits === false);
ok('study: and names the setback as the reason', /setback/.test(s3.reason || ''), s3.reason);
ok('study: a refusal still carries the unverified list', (s3.unverified || []).length >= 5);

/* ── 7 · The customer-dragged yard is clamped, never trusted ──────────── */
function dragged(box) {
  return F.study(square(400), UNIT, { kw: 600, kwh: 2400 },
    { setbackFt: 20, clearanceFt: 5, usable: box });
}
var d1 = dragged({ x: -50, y: -50, w: 500, h: 500 });
ok('a box overhanging every side is clamped, not refused', d1.usable.source === 'customer', d1.usable);
ok('and the clamped box respects the setback',
   d1.usable.x >= 19 && d1.usable.y >= 19 &&
   d1.usable.x + d1.usable.w <= 381 && d1.usable.y + d1.usable.h <= 381, d1.usable);

var d2 = dragged({ x: 200, y: 200, w: 150, h: 150 });
ok('a box inside the envelope is honoured', d2.usable.source === 'customer', d2.usable);
ok('and is not silently enlarged', d2.usable.w <= 160 && d2.usable.h <= 160, d2.usable);
ok('a smaller yard packs fewer units than the whole lot',
   d2.packing.unitsThatFit < s1.packing.unitsThatFit,
   { small: d2.packing.unitsThatFit, whole: s1.packing.unitsThatFit });

var d3 = dragged({ x: 9000, y: 9000, w: 100, h: 100 });
ok('a box entirely off the parcel falls back to the proposed yard',
   d3.usable.source === 'proposed', d3.usable);

/* Every clamped result must be fully inside the buildable envelope. This is
   the assertion that stops a container being drawn in the street. */
(function clampedIsLegal() {
  var r = F.buildable(F.toLocal(square(400), { lat: LAT, lng: LNG }), { setbackFt: 20, gridFt: 4 });
  [[-50, -50, 500, 500], [-30, 100, 120, 120], [300, 300, 200, 200], [0, 0, 400, 400]].forEach(function (b) {
    var c = F.clampToRaster({ x: b[0], y: b[1], w: b[2], h: b[3] }, r);
    if (!c) { pass++; return; }            /* refusing is always legal */
    var c0 = Math.floor((c.x - r.x0) / r.gridFt), c1 = Math.ceil((c.x + c.w - r.x0) / r.gridFt) - 1;
    var r0 = Math.floor((c.y - r.y0) / r.gridFt), r1 = Math.ceil((c.y + c.h - r.y0) / r.gridFt) - 1;
    var blocked = 0;
    for (var rr = r0; rr <= r1; rr++) {
      for (var cc = c0; cc <= c1; cc++) {
        if (rr < 0 || cc < 0 || rr >= r.rows || cc >= r.cols || !r.grid[rr][cc]) blocked++;
      }
    }
    ok('clamped box [' + b.join(',') + '] contains no unbuildable cell', blocked === 0, blocked);
  });
})();

/* ── 8 · An L-shaped lot ───────────────────────────────────────────────
   Assessor rings are not rectangles. The proposed yard must be a real
   rectangle inside the L, never its bounding box. */
(function lShaped() {
  var L = [ll(0, 0), ll(400, 0), ll(400, 150), ll(150, 150), ll(150, 400), ll(0, 400)];
  var r = F.study(L, UNIT, { kw: 600, kwh: 2400 }, { setbackFt: 20, clearanceFt: 5 });
  ok('L-lot acres are less than its bounding square', r.parcelAcres < 3.67, r.parcelAcres);
  var u = r.usable;
  ok('L-lot proposes a rectangle, not the bounding box', !(u.w > 350 && u.h > 350), u);
  /* Every corner of the proposed yard must be inside the L itself. */
  var lp = F.toLocal(L, r.origin);
  var corners = [[u.x, u.y], [u.x + u.w, u.y], [u.x, u.y + u.h], [u.x + u.w, u.y + u.h]];
  var out = corners.filter(function (c) { return !F.inside(lp, c[0], c[1]); }).length;
  ok('every corner of the proposed yard is inside the L', out === 0, out);
})();

/* ── 9 · Refusals that are refusals, not wrong answers ────────────────── */
function threw(fn) { try { fn(); return null; } catch (e) { return e.message; } }
ok('a ring with two points is refused',
   /three points/.test(threw(function () { F.study([ll(0, 0), ll(10, 0)], UNIT, null, {}); }) || ''));
ok('a product with no footprint is refused, not defaulted',
   /footprint/.test(threw(function () { F.study(square(400), { kwh: 500 }, null, {}); }) || ''));
ok('a parcel larger than the flat-earth projection allows is refused',
   /too large|miles/.test(threw(function () { F.study(square(40000), UNIT, null, {}); }) || ''),
   threw(function () { F.study(square(40000), UNIT, null, {}); }));

/* ── 10 · The raster is bounded ────────────────────────────────────────
   A big parcel must coarsen the grid and SAY so, not allocate forever. */
(function bounded() {
  var big = F.toLocal(square(6000), { lat: LAT, lng: LNG });
  var t0 = Date.now();
  var r = F.buildable(big, { setbackFt: 20, gridFt: 2 });
  var ms = Date.now() - t0;
  ok('a 6000 ft parcel rasters without blowing the cell ceiling',
     r.cols * r.rows <= 250000, r.cols * r.rows);
  ok('and says the grid was coarsened', r.coarsened === true, r.coarsened);
  ok('and does it in reasonable time (<6s)', ms < 6000, ms + 'ms');
})();

/* ── 11 · The unverified list is shown, and says the load-bearing things ── */
var U = F.UNVERIFIED.join(' ').toLowerCase();
['survey', 'service', 'zoning', 'utilit', 'clearance'].forEach(function (w) {
  ok('unverified mentions "' + w + '"', U.indexOf(w) >= 0);
});
ok('the study always carries the unverified list', (s1.unverified || []).length === F.UNVERIFIED.length);

/* ── 12 · The assumptions are reported, so they can be argued with ────── */
var a = s1.assumptions;
ok('assumptions report the setback', a.setbackFt === 20, a.setbackFt);
ok('assumptions report the clearance', a.clearanceFt === 5, a.clearanceFt);
ok('assumptions report the aisle', a.aisleFt > 0, a.aisleFt);
ok('assumptions say it is not a code determination', /not a code determination/i.test(a.basis || ''), a.basis);

/* ── 13 · WHICH PRODUCTS GET OFFERED ──────────────────────────────────
   Separate concern from the geometry above, same consequence: a number on
   the page a customer decides from.

   THE BUG THIS EXISTS TO CATCH, and it was real. The first version asked
   which SINGLE unit covers the requirement. Run against a manufacturer's
   actual ladder, a 650 kW / 1,350 kWh need skipped every cabinet and every
   500 kW container — none covers it alone — and recommended a 1,700 kW /
   3,421 kWh container. Two and a half times the power asked for. */
(function productFit() {
  /* No stub needed: the ranking was extracted to _lib/product-fit.js
     precisely because it is pure, so it loads with nothing installed. */
  var H = require(path.join(ROOT, 'api', '_lib', 'product-fit.js'));

  /* A plausible manufacturer ladder: cabinets then containers. */
  var LADDER = [
    { sku: 'C215',  kw: 100,  kwh: 215 },
    { sku: 'C372',  kw: 150,  kwh: 372 },
    { sku: 'C760',  kw: 380,  kwh: 760 },
    { sku: 'X2000', kw: 500,  kwh: 2000 },
    { sku: 'X3400', kw: 1700, kwh: 3421 },
    { sku: 'X5000', kw: 2500, kwh: 5015 }
  ];
  function top(kw, kwh) { var r = H.fitProducts(LADDER, kw, kwh); return r[0] || null; }

  var t = top(650, 1350);
  ok('650 kW / 1350 kWh is offered multiple cabinets, not one huge container',
     t && t.p.sku === 'C760' && t.qty === 2, t && (t.qty + '×' + t.p.sku));
  ok('and the single 1700 kW container is NOT the first offer',
     !t || t.p.sku !== 'X3400', t && t.p.sku);

  var t2 = top(2400, 5000);
  ok('2400 kW / 5000 kWh takes the one container that fits it',
     t2 && t2.p.sku === 'X5000' && t2.qty === 1, t2 && (t2.qty + '×' + t2.p.sku));

  var t3 = top(180, 400);
  ok('180 kW / 400 kWh takes the smallest cabinet in a pair',
     t3 && t3.p.sku === 'C215' && t3.qty === 2, t3 && (t3.qty + '×' + t3.p.sku));

  /* BOTH axes, not just energy. A product that covers the kWh and not the kW
     is a battery that cannot discharge fast enough — the failure a customer
     finds in July, not on this page. */
  var covers = H.fitProducts(LADDER, 900, 1000);
  ok('every offer covers the POWER as well as the energy',
     covers.every(function (f) { return f.totKw >= 900; }),
     covers.map(function (f) { return f.qty + '×' + f.p.sku + '=' + f.totKw + 'kW'; }));
  ok('and every offer covers the energy',
     covers.every(function (f) { return f.totKwh >= 1000; }));

  /* The cap is doing as much work as the ranking. Without it the smallest
     cabinet always wins on closeness, and proposing 23 cabinets is absurd. */
  var many = H.fitProducts(LADDER, 5000, 10000);
  ok('nothing is offered above the unit cap',
     many.every(function (f) { return f.qty <= H.MAX_UNITS; }),
     many.map(function (f) { return f.qty + '×' + f.p.sku; }));
  ok('and nothing is offered that oversupplies beyond the cap',
     many.every(function (f) { return f.over <= H.MAX_OVERSUPPLY; }),
     many.map(function (f) { return f.p.sku + ' x' + f.over.toFixed(2); }));

  /* Ranked by closeness, then by fewer units. Two containers beat five
     cabinets at the same coverage for every reason that is not arithmetic. */
  var ranked = H.fitProducts(LADDER, 650, 1350);
  for (var i = 1; i < ranked.length; i++) {
    ok('offer ' + (i + 1) + ' oversupplies at least as much as offer ' + i,
       ranked[i].over >= ranked[i - 1].over - 0.021,
       ranked.map(function (f) { return f.p.sku + ' x' + f.over.toFixed(2); }));
  }

  /* A need nothing on the ladder can serve is an EMPTY list, not a bad
     recommendation. embed-size then says "we will come back to you with
     options", which is true. */
  ok('an impossible requirement offers nothing rather than something wrong',
     H.fitProducts(LADDER, 50000, 100000).length === 0);

  /* A product with no footprint still gets OFFERED — it just cannot be drawn.
     Conflating "not drawable" with "not sellable" would silently drop stock. */
  var noDims = H.fitProducts([{ sku: 'RACK', kw: 100, kwh: 215 }], 180, 400);
  ok('a product with no footprint is still offered for sale', noDims.length === 1);

  ok('a product with neither kW nor kWh is not offered at all',
     H.fitProducts([{ sku: 'EMPTY' }], 100, 100).length === 0);
})();

console.log('\nsite fit study: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
