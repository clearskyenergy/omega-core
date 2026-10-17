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
   The lists below are the whole configuration. Add a partner's GitHub
   handle to PARTNERS with the prefixes they may touch. Add a ClearSky
   handle to CLEARSKY and they are unrestricted. Anyone in neither list is
   treated as an outside contributor: they may propose changes to a partner
   folder but nothing else, which is the right default for a repository that
   is public and proprietary at the same time.

   An address a tool stamps for every tenant — a cloud agent's commit
   email — goes in NEUTRAL_BOT_EMAILS. It grants nothing. The pull request's
   opener stays the decision. Putting that address in CLEARSKY_GIT_EMAILS
   would let a partner's agent commits pass for ClearSky.

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
   than as a silent hole.

   Do not add an address a tool stamps for every tenant. That is
   NEUTRAL_BOT_EMAILS, and it does not grant ClearSky. */
var CLEARSKY_GIT_EMAILS = [
  'tom@clearsky-usa.com',
  'noreply@anthropic.com',
  /* Cursor cloud agents author ClearSky PRs opened by the clearskyenergy
     handle. The address is the agent's, and it already sits on main
     (Omega Prime). An unlisted author scopes the whole PR to tenants/osa/. */
  'cursoragent@cursor.com'
];

/* ── Identities allowed as a COMMITTER but never as an AUTHOR ─────────────
   2026-09-20. rangeIdentities() reads `%ae` and `%ce` into one list, so a
   committer this file does not know scopes the PR exactly as an unknown
   author would. GitHub stamps `noreply@github.com` as the COMMITTER on every
   merge commit made through its web UI — so the moment a ClearSky PR merged
   that way landed on main, every later branch that merged main forward
   inherited it and failed this gate. That is not a partner reaching outside
   their folder; it is the repository's own history.

   The distinction is the whole point of listing it here rather than in
   CLEARSKY_GIT_EMAILS. A merge commit contributes no content of its own — its
   tree comes from its parents, which were authored by somebody this file
   still checks. A partner who AUTHORS a commit as noreply@github.com is a
   different claim entirely, and it is still caught.

   Verified before adding: every commit carrying this identity in the range
   that exposed it was a merge (`git log --no-merges | grep -c` returned 0). */
var COMMITTER_ONLY_EMAILS = [
  'noreply@github.com'
];

/* ── Identities that are neither ClearSky nor a partner ───────────────────
   2026-10-17. Cursor's cloud agents commit as cursoragent@cursor.com, and
   GitHub records the Cursor app as <id>+cursor[bot]@users.noreply.github.com.
   Those addresses are the same whoever launched the agent. PRs #334 and #336
   were opened by clearskyenergy and failed this gate on cursoragent@cursor.com,
   then were merged over the check.

   Putting the address in CLEARSKY_GIT_EMAILS would clear that failure and
   open the hole this file exists to close. Partners hold repo-wide write, so
   they can push onto a ClearSky-opened branch. Their agent commits under the
   same email. A known ClearSky email on that commit would make the push
   unrestricted.

   Neutral means the address is skipped when the range is searched for an
   unrecognised identity, and it never counts as ClearSky on its own. The
   opener — github.event.pull_request.user.login, which GitHub authenticated —
   is the decision. A partner-opened pull request stays inside that partner's
   folder however the bot signs the commits.

   Co-authored-by is the human claim the bot writes on its own commit. Cursor
   adds `Co-authored-by: <login> <<login>@users.noreply.github.com>`. On a
   commit AUTHORED by a neutral bot, a trailer this file does not recognise
   is an unrecognised identity and scopes the pull request, so a partner's
   agent commit pushed onto a ClearSky branch is still caught. A trailer that
   names a ClearSky git email, or the GitHub noreply of a CLEARSKY handle, is
   that person. A bot commit with no trailer defers to the opener.

   The trailer is self-asserted, same as a git email. Forging
   `Co-authored-by: clearskyenergy <…>` is the same class of impersonation as
   authoring as tom@clearsky-usa.com, and CODEOWNERS review is still the
   backstop for that. */
var NEUTRAL_BOT_EMAILS = [
  'cursoragent@cursor.com'
];

/* The GitHub-noreply form of those same tools. The numeric id is not part
   of the identity. A login here is neutral; it is not a ClearSky handle and
   it must not grow to cover a person. */
