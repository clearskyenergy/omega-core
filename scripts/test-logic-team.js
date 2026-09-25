#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-logic-team.js — a workspace runs its own people
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   D2 (2026-09-24): a workspace's owner or admin adds and disables its own
   office and plant staff from the Team page (api/logic-team.js), through
   the ONE member writer ClearSky's console uses (api/_lib/logic-members.js):
   an owner may do anything; an admin works up to admin and never touches
   an owner nor makes one; nobody is deleted; the last active owner is never
   disabled or re-roled; every change is logged with who, was and now; and
   nobody outside what logic-access.authorize admits can be added.

   Against the in-memory Firestore double and a stub of Firebase Auth and
   mail. No network.

     NODE_PATH=node_modules node scripts/test-logic-team.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;

function noUndefined(v, where) {
  if (v === undefined) throw new Error('undefined written at ' + where);
  if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndefined(v[k], where + '.' + k); });
}
['set', 'update', 'create'].forEach(function (m) { var real = FD.Ref.prototype[m]; FD.Ref.prototype[m] = function (v, o) { noUndefined(v, this.path); return real.call(this, v, o); }; });

var db, users = {}, claims = {}, links = [], mails = [], created = [];
var A = { db: function () { return db; }, safeOrg: function (v) { v = String(v == null ? '' : v).toLowerCase(); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : ''; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, orgOf: function (e) { return String(e || '').toLowerCase().split('@')[1] || ''; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; },
  canActInOrg: async function (c, org) { if (c.staff || c.orgId === org) return true; var g = await db.collection('org_members').doc(String(c.email).toLowerCase()).get(); return g.exists && g.data().active !== false && g.data().orgId === org; },
  isTenantAdmin: async function (c, o) { return c.staff || c.orgId === o; },
  FieldValue: function () { return { serverTimestamp: function () { return 'TS'; }, arrayUnion: function () { return Array.prototype.slice.call(arguments); } }; },
  init: function () { return { auth: function () { return {
    getUserByEmail: async function (e) { if (!users[e]) { var err = new Error('no user'); err.code = 'auth/user-not-found'; throw err; } return users[e]; },
    getUser: async function (uid) { var hit = Object.keys(users).filter(function (e) { return users[e].uid === uid; })[0]; if (!hit) { var err = new Error('no user'); err.code = 'auth/user-not-found'; throw err; } return users[hit]; },
    createUser: async function (o) { created.push(o.email); users[o.email] = { uid: 'u_' + o.email, email: o.email, customClaims: {} }; return users[o.email]; },
    setCustomUserClaims: async function (uid, c) { claims[uid] = c; },
    generatePasswordResetLink: async function (e, o) { var l = 'https://reset.test/' + e + '?continue=' + encodeURIComponent(o && o.url || ''); links.push(l); return l; } }; } }; } };
mock('../api/_lib/admin', A);
mock('../api/_lib/mail', { configured: function () { return true; }, send: async function (to, subject, html, text) { mails.push({ to: to, subject: subject, html: html, text: text }); return { ok: true }; },
  layout: function (t, b) { return '<h1>' + t + '</h1>' + b; }, button: function (h, l) { return '<a href="' + h + '">' + l + '</a>'; }, esc: function (s) { return String(s).replace(/</g, '&lt;'); }, templates: {} });

var team = require('../api/logic-team'), admin = require('../api/logic-admin'), X = require('../api/_lib/logic-access'), setRole = require('../api/set-role');
var fs = require('fs'), path = require('path');

var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG;
function person(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], staff: false, claims: { email_verified: true } }, extra || {}); }
var CLEARSKY = person('tom@clearsky-usa.com', { uid: 'tom', staff: true });
var OWNER = person('boss@cleancell.us'), ADMIN = person('office@cleancell.us'), ADMIN2 = person('plant@cleancell.us'), MEMBER = person('floor@cleancell.us'), VIEWER = person('look@cleancell.us');
var GONE = person('gone@cleancell.us'), OTHER_ADMIN = person('admin@othercorp.example'), STAFF = person('rep@csebuilders.com', { staff: true });
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; } };
function post(body, caller) { return team({ method: 'POST', body: Object.assign({ org: ORG, action: 'member' }, body), caller: caller }, res); }
function get(caller, org) { return team({ method: 'GET', query: { org: org || ORG }, caller: caller }, res); }
async function rejects(p, status, re) {
  try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; }
  throw new Error('expected a ' + status + (re ? ' ' + re : ''));
}
function member(uid) { return db.data.get(O + '/members/' + uid); }
function roster(org) { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf('omega_orgs/' + (org || ORG) + '/members/') === 0; }); }
function audits() { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf(O + '/admin_audit/') === 0; }).map(function (k) { return db.data.get(k); }); }
function lastAudit() { return audits().sort(function (a, b) { return a.at < b.at ? 1 : -1; })[0]; }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

