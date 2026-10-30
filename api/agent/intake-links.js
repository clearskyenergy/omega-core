/* ═══════════════════════════════════════════════════════════════════════════════
   /api/agent/intake-links — shareable site-intake links, for an agent key
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET                                   → { ok, links:[…] }    the key's org's links
   POST { label, dailyCap?, expiresAt? } → { ok, link:{ id, url, … } }
   POST { revoke: 'il_…' }               → { ok, id, revoked:true }

   Auth: Authorization: Bearer omega_ak_… with sites:write. A link is made for
   the KEY'S org (an admin key may name `org`); the people who submit through
   it are credited to that org, exactly as the agent's own uploads are.

   Why the agent can do this: "give me a link I can send a landowner" is the
   request, and the agent is where the JV asks. What a link can do is in
   api/_lib/intake-links.js (file one referral, read nothing); the public
   form is /site-intake?l=…, its door /api/site-intake.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('../_lib/admin');
var Auth = require('../_lib/agent-auth');
var L = require('../_lib/intake-links');

module.exports = A.handler(function (req) {
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST');
  var h = (req.headers && req.headers.authorization) || '';
  var m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  if (!m || !Auth.looksLikeKey(m[1].trim())) throw A.httpError(401, 'an agent key is required');
  var base = Auth.baseUrl(req);
  return L.manager(req).then(function (mgr) {
    if (req.method === 'GET') return L.list(mgr, base);
    var b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { throw A.httpError(400, 'body is not JSON'); } }
    if (b.revoke) return L.revoke(mgr, String(b.revoke));
    return L.create(mgr, b, base).then(function (link) {
      return { ok: true, link: link,
               note: 'Give the user the url verbatim. Anyone with it can submit a site; each one lands in the portfolio at stage referred, credited to ' + link.orgId + '. Revoke with { revoke: id }.' };
    });
  });
});
