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
  console.log('Price book admin: ' + count + ' passed; no network.');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; });
