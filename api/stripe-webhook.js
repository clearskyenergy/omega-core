/* POST /api/stripe-webhook — Stripe → billing/current
   invoice.paid            → lastPaidAt, subscriptionDue, status active
   invoice.payment_failed  → paymentFailedAt (status flips to 'suspended'
                             only after GRACE_DAYS; a cron or the master
                             console enforces the flip — never on first miss)
   customer.subscription.* → tier from price metadata `tier`, subscriptionDue
   Vercel must NOT parse the body (we need the raw bytes for the signature). */
'use strict';
var A = require('./_lib/admin');

function rawBody(req) { return new Promise(function (res, rej) { var c = []; req.on('data', function (d) { c.push(d); }); req.on('end', function () { res(Buffer.concat(c)); }); req.on('error', rej); }); }

module.exports = function (req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return rawBody(req).then(function (buf) {
    var evt;
    try { evt = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
    catch (e) { return res.status(400).send('bad signature'); }
    var obj = evt.data.object, FV = A.FieldValue(), db = A.db();
    var orgId = (obj.metadata && obj.metadata.orgId) || null;
    var byCustomer = orgId ? Promise.resolve(orgId)
      : db.collectionGroup('billing').where('stripeCustomerId', '==', obj.customer).limit(1).get().then(function (q) { return q.empty ? null : q.docs[0].ref.parent.parent.id; });
    return byCustomer.then(function (org) {
      if (!org) return res.status(200).json({ ignored: 'no org for ' + obj.customer });
      var ref = db.collection('omega_orgs').doc(org).collection('billing').doc('current');
      var patch = { updatedAt: FV.serverTimestamp(), lastStripeEvent: evt.type };
      if (evt.type === 'invoice.paid') {
        patch.lastPaidAt = new Date(evt.created * 1000).toISOString(); patch.amountDue = 0; patch.paymentFailedAt = null;
        if (obj.lines && obj.lines.data[0] && obj.lines.data[0].period) patch.subscriptionDue = new Date(obj.lines.data[0].period.end * 1000).toISOString();
        return Promise.all([ref.set(patch, { merge: true }), db.collection('omega_orgs').doc(org).set({ status: 'active' }, { merge: true })]);
      }
      if (evt.type === 'invoice.payment_failed') {
        patch.paymentFailedAt = new Date(evt.created * 1000).toISOString(); patch.amountDue = (obj.amount_due || 0) / 100;
        return ref.set(patch, { merge: true });
      }
      if (/^customer\.subscription\./.test(evt.type)) {
        var price = obj.items && obj.items.data[0] && obj.items.data[0].price;
        if (price && price.metadata && price.metadata.tier) patch.tier = price.metadata.tier;
        patch.subscriptionDue = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null;
        patch.stripeSubscriptionId = obj.id; patch.autopay = obj.collection_method === 'charge_automatically';
        if (evt.type === 'customer.subscription.deleted') patch.tier = 'trial';
        return ref.set(patch, { merge: true });
      }
      return null;
    }).then(function () { res.status(200).json({ received: true }); });
  }).catch(function (e) { console.error('[stripe-webhook]', e); res.status(500).end(); });
};

/* Must come AFTER the handler assignment above: `module.exports = fn`
   replaces the whole exports object, so setting .config before it was
   silently discarded and Vercel parsed the body — which breaks the
   raw-bytes signature check this endpoint depends on. */
module.exports.config = { api: { bodyParser: false } };
