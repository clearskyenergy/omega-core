/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The autopilot keeps the build on the parcel (Design with AI, Thomas,
 * 2026-10-03: "it put the solar on the parcel, which is the right thing and
 * the bess should also be in there").
 *
 * On 780 W Martin Luther King Jr Blvd, Los Angeles, the parcel is the whole
 * block (LA County APN 5019-025-063, 0.96 ac) but only ~134 ft deep. The road
 * lookup had failed, so the walk faced south, and layout() put each piece 30
 * ft further along it: the battery block landed on the sidewalk, the inverter
 * in the street and the building-loads panel on the lot across it.
 *
 * The planner (_plan, cut out of editor.html and run here on that very ring,
 * as LA County serves it) is held to:
 *   - every box the editor draws inside the parcel with the setback to spare
 *   - every run (parent → piece in a tree build, last piece → piece in a
 *     chain, exactly what placeBgbAt lays) on the lot, never across the line
 *   - no two boxes within the gap of each other
 *   - on open ground and with no parcel, the SAME spots the straight walk
 *     always gave, so nothing moves that did not have to
 *   - a lot too small says so, naming the piece, rather than drawing it
 *   - keep-outs for the array: one per piece but the PV hand-off
 * then a seeded fuzz over random lots, headings, scales and both builds.
 */
'use strict';
var fs = require('fs'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');
var i0 = src.indexOf('/* ── KEEPING EQUIPMENT OUT OF BUILDINGS');
var i1 = src.indexOf('function layout(', i0);
if (i0 < 0 || i1 < 0) { console.log('FAIL the planner block was not found in editor.html'); process.exit(1); }
function load(rootStub) {
  return new Function('ST', 'toPx', 'root', src.slice(i0, i1) +
    '\nreturn {_plan:_plan,_boxer:_boxer,_box:_box,_inPoly:_inPoly,_polyInPoly:_polyInPoly,_segOnLot:_segOnLot,' +
    '_clear:_clear,_room:_room,_spot:_spot,OUTDOOR_ONLY:OUTDOOR_ONLY,LOT_SETBACK_FT:LOT_SETBACK_FT,' +
    'PAD_GAP_FT:PAD_GAP_FT,KEEP_OUT_FT:KEEP_OUT_FT,STEP_FT:STEP_FT};')({ buildings: [] }, null, rootStub || {});
}
var G = load();

var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('ok   ' + name); } else { fail++; console.log('FAIL ' + name); } }

/* ── the site: LA County's own ring for APN 5019-025-063 (lng, lat) ───── */
var LA = [[-118.2860439055719, 34.010982559271476], [-118.28604331836235, 34.0108589977247], [-118.28604319106375, 34.01083140086672],
  [-118.28604225013468, 34.0106236369652], [-118.28624022404101, 34.01062198606284], [-118.28648020150625, 34.01062001532157],
  [-118.2867724440983, 34.01061761767531], [-118.28710461146723, 34.01061490453378], [-118.28710599908791, 34.010894414148844],
  [-118.28710428642779, 34.01090438067213], [-118.28710092781556, 34.01091391925248], [-118.28709601824083, 34.01092276011597],
  [-118.28708969655816, 34.01093065322177], [-118.28708214155986, 34.01093737533394], [-118.28707356691943, 34.010942736335025],
  [-118.28706421514825, 34.010946584603055], [-118.28705435073682, 34.01094881129979], [-118.28704425267436, 34.01094935344891],
  [-118.28677646537463, 34.01096309729385], [-118.2867766703196, 34.01096513022767], [-118.28677753523988, 34.01097680660271],
  [-118.28646791524476, 34.010992682565636], [-118.28624196011691, 34.010994592549046], [-118.28624188023308, 34.01098088088794]];
var FT_PER_M = 3.280839895;
/* The canvas the autopilot draws on: north up, y down, ppf px per foot. */
function project(ring, ppf) {
  var lat0 = 34.0108, lng0 = -118.2866, k = Math.cos(lat0 * Math.PI / 180);
  return ring.map(function (q) {
    return { x: 600 + (q[0] - lng0) * k * 111319.49 * FT_PER_M * ppf, y: 400 - (q[1] - lat0) * 111132.95 * FT_PER_M * ppf };
  });
}
/* ST.centre is centroid(ring): the mean of the vertices, as the autopilot takes it. */
function meanOf(ring) { var x = 0, y = 0; ring.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / ring.length, y: y / ring.length }; }

