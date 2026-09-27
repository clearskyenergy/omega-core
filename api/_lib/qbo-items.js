/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * ClearSky subscription item synchronization. Sandbox only. No OAuth changes.
 * Names are stable; invoice lines supply the versioned price explicitly so a
 * later book never reprices an earlier agreement through an Item.UnitPrice.
 */
'use strict';
var B = require('./pricebook'), M = require('./modules'), crypto = require('crypto');
var Mode = require('./packaging-mode');
function fail(message) { var e = new Error(message); e.status = 409; throw e; }
/* The names a module's QuickBooks item was made under before the modules
   were given Omega-branded names (2026-09-27). The production company's 19
   module items were created under these (items 25-43) before any sync ran,
   so the sync binds an item by its current name OR a former one — a rename
   in modules.js never makes a second catalog, and the item can be renamed in
   QuickBooks whenever it suits. A former-name match must also carry the
   book's price, so an unrelated item that happens to be called "Operations"
   is refused, never bound. When a module name changes again, add the old
   one here. */
var FORMER_NAMES = {
  'module:lite': ['Lite'], 'module:gridatlas': ['Grid Atlas'], 'module:storage': ['Storage Sizing & Revenue'],
  'module:estimate': ['Estimate, BOM & Procurement'], 'module:evrebates': ['EV Rebates & Closeout'], 'module:plansets': ['Plan Sets & CAD'],
  'module:siteintel': ['Site Intelligence'], 'module:engineering': ['Engineering & Analysis'], 'module:finance': ['Investor & Finance'],
  'module:compute': ['Compute & Data Center'], 'module:ops': ['Operations'], 'module:whitelabel': ['White Label Storefront'],
  'module:permitting': ['Permitting Matrix'], 'module:sitefinder': ['Site Finder'], 'module:logic-office': ['Office'],
  'module:logic-plant': ['Plant'], 'module:logic-materials': ['Materials & Purchasing'], 'module:logic-logistics': ['Logistics & Warranty'],
  'module:logic-customer': ['Customer App']
};
function items(book) {
  B.validate(book);
  var out = M.catalog().map(function (m) { var k = 'module:' + m.key, x = { key: k, name: m.name, priceCents: book.modules[m.key].priceCents }; if (FORMER_NAMES[k]) x.formerNames = FORMER_NAMES[k].filter(function (n) { return n !== m.name; }); return x; });
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
/* Why an existing QuickBooks item is refused, in the words the operator
   needs to re-run: an item made by hand (or through a connector) carries
   whatever income account and tax treatment that person chose, so the
   message names them instead of a bare "needs review". */
function review(item, name, options) {
  if (!item || !item.Id) return 'not returned by QuickBooks';
  var why = [], account = item.IncomeAccountRef && item.IncomeAccountRef.value;
  if (item.Name !== name) why.push('name is ' + item.Name);
  if (item.Type !== 'Service') why.push('type is ' + item.Type);
  if (item.Active === false) why.push('inactive');
  if (String(account || '') !== options.incomeAccountId) why.push('income account is ' + (account ? account + (item.IncomeAccountRef.name ? ' ' + item.IncomeAccountRef.name : '') : 'unset') + ', not ' + options.incomeAccountId);
  if (item.Taxable !== options.taxable) why.push(item.Taxable === true ? 'taxable' : item.Taxable === false ? 'non-taxable' : 'taxability unset');
  return why.join('; ');
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
    var p = plan[i], names = [p.name].concat(p.formerNames || []), matches = [];
    for (var n = 0; n < names.length; n++) {
      var sql = "select * from Item where Name = '" + names[n].replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' and Active IN (true, false)";
      var found = ((await call('query?query=' + encodeURIComponent(sql))).QueryResponse || {}).Item || [];
      if (found.length > 1) fail('Ambiguous QuickBooks item name: ' + names[n]);
      if (found[0] && !matches.some(function (m) { return String(m.item.Id) === String(found[0].Id); })) matches.push({ name: names[n], item: found[0] });
    }
    if (matches.length > 1) fail('Two QuickBooks items for ' + p.name + ': ' + matches.map(function (m) { return m.item.Name + ' (' + m.item.Id + ')'; }).join(' and ') + '; keep one and make the other inactive');
    var item = matches[0] && matches[0].item, as = matches[0] ? matches[0].name : p.name;
    if (item && as !== p.name && Math.round(Number(item.UnitPrice) * 100) !== p.priceCents) fail('Existing item needs accounting review: ' + as + ' is not the price book\'s ' + p.name + ' (price ' + item.UnitPrice + ', book ' + (p.priceCents / 100) + ')');
    if (!item && options.noCreate) fail('No QuickBooks item named ' + p.name + (p.formerNames && p.formerNames.length ? ' or ' + p.formerNames.join(' or ') : '') + ' (bind never creates; rename or create it in QuickBooks first)');
    if (!item) {
      item = (await call('item', { Name: p.name, Type: 'Service', IncomeAccountRef: { value: options.incomeAccountId },
        UnitPrice: p.priceCents / 100, Taxable: options.taxable }, requestId(options.realmId, p.name))).Item;
    }
    var why = review(item, as, options);
    if (why) fail('Existing item needs accounting review: ' + as + ' (' + why + ')');
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
module.exports = { items: items, sync: sync, guard: guard, requestId: requestId, FORMER_NAMES: FORMER_NAMES };
