/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * ONE rule for where packaging bills. Everything that touches money reads it:
 * the engine's guard (package-billing), the item sync and the QuickBooks
 * driver's guard (qbo-items), the Stripe driver (stripe-billing), signup
 * (tenant-signup) and the daily runner.
 *
 * TWO PROVIDERS. Stripe is the rail Tommy chose (2026-09-27: "a customer
 * creates an account, they add billing and that's all done through Stripe,
 * and once they do that it needs to allow them to use what they paid for").
 * It is switched on by PACKAGING_PROVIDER=stripe, literally: production was
 * already taking pay-now signups through QuickBooks when this landed, so the
 * switch waits for the Stripe account's webhook and invoice settings
 * (docs/PAYMENTS-STRIPE.md) rather than flipping a live money path on a
 * merge. Unset keeps QuickBooks. A workspace stays on the provider its
 * customer record was made on (billing-driver.providerOf), so switching
 * never strands an agreement that is already billing.
 *
 *   stripe      SANDBOX  a Stripe TEST key (sk_test_… / rk_test_…).
 *               LIVE     PACKAGING_LIVE=true AND a LIVE key (sk_live_… /
 *                        rk_live_…), both literal.
 *   quickbooks  SANDBOX  QBO_ENV=sandbox: an enabled book synced to the
 *                        sandbox company.
 *               LIVE     PACKAGING_LIVE=true AND QBO_ENV=production, both
 *                        literal: an enabled release book synced to the
 *                        production company.
 *   neither     refused everywhere. A live key or a production realm without
 *               the live switch, or the switch with neither, issues nothing.
 *
 * Every function takes the provider it is asked about; without one it
 * answers for the default provider.
 */
'use strict';
function provider() { return process.env.PACKAGING_PROVIDER === 'stripe' ? 'stripe' : 'quickbooks'; }
function qboEnv() { return String(process.env.QBO_ENV || '').toLowerCase(); }
function stripeEnv() {
  var k = String(process.env.STRIPE_SECRET_KEY || '');
  return /^(sk|rk)_live_/.test(k) ? 'production' : /^(sk|rk)_test_/.test(k) ? 'sandbox' : null;
}
/* where the provider's credentials point: 'production', 'sandbox' or null */
function configured(p) {
  if ((p || provider()) === 'stripe') return stripeEnv();
  var q = qboEnv(); return q === 'production' || q === 'sandbox' ? q : null;
}
function live(p) { return process.env.PACKAGING_LIVE === 'true' && configured(p) === 'production'; }
/* a deployment under the live switch never bills in test mode: a provider
   whose key is still a test key there is closed, not a sandbox (else a
   stranger's test-card payment would open real modules in production) */
function sandbox(p) { return process.env.PACKAGING_LIVE !== 'true' && configured(p) === 'sandbox'; }
/* what a price book, a stored connection and the provider's host must be */
function env(p) { return live(p) ? 'production' : 'sandbox'; }
/* whether packaging may bill at all */
function open(p) { return live(p) || sandbox(p); }
module.exports = { provider: provider, live: live, sandbox: sandbox, env: env, open: open, configured: configured };
