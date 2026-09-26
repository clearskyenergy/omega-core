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

/* tenant_public/{host} is what pins a hostname to a tenant before sign-in.
   The render check serves every tenant at 127.0.0.1, so each fixture pins
   that host to itself. */
function pub(host, org, name, tier, vertical, status) {
  var d = {};
  d['tenant_public/' + host] = { orgId: org, name: name, logoUrl: '', colors: null, exportBrand: { name: name, logo: '' }, tier: tier, vertical: vertical, shell: 'default', domains: [host], status: status || 'active', updatedAt: ago(1) };
  return d;
}
function merge() { var out = {}; [].slice.call(arguments).forEach(function (o) { Object.keys(o).forEach(function (k) { out[k] = o[k]; }); }); return out; }

function newco(host) {
  var org = 'newco.example', uid = 'uid-newco-owner';
  var docs = merge(pub(host, org, 'Newco Energy', 'trial', 'developer'), {});
  docs['omega_orgs/' + org] = { name: 'Newco Energy', slug: 'newco', domains: [host], logoUrl: '', vertical: 'developer', shell: 'default', status: 'active', receivesFullBom: false,
    exportBrand: { name: 'Newco Energy', logo: '' }, signup: { email: 'dana@newco.example', uid: uid }, createdAt: ago(0.04), approvedAt: ago(0.02), approvedBy: 'ops@clearsky-usa.com' };
  docs['omega_orgs/' + org + '/billing/current'] = { tier: 'trial', addons: [], toolOverrides: {}, paymentProvider: 'manual', trialEndsAt: iso(14), subscriptionDue: null, createdAt: ago(0.04) };
  docs['omega_orgs/' + org + '/members/' + uid] = { email: 'dana@newco.example', name: 'Dana Ortiz', role: 'owner', status: 'active', createdAt: ago(0.04) };
  return { org: org, name: 'Newco Energy', tier: 'trial', user: { uid: uid, email: 'dana@newco.example', displayName: 'Dana Ortiz', emailVerified: true }, docs: docs, termsAccepted: false };
}

function northstar(host) {
  var org = 'northstar.example', uid = 'uid-northstar-ann', me = 'ann@northstar.example', peer = 'raj@northstar.example';
  var docs = merge(pub(host, org, 'Northstar Development', 'standard', 'developer'), {});
  docs['omega_orgs/' + org] = { name: 'Northstar Development', slug: 'northstar', domains: [host], logoUrl: '', vertical: 'developer', shell: 'default', status: 'active', receivesFullBom: false,
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
  return { org: org, name: 'Northstar Development', tier: 'standard', user: { uid: uid, email: me, displayName: 'Ann Lee', emailVerified: true }, docs: docs, termsAccepted: true,
    lockedQuick: 'investment' /* Site Investment Analysis is Enterprise; Standard does not carry it */ };
}

function pending(host) {
  var org = 'pendingco.example', uid = 'uid-pending-owner';
  var docs = merge(pub(host, org, 'Pendingco', 'trial', 'installer', 'pending'), {});
  docs['omega_orgs/' + org] = { name: 'Pendingco', slug: 'pendingco', domains: [host], logoUrl: '', vertical: 'installer', shell: 'default', status: 'pending', receivesFullBom: false,
    exportBrand: { name: 'Pendingco', logo: '' }, signup: { email: 'sam@pendingco.example', uid: uid }, createdAt: ago(0.1) };
  docs['omega_orgs/' + org + '/billing/current'] = { tier: 'trial', addons: [], toolOverrides: {}, paymentProvider: 'manual', trialEndsAt: iso(14), createdAt: ago(0.1) };
  docs['omega_orgs/' + org + '/members/' + uid] = { email: 'sam@pendingco.example', name: 'Sam Reyes', role: 'owner', status: 'active', createdAt: ago(0.1) };
  docs['termsAcceptances/' + uid] = { uid: uid, email: 'sam@pendingco.example', orgId: org, version: TERMS_VERSION, acceptedAt: ago(0.1) };
  return { org: org, name: 'Pendingco', tier: 'trial', user: { uid: uid, email: 'sam@pendingco.example', displayName: 'Sam Reyes', emailVerified: true }, docs: docs, termsAccepted: true, pending: true };
}

module.exports = { newco: newco, northstar: northstar, pending: pending, TERMS_VERSION: TERMS_VERSION };
