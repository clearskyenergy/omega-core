/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-jd-nav.js — who sees the Joint Development section of the nav.
 *
 * WHY THIS IS ONE FILE. The rule lived in three shells — index.html,
 * projects.html, marketplace.html — and they drifted. projects and
 * marketplace read the jdPartner flag out of omega_orgs; index kept a
 * hardcoded list of the three OSA orgs and read no flag at all. So a tenant
 * set up as a JD partner saw "JD Partners" on Projects and Marketplace and
 * not on the Dashboard, which reads as the platform being broken. Three
 * copies of a rule is the bug; this is the one copy.
 *
 * TWO GRANTS, NOT ONE. They were conflated once and a tenant with no JV
 * relationship was shown the OSA workspace link:
 *
 *   OSA workspace (sn-osa)  — the joint venture itself. A literal list,
 *     checked synchronously, and nothing else. No flag, no staff fallback.
 *     Adding a fourth organisation is a one-line change and a deploy, which
 *     for a JV agreement is the right amount of ceremony: it should not be
 *     switchable by a mis-click in an admin console.
 *
 *   JD Partners (sn-jda)    — a joint development agreement with us. Read
 *     from omega_orgs/{orgId}.jdPartner, so setting one up is a console
 *     action rather than a deploy. Every OSA org is implicitly a JD partner;
 *     the reverse is not true, and that asymmetry is the point.
 *
 * The earlier leak came from THREE ways into the same flag — a stale
 * osaMember, a seeded default, and an isStaffEmail() fallback — with no way
 * to tell which one fired. There is one way in here: jdPartner === true,
 * identity-compared, so a truthy string or a 1 does not open it.
 *
 * ⚠ THIS IS NAVIGATION, NOT AUTHORISATION. OSA gates on omega_users and the
 * JD page reads only what the caller could already read. Hiding a link hides
 * a door; it does not lock it. Firestore rules are the boundary.
 *
 * ES5 on purpose: this runs on every shell, including the kiosk browsers.
 */
(function (root) {
  'use strict';

  var OSA_ORGS = ['clearsky-usa.com', 'sunesol.com', 'ogisolar.com'];

  /* Mirrors orgAlias() in firestore.rules and ORG_ALIAS in api/_lib/admin.js.
     A Fenecon person signing in from .de is the same tenant as .com, and a
     nav that disagrees with the rules sends them to a page that refuses. */
  var ORG_ALIAS = { 'fenecon.de': 'fenecon.com', 'fenecon.us': 'fenecon.com' };

  var IDS = { divider: 'sn-jv-divider', label: 'sn-jv-label', osa: 'sn-osa', jda: 'sn-jda' };

  function orgOf(email) {
    var d = String(email || '').toLowerCase().split('@')[1] || '';
    return ORG_ALIAS[d] || d;
  }
  function show(id) { var el = root.document.getElementById(id); if (el) el.style.display = ''; }

  function isOsaOrg(orgId) { return OSA_ORGS.indexOf(orgId) >= 0; }

  /* The flag, and only the flag. Any failure to read it is a no: a nav item
     that appears when Firestore is unreachable is a nav item that appears for
     everyone the moment Firestore is unreachable. */
  function readJdFlag(orgId) {
    try {
      if (typeof root.firebase === 'undefined' || !root.firebase.apps || !root.firebase.apps.length)
        return Promise.resolve(false);
      return root.firebase.firestore().collection('omega_orgs').doc(orgId).get()
        .then(function (doc) {
          var o = (doc && doc.exists) ? (doc.data() || {}) : {};
          return o.jdPartner === true;
        })['catch'](function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  /* Reveal whichever of the two applies. Returns a promise resolving to
     { orgId, osa, jd } so a caller can log or test what it decided. */
  function reveal(email) {
    var orgId = orgOf(email);
    if (!orgId) return Promise.resolve({ orgId: '', osa: false, jd: false });

    var osa = isOsaOrg(orgId);
    /* Paint the OSA side immediately — it needs no read, and waiting on one
       makes the section flicker in after the page has settled. */
    if (osa) { show(IDS.divider); show(IDS.label); show(IDS.osa); show(IDS.jda); }

    return readJdFlag(orgId).then(function (flagged) {
      var jd = osa || flagged;
      if (jd) { show(IDS.divider); show(IDS.label); show(IDS.jda); }
      return { orgId: orgId, osa: osa, jd: jd };
    });
  }

  root.OmegaJdNav = { reveal: reveal, orgOf: orgOf, isOsaOrg: isOsaOrg,
                      OSA_ORGS: OSA_ORGS, IDS: IDS };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).OmegaJdNav;