/* ── the editor's own sizes: EV_FOOTPRINT, the _evPx floors, BGB_NODES ── */
var EVF = { xfmr: { lf: 6, wf: 4 }, panel: { lf: 6, wf: 2.5 }, disco: { lf: 2, wf: 1.4 }, service: { lf: 3, wf: 2.5 },
            bess: { lf: 10, wf: 5 }, meter: { lf: 2.5, wf: 2 } };
var EVKIND = { utilxfmr: 'xfmr', mainswgr: 'panel', acblock: 'bess', pvinv: 'inverter', pv: 'solar', loads: 'panel',
               bess: 'bess', xfmr: 'xfmr', disco: 'disco', panel: 'panel', meter: 'meter', service: 'service' };
function rootFor(ppf) {
  return {
    _bgbNode: function (k) { return EVKIND[k] ? { evKind: EVKIND[k] } : null; },
    _evPx: function (kind, f) {
      f = f || EVF[kind] || { lf: 5, wf: 4 };
      var small = f.lf <= 4 && f.wf <= 4;
      return { w: Math.max(small ? 14 : 28, Math.round(f.lf * ppf)), h: Math.max(small ? 12 : 20, Math.round(f.wf * ppf)) };
    }
  };
}
var SOLAR = { seq: ['service', 'utilxfmr', 'mainswgr', 'acblock', 'pvinv', 'pv', 'loads'],
  parents: { utilxfmr: 'service', mainswgr: 'utilxfmr', acblock: 'mainswgr', pvinv: 'mainswgr', pv: 'pvinv', loads: 'mainswgr' } };
var BTM = { seq: ['bess', 'xfmr', 'disco', 'panel', 'meter', 'service'], parents: null };
var FP_2MWH = { lf: 20, wf: 8 };      /* _bessFootprint(2000, 1000) */

function planOn(ring, o) {
  var ppf = o.ppf, Gx = load(rootFor(ppf));
  var fp = o.fp || FP_2MWH;
  return Gx._plan({ Pc: o.Pc || meanOf(ring), v: o.v, ppf: ppf, ring: ring, blds: o.blds || [],
                    seq: o.build.seq, parents: o.build.parents, fp: fp, box: Gx._boxer(fp, ppf) });
}

/* Everything the plan promises, checked from the outside. */
function violations(p, ring, ppf, blds) {
  var out = [], lot = G.LOT_SETBACK_FT * ppf, gap = G.PAD_GAP_FT * ppf;
  p.placed.forEach(function (q) {
    if (ring && !G._polyInPoly(G._box(q.pt, q.w, q.h, lot), ring)) out.push(q.kind + ' box crosses the lot line');
  });
  p.nodes.forEach(function (n) {
    if (ring && !G._segOnLot(n.from, n.pt, ring)) out.push(n.kind + ' run leaves the lot');
    if (blds && blds.length && G.OUTDOOR_ONLY[n.kind]) {
      var q = p.placed.filter(function (z) { return z.pt === n.pt; })[0];
      if (!G._clear(n.pt, q.kind === 'acblock' || q.kind === 'bess' ? 20 : 8, q.kind === 'acblock' || q.kind === 'bess' ? 8 : 6,
                    { x: 0, y: 1 }, ppf, blds) &&
          !G._clear(n.pt, q.kind === 'acblock' || q.kind === 'bess' ? 20 : 8, q.kind === 'acblock' || q.kind === 'bess' ? 8 : 6,
                    { x: 1, y: 0 }, ppf, blds)) out.push(n.kind + ' is on a building');
    }
  });
  for (var a = 0; a < p.placed.length; a++) {
    for (var b = a + 1; b < p.placed.length; b++) {
      var A = p.placed[a], B = p.placed[b];
      if (Math.abs(A.pt.x - B.pt.x) < (A.w + B.w) / 2 + gap - 1e-6 && Math.abs(A.pt.y - B.pt.y) < (A.h + B.h) / 2 + gap - 1e-6)
        out.push(A.kind + ' and ' + B.kind + ' overlap');
    }
  }
  return out;
}

