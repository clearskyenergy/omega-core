/* POST /api/stripe-create — ClearSky staff only. Creates/links a Stripe
   Customer for a tenant and (optionally) a subscription or payment link.
   Body: { orgId, email, tier, priceId?, mode: 'subscription'|'payment_link' }
   Writes stripeCustomerId / paymentLink / tier onto billing/current.
   © 2025–2026 ClearSky Energy Solutions LLC. */
'use strict';
var A = require('./_lib/admin');
module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'staff only');
    if (!b.orgId) throw A.httpError(400, 'orgId required');
    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    var db = A.db(), FV = A.FieldValue();
    var billRef = db.collection('omega_orgs').doc(b.orgId).collection('billing').doc('current');
    return billRef.get().then(function (s) {
      var cur = s.exists ? s.data() : {};
      var cust = cur.stripeCustomerId ? stripe.customers.retrieve(cur.stripeCustomerId)
        : stripe.customers.create({ email: b.email, name: b.orgId, metadata: { orgId: b.orgId } });
      return cust.then(function (c) {
        var patch = { stripeCustomerId: c.id, paymentProvider: 'stripe', updatedAt: FV.serverTimestamp() };
        if (b.tier) patch.tier = b.tier;
        var next;
        if (b.mode === 'subscription' && b.priceId) {
          next = stripe.subscriptions.create({ customer: c.id, items: [{ price: b.priceId }], payment_behavior: 'default_incomplete', metadata: { orgId: b.orgId } })
            .then(function (sub) { patch.stripeSubscriptionId = sub.id; patch.subscriptionDue = new Date(sub.current_period_end * 1000).toISOString(); });
        } else if (b.mode === 'payment_link' && b.priceId) {
          next = stripe.paymentLinks.create({ line_items: [{ price: b.priceId, quantity: 1 }], metadata: { orgId: b.orgId } })
            .then(function (pl) { patch.paymentLink = pl.url; });
        } else next = Promise.resolve();
        return next.then(function () { return billRef.set(patch, { merge: true }); }).then(function () { return { ok: true, stripeCustomerId: c.id, billing: patch }; });
      });
    });
  });
});
