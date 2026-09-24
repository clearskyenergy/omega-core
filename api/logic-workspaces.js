/* ════════════════════════════════════════════════════════════════════════
   GET /api/logic-workspaces — which Omega Logic workspaces may the signed-in
   person open?
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Omega Logic is ClearSky's product and a tenant is a workspace in it (the
   way QuickBooks is the app and the company is what you sign into). So there
   is ONE front door — /office/app on a phone, /omega-logic on a computer —
   and no company in its address: a person signs in to Omega Logic, and this
   answers where they go.

   The candidates are exactly the ones the rest of Omega Logic would admit,
   and each is judged by the SAME check every office endpoint runs
   (logic-access.authorize): the workspace of their own email domain, and a
   cross-org grant (org_members) if they hold one. Nothing is listed that the
   next request would refuse. The ClearSky owner gets every Omega Logic
   workspace (the same list as the private directory) and picks.

   Names and roles only: no orders, no money, nothing a member of that
   workspace could not already see on its dashboard.
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access');

/* why a person has nowhere to go, in words they can act on */
var WHY = {
  verify: 'Confirm your email address first: we sent you a link. Then sign in again.',
  none: 'This email is not on an Omega Logic workspace yet. Ask your company’s Omega Logic administrator to add you, or sign in with your work account.'
};
function listed(d) { return d.logicDirectoryHidden !== true && !d.supersededBy && (d.omegaLogic === true || d.vertical === 'oem' || (d.whiteLabel || {}).enabled); }

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var caller = await A.authenticate(req), db = A.db(), email = String(caller.email || '').toLowerCase();
  if (!caller.claims || caller.claims.email_verified !== true) return { email: email, owner: false, workspaces: [], reason: 'verify', note: WHY.verify };

  if (X.owner(caller)) {
    var all = await db.collection('omega_orgs').orderBy('__name__').limit(300).get(), mine = [];
    all.forEach(function (s) { var d = s.data() || {}; if (listed(d)) mine.push({ orgId: s.id, name: d.name || s.id, role: 'clearsky', status: d.status || 'active' }); });
    return { email: email, owner: true, workspaces: mine, limited: all.size === 300 };
  }

  var candidates = [];
  if (caller.orgId) candidates.push(caller.orgId);
  var grant = await db.collection('org_members').doc(email).get();
  if (grant.exists && grant.data().active !== false && grant.data().orgId && candidates.indexOf(grant.data().orgId) < 0) candidates.push(grant.data().orgId);

  var out = [];
  for (var i = 0; i < candidates.length; i++) {
    var org = A.safeOrg(candidates[i]); if (!org) continue;
    try {
      var ctx = await X.authorize(caller, org, false);
      var m = await db.doc('omega_orgs/' + org + '/members/' + caller.uid).get();
      out.push({ orgId: org, name: ctx.org.name || org, role: (m.exists && m.data().role) || 'member', status: ctx.org.status || 'active' });
    } catch (e) { if (!e.status || e.status >= 500) throw e; /* not theirs: not listed */ }
  }
  return out.length ? { email: email, owner: false, workspaces: out } : { email: email, owner: false, workspaces: [], reason: 'none', note: WHY.none };
});
