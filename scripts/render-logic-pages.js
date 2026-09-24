#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Renders the Omega Logic materials pages in Chromium with Firebase and the
   endpoints stubbed, and checks they draw and behave. Not on the npm test
   chain — it needs the pre-installed Chromium — but it is the check that
   caught a scrolled-off column, a missing table shape and a stray status
   tag that no unit test would.

     node scripts/render-logic-pages.js            # prints a JSON line per page
     node scripts/render-logic-pages.js --shots DIR # also writes screenshots

   The fixtures are a plan computed by api/_lib/materials.js over a small
   catalogue, so what the pages render is what the engine decides. */
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
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0], q = req.url.split('?')[1] || '';
  function json(o) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  function posted(fn) { var body = ''; req.on('data', function (c) { body += c; }); req.on('end', function () { var b = {}; try { b = JSON.parse(body); } catch (e) {} json(fn(b)); }); }
  if (u === '/api/mes-scan') return posted(V.benchJson);
  if (u === '/api/customer-design' && req.method === 'POST') return posted(V.designPost);
  if (u.indexOf('/api/logic-plant') === 0) return json(V.plantJson(q));
  if (u.indexOf('/api/logic-materials') === 0) return json(/workOrder=/.test(q) ? V.soloJson() : V.materialsJson());
  if (u.indexOf('/api/logic-catalog') === 0) return json(V.catalogJson());
  if (u.indexOf('/api/logic-office') === 0) return json(V.officeJson());
  if (u === '/api/buyers' && req.method === 'POST') return posted(function (b) { return F.post(STATE, u, q, b, 'demo@cleancell.us'); });
  if (u.indexOf('/api/buyers') === 0) return json(V.buyersJson(q));
  if (u === '/api/my-account' && req.method === 'POST') return posted(function (b) { return F.post(STATE, u, q, b, 'ops@riverside.example'); });
  if (u.indexOf('/api/po-intake') === 0) return json(V.intakeJson(q, 'ops@riverside.example'));
  if (u.indexOf('/api/customer-portal') === 0) return json(V.portalJson);
  if (u.indexOf('/api/my-account') === 0) return json(V.accountJson());
  if (u.indexOf('/api/my-orders') === 0) return json(V.myOrdersJson());
  if (u === '/api/my-sites' && req.method === 'POST') return posted(function (b) { return F.post(STATE, u, q, b, 'ops@riverside.example'); });
  if (u.indexOf('/api/my-sites') === 0) return json(V.mySitesJson());
  if (u === '/api/logic-custody' && req.method === 'POST') return posted(function (b) { return F.post(STATE, u, q, b, 'demo@cleancell.us'); });
  if (u.indexOf('/api/logic-custody') === 0) { if (/template=/.test(q)) { res.writeHead(200, { 'Content-Type': 'text/csv' }); return res.end(require('../api/_lib/custody').csvTemplate()); } return json(V.custodyJson(q)); }
  if (u.indexOf('/api/logic-logistics') === 0) return json(V.logisticsJson());
  if (u === '/api/logic-kit' && req.method === 'POST') return posted(function (b) { KIT_SENDS.unshift({ id: 'k' + KIT_SENDS.length, orgId: b.org, audience: b.audience, to: b.to, channel: b.channel || 'email', note: b.note || '', by: 'tom@clearsky-usa.com', at: new Date().toISOString() }); return { ok: true }; });
  if (u.indexOf('/api/logic-kit') === 0) { var Kit = require('../api/_lib/kit'); if (!/org=/.test(q)) return json({ owner: true, subscribers: [{ id: 'cleancell.us', name: 'Clean Cell', status: 'active', domains: [] }], guides: Kit.GUIDES, items: Kit.ITEMS }); var kit = Kit.forOrg('cleancell.us', { name: 'Clean Cell' }); return json({ owner: true, org: 'cleancell.us', name: 'Clean Cell', status: 'active', brand: F.brand, kit: kit, messages: { plant: Kit.message(kit, 'plant'), office: Kit.message(kit, 'office'), customer: Kit.message(kit, 'customer') }, sends: KIT_SENDS }); }
  if (u.indexOf('/api/customer-design') === 0) return json(V.designJson());
  if (u.indexOf('/api/app-manifest') === 0) return json(V.manifest((/app=(\w+)/.exec(q) || [])[1], TENANT));
  if (u === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('window.CLEARSKY_CONFIG={firebase:{}};'); }
  if (u === '/omega-brand.js' || u === '/omega-tenant.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/* stub */'); }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';   /* Vercel clean URLs */
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
var fails = 0;
function ok(name, cond, detail) { if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); } }
(async function () {
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var b = await chromium.launch({ executablePath: CHROME });
  var ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('https://www.gstatic.com/**', function (r) { r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
  await ctx.addInitScript(function () { window.firebase = { apps: [1], initializeApp: function () {}, auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('t'); } }, onAuthStateChanged: function (fn) { setTimeout(function () { fn({ uid: 'u' }); }, 0); } }; } }; });
  var errs = [];
  async function check(name, url, steps) {
    var p = await ctx.newPage(); p.on('pageerror', function (e) { errs.push(name + ': ' + e.message); });
    await p.goto(base + url, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(400);
    var out = await steps(p);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '.png'), fullPage: true });
    await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(200);
    var hs = await p.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
    if (hs) console.log('  widest: ' + JSON.stringify(await p.evaluate(function () { var worst = null; Array.prototype.forEach.call(document.querySelectorAll('body *'), function (e) { if (e.closest('.logic-nav')) return; var r = e.getBoundingClientRect(); if (r.right > 392 && (!worst || r.right > worst.right)) worst = { right: Math.round(r.right), tag: e.tagName, cls: String(e.className).slice(0, 40), id: e.id }; }); return worst; })));
    ok(name + ' has no horizontal scroll at 390px', !hs);
    console.log(name + ' ' + JSON.stringify(out) + ' h-scroll@390: ' + hs);
    await p.close();
  }
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
    ok('the flow strip has the five stages with counts', flowTiles.length === 5 && /Requests & quotes1/.test(flowTiles[0]) && /Awaiting deposit1/.test(flowTiles[1]) && /In build1/.test(flowTiles[2]), flowTiles);
    ok('cash flow tiles: invoiced, received, outstanding, deposits awaiting, purchase list value', cash.length === 6 && /Invoiced.*\$591,475\.00/.test(cash[0]) && /Outstanding\$441,100\.00/.test(cash[2]) && /Deposits awaiting\$90,225\.00/.test(cash[3]) && /Purchase list value\$/.test(cash[4]), cash);
    ok('the floor tiles filled from the plant', floor === 4, floor);
    ok('the nav runs the business in order and has no website group for a tenant', navGroups.join('|') === 'Run the business|Build|Stock & supply|Deliver|Money|Setup', navGroups);
    ok('sign out is in the header', signout === 'Sign out');
    ok('orders are listed', rows === 3, rows);
    return { flowTiles: flowTiles, cash: cash, nav: navGroups.length };
  });
  await check('settings', '/logic-settings.html?org=cleancell.us', async function (p) {
    await p.waitForTimeout(400);
    var cards = await p.$$eval('.card h3', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('settings cards cover business, plant and subscription', cards.length === 8 && cards.indexOf('Stations & tablets') >= 0 && cards.indexOf('Customer terms') >= 0, cards);
    return { cards: cards.length };
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
    await p.waitForTimeout(600);
    var manifest = await p.evaluate(function () { return { m: document.querySelector('link[rel="manifest"]').getAttribute('href'), i: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href') }; });
    var tabs = await p.$$eval('#nav button', function (r) { return r.map(function (x) { return x.textContent.trim().replace(/^[^A-Za-z]+/, ''); }); });
    var kv = await p.$$eval('#today-kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    var needs = await p.$$eval('#view .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 80); }); });
    var head = await p.evaluate(function () { return { b: document.querySelector('[data-product-name]').textContent, w: document.getElementById('who').textContent }; });
    ok('the office app is Omega Logic, ClearSky\'s: one manifest with no company in it, its icon, the workspace shown inside', manifest.m === '/office/app.webmanifest' && /icons\/omega-logic-180/.test(manifest.i) && head.b === 'Omega Logic' && /^Clean Cell/.test(head.w), [manifest, head]);
    ok('  five tabs, QuickBooks-style: Home, Orders, Customers, Sites, Menu', tabs.join('|') === 'Home|Orders|Customers|Sites|Menu', tabs);
    ok('  today counts the stages and lists who needs a person: the open request and the unpriced order', kv.length === 4 && /To price\s*1/.test(kv[0]) && needs.some(function (t) { return /CC-26-4419.*1 customer request/.test(t); }) && needs.some(function (t) { return /CC-26-4421.*price/.test(t); }), [kv, needs]);
    await p.click('[data-tab="orders"]'); await p.waitForTimeout(300);
    var cards = await p.$$eval('#view .card', function (r) { return r.length; });
    await p.click('[data-order="o1"]'); await p.waitForTimeout(300);
    var h1 = await p.$eval('#view h1', function (e) { return e.textContent; });
    var answer = await p.$$eval('[data-resolve]', function (r) { return r.length; });
    var money = await p.$$eval('#view .kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    ok('  orders are listed and an order opens with its money, build and the request to answer', cards === 3 && /CC-26-4419/.test(h1) && answer === 1 && money.some(function (t) { return /Outstanding\s*\$350,875\.00/.test(t); }) && money.some(function (t) { return /Built/.test(t); }), [cards, h1, answer, money]);
    await p.click('[data-tab="menu"]'); await p.waitForTimeout(300); await p.click('[data-go="pos"]'); await p.waitForTimeout(500);
    var companies = await p.$$eval('#company option', function (r) { return r.length; });
    await p.selectOption('#company', 'company_riverside'); await p.waitForTimeout(500);
    await p.fill('#bulk-text', 'INC-4471, CC-C215, 4, InCharge Bakersfield, 1200 Depot Rd, Bakersfield, CA, 93307, 2026-11-15, dock B\nINC-4472, CC-C215, 2, InCharge Fresno, 88 Rail Ave, Fresno, CA, 93706');
    var preview = await p.$eval('#bulk-preview', function (e) { return e.textContent; });
    var contact = await p.$eval('#bulk-contact', function (e) { return e.value; });
    var queue = await p.$$eval('#company-body .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60); }); });
    ok('  a stack of POs is keyed in for a company: contact chosen, lines parsed, the uploaded PO under review listed', companies === 3 && contact === 'ops@riverside.example' && preview === '2 purchase orders, 2 lines' && queue.some(function (t) { return /RCC-2211.*po review/.test(t); }), [companies, contact, preview, queue]);
    await p.click('[data-tab="customers"]'); await p.waitForTimeout(400);
    var custCards = await p.$$eval('#view .card', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    ok('  customers are ACCOUNTS: each card is a company with its people, and one asking to join is flagged', custCards.length === 2 && /^InCharge Energy/.test(custCards[0]) && /nobody on it yet/.test(custCards[0]) && /^Riverside Cold Chain/.test(custCards[1]) && /3 people/.test(custCards[1]) && /1 asking to join/.test(custCards[1]) && /40% deposit/.test(custCards[1]), custCards);
    await p.click('[data-cust="company_incharge"]'); await p.waitForTimeout(400);
    var emptyAcct = await p.$eval('#view h1', function (e) { return e.textContent; });
    ok('  a company with nobody on it yet still opens, to add its first person', emptyAcct === 'InCharge Energy', emptyAcct);
    await p.click('#back'); await p.waitForTimeout(300);
    await p.click('[data-cust="company_riverside"]'); await p.waitForTimeout(400);
    var custKv = await p.$$eval('#view .kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    var dep = await p.$eval('#t-dep', function (e) { return e.value; });
    var people = await p.$$eval('#view h2', function (r) { return r.map(function (x) { return x.textContent; }); });
    var approve = await p.$$eval('[data-pact="active"]', function (r) { return r.map(function (x) { return x.getAttribute('data-email'); }); });
    var appLink = await p.$eval('#view', function (e) { return /\/portals\/customer\/app\?org=cleancell\.us/.test(e.textContent); });
    ok('  an account shows its people, its balance across them, the terms to edit and the customer app to send', people.indexOf('People · 3') >= 0 && approve.join('|') === 'new.hire@riverside.example' && custKv.some(function (t) { return /Balance\s*\$350,875\.00/.test(t); }) && dep === '40' && appLink, [people, approve, custKv, dep, appLink]);
    await p.click('[data-pact="active"]'); await p.waitForTimeout(600);
    var approved = await p.$$eval('[data-pact="active"]', function (r) { return r.length; });
    await p.waitForTimeout(400);
    var custSites = await p.$eval('#cust-sites', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    ok('  approving the request lets them in; the account\'s sites and shipped units are on the same screen', approved === 0 && /Riverside yard/.test(custSites) && /CC418-26-44192/.test(custSites), [approved, custSites.slice(0, 200)]);
    await p.click('[data-tab="menu"]'); await p.waitForTimeout(300); await p.click('[data-go="stock"]'); await p.waitForTimeout(500);
    var stock = await p.$$eval('#stock-body .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 70); }); });
    var assign = await p.$$eval('[data-assign]', function (r) { return r.length; });
    var opts = await p.$$eval('select[data-for] option', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('  stock counts finished units, offers to assign each available one to the order that needs it, and lists what is short', /CC-C215.*2 available/.test(stock[0]) && assign === 2 && opts.some(function (o) { return /CC-26-4419/.test(o); }) && stock.some(function (t) { return /on hand/.test(t); }) && stock.some(function (t) { return /PO-1001/.test(t); }), [stock, assign, opts]);
    await p.click('[data-tab="today"]'); await p.waitForTimeout(300);
    var hubs = await p.$$eval('#hubs [data-hub]', function (r) { return r.length; });
    await p.click('[data-hub="plant"]'); await p.waitForTimeout(300);
    var hubRows = await p.$$eval('.rows b', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('  sign in, then pick a hub: Home opens on the hubs and a hub opens its list', hubs === 8 && hubRows.join('|') === 'Plant app|Bench scan station|Work orders|Plant board', [hubs, hubRows]);
    await p.click('[data-tab="menu"]'); await p.waitForTimeout(300);
    var freq = await p.$$eval('.freq > *', function (r) { return r.map(function (x) { return x.textContent.replace(/[^A-Za-z ]/g, '').trim(); }); });
    var panels = await p.$$eval('[data-panel]', function (r) { return r.map(function (x) { return x.textContent.replace(/^[^A-Za-z]+/, '').trim(); }); });
    await p.click('[data-panel="deliver"]'); await p.waitForTimeout(200);
    var rows = await p.$$eval('.rows b', function (r) { return r.map(function (x) { return x.textContent; }); });
    await p.fill('#qsearch', 'register'); await p.waitForTimeout(200);
    var hits = await p.$$eval('.rows b', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('  Menu holds every function the QuickBooks way: frequently used, panels that open to their list, search', freq.join('|') === 'Orders|PO loads|Customers|Sites|Stock|Register|Plant' && panels.join('|') === 'Sales & orders|Customer hub|Plant|Deliver & sites|Stock & supply|Money|Setup|Help & guides' && rows.join('|') === 'Sites & custody|Fleet register|Shipping & receiving|Sites & imports' && hits.join('|') === 'Fleet register', [freq, panels, rows, hits]);
    await p.click('[data-tab="sites"]'); await p.waitForTimeout(600);
    var h2s = await p.$$eval('#sites-body h2', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    var loadOpts = await p.$$eval('#rc-load option', function (r) { return r.map(function (x) { return x.textContent; }); });
    await p.fill('#su-serial', 'CC418-26-44192'); await p.click('#su-go'); await p.waitForTimeout(500);
    var su = await p.$eval('#su-body', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    var moves = await p.$$eval('#su-body [data-move]', function (r) { return r.map(function (x) { return x.getAttribute('data-move'); }); });
    ok('  the Sites tab mirrors the desktop: the customer says, receive a load, unit passport, sites, and a unit opens with only the moves that apply', /^The customer says/.test(h2s[0]) && h2s.some(function (t) { return /Receive a load/.test(t); }) && h2s.some(function (t) { return /Unit passport/.test(t); }) && h2s.some(function (t) { return /^Sites · 1/.test(t); }) && loadOpts.some(function (t) { return /LOAD-1 · 1 unit/.test(t); }) && /in transit/.test(su) && /going to|no site assigned/.test(su) && moves.join('|') === 'receive', [h2s, loadOpts, su.slice(0, 200), moves]);
    return { tabs: tabs.length, cards: cards, companies: companies, preview: preview, assign: assign };
  });
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
    await p.waitForTimeout(700);
    var manifest = await p.evaluate(function () { return { m: document.querySelector('link[rel="manifest"]').getAttribute('href'), i: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), b: document.getElementById('brand').textContent }; });
    var tabs = await p.$$eval('#nav button', function (r) { return r.map(function (x) { return x.textContent.trim().replace(/^[^A-Za-z]+/, ''); }); });
    var hero = await p.$eval('.card.hero', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    var plans = await p.$$eval('#design-body a.unit', function (r) { return r.map(function (x) { return x.getAttribute('href'); }); });
    ok('the customer app wears the tenant\'s customer manifest, icon and name', /app-manifest\?org=cleancell\.us&app=customer/.test(manifest.m) && /cleancell\/icons\/customer-180/.test(manifest.i) && manifest.b === 'Clean Cell', manifest);
    ok('  four tabs, Design first', tabs.join('|') === 'Design|Orders|POs|Account', tabs);
    ok('  Editor Lite is the hero, on trial, and a site plan opens in it on this customer account', /Editor Lite/.test(hero) && /trial/.test(hero) && plans.length === 1 && /editor-lite\.html\?customer=1&org=cleancell\.us&project=p1/.test(plans[0]), [hero, plans]);
    await p.fill('#sz-kw', '400'); await p.fill('#sz-h', '2'); await p.click('#sz-go'); await p.waitForTimeout(500);
    var sized = await p.$eval('#sz-out', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    ok('  quick size against the supplier\'s catalog: 400 kW for 2 h is four 215 kWh cabinets', /4 × 215 kWh/.test(sized) && /400 kW · 860 kWh/.test(sized), sized);
    await p.click('#sz-po'); await p.waitForTimeout(500);
    var prefill = await p.$eval('#bulk-text', function (e) { return e.value; });
    var preview = await p.$eval('#bulk-preview', function (e) { return e.textContent; });
    var queue = await p.$$eval('#pos-body .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60); }); });
    ok('  "send as a PO" lands on the PO sheet with the sized line; the company\'s POs under review and orders are listed', /CC-C215, 4,/.test(prefill) && /1 purchase order, 1 line/.test(preview) && queue.some(function (t) { return /RCC-2211/.test(t); }) && queue.some(function (t) { return /RCC-2200/.test(t); }), [prefill, preview, queue]);
    await p.click('[data-tab="orders"]'); await p.waitForTimeout(500);
    var order = await p.$eval('#orders-body .card', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    var track = await p.$$eval('#orders-body .track i', function (r) { return r.map(function (x) { return x.className; }).join(','); });
    var form = await p.$$eval('form[data-req]', function (r) { return r.length; });
    ok('  an order shows its milestone track, invoices and the open request, with a form to ask', /CC-26-4419/.test(order) && /Building/.test(order) && track === 'done,done,on,,,' && /Order total\s*\$501,250\.00/.test(order) && /Deliver to the Bakersfield yard/.test(order) && form === 1, [order.slice(0, 120), track, form]);
    await p.click('[data-tab="account"]'); await p.waitForTimeout(400);
    var acct = await p.$$eval('#acct-body .kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    ok('  the account shows its number, rep and terms', acct.some(function (t) { return /company_riverside/.test(t); }) && acct.some(function (t) { return /Sam Rep/.test(t); }) && acct.some(function (t) { return /Deposit\s*40%/.test(t); }), acct);
    var ppl = await p.$$eval('#acct-body [data-person]', function (r) { return r.map(function (x) { return x.getAttribute('data-person') + ':' + x.getAttribute('data-to'); }); });
    var addForm = await p.$$eval('#p-add', function (r) { return r.length; });
    var attrib = await p.$eval('#attribution', function (e) { return e.hidden ? '' : e.textContent; });
    ok('  the owner sees the people on the account, approves a request, turns a colleague off, adds one; the app says "powered by" as the contract does', ppl.length === 2 && ppl[0] === 'finance@riverside.example:disabled' && /^new\.hire@riverside\.example:/.test(ppl[1]) && addForm === 1 && attrib === 'Powered by ClearSky OMEGA', [ppl, addForm, attrib]);
    await p.waitForTimeout(400);
    var sb = await p.$eval('#sites-body', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    var acts = await p.$$eval('#sites-body [data-act]', function (r) { return r.map(function (x) { return x.getAttribute('data-act'); }); });
    ok('  Sites & equipment lists the customer\'s site and the received unit with its warranty pending until a site is chosen; going-to and assign apply', /Riverside yard/.test(sb) && /PG&E · POI MSB-2/.test(sb) && /CC418-26-44192/.test(sb) && /received/.test(sb) && /no site assigned/.test(sb) && acts.join('|') === 'destination|assign', [sb.slice(0, 240), acts]);
    await p.selectOption('#sites-body [data-site="0"]', 'site_company-riverside-riverside-yard-93307'); await p.click('#sites-body [data-act="assign"]'); await p.waitForTimeout(700);
    var sb2 = await p.$eval('#sites-body', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    var acts2 = await p.$$eval('#sites-body [data-act]', function (r) { return r.map(function (x) { return x.getAttribute('data-act'); }); });
    ok('  binding the unit to the site starts the warranty from the ship date; commissioning is now the customer\'s next move', /assigned to site/.test(sb2) && /until 2036-09-10 · from 2026-09-10/.test(sb2) && /1 unit/.test(sb2) && acts2.join('|') === 'assign|commissioned', [sb2.slice(0, 240), acts2]);
    ok('  what the customer declared is marked as awaiting the supplier\'s confirmation', /awaiting your supplier's confirmation/.test(sb2), sb2.slice(0, 300));
    return { tabs: tabs.length, plans: plans.length, sized: sized.slice(0, 40), form: form };
  });
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
    ok('Apps & guides lists every app, page, sandbox and guide for the subscriber with a message per audience', nav === 'Apps & guides' && heads.join('|') === 'Customer|Office|Plant' && urls.some(function (u) { return /portals\/customer\/app\?org=cleancell\.us/.test(u); }) && urls.some(function (u) { return /office\/app\?org=cleancell\.us/.test(u); }) && urls.some(function (u) { return /plant\/app\?org=cleancell\.us/.test(u); }) && /Customer app: https:\/\/silmarillion/.test(msg) && /Add to Home Screen/.test(msg) && /Omega-Logic-Customer-App\.pdf/.test(msg) && guides.length === 4 && guides.some(function (g) { return /Omega-Logic-Office-App\.pdf/.test(g); }), [nav, heads, urls.length, msg.slice(0, 120), guides]);
    await p.fill('#s-to', 'robert.bucher@cleancell.us'); await p.fill('#s-note', 'Customer kit with the PDF'); await p.click('#sent button'); await p.waitForTimeout(800);
    var log = await p.$$eval('#send-list tbody tr', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    var kst = await p.$eval('#status', function (e) { return e.textContent; });
    ok('  a send is logged against the subscriber with who, what and when', log.length === 1 && /customer/.test(log[0]) && /robert\.bucher@cleancell\.us/.test(log[0]) && /jarvis/.test(log[0]) && /Customer kit with the PDF/.test(log[0]), [log, kst]);
    return { heads: heads.length, urls: urls.length, guides: guides.length, log: log.length };
  });
  /* The sandboxes: the same pages with sandbox.js in place of Firebase and
     /api/. Nothing below reaches the stub server's /api/ routes — the page
     answers itself — and what a tap changes survives a reload. */
  await check('sandbox-office', '/app-sandbox/office', async function (p) {
    await p.waitForTimeout(400);
    var stripLinks = await p.$$eval('.sb-strip a', function (r) { return r.map(function (x) { return x.getAttribute('href'); }); });
    var fb = await p.evaluate(function () { return typeof firebase.auth().signInWithPopup === 'function' && !firebase.auth().currentUser; });
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
    return { strip: stripLinks.length, kv: kv, answered: answered.length };
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
    var hero = await p.$eval('.card.hero', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); }), who = await p.$eval('#who', function (e) { return e.textContent; });
    ok('the customer sandbox signs in with any email and opens on Editor Lite', gate && who === 'ops@riverside.example' && /Editor Lite/.test(hero) && /trial/.test(hero), [gate, who, hero.slice(0, 60)]);
    await p.click('[data-tab="pos"]'); await p.waitForTimeout(500);
    await p.fill('#bulk-text', 'INC-9001, CC-C215, 3, InCharge Fresno, 88 Rail Ave, Fresno, CA, 93706, 2026-12-01, dock 4');
    p.once('dialog', function (d) { d.accept(); }); await p.click('#bulk-go'); await p.waitForTimeout(700);
    var result = await p.$eval('#bulk-result', function (e) { return e.textContent; });
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800); await p.click('[data-tab="pos"]'); await p.waitForTimeout(500);
    var rows = await p.$$eval('#pos-body .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 50); }); });
    ok('  a PO sent from the phone is an order awaiting pricing after a reload', /INC-9001 → PO-IN-/.test(result) && rows.some(function (t) { return /INC-9001/.test(t); }), [result, rows]);
    await p.click('[data-tab="account"]'); await p.waitForTimeout(600);
    var going = await p.$$eval('#sites-body [data-dest]', function (r) { return r.length; });
    await p.selectOption('#sites-body [data-dest="0"]', 'site_company-riverside-riverside-yard-93307'); await p.click('#sites-body [data-act="destination"]'); await p.waitForTimeout(700);
    var unit = await p.$eval('#sites-body [data-unit]', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    p.once('dialog', function (d) { d.accept(); }); await p.click('#sites-body [data-act="received"]'); await p.waitForTimeout(700);
    var unit2 = await p.$eval('#sites-body [data-unit]', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); });
    ok('  "this one is going there": the customer names the site while the unit is in transit; receiving it binds it there, awaiting the supplier\'s confirmation, and the warranty runs', going === 1 && /in transit/.test(unit) && /going to Riverside yard/.test(unit) && /received/.test(unit2) && /at Riverside yard · awaiting your supplier's confirmation/.test(unit2) && /until 2036-09-10/.test(unit2), [going, unit.slice(0, 160), unit2.slice(0, 220)]);
    return { who: who, result: result.slice(0, 40) };
  });
  ok('no JS errors', errs.length === 0, errs);
  await b.close(); srv.close();
  console.log(fails ? '\n' + fails + ' render check(s) FAILED' : '\nrender checks: all passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
