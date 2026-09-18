#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/publish-tools.js — what "Import / Update Applications" would change
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   DRY RUN BY DEFAULT. Prints the diff. Pass --apply to write.

     node scripts/publish-tools.js                      # diff the whole catalog
     node scripts/publish-tools.js --only computelease  # diff one tool
     node scripts/publish-tools.js --apply              # publish all
     node scripts/publish-tools.js --apply --only computelease

   ─────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS
   ─────────────────────────────────────────────────────────────────────────
   The admin console's button publishes BLIND. It writes all forty-four tools
   in one batch and reports a count — there is no way to see, beforehand, what
   it is about to change. That is fine on the day you add a tool and know the
   catalog is otherwise untouched. It is not fine the first time somebody has
   tuned a tool's tier or description directly in Firestore, because
   `set(..., {merge:true})` protects fields that are NOT in SEED_TOOLS and
   silently reverts every field that is. Nobody finds out until a tenant loses
   access to something.

   This says what would change before anything does.

   ─────────────────────────────────────────────────────────────────────────
   ONE IMPLEMENTATION OF THE WRITE
   ─────────────────────────────────────────────────────────────────────────
   --apply does NOT reimplement the publish. It calls the same
   OMEGATools.publishToFirestore() the button calls, through a shim, because
   the Admin SDK's batch/set/FieldValue surface is the same shape as the
   compat SDK's. A second copy of the write would drift from the button within
   a month and the two would disagree about what "published" means.

   The diff, by contrast, IS this file's own — there is nothing to share it
   with, and it is pure, so scripts/test-publish-tools.js can exercise it with
   no Firestore at all.

   ─────────────────────────────────────────────────────────────────────────
   CREDENTIALS
   ─────────────────────────────────────────────────────────────────────────
     FIREBASE_SERVICE_ACCOUNT   the service-account JSON, as a string. This is
                                the house pattern — scripts/seed-omega-orgs.js
                                takes the same variable.
     otherwise                  Google Application Default Credentials, if
                                `gcloud auth application-default login` has
                                been run recently.

   ⚠ EITHER WAY THIS BYPASSES firestore.rules. The Admin SDK is a second trust
   boundary; `match /tools/{toolId} { allow write: if isAdmin() }` does not
   apply to it. The admin console button goes THROUGH the rules as a signed-in
   staff identity and is the better path for a routine publish. Use this when
   you want the diff, or when there is no browser to hand.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var path = require('path');

var APPLY = process.argv.indexOf('--apply') >= 0;
var ONLY = (function () {
  var i = process.argv.indexOf('--only');
  if (i < 0) return null;
  var keys = [];
  for (var j = i + 1; j < process.argv.length; j++) {
    if (String(process.argv[j]).indexOf('--') === 0) break;
    keys.push(process.argv[j]);
  }
  return keys.length ? keys : null;
})();

/* ── THE CATALOG ─────────────────────────────────────────────────────────
   Required, never re-declared. omega-tools.js is the one source of truth for
   what a tool IS; a script that kept its own list would be a second catalog
   and would be wrong the first time someone edited only one of them. */
var OMEGATools = require(path.join(__dirname, '..', 'omega-tools.js'));

/* The exact document publishToFirestore() would write for each tool, minus
   `updatedAt` — that is a server timestamp, it changes on every publish by
   definition, and reporting it as a difference would bury the real ones. */
function seedDocs() {
  var seeds = OMEGATools.SEED_TOOLS, out = {};
  for (var i = 0; i < seeds.length; i++) {
    var t = seeds[i], doc = {};
    for (var k in t) { if (t.hasOwnProperty(k)) doc[k] = t[k]; }
    doc.sort = i;
    out[t.key] = doc;
  }
  return out;
}

/* ── THE DIFF ────────────────────────────────────────────────────────────
   Pure. Takes the seed documents and whatever is live, returns what the
   publish would do to each. No Firestore, no network, no argv. */

/* Fields the publish always rewrites and nobody reads as content. Reporting
   them would mean every tool shows as "changed" on a catalog reorder, which
   trains the operator to skim the diff — the one thing a diff must not do. */
var NOISE = { updatedAt: true };

function stable(v) {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return JSON.stringify(v.map(function (x) { return JSON.parse(stable(x)); }));
  var keys = Object.keys(v).sort(), o = {};
  for (var i = 0; i < keys.length; i++) o[keys[i]] = JSON.parse(stable(v[keys[i]]));
  return JSON.stringify(o);
}
function same(a, b) { return stable(a) === stable(b); }

