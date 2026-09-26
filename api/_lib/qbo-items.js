/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * ClearSky subscription item synchronization. Sandbox only. No OAuth changes.
 * Names are stable; invoice lines supply the versioned price explicitly so a
 * later book never reprices an earlier agreement through an Item.UnitPrice.
 */
'use strict';
var B = require('./pricebook'), M = require('./modules'), crypto = require('crypto');
var Mode = require('./packaging-mode');
function fail(message) { var e = new Error(message); e.status = 409; throw e; }
function items(book) {
  B.validate(book);
  var out = M.catalog().map(function (m) { return { key: 'module:' + m.key, name: m.name, priceCents: book.modules[m.key].priceCents }; });
  Object.keys(book.plans).forEach(function (k) { out.push({ key: 'plan:' + k, name: book.plans[k].name, priceCents: book.plans[k].priceCents }); });
  out.push({ key: 'logic-bundle', name: book.logicBundle.name, priceCents: book.logicBundle.priceCents });
  ['builder', 'viewer'].forEach(function (k) { out.push({ key: 'login:' + k, name: 'Additional ' + k + ' logins', priceCents: book.logins[k + 'Cents'] }); });
  Object.keys(book.usage).forEach(function (k) {
    var u = book.usage[k];
    out.push({ key: 'overage:' + k, name: u.name + ' overage', priceCents: u.overageCents });
    out.push({ key: 'pack:' + k, name: 'OMEGA · ' + u.name + ' ×' + u.packUnits, priceCents: u.packCents });
  });
  out.push({ key: 'credit', name: 'Transformation credit', priceCents: 0 });
  out.push({ key: 'service-fee', name: 'Annual service fee', priceCents: 0 });
  return out;
}
function requestId(realm, name) { return crypto.createHash('sha256').update('omega-package-item:' + realm + ':' + name).digest('hex').slice(0, 48); }
function dependencies() { return { Q: require('./qbo'), request: require('./qbo-sales').request }; }
/* The one guard every QuickBooks write in packaging passes (the item sync
   and the billing driver's calls). The company is the mode's
   (packaging-mode): the sandbox unless PACKAGING_LIVE=true with
   QBO_ENV=production, and then the production company, with the current
   book, the process's QuickBooks host and the stored connection all agreeing. */
async function guard(book, realm, deps) {
  var want = Mode.env(), base = want === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
  if (book.version !== B.VERSION || book.qbo.env !== want || deps.Q.ENV !== want || deps.Q.IS_SANDBOX !== (want === 'sandbox') || deps.Q.API_BASE !== base) {
    fail(want === 'sandbox' ? 'Packaging item sync is sandbox-only until PACKAGING_LIVE=true with QBO_ENV=production' : 'Live packaging needs the current book synced to the production company and the process on the production host');
  }
  if (typeof realm !== 'string' || !/^[0-9]+$/.test(realm)) fail('Explicit ' + want + ' realm required');
  if (book.qbo.realmId && String(book.qbo.realmId) !== realm) fail('Price book ' + want + ' realm mismatch');
  var connection = await deps.Q.load();
  if (!connection || connection.env !== want || String(connection.realmId) !== realm) fail('Stored ClearSky connection is not the requested ' + want);
}
async function sync(db, book, options, deps) {
  options = options || {}; B.writable(book);
  var plan = items(book);
  if (!options.apply) return { version: book.version, dryRun: true, items: plan };
  deps = deps || dependencies();
  await guard(book, options.realmId, deps);
  var seeded = await db.doc('pricebook/' + book.version).get();
  if (!seeded.exists || B.stable(seeded.data()) !== B.stable(book)) fail('Seeded price book must match before item sync');
  B.writable(seeded.data());
  if (typeof options.taxable !== 'boolean' || !/^[0-9]+$/.test(options.incomeAccountId || '')) fail('Explicit income account and taxability required');
  async function call(path, body, id) {
    await guard(book, options.realmId, deps);
    return deps.request(path, body, id, options.realmId);
  }
  var account = (await call('account/' + options.incomeAccountId)).Account;
  if (!account || String(account.Id) !== options.incomeAccountId || account.Active === false || account.AccountType !== 'Income') fail('Selected sandbox income account is not active Income');
  var bindings = {};
  for (var i = 0; i < plan.length; i++) {
    var p = plan[i], sql = "select * from Item where Name = '" + p.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' and Active IN (true, false)";
    var found = ((await call('query?query=' + encodeURIComponent(sql))).QueryResponse || {}).Item || [];
    if (found.length > 1) fail('Ambiguous QuickBooks item name: ' + p.name);
    var item = found[0];
    if (!item) {
      item = (await call('item', { Name: p.name, Type: 'Service', IncomeAccountRef: { value: options.incomeAccountId },
        UnitPrice: p.priceCents / 100, Taxable: options.taxable }, requestId(options.realmId, p.name))).Item;
    }
    if (!item || !item.Id || item.Name !== p.name || item.Type !== 'Service' || item.Active === false || !item.IncomeAccountRef || String(item.IncomeAccountRef.value) !== options.incomeAccountId || item.Taxable !== options.taxable) fail('Existing item needs accounting review: ' + p.name);
    if (book.qbo.items[p.key] && book.qbo.items[p.key] !== String(item.Id)) fail('Existing item binding changed');
    bindings[p.key] = String(item.Id);
  }
  var ref = db.doc('pricebook/' + book.version);
  await db.runTransaction(async function (tx) {
    var s = await tx.get(ref); if (!s.exists) fail('Seed the price book before applying item sync');
    var current = s.data(); B.writable(current);
    if (B.stable(current) !== B.stable(book)) fail('Price book changed during sync; retry from its current version');
    var modulePrices = JSON.parse(JSON.stringify(book.modules));
    Object.keys(modulePrices).forEach(function (k) { modulePrices[k].qboItemId = bindings['module:' + k]; });
    var plans = JSON.parse(JSON.stringify(book.plans));
    Object.keys(plans).forEach(function (k) { plans[k].qboItemId = bindings['plan:' + k]; });
    tx.update(ref, { modules: modulePrices, plans: plans, qbo: { env: Mode.env(), realmId: options.realmId, items: bindings } });
  });
  return { version: book.version, dryRun: false, realmId: options.realmId, items: bindings };
}
module.exports = { items: items, sync: sync, guard: guard, requestId: requestId };
