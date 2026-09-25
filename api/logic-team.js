/* ═══════════════════════════════════════════════════════════════════════════
   /api/logic-team — a workspace's own people, run by its owner or admin
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The Team page (logic-team.html) behind the office chrome. D2 (2026-09-24):
   a workspace's owner or administrator adds and disables its own office and
   plant staff without asking ClearSky. The WRITE is the one member writer
   ClearSky's console already uses (api/_lib/logic-members.js change()), so
   the rules are the same whoever asks:

   · who may: an ACTIVE owner or admin of this workspace
     (logic-access.authorize(…, write) + active status), or the ClearSky
     owner. An owner may do anything; an administrator adds, re-roles and
     disables people up to administrator and never touches an owner nor
     makes one. A member or viewer reads the list and changes nothing.
   · nobody is deleted — there is no delete here; a person is disabled and
     can be enabled again. The last active owner is never disabled or
     re-roled.
   · every change lands in omega_orgs/{org}/admin_audit with who, what it
     was and what it is now (via: 'team'); the page shows the member rows of
     that trail, never ClearSky's other admin rows (storefront, cost basis).
   · WHO can be added never widens what logic-access.authorize admits: a
     person at this workspace's own email domain, or somebody who already
     holds ClearSky's cross-company grant for THIS workspace
     (org_members/{email}.orgId === org, active). That grant is written by
     ClearSky only (firestore.rules), and this endpoint never writes it — so
     a public mailbox (gmail.com …) or another company's address is refused
     here unless ClearSky already let it in.
   · a set-password link is never handed to the administrator (it is a key
     to somebody else's account): a new account is emailed its link, or the
     response says how they sign in instead.

   GET  ?org=        the people; for an owner or admin also what they may
                     assign, what each row allows, and the recent changes
   POST { org, action: 'member', email, role?, status?, name?, sendMail?, resetLink? }
                     the same request shape as ClearSky's console
                     (api/_lib/logic-admin.js memberRequest)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), L = require('./_lib/logic-admin'), Members = require('./_lib/logic-members');

var FRONT_DOOR = 'https://' + Members.HUB_HOST + '/logic';
function roleOf(caller, ctx) { return X.owner(caller) ? 'clearsky' : ((ctx.member && ctx.member.role) || null); }
function manager(caller, ctx) { return X.owner(caller) || X.officeAdmin(ctx.member); }
function assignable(actor) { return actor === 'clearsky' || actor === 'owner' ? L.ROLES.slice() : (actor === 'admin' ? ['admin', 'member', 'viewer'] : []); }
function iso(v) { return v && typeof v.toDate === 'function' ? v.toDate().toISOString() : (typeof v === 'string' ? v : null); }

/* Somebody outside this workspace's email domain gets in only with
   ClearSky's cross-company grant for this workspace — exactly what
   A.canActInOrg (and so logic-access.authorize) would admit. */
async function admissible(db, org, email) {
  if (A.orgOf(email) === org) return true;
  var g = await db.collection('org_members').doc(String(email).toLowerCase()).get();
  return g.exists && g.data().active !== false && g.data().orgId === org;
}

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (['GET', 'POST'].indexOf(req.method) < 0) throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), db = A.db(), b = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  var org = A.safeOrg(b.org);
  if (!org) throw A.httpError(400, 'Valid org required');
  var ctx = await X.authorize(caller, org, req.method === 'POST'), actor = roleOf(caller, ctx), manages = manager(caller, ctx);
  var root = db.collection('omega_orgs').doc(org);

  if (req.method === 'GET') {
    var reads = await Promise.all([root.collection('members').limit(200).get(),
      manages ? root.collection('admin_audit').where('action', '==', 'member').orderBy('__name__').limit(50).get() : null]);
    var people = reads[0].docs.map(function (d) { var m = d.data() || {}; return { uid: d.id, m: m }; });
    var owners = people.filter(function (p) { return p.m.role === 'owner' && (p.m.status || 'active') !== 'disabled'; }).length;
    var rows = people.map(function (p) {
      var m = p.m, status = m.status || 'active', last = m.role === 'owner' && status !== 'disabled' && owners <= 1;
      var editable = manages && (actor !== 'admin' || m.role !== 'owner');
      return { email: m.email || '', name: m.name || null, role: m.role || null, status: status, you: p.uid === caller.uid,
        outside: A.orgOf(m.email) !== org, lastOwner: last, invitedAt: iso(m.invitedAt), invitedBy: m.invitedBy || null, updatedAt: iso(m.updatedAt), updatedBy: m.updatedBy || null,
        can: { role: editable && !last, disable: editable && status !== 'disabled' && !last, enable: editable && status === 'disabled' } };
    }).sort(function (x, y) { var r = L.ROLES.indexOf(x.role) - L.ROLES.indexOf(y.role); return r || (x.email < y.email ? -1 : x.email > y.email ? 1 : 0); });
    return { org: org, name: ctx.org.name || org, brand: require('./_lib/logic-brand')(ctx.org), owner: X.owner(caller), role: actor, manage: manages,
      assignable: manages ? assignable(actor) : [], domain: org, frontDoor: FRONT_DOOR, people: rows, limited: reads[0].size === 200,
      log: reads[1] ? reads[1].docs.map(function (d) { var a = d.data() || {}; return { at: a.at || null, by: a.by || null, email: a.email || null, via: a.via || null, was: Object.prototype.hasOwnProperty.call(a, 'was') ? (a.was || null) : 'unrecorded', now: a.now || { role: a.role || null, status: a.status || null } }; }) : [] };
  }

  if (!manages) throw A.httpError(403, 'The workspace owner or an administrator manages the team');
  var action = String(b.action || 'member');
  if (action === 'delete' || action === 'remove') throw A.httpError(400, 'Nobody is deleted: disable them instead, and enable them again if they come back');
  if (action !== 'member') throw A.httpError(400, 'action must be member');
  var m = L.memberRequest(b);
  /* a real address: the shape a mailbox has, not merely an @ and a dot */
  if (m.role && !/^[a-z0-9][a-z0-9._%+'-]*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(m.email)) throw A.httpError(400, 'Type their real email address, like name@' + org);
  if (m.role && actor !== 'clearsky' && !(await admissible(db, org, m.email))) {
    throw A.httpError(403, m.email + ' is outside ' + org + '. Only people with an @' + org + ' address can be added here; ClearSky grants access to anybody else.');
  }
  var out = await Members.change({ orgId: org, orgName: ctx.org.name || org, host: Members.HUB_HOST, path: '/logic', by: caller.email, actor: actor, via: 'team',
    request: m, reveal: false, mailNew: true, audit: true });
  var note = null;
  if (out.account === 'created' && out.mail !== 'sent') note = 'Tell ' + m.email + ' to open ' + FRONT_DOOR + ' and choose “Forgot password” with this address to set a password' + (out.mail ? ' (' + out.mail + ')' : '') + ', or sign in with Google if it is a Google account.';
  else if (out.account === 'created') note = 'We emailed ' + m.email + ' a link to set a password. They sign in at ' + FRONT_DOOR + '.';
  else if (m.role && out.account === 'existing') note = m.email + ' already has an Omega Logic sign-in; they see this workspace the next time they sign in at ' + FRONT_DOOR + '.';
  return { ok: true, email: out.email, role: out.role, status: out.status, account: out.account, mail: out.mail, note: note };
});
