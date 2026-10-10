/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/assets.js — the workspace asset register (Portfolio & Assets)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore, no network: api/portfolio-assets.js reads and writes,
   this decides. Extends the customer-portfolio modules beside it (csv.js,
   xlsx.js, ingest.js) rather than competing with them:

   - readUpload()   a CSV/XLSX becomes import RECORDS. The EVCS intake
                    profile (evcs.js) is recognised by signature; anything
                    else goes through the existing template ingester
                    (ingest.siteList) with its provenance records.
   - planImport()   records vs the register → created / updated / unchanged
                    / rejected counts and a FIELD-LEVEL diff, BEFORE any
                    write. A reviewed (or manually entered) fact that the
                    file would change is a CONFLICT, never silently
                    overwritten. Same file again → every site unchanged.
   - applyPlan()    the planned writes, plus the before-images an undo needs.
   - applyView()    a saved view (filters, sort, columns, scope) → the same
                    site IDs, with coverage and exclusions, every time.
   - summary()      fleet groups with coverage; nameplate, screened and
                    unknown never added together.
   - capabilities() role → what the caller may do (read, edit, import…).
   - exportCsv()    with spreadsheet formula-injection neutralised.

   Identity: siteId is canonical and stable — a hash of the org, the source
   namespace and the source's own ID (externalSiteIds[namespace]). Names,
   row numbers, addresses and APNs are never keys. Two source IDs at one
   address are two sites; the shared address is only a SUGGESTION.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var csv = require('./csv'), xlsx = require('./xlsx'), I = require('./ingest'), EVCS = require('./evcs'), EM = require('./evcs-model');

var SCHEMA_VERSION = 1;
var MAX_SITES = 2000;
function sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function fail(status, msg) { var e = new Error(msg); e.status = status; throw e; }
function clean(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n || 200); }

function canonicalSiteId(orgId, namespace, externalId) {
  return 's_' + sha(String(orgId).toLowerCase() + '|' + String(namespace).toLowerCase() + '|' + String(externalId).trim().toUpperCase()).slice(0, 20);
}
function safeNamespace(ns) { var s = String(ns || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32); return s || 'customer'; }

