/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/site-fit.js — does it plausibly fit on this lot?
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   THIS IS NOT api/site-plan.js, AND THE DIFFERENCE IS THE WHOLE POINT
   ─────────────────────────────────────────────────────────────────────────────
   _lib/site-agent-planner.js answers "WHERE EXACTLY does the battery go, and
   how does the conduit reach the service?" It demands a surveyed parcel, a
   CONFIRMED service wall, reviewed obstacle rectangles and a documented
   clearance basis, and it returns `needs_input` rather than invent any of
   them. That is correct, and it is why it can never serve a public storefront:
   a stranger typing their address has none of those facts, so every visitor
   would get a list of things they have never heard of.

   This answers a different and much weaker question: "DOES A SYSTEM THIS SIZE
   PLAUSIBLY FIT IN THIS YARD?" It needs only a parcel ring, a footprint and a
   stated clearance. It says nothing about where the service is, which way the
   doors open, or where anything should actually be placed.

   Two different products. Do not merge them, and do not let this one's output
   be presented as a layout — `unverified` exists to be shown, and the caller
   must show it.

   ─────────────────────────────────────────────────────────────────────────────
   WHY A GRID AND NOT POLYGON OFFSETTING
   ─────────────────────────────────────────────────────────────────────────────
   The honest reason: correct polygon offsetting (Minkowski / straight
   skeleton) is a real geometry library, it degenerates on the self-touching
   and near-collinear rings that real assessor data is full of, and a subtly
   wrong inset produces a confident drawing that is wrong by six feet.

   A distance raster cannot degenerate. Every cell asks one question — "am I
   inside the ring, and at least `setbackFt` from every edge of it?" — with an
   exact point-to-segment distance. It is O(cells × edges), which is nothing
   at parcel scale, and when the parcel is too big to raster finely the grid
   COARSENS and says so in the output rather than silently truncating.

   ─────────────────────────────────────────────────────────────────────────────
   COORDINATES
   ─────────────────────────────────────────────────────────────────────────────
   Local feet, x east, y north, relative to an origin — the same convention as
   scripts/site-agent/example-site.json, so a concept promoted from this study
   into the real planner does not need its axes reinterpreted.

   Equirectangular about the origin latitude. At parcel scale (under a mile)
   the error is centimetres; at 80° latitude it is still under a foot across a
   1,000 ft lot. It is NOT a projection for anything larger, which is why
   `MAX_SPAN_FT` refuses a ring that big rather than quietly being wrong.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

var FT_PER_DEG_LAT = 364000 / 1.0;   /* 1 degree latitude ≈ 364,000 ft       */
var ACRE_FT2 = 43560;
var MAX_CELLS = 250000;              /* raster ceiling; grid coarsens first  */
var MAX_SPAN_FT = 20000;             /* ~3.8 miles. Beyond this the flat-earth
                                        projection stops being honest.       */
var MIN_GRID_FT = 2;

function finite(v) { return typeof v === 'number' && isFinite(v); }

/* ── Projection ────────────────────────────────────────────────────────── */

/* [[lat,lng],…] → [{x,y},…] in feet about `origin` {lat,lng}. */
function toLocal(ring, origin) {
  var latFt = FT_PER_DEG_LAT;
  var lngFt = FT_PER_DEG_LAT * Math.cos(origin.lat * Math.PI / 180);
  return ring.map(function (p) {
    return {
      x: (p[1] - origin.lng) * lngFt,
      y: (p[0] - origin.lat) * latFt
    };
  });
}

/* And back, so the caller can hand a drawing to a map if it ever wants one. */
function toWgs(pt, origin) {
  var latFt = FT_PER_DEG_LAT;
  var lngFt = FT_PER_DEG_LAT * Math.cos(origin.lat * Math.PI / 180);
  return [origin.lat + pt.y / latFt, origin.lng + pt.x / lngFt];
}

/* ── Polygon primitives ────────────────────────────────────────────────── */

function bbox(poly) {
  var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (var i = 0; i < poly.length; i++) {
    if (poly[i].x < b.minX) b.minX = poly[i].x;
    if (poly[i].x > b.maxX) b.maxX = poly[i].x;
    if (poly[i].y < b.minY) b.minY = poly[i].y;
    if (poly[i].y > b.maxY) b.maxY = poly[i].y;
  }
  return b;
}

/* Shoelace, absolute — the ring's winding is whatever the assessor's layer
   happened to store and is not a fact about the land. */