var NEUTRAL_BOT_LOGINS = [
  'cursor[bot]',
  'cursoragent'
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

/* GitHub's noreply address for a login: `login@users.noreply.github.com`
   or `<id>+login@users.noreply.github.com`. The id is not the identity. */
function noreplyLogin(email) {
  var m = lower(email).match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  return m ? m[1] : '';
}

function isNeutralBot(email) {
  email = lower(email);
  if (NEUTRAL_BOT_EMAILS.map(lower).indexOf(email) >= 0) return true;
  var login = noreplyLogin(email);
  return !!login && NEUTRAL_BOT_LOGINS.map(lower).indexOf(login) >= 0;
}

/* A ClearSky handle's own GitHub noreply, as Cursor writes it on
   Co-authored-by. This is not a recognised AUTHOR email — anyone can set
   GIT_AUTHOR_EMAIL to it — so unrestricted() consults it only as a trailer
   on a commit a neutral bot already authored. */
function isClearSkyNoreply(email) {
  var login = noreplyLogin(email);
  return !!login && isClearSky(login);
}

/* `Co-authored-by: Name <email>` lines, in order, deduped. */
function coAuthorEmails(message) {
  var found = [];
  String(message || '').split(/\r?\n/).forEach(function (line) {
    var m = line.match(/^\s*co-authored-by:\s+.*<([^>]+)>\s*$/i);
    if (!m) return;
    var email = lower(m[1].trim());
    if (email && found.indexOf(email) < 0) found.push(email);
  });
  return found;
}

function dedupe(list) {
  var seen = {}, out = [];
  list.forEach(function (e) {
    e = lower(String(e || '').trim());
    if (e && !seen[e]) { seen[e] = 1; out.push(e); }
  });
  return out;
}

/* Authors and committers are collected SEPARATELY, because they are
   different claims. An author wrote the content; a committer only says who
   applied it, and on a merge made through GitHub's UI that is GitHub itself.
   Merging the two lists — which this did until 2026-09-20 — meant an
   ordinary `git merge main` could fail the gate on a name nobody typed.

   The body rides along so a neutral bot's Co-authored-by can be read.
   One log, not three: the body is what makes a second pass a different
   parse. Records are separated by \x1e and fields by \x1f, neither of which
   belongs in a commit message. */
function rangeIdentities(base, head) {
  var range = head ? (base + '..' + head) : (base + '..HEAD');
  var out = cp.execSync('git log --format=%x1e%ae%x1f%ce%x1f%B%x1e ' + range, { encoding: 'utf8' });
  var records = [];
  out.split('\x1e').forEach(function (chunk) {
    var parts = chunk.split('\x1f');
    if (parts.length < 3) return;
    var author = lower(parts[0].trim());
    var committer = lower(parts[1].trim());
    if (!author && !committer) return;
    records.push({
      author: author,
      committer: committer,
      body: parts.slice(2).join('\x1f')
    });
  });
  return {
    authors: dedupe(records.map(function (r) { return r.author; })),
    committers: dedupe(records.map(function (r) { return r.committer; })),
    records: records
  };
}

/* Unrestricted requires BOTH that a ClearSky handle opened the pull request
   AND that nothing in the range was written by an identity we do not
   recognise.

   The opener alone was not enough. PR_AUTHOR is
   github.event.pull_request.user.login — the person who OPENED it, never the
   person who pushed the commits after. Partners hold repo-wide write (that is
   the whole reason this file exists), so pushing onto a ClearSky-authored
   branch skipped the check without the diff ever being read.

   A neutral bot is not an identity either way. It does not satisfy this
   function by itself, and it does not fail it. The opener already did.
   What can still fail it is a Co-authored-by on that bot's commit naming
   somebody this file does not know — a partner's agent, pushed here.

   Fails safe: an identity not on the list is treated as untrusted, which
   scopes the PR rather than exempting it. A git identity is self-asserted, so
   this raises the cost from "push to their branch" to "impersonate them in
   git" — it does not make it impossible, and CODEOWNERS review is still the
   backstop for that. */
function unrestricted(author, base, head) {
  if (!isClearSky(author)) return false;
  var ids = rangeIdentities(base, head);
  var known = CLEARSKY_GIT_EMAILS.map(lower);
  /* A committer may additionally be one of the identities that only ever
     applies somebody else's work — see COMMITTER_ONLY_EMAILS. An AUTHOR is
     held to the stricter list, so the exemption cannot be used to smuggle
     content in under GitHub's name. A neutral bot is neither: see
     NEUTRAL_BOT_EMAILS. */
  var knownCommitters = known.concat(COMMITTER_ONLY_EMAILS.map(lower));

  function recognisedAuthor(email) {
    return isNeutralBot(email) || known.indexOf(email) >= 0;
  }
  function recognisedCommitter(email) {
    return isNeutralBot(email) || knownCommitters.indexOf(email) >= 0;
  }

  var unknownAuthors = ids.authors.filter(function (e) { return !recognisedAuthor(e); });
  var unknownCommitters = ids.committers.filter(function (e) { return !recognisedCommitter(e); });

  /* Trailers are read only where a neutral bot AUTHORED the commit. A
     ClearSky author who names a colleague in a trailer is the existing
     rule: the author email is the claim. A bot has no claim of its own,
     so the trailer is the claim. */
  var trailerUnknown = [];
  ids.records.forEach(function (r) {
    if (!isNeutralBot(r.author)) return;
    coAuthorEmails(r.body).forEach(function (e) {
      if (isNeutralBot(e)) return;
      if (known.indexOf(e) >= 0) return;
      if (isClearSkyNoreply(e)) return;
      if (trailerUnknown.indexOf(e) < 0) trailerUnknown.push(e);
    });
  });

  var unknown = unknownAuthors.concat(unknownCommitters.filter(function (e) {
    return unknownAuthors.indexOf(e) < 0;
  })).concat(trailerUnknown.filter(function (e) {
    return unknownAuthors.indexOf(e) < 0 && unknownCommitters.indexOf(e) < 0;
  }));

  if (!unknown.length) return true;
  console.log('PR opened by a ClearSky handle, but the range carries identities');
  console.log('this file does not recognise, so the scope check applies:');
  unknownAuthors.forEach(function (e) { console.log('  ' + e + '  (author)'); });
  unknownCommitters.forEach(function (e) { console.log('  ' + e + '  (committer)'); });
  trailerUnknown.forEach(function (e) { console.log('  ' + e + '  (co-author)'); });
  console.log('If these are ClearSky, add them to CLEARSKY_GIT_EMAILS — or, for');
  console.log('an identity that only ever applies other people\'s commits,');
  console.log('COMMITTER_ONLY_EMAILS. A tool address shared by every tenant');
  console.log('goes in NEUTRAL_BOT_EMAILS, which does not grant ClearSky —');
  console.log('the pull request\'s opener stays the decision.');
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
    console.log('ClearSky author (' + author + '), no unrecognised identity — unrestricted.');
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
