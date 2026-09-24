/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/site-lease: the battery host lease offer for a sized site.
   Authenticated, scoped to the caller's workspace, gated on Site Finder
   like the site catalogue and the site score. The rate card stays here;
   a tenant rep gets the rent bands to say in the room and never the rates
   (staff see the components). See api/_lib/site-lease.js. */
'use strict';
var A = require('./_lib/admin'), E = require('./_lib/embed'), access = require('./site-score')._helpers.entitle, L = require('./_lib/site-lease');

function str(v) { return v == null ? '' : String(v).trim(); }
function brandOf(org) {
  org = org || {}; var eb = org.exportBrand || {}, colors = org.colors || {};
  return { name: str(eb.name) || str(org.name) || '', logoUrl: str(eb.logo) || str(eb.logoUrl) || str(org.logoUrl) || '',
    accent: str(colors.accent) || str(eb.accent) || '', tagline: str(eb.tagline) || '', resolved: !!(str(eb.name) || str(org.name)) };
}
function siteEcho(s) {
  if (!s || typeof s !== 'object') return null;
  return { id: s.id == null ? null : str(s.id).slice(0, 200), addr: str(s.addr).slice(0, 300), city: str(s.city).slice(0, 100),
    owner: str(s.owner).slice(0, 200), feederId: str(s.feederId).slice(0, 100), type: str(s.type).slice(0, 100),
    lotAcres: Number(s.lotAcres) > 0 ? Number(s.lotAcres) : null };
}

async function quote(db, caller, org, b) {
  var doc = await db.collection('omega_orgs').doc(org).get();
  var out = L.offer({ kw: b.kw, kwh: b.kwh, acres: b.acres, termYears: b.termYears });
  if (!caller.staff) { delete out.components; out.rateCard = { version: out.rateCard.version, asOf: out.rateCard.asOf, disclosed: false }; }
  else { out.rateCard.disclosed = true; out.rateCard.sources = L.RATE_CARD.sources; }
  return { build: 'site-lease/1', offer: out, site: siteEcho(b.site), brand: brandOf(doc.exists ? doc.data() : null),
    disclaimer: 'Indicative host lease priced from published host-lease benchmarks (' + out.rateCard.version + '), not a binding offer. Rent, term and conditions are subject to a signed letter of intent, utility interconnection approval and site diligence.' };
}

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') throw A.httpError(405, 'POST required');
  var b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw A.httpError(400, 'a JSON object is required');
  var caller = await A.authenticate(req), org = A.safeOrg(b.orgId || caller.orgId);
  if (!org) throw A.httpError(400, 'Invalid workspace');
  if (!await A.canActInOrg(caller, org)) throw A.httpError(403, 'Not your workspace');
  await access(caller, org);
  E.rateLimit('site-lease:' + org, 60);
  var kw = Number(b.kw);
  if (!isFinite(kw) || kw <= 0 || kw > 10000000) throw A.httpError(400, 'kw is outside the supported range');
  ['kwh', 'acres', 'termYears'].forEach(function (k) { if (b[k] != null && b[k] !== '' && !(isFinite(Number(b[k])) && Number(b[k]) >= 0)) throw A.httpError(400, k + ' must be a number'); });
  return quote(A.db(), caller, org, b);
});
module.exports._helpers = { quote: quote, brandOf: brandOf, siteEcho: siteEcho };
