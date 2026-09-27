/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The Stripe card rail for packaged billing (api/_lib/stripe-billing.js and
 * the engine around it), offline: the shared Firestore double with
 * Firestore's own set-merge and a refusal of any `undefined` written, the
 * call-recording Stripe double (scripts/_lib/stripe-double.js) handed in as
 * the supplied client, admin and mail mocked before anything loads, the
 * `stripe` module stubbed for the endpoints that make their own client, and
 * QuickBooks' driver stubbed to throw so the Stripe rail can never reach it.
 * Env pinned per case and restored at the end. No network.
 *   node scripts/test-stripe-billing.js
 */
'use strict';
var assert = require('node:assert/strict'), crypto = require('crypto'), Module = require('module'), Readable = require('stream').Readable;
var F = require('./_lib/firestore-double'), StripeDouble = require('./_lib/stripe-double');

/* ── env: pinned for every case, restored in finally ─────────────────────── */
var ENV = ['PACKAGING_BILLING_ENABLED', 'QBO_ENV', 'PACKAGING_LIVE', 'PACKAGING_RAIL', 'STRIPE_PACKAGING_SECRET_KEY', 'STRIPE_SECRET_KEY',
  'STRIPE_PACKAGING_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET', 'TENANT_WILDCARD_LIVE', 'TRIAL_DAYS',
  'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM', 'MAIL_DEV_USER', 'MAIL_DEV_PASS', 'MAIL_DEV_FROM'];
var savedEnv = {}; ENV.forEach(function (k) { savedEnv[k] = process.env[k]; });
var KEY = 'sk_test_omegaFixture01', HOOK_SECRET = 'whsec_omegaFixture01';
var BASE = { PACKAGING_BILLING_ENABLED: 'true', QBO_ENV: 'sandbox', PACKAGING_RAIL: 'stripe', STRIPE_PACKAGING_SECRET_KEY: KEY,
  STRIPE_PACKAGING_WEBHOOK_SECRET: HOOK_SECRET, STRIPE_SECRET_KEY: 'sk_test_legacyFixture01', STRIPE_WEBHOOK_SECRET: 'whsec_legacyFixture01' };
function pin(over) {
  ENV.forEach(function (k) { delete process.env[k]; });
  Object.keys(BASE).forEach(function (k) { process.env[k] = BASE[k]; });
  Object.keys(over || {}).forEach(function (k) { if (over[k] == null) delete process.env[k]; else process.env[k] = over[k]; });
}
function restoreEnv() { ENV.forEach(function (k) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }); }
pin();

/* ── Firestore as the Admin SDK behaves: set({merge}) merges maps
   recursively (the shared double's merge is one level deep), and an
   `undefined` anywhere in a write is refused (like test-ledger-sync.js) ── */
function noUndefined(v, where) {
  if (v === undefined) throw new Error('undefined written at ' + where);
  if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndefined(v[k], where + '.' + k); });
}
function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function merged(old, v) {
  var out = isMap(old) ? F.clone(old) : {};
  Object.keys(v).forEach(function (k) { out[k] = isMap(v[k]) && isMap(out[k]) ? merged(out[k], v[k]) : F.clone(v[k]); });
  return out;
}
var real = { runOne: F.DB.prototype.runOne, set: F.Ref.prototype.set, update: F.Ref.prototype.update, create: F.Ref.prototype.create };
F.DB.prototype.runOne = function (fn) {
  var db = this, writes = [], writing = false;
  if (db.crashNextTx) { db.crashNextTx = false; return Promise.reject(new Error('simulated crash before the write')); }
  var tx = { get: async function (r) { assert.equal(writing, false, 'no reads after writes'); return r.get(); },
    create: function (r, v) { noUndefined(v, r.path); writing = true; writes.push(function () { assert(!db.data.has(r.path), 'create must not overwrite ' + r.path); db.seed(r.path, v); }); },
    set: function (r, v, o) { noUndefined(v, r.path); writing = true; writes.push(function () { db.seed(r.path, o && o.merge ? merged(db.data.get(r.path), v) : v); }); },
    update: function (r, v) { noUndefined(v, r.path); writing = true; writes.push(function () { assert(db.data.has(r.path), 'update needs ' + r.path); db.data.set(r.path, F.patch(F.clone(db.data.get(r.path)), v)); }); } };
  return Promise.resolve(fn(tx)).then(function (out) { writes.forEach(function (w) { w(); }); return out; });
};
F.Ref.prototype.set = async function (v, o) { noUndefined(v, this.path); this.db.seed(this.path, o && o.merge ? merged(this.db.data.get(this.path), v) : v); };
F.Ref.prototype.update = function (v) { noUndefined(v, this.path); return real.update.call(this, v); };
F.Ref.prototype.create = function (v) { noUndefined(v, this.path); return real.create.call(this, v); };

/* ── the clock, the network, admin and mail: stood in before anything loads ── */
var clock = Date.parse('2026-09-26T12:00:00Z'), realNow = Date.now, realFetch = global.fetch;
Date.now = function () { return clock; };
global.fetch = function () { throw new Error('no network in this test'); };
var db, mails = [];
function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
var A = {
  db: function () { return db; },
  safeOrg: function (v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : ''; },
  httpError: httpError, authenticate: async function (req) { return req.caller; },
  isTenantAdmin: async function (c, o) { return c.staff || (c.orgId === o && ['owner', 'admin'].indexOf(c.role) >= 0); },
  canActInOrg: async function (c, o) { return c.staff || c.orgId === o; }, isDegraded: function () { return false; },
  billingOf: async function (o) { var r = await db.doc('omega_orgs/' + o + '/billing/current').get(); return r.exists ? r.data() : {}; },
  FieldValue: function () { return { serverTimestamp: function () { return 'SERVER_TIMESTAMP'; } }; },
  /* the real handler's contract (api/_lib/admin.js), returning its promise so a test can wait */
  handler: function (fn) {
    return function (req, res) {
      return Promise.resolve().then(function () { return fn(req, res); })
        .then(function (out) { if (out !== undefined && !res.headersSent) res.status(200).json(out); })
        .catch(function (err) { if (!res.headersSent) res.status(err.status || 500).json({ error: err.message || 'error' }); });
    };
  }
};
F.mock('../api/_lib/admin', A);
var templates = {};
['paid', 'paidAlert', 'billingAlert', 'packageInvoice', 'approved', 'trialEnding', 'optInAlert', 'signupReceived', 'signupAlert'].forEach(function (name) {
  templates[name] = async function (payload) { mails.push({ name: name, payload: payload }); return { ok: true }; };
});
F.mock('../api/_lib/mail', { templates: templates });

/* ── the `stripe` module, for endpoints that make their own client: hands
   back the scenario's double and records the key it was given ── */
var stripe = null, made = [], realLoad = Module._load, smtp = [];
function stripeModule(key, opts) { made.push({ key: key, opts: opts || null }); return stripe; }
/* nodemailer, for the one section that reads the real mail templates: kept, never sent */
var nodemailerStub = { createTransport: function () { return { sendMail: async function (msg) { smtp.push(msg); return { messageId: 'kept-' + smtp.length }; } }; } };
Module._load = function (request) { if (request === 'stripe') return stripeModule; if (request === 'nodemailer') return nodemailerStub; return realLoad.apply(this, arguments); };

var B = require('../api/_lib/pricebook'), S = require('../api/_lib/package-billing'), Q = require('../api/_lib/qbo-billing'), M = require('../api/_lib/modules');
var Mode = require('../api/_lib/packaging-mode'), SB = require('../api/_lib/stripe-billing'), C = require('../api/_lib/plan-change'), PA = require('../api/_lib/package-access');
var originalDriver = Q.driver, qboCalls = 0;
function qboForbidden() { Q.driver = function () { qboCalls++; throw new Error('QuickBooks must not be reached on the Stripe rail'); }; }
qboForbidden();

/* ── assertions ── */
var count = 0;
function equal(a, b, text) { assert.deepStrictEqual(a, b, text); count++; }
function ok(v, text) { assert(v, text); count++; }
async function refused(fn, re, status) {
  var e = await Promise.resolve().then(fn).then(function () { return null; }, function (x) { return x; });
  assert(e, 'expected a refusal matching ' + re);
  assert.match(String(e.message), re);
  if (status) assert.equal(e.status, status, e.message);
  count++; return e;
}
function response() {
  return { code: 0, body: null, headers: {}, headersSent: false, writes: 0,
    status: function (c) { this.code = c; return this; },
    setHeader: function (k, v) { if (this.headersSent) throw new Error('ERR_HTTP_HEADERS_SENT'); this.headers[String(k).toLowerCase()] = v; return this; },
    json: function (b) { if (this.headersSent) throw new Error('ERR_HTTP_HEADERS_SENT: a second response'); this.body = b; this.writes++; this.headersSent = true; return this; },
    send: function (b) { if (this.headersSent) throw new Error('ERR_HTTP_HEADERS_SENT: a second response'); this.body = b; this.writes++; this.headersSent = true; return this; },
    end: function (b) { if (this.headersSent) throw new Error('ERR_HTTP_HEADERS_SENT: a second response'); if (b !== undefined) this.body = b; this.writes++; this.headersSent = true; return this; } };
}

