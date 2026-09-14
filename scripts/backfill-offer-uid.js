#!/usr/bin/env node
/* scripts/backfill-offer-uid.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Put `uid`, `dealId` and `dealName` on offers written before they were
   stored as fields.

   WHY. An offer lives at fin_projects/{deal}/offers/{uid}. The uid was only
   ever the document id, which a collection-group query cannot filter on — so
   "every offer I have made" could not be asked, and a capital partner's
   dashboard reported zero offers to somebody who had made several. The portal
   writes all three fields now; this fills them in behind it.

   Derives uid from the document id, which is what it has always been. Writes
   nothing else and overwrites nothing that already has a value.

   DRY RUN BY DEFAULT.
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/backfill-offer-uid.js
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/backfill-offer-uid.js --apply */
'use strict';
var APPLY = process.argv.indexOf('--apply') >= 0;
var raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT is not set.'); process.exit(2); }

var admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
var db = admin.firestore();

var scanned = 0, needed = 0, written = 0, skipped = 0;

db.collection('fin_projects').get().then(function (deals) {
  var chain = Promise.resolve();
  deals.forEach(function (deal) {
    chain = chain.then(function () {
      return deal.ref.collection('offers').get().then(function (offers) {
        var inner = Promise.resolve();
        offers.forEach(function (o) {
          scanned++;
          var d = o.data() || {};
          var patch = {};
          if (!d.uid) patch.uid = o.id;                 /* the id always WAS the uid */
          if (!d.dealId) patch.dealId = deal.id;
          if (!d.dealName) patch.dealName = (deal.data() || {}).name || deal.id;
          if (!Object.keys(patch).length) { skipped++; return; }
          needed++;
          console.log('  ' + (APPLY ? 'write ' : 'would ')
                      + deal.id + '/offers/' + o.id + '  ' + JSON.stringify(patch));
          if (!APPLY) return;
          inner = inner.then(function () {
            return o.ref.set(patch, { merge: true }).then(function () { written++; });
          });
        });
        return inner;
      });
    });
  });
  return chain;
}).then(function () {
  console.log('\nscanned ' + scanned + ' offer(s) · ' + needed + ' need fields · '
              + skipped + ' already complete' + (APPLY ? ' · ' + written + ' written' : ''));
  if (!APPLY && needed) console.log('DRY RUN. Re-run with --apply to write.');
  process.exit(0);
}).catch(function (e) {
  console.error('FAILED: ' + (e && e.message));
  console.error('Partial progress is safe to re-run — every write merges and skips completed rows.');
  process.exit(1);
});
