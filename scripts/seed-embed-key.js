#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/seed-embed-key.js — mint a publishable storefront key for a tenant
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Creates embed_keys/{omega_pk_live_…} for one white-labelled tenant and
   prints the snippet their web developer pastes into their site.

   DRY RUN BY DEFAULT. Prints what it would write. Pass --apply to write.

   Usage:
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
       node scripts/seed-embed-key.js --org cleancell.us \
         --origins https://cleancell.us,.cleancell.us \
         --label "cleancell.us main site" [--apply]

     node scripts/seed-embed-key.js --org cleancell.us --list
     node scripts/seed-embed-key.js --key omega_pk_live_… --disable --apply

   ── WHY A SCRIPT AND NOT A SELF-SERVE BUTTON ─────────────────────────────
   Because it is not self-serve and should not look like it. A key is the
   moment a tenant's own website starts taking orders we have to fulfil — it
   follows a signed arrangement, and the person minting it should be the
   person who read the arrangement. The master console gets an Enable/Disable
   toggle (which is safe, reversible and needed at 2am); a TENANT never mints.

   AMENDED 2026-09-19 — there is a second sanctioned path: whitelabel-setup.html
   mints a key for a staff user standing a white label up from the browser.
   That is not a walk-back of the paragraph above, because the invariant it
   protects is WHO, not WHERE: that page is isAdmin() in firestore.rules (an
   @clearsky-usa.com or @csebuilders.com token), it records mintedBy and
   mintedVia on the document, and it reuses an existing active key rather than
   minting a second for the same installation. What it buys is the last mile —
   turning a signed contract into a working storefront without first finding a
   service-account key, which is how a sold feature sits unlaunched for a week.

   This script stays canonical for everything that page does NOT do: rotating
   a key, tightening origins on a live one, disabling one, and listing them.

   ── THE KEY IS PUBLISHABLE, NOT SECRET ───────────────────────────────────
   It ships in the page source of a public website, exactly like a Stripe
   pk_live_ key. It is printed to the terminal on purpose. What makes that
   acceptable is api/_lib/embed.js — read the header there before deciding
   this is too loose; the short version is that the key names an installation
   and unlocks nothing confidential.

   Random from crypto.randomBytes, not Math.random: a guessable key would let
   somebody file orders against a tenant they have no relationship with, and
   while that is only a junk row, it is a junk row with a customer's name on
   it in somebody else's queue.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');

function arg(name, dflt) {
  var i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  var v = process.argv[i + 1];
  return (v && v.slice(0, 2) !== '--') ? v : true;
}
var APPLY   = process.argv.indexOf('--apply') >= 0;
var LIST    = process.argv.indexOf('--list') >= 0;
var DISABLE = process.argv.indexOf('--disable') >= 0;
var ENABLE  = process.argv.indexOf('--enable') >= 0;

var ORG     = String(arg('org', '') || '').toLowerCase();
var KEY     = String(arg('key', '') || '');
var LABEL   = String(arg('label', '') || '');
var SCOPES  = String(arg('scopes', 'storefront')).split(',').map(trim).filter(Boolean);
var ORIGINS = String(arg('origins', '')).split(',').map(trim).filter(Boolean);

function trim(s) { return String(s || '').trim().toLowerCase(); }

function die(msg) { console.error('\n' + msg + '\n'); process.exit(1); }

if (!ORG && !KEY) die('Pass --org <orgId> (to mint or list) or --key <key> (to enable/disable).');

/* An empty origins list means "any site", which api/_lib/embed.js honours.
   That is right for a first test and wrong for a live installation, so it is
   refused here on the write path rather than allowed by omission. */
if (!LIST && !DISABLE && !ENABLE && !ORIGINS.length) {
  die('--origins is required when minting a key.\n'
    + 'A key with no origin allowlist runs on any website that pastes it.\n'
    + 'Give the tenant\'s own sites, comma-separated:\n'
    + '  --origins https://cleancell.us,.cleancell.us\n'
    + 'A leading dot admits the whole subdomain tree (.cleancell.us covers\n'
    + 'www. and shop.), matched on a dot boundary so evilcleancell.us does\n'
    + 'NOT match. Pass --origins "*" to deliberately allow any site.');
}
if (ORIGINS.length === 1 && ORIGINS[0] === '*') ORIGINS = [];

