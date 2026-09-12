/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/invest-ledger.js — the one place a pledge changes state
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   cf_pledges is written ONLY from the server (firestore.rules: allow write:
   if false). Two callers change a pledge's state — /api/invest (manual
   confirmation, cancellation, refunds) and /api/invest-webhook (Stripe) —
   and both go through here, so the campaign's counters can never disagree
   with the pledges that make them up.

   Every transition is a Firestore TRANSACTION over the pledge and its
   campaign, and every one is idempotent: Stripe retries webhooks, a person
   double-clicks "confirm", and the second call must find nothing to do.

   COUNTERS ON THE CAMPAIGN (public, read by every card):
     raised     Σ amount of paid pledges
     unitsSold  Σ units  of paid pledges
     backers    distinct investors with at least one paid pledge
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./admin');

function otherPaidPledges(db, p, excludeId) {
  /* Equality-only filters, so no composite index is needed. */
  return db.collection('cf_pledges')
    .where('campaignId', '==', p.campaignId)
    .where('investorUid', '==', p.investorUid)
    .where('status', '==', 'paid');
}

/* pending|processing → paid. `pay` is the payment record to keep. */
function markPaid(pledgeId, pay) {
  var db = A.db(), FV = A.FieldValue();
  var pRef = db.collection('cf_pledges').doc(String(pledgeId));
  return db.runTransaction(function (t) {
    return t.get(pRef).then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'pledge not found');
      var p = ps.data();
      if (p.status === 'paid') return { already: true, pledge: p };
      if (p.status !== 'pending' && p.status !== 'processing') throw A.httpError(409, 'pledge is ' + p.status + ', not payable');
      var cRef = db.collection('cf_campaigns').doc(p.campaignId);
      return Promise.all([t.get(cRef), t.get(otherPaidPledges(db, p).limit(1))]).then(function (r) {
        if (!r[0].exists) throw A.httpError(404, 'campaign not found');
        var patch = { raised: FV.increment(Number(p.amount) || 0), unitsSold: FV.increment(Number(p.units) || 0),
          lastPledgeAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() };
        if (r[1].empty) patch.backers = FV.increment(1);
        t.set(cRef, patch, { merge: true });
        t.set(pRef, { status: 'paid', paidAt: FV.serverTimestamp(), payment: pay || {}, updatedAt: FV.serverTimestamp() }, { merge: true });
        return { ok: true, pledge: p, campaign: r[0].data() };
      });
    });
  });
}

/* paid → refunded. Reverses the counters. `info` records how. */
function markRefunded(pledgeId, info) {
  var db = A.db(), FV = A.FieldValue();
  var pRef = db.collection('cf_pledges').doc(String(pledgeId));
  return db.runTransaction(function (t) {
    return t.get(pRef).then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'pledge not found');
      var p = ps.data();
      if (p.status === 'refunded') return { already: true, pledge: p };
      if (p.status !== 'paid') throw A.httpError(409, 'pledge is ' + p.status + ', not refundable');
      var cRef = db.collection('cf_campaigns').doc(p.campaignId);
      return Promise.all([t.get(cRef), t.get(otherPaidPledges(db, p).limit(2))]).then(function (r) {
        var patch = { raised: FV.increment(-(Number(p.amount) || 0)), unitsSold: FV.increment(-(Number(p.units) || 0)), updatedAt: FV.serverTimestamp() };
        /* The query still sees THIS pledge as paid (the write below has not
           landed), so "only me" is size 1, not 0. */
        if (r[1].size <= 1) patch.backers = FV.increment(-1);
        if (r[0].exists) t.set(cRef, patch, { merge: true });
        t.set(pRef, { status: 'refunded', refundedAt: FV.serverTimestamp(), refund: info || {}, updatedAt: FV.serverTimestamp() }, { merge: true });
        return { ok: true, pledge: p };
      });
    });
  });
}

/* pending|processing → cancelled. Nothing to reverse; nothing was counted. */
function markCancelled(pledgeId, reason) {
  var db = A.db(), FV = A.FieldValue();
  var pRef = db.collection('cf_pledges').doc(String(pledgeId));
  return db.runTransaction(function (t) {
    return t.get(pRef).then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'pledge not found');
      var p = ps.data();
      if (p.status === 'cancelled') return { already: true, pledge: p };
      if (p.status !== 'pending' && p.status !== 'processing') throw A.httpError(409, 'pledge is ' + p.status + ', not cancellable');
      t.set(pRef, { status: 'cancelled', cancelledAt: FV.serverTimestamp(), cancelReason: reason || null, updatedAt: FV.serverTimestamp() }, { merge: true });
      return { ok: true, pledge: p };
    });
  });
}

/* What this investor has committed this calendar year, across every
   campaign — the figure the non-accredited annual cap is checked against.
   Pending pledges count: an open checkout is a commitment until it lapses. */
function committedThisYear(uid) {
  var db = A.db();
  var y0 = new Date(new Date().getUTCFullYear(), 0, 1).getTime();
  return db.collection('cf_pledges').where('investorUid', '==', uid).get().then(function (q) {
    var sum = 0;
    q.forEach(function (d) {
      var p = d.data();
      if (p.status !== 'paid' && p.status !== 'pending' && p.status !== 'processing') return;
      var at = p.createdAt && p.createdAt.toMillis ? p.createdAt.toMillis() : (p.createdAtMs || 0);
      if (at >= y0) sum += Number(p.amount) || 0;
    });
    return sum;
  });
}

module.exports = { markPaid: markPaid, markRefunded: markRefunded, markCancelled: markCancelled, committedThisYear: committedThisYear };
