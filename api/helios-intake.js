/* POST /api/helios-intake — Helios Energy Advisors' first-pass checklist,
   filled from a project and sent to Helios.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { projectId, action: 'draft' | 'preview' | 'send',
           facts?      what the editor session knows (draft)
           draft?      the answers as the person finished them (preview, send)
           sendId?     one id per dialog, so a retried send never mails twice (send)
           message?    a note to Helios (send)
           siteMapJpeg? a data: URL snapshot of the site map (send) }

   ── THREE STEPS, ONE DOOR ──
   draft    reads the project record (and the workspace's own Apply for
            Financing request for it), merges what the browser could see
            (Grid Atlas, the parcel lookup, the drawing, the Viability
            Workflow) and answers what it honestly can, each answer with its
            source. Nothing is written.
   preview  fills Helios's own PDF with the draft as edited and hands it
            back with what did not fit, so the person sees the form before
            anyone else does.
   send     fills it again from the same draft, keeps the file on the
            project (Storage: projects/{id}/…, the roster's own folder),
            emails it to Helios with the sender and ClearSky in copy, and
            records the send.

   ── WHO ──
   DRAFT and PREVIEW: whoever the projects READ rule lets see the project
   (its org, its creator, an org on its JDA roster, ClearSky staff), and
   no wider: a cross-org org_members grant is for contributing, not
   browsing, so it opens nothing here. The caller's own plan must carry the
   button (a package: Omega Capital, the module that sells it; a legacy
   plan: the editor, and its `export` capability or the Omega Capital
   add-on, exactly as the Output tab shows it), and a member the workspace
   disabled is refused. The financing request is read only for the
   project's own workspace: fin_applications is own-org only in the rules.

   SEND puts a workspace's name in front of a third party from ClearSky's
   mailbox, so it asks more: a member of the project's OWN workspace (or
   staff), not a viewer, an ACTIVE workspace with a record (not a personal
   email domain: public-domains.js), a verified email or an owner or
   administrator of an active client (admin.clientAdmin, as on
   plan-change). At most PER_PROJECT_DAY sends a project and PER_ORG_DAY a
   workspace each day (UTC), counted in a transaction on documents no
   browser can reach (projects/{id}/intake_counters, omega_orgs/{org}/
   intake_counters: no rule opens either), and a sendId is claimed before
   anything is mailed: the same id again returns the first answer.

   ── WHERE ──
   Helios's address is configuration, never a constant: HELIOS_INTAKE_EMAIL
   (one or more), else the deal room's own list for helios
   (fin_settings/dealroom.orgs.helios). Neither set: draft says so and send
   refuses, rather than mailing a guess. */
'use strict';
var A = require('./_lib/admin');
var H = require('./_lib/helios-intake');
var mail = require('./_lib/mail');
var PUBLIC = require('./_lib/public-domains');

var STAFF_COPY = process.env.MAIL_NOTIFY || 'dev@clearsky-usa.com';
var PER_PROJECT_DAY = 5, PER_ORG_DAY = 25, STALE_MS = 10 * 60 * 1000;
var CLOSED = ['pending', 'suspended', 'cancelled'];

function bucket() { return A.init().storage().bucket(process.env.FIREBASE_STORAGE_BUCKET || 'clearsky-portal.firebasestorage.app'); }
function str(v, max) { v = (typeof v === 'string' || typeof v === 'number') ? String(v) : ''; return v.replace(/\r/g, '').trim().slice(0, max || 200); }
function valid(email) { return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(String(email || '').trim()); }
function millis(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : Date.parse(v) || 0; }
function data(s) { return s && s.exists ? (s.data() || {}) : null; }

/* the projects read rule, server side */
function mayRead(caller, project, orgId) {
  if (caller.staff) return true;
  var mine = String(caller.orgId || '');
  if (!caller.email || !mine) return false;
  if (orgId && orgId === mine) return true;
  if (project.uid && project.uid === caller.uid) return true;
  var roster = Array.isArray(project.orgsInvolved) ? project.orgsInvolved : [];
  return roster.indexOf(mine) >= 0;
}