function mintKey() {
  return 'omega_pk_live_' + crypto.randomBytes(16).toString('hex');
}

var plannedKey = KEY || mintKey();

var doc = {
  orgId:   ORG,
  label:   LABEL || (ORG + ' storefront'),
  active:  true,
  origins: ORIGINS,
  scopes:  SCOPES
};

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  if (LIST)        console.log('  would list embed_keys where orgId == ' + ORG);
  else if (DISABLE) console.log('  would set embed_keys/' + plannedKey + '.active = false');
  else if (ENABLE)  console.log('  would set embed_keys/' + plannedKey + '.active = true');
  else {
    console.log('  embed_keys/' + plannedKey);
    console.log('  ' + JSON.stringify(doc, null, 2).split('\n').join('\n  '));
  }
  process.exit(0);
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) die('FIREBASE_SERVICE_ACCOUNT is not set.');

var admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
var db = admin.firestore(), FV = admin.firestore.FieldValue;

(async function () {
  if (LIST) {
    var q = await db.collection('embed_keys').where('orgId', '==', ORG).get();
    if (q.empty) { console.log('no keys for ' + ORG); return; }
    q.forEach(function (d) {
      var v = d.data() || {};
      console.log((v.active === false ? '  [off] ' : '  [on ] ') + d.id
        + '  ' + (v.label || '') + '  origins: ' + ((v.origins || []).join(', ') || 'ANY'));
    });
    return;
  }

  if (DISABLE || ENABLE) {
    if (!KEY) die('--key is required with --disable/--enable.');
    var ref = db.collection('embed_keys').doc(KEY);
    var s = await ref.get();
    if (!s.exists) die('no such key: ' + KEY);
    await ref.update({ active: !DISABLE, updatedAt: FV.serverTimestamp() });
    console.log((DISABLE ? 'disabled ' : 'enabled ') + KEY);
    return;
  }

  /* The tenant must already exist and must already be white-labelled. Minting
     a key for an account whose whiteLabel block is off produces a snippet
     that 403s on the customer's website, which is a worse outcome than
     refusing here — api/_lib/embed.js gates on the same flag. */
  var os = await db.collection('omega_orgs').doc(ORG).get();
  if (!os.exists) die('omega_orgs/' + ORG + ' does not exist. Seed the tenant first:\n'
    + '  node scripts/seed-omega-orgs.js --apply');
  var org = os.data() || {};
  if (!org.whiteLabel || org.whiteLabel.enabled !== true) {
    die('omega_orgs/' + ORG + ' has no whiteLabel.enabled = true.\n'
      + 'Set the whiteLabel block first (tenants/<slug>/tenant.json + seed-omega-orgs),\n'
      + 'or the snippet will 403 on the customer\'s site.');
  }

  doc.createdAt = FV.serverTimestamp();
  doc.updatedAt = FV.serverTimestamp();
  await db.collection('embed_keys').doc(plannedKey).set(doc);

  var host = (org.domains && org.domains[0]) || 'silmarillion.clearskyomega.com';
  console.log('\nwritten: embed_keys/' + plannedKey);
  console.log('  org     : ' + ORG + ' (' + (org.name || '') + ')');
  console.log('  origins : ' + (ORIGINS.join(', ') || 'ANY (no allowlist)'));
  console.log('\nGive the tenant\'s web developer these two lines:\n');
  console.log('  <div id="storefront"></div>');
  console.log('  <script src="https://' + host + '/embed/loader.js"');
  console.log('          data-key="' + plannedKey + '"');
  console.log('          data-target="#storefront" async><\/script>');
  console.log('\n⚠ ' + host + ' must be attached in Vercel and resolve, or the snippet');
  console.log('  loads nothing. See docs/WHITE-LABEL.md § Hostname.\n');
})().catch(function (e) { console.error(e); process.exit(1); });
