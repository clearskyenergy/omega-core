/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Finish matching a listing catalogue to the map.
 *
 * The first import kept only a Census batch "Exact" match and never sent a
 * row whose address did not parse cleanly, which left a quarter of Cook
 * County unplaced. This module is the second and third pass, shared by the
 * local prepare script and the staff "Match remaining locations" action:
 *
 *   1. Census one-line geocoder, several spellings of the same address
 *      (ranges → first number, suite/unit dropped, corner listings →
 *      first street). A match is street-interpolated, never rooftop, and
 *      is recorded as such.
 *   2. Rows the geocoder still cannot place borrow the centre of the rows
 *      it DID place in the same ZIP, then the same city. That is an
 *      "approximate" location and every card says so; it is enough to put
 *      the listing on the map and in a bounds search, and nothing else
 *      (capacity, scoring, pricing) reads a coordinate as evidence.
 *
 * Pure apart from the fetch it is handed. No credentials; the Census
 * geocoder is a free public service with no key.
 */
'use strict';

var CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
var BENCHMARK = 'Public_AR_Current';
/* Cook County and its neighbours. Anything the geocoder puts outside this box
   matched the wrong "Chicago Ave" somewhere else and is refused. */
var BOX = { w: -89, e: -87, s: 41, n: 43 };

function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

