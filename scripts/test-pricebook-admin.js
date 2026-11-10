#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The staff price-book endpoint: staff only, status names what is missing,
 * bind reads the income account off an existing item, binds by name and never creates,
 * enable needs the shown hash and refuses unbound items. No network. */
'use strict';
var assert = require('assert'), F = require('./_lib/firestore-double'), B = require('../api/_lib/pricebook'), I = require('../api/_lib/qbo-items');
var db, count = 0;
function ok(c, m) { assert.ok(c, m); count++; }
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function (req) { return req.caller; }, db: function () { return db; },
  httpError: function (s, t) { var e = new Error(t); e.status = s; return e; } });
var names = {}, nextId = 25, created = 0;
var Qmock = { ENV: 'sandbox', IS_SANDBOX: true, API_BASE: 'https://sandbox-quickbooks.api.intuit.com', load: async function () { return { env: 'sandbox', realmId: '777' }; } };
F.mock('../api/_lib/qbo', Qmock);
F.mock('../api/_lib/qbo-sales', { request: async function (path, body, id, realm) {
  assert.strictEqual(realm, '777');
  if (/^account\//.test(path)) return { Account: { Id: '80', Active: true, AccountType: 'Income' } };
  if (/^query/.test(path)) { var n = /Name = '(.*)' /.exec(decodeURIComponent(path)) || /Name = '(.*)'$/.exec(decodeURIComponent(path)); var nm = n[1].replace(/\\'/g, "'"); return { QueryResponse: names[nm] ? { Item: [names[nm]] } : {} }; }
  if (path === 'item') { created++; var it = { Id: String(nextId++), Name: body.Name, Type: 'Service', Active: true, IncomeAccountRef: { value: '80' }, Taxable: false, UnitPrice: body.UnitPrice }; names[body.Name] = it; return { Item: it }; }
  throw new Error('unexpected ' + path);
} });
process.env.QBO_ENV = 'sandbox'; delete process.env.PACKAGING_LIVE;
var api = require('../api/pricebook-admin'), res = { setHeader: function () {} };
async function run() {
  db = new F.DB(); db.serial = true;
  var book = B.proposed(); db.seed('pricebook/' + book.version, book);
  I.items(book).forEach(function (i) { names[i.name] = { Id: String(nextId++), Name: i.name, Type: 'Service', Active: true, IncomeAccountRef: { value: '80' }, Taxable: false }; });
  var staff = { staff: true, email: 'ops@clearsky-usa.com' }, tenant = { staff: false, email: 'a@acme.example' };
  await assert.rejects(function () { return api({ method: 'GET', caller: tenant }, res); }, /staff only/i); count++;
  var s = await api({ method: 'GET', caller: staff }, res);
  ok(s.enabled === false && s.items.bound === 0 && s.items.missing.length === s.items.total, 'status names every missing binding');
  await assert.rejects(function () { return api({ method: 'POST', caller: staff, body: { action: 'enable', expectedHash: s.expectedHash } }, res); }, /Bind every/); count++;
  await assert.rejects(function () { return api({ method: 'POST', caller: staff, body: { action: 'bind', extra: 1 } }, res); }, /Unsupported/); count++;
  var gone = I.items(book)[1].name, keep = names[gone]; delete names[gone];
  await assert.rejects(function () { return api({ method: 'POST', caller: staff, body: { action: 'bind' } }, res); }, /No QuickBooks item named/); count++;
  ok(created === 0 && !(db.data.get('pricebook/' + book.version).qbo.items || {})[I.items(book)[1].key], 'a missing name is refused and nothing is created or bound');
  names[gone] = keep;
  var b = await api({ method: 'POST', caller: staff, body: { action: 'bind' } }, res);
  ok(b.ok && Object.keys(b.items).length === I.items(book).length && created === 0, 'bind finds every existing item by name and creates none');
  s = await api({ method: 'GET', caller: staff }, res);
  ok(s.items.bound === s.items.total && s.bookRealm === '777', 'bindings and realm recorded');
  await assert.rejects(function () { return api({ method: 'POST', caller: staff, body: { action: 'enable', expectedHash: 'x' } }, res); }, /expected-hash/); count++;
  var e = await api({ method: 'POST', caller: staff, body: { action: 'enable', expectedHash: s.expectedHash } }, res);
  ok(e.ok && db.data.get('pricebook/' + book.version).enabled === true, 'enable turns the book on');
  ok(Array.from(db.data.keys()).filter(function (k) { return /^omega_orgs\/clearsky-usa\.com\/admin_audit\//.test(k); }).length === 2, 'both actions audited');
  s = await api({ method: 'GET', caller: staff }, res); ok(s.enabled === true, 'status reads enabled');

  /* Seeding the next release from the page (2026-11 added Omega Maximus,
     2026-10-20): no admin key on a laptop. The stored release book before it
     is enabled and frozen on the production company; the new one is written
     switched off, on that company, only with the hash the dry run showed,
     and never over a stored book. */
  db = new F.DB(); db.serial = true;
  var prior = B.proposed(); prior.version = '2026-10'; delete prior.modules.maximus;
  prior.qbo.env = 'production'; prior.qbo.realmId = '9130357601798616'; prior.enabled = true; prior.frozen = true; prior.usedAt = 1;
  B.validate(prior); db.seed('pricebook/2026-10', prior);
  var newer = B.proposed(); newer.version = '2026-12-proposed'; newer.enabled = true; db.seed('pricebook/2026-12-proposed', newer);
  await assert.rejects(function () { return api({ method: 'POST', caller: tenant, body: { action: 'seed', expectedHash: 'x' } }, res); }, /staff only/i); count++;
  s = await api({ method: 'GET', caller: staff }, res);
  ok(s.seeded === false && s.version === B.VERSION && s.enabled === false, 'status says the release book is not stored yet');
  ok(s.seed.from === '2026-10' && s.seed.qboEnv === 'production' && s.seed.qboRealm === '9130357601798616', 'it follows the newest enabled release book and its company, never a -proposed one');
  ok(s.seed.added.join() === 'maximus' && s.seed.repriced.length === 0, 'and says what it adds (Omega Maximus) and that nothing is repriced');
  await assert.rejects(function () { return api({ method: 'POST', caller: staff, body: { action: 'seed', expectedHash: 'not-the-hash' } }, res); }, /dry run/); count++;
  ok(!db.data.get('pricebook/' + B.VERSION), 'a wrong hash writes nothing');
  var seeded = await api({ method: 'POST', caller: staff, body: { action: 'seed', expectedHash: s.seed.expectedHash } }, res);
  var written = db.data.get('pricebook/' + B.VERSION);
  ok(seeded.ok && seeded.seeded === true && written && written.enabled === false && written.frozen === false, 'seed writes the release book, switched off');
  ok(written.qbo.env === 'production' && written.qbo.realmId === '9130357601798616' && written.modules.maximus.priceCents === 129900, 'on the production company, with Omega Maximus at $1,299');
  ok(JSON.stringify(db.data.get('pricebook/2026-10')) === JSON.stringify(prior), 'the book before it is untouched');
  var again = await api({ method: 'POST', caller: staff, body: { action: 'seed', expectedHash: s.seed.expectedHash } }, res);
  ok(again.unchanged === true && JSON.stringify(db.data.get('pricebook/' + B.VERSION)) === JSON.stringify(written), 'seeding again changes nothing');
  s = await api({ method: 'GET', caller: staff }, res);
  ok(s.seeded === true && s.version === B.VERSION && s.enabled === false && s.bookRealm === '9130357601798616', 'then the page shows the stored book, ready to enable');
  ok(Array.from(db.data.keys()).filter(function (k) { return /^omega_orgs\/clearsky-usa\.com\/admin_audit\//.test(k); }).length === 2, 'the seed is audited');
  console.log('Price book admin: ' + count + ' passed; no network.');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; });
