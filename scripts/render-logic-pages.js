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
/* the plant map: six cabinets with real timings off done{} */
var Stats = require('../api/_lib/plant-stats');
function T(h) { return new Date(Date.now() - (200 - h) * 3600000).toISOString(); }
var mapUnits = [
  { serial: 'CC418-26-44190', sku: 'CC-C215', shipUnit: true, startedAt: T(0), done: { kit: T(2), module: T(10), rack: T(14), encl: T(16), elec: T(20), bms: T(22), eol: T(23), qa: T(25), pack: T(26) }, at: 'ready', arrivedAt: T(26), inventoryStatus: 'available', unitType: 'cabinet' },
  { serial: 'CC418-26-44191', sku: 'CC-C215', shipUnit: true, startedAt: T(1), done: { kit: T(3), module: T(15), rack: T(18), encl: T(20), elec: T(24), bms: T(26), eol: T(27), qa: T(29), pack: T(30) }, at: 'ready', arrivedAt: T(30), inventoryStatus: 'available', unitType: 'cabinet' },
  { serial: 'CC418-26-44192', sku: 'CC-C215', shipUnit: true, startedAt: T(4), done: { kit: T(6), module: T(40), rack: T(43), encl: T(45), elec: T(49), bms: T(51), eol: T(52), qa: T(54), pack: T(55) }, at: 'ready', arrivedAt: T(55), inventoryStatus: 'allocated', orderId: 'o1', orderNo: 'CC-26-4419', unitType: 'cabinet' },
  { serial: 'CC418-26-44193', sku: 'CC-C215', shipUnit: true, startedAt: T(60), done: { kit: T(62) }, at: 'module', arrivedAt: T(62), inventoryStatus: 'building', unitType: 'cabinet' },
  { serial: 'CC418-26-44194', sku: 'CC-C215', shipUnit: true, startedAt: T(70), done: { kit: T(71), module: T(90) }, at: 'rack', arrivedAt: T(90), hold: 'NCR-26-89', inventoryStatus: 'building', unitType: 'cabinet' },
  { serial: 'CC418-26-44195', sku: 'CC-C215', shipUnit: true, at: '', done: {}, inventoryStatus: 'building', unitType: 'cabinet' }
];
function mapJson() { var routing = Plant.DEFAULT_ROUTING.map(function (s) { return s.key === 'bms' ? { key: s.key, label: s.label, checks: ['Load firmware'] } : s; }); var m = Stats.stationMap(routing, mapUnits, Date.now(), { shipUnitsOnly: true }); m.steps = Stats.stepsByStation(routing, [benchCab].concat(CATALOG), W.stepsFor); m.lines = flow.lines; m.sampledLimit = false; return { name: 'Clean Cell', owner: false, brand: brand, map: m }; }
var officeJson = { owner: false, org: 'cleancell.us', name: 'Clean Cell', brand: brand, active: true, config: { terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } }, products: 8, bundle: { included: ['OEM order operations'], subscriptionDue: null },
  links: { office: '/omega-logic?org=cleancell.us', factory: '/plant/?org=cleancell.us', customers: '/portals/customer/admin.html?org=cleancell.us', start: '/customer-start.html?org=cleancell.us', mission: '/mission', setup: '/whitelabel-setup.html', storefront: null, customer: '/portals/customer/', preview: '/editor-lite.html', editor: '/editor-lite.html' },
  orders: [
    { id: 'o1', orderNo: 'CC-26-4419', status: 'in_fulfilment', customer: { name: 'Riverside Cold Chain', email: 'ops@riverside.example' }, items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], worksOrderId: 'wo_1', logic: { commercial: { baseCents: 50000000, feeCents: 125000, totalCents: 50125000, depositCents: 15037500, terms: { depositPct: 30, dueDays: 0 } }, invoices: { deposit: { amountCents: 15037500, paidCents: 15037500, status: 'paid' }, balance: { amountCents: 35087500, paidCents: 0, status: 'open' } }, acceptedAt: '2026-09-01', releasedAt: '2026-09-02', requirements: [{ sku: 'CC-C215', qty: 4 }], allocatedSerials: ['CC418-26-44192'] }, requests: [{ id: 'r1', kind: 'shipping', message: 'Deliver to the Bakersfield yard instead', status: 'open', at: '2026-09-20T10:00:00Z', by: 'ops@riverside.example' }] },
    { id: 'o2', orderNo: 'CC-26-4420', status: 'accepted', customer: { name: 'Sierra Storage', email: 'buy@sierra.example' }, items: [{ sku: 'CC-C418', name: '418 kWh', qty: 2 }], logic: { commercial: { baseCents: 30000000, feeCents: 75000, totalCents: 30075000, depositCents: 9022500, terms: { depositPct: 30, dueDays: 0 } }, invoices: { deposit: { amountCents: 9022500, paidCents: 0, status: 'open' } }, acceptedAt: '2026-09-18', requirements: [], allocatedSerials: [] } },
    { id: 'o3', orderNo: 'CC-26-4421', status: 'new', customer: { name: 'InCharge Energy', email: 'po@incharge.example' }, items: [{ sku: 'CC-C215', name: '215 kWh', qty: 20 }], logic: null }
  ], limited: false };
