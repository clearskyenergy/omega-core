/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/register-ext.js — the register's Phases 2–5 and CRM,
   mounted by register.js (same auth, same org scope, same audit)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Storage (all under omega_orgs/{org}, Admin SDK only, rules deny):
     sites/{id}.powerEvidence | .links | .crm   (on the CRM's site record)
     sites/{id}/activity/{id}            the site CRM's own log
     site_envelopes/{id}                 shared physical limits (§7.4)
     site_allocations/{id}               allocation ledger
     site_handoffs/{id}                  tool launch contexts (§8.2)
     site_results/{id}                   versioned analysis results
     site_bills/{id}                     bill entries + review queue
     site_assumption_sets/{id}           WB2 legacy / IQGEN hardware sets
     site_packages/{id}                  private finance-package drafts
     site_submissions/{packageId}        ONE private submission snapshot
     site_jobs/{id}                      durable, resumable jobs (T32)
   A follow-up logged here is the site CRM's (sitecrm_followups), never a
   second store. projects/{pa_<siteId>} is created only by the explicit
   shortlist action or an editor hand-off, in the shape omega-newproject.js
   writes, deterministic so a retry never duplicates it; a site that already
   carries a project (projectId) opens that one. Nothing here publishes,
   emails, buys or controls equipment.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var P = require('./power'), R = require('./readiness'), H = require('./handoff'), E = require('./economics'), Q = require('./iqgen'), AS = require('./assets'), xlsx = require('./xlsx'), crypto = require('crypto');
var LEGACY_FIELDS = Object.keys(E.LEGACY_KEYS).map(function (k) { return E.LEGACY_KEYS[k]; });
var PIPELINE = ['lead', 'qualifying', 'proposal', 'negotiation', 'contracted', 'in-development', 'operating', 'on-hold', 'lost'];
var ACTIVITY = ['note', 'call', 'meeting', 'email-logged', 'site-visit'];
function sha(x) { return crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex'); }
function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : NaN; }
function kwOrNull(v, err, name) { var n = num(v); if (n === null) return null; if (!isFinite(n) || n < 0 || n > 1e6) throw err(400, name + ' must be a kW value'); return n; }

/* PURE: the widget's numbers. Nothing synthesised: zero is a count, never a guess. */
function widgetSummary(sites, bills, packages, results, today) {
  var live = sites.filter(function (s) { return s.lifecycleStatus !== 'archived'; }), stages = {}, due = 0, open = 0, states = {}, linked = 0;
  live.forEach(function (s) { var st = s.crm && s.crm.stage; if (st) stages[st] = (stages[st] || 0) + 1; var f = s.crm && s.crm.nextFollowUp; if (f) { open++; if (f <= today) due++; } var a = s.address && s.address.state; if (a) states[a] = (states[a] || 0) + 1; if (s.links && s.links.projectId) linked++; });
  return { sites: live.length, states: Object.keys(states).length, linkedProjects: linked, pipeline: stages, inPipeline: Object.keys(stages).reduce(function (a, k) { return a + (k === 'lost' ? 0 : stages[k]); }, 0),
    followUps: { open: open, due: due }, billsToReview: bills.filter(function (x) { return x.state && x.state !== 'accepted' && x.state !== 'rejected'; }).length,
    packages: { draft: packages.filter(function (x) { return x.status === 'draft'; }).length, ready: packages.filter(function (x) { return x.status === 'draft' && x.gates && x.gates.ok; }).length, submitted: packages.filter(function (x) { return x.status === 'submitted'; }).length },
    staleResults: results.filter(function (x) { return x.status === 'stale'; }).length, performance: 'no-live-connection', href: '/portfolio.html' };
}

function make(c) {
  var err = c.err, docId = c.docId, clean = c.clean, need = c.need, audit = c.audit, siteRef = c.siteRef;
  /* a site write carries the flat fields and the link the CRM reads */
  function setSite(ref, patch, data) { var p = Object.assign({}, patch); if (p.links && p.links.projectId) p.projectId = p.links.projectId; if (p.lifecycleStatus) p.archived = p.lifecycleStatus === 'archived'; return ref.set(p, { merge: true }); }

  async function staleFor(scope, siteId, change, now) {
    var rs = await scope.root.collection('site_results').where('siteId', '==', siteId).limit(500).get(), list = rs.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    var pk = await scope.root.collection('site_packages').where('siteId', '==', siteId).limit(100).get(), pkgs = pk.docs.map(function (d) { return Object.assign({ id: d.id, kind: 'package' }, d.data()); });
    var marks = R.propagate(change, list.concat(pkgs), now);
    for (var i = 0; i < marks.length; i++) await scope.root.collection(marks[i].kind === 'package' ? 'site_packages' : 'site_results').doc(marks[i].id).set({ status: 'stale', staleReason: change, staleAt: now }, { merge: true });
    return marks.length;
  }
  async function saveResult(scope, rec) { var id = 'res_' + sha([rec.siteId, rec.kind, rec.scenarioId || '', rec.inputHash]).slice(0, 24), ref = scope.root.collection('site_results').doc(id), ex = await ref.get(); var v = ex.exists ? (ex.data().version || 1) + (ex.data().status === 'current' ? 0 : 1) : 1; await ref.set(Object.assign({ id: id, version: v }, rec)); return Object.assign({ id: id, version: v }, rec); }
  async function mapLinkOf(scope, site) {
    var pid = site.links && site.links.projectId; if (!pid) return null;
    var ps = await scope.db.collection('projects').doc(pid).get(); if (!ps.exists) return { editorProjectId: pid, revision: 0, featureCount: 0, missing: true };
    var p = ps.data(), feats = ['elements', 'conduits', 'bessList', 'annotations'].reduce(function (a, k) { return a + (Array.isArray(p[k]) ? p[k].length : 0); }, 0);
    if (p.orgId !== scope.org) throw err(403, 'Linked project belongs to another workspace');
    var rev = feats ? sha(['elements', 'conduits', 'bessList', 'annotations'].map(function (k) { return p[k] || []; })).slice(0, 16) : null;
    var m = site.links.map || {};
    return { editorProjectId: pid, revision: feats ? (m.hash === rev ? m.revision : (m.revision || 0) + 1) : 0, hash: rev, featureCount: feats, reviewedRevision: m.reviewedRevision || null };
  }

  async function get(b, scope, caller) {
    if (b.shortlist) {
      var an = await scope.root.collection('site_analyses').doc(docId(b.shortlist)).get(); if (!an.exists || !an.data().shortlist) throw err(404, 'Shortlist not found');
      var sl = an.data().shortlist, out = [];
      for (var i = 0; i < sl.members.length; i++) { var m = sl.members[i], sid = sl.siteIds[i], s = await scope.root.collection('sites').doc(sid).get(), d = s.exists ? s.data() : null;
        out.push({ externalSiteId: m.externalSiteId, siteId: sid, name: d ? d.name : null, pods: m.pods, itKw: m.itKw, legacyCapitalUsd: m.investorCapitalUsd, power: d ? P.classify(d) : null, projectId: d && d.links ? d.links.projectId || null : null, missing: !d }); }
      return { name: sl.name, scenario: sl.scenario, total: sl.total, members: out, caveat: 'A shared per-pod screen: these sites are not individually underwritten.' };
    }
    if (b.handoff) { var hs = await scope.root.collection('site_handoffs').doc(docId(b.handoff)).get(); if (!hs.exists) throw err(404, 'Handoff not found'); return { handoff: hs.data() }; }
    if (b.bills) { var bq = await scope.root.collection('site_bills').limit(500).get(); var bl = bq.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); if (b.bills !== 'all') bl = bl.filter(function (x) { return x.state !== 'accepted' && x.state !== 'rejected'; }); return { bills: bl }; }
    if (b.results) { var rq = await scope.root.collection('site_results').where('siteId', '==', clean(b.results, 120)).limit(200).get(); return { results: rq.docs.map(function (d) { return d.data(); }) }; }
    if (b.assumptionSets) { var aq = await scope.root.collection('site_assumption_sets').limit(50).get(); return { sets: aq.docs.map(function (d) { var x = d.data(); return { id: d.id, kind: x.kind, label: x.label, fileName: x.fileName, createdAt: x.createdAt, chipsets: (x.set && x.set.chipsets || []).map(function (c) { return c.name; }), caveats: x.set && x.set.caveats }; }) }; }
    if (b.packages) { var pq = await scope.root.collection('site_packages').limit(200).get(); return { packages: pq.docs.map(function (d) { return d.data(); }) }; }
    if (b.job) { var js = await scope.root.collection('site_jobs').doc(docId(b.job)).get(); if (!js.exists) throw err(404, 'Job not found'); return { job: js.data() }; }
    if (b.performance) {
      /* T31: no connector → no values. Never synthesised. */
      return { status: 'no-live-connection', label: 'No live data connection', connectors: [], kpis: null, note: 'Measured performance appears only from an authorized connector or a reviewed monthly import.' };
    }
    if (b.widget) {
      /* Workspace widget (the Pulse / feed area): counts only, this org only. */
      var ws = await c.allSites(scope), wb = await scope.root.collection('site_bills').limit(500).get(), wp = await scope.root.collection('site_packages').limit(200).get(), wr = await scope.root.collection('site_results').limit(1000).get();
      return widgetSummary(ws, wb.docs.map(function (d) { return d.data(); }), wp.docs.map(function (d) { return d.data(); }), wr.docs.map(function (d) { return d.data(); }), (c.today && c.today()) || new Date().toISOString().slice(0, 10));
    }
    if (b.pipeline) {
      var all = await c.allSites(scope), by = {}; PIPELINE.forEach(function (p) { by[p] = []; }); by.unassigned = [];
      all.forEach(function (s) { if (s.lifecycleStatus === 'archived') return; var st = s.crm && s.crm.stage; (by[st] || by.unassigned).push({ siteId: s.siteId, name: s.name, customerId: s.crm && s.crm.customerId || null, nextFollowUp: s.crm && s.crm.nextFollowUp || null }); });
      return { stages: PIPELINE, pipeline: Object.keys(by).map(function (k) { return { stage: k, count: by[k].length, sites: by[k].slice(0, 200) }; }) };
    }
    if (b.crm) {
      var sd = await siteRef(scope, b.crm), cid = sd.data.crm && sd.data.crm.customerId, contacts = [];
      if (cid) { var cs = await scope.root.collection('customers').doc(cid).collection('contacts').limit(50).get(); contacts = cs.docs.map(function (d) { var x = d.data(); return { id: d.id, name: x.name, title: x.title, email: x.email, phone: x.phone, primary: !!x.primary }; }).filter(function (x) { return !x.archived; }); }
      var act = await sd.ref.collection('activity').limit(200).get();
      return { crm: sd.data.crm || null, contacts: contacts, activity: act.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b2) { return a.at < b2.at ? 1 : -1; }), stages: PIPELINE };
    }
    return undefined;
  }

  async function post(action, b, scope, caller, now) {
    /* ── Phase 2: shortlist → linked projects (opt-in, idempotent) ───────── */
    if (action === 'shortlist-create-projects') {
      need(scope, 'edit');
      var an = await scope.root.collection('site_analyses').doc(docId(b.analysisId)).get(); if (!an.exists || !an.data().shortlist) throw err(404, 'Shortlist not found');
      var sl = an.data().shortlist, want = Array.isArray(b.siteIds) ? b.siteIds.map(String) : null;
      if (!want || !want.length) throw err(400, 'Choose the shortlist sites to create projects for');
      if (want.length > 25) throw err(400, 'At most 25 projects at a time');
      var out = [];
      for (var i = 0; i < want.length; i++) {
        if (sl.siteIds.indexOf(want[i]) < 0) throw err(400, 'A chosen site is not on this shortlist');
        var sr = await siteRef(scope, want[i]), pid = 'pa_' + want[i].slice(0, 60), pref = scope.db.collection('projects').doc(pid), ps = await pref.get();
        if (ps.exists && ps.data().orgId !== scope.org) throw err(409, 'Project id collision');
        if (!ps.exists) {
          var a = sr.data.address || {};
          await pref.set({ uid: caller.uid, orgId: scope.org, ownerEmail: String(caller.email || '').toLowerCase(), ownerName: String(caller.email || '').split('@')[0], name: clean(sr.data.name, 120) || pid,
            address: [a.line1, a.city, a.state, a.zip].filter(Boolean).join(', '), type: 'compute', client: '', siteScopes: ['compute'], stage: 'candidate', createdAt: now, updatedAt: now,
            elements: [], conduits: [], bessList: [], annotations: [], portfolioSiteId: sr.data.siteId, portfolioAnalysisId: an.id, source: 'portfolio-shortlist' });
        }
        if (!(sr.data.links && sr.data.links.projectId === pid)) await setSite(sr.ref, { links: Object.assign({}, sr.data.links || {}, { projectId: pid }), revision: sr.data.revision + 1, updatedAt: now }, { merge: true });
        out.push({ siteId: want[i], projectId: pid, created: !ps.exists });
      }
      await audit(scope, caller, 'shortlist-create-projects', { analysisId: an.id, count: out.length });
      return { ok: true, projects: out };
    }
    /* ── Phase 2: power evidence + headroom (T11–T14) ───────────────────── */
    if (action === 'power-evidence') {
      need(scope, 'review');
      var pr = await siteRef(scope, b.siteId); if (Number(b.expectedRevision) !== pr.data.revision) throw err(409, 'This site changed since you opened it; reload');
      var lim = {}; P.LIMIT_KINDS.forEach(function (k) { var v = kwOrNull(b.limits && b.limits[k] && b.limits[k].kw, err, k); if (v != null) lim[k] = { kw: v, source: clean(b.limits[k].source, 200) || null, evidenceFileId: b.limits[k].fileId ? docId(b.limits[k].fileId) : null }; });
      var commits = (Array.isArray(b.commitments) ? b.commitments : []).slice(0, 50).map(function (x) { return { id: docId(x.id), kw: kwOrNull(x.kw, err, 'commitment') || 0, label: clean(x.label, 120) }; });
      var pe = Object.assign({}, pr.data.powerEvidence || {}, { limits: lim, required: (Array.isArray(b.required) ? b.required : ['approvedImport']).filter(function (k) { return P.LIMIT_KINDS.indexOf(k) >= 0; }),
        baseline: { kw: kwOrNull(b.baselineKw, err, 'baseline'), includes: (b.baselineIncludes || []).slice(0, 50).map(docId), basis: clean(b.baselineBasis, 200) || null }, commitments: commits, reserveKw: kwOrNull(b.reserveKw, err, 'reserve') || 0,
        topologyConfirmed: b.topologyConfirmed === true, importApproval: lim.approvedImport ? 'documented' : 'unknown', exportApproval: b.exportApprovalKw != null ? { kw: kwOrNull(b.exportApprovalKw, err, 'export') } : 'unknown', updatedAt: now, updatedBy: caller.email });
      if (b.review && b.review.signedBy) pe.review = { signedBy: clean(b.review.signedBy, 120), validUntil: clean(b.review.validUntil, 10), conditions: (b.review.conditions || []).slice(0, 20).map(function (x) { return clean(x, 200); }) };
      var hr = P.headroom({ required: pe.required, limits: lim, baselineKw: pe.baseline.kw, baselineIncludes: pe.baseline.includes, commitments: commits, reserveKw: pe.reserveKw });
      pe.headroom = hr; pe.verifiedKw = hr.verifiedKw; pe.fit = P.computeFit(hr.verifiedKw, { podItKw: num(b.podItKw) || 75, pue: num(b.pue) || 1.2 }); pe.classification = P.classify(Object.assign({}, pr.data, { powerEvidence: pe }));
      await pr.ref.set({ powerEvidence: pe, revision: pr.data.revision + 1, updatedAt: now }, { merge: true });
      var st = await staleFor(scope, pr.data.siteId, 'power', now);
      await audit(scope, caller, 'power-evidence', { siteId: pr.data.siteId, level: pe.classification.level });
      return { ok: true, powerEvidence: pe, staleMarked: st };
    }
    if (action === 'interval-upload') {
      need(scope, 'analyze');
      var ir = await siteRef(scope, b.siteId), txt = String(b.csv || ''); if (txt.length > 4 * 1024 * 1024) throw err(413, 'Interval file too large');
      var vals = txt.split(/\r?\n/).slice(b.header === false ? 0 : 1).map(function (l) { var x = l.split(',').pop().trim(); return x === '' ? null : Number(x); }).filter(function (v) { return v === null || isFinite(v); });
      var cov = P.intervalCoverage(vals, { intervalMin: num(b.intervalMin) || 15, activeOnly: b.activeOnly === true }), path = 'sitecrm/' + scope.org + '/_intervals/' + sha(txt);
      await c.bucket().file(path).save(Buffer.from(txt), { resumable: false, contentType: 'text/csv' });
      var pe2 = Object.assign({}, ir.data.powerEvidence || {}, { interval: { coverage: cov, path: path, meterId: clean(b.meterId, 60) || null, uploadedAt: now } });
      await ir.ref.set({ powerEvidence: pe2, revision: ir.data.revision + 1, updatedAt: now }, { merge: true });
      await staleFor(scope, ir.data.siteId, 'power', now);
      return { ok: true, coverage: cov };
    }
    if (action === 'envelope-save') {
      need(scope, 'review');
      var eid = docId(b.envelopeId), kw = kwOrNull(b.kw, err, 'envelope'); if (kw == null) throw err(400, 'Envelope kW required');
      await scope.root.collection('site_envelopes').doc(eid).set({ id: eid, kw: kw, kind: clean(b.kind, 40) || 'transformer', siteIds: (b.siteIds || []).slice(0, 100).map(docId), source: clean(b.source, 200) || null, updatedAt: now, updatedBy: caller.email });
      return { ok: true };
    }
    if (action === 'allocation-reserve') {
      need(scope, 'review');
      var envId = docId(b.envelopeId), key = docId(b.idempotencyKey), req = { kw: num(b.kw), idempotencyKey: key, now: Date.parse(now) };
      return await scope.db.runTransaction(async function (tx) {
        var envRef = scope.root.collection('site_envelopes').doc(envId), env = await tx.get(envRef); if (!env.exists) throw err(404, 'Envelope not found');
        var ledRef = scope.root.collection('site_allocations').doc('led_' + envId), led = await tx.get(ledRef), list = led.exists ? led.data().items || [] : [];
        var chk = P.checkAllocation(env.data(), list.map(function (x) { return Object.assign({ envelopeId: envId }, x); }), req);
        if (!chk.ok) throw err(409, chk.code + (chk.remainingKw != null ? ': ' + chk.remainingKw + ' kW left' : ''));
        if (chk.duplicate) return { ok: true, duplicate: true, allocation: chk.allocation };
        var item = { id: key, idempotencyKey: key, siteId: docId(b.siteId), kw: req.kw, status: 'reserved', scenarioId: b.scenarioId ? docId(b.scenarioId) : null, by: caller.email, at: now, expiresAt: b.expiresAt ? Date.parse(b.expiresAt) : null };
        tx.set(ledRef, { envelopeId: envId, items: list.concat([item]), updatedAt: now });
        return { ok: true, allocation: item, remainingKw: chk.remainingAfterKw };
      });
    }
    if (action === 'bess-check') { need(scope, 'analyze'); return P.bessPlan({ usableKwh: num(b.usableKwh), maxKw: num(b.maxKw), backupReserveKwh: num(b.backupReserveKwh) || 0, roundTripEff: num(b.roundTripEff) || 0.88, rechargeHours: num(b.rechargeHours) || 4 }, (b.claims || []).slice(0, 20).map(function (x) { return { service: clean(x.service, 40), kw: num(x.kw), kwh: num(x.kwh) }; }), b.gridHeadroomKw == null ? null : num(b.gridHeadroomKw)); }

    /* ── Phase 3: tool handoffs, map link, bills ─────────────────────────── */
    if (action === 'handoff') {
      need(scope, 'analyze');
      var hsr = await siteRef(scope, b.siteId), tool = clean(b.tool, 20); if (!H.TOOLS[tool]) throw err(400, 'Unknown tool');
      var bill = await c.billing(scope.org), ent = {}; Object.keys(bill && bill.toolOverrides || {}).forEach(function (k) { ent[k] = bill.toolOverrides[k]; });
      var pid2 = hsr.data.links && hsr.data.links.projectId || hsr.data.projectId || null;
      if (tool === 'editor' && !pid2) {
        if (b.createProject !== true) return { ok: false, status: 'needs-project', message: 'No linked Site Map project. Create one linked to this site?' };
        pid2 = 'pa_' + hsr.data.siteId.slice(0, 60); var pp = scope.db.collection('projects').doc(pid2), pps = await pp.get();
        if (pps.exists && pps.data().orgId !== scope.org) throw err(409, 'Project id collision');
        if (!pps.exists) { var ad = hsr.data.address || {}; await pp.set({ uid: caller.uid, orgId: scope.org, ownerEmail: String(caller.email || '').toLowerCase(), ownerName: String(caller.email || '').split('@')[0], name: clean(hsr.data.name, 120) || pid2, address: [ad.line1, ad.city, ad.state, ad.zip].filter(Boolean).join(', '), type: 'compute', client: '', siteScopes: ['compute'], stage: 'candidate', createdAt: now, updatedAt: now, elements: [], conduits: [], bessList: [], annotations: [], portfolioSiteId: hsr.data.siteId, source: 'portfolio-site' }); }
        await setSite(hsr.ref, { links: Object.assign({}, hsr.data.links || {}, { projectId: pid2 }), revision: hsr.data.revision + 1, updatedAt: now }, { merge: true });
      }
      var hid = 'ho_' + sha([hsr.data.siteId, tool, pid2, b.scenarioId || '', now, caller.uid]).slice(0, 20);
      var ln = H.launch(tool, { handoffId: hid, siteId: hsr.data.siteId, projectId: pid2, scenarioId: b.scenarioId ? docId(b.scenarioId) : null }, ent);
      if (tool === 'editor' && ln.ok) ln.url = '/editor.html?id=' + encodeURIComponent(pid2) + '&handoff=' + hid + '&return=' + encodeURIComponent('/site-crm.html?site=' + hsr.data.siteId);
      await scope.root.collection('site_handoffs').doc(hid).set({ id: hid, siteId: hsr.data.siteId, tool: tool, projectId: pid2, scenarioId: b.scenarioId || null, inputRevision: hsr.data.revision, status: ln.ok ? 'requested' : ln.status, reason: ln.reason || null, createdAt: now, by: caller.email,
        context: { name: hsr.data.name, address: hsr.data.address || null, installedChargerKw: AS.factVal(hsr.data, 'installedChargerKw'), powerLevel: P.classify(hsr.data).level } });
      return Object.assign({ handoffId: hid, projectId: pid2 }, ln);
    }
    if (action === 'handoff-result') {
      need(scope, 'analyze');
      var hr2 = scope.root.collection('site_handoffs').doc(docId(b.handoffId)), hd = await hr2.get(); if (!hd.exists) throw err(404, 'Handoff not found');
      var h = hd.data(), rec = H.record(h.tool, { inputRevision: h.inputRevision, now: now }, { status: clean(b.status, 20), data: b.data && typeof b.data === 'object' ? JSON.parse(JSON.stringify(b.data).slice(0, 20000) || 'null') : null, engineVersion: clean(b.engineVersion, 40) || null, warnings: (b.warnings || []).slice(0, 20).map(function (x) { return clean(x, 200); }) });
      var saved = await saveResult(scope, Object.assign(rec, { siteId: h.siteId, handoffId: h.id, scenarioId: h.scenarioId || null, inputHash: sha([h.inputRevision, h.tool, rec.result]) }));
      await hr2.set({ status: rec.status, resultId: saved.id, finishedAt: now }, { merge: true });
      return { ok: true, result: saved };
    }
    if (action === 'map-sync') {
      need(scope, 'edit');
      var ms = await siteRef(scope, b.siteId), link = await mapLinkOf(scope, ms.data); if (!link) throw err(400, 'No linked Site Map project');
      if (b.markReviewed === true) { need(scope, 'review'); link.reviewedRevision = link.revision; }
      var prevRev = ms.data.links && ms.data.links.map && ms.data.links.map.revision, status = R.mapStatus(link);
      await ms.ref.set({ links: Object.assign({}, ms.data.links || {}, { map: { revision: link.revision, hash: link.hash, featureCount: link.featureCount, reviewedRevision: link.reviewedRevision, state: status.state, syncedAt: now } }), revision: ms.data.revision + 1, updatedAt: now }, { merge: true });
      var stm = prevRev != null && prevRev !== link.revision ? await staleFor(scope, ms.data.siteId, 'map', now) : 0;
      return { ok: true, map: status, revision: link.revision, staleMarked: stm };
    }
    if (action === 'bill-save') {
      need(scope, 'edit');
      var bs = await siteRef(scope, b.siteId), bid = b.billId ? docId(b.billId) : 'bill_' + sha([bs.data.siteId, now, caller.uid, Math.random()]).slice(0, 20), bref = scope.root.collection('site_bills').doc(bid), bex = await bref.get();
      if (bex.exists && bex.data().siteId !== bs.data.siteId) throw err(409, 'Bill belongs to another site');
      var e = b.entered || {}, ent2 = {}; ['periodStart', 'periodEnd'].forEach(function (k) { if (e[k]) { if (!/^\d{4}-\d{2}-\d{2}$/.test(e[k])) throw err(400, k + ' must be YYYY-MM-DD'); ent2[k] = e[k]; } });
      ['kwh', 'billedKw', 'energyUsd', 'demandUsd', 'fixedUsd', 'taxesUsd', 'creditsUsd', 'totalUsd'].forEach(function (k) { if (e[k] != null && e[k] !== '') { var n = num(e[k]); if (!isFinite(n)) throw err(400, k + ' must be a number'); ent2[k] = n; } });
      ['meterId', 'accountNumberLast4', 'tariff', 'demandBasis', 'serviceAddress', 'currency'].forEach(function (k) { if (e[k]) ent2[k] = clean(e[k], k === 'serviceAddress' ? 200 : 60); });
      if (e.accountNumber) ent2.accountNumberLast4 = clean(e.accountNumber, 40).slice(-4);
      if (e.estimatedRead) ent2.estimatedRead = true;
      if (Array.isArray(e.lineItems)) ent2.lineItems = e.lineItems.slice(0, 40).map(function (l) { return { label: clean(l.label, 80), amount: num(l.amount) }; });
      var bill2 = Object.assign({}, bex.exists ? bex.data() : {}, { id: bid, siteId: bs.data.siteId, fileId: b.fileId ? docId(b.fileId) : (bex.exists ? bex.data().fileId : null), manual: b.manual === true, entered: ent2, extraction: b.extraction ? { source: clean(b.extraction.source, 40), confidence: num(b.extraction.confidence) } : null, reviewedBy: null, accepted: false, updatedAt: now, updatedBy: caller.email });
      var stt = R.billState(bill2, bs.data); bill2.state = stt.state; bill2.problems = stt.problems;
      await bref.set(bill2); await staleFor(scope, bs.data.siteId, 'bill', now);
      return { ok: true, bill: bill2 };
    }
    if (action === 'bill-review') {
      need(scope, 'review');
      var brf = scope.root.collection('site_bills').doc(docId(b.billId)), bd = await brf.get(); if (!bd.exists) throw err(404, 'Bill not found');
      var bl = bd.data(), site = (await siteRef(scope, bl.siteId)).data, s0 = R.billState(Object.assign({}, bl, { reviewedBy: null }), site);
      if (b.reject === true) { await brf.set({ state: 'rejected', reviewedBy: caller.email, reviewedAt: now, rejectReason: clean(b.reason, 200) }, { merge: true }); return { ok: true, state: 'rejected' }; }
      if (s0.problems.length) return { ok: false, state: s0.state, problems: s0.problems, message: 'Resolve these before the bill can be reviewed' };
      var acc = Object.assign({}, bl, { reviewedBy: caller.email, accepted: b.accept === true }), s1 = R.billState(acc, site);
      await brf.set({ reviewedBy: caller.email, reviewedAt: now, accepted: b.accept === true, state: s1.state, problems: [] }, { merge: true });
      await staleFor(scope, bl.siteId, 'bill', now);
      return { ok: true, state: s1.state };
    }

    /* ── Phase 4: assumption sets, scenarios, portfolio IRR, packages ───── */
    if (action === 'assumption-set-import') {
      need(scope, 'finance');
      var bytes = Buffer.from(String(b.base64 || ''), 'base64'); if (!bytes.length || bytes.length > c.MAX_UPLOAD) throw err(413, 'Workbook missing or too large');
      var info = xlsx.inspect(bytes); xlsx.assertSafe(info);
      var names = info.sheets.map(function (s) { return s.name; }); if (!Q.detect(names)) throw err(400, 'Not an IQGEN compute economics workbook');
      var gs = {}; Q.SHEETS.forEach(function (n) { gs[n] = xlsx.sheetGrid(bytes, { sheet: n }); });
      var set = Q.parse(gs, { file: clean(b.fileName, 120) }), sid = 'iqgen_' + sha(bytes).slice(0, 20);
      await c.bucket().file('sitecrm/' + scope.org + '/_assumptions/' + sha(bytes)).save(bytes, { resumable: false, contentType: 'application/octet-stream' });
      await scope.root.collection('site_assumption_sets').doc(sid).set({ id: sid, kind: set.kind, label: set.label, fileName: set.file, fileSha: sha(bytes), set: set, createdAt: now, createdBy: caller.email });
      await audit(scope, caller, 'assumption-set-import', { id: sid });
      return { ok: true, id: sid, chipsets: set.chipsets.length, formulaErrors: set.formulaErrors, caveats: set.caveats };
    }
    if (action === 'scenario-run') {
      need(scope, 'finance');
      var sr2 = await siteRef(scope, b.siteId), anq = await scope.root.collection('site_analyses').limit(20).get(), legacy = anq.docs.map(function (d) { return d.data(); }).filter(function (x) { return x.assumptions && x.assumptions.length; })[0];
      if (!legacy) throw err(409, 'No legacy assumption set: import the model workbook first');
      var base = E.fromAssumptions(legacy.assumptions), w = sr2.data.opportunity && sr2.data.opportunity.wb2Legacy, kind = clean(b.assumptionSet, 20) || 'wb2-legacy', res, setRef = { kind: 'wb2-legacy', analysisId: legacy.id };
      var ov = b.overrides && typeof b.overrides === 'object' ? b.overrides : {}; Object.keys(ov).slice(0, 30).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(base, k) || LEGACY_FIELDS.indexOf(k) >= 0) { var n = num(ov[k]); if (!isFinite(n)) throw err(400, k + ' must be a number'); base[k] = n; } });
      if (kind === 'iqgen') { var qs = await scope.root.collection('site_assumption_sets').doc(docId(b.assumptionSetId)).get(); if (!qs.exists) throw err(404, 'Assumption set not found'); res = E.iqgenPod(qs.data().set, clean(b.chipset, 80) || qs.data().set.selectedChipset, base); setRef = { kind: 'iqgen-hardware-v1', id: qs.id }; }
      else res = E.legacyPod(base);
      if (res.status !== 'ok') return { ok: false, status: res.status, missing: res.missing, reason: res.reason };
      var pods = b.pods != null ? Math.max(0, Math.floor(num(b.pods))) : (sr2.data.powerEvidence && sr2.data.powerEvidence.fit && sr2.data.powerEvidence.fit.pods != null ? sr2.data.powerEvidence.fit.pods : (w ? w.pods : null));
      if (!(pods > 0)) return { ok: false, status: 'incomplete', reason: 'No pod count: classify power or enter a pod count', missing: ['pods'] };
      var start = /^\d{4}-\d{2}-\d{2}$/.test(b.startDate || '') ? b.startDate : null, spv = res.rows.map(function (r) { return r.spv * pods; }), inv = res.rows.map(function (r) { return r.investor * pods; });
      var scenarioId = docId(b.scenarioId || ('sc_' + kind)), rec = { siteId: sr2.data.siteId, kind: 'finance', scenarioId: scenarioId, model: res.model, assumptionSet: setRef, pods: pods, capital: res.capital * pods,
        projectIrr: res.projectIrr, investorIrr: res.investorIrr, paybackMonths: res.paybackMonths, npv: E.npv(spv, b.discountRate == null ? null : num(b.discountRate)),
        dated: start ? { start: start, project: E.xirr(E.monthlyDates(start, spv)), investor: E.xirr(E.monthlyDates(start, inv)), flows: E.monthlyDates(start, spv) } : null,
        monthly: { spv: spv, investor: inv }, newcoSpreadMonthly: res.rows.map(function (r) { return r.newcoSpread == null ? null : r.newcoSpread * pods; }), hardware: res.hardware || null, scope: res.scope,
        status: 'current', inputHash: sha([kind, setRef, base, pods, start, sr2.data.revision]), engineVersion: 'economics-v1', at: now, by: caller.email };
      var saved2 = await saveResult(scope, rec);
      return { ok: true, result: saved2 };
    }
    if (action === 'portfolio-irr') {
      need(scope, 'finance');
      var ids = (b.siteIds || []).slice(0, 500).map(docId), flows = [], missing = [];
      for (var j = 0; j < ids.length; j++) { var rq = await scope.root.collection('site_results').where('siteId', '==', ids[j]).limit(50).get(); var f = rq.docs.map(function (d) { return d.data(); }).filter(function (x) { return x.kind === 'finance' && x.status === 'current' && x.dated; })[0]; if (f) flows.push({ siteId: ids[j], flows: f.dated.flows }); else missing.push(ids[j]); }
      var pf = E.portfolio(flows); return { ok: true, method: pf.method, irr: pf.irr, sitesIncluded: flows.length, sitesMissing: missing, note: 'Site IRRs are never averaged.' };
    }
    if (action === 'package-prepare' || action === 'package-submit') {
      var isSubmit = action === 'package-submit';
      need(scope, isSubmit ? 'submit' : 'finance');
      var pkgId = isSubmit ? docId(b.packageId) : 'pkg_' + sha([b.siteId, b.scenarioId]).slice(0, 20);
      async function ctxFor(siteDoc, scenarioId) {
        var bq = await scope.root.collection('site_bills').where('siteId', '==', siteDoc.siteId).limit(200).get(), rq2 = await scope.root.collection('site_results').where('siteId', '==', siteDoc.siteId).limit(200).get();
        var ml = await mapLinkOf(scope, siteDoc), synced = siteDoc.links && siteDoc.links.map;
        if (ml && synced && synced.hash !== ml.hash) ml.packageRevision = -1;
        var ag = await scope.root.collection('sites').doc(siteDoc.siteId).collection('agreements').limit(50).get();
        return { site: siteDoc, scenario: { id: scenarioId }, mapLink: ml, bills: bq.docs.map(function (d) { return d.data(); }), analyses: rq2.docs.map(function (d) { return d.data(); }),
          siteControlReviewed: ag.docs.some(function (d) { var x = d.data(); return x.reviewStatus === 'reviewed' && x.computePermitted === true; }), powerClass: P.classify(siteDoc).level, canPublish: scope.caps.indexOf('submit') >= 0 };
      }
      if (!isSubmit) {
        var ps2 = await siteRef(scope, b.siteId), scn = docId(b.scenarioId || 'sc_wb2-legacy'), cx = await ctxFor(ps2.data, scn), g = R.gates(cx);
        var pkg = { id: pkgId, siteId: ps2.data.siteId, scenarioId: scn, status: 'draft', gates: g, mapRevision: cx.mapLink ? cx.mapLink.revision : null, siteRevision: ps2.data.revision, preparedAt: now, preparedBy: caller.email, visibility: 'private' };
        await scope.root.collection('site_packages').doc(pkgId).set(pkg);
        return { ok: true, package: pkg };
      }
      if (b.confirm !== true) throw err(400, 'Submission needs explicit confirmation');
      return await scope.db.runTransaction(async function (tx) {
        var subRef = scope.root.collection('site_submissions').doc(pkgId), sub = await tx.get(subRef);
        if (sub.exists) return { ok: true, duplicate: true, submission: sub.data() };
        var pref2 = scope.root.collection('site_packages').doc(pkgId), pk = await tx.get(pref2); if (!pk.exists) throw err(404, 'Package not found');
        var pkd = pk.data(), sref = scope.root.collection('sites').doc(pkd.siteId), ss = await tx.get(sref), cx2 = await ctxFor(ss.data(), pkd.scenarioId), g2 = R.gates(cx2);
        if (!g2.ok) { var e2 = err(409, 'Submission blocked: ' + g2.codes.map(function (x) { return x.code; }).join(', ')); e2.codes = g2.codes; throw e2; }
        if (pkd.status === 'stale' || pkd.siteRevision !== ss.data().revision) throw err(409, 'Package is stale: prepare it again');
        var snap = { id: pkgId, packageId: pkgId, siteId: pkd.siteId, scenarioId: pkd.scenarioId, idempotencyKey: b.idempotencyKey ? docId(b.idempotencyKey) : null, submittedAt: now, submittedBy: caller.email, status: 'submitted-private',
          snapshot: { site: { siteId: pkd.siteId, name: ss.data().name, revision: ss.data().revision }, mapRevision: cx2.mapLink.revision, bills: cx2.bills.filter(function (x) { return x.state === 'accepted'; }).map(function (x) { return { id: x.id, periodStart: x.entered.periodStart, periodEnd: x.entered.periodEnd }; }),
            finance: cx2.analyses.filter(function (a) { return a.kind === 'finance' && a.scenarioId === pkd.scenarioId; }).map(function (a) { return { id: a.id, version: a.version, projectIrr: a.projectIrr, investorIrr: a.investorIrr, paybackMonths: a.paybackMonths }; }), partialHistory: g2.partialHistory },
          publication: { state: 'not-published', reason: 'Financing-marketplace publication is a separate, explicitly authorized step (disabled in this release).' } };
        tx.set(subRef, snap); tx.set(pref2, { status: 'submitted', submittedAt: now }, { merge: true });
        return { ok: true, submission: snap };
      });
    }

    /* ── CRM on the register (links the existing customers/ CRM) ────────── */
    if (action === 'crm-link') {
      need(scope, 'crm');
      var cl = await siteRef(scope, b.siteId), cid = b.customerId ? docId(b.customerId) : null;
      if (cid) { var cu = await scope.root.collection('customers').doc(cid).get(); if (!cu.exists) throw err(404, 'Customer account not found in this workspace'); }
      var stage = b.stage ? clean(b.stage, 30) : (cl.data.crm && cl.data.crm.stage) || null; if (stage && PIPELINE.indexOf(stage) < 0) throw err(400, 'Unknown pipeline stage');
      var crm = Object.assign({}, cl.data.crm || {}, { customerId: cid !== null ? cid : (cl.data.crm && cl.data.crm.customerId) || null, stage: stage, owner: b.owner ? clean(b.owner, 120) : (cl.data.crm && cl.data.crm.owner) || caller.email, updatedAt: now });
      await cl.ref.set({ crm: crm, revision: cl.data.revision + 1, updatedAt: now }, { merge: true });
      await cl.ref.collection('activity').doc().create({ type: 'stage-change', subject: 'Pipeline: ' + (stage || 'unassigned'), at: now, by: caller.email });
      return { ok: true, crm: crm };
    }
    if (action === 'activity-log') {
      need(scope, 'crm');
      var al = await siteRef(scope, b.siteId), type = clean(b.type, 20); if (ACTIVITY.indexOf(type) < 0) throw err(400, 'Unknown activity type');
      if (b.followUpAt && !/^\d{4}-\d{2}-\d{2}$/.test(b.followUpAt)) throw err(400, 'followUpAt must be YYYY-MM-DD');
      var act = { orgId: scope.org, siteId: al.data.siteId, type: type, subject: clean(b.subject, 160), body: clean(b.body, 4000), contactId: b.contactId ? docId(b.contactId) : null, contactName: null, at: now, by: caller.email, loggedAt: now, followUpAt: b.followUpAt || null, done: false, doneAt: null, doneBy: null };
      var aref = al.ref.collection('activity').doc(); await aref.create(act);
      if (b.followUpAt) {
        /* the site CRM's own follow-up index (sitecrm_followups), so the portfolio Today hub lists it and `done` closes it */
        await scope.root.collection('sitecrm_followups').doc(al.data.siteId + '__' + aref.id).set({ orgId: scope.org, siteId: al.data.siteId, siteName: al.data.name || '', activityId: aref.id, type: type, subject: act.subject, followUpAt: b.followUpAt, contactId: act.contactId, contactName: null, by: caller.email, at: now, open: true, createdAt: now });
        await al.ref.set({ crm: Object.assign({}, al.data.crm || {}, { nextFollowUp: b.followUpAt }) }, { merge: true });
      }
      return { ok: true, id: aref.id };
    }

    /* ── Phase 5: durable jobs (T32) ─────────────────────────────────────── */
    if (action === 'job-start') {
      need(scope, 'analyze');
      var kindJ = clean(b.kind, 30); if (['power-classify'].indexOf(kindJ) < 0) throw err(400, 'Unknown job kind');
      var sids = (b.siteIds || []).slice(0, AS.MAX_SITES).map(docId), jid = 'job_' + sha([kindJ, sids, b.idempotencyKey || now]).slice(0, 20), jref = scope.root.collection('site_jobs').doc(jid), jx = await jref.get();
      if (jx.exists) return { ok: true, duplicate: true, job: jx.data() };
      var items = {}; sids.forEach(function (s) { items[s] = { status: 'pending' }; });
      var job = { id: jid, kind: kindJ, status: 'paused', items: items, total: sids.length, done: 0, failed: 0, createdAt: now, createdBy: caller.email, uid: caller.uid, note: 'Client-driven resumable run: progress is persisted; closing the browser pauses it.' };
      await jref.set(job); return { ok: true, job: job };
    }
    if (action === 'job-step' || action === 'job-cancel') {
      need(scope, 'analyze');
      var jr = scope.root.collection('site_jobs').doc(docId(b.jobId)), jd = await jr.get(); if (!jd.exists) throw err(404, 'Job not found');
      var jb = jd.data(); if (jb.status === 'complete' || jb.status === 'cancelled') return { ok: true, job: jb };
      if (action === 'job-cancel') { await jr.set({ status: 'cancelled', cancelledAt: now }, { merge: true }); return { ok: true, job: Object.assign(jb, { status: 'cancelled' }) }; }
      var max = Math.min(50, Math.max(1, num(b.max) || 25)), keys = Object.keys(jb.items).filter(function (k) { return jb.items[k].status === 'pending' || (b.retryFailed && jb.items[k].status === 'failed'); }).slice(0, max);
      for (var q = 0; q < keys.length; q++) {
        try { var sx = await siteRef(scope, keys[q]); var cls = P.classify(sx.data); await saveResult(scope, { siteId: keys[q], kind: 'power', status: 'current', result: cls, inputHash: sha([sx.data.revision, 'classify']), engineVersion: 'power-v1', at: now }); jb.items[keys[q]] = { status: 'done', level: cls.level }; }
        catch (e) { jb.items[keys[q]] = { status: 'failed', error: clean(e.message, 160) }; }
      }
      var vals = Object.keys(jb.items).map(function (k) { return jb.items[k].status; });
      jb.done = vals.filter(function (v) { return v === 'done'; }).length; jb.failed = vals.filter(function (v) { return v === 'failed'; }).length;
      jb.status = vals.some(function (v) { return v === 'pending'; }) ? 'paused' : (jb.failed ? 'complete-with-failures' : 'complete'); jb.updatedAt = now;
      await jr.set(jb); return { ok: true, job: jb };
    }
    return undefined;
  }
  return { get: get, post: post, staleFor: staleFor };
}
module.exports = { make: make, PIPELINE: PIPELINE, widgetSummary: widgetSummary };
