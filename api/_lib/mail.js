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

   Every send is best-effort: a mail failure is logged and NEVER fails the
   request that triggered it. The Firestore notification row is the record;
   email is the courtesy copy.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var nodemailer = require('nodemailer');
var _tx = null;
function tx() {
  if (_tx) return _tx;
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return null;
  _tx = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.MAIL_USER, pass: String(process.env.MAIL_PASS).replace(/\s+/g, '') } });
  return _tx;
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

function send(to, subject, html, text) {
  var t = tx();
  if (!t) { console.warn('[mail] MAIL_USER/MAIL_PASS not set; skipped:', subject, '→', to); return Promise.resolve({ skipped: true }); }
  return t.sendMail({ from: process.env.MAIL_FROM || ('ClearSky-OMEGA <' + process.env.MAIL_USER + '>'), to: to, subject: subject, html: html,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() })
    .then(function (r) { return { ok: true, id: r.messageId }; })
    .catch(function (e) { console.error('[mail] send failed:', subject, '→', to, e.message); return { ok: false, error: e.message }; });
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
  statusChanged: function (o) {
    return send(o.email, 'Your ClearSky-OMEGA workspace is now ' + o.status,
      layout('Workspace ' + esc(o.status), '<p>The status of <b>' + esc(o.company) + '</b> has changed to <b>' + esc(o.status) + '</b>.' + (o.note ? ' ' + esc(o.note) : '') + '</p>'
        + '<p>Questions? Reply to this email.</p>'));
  }
};
function row(k, v) { return '<tr><td style="padding:4px 12px 4px 0;color:#8BA3C4;white-space:nowrap;vertical-align:top">' + esc(k) + '</td><td style="padding:4px 0">' + esc(v) + '</td></tr>'; }

module.exports = { send: send, templates: T, configured: function () { return !!tx(); } };