function areaFt2(poly) {
  var a = 0;
  for (var i = 0, n = poly.length; i < n; i++) {
    var p = poly[i], q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/* Crossing number. The ring is OPEN (api/parcel.js strips the duplicate
   closing vertex), so the modulo closes it here. */
function inside(poly, x, y) {
  var hit = false;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    var a = poly[i], b = poly[j];
    if (((a.y > y) !== (b.y > y)) &&
        (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) hit = !hit;
  }
  return hit;
}

function distToSegment(x, y, a, b) {
  var dx = b.x - a.x, dy = b.y - a.y;
  var len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y));
  var t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var px = a.x + t * dx, py = a.y + t * dy;
  return Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
}

function distToBoundary(poly, x, y) {
  var best = Infinity;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    var d = distToSegment(x, y, poly[i], poly[j]);
    if (d < best) best = d;
  }
  return best;
}

/* ── The buildable raster ──────────────────────────────────────────────── */

/* Cells that are inside the ring AND at least `setbackFt` from every edge,
   minus any rectangle the caller has told us to keep clear.

   Returns { grid, cols, rows, gridFt, x0, y0, coarsened } where grid[r][c] is
   1 for buildable. `coarsened` is true when the requested resolution would
   have blown MAX_CELLS — reported, never silent, because a coarser grid means
   a more conservative count and the reader is entitled to know. */
function buildable(poly, opts) {
  opts = opts || {};
  var setbackFt = finite(opts.setbackFt) ? Math.max(0, opts.setbackFt) : 10;
  var keepClear = Array.isArray(opts.keepClear) ? opts.keepClear : [];
  var b = bbox(poly);
  var spanX = b.maxX - b.minX, spanY = b.maxY - b.minY;

  if (!(spanX > 0 && spanY > 0)) throw new Error('the parcel has no area');
  if (spanX > MAX_SPAN_FT || spanY > MAX_SPAN_FT) {
    throw new Error('this parcel spans more than ' + Math.round(MAX_SPAN_FT / 5280) +
      ' miles — too large for a yard fit study');
  }

  var gridFt = finite(opts.gridFt) ? Math.max(MIN_GRID_FT, opts.gridFt) : 4;
  var coarsened = false;
  while ((spanX / gridFt) * (spanY / gridFt) > MAX_CELLS) { gridFt *= 2; coarsened = true; }

  var cols = Math.floor(spanX / gridFt), rows = Math.floor(spanY / gridFt);
  var grid = [];
  for (var r = 0; r < rows; r++) {
    var row = new Array(cols);
    var y = b.minY + (r + 0.5) * gridFt;
    for (var c = 0; c < cols; c++) {
      var x = b.minX + (c + 0.5) * gridFt;
      var free = 0;
      if (inside(poly, x, y) && distToBoundary(poly, x, y) >= setbackFt) {
        free = 1;
        for (var k = 0; k < keepClear.length; k++) {
          var z = keepClear[k];
          /* The keep-clear rectangle is grown by the setback too: a building
             you must stay 10 ft from is not a rectangle you may touch. */
          var pad = finite(z.clearFt) ? z.clearFt : setbackFt;
          if (x >= z.x - pad && x <= z.x + z.w + pad &&
              y >= z.y - pad && y <= z.y + z.h + pad) { free = 0; break; }
        }
      }
      row[c] = free;
    }
    grid.push(row);
  }
  return { grid: grid, cols: cols, rows: rows, gridFt: gridFt,
           x0: b.minX, y0: b.minY, coarsened: coarsened };
}

/* ── Largest inscribed axis-aligned rectangle ──────────────────────────── */

/* The classic maximal-rectangle-in-a-binary-matrix histogram sweep, O(rows ×
   cols). Used to PROPOSE a yard for the customer to adjust, not to decide
   one: the largest empty rectangle on a lot is very often the front lawn, and
   only the owner knows that. api/embed-layout.js says so to the customer and
   lets them move it. */
function largestRect(ras) {
  var heights = new Array(ras.cols).fill(0);
  var best = null;
  for (var r = 0; r < ras.rows; r++) {
    for (var c = 0; c < ras.cols; c++) {
      heights[c] = ras.grid[r][c] ? heights[c] + 1 : 0;
    }
    /* Stack sweep over this row's histogram. */
    var stack = [], c2 = 0;
    for (c2 = 0; c2 <= ras.cols; c2++) {
      var h = (c2 === ras.cols) ? 0 : heights[c2];
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        var top = stack.pop();
        var height = heights[top];
        var left = stack.length ? stack[stack.length - 1] + 1 : 0;
        var width = c2 - left;
        var area = width * height;
        if (height > 0 && width > 0 && (!best || area > best.area)) {
          best = { area: area, cLeft: left, cRight: c2 - 1, rBottom: r, rTop: r - height + 1 };
        }
      }
      stack.push(c2);
    }
  }
  if (!best) return null;
  return {
    x: ras.x0 + best.cLeft * ras.gridFt,
    y: ras.y0 + best.rTop * ras.gridFt,
    w: (best.cRight - best.cLeft + 1) * ras.gridFt,
    h: (best.rBottom - best.rTop + 1) * ras.gridFt
  };
}

