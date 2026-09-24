/* scripts/test-ledger-sync.js — a workspace's own books: QuickBooks or Stripe
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/_lib/ledger-sync.js, the org-aware half of api/_lib/qbo.js,
   api/ledger-connect.js and api/ledger-webhook.js, offline: the shared
   Firestore double, a fetch router that records every call, env vars set
   and restored per test, and logic-workflow mocked for the webhook (the
   webhook is a hint; what the workflow does with it is test-accounting.js).
   No credential or network is touched. */
'use strict';
delete process.env.QBO_ENV;   /* qbo.js reads it once at load: production hosts */
var assert = require('node:assert/strict'), crypto = require('crypto'), Readable = require('stream').Readable;
var F = require('./_lib/firestore-double'), DB = F.DB, mock = F.mock;
var P = require('../api/_lib/logic-policy');

var count = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name); console.log(e && e.stack || e); }
}

/* ── the doubles ─────────────────────────────────────────────────────────── */
/* The Admin SDK refuses `undefined` anywhere in a write; so does this double. */
function noUndefined(v, where) {
  if (v === undefined) throw new Error('undefined written at ' + where);
  if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndefined(v[k], where + '.' + k); });
}
var realTx = DB.prototype.runTransaction;
DB.prototype.runTransaction = function (fn) {
  return realTx.call(this, function (tx) {
    return fn({ get: tx.get,
      create: function (r, v) { noUndefined(v, r.path); return tx.create(r, v); },
      set: function (r, v, o) { noUndefined(v, r.path); return tx.set(r, v, o); },
      update: function (r, v) { noUndefined(v, r.path); return tx.update(r, v); } });
  });
};
['set', 'update', 'create'].forEach(function (m) {
  var real = F.Ref.prototype[m];
  F.Ref.prototype[m] = function (v, o) { noUndefined(v, this.path); return real.call(this, v, o); };
});
var db;
function httpError(status, msg) { var e = new Error(msg); e.status = status; return e; }
var A = {
  db: function () { return db; },
  safeOrg: function (v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : ''; },
  httpError: httpError, authenticate: async function (req) { return req.caller; }, handler: function (fn) { return fn; },
  canActInOrg: async function (c, org) { return c.staff || c.orgId === org; }, isTenantAdmin: async function (c, org) { return c.staff || c.orgId === org; },
  FieldValue: function () { return { serverTimestamp: function () { return Date.now(); }, arrayUnion: function () { return Array.from(arguments); } }; }
};
mock('../api/_lib/admin', A);
var synced = [], syncFails = 0;
mock('../api/_lib/logic-workflow', { syncLedger: async function (orderId, caller, opts) {
  synced.push({ orderId: orderId, caller: caller, opts: opts });
  if (syncFails > 0) { syncFails--; throw httpError(502, 'Stripe request failed (500): upstream'); }
  return { ok: true, provider: 'stripe', stages: {} };
} });

var calls = [], routes = [];
function route(method, re, reply) { routes.push({ method: method, re: re, reply: reply }); }
function ok(body) { return { status: 200, body: body }; }
global.fetch = async function (url, opts) {
  opts = opts || {};
  var call = { method: opts.method || 'GET', url: String(url), headers: opts.headers || {}, body: opts.body == null ? null : String(opts.body) };
  calls.push(call);
  for (var i = routes.length - 1; i >= 0; i--) {
    var r = routes[i];
    if (r.method === call.method && r.re.test(call.url)) {
      var out = typeof r.reply === 'function' ? await r.reply(call) : r.reply;
      if (out instanceof Error) throw out;
      return { ok: out.status >= 200 && out.status < 300, status: out.status, statusText: 'status ' + out.status, json: async function () { return JSON.parse(JSON.stringify(out.body)); } };
    }
  }
  throw new Error('unrouted ' + call.method + ' ' + call.url);
};

var FULL = {
  QBO_CLIENT_ID: 'qbo-client-id', QBO_CLIENT_SECRET: 'qbo-client-SECRET-value',
  QBO_WORKSPACE_REDIRECT_URI: 'https://tools.csebuilders.com/api/ledger-connect', QBO_REDIRECT_URI: 'https://tools.csebuilders.com/api/logic-connect',
  STRIPE_SECRET_KEY: 'sk_test_platform_SECRET_value', STRIPE_CONNECT_CLIENT_ID: 'ca_ClientId123',
  STRIPE_CONNECT_REDIRECT_URI: 'https://tools.csebuilders.com/api/ledger-connect', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_webhook_SECRET_value'
};
var ENV_KEYS = Object.keys(FULL);
function env(values) { ENV_KEYS.forEach(function (k) { if (values[k] == null) delete process.env[k]; else process.env[k] = values[k]; }); }
var savedEnv = {};
ENV_KEYS.forEach(function (k) { savedEnv[k] = process.env[k]; });

var LS = require('../api/_lib/ledger-sync'), Q = require('../api/_lib/qbo');
var connectApi = require('../api/ledger-connect'), hook = require('../api/ledger-webhook');
var ORG = 'cleancell.us', QB = 'https://quickbooks.api.intuit.com/v3/company/';
var admin = { uid: 'u-admin', email: 'office@cleancell.us', orgId: ORG, staff: false };

function reset(values) { db = new DB(); calls = []; routes = []; synced = []; syncFails = 0; env(values === undefined ? FULL : values); }
function qbSeed(org, realm, extra) {
  db.seed('integrations/quickbooks_workspaces/orgs/' + org, Object.assign({ accessToken: 'AT-SECRET-token', expiresAt: Date.now() + 3600000,
    refreshToken: 'RT-SECRET-token', refreshExpiresAt: Date.now() + 90 * 86400000, env: 'production', realmId: realm, orgId: org,
    connectedAt: '2026-09-20T12:00:00.000Z', connectedBy: 'office@cleancell.us', companyName: 'Clean Cell USA', tokenType: 'bearer' }, extra || {}));
}
function stSeed(org, acct, extra) {
  db.seed('integrations/stripe_connect/orgs/' + org, Object.assign({ orgId: org, accountId: acct, livemode: false, scope: 'read_write',
    connectedAt: '2026-09-20T12:05:00.000Z', connectedBy: 'office@cleancell.us', disconnectedAt: null, disconnectedBy: null, lastError: null }, extra || {}));
  db.seed('integrations/stripe_connect/accounts/' + acct, { orgId: org, connectedAt: '2026-09-20T12:05:00.000Z', disconnectedAt: null });
}
function view(o) {
  o = o || {};
  return { id: o.id || 'amp', orgId: ORG, orderNo: o.orderNo || 'CC-26-5001', poNumber: o.po === undefined ? 'CCUS-3V3I-0926' : o.po,
    customer: { name: 'Dana Reyes', company: 'Amperage Capital', email: 'ap@amperage.example' },
    account: o.account || { id: 'c1', key: 'account:c1', name: 'Amperage Capital' },
    invoice: { stage: o.stage || 'deposit', number: o.number || 'CCUS-3V3I-0926-01 Rev B', issuedAt: '2026-09-23', dueAt: o.dueAt === undefined ? '2026-09-23' : o.dueAt,
      amountCents: o.amountCents || 134909910, ledger: o.ledger || null, payments: o.payments || [] },
    ledgerSync: o.ledgerSync || { provider: 'quickbooks', quickbooks: { itemRef: '17', taxCodeRef: 'NON', approved: true } } };
}
function form(body) { return new URLSearchParams(body || ''); }
function fakeRes() {
  return { headers: {}, code: null, ended: false,
    setHeader: function (k, v) { this.headers[k.toLowerCase()] = v; }, status: function (c) { this.code = c; return this; },
    end: function () { this.ended = true; return this; }, json: function (b) { this.body = b; return this; } };
}
function snapshotDb() { return JSON.parse(JSON.stringify(Array.from(db.data.entries()))); }
function secretsIn(text) {
  return [FULL.QBO_CLIENT_SECRET, FULL.STRIPE_SECRET_KEY, FULL.STRIPE_CONNECT_WEBHOOK_SECRET, 'AT-SECRET', 'RT-SECRET', 'TOKENSECRET', 'rt_SECRET', 'pk_test_x']
    .filter(function (s) { return text.indexOf(s) >= 0; });
}
async function newState(provider, org) {
  var s = crypto.randomBytes(32).toString('hex');
  db.seed('integrations/ledger_oauth/states/' + s, { provider: provider, orgId: org || ORG, uid: 'u-admin', email: 'office@cleancell.us',
    createdAt: new Date().toISOString(), expiresAt: Date.now() + 600000, used: false });
  return s;
}
function cbReq(q, cookieState) { return { method: 'GET', query: q, headers: { cookie: 'x=1; omega_ledger_state=' + (cookieState || q.state) } }; }
function qbTokenRoute(tok) { route('POST', /oauth\.platform\.intuit\.com\/oauth2\/v1\/tokens\/bearer/, ok(Object.assign({ access_token: 'AT-SECRET-new', refresh_token: 'RT-SECRET-new', expires_in: 3600, x_refresh_token_expires_in: 8726400, token_type: 'bearer' }, tok || {}))); }