function seed() {
  db = new DB(); claims = {}; links = []; mails = []; created = [];
  users = {}; [OWNER, ADMIN, ADMIN2, MEMBER, VIEWER, GONE, OTHER_ADMIN].forEach(function (p) { users[p.email] = { uid: p.uid, email: p.email, customClaims: { orgId: p.orgId } }; });
  users['helper@othercorp.example'] = { uid: 'helper', email: 'helper@othercorp.example', customClaims: { orgId: 'othercorp.example', role: 'member' } };
  db.seed(O, { name: 'Clean Cell', slug: 'cleancell', domains: ['cleancell.clearskyomega.com'], status: 'active', vertical: 'oem', omegaLogic: true });
  db.seed(O + '/billing/current', { addons: ['omega-logic'], status: 'active' });
  db.seed(O + '/fulfillment/config', { enabled: true, accounting: 'tenant' });
  db.seed(O + '/members/boss', { email: OWNER.email, role: 'owner', status: 'active', name: 'Pat Owner' });
  db.seed(O + '/members/office', { email: ADMIN.email, role: 'admin', status: 'active' });
  db.seed(O + '/members/plant', { email: ADMIN2.email, role: 'admin', status: 'active' });
  db.seed(O + '/members/floor', { email: MEMBER.email, role: 'member', status: 'active' });
  db.seed(O + '/members/look', { email: VIEWER.email, role: 'viewer' });
  db.seed(O + '/members/gone', { email: GONE.email, role: 'member', status: 'disabled' });
  /* ClearSky's own admin rows on the same trail: never shown to a tenant */
  db.seed(O + '/admin_audit/0000000000001_a', { action: 'storefront', orgId: ORG, by: CLEARSKY.email, at: '2026-09-01T00:00:00Z', changed: { capexPerKwh: 310 }, was: { capexPerKwh: 290 } });
  db.seed('omega_orgs/othercorp.example', { name: 'Other Corp', status: 'active', vertical: 'oem' });
  db.seed('omega_orgs/othercorp.example/billing/current', { addons: ['omega-logic'] });
  db.seed('omega_orgs/othercorp.example/members/admin', { email: OTHER_ADMIN.email, role: 'admin', status: 'active' });
  db.seed('omega_orgs/othercorp.example/members/helper', { email: 'helper@othercorp.example', role: 'member', status: 'active' });
}

