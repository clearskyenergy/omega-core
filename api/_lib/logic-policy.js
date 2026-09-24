/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var crypto = require('crypto');
function fail(message) { var e = new Error(message); e.status = 400; throw e; }
function id(value) {
  var s = String(value || '');
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(s)) fail('Invalid record identifier');
  return s;
}
function cents(value) {
  if (value === null || value === '' || typeof value === 'boolean') fail('Amount required');
  var n = Number(value);
  if (!isFinite(n) || n < 0 || n > 100000000) fail('Invalid amount');
  return Math.round(n * 100);
}
function terms(defaults, overrides) {
  var out = { depositPct: 30, dueDays: 0 };
  [defaults, overrides].forEach(function (v) {
    if (v && v.dueDays == null && v.netDays != null) out.dueDays = Number(v.netDays);
    ['depositPct', 'dueDays'].forEach(function (k) {
      if (v && v[k] != null) out[k] = Number(v[k]);
    });
  });
  if (!isFinite(out.depositPct) || out.depositPct < 0 || out.depositPct > 100) fail('Deposit must be 0–100%');
  if (!Number.isInteger(out.dueDays) || out.dueDays < 0 || out.dueDays > 365) fail('Due days must be 0–365');
  return out;
}
function snapshot(total, defaults, overrides, fee) {
  var base = cents(total), t = terms(defaults, overrides);
  if (!base) fail('An approved customer price greater than zero is required');
  var rate = fee && fee.percent != null ? Number(fee.percent) : 0.25;
  var fixed = fee && fee.fixed != null ? cents(fee.fixed) : 0;
  if (rate != null && (!isFinite(rate) || rate < 0 || rate > 100)) fail('Fee must be 0–100%');
  var retained = Math.round(base * rate / 100) + fixed, amount = base + retained;
  var down = Math.round(amount * t.depositPct / 100);
  return { baseCents: base, totalCents: amount, depositCents: down, balanceCents: amount - down, currency: 'USD',
    terms: t, feeCents: retained, feePolicy: { percent: rate, fixedCents: fixed, mode: 'added_to_price' } };
}
function key(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40); }
function paymentLink(value) {
  try { var u = new URL(value); return u.protocol === 'https:' && /(^|\.)intuit\.com$/.test(u.hostname) && !u.username && !u.password ? u.href : null; }
  catch (e) { return null; }
}
function receipt(invoice, payments, expected, customerId) {
  if (!invoice || cents(invoice.TotalAmt) !== expected || String((invoice.CustomerRef || {}).value) !== String(customerId) ||
      ((invoice.CurrencyRef || {}).value || 'USD') !== 'USD') fail('QuickBooks invoice changed; reconciliation needs review');
  var paid = 0, ids = [];
  (payments || []).forEach(function (p) {
    if (!p || !p.Id || ids.indexOf(String(p.Id)) >= 0) return;
    if (String((p.CustomerRef || {}).value) !== String(customerId)) fail('Payment customer mismatch');
    if (((p.CurrencyRef || {}).value || 'USD') !== 'USD') fail('Payment currency mismatch');
    var applied = 0;
    (p.Line || []).forEach(function (line) {
      var links = line.LinkedTxn || [];
      if (links.some(function (l) { return l.TxnType === 'Invoice' && String(l.TxnId) === String(invoice.Id); })) {
        // Ambiguous split lines cannot prove this invoice's allocation.
        if (links.length !== 1) fail('Ambiguous QuickBooks payment allocation');
        applied += cents(line.Amount);
      }
    });
    if (applied > cents(p.TotalAmt)) fail('Invalid QuickBooks payment allocation');
    paid += applied; ids.push(String(p.Id));
  });
  paid = Math.min(expected, paid);
  return { paidCents: paid, paymentIds: ids, satisfied: paid >= expected && cents(invoice.Balance) === 0,
    balanceCents: cents(invoice.Balance), payUrl: paymentLink(invoice.InvoiceLink || invoice.invoiceLink) };
}
function quantities(items) {
  var out = Object.create(null);
  (items || []).forEach(function (it) {
    var sku = String(it.sku || ''), n = Number(it.qty);
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(sku) || ['__proto__', 'constructor', 'prototype'].indexOf(sku) >= 0 || !Number.isInteger(n) || n <= 0 || n > 10000) fail('Each item needs a SKU and whole-unit quantity (1–10000)');
    out[sku] = (out[sku] || 0) + n;
  });
  if (!Object.keys(out).length) fail('Add catalog items before accepting an order');
  return out;
}
function ready(unit) { return unit && unit.at === 'ready' && !unit.hold && !unit.ncr && unit.test && unit.test.result === 'pass'; }
function rootSerial(unit, units) {
  var current = unit, seen = {};
  while (current.parentSerial) {
    if (seen[current.serial]) fail('Genealogy cycle');
    seen[current.serial] = true;
    current = units.filter(function (u) { return u.serial === current.parentSerial; })[0];
    if (!current) fail('Missing component parent');
  }
  return current.serial;
}
module.exports = { id: id, cents: cents, terms: terms, snapshot: snapshot, key: key, paymentLink: paymentLink,
  receipt: receipt, quantities: quantities, ready: ready, rootSerial: rootSerial };
