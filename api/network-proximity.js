/* ═══════════════════════════════════════════════════════════════════════════════
   /api/network-proximity.js — fiber and interconnection proximity as a service
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Vercel serverless function.

   ─────────────────────────────────────────────────────────────────────────────
   THE QUESTION THIS ANSWERS
   ─────────────────────────────────────────────────────────────────────────────
   "Can this parcel be lit — is there fiber that will carry a data load, how
   far is it, what would the lateral cost, and how far is the nearest place a
   carrier will actually cross-connect?"

   For a compute site that is the hard gate. Power gets a site to a queue;
   fiber decides whether the queue was worth joining. It was checked by hand,
   per site, from a browser tool (grid-atlas.html) whose fiber pieces ran in
   the page and whose facility list in the editor was a STATIC SNAPSHOT of
   PeeringDB pasted into editor.html. The Network Proximity button broke on
   a variable that lived inside a wrapped block, and the screening register
   had no fiber axis at all. This is the one implementation both now call.

   ─────────────────────────────────────────────────────────────────────────────
   WHY A FUNCTION
   ─────────────────────────────────────────────────────────────────────────────
   Per CLAUDE.md, scoring runs in /api/ — the weights, the verdict rule and
   the build-cost band are the part of this that is worth anything, and a
   page can be read by any tenant. It also removes two browser problems at
   once: PeeringDB sends no CORS headers, and the ArcGIS harvest fans out to
   a dozen hosts a kiosk browser will not be allowed to reach.

   ─────────────────────────────────────────────────────────────────────────────
   SOURCES — every one is free and keyless except the FCC point lookup
   ─────────────────────────────────────────────────────────────────────────────
     PeeringDB           carrier facilities + exchanges. net_count is the best
                         public proxy for real fiber density there is.
     FCC BDC at point    business fiber reported at the location, through
                         broadbandmap.com's keyed republish (FCC_BB_KEY).
                         No key → "not checked", which is NOT "no fiber".
     OpenStreetMap       telecom=* (exchanges, data centres, cabinets) and
                         communication=line (mapped fibre). Partial coverage,
                         reported as such.
     Surveyed plant      municipal / agency ArcGIS layers with real conduit and
                         cable geometry, verified live (FIBER_PLANT, STATE_FIBER).
     AGOL harvest        ArcGIS Online search for fiber feature services that
                         intersect the site, walked for polyline sublayers.
                         Hundreds of cities publish this pattern; hardcoding
                         them rots, so they are discovered per request.
     Long-haul corridors data/us-longhaul-fiber.geojson — 317 intercity
                         corridors routed over the road network at build time,
                         because US long-haul fiber is laid in transportation
                         rights-of-way (Durairajan et al., SIGCOMM 2015). 53 of
                         them carry that paper's citation and carrier count;
                         the rest assert a corridor and nothing about who is
                         in it. Local, so it cannot fail.
     Operating compute   api/_lib/datacenters.js — 3,100+ US facilities merged
                         from Compute Atlas (CC BY 4.0), the Global Data Center
                         Map and the CYBR capstone. An operating facility is
                         proof carrier fiber reaches an address. Local.
     Carrier directory   data/us-fiber-carriers.json — who publishes a route
                         map for this region, from the Telecom Ramblings index.
                         A call list, not geometry.

   Every source reports ok / empty / failed and how long it took, in the
   response. An empty answer from a source that failed is the failure mode
   this file exists to avoid: "not checked" and "none" are different words.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT THIS IS NOT
   ─────────────────────────────────────────────────────────────────────────────
   Not a carrier quote, not a route survey, not lit capacity. Distances to
   facilities are great-circle × ROUTE_FACTOR; distances to plant are to the
   nearest published segment. The verdict says which sites earn a carrier
   conversation first and what to ask. Confirm route, conduit and capacity
   with the providers before it informs a siting decision.

   ENVIRONMENT — all optional
     FCC_BB_KEY           broadbandmap.com API key (100 req/day/IP on alpha)
     OSRM_BASE            not read here: corridors are routed once, at build
                          time, by scripts/build-fiber-backbone.js. Routing
                          317 corridors per request would be a page's mistake
                          to make, not a function's.
     GRID_ATLAS_ORIGINS   extra CORS origins, comma separated
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var auth = require('./_lib/verify-token');

var BUILD = '2026-09-18.public-fiber';
var MODEL = 'network-proximity-v3';

/* ── PLANNING CONSTANTS — argue with these here, not in the code below ───── */
var ROUTE_FACTOR = 1.4;            /* built route vs great circle, typical */
var US_PER_KM    = 5;              /* µs per km one way in glass (~200,000 km/s) */
var MAJOR_NETS   = 100;            /* a carrier hotel, not a closet */
var CARRIER_NETS = 10;             /* enough carriers to get a competitive quote */
var FACILITY_RADIUS_MI = 160;      /* how far a facility still matters for latency */
var PLANT_RADIUS_MI    = 15;       /* how far surveyed plant is worth measuring to */
var OSM_RADIUS_M       = 12000;
/* Lateral construction, per mile, construction only — not a carrier quote.
   Aerial rural sits at the bottom, urban underground at the top. The band
   is wide because the thing that decides it (ROW, boring vs trenching,
   make-ready) is not in any dataset here. */
var LATERAL_COST_PER_MI = { low: 45000, high: 250000 };

/* Fiber score weights — IDENTICAL to scoreFiber() in grid-atlas-national.js
   so the atlas page and this service put the same number on a site. If one
   changes, change both; the page is the one that should eventually call
   this instead. */
var W = { facility: 40, density: 25, service: 20, exchange: 15, longhaulBonus: 10 };

/* ── verified surveyed-plant endpoints (from grid-atlas-national.js) ───────
   Confirmed live from their own REST directory listings. Each is queried in
   a bbox around the site and skipped quietly when the bbox is outside its
   coverage — a Rockford layer answering "0 features" for Texas is correct. */
var FIBER_PLANT = [
  { n: 'Rockford IL · Fiber Cable',      u: 'https://rockgis.rockfordil.gov/arcgissvr/rest/services/Fiber_Data_Map/MapServer/3' },
  { n: 'Rockford IL · Fiber Conduit',    u: 'https://rockgis.rockfordil.gov/arcgissvr/rest/services/Fiber_Data_Map/MapServer/2' },
  { n: 'Decatur IL · Fiber Optic Cable', u: 'https://maps.decaturil.gov/arcgis/rest/services/PublicWorks/FiberInfrastructure/FeatureServer/1' },
  { n: 'Concord MA · Fiber',             u: 'https://gis.concordma.gov/arcgis/rest/services/Fiber/ConcordFiber/MapServer/0' },
  /* CA Middle-Mile via the CAMMBI Hub. LICENSING UNRESOLVED for onward
     serving to tenants — see the note in grid-atlas-national.js. Distances
     are reported; geometry is never returned from here. */
  { n: 'CA Middle-Mile (CAMMBI)',        u: 'https://services6.arcgis.com/sAv98EYUZbLCVPW0/arcgis/rest/services/MMBI_Statewide_Network_High_All/FeatureServer/1',
    nameField: ['County_Name', 'SegmentName', 'RouteName', 'Name'], metaField: ['Public_Construction_Status', 'Status'] }
];

/* ── AGOL harvest vocabulary (from grid-atlas-national.js §36) ──────────── */
var AGOL = 'https://www.arcgis.com/sharing/rest';
var HARVEST_QUERIES = [
  '(("fiber conduit" OR "fibre conduit" OR "fiber optic cable" OR "fiber cable") AND type:"Feature Service")',
  '(("fiber optic" OR "fibre optic") AND (conduit OR cable OR route OR duct OR plant) AND (type:"Feature Service" OR type:"Map Service"))',
  '(("dark fiber" OR "middle mile" OR "middle-mile" OR "I-Net" OR "institutional network") AND type:"Feature Service")',
  '((broadband OR telecom OR telecommunications) AND (infrastructure OR conduit OR fiber) AND type:"Feature Service")'
];
var DISCOVER_SKIP = /(^esri_|_demo$|sample|training|test|template)/i;
var LAYER_KEEP = /fib|conduit|duct|cable|dark.?fiber|middle.?mile|backbone|telecom|i-?net|broadband.?(route|line|infra)/i;
var LAYER_SKIP = /service.?area|coverage|eligib|grant|award|census|block|boundary|parcel|address|point|structure|pole|node|vault|handhole/i;
var OWNER_FIELDS = ['OWNER', 'Owner', 'owner', 'OWNERNAME', 'PROVIDER', 'Provider', 'provider', 'COMPANY', 'Company', 'CARRIER', 'Carrier', 'AGENCY', 'Agency', 'OPERATOR', 'Operator'];
var NAME_FIELDS  = ['PROJECTNAME', 'ProjectName', 'NAME', 'Name', 'name', 'ROUTENAME', 'RouteName', 'SegmentName', 'LABEL', 'Label', 'DESCRIPTION', 'Description', 'CONDUITID', 'CABLEID', 'County_Name'];
var TYPE_FIELDS  = ['SUBTYPECODE', 'SubtypeCode', 'CABLETYPE', 'CableType', 'TYPE', 'Type', 'MATERIAL', 'Material', 'STATUS', 'Status', 'PHASE', 'Phase', 'Public_Construction_Status'];
var HARVEST_MAX_SERVICES = 8, HARVEST_MAX_LAYERS = 3;

/* AGOL's bbox filter is only as good as the extent an item's publisher
   recorded, and a surprising number record the whole planet: a Broward
   County layer came back for New Jersey, a Buffalo one for Texas. So each
   service's OWN metadata extent is tested against the site before a single
   feature query is made. Web Mercator extents are converted; anything in
   another projection is let through (the bbox query still filters it). */
