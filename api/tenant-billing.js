/* POST /api/tenant-billing — ClearSky staff only. Sets the commercial terms on
   omega_orgs/{orgId}/billing/current.
   Body: { orgId, tier?, addons?, toolOverrides?, paymentLink?, amountDue?,
           subscriptionDue?, trialEndsAt?, autopay?, paymentProvider? }

   WHY THIS IS AN ENDPOINT AND NOT A CLIENT WRITE. The rules already allow
   isAdmin() to write billing/current directly, so a console could just call
   set(). It goes through here anyway for two reasons: the fields are
   allow-listed, so a future console bug cannot invent a field the tool gating
   silently reads; and every change is appended to a history subcollection,
   which is the only record of what somebody was charged and when. Billing you
   can edit without a trace is not billing anyone can defend in a dispute. */
'use strict';
var A = require('./_lib/admin');

/* Anything not here is dropped rather than refused — a console sending one
   unknown key should not fail a legitimate tier change. */
var ALLOWED = ['tier', 'addons', 'toolOverrides', 'paymentLink', 'amountDue',
               'subscriptionDue', 'trialEndsAt', 'autopay', 'paymentProvider',
               'stripeCustomerId'];
var TIERS = ['trial', 'standard', 'deluxe', 'enterprise', 'partner', 'internal'];

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var orgId = String(b.orgId || '').toLowerCase();
  if (!orgId) throw A.httpError(400, 'orgId required');

  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    var patch = {}, i, k;
    for (i = 0; i < ALLOWED.length; i++) {
      k = ALLOWED[i];
      if (Object.prototype.hasOwnProperty.call(b, k)) patch[k] = b[k];
    }
    if (!Object.keys(patch).length) throw A.httpError(400, 'nothing to change');

    /* A tier outside the list would pass the tool gate's >= comparison in a
       way nobody intends — tierLevel() maps unknown strings to a default, so
       a typo silently grants or removes every tool. */
    if (patch.tier && TIERS.indexOf(String(patch.tier)) < 0) {
      throw A.httpError(400, 'tier must be one of ' + TIERS.join(', '));
    }
    if (patch.amountDue != null && typeof patch.amountDue !== 'number') {
      throw A.httpError(400, 'amountDue must be a number');
    }
    /* A payment link is put in front of a customer. Anything that is not an
       https URL either breaks the button or points somewhere it should not. */
    if (patch.paymentLink && !/^https:\/\/[^\s]+$/.test(String(patch.paymentLink))) {
      throw A.httpError(400, 'paymentLink must be an https URL');
    }

    var db = A.db(), FV = A.FieldValue();
    var ref = db.collection('omega_orgs').doc(orgId).collection('billing').doc('current');

    return ref.get().then(function (snap) {
      var before = snap.exists ? snap.data() : {};
      patch.updatedAt = FV.serverTimestamp();
      patch.updatedBy = caller.email;
      return ref.set(patch, { merge: true }).then(function () {
        /* The audit row records the BEFORE values of the keys that moved, so
           the history reads as a diff rather than as a stack of snapshots. */
        var was = {};
        Object.keys(patch).forEach(function (key) {
          if (key === 'updatedAt' || key === 'updatedBy') return;
          was[key] = before[key] === undefined ? null : before[key];
        });
        return db.collection('omega_orgs').doc(orgId)
          .collection('billing').doc('current').collection('history').add({
            at: FV.serverTimestamp(), by: caller.email, changed: patch, was: was
          });
      }).then(function () { return { ok: true, orgId: orgId, changed: Object.keys(patch) }; });
    });
  });
});
