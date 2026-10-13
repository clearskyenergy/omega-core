/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* Office profiles and durable work live in the existing server-only sales_config
   collection. Customer facts remain in sales_prospects; outcomes in sales_activity. */
var A = require('./admin');
var S = require('./sales');
var crypto = require('crypto');
function fail(code, text) { throw A.httpError(code, text); }
function id(value) { var v = String(value || ''); if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(v)) fail(400, 'Invalid Office ID'); return v; }
function staff(c) { if (!c.staff || c.agent) fail(403, 'Only staff can configure agents and assign work'); }
function ref(db, kind, key) { return db.collection('sales_config').doc('office_' + kind + '_' + id(key)); }
function rows(snap) { var out = []; snap.forEach(function (s) { out.push(s.data()); }); return out; }
function list(db) {
  return db.collection('sales_config').where('officeType', 'in', ['agent', 'task']).limit(1000).get().then(function (snap) {
    var all = rows(snap);
    return { agents: all.filter(function (x) { return x.officeType === 'agent'; }), tasks: all.filter(function (x) { return x.officeType === 'task'; }), capped: all.length === 1000,
      capabilities: { calling: false, mailboxProvisioning: !!process.env.AGENTMAIL_API_KEY, execution: 'Sales and Marketing scheduled routines' } };
  });
}
function profile(b) {
  var p = { id: id(b.id), officeType: 'agent', name: S.clean(b.name, 80), desk: b.desk,
    instructions: S.clean(b.instructions, 6000), sender: S.normEmail(b.sender), cc: [], enabled: b.enabled === true };
  if (!p.name || ['sales', 'marketing'].indexOf(p.desk) < 0) fail(400, 'Name and Sales or Marketing desk required');
  if (b.sender && !p.sender) fail(400, 'Use an existing clearsky-usa.com mailbox');
  if (!Array.isArray(b.cc) || b.cc.length > 10) fail(400, 'CC requires at most 10 email addresses');
  b.cc.forEach(function (v) { var e = S.normEmail(v); if (!e) fail(400, 'Invalid CC address'); if (p.cc.indexOf(e) < 0) p.cc.push(e); });
  return p;
}
function save(db, c, b, now) {
  staff(c); var p = profile(b); p.updatedAt = new Date(now).toISOString(); p.updatedBy = c.by;
  return db.runTransaction(function (tx) {
    var r = ref(db, 'agent', p.id);
    return tx.get(r).then(function (s) {
      if (s.exists && s.data().desk !== p.desk) fail(409, 'An existing agent cannot change departments');
      if (s.exists && s.data().mailbox) { p.mailbox = s.data().mailbox; p.sender = p.mailbox.email; }
      else if (p.sender && p.sender.split('@')[1] !== 'clearsky-usa.com') fail(400, 'Use an existing clearsky-usa.com mailbox');
      tx.set(r, p); return { ok: true, agent: p };
    });
  });
}
function addTask(db, c, b, now) {
  staff(c);
  var t = { id: id(b.id), officeType: 'task', agentId: id(b.agentId), prospectId: String(b.prospectId || '').toLowerCase(),
    kind: b.kind, title: S.clean(b.title, 160), instructions: S.clean(b.instructions, 4000), due: String(b.due || ''),
    status: 'queued', createdAt: new Date(now).toISOString(), createdBy: c.by };
  if (['research', 'email-draft', 'call', 'follow-up'].indexOf(t.kind) < 0 || !t.title) fail(400, 'Choose an activity and title');
  if (!t.prospectId || /[\/]/.test(t.prospectId) || t.prospectId.length > 254) fail(400, 'Choose a CRM account');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.due) || !isFinite(Date.parse(t.due + 'T12:00:00Z')) || new Date(t.due + 'T12:00:00Z').toISOString().slice(0,10) !== t.due) fail(400, 'A valid due date is required');
  return db.runTransaction(function (tx) {
    var r = ref(db, 'task', t.id);
    return Promise.all([tx.get(r), tx.get(ref(db, 'agent', t.agentId)), tx.get(db.collection('sales_prospects').doc(t.prospectId))]).then(function (s) {
      if (s[0].exists) return { ok: true, task: s[0].data(), duplicate: true };
      if (!s[1].exists || !s[2].exists) fail(404, 'Agent or CRM account not found');
      t.desk = s[1].data().desk;
      if (t.kind === 'call') { t.status = 'blocked'; t.outcome = 'Calling service is not connected. Prepare a call brief or record a manual call outcome.'; }
      tx.set(r, t); return { ok: true, task: t };
    });
  });
}
function transition(db, c, b, now) {
  var r = ref(db, 'task', b.id), action = b.operation;
  return db.runTransaction(function (tx) {
    return tx.get(r).then(function (snap) {
      if (!snap.exists) fail(404, 'Activity not found');
      var t = snap.data();
      return tx.get(ref(db, 'agent', t.agentId)).then(function (as) {
        var p = as.exists ? as.data() : null;
        if (action === 'claim') {
          if (!p || !p.enabled || t.status !== 'queued') fail(409, 'Activity is not available');
          var centralDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
          if (t.due > centralDay) fail(409, 'Activity is not due yet');
          if (t.kind === 'call') fail(409, 'Calling service is not connected');
          t.status = 'running'; t.claim = crypto.randomBytes(24).toString('hex'); t.claimedBy = c.by;
        } else if (action === 'finish') {
          if (t.status !== 'running' || t.claimedBy !== c.by || !b.claim || b.claim !== t.claim) fail(409, 'A matching running claim is required');
          if (['completed', 'blocked', 'needs_review'].indexOf(b.status) < 0) fail(400, 'Invalid result');
          t.status = b.status; t.outcome = S.clean(b.outcome, 2000); t.evidence = S.clean(b.evidence, 1000);
          if (!t.outcome || (t.status === 'completed' && !t.evidence)) fail(400, 'Outcome and completion evidence required');
        } else if (action === 'record') {
          staff(c);
          if (['queued', 'blocked', 'needs_review'].indexOf(t.status) < 0) fail(409, 'Running or completed activity cannot be overwritten');
          t.outcome = S.clean(b.outcome, 2000); if (!t.outcome) fail(400, 'Enter the actual outcome');
          t.status = 'completed'; t.evidence = 'Recorded manually by ' + c.by;
        } else fail(400, 'Unknown activity operation');
        t.updatedAt = new Date(now).toISOString();
        tx.set(r, t);
        tx.set(db.collection('sales_activity').doc('office_' + t.id + '_' + action), {
          kind: action === 'record' && t.kind === 'call' ? 'call' : 'note', at: t.updatedAt, by: c.by, prospectId: t.prospectId, agentId: t.agentId,
          summary: t.desk.toUpperCase() + ': ' + (p ? p.name : t.agentId) + ' · ' + t.title + ' · ' + t.status + (t.outcome ? ' — ' + t.outcome : ''), ref: t.evidence || ''
        });
        return { ok: true, task: t };
      });
    });
  });
}
module.exports = { list: list, save: save, addTask: addTask, transition: transition, profile: profile };
