/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * ONE rule for where packaging bills. Everything that touches money reads it:
 * the engine's guard (package-billing), the item sync and the QuickBooks
 * driver's guard (qbo-items), signup (tenant-signup) and the daily runner.
 *
 *   SANDBOX  QBO_ENV=sandbox. The default for Preview: a tenant marked
 *            packagingSandbox, an enabled book synced to the sandbox company.
 *   LIVE     PACKAGING_LIVE=true AND QBO_ENV=production, both literal: an
 *            enabled book under a release version (never one ending in
 *            -proposed) synced to the production company; any tenant may buy.
 *   neither  refused everywhere. A production realm without the live switch,
 *            or the switch with QBO_ENV unset, issues nothing.
 */
'use strict';
function qboEnv() { return String(process.env.QBO_ENV || '').toLowerCase(); }
function live() { return process.env.PACKAGING_LIVE === 'true' && qboEnv() === 'production'; }
function sandbox() { return qboEnv() === 'sandbox'; }
/* what a price book, a stored connection and the QuickBooks host must be */
function env() { return live() ? 'production' : 'sandbox'; }
/* whether packaging may bill at all */
function open() { return live() || sandbox(); }
module.exports = { live: live, sandbox: sandbox, env: env, open: open };
