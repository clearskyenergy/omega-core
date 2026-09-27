/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * POST /api/stripe-customer — Plan & billing's Payment method, through Stripe
 * (api/_lib/stripe-customer.js). An owner or administrator of the workspace,
 * or verified ClearSky staff acting for it:
 *   { action: 'view' }    the rail, the card on file read back from Stripe,
 *                         whether a card can be added and the amount due paid
 *   { action: 'card' }    { url } Stripe's "add a payment method" page; links
 *                         the workspace's Stripe customer first when a plan
 *                         billed outside the package engine has none
 *   { action: 'portal' }  { url } the Stripe customer portal (cards, invoices)
 *   { action: 'pay' }     { url } Stripe's page for the amount ClearSky set as due
 *   { action: 'check' }   "I've paid": reads that invoice back from Stripe
 * Every page is Stripe's own and comes back to /workspace#billing; a card is
 * never typed on ours. Members read billing/current and see the rest.
 */
'use strict';
var A = require('./_lib/admin'), SC = require('./_lib/stripe-customer');
var ACTIONS = ['view', 'card', 'portal', 'pay', 'check'];
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var caller = await A.authenticate(req), input = req.body || {};
  if (Object.keys(input).some(function (k) { return ['orgId', 'action'].indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported field');
  var orgId = A.safeOrg(input.orgId || caller.orgId), action = input.action || 'view';
  if (!orgId) throw A.httpError(400, 'Valid organization required');
  if (ACTIONS.indexOf(action) < 0) throw A.httpError(400, 'Action must be ' + ACTIONS.join(', '));
  if (!caller.staff) {
    if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Verified email required');
    if (orgId !== caller.orgId) throw A.httpError(403, 'Own organization required');
  }
  if (!(await A.isTenantAdmin(caller, orgId))) throw A.httpError(403, 'An owner or administrator of the workspace manages its card');
  var deps = module.exports.deps || {};
  return SC.run(A.db(), orgId, action, caller, { stripe: deps.stripe || SC.client(), mail: deps.mail, host: req.headers && req.headers.host, now: Date.now() });
});
/* tests hand the endpoint a Stripe double and a mailer here */
module.exports.deps = null;
