/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/plant-stats.js — the plant as a map: what is at each station,
   how long units sit there, where the line is slow
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Everything is read off the unit records the scan engine already
   writes: `startedAt` (first arrival), `done{station: leftAt}` (the moment
   the NEXT bench scanned it in) and `arrivedAt` (its current bench). No
   second log, no clock the units do not carry. So a dwell time is exactly
   what the benches reported, and a plant with no scans yet has no numbers
   rather than invented ones.

   dwell at station i  = done[i] − (i === 0 ? startedAt : done[i − 1])
   still at station i  = now − arrivedAt

   Median is the headline (one cabinet that waited over a weekend should not
   move the number every operator sees); the average and the 90th percentile
   are beside it so a long tail is visible. The bottleneck is the station
   with the highest median dwell among those with enough samples; the
   busiest is the one holding the most units right now.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var MIN_SAMPLES = 3;
var MAX_UNITS = 2000;

function ms(v) {
  if (!v) return NaN;
  if (typeof v === 'string') return Date.parse(v);
  if (typeof v === 'number') return v;
  if (v.toDate) return v.toDate().getTime();
  if (v.seconds != null) return v.seconds * 1000;
  return NaN;
}
function hours(a, b) { var d = (b - a) / 3600000; return isFinite(d) && d >= 0 && d < 24 * 365 ? d : NaN; }
function round1(n) { return Math.round(n * 10) / 10; }
function stats(list) {
  var v = list.filter(function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; });
  if (!v.length) return { samples: 0, median: null, avg: null, p90: null };
  var mid = Math.floor(v.length / 2), median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  var avg = v.reduce(function (t, x) { return t + x; }, 0) / v.length;
  return { samples: v.length, median: round1(median), avg: round1(avg), p90: round1(v[Math.min(v.length - 1, Math.floor(v.length * 0.9))]) };
}
function weekStart(t) { var d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }

/* routing: [{key,label}] in order · units: unit records · now: ms or ISO */
function stationMap(routing, units, now, opts) {
  opts = opts || {};
  routing = (routing || []).filter(function (s) { return s && s.key; });
  var nowMs = ms(now) || Date.now(), weeks = Math.max(1, Math.min(26, Number(opts.weeks) || 8));
  var idx = {}; routing.forEach(function (s, i) { idx[s.key] = i; });
  var rows = routing.map(function (s) { return { key: s.key, label: s.label || s.key, here: 0, hold: 0, dwell: [], stuck: [], finished7d: 0, oldestHereHours: null }; });
  var lead = [], finishedAt = [], wip = 0, held = 0, notStarted = 0, finished = 0;
  var lastKey = routing.length ? routing[routing.length - 1].key : null;
  (units || []).slice(0, MAX_UNITS).forEach(function (u) {
    if (!u || (opts.shipUnitsOnly && !u.shipUnit) || u.inventoryStatus === 'void') return;   /* a voided typo is not a unit */
    var done = u.done && typeof u.done === 'object' ? u.done : {};
    var started = ms(u.startedAt);
    /* dwell at every station it has LEFT */
    routing.forEach(function (s, i) {
      var end = ms(done[s.key]); if (!isFinite(end)) return;
      var start = i === 0 ? started : ms(done[routing[i - 1].key]);
      var h = hours(start, end); if (isFinite(h)) rows[i].dwell.push(h);
      if (s.key === (routing[routing.length - 2] || {}).key || (routing.length === 1)) { /* leaving the last working station = finished */ }
    });
    var at = String(u.at || '');
    if (!at) { notStarted++; return; }
    var i = idx[at];
    if (i == null) return;
    if (at === lastKey) {
      finished++;
      var fin = ms(routing.length > 1 ? done[routing[routing.length - 2].key] : u.arrivedAt);
      if (isFinite(fin)) { finishedAt.push(fin); if (nowMs - fin <= 7 * 86400000) rows[i].finished7d++; var lt = hours(started, fin); if (isFinite(lt)) lead.push(lt); }
      return;
    }
    wip++;
    rows[i].here++;
    if (u.hold) { rows[i].hold++; held++; }
    var since = hours(ms(u.arrivedAt) || (i === 0 ? started : ms(done[routing[i - 1].key])), nowMs);
    if (isFinite(since)) { rows[i].stuck.push(since); if (rows[i].oldestHereHours == null || since > rows[i].oldestHereHours) rows[i].oldestHereHours = round1(since); }
  });
  var out = rows.map(function (r) {
    var s = stats(r.dwell), here = stats(r.stuck);
    return { key: r.key, label: r.label, here: r.here, hold: r.hold, medianHours: s.median, avgHours: s.avg, p90Hours: s.p90, samples: s.samples,
      hereMedianHours: here.median, oldestHereHours: r.oldestHereHours, finished7d: r.finished7d };
  });
  var candidates = out.filter(function (r) { return r.samples >= MIN_SAMPLES && r.key !== lastKey; }).sort(function (a, b) { return b.medianHours - a.medianHours; });
  var busiest = out.filter(function (r) { return r.here > 0 && r.key !== lastKey; }).sort(function (a, b) { return b.here - a.here || b.hold - a.hold; });
  var byWeek = {}; finishedAt.forEach(function (t) { var w = weekStart(t); byWeek[w] = (byWeek[w] || 0) + 1; });
  var throughput = [];
  for (var k = weeks - 1; k >= 0; k--) { var w = weekStart(nowMs - k * 7 * 86400000); throughput.push({ week: w, finished: byWeek[w] || 0 }); }
  var leadStats = stats(lead);
  return { asOf: new Date(nowMs).toISOString(), stations: out, wip: wip, onHold: held, notStarted: notStarted, finished: finished,
    leadTimeHours: leadStats, throughput: throughput,
    bottleneck: candidates.length ? candidates[0].key : null, busiest: busiest.length ? busiest[0].key : null,
    sampled: Math.min((units || []).length, MAX_UNITS), minSamples: MIN_SAMPLES };
}

/* The steps each station carries, across the product list: what the map
   node says the bench DOES (plant-work.js decides it per unit). */
function stepsByStation(routing, products, stepsFor) {
  var by = {}; (products || []).forEach(function (p) { if (p && p.sku) by[p.sku] = p; });
  return (routing || []).map(function (s) {
    var items = [];
    (products || []).forEach(function (p) {
      if (!p || p.kind === 'service' || !(p.bom || []).length) return;
      var steps = stepsFor(p, s.key, by, null);
      if (steps.length) items.push({ sku: p.sku, name: p.name || p.sku, steps: steps.map(function (x) { return x.name; }) });
    });
    return { key: s.key, checks: Array.isArray(s.checks) ? s.checks : [], products: items.slice(0, 20) };
  });
}

module.exports = { stationMap: stationMap, stepsByStation: stepsByStation, stats: stats, MIN_SAMPLES: MIN_SAMPLES, MAX_UNITS: MAX_UNITS };
