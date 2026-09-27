/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * UTC calendar dates and integer-cent subscription proration. Server only.
 */
'use strict';
var DAY = 86400000;
function fail(message) { var e = new Error(message); e.status = 400; throw e; }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('YYYY-MM-DD date required');
  var n = Date.parse(value + 'T00:00:00Z');
  if (!isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) fail('Invalid calendar date');
  return n;
}
function iso(n) { return new Date(n).toISOString().slice(0, 10); }
function day(value) { if (!Number.isInteger(value) || value < 1 || value > 31) fail('Billing day must be 1–31'); return value; }
function anchor(year, month, billingDay) {
  day(billingDay);
  var last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(last, billingDay));
}
function cycle(on, billingDay) {
  var n = date(on), d = new Date(n), y = d.getUTCFullYear(), m = d.getUTCMonth(), current = anchor(y, m, billingDay);
  var start = current <= n ? current : anchor(y, m - 1, billingDay);
  var end = current > n ? current : anchor(y, m + 1, billingDay);
  return { start: iso(start), end: iso(end), days: (end - start) / DAY, remainingDays: (end - n) / DAY };
}
function amount(monthlyCents, on, billingDay) {
  if (!Number.isSafeInteger(monthlyCents) || monthlyCents < 0) fail('Nonnegative integer cents required');
  var c = cycle(on, billingDay);
  return { amountCents: Math.round(monthlyCents * c.remainingDays / c.days), start: on, end: c.end,
    days: c.remainingDays, cycleDays: c.days };
}
function addDays(on, count) {
  if (!Number.isInteger(count)) fail('Whole calendar days required');
  return iso(date(on) + count * DAY);
}
function businessDays(on, count) {
  if (!Number.isInteger(count) || count < 0 || count > 366) fail('Invalid grace period');
  var n = date(on);
  while (count) { n += DAY; var weekday = new Date(n).getUTCDay(); if (weekday !== 0 && weekday !== 6) count--; }
  return iso(n);
}
function addYears(on, count) {
  if (!Number.isInteger(count) || count < 0) fail('Whole nonnegative years required');
  var d = new Date(date(on)); return iso(anchor(d.getUTCFullYear() + count, d.getUTCMonth(), d.getUTCDate()));
}
module.exports = { date: date, iso: iso, cycle: cycle, amount: amount, addDays: addDays, addYears: addYears, businessDays: businessDays, DAY: DAY };
