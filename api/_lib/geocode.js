/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/geocode.js — an address to a point, with no key and no bill
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   TWO KEYLESS SOURCES, in order. Both are free, so this is the one upstream
   call on the public storefront that costs nothing — which matters, because it
   is the first thing a stranger does and the thing a bot would do ten thousand
   times.

     1. US CENSUS GEOCODER. Authoritative for US street addresses, no key, no
        attribution requirement, no rate limit published for this endpoint.
        Returns nothing outside the US, which is correct here: the parcel
        layers behind it are US-only, so a match we could not then use would
        be a worse answer than none.

     2. NOMINATIM (OpenStreetMap), countrycodes=us. The fallback for an
        address Census cannot parse — a business name, a rural route, a new
        subdivision. ⚠ Nominatim's usage policy requires a real User-Agent
        identifying the application and asks for at most 1 request/second.
        The UA below satisfies the first. The second is why this is a
        FALLBACK: it is only reached when Census misses, and the caller
        (api/embed-layout.js) rate-limits ahead of it.

   THE CACHE IS PER WARM INSTANCE, like the one in _lib/embed.js, and for the
   same reason: an address does not move, a repeat costs nothing, and paying
   for a Firestore write to remember a free lookup is the wrong trade.

   ── WHY THIS IS NOT IN THE BROWSER ──────────────────────────────────────
   It could be — neither source needs a key. It is here because the caller
   needs the POINT to look up a parcel, and that lookup is metered and gated.
   A browser that geocoded for itself would hand us a lat/lng of its choosing,
   and "the address I typed" and "the point I want you to bill a parcel
   lookup for" would stop being the same thing.

   ── DUPLICATION, KNOWINGLY ──────────────────────────────────────────────
   api/greenfield.js had these two functions inline first. It now delegates
   here. This is the one copy; do not make a second (CLAUDE.md records what
   three copies of orgAlias() cost).
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

var UA = 'ClearSky-OMEGA/1.0 (+https://clearskyomega.com)';
var TIMEOUT_MS = 7000;
var CACHE = {};
var CACHE_CAP = 2000;

function getJson(url, ms) {
  var ctl = typeof AbortController === 'function' ? new AbortController() : null;
  var t = ctl ? setTimeout(function () { ctl.abort(); }, ms || TIMEOUT_MS) : null;
  var opts = { headers: { 'User-Agent': UA, Accept: 'application/json' } };
  if (ctl) opts.signal = ctl.signal;
  return fetch(url, opts).then(function (r) {
    if (t) clearTimeout(t);
    if (!r.ok) throw new Error('upstream ' + r.status);
    return r.json();
  }, function (e) { if (t) clearTimeout(t); throw e; });
}

function census(addr, ms) {
  var url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
          + '?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(addr);
  return getJson(url, ms).then(function (j) {
    var m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
    if (!m || !m.coordinates) return null;
    return {
      lat: Number(m.coordinates.y), lng: Number(m.coordinates.x),
      matched: String(m.matchedAddress || ''), source: 'census'
    };
  })['catch'](function () { return null; });
}

function nominatim(addr) {
  var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q='
          + encodeURIComponent(addr);
  return getJson(url).then(function (j) {
    if (!j || !j[0]) return null;
    var lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng, matched: String(j[0].display_name || ''), source: 'nominatim' };
  })['catch'](function () { return null; });
}

/* Resolves { lat, lng, matched, source } or null. NEVER rejects: a geocoder
   being down is a miss the caller reports as "we could not find that
   address", not a 500 on somebody's storefront.

   opts.censusOnly: Census and nothing else — for a BULK caller (a customer's
   site list, api/my-sites.js and api/logic-custody.js), because Nominatim's
   policy is one request a second and a list of forty would break it. A
   census-only miss is remembered apart from a full miss, so it never stops
   a later single lookup reaching the fallback. opts.timeoutMs shortens the
   wait on each call. */
function keyOf(addr) { return String(addr || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function geocode(addr, opts) {
  opts = opts || {};
  var key = keyOf(addr);
  if (!key || key.length < 4) return Promise.resolve(null);
  /* a full answer serves either kind of call (a full miss means Census
     missed too); a census-only miss serves only census-only calls */
  if (Object.prototype.hasOwnProperty.call(CACHE, key)) return Promise.resolve(CACHE[key]);
  if (opts.censusOnly && Object.prototype.hasOwnProperty.call(CACHE, 'census:' + key)) return Promise.resolve(CACHE['census:' + key]);

  return census(key, opts.timeoutMs).then(function (hit) {
    return hit || (opts.censusOnly ? null : nominatim(key));
  }).then(function (hit) {
    /* Bounded: the keys are caller-supplied strings. Cleared wholesale rather
       than evicted one by one — the cache is an optimisation, and a warm
       instance losing it costs one free lookup. */
    if (Object.keys(CACHE).length >= CACHE_CAP) CACHE = {};
    if (hit || !opts.censusOnly) CACHE[key] = hit || null; else CACHE['census:' + key] = null;
    return hit || null;
  });
}

/* What this instance already knows about an address, WITHOUT a lookup: the
   answer geocode() would give from its cache (a hit, or a remembered miss
   as null), or undefined when only the network could say. A metered bulk
   caller (api/_lib/site-geo.js) asks this first, so a cache hit never
   spends anybody's allowance. */
function peek(addr, opts) {
  opts = opts || {};
  var key = keyOf(addr);
  if (!key || key.length < 4) return null;
  if (Object.prototype.hasOwnProperty.call(CACHE, key)) return CACHE[key];
  if (opts.censusOnly && Object.prototype.hasOwnProperty.call(CACHE, 'census:' + key)) return CACHE['census:' + key];
  return undefined;
}

/* Many addresses inside a budget, for a pasted list: at most `max` lookups,
   `concurrency` at a time, and none STARTED after `budgetMs` — a serverless
   call has 30 seconds (vercel.json maxDuration) and one Census call may
   take up to its timeout. Resolves an array parallel to `list`: a hit, null
   for a miss, undefined for an address not looked up. Goes through
   module.exports.geocode so a test can stand in for the network. */
function many(list, opts) {
  opts = opts || {};
  var max = Math.min(list.length, opts.max || 40), width = Math.max(1, opts.concurrency || 4), budget = opts.budgetMs || 15000, started = Date.now(), next = 0, out = new Array(list.length);
  function lane() {
    if (next >= max || Date.now() - started > budget) return Promise.resolve();
    var i = next++;
    return Promise.resolve(module.exports.geocode(list[i], { censusOnly: opts.censusOnly !== false, timeoutMs: opts.timeoutMs }))
      .then(function (hit) { out[i] = hit || null; }, function () { out[i] = null; }).then(lane);
  }
  var lanes = []; for (var w = 0; w < width; w++) lanes.push(lane());
  return Promise.all(lanes).then(function () { return out; });
}

module.exports = { geocode: geocode, peek: peek, many: many, census: census, nominatim: nominatim, UA: UA };
