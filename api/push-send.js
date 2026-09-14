/* POST /api/push-send — send one notification to a person's devices.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Body: { to?: <uid|email>, title, body, url?, tag?, requireInteraction? }

   ── WHO MAY RING SOMEONE ELSE'S PHONE ──

   Anyone signed in may push to THEMSELVES — that is how the dashboard tests
   its own setup and how the twin nudges Thomas on his own account. Pushing to
   another person is staff-only. A notification is an interruption that
   bypasses every app the recipient chose to close, and an endpoint where any
   authenticated tenant user could address any other is a harassment vector
   with our name on the banner.

   ── DEAD SUBSCRIPTIONS PRUNE THEMSELVES ──

   404 and 410 from a push service mean the subscription is gone for good
   (app deleted, browser data cleared). They are deleted on the spot rather
   than retried forever: the alternative is a table that only grows and a
   send that gets slower every month. Any other error is left alone, because
   a transient 500 from a push service is not evidence of anything.

   The private key lives in VAPID_PRIVATE_KEY and never appears in a response,
   a log line, or an error message. */
'use strict';
var webpush = require('web-push');
var A = require('./_lib/admin');

var COL = 'push_subs';

function configured() {
  var pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:tom@clearsky-usa.com', pub, priv);
  return true;
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  if (!configured()) throw A.httpError(503, 'push is not configured on this deployment');

  return A.authenticate(req).then(function (me) {
    var body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};

    var to = String(body.to || '').trim();
    var self = !to || to === me.uid || (me.email && to.toLowerCase() === me.email.toLowerCase());
    if (!self && !me.staff) throw A.httpError(403, 'only staff may notify someone else');

    var title = String(body.title || 'JARVIS').slice(0, 120);
    var text = String(body.body || '').slice(0, 400);
    if (!text && !body.title) throw A.httpError(400, 'nothing to say');

    var payload = JSON.stringify({
      title: title, body: text,
      url: String(body.url || '/mission').slice(0, 300),
      tag: String(body.tag || 'jarvis').slice(0, 60),
      requireInteraction: !!body.requireInteraction
    });

    var db = A.db();
    var q = self
      ? db.collection(COL).where('uid', '==', me.uid)
      : (to.indexOf('@') > 0
          ? db.collection(COL).where('email', '==', to.toLowerCase())
          : db.collection(COL).where('uid', '==', to));

    return q.get().then(function (snap) {
      if (snap.empty) return { ok: true, sent: 0, note: 'nobody is subscribed' };
      var jobs = snap.docs.map(function (doc) {
        var d = doc.data();
        return webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, payload)
          .then(function () { return { ok: true }; })
          .catch(function (err) {
            var code = err && err.statusCode;
            if (code === 404 || code === 410) {
              return doc.ref.delete().then(function () { return { ok: false, pruned: true }; });
            }
            return { ok: false, code: code || 0 };
          });
      });
      return Promise.all(jobs).then(function (rs) {
        return {
          ok: true,
          sent: rs.filter(function (r) { return r.ok; }).length,
          pruned: rs.filter(function (r) { return r.pruned; }).length,
          failed: rs.filter(function (r) { return !r.ok && !r.pruned; }).length
        };
      });
    });
  });
});
