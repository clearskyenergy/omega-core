#!/usr/bin/env node
/* Signup trial ceiling and preservation of existing billing.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('node:assert/strict');
var F = require('./_lib/firestore-double');
var db, claimsWrites = 0, mailWrites = 0, checks = 0;
var caller = { uid: 'new-owner', email: 'owner@signup.example', staff: false,
  claims: { email_verified: true, name: 'Test Owner' } };
F.mock('../api/_lib/admin', {
  handler: function (fn) { return fn; },
  authenticate: function () { return Promise.resolve(caller); },
  orgOf: function (email) { return email.split('@')[1]; },
  db: function () { return db; },
  FieldValue: function () { return { serverTimestamp: function () { return '<server-time>'; } }; },
  httpError: function (status, message) { var e = new Error(message); e.status = status; return e; },
  init: function () { return { auth: function () { return {
    setCustomUserClaims: function () { claimsWrites++; return Promise.resolve(); }
  }; } }; }
});
function mail() { mailWrites++; return Promise.resolve(); }
F.mock('../api/_lib/mail', { templates: { signupReceived: mail, signupAlert: mail } });
var request = { method: 'POST', headers: {}, body: { companyName: 'Fixture Company', vertical: 'installer' } };
var oldDays = process.env.TRIAL_DAYS, oldPackaging = process.env.PACKAGING_SIGNUP_ENABLED, oldQbo = process.env.QBO_ENV;
delete process.env.PACKAGING_SIGNUP_ENABLED;
function load(days) {
  if (days === undefined) delete process.env.TRIAL_DAYS;
  else process.env.TRIAL_DAYS = String(days);
  delete require.cache[require.resolve('../api/tenant-signup')];
  return require('../api/tenant-signup');
}
function check(condition, message) { assert.ok(condition, message); checks++; console.log('  ok   ' + message); }
async function run() {
  var cases = [[undefined, 14], [30, 14], [3650, 14], [14, 14], [7, 7], [0, 0]];
  for (var i = 0; i < cases.length; i++) {
    db = new F.DB();
    var endpoint = load(cases[i][0]), before = Date.now();
    var response = await endpoint(request), after = Date.now();
    var end = Date.parse(response.trialEndsAt), duration = cases[i][1] * 86400000;
    check(end >= before + duration && end <= after + duration, 'TRIAL_DAYS=' + cases[i][0] + ' grants ' + cases[i][1] + ' days');
    check(db.data.get('omega_orgs/signup.example/billing/current').trialEndsAt === response.trialEndsAt, 'stored end matches response');
    var snapshot = JSON.stringify(Array.from(db.data.entries())), claimed = claimsWrites, mailed = mailWrites;
    await load(999)(request);
    check(JSON.stringify(Array.from(db.data.entries())) === snapshot && claimsWrites === claimed && mailWrites === mailed, 'repeat signup makes no writes or trial reset');
  }
  db = new F.DB();
  db.seed('omega_orgs/signup.example', { name: 'Existing', status: 'active', domains: ['existing.example'] });
  db.seed('omega_orgs/signup.example/billing/current', { tier: 'trial', trialEndsAt: '2027-01-01T00:00:00.000Z', billingDay: 31 });
  var original = JSON.stringify(Array.from(db.data.entries()));
  check((await load(14)(request)).exists === true, 'existing organization follows the join path');
  check(JSON.stringify(Array.from(db.data.entries())) === original, 'legacy longer trial and billing date remain untouched');
  for (var invalid of ['not-a-number', -1, Infinity]) {
    db = new F.DB();
    await assert.rejects(load(invalid)(request), function (e) { return e.status === 500; });
    check(db.data.size === 0, 'invalid configuration ' + invalid + ' creates no documents');
  }
  process.env.PACKAGING_SIGNUP_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  var book = require('../api/_lib/pricebook').proposed(); book.enabled = true;
  function packagedDb() { db = new F.DB(); db.serial = true; db.seed('pricebook/' + book.version, book); }
  var profile = { legalName: 'Fixture Company', contactName: 'Test Owner', email: caller.email, phone: '555-0100',
    address: { line1: '1 Main', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'installer', teamSize: 3 };
  var packagedRequest = { method: 'POST', headers: {}, body: Object.assign({}, request.body, { billingProfile: profile, modules: ['lite', 'storage'] }) };
  packagedDb(); var packaged = load(99);
  check((await packaged({ method: 'GET' })).packaging === true, 'signup metadata comes from enabled server catalog');
  var newResult = await packaged(packagedRequest), orgPath = 'omega_orgs/signup.example';
  check(newResult.trialStartsOnApproval === true && newResult.trialEndsAt === null, 'pending signup does not start its trial');
  var current = db.data.get(orgPath + '/billing/current');
  check(current.trialDurationDays === 14 && current.trialStartedAt === undefined && current.trialEndsAt === undefined, 'pending trial duration capped without dates');
  check(current.proposedPackage.modules.includes('storage') && current.modules.length === 1, 'requested package is proposed, not granted');
  check(db.data.get(orgPath + '/billing/profile').email === caller.email, 'billing profile stored privately');
  check(typeof db.data.get(orgPath).signedUpAt === 'number', 'original signup instant recorded for billing anchor');
  var publicRecord = JSON.stringify(db.data.get('tenant_public/signup.clearskyomega.com'));
  check(!publicRecord.includes(caller.email) && !publicRecord.includes('555-0100') && !publicRecord.includes('1 Main'), 'public branding has no billing contact data');
  var saved = JSON.stringify(Array.from(db.data.entries())), sends = mailWrites;
  await packaged(packagedRequest);
  check(JSON.stringify(Array.from(db.data.entries())) === saved && mailWrites === sends, 'repeat packaged signup preserves all data');
  packagedDb();
  await assert.rejects(packaged(request), /Billing profile/);
  check(db.data.size === 1, 'missing billing profile creates no organization');
  for (var unverified of [false, undefined, 'true']) {
    caller.claims.email_verified = unverified;
    await assert.rejects(packaged(packagedRequest), /verify your email/);
    check(db.data.size === 1, 'unverified signup refused: ' + unverified);
  }
  caller.claims.email_verified = true;
  process.env.QBO_ENV = 'production';
  await assert.rejects(packaged(packagedRequest), /sandbox-only/);
  check(db.data.size === 1, 'production environment cannot enroll a packaging sandbox tenant');
  process.env.QBO_ENV = 'sandbox';
  packagedDb(); db.data.get('pricebook/' + book.version).enabled = false;
  await assert.rejects(packaged(packagedRequest), /not enabled/);
  check(db.data.size === 1, 'disabled price book refuses signup');
  packagedDb();
  var concurrent = await Promise.all([packaged(packagedRequest), packaged(packagedRequest)]);
  check(concurrent.filter(function (r) { return r.created; }).length === 1, 'concurrent signup creates one organization');
  check(concurrent.filter(function (r) { return r.exists; }).length === 1, 'concurrent repeat joins existing organization');
  console.log('\nall ' + checks + ' signup checks passed');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () {
  if (oldPackaging === undefined) delete process.env.PACKAGING_SIGNUP_ENABLED; else process.env.PACKAGING_SIGNUP_ENABLED = oldPackaging;
  if (oldQbo === undefined) delete process.env.QBO_ENV; else process.env.QBO_ENV = oldQbo;
  if (oldDays === undefined) delete process.env.TRIAL_DAYS; else process.env.TRIAL_DAYS = oldDays;
});
