#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Renders the Omega Logic pages in Chromium with Firebase and the
   endpoints stubbed, and checks they draw and behave. Not on the npm test
   chain — it needs the pre-installed Chromium — but it is the check that
   caught a scrolled-off column, a missing table shape and a stray status
   tag that no unit test would.

     node scripts/render-logic-pages.js            # prints a JSON line per page
     node scripts/render-logic-pages.js --shots DIR # also writes screenshots

   Every page renders against ONE sample tenant (scripts/_lib/logic-fixtures.js),
   whose answers are computed by the product's own libraries, and one state:
   what the office does on its phone (an invoice issued with a pay link, a
   task logged, a document shared) is what the customer app, the desktop CRM
   and the customer portal then read, and the other way round. The phone
   apps are checked at 390px and at a desktop width; every page at 390px
   for sideways scroll. A page error, a console error (other than a
   resource the stub does not serve) or an /api/ route the stub does not
   answer fails the run. Stripe's checkout and billing pages and a
   supplier's pay page are answered inside the browser context: nothing
   leaves the machine. */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var ROOT = path.join(__dirname, '..');
/* Playwright: $PLAYWRIGHT, else the repo's own node_modules (what CI
   installs), else the sandbox's global copy. Chromium: $CHROME, else the
   sandbox's pinned build, else whatever this Playwright downloaded. */
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-logic-pages: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-logic-pages: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || os.tmpdir()) : null; })();

require.cache[require.resolve(path.join(ROOT, 'api/_lib/admin'))] = { id: 'admin', filename: 'admin', loaded: true, exports: { httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; }, db: function () { throw new Error('no Firestore in a render check'); }, safeOrg: function (x) { return x; } } };
/* One sample Clean Cell for every check, shared with the phone sandboxes
   (scripts/_lib/logic-fixtures.js): the views are computed by the same pure
   libraries the endpoints use, and one state object carries the bench from
   the tablet check into the roaming-phone check. */
var F = require('./_lib/logic-fixtures');
var STATE = F.initialState(), V = F.views(STATE), TENANT = require('../tenants/cleancell/tenant.json'), KIT_SENDS = [];
/* what the accounting page posted, in order: the office corrections go to
   /api/logic-office (the one writer's door), the ledger sync to
   /api/logic-accounting */
var OFFICE_POSTS = [], ACC_POSTS = [];
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
/* Who the stub server says is signed in: the office, or the buyer on the
   Riverside account (the customer endpoints scope by the verified email). */
var OFFICE = 'demo@cleancell.us', BUYER = 'ops@riverside.example';
/* what /api/logic-workspaces answers: the fixture's one company, unless a
   check sets a longer list (someone who works for two companies) */
var WORKSPACES = null;
/* Stripe's two pages. The sample answers placeholders; here they become
   https addresses the browser context below answers itself, so the pages'
   own https check passes and nothing leaves the machine. */
var STRIPE = { '#subscribed': function (b) { return 'https://checkout.example.com/c/pay/cs_render_' + (b.plan || 'month'); }, '#manage': function () { return 'https://billing.example.com/p/session/render'; } };
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0], q = req.url.split('?')[1] || '', post = req.method === 'POST';
  function json(o) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  /* what an endpoint answers: an error with its status, a document as
     bytes (an attachment, as api/crm.js and api/my-files.js serve one), or
     JSON */
  function send(o) {
    if (o && o.download) { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment; filename="' + String(o.download.name).replace(/["\\\r\n]/g, '_') + '"' }); return res.end(o.download.body); }
    if (o && o.error && o.status) { res.writeHead(o.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: o.error })); }
    json(o);
  }
  function posted(fn) { var body = ''; req.on('data', function (c) { body += c; }); req.on('end', function () { var b = {}; try { b = JSON.parse(body); } catch (e) {} send(fn(b)); }); }
  function write(who) { return posted(function (b) { return F.post(STATE, u, q, b, typeof who === 'function' ? who(b) : who); }); }
  if (u === '/api/mes-scan') return posted(V.benchJson);
  if (u === '/api/customer-design' && post) return posted(V.designPost);
  /* the office's writes, and what the accounting page posted, in order (the
     corrections go to /api/logic-office, the one writer's door) */
  if (post && u === '/api/logic-office') return posted(function (b) { OFFICE_POSTS.push(b); return F.post(STATE, u, q, b, OFFICE); });
  if (post && ['/api/buyers', '/api/logic-custody', '/api/crm'].indexOf(u) >= 0) return write(OFFICE);
  if (post && ['/api/my-account', '/api/my-sites', '/api/my-orders', '/api/my-files', '/api/customer-portfolio'].indexOf(u) >= 0) return write(BUYER);
  if (post && u === '/api/po-intake') return write(function (b) { return b.office ? OFFICE : BUYER; });
  if (post && u === '/api/customer-subscribe') return posted(function (b) { var r = F.post(STATE, u, q, b, BUYER); return r && STRIPE[r.url] ? { url: STRIPE[r.url](b) } : r; });
  if (u.indexOf('/api/logic-plant') === 0) return json(V.plantJson(q));
  if (u.indexOf('/api/logic-materials') === 0) return json(/workOrder=/.test(q) ? V.soloJson() : V.materialsJson());
  if (u.indexOf('/api/logic-catalog') === 0) return json(V.catalogJson());
  if (u === '/api/logic-accounting' && post) return posted(function (b) { ACC_POSTS.push(b); if (b.action === 'sync-connect') return { url: '/logic-accounting.html?org=cleancell.us&connected=' + b.provider }; return { ok: true }; });
  if (u.indexOf('/api/logic-accounting') === 0) return json(/(^|&)format=csv(&|$)/.test(q) ? V.accountingCsv(q) : V.accountingJson(q));
  if (u.indexOf('/api/logic-office') === 0) return json(V.officeJson());
  if (u.indexOf('/api/buyers') === 0) return send(V.buyersJson(q));
  if (u.indexOf('/api/po-intake') === 0) return send(V.intakeJson(q, BUYER));
  if (u.indexOf('/api/customer-portal') === 0) return json(V.portalJson);
  if (u.indexOf('/api/my-account') === 0) return json(V.accountJson());
  if (u.indexOf('/api/my-orders') === 0) return json(V.myOrdersJson());
  if (u.indexOf('/api/my-sites') === 0) return json(V.mySitesJson());
  if (u === '/api/crm') return send(V.crmJson(q));
  if (u === '/api/my-files') return send(V.myFilesJson(q));
  if (u === '/api/customer-subscribe') return send(V.subJson(BUYER));
  if (u === '/api/customer-portfolio') return send(V.portfolioJson());
  if (u.indexOf('/api/logic-custody') === 0) { if (/template=/.test(q)) { res.writeHead(200, { 'Content-Type': 'text/csv' }); return res.end(require('../api/_lib/custody').csvTemplate()); } return json(V.custodyJson(q)); }
  if (u.indexOf('/api/logic-logistics') === 0) return json(V.logisticsJson());
  if (u === '/api/logic-kit' && post) return posted(function (b) { KIT_SENDS.unshift({ id: 'k' + KIT_SENDS.length, orgId: b.org, audience: b.audience, to: b.to, channel: b.channel || 'email', note: b.note || '', by: 'tom@clearsky-usa.com', at: new Date().toISOString() }); return { ok: true }; });
  if (u.indexOf('/api/logic-kit') === 0) { var Kit = require('../api/_lib/kit'); if (!/org=/.test(q)) return json({ owner: true, subscribers: [{ id: 'cleancell.us', name: 'Clean Cell', status: 'active', domains: [] }], guides: Kit.GUIDES, items: Kit.ITEMS }); var kit = Kit.forOrg('cleancell.us', { name: 'Clean Cell' }); return json({ owner: true, org: 'cleancell.us', name: 'Clean Cell', status: 'active', brand: F.brand, kit: kit, messages: { plant: Kit.message(kit, 'plant'), office: Kit.message(kit, 'office'), customer: Kit.message(kit, 'customer') }, sends: KIT_SENDS }); }
  if (u.indexOf('/api/customer-design') === 0) return json(V.designJson());
  if (u.indexOf('/api/app-manifest') === 0) return json(V.manifest((/app=(\w+)/.exec(q) || [])[1], TENANT));
  if (u === '/api/logic-workspaces') return json(WORKSPACES || V.workspacesJson(OFFICE));
  if (u === '/api/auth-check') return json({ google: true });
  if (u === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('window.CLEARSKY_CONFIG={firebase:{}};'); }
  if (u === '/omega-brand.js' || u === '/omega-tenant.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/* stub */'); }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';   /* Vercel clean URLs */
  if (fs.existsSync(f) && fs.statSync(f).isDirectory() && fs.existsSync(path.join(f, 'index.html'))) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
