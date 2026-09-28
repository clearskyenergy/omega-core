#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Enables only the reviewed, unused proposed book after sandbox item sync.
 * Default is read-only; applying requires the exact hash printed by dry run.
 */
'use strict';
var E = require('../api/_lib/pricebook-enable');
function enable(db, apply, expectedHash, deps) { return E.enable(db, apply, expectedHash, deps); }
async function main() {
  var args = process.argv.slice(2), apply = false, hash;
  args.forEach(function (arg) { if (arg === '--apply') apply = true; else if (/^--expected-hash=[a-f0-9]{64}$/.test(arg)) hash = arg.slice(16); else throw new Error('Usage: enable-packaging-sandbox.js [--apply --expected-hash=HASH]'); });
  console.log(JSON.stringify(await enable(require('../api/_lib/admin').db(), apply, hash), null, 2));
}
module.exports = enable;
if (require.main === module) main().catch(function (e) { console.error(e.message); process.exitCode = 1; });