/* ── Packing ───────────────────────────────────────────────────────────── */

/* How many `unit` footprints fit in `rect`, with `clearanceFt` on every side
   of every unit, in the better of the two axis-aligned orientations.

   ONE ROW OF MATH, WRITTEN OUT, because getting it off by one is the whole
   difference between a study a customer trusts and one an engineer laughs at:
   n units in a run of length L, each of size s, separated AND bounded by
   clearance c, need n·s + (n+1)·c ≤ L. So n = floor((L − c) / (s + c)).
   The trailing +1 clearance is the one people drop, and dropping it claims a
   unit pressed against the setback line. */
function fitRun(lengthFt, sizeFt, clearanceFt) {
  var n = Math.floor((lengthFt - clearanceFt) / (sizeFt + clearanceFt));
  return n > 0 ? n : 0;
}

/* ── WHY THERE IS AN AISLE, AND WHY THE DEFAULT IS NOT ZERO ─────────────
   The first version of this packed on clearance alone and reported 378
   containers on a 3.7-acre lot. That is geometrically exact and physically
   absurd: nothing can be delivered, serviced or reached by a fire apparatus,
   and no authority would permit it. A storefront that printed it would be
   caught by the first engineer who saw it, and rightly.

   So units pack in BLOCKS of `rowsPerBlock` rows with an `aisleFt` drive
   between blocks. The defaults — two rows back-to-back, a 20 ft aisle — are
   the common arrangement for containerised storage and are STATED in the
   output as assumptions, not buried here. They are not a code determination;
   NFPA 855 separation, the local fire code and the manufacturer's own
   installation manual all govern and none of them is consulted anywhere in
   this file.

   Conservative on purpose. Undercounting a yard loses nothing — the customer
   is told what fits and a real engineer refines it. Overcounting sells a
   system that cannot be installed. */
function packRect(rect, unit, opts) {
  opts = opts || {};
  var c = finite(opts.clearanceFt) ? Math.max(0, opts.clearanceFt) : 5;
  var aisle = finite(opts.aisleFt) ? Math.max(0, opts.aisleFt) : 20;
  var perBlock = finite(opts.rowsPerBlock) && opts.rowsPerBlock >= 1
    ? Math.floor(opts.rowsPerBlock) : 2;
  var cap = finite(opts.maxUnits) && opts.maxUnits > 0 ? Math.floor(opts.maxUnits) : Infinity;
  var best = null;

  [[unit.widthFt, unit.depthFt, 0], [unit.depthFt, unit.widthFt, 90]].forEach(function (o) {
    var w = o[0], d = o[1], rot = o[2];
    var cols = fitRun(rect.w, w, c);
    var rowsN = fitRowsWithAisles(rect.h, d, c, aisle, perBlock);
    var n = cols * rowsN;
    if (!best || n > best.count) {
      best = { count: n, cols: cols, rows: rowsN, w: w, d: d, rotation: rot };
    }
  });

  if (!best || !best.count) {
    return { count: 0, rotation: null, units: [], clearanceFt: c, aisleFt: aisle,
             rowsPerBlock: perBlock,
             why: 'the usable area is smaller than one unit plus its clearance and access aisle' };
  }

  /* ── THE DRAWN BLOCK IS ARRANGED FOR ITS OWN SIZE ────────────────────
     `best` describes how the yard would be filled to CAPACITY. When the
     caller caps the drawing at what the customer actually needs — which is
     the normal case — laying those few units out on the capacity grid and
     centring THAT grid puts them in a corner of a huge empty box, with all
     the whitespace on one side. On the first real render, four cabinets sat
     in the bottom-left of a 1.66-acre yard and read as a rendering fault.

     So the drawn units get their own arrangement: roughly square in the
     yard's own proportions, never wider than the yard allows, and centred on
     its own extent. Presentation only — `count`, `cols` and `rows` still
     describe the capacity, because that is what the caller reports. */
  var nDraw = Math.min(cap, best.count);
  var dCols = best.cols, dRows = best.rows;
  if (nDraw < best.count) {
    /* A block whose aspect follows the unit pitch, so a row of long
       containers does not become a single 40-wide line. */
    dCols = Math.max(1, Math.min(best.cols,
      Math.ceil(Math.sqrt(nDraw * (best.d + c) / (best.w + c)))));
    dRows = Math.ceil(nDraw / dCols);
  }

  /* Rows laid out top-down, inserting an aisle after every `perBlock` rows.
     Y positions are computed by walking, not by a formula, because the aisle
     makes the pitch non-uniform and a closed form here is how an off-by-one
     gets drawn. */
  var ys = rowOffsets(dRows, best.d, c, aisle, perBlock);
  var usedH = ys.length ? (ys[ys.length - 1] + best.d + c) : 0;
  var usedW = dCols * best.w + (dCols + 1) * c;
  var offX = rect.x + Math.max(0, (rect.w - usedW) / 2) + c;
  var offY = rect.y + Math.max(0, (rect.h - usedH) / 2);

  var units = [], drawn = 0;
  for (var r = 0; r < dRows && drawn < nDraw; r++) {
    for (var col = 0; col < dCols && drawn < nDraw; col++) {
      units.push({
        x: round1(offX + col * (best.w + c)),
        y: round1(offY + ys[r]),
        w: round1(best.w), h: round1(best.d)
      });
      drawn++;
    }
  }
  return { count: best.count, drawn: drawn, cols: best.cols, rows: best.rows,
           rotation: best.rotation, clearanceFt: c, aisleFt: aisle,
           rowsPerBlock: perBlock, units: units };
}

