/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/dashboard-fixtures.js — the tenants the dashboard is checked as
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Three workspaces, each the Firestore a browser would see from a signed-in
   user of that tenant (scripts/_lib/firebase-double.js seeds them). They are
   the three first-run shapes the product has:

     newco      signed up an hour ago, approved, on trial, nothing in it yet.
                No projects, no team, no saved layout, no terms acceptance —
                the empty state a new subscriber lands on, with the terms
                modal in front of it.
     northstar  a paying Standard-tier developer with four projects, a
                colleague, a to-do and a message. Standard does NOT include
                Site Investment Analysis, so the Quick Access tile for it is
                LOCKED — the tile an open bug report was about.
     pending    signed up, not yet approved: the "awaiting approval" strip and
                every tool locked.

   Every domain here is .example (RFC 2606): no real tenant, no real person.
   Written as document paths so the double, a test and a reader can each see
   at a glance what a tenant IS. Dates are relative to now, so "created three
   days ago" stays three days ago.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var FD = require('./firebase-double');
var DAY = 86400000;
function ago(days) { return FD.ts(new Date(Date.now() - days * DAY)); }
function iso(daysAhead) { return new Date(Date.now() + daysAhead * DAY).toISOString(); }

/* The terms version the gate checks — read from the file, never copied. */
var TERMS_VERSION = (function () {
  var src = require('fs').readFileSync(require('path').join(__dirname, '../../omega-terms.js'), 'utf8');
  var m = /var TERMS_VERSION = '([^']+)'/.exec(src);
  if (!m) throw new Error('omega-terms.js: TERMS_VERSION not found');
  return m[1];
})();

/* Every tenant here says shell: 'classic': the dashboard render check is
   the check of the CLASSIC dashboard (index.html), and since Omega Workspace
   became the default home (2026-09-26) that is the record that keeps a
   tenant on it. The workspace's own check is scripts/render-workspace.js,
   which boots /workspace directly on these same tenants. */
/* tenant_public/{host} is what pins a hostname to a tenant before sign-in.
   The render check serves every tenant at 127.0.0.1, so each fixture pins
   that host to itself. */
function pub(host, org, name, tier, vertical, status) {
  var d = {};
  d['tenant_public/' + host] = { orgId: org, name: name, logoUrl: '', colors: null, exportBrand: { name: name, logo: '' }, tier: tier, vertical: vertical, shell: 'classic', domains: [host], status: status || 'active', updatedAt: ago(1) };
  return d;
}
function merge() { var out = {}; [].slice.call(arguments).forEach(function (o) { Object.keys(o).forEach(function (k) { out[k] = o[k]; }); }); return out; }

function newco(host) {
  var org = 'newco.example', uid = 'uid-newco-owner';
  var docs = merge(pub(host, org, 'Newco Energy', 'trial', 'developer'), {});
  docs['omega_orgs/' + org] = { name: 'Newco Energy', slug: 'newco', domains: [host], logoUrl: '', vertical: 'developer', shell: 'classic', status: 'active', receivesFullBom: false,
    exportBrand: { name: 'Newco Energy', logo: '' }, signup: { email: 'dana@newco.example', uid: uid }, createdAt: ago(0.04), approvedAt: ago(0.02), approvedBy: 'ops@clearsky-usa.com' };
  docs['omega_orgs/' + org + '/billing/current'] = { tier: 'trial', addons: [], toolOverrides: {}, paymentProvider: 'manual', trialEndsAt: iso(14), subscriptionDue: null, createdAt: ago(0.04) };
  docs['omega_orgs/' + org + '/members/' + uid] = { email: 'dana@newco.example', name: 'Dana Ortiz', role: 'owner', status: 'active', createdAt: ago(0.04) };
  return { org: org, name: 'Newco Energy', tier: 'trial', user: { uid: uid, email: 'dana@newco.example', displayName: 'Dana Ortiz', emailVerified: true }, docs: docs, termsAccepted: false };
}

