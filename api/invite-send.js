/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/invite-send — email an invitation that already exists.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { email, workspace?: 'osa' }
   → 200 { ok, sent, from, to }

   WHAT THIS ENDPOINT DELIBERATELY CANNOT DO.
   It never creates, edits or reads an access grant into existence. It refuses
   unless omega_invites/{email} ALREADY exists — a record only a portal
   administrator can write, and only through Firestore rules. So the worst a
   stolen token can do is re-send an email somebody already meant to send, to
   an address somebody already chose. It is not a mail relay: the recipient is
   the invite's document id, never a value from the request body.

   THREE THINGS ARE CHECKED, IN THIS ORDER:
     1. the caller holds a valid Firebase ID token
     2. the caller has an omega_users record with a role that can approve
        anyone — the same test the client's can('approve_any') makes, made
        again here because a client-side check is a courtesy, not a gate
     3. the invitation exists and has not been emailed into the ground

   The destination URL is a server constant. It is the one field an attacker
   would most want to control — an invitation is a link people are primed to
   click — so it is never taken from the request.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var M = require('./_lib/mail');

/* The workspaces that can send invitations this way. Adding one is a deploy,
   which for "may email our users on our letterhead" is the right ceremony. */
var WORKSPACES = {
  osa: {
    label: 'OSA Workspace',
    url: process.env.OSA_PORTAL_URL || 'https://osa.clearskyomega.com/portfolio.html',
    users: 'omega_users',
    invites: 'omega_invites'
  }
};

/* Mirrors ROLES[].can in tenants/osa/access-data.js. Duplicated on purpose:
   the labels go into an email, and a label taken from the request body is
   attacker-controlled text on our letterhead. Keep the two in step. */
var CAN_INVITE = { owner: 1, admin: 1 };
var ROLE_LABEL = {
  owner: 'Owner', admin: 'Administrator', limited_admin: 'Limited administrator',
  partner_admin: 'Partner administrator', member: 'Member', viewer: 'Viewer'
};

/* Enough to stop a loop or a bored admin, loose enough never to block real
   use: an invitation gets one send, plus a handful of deliberate re-sends. */
var MAX_SENDS = 5;
var MIN_GAP_MS = 60 * 1000;

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var ws = WORKSPACES[String(b.workspace || 'osa').toLowerCase()];
  if (!ws) throw A.httpError(400, 'unknown workspace');

  var email = String(b.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 1) throw A.httpError(400, 'a full email address is required');

  return A.authenticate(req).then(function (caller) {
    var db = A.db();
    return db.collection(ws.users).doc(caller.uid).get().then(function (us) {
      var me = us.exists ? (us.data() || {}) : null;
      if (!me) throw A.httpError(403, 'you do not have an account in this workspace');
      if (me.status && me.status !== 'active') throw A.httpError(403, 'your account is ' + me.status);
      if (!CAN_INVITE[me.role]) throw A.httpError(403, 'administrators only');

      var ref = db.collection(ws.invites).doc(email);
      return ref.get().then(function (is) {
        /* The invitation is the authorisation. No record, no email — and the
           message says which of the two is missing, because "record it first"
           is a different fix from "you are not an administrator". */
        if (!is.exists) throw A.httpError(404, 'no invitation on file for ' + email + ' — record it first');
        var inv = is.data() || {};

        var count = Number(inv.emailCount || 0);
        if (count >= MAX_SENDS) throw A.httpError(429, 'this invitation has already been emailed ' + count + ' times');
        var last = inv.emailedAt && inv.emailedAt.toMillis ? inv.emailedAt.toMillis() : 0;
        if (last && Date.now() - last < MIN_GAP_MS) throw A.httpError(429, 'just sent — try again in a minute');

        return M.templates.invite({
          email: email,
          workspace: ws.label,
          url: ws.url,
          roleLabel: ROLE_LABEL[inv.role] || 'a member',
          orgName: inv.orgName || '',
          note: inv.note || '',
          invitedBy: caller.email,
          invitedByName: me.name || me.displayName || caller.email
        }).then(function (r) {
          /* Best-effort by contract: a mail failure is reported, never thrown,
             and the counter only moves when something actually went out. */
          if (!r || !r.ok) return { ok: false, sent: false, to: email, error: (r && (r.error || (r.skipped ? 'no mailbox configured on the server' : 'send failed'))) || 'send failed' };
          return ref.set({
            emailedAt: A.FieldValue().serverTimestamp(),
            emailedBy: caller.email,
            emailCount: count + 1
          }, { merge: true }).then(function () {
            return { ok: true, sent: true, to: email, from: r.from };
          });
        });
      });
    });
  });
});
