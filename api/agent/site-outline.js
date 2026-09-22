/* ═══════════════════════════════════════════════════════════════════════════════
   /api/agent/site-outline?id=…   —  one site: its outline, the KML, and a link
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  → { ok:true, site:{ …summary, outline:{ring, acres, centroid, features…},
            grid }, kml:"<?xml…", kmzUrl:"https://…/api/agent/kmz?id=…&exp=…&sig=…",
            kmzExpiresAt }
   404    no such deal, or not one the key may see (the same answer for both:
          a partner key must not be able to probe which ids exist)

   WHY THE KML IS INLINE AND THE KMZ IS A LINK. A ChatGPT Action can only
   read text; it cannot receive a binary file. So the KML — which is text —
   comes back in the JSON for the model to describe, and the KMZ, which is
   what a person opens in Google Earth, is a signed link the model pastes
   into its answer. The link needs no header (a click cannot send one), so it
   carries its own credential: an HMAC over (id, org, expiry) that
   /api/agent/kmz checks. Seven days, then it is dead.

   A SITE WITH NO OUTLINE still answers. The KML then carries a pin at the
   grid location if one is known, and `outline` is null, and the note says
   so — an honest "we have a point, not a shape" beats a fabricated ring.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('../_lib/admin');
var Auth = require('../_lib/agent-auth');
var S = require('../_lib/agent-sites');
var KMZ = require('../_lib/kmz');

function mayView(caller, d) {
  if (caller.admin) return true;
  var inv = Array.isArray(d.orgsInvolved) ? d.orgsInvolved : [];
  return inv.indexOf(caller.orgId) >= 0;
}

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var id = String((req.query || {}).id || '').trim();
  if (!id || id.length > 128 || /[\/]/.test(id)) throw A.httpError(400, 'id is required');
  return Auth.authenticate(req).then(function (caller) {
    Auth.requireScope(caller, 'sites:read');
    return A.db().collection('deals').doc(id).get().then(function (snap) {
      if (!snap.exists || !mayView(caller, snap.data() || {})) throw A.httpError(404, 'no such site');
      var d = snap.data() || {};
      var site = S.detail(id, d);
      var kml = KMZ.buildKML(S.kmlSite(id, d));
      /* An admin key signs as '*' so the download endpoint knows the link
         was minted with every-deal scope; nobody can forge that without the
         secret, and a partner key never gets it. */
      var linkOrg = caller.admin ? '*' : caller.orgId;
      var link = Auth.signLink(id, linkOrg);
      var out = { ok: true, org: caller.orgId, site: site, kml: kml, kmlFileName: safeName(site.name) + '.kml' };
      if (link) {
        out.kmzUrl = Auth.baseUrl(req) + '/api/agent/kmz?id=' + encodeURIComponent(id) + '&org=' + encodeURIComponent(linkOrg) +
                     '&exp=' + link.exp + '&sig=' + link.sig;
        out.kmzFileName = safeName(site.name) + '.kmz';
        out.kmzExpiresAt = new Date(link.exp).toISOString();
      } else {
        out.kmzUrl = null;
        out.kmzNote = 'No link-signing secret is configured on the server (OMEGA_AGENT_LINK_SECRET or FIREBASE_SERVICE_ACCOUNT), so the KMZ cannot be linked; the KML above is the same content.';
      }
      out.note = site.hasOutline
        ? 'The outline is a hand-traced ring (' + (site.outline.source || 'kml') + '), not a survey. Acreage is measured geodesically from it.'
        : (site.lat != null ? 'This site has no traced outline yet; the KML carries a pin at its recorded location. Upload a KMZ with POST /api/agent/sites to add the ring.'
                            : 'This site has neither an outline nor a location on record. Upload a KMZ or lat/lng with POST /api/agent/sites.');
      return out;
    });
  });
});

function safeName(n) { return String(n || 'site').replace(/[^A-Za-z0-9 _.-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'site'; }