/* ── the workspace ── */
var ORG = 'cardco.example', ROOT = 'omega_orgs/' + ORG, CUR = ROOT + '/billing/current', HOME = 'silmarillion.clearskyomega.com', FIRST = '2026-09-26';
var START = Date.parse('2026-09-26T12:00:00Z');
var STAFF = { staff: true, uid: 'staff', email: 'staff@clearsky-usa.com', claims: { email_verified: true } };
var OWNER = { staff: false, uid: 'owner', email: 'owner@' + ORG, orgId: ORG, role: 'owner', claims: { email_verified: true } };
var VISA = { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 }, MC = { brand: 'mastercard', last4: '4444', exp_month: 3, exp_year: 2031 };
var META = function (record, ref) { return { kind: 'omega-package', org: ORG, record: record, ref: ref, env: 'sandbox' }; };
function profile(org) {
  return { legalName: 'Card Co LLC', contactName: 'Casey Card', email: 'ap@' + org, phone: '555-0100',
    address: { line1: '1 Card Way', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'developer', teamSize: 3 };
}
function tenant(billing) {
  clock = START; db = new F.DB(); db.serial = true; stripe = StripeDouble.create(); mails.length = 0; made.length = 0;
  var book = B.proposed(); book.enabled = true; book.qbo.realmId = 'sandbox-realm'; db.seed('pricebook/' + book.version, book);
  db.seed(ROOT, { name: 'Card Co', status: 'active', signedUpAt: '2026-09-20T12:00:00Z', packagingSandbox: true, domains: [ORG] });
  db.seed(CUR, billing || { packagingSignup: true, proposedPackage: { modules: ['lite'], interval: 'monthly' } });
  db.seed(ROOT + '/billing/profile', profile(ORG));
  db.seed(ROOT + '/members/owner', { role: 'owner', status: 'active', email: OWNER.email });
}
function bill() { return db.data.get(CUR); }
function record(id) { return db.data.get(CUR + '/invoices/' + id); }
function note(id) { return db.data.get(ROOT + '/notifications/' + id); }
function staffNote(id) { return db.data.get('omega_orgs/clearsky-usa.com/notifications/' + id); }
function snapshot() { return JSON.stringify(Array.from(db.data.entries())); }
function paths(part) { return Array.from(db.data.keys()).filter(function (p) { return p.indexOf(part) >= 0; }); }
function sum(items) { return items.reduce(function (n, l) { return n + l.price_data.unit_amount * l.quantity; }, 0); }
function done(what) { return 'https://' + HOME + '/workspace?checkout=' + what + '#billing'; }
async function activate(opts) {
  opts = opts || {};
  var body = { action: 'activate', modules: opts.modules || ['lite', 'evrebates'], credit: !!opts.credit, pricebookVersion: B.VERSION };
  var v = await S.preview(db, ORG, body, clock);
  body = Object.assign({}, body, { previewId: v.previewId, effectiveAt: v.effectiveAt });
  return { result: await S.apply(db, ORG, body, STAFF, clock, { stripe: stripe }), body: body, preview: v };
}
/* the payer's visit: the pay link opens Checkout, the card is taken, Checkout sends them back */
async function pay(recordId, card) {
  var go = await SB.checkout(db, ORG, recordId, clock, stripe), sid = record(recordId).stripe.openSession.id;
  stripe.complete(sid, card || VISA);
  return { go: go, sid: sid, back: await SB.returned(db, ORG, recordId, sid, clock, stripe) };
}
async function paidCardTenant() { tenant(); await activate(); await pay(FIRST, VISA); }
function sign(raw, t, secret) { return 't=' + t + ',v1=' + crypto.createHmac('sha256', secret || HOOK_SECRET).update(t + '.' + raw).digest('hex'); }

async function run() {
  /* ── a) the one mode rule: the rail, the key, the event mode ─────────── */
  pin({ PACKAGING_RAIL: null }); equal(Mode.rail(), 'quickbooks', 'the default rail is QuickBooks');
  ['Stripe', 'STRIPE', 'true', 'stripe ', '1', ''].forEach(function (v) { pin({ PACKAGING_RAIL: v }); equal(Mode.rail(), 'quickbooks', 'only the literal word switches the rail: ' + JSON.stringify(v)); });
  pin(); equal(Mode.rail(), 'stripe');
  equal(Mode.stripeKey(), KEY, 'SANDBOX takes a test key');
  pin({ STRIPE_PACKAGING_SECRET_KEY: 'rk_test_restricted9' }); equal(Mode.stripeKey(), 'rk_test_restricted9', 'and a restricted test key');
  pin({ STRIPE_PACKAGING_SECRET_KEY: 'sk_live_abc123' }); equal(Mode.stripeKey(), null, 'a live key is refused in SANDBOX');
  pin({ STRIPE_PACKAGING_SECRET_KEY: null, STRIPE_SECRET_KEY: 'sk_test_shared9' }); equal(Mode.stripeKey(), 'sk_test_shared9', 'the shared key when packaging has none of its own');
  pin({ STRIPE_PACKAGING_SECRET_KEY: 'sk_live_abc123', STRIPE_SECRET_KEY: 'sk_test_shared9' }); equal(Mode.stripeKey(), null, 'a packaging key of the other mode is no key at all; it never falls back to the shared one');
  pin({ STRIPE_PACKAGING_SECRET_KEY: 'pk_test_abc123' }); equal(Mode.stripeKey(), null, 'a publishable key is not a secret key');
  pin({ STRIPE_PACKAGING_SECRET_KEY: 'sk_test_abc 123' }); equal(Mode.stripeKey(), null, 'a malformed key is refused');
  pin({ STRIPE_PACKAGING_SECRET_KEY: null, STRIPE_SECRET_KEY: null }); equal(Mode.stripeKey(), null);
  pin({ PACKAGING_LIVE: 'true', QBO_ENV: 'production', STRIPE_PACKAGING_SECRET_KEY: 'sk_live_abc123' }); equal(Mode.stripeKey(), 'sk_live_abc123', 'LIVE takes a live key'); equal(Mode.env(), 'production');
  pin({ PACKAGING_LIVE: 'true', QBO_ENV: 'production' }); equal(Mode.stripeKey(), null, 'a test key is refused in LIVE');
  pin({ PACKAGING_LIVE: 'TRUE', QBO_ENV: 'production', STRIPE_PACKAGING_SECRET_KEY: 'sk_live_abc123' }); equal(Mode.stripeKey(), null, 'the live switch is literal');
  pin({ QBO_ENV: null }); equal([Mode.open(), Mode.stripeKey()], [false, null], 'no mode: no key');
  pin({ QBO_ENV: 'production', STRIPE_PACKAGING_SECRET_KEY: 'sk_live_abc123' }); equal(Mode.stripeKey(), null, 'the production company without the live switch: no key');
  pin({ PACKAGING_LIVE: 'true', QBO_ENV: null, STRIPE_PACKAGING_SECRET_KEY: 'sk_live_abc123' }); equal(Mode.stripeKey(), null, 'the live switch without QBO_ENV: no key');
  pin(); equal([Mode.stripeModeOk(false), Mode.stripeModeOk(true), Mode.stripeModeOk(undefined), Mode.stripeModeOk('false'), Mode.stripeModeOk(0)], [true, false, false, false, false], 'SANDBOX takes test-mode objects only, and only a real boolean');
  pin({ PACKAGING_LIVE: 'true', QBO_ENV: 'production' }); equal([Mode.stripeModeOk(true), Mode.stripeModeOk(false)], [true, false], 'LIVE takes live-mode objects only');
  pin({ QBO_ENV: null }); equal([Mode.stripeModeOk(false), Mode.stripeModeOk(true)], [false, false], 'no mode takes nothing');
  pin();

  /* ── b) the pay link: signed, durable, and only ours or QuickBooks' shown ── */
  var link = SB.payLink(HOME, ORG, FIRST), u = new URL(link), sig = u.searchParams.get('s');
  equal(u.origin + u.pathname, 'https://' + HOME + '/api/package-pay'); equal([u.searchParams.get('o'), u.searchParams.get('r')], [ORG, FIRST]); ok(/^[a-f0-9]{40}$/.test(sig));
  equal(SB.verifyLink(ORG, FIRST, sig), true, 'the link verifies');
  equal(SB.verifyLink('other.example', FIRST, sig), false, 'another workspace: refused');
  equal(SB.verifyLink(ORG, '2026-10-20', sig), false, 'another record: refused');
  var flipped = sig.slice(0, -1) + (sig.slice(-1) === '0' ? '1' : '0');
  [flipped, sig.toUpperCase(), sig.slice(0, 39), sig + '0', '', null, undefined, 12].forEach(function (s) { equal(SB.verifyLink(ORG, FIRST, s), false, 'a tampered signature: ' + JSON.stringify(s)); });
  ['abc', '../../x', 'a/b/c/d/e', '', null].forEach(function (r) { equal(SB.verifyLink(ORG, r, sig), false, 'an invalid record id: ' + JSON.stringify(r)); });
  equal(SB.verifyLink('', FIRST, sig), false, 'no workspace');
  pin({ STRIPE_PACKAGING_SECRET_KEY: 'sk_test_rotated77' }); equal(SB.verifyLink(ORG, FIRST, sig), false, 'a link signed under another key opens nothing');
  pin({ QBO_ENV: null }); assert.throws(function () { SB.verifyLink(ORG, FIRST, sig); }, /not set up/); count++;
  pin();
  equal(SB.safePayLink(link, {}), link, 'our pay path on the open host');
  equal(SB.safePayLink(link.replace(HOME, 'cardco.clearskyomega.com'), {}), link.replace(HOME, 'cardco.clearskyomega.com'), 'our pay path on any clearskyomega.com host');
  var intuit = 'https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-abc';
  equal(SB.safePayLink(intuit, {}), intuit, 'QuickBooks\' own pay page (the logic-policy pin)');
  var query = u.search;
  ['https://evil.example/api/package-pay' + query, 'http://' + HOME + '/api/package-pay' + query, 'https://' + HOME + '/api/package-pay/x' + query, 'https://' + HOME + '/api/plan-change' + query,
    'https://clearskyomega.com.evil.example/api/package-pay' + query, 'https://evilclearskyomega.com/api/package-pay' + query, 'https://user:pw@' + HOME + '/api/package-pay' + query,
    'https://' + HOME + '/api/package-pay?o=' + ORG + '&r=' + FIRST, 'https://' + HOME + '/api/package-pay?o=' + ORG + '&r=' + FIRST + '&s=NOTHEX', 'https://' + HOME + '/api/package-pay?r=' + FIRST + '&s=' + sig,
    'javascript:alert(1)', 'not a url', '', null, undefined].forEach(function (v) { equal(SB.safePayLink(v, {}), null, 'refused: ' + v); });
  var attached = { domains: ['pay.cardco.example'], hostAttached: true }, onAttached = SB.payLink('pay.cardco.example', ORG, FIRST);
  equal(SB.safePayLink(onAttached, attached), onAttached, 'the workspace\'s own attached host');
  equal(SB.safePayLink(onAttached, { domains: ['pay.cardco.example'] }), null, 'a host that is only reserved is not the workspace\'s');
  equal(SB.safePayLink(onAttached, {}), null);

  /* Stripe's errors in the engine's words: ClearSky's side (retried) or the record's (a person) */
  function wrapped(type, statusCode, extra) { var e = new Error('boom'); e.type = type; if (statusCode) e.statusCode = statusCode; Object.assign(e, extra || {}); var w = SB.wrap(e); return [w.status, w.clearsky, w.stripeType]; }
  equal(wrapped('StripeConnectionError'), [502, true, 'StripeConnectionError'], 'no answer from Stripe: ours, retried');
  equal(wrapped('StripeAPIError', 500), [500, true, 'StripeAPIError']);
  equal(wrapped('StripeRateLimitError', 429), [429, true, 'StripeRateLimitError'], 'rate limited: ours');
  equal(wrapped('StripeAuthenticationError', 401), [401, true, 'StripeAuthenticationError'], 'our key refused: ours');
  equal(wrapped('StripePermissionError', 403), [403, true, 'StripePermissionError']);
  equal(wrapped('StripeCardError', 402, { code: 'card_declined' }), [402, false, 'StripeCardError'], 'a declined card is the record\'s');
  equal(wrapped('StripeInvalidRequestError', 404, { code: 'resource_missing' }), [404, false, 'StripeInvalidRequestError']);
  var plainError = new Error('not Stripe\'s'); equal(SB.wrap(plainError), plainError, 'anything else passes through as it is');

  /* ── c) activation on the Stripe rail ─────────────────────────────────── */
  tenant(); qboCalls = 0;
  var act = await activate();
  equal(act.preview.billingPatch.billingProvider, 'stripe', 'the preview names the rail'); equal(act.preview.billingPatch.paymentProvider, 'stripe-checkout');
  var r0 = act.result;
  equal([r0.packagingState, r0.rail, r0.paymentLink], ['awaiting_payment', 'stripe', SB.payLink(HOME, ORG, FIRST)], 'awaiting payment on the signed pay link');
  var b0 = bill();
  equal([b0.billingProvider, b0.paymentProvider], ['stripe', 'stripe-checkout']);
  ok(/^cus_/.test(b0.stripe.customerId), 'the Stripe customer lives at billing.stripe.customerId'); equal(b0.stripe.env, 'sandbox');
  equal([b0.stripeCustomerId, b0.qboCustomerId, b0.qboRealmId], [undefined, undefined, undefined], 'never the legacy top-level stripeCustomerId, never a QuickBooks customer');
  equal([b0.packagingState, b0.modules, b0.paymentLink], ['awaiting_payment', ['lite'], r0.paymentLink]);
  var rec0 = record(FIRST);
  equal(rec0.provider, 'stripe'); equal(rec0.stripeRef, SB.refOf('OMEGA subscription ' + ORG + ' / ' + FIRST)); ok(/^stp_[a-f0-9]{24}$/.test(rec0.stripeRef));
  equal('qboInvoiceId' in rec0, false, 'a Stripe record has no QuickBooks invoice (one rail per charge)');
  equal([rec0.state, rec0.paymentLink, rec0.totalCents], ['unpaid', r0.paymentLink, rec0.lines.reduce(function (n, l) { return n + l.amountCents; }, 0)]);
  equal(rec0.stripe, { customerId: b0.stripe.customerId, org: ORG, env: 'sandbox', paymentIntents: [], sessions: [], sessionCount: 0, lastCharge: null });
  equal(b0.amountDue, rec0.totalCents / 100);
  equal([S.invoiceRef(rec0), S.customerOf(b0), S.railOf(b0), S.recordRail(rec0)], [rec0.stripeRef, b0.stripe.customerId, 'stripe', 'stripe']);
  equal(qboCalls, 0, 'the QuickBooks driver is never reached');
  equal(stripe.count('customers.create'), 1); var cc = stripe.callsOf('customers.create')[0];
  equal(cc[0].metadata, { kind: 'omega-package', org: ORG }); equal(cc[0].description, 'OMEGA-' + ORG); equal(cc[0].email, 'ap@' + ORG); ok(/^[a-f0-9]{48}$/.test(cc[1].idempotencyKey));
  equal([stripe.count('paymentIntents.create'), stripe.count('checkout.sessions.create')], [0, 0], 'no card on file: nothing charged; Checkout opens when the payer follows the link');
  ok(JSON.stringify(stripe.calls).indexOf('orgId') < 0, 'no Stripe object carries orgId (the legacy webhook acts on it)');
  var n0 = note('package-invoice-' + FIRST);
  equal([n0.provider, n0.paymentLink, n0.packageMail], ['stripe', r0.paymentLink, 'packageInvoice']); ok(/Pay by card to continue\./.test(n0.text), n0.text);
  equal([db.data.get(ROOT).packaged, db.data.get(ROOT).packagedLive], [true, false]);
  var callsBefore = stripe.calls.length;
  equal(await S.apply(db, ORG, act.body, STAFF, clock, { stripe: stripe }), r0, 'a retried activation returns its result'); equal(stripe.calls.length, callsBefore, 'and calls Stripe no more');
  var gate = PA.project(OWNER, bill(), db.data.get(ROOT), { role: 'owner', status: 'active' }, clock);
  equal([gate.readOnly, gate.billingNotice.card, gate.billingNotice.payUrl], [true, true, r0.paymentLink], 'the workspace\'s notice offers the card pay link');
  var tampered = Object.assign({}, bill(), { paymentLink: 'https://evil.example/api/package-pay' + new URL(r0.paymentLink).search });
  equal(PA.project(OWNER, tampered, db.data.get(ROOT), { role: 'owner', status: 'active' }, clock).billingNotice.payUrl, null, 'a stored link that is not ours is never shown');

  /* ── d) checkout(): one Checkout Session for exactly the record ──────── */
  var c1 = await SB.checkout(db, ORG, FIRST, clock, stripe), rec1 = record(FIRST), open1 = rec1.stripe.openSession;
  ok(/^cs_test_/.test(open1.id)); equal(c1, { url: open1.url }); equal([rec1.stripe.sessions, rec1.stripe.sessionCount], [[open1.id], 1]);
  equal(open1.expiresAt, (Math.floor(clock / 1000) + 86400) * 1000, 'the session\'s own expiry is kept');
  var cs1 = stripe.callsOf('checkout.sessions.create')[0], p1 = cs1[0];
  equal([p1.mode, p1.customer, p1.payment_method_types, p1.client_reference_id], ['payment', bill().stripe.customerId, ['card'], ORG]);
  equal(sum(p1.line_items), rec1.totalCents, 'the line items are the record total'); equal(p1.line_items.length, rec1.lines.length, 'positive lines go as they are');
  equal(p1.line_items.map(function (l) { return l.price_data.product_data.name; }), rec1.lines.map(function (l) { return l.name; }));
  equal(p1.metadata, META(FIRST, rec1.stripeRef)); equal(p1.payment_intent_data.metadata, p1.metadata, 'the payment carries the same namespace');
  equal(p1.payment_intent_data.setup_future_usage, 'off_session', 'the card is saved for renewals');
  equal(p1.success_url, SB.payLink(HOME, ORG, FIRST) + '&cs={CHECKOUT_SESSION_ID}'); equal(p1.cancel_url, done('cancelled'));
  ok(/kept on file/.test(p1.custom_text.submit.message), 'the payer is told the card is kept');
  ok(JSON.stringify(p1).indexOf('orgId') < 0, 'no orgId anywhere in the session');
  equal(cs1[1].idempotencyKey, SB.key('omega-package-checkout:' + rec1.stripeRef + ':1'));
  equal(await SB.checkout(db, ORG, FIRST, clock, stripe), c1, 'a second visit reuses the open session');
  equal([stripe.count('checkout.sessions.create'), record(FIRST).stripe.sessionCount], [1, 1]);
  stripe.expireSession(open1.id);
  var c2 = await SB.checkout(db, ORG, FIRST, clock, stripe), rec2 = record(FIRST);
  ok(c2.url !== c1.url, 'an expired session mints the next'); equal(stripe.count('checkout.sessions.create'), 2);
  equal(stripe.callsOf('checkout.sessions.create')[1][1].idempotencyKey, SB.key('omega-package-checkout:' + rec1.stripeRef + ':2'), 'with a new idempotency key');
  equal([rec2.stripe.sessions, rec2.stripe.sessionCount], [[open1.id, rec2.stripe.openSession.id], 2]);
  clock = rec2.stripe.openSession.expiresAt - 4 * 60000; var retrieves = stripe.count('checkout.sessions.retrieve');
  var c3 = await SB.checkout(db, ORG, FIRST, clock, stripe);
  ok(c3.url !== c2.url, 'a session with under five minutes left is not handed out'); equal(stripe.count('checkout.sessions.retrieve'), retrieves, 'nor even read');
  equal(record(FIRST).stripe.sessionCount, 3); clock = START;
  await refused(function () { return SB.checkout(db, ORG, '2027-01-20', clock, stripe); }, /not found/, 404);
  db.seed(CUR + '/invoices/2026-08-20', { date: '2026-08-20', state: 'unpaid', qboInvoiceId: 'I-1', totalCents: 100 });
  await refused(function () { return SB.checkout(db, ORG, '2026-08-20', clock, stripe); }, /not paid by card/, 409);
  db.data.delete(CUR + '/invoices/2026-08-20');
  var cust = bill().stripe.customerId; bill().stripe.customerId = 'cus_SOMEONEELSE';
  await refused(function () { return SB.checkout(db, ORG, FIRST, clock, stripe); }, /card billing changed/, 409); bill().stripe.customerId = cust;
  /* a credit line is negative; Checkout takes none, so the record goes as one line */
  tenant(); await activate({ credit: true });
  var credited = record(FIRST); ok(credited.lines.some(function (l) { return l.amountCents < 0; }), 'the fixture has a credit line');
  await SB.checkout(db, ORG, FIRST, clock, stripe);
  var li = stripe.callsOf('checkout.sessions.create')[0][0].line_items;
  equal(li.length, 1, 'a negative line collapses the invoice to one line'); equal(li[0].price_data.unit_amount, credited.totalCents);
  equal(li[0].price_data.product_data.name, 'OMEGA subscription · ' + credited.period.start + ' to ' + credited.period.end);
  ok(/Transformation credit −\$200\.00/.test(li[0].price_data.product_data.description), li[0].price_data.product_data.description);
  var pack = SB.lineItems({ kind: 'pack', totalCents: 500, lines: [{ name: 'A', amountCents: 700 }, { name: 'B', amountCents: -200 }] });
  equal([pack.length, pack[0].price_data.product_data.name, pack[0].price_data.unit_amount], [1, 'OMEGA usage pack', 500]);
  var change = SB.lineItems({ kind: 'change', totalCents: 900, lines: [{ name: 'X · rest of this cycle', amountCents: 400 }, { name: 'Y', amountCents: 500 }] });
  equal(change.map(function (l) { return [l.price_data.product_data.name, l.price_data.unit_amount, l.quantity]; }), [['X · rest of this cycle', 400, 1], ['Y', 500, 1]]);

  /* ── e) returned(): Checkout's success_url settles that one record ─────── */
  tenant(); await activate(); await SB.checkout(db, ORG, FIRST, clock, stripe);
  var sid = record(FIRST).stripe.openSession.id, rec = record(FIRST), before = snapshot();
  equal(await SB.returned(db, ORG, FIRST, sid, clock, stripe), { url: done('pending') }, 'an open, unpaid session changes nothing'); equal(snapshot(), before);
  await refused(function () { return SB.returned(db, ORG, FIRST, 'cs_nope', clock, stripe); }, /Invalid checkout session/, 400);
  await refused(function () { return SB.returned(db, ORG, FIRST, 'cs_test_a!b', clock, stripe); }, /Invalid checkout session/, 400);
  var cus = bill().stripe.customerId, other = await stripe.customers.create({ metadata: { kind: 'omega-package', org: ORG } });
  async function foreign(metadata, customer) {
    var s = await stripe.checkout.sessions.create({ mode: 'payment', customer: customer || cus, metadata: metadata, payment_intent_data: { metadata: metadata },
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: rec.totalCents, product_data: { name: 'x' } } }] });
    stripe.complete(s.id, VISA); return s.id;
  }
  var strangers = [await foreign(META('2026-10-20', rec.stripeRef)), await foreign(Object.assign(META(FIRST, rec.stripeRef), { org: 'other.example' })),
    await foreign(META(FIRST, 'stp_000000000000000000000000')), await foreign(META(FIRST, rec.stripeRef), other.id), await foreign({ kind: 'customer-editor-lite', org: ORG, record: FIRST })];
  var liveOne = await foreign(META(FIRST, rec.stripeRef)); stripe.mutate(liveOne, { livemode: true }); strangers.push(liveOne);
  for (var i = 0; i < strangers.length; i++) await refused(function () { return SB.returned(db, ORG, FIRST, strangers[i], clock, stripe); }, /does not belong/, 403);
  equal(snapshot(), before, 'a session for another record, workspace, reference, customer, kind or mode changes nothing');
  stripe.expireSession(sid);
  equal(await SB.returned(db, ORG, FIRST, sid, clock, stripe), { url: done('cancelled') }, 'an expired session sends the payer back to try again'); equal(snapshot(), before);
  await SB.checkout(db, ORG, FIRST, clock, stripe); sid = record(FIRST).stripe.openSession.id;
  var paid = stripe.complete(sid, VISA);
  equal(await SB.returned(db, ORG, FIRST, sid, clock, stripe), { url: done('done'), paid: true });
  var recP = record(FIRST), bP = bill();
  equal([recP.state, recP.paidAt, recP.paidCents, recP.reviewRequired, recP.stripe.openSession], ['paid', clock, rec.totalCents, false, null]);
  equal(recP.stripe.paymentIntents, [paid.paymentIntent.id]); ok(recP.stripe.sessions.indexOf(sid) >= 0);
  equal([bP.packagingState, bP.modules, bP.lastPaidAt, bP.paymentLink, bP.amountDue], ['paid', M.normalize(['lite', 'evrebates']), clock, null, 0], 'paid: the subscription is on');
  equal(bP.subscription.modules, M.normalize(['lite', 'evrebates']));
  equal(bP.stripe.card, { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }); equal([bP.stripe.cardOnFile, bP.stripe.customerId, bP.stripe.env], [true, cus, 'sandbox'], 'the card is kept beside the customer, which stays');
  equal(stripe.callsOf('customers.update').pop()[1], { invoice_settings: { default_payment_method: paid.paymentMethod } }, 'the card that paid is the default for renewals');
  equal(stripe.object(cus).invoice_settings.default_payment_method, paid.paymentMethod);
  var paidNote = note('package-paid-' + FIRST);
  equal([paidNote.packageMail, paidNote.provider, paidNote.first, paidNote.invoiceId], ['paid', 'stripe', true, rec.stripeRef], 'the tenant hears');
  var alert = staffNote('billing-paid-' + ORG + '-' + rec.stripeRef); ok(alert && /by card \(Stripe\)/.test(alert.text), 'and so does ClearSky');
  ok(mails.some(function (m) { return m.name === 'paid' && m.payload.email === 'ap@' + ORG; }), 'the receipt is mailed'); ok(mails.some(function (m) { return m.name === 'paidAlert'; }));
  ok(paths('/billing/current/history/').some(function (p) { var h = db.data.get(p); return h.by === 'stripe-reconciliation' && h.action === 'invoice-paid'; }), 'history names the rail');
  var histories = paths('/history/').length, notes = paths('/notifications/').length;
  equal(await SB.returned(db, ORG, FIRST, sid, clock, stripe), { url: done('done'), paid: true }, 'returning again is harmless');
  equal([record(FIRST).stripe.paymentIntents.length, paths('/history/').length, paths('/notifications/').length], [1, histories, notes]);
  equal(await SB.checkout(db, ORG, FIRST, clock, stripe), { url: done('done'), paid: true }, 'a paid record\'s link goes home');
  var open = PA.project(OWNER, bill(), db.data.get(ROOT), { role: 'owner', status: 'active' }, clock);
  equal([open.readOnly, open.billingNotice], [false, null], 'the workspace is open');

  /* ── f) renewal: the card on file, charged on the billing date ───────── */
  var subs = bill().subscription, next = bill().nextInvoiceOn; equal(next, '2026-10-20');
  clock = Date.parse('2026-10-19T12:00:00Z'); var quiet = stripe.calls.length;
  equal(await S.issue(db, ORG, clock, { stripe: stripe }), { skipped: true }); equal(stripe.calls.length, quiet, 'nothing before the billing date');
  clock = Date.parse('2026-10-20T12:00:00Z');
  var renew = await S.issue(db, ORG, clock, { stripe: stripe }), recR = record('2026-10-20'), pic = stripe.callsOf('paymentIntents.create');
  equal([renew.issued, renew.rail, renew.charge, renew.settled && renew.settled.state], [true, 'stripe', 'succeeded', 'paid'], 'charged and settled in the same run');
  equal(pic.length, 1); var pc = pic[0];
  equal([pc[0].amount, pc[0].currency, pc[0].customer, pc[0].payment_method, pc[0].off_session, pc[0].confirm], [recR.totalCents, 'usd', cus, paid.paymentMethod, true, true]);
  equal(pc[0].metadata, META('2026-10-20', recR.stripeRef)); equal(pc[1].idempotencyKey, SB.key('omega-package-charge:OMEGA subscription ' + ORG + ' / 2026-10-20'));
  equal([recR.state, recR.stripe.paymentIntents.length, recR.stripe.lastCharge], ['paid', 1, { status: 'succeeded', code: null }]);
  equal(recR.modules, subs.modules, 'the renewal bills what was bought');
  equal(note('package-invoice-2026-10-20'), undefined, 'a renewal charged to the card sends no pay mail');
  equal([note('package-paid-2026-10-20').first, bill().packagingState, bill().paymentLink, bill().amountDue, bill().paidThrough], [false, 'paid', null, 0, '2026-11-20']);
  ok(!mails.some(function (m) { return m.name === 'packageInvoice' && m.payload.paymentLink === SB.payLink(HOME, ORG, '2026-10-20'); }), 'and none is mailed');
  /* a decline: the record waits on its pay link, and the payer is told why */
  clock = Date.parse('2026-11-20T12:00:00Z'); stripe.decline(cus, 'card_declined');
  var declined = await S.issue(db, ORG, clock, { stripe: stripe }), recD = record('2026-11-20');
  equal([declined.issued, declined.charge, declined.settled], [true, 'failed', null]);
  equal([recD.state, recD.stripe.paymentIntents, recD.stripe.lastCharge], ['unpaid', [], { status: 'failed', code: 'card_declined' }]);
  var nD = note('package-invoice-2026-11-20');
  ok(nD && /declined/.test(nD.text), 'the pay notice says the card was declined'); equal([nD.provider, nD.paymentLink], ['stripe', SB.payLink(HOME, ORG, '2026-11-20')]);
  equal([bill().packagingState, bill().paymentLink, bill().amountDue], ['paid', nD.paymentLink, recD.totalCents / 100], 'grace: still open, the link and the amount owed shown');
  var replays = stripe.replays(), retried = await SB.driver(null, stripe).invoice({ marker: 'OMEGA subscription ' + ORG + ' / 2026-11-20', lines: recD.lines }, profile(ORG), cus, { org: ORG, recordId: '2026-11-20', host: HOME });
  equal([retried.charge.status, retried.charge.code, retried.charge.found, stripe.replays(), recD.stripe.paymentIntents], ['failed', 'card_declined', undefined, replays + 1, []],
    'a declined attempt is never taken for a prior charge: a retry asks Stripe again, which replays the decline');
  stripe.decline(cus, 'authentication_required');
  var sca = await SB.driver(null, stripe).invoice({ marker: 'OMEGA sca check ' + ORG, lines: recD.lines }, profile(ORG), cus, { org: ORG, recordId: 'sca-check-1', host: HOME });
  equal([sca.charge.status, sca.charge.code, sca.payUrl], ['failed', 'authentication_required', SB.payLink(HOME, ORG, 'sca-check-1')], 'the bank wants the cardholder: the record waits on its pay link');
  var viaLink = await pay('2026-11-20', MC);
  equal([viaLink.back.paid, record('2026-11-20').state, bill().packagingState, bill().stripe.card.last4], [true, 'paid', 'paid', '4444'], 'paid through the link with another card, which is now the one on file');
  /* a charge already made for the record (a crash between the charge and our write) is found, never made twice */
  clock = Date.parse('2026-12-20T12:00:00Z'); stripe.on('paymentIntents.create', function () { if (!db.crashed) { db.crashed = true; db.crashNextTx = true; } });
  var creates = stripe.count('paymentIntents.create');
  await refused(function () { return S.issue(db, ORG, clock, { stripe: stripe }); }, /simulated crash/);
  equal([stripe.count('paymentIntents.create'), record('2026-12-20').state, S.invoiceRef(record('2026-12-20')), bill().invoiceLock], [creates + 1, 'prepared', null, null], 'the card was charged, nothing recorded, the lock released');
  var again = await S.issue(db, ORG, clock, { stripe: stripe });
  equal(stripe.count('paymentIntents.create'), creates + 1, 'the retry finds the charge and does not make another');
  equal([again.charge, again.settled && again.settled.state, record('2026-12-20').state, record('2026-12-20').stripe.paymentIntents.length], ['succeeded', 'paid', 'paid', 1]);
  var found = await SB.driver(null, stripe).invoice({ marker: 'OMEGA subscription ' + ORG + ' / 2026-12-20', lines: record('2026-12-20').lines }, profile(ORG), cus, { org: ORG, recordId: '2026-12-20', host: HOME });
  equal([found.charge.found, found.charge.status, stripe.count('paymentIntents.create')], [true, 'succeeded', creates + 1], 'the driver reads the list before it charges');

  /* ── g) plan-change and packs with a card on file ─────────────────────── */
  await paidCardTenant(); clock = Date.parse('2026-09-27T12:00:00Z'); cus = bill().stripe.customerId;
  var q = await C.preview(db, ORG, { add: ['engineering'] }, clock);
  equal([q.rail, q.cardOnFile, q.canApply], ['stripe', 'Visa ending 4242', true]); ok(/Charged to your Visa ending 4242 now/.test(q.display.activation), q.display.activation); ok(q.todayCents > 0);
  var ch = await C.apply(db, ORG, { add: ['engineering'], previewId: q.previewId, effectiveAt: q.effectiveAt }, OWNER, clock, { stripe: stripe });
  equal([ch.state, ch.charged, ch.card, ch.paymentLink, ch.rail], ['active', true, 'Visa ending 4242', null, 'stripe'], 'charged on the spot and switched on');
  ok(ch.modules.indexOf('engineering') >= 0 && bill().modules.indexOf('engineering') >= 0 && bill().subscription.modules.indexOf('engineering') >= 0, 'the module is on and in the package');
  var chRec = record(ch.changeId), chPi = stripe.callsOf('paymentIntents.create').pop()[0];
  equal([chRec.kind, chRec.state, chRec.provider, chPi.amount, chPi.metadata.record], ['change', 'paid', 'stripe', q.todayCents, ch.changeId]);
  equal(note('package-change-' + ch.changeId), undefined, 'charged at once: no pay mail');
  var creates2 = stripe.count('paymentIntents.create');
  equal(await C.apply(db, ORG, { add: ['engineering'], previewId: q.previewId, effectiveAt: q.effectiveAt }, OWNER, clock, { stripe: stripe }), ch, 'a retry returns the charged result');
  equal(stripe.count('paymentIntents.create'), creates2, 'and charges nothing again');
  var summary = await C.summary(db, ORG);
  equal([summary.rail, summary.card], ['stripe', { display: 'Visa ending 4242', expMonth: 12, expYear: 2030 }], 'Plan & billing shows the rail and the card');
  var pq = C.packQuote(await S.context(db, ORG), 'evApplications', clock);
  equal(pq.rail, 'stripe'); ok(/Charged to your Visa ending 4242/.test(pq.text), pq.text);
  var pk = await C.packBuy(db, ORG, { meter: 'evApplications', previewId: pq.previewId, effectiveAt: clock }, OWNER, clock, { stripe: stripe });
  equal([pk.state, pk.charged, pk.paymentLink, record(pk.packId).state], ['added', true, null, 'paid'], 'a pack with a card on file: added at once');
  equal(db.data.get(ROOT + '/usage/' + pq.cycle.start).purchased.evApplications, pq.units, 'the units are on this cycle');
  stripe.decline(cus, 'card_declined');
  var q2 = await C.preview(db, ORG, { add: ['storage'] }, clock);
  var dc = await C.apply(db, ORG, { add: ['storage'], previewId: q2.previewId, effectiveAt: q2.effectiveAt }, OWNER, clock, { stripe: stripe });
  equal([dc.state, dc.cardDeclined, dc.paymentLink, dc.rail], ['awaiting_payment', true, SB.payLink(HOME, ORG, dc.changeId), 'stripe'], 'a declined card: the change waits on its link');
  ok(/declined/.test(note('package-change-' + dc.changeId).text)); ok(bill().modules.indexOf('storage') < 0, 'and nothing switches on');
  /* no card on file: the change waits on its pay link */
  await paidCardTenant(); clock = Date.parse('2026-09-27T12:00:00Z'); cus = bill().stripe.customerId;
  stripe.removeCard(cus); bill().stripe.cardOnFile = false; bill().stripe.card = null;
  var q3 = await C.preview(db, ORG, { add: ['engineering'] }, clock);
  equal(q3.cardOnFile, null); ok(/Pay by card on the next page/.test(q3.display.activation), q3.display.activation);
  var creates3 = stripe.count('paymentIntents.create');
  var w = await C.apply(db, ORG, { add: ['engineering'], previewId: q3.previewId, effectiveAt: q3.effectiveAt }, OWNER, clock, { stripe: stripe });
  equal([w.state, w.rail, w.paymentLink, w.charged, w.cardDeclined], ['awaiting_payment', 'stripe', SB.payLink(HOME, ORG, w.changeId), undefined, undefined]);
  equal(SB.verifyLink(ORG, w.changeId, new URL(w.paymentLink).searchParams.get('s')), true); equal(stripe.count('paymentIntents.create'), creates3, 'nothing to charge');
  var nW = note('package-change-' + w.changeId); equal(nW.provider, 'stripe'); ok(/Pay by card to switch on Engineering/.test(nW.text), nW.text);
  ok(bill().modules.indexOf('engineering') < 0, 'nothing on before payment');
  /* cancelling a card change closes its Checkout (plan-change makes its own client: the stub) */
  await SB.checkout(db, ORG, w.changeId, clock, stripe); var wSid = record(w.changeId).stripe.openSession.id; made.length = 0;
  equal((await C.cancel(db, ORG, w.changeId, OWNER, clock)).state, 'cancelled');
  equal([stripe.object(wSid).status, made.length, made[0] && made[0].key], ['expired', 1, KEY], 'its open Checkout is expired with the packaging key');
  await refused(function () { return SB.checkout(db, ORG, w.changeId, clock, stripe); }, /cancelled/, 409);
  var q4 = await C.preview(db, ORG, { add: ['storage'] }, clock);
  var w2 = await C.apply(db, ORG, { add: ['storage'], previewId: q4.previewId, effectiveAt: q4.effectiveAt }, OWNER, clock, { stripe: stripe });
  var viaChange = await pay(w2.changeId, MC), cp = stripe.sessionParams(viaChange.sid);
  equal(sum(cp.line_items), record(w2.changeId).totalCents, 'Checkout for exactly the change');
  equal([record(w2.changeId).state, bill().modules.indexOf('storage') >= 0, bill().stripe.card.last4], ['paid', true, '4444'], 'paid by link: on, and the card is kept');

  /* ── h) reconcile: refunds, disputes, paid twice, transient failures ─── */
  await paidCardTenant(); rec = record(FIRST); var pi = rec.stripe.paymentIntents[0];
  stripe.refund(pi, 5000); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, record(FIRST).paidCents, record(FIRST).reviewRequired, bill().packagingState], ['paid', rec.totalCents - 5000, false, 'paid'], 'a partial refund is a concession: still paid');
  stripe.refund(pi); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, record(FIRST).paidCents], ['reversed', 0], 'a full refund reverses it');
  equal([bill().packagingState, bill().reissueRequired], ['awaiting_payment', true], 'the only paid invoice reversed: nothing to work against');
  ok(paths('/billing/current/history/').some(function (p) { var h = db.data.get(p); return h.action === 'invoice-reversed' && h.by === 'stripe-reconciliation'; }));
  await paidCardTenant(); rec = record(FIRST); pi = rec.stripe.paymentIntents[0];
  stripe.dispute(pi, 'lost', 1000); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, bill().packagingState], ['reversed', 'awaiting_payment'], 'a lost dispute reverses it, even one for part of the charge');
  await paidCardTenant(); rec = record(FIRST); pi = rec.stripe.paymentIntents[0];
  var dp = stripe.dispute(pi, 'needs_response'); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, record(FIRST).reviewRequired, record(FIRST).reconcileNote, bill().packagingState], ['paid', true, 'a dispute is open', 'paid'], 'an open dispute: paid, and a person looks');
  ok(staffNote('billing-review-' + ORG + '-' + rec.stripeRef), 'ClearSky is told');
  stripe.mutate(dp.id, { status: 'won' }); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, record(FIRST).reviewRequired], ['paid', false], 'won: nothing left to look at');
  await paidCardTenant(); rec = record(FIRST);
  var twice = await foreignSession(META(FIRST, rec.stripeRef), rec.totalCents);
  await SB.returned(db, ORG, FIRST, twice, clock, stripe);
  equal([record(FIRST).state, record(FIRST).reviewRequired, record(FIRST).paidCents, record(FIRST).stripe.paymentIntents.length], ['paid', true, 2 * rec.totalCents, 2], 'paid twice: still paid, reviewed');
  ok(/paid more than once/.test(record(FIRST).reconcileNote)); ok(/paid more than once/.test(staffNote('billing-review-' + ORG + '-' + rec.stripeRef).text));
  await paidCardTenant(); rec = record(FIRST);
  stripe.fail('checkout.sessions.retrieve'); await S.reconcile(db, ORG, clock, { stripe: stripe });
  var t1 = record(FIRST);
  equal([t1.state, t1.reconcileRetries, t1.reviewRequired, bill().packagingState, bill().reconciliationRequired], ['paid', 1, false, 'paid', false], 'Stripe unreachable: the record is kept and retried');
  ok(/^Stripe: /.test(t1.reconcileNote), t1.reconcileNote);
  stripe.fail('paymentIntents.retrieve', { type: 'StripeAPIError', statusCode: 500 }); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).reconcileRetries, record(FIRST).reviewRequired], [2, false], 'a Stripe 500 is ours too');
  stripe.fail('checkout.sessions.retrieve', { type: 'StripeRateLimitError', statusCode: 429 }); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, record(FIRST).reviewRequired, bill().packagingState, bill().reconciliationRequired], ['paid', true, 'paid', true], 'three in a row is a person\'s problem; access stays as last read');
  await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).reconcileRetries, record(FIRST).reviewRequired, bill().reconciliationRequired], [0, false, false], 'a good read clears it');
  stripe.mutate(record(FIRST).stripe.paymentIntents[0], { livemode: true }); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, record(FIRST).reviewRequired, record(FIRST).reconcileError], ['paid', true, true], 'a payment from the other Stripe mode goes to a person at once');
  ok(/other Stripe mode/.test(record(FIRST).reconcileNote));
  /* a payment or a session that is not this record's own is a person's problem, never a payment */
  await paidCardTenant(); rec = record(FIRST);
  var strangerCus = await stripe.customers.create({ metadata: { kind: 'omega-package', org: ORG } });
  stripe.mutate(rec.stripe.paymentIntents[0], { customer: strangerCus.id }); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, record(FIRST).reviewRequired, record(FIRST).reconcileNote], ['paid', true, 'Payment customer mismatch; accounting review required'], 'a payment by another customer');
  await paidCardTenant(); rec = record(FIRST);
  stripe.mutate(rec.stripe.sessions[0], { metadata: META(FIRST, 'stp_000000000000000000000000') }); await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, record(FIRST).reviewRequired], ['paid', true]); ok(/Checkout session does not belong/.test(record(FIRST).reconcileNote), 'a session that names another invoice');
  /* the rail is the workspace's: switching the default off later changes nothing for it */
  await paidCardTenant(); pin({ PACKAGING_RAIL: null }); stripe.refund(record(FIRST).stripe.paymentIntents[0]); qboCalls = 0;
  await S.reconcile(db, ORG, clock, { stripe: stripe });
  equal([record(FIRST).state, qboCalls], ['reversed', 0], 'a Stripe workspace is read from Stripe whatever the switch says now'); pin();

  /* ── i) webhook(): a hint, re-read from Stripe ─────────────────────────── */
  tenant(); await activate(); await SB.checkout(db, ORG, FIRST, clock, stripe); rec = record(FIRST); sid = rec.stripe.openSession.id; cus = bill().stripe.customerId;
  before = snapshot();
  equal(await SB.webhook(db, stripe.event('checkout.session.completed', { id: sid, metadata: {} }), clock, stripe), null, 'no kind: not ours');
  equal(await SB.webhook(db, stripe.event('checkout.session.completed', { id: 'cs_test_lite', metadata: { kind: 'customer-editor-lite', org: ORG, customerId: 'acct_1' } }), clock, stripe), null, 'Editor Lite is not ours');
  equal(await SB.webhook(db, stripe.event('payment_intent.succeeded', { id: 'pi_legacy', metadata: { orgId: ORG } }), clock, stripe), null, 'a legacy object (metadata.orgId) is not ours');
  equal(await SB.webhook(db, stripe.event('invoice.paid', { id: 'in_x', metadata: META(FIRST, rec.stripeRef) }), clock, stripe), null, 'an event type the rail does not take');
  equal(await SB.webhook(db, null, clock, stripe), null);
  var plain = await stripe.paymentIntents.create({ amount: 1000, currency: 'usd', customer: cus });
  equal(await SB.webhook(db, stripe.event('charge.refunded', { id: 'ch_x', payment_intent: plain.id }), clock, stripe), null, 'a charge on somebody else\'s payment');
  equal(await SB.webhook(db, stripe.event('charge.refunded', { id: 'ch_y', payment_intent: null }), clock, stripe), null);
  equal(await SB.webhook(db, stripe.event('checkout.session.completed', { id: sid, metadata: META(FIRST, rec.stripeRef) }, { livemode: true }), clock, stripe), { ignored: 'another Stripe mode' });
  equal(await SB.webhook(db, stripe.event('checkout.session.completed', { id: sid, metadata: Object.assign(META(FIRST, rec.stripeRef), { env: 'production' }) }), clock, stripe), { ignored: 'another Stripe mode' });
  equal(await SB.webhook(db, stripe.event('checkout.session.completed', { id: sid, metadata: Object.assign(META(FIRST, rec.stripeRef), { org: 'Not An Org' }) }), clock, stripe), { ignored: 'no workspace record' });
  equal(snapshot(), before, 'nothing that is not ours is written, not even an event row');
  stripe.complete(sid, VISA);
  var evt = stripe.event('checkout.session.completed', stripe.object(sid));
  equal(await SB.webhook(db, evt, clock, stripe), { applied: true, org: ORG, record: FIRST, state: 'paid' }, 'Checkout completed: settled');
  equal([record(FIRST).state, bill().packagingState, bill().stripe.card.last4, db.data.get('stripe_events/' + evt.id).state], ['paid', 'paid', '4242', 'done']);
  equal(await SB.webhook(db, evt, clock, stripe), { duplicate: true }, 'the same event again is a duplicate');
  pi = record(FIRST).stripe.paymentIntents[0]; stripe.refund(pi);
  var refundEvt = stripe.event('charge.refunded', stripe.object(stripe.object(pi).latest_charge));
  equal((await SB.webhook(db, refundEvt, clock, stripe)).applied, true); equal(record(FIRST).state, 'reversed', 'charge.refunded found its record through the payment\'s metadata');
  db.seed('stripe_events/evt_busy1', { state: 'processing', at: clock - 1000 });
  await refused(function () { return SB.webhook(db, Object.assign(stripe.event('checkout.session.completed', stripe.object(sid)), { id: 'evt_busy1' }), clock, stripe); }, /being processed/, 503);
  /* Stripe says paid, the settle does not land: thrown (the endpoint answers 500), and the retry settles */
  tenant(); await activate(); rec = record(FIRST); cus = bill().stripe.customerId;
  var pm = stripe.saveCard(cus, VISA);
  await SB.checkout(db, ORG, FIRST, clock, stripe); var leftOpen = record(FIRST).stripe.openSession.id;
  var offs = await stripe.paymentIntents.create({ amount: rec.totalCents, currency: 'usd', customer: cus, payment_method: pm, off_session: true, confirm: true, metadata: META(FIRST, rec.stripeRef) });
  stripe.fail('paymentIntents.retrieve', { skip: 1 });
  var succeeded = stripe.event('payment_intent.succeeded', offs);
  var e503 = await refused(function () { return SB.webhook(db, succeeded, clock, stripe); }, /not settled yet/, 503);
  equal(e503.clearsky, true);
  equal([record(FIRST).state, record(FIRST).stripe.paymentIntents, db.data.get('stripe_events/' + succeeded.id).state], ['unpaid', [offs.id], 'failed'], 'the payment is attached; the event is open for the retry');
  equal((await SB.webhook(db, succeeded, clock, stripe)).applied, true); equal(record(FIRST).state, 'paid', 'Stripe\'s retry settles it');
  equal([record(FIRST).stripe.openSession, record(FIRST).stripe.sessions], [null, [leftOpen]], 'paid another way: the Checkout left open is no longer offered');
  equal(await SB.checkout(db, ORG, FIRST, clock, stripe), { url: done('done'), paid: true });
  /* the event body is only a hint: a payment whose own metadata names another record is refused */
  tenant(); await activate(); rec = record(FIRST); cus = bill().stripe.customerId; pm = stripe.saveCard(cus, VISA);
  var elsewhere = await stripe.paymentIntents.create({ amount: rec.totalCents, currency: 'usd', customer: cus, payment_method: pm, off_session: true, confirm: true, metadata: META('2026-10-20', rec.stripeRef) });
  await refused(function () { return SB.webhook(db, stripe.event('payment_intent.succeeded', Object.assign({}, elsewhere, { metadata: META(FIRST, rec.stripeRef) })), clock, stripe); }, /does not belong/, 409);
  equal(record(FIRST).state, 'unpaid');

  /* ── j) /api/package-stripe-webhook, with a real signature ─────────────── */
  var hookApi = require('../api/package-stripe-webhook');
  equal(hookApi.config, { api: { bodyParser: false } }, 'Vercel must not parse the body');
  async function post(raw, header, method) {
    var req = Readable.from([Buffer.from(raw)]); req.method = method || 'POST'; req.headers = header == null ? {} : { 'stripe-signature': header };
    var res = response(); await hookApi(req, res); return res;
  }
  tenant(); await activate(); await SB.checkout(db, ORG, FIRST, clock, stripe); sid = record(FIRST).stripe.openSession.id; made.length = 0;
  var t = Math.floor(clock / 1000);
  evt = stripe.event('checkout.session.completed', stripe.object(sid)); var raw = JSON.stringify(evt);
  before = snapshot();
  var r = await post(raw, sign(raw, t, 'whsec_wrong'));
  equal([r.code, r.body.error, r.writes], [400, 'Invalid Stripe signature', 1], 'a bad signature');
  equal((await post(raw, null)).code, 400, 'no signature');
  equal((await post(raw.replace(FIRST, '2026-10-20'), sign(raw, t))).code, 400, 'a body changed after signing');
  r = await post(raw, sign(raw, t - 600)); equal([r.code, r.body.error], [400, 'Stale Stripe signature']);
  pin({ STRIPE_PACKAGING_WEBHOOK_SECRET: null }); r = await post(raw, sign(raw, t)); equal(r.code, 503, 'no secret on the deployment: refused'); pin();
  equal((await post(raw, sign(raw, t), 'GET')).code, 405);
  var junk = JSON.stringify({ id: 'nope', type: 'checkout.session.completed' }); equal((await post(junk, sign(junk, t))).body.error, 'Invalid event');
  var lite = JSON.stringify(stripe.event('checkout.session.completed', { id: 'cs_test_lite', object: 'checkout.session', metadata: { kind: 'customer-editor-lite', org: ORG } }));
  r = await post(lite, sign(lite, t)); equal([r.code, r.body], [200, { received: true, ignored: 'not a packaged-billing event' }], 'not ours: 200 and ignored');
  equal(snapshot(), before, 'none of that wrote anything');
  stripe.complete(sid, VISA); evt = stripe.event('checkout.session.completed', stripe.object(sid)); raw = JSON.stringify(evt);
  r = await post(raw, sign(raw, t));
  equal([r.code, r.body, r.writes], [200, { received: true, applied: true, org: ORG, record: FIRST, state: 'paid' }, 1], 'ours: settled');
  equal([record(FIRST).state, bill().packagingState], ['paid', 'paid']);
  ok(made.length > 0 && made.every(function (m) { return m.key === KEY && m.opts.apiVersion === '2024-06-20'; }), 'the endpoint\'s own client uses the mode\'s packaging key');
  r = await post(raw, sign(raw, t)); equal([r.code, r.body], [200, { received: true, duplicate: true }]);
  tenant(); await activate(); rec = record(FIRST); cus = bill().stripe.customerId; pm = stripe.saveCard(cus, VISA);
  offs = await stripe.paymentIntents.create({ amount: rec.totalCents, currency: 'usd', customer: cus, payment_method: pm, off_session: true, confirm: true, metadata: META(FIRST, rec.stripeRef) });
  stripe.fail('paymentIntents.retrieve', { skip: 1 }); raw = JSON.stringify(stripe.event('payment_intent.succeeded', offs));
  r = await post(raw, sign(raw, t)); equal([r.code, r.body.error], [500, 'Not settled yet; Stripe will retry'], 'paid but not settled: 500, so Stripe retries');
  r = await post(raw, sign(raw, t)); equal([r.code, r.body.applied, record(FIRST).state], [200, true, 'paid'], 'and the retry settles');
  /* our side failing inside the endpoint (rate limit, our key refused) is a 500, never a 200 that stops Stripe retrying */
  var refundRaw = JSON.stringify(stripe.event('charge.refunded', { id: 'ch_any', payment_intent: offs.id }));
  stripe.fail('paymentIntents.retrieve', { type: 'StripeRateLimitError', statusCode: 429 });
  r = await post(refundRaw, sign(refundRaw, t)); equal(r.code, 500, 'Stripe rate-limited us: 500, so Stripe comes back');
  stripe.fail('paymentIntents.retrieve', { type: 'StripeAuthenticationError', statusCode: 401 });
  r = await post(refundRaw, sign(refundRaw, t)); equal(r.code, 500, 'our key refused: 500');
  var mismatch = await stripe.paymentIntents.create({ amount: rec.totalCents, currency: 'usd', customer: cus, payment_method: pm, off_session: true, confirm: true, metadata: META('2026-10-20', rec.stripeRef) });
  raw = JSON.stringify(stripe.event('payment_intent.succeeded', Object.assign({}, mismatch, { metadata: META(FIRST, rec.stripeRef) })));
  r = await post(raw, sign(raw, t)); equal([r.code, r.body.received, r.body.reviewRequired], [200, true, true], 'a refusal that is the record\'s: 200 with review, never a retry loop');

  /* ── k) /api/package-pay: the link, Checkout and the way home ──────────── */
  var payApi = require('../api/package-pay');
  async function visit(query, method) { var res = response(); await payApi({ method: method || 'GET', query: query, headers: {} }, res); return res; }
  tenant(); await activate(); made.length = 0;
  var pl = new URL(bill().paymentLink), qs = { o: pl.searchParams.get('o'), r: pl.searchParams.get('r'), s: pl.searchParams.get('s') };
  var calls0 = stripe.calls.length, bad = await visit(Object.assign({}, qs, { s: flipLast(qs.s) }));
  equal(bad.code, 404); ok(/text\/html/.test(bad.headers['content-type'])); ok(/This payment link is not valid/.test(bad.body)); equal(stripe.calls.length, calls0, 'an invalid link reaches no Stripe');
  equal((await visit(Object.assign({}, qs, { o: 'other.example' }))).code, 404, 'the signature is for one workspace');
  equal((await visit(Object.assign({}, qs, { r: '2026-10-20' }))).code, 404, 'and one record');
  equal((await visit(qs, 'POST')).code, 405);
  var go = await visit(qs), opened = record(FIRST).stripe.openSession;
  equal([go.code, go.headers.location, go.headers['cache-control'], go.headers['referrer-policy']], [303, opened.url, 'no-store', 'no-referrer'], 'a valid link: 303 to Stripe Checkout');
  ok(/^https:\/\/checkout\.stripe\.com\//.test(go.headers.location));
  equal((await visit(qs)).headers.location, opened.url, 'a second visit: the same session');
  equal((await visit(Object.assign({}, qs, { cs: opened.id }))).headers.location, done('pending'), 'back from Checkout before paying: pending');
  equal((await visit(Object.assign({}, qs, { cs: 'cs_nope' }))).code, 400);
  stripe.complete(opened.id, VISA);
  var back = await visit(Object.assign({}, qs, { cs: opened.id }));
  equal([back.code, back.headers.location, record(FIRST).state, bill().packagingState], [303, done('done'), 'paid', 'paid'], 'the cs return: settled, and home to Plan & billing');
  equal((await visit(qs)).headers.location, done('done'), 'a paid invoice\'s link goes home');
  ok(made.length > 0 && made.every(function (m) { return m.key === KEY; }), 'the pay link\'s client uses the packaging key');
  var ghost = new URL(SB.payLink(HOME, ORG, '2027-01-20'));
  var gone = await visit({ o: ORG, r: '2027-01-20', s: ghost.searchParams.get('s') }); equal(gone.code, 404); ok(/not found/.test(gone.body));
  tenant(); await activate(); stripe.fail('checkout.sessions.create');
  pl = new URL(bill().paymentLink);
  var down = await visit({ o: ORG, r: FIRST, s: pl.searchParams.get('s') });
  equal(down.code, 503); ok(/Nothing was charged/.test(down.body), 'Stripe down: the payer is told nothing was charged');
  pin({ QBO_ENV: null }); down = await visit({ o: ORG, r: FIRST, s: pl.searchParams.get('s') }); equal(down.code, 503, 'packaging off: no checkout'); pin();

  /* ── l) the legacy /api/stripe-webhook leaves packaged workspaces alone ── */
  var legacy = require('../api/stripe-webhook');
  await paidCardTenant(); bill().stripeCustomerId = 'cus_OLDLEGACY1';
  var LEG = 'legacy.example', LROOT = 'omega_orgs/' + LEG;
  db.seed(LROOT, { name: 'Legacy Co', status: 'suspended' });
  db.seed(LROOT + '/billing/current', { tier: 'standard', stripeCustomerId: 'cus_OLDLEGACY2', amountDue: 99, paymentFailedAt: '2026-09-01T00:00:00Z' });
  var lookups = [];
  db.collectionGroup = function (name) {
    return { where: function (field, op, value) {
      lookups.push(value); if (value === undefined) throw new Error('Cannot use "undefined" as a Firestore value');
      return { limit: function (n) { return { get: async function () {
        var docs = [];
        db.data.forEach(function (v, p) { var parts = p.split('/'); if (parts[parts.length - 2] === name && F.get(v, field) === value) docs.push({ id: parts[parts.length - 1], data: function () { return F.clone(v); }, ref: { parent: { parent: { id: parts[parts.length - 3] } } } }); });
        docs = docs.slice(0, n); return { empty: !docs.length, docs: docs };
      } }; } };
    } };
  };
  async function legacyPost(e, sig) {
    stripe.webhooks = { constructEvent: function (buf, s, secret) { if (s !== 'good' || secret !== process.env.STRIPE_WEBHOOK_SECRET) throw new Error('bad'); return e; } };
    var req = Readable.from([Buffer.from(JSON.stringify({ id: e.id }))]); req.method = 'POST'; req.headers = { 'stripe-signature': sig || 'good' };
    var res = response(); await legacy(req, res); return res;
  }
  var pkgBefore = JSON.stringify([db.data.get(ROOT), db.data.get(CUR)]);
  r = await legacyPost(stripe.event('invoice.paid', { id: 'in_old', customer: 'cus_OLDLEGACY1', metadata: { orgId: ORG }, lines: { data: [{ period: { end: t + 30 * 86400 } }] } }));
  equal([r.code, r.writes], [200, 1], 'a packaged workspace\'s legacy invoice.paid: answered once'); ok(/packaged workspace/.test(r.body.ignored), JSON.stringify(r.body));
  r = await legacyPost(stripe.event('invoice.payment_failed', { id: 'in_old2', customer: 'cus_OLDLEGACY1', amount_due: 50000 }));
  equal([r.code, r.writes], [200, 1]); ok(/packaged workspace/.test(r.body.ignored), 'found by its old customer id, still left alone');
  r = await legacyPost(stripe.event('customer.subscription.deleted', { id: 'sub_old', customer: 'cus_OLDLEGACY1', metadata: { orgId: ORG }, items: { data: [] } }));
  equal([r.code, r.writes], [200, 1]); ok(/packaged workspace/.test(r.body.ignored));
  var pkgSession = stripe.event('checkout.session.completed', { id: 'cs_test_pkg', object: 'checkout.session', mode: 'payment', customer: bill().stripe.customerId, metadata: META(FIRST, record(FIRST).stripeRef) });
  r = await legacyPost(pkgSession);
  equal([r.code, r.writes], [200, 1]); ok(/no org for cus_/.test(r.body.ignored), 'a packaging session sent here finds no legacy tenant: the packaged customer is not at stripeCustomerId');
  equal(JSON.stringify([db.data.get(ROOT), db.data.get(CUR)]), pkgBefore, 'billing/current and the organization are untouched');
  r = await legacyPost(stripe.event('invoice.paid', { id: 'in_leg', customer: 'cus_OLDLEGACY2', metadata: { orgId: LEG }, lines: { data: [{ period: { end: t + 30 * 86400 } }] } }));
  var lb = db.data.get(LROOT + '/billing/current');
  equal([r.code, r.writes, r.body], [200, 1, { received: true }], 'a legacy tenant is still answered once');
  equal([lb.amountDue, lb.paymentFailedAt, lb.lastStripeEvent, lb.lastPaidAt, db.data.get(LROOT).status], [0, null, 'invoice.paid', new Date(clock).toISOString(), 'active'], 'and patched as before');
  r = await legacyPost(stripe.event('invoice.paid', { id: 'in_bad' }), 'forged'); equal([r.code, r.body, r.writes], [400, 'bad signature', 1]);
  ok(lookups.indexOf(undefined) < 0);
  delete db.collectionGroup;
  /* nor does the legacy staff tool make a legacy Stripe customer for one */
  var createApi = require('../api/stripe-create');
  async function staffCreate(body) { var res = response(); await createApi({ method: 'POST', body: body, caller: STAFF, headers: {} }, res); return res; }
  var customersMade = stripe.count('customers.create');
  r = await staffCreate({ orgId: ORG, email: 'ap@' + ORG, tier: 'standard' });
  equal([r.code, r.body.error, stripe.count('customers.create')], [409, 'Packaged billing is payment-controlled; use the Package tab', customersMade], 'stripe-create refuses a packaged workspace');
  equal(JSON.stringify([db.data.get(ROOT), db.data.get(CUR)]), pkgBefore);
  db.seed('omega_orgs/fresh.example/billing/current', { tier: 'trial' });
  r = await staffCreate({ orgId: 'fresh.example', email: 'ap@fresh.example', tier: 'standard' });
  equal([r.code, r.body.ok, db.data.get('omega_orgs/fresh.example/billing/current').stripeCustomerId], [200, true, r.body.stripeCustomerId], 'and still serves a legacy tenant');

  /* ── the mail a payer reads names the rail (the real templates; SMTP kept, not sent) ── */
  pin({ MAIL_USER: 'billing@clearsky-usa.com', MAIL_PASS: 'not-a-real-password' });
  var mailPath = require.resolve('../api/_lib/mail'), mocked = require.cache[mailPath];
  delete require.cache[mailPath]; var realMail = require('../api/_lib/mail'); require.cache[mailPath] = mocked;
  var cardLink = SB.payLink(HOME, ORG, FIRST);
  await realMail.templates.packageInvoice({ email: 'ap@' + ORG, text: 'Your subscription invoice is ready: $2,100. Pay by card to continue.', paymentLink: cardLink, provider: 'stripe' });
  await realMail.templates.packageInvoice({ email: 'ap@' + ORG, text: 'Your subscription invoice is ready.', paymentLink: 'https://connect.intuit.com/pay/x', provider: 'quickbooks' });
  await realMail.templates.signupReceived({ email: 'owner@' + ORG, name: 'Casey', company: 'Card Co', host: HOME, payNow: true, rail: 'stripe', paymentLink: cardLink, amountDueDisplay: '$2,100' });
  await realMail.templates.trialEnding({ email: 'ap@' + ORG, text: 'Your trial ends soon.', trialEndsAt: clock, host: HOME, provider: 'stripe' });
  equal(smtp.length, 4, 'four messages composed, none sent anywhere');
  ok(/>Pay by card</.test(smtp[0].html) && (smtp[0].html.indexOf(cardLink.replace(/&/g, '&amp;')) >= 0 || smtp[0].html.indexOf(cardLink) >= 0), 'the card invoice mail\'s button is Pay by card, to our pay link');
  ok(!/QuickBooks/.test(smtp[0].html), 'and does not say QuickBooks');
  ok(/>Pay in QuickBooks</.test(smtp[1].html), 'a QuickBooks invoice still says QuickBooks');
  ok(/>Pay by card</.test(smtp[2].html) && /kept on file/.test(smtp[2].html) && !/QuickBooks/.test(smtp[2].html), 'the signup mail on the card rail');
  ok(/payable by card/.test(smtp[3].html), 'the trial-ending mail on the card rail');
  pin();

  /* ── m) with PACKAGING_RAIL unset, QuickBooks exactly as before ────────── */
  pin({ PACKAGING_RAIL: null }); tenant(); var qInvoices = 0;
  Q.driver = function () { return { customer: async function () { return 'C-q'; }, invoice: async function (plan) { qInvoices++; return { id: 'I-' + plan.date, totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/' + plan.date }; },
    reconcile: async function (x) { return { satisfied: false, reversed: false, paidCents: 0, payUrl: x.paymentLink }; } }; };
  var qa = await activate(), qb = bill(), qr = record(FIRST);
  equal([qa.result.rail, qa.result.packagingState, qb.billingProvider, qb.paymentProvider, qb.qboCustomerId, qb.stripe], ['quickbooks', 'awaiting_payment', 'quickbooks', 'quickbooks', 'C-q', undefined]);
  equal([qr.qboInvoiceId, qr.provider, qr.stripeRef, qr.stripe, qr.paymentLink, qInvoices], ['I-' + FIRST, undefined, undefined, undefined, 'https://connect.intuit.com/pay/' + FIRST, 1], 'a QuickBooks invoice record, as before');
  equal([stripe.calls.length, made.length], [0, 0], 'Stripe is never touched');
  var qn = note('package-invoice-' + FIRST); equal(qn.provider, 'quickbooks'); ok(/Pay in QuickBooks to continue\./.test(qn.text));
  /* the rail is fixed when the workspace starts: a signup's recorded rail wins over the switch */
  pin(); tenant({ packaged: true, packagingSignup: true, packagingState: 'pending', modules: ['lite'], billingProvider: 'quickbooks', proposedPackage: { modules: ['lite'], interval: 'monthly' } });
  qa = await activate();
  equal([qa.result.rail, bill().billingProvider, record(FIRST).qboInvoiceId, stripe.calls.length], ['quickbooks', 'quickbooks', 'I-' + FIRST, 0], 'signed up on QuickBooks: stays on QuickBooks after the switch');
  pin({ PACKAGING_RAIL: null }); tenant({ packaged: true, packagingSignup: true, packagingState: 'pending', modules: ['lite'], billingProvider: 'stripe', proposedPackage: { modules: ['lite'], interval: 'monthly' } });
  qInvoices = 0; qa = await activate();
  equal([qa.result.rail, bill().billingProvider, record(FIRST).provider, qInvoices], ['stripe', 'stripe', 'stripe', 0], 'signed up on cards: stays on cards when the switch is off');
  pin(); qboForbidden();

  console.log('Stripe rail: ' + count + ' passed; Stripe and Firestore doubles, no network.');
}
function flipLast(s) { return s.slice(0, -1) + (s.slice(-1) === '0' ? '1' : '0'); }
/* a completed Checkout Session made on Stripe's side, not through checkout() */
async function foreignSession(metadata, cents) {
  var s = await stripe.checkout.sessions.create({ mode: 'payment', customer: bill().stripe.customerId, metadata: metadata,
    payment_intent_data: { setup_future_usage: 'off_session', metadata: metadata }, line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: cents, product_data: { name: 'again' } } }] });
  stripe.complete(s.id, VISA); return s.id;
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () {
  Q.driver = originalDriver; Module._load = realLoad; Date.now = realNow; global.fetch = realFetch; restoreEnv();
  F.DB.prototype.runOne = real.runOne; F.Ref.prototype.set = real.set; F.Ref.prototype.update = real.update; F.Ref.prototype.create = real.create;
});
