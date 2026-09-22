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
var CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var PW = process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright';
if (!fs.existsSync(CHROME) || !fs.existsSync(PW)) { console.log('render-logic-pages: Chromium or Playwright not found; skipped'); process.exit(0); }
var chromium = require(PW).chromium;
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || os.tmpdir()) : null; })();

require.cache[require.resolve(path.join(ROOT, 'api/_lib/admin'))] = { id: 'admin', filename: 'admin', loaded: true, exports: { httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } } };
var M = require(path.join(ROOT, 'api/_lib/materials')), C = require(path.join(ROOT, 'api/_lib/logic-catalog'));

var CATALOG = [
  { sku: 'CC-C215', name: '215 kWh outdoor cabinet', kind: 'product', kw: 100, kwh: 215, widthFt: 4.5, depthFt: 3.5, leadTimeDays: 20, priceMode: 'quote', bom: [{ sku: 'CC-MOD-52', qty: 8, unit: 'ea' }, { sku: 'CC-BMS-M', qty: 1, unit: 'ea' }, { sku: 'CC-ENC-1B', qty: 1, unit: 'ea' }] },
  { sku: 'CC-C418', name: '418 kWh outdoor cabinet', kind: 'product', kw: 200, kwh: 418, widthFt: 7.5, depthFt: 4.5, leadTimeDays: 30, priceMode: 'quote', bom: [] },
  { sku: 'CC-MOD-52', name: '5.2 kWh module', kind: 'component', kwh: 5.2, unit: 'ea', leadTimeDays: 10, bom: [{ sku: 'CC-CELL-280', qty: 104, unit: 'ea', yieldPct: 98 }, { sku: 'CC-HARN', qty: 2.5, unit: 'm' }] },
  { sku: 'CC-CELL-280', name: 'LFP cell 280 Ah', kind: 'component', unit: 'ea', moq: 1000, leadTimeDays: 60, supplier: 'EVE Energy', supplierSku: 'LF280K', safetyStock: 2000 },
  { sku: 'CC-BMS-M', name: 'Master BMS', kind: 'component', unit: 'ea', leadTimeDays: 30, supplier: 'Orion' },
  { sku: 'CC-ENC-1B', name: 'Single-bay enclosure', kind: 'component', unit: 'ea', leadTimeDays: 45 },
  { sku: 'CC-HARN', name: 'HV harness', kind: 'component', unit: 'm', leadTimeDays: 14 },
  { sku: 'INSTALL', name: 'Commissioning', kind: 'service' }
];
var SOURCING = { revision: 3,
  suppliers: { sup_eve: { name: 'EVE Energy', contact: 'Li Wei', email: 'li@eve.example', terms: 'Net 30', leadTimeDays: 60, active: true },
               sup_orion: { name: 'Orion', email: 'sales@orion.example', active: true } },
  prices: { 'CC-CELL-280': [{ supplierId: 'sup_eve', unitCost: 38.5, moq: 1000, leadTimeDays: 70, supplierSku: 'LF280K', preferred: true }],
            'CC-BMS-M': [{ supplierId: 'sup_orion', unitCost: 320, preferred: true }] } };
var STOCK = { 'CC-MOD-52': { onHand: 8 }, 'CC-CELL-280': { onHand: 500, onOrder: 1000 } };
var WORKS = [{ id: 'wo_1', orderNo: 'CC-26-4419', status: 'awaiting_serials', requirements: [{ sku: 'CC-C215', qty: 5 }], dueDate: '2026-11-14' }];
var ORDERS = [{ id: 'a', orderNo: 'CC-26-4420', status: 'accepted', items: [{ sku: 'CC-C215', qty: 2 }], promisedShipAt: '2026-12-05' }, { id: 'b', orderNo: 'CC-26-4421', status: 'new', items: [{ sku: 'CC-C418', qty: 3 }] }];
var NOW = '2026-09-21';
var planned = M.plan({ now: NOW, products: CATALOG, stock: STOCK, works: WORKS, orders: ORDERS, sourcing: SOURCING });
var brand = { name: 'Clean Cell', primary: '#3FAFC6', accent: '#EE5A4F', ink: '#0B2733' };
var materialsJson = Object.assign({ org: 'cleancell.us', name: 'Clean Cell', brand: brand, owner: false, stockRevision: 2, catalogRevision: 5, components: 5, withBom: 2, limited: false,
  projection: M.projection({ now: NOW, products: CATALOG, stock: STOCK, works: WORKS, orders: ORDERS, sourcing: SOURCING, supplies: [{ sku: 'CC-CELL-280', qty: 2500, at: '2026-11-01' }] }, { weeks: 12 }),
  bySupplier: M.purchaseBySupplier(planned), sourcingRevision: 3, prices: SOURCING.prices,
  suppliers: Object.keys(SOURCING.suppliers).map(function (id) { return Object.assign({ id: id }, SOURCING.suppliers[id]); }),
  purchaseOrders: [{ id: 'po1', supplier: 'EVE Energy', supplierId: 'sup_eve', reference: 'PO-1001', expectedAt: '2026-11-01', note: 'air freight', status: 'partial', createdAt: '2026-09-20T10:00:00Z', createdBy: 'plant@cleancell.us', receivedAt: null,
    lines: [{ sku: 'CC-CELL-280', name: 'LFP cell 280 Ah', unit: 'ea', qty: 4000, received: 1500 }], receipts: [] }] }, planned);
