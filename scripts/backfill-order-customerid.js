#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/backfill-order-customerid.js — tie orders written before
   `customerId` was stamped to the customer ACCOUNT they belong to, so every
   person on that account (not just the one it is billed to) sees them, and
   custody follows the account.

     node scripts/backfill-order-customerid.js --org cleancell.us           # dry run
     node scripts/backfill-order-customerid.js --org cleancell.us --apply   # write

   An order is stamped only when ALL of these hold:
     - it has no customerId,
     - it was not typed by an anonymous visitor (source 'embed' or
       'config-link': an email typed on a public page proves nothing),
     - its customer.email has a customer_index pointer in the same org,
     - that account exists and is not suspended or superseded,
     - the account ADMITTED that person (B.admitted: not a join request still
       waiting or turned down) — the same rule api/orders.js stamps by.
   Everything else is reported and left alone. Never deletes; every write is
   recorded in omega_audit. The portal's account reader also finds unstamped
   orders by the account's admitted people, but custody, QuickBooks and the
   office's account view follow the stamp: run this once per workspace after
   deploying account stamping. */
'use strict';
var path = require('path'), ROOT = path.join(__dirname, '..');
var args = process.argv.slice(2), APPLY = args.indexOf('--apply') >= 0, org = String(args[args.indexOf('--org') + 1] || '').toLowerCase();
if (args.indexOf('--org') < 0 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(org)) { console.error('usage: node scripts/backfill-order-customerid.js --org <orgId> [--apply]'); process.exit(2); }
var A = require(path.join(ROOT, 'api/_lib/admin'));
require('./_lib/live-admin')(A);

(async function () {
  var db = A.db(), root = db.collection('omega_orgs').doc(org), rows = await db.collection('orders').where('orgId', '==', org).limit(2000).get();
  var B = require(path.join(ROOT, 'api/_lib/buyer-accounts'));
  var plan = [], skipped = { stamped: 0, anonymous: 0, noEmail: 0, noAccount: 0, inactive: 0, notAdmitted: 0 };
  for (var i = 0; i < rows.docs.length; i++) {
    var d = rows.docs[i], o = d.data() || {}, e = String((o.customer || {}).email || '').trim().toLowerCase();
    if (o.customerId) { skipped.stamped++; continue; }
    if (['embed', 'config-link'].indexOf(o.source) >= 0) { skipped.anonymous++; continue; }
    if (!e) { skipped.noEmail++; continue; }
    var ptr = await root.collection('customer_index').doc(e).get();
    if (!ptr.exists) { skipped.noAccount++; continue; }
    var cid = String(ptr.data().customerId || ''), acct = cid ? await root.collection('customers').doc(cid).get() : null;
    if (!acct || !acct.exists || acct.data().supersededBy || acct.data().mergedInto || ['suspended', 'disabled', 'cancelled'].indexOf(acct.data().status) >= 0) { skipped.inactive++; continue; }
    var person = await root.collection('customers').doc(cid).collection('users').doc(e).get();
    if (!person.exists || !B.admitted(person.data())) { skipped.notAdmitted++; continue; }
    plan.push({ id: d.id, orderNo: o.orderNo || d.id, email: e, customerId: cid, company: acct.data().name || '' });
  }
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' · ' + org + ' · ' + rows.size + ' orders read' + (rows.size === 2000 ? ' (first 2000)' : ''));
  plan.forEach(function (p) { console.log('  ' + p.orderNo + '  ' + p.email + '  →  ' + p.company + ' (' + p.customerId + ')'); });
  console.log('  to stamp: ' + plan.length + ' · left alone: ' + JSON.stringify(skipped));
  if (!APPLY || !plan.length) return;
  var now = new Date().toISOString();
  for (var j = 0; j < plan.length; j++) {
    var p = plan[j];
    await db.runTransaction(async function (tx) {
      var ref = db.collection('orders').doc(p.id), s = await tx.get(ref);
      if (!s.exists || s.data().customerId) return;
      tx.update(ref, { customerId: p.customerId });
      tx.create(db.collection('omega_audit').doc(), { action: 'order-account-backfill', orgId: org, orderId: p.id, customerId: p.customerId, email: p.email, by: 'scripts/backfill-order-customerid.js', at: now });
    });
  }
  console.log('  stamped ' + plan.length + '.');
})().catch(function (e) { console.error(e); process.exit(1); });
