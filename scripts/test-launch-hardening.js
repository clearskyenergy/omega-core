/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Launch hardening, 2026-09-26: the review before Monday's first sale found
   the places where a paying customer, or ClearSky's own bookkeeping, would
   have hit a wall. Each check here pins one of them:
     · the address a person is sent to (api/_lib/kit.js home): the open host
       until the wildcard serves, an attached hostname always
     · the QuickBooks driver refuses to invoice while custom transaction
       numbers are off (a renumbered invoice can never be found again),
       refuses a renumbered one, emails the new invoice once and names a
       missing pay link instead of handing back null
     · the guard's refusals are marked ClearSky's, so reconcile retries
       instead of putting the tenant under review
     · a legacy tenant (no signedUpAt) can be activated from the Package tab
   No network. */
'use strict';
var assert = require('node:assert/strict');
var F = require('./_lib/firestore-double'), DB = F.DB, H = require('./_lib/packaging-billing-fixture');
var K = require('../api/_lib/kit'), B = require('../api/_lib/pricebook'), Q = require('../api/_lib/qbo-billing');
process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox'; process.env.PACKAGING_LIVE = '';
var count = 0; async function test(n, f) { await f(); count++; console.log('PASS ' + n); }

(async function () {
  await test('kit.home: the open host until the wildcard serves; an attached hostname always; nothing to go on is the open host', async function () {
    assert.equal(K.home({ domains: ['newco.clearskyomega.com'] }), 'silmarillion.clearskyomega.com');
    assert.equal(K.home({ domains: ['newco.clearskyomega.com'] }, { wildcard: false }), 'silmarillion.clearskyomega.com');
    assert.equal(K.home({ domains: ['newco.clearskyomega.com'] }, { wildcard: true }), 'newco.clearskyomega.com');
    assert.equal(K.home({ domains: ['portal.cleancell.example'] }, { wildcard: true }), 'silmarillion.clearskyomega.com', 'a customer domain is theirs only once attached');
    assert.equal(K.home({ domains: ['portal.cleancell.example'], hostAttached: true }), 'portal.cleancell.example');
    assert.equal(K.home(null), 'silmarillion.clearskyomega.com'); assert.equal(K.home({}), 'silmarillion.clearskyomega.com');
  });

  await test('the QuickBooks driver: numbers off is refused before anything is made; a renumbered invoice is refused; the new invoice is emailed once; a missing pay link is named', async function () {
    var book = B.proposed(); book.qbo.realmId = '123'; book.qbo.items = { 'module:lite': '11' };
    var state = { ctn: true, renumber: false, found: false, link: 'https://connect.intuit.com/pay/9' }, calls = [];
    function inv(number) { return { Id: '9', DocNumber: number, CustomerRef: { value: 'C1' }, CurrencyRef: { value: 'USD' }, PrivateNote: plan.marker, TotalAmt: 500, Balance: 500, InvoiceLink: state.link,
      Line: [{ DetailType: 'SalesItemLineDetail', Amount: 500, SalesItemLineDetail: { ItemRef: { value: '11' } } }] }; }
    var plan = { kind: 'subscription', marker: 'OMEGA subscription t.example / 2026-10-01', date: '2026-10-01', period: { start: '2026-10-01', end: '2026-11-01' }, lines: [{ itemKey: 'module:lite', name: 'Lite', amountCents: 50000 }] };
    var number = 'OP-' + Q.key(plan.marker).slice(0, 16);
    var deps = { Q: { ENV: 'sandbox', IS_SANDBOX: true, API_BASE: 'https://sandbox-quickbooks.api.intuit.com', load: async function () { return { env: 'sandbox', realmId: '123' }; } },
      request: async function (path, body) {
        calls.push(path.split('?')[0] + (body ? ' POST' : ''));
        if (path === 'preferences') return { Preferences: { SalesFormsPrefs: { CustomTxnNumbers: state.ctn } } };
        if (path.indexOf('query?query=') === 0) return { QueryResponse: state.found ? { Invoice: [inv(number)] } : {} };
        if (path === 'item/11') return { Item: { Id: '11', Active: true, Taxable: false } };
        if (path === 'invoice' && body) return { Invoice: inv(state.renumber ? '1042' : body.DocNumber) };
        if (path.indexOf('invoice/9/send') === 0) return {};
        if (path.indexOf('invoice/9') === 0) return { Invoice: inv(number) };
        throw new Error('unexpected ' + path);
      } };
    var profile = { email: 'ap@t.example' };
    state.ctn = false; await assert.rejects(Q.driver(book, deps).invoice(plan, profile, 'C1'), /custom transaction numbers/); assert.ok(calls.indexOf('invoice POST') < 0, 'nothing was created'); calls = [];
    state.ctn = true; state.renumber = true; await assert.rejects(Q.driver(book, deps).invoice(plan, profile, 'C1'), /renumbered/); calls = []; state.renumber = false;
    var made = await Q.driver(book, deps).invoice(plan, profile, 'C1');
    assert.equal(made.id, '9'); assert.equal(made.payUrl, 'https://connect.intuit.com/pay/9'); assert.equal(made.payLinkMissing, false);
    assert.equal(calls.filter(function (c) { return c === 'invoice/9/send POST'; }).length, 1, 'emailed once, by QuickBooks'); calls = [];
    state.found = true; var again = await Q.driver(book, deps).invoice(plan, profile, 'C1');
    assert.equal(again.id, '9'); assert.ok(calls.indexOf('invoice/9/send POST') < 0, 'an invoice found again is not emailed again'); assert.ok(calls.indexOf('invoice POST') < 0);
    state.link = null; var bare = await Q.driver(book, deps).invoice(plan, profile, 'C1'); assert.equal(bare.payUrl, null); assert.equal(bare.payLinkMissing, true, 'a missing pay page is named, never a silent null');
    /* the guard's refusal is ClearSky's, not the invoice's */
    var wrong = Object.assign({}, deps, { Q: Object.assign({}, deps.Q, { load: async function () { return { env: 'sandbox', realmId: '777' }; } }) });
    try { await Q.driver(book, wrong).reconcile({ qboInvoiceId: '9', qboCustomerId: 'C1', marker: plan.marker, totalCents: 50000, lines: plan.lines }); assert.fail('expected the guard'); }
    catch (e) { assert.match(e.message, /not the requested sandbox/); assert.equal(e.clearsky, true, 'marked ours, so reconcile retries instead of reviewing the tenant'); }
  });

  await test('a legacy tenant with no signedUpAt can be activated from the Package tab: its own dates anchor the billing day, else today', async function () {
    var S = require('../api/_lib/package-billing'), db = new DB(), book = H.enabledBook(); db.seed('pricebook/' + book.version, book);
    db.seed('omega_orgs/legacy.example', { status: 'active', packagingSandbox: true, domains: ['legacy.example'], createdAt: '2026-03-15T10:00:00Z' });
    db.seed('omega_orgs/legacy.example/billing/current', { tier: 'enterprise', addons: ['omega-logic'] });
    db.seed('omega_orgs/legacy.example/billing/profile', H.profile('legacy.example'));
    var now = Date.parse('2026-09-28T15:00:00Z');
    var p = await S.preview(db, 'legacy.example', { action: 'activate', modules: ['lite', 'gridatlas'], interval: 'monthly' }, now);
    assert.equal(p.billingPatch.billingDay, 15, 'createdAt anchors the billing day'); assert.equal(p.billingPatch.packagingState, 'awaiting_payment');
    db.seed('omega_orgs/bare.example', { status: 'active', packagingSandbox: true, domains: ['bare.example'] });
    db.seed('omega_orgs/bare.example/billing/current', { tier: 'standard' }); db.seed('omega_orgs/bare.example/billing/profile', H.profile('bare.example'));
    var q = await S.preview(db, 'bare.example', { action: 'activate', modules: ['lite'], interval: 'monthly' }, now);
    assert.equal(q.billingPatch.billingDay, 28, 'no date on the record: today');
    db.seed('omega_orgs/future.example', { status: 'active', packagingSandbox: true, domains: ['future.example'], signedUpAt: now + 86400000 });
    db.seed('omega_orgs/future.example/billing/current', {}); db.seed('omega_orgs/future.example/billing/profile', H.profile('future.example'));
    await assert.rejects(S.preview(db, 'future.example', { action: 'activate', modules: ['lite'], interval: 'monthly' }, now), /signup date/);
  });

  console.log('\n' + count + ' launch hardening checks passed. No network calls.\n');
})().catch(function (e) { console.error(e); process.exit(1); });
