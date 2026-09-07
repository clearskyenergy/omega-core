/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/mail.js — transactional email through a Google Workspace mailbox
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   SMTP with an App Password. No OAuth dance, no domain-wide delegation.
     Google Account (e.g. support@csebuilders.com) → Security →
     2-Step Verification ON → App passwords → "omega-core" → 16 chars.

   ENV (Vercel):
     MAIL_USER      support@csebuilders.com     the mailbox that sends
     MAIL_PASS      xxxx xxxx xxxx xxxx         the app password
     MAIL_FROM      "ClearSky-OMEGA <support@csebuilders.com>"   optional
     MAIL_NOTIFY    dev@clearsky-usa.com        where signup alerts go (comma-separated ok);
                                                this is the default if unset

   A SECOND MAILBOX, FOR MAIL ADDRESSED TO A PERSON.
   Workspace lifecycle mail is from the product and support@ is right for it.
   An invitation is from a colleague - it should come from the address that
   answers when they reply, and for the OSA JV that is dev@clearsky-usa.com.

     MAIL_DEV_USER  dev@clearsky-usa.com        its own mailbox
     MAIL_DEV_PASS  xxxx xxxx xxxx xxxx         its own app password
     MAIL_DEV_FROM  "ClearSky-OMEGA <dev@clearsky-usa.com>"      optional

   GMAIL WILL NOT SEND AS AN ADDRESS THE AUTHENTICATED MAILBOX DOES NOT OWN.
   Setting MAIL_FROM to dev@clearsky-usa.com while MAIL_USER is still support@
   does not change the sender - it is rejected outright, or rewritten back to
   support@. There are exactly two ways to make dev@ the sender:
     (a) give dev@clearsky-usa.com its own app password -> MAIL_DEV_USER/PASS
         (what this profile is for), or
     (b) add dev@clearsky-usa.com to the support@ mailbox under Gmail ->
         Settings -> Accounts -> "Send mail as", complete the confirmation,
         and only then does MAIL_DEV_FROM alone work with no second password.
   If neither is done, the dev profile falls back to the default mailbox and
   the mail still goes out - from support@. It never silently drops.

   Every send is best-effort: a mail failure is logged and NEVER fails the
   request that triggered it. The Firestore notification row is the record;
   email is the courtesy copy.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var nodemailer = require('nodemailer');

/* Two named mailboxes, resolved lazily and cached per authenticated user.
   'dev' falls back to the default pair WHOLE - never one env from each, which
   would authenticate as one mailbox with the other's password and fail every
   send with a credentials error that looks like a broken password. */
var PROFILES = {
  'default': { user: 'MAIL_USER',     pass: 'MAIL_PASS',     from: 'MAIL_FROM' },
  'dev':     { user: 'MAIL_DEV_USER', pass: 'MAIL_DEV_PASS', from: 'MAIL_DEV_FROM' }
};
var _tx = {};

function creds(profile) {
  var p = PROFILES[profile] || PROFILES['default'];
  var user = process.env[p.user], pass = process.env[p.pass];
  if (user && pass) return { user: user, pass: pass, from: process.env[p.from] || null };
  if (profile === 'default' || !PROFILES[profile]) return null;
  var d = creds('default');
  if (!d) return null;
  /* Fell back to another mailbox. Drop this profile's From with it: an
     unowned From is refused by Gmail, so the honest sender is the only one
     that actually delivers. */
  return { user: d.user, pass: d.pass, from: d.from, fellBack: profile };
}

function tx(profile) {
  var c = creds(PROFILES[profile] ? profile : 'default');
  if (!c) return null;
  if (!_tx[c.user]) {
    _tx[c.user] = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: c.user, pass: String(c.pass).replace(/\s+/g, '') } });
  }
  return { t: _tx[c.user], c: c };
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function layout(title, bodyHtml) {
  return '<div style="background:#0A1628;padding:32px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">'
    + '<div style="max-width:560px;margin:0 auto;background:#0F1F38;border:1px solid #22354F;border-radius:14px;padding:32px;color:#E5EEF7">'
    + '<div style="font-size:11px;letter-spacing:.22em;color:#00A9A4;font-weight:700;margin-bottom:12px">CLEARSKY-OMEGA</div>'
    + '<div style="font-size:22px;font-weight:700;margin-bottom:12px">' + esc(title) + '</div>'
    + '<div style="font-size:15px;line-height:1.6;color:#C7D4E6">' + bodyHtml + '</div>'
    + '<div style="margin-top:28px;padding-top:16px;border-top:1px solid #22354F;font-size:12px;color:#8BA3C4">ClearSky Energy Solutions · Clinton, Iowa · <a href="mailto:support@csebuilders.com" style="color:#00A9A4">support@csebuilders.com</a></div>'
    + '</div></div>';
}
function button(href, label) {
  return '<p style="margin:24px 0"><a href="' + esc(href) + '" style="display:inline-block;background:linear-gradient(135deg,#006F9A,#00A9A4);color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">' + esc(label) + '</a></p>';
}

