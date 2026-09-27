/* POST /api/stripe-webhook — Stripe → billing/current
   An OMEGA PACKAGE invoice (metadata omegaPackage, written by
   _lib/stripe-billing.js) is answered FIRST: the engine's own reconcile runs
   for that workspace at once (package-billing.reconcile reads the invoice
   back from Stripe; the event is only the wake-up), so a paid card opens
   exactly what was bought within seconds. The hourly runner and "I've paid"
   run the same reconcile, so a lost event only delays, never decides.
   Everything else is the LEGACY Stripe tier path, unchanged:
   invoice.paid            → lastPaidAt, subscriptionDue, status active
   invoice.payment_failed  → paymentFailedAt (status flips to 'suspended'
                             only after GRACE_DAYS; a cron or the master
                             console enforces the flip — never on first miss)
   customer.subscription.* → tier from price metadata `tier`, subscriptionDue
   …except a supplier's CUSTOMER's Editor Lite subscription, which
   api/customer-subscribe.js webhook() takes first (customers/{id}.editorLite)
   Vercel must NOT parse the body (we need the raw bytes for the signature). */
'use strict';
var A = require('./_lib/admin');
var CustomerLite = require('./customer-subscribe');
var StripeBilling = require('./_lib/stripe-billing');

/* A package invoice event: reconcile that workspace now and send what it
   found (the tenant's receipt, ClearSky's alert). A refusal that is the
   workspace's (billing switched off, not packaged: a 4xx) is acknowledged
   so Stripe stops retrying; anything else is a 500 and Stripe retries. */
function packageEvent(org, deps) {
  var db = A.db(), now = Date.now(), S = require('./_lib/package-billing'), Runner = require('./_lib/package-billing-runner');
  return S.reconcile(db, org, now, deps && deps.billing).then(function (r) {
    var mailer = (deps && deps.mail) || require('./_lib/mail');
    return Runner.deliver(db, org, now, mailer).then(function () { return Runner.staffDeliver(db, now, mailer); }, function () {}).then(function () { return { orgId: org, reconciled: r }; });
  }, function (e) {
    if (e && e.status && e.status < 500 && e.clearsky !== true) return { orgId: org, ignored: String(e.message || e).slice(0, 200) };
    throw e;
  });
}

/* ClearSky's inbox, once per id: something about money a person must look at. */
function alertStaff(db, id, org, text) {
  var ref = db.doc('omega_orgs/clearsky-usa.com/notifications/' + id);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (old) {
      if (old.exists) return;
      tx.set(ref, { kind: 'billing-review', read: false, createdAt: Date.now(), orgId: org || null, staffMail: 'billingAlert', mailState: 'pending', text: String(text).slice(0, 600) });
    });
  }).catch(function (e) { console.error('[stripe-webhook] review alert not written:', e && e.message); });
}
/* A paid package invoice that no OMEGA record holds (its record was never
   written, or not yet): a person is told, and Stripe is answered 500 so it
   comes back — never absorbed with a 200 while money moved. */
function orphanCheck(evt, org) {
  var inv = evt.data.object;
  if (!/^invoice\.(paid|payment_succeeded)$/.test(evt.type) || !inv || !inv.id) return Promise.resolve(false);
  var db = A.db();
  return db.collection('omega_orgs').doc(org).collection('billing').doc('current').collection('invoices').where('stripeInvoiceId', '==', String(inv.id)).limit(1).get().then(function (q) {
    if (!q.empty) return false;
    return alertStaff(db, 'billing-orphan-' + inv.id, org, 'Stripe invoice ' + inv.id + ' for ' + org + ' was paid (' + ((inv.amount_paid || 0) / 100).toFixed(2) + ' USD) but no OMEGA invoice record holds it. Nothing was switched on for it; look it up in Stripe (refund it, or apply it by hand).').then(function () { return true; });
  });
}
var ANSWERED = {};
function rawBody(req) { return new Promise(function (res, rej) { var c = []; req.on('data', function (d) { c.push(d); }); req.on('end', function () { res(Buffer.concat(c)); }); req.on('error', rej); }); }

