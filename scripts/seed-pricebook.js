#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var B = require('../api/_lib/pricebook');
/* Sandbox by default. --live --realm=<production realm> seeds the current
   version for the production company, which the book's own validation allows
   only under a release version (never one ending in -proposed): signing the
   values off is renaming VERSION in api/_lib/pricebook.js first. */
async function main() {
  var args = process.argv.slice(2), live = false, realm = null;
  args.forEach(function (v) {
    if (v === '--apply') return; if (v === '--live') { live = true; return; }
    if (/^--realm=\d+$/.test(v)) { realm = v.slice(8); return; }
    throw new Error('Usage: node scripts/seed-pricebook.js [--apply] [--live --realm=<production realm>]');
  });
  if (live && !realm) throw new Error('--live needs --realm=<production realm>');
  if (!live && realm) throw new Error('--realm goes with --live; the sandbox realm is bound by qbo-sync-items.js');
  var book = B.proposed();
  if (live) { book.qbo.env = 'production'; book.qbo.realmId = realm; B.validate(book); }
  if (args.indexOf('--apply') < 0) { console.log(JSON.stringify({ dryRun: true, live: live, book: book }, null, 2)); return; }
  console.log(JSON.stringify(await B.seed(require('../api/_lib/admin').db(), book, true)));
}
if (require.main === module) main().catch(function (e) { console.error(e.message); process.exitCode = 1; });
