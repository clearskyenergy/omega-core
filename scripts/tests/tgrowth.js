#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/tests/tgrowth.js — the funnel judgement (api/_lib/growth.js) and
   the staff-only board (api/growth.js) on the in-memory Firestore double.
   No network. The rules a sales agent will act on are pinned here: which
   workspace is today's work, and why. */
'use strict';
var assert = require('node:assert/strict');
var FD = require('../_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var G = require('../../api/_lib/growth');

var DAY = 86400000, NOW = Date.parse('2026-09-26T15:00:00Z');
function ago(d) { return new Date(NOW - d * DAY).toISOString(); }
function ahead(d) { return new Date(NOW + d * DAY).toISOString(); }
var n = 0; function test(name, fn) { fn(); n++; console.log('PASS ' + name); }

/* ── the pure judgement ── */
test('a signup waiting more than a day is today\'s work, and says how long', function () {
  var r = G.judge({ orgId: 'slow.example', name: 'Slow Co', status: 'pending', createdAt: ago(2.4), nudges: 2 }, NOW);
  assert.equal(r.lifecycle, 'pending'); assert.equal(r.priority, 3);
  assert.match(r.action, /Approve Slow Co or call them/); assert.match(r.why, /2 days ago/); assert.match(r.why, /pressed Upgrade 2 times/);
  assert.deepEqual(r.flags, ['awaiting-approval', 'asked-again']);
});
test('a signup from this morning is "approve today", not an alarm', function () {
  var r = G.judge({ orgId: 'fresh.example', name: 'Fresh', status: 'pending', createdAt: ago(0.1) }, NOW);
  assert.equal(r.priority, 2); assert.match(r.action, /Approve Fresh today/);
});
test('a person with a pending access request and no tenant record is pending too', function () {
  var r = G.judge({ orgId: 'nobody.example', status: 'active', accessRequestPending: true, createdAt: ago(3) }, NOW);
  assert.equal(r.lifecycle, 'pending'); assert.equal(r.priority, 3);
});
test('trial ending within three days: send the proposal, with the reason from what they built', function () {
  var r = G.judge({ orgId: 'cc.example', name: 'Clean Cell', status: 'active', billing: { tier: 'trial', trialEndsAt: ahead(2.6) }, lastSeenAt: ago(0.2), projects: 4 }, NOW);
  assert.equal(r.lifecycle, 'trial'); assert.equal(r.activity, 'building'); assert.equal(r.priority, 3);
  assert.match(r.action, /Send Clean Cell the proposal: trial ends in 3 days/); assert.match(r.why, /4 projects drawn/);
  assert.deepEqual(r.flags, ['trial-ending']); assert.equal(r.days.trialLeft, 2.6);
});
test('trial over and unpaid is today\'s work whatever else is true', function () {
  var r = G.judge({ orgId: 'x.example', name: 'X', status: 'active', billing: { tier: 'trial', trialEndsAt: ago(4) }, lastSeenAt: ago(40), projects: 1 }, NOW);
  assert.equal(r.priority, 3); assert.deepEqual(r.flags, ['trial-expired']); assert.match(r.action, /Trial over, unpaid/); assert.match(r.why, /ended 4 days ago/);
});
test('approved two days ago and nobody has signed in: a welcome call', function () {
  var r = G.judge({ orgId: 'ghost.example', name: 'Ghost', status: 'active', approvedAt: ago(2.5), billing: { tier: 'trial', trialEndsAt: ahead(11) }, projects: 0 }, NOW);
  assert.equal(r.activity, 'never-seen'); assert.equal(r.priority, 3); assert.match(r.action, /Welcome call: Ghost has not signed in/); assert.deepEqual(r.flags, ['never-signed-in']);
});
test('approved yesterday and not seen yet is not an alarm yet', function () {
  var r = G.judge({ orgId: 'new.example', name: 'New', status: 'active', approvedAt: ago(1), billing: { tier: 'trial', trialEndsAt: ahead(13) } }, NOW);
  assert.equal(r.priority, 1); assert.match(r.action, /Check in with New/);
});
test('signed in three days ago, drew nothing: offer a guided build (this week)', function () {
  var r = G.judge({ orgId: 'look.example', name: 'Looker', status: 'active', approvedAt: ago(6), billing: { tier: 'trial', trialEndsAt: ahead(8) }, lastSeenAt: ago(3.2), projects: 0 }, NOW);
  assert.equal(r.activity, 'exploring'); assert.equal(r.priority, 2); assert.match(r.action, /Offer Looker a guided build/); assert.deepEqual(r.flags, ['no-project']);
});
test('building on trial with time left is a watch, with the plan for the last three days', function () {
  var r = G.judge({ orgId: 'b.example', name: 'Builder', status: 'active', approvedAt: ago(5), billing: { tier: 'trial', trialEndsAt: ahead(9) }, lastSeenAt: ago(0.5), projects: 2 }, NOW);
  assert.equal(r.priority, 1); assert.match(r.why, /2 projects, 9 days of trial left/);
});
test('paying and active is healthy; the next rung waits for the quarterly right-size', function () {
  var r = G.judge({ orgId: 'ok.example', name: 'Concord', status: 'active', billing: { tier: 'standard', lastPaidAt: ago(10), subscriptionDue: ahead(20), amountDue: 0 }, lastSeenAt: ago(1), projects: 12 }, NOW);
  assert.equal(r.lifecycle, 'paying'); assert.equal(r.activity, 'building'); assert.equal(r.priority, 0); assert.match(r.action, /Healthy/);
});
test('paying but nobody opened it in 30 days is a churn risk this week', function () {
  var r = G.judge({ orgId: 'idle.example', name: 'Idle Co', status: 'active', billing: { tier: 'deluxe', lastPaidAt: ago(20) }, lastSeenAt: ago(41), projects: 3 }, NOW);
  assert.equal(r.activity, 'idle'); assert.equal(r.priority, 2); assert.match(r.action, /Churn risk: nobody at Idle Co has opened the workspace in 41 days/); assert.deepEqual(r.flags, ['idle']);
});
test('a paid tier with no sign-in on record at all is treated as idle, not healthy', function () {
  var r = G.judge({ orgId: 'p.example', name: 'P', status: 'active', billing: { tier: 'standard', lastPaidAt: ago(5) }, projects: 0 }, NOW);
  assert.equal(r.priority, 2); assert.deepEqual(r.flags, ['idle']);
});
test('past due wins over everything: an amount past its due date, a failed payment, or the billing status', function () {
  var a = G.judge({ orgId: 'a', name: 'A', status: 'active', billing: { tier: 'standard', amountDue: 1299, subscriptionDue: ago(6) }, lastSeenAt: ago(1), projects: 9 }, NOW);
  var b = G.judge({ orgId: 'b', name: 'B', status: 'active', billing: { tier: 'standard', paymentFailedAt: ago(1) } }, NOW);
  var c = G.judge({ orgId: 'c', name: 'C', status: 'active', billing: { tier: 'trial', status: 'past_due' } }, NOW);
  [a, b, c].forEach(function (r) { assert.equal(r.lifecycle, 'past-due'); assert.equal(r.priority, 3); });
  assert.match(a.why, /\$1,299 due since 2026-09-20/);
});
test('suspended and cancelled are named, not counted as churn risk twice', function () {
  assert.equal(G.judge({ orgId: 's', name: 'S', status: 'suspended' }, NOW).priority, 1);
  var c = G.judge({ orgId: 'c', name: 'C', status: 'cancelled', billing: { tier: 'standard' } }, NOW);
  assert.equal(c.lifecycle, 'cancelled'); assert.equal(c.priority, 0); assert.deepEqual(c.flags, []);
});
test('dates arrive as Timestamps, Dates, ISO strings or millis and all read the same', function () {
  var ts = { toMillis: function () { return NOW - 2 * DAY; } };
  var iso = ago(2), d = new Date(NOW - 2 * DAY), ms = NOW - 2 * DAY, sec = { seconds: Math.floor((NOW - 2 * DAY) / 1000) };
  [ts, iso, d, ms, sec].forEach(function (v) { assert.equal(Math.round(G.millis(v) / 1000), Math.round((NOW - 2 * DAY) / 1000)); });
  assert.equal(G.millis(''), null); assert.equal(G.millis('not a date'), null); assert.equal(G.millis(undefined), null);
});
test('the board sorts today first and counts the morning glance', function () {
  var b = G.board([
    { orgId: 'ok.example', name: 'OK', status: 'active', billing: { tier: 'standard', lastPaidAt: ago(3) }, lastSeenAt: ago(1), projects: 2 },
    { orgId: 'slow.example', name: 'Slow', status: 'pending', createdAt: ago(3) },
    { orgId: 'end.example', name: 'Ending', status: 'active', billing: { tier: 'trial', trialEndsAt: ahead(1) }, lastSeenAt: ago(1), projects: 1 },
    { orgId: 'idle.example', name: 'Idle', status: 'active', billing: { tier: 'standard', lastPaidAt: ago(3) }, lastSeenAt: ago(60), projects: 2 }
  ], NOW);
  assert.deepEqual(b.tenants.map(function (r) { return r.orgId; }), ['end.example', 'slow.example', 'idle.example', 'ok.example']);
  assert.deepEqual(b.summary, { total: 4, pending: 1, trial: 1, trialEnding: 1, paying: 2, pastDue: 0, idle: 1, today: 2 });
  assert.deepEqual(b.today.map(function (t) { return t.orgId; }), ['end.example', 'slow.example']);
  assert.equal(b.asOf, '2026-09-26T15:00:00.000Z');
});

/* ── the endpoint, on the Firestore double ── */
var db = new DB();
var A = { db: function () { return db; }, handler: function (f) { return f; }, authenticate: async function (r) { return r.caller; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; } };
mock('../api/_lib/admin', A);
var api = require('../../api/growth');
/* the endpoint judges against the clock; the fixtures are relative to NOW, so pin it (the test is otherwise true only within an hour of NOW) */
Date.now = function () { return NOW; };
var STAFF = { uid: 's', email: 'ops@clearsky-usa.com', staff: true, claims: { email_verified: true } };
var TENANT = { uid: 't', email: 'ann@northstar.example', orgId: 'northstar.example', staff: false, claims: { email_verified: true } };
function call(query, caller) { return api({ method: 'GET', query: query || {}, caller: caller || STAFF }, { setHeader: function () {}, headers: {} }); }
async function rejects(p, status) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); return e; } throw new Error('expected a ' + status); }

