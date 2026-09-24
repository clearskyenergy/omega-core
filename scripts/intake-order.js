/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/intake-order.js — one customer order, from the paperwork into
   Omega Logic, through the SAME endpoint code the office uses, step by step:

     1. the product on the catalog (api/logic-catalog.js 'save')
     2. the customer's company account and its terms (api/buyers.js)
     3. the order with its lines, PO and destination (api/orders.js 'create')
     4. the approved price, accepted (api/logic-office.js 'price')
     5. the invoice the OEM issued, and the payments that landed
        (tenant-billed: 'invoice-issued', 'payment-received' → release)
     6. the serials registered on the works order (api/logic-plant.js)

   DRY RUN BY DEFAULT against the in-memory Firestore double: prints what
   every step would write and stops at the first refusal, so the paperwork
   is checked before anything real is touched. --apply runs the same steps
   on the live project.

     node scripts/intake-order.js --file order.json
     node scripts/intake-order.js --file order.json --apply

   Credentials for --apply, in order: FIREBASE_SERVICE_ACCOUNT (a service
   account key, as the API uses), else the Firebase CLI's signed-in account
   (firebase login) — its refresh token is read from the CLI's own store and
   never written anywhere. The caller recorded on every write is the
   ClearSky owner; the order JSON is the record of who asked.

   The order file is NOT in the repo: it carries a customer's commercial
   terms. docs/order-intake-template.json is the shape. Every step is
   idempotent where the endpoint is (a serial or a company that exists is
   reported, not duplicated); an order is created once per PO number —
   re-running finds it by that PO number and ties it to the customer ACCOUNT
   (customerId), so every person on the account sees it. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var ROOT = path.join(__dirname, '..');
var args = process.argv.slice(2), APPLY = args.indexOf('--apply') >= 0, fileArg = args[args.indexOf('--file') + 1];
if (args.indexOf('--file') < 0 || !fileArg) { console.error('usage: node scripts/intake-order.js --file order.json [--apply]'); process.exit(2); }
var ORDER = JSON.parse(fs.readFileSync(fileArg, 'utf8')), REPORT = fileArg.replace(/\.json$/, '') + (APPLY ? '.applied' : '.dryrun') + '.json';
var OWNER = { email: 'tom@clearsky-usa.com', uid: 'tom', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var org = String(ORDER.org || '').toLowerCase(); if (!org) throw new Error('order.org required');

/* ── the admin module, real or doubled ─────────────────────────────────── */
var adminPath = require.resolve(path.join(ROOT, 'api/_lib/admin')), A;
function mock(p, exports) { require.cache[require.resolve(p)] = { id: require.resolve(p), filename: require.resolve(p), loaded: true, exports: exports }; }
if (!APPLY) {
  var DB = require('./_lib/firestore-double').DB, db = new DB();
  A = { httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; }, db: function () { return db; }, safeOrg: function (x) { return String(x || '').toLowerCase(); },
    authenticate: async function (req) { return req.caller || OWNER; }, canActInOrg: async function (c, o) { return c.staff || c.orgId === o; }, isTenantAdmin: async function (c) { return !!c.staff; },
    orgOf: function (e) { return String(e).split('@')[1] || ''; }, isStaffEmail: function (e) { return /@clearsky-usa\.com$/.test(String(e)); },
    FieldValue: function () { return { serverTimestamp: function () { return new Date().toISOString(); }, arrayUnion: function () { return { union: Array.from(arguments) }; } }; } };
  mock(adminPath, A);
  /* the double starts from the tenant as it is seeded in the repo */
  var seed = require(path.join(ROOT, 'tenants', ORDER.tenantSlug || org.split('.')[0], 'tenant.json'));
  db.seed('omega_orgs/' + org, { name: seed.name, status: 'active', vertical: seed.vertical, domains: seed.domains, whiteLabel: seed.whiteLabel });
  db.seed('omega_orgs/' + org + '/billing/current', { addons: seed.addons || [], status: 'active' });
  db.seed('omega_orgs/' + org + '/fulfillment/config', Object.assign({ enabled: true, terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } }, ORDER.fulfillmentConfig || {}));
  db.seed('omega_orgs/' + org + '/storefront/config', { products: require(path.join(ROOT, 'tenants', ORDER.tenantSlug || org.split('.')[0], 'products.json')), catalogRevision: 1 });
  db.seed('omega_orgs/' + org + '/members/tom', { role: 'owner', status: 'active' });
} else {
  A = require(adminPath);
  require('./_lib/live-admin')(A);
  A.authenticate = async function (req) { return req.caller || OWNER; };
}
mock(path.join(ROOT, 'api/_lib/mail'), { send: function () { return Promise.resolve(); }, layout: function () { return ''; } });
var Q = require(path.join(ROOT, 'api/_lib/qbo')); Q.load = async function () { return null; }; /* tenant-billed: no QuickBooks */