/* ── 1. the reported site, as reported: no roads, so the walk faces south ── */
console.log('780 W Martin Luther King Jr Blvd, solar + storage, facing south');
[1.45, 3].forEach(function (ppf) {
  var ring = project(LA, ppf), Pc = meanOf(ring), v = { x: 0, y: 1 };
  /* the old walk: anchor + v * (lf/2 + 30k), stopping before the POI */
  var off = SOLAR.seq.slice(1).filter(function (k, ix) {
    var want = FP_2MWH.lf / 2 + 30 * (ix + 1);
    return !G._inPoly({ x: Pc.x + v.x * want * ppf, y: Pc.y + v.y * want * ppf }, ring);
  });
  ok(off.length >= 3, ppf + ' px/ft: the straight walk left the parcel (' + off.join(', ') + ') - the bug, reproduced');
  var p = planOn(ring, { ppf: ppf, v: v, build: SOLAR });
  var bad = violations(p, ring, ppf);
  ok(bad.length === 0, ppf + ' px/ft: every piece and every run is inside the parcel' + (bad.length ? ' - ' + bad.join('; ') : ''));
  ok(p.nodes.map(function (n) { return n.kind; }).join() === SOLAR.seq.slice(1).join(), ppf + ' px/ft: every step is planned, in the build\'s order');
  ok(p.onLot === true, ppf + ' px/ft: the plan says it was held to a parcel');
  ok(p.moved.length > 0, ppf + ' px/ft: and says which pieces turned (' + p.moved.join(', ') + ')');
  var acb = p.placed.filter(function (q) { return q.kind === 'acblock'; })[0];
  ok(acb && G._inPoly(acb.pt, ring), ppf + ' px/ft: the battery block is on the parcel');
  ok(p.keepOut.length === p.placed.length - 1, ppf + ' px/ft: one keep-out per piece but the PV hand-off');
  ok(p.placed.every(function (q) {
    return q.kind === 'pv' || p.keepOut.some(function (z) { return G._polyInPoly(G._box(q.pt, q.w, q.h, 0), z); });
  }), ppf + ' px/ft: each keep-out covers its piece\'s box');
});

/* ── 2. every heading on that lot, both builds ─────────────────────────── */
console.log('\nthe same lot, every heading, both builds');
[1.45, 2.5].forEach(function (ppf) {
  var ring = project(LA, ppf);
  [SOLAR, BTM].forEach(function (build) {
    var badAll = [];
    for (var deg = 0; deg < 360; deg += 15) {
      var t = deg * Math.PI / 180, v = { x: Math.cos(t), y: Math.sin(t) };
      try {
        var p = planOn(ring, { ppf: ppf, v: v, build: build });
        violations(p, ring, ppf).forEach(function (m) { badAll.push(deg + '°: ' + m); });
        if (build === BTM && p.nodes.some(function (n) { return n.kind === 'service'; })) badAll.push(deg + '°: planned the POI');
      } catch (e) { badAll.push(deg + '°: threw ' + e.message); }
    }
    ok(badAll.length === 0, ppf + ' px/ft ' + (build === BTM ? 'battery chain' : 'solar + storage') + ': 24 headings, all on the lot'
      + (badAll.length ? ' - ' + badAll.slice(0, 4).join('; ') : ''));
  });
});

/* ── 3. a chain runs from the last piece, a tree from the parent ──────── */
console.log('\nwhere each run starts');
(function () {
  var ppf = 2, ring = project(LA, ppf);
  var c = planOn(ring, { ppf: ppf, v: { x: 0, y: 1 }, build: BTM });
  ok(c.nodes.every(function (n, ix) { return n.from === (ix ? c.nodes[ix - 1].pt : c.anchor); }),
     'battery chain: each run starts at the piece before it (BGB._lastEnd)');
  var t = planOn(ring, { ppf: ppf, v: { x: 0, y: 1 }, build: SOLAR });
  var at = {}; at.service = t.anchor; t.nodes.forEach(function (n) { at[n.kind] = n.pt; });
  ok(t.nodes.every(function (n) { return n.from === at[SOLAR.parents[n.kind]]; }),
     'solar + storage: each run starts at its parent (placeBgbAt\'s _pk)');
})();

/* ── 4. open ground and no parcel: the straight walk, untouched ──────── */
console.log('\nnothing moves that did not have to');
[BTM, SOLAR].forEach(function (build) {
  var ppf = 2, Pc = { x: 5000, y: 5000 }, v = { x: 0.6, y: 0.8 };
  var huge = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }];
  [huge, null].forEach(function (ring) {
    var Gx = load(rootFor(ppf));
    var p = Gx._plan({ Pc: Pc, v: v, ppf: ppf, ring: ring, blds: [], seq: build.seq, parents: build.parents,
                       fp: FP_2MWH, box: Gx._boxer(FP_2MWH, ppf) });
    var same = p.nodes.every(function (n, ix) {
      var want = FP_2MWH.lf / 2 + 30 * (ix + 1);
      return Math.abs(n.pt.x - (Pc.x + v.x * want * ppf)) < 1e-6 && Math.abs(n.pt.y - (Pc.y + v.y * want * ppf)) < 1e-6;
    });
    var label = (build === BTM ? 'battery chain' : 'solar + storage') + (ring ? ' on open ground' : ' with no parcel');
    ok(same && p.anchor === Pc && p.where === '', label + ': the same spots the straight walk gave');
    ok(p.moved.length === 0, label + ': nothing reported as moved');
    ok(p.onLot === !!ring, label + ': onLot says whether a parcel held it');
  });
});

