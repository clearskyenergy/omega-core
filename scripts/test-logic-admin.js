#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-logic-admin.js — ClearSky's control over Logic subscribers
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/logic-admin.js against the in-memory Firestore double and a stub of
   Firebase Auth. No network. Also covers the two endpoints the admin page
   posts to that changed with it: tenant-billing (toolAccess, status) and
   tenant-branding (the shared tenant_public builder).

     NODE_PATH=node_modules node scripts/test-logic-admin.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;

var db, users = {}, claims = {}, links = [], mails = [];
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, orgOf: function (e) { return String(e).toLowerCase().split('@')[1] || ''; },
  canActInOrg: async function (c, o) { return c.staff || c.orgId === o; }, isTenantAdmin: async function (c, o) { return c.staff || (c.orgId === o && c.tenantAdmin === true); },
  FieldValue: function () { return { serverTimestamp: function () { return 'TS'; }, arrayUnion: function () { return Array.prototype.slice.call(arguments); } }; },
  init: function () { return { auth: function () { return {
    getUserByEmail: async function (e) { if (!users[e]) { var err = new Error('no user'); err.code = 'auth/user-not-found'; throw err; } return users[e]; },
    createUser: async function (o) { users[o.email] = { uid: 'u_' + o.email, email: o.email, customClaims: {} }; return users[o.email]; },
    setCustomUserClaims: async function (uid, c) { claims[uid] = c; },
    generatePasswordResetLink: async function (e) { var l = 'https://reset.test/' + e; links.push(l); return l; } }; } }; } };
mock('../api/_lib/admin', A);
mock('../api/_lib/mail', { configured: function () { return true; }, send: async function (to) { mails.push(to); return { ok: true }; }, layout: function (t, b) { return b; }, button: function (h) { return h; }, esc: function (s) { return s; }, templates: {} });
var api = require('../api/logic-admin'), billingApi = require('../api/tenant-billing'), brandingApi = require('../api/tenant-branding');
var zip = require('../api/_lib/portfolio/zip'), csv = require('../api/_lib/portfolio/csv'), L = require('../api/_lib/logic-admin'), WL = require('../api/_lib/whitelabel');

