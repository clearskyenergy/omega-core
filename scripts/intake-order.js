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
   re-running finds it by orderNo written back into the report. */
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
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    /* the Firebase CLI's signed-in account: firebase-tools keeps a refresh
       token in its configstore; firebase-admin accepts one as a credential.
       The client id/secret are firebase-tools' own public OAuth client. */
    var store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    var tokens = store.tokens || (store.activeAccounts && store.activeAccounts[0] && store.activeAccounts[0].tokens);
    if (!tokens || !tokens.refresh_token) throw new Error('Not signed in: run `firebase login` (or set FIREBASE_SERVICE_ACCOUNT)');
    /* Firestore accepts the CLI account only as an application-default
       credential: an authorized_user file, written to the OS temp dir for
       this run and removed on exit, never into the repo. */
    var adcPath = path.join(os.tmpdir(), 'omega-intake-adc-' + process.pid + '.json');
    fs.writeFileSync(adcPath, JSON.stringify({ type: 'authorized_user', client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi', refresh_token: tokens.refresh_token }), { mode: 384 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath; process.on('exit', function () { try { fs.unlinkSync(adcPath); } catch (e) {} });
    var admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'clearsky-portal' });
    A.init = function () { return admin; }; A.db = function () { return admin.firestore(); };
  }
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
  var c = ORDER.customer, acct = await call(buyers, { action: 'create', email: c.email, company: c.company, name: c.contact, terms: c.terms }); step('customer account ' + acct.customerId + (acct.created ? ' created' : ' existed'), { note: acct.note });
  if (c.terms) { var t = await call(buyers, { action: 'terms', email: c.email, terms: c.terms }); step('terms ' + JSON.stringify(t.terms), null); }
  /* 3. the order — once per PO number */
  var listing = await call(office, null, OWNER), found = (listing.orders || []).filter(function (o) { return o.poNumber === ORDER.order.poNumber || (o.customer && o.customer.email === c.email && o.items && o.items.length && o.items[0].sku === ORDER.order.items[0].sku && o.items[0].qty === ORDER.order.items[0].qty); })[0];
  var orderId, orderNo;
  if (found) { orderId = found.id; orderNo = found.orderNo; step('order ' + orderNo + ' already exists', { id: orderId }); }
  else {
    var created = await call(orders, { action: 'create', orgId: org, customer: { name: c.contact, company: c.company, email: c.email, phone: c.phone || '', notes: c.notes || '', address: c.billingAddress || {} }, items: ORDER.order.items, note: ORDER.order.note || ('PO ' + ORDER.order.poNumber + (ORDER.order.proposal ? ' · proposal ' + ORDER.order.proposal : '')) });
    orderId = created.id || created.orderId; orderNo = created.orderNo; step('order ' + orderNo + ' created', { id: orderId, lines: ORDER.order.items });
    if (ORDER.order.poNumber) { await A.db().collection('orders').doc(orderId).update({ purchaseOrder: { number: ORDER.order.poNumber, receivedAt: ORDER.order.poDate || null, proposal: ORDER.order.proposal || null }, requestedDate: ORDER.order.requestedDate || null, destinationNote: ORDER.order.destinationNote || null }); step('PO ' + ORDER.order.poNumber + ' recorded on the order', null); }
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
