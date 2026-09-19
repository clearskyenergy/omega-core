#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-change-log.js — the change log, without a database
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Two things in this feature can be wrong in a way nobody sees for months,
   and both are tested here rather than in production:

     THE WEEK BOUNDARY. Every row carries a week key so the report is one
     equality clause. Compute it in UTC and a commit made at 7pm on a Sunday
     in Chicago lands in next week — the report is never empty, never errors,
     and is quietly wrong about one evening a week, for ever.

     DOUBLE COUNTING. A redelivered webhook, a merge that carries ten commits
     GitHub has already seen, and Vercel's succeeded-and-ready pair are three
     different ways for one thing that happened once to be counted twice. All
     three are keyed, not deduplicated after the fact, so the keys are what
     this checks.

   firebase-admin is never loaded: the receivers are required with the shared
   admin module stubbed, so this runs on a laptop with no credential and no
   network. Run: npm run test:changelog
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path'), crypto = require('crypto');

/* ── the stub ────────────────────────────────────────────────────────────
   Everything the receivers touch on ./_lib/admin, and nothing else. Writes
   are captured instead of sent, which is what makes the payload translation
   inspectable at all. */
var WRITTEN = [];
var adminStub = {
  db: function () {
    return {
      batch: function () {
        var staged = [];
        return {
          set: function (ref, row) { staged.push({ id: ref.id, row: row }); },
          commit: function () { WRITTEN.push.apply(WRITTEN, staged); return Promise.resolve(); }
        };
      },
      collection: function () { return { doc: function (id) { return { id: id }; } }; }
    };
  },
  FieldValue: function () { return { serverTimestamp: function () { return '<server>'; } }; },
  isDegraded: function () { return false; },
  degradedReason: function () { return ''; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  handler: function (fn) { return fn; },
  authenticate: function () { return Promise.resolve({ uid: 'u', email: 'x@y.z', staff: true }); }
};

/* Seeding require.cache is the whole trick: the receivers ask for
   ./_lib/admin by the same resolved path, node finds it already "loaded",
   and firebase-admin is never reached. */
var ADMIN = path.join(__dirname, '..', 'api', '_lib', 'admin.js');
require.cache[ADMIN] = { id: ADMIN, filename: ADMIN, loaded: true, exports: adminStub };

var C = require(path.join(__dirname, '..', 'api', '_lib', 'changelog.js'));
var ghHook = require(path.join(__dirname, '..', 'api', 'hook-github.js'));
var vcHook = require(path.join(__dirname, '..', 'api', 'hook-vercel.js'));

var fails = 0, checks = 0;
function ok(cond, name, detail) {
  checks++;
  if (cond) { console.log('  ok   ' + name); return; }
  fails++;
  console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
}
function eq(a, b, name) { ok(a === b, name, a === b ? '' : 'got ' + JSON.stringify(a) + ', wanted ' + JSON.stringify(b)); }

/* ── a fake request/response pair ────────────────────────────────────── */
function deliver(hook, headers, body, secretEnv, secret, sign) {
  var buf = Buffer.from(JSON.stringify(body), 'utf8');
  process.env[secretEnv] = secret;
  headers = Object.assign({}, headers);
  if (sign) headers[sign.header] = sign.make(buf, secret);
  var req = {
    method: 'POST', headers: headers,
    on: function (ev, cb) {
      if (ev === 'data') cb(buf);
      if (ev === 'end') cb();
      return req;
    }
  };
  var out = { status: 0, body: null };
  var res = {
    headersSent: false,
    status: function (s) { out.status = s; return res; },
    json: function (j) { out.body = j; res.headersSent = true; return res; },
    end: function () { res.headersSent = true; return res; },
    send: function (t) { out.body = t; res.headersSent = true; return res; }
  };
  return Promise.resolve(hook(req, res)).then(function () { return out; });
}
var ghSign = { header: 'x-hub-signature-256', make: function (b, s) { return 'sha256=' + crypto.createHmac('sha256', s).update(b).digest('hex'); } };
var vcSign = { header: 'x-vercel-signature', make: function (b, s) { return crypto.createHmac('sha1', s).update(b).digest('hex'); } };

/* ══ 1 · THE WEEK BOUNDARY ════════════════════════════════════════════ */
console.log('\nweeks, in ' + C.ZONE);

/* 2026-09-20 is a Sunday. 23:30 Chicago that evening is 04:30 UTC on the
   Monday — the exact instant a UTC week key gets wrong. */
eq(C.localDay('2026-09-21T04:30:00Z'), '2026-09-20', 'Sunday 23:30 Chicago is still Sunday');
eq(C.weekOf('2026-09-21T04:30:00Z'), C.weekOf('2026-09-20T17:00:00Z'), 'a Sunday evening belongs to the week it felt like');
ok(C.weekOf('2026-09-21T04:30:00Z') !== C.weekOf('2026-09-21T13:00:00Z'), 'and Monday morning does not');

/* ISO weeks: the year belongs to the week's Thursday. 2026-01-01 is a
   Thursday, so it is week 01 of 2026; 2024-12-30 is a Monday whose Thursday
   is 2025-01-02, so it is week 01 of 2025. */
eq(C.weekOfDay('2026-01-01'), '2026-W01', 'New Year 2026 is week 01');
eq(C.weekOfDay('2024-12-30'), '2025-W01', 'late December can be week 01 of the next year');
eq(C.weekOfDay('2026-09-18'), '2026-W38', 'a known Friday');

/* Stepping weeks has to cross a year without going through the week number,
   because the number does not run to a fixed length: 2025 has 52 ISO weeks
   and 2026 has 53 (a year does when 1 January is a Thursday, or when it is a
   Wednesday in a leap year). Decrementing a week number would have walked
   off the end of one of these and quietly stayed there. */
eq(C.shiftWeek('2026-W01', -1), '2025-W52', 'the week before 2026-W01, in a 52-week year');
eq(C.shiftWeek('2025-W52', 1), '2026-W01', 'and back again');
eq(C.shiftWeek('2027-W01', -1), '2026-W53', 'the week before 2027-W01, in a 53-week year');
eq(C.shiftWeek('2026-W53', 1), '2027-W01', 'and back again');
eq(C.weekRange('2026-W38').from, '2026-09-14', 'the week opens on its Monday');
eq(C.weekRange('2026-W38').to, '2026-09-20', 'and closes on its Sunday');

/* ══ 2 · WHO ══════════════════════════════════════════════════════════ */
console.log('\nwho');
eq(C.actorOf({ login: 'ThomasG', email: 'T@X.com' }).key, 'thomasg', 'the login is the key, lowercased');
eq(C.actorOf({ email: 'T@X.com' }).key, 't@x.com', 'an email where there is no login');
eq(C.actorOf({}).key, 'unknown', 'and unknown rather than a guess');
ok(C.actorOf({ login: 'dependabot[bot]' }).bot, 'a [bot] login is marked a bot');
ok(C.looksAgentic('fix\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>'), 'an agent trailer is seen');
ok(!C.looksAgentic('fix a thing claude mentioned'), 'and prose about one is not');

/* ══ 3 · GITHUB ═══════════════════════════════════════════════════════ */
console.log('\ngithub');
var REPO = 'clearskyenergy/omega-core';
var push = {
  ref: 'refs/heads/main', after: 'aaa111', before: '000000', created: false, deleted: false,
  compare: 'https://github.com/x/compare',
  repository: { full_name: REPO, html_url: 'https://github.com/' + REPO },
  pusher: { name: 'thomas', email: 'thomas@x.com' },
  sender: { login: 'thomasg', avatar_url: 'https://avatars/1' },
  head_commit: { timestamp: '2026-09-18T12:00:00Z' },
  commits: [
    { id: 'c1', distinct: true, timestamp: '2026-09-18T12:00:00Z', message: 'first thing\n\nbody', url: 'u1',
      author: { username: 'thomasg', name: 'Thomas', email: 'thomas@x.com' }, added: ['a'], modified: ['b'], removed: [] },
    { id: 'c2', distinct: true, timestamp: '2026-09-18T12:05:00Z', message: 'second thing\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>', url: 'u2',
      author: { username: 'kevin', name: 'Kevin', email: 'kev@x.com' }, added: [], modified: ['c'], removed: [] },
    { id: 'c3', distinct: false, timestamp: '2026-09-18T12:06:00Z', message: 'already had this one', url: 'u3',
      author: { username: 'thomasg', name: 'Thomas', email: 'thomas@x.com' } }
  ]
};

var tests = deliver(ghHook, { 'x-github-event': 'push' }, push, 'GITHUB_WEBHOOK_SECRET', 's3cret', ghSign).then(function (out) {
  eq(out.status, 200, 'a signed push is accepted');
  eq(WRITTEN.length, 2, 'two distinct commits, not three');
  var c1 = WRITTEN[0].row, c2 = WRITTEN[1].row;
  eq(c1.actorKey, 'thomasg', 'a commit belongs to its author');
  eq(c2.actorKey, 'kevin', 'including when the pusher is someone else');
  ok(c2.actor.agent, 'and the agent trailer rides on the row');
  eq(c1.title, 'first thing', 'the title is the subject line only');
  eq(c1.n, 2, 'files touched');
  eq(c1.week, C.weekOfDay('2026-09-18'), 'filed under the week it happened');
  eq(c1.target, 'main', 'the branch, without refs/heads');

  /* The whole point of keying on the event: send it again. */
  var ids = WRITTEN.map(function (w) { return w.id; });
  WRITTEN.length = 0;
  return deliver(ghHook, { 'x-github-event': 'push' }, push, 'GITHUB_WEBHOOK_SECRET', 's3cret', ghSign).then(function () {
    var again = WRITTEN.map(function (w) { return w.id; });
    eq(JSON.stringify(again), JSON.stringify(ids), 'a redelivered push overwrites its own rows');
  });
}).then(function () {
  WRITTEN.length = 0;
  return deliver(ghHook, { 'x-github-event': 'push' }, push, 'GITHUB_WEBHOOK_SECRET', 'wrong-secret', ghSign);
}).then(function (out) {
  /* Signed with the wrong secret: the header is well formed and the digest
     is a real digest — it is simply not ours. */
  eq(out.status, 200, 'sanity: the harness signs with whatever it is given');
  WRITTEN.length = 0;
  process.env.GITHUB_WEBHOOK_SECRET = 'the-real-one';
  return deliver(ghHook, { 'x-github-event': 'push', 'x-hub-signature-256': 'sha256=' + 'f'.repeat(64) }, push, 'GITHUB_WEBHOOK_SECRET', 'the-real-one', null);
}).then(function (out) {
  eq(out.status, 401, 'a forged signature is refused');
  eq(WRITTEN.length, 0, 'and writes nothing');

  return deliver(ghHook, { 'x-github-event': 'ping' }, { zen: 'hi' }, 'GITHUB_WEBHOOK_SECRET', 'the-real-one', ghSign);
}).then(function (out) {
  eq(out.status, 200, 'the ping handshake is answered');

  return deliver(ghHook, { 'x-github-event': 'star' }, { action: 'created' }, 'GITHUB_WEBHOOK_SECRET', 'the-real-one', ghSign);
}).then(function (out) {
  eq(out.status, 200, 'an event we do not log answers 200, not 4xx');
  ok(out.body && out.body.ignored === 'star', 'and says so');

  WRITTEN.length = 0;
  return deliver(ghHook, { 'x-github-event': 'pull_request' }, {
    action: 'closed',
    repository: { full_name: REPO, html_url: 'https://github.com/' + REPO },
    sender: { login: 'thomasg' },
    pull_request: { number: 44, title: 'Some work', merged: true, merged_at: '2026-09-18T15:00:00Z',
      closed_at: '2026-09-18T15:00:00Z', base: { ref: 'main' }, html_url: 'https://github.com/pr/44',
      changed_files: 7, merged_by: { login: 'reviewer1' } }
  }, 'GITHUB_WEBHOOK_SECRET', 'the-real-one', ghSign);
}).then(function (out) {
  eq(out.status, 200, 'a merged pull request is recorded');
  eq(WRITTEN[0].row.kind, 'pr_merged', 'as a merge');
  eq(WRITTEN[0].row.actorKey, 'reviewer1', 'credited to whoever merged it');

  WRITTEN.length = 0;
  return deliver(ghHook, { 'x-github-event': 'pull_request' }, {
    action: 'closed',
    repository: { full_name: REPO }, sender: { login: 'thomasg' },
    pull_request: { number: 45, title: 'Abandoned', merged: false, closed_at: '2026-09-18T16:00:00Z', base: { ref: 'main' } }
  }, 'GITHUB_WEBHOOK_SECRET', 'the-real-one', ghSign);
}).then(function () {
  eq(WRITTEN[0].row.kind, 'pr_closed', 'and a closed-unmerged one is not a merge');

  /* ══ 4 · VERCEL ═════════════════════════════════════════════════════ */
  console.log('\nvercel');
  WRITTEN.length = 0;
  var dep = {
    id: 'evt_1', type: 'deployment.succeeded', createdAt: 1789000000000,
    payload: {
      project: { name: 'omega-core', id: 'prj_1' },
      target: 'production',
      user: { username: 'ci-bot' },
      deployment: { id: 'dpl_9', url: 'omega-core.vercel.app', inspectorUrl: 'https://vercel.com/i/dpl_9',
        meta: { githubCommitAuthorLogin: 'thomasg', githubCommitAuthorName: 'Thomas',
                githubCommitMessage: 'mission: a phone-first pass\n\nmore', githubOrg: 'clearskyenergy', githubRepo: 'omega-core' } }
    }
  };
  return deliver(vcHook, {}, dep, 'VERCEL_WEBHOOK_SECRET', 'v-secret', vcSign).then(function (out) {
    eq(out.status, 200, 'a signed deployment is accepted');
    eq(WRITTEN.length, 1, 'one row');
    var r = WRITTEN[0].row;
    eq(r.actorKey, 'thomasg', 'credited to the commit author, not the integration');
    eq(r.kind, 'deploy_ready', 'a succeeded deploy');
    eq(r.target, 'production', 'to production');
    ok(/mission: a phone-first pass/.test(r.title), 'and says what was in it');
    eq(r.repo, 'clearskyenergy/omega-core', 'cross-referenced to the repo');

    /* succeeded and ready describe one moment. A team subscribed to both
       must not have every deploy counted twice. */
    var id = WRITTEN[0].id;
    WRITTEN.length = 0;
    dep.type = 'deployment.ready';
    return deliver(vcHook, {}, dep, 'VERCEL_WEBHOOK_SECRET', 'v-secret', vcSign).then(function () {
      eq(WRITTEN[0].id, id, 'ready lands on the same row as succeeded');
    });
  });
}).then(function () {
  WRITTEN.length = 0;
  process.env.VERCEL_WEBHOOK_SECRET = 'v-secret';
  return deliver(vcHook, { 'x-vercel-signature': 'a'.repeat(40) }, { type: 'deployment.error', payload: {} }, 'VERCEL_WEBHOOK_SECRET', 'v-secret', null);
}).then(function (out) {
  eq(out.status, 401, 'a forged Vercel signature is refused');
  eq(WRITTEN.length, 0, 'and writes nothing');

  WRITTEN.length = 0;
  return deliver(vcHook, {}, { id: 'e2', type: 'deployment.check-rerequested', payload: {} }, 'VERCEL_WEBHOOK_SECRET', 'v-secret', vcSign);
}).then(function (out) {
  eq(out.status, 200, 'an unlogged Vercel event answers 200');
  eq(WRITTEN.length, 0, 'and writes nothing');
}).then(function () {
  console.log('\n' + (fails ? '✗ ' + fails + ' of ' + checks + ' failed' : '✓ all ' + checks + ' checks passed'));
  process.exit(fails ? 1 : 0);
}).catch(function (e) {
  console.error('\nthrew:', e);
  process.exit(1);
});

module.exports = tests;
