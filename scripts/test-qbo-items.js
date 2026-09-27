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
  rows['Omega Design'].Active = false; await refuses(function () { return I.sync(db, saved, opts, deps); }, /accounting review/); eq(writes, 32); rows['Omega Design'].Active = true;
  /* The refusal names what to fix: the account an item made by hand carries, or its tax treatment. */
  rows['Omega Design'].IncomeAccountRef = { value: '9', name: 'Sales' }; await refuses(function () { return I.sync(db, saved, opts, deps); }, /review: Omega Design \(income account is 9 Sales, not 7\)/); eq(writes, 32); rows['Omega Design'].IncomeAccountRef = { value: '7' };
  rows['Omega Design'].Taxable = true; await refuses(function () { return I.sync(db, saved, opts, deps); }, /review: Omega Design \(taxable\)/); eq(writes, 32); rows['Omega Design'].Taxable = false;
  saved.frozen = true; var before = calls; await refuses(function () { return I.sync(db, saved, opts, deps); }, /immutable/); eq(calls, before);
  saved.frozen = false; saved.qbo.realmId = '999'; await refuses(function () { return I.sync(db, saved, opts, deps); }, /realm mismatch/); eq(calls, before);
  /* Simulate a price book frozen during network I/O. The final transaction
   * refuses item bindings instead of overwriting the frozen snapshot. */
  var fresh = await B.load(db, b.version), prior = deps.request;
  deps.request = async function () { var out = await prior.apply(null, arguments); db.data.get('pricebook/' + b.version).frozen = true; return out; };
  await refuses(function () { return I.sync(db, fresh, opts, deps); }, /immutable/);
  eq((await B.load(db, b.version)).frozen, true);
  /* ── A company whose module items were made BEFORE the Omega-branded names
     (the production company, items 25-43): every item is bound by its former
     name and nothing is created; two items for one module, or a former-name
     item at another price, is refused, never guessed. ── */
  async function company(extra) {
    var db2 = new DB(); db2.serial = true; var b2 = B.proposed(); await B.seed(db2, b2, true);
    var shelf = {}, made = 0, id = 100;
    I.items(b2).forEach(function (p) { var name = p.formerNames && p.formerNames.length ? p.formerNames[0] : p.name; shelf[name] = { Id: String(++id), Name: name, Type: 'Service', Active: true, UnitPrice: p.priceCents / 100, IncomeAccountRef: { value: '7' }, Taxable: false }; });
    if (extra) extra(shelf);
    var deps2 = { Q: deps.Q, request: async function (path, body) {
      if (path.indexOf('account/') === 0) return { Account: { Id: '7', Active: true, AccountType: 'Income' } };
      if (path.indexOf('query?') === 0) { var nm = /Name = '((?:[^'\\]|\\.)+)'/.exec(decodeURIComponent(path.split('query=')[1]))[1].replace(/\\(.)/g, '$1'); return { QueryResponse: { Item: shelf[nm] ? [shelf[nm]] : [] } }; }
      made++; var item = Object.assign({ Id: String(++id), Active: true }, body); shelf[body.Name] = item; return { Item: item };
    } };
    return { db: db2, book: b2, deps: deps2, shelf: shelf, made: function () { return made; } };
  }
  var co = await company(), bound = await I.sync(co.db, co.book, opts, co.deps);
  eq(co.made(), 0, 'items made under the old names are bound, never made again');
  eq(bound.items['module:lite'], co.shelf.Lite.Id, 'Omega Design binds the item still called Lite');
  eq(bound.items['module:logic-materials'], co.shelf['Materials & Purchasing'].Id, 'Logic Purchasing binds Materials & Purchasing');
  eq(bound.items['plan:field'], co.shelf.Field.Id, 'plans keep their names');
  eq(Object.keys(bound.items).length, 32); eq((await B.load(co.db, co.book.version)).modules.lite.qboItemId, co.shelf.Lite.Id);
  var both = await company(function (sh) { sh['Omega Design'] = Object.assign({}, sh.Lite, { Id: '999', Name: 'Omega Design' }); });
  await refuses(function () { return I.sync(both.db, both.book, opts, both.deps); }, /Two QuickBooks items for Omega Design/); eq(both.made(), 0);
  var other = await company(function (sh) { sh.Operations.UnitPrice = 42; });
  await refuses(function () { return I.sync(other.db, other.book, opts, other.deps); }, /Operations is not the price book.s Omega Operate/); eq(other.made(), 0);
  console.log('QuickBooks sandbox item sync: ' + count + ' passed; no network calls.');
}
main().catch(function (e) { console.error(e); process.exitCode = 1; });
