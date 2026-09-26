#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var B = require('../api/_lib/pricebook');
async function main() {
  var args = process.argv.slice(2);
  if (args.some(function (s) { return s !== '--apply'; })) throw new Error('Usage: node scripts/seed-pricebook.js [--apply]');
  var book = B.proposed();
  if (args.indexOf('--apply') < 0) { console.log(JSON.stringify({ dryRun: true, book: book }, null, 2)); return; }
  console.log(JSON.stringify(await B.seed(require('../api/_lib/admin').db(), book, true)));
}
if (require.main === module) main().catch(function (e) { console.error(e.message); process.exitCode = 1; });
