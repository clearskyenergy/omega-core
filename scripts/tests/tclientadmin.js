/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   admin.clientAdmin(): who may act on a workspace's plan and billing WITHOUT a
   verified email (Tommy, 2026-09-27: "to opt in, we shouldn't need to verify
   email... they are already a client and customer").

   An owner or administrator of an ACTIVE client: the role on members/{uid}
   vouches for them, because only a person grants it (Team, the admin console,
   set-role). Never a plain member, never a disabled one, never another org's
   workspace, never one that is pending, suspended or has no record. Staff are
   decided elsewhere (a verified ClearSky domain, tstaffverified.js).

   firebase-admin is intercepted at load: CI runs this with no npm install.

   node scripts/tests/tclientadmin.js */
'use strict';
const path = require('path'), Module = require('module');
const ROOT = path.join(__dirname, '..', '..');

let fails = 0, passes = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else { passes++; console.log('  ok   ' + m); } }

/* a Firestore of plain paths: omega_orgs/{org} and its members/{uid} */
const DOCS = {};
function ref(p) {
  return { get: async () => ({ exists: Object.prototype.hasOwnProperty.call(DOCS, p), data: () => DOCS[p] }),
    collection: (c) => col(p + '/' + c) };
}
function col(p) { return { doc: (id) => ref(p + '/' + id) }; }
const FAKE = { apps: [{}], initializeApp() {}, credential: { cert() {} }, auth: () => ({}), firestore: () => ({ collection: (c) => col(c) }) };
const load = Module._load;
Module._load = function (request) { return request === 'firebase-admin' ? FAKE : load.apply(this, arguments); };
let A;
try { A = require(path.join(ROOT, 'api/_lib/admin.js')); } finally { Module._load = load; }

function caller(uid, org, extra) { return Object.assign({ uid: uid, email: uid + '@' + org, orgId: org, staff: false, claims: { email_verified: false } }, extra || {}); }

(async function () {
  console.log('api/_lib/admin.js clientAdmin()');
  DOCS['omega_orgs/concord.example'] = { name: 'Concord', status: 'active' };
  DOCS['omega_orgs/concord.example/members/owner'] = { role: 'owner', status: 'active' };
  DOCS['omega_orgs/concord.example/members/admin'] = { role: 'admin', status: 'active' };
  DOCS['omega_orgs/concord.example/members/member'] = { role: 'member', status: 'active' };
  DOCS['omega_orgs/concord.example/members/gone'] = { role: 'admin', status: 'disabled' };
  DOCS['omega_orgs/newco.example'] = { name: 'Newco', status: 'pending' };
  DOCS['omega_orgs/newco.example/members/owner'] = { role: 'owner', status: 'active' };
  DOCS['omega_orgs/paused.example'] = { name: 'Paused', status: 'suspended' };
  DOCS['omega_orgs/paused.example/members/owner'] = { role: 'owner', status: 'active' };
  DOCS['omega_orgs/norecord.example/members/owner'] = { role: 'owner', status: 'active' };

  ok(await A.clientAdmin(caller('owner', 'concord.example'), 'concord.example') === true, 'an unverified owner of an active client may act on its plan');
  ok(await A.clientAdmin(caller('admin', 'concord.example'), 'concord.example') === true, 'so may an unverified administrator (a Team invitation makes its account unverified)');
  ok(await A.clientAdmin(caller('member', 'concord.example'), 'concord.example') === false, 'a plain member may not: the role is what vouches');
  ok(await A.clientAdmin(caller('gone', 'concord.example'), 'concord.example') === false, 'nor a disabled administrator');
  ok(await A.clientAdmin(caller('stranger', 'concord.example'), 'concord.example') === false, 'nor someone with no member record (a self-made account on the domain)');
  ok(await A.clientAdmin(caller('owner', 'concord.example'), 'newco.example') === false, 'nor anyone for another organization');
  ok(await A.clientAdmin(caller('owner', 'newco.example'), 'newco.example') === false, 'a workspace still pending approval is not a client yet');
  ok(await A.clientAdmin(caller('owner', 'paused.example'), 'paused.example') === false, 'a suspended workspace is not an active client');
  ok(await A.clientAdmin(caller('owner', 'norecord.example'), 'norecord.example') === false, 'a workspace with no record is not a known client');
  ok(await A.clientAdmin(caller('ops', 'clearsky-usa.com', { staff: true }), 'concord.example') === true, 'staff are decided by caller.staff, as isTenantAdmin does');

  console.log('\ntclientadmin: ' + passes + ' passed, ' + fails + ' failed');
  if (fails) process.exit(1);
})().catch(function (e) { console.error(e); process.exit(1); });
