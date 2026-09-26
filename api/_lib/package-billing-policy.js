/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Pure subscription lifecycle calculations. No browser math or side effects.
 */
'use strict';
var M = require('./modules'), P = require('./subscription-pricing'), R = require('./proration');
function fail(message) { var e = new Error(message); e.status = 409; throw e; }
function instant(v) { return typeof v === 'number' ? v : v && typeof v.toMillis === 'function' ? v.toMillis() : Date.parse(v); }
function trialDays(book, configured) {
  var n = configured == null ? book.policy.trialDays : Number(configured);
  if (!isFinite(n) || n < 0 || Math.floor(n) !== n) fail('Invalid trial configuration');
  return Math.min(n, book.policy.trialDays, 14);
}
function terms(input, book, now) {
  var serviceFee = input.serviceFee;
  if (serviceFee && serviceFee.mode === 'custom' && serviceFee.amountDollars !== undefined) serviceFee = Object.assign({}, serviceFee, { amountCents: P.dollarInput(serviceFee.amountDollars) });
  var credit = null;
  if (input.credit === true) credit = { pct: book.credit.pct, startsAt: new Date(now).toISOString(), endsAt: new Date(now + book.credit.days * R.DAY).toISOString() };
  else if (input.credit && typeof input.credit === 'object') credit = input.credit;
  var quote = P.quote(input.modules, book, { plan: input.plan, builders: input.builders, viewers: input.viewers, serviceFee: serviceFee, credit: credit, now: now });
  var interval = input.interval || 'monthly';
  if (['monthly', 'annual'].indexOf(interval) < 0) fail('Invalid billing interval');
  // Tommy's decision, 2026-09-26: annual prepay uses the 11-month price
  // without transformation credit. Keep the policy explicit in the book.
  if (interval === 'annual' && credit && book.policy.annualTransformationCredit !== true) fail('Annual prepay excludes the transformation credit');
  return { modules: quote.modules, monthlyCents: quote.monthlyCents, monthlyDisplay: quote.display.monthly, plan: quote.plan, pricebookVersion: book.version, builders: input.builders == null ? book.logins.builders : input.builders,
    viewers: input.viewers == null ? book.logins.viewers : input.viewers, serviceFee: quote.serviceFee, credit: credit, interval: interval };
}
function approve(org, billing, selected, book, now, configuredTrialDays) {
  if (org.status !== 'pending') fail('Only a pending organization can start its trial');
  if (org.packagingTrialUsedAt != null || billing.trialUsedAt != null || billing.trialStartedAt != null) fail('This organization has already used its trial');
  if (billing.trialEndsAt != null) fail('Existing trial dates must be preserved; review the legacy tenant separately');
  var signup = instant(org.signedUpAt);
  if (!isFinite(signup) || signup > now) fail('A valid original signup date is required');
  var days = trialDays(book, configuredTrialDays);
  if (billing.trialDurationDays != null) days = Math.min(days, trialDays(book, billing.trialDurationDays));
  var end = now + days * R.DAY, grants = M.resolve(selected.modules);
  // The credit window starts when paying starts (trial end), so the trial
  // never eats credit days. The book still bounds the window.
  if (selected.credit) selected = Object.assign({}, selected, { credit: Object.assign({}, selected.credit, { startsAt: new Date(end).toISOString(), endsAt: new Date(end + book.credit.days * R.DAY).toISOString() }) });
  return Object.assign({}, selected, grants, { subscription: subscription(selected, now), packaged: true, billingProvider: 'quickbooks', paymentProvider: 'quickbooks',
    qboEnv: 'sandbox', packagingState: days ? 'trial' : 'awaiting_payment', trialUsedAt: now, trialStartedAt: now, trialEndsAt: end,
    billingDay: new Date(signup).getUTCDate(), nextInvoiceOn: R.iso(end), subscriptionStartedAt: now,
    accessUntil: end, status: 'active', amountDue: 0, proposedPackage: null });
}
/* What the tenant BOUGHT. Written by approve/activate and by a paid change;
 * never by reconciliation, which only decides what is switched on. */
