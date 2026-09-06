/* POST /api/stripe-invoices — invoice history for one tenant.
   Body: { orgId?, limit? }   (orgId defaults to the caller's own org)

   THE HISTORY ON billing/current/history IS NOT THIS. That records what
   ClearSky CHANGED — tier moves, amounts set — and is written by
   /api/tenant-billing. This is what Stripe actually billed and what actually
   got paid. Showing the first and calling it the second is how a customer ends
   up arguing about an invoice that was never issued.

   RETURNS connected:false RATHER THAN AN ERROR when the tenant has no Stripe
   customer. That is the normal state for an account nobody has set up billing
   for yet, and a red failure on a customer's own account page for the
   non-event of "we have not invoiced you" is noise. */
'use strict';
var A = require('./_lib/admin');

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var limit = Math.min(Math.max(parseInt(b.limit, 10) || 12, 1), 50);

  return A.authenticate(req).then(function (caller) {
    var orgId = String(b.orgId || caller.orgId || '').toLowerCase();
    if (!orgId) throw A.httpError(400, 'orgId required');
    /* A tenant reads their own invoices; staff read anyone's. Without this a
       signed-in user could pass another org's id and read their billing. */
    if (!caller.staff && orgId !== String(caller.orgId || '').toLowerCase()) {
      throw A.httpError(403, 'not your organisation');
    }

    return A.db().collection('omega_orgs').doc(orgId)
      .collection('billing').doc('current').get()
      .then(function (snap) {
        var bill = snap.exists ? snap.data() : {};
        var cust = bill.stripeCustomerId;
        if (!cust) return { connected: false, orgId: orgId, invoices: [],
                            note: 'No Stripe customer for this organisation yet.' };

        if (!process.env.STRIPE_SECRET_KEY) {
          /* Distinguished from "no customer" on purpose: one is a tenant that
             has not been set up, the other is a deployment missing its key.
             Collapsing them sends somebody hunting through Stripe for a
             customer that was never the problem. */
          throw A.httpError(500, 'STRIPE_SECRET_KEY is not set on this deployment');
        }
        var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        return stripe.invoices.list({ customer: cust, limit: limit }).then(function (res) {
          var rows = (res.data || []).map(function (inv) {
            return {
              id: inv.id,
              number: inv.number || null,
              status: inv.status,                       /* draft|open|paid|void|uncollectible */
              created: inv.created ? inv.created * 1000 : null,
              periodEnd: inv.period_end ? inv.period_end * 1000 : null,
              currency: inv.currency,
              /* Stripe is in minor units. Dividing here rather than in three
                 different clients is the difference between one rounding rule
                 and three. */
              amountDue: typeof inv.amount_due === 'number' ? inv.amount_due / 100 : null,
              amountPaid: typeof inv.amount_paid === 'number' ? inv.amount_paid / 100 : null,
              hostedUrl: inv.hosted_invoice_url || null,
              pdfUrl: inv.invoice_pdf || null
            };
          });
          return { connected: true, orgId: orgId, customer: cust, invoices: rows };
        });
      });
  });
});
