/* POST /api/tenant-approve — ClearSky staff only.
   Body: { orgId, action: 'approve'|'reject'|'suspend'|'reactivate', tier?, note? }
   approve  → status active (+ optional tier), mirrors tenant_public, notifies the owner
   reject   → status cancelled, tenant_public removed (hostname released)
   suspend / reactivate → status only */
'use strict';
var A = require('./_lib/admin');
var M = require('./_lib/mail');
module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'staff only');
    var orgId = String(b.orgId || '').toLowerCase(); if (!orgId) throw A.httpError(400, 'orgId required');
    var db = A.db(), FV = A.FieldValue(); var ref = db.collection('omega_orgs').doc(orgId);
    return ref.get().then(function (s) {
      if (!s.exists) throw A.httpError(404, 'no such tenant');
      var org = s.data(), hosts = org.domains || [];
      var status = { approve: 'active', reject: 'cancelled', suspend: 'suspended', reactivate: 'active' }[b.action];
      if (!status) throw A.httpError(400, 'action must be approve|reject|suspend|reactivate');
      var batch = db.batch();
      var patch = { status: status, updatedAt: FV.serverTimestamp() };
      if (b.action === 'approve') { patch.approvedAt = FV.serverTimestamp(); patch.approvedBy = caller.email; }
      if (b.note) patch.reviewNote = b.note;
      batch.set(ref, patch, { merge: true });
      if (b.tier) batch.set(ref.collection('billing').doc('current'), { tier: b.tier, updatedAt: FV.serverTimestamp() }, { merge: true });
      hosts.forEach(function (h) {
        var pref = db.collection('tenant_public').doc(String(h).toLowerCase());
        if (b.action === 'reject') batch.delete(pref);
        else batch.set(pref, { status: status, tier: b.tier || (org.publicTier) || 'trial', updatedAt: FV.serverTimestamp() }, { merge: true });
      });
      batch.set(ref.collection('notifications').doc(), { kind: 'account', text: b.action === 'approve' ? 'Your workspace has been approved. Welcome to ClearSky-OMEGA.' : 'Your workspace status is now ' + status + '.', read: false, createdAt: FV.serverTimestamp() });
      return batch.commit().then(function () {
        var owner = (org.signup && org.signup.email) || null;
        if (!owner) return ref.collection('members').where('role', '==', 'owner').limit(1).get().then(function (q) { return q.empty ? null : q.docs[0].data().email; });
        return owner;
      }).then(function (ownerEmail) {
        if (!ownerEmail) return null;
        return ref.collection('billing').doc('current').get().then(function (bs) {
          var trial = bs.exists ? bs.data().trialEndsAt : null;
          var o = { email: ownerEmail, company: org.name || orgId, orgId: orgId, host: hosts[0] || (org.slug + '.clearskyomega.com'), note: b.note, status: status, trialEndsAt: trial };
          if (b.action === 'approve') return M.templates.approved(o);
          if (b.action === 'reject') return M.templates.rejected(o);
          return M.templates.statusChanged(o);
        });
      }).then(function (mail) { return { ok: true, orgId: orgId, status: status, hosts: hosts, mail: mail || null }; });
    });
  });
});
