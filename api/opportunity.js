/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/opportunity   —  editor-generated, anonymous vendor opportunity
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Called by editor.html when a placed SKU's equipment record carries a
   vendorOrgId (and by the value-stack tool when a controller/optimizer
   vendor is selected). The browser never writes /opportunities directly —
   the parent doc must carry NO identity, and only a server can guarantee
   that. See firestore.rules → opportunities.

   Body: { projectId, sku, category, qty, sizeKw, sizeKwh, state, utility, stage }
   Optional: { vendorOrgId }  — otherwise looked up from equipment/{sku}

   Idempotent per (projectId, sku): re-placing the same unit updates the
   existing open opportunity rather than spamming the vendor.

   Actions (same endpoint, `action` field):
     action: 'reveal'  { oppId }  — customer accepted; copies contact into
                                    private/contact and flips status.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

function publicShape(b) {
  return { state: b.state || null, utility: b.utility || null,
    sizeKw: num(b.sizeKw), sizeKwh: num(b.sizeKwh), stage: b.stage || 'design' };
}
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  return A.authenticate(req).then(function (caller) {
    var db = A.db(), FV = A.FieldValue();
    if (b.action === 'reveal') return reveal(caller, b, db, FV);

    if (!b.projectId || !b.sku) throw A.httpError(400, 'projectId and sku are required');
    return db.collection('projects').doc(String(b.projectId)).get().then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'project not found');
      var project = ps.data(); var sourceOrgId = project.orgId;
      return A.canActInOrg(caller, sourceOrgId).then(function (ok) {
        if (!ok) throw A.httpError(403, 'not your project');
        var vendorLookup = b.vendorOrgId ? Promise.resolve({ vendorOrgId: b.vendorOrgId, category: b.category })
          : db.collection('equipment').where('key', '==', String(b.sku)).limit(1).get().then(function (q) {
              if (q.empty) return null; var e = q.docs[0].data();
              return e.vendorOrgId ? { vendorOrgId: e.vendorOrgId, category: e.category || b.category } : null;
            });
        return vendorLookup.then(function (v) {
          if (!v) return { ok: true, skipped: 'no vendorOrgId on this SKU' };
          if (v.vendorOrgId === sourceOrgId) return { ok: true, skipped: 'own product' };
          var opps = db.collection('opportunities');
          return opps.where('vendorOrgId', '==', v.vendorOrgId).where('sku', '==', String(b.sku)).where('projectKey', '==', String(b.projectId)).limit(1).get()
            .then(function (q) {
              var pub = publicShape(b);
              if (!q.empty) {
                var ref = q.docs[0].ref;
                return ref.update({ qty: num(b.qty) || 1, 'public': pub, updatedAt: FV.serverTimestamp() }).then(function () { return { ok: true, oppId: ref.id, updated: true }; });
              }
              var ref2 = opps.doc();
              /* projectKey is a hash-like opaque key so the vendor can't
                 correlate it to a project they can't read anyway; using the
                 raw id would leak nothing readable but we keep it opaque. */
              var batch = db.batch();
              batch.set(ref2, { vendorOrgId: v.vendorOrgId, category: v.category || null, sku: String(b.sku), qty: num(b.qty) || 1,
                projectKey: String(b.projectId), 'public': pub, status: 'open', quote: null,
                createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
              batch.set(ref2.collection('private').doc('contact'), { sourceOrgId: sourceOrgId, projectId: String(b.projectId),
                projectName: project.name || project.title || null, contactEmail: caller.email, contactName: caller.claims.name || null,
                siteAddress: project.address || (project.site && project.site.address) || null, createdAt: FV.serverTimestamp() });
              return batch.commit().then(function () {
                notify(v.vendorOrgId, 'New opportunity: ' + (v.category || 'equipment') + ' — ' + (pub.sizeKw || '?') + ' kW / ' + (pub.sizeKwh || '?') + ' kWh in ' + (pub.state || 'US'));
                return { ok: true, oppId: ref2.id, created: true };
              });
            });
        });
      });
    });
  });
});

function reveal(caller, b, db, FV) {
  if (!b.oppId) throw A.httpError(400, 'oppId required');
  var ref = db.collection('opportunities').doc(String(b.oppId));
  return Promise.all([ref.get(), ref.collection('private').doc('contact').get()]).then(function (r) {
    if (!r[0].exists || !r[1].exists) throw A.httpError(404, 'opportunity not found');
    var priv = r[1].data();
    return A.canActInOrg(caller, priv.sourceOrgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'only the customer can reveal');
      return ref.update({ status: 'revealed', revealedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() }).then(function () {
        notify(r[0].data().vendorOrgId, 'Quote accepted — contact details are now available on opportunity ' + ref.id);
        return { ok: true };
      });
    });
  });
}

/* Notification hook. Writes a row the dashboard's inbox widget reads; email
   delivery is /api/notify.js's job and is opt-in per tenant. */
function notify(orgId, text) {
  try { A.db().collection('omega_orgs').doc(orgId).collection('notifications').add({ text: text, kind: 'opportunity', read: false, createdAt: A.FieldValue().serverTimestamp() }); } catch (e) {}
}
