/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/_lib/logic-fixtures.js — ONE sample Clean Cell, for the render
   checks and the phone sandboxes.

   A catalog with bills of materials, suppliers and prices, a stock count,
   one work order with six cabinets at real stations with real timings,
   three orders (one in build with a customer request, one awaiting its
   deposit, one to price), a company account with an uploaded PO under
   review, a customer account with a site plan on trial.

   views(state) answers every endpoint the office, plant and customer apps
   read, shaped like api/*.js answers them and computed by the same pure
   libraries (materials, plant-board, plant-stats, plant-work, office-stage,
   logic-catalog) — so a sandbox shows what the product computes, not a
   drawing of it. post(state, …) applies the handful of writes a trial
   touches and returns what the endpoint would. State is plain JSON, so the
   sandbox keeps it in localStorage and the render check keeps it in memory.

   Pure: no admin SDK, no network, no clock except Date.now() for dwell.
   scripts/build-app-sandbox.js bundles this file and the libraries it
   requires into app-sandbox/sandbox.js. */
'use strict';
var M = require('../../api/_lib/materials'), C = require('../../api/_lib/logic-catalog'), Stats = require('../../api/_lib/plant-stats');
var Board = require('../../api/_lib/plant-board'), Ops = require('../../api/_lib/plant-ops'), Attention = require('../../api/_lib/plant-attention');
var W = require('../../api/_lib/plant-work'), Plant = require('../../api/_lib/plant'), S = require('../../api/_lib/office-stage');
var Manifest = require('../../api/app-manifest');

