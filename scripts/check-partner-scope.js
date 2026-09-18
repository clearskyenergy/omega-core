#!/usr/bin/env node
/* scripts/check-partner-scope.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Fails a pull request whose author is a JV partner and whose diff reaches
   outside the folder that partner is scoped to.

   ── WHY THIS EXISTS ──────────────────────────────────────────────────────
   "Write access scoped to /tenants/osa/" is a sentence GitHub cannot honour.
   There is no path-scoped write permission — not for a user, not for a team,
   on any plan or account type. A collaborator added so they can work on the
   OSA folder can also write firestore.rules, api/, and all seventeen other
   tenants' folders. CODEOWNERS does not close that gap either: it asks for a
   review, and a review is a person remembering.

   So the scoping everyone has been describing to each other in email has to
   live somewhere a machine enforces it, and this is that place.

   ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
   It runs on pull_request, so it governs MERGES, not pushes. Anyone holding
   write access can still push a branch touching any path; what they cannot do
   is land it. And it is only a gate if `partner scope` is marked a REQUIRED
   status check on the protected branch. Without that it is an advisory X next
   to a green Merge button, which is worse than nothing because it looks like
   protection. Set it required, or delete this file.

   ── EDITING THE ROSTER ───────────────────────────────────────────────────
   Two lists below, and they are the whole configuration. Add a partner's
   GitHub handle to PARTNERS with the prefixes they may touch. Add a ClearSky
   handle to CLEARSKY and they are unrestricted. Anyone in neither list is
   treated as an outside contributor: they may propose changes to a partner
   folder but nothing else, which is the right default for a repository that
   is public and proprietary at the same time.

   ── RUNNING IT LOCALLY ───────────────────────────────────────────────────
   Before you push, from a partner branch:

     node scripts/check-partner-scope.js --author tjw2021 --base origin/main

   In CI everything comes from the environment instead; see
   .github/workflows/partner-scope.yml. */
'use strict';

var cp = require('child_process');

/* ── ClearSky. Unrestricted: this is our repository. ───────────────────── */
var CLEARSKY = [
  'clearskyenergy'
];

/* The git identities behind those handles. Used to confirm that a
   ClearSky-authored PR carries only ClearSky commits — see unrestricted().
   Anything not listed here scopes the PR instead of exempting it, so a new
   teammate shows up as a failing check and one line of maintenance rather
   than as a silent hole. */
var CLEARSKY_GIT_EMAILS = [
  'tom@clearsky-usa.com',
  'noreply@anthropic.com'
];

/* ── JV partners, and the only paths their PRs may change. ─────────────────
   A handle here is a statement about the JV agreement, not about trust — the
   point of writing it down is that the boundary survives the person who
   negotiated it having a busy week. */
var PARTNERS = {
  'tjw2021': {
    who: 'TJ Warren — OSA JV (OGI Solar)',
    allow: ['tenants/osa/']
  }
};

/* ── Never, even for a partner whose prefix contains them. ─────────────────
   A rules file and server code do not become partner territory by sitting in
   a partner folder. None of these is deployed today — firebase.json deploys
   the ROOT firestore.rules and Vercel builds only the ROOT api/ — but they
   read as authoritative to whoever opens them next, and a copy of the access
   model that a partner can edit unreviewed is exactly the thing the JV
   agreement says they cannot edit. */
var NEVER = [
  'tenants/osa/firestore.rules',
  'tenants/osa/firestore.rules.partner',
  'tenants/osa/storage.rules.additions',
  'tenants/osa/api/'
];