db.seed('omega_orgs/northstar.example', { name: 'Northstar', vertical: 'developer', status: 'active', createdAt: ago(120), approvedAt: ago(119), signup: { email: 'ann@northstar.example' } });
db.seed('omega_orgs/northstar.example/billing/current', { tier: 'standard', lastPaidAt: ago(10), subscriptionDue: ahead(20), amountDue: 0 });
db.seed('omega_orgs/northstar.example/members/u1', { email: 'ann@northstar.example', role: 'owner', status: 'active' });
db.seed('omega_orgs/northstar.example/members/u2', { email: 'raj@northstar.example', role: 'member', status: 'active' });
db.seed('team_members/northstar.example__ann@northstar.example', { orgId: 'northstar.example', email: 'ann@northstar.example', lastSeen: ago(0.5) });
db.seed('team_members/northstar.example__raj@northstar.example', { orgId: 'northstar.example', email: 'raj@northstar.example', lastSeen: ago(9) });
db.seed('projects/p1', { orgId: 'northstar.example', name: 'One', createdAt: ago(30) });
db.seed('projects/p2', { orgId: 'northstar.example', name: 'Two', createdAt: ago(2) });
db.seed('projects/px', { orgId: 'other.example', name: 'Not theirs', createdAt: ago(1) });
db.seed('omega_orgs/pendingco.example', { name: 'Pendingco', vertical: 'installer', status: 'pending', createdAt: ago(2), signup: { email: 'sam@pendingco.example' } });
db.seed('omega_orgs/pendingco.example/billing/current', { tier: 'trial', trialEndsAt: ahead(14) });
db.seed('omega_orgs/newco.example', { name: 'Newco', vertical: 'developer', status: 'active', createdAt: ago(3), approvedAt: ago(2.5) });
db.seed('omega_orgs/newco.example/billing/current', { tier: 'trial', trialEndsAt: ahead(11.5) });
db.seed('omega_orgs/newco.example/members/u9', { email: 'dana@newco.example', role: 'owner', status: 'active' });
db.seed('access_requests/req1', { email: 'pat@solo.example', domain: 'solo.example', status: 'pending', nudges: 1 });
db.seed('omega_orgs/solo.example', { name: 'Solo', status: 'active', createdAt: ago(5) });