/* ── Upload → records ─────────────────────────────────────────────────── */
function gridFromCsv(text, name) {
  var rows = csv.parse(text, { maxRows: MAX_SITES + 50 });
  return { sheet: null, sheets: [], rows: rows.map(function (cells, i) { return { r: i + 1, cells: cells }; }), formulas: 0, file: name };
}
function genericRecords(grid, file, now, namespace) {
  /* The template ingester expects headers on the first row; find the first
     row that resolves a Site ID or address header (multi-row titles). */
  var rows = grid.rows, start = 0;
  for (var i = 0; i < Math.min(rows.length, 15); i++) {
    var keys = (rows[i].cells || []).map(function (h) { var f = require('./template').resolveHeader(h); return f && f.key; });
    if (keys.indexOf('siteId') >= 0 || keys.indexOf('address') >= 0) { start = i; break; }
  }
  var body = rows.slice(start), rowNo = body.map(function (r) { return r.r; });
  var out = I.siteList(body.map(function (r) { return r.cells; }), file, now);
  var records = out.sites.map(function (s) {
    var facts = {};
    Object.keys(s.fields).forEach(function (k) {
      if (['siteId', 'name', 'address', 'city', 'state', 'zip'].indexOf(k) >= 0) return;
      var f = s.fields[k], realRow = rowNo[(f.source.row || 1) - 1];
      facts[k] = { value: f.value, unit: f.units || null, kind: 'supplied', raw: String(f.value), source: { file: file, sheet: grid.sheet, row: realRow, header: f.source.field, externalSiteId: s.siteId, profile: 'template-v1' }, importedAt: now, reviewStatus: 'unreviewed' };
    });
    var g = function (k) { return s.fields[k] ? s.fields[k].value : null; };
    return { externalSiteId: s.siteId, namespace: namespace, row: rowNo[s.row - 1], name: s.name, address: { street: g('address'), city: g('city'), state: g('state'), zip: g('zip') == null ? null : String(g('zip')) },
      facts: facts, flags: (s.warnings || []).map(function (w) { return { code: 'IMPORT_WARNING', severity: 'info', message: w }; }), warnings: [], opportunity: null };
  });
  return { meta: { profile: 'template-v1', sheet: grid.sheet, sheets: grid.sheets, headerRow: rows[start] ? rows[start].r : null, unknownHeaders: out.unknownHeaders, footer: [], formulaCells: grid.formulas || 0 },
    records: records, rejected: out.problems.map(function (p) { return { row: rowNo[p.row - 1] || p.row, reason: p.error }; }) };
}
/* upload: { name, bytes(Buffer) } → { fileSha, profile, meta, records, rejected } */
function readUpload(upload, opts) {
  opts = opts || {};
  var name = clean(upload && upload.name, 240), bytes = upload && upload.bytes;
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail(400, 'The file is empty');
  if (bytes.length > 10 * 1024 * 1024) fail(413, 'Site lists are limited to 10 MB');
  var now = opts.now || new Date().toISOString(), grids = [];
  if (/\.xlsx$/i.test(name) || xlsx.isXlsx(bytes)) {
    if (!xlsx.isXlsx(bytes)) fail(400, 'This .xlsx file is not a valid workbook');
    if (/\.(xlsm|xlsb|xls)$/i.test(name)) fail(400, 'Macro-enabled or legacy Excel files are not accepted; save as .xlsx');
    var info = xlsx.inspect(bytes); xlsx.assertSafe(info);
    var names = info.sheets.map(function (s) { return s.name; });
    if (EM.detect(names)) {
      /* A multi-sheet analysis package, not a site list: it enriches existing sites. */
      var gs = {}; EM.SHEETS.forEach(function (sh) { gs[sh] = xlsx.sheetGrid(bytes, { sheet: sh, maxRows: MAX_SITES + 50 }); });
      var en = EM.parse(gs, { file: name });
      return { fileName: name, fileSha: sha(bytes), size: bytes.length, profile: EM.PROFILE, meta: { profile: EM.PROFILE, sheets: names, headerRow: en.meta.portfolioHeaderRow, footer: [], formulaCells: 0 }, records: [], rejected: en.rejected, enrichment: en };
    }
    var order = info.sheets.map(function (s) { return s.name; }).sort(function (a, b) { return (b === 'Intake') - (a === 'Intake'); });
    order.forEach(function (sh) { grids.push(xlsx.sheetGrid(bytes, { sheet: sh, maxRows: MAX_SITES + 50 })); });
  } else if (/\.(csv|txt)$/i.test(name)) {
    var text = bytes.toString('utf8');
    if (/\u0000/.test(text)) fail(400, 'This CSV contains binary data');
    grids.push(gridFromCsv(text, name));
  } else fail(400, 'Upload a .xlsx or .csv site list');
  var ns = opts.namespace ? safeNamespace(opts.namespace) : null, parsed = null;
  for (var i = 0; i < grids.length && !parsed; i++) if (EVCS.detect(grids[i])) parsed = EVCS.parse(grids[i], { file: name, now: now, namespace: ns || 'evcs' });
  if (!parsed) parsed = genericRecords(grids[0], name, now, ns || 'customer');
  if (parsed.records.length > MAX_SITES) fail(413, 'A register import is limited to ' + MAX_SITES + ' sites');
  return { fileName: name, fileSha: sha(bytes), size: bytes.length, profile: parsed.meta.profile, meta: parsed.meta, records: parsed.records, rejected: parsed.rejected };
}

/* ── Records → canonical site documents ──────────────────────────────── */
function addressKeyOf(a) { a = a || {}; return I.addressKey(a.street || '', a.city || '', a.state || '', a.zip || ''); }
function siteDocFrom(record, ctx) {
  var id = canonicalSiteId(ctx.orgId, record.namespace, record.externalSiteId), ext = {}; ext[record.namespace] = String(record.externalSiteId);
  return { schemaVersion: SCHEMA_VERSION, orgId: ctx.orgId, siteId: id, externalSiteIds: ext, name: clean(record.name, 200), address: record.address, addressKey: addressKeyOf(record.address),
    lifecycleStatus: 'active', operatingState: 'not_provided', facts: record.facts, flags: record.flags, opportunity: record.opportunity || null,
    sourceRefs: [{ importId: ctx.importId || null, file: (record.facts && Object.keys(record.facts).length ? (record.facts[Object.keys(record.facts)[0]].source || {}).file : null) || ctx.file || null, row: record.row, profile: ctx.profile || null }],
    portfolioIds: [], revision: 1, createdAt: ctx.now, updatedAt: ctx.now, createdByImport: ctx.importId || null, lastImportId: ctx.importId || null };
}
function same(a, b) { return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b); }
function protectedFact(f) { return !!f && (f.reviewStatus === 'reviewed' || f.kind === 'manual'); }

