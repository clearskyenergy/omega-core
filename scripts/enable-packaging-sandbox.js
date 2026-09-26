#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Enables only the reviewed, unused proposed book after sandbox item sync.
 * Default is read-only; applying requires the exact hash printed by dry run.
 */
'use strict';
var B = require('../api/_lib/pricebook'), I = require('../api/_lib/qbo-items'), crypto = require('crypto');
async function enable(db, apply, expectedHash, deps) {
  var book = await B.load(db, B.VERSION);
  if (book.enabled) return { version: book.version, enabled: true, unchanged: true };
  B.writable(book);
  if (I.items(book).some(function (item) { return !book.qbo.items[item.key]; })) throw new Error('Sync every sandbox item first');
  var hash = crypto.createHash('sha256').update(B.stable(book)).digest('hex');
  var result = { dryRun: !apply, version: book.version, sandboxRealm: book.qbo.realmId, before: false, after: true, expectedHash: hash };
  if (!apply) return result;
  if (expectedHash !== hash) throw new Error('Review the current dry run and supply its --expected-hash');
  await I.guard(book, book.qbo.realmId, deps || { Q: require('../api/_lib/qbo') });
  await db.runTransaction(async function (tx) {
    var ref = db.doc('pricebook/' + book.version), snap = await tx.get(ref), fresh = snap.data(); B.writable(fresh);
    if (B.stable(fresh) !== B.stable(book)) throw new Error('Book changed; repeat the dry run');
    tx.update(ref, { enabled: true });
  });
  return result;
}
async function main() {
  var args = process.argv.slice(2), apply = false, hash;
  args.forEach(function (arg) { if (arg === '--apply') apply = true; else if (/^--expected-hash=[a-f0-9]{64}$/.test(arg)) hash = arg.slice(16); else throw new Error('Usage: enable-packaging-sandbox.js [--apply --expected-hash=HASH]'); });
  console.log(JSON.stringify(await enable(require('../api/_lib/admin').db(), apply, hash), null, 2));
}
module.exports = enable;
if (require.main === module) main().catch(function (e) { console.error(e.message); process.exitCode = 1; });