/* How many rows of depth `d` fit in `lengthFt` when every `perBlock` rows are
   followed by an aisle. Walked rather than solved, for the same reason the
   offsets are. */
function fitRowsWithAisles(lengthFt, d, c, aisle, perBlock) {
  var used = c, n = 0;
  for (;;) {
    if (used + d + c > lengthFt) break;
    used += d + c;
    n++;
    if (n % perBlock === 0) {
      /* The aisle is only spent if another row would actually follow it. */
      if (used + aisle + d + c > lengthFt) break;
      used += aisle;
    }
  }
  return n;
}

function rowOffsets(n, d, c, aisle, perBlock) {
  var out = [], used = c;
  for (var i = 0; i < n; i++) {
    out.push(used);
    used += d + c;
    if ((i + 1) % perBlock === 0 && i + 1 < n) used += aisle;
  }
  return out;
}

function round1(v) { return Math.round(v * 10) / 10; }

/* ── The study ─────────────────────────────────────────────────────────── */

/* ring        [[lat,lng],…] open, from api/parcel.js
   unit        { widthFt, depthFt, kwh, kw, model }
   need        { kw, kwh } the sized system, or null for "how much fits?"
   opts        { setbackFt, clearanceFt, gridFt, usable, keepClear }
               `usable` is a customer-adjusted rectangle in local feet; absent
               means propose one.

   Returns a study. Never throws for a parcel it simply cannot use — that is
   an answer (`fits:false`, a reason) — but DOES throw for geometry it will
   not reason about, the way the real planner does. */
