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
/* --create-owners: with --apply, create an Auth account for each tenant's
   ownerEmail that has none yet (no password set), and print — and email,
   when the mail transport is configured — Firebase's set-password link. */
var CREATE_OWNERS = process.argv.indexOf('--create-owners') >= 0;
var root = path.join(__dirname, '..', 'tenants');
var seeds = fs.readdirSync(root).filter(function (d) { return fs.existsSync(path.join(root, d, 'tenant.json')); })
  .map(function (d) { var t = JSON.parse(fs.readFileSync(path.join(root, d, 'tenant.json'))); t.slug = d; return t; });

/* The tier string mirrored into tenant_public, which is the record the
   browser can read. It is NOT the entitlement - api/_lib/verify-token reads
   billing/current server-side - but it is what the account pages, the
   upgrade prompts and the admin console display.

   `deluxe` was missing from this map. The `|| 'standard'` fallback below
   meant a deluxe tenant was published as standard, silently, and Clean Cell
   is the only deluxe account on the platform, so the bug was invisible
   until somebody looked at their plan. `pro` was in the map and is used by
   no tenant; it stays only because a record may already carry it.

   An unrecognised tier now STOPS the seed. A wrong plan written confidently
   is worse than a run that refuses and names the tenant. */
var TIER_PUBLIC = { trial: 'trial', standard: 'standard', deluxe: 'deluxe',
                    pro: 'pro', enterprise: 'enterprise', internal: 'internal',
                    partner: 'partner' };
function plan(t) {
  var org = { name: t.name, slug: t.slug, domains: t.domains || [], logoUrl: t.logoUrl || '', vertical: t.vertical || null, shell: t.shell || 'default',
    status: t.status || 'active', receivesFullBom: !!t.receivesFullBom, exportBrand: t.exportBrand || { name: t.name, logo: t.logoUrl || '' } };
  var billing = { tier: t.tier || 'standard', addons: t.addons || [], toolOverrides: t.toolOverrides || {}, paymentProvider: t.paymentProvider || 'manual', trialEndsAt: t.trialEndsAt || null, subscriptionDue: t.subscriptionDue || null };
  if (!TIER_PUBLIC[billing.tier]) {
    throw new Error('tenants/' + t.slug + '/tenant.json has tier "' + billing.tier +
      '", which is not a tier this script knows how to publish. Add it to ' +
      'TIER_PUBLIC (and check api/bess-size.js agrees it is a paid tier) ' +
      'rather than letting it fall through to standard.');
  }
  var pub = { orgId: t.orgId, name: t.name, logoUrl: t.logoUrl || '', colors: t.colors || null, exportBrand: org.exportBrand, tier: TIER_PUBLIC[billing.tier],
    vertical: org.vertical, shell: org.shell, domains: org.domains, requiredTools: t.requiredTools || null, allowedEmails: t.allowedEmails || [] };
  return { orgId: t.orgId, org: org, billing: billing, pub: pub, owner: t.ownerEmail || null };
}
var plans = seeds.map(plan);
plans.forEach(function (p) { console.log('\n== ' + p.orgId + ' (' + p.org.slug + ')'); console.log('  omega_orgs:', JSON.stringify(p.org)); console.log('  billing/current:', JSON.stringify(p.billing)); console.log('  tenant_public:', p.pub.domains.join(', ') || '(no hostnames!)'); if (p.owner) console.log('  owner:', p.owner); });
/* A tenant whose orgId is still undecided (OSA, pending the JV agreement)
   cannot be a Firestore document id: .doc('') throws, and because the write
   loop is neither transactional nor guarded, that throw would abort the run
   part-way and leave the control plane half seeded. Hold those back and keep
   going, so the decided tenants seed cleanly. */
var skipped = plans.filter(function (p) { return !p.orgId || !String(p.orgId).trim(); });
plans = plans.filter(function (p) { return p.orgId && String(p.orgId).trim(); });
if (skipped.length) {
  console.log('\nSKIPPED — no orgId set (decide it in tenants/<slug>/tenant.json, then re-run):');
  skipped.forEach(function (p) { console.log('  · ' + p.org.slug + '  hosts: ' + (p.pub.domains.join(', ') || '(none)')); });
}

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
      try {
        var u = null;
        try { u = await admin.auth().getUserByEmail(p.owner); }
        catch (e0) {
          /* --create-owners: stand the owner's account up WITHOUT a password
             and hand back Firebase's own set-password link, so the person
             chooses their password and nobody here ever handles one. */
          if (!CREATE_OWNERS || !(e0 && e0.code === 'auth/user-not-found')) throw e0;
          u = await admin.auth().createUser({ email: p.owner.toLowerCase(), emailVerified: false, displayName: p.org.name });
          console.log('  owner account created (no password):', p.owner);
        }
        await mergeKeep(ref.collection('members').doc(u.uid), { email: p.owner.toLowerCase(), role: 'owner', status: 'active' });
        await admin.auth().setCustomUserClaims(u.uid, Object.assign({}, u.customClaims || {}, { orgId: p.orgId, role: 'owner' }));
        console.log('  owner set:', p.owner);
        if (CREATE_OWNERS) {
          var host = p.pub.domains[0] || (p.org.slug + '.clearskyomega.com');
          var link = await admin.auth().generatePasswordResetLink(p.owner.toLowerCase(), { url: 'https://' + host + '/' });
          console.log('  set-password link for ' + p.owner + ' (valid ~1 hour):\n    ' + link);
          try {
            var M = require('../api/_lib/mail');
            if (M && typeof M.configured === 'function' && M.configured()) {
              var html = M.layout('Your ' + p.org.name + ' workspace is ready',
                '<p>ClearSky has set up <b>' + M.esc(p.org.name) + '</b> on ClearSky-OMEGA at <b>' + M.esc(host) + '</b>.</p>'
                + '<p>Choose your password to get in. The link is good for about an hour; after that, use “Forgot password” on the sign-in page with this address.</p>'
                + M.button(link, 'Set your password')
                + '<p>Colleagues at ' + M.esc(p.orgId) + ' can sign in with their work email and will join your workspace automatically.</p>');
              var r = await M.send(p.owner.toLowerCase(), p.org.name + ' on ClearSky-OMEGA — set your password', html,
                'Your ' + p.org.name + ' workspace is ready at https://' + host + '/. Set your password: ' + link);
              console.log('  set-password email:', (r && r.ok) ? 'sent' : ('not sent — ' + ((r && (r.error || (r.skipped && 'no mailbox configured'))) || 'send failed')));
            } else console.log('  set-password email: not sent — no mail transport configured; send the link above yourself.');
          } catch (em) { console.log('  set-password email: not sent —', em.message); }
        }
      }
      catch (e) { console.log('  owner NOT set (no Auth user yet? pass --create-owners to create one):', p.owner, e.message); }
    }
    console.log('written:', p.orgId);
  }
})();
