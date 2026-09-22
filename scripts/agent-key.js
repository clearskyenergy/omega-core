#!/usr/bin/env node
/* scripts/agent-key.js — mint, list or revoke an agent key for /api/agent/*
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHAT A KEY IS. A bearer credential a machine holds — the CFA/OGI JV
   ChatGPT agent, a partner's script — so it can list the portfolio's sites,
   fetch a site's outline as KML/KMZ, and upload sites with their outline,
   through /api/agent/sites and /api/agent/site-outline. api/_lib/agent-auth.js
   explains the row; this is the only thing that writes it.

   ── THE PLAINTEXT IS PRINTED ONCE AND NEVER STORED ──────────────────────
   Firestore holds sha256(key) as the document id and nothing that can be
   turned back into the key. If the line this prints is lost, mint another
   and revoke this one. Do not paste a key into a chat, a ticket or a commit:
   this repository is public and a key in the history is a key published.

   ── WHO THE KEY ACTS AS ───────────────────────────────────────────────
   --org is the org the key reads and writes AS, and it must be the string
   firestore.rules compares in deals.orgsInvolved[] — a JV member firm's
   domain (ogisolar.com), not "OGI" and not "osa". The key then sees the
   deals that firm is on, exactly as that firm's people do in the OSA
   portfolio, and files new sites as that firm's referrals.
   --admin (ClearSky only) sees every deal; pair it with --org csebuilders.com.

   ── DRY RUN BY DEFAULT ────────────────────────────────────────────────
   Prints the plan and writes nothing. Pass --apply to write.

   Usage:
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/agent-key.js \
       --org ogisolar.com --label "CFA/OGI JV GPT" [--scopes sites:read,sites:write] \
       [--expires 2027-01-01] [--admin] --apply
     FIREBASE_SERVICE_ACCOUNT=… node scripts/agent-key.js --list [--org ogisolar.com]
     FIREBASE_SERVICE_ACCOUNT=… node scripts/agent-key.js --revoke <keyId prefix> --apply

   The key is printed to STDERR so `> file` captures the plan, not the secret. */
'use strict';
var path = require('path');
var Auth = require(path.join(__dirname, '..', 'api', '_lib', 'agent-auth.js'));

var argv = process.argv.slice(2);
function flag(n) { return argv.indexOf(n) >= 0; }
function opt(n, d) { var i = argv.indexOf(n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; }

var APPLY = flag('--apply'), LIST = flag('--list'), ADMIN = flag('--admin');
var REVOKE = opt('--revoke', '');
var ORG = String(opt('--org', '')).toLowerCase().trim();
var LABEL = String(opt('--label', '')).trim();
var SCOPES = Auth.normScopes(String(opt('--scopes', 'sites:read,sites:write')).split(','));
var EXPIRES = opt('--expires', '');

function usage(msg) {
  if (msg) console.error('\n' + msg);
  console.error('\nusage: --org <domain> --label "<who holds it>" [--scopes sites:read,sites:write] [--expires YYYY-MM-DD] [--admin] [--apply]');
  console.error('       --list [--org <domain>]');
  console.error('       --revoke <keyId prefix> [--apply]\n');
  process.exit(2);
}

if (!LIST && !REVOKE) {
  if (!ORG || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(ORG)) usage('--org must be an email domain such as ogisolar.com (the value in deals.orgsInvolved[]).');
  if (!LABEL) usage('--label is required: say who holds this key, e.g. "CFA/OGI JV GPT". It is what the audit line on every site will show.');
  if (!SCOPES.length) usage('--scopes must include at least one of ' + Auth.SCOPES.join(', '));
  if (EXPIRES && isNaN(Date.parse(EXPIRES))) usage('--expires must be a date.');
  if (ADMIN && !/(^|\.)(clearsky-usa|csebuilders)\.com$/.test(ORG)) usage('--admin is for a ClearSky org only.');
}

function connect() {
  var raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT is not set (the service-account JSON, as one line).'); process.exit(2); }
  var admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  return admin.firestore();
}

function list() {
  var db = connect(), col = db.collection('agent_keys');
  var q = ORG ? col.where('orgId', '==', ORG) : col;
  return q.get().then(function (snap) {
    if (snap.empty) { console.log('no agent keys' + (ORG ? ' for ' + ORG : '')); return; }
    snap.forEach(function (d) {
      var k = d.data();
      console.log((k.active === false ? 'REVOKED ' : 'active  ') + d.id.slice(0, 12) + '…  ' + k.orgId + '  "' + k.label + '"  ' +
        (k.scopes || []).join(',') + (k.admin ? '  ADMIN' : '') + '  last used ' + (k.lastUsedAt || 'never') +
        (k.expiresAt ? '  expires ' + k.expiresAt : ''));
    });
  });
}

function revoke() {
  var prefix = String(REVOKE).trim();
  if (prefix.length < 6) usage('--revoke needs at least 6 characters of the key id (from --list).');
  var db = connect();
  return db.collection('agent_keys').get().then(function (snap) {
    var hits = [];
    snap.forEach(function (d) { if (d.id.indexOf(prefix) === 0) hits.push(d); });
    if (hits.length !== 1) { console.error(hits.length ? 'ambiguous: ' + hits.length + ' keys match' : 'no key matches ' + prefix); process.exit(1); }
    var d = hits[0], k = d.data();
    console.log('revoke ' + d.id.slice(0, 12) + '…  ' + k.orgId + '  "' + k.label + '"');
    if (!APPLY) { console.log('DRY RUN. Nothing written. Re-run with --apply.'); return; }
    return d.ref.update({ active: false, revokedAt: new Date().toISOString() }).then(function () { console.log('revoked.'); });
  });
}

function mint() {
  var key = Auth.mintKey(), id = Auth.keyIdOf(key);
  var row = { orgId: ORG, label: LABEL, scopes: SCOPES, admin: ADMIN, active: true,
              expiresAt: EXPIRES ? new Date(EXPIRES).toISOString() : null,
              createdAt: new Date().toISOString(), createdBy: process.env.USER || process.env.USERNAME || 'script', lastUsedAt: null };
  console.log('\n== agent key');
  console.log('   org      ' + ORG + (ADMIN ? '   (ADMIN: sees every deal)' : '   (sees deals whose orgsInvolved[] names it)'));
  console.log('   label    ' + LABEL);
  console.log('   scopes   ' + SCOPES.join(', '));
  console.log('   expires  ' + (row.expiresAt || 'never'));
  console.log('   row      agent_keys/' + id.slice(0, 12) + '…');
  if (!APPLY) { console.log('\nDRY RUN. Nothing written and no key minted. Re-run with --apply.\n'); return Promise.resolve(); }
  var db = connect();
  return db.collection('agent_keys').doc(id).set(row).then(function () {
    console.log('\nwritten.');
    console.error('\n   KEY (shown once, never stored):\n\n      ' + key + '\n');
    console.error('   In ChatGPT: Configure → Actions → Import from URL');
    console.error('      https://silmarillion.clearskyomega.com/api/agent/openapi');
    console.error('   Authentication: API Key · Auth Type: Bearer · paste the key above.\n');
  });
}

(LIST ? list() : REVOKE ? revoke() : mint()).catch(function (e) { console.error(e && e.message || e); process.exit(1); });
