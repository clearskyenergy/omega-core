/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Which rail a workspace's subscription invoices go through, and the ONE set
 * of names its records carry. The engine (package-billing, plan-change, the
 * billing profile) asks here and never names a provider itself.
 *
 *   providerOf(billing)  a workspace stays on the provider its customer
 *                        record was made on: Stripe once it holds a Stripe
 *                        package customer, QuickBooks once it holds a
 *                        QuickBooks one, else the deployment's rail
 *                        (packaging-mode.provider(): Stripe under
 *                        PACKAGING_PROVIDER=stripe, else QuickBooks). A legacy tenant's
 *                        own stripeCustomerId (Stripe tiers, stripe-create)
 *                        does not bind it: only billingProvider 'stripe' on a
 *                        packaged record does.
 *   invoice records      { provider, stripeInvoiceId, stripeCustomerId } or
 *                        { provider, qboInvoiceId, qboCustomerId }; a record
 *                        written before providers had a name is QuickBooks'.
 */
'use strict';
var Mode = require('./packaging-mode');
var NAMES = { stripe: 'Stripe', quickbooks: 'QuickBooks' };
function providerOf(billing) {
  var b = billing || {};
  if (b.packaged === true && b.billingProvider === 'stripe' && b.stripeCustomerId) return 'stripe';
  if (b.qboCustomerId) return 'quickbooks';
  return Mode.provider();
}
function name(provider) { return NAMES[provider] || NAMES[Mode.provider()]; }
function customerId(billing, provider) { var b = billing || {}; return (provider === 'stripe' ? b.stripeCustomerId : b.qboCustomerId) || null; }
/* the customer binding still names this deployment's account: the same
   Stripe mode, or the same QuickBooks company */
function bound(billing, provider, book) {
  var b = billing || {};
  if (provider === 'stripe') return !!b.stripeCustomerId && b.stripeLivemode === Mode.live('stripe');
  return !!b.qboCustomerId && b.qboRealmId === (book && book.qbo && book.qbo.realmId);
}
function customerFields(provider, id, book) {
  return provider === 'stripe'
    ? { billingProvider: 'stripe', paymentProvider: 'stripe', stripeCustomerId: id, stripeLivemode: Mode.live('stripe') }
    : { billingProvider: 'quickbooks', paymentProvider: 'quickbooks', qboCustomerId: id, qboRealmId: book.qbo.realmId };
}
function recordProvider(r) { return r && (r.provider === 'stripe' || r.stripeInvoiceId) ? 'stripe' : 'quickbooks'; }
function invoiceId(r) { return (r && (r.stripeInvoiceId || r.qboInvoiceId)) || null; }
function issued(r) { return !!invoiceId(r); }
function invoiceFields(provider, id, customer) {
  return provider === 'stripe' ? { provider: 'stripe', stripeInvoiceId: String(id), stripeCustomerId: customer }
    : { provider: 'quickbooks', qboInvoiceId: String(id), qboCustomerId: customer };
}
/* a subscription pay link is the provider's own page: QuickBooks'
   (intuit.com, logic-policy's pin) or Stripe's hosted invoice
   (invoice.stripe.com); anything else is not a link we hand out */
function payLink(url) { return require('./logic-policy').paymentLink(url) || require('./stripe-billing').payLink(url); }
/* deps are the caller's double for ONE provider (tests, the runner): a
   QuickBooks double never reaches the Stripe driver, nor the other way */
function driver(book, provider, deps) {
  if (provider === 'stripe') return require('./stripe-billing').driver(book, deps && deps.stripe ? deps : undefined);
  return require('./qbo-billing').driver(book, deps && deps.request ? deps : undefined);
}
module.exports = { providerOf: providerOf, name: name, customerId: customerId, bound: bound, customerFields: customerFields,
  recordProvider: recordProvider, invoiceId: invoiceId, issued: issued, invoiceFields: invoiceFields, driver: driver, payLink: payLink };
