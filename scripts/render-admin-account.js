#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/render-admin-account.js — the admin account page, and the console's way to it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Boots the REAL admin/account.html and admin/index.html in Chromium: the
   Firebase compat SDK replaced by scripts/_lib/firebase-double.js (a
   signed-in ClearSky admin), the endpoints the pages post to answered by the
   REAL handlers on the in-memory Firestore double (tenant-signup to make the
   packaged tenant, tenant-package, billing-profile, package-catalog,
   plan-change, tenant-approve, offerings) with QuickBooks mocked, and the
   Auth-side endpoints (user-admin, set-role, logic-onboard) stubbed. Three
   accounts: a PACKAGED workspace awaiting its first payment, a LEGACY
   Standard tenant, and a domain with no record whose signup is in progress.

   2026-09-28, Tommy: "i should click an account and it opens a page for
   them so i can manage them and edit them and see if they paid and etc. and
   edit their account or remove it etc. other wise its so disorganized."
   It holds that:
     1. the page opens on the account: name, status, standing, whether it
        has paid, the package and its price, the pay link; "Look at the
        payment now" asks plan-change and says what it found, and once the
        provider shows it paid the header says Active; the Package panel
        mounts; the people are listed with their controls;
     2. a legacy tenant shows its terms, Save terms writes billing/current
        and its history row, and Cancel account posts reject (never a
        delete) and the page reads cancelled;
     3. a domain with no record shows the signup in progress: the stage,
        the system and its price, Set up (to the console) and Decline;
     4. the console's Tenants tab links every row to the page, its Access
        requests card reads "in signup" with the same line, and ?setup=
        opens the New tenant form filled in from the request.

     node scripts/render-admin-account.js [--shots DIR]
     npm run check:pages
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
/* sixty days out, so 'current' never turns 'due soon' as the calendar moves (it did on 2026-10-03) */
var LEGACY_DUE = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
process.env.PACKAGING_PROVIDER = 'quickbooks';
var http = require('http'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-admin-account: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-admin-account: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var DOUBLE = fs.readFileSync(path.join(ROOT, 'scripts/_lib/firebase-double.js'), 'utf8');

/* the server: the real endpoints on the Firestore double, as ClearSky's admin */
var F = require('./_lib/firestore-double'), H = require('./_lib/packaging-billing-fixture'), B = require('../api/_lib/pricebook');
var sdb = null, STAFF = { uid: 'u-tom', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, role: 'admin', claims: { email_verified: true, name: 'Tom' } }, caller = STAFF;
H.mockAdmin(function () { return sdb; }, function () { return caller; });
F.mock('../api/_lib/mail', { templates: new Proxy({}, { get: function () { return async function () { return { ok: true }; }; } }) });
var qbo = { paid: false }; H.mockQbo(function () {}, qbo);
var ROUTES = { '/api/tenant-signup': require('../api/tenant-signup'), '/api/tenant-package': require('../api/tenant-package'), '/api/billing-profile': require('../api/billing-profile'),
  '/api/package-catalog': require('../api/package-catalog'), '/api/plan-change': require('../api/plan-change'), '/api/tenant-approve': require('../api/tenant-approve'), '/api/offerings': require('../api/offerings') };
var STUBS = { '/api/user-admin': { ok: true, link: 'https://example.invalid/reset' }, '/api/set-role': { ok: true }, '/api/logic-onboard': { ok: true, note: 'stub' } };
var posts = [];
var TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
var srv = http.createServer(async function (req, res) {
  var u = req.url.split('?')[0], qs = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
  function json(o, s) { res.writeHead(s || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  if (u.indexOf('/api/') === 0) {
    var chunks = []; for await (var c of req) chunks.push(c);
    var body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    var query = {}; qs.split('&').filter(Boolean).forEach(function (kv) { var p = kv.split('='); query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    if (req.method === 'POST') posts.push(u + ' ' + (body.action || '') + ' ' + (body.orgId || ''));
    if (STUBS[u]) return json(STUBS[u]);
    if (ROUTES[u]) { try { return json(await ROUTES[u]({ method: req.method, headers: req.headers, query: query, body: body }, { setHeader: function () {}, end: function (b) { res.end(b); } })); } catch (e) { return json({ error: e.message }, e.status || 500); } }
    return json({ error: 'no ' + u }, 404);
  }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
var SHOTS = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || null) : null; })();
if (SHOTS && !fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
async function shot(p, name) { if (!SHOTS) return; await wait(600); await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); }
var fails = 0; function ok(n, c, d) { console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d))); if (!c) fails++; }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function until(fn, ms) { var end = Date.now() + (ms || 6000), v = await fn(); while (!v && Date.now() < end) { await wait(150); v = await fn(); } return v; }

/* the three accounts, as the real records would be */
async function seed() {
  sdb = new F.DB(); sdb.serial = true; var book = B.proposed(); book.enabled = true; book.qbo.realmId = 'fixture'; sdb.seed('pricebook/' + book.version, book);
  process.env.PACKAGING_SIGNUP_ENABLED = 'true'; process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  /* the packaged workspace: made by the signup itself (pay at the end), as a real one is, so its invoice record is the engine's */
  caller = { uid: 'u-pat', email: 'pat@pkg.example', orgId: 'pkg.example', staff: false, role: null, claims: { email_verified: true, name: 'Pat Owner' } };
  await ROUTES['/api/tenant-signup']({ method: 'POST', headers: {}, query: {}, body: { action: 'progress', stage: 'billing', modules: ['lite', 'gridatlas'], interval: 'monthly' } }, { setHeader: function () {} });
  await ROUTES['/api/tenant-signup']({ method: 'POST', headers: {}, query: {}, body: { companyName: 'Packaged Co', vertical: 'oem', billingProfile: H.profile('pkg.example', 'Packaged Co'), modules: ['lite', 'gridatlas'], interval: 'monthly', payNow: true } }, { setHeader: function () {} });
  caller = STAFF;
  sdb.seed('team_members/pkg.example__pat@pkg.example', { orgId: 'pkg.example', email: 'pat@pkg.example', name: 'Pat Owner', lastSeen: Date.now() - 3600000 });
  sdb.seed('projects/p1', { orgId: 'pkg.example', name: 'Site A', createdAt: Date.now() });
  /* the legacy tenant: a Standard tier billed outside the engine */
  sdb.seed('omega_orgs/legacy.example', { name: 'Legacy Co', status: 'active', vertical: 'developer', domains: ['legacy.clearskyomega.com'], createdAt: Date.now() - 86400000 * 200 });
  sdb.seed('omega_orgs/legacy.example/billing/current', { tier: 'standard', addons: ['compute'], amountDue: 0, subscriptionDue: LEGACY_DUE, lastPaidAt: '2026-09-17', paymentProvider: 'stripe', stripeCustomerId: 'cus_fixture' });
  sdb.seed('omega_orgs/legacy.example/members/u-lee', { email: 'lee@legacy.example', role: 'owner', status: 'active', name: 'Lee Legacy' });
  sdb.seed('team_members/legacy.example__lee@legacy.example', { orgId: 'legacy.example', email: 'lee@legacy.example', lastSeen: Date.now() - 7200000 });
  /* the signup in progress: an account made on /start.html an hour ago, building its system, no record yet */
  sdb.seed('access_requests/u-newco', { email: 'kim@newco.example', domain: 'newco.example', uid: 'u-newco', status: 'pending', source: 'signup', createdAt: Date.now() - 3600000, updatedAt: Date.now() - 600000,
    signup: { stage: 'system', modules: ['lite', 'gridatlas'], interval: 'monthly', priceDisplay: '$750/month', planDisplay: 'Lite + modules', emailVerified: false, updatedAt: '2026-09-28T19:00:00.000Z' } });
}
function fixture() { var docs = {}; sdb.data.forEach(function (v, k) { docs[k] = JSON.parse(JSON.stringify(v)); }); return docs; }

(async function () {
  await seed();
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });
  async function ctxFor() {
    var ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    await ctx.addInitScript(DOUBLE);
    await ctx.addInitScript(function (cfg) {
      var d = window.FirebaseDouble.install(window, { user: cfg.user, docs: cfg.docs, latency: 5 });
      if (d.auth.currentUser) d.auth.currentUser.getIdToken = function () { return Promise.resolve('tok-staff'); };
    }, { docs: fixture(), user: { uid: 'u-tom', email: 'tom@clearsky-usa.com', displayName: 'Tom Gilmer', emailVerified: true } });
    return ctx;
  }
  function track(p) { var errs = [], dialogs = []; p.on('pageerror', function (e) { errs.push(e.message); }); p.on('dialog', function (d) { dialogs.push(d.message()); d.accept(); }); return { errs: errs, dialogs: dialogs }; }
  function text(p, sel) { return p.$eval(sel, function (e) { return e.innerText.replace(/\s+/g, ' ').trim(); }).catch(function () { return ''; }); }
  function writes(p) { return p.evaluate(function () { return window.__firebaseDouble.store.log.map(function (x) { return x.op + ' ' + x.path; }); }); }

  /* 1. the packaged account: on, not yet paid, the package priced, the pay link; the payment looked at; the panel; the people */
  var ctx = await ctxFor(), p = await ctx.newPage(), t = track(p);
  await p.goto(base + '/admin/account.html?org=pkg.example', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#acct-body:not([style*="none"])', { timeout: 10000 }).catch(function () {});
  await until(function () { return p.$eval('#acct-pay', function (e) { return /Omega Grid/.test(e.textContent); }).catch(function () { return false; }); });
  var head = { name: await text(p, '#acct-name'), org: await text(p, '#acct-org'), chips: await text(p, '#acct-chips'), sub: await text(p, '#acct-sub'), title: await p.title() };
  ok('the page opens on the account: its name, orgId, status and standing in the header', head.name === 'Packaged Co' && head.org === 'pkg.example' && /active/i.test(head.chips) && /Awaiting first payment/i.test(head.chips) && /packaged/i.test(head.chips) && /signed up by pat@pkg\.example/.test(head.sub) && /^Packaged Co/.test(head.title), head);
  var pay = await text(p, '#acct-pay'), status = await text(p, '#acct-status');
  ok('Payment says whether they paid: the state, the package in the book\'s words with its price, the amount due and the provider\'s pay link', /Awaiting first payment/i.test(pay) && /awaiting payment/.test(pay) && /Omega Design, Omega Grid/.test(pay) && /\$[\d,]+\/month/.test(pay) && /Amount due\s*\$[\d,]+/.test(pay) && /pay link/.test(pay) && /quickbooks/i.test(pay), pay);
  var buttons = await p.$$eval('#acct-status button', function (bs) { return bs.map(function (b) { return b.textContent.trim(); }); });
  ok('Account says how it came to be on, and offers Suspend, Cancel account and Message', /self-serve/.test(status) && buttons.join() === 'Suspend,Cancel account,Message them', { status: status, buttons: buttons });
  var tools = await p.$$eval('#acct-tools a', function (as) { return as.map(function (a) { return a.getAttribute('href'); }); });
  ok('the deeper tools are one row of links: the panel, systems & customers, a proposal, their customers, white label, the preview', tools.indexOf('#package-panel') >= 0 && tools.some(function (h) { return /admin\/tenant\.html\?org=pkg\.example/.test(h); }) && tools.some(function (h) { return /subscription-proposal\.html\?org=/.test(h); }) && tools.some(function (h) { return /wlpreview=pkg\.example/.test(h); }), tools);
  await p.waitForSelector('#pp-standing', { timeout: 10000 }).catch(function () {});
  var panel = await text(p, '#pp-standing');
  ok('the Package panel mounts on the page: the same package, price and activation ClearSky had on the Package tab', /on a subscription package/.test(panel) && /Omega Design, Omega Grid/.test(panel), panel);
  var people = await p.$$eval('#acct-detail table.ptable tbody tr', function (rs) { return rs.map(function (r) { return r.textContent.replace(/\s+/g, ' ').trim(); }); });
  ok('the people are listed with their role and their account controls', people.some(function (r) { return /pat@pkg\.example/.test(r) && /Reset link/.test(r) && /Change email/.test(r) && /Disable/.test(r); }), people);
  ok('the packaged facts in the terms send to the panel on this page, never another page', await p.$eval('#acct-detail', function (e) { return /Open the Package panel/.test(e.textContent) && !/tenant\.html/.test(e.innerHTML); }));
  await shot(p, 'account-packaged');
  /* "Look at the payment now": plan-change reconcile-now, the provider says no; then the provider says yes and the header says Active */
  await p.click('#acct-pay button:first-child');
  await until(function () { return p.$eval('#acct-pay-msg', function (e) { return /Not paid yet|Paid/.test(e.textContent); }).catch(function () { return false; }); });
  var msg1 = await text(p, '#acct-pay-msg');
  ok('"Look at the payment now" asks plan-change (reconcile-now) and says the provider does not show it paid', /Not paid yet/.test(msg1) && posts.some(function (x) { return /plan-change reconcile-now pkg\.example/.test(x); }), { msg: msg1, posts: posts });
  qbo.paid = true; sdb.seed('omega_orgs/pkg.example/billing/current', Object.assign({}, sdb.data.get('omega_orgs/pkg.example/billing/current'), { paymentCheckedAt: Date.now() - 9000 }));
  await p.click('#acct-pay button:first-child');
  await until(function () { return p.$eval('#acct-pay-msg', function (e) { return /^Paid/.test(e.textContent); }).catch(function () { return false; }); });
  ok('once the provider shows it paid, the page says so and the workspace record reads paid', /^Paid/.test(await text(p, '#acct-pay-msg')) && sdb.data.get('omega_orgs/pkg.example/billing/current').packagingState === 'paid', { msg: await text(p, '#acct-pay-msg'), state: sdb.data.get('omega_orgs/pkg.example/billing/current').packagingState });
  ok('no page errors (packaged)', !t.errs.length, t.errs);
  await ctx.close();

  /* 2. the legacy tenant: its terms, Save terms, Cancel account */
  ctx = await ctxFor(); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/admin/account.html?org=legacy.example', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#tb-amt-legacy\\.example', { timeout: 10000 }).catch(function () {});
  var lhead = await text(p, '#acct-chips'), lpay = await text(p, '#acct-pay');
  ok('a legacy tenant reads current, with its tier, add-ons, next payment and provider, and Edit the terms', /active/i.test(lhead) && /current/i.test(lhead) && /standard/.test(lpay) && /compute/.test(lpay) && new RegExp('Next payment\\s*' + LEGACY_DUE).test(lpay) && /stripe/.test(lpay) && /Edit the terms/.test(lpay), { chips: lhead, pay: lpay });
  await p.fill('#tb-amt-legacy\\.example', '1200'); await p.fill('#tb-due-legacy\\.example', '2026-11-01');
  await p.click('#acct-detail button:has-text("Save terms")');
  await until(function () { return p.$eval('#tb-msg-legacy\\.example', function (e) { return /Saved|Failed/.test(e.textContent); }).catch(function () { return false; }); });
  var w = await writes(p);
  ok('Save terms writes billing/current and its history row, the same write the console made', /^Saved/.test(await text(p, '#tb-msg-legacy\\.example')) && w.some(function (x) { return /^set omega_orgs\/legacy\.example\/billing\/current$/.test(x); }) && w.some(function (x) { return /^add omega_orgs\/legacy\.example\/billing\/current\/history\//.test(x); }), w);
  await shot(p, 'account-legacy');
  await p.click('#acct-status button.danger');
  await until(function () { return sdb.data.get('omega_orgs/legacy.example').status === 'cancelled'; });
  ok('Cancel account asks, and posts reject to tenant-approve: the status reads cancelled, the record is kept (never a delete)', t.dialogs.some(function (d) { return /nothing is deleted/.test(d); }) && posts.some(function (x) { return /tenant-approve reject legacy\.example/.test(x); }) && sdb.data.get('omega_orgs/legacy.example').status === 'cancelled' && sdb.data.has('omega_orgs/legacy.example'), { dialogs: t.dialogs, posts: posts });
  ok('no page errors (legacy)', !t.errs.length, t.errs);
  await ctx.close();
  /* the record as the endpoint left it (this harness keeps the page's Firestore and the server's apart): opened again, the page reads cancelled and offers Reactivate */
  ctx = await ctxFor(); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/admin/account.html?org=legacy.example', { waitUntil: 'domcontentloaded' });
  await until(function () { return p.$eval('#acct-chips', function (e) { return /cancelled/.test(e.textContent); }).catch(function () { return false; }); });
  ok('opened again, a cancelled account reads cancelled and offers Reactivate', /cancelled/i.test(await text(p, '#acct-chips')) && /Reactivate/.test(await text(p, '#acct-status')) && /Cancelled: sign-ins keep working/.test(await text(p, '#acct-status')), { chips: await text(p, '#acct-chips') });
  await ctx.close();

  /* 3. no record: the signup in progress */
  ctx = await ctxFor(); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/admin/account.html?org=newco.example', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#acct-signup:not([style*="none"])', { timeout: 10000 }).catch(function () {});
  await until(function () { return p.$eval('#acct-signup', function (e) { return /Omega Grid/.test(e.textContent); }).catch(function () { return false; }); });
  var su = await text(p, '#acct-signup'), suChips = await text(p, '#acct-chips');
  ok('a domain with no record shows the signup in progress: who, the stage, the system in the book\'s words and its price, the unconfirmed address', /no workspace record/i.test(suChips) && /kim@newco\.example/.test(su) && /in signup/i.test(su) && /Building their system/.test(su) && /Omega Design, Omega Grid/.test(su) && /\$750\/month/.test(su) && /email not confirmed/.test(su), su);
  var setup = await p.$eval('#acct-signup a', function (a) { return a.getAttribute('href'); });
  ok('Set up the workspace goes to the console\'s New tenant form, filled in from the request; Decline is offered', setup === '/admin/?setup=u-newco#tenants' && /Decline/.test(su), setup);
  await shot(p, 'account-signup');
  await p.click('#acct-signup button.danger');
  await until(function () { return writes(p).then(function (ws) { return ws.some(function (x) { return /^update access_requests\/u-newco$/.test(x); }); }); });
  ok('Decline writes the answer on the request row', (await writes(p)).some(function (x) { return /^update access_requests\/u-newco$/.test(x); }));
  ok('no page errors (signup)', !t.errs.length, t.errs);
  await ctx.close();

  /* 4. the console: every row opens the page; the request card reads the signup; ?setup= fills the form */
  ctx = await ctxFor(); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/admin/index.html?setup=u-newco#tenants', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#tn-req .info-card', { timeout: 15000 }).catch(function () {});
  await until(function () { return p.$$eval('#tn-body tr.clickable', function (rs) { return rs.length >= 2; }).catch(function () { return false; }); });
  var rows = await p.$$eval('#tn-body tr.clickable', function (rs) { return rs.map(function (r) { return { onclick: r.getAttribute('onclick'), link: r.querySelector('td a') && r.querySelector('td a').getAttribute('href'), open: !!Array.prototype.some.call(r.querySelectorAll('a'), function (a) { return /Open account/.test(a.textContent); }), drawer: !!r.querySelector('button[onclick*="openTenantDetail"]') }; }); });
  ok('every tenant row opens its account page (the name, the row, Open account) and none carries the old drawer', rows.length >= 2 && rows.every(function (r) { return /openAccount\(event/.test(r.onclick) && /\/admin\/account\.html\?org=/.test(r.link) && r.open && !r.drawer; }), rows);
  var card = await text(p, '#tn-req');
  ok('the Access requests card reads the signup in progress in the same words, and opens its account page', /in signup/.test(card) && /Building their system/.test(card) && /Omega Design, Omega Grid/.test(card) && /\$750\/month/.test(card) && (await p.$eval('#tn-req', function (e) { return /account\.html\?org=newco\.example/.test(e.innerHTML); })), card);
  var form = await p.evaluate(function () { return { tab: document.querySelector('.tab-btn.on') && document.querySelector('.tab-btn.on').textContent.trim(), shown: document.getElementById('tn-new').style.display !== 'none', domain: document.getElementById('nt-domain').value, vertical: document.getElementById('nt-vertical').value }; });
  ok('?setup= lands on the Tenants tab with the New tenant form filled in from the request', /Tenants/.test(form.tab) && form.shown && form.domain === 'newco.example', form);
  await shot(p, 'console-tenants');
  ok('no page errors (console)', !t.errs.length, t.errs);
  await ctx.close();

  await browser.close(); srv.close();
  console.log(fails ? '\nrender-admin-account: ' + fails + ' FAILED' : '\nrender-admin-account: every check passed. No network calls.');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
