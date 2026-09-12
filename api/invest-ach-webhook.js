/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/invest-ach-webhook — the bank rail (Dwolla) → cf_pledges / cf_payouts
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Dwolla posts one event per state change. The body carries the topic and
   the id of the resource it is about; which of our rows that is comes from
   the transfer id we stored when we started it (invest-ledger.findByTransfer).

     customer_transfer_completed / transfer_completed
        debit  → pledge paid (counters move)
        refund → pledge refunded (counters move back)
        credit → payout paid; distribution settles when all are
     customer_transfer_failed / _cancelled / _returned, transfer_failed / _cancelled
        debit  → pledge cancelled, with the reason
        refund → pledge back to paid, refundError set
        credit → payout failed
     customer_verified                       → investor kyc verified
     customer_verification_document_needed, customer_reverification_needed
                                             → investor kyc 'document'
     customer_suspended                      → investor status suspended

   Signature: X-Request-Signature-SHA-256 = HMAC-SHA256(secret, raw body), hex.
   A bad signature is a 401 and nothing is read. Every transition is
   idempotent (Dwolla retries), and an event about a transfer we do not know
   is acknowledged and ignored rather than retried forever.

   Register in Dwolla: POST /webhook-subscriptions { url: https://<host>/api/invest-ach-webhook,
   secret: <DWOLLA_WEBHOOK_SECRET> }.  Vercel must NOT parse the body.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var L = require('./_lib/invest-ledger');
var BK = require('./_lib/invest-bank');

function rawBody(req) { return new Promise(function (res, rej) { var c = []; req.on('data', function (d) { c.push(d); }); req.on('end', function () { res(Buffer.concat(c)); }); req.on('error', rej); }); }

var COMPLETED = { customer_transfer_completed: 1, transfer_completed: 1 };
var FAILED = { customer_transfer_failed: 1, customer_transfer_cancelled: 1, customer_transfer_returned: 1, transfer_failed: 1, transfer_cancelled: 1, transfer_returned: 1 };

function investorByCustomer(db, customerId) {
  return db.collection('cf_investors').where('bank.customerId', '==', customerId).limit(1).get().then(function (q) { return q.empty ? null : q.docs[0]; });
}

function handle(evt) {
  var db = A.db(), FV = A.FieldValue();
  var topic = String(evt.topic || ''), rid = String(evt.resourceId || '');
  if (COMPLETED[topic] || FAILED[topic]) {
    return L.findByTransfer(rid).then(function (row) {
      if (!row) return { ignored: 'no row for transfer ' + rid };
      var ok = !!COMPLETED[topic];
      if (row.kind === 'pledge') {
        return ok ? L.markPaid(row.id, { provider: row.data.paymentProvider || 'ach', transferId: rid, at: new Date(evt.timestamp || Date.now()).toISOString() })
                  : L.markCancelled(row.id, 'bank transfer ' + topic.replace(/^customer_transfer_|^transfer_/, ''));
      }
      if (row.kind === 'refund') {
        return ok ? L.markRefunded(row.id, { settledAt: new Date().toISOString(), transferId: rid })
                  : L.refundFailed(row.id, { reason: 'refund transfer ' + topic.replace(/^customer_transfer_|^transfer_/, '') });
      }
      return ok ? L.payoutSettled(row.id, { transferId: rid, at: new Date().toISOString() })
                : L.payoutFailed(row.id, { reason: 'transfer ' + topic.replace(/^customer_transfer_|^transfer_/, ''), transferId: rid });
    }).catch(function (e) { if (e.status === 409 || e.status === 404) return { skipped: e.message }; throw e; });
  }
  if (topic === 'customer_verified' || topic === 'customer_verification_document_needed' || topic === 'customer_reverification_needed' || topic === 'customer_suspended') {
    return investorByCustomer(db, rid).then(function (doc) {
      if (!doc) return { ignored: 'no investor for customer ' + rid };
      var patch = { updatedAt: FV.serverTimestamp() };
      if (topic === 'customer_verified') { patch.kyc = 'verified'; patch.kycProvider = 'dwolla'; patch.kycAt = FV.serverTimestamp(); patch['bank.status'] = 'verified'; patch['bank.identityStatus'] = 'verified'; }
      else if (topic === 'customer_suspended') { patch.status = 'suspended'; patch['bank.identityStatus'] = 'suspended'; }
      else { patch.kyc = 'document'; patch['bank.identityStatus'] = 'document'; }
      /* Dotted keys update nested fields without replacing the bank map. */
      return doc.ref.update(patch).then(function () { return { investor: doc.id, kyc: patch.kyc || null }; });
    });
  }
  return { ignored: topic };
}

module.exports = function (req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  return rawBody(req).then(function (buf) {
    if (!BK.verifyWebhook(buf, req.headers['x-request-signature-sha-256'])) return res.status(401).send('bad signature');
    var evt;
    try { evt = JSON.parse(buf.toString('utf8')); } catch (e) { return res.status(400).send('bad json'); }
    return Promise.resolve(handle(evt)).then(function (out) { res.status(200).json({ received: true, result: out }); });
  }).catch(function (e) { console.error('[invest-ach-webhook]', e); res.status(500).json({ error: e.message }); });
};

/* After the handler assignment — `module.exports = fn` replaces the exports
   object, so a .config set before it would be discarded. */
module.exports.config = { api: { bodyParser: false } };
module.exports.handle = handle;
