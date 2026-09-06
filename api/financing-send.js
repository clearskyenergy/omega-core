/* POST /api/financing-send — send a submitted application to DLL.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Body: { appId, note? }

   ── ClearSky SENDS IT, NOT THE APPLICANT ──
   The applicant submits; a named person here reviews and forwards. That is
   why this is staff-only rather than the last step of the form: a credit
   package going to a lender under ClearSky's name should have had a person
   look at it, and the platform should not be able to mail somebody's tax
   returns out on a form submission alone.

   ── LINKS, NOT ATTACHMENTS ──
   The mail carries the application summary and signed links to the credit
   documents. Attaching two years of financials to an email puts them in a
   mailbox, a sent-items folder and whatever archives both ends run, outside
   any access control either party has. The links resolve against Storage,
   where the rules still apply and access can be revoked.

   Marks dllSentAt and status so the console shows it has gone, and so the
   same package is not sent twice by two people on the same morning. */
'use strict';
var A = require('./_lib/admin');
var mail = require('./_lib/mail');

/* Config, not a constant — a rep changes jobs and this should not be a
   deploy. Defaults to the contact ClearSky works with today. */
var DLL_TO = process.env.DLL_CONTACT_EMAIL || 'rgisolfi@leasedirect.com';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function money(n) {
  return (typeof n === 'number' && isFinite(n))
    ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}
function row(k, v) {
  return '<tr><td style="padding:5px 12px 5px 0;color:#6B7C8C;white-space:nowrap">' + esc(k) +
         '</td><td style="padding:5px 0"><b>' + esc(v == null || v === '' ? '—' : v) + '</b></td></tr>';
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var appId = String(b.appId || '');
  if (!appId) throw A.httpError(400, 'appId required');

  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');
    if (!mail.configured()) {
      /* Distinguished from a send failure on purpose: one is a deployment
         missing MAIL_USER/MAIL_PASS, the other is a rejected message, and
         they are fixed in completely different places. */
      throw A.httpError(500, 'Mail is not configured on this deployment (MAIL_USER / MAIL_PASS)');
    }

    var db = A.db(), FV = A.FieldValue();
    var ref = db.collection('fin_applications').doc(appId);

    return ref.get().then(function (snap) {
      if (!snap.exists) throw A.httpError(404, 'no such application');
      var app = snap.data() || {};
      if (app.status === 'draft') throw A.httpError(409, 'still a draft — the applicant has not submitted it');
      if (app.dllSentAt) throw A.httpError(409, 'already sent to DLL on ' +
        (app.dllSentAt.toDate ? app.dllSentAt.toDate().toDateString() : 'file'));

      var f = app.form || {};
      var files = app.files || [];

      var html =
        '<div style="font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2733">'
      + '<p>Robert,</p>'
      + '<p>A pricing request from ClearSky Energy Solutions. Details below; supporting documents are linked at the foot.</p>'
      + (b.note ? '<p style="background:#F6F8FA;border-left:3px solid #0070F2;padding:10px 12px;margin:14px 0">' + esc(b.note) + '</p>' : '')
      + '<h3 style="margin:20px 0 6px;font-size:14px">Request</h3><table style="border-collapse:collapse;font-size:13px">'
      +   row('Request type', f.requestType) + row('Product', f.product) + row('Term (months)', f.termMonths)
      + '</table>'
      + '<h3 style="margin:20px 0 6px;font-size:14px">Customer</h3><table style="border-collapse:collapse;font-size:13px">'
      +   row('Legal entity', f.legalName) + row('State of incorporation', f.incState)
      +   row('Website', f.website) + row('Phone', f.phone) + row('Industry', f.industry)
      +   row('HQ address', f.hqAddress)
      + '</table>'
      + '<h3 style="margin:20px 0 6px;font-size:14px">Project</h3><table style="border-collapse:collapse;font-size:13px">'
      +   row('Project address', f.projectAddress) + row('Facility / business', f.facilityType)
      +   row('Scope of work', f.scope)
      +   row('Financed amount (gross, ITC not netted)', money(f.financedAmount))
      +   row('Contractor', f.contractor) + row('Vendor fee', f.vendorFee)
      + '</table>'
      + '<h3 style="margin:20px 0 6px;font-size:14px">ITC &amp; depreciation</h3><table style="border-collapse:collapse;font-size:13px">'
      +   row('Retained by', f.itcHolder) + row('Est. annual production (kWh)', f.annualKwh)
      +   row('% consumption offset', f.offsetPct) + row('Est. year-1 savings', money(f.savingsY1))
      +   row('Est. ITC %', f.itcPct) + row('Est. ITC amount', money(f.itcAmount))
      +   row('Est. SREC (7 yr)', money(f.srec)) + row('Est. fed + state depreciation', money(f.depreciation))
      + '</table>'
      + '<h3 style="margin:20px 0 6px;font-size:14px">Timing</h3><table style="border-collapse:collapse;font-size:13px">'
      +   row('Projected NTP', f.ntpDate) + row('Estimated COD', f.codDate)
      +   row('Deferral requested', f.deferral) + row('Deferral months', f.deferralMonths)
      + '</table>'
      + '<h3 style="margin:20px 0 6px;font-size:14px">Credit</h3><table style="border-collapse:collapse;font-size:13px">'
      +   row('Financials available', f.financialsAvailable)
      +   row('Loans / mortgages / LOC due in term', f.debtComingDue)
      + '</table>'
      + '<h3 style="margin:20px 0 6px;font-size:14px">Documents</h3>'
      + (files.length
          ? '<ul style="margin:0;padding-left:18px">' + files.map(function (x) {
              return '<li><a href="' + esc(x.url) + '">' + esc(x.name) + '</a></li>'; }).join('') + '</ul>'
          : '<p style="color:#6B7C8C">None attached.</p>')
      + '<p style="margin-top:22px;color:#6B7C8C;font-size:12px">Sent from ClearSky-OMEGA by ' + esc(caller.email)
      + '. Reference ' + esc(appId) + '.</p></div>';

      var subject = 'Pricing request — ' + (f.legalName || 'ClearSky project') +
                    (f.financedAmount ? (' — ' + money(f.financedAmount)) : '');

      return mail.send(DLL_TO, subject, html).then(function (r) {
        if (r && r.skipped) throw A.httpError(500, 'Mail not configured');
        if (r && r.ok === false) throw A.httpError(502, 'DLL send failed: ' + r.error);
        return ref.set({
          status: 'in_review',
          dllSentAt: FV.serverTimestamp(),
          dllRef: (r && r.id) || null,
          updatedAt: FV.serverTimestamp()
        }, { merge: true }).then(function () {
          return { ok: true, to: DLL_TO, messageId: (r && r.id) || null };
        });
      });
    });
  });
});
