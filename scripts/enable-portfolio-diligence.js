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
     omega_orgs/{org}.whiteLabel = the seed's whiteLabel keys (platformName,
       shortName, attribution), ADDED where the record has none, the
       staff-written block (2026-10-25, Thomas: "this is only for Solela, so
       you can market that it's Solela Capital"); then tenant_public/{host}
       for each of the workspace's hostnames, built by the ONE allowlist,
       api/_lib/whitelabel.js publicRecord(), as api/tenant-branding.js does.
       Never `enabled`: that opens the public storefront (api/_lib/
       storefront.js), a separate sale, and the seed is refused if it says it;
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
var D = require('../api/_lib/portfolio/diligence'), WL = require('../api/_lib/whitelabel');
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
  return { path: p, raw: raw, whiteLabel: whiteLabelSeed(raw) };
}
/* The white-label keys this script stages, and nothing else: the console
   writes the rest. `enabled` is refused by name, because it opens the public
   storefront, which is sold apart. */
var WL_SEED_KEYS = ['platformName', 'shortName', 'attribution'];
function whiteLabelSeed(raw) {
  var w = raw && raw.whiteLabel;
  if (w == null) return null;
  if (typeof w !== 'object' || Array.isArray(w)) throw refuse(2, 'whiteLabel in the seed must be an object');
  Object.keys(w).forEach(function (k) {
    if (k === 'enabled') throw refuse(2, 'Refusing: whiteLabel.enabled opens the public storefront, a separate sale; this script never sets it.');
    if (WL_SEED_KEYS.indexOf(k) < 0) throw refuse(2, 'whiteLabel.' + k + ' is not a key this script stages (' + WL_SEED_KEYS.join(', ') + '); the master console writes the rest.');
  });
  var out = {};
  if (w.platformName != null) { var n = String(w.platformName).trim(); if (!n || n.length > 80) throw refuse(2, 'whiteLabel.platformName must be 1 to 80 characters'); out.platformName = n; }
  if (w.shortName != null) { var sn = String(w.shortName).trim(); if (!sn || sn.length > 40) throw refuse(2, 'whiteLabel.shortName must be 1 to 40 characters'); out.shortName = sn; }
  if (w.attribution != null) { if (['powered-by', 'none'].indexOf(w.attribution) < 0) throw refuse(2, 'whiteLabel.attribution is powered-by or none'); out.attribution = w.attribution; }
  return Object.keys(out).length ? out : null;
}
/* a key is added only where the record has none: what staff set stands */
function whiteLabelPatch(current, seed) {
  var cur = current && typeof current === 'object' ? JSON.parse(JSON.stringify(current)) : {}, added = [], kept = [];
  Object.keys(seed || {}).forEach(function (k) { if (cur[k] == null || cur[k] === '') { cur[k] = seed[k]; added.push(k); } else kept.push(k); });
  return { changed: added.length > 0, whiteLabel: cur, added: added, kept: kept, on: WL.isOn(cur), switchedOff: cur.enabled === false };
}

/* The one write: the workspace must exist, its billing record must exist,
   and billing/current is read and written in one transaction with the
   audit row, so a re-run reads what the last run wrote. */
