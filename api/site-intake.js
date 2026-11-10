/* ═══════════════════════════════════════════════════════════════════════════════
   /api/site-intake — the shareable site-intake form's one door
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PUBLIC (no token; the link id is the only thing the caller holds):
     GET  ?l=il_…                → { ok, open:true, to }   is the link still open
     POST { l, submitter:{name,email,company?,phone?},
            site:{name, address?, lat?, lng?, acres?, sizeMw?, sizeMwh?,
                  projectType?, notes?, kml? | kmzBase64?, fileName?},
            website }            → { ok, reference, acres }
       files ONE site into the OSA portfolio's `deals` at stage referred,
       originated by the link's org, channel 'Intake link'. `website` is the
       honeypot a person never sees: filled, the answer is a plain ok and
       nothing is stored.

   SIGNED IN (Firebase token; an OSA administrator or ClearSky staff —
   api/_lib/intake-links.js manager() is the rule):
     POST { action:'create', org?, label, partnerName?, dailyCap?, expiresAt? }
     POST { action:'list' }
     POST { action:'revoke', id }
   The JV's agent key uses api/agent/intake-links.js for the same three.

   WHAT HOLDS ON THE PUBLIC SIDE: 5 a minute per address (in memory), the
   link's own daily cap taken in a transaction on the link row, a revoked or
   expired link refused inside that transaction, a 3 MB file limit, and the
   field allowlist in validateSubmission(). The answer never names a deal,
   never says whether the site was already known, and never echoes the
   portfolio. The person who made the link is mailed; the submitter is not
   (an open form that mails a typed address is a relay for somebody's spam).
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var Auth = require('./_lib/agent-auth');
var S = require('./_lib/agent-sites');
var L = require('./_lib/intake-links');
var M = require('./_lib/mail');
var E = require('./_lib/embed');

var PER_MINUTE = 5;
/* The OSA portfolio, for the "open it" button in the mail. The same default
   api/invite-send.js uses, and the same env var overrides it. */
var PORTFOLIO_URL = process.env.OSA_PORTAL_URL || 'https://silmarillion.clearskyomega.com/osa/portfolio';

function clientIp(req) {
  var h = req.headers || {};
  return String(h['x-forwarded-for'] || h['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim().slice(0, 64);
}
function bodyOf(req) {
  var b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') throw A.httpError(400, 'a JSON body is required');
  return b;
}

function manage(req, b) {
  var base = Auth.baseUrl(req);
  return L.manager(req).then(function (mgr) {
    if (b.action === 'create') return L.create(mgr, b, base).then(function (link) { return { ok: true, link: link }; });
    if (b.action === 'list') return L.list(mgr, base);
    if (b.action === 'revoke') return L.revoke(mgr, String(b.id || ''));
    throw A.httpError(400, 'action must be create, list or revoke');
  });
}

function notify(link, site, submitter, ref, acres) {
  var d = link.data;
  if (!d.notify) return Promise.resolve();
  var rows = M.row('Site', site.name) + (site.address ? M.row('Address', site.address) : '')
    + (site.sizeMw != null ? M.row('Size', site.sizeMw + ' MW') : '')
    + (acres != null ? M.row('Acres', String(acres)) : '')
    + M.row('From', submitter.name + (submitter.company ? ', ' + submitter.company : ''))
    + M.row('Email', submitter.email) + (submitter.phone ? M.row('Phone', submitter.phone) : '')
    + M.row('Link', d.label) + M.row('Reference', ref);
  var html = M.layout('A site came in through your intake link',
    '<p>It is in the portfolio at <b>Referred</b>, credited to ' + M.esc(d.partnerName || d.orgId) + '.</p>'
    + '<table style="font-size:14px">' + rows + '</table>'
    + (site.notes ? '<p style="white-space:pre-wrap">' + M.esc(site.notes) + '</p>' : '')
    + M.button(PORTFOLIO_URL, 'Open the portfolio'));
  return M.send(d.notify, 'New site: ' + site.name + ' (' + d.label + ')', html, null, { replyTo: submitter.email })
    .catch(function (e) { console.error('[site-intake] notify', e && e.message); });
}

function submit(req, b) {
  E.rateLimit('site-intake:' + clientIp(req), PER_MINUTE);
  var v = L.validateSubmission(b);
  if (v.spam) return { ok: true, reference: '' };
  if (!v.ok) throw A.httpError(400, v.error);
  return L.resolve(String(b.l || '')).then(function (link) {
    var o = S.uploadOutline(v.site, 'intake link "' + link.data.label + '"', 'intake');
    if (o.error) throw A.httpError(400, o.error);
    return L.claim(link.id).then(function () {
      var doc = L.dealFor(link, v.site, v.submitter, o.outline, o.grid);
      return A.db().collection('deals').add(doc).then(function (ref) {
        var reference = doc.intake.reference;
        var acres = o.outline ? o.outline.acres : (v.site.acres != null ? v.site.acres : null);
        return notify(link, v.site, v.submitter, reference, acres).then(function () {
          return { ok: true, reference: reference, acres: acres,
                   outline: !!o.outline, flags: o.outline ? (o.outline.flags || []).map(function (f) { return f.msg; }).slice(0, 5) : [] };
        });
      });
    });
  });
}

module.exports = A.handler(function (req) {
  if (req.method === 'GET') {
    return L.resolve(String((req.query || {}).l || '')).then(function (link) {
      return { ok: true, open: true, to: link.data.partnerName || link.data.orgId };
    });
  }
  if (req.method !== 'POST') throw A.httpError(405, 'GET or POST');
  var b = bodyOf(req);
  return b.action ? manage(req, b) : submit(req, b);
});
