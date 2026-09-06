#!/usr/bin/env node
/* scripts/seed-omega-orgs.js — create omega_orgs/{orgId}, billing/current and
   tenant_public/{host} for every tenant, from tenants/<slug>/tenant.json.
   DRY RUN BY DEFAULT. Prints what it would write. Pass --apply to write.
   Never overwrites a field that already has a value (merge, existing wins)
   unless --force.
   Usage: FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/seed-omega-orgs.js [--apply] [--force] */
'use strict';
var fs = require('fs'), path = require('path');
var APPLY = process.argv.indexOf('--apply') >= 0, FORCE = process.argv.indexOf('--force') >= 0;
var root = path.join(__dirname, '..', 'tenants');
var seeds = fs.readdirSync(root).filter(function (d) { return fs.existsSync(path.join(root, d, 'tenant.json')); })
  .map(function (d) { var t = JSON.parse(fs.readFileSync(path.join(root, d, 'tenant.json'))); t.slug = d; return t; });

var TIER_PUBLIC = { trial: 'trial', standard: 'standard', pro: 'pro', enterprise: 'enterprise', internal: 'internal', partner: 'partner' };
function plan(t) {
  var org = { name: t.name, slug: t.slug, domains: t.domains || [], logoUrl: t.logoUrl || '', vertical: t.vertical || null, shell: t.shell || 'default',
    status: t.status || 'active', receivesFullBom: !!t.receivesFullBom, exportBrand: t.exportBrand || { name: t.name, logo: t.logoUrl || '' } };
  var billing = { tier: t.tier || 'standard', addons: t.addons || [], toolOverrides: t.toolOverrides || {}, paymentProvider: t.paymentProvider || 'manual', trialEndsAt: t.trialEndsAt || null, subscriptionDue: t.subscriptionDue || null };
  var pub = { orgId: t.orgId, name: t.name, logoUrl: t.logoUrl || '', colors: t.colors || null, exportBrand: org.exportBrand, tier: TIER_PUBLIC[billing.tier] || 'standard',
    vertical: org.vertical, shell: org.shell, domains: org.domains, requiredTools: t.requiredTools || null, allowedEmails: t.allowedEmails || [] };
  return { orgId: t.orgId, org: org, billing: billing, pub: pub, owner: t.ownerEmail || null };
}
var plans = seeds.map(plan);
plans.forEach(function (p) { console.log('\n== ' + p.orgId + ' (' + p.org.slug + ')'); console.log('  omega_orgs:', JSON.stringify(p.org)); console.log('  billing/current:', JSON.stringify(p.billing)); console.log('  tenant_public:', p.pub.domains.join(', ') || '(no hostnames!)'); if (p.owner) console.log('  owner:', p.owner); });
if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }

var admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
var db = admin.firestore(), FV = admin.firestore.FieldValue;
function mergeKeep(ref, data) { return ref.get().then(function (s) { var cur = s.exists ? s.data() : {}; var out = {}; Object.keys(data).forEach(function (k) { if (FORCE || cur[k] === undefined || cur[k] === null || cur[k] === '') out[k] = data[k]; }); out.updatedAt = FV.serverTimestamp(); if (!s.exists) out.createdAt = FV.serverTimestamp(); return ref.set(out, { merge: true }); }); }
(async function () {
  for (var i = 0; i < plans.length; i++) {
    var p = plans[i], ref = db.collection('omega_orgs').doc(p.orgId);
    await mergeKeep(ref, p.org);
    await mergeKeep(ref.collection('billing').doc('current'), p.billing);
    for (var h = 0; h < p.pub.domains.length; h++) await mergeKeep(db.collection('tenant_public').doc(String(p.pub.domains[h]).toLowerCase()), p.pub);
    if (p.owner) {
      try { var u = await admin.auth().getUserByEmail(p.owner); await mergeKeep(ref.collection('members').doc(u.uid), { email: p.owner.toLowerCase(), role: 'owner', status: 'active' }); await admin.auth().setCustomUserClaims(u.uid, Object.assign({}, u.customClaims || {}, { orgId: p.orgId, role: 'owner' })); console.log('  owner set:', p.owner); }
      catch (e) { console.log('  owner NOT set (no Auth user yet?):', p.owner, e.message); }
    }
    console.log('written:', p.orgId);
  }
})();
