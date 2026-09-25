/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/set-role   —  assign an in-org role and mint custom claims
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { orgId, targetUid | targetEmail, role: 'owner'|'admin'|'member'|'viewer', status?: 'active'|'disabled' }

   Who may call:
     · ClearSky staff — any org, any role
     · the org OWNER   — any role in their own org (including transferring 'owner')
     · an org ADMIN    — 'admin' | 'member' | 'viewer' in their own org, never on the owner
     An owner or admin whose own record is disabled may not.

   The write is the ONE member writer (api/_lib/logic-members.js change()),
   the same one the Team page and ClearSky's Omega Logic console use: the
   last active owner is never disabled or re-roled, and every change lands in
   omega_orgs/{orgId}/admin_audit (via 'set-role') with who, was and now. It
   sets the custom claims { orgId, role } on the tenant's own people, so
   Storage rules and other /api functions can trust request.auth.token.role
   without a Firestore read. The user must sign out/in (or force-refresh
   their token) to pick claims up; the members doc is what the portal reads
   immediately.

   `status` is optional: a role change keeps the person's status as it is
   (changing somebody's role never quietly re-enables them).
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), Members = require('./_lib/logic-members');

var ROLES = ['owner', 'admin', 'member', 'viewer'];

module.exports = A.handler(async function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var orgId = String(b.orgId || '').toLowerCase();
  var role = b.role;
  var status = b.status === undefined || b.status === null || b.status === '' ? null : String(b.status);
  if (!orgId || ROLES.indexOf(role) < 0) throw A.httpError(400, 'orgId and a valid role are required');
  if (status !== null && ['active', 'disabled'].indexOf(status) < 0) throw A.httpError(400, 'status must be active or disabled');

  var caller = await A.authenticate(req), auth = A.init().auth();
  var user = b.targetUid ? await auth.getUser(String(b.targetUid)) : await auth.getUserByEmail(String(b.targetEmail || '').trim().toLowerCase());
  var email = String(user.email || '').toLowerCase();
  if (!email) throw A.httpError(400, 'That account has no email address');
  if (!caller.staff && A.orgOf(email) !== orgId) throw A.httpError(400, 'target is not in ' + orgId);

  var actor = 'clearsky';
  if (!caller.staff) {
    var mine = await A.db().collection('omega_orgs').doc(orgId).collection('members').doc(caller.uid).get(), me = mine.exists ? mine.data() : {};
    actor = (me.status || 'active') === 'disabled' ? null : (me.role === 'owner' || me.role === 'admin' ? me.role : null);
    if (!actor) throw A.httpError(403, 'not permitted to assign ' + role + ' here');
  }
  var org = await A.db().collection('omega_orgs').doc(orgId).get(), name = (org.exists && org.data().name) || orgId;
  var out = await Members.change({ orgId: orgId, orgName: name, host: Members.HUB_HOST, path: '/logic', by: caller.email, actor: actor, via: 'set-role',
    request: { email: email, role: role, status: status, resetLink: false, name: '', sendMail: false }, reveal: false, mailNew: false, audit: true });
  return { ok: true, uid: out.uid, orgId: orgId, role: out.role, status: out.status };
});