function study(ring, unit, need, opts) {
  opts = opts || {};
  if (!Array.isArray(ring) || ring.length < 3) throw new Error('a parcel ring needs at least three points');
  if (!unit || !(unit.widthFt > 0) || !(unit.depthFt > 0)) {
    throw new Error('the product has no footprint on file (widthFt and depthFt, in feet)');
  }

  var origin = { lat: ring[0][0], lng: ring[0][1] };
  var poly = toLocal(ring, origin);
  var parcelFt2 = areaFt2(poly);

  var setbackFt = finite(opts.setbackFt) ? opts.setbackFt : 10;
  var clearanceFt = finite(opts.clearanceFt) ? opts.clearanceFt : 5;

  var ras = buildable(poly, { setbackFt: setbackFt, gridFt: opts.gridFt, keepClear: opts.keepClear });
  var proposed = largestRect(ras);

  /* A customer-supplied yard is CLAMPED to the buildable envelope, not
     trusted: a dragged box that overhangs the setback would otherwise let the
     browser choose its own answer. */
  var usable = proposed;
  var usableSource = 'proposed';
  if (opts.usable && finite(opts.usable.w) && finite(opts.usable.h)) {
    var clamped = clampToRaster(opts.usable, ras);
    if (clamped) { usable = clamped; usableSource = 'customer'; }
  }

  if (!usable) {
    return {
      fits: false,
      reason: 'after a ' + setbackFt + ' ft setback there is no clear rectangle left on this parcel',
      parcelAcres: round2(parcelFt2 / ACRE_FT2),
      parcel: poly.map(round1pt), origin: origin,
      usable: null, packing: null,
      assumptions: assumptions(setbackFt, clearanceFt, ras, null),
      unverified: UNVERIFIED
    };
  }

  var unitsNeeded = null;
  if (need && finite(need.kwh) && need.kwh > 0 && finite(unit.kwh) && unit.kwh > 0) {
    unitsNeeded = Math.ceil(need.kwh / unit.kwh);
  }

  /* ── DRAW WHAT THEY NEED, REPORT WHAT FITS ─────────────────────────────
     The customer came to see THEIR system on THEIR lot. Drawing the yard's
     maximum instead answers a question nobody asked and, on a large parcel,
     produces a wall of two hundred containers that reads as a sales fantasy
     rather than a study. So `maxUnits` caps what is DRAWN at what the sizing
     called for, and `unitsThatFit` reports the capacity beside it — which is
     the genuinely useful second number for somebody thinking about phase
     two. */
  var packing = packRect(usable, unit, {
    clearanceFt: clearanceFt,
    aisleFt: opts.aisleFt, rowsPerBlock: opts.rowsPerBlock,
    maxUnits: unitsNeeded || undefined
  });

  return {
    fits: unitsNeeded == null ? packing.count > 0 : packing.count >= unitsNeeded,
    reason: packing.why || null,
    origin: origin,
    parcel: poly.map(round1pt),
    parcelAcres: round2(parcelFt2 / ACRE_FT2),
    usable: { x: round1(usable.x), y: round1(usable.y), w: round1(usable.w), h: round1(usable.h),
              source: usableSource,
              acres: round2((usable.w * usable.h) / ACRE_FT2) },
    packing: {
      unitsThatFit: packing.count,          /* the yard's capacity          */
      unitsNeeded: unitsNeeded,             /* what the sizing called for   */
      unitsDrawn: packing.drawn || 0,       /* what `units` below contains  */
      rows: packing.rows || 0, cols: packing.cols || 0,
      rotation: packing.rotation,
      units: packing.units,
      kwhPlaceable: finite(unit.kwh) ? Math.round(packing.count * unit.kwh) : null,
      kwPlaceable: finite(unit.kw) ? Math.round(packing.count * unit.kw) : null
    },
    assumptions: assumptions(setbackFt, clearanceFt, ras, packing),
    unverified: UNVERIFIED
  };
}

/* ── A CUSTOMER-DRAGGED YARD, MADE LEGAL ─────────────────────────────────
   The browser sends a rectangle. It must not be trusted — a box that
   overhangs the setback would let the page choose its own answer and put a
   container in the street — but it must not be thrown away either.

   The first version only shrank from the far edges and never moved the near
   ones, so any box whose top-left corner started outside the envelope could
   never become legal: it burned its 400 iterations and returned null, and the
   study silently fell back to the proposed yard. To the customer that is a
   drag that snaps back to the whole lot for no stated reason, which reads as
   broken software rather than as a refusal.

   So: clamp into the envelope's own extent, then erode from whichever SIDE
   actually has a blocked cell. That converges — every step removes a column
   or a row — and it converges on the largest legal rectangle contained in
   what they asked for, which is the answer they meant. */
