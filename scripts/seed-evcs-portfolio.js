#!/usr/bin/env node
/* scripts/seed-evcs-portfolio.js — load the EVCS fleet (WB1 intake + WB2
   site model) into the EVCS workspace's PRIVATE Portfolio register.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   SAFE BY DEFAULT:
   - Default is an OFFLINE DRY RUN against an in-memory store: it reads the
     two private workbooks, runs the exact gateway import (preview → commit)
     twice, and prints aggregate counts only. No network, no credentials.
   - --apply writes to Firestore through the same gateway code path, as
     FIREBASE_SERVICE_ACCOUNT when it is set, else the Firebase CLI's
     signed-in account (firebase login) through scripts/_lib/live-admin.js
     (api/_lib/portfolio/register.js, the one door /api/site-crm), as a ClearSky staff identity scoped to --org.
     It REFUSES unless omega_orgs/{org} already exists (it never creates a
     tenant, a user, a member or a password) and unless --confirm-org repeats
     the org id. Idempotent: a re-run reports the import as already
     committed / 0 created.
   - The workbooks are never copied into the repo or into logs.

   Usage:
     EVCS_WB1_PATH=… EVCS_WB2_PATH=… node scripts/seed-evcs-portfolio.js [--org evcs.com]
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" EVCS_WB1_PATH=… EVCS_WB2_PATH=… \
       node scripts/seed-evcs-portfolio.js --org <evcs org id> --apply --confirm-org <evcs org id>
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path');
function arg(n) { var i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; }
var APPLY = process.argv.indexOf('--apply') >= 0, ORG = arg('--org') || 'evcs.com', CONFIRM = arg('--confirm-org');
var WB1 = process.env.EVCS_WB1_PATH, WB2 = process.env.EVCS_WB2_PATH;
var STAFF = { uid: 'seed-evcs-portfolio', email: 'portfolio-seed@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true };

function files() {
  [['EVCS_WB1_PATH', WB1], ['EVCS_WB2_PATH', WB2]].forEach(function (x) { if (!x[1] || !fs.existsSync(x[1])) { console.error(x[0] + ' must point at the private workbook'); process.exit(2); } });
  return [{ name: path.basename(WB1), bytes: fs.readFileSync(WB1) }, { name: path.basename(WB2), bytes: fs.readFileSync(WB2) }];
}
function caller(handler) {
  return function (body, method) {
    return new Promise(function (resolve) {
      var res = { statusCode: 200, headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, status: function (c) { this.statusCode = c; return this; }, json: function (b) { resolve({ status: this.statusCode, body: b }); return this; }, end: function (b) { resolve({ status: this.statusCode, body: b }); return this; } };
      handler({ method: method || 'POST', headers: { authorization: 'Bearer seed' }, query: method === 'GET' ? body : {}, body: method === 'GET' ? undefined : body }, res);
    });
  };
}
async function seed(call, list) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var p = await call({ action: 'import-preview', org: ORG, fileName: list[i].name, base64: list[i].bytes.toString('base64') });
    if (p.status !== 200) throw new Error('preview failed (' + p.status + '): ' + (p.body && p.body.error));
    if (p.body.alreadyCommitted) { out.push({ file: 'WB' + (i + 1), profile: p.body.profile, alreadyCommitted: true }); continue; }
    var c = p.body.counts;
    var k = await call({ action: 'import-commit', org: ORG, importId: p.body.importId, planHash: p.body.planHash, acceptConflicts: [] });
    if (k.status !== 200) throw new Error('commit failed (' + k.status + '): ' + (k.body && k.body.error));
    out.push({ file: 'WB' + (i + 1), profile: p.body.profile, created: c.created, updated: c.updated, unchanged: c.unchanged, matched: c.matched, rejected: c.rejected, conflicts: c.conflicts, reconciliationMismatches: c.reconciliationMismatches });
  }
  return out;
}
(async function () {
  var list = files(), make = require('../api/_lib/portfolio/register')._make, A = require('../api/_lib/admin');
  if (!APPLY) {
    var H = require('./tests/_portfolio-fakes'), st = H.store();
    var A2 = Object.assign({}, A, { billingOf: function () { return Promise.resolve({ toolOverrides: {} }); } });
    var h = make({ A: A2, db: function () { return st.db; }, bucket: function () { return st.bucket; }, authenticate: function () { return Promise.resolve(STAFF); }, now: function () { return new Date().toISOString(); } });
    var call = caller(h), first = await seed(call, list), second = await seed(call, list);
    var sites = Object.keys(st.data).filter(function (k) { return k.indexOf('omega_orgs/' + ORG + '/sites/') === 0 && k.split('/').length === 4; }).length;
    var other = Object.keys(st.data).filter(function (k) { return /^omega_orgs\//.test(k) && k.indexOf('omega_orgs/' + ORG + '/') !== 0; }).length;
    console.log(JSON.stringify({ mode: 'dry-run (offline, in-memory)', org: ORG, firstRun: first, secondRun: second, sitesInOrg: sites, docsWrittenOutsideOrg: other }, null, 2));
    console.log('Nothing was written anywhere. Re-run with --apply --confirm-org ' + ORG + ' (and credentials) to load the EVCS workspace.');
    return;
  }
  if (CONFIRM !== ORG) { console.error('Refusing: --confirm-org must repeat --org (' + ORG + ').'); process.exit(2); }
  require('./_lib/live-admin')(A);
  var org = await A.db().collection('omega_orgs').doc(ORG).get();
  if (!org.exists) { console.error('Refusing: omega_orgs/' + ORG + ' does not exist. Create the EVCS workspace through the normal tenant onboarding first; this script never creates tenants, users or passwords.'); process.exit(3); }
  var live = make({ A: A, db: function () { return A.db(); }, bucket: function () { return require('../api/_lib/po-intake').bucket(); }, authenticate: function () { return Promise.resolve(STAFF); }, now: function () { return new Date().toISOString(); } });
  var res = await seed(caller(live), list);
  console.log(JSON.stringify({ mode: 'APPLIED', org: ORG, result: res }, null, 2));
})().catch(function (e) { console.error(e.message); process.exit(1); });
