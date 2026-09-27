/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * POST /api/package-stripe-webhook — Stripe events for PACKAGED billing on
 * the Stripe rail (api/_lib/stripe-billing.js), signed with
 * STRIPE_PACKAGING_WEBHOOK_SECRET: register this URL in the Stripe mode the
 * packaging mode names (test for SANDBOX, live for LIVE) with
 *   checkout.session.completed, checkout.session.expired,
 *   payment_intent.succeeded, payment_intent.payment_failed,
 *   charge.refunded, charge.dispute.created, charge.dispute.closed.
 *
 * Its own endpoint, NOT /api/stripe-webhook: that one is the legacy tenant
 * branch and Editor Lite, which act on metadata.orgId, a top-level
 * billing/current.stripeCustomerId and kind 'customer-editor-lite'. A
 * packaged object carries none of those (kind 'omega-package', `org`), so
 * that endpoint ignores these events even when Stripe sends them to both.
 *
 * The event is a HINT: the record is re-read from Stripe and settled by the
 * engine's one paid transition (package-billing.reconcile). Not ours, or the
 * other Stripe mode → 200 and ignored. A settle that did not land → 500, so
 * Stripe retries; a done event is never applied twice (stripe_events/{id}).
 * Signature: the dependency-free check api/ledger-webhook.js verify() owns.
 * Vercel must NOT parse the body (config below).
 */
'use strict';
var A = require('./_lib/admin'), SB = require('./_lib/stripe-billing');
var MAX = 1024 * 1024;
async function raw(req) {
  var chunks = [], size = 0;
  for await (var c of req) { size += c.length; if (size > MAX) { var e = new Error('Payload too large'); e.status = 413; throw e; } chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks);
}
module.exports = A.handler(async function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var secret = process.env.STRIPE_PACKAGING_WEBHOOK_SECRET;
  if (!secret) throw A.httpError(503, 'STRIPE_PACKAGING_WEBHOOK_SECRET is not set on this deployment');
  var body = await raw(req);
  require('./ledger-webhook').verify(body, req.headers['stripe-signature'], secret, Math.floor(Date.now() / 1000));
  var evt;
  try { evt = JSON.parse(body.toString('utf8')); } catch (e) { throw A.httpError(400, 'Invalid event'); }
  if (!evt || typeof evt.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(evt.id)) throw A.httpError(400, 'Invalid event');
  var out;
  try { out = await SB.webhook(A.db(), evt, Date.now()); }
  catch (e) {
    if (e && e.status && e.status < 500 && !e.clearsky) return { received: true, reviewRequired: true, note: String(e.message).slice(0, 200) };
    throw A.httpError(500, 'Not settled yet; Stripe will retry');
  }
  return out ? Object.assign({ received: true }, out) : { received: true, ignored: 'not a packaged-billing event' };
});
/* Must come AFTER the handler assignment: `module.exports = fn` replaces the
   whole exports object (the lesson recorded in stripe-webhook.js). */
module.exports.config = { api: { bodyParser: false } };
