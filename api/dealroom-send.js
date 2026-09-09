/* POST /api/dealroom-send — deliver a baked project into a capital partner's deal room.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Body: { projectId, note? }

   ── CLEARSKY DELIVERS, THE SPONSOR DOES NOT ──
   Same shape as financing-send.js and for the same reason: a sponsor files
   the work, a named person here checks it, and only then does a capital
   partner hear about it. A pipeline that lets the submitter ring the bell is
   not a pipeline, it is a mailing list.

   ── LINKS, NOT ATTACHMENTS ──
   The mail carries the headline numbers and a link to the data room. The
   documents themselves stay wherever they live — Drive, Storage, a VDR — so
   access can be withdrawn after the fact. An emailed model lives in two sent
   folders and an archive forever.

   ── THE RECIPIENTS ARE CONFIGURATION ──
   Read from fin_settings/dealroom, editable by an administrator in the deal
   room page. A partner changes analysts more often than we deploy, and a
   hardcoded address is an outage waiting for a Friday.

   Writes room.state='delivered' with the timestamp and who was told, so the
   tracker moves for everyone and the same package is not delivered twice by
   two people on the same morning. */
'use strict';
var A = require('./_lib/admin');
var mail = require('./_lib/mail');

var PORTAL = process.env.FINANCE_PORTAL_URL || 'https://financing.csebuilders.com';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function num(n, unit) {
  return (typeof n === 'number' && isFinite(n) && n > 0)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + (unit ? ' ' + unit : '')
    : '—';
}
function row(k, v) {
  return '<tr><td style="padding:5px 14px 5px 0;color:#8BA3C4;white-space:nowrap">' + esc(k) +
         '</td><td style="padding:5px 0;color:#E5EEF7"><b>' + esc(v == null || v === '' ? '—' : v) +
         '</b></td></tr>';
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var projectId = String(b.projectId || '').trim();
  if (!projectId) throw A.httpError(400, 'projectId required');

  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    var db = A.db(), FV = A.FieldValue();
    var pRef = db.collection('fin_projects').doc(projectId);

    return Promise.all([
      pRef.get(),
      db.collection('fin_settings').doc('dealroom').get()
    ]).then(function (got) {
      var snap = got[0], cfgSnap = got[1];
      if (!snap.exists) throw A.httpError(404, 'Project not found');
      var d = snap.data() || {};
      var room = d.room || {};
      var cfg = (cfgSnap.exists && cfgSnap.data()) || {};

      var url = String(room.dataRoomUrl || '').trim();
      if (!/^https:\/\//i.test(url)) {
        /* Refused rather than sent half-built. A delivery notice with no data
           room is a partner opening a link to nothing, which costs more
           credibility than waiting an hour costs time. */
        throw A.httpError(400, 'This room has no data room link yet — add one before delivering.');
      }

      /* Recipients: whoever the room is baked for, else the default list. */
      var forOrg = String(room.forOrg || cfg.defaultOrg || '').trim();
      var list = [];
      if (Array.isArray(cfg.recipients)) list = cfg.recipients.slice();
      if (cfg.orgs && forOrg && Array.isArray(cfg.orgs[forOrg])) list = cfg.orgs[forOrg].slice();
      if (Array.isArray(b.to) && b.to.length) list = b.to.slice();
      list = list.map(function (x) { return String(x || '').trim(); })
                 .filter(function (x) { return /.+@.+\..+/.test(x); });
      if (!list.length) {
        throw A.httpError(400, 'No recipients configured for ' + (forOrg || 'this room') +
          ' — set them in the deal room settings first.');
      }

      if (!mail.configured || !mail.configured()) {
        /* Kept distinct from a rejected message: one is a deployment missing
           MAIL_USER / MAIL_PASS, the other is a bounce, and they are fixed in
           entirely different places. */
        throw A.httpError(500,
          'Mail is not configured on this deployment (MAIL_USER / MAIL_PASS).');
      }

      var link = PORTAL + '/dealroom.html?p=' + encodeURIComponent(projectId);
      var body =
        '<p>A project has finished pre-development and is ready for funding review. It is '
        + 'held for ' + esc(forOrg || 'you') + ' — nobody else on the marketplace can see it.</p>'
        + '<table style="border-collapse:collapse;margin:18px 0;font-size:14px">'
        + row('Project', d.name)
        + row('Location', [d.city, d.state].filter(Boolean).join(', '))
        + row('Technology', d.tech)
        + row('Capacity', num(d.mw, 'MW') + (d.mwh ? ' · ' + num(d.mwh, 'MWh') : ''))
        + row('Development stage', d.stage)
        + row('Prepared by', d.orgName || d.orgKey)
        + row('Contact', d.packagedBy || '')
        + '</table>'
        + (b.note ? '<p style="padding:12px 14px;background:#0A1628;border-left:3px solid #00A9A4;'
                  + 'border-radius:6px">' + esc(String(b.note)) + '</p>' : '')
        + mail.button(url, 'Open the data room')
        + '<p style="font-size:13px;color:#8BA3C4">Or track it in the portal: '
        + '<a href="' + esc(link) + '" style="color:#00A9A4">' + esc(link) + '</a></p>';

      return mail.send(list.join(', '),
          'Ready to fund — ' + (d.name || 'ClearSky project'),
          mail.layout('Ready to fund', body), null,
          { profile: cfg.mailProfile || undefined })
        .then(function (r) {
          if (r && r.ok === false) throw A.httpError(502, 'Mail was rejected: ' + r.error);
          var hist = Array.isArray(room.history) ? room.history.slice(-40) : [];
          hist.push({ state: 'delivered', at: Date.now(), by: caller.email || 'clearsky' });
          return pRef.update({
            'room.state': 'delivered',
            'room.deliveredAt': FV.serverTimestamp(),
            'room.notifiedTo': list,
            'room.notifiedAt': FV.serverTimestamp(),
            'room.history': hist,
            updatedAt: FV.serverTimestamp()
          }).then(function () {
            return { ok: true, delivered: list, skipped: !!(r && r.skipped) };
          });
        });
    });
  });
});