function extentContains(meta, lat, lon) {
  var e = meta && (meta.fullExtent || meta.extent || meta.initialExtent);
  if (!e || e.xmin == null) return true;
  var wk = (e.spatialReference && (e.spatialReference.latestWkid || e.spatialReference.wkid)) || 4326;
  var lo = [e.xmin, e.ymin], hi = [e.xmax, e.ymax];
  if (wk === 102100 || wk === 3857 || (wk !== 4326 && looksWebMerc(e.xmin, e.ymin))) {
    lo = webMercToWgs(Math.max(-20037508, e.xmin), Math.max(-20037508, e.ymin));
    hi = webMercToWgs(Math.min(20037508, e.xmax), Math.min(20037508, e.ymax));
  }
  else if (wk !== 4326 && !looksWgs(e.xmin, e.ymin)) return true;
  /* Measured 2026-09-17: the items AGOL returns for a New Jersey bbox
     include a Broward County service whose recorded extent is
     ±30,000 km (past the edge of the projection), a "Map Edit Everyone"
     spanning 68° of longitude, and a national FCC availability layer.
     Their extents DO contain the site, which is why a containment test
     alone let them through. Surveyed plant is city- or state-scale;
     anything continent-scale is not local plant, whatever it is called. */
  if ((hi[0] - lo[0]) > 40 || (hi[1] - lo[1]) > 30) return false;
  var pad = 0.3;
  return lon >= lo[0] - pad && lon <= hi[0] + pad && lat >= lo[1] - pad && lat <= hi[1] + pad;
}

/* ── long-haul corridors, data centers and the carrier directory ───────────
   All three are generated or curated files, required rather than fetched, so
   a corridor measurement costs no network call and cannot fail.

     api/_lib/longhaul-corridors.js   scripts/build-fiber-backbone.js
     api/_lib/datacenters.js          scripts/build-fiber-facilities.js
     data/us-fiber-carriers.json      hand-maintained from the Telecom
                                      Ramblings network-map index

   The corridors used to be straight chords between city pairs. They are now
   routed over the road network at build time, because long-haul fiber is laid
   in transportation rights-of-way (InterTubes, SIGCOMM 2015) and a chord
   crosses country no conduit crosses. A corridor whose build could not be
   routed carries routed:false and says so in its evidence line. */
/* ── THE SHARED FIBER-EVIDENCE LIBRARY ────────────────────────────────────
   api/_lib/fiber-evidence.js is the ONE interpreter of the bundled public
   route inventory (195 OSM optical routes, 1,681 unknown-medium telecom
   routes, 5,996 telecom facilities, 2,473 California MMBI design/status
   parts). Grid Atlas reaches it through /api/fiber-screen; this function
   reaches it directly. Same library, same classifier, same nulls — which is
   the entire point: the two tools must not disagree about one location.

   It is reported BESIDE the existing analysis and folded into NO existing
   score. score(), verdict(), capacity() and dcSuitability() are untouched by
   it on purpose. Those numbers are already published on saved rows and in
   the screening register, and silently moving them because a new dataset
   arrived would be the worst kind of change: invisible, and wrong in a
   direction nobody asked for. */
var fiberEvidence = require('./_lib/fiber-evidence.js');
var CORRIDORS  = require('./_lib/longhaul-corridors.js');
var DCS        = require('./_lib/datacenters.js');
var CARRIERS   = require('../data/us-fiber-carriers.json');

/* How far a corridor still matters. Beyond 50 mi the lateral dominates every
   other consideration and the corridor is context, not an option. */
var CORRIDOR_RADIUS_MI = 50;
/* Two corridors count as independent paths only if they leave the site in
   materially different directions. Two readings of the same I-80 conduit
   30 miles apart is one path, and calling it two is how a single backhoe
   takes out a "redundant" site. */
var DIVERSITY_BEARING_DEG = 40;
/* Data centers worth reporting as comparables and as evidence of plant. */
var DC_RADIUS_MI = 50;

/* Planning bands for fiber count in a corridor of each class. These are
   ORDER-OF-MAGNITUDE PLANNING FIGURES for a first conversation, not counts:
   real strand counts are per-cable, per-carrier, and sold as licensed data.
   A long-haul ROW typically carries several carriers' cables at 144–864
   strands each; metro distribution is an order smaller; a rural edge lateral
   smaller again. Quoted as a range with the basis attached, always. */
var STRAND_BAND = {
  backbone: { low: 432,  high: 3456, basis: 'several carriers’ long-haul cables sharing one ROW, 144–864 strands each' },
  regional: { low: 144,  high: 864,  basis: 'regional long-haul or middle-mile cable, typically 144–864 strands' },
  metro:    { low: 48,   high: 288,  basis: 'metro distribution cable, typically 48–288 strands' },
  edge:     { low: 12,   high: 96,   basis: 'edge or last-mile cable, typically 12–96 strands' }
};

/* Which region's carrier shortlist to offer, from the site's coordinates.
   Coarse on purpose: this picks who to phone, and a carrier one region over
   still sells transport. */
function regionOf(lat, lon) {
  if (lon < -115) return lat > 42 ? 'Pacific Northwest' : 'California';
  if (lon < -104) return 'Mountain West';
  if (lon < -94)  return lat > 40 ? 'Great Plains' : 'South Central';
  if (lon < -85)  return lat > 38.5 ? 'Midwest' : 'Southeast';
  /* The VA/NC line sits at 36.54°N and it is the boundary that matters here:
     everything from Richmond up through Ashburn is Mid-Atlantic, and Ashburn
     is the single most important fiber address in the country. A 40°N cut put
     it in the Southeast and offered a Cox and Spectrum call list for Data
     Center Alley. Above 41°N this band is Great Lakes, which is why Cleveland
     and Pittsburgh come back Midwest rather than Mid-Atlantic. */
  if (lon < -77)  return lat > 41 ? 'Midwest' : lat > 36.5 ? 'Mid-Atlantic' : 'Southeast';
  return lat > 40.5 ? 'Northeast' : lat > 36.5 ? 'Mid-Atlantic' : 'Southeast';
}
function carriersFor(lat, lon) {
  var region = regionOf(lat, lon);
  var ids = (CARRIERS.regionHints || {})[region] || [];
  var byId = {};
  (CARRIERS.carriers || []).forEach(function (c) { byId[c.id] = c; });
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var c = byId[ids[i]];
    if (!c) continue;
    out.push({ id: c.id, name: c.name, reach: c.reach,
               mapUrl: c.mapUrl || null, mapKind: c.mapKind || 'none',
               note: c.note || null });
  }
  return { region: region, carriers: out,
           source: CARRIERS.source,
           basis: 'carriers that publish a network map covering this region — a call list, not a statement that any of them is on this corridor' };
}

var OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];
var UA = 'ClearSky-OMEGA NetworkProximity/1.0 (+https://clearskyomega.com; dev@clearsky-usa.com)';

/* ═══════════════════════════════════════════════════════════════════════════
   GEOMETRY — pure, exported for the tests
   ═══════════════════════════════════════════════════════════════════════════ */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function distMi(lat1, lon1, lat2, lon2) {
  var R = 3958.7613, rad = function (d) { return d * Math.PI / 180; };
  var dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bboxFor(lat, lon, mi) {
  var dLat = mi / 69.0, dLon = mi / (69.0 * Math.cos(lat * Math.PI / 180) || 1);
  return { xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat };
}
/* Local planar miles from the site, good to well under 1% inside 100 mi. */
function xyMi(lat, lon, la, lo) {
  var cosLat = Math.cos(lat * Math.PI / 180);
  return [(lo - lon) * 69.0 * cosLat, (la - lat) * 69.0];
}
function segDistMi(p, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  var t = L2 === 0 ? 0 : clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1);
  var px = a[0] + t * dx - p[0], py = a[1] + t * dy - p[1];
  return Math.sqrt(px * px + py * py);
}
/* Nearest published line segment to the site, in miles. Coordinates are
   [lon, lat] GeoJSON order, already WGS84. */
function nearestLineMi(feats, lat, lon) {
  var best = null, origin = [0, 0];
  for (var i = 0; i < feats.length; i++) {
    var g = feats[i].geometry; if (!g) continue;
    var lines = g.type === 'LineString' ? [g.coordinates]
              : g.type === 'MultiLineString' ? g.coordinates : null;
    if (!lines) continue;
    for (var j = 0; j < lines.length; j++) {
      var pts = lines[j];
      for (var k = 0; k < pts.length - 1; k++) {
        var d = segDistMi(origin, xyMi(lat, lon, pts[k][1], pts[k][0]), xyMi(lat, lon, pts[k + 1][1], pts[k + 1][0]));
        if (best === null || d < best.dist) best = { dist: d, props: feats[i].properties || {} };
      }
    }
  }
  return best;
}
/* Web Mercator to WGS84. Several municipal servers ignore outSR. State-plane
   feet cannot be converted without a projection library and are SKIPPED —
   a route in the wrong hemisphere is worse than no route. */
function webMercToWgs(x, y) {
  var lon = x / 20037508.34 * 180, lat = y / 20037508.34 * 180;
  lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return [lon, lat];
}
function looksWgs(x, y) { return Math.abs(x) <= 180 && Math.abs(y) <= 90; }
function looksWebMerc(x, y) { return Math.abs(x) <= 20037509 && Math.abs(y) <= 20037509 && !looksWgs(x, y); }
function normRing(ring) {
  if (!ring || !ring.length) return null;
  var x0 = ring[0][0], y0 = ring[0][1];
  if (looksWgs(x0, y0)) return ring;
  if (looksWebMerc(x0, y0)) { var o = []; for (var i = 0; i < ring.length; i++) o.push(webMercToWgs(ring[i][0], ring[i][1])); return o; }
  return null;
}
function normGeom(g) {
  if (!g) return null;
  if (g.type === 'LineString') { var r = normRing(g.coordinates); return r ? { type: 'LineString', coordinates: r } : null; }
  if (g.type === 'MultiLineString') {
    var out = [];
    for (var i = 0; i < g.coordinates.length; i++) { var rr = normRing(g.coordinates[i]); if (rr) out.push(rr); }
    return out.length ? { type: 'MultiLineString', coordinates: out } : null;
  }
  return null;
}
function pick(p, keys) { for (var i = 0; i < keys.length; i++) { var v = p[keys[i]]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

/* ═══════════════════════════════════════════════════════════════════════════
   FETCH — one helper, one timeout, one User-Agent
   ═══════════════════════════════════════════════════════════════════════════ */
function getJson(url, opts, ms) {
  var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 9000);
  var o = Object.assign({ signal: c.signal }, opts || {});
  o.headers = Object.assign({ 'User-Agent': UA, 'Accept': 'application/json' }, (opts && opts.headers) || {});
  return fetch(url, o).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).finally(function () { clearTimeout(t); });
}
/* A source that dies must never take the answer down. Each one resolves to
   { status, ms, ...data }; status is ok | empty | failed | skipped. */