async function main() {

await check('status names every missing variable and never returns a secret', async function () {
  reset({});
  var s = await LS.status(ORG);
  assert.deepEqual(s.quickbooks.missing, ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_WORKSPACE_REDIRECT_URI']);
  assert.deepEqual(s.stripe.missing, ['STRIPE_SECRET_KEY', 'STRIPE_CONNECT_CLIENT_ID', 'STRIPE_CONNECT_REDIRECT_URI', 'STRIPE_CONNECT_WEBHOOK_SECRET']);
  assert.equal(s.quickbooks.configured, false); assert.equal(s.stripe.configured, false);
  assert.equal(s.quickbooks.connected, false); assert.equal(s.stripe.connected, false); assert.equal(s.stripe.webhook, false);
  assert.equal(s.quickbooks.connectHost, null); assert.equal(s.quickbooks.env, 'production');
  assert.deepEqual(LS.providers.quickbooks.missing(), s.quickbooks.missing);
  /* not configured: every provider call refuses with the names, and ready() is false without throwing */
  for (var p of LS.PROVIDERS) {
    assert.equal(await LS.providers[p].ready(ORG), false);
    var names = p === 'quickbooks' ? 'QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_WORKSPACE_REDIRECT_URI' : 'STRIPE_SECRET_KEY, STRIPE_CONNECT_CLIENT_ID, STRIPE_CONNECT_REDIRECT_URI, STRIPE_CONNECT_WEBHOOK_SECRET';
    await assert.rejects(LS.providers[p].connectUrl(ORG, admin), { status: 503, message: 'Missing on this deployment: ' + names });
    await assert.rejects(LS.providers[p].pushInvoice(ORG, view(), 'deposit'), { status: 503 });
    await assert.rejects(LS.providers[p].linkInvoice(ORG, view(), 'deposit', 'in_1'), { status: 503 });
    await assert.rejects(LS.providers[p].pullPayments(ORG, view(), 'deposit'), { status: 503 });
  }
  reset({ QBO_CLIENT_ID: 'x', STRIPE_SECRET_KEY: FULL.STRIPE_SECRET_KEY });
  s = await LS.status(ORG);
  assert.deepEqual(s.quickbooks.missing, ['QBO_CLIENT_SECRET', 'QBO_WORKSPACE_REDIRECT_URI']);
  assert.deepEqual(s.stripe.missing, ['STRIPE_CONNECT_CLIENT_ID', 'STRIPE_CONNECT_REDIRECT_URI', 'STRIPE_CONNECT_WEBHOOK_SECRET']);
  /* configured, not connected */
  reset();
  s = await LS.status(ORG);
  assert.equal(s.quickbooks.configured, true); assert.equal(s.quickbooks.connectHost, 'tools.csebuilders.com'); assert.equal(s.stripe.webhook, true);
  await assert.rejects(LS.providers.quickbooks.pushInvoice(ORG, view(), 'deposit'), { status: 409, message: 'Connect QuickBooks for this workspace first' });
  await assert.rejects(LS.providers.stripe.pullPayments(ORG, view(), 'deposit'), { status: 409, message: 'Connect Stripe for this workspace first' });
  /* connected, with tokens in the documents: the status carries none of them */
  qbSeed(ORG, '9130'); stSeed(ORG, 'acct_1CLEAN');
  s = await LS.status(ORG);
  assert.equal(s.quickbooks.connected, true); assert.equal(s.quickbooks.realmId, '9130'); assert.equal(s.quickbooks.companyName, 'Clean Cell USA');
  assert.equal(s.quickbooks.connectedAt, '2026-09-20T12:00:00.000Z'); assert.match(s.quickbooks.refreshExpiresAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(s.stripe.connected, true); assert.equal(s.stripe.accountId, 'acct_1CLEAN'); assert.equal(s.stripe.livemode, false);
  assert.equal(await LS.providers.quickbooks.ready(ORG), true); assert.equal(await LS.providers.stripe.ready(ORG), true);
  var text = JSON.stringify(s);
  assert.deepEqual(secretsIn(text), [], 'status leaked ' + secretsIn(text));
  assert.equal(text.indexOf('accessToken'), -1); assert.equal(text.indexOf('refreshToken'), -1);
  /* an expired refresh token is not "connected": the page offers Connect again and says why */
  qbSeed(ORG, '9130', { refreshExpiresAt: Date.now() - 1000 });
  s = await LS.status(ORG);
  assert.equal(s.quickbooks.connected, false); assert.match(s.quickbooks.lastError, /refresh token expired — reconnect from the accounting page/);
  assert.equal(await LS.providers.quickbooks.ready(ORG), false);
  assert.deepEqual(Object.keys(s.quickbooks).sort(), ['configured', 'connectHost', 'connected', 'connectedAt', 'connectedBy', 'companyName', 'env', 'lastError', 'missing', 'realmId', 'refreshExpiresAt'].sort());
  assert.deepEqual(Object.keys(s.stripe).sort(), ['accountId', 'configured', 'connectHost', 'connected', 'connectedAt', 'connectedBy', 'lastError', 'livemode', 'missing', 'webhook'].sort());
});

await check('qbo.js without an org is ClearSky\'s single company exactly as before', async function () {
  reset();
  assert.equal(Q.docPath(), 'integrations/quickbooks'); assert.equal(Q.DOC, 'integrations/quickbooks');
  assert.equal(Q.cfg().redirect, FULL.QBO_REDIRECT_URI);
  assert.equal(form(Q.authorizeUrl('s1').split('?')[1]).get('redirect_uri'), FULL.QBO_REDIRECT_URI);
  await assert.rejects(Q.accessToken(), { status: 409, message: 'QuickBooks is not connected' });
  db.seed('integrations/quickbooks', { accessToken: 'old', expiresAt: Date.now() - 1, refreshToken: 'rt-clearsky-1', env: 'production', realmId: '123', refreshExpiresAt: Date.now() + 86400000 });
  db.seed('integrations/quickbooks_workspaces/orgs/' + ORG, { accessToken: 'ws', expiresAt: Date.now() + 3600000, refreshToken: 'rt-ws', env: 'production', realmId: '9130' });
  var wsBefore = JSON.stringify(db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG)), pathsBefore = Array.from(db.data.keys()).sort();
  qbTokenRoute({ access_token: 'new-clearsky', refresh_token: 'rt-clearsky-2' });
  var a = await Q.accessToken();
  assert.deepEqual(a, { token: 'new-clearsky', realmId: '123' });
  var cs = db.data.get('integrations/quickbooks');
  assert.equal(cs.refreshToken, 'rt-clearsky-2'); assert.equal(cs.refreshLeaseUntil, 0); assert.equal('orgId' in cs, false);
  assert.equal(JSON.stringify(db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG)), wsBefore, 'the workspace document is untouched');
  assert.deepEqual(Array.from(db.data.keys()).sort(), pathsBefore, 'the refresh wrote ClearSky\'s document and nothing else');
  assert.equal(form(calls[0].body).get('refresh_token'), 'rt-clearsky-1');
  assert.equal((await Q.load()).realmId, '123');
  route('GET', /\/v3\/company\/123\/query\?minorversion=70&query=/, ok({ QueryResponse: { Invoice: [] } }));
  assert.deepEqual(await Q.query('select * from Invoice'), { Invoice: [] });
  db.seed('integrations/quickbooks', Object.assign(db.data.get('integrations/quickbooks'), { refreshExpiresAt: Date.now() - 1 }));
  await assert.rejects(Q.accessToken(), { status: 409, message: 'QuickBooks refresh token expired — reconnect from the admin console' });
  /* the workspace helpers never fall back to ClearSky's company */
  calls = [];
  await assert.rejects(Q.request(undefined, 'invoice', {}), { status: 400, message: 'Valid org required' });
  assert.equal(await Q.revoke(), false);
  assert.equal(calls.length, 0);
});

await check('qbo.js with an org keeps its own token document, redirect and refresh lease', async function () {
  reset();
  assert.equal(Q.docPath(ORG), 'integrations/quickbooks_workspaces/orgs/cleancell.us');
  assert.throws(function () { Q.docPath('cleancell.us/customers/x'); }, { status: 400, message: 'Valid org required' });
  assert.equal(Q.cfg(ORG).redirect, FULL.QBO_WORKSPACE_REDIRECT_URI);
  assert.equal(form(Q.authorizeUrl('s2', ORG).split('?')[1]).get('redirect_uri'), FULL.QBO_WORKSPACE_REDIRECT_URI);
  await assert.rejects(Q.accessToken(ORG), { status: 409, message: 'QuickBooks is not connected for this workspace' });
  db.seed('integrations/quickbooks', { accessToken: 'cs-live', expiresAt: Date.now() + 3600000, refreshToken: 'rt-cs', env: 'production', realmId: '123' });
  var csBefore = JSON.stringify(db.data.get('integrations/quickbooks'));
  qbSeed(ORG, '9130', { accessToken: 'stale', expiresAt: Date.now() - 1 });
  qbTokenRoute({ access_token: 'ws-fresh', refresh_token: 'rt-ws-2' });
  assert.deepEqual(await Q.accessToken(ORG), { token: 'ws-fresh', realmId: '9130' });
  var ws = db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG);
  assert.equal(ws.refreshToken, 'rt-ws-2'); assert.equal(ws.orgId, ORG);
  assert.equal(form(calls[0].body).get('refresh_token'), 'RT-SECRET-token');
  assert.equal(JSON.stringify(db.data.get('integrations/quickbooks')), csBefore, 'ClearSky\'s document is untouched');
  /* the lease lives on the workspace document: a refresh in progress there does not touch ClearSky's */
  qbSeed(ORG, '9130', { accessToken: 'stale', expiresAt: Date.now() - 1, refreshLeaseUntil: Date.now() + 60000 });
  await assert.rejects(Q.accessToken(ORG), { status: 503, message: 'QuickBooks token refresh in progress; retry' });
  assert.deepEqual(await Q.accessToken(), { token: 'cs-live', realmId: '123' });
  qbSeed(ORG, '9130', { refreshExpiresAt: Date.now() - 1 });
  await assert.rejects(Q.accessToken(ORG), { status: 409, message: 'QuickBooks refresh token expired — reconnect from the accounting page' });
  /* request(): the workspace's realm, minorversion 75, Intuit's request id, JSON; a Fault is a 502 with its code */
  qbSeed(ORG, '9130');
  calls = [];
  route('POST', /\/v3\/company\/9130\/invoice\?minorversion=75&requestid=rid-1$/, ok({ Invoice: { Id: '145' } }));
  var j = await Q.request(ORG, 'invoice', { Line: [] }, 'rid-1');
  assert.equal(j.Invoice.Id, '145'); assert.equal(j.realmId, '9130');
  assert.equal(calls[0].headers.Authorization, 'Bearer AT-SECRET-token'); assert.deepEqual(JSON.parse(calls[0].body), { Line: [] });
  route('GET', /\/v3\/company\/9130\/invoice\/999\?minorversion=75$/, { status: 400, body: { Fault: { Error: [{ code: '610', Message: 'Object Not Found: Amperage Capital' }] } } });
  await assert.rejects(Q.request(ORG, 'invoice/999'), function (e) {
    assert.equal(e.status, 502); assert.equal(e.code, '610');
    assert.equal(e.message, 'QuickBooks request failed (400); review the integration and retry'); return true;
  });
  var saved = await Q.save({ access_token: 'x', expires_in: 3600 }, '9130', { connectedBy: 'office@cleancell.us' }, ORG);
  assert.equal(saved.orgId, ORG); assert.equal(db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG).connectedBy, 'office@cleancell.us');
});