var catalogJson = { org: 'cleancell.us', brand: brand, owner: true, revision: 5, products: CATALOG.map(C.view), designProducts: C.designs({ products: CATALOG }) };
var solo = M.plan({ now: NOW, products: CATALOG, stock: STOCK, works: WORKS, orders: [], sourcing: SOURCING });
var soloJson = { org: 'cleancell.us', workOrder: { id: 'wo_1', orderNo: 'CC-26-4419', status: 'awaiting_serials', dueDate: '2026-11-14' }, feasible: false, short: M.shortfallsByWorksOrder(solo)['CC-26-4419'] || [], unknownSkus: [], hasBom: true };
var flow = { version: 1, lines: [{ id: 'line_1', name: 'North line', location: 'Building A' }], routing: [{ key: 'kit', label: 'Kitting' }, { key: 'eol', label: 'EOL test' }, { key: 'ready', label: 'Ready' }] };
var wo = { id: 'wo_1', orgId: 'cleancell.us', orderNo: 'CC-26-4419', status: 'awaiting_serials', lineId: 'line_1', routing: flow.routing, flowVersion: 1, requirements: [{ sku: 'CC-C215', qty: 5 }], dueDate: '2026-11-14', managerRevision: 0 };
function plantJson(q) {
  if (/page=works/.test(q)) return { rows: [wo], next: null };
  if (/page=units|page=stations/.test(q)) return { rows: [], next: null };
  if (/workOrder=/.test(q)) return { workOrder: wo, units: [], limited: false };
  return { name: 'Clean Cell', owner: false, flow: flow, brand: brand, worksOrders: [wo], units: [], limited: false };
}
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
/* The bench: a paired station, one unit with two steps at Rack assembly. The
   responses are shaped like api/mes-scan.js and computed by plant-work.js. */
var W = require('../api/_lib/plant-work'), Plant = require('../api/_lib/plant');
var benchBy = {}; CATALOG.forEach(function (p) { benchBy[p.sku] = p; });
var benchCab = { sku: 'CC-C215', name: 'Cabinet', bom: [{ sku: 'CC-MOD-52', qty: 2, unit: 'ea', station: 'rack', step: '1 · Fit modules' }, { sku: 'CC-HARN', qty: 2.5, unit: 'm', station: 'rack', step: '2 · Harness' }] };
var benchUnit = { serial: 'CC418-26-44190', sku: 'CC-C215', at: 'rack', work: {}, hold: null };
var benchSteps = W.stepsFor(benchCab, 'rack', benchBy, ['Torque busbars']);
function benchJson(b) {
  var routing = Plant.DEFAULT_ROUTING.map(function (s) { return { key: s.key, label: s.label }; });
  if (b.action === 'describe') return { ok: true, station: 'rack', stationLabel: 'Bay 2 · Rack assembly', lineId: 'main', location: 'Bay 2', instructions: 'Fit modules bottom-up.', revision: 1, machine: false, brand: brand };
  if (b.action === 'issue' || b.action === 'step-done') {
    var v = b.action === 'issue' ? W.judgeIssue(benchUnit, 'rack', routing, benchSteps, b.code, b.qty) : W.judgeStepDone(benchUnit, 'rack', routing, benchSteps, b.stepId);
    var patch = b.action === 'issue' ? W.applyIssue(benchUnit, 'rack', v, 'now', b.lot) : W.applyStepDone(benchUnit, 'rack', v, 'now');
    if (patch) benchUnit.work.rack = patch;
    return { ok: !!v.ok, action: v.action || null, reason: v.reason || null, say: v.say, serial: benchUnit.serial, station: 'rack', work: W.statusOf(benchUnit, 'rack', benchSteps) };
  }
  var serial = Plant.serialFrom(b.serial);
  if (serial !== benchUnit.serial) return { ok: false, reason: 'unknown_unit', say: 'That serial is not on any open works order here.', serial: serial, station: 'rack', routing: routing };
  return { ok: true, action: 'duplicate', say: 'Already at Rack assembly.', serial: serial, station: 'rack', unit: { serial: serial, at: 'rack', wo: 'wo_1' }, routing: routing,
    workOrder: 'wo_1', product: 'Cabinet', work: W.statusOf(benchUnit, 'rack', benchSteps), instructions: 'Fit modules bottom-up.' };
}
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0], q = req.url.split('?')[1] || '';
  function json(o) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  if (u === '/api/mes-scan') { var body = ''; req.on('data', function (c) { body += c; }); return req.on('end', function () { var b = {}; try { b = JSON.parse(body); } catch (e) {} json(benchJson(b)); }); }
  if (u.indexOf('/api/logic-plant') === 0) return json(plantJson(q));
  if (u.indexOf('/api/logic-materials') === 0) return json(/workOrder=/.test(q) ? soloJson : materialsJson);
  if (u.indexOf('/api/logic-catalog') === 0) return json(catalogJson);
  if (u === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('window.CLEARSKY_CONFIG={firebase:{}};'); }
  if (u === '/omega-brand.js' || u === '/omega-tenant.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/* stub */'); }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
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
  ok('no JS errors', errs.length === 0, errs);
  await b.close(); srv.close();
  console.log(fails ? '\n' + fails + ' render check(s) FAILED' : '\nrender checks: all passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