function send(to, subject, html, text, opts) {
  opts = opts || {};
  var got = tx(opts.profile);
  if (!got) { console.warn('[mail] no mailbox configured; skipped:', subject, '->', to); return Promise.resolve({ skipped: true }); }
  if (got.c.fellBack) console.warn('[mail] profile', got.c.fellBack, 'not configured; sending as', got.c.user);
  var from = got.c.from || ('ClearSky-OMEGA <' + got.c.user + '>');
  var msg = { from: from, to: to, subject: subject, html: html,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
  if (opts.replyTo) msg.replyTo = opts.replyTo;
  return got.t.sendMail(msg)
    .then(function (r) { return { ok: true, id: r.messageId, from: from }; })
    .catch(function (e) { console.error('[mail] send failed:', subject, '->', to, e.message); return { ok: false, error: e.message }; });
}

/* ── Templates ───────────────────────────────────────────────────────────── */
var T = {
  signupReceived: function (o) {
    return send(o.email, 'We received your ClearSky-OMEGA workspace request',
      layout('Request received', '<p>Thanks, ' + esc(o.name) + '. We\'re setting up a workspace for <b>' + esc(o.company) + '</b> at <b>' + esc(o.host) + '</b>.</p>'
        + '<p>The ClearSky team reviews every new workspace — usually within one business day. You\'ll get another email the moment it\'s live.</p>'
        + '<p>Your 30-day trial starts on approval, not today.</p>'));
  },
  signupAlert: function (o) {
    var to = process.env.MAIL_NOTIFY || 'dev@clearsky-usa.com';
    return send(to, '[OMEGA] New workspace request: ' + o.company + ' (' + o.orgId + ')',
      layout('New workspace request', '<table style="font-size:14px;border-collapse:collapse">'
        + row('Company', o.company) + row('Domain', o.orgId) + row('Requested by', o.email) + row('Vertical', o.vertical) + row('Host', o.host) + row('Phone', o.phone || '—') + row('Note', o.note || '—')
        + '</table>' + button(o.consoleUrl || 'https://tools.csebuilders.com/', 'Review in the master console')));
  },
  approved: function (o) {
    return send(o.email, 'Your ClearSky-OMEGA workspace is live',
      layout(esc(o.company) + ' is ready', '<p>Your workspace has been approved. Sign in with your ' + esc(o.orgId) + ' email:</p>'
        + button('https://' + o.host + '/', 'Open ' + o.host)
        + '<p>Colleagues at <b>' + esc(o.orgId) + '</b> can sign in at the same address and will join automatically. You\'re the workspace owner — invite, promote and manage them from Account settings.</p>'
        + (o.trialEndsAt ? '<p>Your trial runs until <b>' + esc(String(o.trialEndsAt).slice(0, 10)) + '</b>.</p>' : '')));
  },
  rejected: function (o) {
    return send(o.email, 'About your ClearSky-OMEGA workspace request',
      layout('We couldn\'t set up ' + esc(o.company), '<p>' + esc(o.note || 'We weren\'t able to approve this workspace request.') + '</p>'
        + '<p>If you think this is a mistake, reply to this email and a person will look at it.</p>'));
  },
  /* An invitation to a shared workspace. Sent from the 'dev' mailbox, with
     Reply-To set to the person who actually invited them, because the first
     thing a recipient does with an unexpected invitation is reply to it and
     ask who it is from.

     It says plainly that no account exists yet. That is not a disclaimer -
     it is the whole security property of this design: the record only decides
     what role they get IF they sign in, and nobody can manufacture a login on
     someone else's behalf. A recipient who was not expecting this can ignore
     it and nothing was created in their name. */
  invite: function (o) {
    var who = o.invitedByName || o.invitedBy || 'The ClearSky team';
    return send(o.email, o.workspace + ': ' + who + ' has invited you',
      layout('You have been invited to ' + o.workspace,
        '<p><b>' + esc(who) + '</b> has invited you to the <b>' + esc(o.workspace) + '</b> workspace'
          + (o.orgName ? ' as <b>' + esc(o.orgName) + '</b>' : '') + '.</p>'
        + '<p>Sign in with <b>' + esc(o.email) + '</b> \u2014 the same address this was sent to. '
          + 'You will land straight in as <b>' + esc(o.roleLabel || 'a member') + '</b>, with no approval step.</p>'
        + button(o.url, 'Open ' + o.workspace)
        + (o.note ? '<p style="border-left:3px solid #22354F;padding-left:14px;color:#8BA3C4">' + esc(o.note) + '</p>' : '')
        + '<p style="font-size:13px;color:#8BA3C4">No account has been created for you. Signing in is what '
          + 'creates it, which is why nobody can enrol you without your own action. If you were not '
          + 'expecting this, ignore it \u2014 nothing exists in your name.</p>'),
      null,
      { profile: 'dev', replyTo: o.invitedBy || undefined });
  },
  statusChanged: function (o) {
    return send(o.email, 'Your ClearSky-OMEGA workspace is now ' + o.status,
      layout('Workspace ' + esc(o.status), '<p>The status of <b>' + esc(o.company) + '</b> has changed to <b>' + esc(o.status) + '</b>.' + (o.note ? ' ' + esc(o.note) : '') + '</p>'
        + '<p>Questions? Reply to this email.</p>'));
  }
};
function row(k, v) { return '<tr><td style="padding:4px 12px 4px 0;color:#8BA3C4;white-space:nowrap;vertical-align:top">' + esc(k) + '</td><td style="padding:4px 0">' + esc(v) + '</td></tr>'; }

module.exports = { send: send, templates: T, layout: layout, button: button, esc: esc, row: row,
  configured: function (p) { return !!tx(p); } };