module.exports = function (req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return rawBody(req).then(function (buf) {
    var evt;
    try { evt = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
    catch (e) { return res.status(400).send('bad signature'); }
    var pkgOrg = StripeBilling.eventOrg(evt);
    if (pkgOrg) return packageEvent(pkgOrg, module.exports.deps).then(function (r) {
      return orphanCheck(evt, pkgOrg).then(function (orphan) {
        if (orphan) return res.status(500).json({ received: true, package: r, orphan: true });
        res.status(200).json({ received: true, package: r });
      });
    });
    /* A tenant's CUSTOMER paying for Editor Lite (api/customer-subscribe.js,
       metadata kind 'customer-editor-lite', or a Stripe customer on the
       stripe_customers pointer) is answered FIRST and never reaches the
       tenant branches below: those would patch the SUPPLIER's billing/current
       and a customer cancelling would set the supplier's tier to 'trial'.
       Anything else returns null here and runs below exactly as before. */
    return CustomerLite.webhook(evt, stripe).then(function (lite) {
    if (lite) return res.status(200).json({ received: true, customerEditorLite: lite });
    var obj = evt.data.object, FV = A.FieldValue(), db = A.db();
    var orgId = (obj.metadata && obj.metadata.orgId) || null;
    /* Not every event object HAS a `customer` field: a Customer itself
       (customer.created / .updated from a payment link or the Stripe
       dashboard) does not, and `where('==', undefined)` throws — a 500 that
       Stripe retries for days. No customer id, no lookup: acknowledged. */
    var cus = typeof obj.customer === 'string' && obj.customer ? obj.customer : '';
    var byCustomer = orgId ? Promise.resolve(orgId) : !cus ? Promise.resolve(null)
      : db.collectionGroup('billing').where('stripeCustomerId', '==', cus).limit(1).get().then(function (q) {
        if (!q.empty) return q.docs[0].ref.parent.parent.id;
        /* a tier customer a workspace moved off (package-billing keeps it) */
        return db.collectionGroup('billing').where('legacyStripeCustomerId', '==', cus).limit(1).get().then(function (l) { return l.empty ? null : l.docs[0].ref.parent.parent.id; });
      });
    return byCustomer.then(function (org) {
      if (!org) return { ignored: cus ? 'no org for ' + cus : 'no customer on ' + evt.type };
      /* a PACKAGED workspace is billed by the engine alone (its package
         invoices are answered above): this tier path never writes to it. A
         non-package invoice or subscription on its customer is most likely
         an old tier subscription still charging: a person is told. */
      return db.collection('omega_orgs').doc(org).collection('billing').doc('current').get().then(function (snap) {
        if (!(snap.exists && snap.data().packaged === true)) return org;
        var money = /^invoice\.(paid|payment_failed|payment_succeeded)$|^customer\.subscription\./.test(evt.type);
        return (money ? alertStaff(db, 'billing-review-legacy-' + evt.id, org, 'A Stripe ' + evt.type + ' that is not an OMEGA package invoice arrived for ' + org + ', which is billed as a package. An old tier subscription may still be charging it: cancel it in Stripe. Nothing was written to the workspace.') : Promise.resolve())
          .then(function () { return { ignored: 'packaged workspace: the tier path does not write to it' }; });
      });
    }).then(function (org) {
      /* one answer per event: a lookup that found nothing to write answers here, and nothing below answers again */
      if (!org || typeof org !== 'string') { res.status(200).json(org || { ignored: 'no org' }); return ANSWERED; }
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
    }).then(function (done) { if (done !== ANSWERED) res.status(200).json({ received: true }); });
    });
  }).catch(function (e) { console.error('[stripe-webhook]', e); res.status(500).end(); });
};

/* Must come AFTER the handler assignment above: `module.exports = fn`
   replaces the whole exports object, so setting .config before it was
   silently discarded and Vercel parsed the body — which breaks the
   raw-bytes signature check this endpoint depends on. */
module.exports.config = { api: { bodyParser: false } };
/* tests hand the engine a Stripe double and a mailer here */
module.exports.deps = null;
module.exports.packageEvent = packageEvent;
