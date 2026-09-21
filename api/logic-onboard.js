/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access');
var MODULES = ['bess', 'compute', 'ev', 'solar'];
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var caller = await A.authenticate(req);
  X.requireOwner(caller);
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {}, org = A.safeOrg(b.org), db = A.db();
  if (!org) throw A.httpError(400, 'Valid tenant domain required');
  var ctx = await X.context(org), root = db.doc('omega_orgs/' + org);
  if (b.action === 'customer-editor-price') {
    var amount = Number(b.monthlyPriceCents);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 10000000) throw A.httpError(400, 'Monthly price must be whole cents between $1 and $100,000');
    return db.runTransaction(async function(tx) {
      var ref = root.collection('billing').doc('current'), old = await tx.get(ref);
      var offer = { monthlyPriceCents: amount, currency: 'USD', interval: 'month' };
      tx.set(ref, { customerEditorLite: offer }, { merge: true });
      tx.create(db.collection('omega_audit').doc(), { action: 'customer-editor-price', orgId: org, by: caller.email,
        at: new Date().toISOString(), was: old.exists ? old.data().customerEditorLite || null : null, offer: offer });
      return { ok: true, note: 'Customer Editor Lite offer updated. Existing subscriptions and OEM bundle pricing are unchanged.' };
    });
  }
  if (b.action === 'bundle') {
    if (typeof b.enabled !== 'boolean' || !Array.isArray(b.modules) ||
        b.modules.some(function (m) { return MODULES.indexOf(m) < 0; })) throw A.httpError(400, 'Choose valid Editor Lite modules');
    var mods = MODULES.filter(function (m) { return b.modules.indexOf(m) >= 0; });
    return db.runTransaction(async function (tx) {
      var billRef = root.collection('billing').doc('current'), confRef = root.collection('fulfillment').doc('config');
      var rows = await Promise.all([tx.get(billRef), tx.get(confRef), tx.get(root)]);
      var before = rows[0].exists ? rows[0].data() : {}, account = rows[2].data();
      var addons = (before.addons || []).filter(function (a) { return a !== 'omega-logic'; });
      if (b.enabled) { addons.push('omega-logic'); if (addons.indexOf('whitelabel') < 0) addons.push('whitelabel'); }
      var patch = { addons: addons, omegaLogic: b.enabled, editorLite: { enabled: b.enabled, modules: mods },
        updatedBy: caller.email, updatedAt: A.FieldValue().serverTimestamp() };
      if (b.enabled) { patch.bundle = 'omega-logic'; patch.bundleIncludes = ['platform-lite', 'white-label-sitemap-resale']; }
      else if (before.bundle === 'omega-logic') { patch.bundle = null; patch.bundleIncludes = []; }
      tx.set(billRef, patch, { merge: true });
      tx.set(root, { omegaLogic: b.enabled, whiteLabel: Object.assign({}, account.whiteLabel || {}, b.enabled ? { enabled: true } : {}) }, { merge: true });
      if (!rows[1].exists) tx.create(confRef, { enabled: false, terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 }, payoutMode: 'wire' });
      tx.create(billRef.collection('history').doc(), { at: A.FieldValue().serverTimestamp(), by: caller.email,
        action: 'omega-logic-enrollment', changed: patch, was: { addons: before.addons || [], editorLite: before.editorLite || null } });
      return { ok: true, enabled: b.enabled, modules: mods, note: 'No subscription charge or payment automation was activated.' };
    });
  }
  if (b.action === 'administrator') {
    if (!X.subscribed(ctx)) throw A.httpError(409, 'Activate the tenant and enroll the Omega Logic bundle first');
    var email = String(b.email || '').trim().toLowerCase(), name = String(b.name || '').trim().slice(0, 120);
    if (!/^[^@\s/]+@[^@\s/]+$/.test(email) || email.split('@')[1] !== org || !name) throw A.httpError(400, 'Administrator name and an email in this tenant domain are required');
    var support = b.supportAccount === true;
    if (support && email !== 'admin@' + org) throw A.httpError(400, 'Managed support accounts must use this tenant’s admin@ address');
    // Auth and Firestore cannot share a transaction. Retrying recovers a created
    // Auth account without ever resetting its password or granting staff claims.
    var auth = A.init().auth(), user, created = false;
    try { user = await auth.getUserByEmail(email); }
    catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128) throw A.httpError(400, 'A temporary password of 8–128 characters is required for a new account');
      try { user = await auth.createUser({ email: email, displayName: name, password: b.password, emailVerified: support }); created = true; }
      catch (e2) { if (e2.code === 'auth/email-already-exists') user = await auth.getUserByEmail(email); else throw e2; }
    }
    if (user.disabled) throw A.httpError(409, 'This account is disabled; review it before enrollment');
    // An explicit owner attestation for a managed support mailbox, not an
    // email-prefix exemption. Self-signup and ordinary administrators remain
    // subject to email verification. Only Firebase Admin may set this trust.
    await db.runTransaction(async function (tx) {
      var ref = root.collection('members').doc(user.uid), old = await tx.get(ref);
      if (old.exists && old.data().status === 'disabled') throw A.httpError(409, 'Membership is disabled; review it before enrollment');
      tx.set(ref, { email: email, name: name, role: old.exists && old.data().role === 'owner' ? 'owner' : 'admin', status: 'active',
        updatedBy: caller.email, updatedAt: A.FieldValue().serverTimestamp() }, { merge: true });
      tx.create(db.collection('omega_audit').doc(), { at: A.FieldValue().serverTimestamp(), by: caller.email,
        action: 'omega-logic-administrator', orgId: org, targetUid: user.uid, targetEmail: email, createdAuth: created, trustedSupportAccount: support });
    });
    // Do not attest an existing disabled membership as a side effect of a
    // rejected enrollment. A failed Auth update is safe to retry explicitly.
    if (support && !user.emailVerified) user = await auth.updateUser(user.uid, { emailVerified: true });
    return { ok: true, email: email, created: created, emailVerified: user.emailVerified === true,
      note: (support ? 'ClearSky-managed support sign-in is trusted; no verification email required. ' : 'Verify the mailbox before operational use. ') + 'Replace the temporary password. Existing passwords are never changed.' };
  }
  throw A.httpError(400, 'Unknown onboarding action');
});
