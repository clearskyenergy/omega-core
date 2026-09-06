/* POST /api/stripe-portal — tenant admin opens the Stripe Customer Portal
   (add card, turn on autopay, download invoices). Returns { url }.
   Stripe hosts the whole UI; we never touch card data. */
'use strict';
var A = require('./_lib/admin');
module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    var orgId = (req.body && req.body.orgId) || caller.orgId;
    return A.isTenantAdmin(caller, orgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'tenant admin only');
      return A.billingOf(orgId).then(function (bill) {
        if (!bill.stripeCustomerId) throw A.httpError(409, 'no Stripe customer on this account yet — ask ClearSky to set up billing');
        var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        return stripe.billingPortal.sessions.create({ customer: bill.stripeCustomerId,
          return_url: process.env.STRIPE_PORTAL_RETURN_URL || ('https://' + (req.headers.host || 'clearskyomega.com') + '/account-settings.html') })
          .then(function (s) { return { url: s.url }; });
      });
    });
  });
});
