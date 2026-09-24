/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/interval.js — an interval / 8760 file as the engine reads it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE, over api/_lib/bess-engine.js's own parser: parseInterval() picks the
   load column, detectInterval() the step, monthSpans() decides whether the
   series is a complete year. A complete year goes to sizeFromInterval as
   is. A partial year is NOT padded or scaled — it is folded into ~30-day
   blocks with their true hours, so sizeFromMonthly sizes on billed-style
   peaks and the result is labelled preliminary with the reason.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var E = require('../bess-engine');

function series(text, opts) {
  opts = opts || {};
  var vals = E.parseInterval(String(text || ''));
  if (!vals || vals.length < 24) return { ok: false, error: 'Interval file has fewer than 24 readings', readings: (vals || []).length };
  if (vals.length > 105408) return { ok: false, error: 'Interval file has more than a year of 5-minute readings', readings: vals.length };
  var bad = 0; vals.forEach(function (v) { if (typeof v !== 'number' || !isFinite(v) || v < 0) bad++; });
  if (bad) return { ok: false, error: bad + ' readings are not finite, nonnegative kW (exports need a net-load column)', readings: vals.length };
  var intervalMin = opts.intervalMin || E.detectInterval(vals.length), spans = E.monthSpans(vals.length, intervalMin, opts.startMonth);
  var hrs = intervalMin / 60, peak = 0, sum = 0;
  vals.forEach(function (v) { if (v > peak) peak = v; sum += v; });
  return { ok: true, values: vals, intervalMin: intervalMin, readings: vals.length, hours: vals.length * hrs, completeYear: !!spans, peakKw: peak, kwh: sum * hrs, days: +(vals.length * hrs / 24).toFixed(1) };
}

/* Partial series → billing-style blocks the monthly sizer accepts. */
function toBlocks(vals, intervalMin) {
  var hrs = intervalMin / 60, per = Math.max(1, Math.round(30 * 24 / hrs)), out = [];
  for (var a = 0, m = 0; a < vals.length; a += per, m++) {
    var b = Math.min(vals.length, a + per), peak = 0, sum = 0;
    for (var i = a; i < b; i++) { if (vals[i] > peak) peak = vals[i]; sum += vals[i]; }
    if ((b - a) * hrs >= 24 * 7) out.push({ month: m, demandKw: peak, kwh: sum * hrs, hours: (b - a) * hrs });
  }
  return out;
}

module.exports = { series: series, toBlocks: toBlocks };
