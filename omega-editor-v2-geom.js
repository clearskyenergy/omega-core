/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-geom.js — site geometry for the Site Plan preview.
 *
 * Pure. No DOM, no network, no prices. Distances are feet. East is +x,
 * north is +y, angles are degrees counterclockwise from east (the same
 * zero AutoCAD uses). The current Site Map stores a drawing in canvas
 * pixels; this one stores feet so a zoom cannot move a module.
 *
 * Array capacity uses the same table, ground-coverage and module-area
 * rule as editor.html computeGroundLayout / DER_PV_MODULES (JinkoSolar
 * EAGLE G7B, the NextNRG-specified module). A change to those figures
 * belongs in both places; scripts/tests/teditorv2.js pins the shared
 * inputs and a hand-worked rectangle.
 */
(function (root) {
  'use strict';

  var FT_PER_M = 3.280839895;
  /* Mean metres in one degree of latitude. Longitude is this times cos(lat). */
  var M_PER_DEG_LAT = 111132.92;
  var FT_PER_DEG_LAT = M_PER_DEG_LAT * FT_PER_M;

  /* The module Site Map draws with, by nameplate and frame. W/ft² is
     derived, never typed, the same way _pvModuleWpsf does it. */
  var MODULE = {
    key: 'nextnrg-eagle-g7b',
    mfr: 'NextNRG',
    make: 'JinkoSolar',
    line: 'EAGLE G7B',
    sku: 'NEXTNRG-PV-EAGLE-G7B',
    watts: 640,
    widthMm: 1134,
    heightMm: 2382,
    depthMm: 30
  };

  /* Rack presets. tableW/tableH and the pitch rule are GM_TABLE plus
     DER_SOLAR_PRESETS in editor.html. Pitch = table depth / GCR.
     Column gap = max(2 ft, 8% of table width). Module fill inside a
     table frame is 0.92. DC:AC is 1.25. */
  var PRESETS = {
    'fixed-ground': { label: 'Fixed-tilt ground mount', gcr: 0.40, setbackFt: 10, tableW: 20, tableH: 12, cf: 0.18 },
    'tracker-1ax':  { label: 'Single-axis tracker', gcr: 0.33, setbackFt: 15, tableW: 6, tableH: 180, cf: 0.22 },
    rooftop:        { label: 'Rooftop (10° tilt, 12.5 ft rows)', gcr: 0.60, setbackFt: 3, tableW: 20, tableH: 7.5, cf: 0.16 },
    carport:        { label: 'Carport / canopy', gcr: 0.85, setbackFt: 5, tableW: 20, tableH: 40, cf: 0.17 }
  };
  var MODULE_FILL = 0.92;
  var DC_AC = 1.25;
  var DRAW_CAP = 1200;

  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function num(n, fallback) {
    var v = +n;
    return isFinite(v) ? v : fallback;
  }
  function pt(x, y) { return { x: +x || 0, y: +y || 0 }; }
  function clonePt(p) { return { x: p.x, y: p.y }; }
  function clonePts(list) {
    var out = [], i;
    for (i = 0; i < (list || []).length; i++) out.push(clonePt(list[i]));
    return out;
  }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function mul(a, s) { return { x: a.x * s, y: a.y * s }; }
  function dist(a, b) { return hypot(a.x - b.x, a.y - b.y); }
  function len(a) { return hypot(a.x, a.y); }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function ang(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
  function deg(rad) { return rad * 180 / Math.PI; }
  function rad(d) { return d * Math.PI / 180; }

  function wpsfOf(mod) {
    var m = mod || MODULE;
    var a = (num(m.widthMm, 0) / 1000) * (num(m.heightMm, 0) / 1000);
    if (!(m.watts > 0) || !(a > 0)) return 20;
    return Math.round((m.watts / (a * 10.7639)) * 100) / 100;
  }
  MODULE.wpsf = wpsfOf(MODULE);
  MODULE.areaSqft = (MODULE.widthMm / 1000) * (MODULE.heightMm / 1000) * 10.7639;

  function preset(key) { return PRESETS[key] || PRESETS['fixed-ground']; }

  function signedArea(pts) {
    var s = 0, i, n = pts ? pts.length : 0, j;
    if (n < 3) return 0;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return s / 2;
  }
  function area(pts) { return Math.abs(signedArea(pts)); }
  function ensureCCW(pts) {
    var c = clonePts(pts);
    if (signedArea(c) < 0) c.reverse();
    return c;
  }
  function closeOpen(pts) {
    var c = clonePts(pts);
    if (c.length > 1 && dist(c[0], c[c.length - 1]) < 1e-9) c.pop();
    return c;
  }

  function bbox(pts) {
    var i, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (i = 0; i < (pts || []).length; i++) {
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].x > maxX) maxX = pts[i].x;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0, cx: 0, cy: 0 };
    return {
      minX: minX, minY: minY, maxX: maxX, maxY: maxY,
      w: maxX - minX, h: maxY - minY,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
    };
  }

  function pointInPoly(x, y, poly) {
    var inside = false, n, i, j, xi, yi, xj, yj, hit;
    if (!poly || poly.length < 3) return false;
    if (distToPolyEdges(x, y, poly) <= 1e-6) return true;
    n = poly.length;
    for (i = 0, j = n - 1; i < n; j = i++) {
      xi = poly[i].x; yi = poly[i].y; xj = poly[j].x; yj = poly[j].y;
      hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function closestOnSegment(p, a, b) {
    var ab = sub(b, a), l2 = dot(ab, ab), t, c;
    if (l2 < 1e-18) return { point: clonePt(a), t: 0, dist: dist(p, a) };
    t = dot(sub(p, a), ab) / l2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    c = add(a, mul(ab, t));
    return { point: c, t: t, dist: dist(p, c) };
  }
  function distToPolyEdges(x, y, poly) {
    var p = { x: x, y: y }, best = Infinity, i, n = poly.length, a, b, d, closed;
    if (n < 2) return best;
    closed = dist(poly[0], poly[n - 1]) > 1e-9;
    for (i = 0; i < n - (closed ? 0 : 1); i++) {
      a = poly[i];
      b = poly[(i + 1) % n];
      d = closestOnSegment(p, a, b).dist;
      if (d < best) best = d;
    }
    return best;
  }

  function segmentsIntersect(a, b, c, d) {
    function cross(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }
    function on(p, q, r) {
      return Math.min(p.x, r.x) - 1e-9 <= q.x && q.x <= Math.max(p.x, r.x) + 1e-9 &&
             Math.min(p.y, r.y) - 1e-9 <= q.y && q.y <= Math.max(p.y, r.y) + 1e-9;
    }
    var d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    if (Math.abs(d1) < 1e-9 && on(c, a, d)) return true;
    if (Math.abs(d2) < 1e-9 && on(c, b, d)) return true;
    if (Math.abs(d3) < 1e-9 && on(a, c, b)) return true;
    if (Math.abs(d4) < 1e-9 && on(a, d, b)) return true;
    return false;
  }

  function selfIntersects(pts) {
    var p = closeOpen(pts), n = p.length, i, j;
    if (n < 4) return false;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
        if (segmentsIntersect(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  /* Inward offset of a simple polygon. Convex rectangles are exact.
     A result that crosses itself is refused rather than drawn. */
  function offsetPolygon(pts, distance) {
    var p, n, i, lines = [], out = [], d, prev, next, edge, el, nx, ny, ox, oy, a, b, hit, denom, dx, dy, t;
    d = +distance;
    if (!finite(d) || d < 0) return { ok: false, reason: 'Setback must be zero or a positive distance in feet.' };
    p = ensureCCW(closeOpen(pts));
    n = p.length;
    if (n < 3) return { ok: false, reason: 'A setback needs a closed shape.' };
    if (d === 0) return { ok: true, pts: p };
    for (i = 0; i < n; i++) {
      a = p[i];
      b = p[(i + 1) % n];
      edge = sub(b, a);
      el = len(edge);
      if (el < 1e-9) return { ok: false, reason: 'That shape has a zero-length side.' };
      nx = -edge.y / el;
      ny = edge.x / el;
      lines.push({ p: { x: a.x + nx * d, y: a.y + ny * d }, d: { x: edge.x / el, y: edge.y / el } });
    }
    for (i = 0; i < n; i++) {
      prev = lines[(i - 1 + n) % n];
      next = lines[i];
      denom = prev.d.x * next.d.y - prev.d.y * next.d.x;
      if (Math.abs(denom) < 1e-9) {
        out.push(clonePt(next.p));
        continue;
      }
      dx = next.p.x - prev.p.x;
      dy = next.p.y - prev.p.y;
      t = (dx * next.d.y - dy * next.d.x) / denom;
      hit = { x: prev.p.x + t * prev.d.x, y: prev.p.y + t * prev.d.y };
      out.push(hit);
    }
    if (area(out) < 1 || selfIntersects(out)) {
      return { ok: false, reason: 'That distance does not fit inside this shape.' };
    }
    return { ok: true, pts: out };
  }

  function polylineLength(pts) {
    var s = 0, i;
    for (i = 1; i < (pts || []).length; i++) s += dist(pts[i - 1], pts[i]);
    return s;
  }

  function orthoPoint(base, p, stepDeg) {
    var step = rad(stepDeg > 0 ? stepDeg : 90);
    var a = ang(base, p);
    var snapped = Math.round(a / step) * step;
    var L = dist(base, p);
    return {
      x: base.x + Math.cos(snapped) * L,
      y: base.y + Math.sin(snapped) * L,
      deg: deg(snapped)
    };
  }

  function parseEntry(raw, base, cursor) {
    var s = String(raw == null ? '' : raw).trim(), rel = false, angParts, parts, x, y, d, dir, L, origin, theta;
    if (!s) return { error: 'Enter a point or a distance.' };
    if (s.charAt(0) === '@') { rel = true; s = s.slice(1).trim(); }
    angParts = s.split('<');
    if (angParts.length === 2) {
      d = parseFloat(angParts[0]);
      theta = parseFloat(angParts[1]);
      if (!isFinite(d) || !isFinite(theta)) return { error: 'Use length<angle, for example 25<45.' };
      origin = base || { x: 0, y: 0 };
      if (rel && !base) return { error: 'A relative point needs a previous point.' };
      return {
        point: { x: origin.x + Math.cos(rad(theta)) * d, y: origin.y + Math.sin(rad(theta)) * d },
        kind: 'polar'
      };
    }
    parts = s.split(/[\s,]+/);
    if (parts.length === 2 && isFinite(parseFloat(parts[0])) && isFinite(parseFloat(parts[1]))) {
      x = parseFloat(parts[0]);
      y = parseFloat(parts[1]);
      if (rel) {
        if (!base) return { error: 'A relative point needs a previous point.' };
        return { point: { x: base.x + x, y: base.y + y }, kind: 'relative' };
      }
      return { point: { x: x, y: y }, kind: 'absolute' };
    }
    if (parts.length === 1 && isFinite(parseFloat(parts[0]))) {
      if (!base) return { error: 'A distance needs a start point.' };
      d = parseFloat(parts[0]);
      if (!(d >= 0)) return { error: 'Distance must be zero or greater.' };
      dir = (cursor && dist(base, cursor) > 1e-9) ? cursor : { x: base.x + 1, y: base.y };
      L = dist(base, dir) || 1;
      return {
        point: { x: base.x + (dir.x - base.x) / L * d, y: base.y + (dir.y - base.y) / L * d },
        kind: 'length'
      };
    }
    return { error: 'Could not read that. Try 10,20 or 25<45 or @5,0.' };
  }

  function finitePoint(p) {
    return !!p && finite(p.x) && finite(p.y);
  }

  /* A non-finite cursor is left alone. Rounding NaN used to hand NaN on
     as if it were a grid point. */
  function snap(p, ctx) {
    if (!finitePoint(p)) {
      return { point: { x: p && typeof p.x === 'number' ? p.x : NaN, y: p && typeof p.y === 'number' ? p.y : NaN }, kind: 'free' };
    }
    ctx = ctx || {};
    var tol = (ctx.tolPx > 0 ? ctx.tolPx : 12) / (ctx.pxPerFt > 0 ? ctx.pxPerFt : 1);
    var flags = ctx.flags || {};
    var best = null, i, j, segs, a, b, mid, hit, g, gx, gy;
    function consider(point, kind, rank) {
      if (!finitePoint(point)) return;
      var dd = dist(p, point);
      if (dd > tol) return;
      if (!best || rank < best.rank || (rank === best.rank && dd < best.dist)) {
        best = { point: { x: point.x, y: point.y }, kind: kind, dist: dd, rank: rank };
      }
    }
    segs = ctx.segments || [];
    if (flags.endpoint !== false) {
      for (i = 0; i < segs.length; i++) {
        consider(segs[i].a, 'endpoint', 1);
        consider(segs[i].b, 'endpoint', 1);
      }
    }
    if (flags.midpoint !== false) {
      for (i = 0; i < segs.length; i++) {
        a = segs[i].a; b = segs[i].b;
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        consider(mid, 'midpoint', 2);
      }
    }
    if (flags.intersection) {
      for (i = 0; i < segs.length; i++) {
        for (j = i + 1; j < segs.length; j++) {
          hit = segmentIntersection(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
          if (hit) consider(hit, 'intersection', 2);
        }
      }
    }
    if (flags.edge !== false) {
      for (i = 0; i < segs.length; i++) {
        hit = closestOnSegment(p, segs[i].a, segs[i].b);
        consider(hit.point, 'edge', 3);
      }
    }
    if (best) return { point: best.point, kind: best.kind };
    if (flags.angle && ctx.base) {
      hit = orthoPoint(ctx.base, p, ctx.angleStep || 90);
      return { point: { x: hit.x, y: hit.y }, kind: 'angle' };
    }
    if (flags.grid !== false && ctx.gridFt > 0 && finite(ctx.gridFt)) {
      g = ctx.gridFt;
      gx = Math.round(p.x / g) * g;
      gy = Math.round(p.y / g) * g;
      if (finite(gx) && finite(gy)) return { point: { x: gx, y: gy }, kind: 'grid' };
    }
    return { point: { x: p.x, y: p.y }, kind: 'free' };
  }

  /* Object snaps go through cad-kernel.js, the snap engine the
     architecture tools share. Grid and ortho stay here so a coarse grid
     still catches a point that is outside the object-snap aperture.
     Returns null when the kernel is absent or nothing is in range. */
  function snapCad(cad, p, segments, opts) {
    var eng, i, s, radius, hit, kind;
    if (!finitePoint(p)) {
      return { point: { x: p && typeof p.x === 'number' ? p.x : NaN, y: p && typeof p.y === 'number' ? p.y : NaN }, kind: 'free' };
    }
    if (!cad || typeof cad.SnapEngine !== 'function') return null;
    opts = opts || {};
    segments = segments || [];
    try {
      eng = new cad.SnapEngine({
        gridFt: opts.gridFt > 0 ? opts.gridFt : 5,
        modes: {
          endpoint: opts.endpoint !== false,
          midpoint: opts.midpoint !== false,
          intersection: opts.intersection !== false,
          nearest: opts.edge !== false,
          center: true,
          quadrant: true,
          perpendicular: false,
          extension: false,
          grid: false
        }
      });
      for (i = 0; i < segments.length; i++) {
        s = segments[i];
        if (!s || !finitePoint(s.a) || !finitePoint(s.b)) continue;
        eng.addSegment(s.a, s.b, { ref: s.ref || null });
      }
      radius = (opts.tolPx > 0 ? opts.tolPx : 12) / (opts.pxPerFt > 0 ? opts.pxPerFt : 1);
      hit = eng.query(p, { radiusFt: radius, from: finitePoint(opts.base) ? opts.base : null });
    } catch (err) {
      return null;
    }
    if (!hit || !finitePoint(hit)) return null;
    kind = hit.type === 'nearest' ? 'edge' : hit.type;
    return { point: { x: hit.x, y: hit.y }, kind: kind };
  }

  /* The status readout names the unit the number actually is. */
  function coordReadout(p, scaled) {
    var unit;
    if (!finitePoint(p)) return '—';
    unit = scaled ? 'ft' : 'px';
    return 'E ' + p.x.toFixed(2) + ' ' + unit + '   N ' + p.y.toFixed(2) + ' ' + unit;
  }

  function segmentIntersection(a, b, c, d) {
    var r = sub(b, a), s = sub(d, c), denom = r.x * s.y - r.y * s.x, t, u;
    if (Math.abs(denom) < 1e-12) return null;
    t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
    u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return { x: a.x + t * r.x, y: a.y + t * r.y };
  }

  function rectCorners(e) {
    var hw = num(e.w, 0) / 2, hh = num(e.h, 0) / 2, th = rad(e.rot || 0);
    var c = Math.cos(th), s = Math.sin(th), loc = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], i, out = [];
    for (i = 0; i < 4; i++) {
      out.push({ x: e.x + loc[i][0] * c - loc[i][1] * s, y: e.y + loc[i][0] * s + loc[i][1] * c });
    }
    return out;
  }

  function ringOf(entity) {
    if (!entity) return null;
    if (entity.type === 'rect' || entity.type === 'equip' || entity.type === 'parking') return rectCorners(entity);
    if (entity.type === 'circle' && entity.r > 0) {
      var k, ring = [];
      for (k = 0; k < 24; k++) ring.push({ x: entity.x + Math.cos(k / 24 * Math.PI * 2) * entity.r, y: entity.y + Math.sin(k / 24 * Math.PI * 2) * entity.r });
      return ring;
    }
    if (entity.pts && entity.pts.length >= 3 && (entity.closed || entity.type === 'polygon' || entity.type === 'obstruction' || entity.type === 'setback' || entity.type === 'array')) {
      return closeOpen(entity.pts);
    }
    return null;
  }

  function entitySegments(entity) {
    var segs = [], pts, i, n, corners;
    if (!entity) return segs;
    if (entity.type === 'line' && entity.a && entity.b) return [{ a: entity.a, b: entity.b }];
    if (entity.type === 'dim' && entity.a && entity.b) return [{ a: entity.a, b: entity.b }];
    if (entity.type === 'rect' || entity.type === 'equip' || entity.type === 'parking') {
      corners = rectCorners(entity);
      for (i = 0; i < 4; i++) segs.push({ a: corners[i], b: corners[(i + 1) % 4] });
      return segs;
    }
    if (entity.type === 'circle' && entity.r > 0) {
      /* Four quadrant endpoints so a circle still offers snaps. */
      segs.push({ a: { x: entity.x - entity.r, y: entity.y }, b: { x: entity.x + entity.r, y: entity.y } });
      segs.push({ a: { x: entity.x, y: entity.y - entity.r }, b: { x: entity.x, y: entity.y + entity.r } });
      return segs;
    }
    pts = entity.pts;
    if (!pts || pts.length < 2) return segs;
    n = pts.length;
    for (i = 1; i < n; i++) segs.push({ a: pts[i - 1], b: pts[i] });
    if (entity.closed || entity.type === 'polygon' || entity.type === 'obstruction' || entity.type === 'setback') {
      if (dist(pts[0], pts[n - 1]) > 1e-9) segs.push({ a: pts[n - 1], b: pts[0] });
    }
    return segs;
  }

  function boundsOf(entity) {
    var pts = [], i, corners;
    if (!entity) return bbox([]);
    if (entity.type === 'line' || entity.type === 'dim') return bbox([entity.a, entity.b].filter(Boolean));
    if (entity.type === 'circle') {
      return bbox([
        { x: entity.x - entity.r, y: entity.y - entity.r },
        { x: entity.x + entity.r, y: entity.y + entity.r }
      ]);
    }
    if (entity.type === 'text') return bbox([{ x: entity.x, y: entity.y }, { x: entity.x + 8, y: entity.y + (entity.h || 2) }]);
    if (entity.type === 'callout' && entity.target && entity.anchor) return bbox([entity.target, entity.anchor]);
    if (entity.type === 'rect' || entity.type === 'equip' || entity.type === 'parking') return bbox(rectCorners(entity));
    if (entity.pts) return bbox(entity.pts);
    return bbox(pts);
  }

  function hitEntity(entity, p, tol) {
    var ring, segs, i, box;
    if (!entity || !p) return false;
    if (entity.type === 'circle' && finite(entity.r)) {
      return Math.abs(dist(p, { x: entity.x, y: entity.y }) - entity.r) <= tol || dist(p, { x: entity.x, y: entity.y }) <= entity.r;
    }
    if (entity.type === 'text') {
      box = boundsOf(entity);
      return p.x >= box.minX - tol && p.x <= box.maxX + tol && p.y >= box.minY - tol && p.y <= box.maxY + tol;
    }
    ring = ringOf(entity);
    if (ring && pointInPoly(p.x, p.y, ring)) return true;
    segs = entitySegments(entity);
    for (i = 0; i < segs.length; i++) {
      if (closestOnSegment(p, segs[i].a, segs[i].b).dist <= tol) return true;
    }
    return false;
  }

  /* Window (left-to-right) keeps what is fully inside. Crossing
     (right-to-left) keeps what the box touches. AutoCAD's rule. */
  function boxSelect(entities, a, b, crossing) {
    var minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    var minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    var ids = [], i, box, e, corners, k, inside, hit;
    var frame = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
    function fully(bb) { return bb.minX >= minX && bb.maxX <= maxX && bb.minY >= minY && bb.maxY <= maxY && (bb.w > 0 || bb.h > 0); }
    function touches(ent) {
      box = boundsOf(ent);
      if (box.maxX < minX || box.minX > maxX || box.maxY < minY || box.minY > maxY) {
        /* Bounds miss. A long line can still clip a corner of this test
           when bounds are degenerate; the segment test below covers it
           when bounds overlap. */
        return false;
      }
      if (pointInPoly(box.cx, box.cy, frame)) return true;
      corners = entitySegments(ent);
      for (k = 0; k < corners.length; k++) {
        if (pointInPoly(corners[k].a.x, corners[k].a.y, frame)) return true;
        if (segmentsIntersect(corners[k].a, corners[k].b, frame[0], frame[1]) ||
            segmentsIntersect(corners[k].a, corners[k].b, frame[1], frame[2]) ||
            segmentsIntersect(corners[k].a, corners[k].b, frame[2], frame[3]) ||
            segmentsIntersect(corners[k].a, corners[k].b, frame[3], frame[0])) return true;
      }
      return fully(box);
    }
    for (i = 0; i < entities.length; i++) {
      e = entities[i];
      box = boundsOf(e);
      inside = fully(box);
      hit = crossing ? (inside || touches(e)) : inside;
      if (hit) ids.push(e.id);
    }
    return ids;
  }

  function rectPlaceable(cx, cy, halfW, halfH, boundary, exclusions) {
    var corners = [
      { x: cx - halfW, y: cy - halfH }, { x: cx + halfW, y: cy - halfH },
      { x: cx + halfW, y: cy + halfH }, { x: cx - halfW, y: cy + halfH }
    ], i, e;
    for (i = 0; i < 4; i++) {
      if (!pointInPoly(corners[i].x, corners[i].y, boundary)) return false;
    }
    for (e = 0; e < (exclusions || []).length; e++) {
      for (i = 0; i < 4; i++) {
        if (pointInPoly(corners[i].x, corners[i].y, exclusions[e])) return false;
      }
    }
    return true;
  }

  /* The Site Map's computeGroundLayout, in feet. opts.mount selects the
     preset. opts.setbackFt, opts.gcr, opts.tableW, opts.tableH override
     one figure at a time. opts.maxKwDc stops the walk at a target. */
  function fillTables(boundary, exclusions, opts) {
    opts = opts || {};
    var ring = closeOpen(boundary || []);
    if (ring.length < 3) return { ok: false, reason: 'An array needs a closed boundary.' };
    var A = preset(opts.mount || 'fixed-ground');
    var tableW = num(opts.tableW, A.tableW), tableH = num(opts.tableH, A.tableH);
    var gcr = num(opts.gcr, A.gcr), setbackFt = opts.setbackFt == null ? A.setbackFt : num(opts.setbackFt, A.setbackFt);
    var wpsf = opts.wpsf > 0 ? +opts.wpsf : MODULE.wpsf;
    var bb, y, x, rowCount = 0, tables = [], capped = false, targetHit = false;
    var pitch, colGap, kwPerTable, maxKw, maxTables, tableSqft, totalSqft, kw, blockKw, kwEach, perBlock, blocks;
    if (!(tableW > 0) || !(tableH > 0)) return { ok: false, reason: 'Table size must be greater than zero.' };
    if (!(gcr > 0) || gcr > 1) return { ok: false, reason: 'Ground coverage must be between 0 and 1.' };
    if (!(setbackFt >= 0)) return { ok: false, reason: 'Setback must be zero or greater.' };
    pitch = tableH / gcr;
    colGap = Math.max(2, tableW * 0.08);
    bb = bbox(ring);
    kwPerTable = tableW * tableH * MODULE_FILL * wpsf / 1000;
    maxKw = +opts.maxKwDc > 0 ? +opts.maxKwDc : 0;
    maxTables = maxKw > 0 ? Math.max(1, Math.round(maxKw / kwPerTable)) : Infinity;
    y = bb.minY + tableH / 2 + setbackFt;
    while (y + tableH / 2 <= bb.maxY - setbackFt && !targetHit) {
      rowCount++;
      x = bb.minX + tableW / 2 + setbackFt;
      while (x + tableW / 2 <= bb.maxX - setbackFt) {
        if (rectPlaceable(x, y, tableW / 2, tableH / 2, ring, exclusions)) {
          if (tables.length >= maxTables) { targetHit = true; break; }
          if (tables.length < DRAW_CAP * 4) tables.push({ x: x - tableW / 2, y: y - tableH / 2, w: tableW, h: tableH });
          else capped = true;
        }
        x += tableW + colGap;
      }
      y += pitch;
    }
    tableSqft = tableW * tableH;
    totalSqft = tables.length * tableSqft * MODULE_FILL;
    kw = Math.round(totalSqft * wpsf / 1000 * 10) / 10;
    blockKw = opts.blockKwDc > 0 ? +opts.blockKwDc : 2000;
    kwEach = tables.length ? kw / tables.length : 0;
    perBlock = kwEach > 0 ? Math.max(1, Math.round(blockKw / kwEach)) : tables.length;
    blocks = tables.length ? Math.ceil(tables.length / perBlock) : 0;
    return {
      ok: true,
      tables: tables,
      tableCount: tables.length,
      rowCount: rowCount,
      moduleCount: MODULE.areaSqft > 0 ? Math.round(totalSqft / MODULE.areaSqft) : 0,
      moduleSqft: Math.round(totalSqft),
      kw: kw,
      kwAc: Math.round(kw / DC_AC),
      dcAcRatio: DC_AC,
      gcr: gcr,
      setbackFt: setbackFt,
      tableWft: tableW,
      tableHft: tableH,
      pitchFt: +pitch.toFixed(1),
      presetKey: opts.mount && PRESETS[opts.mount] ? opts.mount : 'fixed-ground',
      wpsf: wpsf,
      sqft: Math.round(bb.w * bb.h),
      acres: (bb.w * bb.h) / 43560,
      capped: capped,
      densityOnly: tables.length > DRAW_CAP,
      targetHit: targetHit,
      blockCount: blocks,
      tablesPerBlock: perBlock,
      moduleKey: MODULE.key
    };
  }

  function align(boundsList, mode) {
    /* boundsList: [{id, box}]. Returns {id: {dx, dy}}. */
    var i, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, out = {}, b, dx, dy;
    if (!boundsList || boundsList.length < 2) return {};
    for (i = 0; i < boundsList.length; i++) {
      b = boundsList[i].box;
      if (b.minX < minX) minX = b.minX;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    for (i = 0; i < boundsList.length; i++) {
      b = boundsList[i].box;
      dx = 0; dy = 0;
      if (mode === 'left') dx = minX - b.minX;
      else if (mode === 'right') dx = maxX - b.maxX;
      else if (mode === 'centerX') dx = (minX + maxX) / 2 - b.cx;
      else if (mode === 'bottom') dy = minY - b.minY;
      else if (mode === 'top') dy = maxY - b.maxY;
      else if (mode === 'centerY') dy = (minY + maxY) / 2 - b.cy;
      out[boundsList[i].id] = { dx: dx, dy: dy };
    }
    return out;
  }

  function distribute(boundsList, axis) {
    var list, i, gap, span, size, cursor, out = {}, keyMin, keyMax, keySize;
    if (!boundsList || boundsList.length < 3) return {};
    keyMin = axis === 'x' ? 'minX' : 'minY';
    keyMax = axis === 'x' ? 'maxX' : 'maxY';
    keySize = axis === 'x' ? 'w' : 'h';
    list = boundsList.slice().sort(function (a, b) { return a.box[keyMin] - b.box[keyMin]; });
    span = list[list.length - 1].box[keyMax] - list[0].box[keyMin];
    size = 0;
    for (i = 0; i < list.length; i++) size += list[i].box[keySize];
    gap = (span - size) / (list.length - 1);
    cursor = list[0].box[keyMin];
    for (i = 0; i < list.length; i++) {
      out[list[i].id] = axis === 'x'
        ? { dx: cursor - list[i].box.minX, dy: 0 }
        : { dx: 0, dy: cursor - list[i].box.minY };
      cursor += list[i].box[keySize] + gap;
    }
    return out;
  }

  function translatePoint(p, dx, dy) { return { x: p.x + dx, y: p.y + dy }; }

  function moveEntity(entity, dx, dy) {
    var e = JSON.parse(JSON.stringify(entity)), i;
    if (e.a) e.a = translatePoint(e.a, dx, dy);
    if (e.b) e.b = translatePoint(e.b, dx, dy);
    if (e.target) e.target = translatePoint(e.target, dx, dy);
    if (e.anchor) e.anchor = translatePoint(e.anchor, dx, dy);
    if (finite(e.x)) e.x += dx;
    if (finite(e.y)) e.y += dy;
    if (e.pts) for (i = 0; i < e.pts.length; i++) e.pts[i] = translatePoint(e.pts[i], dx, dy);
    return e;
  }

  function rotatePoint(p, origin, deg) {
    var th = rad(deg), c = Math.cos(th), s = Math.sin(th), dx = p.x - origin.x, dy = p.y - origin.y;
    return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
  }
  function rotateEntity(entity, origin, degrees) {
    var e = JSON.parse(JSON.stringify(entity)), i;
    if (e.a) e.a = rotatePoint(e.a, origin, degrees);
    if (e.b) e.b = rotatePoint(e.b, origin, degrees);
    if (e.target) e.target = rotatePoint(e.target, origin, degrees);
    if (e.anchor) e.anchor = rotatePoint(e.anchor, origin, degrees);
    if (e.pts) for (i = 0; i < e.pts.length; i++) e.pts[i] = rotatePoint(e.pts[i], origin, degrees);
    if (finite(e.x) && finite(e.y) && (e.type === 'rect' || e.type === 'equip' || e.type === 'parking' || e.type === 'text' || e.type === 'circle')) {
      var c = rotatePoint({ x: e.x, y: e.y }, origin, degrees);
      e.x = c.x; e.y = c.y;
      if (e.type !== 'text' && e.type !== 'circle') e.rot = (num(e.rot, 0) + degrees) % 360;
    }
    return e;
  }

  function formatFeet(ft) {
    var n = +ft;
    if (!isFinite(n)) return '—';
    var sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    var feet = Math.floor(n + 1e-9);
    var inches = Math.round((n - feet) * 12);
    if (inches === 12) { feet += 1; inches = 0; }
    if (inches === 0) return sign + feet + ' ft';
    return sign + feet + ' ft ' + inches + ' in';
  }

  function latLngToFt(lat, lng, anchor) {
    var ftPerDegLng = FT_PER_DEG_LAT * Math.cos(num(anchor.lat, 0) * Math.PI / 180);
    return {
      x: (num(lng, 0) - num(anchor.lng, 0)) * ftPerDegLng,
      y: (num(lat, 0) - num(anchor.lat, 0)) * FT_PER_DEG_LAT
    };
  }
  function ftToLatLng(x, y, anchor) {
    var ftPerDegLng = FT_PER_DEG_LAT * Math.cos(num(anchor.lat, 0) * Math.PI / 180) || 1;
    return {
      lat: num(anchor.lat, 0) + num(y, 0) / FT_PER_DEG_LAT,
      lng: num(anchor.lng, 0) + num(x, 0) / ftPerDegLng
    };
  }
  /* Web-Mercator metres per pixel at the anchor, for a tile zoom. */
  function feetPerPixel(lat, zoom) {
    var mpp = 156543.03392 * Math.cos(num(lat, 0) * Math.PI / 180) / Math.pow(2, zoom);
    return mpp * FT_PER_M;
  }
  function zoomForScale(lat, pxPerFt) {
    var fpp = 1 / (pxPerFt > 0 ? pxPerFt : 1);
    var mpp = fpp / FT_PER_M;
    var z = Math.log(156543.03392 * Math.cos(num(lat, 0) * Math.PI / 180) / mpp) / Math.LN2;
    if (!isFinite(z)) z = 18;
    if (z < 1) z = 1;
    if (z > 20) z = 20;
    return z;
  }

  var api = {
    FT_PER_M: FT_PER_M,
    FT_PER_DEG_LAT: FT_PER_DEG_LAT,
    MODULE: MODULE,
    PRESETS: PRESETS,
    MODULE_FILL: MODULE_FILL,
    DC_AC: DC_AC,
    DRAW_CAP: DRAW_CAP,
    wpsfOf: wpsfOf,
    preset: preset,
    pt: pt,
    dist: dist,
    area: area,
    signedArea: signedArea,
    bbox: bbox,
    pointInPoly: pointInPoly,
    closestOnSegment: closestOnSegment,
    segmentsIntersect: segmentsIntersect,
    selfIntersects: selfIntersects,
    offsetPolygon: offsetPolygon,
    polylineLength: polylineLength,
    orthoPoint: orthoPoint,
    parseEntry: parseEntry,
    finitePoint: finitePoint,
    snap: snap,
    snapCad: snapCad,
    coordReadout: coordReadout,
    rectCorners: rectCorners,
    ringOf: ringOf,
    entitySegments: entitySegments,
    boundsOf: boundsOf,
    hitEntity: hitEntity,
    boxSelect: boxSelect,
    fillTables: fillTables,
    align: align,
    distribute: distribute,
    moveEntity: moveEntity,
    rotateEntity: rotateEntity,
    formatFeet: formatFeet,
    latLngToFt: latLngToFt,
    ftToLatLng: ftToLatLng,
    feetPerPixel: feetPerPixel,
    zoomForScale: zoomForScale,
    VERSION: 'editor-v2-geom/1'
  };

  root.OmegaEditorV2Geom = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