function northstar(host) {
  var org = 'northstar.example', uid = 'uid-northstar-ann', me = 'ann@northstar.example', peer = 'raj@northstar.example';
  var docs = merge(pub(host, org, 'Northstar Development', 'standard', 'developer'), {});
  docs['omega_orgs/' + org] = { name: 'Northstar Development', slug: 'northstar', domains: [host], logoUrl: '', vertical: 'developer', shell: 'classic', status: 'active', receivesFullBom: false,
    exportBrand: { name: 'Northstar Development', logo: '' }, createdAt: ago(120), approvedAt: ago(119), approvedBy: 'ops@clearsky-usa.com' };
  docs['omega_orgs/' + org + '/billing/current'] = { tier: 'standard', addons: [], toolOverrides: {}, paymentProvider: 'stripe', trialEndsAt: null, subscriptionDue: iso(20), amountDue: 0, lastPaidAt: iso(-10), createdAt: ago(120) };
  docs['omega_orgs/' + org + '/members/' + uid] = { email: me, name: 'Ann Lee', role: 'owner', status: 'active', createdAt: ago(120) };
  docs['omega_orgs/' + org + '/members/uid-northstar-raj'] = { email: peer, name: 'Raj Patel', role: 'member', status: 'active', createdAt: ago(60) };
  docs['termsAcceptances/' + uid] = { uid: uid, email: me, orgId: org, version: TERMS_VERSION, acceptedAt: ago(30) };
  docs['team_members/' + org + '__' + me] = { orgId: org, email: me, name: 'Ann Lee', photo: '', lastSeen: ago(0.5) };
  docs['team_members/' + org + '__' + peer] = { orgId: org, email: peer, name: 'Raj Patel', photo: '', lastSeen: ago(2) };
  docs['team_todos/t1'] = { orgId: org, text: 'Send the Riverside one-line to the utility', assignee: me, due: iso(3), done: false, createdBy: peer, createdAt: ago(1) };
  docs['team_todos/t2'] = { orgId: org, text: 'Order the geotech for Maple Yard', assignee: peer, due: iso(10), done: true, createdBy: me, createdAt: ago(6) };
  docs['team_messages/m1'] = { orgId: org, text: 'Riverside interconnection study came back clean.', authorEmail: peer, authorName: 'Raj Patel', createdAt: ago(0.3) };
  /* real STAGE_KEYS from index.html: candidate package submitted interconnect permitting finance construction online */
  var stages = ['package', 'interconnect', 'permitting', 'online'];
  [['p-riverside', 'Riverside BESS', 4000, 3100000, 'Eversource', stages[1], 1],
   ['p-maple', 'Maple Yard Storage', 8000, 6400000, 'National Grid', stages[0], 3],
   ['p-harbor', 'Harbor Point', 2000, 1500000, 'ComEd', stages[2], 20],
   ['p-mill', 'Old Mill Microgrid', 1000, 900000, 'ComEd', stages[3], 90]].forEach(function (p) {
    docs['projects/' + p[0]] = { orgId: org, orgsInvolved: [org], name: p[1], type: 'bess', stage: p[5], bessKwh: p[2], capex: p[3], incentive: Math.round(p[3] * 0.3), annualRevenue: Math.round(p[3] * 0.11),
      utility: p[4], program: 'ConnectedSolutions', nextAction: 'Review', ownerEmail: me, ownerName: 'Ann Lee', quoted: p[5] !== 'package', createdAt: ago(p[6]), updatedAt: ago(p[6] / 2) };
  });
  /* a candidate nobody has picked up yet (the workspace's Assign), and a
     deal sent to the finance marketplace nine days ago that ClearSky has
     not published (api/dealroom-open.js writes this shape; the sponsor
     reads it by developerUid) */
  docs['projects/p-quarry'] = { orgId: org, orgsInvolved: [org], name: 'Quarry Road', type: 'bess', stage: 'candidate', address: '14 Quarry Rd, Lowell, MA', utility: 'National Grid', createdAt: ago(2), updatedAt: ago(2) };
  docs['fin_projects/fin-maple'] = { name: 'Maple Yard Storage', address: 'Maple Yard', state: 'MA', mw: 4, capexUsd: 6400000, stage: 'package', status: 'review', awardedTo: null, developerUid: uid, orgName: 'Northstar Development',
    sourceProjectId: 'p-maple', room: { state: 'ordered', forOrg: '', forOrgId: '', history: [] }, createdAt: ago(9), updatedAt: ago(9) };
  /* a request for quote from the Riverside BOM: two vendors asked, one has
     answered (the workspace's Today counts it; api/rfq.js is what writes
     these shapes) */
  docs['rfqs/rfq-riverside'] = { sourceOrgId: org, projectId: 'p-riverside', projectName: 'Riverside BESS', status: 'open', recipientOrgIds: ['voltacell.example', 'cellworks.example'], requestedBy: me, createdByUid: uid, createdAt: ago(4), updatedAt: ago(1) };
  docs['rfqs/rfq-riverside/recipients/voltacell.example'] = { vendorOrgId: 'voltacell.example', scope: 'lines', status: 'quoted', quote: { total: 412000, leadWeeks: 10 }, revealed: false, createdAt: ago(4), updatedAt: ago(1) };
  docs['rfqs/rfq-riverside/recipients/cellworks.example'] = { vendorOrgId: 'cellworks.example', scope: 'lines', status: 'sent', quote: null, revealed: false, createdAt: ago(4), updatedAt: ago(4) };
  return { org: org, name: 'Northstar Development', tier: 'standard', user: { uid: uid, email: me, displayName: 'Ann Lee', emailVerified: true }, docs: docs, termsAccepted: true,
    lockedQuick: 'investment' /* Site Investment Analysis is Enterprise; Standard does not carry it */ };
}

