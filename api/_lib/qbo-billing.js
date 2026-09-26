/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Subscription accounting in the ONE QuickBooks company the mode names
 * (api/_lib/packaging-mode.js): the pinned sandbox, or the production company
 * only under PACKAGING_LIVE=true with QBO_ENV=production. Every call passes
 * qbo-items' guard first. No OAuth operations, payment creation or tax
 * calculation, and never a fallback from one company to the other.
 */
'use strict';
var crypto = require('crypto'), I = require('./qbo-items'), BP = require('./billing-profile'), Policy = require('./logic-policy');
function fail(message) { var e = new Error(message); e.status = 409; throw e; }
function key(value) { return crypto.createHash('sha256').update(value).digest('hex').slice(0, 48); }
function dependencies() { return { Q: require('./qbo'), request: require('./qbo-sales').request }; }
function cents(value) {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) fail('Invalid QuickBooks amount');
  return Math.round(value * 100);
}
function matches(wanted, actual) {
  if (wanted === null || wanted === '') return actual == null || actual === '';
  if (wanted && typeof wanted === 'object') return Object.keys(wanted).every(function (k) { return matches(wanted[k], actual && actual[k]); });
  return wanted === actual;
}
function driver(book, supplied) {
  var deps = supplied || dependencies(), realm = book.qbo && book.qbo.realmId;
  async function call(path, body, id) { await I.guard(book, realm, deps); return deps.request(path, body, id, realm); }
  async function customer(orgId, profile, existingId) {
    var wanted = BP.customer(profile, orgId), found;
    if (existingId) found = (await call('customer/' + encodeURIComponent(existingId))).Customer;
    else {
      var sql = "select * from Customer where DisplayName = '" + wanted.DisplayName.replace(/'/g, "\\'") + "' and Active IN (true, false)";
      var rows = ((await call('query?query=' + encodeURIComponent(sql))).QueryResponse || {}).Customer || [];
      if (rows.length > 1) fail('Ambiguous sandbox customer'); found = rows[0];
    }
    if (found && (found.DisplayName !== wanted.DisplayName || found.Active === false || !found.Id)) fail('Sandbox customer needs review');
    if (found) {
      if (!profile.website && found.WebAddr) wanted.WebAddr = null;
      if (!profile.resaleNumber && found.ResaleNum) wanted.ResaleNum = null;
      wanted.Id = String(found.Id); wanted.SyncToken = found.SyncToken; wanted.sparse = true;
      var same = Object.keys(wanted).filter(function (k) { return ['Id', 'SyncToken', 'sparse'].indexOf(k) < 0; }).every(function (k) { return matches(wanted[k], found[k]); });
      if (same) return String(found.Id);
    }
    // Include the read revision: A → B → A is a new update, not a replay of
    // the original customer creation's cached request id.
    var id = key('package-customer:' + realm + ':' + orgId + ':' + JSON.stringify(wanted));
    var result = (await call('customer', wanted, id)).Customer;
    if (!result || !result.Id || result.DisplayName !== wanted.DisplayName) fail('Sandbox customer was not confirmed');
    var confirmed = (await call('customer/' + encodeURIComponent(result.Id))).Customer;
    if (!confirmed || Object.keys(wanted).filter(function (k) { return ['Id', 'SyncToken', 'sparse'].indexOf(k) < 0; }).some(function (k) { return !matches(wanted[k], confirmed[k]); })) fail('QuickBooks did not confirm the billing profile update; review the customer');
    return String(result.Id);
  }
  async function lines(plan) {
    var rows = [];
    for (var i = 0; i < plan.lines.length; i++) {
      var l = plan.lines[i], itemId = book.qbo.items[l.itemKey];
      if (!itemId) fail('Sync sandbox item first: ' + l.itemKey);
      if (l.amountCents < 0) {
        // Intuit represents an invoice discount as DiscountLineDetail, not
        // a negative sales item. The price-book credit item stays the label.
        rows.push({ Amount: -l.amountCents / 100, Description: l.name, DetailType: 'DiscountLineDetail', DiscountLineDetail: { PercentBased: false } });
      } else if (l.amountCents > 0) {
        var item = (await call('item/' + encodeURIComponent(itemId))).Item;
        if (!item || String(item.Id) !== String(itemId) || item.Active === false) fail('Sandbox item unavailable: ' + l.itemKey);
        var tax = item.SalesTaxCodeRef && item.SalesTaxCodeRef.value;
        if (!tax && typeof item.Taxable === 'boolean') tax = item.Taxable ? 'TAX' : 'NON';
        if (!tax) fail('Choose the item tax treatment in QuickBooks first');
        var description = l.name + (Array.isArray(l.modules) && l.modules.length ? ' · includes ' + l.modules.map(function (k) { return require('./modules').get(k).name; }).join(', ') : '');
        rows.push({ Amount: l.amountCents / 100, Description: description.slice(0, 4000), DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: { ItemRef: { value: String(itemId) }, Qty: 1, UnitPrice: l.amountCents / 100, TaxCodeRef: { value: String(tax) } } });
      }
    }
    if (!rows.length) fail('Invoice must contain a paid subscription');
    return rows;
  }
  function validateInvoice(inv, plan, customerId) {
    if (!inv || !inv.Id || String((inv.CustomerRef || {}).value) !== String(customerId) ||
        ((inv.CurrencyRef || {}).value || 'USD') !== 'USD' || inv.PrivateNote !== plan.marker) fail('Subscription invoice identity changed');
    // QuickBooks may re-sequence lines (discounts move after the subtotal),
    // so compare as a multiset of (type, item, amount), not by position.
    var expected = plan.lines.filter(function (l) { return l.amountCents !== 0; })
      .map(function (l) { return (l.amountCents < 0 ? 'discount' : 'item:' + book.qbo.items[l.itemKey]) + ':' + Math.abs(l.amountCents); }).sort();
    var actual = (inv.Line || []).filter(function (l) { return l.DetailType === 'SalesItemLineDetail' || l.DetailType === 'DiscountLineDetail'; })
      .map(function (a) { return (a.DetailType === 'DiscountLineDetail' ? 'discount' : 'item:' + String(((a.SalesItemLineDetail || {}).ItemRef || {}).value)) + ':' + cents(a.Amount); }).sort();
    if (expected.length !== actual.length || expected.some(function (e, i) { return e !== actual[i]; })) fail('Subscription invoice lines changed; accounting review required');
    return inv;
  }
  async function invoice(plan, profile, customerId) {
    var number = 'OP-' + key(plan.marker).slice(0, 16);
    var found = ((await call('query?query=' + encodeURIComponent("select * from Invoice where DocNumber = '" + number + "'"))).QueryResponse || {}).Invoice || [];
    if (found.length > 1) fail('Duplicate subscription invoice number');
    var inv = found[0];
    if (!inv) {
      var payload = { CustomerRef: { value: customerId }, CurrencyRef: { value: 'USD' }, DocNumber: number,
        TxnDate: plan.date, DueDate: plan.date, BillEmail: { Address: profile.email },
        AllowOnlineACHPayment: true, AllowOnlineCreditCardPayment: true, PrivateNote: plan.marker,
        CustomerMemo: { value: (plan.kind === 'change' ? 'OMEGA subscription change ' : plan.kind === 'pack' ? 'OMEGA usage pack ' : 'OMEGA subscription ') + plan.period.start + ' to ' + plan.period.end + (profile.poRequired ? ' · PO ' + profile.poNumber : '') + (plan.memo ? ' · ' + plan.memo : '') },
        Line: await lines(plan) };
      if (profile.apEmail) payload.BillEmailCc = { Address: profile.apEmail };
      inv = (await call('invoice', payload, key(plan.marker))).Invoice;
    }
    validateInvoice(inv, plan, customerId);
    var complete = (await call('invoice/' + encodeURIComponent(inv.Id) + '?include=invoiceLink')).Invoice;
    validateInvoice(complete, plan, customerId);
    return { id: String(inv.Id), totalCents: cents(complete.TotalAmt), payUrl: Policy.paymentLink(complete.InvoiceLink || complete.invoiceLink) };
  }
  async function reconcile(record) {
    var inv = (await call('invoice/' + encodeURIComponent(record.qboInvoiceId) + '?include=invoiceLink')).Invoice;
    if (!inv || String(inv.Id) !== String(record.qboInvoiceId)) fail('Subscription invoice not found');
    if (String((inv.CustomerRef || {}).value) !== String(record.qboCustomerId)) fail('Subscription customer mismatch');
    if (/voided/i.test(inv.PrivateNote || '') || inv.status === 'Deleted' || inv.status === 'Voided') return { satisfied: false, reversed: true, paidCents: 0, payUrl: null };
    validateInvoice(inv, record, record.qboCustomerId);
    var ids = [];
    (inv.LinkedTxn || []).forEach(function (l) { if (l.TxnType === 'Payment' && ids.indexOf(String(l.TxnId)) < 0) ids.push(String(l.TxnId)); });
    if (ids.length > 40) fail('Too many payment allocations; accounting review required');
    var payments = [];
    for (var i = 0; i < ids.length; i++) payments.push((await call('payment/' + encodeURIComponent(ids[i]))).Payment);
    return Policy.receipt(inv, payments, record.totalCents, record.qboCustomerId);
  }
  return { customer: customer, invoice: invoice, reconcile: reconcile, guard: function () { return I.guard(book, realm, deps); } };
}
module.exports = { driver: driver, key: key };
