/* POST /api/helios-intake — Helios Energy Advisors' first-pass checklist,
   filled from a project and sent to Helios.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { projectId, action: 'draft' | 'preview' | 'send',
           facts?      what the editor session knows (draft)
           draft?      the answers as the person finished them (preview, send)
           message?    a note to Helios (send)
           siteMapJpeg? a data: URL snapshot of the site map (send) }

   ── THREE STEPS, ONE DOOR ──
   draft    reads the project record, merges what the browser could see
            (Grid Atlas, the parcel lookup, the drawing, the Viability
            Workflow) and answers what it honestly can, each answer with its
            source. Nothing is written.
   preview  fills Helios's own PDF with the draft as edited and hands it
            back, so the person sees the form before anyone else does.
   send     fills it again from the same draft, keeps the file on the
            project (Storage: projects/{id}/…, the roster's own folder),
            emails it to Helios with the sender in copy and ClearSky in copy,
            and records the send on the project.

   ── WHO ──
   Anyone who may act in the project's workspace may draft and preview
   (A.canActInOrg: the org, a granted outsider, staff). SENDING puts the
   workspace's name in front of a third party, so it needs a verified email
   or an owner/administrator of an ACTIVE client (admin.clientAdmin, the
   same rule as plan-change) — the role a person granted vouches. A
   pending, suspended or cancelled workspace cannot send; a workspace with
   no record can (the editor gate fails open the same way, for the same
   legacy tenants).

   ── WHERE ──
   Helios's address is configuration, never a constant: HELIOS_INTAKE_EMAIL
   (one or more), else the deal room's own list for helios
   (fin_settings/dealroom.orgs.helios). Neither set: draft says so and send
   refuses, rather than mailing a guess. */
'use strict';
var A = require('./_lib/admin');
var H = require('./_lib/helios-intake');
var mail = require('./_lib/mail');

var STAFF_COPY = process.env.MAIL_NOTIFY || 'dev@clearsky-usa.com';

function bucket() { return A.init().storage().bucket(process.env.FIREBASE_STORAGE_BUCKET || 'clearsky-portal.firebasestorage.app'); }
function str(v, max) { v = (v == null) ? '' : String(v); return v.replace(/\r/g, '').trim().slice(0, max || 200); }
function valid(email) { return /.+@.+\..+/.test(String(email || '').trim()); }