/* The board, operations and attention pages the manager and the phone app
   read (api/logic-plant.js page=board|ops|attention), rolled up by the same
   pure libraries the endpoint uses over the fixture's work order and units. */
var Board = require('../api/_lib/plant-board'), Ops = require('../api/_lib/plant-ops'), Attention = require('../api/_lib/plant-attention');
function boardJson(q) {
  var now = new Date().toISOString(), units = mapUnits.map(function (u) { return Object.assign({ orgId: 'cleancell.us', woId: 'wo_1', orderNo: 'CC-26-4419' }, u); });
  var rows = [Board.row(wo, units, now)], common = { name: 'Clean Cell', owner: false, flow: flow, brand: brand, asOf: now, rows: rows, limited: false, unitsLimited: false, links: {} };
  if (/page=board/.test(q)) return common;
  return Object.assign(common, { floor: Ops.floor([], now, 14), queues: Ops.queues(rows), demand: Ops.demand(rows), stock: Ops.stock([]), completed: Ops.completed(rows), scansLimited: false, stockLimited: false });
}
function plantJson(q) {
  if (/map=1/.test(q)) return mapJson();
  if (/page=board|page=ops/.test(q)) return boardJson(q);
  if (/page=attention/.test(q)) return Object.assign(Attention.attention(mapUnits, [], flow.routing, new Date().toISOString(), {}), { name: 'Clean Cell', owner: false, brand: brand, sampled: mapUnits.length, sampledLimit: false, links: {} });
  if (/page=works/.test(q)) return { rows: [wo], next: null };
  if (/page=units/.test(q)) return { rows: mapUnits.map(function (u) { return Object.assign({ id: 'cleancell.us__' + u.serial, orgId: 'cleancell.us', woId: 'wo_1' }, u); }), next: null };
  if (/page=stations/.test(q)) return { rows: [], next: null };
  if (/workOrder=/.test(q)) { var wUnits = mapUnits.map(function (u) { return Object.assign({ orgId: 'cleancell.us', woId: 'wo_1', orderNo: 'CC-26-4419' }, u); }), wNow = new Date().toISOString(); return { workOrder: wo, board: Board.row(wo, wUnits, wNow), activity: Board.activity(wUnits, wo, 50), units: mapUnits.slice(3, 5).map(function (u) { return Object.assign({}, u, { woId: 'wo_1', progress: { station: u.at, done: 1, total: 3, open: ['2 · Harness', 'Torque busbars'], complete: false } }); }), limited: false }; }
  return { name: 'Clean Cell', owner: false, flow: flow, brand: brand, worksOrders: [wo], units: mapUnits.map(function (u) { return Object.assign({ orgId: 'cleancell.us', woId: 'wo_1', orderNo: 'CC-26-4419' }, u); }), limited: false };
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
  if (b.action === 'describe' && b.stationId === 'st-phone') return { ok: true, station: '*', roaming: true, stationLabel: 'Marco’s phone', lineId: 'main', location: '', instructions: '', revision: 1, machine: false, brand: brand, routing: routing.filter(function (s) { return s.key !== 'eol'; }) };
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
/* The office app reads the stage the endpoint computes (api/_lib/office-stage)
   and the totals by stage; the fixture orders get them the same way. */
var S = require('../api/_lib/office-stage');
function officeWithStages() { var orders = officeJson.orders.map(function (o) { return Object.assign({}, o, { stage: S.stageOf(o) }); }); return Object.assign({}, officeJson, { orders: orders, totals: S.totals(orders) }); }
/* The customer center and the PO intake, as api/buyers.js and api/po-intake.js
   answer them: one company account with one login, one uploaded PO waiting. */
var buyerDetail = { customerId: 'company_riverside', company: 'Riverside Cold Chain', name: 'Dana Ops', email: 'ops@riverside.example', phone: '', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, activated: true, createdAt: '2026-08-01T00:00:00Z', plan: 'free', status: 'active', terms: { depositPct: 40, dueDays: 0 }, portalUrl: 'https://silmarillion.clearskyomega.com/portals/customer/?org=cleancell.us',
  orders: [{ id: 'o1', orderNo: 'CC-26-4419', status: 'in_fulfilment', stage: S.stageOf(officeJson.orders[0]), items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], invoicedCents: 50125000, paidCents: 15037500, balanceCents: 35087500, shippedAt: null, openRequests: 1 }],
  totals: { invoicedCents: 50125000, paidCents: 15037500, balanceCents: 35087500, openRequests: 1 }, limited: false };