/* records + existing { siteId: doc } → plan (no writes). */
function planImport(records, existing, ctx) {
  existing = existing || {};
  var changes = [], counts = { created: 0, updated: 0, unchanged: 0, rejected: (ctx.rejected || []).length, conflicts: 0, conflictOnly: 0 }, suggestions = [];
  var byAddr = {}; Object.keys(existing).forEach(function (k) { var d = existing[k]; if (d && d.addressKey) (byAddr[d.addressKey] = byAddr[d.addressKey] || []).push(d.siteId); });
  var incomingAddr = {};
  records.forEach(function (r) {
    var id = canonicalSiteId(ctx.orgId, r.namespace, r.externalSiteId), prev = existing[id], fieldChanges = [];
    var ak = addressKeyOf(r.address);
    if (!prev) {
      (byAddr[ak] || []).concat(incomingAddr[ak] || []).forEach(function (other) { if (other !== id) suggestions.push({ siteId: id, externalSiteId: r.externalSiteId, sameAddressAs: other, action: 'review_only', note: 'Same normalized address, different source ID: kept as separate sites (not merged).' }); });
      (incomingAddr[ak] = incomingAddr[ak] || []).push(id);
      counts.created++; changes.push({ siteId: id, externalSiteId: r.externalSiteId, action: 'create', fields: Object.keys(r.facts).length });
      return;
    }
    (incomingAddr[ak] = incomingAddr[ak] || []).push(id);
    var pf = prev.facts || {}, keys = {};
    Object.keys(pf).concat(Object.keys(r.facts)).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).sort().forEach(function (k) {
      var was = pf[k], now = r.facts[k];
      var wasV = was ? was.value : undefined, nowV = now ? now.value : undefined;
      if (now && was && same(wasV, nowV)) return;
      if (!now && was && was.source && was.source.profile && was.kind === 'supplied') {
        /* The new file blanks a field the old one supplied: a blank is not a
           zero or a deletion — show it, keep the value, let a person decide. */
        fieldChanges.push({ field: k, from: wasV, to: null, action: 'blank_in_source', note: 'Blank in the new file; the previous value is kept' });
        return;
      }
      if (!now) return;
      if (protectedFact(was)) { fieldChanges.push({ field: k, from: wasV, to: nowV, action: 'conflict', reviewedBy: was.reviewedBy || null, reviewedAt: was.reviewedAt || null }); counts.conflicts++; return; }
      fieldChanges.push({ field: k, from: wasV === undefined ? null : wasV, to: nowV, action: 'set' });
    });
    if (!same(prev.name, clean(r.name, 200)) && r.name) fieldChanges.push({ field: '@name', from: prev.name, to: clean(r.name, 200), action: 'set' });
    if (!same(prev.address, r.address)) fieldChanges.push({ field: '@address', from: prev.address, to: r.address, action: 'set' });
    var real = fieldChanges.filter(function (c) { return c.action !== 'blank_in_source'; });
    if (!real.length) { counts.unchanged++; changes.push({ siteId: id, externalSiteId: r.externalSiteId, action: 'unchanged', fieldChanges: fieldChanges }); return; }
    var applicable = real.filter(function (c) { return c.action !== 'conflict'; });
    if (applicable.length) counts.updated++; else counts.conflictOnly = (counts.conflictOnly || 0) + 1;
    changes.push({ siteId: id, externalSiteId: r.externalSiteId, action: 'update', conflictOnly: !applicable.length, fieldChanges: fieldChanges });
  });
  var planHash = sha(JSON.stringify(changes.map(function (c) { return [c.siteId, c.action, (c.fieldChanges || []).map(function (f) { return [f.field, f.action, f.to]; })]; })));
  return { counts: counts, changes: changes, suggestions: suggestions, planHash: planHash };
}

/* Execute a plan → { writes: { siteId: doc }, before: { siteId: doc|null } }.
   acceptConflicts: ['<siteId>:<field>'] explicitly confirmed by a person. */
