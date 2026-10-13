/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/evcs-model.js — the EVCS revised model (WB2) as a
   MULTI-SHEET ANALYSIS PACKAGE, never as site lists (spec §6.2, Phase 2)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Recognised by its sheet set (Summary, Inputs, Monthly, Portfolio,
   10 Sites) and the Portfolio header row, not its filename.
     Portfolio  → per-site LEGACY SCENARIO records bound to Location ID
                  (source row kept for traceability only; columns bound by
                  header name, so reordering rows or columns changes nothing)
     Inputs     → an assumption set (driver, value, basis)
     Summary    → reconciliation metrics (kept, not recomputed here)
     10 Sites   → one shortlist (IDs, pods, IT/BESS, legacy capital)
     Monthly    → row count only in this phase (legacy financial scenario
                  parity — T26 — is Phase 4)
   It NEVER creates sites: an ID with no canonical site is reported, and
   WB2's meter / term / power columns are NOT imported (WB1 is the source of
   those facts; WB2 turns three blank meter flags into 0, which must not
   become a confirmed "false"). Everything here is labelled
   "EVCS legacy proxy v1 (WB2)" — a screen, never approved capacity.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var PROFILE = 'evcs-model-v1', SCENARIO = 'EVCS legacy proxy v1 (WB2 Portfolio)';
var SHEETS = ['Summary', 'Inputs', 'Monthly', 'Portfolio', '10 Sites'];
function text(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); }
function num(v) { var s = text(v); if (s === '') return null; var n = Number(s.replace(/[$,]/g, '')); return isFinite(n) ? n : null; }
function norm(h) { return text(h).toLowerCase().replace(/\s+/g, ' '); }
function headerRow(rows, must) { for (var i = 0; i < Math.min(rows.length, 15); i++) { var c = (rows[i].cells || []).map(norm); if (must.every(function (m) { return c.indexOf(m) >= 0; })) return i; } return -1; }
function col(cells, name) { return (cells || []).map(norm).indexOf(norm(name)); }

function detect(sheetNames) { return SHEETS.every(function (s) { return sheetNames.indexOf(s) >= 0; }); }

