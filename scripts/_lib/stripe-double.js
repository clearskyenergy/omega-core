/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * An in-memory Stripe for the packaging tests: the subset of the API that
 * api/_lib/stripe-billing.js calls (customers, invoices, invoice items,
 * charges), with Stripe's idempotency rule (the same key replays the first
 * answer; the same key with different parameters is refused), livemode on
 * every object, and the hosted invoice URL on invoice.stripe.com. The test
 * plays the customer with pay(), refund(), void() and edit(). Nothing here
 * reaches the network.
 *
 * And what api/_lib/stripe-customer.js adds: the customer portal
 * (billingPortal.sessions, its payment_method_update flow; `portalRefuses`
 * plays a portal nobody switched on), payment methods read back through
 * expand, voidInvoice, and saveCard(), the customer adding a card on
 * Stripe's page, which becomes the default for invoices as the flow does.
 */
'use strict';
function copy(x) { return JSON.parse(JSON.stringify(x)); }
function StripeDouble(options) {
  options = options || {};
  var self = this, seq = 0, keys = {};
  this.livemode = options.livemode === true;
  this.customers_ = {}; this.invoices_ = {}; this.items_ = {}; this.charges_ = {}; this.methods_ = {};
  this.calls = []; this.sent = []; this.sessions = [];
  function id(prefix) { seq++; return prefix + '_' + ('000000' + seq).slice(-6); }
  function fail(message, type) { var e = new Error(message); e.type = type || 'StripeInvalidRequestError'; e.statusCode = 400; throw e; }
  function missing(what) { var e = new Error('No such ' + what); e.type = 'StripeInvalidRequestError'; e.statusCode = 404; e.status = 404; throw e; }
  /* a call with an idempotency key answers the same the second time; different parameters under it are refused */
  function once(name, params, opts, make) {
    self.calls.push(name);
    var k = opts && opts.idempotencyKey;
    if (!k) return copy(make());
    var body = JSON.stringify(params);
    if (keys[k]) { if (keys[k].body !== body) fail('Keys for idempotent requests can only be used with the same parameters', 'StripeIdempotencyError'); return copy(keys[k].result); }
    var result = make(); keys[k] = { body: body, result: copy(result) }; return copy(result);
  }
  function invoiceView(inv) {
    var lines = Object.keys(self.items_).map(function (k) { return self.items_[k]; }).filter(function (it) { return it.invoice === inv.id; });
    var total = lines.reduce(function (n, l) { return n + l.amount; }, 0);
    if (inv.status === 'draft') inv.total = total; else if (inv.total == null) inv.total = total;
    return inv;
  }
  this.customers = {
    list: async function (p) { self.calls.push('customers.list'); return { data: Object.keys(self.customers_).map(function (k) { return self.customers_[k]; }).filter(function (c) { return !p.email || c.email === p.email; }).map(copy), has_more: false }; },
    retrieve: async function (cid, p) {
      self.calls.push('customers.retrieve'); var c = self.customers_[cid]; if (!c) missing('customer: ' + cid);
      var out = copy(c), pm = out.invoice_settings && out.invoice_settings.default_payment_method;
      if (p && (p.expand || []).indexOf('invoice_settings.default_payment_method') >= 0 && typeof pm === 'string') out.invoice_settings.default_payment_method = copy(self.methods_[pm]);
      return out;
    },
    create: async function (p, o) { return once('customers.create', p, o, function () { var c = Object.assign({ id: id('cus'), object: 'customer', livemode: self.livemode }, copy(p)); self.customers_[c.id] = c; return c; }); },
    update: async function (cid, p, o) {
      return once('customers.update', { id: cid, p: p }, o, function () {
        var c = self.customers_[cid]; if (!c) missing('customer: ' + cid);
        var meta = Object.assign({}, c.metadata, p.metadata); Object.assign(c, copy(p)); c.metadata = meta; return c;
      });
    }
  };
  this.invoices = {
    list: async function (p) { self.calls.push('invoices.list'); return { data: Object.keys(self.invoices_).map(function (k) { return invoiceView(self.invoices_[k]); }).filter(function (i) { return i.customer === p.customer; }).map(copy), has_more: false }; },
    retrieve: async function (iid) { self.calls.push('invoices.retrieve'); var i = self.invoices_[iid]; if (!i) missing('invoice: ' + iid); return copy(invoiceView(i)); },
    create: async function (p, o) {
      return once('invoices.create', p, o, function () {
        if (!self.customers_[p.customer]) missing('customer: ' + p.customer);
        if (p.collection_method !== 'send_invoice' || !(p.days_until_due >= 1)) fail('A send_invoice invoice needs days_until_due');
        if (!self.customers_[p.customer].email) fail('Missing email. In order to create invoices that are sent to the customer, the customer must have a valid email.');
        var inv = Object.assign({ id: id('in'), object: 'invoice', livemode: self.livemode, status: 'draft', amount_paid: 0, post_payment_credit_notes_amount: 0, charge: null, hosted_invoice_url: null, total: 0,
          customer_email: self.customers_[p.customer].email, status_transitions: { paid_at: null } }, copy(p));
        self.invoices_[inv.id] = inv; return invoiceView(inv);
      });
    },
    listLineItems: async function (iid) {
      self.calls.push('invoices.listLineItems');
      if (!self.invoices_[iid]) missing('invoice: ' + iid);
      return { data: Object.keys(self.items_).map(function (k) { return self.items_[k]; }).filter(function (it) { return it.invoice === iid; })
        .map(function (it) { return { id: 'il_' + it.id, object: 'line_item', amount: it.amount, currency: it.currency, description: it.description, metadata: copy(it.metadata || {}) }; }), has_more: false };
    },
    finalizeInvoice: async function (iid, p, o) {
      return once('invoices.finalizeInvoice', { id: iid, p: p }, o, function () {
        var inv = self.invoices_[iid]; if (!inv) missing('invoice: ' + iid);
        if (inv.status !== 'draft') fail('This invoice is already finalized');
        invoiceView(inv); inv.status = inv.total === 0 ? 'paid' : 'open'; inv.number = 'OMEGA-' + iid.slice(-4);
        inv.hosted_invoice_url = options.noLink ? null : 'https://invoice.stripe.com/i/acct_double/' + iid; return invoiceView(inv);
      });
    },
    sendInvoice: async function (iid, p, o) { return once('invoices.sendInvoice', { id: iid }, o, function () { self.sent.push(iid); return invoiceView(self.invoices_[iid]); }); },
    voidInvoice: async function (iid, p, o) {
      return once('invoices.voidInvoice', { id: iid }, o, function () {
        var inv = self.invoices_[iid]; if (!inv) missing('invoice: ' + iid);
        if (inv.status !== 'open') fail('You can only void an open invoice'); inv.status = 'void'; return invoiceView(inv);
      });
    }
  };
  this.paymentMethods = {
    retrieve: async function (pid) { self.calls.push('paymentMethods.retrieve'); var m = self.methods_[pid]; if (!m) missing('payment_method: ' + pid); return copy(m); }
  };
  this.billingPortal = { sessions: { create: async function (p) {
    self.calls.push('billingPortal.sessions.create');
    if (options.portalRefuses) fail('No configuration provided and your ' + (self.livemode ? 'live' : 'test') + ' mode default configuration has not been created.');
    if (!self.customers_[p.customer]) missing('customer: ' + p.customer);
    if (!/^https?:\/\//.test(p.return_url || '')) fail('Not a valid URL');
    var s = { id: id('bps'), object: 'billing_portal.session', customer: p.customer, livemode: self.livemode, return_url: p.return_url, flow: p.flow_data ? copy(p.flow_data) : null, url: 'https://billing.stripe.com/p/session/test_' + seq };
    self.sessions.push(copy(s)); return copy(s);
  } } };
  this.invoiceItems = {
    create: async function (p, o) {
      return once('invoiceItems.create', p, o, function () {
        var inv = self.invoices_[p.invoice]; if (!inv) missing('invoice: ' + p.invoice);
        if (inv.status !== 'draft') fail('Invoice items can only be added to a draft invoice');
        if (!Number.isInteger(p.amount)) fail('Invalid amount');
        var it = Object.assign({ id: id('ii'), object: 'invoiceitem', livemode: self.livemode }, copy(p)); self.items_[it.id] = it; return it;
      });
    }
  };
  this.charges = {
    retrieve: async function (cid) { self.calls.push('charges.retrieve'); var c = self.charges_[cid]; if (!c) missing('charge: ' + cid); return copy(c); }
  };
  /* ── the customer's side ── */
  this.pay = function (iid) {
    var inv = self.invoices_[iid]; if (!inv || inv.status !== 'open') throw new Error('not payable: ' + iid);
    var ch = { id: id('ch'), object: 'charge', amount: inv.total, amount_refunded: 0, refunded: false, disputed: false, dispute: null, livemode: self.livemode };
    self.charges_[ch.id] = ch; inv.status = 'paid'; inv.amount_paid = inv.total; inv.charge = ch.id; inv.status_transitions = { paid_at: 1790000000 }; return inv;
  };
  /* the customer adds a card on Stripe's page (the portal's payment_method_update flow): it becomes the default for invoices */
  this.saveCard = function (cid, card) {
    var pm = { id: id('pm'), object: 'payment_method', type: 'card', customer: cid, livemode: self.livemode, card: Object.assign({ brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 }, card || {}) };
    self.methods_[pm.id] = pm; self.customers_[cid].invoice_settings = { default_payment_method: pm.id }; return pm.id;
  };
  this.refund = function (iid, cents) { var inv = self.invoices_[iid], ch = self.charges_[inv.charge]; ch.amount_refunded = cents == null ? ch.amount : cents; ch.refunded = ch.amount_refunded >= ch.amount; };
  this.dispute = function (iid) { var inv = self.invoices_[iid], ch = self.charges_[inv.charge]; ch.disputed = true; ch.dispute = 'dp_double'; };
  this.voidInvoice = function (iid) { self.invoices_[iid].status = 'void'; };
  this.uncollectible = function (iid) { self.invoices_[iid].status = 'uncollectible'; };
  /* someone edits an open invoice's line in the dashboard */
  this.edit = function (iid, cents) { var k = Object.keys(self.items_).filter(function (x) { return self.items_[x].invoice === iid; })[0]; self.items_[k].amount = cents; };
  this.all = function (kind) { var m = self[kind + '_']; return Object.keys(m).map(function (k) { return copy(m[k]); }); };
  /* the event Stripe would post for an invoice */
  this.event = function (type, iid) { return { id: id('evt'), type: type, created: 1790000000, data: { object: copy(invoiceView(self.invoices_[iid])) } }; };
}
module.exports = { StripeDouble: StripeDouble };
