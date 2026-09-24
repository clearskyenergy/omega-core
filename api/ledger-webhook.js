/* POST /api/ledger-webhook — Stripe Connect events from WORKSPACES' own
   Stripe accounts (api/_lib/ledger-sync.js).
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   NOT /api/stripe-webhook: that one is ClearSky's own subscription billing
   (billing/current) and is signed with STRIPE_WEBHOOK_SECRET. This endpoint
   is the Connect endpoint ("events on connected accounts"), signed with its
   own STRIPE_CONNECT_WEBHOOK_SECRET.

   The event is a HINT, never payment evidence — the same stance as
   logic-webhook.js for QuickBooks. It names an invoice; the reverse index
   integrations/stripe_connect/orgs/{org}/invoices/{in_…} names the order;
   and logic-workflow.syncLedger() re-reads the invoice from Stripe through
   ledger-sync and applies what Stripe says through the one writer. A forged
   or replayed event can at worst cause a re-read.

   invoice.paid / payment_succeeded / voided / marked_uncollectible,
   charge.refunded, charge.dispute.created / closed → re-read that order.
   account.application.deauthorized → the workspace is marked disconnected.
   Anything else, an unknown or disconnected account, an invoice Omega Logic
   did not make → 200 and ignored. A sync failure → 500, so Stripe retries;
   a failed event is processed again on the retry, a done one never is.

   Signature: Stripe-Signature "t=<unix>,v1=<hex>[,v1=…]", HMAC-SHA256 of
   "<t>.<raw body>" with the secret, compared timing-safe, five minutes of
   tolerance. No stripe npm module: the raw bytes are all it needs.
   Vercel must NOT parse the body (config below). */
'use strict';
var A = require('./_lib/admin'), crypto = require('crypto');

var TOLERANCE_SECONDS = 300;
var INVOICE_EVENTS = ['invoice.paid', 'invoice.payment_succeeded', 'invoice.voided', 'invoice.marked_uncollectible'];
var CHARGE_EVENTS = ['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'];

function LS() { return require('./_lib/ledger-sync'); }
function nowIso() { return new Date().toISOString(); }
function idOf(v) { return typeof v === 'string' ? v : (v && v.id) || null; }

function verify(raw, header, secret, nowSeconds) {
  var t = null, sigs = [];
  String(header || '').split(',').forEach(function (part) {
    var i = part.indexOf('=');
    if (i < 0) return;
    var k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v; else if (k === 'v1') sigs.push(v);
  });
  if (!t || !/^\d{1,12}$/.test(t) || !sigs.length) throw A.httpError(400, 'Invalid Stripe signature');
  var expected = crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest();
  var ok = sigs.some(function (s) {
    if (!/^[a-f0-9]{64}$/i.test(s)) return false;
    var got = Buffer.from(s, 'hex');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
  if (!ok) throw A.httpError(400, 'Invalid Stripe signature');
  if (Math.abs(nowSeconds - Number(t)) > TOLERANCE_SECONDS) throw A.httpError(400, 'Stale Stripe signature');
}

/* Which order an event is about, or null when it is not one of ours. */
async function orderOf(db, event, acct, org) {
  var type = String(event.type || ''), obj = (event.data && event.data.object) || {}, invoiceId = null;
  if (INVOICE_EVENTS.indexOf(type) >= 0) invoiceId = idOf(obj);
  else if (CHARGE_EVENTS.indexOf(type) >= 0) {
    invoiceId = idOf(obj.invoice);
    if (!invoiceId && obj.charge) {   /* a dispute names its charge; the charge names its invoice */
      var ch = await LS().stripeRequest('GET', '/charges/' + encodeURIComponent(idOf(obj.charge)), null, { account: acct });
      invoiceId = idOf(ch.invoice);
    }
  } else return null;
  if (!/^in_[A-Za-z0-9]+$/.test(String(invoiceId || ''))) return null;
  var ix = await db.doc('integrations/stripe_connect/orgs/' + org + '/invoices/' + invoiceId).get();
  if (!ix.exists) return null;
  var orderId = String(ix.data().orderId || ''), stage = ix.data().stage;
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(orderId)) return null;
  var o = await db.collection('orders').doc(orderId).get();
  if (!o.exists || o.data().orgId !== org) return null;
  return { orderId: orderId, stage: stage, invoiceId: invoiceId };
}

module.exports = A.handler(async function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) throw A.httpError(503, 'Stripe Connect webhook is not configured');
  var chunks = [], size = 0;
  for await (var chunk of req) {
    size += chunk.length;
    if (size > 1048576) throw A.httpError(413, 'Payload too large');
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  var raw = Buffer.concat(chunks);
  verify(raw, req.headers['stripe-signature'], secret, Math.floor(Date.now() / 1000));
  var event;
  try { event = JSON.parse(raw.toString('utf8')); } catch (e) { throw A.httpError(400, 'Invalid JSON'); }
  if (!event || typeof event !== 'object' || !/^evt_[A-Za-z0-9]+$/.test(String(event.id || ''))) throw A.httpError(400, 'Invalid event');

  var acct = String(event.account || '');
  if (!/^acct_[A-Za-z0-9]+$/.test(acct)) return { ok: true, ignored: true };
  var db = A.db(), idx = await db.doc('integrations/stripe_connect/accounts/' + acct).get();
  var org = idx.exists ? A.safeOrg(idx.data().orgId) : '';
  if (!idx.exists || idx.data().disconnectedAt || !org) return { ok: true, ignored: true };

  /* Dedupe: a done or ignored event is never processed twice; a failed or
     interrupted one is processed again when Stripe retries it. */
  var eref = db.doc('integrations/stripe_connect/events/' + event.id);
  var duplicate = await db.runTransaction(async function (tx) {
    var s = await tx.get(eref), cur = s.exists ? s.data() : null;
    if (cur && (cur.status === 'done' || cur.status === 'ignored')) return true;
    tx.set(eref, { type: String(event.type || '').slice(0, 80), account: acct, receivedAt: (cur && cur.receivedAt) || nowIso(),
      status: 'processing', attempts: ((cur && cur.attempts) || 0) + 1, orderId: null, error: null });
    return false;
  });
  if (duplicate) return { ok: true, duplicate: true };

  try {
    if (event.type === 'account.application.deauthorized') {
      await LS().stripeDeauthorized(acct);
      await eref.update({ status: 'done', finishedAt: nowIso() });
      return { ok: true, disconnected: true };
    }
    var hit = await orderOf(db, event, acct, org);
    if (!hit) {
      await eref.update({ status: 'ignored', finishedAt: nowIso() });
      return { ok: true, ignored: true };
    }
    await require('./_lib/logic-workflow').syncLedger(hit.orderId, { email: 'stripe-webhook' }, { source: 'stripe-webhook' });
    await eref.update({ status: 'done', orderId: hit.orderId, finishedAt: nowIso() });
    return { ok: true, orderId: hit.orderId, stage: hit.stage };
  } catch (e) {
    console.error('[ledger-webhook]', event.id, e && e.message);
    try { await eref.update({ status: 'failed', error: String((e && e.message) || e).slice(0, 300), finishedAt: nowIso() }); } catch (ignore) { /* keep the 500 */ }
    throw A.httpError(500, 'Ledger sync failed; Stripe will retry');
  }
});
/* Must come AFTER the handler assignment: `module.exports = fn` replaces the
   whole exports object (the lesson recorded in stripe-webhook.js). */
module.exports.config = { api: { bodyParser: false } };
module.exports.verify = verify;
