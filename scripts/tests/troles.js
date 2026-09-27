/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * api/_lib/roles.js: who needs the email link (2026-09-27). An owner or
 * administrator manages their own workspace's plan and billing without it;
 * a member, another org and everything that claims a domain or opens data
 * still ask for it. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path');
var R = require('../../api/_lib/roles');
var root = path.join(__dirname, '../..'), count = 0;
function ok(c, m) { assert.ok(c, m); count++; }
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
/* the endpoints' own isTenantAdmin, as api/_lib/admin.js reads the member record */
var ROLES = { owner: 'owner', admin: 'admin', member: 'member', off: 'admin' };
function isTenantAdmin(c, o) { return Promise.resolve(c.staff || (c.orgId === o && (ROLES[c.uid] === 'owner' || ROLES[c.uid] === 'admin') && c.uid !== 'off')); }
function who(uid, verified, org) { return { uid: uid, orgId: org || 'acme.example', staff: false, claims: { email_verified: verified } }; }

(async function () {
  /* verified is the literal true, nothing else */
  ok(R.verified(who('member', true)), 'a verified address');
  ok(!R.verified(who('member', 'true')) && !R.verified(who('member', false)) && !R.verified(who('member')) && !R.verified(null), 'a string, false or absent is not verified');
  ok(R.verified({ staff: true, claims: {} }), 'staff (authenticate() makes staff only on a verified address)');

  /* settled: the plan and billing doors */
  ok(await R.settled(who('owner', false), 'acme.example', isTenantAdmin), 'the owner acts without the link');
  ok(await R.settled(who('admin', false), 'acme.example', isTenantAdmin), 'an administrator acts without the link');
  ok(!(await R.settled(who('member', false), 'acme.example', isTenantAdmin)), 'a member is asked for the link');
  ok(!(await R.settled(who('off', false), 'acme.example', isTenantAdmin)), 'a switched-off administrator is asked for it');
  ok(!(await R.settled(who('owner', false), 'other.example', isTenantAdmin)), 'an owner of one workspace is nobody in another');
  ok(await R.settled(who('member', true), 'acme.example', isTenantAdmin), 'a verified member passes the address question (the endpoint still checks the role)');
  ok(!(await R.settled(who('owner', false), 'acme.example')), 'no isTenantAdmin to ask: asked for the link');
  ok(!(await R.settled(who('owner', false), '', isTenantAdmin)), 'no org: asked for the link');

  /* the doors that use it, and the ones that still ask for the link */
  ['api/plan-change.js', 'api/package-catalog.js', 'api/subscription-proposal.js'].forEach(function (f) {
    ok(/R\.settled\(caller, [a-zA-Z]+, A\.isTenantAdmin\)/.test(read(f)), f + ' asks the one rule');
  });
  ['api/billing-profile.js', 'api/tenant-package.js'].forEach(function (f) {
    var s = read(f); ok(!/email_verified/.test(s) && /A\.isTenantAdmin\(caller, orgId\)/.test(s), f + ': a tenant administrator, by role');
  });
  ok(/if \(!verified\) throw A\.httpError\(403, 'verify your email address first/.test(read('api/tenant-signup.js')), 'creating a workspace (it claims a domain) still needs the link');
  ok(/deny\('Verified email required'\)/.test(read('api/_lib/package-access.js')), 'the packaged tools still need it');
  ok(/Verify your email first/.test(read('api/_lib/logic-access.js')), 'Omega Logic still needs it');
  ok(/dec\.email_verified === true && isStaffEmail\(email\)/.test(read('api/_lib/admin.js')), 'ClearSky staff still need it');
  ok(/function tenantReader\(o\) \{\s*return signedIn\(\)\s*&& request\.auth\.token\.get\('email_verified', false\) == true/.test(read('firestore.rules')), 'the rules still keep an unverified address out of orders and plant records');

  console.log('roles: ' + count + ' checks. An owner or administrator manages their own plan and billing without the email link; members, other orgs, signup, the tools, Omega Logic and staff still ask for it.');
})().catch(function (e) { console.error(e); process.exit(1); });
