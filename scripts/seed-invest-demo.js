#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/seed-invest-demo.js — publish the four sample campaigns for real
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The storefront shows portals/invest/samples.js only while cf_campaigns has
   nothing live. This writes those same four as real documents (two live, one
   funded, one live) plus cf_settings/rules with the platform defaults, so
   /api/invest can quote and take pledges against them.

     FIREBASE_SERVICE_ACCOUNT='…json…' node scripts/seed-invest-demo.js          # dry run
     FIREBASE_SERVICE_ACCOUNT='…json…' node scripts/seed-invest-demo.js --apply  # write

   Never deletes. Re-running --apply merges over the same ids, and NEVER
   touches raised / unitsSold / backers on a document that already exists —
   those are the ledger's, not the seed's. Headlines are recomputed by the
   engine at write time so the card numbers are exactly what the API quotes.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
var admin = require('firebase-admin');
var IM = require(path.join(__dirname, '..', 'api', '_lib', 'invest-math.js'));
var SAMPLES = require(path.join(__dirname, '..', 'portals', 'invest', 'samples.js'));

var APPLY = process.argv.indexOf('--apply') >= 0;
var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error('FIREBASE_SERVICE_ACCOUNT is not set'); process.exit(2); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
var db = admin.firestore(), FV = admin.firestore.FieldValue;

function campaignDoc(s) {
  var c = {};
  Object.keys(s).forEach(function (k) { if (k !== 'sample' && k !== 'id') c[k] = s[k]; });
  c.headline = IM.headline(s);
  c.unitsTotal = IM.terms(s).unitsTotal;
  c.slug = s.id;
  c.seeded = true;
  c.updatedAt = FV.serverTimestamp();
  return c;
}

Promise.all(SAMPLES.map(function (s) {
  return db.collection('cf_campaigns').doc(s.id).get().then(function (snap) {
    var doc = campaignDoc(s);
    if (snap.exists) { delete doc.raised; delete doc.unitsSold; delete doc.backers; }
    else { doc.createdAt = FV.serverTimestamp(); doc.launchedAt = FV.serverTimestamp(); if (s.status === 'funded') doc.fundedAt = FV.serverTimestamp(); }
    console.log((snap.exists ? 'update ' : 'create ') + s.id + '  ' + s.status + '  goal $' + s.goal + '  yield ' + doc.headline.targetYieldPct.toFixed(2) + '%  irr ' + (doc.headline.irrPct == null ? '—' : doc.headline.irrPct.toFixed(2) + '%'));
    if (!APPLY) return null;
    return db.collection('cf_campaigns').doc(s.id).set(doc, { merge: true });
  });
})).then(function () {
  console.log('settings cf_settings/rules  ' + JSON.stringify(IM.DEFAULT_RULES));
  if (!APPLY) { console.log('\nDry run. Add --apply to write.'); return; }
  return db.collection('cf_settings').doc('rules').set(Object.assign({}, IM.DEFAULT_RULES, { updatedAt: FV.serverTimestamp() }), { merge: true })
    .then(function () { console.log('\nDone.'); });
}).catch(function (e) { console.error(e); process.exit(1); });
