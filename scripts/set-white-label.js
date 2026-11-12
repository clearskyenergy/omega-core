#!/usr/bin/env node
/* scripts/set-white-label.js — stage ONE workspace's white label: what the
   platform is called there, its mark and its two colours.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   (2026-11-09, Tommy: "we are making a solelacapital white label version";
   one codebase, the workspace's own name on it. See docs/WHITE-LABEL.md §1.)

   What it writes, exactly as POST /api/tenant-branding does for staff:
     omega_orgs/{org}.whiteLabel — the keys in the seed, ADDED where the
       record has none; a key the record already holds stands unless it is
       named with --replace. Every other key of the block is kept.
     tenant_public/{host} for each of the workspace's hostnames, built by the
       ONE allowlist (api/_lib/whitelabel.js publicRecord()), so the sign-in
       page paints the same name before there is a user.
     omega_audit: one row, action white-label-set.
   The seed is tenants/<slug>/white-label.json (--seed names another; the
   slug is the org's first label). Only these keys are staged, each checked:
     platformName, shortName, attribution ('powered-by' | 'none'),
     attributionText, markUrl (a file under /tenants/ that is in the repo),
     supportEmail, accent, ink (hex colours).
   Never `enabled` and never `embed`: those open and shape the PUBLIC
   storefront (api/_lib/storefront.js), a separate sale. A seed that carries
   either is refused. `attribution: 'none'` takes ClearSky's name off the
   product, which is a decision: it is refused unless --allow-no-attribution
   is passed with it.

   SAFE BY DEFAULT: an offline dry run against a stand-in workspace unless
   --apply --confirm-org <org>. It never creates a tenant, a hostname, a
   user or a billing record.

   Usage:
     node scripts/set-white-label.js --org solelacapital.com
     node scripts/set-white-label.js --org chileasing.com --seed tenants/solelacapital/white-label.json
     … --replace markUrl,accent      overwrite those keys where the record has them
     … --apply --confirm-org <org>   write
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path');
var WL = require('../api/_lib/whitelabel');
function arg(n) { var i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; }
function has(n) { return process.argv.indexOf(n) >= 0; }
var APPLY = has('--apply'), ORG = String(arg('--org') || '').trim().toLowerCase(), CONFIRM = arg('--confirm-org'), SEED = arg('--seed');
var REPLACE = String(arg('--replace') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
var WHO = 'script:set-white-label', ROOT = path.join(__dirname, '..');
var KEYS = ['platformName', 'shortName', 'attribution', 'attributionText', 'markUrl', 'supportEmail', 'accent', 'ink'];
function refuse(code, message) { var e = new Error(message); e.exitCode = code; return e; }

function readSeed() {
  var p = SEED ? path.resolve(SEED) : path.join(ROOT, 'tenants', ORG.split('.')[0], 'white-label.json');
  if (!fs.existsSync(p)) throw refuse(2, 'No seed at ' + path.relative(process.cwd(), p) + '. Write the workspace’s white label there, or name a file with --seed.');
  var raw; try { raw = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw refuse(2, 'The seed is not JSON: ' + e.message); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw refuse(2, 'The seed must be an object');
  var out = {};
  Object.keys(raw).forEach(function (k) {
    if (k === 'enabled' || k === 'embed') throw refuse(2, 'Refusing: whiteLabel.' + k + ' opens or shapes the public storefront, a separate sale; this script never sets it.');
    if (KEYS.indexOf(k) < 0) throw refuse(2, 'whiteLabel.' + k + ' is not a key this script stages (' + KEYS.join(', ') + ').');
    var v = raw[k]; if (v == null || v === '') return;
    v = String(v).trim();
    if (k === 'platformName' && v.length > 80) throw refuse(2, 'platformName must be 1 to 80 characters');
    if (k === 'shortName' && v.length > 40) throw refuse(2, 'shortName must be 1 to 40 characters');
    if (k === 'attributionText' && v.length > 120) throw refuse(2, 'attributionText must be 120 characters or fewer');
    if (k === 'attribution') {
      if (['powered-by', 'none'].indexOf(v) < 0) throw refuse(2, 'attribution is powered-by or none');
      if (v === 'none' && !has('--allow-no-attribution')) throw refuse(2, 'Refusing: attribution "none" takes ClearSky’s name off the product. That is a decision: pass --allow-no-attribution to make it.');
    }
    if ((k === 'accent' || k === 'ink') && !/^#[0-9a-fA-F]{6}$/.test(v)) throw refuse(2, k + ' must be a six-digit hex colour like #C4A572');
    if (k === 'supportEmail' && !/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/i.test(v)) throw refuse(2, 'supportEmail is not an address');
    if (k === 'markUrl') {
      if (!/^\/tenants\/[a-z0-9-]+\/[A-Za-z0-9._\/-]+\.(svg|png)$/.test(v) || v.indexOf('..') >= 0) throw refuse(2, 'markUrl must be an .svg or .png under /tenants/<slug>/');
      if (!fs.existsSync(path.join(ROOT, v))) throw refuse(2, 'markUrl ' + v + ' is not a file in the repo: the site would serve a broken image.');
    }
    out[k] = v;
  });
  if (!Object.keys(out).length) throw refuse(2, 'The seed sets nothing.');
  REPLACE.forEach(function (k) { if (KEYS.indexOf(k) < 0) throw refuse(2, '--replace ' + k + ' is not a key this script stages.'); });
  return { path: p, wl: out };
}
/* a key is added where the record has none; one it holds stands unless named in --replace */
function patch(current, seed) {
  var cur = current && typeof current === 'object' ? JSON.parse(JSON.stringify(current)) : {}, added = [], replaced = [], kept = [];
  Object.keys(seed).forEach(function (k) {
    if (cur[k] == null || cur[k] === '') { cur[k] = seed[k]; added.push(k); }
    else if (cur[k] === seed[k]) return;
    else if (REPLACE.indexOf(k) >= 0) { replaced.push({ key: k, was: cur[k] }); cur[k] = seed[k]; }
    else kept.push({ key: k, has: cur[k], seed: seed[k] });
  });
  return { changed: added.length + replaced.length > 0, whiteLabel: cur, added: added, replaced: replaced, kept: kept, on: WL.isOn(cur), switchedOff: cur.enabled === false };
}
async function write(db, org, seed, now, stamp) {
  var ref = db.collection('omega_orgs').doc(org), snap = await ref.get();
  if (!snap.exists) throw refuse(3, 'Refusing: omega_orgs/' + org + ' does not exist. This script never creates a tenant.');
  var p = patch((snap.data() || {}).whiteLabel, seed), mirrored = [];
  if (p.changed) {
    await ref.set({ whiteLabel: p.whiteLabel }, { merge: true });
    /* the sign-in page paints from tenant_public: the same mirror a branding save writes, through the one allowlist */
    var od = (await ref.get()).data() || {}, pub = WL.publicRecord(org, od, stamp());
    delete pub.status;   /* status is tenant-approve's to mirror, not a branding write's */
    var hosts = (od.domains || []).map(function (h) { return String(h).toLowerCase(); });
    for (var i = 0; i < hosts.length; i++) await db.collection('tenant_public').doc(hosts[i]).set(pub, { merge: true });
    mirrored = hosts;
    await db.collection('omega_audit').doc().set({ action: 'white-label-set', orgId: org, by: WHO, at: now, added: p.added, replaced: p.replaced.map(function (r) { return r.key; }), mirroredTo: hosts });
  }
  p.mirrored = mirrored; p.domains = ((await ref.get()).data() || {}).domains || [];
  return p;
}
function summary(p) {
  return { changed: p.changed, added: p.added, replaced: p.replaced, keptAsOnTheRecord: p.kept, whiteLabel: p.whiteLabel, on: p.on, mirroredTo: p.mirrored, hostnames: p.domains,
    note: p.switchedOff ? 'The white label is switched off on the record (enabled: false): the name shows once staff switch it on.' : !p.domains.length ? 'The workspace has no hostname on its record: the sign-in page has nothing to paint from until one is attached.' : null };
}