function subscription(selected, now) {
  return { modules: M.normalize(selected.modules), plan: selected.plan, interval: selected.interval || 'monthly',
    builders: selected.builders, viewers: selected.viewers, since: now };
}
function scaledLines(lines, numerator, denominator) {
  var out = lines.map(function (l) { return Object.assign({}, l, { quantity: 1, amountCents: Math.round(l.amountCents * numerator / denominator) }); });
  var target = Math.round(lines.reduce(function (n, l) { return n + l.amountCents; }, 0) * numerator / denominator);
  var rounded = out.reduce(function (n, l) { return n + l.amountCents; }, 0);
  if (out.length) out[0].amountCents += target - rounded;
  return out;
}
function invoice(billing, book, on) {
  R.date(on);
  // Modules and plan come from what the tenant bought (the subscription
  // record); interval and logins stay the operational terms staff set.
  var sub = billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription : { modules: billing.modules, plan: billing.plan };
  billing = Object.assign({}, billing, { plan: sub.plan || billing.plan });
  var selected = M.normalize(sub.modules), start = instant(billing.subscriptionStartedAt), first = billing.firstInvoiceOn == null;
  if (on !== billing.nextInvoiceOn) fail('Invoice must use the recorded next billing date');
  if (!isFinite(start)) fail('Subscription start is required');
  var feeStart = billing.firstInvoiceOn || on;
  var year = new Date(R.date(on)).getUTCFullYear() - new Date(R.date(feeStart)).getUTCFullYear() + 1;
  if (on < R.addYears(feeStart, year - 1) && year > 1) year--;
  var quote = P.quote(selected, book, { plan: billing.plan, builders: billing.builders, viewers: billing.viewers,
    serviceFee: billing.serviceFee, now: R.date(on), year: year });
  var c = R.cycle(on, billing.billingDay), partial = first && c.start !== on;
  var end = c.end, numerator = partial ? c.remainingDays : c.days, denominator = c.days;
  var interval = billing.interval || 'monthly';
  if (interval === 'annual' && !partial) {
    if (billing.credit && book.policy.annualTransformationCredit !== true) fail('Annual prepay excludes the transformation credit');
    var d = new Date(R.date(on)), y = d.getUTCFullYear() + 1, m = d.getUTCMonth();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    end = R.iso(Date.UTC(y, m, Math.min(billing.billingDay, last)));
    numerator = book.annualPaidMonths; denominator = 1;
  }
  var lines = scaledLines(quote.lines, numerator, denominator);
  var gross = lines.reduce(function (n, l) { return n + l.amountCents; }, 0), credit = billing.credit;
  if (credit) {
    // P.quote validates the signed percentage/window; invoices allocate the
    // credit only to eligible days, including a window ending mid-cycle.
    P.quote(selected, book, { credit: credit, now: R.date(on) });
    var overlap = Math.max(0, Math.min(R.date(end), instant(credit.endsAt)) - Math.max(R.date(on), instant(credit.startsAt))) / R.DAY;
    var discount = Math.min(Math.round(quote.recurringCents * book.credit.pct / 100 * overlap / c.days),
      Math.max(0, gross - Math.round(book.floorCents * numerator / denominator)));
    if (discount) lines.push({ itemKey: 'credit', name: 'Transformation credit', quantity: 1, amountCents: -discount });
  }
  var feeDue = first || (billing.serviceFeeNextOn && billing.serviceFeeNextOn <= on), serviceFeeNextOn = billing.serviceFeeNextOn || null, feeNote = null;
  if (feeDue) {
    if (quote.serviceFee.amountCents) lines.push({ itemKey: 'service-fee', name: 'Annual service fee', quantity: 1, amountCents: quote.serviceFee.amountCents });
    else if (quote.serviceFee.mode === 'waived') feeNote = 'Annual service fee: waived';
    serviceFeeNextOn = R.addYears(feeStart, year);
  }
  return { date: on, period: { start: on, end: end }, lines: lines, modules: selected.slice(), plan: quote.plan, memo: feeNote,
    subtotalCents: lines.reduce(function (n, l) { return n + l.amountCents; }, 0), pricebookVersion: book.version,
    nextInvoiceOn: end, serviceFeeNextOn: serviceFeeNextOn, first: first, interval: interval,
    graceEndsOn: R.businessDays(on, book.policy.failedPaymentGraceBusinessDays), display: { subscription: quote.display.monthly, subtotal: P.money(lines.reduce(function (n, l) { return n + l.amountCents; }, 0)) } };
}
module.exports = { instant: instant, trialDays: trialDays, terms: terms, approve: approve, invoice: invoice, subscription: subscription };