function timed(name, fn) {
  var t0 = Date.now();
  return Promise.resolve().then(fn).then(function (d) {
    d = d || {}; d.ms = Date.now() - t0; d.status = d.status || 'ok'; return d;
  }, function (e) {
    return { status: 'failed', ms: Date.now() - t0, error: String((e && e.name === 'AbortError') ? 'timed out' : (e && e.message) || e).slice(0, 160) };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOURCE 1 · PEERINGDB
   ═══════════════════════════════════════════════════════════════════════════ */
function facilities(lat, lon) {
  var b = bboxFor(lat, lon, FACILITY_RADIUS_MI);
  var url = 'https://www.peeringdb.com/api/fac?latitude__gte=' + b.ymin.toFixed(4) +
    '&latitude__lte=' + b.ymax.toFixed(4) + '&longitude__gte=' + b.xmin.toFixed(4) +
    '&longitude__lte=' + b.xmax.toFixed(4) + '&limit=1000' +
    '&fields=id,name,org_name,city,state,country,latitude,longitude,net_count,ix_count,carrier_count,clli,available_voltage_services,diverse_serving_substations,website';
  return getJson(url, null, 12000).then(function (j) {
    var rows = (j && j.data) || [], out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], la = num(r.latitude), lo = num(r.longitude);
      if (la == null || lo == null) continue;
      var mi = distMi(lat, lon, la, lo);
      if (mi > FACILITY_RADIUS_MI) continue;
      var routeMi = mi * ROUTE_FACTOR;
      out.push({
        id: r.id, name: r.name || 'Facility', org: r.org_name || '',
        city: r.city || '', state: r.state || '', country: r.country || '',
        lat: la, lng: lo, mi: Math.round(mi * 100) / 100, routeMi: Math.round(routeMi * 100) / 100,
        rttMs: Math.round(routeMi * 1.609344 * US_PER_KM * 2 / 1000 * 100) / 100,
        nets: num(r.net_count) || 0, ix: num(r.ix_count) || 0, carriers: num(r.carrier_count) || 0,
        clli: r.clli || '', voltages: (r.available_voltage_services || []).join(', '),
        diverseSubs: r.diverse_serving_substations === true,
        url: r.website || ('https://www.peeringdb.com/fac/' + r.id)
      });
    }
    out.sort(function (a, b2) { return a.mi - b2.mi; });
    var within80 = 0, within160 = 0, nets80 = 0, ix80 = 0, nearestCarrier = null, nearestMajor = null, nearestIx = null;
    for (var k = 0; k < out.length; k++) {
      var f = out[k];
      if (f.mi <= 80) { within80++; nets80 += f.nets; ix80 += f.ix; }
      if (f.mi <= 160) within160++;
      if (!nearestCarrier && f.nets >= CARRIER_NETS) nearestCarrier = f;
      if (!nearestMajor && f.nets >= MAJOR_NETS) nearestMajor = f;
      if (!nearestIx && f.ix > 0) nearestIx = f;
    }
    return { status: out.length ? 'ok' : 'empty', source: 'peeringdb', raw: rows.length, truncated: rows.length >= 1000,
             nearest: out.slice(0, 12), within80: within80, within160: within160, netsWithin80: nets80, ixWithin80: ix80,
             nearestCarrier: nearestCarrier, nearestMajor: nearestMajor, nearestIx: nearestIx };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOURCE 2 · FCC BDC AT THE POINT (keyed)
   Absence of a key is "not checked", never "no fiber".
   ═══════════════════════════════════════════════════════════════════════════ */
function fccAtPoint(lat, lon) {
  var key = process.env.FCC_BB_KEY || '';
  if (!key) return Promise.resolve({ status: 'skipped', fiber: null, providers: [], note: 'not checked — FCC_BB_KEY is not set' });
  var url = 'https://broadbandmap.com/api/v1/location/internet?service_type=business&lat=' + lat.toFixed(5) + '&lng=' + lon.toFixed(5);
  return getJson(url, { headers: { Authorization: 'Bearer ' + key } }, 10000).then(function (d) {
    var provs = (d && d.providers) || [], fib = [];
    for (var i = 0; i < provs.length; i++) if (String(provs[i].technology || '').toLowerCase() === 'fiber') fib.push(provs[i]);
    if (fib.length) {
      var best = fib[0];
      for (var j = 1; j < fib.length; j++) if ((fib[j].max_download_mbps || 0) > (best.max_download_mbps || 0)) best = fib[j];
      var spd = best.max_download_mbps ? (best.max_download_mbps >= 1000 ? (best.max_download_mbps / 1000) + 'G' : best.max_download_mbps + 'M') : '';
      return { status: 'ok', fiber: true, providers: fib.map(function (p) { return { name: p.name, down: p.max_download_mbps, up: p.max_upload_mbps }; }),
               note: fib.length + ' fiber ISP' + (fib.length > 1 ? 's' : '') + ' at this location · ' + (best.name || '') + (spd ? ' ' + spd : '') };
    }
    if (provs.length) return { status: 'ok', fiber: false, providers: [], note: provs.length + ' ISP(s) reported, none fiber at this location' };
    return { status: 'empty', fiber: false, providers: [], note: 'no reported business service at this location' };
  }).catch(function (e) {
    var m = /HTTP (\d+)/.exec(e && e.message || '');
    var why = m ? (m[1] === '401' ? 'FCC key rejected' : m[1] === '429' ? 'FCC rate limit reached' : 'FCC lookup unavailable (' + m[1] + ')') : 'FCC lookup ' + ((e && e.name === 'AbortError') ? 'timed out' : 'failed');
    return { status: 'failed', fiber: null, providers: [], note: 'not checked — ' + why };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOURCE 3 · OPENSTREETMAP TELECOM
   `out center` rather than `out geom`: the geometry is what made the grid
   bundle time out in dense metros, and a centre point is enough to say
   "there is mapped fibre about this far away" — which is labelled as such.
   ═══════════════════════════════════════════════════════════════════════════ */
function osmTelecom(lat, lon) {
  var ar = '(around:' + OSM_RADIUS_M + ',' + lat.toFixed(5) + ',' + lon.toFixed(5) + ')';
  var q = '[out:json][timeout:20];(' +
    'nwr["telecom"]' + ar + ';' +
    'nwr["communication"="line"]' + ar + ';' +
    'nwr["communication:fibre_optic"]' + ar + ';' +
    'nwr["office"="telecommunication"]' + ar + ';' +
    ');out center tags 300;';
  var trace = [], i = 0, first = true;
  function attempt() {
    if (i >= OVERPASS.length) return Promise.resolve(null);
    var url = OVERPASS[i++], budget = first ? 22000 : 6000; first = false;
    return getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, budget)
      .then(function (j) {
        var els = (j && j.elements) || [];
        trace.push(url.split('/')[2] + ':' + (els.length ? 'ok(' + els.length + ')' : 'empty'));
        return els.length ? els : attempt();
      }, function (e) { trace.push(url.split('/')[2] + ':' + ((e && e.name === 'AbortError') ? 'timeout' : (e && e.message) || 'err')); return attempt(); });
  }
  return attempt().then(function (els) {
    /* THE CONFIDENT ZERO. Measured in production 2026-09-17: overpass-api.de
       504, kumi.systems timeout, osm.ch "empty" — and the panel printed
       "osm empty" as if the area had been checked. osm.ch is the mirror
       grid-atlas.js documents as answering a well-formed, WRONG, empty 200.
       An empty answer is only believed from the PRIMARY mirror; an empty
       from a fallback after the primary failed is reported as a failure,
       because that is what it is. */
    if (els === null) {
      var primaryEmpty = /:empty$/.test(trace[0] || '');
      if (!primaryEmpty) return { status: 'failed', trace: trace, features: [], error: 'primary Overpass mirror did not answer (' + trace.join(', ') + ')' };
    }
    els = els || [];
    var feats = [];
    for (var k = 0; k < els.length; k++) {
      var el = els[k], t = el.tags || {};
      var la = el.lat != null ? el.lat : (el.center && el.center.lat), lo = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (la == null || lo == null) continue;
      var kind = t.telecom === 'data_center' ? 'data_center'
               : t.telecom === 'exchange' ? 'exchange'
               : (t.communication === 'line' || t['communication:fibre_optic']) ? 'fibre_line'
               : t.telecom ? ('telecom:' + t.telecom)
               : 'telecom_office';
      feats.push({ kind: kind, name: t.name || t.operator || kind, operator: t.operator || '',
                   mi: Math.round(distMi(lat, lon, la, lo) * 100) / 100, approx: el.type !== 'node' });
    }
    feats.sort(function (a, b) { return a.mi - b.mi; });
    function nearestOf(kind) { for (var n = 0; n < feats.length; n++) if (feats[n].kind === kind) return feats[n]; return null; }
    return { status: feats.length ? 'ok' : 'empty', trace: trace, features: feats.slice(0, 20),
             nearestLine: nearestOf('fibre_line'), nearestExchange: nearestOf('exchange'), nearestDataCenter: nearestOf('data_center') };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOURCE 4 · SURVEYED PLANT — verified layers
   ═══════════════════════════════════════════════════════════════════════════ */
function arcQuery(url, b, ms) {
  var env = b.xmin.toFixed(5) + ',' + b.ymin.toFixed(5) + ',' + b.xmax.toFixed(5) + ',' + b.ymax.toFixed(5);
  return getJson(url + '/query?f=geojson&where=1%3D1&outFields=*&returnGeometry=true' +
    '&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects' +
    '&resultRecordCount=500&geometry=' + encodeURIComponent(env), null, ms || 8000)
    .then(function (j) { if (j && j.error) throw new Error(j.error.message || 'ArcGIS error'); return (j && j.features) || []; });
}
function nearestFrom(feats, lat, lon, label, publisher) {
  var norm = [];
  for (var n = 0; n < feats.length; n++) {
    var g = normGeom(feats[n].geometry); if (!g) continue;
    /* THE PROJECTION GUARD THAT ACTUALLY HOLDS. State-plane feet sit inside
       the Web Mercator numeric range, so looksWebMerc() cannot tell them
       apart and "converts" them to a point off West Africa. Every feature
       here came from a bbox query around the site, so a legitimate one is
       within the bbox; anything that lands far outside it was misprojected
       and is dropped rather than measured. */
    var first = g.type === 'LineString' ? g.coordinates[0] : g.coordinates[0][0];
    if (!first || distMi(lat, lon, first[1], first[0]) > PLANT_RADIUS_MI * 3) continue;
    norm.push({ geometry: g, properties: feats[n].properties || {} });
  }
  var hit = nearestLineMi(norm, lat, lon);
  if (!hit) return null;
  return { mi: Math.round(hit.dist * 100) / 100, source: label, publisher: publisher || '',
           name: pick(hit.props, NAME_FIELDS), owner: pick(hit.props, OWNER_FIELDS),
           kind: (function (k) { return /^\d+(\.\d+)?$/.test(k) ? '' : k; })(pick(hit.props, TYPE_FIELDS)), segments: norm.length };
}
function surveyedPlant(lat, lon) {
  var b = bboxFor(lat, lon, PLANT_RADIUS_MI);
  return Promise.all(FIBER_PLANT.map(function (src) {
    return arcQuery(src.u, b).then(function (feats) { return { src: src, feats: feats }; }, function (e) { return { src: src, err: (e && e.message) || 'failed' }; });
  })).then(function (rs) {
    var best = null, layers = [];
    rs.forEach(function (r) {
      if (r.err) { layers.push({ name: r.src.n, status: 'failed', error: r.err }); return; }
      var hit = nearestFrom(r.feats, lat, lon, r.src.n);
      layers.push({ name: r.src.n, status: r.feats.length ? 'ok' : 'empty', segments: r.feats.length, mi: hit ? hit.mi : null });
      if (hit && (!best || hit.mi < best.mi)) best = hit;
    });
    return { status: best ? 'ok' : (layers.some(function (l) { return l.status !== 'failed'; }) ? 'empty' : 'failed'), nearest: best, layers: layers };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOURCE 5 · AGOL HARVEST — discover what the local agencies published
   Bounded: at most HARVEST_MAX_SERVICES services, HARVEST_MAX_LAYERS
   polyline sublayers each, and a hard 22 s wall so a slow county server
   cannot hold the whole answer hostage.
   ═══════════════════════════════════════════════════════════════════════════ */
function harvest(lat, lon) {
  var b = bboxFor(lat, lon, PLANT_RADIUS_MI);
  var bboxQ = [b.xmin, b.ymin, b.xmax, b.ymax].map(function (v) { return v.toFixed(4); }).join(',');
  var deadline = new Promise(function (res) { setTimeout(function () { res({ status: 'failed', error: 'harvest deadline (22 s)' }); }, 22000); });
  var work = Promise.all(HARVEST_QUERIES.map(function (q) {
    return getJson(AGOL + '/search?f=json&num=30&sortField=numviews&sortOrder=desc&q=' + encodeURIComponent(q) + '&bbox=' + bboxQ, null, 8000)
      .then(function (j) { return (j && j.results) || []; }, function () { return []; });
  })).then(function (lists) {
    var found = {}, services = [];
    lists.forEach(function (rs) {
      rs.forEach(function (r) {
        if (!r.url || !/FeatureServer|MapServer/i.test(r.url)) return;
        if (DISCOVER_SKIP.test(r.owner || '')) return;
        var u = r.url.replace(/\/+$/, '');
        if (found[u]) return;
        found[u] = 1; services.push({ id: r.id, title: r.title || 'Fiber service', url: u, owner: r.owner || '' });
      });
    });
    if (!services.length) return { status: 'empty', searched: HARVEST_QUERIES.length, services: [], nearest: null };
    /* Metadata first, for every candidate: cheap, and it is what decides
       whether the service is even about this part of the map. */
    return Promise.all(services.map(function (svc) {
      return getJson(svc.url + '?f=json', null, 6000).then(function (j) { svc.meta = j || {}; return svc; }, function () { svc.meta = null; return svc; });
    })).then(function (all) {
      var here = all.filter(function (svc) { return svc.meta && extentContains(svc.meta, lat, lon); });
      var skipped = all.length - here.length;
      here = here.slice(0, HARVEST_MAX_SERVICES);
      if (!here.length) return { status: 'empty', searched: HARVEST_QUERIES.length, candidates: all.length, outsideExtent: skipped, services: [], nearest: null,
                                 note: all.length ? all.length + ' fiber items found on ArcGIS Online, none local to this site (continent-scale or elsewhere)' : 'no fiber items on ArcGIS Online intersect this site' };
      return Promise.all(here.map(function (svc) {
      var single = /\/\d+$/.test(svc.url);
      var layersP = Promise.resolve().then(function () {
            var j = svc.meta;
            if (single) return [{ id: null, name: j.name || svc.title }];
            var keep = [], layers = (j && j.layers) || [];
            for (var i = 0; i < layers.length && keep.length < HARVEST_MAX_LAYERS; i++) {
              var L = layers[i], nm = L.name || '';
              if (!/Polyline/i.test(L.geometryType || '')) continue;
              if (!LAYER_KEEP.test(nm) || LAYER_SKIP.test(nm)) continue;
              keep.push({ id: L.id, name: nm });
            }
            return keep;
          });
      return layersP.then(function (layers) {
        if (!layers.length) return { svc: svc, layers: 0, nearest: null };
        return Promise.all(layers.map(function (L) {
          var u = svc.url + (L.id === null ? '' : '/' + L.id);
          return arcQuery(u, b, 8000).then(function (feats) {
            return { layer: L.name, segments: feats.length, hit: nearestFrom(feats, lat, lon, svc.title + ' · ' + L.name, svc.owner) };
          }, function (e) { return { layer: L.name, error: (e && e.message) || 'failed' }; });
        })).then(function (rs) {
          var best = null;
          rs.forEach(function (r) { if (r.hit && (!best || r.hit.mi < best.mi)) best = r.hit; });
          return { svc: svc, layers: rs.length, results: rs, nearest: best };
        });
      });
    })).then(function (rs) {
      var best = null, out = [];
      rs.forEach(function (r) {
        out.push({ title: r.svc.title, owner: r.svc.owner, url: r.svc.url, layers: r.layers,
                   segments: (r.results || []).reduce(function (a, x) { return a + (x.segments || 0); }, 0),
                   mi: r.nearest ? r.nearest.mi : null });
        if (r.nearest && (!best || r.nearest.mi < best.mi)) best = r.nearest;
      });
      return { status: best ? 'ok' : 'empty', searched: HARVEST_QUERIES.length, candidates: all.length, outsideExtent: skipped, services: out, nearest: best };
    });
    });
  });
  return Promise.race([work, deadline]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOURCE 6 · LONG-HAUL CORRIDORS — local, no network

   Every corridor within CORRIDOR_RADIUS_MI, not just the closest one, because
   the second corridor is the whole question for a data load. One corridor is
   a single point of failure no matter how close it is; two corridors leaving
   in different directions is a protected ring, and that difference is worth
   more to a hyperscaler than five miles of lateral.

   Corridor geometry is routed over the road network at build time. Distance
   is measured to the routed polyline, so it is a distance to where the
   conduit plausibly runs — not to a chord drawn across open country.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Bearing from the site to the closest point on a corridor, degrees from
   north. Two corridors sharing a bearing are the same path twice. */
function bearingTo(lat, lon, toLat, toLon) {
  var p = Math.PI / 180;
  var y = Math.sin((toLon - lon) * p) * Math.cos(toLat * p);
  var x = Math.cos(lat * p) * Math.sin(toLat * p) -
          Math.sin(lat * p) * Math.cos(toLat * p) * Math.cos((toLon - lon) * p);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
/* Closest point on a corridor's polyline, with the distance to it. Geometry
   is [lon, lat]; the local planar projection is the same one nearestLineMi
   uses, which keeps one convention for measuring in this file. */
function closestOnCorridor(g, lat, lon) {
  var best = null;
  for (var i = 1; i < g.length; i++) {
    var a = xyMi(lat, lon, g[i - 1][1], g[i - 1][0]);
    var b = xyMi(lat, lon, g[i][1], g[i][0]);
    var d = segDistMi([0, 0], a, b);
    if (best && d >= best.mi) continue;
    /* Re-find the parameter along the segment so the bearing points at the
       actual nearest vertex pair, not at an endpoint of the whole line. */
    var vx = b[0] - a[0], vy = b[1] - a[1], len2 = vx * vx + vy * vy;
    var t = len2 ? Math.max(0, Math.min(1, (-a[0] * vx + -a[1] * vy) / len2)) : 0;
    best = {
      mi: d,
      lat: g[i - 1][1] + (g[i][1] - g[i - 1][1]) * t,
      lon: g[i - 1][0] + (g[i][0] - g[i - 1][0]) * t
    };
  }
  return best;
}

function longhaul(lat, lon) {
  var near = [];
  for (var i = 0; i < CORRIDORS.length; i++) {
    var c = CORRIDORS[i];
    if (!c.g || c.g.length < 2) continue;
    var hit = closestOnCorridor(c.g, lat, lon);
    if (!hit || hit.mi > CORRIDOR_RADIUS_MI) continue;
    near.push({
      a: c.a, b: c.b, name: c.a + ' ↔ ' + c.b,
      mi: Math.round(hit.mi * 10) / 10,
      bearing: Math.round(bearingTo(lat, lon, hit.lat, hit.lon)),
      src: c.src, routed: !!c.routed, row: c.row || null,
      isps: c.isps, probes: c.probes, cite: c.cite, corridorMi: c.miles
    });
  }
  near.sort(function (x, y) { return x.mi - y.mi; });

  /* Independent paths: walk the list nearest-first and keep a corridor only
     when it leaves the site on a bearing no kept corridor already covers.
     A corridor and its reciprocal (north vs south along the same I-80) are
     the same ditch, so bearings are folded to a 180° axis before comparing. */
  var axes = [], independent = [];
  for (var j = 0; j < near.length; j++) {
    var ax = near[j].bearing % 180, novel = true;
    for (var k = 0; k < axes.length; k++) {
      var diff = Math.abs(ax - axes[k]);
      if (diff > 90) diff = 180 - diff;
      if (diff < DIVERSITY_BEARING_DEG) { novel = false; break; }
    }
    if (novel) { axes.push(ax); independent.push(near[j]); }
  }

  if (!near.length) {
    return { status: 'empty', mi: null, corridors: [], independent: 0,
             basis: 'no long-haul corridor within ' + CORRIDOR_RADIUS_MI + ' mi of this point' };
  }
  return {
    status: 'ok', mi: near[0].mi, conduit: near[0],
    corridors: near.slice(0, 8),
    independent: independent.length,
    independentPaths: independent.slice(0, 4),
    unrouted: near.filter(function (c) { return !c.routed; }).length,
    basis: 'distance to a corridor routed over the road network at build time, ' +
           'because long-haul fiber is laid in transportation rights-of-way. ' +
           'Not a carrier route map and not a survey.'
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOURCE 7 · EXISTING COMPUTE — local, no network

   An operating data center is the strongest free evidence that carrier-grade
   fiber was pulled to an address and that somebody is selling capacity on it.
   It is also the comparable a developer is actually asking for: if there are
   eleven facilities and 900 MW inside fifty miles, the utility and the
   carriers have both done this before.
   ═══════════════════════════════════════════════════════════════════════════ */
function datacenters(lat, lon) {
  var rows = DCS.ROWS, near = [], gen = [], mw25 = 0, mw50 = 0, n25 = 0, n50 = 0, genMw = 0;
  /* A degree of latitude is ~69 mi, so nothing beyond this box can be inside
     the radius. Skipping on it first turns 3,000 haversines into ~50. */
  var dLat = DC_RADIUS_MI / 69, dLon = DC_RADIUS_MI / (69 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (Math.abs(r[0] - lat) > dLat || Math.abs(r[1] - lon) > dLon) continue;
    var mi = distMi(lat, lon, r[0], r[1]);
    if (mi > DC_RADIUS_MI) continue;
    var mw = r[4], kind = r[6] || 0;
    var rec = { name: r[2], operator: r[3], mi: Math.round(mi * 10) / 10,
                mw: mw, operational: r[5] === 1, kind: DCS.KIND[kind] || 'data_center' };
    /* Generation is tracked because it was built to feed these campuses, and
       a 300 MW plant next door is a real siting fact. It is NOT evidence of
       fiber and must never answer "nearest operating compute facility" — a
       wind farm has a SCADA link, not a carrier hotel. */
    if (kind === 2) { gen.push(rec); if (mw) genMw += mw; continue; }
    n50++; if (mw) mw50 += mw;
    if (mi <= 25) { n25++; if (mw) mw25 += mw; }
    near.push(rec);
  }
  near.sort(function (a, b) { return a.mi - b.mi; });
  gen.sort(function (a, b) { return a.mi - b.mi; });
  return {
    status: near.length ? 'ok' : 'empty',
    nearest: near.slice(0, 8),
    within25: n25, within50: n50,
    mwWithin25: Math.round(mw25), mwWithin50: Math.round(mw50),
    generation: gen.slice(0, 5), generationCount: gen.length, generationMw: Math.round(genMw),
    attrib: DCS.ATTRIB,
    basis: 'operating and under-construction COMPUTE only \u2014 data centers and ' +
           'crypto mines. Dedicated generation is counted separately under ' +
           '`generation`, because a power plant is a power fact. A proposed ' +
           'campus is excluded: an announcement is not fiber in the ground. ' +
           'Capacity is stated only where a source stated it.'
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOW MUCH FIBER IS HERE — the question a developer actually asks

   There is no honest single number. What there is: a class, a route-diversity
   count, the carrier presences the registries know about, and a planning band
   for strand count with its basis attached. Every one of those is reported
   with where it came from, and the band is never presented as a measurement.
   ═══════════════════════════════════════════════════════════════════════════ */
function capacity(d, lat, lon) {
  var lh = d.lh || {}, near = (lh.corridors || [])[0] || null;
  var nets = d.netsWithin80 || 0;

  /* Class is set by the best evidence, in the order that a carrier would
     actually sell against it. */
  var cls, why;
  if (near && near.mi <= 2 && near.src === 'intertubes') {
    cls = 'backbone'; why = 'on a published long-haul conduit (' + near.name + ')';
  } else if (near && near.mi <= 2) {
    cls = 'backbone'; why = 'on a long-haul corridor (' + near.name + ')';
  } else if (near && near.mi <= 15 && nets >= 100) {
    cls = 'regional'; why = 'within ' + fmtMi(near.mi) + ' of a long-haul corridor in a dense carrier market';
  } else if (near && near.mi <= 15) {
    cls = 'regional'; why = 'within ' + fmtMi(near.mi) + ' of a long-haul corridor';
  } else if (nets >= 50 || d.fccFiber === true) {
    cls = 'metro'; why = nets >= 50 ? nets.toLocaleString('en-US') + ' carrier presences within 80 mi'
                                    : 'business fiber reported at the location';
  } else if (near && (lh.independent || 0) >= 2) {
    /* Reachable long-haul on more than one bearing. The build is a real
       lateral and should be priced as one, but calling this 'edge' would
       say the capacity is not there, and it is. */
    cls = 'regional';
    why = (lh.independent) + ' long-haul corridors within ' + CORRIDOR_RADIUS_MI +
          ' mi on independent bearings; nearest is ' + fmtMi(near.mi) + ' away (' + near.name + ')';
  } else {
    cls = 'edge'; why = near ? 'nearest corridor is ' + fmtMi(near.mi) + ' away'
                             : 'no long-haul corridor within ' + CORRIDOR_RADIUS_MI + ' mi';
  }

  var band = STRAND_BAND[cls];
  var paths = lh.independent || 0;
  var diversity = paths >= 3 ? 'meshed' : paths === 2 ? 'dual-path' : paths === 1 ? 'single-threaded' : 'none mapped';

  var notes = [];
  if (diversity === 'single-threaded')
    notes.push('One corridor within ' + CORRIDOR_RADIUS_MI + ' mi. A single cut takes the site off the network; ' +
               'a protected ring would have to be built, not bought.');
  if (diversity === 'dual-path')
    notes.push('Two corridors on independent bearings within ' + CORRIDOR_RADIUS_MI + ' mi — a protected ring is buyable in principle.');
  if (diversity === 'meshed')
    notes.push(paths + ' corridors on independent bearings — route diversity is a procurement question here, not an engineering one.');
  if (lh.unrouted)
    notes.push(lh.unrouted + ' of the corridors measured here fell back to a straight line at build time; treat their distances as coarse.');
  if ((cls === 'regional' || cls === 'edge') && near && near.mi > 15)
    notes.push('The nearest corridor is ' + fmtMi(near.mi) + ' away. At the planning band of $' +
               (LATERAL_COST_PER_MI.low / 1000) + 'k\u2013$' + (LATERAL_COST_PER_MI.high / 1000) +
               'k per mile that is roughly $' +
               Math.round(near.mi * LATERAL_COST_PER_MI.low / 100000) / 10 + 'M\u2013$' +
               Math.round(near.mi * LATERAL_COST_PER_MI.high / 100000) / 10 +
               'M of build before the first splice. Ask about an existing regional route ' +
               'before pricing a new one \u2014 the ILEC and the electric cooperative both own ' +
               'fiber that is on no public map.');
  if (cls === 'edge')
    notes.push('Nothing in the public record puts long-haul capacity near this point. That is a gap in the record as often as it is a gap in the ground — ask the incumbent ILEC and the nearest electric cooperative, both of which own fiber that is on no public map.');

  return {
    class: cls, classWhy: why,
    routeDiversity: diversity, independentPaths: paths,
    corridorsWithin: (lh.corridors || []).length, corridorRadiusMi: CORRIDOR_RADIUS_MI,
    nearestCorridor: near,
    carrierPresences: nets,
    exchanges: d.ixWithin80 || 0,
    litService: d.fccFiber === true ? 'reported' : d.fccFiber === false ? 'none reported' : 'not checked',
    strandBand: { low: band.low, high: band.high, basis: band.basis,
                  caveat: 'PLANNING BAND, NOT A COUNT. Strand counts are per-cable and per-carrier ' +
                          'and are sold as licensed data. Use this to size a conversation, never a design.' },
    calls: carriersFor(lat, lon),
    notes: notes
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IS THIS A DATA-CENTER SITE — the connectivity half of that question

   Power, water, land and tax are answered elsewhere (/api/grid-atlas and the
   screening register). This grades the half this function can see, and says
   plainly that it is a half. A site that fails here fails outright; a site
   that passes here has cleared one gate of four.
   ═══════════════════════════════════════════════════════════════════════════ */
var DC_W = { corridor: 30, diversity: 25, carriers: 20, exchange: 10, comparables: 15 };

function dcSuitability(d, cap, dc) {
  var parts = [], s = 0;

  var cMi = cap.nearestCorridor ? cap.nearestCorridor.mi : null;
  var p1 = cMi === null ? 0 : clamp(DC_W.corridor - cMi * 0.9, 0, DC_W.corridor);
  s += p1; parts.push({ key: 'corridor', points: Math.round(p1 * 10) / 10, max: DC_W.corridor,
    note: cMi === null ? 'no long-haul corridor within ' + CORRIDOR_RADIUS_MI + ' mi'
                       : fmtMi(cMi) + ' to ' + cap.nearestCorridor.name });

  var paths = cap.independentPaths || 0;
  var p2 = paths >= 3 ? DC_W.diversity : paths === 2 ? 18 : paths === 1 ? 7 : 0;
  s += p2; parts.push({ key: 'diversity', points: p2, max: DC_W.diversity,
    note: cap.routeDiversity + ' — ' + paths + ' independent corridor bearing' + (paths === 1 ? '' : 's') });

  var nets = d.netsWithin80 || 0;
  var p3 = nets <= 0 ? 0 : clamp(Math.log(nets + 1) / Math.log(600) * DC_W.carriers, 0, DC_W.carriers);
  s += p3; parts.push({ key: 'carriers', points: Math.round(p3 * 10) / 10, max: DC_W.carriers,
    note: nets ? nets.toLocaleString('en-US') + ' carrier presences within 80 mi' : 'no registered carriers within 80 mi' });

  var ix = d.ixWithin80 || 0;
  var p4 = ix <= 0 ? 0 : clamp(4 + ix * 2, 0, DC_W.exchange);
  s += p4; parts.push({ key: 'exchange', points: Math.round(p4 * 10) / 10, max: DC_W.exchange,
    note: ix ? ix + ' Internet Exchange' + (ix > 1 ? 's' : '') + ' within 80 mi'
             : 'no Internet Exchange within 80 mi — peering is a backhaul cost here' });

  /* Comparables cut both ways and the note says which way. Existing capacity
     proves the market works; it also competes for the same substation. */
  var n50 = dc.within50 || 0;
  var p5 = n50 <= 0 ? 0 : clamp(Math.log(n50 + 1) / Math.log(40) * DC_W.comparables, 0, DC_W.comparables);
  s += p5; parts.push({ key: 'comparables', points: Math.round(p5 * 10) / 10, max: DC_W.comparables,
    note: n50 ? n50 + ' operating facilit' + (n50 === 1 ? 'y' : 'ies') + ' within 50 mi' +
                (dc.mwWithin50 ? ', ' + dc.mwWithin50.toLocaleString('en-US') + ' MW where capacity is stated' : '')
              : 'no operating compute within 50 mi' });

  var sc = Math.round(clamp(s, 0, 100));
  var v = sc >= 70 ? 'strong' : sc >= 50 ? 'workable' : sc >= 30 ? 'marginal' : 'poor';

  var flags = [];
  if (paths <= 1)
    flags.push({ severity: 'risk', text: 'Route diversity is the finding here: ' + cap.routeDiversity +
      '. A tenant with an uptime SLA will ask for two physically diverse entrances on day one.' });
  if (ix === 0)
    flags.push({ severity: 'note', text: 'No Internet Exchange within 80 mi. Every bit leaves on transit, ' +
      'which is a permanent line item rather than a one-off build.' });
  if (n50 === 0)
    flags.push({ severity: 'note', text: 'No operating compute within 50 mi. Greenfield for the carriers too — ' +
      'expect longer quotes and a build contribution.' });
  if (cap.class === 'edge')
    flags.push({ severity: 'blocker', text: 'No long-haul capacity in the public record near this point. ' +
      'For a data load this is a fatal-flaw finding until a carrier says otherwise.' });
  if (dc.within25 >= 5 && (dc.mwWithin25 || 0) >= 200)
    flags.push({ severity: 'risk', text: dc.within25 + ' facilities and ~' + dc.mwWithin25.toLocaleString('en-US') +
      ' MW already inside 25 mi. Connectivity is proven; the constraint has almost certainly moved to the substation.' });

  return {
    score: sc, verdict: v, components: parts, flags: flags,
    scope: 'CONNECTIVITY ONLY. Power, water, land, tax and latency-to-market are not in this number. ' +
           'A strong score here means the fiber gate is clear, not that the site is buildable.'
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCORE + VERDICT — the part that belongs on the server
   ═══════════════════════════════════════════════════════════════════════════ */
function fmtMi(mi) { return mi == null ? '—' : (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + ' mi'; }

function score(d) {
  var parts = [], s = 0;
  var fMi = d.nearestCarrier ? d.nearestCarrier.mi : null;
  var p1 = fMi === null ? 0 : clamp(W.facility - fMi * 1.6, 0, W.facility);
  s += p1; parts.push({ key: 'facility', points: Math.round(p1 * 10) / 10, max: W.facility,
    note: fMi === null ? 'no carrier facility (' + CARRIER_NETS + '+ networks) within ' + FACILITY_RADIUS_MI + ' mi' : fmtMi(fMi) + ' to ' + d.nearestCarrier.name });
  var nets = d.netsWithin80 || 0;
  var p2 = nets <= 0 ? 0 : clamp(Math.log(nets + 1) / Math.log(600) * W.density, 0, W.density);
  s += p2; parts.push({ key: 'density', points: Math.round(p2 * 10) / 10, max: W.density,
    note: nets > 0 ? nets.toLocaleString('en-US') + ' carrier presences within 80 mi' : 'no registered carriers within 80 mi' });
  var p3 = d.fccFiber === true ? W.service : (d.fccFiber === false ? 4 : 8);
  s += p3; parts.push({ key: 'service', points: p3, max: W.service, note: d.fccNote || 'not checked' });
  var ix = d.ixWithin80 || 0;
  var p4 = ix <= 0 ? 0 : clamp(5 + ix * 3.5, 0, W.exchange);
  s += p4; parts.push({ key: 'exchange', points: Math.round(p4 * 10) / 10, max: W.exchange,
    note: ix > 0 ? ix + ' Internet Exchange' + (ix > 1 ? 's' : '') + ' within 80 mi' : 'no IXP within 80 mi' });
  /* The long-haul bonus used to be distance alone. Distance to ONE corridor
     overstates a site that is on a stub: half the bonus is now the second
     independent path, because that is what a tenant with an SLA is buying. */
  if (d.longhaulMi != null) {
    var half = W.longhaulBonus / 2;
    var bNear = clamp(half - d.longhaulMi * 0.2, 0, half);
    var paths = d.independentPaths || 0;
    var bDiv  = paths >= 3 ? half : paths === 2 ? half * 0.7 : 0;
    var bonus = bNear + bDiv;
    s += bonus; parts.push({ key: 'longhaul', points: Math.round(bonus * 10) / 10, max: W.longhaulBonus,
      note: fmtMi(d.longhaulMi) + ' to ' + d.longhaul.a + ' \u2194 ' + d.longhaul.b +
            (d.longhaul.isps ? ' (' + d.longhaul.isps + ' ISPs)' : '') +
            ' \u00b7 ' + paths + ' independent corridor' + (paths === 1 ? '' : 's') +
            ' within ' + CORRIDOR_RADIUS_MI + ' mi \u00b7 bonus, not weighted' });
  }
  return { score: Math.round(clamp(s, 0, 100)), parts: parts };
}

/* The verdict is about HARD evidence — geometry or a reported service at
   the point — with facility proximity as the soft signal. Four words, each
   with the reasons that earned it, so a reader can disagree with the rule
   rather than the number. */
function verdict(d) {
  var hard = [];
  if (d.fccFiber === true) hard.push({ kind: 'fcc', mi: 0, label: 'FCC reports business fiber at this location' });
  if (d.plantMi != null) hard.push({ kind: 'plant', mi: d.plantMi, label: 'surveyed fiber plant (' + d.plantSource + ')' });
  if (d.harvestMi != null) hard.push({ kind: 'harvest', mi: d.harvestMi, label: 'published fiber layer (' + d.harvestSource + ')' });
  if (d.osmLineMi != null) hard.push({ kind: 'osm_line', mi: d.osmLineMi, label: 'mapped fibre line (OpenStreetMap, approximate)' });
  /* A central office or a data centre is where carrier plant terminates —
     fiber runs to it by definition. OSM places them well (they are
     buildings), so they count as evidence, one notch softer than plant. */
  if (d.osmExchangeMi != null) hard.push({ kind: 'exchange', mi: d.osmExchangeMi + 0.25, label: 'telephone exchange / central office (OpenStreetMap)' });
  if (d.osmDataCenterMi != null) hard.push({ kind: 'data_center', mi: d.osmDataCenterMi + 0.25, label: 'data centre (OpenStreetMap)' });
  /* An operating facility in one of the merged registries is the same class
     of evidence as an OSM data centre and usually better placed, because the
     record carries a street address. Same 0.25 mi penalty: it says fiber
     reaches the building, not that it reaches this parcel. */
  if (d.dcMi != null) hard.push({ kind: 'facility', mi: d.dcMi + 0.25,
    label: 'operating compute facility (' + d.dcName + ')' });
  /* A routed corridor is a corridor, not a cable: the conduit is somewhere in
     that right-of-way, within a margin the routing itself cannot resolve. It
     counts as evidence only when the site is effectively on it, and carries a
     0.5 mi penalty to keep it behind anything actually surveyed. */
  if (d.longhaulMi != null && d.longhaulMi <= 3) hard.push({ kind: 'corridor', mi: d.longhaulMi + 0.5,
    label: 'long-haul corridor ' + d.longhaul.a + ' \u2194 ' + d.longhaul.b +
           (d.longhaul.src === 'intertubes' ? ' (published conduit)' : ' (routed corridor)') });
  hard.sort(function (a, b) { return a.mi - b.mi; });
  var nearest = hard[0] || null;
  var fac = d.nearestCarrier ? d.nearestCarrier.mi : null;
  var reasons = [], v;

  if (nearest && nearest.mi <= 1.0) { v = 'likely'; reasons.push(nearest.label + (nearest.mi < 0.05 ? ' runs through the site' : ' ' + fmtMi(nearest.mi) + ' away')); }
  else if (fac != null && fac <= 3) { v = 'likely'; reasons.push('carrier facility ' + d.nearestCarrier.name + ' ' + fmtMi(fac) + ' away with ' + d.nearestCarrier.nets + ' networks'); }
  else if (nearest && nearest.mi <= 5) { v = 'plausible'; reasons.push(nearest.label + ' ' + fmtMi(nearest.mi) + ' away — a lateral, not a build'); }
  else if (fac != null && fac <= 15) { v = 'plausible'; reasons.push('carrier facility ' + fmtMi(fac) + ' away (' + d.nearestCarrier.name + ')'); }
  /* A metro with hundreds of carrier presences within 80 mi has plant on
     every arterial; a site 17 mi out of Philadelphia is not "uncertain"
     because nobody published a shapefile for it. Density is the atlas's own
     second-weighted component, so it counts here too — one notch below a
     measured distance, and only while the FCC point is unanswered or lit. */
  else if (fac != null && fac <= 40 && (d.netsWithin80 || 0) >= 200 && d.fccFiber !== false) {
    v = 'plausible';
    reasons.push('dense carrier market — ' + (d.netsWithin80 || 0).toLocaleString('en-US') + ' network presences within 80 mi; nearest facility ' + fmtMi(fac) + ' (' + d.nearestCarrier.name + ')');
  }
  else if (d.fccFiber === false && (nearest == null || nearest.mi > 10) && (fac == null || fac > 25)) {
    v = 'unlikely'; reasons.push('FCC reports no fiber at this location');
    reasons.push(nearest ? 'nearest mapped fiber is ' + fmtMi(nearest.mi) + ' away' : 'no published fiber geometry within ' + PLANT_RADIUS_MI + ' mi');
    reasons.push(fac == null ? 'no carrier facility within ' + FACILITY_RADIUS_MI + ' mi' : 'nearest carrier facility ' + fmtMi(fac) + ' away');
  } else {
    v = 'uncertain';
    if (d.fccFiber == null) reasons.push('FCC service at the point was not checked (' + (d.fccNote || 'no key') + ')');
    reasons.push(nearest ? 'nearest mapped fiber is ' + fmtMi(nearest.mi) + ' away (' + nearest.label + ')' : 'no published fiber geometry within ' + PLANT_RADIUS_MI + ' mi — public plant data is city-by-city, so this is a gap in the record, not a finding');
    reasons.push(fac == null ? 'no carrier facility within ' + FACILITY_RADIUS_MI + ' mi' : 'nearest carrier facility ' + fmtMi(fac) + ' away (' + d.nearestCarrier.name + ')');
  }
  if (d.fccFiber === true && v !== 'likely') reasons.unshift('FCC reports business fiber at this location');
  if (d.osmExchangeMi != null && d.osmExchangeMi <= 3 && !(nearest && nearest.kind === 'exchange')) reasons.push('telephone exchange ' + fmtMi(d.osmExchangeMi) + ' away (OpenStreetMap)');

  /* Lateral: the build from the site to the nearest hard evidence, or to the
     carrier facility when nothing closer is documented. A range, because
     the thing that sets it is not in any of these datasets. */
  var lateralMi = nearest ? nearest.mi : fac;
  var lateral = lateralMi == null ? null : {
    mi: Math.round(lateralMi * 100) / 100,
    to: nearest ? nearest.label : ('carrier facility ' + d.nearestCarrier.name),
    costLow: Math.round(lateralMi * LATERAL_COST_PER_MI.low),
    costHigh: Math.round(lateralMi * LATERAL_COST_PER_MI.high),
    basis: 'construction only, $' + (LATERAL_COST_PER_MI.low / 1000) + 'k–$' + (LATERAL_COST_PER_MI.high / 1000) + 'k per mile planning band; not a carrier quote'
  };
  return { verdict: v, dataReady: v === 'likely' || v === 'plausible', reasons: reasons,
           nearestEvidence: nearest, evidence: hard, lateral: lateral };
}

/* ═══════════════════════════════════════════════════════════════════════════
   HANDLER
   ═══════════════════════════════════════════════════════════════════════════ */
var ALLOWED_ORIGINS = (process.env.GRID_ATLAS_ORIGINS
  || 'https://silmarillion.clearskyomega.com,https://osa.clearskyomega.com,https://alpha.clearskyomega.com,'
   + 'https://nextnrg.csebuilders.com,https://tools.csebuilders.com')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
function applyCors(req, res) {
  if (!res || typeof res.setHeader !== 'function') return;
  var origin = req && req.headers && (req.headers.origin || req.headers.Origin);
  if (origin && (ALLOWED_ORIGINS.indexOf(origin) >= 0 || /^https?:\/\/localhost(:\d+)?$/.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/* Public-evidence screen. Boundary when the editor could give us one, point
   otherwise, and the response always says which — a centroid distance and a
   boundary distance are different measurements and must never be compared as
   though they were the same number. Never throws: a failure here must not
   take down the rest of the analysis, because everything else in it is
   independent of this dataset. */
function publicFiber(lat, lon, boundary, gbps) {
  try {
    var opts = { radius_km: 25, limit: 10 };
    if (gbps != null && isFinite(gbps) && gbps > 0) opts.requested_capacity_gbps = gbps;
    if (boundary) {
      try {
        opts.boundary = boundary;
        var area = fiberEvidence.screenArea(opts);
        area.status = 'ok';
        area.measured_from = 'site_boundary';
        return area;
      } catch (be) {
        /* A malformed ring must degrade to the point answer, clearly labelled,
           rather than leaving the panel with nothing. */
        delete opts.boundary;
        var fb = fiberEvidence.screen(Object.assign(opts, { lat: lat, lon: lon }));
        fb.status = 'ok';
        fb.measured_from = 'site_point';
        fb.boundary_note = 'A site boundary was supplied but could not be read (' +
          (be.message || 'invalid ring') + '), so this is measured from the site point.';
        return fb;
      }
    }
    var pt = fiberEvidence.screen({ lat: lat, lon: lon, radius_km: 25, limit: 10,
      requested_capacity_gbps: (gbps != null && isFinite(gbps) && gbps > 0) ? gbps : undefined });
    pt.status = 'ok';
    pt.measured_from = 'site_point';
    pt.measurement_method = 'great_circle_distance_from_site_point_to_published_geometry';
    return pt;
  } catch (e) {
    return { status: 'failed', error: String((e && e.message) || e).slice(0, 200),
             measured_from: boundary ? 'site_boundary' : 'site_point',
             note: 'The bundled public fiber inventory could not be read. This is NOT evidence that ' +
                   'no fiber exists — it is a failure to look.' };
  }
}

function analyse(lat, lon, boundary, gbps) {
  var t0 = Date.now();
  return Promise.all([
    timed('facilities', function () { return facilities(lat, lon); }),
    timed('fcc',        function () { return fccAtPoint(lat, lon); }),
    timed('osm',        function () { return osmTelecom(lat, lon); }),
    timed('plant',      function () { return surveyedPlant(lat, lon); }),
    timed('harvest',    function () { return harvest(lat, lon); }),
    timed('longhaul',   function () { return longhaul(lat, lon); }),
    timed('datacenters',function () { return datacenters(lat, lon); }),
    timed('publicFiber', function () { return publicFiber(lat, lon, boundary, gbps); })
  ]).then(function (r) {
    var fac = r[0], fcc = r[1], osm = r[2], plant = r[3], hv = r[4], lh = r[5], dc = r[6], pf = r[7];
    var d = {
      nearestCarrier: fac.nearestCarrier || null, nearestMajor: fac.nearestMajor || null,
      netsWithin80: fac.netsWithin80 || 0, ixWithin80: fac.ixWithin80 || 0,
      fccFiber: fcc.fiber == null ? null : fcc.fiber, fccNote: fcc.note || '',
      plantMi: plant.nearest ? plant.nearest.mi : null, plantSource: plant.nearest ? plant.nearest.source : '',
      harvestMi: hv.nearest ? hv.nearest.mi : null, harvestSource: hv.nearest ? hv.nearest.source : '',
      osmLineMi: osm.nearestLine ? osm.nearestLine.mi : null,
      osmExchangeMi: osm.nearestExchange ? osm.nearestExchange.mi : null,
      osmDataCenterMi: osm.nearestDataCenter ? osm.nearestDataCenter.mi : null,
      longhaulMi: lh.status === 'ok' ? lh.mi : null, longhaul: lh.conduit || null,
      independentPaths: lh.independent || 0, lh: lh,
      dcMi: (dc.nearest[0] && dc.nearest[0].operational) ? dc.nearest[0].mi : null,
      dcName: dc.nearest[0] ? dc.nearest[0].name : ''
    };
    var cap = capacity(d, lat, lon);
    var dcFit = dcSuitability(d, cap, dc);
    var sc = score(d), vd = verdict(d);
    var findings = [];
    if (fac.status === 'failed') findings.push({ severity: 'note', text: 'PeeringDB did not answer (' + fac.error + ') — facility distance, density and exchanges are unscored, not zero.' });
    if (fac.truncated) findings.push({ severity: 'note', text: 'PeeringDB returned its 1,000-row cap for this area; counts within 80 mi are a floor.' });
    if (fcc.status === 'skipped') findings.push({ severity: 'note', text: 'Service at the point was not checked: set FCC_BB_KEY to query the FCC Broadband Data Collection.' });
    if (fcc.fiber === false) findings.push({ severity: 'risk', text: 'FCC reports no business fiber service at this location — a lateral is required, not a drop.' });
    if (osm.status === 'failed') findings.push({ severity: 'note', text: 'OpenStreetMap telecom layer did not answer (' + (osm.trace || []).join(', ') + ').' });
    if (hv.status === 'failed') findings.push({ severity: 'note', text: 'Published-layer harvest did not complete (' + hv.error + '); surveyed plant may exist that this run did not reach.' });
    if (!d.nearestCarrier) findings.push({ severity: 'blocker', text: 'No PeeringDB facility with ' + CARRIER_NETS + '+ networks within ' + FACILITY_RADIUS_MI + ' mi. For a latency-sensitive load this is a fatal-flaw finding, not a detail.' });
    else if (d.nearestCarrier.mi > 40) findings.push({ severity: 'risk', text: 'Nearest carrier facility is ' + fmtMi(d.nearestCarrier.mi) + ' away — a long haul before the first cross-connect.' });
    if (vd.verdict === 'unlikely') findings.push({ severity: 'blocker', text: 'Fiber to support a data load is unlikely from the public record: ' + vd.reasons.join('; ') + '.' });
    /* The data-center read produces findings the fiber verdict does not:
       route diversity, peering, and whether the neighbours already took the
       substation. They are about siting, so they are merged here rather than
       left inside a block a caller has to know to open. */
    for (var fi = 0; fi < dcFit.flags.length; fi++) findings.push(dcFit.flags[fi]);

    var nm = d.nearestMajor || d.nearestCarrier;
    var head = vd.verdict === 'likely' ? 'Fiber likely' : vd.verdict === 'plausible' ? 'Fiber plausible'
             : vd.verdict === 'unlikely' ? 'Fiber unlikely' : 'Fiber uncertain';
    var summary = head + ' \u2014 ' + vd.reasons[0] +
      '. ' + cap.class.charAt(0).toUpperCase() + cap.class.slice(1) + ' connectivity, ' +
      cap.routeDiversity + ' (' + cap.independentPaths + ' independent corridor' +
      (cap.independentPaths === 1 ? '' : 's') + ' within ' + CORRIDOR_RADIUS_MI + ' mi). ' +
      'Data-center fit on connectivity alone: ' + dcFit.verdict + ' (' + dcFit.score + '/100).';
    return {
      build: BUILD, model: MODEL, lat: lat, lng: lon,
      routeFactor: ROUTE_FACTOR, usPerKm: US_PER_KM,
      summary: summary,
      fiber: {
        score: sc.score, components: sc.parts,
        scoreBasis: 'carrier reach — identical to grid-atlas.html scoreFiber(); the verdict weighs surveyed plant and exchanges, which the score does not',
        verdict: vd.verdict, dataReady: vd.dataReady, reasons: vd.reasons,
        nearestEvidence: vd.nearestEvidence, evidence: vd.evidence, lateral: vd.lateral,
        latency: nm ? { facility: nm.name, city: nm.city, routeMi: nm.routeMi, rttMs: nm.rttMs, nets: nm.nets } : null
      },
      facilities: { status: fac.status, ms: fac.ms, error: fac.error, nearest: fac.nearest || [], within80: fac.within80 || 0, within160: fac.within160 || 0,
                    netsWithin80: fac.netsWithin80 || 0, ixWithin80: fac.ixWithin80 || 0,
                    nearestCarrier: fac.nearestCarrier || null, nearestMajor: fac.nearestMajor || null, nearestIx: fac.nearestIx || null, truncated: !!fac.truncated },
      fcc: { status: fcc.status, ms: fcc.ms, fiber: fcc.fiber == null ? null : fcc.fiber, providers: fcc.providers || [], note: fcc.note },
      osm: { status: osm.status, ms: osm.ms, error: osm.error, trace: osm.trace || [], features: osm.features || [],
             nearestLine: osm.nearestLine || null, nearestExchange: osm.nearestExchange || null, nearestDataCenter: osm.nearestDataCenter || null },
      plant: { status: plant.status, ms: plant.ms, nearest: plant.nearest || null, layers: plant.layers || [] },
      harvest: { status: hv.status, ms: hv.ms, error: hv.error, services: hv.services || [], nearest: hv.nearest || null },
      longhaul: { status: lh.status, mi: lh.mi, conduit: lh.conduit || null,
                  corridors: lh.corridors || [], independent: lh.independent || 0,
                  independentPaths: lh.independentPaths || [], unrouted: lh.unrouted || 0, basis: lh.basis },
      /* HOW MUCH FIBER IS HERE — class, route diversity, a strand planning
         band with its caveat, and the carriers to call. Read `capacity.notes`
         before quoting any of it. */
      capacity: cap,
      /* IS THIS A DATA-CENTER SITE — the connectivity half only, and it says
         so in `datacenter.scope`. Power and land come from /api/grid-atlas. */
      datacenter: { score: dcFit.score, verdict: dcFit.verdict, components: dcFit.components,
                    scope: dcFit.scope,
                    nearest: dc.nearest, within25: dc.within25, within50: dc.within50,
                    mwWithin25: dc.mwWithin25, mwWithin50: dc.mwWithin50,
                    attrib: dc.attrib, basis: dc.basis },
      /* PUBLIC ROUTE EVIDENCE — the shared dataset, identical to what
         /api/fiber-screen returns for the same place. Deliberately NOT merged
         into `evidence`, `score` or `verdict`: those already treat some
         absences as low values, and admitting a second dataset into them
         would move published numbers without anyone asking. Read it as its
         own section. */
      publicFiber: pf,
      sources: { peeringdb: fac.status, fcc: fcc.status, osm: osm.status, plant: plant.status,
                 harvest: hv.status, longhaul: lh.status, datacenters: dc.status,
                 publicFiber: pf.status },
      findings: findings,
      elapsedMs: Date.now() - t0
    };
  });
}

module.exports = function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'private, no-store');

  /* GET is a health check — is it deployed, what is configured, and do the
     sources actually answer today. Probes rather than asserts. */
  if (req.method === 'GET') {
    return Promise.all([
      timed('peeringdb', function () { return facilities(41.8781, -87.6298).then(function (f) { return { status: f.status, within80: f.within80, nearestMajor: f.nearestMajor && f.nearestMajor.name }; }); }),
      timed('plant', function () { return arcQuery(FIBER_PLANT[0].u, bboxFor(42.2711, -89.0940, 5), 8000).then(function (f) { return { status: f.length ? 'ok' : 'empty', segments: f.length, layer: FIBER_PLANT[0].n }; }); }),
      timed('agol', function () { return getJson(AGOL + '/search?f=json&num=1&q=' + encodeURIComponent(HARVEST_QUERIES[0]), null, 8000).then(function (j) { return { status: j && j.total ? 'ok' : 'empty', total: j && j.total }; }); }),
      timed('publicFiber', function () {
        try {
          var base = fiberEvidence.load();
          /* Chicago: both inventories have records there, so a zero from
             either one is a bundling failure rather than a quiet map. */
          var box = fiberEvidence.boxAround(41.8781, -87.6298, 25);
          var inv = fiberEvidence.usaCandidates(box);
          return {
            status: base.features.length && inv.length ? 'ok' : 'empty',
            osmAndCa: base.features.length,
            publishedInventoryNearChicago: inv.length,
            builtAt: base.manifest && base.manifest.built_at
          };
        } catch (e) {
          return { status: 'failed', error: String((e && e.message) || e).slice(0, 160),
                   note: 'The bundled route data is not readable from the deployed function. ' +
                         'Check includeFiles in vercel.json.' };
        }
      })
    ]).then(function (p) {
      return res.status(200).json({
        ok: true, build: BUILD, model: MODEL,
        auth: 'Firebase ID token (Bearer) — same as every /api function; verified with Google\'s public keys, no service account',
        sources: {
          peeringdb: 'live, keyless', fcc: process.env.FCC_BB_KEY ? 'FCC_BB_KEY set' : 'NOT CHECKED — set FCC_BB_KEY',
          osm: OVERPASS.length + ' Overpass mirrors, out center', plant: FIBER_PLANT.length + ' verified layers',
          harvest: HARVEST_QUERIES.length + ' AGOL searches, \u2264' + HARVEST_MAX_SERVICES + ' services',
          longhaul: CORRIDORS.length + ' routed long-haul corridors, ' +
                    CORRIDORS.filter(function (c) { return c.src === 'intertubes'; }).length + ' of them cited, local',
          datacenters: DCS.ROWS.length + ' operating/under-construction US facilities, local \u2014 ' + DCS.ATTRIB,
          carriers: (CARRIERS.carriers || []).length + ' carrier network maps indexed',
          publicFiber: 'bundled route inventory, local \u2014 see probe.publicFiber for whether this ' +
                       'deployment can actually read it'
        },
        constants: { ROUTE_FACTOR: ROUTE_FACTOR, US_PER_KM: US_PER_KM, CARRIER_NETS: CARRIER_NETS, MAJOR_NETS: MAJOR_NETS,
                     LATERAL_COST_PER_MI: LATERAL_COST_PER_MI, weights: W,
                     CORRIDOR_RADIUS_MI: CORRIDOR_RADIUS_MI, DIVERSITY_BEARING_DEG: DIVERSITY_BEARING_DEG,
                     DC_RADIUS_MI: DC_RADIUS_MI, dcWeights: DC_W, STRAND_BAND: STRAND_BAND },
        /* PROVES THE DATA SHIPPED. fiber-evidence.js builds its paths at
           runtime, which @vercel/nft cannot trace, so the datasets only reach
           the deployed function because vercel.json declares includeFiles.
           Get that wrong and every fiber answer is an ENOENT that no local
           test can catch — the files are right there on a developer's disk.
           This actually reads both inventories and reports what it found, so
           a deployment can be checked from outside without a token. */
        probe: { peeringdb: p[0], plant: p[1], agol: p[2], publicFiber: p[3] }
      });
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST.' });

  return auth.authenticateWithTier(req).then(function (ctx) { return require('./_lib/package-access').withToken(req, ctx, ["siteintel", "gridatlas", "compute"]); }).then(function (a) {
    if (!a.caller.staff && !a.packageAccess && (a.billing.toolOverrides || {}).gridatlas === false) throw auth.httpError(403, 'Grid Atlas access required.');
    var body = (req.body && typeof req.body === 'object') ? req.body : {};
    var lat = Number(body.lat), lon = Number(body.lng != null ? body.lng : body.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0))
      throw auth.httpError(400, 'lat and lng are required.');
    /* Optional. The editor sends a ring when the parcel is anchored to the
       world; when it cannot, it sends none and the answer says point. */
    var boundary = body.boundary || null;
    var gbps = Number(body.requestedCapacityGbps);
    return analyse(lat, lon, boundary, isFinite(gbps) ? gbps : null)
      .then(function (out) { return res.status(200).json(out); });
  }).catch(function (e) {
    var status = (e && e.status) || 502;
    return res.status(status).json({ build: BUILD, error: status === 502 ? 'Network proximity failed.' : e.message,
                                     detail: status === 502 ? String((e && e.message) || e).slice(0, 300) : undefined });
  });
};

/* Exported for scripts/test-network-proximity.js — pure pieces only. */
module.exports._test = { distMi: distMi, bboxFor: bboxFor, nearestLineMi: nearestLineMi, nearestFrom: nearestFrom, normGeom: normGeom, webMercToWgs: webMercToWgs,
                         longhaul: longhaul, score: score, verdict: verdict,
                         datacenters: datacenters, capacity: capacity, dcSuitability: dcSuitability,
                         bearingTo: bearingTo, closestOnCorridor: closestOnCorridor,
                         regionOf: regionOf, carriersFor: carriersFor,
                         corridors: CORRIDORS, dcRows: DCS.ROWS,
                         constants: { ROUTE_FACTOR: ROUTE_FACTOR, US_PER_KM: US_PER_KM, W: W, DC_W: DC_W,
                                      LATERAL_COST_PER_MI: LATERAL_COST_PER_MI,
                                      CORRIDOR_RADIUS_MI: CORRIDOR_RADIUS_MI, DC_RADIUS_MI: DC_RADIUS_MI } };
