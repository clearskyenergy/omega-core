/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * A new price book never moves an existing subscription (Tommy, 2026-10-20,
 * when 2026-11 added Omega Maximus: "keep their book"). package-billing.guard
 * issues under the code's current book, or under the workspace's OWN pinned
 * book when that book is enabled and a release version, on both rails, live
 * and sandbox. A new package, a legacy plan's add-ons and a -proposed book
 * still need the current version.
 */
'use strict';
var assert = require('assert');
var B = require('../../api/_lib/pricebook');
var S = require('../../api/_lib/package-billing');

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }
function book(version, enabled, qboEnv) {
  var b = B.proposed();
  b.version = version; b.enabled = enabled !== false;
  b.qbo.env = qboEnv || 'production'; b.qbo.realmId = qboEnv === 'sandbox' ? 'sandbox-realm' : '9130000000000000';
  if (/^2026-10/.test(version)) delete b.modules.maximus;
  return B.validate(b);
}
function ctx(bk, billing, org) {
  return { book: bk, billing: billing || {}, org: org || { status: 'active' }, profile: null, root: { id: 'pin.example' } };
}
function allowed(c, rail) { try { S.guard(c, rail); return true; } catch (e) { return e.message; } }
var saved = {};
['PACKAGING_BILLING_ENABLED', 'PACKAGING_PROVIDER', 'PACKAGING_LIVE', 'STRIPE_SECRET_KEY', 'QBO_ENV'].forEach(function (k) { saved[k] = process.env[k]; });
function env(o) { Object.keys(o).forEach(function (k) { if (o[k] == null) delete process.env[k]; else process.env[k] = o[k]; }); }

try {
  check(B.VERSION === '2026-11', 'the release book is 2026-11');
  var old = book('2026-10'), now = book(B.VERSION), proposedOld = book('2026-10-proposed', true, 'sandbox'), disabledOld = book('2026-10', false);
  var pinnedOld = { packaged: true, pricebookVersion: '2026-10', billingProvider: 'stripe', paymentProvider: 'stripe' };

  /* LIVE through Stripe: what production runs */
  env({ PACKAGING_BILLING_ENABLED: 'true', PACKAGING_PROVIDER: 'stripe', PACKAGING_LIVE: 'true', STRIPE_SECRET_KEY: 'sk_live_fixture', QBO_ENV: null });
  check(allowed(ctx(now, { packaged: true, pricebookVersion: B.VERSION, billingProvider: 'stripe' }), 'stripe') === true, 'live Stripe: a workspace on the current book bills');
  check(allowed(ctx(old, pinnedOld), 'stripe') === true, 'live Stripe: a workspace pinned to 2026-10 keeps renewing on its own book after 2026-11 is released');
  check(allowed(ctx(old, { packaged: true, billingProvider: 'stripe' }), 'stripe') !== true, 'live Stripe: an old book is never a NEW package\'s');
  check(allowed(ctx(old, { packaged: true, pricebookVersion: '2026-09', billingProvider: 'stripe' }), 'stripe') !== true, 'live Stripe: only the book the workspace is pinned to');
  check(allowed(ctx(disabledOld, pinnedOld), 'stripe') !== true, 'live Stripe: a disabled book never bills');
  check(allowed(ctx(proposedOld, Object.assign({}, pinnedOld, { pricebookVersion: '2026-10-proposed' })), 'stripe') !== true, 'live Stripe: a -proposed book never bills live, pinned or not');
  check(allowed(ctx(old, { pricebookVersion: '2026-10' }), 'stripe') !== true, 'live Stripe: a legacy plan (not packaged) bills its add-ons on the current book only');

  /* LIVE through QuickBooks: the pinned book must still be the production company's */
  env({ PACKAGING_PROVIDER: null, STRIPE_SECRET_KEY: null, QBO_ENV: 'production' });
  var pinnedQbo = { packaged: true, pricebookVersion: '2026-10', billingProvider: 'quickbooks', paymentProvider: 'quickbooks', qboCustomerId: 'C1', qboRealmId: '9130000000000000' };
  check(allowed(ctx(old, pinnedQbo), 'quickbooks') === true, 'live QuickBooks: a pinned 2026-10 workspace keeps renewing');
  check(allowed(ctx(book('2026-10', true, 'sandbox'), pinnedQbo), 'quickbooks') !== true, 'live QuickBooks: never on a sandbox-company book');

  /* SANDBOX through Stripe: a marked tenant, the same pin rule */
  env({ PACKAGING_PROVIDER: 'stripe', PACKAGING_LIVE: null, STRIPE_SECRET_KEY: 'sk_test_fixture', QBO_ENV: null });
  check(allowed(ctx(old, pinnedOld, { status: 'active', packagingSandbox: true }), 'stripe') === true, 'sandbox Stripe: a pinned old book keeps billing a marked tenant');
  check(allowed(ctx(old, { packaged: true, billingProvider: 'stripe' }, { status: 'active', packagingSandbox: true }), 'stripe') !== true, 'sandbox Stripe: and is never a new package\'s');

  /* reconcile still reads any earlier book */
  env({ PACKAGING_LIVE: 'true', STRIPE_SECRET_KEY: 'sk_live_fixture' });
  var reading = (function () { try { S.guard(ctx(old, { packaged: true, pricebookVersion: '2026-09' }), 'stripe', true); return true; } catch (e) { return e.message; } })();
  check(reading === true, 'reading an invoice under an earlier book is unchanged');
  console.log('tbookpin: ' + n + ' checks passed');
} finally {
  env(saved);
}