/* grids: { <sheetName>: xlsx.sheetGrid() } */
function parse(grids, opts) {
  opts = opts || {};
  var file = opts.file || null, out = { meta: { profile: PROFILE, sheets: Object.keys(grids), file: file }, sites: {}, rejected: [], assumptions: [], summary: {}, shortlist: null, monthlyRows: 0 };
  /* Portfolio */
  var P = grids.Portfolio.rows, ph = headerRow(P, ['id', '75 kw pods', 'it kw', 'facility kw', 'meter + term pods']);
  if (ph < 0) { var e = new Error('The model workbook\'s Portfolio sheet has no recognisable header row'); e.status = 400; throw e; }
  var H = P[ph].cells, ix = { id: col(H, 'ID'), srcRow: col(H, 'Source row'), reserve: col(H, 'EV reserve kW'), screen: col(H, 'Screen kW'), pods: col(H, '75 kW pods'), it: col(H, 'IT kW'), fac: col(H, 'Facility kW'), mt: col(H, 'Meter + term pods'), readiness: col(H, 'Readiness') };
  out.meta.portfolioHeaderRow = P[ph].r;
  P.slice(ph + 1).forEach(function (row) {
    var c = row.cells, id = text(c[ix.id]);
    if (!c.some(function (x) { return text(x) !== ''; })) return;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(id)) { out.rejected.push({ sheet: 'Portfolio', row: row.r, reason: 'No valid ID' }); return; }
    if (out.sites[id]) { out.rejected.push({ sheet: 'Portfolio', row: row.r, externalSiteId: id, reason: 'Duplicate ID ' + id }); return; }
    out.sites[id] = { scenario: SCENARIO, kind: 'proxied', evReserveKw: num(c[ix.reserve]), screenKw: num(c[ix.screen]), pods: num(c[ix.pods]), itKw: num(c[ix.it]), facilityKw: num(c[ix.fac]), meterTermPods: num(c[ix.mt]),
      readinessNote: ix.readiness >= 0 ? text(c[ix.readiness]).slice(0, 200) || null : null, source: { file: file, sheet: 'Portfolio', row: row.r, wb1SourceRow: num(c[ix.srcRow]) },
      caveat: 'Workbook screen using charger nameplate; not approved power, headroom, compute rights or utility approval.' };
  });
  /* Inputs: driver / value / basis */
  var I = grids.Inputs.rows, ih = headerRow(I, ['driver', 'value']);
  if (ih >= 0) I.slice(ih + 1).forEach(function (row) { var d = text(row.cells[0]), v = num(row.cells[1]); if (d && v != null) out.assumptions.push({ driver: d.slice(0, 120), value: v, basis: text(row.cells[2]).slice(0, 300) || null, source: { sheet: 'Inputs', cell: 'B' + row.r }, kind: 'assumed' }); });
  /* Summary: metric / one pod / sample */
  var S = grids.Summary.rows, sh = headerRow(S, ['metric']);
  if (sh >= 0) S.slice(sh + 1).forEach(function (row) { var m = text(row.cells[0]); if (!m) return; var a = num(row.cells[1]), b = num(row.cells[2]); if (a == null && b == null) return; out.summary[m.slice(0, 120)] = { onePod: a, sample: b, source: { sheet: 'Summary', row: row.r } }; });
  /* 10 Sites */
  var T = grids['10 Sites'].rows, th = headerRow(T, ['id', 'pods', 'it kw']);
  if (th >= 0) {
    var TH = T[th].cells, tx = { id: col(TH, 'ID'), pods: col(TH, 'Pods'), it: col(TH, 'IT kW'), bkw: col(TH, 'BESS kW'), bkwh: col(TH, 'BESS usable kWh'), cap: col(TH, 'Investor capital'), pay: col(TH, 'Payback months') }, sl = { name: '10-site legacy screening sample', scenario: SCENARIO, members: [], total: null, source: { sheet: '10 Sites' } };
    T.slice(th + 1).forEach(function (row) {
      var c = row.cells, id = text(c[tx.id]);
      if (/^total$/i.test(text(c[1])) || /^total$/i.test(id)) { sl.total = { pods: num(c[tx.pods]), itKw: num(c[tx.it]), bessKw: num(c[tx.bkw]), bessUsableKwh: num(c[tx.bkwh]), investorCapitalUsd: num(c[tx.cap]), row: row.r }; return; }
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(id)) return;
      sl.members.push({ externalSiteId: id, pods: num(c[tx.pods]), itKw: num(c[tx.it]), bessKw: num(c[tx.bkw]), bessUsableKwh: num(c[tx.bkwh]), investorCapitalUsd: num(c[tx.cap]), paybackMonths: num(c[tx.pay]), row: row.r });
    });
    out.shortlist = sl;
  }
  out.monthlyRows = grids.Monthly.rows.filter(function (r) { return /^\d+$/.test(text(r.cells[0])); }).length;
  return out;
}

/* parsed + existing { siteId: doc } → plan. Binds by canonical ID of the
   'evcs' namespace; never creates a site. Reconciles WB2 pods against the
   WB1-derived proxy on the site (the spreadsheet zero for missing power is
   legacyHistoricalPods, so it reconciles without becoming "0 pods"). */
