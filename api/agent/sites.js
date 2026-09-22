/* ═══════════════════════════════════════════════════════════════════════════════
   /api/agent/sites   —  the portfolio's sites, for a machine holding an agent key
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/agent/sites?minAcres=100&minMw=50&limit=50&stage=&state=&since=&hasOutline=1
        → { ok:true, org, total, count, sites:[summary…] }   biggest first
   POST /api/agent/sites   { sites:[ {name, address?, lat?, lng?, acres?, sizeMw?,
                             sizeMwh?, projectType?, notes?, externalId?,
                             outline?:[[lng,lat]…] | kml?:"<kml…" | kmzBase64?:"…"} … ] }
        → { ok:true, results:[ {name, action:'created'|'updated'|'unchanged'|'error', id, …} ] }

   Auth:  Authorization: Bearer omega_ak_…   (api/_lib/agent-auth.js)
   401    no key, or not one of ours
   403    revoked, expired, wrong scope, or the tenant is suspended
   400    a body that is not { sites:[…] } or has more than MAX_SITES

   WHO THIS IS FOR. The CFA/OGI JV ChatGPT agent (and any other machine a
   ClearSky staffer mints a key for). A Custom GPT reads the OpenAPI document
   at /api/agent/openapi and calls these two operations: "what are our larger
   sites" and "upload this site with its outline". Nothing a person cannot
   already do in the OSA portfolio — the same `deals` documents, the same
   scoring engine (omega-site-intel.js), the same attribution rules.

   THE SCOPE OF A READ is the key's org, exactly as firestore.rules scopes a
   partner: deals whose orgsInvolved[] names it. An `admin:true` key (ClearSky
   only) sees every deal. There is no "all sites" for a partner key and no
   parameter that widens it.

   THE SCOPE OF A WRITE is narrower still — see api/_lib/agent-sites.js,
   "what an update may not touch". A new site is filed `referred`, originated
   by the key's org, channel 'Agent', with an activity line naming the key's
   label; an existing site (matched on externalId, then name|address) gains
   an outline and blank fields only. Attribution, stage, money: never.

   THE ADMIN SDK BYPASSES firestore.rules. That is why the scoping above is
   done here, in code, and why every write goes through newDealDoc/updateDoc
   rather than spreading the request body into a document.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('../_lib/admin');
var Auth = require('../_lib/agent-auth');
var S = require('../_lib/agent-sites');
var KMZ = require('../_lib/kmz');

var MAX_SITES = 100;
var MAX_DEALS_SCAN = 2000;
var MAX_KMZ_B64 = 6 * 1024 * 1024;

/* Every deal the key may see, as [{ id, data }]. */
function visibleDeals(db, caller) {
  var col = db.collection('deals');
  var q = caller.admin ? col.limit(MAX_DEALS_SCAN)
                       : col.where('orgsInvolved', 'array-contains', caller.orgId).limit(MAX_DEALS_SCAN);
  return q.get().then(function (snap) {
    var out = [];
    snap.forEach(function (d) { out.push({ id: d.id, data: d.data() || {} }); });
    return out;
  });
}

function list(req, caller) {
  var db = A.db();
  return visibleDeals(db, caller).then(function (deals) {
    var q = req.query || {};
    var all = deals.map(function (e) { return S.summary(e.id, e.data); });
    var r = S.filterAndSort(all, q);
    var base = Auth.baseUrl(req);
    r.sites.forEach(function (s) {
      s.outlineUrl = base + '/api/agent/site-outline?id=' + encodeURIComponent(s.id);
    });
    return { ok: true, org: caller.orgId, scope: caller.admin ? 'all' : 'org', total: r.total, count: r.sites.length,
             filters: { minAcres: S.num(q.minAcres), minMw: S.num(q.minMw), stage: q.stage || null, state: q.state || null },
             sites: r.sites,
             note: 'Sorted by acreage, then MW. acres is measured from the traced outline when one exists, else the stated figure. Scores are screening ranks from traced geometry, not utility studies.' };
  });
}

