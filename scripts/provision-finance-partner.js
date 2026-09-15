#!/usr/bin/env node
/* scripts/provision-finance-partner.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Stand up a capital partner: the tenant record, the finance-portal org, the
   sign-in accounts and their pre-approved partner profiles.

   ── WHY THE PASSWORD IS NOT IN THIS FILE ──
   This repository is PUBLIC. A password committed here is a password
   published, and rotating it afterwards does not un-publish it — it stays in
   the git history and in every clone and mirror. So the initial password is
   read from the environment and never written to disk, never logged, and
   never echoed back. If INITIAL_PASSWORD is unset the script creates the
   accounts WITHOUT a password and prints a reset link for each, which is the
   better default anyway: nobody but the account holder ever knows it.

   ── DRY RUN BY DEFAULT ──
   Prints the plan and writes nothing. Pass --apply to write. Existing
   accounts are never clobbered: an account that already exists keeps its
   password unless --reset-password is also given.

   Usage:
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
       node scripts/provision-finance-partner.js --tenant helios
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" INITIAL_PASSWORD='…' \
       node scripts/provision-finance-partner.js --tenant helios --apply

   Reads tenants/<slug>/tenant.json for everything except the people, who are
   listed in PEOPLE below — a partner's analysts change more often than their
   entitlements, and a list in one file is easier to audit than a console. */
'use strict';
var fs = require('fs'), path = require('path');

var argv = process.argv.slice(2);
function flag(n) { return argv.indexOf(n) >= 0; }
function opt(n, d) { var i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; }

var APPLY = flag('--apply');
var RESET = flag('--reset-password');
var SLUG = opt('--tenant', '');
if (!SLUG) { console.error('usage: --tenant <slug> [--apply] [--reset-password]'); process.exit(2); }

var seedPath = path.join(__dirname, '..', 'tenants', SLUG, 'tenant.json');
if (!fs.existsSync(seedPath)) { console.error('no tenant seed at ' + seedPath); process.exit(2); }
var T = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
var FP = T.financePartner;
if (!FP || !FP.orgKey) { console.error(SLUG + ' has no financePartner.orgKey'); process.exit(2); }

/* The people, per tenant. Role is the finance-portal role, not the OMEGA one:
   'partner' reviews and offers, 'admin' also administers the portal. */
var PEOPLE = {
  helios: [
    { email: 'tye.dawson@heliosnrgy.com',    name: 'Tye Dawson',    role: 'partner' },
    { email: 'jack.degiulio@heliosnrgy.com', name: 'Jack DeGiulio', role: 'partner' },
    { email: 'admin@heliosnrgy.com',         name: 'Helios Admin',  role: 'admin'   }
  ]
};
var people = PEOPLE[SLUG];
if (!people) { console.error('no people listed for ' + SLUG + ' — add them to PEOPLE'); process.exit(2); }

var PW = process.env.INITIAL_PASSWORD || '';
if (PW && PW.length < 6) { console.error('INITIAL_PASSWORD must be at least 6 characters'); process.exit(2); }

console.log('\n== ' + T.name + '  (' + T.orgId + ')');
console.log('   finance org : fin_orgs/' + FP.orgKey + '  "' + (FP.orgName || T.name) + '"');
console.log('   tenant      : omega_orgs/' + T.orgId + '  tier=' + (T.tier || 'standard')
            + '  tools=' + JSON.stringify(T.requiredTools || []));
console.log('   accounts    :');
people.forEach(function (p) {
  console.log('     ' + p.email + '   role=' + p.role
              + '   password=' + (PW ? '(from INITIAL_PASSWORD)' : 'NOT SET — reset link printed'));
});
if (!APPLY) { console.log('\nDRY RUN. Nothing written. Re-run with --apply.\n'); process.exit(0); }

var raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('\nFIREBASE_SERVICE_ACCOUNT is not set. Nothing written.'); process.exit(2); }
var admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
var auth = admin.auth(), db = admin.firestore();