var OWNER = { uid: 'tom', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var STAFF = { uid: 'rep', email: 'rep@csebuilders.com', orgId: 'csebuilders.com', staff: true, claims: { email_verified: true } };
var TENANT = { uid: 'own', email: 'owner@cleancell.us', orgId: 'cleancell.us', staff: false, tenantAdmin: true, claims: { email_verified: true } };
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } };
function call(body, caller) { return api({ method: 'POST', body: body, caller: caller || OWNER }, res); }
function getq(query, caller) { res.body = null; return api({ method: 'GET', query: query || {}, caller: caller || OWNER }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

function seed() {
  db = new DB(); users = { 'owner@cleancell.us': { uid: 'own', email: 'owner@cleancell.us', customClaims: { orgId: 'cleancell.us', role: 'owner' } }, 'rep@partner.com': { uid: 'u_rep', email: 'rep@partner.com', customClaims: {} } }; claims = {}; links = []; mails = [];
  var O = 'omega_orgs/cleancell.us';
  db.seed(O, { name: 'Clean Cell', slug: 'cleancell', domains: ['cleancell.clearskyomega.com', 'old.cleancell.us'], status: 'active', omegaLogic: true, vertical: 'oem', whiteLabel: { enabled: true, platformName: 'Clean Cell Power Platform', attribution: 'none', notes: 'contract 17' }, colors: { primary: '#3fafc6' }, createdAt: '2026-08-01T00:00:00Z' });
  db.seed(O + '/billing/current', { tier: 'standard', addons: ['omega-logic', 'whitelabel'], toolAccess: ['editor', 'gridatlas'], status: 'active' });
  db.seed(O + '/fulfillment/config', { enabled: true, terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 }, realmId: '9130', itemRef: '12', accountingApproved: true });
  db.seed(O + '/fulfillment/materials', { stock: [{ sku: 'CELL-1', onHand: 40 }] });
  db.seed(O + '/fulfillment/suppliers', { suppliers: [{ id: 'sup1', name: 'Cells Inc', prices: { 'CELL-1': 12.5 } }] });
  db.seed(O + '/storefront/config', { headline: 'Store the sun', capexPerKwh: 400, products: [{ sku: 'CC-100', name: 'CC 100', kw: 100, kwh: 200, priceMode: 'list', listPrice: 90000, bom: [{ sku: 'CELL-1', qty: 4 }], integrates: { pcs: true } }] });
  db.seed(O + '/members/own', { email: 'owner@cleancell.us', role: 'owner', status: 'active', name: 'Owner' });
  db.seed(O + '/members/adm', { email: 'ops@cleancell.us', role: 'admin', status: 'active' });
  db.seed(O + '/customers/c1', { orgId: 'cleancell.us', name: 'Buyer Co', status: 'active', terms: { depositPct: 30 } });
  db.seed(O + '/customers/c1/users/buyer@example.com', { email: 'buyer@example.com', role: 'owner' });
  db.seed(O + '/reps/r1', { name: 'Rep One', agreement: { resale: true } });
  db.seed('orders/o1', { orgId: 'cleancell.us', orderNo: 'CC-1', status: 'shipped', logic: { commercial: { totalCents: 100 }, payout: { sentCents: 5 } }, purchaseOrder: { number: 'PO-1', document: { path: 'logic-po/x', sha256: 'abc' } } });
  db.seed('orders/o1/events/e1', { at: '2026-09-01T00:00:00Z', what: 'Accepted' });
  db.seed('orders/o2', { orgId: 'cleancell.us', orderNo: 'CC-2', status: 'new' });
  db.seed('orders/x1', { orgId: 'other.com', orderNo: 'X-1', status: 'new', logic: { payout: { sentCents: 999 } } });
  db.seed('plant_works_orders/w1', { orgId: 'cleancell.us', orderNo: 'CC-1', status: 'released' });
  db.seed('plant_units/s1', { orgId: 'cleancell.us', serial: 'S-1', at: 'ready' });
  db.seed('plant_stations/st1', { orgId: 'cleancell.us', label: 'EOL', tokenHash: 'h' });
  db.seed('embed_keys/omega_pk_1', { orgId: 'cleancell.us', label: 'site', active: true, origins: ['https://cleancell.us'] });
  db.seed('tenant_public/cleancell.clearskyomega.com', { orgId: 'cleancell.us', name: 'Clean Cell' });
  db.seed('tenant_public/old.cleancell.us', { orgId: 'cleancell.us', name: 'Clean Cell' });
  db.seed('tenant_public/taken.example.com', { orgId: 'somebody.com' });
  db.seed('omega_orgs/other.com', { name: 'Other Developer', status: 'active', vertical: 'developer' });
}

(async function () {
  seed();
  await test('1 · only the verified ClearSky owner account may use the admin', async function () {
    await rejects(getq({}, STAFF), 403, /owner/);
    await rejects(getq({}, TENANT), 403);
    await rejects(call({ action: 'commission', orgId: 'x.com' }, TENANT), 403);
    await rejects(getq({}, Object.assign({}, OWNER, { claims: { email_verified: false } })), 403);
  });

  await test('2 · commissioning stands up the tenant, its subscription, office terms, sign-in mirrors, owner and audit', async function () {
    var r = await call({ action: 'commission', orgId: 'NewOEM.com', name: 'New OEM', ownerEmail: 'ceo@newoem.com', ownerName: 'The CEO', tier: 'trial', domains: ['app.newoem.com'], platformName: 'New Power', attribution: 'none', terms: { depositPct: 40, dueDays: 15 }, fee: { percent: 0.5 } });
    assert.equal(r.ok, true); assert.equal(r.orgId, 'newoem.com'); assert.deepEqual(r.hosts, ['newoem.clearskyomega.com', 'app.newoem.com']);
    var org = db.data.get('omega_orgs/newoem.com');
    assert.equal(org.status, 'active'); assert.equal(org.omegaLogic, true); assert.equal(org.vertical, 'oem'); assert.equal(org.slug, 'newoem'); assert.equal(org.whiteLabel.platformName, 'New Power'); assert.equal(org.whiteLabel.attribution, 'none'); assert.equal(org.commissionedBy, OWNER.email);
    var bill = db.data.get('omega_orgs/newoem.com/billing/current');
    assert.equal(bill.tier, 'trial'); assert.ok(bill.addons.indexOf('omega-logic') >= 0 && bill.addons.indexOf('whitelabel') >= 0); assert.ok(bill.trialEndsAt > org.createdAt);
    assert.equal((await db.collection('omega_orgs/newoem.com/billing/current/history').get()).size, 1);
    var cfg = db.data.get('omega_orgs/newoem.com/fulfillment/config');
    assert.equal(cfg.enabled, false, 'the office is never activated by commissioning — QuickBooks gates that'); assert.deepEqual(cfg.terms, { depositPct: 40, dueDays: 15 }); assert.equal(cfg.fee.percent, 0.5);
    var pub = db.data.get('tenant_public/newoem.clearskyomega.com');
    assert.equal(pub.orgId, 'newoem.com'); assert.equal(pub.whiteLabel.platformName, 'New Power'); assert.equal(pub.whiteLabel.attribution, 'none'); assert.equal(pub.status, 'active'); assert.equal(pub.tier, 'standard');
    assert.ok(db.data.get('tenant_public/app.newoem.com'));
    var mem = db.data.get('omega_orgs/newoem.com/members/u_ceo@newoem.com');
    assert.equal(mem.role, 'owner'); assert.equal(mem.status, 'active'); assert.equal(mem.name, 'The CEO');
    assert.deepEqual(claims['u_ceo@newoem.com'], { orgId: 'newoem.com', role: 'owner' });
    assert.equal(r.owner.account, 'created'); assert.match(r.owner.resetLink, /^https:\/\/reset\.test\//); assert.equal(r.owner.mail, null, 'not emailed unless asked'); assert.equal(mails.length, 0);
    var audit = await db.collection('omega_orgs/newoem.com/admin_audit').get();
    assert.equal(audit.size, 1); assert.equal(audit.docs[0].data().action, 'commission');
    assert.ok(r.next.some(function (n) { return /import-products/.test(n); }));
    var list = await getq({});
    var row = list.subscribers.filter(function (s) { return s.orgId === 'newoem.com'; })[0];
    assert.ok(row); assert.equal(row.subscribed, true); assert.equal(row.tier, 'trial'); assert.equal(row.platformName, 'New Power');
  });

  await test('3 · commissioning refuses a public email domain, a bad key, a second record and a taken hostname', async function () {
    await rejects(call({ action: 'commission', orgId: 'gmail.com', name: 'X', ownerEmail: 'a@gmail.com' }), 400, /public email provider/);
    await rejects(call({ action: 'commission', orgId: 'not a domain', name: 'X', ownerEmail: 'a@b.com' }), 400, /email domain/);
    await rejects(call({ action: 'commission', orgId: 'cleancell.us', name: 'X', ownerEmail: 'a@cleancell.us' }), 409, /already/);
    await rejects(call({ action: 'commission', orgId: 'fresh.com', name: 'X', ownerEmail: 'a@fresh.com', domains: ['taken.example.com'] }), 409, /belongs to somebody.com/);
    await rejects(call({ action: 'commission', orgId: 'fresh.com', name: 'X' }), 400, /owner email/);
    await rejects(call({ action: 'commission', orgId: 'fresh.com', name: '', ownerEmail: 'a@fresh.com' }), 400, /name/);
    await rejects(call({ action: 'commission', orgId: 'fresh.com', name: 'X', ownerEmail: 'a@fresh.com', tier: 'gold' }), 400, /tier/);
    assert.equal(db.data.get('omega_orgs/fresh.com'), undefined, 'a refused request writes nothing');
    var sent = await call({ action: 'commission', orgId: 'mailed.com', name: 'Mailed', ownerEmail: 'a@mailed.com', sendMail: true });
    assert.equal(sent.owner.mail, 'sent'); assert.deepEqual(mails, ['a@mailed.com']);
  });

  await test('4 · the list shows Logic subscribers by default and every tenant on request', async function () {
    var d = await getq({});
    assert.ok(d.subscribers.some(function (s) { return s.orgId === 'cleancell.us'; }));
    assert.ok(!d.subscribers.some(function (s) { return s.orgId === 'other.com'; }), 'a developer tenant is not a Logic subscriber');
    var cc = d.subscribers.filter(function (s) { return s.orgId === 'cleancell.us'; })[0];
    assert.equal(cc.subscribed, true); assert.deepEqual(cc.toolAccess, ['editor', 'gridatlas']); assert.equal(cc.whiteLabel, true);
    var all = await getq({ all: '1' });
    assert.ok(all.subscribers.some(function (s) { return s.orgId === 'other.com'; }));
  });

  await test('5 · the record is the whole picture: billing, terms, storefront, people, keys, hosts, counts, audit', async function () {
    var d = await getq({ org: 'cleancell.us' });
    assert.equal(d.org.name, 'Clean Cell'); assert.equal(d.billing.tier, 'standard'); assert.equal(d.config.realmId, '9130', 'the owner sees the QuickBooks binding');
    assert.equal(d.storefront.headline, 'Store the sun'); assert.equal(d.storefront.capexPerKwh, 400); assert.equal(d.storefront.products.length, 1); assert.equal(d.storefront.products[0].bom, undefined, 'the summary is not the catalog');
    assert.equal(d.members.length, 2); assert.equal(d.embedKeys.length, 1); assert.equal(d.embedKeys[0].active, true);
    assert.deepEqual(d.hosts.map(function (h) { return h.mirrored; }), [true, true]);
    assert.deepEqual(d.counts, { orders: 2, customers: 1, reps: 1, workOrders: 1, units: 1, stations: 1 });
    assert.ok(Array.isArray(d.audit)); assert.ok(d.links.settings.indexOf('cleancell.us') > 0);
    await rejects(getq({ org: 'nobody.com' }), 404);
    await rejects(getq({ org: 'bad org' }), 400);
  });

  await test('6 · a tenant patch is allow-listed, mirrored to every host, releases a dropped host and is audited', async function () {
    var r = await call({ action: 'org', org: 'cleancell.us', patch: { name: 'Clean Cell USA', domains: ['cleancell.clearskyomega.com', 'portal.cleancell.us'], colors: { primary: '#112233', accent: '' }, receivesFullBom: true, notes: 'renewed' } });
    assert.deepEqual(r.hostsReleased, ['old.cleancell.us']);
    assert.equal(db.data.get('tenant_public/old.cleancell.us'), undefined, 'the dropped host no longer paints a sign-in page');
    var pub = db.data.get('tenant_public/portal.cleancell.us');
    assert.equal(pub.name, 'Clean Cell USA'); assert.deepEqual(pub.colors, { primary: '#112233' }); assert.equal(pub.whiteLabel.notes, undefined, 'only allowlisted white-label keys cross'); assert.equal(pub.whiteLabel.attribution, 'none');
    assert.equal(db.data.get('omega_orgs/cleancell.us').receivesFullBom, true);
    assert.equal(db.data.get('omega_orgs/cleancell.us').whiteLabel.notes, 'contract 17', 'a tenant patch never touches the white label');
    var audit = (await db.collection('omega_orgs/cleancell.us/admin_audit').get()).docs.map(function (d) { return d.data(); }).filter(function (a) { return a.action === 'org'; })[0];
    assert.equal(audit.was.name, 'Clean Cell'); assert.equal(audit.changed.name, 'Clean Cell USA'); assert.equal(audit.by, OWNER.email);
    await rejects(call({ action: 'org', org: 'cleancell.us', patch: { colors: { primary: 'blue' } } }), 400, /rrggbb/);
    await rejects(call({ action: 'org', org: 'cleancell.us', patch: { status: 'suspended' } }), 400, /Unknown tenant field/);
    await rejects(call({ action: 'org', org: 'cleancell.us', patch: { domains: ['not a host'] } }), 400, /hostname/);
    await rejects(call({ action: 'org', org: 'cleancell.us', patch: {} }), 400, /Nothing/);
  });

  await test('7 · the storefront patch edits copy, flags and the cost basis, never the products', async function () {
    var r = await call({ action: 'storefront', org: 'cleancell.us', patch: { headline: 'Own your peak', siteStudy: true, dailyOrderCap: 25, capexPerKwh: 380, capexPerKw: null } });
    assert.deepEqual(r.changed.sort(), ['capexPerKw', 'capexPerKwh', 'dailyOrderCap', 'headline', 'siteStudy']);
    var sf = db.data.get('omega_orgs/cleancell.us/storefront/config');
    assert.equal(sf.headline, 'Own your peak'); assert.equal(sf.capexPerKwh, 380); assert.equal(sf.capexPerKw, null); assert.equal(sf.products.length, 1); assert.equal(sf.products[0].bom.length, 1);
    await rejects(call({ action: 'storefront', org: 'cleancell.us', patch: { products: [] } }), 400, /import-products/);
    await rejects(call({ action: 'storefront', org: 'cleancell.us', patch: { margin: 0.3 } }), 400, /Unknown storefront field/);
    await rejects(call({ action: 'storefront', org: 'cleancell.us', patch: { dailyOrderCap: -1 } }), 400, /≥ 0/);
  });

  await test('8 · people: invite, existing account, cross-org claims untouched, role change, disable — never the last owner', async function () {
    var r = await call({ action: 'member', org: 'cleancell.us', email: 'New.Admin@cleancell.us', name: 'New Admin', role: 'admin' });
    assert.equal(r.account, 'created'); assert.equal(r.claims, true); assert.deepEqual(claims['u_new.admin@cleancell.us'], { orgId: 'cleancell.us', role: 'admin' }); assert.ok(r.resetLink);
    var again = await call({ action: 'member', org: 'cleancell.us', email: 'rep@partner.com', role: 'viewer' });
    assert.equal(again.account, 'existing'); assert.equal(again.claims, false, 'an outside person keeps their own home workspace'); assert.equal(again.resetLink, null);
    assert.equal(db.data.get('omega_orgs/cleancell.us/members/u_rep').role, 'viewer');
    var dis = await call({ action: 'member', org: 'cleancell.us', email: 'ops@cleancell.us', status: 'disabled' });
    assert.equal(dis.status, 'disabled'); assert.equal(db.data.get('omega_orgs/cleancell.us/members/adm').status, 'disabled'); assert.equal(db.data.get('omega_orgs/cleancell.us/members/adm').role, 'admin', 'a status change keeps the role');
    await rejects(call({ action: 'member', org: 'cleancell.us', email: 'owner@cleancell.us', status: 'disabled' }), 409, /last active owner/);
    await rejects(call({ action: 'member', org: 'cleancell.us', email: 'stranger@cleancell.us', status: 'disabled' }), 404, /not a member/);
    var link = await call({ action: 'member', org: 'cleancell.us', email: 'ops@cleancell.us', resetLink: true });
    assert.match(link.resetLink, /reset\.test\/ops@cleancell\.us/); assert.equal(link.account, 'unchanged'); assert.equal(users['ops@cleancell.us'], undefined, 'a link request creates no account');
    await rejects(call({ action: 'member', org: 'cleancell.us', email: 'nobody', role: 'admin' }), 400, /email/);
    await rejects(call({ action: 'member', org: 'cleancell.us', email: 'a@cleancell.us', role: 'god' }), 400, /role/);
  });

  await test('9 · the hand-over export is complete, redacted and confined to the one tenant', async function () {
    await getq({ org: 'cleancell.us', export: 'zip' });
    assert.equal(res.headers['Content-Type'], 'application/zip'); assert.match(res.headers['Content-Disposition'], /omega-logic-cleancell-\d{4}-\d{2}-\d{2}\.zip/);
    var entries = zip.extract(res.body), names = entries.map(function (e) { return e.name; }), byName = {};
    entries.forEach(function (e) { byName[e.name] = e.bytes.toString('utf8'); });
    ['README.txt', 'manifest.json', 'orders.csv', 'orders.json', 'order_events.csv', 'customers.csv', 'customer_users.csv', 'reps.csv', 'work_orders.csv', 'units.csv', 'stations.csv', 'members.csv', 'products.csv', 'materials.csv', 'suppliers.json'].forEach(function (n) { assert.ok(names.indexOf(n) >= 0, 'missing ' + n); });
    var orders = JSON.parse(byName['orders.json']);
    assert.deepEqual(orders.map(function (o) { return o.id; }).sort(), ['o1', 'o2'], 'the other tenant\'s order is not in this export');
    var whole = byName['orders.json'] + byName['orders.csv'];
    assert.ok(whole.indexOf('payout') < 0, 'ClearSky settlement is not handed over'); assert.ok(whole.indexOf('logic-po/x') < 0, 'private storage paths are not handed over'); assert.ok(whole.indexOf('"sha256"') >= 0, 'the document fingerprint is');
    assert.ok(byName['orders.csv'].indexOf('﻿id,') === 0, 'CSV opens in Excel with an id column first');
    var events = JSON.parse(byName['order_events.json']); assert.equal(events.length, 1); assert.equal(events[0].orderId, 'o1');
    var cu = JSON.parse(byName['customer_users.json']); assert.equal(cu[0].customerId, 'c1'); assert.equal(cu[0].email, 'buyer@example.com');
    var products = JSON.parse(byName['products.json']); assert.equal(products[0].id, 'CC-100'); assert.equal(products[0].bom.length, 1, 'the tenant gets their own bills of materials back');
    var sup = JSON.parse(byName['suppliers.json']); assert.equal(sup[0].group, 'suppliers'); assert.equal(sup[0].prices['CELL-1'], 12.5);
    var manifest = JSON.parse(byName['manifest.json']);
    assert.equal(manifest.exportedBy, OWNER.email); assert.equal(manifest.collections.filter(function (c) { return c.name === 'orders'; })[0].count, 2); assert.ok(manifest.collections.every(function (c) { return c.truncated === false; }));
    assert.match(byName['README.txt'], /Not included: uploaded documents/);
    var audit = (await db.collection('omega_orgs/cleancell.us/admin_audit').get()).docs.map(function (d) { return d.data(); }).filter(function (a) { return a.action === 'export'; });
    assert.equal(audit.length, 1);
    await getq({ org: 'cleancell.us', export: 'csv', collection: 'orders' });
    assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8'); assert.equal(csv.parse(res.body.toString('utf8').replace(/^﻿/, '')).length, 3);
    await rejects(getq({ org: 'cleancell.us', export: 'csv', collection: 'billing' }), 400, /collection must be one of/);
    await rejects(getq({ org: 'cleancell.us', export: 'zip' }, STAFF), 403);
  });

  await test('10 · tenant-billing takes the org-level tool allowlist and a billing status, and validates both', async function () {
    var r = await billingApi({ method: 'POST', body: { orgId: 'cleancell.us', toolAccess: ['editor'], status: 'past_due', addons: ['omega-logic'] }, caller: OWNER });
    assert.deepEqual(r.changed.filter(function (k) { return k !== 'updatedAt' && k !== 'updatedBy'; }).sort(), ['addons', 'status', 'toolAccess']);
    var bill = db.data.get('omega_orgs/cleancell.us/billing/current');
    assert.deepEqual(bill.toolAccess, ['editor']); assert.equal(bill.status, 'past_due'); assert.equal(bill.updatedBy, OWNER.email);
    var hist = await db.collection('omega_orgs/cleancell.us/billing/current/history').get();
    assert.equal(hist.size, 1); assert.deepEqual(hist.docs[0].data().was.toolAccess, ['editor', 'gridatlas']);
    await billingApi({ method: 'POST', body: { orgId: 'cleancell.us', toolAccess: null }, caller: OWNER });
    assert.equal(db.data.get('omega_orgs/cleancell.us/billing/current').toolAccess, null, 'null means whatever the plan includes');
    await rejects(billingApi({ method: 'POST', body: { orgId: 'cleancell.us', toolAccess: 'editor' }, caller: OWNER }), 400, /toolAccess/);
    await rejects(billingApi({ method: 'POST', body: { orgId: 'cleancell.us', toolAccess: ['Bad Tool!'] }, caller: OWNER }), 400, /toolAccess/);
    await rejects(billingApi({ method: 'POST', body: { orgId: 'cleancell.us', status: 'paused' }, caller: OWNER }), 400, /status/);
    await rejects(billingApi({ method: 'POST', body: { orgId: 'cleancell.us', addons: 'omega-logic' }, caller: OWNER }), 400, /addons/);
    await rejects(billingApi({ method: 'POST', body: { orgId: 'cleancell.us', tier: 'trial' }, caller: TENANT }), 403);
  });

  await test('11 · tenant-branding mirrors through the one public-record builder: allowlisted keys, no status', async function () {
    var r = await brandingApi({ method: 'POST', body: { orgId: 'cleancell.us', whiteLabel: { enabled: true, platformName: 'CC Platform', attribution: 'powered-by', notes: 'private' } }, caller: OWNER });
    assert.deepEqual(r.mirrored.sort(), ['cleancell.clearskyomega.com', 'portal.cleancell.us']);
    var pub = db.data.get('tenant_public/portal.cleancell.us');
    assert.equal(pub.whiteLabel.platformName, 'CC Platform'); assert.equal(pub.whiteLabel.notes, undefined); assert.equal(pub.updatedAt, 'TS');
    assert.equal(db.data.get('omega_orgs/cleancell.us').whiteLabel.notes, 'private', 'the org record keeps the whole block');
    await rejects(brandingApi({ method: 'POST', body: { orgId: 'cleancell.us', whiteLabel: { attribution: 'none' } }, caller: TENANT }), 403, /set by ClearSky/);
    var rec = WL.publicRecord('x.com', { name: 'X', status: 'active', publicTier: 'deluxe', whiteLabel: { platformName: 'P', notes: 'n' } }, 'T');
    assert.deepEqual(rec, { orgId: 'x.com', name: 'X', logoUrl: '', colors: null, exportBrand: null, tier: 'deluxe', vertical: null, shell: 'default', domains: [], whiteLabel: { platformName: 'P' }, status: 'active', updatedAt: 'T' });
  });

  await test('12 · the pure pieces: redaction is recursive, the table is a union with nested JSON, the readme names the limits', async function () {
    var red = L.redact({ a: 1, payout: { x: 1 }, nested: [{ path: 'p', keep: true }] });
    assert.deepEqual(red, { a: 1, nested: [{ keep: true }] });
    var t = L.table([{ id: 'a', n: 1, o: { k: 1 } }, { id: 'b', z: null, list: [1, 2] }]);
    assert.deepEqual(t[0], ['id', 'n', 'o', 'z', 'list']); assert.deepEqual(t[1], ['a', '1', '{"k":1}', '', '']); assert.deepEqual(t[2], ['b', '', '', '', '[1,2]']);
    assert.match(L.readme({ orgId: 'x', name: 'X', at: 'now', by: 'me', collections: [{ name: 'orders', count: 5000, truncated: true, label: 'Orders' }] }), /first 5000 only/);
    assert.equal(L.summary('a.com', { status: 'active', omegaLogic: true }, { addons: ['omega-logic'], status: 'suspended' }).subscribed, false, 'a suspended billing status ends the subscription');
    assert.equal(L.isLogic({ vertical: 'oem' }), true); assert.equal(L.isLogic({ vertical: 'developer' }), false);
  });

  console.log(count + ' logic-admin checks passed');
})().catch(function (e) { console.error('FAIL', e && e.stack || e); process.exit(1); });
