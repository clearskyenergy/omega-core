/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/report.js — the executive report, the site report, the export
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Plain, printable HTML (the customer prints or saves as PDF from
   the browser, the same way the portal's other documents are handled) and
   a CSV whose columns match the results table. Every figure that carries
   an assumption carries it here too; a site that could not be sized is
   listed with what it needs, not omitted.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var csv = require('./csv'), agg = require('./aggregate');

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function n(v, d) { return v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0 }); }
function money(v) { return v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function kw(z) { return !z || z.kw == null ? '—' : (z.status === 'screening' && z.range ? n(z.range.kwLow) + '–' + n(z.range.kwHigh) + ' kW (range)' : n(z.kw) + ' kW'); }
function kwh(z) { return !z || z.kwh == null ? '—' : (z.status === 'screening' && z.range ? n(z.range.kwhLow) + '–' + n(z.range.kwhHigh) + ' kWh (range)' : n(z.kwh) + ' kWh'); }

var STYLE = 'body{font:14px/1.5 system-ui,sans-serif;color:#0B2733;max-width:1000px;margin:32px auto;padding:0 20px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:26px 0 8px;border-bottom:1px solid #DCECF1;padding-bottom:4px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #EFF8FA;vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#86A0A9}.k{display:inline-block;padding:2px 8px;border-radius:999px;background:#F1FAFC;font-size:12px;font-weight:600}.muted{color:#3F5D68}.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:14px 0}.kv div{padding:10px 12px;background:#F1FAFC;border-radius:10px}.kv small{display:block;color:#3F5D68;font-size:12px}.kv b{font-size:20px}ul{margin:6px 0 6px 18px}@media print{body{margin:0}}';

function group(sites) {
  var g = { ready: [], preliminary: [], info: [], hold: [], failed: [] };
  (sites || []).forEach(function (r) {
    var z = r.sizing || {}, sc = r.screening || {};
    if (sc.disposition === 'no') g.failed.push(r);
    else if (sc.disposition === 'hold') g.hold.push(r);
    else if (sc.disposition === 'info' || z.status === 'unable' || !z.status) g.info.push(r);
    else if (z.status === 'detailed' && sc.disposition === 'pass') g.ready.push(r);
    else g.preliminary.push(r);
  });
  return g;
}

function siteRow(r) {
  var z = r.sizing || {}, sc = r.screening || {};
  return '<tr><td><b>' + esc(r.siteId) + '</b><br><span class="muted">' + esc(r.name) + '</span></td><td>' + esc(r.addressLine) + '</td><td>' + esc(sc.label || '—') + '</td><td>' + esc(z.statusLabel || '—') + '</td><td>' + kw(z) + '</td><td>' + kwh(z) + '</td><td>' + (z.durationH ? n(z.durationH, 1) + ' h' : '—') + '</td><td>' + (z.confidence ? z.confidence.score : '—') + '</td><td>' + esc(sc.blocker || r.nextAction || '') + '</td></tr>';
}

function executive(portfolio, sites, opts) {
  opts = opts || {}; var s = agg.summary(sites), g = group(sites);
  function section(title, list, note) {
    return '<h2>' + esc(title) + ' <span class="k">' + list.length + '</span></h2>' + (note ? '<p class="muted">' + esc(note) + '</p>' : '') + (list.length ? '<table><thead><tr><th>Site</th><th>Address</th><th>Screening</th><th>Sizing</th><th>Power</th><th>Energy</th><th>Duration</th><th>Conf.</th><th>Blocker / next</th></tr></thead><tbody>' + list.map(siteRow).join('') + '</tbody></table>' : '<p class="muted">None.</p>');
  }
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(portfolio.name || 'Portfolio') + ' — BESS screening</title><style>' + STYLE + '</style></head><body>'
    + '<p class="muted">' + esc(opts.brandName || 'Portfolio BESS screening') + '</p><h1>' + esc(portfolio.name || 'Portfolio') + ' — BESS screening and sizing</h1><p class="muted">Prepared ' + esc(new Date(opts.now || Date.now()).toLocaleString()) + ' · ' + esc(s.line) + '</p>'
    + '<div class="kv"><div><small>Sites uploaded</small><b>' + s.sites + '</b></div><div><small>Processed</small><b>' + s.processed + '</b></div><div><small>Detailed sizes</small><b>' + s.detailed + '</b></div><div><small>Preliminary sizes</small><b>' + s.preliminary + '</b></div><div><small>Screening estimates</small><b>' + s.screening + '</b></div><div><small>Need information</small><b>' + s.needsInfo + '</b></div><div><small>On hold</small><b>' + s.hold + '</b></div><div><small>Not viable</small><b>' + s.notViable + '</b></div>'
    + '<div><small>Recommended MW · ' + s.sitesInTotal + ' sites</small><b>' + n(s.totalMw, 2) + '</b></div><div><small>Recommended MWh</small><b>' + n(s.totalMwh, 2) + '</b></div><div><small>Screening ranges · MW</small><b>' + n(s.rangeKwLow / 1000, 2) + '–' + n(s.rangeKwHigh / 1000, 2) + '</b></div>'
    + '<div><small>Estimated CAPEX · ' + s.capexSites + ' sites</small><b>' + (s.capex != null ? money(s.capex) : 'n/a') + '</b></div><div><small>Estimated savings/yr · ' + s.savingsSites + ' sites</small><b>' + (s.savingsYr != null ? money(s.savingsYr) : 'n/a') + '</b></div><div><small>Incentives</small><b>n/a</b><small>' + esc(s.incentivesNote) + '</small></div></div>'
    + '<p class="muted">Totals are the sum of detailed and preliminary site sizes only. Screening ranges are shown separately and never added. CAPEX and savings are summed only over the sites whose financial result exists and carry their assumptions on the site report. "Pass" is preliminary platform screening, not utility approval, a permit, final engineering or interconnection approval.</p>'
    + section('Sites ready to advance', g.ready, 'Detailed size, electrical limits known, equipment fits the stated area.')
    + section('Sites with preliminary results', g.preliminary, 'Sized on billed peaks, partial interval data or a screening range; assumptions apply and are listed per site.')
    + section('Sites requiring more information', g.info, 'Each site lists exactly what would let it be sized.')
    + section('Sites with potential grid constraints', g.hold, 'Customer-supplied hosting capacity or interconnection limits are well below the load; confirm with the utility.')
    + section('Sites that did not pass screening', g.failed, 'A hard constraint rules the site out as supplied.')
    + '</body></html>';
}

function siteReport(portfolio, r, opts) {
  opts = opts || {}; var z = r.sizing || {}, sc = r.screening || {}, q = r.quality || {}, fin = r.financial || {}, f = r.fields || {};
  function list(items) { return items && items.length ? '<ul>' + items.map(function (i) { return '<li>' + esc(typeof i === 'string' ? i : (i.label || JSON.stringify(i))) + '</li>'; }).join('') + '</ul>' : '<p class="muted">None.</p>'; }
  var fieldsRows = Object.keys(f).map(function (k) { var v = f[k]; return '<tr><td>' + esc(k) + '</td><td>' + esc(v.value) + (v.units ? ' ' + esc(v.units) : '') + '</td><td>' + esc(v.kind) + ' · ' + esc(v.confidence) + '</td><td>' + esc(v.source && v.source.file ? v.source.file + (v.source.field ? ' › ' + v.source.field : '') + (v.source.row ? ' (row ' + v.source.row + ')' : '') : '—') + '</td><td>' + esc(v.importedAt ? String(v.importedAt).slice(0, 10) : '') + '</td></tr>'; }).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(r.siteId) + ' — BESS sizing</title><style>' + STYLE + '</style></head><body>'
    + '<p class="muted">' + esc(opts.brandName || '') + ' · ' + esc(portfolio.name || '') + '</p><h1>' + esc(r.siteId) + ' · ' + esc(r.name) + '</h1><p>' + esc(r.addressLine) + '</p>'
    + '<div class="kv"><div><small>Screening</small><b style="font-size:16px">' + esc(sc.label || '—') + '</b></div><div><small>Sizing</small><b style="font-size:16px">' + esc(z.statusLabel || '—') + '</b></div><div><small>Data completeness</small><b>' + (q.completeness != null ? q.completeness : '—') + '</b></div><div><small>Confidence</small><b>' + (z.confidence ? z.confidence.score + ' · ' + z.confidence.label : '—') + '</b></div></div>'
    + (sc.caveat ? '<p class="muted">' + esc(sc.caveat) + '</p>' : '')
    + '<h2>Recommended configuration</h2>' + (z.kw != null ? '<div class="kv"><div><small>Power</small><b>' + kw(z) + '</b></div><div><small>Nameplate energy</small><b>' + kwh(z) + '</b></div><div><small>Usable energy</small><b>' + n(z.usableKwh) + ' kWh</b></div><div><small>Duration</small><b>' + n(z.durationH, 1) + ' h</b></div><div><small>PCS / inverter</small><b>' + n(z.pcsKw) + ' kW</b></div><div><small>Est. peak reduction</small><b>' + n(z.peakReductionKw) + ' kW</b></div></div>'
      + (z.config ? '<p><b>Equipment:</b> ' + z.config.qty + ' × ' + esc(z.config.name) + ' (' + esc(z.config.sku) + ') = ' + n(z.config.totalKw) + ' kW / ' + n(z.config.totalKwh) + ' kWh' + (z.config.integrates && z.config.integrates.pcs ? ' · PCS integrated' : ' · PCS separate') + '</p>' : '<p class="muted">No catalog product covers this size within 6 units.</p>')
      + '<p><b>Primary use case:</b> ' + esc(z.useCase) + '</p>' + (z.range ? '<p class="muted">' + esc(z.range.note) + '</p>' : '')
      + (z.constraints ? '<p><b>Electrical:</b> ' + (z.constraints.cappedBy.length ? 'capped by ' + esc(z.constraints.cappedBy.join(', ')) + ' (uncapped need ' + n(z.constraints.uncappedKw) + ' kW)' : (z.constraints.verification ? esc(z.constraints.verification) : 'within the supplied limits')) + '</p>' : '')
      + (z.fit ? '<p><b>Equipment fit:</b> ' + (z.fit.fits ? 'fits' : 'does not fit') + ' — ' + esc(z.fit.basis) + ', ' + n(z.fit.neededSqft) + ' of ' + n(z.fit.availableSqft) + ' sq ft</p>' : '')
      + '<h2>Alternatives</h2>' + (z.alternatives && z.alternatives.length ? '<table><thead><tr><th>Option</th><th>Power</th><th>Energy</th></tr></thead><tbody>' + z.alternatives.map(function (a) { return '<tr><td>' + esc(a.label) + '</td><td>' + n(a.kw) + ' kW</td><td>' + n(a.kwh) + ' kWh</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">None.</p>')
      : '<p class="muted">' + esc(z.reason || 'Not sized.') + '</p>')
    + '<h2>Assumptions</h2>' + list(z.assumptions) + '<h2>Information still required</h2>' + list((z.required || []).concat((q.missing || []).map(function (m) { return m.label; })))
    + '<h2>Financial</h2>' + (fin.status && fin.status !== 'unavailable' ? '<div class="kv"><div><small>Savings / yr (' + esc(fin.status) + ')</small><b>' + money(fin.savingsYr) + '</b></div><div><small>CAPEX (' + esc(fin.capexBasis) + ')</small><b>' + money(fin.capex) + '</b></div><div><small>Simple payback</small><b>' + (fin.paybackYr != null ? fin.paybackYr + ' yr' : '—') + '</b></div></div>' + list(fin.assumptions) : '<p class="muted">Unavailable: ' + esc(fin.reason || '') + '</p>') + '<p class="muted">Still required for a complete financial analysis:</p>' + list(fin.required)
    + '<h2>Screening factors</h2><table><tbody>' + Object.keys(sc.factors || {}).map(function (k) { var v = sc.factors[k]; return '<tr><td>' + esc(k) + '</td><td>' + (v.ok === true ? '✓' : v.ok === false ? '✗' : '·') + '</td><td>' + esc(v.note || (v.score != null ? 'score ' + v.score + ' · completeness ' + v.completeness : '')) + '</td></tr>'; }).join('') + '</tbody></table>' + list(sc.reasons)
    + '<h2>Imported data and provenance</h2><table><thead><tr><th>Field</th><th>Value</th><th>Kind · confidence</th><th>Source</th><th>Imported</th></tr></thead><tbody>' + fieldsRows + '</tbody></table>'
    + '<h2>Documents</h2>' + ((r.documents || []).length ? '<ul>' + r.documents.map(function (d) { return '<li>' + esc(d.name) + ' · ' + esc(d.type) + ' · ' + n(d.size) + ' bytes</li>'; }).join('') + '</ul>' : '<p class="muted">None matched.</p>')
    + '<h2>Processing history</h2>' + ((r.history || []).length ? '<ul>' + r.history.slice(-20).map(function (h) { return '<li>' + esc(h.at) + ' · ' + esc(h.what) + (h.by ? ' · ' + esc(h.by) : '') + '</li>'; }).join('') + '</ul>' : '<p class="muted">None.</p>')
    + '</body></html>';
}

var COLUMNS = ['Site ID', 'Site name', 'Address', 'Utility', 'Screening disposition', 'Sizing status', 'Recommended kW', 'Recommended kWh', 'Usable kWh', 'Duration h', 'PCS kW', 'Equipment', 'Quantity', 'Est. peak reduction kW', 'Capped by', 'Data completeness', 'Confidence', 'Primary blocker', 'Next action', 'Savings/yr', 'CAPEX', 'Financial status', 'Assumptions', 'Information required', 'Last processed'];
function csvRows(sites) {
  return [COLUMNS].concat((sites || []).map(function (r) {
    var z = r.sizing || {}, sc = r.screening || {}, q = r.quality || {}, fin = r.financial || {}, f = r.fields || {};
    return [r.siteId, r.name, r.addressLine, f.utility ? f.utility.value : '', sc.label || '', z.statusLabel || '', z.status === 'screening' && z.range ? z.range.kwLow + '-' + z.range.kwHigh : (z.kw != null ? z.kw : ''), z.status === 'screening' && z.range ? z.range.kwhLow + '-' + z.range.kwhHigh : (z.kwh != null ? z.kwh : ''), z.usableKwh != null ? z.usableKwh : '', z.durationH != null ? z.durationH : '', z.pcsKw != null ? z.pcsKw : '', z.config ? z.config.sku : '', z.config ? z.config.qty : '', z.peakReductionKw != null ? z.peakReductionKw : '', z.constraints ? z.constraints.cappedBy.join('; ') : '', q.completeness != null ? q.completeness : '', z.confidence ? z.confidence.score : '', sc.blocker || '', r.nextAction || '', fin.savingsYr != null ? fin.savingsYr : '', fin.capex != null ? fin.capex : '', fin.status || '', (z.assumptions || []).join(' | '), (z.required || []).concat((q.missing || []).map(function (m) { return m.label; })).join(' | '), r.processedAt || ''];
  }));
}
function exportCsv(sites) { return csv.stringify(csvRows(sites)); }

module.exports = { executive: executive, siteReport: siteReport, csvRows: csvRows, exportCsv: exportCsv, group: group, COLUMNS: COLUMNS };
