#!/usr/bin/env node
/* scripts/provision-osa-member.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Puts a JV member firm's person into the OSA workspace: the sign-in account,
   and the invitation that decides their role before they arrive.

   ── WHY AN INVITE AND NOT A USER RECORD ──────────────────────────────────
   access-data.js resolve() never creates an omega_users record for somebody
   who has not signed in — the account is always made by them, on their own
   first visit, and an invite only pre-answers "as what". That is the
   difference between inviting somebody and manufacturing a login you could
   then use yourself, and firestore.rules enforces it independently.

   So this writes omega_invites/{email}. On their first sign-in they land
   ACTIVE with the role below, instead of in the approval queue waiting on a
   click from you. Without it they reach a pending screen, which to an invited
   partner reads as a broken password.

   ── WHY THE PASSWORD IS NOT IN THIS FILE ─────────────────────────────────
   This repository is PUBLIC. A password committed here is a password
   published, and rotating it afterwards does not un-publish it — it stays in
   the git history and in every clone. So it is read from the environment,
   never written to disk, never logged, and never echoed back.

   Better still, omit it: the account is then created WITHOUT a password and a
   reset link is printed for you to send, so nobody but the account holder
   ever knows it. Better again, tell them to use Google sign-in, which the
   portal offers and which needs no password at all.

   ── DRY RUN BY DEFAULT ───────────────────────────────────────────────────
   Prints the plan and writes nothing. Pass --apply to write. Existing
   accounts are never clobbered: one that already exists keeps its password
   unless --reset-password is also given.

   Usage:
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
       node scripts/provision-osa-member.js --who twarren@ogisolar.com

     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" INITIAL_PASSWORD='…' \
       node scripts/provision-osa-member.js --who twarren@ogisolar.com --apply

     …or --who all to do everyone listed below. */
'use strict';

var argv = process.argv.slice(2);
function flag(n) { return argv.indexOf(n) >= 0; }
function opt(n, d) { var i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; }

var APPLY = flag('--apply');
var RESET = flag('--reset-password');
var WHO   = String(opt('--who', '')).toLowerCase();

/* ── The roster ───────────────────────────────────────────────────────────
   A list in one file is easier to audit than an admin console, and this one
   is small on purpose: every row is a person who can see a member firm's
   pipeline.

   role is the OSA portal role from access-data.js ROLES:
     partner_admin  manages their OWN org's users, signs verdicts, sees own org
     member         works their org's assignments, signs verdicts, sees own org
     viewer         read-only on their own org
   Adoption into the shared portfolio stays with ClearSky either way — it is
   gated on write_deal, which none of these three hold.

   ⚠ orgId must be a JV domain. jvOrgs() in firestore.rules, JV_ORGS in
   access-data.js and OSA_ORGS in login.html all list the same three, and a
   fourth partner is an edit in all of them plus a rules deploy. */
var PEOPLE = [
  { email:'twarren@ogisolar.com', name:'TJ Warren',
    role:'partner_admin', orgId:'ogisolar.com', orgName:'OGI Solar',
    note:'JV counterpart for OGI Solar. First of the OGI/SUN/A3 roster.' }
];

var people = WHO === 'all' ? PEOPLE
           : PEOPLE.filter(function (p) { return p.email.toLowerCase() === WHO; });

if (!WHO) {
  console.error('usage: --who <email>|all [--apply] [--reset-password]');
  console.error('known: ' + PEOPLE.map(function (p) { return p.email; }).join(', '));
  process.exit(2);
}
if (!people.length) {
  console.error(WHO + ' is not in PEOPLE — add them there first, so the roster');
  console.error('stays the list of who has access rather than a shell history.');
  process.exit(2);
}

var PW = process.env.INITIAL_PASSWORD || '';
if (PW && PW.length < 6) {
  console.error('INITIAL_PASSWORD must be at least 6 characters (Firebase refuses shorter).');
  process.exit(2);
}

console.log('\n== OSA workspace  (orgId "osa", a JV of ClearSky, SUN Energy and OGI Solar)');
people.forEach(function (p) {
  console.log('   · ' + p.email);
  console.log('       name     ' + p.name);
  console.log('       role     ' + p.role + '   org ' + p.orgId + ' (' + p.orgName + ')');
  console.log('       invite   omega_invites/' + p.email.toLowerCase() + '  → active on first sign-in');
  console.log('       password ' + (PW ? '(from INITIAL_PASSWORD, not shown)'
                                        : 'NOT SET — a reset link is printed instead'));
});
console.log('\n   Sign-in: https://silmarillion.clearskyomega.com/login'
          + '\n   then the "OSA Workspace" tile.');

if (!APPLY) { console.log('\nDRY RUN. Nothing written. Re-run with --apply.\n'); process.exit(0); }

var raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('\nFIREBASE_SERVICE_ACCOUNT is not set. Nothing written.');
  console.error('Generate a key at:');
  console.error('  https://console.firebase.google.com/project/clearsky-portal/settings/serviceaccounts/adminsdk');
  process.exit(2);
}
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
    ['catch'](function (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      var rec = { email: p.email, displayName: p.name, emailVerified: false };
      if (PW) rec.password = PW;
      return auth.createUser(rec).then(function (u) {
        console.log('   · ' + p.email + ' created (' + u.uid + ')');
        if (PW) return u;
        return auth.generatePasswordResetLink(p.email).then(function (link) {
          console.log('     send them this to set a password: ' + link);
          return u;
        });
      });
    });
}

/* usedAt stays null. access-data.js deliberately does NOT mark an invite spent
   when it is redeemed, so re-running this is safe and a person who deletes
   their account can sign in again without a second ticket. */
function writeInvite(p) {
  return db.collection('omega_invites').doc(p.email.toLowerCase()).set({
    email: p.email.toLowerCase(),
    role: p.role,
    orgId: p.orgId,
    orgName: p.orgName || '',
    manageOrgs: [],
    note: p.note || '',
    invitedBy: 'scripts/provision-osa-member.js',
    invitedAt: new Date().toISOString(),
    usedAt: null
  }, { merge: true }).then(function () {
    console.log('     omega_invites/' + p.email.toLowerCase() + ' → ' + p.role);
  });
}

var tasks = Promise.resolve();
people.forEach(function (p) {
  tasks = tasks.then(function () { return upsertUser(p); })
               .then(function () { return writeInvite(p); });
});

tasks.then(function () {
  console.log('\nDone. They sign in at https://silmarillion.clearskyomega.com/login'
            + ' and pick "OSA Workspace".\n');
  process.exit(0);
})['catch'](function (e) {
  console.error('\nFAILED: ' + ((e && e.message) || e));
  console.error('Nothing further was written. The script is idempotent — re-run once fixed.');
  process.exit(1);
});