function buyersJson(q) {
  if (/email=/.test(q)) return buyerDetail;
  return { org: 'cleancell.us', name: 'Clean Cell', brand: brand, owner: false, portalUrl: buyerDetail.portalUrl, next: null, customers: [
    { id: 'company_riverside', company: 'Riverside Cold Chain', status: 'active', terms: { depositPct: 40, dueDays: 0 }, users: [{ email: 'ops@riverside.example', name: 'Dana Ops', role: 'owner', activated: true }], usersLimited: false },
    { id: 'company_incharge', company: 'InCharge Energy', status: 'active', terms: { depositPct: 30, dueDays: 0 }, users: [], usersLimited: false }] };
}
var companyJson = { office: true, brand: brand, company: { id: 'company_riverside', name: 'Riverside Cold Chain', rep: null }, reps: [], terms: { depositPct: 40, dueDays: 0 },
  products: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', kind: 'product' }, { sku: 'CC-C418', name: '418 kWh outdoor cabinet', kind: 'product' }],
  contacts: [{ email: 'ops@riverside.example', name: 'Dana Ops', role: 'owner' }],
  intake: [{ id: 'po_x', orderNo: 'PO-IN-X', poNumber: 'RCC-2211', status: 'po_review', source: 'customer', notes: 'see attached', createdAt: '2026-09-19T10:00:00Z', reviewNote: '', convertedAt: null, rep: null, files: [] }],
  orders: [{ id: 'o1', orderNo: 'CC-26-4419', status: 'in_fulfilment', poNumber: 'RCC-2200', items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], destinations: [{ id: 'd1', address: { name: 'Riverside yard', city: 'Bakersfield', state: 'CA' }, items: [{ sku: 'CC-C215', qty: 5 }] }], revision: 1, legs: [] }], limited: false };
function intakeJson(q) {
  if (/office=1/.test(q) && !/customerId=/.test(q)) return { office: true, brand: brand, companies: buyersJson('').customers.map(function (c) { return { id: c.id, name: c.company, status: c.status, rep: null }; }), reps: [], limited: false };
  return Object.assign({}, companyJson, { office: /office=1/.test(q) });
}
/* What the customer app reads: the public portal record, their account,
   their orders as api/_lib/portal.js projects them, and their site plans. */
var portalJson = { org: 'cleancell.us', brand: Object.assign({ logoUrl: '' }, brand), links: { start: '/customer-start.html?org=cleancell.us', account: '/portals/customer/?org=cleancell.us', design: '/portals/customer/?org=cleancell.us#design', app: '/portals/customer/app?org=cleancell.us', storefront: null }, account: { free: true, signup: true },
  editorLite: { monthlyPriceCents: 79900, currency: 'USD', interval: 'month', checkoutAvailable: false, includes: ['Guided site design', 'Site-map exports', 'Project quoting', 'Supplier ordering'] } };
var accountJson = { customerId: 'company_riverside', company: 'Riverside Cold Chain', accountType: 'company', since: '2026-08-01T00:00:00Z', rep: { name: 'Sam Rep', email: 'sam@cleancell.us' }, plan: 'free', status: 'active',
  you: { email: 'ops@riverside.example', name: 'Dana Ops', phone: '', role: 'owner' }, address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, terms: { depositPct: 40, dueDays: 0, netDays: 30 }, users: [], agreements: [{ kind: 'MSA', ref: 'MSA-2026-04', signedAt: '2026-08-02' }], orders: 1 };
