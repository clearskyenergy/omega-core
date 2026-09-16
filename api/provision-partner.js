/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/provision-partner  —  stand up a capital partner and its accounts
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS IS AN ENDPOINT AND NOT ONLY A SCRIPT.
   scripts/provision-finance-partner.js does the same work, but it needs the
   service account on the operator's own machine. The credential is already
   configured here, so a ClearSky administrator can do it from the console
   without a copy of it ever leaving Vercel. Fewer copies of that key is the
   entire argument.

   NO PASSWORD CROSSES THIS BOUNDARY.
   Accounts are created WITHOUT one and the response carries a single-use
   password-reset link per account, for the administrator to hand over. An
   initial password chosen by somebody else is a password that person has to
   be told, which means it exists in a chat log or an email; a reset link the
   account holder uses once does not. The endpoint has no password parameter
   and will not accept one.

   STAFF ONLY. Creating sign-in accounts and marking profiles approved is the
   most privileged thing in this codebase — it is how somebody gets in. Gated
   on isStaffEmail, not on tenant admin.

   Body: { orgId, name, orgKey, kind?, tier?, domains?, requiredTools?,
           people: [ { email, name, role } ] }
   Returns: { org, accounts: [ { email, status, resetLink? } ] }
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var FEES = require('../omega-fees.js');

var ROLES = ['partner', 'developer', 'originator', 'admin'];

