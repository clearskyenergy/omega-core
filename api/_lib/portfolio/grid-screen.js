/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/grid-screen.js — the Grid Atlas screen of a portfolio
   site, from public data, for the diligence
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   (screen.js beside this is the customer portfolio's BESS screening
   disposition; this is a different thing and keeps its own name.)

   What a site's diligence learns from public data before anybody calls the
   utility or a carrier (2026-10-25, "Screen with Grid Atlas"), read through
   the platform's OWN server code, never a second copy of it:
     /api/grid-atlas         the point (geocoded from the address) and the
                             nearest substation, its kV and distance
     /api/network-proximity  fiber at the point (FCC BDC, keyed: carrier
                             names need FCC_BB_KEY), the carrier hotel
                             (PeeringDB, the nearest facility with 100+
                             networks) and the lateral estimate
     /api/hosting-capacity   the serving utility by territory and, where the
                             utility publishes it (ComEd and the registry's
                             others), the circuit's load hosting figure
     api/_lib/utility-rates  the utility by ZIP, only when the territory
                             answer has none and the ZIP is not a fallback
   The door invokes the three handlers in-process with the caller's own
   request headers, the way api/portfolio-enrich.js does, so every one of
   them runs its own sign-in and plan gate. Nothing here reads the three
   geodataviewer fiber layers docs/FIBER-AUDIT.md calls fabricated (no
   server endpoint does), nor a licensed vendor's geometry.

   ONE site in TWO phases, because api/site-crm.js has 60 seconds a call and
   the grid (≤ ~38 s on its OSM path) and the network (≤ ~34 s) together can
   exceed it: phase 'grid' locates the site and reads the substation;
   phase 'network' reads fiber and hosting at the point, in parallel. A
   many-site screen is a job (the register's site_jobs), one phase a step,
   resumable; the FCC lookups are counted against the deployment's daily
   allowance (FCC_DAILY_CAP, the FCC's 100 a day an IP, with room).

   The answer is diligence.screen; diligence.js change('screen') moves the
   power, interconnection and fiber gates to SCREENED on it (never to
   confirmed, never past a person's own state). A value that did not come
   back is null and said, never a zero: an empty carrier list with the key
   unset is "carrier names need the FCC key", not "no fiber".
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var U = require('../utility-rates');

var VERSION = 1, KM_MI = 0.621371, FCC_DAILY_CAP = 90;
var TIMEOUT = { grid: 45000, network: 40000, hosting: 25000 };
var PRECISE = ['exact', 'street'];

function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function round(n, dp) { if (n == null || !isFinite(n)) return null; var f = Math.pow(10, dp || 0); return Math.round(n * f) / f; }
function str(v, n) { return v == null ? null : (String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n || 160) || null); }

/* Call one of the platform's own handlers in-process, with a deadline (the
   pattern of api/portfolio-enrich.js). Never throws: a failure is an answer. */
function invoke(handler, req, timeoutMs) {
  return new Promise(function (resolve) {
    var settled = false, status = 200, timer = setTimeout(function () { done({ error: 'timed out' }, 504); }, timeoutMs);
    function done(body, code) { if (settled) return; settled = true; clearTimeout(timer); resolve({ status: code || status, body: body || {} }); }
    var res = { headersSent: false, setHeader: function () {}, status: function (n) { status = n; return res; }, json: function (b) { res.headersSent = true; done(b); return res; }, end: function () { done({}); } };
    try { Promise.resolve(handler(req, res)).catch(function (e) { done({ error: String(e && e.message || e).slice(0, 200) }, e && e.status || 502); }); }
    catch (e) { done({ error: String(e && e.message || e).slice(0, 200) }, e && e.status || 502); }
  });
}

/* Where the site is, as the grid atlas is asked: coordinates when the
   record has them, else the address with its city, state and ZIP. */
function locationOf(site) {
  site = site || {};
  var lat = num(site.lat != null ? site.lat : site.latitude), lng = num(site.lng != null ? site.lng : site.longitude);
  if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat: lat, lng: lng };
  var a = site.address && typeof site.address === 'object' ? site.address : { street: typeof site.address === 'string' ? site.address : null };
  var street = a.street || a.line1 || null, city = a.city || site.city || null, state = a.state || site.state || null, zip = a.zip || site.zip || null;
  var line = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (!street || !(city || zip)) return { error: 'No street address with a city or ZIP on the record to locate the site' };
  return { address: line.slice(0, 300) };
}

/* ── the three answers, mapped (pure) ──────────────────────────────────── */
function fromAtlas(r) {
  var b = r && r.body || {}, ok = r && r.status === 200 && num(b.lat) != null && num(b.lng) != null;
  if (!ok) return { ok: false, error: b.error ? str(b.error, 200) : 'the grid atlas did not answer (' + (r ? r.status : 'no reply') + ')' };
  var g = b.geocode || null, precision = g ? str(g.precision, 20) : 'coordinates';
  var located = { lat: round(num(b.lat), 6), lng: round(num(b.lng), 6), precision: precision, resolvedAddress: str(b.resolvedAddress, 300), note: g && g.note ? str(g.note, 200) : null,
    usable: !g || PRECISE.indexOf(precision) >= 0, approximate: !!g && PRECISE.indexOf(precision) < 0 };
  var s = Array.isArray(b.substations) && b.substations.length ? b.substations[0] : null;
  return { ok: true, located: located,
    power: s ? { substation: str(s.name, 120) || 'Unnamed substation', kv: num(s.voltageKv), distanceMi: num(s.distanceKm) == null ? null : round(num(s.distanceKm) * KM_MI, 1), owner: str(s.owner, 120) } : null,
    source: b.sources && b.sources.substations ? str(b.sources.substations, 160) : 'Grid Atlas' };
}
function fromNetwork(r) {
  var b = r && r.body || {};
  if (!(r && r.status === 200)) return { ok: false, error: b.error ? str(b.error, 200) : 'the network check did not answer (' + (r ? r.status : 'no reply') + ')' };
  var fcc = b.fcc || {}, st = String(fcc.status || ''), provs = Array.isArray(fcc.providers) ? fcc.providers : [];
  var read = st === 'ok' || st === 'empty', carriers = [];
  provs.forEach(function (p) { var n = str(p && p.name, 80); if (n && carriers.indexOf(n) < 0) carriers.push(n); });
  var sym = read ? provs.some(function (p) { return num(p.down) >= 1000 && num(p.up) >= 1000; }) : null;
  var why = st === 'skipped' ? 'carrier names need the FCC key' : st === 'failed' ? 'carrier names not read: ' + String(fcc.note || 'the FCC lookup failed').replace(/^not checked\s*[—-]\s*/, '') : null;
  var fac = b.facilities || {}, hotel = fac.nearestMajor || null, lat = b.fiber && b.fiber.lateral;
  return { ok: true, fiber: {
    carriers: read ? carriers : [], carriersRead: read, carriersStatus: read ? 'read' : st === 'skipped' ? 'needs-key' : st === 'failed' ? 'failed' : 'unknown', carriersNote: why,
    symmetric1g: read ? sym : null, symmetricCount: read ? provs.filter(function (p) { return num(p.down) >= 1000 && num(p.up) >= 1000; }).length : null,
    lateralMi: lat ? num(lat.mi) : null, lateralTo: lat ? str(lat.to, 160) : null,
    carrierHotel: hotel ? str(hotel.name, 120) : null, carrierHotelMi: hotel ? round(num(hotel.mi), 1) : null,
    verdict: b.fiber && b.fiber.verdict ? str(b.fiber.verdict, 20) : null },
    sources: { fcc: read ? 'FCC broadband data (BDC)' : null, peeringdb: fac.status === 'ok' || hotel ? 'PeeringDB' : null } };
}
function fromHosting(r) {
  var b = r && r.body || {};
  if (!(r && r.status === 200)) return { ok: false, error: b.error ? str(b.error, 200) : 'the hosting check did not answer (' + (r ? r.status : 'no reply') + ')' };
  var u = b.utility || null, best = b.best || null, read = b.coverage === 'read' && !!best && num(best.loadKw) != null;
  return { ok: true,
    utility: u && (u.display || u.key) ? { name: str(u.display || u.key, 120), key: str(u.key, 40), eiaId: str(u.eiaId, 12), basis: 'territory' } : null,
    hosting: read ? { coverage: 'read', loadKw: num(best.loadKw), storageKw: num(best.storageKw), circuit: str(best.id || best.name, 80), substation: str(best.substation, 120), kv: num(best.kv),
      basis: str(best.basis, 160), refreshed: str(best.refreshed, 40), source: b.source && b.source.label ? str(b.source.label, 160) : null } : { coverage: str(b.coverage, 40) || 'unknown', note: str(b.note, 300) } };
}
/* the utility by ZIP, only when the rate book truly knows the ZIP */
function utilityByZip(zip) {
  var z = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (z.length < 3) return null;
  var rec = U.lookup(z);
  if (!rec || rec._default || rec._fallback || String(rec.key || '').indexOf('state:') === 0) return null;
  return { name: str(rec.name, 120), key: str(rec.key, 40), eiaId: null, basis: 'zip' };
}
function zipOf(site) { var a = site && site.address && typeof site.address === 'object' ? site.address : {}; return a.zip || (site && site.zip) || null; }

/* ── one phase of one site (the door's job step) ───────────────────────────
   deps: { atlas(body), network(body), hosting(body) } → Promise<{status,
   body}> (the door binds each to its handler through invoke() with the
   caller's headers), fcc: { keySet, left } (the deployment's own key and
   what is left of today's allowance), now. prior: the screen in progress.
   Answers { screen, phase, done }. */
function step(site, prior, deps, opts) {
  opts = opts || {}; deps = deps || {};
  var now = opts.now || null, s = prior && typeof prior === 'object' ? JSON.parse(JSON.stringify(prior)) : { v: VERSION, phase: null, startedAt: now, notes: [], errors: [], sources: {} };
  s.notes = s.notes || []; s.errors = s.errors || []; s.sources = s.sources || {};
  if (!s.phase) {
    var loc = locationOf(site);
    if (loc.error) { s.errors.push({ source: 'location', message: loc.error }); s.phase = 'done'; s.at = now; return Promise.resolve({ screen: finish(s, site), phase: 'grid', done: true }); }
    return Promise.resolve(deps.atlas(loc.lat != null ? { lat: loc.lat, lng: loc.lng, radiusKm: 25 } : { address: loc.address, radiusKm: 25 })).then(function (r) {
      var a = fromAtlas(r);
      if (!a.ok) { s.errors.push({ source: 'grid-atlas', message: a.error }); s.phase = 'done'; s.at = now; return { screen: finish(s, site), phase: 'grid', done: true }; }
      s.located = a.located; s.power = a.power; s.sources.substations = a.source;
      if (a.located.approximate) s.notes.push('The address matched only approximately (' + a.located.precision + '): ' + (a.located.note || 'confirm the point') + '. Nothing is screened on it.');
      if (!a.power) s.notes.push('No substation within the atlas’s search radius');
      s.phase = a.located.usable ? 'grid' : 'done';
      if (!a.located.usable) s.at = now;
      return { screen: s.phase === 'done' ? finish(s, site) : s, phase: 'grid', done: s.phase === 'done' };
    });
  }
  if (s.phase === 'grid') {
    var pt = { lat: s.located.lat, lng: s.located.lng }, fcc = deps.fcc || {}, spendFcc = !!fcc.keySet, overBudget = spendFcc && !(num(fcc.left) > 0);
    var net = overBudget ? Promise.resolve({ status: 0, body: { error: 'skipped' } }) : Promise.resolve(deps.network(pt));
    var host = Promise.resolve(deps.hosting({ lat: pt.lat, lng: pt.lng, mode: 'load', unit: { kw: num(opts.unitKw) > 0 ? num(opts.unitKw) : 75, kwh: 0, name: 'Compute load' } }));
    return Promise.all([net, host]).then(function (rr) {
      var n = overBudget ? null : fromNetwork(rr[0]), h = fromHosting(rr[1]);
      if (overBudget) { s.fiber = { carriers: [], carriersRead: false, carriersStatus: 'limit', carriersNote: 'the FCC lookups for today are used up: carrier names on the next run', symmetric1g: null, lateralMi: null, carrierHotel: null, carrierHotelMi: null }; }
      else if (n.ok) { s.fiber = n.fiber; if (n.sources.fcc) s.sources.fcc = n.sources.fcc; if (n.sources.peeringdb) s.sources.peeringdb = n.sources.peeringdb; s.fccSpent = spendFcc; }
      else s.errors.push({ source: 'network-proximity', message: n.error });
      if (h.ok) { s.hosting = h.hosting; if (h.utility) s.utility = h.utility; if (h.hosting.coverage === 'read' && h.hosting.source) s.sources.hosting = h.hosting.source; }
      else s.errors.push({ source: 'hosting-capacity', message: h.error });
      if (!s.utility) { var z = utilityByZip(zipOf(site)); if (z) { s.utility = z; s.sources.utility = 'the rate book, by ZIP'; } }
      else s.sources.utility = s.utility.basis === 'territory' ? 'the utility territory at the point' : s.sources.utility;
      s.phase = 'done'; s.at = now;
      return { screen: finish(s, site), phase: 'network', done: true };
    });
  }
  return Promise.resolve({ screen: finish(s, site), phase: 'done', done: true });
}
/* the record as diligence.js keeps it */
function finish(s, site) {
  var sources = s.sources || {}, utility = s.utility || null;
  if (!utility) { utility = utilityByZip(zipOf(site)); if (utility) sources.utility = 'the rate book, by ZIP'; }
  return { v: VERSION, at: s.at || null, startedAt: s.startedAt || null, located: s.located || null, power: s.power || null,
    fiber: s.fiber || null, hosting: s.hosting || null, utility: utility,
    sources: sources, notes: (s.notes || []).slice(0, 10), errors: (s.errors || []).slice(0, 10), fccSpent: s.fccSpent === true, complete: s.phase === 'done' };
}
/* run both phases (a single site, or a test): the door's job steps instead */
function run(site, deps, opts) {
  return step(site, null, deps, opts).then(function (a) { return a.done ? a.screen : step(site, a.screen, deps, opts).then(function (b) { return b.screen; }); });
}

module.exports = { VERSION: VERSION, FCC_DAILY_CAP: FCC_DAILY_CAP, TIMEOUT: TIMEOUT, invoke: invoke, locationOf: locationOf, fromAtlas: fromAtlas, fromNetwork: fromNetwork, fromHosting: fromHosting,
  utilityByZip: utilityByZip, step: step, run: run, finish: finish };
