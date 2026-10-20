/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * ONE fixture for the packaging render checks: the admin stand-in that hands
 * the real /api handlers an in-memory Firestore and a fixed caller, the
 * QuickBooks stand-in that only counts invoices, and a tenant whose current
 * cycle is already paid. Nothing here reaches the network.
 */
'use strict';
var F = require('./firestore-double'), B = require('../../api/_lib/pricebook'), M = require('../../api/_lib/modules'), R = require('../../api/_lib/proration');
var SIGNUP = '2026-08-20T12:00:00Z';
function mockAdmin(getDb, getCaller) {
  F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function () { return getCaller(); }, db: function () { return getDb(); },
    safeOrg: function (s) { return /^[a-z0-9.-]+\.[a-z]+$/.test(s || '') ? s : null; }, orgOf: function (s) { return s.split('@')[1]; },
    isTenantAdmin: async function (c, o) { return c.staff || c.orgId === o && c.role === 'owner'; },
    /* admin.clientAdmin: staff, or a tenant admin of an ACTIVE client */
    clientAdmin: async function (c, o) { if (c.staff) return true; if (!(c.orgId === o && c.role === 'owner')) return false; var s = await getDb().doc('omega_orgs/' + o).get(); return s.exists && (s.data() || {}).status === 'active'; },
    billingOf: async function (o) { var r = await getDb().doc('omega_orgs/' + o + '/billing/current').get(); return r.exists ? r.data() : {}; },
    httpError: function (status, message) { var e = new Error(message); e.status = status; return e; },
    FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; },
    init: function () { return { auth: function () { return { setCustomUserClaims: async function () {} }; } }; } });
}
/* Every sandbox invoice succeeds with a fixed pay link; `onInvoice` counts. */
/* The QuickBooks driver double. `state.paid` (optional) is what a
   reconciliation finds: the render flips it to stand for a card payment. */
function mockQbo(onInvoice, state) {
  state = state || {};
  require('../../api/_lib/qbo-billing').driver = function () {
    return { customer: async function () { return 'C-fixture'; },
      invoice: async function (plan) { onInvoice(plan); return { id: 'I-fixture', totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/fixture' }; },
      reconcile: async function (record) { return { satisfied: state.paid === true, reversed: false, paidCents: state.paid === true ? record.totalCents : 0, payUrl: record.paymentLink }; } };
  };
}
function enabledBook() { var book = B.proposed(); book.enabled = true; book.qbo.realmId = 'fixture'; return book; }
function profile(org, companyName) {
  return { legalName: companyName || 'Clean Cell — test fixture', contactName: 'Fixture Owner', email: 'owner@' + org, phone: '555-0100',
    address: { line1: '1 Fixture Way', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'oem', teamSize: 3 };
}
/* The paid tenant is mid-cycle on the clock the check runs on: the unit
 * tests pin Date.now (2026-09-26: billed on the 20th, the 2026-09-20 cycle,
 * signed up 2026-08-20), the render checks run on the real one. Billed on the
 * 20th, or on the 5th when today is within two days of the 20th, so a render
 * never lands on the billing day, when a paid change waits for the renewal.
 * (2026-10-20: a fixed 2026-09-20 cycle ran out and failed every branch.) */
function billingDay(now) { var d = new Date(now == null ? Date.now() : now).getUTCDate(); return Math.abs(d - 20) <= 2 ? 5 : 20; }
function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function paidCycle(now) {
  now = now == null ? Date.now() : now;
  var day = billingDay(now), cycle = R.cycle(R.iso(now), day);
  return { day: day, cycle: cycle, signup: R.cycle(R.addDays(cycle.start, -1), day).start };
}
/* A tenant mid-cycle on a paid package, the current cycle's subscription
 * invoice paid. `keys`/`plan` are what they bought (the subscription record)
 * and what is switched on. Returns the current cycle. */
function seedPaidTenant(db, o) {
  var book = o.book || enabledBook(), now = Date.now(), paid = paidCycle(now), cycle = paid.cycle, keys = M.normalize(o.keys);
  var signedUp = paid.signup + SIGNUP.slice(10);
  db.seed('pricebook/' + book.version, book);
  db.seed('omega_orgs/' + o.org, { name: o.name || 'Clean Cell · fixture', status: 'active', packagingSandbox: true, signedUpAt: signedUp, domains: o.domains || ['fixture.example'] });
  db.seed('omega_orgs/' + o.org + '/billing/current', Object.assign({ packaged: true, packagingState: 'paid', modules: keys, plan: o.plan, billingDay: paid.day, interval: 'monthly', qboCustomerId: 'C-fixture', qboRealmId: 'fixture',
    pricebookVersion: book.version, subscriptionStartedAt: Date.parse(signedUp), firstInvoiceOn: paid.signup, nextInvoiceOn: cycle.end, serviceFeeNextOn: R.addYears(paid.signup, 1), paidThrough: cycle.end, accessUntil: now + 30 * 86400000, builders: 3, viewers: 10,
    subscription: { modules: keys, plan: o.plan, interval: 'monthly', builders: 3, viewers: 10, since: Date.parse(signedUp) } }, M.resolve(keys)));
  db.seed('omega_orgs/' + o.org + '/billing/current/invoices/' + cycle.start, { date: cycle.start, period: { start: cycle.start, end: cycle.end }, modules: keys, plan: o.plan, lines: [], subtotalCents: 1, totalCents: 1, state: 'paid', paidCents: 1, qboInvoiceId: 'I-paid', qboCustomerId: 'C-fixture', marker: 'OMEGA subscription fixture', pricebookVersion: book.version });
  if (o.profile) db.seed('omega_orgs/' + o.org + '/billing/profile', o.profile);
  if (o.member) db.seed('omega_orgs/' + o.org + '/members/' + o.member, { role: 'owner', status: 'active' });
  return cycle;
}
module.exports = { mockAdmin: mockAdmin, mockQbo: mockQbo, enabledBook: enabledBook, profile: profile, seedPaidTenant: seedPaidTenant, billingDay: billingDay, paidCycle: paidCycle, ordinal: ordinal };
