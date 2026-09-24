/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/_lib/logic-fixtures.js — ONE sample Clean Cell, for the render
   checks and the phone sandboxes.

   A catalog with bills of materials, suppliers and prices, a stock count,
   one work order with six cabinets at real stations with real timings,
   three orders (one in build with a customer request, one awaiting its
   deposit, one to price), a company account with an uploaded PO under
   review, a customer account with a site plan on trial.

   The workspace bills on its own paper (fulfillment/config.accounting
   'tenant'): the order in build has its deposit paid and its balance
   invoice open with the supplier's pay link; the accepted order's deposit
   is still to issue. The CRM (docs/OMEGA-LOGIC-ECOSYSTEM.md) has contacts,
   logged activity with a follow-up that is overdue, a later one and an undated
   task on the other account, documents the office shared and one it did
   not, and one the customer uploaded from their app. The customer's design
   tool is on a trial from the supplier, with monthly and yearly prices to
   subscribe at.

   views(state) answers every endpoint the office, plant and customer apps
   read, shaped like api/*.js answers them and computed by the same pure
   libraries (materials, plant-board, plant-stats, plant-work, office-stage,
   logic-catalog, custody, crm — its projections and its TIMELINE — and the
   portal's pay-link check) — so a sandbox shows what the product computes,
   not a drawing of it. post(state, …) applies the writes a trial touches
   and returns what the endpoint would. State is plain JSON, so the sandbox
   keeps it in localStorage and the render check keeps it in memory.

   What the sample cannot do the product's way it says so here: a document's
   type is judged by its NAME (api/_lib/crm.js fileInput() reads the bytes
   with Node's Buffer), its bytes are not kept (a download is a one-page
   sample PDF or a line of text), and checkout and the billing page answer
   '#subscribed' / '#manage' — the render check and the sandbox shim turn
   those into the trip Stripe would make. Nothing reaches Stripe.

   Pure: no admin SDK, no network, no clock except Date.now() for dwell and
   for dates relative to today (a follow-up that is due, an invoice issued
   last week). scripts/build-app-sandbox.js bundles this file and the
   libraries it requires into app-sandbox/sandbox.js. */
'use strict';
var M = require('../../api/_lib/materials'), C = require('../../api/_lib/logic-catalog'), Stats = require('../../api/_lib/plant-stats');
var Board = require('../../api/_lib/plant-board'), Ops = require('../../api/_lib/plant-ops'), Attention = require('../../api/_lib/plant-attention');
var W = require('../../api/_lib/plant-work'), Plant = require('../../api/_lib/plant'), S = require('../../api/_lib/office-stage');
var Manifest = require('../../api/app-manifest'), Cu = require('../../api/_lib/custody');
var CRM = require('../../api/_lib/crm'), Portal = require('../../api/_lib/portal'), Policy = require('../../api/_lib/logic-policy');

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
var DAY_MS = 86400000;
/* The design tool's prices for this supplier's customers
   (billing/current.customerEditorLite) and the supplier's Editor Lite. */
var EDITOR_LITE = { enabled: true, modules: ['bess'] }, CUSTOMER_PRICES = { monthlyPriceCents: 79900, yearlyPriceCents: 799000 };
/* api/_lib/buyer-design.js entitlement(), for the account's grant: a paid
   subscription, or a trial the supplier's owner granted, unexpired. */
function entitlement(grant) {
  grant = grant || {}; var expiry = Date.parse(grant.expiresAt || '');
  var active = EDITOR_LITE.enabled && ['active', 'trial'].indexOf(grant.status) >= 0 && isFinite(expiry) && expiry > Date.now() && (grant.source === 'provider' || (grant.status === 'trial' && grant.source === 'owner-trial'));
  return { active: active, status: active ? grant.status : 'inactive', expiresAt: grant.expiresAt || null, modules: EDITOR_LITE.modules.slice() };
}
/* A document as the sample can judge it without Node: base64 that fits in
   2 MB and a name of an accepted kind. The product decides by the BYTES
   (api/_lib/crm.js fileInput); the error words are the same. */
var DOC_EXT = { pdf: 'pdf', png: 'png', jpg: 'jpg', jpeg: 'jpg', xlsx: 'xlsx', docx: 'docx', csv: 'csv', txt: 'txt' };
function fileLike(f) {
  if (!f || typeof f !== 'object') throw CRM.fail(400, 'Choose a file to upload');
  var name = CRM.text(f.name, 200, 'File name', { required: true }), b64 = typeof f.base64 === 'string' ? f.base64.replace(/^data:[^,]{0,120},/, '') : '';
  if (!b64 || b64.length > 2800000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw CRM.fail(400, 'The file must be PDF, PNG, JPEG, XLSX, DOCX, CSV or TXT, up to 2 MB');
  var size = Math.floor(b64.length * 3 / 4) - (/==$/.test(b64) ? 2 : /=$/.test(b64) ? 1 : 0);
  if (!size) throw CRM.fail(400, 'The file is empty');
  if (size > CRM.MAX_BYTES) throw CRM.fail(400, 'The file is larger than 2 MB');
  var m = /\.([A-Za-z0-9]{1,8})$/.exec(name), kind = m ? DOC_EXT[m[1].toLowerCase()] : null;
  if (!kind) throw CRM.fail(400, /\.zip$/i.test(name) ? 'Only Excel (.xlsx) and Word (.docx) files are accepted from zip-based formats' : 'Only PDF, PNG, JPEG, XLSX, DOCX, CSV or TXT documents are accepted');
  return { name: CRM.safeName(name, kind), type: CRM.MIME[kind], size: size };
}
/* What a download hands over in the sample: a one-page PDF naming the
   document (so Open shows a page), or a line of text. The product serves
   the stored bytes; the sample keeps none. ASCII only, so the byte offsets
   in the cross-reference table are the string offsets. */
function sampleBytes(f) {
  var name = String(f.name || 'document').replace(/[^\x20-\x7e]/g, '?');
  if (f.type !== 'application/pdf') return 'Sandbox sample of ' + name + '. Nothing here is real.\n';
  var line = function (s) { return '(' + s.replace(/[()\\]/g, ' ').slice(0, 90) + ')'; };
  var stream = 'BT /F1 18 Tf 72 720 Td ' + line(name) + ' Tj 0 -30 Td /F1 12 Tf ' + line('Sandbox sample document. Nothing here is real.') + ' Tj ET';
  var objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  var out = '%PDF-1.4\n', offs = [];
  objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  var xref = out.length;
  return out + 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function (n) { return ('0000000000' + n).slice(-10) + ' 00000 n \n'; }).join('')
    + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
}

