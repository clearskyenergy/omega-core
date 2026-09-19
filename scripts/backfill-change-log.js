#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/backfill-change-log.js — the weeks before the webhook existed
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A webhook only knows what happened after somebody wired it up, so the first
   weekly report would be a report about the afternoon the feature shipped.
   This reads the same history back out of the GitHub API and writes it into
   change_log with THE SAME KEYS the receiver uses — a commit is its sha — so
   a backfilled row and a webhook row for one commit are one row, whichever
   arrives second. Re-running it is therefore safe and changes nothing.

   It cannot backfill Vercel. Deployment history is available through the
   Vercel API, but only for deployments the token's team can still see, and
   Vercel prunes them; a partial deploy history looks like a complete one and
   is worse than none. Vercel starts the day the webhook is created.

   DRY RUN BY DEFAULT. Prints what it would write. Pass --apply to write.

   Usage:
     GITHUB_TOKEN=ghp_…  FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
       node scripts/backfill-change-log.js --repo clearskyenergy/omega-core \
                                           --weeks 8 [--apply]

     --repo <owner/name>   repeatable; defaults to the `origin` of this clone
     --weeks <n>           how far back to go (default 8, max 52)
     --apply               actually write

   The token needs no more than `repo:status` + `public_repo` for a public
   repository, or `repo` for a private one. It is read from the environment
   and never written anywhere — not into a row, not into the log.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path'), https = require('https'), cp = require('child_process');
var C = require(path.join(__dirname, '..', 'api', '_lib', 'changelog.js'));

var argv = process.argv.slice(2);
function opt(name, dflt) { var i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; }
function all(name) { var out = []; argv.forEach(function (a, i) { if (a === '--' + name) out.push(argv[i + 1]); }); return out; }
var APPLY = argv.indexOf('--apply') >= 0;
var WEEKS = Math.max(1, Math.min(52, parseInt(opt('weeks', '8'), 10) || 8));
var TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

