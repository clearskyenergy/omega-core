/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/assess-space.js — SPACE ON THE LOT: what is clear on a
   site's parcel, and whether the unit's pad fits on it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   (2026-11-21, Tommy: "We need to have a space analysis on the sites as well
   based on the parcel.")

   The assessment sized compute, a battery and fast charging on a site's free
   POWER and said of the ground only "the pad is not on file". Two makers
   have now put a footprint in writing (a 21 × 9 ft pad a pod; 50 × 60 ft for
   a 40 ft container and its coolers), and the screen already reads the
   parcel under the point. This is the second question: is there room.

   TWO STEPS, the second never needing the first's geometry again
     measure(ring, buildings, opts)   at the moment the parcel is read: the
        lot's area, the building footprints on it, and what is CLEAR of both
        (a raster, as site-fit.js does it and for its reasons), kept as a
        small summary: the clear area, the largest clear rectangle, and for
        a ladder of widths the longest clear run that wide. The ring itself
        is never stored (the assessment's rule).
     spaceOf(parcel, answer, cfg)     at every assessment: each use's pad
        against that summary. Fits, does not fit, or NOT JUDGED with the
        reason. Pure: no network, no clock.

   WHAT "CLEAR" MEANS, and what it does not. Inside the lot line by a
   setback, and off every building footprint by a clearance: both stated
   assumptions, the workspace's to set (portfolioAssessment.space), never a
   jurisdiction's rule. It is open GROUND on the public record. Paving,
   parking stalls, drive aisles, canopies, fuel tanks, easements, slopes and
   the zoning setback are not read, so a fit here is "there is a clear
   rectangle this size", never "the pad goes there". A person confirms it on
   the site plan; the checklist item stays Screened, not Done.

   NO FALSE RESULTS. Buildings not read is said and the fit is then judged
   on the lot line alone and marked so. A unit with no footprint on file is
   not judged (or judged against a larger unit's pad as an upper bound, said).
   A lot whose shape was not read has its area and nothing more.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var SF = require('../site-fit'), PS = require('../pod-spec'), CC = require('../compute-contract'), OC = require('../omega-core');

var VERSION = 1;
var DEFAULTS = { setbackFt: 10, buildingClearFt: 10 };
/* the widths a clear run is kept for: a pad's short side is rounded UP to the next one, so a fit is never overstated */
var WIDTHS = [8, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 300];
var MAX_BUILDINGS = 60;

function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function r1(v) { return Math.round(v * 10) / 10; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

/* the workspace's own assumptions; absent means the defaults, and NOTHING is returned so a workspace that sets none keeps its settings (and its answers' hash) as they were */
function configOf(raw) {
  raw = obj(raw); var s = num(raw.setbackFt), b = num(raw.buildingClearFt), out = {};
  if (s != null && s >= 0 && s <= 200) out.setbackFt = s;
  if (b != null && b >= 0 && b <= 200) out.buildingClearFt = b;
  return Object.keys(out).length ? out : null;
}

/* rotate so the lot's longest edge lies along x: a pad is set square to the lot, not to north */
function longestEdgeAngle(poly) {
  var best = 0, ang = 0;
  for (var i = 0; i < poly.length; i++) {
    var a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    if (len > best) { best = len; ang = Math.atan2(dy, dx); }
  }
  return ang;
}
function rotate(poly, ang) { var c = Math.cos(-ang), s = Math.sin(-ang); return poly.map(function (p) { return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; }); }

/* for each width, the longest run of clear ground at least that wide, in either direction */
function runs(ras) {
  var g = ras.gridFt, out = {};
  function sweep(rows, cols, at) {
    var h = new Array(cols); for (var c0 = 0; c0 < cols; c0++) h[c0] = 0;
    var best = WIDTHS.map(function () { return 0; });
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) h[c] = at(r, c) ? h[c] + 1 : 0;
      for (var w = 0; w < WIDTHS.length; w++) {
        var need = Math.ceil(WIDTHS[w] / g - 1e-9), run = 0;
        for (var c2 = 0; c2 < cols; c2++) { if (h[c2] >= need) { run++; if (run > best[w]) best[w] = run; } else run = 0; }
      }
    }
    return best;
  }
  var a = sweep(ras.rows, ras.cols, function (r, c) { return ras.grid[r][c]; }), b = sweep(ras.cols, ras.rows, function (r, c) { return ras.grid[c][r]; });
  WIDTHS.forEach(function (w, i) { var len = Math.max(a[i], b[i]) * g; if (len >= w) out[w] = Math.round(len); });
  return out;
}

/* ring: [[lat,lng],…] from api/parcel.js. buildings: { ok, list:[{ ring:[[lat,lng],…], sqFt? }], source } or null (not read).
   Never throws for a lot it cannot use: that is an answer ({ ok:false, reason }). */
function measure(ring, buildings, opts) {
  opts = opts || {};
  var setback = num(opts.setbackFt) != null ? num(opts.setbackFt) : DEFAULTS.setbackFt, clearFt = num(opts.buildingClearFt) != null ? num(opts.buildingClearFt) : DEFAULTS.buildingClearFt;
  if (!Array.isArray(ring) || ring.length < 3) return { v: VERSION, ok: false, reason: 'the parcel record carries no outline' };
  try {
    var origin = { lat: ring[0][0], lng: ring[0][1] }, raw = SF.toLocal(ring, origin), ang = longestEdgeAngle(raw), lot = rotate(raw, ang), lotSqFt = SF.areaFt2(lot);
    var read = !!(buildings && buildings.ok === true && Array.isArray(buildings.list)), polys = [], bSqFt = 0;
    if (read) buildings.list.slice(0, MAX_BUILDINGS).forEach(function (b) {
      if (!b || !Array.isArray(b.ring) || b.ring.length < 3) return;
      var p = rotate(SF.toLocal(b.ring, origin), ang), a = SF.areaFt2(p); if (!(a > 0)) return;
      polys.push({ poly: p, box: SF.bbox(p) }); bSqFt += a;
    });
    var ras = SF.buildable(lot, { setbackFt: setback, gridFt: opts.gridFt });
    var g = ras.gridFt, cells = 0;
    for (var r = 0; r < ras.rows; r++) for (var c = 0; c < ras.cols; c++) {
      if (!ras.grid[r][c]) continue;
      var x = ras.x0 + (c + 0.5) * g, y = ras.y0 + (r + 0.5) * g;
      for (var k = 0; k < polys.length; k++) {
        var bx = polys[k].box;
        if (x < bx.minX - clearFt || x > bx.maxX + clearFt || y < bx.minY - clearFt || y > bx.maxY + clearFt) continue;
        if (SF.inside(polys[k].poly, x, y) || SF.distToBoundary(polys[k].poly, x, y) < clearFt) { ras.grid[r][c] = 0; break; }
      }
      if (ras.grid[r][c]) cells++;
    }
    var rect = SF.largestRect(ras);
    return { v: VERSION, ok: true, lotSqFt: Math.round(lotSqFt), buildings: read ? { read: true, count: polys.length, sqFt: Math.round(Math.min(bSqFt, lotSqFt)), source: String(buildings.source || 'building footprints').slice(0, 60) } : { read: false, reason: String(buildings && buildings.reason || 'the building footprints were not read').slice(0, 160) },
      openSqFt: Math.round(Math.max(0, lotSqFt - (read ? Math.min(bSqFt, lotSqFt) : 0))), setbackFt: setback, buildingClearFt: clearFt,
      clear: { sqFt: Math.round(cells * g * g), rect: rect ? { wFt: Math.round(Math.max(rect.w, rect.h)), dFt: Math.round(Math.min(rect.w, rect.h)) } : null, runs: runs(ras), gridFt: g, coarsened: ras.coarsened === true } };
  } catch (e) { return { v: VERSION, ok: false, reason: String(e && e.message || e).slice(0, 160) }; }
}

/* does a w × d rectangle fit in what was measured? true, false, or null when nothing was measured */
function fitsIn(space, w, d) {
  if (!space || space.ok !== true || !space.clear) return null;
  var s = Math.min(w, d), l = Math.max(w, d), width = null;
  for (var i = 0; i < WIDTHS.length; i++) if (WIDTHS[i] >= s) { width = WIDTHS[i]; break; }
  if (width == null) return false;
  var run = space.clear.runs && space.clear.runs[width];
  return !!(run && run >= l);
}

/* ── the pad each use needs: the makers' own figures, or none ──────────── */
/* n units set side by side: each w × d, `gap` between them */
function row(n, w, d, gap) { return { wFt: r1(n * w + (n - 1) * gap), dFt: d }; }
function computeNeed(compute) {
  var ch = compute && compute.fits ? compute.chosen : null; if (!ch) return null;
  var n = ch.units || 1;
  if (compute.byChip) {
    var P = PS.POD.pad, pad = row(n, P.widthFt, P.lengthFt, P.betweenPodsFt);
    return { pad: pad, sqFt: Math.round(pad.wFt * pad.dFt), basis: 'maker', words: (n > 1 ? n + ' pods side by side, each on a ' : 'One ') + P.lengthFt + ' × ' + P.widthFt + ' ft pad' + (n > 1 ? ' with ' + P.betweenPodsFt + ' ft between' : '') + ' (the pod maker’s figure; its cooling sits on top of the pod). Truck and crane access is beside it and is not counted' };
  }
  if (ch.footprintFt) { var fp = row(n, ch.footprintFt.w, ch.footprintFt.d, 0); return { pad: fp, sqFt: Math.round(fp.wFt * fp.dFt), basis: 'maker', words: (n > 1 ? n + ' units, each on ' : 'One unit on ') + ch.footprintFt.w + ' × ' + ch.footprintFt.d + ' ft (' + ch.footprintFt.whose + ')' }; }
  if (ch.key === 'm75') { var S = OC.PRODUCT.skid; return { pad: { wFt: S.lengthFt, dFt: S.depthFt }, sqFt: Math.round(S.lengthFt * S.depthFt), basis: 'maker', words: 'The 75 kW skid is ' + S.lengthFt + ' × ' + S.depthFt + ' ft; its service clearances are not counted' }; }
  var F = CC.PARTNER.brief.site.footprintFt, one = { wFt: F.w, dFt: F.d }, big = row(n, F.w, F.d, 0);
  if (ch.klass === 'micro') return { pad: big, sqFt: Math.round(big.wFt * big.dFt), basis: 'maker', words: (n > 1 ? n + ' containers, each ' : 'A 1 MW container ') + 'with its coolers on ' + F.w + ' × ' + F.d + ' ft (' + CC.PARTNER.name + '’s figure for a 40 ft container and its dry coolers)' };
  /* a Nano pod between the skid and the container has no footprint on file: the container's is its upper bound */
  return { pad: one, sqFt: Math.round(one.wFt * one.dFt), basis: 'upper-bound', words: 'No footprint is on file for a ' + ch.label + ' unit. The 1 MW container and its coolers take ' + F.w + ' × ' + F.d + ' ft, which a smaller unit will not exceed' };
}

/* THE SPACE SCORE (2026-11-21, Tommy: "add that as something we can look at and score in the portfolio"): one number
   a site, 0 to 100, for the compute unit's pad on the clear ground, so a register of sites can be ranked on room as
   it is on power and return. 60 and up FITS: 60 where the clear ground is just the pad, rising to 100 at ten pads'
   worth. Under 40 does NOT fit: by how much of the pad the largest clear rectangle covers. Capped at 70 where the
   judgement is an upper bound (the buildings not read, or no footprint on file for that unit). Not judged is no
   score, never a zero. The rule is stated with every score. */
var SCORE = { fits: 60, ample: 85, upperBoundCap: 70, padsForFull: 10, missMax: 39 };
function scoreOf(space, need, fit, bound) {
  if (fit == null || !space || !space.clear) return null;
  var pts, why;
  if (fit) {
    var pads = need.sqFt > 0 ? space.clear.sqFt / need.sqFt : 1;
    pts = Math.round(SCORE.fits + (100 - SCORE.fits) * Math.min(1, Math.max(0, pads - 1) / (SCORE.padsForFull - 1)));
    why = 'the pad fits, with ' + (Math.round(pads * 10) / 10) + ' pads’ worth of clear ground';
    if (bound && pts > SCORE.upperBoundCap) { pts = SCORE.upperBoundCap; why += '; held at ' + SCORE.upperBoundCap + ' because the judgement is an upper bound'; }
  } else {
    var r = space.clear.rect, cover = r && need.sqFt > 0 ? Math.min(1, (r.wFt * r.dFt) / need.sqFt) : 0;
    pts = Math.min(SCORE.missMax, Math.round(SCORE.missMax * cover));
    why = r ? 'no clear rectangle the pad’s size; the largest covers ' + Math.round(cover * 100) + '% of it' : 'no clear rectangle at all';
  }
  var grade = pts >= SCORE.ample ? 'Ample' : pts >= SCORE.fits ? 'Fits' : 'No room';
  return { points: pts, grade: grade, upperBound: !!bound, words: 'Space score ' + pts + ' of 100 (' + grade + (bound && fit ? ', an upper bound' : '') + '): ' + why + '. ' + SCORE.fits + ' and up fits, ' + SCORE.ample + ' and up is ample, under ' + (SCORE.missMax + 1) + ' does not fit.' };
}

/* parcel: the stored parcel answer ({ ok, acres, space? }). res: { compute, bess, supercharger }. */
function spaceOf(parcel, res) {
  parcel = parcel || null; res = res || {};
  var sp = parcel && parcel.ok ? parcel.space || null : null, acres = parcel && parcel.ok ? num(parcel.acres) : null;
  if (!parcel || !parcel.ok) return { ok: false, measured: false, words: parcel && parcel.reason ? 'No parcel record: ' + parcel.reason : 'The parcel under the site is not read yet: run the screen', uses: {}, notes: [] };
  var measured = !!(sp && sp.ok === true), lotSqFt = measured ? sp.lotSqFt : acres != null ? Math.round(acres * SF.ACRE_FT2) : null;
  var out = { ok: lotSqFt != null, measured: measured, lotSqFt: lotSqFt, acres: lotSqFt != null ? Math.round(lotSqFt / SF.ACRE_FT2 * 100) / 100 : null, uses: {}, notes: [] };
  if (measured) {
    var b = sp.buildings || {}, rect = sp.clear.rect;
    out.buildings = b.read ? { read: true, count: b.count, sqFt: b.sqFt, coveragePct: lotSqFt ? Math.round(b.sqFt / lotSqFt * 100) : null, source: b.source } : { read: false, reason: b.reason || null };
    out.openSqFt = sp.openSqFt; out.clearSqFt = sp.clear.sqFt; out.clearRect = rect; out.setbackFt = sp.setbackFt; out.buildingClearFt = sp.buildingClearFt;
    out.words = 'A lot of ' + fmt(lotSqFt) + ' sq ft (' + out.acres + ' acres)' + (b.read ? b.count ? ', ' + b.count + ' building' + (b.count === 1 ? '' : 's') + ' on ' + fmt(b.sqFt) + ' sq ft (' + out.buildings.coveragePct + '% of it)' : ', no building on the record' : ', buildings not read') +
      '. Clear of the lot line by ' + sp.setbackFt + ' ft' + (b.read && b.count ? ' and of the buildings by ' + sp.buildingClearFt + ' ft' : '') + ': ' + fmt(sp.clear.sqFt) + ' sq ft' + (rect ? ', the largest clear rectangle about ' + rect.wFt + ' × ' + rect.dFt + ' ft' : ', with no clear rectangle');
    out.notes.push('Clear ground is the public record’s: inside the lot line and off the building footprints. Paving, parking stalls, drive aisles, canopies, tanks, easements, slope and the zoning setback are not read. A fit means a clear rectangle that size exists, not that the pad goes there.');
    out.notes.push('The ' + sp.setbackFt + ' ft from the lot line and ' + sp.buildingClearFt + ' ft from a building are this assessment’s assumptions, not the jurisdiction’s rule.');
    if (!b.read) out.notes.push('The building footprints were not read (' + (b.reason || 'no answer') + '): the fit below is judged on the lot line alone and is an upper bound.');
    if (parcel.partial) out.notes.push('The lot reaches past the map tile its outline was read from, so the outline is cut short: the lot and the clear ground are a lower bound.');
    if (sp.clear.coarsened) out.notes.push('The lot is large, so it was measured on a ' + sp.clear.gridFt + ' ft grid: the clear figures are conservative.');
  } else {
    out.words = lotSqFt != null ? 'A lot of ' + fmt(lotSqFt) + ' sq ft (' + out.acres + ' acres) on the parcel record. Its outline and buildings are not measured' + (sp && sp.reason ? ' (' + sp.reason + ')' : '') + ': read the lot to judge the fit' : 'The parcel record carries no area';
  }
  /* compute */
  var need = computeNeed(res.compute);
  if (need) {
    var fit = measured ? fitsIn(sp, need.pad.wFt, need.pad.dFt) : null, pct = lotSqFt ? Math.round(need.sqFt / lotSqFt * 1000) / 10 : null, bound = measured && !(sp.buildings && sp.buildings.read);
    var ub = bound || need.basis === 'upper-bound', score = scoreOf(sp, need, fit, ub);
    out.score = score;
    out.uses.compute = { needFt: need.pad, needSqFt: need.sqFt, basis: need.basis, fits: fit, lotPct: pct, upperBound: ub, score: score ? score.points : null,
      words: need.words + '. In all ' + need.pad.wFt + ' × ' + need.pad.dFt + ' ft, ' + fmt(need.sqFt) + ' sq ft' + (pct != null ? ' (' + pct + '% of the lot)' : '') + '. ' +
        (fit === true ? 'It fits the clear ground on the record' + (bound ? ', judged without the buildings' : '') + '.' : fit === false ? 'No clear rectangle that size is on the record' + (sp.clear.rect ? ' (the largest is about ' + sp.clear.rect.wFt + ' × ' + sp.clear.rect.dFt + ' ft)' : '') + '.' : 'Not judged: the lot’s outline is not measured.') };
  } else if (res.compute && !res.compute.fits) out.uses.compute = { fits: null, words: 'No compute unit is sized on this site’s power, so no pad is judged.' };
  /* battery and fast charging: the engines carry no footprint, and none is invented */
  if (res.bess && res.bess.ok) out.uses.bess = { fits: null, words: 'A ' + fmt(res.bess.sizing.kw) + ' kW / ' + fmt(res.bess.sizing.kwh) + ' kWh battery: its enclosure footprint and fire-code separation are not on file, so it is not judged.' };
  if (res.supercharger && res.supercharger.ok) out.uses.supercharger = { fits: null, stalls: res.supercharger.sizing.posts, words: res.supercharger.sizing.posts + ' dispensers take ' + res.supercharger.sizing.posts + ' parking stalls, plus the cabinets and the transformer: the stalls on the lot and the equipment pad are not on file, so it is not judged.' };
  return out;
}

module.exports = { VERSION: VERSION, DEFAULTS: DEFAULTS, WIDTHS: WIDTHS, SCORE: SCORE, scoreOf: scoreOf, configOf: configOf, measure: measure, fitsIn: fitsIn, computeNeed: computeNeed, spaceOf: spaceOf };