module.exports = A.handler(async function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var action = str(b.action || 'draft', 12);
  var projectId = str(b.projectId, 80);
  if (!projectId || !/^[A-Za-z0-9_-]+$/.test(projectId)) throw A.httpError(400, 'projectId required');
  if (['draft', 'preview', 'send'].indexOf(action) < 0) throw A.httpError(400, 'action must be draft, preview or send');

  var caller = await A.authenticate(req);
  var db = A.db();
  var ps = await db.collection('projects').doc(projectId).get();
  if (!ps.exists) throw A.httpError(404, 'project not found');
  var project = ps.data() || {};
  var orgId = str(project.orgId, 253);
  if (!(await A.canActInOrg(caller, orgId))) throw A.httpError(403, 'not your project');

  var org = {};
  if (orgId) { try { var os = await db.collection('omega_orgs').doc(orgId).get(); org = os.exists ? (os.data() || {}) : {}; } catch (e) { org = {}; } }
  if (org.status && ['pending', 'suspended', 'cancelled'].indexOf(org.status) >= 0) throw A.httpError(403, 'this workspace is ' + org.status + ' — it cannot send a checklist');

  var cfg = {};
  try { var cs = await db.collection('fin_settings').doc('dealroom').get(); cfg = cs.exists ? (cs.data() || {}) : {}; } catch (e) { cfg = {}; }
  var to = H.recipients(process.env, cfg);
  var who = { email: caller.email, name: str(caller.claims && caller.claims.name, 80) };
  var lastSent = project.heliosIntake || null;

  if (action === 'draft') {
    var draft = H.compose({ project: project, org: org, caller: who, facts: b.facts });
    return { ok: true, draft: draft, to: to.to, configured: to.to.length > 0, mailConfigured: !!mail.configured(),
             lastSent: lastSent, fileName: H.fileName(draft) };
  }

  var edited = H.cleanDraft(b.draft);
  var template = await H.templateBytes();
  var filled = await H.fill(template, edited);
  var name = H.fileName(edited);
  if (action === 'preview') {
    return { ok: true, fileName: name, pdfBase64: Buffer.from(filled.bytes).toString('base64'), report: filled.report };
  }

  /* send */
  var verified = !!(caller.claims && caller.claims.email_verified === true);
  if (!verified && !caller.staff && !(await A.clientAdmin(caller, orgId))) {
    throw A.httpError(403, 'Verify your email address before sending a checklist to Helios. An owner or administrator of an active workspace may send without it.');
  }
  if (!to.to.length) throw A.httpError(400, 'No Helios intake address is configured on this deployment — set HELIOS_INTAKE_EMAIL, or the deal room recipients for helios.');
  if (!mail.configured()) throw A.httpError(500, 'Mail is not configured on this deployment (MAIL_USER / MAIL_PASS)');

  var snapshot = null;
  if (typeof b.siteMapJpeg === 'string' && /^data:image\/jpeg;base64,/.test(b.siteMapJpeg)) {
    var img = Buffer.from(b.siteMapJpeg.slice(b.siteMapJpeg.indexOf(',') + 1), 'base64');
    if (img.length > 100 && img.length <= 2500000 && img[0] === 0xFF && img[1] === 0xD8) snapshot = img;
  }
  var now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 13);
  var path = 'projects/' + projectId + '/helios-first-pass-' + stamp + '.pdf';
  var bytes = Buffer.from(filled.bytes);
  await bucket().file(path).save(bytes, { resumable: false, contentType: 'application/pdf',
    metadata: { cacheControl: 'private, no-store', contentDisposition: 'attachment; filename="' + name + '"' } });

  var projectLine = (edited.cover.projectNameLocation || '').split('\n')[0] || str(project.name, 120) || projectId;
  var subject = 'First pass checklist — ' + projectLine;
  var orgName = str(org.name, 120) || orgId || 'an OMEGA workspace';
  var html = mail.layout('Large Land Deal First Pass Checklist', H.emailHtml(mail.esc, {
    draft: edited, orgName: orgName, who: [who.name, who.email].filter(Boolean).join(' · '), message: str(b.message, 2000), snapshot: !!snapshot }));
  var attachments = [{ filename: name, content: bytes, contentType: 'application/pdf' }];
  if (snapshot) attachments.push({ filename: 'site-map.jpg', content: snapshot, contentType: 'image/jpeg' });
  var cc = [];
  if (valid(caller.email)) cc.push(caller.email);
  if (valid(STAFF_COPY) && cc.indexOf(STAFF_COPY) < 0) cc.push(STAFF_COPY);
  var sent = await mail.send(to.to.join(', '), subject, html, null, { replyTo: valid(caller.email) ? caller.email : undefined, cc: cc.join(', '), attachments: attachments });
  if (!sent || sent.skipped || sent.ok === false) {
    throw A.httpError(502, 'The email could not be sent' + (sent && sent.error ? ' (' + sent.error + ')' : '') + '. The filled form is saved on the project; try again in a minute.');
  }

  var FV = A.FieldValue();
  var rec = { sentAt: now.toISOString(), sentBy: caller.email, sentTo: to.to, cc: cc, fileName: name, path: path, messageId: sent.id || null, snapshot: !!snapshot };
  var pref = db.collection('projects').doc(projectId);
  await pref.set({ heliosIntake: Object.assign({ count: FV.increment(1) }, rec) }, { merge: true });
  try { await pref.collection('intakes').add(Object.assign({ kind: 'helios-first-pass', orgId: orgId, projectId: projectId }, rec)); } catch (e) { console.error('[helios-intake] history', e); }
  return { ok: true, sentTo: to.to, cc: cc, fileName: name, path: path, sentAt: rec.sentAt };
});
