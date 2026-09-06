/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/set-role   —  assign an in-org role and mint custom claims
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { orgId, targetUid | targetEmail, role: 'owner'|'admin'|'member'|'viewer', status?: 'active'|'disabled' }

   Who may call:
     · ClearSky staff — any org, any role
     · the org OWNER   — any role in their own org (including transferring 'owner')
     · an org ADMIN    — 'admin' | 'member' | 'viewer' in their own org, never on the owner

   Writes omega_orgs/{orgId}/members/{uid} AND sets custom claims
   { orgId, role } on the Auth user, so Storage rules and other /api
   functions can trust request.auth.token.role without a Firestore read.
   The user must sign out/in (or force-refresh their token) to pick claims up;
   the members doc is what the portal reads immediately.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var orgId = String(b.orgId || '').toLowerCase();
  var role = b.role;
  var status = b.status || 'active';
  if (!orgId || ['owner', 'admin', 'member', 'viewer'].indexOf(role) < 0) throw A.httpError(400, 'orgId and a valid role are required');

  return A.authenticate(req).then(function (caller) {
    var auth = A.init().auth();
    var target = b.targetUid ? auth.getUser(b.targetUid) : auth.getUserByEmail(String(b.targetEmail || '').toLowerCase());
    return target.then(function (user) {
      var targetOrg = A.orgOf(user.email);
      if (!caller.staff && targetOrg !== orgId) throw A.httpError(400, 'target is not in ' + orgId);
      var membersRef = A.db().collection('omega_orgs').doc(orgId).collection('members');
      return Promise.all([
        caller.staff ? Promise.resolve({ role: 'staff' }) : membersRef.doc(caller.uid).get().then(function (s) { return s.exists ? s.data() : { role: 'member' }; }),
        membersRef.doc(user.uid).get().then(function (s) { return s.exists ? s.data() : null; })
      ]).then(function (r) {
        var callerRole = r[0].role, current = r[1];
        var allowed = caller.staff
          || callerRole === 'owner'
          || (callerRole === 'admin' && role !== 'owner' && !(current && current.role === 'owner'));
        if (!allowed) throw A.httpError(403, 'not permitted to assign ' + role + ' here');

        var doc = { email: String(user.email).toLowerCase(), name: user.displayName || (current && current.name) || '',
          role: role, status: status, updatedAt: A.FieldValue().serverTimestamp(), updatedBy: caller.email };
        if (!current) doc.createdAt = A.FieldValue().serverTimestamp();
        return Promise.all([
          membersRef.doc(user.uid).set(doc, { merge: true }),
          auth.setCustomUserClaims(user.uid, Object.assign({}, user.customClaims || {}, { orgId: orgId, role: status === 'disabled' ? 'disabled' : role }))
        ]).then(function () { return { ok: true, uid: user.uid, orgId: orgId, role: role, status: status }; });
      });
    });
  });
});
