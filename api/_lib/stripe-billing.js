/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Subscription billing through Stripe (2026-09-27, Tommy: "a customer creates
 * an account, they add billing and that's all done through Stripe, and once
 * they do that it needs to allow them to use what they paid for").
 *
 * The SAME three calls as the QuickBooks driver (qbo-billing.js), so the
 * engine (package-billing, plan-change) does not change its mind about
 * anything: the server prices every line from the book, Stripe is handed
 * amounts, never a price list, and access still follows ONE rule
 * (package-billing.accessAfterInvoices) from what reconcile reads back.
 *
 *   customer(orgId, profile, existingId)  one Stripe customer per workspace,
 *        metadata.omegaOrg = the org, found again by the billing email and
 *        that mark, so a retry never makes a second one.
 *   invoice(plan, profile, customerId)    a Stripe invoice (send_invoice) with
 *        one item per plan line, metadata.omegaMarker = the plan's marker,
 *        found again by that marker, finalized, emailed by Stripe; its
 *        hosted_invoice_url is the card page. The card is entered on
 *        Stripe's page, never on ours.
 *   reconcile(record)                     reads the invoice back: paid,
 *        open (with what was paid), or reversed (void, uncollectible, a
 *        refund or a post-payment credit note covering the payment).
 *
 * Every call checks the mode first (packaging-mode: a TEST key in the
 * sandbox, a LIVE key only under PACKAGING_LIVE=true) and every object's
 * livemode against it: a test customer is never billed from live, nor the
 * other way round. The guard's refusals are ClearSky's, never the invoice's
 * (e.clearsky): reconcile keeps the record as it was and retries.
 *
 * api/stripe-webhook.js sends every OMEGA package invoice event here
 * (eventOrg) and runs the engine's reconcile at once, so a paid card opens
 * the workspace within seconds; the hourly runner and "I've paid" are the
 * same reconcile, so a lost webhook only delays, never decides.
 */
'use strict';
var crypto = require('crypto'), BP = require('./billing-profile'), M = require('./modules'), Mode = require('./packaging-mode');
function fail(message, clearsky) { var e = new Error(message); e.status = 409; if (clearsky) e.clearsky = true; throw e; }
function key(value) { return crypto.createHash('sha256').update(value).digest('hex').slice(0, 48); }
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function dependencies() { return { stripe: require('stripe')(process.env.STRIPE_SECRET_KEY) }; }
/* Stripe's hosted invoice page and nothing else is a pay link */
function payLink(value) {
  try { var u = new URL(value); return u.protocol === 'https:' && u.hostname === 'invoice.stripe.com' && !u.username && !u.password ? u.href : null; }
  catch (e) { return null; }
}
/* the billing profile's free-text country, as Stripe's two letters (a US
   spelling reads US; anything else not two letters is left off) */
function country(value) {
  var v = String(value || '').trim();
  if (/^(us|usa|u\.?s\.?a?\.?|united states( of america)?)$/i.test(v)) return 'US';
  return /^[a-z]{2}$/i.test(v) ? v.toUpperCase() : null;
}
function wanted(profile, orgId) {
  var p = BP.normalize(profile), a = p.address, address = { line1: a.line1, city: a.city, state: a.state, postal_code: a.postalCode };
  /* Stripe refuses an empty string it cannot unset: a blank line 2 or country is left off */
  if (a.line2) address.line2 = a.line2;
  var c = country(a.country); if (c) address.country = c;
  return { name: p.legalName, email: p.email, phone: p.phone, address: address, tax_exempt: p.taxExempt ? 'exempt' : 'none',
    metadata: { omegaOrg: orgId, omegaPackage: 'true', contactName: p.contactName } };
}
/* the fields we set, as Stripe returns them, to tell whether an update is needed */
function facts(c) {
  var a = c.address || {};
  return { name: c.name || null, email: c.email || null, phone: c.phone || null, tax_exempt: c.tax_exempt || 'none',
    address: { line1: a.line1 || null, line2: a.line2 || null, city: a.city || null, state: a.state || null, postal_code: a.postal_code || null, country: a.country || null },
    metadata: { omegaOrg: (c.metadata || {}).omegaOrg || null, omegaPackage: (c.metadata || {}).omegaPackage || null, contactName: (c.metadata || {}).contactName || null } };
}
function describe(l) {
  return (l.name + (Array.isArray(l.modules) && l.modules.length ? ' · includes ' + l.modules.map(function (k) { var m = M.get(k); return m ? m.name : k; }).join(', ') : '')
    + (l.quantity > 1 ? ' × ' + l.quantity : '')).slice(0, 500);
}
function memo(plan, profile) {
  return ((plan.kind === 'change' ? 'OMEGA subscription change ' : plan.kind === 'pack' ? 'OMEGA usage pack ' : 'OMEGA subscription ') + plan.period.start + ' to ' + plan.period.end
    + (profile.poRequired ? ' · PO ' + profile.poNumber : '') + (plan.memo ? ' · ' + plan.memo : '')).slice(0, 500);
}
function driver(book, supplied) {
  var deps = supplied || dependencies(), S = deps.stripe, livemode = Mode.live('stripe');
  /* the mode, before any call: a TEST key in the sandbox, a LIVE key only under the live switch */
  function guard() {
    if (!Mode.open('stripe')) fail('Packaging billing through Stripe needs a Stripe test key, or PACKAGING_LIVE=true with a live key', true);
    if (!S) fail('Stripe is not configured', true);
  }
  function same(obj, what) { if (!obj || obj.livemode !== livemode) fail('Stripe ' + what + ' is in ' + (obj && obj.livemode ? 'live' : 'test') + ' mode; this deployment bills in ' + (livemode ? 'live' : 'test') + ' mode', true); return obj; }
  async function customer(orgId, profile, existingId) {
    guard();
    var want = wanted(profile, orgId), found = null;
    if (existingId) {
      found = await S.customers.retrieve(existingId);
      if (!found || found.deleted) fail('Stripe customer needs review');
    } else {
      var rows = ((await S.customers.list({ email: want.email, limit: 100 })) || {}).data || [];
      var mine = rows.filter(function (c) { return !c.deleted && (c.metadata || {}).omegaOrg === orgId; });
      if (mine.length > 1) fail('More than one Stripe customer is marked for ' + orgId + '; review');
      found = mine[0] || null;
    }
    if (found) {
      same(found, 'customer');
      var mark = (found.metadata || {}).omegaOrg || (found.metadata || {}).orgId;
      if (mark !== orgId) fail('Stripe customer ' + found.id + ' belongs to another workspace; review');
      var now = facts(found), then = facts(Object.assign({}, found, want, { metadata: Object.assign({}, found.metadata, want.metadata) }));
      if (stable(now) === stable(then)) return String(found.id);
      /* the read revision is in the key: A → B → A is a new update, never a replay of the first */
      var updated = await S.customers.update(found.id, want, { idempotencyKey: key('omega-customer-update:' + found.id + ':' + stable(now) + ':' + stable(want)) });
      if (!updated || updated.id !== found.id) fail('Stripe did not confirm the billing profile update; review the customer');
      return String(updated.id);
    }
    var created = await S.customers.create(want, { idempotencyKey: key('omega-customer:' + (livemode ? 'live' : 'test') + ':' + orgId + ':' + stable(want)) });
    same(created, 'customer');
    if (!created || !created.id || (created.metadata || {}).omegaOrg !== orgId) fail('Stripe customer was not confirmed');
    return String(created.id);
  }
  /* what the invoice must carry: its customer, dollars, our marker and the plan's non-zero lines as a multiset of amounts */
  function expected(plan) { return plan.lines.filter(function (l) { return l.amountCents !== 0; }).map(function (l) { return l.amountCents; }).sort(function (a, b) { return a - b; }); }
  async function linesOf(inv) {
    var out = [], page = await S.invoices.listLineItems(inv.id, { limit: 100 });
    (page && page.data || []).forEach(function (l) { out.push(l); });
    if (page && page.has_more) fail('Too many invoice lines; accounting review required');
    return out;
  }
  async function validate(inv, plan, customerId) {
    same(inv, 'invoice');
    if (!inv || !inv.id || String(inv.customer) !== String(customerId) || String(inv.currency || '').toLowerCase() !== 'usd' || (inv.metadata || {}).omegaMarker !== plan.marker) fail('Subscription invoice identity changed');
    var want = expected(plan), got = (await linesOf(inv)).map(function (l) { return l.amount; }).sort(function (a, b) { return a - b; });
    if (want.length !== got.length || want.some(function (v, i) { return v !== got[i]; })) fail('Subscription invoice lines changed; accounting review required');
    return inv;
  }
  async function find(plan, customerId) {
    var rows = ((await S.invoices.list({ customer: customerId, limit: 100 })) || {}).data || [];
    var mine = rows.filter(function (i) { return (i.metadata || {}).omegaMarker === plan.marker && i.status !== 'void'; });
    if (mine.length > 1) fail('Duplicate subscription invoice for ' + plan.marker + '; review');
    return mine[0] || null;
  }
  async function invoice(plan, profile, customerId) {
    guard();
    if (!expected(plan).length) fail('Invoice must contain a paid subscription');
    /* the workspace is the customer's mark: the invoice carries it, so the webhook knows whose it is */
    var owner = await S.customers.retrieve(customerId);
    if (!owner || owner.deleted) fail('Stripe customer ' + customerId + ' needs review');
    same(owner, 'customer');
    var org = (owner.metadata || {}).omegaOrg;
    if (!org) fail('Stripe customer ' + customerId + ' is not an OMEGA workspace; review');
    var inv = await find(plan, customerId), created = false;
    if (!inv) {
      var body = { customer: customerId, collection_method: 'send_invoice', days_until_due: 1, currency: 'usd', auto_advance: false,
        pending_invoice_items_behavior: 'exclude', description: memo(plan, profile),
        metadata: { omegaPackage: 'true', omegaOrg: org, omegaMarker: plan.marker, omegaKind: plan.kind || 'subscription', omegaDate: plan.date } };
      if (profile.poRequired && profile.poNumber) body.custom_fields = [{ name: 'PO', value: String(profile.poNumber).slice(0, 30) }];
      inv = await S.invoices.create(body, { idempotencyKey: key('omega-invoice:' + (livemode ? 'live' : 'test') + ':' + plan.marker) });
      created = true;
    }
    same(inv, 'invoice');
    if (inv.status === 'draft') {
      /* the lines not yet on the draft (a retry adds only what is missing), then finalize */
      var have = {}; (await linesOf(inv)).forEach(function (l) { var i = (l.metadata || {}).omegaLine; if (i != null) have[i] = true; });
      for (var i = 0; i < plan.lines.length; i++) {
        var l = plan.lines[i]; if (l.amountCents === 0 || have[String(i)]) continue;
        await S.invoiceItems.create({ customer: customerId, invoice: inv.id, amount: l.amountCents, currency: 'usd', description: describe(l),
          metadata: { omegaMarker: plan.marker, omegaLine: String(i), itemKey: String(l.itemKey || '') } }, { idempotencyKey: key('omega-line:' + inv.id + ':' + i) });
      }
      inv = await S.invoices.finalizeInvoice(inv.id, { auto_advance: false }, { idempotencyKey: key('omega-finalize:' + inv.id) });
    }
    await validate(inv, plan, customerId);
    /* Stripe emails its own invoice with the Pay button to the billing
       address, once, when the invoice was made here; OMEGA's own mail
       carries the link too. Best effort: a refusal changes nothing. */
    if (created) { try { await S.invoices.sendInvoice(inv.id, {}, { idempotencyKey: key('omega-send:' + inv.id) }); } catch (e) {} }
    var url = payLink(inv.hosted_invoice_url);
    return { id: String(inv.id), totalCents: inv.total, payUrl: url, payLinkMissing: !url };
  }
  async function reconcile(record) {
    guard();
    var inv = await S.invoices.retrieve(record.stripeInvoiceId);
    if (!inv || String(inv.id) !== String(record.stripeInvoiceId)) fail('Subscription invoice not found');
    same(inv, 'invoice');
    if (String(inv.customer) !== String(record.stripeCustomerId)) fail('Subscription customer mismatch');
    if (inv.status === 'void' || inv.status === 'uncollectible') return { satisfied: false, reversed: true, paidCents: 0, payUrl: null };
    await validate(inv, record, record.stripeCustomerId);
    if (inv.total !== record.totalCents) fail('Subscription invoice total changed; accounting review required');
    var paid = inv.amount_paid || 0, refunded = inv.post_payment_credit_notes_amount || 0;
    /* money that came back: a refund on the charge, or a credit note issued after payment */
    if (paid > 0 && inv.charge) {
      var charge = typeof inv.charge === 'string' ? await S.charges.retrieve(inv.charge) : inv.charge;
      if (charge && charge.amount_refunded) refunded = Math.max(refunded, charge.amount_refunded);
      if (charge && charge.dispute && charge.disputed) fail('The payment on ' + inv.id + ' is disputed; accounting review required');
    }
    if (inv.status === 'paid' && paid > 0 && refunded >= paid) return { satisfied: false, reversed: true, paidCents: 0, payUrl: null };
    var net = Math.max(0, paid - refunded);
    return { satisfied: inv.status === 'paid' && net >= record.totalCents, reversed: false, paidCents: Math.min(record.totalCents, net),
      payUrl: inv.status === 'open' ? payLink(inv.hosted_invoice_url) : null };
  }
  return { provider: 'stripe', name: 'Stripe', customer: customer, invoice: invoice, reconcile: reconcile, guard: guard };
}
/* The workspace a Stripe event is about, when it is an OMEGA package
   invoice (metadata written by invoice() above); null for everything else,
   which api/stripe-webhook.js handles exactly as before. */
function eventOrg(evt) {
  var o = evt && evt.data && evt.data.object;
  if (!o || o.object !== 'invoice' || !/^invoice\./.test(evt.type || '')) return null;
  var m = o.metadata || {};
  return m.omegaPackage === 'true' && typeof m.omegaOrg === 'string' && /^[a-z0-9.-]{3,253}$/.test(m.omegaOrg) ? m.omegaOrg : null;
}
module.exports = { driver: driver, eventOrg: eventOrg, payLink: payLink, country: country, wanted: wanted, key: key };
