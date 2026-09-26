#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var B = require('../api/_lib/pricebook'), I = require('../api/_lib/qbo-items');
async function main() {
  var args = process.argv.slice(2), options = {};
  args.forEach(function (v) {
    if (v === '--apply') options.apply = true;
    else if (v === '--taxable') options.taxable = true;
    else if (v === '--non-taxable') options.taxable = false;
    else if (/^--realm=\d+$/.test(v)) options.realmId = v.slice(8);
    else if (/^--income-account=\d+$/.test(v)) options.incomeAccountId = v.slice(17);
    else throw new Error('Unknown option. Sandbox only: [--apply --realm=ID --income-account=ID --taxable|--non-taxable]');
  });
  var db = options.apply ? require('../api/_lib/admin').db() : null;
  var book = db ? await B.load(db, B.VERSION) : B.proposed();
  console.log(JSON.stringify(await I.sync(db, book, options), null, 2));
}
if (require.main === module) main().catch(function (e) { console.error(e.message); process.exitCode = 1; });
