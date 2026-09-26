/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), D = require('./_lib/firestore-double'), B = require('../api/_lib/pricebook');
var db = new D.DB(), caller, count = 0;
D.mock('../api/_lib/admin', {
  handler: function (fn) { return fn; }, authenticate: async function () { if (!caller) throw Object.assign(new Error('token'), { status: 401 }); return caller; },
  safeOrg: function (v) { return /^[a-z0-9.-]+\.[a-z]+$/.test(v) ? v : ''; }, db: function () { return db; },
  billingOf: async function (org) { return (await db.doc('omega_orgs/' + org + '/billing/current').get()).data() || {}; },
  isTenantAdmin: async function () { return caller.staff || caller.uid === 'owner'; },
  httpError: function (s, m) { return Object.assign(new Error(m), { status: s }); }
});
var api = require('../api/package-catalog');
function req(method, body) { return api({ method: method || 'POST', headers: {}, body: body || { modules: ['lite'] }, query: {} }, { setHeader: function () {} }); }
async function denied(method, body, status) { await assert.rejects(function () { return req(method, body); }, function (e) { return e.status === status; }); count++; }
async function main() {
  var b = B.proposed(); await B.seed(db, b, true);
  await denied('POST', {}, 401);
  caller = { uid: 'owner', orgId: 'example.com', staff: false, claims: { email_verified: true } };
  await denied('POST', { orgId: 'other.com', modules: ['lite'] }, 403);
  await denied('POST', { orgId: 'example.com/billing/current', modules: ['lite'] }, 403);
  db.seed('omega_orgs/example.com', { status: 'active' });
  db.seed('omega_orgs/example.com/members/owner', { role: 'owner', status: 'active' });
  await denied('GET', {}, 403); // proposed book disabled
  b.enabled = true; db.seed('pricebook/' + b.version, b);
  var out = await req(); assert.equal(out.quote.monthlyCents, 50000); count++; assert.equal(out.modules.length, 19); count++;
  assert(!JSON.stringify(out).includes('qboItemId')); count++;
  await denied('POST', { modules: ['lite'], monthlyCents: 1 }, 400);
  await denied('POST', { modules: ['lite'], serviceFee: { mode: 'waived', reason: 'Forged' } }, 400);
  await denied('POST', { modules: ['lite'], credit: { pct: 100 } }, 400);
  await denied('DELETE', {}, 405);
  caller.claims.email_verified = false; await denied('GET', {}, 403); caller.claims.email_verified = true;
  db.seed('omega_orgs/example.com/members/owner', { status: 'disabled' }); await denied('GET', {}, 403);
  caller.staff = true; out = await req(); assert.equal(out.quote.monthlyCents, 50000); count++;
  assert.equal(db.data.has('omega_orgs/example.com/billing/current'), false); count++;
  caller.staff = false; db.seed('omega_orgs/example.com', { status: 'suspended' }); await denied('GET', {}, 403);
  console.log('Package catalog authorization: ' + count + ' passed; no network calls.');
}
main().catch(function (e) { console.error(e); process.exitCode = 1; });