async function main() {
  console.log('\nwho sees what');
  await test('1 · everybody on the workspace reads the team; only an owner or admin gets controls, the log and roles to assign', async function () {
    seed();
    var m = await get(MEMBER);
    assert.equal(m.manage, false); assert.deepEqual(m.assignable, []); assert.deepEqual(m.log, []); assert.equal(m.role, 'member');
    assert.equal(m.people.length, 6); assert.ok(m.people.every(function (p) { return !p.can.role && !p.can.disable && !p.can.enable; }));
    assert.ok(m.people.every(function (p) { return p.uid === undefined; }), 'no uids leave the server');
    assert.equal((await get(VIEWER)).manage, false);
    var a = await get(ADMIN);
    assert.equal(a.manage, true); assert.deepEqual(a.assignable, ['admin', 'member', 'viewer']);
    var boss = a.people.filter(function (p) { return p.email === OWNER.email; })[0];
    assert.deepEqual(boss.can, { role: false, disable: false, enable: false }, 'an admin gets no control on an owner'); assert.equal(boss.lastOwner, true);
    var floor = a.people.filter(function (p) { return p.email === MEMBER.email; })[0]; assert.deepEqual(floor.can, { role: true, disable: true, enable: false });
    var gone = a.people.filter(function (p) { return p.email === GONE.email; })[0]; assert.deepEqual(gone.can, { role: true, disable: false, enable: true });
    assert.equal(a.people.filter(function (p) { return p.you; })[0].email, ADMIN.email);
    var o = await get(OWNER);
    assert.deepEqual(o.assignable, ['owner', 'admin', 'member', 'viewer']);
    assert.deepEqual(o.people.filter(function (p) { return p.email === OWNER.email; })[0].can, { role: false, disable: false, enable: false }, 'the only owner cannot be re-roled or disabled, even by themselves');
    var sky = await get(CLEARSKY); assert.equal(sky.manage, true); assert.equal(sky.role, 'clearsky'); assert.equal(sky.owner, true);
    await rejects(get(GONE), 403);
  });

  console.log('\nadding people');
  await test('2 · an owner adds an administrator: a new sign-in, the workspace claims, an emailed link that never reaches the owner, and the log', async function () {
    seed();
    var r = await post({ email: 'New.Lead@cleancell.us', name: 'New Lead', role: 'admin' }, OWNER);
    assert.equal(r.ok, true); assert.equal(r.account, 'created'); assert.equal(r.role, 'admin'); assert.equal(r.status, 'active');
    assert.equal(r.resetLink, undefined, 'no set-password link in the response'); assert.ok(JSON.stringify(r).indexOf('reset.test') < 0);
    assert.equal(r.mail, 'sent'); assert.equal(mails.length, 1); assert.equal(mails[0].to, 'new.lead@cleancell.us');
    assert.match(mails[0].text, /boss@cleancell\.us added you to Clean Cell on Omega Logic/); assert.match(links[0], /continue=https%3A%2F%2Fsilmarillion\.clearskyomega\.com%2Flogic/);
    var doc = member('u_new.lead@cleancell.us');
    assert.equal(doc.role, 'admin'); assert.equal(doc.status, 'active'); assert.equal(doc.name, 'New Lead'); assert.equal(doc.invitedBy, OWNER.email); assert.equal(doc.updatedBy, OWNER.email);
    assert.deepEqual(claims['u_new.lead@cleancell.us'], { orgId: ORG, role: 'admin' });
    var a = lastAudit();
    assert.equal(a.action, 'member'); assert.equal(a.via, 'team'); assert.equal(a.by, OWNER.email); assert.equal(a.email, 'new.lead@cleancell.us');
    assert.equal(a.was, null); assert.deepEqual(a.now, { role: 'admin', status: 'active' }); assert.ok(!isNaN(Date.parse(a.at)));
  });
  await test('3 · an owner adds a member who already has a sign-in: no new account, no mail unasked, a plain note', async function () {
    seed(); users['jo@cleancell.us'] = { uid: 'jo', email: 'jo@cleancell.us', customClaims: {} };
    var r = await post({ email: 'jo@cleancell.us', role: 'member' }, OWNER);
    assert.equal(r.account, 'existing'); assert.equal(r.mail, null); assert.equal(mails.length, 0); assert.equal(created.length, 0);
    assert.match(r.note, /already has an Omega Logic sign-in/); assert.equal(member('jo').role, 'member');
  });
  await test('4 · an administrator adds up to administrator, and never an owner', async function () {
    seed();
    assert.equal((await post({ email: 'bench1@cleancell.us', role: 'member' }, ADMIN)).role, 'member');
    assert.equal((await post({ email: 'auditor@cleancell.us', role: 'viewer' }, ADMIN)).role, 'viewer');
    assert.equal((await post({ email: 'ops2@cleancell.us', role: 'admin' }, ADMIN)).role, 'admin');
    var before = roster().length, made = created.length;
    await rejects(post({ email: 'crown@cleancell.us', role: 'owner' }, ADMIN), 403, /Only an owner can make somebody an owner/);
    await rejects(post({ email: MEMBER.email, role: 'owner' }, ADMIN), 403, /Only an owner/);
    assert.equal(roster().length, before); assert.equal(created.length, made, 'a refused invitation creates no sign-in'); assert.equal(member('floor').role, 'member');
  });

  console.log('\nchanging and disabling');
  await test('5 · an administrator never touches an owner', async function () {
    seed(); db.seed(O + '/members/boss2', { email: 'boss2@cleancell.us', role: 'owner', status: 'disabled' });
    await rejects(post({ email: OWNER.email, role: 'admin' }, ADMIN), 403, /Only an owner can change or disable an owner/);
    await rejects(post({ email: OWNER.email, status: 'disabled' }, ADMIN), 403, /owner/);
    await rejects(post({ email: 'boss2@cleancell.us', status: 'active' }, ADMIN), 403, /owner/, 'nor re-enables a disabled one');
    assert.equal(member('boss').role, 'owner'); assert.equal(member('boss').status, 'active'); assert.equal(member('boss2').status, 'disabled');
  });
  await test('6 · an administrator disables another administrator; the log has was → now, and the disabled person is out', async function () {
    seed();
    var ctx = await X.authorize(ADMIN2, ORG, true); assert.equal(ctx.member.role, 'admin');
    var r = await post({ email: ADMIN2.email, status: 'disabled' }, ADMIN);
    assert.equal(r.status, 'disabled'); assert.equal(member('plant').status, 'disabled'); assert.equal(member('plant').role, 'admin', 'a status change keeps the role'); assert.equal(member('plant').updatedBy, ADMIN.email);
    var a = lastAudit(); assert.equal(a.by, ADMIN.email); assert.deepEqual(a.was, { role: 'admin', status: 'active' }); assert.deepEqual(a.now, { role: 'admin', status: 'disabled' }); assert.equal(a.via, 'team');
    await rejects(X.authorize(ADMIN2, ORG, false), 403, /active OEM member/);
    await rejects(post({ email: MEMBER.email, status: 'disabled' }, ADMIN2), 403);
    await post({ email: ADMIN2.email, status: 'active' }, ADMIN);
    assert.equal(member('plant').status, 'active'); assert.deepEqual(lastAudit().was, { role: 'admin', status: 'disabled' });
    await post({ email: MEMBER.email, role: 'viewer' }, ADMIN);
    assert.equal(member('floor').role, 'viewer'); assert.deepEqual(lastAudit().was, { role: 'member', status: 'active' }); assert.deepEqual(lastAudit().now, { role: 'viewer', status: 'active' });
  });
  await test('7 · the last active owner is never disabled or re-roled — from the Team page or from ClearSky\'s console', async function () {
    seed();
    await rejects(post({ email: OWNER.email, status: 'disabled' }, OWNER), 409, /last active owner/);
    await rejects(post({ email: OWNER.email, role: 'admin' }, OWNER), 409, /last active owner/);
    await rejects(admin({ method: 'POST', body: { action: 'member', org: ORG, email: OWNER.email, role: 'member' }, caller: CLEARSKY }, res), 409, /last active owner/);
    assert.equal(member('boss').role, 'owner'); assert.equal(member('boss').status, 'active');
    await post({ email: ADMIN.email, role: 'owner' }, OWNER);
    assert.equal(member('office').role, 'owner');
    await post({ email: OWNER.email, status: 'disabled' }, ADMIN);
    assert.equal(member('boss').status, 'disabled', 'with a second owner, an owner may be disabled');
    await rejects(post({ email: ADMIN.email, status: 'disabled' }, ADMIN), 409, /last active owner/);
  });
  await test('8 · nobody is deleted', async function () {
    seed(); var before = roster().length;
    await rejects(post({ action: 'delete', email: MEMBER.email }, OWNER), 400, /Nobody is deleted/);
    await rejects(post({ action: 'remove', email: MEMBER.email }, OWNER), 400, /Nobody is deleted/);
    await rejects(post({ action: 'purge', email: MEMBER.email }, OWNER), 400, /action must be member/);
    await post({ email: MEMBER.email, status: 'disabled' }, OWNER);
    await post({ email: 'temp@cleancell.us', role: 'member' }, OWNER); await post({ email: 'temp@cleancell.us', status: 'disabled' }, OWNER);
    assert.equal(roster().length, before + 1, 'every record is still there'); assert.ok(member('floor'));
    assert.equal(team.length, 2); assert.equal(require('../api/_lib/logic-members').remove, undefined, 'the writer has no delete');
  });

  console.log('\nnobody from outside');
  await test('9 · another workspace\'s people, and anybody outside the domain without ClearSky\'s grant, are unreachable', async function () {
    seed(); var otherBefore = JSON.stringify(roster('othercorp.example').map(function (k) { return db.data.get(k); }));
    await rejects(post({ email: 'helper@othercorp.example', role: 'member' }, ADMIN), 403, /outside cleancell\.us/);
    await rejects(post({ email: 'somebody@gmail.com', role: 'member' }, OWNER), 403, /outside cleancell\.us/);
    await rejects(post({ email: 'tom@clearsky-usa.com', role: 'viewer' }, OWNER), 403, /outside/);
    db.seed('org_members/helper@othercorp.example', { orgId: 'othercorp.example', active: true });
    await rejects(post({ email: 'helper@othercorp.example', role: 'member' }, OWNER), 403, /outside/, 'a grant for another workspace is not a grant here');
    db.seed('org_members/contractor@gmail.com', { orgId: ORG, active: false });
    await rejects(post({ email: 'contractor@gmail.com', role: 'member' }, OWNER), 403, /outside/, 'a revoked grant is no grant');
    await rejects(post({ email: 'helper@othercorp.example', status: 'disabled' }, OWNER), 404, /not a member of this workspace/);
    assert.equal(JSON.stringify(roster('othercorp.example').map(function (k) { return db.data.get(k); })), otherBefore, 'the other workspace is untouched');
    assert.equal(claims.helper, undefined);
    /* the other workspace's admin cannot open this team at all; nor can ClearSky staff who are not the owner account */
    await rejects(get(OTHER_ADMIN), 403, /Not your OEM workspace/);
    await rejects(post({ email: 'x@cleancell.us', role: 'member' }, OTHER_ADMIN), 403, /Not your OEM workspace/);
    await rejects(get(STAFF), 403); await rejects(post({ email: 'x@cleancell.us', role: 'member' }, STAFF), 403);
    assert.equal(created.length, 0, 'no sign-in was made for anybody refused');
  });
  await test('10 · somebody ClearSky has already granted into THIS workspace can be added, and keeps their own sign-in claims', async function () {
    seed(); db.seed('org_members/contractor@gmail.com', { orgId: ORG, active: true });
    users['contractor@gmail.com'] = { uid: 'contractor', email: 'contractor@gmail.com', customClaims: { orgId: 'gmail.com' } };
    var r = await post({ email: 'contractor@gmail.com', role: 'member' }, ADMIN);
    assert.equal(r.account, 'existing'); assert.equal(member('contractor').role, 'member'); assert.equal(claims.contractor, undefined, 'claims are only ever set for the workspace\'s own domain');
    var row = (await get(ADMIN)).people.filter(function (p) { return p.email === 'contractor@gmail.com'; })[0]; assert.equal(row.outside, true);
  });
  await test('11 · a member or viewer changes nothing', async function () {
    seed(); var before = JSON.stringify(roster().map(function (k) { return db.data.get(k); }));
    await rejects(post({ email: 'x@cleancell.us', role: 'member' }, MEMBER), 403);
    await rejects(post({ email: MEMBER.email, status: 'disabled' }, VIEWER), 403);
    await rejects(post({ email: VIEWER.email, role: 'admin' }, VIEWER), 403);
    assert.equal(JSON.stringify(roster().map(function (k) { return db.data.get(k); })), before); assert.equal(created.length, 0);
  });

  console.log('\nthe record');
  await test('12 · the log shows member changes only — never ClearSky\'s storefront or cost-basis rows — newest first', async function () {
    seed();
    await post({ email: 'first@cleancell.us', role: 'member' }, ADMIN);
    await new Promise(function (r) { setTimeout(r, 5); });
    await post({ email: 'first@cleancell.us', role: 'viewer' }, OWNER);
    var d = await get(ADMIN);
    assert.equal(d.log.length, 2); assert.ok(d.log.every(function (a) { return a.email === 'first@cleancell.us'; }));
    assert.ok(JSON.stringify(d).indexOf('capexPerKwh') < 0, 'no cost basis');
    assert.equal(d.log[0].by, OWNER.email); assert.deepEqual(d.log[0].was, { role: 'member', status: 'active' }); assert.deepEqual(d.log[0].now, { role: 'viewer', status: 'active' });
    assert.equal(d.log[1].by, ADMIN.email); assert.equal(d.log[1].was, null);
    /* a row ClearSky's console wrote before rows carried `was` says so rather than claiming a new person */
    db.seed(O + '/admin_audit/0000000000002_b', { action: 'member', orgId: ORG, by: CLEARSKY.email, at: '2026-09-02T00:00:00Z', email: MEMBER.email, role: 'member', status: 'active', account: 'existing' });
    var old = (await get(ADMIN)).log.filter(function (a) { return a.at === '2026-09-02T00:00:00Z'; })[0];
    assert.equal(old.was, 'unrecorded'); assert.deepEqual(old.now, { role: 'member', status: 'active' });
  });
  await test('13 · a set-password link asked for from the Team page goes to the person, never to the caller', async function () {
    seed();
    var r = await post({ email: MEMBER.email, resetLink: true }, ADMIN);
    assert.equal(r.resetLink, undefined); assert.ok(JSON.stringify(r).indexOf('reset.test') < 0);
    assert.equal(mails.length, 1); assert.equal(mails[0].to, MEMBER.email); assert.equal(r.account, 'unchanged');
    assert.equal(audits().filter(function (a) { return a.action === 'member'; }).length, 0, 'a link changes nothing, so nothing is logged');
    await rejects(post({ email: 'nobody', role: 'member' }, OWNER), 400, /email/);
    await rejects(post({ email: 'a@cleancell.us', role: 'god' }, OWNER), 400, /role/);
    await rejects(post({ email: 'x<script>@cleancell.us', role: 'member' }, OWNER), 400, /real email/);
    await rejects(post({ email: 'x@cleancell', role: 'member' }, OWNER), 400, /email/);
    assert.equal((await post({ email: "o'brien@cleancell.us", role: 'member' }, OWNER)).role, 'member', 'a real address with an apostrophe is fine');
  });
  await test('14 · ClearSky may do anything here too, and its console still reveals the link to staff', async function () {
    seed();
    var r = await post({ email: 'second.owner@cleancell.us', role: 'owner' }, CLEARSKY);
    assert.equal(r.role, 'owner'); assert.equal(lastAudit().via, 'team'); assert.equal(lastAudit().by, CLEARSKY.email);
    var c = await admin({ method: 'POST', body: { action: 'member', org: ORG, email: 'third@cleancell.us', role: 'member' }, caller: CLEARSKY }, res);
    assert.match(c.resetLink, /^https:\/\/reset\.test\//); assert.equal(lastAudit().via, 'logic-admin'); assert.equal(lastAudit().was, null);
    await rejects(admin({ method: 'POST', body: { action: 'member', org: ORG, email: 'third@cleancell.us', role: 'member' }, caller: OWNER }, res), 403, /ClearSky owner/, 'ClearSky\'s console stays ClearSky\'s');
  });
  console.log('\nno way round the one writer (D2-RULES-BYPASS)');
  await test('15 · two owners disabling each other at the same moment: one wins, the other is refused, the workspace keeps an owner, one log row', async function () {
    seed(); db.serial = true;
    db.seed(O + '/members/office', { email: ADMIN.email, role: 'owner', status: 'active' });
    var r = await Promise.allSettled([post({ email: ADMIN.email, status: 'disabled' }, OWNER), post({ email: OWNER.email, status: 'disabled' }, ADMIN)]);
    var won = r.filter(function (x) { return x.status === 'fulfilled'; }), lost = r.filter(function (x) { return x.status === 'rejected'; });
    assert.equal(won.length, 1, 'exactly one of the two changes goes through'); assert.equal(lost.length, 1);
    assert.equal(lost[0].reason.status, 409); assert.match(lost[0].reason.message, /last active owner/);
    assert.equal([member('boss'), member('office')].filter(function (d) { return d.status !== 'disabled'; }).length, 1, 'one owner is still active');
    assert.equal(audits().filter(function (a) { return a.action === 'member'; }).length, 1, 'the refused change left no log row');
  });
  await test('16 · /api/set-role is a door to the same writer: the last owner stays, a disabled admin is refused, an admin never touches an owner, and every change is logged', async function () {
    seed(); var res2 = { headers: {}, setHeader: function () {} };
    function role(body, caller) { return setRole({ method: 'POST', body: Object.assign({ orgId: ORG }, body), caller: caller }, res2); }
    await rejects(role({ targetUid: 'boss', role: 'owner', status: 'disabled' }, OWNER), 409, /last active owner/);
    await rejects(role({ targetUid: 'boss', role: 'admin' }, OWNER), 409, /last active owner/);
    assert.equal(member('boss').status, 'active'); assert.equal(member('boss').role, 'owner');
    await rejects(role({ targetUid: 'boss', role: 'admin' }, ADMIN), 403, /owner/);
    var out = await role({ targetEmail: MEMBER.email, role: 'viewer' }, ADMIN);
    assert.equal(out.role, 'viewer'); assert.equal(member('floor').role, 'viewer'); assert.equal(member('floor').status, 'active', 'a role change keeps the status');
    var a = lastAudit(); assert.equal(a.via, 'set-role'); assert.equal(a.by, ADMIN.email); assert.deepEqual(a.was, { role: 'member', status: 'active' }); assert.deepEqual(a.now, { role: 'viewer', status: 'active' });
    db.seed(O + '/members/plant', { email: ADMIN2.email, role: 'admin', status: 'disabled' });
    await rejects(role({ targetEmail: MEMBER.email, role: 'admin' }, ADMIN2), 403, /not permitted/);
    await rejects(role({ targetEmail: MEMBER.email, role: 'admin' }, MEMBER), 403, /not permitted/);
    assert.equal(member('floor').role, 'viewer');
  });
  await test('17 · the rules leave no browser write to a member record beyond joining as a member and one\'s own name (the endpoints hold the last owner and the log)', function () {
    var rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    var block = rules.slice(rules.indexOf('match /members/{uid} {'), rules.indexOf('allow delete: if false;', rules.indexOf('match /members/{uid} {')));
    var create = block.slice(block.indexOf('allow create:'), block.indexOf('allow update:')), update = block.slice(block.indexOf('allow update:'));
    assert.ok(!/isTenantAdmin|isTenantOwner/.test(create), 'no tenant admin or owner create'); assert.ok(!/isTenantAdmin|isTenantOwner/.test(update), 'no tenant admin or owner update');
    assert.match(create, /^allow create: if isAdmin\(\)\s*\|\| \(isSelfHere\(\)/); assert.match(create, /get\('role', 'member'\) == 'member'/); assert.match(create, /get\('status', 'active'\) == 'active'/);
    assert.match(update, /^allow update: if isAdmin\(\)\s*\|\| \(isSelfHere\(\) && selfSafeFields\(\)\);/, 'the whole update rule: ClearSky, or your own name');
  });
  await test('18 · a disabled person reads no order, works order, unit or scan straight from Firestore, and nor does an unverified email (D2-DISABLE)', function () {
    var rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    var helper = rules.slice(rules.indexOf('function tenantReader(o) {'), rules.indexOf('}', rules.indexOf('function tenantReader(o) {')));
    assert.match(helper, /request\.auth\.token\.get\('email_verified', false\) == true/); assert.match(helper, /o == userOrg\(\) && tMemberEnabled\(userOrg\(\)\)/);
    ['orders/{orderId}', 'plant_works_orders/{woId}', 'plant_units/{unitId}', 'plant_scans/{scanId}'].forEach(function (m) {
      var at = rules.indexOf('match /' + m + ' {'), read = rules.slice(rules.indexOf('allow read:', at), rules.indexOf(';', rules.indexOf('allow read:', at)));
      assert.match(read, /tenantReader\(resource\.data\.get\('orgId', ''\)\)/, m); assert.ok(!/== userOrg\(\)/.test(read), m + ' reads through tenantReader only');
    });
    var page = fs.readFileSync(path.join(__dirname, '..', 'logic-team.html'), 'utf8');
    assert.ok(!/can no longer sign in/.test(page), 'the Team page does not promise what Disable does not do');
    assert.match(page, /They can no longer open this workspace’s office, plant app or orders\./);
  });
  console.log('\n' + count + ' team checks passed. No network calls.');
}
main().catch(function (e) { console.error(e); process.exit(1); });
