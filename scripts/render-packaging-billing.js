#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Actual tenant/signup pages against the real endpoints and an in-memory DB.
 * QBO is mocked; screenshots prove UI behavior, not hosted payment acceptance.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('./_lib/firestore-double'), B = require('../api/_lib/pricebook'), M = require('../api/_lib/modules');
var fixture, org, profile, db, caller, invoices = 0, checks = 0, shots = 0;
var root = path.join(__dirname, '..'), out = path.join(root, 'docs/screenshots/packaging-phase-4');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function () { return caller; }, db: function () { return db; },
  safeOrg: function (s) { return /^[a-z0-9.-]+\.[a-z]+$/.test(s || '') ? s : null; }, orgOf: function (s) { return s.split('@')[1]; },
  isTenantAdmin: async function (c, o) { return c.staff || c.orgId === o && c.role === 'owner'; },
  billingOf: async function (o) { var r = await db.doc('omega_orgs/' + o + '/billing/current').get(); return r.exists ? r.data() : {}; },
  httpError: function (status, message) { var e = new Error(message); e.status = status; return e; },
  FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; },
  init: function () { return { auth: function () { return { setCustomUserClaims: async function () {} }; } }; } });
fixture = require('./_lib/logic-fixtures'); org = fixture.ORG;
profile = { legalName: fixture.brand.companyName || 'Clean Cell — test fixture', contactName: 'Fixture Owner', email: 'owner@' + org, phone: '555-0100',
 address: { line1: '1 Fixture Way', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'oem', teamSize: 3 };
F.mock('../api/_lib/mail', { templates: { signupReceived: async function () {}, signupAlert: async function () {} } });
require('../api/_lib/qbo-billing').driver = function () { return { customer: async function () { return 'C-fixture'; }, invoice: async function (plan) { invoices++; return { id: 'I-fixture', totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/fixture' }; } }; };
var routes = { '/api/tenant-package': require('../api/tenant-package'), '/api/package-catalog': require('../api/package-catalog'), '/api/billing-profile': require('../api/billing-profile'), '/api/tenant-signup': require('../api/tenant-signup') };
function seed(keys, staff) {
  db = new F.DB(); db.serial = true; var book = B.proposed(); book.enabled = true; book.qbo.realmId = 'fixture'; db.seed('pricebook/' + book.version, book);
  db.seed('omega_orgs/' + org, { name: 'Clean Cell · fixture', status: 'pending', packagingSandbox: true, signedUpAt: Date.now() - 86400000, domains: ['fixture.example'] });
  db.seed('omega_orgs/' + org + '/billing/current', { packaged: true, packagingState: 'pending', modules: ['lite'], proposedPackage: { modules: keys }, pricebookVersion: book.version });
  db.seed('omega_orgs/' + org + '/billing/profile', profile);
  db.seed('omega_orgs/' + org + '/members/test', { role: 'owner', status: 'active' });
  caller = { uid: 'test', staff: staff !== false, email: staff !== false ? 'fixture@clearsky-usa.com' : 'owner@' + org, orgId: org, role: 'owner', claims: { email_verified: true } };
}
var server = http.createServer(async function (req, res) {
  try {
    var url = new URL(req.url, 'http://localhost');
    if (routes[url.pathname]) { var chunks = []; for await (var chunk of req) chunks.push(chunk); var body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      var result = await routes[url.pathname]({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body: body }, res); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result)); }
    if (url.pathname === '/api/tenant-systems') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ name: 'Clean Cell · fixture', surfaces: [] })); }
    if (url.pathname === '/config.js') return res.end('window.CLEARSKY_CONFIG={firebase:{}};');
    if (['/omega-brand.js', '/omega-tenant.js', '/omega-whitelabel.js'].includes(url.pathname)) return res.end('');
    if (!['/admin/tenant.html', '/start.html', '/admin/package-panel.js', '/admin/package-panel.css', '/omega-package-menu.js', '/omega-billing-profile.js'].includes(url.pathname)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(path.join(root, url.pathname)));
  } catch (e) { res.statusCode = e.status || 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: e.message })); }
});
async function init(context, base) {
  await context.route('**/*', function (r) { return r.request().url().startsWith(base) ? r.continue() : r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
  await context.addInitScript(function () {
    var user = { uid: 'test', email: 'owner@fixture.example', displayName: 'Fixture Owner', getIdToken: function () { return Promise.resolve('fixture'); } };
    var auth = { currentUser: user, onAuthStateChanged: function (fn) { setTimeout(function () { fn(user); }, 0); } };
    var query = { collection: function () { return query; }, doc: function () { return query; }, limit: function () { return query; }, get: function () { return Promise.resolve({ size: 0, forEach: function () {} }); } };
    window.firebase = { apps: [1], auth: function () { return auth; }, firestore: function () { return query; } };
  });
}
function check(v, text) { assert(v, text); checks++; }
async function capture(page, name) { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); shots++; }
async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.PACKAGING_SIGNUP_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  fs.mkdirSync(out, { recursive: true }); await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); }); var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await require(process.env.PLAYWRIGHT || 'playwright').chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (var pack of ['lite', 'field']) for (var theme of ['light', 'dark']) {
      seed(pack === 'lite' ? ['lite'] : M.starters().ev);
      var context = await browser.newContext({ viewport: { width: 1280, height: 960 }, colorScheme: theme }); await init(context, base);
      var page = await context.newPage(), errors = []; page.on('pageerror', function (e) { errors.push(e.message); });
      await page.goto(base + '/admin/tenant.html?org=' + org); await page.locator('#pp-review:not([disabled])').waitFor();
      check(await page.locator('[data-pp-tab]').count() === 4, 'four tabs');
      check((await page.locator('#pp-monthly').textContent()).includes(pack === 'lite' ? '$500' : '$1,299'), 'server monthly price');
      check(await page.locator('[data-pp-pane="pkg"] [data-module-card]').count() === M.catalog().length, 'one catalog');
      await capture(page, pack + '-' + theme + '-package');
      if (pack === 'field' && theme === 'light') {
        var scope = page.locator('[data-pp-pane="pkg"]');
        await scope.locator('[data-module-card="logic-plant"] input').check();
        check(await scope.locator('[data-module-card="logic-office"] input').isChecked(), 'Logic part adds Office');
        await scope.locator('[data-module-card="logic-office"] input').uncheck();
        check(!await scope.locator('[data-module-card="logic-plant"] input').isChecked(), 'removing Office removes dependent parts');
        await page.locator('#pp-fee-mode').selectOption('custom');
        await page.locator('#pp-fee-amount').fill('4250.50'); await page.locator('#pp-fee-reason').fill('Reviewed onboarding scope'); await page.locator('#pp-fee-reason').dispatchEvent('change');
        await page.waitForFunction(function () { return document.getElementById('pp-fee').textContent === '$4,250.50/year'; });
        check(await page.locator('#pp-review').isEnabled(), 'custom dollar input is server-priced');
        await page.locator('#pp-fee-mode').selectOption('waived'); await page.waitForFunction(function () { return document.getElementById('pp-fee').textContent === 'Waived'; });
        check(await page.locator('#pp-fee-scope').inputValue() === 'first-year', 'waiver defaults to first year');
        await page.locator('#pp-fee-mode').selectOption('standard');
        await scope.locator('summary').first().click(); await capture(page, 'field-billing-profile'); await scope.locator('summary').first().click();
      }

      await page.locator('#pp-interval').selectOption('annual'); await page.waitForFunction(function () { return document.getElementById('pp-annual').textContent.indexOf('excludes transformation credit') >= 0; });
      check(await page.locator('#pp-credit').isDisabled(), 'annual excludes credit');
      await page.locator('#pp-review').click(); await page.locator('#pp-apply:not([disabled])').waitFor();
      check((await page.locator('#pp-write-invoice').textContent()).includes('trial end'), 'approval defers invoice'); await capture(page, pack + '-' + theme + '-writes');
      await page.locator('[data-pp-tab="cust"]').click(); await capture(page, pack + '-' + theme + '-customer');
      await page.locator('[data-pp-tab="hist"]').click(); check((await page.locator('[data-pp-pane="hist"]').textContent()).includes('No billing'), 'empty history'); await capture(page, pack + '-' + theme + '-history');
      await page.locator('[data-pp-tab="write"]').click(); await page.locator('#pp-apply').click(); await page.waitForFunction(function () { return document.querySelector('.pp-pill').textContent === 'trial'; });
      check(db.data.get('omega_orgs/' + org + '/billing/current').interval === 'annual', 'reviewed annual activation persisted'); check(invoices === 0, 'no invoice before trial end');
      check(errors.length === 0, errors.join('\n')); await context.close();
    }
    seed(['lite'], false); var tenantContext = await browser.newContext(); await init(tenantContext, base); var tenantPage = await tenantContext.newPage(); await tenantPage.goto(base + '/admin/tenant.html?org=' + org); await tenantPage.locator('[data-pp-tab="cust"]').waitFor();
    check(await tenantPage.locator('[data-pp-tab]').count() === 2, 'tenant admin only sees plan and history'); check(await tenantPage.locator('#pp-apply').count() === 0, 'tenant cannot activate'); await tenantContext.close();
    for (var width of [1024, 768]) {
      seed(M.starters().ev); var tablet = await browser.newContext({ viewport: { width: width, height: 960 } }); await init(tablet, base); var tp = await tablet.newPage(); await tp.goto(base + '/admin/tenant.html?org=' + org); await tp.locator('#pp-review:not([disabled])').waitFor();
      check(await tp.evaluate(function () { return document.documentElement.scrollWidth <= innerWidth; }), 'no horizontal overflow at ' + width); await capture(tp, 'field-tablet-' + width); await tablet.close();
    }
    seed(['lite'], false); caller.email = 'owner@signup-fixture.example'; caller.orgId = 'signup-fixture.example';
    var signup = await browser.newContext({ viewport: { width: 1280, height: 960 } }); await init(signup, base); var sp = await signup.newPage(); await sp.goto(base + '/start.html'); await sp.evaluate(function () { window.dispatchEvent(new CustomEvent('omega:hub', { detail: {} })); });
    await sp.locator('#f-submit:not([disabled])').waitFor(); await sp.locator('#f-name').fill('Signup Fixture'); await sp.locator('#f-submit').click(); await sp.locator('#step-billing').waitFor({ state: 'visible' });
    for (var pair of [['phone', '555-0100'], ['teamSize', '3'], ['address.line1', '1 Main'], ['address.city', 'Chicago'], ['address.state', 'IL'], ['address.postalCode', '60601']]) await sp.locator('[data-profile-field="' + pair[0] + '"]').fill(pair[1]);
    await capture(sp, 'signup-billing'); await sp.locator('#billing-submit').click(); await sp.locator('#step-done').waitFor({ state: 'visible' });
    check(db.data.get('omega_orgs/signup-fixture.example').status === 'pending', 'actual signup endpoint creates pending org'); check(db.data.get('omega_orgs/signup-fixture.example/billing/current').trialEndsAt === undefined, 'signup has no running trial'); await signup.close();
    console.log('Packaging billing UI: ' + checks + ' checks, ' + shots + ' screenshots; mocked QBO, no live writes.');
  } finally { await browser.close(); }
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () { server.close(); });
