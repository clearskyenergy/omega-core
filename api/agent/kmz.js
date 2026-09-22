/* ═══════════════════════════════════════════════════════════════════════════════
   /api/agent/kmz?id=…&org=…&exp=…&sig=…   —  the site as a Google Earth file
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  → application/vnd.google-earth.kmz, Content-Disposition attachment
   403    the signature does not match, or the link has expired
   404    no such deal, or the org in the link is not on it

   NO BEARER HEADER. This is the one agent endpoint reached by a person
   clicking a link in a chat answer, so the link is the credential:
   /api/agent/site-outline signs (id, org, exp) with the server's link
   secret, and this verifies it — constant-time — before touching Firestore.
   A forged or expired link never causes a read. The org is re-checked
   against the deal's orgsInvolved[] so a valid link for one deal is not a
   key to another, and a link minted for a partner cannot outlive its access.
   org '*' is what an admin key's link carries (see site-outline.js); it is
   inside the signature, so it cannot be typed in.

   The file is built on request from the deal's `outline` block, so it is
   always the current ring; nothing is stored in a bucket.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('../_lib/admin');
var Auth = require('../_lib/agent-auth');
var S = require('../_lib/agent-sites');
var KMZ = require('../_lib/kmz');

module.exports = A.handler(function (req, res) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var q = req.query || {};
  var id = String(q.id || '').trim(), org = String(q.org || '').trim().toLowerCase();
  if (!id || !org || !q.exp || !q.sig) throw A.httpError(400, 'id, org, exp and sig are required');
  if (!Auth.verifyLink(id, org, q.exp, q.sig)) throw A.httpError(403, 'this link is not valid or has expired');
  return A.db().collection('deals').doc(id).get().then(function (snap) {
    var d = snap.exists ? (snap.data() || {}) : null;
    var inv = d && Array.isArray(d.orgsInvolved) ? d.orgsInvolved : [];
    if (!d || (org !== '*' && inv.indexOf(org) < 0)) throw A.httpError(404, 'no such site');
    var buf = KMZ.buildKMZ(S.kmlSite(id, d));
    var name = String(d.name || 'site').replace(/[^A-Za-z0-9 _.-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'site';
    res.setHeader('Content-Type', 'application/vnd.google-earth.kmz');
    res.setHeader('Content-Disposition', 'attachment; filename="' + name + '.kmz"');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).end(buf);
  });
});
