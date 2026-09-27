/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * THE EMAIL LINK AND A WORKSPACE'S PLAN (2026-09-27, Tommy: "this verified
 * email thing makes no sense and i shouldnt have to do it").
 *
 * A workspace's owner and administrators hold a role only the server gives:
 * signup makes the owner, the Team page (api/_lib/logic-members.js) and
 * ClearSky make administrators, and firestore.rules let a browser make
 * itself a MEMBER of its email domain's workspace, never more. So an owner or
 * administrator manages their OWN workspace's plan and billing (Add to plan,
 * the priced menu, the billing profile, a proposal's acceptance) without
 * having clicked the link in their email: the role, not the address, is what
 * those doors check.
 *
 * Everything else keeps asking for the link: creating a workspace (it claims
 * a company's domain), a member's reading, the packaged tools and Omega
 * Logic (api/_lib/package-access.js, api/_lib/logic-access.js and
 * tenantReader() in firestore.rules), a buyer's portal, and ClearSky staff
 * (api/_lib/admin.js authenticate()). ONE rule, pure: the endpoints pass their
 * own isTenantAdmin, so the role is read the one way it is read everywhere.
 * scripts/tests/troles.js holds it.
 */
'use strict';
function verified(caller) { return !!caller && (caller.staff === true || caller.emailVerified === true || !!(caller.claims && caller.claims.email_verified === true)); }
/* may this caller act in orgId's plan and billing? a verified address, or an
   owner or administrator of orgId by the endpoint's own isTenantAdmin */
function settled(caller, orgId, isTenantAdmin) {
  if (verified(caller)) return Promise.resolve(true);
  if (!caller || !orgId || caller.orgId !== orgId || typeof isTenantAdmin !== 'function') return Promise.resolve(false);
  return Promise.resolve(isTenantAdmin(caller, orgId)).then(function (ok) { return ok === true; });
}
module.exports = { verified: verified, settled: settled };
