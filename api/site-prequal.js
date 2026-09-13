/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/site-prequal  —  the 100-point site screening rubric
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS EXISTS. The rubric used to run in editor.html, where any tenant
   could read the tier thresholds, the area bands and the recommendation
   logic straight out of the page. CLAUDE.md § "IP protection" puts scoring
   and eligibility in /api/, so the drawing-export pass moved the call here.
   It shipped the caller without the endpoint: editor.html POSTs to this path
   and, until this file existed, every screening returned 404. This is the
   server half, ported from the client implementation at editor.html
   (commit a4b571e) rather than rewritten, so the numbers do not move.

   Body:
     propertyAreaSf, buildingFootprintSf, parkingSpaces, pins   numbers
     zoningOk, floodOk                                          booleans
     hostingCapacityKw                                          number | null
     system: { kw, kwh, footprintSf }                           optional
   Returns:
     { systems, availableSf, fullScore, halfScore, bestScore, tier,
       recommend:{size,why}, capacity:{level,text}, inputComplete,
       breakdown:{ area:{full,half}, parking, title, zoning } }

   TWO THINGS THIS FILE REFUSES TO DO, both of which a screening tool gets
   wrong by default and both of which change a go/no-go answer:

   1. It never treats an unticked box as a confirmation. `zoningOk === true`,
      not `!== false`. An unanswered zoning question scores zero, because the
      person screening the site has not answered it.

   2. It never invents the system being screened. If the caller sends the
      configured design, the rubric is scaled to that design and labelled
      "Configured system". If it does not, the rubric stays on the published
      1 MW / 3.5 MWh benchmark and says so in the label. What it will not do
      is silently rescale a benchmark and present the result as though the
      project had been screened — a fixed pair makes every parcel return the
      same answer regardless of design, and a silent rescale makes a
      benchmark look like an engineered footprint. The label is the fix.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

/* The published benchmark. Only used when the caller sends no design. */
var BENCHMARK = {
  full: { label: 'Benchmark: 1 MW / 3.5 MWh', kw: 1000, kwh: 3500,
          areaTiers: [[4000, 60], [3000, 45], [1500, 25], [0, 5]] },
  half: { label: 'Benchmark: 0.5 MW / 1.75 MWh', kw: 500, kwh: 1750,
          areaTiers: [[2000, 60], [1500, 45], [750, 25], [0, 5]] }
};

function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

/* Area bands for a given required pad. Same shape as the benchmark tiers so
   one scorer serves both. */
function tiersFor(reqSf) {
  return [[reqSf, 60], [reqSf * 0.75, 45], [reqSf * 0.38, 25], [0, 5]]
    .map(function (t) { return [Math.round(t[0]), t[1]]; });
}

/* Resolve what is being screened. A design is only accepted when both kW and
   kWh are positive: half a nameplate is not a system, and scoring one would
   quietly answer a question nobody asked. */
function systemsFor(design) {
  var d = design || {};
  var kw = num(d.kw), kwh = num(d.kwh);
  if (!(kw > 0 && kwh > 0)) return { systems: BENCHMARK, configured: false };

  /* 1.65x the equipment footprint is the screening allowance for walkways,
     doors and service access. It is a proxy for a pad, not a pad: NFPA 855
     separation, setbacks and easements are an engineering site visit. */
  var footprint = num(d.footprintSf) || kwh / 4;
  var req = Math.max(1200, Math.round(footprint * 1.65));
  return {
    configured: true,
    systems: {
      full: { label: 'Configured system', kw: Math.round(kw), kwh: Math.round(kwh),
              areaTiers: tiersFor(req) },
      half: { label: '50% alternative', kw: Math.round(kw / 2), kwh: Math.round(kwh / 2),
              areaTiers: tiersFor(Math.round(req / 2)) }
    }
  };
}

