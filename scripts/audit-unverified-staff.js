#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/audit-unverified-staff.js — READ-ONLY. Who stops being staff?

   Staff by email domain now needs a VERIFIED email (api/_lib/verify-token.js,
   api/_lib/admin.js authenticate(), isAdmin() in firestore.rules,
   isAdminDomain() in storage.rules). A real ClearSky person on an
   @clearsky-usa.com PASSWORD account that never
   confirmed its address loses staff the moment that ships. Google sign-in on
   that Workspace domain is always verified, so this lists the password
   accounts that are not — run it before the rules deploy and fix each one
   (confirm the address, or sign in with Google) rather than find out from a
   403.

   Lists email, providers, last sign-in and whether a role:'staff' custom
   claim keeps the account staff anyway. Writes nothing.

   --all lists EVERY staff-domain account, verified or not, with whether it
   is staff now: the answer to "who is staff, and has X got an account yet?"

   Credentials: FIREBASE_SERVICE_ACCOUNT, else your `firebase login`
   (scripts/_lib/live-admin.js).

   node scripts/audit-unverified-staff.js [--all] */
'use strict';
var path = require('path'), ROOT = path.join(__dirname, '..');
var A = require(path.join(ROOT, 'api/_lib/admin'));
require('./_lib/live-admin')(A);

var ALL = process.argv.indexOf('--all') >= 0;

async function main() {
  var auth = A.init().auth(), rows = [], seen = 0, page;
  do {
    var r = await auth.listUsers(1000, page);
    r.users.forEach(function (u) {
      seen++;
      if (!u.email || !A.isStaffEmail(u.email)) return;
      if (!ALL && u.emailVerified === true) return;
      var claim = !!(u.customClaims && u.customClaims.role === 'staff');
      rows.push(ALL ? {
        email: u.email,
        verified: u.emailVerified === true,
        staff: !u.disabled && (u.emailVerified === true || claim),
        providers: (u.providerData || []).map(function (p) { return p.providerId; }).join(',') || '(none)',
        lastSignIn: (u.metadata && u.metadata.lastSignInTime) || 'never',
        disabled: u.disabled === true
      } : {
        email: u.email,
        providers: (u.providerData || []).map(function (p) { return p.providerId; }).join(',') || '(none)',
        lastSignIn: (u.metadata && u.metadata.lastSignInTime) || 'never',
        disabled: u.disabled === true,
        keepsStaffByClaim: claim
      });
    });
    page = r.pageToken;
  } while (page);

  console.log('Scanned ' + seen + ' accounts.');
  if (ALL) {
    rows.sort(function (a, b) { return a.email < b.email ? -1 : 1; });
    console.log(rows.length + ' @clearsky-usa.com account(s); staff = verified (or a role:staff claim):');
    console.table(rows);
    return;
  }
  if (!rows.length) { console.log('No unverified @clearsky-usa.com accounts. Nobody loses staff.'); return; }
  console.log(rows.length + ' unverified staff-domain account(s) — these are NOT staff once the change ships' +
              ' (unless keepsStaffByClaim):');
  console.table(rows);
}
main().then(function () { process.exit(0); }, function (e) { console.error(e && e.message || e); process.exit(1); });
