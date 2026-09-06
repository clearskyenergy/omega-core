/* POST /api/user-admin — ClearSky staff only. The account operations a support
   desk actually needs, which Firestore rules cannot express because they act on
   Firebase Auth rather than on a document.
   Body: { action: 'resetLink' | 'setEmail' | 'disable' | 'enable',
           targetUid? , targetEmail?, newEmail?, orgId? }

   ── WHY resetLink RETURNS A LINK INSTEAD OF SENDING ONE ──
   generatePasswordResetLink() mints a credential-bearing URL. Emailing it from
   here would mean this endpoint decides where a password reset lands, and a
   single wrong address in a support ticket hands over the account. Staff get
   the link back and pass it on deliberately, through a channel they can see.

   ── setEmail IS THE SHARP ONE ──
   Changing the sign-in address of an account is, in one call, account
   takeover — which is exactly why it is staff-only, why the old and new
   address are both written to an audit row, and why it refuses to move an
   account onto a domain that is not already a tenant. A support desk needs to
   fix a typo in somebody's address; it does not need to move an account into
   an org it was never part of, and the orgId derived from the email is what
   every rule in this database scopes on. */
'use strict';
var A = require('./_lib/admin');

var ACTIONS = ['resetLink', 'setEmail', 'disable', 'enable'];

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var action = String(b.action || '');
  if (ACTIONS.indexOf(action) < 0) throw A.httpError(400, 'action must be one of ' + ACTIONS.join(', '));

  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    var adm = A.admin(), db = A.db(), FV = A.FieldValue();
    var lookup = b.targetUid
      ? adm.auth().getUser(String(b.targetUid))
      : adm.auth().getUserByEmail(String(b.targetEmail || '').toLowerCase());

    return lookup.catch(function () { throw A.httpError(404, 'no such user'); })
      .then(function (user) {
        /* Nobody administers themselves through here. Locking yourself out, or
           moving your own address, is not a support action and it removes the
           second pair of eyes from the only account that can undo it. */
        if (user.uid === caller.uid) throw A.httpError(400, 'use your own account settings for your own account');

        function audit(what, extra) {
          return db.collection('omega_audit').add(Object.assign({
            at: FV.serverTimestamp(), by: caller.email, action: what,
            targetUid: user.uid, targetEmail: user.email || null
          }, extra || {}));
        }

        if (action === 'resetLink') {
          return adm.auth().generatePasswordResetLink(user.email)
            .then(function (link) {
              return audit('resetLink').then(function () {
                return { ok: true, email: user.email, link: link,
                         note: 'Send this to the account holder yourself. It is not emailed from here.' };
              });
            });
        }

        if (action === 'setEmail') {
          var next = String(b.newEmail || '').toLowerCase().trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) throw A.httpError(400, 'newEmail is not an email address');
          if (next === String(user.email || '').toLowerCase()) throw A.httpError(400, 'that is already the address');
          var nextOrg = A.orgOf(next);
          /* The email domain IS the tenant key. Moving somebody onto a domain
             with no omega_orgs record puts them in an org that does not exist,
             and every scoped read they make silently returns nothing. */
          return db.collection('omega_orgs').doc(nextOrg).get().then(function (org) {
            if (!org.exists && !A.isStaffEmail(next)) {
              throw A.httpError(400, 'no tenant for ' + nextOrg + ' — create the org before moving an account onto it');
            }
            return adm.auth().updateUser(user.uid, { email: next })
              .then(function () { return audit('setEmail', { from: user.email, to: next }); })
              .then(function () { return { ok: true, uid: user.uid, from: user.email, to: next }; });
          });
        }

        var disable = (action === 'disable');
        return adm.auth().updateUser(user.uid, { disabled: disable })
          .then(function () { return audit(action); })
          .then(function () { return { ok: true, uid: user.uid, disabled: disable }; });
      });
  });
});
