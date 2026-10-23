#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/apply-concord-terms.js — Concord Energy's negotiated terms
   (Tommy, 2026-10-01): 50% off the $1,299 plan for the rest of the 12-month
   contract, paid up through October, next payment due 2026-10-03, full
   access (Enterprise).

   The same write POST /api/tenant-billing makes from the account page: the
   allow-listed keys merged onto omega_orgs/{org}/billing/current, a staff
   write of amountDue releasing any stripeDueHold, and one history row with
   what changed and what it was. Nothing is deleted.

   DRY RUN BY DEFAULT. Prints the record and the change. --apply writes.
   Usage: FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/apply-concord-terms.js [--apply] */
'use strict';
var APPLY = process.argv.indexOf('--apply') >= 0;
var ORG = 'concordenergyusa.com';
var BY = 'thomasmgilmer@gmail.com (scripts/apply-concord-terms.js)';
var PATCH = {
  tier: 'enterprise',          // full access: every tool and every Site Map tab
  amountDue: 649.5,            // half of $1,299
  subscriptionDue: '2026-10-03'
};
var REASON = 'Negotiated: 50% off $1,299/month for the remainder of the 12-month contract; paid up through October; next due 2026-10-03; full access.';

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set (the clearsky-portal service account JSON).');
  process.exit(1);
}
var admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
var db = admin.firestore(), FV = admin.firestore.FieldValue;
var ref = db.collection('omega_orgs').doc(ORG).collection('billing').doc('current');

(async function () {
  var org = await db.collection('omega_orgs').doc(ORG).get();
  if (!org.exists) throw new Error('omega_orgs/' + ORG + ' does not exist; nothing written');
  var snap = await ref.get(), before = snap.exists ? snap.data() : {};
  if (before.packaged === true) throw new Error('billing/current is packaged; use the Package panel, not this script');

  var patch = Object.assign({}, PATCH);
  if (before.stripeDueHold) patch.stripeDueHold = null;
  var was = {};
  Object.keys(patch).forEach(function (k) { was[k] = before[k] === undefined ? null : before[k]; });

  console.log('omega_orgs/' + ORG + ' status:', org.data().status || '(none)');
  console.log('before:', JSON.stringify(was));
  console.log('after: ', JSON.stringify(patch));
  if (before.stripeDue && before.stripeDue.state && before.stripeDue.state !== 'paid') {
    console.warn('NOTE: a Stripe invoice for the plan is ' + before.stripeDue.state + ' (' + before.stripeDue.invoiceId + ', ' +
      (before.stripeDue.amountCents / 100) + '). If it is the old $1,299, void it in Stripe so it is not shown as owed.');
  }
  if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); return; }

  patch.updatedAt = FV.serverTimestamp();
  patch.updatedBy = BY;
  await ref.set(patch, { merge: true });
  await ref.collection('history').add({ at: FV.serverTimestamp(), by: BY, changed: patch, was: was, reason: REASON });
  console.log('\nWritten.');
})().catch(function (e) { console.error(e.message || e); process.exit(1); });
