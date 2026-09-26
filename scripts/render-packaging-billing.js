#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Actual tenant/signup pages against the real endpoints and an in-memory DB.
 * QBO is mocked; screenshots prove UI behavior, not hosted payment acceptance.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('./_lib/firestore-double'), H = require('./_lib/packaging-billing-fixture'), B = require('../api/_lib/pricebook'), M = require('../api/_lib/modules');
var fixture, org, profile, db, caller, invoices = 0, checks = 0, shots = 0;
var root = path.join(__dirname, '..'), out = path.join(root, 'docs/screenshots/packaging-phase-4'), out5 = path.join(root, 'docs/screenshots/packaging-phase-5');
H.mockAdmin(function () { return db; }, function () { return caller; });
fixture = require('./_lib/logic-fixtures'); org = fixture.ORG;
profile = H.profile(org, fixture.brand.companyName);
F.mock('../api/_lib/mail', { templates: { signupReceived: async function () {}, signupAlert: async function () {} } });
H.mockQbo(function () { invoices++; });
var routes = { '/api/tenant-package': require('../api/tenant-package'), '/api/package-catalog': require('../api/package-catalog'), '/api/billing-profile': require('../api/billing-profile'), '/api/tenant-signup': require('../api/tenant-signup'), '/api/plan-change': require('../api/plan-change') };
/* Phase 5: a tenant whose current cycle is already paid, seen by its owner. */
function seedPaid(keys, plan, staff) { seed(keys, staff); H.seedPaidTenant(db, { org: org, keys: keys, plan: plan }); }
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
async function capture(page, name) { await page.screenshot({ path: path.join(name.indexOf('your-plan') === 0 ? out5 : out, name + '.png'), fullPage: true }); shots++; }
async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.PACKAGING_SIGNUP_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(out5, { recursive: true }); await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); }); var base = 'http://127.0.0.1:' + server.address().port;
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
    /* Phase 5: Your plan for a paid tenant admin — quote, pay first, included, removal. */
    for (var theme5 of ['light', 'dark']) {
      seedPaid(M.starters().ev, 'field', false); var invoicesBefore = invoices;
      var planContext = await browser.newContext({ viewport: { width: 1280, height: 960 }, colorScheme: theme5 }); await init(planContext, base);
      var pp = await planContext.newPage(), planErrors = []; pp.on('pageerror', function (e) { planErrors.push(e.message); });
      await pp.goto(base + '/admin/tenant.html?org=' + org); await pp.locator('[data-pp-tab="cust"]').waitFor(); await pp.locator('[data-pp-tab="cust"]').click();
      await pp.locator('[data-subscribe="siteintel"] button').waitFor();
      check((await pp.locator('.pp-plan-name').textContent()).indexOf('$1,299') >= 0, 'Your plan shows the server monthly price');
      check(await pp.locator('[data-subscribe]').count() === M.catalog().length - M.starters().ev.length, 'one subscribe control per unowned module');
      await pp.locator('[data-subscribe="siteintel"] button').click();
      await pp.waitForFunction(function () { var n = document.querySelector('[data-subscribe="siteintel"] .opm-quote'); return n && n.textContent.indexOf('today') >= 0; });
      var quoteText = await pp.locator('[data-subscribe="siteintel"]').textContent();
      check(quoteText.indexOf('$760.80 today') >= 0 && quoteText.indexOf('on the 20th') >= 0, 'server quote prorated to the billing date: ' + quoteText);
      check(quoteText.indexOf('service fee') >= 0, 'plan change discloses the service fee change');
      await capture(pp, 'your-plan-quote-' + theme5);
      await pp.locator('[data-subscribe="siteintel"]').getByRole('button', { name: 'Subscribe and pay' }).click();
      await pp.waitForFunction(function () { var n = document.querySelector('[data-subscribe="siteintel"] .opm-wait'); return n && n.textContent.indexOf('Invoice created') >= 0; });
      check(invoices === invoicesBefore + 1, 'exactly one change invoice'); check(db.data.get('omega_orgs/' + org + '/billing/current').modules.indexOf('siteintel') < 0, 'nothing switches on before payment');
      await pp.waitForFunction(function () { return document.querySelector('.pp-pending'); });
      check((await pp.locator('.pp-pending').textContent()).indexOf('pay before 2026-10-20') >= 0, 'pending change lists its expiry');
      await capture(pp, 'your-plan-waiting-' + theme5);
      check(planErrors.length === 0, planErrors.join('\n')); await planContext.close();
    }
    seedPaid(['lite', 'evrebates', 'estimate'], 'field', false); var includedBefore = invoices;
    var incContext = await browser.newContext({ viewport: { width: 1280, height: 960 } }); await init(incContext, base); var ip = await incContext.newPage();
    await ip.goto(base + '/admin/tenant.html?org=' + org); await ip.locator('[data-pp-tab="cust"]').click(); await ip.locator('[data-subscribe="storage"] button').click();
    await ip.waitForFunction(function () { var n = document.querySelector('[data-subscribe="storage"] .opm-quote'); return n && n.textContent.indexOf('no charge today') >= 0; });
    await ip.locator('[data-subscribe="storage"]').getByRole('button', { name: 'Turn it on' }).click();
    await ip.waitForFunction(function () { return document.querySelector('[data-pp-pane="cust"] [data-module-card="storage"].on'); });
    check(invoices === includedBefore, 'an included addition creates no invoice'); check(db.data.get('omega_orgs/' + org + '/billing/current').modules.indexOf('storage') >= 0, 'and switches on immediately inside the paid tier');
    await capture(ip, 'your-plan-included');
    await ip.locator('[data-pp-pane="cust"]').getByRole('button', { name: 'Remove at next review' }).first().click();
    await ip.waitForFunction(function () { return document.querySelector('[data-pp-pane="cust"]').textContent.indexOf('Withdraw removal request') >= 0; });
    check((db.data.get('omega_orgs/' + org + '/billing/current').removalRequests || []).length === 1, 'removal is queued, not applied'); await incContext.close();
    seedPaid(M.starters().ev, 'field', false); caller.role = 'member'; var memberContext = await browser.newContext(); await init(memberContext, base); var mp = await memberContext.newPage();
    await mp.goto(base + '/admin/tenant.html?org=' + org); await mp.locator('[data-pp-tab="cust"]').waitFor().catch(function () {});
    check(await mp.locator('[data-subscribe] .opm-primary').count() === 0, 'a member sees no subscribe action'); await memberContext.close(); caller.role = 'owner';
    console.log('Packaging billing UI: ' + checks + ' checks, ' + shots + ' screenshots; mocked QBO, no live writes.');
  } finally { await browser.close(); }
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () { server.close(); });
