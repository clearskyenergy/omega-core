/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/aggregate.js — the portfolio summary, as a sum of its sites
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Totals are the sum of ELIGIBLE site results — detailed and
   preliminary sizes. A screening range is counted and reported as a range,
   never added to the recommended MW; an unsized site adds nothing. Money
   is summed only over sites whose financial result exists, and the count
   of sites it covers travels with the figure so a partial total is never
   read as a whole one.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

function summary(sites) {
  var s = { sites: 0, processed: 0, detailed: 0, preliminary: 0, screening: 0, needsInfo: 0, hold: 0, notViable: 0, failed: 0, pending: 0,
    pass: 0, conditional: 0, totalKw: 0, totalKwh: 0, rangeKwLow: 0, rangeKwHigh: 0, sitesInTotal: 0,
    capex: null, capexSites: 0, savingsYr: null, savingsSites: 0, incentives: null, incentivesNote: 'Incentives are not computed: no incentive inputs on a portfolio row' };
  (sites || []).forEach(function (r) {
    s.sites++;
    var st = r.status || 'uploaded';
    if (st === 'failed') { s.failed++; return; }
    if (['sized', 'needs_information', 'on_hold', 'not_viable', 'report_ready'].indexOf(st) < 0) { s.pending++; return; }
    s.processed++;
    var z = r.sizing || {}, sc = r.screening || {};
    if (z.status === 'detailed') s.detailed++; else if (z.status === 'preliminary') s.preliminary++; else if (z.status === 'screening') s.screening++;
    if (sc.disposition === 'info' || st === 'needs_information') s.needsInfo++;
    if (sc.disposition === 'hold') s.hold++;
    if (sc.disposition === 'no') s.notViable++;
    if (sc.disposition === 'pass') s.pass++;
    if (sc.disposition === 'conditional') s.conditional++;
    if ((z.status === 'detailed' || z.status === 'preliminary') && sc.disposition !== 'no') { s.totalKw += z.kw || 0; s.totalKwh += z.kwh || 0; s.sitesInTotal++; }
    if (z.status === 'screening' && z.range) { s.rangeKwLow += z.range.kwLow || 0; s.rangeKwHigh += z.range.kwHigh || 0; }
    var fin = r.financial || {};
    if (fin.capex != null && fin.status !== 'unavailable') { s.capex = (s.capex || 0) + fin.capex; s.capexSites++; }
    if (fin.savingsYr != null && fin.status !== 'unavailable') { s.savingsYr = (s.savingsYr || 0) + fin.savingsYr; s.savingsSites++; }
  });
  s.totalMw = +(s.totalKw / 1000).toFixed(3); s.totalMwh = +(s.totalKwh / 1000).toFixed(3);
  s.line = s.sites + ' sites uploaded → ' + (s.detailed + s.preliminary) + ' sized (' + s.detailed + ' detailed, ' + s.preliminary + ' preliminary) → ' + s.screening + ' screening estimate' + (s.screening === 1 ? '' : 's') + ' → ' + s.needsInfo + ' need more data → ' + s.hold + ' held → ' + s.notViable + ' not viable' + (s.failed ? ' → ' + s.failed + ' failed' : '') + (s.pending ? ' → ' + s.pending + ' pending' : '');
  return s;
}

/* The API's projection of a stored site: the row (full=false) or the whole record
   minus storage paths (full=true). Document paths never leave the server. */
function siteView(s, full) {
  var out = { siteId: s.siteId, name: s.name, addressLine: s.addressLine, status: s.status, nextAction: s.nextAction || null, processedAt: s.processedAt || null, error: s.error || null, projectId: s.projectId || null,
    utility: s.fields && s.fields.utility ? s.fields.utility.value : null, quality: s.quality || null, screening: s.screening ? { disposition: s.screening.disposition, label: s.screening.label, blocker: s.screening.blocker, caveat: s.screening.caveat } : null,
    sizing: s.sizing ? { status: s.sizing.status, statusLabel: s.sizing.statusLabel, kw: s.sizing.kw, kwh: s.sizing.kwh, durationH: s.sizing.durationH, range: s.sizing.range || null, confidence: s.sizing.confidence, config: s.sizing.config ? { sku: s.sizing.config.sku, name: s.sizing.config.name, qty: s.sizing.config.qty } : null, cappedBy: s.sizing.constraints ? s.sizing.constraints.cappedBy : [] } : null,
    financial: s.financial ? { status: s.financial.status, savingsYr: s.financial.savingsYr, capex: s.financial.capex, paybackYr: s.financial.paybackYr } : null, documents: (s.documents || []).length, warnings: s.warnings || [] };
  if (full) { out.fields = s.fields; out.months = s.months; out.documents = (s.documents || []).map(function (d) { return { id: d.id, name: d.name, type: d.type, size: d.size, uploadedAt: d.uploadedAt, container: d.container || null, interval: d.interval || null, matchedBy: d.matchedBy || null }; }); out.sizing = s.sizing; out.screening = s.screening; out.financial = s.financial; out.history = s.history || []; out.interval = s.interval || null; }
  return out;
}

module.exports = { summary: summary, siteView: siteView };
