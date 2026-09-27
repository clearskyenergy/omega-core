/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), F = require('./_lib/firestore-double'), B = require('../api/_lib/pricebook');
var db, calls = 0, count = 0, sent = 0, now = Date.now(), root = 'omega_orgs/package.example';
var profile = { legalName: 'Test Company', contactName: 'Test Owner', email: 'owner@package.example', phone: '555-0100',
  address: { line1: '1 Main', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'developer', teamSize: 3 };
var staff = { staff: true, uid: 'staff', email: 'staff@clearsky-usa.com', claims: { email_verified: true } };
var owner = { staff: false, uid: 'owner', email: profile.email, orgId: 'package.example', role: 'owner', claims: { email_verified: true } };
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function (req) { return req.caller; }, db: function () { return db; },
  httpError: function (status, text) { var e = new Error(text); e.status = status; return e; }, safeOrg: function (s) { return /^[a-z0-9.-]+\.[a-z]+$/.test(s || '') ? s : null; },
  isTenantAdmin: async function (c, o) { return c.orgId === o && ['owner', 'admin'].indexOf(c.role) >= 0; },
  init: function () { return { storage: function () { return { bucket: function () { return { file: function () { return { getMetadata: async function () { return [{ size: '10', contentType: 'application/pdf' }]; } }; } }; } }; } }; },
  FieldValue: function () { return { serverTimestamp: function () { return now; } }; } });