/* Resolve the outline for one uploaded site: KMZ bytes, KML text, or a ring. */
function outlineOf(site, caller) {
  if (site.kmzBase64) {
    if (typeof site.kmzBase64 !== 'string' || site.kmzBase64.length > MAX_KMZ_B64) return { error: 'kmzBase64 too large' };
    var buf;
    try { buf = Buffer.from(site.kmzBase64, 'base64'); } catch (e) { return { error: 'kmzBase64 is not base64' }; }
    var kml;
    try { kml = KMZ.isZip(buf) ? KMZ.kmlFromKMZ(buf) : buf.toString('utf8'); }
    catch (e) { return { error: 'could not open the KMZ: ' + e.message }; }
    return S.outlineFromKML(kml, site.name, { source: 'agent-kmz', fileName: site.fileName || 'agent.kmz', by: caller.label, targetMw: site.sizeMw });
  }
  return S.outlineFromInput(site, { by: caller.label });
}

function upsert(req, caller) {
  Auth.requireScope(caller, 'sites:write');
  var b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { throw A.httpError(400, 'body is not JSON'); } }
  var sites = Array.isArray(b.sites) ? b.sites : (b.name ? [b] : null);
  if (!sites) throw A.httpError(400, 'body must be { sites:[ … ] } or one site object with a name');
  if (!sites.length) throw A.httpError(400, 'sites is empty');
  if (sites.length > MAX_SITES) throw A.httpError(400, 'at most ' + MAX_SITES + ' sites per call');

  var db = A.db(), FV = A.FieldValue();
  var batch = 'agent:' + caller.keyId.slice(0, 8) + ':' + Date.now();
  return visibleDeals(db, caller).then(function (existing) {
    var results = [];
    return sites.reduce(function (chain, raw, i) {
      return chain.then(function () {
        var v = S.validateSite(raw);
        if (!v.ok) { results.push({ index: i, name: (raw && raw.name) || '', action: 'error', error: v.error }); return; }
        var site = v.site;
        var o = outlineOf(site, caller);
        if (o.error) { results.push({ index: i, name: site.name, action: 'error', error: o.error }); return; }
        var match = S.matchExisting(site, existing);
        if (match) {
          var fields = S.updateDoc(site, match.data, caller, o.outline, o.grid);
          if (!fields) { results.push({ index: i, name: site.name, action: 'unchanged', id: match.id }); return; }
          var changed = fields._changed, act = fields._activityEntry;
          delete fields._changed; delete fields._activityEntry;
          fields.activity = FV.arrayUnion(act);
          return db.collection('deals').doc(match.id).update(fields).then(function () {
            Object.assign(match.data, fields, { activity: [] });
            results.push({ index: i, name: site.name, action: 'updated', id: match.id, changed: changed,
                           acres: o.outline ? o.outline.acres : S.num(match.data.acres), gridScore: o.grid ? o.grid.score : S.num((match.data.grid || {}).score) });
          });
        }
        var doc = S.newDealDoc(site, caller, o.outline, o.grid, batch);
        return db.collection('deals').add(doc).then(function (ref) {
          existing.push({ id: ref.id, data: doc });
          results.push({ index: i, name: site.name, action: 'created', id: ref.id, stage: 'referred',
                         acres: o.outline ? o.outline.acres : site.acres, gridScore: o.grid ? o.grid.score : null,
                         flags: o.outline ? (o.outline.flags || []).map(function (f) { return f.msg; }) : [] });
        });
      });
    }, Promise.resolve()).then(function () {
      var base = Auth.baseUrl(req);
      results.forEach(function (r) { if (r.id) r.outlineUrl = base + '/api/agent/site-outline?id=' + encodeURIComponent(r.id); });
      var n = function (a) { return results.filter(function (r) { return r.action === a; }).length; };
      return { ok: true, org: caller.orgId, batch: batch, created: n('created'), updated: n('updated'), unchanged: n('unchanged'), errors: n('error'), results: results };
    });
  });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST');
  return Auth.authenticate(req).then(function (caller) {
    Auth.requireScope(caller, 'sites:read');
    return req.method === 'GET' ? list(req, caller) : upsert(req, caller);
  });
});