/* ── 5. an L-shaped lot: the run never cuts the inside corner ────────── */
console.log('\nan L-shaped lot');
(function () {
  var ppf = 2, s = ppf;
  /* 200 ft x 200 ft with the top-right 140 x 140 ft taken out */
  var L = [{ x: 0, y: 0 }, { x: 60 * s, y: 0 }, { x: 60 * s, y: 140 * s }, { x: 200 * s, y: 140 * s },
           { x: 200 * s, y: 200 * s }, { x: 0, y: 200 * s }];
  var bad = [];
  [[0, 1], [1, 0], [0, -1], [1, -1], [1, 1]].forEach(function (h) {
    var n = Math.sqrt(h[0] * h[0] + h[1] * h[1]), v = { x: h[0] / n, y: h[1] / n };
    [BTM, SOLAR].forEach(function (build) {
      [{ x: 30 * s, y: 30 * s }, { x: 30 * s, y: 170 * s }, { x: 170 * s, y: 170 * s }].forEach(function (Pc) {
        try { violations(planOn(L, { ppf: ppf, v: v, Pc: Pc, build: build }), L, ppf).forEach(function (m) { bad.push(m); }); }
        catch (e) { bad.push('threw ' + e.message); }
      });
    });
  });
  ok(bad.length === 0, 'every heading, both builds, three starts: on the lot, no run across the notch' + (bad.length ? ' - ' + bad.slice(0, 3).join('; ') : ''));
  /* the mean of the L's vertices is OFF the lot: the first piece is moved on */
  var mean = meanOf(L);
  ok(!G._inPoly(mean, L), 'the L\'s vertex mean is not on the lot (the trap)');
  var p = planOn(L, { ppf: ppf, v: { x: 0, y: 1 }, Pc: mean, build: BTM });
  ok(G._inPoly(p.anchor, L) && /inside the parcel/.test(p.where), 'so the battery is moved onto it and the HUD says so: "' + p.where.trim() + '"');
  ok(violations(p, L, ppf).length === 0, 'and the rest follows it on');
})();

/* ── 6. a lot too small: refused, by name ─────────────────────────────── */
console.log('\na lot too small for the build');
(function () {
  var ppf = 2, tiny = [{ x: 0, y: 0 }, { x: 40 * ppf, y: 0 }, { x: 40 * ppf, y: 30 * ppf }, { x: 0, y: 30 * ppf }];
  var threw = null;
  try { planOn(tiny, { ppf: ppf, v: { x: 0, y: 1 }, build: SOLAR }); } catch (e) { threw = e.message; }
  ok(!!threw, 'a 40 x 30 ft lot cannot take seven pieces and the planner throws');
  ok(threw && /inside the parcel/.test(threw) && /place (it|the rest) by hand/.test(threw), 'naming the parcel and the way on: "' + threw + '"');
  var sliver = [{ x: 0, y: 0 }, { x: 400 * ppf, y: 0 }, { x: 400 * ppf, y: 6 * ppf }, { x: 0, y: 6 * ppf }];
  var t2 = null;
  try { planOn(sliver, { ppf: ppf, v: { x: 1, y: 0 }, build: BTM }); } catch (e) { t2 = e.message; }
  ok(t2 && /no room inside the parcel for the battery/.test(t2), 'a 6 ft sliver will not take the battery at all: "' + t2 + '"');
})();

