/* POST /api/hook-github — GitHub webhook → change_log
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Point any repository at this URL (Settings → Webhooks → Add webhook):
     Payload URL   https://<your host>/api/hook-github
     Content type  application/json
     Secret        the same string as GITHUB_WEBHOOK_SECRET in Vercel
     Events        push, pull_request, pull_request_review, create, delete,
                   release   (or "send me everything" — the rest is ignored)

   EVERY REPO, NOT A LIST OF THEM. The secret is what says a delivery is ours;
   the repository name is data, recorded on the row. Adding the next repo is
   adding a webhook to it, not a deploy of this file. An allowlist here would
   have to be edited from a laptop every time somebody made a repo, which is
   the same as it never being edited.

   ONE ROW PER COMMIT, not one per push. The report answers "who did what",
   and a push is attributed to whoever ran it while its commits belong to
   whoever wrote them — which on a merge is usually several people. Keyed on
   the sha, so the same commit arriving again (a force-push replay, a manual
   redelivery, a branch that carries it somewhere else) updates one row
   rather than adding a second.

   A 4xx MAKES GITHUB MARK THE HOOK BROKEN, and a hook marked broken is one
   nobody notices has stopped. So an event we do not care about answers 200
   and says it was ignored; only a bad signature — which is the one case
   where being noisy is the point — answers 401. */
'use strict';
var crypto = require('crypto');
var A = require('./_lib/admin');
var C = require('./_lib/changelog');

function verify(buf, req) {
  var secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return { ok: false, why: 'GITHUB_WEBHOOK_SECRET is not set on this deployment' };
  var sent = req.headers['x-hub-signature-256'];
  if (!sent) return { ok: false, why: 'no x-hub-signature-256 header' };
  var mine = 'sha256=' + crypto.createHmac('sha256', secret).update(buf).digest('hex');
  return C.safeEqual(sent, mine) ? { ok: true } : { ok: false, why: 'signature does not match' };
}

/* refs/heads/main → main. The ref type is on the event, so the prefix is
   stripped rather than parsed for meaning. */