function pending(host) {
  var org = 'pendingco.example', uid = 'uid-pending-owner';
  var docs = merge(pub(host, org, 'Pendingco', 'trial', 'installer', 'pending'), {});
  docs['omega_orgs/' + org] = { name: 'Pendingco', slug: 'pendingco', domains: [host], logoUrl: '', vertical: 'installer', shell: 'classic', status: 'pending', receivesFullBom: false,
    exportBrand: { name: 'Pendingco', logo: '' }, signup: { email: 'sam@pendingco.example', uid: uid }, createdAt: ago(0.1) };
  docs['omega_orgs/' + org + '/billing/current'] = { tier: 'trial', addons: [], toolOverrides: {}, paymentProvider: 'manual', trialEndsAt: iso(14), createdAt: ago(0.1) };
  docs['omega_orgs/' + org + '/members/' + uid] = { email: 'sam@pendingco.example', name: 'Sam Reyes', role: 'owner', status: 'active', createdAt: ago(0.1) };
  docs['termsAcceptances/' + uid] = { uid: uid, email: 'sam@pendingco.example', orgId: org, version: TERMS_VERSION, acceptedAt: ago(0.1) };
  return { org: org, name: 'Pendingco', tier: 'trial', user: { uid: uid, email: 'sam@pendingco.example', displayName: 'Sam Reyes', emailVerified: true }, docs: docs, termsAccepted: true, pending: true };
}

/* lite: a PACKAGED tenant on Lite alone, paid (packaging phases 1–4). The
   page reads `billing/current.packaged` and asks /api/package-access for
   the projection; the render check answers with `packageView`, computed
   here by the real api/_lib/package-access.js from the same records, so the
   locks the page paints are the server's own answer. */
