/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Dashboard membership uses the same audited writer as the Logic Team page.
 * It does not require purchasing the Logic Office module to invite a colleague.
 */
'use strict';
var A = require('./_lib/admin'), L = require('./_lib/logic-admin');
var Members = require('./_lib/logic-members'), P = require('./_lib/package-access');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (['GET', 'POST'].indexOf(req.method) < 0) throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), db = A.db();
  if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Verify your email first');
  var b = req.method === 'GET' ? req.query || {} : req.body || {}, org = A.safeOrg(b.org);
  if (!org) throw A.httpError(400, 'Valid workspace required');
  if (!(await A.canActInOrg(caller, org))) throw A.httpError(403, 'Not your workspace');
  var root = db.collection('omega_orgs').doc(org);
  var records = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('members').doc(caller.uid).get()]);
  if (!records[0].exists) throw A.httpError(404, 'Workspace not found');
  var tenant = records[0].data(), billing = records[1].exists ? records[1].data() : {}, member = records[2].exists ? records[2].data() : {};
  if (tenant.status !== 'active') throw A.httpError(403, 'This workspace is not active');
  if (!caller.staff && (member.status && member.status !== 'active' || ['owner', 'admin', 'member', 'viewer'].indexOf(member.role) < 0)) throw A.httpError(403, 'Active workspace membership required');
  var actor = caller.staff ? 'clearsky' : member.role, manage = ['clearsky', 'owner', 'admin'].indexOf(actor) >= 0;
  var roles = actor === 'admin' ? ['member', 'viewer', 'admin'] : ['member', 'viewer', 'admin', 'owner'];
  var path = '/workspace?tenant=' + encodeURIComponent(org), frontDoor = 'https://' + Members.HUB_HOST + path;
  if (req.method === 'GET') {
    var people = await root.collection('members').limit(200).get();
    return { manage: manage, assignable: manage ? roles : [], frontDoor: frontDoor, limited: people.size === 200,
      people: people.docs.map(function (d) { var m = d.data(); return { email: m.email || '', name: m.name || '', role: m.role, status: m.status || 'active' }; }) };
  }
  if (!manage) throw A.httpError(403, 'Ask your workspace owner or administrator to add people');
  if (billing.packaged === true) {
    var view = P.project(caller, billing, tenant, member);
    if (!view.live) throw A.httpError(403, 'Renew this workspace’s plan before adding people');
  } else if (['suspended', 'cancelled', 'past_due'].indexOf(billing.status) >= 0) throw A.httpError(403, 'Renew this workspace’s plan before adding people');
  if (b.action && b.action !== 'member') throw A.httpError(400, 'action must be member');
  // This door only adds people or emails a password link. Role/status management
  // remains on the existing management surface; the writer enforces owner limits.
  var m = L.memberRequest(b);
  if (m.status) throw A.httpError(400, 'Use team management to change account status');
  if (A.orgOf(m.email) !== org) {
    var grant = await db.collection('org_members').doc(m.email).get();
    if (!grant.exists || grant.data().active === false || grant.data().orgId !== org) throw A.httpError(403, 'Use an @' + org + ' address. ClearSky must approve access for someone outside your company.');
  }
  var prior = await root.collection('members').where('email', '==', m.email).limit(1).get();
  if (!prior.empty && m.role) throw A.httpError(409, 'This person is already on the team. Use Send password email if they need help signing in.');
  if (!prior.empty && prior.docs[0].data().status === 'disabled') throw A.httpError(403, 'This member is disabled. Ask an owner to restore access first.');
  m.sendMail = true;
  var out = await Members.change({ orgId: org, orgName: tenant.name || org, host: Members.HUB_HOST, path: path,
    by: caller.email, actor: actor, via: 'workspace-team', addOnly: true, request: m, reveal: false, mailNew: true, audit: true });
  var sent = out.mail === 'sent';
  return { ok: true, email: out.email, role: out.role, status: out.status, mail: out.mail, frontDoor: frontDoor,
    note: sent ? 'Password setup email sent to ' + m.email + '. They can choose a password and sign in with their email.' :
      'Team access is saved, but the password email could not be sent. They can open the sign-in page and choose Forgot password with ' + m.email + ', or you can retry Send password email.' };
});
