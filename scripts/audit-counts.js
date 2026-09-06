#!/usr/bin/env node
/* scripts/audit-counts.js — per-orgId document counts, BEFORE and AFTER any cutover.
   Usage:  FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/audit-counts.js > audit-$(date +%F).json
   Compare two runs:  node scripts/audit-counts.js --diff audit-before.json audit-after.json
   Read-only. Never writes. */
'use strict';
var fs = require('fs');
var COLLECTIONS = ['projects', 'fin_projects', 'intake_projects', 'team_members', 'dashboard_layouts', 'equipment', 'sites', 'capacityAllocations', 'referrals', 'termsAcceptances', 'legal_acceptances'];

if (process.argv[2] === '--diff') {
  var a = JSON.parse(fs.readFileSync(process.argv[3])), b = JSON.parse(fs.readFileSync(process.argv[4])), bad = 0;
  Object.keys(a.counts).forEach(function (c) {
    Object.keys(a.counts[c]).forEach(function (org) {
      var x = a.counts[c][org], y = (b.counts[c] || {})[org] || 0;
      if (y < x) { bad++; console.log('LOSS  ' + c + ' ' + org + ': ' + x + ' -> ' + y); }
    });
  });
  console.log(bad ? bad + ' collection/org pairs LOST documents' : 'OK — no org lost documents in any collection');
  process.exit(bad ? 1 : 0);
}

var admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
var db = admin.firestore();
var out = { at: new Date().toISOString(), counts: {}, missingOrgId: {} };
(async function () {
  for (var i = 0; i < COLLECTIONS.length; i++) {
    var c = COLLECTIONS[i]; out.counts[c] = {}; out.missingOrgId[c] = 0;
    var snap = await db.collection(c).select('orgId').get();
    snap.forEach(function (d) {
      var org = d.get('orgId');
      if (!org) { /* team_members / dashboard_layouts key the org in the id */ org = (d.id.indexOf('__') > 0) ? d.id.split('__')[0] : null; }
      if (!org) { out.missingOrgId[c]++; org = '(none)'; }
      out.counts[c][org] = (out.counts[c][org] || 0) + 1;
    });
    process.stderr.write(c + ': ' + snap.size + ' docs, ' + out.missingOrgId[c] + ' without orgId\n');
  }
  console.log(JSON.stringify(out, null, 2));
})();