(async function () {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(ORG)) throw refuse(2, 'Name the workspace: --org <orgId> (its email domain, for example solelacapital.com).');
  var seed = readSeed(), now = new Date().toISOString(), rel = path.relative(ROOT, seed.path);
  if (!APPLY) {
    var H = require('./tests/_portfolio-fakes'), st = H.store(), home = 'omega_orgs/' + ORG, host = 'stand-in.' + ORG;
    st.data[home] = { name: '(stand-in workspace for the dry run)', status: 'active', domains: [host], whiteLabel: { platformName: seed.wl.platformName } };
    var first = await write(st.db, ORG, seed.wl, now, function () { return now; }), second = await write(st.db, ORG, seed.wl, now, function () { return now; });
    var pub = st.data['tenant_public/' + host] || null;
    console.log(JSON.stringify({ mode: 'dry-run (offline, in-memory; the stand-in already holds the platform name)', org: ORG, seed: rel, firstRun: summary(first), secondRunChanged: second.changed,
      tenantPublic: pub ? { host: host + ' (the workspace’s own hostnames on --apply)', whiteLabel: pub.whiteLabel } : null }, null, 2));
    console.log('Nothing was written anywhere. Re-run with --apply --confirm-org ' + ORG + ' to write it.');
    return;
  }
  if (CONFIRM !== ORG) throw refuse(2, 'Refusing: --confirm-org must repeat --org (' + ORG + ').');
  var A = require('../api/_lib/admin');
  require('./_lib/live-admin')(A);
  var res = await write(A.db(), ORG, seed.wl, now, function () { return A.FieldValue().serverTimestamp(); });
  console.log(JSON.stringify({ mode: 'APPLIED', org: ORG, seed: rel, result: summary(res) }, null, 2));
  if (!res.changed) console.log('Already set: nothing was written.');
})().catch(function (e) { console.error(e.message); process.exit(e.exitCode || 1); });
