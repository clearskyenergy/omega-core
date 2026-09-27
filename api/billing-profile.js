/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), BP = require('./_lib/billing-profile'), S = require('./_lib/package-billing'), Q = require('./_lib/qbo-billing');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  var caller = await A.authenticate(req), input = req.method === 'GET' ? req.query || {} : req.body || {};
  var orgId = A.safeOrg(input.orgId || caller.orgId);
  if (!orgId || (!caller.staff && (!caller.claims || caller.claims.email_verified !== true || !(await A.isTenantAdmin(caller, orgId))))) throw A.httpError(403, 'Tenant administrator required');
  var db = A.db(), ref = db.doc('omega_orgs/' + orgId + '/billing/profile');
  if (req.method === 'GET') {
    var snap = await ref.get();
    return { orgId: orgId, profile: snap.exists && snap.data().legalName ? BP.stored(snap.data()) : null,
      certificate: caller.staff && snap.exists ? snap.data().certificate || null : null, canUploadCertificate: caller.staff };
  }
  if (input.certificatePath !== undefined) {
    if (!caller.staff) throw A.httpError(403, 'Only staff can attach an exemption certificate');
    if (Object.keys(input).some(function (k) { return ['orgId', 'certificatePath'].indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported certificate field');
    var filePath = input.certificatePath;
    if (typeof filePath !== 'string' || filePath.indexOf('billing-certificates/' + orgId + '/') !== 0 || !/^billing-certificates\/[^/]+\/[a-zA-Z0-9_.-]{1,180}$/.test(filePath)) throw A.httpError(400, 'Invalid certificate path');
    var certificateContext = await S.context(db, orgId); S.guard(certificateContext);
    var metadata = (await A.init().storage().bucket().file(filePath).getMetadata())[0];
    if (!Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) >= 8 * 1024 * 1024 || ['application/pdf', 'image/png', 'image/jpeg'].indexOf(metadata.contentType) < 0) throw A.httpError(400, 'Certificate must be a PDF, PNG or JPEG under 8 MB');
    var certificate = { path: filePath, contentType: metadata.contentType, size: Number(metadata.size), attachedAt: Date.now(), by: caller.email };
    await db.runTransaction(async function (tx) {
      var old = await tx.get(ref), currentBill = await tx.get(certificateContext.root.collection('billing').doc('current'));
      if (!old.exists || !old.data().legalName) throw A.httpError(409, 'Save the billing contact first');
      if (old.data().syncLock && old.data().syncLock.until > Date.now() || currentBill.exists && currentBill.data().activationLock && currentBill.data().activationLock.until > Date.now()) throw A.httpError(409, 'Billing update is running; retry shortly');
      tx.update(ref, { certificate: certificate });
      tx.set(certificateContext.root.collection('admin_audit').doc(), { at: certificate.attachedAt, by: caller.email, action: 'billing-certificate-attached' });
    });
    return { ok: true, certificate: certificate };
  }
  if (Object.keys(input).some(function (k) { return ['orgId', 'profile'].indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported profile field');
  var profile = BP.normalize(input.profile), c = await S.context(db, orgId); S.guard(c);
  var now = Date.now(), id = Q.key(JSON.stringify(profile) + ':' + now), current = c.root.collection('billing').doc('current');
  await db.runTransaction(async function (tx) {
    var s = await tx.get(ref), bill = await tx.get(current), old = s.exists ? s.data() : {};
    if (bill.exists && bill.data().activationLock && bill.data().activationLock.until > now) throw A.httpError(409, 'Package activation is running; retry shortly');
    if (old.syncLock && old.syncLock.until > now) throw A.httpError(409, 'Billing profile update is already running');
    tx.set(ref, { syncLock: { id: id, until: now + 120000 } }, { merge: true });
  });
  try {
    if (c.billing.qboCustomerId) await Q.driver(c.book).customer(orgId, profile, c.billing.qboCustomerId);
    await db.runTransaction(async function (tx) {
      var s = await tx.get(ref), b = await tx.get(current), old = s.data();
      if (!old.syncLock || old.syncLock.id !== id) throw A.httpError(409, 'Billing profile update changed; retry');
      if ((b.exists && b.data().qboCustomerId || null) !== (c.billing.qboCustomerId || null)) throw A.httpError(409, 'Approval changed the billing customer; retry the profile update');
      tx.set(ref, Object.assign({}, profile, { updatedAt: now, updatedBy: caller.email, syncLock: null }, old.certificate ? { certificate: old.certificate } : {}));
      tx.set(c.root.collection('admin_audit').doc(id), { at: now, by: caller.email, action: 'billing-profile-updated', fields: Object.keys(profile) });
    });
    return { ok: true, profile: profile };
  } catch (e) {
    await db.runTransaction(async function (tx) { var s = await tx.get(ref); if (s.exists && s.data().syncLock && s.data().syncLock.id === id) tx.update(ref, { syncLock: null }); });
    throw e;
  }
});
