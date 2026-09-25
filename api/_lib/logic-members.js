/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/logic-members.js — the ONE writer of a workspace's people
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Every CHANGE to somebody on omega_orgs/{org}/members/{uid} goes through
   change() here. Three doors use it, and change() holds the same rules for
   all of them:

     api/logic-admin.js  'member' and commissioning — ClearSky, any workspace
     api/logic-team.js   the Team page — a workspace's own owner or admin
     api/set-role.js     the master console's role select, and the old API

   What else writes the collection, and why that is not a second writer:
   firestore.rules lets a browser create ONLY its own record, as an active
   'member' (omega-tenant.js, on first sign-in), and edit only its own name —
   a tenant owner or admin has no direct write any more, because a direct
   write skips the last-owner check and the log below. ClearSky staff keep a
   direct write (isAdmin()) for repairs. api/logic-onboard.js 'administrator'
   enrols a new workspace's first administrator in its own audited
   transaction and never demotes, disables or re-enables anybody.

   · Nobody is deleted. A person is disabled, and can be enabled again.
   · The last active owner can never be disabled or made anything else.
     The check, the member write and the log row are ONE transaction, so two
     owners disabling each other at the same moment cannot both succeed.
   · An administrator adds, re-roles and disables people up to administrator
     and never touches an owner, nor makes one. An owner (and ClearSky) may
     do anything else.
   · Every change lands in omega_orgs/{org}/admin_audit: who, what it was,
     what it is now, and through which door.

   A set-password link goes back to the caller only when the door says so
   (ClearSky's console, `reveal`). The Team page never gets one: a link in
   an administrator's hands is a key to somebody else's account, so there
   it goes by email to the person it belongs to, or not at all.

   The request itself is shaped by api/_lib/logic-admin.js memberRequest().
   Who may open which door (the owner check, logic-access.authorize, the
   email-domain rule for the Team page) is the door's job, not this file's.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./admin'), M = require('./mail');

function now() { return new Date().toISOString(); }
/* Audit ids sort NEWEST FIRST under a plain ascending orderBy('__name__'):
   an inverted millisecond stamp, so the trail needs no composite index (a
   descending __name__ order on a subcollection does, and the live page
   found that out). */
function rid(at) { return String(1e13 - Date.parse(at)).padStart(13, '0') + '_' + Math.random().toString(36).slice(2, 8); }

/* The set-password link continues to the tenant's own host — but Firebase
   Auth only accepts a continue URL on a domain listed under Authentication →
   Settings → Authorized domains, and a newly commissioned host never is
   (there is no wildcard). So a refused host falls back to the hub, which is,
   and the response says so instead of handing staff an error. */
var HUB_HOST = 'silmarillion.clearskyomega.com', HUB = 'https://' + HUB_HOST + '/';
async function resetLink(auth, email, hostName, path) {
  var url = 'https://' + hostName + (path || '/');
  try { return { link: await auth.generatePasswordResetLink(email, { url: url }), error: null, note: null }; }
  catch (e1) {
    if (!/allowlist|authorized|unauthorized-continue-uri|invalid-continue-uri/i.test(String(e1 && e1.message || e1))) return { link: null, error: String(e1 && e1.message || e1), note: null };
    try { return { link: await auth.generatePasswordResetLink(email, { url: HUB }), error: null, note: hostName + ' is not an authorized domain in Firebase Auth yet, so the link continues to the hub; add the host under Authentication → Settings → Authorized domains to change that.' }; }
    catch (e2) { return { link: null, error: String(e2 && e2.message || e2), note: null }; }
  }
}

function activeOwner(d) { return !!d && d.role === 'owner' && (d.status || 'active') !== 'disabled'; }
/* What each door may do to one person. `actor` is 'clearsky', 'owner' or
   'admin'; `m` the request; `target` the person's record as it stands. */
function permit(actor, m, target) {
  if (actor === 'clearsky' || actor === 'owner') return;
  if (actor !== 'admin') throw A.httpError(403, 'The workspace owner or an administrator manages the team');
  if (m.role === 'owner') throw A.httpError(403, 'Only an owner can make somebody an owner');
  if (target && target.role === 'owner') throw A.httpError(403, 'Only an owner can change or disable an owner');
}
/* Taking the owner role away (disable, or any other role) from the last
   active owner leaves a workspace nobody can run: refused, for every door.
   `owners` is the workspace's owner records as a query snapshot — read
   inside the transaction that then writes, so the answer cannot go stale
   between the check and the write. */
function takesAnOwner(m, target) { return activeOwner(target) && (m.status === 'disabled' || (!!m.role && m.role !== 'owner')); }
function keepAnOwner(owners, m, target) {
  if (!takesAnOwner(m, target)) return;
  if (owners.docs.filter(function (d) { return activeOwner(d.data()); }).length <= 1) throw A.httpError(409, 'That is the last active owner; make somebody else the owner first');
}

/* The invitation. ClearSky's console says ClearSky set the workspace up; the
   Team page says which colleague added them. Every value is escaped. */
function invitation(o, m, role, link) {
  var name = o.orgName || o.orgId;
  if (o.via === 'team') {
    return { subject: 'You have been added to ' + name + ' on Omega Logic',
      html: M.layout('You have been added to ' + name, '<p>' + M.esc(o.by) + ' added you to <b>' + M.esc(name) + '</b> on Omega Logic' + (role ? ' as ' + M.esc(role) : '') + '.</p><p>Choose your password to get in. The link is good for about an hour; after that, use “Forgot password” on the sign-in page with this address. If this address is a Google account you can sign in with Google instead.</p>' + M.button(link, 'Set your password')),
      text: o.by + ' added you to ' + name + ' on Omega Logic. Set your password: ' + link };
  }
  return { subject: name + ' on ClearSky-OMEGA — set your password',
    html: M.layout('Your ' + name + ' workspace is ready', '<p>ClearSky has set up <b>' + M.esc(name) + '</b> at <b>' + M.esc(o.host) + '</b>.</p><p>Choose your password to get in. The link is good for about an hour; after that, use “Forgot password” on the sign-in page with this address.</p>' + M.button(link, 'Set your password')),
    text: 'Your ' + name + ' workspace is ready at https://' + o.host + '/. Set your password: ' + link };
}
async function deliver(o, m, role, link) {
  if (!link || !M.configured || !M.configured()) return link ? 'not sent — email is not set up on this deployment' : null;
  try { var inv = invitation(o, m, role, link), r = await M.send(m.email, inv.subject, inv.html, inv.text); return r && r.ok ? 'sent' : 'not sent'; }
  catch (e) { return 'not sent — ' + e.message; }
}

/* change(o) — add, re-role, disable or enable one person.
     o.orgId, o.orgName, o.host (+ o.path) where the set-password link lands
     o.by        the caller's email (invitedBy / updatedBy / audit)
     o.actor     'clearsky' | 'owner' | 'admin'
     o.via       'logic-admin' | 'team' (audit, and the invitation wording)
     o.request   L.memberRequest(body)
     o.reveal    true: hand the set-password link back to the caller
     o.mailNew   true: email the link to a newly created account unasked
     o.audit     false: no admin_audit row (commissioning writes its own)
   Returns what the console prints; never a link unless o.reveal. */
async function change(o) {
  var db = A.db(), auth = A.init().auth(), m = o.request, via = o.via || 'logic-admin', at = now();
  var root = db.collection('omega_orgs').doc(o.orgId), members = root.collection('members');
  var byEmailQ = members.where('email', '==', m.email).limit(1), ownersQ = members.where('role', '==', 'owner');

  /* A first look, OUTSIDE the transaction, only so that a request that will
     be refused never reaches Firebase Auth: nobody gets a sign-in made for
     them by a refused invitation. The transaction below decides again. */
  var first = await byEmailQ.get(), pre = first.empty ? null : first.docs[0].data();
  permit(o.actor, m, pre);
  if (takesAnOwner(m, pre)) keepAnOwner(await ownersQ.get(), m, pre);
  if (!m.role && first.empty) throw A.httpError(404, m.email + ' is not a member of this workspace yet; give a role to invite them');

  /* A status change or a set-password link never creates an account: the
     member is found by email, and only a ROLE (an invitation) reaches Auth
     to create one. Auth and Firestore cannot share a transaction, so the
     account is found or made first; everything Firestore holds is decided
     and written together after it. */
  var u = null, account = 'unchanged';
  if (m.role) {
    try { u = await auth.getUserByEmail(m.email); account = 'existing'; }
    catch (e) { if (!(e && e.code === 'auth/user-not-found')) throw e; }
    if (!u) { u = await auth.createUser({ email: m.email, emailVerified: false, displayName: m.name || o.orgName || o.orgId }); account = 'created'; }
  }

  var done = await db.runTransaction(async function (tx) {
    var found = await tx.get(byEmailQ), owners = await tx.get(ownersQ), cur = u ? await tx.get(members.doc(u.uid)) : null;
    var byEmail = found.empty ? null : found.docs[0], target = byEmail ? byEmail.data() : null, was = target, ref, row;
    permit(o.actor, m, target); keepAnOwner(owners, m, target);
    if (!m.role) {
      if (!byEmail) throw A.httpError(404, m.email + ' is not a member of this workspace yet; give a role to invite them');
      ref = byEmail.ref;
      row = { uid: byEmail.id, role: target.role || null, status: target.status || 'active' };
      if (m.status) { tx.set(ref, { status: m.status, updatedAt: at, updatedBy: o.by }, { merge: true }); row.status = m.status; }
    } else {
      /* the record under their sign-in uid is the one written; when it is not
         the one found by email, it is judged too before anything changes */
      if (cur.exists && (!byEmail || byEmail.id !== u.uid)) { permit(o.actor, m, cur.data()); keepAnOwner(owners, m, cur.data()); was = cur.data(); }
      else if (!cur.exists && byEmail && byEmail.id !== u.uid) was = null;
      if (account === 'created') was = null;
      ref = members.doc(u.uid);
      var patch = { email: m.email, role: m.role, status: m.status || (was && was.status) || 'active', updatedAt: at, updatedBy: o.by };
      if (m.name) patch.name = m.name;
      if (!was) { patch.invitedBy = o.by; patch.invitedAt = at; }
      tx.set(ref, patch, { merge: true });
      row = { uid: u.uid, role: m.role, status: patch.status };
    }
    if (o.audit !== false && (m.role || m.status)) {
      tx.set(root.collection('admin_audit').doc(rid(at)), { action: 'member', orgId: o.orgId, via: via, by: o.by, at: at,
        email: m.email, uid: row.uid, role: row.role || null, status: row.status, account: account,
        was: was ? { role: was.role || null, status: was.status || 'active' } : null, now: { role: row.role || null, status: row.status } });
    }
    return row;
  });

  var out = { uid: done.uid, email: m.email, role: done.role, status: done.status, account: account, claims: false, resetLink: null, resetLinkError: null, resetLinkNote: null, mail: null };
  if (!m.role) {
    if (m.resetLink) {
      var made0 = await resetLink(auth, m.email, o.host, o.path);
      out.resetLinkError = made0.error; out.resetLinkNote = made0.note;
      if (o.reveal) out.resetLink = made0.link; else out.mail = await deliver(o, m, null, made0.link);
    }
    return out;
  }
  /* Sign-in claims are set only for the tenant's own people: rewriting a
     staff member's or a partner's claims would move THEIR home workspace. */
  out.claims = A.orgOf(m.email) === o.orgId;
  if (out.claims) await auth.setCustomUserClaims(u.uid, Object.assign({}, u.customClaims || {}, { orgId: o.orgId, role: m.role }));
  var link = null, made = { error: null, note: null };
  if (account === 'created' || m.sendMail) { made = await resetLink(auth, m.email, o.host, o.path); link = made.link; }
  if (link && (m.sendMail || (account === 'created' && o.mailNew))) out.mail = await deliver(o, m, m.role, link);
  out.resetLink = o.reveal ? link : null; out.resetLinkError = made.error; out.resetLinkNote = made.note;
  return out;
}

module.exports = { change: change, permit: permit, resetLink: resetLink, rid: rid, now: now, HUB: HUB, HUB_HOST: HUB_HOST };