var catalog = require(path.join(ROOT, 'api/logic-catalog')), buyers = require(path.join(ROOT, 'api/buyers')), orders = require(path.join(ROOT, 'api/orders')), office = require(path.join(ROOT, 'api/logic-office')), plant = require(path.join(ROOT, 'api/logic-plant')), custody = require(path.join(ROOT, 'api/logic-custody'));
function call(api, body, caller, query) {
  return new Promise(function (resolve, reject) {
    var res = { setHeader: function () {}, headersSent: false, status: function (c) { this.code = c; return this; }, json: function (o) { this.headersSent = true; (this.code >= 400 ? reject : resolve)(this.code >= 400 ? Object.assign(new Error(o.error), { status: this.code }) : o); }, end: function () { resolve(null); } };
    Promise.resolve().then(function () { return api({ method: body ? 'POST' : 'GET', body: body ? Object.assign({ org: org, orgId: org }, body) : undefined, query: query || { org: org }, headers: {}, caller: caller || OWNER }, res); })
      .then(function (out) { if (out !== undefined) resolve(out); }).catch(reject);
  });
}
var report = { org: org, mode: APPLY ? 'applied' : 'dry-run', at: new Date().toISOString(), steps: [] };
function step(name, out) { report.steps.push({ step: name, result: out }); console.log('  ✓ ' + name + (out && out.note ? ' — ' + out.note : '')); }
function money(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

(async function () {
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' · ' + org + ' · ' + ORDER.order.poNumber);
  /* 0. the tenant's billing mode and terms, so the price step can run */
  if (APPLY && ORDER.fulfillmentConfig) { var fc = ORDER.fulfillmentConfig; var cfg = await call(office, { action: 'configure', enabled: fc.enabled !== false, accounting: fc.accounting || 'quickbooks', terms: fc.terms, fee: fc.fee || { percent: 0.25, fixed: 0 }, itemRef: '', accountingApproved: false }); step('fulfillment configured: ' + (fc.accounting || 'quickbooks') + ' billing, deposit ' + (fc.terms || {}).depositPct + '%', cfg); }
  /* 1. product */
  var cat = await call(catalog, null, OWNER), existing = (cat.products || []).filter(function (p) { return p.sku === ORDER.product.sku; })[0];
  var product = Object.assign({}, existing || {}, ORDER.product);
  var saved = await call(catalog, { action: 'save', revision: cat.revision, product: product }); step('catalog product ' + product.sku + (existing ? ' updated' : ' added'), { revision: saved.revision, coverage: (product.coverage || []).length });
  /* 2. the company account and its terms */
  /* The customer is a company ACCOUNT with people on it: a new contact at a
     company that already has an account joins it rather than splitting it. */
  var c = ORDER.customer, acct;
  try { acct = await call(buyers, { action: 'create', email: c.email, company: c.company, name: c.contact, terms: c.terms }); }
  catch (e) {
    if (e.status !== 409 || !/already has an account/.test(e.message)) throw e;
    var same = await require(path.join(ROOT, 'api/_lib/buyer-accounts')).findByName(A.db(), org, c.company);
    await call(buyers, { action: 'user-add', customerId: same.id, email: c.email, name: c.contact, role: 'user' });
    acct = { customerId: same.id, created: false, note: c.email + ' added to the existing ' + c.company + ' account' };
  }
  step('customer account ' + acct.customerId + (acct.created ? ' created' : ' existed'), { note: acct.note });
  if (c.terms) { var t = await call(buyers, { action: 'terms', customerId: acct.customerId, terms: c.terms }); step('terms ' + JSON.stringify(t.terms), null); }
  /* 3. the order — once per PO number, found by the PO number itself (not by
     who it is billed to or what is on it: a second PO for the same SKU and
     quantity is a second order) */
  var orderId, orderNo, found = null;
  if (ORDER.order.poNumber) {
    var byPo = await A.db().collection('orders').where('orgId', '==', org).where('purchaseOrder.number', '==', ORDER.order.poNumber).limit(5).get();
    found = byPo.docs.filter(function (d) { var v = d.data() || {}; return v.customerId === acct.customerId || ((v.customer || {}).email || '').toLowerCase() === String(c.email).toLowerCase(); })[0] || null;
  }
  if (found) { orderId = found.id; orderNo = found.data().orderNo; step('order ' + orderNo + ' already exists', { id: orderId }); }
  else {
    var created = await call(orders, { action: 'create', orgId: org, customer: { name: c.contact, company: c.company, email: c.email, phone: c.phone || '', notes: c.notes || '', address: c.billingAddress || {} }, items: ORDER.order.items, note: ORDER.order.note || ('PO ' + ORDER.order.poNumber + (ORDER.order.proposal ? ' · proposal ' + ORDER.order.proposal : '')) });
    orderId = created.id || created.orderId; orderNo = created.orderNo; step('order ' + orderNo + ' created', { id: orderId, lines: ORDER.order.items });
    if (ORDER.order.poNumber) { await A.db().collection('orders').doc(orderId).update({ purchaseOrder: { number: ORDER.order.poNumber, receivedAt: ORDER.order.poDate || null, proposal: ORDER.order.proposal || null }, requestedDate: ORDER.order.requestedDate || null, destinationNote: ORDER.order.destinationNote || null }); step('PO ' + ORDER.order.poNumber + ' recorded on the order', null); }
  }
  /* The order belongs to the ACCOUNT, so everyone on it sees it — stamped on
     both branches, so re-running repairs an order made before this rule. */
  var current = (await A.db().collection('orders').doc(orderId).get()).data() || {};
  if (current.customerId !== acct.customerId) {
    if (current.customerId) throw new Error('Order ' + orderNo + ' belongs to another customer account (' + current.customerId + '); not changing it');
    await A.db().collection('orders').doc(orderId).update({ customerId: acct.customerId }); step('order ' + orderNo + ' tied to customer account ' + acct.customerId, null);
  }
  /* 4. the approved price, accepted */
  var priced = await call(office, { action: 'price', orderId: orderId, total: ORDER.order.total, accept: true }).catch(function (e) { if (/locked|already/.test(e.message)) return { duplicate: true }; throw e; });
  var o = (await A.db().collection('orders').doc(orderId).get()).data();
  step('priced ' + money(ORDER.order.total) + (priced.duplicate ? ' (already)' : '') + ' · deposit ' + money(o.logic.commercial.depositCents / 100) + ' · balance ' + money(o.logic.commercial.balanceCents / 100) + ' · billed by ' + (o.logic.accounting || 'quickbooks'), { commercial: o.logic.commercial });
  /* 5. invoices issued and payments received */
  for (var i = 0; i < (ORDER.invoices || []).length; i++) {
    var inv = ORDER.invoices[i]; var r = await call(office, { action: 'invoice-issued', orderId: orderId, stage: inv.stage, number: inv.number, date: inv.date }); step(inv.stage + ' invoice ' + inv.number + ' issued ' + inv.date + (r.duplicate ? ' (already)' : ''), null);
    for (var j = 0; j < (inv.payments || []).length; j++) { var pay = inv.payments[j]; var pr = await call(office, { action: 'payment-received', orderId: orderId, stage: inv.stage, amount: pay.amount, date: pay.date, bankReference: pay.bankReference }); step('payment ' + money(pay.amount) + ' on ' + pay.date + ' (' + pay.bankReference + ')' + (pr.duplicate ? ' (already)' : '') + ' → ' + pr.invoice.status, { workflow: pr.workflow || null }); }
  }
  o = (await A.db().collection('orders').doc(orderId).get()).data();
  step('order status ' + o.status + (o.worksOrderId ? ' · works order ' + o.worksOrderId : ' · not released (deposit not satisfied)'), { status: o.status, worksOrderId: o.worksOrderId || null });
  /* 6. serials on the works order */
  if (o.worksOrderId && ORDER.serials) {
    var list = Array.isArray(ORDER.serials) ? ORDER.serials : (function () { var out = [], s = ORDER.serials; for (var n = s.start; n < s.start + s.count; n++) out.push(s.prefix + String(n).padStart(s.pad || 3, '0')); return out; })();
    var units = list.map(function (sn) { return { serial: sn, sku: ORDER.product.sku, unitType: ORDER.unitType || 'cabinet', shipUnit: true }; });
    var reg = await call(plant, { action: 'register', workOrderId: o.worksOrderId, requestId: 'intake_' + ORDER.order.poNumber.replace(/[^A-Za-z0-9_-]/g, '_'), units: units }, ORDER.plantCaller ? Object.assign({}, OWNER, ORDER.plantCaller) : OWNER).catch(function (e) { if (/already registered/.test(e.message)) return { duplicate: true }; throw e; });
    step(units.length + ' serials ' + (reg.duplicate ? 'already registered' : 'registered') + ' (' + list[0] + ' … ' + list[list.length - 1] + ')', { first: list[0], last: list[list.length - 1] });
  } else if (ORDER.serials) step('serials NOT registered: the order is not released', null);
  /* 7. sites, when the customer has given addresses */
  for (var k = 0; k < (ORDER.sites || []).length; k++) { var site = ORDER.sites[k]; var sr = await call(custody, Object.assign({ action: 'site', customerId: acct.customerId }, site)).catch(function (e) { if (/already exists/.test(e.message)) return { siteId: e.message.split(': ').pop(), duplicate: true }; throw e; }); step('site ' + site.name + (sr.duplicate ? ' existed' : ' created') + ' → ' + sr.siteId, null); }
  report.orderId = orderId; report.orderNo = orderNo; report.customerId = acct.customerId;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n' + (APPLY ? 'Applied.' : 'Dry run complete; nothing written.') + ' Report: ' + REPORT);
})().catch(function (e) { console.error('\n✗ ' + e.message); report.error = e.message; fs.writeFileSync(REPORT, JSON.stringify(report, null, 2)); process.exit(1); });
