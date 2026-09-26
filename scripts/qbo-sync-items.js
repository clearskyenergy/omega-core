#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var B = require('../api/_lib/pricebook'), I = require('../api/_lib/qbo-items'), Mode = require('../api/_lib/packaging-mode');
/* Sandbox by default. Against the production company the process must be
   in live mode (PACKAGING_LIVE=true QBO_ENV=production in its environment)
   AND say --live: the guard in qbo-items decides the company from the mode,
   the flag is the second, deliberate confirmation, and one without the other
   is refused before any call. */
async function main() {
  var args = process.argv.slice(2), options = {};
  args.forEach(function (v) {
    if (v === '--apply') options.apply = true;
    else if (v === '--live') options.live = true;
    else if (v === '--taxable') options.taxable = true;
    else if (v === '--non-taxable') options.taxable = false;
    else if (/^--realm=\d+$/.test(v)) options.realmId = v.slice(8);
    else if (/^--income-account=\d+$/.test(v)) options.incomeAccountId = v.slice(17);
    else throw new Error('Unknown option: [--apply --realm=ID --income-account=ID --taxable|--non-taxable] [--live]');
  });
  if (options.live && !Mode.live()) throw new Error('--live needs PACKAGING_LIVE=true and QBO_ENV=production in the environment');
  if (!options.live && Mode.live() && options.apply) throw new Error('The process is in live mode; say --live to sync the production company');
  var db = options.apply ? require('../api/_lib/admin').db() : null;
  var book = db ? await B.load(db, B.VERSION) : B.proposed();
  console.log(JSON.stringify(await I.sync(db, book, options), null, 2));
}
if (require.main === module) main().catch(function (e) { console.error(e.message); process.exitCode = 1; });