F.mock('../api/_lib/mail', { templates: { approved: async function () { sent++; return { ok: true }; } } });
var Q = require('../api/_lib/qbo-billing');
Q.driver = function () { return { customer: async function () { calls++; return 'C1'; }, invoice: async function (plan) { calls++; return { id: 'I1', totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/test' }; }, reconcile: async function () { calls++; return { satisfied: false, paidCents: 0, payUrl: null }; } }; };
var packageApi = require('../api/tenant-package'), profileApi = require('../api/billing-profile'), legacyBilling = require('../api/tenant-billing'), approveApi = require('../api/tenant-approve');
var Runner = require('../api/_lib/package-billing-runner'), res = { setHeader: function () {} };
function seed() { db = new F.DB(); db.serial = true; var book = B.proposed(); book.enabled = true; book.qbo.realmId = '123'; db.seed('pricebook/' + book.version, book);
  db.seed(root, { name: 'Test Company', status: 'pending', signedUpAt: now - 86400000, packagingSandbox: true, domains: ['package.example'] });
  db.seed(root + '/billing/current', { packaged: true, packagingState: 'pending', modules: ['lite'], pricebookVersion: B.VERSION }); db.seed(root + '/billing/profile', profile); }
function req(method, body, caller) { return { method: method, query: body, body: body, caller: caller || staff, headers: {} }; }
function equal(a, b) { assert.deepStrictEqual(a, b); count++; }
async function denied(fn, status) { await assert.rejects(fn, function (e) { return e.status === status; }); count++; }
async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox'; seed();
  equal((await packageApi(req('GET', { orgId: 'package.example' }, owner), res)).canManagePackage, false);
  await denied(function () { return packageApi(req('POST', { modules: ['lite'] }, owner), res); }, 403);
  await denied(function () { return packageApi(req('GET', { orgId: 'other.example' }, owner), res); }, 403);
  await denied(function () { return profileApi(req('GET', {}, Object.assign({}, owner, { role: 'member' })), res); }, 403);
  await denied(function () { return profileApi(req('GET', {}, Object.assign({}, owner, { claims: { email_verified: 'true' } })), res); }, 403);
  equal((await profileApi(req('GET', {}, owner), res)).profile.email, owner.email);
  await denied(function () { return legacyBilling(req('POST', { orgId: 'package.example', trialEndsAt: '2099-01-01' })); }, 409);
  await denied(function () { return legacyBilling(req('POST', { orgId: 'package.example', tier: 'enterprise' })); }, 409);
  await denied(function () { return approveApi(req('POST', { orgId: 'package.example', action: 'approve' })); }, 400);
  await denied(function () { return packageApi(req('POST', { orgId: 'package.example', modules: ['lite'], amountDue: 1 }), res); }, 400);
  var cert = { orgId: 'package.example', certificatePath: 'billing-certificates/package.example/test.pdf' };
  await denied(function () { return profileApi(req('POST', cert, owner), res); }, 403);
  await denied(function () { return profileApi(req('POST', Object.assign({}, cert, { certificatePath: 'billing-certificates/other.example/test.pdf' })), res); }, 400);
  await profileApi(req('POST', cert), res);
  equal(db.data.get(root + '/billing/profile').certificate.path, cert.certificatePath);
  var before = calls;
  await profileApi(req('POST', { profile: Object.assign({}, profile, { phone: '555-0123' }) }, owner), res);
  equal(calls, before); equal(db.data.get(root + '/billing/profile').phone, '555-0123');
  equal(db.data.get(root + '/billing/profile').certificate.path, cert.certificatePath);
  var body = { orgId: 'package.example', action: 'approve', modules: ['lite'], interval: 'annual' };
  var preview = await packageApi(req('POST', body), res);
  equal(preview.dryRun, true); equal(calls, before); equal(preview.quote.interval, 'annual');
  await denied(function () { return packageApi(req('POST', Object.assign({}, body, { credit: true })), res); }, 409);
  var approved = await packageApi(req('POST', Object.assign({}, body, { effectiveAt: preview.effectiveAt, previewId: preview.previewId, dryRun: false })), res);
  equal(approved.packagingState, 'trial'); equal(calls, before + 1);
  await profileApi(req('POST', { profile: Object.assign({}, profile, { phone: '555-0199' }) }, owner), res);
  equal(calls, before + 2); equal(db.data.get(root + '/billing/profile').phone, '555-0199');
  db.data.get(root + '/billing/current').activationLock = { id: 'other', until: Date.now() + 60000 };
  await denied(function () { return profileApi(req('POST', { profile: profile }, owner), res); }, 409);
  db.data.get(root + '/billing/current').activationLock = null;
  await Runner.deliver(db, 'package.example', now, { templates: { approved: async function () { sent++; return { ok: true }; } } });
  await Runner.deliver(db, 'package.example', now, { templates: { approved: async function () { sent++; return { ok: true }; } } });
  equal(sent, 1); equal(db.data.get(root + '/notifications/package-approved').mailState, 'sent');
  var billing = db.data.get(root + '/billing/current');
  await Runner.notice(db, 'package.example', billing.trialStartedAt + 10 * 86400000);
  await Runner.notice(db, 'package.example', billing.trialStartedAt + 10 * 86400000);
  equal(Array.from(db.data.keys()).filter(function (k) { return k.endsWith('/package-trial-day-11'); }).length, 1);
  var saved = JSON.stringify(Array.from(db.data.entries())); delete process.env.PACKAGING_BILLING_ENABLED;
  equal(await Runner.tick(db, now), { disabled: true }); equal(JSON.stringify(Array.from(db.data.entries())), saved);
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'production';
  equal((await Runner.tick(db, now)).disabled, true); equal(JSON.stringify(Array.from(db.data.entries())), saved);
  process.env.QBO_ENV = 'sandbox'; process.env.CRON_SECRET = 'test-only-secret';
  assert.throws(function () { Runner.authorize({ headers: {} }); }, /authorization/); count++;
  assert.throws(function () { Runner.authorize({ headers: { authorization: 'Bearer wrong' } }); }, /authorization/); count++;
  Runner.authorize({ headers: { authorization: 'Bearer test-only-secret' } }); count++;
  db.seed('integrations/quickbooks', { realmId: '123' }); process.env.QBO_WEBHOOK_VERIFIER_TOKEN = 'fixture-webhook-secret';
  var raw = Buffer.from(JSON.stringify({ eventNotifications: [{ realmId: '123', dataChangeEvent: { entities: [{ name: 'Invoice', id: 'I1', operation: 'Update', paid: true, Balance: 0 }] } }] }));
  var stream = require('stream').Readable.from([raw]); stream.method = 'POST'; stream.headers = { 'intuit-signature': require('crypto').createHmac('sha256', process.env.QBO_WEBHOOK_VERIFIER_TOKEN).update(raw).digest('base64') };
  var beforeHint = JSON.stringify(db.data.get(root + '/billing/current'));
  await require('../api/logic-webhook')(stream);
  equal(JSON.stringify(db.data.get(root + '/billing/current')), beforeHint);
  equal(Array.from(db.data.keys()).filter(function (k) { return k.indexOf('integrations/quickbooks/events/') === 0; }).length, 1);
  var ending = billing.trialEndsAt + 1000, mailed = 0;
  var opts = { mail: { templates: { trialEnding: async function () { mailed++; return { ok: true }; }, packageInvoice: async function () { mailed++; return { ok: true }; } } } };
  var tick = await Runner.tick(db, ending, opts);
  equal(tick.results[0].invoice.issued, true); equal(db.data.get(root + '/billing/current').packagingState, 'awaiting_payment');
  equal(mailed, 2);
  await Runner.tick(db, ending, opts); await Runner.tick(db, ending, opts);
  equal(Array.from(db.data.keys()).filter(function (k) { return /\/invoices\//.test(k); }).length, 1);
  equal(mailed, 2);
  var enable = require('./enable-packaging-sandbox'), book = B.proposed(), enableDb = new F.DB(); book.qbo.realmId = '123';
  require('../api/_lib/qbo-items').items(book).forEach(function (item, i) { book.qbo.items[item.key] = String(i + 1); });
  enableDb.seed('pricebook/' + book.version, book);
  var dry = await enable(enableDb, false); equal(enableDb.data.get('pricebook/' + book.version).enabled, false);
  await assert.rejects(function () { return enable(enableDb, true, 'wrong'); }, /expected-hash/); count++;
  await enable(enableDb, true, dry.expectedHash, { Q: { ENV: 'sandbox', IS_SANDBOX: true, API_BASE: 'https://sandbox-quickbooks.api.intuit.com', load: async function () { return { env: 'sandbox', realmId: '123' }; } } });
  equal(enableDb.data.get('pricebook/' + book.version).enabled, true);
  console.log('Package billing API and runner: ' + count + ' passed; no network or live email.');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; });