function lite(host) {
  var org = 'litelabs.example', uid = 'uid-lite-owner', me = 'kim@litelabs.example';
  var docs = merge(pub(host, org, 'Lite Labs', 'lite', 'installer'), {});
  var orgDoc = { name: 'Lite Labs', slug: 'litelabs', domains: [host], logoUrl: '', vertical: 'installer', shell: 'classic', status: 'active', receivesFullBom: false,
    exportBrand: { name: 'Lite Labs', logo: '' }, signup: { email: me, uid: uid }, createdAt: ago(40), approvedAt: ago(39), approvedBy: 'ops@clearsky-usa.com' };
  var billing = { packaged: true, modules: ['lite'], plan: 'Lite', packagingState: 'paid', paidThrough: iso(20).slice(0, 10), accessUntil: iso(25), billingDay: 20,
    subscription: { modules: ['lite'], plan: 'alacarte', interval: 'monthly' }, interval: 'monthly', nextInvoiceOn: iso(20).slice(0, 10), amountDue: 0,
    paymentProvider: 'quickbooks', billingProvider: 'quickbooks', qboCustomerId: 'C-lite', qboEnv: 'sandbox', pricebookVersion: require('../../api/_lib/pricebook').VERSION, createdAt: ago(40) };
  var member = { email: me, name: 'Kim Sato', role: 'owner', status: 'active', createdAt: ago(40) };
  docs['omega_orgs/' + org] = orgDoc;
  docs['omega_orgs/' + org + '/billing/current'] = billing;
  docs['omega_orgs/' + org + '/members/' + uid] = member;
  docs['termsAcceptances/' + uid] = { uid: uid, email: me, orgId: org, version: TERMS_VERSION, acceptedAt: ago(30) };
  docs['team_members/' + org + '__' + me] = { orgId: org, email: me, name: 'Kim Sato', photo: '', lastSeen: ago(1) };
  var X = require('../../api/_lib/package-access'), M = require('../../api/_lib/modules');
  var view = X.project({ staff: false, claims: { email_verified: true } }, billing, orgDoc, member, Date.now());
  return { org: org, name: 'Lite Labs', tier: 'lite', user: { uid: uid, email: me, displayName: 'Kim Sato', emailVerified: true }, docs: docs, termsAccepted: true,
    packageView: view, liteTools: M.get('lite').tools.slice() };
}

/* awaiting: a workspace that signed up and paid nothing yet (Phase 10A pay
   now): active, read-only, Lite on, Grid Atlas bought, the first invoice's
   pay link on the record. The dashboard shows the bar, the locked tiles and
   the Account panel's pay button. */
function awaiting(host) {
  var org = 'newpay.example', uid = 'uid-newpay-owner', me = 'lee@newpay.example';
  var docs = merge(pub(host, org, 'Newpay Energy', 'lite', 'installer'), {});
  var orgDoc = { name: 'Newpay Energy', slug: 'newpay', domains: [host], logoUrl: '', vertical: 'installer', shell: 'classic', status: 'active', receivesFullBom: false,
    exportBrand: { name: 'Newpay Energy', logo: '' }, signup: { email: me, uid: uid }, packaged: true, packagingSandbox: true, signedUpAt: ago(0.1), createdAt: ago(0.1), approvedAt: ago(0.1), approvedBy: 'self-serve', selfServe: true };
  var billing = { packaged: true, modules: ['lite'], packagingState: 'awaiting_payment', accessUntil: Date.now() - 1000, billingDay: new Date().getUTCDate(), nextInvoiceOn: iso(0).slice(0, 10),
    subscription: { modules: ['lite', 'gridatlas'], plan: 'alacarte', interval: 'monthly' }, interval: 'monthly', amountDue: 2250, paymentLink: 'https://connect.intuit.com/pay/fixture-first',
    paymentProvider: 'quickbooks', billingProvider: 'quickbooks', qboCustomerId: 'C-newpay', qboEnv: 'sandbox', pricebookVersion: require('../../api/_lib/pricebook').VERSION, createdAt: ago(0.1) };
  var member = { email: me, name: 'Lee Park', role: 'owner', status: 'active', createdAt: ago(0.1) };
  docs['omega_orgs/' + org] = orgDoc; docs['omega_orgs/' + org + '/billing/current'] = billing; docs['omega_orgs/' + org + '/members/' + uid] = member;
  docs['termsAcceptances/' + uid] = { uid: uid, email: me, orgId: org, version: TERMS_VERSION, acceptedAt: ago(0.1) };
  var X = require('../../api/_lib/package-access');
  var view = X.project({ staff: false, claims: { email_verified: true } }, billing, orgDoc, member, Date.now());
  return { org: org, name: 'Newpay Energy', tier: 'lite', user: { uid: uid, email: me, displayName: 'Lee Park', emailVerified: true }, docs: docs, termsAccepted: true, packageView: view, awaiting: true };
}
/* The Stripe CARD RAIL (2026-09-27, PACKAGING_RAIL=stripe): a workspace that
   pays by card through Stripe Checkout. Its pay link is OUR signed link
   (https://<home>/api/package-pay?o=&r=&s=), which opens Stripe's checkout
   in the same tab and comes back to Plan & billing settled. The signature
   here is a fixture's: nothing verifies it and nothing is ever fetched. */
