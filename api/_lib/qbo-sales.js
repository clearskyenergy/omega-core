/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Explicit, idempotent accounting writes. Never initiates a bank payout. */
'use strict';
var A = require('./admin'), Q = require('./qbo'), P = require('./logic-policy');
async function request(path, body, requestId, realm) {
  var auth = await Q.accessToken();
  if (!realm || String(auth.realmId) !== String(realm)) throw A.httpError(409, 'ClearSky QuickBooks company does not match this order');
  var url = Q.API_BASE + '/v3/company/' + encodeURIComponent(auth.realmId) + '/' + path;
  url += (url.indexOf('?') < 0 ? '?' : '&') + 'minorversion=75';
  if (requestId) url += '&requestid=' + encodeURIComponent(requestId);
  var r = await fetch(url, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + auth.token, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  var j = await r.json();
  if (!r.ok || j.Fault) throw A.httpError(502, 'QuickBooks request failed (' + r.status + '); review the integration and retry');
  return j;
}
async function customer(order, realm) {
  var email = String(order.customer.email).toLowerCase();
  var display = 'OMEGA-' + P.key(order.orgId + ':' + email).slice(0, 28);
  var query = await request('query?query=' + encodeURIComponent("select * from Customer where DisplayName = '" + display + "'"), null, null, realm);
  var found = (query.QueryResponse || {}).Customer || [];
  if (found.length) return String(found[0].Id);
  var r = await request('customer', { DisplayName: display, CompanyName: String(order.customer.company || order.customer.name || '').slice(0, 100),
    PrimaryEmailAddr: { Address: email } }, P.key('customer:' + realm + ':' + display), realm);
  return String(r.Customer.Id);
}
async function invoice(order, stage) {
  var l = order.logic, plan = l.invoices[stage];
  var buyer = l.customerRef || await customer(order, l.realmId);
  var depositFee = Math.round(l.commercial.depositCents * l.commercial.feeCents / l.commercial.totalCents);
  var feeCents = stage === 'deposit' ? depositFee : l.commercial.feeCents - depositFee;
  var lines = [{ Amount: (plan.amountCents - feeCents) / 100, Description: order.orderNo + ' — ' + stage + ' installment',
    DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { ItemRef: { value: l.itemRef }, Qty: 1,
      UnitPrice: (plan.amountCents - feeCents) / 100, TaxCodeRef: { value: 'NON' } } }];
  if (feeCents) lines.push({ Amount: feeCents / 100, Description: 'ClearSky order processing fee — ' + stage,
    DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { ItemRef: { value: l.itemRef }, Qty: 1, UnitPrice: feeCents / 100, TaxCodeRef: { value: 'NON' } } });
  var due = new Date(plan.date + 'T12:00:00Z'); due.setUTCDate(due.getUTCDate() + l.commercial.terms.dueDays);
  var r = await request('invoice', {
    CustomerRef: { value: buyer }, CurrencyRef: { value: 'USD' }, TxnDate: plan.date, DueDate: due.toISOString().slice(0, 10),
    BillEmail: { Address: order.customer.email }, AllowOnlineACHPayment: true, AllowOnlineCreditCardPayment: true,
    PrivateNote: 'OMEGA ' + order.orgId + ' / ' + order.orderNo + ' / ' + stage,
    CustomerMemo: { value: (stage === 'deposit' ? 'Order deposit' : 'Order balance') + ' — ' + order.orderNo },
    Line: lines
  }, plan.requestId, l.realmId);
  return { id: String(r.Invoice.Id), customerRef: buyer };
}
async function reconcile(order, stage) {
  var l = order.logic, plan = l.invoices[stage];
  var r = await request('invoice/' + encodeURIComponent(plan.id) + '?include=invoiceLink', null, null, l.realmId);
  var inv = r.Invoice, ids = [];
  (inv.LinkedTxn || []).forEach(function (link) {
    if (link.TxnType === 'Payment' && ids.indexOf(String(link.TxnId)) < 0) ids.push(String(link.TxnId));
  });
  if (ids.length > 40) throw A.httpError(409, 'Too many payment allocations; reconcile this invoice manually');
  var payments = await Promise.all(ids.map(async function (id) { return (await request('payment/' + encodeURIComponent(id), null, null, l.realmId)).Payment; }));
  return P.receipt(inv, payments, plan.amountCents, l.customerRef);
}
module.exports = { request: request, invoice: invoice, reconcile: reconcile };