await check('QuickBooks connect: one-time state and cookie; ClearSky\'s company refused; a second company refused until disconnect', async function () {
  reset();
  db.seed('integrations/quickbooks', { realmId: '123', refreshToken: 'rt-cs', env: 'production' });
  var out = await LS.providers.quickbooks.connectUrl(ORG, admin);
  var u = new URL(out.url), state = u.searchParams.get('state');
  assert.equal(u.origin + u.pathname, 'https://appcenter.intuit.com/connect/oauth2');
  assert.equal(u.searchParams.get('scope'), 'com.intuit.quickbooks.accounting');
  assert.equal(u.searchParams.get('redirect_uri'), FULL.QBO_WORKSPACE_REDIRECT_URI);
  assert.equal(u.searchParams.get('client_id'), FULL.QBO_CLIENT_ID);
  assert.match(state, /^[a-f0-9]{64}$/);
  assert.equal(out.setCookie, 'omega_ledger_state=' + state + '; Path=/api/ledger-connect; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  var sd = db.data.get('integrations/ledger_oauth/states/' + state);
  assert.equal(sd.provider, 'quickbooks'); assert.equal(sd.orgId, ORG); assert.equal(sd.uid, 'u-admin'); assert.equal(sd.email, 'office@cleancell.us'); assert.equal(sd.used, false);
  assert(sd.expiresAt > Date.now() + 590000 && sd.expiresAt <= Date.now() + 600000);
  assert.equal(JSON.stringify(out).indexOf(FULL.QBO_CLIENT_SECRET), -1);
  /* the cookie must match the state */
  await assert.rejects(LS.finishConnect(cbReq({ state: state, code: 'c1', realmId: '9130' }, 'f'.repeat(64))), { status: 403, message: 'OAuth state mismatch; start from the accounting page' });
  qbTokenRoute();
  route('GET', /\/v3\/company\/9130\/companyinfo\/9130/, ok({ CompanyInfo: { CompanyName: 'Clean Cell USA LLC' } }));
  var done = await LS.finishConnect(cbReq({ state: state, code: 'auth-code-1', realmId: '9130' }));
  assert.deepEqual(done, { org: ORG, provider: 'quickbooks', location: '/logic-accounting.html?org=cleancell.us&connected=quickbooks' });
  var tokenCall = calls.filter(function (c) { return /tokens\/bearer/.test(c.url); })[0], tf = form(tokenCall.body);
  assert.equal(tf.get('grant_type'), 'authorization_code'); assert.equal(tf.get('code'), 'auth-code-1'); assert.equal(tf.get('redirect_uri'), FULL.QBO_WORKSPACE_REDIRECT_URI);
  var ws = db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG);
  assert.equal(ws.realmId, '9130'); assert.equal(ws.orgId, ORG); assert.equal(ws.connectedBy, 'office@cleancell.us'); assert.equal(ws.companyName, 'Clean Cell USA LLC');
  assert.equal(ws.disconnectedAt, null); assert.equal(ws.refreshToken, 'RT-SECRET-new');
  assert.equal(db.data.get('integrations/quickbooks').realmId, '123', 'ClearSky\'s company untouched');
  var audit = Array.from(db.data.entries()).filter(function (e) { return /^omega_audit\//.test(e[0]); }).map(function (e) { return e[1]; });
  assert.equal(audit.length, 1); assert.equal(audit[0].action, 'ledger-sync-connected'); assert.equal(audit[0].company, '9130'); assert.equal(audit[0].provider, 'quickbooks');
  /* one-time */
  await assert.rejects(LS.finishConnect(cbReq({ state: state, code: 'auth-code-1', realmId: '9130' })), { status: 403, message: 'OAuth request expired or already used' });
  /* expired */
  var old = await newState('quickbooks');
  db.seed('integrations/ledger_oauth/states/' + old, Object.assign(db.data.get('integrations/ledger_oauth/states/' + old), { expiresAt: Date.now() - 1 }));
  await assert.rejects(LS.finishConnect(cbReq({ state: old, code: 'c', realmId: '9130' })), { status: 403, message: 'OAuth request expired or already used' });
  /* already connected: no second flow starts, and a stray callback for another company is refused before any token call */
  await assert.rejects(LS.providers.quickbooks.connectUrl(ORG, admin), { status: 409, message: 'Already connected to QuickBooks company 9130; disconnect it first' });
  calls = [];
  var s2 = await newState('quickbooks');
  await assert.rejects(LS.finishConnect(cbReq({ state: s2, code: 'c2', realmId: '7777' })), { status: 409, message: 'This workspace is connected to QuickBooks company 9130. Disconnect it on the accounting page first.' });
  assert.equal(calls.length, 0);
  /* ClearSky's own company is never a workspace's */
  var other = 'other.example', s3 = await newState('quickbooks', other);
  await assert.rejects(LS.finishConnect(cbReq({ state: s3, code: 'c3', realmId: '123' })), { status: 409, message: 'That is ClearSky\'s QuickBooks company. Connect this workspace\'s own company.' });
  assert.equal(db.data.has('integrations/quickbooks_workspaces/orgs/' + other), false);
  /* a realm that is not digits */
  var s4 = await newState('quickbooks', other);
  await assert.rejects(LS.finishConnect(cbReq({ state: s4, code: 'c4', realmId: '12a' })), { status: 400, message: 'Invalid QuickBooks company' });
  /* after disconnect a different company connects */
  route('POST', /developer\.api\.intuit\.com\/v2\/oauth2\/tokens\/revoke/, ok({}));
  await LS.providers.quickbooks.disconnect(ORG, admin);
  var again = await LS.providers.quickbooks.connectUrl(ORG, admin), s5 = new URL(again.url).searchParams.get('state');
  route('GET', /\/v3\/company\/7777\/companyinfo/, { status: 500, body: {} });   /* best effort: a failure here does not fail the connect */
  await LS.finishConnect(cbReq({ state: s5, code: 'c5', realmId: '7777' }));
  ws = db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG);
  assert.equal(ws.realmId, '7777'); assert.equal(ws.disconnectedAt, null); assert.equal(ws.companyName, null);
  assert.equal((await LS.status(ORG)).quickbooks.connected, true);
});

await check('QuickBooks push: one customer per ACCOUNT, stable request ids, DocNumber only up to 21 characters, a total mismatch is a warning', async function () {
  reset(); qbSeed(ORG, '9130');
  var inv = { Id: '145', TotalAmt: 1349099.10, CustomerRef: { value: '58' }, InvoiceLink: 'https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-abc' };
  route('GET', /\/9130\/query\?query=/, ok({ QueryResponse: {} }));
  route('POST', /\/9130\/customer\?/, ok({ Customer: { Id: '58' } }));
  var nextInvoice = 145;
  route('POST', /\/9130\/invoice\?/, function () { return ok({ Invoice: { Id: String(nextInvoice++) } }); });
  route('GET', /\/9130\/invoice\/\d+\?include=invoiceLink/, function (c) { var id = /invoice\/(\d+)/.exec(c.url)[1]; return ok({ Invoice: Object.assign({}, inv, { Id: id }) }); });
  route('GET', /\/9130\/invoice\/145\?include=invoiceLink/, function () { return ok({ Invoice: inv }); });
  /* the item and tax treatment must be approved first */
  await assert.rejects(LS.providers.quickbooks.pushInvoice(ORG, view({ ledgerSync: { provider: 'quickbooks', quickbooks: { itemRef: '17', approved: false } } }), 'deposit'),
    { status: 409, message: 'Choose and approve the QuickBooks item for installment invoices on the accounting page first' });
  await assert.rejects(LS.providers.quickbooks.pushInvoice(ORG, view({ ledgerSync: { provider: 'quickbooks', quickbooks: { itemRef: 'abc', approved: true } } }), 'deposit'), { status: 409 });
  calls = [];
  var r = await LS.providers.quickbooks.pushInvoice(ORG, view(), 'deposit');
  assert.deepEqual(r, { provider: 'quickbooks', invoiceId: '145', number: null, customerId: '58', company: '9130',
    hostedUrl: 'https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-abc', totalCents: 134909910, warning: null });
  var q = calls.filter(function (c) { return /\/query\?/.test(c.url); })[0];
  assert.equal(decodeURIComponent(q.url.split('query=')[1].split('&')[0]), "select * from Customer where DisplayName = 'Amperage Capital'");
  var cust = calls.filter(function (c) { return /\/customer\?/.test(c.url); })[0];
  assert.match(cust.url, new RegExp('requestid=' + P.key('ws-customer:cleancell.us:9130:account:c1') + '$'));
  assert.deepEqual(JSON.parse(cust.body), { DisplayName: 'Amperage Capital', CompanyName: 'Amperage Capital', PrimaryEmailAddr: { Address: 'ap@amperage.example' } });
  var post = calls.filter(function (c) { return c.method === 'POST' && /\/invoice\?/.test(c.url); })[0], body = JSON.parse(post.body);
  assert.match(post.url, new RegExp('requestid=' + P.key('ws-invoice:cleancell.us:amp:deposit:CCUS-3V3I-0926-01 Rev B') + '$'));
  assert.equal('DocNumber' in body, false, '23 characters is over QuickBooks\' 21');
  assert.equal(body.CustomerRef.value, '58'); assert.equal(body.CurrencyRef.value, 'USD'); assert.equal(body.TxnDate, '2026-09-23'); assert.equal(body.DueDate, '2026-09-23');
  assert.equal(body.Line.length, 1); assert.equal(body.Line[0].Amount, 1349099.1); assert.equal(body.Line[0].SalesItemLineDetail.UnitPrice, 1349099.1);
  assert.equal(body.Line[0].SalesItemLineDetail.Qty, 1); assert.equal(body.Line[0].SalesItemLineDetail.ItemRef.value, '17'); assert.equal(body.Line[0].SalesItemLineDetail.TaxCodeRef.value, 'NON');
  assert.equal(body.PrivateNote, 'OMEGA cleancell.us / CC-26-5001 / deposit / CCUS-3V3I-0926-01 Rev B');
  assert.equal(body.CustomerMemo.value, 'Deposit — PO CCUS-3V3I-0926 — Invoice CCUS-3V3I-0926-01 Rev B');
  assert.equal(body.BillEmail.Address, 'ap@amperage.example'); assert.equal(body.AllowOnlineACHPayment, true);
  var map = db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG + '/customers/' + P.key('account:c1'));
  assert.deepEqual([map.accountKey, map.realmId, map.qboCustomerId, map.matchedExisting], ['account:c1', '9130', '58', false]);
  assert.equal(db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG + '/invoices/145').orderId, 'amp');
  /* the balance of another order on the SAME account reuses the customer; a short number is the DocNumber */
  calls = [];
  route('GET', /\/9130\/invoice\/146\?include=invoiceLink/, ok({ Invoice: { Id: '146', DocNumber: 'INV-1001', TotalAmt: 1450000, CustomerRef: { value: '58' } } }));
  r = await LS.providers.quickbooks.pushInvoice(ORG, view({ id: 'amp2', stage: 'balance', number: 'INV-1001', amountCents: 14990000, po: null }), 'balance');
  assert.equal(calls.filter(function (c) { return /\/customer\?|\/query\?/.test(c.url); }).length, 0, 'one customer per account');
  body = JSON.parse(calls.filter(function (c) { return c.method === 'POST'; })[0].body);
  assert.equal(body.DocNumber, 'INV-1001'); assert.equal(body.CustomerMemo.value, 'Balance — Invoice INV-1001');
  assert.equal(r.number, 'INV-1001'); assert.equal(r.hostedUrl, null);
  assert.equal(r.warning, 'QuickBooks total USD 1450000.00 differs from USD 149900.00 — check the item\'s tax treatment');
  /* an existing customer with exactly that name is adopted */
  calls = [];
  route('GET', /\/9130\/query\?query=/, ok({ QueryResponse: { Customer: [{ Id: '77', DisplayName: 'Sierra Storage' }] } }));
  await LS.providers.quickbooks.pushInvoice(ORG, view({ id: 'o2', number: 'SS-1042', account: { id: 'c2', key: 'account:c2', name: 'Sierra O\'Neil Storage' } }), 'deposit');
  assert.equal(calls.filter(function (c) { return /\/customer\?/.test(c.url); }).length, 0);
  assert.match(decodeURIComponent(calls[0].url), /DisplayName = 'Sierra O\\'Neil Storage'/);
  assert.equal(db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG + '/customers/' + P.key('account:c2')).matchedExisting, true);
  /* a name QuickBooks already uses elsewhere (6240) gets a stable suffix */
  calls = [];
  route('GET', /\/9130\/query\?query=/, ok({ QueryResponse: {} }));
  var tries = 0;
  route('POST', /\/9130\/customer\?/, function () { tries++; return tries === 1 ? { status: 400, body: { Fault: { Error: [{ code: '6240', Message: 'Duplicate Name Exists Error' }] } } } : ok({ Customer: { Id: '90' } }); });
  await LS.providers.quickbooks.pushInvoice(ORG, view({ id: 'o3', number: 'X-1', account: { id: null, key: 'email:buyer@solo.example', name: 'Solo Buyer' } }), 'deposit');
  var posts = calls.filter(function (c) { return /\/customer\?/.test(c.url); });
  assert.equal(posts.length, 2);
  assert.equal(JSON.parse(posts[1].body).DisplayName, 'Solo Buyer (' + P.key('email:buyer@solo.example').slice(0, 6) + ')');
  assert.notEqual(posts[0].url.split('requestid=')[1], posts[1].url.split('requestid=')[1]);
  /* resume: pushing an order that already has a live invoice in this company returns it, no second invoice */
  calls = [];
  route('GET', /\/9130\/invoice\/145\?minorversion=75$/, ok({ Invoice: inv }));
  r = await LS.providers.quickbooks.pushInvoice(ORG, view(), 'deposit');
  assert.equal(r.invoiceId, '145');
  assert.equal(calls.filter(function (c) { return c.method === 'POST'; }).length, 0);
});