async function enable(db, org, seed, wlSeed, now, stamp) {
  var orgRef = db.collection('omega_orgs').doc(org), orgSnap = await orgRef.get();
  if (!orgSnap.exists) throw refuse(3, 'Refusing: omega_orgs/' + org + ' does not exist. Create the workspace in the master console (New tenant) first; this script never creates a tenant, a user, a member or a billing record.');
  var bref = orgRef.collection('billing').doc('current'), auditRef = db.collection('omega_audit').doc();
  var r = await db.runTransaction(async function (tx) {
    var b = await tx.get(bref), o = await tx.get(orgRef);
    if (!b.exists) throw refuse(3, 'Refusing: omega_orgs/' + org + '/billing/current does not exist. The master console writes it when it makes the workspace; this script never creates a billing record.');
    var plan = D.enablePatch(b.data() || {}, seed), wl = whiteLabelPatch((o.data() || {}).whiteLabel, wlSeed);
    if (plan.changed) tx.set(bref, { toolOverrides: plan.toolOverrides, portfolioDiligence: plan.config }, { merge: true });
    if (wl.changed) tx.set(orgRef, { whiteLabel: wl.whiteLabel }, { merge: true });
    if (plan.changed || wl.changed) tx.set(auditRef, { action: 'portfolio-diligence-enable', orgId: org, by: WHO, at: now, flag: D.FLAG, flagWas: plan.flagWas, added: plan.added, kept: plan.kept, whiteLabelAdded: wl.added });
    return { plan: plan, wl: wl, mirrored: [] };
  });
  if (r.wl.changed) {
    /* the sign-in page paints from tenant_public: the same mirror a branding save writes, through the one allowlist */
    var od = (await orgRef.get()).data() || {}, pub = WL.publicRecord(org, od, stamp());
    delete pub.status;   /* status is tenant-approve's to mirror, not a branding write's */
    var hosts = (od.domains || []).map(function (h) { return String(h).toLowerCase(); });
    for (var i = 0; i < hosts.length; i++) await db.collection('tenant_public').doc(hosts[i]).set(pub, { merge: true });
    r.mirrored = hosts;
  }
  return r;
}
function summary(r) {
  return { changed: r.plan.changed || r.wl.changed, flagWas: r.plan.flagWas, added: r.plan.added, kept: r.plan.kept,
    whiteLabel: { added: r.wl.added, kept: r.wl.kept, on: r.wl.on, mirroredTo: r.mirrored, note: r.wl.switchedOff ? 'The white label is switched off on the record (enabled: false): the name shows once staff switch it on.' : null } };
}

(async function () {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(ORG)) throw refuse(2, 'Name the workspace: --org <orgId> (its email domain, for example solelacapital.com).');
  var seed = readSeed(), now = new Date().toISOString(), rel = path.relative(path.join(__dirname, '..'), seed.path);
  if (!APPLY) {
    var H = require('./tests/_portfolio-fakes'), st = H.store(), home = 'omega_orgs/' + ORG, host = 'stand-in.' + ORG;
    st.data[home] = { name: '(stand-in workspace for the dry run)', status: 'active', domains: [host] };
    st.data[home + '/billing/current'] = { tier: 'standard', toolOverrides: { 'portfolio-assets': true } };
    var stampDry = function () { return now; };
    var first = await enable(st.db, ORG, seed.raw, seed.whiteLabel, now, stampDry), second = await enable(st.db, ORG, seed.raw, seed.whiteLabel, now, stampDry);
    var after = st.data[home + '/billing/current'], pub = st.data['tenant_public/' + host] || null;
    var outside = Object.keys(st.data).filter(function (k) { return k !== home && k.indexOf(home + '/') !== 0 && k.indexOf('omega_audit/') !== 0 && k !== 'tenant_public/' + host; });
    console.log(JSON.stringify({ mode: 'dry-run (offline, in-memory)', org: ORG, seed: rel, firstRun: summary(first), secondRun: summary(second),
      write: { toolOverrides: after.toolOverrides, portfolioDiligence: after.portfolioDiligence, whiteLabel: st.data[home].whiteLabel || null,
        tenantPublic: pub ? { host: host + ' (the workspace\u2019s own hostnames on --apply)', name: pub.name, whiteLabel: pub.whiteLabel, status: pub.status === undefined ? '(not written: tenant-approve mirrors it)' : pub.status } : null },
      docsWrittenOutsideWorkspace: outside.length }, null, 2));
    console.log('Nothing was written anywhere. Re-run with --apply --confirm-org ' + ORG + ' (and credentials) to switch it on.');
    return;
  }
  if (CONFIRM !== ORG) throw refuse(2, 'Refusing: --confirm-org must repeat --org (' + ORG + ').');
  var A = require('../api/_lib/admin');
  require('./_lib/live-admin')(A);
  var res = await enable(A.db(), ORG, seed.raw, seed.whiteLabel, now, function () { return A.FieldValue().serverTimestamp(); });
  console.log(JSON.stringify({ mode: 'APPLIED', org: ORG, seed: rel, result: summary(res) }, null, 2));
  if (!(res.plan.changed || res.wl.changed)) console.log('Already on with every list and the name in place: nothing was written.');
})().catch(function (e) { console.error(e.message); process.exit(e.exitCode || 1); });