(async function () {
  await rejects(call({}, TENANT), 403); n++; console.log('PASS a tenant owner is refused: staff only');
  await rejects(Promise.resolve().then(function () { return api({ method: 'POST', body: {}, caller: STAFF }, {}); }), 405); n++; console.log('PASS POST is refused: read-only');
  var b = await call();
  assert.equal(b.summary.total, 4);
  var byId = {}; b.tenants.forEach(function (r) { byId[r.orgId] = r; });
  assert.equal(byId['northstar.example'].lifecycle, 'paying'); assert.equal(byId['northstar.example'].activity, 'building');
  assert.equal(byId['northstar.example'].projects, 2, 'counts only this workspace\'s projects');
  assert.equal(byId['northstar.example'].members, 2); assert.equal(byId['northstar.example'].who, 'ann@northstar.example');
  assert.equal(byId['northstar.example'].days.sinceSeen, 0.5, 'the newest lastSeen across the team');
  assert.equal(byId['northstar.example'].days.sinceProject, 2, 'the newest project');
  assert.equal(byId['pendingco.example'].priority, 3); assert.match(byId['pendingco.example'].action, /Approve Pendingco or call them/);
  assert.equal(byId['newco.example'].priority, 3); assert.match(byId['newco.example'].action, /Welcome call/); assert.equal(byId['newco.example'].who, 'dana@newco.example', 'the owner member when there is no signup record');
  assert.equal(byId['solo.example'].lifecycle, 'pending', 'a pending access request from that domain counts'); assert.equal(byId['solo.example'].flags.indexOf('asked-again') >= 0, true);
  assert.deepEqual(b.tenants.slice(0, 3).map(function (r) { return r.priority; }), [3, 3, 3]);
  assert.equal(b.today.length, 3); assert.deepEqual(b.caps, { orgs: 300, projectsPerOrg: 500 });
  n++; console.log('PASS the board joins org, billing, members, presence, projects and access requests per workspace');
  var one = await call({ org: 'northstar.example' });
  assert.equal(one.orgId, 'northstar.example'); assert.equal(one.facts.projects, 2); assert.equal(one.facts.billing.tier, 'standard'); assert.equal(typeof one.facts.lastSeenAt, 'number');
  n++; console.log('PASS ?org= returns one workspace with the facts behind the call');
  await rejects(call({ org: 'nobody.example' }), 404); n++; console.log('PASS an unknown workspace is a 404');
  await rejects(call({ org: '../etc' }), 400); n++; console.log('PASS a malformed org is refused, not read as a path or as "everything"');
  /* packaging phases 1–4: a packaged tenant is judged by its state machine, and the billing contact is who */
  var pk = function (b, extra) { return G.judge(Object.assign({ orgId: 'pk.example', name: 'Packed', status: 'active', billing: Object.assign({ packaged: true }, b), lastSeenAt: ago(1), projects: 3 }, extra || {}), NOW); };
  assert.equal(pk({ packagingState: 'paid', accessUntil: ahead(20) }).lifecycle, 'paying');
  assert.equal(pk({ packagingState: 'trial', trialEndsAt: ahead(5), accessUntil: ahead(5) }).lifecycle, 'trial');
  assert.match(pk({ packagingState: 'trial', trialEndsAt: ahead(2), accessUntil: ahead(2) }).action, /Send Packed the proposal: trial ends in/);
  assert.equal(pk({ packagingState: 'trial', trialEndsAt: ago(1), accessUntil: ago(1) }).lifecycle, 'read-only');
  assert.equal(pk({ packagingState: 'awaiting_payment', accessUntil: ahead(3) }).lifecycle, 'read-only');
  var aw = pk({ packagingState: 'awaiting_payment', accessUntil: ahead(3), amountDue: 2250 }); assert.ok(aw.flags.indexOf('awaiting-payment') >= 0, 'the first invoice out is a sale to close'); assert.match(aw.action, /First invoice unpaid: call Packed about the \$2,250/);
  var ro = pk({ packagingState: 'paid', accessUntil: ago(2) });
  assert.equal(ro.lifecycle, 'read-only'); assert.equal(ro.priority, 3); assert.match(ro.action, /Unpaid: send Packed the invoice link/); assert.ok(ro.flags.indexOf('read-only') >= 0);
  assert.equal(pk({ packagingState: 'past_due_lite', accessUntil: ahead(20) }).lifecycle, 'past-due');
  assert.equal(pk({ tier: 'standard', lastPaidAt: ago(10) }, { billing: { packaged: false, tier: 'standard', lastPaidAt: ago(10) } }).lifecycle, 'paying', 'an unpackaged record keeps the tier reading');
  n++; console.log('PASS a packaged tenant is judged by its state: paying, trial, read-only, past due');
  db.seed('omega_orgs/newco.example/billing/profile', { email: 'ap@newco.example', contactName: 'AP Desk' });
  var b2 = await call(); var byId2 = {}; b2.tenants.forEach(function (r) { byId2[r.orgId] = r; });
  assert.equal(byId2['newco.example'].who, 'ap@newco.example', 'the billing contact, once there is one');
  assert.equal(byId2['northstar.example'].who, 'ann@northstar.example', 'the signup email or the owner otherwise');
  n++; console.log('PASS who: the billing profile contact wins over the signup email and the owner');
  console.log('all ' + n + ' growth checks passed');
})().catch(function (e) { console.error(e); process.exit(1); });
