/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), B = require('../api/_lib/pricebook'), I = require('../api/_lib/qbo-items');
var DB = require('./_lib/firestore-double').DB, count = 0;
function eq(a, b, m) { assert.deepStrictEqual(a, b, m); count++; }
async function refuses(fn, match) { await assert.rejects(fn, match); count++; }
async function main() {
  var db = new DB(); db.serial = true; var b = B.proposed(); await B.seed(db, b, true);
  var rows = {}, writes = 0, calls = 0, loads = 0;
  var connection = { env: 'sandbox', realmId: '123' };
  var deps = { Q: { ENV: 'sandbox', IS_SANDBOX: true, API_BASE: 'https://sandbox-quickbooks.api.intuit.com', load: async function () { loads++; return connection; } },
    request: async function (path, body, id, realm) {
      calls++; eq(realm, '123', 'all requests pinned');
      if (path.indexOf('account/') === 0) return { Account: { Id: '7', Active: true, AccountType: 'Income' } };
      if (path.indexOf('query?') === 0) {
        var sql = decodeURIComponent(path.split('query=')[1]), name = /Name = '([^']+)'/.exec(sql)[1];
        return { QueryResponse: { Item: rows[name] ? [rows[name]] : [] } };
      }
      eq(path, 'item'); eq(id, I.requestId('123', body.Name), 'stable write ID');
      writes++; var item = Object.assign({ Id: String(writes), Active: true }, body); rows[body.Name] = item;
      return { Item: item };
    } };
  var opts = { apply: true, realmId: '123', incomeAccountId: '7', taxable: false };
  var dry = await I.sync(null, b, {}, deps); eq(dry.items.length, 32); eq(calls, 0); eq(loads, 0);
  deps.Q.ENV = 'production'; await refuses(function () { return I.sync(db, b, opts, deps); }, /sandbox-only/); eq(calls, 0); eq(loads, 0); deps.Q.ENV = 'sandbox';
  connection.env = 'production'; await refuses(function () { return I.sync(db, b, opts, deps); }, /not the requested sandbox/); eq(calls, 0); connection.env = 'sandbox';
  connection.realmId = '456'; await refuses(function () { return I.sync(db, b, opts, deps); }, /not the requested sandbox/); eq(calls, 0); connection.realmId = '123';
  await refuses(function () { return I.sync(db, b, { apply: true, realmId: '123', incomeAccountId: '7' }, deps); }, /taxability/); eq(calls, 0);
  await refuses(function () { return I.sync(new DB(), b, opts, deps); }, /Seeded price book/); eq(calls, 0);
  await I.sync(db, b, opts, deps); eq(writes, 32);
  var saved = await B.load(db, b.version); eq(Object.keys(saved.qbo.items).length, 32); eq(saved.modules.lite.qboItemId, '1');
  await I.sync(db, saved, opts, deps); eq(writes, 32, 'retry creates nothing');
  rows.Lite.Active = false; await refuses(function () { return I.sync(db, saved, opts, deps); }, /accounting review/); eq(writes, 32); rows.Lite.Active = true;
  saved.frozen = true; var before = calls; await refuses(function () { return I.sync(db, saved, opts, deps); }, /immutable/); eq(calls, before);
  saved.frozen = false; saved.qbo.realmId = '999'; await refuses(function () { return I.sync(db, saved, opts, deps); }, /realm mismatch/); eq(calls, before);
  /* Simulate a price book frozen during network I/O. The final transaction
   * refuses item bindings instead of overwriting the frozen snapshot. */
  var fresh = await B.load(db, b.version), prior = deps.request;
  deps.request = async function () { var out = await prior.apply(null, arguments); db.data.get('pricebook/' + b.version).frozen = true; return out; };
  await refuses(function () { return I.sync(db, fresh, opts, deps); }, /immutable/);
  eq((await B.load(db, b.version)).frozen, true);
  console.log('QuickBooks sandbox item sync: ' + count + ' passed; no network calls.');
}
main().catch(function (e) { console.error(e); process.exitCode = 1; });