function applyPlan(plan, records, existing, ctx) {
  var accept = {}; (ctx.acceptConflicts || []).forEach(function (k) { accept[k] = true; });
  var recById = {}; records.forEach(function (r) { recById[canonicalSiteId(ctx.orgId, r.namespace, r.externalSiteId)] = r; });
  var writes = {}, before = {};
  plan.changes.forEach(function (c) {
    var r = recById[c.siteId];
    if (c.action === 'create') { before[c.siteId] = null; writes[c.siteId] = siteDocFrom(r, ctx); return; }
    if (c.action !== 'update') return;
    var prev = existing[c.siteId], doc = JSON.parse(JSON.stringify(prev)), appliedAny = false;
    c.fieldChanges.forEach(function (fc) {
      if (fc.action === 'blank_in_source' || (fc.action === 'conflict' && !accept[c.siteId + ':' + fc.field])) return;
      appliedAny = true;
    });
    if (!appliedAny) return;   /* only unaccepted conflicts: the reviewed values stand, nothing is written */
    before[c.siteId] = prev;
    c.fieldChanges.forEach(function (fc) {
      if (fc.field === '@name') { doc.name = fc.to; return; }
      if (fc.field === '@address') { doc.address = fc.to; doc.addressKey = addressKeyOf(fc.to); return; }
      if (fc.action === 'blank_in_source') return;
      if (fc.action === 'conflict' && !accept[c.siteId + ':' + fc.field]) return;
      var old = doc.facts[fc.field], nf = Object.assign({}, r.facts[fc.field]);
      if (old) nf.previous = [{ value: old.value, kind: old.kind, reviewStatus: old.reviewStatus, source: old.source || null, importedAt: old.importedAt || null, reviewedBy: old.reviewedBy || null }].concat(old.previous || []).slice(0, 5);
      if (fc.action === 'conflict') { nf.acceptedOverReviewBy = ctx.actor || null; nf.acceptedAt = ctx.now; }
      doc.facts[fc.field] = nf;
    });
    doc.flags = r.flags; doc.opportunity = r.opportunity || doc.opportunity || null;
    doc.sourceRefs = (doc.sourceRefs || []).concat([{ importId: ctx.importId, row: r.row, profile: ctx.profile || null }]).slice(-20);
    doc.revision = (prev.revision || 1) + 1; doc.updatedAt = ctx.now; doc.lastImportId = ctx.importId;
    writes[c.siteId] = doc;
  });
  return { writes: writes, before: before };
}

/* Undo an import's own changes: sites it created are removed only if
   nothing changed them since; sites it updated are restored only if they are
   still at the revision the import left. Anything touched later is skipped
   with a reason — undo never deletes pre-existing sites or later work. */
function planUndo(importRecord, current) {
  var ops = [], skipped = [];
  (importRecord.touched || []).forEach(function (t) {
    var cur = current[t.siteId];
    if (!cur) { skipped.push({ siteId: t.siteId, reason: 'Site no longer exists' }); return; }
    if (cur.lastImportId !== importRecord.id || cur.revision !== t.revisionAfter) { skipped.push({ siteId: t.siteId, reason: 'Changed after this import; undo would discard later work' }); return; }
    if (t.created) { if (cur.hasLinkedWork) { skipped.push({ siteId: t.siteId, reason: 'Has linked tasks, files or projects' }); return; } ops.push({ siteId: t.siteId, op: 'delete' }); }
    else ops.push({ siteId: t.siteId, op: 'restore' });
  });
  return { ops: ops, skipped: skipped };
}

/* ── Field review (optimistic concurrency) ───────────────────────────── */
function reviewField(doc, field, input, ctx) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(field)) fail(400, 'Unknown field');
  if (input.expectedRevision == null || Number(input.expectedRevision) !== doc.revision) fail(409, 'This site changed since you opened it (revision ' + doc.revision + '). Reload and review again.');
  var out = JSON.parse(JSON.stringify(doc)), old = out.facts[field] || null, nf;
  if (input.hasOwnProperty('value')) {
    nf = { value: input.value, unit: input.unit || (old && old.unit) || null, kind: 'manual', raw: input.value == null ? null : String(input.value), source: { enteredBy: ctx.actor, reason: clean(input.reason, 300) || null }, importedAt: null, reviewStatus: ctx.canReview ? 'reviewed' : 'entered_unreviewed', reviewedBy: ctx.canReview ? ctx.actor : null, reviewedAt: ctx.canReview ? ctx.now : null, enteredAt: ctx.now };
    if (old) { ['metricDefinition', 'measurementScope', 'observedPeriod', 'note'].forEach(function (k) { if (old[k] && !input.redefine) nf[k] = old[k]; }); nf.previous = [{ value: old.value, kind: old.kind, reviewStatus: old.reviewStatus, source: old.source || null }].concat(old.previous || []).slice(0, 5); }
  } else {
    if (!old) fail(404, 'No value to review for ' + field);
    var st = String(input.reviewStatus || '');
    if (['reviewed', 'needs_definition_review', 'disputed', 'unreviewed'].indexOf(st) < 0) fail(400, 'Unknown review status');
    if (!ctx.canReview) fail(403, 'Reviewing evidence needs an owner or admin role');
    nf = Object.assign({}, old, { reviewStatus: st, reviewedBy: ctx.actor, reviewedAt: ctx.now, reviewNote: clean(input.reason, 300) || null });
  }
  out.facts[field] = nf; out.revision = doc.revision + 1; out.updatedAt = ctx.now;
  return out;
}