var myOrdersJson = { orders: [{ orderNo: 'CC-26-4419', soldBy: 'Clean Cell', placedAt: '2026-09-01T10:00:00Z', poNumber: 'RCC-2200', milestone: { key: 'building', label: 'Building', say: 'Your units are on the line.', index: 2, of: 6 },
  items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5, kw: 100, kwh: 215, warranty: null }], checkout: { currency: 'USD', total: 501250, processingFee: 1250, depositPercent: 30, invoices: [{ stage: 'deposit', amount: 150375, status: 'paid', payUrl: null }, { stage: 'balance', amount: 350875, status: 'open', payUrl: null }] },
  documents: [], destinations: [{ id: 'd1', name: 'Riverside yard', city: 'Bakersfield', state: 'CA', items: [{ sku: 'CC-C215', qty: 5 }] }], loads: [], cancelRequested: false,
  requests: [{ id: 'r1', kind: 'shipping', message: 'Deliver to the Bakersfield yard instead', status: 'open', at: '2026-09-20T10:00:00Z', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, answer: null }] }], limited: false };
var designJson = { org: 'cleancell.us', customerId: 'company_riverside', brand: brand, access: { active: true, status: 'trial', expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), modules: ['bess'] }, designProducts: C.designs({ products: CATALOG }),
  products: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet' }], projects: [{ id: 'p1', name: 'Bakersfield yard', module: 'bess', updatedAt: '2026-09-18T10:00:00Z', revision: 3 }], limited: false };
