/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The Omega Logic surface map (docs/OMEGA-LOGIC-CLEANUP.md). Pins the pages
   and the Firestore names the audit walks, so a renamed page or a dropped
   collection fails here instead of disappearing from the map. It does not
   launch a browser; the walk itself is scripts/audit-logic-walk.js.
   node scripts/tests/tlogiccleanup.js */
'use strict';
var fs = require('fs'), path = require('path');
var A = require('../audit-logic-walk');
var rules = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
var theme = fs.readFileSync(path.join(__dirname, '..', '..', 'omega-logic-theme.js'), 'utf8');
var stage = fs.readFileSync(path.join(__dirname, '..', '..', 'api/_lib/office-stage.js'), 'utf8');
var pass = 0, fail = 0;
function ok(msg, c) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + msg); }

A.PAGES.forEach(function (p) {
  ok(p.id + ' file ' + p.file, !!A.fileOf(p));
  ok(p.id + ' has an area and a persona', !!p.area && !!p.persona && !!p.path);
});
var ids = {};
A.PAGES.forEach(function (p) { ok('unique id ' + p.id, !ids[p.id]); ids[p.id] = true; });
A.COLLECTIONS.forEach(function (name) {
  ok('firestore.rules names ' + name, rules.indexOf(name) >= 0);
});
var auditRule = /match \/omega_audit\/\{[^}]+\}/.exec(rules);
if (!auditRule) ok('omega_audit is closed by the default deny until a rule names it', true);
else ok('a named omega_audit rule only denies browsers', /allow read, write: if false/.test(rules.slice(auditRule.index, auditRule.index + 500)));
['Today', 'Sales', 'Customers', 'Plant', 'Deliver', 'Stock', 'Money', 'Setup'].forEach(function (hub) {
  ok('office chrome still has the ' + hub + ' place', theme.indexOf("['" + hub + "'") >= 0);
});
['Price', 'Deposit', 'Build', 'Final payment', 'Ship', 'Deliver', 'On site'].forEach(function (step) {
  ok('order path still has ' + step, stage.indexOf("label: '" + step + "'") >= 0);
});
ok('the walk stays on the sample host', fs.readFileSync(path.join(__dirname, '..', 'audit-logic-walk.js'), 'utf8').indexOf('127.0.0.1') >= 0);

console.log('tlogiccleanup: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
