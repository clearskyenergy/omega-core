/* ═══════════════════════════════════════════════════════════════════════════
   /api/portfolio-assets — Workspace > Projects > Portfolio (the asset register)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The workspace gateway for Portfolio & Assets (docs/PORTFOLIO-ASSET-
   MANAGER-PLAN.md). The customer-portal intake (api/customer-portfolio.js)
   is untouched; this endpoint is the WORKSPACE's own fleet register and
   reuses the same parsing modules under api/_lib/portfolio/.

   Behind a TENANT-SCOPED FLAG: omega_orgs/{org}/billing/current
   .toolOverrides['portfolio-assets'] === true. Billing is ClearSky-written
   (rules), so a tenant cannot switch it on for itself. Off → 403 for
   everyone, staff included, so a preview is a deliberate act.

   Authorization comes from the VERIFIED identity, never the body: the org is
   the caller's own (staff may name one), the role is omega_orgs/{org}/
   members/{uid}. A cross-org collaborator (org_members) is NOT granted the
   fleet — a project collaborator never sees the customer's whole register.
   No member record → read-only.

   Storage (Admin SDK only; firestore.rules deny every path below):
     omega_orgs/{org}/asset_sites/{siteId}                  canonical site
         …/agreements/{id}  …/equipment/{id}  …/tasks/{id}  …/files/{id}
     omega_orgs/{org}/asset_imports/{importId}               preview/commit/undo
         …/before/{siteId}                                   undo images
     omega_orgs/{org}/asset_views/{viewId}                   saved views
     omega_orgs/{org}/asset_portfolios/{portfolioId}         groupings (membership
                                                             is siteIds; no copies)
     omega_orgs/{org}/asset_audit/{id}                       append-only events
     omega_orgs/{org}/asset_analyses/{id}                    an analysis package (WB2):
                                                             assumptions, summary, shortlist
   Private Storage: asset-portfolio/{org}/imports/{sha256}, …/files/{siteId}/{sha256}

   GET  ?org=[&view=<json>|&viewId=]               sites (page) + summary + coverage
   GET  ?org=&site=                                site detail with children
   GET  ?org=&site=&file=                          authorized download (attachment)
   GET  ?org=&export=csv[&view=|&viewId=]          CSV (formula-injection safe)
   GET  ?org=&views=1 | &imports=1 | &portfolios=1
   POST { action: import-preview | import-commit | import-undo | field-review |
          agreement-upsert | equipment-upsert | task-upsert | file-attach |
          view-save | view-delete | portfolio-save | site-archive }
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var AS = require('./_lib/portfolio/assets'), EM = require('./_lib/portfolio/evcs-model');

var FLAG = 'portfolio-assets', MAX_UPLOAD = 3 * 1024 * 1024;
function clean(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n || 160); }
function docId(v) { var s = clean(v, 120); if (!/^[A-Za-z0-9_-]{1,120}$/.test(s)) { var e = new Error('Invalid id'); e.status = 400; throw e; } return s; }

function make(deps) {
  var A = deps.A;
  function err(s, m) { return A.httpError(s, m); }
  async function access(caller, requested) {
    var org = caller.staff ? A.safeOrg(requested || caller.orgId) : A.safeOrg(caller.orgId);
    if (!org) throw err(400, 'Valid workspace required');
    if (requested && A.safeOrg(requested) !== org) throw err(403, 'Not your workspace');
    var db = deps.db(), root = db.collection('omega_orgs').doc(org);
    var billing = await A.billingOf(org);
    if (!(billing && billing.toolOverrides && billing.toolOverrides[FLAG] === true)) throw err(403, 'Portfolio & Assets is not enabled for this workspace');
    var role = 'viewer';
    if (caller.staff) role = 'owner';
    else { var m = await root.collection('members').doc(caller.uid).get(); if (m.exists) { var d = m.data() || {}; if (d.status === 'disabled') throw err(403, 'Your access to this workspace is disabled'); role = ['owner', 'admin', 'member', 'viewer'].indexOf(d.role) >= 0 ? d.role : 'viewer'; } }
    return { org: org, root: root, db: db, role: role, caps: AS.capabilities(role, caller.staff) };
  }
  function need(scope, cap) { if (scope.caps.indexOf(cap) < 0) throw err(403, 'Your role (' + scope.role + ') cannot ' + cap + ' here'); }
  async function allSites(scope) { var s = await scope.root.collection('asset_sites').limit(AS.MAX_SITES + 1).get(); return s.docs.map(function (d) { return d.data(); }); }
  async function children(ref, name) { var s = await ref.collection(name).limit(500).get(); return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  function audit(scope, caller, what, extra) { return scope.root.collection('asset_audit').doc().create(Object.assign({ at: deps.now(), by: caller.email, uid: caller.uid, action: what }, extra || {})); }
  function parseView(b, scope) {
    if (b.viewId) return scope.root.collection('asset_views').doc(docId(b.viewId)).get().then(function (s) { if (!s.exists) throw err(404, 'View not found'); return s.data().view; });
    if (!b.view) return Promise.resolve({});
    try { return Promise.resolve(typeof b.view === 'string' ? JSON.parse(b.view) : b.view); } catch (e) { return Promise.reject(err(400, 'View is not valid JSON')); }
  }
  function row(s) {
    var v = function (k) { return AS.factVal(s, k); }, ext = s.externalSiteIds || {}, ek = Object.keys(ext)[0], lp = s.opportunity && s.opportunity.legacyProxy;
    return { siteId: s.siteId, externalId: ek ? ext[ek] : null, namespace: ek || null, name: s.name, city: (s.address || {}).city || null, state: (s.address || {}).state || null, utility: v('utility'),
      installedChargerKw: v('installedChargerKw'), reportedPowerKw: v('reportedPowerKw'), meter: AS.meterState(s), shaRemainingYears: v('shaRemainingYears'),
      approvedImportKw: null, headroom: 'Not provided', opportunity: lp ? (lp.status === 'unable' ? lp.label : (lp.pods > 0 ? lp.pods + ' pod(s) screened (legacy proxy)' : 'None under legacy proxy')) : 'Not screened',
      attention: (s.flags || []).filter(function (f) { return f.severity === 'review'; }).map(function (f) { return f.code; }), revision: s.revision, lifecycleStatus: s.lifecycleStatus };
  }
  async function loadImportFile(scope, imp) { var r = await deps.bucket().file('asset-portfolio/' + scope.org + '/imports/' + imp.fileSha).download(); return r[0]; }
  /* One planner for both kinds of upload: a site list (creates/updates
     sites) or an analysis package (enriches existing sites, never creates). */
  function planFor(up, ex, scope) {
    if (up.enrichment) {
      var ep = EM.plan(up.enrichment, ex, { orgId: scope.org, namespace: 'evcs', canonicalSiteId: AS.canonicalSiteId });
      var c = { created: 0, updated: ep.counts.updated, unchanged: ep.counts.unchanged, rejected: ep.counts.rejected + ep.counts.unmatched, conflicts: 0, conflictOnly: 0, matched: ep.counts.matched, unmatched: ep.counts.unmatched, reconciliationMismatches: ep.counts.reconciliationMismatches };
      ep.counts = c; ep.suggestions = []; ep.planHash = AS.sha(JSON.stringify([ep.changes.map(function (x) { return [x.siteId, x.fieldChanges[0].to]; }), ep.unmatched, up.fileSha]));
      return ep;
    }
    return AS.planImport(up.records, ex, { orgId: scope.org, rejected: up.rejected });
  }
  async function siteRef(scope, id) { var ref = scope.root.collection('asset_sites').doc(docId(id)), s = await ref.get(); if (!s.exists) throw err(404, 'Site not found'); return { ref: ref, data: s.data() }; }

  return A.handler(async function (req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (['GET', 'POST'].indexOf(req.method) < 0) throw err(405, 'GET or POST only');
    var b = req.method === 'GET' ? (req.query || {}) : (req.body || {});
    if (typeof b !== 'object' || Array.isArray(b)) throw err(400, 'a JSON object is required');
    var caller = await deps.authenticate(req), scope = await access(caller, b.org);
    need(scope, 'read');

    if (req.method === 'GET') {
      if (b.site && b.file) {
        need(scope, 'files');
        var sf = await siteRef(scope, b.site), fs = await sf.ref.collection('files').doc(docId(b.file)).get();
        if (!fs.exists) throw err(404, 'File not found');
        var fd = fs.data(), bytes = (await deps.bucket().file(fd.path).download())[0];
        await audit(scope, caller, 'file-download', { siteId: sf.data.siteId, fileId: fs.id });
        res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment; filename="' + String(fd.name || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) + '"');
        res.end(bytes); return;
      }
      if (b.site) {
        var sd = await siteRef(scope, b.site);
        return { site: sd.data, agreements: await children(sd.ref, 'agreements'), equipment: await children(sd.ref, 'equipment'), tasks: await children(sd.ref, 'tasks'),
          files: (await children(sd.ref, 'files')).map(function (f) { return { id: f.id, name: f.name, category: f.category, size: f.size, sha256: f.sha256, uploadedAt: f.uploadedAt, uploadedBy: f.uploadedBy, reviewStatus: f.reviewStatus }; }),
          caps: scope.caps, role: scope.role };
      }
      if (b.views) { var vs = await scope.root.collection('asset_views').limit(200).get(); return { views: vs.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }) }; }
      if (b.imports) { var is = await scope.root.collection('asset_imports').limit(200).get(); return { imports: is.docs.map(function (d) { var x = d.data(); return { id: d.id, status: x.status, fileName: x.fileName, profile: x.profile, counts: x.counts, createdAt: x.createdAt, committedAt: x.committedAt || null, undoneAt: x.undoneAt || null }; }) }; }
      if (b.analyses) { var an = await scope.root.collection('asset_analyses').limit(50).get(); return { analyses: an.docs.map(function (d) { return d.data(); }) }; }
      if (b.portfolios) { var ps = await scope.root.collection('asset_portfolios').limit(200).get(); return { portfolios: ps.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }) }; }
      var sites = await allSites(scope), view = await parseView(b, scope), result = AS.applyView(sites, view), byId = {};
      sites.forEach(function (s) { byId[s.siteId] = s; });
      if (b.export === 'csv') {
        need(scope, 'export');
        await audit(scope, caller, 'export-csv', { sites: result.selectedIds.length });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="portfolio-assets.csv"');
        res.end('\ufeff' + AS.exportCsv(result.selectedIds.map(function (id) { return byId[id]; }))); return;
      }
      return { org: scope.org, role: scope.role, caps: scope.caps, view: result.view, total: result.total, page: result.view.page, pageSize: result.view.pageSize, rows: result.pageIds.map(function (id) { return row(byId[id]); }),
        selection: { scope: result.selectionScope, count: result.selectedIds.length }, coverage: result.coverage, excluded: result.excluded, resultHash: result.resultHash, summary: AS.summary(sites, { now: deps.now() }) };
    }

    var action = clean(b.action, 40), now = deps.now();
    if (action === 'import-preview') {
      need(scope, 'import');
      if (typeof b.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64)) throw err(400, 'The file is not valid base64');
      var bytes2 = Buffer.from(b.base64, 'base64');
      if (bytes2.length > MAX_UPLOAD) throw err(413, 'Upload limit is 3 MB per site list');
      var up = AS.readUpload({ name: b.fileName, bytes: bytes2 }, { namespace: b.namespace, now: now });
      var ex = {}; (await allSites(scope)).forEach(function (s) { ex[s.siteId] = s; });
      var plan = planFor(up, ex, scope);
      var importId = 'imp_' + AS.sha(scope.org + '|' + up.fileSha + '|' + (b.namespace || '') + '|' + plan.planHash).slice(0, 24), iref = scope.root.collection('asset_imports').doc(importId), prior = await iref.get();
      if (prior.exists && prior.data().status === 'committed') return { ok: true, importId: importId, alreadyCommitted: true, counts: prior.data().counts, note: 'This exact import was already applied; nothing to do.' };
      await deps.bucket().file('asset-portfolio/' + scope.org + '/imports/' + up.fileSha).save(bytes2, { resumable: false, contentType: 'application/octet-stream', metadata: { cacheControl: 'private, no-store', contentDisposition: 'attachment' } });
      var conflicts = [], diffs = [];
      plan.changes.forEach(function (c) { (c.fieldChanges || []).forEach(function (f) { var item = { siteId: c.siteId, externalSiteId: c.externalSiteId, field: f.field, from: f.from, to: f.to, action: f.action }; if (f.action === 'conflict') conflicts.push(item); else diffs.push(item); }); });
      var imp = { id: importId, status: 'previewed', orgId: scope.org, fileName: up.fileName, fileSha: up.fileSha, size: up.size, profile: up.profile, namespace: b.namespace ? AS.safeNamespace(b.namespace) : null, planHash: plan.planHash, counts: plan.counts,
        meta: { headerRow: up.meta.headerRow, sheet: up.meta.sheet, sheets: up.meta.sheets, footer: (up.meta.footer || []).slice(0, 5), definitionNotes: up.meta.definitionNotes || [], formulaCells: up.meta.formulaCells || 0, unknownHeaders: up.meta.unknownHeaders || [] },
        rejected: up.rejected.slice(0, 500), suggestions: plan.suggestions.slice(0, 200), conflicts: conflicts.slice(0, 500), createdAt: now, createdBy: caller.email };
      await iref.set(imp);
      await audit(scope, caller, 'import-preview', { importId: importId, counts: plan.counts });
      return { ok: true, importId: importId, planHash: plan.planHash, profile: up.profile, counts: plan.counts, analysis: up.enrichment ? { unmatched: plan.unmatched.slice(0, 300), mismatches: plan.mismatches.slice(0, 300), shortlistMissing: plan.shortlistMissing, assumptions: up.enrichment.assumptions.length, shortlistMembers: up.enrichment.shortlist ? up.enrichment.shortlist.members.length : 0 } : null, meta: imp.meta, rejected: imp.rejected, suggestions: imp.suggestions, conflicts: imp.conflicts, changes: diffs.slice(0, 500), changesTruncated: diffs.length > 500 };
    }
    if (action === 'import-commit') {
      need(scope, 'import');
      var cref = scope.root.collection('asset_imports').doc(docId(b.importId)), cs = await cref.get();
      if (!cs.exists) throw err(404, 'Import not found; preview it first');
      var ci = cs.data();
      if (ci.status === 'committed') return { ok: true, importId: cref.id, alreadyCommitted: true, counts: ci.counts };
      if (ci.status !== 'previewed') throw err(409, 'This import is ' + ci.status);
      if (b.planHash !== ci.planHash) throw err(409, 'The preview you confirmed is not the latest; preview again');
      var file = await loadImportFile(scope, ci), up2 = AS.readUpload({ name: ci.fileName, bytes: file }, { namespace: ci.namespace, now: now });
      var ex2 = {}; (await allSites(scope)).forEach(function (s) { ex2[s.siteId] = s; });
      var plan2 = planFor(up2, ex2, scope);
      if (plan2.planHash !== ci.planHash) throw err(409, 'The register changed since this preview; preview again');
      var accept = Array.isArray(b.acceptConflicts) ? b.acceptConflicts.map(function (x) { return clean(x, 120); }).slice(0, 2000) : [];
      if (accept.length) need(scope, 'review');
      var analysisId = up2.enrichment ? 'ana_' + cref.id.slice(4) : null;
      var applied = up2.enrichment ? EM.apply(plan2, up2.enrichment, ex2, { importId: cref.id, analysisId: analysisId, now: now })
        : AS.applyPlan(plan2, up2.records, ex2, { orgId: scope.org, importId: cref.id, now: now, actor: caller.email, acceptConflicts: accept, profile: up2.profile, file: ci.fileName });
      if (up2.enrichment) {
        /* The package itself: assumption set, summary for reconciliation and the
           shortlist, as one immutable analysis record linked from each site. */
        var en = up2.enrichment;
        await scope.root.collection('asset_analyses').doc(analysisId).set({ id: analysisId, importId: cref.id, profile: EM.PROFILE, scenario: EM.SCENARIO, fileName: ci.fileName, fileSha: ci.fileSha, createdAt: now, createdBy: caller.email,
          assumptions: en.assumptions, summary: en.summary, monthlyRows: en.monthlyRows, reconciliation: { mismatches: plan2.mismatches.slice(0, 300), unmatched: plan2.unmatched.slice(0, 300) },
          shortlist: en.shortlist ? Object.assign({}, en.shortlist, { siteIds: plan2.shortlistSiteIds, missing: plan2.shortlistMissing }) : null,
          caveat: 'Workbook scenario using shared per-pod assumptions; not individually underwritten sites, approved capacity or a return promise.' });
      }
      var touched = [];
      for (var sid in applied.writes) {
        if (!Object.prototype.hasOwnProperty.call(applied.writes, sid)) continue;
        var doc = applied.writes[sid], sref = scope.root.collection('asset_sites').doc(sid);
        if (applied.before[sid]) await cref.collection('before').doc(sid).set(applied.before[sid]);
        await sref.set(doc);
        var kids = up2.enrichment ? {} : AS.derivedChildren(doc);
        for (var kind in kids) { for (var q = 0; q < kids[kind].length; q++) { var kr = sref.collection(kind).doc(kids[kind][q].id), ks = await kr.get(); if (!ks.exists) await kr.set(Object.assign({}, kids[kind][q], { createdAt: now, importId: cref.id })); } }
        touched.push({ siteId: sid, created: !applied.before[sid], revisionAfter: doc.revision });
      }
      await cref.set({ status: 'committed', committedAt: now, committedBy: caller.email, touched: touched, acceptedConflicts: accept }, { merge: true });
      await audit(scope, caller, 'import-commit', { importId: cref.id, counts: plan2.counts, written: touched.length });
      return { ok: true, importId: cref.id, counts: plan2.counts, written: touched.length };
    }
    if (action === 'import-undo') {
      need(scope, 'import');
      var uref = scope.root.collection('asset_imports').doc(docId(b.importId)), us = await uref.get();
      if (!us.exists) throw err(404, 'Import not found');
      var ui = Object.assign({ id: uref.id }, us.data());
      if (ui.status !== 'committed') throw err(409, 'Only a committed import can be undone');
      var cur = {};
      for (var t = 0; t < (ui.touched || []).length; t++) {
        var tr = scope.root.collection('asset_sites').doc(ui.touched[t].siteId), tsn = await tr.get();
        if (tsn.exists) { var td = tsn.data(); var linked = (await tr.collection('files').limit(1).get()).size > 0 || !!td.projectId || (await tr.collection('tasks').limit(50).get()).docs.some(function (d) { return d.data().origin !== 'import'; }); cur[ui.touched[t].siteId] = Object.assign({}, td, { hasLinkedWork: linked }); }
      }
      var undo = AS.planUndo(ui, cur);
      for (var o = 0; o < undo.ops.length; o++) {
        var op = undo.ops[o], oref = scope.root.collection('asset_sites').doc(op.siteId);
        if (op.op === 'delete') { for (var kn of ['agreements', 'equipment', 'tasks']) { var kd = await oref.collection(kn).limit(500).get(); for (var z = 0; z < kd.docs.length; z++) if (kd.docs[z].data().importId === uref.id) await oref.collection(kn).doc(kd.docs[z].id).delete(); } await oref.delete(); }
        else { var bi = await uref.collection('before').doc(op.siteId).get(); if (bi.exists) await oref.set(Object.assign({}, bi.data(), { revision: (cur[op.siteId].revision || 1) + 1, updatedAt: now, restoredFromImport: uref.id })); }
      }
      await uref.set({ status: 'undone', undoneAt: now, undoneBy: caller.email, undo: { applied: undo.ops.length, skipped: undo.skipped } }, { merge: true });
      await audit(scope, caller, 'import-undo', { importId: uref.id, applied: undo.ops.length, skipped: undo.skipped.length });
      return { ok: true, applied: undo.ops.length, skipped: undo.skipped };
    }
    if (action === 'field-review') {
      need(scope, 'edit');
      var fr = await siteRef(scope, b.siteId), input = { expectedRevision: b.expectedRevision, reason: b.reason, reviewStatus: b.reviewStatus, unit: b.unit };
      if (Object.prototype.hasOwnProperty.call(b, 'value')) input.value = b.value === null ? null : (typeof b.value === 'number' || typeof b.value === 'boolean' ? b.value : clean(b.value, 500));
      var next = await scope.db.runTransaction(async function (tx) {
        var snap = await tx.get(fr.ref), out = AS.reviewField(snap.data(), clean(b.field, 41), input, { actor: caller.email, now: now, canReview: scope.caps.indexOf('review') >= 0 });
        tx.set(fr.ref, out); return out;
      });
      await audit(scope, caller, 'field-review', { siteId: next.siteId, field: clean(b.field, 41), revision: next.revision });
      return { ok: true, siteId: next.siteId, revision: next.revision, fact: next.facts[clean(b.field, 41)] };
    }
    if (action === 'agreement-upsert' || action === 'equipment-upsert' || action === 'task-upsert') {
      need(scope, action === 'task-upsert' ? 'tasks' : 'edit');
      var kindName = action === 'agreement-upsert' ? 'agreements' : action === 'equipment-upsert' ? 'equipment' : 'tasks';
      var host = await siteRef(scope, b.siteId), payload = b[kindName === 'agreements' ? 'agreement' : kindName === 'equipment' ? 'equipment' : 'task'] || {};
      var cleanFn = kindName === 'agreements' ? AS.cleanAgreement : kindName === 'equipment' ? AS.cleanEquipment : AS.cleanTask, rec = cleanFn(payload);
      var cref2 = payload.id ? host.ref.collection(kindName).doc(docId(payload.id)) : host.ref.collection(kindName).doc(), prev = await cref2.get();
      var base = prev.exists ? prev.data() : { createdAt: now, createdBy: caller.email, origin: 'manual' };
      var merged = Object.assign({}, base, rec, { updatedAt: now, updatedBy: caller.email });
      if (kindName === 'tasks') { var was = prev.exists ? prev.data().status : null; merged.history = (base.history || []).concat(was !== rec.status ? [{ at: now, by: caller.email, status: rec.status }] : []).slice(-50); if (rec.status === 'done' && was !== 'done') { merged.completedAt = now; merged.completedBy = caller.email; } }
      await cref2.set(merged);
      await host.ref.set({ linkedWork: true, updatedAt: now }, { merge: true });
      await audit(scope, caller, action, { siteId: host.data.siteId, id: cref2.id });
      return { ok: true, id: cref2.id, record: merged };
    }
    if (action === 'file-attach') {
      need(scope, 'files');
      var fh = await siteRef(scope, b.siteId);
      if (typeof b.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64)) throw err(400, 'The file is not valid base64');
      var fb = Buffer.from(b.base64, 'base64'), fname = clean(b.fileName, 200).replace(/[\/\\]/g, '_');
      if (!fb.length || fb.length > MAX_UPLOAD) throw err(413, 'Files are limited to 3 MB here');
      if (!/\.(pdf|png|jpe?g|csv|xlsx|txt|dwg|dxf|kmz|kml|docx)$/i.test(fname)) throw err(400, 'File type not accepted');
      if (/\.pdf$/i.test(fname) && fb.slice(0, 4).toString() !== '%PDF') throw err(400, 'This .pdf is not a PDF');
      var fsha = AS.sha(fb), path = 'asset-portfolio/' + scope.org + '/files/' + fh.data.siteId + '/' + fsha, fref = fh.ref.collection('files').doc(fsha.slice(0, 24));
      var cat = ['energy_bill', 'interval_data', 'agreement', 'utility_letter', 'one_line', 'plot_plan', 'equipment_spec', 'quote', 'fiber_evidence', 'permit', 'inspection', 'maintenance', 'insurance', 'financial', 'other'];
      if (!(await fref.get()).exists) {
        await deps.bucket().file(path).save(fb, { resumable: false, contentType: 'application/octet-stream', metadata: { cacheControl: 'private, no-store', contentDisposition: 'attachment' } });
        await fref.set({ name: fname, size: fb.length, sha256: fsha, path: path, category: cat.indexOf(b.category) >= 0 ? b.category : 'other', uploadedAt: now, uploadedBy: caller.email, reviewStatus: 'uploaded', note: 'Stored privately; an attachment alone is not reviewed evidence' });
      }
      await fh.ref.set({ linkedWork: true, updatedAt: now }, { merge: true });
      await audit(scope, caller, 'file-attach', { siteId: fh.data.siteId, fileId: fref.id });
      return { ok: true, fileId: fref.id };
    }
    if (action === 'view-save') {
      need(scope, 'manageViews');
      var nv = AS.normalizeView(b.view || {}); if (b.name) nv.name = clean(b.name, 80);
      var sites2 = await allSites(scope), res2 = AS.applyView(sites2, nv);
      var vref = b.viewId ? scope.root.collection('asset_views').doc(docId(b.viewId)) : scope.root.collection('asset_views').doc();
      await vref.set({ name: nv.name, view: nv, savedAt: now, savedBy: caller.email, savedResult: { total: res2.total, resultHash: res2.resultHash, coverage: res2.coverage, excluded: res2.excluded, selectionScope: res2.selectionScope } });
      return { ok: true, viewId: vref.id, total: res2.total, resultHash: res2.resultHash };
    }
    if (action === 'view-delete') { need(scope, 'manageViews'); await scope.root.collection('asset_views').doc(docId(b.viewId)).delete(); return { ok: true }; }
    if (action === 'portfolio-save') {
      need(scope, 'edit');
      var pid = b.portfolioId ? docId(b.portfolioId) : null, pref = pid ? scope.root.collection('asset_portfolios').doc(pid) : scope.root.collection('asset_portfolios').doc();
      var pexisting = await pref.get(); pid = pref.id;
      await pref.set(Object.assign(pexisting.exists ? pexisting.data() : { createdAt: now, createdBy: caller.email }, { name: clean(b.name, 120) || (pexisting.exists ? pexisting.data().name : 'Portfolio'), updatedAt: now }));
      var add = (Array.isArray(b.add) ? b.add : []).slice(0, 2000), rem = (Array.isArray(b.remove) ? b.remove : []).slice(0, 2000);
      for (var x = 0; x < add.length + rem.length; x++) {
        var isAdd = x < add.length, sid2 = docId(isAdd ? add[x] : rem[x - add.length]), sr = scope.root.collection('asset_sites').doc(sid2), ss = await sr.get();
        if (!ss.exists) continue;
        var ids = (ss.data().portfolioIds || []).filter(function (p) { return p !== pid; }); if (isAdd) ids.push(pid);
        await sr.set({ portfolioIds: ids }, { merge: true });   /* membership only: the site is never copied */
      }
      return { ok: true, portfolioId: pid };
    }
    if (action === 'site-archive') {
      need(scope, 'archive');
      var ar = await siteRef(scope, b.siteId);
      if (Number(b.expectedRevision) !== ar.data.revision) throw err(409, 'This site changed since you opened it; reload');
      await ar.ref.set({ lifecycleStatus: b.restore ? 'active' : 'archived', revision: ar.data.revision + 1, updatedAt: now }, { merge: true });
      await audit(scope, caller, b.restore ? 'site-restore' : 'site-archive', { siteId: ar.data.siteId });
      return { ok: true };
    }
    throw err(400, 'Unknown action');
  });
}

var A = require('./_lib/admin');
module.exports = make({ A: A, db: function () { return A.db(); }, authenticate: function (req) { return A.authenticate(req); }, bucket: function () { return require('./_lib/po-intake').bucket(); }, now: function () { return new Date().toISOString(); } });
module.exports._make = make;
module.exports.FLAG = FLAG;
