/* POST /api/push-subscribe — remember where to reach one signed-in person.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Body: { subscription: <PushSubscription JSON>, ua?, installed? }

   ── A SUBSCRIPTION BELONGS TO A PERSON, NOT TO A PAGE ──

   Stored under the authenticated uid, never taken from the body. An endpoint
   that accepted "who is this for" from the caller would let anyone register a
   device against anyone's account and receive their notifications — the whole
   point of push being that it arrives without the recipient asking.

   ── ONE DOCUMENT PER ENDPOINT URL ──

   The endpoint URL is the identity of a device+browser, so it is the document
   id (hashed, because it is long and contains characters Firestore paths
   dislike). Re-subscribing from the same phone therefore updates in place
   instead of leaving a second copy that gets pushed to twice, and a phone
   that has been re-installed gets a new URL and a new row while the dead one
   sits until the sender prunes it on a 410.

   DELETE removes the caller's own subscription — "turn notifications off" has
   to mean something server-side, or the phone stops showing them while we
   keep paying to send them. */
'use strict';
var crypto = require('crypto');
var A = require('./_lib/admin');

var COL = 'push_subs';

function idOf(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 40);
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST' && req.method !== 'DELETE') throw A.httpError(405, 'POST or DELETE');

  return A.authenticate(req).then(function (me) {
    var body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};
    var sub = body.subscription || {};
    var endpoint = sub.endpoint;
    if (!endpoint || typeof endpoint !== 'string') throw A.httpError(400, 'no subscription endpoint');
    /* Only ever talk to a real push service over TLS. */
    if (!/^https:\/\//.test(endpoint)) throw A.httpError(400, 'endpoint must be https');

    var db = A.db();
    var ref = db.collection(COL).doc(idOf(endpoint));

    if (req.method === 'DELETE') {
      return ref.get().then(function (snap) {
        /* Deleting someone else's row would be a quiet way to switch off
           another person's alerts, so the owner is checked even here. */
        if (snap.exists && snap.data().uid !== me.uid) throw A.httpError(403, 'not yours');
        return ref.delete();
      }).then(function () { return { ok: true, removed: true }; });
    }

    var keys = sub.keys || {};
    if (!keys.p256dh || !keys.auth) throw A.httpError(400, 'subscription is missing its keys');

    return ref.set({
      uid: me.uid,
      email: me.email || '',
      orgId: me.orgId || '',
      endpoint: endpoint,
      keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
      ua: String(body.ua || '').slice(0, 200),
      installed: !!body.installed,
      updated: A.FieldValue().serverTimestamp()
    }, { merge: true }).then(function () { return { ok: true }; });
  });
});