function diffOne(key, seed, live) {
  if (!live) return { key: key, state: 'new', changes: [], kept: [], orderOnly: false };

  var changes = [], f;
  for (f in seed) {
    if (!seed.hasOwnProperty(f) || NOISE[f]) continue;
    if (!same(seed[f], live[f])) changes.push({ field: f, from: live[f], to: seed[f] });
  }

  /* Fields that exist LIVE but not in the seed. merge:true keeps them, so
     they are not a change — but they are the fields somebody added by hand,
     and an operator reading this diff should know they are there and that
     they survive. */
  var kept = [];
  for (f in live) {
    if (!live.hasOwnProperty(f) || NOISE[f]) continue;
    if (!seed.hasOwnProperty(f)) kept.push(f);
  }

  var orderOnly = changes.length > 0 && changes.every(function (c) { return c.field === 'sort'; });
  return {
    key: key,
    state: changes.length ? 'changed' : 'same',
    changes: changes, kept: kept, orderOnly: orderOnly
  };
}

function diffCatalog(seeds, lives, only) {
  var keys = Object.keys(seeds), out = [];
  if (only && only.length) {
    keys = keys.filter(function (k) { return only.indexOf(k) >= 0; });
  }
  for (var i = 0; i < keys.length; i++) out.push(diffOne(keys[i], seeds[keys[i]], lives[keys[i]] || null));

  /* Live documents with no seed entry. The publish does not touch them and
     does not delete them — a tool retired from SEED_TOOLS keeps its doc and
     keeps appearing in portals. That is a finding, not a change: somebody has
     to delete it deliberately. */
  var orphans = Object.keys(lives).filter(function (k) { return !seeds[k]; });
  if (only && only.length) orphans = orphans.filter(function (k) { return only.indexOf(k) >= 0; });
  return { rows: out, orphans: orphans };
}

/* ── RENDERING ───────────────────────────────────────────────────────── */
function clip(v) {
  if (v === undefined) return '(absent)';
  var s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s == null) return String(v);
  return s.length > 88 ? s.slice(0, 85) + '…' : s;
}

function report(d, total) {
  var neu = d.rows.filter(function (r) { return r.state === 'new'; });
  var chg = d.rows.filter(function (r) { return r.state === 'changed' && !r.orderOnly; });
  var ord = d.rows.filter(function (r) { return r.orderOnly; });
  var sam = d.rows.filter(function (r) { return r.state === 'same'; });

  if (neu.length) {
    console.log('\nNEW — no document in Firestore yet:');
    neu.forEach(function (r) { console.log('  + ' + r.key); });
  }

  if (chg.length) {
    console.log('\nCHANGED — the publish would overwrite these fields:');
    chg.forEach(function (r) {
      console.log('  ~ ' + r.key);
      r.changes.forEach(function (c) {
        console.log('      ' + c.field);
        console.log('        live: ' + clip(c.from));
        console.log('        seed: ' + clip(c.to));
      });
      if (r.kept.length) console.log('      (kept, not in the seed: ' + r.kept.join(', ') + ')');
    });
  }

  if (ord.length) {
    console.log('\nORDER ONLY — `sort` moves, nothing else:');
    ord.forEach(function (r) {
      var c = r.changes[0];
      console.log('  · ' + r.key + '  ' + clip(c.from) + ' → ' + clip(c.to));
    });
  }

  /* Hand-edited fields on tools that are otherwise unchanged. merge:true
     keeps them, so they are safe TODAY — and they are the documents that will
     break the next time somebody adds that field name to SEED_TOOLS without
     knowing it already means something in Firestore. Surfaced separately from
     the changes rather than buried under them. */
  var hand = d.rows.filter(function (r) { return r.state === 'same' && r.kept.length; });
  if (hand.length) {
    console.log('\nHAND-EDITED — fields that exist only in Firestore. The publish keeps');
    console.log('them, but they are not in the catalog and nothing in the repo knows:');
    hand.forEach(function (r) { console.log('  · ' + r.key + ': ' + r.kept.join(', ')); });
  }

  if (d.orphans.length) {
    console.log('\nIN FIRESTORE, NOT IN THE CATALOG — untouched by the publish, and');
    console.log('still visible to portals until somebody deletes the document:');
    d.orphans.forEach(function (k) { console.log('  ? ' + k); });
  }

  console.log('\n' + d.rows.length + ' of ' + total + ' tools examined — '
    + neu.length + ' new, ' + chg.length + ' changed, '
    + ord.length + ' order-only, ' + sam.length + ' unchanged'
    + (d.orphans.length ? ', ' + d.orphans.length + ' orphaned' : '') + '.');

  return neu.length + chg.length + ord.length;
}