var CARD_SIG = 'f1c7a2e9b04d3c5a6e8f7b1d2c3a4e5f60718293';
function cardPayLink(org, recordId) { return 'https://silmarillion.clearskyomega.com/api/package-pay?o=' + encodeURIComponent(org) + '&r=' + encodeURIComponent(recordId) + '&s=' + CARD_SIG; }
function cardProfile(org, name) {
  return { legalName: name, contactName: 'Fixture Owner', email: 'ap@' + org, phone: '555-0100', address: { line1: '1 Fixture Way', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'installer', teamSize: 3 };
}
/* cardAwaiting: signed up on the card rail and paid nothing yet — the
   awaiting shape above with the first invoice on Stripe (no card on file). */
function cardAwaiting(host) {
  var org = 'cardpay.example', uid = 'uid-cardpay-owner', me = 'rae@cardpay.example', today = iso(0).slice(0, 10), link = cardPayLink(org, today);
  var docs = merge(pub(host, org, 'Cardpay Solar', 'lite', 'installer'), {});
  var orgDoc = { name: 'Cardpay Solar', slug: 'cardpay', domains: [host], logoUrl: '', vertical: 'installer', shell: 'classic', status: 'active', receivesFullBom: false,
    exportBrand: { name: 'Cardpay Solar', logo: '' }, signup: { email: me, uid: uid }, packaged: true, packagingSandbox: true, signedUpAt: ago(0.1), createdAt: ago(0.1), approvedAt: ago(0.1), approvedBy: 'self-serve', selfServe: true };
  var billing = { packaged: true, modules: ['lite'], packagingState: 'awaiting_payment', accessUntil: Date.now() - 1000, billingDay: new Date().getUTCDate(), nextInvoiceOn: today,
    subscription: { modules: ['lite', 'gridatlas'], plan: 'alacarte', interval: 'monthly' }, interval: 'monthly', amountDue: 2250, paymentLink: link,
    paymentProvider: 'stripe-checkout', billingProvider: 'stripe', stripe: { customerId: 'cus_fixturecardpay', env: 'sandbox', since: Date.now() - 3600e3 },
    qboEnv: 'sandbox', pricebookVersion: require('../../api/_lib/pricebook').VERSION, createdAt: ago(0.1) };
  var member = { email: me, name: 'Rae Kim', role: 'owner', status: 'active', createdAt: ago(0.1) };
  docs['omega_orgs/' + org] = orgDoc; docs['omega_orgs/' + org + '/billing/current'] = billing; docs['omega_orgs/' + org + '/members/' + uid] = member;
  docs['omega_orgs/' + org + '/billing/profile'] = cardProfile(org, 'Cardpay Solar');
  /* the first invoice, on the card rail: no QuickBooks invoice, our pay link */
  docs['omega_orgs/' + org + '/billing/current/invoices/' + today] = { date: today, period: { start: today, end: iso(30).slice(0, 10) }, modules: ['lite', 'gridatlas'], plan: 'alacarte', lines: [], subtotalCents: 225000, totalCents: 225000,
    state: 'unpaid', provider: 'stripe', stripeRef: 'stp_fixturecardpay0001', stripe: { customerId: 'cus_fixturecardpay', org: org, env: 'sandbox', paymentIntents: [], sessions: [], sessionCount: 0, lastCharge: null },
    paymentLink: link, issuedAt: Date.now() - 3600e3, marker: 'OMEGA subscription ' + org + ' / ' + today, pricebookVersion: require('../../api/_lib/pricebook').VERSION };
  docs['termsAcceptances/' + uid] = { uid: uid, email: me, orgId: org, version: TERMS_VERSION, acceptedAt: ago(0.1) };
  var X = require('../../api/_lib/package-access');
  var view = X.project({ staff: false, claims: { email_verified: true } }, billing, orgDoc, member, Date.now());
  return { org: org, name: 'Cardpay Solar', tier: 'lite', user: { uid: uid, email: me, displayName: 'Rae Kim', emailVerified: true }, docs: docs, termsAccepted: true, packageView: view, awaiting: true, card: true, payLink: link };
}
/* cardPaid: a paid workspace on the card rail with a Visa ending 4242 on
   file (saved by its first Checkout), billed on the 20th, the current cycle's
   subscription paid by card. The shape api/_lib/plan-change.js quotes and
   charges against (packagingSandbox, an enabled sandbox book, a profile). */
function cardPaid(host) {
  var R = require('../../api/_lib/proration'), M = require('../../api/_lib/modules'), BK = require('../../api/_lib/pricebook');
  var org = 'cardpaid.example', uid = 'uid-cardpaid-owner', me = 'noa@cardpaid.example', cycle = R.cycle(R.iso(Date.now()), 20), keys = ['lite'];
  var docs = merge(pub(host, org, 'Cardpaid Storage', 'lite', 'developer'), {});
  var orgDoc = { name: 'Cardpaid Storage', slug: 'cardpaid', domains: [host], logoUrl: '', vertical: 'developer', shell: 'classic', status: 'active', receivesFullBom: false,
    exportBrand: { name: 'Cardpaid Storage', logo: '' }, signup: { email: me, uid: uid }, packaged: true, packagingSandbox: true, signedUpAt: '2026-08-20T12:00:00Z', createdAt: ago(40), approvedAt: ago(40), approvedBy: 'self-serve', selfServe: true };
  var billing = Object.assign({ packaged: true, packagingState: 'paid', modules: keys, plan: 'Lite', billingDay: 20, interval: 'monthly',
    pricebookVersion: BK.VERSION, subscriptionStartedAt: Date.parse('2026-08-20T12:00:00Z'), firstInvoiceOn: '2026-08-20', nextInvoiceOn: cycle.end, serviceFeeNextOn: '2027-08-20',
    paidThrough: cycle.end, accessUntil: Date.parse(cycle.end + 'T00:00:00Z') + 20 * DAY, amountDue: 0, builders: 3, viewers: 10,
    subscription: { modules: keys, plan: 'alacarte', interval: 'monthly', builders: 3, viewers: 10, since: Date.parse('2026-08-20T12:00:00Z') },
    paymentProvider: 'stripe-checkout', billingProvider: 'stripe', qboEnv: 'sandbox',
    stripe: { customerId: 'cus_fixturecardpaid', env: 'sandbox', since: Date.parse('2026-08-20T12:00:00Z'), cardOnFile: true, card: { brand: 'visa', last4: '4242' } }, createdAt: ago(40) }, M.resolve(keys));
  var member = { email: me, name: 'Noa Reyes', role: 'owner', status: 'active', createdAt: ago(40) };
  docs['omega_orgs/' + org] = orgDoc; docs['omega_orgs/' + org + '/billing/current'] = billing; docs['omega_orgs/' + org + '/members/' + uid] = member;
  docs['omega_orgs/' + org + '/billing/profile'] = cardProfile(org, 'Cardpaid Storage');
  docs['omega_orgs/' + org + '/billing/current/invoices/' + cycle.start] = { date: cycle.start, period: { start: cycle.start, end: cycle.end }, modules: keys, plan: 'alacarte', lines: [], subtotalCents: 50000, totalCents: 50000,
    state: 'paid', paidCents: 50000, paidAt: Date.parse(cycle.start + 'T12:00:00Z'), provider: 'stripe', stripeRef: 'stp_fixturecardpaid001',
    stripe: { customerId: 'cus_fixturecardpaid', org: org, env: 'sandbox', paymentIntents: ['pi_fixturecardpaid'], sessions: [], sessionCount: 0, lastCharge: { status: 'succeeded', code: null } },
    paymentLink: null, marker: 'OMEGA subscription ' + org + ' / ' + cycle.start, pricebookVersion: BK.VERSION };
  docs['termsAcceptances/' + uid] = { uid: uid, email: me, orgId: org, version: TERMS_VERSION, acceptedAt: ago(30) };
  docs['team_members/' + org + '__' + me] = { orgId: org, email: me, name: 'Noa Reyes', photo: '', lastSeen: ago(1) };
  var X = require('../../api/_lib/package-access');
  var view = X.project({ staff: false, claims: { email_verified: true } }, billing, orgDoc, member, Date.now());
  return { org: org, name: 'Cardpaid Storage', tier: 'lite', user: { uid: uid, email: me, displayName: 'Noa Reyes', emailVerified: true }, docs: docs, termsAccepted: true, packageView: view, card: true, cycle: cycle,
    liteTools: M.get('lite').tools.slice() };
}
/* legacyEnterprise: a prepaid legacy account (NextNRG-like, Tommy 2026-09-26:
   "they paid for the whole year so they will just have everything available
   to them"). No packaged record, enterprise tier, nothing locked, nothing to
   upgrade, no Ladder: the account page shows the paid year and that is all. */
function legacyEnterprise(host) {
  var org = 'nextgen.example', uid = 'uid-nextgen-paige', me = 'paige@nextgen.example';
  var docs = merge(pub(host, org, 'NextGen Power', 'enterprise', 'developer'), {});
  docs['omega_orgs/' + org] = { name: 'NextGen Power', slug: 'nextgen', domains: [host], logoUrl: '', vertical: 'developer', shell: 'classic', status: 'active', receivesFullBom: false,
    exportBrand: { name: 'NextGen Power', logo: '' }, tierLevel: 3, createdAt: ago(400), approvedAt: ago(399), approvedBy: 'ops@clearsky-usa.com' };
  docs['omega_orgs/' + org + '/billing/current'] = { tier: 'enterprise', addons: ['omega-logic'], toolOverrides: {}, paymentProvider: 'manual', trialEndsAt: null, subscriptionDue: iso(300), amountDue: 0, amountPaid: 150000, lastPaidAt: iso(-65), note: 'Annual contract, paid in full', createdAt: ago(400) };
  docs['omega_orgs/' + org + '/members/' + uid] = { email: me, name: 'Paige Cole', role: 'owner', status: 'active', createdAt: ago(400) };
  docs['termsAcceptances/' + uid] = { uid: uid, email: me, orgId: org, version: TERMS_VERSION, acceptedAt: ago(300) };
  docs['team_members/' + org + '__' + me] = { orgId: org, email: me, name: 'Paige Cole', photo: '', lastSeen: ago(0.2) };
  return { org: org, name: 'NextGen Power', tier: 'enterprise', user: { uid: uid, email: me, displayName: 'Paige Cole', emailVerified: true }, docs: docs, termsAccepted: true, legacyAllOpen: true };
}
module.exports = { newco: newco, northstar: northstar, pending: pending, lite: lite, awaiting: awaiting, cardAwaiting: cardAwaiting, cardPaid: cardPaid, legacyEnterprise: legacyEnterprise, TERMS_VERSION: TERMS_VERSION };
