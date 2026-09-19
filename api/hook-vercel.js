/* POST /api/hook-vercel — Vercel webhook → change_log
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Point the team at this URL (Vercel → Team Settings → Webhooks → Create):
     Endpoint   https://<your host>/api/hook-vercel
     Projects   all of them, or the ones you want logged
     Events     Deployment created / succeeded / error / canceled / promoted,
                Project created / removed, Domain created
   Vercel shows the signing secret once, on creation. It goes in Vercel →
   Settings → Environment Variables as VERCEL_WEBHOOK_SECRET.

   WHAT A VERCEL WEBHOOK CANNOT TELL YOU. Deployments, projects and domains
   are the whole of it. Changing an environment variable, a build setting, a
   team member's role or a domain's DNS is NOT a webhook event on any plan —
   those live in the team Audit Log, which is an Enterprise feature with no
   webhook and no public API. So "every change in Vercel" here means every
   change that Vercel is willing to say happened, and the Changes screen says
   as much rather than letting a quiet gap read as a quiet week.

   THE SIGNATURE IS SHA-1, not the SHA-256 GitHub uses one file over. That is
   Vercel's choice, not ours; the header is x-vercel-signature and it carries
   the bare hex digest with no algorithm prefix. */
'use strict';
var crypto = require('crypto');
var A = require('./_lib/admin');
var C = require('./_lib/changelog');

function verify(buf, req) {
  var secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) return { ok: false, why: 'VERCEL_WEBHOOK_SECRET is not set on this deployment' };
  var sent = req.headers['x-vercel-signature'];
  if (!sent) return { ok: false, why: 'no x-vercel-signature header' };
  var mine = crypto.createHmac('sha1', secret).update(buf).digest('hex');
  return C.safeEqual(sent, mine) ? { ok: true } : { ok: false, why: 'signature does not match' };
}

/* Vercel names the person two ways and neither is always present. The commit
   author is the better answer — it is who wrote the code that is going live,
   and it matches the login the GitHub rows are keyed on, so one person does
   not become two rows in the report. payload.user is who pressed the button,
   which for a git push is the integration rather than a human. */
function who(payload) {
  var d = payload.deployment || {}, m = d.meta || {};
  var login = m.githubCommitAuthorLogin || m.gitlabCommitAuthorLogin || m.bitbucketCommitAuthorLogin;
  if (login) {
    return { login: login, name: m.githubCommitAuthorName || login, agent: C.looksAgentic(m.githubCommitMessage) };
  }
  var u = payload.user || payload.team || {};
  return { login: u.username || null, name: u.name || u.username || null, email: u.email || null };
}

function target(payload) {
  var d = payload.deployment || {};
  /* `target` is 'production' or 'staging'; anything else is a preview, and a
     preview is far more useful labelled with its branch than with the word
     "preview" repeated forty times down a page. */
  return payload.target || d.target || (d.meta && (d.meta.githubCommitRef || d.meta.gitlabCommitRef)) || 'preview';
}

function linkTo(payload) {
  var d = payload.deployment || {};
  if (d.inspectorUrl) return d.inspectorUrl;
  if (d.url) return /^https?:/.test(d.url) ? d.url : 'https://' + d.url;
  return null;
}

function project(payload) {
  var d = payload.deployment || {};
  return (payload.project && (payload.project.name || payload.project.id)) || d.name || null;
}

/* The commit subject where there is one — "deployed omega-core to production"
   twelve times in a row says nothing, and the same line with what was in it
   says everything. */
function what(payload) {
  var m = (payload.deployment && payload.deployment.meta) || {};
  var msg = m.githubCommitMessage || m.gitlabCommitMessage || m.bitbucketCommitMessage;
  return msg ? ' — ' + C.subject(msg, 90) : '';
}

var DEPLOY = {
  'deployment.created':   { kind: 'deploy_started',  verb: 'started a deploy of' },
  'deployment.succeeded': { kind: 'deploy_ready',    verb: 'deployed' },
  'deployment.ready':     { kind: 'deploy_ready',    verb: 'deployed' },
  'deployment.error':     { kind: 'deploy_error',    verb: 'broke the build of' },
  'deployment.canceled':  { kind: 'deploy_canceled', verb: 'cancelled a deploy of' },
  'deployment.promoted':  { kind: 'deploy_promoted', verb: 'promoted' }
};

function rowsFor(body) {
  var type = body.type, payload = body.payload || {};
  var at = body.createdAt ? new Date(body.createdAt).toISOString() : new Date().toISOString();
  var d = payload.deployment || {};
  var proj = project(payload);

  var dep = DEPLOY[type];
  if (dep) {
    var env = target(payload);
    /* succeeded and ready are the same moment described twice, and a team
       subscribed to both was counting every deploy as two. One key for the
       pair means whichever arrives second overwrites the first. */
    var slot = (dep.kind === 'deploy_ready') ? 'ready' : dep.kind;
    return [{
      source: 'vercel', kind: dep.kind,
      key: 'vc:' + (d.id || d.uid || body.id) + ':' + slot,
      at: at, actor: who(payload), project: proj, target: env,
      title: dep.verb + ' ' + (proj || 'a project') + ' to ' + env + what(payload),
      url: linkTo(payload),
      repo: (d.meta && d.meta.githubOrg && d.meta.githubRepo) ? (d.meta.githubOrg + '/' + d.meta.githubRepo) : null
    }];
  }

  if (type === 'project.created' || type === 'project.removed') {
    return [{
      source: 'vercel', kind: type === 'project.created' ? 'project_created' : 'project_removed',
      key: 'vc:' + type + ':' + ((payload.project && payload.project.id) || proj || body.id),
      at: at, actor: who(payload), project: proj, target: null,
      title: (type === 'project.created' ? 'created the Vercel project ' : 'removed the Vercel project ') + (proj || '(unnamed)'),
      url: null
    }];
  }

  if (type === 'domain.created') {
    var name = (payload.domain && payload.domain.name) || null;
    return [{
      source: 'vercel', kind: 'domain_created',
      key: 'vc:domain:' + (name || body.id),
      at: at, actor: who(payload), project: proj, target: name,
      title: 'added the domain ' + (name || '(unnamed)'),
      url: name ? 'https://' + name : null
    }];
  }

  return [];
}

module.exports = function (req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  return C.rawBody(req).then(function (buf) {
    var v = verify(buf, req);
    if (!v.ok) { console.warn('[hook-vercel] refused:', v.why); return res.status(401).json({ error: v.why }); }

    var body;
    try { body = JSON.parse(buf.toString('utf8')); }
    catch (e) { return res.status(400).json({ error: 'body is not JSON' }); }

    var rows;
    try { rows = rowsFor(body) || []; }
    catch (e) { console.error('[hook-vercel] could not read a ' + body.type, e); return res.status(200).json({ ignored: body.type, error: 'unreadable payload' }); }
    if (!rows.length) return res.status(200).json({ ignored: body.type || 'unknown' });

    if (A.isDegraded()) { console.error('[hook-vercel] dropped ' + rows.length + ' rows:', A.degradedReason()); return res.status(503).json({ error: A.degradedReason() }); }

    return C.recordAll(rows).then(function (written) {
      res.status(200).json({ recorded: written.length, event: body.type });
    });
  }).catch(function (e) {
    console.error('[hook-vercel]', e);
    if (!res.headersSent) res.status(500).json({ error: 'could not record' });
  });
};

module.exports.config = { api: { bodyParser: false } };