var ORG = 'cleancell.us';
var CATALOG = [
  { sku: 'CC-C215', name: '215 kWh outdoor cabinet', kind: 'product', kw: 100, kwh: 215, widthFt: 4.5, depthFt: 3.5, leadTimeDays: 20, priceMode: 'quote', warrantyYears: 10, bom: [{ sku: 'CC-MOD-52', qty: 8, unit: 'ea' }, { sku: 'CC-BMS-M', qty: 1, unit: 'ea' }, { sku: 'CC-ENC-1B', qty: 1, unit: 'ea' }] },
  { sku: 'CC-C418', name: '418 kWh outdoor cabinet', kind: 'product', kw: 200, kwh: 418, widthFt: 7.5, depthFt: 4.5, leadTimeDays: 30, priceMode: 'quote', warrantyYears: 10, bom: [] },
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
var MAT_ORDERS = [{ id: 'a', orderNo: 'CC-26-4420', status: 'accepted', items: [{ sku: 'CC-C215', qty: 2 }], promisedShipAt: '2026-12-05' }, { id: 'b', orderNo: 'CC-26-4421', status: 'new', items: [{ sku: 'CC-C418', qty: 3 }] }];
var NOW = '2026-09-21';
var brand = { name: 'Clean Cell', primary: '#3FAFC6', accent: '#EE5A4F', ink: '#0B2733' };
var flow = { version: 1, lines: [{ id: 'line_1', name: 'North line', location: 'Building A' }], routing: [{ key: 'kit', label: 'Kitting' }, { key: 'eol', label: 'EOL test' }, { key: 'ready', label: 'Ready' }] };
var wo = { id: 'wo_1', orgId: ORG, orderNo: 'CC-26-4419', status: 'awaiting_serials', lineId: 'line_1', routing: flow.routing, flowVersion: 1, requirements: [{ sku: 'CC-C215', qty: 5 }], dueDate: '2026-11-14', managerRevision: 0 };
/* the bench: one cabinet with two parts steps and a check at Rack assembly */
var benchCab = { sku: 'CC-C215', name: 'Cabinet', bom: [{ sku: 'CC-MOD-52', qty: 2, unit: 'ea', station: 'rack', step: '1 · Fit modules' }, { sku: 'CC-HARN', qty: 2.5, unit: 'm', station: 'rack', step: '2 · Harness' }] };
var benchBy = {}; CATALOG.forEach(function (p) { benchBy[p.sku] = p; });
function benchSteps() { return W.stepsFor(benchCab, 'rack', benchBy, ['Torque busbars']); }
function fullRouting() { return Plant.DEFAULT_ROUTING.map(function (s) { return { key: s.key, label: s.label }; }); }
function iso(d) { return new Date(d).toISOString(); }
function hex(n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

/* ── the sample, as plain JSON ────────────────────────────────────────── */
function initialState() {
  var base = Date.now(); function T(h) { return new Date(base - (200 - h) * 3600000).toISOString(); }
  return {
    org: ORG, brand: brand, flow: flow, wo: wo,
    units: [
      { serial: 'CC418-26-44190', sku: 'CC-C215', shipUnit: true, startedAt: T(0), done: { kit: T(2), module: T(10), rack: T(14), encl: T(16), elec: T(20), bms: T(22), eol: T(23), qa: T(25), pack: T(26) }, at: 'ready', arrivedAt: T(26), inventoryStatus: 'available', unitType: 'cabinet' },
      { serial: 'CC418-26-44191', sku: 'CC-C215', shipUnit: true, startedAt: T(1), done: { kit: T(3), module: T(15), rack: T(18), encl: T(20), elec: T(24), bms: T(26), eol: T(27), qa: T(29), pack: T(30) }, at: 'ready', arrivedAt: T(30), inventoryStatus: 'available', unitType: 'cabinet' },
      { serial: 'CC418-26-44192', sku: 'CC-C215', shipUnit: true, startedAt: T(4), done: { kit: T(6), module: T(40), rack: T(43), encl: T(45), elec: T(49), bms: T(51), eol: T(52), qa: T(54), pack: T(55) }, at: 'ready', arrivedAt: T(55), inventoryStatus: 'allocated', orderId: 'o1', orderNo: 'CC-26-4419', unitType: 'cabinet' },
      { serial: 'CC418-26-44193', sku: 'CC-C215', shipUnit: true, startedAt: T(60), done: { kit: T(62) }, at: 'module', arrivedAt: T(62), inventoryStatus: 'building', unitType: 'cabinet' },
      { serial: 'CC418-26-44194', sku: 'CC-C215', shipUnit: true, startedAt: T(70), done: { kit: T(71), module: T(90) }, at: 'rack', arrivedAt: T(90), hold: 'NCR-26-89', inventoryStatus: 'building', unitType: 'cabinet' },
      { serial: 'CC418-26-44195', sku: 'CC-C215', shipUnit: true, at: '', done: {}, inventoryStatus: 'building', unitType: 'cabinet' }
    ],
    orders: [
      { id: 'o1', orderNo: 'CC-26-4419', status: 'in_fulfilment', createdAt: '2026-09-01T10:00:00Z', customer: { name: 'Riverside Cold Chain', email: 'ops@riverside.example' }, items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], worksOrderId: 'wo_1', logic: { commercial: { baseCents: 50000000, feeCents: 125000, totalCents: 50125000, depositCents: 15037500, terms: { depositPct: 30, dueDays: 0 } }, invoices: { deposit: { amountCents: 15037500, paidCents: 15037500, status: 'paid' }, balance: { amountCents: 35087500, paidCents: 0, status: 'open' } }, acceptedAt: '2026-09-01', releasedAt: '2026-09-02', requirements: [{ sku: 'CC-C215', qty: 4 }], allocatedSerials: ['CC418-26-44192'] }, requests: [{ id: 'r1', kind: 'shipping', message: 'Deliver to the Bakersfield yard instead', status: 'open', at: '2026-09-20T10:00:00Z', by: 'ops@riverside.example', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, answer: null }] },
      { id: 'o2', orderNo: 'CC-26-4420', status: 'accepted', createdAt: '2026-09-18T10:00:00Z', customer: { name: 'Sierra Storage', email: 'buy@sierra.example' }, items: [{ sku: 'CC-C418', name: '418 kWh', qty: 2 }], logic: { commercial: { baseCents: 30000000, feeCents: 75000, totalCents: 30075000, depositCents: 9022500, terms: { depositPct: 30, dueDays: 0 } }, invoices: { deposit: { amountCents: 9022500, paidCents: 0, status: 'open' } }, acceptedAt: '2026-09-18', requirements: [], allocatedSerials: [] } },
      { id: 'o3', orderNo: 'CC-26-4421', status: 'new', createdAt: '2026-09-20T10:00:00Z', customer: { name: 'InCharge Energy', email: 'po@incharge.example' }, items: [{ sku: 'CC-C215', name: '215 kWh', qty: 20 }], logic: null }
    ],
    customers: [
      { id: 'company_riverside', company: 'Riverside Cold Chain', status: 'active', terms: { depositPct: 40, dueDays: 0 }, users: [{ email: 'ops@riverside.example', name: 'Dana Ops', role: 'owner', activated: true }], usersLimited: false },
      { id: 'company_incharge', company: 'InCharge Energy', status: 'active', terms: { depositPct: 30, dueDays: 0 }, users: [], usersLimited: false }
    ],
    intake: [{ id: 'po_x', orderNo: 'PO-IN-X', customerId: 'company_riverside', poNumber: 'RCC-2211', status: 'po_review', source: 'customer', notes: 'see attached', createdAt: '2026-09-19T10:00:00Z', reviewNote: '', convertedAt: null, rep: null, files: [] }],
    companyOrders: [{ id: 'o1', customerId: 'company_riverside', orderNo: 'CC-26-4419', status: 'in_fulfilment', poNumber: 'RCC-2200', items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], destinations: [{ id: 'd1', address: { name: 'Riverside yard', city: 'Bakersfield', state: 'CA' }, items: [{ sku: 'CC-C215', qty: 5 }] }], revision: 1, legs: [] }],
    account: { customerId: 'company_riverside', company: 'Riverside Cold Chain', accountType: 'company', since: '2026-08-01T00:00:00Z', rep: { name: 'Sam Rep', email: 'sam@cleancell.us' }, plan: 'free', status: 'active',
      you: { email: 'ops@riverside.example', name: 'Dana Ops', phone: '', role: 'owner' }, address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, terms: { depositPct: 40, dueDays: 0, netDays: 30 }, users: [], agreements: [{ kind: 'MSA', ref: 'MSA-2026-04', signedAt: '2026-08-02' }], orders: 1 },
    projects: [{ id: 'p1', name: 'Bakersfield yard', module: 'bess', updatedAt: '2026-09-18T10:00:00Z', revision: 3 }],
    benchUnit: { serial: 'CC418-26-44190', sku: 'CC-C215', at: 'rack', work: {}, hold: null },
    poUsage: 0
  };
}