function upsertUser(p) {
  return auth.getUserByEmail(p.email)
    .then(function (u) {
      console.log('   · ' + p.email + ' exists (' + u.uid + ')');
      if (RESET && PW) return auth.updateUser(u.uid, { password: PW }).then(function () {
        console.log('     password reset'); return u;
      });
      return u;
    })
    .catch(function (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      var rec = { email: p.email, displayName: p.name, emailVerified: false };
      if (PW) rec.password = PW;
      return auth.createUser(rec).then(function (u) {
        console.log('   · ' + p.email + ' created (' + u.uid + ')');
        if (PW) return u;
        return auth.generatePasswordResetLink(p.email).then(function (link) {
          console.log('     set a password: ' + link);
          return u;
        });
      });
    });
}

/* approved:true is the whole point of provisioning: a self-signed-up profile
   is created unapproved and sees nothing until an administrator says so.
   orgKey is what scopes their deal room, their offers and their entitlements. */
function writeProfile(u, p) {
  return db.collection('fin_profiles').doc(u.uid).set({
    email: p.email, emailLower: p.email.toLowerCase(), name: p.name,
    role: p.role, orgKey: FP.orgKey, org: FP.orgName || T.name,
    /* THE OMEGA ORG ID, alongside the finance slug (2026-09-14).
       A delivery is addressed with room.forOrgId — the OMEGA org id that
       api/dealroom-open.js is handed — while a finance profile only carried
       orgKey, the finance slug. They are different strings for the same
       organisation, so "deals fielded to my org" could not be expressed:
       the rule had nothing on the profile to compare a delivery against.
       Writing both here is what makes deliveredToMyOrg in firestore.rules
       resolvable. Partners provisioned before this need a re-run; without
       orgId their deal room is empty rather than wrong, which is the safe
       direction. */
    orgId: T.orgId,
    approved: true, suspended: false,
    provisionedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(function () { console.log('     fin_profiles/' + u.uid + ' → ' + p.role); });
}

var tasks = db.collection('fin_orgs').doc(FP.orgKey).set({
  name: FP.orgName || T.name, orgId: T.orgId, active: true,
  tier: T.tier || 'partner'
}, { merge: true }).then(function () { console.log('   · fin_orgs/' + FP.orgKey); })

.then(function () {
  return db.collection('omega_orgs').doc(T.orgId).set({
    name: T.name, slug: SLUG, domains: T.domains || [], vertical: T.vertical || null,
    shell: T.shell || 'default', status: T.status || 'active',
    logoUrl: T.logoUrl || '', receivesFullBom: !!T.receivesFullBom,
    financeOrgKey: FP.orgKey
  }, { merge: true });
}).then(function () { console.log('   · omega_orgs/' + T.orgId); })

.then(function () {
  return db.collection('omega_orgs').doc(T.orgId).collection('billing').doc('current').set({
    tier: T.tier || 'partner', addons: T.addons || [], toolOverrides: T.toolOverrides || {},
    paymentProvider: 'manual'
  }, { merge: true });
}).then(function () { console.log('   · billing/current'); })

/* omega_partner_orgs is what the OSA portfolio reads. Without a row here with
   kind:'investor' and jd.active:true the partner does not appear in the "Send
   to deal room" chooser at all — capitalPartners() filters on exactly those
   two — so a deal cannot be routed to them however well the rest is set up. */
.then(function () {
  if (!FP.kind) return null;
  return db.collection('omega_partner_orgs').doc(T.orgId).set({
    name: FP.orgName || T.name, orgId: T.orgId, kind: FP.kind, active: true,
    jd: { active: !!FP.jdActive, handoff: FP.handoff || '' },
    financeOrgKey: FP.orgKey
  }, { merge: true }).then(function () {
    console.log('   · omega_partner_orgs/' + T.orgId + '  kind=' + FP.kind
                + '  jd.active=' + !!FP.jdActive);
  });
});

people.forEach(function (p) {
  tasks = tasks.then(function () { return upsertUser(p); }).then(function (u) { return writeProfile(u, p); });
});

tasks.then(function () {
  console.log('\nDone. Sign-in: https://' + (T.domains[0] || 'silmarillion.clearskyomega.com') + '/\n');
  process.exit(0);
}).catch(function (e) {
  console.error('\nFAILED: ' + (e && e.message));
  console.error('Nothing further was written. Re-run once the cause is fixed — the script is idempotent.');
  process.exit(1);
});