function clampToRaster(rect, ras) {
  var g = ras.gridFt;

  /* The extent of the buildable cells, not of the parcel bbox: on an L-shaped
     lot those differ a lot, and starting from the parcel bbox wastes the whole
     erosion budget walking in from a corner that was never usable. */
  var fMinC = ras.cols, fMaxC = -1, fMinR = ras.rows, fMaxR = -1;
  for (var r = 0; r < ras.rows; r++) {
    for (var c = 0; c < ras.cols; c++) {
      if (!ras.grid[r][c]) continue;
      if (c < fMinC) fMinC = c;
      if (c > fMaxC) fMaxC = c;
      if (r < fMinR) fMinR = r;
      if (r > fMaxR) fMaxR = r;
    }
  }
  if (fMaxC < 0) return null;                  /* nothing buildable at all */

  /* Requested rect → cell range, clamped into that extent. */
  var c0 = Math.max(fMinC, Math.floor((rect.x - ras.x0) / g));
  var c1 = Math.min(fMaxC, Math.ceil((rect.x + rect.w - ras.x0) / g) - 1);
  var r0 = Math.max(fMinR, Math.floor((rect.y - ras.y0) / g));
  var r1 = Math.min(fMaxR, Math.ceil((rect.y + rect.h - ras.y0) / g) - 1);
  if (c1 < c0 || r1 < r0) return null;

  function colBlocked(c, ra, rb) {
    for (var i = ra; i <= rb; i++) if (!ras.grid[i][c]) return true;
    return false;
  }
  function rowBlocked(r, ca, cb) {
    for (var i = ca; i <= cb; i++) if (!ras.grid[r][i]) return true;
    return false;
  }

  /* Each pass removes at least one row or column, so the loop is bounded by
     cols + rows. Erode the side that is blocked; when both ends of an axis
     are blocked, take the one that costs less area to lose. */
  var budget = ras.cols + ras.rows + 4;
  while (budget-- > 0 && c1 >= c0 && r1 >= r0) {
    var left = colBlocked(c0, r0, r1);
    var right = c1 > c0 ? colBlocked(c1, r0, r1) : left;
    var top = rowBlocked(r0, c0, c1);
    var bottom = r1 > r0 ? rowBlocked(r1, c0, c1) : top;
    if (!left && !right && !top && !bottom) break;

    if (left && right) { if ((r1 - r0) >= 0) { c0++; } }
    else if (left) c0++;
    else if (right) c1--;
    else if (top && bottom) { r0++; }
    else if (top) r0++;
    else if (bottom) r1--;
  }
  if (c1 < c0 || r1 < r0) return null;

  /* A rectangle whose interior is still blocked cannot be handed back: a
     concave envelope can leave a hole that no edge erosion reaches. Say so by
     returning null so the study falls back to the PROPOSED yard, which is
     always legal because largestRect() only ever returns free cells. */
  for (var rr = r0; rr <= r1; rr++) {
    for (var cc = c0; cc <= c1; cc++) if (!ras.grid[rr][cc]) return null;
  }

  var w = (c1 - c0 + 1) * g, h = (r1 - r0 + 1) * g;
  if (!(w >= g && h >= g)) return null;
  return { x: ras.x0 + c0 * g, y: ras.y0 + r0 * g, w: w, h: h };
}

function assumptions(setbackFt, clearanceFt, ras, packing) {
  return {
    setbackFt: setbackFt,
    clearanceFt: clearanceFt,
    /* Stated, because they are the figures that decide the count and a
       reader must be able to argue with them. */
    aisleFt: packing && finite(packing.aisleFt) ? packing.aisleFt : null,
    rowsPerBlock: packing && packing.rowsPerBlock ? packing.rowsPerBlock : null,
    gridFt: ras.gridFt,
    /* Said out loud: a coarser grid undercounts rather than overcounts, so a
       reader knows which way the error runs. */
    gridCoarsened: !!ras.coarsened,
    basis: 'Indicative geometric fit only. The setback and clearance are the '
         + 'figures entered above, not a code determination for this jurisdiction '
         + 'or a manufacturer installation requirement.'
  };
}

/* Shown by the caller, every time. The list is deliberately blunt: this study
   is persuasive-looking output from thin evidence, and the honest thing is to
   say exactly which thin parts. */
var UNVERIFIED = [
  'Parcel boundary is from a public assessor or Regrid record, not a survey.',
  'No electrical service location, capacity or point of interconnection was identified.',
  'No buildings, drives, easements, drainage, overhead lines or buried utilities were located.',
  'No zoning, fire code, separation-distance or permitting review was performed.',
  'No manufacturer installation clearance or foundation requirement was applied.',
  'Equipment shown is a footprint block at the stated size, not a placement recommendation.'
];

function round1pt(p) { return { x: round1(p.x), y: round1(p.y) }; }
function round2(v) { return Math.round(v * 100) / 100; }

module.exports = {
  study: study,
  /* Exported so the sweep can be checked from outside the thing that did it —
     the same reasoning bess-engine.js gives for exporting dispatchYear. */
  toLocal: toLocal, toWgs: toWgs, bbox: bbox, areaFt2: areaFt2, inside: inside,
  distToBoundary: distToBoundary, buildable: buildable, largestRect: largestRect,
  packRect: packRect, fitRun: fitRun, clampToRaster: clampToRaster,
  UNVERIFIED: UNVERIFIED, MAX_SPAN_FT: MAX_SPAN_FT, ACRE_FT2: ACRE_FT2
};
