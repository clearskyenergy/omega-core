/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/invest-ledger.js — the one place a pledge or a payout changes state
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   cf_pledges and cf_payouts are written ONLY from the server (firestore.rules:
   allow write: if false). Three callers change their state — /api/invest
   (manual confirmation, cancellation, refunds, payouts), /api/invest-webhook
   (Stripe) and /api/invest-ach-webhook (the bank rail) — and all go through
   here, so the campaign's counters can never disagree with the pledges that
   make them up.

   Every transition is a Firestore TRANSACTION over the pledge and its
   campaign, and every one is idempotent: Stripe and Dwolla retry webhooks, a
   person double-clicks "confirm", and the second call must find nothing to do.

   PLEDGE STATES
     pending     created; nothing has been paid (card checkout open, wire awaited)
     processing  money is in flight (an ACH debit was started, a bank debit is settling)
     paid        counted: raised / unitsSold / backers moved
     refunding   a refund transfer was started; still counted until it settles
     refunded    reversed: counters moved back
     cancelled   never paid

   COUNTERS ON THE CAMPAIGN (public, read by every card):
     raised     Σ amount of paid (and refunding) pledges
     unitsSold  Σ units  of paid (and refunding) pledges
     backers    distinct investors with at least one paid pledge

   PAYOUT STATES  pending → processing → paid | failed, or unbanked (no bank to
   send to; staff pay by hand and mark it). A distribution is `paid` once every
   payout is paid or unbanked-and-marked.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./admin');

function otherPaidPledges(db, p) {
  /* Equality-only filters, so no composite index is needed. */
  return db.collection('cf_pledges')
    .where('campaignId', '==', p.campaignId)
    .where('investorUid', '==', p.investorUid)
    .where('status', '==', 'paid');
}
function pledgeRef(db, id) { return db.collection('cf_pledges').doc(String(id)); }

/* pending|processing → paid. `pay` is the payment record to keep. */
function markPaid(pledgeId, pay) {
  var db = A.db(), FV = A.FieldValue();
  var pRef = pledgeRef(db, pledgeId);
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

/* pending → processing: money is in flight. Nothing is counted yet. */
function markProcessing(pledgeId, info) {
  var db = A.db(), FV = A.FieldValue();
  var pRef = pledgeRef(db, pledgeId);
  return db.runTransaction(function (t) {
    return t.get(pRef).then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'pledge not found');
      var p = ps.data();
      if (p.status === 'processing') return { already: true, pledge: p };
      if (p.status !== 'pending') throw A.httpError(409, 'pledge is ' + p.status + ', not startable');
      t.set(pRef, Object.assign({ status: 'processing', processingAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() }, info || {}), { merge: true });
      return { ok: true, pledge: p };
    });
  });
}

/* paid → refunding: a refund transfer was started. Counters hold until it
   settles, because the money has not moved yet. */
function markRefunding(pledgeId, info) {
  var db = A.db(), FV = A.FieldValue();
  var pRef = pledgeRef(db, pledgeId);
  return db.runTransaction(function (t) {
    return t.get(pRef).then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'pledge not found');
      var p = ps.data();
      if (p.status === 'refunding') return { already: true, pledge: p };
      if (p.status !== 'paid') throw A.httpError(409, 'pledge is ' + p.status + ', not refundable');
      t.set(pRef, { status: 'refunding', refundingAt: FV.serverTimestamp(), refund: info || {}, updatedAt: FV.serverTimestamp() }, { merge: true });
      return { ok: true, pledge: p };
    });
  });
}

/* paid|refunding → refunded. Reverses the counters. `info` records how. */
function markRefunded(pledgeId, info) {
  var db = A.db(), FV = A.FieldValue();
  var pRef = pledgeRef(db, pledgeId);
  return db.runTransaction(function (t) {
    return t.get(pRef).then(function (ps) {
      if (!ps.exists) throw A.httpError(404, 'pledge not found');
      var p = ps.data();
      if (p.status === 'refunded') return { already: true, pledge: p };
      if (p.status !== 'paid' && p.status !== 'refunding') throw A.httpError(409, 'pledge is ' + p.status + ', not refundable');
      var cRef = db.collection('cf_campaigns').doc(p.campaignId);
      return Promise.all([t.get(cRef), t.get(otherPaidPledges(db, p).limit(2))]).then(function (r) {
        var patch = { raised: FV.increment(-(Number(p.amount) || 0)), unitsSold: FV.increment(-(Number(p.units) || 0)), updatedAt: FV.serverTimestamp() };
        /* The query still sees THIS pledge as paid when it is (the write below
           has not landed), so "only me" is size 1 while paid and 0 while
           refunding. */
        var others = r[1].size - (p.status === 'paid' ? 1 : 0);
        if (others <= 0) patch.backers = FV.increment(-1);
        if (r[0].exists) t.set(cRef, patch, { merge: true });
        t.set(pRef, { status: 'refunded', refundedAt: FV.serverTimestamp(), refund: Object.assign({}, p.refund || {}, info || {}), updatedAt: FV.serverTimestamp() }, { merge: true });
        return { ok: true, pledge: p };
      });
    });
  });
}

