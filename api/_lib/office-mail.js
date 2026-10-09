/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./admin');
/* Credentials stay on the server. No provider/model owns a mailbox. */
function request(path, method, body) {
  if (!process.env.AGENTMAIL_API_KEY) throw A.httpError(503, 'AgentMail is not connected. Configure AGENTMAIL_API_KEY on the server.');
  var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 15000);
  return fetch('https://api.agentmail.to/v0' + path, { method: method, headers: { Authorization: 'Bearer ' + process.env.AGENTMAIL_API_KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal, redirect: 'error' })
    .then(function (r) { if (!r.ok) throw A.httpError(502, 'AgentMail request failed (HTTP ' + r.status + '); review the provider before retrying.'); return r.json(); })
    .finally(function () { clearTimeout(timer); });
}
function provision(db, caller, b) {
  if (!caller.staff || caller.agent) throw A.httpError(403, 'Only staff can provision an inbox');
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(String(b.id || ''))) throw A.httpError(400, 'Invalid agent');
  var ref = db.collection('sales_config').doc('office_agent_' + b.id);
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'Save the agent first');
    var p = s.data();
    if (p.mailbox && p.mailbox.inboxId) return { ok: true, mailbox: p.mailbox };
    /* Stable provider client_id recovers unknown outcomes without new inboxes. */
    var body = { display_name: p.name + ' | ClearSky AI assistant', client_id: 'clearsky-office-' + p.id };
    if (process.env.AGENTMAIL_DOMAIN) body.domain = process.env.AGENTMAIL_DOMAIN;
    var existing = String(b.inboxId || '').trim();
    if (existing && (!/^[a-zA-Z0-9@._+-]{3,254}$/.test(existing))) throw A.httpError(400, 'Invalid inbox ID');
    return (existing ? request('/inboxes/' + encodeURIComponent(existing), 'GET') : request('/inboxes', 'POST', body)).then(function (inbox) {
      if (!inbox.inbox_id || !inbox.email) throw A.httpError(502, 'AgentMail returned no inbox identity');
      var mailbox = { provider: 'agentmail', inboxId: inbox.inbox_id, email: inbox.email, connectedAt: new Date().toISOString() };
      return ref.set({ mailbox: mailbox, sender: inbox.email }, { merge: true }).then(function () { return { ok: true, mailbox: mailbox }; });
    });
  });
}
function activity(db, caller, b) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(String(b.id || ''))) throw A.httpError(400, 'Invalid activity');
  var taskRef = db.collection('sales_config').doc('office_task_' + b.id), task, profile;
  return taskRef.get().then(function (snap) {
    if (!snap.exists) throw A.httpError(404, 'Activity not found');
    task = snap.data();
    if (task.status !== 'running' || task.claim !== b.claim || task.claimedBy !== caller.by) throw A.httpError(409, 'Matching running claim required');
    return db.collection('sales_config').doc('office_agent_' + task.agentId).get();
  }).then(function (s) {
    profile = s.exists ? s.data() : null;
    if (!profile || !profile.enabled || !profile.mailbox) throw A.httpError(409, 'Agent inbox is not connected');
    var path = '/inboxes/' + encodeURIComponent(profile.mailbox.inboxId);
    if (b.operation === 'messages') return request(path + '/messages?limit=50', 'GET');
    if (b.operation !== 'draft' || ['email-draft', 'follow-up'].indexOf(task.kind) < 0) throw A.httpError(400, 'Choose messages or draft on an email activity');
    if (task.draftId) return { draft_id: task.draftId, duplicate: true };
    var S = require('./sales'), to = S.normEmail(b.to), subject = S.clean(b.subject, 200), text = S.clean(b.text, 12000);
    if (!to || !subject || !text) throw A.httpError(400, 'Recipient, subject and text are required');
    return Promise.all([db.collection('sales_prospects').doc(task.prospectId).get(), db.collection('sales_config').doc('current').get(), db.collection('sales_suppressions').get()]).then(function (r) {
      var prospect = r[0].exists ? r[0].data() : {}, config = r[1].exists ? r[1].data() : {}, suppressed = {};
      r[2].forEach(function (x) { suppressed[x.id] = 1; });
      if (!(prospect.contacts || []).some(function (c) { return c.email === to; })) throw A.httpError(400, 'Recipient must belong to this CRM account');
      var screen = S.screen(to, { suppressed: suppressed, offLimits: config.offLimits || [], inbound: !!prospect.inbound });
      if (!screen.ok) throw A.httpError(403, screen.reason);
      return request(path + '/drafts', 'POST', { to: [to], cc: profile.cc, subject: subject,
        text: text + '\n\n' + profile.name + '\nClearSky business development · AI assistant\n' + profile.mailbox.email,
        client_id: 'office-task-' + task.id }).then(function (draft) {
        if (!draft.draft_id) throw A.httpError(502, 'Provider returned no draft ID');
        return taskRef.set({ draftId: draft.draft_id }, { merge: true }).then(function () {
          return db.collection('sales_activity').doc('office_draft_' + task.id).set({ kind: 'email-drafted', at: new Date().toISOString(),
            by: caller.by, prospectId: task.prospectId, agentId: profile.id, to: to, ref: draft.draft_id,
            summary: task.desk.toUpperCase() + ': ' + profile.name + ' prepared ' + subject + ' (AgentMail; not sent)' });
        }).then(function () { return { draft_id: draft.draft_id, inbox: profile.mailbox.email, cc: profile.cc, sent: false }; });
      });
    });
  });
}
module.exports = { provision: provision, request: request, activity: activity };