/* The plan behind the button: the caller's own workspace. `produce` is a
   preview or a send (a read-only package may still draft). */
async function entitle(caller, produce) {
  if (caller.staff) return { member: null };
  var db = A.db(), root = db.collection('omega_orgs').doc(caller.orgId), records;
  try {
    records = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('members').doc(caller.uid).get()]);
  } catch (e) { throw A.httpError(503, 'Could not check this workspace\'s plan right now; try again in a minute.'); }
  var org = data(records[0]), bill = data(records[1]) || {}, member = data(records[2]);
  if (bill.packaged === true) {
    var access = require('./_lib/package-access');
    try {
      access.requireModule(access.project(caller, bill, org, member, Date.now()), 'finance', { produce: produce });
    } catch (e) { throw A.httpError(e.status || 403, (e.message || 'Not in your package') + ' — Helios Intake is part of Omega Capital.'); }
    return { member: member };
  }
  if (member && member.status && member.status !== 'active') throw A.httpError(403, 'Your membership of this workspace is not active.');
  if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf('editor') < 0) throw A.httpError(403, 'Your account does not include Site Map; ask your workspace admin for access.');
  var AD = require('./_lib/addons'), now = Date.now(), on = AD.live(bill, now), ctx = AD.judge(caller.orgId, bill, on).ctx;
  var editor = !ctx.tool || !ctx.tool('editor') || !ctx.canOpen || ctx.canOpen('editor');
  if (!editor) throw A.httpError(403, 'Site Map is not in this workspace\'s product.');
  var opens = on.indexOf('finance') >= 0 || (typeof ctx.canCap === 'function' && ctx.canCap('export') === true);
  if (!opens) throw A.httpError(403, 'Helios Intake is on the Output tab\'s exports, which this plan does not include. Omega Capital opens it (Modules → Opt in).');
  return { member: member };
}

/* the workspace's own Apply for Financing request for this project */
async function finApp(db, projectId, orgId) {
  try {
    var q = await db.collection('fin_applications').where('projectId', '==', projectId).limit(20).get();
    var rows = (q.docs || []).map(function (d) { return d.data() || {}; })
      .filter(function (a) { return a.orgId === orgId && ['withdrawn', 'declined'].indexOf(a.status) < 0; });
    rows.sort(function (a, b) {
      var sa = a.status === 'draft' ? 0 : 1, sb = b.status === 'draft' ? 0 : 1;
      return sb - sa || millis(b.updatedAt) - millis(a.updatedAt);
    });
    return rows[0] || null;
  } catch (e) { console.error('[helios-intake] financing read', e && e.message); return null; }
}