/* ── the sample, as plain JSON ────────────────────────────────────────── */
function initialState() {
  var base = Date.now(); function T(h) { return new Date(base - (200 - h) * 3600000).toISOString(); }
  /* days before now (negative: after), as an ISO time and as a day */
  function ago(d) { return new Date(base - d * DAY_MS).toISOString(); } function dayAgo(d) { return ago(d).slice(0, 10); }
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
      /* billed on the supplier's own paper: no ClearSky fee on the total, the
         deposit paid against its invoice, the balance invoice issued last
         week with the supplier's pay link, due on the account's 30 days */
      { id: 'o1', orderNo: 'CC-26-4419', status: 'in_fulfilment', createdAt: '2026-09-01T10:00:00Z', poNumber: 'RCC-2200', customerId: 'company_riverside', customer: { name: 'Dana Ops', company: 'Riverside Cold Chain', email: 'ops@riverside.example' }, items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], worksOrderId: 'wo_1',
        logic: { accounting: 'tenant', commercial: { baseCents: 50125000, feeCents: 0, totalCents: 50125000, depositCents: 15037500, terms: { depositPct: 30, dueDays: 30 } },
          invoices: { deposit: { id: 'CC-INV-1031', issuedAt: '2026-09-01', issuedBy: 'sam@cleancell.us', amountCents: 15037500, paidCents: 15037500, status: 'paid', satisfied: true, balanceCents: 0, payments: [{ amountCents: 15037500, date: '2026-09-02', bankReference: 'WIRE-88213', by: 'sam@cleancell.us', at: '2026-09-02T16:00:00Z' }] },
            balance: { id: 'CC-INV-1058', issuedAt: dayAgo(9), issuedBy: 'sam@cleancell.us', amountCents: 35087500, paidCents: 0, status: 'awaiting_payment', payUrl: 'https://pay.example.com/cleancell/CC-INV-1058', payUrlBy: 'sam@cleancell.us', payUrlAt: ago(9) } },
          acceptedAt: '2026-09-01', releasedAt: '2026-09-02', requirements: [{ sku: 'CC-C215', qty: 4 }], allocatedSerials: ['CC418-26-44192'] }, requests: [{ id: 'r1', kind: 'shipping', message: 'Deliver to the Bakersfield yard instead', status: 'open', at: '2026-09-20T10:00:00Z', by: 'ops@riverside.example', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, answer: null }] },
      /* accepted; the deposit invoice is the supplier's to issue */
      { id: 'o2', orderNo: 'CC-26-4420', status: 'accepted', createdAt: '2026-09-18T10:00:00Z', customer: { name: 'Sierra Storage', email: 'buy@sierra.example' }, items: [{ sku: 'CC-C418', name: '418 kWh', qty: 2 }], logic: { accounting: 'tenant', commercial: { baseCents: 30075000, feeCents: 0, totalCents: 30075000, depositCents: 9022500, terms: { depositPct: 30, dueDays: 0 } }, invoices: { deposit: { amountCents: 9022500, paidCents: 0, status: 'to_issue' } }, acceptedAt: '2026-09-18', requirements: [], allocatedSerials: [] } },
      { id: 'o3', orderNo: 'CC-26-4421', status: 'new', createdAt: '2026-09-20T10:00:00Z', customerId: 'company_incharge', customer: { name: 'Purchasing', company: 'InCharge Energy', email: 'po@incharge.example' }, items: [{ sku: 'CC-C215', name: '215 kWh', qty: 20 }], logic: null }
    ],
    customers: [
      { id: 'company_riverside', company: 'Riverside Cold Chain', accountType: 'company', domain: 'riverside.example', status: 'active', terms: { depositPct: 40, dueDays: 0 }, usersLimited: false, users: [
        { email: 'ops@riverside.example', name: 'Dana Ops', role: 'owner', status: 'active', activated: true, createdAt: '2026-08-01T15:00:00Z' },
        { email: 'finance@riverside.example', name: 'Riley Finance', role: 'user', status: 'active', activated: false, createdAt: '2026-08-05T15:00:00Z', addedBy: 'ops@riverside.example' },
        { email: 'new.hire@riverside.example', name: '', role: 'user', status: 'pending', activated: true, requestedAt: '2026-09-23T15:00:00Z' }],
        /* the design tool: a trial the supplier's owner granted a week ago */
        editorLite: { status: 'trial', source: 'owner-trial', expiresAt: ago(-7), grantedBy: 'sam@cleancell.us', grantedAt: ago(7) } },
      { id: 'company_incharge', company: 'InCharge Energy', accountType: 'company', domain: '', status: 'active', terms: { depositPct: 30, dueDays: 0 }, users: [], usersLimited: false }
    ],
    /* the CRM (api/crm.js): per account, the contacts who never log in,
       what was logged, and the documents both ways. A call with a
       follow-up that fell due two days ago (overdue in any time zone), a
       meeting to follow up in ten days, a note, an email already followed
       up; an undated task on the other account (owed until done). Two
       office documents (one shared, one not) and a site survey the customer
       uploaded from their app. */
    crm: {
      company_riverside: {
        contacts: [
          { id: 'ct_dana', orgId: ORG, customerId: 'company_riverside', name: 'Dana Ops', title: 'Operations lead', email: 'ops@riverside.example', phone: '+1 661 555 0142', notes: 'Text before a delivery; the yard gate closes at 4 pm.', primary: true, archived: false, createdAt: '2026-08-01T16:00:00Z', createdBy: 'sam@cleancell.us' },
          { id: 'ct_pat', orgId: ORG, customerId: 'company_riverside', name: 'Pat Nguyen', title: 'Accounts payable', email: 'ap@riverside.example', phone: '', notes: 'Send every invoice here as well as to Dana.', primary: false, archived: false, createdAt: '2026-08-02T16:00:00Z', createdBy: 'sam@cleancell.us' }],
        activity: [
          { id: 'ac_call', orgId: ORG, customerId: 'company_riverside', type: 'call', subject: 'Bakersfield delivery window', body: 'Dana wants the load on site before the 15th. Checking the ship date with the plant.', at: ago(3), followUpAt: dayAgo(2), contactId: 'ct_dana', contactName: 'Dana Ops', orderId: 'o1', orderNo: 'CC-26-4419', by: 'sam@cleancell.us', loggedAt: ago(3), done: false, doneAt: null, doneBy: null },
          { id: 'ac_meet', orgId: ORG, customerId: 'company_riverside', type: 'meeting', subject: 'Second site for 2027', body: 'Fresno cold store, about 1 MWh. Wants a portfolio sizing in the new year.', at: ago(4), followUpAt: dayAgo(-10), contactId: 'ct_dana', contactName: 'Dana Ops', orderId: null, orderNo: null, by: 'sam@cleancell.us', loggedAt: ago(4), done: false, doneAt: null, doneBy: null },
          { id: 'ac_note', orgId: ORG, customerId: 'company_riverside', type: 'note', subject: 'Invoices go to AP too', body: 'Pat in accounts payable wants a copy of every invoice.', at: ago(20), followUpAt: null, contactId: 'ct_pat', contactName: 'Pat Nguyen', orderId: null, orderNo: null, by: 'sam@cleancell.us', loggedAt: ago(20), done: false, doneAt: null, doneBy: null },
          { id: 'ac_mail', orgId: ORG, customerId: 'company_riverside', type: 'email', subject: 'Countersigned MSA sent', body: '', at: '2026-08-02T16:30:00Z', followUpAt: '2026-08-09', contactId: 'ct_dana', contactName: 'Dana Ops', orderId: null, orderNo: null, by: 'sam@cleancell.us', loggedAt: '2026-08-02T16:30:00Z', done: true, doneAt: '2026-08-08T15:00:00Z', doneBy: 'sam@cleancell.us' }],
        files: [
          { id: 'f_msa', orgId: ORG, customerId: 'company_riverside', name: 'Riverside-MSA-2026.pdf', type: 'application/pdf', size: 184320, sha256: null, category: 'contract', note: 'Countersigned', shared: true, from: 'office', uploadedBy: 'sam@cleancell.us', uploadedAt: '2026-08-02T16:00:00Z', archived: false, uploadState: 'stored' },
          { id: 'f_sheet', orgId: ORG, customerId: 'company_riverside', name: 'Riverside-pricing-worksheet.xlsx', type: CRM.MIME.xlsx, size: 48213, sha256: null, category: 'other', note: 'Office only: the margin sheet', shared: false, from: 'office', uploadedBy: 'sam@cleancell.us', uploadedAt: '2026-08-20T16:00:00Z', archived: false, uploadState: 'stored' },
          { id: 'f_survey', orgId: ORG, customerId: 'company_riverside', name: 'Bakersfield-site-survey.pdf', type: 'application/pdf', size: 912384, sha256: null, category: 'site-survey', note: 'Pad and MSB photos', shared: true, from: 'customer', uploadedBy: 'ops@riverside.example', uploadedAt: ago(3), archived: false, uploadState: 'stored' }] },
      company_incharge: {
        contacts: [{ id: 'ct_morgan', orgId: ORG, customerId: 'company_incharge', name: 'Morgan Lee', title: 'Procurement', email: 'po@incharge.example', phone: '', notes: '', primary: true, archived: false, createdAt: '2026-09-20T12:00:00Z', createdBy: 'sam@cleancell.us' }],
        activity: [{ id: 'ac_task', orgId: ORG, customerId: 'company_incharge', type: 'task', subject: 'Ask InCharge for the site survey', body: 'Needed before the 20-cabinet order can be priced.', at: ago(1), followUpAt: null, contactId: 'ct_morgan', contactName: 'Morgan Lee', orderId: 'o3', orderNo: 'CC-26-4421', by: 'sam@cleancell.us', loggedAt: ago(1), done: false, doneAt: null, doneBy: null }],
        files: [] }
    },
    /* omega_audit rows the CRM timeline reads (the design tool's history) */
    audit: [{ action: 'buyer-editor-trial', orgId: ORG, customerId: 'company_riverside', by: 'sam@cleancell.us', at: ago(7), grant: { status: 'trial', source: 'owner-trial', expiresAt: ago(-7) } }],
    /* the customer's uploads today, per account (crm_upload_usage) */
    uploads: {},
    intake: [{ id: 'po_x', orderNo: 'PO-IN-X', customerId: 'company_riverside', poNumber: 'RCC-2211', status: 'po_review', source: 'customer', notes: 'see attached', createdAt: '2026-09-19T10:00:00Z', reviewNote: '', convertedAt: null, rep: null, files: [] }],
    companyOrders: [{ id: 'o1', customerId: 'company_riverside', orderNo: 'CC-26-4419', status: 'in_fulfilment', poNumber: 'RCC-2200', items: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', qty: 5 }], destinations: [{ id: 'd1', address: { name: 'Riverside yard', city: 'Bakersfield', state: 'CA' }, items: [{ sku: 'CC-C215', qty: 5 }] }], revision: 1, legs: [{ id: 'LOAD-1', status: 'in_transit', carrier: 'Estes', tracking: 'BOL-771', destinationId: 'd1', serials: ['CC418-26-44192'], lastConfirmedLocation: { label: 'Fresno, CA' } }] }],
    account: { customerId: 'company_riverside', company: 'Riverside Cold Chain', accountType: 'company', since: '2026-08-01T00:00:00Z', rep: { name: 'Sam Rep', email: 'sam@cleancell.us' }, plan: 'free', status: 'active',
      you: { email: 'ops@riverside.example', name: 'Dana Ops', phone: '', role: 'owner' }, address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, terms: { depositPct: 40, dueDays: 0, netDays: 30 }, users: null, agreements: [{ kind: 'MSA', ref: 'MSA-2026-04', signedAt: '2026-08-02' }], orders: 1 },
    projects: [{ id: 'p1', name: 'Bakersfield yard', module: 'bess', createdAt: '2026-09-15T10:00:00Z', updatedAt: '2026-09-18T10:00:00Z', revision: 3 }],
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
  function officeJson() { var orders = state.orders.map(function (o) { return Object.assign({}, o, { stage: S.stageOf(o) }); }); return { owner: false, org: ORG, name: 'Clean Cell', brand: brand, active: true, config: { terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 }, accounting: 'tenant' }, products: 8, bundle: { included: ['OEM order operations'], subscriptionDue: null },
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
    return { customerId: c.id, company: c.company, accountType: c.accountType || 'company', domain: c.domain || '', rep: null, owner: false, editorAccess: entitlement(c.editorLite),
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
        /* api/_lib/portal.js publicOrder's checkout: a tenant-billed
           invoice carries its number, date and the supplier's pay link
           (tenantPayLink, once issued); a QuickBooks one QuickBooks' link */
        checkout: c ? { currency: 'USD', base: c.baseCents / 100, total: c.totalCents / 100, processingFee: c.feeCents / 100, accounting: l.accounting === 'tenant' ? 'tenant' : 'quickbooks', depositPercent: c.terms.depositPct, invoices: Object.keys(l.invoices).map(function (k) {
          var inv = l.invoices[k], byTenant = l.accounting === 'tenant';
          return { stage: k, amount: inv.amountCents / 100, recorded: (inv.paidCents || 0) / 100, status: inv.status,
            payUrl: o.cancelRequested || l.paymentException ? null : byTenant ? (inv.id ? Portal.tenantPayLink(inv.payUrl) : null) : Policy.paymentLink(inv.payUrl), dueDays: c.terms.dueDays,
            number: byTenant && inv.id ? String(inv.id).slice(0, 80) : null, issuedAt: byTenant && inv.issuedAt ? String(inv.issuedAt).slice(0, 10) : null }; }) } : null,
        documents: [], destinations: o.id === 'o1' ? [{ id: 'd1', name: 'Riverside yard', city: 'Bakersfield', state: 'CA', items: [{ sku: 'CC-C215', qty: 5 }] }] : [],
        loads: ((state.companyOrders.filter(function (co) { return co.id === o.id; })[0] || {}).legs || []).map(function (lg) { return { id: lg.id, destinationId: lg.destinationId || null, carrier: lg.carrier || null, tracking: lg.tracking || null, status: lg.status || null, units: (lg.serials || []).length, pickedUpAt: lg.pickedUpAt || null, deliveredAt: lg.deliveredAt || null, lastConfirmed: lg.lastConfirmedLocation && lg.lastConfirmedLocation.label ? { label: lg.lastConfirmedLocation.label, at: lg.lastConfirmedLocation.at || null } : null }; }),
        shipment: o.shipment || null, cancelRequested: !!o.cancelRequested,
        requests: (o.requests || []).map(function (r) { return { id: r.id, kind: r.kind, message: r.message, by: r.by || null, status: r.status, at: r.at, address: r.address || null, answer: r.answer || null }; }) };
    }), limited: false };
  }
  function designJson() { return { org: ORG, customerId: 'company_riverside', brand: brand, access: entitlement(riverside().editorLite), designProducts: C.designs({ products: CATALOG }), products: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet' }, { sku: 'CC-C418', name: '418 kWh outdoor cabinet' }], projects: clone(state.projects), limited: false }; }
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
  /* ── the CRM (api/crm.js), the customer's documents (api/my-files.js)
     and the design tool (api/customer-subscribe.js): the records above,
     projected by api/_lib/crm.js itself, the timeline included ── */
  function param(q, k) { var m = new RegExp('(?:^|&)' + k + '=([^&]*)').exec(q || ''); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; }
  function crmOf(id) { return state.crm[id] || { contacts: [], activity: [], files: [] }; }
  function namesOf(r) { var n = {}; r.contacts.forEach(function (x) { n[x.id] = x.name || x.email || ''; }); return n; }
  /* api/_lib/buyer-accounts.js accountOrders: stamped for the account, or
     billed to one of its active people */
  function accountOrders(c) { var emails = c.users.filter(function (u) { return u.status === 'active'; }).map(function (u) { return u.email; }); return state.orders.filter(function (o) { return o.customerId === c.id || (!o.customerId && emails.indexOf(o.customer.email) >= 0); }); }
  function stored(f) { return f.uploadState === 'stored' && f.archived !== true; }
  function newest(key) { return function (a, b) { return CRM.millis(b[key]) - CRM.millis(a[key]); }; }
  function timelineOf(c, r) {
    var orders = accountOrders(c).map(function (o) { return Object.assign({}, o, { purchaseOrder: o.poNumber ? { number: o.poNumber } : o.purchaseOrder }); });
    var ids = orders.map(function (o) { return o.id; });
    state.intake.filter(function (p) { return p.customerId === c.id; }).forEach(function (p) { orders.push({ id: p.id, orderNo: p.orderNo, status: p.status, items: [], poIntake: { number: p.poNumber, createdAt: p.createdAt, source: p.source === 'customer' ? 'customer-upload' : p.source, notes: p.notes, convertedAt: p.convertedAt || null } }); });
    return CRM.timeline({ orders: orders, people: c.users, files: r.files, activity: r.activity, contactNames: namesOf(r),
      units: shipUnits().filter(function (u) { return u.custody && ids.indexOf(u.orderId) >= 0; }), sites: state.sites.filter(function (x) { return x.customerId === c.id; }),
      designs: c.id === 'company_riverside' ? state.projects : [], editorEvents: state.audit.filter(function (e) { return e.customerId === c.id; }), editorLite: c.editorLite || null });
  }
  function download(f) { return { download: { name: f.name, body: sampleBytes(f) } }; }
  function crmJson(q) {
    if (param(q, 'followUps') === '1') {
      var rows = [];
      state.customers.forEach(function (c) { var r = crmOf(c.id), names = namesOf(r); r.activity.forEach(function (a) { if (CRM.isOpen(a)) rows.push(CRM.followUpView({ activityId: a.id, customerId: c.id, company: c.company, type: a.type, subject: a.subject, followUpAt: a.followUpAt, contactId: a.contactId, contactName: a.contactName, orderId: a.orderId, by: a.by, at: a.at }, c.company, names)); }); });
      return { followUps: rows.sort(CRM.byDue), limited: false };
    }
    var c = state.customers.filter(function (x) { return x.id === param(q, 'customerId'); })[0]; if (!c) return { status: 404, error: 'Customer not found' };
    var r = crmOf(c.id), names = namesOf(r), nos = {};
    if (param(q, 'file')) { var f = r.files.filter(function (x) { return x.id === param(q, 'file'); })[0]; return f && stored(f) ? download(f) : { status: 404, error: 'Document not found' }; }
    accountOrders(c).forEach(function (o) { nos[o.id] = o.orderNo; });
    return { customerId: c.id, company: c.company, status: c.status,
      contacts: r.contacts.filter(function (x) { return x.archived !== true; }).map(function (x) { return CRM.contactView(x.id, x); }).sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); }),
      activity: r.activity.slice().sort(newest('at')).map(function (a) { return CRM.activityView(a.id, a, names, nos); }),
      followUps: r.activity.filter(CRM.isOpen).map(function (a) { return CRM.followUpView({ activityId: a.id, customerId: c.id, company: c.company, type: a.type, subject: a.subject, followUpAt: a.followUpAt, contactId: a.contactId, contactName: a.contactName, orderId: a.orderId, by: a.by, at: a.at }, c.company, names); }).sort(CRM.byDue),
      files: r.files.filter(stored).sort(newest('uploadedAt')).map(function (x) { return CRM.fileView(x.id, x, 'office'); }),
      timeline: timelineOf(c, r), canEdit: true, canArchive: true, limited: false };
  }
  function myFilesJson(q) {
    var c = riverside(), r = crmOf(c.id);
    if (param(q, 'file')) { var f = r.files.filter(function (x) { return x.id === param(q, 'file'); })[0]; return CRM.customerMaySee(f) ? download(f) : { status: 404, error: 'We could not find that document on your account.' }; }
    return { company: c.company, dailyUploads: 20, files: r.files.filter(CRM.customerMaySee).sort(newest('uploadedAt')).map(function (x) { return CRM.fileView(x.id, x, 'customer'); }), limited: false };
  }
  /* api/customer-subscribe.js view(): the offer, and the ACCOUNT's grant.
     The sample's customer is the account's owner, so may manage it. */
  function subJson(who) {
    var grant = riverside().editorLite || {}, ent = entitlement(grant), provider = grant.source === 'provider', paid = ['active', 'past_due'];
    return { available: EDITOR_LITE.enabled && !!(CUSTOMER_PRICES.monthlyPriceCents || CUSTOMER_PRICES.yearlyPriceCents), monthlyPriceCents: CUSTOMER_PRICES.monthlyPriceCents, yearlyPriceCents: CUSTOMER_PRICES.yearlyPriceCents, currency: 'USD',
      status: provider ? (paid.indexOf(grant.status) >= 0 ? grant.status : 'inactive') : ent.status, expiresAt: provider || ent.active ? grant.expiresAt || null : null,
      plan: provider && ['month', 'year'].indexOf(grant.plan) >= 0 ? grant.plan : null, entitled: ent.active, canManage: provider && !!grant.stripeCustomerId && (state.account.you.role === 'owner' || grant.subscribedBy === who) };
  }
  /* api/customer-portfolio.js: no portfolio in the sample yet */
  function portfolioJson() { return { portfolios: [], limited: false }; }
  function manifest(app, tenant) { return Manifest.manifestFor(ORG, tenant, app); }
  return { crmJson: crmJson, myFilesJson: myFilesJson, subJson: subJson, portfolioJson: portfolioJson, accountOrders: accountOrders, materialsJson: materialsJson, soloJson: soloJson, catalogJson: catalogJson, plantJson: plantJson, officeJson: officeJson, buyersJson: buyersJson, intakeJson: intakeJson, portalJson: portalJson, accountJson: accountJson, myOrdersJson: myOrdersJson, custodyJson: custodyJson, logisticsJson: logisticsJson, mySitesJson: mySitesJson, pubUnit: pubUnit, pubSite: pubSite, unitView: unitView, designJson: designJson, designPost: designPost, benchJson: benchJson, manifest: manifest, brand: brand, CATALOG: CATALOG, benchCab: benchCab };
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
    /* logic-workflow issueInvoice / recordPayment, tenant-billed: the
       number and date; a pay link added, changed (a new one) or removed
       (null), kept when not sent; a payment by its bank reference */
    if (b.action === 'invoice-issued' || b.action === 'payment-received') {
      var lg = o.logic, stage = String(b.stage || ''), inv = lg && lg.invoices ? lg.invoices[stage] : null, date = String(b.date || '').slice(0, 10);
      if (!lg || lg.accounting !== 'tenant') return err(409, 'This order is billed through QuickBooks; ' + (b.action === 'invoice-issued' ? 'invoices are issued there' : 'payments are reconciled there'));
      if (!inv || !inv.amountCents) return err(409, 'Nothing is due at this stage');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return err(400, (b.action === 'invoice-issued' ? 'Invoice' : 'Payment') + ' date must be YYYY-MM-DD');
      if (b.action === 'invoice-issued') {
        var number = String(b.number || '').trim().slice(0, 80); if (!number) return err(400, 'Invoice number required');
        if (inv.id && inv.id !== number) return err(409, 'Invoice ' + inv.id + ' is already recorded for this stage');
        var keep = !Object.prototype.hasOwnProperty.call(b, 'payUrl') || b.payUrl === undefined || b.payUrl === '', link = keep ? null : b.payUrl === null ? null : Portal.tenantPayLink(typeof b.payUrl === 'string' ? b.payUrl.trim() : b.payUrl);
        if (!keep && b.payUrl !== null && !link) return err(400, 'A pay link must be a full https:// address to a named site (no spaces, no user name or password)');
        var changed = !keep && (inv.payUrl || null) !== link, was = inv.id;
        Object.assign(inv, { id: number, issuedAt: date, issuedBy: who, status: inv.satisfied ? 'paid' : 'awaiting_payment', paidCents: inv.paidCents || 0 });
        if (changed) { inv.payUrl = link; inv.payUrlBy = who; inv.payUrlAt = now; }
        return { ok: true, duplicate: was === number && !changed, payLinkChanged: changed, invoice: clone(inv) };
      }
      var amount = Math.round(Number(b.amount) * 100), ref = String(b.bankReference || '').trim().slice(0, 120);
      if (!(amount > 0)) return err(400, 'Amount received required'); if (ref.length < 4) return err(400, 'Bank confirmation reference required');
      if (!inv.id) return err(409, 'Record the ' + stage + ' invoice number first');
      var pays = (inv.payments || []).slice(); if (pays.some(function (x) { return x.bankReference === ref; })) return { ok: true, duplicate: true, invoice: clone(inv) };
      pays.push({ amountCents: amount, date: date, bankReference: ref, by: who, at: now });
      var paidC = pays.reduce(function (n, x) { return n + x.amountCents; }, 0); if (paidC > inv.amountCents) return err(400, 'Payments would exceed the invoice: USD ' + (paidC / 100) + ' against ' + (inv.amountCents / 100));
      Object.assign(inv, { payments: pays, paidCents: paidC, satisfied: paidC >= inv.amountCents, balanceCents: inv.amountCents - paidC, status: paidC >= inv.amountCents ? 'paid' : 'part_paid', checkedAt: now });
      return { ok: true, invoice: clone(inv) };
    }
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
      if (p.status === 'pending' && next.status === 'active') { p.approvedAt = now; p.approvedBy = who; }
      p.status = next.status; p.role = next.role; return { ok: true, person: { email: p.email, status: p.status, role: p.role }, note: p.status === 'active' ? 'Access on.' : 'Access off. Their past activity stays on the account.' };
    }
    /* only the fields it is sent: the office app saves the domain alone */
    if (b.action === 'profile') {
      var ap = acctOf(); if (!ap) return err(404, 'Customer not found');
      if (b.company !== undefined) { if (!String(b.company || '').trim()) return err(400, 'Company name is required'); ap.company = String(b.company).trim().slice(0, 160); }
      if (b.status !== undefined) { if (['active', 'suspended'].indexOf(b.status) < 0) return err(400, 'Choose active or suspended access'); ap.status = b.status; }
      if (b.domain !== undefined) ap.domain = String(b.domain || '').trim().toLowerCase();
      if (b.address && state.account.customerId === ap.id) state.account.address = { line1: String(b.address.line1 || ''), city: String(b.address.city || ''), state: String(b.address.state || ''), zip: String(b.address.zip || '') };
      if (state.account.customerId === ap.id) state.account.company = ap.company;
      return { ok: true, note: 'Customer profile saved. Existing orders, invoices and subscription billing were not changed.' };
    }
    /* a trial of the design tool, from the supplier's owner: 0 revokes */
    if (b.action === 'editor-trial') {
      var at = acctOf(), days = Number(b.days); if (!at) return err(404, 'Customer not found');
      if (!(days >= 0 && days <= 14 && Math.floor(days) === days)) return err(400, 'Choose zero to revoke, or 1–14 trial days');
      var prior = at.editorLite || {}; if (prior.source === 'provider' && ['active', 'past_due'].indexOf(prior.status) >= 0) return err(409, 'Manage the existing paid subscription through its billing provider');
      at.editorLite = { status: days ? 'trial' : 'inactive', source: 'owner-trial', expiresAt: new Date(Date.now() + days * DAY_MS).toISOString(), grantedBy: who, grantedAt: now };
      state.audit.push({ action: 'buyer-editor-trial', orgId: ORG, customerId: at.id, by: who, at: now, was: prior, grant: clone(at.editorLite) });
      return { ok: true, note: days ? 'Time-limited Editor Lite trial granted. No subscription or charge was created.' : 'Trial access revoked. Saved projects were retained.' };
    }
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
      /* the load's own status is the logistics ledger's (delivered is
         recorded there, api/logic-logistics.js); a custody receipt moves
         the units, not the load — as api/logic-custody.js does */
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
      if (pu.status === 'pending' && b.status !== 'disabled') { pu.approvedAt = now; pu.approvedBy = who; }
      pu.status = b.status === 'disabled' ? 'disabled' : 'active';
      return { ok: true, person: { email: pu.email, status: pu.status, role: pu.role }, users: V.accountJson(who).users, note: pu.status === 'active' ? 'Access on.' : 'Access off. Their past activity stays on the account.' };
    }
    var a = state.account; a.you.name = String(b.name || a.you.name).slice(0, 120); a.company = String(b.company || a.company).slice(0, 160); a.you.phone = String(b.phone || '').slice(0, 40);
    if (b.address) a.address = { line1: String(b.address.line1 || ''), city: String(b.address.city || ''), state: String(b.address.state || ''), zip: String(b.address.zip || '') };
    return V.accountJson(who);
  }
  /* ── the CRM: api/crm.js, validated by api/_lib/crm.js itself ── */
  function stored(f) { return f.uploadState === 'stored' && f.archived !== true; }
  if (path === '/api/crm') {
    var cc = state.customers.filter(function (x) { return x.id === b.customerId; })[0]; if (!b.customerId) return err(400, 'Which customer?'); if (!cc) return err(404, 'Customer not found');
    var rec = state.crm[cc.id] || (state.crm[cc.id] = { contacts: [], activity: [], files: [] });
    function one(list, id, what) { var x = list.filter(function (y) { return y.id === id; })[0]; if (!x) throw CRM.fail(404, what); return x; }
    try {
      if (b.action === 'contact-save') {
        var input = CRM.contactInput(b), cid = b.id ? CRM.recordId(b.id, 'Contact') : null, cur = cid ? one(rec.contacts, cid, 'That contact is not on this account') : null;
        if (cur && cur.archived) return err(409, 'That contact is archived');
        var live = rec.contacts.filter(function (x) { return x.archived !== true; });
        if (!cur && live.length >= 200) return err(409, 'This account has 200 contacts; archive some before adding more');
        if (input.email && live.some(function (x) { return x.id !== cid && String(x.email || '').toLowerCase() === input.email; })) return err(409, input.email + ' is already a contact on this account');
        if (input.primary) live.forEach(function (x) { if (x.id !== cid) x.primary = false; });
        if (cur) Object.assign(cur, input, { updatedAt: now, updatedBy: who });
        else { cur = Object.assign({ id: 'ct_' + hex(10), orgId: ORG, customerId: cc.id }, input, { archived: false, createdAt: now, createdBy: who }); rec.contacts.push(cur); }
        return { ok: true, id: cur.id, contact: CRM.contactView(cur.id, cur), note: cid ? 'Contact saved.' : 'Contact added.' };
      }
      if (b.action === 'contact-archive') {
        var ca = one(rec.contacts, CRM.recordId(b.id, 'Contact'), 'That contact is not on this account');
        if (ca.archived) return { ok: true, duplicate: true, note: 'Already archived.' };
        ca.archived = true; ca.primary = false; ca.archivedAt = now; ca.archivedBy = who;
        return { ok: true, note: 'Contact archived. Logged activity with them keeps their name.' };
      }
      if (b.action === 'log') {
        var entry = CRM.activityInput(b, now), cn = null, ono = null;
        if (entry.contactId) { var ct = rec.contacts.filter(function (x) { return x.id === entry.contactId; })[0]; if (!ct) return err(400, 'That contact is not on this account'); if (ct.archived) return err(400, 'That contact is archived'); cn = ct.name || ct.email || null; }
        if (entry.orderId) { var ord = V.accountOrders(cc).filter(function (o) { return o.id === entry.orderId; })[0]; if (!ord) return err(400, 'That order is not on this account'); ono = ord.orderNo; }
        var act = Object.assign({ id: 'ac_' + hex(10), orgId: ORG, customerId: cc.id }, entry, { contactName: cn, orderNo: ono, by: who, loggedAt: now, done: false, doneAt: null, doneBy: null });
        rec.activity.push(act);
        var nm = {}, on = {}; if (entry.contactId) nm[entry.contactId] = cn; if (entry.orderId) on[entry.orderId] = ono;
        return { ok: true, id: act.id, activity: CRM.activityView(act.id, act, nm, on), note: CRM.TYPE_LABEL[entry.type] + ' logged' + (entry.followUpAt ? '; follow up ' + entry.followUpAt + ' is on Today.' : entry.type === 'task' ? '; it is on Today until done.' : '.') };
      }
      if (b.action === 'done') {
        var da = one(rec.activity, CRM.recordId(b.id, 'Activity'), 'That entry is not on this account');
        if (!da.followUpAt && da.type !== 'task') return err(400, 'Only a follow-up or a task can be marked done');
        if (da.done) return { ok: true, duplicate: true, note: 'Already done.' };
        da.done = true; da.doneAt = now; da.doneBy = who;
        return { ok: true, note: 'Done. It is off Today.' };
      }
      if (b.action === 'file-upload') {
        var up = fileLike(b.file), meta = { category: CRM.category(b.category), note: CRM.text(b.note, 500, 'Note', { multiline: true }), shared: CRM.bool(b.shared) };
        var dup = rec.files.filter(function (x) { return stored(x) && x.from !== 'customer' && x.name === up.name && x.size === up.size; })[0];
        if (dup) return { ok: true, duplicate: true, id: dup.id, file: CRM.fileView(dup.id, dup, 'office'), note: 'That document is already on the account.' };
        var fr = Object.assign({ id: 'f_' + hex(18), orgId: ORG, customerId: cc.id }, up, { sha256: null, category: meta.category, note: meta.note, shared: meta.shared, from: 'office', uploadedBy: who, uploadedAt: now, archived: false, uploadState: 'stored', storedAt: now });
        rec.files.push(fr);
        return { ok: true, duplicate: false, id: fr.id, file: CRM.fileView(fr.id, fr, 'office'), note: 'Uploaded. ' + (fr.shared ? 'The customer sees it in their app.' : 'Only the office sees it until you share it.') };
      }
      if (b.action === 'file-share' || b.action === 'file-archive') {
        var fx = rec.files.filter(function (x) { return x.id === CRM.recordId(b.id, 'Document'); })[0]; if (!fx || fx.uploadState !== 'stored') return err(404, 'Document not found');
        if (b.action === 'file-archive') { if (fx.archived) return { ok: true, duplicate: true, note: 'Already archived.' }; fx.archived = true; fx.archivedAt = now; fx.archivedBy = who; return { ok: true, note: 'Archived. It is kept on record and is no longer listed' + (fx.from === 'customer' || fx.shared ? ', here or in the customer\'s app.' : '.') }; }
        var share = b.shared === true || b.shared === 'true' ? true : b.shared === false || b.shared === 'false' ? false : null;
        if (share === null) return err(400, 'Say whether the customer sees it: shared true or false');
        if (fx.archived) return err(404, 'Document not found');
        if (fx.from === 'customer') return err(409, 'The customer uploaded this; it is already on their account');
        if ((fx.shared === true) === share) return { ok: true, duplicate: true, shared: share, note: share ? 'Already shared.' : 'Already office only.' };
        fx.shared = share; fx.sharedAt = now; fx.sharedBy = who;
        return { ok: true, shared: share, note: share ? 'Shared. The customer sees it in their app.' : 'No longer shared. The customer no longer sees it.' };
      }
    } catch (e) { return err(e.status || 400, e.message); }
    return err(400, 'Unknown CRM action');
  }
  /* ── the customer's documents: api/my-files.js, 20 a day per ACCOUNT ── */
  if (path === '/api/my-files') {
    if (b.action !== 'upload') return err(400, 'Unknown documents action');
    var ra = state.customers.filter(function (x) { return x.id === 'company_riverside'; })[0], rr = state.crm[ra.id] || (state.crm[ra.id] = { contacts: [], activity: [], files: [] });
    try {
      var mf = fileLike(b.file), mcat = CRM.category(b.category), mnote = CRM.text(b.note, 500, 'Note', { multiline: true });
      var mdup = rr.files.filter(function (x) { return stored(x) && x.from === 'customer' && x.name === mf.name && x.size === mf.size; })[0];
      if (mdup) return { ok: true, duplicate: true, id: mdup.id, file: CRM.fileView(mdup.id, mdup, 'customer'), note: 'That document is already on your account.' };
      var key = ra.id + '__' + now.slice(0, 10); state.uploads = state.uploads || {};
      if ((state.uploads[key] || 0) >= 20) return err(429, 'Your account has uploaded 20 documents today. Please send the rest tomorrow.');
      state.uploads[key] = (state.uploads[key] || 0) + 1;
      var mr = Object.assign({ id: 'f_' + hex(18), orgId: ORG, customerId: ra.id }, mf, { sha256: null, category: mcat, note: mnote, shared: true, from: 'customer', uploadedBy: who, uploadedAt: now, archived: false, uploadState: 'stored', storedAt: now });
      rr.files.push(mr);
      return { ok: true, duplicate: false, id: mr.id, file: CRM.fileView(mr.id, mr, 'customer'), note: 'Uploaded. Your supplier sees it on your account.' };
    } catch (e) { return err(e.status || 400, e.message); }
  }
  /* ── the design tool: api/customer-subscribe.js. The sample grants the
     subscription at once (in the product the webhook does, after Stripe's
     checkout) and answers placeholders for Stripe's two pages; the render
     check and the sandbox shim turn them into the trip back. ── */
  if (path === '/api/customer-subscribe') {
    var sa = state.customers.filter(function (x) { return x.id === 'company_riverside'; })[0], g = sa.editorLite || {}, sv = V.subJson(who);
    if (b.action === 'manage') {
      if (g.source !== 'provider' || !g.stripeCustomerId) return err(409, 'There is no Editor Lite subscription on this account yet.');
      if (!sv.canManage) return err(403, 'Only the owner of this account, or the person who subscribed, can manage the subscription.');
      return { url: '#manage' };
    }
    if (b.action !== undefined && b.action !== 'subscribe') return err(400, 'Unknown subscription action');
    if (['month', 'year'].indexOf(b.plan) < 0) return err(400, 'Choose monthly or yearly.');
    var amount2 = b.plan === 'year' ? sv.yearlyPriceCents : sv.monthlyPriceCents;
    if (!sv.available || !amount2) return err(409, 'Your supplier does not offer ' + (b.plan === 'year' ? 'a yearly' : 'a monthly') + ' Editor Lite subscription here yet. Ask your account rep for a trial.');
    if (g.source === 'provider' && ['active', 'past_due'].indexOf(g.status) >= 0) return err(409, 'This account already has an Editor Lite subscription. Use Manage subscription to change it.');
    sa.editorLite = { source: 'provider', status: 'active', plan: b.plan, expiresAt: new Date(Date.now() + (b.plan === 'year' ? 365 : 30) * DAY_MS).toISOString(), stripeCustomerId: 'cus_sandbox', stripeSubscriptionId: 'sub_sandbox', subscribedBy: who, updatedAt: now, stripeEventAt: now };
    state.audit.push({ action: 'customer-editor-lite', orgId: ORG, customerId: sa.id, by: 'stripe', at: now, was: g, grant: { status: 'active', plan: b.plan, expiresAt: sa.editorLite.expiresAt } });
    return { url: '#subscribed' };
  }
  if (path === '/api/customer-portfolio') return err(400, 'A portfolio upload is not part of this sandbox.');
  return err(404, 'Not in this sandbox: ' + path);
}

module.exports = { initialState: initialState, views: views, post: post, ORG: ORG, CATALOG: CATALOG, brand: brand };
