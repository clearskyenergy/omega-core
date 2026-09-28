/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Turning the current price book on, and seeing why it is not. ONE copy of
 * the rule: scripts/enable-packaging-sandbox.js and the staff page
 * (admin/pricebook.html → api/pricebook-admin.js) both run it.
 *
 * status()  what the book, the mode and the stored QuickBooks connection say,
 *           which item bindings are missing, and the hash an enable needs.
 * enable()  refuses a used or frozen book and one with any item unbound,
 *           passes the QuickBooks guard (the mode's company, the current book,
 *           the stored connection) and flips `enabled` in a transaction that
 *           re-reads the book; the caller must hand back the hash it was shown.
 *           On the Stripe rail (PACKAGING_PROVIDER=stripe) the book carries no
 *           QuickBooks items: Stripe is handed the server's amounts line by
 *           line, so enable() needs the Stripe mode (a test key, or a live key
 *           under PACKAGING_LIVE=true; a -proposed book never live), not a
 *           binding or the QuickBooks guard.
 * bind()    the item sync against the company the mode names, finding each
 *           item by its exact name (never creating one that exists), with the
 *           income account and taxability read off the existing Lite item so
 *           nobody types an account id; the sync's own checks still apply.
 */
'use strict';
var B = require('./pricebook'), I = require('./qbo-items'), Mode = require('./packaging-mode'), crypto = require('crypto');
function fail(m, s) { var e = new Error(m); e.status = s || 409; throw e; }
function hash(book) { return crypto.createHash('sha256').update(B.stable(book)).digest('hex'); }
function missing(book) { var have = (book.qbo && book.qbo.items) || {}; return I.items(book).filter(function (i) { return !have[i.key]; }).map(function (i) { return i.key; }); }
async function status(db, deps) {
  deps = deps || { Q: require('./qbo') };
  var book = await B.load(db, B.VERSION), conn = await deps.Q.load();
  var gaps = missing(book);
  return { version: book.version, enabled: !!book.enabled, frozen: !!book.frozen, used: book.usedAt != null, provider: Mode.provider(),
    mode: Mode.live() ? 'live' : Mode.open() ? Mode.env() : 'off', bookEnv: book.qbo && book.qbo.env, bookRealm: book.qbo && book.qbo.realmId ? String(book.qbo.realmId) : null,
    connection: conn ? { env: conn.env || null, realmId: conn.realmId ? String(conn.realmId) : null } : null,
    items: { total: I.items(book).length, bound: I.items(book).length - gaps.length, missing: gaps },
    expectedHash: hash(book) };
}
async function enable(db, apply, expectedHash, deps) {
  var book = await B.load(db, B.VERSION);
  if (book.enabled) return { version: book.version, enabled: true, unchanged: true };
  B.writable(book);
  var stripe = Mode.provider() === 'stripe';
  if (stripe) {
    if (!Mode.open('stripe')) fail('The Stripe rail needs a Stripe test key, or PACKAGING_LIVE=true with a live key');
    if (Mode.live('stripe') && /-proposed$/.test(book.version)) fail('A proposed price book is never live; sign the values off under a release version');
  } else if (missing(book).length) fail('Bind every QuickBooks item first');
  var h = hash(book);
  var result = { dryRun: !apply, version: book.version, provider: Mode.provider(), realm: stripe ? null : book.qbo.realmId, before: false, after: true, expectedHash: h };
  if (!apply) return result;
  if (expectedHash !== h) fail('Review the current dry run and supply its --expected-hash');
  if (!stripe) await I.guard(book, String(book.qbo.realmId), deps || { Q: require('./qbo') });
  await db.runTransaction(async function (tx) {
    var ref = db.doc('pricebook/' + book.version), snap = await tx.get(ref), fresh = snap.data(); B.writable(fresh);
    if (B.stable(fresh) !== B.stable(book)) fail('Book changed; repeat the dry run');
    tx.update(ref, { enabled: true });
  });
  return result;
}
async function bind(db, deps) {
  deps = deps || { Q: require('./qbo'), request: require('./qbo-sales').request };
  var book = await B.load(db, B.VERSION), conn = await deps.Q.load();
  if (!conn || !conn.realmId) fail('No QuickBooks company is connected');
  var realm = String(conn.realmId);
  var names = I.items(book).map(function (i) { return i.name; }), found = null;
  for (var i = 0; i < names.length && !found; i++) {
    var q = await deps.request('query?query=' + encodeURIComponent("select * from Item where Name = '" + names[i].replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"), null, null, realm);
    var hit = ((q && q.QueryResponse) || {}).Item || [];
    if (hit.length === 1 && hit[0].IncomeAccountRef) found = hit[0];
  }
  if (!found) fail('None of the book\'s item names exist in the connected QuickBooks company');
  return I.sync(db, book, { apply: true, noCreate: true, realmId: realm, incomeAccountId: String(found.IncomeAccountRef.value), taxable: found.Taxable === true }, deps);
}
module.exports = { status: status, enable: enable, bind: bind, missing: missing, hash: hash };
