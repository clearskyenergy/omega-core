#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/test-logic-workspaces.js — the Omega Logic front door: sign in to
   Omega Logic, then /api/logic-workspaces says which company is yours. It
   must list exactly what the office endpoints would admit, and nothing else.
     node scripts/test-logic-workspaces.js */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock, db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; },
  /* the same rule as api/_lib/admin.js canActInOrg */
  canActInOrg: async function (c, org) { if (c.staff) return true; if (c.orgId === org) return true; var s = await db.collection('org_members').doc(String(c.email).toLowerCase()).get(); return s.exists && s.data().active !== false && s.data().orgId === org; } };
mock('../api/_lib/admin', A);
var ws = require('../api/logic-workspaces');
function who(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], staff: false, claims: { email_verified: true } }, extra || {}); }
function get(caller) { return ws({ method: 'GET', query: {}, caller: caller }, { setHeader: function () {} }); }
function workspace(org, name, extra) {
  db.seed('omega_orgs/' + org, Object.assign({ name: name, status: 'active', omegaLogic: true }, extra || {}));
  db.seed('omega_orgs/' + org + '/billing/current', { addons: ['omega-logic'], status: 'active' });
}
var count = 0; async function test(n, f) { await f(); count++; console.log('PASS ' + n); }
function seed() {
  db = new DB();
  workspace('cleancell.us', 'Clean Cell'); workspace('joules.example', 'Joules');
  db.seed('omega_orgs/cleancell.us/members/ops', { email: 'ops@cleancell.us', role: 'admin', status: 'active' });
  db.seed('omega_orgs/cleancell.us/members/gone', { email: 'gone@cleancell.us', role: 'member', status: 'disabled' });
  db.seed('omega_orgs/joules.example/members/pat', { email: 'pat@partner.example', role: 'member', status: 'active' });
  db.seed('org_members/pat@partner.example', { orgId: 'joules.example', active: true });
  db.seed('omega_orgs/notlogic.example', { name: 'Not on Logic', status: 'active' });
}
(async function () {
  console.log('\nthe Omega Logic front door');
  await test('a member of one workspace is sent straight to it, with their role', async function () {
    seed(); var d = await get(who('ops@cleancell.us'));
    assert.equal(d.owner, false); assert.deepEqual(d.workspaces.map(function (w) { return [w.orgId, w.name, w.role]; }), [['cleancell.us', 'Clean Cell', 'admin']]);
  });
  await test('someone with a cross-company grant sees that company (and only what they are a member of)', async function () {
    seed(); var d = await get(who('pat@partner.example'));
    assert.deepEqual(d.workspaces.map(function (w) { return w.orgId; }), ['joules.example']);
  });
  await test('nowhere to go is said plainly: not a member, turned off, or not subscribed', async function () {
    seed(); var none = await get(who('stranger@cleancell.us'));
    assert.equal(none.workspaces.length, 0); assert.equal(none.reason, 'none'); assert.match(none.note, /administrator/);
    assert.equal((await get(who('gone@cleancell.us'))).workspaces.length, 0, 'a disabled member is not listed');
    db.seed('omega_orgs/cleancell.us/billing/current', { addons: [], status: 'active' });
    assert.equal((await get(who('ops@cleancell.us'))).workspaces.length, 0, 'no Omega Logic subscription, not listed');
    assert.equal((await get(who('ops@gmail.com'))).workspaces.length, 0);
  });
  await test('an unverified email is asked to verify, and nothing is listed', async function () {
    seed(); var d = await get(who('ops@cleancell.us', { claims: { email_verified: false } }));
    assert.equal(d.reason, 'verify'); assert.equal(d.workspaces.length, 0);
  });
  await test('ClearSky staff who are not the owner get nothing from their staff flag', async function () {
    seed(); assert.equal((await get(who('rep@csebuilders.com', { staff: true }))).workspaces.length, 0);
  });
  await test('the ClearSky owner sees every Omega Logic workspace and picks', async function () {
    seed(); var d = await get(who('tom@clearsky-usa.com'));
    assert.equal(d.owner, true); assert.deepEqual(d.workspaces.map(function (w) { return w.orgId; }).sort(), ['cleancell.us', 'joules.example']);
  });
  await test('the owner\'s list is every Omega Logic workspace, however many other company records there are', async function () {
    seed(); for (var i = 0; i < 650; i++) db.seed('omega_orgs/a' + String(i).padStart(4, '0') + '.example', { name: 'Signup ' + i, status: 'pending' });
    workspace('zz-late.example', 'Late Logic Co');
    var d = await get(who('tom@clearsky-usa.com'));
    assert.ok(d.workspaces.some(function (w) { return w.orgId === 'zz-late.example'; }), 'a workspace sorting after 650 others is listed'); assert.equal(d.limited, false);
  });
  await test('both office pages open on the one sign-in, and the app address carries no company', async function () {
    var root = path.join(__dirname, '..'), app = fs.readFileSync(path.join(root, 'office/app.html'), 'utf8'), desk = fs.readFileSync(path.join(root, 'omega-logic.html'), 'utf8');
    assert.ok(/src="\/omega-logic-signin\.js"/.test(app) && /src="\/omega-logic-signin\.js"/.test(desk));
    assert.ok(!/Open the app once from your office link/.test(app), 'the old dead end is gone');
    var mf = JSON.parse(fs.readFileSync(path.join(root, 'office/app.webmanifest'), 'utf8')); assert.equal(mf.start_url, '/office/app'); assert.equal(mf.id, '/office/app');
    var v = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')); assert.ok(v.redirects.some(function (r) { return r.source === '/logic' && r.destination === '/office/app'; }));
  });
  console.log('\n' + count + ' front door checks passed. No network calls.\n');
})().catch(function (e) { console.error(e); process.exit(1); });