/* A refund transfer that failed: back to paid, with the reason on the row. */
function refundFailed(pledgeId, info) {
  var db = A.db(), FV = A.FieldValue();
  return pledgeRef(db, pledgeId).set({ status: 'paid', refundError: (info && info.reason) || 'refund transfer failed', refundFailedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() }, { merge: true })
    .then(function () { return { ok: true }; });
}

/* pending|processing → cancelled. Nothing to reverse; nothing was counted. */
function markCancelled(pledgeId, reason) {
  var db = A.db(), FV = A.FieldValue();
  var pRef = pledgeRef(db, pledgeId);
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

/* ── payouts ─────────────────────────────────────────────────────────────── */
function payoutRef(db, id) { return db.collection('cf_payouts').doc(String(id)); }

/* After a payout changes, decide whether its distribution is fully paid. */
function settleDistribution(db, distributionId) {
  var FV = A.FieldValue();
  return db.collection('cf_payouts').where('distributionId', '==', distributionId).get().then(function (q) {
    var open = 0, paid = 0, failed = 0, unbanked = 0, total = 0;
    q.forEach(function (d) { var x = d.data(); total += Number(x.amount) || 0; if (x.status === 'paid') paid++; else if (x.status === 'failed') failed++; else if (x.status === 'unbanked') unbanked++; else open++; });
    var status = open ? 'paying' : (failed || unbanked ? 'partial' : 'paid');
    return db.collection('cf_distributions').doc(distributionId).set({ status: status, payoutCounts: { paid: paid, failed: failed, unbanked: unbanked, open: open, total: q.size }, payoutTotal: total, updatedAt: FV.serverTimestamp() }, { merge: true })
      .then(function () { return status; });
  });
}
function payoutSettled(payoutId, info) {
  var db = A.db(), FV = A.FieldValue();
  var ref = payoutRef(db, payoutId);
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'payout not found');
    var p = s.data();
    if (p.status === 'paid') return { already: true, payout: p };
    return ref.set({ status: 'paid', paidAt: FV.serverTimestamp(), settlement: info || {}, updatedAt: FV.serverTimestamp() }, { merge: true })
      .then(function () { return settleDistribution(db, p.distributionId); })
      .then(function (ds) { return { ok: true, payout: p, distributionStatus: ds }; });
  });
}
function payoutFailed(payoutId, info) {
  var db = A.db(), FV = A.FieldValue();
  var ref = payoutRef(db, payoutId);
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'payout not found');
    var p = s.data();
    if (p.status === 'paid') return { already: true, payout: p };
    return ref.set({ status: 'failed', failedAt: FV.serverTimestamp(), failure: info || {}, updatedAt: FV.serverTimestamp() }, { merge: true })
      .then(function () { return settleDistribution(db, p.distributionId); })
      .then(function (ds) { return { ok: true, payout: p, distributionStatus: ds }; });
  });
}

/* Which row does a bank transfer belong to? Pledges (debit or refund) first,
   then payouts. Resolves { kind, id, data } or null. */
function findByTransfer(transferId) {
  var db = A.db();
  return db.collection('cf_pledges').where('achTransferId', '==', transferId).limit(1).get().then(function (q) {
    if (!q.empty) return { kind: 'pledge', id: q.docs[0].id, data: q.docs[0].data() };
    return db.collection('cf_pledges').where('refund.transferId', '==', transferId).limit(1).get().then(function (q2) {
      if (!q2.empty) return { kind: 'refund', id: q2.docs[0].id, data: q2.docs[0].data() };
      return db.collection('cf_payouts').where('transferId', '==', transferId).limit(1).get().then(function (q3) {
        if (!q3.empty) return { kind: 'payout', id: q3.docs[0].id, data: q3.docs[0].data() };
        return null;
      });
    });
  });
}

/* What this investor has committed this calendar year, across every
   campaign — the figure the non-accredited annual cap is checked against.
   Pending and processing pledges count: an open checkout is a commitment
   until it lapses. */
function committedThisYear(uid) {
  var db = A.db();
  var y0 = new Date(new Date().getUTCFullYear(), 0, 1).getTime();
  return db.collection('cf_pledges').where('investorUid', '==', uid).get().then(function (q) {
    var sum = 0;
    q.forEach(function (d) {
      var p = d.data();
      if (['paid', 'pending', 'processing', 'refunding'].indexOf(p.status) < 0) return;
      var at = p.createdAt && p.createdAt.toMillis ? p.createdAt.toMillis() : (p.createdAtMs || 0);
      if (at >= y0) sum += Number(p.amount) || 0;
    });
    return sum;
  });
}

module.exports = { markPaid: markPaid, markProcessing: markProcessing, markRefunding: markRefunding, markRefunded: markRefunded, refundFailed: refundFailed, markCancelled: markCancelled,
  payoutSettled: payoutSettled, payoutFailed: payoutFailed, settleDistribution: settleDistribution, findByTransfer: findByTransfer, committedThisYear: committedThisYear };