/* The repo this clone came from, so the common case needs no flag. */
function originRepo() {
  try {
    var url = cp.execSync('git remote get-url origin', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    var m = /github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
    return m ? m[1] + '/' + m[2] : null;
  } catch (e) { return null; }
}
var REPOS = all('repo');
if (!REPOS.length) { var o = originRepo(); if (o) REPOS = [o]; }
if (!REPOS.length) { console.error('No --repo given and no github origin on this clone.'); process.exit(1); }
if (!TOKEN) { console.error('GITHUB_TOKEN is not set. A backfill needs a token even for a public repo — unauthenticated it is 60 requests an hour.'); process.exit(1); }

var since = new Date(Date.now() - WEEKS * 7 * 86400000).toISOString();

function api(p) {
  return new Promise(function (resolve, reject) {
    var req = https.request({
      host: 'api.github.com', path: p, method: 'GET',
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'clearsky-omega-backfill'
      }
    }, function (res) {
      var buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        if (res.statusCode === 403 && /rate limit/i.test(buf)) return reject(new Error('rate limited by GitHub — wait, or use a token with more room'));
        if (res.statusCode >= 400) return reject(new Error('GitHub said ' + res.statusCode + ' for ' + p + ' — ' + buf.slice(0, 180)));
        try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('GitHub sent something that is not JSON for ' + p)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/* GitHub pages at 100. Stops at the first short page rather than counting,
   because a count is one more thing that can be wrong. */
async function paged(base, cap) {
  var out = [], page = 1;
  while (out.length < (cap || 1000)) {
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    var batch = await api(base + sep + 'per_page=100&page=' + page);
    if (!Array.isArray(batch) || !batch.length) break;
    out = out.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return out;
}

async function harvest(repo) {
  var rows = [];

  /* Commits on every branch would mean a request per branch and would count
     a commit once per branch it sits on. The default branch is the history
     that shipped, which is the history a weekly report is about. */
  var meta = await api('/repos/' + repo);
  var main = meta.default_branch || 'main';
  var commits = await paged('/repos/' + repo + '/commits?sha=' + encodeURIComponent(main) + '&since=' + since);
  commits.forEach(function (c) {
    var gc = c.commit || {};
    rows.push({
      source: 'github', kind: 'commit',
      key: 'gh:commit:' + repo + ':' + c.sha,
      at: (gc.author && gc.author.date) || (gc.committer && gc.committer.date),
      actor: {
        login: (c.author && c.author.login) || null,
        name: gc.author && gc.author.name,
        email: gc.author && gc.author.email,
        avatar: c.author && c.author.avatar_url,
        agent: C.looksAgentic(gc.message)
      },
      repo: repo, target: main,
      title: C.subject(gc.message),
      url: c.html_url,
      /* The list endpoint does not carry per-commit file counts and asking
         for each one is a request per commit. Left null rather than guessed;
         the webhook fills it in for everything from here on. */
      n: null
    });
  });

  /* Pull requests, by when they were last touched, then filtered — the API
     has no "merged since" filter and sorting by update is the closest thing
     that does not walk the whole history of the repository. */
  var prs = await paged('/repos/' + repo + '/pulls?state=all&sort=updated&direction=desc', 300);
  for (var i = 0; i < prs.length; i++) {
    var pr = prs[i];
    if (pr.updated_at < since) break;              /* sorted, so the rest are older */
    if (pr.created_at >= since) {
      rows.push({
        source: 'github', kind: 'pr_opened',
        key: 'gh:pr:' + repo + ':' + pr.number + ':opened:' + pr.created_at,
        at: pr.created_at,
        actor: { login: pr.user && pr.user.login, avatar: pr.user && pr.user.avatar_url },
        repo: repo, target: pr.base && pr.base.ref,
        title: 'opened #' + pr.number + ' — ' + C.subject(pr.title),
        url: pr.html_url, n: null
      });
    }
    if (pr.merged_at && pr.merged_at >= since) {
      rows.push({
        source: 'github', kind: 'pr_merged',
        key: 'gh:pr:' + repo + ':' + pr.number + ':merged',
        at: pr.merged_at,
        actor: { login: (pr.merged_by && pr.merged_by.login) || (pr.user && pr.user.login), avatar: pr.merged_by && pr.merged_by.avatar_url },
        repo: repo, target: pr.base && pr.base.ref,
        title: 'merged #' + pr.number + ' into ' + (pr.base && pr.base.ref) + ' — ' + C.subject(pr.title),
        url: pr.html_url, n: null
      });
    } else if (pr.closed_at && pr.closed_at >= since && pr.state === 'closed') {
      rows.push({
        source: 'github', kind: 'pr_closed',
        key: 'gh:pr:' + repo + ':' + pr.number + ':closed:' + pr.closed_at,
        at: pr.closed_at,
        actor: { login: pr.user && pr.user.login, avatar: pr.user && pr.user.avatar_url },
        repo: repo, target: pr.base && pr.base.ref,
        title: 'closed #' + pr.number + ' without merging — ' + C.subject(pr.title),
        url: pr.html_url, n: null
      });
    }
  }

  /* Reviews are a request per pull request, so they are fetched only for the
     ones inside the window that are worth the call. */
  var recent = prs.filter(function (p) { return p.updated_at >= since; }).slice(0, 60);
  for (var k = 0; k < recent.length; k++) {
    var reviews = [];
    try { reviews = await paged('/repos/' + repo + '/pulls/' + recent[k].number + '/reviews', 100); }
    catch (e) { console.warn('  (no reviews for #' + recent[k].number + ': ' + e.message + ')'); continue; }
    reviews.forEach(function (r) {
      if (!r.submitted_at || r.submitted_at < since) return;
      var said = { APPROVED: 'approved', CHANGES_REQUESTED: 'asked for changes on', COMMENTED: 'commented on' }[r.state] || 'reviewed';
      rows.push({
        source: 'github', kind: 'review',
        key: 'gh:review:' + repo + ':' + r.id,
        at: r.submitted_at,
        actor: { login: r.user && r.user.login, avatar: r.user && r.user.avatar_url },
        repo: repo, target: recent[k].base && recent[k].base.ref,
        title: said + ' #' + recent[k].number + ' — ' + C.subject(recent[k].title),
        url: r.html_url, n: null
      });
    });
  }

  return rows;
}

(async function () {
  var rows = [];
  for (var i = 0; i < REPOS.length; i++) {
    console.log('\n== ' + REPOS[i] + '  (since ' + since.slice(0, 10) + ')');
    var got = await harvest(REPOS[i]);
    console.log('   ' + got.length + ' rows');
    rows = rows.concat(got);
  }

  /* What the report will say, printed before anything is written — a dry run
     that only says "412 rows" is not a dry run of anything anybody reads. */
  var byWeek = {};
  rows.forEach(function (r) {
    var wk = C.weekOf(r.at), who = C.actorOf(r.actor).key;
    byWeek[wk] = byWeek[wk] || {};
    byWeek[wk][who] = (byWeek[wk][who] || 0) + 1;
  });
  Object.keys(byWeek).sort().forEach(function (wk) {
    var r = C.weekRange(wk);
    console.log('\n  ' + wk + '  ' + (r ? r.from + ' → ' + r.to : ''));
    Object.keys(byWeek[wk]).sort(function (a, b) { return byWeek[wk][b] - byWeek[wk][a]; })
      .forEach(function (who) { console.log('    ' + String(byWeek[wk][who]).padStart(4) + '  ' + who); });
  });

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('\nFIREBASE_SERVICE_ACCOUNT is not set — cannot write.'); process.exit(1); }

  /* Written through the same record path the receivers use, so the row shape
     and the doc id can never drift between the two ways in. */
  var written = 0;
  for (var j = 0; j < rows.length; j += 400) {
    var slice = rows.slice(j, j + 400);
    await C.recordAll(slice);
    written += slice.length;
    console.log('  wrote ' + written + ' / ' + rows.length);
  }
  console.log('\nDone. ' + written + ' rows in change_log.');
  process.exit(0);
})().catch(function (e) { console.error('\n' + e.message); process.exit(1); });