/* ── Views, summary, export ──────────────────────────────────────────── */
function factVal(s, k) { var f = s.facts && s.facts[k]; return f && f.value != null ? f.value : null; }
function meterState(s) { var v = factVal(s, 'evcsOwnsMeter'); return v === true ? 'true' : v === false ? 'false' : 'unknown'; }
var SORTABLE = { name: function (s) { return String(s.name || '').toLowerCase(); }, state: function (s) { return (s.address && s.address.state) || ''; }, installedChargerKw: function (s) { return factVal(s, 'installedChargerKw'); },
  shaRemainingYears: function (s) { return factVal(s, 'shaRemainingYears'); }, externalId: function (s) { var k = Object.keys(s.externalSiteIds || {})[0]; return k ? s.externalSiteIds[k] : ''; }, updatedAt: function (s) { return s.updatedAt || ''; } };
function normalizeView(v) {
  v = v || {}; var f = v.filters || {};
  var filters = {
    q: clean(f.q, 80) || null,
    states: Array.isArray(f.states) ? f.states.map(function (x) { return clean(x, 4).toUpperCase(); }).filter(Boolean).slice(0, 60) : null,
    utility: clean(f.utility, 80) || null,
    meter: ['true', 'false', 'unknown'].indexOf(f.meter) >= 0 ? f.meter : null,
    power: ['known', 'unknown'].indexOf(f.power) >= 0 ? f.power : null,
    flag: /^[A-Z_]{3,40}$/.test(f.flag || '') ? f.flag : null,
    portfolioId: clean(f.portfolioId, 60) || null,
    minRemainingYears: isFinite(Number(f.minRemainingYears)) && f.minRemainingYears !== '' && f.minRemainingYears != null ? Number(f.minRemainingYears) : null
  };
  var sort = v.sort && SORTABLE[v.sort.field] ? { field: v.sort.field, dir: v.sort.dir === 'desc' ? 'desc' : 'asc' } : { field: 'externalId', dir: 'asc' };
  var pageSize = Math.max(10, Math.min(500, Number(v.pageSize) || 50)), page = Math.max(0, Math.floor(Number(v.page) || 0));
  return { name: clean(v.name, 80) || 'Untitled view', filters: filters, sort: sort, columns: Array.isArray(v.columns) ? v.columns.map(function (c) { return clean(c, 40); }).slice(0, 30) : null,
    pinned: Array.isArray(v.pinned) ? v.pinned.map(function (c) { return clean(c, 40); }).slice(0, 5) : [], pageSize: pageSize, page: page, scope: v.scope === 'this_page' ? 'this_page' : 'all_matching' };
}
function applyView(sites, view) {
  var v = normalizeView(view), f = v.filters, excluded = { archived: 0 };
  var list = sites.filter(function (s) {
    if (s.lifecycleStatus === 'archived') { excluded.archived++; return false; }
    if (f.q) { var hay = (s.name + ' ' + JSON.stringify(s.externalSiteIds) + ' ' + JSON.stringify(s.address || {})).toLowerCase(); if (hay.indexOf(f.q.toLowerCase()) < 0) return false; }
    if (f.states && f.states.length && f.states.indexOf(String((s.address || {}).state || '').toUpperCase()) < 0) return false;
    if (f.utility && String(factVal(s, 'utility') || '').toLowerCase() !== f.utility.toLowerCase()) return false;
    if (f.meter && meterState(s) !== f.meter) return false;
    if (f.power && (factVal(s, 'reportedPowerKw') != null ? 'known' : 'unknown') !== f.power) return false;
    if (f.flag && !(s.flags || []).some(function (x) { return x.code === f.flag; })) return false;
    if (f.portfolioId && (s.portfolioIds || []).indexOf(f.portfolioId) < 0) return false;
    if (f.minRemainingYears != null) { var r = factVal(s, 'shaRemainingYears'); if (r == null || r < f.minRemainingYears) return false; }
    return true;
  });
  var key = SORTABLE[v.sort.field], dir = v.sort.dir === 'desc' ? -1 : 1;
  list.sort(function (a, b) {
    var x = key(a), y = key(b);
    if (x == null && y == null) return a.siteId < b.siteId ? -1 : 1;
    if (x == null) return 1; if (y == null) return -1;           /* unknowns last, either direction */
    var nx = Number(x), ny = Number(y), c = (isFinite(nx) && isFinite(ny) && x !== '' && y !== '') ? nx - ny : String(x).localeCompare(String(y));
    return c ? c * dir : (a.siteId < b.siteId ? -1 : 1);
  });
  var ids = list.map(function (s) { return s.siteId; }), start = v.page * v.pageSize, pageIds = ids.slice(start, start + v.pageSize);
  return { view: v, total: ids.length, siteIds: ids, pageIds: pageIds, selectionScope: v.scope, selectedIds: v.scope === 'this_page' ? pageIds : ids, coverage: coverage(list), excluded: excluded, resultHash: sha(ids.join(',')) };
}
function coverage(list) {
  function cov(k) { var known = 0; list.forEach(function (s) { if (factVal(s, k) != null) known++; }); return { known: known, notProvided: list.length - known }; }
  return { sites: list.length, reportedPowerKw: cov('reportedPowerKw'), installedChargerKw: cov('installedChargerKw'), utility: cov('utility'), rateSchedule: cov('rateSchedule'), shaRemainingYears: cov('shaRemainingYears'),
    meter: { true: list.filter(function (s) { return meterState(s) === 'true'; }).length, false: list.filter(function (s) { return meterState(s) === 'false'; }).length, unknown: list.filter(function (s) { return meterState(s) === 'unknown'; }).length } };
}
function summary(sites, opts) {
  opts = opts || {};
  var live = sites.filter(function (s) { return s.lifecycleStatus !== 'archived'; }), states = {}, attention = {}, nameplate = 0, nameplateKnown = 0, screened = { sites: 0, pods: 0, itKw: 0, facilityKw: 0, unableSites: 0 };
  live.forEach(function (s) {
    var st = String((s.address || {}).state || 'Not provided'); states[st] = (states[st] || 0) + 1;
    var kw = factVal(s, 'installedChargerKw'); if (kw != null) { nameplate += kw; nameplateKnown++; }
    (s.flags || []).forEach(function (f) { if (f.severity === 'review') attention[f.code] = (attention[f.code] || 0) + 1; });
    var lp = s.opportunity && s.opportunity.legacyProxy;
    if (lp) { if (lp.status === 'unable') screened.unableSites++; else if (lp.pods > 0) { screened.sites++; screened.pods += lp.pods; screened.itKw += lp.itKw; screened.facilityKw += lp.facilityKw; } }
  });
  return {
    asOf: opts.now || null,
    properties: { sites: live.length, byState: states, operatingState: 'Not provided (declared/verified operating state not imported)' },
    installed: { evChargingNameplateKw: Math.round(nameplate * 1000) / 1000, label: 'EV charger nameplate (L2+L3, as supplied) — not approved service capacity', coverage: { known: nameplateKnown, notProvided: live.length - nameplateKnown } },
    powerOpportunity: { workbookScenario: live.some(function (s) { return s.opportunity && s.opportunity.wb2Legacy; }) ? EM.totals(live) : null, verifiedHeadroomKw: null, verifiedNote: 'No verified headroom: no reviewed service limits exist yet', screened: Object.assign({ scenario: 'EVCS legacy proxy v1', label: 'Screened potential (preliminary proxy; unverified)' }, screened) },
    performance: { status: 'No live data connection', measured: null },
    attention: attention,
    coverage: coverage(live)
  };
}
function csvSafe(v) {
  var s = v == null ? '' : String(v);
  /* =, +, -, @, tab, CR at the start of a cell is a formula to Excel/Sheets. */
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return s;
}
var EXPORT_COLUMNS = [['siteId', 'Site ID'], ['externalId', 'Source ID'], ['name', 'Name'], ['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP'], ['utility', 'Utility'], ['installedChargerKw', 'Installed charger nameplate (kW)'], ['reportedPowerKw', 'Reported power statistic (kW, definition unresolved)'], ['evcsOwnsMeter', 'Meter flag (reported)'], ['shaRemainingYears', 'Reported remaining term (yrs)'], ['flags', 'Attention']];
function exportCsv(sites) {
  var rows = [EXPORT_COLUMNS.map(function (c) { return c[1]; })];
  sites.forEach(function (s) {
    var a = s.address || {}, ext = s.externalSiteIds || {}, ek = Object.keys(ext)[0];
    rows.push(EXPORT_COLUMNS.map(function (c) {
      var k = c[0], v;
      if (k === 'siteId') v = s.siteId; else if (k === 'externalId') v = ek ? ek + ':' + ext[ek] : ''; else if (k === 'name') v = s.name;
      else if (['street', 'city', 'state', 'zip'].indexOf(k) >= 0) v = a[k];
      else if (k === 'flags') v = (s.flags || []).filter(function (f) { return f.severity === 'review'; }).map(function (f) { return f.code; }).join(' ');
      else if (k === 'evcsOwnsMeter') v = meterState(s) === 'unknown' ? 'Not provided' : meterState(s);
      else { v = factVal(s, k); if (v == null) v = 'Not provided'; }
      return csvSafe(v);
    }));
  });
  return csv.stringify(rows);
}

