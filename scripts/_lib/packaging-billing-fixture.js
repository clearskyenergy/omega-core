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
    billingOf: async function (o) { var r = await getDb().doc('omega_orgs/' + o + '/billing/current').get(); return r.exists ? r.data() : {}; },
    httpError: function (status, message) { var e = new Error(message); e.status = status; return e; },
    FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; },
    init: function () { return { auth: function () { return { setCustomUserClaims: async function () {} }; } }; } });
}
/* Every sandbox invoice succeeds with a fixed pay link; `onInvoice` counts. */
function mockQbo(onInvoice) {
  require('../../api/_lib/qbo-billing').driver = function () {
    return { customer: async function () { return 'C-fixture'; },
      invoice: async function (plan) { onInvoice(plan); return { id: 'I-fixture', totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/fixture' }; } };
  };
}
function enabledBook() { var book = B.proposed(); book.enabled = true; book.qbo.realmId = 'fixture'; return book; }
function profile(org, companyName) {
  return { legalName: companyName || 'Clean Cell — test fixture', contactName: 'Fixture Owner', email: 'owner@' + org, phone: '555-0100',
    address: { line1: '1 Fixture Way', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'oem', teamSize: 3 };
}
/* A tenant mid-cycle on a paid package: signed up 2026-08-20, billed on the
 * 20th, the current cycle's subscription invoice paid. `keys`/`plan` are what
 * they bought (the subscription record) and what is switched on. */
function seedPaidTenant(db, o) {
  var book = o.book || enabledBook(), cycle = R.cycle('2026-09-20', 20), keys = M.normalize(o.keys), now = Date.now();
  db.seed('pricebook/' + book.version, book);
  db.seed('omega_orgs/' + o.org, { name: o.name || 'Clean Cell · fixture', status: 'active', packagingSandbox: true, signedUpAt: SIGNUP, domains: o.domains || ['fixture.example'] });
  db.seed('omega_orgs/' + o.org + '/billing/current', Object.assign({ packaged: true, packagingState: 'paid', modules: keys, plan: o.plan, billingDay: 20, interval: 'monthly', qboCustomerId: 'C-fixture', qboRealmId: 'fixture',
    pricebookVersion: book.version, subscriptionStartedAt: Date.parse(SIGNUP), firstInvoiceOn: '2026-08-20', nextInvoiceOn: cycle.end, serviceFeeNextOn: '2027-08-20', paidThrough: cycle.end, accessUntil: now + 30 * 86400000, builders: 3, viewers: 10,
    subscription: { modules: keys, plan: o.plan, interval: 'monthly', builders: 3, viewers: 10, since: Date.parse(SIGNUP) } }, M.resolve(keys)));
  db.seed('omega_orgs/' + o.org + '/billing/current/invoices/2026-09-20', { date: '2026-09-20', period: { start: '2026-09-20', end: cycle.end }, modules: keys, plan: o.plan, lines: [], subtotalCents: 1, totalCents: 1, state: 'paid', paidCents: 1, qboInvoiceId: 'I-paid', qboCustomerId: 'C-fixture', marker: 'OMEGA subscription fixture', pricebookVersion: book.version });
  if (o.profile) db.seed('omega_orgs/' + o.org + '/billing/profile', o.profile);
  if (o.member) db.seed('omega_orgs/' + o.org + '/members/' + o.member, { role: 'owner', status: 'active' });
  return cycle;
}
module.exports = { mockAdmin: mockAdmin, mockQbo: mockQbo, enabledBook: enabledBook, profile: profile, seedPaidTenant: seedPaidTenant };