/* ── what each endpoint answers ───────────────────────────────────────── */
function views(state) {
  function planned() { return M.plan({ now: NOW, products: CATALOG, stock: STOCK, works: WORKS, orders: MAT_ORDERS, sourcing: SOURCING }); }
  function materialsJson() {
    var p = planned();
    return Object.assign({ org: ORG, name: 'Clean Cell', brand: brand, owner: false, stockRevision: 2, catalogRevision: 5, components: 5, withBom: 2, limited: false,
      projection: M.projection({ now: NOW, products: CATALOG, stock: STOCK, works: WORKS, orders: MAT_ORDERS, sourcing: SOURCING, supplies: [{ sku: 'CC-CELL-280', qty: 2500, at: '2026-11-01' }] }, { weeks: 12 }),
      bySupplier: M.purchaseBySupplier(p), sourcingRevision: 3, prices: SOURCING.prices,
      suppliers: Object.keys(SOURCING.suppliers).map(function (id) { return Object.assign({ id: id }, SOURCING.suppliers[id]); }),
      purchaseOrders: [{ id: 'po1', supplier: 'EVE Energy', supplierId: 'sup_eve', reference: 'PO-1001', expectedAt: '2026-11-01', note: 'air freight', status: 'partial', createdAt: '2026-09-20T10:00:00Z', createdBy: 'plant@cleancell.us', receivedAt: null,
        lines: [{ sku: 'CC-CELL-280', name: 'LFP cell 280 Ah', unit: 'ea', qty: 4000, received: 1500 }], receipts: [] }] }, p);
  }
  function soloJson() { var solo = M.plan({ now: NOW, products: CATALOG, stock: STOCK, works: WORKS, orders: [], sourcing: SOURCING }); return { org: ORG, workOrder: { id: 'wo_1', orderNo: 'CC-26-4419', status: 'awaiting_serials', dueDate: '2026-11-14' }, feasible: false, short: M.shortfallsByWorksOrder(solo)['CC-26-4419'] || [], unknownSkus: [], hasBom: true }; }
  function catalogJson() { return { org: ORG, brand: brand, owner: true, revision: 5, products: CATALOG.map(C.view), designProducts: C.designs({ products: CATALOG }) }; }
  function unitsWith(extra) { return state.units.map(function (u) { return Object.assign({ orgId: ORG, woId: 'wo_1', orderNo: 'CC-26-4419' }, extra || {}, u); }); }
  function mapJson() { var routing = Plant.DEFAULT_ROUTING.map(function (s) { return s.key === 'bms' ? { key: s.key, label: s.label, checks: ['Load firmware'] } : s; }); var m = Stats.stationMap(routing, state.units, Date.now(), { shipUnitsOnly: true }); m.steps = Stats.stepsByStation(routing, [benchCab].concat(CATALOG), W.stepsFor); m.lines = flow.lines; m.sampledLimit = false; return { name: 'Clean Cell', owner: false, brand: brand, map: m }; }
  function boardJson(q) {
    var now = iso(Date.now()), units = unitsWith();
    var rows = [Board.row(state.wo, units, now)], common = { name: 'Clean Cell', owner: false, flow: flow, brand: brand, asOf: now, rows: rows, limited: false, unitsLimited: false, links: {} };
    if (/page=board/.test(q)) return common;
    return Object.assign(common, { floor: Ops.floor([], now, 14), queues: Ops.queues(rows), demand: Ops.demand(rows), stock: Ops.stock([]), completed: Ops.completed(rows), scansLimited: false, stockLimited: false });
  }
  function progressOf(u) { if (u.serial !== state.benchUnit.serial) return { station: u.at, done: 1, total: 3, open: ['2 · Harness', 'Torque busbars'], complete: false }; var st = W.statusOf(state.benchUnit, 'rack', benchSteps()); return { station: 'rack', done: st.steps.filter(function (s) { return s.done; }).length, total: st.steps.length, open: st.open, complete: st.complete }; }
  function plantJson(q) {
    if (/map=1/.test(q)) return mapJson();
    if (/page=board|page=ops/.test(q)) return boardJson(q);
    if (/page=attention/.test(q)) return Object.assign(Attention.attention(state.units, [], flow.routing, iso(Date.now()), {}), { name: 'Clean Cell', owner: false, brand: brand, sampled: state.units.length, sampledLimit: false, links: {} });
    if (/page=works/.test(q)) return { rows: [state.wo], next: null };
    if (/page=units/.test(q)) return { rows: state.units.map(function (u) { return Object.assign({ id: ORG + '__' + u.serial, orgId: ORG, woId: 'wo_1' }, u); }), next: null };
    if (/page=stations/.test(q)) return { rows: [], next: null };
    if (/workOrder=/.test(q)) { var wUnits = unitsWith(), wNow = iso(Date.now()); return { workOrder: state.wo, board: Board.row(state.wo, wUnits, wNow), activity: Board.activity(wUnits, state.wo, 50), units: state.units.slice(3, 5).map(function (u) { return Object.assign({}, u, { woId: 'wo_1', progress: progressOf(u) }); }), limited: false }; }
    if (/serial=/.test(q)) { var serial = decodeURIComponent((/serial=([^&]*)/.exec(q) || [])[1] || ''), u = state.units.filter(function (x) { return x.serial === serial; })[0]; if (!u) return { error: 'Unit not found', status: 404 }; return { unit: Object.assign({ orgId: ORG, woId: 'wo_1', orderNo: 'CC-26-4419', work: {} }, u, u.at === 'rack' ? { progress: progressOf(u) } : {}), genealogy: [{ serial: u.serial, unitType: u.unitType, parentSerial: null }], events: [] }; }
    return { name: 'Clean Cell', owner: false, flow: flow, brand: brand, worksOrders: [state.wo], units: unitsWith(), limited: false };
  }
  function officeJson() { var orders = state.orders.map(function (o) { return Object.assign({}, o, { stage: S.stageOf(o) }); }); return { owner: false, org: ORG, name: 'Clean Cell', brand: brand, active: true, config: { terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } }, products: 8, bundle: { included: ['OEM order operations'], subscriptionDue: null },
    links: { office: '/omega-logic?org=cleancell.us', factory: '/plant/?org=cleancell.us', customers: '/portals/customer/admin.html?org=cleancell.us', start: '/customer-start.html?org=cleancell.us', mission: '/mission', setup: '/whitelabel-setup.html', storefront: null, customer: '/portals/customer/', preview: '/editor-lite.html', editor: '/editor-lite.html' },
    orders: orders, totals: S.totals(orders), intake: { review: state.intake.filter(function (p) { return !p.convertedAt && p.status === 'po_review'; }).length, needsInfo: 0, declined: 0 }, limited: false }; }
  function money(o) { var inv = 0, pd = 0; Object.keys((o.logic && o.logic.invoices) || {}).forEach(function (k) { inv += o.logic.invoices[k].amountCents || 0; pd += o.logic.invoices[k].paidCents || 0; }); return { id: o.id, orderNo: o.orderNo, status: o.status, stage: S.stageOf(o), items: o.items, invoicedCents: inv, paidCents: pd, balanceCents: inv - pd, shippedAt: o.shipment ? o.shipment.shippedAt : null, openRequests: (o.requests || []).filter(function (r) { return r.status === 'open'; }).length }; }
  function customerOf(email) { return state.customers.filter(function (c) { return c.users.some(function (u) { return u.email === email; }); })[0]; }
  function buyerDetail(email) {
    var c = customerOf(email); if (!c) return { error: 'Customer not found', status: 404 };
    var orders = state.orders.filter(function (o) { return o.customer.email === email; }).map(money);
    return { customerId: c.id, company: c.company, name: c.users[0].name, email: email, phone: '', address: state.account.customerId === c.id ? state.account.address : null, activated: true, createdAt: '2026-08-01T00:00:00Z', plan: 'free', status: c.status, terms: c.terms, portalUrl: 'https://silmarillion.clearskyomega.com/portals/customer/?org=cleancell.us',
      orders: orders, totals: orders.reduce(function (t, m) { t.invoicedCents += m.invoicedCents; t.paidCents += m.paidCents; t.balanceCents += m.balanceCents; t.openRequests += m.openRequests; return t; }, { invoicedCents: 0, paidCents: 0, balanceCents: 0, openRequests: 0 }), limited: false };
  }
  function buyersJson(q) {
    if (/email=/.test(q)) return buyerDetail(decodeURIComponent((/email=([^&]*)/.exec(q) || [])[1] || ''));
    return { org: ORG, name: 'Clean Cell', brand: brand, owner: false, portalUrl: 'https://silmarillion.clearskyomega.com/portals/customer/?org=cleancell.us', next: null, customers: clone(state.customers) };
  }
  function companyJson(id, office) {
    var c = state.customers.filter(function (x) { return x.id === id; })[0]; if (!c) return { error: 'Active company account not found', status: 404 };
    return { office: office, brand: brand, company: { id: c.id, name: c.company, rep: null }, reps: [], terms: c.terms,
      products: CATALOG.filter(function (p) { return p.kind !== 'component'; }).map(function (p) { return { sku: p.sku, name: p.name, kind: p.kind || 'product' }; }),
      contacts: c.users.map(function (u) { return { email: u.email, name: u.name, role: u.role }; }),
      intake: state.intake.filter(function (p) { return p.customerId === id; }).map(function (p) { var o = clone(p); delete o.customerId; return o; }),
      orders: state.companyOrders.filter(function (o) { return o.customerId === id; }).map(function (o) { var x = clone(o); delete x.customerId; return x; }), limited: false };
  }
  function intakeJson(q, who) {
    var office = /office=1/.test(q), cid = decodeURIComponent((/customerId=([^&]*)/.exec(q) || [])[1] || '');
    if (office && !cid) return { office: true, brand: brand, companies: state.customers.map(function (c) { return { id: c.id, name: c.company, status: c.status, rep: null }; }), reps: [], limited: false };
    if (!office) { var own = customerOf(who || ''); if (!own) return { error: 'Open your customer account first', status: 403 }; return companyJson(own.id, false); }
    return companyJson(cid, true);
  }
  var portalJson = { org: ORG, brand: Object.assign({ logoUrl: '' }, brand), links: { start: '/customer-start.html?org=cleancell.us', account: '/portals/customer/?org=cleancell.us', design: '/portals/customer/?org=cleancell.us#design', app: '/portals/customer/app?org=cleancell.us', storefront: null }, account: { free: true, signup: true },
    editorLite: { monthlyPriceCents: 79900, currency: 'USD', interval: 'month', checkoutAvailable: false, includes: ['Guided site design', 'Site-map exports', 'Project quoting', 'Supplier ordering'] } };
  function accountJson(who) { var a = clone(state.account); if (who) a.you.email = who; return a; }
  function myOrdersJson(who) {
    var mine = state.orders.filter(function (o) { return o.customer.email === (who || 'ops@riverside.example') || o.customer.email === 'ops@riverside.example'; });
    return { orders: mine.map(function (o) {
      var l = o.logic, c = l && l.commercial, shipped = !!o.shipment, key = shipped ? 'shipped' : o.status === 'in_fulfilment' ? 'building' : o.status === 'accepted' ? 'confirmed' : 'received';
      var ms = { received: { label: 'Received', index: 0, say: 'We have your order and will confirm it shortly.' }, confirmed: { label: 'Confirmed', index: 1, say: 'Confirmed. Building starts when the deposit is in.' }, building: { label: 'Building', index: 2, say: 'Your units are on the line.' }, shipped: { label: 'Shipped', index: 5, say: 'On its way.' } }[key];
      return { orderNo: o.orderNo, soldBy: 'Clean Cell', placedAt: o.createdAt, poNumber: o.id === 'o1' ? 'RCC-2200' : (o.poNumber || null), milestone: Object.assign({ key: key, of: 6 }, ms),
        items: o.items.map(function (i) { var p = benchBy[i.sku] || {}; return { sku: i.sku, name: i.name || i.sku, qty: i.qty, kw: p.kw || null, kwh: p.kwh || null, warranty: o.shipment && p.warrantyYears ? { years: p.warrantyYears, from: o.shipment.shippedAt.slice(0, 10), until: String(Number(o.shipment.shippedAt.slice(0, 4)) + p.warrantyYears) + o.shipment.shippedAt.slice(4, 10) } : null }; }),
        checkout: c ? { currency: 'USD', total: c.totalCents / 100, processingFee: c.feeCents / 100, depositPercent: c.terms.depositPct, invoices: Object.keys(l.invoices).map(function (k) { return { stage: k, amount: l.invoices[k].amountCents / 100, status: l.invoices[k].status, payUrl: null }; }) } : null,
        documents: [], destinations: o.id === 'o1' ? [{ id: 'd1', name: 'Riverside yard', city: 'Bakersfield', state: 'CA', items: [{ sku: 'CC-C215', qty: 5 }] }] : [], loads: [], shipment: o.shipment || null, cancelRequested: !!o.cancelRequested,
        requests: (o.requests || []).map(function (r) { return { id: r.id, kind: r.kind, message: r.message, status: r.status, at: r.at, address: r.address || null, answer: r.answer || null }; }) };
    }), limited: false };
  }
  function designJson() { return { org: ORG, customerId: 'company_riverside', brand: brand, access: { active: true, status: 'trial', expiresAt: iso(Date.now() + 7 * 86400000), modules: ['bess'] }, designProducts: C.designs({ products: CATALOG }), products: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet' }, { sku: 'CC-C418', name: '418 kWh outdoor cabinet' }], projects: clone(state.projects), limited: false }; }
  function designPost(b) {
    if (b.action === 'size') { try { return C.select({ products: CATALOG }, b.sku, { module: 'bess', kw: Number(b.kw), hours: Number(b.hours), kwh: Number(b.kw) * Number(b.hours), conceptOnly: true }); } catch (e) { return { error: e.message, status: e.status || 400 }; } }
    if (b.action === 'save') { var id = b.projectId || ('p_' + hex(8)), p = state.projects.filter(function (x) { return x.id === id; })[0]; if (!p) { p = { id: id, name: '', module: 'bess', revision: 0 }; state.projects.unshift(p); } p.name = String(b.name || p.name || 'Untitled site plan').slice(0, 120); p.revision++; p.updatedAt = iso(Date.now()); return { ok: true, id: id, revision: p.revision, updatedAt: p.updatedAt }; }
    return { error: 'Unknown design action', status: 400 };
  }
  function benchJson(b) {
    var routing = fullRouting(), unit = state.benchUnit, steps = benchSteps();
    if (b.action === 'describe' && b.stationId === 'st-phone') return { ok: true, station: '*', roaming: true, stationLabel: 'Marco’s phone', lineId: 'main', location: '', instructions: '', revision: 1, machine: false, brand: brand, routing: routing.filter(function (s) { return s.key !== 'eol'; }) };
    if (b.action === 'describe') return { ok: true, station: 'rack', stationLabel: 'Bay 2 · Rack assembly', lineId: 'main', location: 'Bay 2', instructions: 'Fit modules bottom-up.', revision: 1, machine: false, brand: brand };
    if (b.action === 'issue' || b.action === 'step-done') {
      var v = b.action === 'issue' ? W.judgeIssue(unit, 'rack', routing, steps, b.code, b.qty) : W.judgeStepDone(unit, 'rack', routing, steps, b.stepId);
      var patch = b.action === 'issue' ? W.applyIssue(unit, 'rack', v, 'now', b.lot) : W.applyStepDone(unit, 'rack', v, 'now');
      if (patch) unit.work.rack = patch;
      return { ok: !!v.ok, action: v.action || null, reason: v.reason || null, say: v.say, serial: unit.serial, station: 'rack', work: W.statusOf(unit, 'rack', steps) };
    }
    var serial = Plant.serialFrom(b.serial);
    if (serial !== unit.serial) return { ok: false, reason: 'unknown_unit', say: 'That serial is not on any open works order here.', serial: serial, station: 'rack', routing: routing };
    return { ok: true, action: 'duplicate', say: 'Already at Rack assembly.', serial: serial, station: 'rack', unit: { serial: serial, at: 'rack', wo: 'wo_1' }, routing: routing,
      workOrder: 'wo_1', product: 'Cabinet', work: W.statusOf(unit, 'rack', steps), instructions: 'Fit modules bottom-up.' };
  }
  function manifest(app, tenant) { return Manifest.manifestFor(ORG, tenant, app); }
  return { materialsJson: materialsJson, soloJson: soloJson, catalogJson: catalogJson, plantJson: plantJson, officeJson: officeJson, buyersJson: buyersJson, intakeJson: intakeJson, portalJson: portalJson, accountJson: accountJson, myOrdersJson: myOrdersJson, designJson: designJson, designPost: designPost, benchJson: benchJson, manifest: manifest, brand: brand, CATALOG: CATALOG, benchCab: benchCab };
}

/* ── the writes a trial touches ───────────────────────────────────────── */
function post(state, path, query, b, who) {
  var V = views(state), now = iso(Date.now()); b = b || {}; who = who || 'demo@cleancell.us';
  function err(s, m) { return { status: s, error: m }; }
  function order(id) { return state.orders.filter(function (o) { return o.id === id; })[0]; }
  if (path === '/api/mes-scan') return V.benchJson(b);
  if (path === '/api/customer-design') return V.designPost(b);
  if (path === '/api/logic-office') {
    var o = order(b.orderId); if (!o) return err(404, 'Order not found');
    if (b.action === 'request-resolve') { var r = (o.requests || []).filter(function (x) { return x.id === b.requestId; })[0]; if (!r || r.status !== 'open') return err(404, 'Open request not found'); if (!String(b.answer || '').trim()) return err(400, 'Write the answer the customer will read'); r.status = 'resolved'; r.answer = String(b.answer).trim().slice(0, 2000); r.answeredAt = now; r.answeredBy = who; return { ok: true }; }
    if (b.action === 'ready') return o.logic && o.logic.releasedAt ? { ok: true, note: 'Every unit passed; the balance invoice is queued.' } : err(409, 'Release the order to the plant first');
    if (b.action === 'cancel') { o.cancelRequested = true; return { ok: true }; }
    return err(400, 'Not in this sandbox: ' + b.action);
  }
  if (path === '/api/buyers') {
    if (b.action === 'terms') { var c = state.customers.filter(function (x) { return x.users.some(function (u) { return u.email === b.email; }); })[0]; if (!c) return err(404, 'Create this customer first'); var t = { depositPct: Number(b.terms.depositPct), dueDays: Number(b.terms.dueDays) }; if (!(t.depositPct >= 0 && t.depositPct <= 100)) return err(400, 'Deposit must be 0–100%'); c.terms = t; if (state.account.customerId === c.id) state.account.terms = Object.assign({}, state.account.terms, t); return { ok: true, terms: t, note: 'Applies to future prices. Existing invoices retain their agreed terms.' }; }
    return err(400, 'Not in this sandbox: ' + b.action);
  }
  if (path === '/api/po-intake') {
    var office = b.office === true || b.office === '1';
    if (b.action === 'company') { var name = String(b.name || '').trim(); if (!name) return err(400, 'Company name required'); var cid = 'company_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30); if (state.customers.some(function (x) { return x.id === cid; })) return { ok: true, customerId: cid, duplicate: true }; state.customers.push({ id: cid, company: name, status: 'active', terms: { depositPct: 30, dueDays: 0 }, users: [], usersLimited: false }); return { ok: true, customerId: cid }; }
    if (b.action === 'submit-many') {
      var cust = office ? state.customers.filter(function (x) { return x.id === b.customerId; })[0] : state.customers.filter(function (x) { return x.users.some(function (u) { return u.email === who; }); })[0];
      if (!cust) return err(office ? 400 : 403, office ? 'Select a company' : 'Open your customer account first');
      var list = Array.isArray(b.pos) ? b.pos : []; if (!list.length || list.length > 50) return err(400, 'Enter 1–50 purchase orders at a time');
      var billing = office ? cust.users.filter(function (u) { return u.email === b.email; })[0] : { email: who, name: who }; if (!billing) return err(400, 'Billing contact must belong to this company');
      var created = [], skipped = [], seen = {}, limit = office ? 200 : 50;
      list.forEach(function (po, i) {
        var number = String(po && po.number || '').trim(), key = number.toLowerCase();
        if (!number) { skipped.push({ number: 'row ' + (i + 1), error: 'PO number required' }); return; }
        if (seen[key]) { skipped.push({ number: number, error: 'Duplicate PO number in this batch' }); return; } seen[key] = true;
        var bad = (po.lines || []).filter(function (l) { return !CATALOG.some(function (p) { return p.sku === l.sku && p.kind !== 'component'; }); });
        if (!po.lines || !po.lines.length || bad.length) { skipped.push({ number: number, error: 'Select a currently published product or service' }); return; }
        if (state.intake.concat(state.companyOrders).some(function (x) { return String(x.poNumber || '').toLowerCase() === key; })) { skipped.push({ number: number, error: 'This PO number already exists — open it from the queue' }); return; }
        if (state.poUsage >= limit) { skipped.push({ number: number, error: 'Daily intake limit reached' }); return; }
        state.poUsage++;
        var id = 'po_' + hex(10), orderNo = 'PO-IN-' + id.slice(3, 13).toUpperCase(), d = po.destination || {};
        var items = po.lines.map(function (l) { var p = CATALOG.filter(function (x) { return x.sku === l.sku; })[0]; return { sku: l.sku, name: p.name, qty: Number(l.qty) }; });
        state.companyOrders.unshift({ id: id, customerId: cust.id, orderNo: orderNo, status: 'new', poNumber: number, items: items, destinations: [{ id: 'd1', address: { name: d.name, line1: d.line1, city: d.city, state: d.state, zip: d.zip }, requestedDate: po.requestedDate || null, items: po.lines.map(function (l) { return { sku: l.sku, qty: Number(l.qty) }; }) }], revision: 0, legs: [] });
        state.orders.unshift({ id: id, orderNo: orderNo, status: 'new', createdAt: now, customer: { name: cust.company, email: billing.email }, items: items, logic: null, poNumber: number, requests: [] });
        created.push({ id: id, number: number, orderNo: orderNo, lines: items.length, destination: d.city || '' });
      });
      return { ok: true, created: created, skipped: skipped, note: created.length + ' purchase order' + (created.length === 1 ? '' : 's') + ' entered and mapped to the catalog; awaiting pricing. Nothing was accepted or charged.' };
    }
    return err(400, 'Not in this sandbox: ' + b.action);
  }
  if (path === '/api/logic-plant') {
    if (b.action === 'allocate') {
      var u = state.units.filter(function (x) { return x.serial === b.serial; })[0], o2 = order(b.orderId);
      if (!u) return err(404, 'Unit not found'); if (!o2 || !o2.logic || !o2.worksOrderId) return err(409, 'That order is not in fulfilment');
      if (u.orderId) return err(409, 'This unit is already assigned to ' + u.orderNo); if (u.at !== 'ready' || u.hold || u.inventoryStatus !== 'available') return err(409, 'Only a finished, tested, unheld unit can be assigned');
      var req = o2.logic.requirements.filter(function (r) { return r.sku === u.sku && r.qty > 0; })[0]; if (!req) return err(409, 'That order does not need this product');
      req.qty--; u.orderId = o2.id; u.orderNo = o2.orderNo; u.inventoryStatus = 'allocated'; o2.logic.allocatedSerials.push(u.serial);
      var left = o2.logic.requirements.reduce(function (t, r) { return t + r.qty; }, 0); if (!left) state.wo.status = 'ready';
      return { ok: true, serial: u.serial, orderNo: o2.orderNo, stillToBuild: left };
    }
    return err(400, 'Not in this sandbox: ' + b.action);
  }
  if (path === '/api/plant-control') {
    var pu = state.units.filter(function (x) { return x.serial === b.serial; })[0]; if (!pu) return err(404, 'Unit not found');
    if (b.action === 'hold') { pu.hold = String(b.reason || '').slice(0, 200); pu.ncr = 'NCR-26-' + (90 + state.units.indexOf(pu)); return { ok: true }; }
    if (b.action === 'release') { pu.hold = null; return { ok: true }; }
    return err(400, 'Not in this sandbox: ' + b.action);
  }
  if (path === '/api/my-orders') {
    var mo = state.orders.filter(function (x) { return x.orderNo === b.orderNo; })[0]; if (!mo) return err(404, 'Order not found');
    var msg = String(b.message || '').trim(); if (msg.length < 5) return err(400, 'Say a little more');
    mo.requests = mo.requests || []; if (mo.requests.filter(function (r) { return r.status === 'open'; }).length >= 10) return err(429, 'Ten open requests is the limit');
    var rq = { id: 'rq_' + hex(8), kind: ['shipping', 'information', 'change', 'warranty'].indexOf(b.kind) >= 0 ? b.kind : 'information', message: msg.slice(0, 2000), address: b.kind === 'shipping' && b.address ? b.address : null, by: who, at: now, status: 'open', answer: null };
    mo.requests.push(rq); return { ok: true, request: rq };
  }
  if (path === '/api/my-account') {
    var a = state.account; a.you.name = String(b.name || a.you.name).slice(0, 120); a.company = String(b.company || a.company).slice(0, 160); a.you.phone = String(b.phone || '').slice(0, 40);
    if (b.address) a.address = { line1: String(b.address.line1 || ''), city: String(b.address.city || ''), state: String(b.address.state || ''), zip: String(b.address.zip || '') };
    return V.accountJson(who);
  }
  return err(404, 'Not in this sandbox: ' + path);
}

module.exports = { initialState: initialState, views: views, post: post, ORG: ORG, CATALOG: CATALOG, brand: brand };
