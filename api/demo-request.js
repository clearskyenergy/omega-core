/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/demo-request — "Request a demo" on www.clearskyomega.com
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PUBLIC, no token: the marketing site (clearsky-omega-site contact.html)
   posts here from www.clearskyomega.com, which admin.js cors() admits.

   What it does, in order:
     1. refuses a bot quietly (the honeypot field a person never sees gets a
        plain { ok:true } and nothing is stored or mailed);
     2. holds the line on volume: 5 a minute per address in memory (the
        embed limiter), and a durable 100 a day in sales_counters, taken in
        a transaction — past it the site falls back to the visitor's own mail
        app, so a real person still reaches dev@clearsky-usa.com;
     3. files the lead: sales_activity (kind demo-request, the words, where
        they came from) and the prospect (sales_prospects, keyed by the work
        domain, stage `contacted`, inbound) — api/_lib/sales.js is the rule;
     4. mails ClearSky (MAIL_NOTIFY, default dev@clearsky-usa.com) with
        Reply-To set to the visitor, so answering is one click.
   It answers { ok:true } only after the lead is stored; "Received" on the
   page is the server's yes, never an assumption.

   What it never does: mail the visitor (an open form that sends mail to any
   address typed into it is a relay for somebody else's spam), create an
   account, a tenant or a trial, or reveal anything from the database.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var S = require('./_lib/sales');
var M = require('./_lib/mail');
var E = require('./_lib/embed');

var DAILY_CAP = 100, PER_MINUTE = 5;

function clientIp(req) {
  var h = req.headers || {};
  return String(h['x-forwarded-for'] || h['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim().slice(0, 64);
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') throw A.httpError(400, 'a JSON body is required');
  E.rateLimit('demo:' + clientIp(req), PER_MINUTE);
  var v = S.validDemo(body);
  if (v.spam) return { ok: true };
  if (!v.ok) throw A.httpError(400, v.error);
  var d = v.value, now = Date.now(), at = new Date(now).toISOString(), day = at.slice(0, 10);
  var db = A.db();
  var capRef = db.collection('sales_counters').doc('demo-' + day);
  return db.runTransaction(function (tx) {
    return tx.get(capRef).then(function (s) {
      var n = s.exists ? Number((s.data() || {}).n || 0) : 0;
      if (n >= DAILY_CAP) return false;
      tx.set(capRef, { n: n + 1, day: day, updatedAt: at }, { merge: true });
      return true;
    });
  }).then(function (room) {
    if (!room) throw A.httpError(429, 'The form is busy today; your mail app will open instead.');
    var pid = S.prospectIdFor({ email: d.email });
    var pref = db.collection('sales_prospects').doc(pid);
    var aref = db.collection('sales_activity').doc();
    return pref.get().then(function (s) {
      var inc = S.cleanProspect({ company: d.company, email: d.email, contacts: [{ name: d.name, email: d.email, source: 'demo-request' }],
        source: { kind: 'demo-request', ref: aref.id }, inbound: true, summary: d.interest ? 'Asked for a demo: ' + d.interest : 'Asked for a demo' });
      var merged = S.mergeProspect(s.exists ? (s.data() || {}) : null, inc.prospect, now);
      merged.lastTouchAt = at; merged.score = S.score(merged, now);
      if (!s.exists) merged.createdBy = 'website';
      merged.updatedBy = 'website';
      var batch = db.batch();
      batch.set(pref, merged);
      batch.set(aref, { kind: 'demo-request', at: at, by: 'website', prospectId: pid, name: d.name, email: d.email, company: d.company,
        vertical: d.vertical, interest: d.interest, message: d.message, page: d.page, source: d.source,
        summary: d.name + (d.company ? ' (' + d.company + ')' : '') + ' asked for a demo' + (d.interest ? ': ' + d.interest : '') });
      return batch.commit();
    }).then(function () {
      /* best-effort: the stored row is the record, the mail is the courtesy
         copy, and a mail failure never fails the visitor */
      return Promise.resolve(M.templates.demoRequestAlert ? M.templates.demoRequestAlert(Object.assign({ id: aref.id, sourceWord: S.sourceOf(d.source) }, d)) : null)
        .catch(function (e) { console.error('[demo-request] mail', e && e.message); return null; });
    }).then(function () { return { ok: true, id: aref.id }; });
  });
});
