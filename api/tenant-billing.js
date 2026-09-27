/* POST /api/tenant-billing — ClearSky staff only. Sets the commercial terms on
   omega_orgs/{orgId}/billing/current.
   Body: { orgId, tier?, addons?, toolOverrides?, paymentLink?, amountDue?,
           subscriptionDue?, trialEndsAt?, autopay?, paymentProvider?,
           customerEditorLite?: { monthlyPriceCents?, yearlyPriceCents? } }

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
               'stripeCustomerId', 'toolAccess', 'status', 'customerEditorLite'];
var STATUSES = ['active', 'past_due', 'suspended', 'cancelled'];
var TIERS = ['trial', 'standard', 'deluxe', 'enterprise', 'partner', 'internal'];

/* customerEditorLite: what THIS tenant's customers pay for Editor Lite, the
   one thing they buy from the platform (api/customer-subscribe.js charges
   exactly these, on ClearSky's Stripe). Only the two prices cross in, whole
   cents; a key left out keeps its value and null withdraws that plan. The
   rest of the block (currency, and the interval api/logic-onboard.js writes
   for the monthly-only console) is kept as it is. Changing a price never
   reprices a subscription that already exists — Stripe holds that price. */
var LITE_PRICES = { monthlyPriceCents: 10000000, yearlyPriceCents: 100000000 };
function litePrices(given) {
  if (!given || typeof given !== 'object' || Array.isArray(given)) throw A.httpError(400, 'customerEditorLite must be { monthlyPriceCents, yearlyPriceCents }');
  var out = {};
  Object.keys(LITE_PRICES).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(given, k) || given[k] === undefined) return;
    var v = given[k];
    if (v !== null && (!Number.isSafeInteger(v) || v < 100 || v > LITE_PRICES[k])) {
      throw A.httpError(400, k + ' must be whole cents between $1 and $' + (LITE_PRICES[k] / 100).toLocaleString('en-US') + ', or null');
    }
    out[k] = v;
  });
  if (!Object.keys(out).length) throw A.httpError(400, 'customerEditorLite: give monthlyPriceCents and/or yearlyPriceCents');
  return out;
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var orgId = A.safeOrg(b.orgId);
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
    /* toolAccess: absent ≠ empty. null means "whatever the plan includes"; a
       present array is authoritative at any length (CLAUDE.md, White label). */
    if (patch.toolAccess !== undefined && patch.toolAccess !== null) {
      if (!Array.isArray(patch.toolAccess) || !patch.toolAccess.every(function (t) { return typeof t === 'string' && /^[a-z0-9-]{1,40}$/.test(t); })) {
        throw A.httpError(400, 'toolAccess must be null or a list of tool ids');
      }
    }
    if (patch.addons !== undefined && (!Array.isArray(patch.addons) || !patch.addons.every(function (t) { return typeof t === 'string'; }))) {
      throw A.httpError(400, 'addons must be a list');
    }
    if (patch.status !== undefined && STATUSES.indexOf(String(patch.status)) < 0) {
      throw A.httpError(400, 'status must be one of ' + STATUSES.join(', '));
    }
    /* A payment link is put in front of a customer. Anything that is not an
       https URL either breaks the button or points somewhere it should not. */
    if (patch.paymentLink && !/^https:\/\/[^\s]+$/.test(String(patch.paymentLink))) {
      throw A.httpError(400, 'paymentLink must be an https URL');
    }
    var lite = patch.customerEditorLite !== undefined ? litePrices(patch.customerEditorLite) : null;

    var db = A.db(), FV = A.FieldValue();
    var ref = db.collection('omega_orgs').doc(orgId).collection('billing').doc('current');

    return ref.get().then(function (snap) {
      var before = snap.exists ? snap.data() : {};
      if (before.packaged === true && Object.keys(patch).some(function (key) { return key !== 'customerEditorLite'; })) {
        throw A.httpError(409, 'Packaged billing is payment-controlled; use the reviewed Package panel');
      }
      /* The whole block is written back, merged here, so the history row's
         before/after is the block and a price left out is not wiped. */
      if (lite) patch.customerEditorLite = Object.assign({}, before.customerEditorLite || {}, lite, { currency: 'USD' });
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
