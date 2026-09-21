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

function census(addr) {
  var url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
          + '?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(addr);
  return getJson(url).then(function (j) {
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
   address", not a 500 on somebody's storefront. */
function geocode(addr) {
  var key = String(addr || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key || key.length < 4) return Promise.resolve(null);
  if (Object.prototype.hasOwnProperty.call(CACHE, key)) return Promise.resolve(CACHE[key]);

  return census(key).then(function (hit) {
    return hit || nominatim(key);
  }).then(function (hit) {
    /* Bounded: the keys are caller-supplied strings. Cleared wholesale rather
       than evicted one by one — the cache is an optimisation, and a warm
       instance losing it costs one free lookup. */
    if (Object.keys(CACHE).length >= CACHE_CAP) CACHE = {};
    CACHE[key] = hit || null;
    return hit || null;
  });
}

module.exports = { geocode: geocode, census: census, nominatim: nominatim, UA: UA };
