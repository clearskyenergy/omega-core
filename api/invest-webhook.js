/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/invest-webhook — Stripe → cf_pledges (community investment)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A SECOND Stripe endpoint, separate from /api/stripe-webhook (tenant
   billing). Register it in Stripe as its own endpoint with its own signing
   secret so a billing event can never be mistaken for an investment and
   the two handlers can be reasoned about apart.

     checkout.session.completed              → pledge paid (when payment_status is paid)
     checkout.session.async_payment_succeeded→ pledge paid (bank debits settle later)
     checkout.session.async_payment_failed   → pledge cancelled
     checkout.session.expired                → pledge cancelled
     charge.refunded                         → pledge refunded (by payment intent)

   Only sessions carrying metadata.kind == 'cf_pledge' are handled; anything
   else is acknowledged and ignored. Every transition goes through
   _lib/invest-ledger.js, which is idempotent — Stripe retries.

   ENV: STRIPE_SECRET_KEY, STRIPE_INVEST_WEBHOOK_SECRET (falls back to
        STRIPE_WEBHOOK_SECRET if the same endpoint secret is reused).
   Vercel must NOT parse the body: the signature is over the raw bytes.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var L = require('./_lib/invest-ledger');

function rawBody(req) { return new Promise(function (res, rej) { var c = []; req.on('data', function (d) { c.push(d); }); req.on('end', function () { res(Buffer.concat(c)); }); req.on('error', rej); }); }

function pledgeIdOf(obj) {
  var m = obj && obj.metadata;
  return m && m.kind === 'cf_pledge' && m.pledgeId ? String(m.pledgeId) : null;
}

module.exports = function (req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  var secret = process.env.STRIPE_INVEST_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  return rawBody(req).then(function (buf) {
    var evt;
    try { evt = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], secret); }
    catch (e) { return res.status(400).send('bad signature'); }
    var obj = evt.data.object;
    var work = null;

    if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
      var id = pledgeIdOf(obj);
      if (!id) return res.status(200).json({ ignored: 'not a pledge session' });
      if (obj.payment_status !== 'paid') {
        /* A delayed-settlement method: hold the row as processing until the
           async_payment_succeeded event lands. */
        work = A.db().collection('cf_pledges').doc(id).set({ status: 'processing', stripeSessionId: obj.id, stripePaymentIntent: obj.payment_intent || null, updatedAt: A.FieldValue().serverTimestamp() }, { merge: true })
          .then(function () { return { processing: id }; });
      } else {
        work = L.markPaid(id, { provider: 'stripe', sessionId: obj.id, paymentIntent: obj.payment_intent || null,
          amountTotal: (obj.amount_total || 0) / 100, currency: obj.currency || 'usd', email: (obj.customer_details && obj.customer_details.email) || obj.customer_email || null, at: new Date(evt.created * 1000).toISOString() });
      }
    } else if (evt.type === 'checkout.session.async_payment_failed' || evt.type === 'checkout.session.expired') {
      var cid = pledgeIdOf(obj);
      if (!cid) return res.status(200).json({ ignored: 'not a pledge session' });
      work = L.markCancelled(cid, evt.type).catch(function (e) { if (e.status === 409) return { skipped: e.message }; throw e; });
    } else if (evt.type === 'charge.refunded') {
      var pi = obj.payment_intent;
      if (!pi) return res.status(200).json({ ignored: 'no payment intent' });
      work = A.db().collection('cf_pledges').where('stripePaymentIntent', '==', pi).limit(1).get().then(function (q) {
        if (q.empty) return { ignored: 'no pledge for ' + pi };
        return L.markRefunded(q.docs[0].id, { provider: 'stripe', chargeId: obj.id, amount: (obj.amount_refunded || 0) / 100, at: new Date(evt.created * 1000).toISOString() });
      });
    } else {
      return res.status(200).json({ ignored: evt.type });
    }
    return work.then(function (out) { res.status(200).json({ received: true, result: out }); });
  }).catch(function (e) { console.error('[invest-webhook]', e); res.status(e.status && e.status < 500 ? 200 : 500).json({ error: e.message }); });
};

/* After the handler assignment — `module.exports = fn` replaces the exports
   object, so a .config set before it would be discarded (see stripe-webhook.js). */
module.exports.config = { api: { bodyParser: false } };