/* ── 7. buildings and a parcel together (the 1395 case, held to a lot) ── */
console.log('\nbuildings on the lot');
(function () {
  var ppf = 2, s = ppf;
  var lot = [{ x: 0, y: 0 }, { x: 300 * s, y: 0 }, { x: 300 * s, y: 260 * s }, { x: 0, y: 260 * s }];
  var shop = [{ x: 80 * s, y: 60 * s }, { x: 220 * s, y: 60 * s }, { x: 220 * s, y: 180 * s }, { x: 80 * s, y: 180 * s }];
  var Pc = { x: 150 * s, y: 130 * s };                   /* the centre IS the building */
  var v = { x: 0, y: 1 };                                /* the road is south */
  var p = planOn(lot, { ppf: ppf, v: v, Pc: Pc, blds: [shop], build: BTM });
  ok(p.anchor.y < 60 * s && !G._inPoly(p.anchor, shop), 'the battery is behind the building (north of it, the road is south)');
  ok(/behind the building/.test(p.where), 'and the HUD says so');
  var bad = violations(p, lot, ppf, [shop]);
  ok(bad.length === 0, 'every piece on the lot, clear of each other, outdoor kit off the building' + (bad.length ? ' - ' + bad.join('; ') : ''));
  /* a lot tight behind the building: still on the lot, or a refusal */
  var tight = [{ x: 60 * s, y: 40 * s }, { x: 240 * s, y: 40 * s }, { x: 240 * s, y: 260 * s }, { x: 60 * s, y: 260 * s }];
  var r = null, e2 = null;
  try { r = planOn(tight, { ppf: ppf, v: v, Pc: Pc, blds: [shop], build: BTM }); } catch (e) { e2 = e.message; }
  ok((r && violations(r, tight, ppf, [shop]).length === 0) || (e2 && /inside the parcel/.test(e2)),
     'a lot tight behind the building: on the lot or refused, never over the line' + (e2 ? ' ("' + e2 + '")' : ''));
})();

/* ── 8. the boxes are the ones the editor draws ──────────────────────── */
console.log('\nthe box each step is measured by');
(function () {
  var ppf = 1.45, Gx = load(rootFor(ppf)), box = Gx._boxer(FP_2MWH, ppf);
  var acb = box('acblock'), xf = box('utilxfmr'), svc = box('service');
  ok(acb.w === Math.max(28, Math.round(20 * ppf)) && acb.h === 20, 'the battery block is its rated 20 x 8 ft, floored as _evPx floors it');
  ok(acb.lf === 20 && acb.wf === 8, 'and its real footprint is what the building check uses');
  ok(xf.w === 28 && xf.h === 20 && xf.lf === 8 && xf.wf === 6, 'a transformer: the 28 x 20 px floor drawn, the 8 x 6 ft envelope checked');
  ok(svc.w === 14 && svc.h === 12, 'the POI pedestal: the small floor');
  var big = load(rootFor(10))._boxer({ lf: 2, wf: 1 }, 10)('bess');
  ok(big.w >= 100 && big.h >= 50, 'a battery is never measured smaller than the default cabinet the chain first draws');
  var bare = load({})._boxer(FP_2MWH, 2)('xfmr');
  ok(bare.w === 16 && bare.h === 12, 'with no _evPx on the page: the real footprint at scale');
})();

/* ── 9. the fuzz: random lots, headings, scales, both builds ─────────── */
console.log('\nfuzz');
(function () {
  var seed = 20261003;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var runs = 0, placedRuns = 0, refusals = 0, bad = [];
  for (var n = 0; n < 400; n++) {
    var ppf = [1, 1.45, 2.5, 6][n % 4], cx = 2000, cy = 2000;
    /* a star-shaped lot (every vertex visible from the centre): 4 to 11
       vertices, 60 to 420 ft out, sometimes a rectangle */
    var ring = [], k = 4 + Math.floor(rnd() * 8);
    if (n % 5 === 0) {
      var w = (80 + rnd() * 400) * ppf, h = (60 + rnd() * 300) * ppf;
      ring = [{ x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy + h / 2 }, { x: cx - w / 2, y: cy + h / 2 }];
    } else {
      for (var q = 0; q < k; q++) {
        var a = (q + rnd() * 0.6) / k * 2 * Math.PI, r = (60 + rnd() * 360) * ppf;
        ring.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
    }
    var t = rnd() * 2 * Math.PI, v = { x: Math.cos(t), y: Math.sin(t) };
    var build = (n % 2) ? SOLAR : BTM;
    var fp = [{ lf: 5, wf: 3 }, { lf: 10, wf: 5 }, FP_2MWH, { lf: 40, wf: 9.5 }][n % 4];
    runs++;
    try {
      var p = planOn(ring, { ppf: ppf, v: v, Pc: meanOf(ring), build: build, fp: fp });
      placedRuns++;
      violations(p, ring, ppf).forEach(function (m) { bad.push('#' + n + ' ' + m); });
    } catch (e) {
      refusals++;
      if (!/place (it|the rest) by hand/.test(e.message)) bad.push('#' + n + ' threw something unhelpful: ' + e.message);
    }
  }
  ok(bad.length === 0, runs + ' random lots: ' + placedRuns + ' planned, all on the lot; ' + refusals + ' refused by name'
    + (bad.length ? ' - ' + bad.slice(0, 5).join('; ') : ''));
  ok(placedRuns > runs * 0.6, 'and most of them fit (' + placedRuns + ' of ' + runs + ')');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