/* ── FIRESTORE ───────────────────────────────────────────────────────── */
function connect() {
  var admin = require('firebase-admin');
  var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    console.log('Credential: FIREBASE_SERVICE_ACCOUNT');
  } else {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'clearsky-portal' });
    console.log('Credential: application default (gcloud). Set FIREBASE_SERVICE_ACCOUNT to use a key instead.');
  }
  return admin;
}

function readLive(db) {
  return db.collection('tools').get().then(function (snap) {
    var out = {};
    snap.forEach(function (doc) { out[doc.id] = doc.data() || {}; });
    return out;
  });
}

/* A credential problem should say which credential and what to do about it,
   not print a stack trace about metadata plugins. */
function explain(err) {
  var msg = String((err && err.message) || err);
  if (/Cannot find module 'firebase-admin'/.test(msg)) {
    return 'firebase-admin is not installed in this checkout.\n'
      + '  Run:  npm install';
  }
  if (/invalid_rapt|invalid_grant|reauth/i.test(msg)) {
    return 'The gcloud application-default credentials have expired.\n'
      + '  Run:  gcloud auth application-default login\n'
      + '  Or set FIREBASE_SERVICE_ACCOUNT to a service-account key.';
  }
  if (/Could not load the default credentials|application default/i.test(msg)) {
    return 'No credential found.\n'
      + '  Run:  gcloud auth application-default login\n'
      + '  Or set FIREBASE_SERVICE_ACCOUNT to a service-account key.';
  }
  if (/PERMISSION_DENIED|Missing or insufficient permissions/i.test(msg)) {
    return 'That credential cannot read or write tools/.\n'
      + '  It needs Firestore access on the clearsky-portal project.';
  }
  return msg;
}

function main() {
  var seeds = seedDocs();
  var total = Object.keys(seeds).length;

  if (ONLY) {
    var unknown = ONLY.filter(function (k) { return !seeds[k]; });
    if (unknown.length) {
      console.error('No tool in the catalog has the key ' + unknown.join(', ') + '.');
      console.error('Keys: ' + Object.keys(seeds).sort().join(', '));
      process.exit(1);
    }
  }

  var admin;
  try { admin = connect(); }
  catch (e) { console.error('\n' + explain(e)); process.exit(1); }
  var db = admin.firestore();

  readLive(db).then(function (lives) {
    console.log('Live: ' + Object.keys(lives).length + ' documents in tools/.');
    var d = diffCatalog(seeds, lives, ONLY);
    var pending = report(d, total);

    if (!APPLY) {
      console.log('\nDRY RUN — nothing written. Re-run with --apply'
        + (ONLY ? ' --only ' + ONLY.join(' ') : '') + '.');
      return;
    }
    if (!pending) {
      console.log('\nNothing to publish — Firestore already matches the catalog.');
      return;
    }

    /* The button's own code path, through a shim. The Admin SDK exposes
       db.batch(), batch.set(ref, doc, {merge:true}) and FieldValue exactly as
       the compat SDK does, which is the only reason this is safe to share. */
    var shim = { firestore: { FieldValue: admin.firestore.FieldValue } };
    return OMEGATools.publishToFirestore(db, shim, ONLY).then(function (wrote) {
      return db.collection('meta').doc('tools').set({
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
        publishedBy: 'scripts/publish-tools.js',
        count: ONLY ? wrote : OMEGATools.SEED_TOOLS.length,
        partial: !!ONLY
      }, { merge: true }).then(function () {
        console.log('\nPublished ' + wrote + ' tool' + (wrote === 1 ? '' : 's') + '.'
          + (ONLY ? ' Partial publish — meta/tools records it as such.' : ''));
      });
    });
  }).catch(function (e) {
    console.error('\n' + explain(e));
    process.exit(1);
  });
}

/* For scripts/test-publish-tools.js — the pure parts, runnable with no
   network and no credential. */
module.exports._helpers = {
  seedDocs: seedDocs, diffOne: diffOne, diffCatalog: diffCatalog,
  same: same, stable: stable, clip: clip, explain: explain, NOISE: NOISE
};

if (require.main === module) main();