/* Spellings to try, most specific first. Each is "street, city, state zip". */
function variants(row) {
  var street = clean(row.addr), city = clean(row.city), state = clean(row.state) || 'IL', zip = clean(row.zip);
  var out = [], seen = {};
  function push(st) {
    st = clean(st).replace(/,+$/, '');
    if (!st || /^0\b/.test(st)) return;
    var line = st + (city ? ', ' + city : '') + ', ' + state + (zip ? ' ' + zip : '');
    if (seen[line.toLowerCase()]) return; seen[line.toLowerCase()] = 1; out.push(line);
  }
  if (!city && !zip && row.fullAddress) {
    /* The prepare step could not split this address; hand the whole line over. */
    var line = clean(row.fullAddress); if (line && !seen[line.toLowerCase()]) { seen[line.toLowerCase()] = 1; out.push(line); }
  }
  push(street);
  /* "1234-1240 W Madison St" and "1234 - 1240" → "1234 W Madison St" */
  push(street.replace(/^(\d+)\s*[-–]\s*\d+\b/, '$1'));
  /* Suites, units, floors and building letters are not on the street file. */
  var noUnit = street.replace(/[,\s]+(?:suite|ste|unit|apt|fl|floor|bldg|building|#)\s*[\w-]+.*$/i, '');
  push(noUnit); push(noUnit.replace(/^(\d+)\s*[-–]\s*\d+\b/, '$1'));
  /* "NWC Main St & 1st Ave", "Main St & 1st Ave", "Main St at 1st Ave": the first street alone
     places the corner within a block or two. */
  var corner = street.replace(/^(?:[NSEW]{1,2}C|[NSEW]{1,2}\/?[NSEW]?\s+corner(?:\s+of)?|corner\s+of)\s+/i, '');
  var parts = corner.split(/\s+(?:&|and|at|@)\s+/i);
  if (parts.length > 1) { push(parts[0]); push(parts[1]); }
  return out;
}

/* One Census one-line result → {lat, lon, matchedAddress} or null. */
function parseCensus(json) {
  var m = json && json.result && json.result.addressMatches;
  if (!Array.isArray(m) || !m.length || !m[0].coordinates) return null;
  var x = Number(m[0].coordinates.x), y = Number(m[0].coordinates.y);
  if (!isFinite(x) || !isFinite(y)) return null;
  return { lon: x, lat: y, matchedAddress: String(m[0].matchedAddress || '') };
}

function inBox(p, box) { box = box || BOX; return p && p.lon >= box.w && p.lon <= box.e && p.lat >= box.s && p.lat <= box.n; }

function censusUrl(line) {
  return CENSUS + '?benchmark=' + BENCHMARK + '&format=json&address=' + encodeURIComponent(line);
}

/* Geocode ONE row through its variants. `fetchJson(url)` resolves to parsed
   JSON or throws. Returns the placement or null; never throws for a bad
   address, only for a transport failure on the first variant (so a dead
   service is reported, not recorded as "no match" on a thousand rows). */
async function geocodeRow(row, fetchJson, box) {
  var lines = variants(row), i, hit;
  for (i = 0; i < lines.length; i++) {
    var json;
    try { json = await fetchJson(censusUrl(lines[i])); }
    catch (e) { if (i === 0) throw e; continue; }
    hit = parseCensus(json);
    if (hit && inBox(hit, box)) {
      return { lat: hit.lat, lon: hit.lon, geocode: { status: 'matched', source: 'US Census', accuracy: 'street-interpolated, not rooftop', matchedAddress: hit.matchedAddress, query: lines[i] } };
    }
  }
  return null;
}

/* Run the geocoder over the unplaced rows, `concurrency` at a time, and stop
   taking new rows once `budgetMs` has elapsed (a serverless call has a
   ceiling; the browser calls again). Mutates rows in place. Returns counts. */
async function geocodeRows(rows, fetchJson, opts) {
  opts = opts || {};
  var budget = opts.budgetMs || 40000, conc = opts.concurrency || 6, limit = opts.limit || 400, box = opts.box;
  var now = opts.now || Date.now, start = now();
  var todo = rows.filter(function (r) { return r.lat == null && !(r.geocode && r.geocode.attempted); }).slice(0, limit);
  var idx = 0, matched = 0, attempted = 0, failed = 0, transportError = null;
  async function worker() {
    while (idx < todo.length && now() - start < budget && !transportError) {
      var r = todo[idx++];
      var hit;
      try { hit = await geocodeRow(r, fetchJson, box); }
      catch (e) { transportError = e; break; }
      attempted++;
      if (hit) { r.lat = hit.lat; r.lon = hit.lon; r.geocode = hit.geocode; matched++; }
      else { failed++; r.geocode = Object.assign({}, r.geocode || {}, { status: 'unmatched', source: 'US Census', accuracy: 'unknown', attempted: true }); }
    }
  }
  var workers = []; for (var w = 0; w < conc; w++) workers.push(worker());
  await Promise.all(workers);
  if (transportError && !attempted) throw transportError;
  return { attempted: attempted, matched: matched, failed: failed, remaining: rows.filter(function (r) { return r.lat == null && !(r.geocode && r.geocode.attempted); }).length, transportError: transportError ? String(transportError.message || transportError) : null };
}

function median(xs) { var a = xs.slice().sort(function (p, q) { return p - q; }), n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; }
function centre(list) { return { lat: median(list.map(function (r) { return r.lat; })), lon: median(list.map(function (r) { return r.lon; })), n: list.length }; }
function norm(s) { return clean(s).toLowerCase(); }

/* Rows still unplaced after the geocoder take the centre of the MATCHED rows
   (never other approximations) in their ZIP, else their city. Marked
   'approximate' with the population it was derived from. Returns count. */
function areaFallback(rows) {
  var byZip = {}, byCity = {}, placed = 0;
  rows.forEach(function (r) {
    if (r.lat == null || !r.geocode || r.geocode.status !== 'matched') return;
    if (r.zip) (byZip[norm(r.zip)] = byZip[norm(r.zip)] || []).push(r);
    if (r.city) (byCity[norm(r.city)] = byCity[norm(r.city)] || []).push(r);
  });
  rows.forEach(function (r) {
    if (r.lat != null) return;
    var pool = r.zip && byZip[norm(r.zip)], level = 'ZIP ' + clean(r.zip);
    if (!pool || pool.length < 2) { pool = r.city && byCity[norm(r.city)]; level = clean(r.city); }
    if (!pool || pool.length < 2) return;
    var c = centre(pool);
    r.lat = c.lat; r.lon = c.lon;
    r.geocode = { status: 'approximate', source: 'derived', accuracy: 'area centre of ' + c.n + ' matched listings in ' + level + '; not the parcel', attempted: true, area: level };
    placed++;
  });
  return placed;
}

/* Default transport: global fetch with a hard timeout. */
async function fetchJson(url) {
  var res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Census HTTP ' + res.status);
  return res.json();
}

module.exports = { variants: variants, parseCensus: parseCensus, geocodeRow: geocodeRow, geocodeRows: geocodeRows, areaFallback: areaFallback, fetchJson: fetchJson, censusUrl: censusUrl, BOX: BOX };