function designPost(b) { if (b.action !== 'size') return { error: 'not stubbed' }; return C.select({ products: CATALOG }, b.sku, { module: 'bess', kw: Number(b.kw), hours: Number(b.hours), kwh: Number(b.kw) * Number(b.hours), conceptOnly: true }); }
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0], q = req.url.split('?')[1] || '';
  function json(o) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  function posted(fn) { var body = ''; req.on('data', function (c) { body += c; }); req.on('end', function () { var b = {}; try { b = JSON.parse(body); } catch (e) {} json(fn(b)); }); }
  if (u === '/api/mes-scan') return posted(benchJson);
  if (u === '/api/customer-design' && req.method === 'POST') return posted(designPost);
  if (u.indexOf('/api/logic-plant') === 0) return json(plantJson(q));
  if (u.indexOf('/api/logic-materials') === 0) return json(/workOrder=/.test(q) ? soloJson : materialsJson);
  if (u.indexOf('/api/logic-catalog') === 0) return json(catalogJson);
  if (u.indexOf('/api/logic-office') === 0) return json(officeWithStages());
  if (u.indexOf('/api/buyers') === 0) return json(buyersJson(q));
  if (u.indexOf('/api/po-intake') === 0) return json(intakeJson(q));
  if (u.indexOf('/api/customer-portal') === 0) return json(portalJson);
  if (u.indexOf('/api/my-account') === 0) return json(accountJson);
  if (u.indexOf('/api/my-orders') === 0) return json(myOrdersJson);
  if (u.indexOf('/api/customer-design') === 0) return json(designJson);
  if (u.indexOf('/api/app-manifest') === 0) return json(require('../api/app-manifest').manifestFor('cleancell.us', require('../tenants/cleancell/tenant.json'), (/app=(\w+)/.exec(q) || [])[1]));
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
    if (hs) console.log('  widest: ' + JSON.stringify(await p.evaluate(function () { var worst = null; Array.prototype.forEach.call(document.querySelectorAll('body *'), function (e) { var r = e.getBoundingClientRect(); if (r.right > 392 && (!worst || r.right > worst.right)) worst = { right: Math.round(r.right), tag: e.tagName, cls: String(e.className).slice(0, 40), id: e.id }; }); return worst; })));
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
    ok('the app wears the tenant\'s manifest, icon and colour', /app-manifest\?org=cleancell\.us/.test(manifest.m) && /cleancell\/icons\/plant-180/.test(manifest.i) && manifest.t === '#0B2733', manifest);
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
    ok('the office app wears the tenant\'s office manifest and icon', /app-manifest\?org=cleancell\.us&app=office/.test(manifest.m) && /cleancell\/icons\/office-180/.test(manifest.i), manifest);
    ok('  five tabs: Today, Orders, POs, Customers, Stock', tabs.join('|') === 'Today|Orders|POs|Customers|Stock', tabs);
    ok('  today counts the stages and lists who needs a person: the open request and the unpriced order', kv.length === 4 && /To price\s*1/.test(kv[0]) && needs.some(function (t) { return /CC-26-4419.*1 customer request/.test(t); }) && needs.some(function (t) { return /CC-26-4421.*price/.test(t); }), [kv, needs]);
    await p.click('[data-tab="orders"]'); await p.waitForTimeout(300);
    var cards = await p.$$eval('#view .card', function (r) { return r.length; });
    await p.click('[data-order="o1"]'); await p.waitForTimeout(300);
    var h1 = await p.$eval('#view h1', function (e) { return e.textContent; });
    var answer = await p.$$eval('[data-resolve]', function (r) { return r.length; });
    var money = await p.$$eval('#view .kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    ok('  orders are listed and an order opens with its money, build and the request to answer', cards === 3 && /CC-26-4419/.test(h1) && answer === 1 && money.some(function (t) { return /Outstanding\s*\$350,875\.00/.test(t); }) && money.some(function (t) { return /Built/.test(t); }), [cards, h1, answer, money]);
    await p.click('[data-tab="pos"]'); await p.waitForTimeout(500);
    var companies = await p.$$eval('#company option', function (r) { return r.length; });
    await p.selectOption('#company', 'company_riverside'); await p.waitForTimeout(500);
    await p.fill('#bulk-text', 'INC-4471, CC-C215, 4, InCharge Bakersfield, 1200 Depot Rd, Bakersfield, CA, 93307, 2026-11-15, dock B\nINC-4472, CC-C215, 2, InCharge Fresno, 88 Rail Ave, Fresno, CA, 93706');
    var preview = await p.$eval('#bulk-preview', function (e) { return e.textContent; });
    var contact = await p.$eval('#bulk-contact', function (e) { return e.value; });
    var queue = await p.$$eval('#company-body .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60); }); });
    ok('  a stack of POs is keyed in for a company: contact chosen, lines parsed, the uploaded PO under review listed', companies === 3 && contact === 'ops@riverside.example' && preview === '2 purchase orders, 2 lines' && queue.some(function (t) { return /RCC-2211.*po review/.test(t); }), [companies, contact, preview, queue]);
    await p.click('[data-tab="customers"]'); await p.waitForTimeout(400);
    var custCards = await p.$$eval('#view .card', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60); }); });
    await p.click('[data-cust="ops@riverside.example"]'); await p.waitForTimeout(400);
    var custKv = await p.$$eval('#view .kv div', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
    var dep = await p.$eval('#t-dep', function (e) { return e.value; });
    ok('  customers list their terms; an account shows its balance and the terms to edit', custCards.length === 2 && /40% deposit/.test(custCards[0]) && custKv.some(function (t) { return /Balance\s*\$350,875\.00/.test(t); }) && dep === '40', [custCards, custKv, dep]);
    await p.click('[data-tab="stock"]'); await p.waitForTimeout(500);
    var stock = await p.$$eval('#stock-body .unit', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 70); }); });
    var assign = await p.$$eval('[data-assign]', function (r) { return r.length; });
    var opts = await p.$$eval('select[data-for] option', function (r) { return r.map(function (x) { return x.textContent; }); });
    ok('  stock counts finished units, offers to assign each available one to the order that needs it, and lists what is short', /CC-C215.*2 available/.test(stock[0]) && assign === 2 && opts.some(function (o) { return /CC-26-4419/.test(o); }) && stock.some(function (t) { return /on hand/.test(t); }) && stock.some(function (t) { return /PO-1001/.test(t); }), [stock, assign, opts]);
    return { tabs: tabs.length, cards: cards, companies: companies, preview: preview, assign: assign };
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
    return { tabs: tabs.length, plans: plans.length, sized: sized.slice(0, 40), form: form };
  });
  ok('no JS errors', errs.length === 0, errs);
  await b.close(); srv.close();
  console.log(fails ? '\n' + fails + ' render check(s) FAILED' : '\nrender checks: all passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
