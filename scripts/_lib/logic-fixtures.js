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
var Manifest = require('../../api/app-manifest'), Cu = require('../../api/_lib/custody');

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
/* the shape api/_lib/logic-brand.js returns: the customer-facing name, the
   workspace (the tenant's own name, shown inside Omega Logic) and the
   contract's "powered by" line */
var brand = { name: 'Clean Cell', shortName: 'Clean Cell', workspace: 'Clean Cell', primary: '#3FAFC6', accent: '#EE5A4F', ink: '#0B2733', supportEmail: '', attribution: 'Powered by ClearSky OMEGA' };
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
      { serial: 'CC418-26-44192', sku: 'CC-C215', shipUnit: true, startedAt: T(4), done: { kit: T(6), module: T(40), rack: T(43), encl: T(45), elec: T(49), bms: T(51), eol: T(52), qa: T(54), pack: T(55) }, at: 'ready', arrivedAt: T(55), inventoryStatus: 'allocated', orderId: 'o1', orderNo: 'CC-26-4419', unitType: 'cabinet', customerId: 'company_riverside', custody: { status: 'in_transit', custodian: 'carrier', shippedAt: '2026-09-10', legId: 'LOAD-1', customerId: 'company_riverside' } },
      { serial: 'CC418-26-44193', sku: 'CC-C215', shipUnit: true, startedAt: T(60), done: { kit: T(62) }, at: 'module', arrivedAt: T(62), inventoryStatus: 'building', unitType: 'cabinet' },
      { serial: 'CC418-26-44194', sku: 'CC-C215', shipUnit: true, startedAt: T(70), done: { kit: T(71), module: T(90) }, at: 'rack', arrivedAt: T(90), hold: 'NCR-26-89', inventoryStatus: 'building', unitType: 'cabinet' },
      { serial: 'CC418-26-44195', sku: 'CC-C215', shipUnit: true, at: '', done: {}, inventoryStatus: 'building', unitType: 'cabinet' }
    ],
    orders: [
      { id: 'o1', orderNo: 'CC-26-4419', status: 'in_fulfilment', createdAt: '2026-09-01T10:00:00Z', customerId: 'company_riverside', customer: { name: 'Dana Ops', company: 'Riverside Cold Chain', email: 'ops@riverside.example' }, items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], worksOrderId: 'wo_1', logic: { commercial: { baseCents: 50000000, feeCents: 125000, totalCents: 50125000, depositCents: 15037500, terms: { depositPct: 30, dueDays: 0 } }, invoices: { deposit: { amountCents: 15037500, paidCents: 15037500, status: 'paid' }, balance: { amountCents: 35087500, paidCents: 0, status: 'open' } }, acceptedAt: '2026-09-01', releasedAt: '2026-09-02', requirements: [{ sku: 'CC-C215', qty: 4 }], allocatedSerials: ['CC418-26-44192'] }, requests: [{ id: 'r1', kind: 'shipping', message: 'Deliver to the Bakersfield yard instead', status: 'open', at: '2026-09-20T10:00:00Z', by: 'ops@riverside.example', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, answer: null }] },
      { id: 'o2', orderNo: 'CC-26-4420', status: 'accepted', createdAt: '2026-09-18T10:00:00Z', customer: { name: 'Sierra Storage', email: 'buy@sierra.example' }, items: [{ sku: 'CC-C418', name: '418 kWh', qty: 2 }], logic: { commercial: { baseCents: 30000000, feeCents: 75000, totalCents: 30075000, depositCents: 9022500, terms: { depositPct: 30, dueDays: 0 } }, invoices: { deposit: { amountCents: 9022500, paidCents: 0, status: 'open' } }, acceptedAt: '2026-09-18', requirements: [], allocatedSerials: [] } },
      { id: 'o3', orderNo: 'CC-26-4421', status: 'new', createdAt: '2026-09-20T10:00:00Z', customerId: 'company_incharge', customer: { name: 'Purchasing', company: 'InCharge Energy', email: 'po@incharge.example' }, items: [{ sku: 'CC-C215', name: '215 kWh', qty: 20 }], logic: null }
    ],
    customers: [
      { id: 'company_riverside', company: 'Riverside Cold Chain', accountType: 'company', domain: 'riverside.example', status: 'active', terms: { depositPct: 40, dueDays: 0 }, usersLimited: false, users: [
        { email: 'ops@riverside.example', name: 'Dana Ops', role: 'owner', status: 'active', activated: true },
        { email: 'finance@riverside.example', name: 'Riley Finance', role: 'user', status: 'active', activated: false },
        { email: 'new.hire@riverside.example', name: '', role: 'user', status: 'pending', activated: true, requestedAt: '2026-09-23T15:00:00Z' }] },
      { id: 'company_incharge', company: 'InCharge Energy', accountType: 'company', domain: '', status: 'active', terms: { depositPct: 30, dueDays: 0 }, users: [], usersLimited: false }
    ],
    intake: [{ id: 'po_x', orderNo: 'PO-IN-X', customerId: 'company_riverside', poNumber: 'RCC-2211', status: 'po_review', source: 'customer', notes: 'see attached', createdAt: '2026-09-19T10:00:00Z', reviewNote: '', convertedAt: null, rep: null, files: [] }],
    companyOrders: [{ id: 'o1', customerId: 'company_riverside', orderNo: 'CC-26-4419', status: 'in_fulfilment', poNumber: 'RCC-2200', items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], destinations: [{ id: 'd1', address: { name: 'Riverside yard', city: 'Bakersfield', state: 'CA' }, items: [{ sku: 'CC-C215', qty: 5 }] }], revision: 1, legs: [{ id: 'LOAD-1', status: 'in_transit', carrier: 'Estes', tracking: 'BOL-771', destinationId: 'd1', serials: ['CC418-26-44192'], lastConfirmedLocation: { label: 'Fresno, CA' } }] }],
    account: { customerId: 'company_riverside', company: 'Riverside Cold Chain', accountType: 'company', since: '2026-08-01T00:00:00Z', rep: { name: 'Sam Rep', email: 'sam@cleancell.us' }, plan: 'free', status: 'active',
      you: { email: 'ops@riverside.example', name: 'Dana Ops', phone: '', role: 'owner' }, address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, terms: { depositPct: 40, dueDays: 0, netDays: 30 }, users: null, agreements: [{ kind: 'MSA', ref: 'MSA-2026-04', signedAt: '2026-08-02' }], orders: 1 },
    projects: [{ id: 'p1', name: 'Bakersfield yard', module: 'bess', updatedAt: '2026-09-18T10:00:00Z', revision: 3 }],
    benchUnit: { serial: 'CC418-26-44190', sku: 'CC-C215', at: 'rack', work: {}, hold: null },
    /* custody (api/_lib/custody.js): one end site on the customer's account,
       the load above on its way there, events appended per serial */
    sites: [{ id: 'site_company-riverside-riverside-yard-93307', orgId: ORG, name: 'Riverside yard', customerId: 'company_riverside', endCustomer: '', address: { line1: '1200 Depot Rd', line2: '', city: 'Bakersfield', state: 'CA', zip: '93307', country: 'US' }, lat: null, lng: null,
      interconnection: { utility: 'PG&E', accountNo: '', meterNo: '1002233', poi: 'MSB-2, 480 V', serviceVoltage: '480', serviceKw: 500, agreementRef: '' }, contact: { name: 'Dana Ops', phone: '', email: 'ops@riverside.example' }, notes: '', status: 'active', lifecycleSiteId: null, createdAt: '2026-09-01T10:00:00Z', createdBy: 'demo@cleancell.us' }],
    custodyEvents: { 'CC418-26-44192': [{ type: 'ship', from: '', to: 'in_transit', by: 'demo@cleancell.us', at: '2026-09-10T15:00:00Z', method: 'logistics', legId: 'LOAD-1', orderId: 'o1' }] },
    custodyMapping: null,
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
  function money(o) { var inv = 0, pd = 0; Object.keys((o.logic && o.logic.invoices) || {}).forEach(function (k) { inv += o.logic.invoices[k].amountCents || 0; pd += o.logic.invoices[k].paidCents || 0; }); return { id: o.id, orderNo: o.orderNo, status: o.status, stage: S.stageOf(o), poNumber: o.poNumber || null, billedTo: { name: o.customer.name || '', email: o.customer.email || '' }, items: o.items, invoicedCents: inv, paidCents: pd, balanceCents: inv - pd, shippedAt: o.shipment ? o.shipment.shippedAt : null, openRequests: (o.requests || []).filter(function (r) { return r.status === 'open'; }).length }; }
  function customerOf(email) { return state.customers.filter(function (c) { return c.users.some(function (u) { return u.email === email; }); })[0]; }
  var APP_URL = 'https://silmarillion.clearskyomega.com/portals/customer/app?org=cleancell.us', PORTAL_URL = 'https://silmarillion.clearskyomega.com/portals/customer/?org=cleancell.us';
  /* the office's view of one ACCOUNT: its people, every order on it (its
     customerId, or billed to one of its people), terms, links */
  function buyerDetail(id) {
    var c = state.customers.filter(function (x) { return x.id === id; })[0]; if (!c) return { error: 'Customer not found', status: 404 };
    var emails = c.users.filter(function (u) { return u.status === 'active'; }).map(function (u) { return u.email; });
    var orders = state.orders.filter(function (o) { return o.customerId === c.id || (!o.customerId && emails.indexOf(o.customer.email) >= 0); }).map(money);
    var contact = c.users.filter(function (u) { return u.role === 'owner' && u.status === 'active'; })[0] || c.users[0] || null;
    return { customerId: c.id, company: c.company, accountType: c.accountType || 'company', domain: c.domain || '', rep: null, owner: false, editorAccess: { status: 'none' },
      name: contact ? contact.name : '', email: contact ? contact.email : '', phone: '', activated: !!(contact && contact.activated), contactStatus: contact ? contact.status : null,
      people: clone(c.users), address: state.account.customerId === c.id ? state.account.address : null, createdAt: '2026-08-01T00:00:00Z', plan: 'free', status: c.status, terms: c.terms, portalUrl: PORTAL_URL, appUrl: APP_URL,
      orders: orders, totals: orders.reduce(function (t, m) { t.invoicedCents += m.invoicedCents; t.paidCents += m.paidCents; t.balanceCents += m.balanceCents; t.openRequests += m.openRequests; return t; }, { invoicedCents: 0, paidCents: 0, balanceCents: 0, openRequests: 0 }), limited: false };
  }
  function buyersJson(q) {
    if (/customerId=/.test(q)) return buyerDetail(decodeURIComponent((/customerId=([^&]*)/.exec(q) || [])[1] || ''));
    if (/email=/.test(q)) { var c = customerOf(decodeURIComponent((/email=([^&]*)/.exec(q) || [])[1] || '')); return c ? buyerDetail(c.id) : { error: 'Customer not found', status: 404 }; }
    return { org: ORG, name: 'Clean Cell', brand: brand, owner: false, portalUrl: PORTAL_URL, appUrl: APP_URL, next: null,
      customers: state.customers.map(function (c) { return Object.assign(clone(c), { pending: c.users.filter(function (u) { return u.status === 'pending'; }).length }); }) };
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
  /* ── custody: the office page and the customer's Sites & equipment ── */
  function prodOf(sku) { return benchBy[sku] || null; }
  function unitView(u, now) { var c = Cu.custodyOf(u); return { serial: u.serial, sku: u.sku, unitType: u.unitType || 'unit', orderId: u.orderId || null, orderNo: u.orderNo || null, customerId: u.customerId || c.customerId || null, at: u.at || '', hold: u.hold || null, custody: Object.assign({}, c, { label: Cu.label(c.status), confirmation: Cu.confirmation(c) }), coverage: Cu.coverageWithInheritance(prodOf(u.sku), u, now) }; }
  function shipUnits() { return state.units.filter(function (u) { return u.shipUnit; }); }
  function siteRow(s) { return Object.assign({}, s, { units: shipUnits().filter(function (u) { return Cu.custodyOf(u).siteId === s.id; }).length }); }
  function custodyJson(q) {
    var now = iso(Date.now()), units = shipUnits(), cat = CATALOG;
    if (/serial=/.test(q)) {
      var serial = decodeURIComponent((/serial=([^&]*)/.exec(q) || [])[1] || ''), u = units.filter(function (x) { return x.serial === serial; })[0]; if (!u) return { status: 404, error: 'Serial not found' };
      var c = Cu.custodyOf(u), site = state.sites.filter(function (s) { return s.id === c.siteId; })[0], rb = units.filter(function (x) { return x.serial === c.replacedBy; })[0], rs = units.filter(function (x) { return x.serial === c.replaces; })[0];
      return { brand: brand, unit: unitView(u, now), product: prodOf(u.sku) ? { sku: u.sku, name: prodOf(u.sku).name, coverage: Cu.templatesOf(prodOf(u.sku)) } : null, site: site || null, events: (state.custodyEvents[serial] || []).slice().reverse(), scans: [], replacedBy: rb ? unitView(rb, now) : null, replaces: rs ? unitView(rs, now) : null, moves: Cu.MOVES, states: Cu.STATES };
    }
    if (/site=/.test(q)) { var sid = decodeURIComponent((/site=([^&]*)/.exec(q) || [])[1] || ''), sd = state.sites.filter(function (s) { return s.id === sid; })[0]; if (!sd) return { status: 404, error: 'Site not found' }; var here = units.filter(function (u) { return Cu.custodyOf(u).siteId === sid; }); return { brand: brand, site: sd, units: here.map(function (u) { return unitView(u, now); }), exceptions: Cu.exceptions(here, cat, now), limited: false }; }
    if (/view=exceptions/.test(q)) return { brand: brand, exceptions: Cu.exceptions(units, cat, now), sampled: units.length, limited: false };
    if (/view=register/.test(q)) {
      var custName = {}; state.customers.forEach(function (x) { custName[x.id] = x.company; });
      var rows = units.map(function (u) { var c = Cu.custodyOf(u), o = state.orders.filter(function (x) { return x.id === u.orderId; })[0] || null, co = state.companyOrders.filter(function (x) { return x.id === u.orderId; })[0], leg = co ? ((co.legs || []).filter(function (l) { return l.id === c.legId || (!c.legId && (l.serials || []).indexOf(u.serial) >= 0); })[0] || null) : null;
        return Cu.registerRow(u, { product: prodOf(u.sku), order: o ? Object.assign({}, o, { poNumber: co ? co.poNumber : null }) : null, leg: leg, site: c.siteId ? state.sites.filter(function (x) { return x.id === c.siteId; })[0] || null : null, seller: 'Clean Cell', buyer: custName[u.customerId || c.customerId] || (o && o.customer && o.customer.name) || '' }, now); });
      return { brand: brand, name: 'Clean Cell', owner: false, columns: Cu.REGISTER_COLUMNS, rows: rows, sites: state.sites.filter(function (x) { return x.status !== 'inactive'; }).map(function (x) { return { id: x.id, name: x.name }; }), products: cat.filter(function (p) { return (p.kind || 'product') === 'product'; }).map(function (p) { return { sku: p.sku, name: p.name }; }), limited: false, sampled: units.length };
    }
    var counts = {}; Cu.STATUSES.forEach(function (k) { counts[k || 'plant'] = 0; }); var off = []; units.forEach(function (u) { var c = Cu.custodyOf(u); counts[c.status || 'plant']++; if (c.status) off.push(unitView(u, now)); });
    var cov = { active: 0, pending: 0, expired: 0, expiring: 0 }; off.forEach(function (u) { u.coverage.forEach(function (cv) { if (cov[cv.status] != null) cov[cv.status]++; }); });
    return { brand: brand, name: 'Clean Cell', owner: false, counts: counts, coverage: cov, units: off, unitsShown: off.length, unitsTotal: off.length, sites: state.sites.map(siteRow), exceptions: Cu.exceptions(units, cat, now),
      customers: state.customers.map(function (c) { return { id: c.id, name: c.company }; }), products: cat.filter(function (p) { return (p.kind || 'product') === 'product'; }).map(function (p) { return { sku: p.sku, name: p.name, coverage: Cu.templatesOf(p) }; }),
      toConfirm: off.filter(function (u) { return u.custody.confirmation === 'declared'; }), planned: off.filter(function (u) { return u.custody.plannedSiteId && !u.custody.siteId; }),
      mapping: state.custodyMapping, columns: Cu.TEMPLATE_HEADERS, moves: Cu.MOVES, states: Cu.STATES, limited: false, sampled: units.length };
  }
  function logisticsJson() { return { owner: false, brand: brand, notice: 'Sandbox: one order with one planned load.', limited: false, orders: state.companyOrders.map(function (o) { return { id: o.id, orderNo: o.orderNo, poNumber: o.poNumber, revision: o.revision, destinations: o.destinations, legs: o.legs || [] }; }) }; }
  function pubSite(s) { return { id: s.id, name: s.name, address: s.address || {}, endCustomer: s.endCustomer || '', interconnection: s.interconnection || {}, contact: s.contact || {}, notes: s.notes || '', status: s.status || 'active' }; }
  function pubUnit(u) { var c = Cu.custodyOf(u), p = prodOf(u.sku), now = iso(Date.now()); return { serial: u.serial, sku: u.sku, name: p ? p.name : u.sku, orderNo: u.orderNo || null, status: c.status || (u.at === 'ready' ? 'ready to ship' : 'being built'), label: c.status ? Cu.label(c.status) : (u.at === 'ready' ? 'ready to ship' : 'being built'), state: c.state || null,
    siteId: c.siteId || null, siteName: c.siteName || null, position: c.position || '', shippedAt: c.shippedAt || null, receivedAt: c.receivedAt || null, installedAt: c.installedAt || null, commissionedAt: c.commissionedAt || null, replacedBy: c.replacedBy || null, replaces: c.replaces || null, plannedSiteId: c.plannedSiteId || null, plannedSiteName: c.plannedSiteName || null, confirmation: Cu.confirmation(c), confirmedAt: c.confirmedAt || null,
    coverage: Cu.coverageWithInheritance(p, u, now).map(function (cv) { return { id: cv.templateId, type: cv.type, provider: cv.provider, status: cv.status, why: cv.why, from: cv.startDate, until: cv.endDate, termMonths: cv.termMonths, metrics: cv.metrics, docUrl: cv.docUrl }; }) }; }
  function myUnits() { return shipUnits().filter(function (u) { return u.orderId === 'o1'; }); }
  function mySitesJson() { var units = myUnits(), per = {}; units.forEach(function (u) { var sid = Cu.custodyOf(u).siteId; if (sid) per[sid] = (per[sid] || 0) + 1; });
    return { org: ORG, brand: brand, customerId: 'company_riverside', sites: state.sites.filter(function (s) { return s.customerId === 'company_riverside' && s.status !== 'inactive'; }).map(function (s) { return Object.assign(pubSite(s), { units: per[s.id] || 0 }); }),
      units: units.filter(function (u) { return Cu.custodyOf(u).status || u.at === 'ready'; }).map(pubUnit), moves: { received: ['', 'in_transit', 'delivered'], assign: ['delivered', 'received', 'assigned'], installed: ['assigned', 'received'], commissioned: ['assigned', 'installed', 'received'] } }; }
  function riverside() { return state.customers.filter(function (c) { return c.id === 'company_riverside'; })[0]; }
  function accountJson(who) { var a = clone(state.account); if (who) a.you.email = who; a.users = riverside().users.map(function (u) { return { email: u.email, name: u.name, role: u.role, status: u.status, activated: u.activated, requestedAt: u.requestedAt || null }; }); return a; }
  function myOrdersJson(who) {
    var mine = state.orders.filter(function (o) { return o.customer.email === (who || 'ops@riverside.example') || o.customer.email === 'ops@riverside.example'; });
    return { orders: mine.map(function (o) {
      var l = o.logic, c = l && l.commercial, shipped = !!o.shipment, key = shipped ? 'shipped' : o.status === 'in_fulfilment' ? 'building' : o.status === 'accepted' ? 'confirmed' : 'received';
      var ms = { received: { label: 'Received', index: 0, say: 'We have your order and will confirm it shortly.' }, confirmed: { label: 'Confirmed', index: 1, say: 'Confirmed. Building starts when the deposit is in.' }, building: { label: 'Building', index: 2, say: 'Your units are on the line.' }, shipped: { label: 'Shipped', index: 5, say: 'On its way.' } }[key];
      return { orderNo: o.orderNo, soldBy: 'Clean Cell', placedAt: o.createdAt, poNumber: o.id === 'o1' ? 'RCC-2200' : (o.poNumber || null), milestone: Object.assign({ key: key, of: 6 }, ms),
        items: o.items.map(function (i) { var p = benchBy[i.sku] || {}; return { sku: i.sku, name: i.name || i.sku, qty: i.qty, kw: p.kw || null, kwh: p.kwh || null, warranty: o.shipment && p.warrantyYears ? { years: p.warrantyYears, from: o.shipment.shippedAt.slice(0, 10), until: String(Number(o.shipment.shippedAt.slice(0, 4)) + p.warrantyYears) + o.shipment.shippedAt.slice(4, 10) } : null }; }),
        checkout: c ? { currency: 'USD', total: c.totalCents / 100, processingFee: c.feeCents / 100, accounting: (l && l.accounting) === 'tenant' ? 'tenant' : 'quickbooks', depositPercent: c.terms.depositPct, invoices: Object.keys(l.invoices).map(function (k) { return { stage: k, amount: l.invoices[k].amountCents / 100, status: l.invoices[k].status, payUrl: null }; }) } : null,
        documents: [], destinations: o.id === 'o1' ? [{ id: 'd1', name: 'Riverside yard', city: 'Bakersfield', state: 'CA', items: [{ sku: 'CC-C215', qty: 5 }] }] : [], loads: [], shipment: o.shipment || null, cancelRequested: !!o.cancelRequested,
        requests: (o.requests || []).map(function (r) { return { id: r.id, kind: r.kind, message: r.message, by: r.by || null, status: r.status, at: r.at, address: r.address || null, answer: r.answer || null }; }) };
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
  return { materialsJson: materialsJson, soloJson: soloJson, catalogJson: catalogJson, plantJson: plantJson, officeJson: officeJson, buyersJson: buyersJson, intakeJson: intakeJson, portalJson: portalJson, accountJson: accountJson, myOrdersJson: myOrdersJson, custodyJson: custodyJson, logisticsJson: logisticsJson, mySitesJson: mySitesJson, pubUnit: pubUnit, pubSite: pubSite, unitView: unitView, designJson: designJson, designPost: designPost, benchJson: benchJson, manifest: manifest, brand: brand, CATALOG: CATALOG, benchCab: benchCab };
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
    function acctOf() { return b.customerId ? state.customers.filter(function (x) { return x.id === b.customerId; })[0] : state.customers.filter(function (x) { return x.users.some(function (u) { return u.email === b.email; }); })[0]; }
    if (b.action === 'user-add') {
      var ac = acctOf(), em = String(b.email || '').trim().toLowerCase(); if (!ac) return err(404, 'Active customer account not found');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return err(400, 'A valid customer email is required');
      if (state.customers.some(function (x) { return x.users.some(function (u) { return u.email === em; }); })) return err(409, 'This person is already on an account; their access was preserved');
      ac.users.push({ email: em, name: String(b.name || '').slice(0, 120), role: b.role === 'owner' ? 'owner' : 'user', status: 'active', activated: false });
      return { ok: true, person: { email: em, role: b.role === 'owner' ? 'owner' : 'user', status: 'active' }, note: 'Added. They sign in with ' + em + '; send them the customer app link.' };
    }
    if (b.action === 'user-status') {
      var ax = acctOf(), p = ax && ax.users.filter(function (u) { return u.email === b.email; })[0]; if (!p) return err(404, 'That person is not on this account');
      var next = { status: b.status || p.status, role: b.role || p.role };
      if (!ax.users.some(function (u) { return (u.email === p.email ? next.role : u.role) === 'owner' && (u.email === p.email ? next.status : u.status) === 'active'; })) return err(409, 'An account needs at least one active owner; make someone else the owner first');
      p.status = next.status; p.role = next.role; return { ok: true, person: { email: p.email, status: p.status, role: p.role }, note: p.status === 'active' ? 'Access on.' : 'Access off. Their past activity stays on the account.' };
    }
    if (b.action === 'profile') { var ap = acctOf(); if (!ap) return err(404, 'Customer not found'); ap.company = String(b.company || ap.company); ap.status = b.status === 'suspended' ? 'suspended' : 'active'; if (b.domain !== undefined) ap.domain = String(b.domain || ''); return { ok: true, note: 'Customer profile saved. Existing orders, invoices and subscription billing were not changed.' }; }
    if (b.action === 'invite') return err(409, 'Customer email delivery is not configured. Share the customer app link instead.');
    if (b.action === 'terms') { var c = acctOf(); if (!c) return err(404, 'Create this customer first'); var t = { depositPct: Number(b.terms.depositPct), dueDays: Number(b.terms.dueDays) }; if (!(t.depositPct >= 0 && t.depositPct <= 100)) return err(400, 'Deposit must be 0–100%'); c.terms = t; if (state.account.customerId === c.id) state.account.terms = Object.assign({}, state.account.terms, t); return { ok: true, terms: t, note: 'Applies to future prices. Existing invoices retain their agreed terms.' }; }
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
        state.orders.unshift({ id: id, orderNo: orderNo, status: 'new', createdAt: now, customerId: cust.id, customer: { name: billing.name || billing.email, company: cust.company, email: billing.email }, items: items, logic: null, poNumber: number, requests: [] });
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
  function patchUnit(u, patch) { Object.keys(patch).forEach(function (k) { var parts = k.split('.'), t = u; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = patch[k]; }); }
  function logEvent(serial, ev) { (state.custodyEvents[serial] = state.custodyEvents[serial] || []).push(ev); }
  function unitBy(serial) { return state.units.filter(function (x) { return x.serial === serial; })[0]; }
  function siteBy(id) { return state.sites.filter(function (s) { return s.id === id && s.status !== 'inactive'; })[0]; }
  function moveUnit(u, move, body, method) { var v = Cu.judge(u, move, body); if (!v.ok) return err(409, v.say); if (v.action === 'duplicate') return { ok: true, action: 'duplicate', serial: u.serial, say: v.say, custody: Cu.custodyOf(u) }; var ap = Cu.apply(u, move, body, who, now, method); if (u.customerId && !Cu.custodyOf(u).customerId) ap.patch['custody.customerId'] = u.customerId; patchUnit(u, ap.patch); logEvent(u.serial, ap.event); return { ok: true, action: move, serial: u.serial, say: 'Recorded: ' + Cu.label(Cu.custodyOf(u).status) + (body.siteName ? ' at ' + body.siteName : ''), custody: Cu.custodyOf(u) }; }
  function saveSite(b, forceCustomer) {
    var existing = b.id ? state.sites.filter(function (s) { return s.id === b.id; })[0] : null; if (b.id && !existing) return err(404, 'Site not found');
    var rec; try { rec = Cu.site(forceCustomer ? Object.assign({}, b, { customerId: forceCustomer }) : b, existing || null); } catch (e) { return err(e.status || 400, e.message); }
    if (forceCustomer) rec.customerId = forceCustomer;
    var id = existing ? existing.id : Cu.siteId(rec.customerId, rec); if (!existing && state.sites.some(function (s) { return s.id === id; })) return err(409, 'A site with that name and ZIP already exists for this customer: ' + id);
    var doc = Object.assign({ orgId: ORG, id: id }, rec, { updatedAt: now, updatedBy: who }); if (existing) Object.assign(existing, doc); else state.sites.push(Object.assign(doc, { createdAt: now, createdBy: who }));
    return { ok: true, siteId: id, site: existing || doc };
  }
  if (path === '/api/logic-custody') {
    var method = ['manual', 'scan', 'import'].indexOf(b.method) >= 0 ? b.method : 'manual';
    if (b.action === 'site') return saveSite(b, null);
    if (b.action === 'mapping-save') { state.custodyMapping = b.mapping || {}; return { ok: true, mapping: state.custodyMapping }; }
    if (b.action === 'detail') {
      var tu = unitBy(String(b.serial || '').trim()); if (!tu) return err(404, 'Serial is not registered');
      var tr; try { tr = Cu.detail(tu, b, who, now); } catch (e) { return err(e.status || 400, e.message); }
      if (tr.duplicate) return { ok: true, action: 'duplicate', serial: tu.serial, custody: Cu.custodyOf(tu) };
      patchUnit(tu, tr.patch); logEvent(tu.serial, tr.event); return { ok: true, action: 'detail', serial: tu.serial, changed: tr.event.fields, custody: Cu.custodyOf(tu) };
    }
    if (b.action === 'confirm' || b.action === 'destination') {
      var xu = unitBy(String(b.serial || '').trim()); if (!xu) return err(404, 'Serial is not registered');
      var xs = b.siteId ? siteBy(b.siteId) : null; if (b.action === 'destination' && b.siteId && !xs) return err(404, 'Site not found');
      var xr; try { xr = b.action === 'confirm' ? Cu.confirm(xu, b, who, now) : Cu.destination(xu, { siteId: xs ? xs.id : '', siteName: xs ? xs.name : '', position: b.position, note: b.note }, who, now, method); } catch (e) { return err(e.status || 400, e.message); }
      if (xr.duplicate) return { ok: true, action: 'duplicate', serial: xu.serial, say: 'Already confirmed', custody: Cu.custodyOf(xu) };
      patchUnit(xu, xr.patch); logEvent(xu.serial, xr.event);
      return { ok: true, action: b.action, serial: xu.serial, say: b.action === 'confirm' ? 'Confirmed at ' + (xu.custody.siteName || xu.custody.siteId) : (xs ? 'Going to ' + xs.name : 'Destination cleared'), custody: Object.assign(Cu.custodyOf(xu), { confirmation: Cu.confirmation(xu.custody) }) };
    }
    if (b.action === 'move' || b.action === 'state' || b.action === 'replace') {
      var cu = unitBy(String(b.serial || '').trim()); if (!cu) return err(404, 'Serial is not registered');
      if (b.action === 'move' && b.move === 'ship') return err(400, 'Shipping is recorded under Shipping & receiving, on the load');
      var cs = b.siteId ? siteBy(b.siteId) : null; if (b.siteId && !cs) return err(404, 'Site not found');
      var cb = Object.assign({}, b, { siteId: cs ? cs.id : undefined, siteName: cs ? cs.name : undefined });
      if (b.action === 'state') { var st; try { st = Cu.state(cu, String(b.state || ''), cb, who, now, method); } catch (e) { return err(e.status || 400, e.message); } patchUnit(cu, st.patch); logEvent(cu.serial, st.event); return { ok: true, serial: cu.serial, state: st.patch['custody.state'] }; }
      if (b.action === 'replace') {
        var v0 = Cu.judge(cu, 'replace', cb); if (!v0.ok) return err(409, v0.say); var ru = unitBy(String(b.replacementSerial || '').trim()); if (!ru) return err(404, 'Replacement serial is not registered');
        var c0 = Cu.custodyOf(cu), rc = Cu.custodyOf(ru), old = Cu.coverageWithInheritance(V.CATALOG.filter(function (p) { return p.sku === cu.sku; })[0], cu, now).map(function (cv) { return Object.assign({}, cv, { serial: cu.serial }); });
        var apr = Cu.apply(cu, 'replace', cb, who, now, method); patchUnit(cu, apr.patch); logEvent(cu.serial, apr.event);
        var rp = { 'custody.status': c0.status === 'rma_open' && c0.siteId ? 'assigned' : 'received', 'custody.custodian': c0.siteId ? 'site' : 'customer', 'custody.siteId': c0.siteId || null, 'custody.siteName': c0.siteName || null, 'custody.position': c0.position || '', 'custody.customerId': c0.customerId || cu.customerId || null, 'custody.replaces': cu.serial, 'custody.receivedAt': rc.receivedAt || now.slice(0, 10), 'custody.assignedAt': c0.siteId ? now.slice(0, 10) : null, 'custody.inheritedCoverage': Cu.inherited(old), 'custody.updatedAt': now, 'custody.updatedBy': who };
        patchUnit(ru, rp); logEvent(ru.serial, { type: 'replacement-of', from: rc.status, to: rp['custody.status'], replaces: cu.serial, siteId: c0.siteId || null, by: who, at: now, method: method });
        return { ok: true, serial: cu.serial, replacementSerial: ru.serial, siteId: c0.siteId || null, inherited: rp['custody.inheritedCoverage'] };
      }
      if (!Cu.MOVES[b.move]) return err(400, 'Unknown move');
      return moveUnit(cu, b.move, cb, method);
    }
    if (b.action === 'receive-load') {
      var co = state.companyOrders.filter(function (o) { return o.id === b.orderId; })[0], leg = co && (co.legs || []).filter(function (l) { return l.id === b.legId; })[0]; if (!leg) return err(404, 'Load not found on this order');
      var rec = Cu.reconcile(leg.serials, (b.received || []).map(function (r) { return { serial: String(typeof r === 'string' ? r : r.serial).trim(), condition: r && r.condition === 'damaged' ? 'damaged' : 'accepted' }; })), rsite = b.siteId ? siteBy(b.siteId) : null; if (b.siteId && !rsite) return err(404, 'Site not found');
      var applied = [], damagedApplied = [], refused = [];
      rec.received.concat(rec.damaged).forEach(function (sn, i) { var uu = unitBy(sn); if (!uu) { refused.push({ serial: sn, why: 'not registered' }); return; } var body = { at: b.at, condition: i < rec.received.length ? 'accepted' : 'damaged', siteId: rsite ? rsite.id : undefined, siteName: rsite ? rsite.name : undefined, legId: leg.id, note: b.note }; var r = moveUnit(uu, 'receive', body, method); if (r.error) { refused.push({ serial: sn, why: r.error }); return; } (body.condition === 'damaged' ? damagedApplied : applied).push(sn); });
      if (rec.complete && !refused.length) leg.status = 'received';
      return { ok: true, legId: leg.id, received: applied, damaged: damagedApplied, short: rec.short, overage: rec.overage, duplicate: rec.duplicate, refused: refused, complete: rec.complete && !refused.length, note: rec.short.length ? rec.short.length + ' expected serial' + (rec.short.length === 1 ? '' : 's') + ' did not arrive; the load stays partial until they do or Shipping records them missing.' : (rec.overage.length ? rec.overage.length + ' serial' + (rec.overage.length === 1 ? ' was' : 's were') + ' not on this load and not received; check the load they belong to.' : 'Every expected serial was received.') };
    }
    if (b.action === 'import') {
      var parsed = Array.isArray(b.rows) ? { headers: Object.keys(b.rows[0] || {}), rows: b.rows } : Cu.parseCsv(b.text), mapping = b.mapping && Object.keys(b.mapping).length ? b.mapping : Cu.guessMapping(parsed.headers, state.custodyMapping);
      if (!Object.keys(mapping).some(function (h) { return mapping[h] === 'serial'; })) return err(400, 'Map a column to the serial number');
      var unitsBy = {}; state.units.forEach(function (u) { unitsBy[u.serial] = u; }); var sitesBy = {}, byKey = {}; state.sites.forEach(function (s) { sitesBy[s.id] = s; byKey[Cu.siteKey(s.customerId, s.name, s.address && s.address.zip)] = s; });
      var planned; try { planned = Cu.plan(parsed.rows, mapping, { units: unitsBy, sites: sitesBy, byKey: byKey, customerId: b.customerId || null, allowNewSites: b.allowNewSites === true }, now); } catch (e) { return err(e.status || 400, e.message); }
      if (b.dryRun !== false) return { ok: true, dryRun: true, headers: parsed.headers, mapping: mapping, plan: planned };
      var done = { created: 0, updated: 0, skipped: 0 }, batchId = 'imp_' + hex(6);
      planned.newSites.forEach(function (s) { state.sites.push(Object.assign({ id: s.id, orgId: ORG }, Cu.site({ name: s.name, customerId: s.customerId, address: s.address, endCustomer: s.endCustomer, interconnection: s.interconnection }), { createdAt: now, createdBy: who, importBatchId: batchId })); done.created++; });
      planned.items.forEach(function (item) { if (item.problems.length) return; if (!item.actions.length) { done.skipped++; return; } var u = unitsBy[item.serial]; item.actions.forEach(function (a) { var ap = Cu.apply(u, a.action, a, who, now, 'import'); patchUnit(u, ap.patch); ap.event.importBatchId = batchId; logEvent(u.serial, ap.event); }); if (b.customerId) u.custody.customerId = b.customerId; done.updated++; });
      return { ok: true, dryRun: false, batchId: batchId, mapping: mapping, summary: Object.assign({}, planned.summary, done), errors: planned.items.filter(function (x) { return x.problems.length; }) };
    }
    return err(400, 'Unknown custody action');
  }
  if (path === '/api/my-sites') {
    var CM = { received: 'receive', assign: 'assign', installed: 'install', commissioned: 'commission' };
    if (b.action === 'site') { var sr = saveSite(b, 'company_riverside'); return sr.error ? sr : { ok: true, site: V.pubSite(sr.site) }; }
    if (b.action === 'destination') {
      var du = unitBy(String(b.serial || '').trim()); if (!du || du.orderId !== 'o1') return err(404, 'That serial is not on one of your orders');
      var dsite = b.siteId ? siteBy(b.siteId) : null; if (b.siteId && (!dsite || dsite.customerId !== 'company_riverside')) return err(404, 'Site not found on your account');
      var dr; try { dr = Cu.destination(du, { siteId: dsite ? dsite.id : '', siteName: dsite ? dsite.name : '', position: b.position, note: b.note }, who, now, 'customer'); } catch (e) { return err(e.status || 400, e.message); }
      patchUnit(du, dr.patch); logEvent(du.serial, dr.event); return { ok: true, unit: V.pubUnit(du) };
    }
    if (!CM[b.action]) return err(400, 'Unsupported action');
    var mu = unitBy(String(b.serial || '').trim()); if (!mu || mu.orderId !== 'o1') return err(404, 'That serial is not on one of your orders');
    var ms = b.siteId ? siteBy(b.siteId) : null; if (b.siteId && (!ms || ms.customerId !== 'company_riverside')) return err(404, 'Site not found on your account'); if (CM[b.action] === 'assign' && !ms) return err(400, 'Choose the site');
    var mr = moveUnit(mu, CM[b.action], { at: b.at, condition: b.condition === 'damaged' ? 'damaged' : 'accepted', siteId: ms ? ms.id : undefined, siteName: ms ? ms.name : undefined, position: b.position, installer: b.installer, endCustomer: ms ? ms.endCustomer : undefined, note: b.note }, 'customer');
    if (mr.error) return mr; mu.custody.customerId = 'company_riverside'; return { ok: true, duplicate: mr.action === 'duplicate', unit: V.pubUnit(mu) };
  }
  if (path === '/api/my-account') {
    var rv = state.customers.filter(function (x) { return x.id === 'company_riverside'; })[0];
    if (b.action === 'add-user') {
      var ne = String(b.email || '').trim().toLowerCase();
      if (ne.split('@')[1] !== 'riverside.example') return err(400, 'Add colleagues with an @riverside.example email. Anyone else, ask your supplier to add.');
      if (state.customers.some(function (x) { return x.users.some(function (u) { return u.email === ne; }); })) return err(409, 'This person is already on the account; their access was preserved');
      rv.users.push({ email: ne, name: String(b.name || '').slice(0, 120), role: 'user', status: 'active', activated: false });
      return { ok: true, person: { email: ne, role: 'user', status: 'active' }, users: V.accountJson(who).users, note: 'Added. They sign in with ' + ne + ' and see this account.' };
    }
    if (b.action === 'user-status') {
      var pu = rv.users.filter(function (u) { return u.email === b.email; })[0]; if (!pu) return err(404, 'That person is not on this account');
      if (pu.email === (who || state.account.you.email)) return err(400, 'You cannot change your own access');
      pu.status = b.status === 'disabled' ? 'disabled' : 'active';
      return { ok: true, person: { email: pu.email, status: pu.status, role: pu.role }, users: V.accountJson(who).users, note: pu.status === 'active' ? 'Access on.' : 'Access off. Their past activity stays on the account.' };
    }
    var a = state.account; a.you.name = String(b.name || a.you.name).slice(0, 120); a.company = String(b.company || a.company).slice(0, 160); a.you.phone = String(b.phone || '').slice(0, 40);
    if (b.address) a.address = { line1: String(b.address.line1 || ''), city: String(b.address.city || ''), state: String(b.address.state || ''), zip: String(b.address.zip || '') };
    return V.accountJson(who);
  }
  return err(404, 'Not in this sandbox: ' + path);
}

module.exports = { initialState: initialState, views: views, post: post, ORG: ORG, CATALOG: CATALOG, brand: brand };
