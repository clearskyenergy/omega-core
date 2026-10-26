#!/usr/bin/env node
/* scripts/enable-portfolio-diligence.js — switch the compute-site due
   diligence on for ONE workspace and write that workspace's own lists.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   What it writes (api/_lib/portfolio/diligence.js enablePatch, the one rule):
     omega_orgs/{org}/billing/current.toolOverrides['portfolio-diligence']
       = true, every other override kept;
     omega_orgs/{org}/billing/current.portfolioDiligence = the seed's lists,
       ADDED where the workspace has none. A key the workspace already holds
       is never overwritten, so a re-run changes nothing and a list edited
       since stands;
     omega_audit: one row, action portfolio-diligence-enable.
   The seed is tenants/<slug>/portfolio-diligence.json (the slug is the
   org's first label; --seed <path> names another). It is validated
   (diligence.validateConfig) before anything is read or written, and
   .vercelignore keeps it off the site: it carries a partner's terms.

   SAFE BY DEFAULT:
   - Default is an OFFLINE DRY RUN against an in-memory store holding a
     stand-in workspace: the same enable() runs twice (the second must
     change nothing) and the write is printed. No network, no credentials.
   - --apply writes to Firestore as FIREBASE_SERVICE_ACCOUNT when it is set,
     else the Firebase CLI's signed-in account (scripts/_lib/live-admin.js).
     It REFUSES unless --confirm-org repeats --org, unless omega_orgs/{org}
     exists and unless its billing/current exists: the workspace is made in
     the master console (New tenant), never here. It never creates a
     tenant, a user, a member or a billing record.

   Usage:
     node scripts/enable-portfolio-diligence.js --org solelacapital.com
     node scripts/enable-portfolio-diligence.js --org solelacapital.com --apply --confirm-org solelacapital.com
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path');
var D = require('../api/_lib/portfolio/diligence');
function arg(n) { var i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; }
var APPLY = process.argv.indexOf('--apply') >= 0, ORG = String(arg('--org') || '').trim().toLowerCase(), CONFIRM = arg('--confirm-org'), SEED = arg('--seed');
var WHO = 'script:enable-portfolio-diligence';

function refuse(code, message) { var e = new Error(message); e.exitCode = code; return e; }
function seedPath() { return SEED ? path.resolve(SEED) : path.join(__dirname, '..', 'tenants', ORG.split('.')[0], 'portfolio-diligence.json'); }
function readSeed() {
  var p = seedPath();
  if (!fs.existsSync(p)) throw refuse(2, 'No seed at ' + path.relative(process.cwd(), p) + '. A workspace\'s diligence lists are its own: write them there, or name a file with --seed.');
  var raw;
  try { raw = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw refuse(2, 'The seed is not JSON: ' + e.message); }
  try { D.validateConfig(raw); } catch (e) { throw refuse(2, e.message); }
  return { path: p, raw: raw };
}

/* The one write: the workspace must exist, its billing record must exist,
   and billing/current is read and written in one transaction with the
   audit row, so a re-run reads what the last run wrote. */
async function enable(db, org, seed, now) {
  var orgSnap = await db.collection('omega_orgs').doc(org).get();
  if (!orgSnap.exists) throw refuse(3, 'Refusing: omega_orgs/' + org + ' does not exist. Create the workspace in the master console (New tenant) first; this script never creates a tenant, a user, a member or a billing record.');
  var bref = db.collection('omega_orgs').doc(org).collection('billing').doc('current'), auditRef = db.collection('omega_audit').doc();
  return db.runTransaction(async function (tx) {
    var b = await tx.get(bref);
    if (!b.exists) throw refuse(3, 'Refusing: omega_orgs/' + org + '/billing/current does not exist. The master console writes it when it makes the workspace; this script never creates a billing record.');
    var plan = D.enablePatch(b.data() || {}, seed);
    if (!plan.changed) return plan;
    tx.set(bref, { toolOverrides: plan.toolOverrides, portfolioDiligence: plan.config }, { merge: true });
    tx.set(auditRef, { action: 'portfolio-diligence-enable', orgId: org, by: WHO, at: now, flag: D.FLAG, flagWas: plan.flagWas, added: plan.added, kept: plan.kept });
    return plan;
  });
}
function summary(plan) { return { changed: plan.changed, flagWas: plan.flagWas, added: plan.added, kept: plan.kept }; }

(async function () {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(ORG)) throw refuse(2, 'Name the workspace: --org <orgId> (its email domain, for example solelacapital.com).');
  var seed = readSeed(), now = new Date().toISOString(), rel = path.relative(path.join(__dirname, '..'), seed.path);
  if (!APPLY) {
    var H = require('./tests/_portfolio-fakes'), st = H.store(), home = 'omega_orgs/' + ORG;
    st.data[home] = { name: '(stand-in workspace for the dry run)', status: 'active' };
    st.data[home + '/billing/current'] = { tier: 'standard', toolOverrides: { 'portfolio-assets': true } };
    var first = await enable(st.db, ORG, seed.raw, now), second = await enable(st.db, ORG, seed.raw, now), after = st.data[home + '/billing/current'];
    var outside = Object.keys(st.data).filter(function (k) { return k !== home && k.indexOf(home + '/') !== 0 && k.indexOf('omega_audit/') !== 0; });
    console.log(JSON.stringify({ mode: 'dry-run (offline, in-memory)', org: ORG, seed: rel, firstRun: summary(first), secondRun: summary(second),
      write: { toolOverrides: after.toolOverrides, portfolioDiligence: after.portfolioDiligence }, docsWrittenOutsideWorkspace: outside.length }, null, 2));
    console.log('Nothing was written anywhere. Re-run with --apply --confirm-org ' + ORG + ' (and credentials) to switch it on.');
    return;
  }
  if (CONFIRM !== ORG) throw refuse(2, 'Refusing: --confirm-org must repeat --org (' + ORG + ').');
  var A = require('../api/_lib/admin');
  require('./_lib/live-admin')(A);
  var res = await enable(A.db(), ORG, seed.raw, now);
  console.log(JSON.stringify({ mode: 'APPLIED', org: ORG, seed: rel, result: summary(res) }, null, 2));
  if (!res.changed) console.log('Already on with every list in place: nothing was written.');
})().catch(function (e) { console.error(e.message); process.exit(e.exitCode || 1); });
