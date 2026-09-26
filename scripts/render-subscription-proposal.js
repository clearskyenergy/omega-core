#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 6: the Subscription Proposal pages against the real endpoints and an
 * in-memory Firestore. Mail and QuickBooks are stand-ins; the screenshots
 * prove the screens, not hosted acceptance.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('./_lib/firestore-double'), H = require('./_lib/packaging-billing-fixture'), M = require('../api/_lib/modules');
var db, caller, mails = [], sandboxInvoices = 0, checks = 0, shots = 0;
var root = path.join(__dirname, '..'), out = path.join(root, 'docs/screenshots/packaging-phase-6');
H.mockAdmin(function () { return db; }, function () { return caller; }); H.mockQbo(function () { sandboxInvoices++; });
F.mock('../api/_lib/mail', { templates: { proposalSent: async function (o) { mails.push(o); return { ok: true }; }, signupReceived: async function () {}, signupAlert: async function () {} } });
var routes = { '/api/subscription-proposal': require('../api/subscription-proposal'), '/api/tenant-signup': require('../api/tenant-signup') };
var STAFF = { uid: 'rep', staff: true, email: 'rep@clearsky-usa.com', orgId: 'clearsky-usa.com', role: 'owner', claims: { email_verified: true, name: 'Riley Rep' } };
var DANA = { uid: 'p1', staff: false, email: 'dana@greenwolf.example', orgId: 'greenwolf.example', role: 'owner', claims: { email_verified: true, name: 'Dana Wolf' } };
var KIM = { uid: 'k1', staff: false, email: 'kim@lattice.example', orgId: 'lattice.example', role: 'owner', claims: { email_verified: true, name: 'Kim Lattice' } };
var STATIC = ['/subscription-proposal.html', '/proposal.html', '/start.html', '/subscription-proposal-logic.js', '/omega-package-menu.js', '/omega-billing-profile.js', '/admin/package-panel.css'];
function seed() { db = new F.DB(); db.serial = true; var book = H.enabledBook(); db.seed('pricebook/' + book.version, book); }
function check(condition, label) { assert(condition, label); checks++; }
async function capture(page, name) { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); shots++; }
var server = http.createServer(async function (req, res) {
  try {
    var url = new URL(req.url, 'http://localhost');
    if (routes[url.pathname]) {
      var chunks = []; for await (var chunk of req) chunks.push(chunk); var body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      var result = await routes[url.pathname]({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body: body }, res);
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
    }
    if (url.pathname === '/config.js') return res.end('window.CLEARSKY_CONFIG={firebase:{}};');
    if (['/omega-brand.js', '/omega-tenant.js', '/omega-whitelabel.js'].includes(url.pathname)) return res.end('');
    if (!STATIC.includes(url.pathname)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(path.join(root, url.pathname)));
  } catch (e) { res.statusCode = e.status || 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: e.message })); }
});
/* The browser's Firebase is a stand-in that reports one signed-in person. */
async function init(context, base, who) {
  await context.route('**/*', function (r) { return r.request().url().startsWith(base) ? r.continue() : r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
  await context.addInitScript(function (who) {
    var user = { uid: who.uid, email: who.email, displayName: who.name, getIdToken: function () { return Promise.resolve('fixture'); } };
    var auth = { currentUser: user, onAuthStateChanged: function (fn) { setTimeout(function () { fn(user); }, 0); }, signOut: function () { return Promise.resolve(); } };
    function authentication() { return auth; } authentication.GoogleAuthProvider = function () {};
    window.firebase = { apps: [1], initializeApp: function () {}, auth: authentication, firestore: function () { return {}; } };
  }, { uid: who.uid, email: who.email, name: who.claims.name });
}
async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.PACKAGING_SIGNUP_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  fs.mkdirSync(out, { recursive: true }); await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); }); var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await require(process.env.PLAYWRIGHT || 'playwright').chromium.launch({ executablePath: process.env.CHROME });
  try {
    seed(); var sentId = null, sentKey = null;
    for (var theme of ['light', 'dark']) {
      caller = STAFF; var ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme }); await init(ctx, base, STAFF);
      var page = await ctx.newPage(), errors = []; page.on('pageerror', function (e) { errors.push(e.message); });
      await page.goto(base + '/subscription-proposal.html'); await page.locator('#app:not([hidden])').waitFor();
      check(await page.locator('#steps button').count() === 7, 'seven steps');
      for (var pair of [['company', 'Green Wolf Strategies'], ['domain', 'greenwolf.example'], ['contact', 'Dana Wolf'], ['email', 'dana@greenwolf.example'], ['phone', '555-0111'], ['addr-line1', '9 Wolf Way'], ['addr-city', 'Chicago'], ['addr-state', 'IL'], ['addr-postalCode', '60601'], ['addr-country', 'US']]) await page.locator('#sp-f-' + pair[0]).fill(pair[1]);
      if (theme === 'light') await capture(page, 'proposal-company-light');
      await page.locator('[data-go="2"]').first().click(); await page.locator('[data-step="2"]:not([hidden])').waitFor();
      check(await page.locator('#sp-questions .q').count() === 12, 'twelve discovery questions');
      for (var a of ['design:quarter', 'sites:quarter', 'estimate:quarter', 'ev:quarter', 'plansets:quarter', 'permitting:year', 'storage:year']) await page.locator('[data-answer="' + a + '"]').click();
      await page.locator('#sp-ev-count').fill('30');
      for (var sp of [['spend-tools', '900'], ['spend-consultants', '1500'], ['spend-drafting', '400'], ['unit-evApplications', '150']]) await page.locator('#sp-f-' + sp[0]).fill(sp[1]);
      await page.locator('#sp-paystoday').fill('Two drafting contractors and a screening service.'); await page.locator('#sp-paystoday').dispatchEvent('change');
      await page.locator('#sp-recommend').click(); await page.waitForFunction(function () { var b = document.querySelector('#sp-rec b'); return b && b.textContent.indexOf('$1,299/month') >= 0; });
      var recText = await page.locator('#sp-rec').textContent();
      check(recText.indexOf('Recommended: Field') >= 0 && recText.indexOf('Next rungs') >= 0 && recText.indexOf('30 EV applications') >= 0, 'the server recommends Field with next rungs and the overage note: ' + recText.slice(0, 80));
      await capture(page, 'proposal-discovery-' + theme);
      await page.locator('[data-go="3"]').first().click(); await page.locator('[data-step="3"]:not([hidden])').waitFor();
      await page.waitForFunction(function () { var b = document.querySelector('#rail .big'); return b && b.textContent === '$1,299/month'; });
      check(await page.locator('#sp-picker [data-module-card] input:checked').count() === 5, 'the picker carries the recommended five');
      check((await page.locator('#sp-lines').textContent()).indexOf('Field') >= 0, 'the invoice lines are shown');
      await page.locator('#sp-f-credit').selectOption('yes'); await page.waitForFunction(function () { return document.querySelector('#rail').textContent.indexOf('$779.40') >= 0; });
      check(true, 'the credit window price comes from the server');
      await capture(page, 'proposal-package-' + theme);
      await page.locator('[data-go="4"]').first().click(); await page.waitForFunction(function () { return document.querySelector('#sp-value').textContent.indexOf('$1,501/month less than today') >= 0; });
      check(true, 'value in their own numbers'); if (theme === 'light') await capture(page, 'proposal-value-light');
      await page.locator('#steps li:nth-child(6) button').click(); await page.waitForFunction(function () { return document.querySelectorAll('#deck-box .sp-page').length === 7; });
      var deck = await page.locator('#deck-box').textContent();
      check(deck.indexOf('Green Wolf Strategies') >= 0 && deck.indexOf('Module schedule') >= 0 && deck.indexOf('$1,299/month') >= 0 && deck.indexOf('Signature') >= 0, 'seven pages, the Order Form filled in the customer’s name');
      await capture(page, 'proposal-deck-' + theme);
      await page.locator('#sp-save').click(); await page.waitForFunction(function () { return /[?&]id=sp-[a-f0-9]{16}/.test(location.search); });
      check(await page.locator('#sp-status').textContent() === 'draft', 'saved as a draft');
      await page.locator('[data-go="7"]').first().click(); await page.locator('#sp-send-btn:not([disabled])').waitFor(); var before = mails.length;
      await page.locator('#sp-send-btn').click(); await page.waitForFunction(function () { return document.querySelector('#sp-status').textContent === 'sent'; });
      check(mails.length === before + 1 && mails[mails.length - 1].email === 'dana@greenwolf.example' && /key=[a-f0-9]{48}$/.test(mails[mails.length - 1].url), 'sending emails the customer a keyed link');
      check((await page.locator('.send .link').first().textContent()).indexOf('/proposal.html?id=sp-') >= 0, 'the link is shown to the rep');
      await capture(page, 'proposal-send-' + theme);
      sentId = /id=(sp-[a-f0-9]{16})/.exec(mails[mails.length - 1].url)[1]; sentKey = /key=([a-f0-9]{48})/.exec(mails[mails.length - 1].url)[1];
      var cp = await ctx.newPage(); cp.on('pageerror', function (e) { errors.push(e.message); });
      await cp.goto(base + '/proposal.html?id=' + sentId + '&key=' + sentKey); await cp.waitForFunction(function () { return document.querySelectorAll('#deck-box .sp-page').length === 7; });
      var acceptText = await cp.locator('#accept').textContent();
      check(acceptText.indexOf('Accept and create your workspace') >= 0 && (await cp.locator('#accept a').getAttribute('href')).indexOf('/start.html?proposal=' + sentId) === 0, 'a prospect is sent to signup with the key');
      check((await cp.locator('#status').textContent()).indexOf('Valid until') >= 0, 'the customer sees the validity');
      await capture(cp, 'proposal-customer-' + theme);
      check(!errors.length, 'no page errors: ' + errors.join('; '));
      await ctx.close();
    }
    /* Signing up from the proposal link: the package it priced, read-only, then accepted with the workspace. */
    caller = DANA; var sctx = await browser.newContext({ viewport: { width: 1280, height: 960 } }); await init(sctx, base, DANA); var sp2 = await sctx.newPage();
    await sp2.goto(base + '/start.html?proposal=' + sentId + '&key=' + sentKey); await sp2.evaluate(function () { window.dispatchEvent(new CustomEvent('omega:hub', { detail: {} })); });
    await sp2.locator('#f-submit:not([disabled])').waitFor(); await sp2.waitForFunction(function () { return document.getElementById('signup-proposal').textContent.indexOf('Proposal from') >= 0; });
    check((await sp2.locator('#f-name').inputValue()) === 'Green Wolf Strategies', 'the company name is prefilled from the proposal');
    await sp2.locator('#f-submit').click(); await sp2.locator('#step-billing').waitFor({ state: 'visible' });
    check((await sp2.locator('#signup-proposal').textContent()).indexOf('Field at $1,299/month') >= 0, 'the proposal banner names the package and price');
    check(await sp2.locator('#signup-package-menu [data-module-card] input:disabled').count() === M.catalog().length && await sp2.locator('#signup-package-menu [data-module-card] input:checked').count() === 5, 'the priced package is shown read-only');
    await sp2.waitForFunction(function () { return document.getElementById('signup-package-price').textContent.indexOf('$1,299/month') >= 0; }); check(true, 'the server price is shown');
    for (var f2 of [['phone', '555-0111'], ['teamSize', '4'], ['address.line1', '9 Wolf Way'], ['address.city', 'Chicago'], ['address.state', 'IL'], ['address.postalCode', '60601']]) await sp2.locator('[data-profile-field="' + f2[0] + '"]').fill(f2[1]);
    await capture(sp2, 'signup-proposal');
    await sp2.locator('#billing-submit').click(); await sp2.locator('#step-done').waitFor({ state: 'visible' });
    var gw = db.data.get('omega_orgs/greenwolf.example/billing/current');
    check(gw && gw.proposalId === sentId && gw.proposedPackage.modules.length === 5 && gw.proposedPackage.credit && db.data.get('subscription_proposals/' + sentId).status === 'accepted', 'the workspace proposes the proposal’s package and the proposal is accepted');
    await sctx.close();
    /* Self-serve: a company with no proposal walks the same discovery and gets the same recommendation. */
    caller = KIM; var kctx = await browser.newContext({ viewport: { width: 1280, height: 960 } }); await init(kctx, base, KIM); var kp = await kctx.newPage();
    await kp.goto(base + '/start.html'); await kp.evaluate(function () { window.dispatchEvent(new CustomEvent('omega:hub', { detail: {} })); });
    await kp.locator('#f-submit:not([disabled])').waitFor(); await kp.locator('#f-name').fill('Lattice Energy'); await kp.locator('#f-submit').click(); await kp.locator('#step-discovery').waitFor({ state: 'visible' });
    check(await kp.locator('#signup-questions .sq').count() === 12, 'signup asks the twelve questions');
    for (var q of ['design', 'sites', 'storage', 'finance']) await kp.locator('input[name="q-' + q + '"][value="quarter"]').check();
    await kp.locator('#spend-tools').fill('800'); await kp.locator('#spend-consultants').fill('2000');
    await kp.locator('#discovery-recommend').click(); await kp.waitForFunction(function () { return document.getElementById('signup-recommended').textContent.indexOf('Recommended: Field at $1,299/month') >= 0; });
    check((await kp.locator('#signup-recommended').textContent()).indexOf('$1,501/month less than today') >= 0, 'the recommendation shows the difference in their numbers');
    await capture(kp, 'signup-discovery');
    await kp.locator('#discovery-continue').click(); await kp.locator('#step-billing').waitFor({ state: 'visible' });
    check(await kp.locator('#signup-package-menu [data-module-card] input:checked').count() === 4, 'the billing step starts from the recommendation');
    await kp.waitForFunction(function () { return document.getElementById('signup-package-price').textContent.indexOf('$1,299/month') >= 0; }); check(true, 'the live price follows the picker');
    for (var f3 of [['phone', '555-0122'], ['teamSize', '6'], ['address.line1', '1 Lattice Ln'], ['address.city', 'Chicago'], ['address.state', 'IL'], ['address.postalCode', '60602']]) await kp.locator('[data-profile-field="' + f3[0] + '"]').fill(f3[1]);
    await capture(kp, 'signup-recommended');
    await kp.locator('#billing-submit').click(); await kp.locator('#step-done').waitFor({ state: 'visible' });
    var lt = db.data.get('omega_orgs/lattice.example/billing/current');
    check(lt && lt.signupDiscovery && lt.signupDiscovery.recommendation.modules.join() === 'lite,gridatlas,storage,finance' && lt.proposedPackage.modules.join() === 'lite,gridatlas,storage,finance' && lt.signupDiscovery.discovery.spend.consultants === 200000, 'the answers and the chosen package are stored for approval');
    await kctx.close();
    check(sandboxInvoices === 0, 'nothing was invoiced: proposals never price or charge');
    console.log('Subscription proposal UI: ' + checks + ' checks, ' + shots + ' screenshots; real handlers over an in-memory Firestore, mail and QuickBooks stand-ins.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