function areaScore(availSf, sys) {
  var t = sys.areaTiers;
  for (var i = 0; i < t.length; i++) if (availSf >= t[i][0]) return t[i][1];
  return 0;
}
function parkScore(spaces) { spaces = num(spaces); return spaces === 0 ? 20 : (spaces <= 3 ? 12 : 6); }
function titleScore(pins) { return (num(pins) || 1) <= 1 ? 10 : 5; }
function zoningScore(zoningOk, floodOk) {
  /* Both confirmed for the full 10. This is a confirmation gate: silence is
     not a pass. */
  return (zoningOk && floodOk) ? 10 : ((zoningOk || floodOk) ? 5 : 0);
}
function tierOf(score) {
  return score >= 85 ? 'Priority Go' : (score >= 65 ? 'Conditional Go' : 'Hold / Needs Review');
}

/* Three states, not two. "Not entered" is not "adequate", and rendering them
   the same colour is how a capacity-constrained site keeps moving. */
function capacityFlag(capKw, fullKw, halfKw) {
  if (capKw === null || capKw === undefined || capKw === '' || !isFinite(Number(capKw)))
    return { text: 'Pending — enter hosting capacity', level: 'pending' };
  capKw = Number(capKw);
  if (capKw >= fullKw) return { text: 'Ample capacity for either system size', level: 'good' };
  if (capKw >= halfKw) return { text: 'Half system likely fits; verify full system with the utility', level: 'ok' };
  return { text: 'Below half-system size; likely needs a capacity upgrade', level: 'risk' };
}

/* Pure. Exported for the tests, which is the whole reason the scoring is not
   inlined in the handler. */
function score(inp) {
  inp = inp || {};
  var picked = systemsFor(inp.system), SYS = picked.systems;
  var propArea = num(inp.propertyAreaSf);
  var bldg = num(inp.buildingFootprintSf);
  var avail = Math.max(0, propArea - bldg);
  var spaces = num(inp.parkingSpaces);
  var pins = num(inp.pins) || 1;
  var zoningOk = inp.zoningOk === true;
  var floodOk = inp.floodOk === true;

  var common = parkScore(spaces) + titleScore(pins) + zoningScore(zoningOk, floodOk);
  var full = areaScore(avail, SYS.full) + common;
  var half = areaScore(avail, SYS.half) + common;
  var best = Math.max(full, half);

  var rec;
  if (full >= 85) rec = { size: 'full', why: 'Full system already scores Priority Go — no reason to downsize.' };
  else if (half > full && half >= 65) rec = { size: 'half', why: 'Half system reaches a better tier — downsizing recommended.' };
  else if (half > full) rec = { size: 'half', why: 'Half system scores higher, though still below Conditional Go.' };
  else rec = { size: 'full', why: 'Full system is the better or equal option.' };

  var cap = capacityFlag(inp.hostingCapacityKw, SYS.full.kw, SYS.half.kw);
  var inputComplete = propArea > 0;

  /* A grid constraint outranks a good area score, and an unanswered capacity
     question caps the answer at conditional. The rubric alone cannot say Go. */
  var tier = !inputComplete ? 'Incomplete — property area required'
    : (cap.level === 'risk' ? 'Hold — Grid Constraint'
    : (cap.level === 'pending' && best >= 65 ? 'Conditional — Capacity Pending' : tierOf(best)));

  return {
    systems: SYS, screenedConfiguredSystem: picked.configured,
    availableSf: avail, fullScore: full, halfScore: half, bestScore: best,
    tier: tier, recommend: rec, capacity: cap, inputComplete: inputComplete,
    breakdown: {
      area: { full: areaScore(avail, SYS.full), half: areaScore(avail, SYS.half) },
      parking: parkScore(spaces), title: titleScore(pins),
      zoning: zoningScore(zoningOk, floodOk)
    }
  };
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    /* A suspended or pending tenant does not get scoring. The editor hides
       the button; a function that refuses is the actual gate. */
    return A.db().collection('omega_orgs').doc(caller.orgId).get().then(function (s) {
      var org = s.exists ? (s.data() || {}) : null;
      if (!org || (org.status || 'active') !== 'active') throw A.httpError(403, 'tenant is not active');
      return A.billingOf(caller.orgId);
    }).then(function () {
      return score(req.body || {});
    });
  });
});

/* The scorer, reachable without the HTTP wrapper. */
module.exports.score = score;
module.exports.BENCHMARK = BENCHMARK;
