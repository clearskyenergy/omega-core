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
    db.seed('omega_orgs/cleancell.us/customers/amp1', { name: 'Amperage Capital', status: 'active' });
    db.seed('omega_orgs/cleancell.us/customers/amp1/users/' + email, user);
  }
  reset(); account('shannon@amperagecapital.com', { status: 'active', role: 'owner' });
  await post({ action: 'create', customer: { name: 'Shannon Johnson', email: 'shannon@amperagecapital.com' }, items: [] });
  o = created();
  ok('an order for an active person on an account carries its customerId', o.customerId === 'amp1');
  ok('  and the account is marked hasOrders in the same write', db.rows.get('omega_orgs/cleancell.us/customers/amp1').hasOrders === true);
  reset(); account('ops@amperagecapital.com', { status: 'pending', source: 'domain-request' });
  await post({ action: 'create', customer: { name: 'Ops', email: 'ops@amperagecapital.com' }, items: [] });
  ok('a join request still waiting does NOT put the order on the company', created() && !created().customerId);
  reset(); account('gone@amperagecapital.com', { status: 'disabled', declined: true });
  await post({ action: 'create', customer: { name: 'Gone', email: 'gone@amperagecapital.com' }, items: [] });
  ok('nor does a request that was turned down', created() && !created().customerId);
  reset(); account('left@amperagecapital.com', { status: 'disabled', source: 'office', approvedAt: '2026-01-01' });
  await post({ action: 'create', customer: { name: 'Left', email: 'left@amperagecapital.com' }, items: [] });
  ok('a colleague once admitted and since turned off still stamps (the company\'s order)', created().customerId === 'amp1');
  reset();
  var slash = await post({ action: 'create', customer: { name: 'West', email: 'ops/west@acme.com' }, items: [] });
  ok("an address with '/' is written without an account, not a 500", slash.ok && created() && !created().customerId);

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
