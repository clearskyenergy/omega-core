/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/tenant-branding
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A tenant admin saves branding; the server mirrors it to tenant_public/{host}
   for every registered hostname so the sign-in page can paint before auth.

   Body: { orgId, name?, logoUrl?, colors?, exportBrand?, defaultLayout?,
           whiteLabel? }

   ── TWO CLASSES OF FIELD, AND WHY THEY ARE NOT THE SAME ──────────────────
   name/logoUrl/colors/exportBrand are the TENANT's identity. A tenant admin
   owns those outright; it is their company and their logo.

   whiteLabel is OURS. It decides what the platform is called and whether our
   name appears on it at all — which is a line item on a contract, not a
   preference. A tenant admin who could write it could set
   attribution:'none' from the account-settings form and take our name off a
   product they never bought that right to. So whiteLabel is STAFF-ONLY here,
   and the rules refuse it from a browser besides (see the omega_orgs block:
   tenant admins write the branding fields, ClearSky writes the rest).

   ── WHAT GOES WORLD-READABLE ─────────────────────────────────────────────
   tenant_public is `allow read: if true`. _lib/whitelabel.js holds the
   allowlist of whiteLabel keys that may cross into it — the presentation ones, which are
   visible in the rendered page anyway. Anything else (fulfilment routing,
   margins, internal contacts) stays on omega_orgs, where a cross-org read is
   already refused, and reaches the product through the signed-in path in
   omega-tenant.js mergeEntitlements().

   Copying the block wholesale would be the easy version and it is exactly
   how a commercial term ends up in a document served to anyone who asks.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
/* WL_PUBLIC lives in ONE place — three writers mirror this block and CLAUDE.md
   already records what three copies of one decision cost with orgAlias(). */
var publicRecord = require('./_lib/whitelabel').publicRecord;

var ALLOWED = ['name', 'logoUrl', 'colors', 'exportBrand', 'defaultLayout'];
var STAFF_ONLY = ['whiteLabel'];

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var orgId = String(b.orgId || '').toLowerCase();
  return A.authenticate(req).then(function (caller) {
    return A.isTenantAdmin(caller, orgId || caller.orgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'tenant admin only');

      /* Named in the refusal rather than silently dropped: a console that
         posts whiteLabel and gets a 200 will show the operator a saved
         setting that was never stored. */
      STAFF_ONLY.forEach(function (k) {
        if (b[k] !== undefined && !caller.staff) {
          throw A.httpError(403, k + ' is set by ClearSky, not by the tenant');
        }
      });

      var db = A.db(), FV = A.FieldValue();
      var ref = db.collection('omega_orgs').doc(orgId);
      var patch = { updatedAt: FV.serverTimestamp() };
      ALLOWED.forEach(function (k) { if (b[k] !== undefined) patch[k] = b[k]; });
      STAFF_ONLY.forEach(function (k) { if (b[k] !== undefined) patch[k] = b[k]; });

      return ref.set(patch, { merge: true }).then(function () { return ref.get(); }).then(function (s) {
        var org = s.data() || {};
        var hosts = org.domains || [];
        var pub = publicRecord(orgId, org, FV.serverTimestamp());
        delete pub.status; /* status is tenant-approve's to mirror, not a branding save's */
        var batch = db.batch();
        hosts.forEach(function (h) {
          batch.set(db.collection('tenant_public').doc(String(h).toLowerCase()), pub, { merge: true });
        });
        return batch.commit().then(function () { return { ok: true, mirrored: hosts }; });
      });
    });
  });
});