function plan(parsed, existing, ctx) {
  var canon = ctx.canonicalSiteId, counts = { matched: 0, updated: 0, unchanged: 0, unmatched: 0, rejected: parsed.rejected.length, reconciliationMismatches: 0 }, changes = [], unmatched = [], mismatches = [];
  Object.keys(parsed.sites).sort().forEach(function (ext) {
    var id = canon(ctx.orgId, ctx.namespace || 'evcs', ext), prev = existing[id], w = parsed.sites[ext];
    if (!prev) { counts.unmatched++; unmatched.push(ext); return; }
    counts.matched++;
    var lp = prev.opportunity && prev.opportunity.legacyProxy;
    if (lp && w.pods != null && (lp.legacyHistoricalPods !== w.pods || (lp.status !== 'unable' && lp.meterTermPods !== w.meterTermPods))) { counts.reconciliationMismatches++; mismatches.push({ externalSiteId: ext, wb1Proxy: { pods: lp.legacyHistoricalPods, meterTermPods: lp.meterTermPods }, wb2: { pods: w.pods, meterTermPods: w.meterTermPods } }); }
    var was = prev.opportunity && prev.opportunity.wb2Legacy, nextComparable = JSON.stringify([w.pods, w.itKw, w.facilityKw, w.meterTermPods, w.evReserveKw, w.screenKw]);
    if (was && JSON.stringify([was.pods, was.itKw, was.facilityKw, was.meterTermPods, was.evReserveKw, was.screenKw]) === nextComparable) { counts.unchanged++; return; }
    counts.updated++; changes.push({ siteId: id, externalSiteId: ext, action: 'update', fieldChanges: [{ field: '@opportunity.wb2Legacy', from: was ? was.pods : null, to: w.pods, action: 'set' }] });
  });
  var sl = parsed.shortlist, slIds = sl ? sl.members.map(function (m) { return canon(ctx.orgId, ctx.namespace || 'evcs', m.externalSiteId); }) : [], slMissing = sl ? sl.members.filter(function (m, i) { return !existing[slIds[i]]; }).map(function (m) { return m.externalSiteId; }) : [];
  return { counts: counts, changes: changes, unmatched: unmatched, mismatches: mismatches, shortlistMissing: slMissing, shortlistSiteIds: slIds };
}
function apply(p, parsed, existing, ctx) {
  var writes = {}, before = {};
  p.changes.forEach(function (c) {
    var prev = existing[c.siteId], doc = JSON.parse(JSON.stringify(prev));
    before[c.siteId] = prev;
    doc.opportunity = Object.assign({}, doc.opportunity || {}, { wb2Legacy: Object.assign({ analysisId: ctx.analysisId, importId: ctx.importId }, parsed.sites[c.externalSiteId]) });
    doc.sourceRefs = (doc.sourceRefs || []).concat([{ importId: ctx.importId, sheet: 'Portfolio', row: parsed.sites[c.externalSiteId].source.row, profile: PROFILE }]).slice(-20);
    doc.revision = (prev.revision || 1) + 1; doc.updatedAt = ctx.now; doc.lastImportId = ctx.importId;
    writes[c.siteId] = doc;
  });
  return { writes: writes, before: before };
}
/* Fleet totals of a scenario: deduplicated by site, never mixed with
   verified capacity or nameplate. */
function totals(sites) {
  var t = { scenario: SCENARIO, sitesWithPods: 0, pods: 0, itKw: 0, facilityKw: 0, meterTermSites: 0, meterTermPods: 0, meterTermItKw: 0, sitesCounted: 0 }, seen = {};
  sites.forEach(function (s) { var w = s.opportunity && s.opportunity.wb2Legacy; if (!w || seen[s.siteId]) return; seen[s.siteId] = 1; t.sitesCounted++;
    if (w.pods > 0) { t.sitesWithPods++; t.pods += w.pods; t.itKw += w.itKw || 0; t.facilityKw += w.facilityKw || 0; }
    if (w.meterTermPods > 0) { t.meterTermSites++; t.meterTermPods += w.meterTermPods; t.meterTermItKw += w.pods > 0 ? w.meterTermPods * (w.itKw / w.pods) : 0; } });
  return t;
}
module.exports = { PROFILE: PROFILE, SCENARIO: SCENARIO, SHEETS: SHEETS, detect: detect, parse: parse, plan: plan, apply: apply, totals: totals };
