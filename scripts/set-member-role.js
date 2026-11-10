#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/set-member-role.js — give one person a role in a workspace, from
   the command line, through the ONE members writer (api/_lib/logic-members.js
   change(): audited, an owner never touched by an admin, the last owner
   never demoted).
     node scripts/set-member-role.js --org nextnrg.com --email test@nextnrg.com --role admin
   Roles: owner | admin | member | viewer. Credentials as intake-order.js:
   FIREBASE_SERVICE_ACCOUNT, else the Firebase CLI's signed-in account
   (`firebase login`). The caller recorded is the ClearSky owner. */
'use strict';
var path = require('path'), ROOT = path.join(__dirname, '..');
var args = process.argv.slice(2);
function arg(k) { var i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; }
var org = String(arg('--org') || '').toLowerCase(), email = String(arg('--email') || '').toLowerCase(), role = arg('--role');
if (!org || !email || !role) { console.error('usage: node scripts/set-member-role.js --org <domain> --email <person> --role owner|admin|member|viewer'); process.exit(2); }
var A = require(path.join(ROOT, 'api/_lib/admin')); require(path.join(ROOT, 'scripts/_lib/live-admin'))(A);
var L = require(path.join(ROOT, 'api/_lib/logic-members')), LA = require(path.join(ROOT, 'api/_lib/logic-admin'));
(async function () {
  var request = typeof LA.memberRequest === 'function' ? LA.memberRequest({ email: email, role: role })
    : { email: email, role: role, status: null, resetLink: false, name: '', sendMail: false };
  var orgDoc = await A.db().collection('omega_orgs').doc(org).get();
  if (!orgDoc.exists) throw new Error('No workspace record for ' + org);
  var name = (orgDoc.data() || {}).name || org, host = ((orgDoc.data() || {}).domains || [])[0] || 'silmarillion.clearskyomega.com';
  var out = await L.change({ orgId: org, orgName: name, host: host, by: 'tom@clearsky-usa.com', actor: 'clearsky', via: 'logic-admin', request: request, reveal: false, mailNew: false, audit: true });
  console.log(JSON.stringify(out).slice(0, 300));
  var m = await A.db().collection('omega_orgs').doc(org).collection('members').where('email', '==', email).get();
  m.docs.forEach(function (d) { var v = d.data(); console.log('now: ' + v.email + ' is ' + v.role + ' (' + v.status + ') in ' + org); });
  process.exit(0);
})().catch(function (e) { console.error('FAILED: ' + (e.status ? e.status + ' ' : '') + e.message); process.exit(1); });