/* ── Access: role → capability (spec §11.2) ──────────────────────────── */
var CAPS = {
  owner: ['read', 'edit', 'import', 'review', 'manageViews', 'archive', 'export', 'files', 'tasks'],
  admin: ['read', 'edit', 'import', 'review', 'manageViews', 'archive', 'export', 'files', 'tasks'],
  member: ['read', 'edit', 'import', 'manageViews', 'export', 'files', 'tasks'],
  viewer: ['read']
};
function capabilities(role, staff) { if (staff) return CAPS.owner.slice(); return (CAPS[role] || []).slice(); }


/* ── Children an import implies (deterministic IDs, never overwrite a
   person's edits: the gateway writes these only when absent). ────────── */
var EQUIPMENT_CATEGORIES = ['ev_charger', 'bess', 'solar', 'compute', 'switchgear', 'transformer', 'meter', 'controls', 'other'];
var AGREEMENT_TYPES = ['site_host_agreement', 'lease', 'license', 'loa', 'easement', 'utility_service', 'interconnection', 'offtake', 'other'];
function derivedChildren(doc) {
  var v = function (k) { return factVal(doc, k); }, src = function (k) { return doc.facts[k] ? doc.facts[k].source : null; }, out = { agreements: [], equipment: [], tasks: [] };
  if (doc.facts.shaTermYears || doc.facts.shaRemainingYears || doc.facts.monthlyRentUsd || doc.facts.revShare || doc.facts.revSharePerKwh || doc.facts.hostAccount) {
    out.agreements.push({ id: 'imp-host-agreement', type: 'site_host_agreement', label: 'Site host agreement (as reported)', parties: v('hostAccount') ? [{ role: 'host', name: v('hostAccount'), note: 'Host-party label; not automatically landowner' }] : [],
      reportedTermYears: v('shaTermYears'), reportedRemainingYears: v('shaRemainingYears'), startDate: null, endDate: null,
      termDisplay: v('shaRemainingYears') == null ? 'Not provided' : (v('shaRemainingYears') === 0 ? 'Needs agreement review' : 'Reported remaining term'),
      economics: { fixedRentUsdMonthly: v('monthlyRentUsd'), revShareFraction: v('revShare'), revShareBasis: null, perKwhShareUsd: v('revSharePerKwh'), perKwhBasis: null, appliesToCompute: 'unknown' },
      reviewStatus: 'needs_agreement_review', source: src('shaRemainingYears') || src('shaTermYears') || src('hostAccount'), origin: 'import' });
  }
  if (doc.facts.installedChargerKw) out.equipment.push({ id: 'imp-ev-aggregate', category: 'ev_charger', status: 'installed', label: 'EV charging (aggregate installed nameplate, L2+L3)', ratings: { aggregateNameplateKw: v('installedChargerKw') },
    quantity: null, quantityNote: 'Charger count, cabinets and port ratings not provided; not derived from kW', reviewStatus: 'unreviewed', source: src('installedChargerKw'), origin: 'import' });
  if (doc.facts.switchgearRaw || doc.facts.switchgearAmps) out.equipment.push({ id: 'imp-switchgear', category: 'switchgear', status: 'installed', label: 'Switchgear (as stored)', ratings: { amps: v('switchgearAmps'), rawText: v('switchgearRaw'), voltage: null, phase: null, continuousRatingA: null },
    reviewStatus: 'unreviewed', note: 'kW is not derived from amps alone', source: src('switchgearAmps') || src('switchgearRaw'), origin: 'import' });
  (doc.flags || []).filter(function (f) { return f.severity === 'review'; }).forEach(function (f) {
    var title = f.code === 'POWER_EXCEEDS_INSTALLED' ? 'Confirm units, scope and equipment: reported power exceeds installed nameplate'
      : f.code === 'POWER_DEFINITION_CONFLICT' ? 'Clarify the reported power statistic definition (peak vs p95 active-interval average)'
      : f.code === 'TERM_ZERO_REVIEW' ? 'Review host agreement: reported remaining term is 0' : f.message;
    out.tasks.push({ id: 'imp-' + f.code.toLowerCase(), title: title, code: f.code, status: 'open', assignee: null, dueDate: null, evidenceRequired: f.code === 'TERM_ZERO_REVIEW' ? 'Signed agreement or amendment' : 'Source data owner confirmation', origin: 'import', history: [] });
  });
  return out;
}
function cleanAgreement(a) {
  a = a || {}; var e = a.economics || {}, n = function (x) { if (x === '' || x == null) return null; var k = Number(x); return isFinite(k) ? k : null; };
  var type = AGREEMENT_TYPES.indexOf(a.type) >= 0 ? a.type : 'other', date = function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d) : null; };
  var revPct = n(e.revSharePercent), revFrac = n(e.revShareFraction);
  if (revPct != null) revFrac = Math.round(revPct * 1e6) / 1e8;   /* whole percent in, fraction stored */
  if (revFrac != null && (revFrac < 0 || revFrac > 1)) fail(400, 'Revenue share must be between 0% and 100%');
  return { type: type, label: clean(a.label, 120) || type.replace(/_/g, ' '), parties: (Array.isArray(a.parties) ? a.parties : []).slice(0, 12).map(function (p) { return { role: clean(p && p.role, 40), name: clean(p && p.name, 120) }; }),
    startDate: date(a.startDate), endDate: date(a.endDate), signed: a.signed === true, renewalOptions: clean(a.renewalOptions, 300) || null, renewalExercised: a.renewalExercised === true ? true : a.renewalExercised === false ? false : null,
    noticeDeadline: date(a.noticeDeadline), assignmentRights: clean(a.assignmentRights, 300) || null, computePermitted: a.computePermitted === true ? true : a.computePermitted === false ? false : null, bessPermitted: a.bessPermitted === true ? true : a.bessPermitted === false ? false : null,
    economics: { fixedRentUsdMonthly: n(e.fixedRentUsdMonthly), escalationPct: n(e.escalationPct), revShareFraction: revFrac, revShareBasis: clean(e.revShareBasis, 120) || null, perKwhShareUsd: n(e.perKwhShareUsd), perKwhBasis: clean(e.perKwhBasis, 120) || null, appliesToCompute: ['yes', 'no', 'unknown'].indexOf(e.appliesToCompute) >= 0 ? e.appliesToCompute : 'unknown' },
    termDisplay: date(a.endDate) && a.signed === true && a.reviewStatus === 'reviewed' ? 'Verified through ' + date(a.endDate) : (a.renewalOptions && a.renewalExercised !== true ? 'Renewal option - unexercised' : 'Needs agreement review'),
    reviewStatus: ['reviewed', 'needs_agreement_review', 'unreviewed'].indexOf(a.reviewStatus) >= 0 ? a.reviewStatus : 'needs_agreement_review', notes: clean(a.notes, 1000) || null };
}
function cleanEquipment(q) {
  q = q || {}; var r = q.ratings || {}, n = function (x) { if (x === '' || x == null) return null; var k = Number(x); return isFinite(k) && k >= 0 ? k : null; };
  return { category: EQUIPMENT_CATEGORIES.indexOf(q.category) >= 0 ? q.category : 'other', status: ['installed', 'proposed', 'removed'].indexOf(q.status) >= 0 ? q.status : 'installed', label: clean(q.label, 120) || null,
    manufacturer: clean(q.manufacturer, 80) || null, model: clean(q.model, 80) || null, serial: clean(q.serial, 80) || null, quantity: n(q.quantity),
    ratings: { kw: n(r.kw), kwh: n(r.kwh), usableKwh: n(r.usableKwh), amps: n(r.amps), kva: n(r.kva), voltage: n(r.voltage), itKw: n(r.itKw), facilityKw: n(r.facilityKw), perPortKw: n(r.perPortKw), sharedCabinetLimitKw: n(r.sharedCabinetLimitKw) },
    commissionedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(q.commissionedOn || '')) ? q.commissionedOn : null, owner: clean(q.owner, 120) || null, reviewStatus: q.reviewStatus === 'reviewed' ? 'reviewed' : 'unreviewed', notes: clean(q.notes, 1000) || null };
}
function cleanTask(t) {
  t = t || {};
  return { title: clean(t.title, 200) || fail(400, 'A task needs a title'), status: t.status === 'done' ? 'done' : 'open', assignee: clean(t.assignee, 120) || null,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueDate || '')) ? t.dueDate : null, evidenceRequired: clean(t.evidenceRequired, 300) || null, dependsOn: clean(t.dependsOn, 80) || null };
}

module.exports = { derivedChildren: derivedChildren, cleanAgreement: cleanAgreement, cleanEquipment: cleanEquipment, cleanTask: cleanTask, EQUIPMENT_CATEGORIES: EQUIPMENT_CATEGORIES, AGREEMENT_TYPES: AGREEMENT_TYPES, SCHEMA_VERSION: SCHEMA_VERSION, MAX_SITES: MAX_SITES, canonicalSiteId: canonicalSiteId, safeNamespace: safeNamespace, readUpload: readUpload, siteDocFrom: siteDocFrom,
  planImport: planImport, applyPlan: applyPlan, planUndo: planUndo, reviewField: reviewField, normalizeView: normalizeView, applyView: applyView, summary: summary, coverage: coverage,
  csvSafe: csvSafe, exportCsv: exportCsv, capabilities: capabilities, CAPS: CAPS, sha: sha, factVal: factVal, meterState: meterState };