function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};

  /* An initial password is refused rather than ignored: silently dropping one
     a caller believed was set is how somebody ends up unable to sign in and
     unable to say why. */
  if (b.password || b.initialPassword)
    throw A.httpError(400, 'This endpoint does not accept a password. '
      + 'Accounts are created without one and a reset link is returned for each.');

  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    /* FAIL HERE, NOT HALFWAY. Without a service account a token still
       verifies — the SDK checks it against Google's public keys — so this
       gets all the way past auth and then dies on the first write, which
       reads as "provisioning is broken" rather than "the server has no
       credential". Creating three accounts and failing before the profiles
       are written would also leave people who can sign in and see nothing. */
    if (typeof A.isDegraded === 'function' && A.isDegraded())
      throw A.httpError(503, 'FIREBASE_SERVICE_ACCOUNT is not set on the server, so Firestore is unreachable and nothing can be written. Set it in the Vercel project environment and redeploy. Nothing was changed.');

    var orgId  = clean(b.orgId).toLowerCase();
    var name   = clean(b.name);
    var orgKey = clean(b.orgKey, 60).toLowerCase();
    var people = Array.isArray(b.people) ? b.people : [];
    if (!orgId || !name || !orgKey) throw A.httpError(400, 'orgId, name and orgKey are required');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(orgId)) throw A.httpError(400, 'orgId must be an email domain');
    if (!/^[a-z0-9-]{2,60}$/.test(orgKey)) throw A.httpError(400, 'orgKey must be lower-case letters, digits and dashes');
    if (!people.length) throw A.httpError(400, 'at least one person is required');

    people.forEach(function (p) {
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(clean(p && p.email)))
        throw A.httpError(400, 'invalid email: ' + clean(p && p.email));
      if (ROLES.indexOf(clean(p.role)) < 0)
        throw A.httpError(400, 'role must be one of ' + ROLES.join(', '));
      /* An account on a domain other than the tenant's would be a person from
         somewhere else holding a seat in this partner's workspace. If that is
         ever wanted it is an org_members grant, not a provisioning accident. */
      if (clean(p.email).toLowerCase().split('@')[1] !== orgId)
        throw A.httpError(400, clean(p.email) + ' is not on ' + orgId);
    });

    var admin = A.admin, db = A.db(), auth = A.init().auth();
    var tier = clean(b.tier, 30) || 'partner';
    var out = { org: orgId, orgKey: orgKey, accounts: [] };

    /* THE COMMISSION, SET WHEN THE PARTNER IS SET UP. fees is optional:
       { transactionPct, finders: [{ milestone, pct }], waived, note }.
       Amperage Capital pays 2.5% at NTP and 2.5% at COD; Budderfly pays 1%
       of the offer, built onto the price. Normalised here so the record can
       only ever hold a schedule the portal and /api/offer both understand,
       and stamped with who set it. Absent, the record is left alone: an
       unset schedule shows as "not set" in the portal, never as waived. */
    var orgDoc = { name: name, orgId: orgId, active: true, tier: tier };
    if (b.fees != null) {
      orgDoc.fees = FEES.normalize(b.fees);
      orgDoc.feesSetBy = caller.email || 'clearsky';
      orgDoc.feesSetAt = Date.now();
    }
    var work = db.collection('fin_orgs').doc(orgKey).set(orgDoc, { merge: true })

    .then(function () {
      /* A tenant that signed itself up already has a name its own people
         typed, and a merge would overwrite it with whatever the preset says.
         Keep theirs. status goes active here, which is also the approval —
         provisioning a partner and leaving them on the waiting screen would
         be two jobs where there is one. */
      return db.collection('omega_orgs').doc(orgId).get().then(function (snap) {
        var had = snap.exists ? (snap.data() || {}) : {};
        return db.collection('omega_orgs').doc(orgId).set({
          name: had.name || name,
          domains: Array.isArray(b.domains) ? b.domains : (had.domains || []),
          vertical: clean(b.vertical, 30) || had.vertical || 'developer',
          shell: had.shell || 'default',
          status: 'active', approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          approvedBy: caller.email || 'clearsky',
          financeOrgKey: orgKey,
          requiredTools: Array.isArray(b.requiredTools) ? b.requiredTools : []
        }, { merge: true });
      });
    })
    .then(function () {
      return db.collection('omega_orgs').doc(orgId).collection('billing').doc('current')
        .set({ tier: tier, addons: [], toolOverrides: {}, paymentProvider: 'manual' }, { merge: true });
    })
    .then(function () {
      /* THE STARTER BOARD. Without this the partner opens on their vertical's
         board — a project pipeline they do not have — and would have to know
         to click Edit Dashboard and add three widgets by name. The point of
         provisioning is that the first sign-in already looks right. */
      var board = Array.isArray(b.widgets) && b.widgets.length
        ? b.widgets : ['finroom', 'finoffers', 'fininvest'];
      return db.collection('omega_orgs').doc(orgId).collection('layouts').doc('default')
        .set({ widgets: board,
               setBy: caller.email || 'clearsky',
               setAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    })
    .then(function () {
      if (!b.kind) return null;
      /* omega_partner_orgs is what the OSA portfolio reads. Without a row here
         carrying kind:'investor' the partner never appears in the "Send to
         deal room" chooser, so no deal can be routed to them. */
      return db.collection('omega_partner_orgs').doc(orgId).set({
        name: name, orgId: orgId, kind: clean(b.kind, 30), active: true,
        jd: { active: true, handoff: '' }, financeOrgKey: orgKey
      }, { merge: true });
    });

    people.forEach(function (p) {
      var email = clean(p.email).toLowerCase();
      work = work.then(function () {
        return auth.getUserByEmail(email)
          .then(function (u) { return { u: u, existed: true }; })
          .catch(function (e) {
            if (e.code !== 'auth/user-not-found') throw e;
            return auth.createUser({ email: email, displayName: clean(p.name), emailVerified: false })
              .then(function (u) { return { u: u, existed: false }; });
          });
      }).then(function (r) {
        return db.collection('fin_profiles').doc(r.u.uid).set({
          email: email, emailLower: email, name: clean(p.name),
          role: clean(p.role), orgKey: orgKey, org: name,
          approved: true, suspended: false,
          provisionedBy: caller.email || 'clearsky',
          provisionedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(function () { return r; });
      }).then(function (r) {
        /* A link for an existing account too: the reason to provision one is
           usually that somebody cannot get in. */
        return auth.generatePasswordResetLink(email).then(function (link) {
          out.accounts.push({ email: email, uid: r.u.uid, role: clean(p.role),
                              status: r.existed ? 'existing' : 'created', resetLink: link });
        }).catch(function () {
          out.accounts.push({ email: email, uid: r.u.uid, role: clean(p.role),
                              status: r.existed ? 'existing' : 'created',
                              resetLink: null,
                              note: 'Account is ready; the reset link could not be generated. '
                                  + 'Use "Forgot password?" on the sign-in page.' });
        });
      });
    });

    return work.then(function () { return out; });
  });
});