var fails = 0;
/* key order does not matter to a request body */
function same(a, b) { function norm(v) { if (v && typeof v === 'object' && !Array.isArray(v)) { var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = norm(v[k]); }); return o; } return v; } return JSON.stringify(norm(a)) === JSON.stringify(norm(b)); }
function ok(name, cond, detail) { if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); } }
(async function () {
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var b = await chromium.launch({ executablePath: CHROME });
  var ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.route('https://www.gstatic.com/**', function (r) { r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
  /* Stripe's checkout and billing pages, and a supplier's pay page: answered
     here, so a tap that leaves the app lands somewhere a check can see */
  ['https://checkout.example.com/**', 'https://billing.example.com/**', 'https://pay.example.com/**'].forEach(function (host) { ctx.route(host, function (r) { r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Away</title><h1 id="away">' + r.request().url().replace(/[<>&"]/g, '') + '</h1>' }); }); });
  await ctx.addInitScript(function () { window.firebase = { apps: [1], initializeApp: function () {}, auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('t'); } }, onAuthStateChanged: function (fn) { setTimeout(function () { fn({ uid: 'u' }); }, 0); } }; } }; });
  /* errs: an uncaught error or a console error on any page (a resource the
     stub does not serve — a web font, an icon — is not one); missing: an
     /api/ route a page called that the stub server does not answer, which
     is a page reading an endpoint the fixtures do not know */
  var errs = [], missing = [];
  /* opts.phone: the page is a phone app — it is checked at 390px first, the
     way it is used, and then at a desktop width too */
  async function check(name, url, steps, opts) {
    opts = opts || {};
    var p = await ctx.newPage(); p.on('pageerror', function (e) { errs.push(name + ': ' + e.message); });
    p.on('console', function (m) { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text().slice(0, 240)); });
    p.on('response', function (r) { var x = r.url(); if (x.indexOf(base + '/api/') === 0 && r.status() === 404 && !/json/.test(r.headers()['content-type'] || '')) missing.push(name + ': ' + x.slice(base.length).split('?')[0]); });
    if (opts.phone) await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(base + url, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(400);
    var out = await steps(p);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '.png'), fullPage: true });
    var widths = opts.phone ? [390, 1280] : [390];
    for (var wi = 0; wi < widths.length; wi++) {
      var w = widths[wi];
      await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(200);
      var hs = await p.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
      if (hs) console.log('  widest: ' + JSON.stringify(await p.evaluate(function (vw) { var worst = null; Array.prototype.forEach.call(document.querySelectorAll('body *'), function (e) { if (e.closest('.logic-nav')) return; var r = e.getBoundingClientRect(); if (r.right > vw + 2 && (!worst || r.right > worst.right)) worst = { right: Math.round(r.right), tag: e.tagName, cls: String(e.className).slice(0, 40), id: e.id }; }); return worst; }, w)));
      ok(name + ' has no horizontal scroll at ' + w + 'px', !hs);
      if (wi === 0) console.log(name + ' ' + JSON.stringify(out) + ' h-scroll@' + w + ': ' + hs);
    }
    await p.close();
  }
  /* the text of every match, whitespace folded */
  function texts(p, sel, n) { return p.$$eval(sel, function (r, max) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, max); }); }, n || 120); }
  function text(p, sel) { return p.$eval(sel, function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); }); }
  /* a small real file for an upload control */
  function pdf(name) { return { name: name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% render check\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n') }; }
  await check('materials', '/logic-materials.html?org=cleancell.us', async function (p) {
    var rows = await p.$$eval('#buy tbody tr', function (r) { return r.length; });
    var first = await p.$eval('#buy tbody tr td', function (e) { return e.textContent.trim().slice(0, 60); });
    var priced = await p.$$eval('#buy tbody tr', function (r) { return r.filter(function (x) { return /→/.test(x.textContent); }).length; });
    var spendTile = await p.$$eval('.tile', function (t) { return t.filter(function (x) { return /Purchase list value/.test(x.textContent); }).map(function (x) { return x.querySelector('b').textContent; })[0]; });
    var supCards = await p.$$eval('#suppliers .po', function (r) { return r.length; });
    var wkRows = await p.$$eval('#weeks tbody tr', function (r) { return r.length; });
    var wkFirst = await p.$$eval('#weeks td.first', function (r) { return r.map(function (x) { return x.title.slice(0, 10); }); });
    await p.click('#price-new'); await p.waitForTimeout(150);
    var priceForm = await p.evaluate(function () { return !document.getElementById('detail').hidden && !!document.getElementById('pr-cost'); });
    await p.click('#po-new'); await p.waitForTimeout(150);
    var poSup = await p.$eval('#p-supid', function (e) { return e.value; });
    var poLines = await p.$$eval('#p-lines .poline', function (r) { return r.map(function (x) { return x.querySelector('.p-on').dataset.sku + ':' + x.querySelector('.p-qty').value; }); });
    await p.click('[data-po-receive="po1"]'); await p.waitForTimeout(150);
    var lotInput = await p.$$eval('.r-lot', function (r) { return r.length; });
    await p.click('[data-sku="CC-CELL-280"]'); await p.waitForTimeout(150);
    var count = await p.evaluate(function () { return !document.getElementById('detail').hidden && document.getElementById('c-onhand').value; });
    ok('buy table lists leaf components only', rows === 4, rows);
    ok('supplier and unit cost render on the row', /EVE Energy/.test(first) && priced >= 2, first);
    ok('purchase list value tile is a dollar figure', /^\$/.test(spendTile || ''), spendTile);
    ok('supplier cards render', supCards === 2, supCards);
    ok('week table renders and marks a first short week', wkRows === 4 && wkFirst.length === 4, wkFirst);
    ok('price form opens', priceForm);
    ok('new PO prefills the preferred supplier', poSup === 'sup_eve' && poLines.length >= 1, [poSup, poLines]);
    ok('receive form has a lot input per line', lotInput === 1);
    ok('count form opens on the right row', count === '500', count);
    return { rows: rows, priced: priced, spendTile: spendTile, supCards: supCards, wkRows: wkRows, poSup: poSup, poLines: poLines };
  });
  await check('catalog', '/logic-catalog.html?org=cleancell.us', async function (p) {
    var items = await p.$$eval('#rows .item', function (r) { return r.length; });
    await p.click('#rows .item'); await p.waitForTimeout(150);
    var bomRows = await p.$$eval('.bomrow', function (r) { return r.length; });
    await p.selectOption('#kind', 'component'); await p.waitForTimeout(100);
    var comp = await p.evaluate(function () { return !document.getElementById('compfields').hidden && !!document.getElementById('safetyStock'); });
    ok('catalog lists every row', items === 8, items);
    ok('bill editor round-trips', bomRows === 3, bomRows);
    ok('component fields include safety stock', comp);
    return { items: items, bomRows: bomRows, comp: comp };
  });
  await check('manager', '/plant/manager.html?org=cleancell.us#works', async function (p) {
    await p.waitForTimeout(400);
    await p.click('[data-id="wo_1"]'); await p.waitForTimeout(500);
    var h3s = await p.$$eval('#detail h3', function (h) { return h.map(function (x) { return x.textContent; }); });
    var shortRows = await p.$$eval('#detail table tbody tr', function (r) { return r.length; });
    ok('work-order detail shows a Materials section with shortfalls', h3s.indexOf('Materials') >= 0 && shortRows >= 1, h3s);
    return { h3s: h3s, shortRows: shortRows };
  });
  await check('plant-map', '/plant/manager.html?org=cleancell.us#overview', async function (p) {
    await p.waitForTimeout(500);
    var nodes = await p.$$eval('.pmap .node', function (r) { return r.map(function (x) { return x.className + ':' + x.querySelector('h4').textContent + ':' + x.querySelector('.big').textContent; }); });
    var bars = await p.$$eval('.bars > div', function (r) { return r.length; });
    var kv = await p.$$eval('#map .logic-kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 40); }); });
    var stepsOpen = await p.$$eval('.pmap details', function (r) { return r.length; });
    ok('one node per station, in routing order, with what is there now', nodes.length === 10 && /Kitting/.test(nodes[0]) && /Module build:1/.test(nodes[1]) && /Rack assembly:1/.test(nodes[2]) && /Ready to ship:3/.test(nodes[9]), nodes);
    ok('the bottleneck is the slow bench and a held unit is marked', /slow/.test(nodes[1]) && /held/.test(nodes[2]), nodes.slice(1, 3));
    ok('eight weeks of throughput, lead time and bottleneck tiles', bars === 8 && kv.some(function (t) { return /Lead time/.test(t); }) && kv.some(function (t) { return /Bottleneck.*Module build/.test(t); }), [bars, kv]);
    ok('stations carry their steps off the bills', stepsOpen >= 1, stepsOpen);
    return { nodes: nodes.length, bars: bars, bottleneck: kv.filter(function (t) { return /Bottleneck/.test(t); })[0] };
  });
  await check('office', '/omega-logic?org=cleancell.us', async function (p) {
    await p.waitForTimeout(600);
    var flowTiles = await p.$$eval('.logic-flow a', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 30); }); });
    var cash = await p.$$eval('#cash .logic-kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 44); }); });
    var floor = await p.$$eval('#floor-kv div', function (r) { return r.length; });
    var navGroups = await p.$$eval('.logic-nav .eyebrow', function (r) { return r.map(function (x) { return x.textContent; }); });
    var signout = await p.$eval('#signout', function (e) { return e.textContent; });
    var rows = await p.$$eval('#orders button.row', function (r) { return r.length; });
    var accLinks = await p.evaluate(function () { return { cash: document.querySelectorAll('#cash a[href^="/logic-accounting.html"]').length, nav: document.querySelectorAll('.logic-nav a[href^="/logic-accounting.html"]').length }; });
    /* o2 is the Amperage situation before the fix: a placeholder bank
       reference recorded as its deposit released it to the plant; o4 is
       accepted with its deposit invoice still the supplier's to issue */
    ok('the flow strip has the five stages with counts', flowTiles.length === 5 && /Requests & quotes1/.test(flowTiles[0]) && /Awaiting deposit1/.test(flowTiles[1]) && /In build2/.test(flowTiles[2]), flowTiles);
    ok('cash flow tiles: invoiced, received, outstanding, deposits awaiting, purchase list value', cash.length === 6 && /Invoiced.*\$681,700\.00/.test(cash[0]) && /Received\$240,600\.00/.test(cash[1]) && /Outstanding\$441,100\.00/.test(cash[2]) && /Deposits awaiting\$90,225\.00/.test(cash[3]) && /Purchase list value\$/.test(cash[4]), cash);
    ok('cash flow opens accounting, and the Money group lists it', accLinks.cash === 1 && accLinks.nav === 1, accLinks);
    ok('the floor tiles filled from the plant', floor === 4, floor);
    ok('the nav runs the business in order and has no website group for a tenant', navGroups.join('|') === 'Run the business|Build|Stock & supply|Deliver|Money|Setup', navGroups);
    ok('sign out is in the header', signout === 'Sign out');
    ok('orders are listed', rows === 4, rows);
    /* the same HEX HUB as the Omega Logic app, beside a Today list */
    var hub = await p.$$eval('#hub .hx', function (r) { return r.map(function (x) { var b = x.querySelector('.bt'); return x.getAttribute('data-hub') + ':' + (b ? b.textContent : ''); }); });
    var today = await texts(p, '#today-body .need', 200);
    ok('the office home has the hex hub (Today 5: a request, an order to price, a PO to review, two follow-ups due; Customers 2 follow-ups; Money 1 invoice to issue) and a Today list with the follow-ups to open or mark done', hub.join('|') === 'today:5|sales:3|customers:2|plant:1|deliver:|stock:4|money:1' && today.some(function (t) { return /Bakersfield delivery window.*Riverside Cold Chain.*was due/.test(t) && /Open/.test(t) && /Done/.test(t); }) && today.some(function (t) { return /Ask InCharge for the site survey.*no date/.test(t); }) && today.some(function (t) { return /CC-26-4421/.test(t); }), [hub, today]);
    await p.click('#orders [data-pick="o4"]'); await p.waitForTimeout(400);
    var issueForm = await p.$$eval('#inv-no-deposit, #inv-date-deposit, #inv-pay-deposit, [data-action="invoice-issued"]', function (r) { return r.length; });
    await p.click('#orders [data-pick="o1"]'); await p.waitForTimeout(400);
    var link = await p.$$eval('#inv-link-balance', function (r) { return r.map(function (x) { return x.value; }); });
    ok('  a tenant-billed deposit is recorded as issued with an optional pay link; an issued invoice\'s pay link can be changed', issueForm === 4 && link[0] === 'https://pay.example.com/cleancell/CC-INV-1058', [issueForm, link]);
    return { flowTiles: flowTiles, cash: cash, nav: navGroups.length, hub: hub.length };
  });
  await check('settings', '/logic-settings.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(400);
    var cards = await p.$$eval('.card h3', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('settings cards cover business, plant and subscription', cards.length === 8 && cards.indexOf('Stations & tablets') >= 0 && cards.indexOf('Customer terms') >= 0, cards);
    return { cards: cards.length };
  });
  /* Accounting: the receivables ledger, and the correction the Amperage order
     needed — a placeholder "payment" voided while the plant keeps building on
     the PO — then a due date agreed on the PO, then the push to the
     workspace's own Stripe. Every figure is the server's (the fixture runs
     api/_lib/receivables.js); the page only prints them. */
  await check('accounting', '/logic-accounting.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(600);
    var PLACEHOLDER = 'REPLACE WITH THE BANK REFERENCE, or delete this payment if not yet received';
    function tiles(sel) { return p.$$eval(sel + ' [data-k]', function (r) { var o = {}; r.forEach(function (x) { o[x.getAttribute('data-k')] = x.querySelector('b').textContent.trim(); }); return o; }); }
    function rowCount() { return p.$$eval('#ledger tbody tr[data-row]', function (r) { return r.length; }); }
    var head = await p.evaluate(function () { var c = document.querySelector('.logic-nav a[aria-current="page"]'); return { rows: document.querySelectorAll('#ledger tbody tr[data-row]').length, product: document.querySelector('[data-product-name]').textContent.trim(), current: c ? c.textContent.trim() : null, sync: document.getElementById('sync').textContent, banner: !document.getElementById('banner').hidden }; });
    var t0 = await tiles('#totals'), a0 = await tiles('#aging');
    ok('accounting is an office page: Omega Logic chrome, Accounting current under Money, one row per invoice', head.rows === 4 && head.product === 'Omega Logic' && head.current === 'Accounting' && !head.banner, head);
    ok('  the totals and aging are the server\'s: invoiced, received, outstanding, overdue, on PO credit', t0.invoiced === '$591,475.00' && t0.received === '$240,600.00' && t0.outstanding === '$350,875.00' && t0.overdue === '$0.00' && t0.credit === '$0.00' && t0.toIssue === '$90,225.00' && a0['1-30'] === '$0.00' && a0.current === '$350,875.00', [t0, a0]);
    ok('  the sync card names what the deployment is missing and the connected Stripe account, never a secret', /QBO_CLIENT_ID/.test(head.sync) && /acct_1DEMOCLEANCELL/.test(head.sync) && /test mode/.test(head.sync), head.sync.slice(0, 300));
    await p.click('[data-open="o2:deposit"]'); await p.waitForTimeout(200);
    var dr = await p.evaluate(function () { var d = document.getElementById('drawer'); return { open: !d.hidden, pay: d.querySelectorAll('a.paylink[href^="https://invoice.stripe.com/"]').length, voids: d.querySelectorAll('[data-act="void"]').length, push: d.querySelectorAll('[data-act="push"]').length, text: d.textContent.replace(/\s+/g, ' ') }; });
    ok('  an invoice opens in the drawer with its payment page, its payments and a push to Stripe', dr.open && dr.pay === 1 && dr.voids === 1 && dr.push === 1 && dr.text.indexOf(PLACEHOLDER) >= 0, [dr.open, dr.pay, dr.voids, dr.push, dr.text.slice(0, 240)]);
    /* void the placeholder: the order is in the plant on it, so the office must choose */
    await p.click('#drawer [data-act="void"]'); await p.waitForTimeout(150);
    var dv = await p.evaluate(function () { return { open: !document.getElementById('dlg-void').hidden, choice: !document.getElementById('void-choice').hidden, radios: document.querySelectorAll('#dlg-void input[name="after"]').length, go: document.getElementById('void-go').disabled, focus: document.activeElement && document.activeElement.id, summary: document.getElementById('void-summary').textContent }; });
    ok('  voiding a payment the order was released on asks: keep building on the PO, or hold', dv.open && dv.choice && dv.radios === 2 && dv.go === true && dv.focus === 'void-reason' && /USD 90,225\.00 · 2026-08-22 · REPLACE WITH/.test(dv.summary), dv);
    var REASON = 'Recorded from the intake template; the money has not arrived';
    await p.fill('#void-reason', REASON); await p.waitForTimeout(50);
    var stillOff = await p.$eval('#void-go', function (e) { return e.disabled; });
    await p.check('#after-keep'); await p.waitForTimeout(50);
    var dv2 = await p.evaluate(function () { return { po: document.getElementById('void-po').value, go: document.getElementById('void-go').disabled }; });
    ok('  a reason is not enough until the choice is made; keep building carries the order\'s PO', stillOff === true && dv2.po === 'SS-PO-5521' && dv2.go === false, [stillOff, dv2]);
    await p.click('#void-go'); await p.waitForTimeout(700);
    var vpost = OFFICE_POSTS[OFFICE_POSTS.length - 1];
    ok('  the void goes to the one writer with the reason, the choice and the PO', same(vpost, { action: 'payment-void', org: 'cleancell.us', orderId: 'o2', stage: 'deposit', bankReference: PLACEHOLDER, reason: REASON, keepBuilding: true, poNumber: 'SS-PO-5521' }), vpost);
    var after = await p.evaluate(function () { var tr = document.querySelector('#ledger tr[data-row="o2:deposit"]'); return { onpo: tr.querySelectorAll('.tag.onpo').length, st: tr.querySelector('.st').textContent, voidedTag: tr.querySelectorAll('.tag.voided').length, dlg: !document.getElementById('dlg-void').hidden, drawer: !document.getElementById('drawer').hidden, status: document.getElementById('status').textContent }; });
    var t1 = await tiles('#totals'), a1 = await tiles('#aging');
    ok('  after the void: received back to what really arrived, the deposit open and flagged released on PO', after.onpo === 1 && after.st === 'awaiting payment' && after.voidedTag === 1 && !after.dlg && after.drawer && /keeps building/.test(after.status) && t1.received === '$150,375.00' && t1.outstanding === '$441,100.00' && t1.overdue === '$90,225.00' && t1.credit === '$90,225.00' && a1['31-60'] === '$90,225.00', [after, t1, a1]);
    await p.click('[data-open="o2:deposit"]'); await p.waitForTimeout(200);
    var dr2 = await p.evaluate(function () { var d = document.getElementById('drawer'), s = d.querySelector('s.voided'); return { struck: s ? s.textContent : '', voids: d.querySelectorAll('[data-act="void"]').length, warn: (d.querySelector('.warn') || {}).textContent || '', release: d.querySelectorAll('[data-act="release"]').length }; });
    ok('  the voided payment stays on the invoice, struck through, and cannot be voided twice; the credit release says who and why', dr2.struck.indexOf('REPLACE WITH THE BANK REFERENCE') >= 0 && dr2.voids === 0 && /Released on PO SS-PO-5521 by demo@cleancell\.us/.test(dr2.warn) && /not yet received/.test(dr2.warn) && dr2.release === 0, dr2);
    /* the customer agreed net 30 on the PO: move the due date, with a reason */
    await p.click('#drawer [data-act="edit"]'); await p.waitForTimeout(150);
    var ed = await p.evaluate(function () { return { open: !document.getElementById('dlg-edit').hidden, number: document.getElementById('ed-number').value, issued: document.getElementById('ed-issued').value, due: document.getElementById('ed-due').value, hint: document.getElementById('ed-due-hint').textContent }; });
    ok('  the edit dialog opens on the invoice as issued, the due date following the terms', ed.open && ed.number === 'SS-1042' && ed.issued === '2026-08-20' && ed.due === '' && /2026-08-20/.test(ed.hint), ed);
    var EREASON = 'Customer agreed net 30 on the PO';
    await p.fill('#ed-due', '2026-10-15'); await p.fill('#ed-reason', EREASON); await p.waitForTimeout(50); await p.click('#ed-go'); await p.waitForTimeout(700);
    var epost = OFFICE_POSTS[OFFICE_POSTS.length - 1];
    ok('  only what changed is posted', same(epost, { action: 'invoice-edit', org: 'cleancell.us', orderId: 'o2', stage: 'deposit', dueAt: '2026-10-15', reason: EREASON }), epost);
    var ed2 = await p.evaluate(function () { var tr = document.querySelector('#ledger tr[data-row="o2:deposit"]'), d = document.getElementById('drawer'); return { due: tr.querySelector('td[data-k="due"]').textContent.trim(), overdue: tr.querySelectorAll('.tag.overdue').length, history: (d.querySelector('.edits') || {}).textContent || '' }; });
    var t2 = await tiles('#totals');
    ok('  the new due date takes it out of overdue, and the change is in the invoice\'s history', ed2.due === '2026-10-15' && ed2.overdue === 0 && t2.overdue === '$0.00' && /due terms → 2026-10-15/.test(ed2.history) && /net 30/.test(ed2.history), [ed2, t2.overdue]);
    await p.click('#drawer [data-act="push"]'); await p.waitForTimeout(600);
    var apost = ACC_POSTS[ACC_POSTS.length - 1];
    ok('  push to Stripe goes to the ledger sync, naming the invoice', same(apost, { action: 'sync-push', org: 'cleancell.us', orderId: 'o2', stage: 'deposit' }), apost);
    await p.click('#drawer-close'); await p.waitForTimeout(100);
    await p.selectOption('#f-customer', 'email:buy@sierra.example'); await p.waitForTimeout(500);
    var one = await rowCount(), custOpts = await p.$$eval('#f-customer option', function (r) { return r.map(function (x) { return x.value; }); });
    await p.selectOption('#f-customer', ''); await p.waitForTimeout(500);
    var all = await rowCount();
    ok('  the customer filter is by ACCOUNT (or billed email), applied by the server', one === 1 && all === 4 && custOpts.indexOf('account:company_riverside') >= 0 && custOpts.indexOf('email:buy@sierra.example') >= 0, [one, all, custOpts]);
    var dlWait = p.waitForEvent('download'); await p.click('#csv'); var dl = await dlWait;
    var csvFirst = fs.readFileSync(await dl.path(), 'utf8').split('\r\n')[0];
    ok('  CSV export is the server\'s file, named for the workspace and the day', dl.suggestedFilename() === 'receivables-cleancell.us-2026-09-21.csv' && csvFirst === 'Order,PO,Customer,Customer key,Stage,Invoice,Issued,Due,Amount USD,Received USD,Balance USD,Status,Days overdue,Aging,Released on PO,Payments', [dl.suggestedFilename(), csvFirst]);
    var closed = await p.evaluate(function () { return document.getElementById('drawer').hidden && Array.prototype.every.call(document.querySelectorAll('.logic-dialog'), function (d) { return d.hidden; }); });
    await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(200);
    var hs = await p.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
    await p.setViewportSize({ width: 1280, height: 900 });
    ok('  with the drawer and dialogs closed, the accounting page has no horizontal scroll at 390px', closed && !hs, [closed, hs]);
    /* the dashboard reads the same recomputed invoices: the voided money is out of Received */
    await p.goto(base + '/omega-logic?org=cleancell.us', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
    var cash = await p.$$eval('#cash .logic-kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 44); }); });
    var tagsOnPo = await p.$$eval('#orders button.row .tag', function (r) { return r.map(function (x) { return x.textContent; }).filter(function (t) { return t === 'Released on PO'; }).length; });
    var build = await p.$$eval('.logic-flow a', function (r) { return r[2] ? r[2].textContent.replace(/\s+/g, ' ').trim() : ''; });
    ok('  the dashboard agrees: received excludes the voided payment, the order shows released on PO', /Received\$150,375\.00/.test(cash[1]) && /Outstanding\$531,325\.00/.test(cash[2]) && tagsOnPo === 1 && /1 on PO/.test(build), [cash, tagsOnPo, build]);
    return { rows: head.rows, received: t1.received, credit: t1.credit, csv: dl.suggestedFilename(), build: build };
  });
  await check('inventory', '/logic-inventory.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(600);
    var finished = await p.$$eval('#finished tbody tr', function (r) { return r.map(function (x) { return Array.prototype.map.call(x.cells, function (c) { return c.textContent.trim(); }).join(' '); }); });
    var assign = await p.$$eval('[data-assign]', function (r) { return r.length; });
    var opts = await p.$$eval('select[data-for] option', function (r) { return r.map(function (x) { return x.textContent; }); });
    var parts = await p.$$eval('#parts tbody tr', function (r) { return r.length; });
    ok('finished units are counted by product: 2 available, 1 assigned, 3 building', /CC-C215 2 1 3/.test(finished[0] || ''), finished);
    ok('each available unit can be assigned to an order that needs the product', assign === 2 && opts.some(function (o) { return /CC-26-4419/.test(o); }), [assign, opts]);
    ok('components on the shelf come from the plan', parts >= 4, parts);
    return { finished: finished, assign: assign, parts: parts };
  });
  await check('bench', '/plant/station.html', async function (p) {
    await p.fill('#p-id', 'st-rack'); await p.fill('#p-token', 'tok'); await p.click('#p-go'); await p.waitForTimeout(300);
    var paired = await p.evaluate(function () { return !document.getElementById('pair').classList.contains('on') && document.getElementById('h-station').textContent; });
    await p.fill('#scan', 'https://plant.cleancell.us/u/CC418-26-44190'); await p.press('#scan', 'Enter'); await p.waitForTimeout(400);
    var steps = await p.$$eval('#work .step', function (r) { return r.map(function (x) { return x.className + ':' + x.querySelector('h3').textContent.trim().slice(0, 40); }); });
    var buttons = await p.$$eval('#work .b', function (r) { return r.map(function (x) { return x.textContent.trim(); }); });
    /* scan a part label: the module SKU */
    await p.fill('#scan', 'CC-MOD-52'); await p.press('#scan', 'Enter'); await p.waitForTimeout(400);
    var afterIssue = await p.$$eval('#work .step', function (r) { return r.map(function (x) { return x.className; }); });
    var verdict = await p.$eval('#say', function (e) { return e.textContent; });
    /* type a lot and tap Issue on the harness */
    await p.fill('.lot[data-sku="CC-HARN"]', 'LOT-42'); await p.click('[data-issue="CC-HARN"]'); await p.waitForTimeout(400);
    var lotShown = await p.$$eval('#work .part small', function (r) { return r.map(function (x) { return x.textContent; }).join('|'); });
    await p.click('[data-done]'); await p.waitForTimeout(400);
    var foot = await p.$eval('.wfoot', function (e) { return e.className + ':' + e.textContent; });
    ok('bench pairs from the describe response', /Rack assembly/.test(paired || ''), paired);
    ok('a unit scan shows this bench\'s steps, first one current', steps.length === 3 && /now/.test(steps[0]) && /Fit modules/.test(steps[0]), steps);
    ok('  with an Issue button per part and a Done button for the check', buttons.filter(function (b) { return /^Issue/.test(b); }).length === 2 && buttons.some(function (b) { return /^Done/.test(b); }), buttons);
    ok('scanning a part label issues it and completes the step', /done/.test(afterIssue[0]) && /now/.test(afterIssue[1]) && /Issued 2 ea/.test(verdict), [afterIssue, verdict]);
    ok('a typed lot travels with the issue', /lot LOT-42/.test(lotShown), lotShown);
    ok('after the check the bench is complete and names the next bench', /ok/.test(foot) && /Enclosure/.test(foot), foot);
    return { paired: paired, steps: steps.length, verdict: verdict, foot: foot.slice(0, 60) };
  });
  await check('phone', '/plant/station.html', async function (p) {
    await p.evaluate(function () { localStorage.clear(); }); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
    await p.fill('#p-id', 'st-phone'); await p.fill('#p-token', 'tok'); await p.click('#p-go'); await p.waitForTimeout(300);
    var pick = await p.$$eval('#pick option', function (r) { return r.map(function (x) { return x.value; }); });
    var pickShown = await p.$eval('#pick', function (e) { return !e.hidden; });
    await p.fill('#scan', 'CC418-26-44190'); await p.press('#scan', 'Enter'); await p.waitForTimeout(300);
    var refused = await p.$eval('#say', function (e) { return e.textContent; });
    await p.selectOption('#pick', 'rack'); await p.fill('#scan', 'CC418-26-44190'); await p.press('#scan', 'Enter'); await p.waitForTimeout(400);
    var steps = await p.$$eval('#work .step', function (r) { return r.length; });
    ok('a roaming phone shows a bench picker without the machine station', pickShown && pick.length === 10 && pick.indexOf('eol') < 0, pick);
    ok('  and refuses to scan until a bench is chosen', /Choose the bench/.test(refused), refused);
    ok('  then scans like a bench', steps === 3, steps);
    return { pick: pick.length, refused: refused, steps: steps };
  });
  await check('app', '/plant/app?org=cleancell.us', async function (p) {
    await p.waitForTimeout(500);
    var cards = await p.$$eval('#view .card', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 70); }); });
    var manifest = await p.evaluate(function () { return { m: document.querySelector('link[rel="manifest"]').getAttribute('href'), i: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), t: document.querySelector('meta[name="theme-color"]').content }; });
    ok('the plant app is Omega Logic\'s: ClearSky\'s manifest, icon and colour', /app-manifest\?org=cleancell\.us/.test(manifest.m) && /icons\/omega-logic-180/.test(manifest.i) && manifest.t === '#0C1824', manifest);
    var tabs = await p.$$eval('#nav button', function (r) { return r.map(function (x) { return x.textContent.trim().replace(/^[^A-Za-z]+/, ''); }); });
    await p.click('[data-wo="wo_1"]'); await p.waitForTimeout(500);
    var units = await p.$$eval('#view .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 80); }); });
    var h1 = await p.$eval('#view h1', function (e) { return e.textContent; });
    await p.click('[data-tab="quality"]'); await p.waitForTimeout(300);
    var held = await p.$$eval('#view .unit', function (r) { return r.length; });
    await p.click('[data-tab="stock"]'); await p.waitForTimeout(500);
    var stock = await p.$$eval('#view .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60); }); });
    ok('the app lists the open work order as a card with progress', cards.length === 1 && /CC-26-4419/.test(cards[0]), cards);
    ok('  five tabs at the bottom, Today first', tabs.join('|') === 'Today|Work|Scan|Stock|Quality', tabs);
    ok('  a work order shows its units with station and step progress', /CC-26-4419/.test(h1) && units.length >= 2 && /1 of 3 steps/.test(units.join(' ')), units);
    ok('  quality lists the held unit', held === 1, held);
    ok('  stock counts finished units and short parts', stock.length >= 5 && /CC-C215.*2 available/.test(stock[0]) && /on hand/.test(stock[1]), stock);
    return { cards: cards.length, tabs: tabs.length, units: units.length, held: held };
  });
  await check('office-app', '/office/app?org=cleancell.us', async function (p) {
    await p.waitForTimeout(1000);
    var manifest = await p.evaluate(function () { return { m: document.querySelector('link[rel="manifest"]').getAttribute('href'), i: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href') }; });
    var tabs = await p.$$eval('#nav button', function (r) { return r.map(function (x) { return x.textContent.trim().replace(/^[^A-Za-z]+/, ''); }); });
    var kv = await texts(p, '#today-kv div');
    var needs = await texts(p, '#today-needs .unit', 160);
    var head = await p.evaluate(function () { return { b: document.querySelector('[data-product-name]').textContent, w: document.getElementById('who').textContent }; });
    ok('the office app is Omega Logic, ClearSky\'s: one manifest with no company in it, its icon, the workspace shown inside', manifest.m === '/office/app.webmanifest' && /icons\/omega-logic-180/.test(manifest.i) && head.b === 'Omega Logic' && /^Clean Cell/.test(head.w), [manifest, head]);
    ok('  five tabs, QuickBooks-style: Home, Orders, Customers, Sites, Menu', tabs.join('|') === 'Home|Orders|Customers|Sites|Menu', tabs);
    /* the HEX HUB: Today in the middle, the six hubs of the business around
       it, a badge where a person is needed — counted from the sample */
    var hub = await p.$$eval('#hubs .hx', function (r) { return r.map(function (x) { var b = x.querySelector('.bt'); return x.getAttribute('data-hub') + ':' + x.querySelector('.lb').textContent + ':' + (b ? b.textContent : '') + (x.classList.contains('center') ? ':centre' : ''); }); });
    var tiles = await p.$$eval('#hub-panels [data-hpanel]', function (r) { return r.map(function (x) { return x.getAttribute('data-hpanel'); }); });
    ok('  Home is the hex hub: Today in the centre (5 need a person: a request, an order to price, a PO to review, two follow-ups due), Sales · Customers · Plant · Deliver · Stock · Money around it, a panel tile per hub under it', hub.length === 7 && hub[0] === 'today:Today:5:centre' && hub.slice(1).map(function (h) { return h.split(':')[1]; }).join('|') === 'Sales|Customers|Plant|Deliver|Stock|Money' && hub[2] === 'customers:Customers:3' && hub[6] === 'money:Money:1' && tiles.join('|') === 'sales|customers|plant|deliver|stock|money', [hub, tiles]);
    ok('  today counts the stages and lists who needs a person: the follow-ups due (an overdue call, an undated task), the open request and the unpriced order', kv.length === 4 && /To price\s*1/.test(kv[0]) && needs.some(function (t) { return /Bakersfield delivery window.*Riverside Cold Chain.*was due/.test(t); }) && needs.some(function (t) { return /Ask InCharge for the site survey.*no date/.test(t); }) && needs.some(function (t) { return /CC-26-4419.*1 customer request/.test(t); }) && needs.some(function (t) { return /CC-26-4421.*price/.test(t); }), [kv, needs]);
    await p.click('#hubs .hx[data-hub="plant"]'); await p.waitForTimeout(300);
    var plantOpen = await text(p, '#hub-open');
    await p.click('#hubs .hx[data-hub="money"]'); await p.waitForTimeout(300);
    var moneyOpen = await text(p, '#hub-open');
    ok('  a hub opens its panel under the hub: what is in it now, then where to work it', /1 open work order/.test(plantOpen) && /Work it/.test(plantOpen) && /Plant app/.test(plantOpen) && /Bench scan station/.test(plantOpen) && /CC-26-4422 · deposit/.test(moneyOpen) && /to issue/.test(moneyOpen) && /Invoices/.test(moneyOpen), [plantOpen.slice(0, 200), moneyOpen.slice(0, 200)]);
    await p.click('#today-needs [data-fu-today="ac_task"]'); await p.waitForTimeout(500);
    var doneSt = await text(p, '#status'), after = await p.$$eval('#today-needs [data-fu-today]', function (r) { return r.map(function (x) { return x.getAttribute('data-fu-today'); }); });
    var badge = await p.$eval('#hubs .hx[data-hub="today"] .bt', function (e) { return e.textContent; });
    ok('  a follow-up is marked done on Today and leaves it', /off Today/.test(doneSt) && after.join('|') === 'ac_call' && badge === '4', [doneSt, after, badge]);
    await p.click('[data-tab="orders"]'); await p.waitForTimeout(300);
    var cards = await p.$$eval('#view .card', function (r) { return r.length; });
    await p.click('[data-order="o1"]'); await p.waitForTimeout(300);
    var h1 = await p.$eval('#view h1', function (e) { return e.textContent; });
    var answer = await p.$$eval('[data-resolve]', function (r) { return r.length; });
    var money = await texts(p, '#view .kv div');
    var payLink = await p.$$eval('#view a.act', function (r) { return r.map(function (x) { return x.getAttribute('href'); }); });
    ok('  orders are listed and an order opens with its money, build, the request to answer, and the supplier\'s pay link on the open invoice', cards === 4 && /CC-26-4419/.test(h1) && answer === 1 && money.some(function (t) { return /Outstanding\s*\$350,875\.00/.test(t); }) && money.some(function (t) { return /Built/.test(t); }) && payLink.indexOf('https://pay.example.com/cleancell/CC-INV-1058') >= 0 && await p.$$eval('[data-link-save="balance"]', function (r) { return r.length === 1; }), [cards, h1, answer, money, payLink]);
    /* Money: the invoices, grouped; the one to issue is issued from here
       with the supplier's own pay link — a javascript: one is refused first */
    await p.click('[data-tab="menu"]'); await p.waitForTimeout(300); await p.click('.freq [data-go="money"]'); await p.waitForTimeout(300);
    var groups = await texts(p, '#view h2'), links = await p.$$eval('#view a[href^="https://"]', function (r) { return r.map(function (x) { return x.getAttribute('href'); }); });
    /* two open: the balance with the supplier's pay link, and the deposit
       the accounting check voided and moved to 2026-10-15 (the render checks
       share one sample) with its Stripe page */
    ok('  Money groups the invoices: one to issue (tenant-billed, not on the supplier\'s paper yet), none overdue, two open with their pay links', groups.join('|') === 'To issue · 1|Overdue · 0|Open · 2' && links.indexOf('https://pay.example.com/cleancell/CC-INV-1058') >= 0, [groups, links]);
    await p.click('#view .inv [data-order="o4"]'); await p.waitForTimeout(300);
    await p.fill('[data-inv-no="deposit"]', 'CC-INV-1070'); await p.fill('[data-inv-pay="deposit"]', 'javascript:alert(1)'); await p.click('[data-issue="deposit"]'); await p.waitForTimeout(300);
    var refused = await text(p, '#status');
    await p.fill('[data-inv-pay="deposit"]', 'https://pay.example.com/cleancell/CC-INV-1070'); await p.click('[data-issue="deposit"]'); await p.waitForTimeout(900);
    var linkNow = await p.$$eval('[data-link-url="deposit"]', function (r) { return r.map(function (x) { return x.value; }); });
    await p.click('#back'); await p.waitForTimeout(300);
    var groups2 = await texts(p, '#view h2');
    ok('  the deposit invoice is recorded with its pay link (a javascript: link refused first) and moves from To issue to Open', /pay link must be a full https/.test(refused) && linkNow[0] === 'https://pay.example.com/cleancell/CC-INV-1070' && groups2.join('|') === 'To issue · 0|Overdue · 0|Open · 3', [refused, linkNow, groups2]);
    await p.click('[data-tab="menu"]'); await p.waitForTimeout(300); await p.click('.freq [data-go="pos"]'); await p.waitForTimeout(500);
    var companies = await p.$$eval('#company option', function (r) { return r.length; });
    await p.selectOption('#company', 'company_riverside'); await p.waitForTimeout(500);
    await p.fill('#bulk-text', 'INC-4471, CC-C215, 4, InCharge Bakersfield, 1200 Depot Rd, Bakersfield, CA, 93307, 2026-11-15, dock B\nINC-4472, CC-C215, 2, InCharge Fresno, 88 Rail Ave, Fresno, CA, 93706');
    var preview = await p.$eval('#bulk-preview', function (e) { return e.textContent; });
    var contact = await p.$eval('#bulk-contact', function (e) { return e.value; });
    var queue = await texts(p, '#company-body .unit', 60);
    ok('  a stack of POs is keyed in for a company: contact chosen, lines parsed, the uploaded PO under review listed', companies === 3 && contact === 'ops@riverside.example' && preview === '2 purchase orders, 2 lines' && queue.some(function (t) { return /RCC-2211.*po review/.test(t); }), [companies, contact, preview, queue]);
    await p.click('[data-tab="customers"]'); await p.waitForTimeout(400);
    var custCards = await texts(p, '#view .card', 200);
    ok('  customers are ACCOUNTS: each card is a company with its people, and one asking to join is flagged', custCards.length === 2 && /^InCharge Energy/.test(custCards[0]) && /nobody on it yet/.test(custCards[0]) && /^Riverside Cold Chain/.test(custCards[1]) && /3 people/.test(custCards[1]) && /1 asking to join/.test(custCards[1]) && /40% deposit/.test(custCards[1]), custCards);
    await p.click('[data-cust="company_incharge"]'); await p.waitForTimeout(400);
    var emptyAcct = await p.$eval('#view h1', function (e) { return e.textContent; });
    ok('  a company with nobody on it yet still opens, to add its first person', emptyAcct === 'InCharge Energy', emptyAcct);
    await p.click('#back'); await p.waitForTimeout(300);
    /* the CRM: one ACCOUNT in sections, QuickBooks' customer hub */
    await p.click('[data-cust="company_riverside"]'); await p.waitForTimeout(500);
    var secs = await p.$$eval('#cust-seg [data-sec]', function (r) { return r.map(function (x) { return x.firstChild.textContent.trim(); }); });
    var custKv = await texts(p, '#view .kv div');
    var dep = await p.$eval('#t-dep', function (e) { return e.value; });
    var ovH2 = await texts(p, '#cust-body h2');
    var appLink = await p.$eval('#view', function (e) { return /\/portals\/customer\/app\?org=cleancell\.us/.test(e.textContent); });
    ok('  an account opens in seven sections; the overview has its balance across its people, the follow-ups, the latest on the timeline, the terms and the customer app to send', secs.join('|') === 'Overview|People|Activity|Documents|Orders|Sites|Timeline' && custKv.some(function (t) { return /Balance\s*\$350,875\.00/.test(t); }) && ovH2.indexOf('Follow-ups · 2 open') >= 0 && ovH2.indexOf('Latest') >= 0 && dep === '40' && appLink, [secs, custKv, ovH2, dep, appLink]);
    await p.click('#cust-seg [data-sec="people"]'); await p.waitForTimeout(300);
    var people = await texts(p, '#cust-body h2');
    var approve = await p.$$eval('[data-pact="active"]', function (r) { return r.map(function (x) { return x.getAttribute('data-email'); }); });
    var contacts = await texts(p, '#cust-body .rq b', 60);
    ok('  People: the logins on the account (one asking to join) and the contacts who never log in, the primary first', people.indexOf('People · 3') >= 0 && people.indexOf('Contacts · 2') >= 0 && approve.join('|') === 'new.hire@riverside.example' && contacts.join('|') === 'Dana Ops|Pat Nguyen', [people, approve, contacts]);
    await p.click('[data-pact="active"]'); await p.waitForTimeout(700);
    var approved = await p.$$eval('[data-pact="active"]', function (r) { return r.length; });
    ok('  approving the request lets them in', approved === 0, approved);
    await p.click('#cust-seg [data-sec="activity"]'); await p.waitForTimeout(300);
    var actBefore = await texts(p, '#cust-body h2');
    await p.click('[data-atype="task"]'); await p.fill('#lg-subject', 'Send the commissioning checklist'); await p.selectOption('#lg-contact', 'ct_dana'); await p.selectOption('#lg-order', 'o1');
    await p.click('#lg-go'); await p.waitForTimeout(700);
    var logged = await text(p, '#status'), actAfter = await texts(p, '#cust-body h2'), firstAct = await text(p, '#cust-body .rq');
    ok('  Activity: log a task with a contact and an order; it is on Today until done, with a Done button here', actBefore.indexOf('Activity · 4') >= 0 && /Task logged; it is on Today until done/.test(logged) && actAfter.indexOf('Follow-ups · 3 open') >= 0 && actAfter.indexOf('Activity · 5') >= 0 && /Send the commissioning checklist/.test(firstAct) && /with Dana Ops/.test(firstAct) && /CC-26-4419/.test(firstAct) && /Done/.test(firstAct), [actBefore, logged, actAfter, firstAct.slice(0, 200)]);
    await p.click('#cust-seg [data-sec="documents"]'); await p.waitForTimeout(300);
    var docs = await texts(p, '#cust-body .rq', 200);
    await p.setInputFiles('#doc-file', pdf('Commissioning-plan.pdf')); await p.selectOption('#doc-cat', 'drawing'); await p.fill('#doc-note', 'Pad 1 and 2'); await p.check('#doc-share');
    await p.click('#doc-go'); await p.waitForTimeout(900);
    var upSt = await text(p, '#status'), docH2 = await texts(p, '#cust-body h2');
    var dl = p.waitForEvent('download', { timeout: 5000 }).catch(function () { return null; });
    await p.click('[data-doc-get="f_msa"]'); var got = await dl; await p.waitForTimeout(300);
    var saveSt = await text(p, '#status');
    ok('  Documents: the office\'s (shared or not) and the customer\'s upload; a phone upload is shared with the customer; a document downloads through the endpoint', docs.length === 3 && docs.some(function (t) { return /Bakersfield-site-survey\.pdf.*from the customer.*theirs/.test(t); }) && docs.some(function (t) { return /Riverside-pricing-worksheet\.xlsx.*office only/.test(t); }) && docs.some(function (t) { return /Riverside-MSA-2026\.pdf.*shared/.test(t); }) && /The customer sees it in their app/.test(upSt) && docH2.indexOf('Documents · 4') >= 0 && got && got.suggestedFilename() === 'Riverside-MSA-2026.pdf' && /Saved Riverside-MSA-2026\.pdf/.test(saveSt), [docs, upSt, docH2, got && got.suggestedFilename(), saveSt]);
    await p.click('#cust-seg [data-sec="timeline"]'); await p.waitForTimeout(300);
    var tl = await p.$$eval('#cust-body .tl .tk', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('  Timeline: everything on the account, newest first — the upload and the task just made, the approval, invoices issued and paid, the PO received, the design trial', tl.length >= 20 && tl[0] === 'file uploaded' && tl.indexOf('activity task') >= 0 && tl.indexOf('person approved') >= 0 && tl.indexOf('invoice issued') >= 0 && tl.indexOf('invoice paid') >= 0 && tl.indexOf('po received') >= 0 && tl.indexOf('design trial') >= 0, tl);
    await p.click('#cust-seg [data-sec="sites"]'); await p.waitForTimeout(700);
    var custSites = await text(p, '#cust-sites');
    ok('  Sites: the account\'s sites and shipped units', /Riverside yard/.test(custSites) && /CC418-26-44192/.test(custSites), custSites.slice(0, 200));
    await p.click('#cust-seg [data-sec="orders"]'); await p.waitForTimeout(300); await p.click('#c-po'); await p.waitForTimeout(600);
    var poFor = await p.$eval('#company', function (e) { return e.value; });
    await p.click('#back'); await p.waitForTimeout(600);
    var backTo = await p.$eval('#view h1', function (e) { return e.textContent; }), backSec = await p.$eval('#cust-seg [aria-pressed="true"]', function (e) { return e.getAttribute('data-sec'); });
    ok('  Enter a PO opens the PO sheet with the company chosen, and Back returns to the account', poFor === 'company_riverside' && backTo === 'Riverside Cold Chain' && backSec === 'orders', [poFor, backTo, backSec]);
    await p.click('[data-tab="menu"]'); await p.waitForTimeout(300); await p.click('.freq [data-go="stock"]'); await p.waitForTimeout(500);
    var stock = await texts(p, '#stock-body .unit', 70);
    var assign = await p.$$eval('[data-assign]', function (r) { return r.length; });
    var opts = await p.$$eval('select[data-for] option', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('  stock counts finished units, offers to assign each available one to the order that needs it, and lists what is short', /CC-C215.*2 available/.test(stock[0]) && assign === 2 && opts.some(function (o) { return /CC-26-4419/.test(o); }) && stock.some(function (t) { return /on hand/.test(t); }) && stock.some(function (t) { return /PO-1001/.test(t); }), [stock, assign, opts]);
    await p.click('[data-tab="menu"]'); await p.waitForTimeout(300);
    var freq = await p.$$eval('.freq > *', function (r) { return r.map(function (x) { return x.textContent.replace(/[^A-Za-z ]/g, '').trim(); }); });
    var panels = await p.$$eval('[data-panel]', function (r) { return r.map(function (x) { return x.textContent.replace(/^[^A-Za-z]+/, '').trim(); }); });
    await p.click('[data-panel="deliver"]'); await p.waitForTimeout(200);
    var rows = await p.$$eval('.rows b', function (r) { return r.map(function (x) { return x.textContent; }); });
    await p.fill('#qsearch', 'register'); await p.waitForTimeout(200);
    var hits = await p.$$eval('.rows b', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('  Menu holds every function the QuickBooks way: frequently used, panels that open to their list, search', freq.join('|') === 'Orders|PO loads|Customers|Sites|Stock|Invoices|Register|Plant' && panels.join('|') === 'Sales|Customers|Plant|Deliver|Stock|Money|Setup|Help & guides' && rows.join('|') === 'Sites & custody|Fleet register|Shipping & receiving|Sites & imports' && hits.join('|') === 'Fleet register', [freq, panels, rows, hits]);
    await p.click('[data-tab="sites"]'); await p.waitForTimeout(600);
    var h2s = await texts(p, '#sites-body h2');
    var loadOpts = await p.$$eval('#rc-load option', function (r) { return r.map(function (x) { return x.textContent; }); });
    await p.fill('#su-serial', 'CC418-26-44192'); await p.click('#su-go'); await p.waitForTimeout(500);
    var su = await text(p, '#su-body');
    var moves = await p.$$eval('#su-body [data-move]', function (r) { return r.map(function (x) { return x.getAttribute('data-move'); }); });
    ok('  the Sites tab mirrors the desktop: the customer says, receive a load, unit passport, sites, and a unit opens with only the moves that apply', /^The customer says/.test(h2s[0]) && h2s.some(function (t) { return /Receive a load/.test(t); }) && h2s.some(function (t) { return /Unit passport/.test(t); }) && h2s.some(function (t) { return /^Sites · 1/.test(t); }) && loadOpts.some(function (t) { return /LOAD-1 · 1 unit/.test(t); }) && /in transit/.test(su) && /going to|no site assigned/.test(su) && moves.join('|') === 'receive', [h2s, loadOpts, su.slice(0, 200), moves]);
    return { tabs: tabs.length, hub: hub.length, cards: cards, companies: companies, preview: preview, tl: tl.length };
  }, { phone: true });
  /* The header as the app guide draws it, for someone who works for two
     companies: Omega Logic over "Company · email", a small Switch on that
     line, a round ↻ and a Sign out pill — nothing past the right edge of a
     360, 390 or 430px phone, however long the email. Switch opens Omega
     Logic's "which company", with the way back. */
  WORKSPACES = { email: 'tom@clearsky-usa.com', owner: false, workspaces: [{ orgId: 'cleancell.us', name: 'Clean Cell', role: 'admin', status: 'active' }, { orgId: 'fenecon.com', name: 'FENECON', role: 'member', status: 'active' }] };
  await check('office-app-header', '/office/app', async function (p) {
    await p.waitForTimeout(1000);
    var sw = await p.evaluate(function () { var b = document.getElementById('switch'); return { hidden: b.hidden, text: b.textContent.trim(), who: document.getElementById('who').textContent }; });
    await p.evaluate(function () { var e = document.querySelector('#who .ws'); document.getElementById('who').insertAdjacentHTML('beforeend', '<span class="em"> · procurement.and.logistics.coordinator@cleancell-energy-storage.us</span>'); return !!e; });
    var fit = [];
    for (var w of [360, 390, 430]) {
      await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(150);
      fit.push(await p.evaluate(function () {
        var vw = window.innerWidth, right = 0, sw = document.getElementById('switch').getBoundingClientRect(), so = document.getElementById('signout').getBoundingClientRect();
        Array.prototype.forEach.call(document.querySelectorAll('header.top *'), function (e) { var r = e.getBoundingClientRect(); if (r.width) right = Math.max(right, r.right); });
        return { w: vw, right: Math.round(right), scroll: document.documentElement.scrollWidth <= vw, switchIn: sw.width > 0 && sw.right <= vw - 16, signoutIn: so.width > 0 && so.right <= vw - 16, oneLine: document.querySelector('header.top .wl').getBoundingClientRect().height <= 20 };
      }));
    }
    ok('the office header has Switch on the company line for someone with two companies, and fits a 360, 390 and 430px phone with a long email', !sw.hidden && sw.text === 'Switch' && /^Clean Cell/.test(sw.who) && fit.every(function (f) { return f.scroll && f.right <= f.w - 16 && f.switchIn && f.signoutIn && f.oneLine; }), [sw, fit]);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.click('#switch'); await p.waitForTimeout(500);
    var pick = await p.evaluate(function () { return { gate: !document.getElementById('gate').hidden, h1: (document.querySelector('#gate h1') || {}).textContent || '', ws: document.querySelectorAll('#gate [data-ws]').length, back: (document.getElementById('ws-back') || {}).textContent || '' }; });
    await p.click('#ws-back'); await p.waitForTimeout(300);
    var home = await p.evaluate(function () { return { gate: !document.getElementById('gate').hidden, hub: document.querySelectorAll('#hubs .hx').length }; });
    ok('  Switch opens "Choose your company" with both, and Back returns to the company that was open', pick.gate && pick.h1 === 'Choose your company' && pick.ws === 2 && /Back to Clean Cell/.test(pick.back) && !home.gate && home.hub === 7, [pick, home]);
    return { fit: fit.map(function (f) { return f.w + ':' + f.right; }).join(' ') };
  }, { phone: true });
  WORKSPACES = null;
  await check('custody', '/logic-custody.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(700);
    var nav = await p.$eval('.logic-nav a[aria-current="page"]', function (e) { return e.textContent.trim(); });
    var counts = await p.$$eval('#counts div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    var sites = await p.$$eval('#site-list tbody tr', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 120); }); });
    ok('the custody page is the current chrome item and counts the fleet, its sites and coverage', nav === 'Sites & custody' && counts.some(function (t) { return /at the plant\s*5/.test(t); }) && counts.some(function (t) { return /in transit\s*1/.test(t); }) && sites.length === 1 && /Riverside yard/.test(sites[0]) && /PG&E · MSB-2/.test(sites[0]), [nav, counts, sites]);
    await p.fill('#find-serial', 'CC418-26-44192'); await p.click('#find button'); await p.waitForTimeout(500);
    var pass = await p.$eval('#unit', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    var moves = await p.$$eval('#mv-what option', function (r) { return r.map(function (x) { return x.value; }); });
    ok('  the passport shows custody, a pending warranty with its reason, the ship event, and only the moves that apply', /in transit/.test(pass) && /warranty/.test(pass) && /pending/.test(pass) && /no site assigned/.test(pass) && /ship · plant → in_transit/.test(pass) && moves.join('|') === 'deliver|receive', [pass.slice(0, 200), moves]);
    var loadOpts = await p.$$eval('#sc-load option', function (r) { return r.map(function (x) { return x.textContent; }); });
    await p.selectOption('#sc-load', '0');
    await p.fill('#scan', 'CC418-26-44192'); await p.press('#scan', 'Enter'); await p.fill('#scan', 'CC418-26-44199'); await p.press('#scan', 'Enter'); await p.waitForTimeout(200);
    var scanned = await p.$$eval('#scanned .ev', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    await p.click('#sc-go'); await p.waitForTimeout(800);
    var result = await p.$eval('#sc-result', function (e) { return e.textContent; });
    var counts2 = await p.$$eval('#counts div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    ok('  a scan session receives the planned load: the expected serial is received, the stray one is named, the count moves', loadOpts.some(function (t) { return /CC-26-4419 · LOAD-1 · in_transit · 1 unit/.test(t); }) && scanned.length === 2 && /expected/.test(scanned[0]) && /not on this load/.test(scanned[1]) && /1 received/.test(result) && /not on this load: CC418-26-44199/.test(result) && counts2.some(function (t) { return /received\s*1/.test(t); }), [loadOpts, scanned, result, counts2]);
    await p.fill('#im-text', 'Serial No,Site,Street,City,State,Zip,Commissioned\nCC418-26-44192,Riverside yard,1200 Depot Rd,Bakersfield,CA,93307,2026-09-20\nCC418-26-44190,Riverside yard,1200 Depot Rd,Bakersfield,CA,93307,\n');
    await p.selectOption('#im-customer', 'company_riverside'); await p.click('#im-dry'); await p.waitForTimeout(600);
    var map = await p.$$eval('#im-map select', function (r) { return r.map(function (x) { return x.value; }); });
    var plan = await p.$eval('#im-plan', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    var commit = await p.$eval('#im-commit', function (e) { return { hidden: e.classList.contains('hide'), text: e.textContent }; });
    ok('  an import is mapped by column name and planned row by row before anything is written; a unit still at the plant is a problem, not a write', map.join('|') === 'serial|siteName|line1|city|state|zip|commissionDate' && /1 row will change/.test(plan) && /1 with problems/.test(plan) && /assign, commission 2026-09-20/.test(plan) && /still at the plant; a received date/.test(plan) && !commit.hidden && /Commit 1 row/.test(commit.text), [map, plan.slice(0, 300), commit]);
    return { nav: nav, sites: sites.length, moves: moves, result: result.slice(0, 60) };
  });
  await check('customer-app', '/portals/customer/app?org=cleancell.us', async function (p) {
    var APP = base + '/portals/customer/app?org=cleancell.us';
    await p.waitForTimeout(1000);
    var manifest = await p.evaluate(function () { var b = document.querySelector('#brand[data-brand-name]'); return { m: document.querySelector('link[rel="manifest"]').getAttribute('href'), i: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), b: b ? b.textContent : null }; });
    var tabs = await p.$$eval('#nav button', function (r) { return r.map(function (x) { return x.textContent.trim().replace(/^[^A-Za-z]+/, ''); }); });
    ok('the customer app wears the tenant\'s customer manifest, icon and name (data-brand-name)', /app-manifest\?org=cleancell\.us&app=customer/.test(manifest.m) && /cleancell\/icons\/customer-180/.test(manifest.i) && manifest.b === 'Clean Cell', manifest);
    ok('  five tabs: Home, Orders, POs, Fleet, Account', tabs.join('|') === 'Home|Orders|POs|Fleet|Account', tabs);
    /* Home: the hex hub, Fleet in the middle; badges only for what waits on
       this account — a unit that needs a site, an invoice to pay, a warranty
       pending until that site is set */
    var hub = await p.$$eval('#hub .hx', function (r) { return r.map(function (x) { var b = x.querySelector('.bt'); return x.getAttribute('data-hub') + ':' + (b ? b.textContent : '') + (x.classList.contains('center') ? ':centre' : ''); }); });
    var cap = await text(p, '#hub .hh-cap');
    var panels = await p.$$eval('#home-panels .panel', function (r) { return r.map(function (x) { return x.id + ':' + x.textContent.replace(/\s+/g, ' ').trim().slice(0, 160); }); });
    ok('  Home is the hex hub: Fleet in the centre, Size · Design · POs · Pay · Shipping · Warranty around it, badged where the account is needed', hub.join('|') === 'fleet:1:centre|size:|design:|pos:|pay:1|shipping:1|warranty:1' && cap === 'Clean Cell', [hub, cap]);
    ok('  under it: Arriving, To pay (the balance invoice, its number and a pay link) and Needs you (choose the unit\'s site)', panels.length === 3 && /^p-arriving:Arriving/.test(panels[0]) && /^p-pay:To pay\s*1/.test(panels[1]) && /Final balance · CC-26-4419/.test(panels[1]) && /invoice CC-INV-1058/.test(panels[1]) && /pay online/.test(panels[1]) && /\$350,875\.00/.test(panels[1]) && /^p-needs:Needs you/.test(panels[2]) && /Choose the site for CC418-26-44192/.test(panels[2]), panels);
    /* Size */
    await p.click('#hub .hx[data-hub="size"]'); await p.waitForTimeout(600);
    var sizeH = await p.$eval('#view h1', function (e) { return e.textContent; }), modes = await p.$$eval('#view .seg [data-mode]', function (r) { return r.map(function (x) { return x.getAttribute('data-mode'); }); });
    await p.fill('#sz-kw', '400'); await p.fill('#sz-h', '2'); await p.click('#sz-go'); await p.waitForTimeout(500);
    var sized = await text(p, '#sz-out');
    ok('  Size: one site or a portfolio; quick size against the supplier\'s catalog: 400 kW for 2 h is four 215 kWh cabinets', sizeH === 'Size' && modes.join('|') === 'single|portfolio' && /4 × 215 kWh/.test(sized) && /400 kW · 860 kWh/.test(sized), [sizeH, modes, sized]);
    await p.click('#view .seg [data-mode="portfolio"]'); await p.waitForTimeout(700);
    var pf = await text(p, '#portfolio-root');
    ok('  the portfolio upload is the desktop portal\'s own module', /Upload a portfolio/.test(pf) && /Your portfolios/.test(pf), pf.slice(0, 160));
    await p.click('#view .seg [data-mode="single"]'); await p.waitForTimeout(600);
    await p.click('#sz-po'); await p.waitForTimeout(600);
    var prefill = await p.$eval('#bulk-text', function (e) { return e.value; });
    var preview = await p.$eval('#bulk-preview', function (e) { return e.textContent; });
    var queue = await texts(p, '#pos-body .unit', 60);
    ok('  "send as a PO" lands on the PO sheet with the sized line; the company\'s POs under review and orders are listed', /CC-C215, 4,/.test(prefill) && /1 purchase order, 1 line/.test(preview) && queue.some(function (t) { return /RCC-2211/.test(t); }) && queue.some(function (t) { return /RCC-2200/.test(t); }), [prefill, preview, queue]);
    /* POs: a PO DOCUMENT, uploaded from the phone, lands on the account */
    await p.setInputFiles('#po-file', pdf('RCC-2230.pdf')); await p.fill('#po-note', 'PO RCC-2230 for the Fresno store'); await p.click('#po-up'); await p.waitForTimeout(800);
    /* the word about the upload is under its own button, on screen — not in
       the page's #status a screen above it */
    var poSt = await text(p, '#po-msg'), poDocs = await text(p, '#po-docs');
    var poSeen = await p.$eval('#po-msg', function (e) { var r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight; });
    ok('  POs: a PO document uploads to the account (category purchase order) and is listed under the upload; the confirmation shows under the Upload button', /Uploaded\. Clean Cell sees it on your account/.test(poSt) && poSeen && /PO documents · 1/.test(poDocs) && /RCC-2230\.pdf/.test(poDocs) && /Purchase order/.test(poDocs), [poSt, poSeen, poDocs]);
    /* Design: the trial from the supplier, and monthly or yearly */
    await p.click('[data-tab="home"]'); await p.waitForTimeout(500); await p.click('#hub .hx[data-hub="design"]'); await p.waitForTimeout(800);
    var hero = await text(p, '.card.hero'), plans = await p.$$eval('#sub-body [data-plan]', function (r) { return r.map(function (x) { return x.getAttribute('data-plan') + ':' + x.textContent.replace(/\s+/g, ' ').trim(); }); });
    var open = await p.$$eval('#new-plan', function (r) { return r.length; }), sites = await p.$$eval('#design-body a.unit', function (r) { return r.map(function (x) { return x.getAttribute('href'); }); });
    ok('  Design: Editor Lite on the supplier\'s trial, a site plan opening in it, and monthly or yearly at the supplier\'s prices', /Editor Lite/.test(hero) && /trial/.test(hero) && open === 1 && sites.length === 1 && /editor-lite\.html\?customer=1&org=cleancell\.us&project=p1/.test(sites[0]) && plans.length === 2 && /^month:Monthly\$799\.00 \/ month$/.test(plans[0]) && /^year:Yearly\$7,990\.00 \/ year · save 17%$/.test(plans[1]), [hero, open, sites, plans]);
    await p.click('#sub-body [data-plan="year"]'); await p.waitForURL(/checkout\.example\.com/, { timeout: 5000 }).catch(function () {});
    var checkoutAt = p.url();
    await p.goto(APP + '&tab=design&checkout=done', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200);
    var sub = await text(p, '#sub-body'), cleaned = p.url(), hero2 = await text(p, '.card.hero');
    ok('  Subscribe opens checkout on a secure page; back with checkout=done the account is subscribed for everyone on it, said once and taken off the address, with Manage', /checkout\.example\.com\/c\/pay\/cs_render_year/.test(checkoutAt) && /subscribed/.test(sub) && /Your subscription · Yearly/.test(sub) && /Manage subscription/.test(sub) && !/checkout=/.test(cleaned) && /active/.test(hero2), [checkoutAt, sub.slice(0, 200), cleaned, hero2.slice(0, 80)]);
    await p.click('#sub-manage'); await p.waitForURL(/billing\.example\.com/, { timeout: 5000 }).catch(function () {});
    var manageAt = p.url();
    ok('  Manage opens the billing page', /billing\.example\.com/.test(manageAt), manageAt);
    await p.goto(APP, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000);
    /* Pay */
    await p.click('#hub .hx[data-hub="pay"]'); await p.waitForTimeout(600);
    var invs = await p.$$eval('#pay-body .card[data-invoice]', function (r) { return r.map(function (x) { return x.getAttribute('data-invoice'); }); });
    var payA = await p.$$eval('#pay-body a[data-pay]', function (r) { return r.map(function (x) { return x.getAttribute('href') + '|' + x.getAttribute('target') + '|' + x.textContent.trim(); }); });
    var payText = await text(p, '#pay-body');
    ok('  Pay: the open invoice by its number, due on the account\'s terms, with the supplier\'s pay link; the paid deposit under Paid', invs.join('|') === 'CC-26-4419:balance|CC-26-4419:deposit' && payA.length === 1 && payA[0] === 'https://pay.example.com/cleancell/CC-INV-1058|_blank|Pay $350,875.00' && /Invoice CC-INV-1058/.test(payText) && /due \d{4}-\d{2}-\d{2}/.test(payText) && /Paid · 1/.test(payText), [invs, payA, payText.slice(0, 240)]);
    /* Shipping */
    await p.click('#view [data-go="home"]'); await p.waitForTimeout(500); await p.click('#hub .hx[data-hub="shipping"]'); await p.waitForTimeout(600);
    var ship = await texts(p, '#ship-body h2');
    var load = await text(p, '#ship-body [data-load="LOAD-1"]');
    ok('  Shipping lists the load on its way with its carrier and tracking (the ledger moves it; a custody receipt does not)', ship[0] === 'On the way · 1' && /CC-26-4419 · load LOAD-1/.test(load) && /Estes/.test(load) && /BOL-771/.test(load) && /last confirmed at Fresno, CA/.test(load), [ship, load]);
    /* Warranty: coverage per unit, pending until a site; ask about it */
    await p.click('#view [data-go="home"]'); await p.waitForTimeout(500); await p.click('#hub .hx[data-hub="warranty"]'); await p.waitForTimeout(600);
    var war = await text(p, '#war-body'), wask = await p.$$eval('form[data-wask]', function (r) { return r.length; });
    await p.click('#war-body details summary'); await p.fill('form[data-wask] textarea', 'Unit CC418-26-44192: does the warranty start from the ship date?'); await p.click('form[data-wask] button'); await p.waitForTimeout(800);
    var askSt = await text(p, '#status'), war2 = await text(p, '#war-body');
    ok('  Warranty: the unit\'s coverage is pending until it is bound to a site; a question goes on its order and shows on the unit, waiting for an answer', /Pending · 1/.test(war) && /CC418-26-44192/.test(war) && wask === 1 && /Sent\. Clean Cell answers here and on order CC-26-4419/.test(askSt) && /waiting for an answer/.test(war2) && /start from the ship date/.test(war2), [war.slice(0, 200), wask, askSt, war2.slice(0, 200)]);
    /* Orders */
    await p.click('[data-tab="orders"]'); await p.waitForTimeout(500);
    var order = await text(p, '#orders-body .card');
    var track = await p.$$eval('#orders-body .track i', function (r) { return r.map(function (x) { return x.className; }).join(','); });
    var form = await p.$$eval('form[data-req]', function (r) { return r.length; });
    ok('  an order shows its milestone track, invoices by number, the open request and the warranty question, with a form to ask', /CC-26-4419/.test(order) && /Building/.test(order) && track === 'done,done,on,,,' && /Order total\s*\$501,250\.00/.test(order) && /Final balance invoice CC-INV-1058/.test(order) && /Deliver to the Bakersfield yard/.test(order) && /start from the ship date/.test(order) && form === 1, [order.slice(0, 160), track, form]);
    /* Account: company, people, terms, documents both ways */
    await p.click('[data-tab="account"]'); await p.waitForTimeout(700);
    var acct = await texts(p, '#acct-body .kv div');
    ok('  the account shows its number, rep and terms', acct.some(function (t) { return /company_riverside/.test(t); }) && acct.some(function (t) { return /Sam Rep/.test(t); }) && acct.some(function (t) { return /Deposit\s*40%/.test(t); }), acct);
    var ppl = await p.$$eval('#acct-body [data-person]', function (r) { return r.map(function (x) { return x.getAttribute('data-person') + ':' + x.getAttribute('data-to'); }); });
    var addForm = await p.$$eval('#p-add', function (r) { return r.length; });
    var attrib = await p.$eval('#attribution', function (e) { return e.hidden ? '' : e.textContent; });
    ok('  the owner sees the people on the account (the office approved the one who asked), turns a colleague off, adds one; the app says "powered by" as the contract does', ppl.join('|') === 'finance@riverside.example:disabled|new.hire@riverside.example:disabled' && addForm === 1 && attrib === 'Powered by ClearSky OMEGA', [ppl, addForm, attrib]);
    var lists = await texts(p, '#docs-list .sub-h'), docs = await texts(p, '#docs-list [data-doc-row] b');
    await p.setInputFiles('#doc-file', pdf('Fresno-utility-bill.pdf')); await p.selectOption('#doc-cat', 'utility-bill'); await p.click('#doc-up'); await p.waitForTimeout(900);
    var lists2 = await texts(p, '#docs-list .sub-h');
    var dl = p.waitForEvent('download', { timeout: 5000 }).catch(function () { return null; });
    await p.click('#docs-list [data-doc-row="f_msa"] button'); var got = await dl;
    ok('  Documents: what the supplier shared (the MSA, the plan the office shared from its phone — never the office-only sheet) and the company\'s own; an upload joins them; a document downloads', lists.join('|') === 'From Clean Cell · 2|From your company · 2' && docs.indexOf('Riverside-MSA-2026.pdf') >= 0 && docs.indexOf('Commissioning-plan.pdf') >= 0 && docs.indexOf('Riverside-pricing-worksheet.xlsx') < 0 && docs.indexOf('RCC-2230.pdf') >= 0 && lists2.join('|') === 'From Clean Cell · 2|From your company · 3' && got && got.suggestedFilename() === 'Riverside-MSA-2026.pdf', [lists, docs, lists2, got && got.suggestedFilename()]);
    /* Fleet: sites and units, and the customer's moves on them */
    await p.click('[data-tab="fleet"]'); await p.waitForTimeout(700);
    var sb = await text(p, '#sites-body');
    var acts = await p.$$eval('#sites-body [data-act]', function (r) { return r.map(function (x) { return x.getAttribute('data-act'); }); });
    ok('  Fleet lists the customer\'s site and the received unit with its warranty pending until a site is chosen; going-to and assign apply', /Riverside yard/.test(sb) && /PG&E · POI MSB-2/.test(sb) && /CC418-26-44192/.test(sb) && /received/.test(sb) && /no site assigned/.test(sb) && acts.join('|') === 'destination|assign', [sb.slice(0, 240), acts]);
    await p.selectOption('#sites-body [data-site="0"]', 'site_company-riverside-riverside-yard-93307'); await p.click('#sites-body [data-act="assign"]'); await p.waitForTimeout(700);
    var sb2 = await text(p, '#sites-body');
    var acts2 = await p.$$eval('#sites-body [data-act]', function (r) { return r.map(function (x) { return x.getAttribute('data-act'); }); });
    ok('  binding the unit to the site starts the warranty from the ship date; commissioning is now the customer\'s next move', /assigned to site/.test(sb2) && /until 2036-09-10 · from 2026-09-10/.test(sb2) && /1 unit/.test(sb2) && acts2.join('|') === 'assign|commissioned', [sb2.slice(0, 240), acts2]);
    ok('  what the customer declared is marked as awaiting the supplier\'s confirmation', /awaiting your supplier's confirmation/.test(sb2), sb2.slice(0, 300));
    await p.click('[data-tab="home"]'); await p.waitForTimeout(900);
    var hub2 = await p.$$eval('#hub .hx', function (r) { return r.map(function (x) { var b = x.querySelector('.bt'); return x.getAttribute('data-hub') + ':' + (b ? b.textContent : ''); }); });
    ok('  back on Home the badges follow: the unit has its site (commissioning is next), its warranty runs', hub2.join('|') === 'fleet:1|size:|design:|pos:|pay:1|shipping:1|warranty:', hub2);
    return { tabs: tabs.length, hub: hub.length, sized: sized.slice(0, 40), invoices: invs.length, form: form };
  }, { phone: true });
  await check('custody-confirm', '/logic-custody.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(700);
    var rows = await p.$$eval('#confirm-list tbody tr', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    await p.click('#confirm-list [data-confirm]'); await p.waitForTimeout(700);
    var after = await p.$$eval('#confirm-list tbody tr', function (r) { return r.length; });
    await p.fill('#find-serial', 'CC418-26-44192'); await p.click('#find button'); await p.waitForTimeout(500);
    var pass = await p.$eval('#unit', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    ok('the office sees what the customer declared, confirms it, and the passport says who confirmed and when', rows.length === 1 && /CC418-26-44192/.test(rows[0]) && /Riverside yard · assigned to site/.test(rows[0]) && after === 0 && /confirmed at Riverside yard by demo@cleancell.us/.test(pass) && /confirm · assigned → assigned/.test(pass), [rows, after, pass.slice(0, 400)]);
    return { declared: rows.length, after: after };
  });
  await check('register', '/logic-register.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(700);
    var nav = await p.$eval('.logic-nav a[aria-current="page"]', function (e) { return e.textContent.trim(); });
    var heads = await p.$$eval('#reg thead th', function (r) { return r.map(function (x) { return x.textContent.trim(); }); });
    var rows = await p.$$eval('#reg tbody tr', function (r) { return r.length; });
    var r92 = await p.$eval('#reg tbody tr[data-serial="CC418-26-44192"]', function (tr) { var o = {}; Array.prototype.forEach.call(tr.querySelectorAll('td[data-k]'), function (td) { o[td.getAttribute('data-k')] = td.textContent.trim(); }); return o; });
    ok('the register is one row per unit with the parties, the load, the site and the coverage as columns; the placed unit carries its carrier, BOL, buyer, PO, utility and running warranty', nav === 'Fleet register' && rows === 6 && heads.indexOf('Seller') > 0 && heads.indexOf('Reseller') > 0 && heads.indexOf('End customer') > 0 && heads.indexOf('BOL / tracking') > 0 && heads.indexOf('Warranty until') > 0 && r92.seller === 'Clean Cell' && r92.buyer === 'Riverside Cold Chain' && r92.carrier === 'Estes' && r92.tracking === 'BOL-771' && r92.load === 'LOAD-1' && /assigned to site/.test(r92.statusLabel) && /^active/.test(r92.warrantyStatus) && r92.warrantyUntil === '2036-09-10' && r92.utility === 'PG&E' && r92.poNumber === 'RCC-2200', [nav, rows, heads.length, r92]);
    await p.fill('#find', 'estes'); await p.waitForTimeout(200);
    var found = await p.$$eval('#reg tbody tr[data-serial]', function (r) { return r.map(function (x) { return x.getAttribute('data-serial'); }); });
    await p.fill('#find', ''); await p.waitForTimeout(200);
    await p.click('#reg tbody tr[data-serial="CC418-26-44192"] td[data-k="reseller"]'); await p.waitForTimeout(150);
    await p.keyboard.type('Valley Power Partners'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
    var after = await p.$eval('#reg tbody tr[data-serial="CC418-26-44192"] td[data-k="reseller"]', function (td) { return td.textContent.trim(); });
    var st = await p.$eval('#status', function (e) { return e.textContent; });
    await p.click('#reg tbody tr[data-serial="CC418-26-44192"] td[data-k="site"]'); await p.waitForTimeout(150);
    await p.selectOption('#reg tbody tr[data-serial="CC418-26-44192"] td select', 'site_company-riverside-riverside-yard-93307'); await p.waitForTimeout(900);
    var r92b = await p.$eval('#reg tbody tr[data-serial="CC418-26-44192"]', function (tr) { var o = {}; Array.prototype.forEach.call(tr.querySelectorAll('td[data-k]'), function (td) { o[td.getAttribute('data-k')] = td.textContent.trim(); }); return o; });
    ok('  search finds by any column; a cell edit saves a detail in place (Enter), and choosing a site in the Site cell assigns the unit through the rules: warranty active, confirmed by the office', found.join('|') === 'CC418-26-44192' && after === 'Valley Power Partners' && /Saved reseller/.test(st) && r92b.site === 'Riverside yard' && /assigned to site/.test(r92b.statusLabel) && /^active/.test(r92b.warrantyStatus) && r92b.warrantyUntil === '2036-09-10' && /^confirmed/.test(r92b.confirmation) && r92b.reseller === 'Valley Power Partners', [found, after, st, r92b]);
    return { rows: rows, cols: heads.length, after: after };
  });
  await check('kit', '/logic-kit.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(800);
    var nav = await p.$eval('.logic-nav a[aria-current="page"]', function (e) { return e.textContent.trim(); });
    var heads = await p.$$eval('#aud h2', function (r) { return r.map(function (x) { return x.textContent.trim(); }); });
    var urls = await p.$$eval('#aud .url', function (r) { return r.map(function (x) { return x.textContent; }); });
    var msg = await p.$eval('#msg-customer', function (e) { return e.value; });
    var guides = await p.$$eval('#guide-list .url', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('Apps & guides lists every app, page, sandbox and guide for the subscriber with a message per audience', nav === 'Apps & guides' && heads.join('|') === 'Customer|Office|Plant' && urls.some(function (u) { return /portals\/customer\/app\?org=cleancell\.us/.test(u); }) && urls.some(function (u) { return /office\/app\?org=cleancell\.us/.test(u); }) && urls.some(function (u) { return /plant\/app\?org=cleancell\.us/.test(u); }) && /Customer app: https:\/\/silmarillion/.test(msg) && /Add to Home Screen/.test(msg) && /Omega-Logic-Customer-App\.pdf/.test(msg) && guides.length === 4 && guides.some(function (g) { return /Omega-Logic-(Office-)?App\.pdf/.test(g); }), [nav, heads, urls.length, msg.slice(0, 120), guides]);
    await p.fill('#s-to', 'robert.bucher@cleancell.us'); await p.fill('#s-note', 'Customer kit with the PDF'); await p.click('#sent button'); await p.waitForTimeout(800);
    var log = await p.$$eval('#send-list tbody tr', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    var kst = await p.$eval('#status', function (e) { return e.textContent; });
    ok('  a send is logged against the subscriber with who, what and when', log.length === 1 && /customer/.test(log[0]) && /robert\.bucher@cleancell\.us/.test(log[0]) && /jarvis/.test(log[0]) && /Customer kit with the PDF/.test(log[0]), [log, kst]);
    return { heads: heads.length, urls: urls.length, guides: guides.length, log: log.length };
  });
  /* The desktop CRM: the Customer hub of the Omega Logic app with more
     room. It reads the same state the phone checks above changed. */
  await check('crm-desktop', '/portals/customer/admin.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(1000);
    var rows = await texts(p, '#rows tr', 160), fu = await text(p, '#fu-rows'), fuRows = await texts(p, '#fu-rows .rowline', 200);
    ok('the desktop CRM lists the accounts and the follow-ups due across them (the overdue call, the task logged on the phone), the later one counted', rows.length === 2 && /^Riverside Cold Chain/.test(rows[0]) && /2 follow-ups due · 1 more scheduled for later/.test(fu) && fuRows.length === 2 && /Riverside Cold Chain · Bakersfield delivery window.*was due/.test(fuRows[0]) && /Send the commissioning checklist.*no date/.test(fuRows[1]), [rows, fu, fuRows]);
    await p.click('#rows [data-open="company_riverside"]'); await p.waitForTimeout(800);
    var secs = await p.$$eval('#acct-seg [data-sec]', function (r) { return r.map(function (x) { return x.firstChild.textContent.trim(); }); });
    var ov = await text(p, '#acct-body');
    ok('  an account opens in sections, as QuickBooks\' customer hub: the overview has its money, its follow-ups, the latest on the timeline and the design tool the customer subscribed to', secs.join('|') === 'Overview|People & contacts|Activity|Documents|Orders & POs|Sites|Timeline|Details' && /Balance\$350,875\.00/.test(ov) && /Follow-ups · 3 open/.test(ov) && /Latest/.test(ov) && /Editor Lite\s*active/.test(ov), [secs, ov.slice(0, 300)]);
    await p.click('#acct-seg [data-sec="people"]'); await p.waitForTimeout(300);
    var h3 = await texts(p, '#acct-body h3');
    await p.click('#cn-new'); await p.fill('#cn-name', 'Jordan Reyes'); await p.fill('#cn-title', 'Site lead, Fresno'); await p.fill('#cn-email', 'jordan@riverside.example'); await p.click('#cn-save'); await p.waitForTimeout(800);
    var added = await text(p, '#message'), h3b = await texts(p, '#acct-body h3');
    var jordan = await p.$$eval('#acct-body .rowline', function (r) { var row = r.filter(function (x) { var b = x.querySelector('b'); return b && b.textContent === 'Jordan Reyes'; })[0]; var a = row && row.querySelector('[data-cn-arch]'); return a ? a.getAttribute('data-cn-arch') : null; });
    p.once('dialog', function (d) { d.accept(); }); await p.click('#acct-body [data-cn-arch="' + jordan + '"]'); await p.waitForTimeout(800);
    var archived = await text(p, '#message'), h3c = await texts(p, '#acct-body h3');
    ok('  People & contacts: the logins and the contacts; a contact is added, and archived (never deleted)', h3.indexOf('People · 3') >= 0 && h3.indexOf('Contacts · 2') >= 0 && /Contact added/.test(added) && h3b.indexOf('Contacts · 3') >= 0 && !!jordan && /Contact archived/.test(archived) && h3c.indexOf('Contacts · 2') >= 0, [h3, added, h3b, jordan, archived, h3c]);
    await p.click('#acct-seg [data-sec="activity"]'); await p.waitForTimeout(300);
    var later = await p.evaluate(function () { var d = new Date(Date.now() + 3 * 86400000); function z(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); });
    await p.selectOption('#lg-type', 'email'); await p.fill('#lg-subject', 'Sent the Fresno quote'); await p.selectOption('#lg-contact', 'ct_dana'); await p.fill('#lg-fu', later); await p.click('#log-form button.primary'); await p.waitForTimeout(800);
    var logged = await text(p, '#message');
    await p.click('#acct-body [data-fu-done="ac_call"]'); await p.waitForTimeout(900);
    var done = await text(p, '#message'), acts = await texts(p, '#acct-body h3'), fu2 = await text(p, '#fu-rows');
    ok('  Activity: an email logged with a contact and a follow-up date; the call\'s follow-up marked done — off the follow-ups panel too', new RegExp('Email logged; follow up ' + later + ' is on Today').test(logged) && /Done\. It is off Today/.test(done) && acts.indexOf('Follow-ups · 3 open') >= 0 && acts.indexOf('Activity · 6') >= 0 && /1 follow-up due · 2 more scheduled for later/.test(fu2), [logged, done, acts, fu2]);
    await p.click('#acct-seg [data-sec="documents"]'); await p.waitForTimeout(300);
    var dh = await texts(p, '#acct-body h3');
    await p.setInputFiles('#doc-file', pdf('Warranty-terms.pdf')); await p.selectOption('#doc-cat', 'warranty'); await p.click('#doc-form button.primary'); await p.waitForTimeout(900);
    var up = await text(p, '#message');
    var wid = await p.$$eval('#acct-body .rowline', function (r) { var row = r.filter(function (x) { var b = x.querySelector('b'); return b && b.textContent === 'Warranty-terms.pdf'; })[0]; var a = row && row.querySelector('[data-doc-share]'); return a ? a.getAttribute('data-doc-share') + ':' + a.getAttribute('data-to') : null; });
    p.once('dialog', function (d) { d.accept(); }); await p.click('#acct-body [data-doc-share="' + String(wid).split(':')[0] + '"]'); await p.waitForTimeout(900);
    var shared = await text(p, '#message'), pills = await p.$$eval('#acct-body .rowline', function (r) { return r.map(function (x) { var b = x.querySelector('b'), q = x.querySelector('.pill'); return (b ? b.textContent : '') + ':' + (q ? q.textContent : ''); }); });
    ok('  Documents: every document on the account both ways; an upload is office-only until shared, then the customer sees it', dh.indexOf('Documents · 6') >= 0 && /Only the office sees it until you share it/.test(up) && /:1$/.test(wid || '') && /Shared\. The customer sees it in their app/.test(shared) && pills.indexOf('Warranty-terms.pdf:shared') >= 0 && pills.indexOf('Riverside-pricing-worksheet.xlsx:office only') >= 0 && pills.indexOf('RCC-2230.pdf:from them') >= 0, [dh, up, wid, shared, pills]);
    await p.click('#acct-seg [data-sec="orders"]'); await p.waitForTimeout(300);
    var poLink = await p.$$eval('#acct-body a.button', function (r) { return r.map(function (x) { return x.getAttribute('href'); }).filter(function (h) { return /po-inbox/.test(h); }); }), orderRows = await p.$$eval('#acct-body tbody tr', function (r) { return r.length; });
    await p.click('#acct-seg [data-sec="sites"]'); await p.waitForTimeout(900);
    var sites = await text(p, '#acct-sites');
    ok('  Orders & POs: every order on the account and Enter a PO with the company chosen; Sites: its site and its unit, assigned there by the customer', poLink.length === 1 && /customerId=company_riverside/.test(poLink[0]) && orderRows === 1 && /Riverside yard/.test(sites) && /CC418-26-44192/.test(sites) && /assigned to site/.test(sites), [poLink, orderRows, sites.slice(0, 200)]);
    await p.click('#acct-seg [data-sec="timeline"]'); await p.waitForTimeout(300);
    var tl = await p.$$eval('#acct-body .rowline .tk', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('  Timeline: what the customer did in their app is on it — their uploads, the unit they received and assigned, the design tool they subscribed to — with what the office did', tl.length >= 30 && tl[0] === 'file uploaded' && ['unit received', 'unit assigned', 'design subscription', 'follow up done', 'activity email', 'request asked', 'person approved'].every(function (k) { return tl.indexOf(k) >= 0; }), tl);
    await p.click('#acct-seg [data-sec="details"]'); await p.waitForTimeout(300);
    var dom = await p.$eval('#profile-domain', function (e) { return e.value; }), terms = await p.$$eval('#terms', function (r) { return r.length; });
    ok('  Details: the company, its email domain and its terms', dom === 'riverside.example' && terms === 1, [dom, terms]);
    await p.goto('about:blank'); await p.goto(base + '/portals/customer/admin.html?org=cleancell.us&customer=company_riverside#documents', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200);
    var deep = await p.$$eval('#acct-seg [aria-pressed="true"]', function (r) { return r.map(function (x) { return x.getAttribute('data-sec'); }); }), deepH = await texts(p, '#acct-body h3');
    ok('  ?customer=<id>#section opens straight onto that account and section (Today\'s follow-ups link here)', deep.join('|') === 'documents' && deepH.indexOf('Documents · 7') >= 0, [deep, deepH]);
    return { accounts: rows.length, sections: secs.length, timeline: tl.length };
  });
  /* The customer's desktop portal: the same hub and the same account. */
  await check('portal', '/portals/customer/?org=cleancell.us', async function (p) {
    await p.waitForTimeout(1500);
    var brand = await p.$eval('#brand[data-brand-name]', function (e) { return e.textContent; });
    var hub = await p.$$eval('#hub .hx', function (r) { return r.map(function (x) { var b = x.querySelector('.bt'); return x.getAttribute('data-hub') + ':' + (b ? b.textContent : ''); }); });
    var kv = await texts(p, '#home-kv .kv div'), panels = await texts(p, '#home-panels section h2');
    ok('the desktop portal opens on the customer hub — Fleet in the centre — with the account summary and Arriving, To pay, Needs you', brand === 'Clean Cell' && hub.join('|') === 'fleet:1|size:|design:|pos:|pay:1|shipping:1|warranty:' && kv.some(function (t) { return /To pay\$350,875\.00/.test(t); }) && kv.some(function (t) { return /Designsubscribed/.test(t); }) && panels.join('|') === 'Arriving · 1|To pay · 1|Needs you · 1', [brand, hub, kv, panels]);
    await p.click('#hub .hx[data-hub="pay"]'); await p.waitForTimeout(500);
    var invs = await p.$$eval('#pay-body [data-invoice]', function (r) { return r.map(function (x) { return x.getAttribute('data-invoice'); }); });
    var payA = await p.$$eval('#pay-body a[data-pay]', function (r) { return r.map(function (x) { return x.getAttribute('href'); }); });
    ok('  Pay: the open invoice with the supplier\'s pay link, the paid one under Paid', invs.join('|') === 'CC-26-4419:balance|CC-26-4419:deposit' && payA.join('|') === 'https://pay.example.com/cleancell/CC-INV-1058', [invs, payA]);
    await p.click('.logic-nav [data-view="documents"]'); await p.waitForTimeout(500);
    var lists = await texts(p, '#docs-list .sub-h'), names = await texts(p, '#docs-list .hrow b');
    await p.setInputFiles('#doc-file', pdf('Fresno-single-line.pdf')); await p.selectOption('#doc-cat', 'drawing'); await p.click('#doc-up'); await p.waitForTimeout(900);
    var msg = await text(p, '#doc-msg'), lists2 = await texts(p, '#docs-list .sub-h');
    var dl = p.waitForEvent('download', { timeout: 5000 }).catch(function () { return null; });
    await p.click('#docs-list [data-doc="f_msa"]'); var got = await dl;
    ok('  Documents: what the supplier shared (three, never the office-only sheet) and the company\'s own; an upload joins them; a document downloads as bytes', lists.join('|') === 'From Clean Cell · 3|From your company · 3' && names.indexOf('Warranty-terms.pdf') >= 0 && names.indexOf('Riverside-pricing-worksheet.xlsx') < 0 && /Uploaded\. Clean Cell sees it on your account/.test(msg) && lists2.join('|') === 'From Clean Cell · 3|From your company · 4' && got && got.suggestedFilename() === 'Riverside-MSA-2026.pdf', [lists, names, msg, lists2, got && got.suggestedFilename()]);
    await p.click('.logic-nav [data-view="design"]'); await p.waitForTimeout(600);
    var sub = await text(p, '#sub-card');
    ok('  Design: the account\'s yearly subscription, with Manage for the owner', /Your subscription · Yearly/.test(sub) && /Manage subscription/.test(sub), sub.slice(0, 200));
    await p.click('.logic-nav [data-view="warranty"]'); await p.waitForTimeout(400);
    var war = await text(p, '#war-body');
    await p.click('.logic-nav [data-view="fleet"]'); await p.waitForTimeout(400);
    var fleet = await text(p, '#fleet-body');
    ok('  Warranty and Fleet: the unit covered from the ship date at the site the customer chose, and the question they asked about it', /Covered · 1/.test(war) && /start from the ship date/.test(war) && /Riverside yard/.test(fleet) && /CC418-26-44192/.test(fleet), [war.slice(0, 200), fleet.slice(0, 200)]);
    return { hub: hub.length, invoices: invs.length, docs: names.length };
  });
  /* The sandboxes: the same pages with sandbox.js in place of Firebase and
     /api/. Nothing below reaches the stub server's /api/ routes — the page
     answers itself — and what a tap changes survives a reload. */
  await check('sandbox-office', '/app-sandbox/office', async function (p) {
    await p.waitForTimeout(400);
    var stripLinks = await p.$$eval('.sb-strip a', function (r) { return r.map(function (x) { return x.getAttribute('href'); }); });
    var fb = await p.evaluate(function () { return typeof firebase.auth().signInWithPopup === 'function' && !firebase.auth().currentUser; });
    /* signed out: Omega Logic's own front door, as the app guide shows it */
    var door = await p.evaluate(function () { var g = document.getElementById('gate'); return { shown: !g.hidden, h1: (g.querySelector('h1') || {}).textContent || '', google: !!g.querySelector('#signin'), link: (g.querySelector('.ols-submit') || {}).textContent || '', pw: (g.querySelector('#ols-mode') || {}).textContent || '', nav: document.getElementById('nav').hidden }; });
    ok('  signed out, the office app is "Sign in to Omega Logic": Google, or any work email with a sign-in link (a password one tap away)', door.shown && door.h1 === 'Sign in to Omega Logic' && door.google && door.link === 'Email me a sign-in link' && door.pw === 'Use a password instead' && door.nav, door);
    await p.click('#signin'); await p.waitForTimeout(700);
    var kv = await p.$$eval('#today-kv div', function (r) { return r.length; });
    var who = await p.$eval('#who', function (e) { return e.textContent; });
    ok('the office sandbox wears the strip, starts signed out and signs in with a tap', stripLinks.length === 4 && /\/app-sandbox\/bench/.test(stripLinks[3]) && fb && /^Clean Cell · demo@cleancell\.us$/.test(who) && kv === 4, [stripLinks, fb, who, kv]);
    await p.click('[data-tab="orders"]'); await p.waitForTimeout(300); await p.click('[data-order="o1"]'); await p.waitForTimeout(300);
    await p.fill('[id^="answer-"]', 'Done — re-routed to Bakersfield, same date.'); await p.click('[data-resolve]'); await p.waitForTimeout(700);
    var st = await p.$eval('#status', function (e) { return e.textContent; });
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
    await p.click('[data-tab="orders"]'); await p.waitForTimeout(300); await p.click('[data-order="o1"]'); await p.waitForTimeout(300);
    var answered = await p.$$eval('.ans', function (r) { return r.map(function (x) { return x.textContent; }); }), open = await p.$$eval('[data-resolve]', function (r) { return r.length; });
    ok('  a request answered on the phone stays answered after a reload', open === 0 && answered.some(function (t) { return /Bakersfield, same date/.test(t); }), [st, open, answered]);
    await p.evaluate(function () { document.querySelector('a[href^="/omega-logic"]').click(); }); await p.waitForTimeout(200);
    var toast = await p.$$eval('.sb-toast', function (r) { return r.map(function (x) { return x.textContent; }); }), url = p.url();
    ok('  a desktop link is caught and explained, not followed', /app-sandbox\/office/.test(url) && toast.length === 1 && /desktop page/.test(toast[0]), [url, toast]);
    await p.click('[data-tab="sites"]'); await p.waitForTimeout(600);
    await p.selectOption('#rc-load', '0'); await p.fill('#rc-scan', 'CC418-26-44192'); await p.press('#rc-scan', 'Enter'); await p.waitForTimeout(200); await p.click('#rc-go'); await p.waitForTimeout(1400);
    var rc = await p.$eval('#rc-result', function (e) { return e.textContent; });
    await p.fill('#su-serial', 'CC418-26-44192'); await p.click('#su-go'); await p.waitForTimeout(500);
    await p.selectOption('#su-site', 'site_company-riverside-riverside-yard-93307'); await p.fill('#su-pos', 'Pad 1'); await p.click('[data-move="assign"]'); await p.waitForTimeout(700);
    var su2 = await p.$eval('#su-body', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    ok('  on the phone the office receives the load by scan and assigns the unit to the site: confirmed by the office itself, warranty running', /1 received/.test(rc) && /Every expected serial was received/.test(rc) && /assigned to site/.test(su2) && /confirmed by demo@cleancell.us/.test(su2) && /until 2036-09-10/.test(su2), [rc, su2.slice(0, 260)]);
    /* the CRM answers on the device too: an account's timeline, and a
       document handed over as bytes by the shim */
    await p.click('[data-tab="customers"]'); await p.waitForTimeout(500); await p.click('[data-cust="company_riverside"]'); await p.waitForTimeout(700);
    await p.click('#cust-seg [data-sec="timeline"]'); await p.waitForTimeout(300);
    var tl = await p.$$eval('#cust-body .tl', function (r) { return r.length; });
    await p.click('#cust-seg [data-sec="documents"]'); await p.waitForTimeout(300);
    var dl = p.waitForEvent('download', { timeout: 5000 }).catch(function () { return null; });
    await p.click('[data-doc-get="f_msa"]'); var got = await dl, bytes = got ? fs.readFileSync(await got.path(), 'latin1') : '';
    ok('  the sandbox CRM: an account\'s timeline, and a document downloads as a real one-page PDF', tl >= 15 && got && got.suggestedFilename() === 'Riverside-MSA-2026.pdf' && /^%PDF-1\.4/.test(bytes) && /Nothing here is real/.test(bytes), [tl, got && got.suggestedFilename(), bytes.slice(0, 20)]);
    return { strip: stripLinks.length, kv: kv, answered: answered.length, timeline: tl };
  });
  await check('sandbox-plant', '/app-sandbox/plant', async function (p) {
    await p.waitForTimeout(400);
    /* the office check signed this browser in; the sandbox remembers */
    if (await p.$eval('#gate', function (e) { return !e.hidden; })) await p.click('#signin');
    await p.waitForTimeout(800);
    var cards = await p.$$eval('#view .card', function (r) { return r.length; });
    await p.click('[data-tab="scan"]'); await p.waitForTimeout(300);
    var scan = await p.$eval('#view a.big', function (e) { return e.getAttribute('href'); }), paired = await p.$eval('#view .card .pill', function (e) { return e.textContent; });
    ok('the plant sandbox lists the work order and its scanner is the sandbox bench, already paired', cards === 1 && scan === '/app-sandbox/bench' && paired === 'paired', [cards, scan, paired]);
    await p.goto(base + '/app-sandbox/bench', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700);
    var pick = await p.$$eval('#pick option', function (r) { return r.length; });
    await p.selectOption('#pick', 'rack'); await p.fill('#scan', 'CC418-26-44190'); await p.press('#scan', 'Enter'); await p.waitForTimeout(700);
    var steps = await p.$$eval('#work .step', function (r) { return r.length; });
    ok('  the bench opens as a roaming phone and a scan shows the unit\'s steps', pick >= 9 && steps === 3, [pick, steps]);
    return { cards: cards, pick: pick, steps: steps };
  });
  await check('sandbox-customer', '/app-sandbox/customer', async function (p) {
    await p.waitForTimeout(400);
    /* the three sandboxes share one localStorage state; the office check above received and assigned the unit, so start this one over */
    p.once('dialog', function (d) { d.accept(); }); await p.click('#sb-reset'); await p.waitForTimeout(900);
    if (await p.$eval('#gate', function (e) { return e.hidden; })) { await p.click('#signout'); await p.waitForTimeout(600); }
    var gate = await p.$eval('#gate', function (e) { return !e.hidden; });
    await p.fill('#g-email', 'ops@riverside.example'); await p.click('#g-link'); await p.waitForTimeout(900);
    var who = await p.$eval('#who', function (e) { return e.textContent; }), hub = await p.$$eval('#hub .hx', function (r) { return r.map(function (x) { return x.getAttribute('data-hub'); }); });
    await p.click('#hub .hx[data-hub="design"]'); await p.waitForTimeout(700);
    var hero = await text(p, '.card.hero'), plans = await p.$$eval('#sub-body [data-plan]', function (r) { return r.length; });
    await p.click('#view [data-go="home"]'); await p.waitForTimeout(600); await p.click('#hub .hx[data-hub="pay"]'); await p.waitForTimeout(600);
    var payA = await p.$$eval('#pay-body a[data-pay]', function (r) { return r.map(function (x) { return x.getAttribute('href'); }); });
    ok('the customer sandbox signs in with any email and opens on the hub; Design is Editor Lite on trial with the plans to subscribe; Pay has the supplier\'s pay link', gate && who === 'ops@riverside.example' && hub.length === 7 && hub[0] === 'fleet' && /Editor Lite/.test(hero) && /trial/.test(hero) && plans === 2 && payA.join('|') === 'https://pay.example.com/cleancell/CC-INV-1058', [gate, who, hub, hero.slice(0, 60), plans, payA]);
    await p.click('[data-tab="pos"]'); await p.waitForTimeout(500);
    await p.fill('#bulk-text', 'INC-9001, CC-C215, 3, InCharge Fresno, 88 Rail Ave, Fresno, CA, 93706, 2026-12-01, dock 4');
    p.once('dialog', function (d) { d.accept(); }); await p.click('#bulk-go'); await p.waitForTimeout(700);
    var result = await p.$eval('#bulk-result', function (e) { return e.textContent; });
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800); await p.click('[data-tab="pos"]'); await p.waitForTimeout(500);
    var rows = await p.$$eval('#pos-body .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 50); }); });
    ok('  a PO sent from the phone is an order awaiting pricing after a reload', /INC-9001 → PO-IN-/.test(result) && rows.some(function (t) { return /INC-9001/.test(t); }), [result, rows]);
    await p.click('[data-tab="fleet"]'); await p.waitForTimeout(600);
    var going = await p.$$eval('#sites-body [data-dest]', function (r) { return r.length; });
    await p.selectOption('#sites-body [data-dest="0"]', 'site_company-riverside-riverside-yard-93307'); await p.click('#sites-body [data-act="destination"]'); await p.waitForTimeout(700);
    var unit = await p.$eval('#sites-body [data-unit]', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    p.once('dialog', function (d) { d.accept(); }); await p.click('#sites-body [data-act="received"]'); await p.waitForTimeout(700);
    var unit2 = await p.$eval('#sites-body [data-unit]', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    ok('  "this one is going there": the customer names the site while the unit is in transit; receiving it binds it there, awaiting the supplier\'s confirmation, and the warranty runs', going === 1 && /in transit/.test(unit) && /going to Riverside yard/.test(unit) && /received/.test(unit2) && /at Riverside yard · awaiting your supplier's confirmation/.test(unit2) && /until 2036-09-10/.test(unit2), [going, unit.slice(0, 160), unit2.slice(0, 220)]);
    /* documents both ways, on the device: an upload lands on the account */
    await p.click('[data-tab="account"]'); await p.waitForTimeout(700);
    await p.setInputFiles('#doc-file', pdf('Site-photo-log.pdf')); await p.click('#doc-up'); await p.waitForTimeout(700);
    var lists = await texts(p, '#docs-list .sub-h');
    ok('  the account\'s documents: what the supplier shared, and an upload from the phone joins the company\'s', lists.join('|') === 'From Clean Cell · 1|From your company · 2', lists);
    return { who: who, result: result.slice(0, 40) };
  });
  /* The installed iPhone app (navigator.standalone) signs in through its
     own host. Until Google accepts that host's /__/auth/handler
     (api/auth-check), a tap on Google must not strand the person on
     Google's "Access blocked" page: they are told, and pointed at email
     and password. Once Google accepts it, the tap goes on by redirect. */
  for (var gi = 0; gi < 2; gi++) {
    var accepts = gi === 1, ictx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ictx.addInitScript(function (g) { Object.defineProperty(Navigator.prototype, 'standalone', { get: function () { return true; } }); window.OMEGA_SANDBOX_GOOGLE = g; }, accepts);
    var ip = await ictx.newPage(), name = 'installed-app-google-' + (accepts ? 'on' : 'off');
    ip.on('pageerror', function (e) { errs.push(name + ': ' + e.message); });
    await ip.goto(base + '/app-sandbox/office', { waitUntil: 'domcontentloaded' }); await ip.waitForTimeout(500);
    await ip.click('#signin'); await ip.waitForTimeout(900);
    var st = await ip.evaluate(function () { var g = document.getElementById('gate'), vis = function (id) { var e = document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; }; return { gate: !g.hidden, msg: (document.getElementById('ols-msg') || {}).textContent || '', focus: document.activeElement && document.activeElement.id, who: (document.getElementById('who') || {}).textContent || '', sw: document.documentElement.scrollWidth, pass: vis('ols-pass'), forgot: vis('ols-forgot'), linkMode: !!document.getElementById('ols-mode'), submit: (document.querySelector('.ols-submit') || {}).textContent || '' }; });
    if (!accepts) ok('the installed app with Google not yet accepted for this host: no trip to Google\'s error page; email and password on screen (an emailed link would open Safari, so none is offered), how to set a password, Safari as the other way, and nothing overflows at 390px', st.gate && /not switched on for the installed app/.test(st.msg) && /Forgot password/.test(st.msg) && /\/logic in Safari/.test(st.msg) && st.focus === 'ols-email' && st.pass && st.forgot && !st.linkMode && st.submit === 'Sign in' && st.sw <= 390, st);
    else ok('the installed app with Google accepted: the tap goes on to Google by redirect and signs in', !st.gate && /demo@cleancell\.us/.test(st.who), st);
    if (shotsAt) await ip.screenshot({ path: path.join(shotsAt, name + '.png'), fullPage: true });
    await ictx.close();
  }
  /* A browser where Google's pop-up cannot open (an app's built-in browser,
     pop-ups blocked): a redirect through another site's auth helper never
     comes back ("missing initial state"), so the page says what to do
     instead; only a helper on this very site may take the redirect. */
  var bctx = await b.newContext({ viewport: { width: 390, height: 844 } }), bp = await bctx.newPage();
  bp.on('pageerror', function (e) { errs.push('popup-blocked: ' + e.message); });
  await bp.goto(base + '/app-sandbox/office', { waitUntil: 'domcontentloaded' }); await bp.waitForTimeout(500);
  await bp.evaluate(function () { var a = firebase.auth(); window.__redir = 0; a.signInWithPopup = function () { return Promise.reject({ code: 'auth/popup-blocked' }); }; a.signInWithRedirect = function () { window.__redir++; return Promise.resolve(); }; });
  await bp.click('#signin'); await bp.waitForTimeout(400);
  var blocked = await bp.evaluate(function () { return { msg: document.getElementById('ols-msg').textContent, redir: window.__redir }; });
  await bp.evaluate(function () { firebase.auth().app = { options: { authDomain: location.host } }; });
  await bp.click('#signin'); await bp.waitForTimeout(400);
  var home = await bp.evaluate(function () { return window.__redir; });
  ok('Google\'s pop-up blocked: no redirect through another site\'s helper, the person is told to use Safari/Chrome or email; with the helper on this site the redirect is taken', blocked.redir === 0 && /can\u2019t open in this browser/.test(blocked.msg) && /\/logic in Safari or Chrome/.test(blocked.msg) && home === 1, [blocked, home]);
  await bctx.close();
  ok('no JS errors', errs.length === 0, errs);
  ok('every /api/ route a page called is one the stub answers', missing.length === 0, missing);
  await b.close(); srv.close();
  console.log(fails ? '\n' + fails + ' render check(s) FAILED' : '\nrender checks: all passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