function arg(name, fallback) {
  var i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function lower(s) { return String(s == null ? '' : s).toLowerCase(); }

/* Three dots: what this branch changed since it diverged, not everything that
   has landed on main in the meantime. Two dots here would fail a partner's PR
   for core commits somebody else merged while they were working.

   --no-renames IS LOad-BEARING, not tidiness. With git's default rename
   detection, --name-only prints only the DESTINATION of a rename and the
   source path vanishes from the output entirely. So
   `git mv firestore.rules tenants/osa/keep.rules` showed one in-scope file
   and PASSED, having deleted the root rules file — and the same trick on
   CODEOWNERS would strip the review requirement from every later PR. With
   --no-renames a move is reported as the delete and the add it really is,
   and the delete is judged on the path it came from. */
function changedFiles(base, head) {
  var range = head ? (base + '...' + head) : (base + '...HEAD');
  var out = cp.execSync('git diff --no-renames --name-only ' + range, { encoding: 'utf8' });
  return out.split('\n')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

function isClearSky(author) {
  return CLEARSKY.map(lower).indexOf(lower(author)) >= 0;
}

/* Every git identity that wrote or committed something in this range.
   Both %ae and %ce, because a partner can push somebody else's commits. */
function rangeIdentities(base, head) {
  var range = head ? (base + '..' + head) : (base + '..HEAD');
  var out = cp.execSync('git log --format=%ae%n%ce ' + range, { encoding: 'utf8' });
  var seen = {}, list = [];
  out.split('\n').forEach(function (e) {
    e = lower(e.trim());
    if (e && !seen[e]) { seen[e] = 1; list.push(e); }
  });
  return list;
}

/* Unrestricted requires BOTH that a ClearSky handle opened the pull request
   AND that nothing in the range was written by an identity we do not
   recognise.

   The opener alone was not enough. PR_AUTHOR is
   github.event.pull_request.user.login — the person who OPENED it, never the
   person who pushed the commits after. Partners hold repo-wide write (that is
   the whole reason this file exists), so pushing onto a ClearSky-authored
   branch skipped the check without the diff ever being read.

   Fails safe: an identity not on the list is treated as untrusted, which
   scopes the PR rather than exempting it. A git identity is self-asserted, so
   this raises the cost from "push to their branch" to "impersonate them in
   git" — it does not make it impossible, and CODEOWNERS review is still the
   backstop for that. */
function unrestricted(author, base, head) {
  if (!isClearSky(author)) return false;
  var unknown = rangeIdentities(base, head).filter(function (e) {
    return CLEARSKY_GIT_EMAILS.map(lower).indexOf(e) < 0;
  });
  if (!unknown.length) return true;
  console.log('PR opened by a ClearSky handle, but the range carries identities');
  console.log('this file does not recognise, so the scope check applies:');
  unknown.forEach(function (e) { console.log('  ' + e); });
  console.log('If these are ClearSky, add them to CLEARSKY_GIT_EMAILS.');
  console.log('');
  return false;
}

/* An outside contributor is not a partner, so they get no named prefix — but
   refusing them everything would also refuse a legitimate drive-by fix to the
   OSA folder. They are scoped to the union of every partner prefix, and a
   human still has to approve the PR. */
function allowedPrefixes(author) {
  var p = PARTNERS[lower(author)];
  if (p) return p.allow;
  var all = [];
  Object.keys(PARTNERS).forEach(function (k) {
    PARTNERS[k].allow.forEach(function (a) { if (all.indexOf(a) < 0) all.push(a); });
  });
  return all;
}

function violations(files, prefixes) {
  var bad = [];
  files.forEach(function (f) {
    var inScope = prefixes.some(function (p) { return f.indexOf(p) === 0; });
    var forbidden = NEVER.some(function (n) { return f === n || f.indexOf(n) === 0; });
    if (!inScope) bad.push({ file: f, why: 'outside the scoped folder' });
    else if (forbidden) bad.push({ file: f, why: 'rules or server code — ClearSky only' });
  });
  return bad;
}

function main() {
  var author = arg('--author', process.env.PR_AUTHOR || '');
  var base   = arg('--base',   process.env.BASE_SHA  || 'origin/main');
  var head   = arg('--head',   process.env.HEAD_SHA  || '');

  if (!author) {
    console.error('No author. Pass --author <handle> or set PR_AUTHOR.');
    process.exit(2);
  }

  if (unrestricted(author, base, head)) {
    console.log('ClearSky author (' + author + '), ClearSky commits — unrestricted.');
    process.exit(0);
  }

  var files;
  try {
    files = changedFiles(base, head);
  } catch (e) {
    console.error('Could not diff ' + base + '...' + (head || 'HEAD') + ': '
                  + ((e && e.message) || e));
    console.error('In CI this usually means the checkout was shallow — needs fetch-depth: 0.');
    process.exit(2);
  }

  if (!files.length) {
    console.log('No files changed. Nothing to check.');
    process.exit(0);
  }

  var known  = PARTNERS[lower(author)];
  var scope  = allowedPrefixes(author);
  var bad    = violations(files, scope);

  console.log('Author : ' + author + (known ? '  (' + known.who + ')' : '  (not a listed partner)'));
  console.log('Scope  : ' + scope.join(', '));
  console.log('Files  : ' + files.length + ' changed');
  console.log('');

  if (!bad.length) {
    console.log('PASS — every changed file is inside the scoped folder.');
    process.exit(0);
  }

  console.log('FAIL — ' + bad.length + ' file' + (bad.length === 1 ? '' : 's')
              + ' outside this author’s scope:');
  console.log('');
  bad.forEach(function (b) { console.log('  ' + b.file + '\n      ' + b.why); });
  console.log('');
  console.log('What to do: split the change. The part inside ' + scope.join(' / ')
              + ' can land in this PR; the rest belongs in a');
  console.log('ClearSky-authored PR, because rules, api/ and other tenants are');
  console.log('ClearSky’s side of the JV agreement.');
  console.log('');
  console.log('If this author should be scoped differently, edit PARTNERS in');
  console.log('scripts/check-partner-scope.js — that list is the boundary.');
  process.exit(1);
}

main();
