/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/rfq   —  Request for Quote from the BOM tool, fanned out to vendors
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { projectId, bom: [ { sku, description, qty, unit, category, vendorOrgId? } ], note? }

   ROUTING RULE (this is the IP; it lives here and nowhere in the browser):
     · every vendorOrgId appearing on a BOM line receives THAT vendor's lines
       (scope 'line-items'); lines without vendorOrgId are looked up in
       /equipment by sku;
     · every tenant with omega_orgs.receivesFullBom == true receives the
       WHOLE BOM (scope 'full-bom') — distributors such as Walters;
     · the customer's own org is never a recipient;
     · each recipient gets ONE doc under rfqs/{id}/recipients/{vendorOrgId}
       and reads only that — see firestore.rules.

   action: 'reveal'  { rfqId, vendorOrgId } — customer accepted this vendor's
   quote; writes the contact block onto that recipient doc only.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  return A.authenticate(req).then(function (caller) {
    var db = A.db(), FV = A.FieldValue();
    if (b.action === 'reveal') return reveal(caller, b, db, FV);

    if (!b.projectId || !Array.isArray(b.bom) || !b.bom.length) throw A.httpError(400, 'projectId and a non-empty bom[] are required');
    return db.collection('projects').doc(String(b.projectId)).get().then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'project not found');
      var project = ps.data(), sourceOrgId = project.orgId;
      return A.canActInOrg(caller, sourceOrgId).then(function (ok) {
        if (!ok) throw A.httpError(403, 'not your project');
        /* 1 · resolve vendors for lines that don't name one */
        var lines = b.bom.map(function (l, i) { return { idx: i, sku: String(l.sku || ''), description: l.description || '', qty: Number(l.qty) || 1, unit: l.unit || 'ea', category: l.category || null, vendorOrgId: l.vendorOrgId || null }; });
        var lookups = lines.filter(function (l) { return !l.vendorOrgId && l.sku; }).map(function (l) {
          return db.collection('equipment').where('key', '==', l.sku).limit(1).get().then(function (q) { if (!q.empty) { var e = q.docs[0].data(); l.vendorOrgId = e.vendorOrgId || null; l.category = l.category || e.category || null; } });
        });
        return Promise.all(lookups).then(function () {
          /* 2 · full-BOM recipients */
          return db.collection('omega_orgs').where('receivesFullBom', '==', true).get();
        }).then(function (q) {
          var recipients = {};
          q.docs.forEach(function (d) { if (d.id !== sourceOrgId && (d.data().status || 'active') === 'active') recipients[d.id] = { scope: 'full-bom', lines: lines }; });
          lines.forEach(function (l) {
            if (!l.vendorOrgId || l.vendorOrgId === sourceOrgId) return;
            if (recipients[l.vendorOrgId] && recipients[l.vendorOrgId].scope === 'full-bom') return;
            (recipients[l.vendorOrgId] = recipients[l.vendorOrgId] || { scope: 'line-items', lines: [] }).lines.push(l);
          });
          var ids = Object.keys(recipients);
          if (!ids.length) return { ok: true, rfqId: null, recipients: [], skipped: 'no routable vendors on this BOM' };

          /* 3 · write parent + one recipient doc each, atomically */
          var ref = db.collection('rfqs').doc();
          var anon = { state: project.state || (project.site && project.site.state) || null, utility: project.utility || null,
            sizeKw: project.sizeKw || null, sizeKwh: project.sizeKwh || null, stage: project.stage || 'design' };
          var batch = db.batch();
          batch.set(ref, { sourceOrgId: sourceOrgId, projectId: String(b.projectId), projectName: project.name || project.title || null,
            bom: lines, note: b.note || null, status: 'open', recipientOrgIds: ids, requestedBy: caller.email,
            createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
          ids.forEach(function (v) {
            batch.set(ref.collection('recipients').doc(v), { vendorOrgId: v, scope: recipients[v].scope, lines: recipients[v].lines, anon: anon,
              status: 'sent', quote: null, revealed: false, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
            batch.set(db.collection('omega_orgs').doc(v).collection('notifications').doc(), { text: 'New RFQ (' + recipients[v].lines.length + ' line' + (recipients[v].lines.length === 1 ? '' : 's') + ', ' + recipients[v].scope + ')', kind: 'rfq', rfqId: ref.id, read: false, createdAt: FV.serverTimestamp() });
          });
          return batch.commit().then(function () { return { ok: true, rfqId: ref.id, recipients: ids }; });
        });
      });
    });
  });
});

function reveal(caller, b, db, FV) {
  if (!b.rfqId || !b.vendorOrgId) throw A.httpError(400, 'rfqId and vendorOrgId required');
  var ref = db.collection('rfqs').doc(String(b.rfqId));
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'rfq not found');
    var d = s.data();
    return A.canActInOrg(caller, d.sourceOrgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'only the customer can reveal');
      return db.collection('omega_orgs').doc(d.sourceOrgId).get().then(function (o) {
        var org = o.exists ? o.data() : {};
        return ref.collection('recipients').doc(String(b.vendorOrgId)).update({ revealed: true, status: 'accepted',
          contact: { orgId: d.sourceOrgId, orgName: org.name || d.sourceOrgId, email: caller.email, projectId: d.projectId, projectName: d.projectName || null },
          updatedAt: FV.serverTimestamp() }).then(function () { return { ok: true }; });
      });
    });
  });
}
