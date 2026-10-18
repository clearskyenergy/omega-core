/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   api/orders.js action:'create' — the tenant-placed order's document shape.

   One thing above all: customer.notes is the CUSTOMER'S words. The rep's own
   `note` used to be aliased into it when the customer left theirs blank, so
   "shopping us against Tesla, do not go below 240k" read as what the
   customer said — on orders.html, and on anything downstream that trusted
   the field. It now goes on the history thread, where action:'note' already
   puts one. Offline: no credentials, no network. */
'use strict';
var assert = require('node:assert/strict');
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
class DB {
  constructor() { this.rows = new Map(); this.seq = 0; }
  seed(path, d) { this.rows.set(path, clone(d)); }
  collection(path) { return new Query(this, path); }
  runTransaction(fn) { var db = this, w = []; var tx = { get: function (r) { return r.get(); }, set: function (r, d) { w.push(function () { db.seed(r.path, d); }); }, update: function (r, d) { w.push(function () { if (!db.rows.has(r.path)) throw new Error('no doc ' + r.path); db.seed(r.path, Object.assign(clone(db.rows.get(r.path)), d)); }); } };
    return Promise.resolve(fn(tx)).then(function (out) { w.forEach(function (f) { f(); }); return out; }); }
}
class Ref {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new Query(this.db, this.path + '/' + name); }
  async get() { var d = this.db.rows.get(this.path); return { exists: d !== undefined, id: this.id, data: function () { return clone(d); } }; }
  async set(d) { this.db.seed(this.path, d); }
}
class Query {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new Ref(this.db, this.path + '/' + (id || 'auto' + (++this.db.seq) + 'abcde')); }
}
var db = new DB();
var A = {
  db: function () { return db; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (req) { return req.caller; },
  handler: function (fn) { return fn; },
  canActInOrg: async function (c, org) { return c.orgId === org; },
  /* the same shape api/_lib/admin.js safeOrg enforces */
  safeOrg: function (v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s || s.length > 253) return '';
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return '';
    if (s === 'fenecon.de' || s === 'fenecon.us') return 'fenecon.com';
    return s;
  },
  FieldValue: function () { return { serverTimestamp: function () { return 123; }, arrayUnion: function () { return { union: Array.from(arguments) }; } }; }
};
var mailed = [];
var M = { send: function (to, subject) { mailed.push(subject); }, layout: function () { return ''; }, row: function () { return ''; }, button: function () { return ''; } };
function mock(path, exports) { require.cache[require.resolve(path)] = { id: require.resolve(path), filename: require.resolve(path), loaded: true, exports: exports }; }
mock('../api/_lib/admin', A); mock('../api/_lib/mail', M);
var orders = require('../api/orders');
var rep = { email: 'rep@cleancell.us', uid: 'rep', orgId: 'cleancell.us', staff: false, claims: { email_verified: true } };
function created() { for (var e of db.rows) if (e[0].startsWith('orders/')) return e[1]; return null; }
function reset() { db = new DB(); mailed = [];
  db.seed('omega_orgs/cleancell.us', { name: 'Clean Cell', status: 'active' });
  db.seed('omega_orgs/cleancell.us/storefront/config', { fulfilledBy: 'clearsky', products: [{ sku: 'CC-C418', name: '418 kWh cabinet', kw: 200, kwh: 418, priceMode: 'quote' }] }); }
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ' + detail : '')); if (yes) pass++; else fail++; }
async function post(b) { return orders({ method: 'POST', body: b, caller: rep }, { setHeader: function () {} }); }
(async function () {
  console.log('\norders create');
  reset();
  var r = await post({ action: 'create', customer: { name: 'Dana Ruiz', email: 'dana@riverside.example', notes: '' },
    items: [{ sku: 'CC-C418', qty: 2 }], system: { kw: 400, kwh: 836 }, note: 'shopping us against Tesla, do not go below 240k' });
  var o = created();
  ok('an order is created with status pinned to new', r.ok && o && o.status === 'new' && r.orderNo === o.orderNo);
  ok('customer.notes stays EMPTY when the customer said nothing', o.customer.notes === '', JSON.stringify(o.customer.notes));
  ok('  the rep note is on the history thread instead', o.history.length === 2 && o.history[1].what === 'note: shopping us against Tesla, do not go below 240k', JSON.stringify(o.history));
  ok('  attributed to the rep, as action:note would be', o.history[1].by === 'rep@cleancell.us');
  ok('  and appears NOWHERE under customer', JSON.stringify(o.customer).indexOf('Tesla') < 0);
  ok('the first history entry is still the creation', o.history[0].what === 'created' && o.history[0].by === 'rep@cleancell.us');
  ok('the item price comes from the catalogue, not the request', o.items[0].published === true && o.items[0].listPrice === null && o.items[0].kwh === 418);
  ok('the tenant notification went out', mailed.length === 1 && /New order/.test(mailed[0]));

  reset();
  await post({ action: 'create', customer: { name: 'Dana Ruiz', email: 'dana@riverside.example', notes: 'Loading dock is on the north side.' },
    items: [], note: 'internal: expedite' });
  o = created();
  ok('when the customer DID say something it is kept, verbatim', o.customer.notes === 'Loading dock is on the north side.');
  ok('  and the rep note still goes to history, not appended to it', o.history[1].what === 'note: internal: expedite' && o.customer.notes.indexOf('expedite') < 0);

  reset();
  await post({ action: 'create', customer: { name: 'Dana Ruiz', email: 'dana@riverside.example' }, items: [] });
  o = created();
  ok('no rep note means no second history entry', o.history.length === 1);
  ok('  and customer.notes is an empty string, not undefined', o.customer.notes === '');

  /* The ACCOUNT stamp: only an account that ADMITTED the person it is
     billed to, and a '/' in an address is 'no account', never a 500. */
  function account(email, user) {
    db.seed('omega_orgs/cleancell.us/customer_index/' + email, { customerId: 'amp1' });
    db.seed('omega_orgs/cleancell.us/customers/amp1', { name: 'Acme Fleet', status: 'active' });
    db.seed('omega_orgs/cleancell.us/customers/amp1/users/' + email, user);
  }
  reset(); account('jordan@acmefleet.com', { status: 'active', role: 'owner' });
  await post({ action: 'create', customer: { name: 'Jordan Blake', email: 'jordan@acmefleet.com' }, items: [] });
  o = created();
  ok('an order for an active person on an account carries its customerId', o.customerId === 'amp1');
  ok('  and the account is marked hasOrders in the same write', db.rows.get('omega_orgs/cleancell.us/customers/amp1').hasOrders === true);
  reset(); account('ops@acmefleet.com', { status: 'pending', source: 'domain-request' });
  await post({ action: 'create', customer: { name: 'Ops', email: 'ops@acmefleet.com' }, items: [] });
  ok('a join request still waiting does NOT put the order on the company', created() && !created().customerId);
  reset(); account('gone@acmefleet.com', { status: 'disabled', declined: true });
  await post({ action: 'create', customer: { name: 'Gone', email: 'gone@acmefleet.com' }, items: [] });
  ok('nor does a request that was turned down', created() && !created().customerId);
  reset(); account('left@acmefleet.com', { status: 'disabled', source: 'office', approvedAt: '2026-01-01' });
  await post({ action: 'create', customer: { name: 'Left', email: 'left@acmefleet.com' }, items: [] });
  ok('a colleague once admitted and since turned off still stamps (the company\'s order)', created().customerId === 'amp1');
  reset(); account('retry@acmefleet.com', { status: 'active' });
  var realRun = db.runTransaction.bind(db), tries = 0;
  db.runTransaction = function (fn) { tries++; var dry = { get: function (r) { return r.get(); }, set: function () {}, update: function () {} };
    return Promise.resolve(fn(dry)).then(function () { db.seed('omega_orgs/cleancell.us/customers/amp1', { name: 'Acme Fleet', status: 'suspended' }); return realRun(fn); }); };
  await post({ action: 'create', customer: { name: 'Retry', email: 'retry@acmefleet.com' }, items: [] });
  db.runTransaction = realRun;
  ok('a retried create does not keep a stamp from the attempt that was thrown away', tries === 1 && created() && !created().customerId);
  reset();
  var slash = await post({ action: 'create', customer: { name: 'West', email: 'ops/west@acme.com' }, items: [] });
  ok("an address with '/' is written without an account, not a 500", slash.ok && created() && !created().customerId);

  console.log('\norders design — the drawing becomes one Logic order');
  function orderDocs() { var n = []; for (var e of db.rows) if (e[0].indexOf('orders/') === 0) n.push([e[0], e[1]]); return n; }
  function seedProject(extra) {
    db.seed('projects/proj-1', Object.assign({
      orgId: 'cleancell.us', address: '3400 S Federal St, Chicago, IL 60616',
      mapState: { lat: 41.83, lng: -87.62, address: '3400 S Federal St, Chicago, IL 60616' }
    }, extra || {}));
  }
  async function rejected(b) {
    try { await post(b); return null; } catch (e) { return e; }
  }
  reset();
  db.seed('omega_orgs/cleancell.us/storefront/config', { fulfilledBy: 'clearsky', products: [
    { sku: 'CC-C418', name: '418 kWh cabinet', kw: 200, kwh: 418, priceMode: 'list', listPrice: 240000 },
    { sku: 'CELL-1', name: 'A cell', kind: 'component' }
  ] });
  seedProject();
  var d1 = await post({ action: 'design', projectId: 'proj-1', orgId: 'evil.com',
    address: '3400 s federal st chicago il 60616',
    pricing: { total: 999999 }, approvedQuote: { totalCents: 999999 },
    items: [
      { name: 'Cabinet as drawn', sku: 'CC-C418', qty: 2, unit: 'ea', category: 'Equipment', listPrice: 999999, unitCost: 999999, base: 900000 },
      { description: 'Trench', qty: 40, unit: 'LF', category: 'Civil', note: 'equip $12,400 + install $800' }
    ] });
  var od = created();
  ok('a design files one new order and returns the Logic address', d1.ok && d1.status === 'new' && d1.logic === '/omega-logic?org=cleancell.us&order=' + d1.orderId && !d1.duplicate, JSON.stringify(d1));
  ok('the org is the project\'s, not the body', od.orgId === 'cleancell.us' && od.source === 'design' && od.sourceProjectId === 'proj-1');
  ok('the address and the point come off the project', od.site && od.site.address === '3400 S Federal St, Chicago, IL 60616' && od.site.projectId === 'proj-1' && od.site.lat === 41.83 && od.customer.address.line1 === od.site.address);
  ok('no customer is invented', od.customer.email === '' && od.customer.name === '' && !od.customerId);
  ok('lines keep the names and quantities, and a catalog sku is recognized', od.items.length === 2 && od.items[0].name === 'Cabinet as drawn' && od.items[0].qty === 2 && od.items[0].published === true && od.items[0].kw === 200 && od.items[1].name === 'Trench' && od.items[1].qty === 40 && od.items[1].unit === 'LF');
  ok('no price, list price, or approved quote is stored', od.pricing === null && od.approvedQuote == null && od.items[0].listPrice === null && JSON.stringify(od).indexOf('999999') < 0 && JSON.stringify(od).indexOf('240000') < 0 && JSON.stringify(od).indexOf('900000') < 0 && JSON.stringify(od).indexOf('$') < 0, JSON.stringify(od.items));
  ok('a dollar in the note is not copied', od.items[1].note.indexOf('12,400') < 0 && /equip/.test(od.items[1].note) && /install/.test(od.items[1].note));
  ok('the project points at that one order', db.rows.get('projects/proj-1').designOrderId === d1.orderId);
  ok('ClearSky is told once', mailed.length === 1 && /Design order/.test(mailed[0]));

  var d2 = await post({ action: 'design', projectId: 'proj-1', items: [{ name: 'Cabinet as drawn', sku: 'CC-C418', qty: 3, unit: 'ea' }] });
  ok('a second send updates the same open order', d2.duplicate === true && d2.locked === false && d2.orderId === d1.orderId && orderDocs().length === 1 && created().items[0].qty === 3 && created().history.length === 3);
  ok('the update does not mail again', mailed.length === 1);

  created().status = 'quoted'; created().logic = { pricedAt: '2026-10-18' }; created().pricing = { total: 1 };
  var kept = created().items[0].qty;
  var d3 = await post({ action: 'design', projectId: 'proj-1', items: [{ name: 'Should not replace', qty: 9 }] });
  ok('a priced order is returned and not overwritten', d3.locked === true && d3.orderId === d1.orderId && created().items[0].qty === kept && created().items[0].name === 'Cabinet as drawn');

  var clash = await rejected({ action: 'design', projectId: 'proj-1', address: '1 Other Street', items: [{ name: 'X', qty: 1 }] });
  ok('an address that disagrees with the project is refused', clash && clash.status === 409 && /address/.test(clash.message));

  reset();
  db.seed('omega_orgs/cleancell.us/storefront/config', { fulfilledBy: 'clearsky', products: [] });
  seedProject({ address: '', mapState: { address: '' } });
  var bare = await rejected({ action: 'design', projectId: 'proj-1', items: [{ name: 'X', qty: 1 }] });
  ok('a project with no site address is refused', bare && bare.status === 409 && orderDocs().length === 0);

  reset();
  db.seed('omega_orgs/cleancell.us/storefront/config', { fulfilledBy: 'clearsky', products: [{ sku: 'CELL-1', name: 'A cell', kind: 'component' }] });
  seedProject();
  var comp = await rejected({ action: 'design', projectId: 'proj-1', items: [{ name: 'Cell', sku: 'CELL-1', qty: 1 }] });
  ok('a component sku is refused', comp && comp.status === 400 && orderDocs().length === 0);

  reset(); seedProject({ orgId: 'other.example' });
  var foreign = await rejected({ action: 'design', projectId: 'proj-1', items: [{ name: 'X', qty: 1 }] });
  ok('another workspace\'s project is refused', foreign && foreign.status === 403);

  reset();
  db.seed('omega_orgs/cleancell.us/storefront/config', { fulfilledBy: 'clearsky', products: [] });
  seedProject();
  account('jordan@acmefleet.com', { status: 'active', role: 'owner' });
  var named = await post({ action: 'design', projectId: 'proj-1', customer: { name: 'Jordan Blake', email: 'jordan@acmefleet.com' }, items: [{ name: 'Cabinet', qty: 1 }] });
  ok('a named customer is stamped only when that account admitted them', named.ok && created().customer.email === 'jordan@acmefleet.com' && created().customerId === 'amp1' && created().pricing === null);

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