await check('QuickBooks pull: linked payments become qbo: references; split allocations refused; a vanished payment is a reversal', async function () {
  reset(); qbSeed(ORG, '9130');
  var ledger = { provider: 'quickbooks', state: 'pushed', invoiceId: '145', company: '9130', customerId: '58', totalCents: 134909910 };
  var inv = { Id: '145', TotalAmt: 1349099.10, LinkedTxn: [{ TxnId: '901', TxnType: 'Payment' }, { TxnId: '902', TxnType: 'Payment' }, { TxnId: '901', TxnType: 'Payment' }, { TxnId: '5', TxnType: 'Estimate' }] };
  var pay = {
    '901': { Id: '901', CustomerRef: { value: '58' }, TotalAmt: 1000000, TxnDate: '2026-10-02', Line: [{ Amount: 1000000, LinkedTxn: [{ TxnId: '145', TxnType: 'Invoice' }] }] },
    '902': { Id: '902', CustomerRef: { value: '58' }, TotalAmt: 400000, TxnDate: '2026-10-03', Line: [{ Amount: 349099.10, LinkedTxn: [{ TxnId: '145', TxnType: 'Invoice' }] }, { Amount: 50900.90, LinkedTxn: [{ TxnId: '146', TxnType: 'Invoice' }] }] }
  };
  route('GET', /\/9130\/invoice\/145\?minorversion=75$/, function () { return ok({ Invoice: inv }); });
  route('GET', /\/9130\/payment\/(\d+)\?/, function (c) { return ok({ Payment: pay[/payment\/(\d+)/.exec(c.url)[1]] }); });
  var payments = [
    { amountCents: 500, date: '2026-09-01', bankReference: 'qbo:880', source: 'quickbooks', external: { paymentId: '880' } },
    { amountCents: 700, date: '2026-09-01', bankReference: 'qbo:881', source: 'quickbooks', voidedAt: '2026-09-02T00:00:00Z' },
    { amountCents: 900, date: '2026-09-01', bankReference: 'ACH 4471' }
  ];
  var items = await LS.providers.quickbooks.pullPayments(ORG, view({ ledger: ledger, payments: payments }), 'deposit');
  assert.deepEqual(items, [
    { ref: 'qbo:901', amountCents: 100000000, date: '2026-10-02', reversed: false, external: { paymentId: '901' } },
    { ref: 'qbo:902', amountCents: 34909910, date: '2026-10-03', reversed: false, external: { paymentId: '902' } },
    { ref: 'qbo:880', amountCents: 500, date: '2026-09-01', reversed: true, external: { paymentId: '880' } }
  ]);
  assert.equal(calls.filter(function (c) { return /\/payment\//.test(c.url); }).length, 2, 'each payment read once');
  /* a line that settles this invoice together with another transaction cannot prove this invoice's share */
  pay['902'].Line = [{ Amount: 400000, LinkedTxn: [{ TxnId: '145', TxnType: 'Invoice' }, { TxnId: '146', TxnType: 'Invoice' }] }];
  await assert.rejects(LS.providers.quickbooks.pullPayments(ORG, view({ ledger: ledger }), 'deposit'), { status: 409, message: 'Ambiguous QuickBooks payment allocation' });
  pay['902'].Line = [{ Amount: 349099.10, LinkedTxn: [{ TxnId: '145', TxnType: 'Invoice' }] }];
  pay['902'].CustomerRef = { value: '59' };
  await assert.rejects(LS.providers.quickbooks.pullPayments(ORG, view({ ledger: ledger }), 'deposit'), { status: 409, message: 'Payment customer mismatch' });
  pay['902'].CustomerRef = { value: '58' };
  /* the invoice changed under us, or lives in another company */
  inv.TotalAmt = 1349000;
  await assert.rejects(LS.providers.quickbooks.pullPayments(ORG, view({ ledger: ledger }), 'deposit'), { status: 409, message: 'QuickBooks invoice changed; reconcile by hand' });
  inv.TotalAmt = 1349099.10;
  await assert.rejects(LS.providers.quickbooks.pullPayments(ORG, view({ ledger: Object.assign({}, ledger, { company: '1111' }) }), 'deposit'),
    { status: 409, message: 'This invoice was pushed to QuickBooks company 1111; the workspace is now connected to 9130' });
  await assert.rejects(LS.providers.quickbooks.pullPayments(ORG, view({ ledger: { provider: 'stripe', invoiceId: 'in_1' } }), 'deposit'), { status: 409, message: 'This invoice is not in QuickBooks' });
  inv.LinkedTxn = []; for (var i = 0; i < 41; i++) inv.LinkedTxn.push({ TxnId: String(1000 + i), TxnType: 'Payment' });
  await assert.rejects(LS.providers.quickbooks.pullPayments(ORG, view({ ledger: ledger }), 'deposit'), { status: 409, message: 'Too many payment allocations; reconcile this invoice manually' });
});

await check('QuickBooks link: an existing invoice is adopted only when amount and currency match', async function () {
  reset(); qbSeed(ORG, '9130');
  var inv = { Id: '145', DocNumber: 'CCUS-01', TotalAmt: 1349099.10, CustomerRef: { value: '58', name: 'Amperage Capital LLC' }, CurrencyRef: { value: 'USD' } };
  route('GET', /\/9130\/invoice\/145\?include=invoiceLink/, function () { return ok({ Invoice: inv }); });
  await assert.rejects(LS.providers.quickbooks.linkInvoice(ORG, view(), 'deposit', 'in_1'), { status: 400, message: 'QuickBooks invoice id must be digits' });
  var r = await LS.providers.quickbooks.linkInvoice(ORG, view(), 'deposit', '145');
  assert.deepEqual(r, { provider: 'quickbooks', invoiceId: '145', number: 'CCUS-01', customerId: '58', company: '9130', hostedUrl: null, totalCents: 134909910, warning: null });
  var map = db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG + '/customers/' + P.key('account:c1'));
  assert.equal(map.qboCustomerId, '58'); assert.equal(map.matchedExisting, true); assert.equal(map.displayName, 'Amperage Capital LLC');
  assert.equal(calls.filter(function (c) { return c.method === 'POST'; }).length, 0, 'linking creates nothing in QuickBooks');
  /* the same QuickBooks invoice cannot be linked to a second order */
  await assert.rejects(LS.providers.quickbooks.linkInvoice(ORG, view({ id: 'other' }), 'deposit', '145'), { status: 409, message: /already linked to another order/ });
  inv.TotalAmt = 1349000;
  await assert.rejects(LS.providers.quickbooks.linkInvoice(ORG, view(), 'deposit', '145'), { status: 409, message: 'QuickBooks invoice 145 is USD 1349000.00; this invoice is USD 1349099.10' });
  inv.TotalAmt = 1349099.10; inv.CurrencyRef = { value: 'CAD' };
  await assert.rejects(LS.providers.quickbooks.linkInvoice(ORG, view(), 'deposit', '145'), { status: 409, message: 'QuickBooks invoice 145 is CAD 1349099.10; this invoice is USD 1349099.10' });
});

await check('Stripe connect: OAuth URL, token exchange keeps only the account id, account index written, another workspace\'s account refused', async function () {
  reset();
  var out = await LS.providers.stripe.connectUrl(ORG, admin), u = new URL(out.url), state = u.searchParams.get('state');
  assert.equal(u.origin + u.pathname, 'https://connect.stripe.com/oauth/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code'); assert.equal(u.searchParams.get('client_id'), 'ca_ClientId123');
  assert.equal(u.searchParams.get('scope'), 'read_write'); assert.equal(u.searchParams.get('redirect_uri'), FULL.STRIPE_CONNECT_REDIRECT_URI);
  assert.match(state, /^[a-f0-9]{64}$/); assert.equal(db.data.get('integrations/ledger_oauth/states/' + state).provider, 'stripe');
  assert.equal(out.setCookie, 'omega_ledger_state=' + state + '; Path=/api/ledger-connect; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  assert.deepEqual(secretsIn(JSON.stringify(out)), []);
  route('POST', /^https:\/\/connect\.stripe\.com\/oauth\/token$/, ok({ access_token: 'sk_test_TOKENSECRET', refresh_token: 'rt_SECRET', stripe_publishable_key: 'pk_test_x',
    stripe_user_id: 'acct_1CLEAN', livemode: false, scope: 'read_write', token_type: 'bearer' }));
  var done = await LS.finishConnect(cbReq({ state: state, code: 'ac_123' }));
  assert.equal(done.location, '/logic-accounting.html?org=cleancell.us&connected=stripe');
  var tc = calls.filter(function (c) { return /oauth\/token/.test(c.url); })[0];
  assert.equal(tc.headers.Authorization, 'Bearer ' + FULL.STRIPE_SECRET_KEY); assert.equal(tc.headers['Stripe-Account'], undefined);
  assert.equal(form(tc.body).get('grant_type'), 'authorization_code'); assert.equal(form(tc.body).get('code'), 'ac_123');
  var d = db.data.get('integrations/stripe_connect/orgs/' + ORG);
  assert.deepEqual(Object.keys(d).sort(), ['accountId', 'connectedAt', 'connectedBy', 'disconnectedAt', 'disconnectedBy', 'lastError', 'livemode', 'orgId', 'scope']);
  assert.equal(d.accountId, 'acct_1CLEAN'); assert.equal(d.livemode, false); assert.equal(d.connectedBy, 'office@cleancell.us');
  var idx = db.data.get('integrations/stripe_connect/accounts/acct_1CLEAN');
  assert.equal(idx.orgId, ORG); assert.equal(idx.disconnectedAt, null);
  assert.deepEqual(secretsIn(JSON.stringify(snapshotDb())), [], 'no Stripe token is stored anywhere');
  var audit = Array.from(db.data.entries()).filter(function (e) { return /^omega_audit\//.test(e[0]); })[0][1];
  assert.equal(audit.action, 'ledger-sync-connected'); assert.equal(audit.company, 'acct_1CLEAN'); assert.equal(audit.provider, 'stripe');
  await assert.rejects(LS.providers.stripe.connectUrl(ORG, admin), { status: 409, message: 'Already connected to Stripe account acct_1CLEAN; disconnect it first' });
  /* the same Stripe account for another workspace */
  var s2 = await newState('stripe', 'other.example');
  await assert.rejects(LS.finishConnect(cbReq({ state: s2, code: 'ac_2' })), { status: 409, message: 'That Stripe account is connected to another workspace' });
  assert.equal(db.data.has('integrations/stripe_connect/orgs/other.example'), false);
  /* a second account for this workspace */
  route('POST', /^https:\/\/connect\.stripe\.com\/oauth\/token$/, ok({ stripe_user_id: 'acct_2NEW', livemode: true, scope: 'read_write' }));
  var s3 = await newState('stripe');
  await assert.rejects(LS.finishConnect(cbReq({ state: s3, code: 'ac_3' })), { status: 409, message: 'This workspace is connected to Stripe account acct_1CLEAN. Disconnect it on the accounting page first.' });
  /* a denial comes back to the page, and spends the state */
  var s4 = await newState('stripe');
  assert.equal((await LS.finishConnect(cbReq({ state: s4, error: 'access_denied', error_description: 'The user denied your request' }))).location, '/logic-accounting.html?org=cleancell.us&syncError=denied');
  assert.equal(db.data.get('integrations/ledger_oauth/states/' + s4).used, true);
  route('POST', /^https:\/\/connect\.stripe\.com\/oauth\/token$/, ok({ stripe_user_id: 'not-an-account' }));
  db.seed('integrations/stripe_connect/orgs/' + ORG, Object.assign(d, { disconnectedAt: '2026-09-21T00:00:00Z' }));
  var s5 = await newState('stripe');
  await assert.rejects(LS.finishConnect(cbReq({ state: s5, code: 'ac_5' })), { status: 502, message: 'Stripe returned no connected account' });
});

function stripeRoutes(o) {
  o = o || {};
  var made = [];
  route('POST', /\/v1\/customers$/, ok({ id: 'cus_A' }));
  route('POST', /\/v1\/invoices$/, function (c) { var id = 'in_' + (made.length + 1); made.push(id); return ok({ id: id, status: 'draft', total: 0, currency: 'usd', lines: { data: [] } }); });
  route('POST', /\/v1\/invoiceitems$/, function (c) { return ok({ id: 'ii_' + calls.length, amount: Number(form(c.body).get('amount')) }); });
  route('POST', /\/v1\/invoices\/(in_\w+)\/finalize$/, function (c) {
    var id = /invoices\/(in_\w+)\/finalize/.exec(c.url)[1];
    return ok({ id: id, status: 'open', number: 'CC-0001', total: o.total == null ? 9022500 : o.total, currency: 'usd', customer: 'cus_A',
      hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1CLEAN/test_' + id, metadata: { omega_invoice: o.number || 'SS-1042' } });
  });
  route('POST', /\/v1\/invoices\/(in_\w+)\/send$/, ok({}));
  return made;
}
function stripeView(o) {
  o = o || {};
  return view(Object.assign({ id: 'o2', orderNo: 'CC-26-4420', po: 'SS-PO-5521', number: 'SS-1042', amountCents: 9022500, dueAt: '2099-01-31',
    account: { id: null, key: 'email:buy@sierra.example', name: 'Sierra Storage' },
    ledgerSync: { provider: 'stripe', stripe: { paymentMethods: ['card', 'us_bank_account'], sendEmail: false } } }, o));
}

await check('Stripe push: customer, invoice, item and finalize on the connected account with idempotency keys; a half-made invoice resumes; the hosted page is the pay link', async function () {
  reset(); stSeed(ORG, 'acct_1CLEAN'); stripeRoutes();
  var r = await LS.providers.stripe.pushInvoice(ORG, stripeView(), 'deposit');
  assert.deepEqual(r, { provider: 'stripe', invoiceId: 'in_1', number: 'CC-0001', customerId: 'cus_A', company: 'acct_1CLEAN',
    hostedUrl: 'https://invoice.stripe.com/i/acct_1CLEAN/test_in_1', totalCents: 9022500, warning: null });
  var api = calls.filter(function (c) { return /api\.stripe\.com/.test(c.url); });
  assert.deepEqual(api.map(function (c) { return c.method + ' ' + c.url.replace('https://api.stripe.com', ''); }),
    ['GET x'].slice(1).concat(['POST /v1/customers', 'POST /v1/invoices', 'POST /v1/invoiceitems', 'POST /v1/invoices/in_1/finalize']));
  api.forEach(function (c) {
    assert.equal(c.headers['Stripe-Account'], 'acct_1CLEAN'); assert.equal(c.headers['Stripe-Version'], '2024-06-20');
    assert.equal(c.headers.Authorization, 'Bearer ' + FULL.STRIPE_SECRET_KEY); assert.match(c.headers['Idempotency-Key'], /^omega-/);
  });
  assert.equal(api[0].headers['Idempotency-Key'], 'omega-cus-' + P.key('cleancell.us:acct_1CLEAN:email:buy@sierra.example'));
  assert.equal(api[1].headers['Idempotency-Key'], 'omega-inv-' + P.key('cleancell.us:o2:deposit:SS-1042:0'));
  assert.equal(api[3].headers['Idempotency-Key'], 'omega-fin-' + P.key('cleancell.us:in_1'));
  var cu = form(api[0].body);
  assert.equal(cu.get('name'), 'Sierra Storage'); assert.equal(cu.get('email'), 'ap@amperage.example'); assert.equal(cu.get('metadata[omega_account]'), 'email:buy@sierra.example');
  var b = form(api[1].body);
  assert.equal(b.get('customer'), 'cus_A'); assert.equal(b.get('collection_method'), 'send_invoice'); assert.equal(b.get('auto_advance'), 'false');
  assert.equal(b.get('currency'), 'usd'); assert.equal(b.get('pending_invoice_items_behavior'), 'exclude');
  assert.equal(b.get('due_date'), String(Date.UTC(2099, 0, 31, 23, 59, 59) / 1000)); assert.equal(b.get('days_until_due'), null);
  assert.equal(b.get('description'), 'CC-26-4420 — deposit invoice SS-1042');
  assert.equal(b.get('custom_fields[0][name]'), 'Invoice'); assert.equal(b.get('custom_fields[0][value]'), 'SS-1042');
  assert.equal(b.get('custom_fields[1][name]'), 'PO'); assert.equal(b.get('custom_fields[1][value]'), 'SS-PO-5521');
  assert.equal(b.get('payment_settings[payment_method_types][0]'), 'card'); assert.equal(b.get('payment_settings[payment_method_types][1]'), 'us_bank_account');
  assert.equal(b.get('metadata[omega_org]'), ORG); assert.equal(b.get('metadata[omega_order]'), 'o2'); assert.equal(b.get('metadata[omega_stage]'), 'deposit'); assert.equal(b.get('metadata[omega_invoice]'), 'SS-1042');
  assert.match(api[1].body, /custom_fields\[0\]\[name\]=Invoice/, 'nested keys are sent readable');
  var it = form(api[2].body);
  assert.equal(it.get('invoice'), 'in_1'); assert.equal(it.get('amount'), '9022500'); assert.equal(it.get('currency'), 'usd'); assert.equal(it.get('customer'), 'cus_A');
  var ix = db.data.get('integrations/stripe_connect/orgs/' + ORG + '/invoices/in_1');
  assert.deepEqual([ix.orderId, ix.stage, ix.number, ix.accountId], ['o2', 'deposit', 'SS-1042', 'acct_1CLEAN']);
  assert.equal(db.data.get('integrations/stripe_connect/orgs/' + ORG + '/customers/' + P.key('email:buy@sierra.example')).stripeCustomerId, 'cus_A');
  /* a due date already past (or none) is due in one day; the customer mapping is reused; send when asked */
  calls = [];
  await LS.providers.stripe.pushInvoice(ORG, stripeView({ id: 'o9', dueAt: '2020-01-01', po: null,
    ledgerSync: { provider: 'stripe', stripe: { paymentMethods: ['us_bank_account'], sendEmail: true } } }), 'deposit');
  var paths = calls.map(function (c) { return c.method + ' ' + c.url.replace('https://api.stripe.com', ''); });
  assert.equal(paths.indexOf('POST /v1/customers'), -1);
  assert(paths.indexOf('POST /v1/invoices/in_2/send') > 0);
  b = form(calls.filter(function (c) { return /\/v1\/invoices$/.test(c.url); })[0].body);
  assert.equal(b.get('days_until_due'), '1'); assert.equal(b.get('due_date'), null); assert.equal(b.get('custom_fields[1][name]'), null);
  assert.equal(b.get('payment_settings[payment_method_types][0]'), 'us_bank_account'); assert.equal(b.get('payment_settings[payment_method_types][1]'), null);
  /* a half-made invoice (created, the item never added) resumes: no second invoice */
  reset(); stSeed(ORG, 'acct_1CLEAN'); stripeRoutes();
  db.seed('integrations/stripe_connect/orgs/' + ORG + '/invoices/in_7', { orderId: 'o2', stage: 'deposit', number: 'SS-1042', accountId: 'acct_1CLEAN', createdAt: '2026-09-24T10:00:00Z' });
  db.seed('integrations/stripe_connect/orgs/' + ORG + '/customers/' + P.key('email:buy@sierra.example'), { accountId: 'acct_1CLEAN', stripeCustomerId: 'cus_A' });
  var draft = { id: 'in_7', status: 'draft', total: 0, currency: 'usd', lines: { data: [] } };
  route('GET', /\/v1\/invoices\/in_7$/, function () { return ok(draft); });
  r = await LS.providers.stripe.pushInvoice(ORG, stripeView(), 'deposit');
  assert.equal(r.invoiceId, 'in_7');
  paths = calls.map(function (c) { return c.method + ' ' + c.url.replace('https://api.stripe.com', ''); });
  assert.deepEqual(paths, ['GET /v1/invoices/in_7', 'POST /v1/invoiceitems', 'POST /v1/invoices/in_7/finalize']);
  /* the item already on it: finalize only */
  calls = []; draft.total = 9022500; draft.lines = { data: [{ amount: 9022500, metadata: { omega_part: '0' } }] };
  await LS.providers.stripe.pushInvoice(ORG, stripeView(), 'deposit');
  assert.deepEqual(calls.map(function (c) { return c.method + ' ' + c.url.replace('https://api.stripe.com', ''); }), ['GET /v1/invoices/in_7', 'POST /v1/invoices/in_7/finalize']);
  /* already open: returned as it is */
  calls = []; draft.status = 'open'; draft.number = 'CC-0007'; draft.hosted_invoice_url = 'https://invoice.stripe.com/i/x'; draft.customer = 'cus_A';
  r = await LS.providers.stripe.pushInvoice(ORG, stripeView(), 'deposit');
  assert.deepEqual(calls.map(function (c) { return c.method; }), ['GET']); assert.equal(r.number, 'CC-0007'); assert.equal(r.hostedUrl, 'https://invoice.stripe.com/i/x');
  /* voided in Stripe: a NEW invoice, not a replay of the voided one's idempotency key */
  calls = []; draft.status = 'void';
  r = await LS.providers.stripe.pushInvoice(ORG, stripeView(), 'deposit');
  assert.equal(r.invoiceId, 'in_1');
  assert.equal(calls.filter(function (c) { return /\/v1\/invoices$/.test(c.url); })[0].headers['Idempotency-Key'], 'omega-inv-' + P.key('cleancell.us:o2:deposit:SS-1042:1'));
  /* above Stripe's eight-digit line limit: parts, and a warning a person reads */
  reset(); stSeed(ORG, 'acct_1CLEAN'); stripeRoutes({ total: 134909910, number: 'CCUS-3V3I-0926-01 Rev B' });
  r = await LS.providers.stripe.pushInvoice(ORG, stripeView({ id: 'amp', number: 'CCUS-3V3I-0926-01 Rev B', amountCents: 134909910 }), 'deposit');
  var items = calls.filter(function (c) { return /invoiceitems/.test(c.url); }).map(function (c) { return Number(form(c.body).get('amount')); });
  assert.deepEqual(items, [99999999, 34909911]);
  assert.match(r.warning, /999,999\.99/);
  /* a push needs a connected account and an issued number */
  reset();
  await assert.rejects(LS.providers.stripe.pushInvoice(ORG, stripeView(), 'deposit'), { status: 409, message: 'Connect Stripe for this workspace first' });
  stSeed(ORG, 'acct_1CLEAN');
  var unissued = stripeView(); unissued.invoice.number = null;
  await assert.rejects(LS.providers.stripe.pushInvoice(ORG, unissued, 'deposit'), { status: 409, message: 'Record the deposit invoice as issued first' });
  /* Stripe's refusal is a 502 naming Stripe's message */
  route('POST', /\/v1\/customers$/, { status: 400, body: { error: { message: 'Invalid email address: nope', code: 'email_invalid' } } });
  await assert.rejects(LS.providers.stripe.pushInvoice(ORG, stripeView(), 'deposit'), { status: 502, message: 'Stripe request failed (400): Invalid email address: nope' });
});

await check('Stripe pull: paid is a stripe: reference; refund or lost dispute is a reversal; an open dispute is a warning', async function () {
  reset(); stSeed(ORG, 'acct_1CLEAN');
  var ledger = { provider: 'stripe', state: 'pushed', invoiceId: 'in_1', company: 'acct_1CLEAN', totalCents: 9022500 };
  var charge = { id: 'ch_1', amount: 9022500, amount_refunded: 0, refunded: false, disputed: false };
  var inv = { id: 'in_1', status: 'paid', currency: 'usd', total: 9022500, amount_paid: 9022500, charge: charge, payment_intent: 'pi_1',
    status_transitions: { paid_at: Date.UTC(2026, 9, 2, 15) / 1000 } };
  var disputes = [];
  route('GET', /\/v1\/invoices\/in_1\?/, function () { return ok(inv); });
  route('GET', /\/v1\/disputes\?/, function () { return ok({ data: disputes }); });
  var pull = function (payments) { return LS.providers.stripe.pullPayments(ORG, stripeView({ ledger: ledger, payments: payments || [] }), 'deposit'); };
  var items = await pull();
  assert.deepEqual(items, [{ ref: 'stripe:ch_1', amountCents: 9022500, date: '2026-10-02', reversed: false, external: { invoiceId: 'in_1', chargeId: 'ch_1' } }]);
  assert.match(calls[0].url, /\/v1\/invoices\/in_1\?expand\[0\]=charge$/); assert.equal(calls[0].headers['Stripe-Account'], 'acct_1CLEAN');
  /* refunded in full */
  charge.amount_refunded = 9022500; charge.refunded = true;
  assert.equal((await pull())[0].reversed, true);
  /* partially refunded: recorded as paid, with a warning a person reads */
  charge.amount_refunded = 10000; charge.refunded = false;
  items = await pull();
  assert.equal(items[0].reversed, false); assert.equal(items[0].warning, 'Partially refunded in Stripe (USD 100.00); review by hand');
  /* disputes: open is a warning, lost is a reversal */
  charge.amount_refunded = 0; charge.disputed = true; disputes = [{ status: 'won', created: 1 }, { status: 'needs_response', created: 5 }];
  items = await pull();
  assert.equal(items[0].reversed, false); assert.equal(items[0].warning, 'Disputed in Stripe; funds withheld until it is decided');
  assert.match(calls.filter(function (c) { return /disputes/.test(c.url); }).pop().url, /charge=ch_1/);
  disputes = [{ status: 'lost', created: 9 }];
  assert.equal((await pull())[0].reversed, true);
  charge.disputed = false;
  /* recorded first by its payment intent: the reference is kept once the charge appears */
  items = await pull([{ amountCents: 9022500, date: '2026-10-02', bankReference: 'stripe:pi_1', source: 'stripe', external: { invoiceId: 'in_1', chargeId: null } }]);
  assert.deepEqual(items.map(function (i) { return [i.ref, i.reversed]; }), [['stripe:pi_1', false]]);
  /* marked paid out of band in Stripe */
  inv.paid_out_of_band = true; inv.charge = null;
  items = await pull();
  assert.deepEqual(items[0].external, { invoiceId: 'in_1', chargeId: null }); assert.equal(items[0].ref, 'stripe:in_1');
  /* not paid: nothing, except a stripe payment we recorded that Stripe no longer shows */
  inv.status = 'open'; inv.paid_out_of_band = false; inv.charge = charge;
  items = await pull([{ amountCents: 9022500, date: '2026-10-02', bankReference: 'stripe:ch_old', source: 'stripe', external: { invoiceId: 'in_1', chargeId: 'ch_old' } },
    { amountCents: 100, date: '2026-10-02', bankReference: 'ACH 9' }]);
  assert.deepEqual(items, [{ ref: 'stripe:ch_old', amountCents: 9022500, date: '2026-10-02', reversed: true, external: { invoiceId: 'in_1', chargeId: 'ch_old' } }]);
  /* changed under us, or in another account */
  inv.total = 9000000;
  await assert.rejects(pull(), { status: 409, message: 'Stripe invoice changed; reconcile by hand' });
  inv.total = 9022500;
  await assert.rejects(LS.providers.stripe.pullPayments(ORG, stripeView({ ledger: Object.assign({}, ledger, { company: 'acct_OTHER' }) }), 'deposit'),
    { status: 409, message: 'This invoice was pushed to Stripe account acct_OTHER; the workspace is now connected to acct_1CLEAN' });
  await assert.rejects(LS.providers.stripe.pullPayments(ORG, stripeView({ ledger: null }), 'deposit'), { status: 409, message: 'This invoice is not in Stripe' });
  /* link: only a finalized USD invoice of the same amount */
  route('GET', /\/v1\/invoices\/in_9$/, ok({ id: 'in_9', status: 'open', currency: 'usd', total: 9022500, number: 'CC-0009', customer: 'cus_Z', hosted_invoice_url: 'https://invoice.stripe.com/i/9' }));
  var r = await LS.providers.stripe.linkInvoice(ORG, stripeView(), 'deposit', 'in_9');
  assert.deepEqual(r, { provider: 'stripe', invoiceId: 'in_9', number: 'CC-0009', customerId: 'cus_Z', company: 'acct_1CLEAN', hostedUrl: 'https://invoice.stripe.com/i/9', totalCents: 9022500, warning: null });
  assert.equal(db.data.get('integrations/stripe_connect/orgs/' + ORG + '/invoices/in_9').orderId, 'o2');
  await assert.rejects(LS.providers.stripe.linkInvoice(ORG, stripeView({ id: 'o5' }), 'deposit', 'in_9'), { status: 409, message: 'Stripe invoice in_9 is already linked to another order' });
  route('GET', /\/v1\/invoices\/in_8$/, ok({ id: 'in_8', status: 'draft', currency: 'usd', total: 9022500 }));
  await assert.rejects(LS.providers.stripe.linkInvoice(ORG, stripeView(), 'deposit', 'in_8'), { status: 409, message: 'Stripe invoice in_8 does not match this invoice' });
  await assert.rejects(LS.providers.stripe.linkInvoice(ORG, stripeView(), 'deposit', '145'), { status: 400 });
});

function sign(raw, t, secret) { return 't=' + t + ',v1=' + crypto.createHmac('sha256', secret || FULL.STRIPE_CONNECT_WEBHOOK_SECRET).update(t + '.' + raw).digest('hex'); }
function hookReq(raw, headers, method) { var r = Readable.from([Buffer.from(raw)]); r.method = method || 'POST'; r.headers = headers || {}; return r; }
function event(id, type, object, acct) { return JSON.stringify({ id: id, type: type, account: acct === undefined ? 'acct_1CLEAN' : acct, data: { object: object } }); }
async function deliver(raw, t) { return hook(hookReq(raw, { 'stripe-signature': sign(raw, t || Math.floor(Date.now() / 1000)) }), fakeRes()); }

await check('ledger-webhook: signature and tolerance, dedupe, unknown account, deauthorization; an event only triggers a re-read', async function () {
  assert.deepEqual(hook.config, { api: { bodyParser: false } });
  reset(Object.assign({}, FULL, { STRIPE_CONNECT_WEBHOOK_SECRET: null }));
  await assert.rejects(hook(hookReq('{}'), fakeRes()), { status: 503, message: 'Stripe Connect webhook is not configured' });
  reset(); stSeed(ORG, 'acct_1CLEAN');
  db.seed('orders/o2', { orgId: ORG, orderNo: 'CC-26-4420', logic: { accounting: 'tenant' } });
  db.seed('orders/x9', { orgId: 'other.example', orderNo: 'X-9' });
  db.seed('integrations/stripe_connect/orgs/' + ORG + '/invoices/in_1', { orderId: 'o2', stage: 'deposit', number: 'SS-1042', accountId: 'acct_1CLEAN' });
  db.seed('integrations/stripe_connect/orgs/' + ORG + '/invoices/in_x', { orderId: 'x9', stage: 'deposit', number: 'X', accountId: 'acct_1CLEAN' });
  var orderBefore = JSON.stringify(db.data.get('orders/o2'));
  await assert.rejects(hook(hookReq('{}', {}, 'GET'), fakeRes()), { status: 405 });
  var raw = event('evt_1', 'invoice.paid', { id: 'in_1', object: 'invoice' }), now = Math.floor(Date.now() / 1000);
  await assert.rejects(hook(hookReq(raw, { 'stripe-signature': sign(raw, now, 'whsec_wrong') }), fakeRes()), { status: 400, message: 'Invalid Stripe signature' });
  await assert.rejects(hook(hookReq(raw, { 'stripe-signature': 'garbage' }), fakeRes()), { status: 400, message: 'Invalid Stripe signature' });
  await assert.rejects(hook(hookReq(raw + ' ', { 'stripe-signature': sign(raw, now) }), fakeRes()), { status: 400, message: 'Invalid Stripe signature' }, 'the signature covers the raw bytes');
  await assert.rejects(deliver(raw, now - 301), { status: 400, message: 'Stale Stripe signature' });
  await assert.rejects(hook(hookReq('x'.repeat(1048577), {}), fakeRes()), { status: 413, message: 'Payload too large' });
  await assert.rejects(deliver('{not json'), { status: 400, message: 'Invalid JSON' });
  assert.equal(synced.length, 0);
  /* one of several v1 signatures is enough (Stripe rolls secrets that way) */
  var sig = sign(raw, now).replace('v1=', 'v1=' + 'ab'.repeat(32) + ',v1=');
  var out = await hook(hookReq(raw, { 'stripe-signature': sig }), fakeRes());
  assert.deepEqual(out, { ok: true, orderId: 'o2', stage: 'deposit' });
  assert.deepEqual(synced, [{ orderId: 'o2', caller: { email: 'stripe-webhook' }, opts: { source: 'stripe-webhook' } }]);
  var ev = db.data.get('integrations/stripe_connect/events/evt_1');
  assert.deepEqual([ev.status, ev.attempts, ev.orderId, ev.account, ev.type], ['done', 1, 'o2', 'acct_1CLEAN', 'invoice.paid']);
  /* the same event again: nothing */
  assert.deepEqual(await deliver(raw), { ok: true, duplicate: true });
  assert.equal(synced.length, 1);
  /* a failure is a 500 so Stripe retries, and the retry is processed */
  var raw2 = event('evt_2', 'invoice.payment_succeeded', { id: 'in_1' });
  syncFails = 1;
  await assert.rejects(deliver(raw2), { status: 500 });
  ev = db.data.get('integrations/stripe_connect/events/evt_2');
  assert.equal(ev.status, 'failed'); assert.match(ev.error, /Stripe request failed/);
  assert.deepEqual(await deliver(raw2), { ok: true, orderId: 'o2', stage: 'deposit' });
  ev = db.data.get('integrations/stripe_connect/events/evt_2');
  assert.equal(ev.status, 'done'); assert.equal(ev.attempts, 2); assert.equal(ev.error, null);
  /* a dispute names its charge; the charge is read on the connected account for its invoice */
  route('GET', /\/v1\/charges\/ch_9$/, ok({ id: 'ch_9', invoice: 'in_1' }));
  assert.deepEqual(await deliver(event('evt_3', 'charge.dispute.created', { id: 'dp_1', object: 'dispute', charge: 'ch_9' })), { ok: true, orderId: 'o2', stage: 'deposit' });
  assert.equal(calls.filter(function (c) { return /\/v1\/charges\/ch_9/.test(c.url); })[0].headers['Stripe-Account'], 'acct_1CLEAN');
  assert.deepEqual(await deliver(event('evt_4', 'charge.refunded', { id: 'ch_2', object: 'charge', invoice: 'in_1' })), { ok: true, orderId: 'o2', stage: 'deposit' });
  assert.equal(synced.length, 5);
  /* not ours: an invoice Omega Logic did not make, an order of another workspace, another event type, an unknown account */
  assert.deepEqual(await deliver(event('evt_5', 'invoice.paid', { id: 'in_unknown' })), { ok: true, ignored: true });
  assert.equal(db.data.get('integrations/stripe_connect/events/evt_5').status, 'ignored');
  assert.deepEqual(await deliver(event('evt_6', 'invoice.paid', { id: 'in_x' })), { ok: true, ignored: true });
  assert.deepEqual(await deliver(event('evt_7', 'customer.created', { id: 'cus_1' })), { ok: true, ignored: true });
  assert.deepEqual(await deliver(event('evt_8', 'invoice.paid', { id: 'in_1' }, 'acct_STRANGER')), { ok: true, ignored: true });
  assert.deepEqual(await deliver(event('evt_9', 'invoice.paid', { id: 'in_1' }, null)), { ok: true, ignored: true });
  assert.equal(db.data.has('integrations/stripe_connect/events/evt_8'), false);
  assert.equal(synced.length, 5);
  /* the account disconnects Omega Logic in Stripe */
  assert.deepEqual(await deliver(event('evt_10', 'account.application.deauthorized', { id: 'ca_ClientId123', object: 'application' })), { ok: true, disconnected: true });
  assert.equal(db.data.get('integrations/stripe_connect/orgs/' + ORG).disconnectedBy, 'stripe');
  assert.equal(db.data.get('integrations/stripe_connect/accounts/acct_1CLEAN').disconnectedBy, 'stripe');
  var st = (await LS.status(ORG)).stripe;
  assert.equal(st.connected, false); assert.match(st.lastError, /disconnected Omega Logic/);
  /* after that, the account's events are ignored */
  assert.deepEqual(await deliver(event('evt_11', 'invoice.paid', { id: 'in_1' })), { ok: true, ignored: true });
  assert.equal(synced.length, 5);
  assert.equal(JSON.stringify(db.data.get('orders/o2')), orderBefore, 'the webhook never writes an order');
});

await check('disconnect revokes best-effort and keeps the record', async function () {
  reset(); qbSeed(ORG, '9130'); stSeed(ORG, 'acct_1CLEAN');
  route('POST', /developer\.api\.intuit\.com\/v2\/oauth2\/tokens\/revoke/, ok({}));
  route('POST', /connect\.stripe\.com\/oauth\/deauthorize/, ok({ stripe_user_id: 'acct_1CLEAN' }));
  var before = db.data.size;
  assert.deepEqual(await LS.providers.quickbooks.disconnect(ORG, admin), { ok: true });
  var rv = calls.filter(function (c) { return /revoke/.test(c.url); })[0];
  assert.deepEqual(JSON.parse(rv.body), { token: 'RT-SECRET-token' }); assert.match(rv.headers.Authorization, /^Basic /);
  var ws = db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG);
  assert.equal(ws.accessToken, null); assert.equal(ws.refreshToken, null); assert.equal(ws.expiresAt, 0);
  assert.equal(ws.realmId, '9130', 'the company stays on record'); assert.equal(ws.disconnectedBy, 'office@cleancell.us'); assert.match(ws.disconnectedAt, /^\d{4}-/);
  assert.deepEqual(await LS.providers.stripe.disconnect(ORG, admin), { ok: true });
  var dz = form(calls.filter(function (c) { return /deauthorize/.test(c.url); })[0].body);
  assert.equal(dz.get('client_id'), 'ca_ClientId123'); assert.equal(dz.get('stripe_user_id'), 'acct_1CLEAN');
  var sd = db.data.get('integrations/stripe_connect/orgs/' + ORG), si = db.data.get('integrations/stripe_connect/accounts/acct_1CLEAN');
  assert.equal(sd.accountId, 'acct_1CLEAN'); assert.equal(sd.disconnectedBy, 'office@cleancell.us'); assert.equal(si.disconnectedBy, 'office@cleancell.us'); assert(si.disconnectedAt);
  assert.equal(db.data.size, before, 'nothing deleted');
  assert.equal(await LS.providers.quickbooks.ready(ORG), false); assert.equal(await LS.providers.stripe.ready(ORG), false);
  var s = await LS.status(ORG);
  assert.equal(s.quickbooks.connected, false); assert.equal(s.stripe.connected, false); assert.equal(s.stripe.accountId, null);
  /* idempotent: a second disconnect calls nobody */
  calls = [];
  await LS.providers.quickbooks.disconnect(ORG, admin); await LS.providers.stripe.disconnect(ORG, admin);
  assert.equal(calls.length, 0);
  /* the provider refusing (or unreachable) never blocks our side */
  reset(); qbSeed(ORG, '9130'); stSeed(ORG, 'acct_1CLEAN');
  route('POST', /revoke/, new Error('network down'));
  route('POST', /deauthorize/, { status: 401, body: { error: 'invalid_client' } });
  await LS.providers.quickbooks.disconnect(ORG, admin); await LS.providers.stripe.disconnect(ORG, admin);
  assert.equal(db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG).refreshToken, null);
  assert(db.data.get('integrations/stripe_connect/orgs/' + ORG).disconnectedAt);
  /* with the env vars gone, disconnect still records it (and calls nobody) */
  reset({}); qbSeed(ORG, '9130'); stSeed(ORG, 'acct_1CLEAN');
  await LS.providers.quickbooks.disconnect(ORG, admin); await LS.providers.stripe.disconnect(ORG, admin);
  assert.equal(calls.length, 0);
  assert(db.data.get('integrations/quickbooks_workspaces/orgs/' + ORG).disconnectedAt); assert(db.data.get('integrations/stripe_connect/orgs/' + ORG).disconnectedAt);
  /* nothing to disconnect */
  reset();
  assert.deepEqual(await LS.providers.quickbooks.disconnect(ORG, admin), { ok: true });
  assert.deepEqual(await LS.providers.stripe.disconnect(ORG, admin), { ok: true });
  assert.equal(db.data.size, 0);
});

await check('ledger-connect callback redirects to the accounting page; a provider denial comes back as syncError', async function () {
  reset();
  var out = await LS.providers.quickbooks.connectUrl(ORG, admin), state = new URL(out.url).searchParams.get('state');
  qbTokenRoute(); route('GET', /companyinfo/, ok({ CompanyInfo: { CompanyName: 'Clean Cell USA LLC' } }));
  var res = fakeRes();
  await connectApi(cbReq({ state: state, code: 'c1', realmId: '9130' }), res);
  assert.equal(res.code, 303); assert.equal(res.ended, true);
  assert.equal(res.headers.location, '/logic-accounting.html?org=cleancell.us&connected=quickbooks');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['set-cookie'], 'omega_ledger_state=; Path=/api/ledger-connect; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  /* the provider and org come from the state document, not the query */
  out = await LS.providers.stripe.connectUrl(ORG, admin); state = new URL(out.url).searchParams.get('state');
  res = fakeRes();
  await connectApi(cbReq({ state: state, error: 'access_denied', org: 'evil.example', provider: 'quickbooks' }), res);
  assert.equal(res.code, 303); assert.equal(res.headers.location, '/logic-accounting.html?org=cleancell.us&syncError=denied');
  var s2 = await newState('stripe');
  res = fakeRes();
  await connectApi(cbReq({ state: s2, error: 'invalid_scope<script>' }), res);
  assert.equal(res.headers.location, '/logic-accounting.html?org=cleancell.us&syncError=invalid_scopescript');
  var s3 = await newState('stripe');
  route('POST', /^https:\/\/connect\.stripe\.com\/oauth\/token$/, ok({ stripe_user_id: 'acct_1CLEAN', livemode: false, scope: 'read_write' }));
  res = fakeRes();
  await connectApi(cbReq({ state: s3, code: 'ac_1' }), res);
  assert.equal(res.headers.location, '/logic-accounting.html?org=cleancell.us&connected=stripe');
  await assert.rejects(connectApi({ method: 'GET', query: {}, headers: {} }, fakeRes()), { status: 400, message: 'Start from the accounting page' });
  await assert.rejects(connectApi({ method: 'POST', query: { state: s3 }, headers: {} }, fakeRes()), { status: 400, message: 'Start from the accounting page' });
  await assert.rejects(connectApi({ method: 'GET', query: { state: s3 }, headers: {} }, fakeRes()), { status: 403, message: 'OAuth state mismatch; start from the accounting page' });
});

}

main().catch(function (e) { failed++; console.error(e); }).then(function () {
  ENV_KEYS.forEach(function (k) { if (savedEnv[k] == null) delete process.env[k]; else process.env[k] = savedEnv[k]; });
  console.log(count + ' ledger-sync tests passed' + (failed ? ', ' + failed + ' FAILED' : ''));
  if (failed) process.exitCode = 1;
});
