/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * ONE rule for where packaging bills. Everything that touches money reads it:
 * the engine's guard (package-billing), the item sync and the QuickBooks
 * driver's guard (qbo-items), the Stripe driver (stripe-billing), signup
 * (tenant-signup) and the daily runner.
 *
 *   SANDBOX  QBO_ENV=sandbox. The default for Preview: a tenant marked
 *            packagingSandbox, an enabled book synced to the sandbox company.
 *   LIVE     PACKAGING_LIVE=true AND QBO_ENV=production, both literal: an
 *            enabled book under a release version (never one ending in
 *            -proposed) synced to the production company; any tenant may buy.
 *   neither  refused everywhere. A production realm without the live switch,
 *            or the switch with QBO_ENV unset, issues nothing.
 *
 * The RAIL is how a workspace pays (2026-09-27, Tommy: "charge people on the
 * spot with Stripe"). PACKAGING_RAIL=stripe, literal, makes every workspace
 * activated or approved from then on pay by card through Stripe Checkout
 * (the card saved for its renewals); anything else keeps QuickBooks
 * invoices. The rail is recorded on the workspace when it starts, so one
 * workspace never has two ways to pay, and the books stay QuickBooks either
 * way (Stripe's own QuickBooks app records a card payment).
 *
 * Stripe follows the mode, never the other way round: SANDBOX takes only a
 * test key (sk_test_/rk_test_) and test-mode events, LIVE only a live key
 * and live-mode events. The key is STRIPE_PACKAGING_SECRET_KEY, else the
 * shared STRIPE_SECRET_KEY; one whose mode disagrees is no key at all.
 */
'use strict';
function qboEnv() { return String(process.env.QBO_ENV || '').toLowerCase(); }
function live() { return process.env.PACKAGING_LIVE === 'true' && qboEnv() === 'production'; }
function sandbox() { return qboEnv() === 'sandbox'; }
/* what a price book, a stored connection and the QuickBooks host must be */
function env() { return live() ? 'production' : 'sandbox'; }
/* whether packaging may bill at all */
function open() { return live() || sandbox(); }
/* how a workspace starting now pays: 'stripe' or 'quickbooks' */
function rail() { return process.env.PACKAGING_RAIL === 'stripe' ? 'stripe' : 'quickbooks'; }
/* the Stripe secret key packaging may use in this mode, or null */
function stripeKey() {
  if (!open()) return null;
  var key = String(process.env.STRIPE_PACKAGING_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '');
  var want = live() ? 'live' : 'test';
  return new RegExp('^(sk|rk)_' + want + '_[A-Za-z0-9]+$').test(key) ? key : null;
}
/* whether a Stripe object or event (its `livemode`) belongs to this mode */
function stripeModeOk(livemode) { return open() && typeof livemode === 'boolean' && livemode === live(); }
module.exports = { live: live, sandbox: sandbox, env: env, open: open, rail: rail, stripeKey: stripeKey, stripeModeOk: stripeModeOk };
