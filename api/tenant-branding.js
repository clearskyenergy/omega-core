/* POST /api/tenant-branding — tenant admin saves branding; server mirrors it
   to tenant_public/{host} for every registered hostname so the sign-in
   page can paint before auth. Body: { orgId, name?, logoUrl?, colors?, exportBrand?, defaultLayout? } */
'use strict';
var A = require('./_lib/admin');
var ALLOWED = ['name', 'logoUrl', 'colors', 'exportBrand', 'defaultLayout'];
module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {}; var orgId = String(b.orgId || '').toLowerCase();
  return A.authenticate(req).then(function (caller) {
    return A.isTenantAdmin(caller, orgId || caller.orgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'tenant admin only');
      var db = A.db(), FV = A.FieldValue(); var ref = db.collection('omega_orgs').doc(orgId);
      var patch = { updatedAt: FV.serverTimestamp() };
      ALLOWED.forEach(function (k) { if (b[k] !== undefined) patch[k] = b[k]; });
      return ref.set(patch, { merge: true }).then(function () { return ref.get(); }).then(function (s) {
        var org = s.data() || {}; var hosts = org.domains || [];
        var pub = { orgId: orgId, name: org.name || orgId, logoUrl: org.logoUrl || '', colors: org.colors || null, exportBrand: org.exportBrand || null,
          tier: (org.publicTier || 'standard'), vertical: org.vertical || null, shell: org.shell || 'default', domains: hosts, updatedAt: FV.serverTimestamp() };
        var batch = db.batch(); hosts.forEach(function (h) { batch.set(db.collection('tenant_public').doc(String(h).toLowerCase()), pub, { merge: true }); });
        return batch.commit().then(function () { return { ok: true, mirrored: hosts }; });
      });
    });
  });
});