function shortRef(ref) { return String(ref || '').replace(/^refs\/(heads|tags)\//, ''); }

function fromPush(p) {
  var repo = p.repository && p.repository.full_name;
  var branch = shortRef(p.ref);
  var rows = [];

  /* `distinct` is GitHub saying this commit is new to the repository rather
     than one it already had on another branch. Without the filter, merging a
     ten-commit branch into main counted those ten commits a second time and
     doubled the author's week. */
  (p.commits || []).forEach(function (c) {
    if (c.distinct === false) return;
    rows.push({
      source: 'github', kind: 'commit',
      key: 'gh:commit:' + repo + ':' + c.id,
      at: c.timestamp,
      actor: {
        login: (c.author && c.author.username) || (p.sender && p.sender.login),
        name: (c.author && c.author.name) || null,
        email: c.author && c.author.email,
        avatar: p.sender && p.sender.avatar_url,
        agent: C.looksAgentic(c.message)
      },
      repo: repo, target: branch,
      title: C.subject(c.message),
      url: c.url,
      n: (c.added || []).length + (c.modified || []).length + (c.removed || []).length
    });
  });

  /* A branch or tag appearing and disappearing is a change somebody made,
     and on a repo that squash-merges it is sometimes the only trace a piece
     of work leaves. `created`/`deleted` ride on the push rather than on the
     create/delete event when the same call does both. */
  if (p.created && branch) {
    rows.push({
      source: 'github', kind: 'branch_created',
      key: 'gh:branch+:' + repo + ':' + branch + ':' + p.after,
      at: (p.head_commit && p.head_commit.timestamp) || new Date().toISOString(),
      actor: { login: p.sender && p.sender.login, name: p.pusher && p.pusher.name, email: p.pusher && p.pusher.email, avatar: p.sender && p.sender.avatar_url },
      repo: repo, target: branch,
      title: 'opened the branch ' + branch,
      url: p.repository && (p.repository.html_url + '/tree/' + branch)
    });
  }
  if (p.deleted && branch) {
    rows.push({
      source: 'github', kind: 'branch_deleted',
      key: 'gh:branch-:' + repo + ':' + branch + ':' + p.before,
      at: new Date().toISOString(),
      actor: { login: p.sender && p.sender.login, name: p.pusher && p.pusher.name, email: p.pusher && p.pusher.email, avatar: p.sender && p.sender.avatar_url },
      repo: repo, target: branch,
      title: 'deleted the branch ' + branch,
      url: p.repository && p.repository.html_url
    });
  }
  /* GitHub sends at most 20 commits in a push payload and does not say how
     many it left out, so a bigger push is recorded as what arrived plus this
     one honest line. Better than a silent undercount in somebody's week. */
  if ((p.commits || []).length >= 20) {
    rows.push({
      source: 'github', kind: 'push_truncated',
      key: 'gh:trunc:' + repo + ':' + p.after,
      at: (p.head_commit && p.head_commit.timestamp) || new Date().toISOString(),
      actor: { login: p.sender && p.sender.login, name: p.pusher && p.pusher.name, email: p.pusher && p.pusher.email, avatar: p.sender && p.sender.avatar_url },
      repo: repo, target: branch,
      title: 'pushed more commits to ' + branch + ' than a webhook carries — see the compare view',
      url: p.compare
    });
  }
  return rows;
}

function fromPullRequest(p) {
  var pr = p.pull_request || {}, repo = p.repository && p.repository.full_name;
  var who = { login: p.sender && p.sender.login, name: p.sender && p.sender.login, avatar: p.sender && p.sender.avatar_url };
  var base = { source: 'github', repo: repo, target: pr.base && pr.base.ref, url: pr.html_url, n: pr.changed_files == null ? null : pr.changed_files };

  if (p.action === 'opened' || p.action === 'reopened') {
    return [Object.assign({}, base, {
      kind: 'pr_opened', key: 'gh:pr:' + repo + ':' + pr.number + ':opened:' + (pr.created_at || ''),
      at: pr.created_at, actor: who,
      title: 'opened #' + pr.number + ' — ' + C.subject(pr.title)
    })];
  }
  if (p.action === 'closed') {
    /* Merged and abandoned are not the same event and must not be one row:
       a week where four pull requests were closed unmerged reads very
       differently from a week where four shipped. */
    return [Object.assign({}, base, pr.merged ? {
      kind: 'pr_merged', key: 'gh:pr:' + repo + ':' + pr.number + ':merged',
      at: pr.merged_at || pr.closed_at,
      actor: { login: (pr.merged_by && pr.merged_by.login) || (p.sender && p.sender.login), avatar: (pr.merged_by && pr.merged_by.avatar_url) || (p.sender && p.sender.avatar_url) },
      title: 'merged #' + pr.number + ' into ' + (pr.base && pr.base.ref) + ' — ' + C.subject(pr.title)
    } : {
      kind: 'pr_closed', key: 'gh:pr:' + repo + ':' + pr.number + ':closed:' + (pr.closed_at || ''),
      at: pr.closed_at, actor: who,
      title: 'closed #' + pr.number + ' without merging — ' + C.subject(pr.title)
    })];
  }
  return [];
}

function fromReview(p) {
  var r = p.review || {}, pr = p.pull_request || {}, repo = p.repository && p.repository.full_name;
  if (p.action !== 'submitted') return [];
  var said = { approved: 'approved', changes_requested: 'asked for changes on', commented: 'commented on' }[r.state] || 'reviewed';
  return [{
    source: 'github', kind: 'review',
    key: 'gh:review:' + repo + ':' + r.id,
    at: r.submitted_at,
    actor: { login: r.user && r.user.login, avatar: r.user && r.user.avatar_url },
    repo: repo, target: pr.base && pr.base.ref,
    title: said + ' #' + pr.number + ' — ' + C.subject(pr.title),
    url: r.html_url
  }];
}

/* A branch or tag created with no commits on it — `git push origin :tag`, a
   branch cut in the UI. The push event covers the case where content came
   with it; this covers the case where nothing did. */
function fromCreateDelete(p, made) {
  var repo = p.repository && p.repository.full_name, ref = shortRef(p.ref);
  if (!ref) return [];
  var noun = p.ref_type === 'tag' ? 'tag' : 'branch';
  return [{
    source: 'github', kind: (made ? 'branch_created' : 'branch_deleted'),
    key: 'gh:' + (made ? 'ref+' : 'ref-') + ':' + repo + ':' + p.ref_type + ':' + ref,
    at: new Date().toISOString(),
    actor: { login: p.sender && p.sender.login, avatar: p.sender && p.sender.avatar_url },
    repo: repo, target: ref,
    title: (made ? 'created the ' : 'deleted the ') + noun + ' ' + ref,
    url: p.repository && p.repository.html_url
  }];
}

function fromRelease(p) {
  var r = p.release || {}, repo = p.repository && p.repository.full_name;
  if (p.action !== 'published') return [];
  return [{
    source: 'github', kind: 'release',
    key: 'gh:release:' + repo + ':' + r.id,
    at: r.published_at,
    actor: { login: (r.author && r.author.login) || (p.sender && p.sender.login), avatar: p.sender && p.sender.avatar_url },
    repo: repo, target: r.tag_name,
    title: 'released ' + (r.name || r.tag_name),
    url: r.html_url
  }];
}

var ROUTES = {
  push: fromPush,
  pull_request: fromPullRequest,
  pull_request_review: fromReview,
  create: function (p) { return fromCreateDelete(p, true); },
  'delete': function (p) { return fromCreateDelete(p, false); },
  release: fromRelease
};

module.exports = function (req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  return C.rawBody(req).then(function (buf) {
    var v = verify(buf, req);
    if (!v.ok) { console.warn('[hook-github] refused:', v.why); return res.status(401).json({ error: v.why }); }

    var event = req.headers['x-github-event'] || '';
    /* The handshake GitHub fires when the webhook is saved. Answering it is
       how the green tick appears next to the hook. */
    if (event === 'ping') return res.status(200).json({ ok: true, pong: true });

    var body;
    try { body = JSON.parse(buf.toString('utf8')); }
    catch (e) { return res.status(400).json({ error: 'body is not JSON' }); }

    var route = ROUTES[event];
    if (!route) return res.status(200).json({ ignored: event });

    var rows;
    try { rows = route(body) || []; }
    catch (e) { console.error('[hook-github] could not read a ' + event, e); return res.status(200).json({ ignored: event, error: 'unreadable payload' }); }
    if (!rows.length) return res.status(200).json({ ignored: event + (body.action ? '.' + body.action : '') });

    /* Firestore missing is not the same as the delivery being bad. 503 shows
       red in GitHub's delivery list and keeps the Redeliver button useful,
       where a 200 would have quietly dropped the week on the floor. */
    if (A.isDegraded()) { console.error('[hook-github] dropped ' + rows.length + ' rows:', A.degradedReason()); return res.status(503).json({ error: A.degradedReason() }); }

    return C.recordAll(rows).then(function (written) {
      res.status(200).json({ recorded: written.length, event: event });
    });
  }).catch(function (e) {
    console.error('[hook-github]', e);
    if (!res.headersSent) res.status(500).json({ error: 'could not record' });
  });
};

/* Must come AFTER the assignment above, exactly as in stripe-webhook.js:
   `module.exports = fn` replaces the whole exports object, so a config set
   before it is discarded — and a parsed body cannot be signature-checked. */
module.exports.config = { api: { bodyParser: false } };
