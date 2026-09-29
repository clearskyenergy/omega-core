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
   non-event of "we have not invoiced you" is noise.

   EACH ROW SAYS WHO MADE IT (`omega`, from Stripe's own metadata): 'due' is
   the plan's amount due paid by card from Plan & billing
   (api/_lib/stripe-customer.js); an invoice the ENGINE made on the same
   customer (api/_lib/stripe-billing.js: an add-on bought by card, a package)
   names its kind — 'addon', 'subscription', 'change', 'pack' …; null is one
   made by hand in the dashboard (a tier ClearSky invoices there). The pages
   judge an engine-made invoice by its OWN record under
   billing/current/invoices, never by this list's status: a withdrawn add-on's
   invoice still open on Stripe (the purchase issues before it records; a
   void that has not landed) is not owed, is not listed twice, and never
   stands in for the plan's own amount due (Concord, 2026-09-28: a $500
   opt-in read as what was owed and the $1,299 plan vanished). */
'use strict';
var A = require('./_lib/admin');

function madeBy(inv) {
  var md = (inv && inv.metadata) || {};
  if (md.omegaDue) return 'due';
  if (md.omegaPackage === 'true' || md.omegaMarker) return String(md.omegaKind || 'package');
  return null;
}

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
    /* an email/password account can be opened on any address: invoices (with
       the billing contact, address and PDFs) need a VERIFIED one, or an owner
       or administrator of an active client (admin.clientAdmin, as on
       plan-change and the card door) */
    var verified = caller.staff || (caller.claims && caller.claims.email_verified === true);
    return (verified ? Promise.resolve(true) : A.clientAdmin(caller, orgId)).then(function (ok) {
    if (!ok) throw A.httpError(403, 'Verified email required');

    return A.db().collection('omega_orgs').doc(orgId)
      .collection('billing').doc('current').get()
      .then(function (snap) {
        var bill = snap.exists ? snap.data() : {};
        /* a PACKAGED workspace's invoices are the engine's (Plan & billing,
           GET /api/plan-change, owners and admins): never this legacy list */
        if (bill.packaged === true && !caller.staff) return { connected: false, orgId: orgId, invoices: [], note: 'Subscription invoices are listed in Plan & billing.' };
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
              pdfUrl: inv.invoice_pdf || null,
              /* who made it (madeBy, above): an engine-made one is its record's */
              omega: madeBy(inv)
            };
          });
          return { connected: true, orgId: orgId, customer: cust, invoices: rows };
        });
      });
    });
  });
});
module.exports.madeBy = madeBy;