module.exports = A.handler(async function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = (req.body && typeof req.body === 'object') ? req.body : {};
  var action = str(b.action || 'draft', 12);
  var projectId = str(b.projectId, 80);
  if (!projectId || !/^[A-Za-z0-9_-]+$/.test(projectId)) throw A.httpError(400, 'projectId required');
  if (['draft', 'preview', 'send'].indexOf(action) < 0) throw A.httpError(400, 'action must be draft, preview or send');

  var caller = await A.authenticate(req);
  var db = A.db();
  var pref = db.collection('projects').doc(projectId);
  var ps = await pref.get();
  if (!ps.exists) throw A.httpError(404, 'project not found');
  var project = ps.data() || {};
  var orgId = str(project.orgId, 253).toLowerCase();
  if (!mayRead(caller, project, orgId)) throw A.httpError(403, 'not your project');
  var ent = await entitle(caller, action !== 'draft');

  var orgRec = null;
  if (orgId) { try { orgRec = data(await db.collection('omega_orgs').doc(orgId).get()); } catch (e) { orgRec = null; } }
  var org = orgRec || {};

  var cfg = {};
  try { var cs = await db.collection('fin_settings').doc('dealroom').get(); cfg = data(cs) || {}; } catch (e) { cfg = {}; }
  var to = H.recipients(process.env, cfg);
  var memberName = ent.member && typeof ent.member.name === 'string' ? ent.member.name : '';
  var who = { email: caller.email, name: str(memberName || (caller.claims && caller.claims.name), 80) };
  var lastSent = project.heliosIntake || null;

  if (action === 'draft') {
    var own = caller.staff || (orgId && orgId === caller.orgId);
    var draft = H.compose({ project: project, org: org, caller: who, facts: b.facts, finApp: own ? await finApp(db, projectId, orgId) : null });
    return { ok: true, draft: draft, to: to.to, configured: to.to.length > 0, mailConfigured: !!mail.configured(),
             lastSent: lastSent, fileName: H.fileName(draft) };
  }

  var template = await H.templateBytes();
  var filled;
  try { filled = await H.fill(template, b.draft); }
  catch (e) { console.error('[helios-intake] fill', e); throw A.httpError(400, 'The form could not be filled from this draft (' + str(e && e.message, 160) + ').'); }
  var edited = filled.draft;
  var name = H.fileName(edited);
  if (action === 'preview') {
    return { ok: true, fileName: name, pdfBase64: Buffer.from(filled.bytes).toString('base64'), report: filled.report, issues: filled.issues };
  }

  /* ── send ── */
  if (!caller.staff && !(orgId && orgId === caller.orgId)) throw A.httpError(403, 'Only the project\'s own workspace sends its checklist to Helios.');
  if (!orgId) throw A.httpError(400, 'This project has no workspace on its record, so it cannot be sent in anyone\'s name.');
  if (!caller.staff && PUBLIC.indexOf(orgId) >= 0) throw A.httpError(403, 'A checklist is sent in a company\'s name; sign in with your work email.');
  if (org.status && CLOSED.indexOf(org.status) >= 0) throw A.httpError(403, 'This workspace is ' + org.status + ', so it cannot send a checklist to Helios.');
  if (!caller.staff && !orgRec) throw A.httpError(403, 'Sending to Helios needs an OMEGA workspace on record for ' + orgId + '; ask ClearSky to set it up.');
  if (!caller.staff && ent.member && ent.member.role === 'viewer') throw A.httpError(403, 'A viewer cannot send; ask an owner, administrator or member of the workspace.');
  var verified = !!(caller.claims && caller.claims.email_verified === true);
  if (!verified && !caller.staff && !(await A.clientAdmin(caller, orgId))) {
    throw A.httpError(403, 'Verify your email address before sending a checklist to Helios. An owner or administrator of an active workspace may send without it.');
  }
  if (!to.to.length) throw A.httpError(400, 'No Helios intake address is configured on this deployment — set HELIOS_INTAKE_EMAIL, or the deal room recipients for helios.');
  if (!mail.configured()) throw A.httpError(500, 'Mail is not configured on this deployment (MAIL_USER / MAIL_PASS)');
  var sendId = str(b.sendId, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sendId)) throw A.httpError(400, 'sendId required (8–64 letters, digits, - or _)');

  var now = new Date(), day = now.toISOString().slice(0, 10);
  var iref = pref.collection('intakes').doc(sendId);
  var pcount = pref.collection('intake_counters').doc('helios-' + day);
  var ocount = db.collection('omega_orgs').doc(orgId).collection('intake_counters').doc('helios-' + day);
  var prev = await db.runTransaction(async function (t) {
    var got = data(await t.get(iref));
    if (got && got.state === 'sent') return got;
    if (got && got.state === 'sending' && now.getTime() - millis(got.startedAt) < STALE_MS) {
      throw A.httpError(409, 'This checklist is already being sent; give it a minute, then reopen Helios Intake to see whether it went.');
    }
    var pc = data(await t.get(pcount)) || {}, oc = data(await t.get(ocount)) || {};
    var pn = +pc.count || 0, on = +oc.count || 0;
    if (!caller.staff && pn >= PER_PROJECT_DAY) throw A.httpError(429, 'This project has been sent to Helios ' + pn + ' times today; try again tomorrow, or reply on the thread you already have.');
    if (!caller.staff && on >= PER_ORG_DAY) throw A.httpError(429, 'This workspace has sent ' + on + ' checklists to Helios today; try again tomorrow.');
    t.set(iref, { kind: 'helios-first-pass', state: 'sending', orgId: orgId, projectId: projectId, startedAt: now.toISOString(), by: caller.email || null });
    t.set(pcount, { count: pn + 1, day: day, updatedAt: now.toISOString() });
    t.set(ocount, { count: on + 1, day: day, updatedAt: now.toISOString() });
    return null;
  });
  if (prev) {
    return { ok: true, repeat: true, sentTo: prev.sentTo || [], cc: prev.cc || [], fileName: prev.fileName || name, path: prev.path || null, sentAt: prev.sentAt || null, report: [], issues: [] };
  }

  var snapshot = null;
  if (typeof b.siteMapJpeg === 'string' && /^data:image\/jpeg;base64,/.test(b.siteMapJpeg)) {
    var img = Buffer.from(b.siteMapJpeg.slice(b.siteMapJpeg.indexOf(',') + 1), 'base64');
    if (img.length > 100 && img.length <= 2500000 && img[0] === 0xFF && img[1] === 0xD8) snapshot = img;
  }
  var stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  var path = 'projects/' + projectId + '/helios-first-pass-' + stamp + '-' + sendId + '.pdf';
  var bytes = Buffer.from(filled.bytes);
  try {
    await bucket().file(path).save(bytes, { resumable: false, contentType: 'application/pdf',
      metadata: { cacheControl: 'private, no-store', contentDisposition: 'attachment; filename="' + name + '"' } });
  } catch (e) {
    await iref.set({ state: 'failed', error: 'storage: ' + str(e && e.message, 200), failedAt: new Date().toISOString() }, { merge: true }).catch(function () {});
    throw A.httpError(502, 'The filled form could not be stored, so nothing was sent; try again in a minute.');
  }

  var projectLine = (edited.cover.projectNameLocation || '').split('\n')[0] || str(project.name, 120) || projectId;
  var subject = 'First pass checklist — ' + projectLine;
  var orgName = str(org.name, 120) || orgId;
  var html = mail.layout('Large Land Deal First Pass Checklist', H.emailHtml(mail.esc, {
    draft: edited, orgName: orgName, who: [who.name, who.email].filter(Boolean).join(' · '), message: str(b.message, 2000), snapshot: !!snapshot }));
  var attachments = [{ filename: name, content: bytes, contentType: 'application/pdf' }];
  if (snapshot) attachments.push({ filename: 'site-map.jpg', content: snapshot, contentType: 'image/jpeg' });
  var cc = [];
  if (valid(caller.email)) cc.push(caller.email);
  if (valid(STAFF_COPY) && cc.indexOf(STAFF_COPY) < 0) cc.push(STAFF_COPY);
  var sent;
  try { sent = await mail.send(to.to.join(', '), subject, html, null, { replyTo: valid(caller.email) ? caller.email : undefined, cc: cc.join(', '), attachments: attachments }); }
  catch (e) { sent = { ok: false, error: str(e && e.message, 200) }; }
  if (!sent || sent.skipped || sent.ok === false) {
    await iref.set({ state: 'failed', error: str(sent && sent.error, 200) || 'not sent', path: path, failedAt: new Date().toISOString() }, { merge: true }).catch(function () {});
    throw A.httpError(502, 'The email could not be sent' + (sent && sent.error ? ' (' + sent.error + ')' : '') + '. The filled form is saved on the project; try again in a minute.');
  }

  /* the mail has gone: from here a failure is a warning, never an error
     (an error would invite a second send) */
  var rec = { sentAt: now.toISOString(), sentBy: caller.email, sentTo: to.to, cc: cc, fileName: name, path: path, messageId: sent.id || null, snapshot: !!snapshot, sendId: sendId };
  var warning = null;
  try {
    await iref.set(Object.assign({ state: 'sent' }, rec), { merge: true });
    await pref.set({ heliosIntake: rec }, { merge: true });
  } catch (e) {
    console.error('[helios-intake] record', e);
    warning = 'Sent. The send could not be recorded on the project, so the next draft may not say it went.';
  }
  return { ok: true, sentTo: to.to, cc: cc, fileName: name, path: path, sentAt: rec.sentAt, report: filled.report, issues: filled.issues, warning: warning };
});
