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
     Long-haul conduits  the published InterTubes conduit subset (Durairajan
                         et al., SIGCOMM 2015) — a proxy for backbone reach,
                         scored as a bonus because the subset is partial.

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
     OSRM_BASE            unused here on purpose: routing 53 conduits per
                          request is a page concern, not a function's
     GRID_ATLAS_ORIGINS   extra CORS origins, comma separated
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var auth = require('./_lib/verify-token');

var BUILD = '2026-09-17.first';
var MODEL = 'network-proximity-v1';

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

/* ── long-haul conduits (InterTubes subset, from grid-atlas-national.js) ── */
var LH_CITY = {
  'Albuquerque, NM': [35.0844, -106.6504], 'Allentown, PA': [40.6084, -75.4902],
  'Amarillo, TX': [35.2220, -101.8313], 'Anaheim, CA': [33.8366, -117.9143],
  'Atlanta, GA': [33.7490, -84.3880], 'Bakersfield, CA': [35.3733, -119.0187],
  'Baltimore, MD': [39.2904, -76.6122], 'Baton Rouge, LA': [30.4515, -91.1871],
  'Battle Creek, MI': [42.3211, -85.1797], 'Billings, MT': [45.7833, -108.5007],
  'Boca Raton, FL': [26.3683, -80.1289], 'Boise, ID': [43.6150, -116.2023],
  'Bozeman, MT': [45.6770, -111.0429], 'Bryan, TX': [30.6744, -96.3698],
  'Camp Verde, AZ': [34.5636, -111.8543], 'Casper, WY': [42.8666, -106.3131],
  'Charlottesville, VA': [38.0293, -78.4767], 'Cheyenne, WY': [41.1400, -104.8202],
  'Chicago, IL': [41.8781, -87.6298], 'Chico, CA': [39.7285, -121.8375],
  'Dallas, TX': [32.7767, -96.7970], 'Denver, CO': [39.7392, -104.9903],
  'Detroit, MI': [42.3314, -83.0458], 'Eau Claire, WI': [44.8113, -91.4985],
  'Edison, NJ': [40.5187, -74.4121], 'El Paso, TX': [31.7619, -106.4850],
  'Eugene, OR': [44.0521, -123.0868], 'Fort Worth, TX': [32.7555, -97.3308],
  'Gainesville, FL': [29.6516, -82.3248], 'Hillsboro, OR': [45.5229, -122.9898],
  'Houston, TX': [29.7604, -95.3698], 'Kalamazoo, MI': [42.2917, -85.5872],
  'Kansas City, MO': [39.0997, -94.5786], 'Lansing, MI': [42.7325, -84.5555],
  'Las Vegas, NV': [36.1699, -115.1398], 'Laurel, MS': [31.6948, -89.1306],
  'Lincoln, NE': [40.8136, -96.7026], 'Livonia, MI': [42.3684, -83.3527],
  'Lompoc, CA': [34.6391, -120.4579], 'Los Angeles, CA': [34.0522, -118.2437],
  'Lynchburg, VA': [37.4138, -79.1422], 'Madison, WI': [43.0731, -89.4012],
  'New Orleans, LA': [29.9511, -90.0715], 'New York, NY': [40.7128, -74.0060],
  'Ocala, FL': [29.1872, -82.1401], 'Oklahoma City, OK': [35.4676, -97.5164],
  'Palo Alto, CA': [37.4419, -122.1430], 'Philadelphia, PA': [39.9526, -75.1652],
  'Phoenix, AZ': [33.4484, -112.0740], 'Portland, OR': [45.5152, -122.6784],
  'Provo, UT': [40.2338, -111.6585], 'Sacramento, CA': [38.5816, -121.4944],
  'Salt Lake City, UT': [40.7608, -111.8910], 'San Francisco, CA': [37.7749, -122.4194],
  'San Luis Obispo, CA': [35.2828, -120.6596], 'Santa Barbara, CA': [34.4208, -119.6982],
  'Santa Clara, CA': [37.3541, -121.9552], 'Seattle, WA': [47.6062, -122.3321],
  'Sedona, AZ': [34.8697, -111.7610], 'Shreveport, LA': [32.5252, -93.7502],
  'South Bend, IN': [41.6764, -86.2520], 'Southfield, MI': [42.4734, -83.2219],
  'Spokane, WA': [47.6588, -117.4260], 'Stamford, CT': [41.0534, -73.5387],
  'Topeka, KS': [39.0473, -95.6752], 'Towson, MD': [39.4015, -76.6019],
  'Trenton, NJ': [40.2206, -74.7597], 'Tucson, AZ': [32.2226, -110.9747],
  'Wells, NV': [41.1116, -114.9647], 'West Palm Beach, FL': [26.7153, -80.0534],
  'White Plains, NY': [41.0340, -73.7629], 'Wichita Falls, TX': [33.9137, -98.4934],
  'Wichita, KS': [37.6872, -97.3301]
};
var LH_CONDUITS = [
  { a: 'Phoenix, AZ', b: 'Tucson, AZ', isps: 19, cite: '§4.2 extreme sharing' },
  { a: 'Salt Lake City, UT', b: 'Denver, CO', isps: 19, cite: '§4.2 extreme sharing' },
  { a: 'Philadelphia, PA', b: 'New York, NY', isps: 19, cite: '§4.2 extreme sharing' },
  { a: 'Portland, OR', b: 'Seattle, WA', isps: 31, probes: 8094, cite: '§4.3 — 18 in physical map, 13 more inferred from traceroute' },
  { a: 'Los Angeles, CA', b: 'San Francisco, CA', isps: 5, cite: '§2.4 coastal route — AT&T, Sprint, CenturyLink, Level 3, Verizon' },
  { a: 'Houston, TX', b: 'Dallas, TX', isps: 2, cite: '§2.4 CenturyLink + Verizon' },
  { a: 'Denver, CO', b: 'El Paso, TX', isps: 2, cite: '§2.4 CenturyLink + Verizon' },
  { a: 'Santa Clara, CA', b: 'Salt Lake City, UT', isps: 2, cite: '§2.4 CenturyLink + Verizon' },
  { a: 'Wells, NV', b: 'Salt Lake City, UT', isps: 2, cite: '§2.4 CenturyLink + Verizon' },
  { a: 'Salt Lake City, UT', b: 'Sacramento, CA', isps: 2, cite: '§4.1 risk matrix example' },
  { a: 'Sacramento, CA', b: 'Palo Alto, CA', isps: 1, cite: '§4.1 risk matrix example' },
  { a: 'Ocala, FL', b: 'Gainesville, FL', isps: 3, cite: '§2.4 Level 3 fibre used by Cox and Comcast' },
  { a: 'Anaheim, CA', b: 'Las Vegas, NV', isps: 1, row: 'pipeline', cite: '§3 — co-located with refined-products pipeline, not road or rail' },
  { a: 'Houston, TX', b: 'Atlanta, GA', isps: 1, row: 'pipeline', cite: '§3 — deployed along NGL pipelines' },
  { a: 'Trenton, NJ', b: 'Edison, NJ', probes: 78402, cite: 'Table 2' },
  { a: 'Kalamazoo, MI', b: 'Battle Creek, MI', probes: 78384, cite: 'Table 2' },
  { a: 'Dallas, TX', b: 'Fort Worth, TX', probes: 56233, cite: 'Table 2' },
  { a: 'Baltimore, MD', b: 'Towson, MD', probes: 46336, cite: 'Table 2' },
  { a: 'Baton Rouge, LA', b: 'New Orleans, LA', probes: 46328, cite: 'Table 2' },
  { a: 'Livonia, MI', b: 'Southfield, MI', probes: 46287, cite: 'Table 2' },
  { a: 'Topeka, KS', b: 'Lincoln, NE', probes: 46275, cite: 'Table 2' },
  { a: 'Spokane, WA', b: 'Boise, ID', probes: 44461, cite: 'Table 2' },
  { a: 'Dallas, TX', b: 'Atlanta, GA', probes: 41008, cite: 'Table 2' },
  { a: 'Dallas, TX', b: 'Bryan, TX', probes: 39232, cite: 'Table 2' },
  { a: 'Shreveport, LA', b: 'Dallas, TX', probes: 39210, cite: 'Table 2' },
  { a: 'Wichita Falls, TX', b: 'Dallas, TX', probes: 39180, cite: 'Table 2 and 3' },
  { a: 'San Luis Obispo, CA', b: 'Lompoc, CA', probes: 32381, cite: 'Table 2' },
  { a: 'San Francisco, CA', b: 'Las Vegas, NV', probes: 22986, cite: 'Table 2' },
  { a: 'Wichita, KS', b: 'Las Vegas, NV', probes: 22169, cite: 'Table 2' },
  { a: 'Las Vegas, NV', b: 'Salt Lake City, UT', probes: 22094, cite: 'Table 2' },
  { a: 'Battle Creek, MI', b: 'Lansing, MI', probes: 15027, cite: 'Table 2' },
  { a: 'South Bend, IN', b: 'Battle Creek, MI', probes: 14795, cite: 'Table 2' },
  { a: 'Philadelphia, PA', b: 'Allentown, PA', probes: 12905, cite: 'Table 2' },
  { a: 'Philadelphia, PA', b: 'Edison, NJ', probes: 12901, cite: 'Table 2' },
  { a: 'West Palm Beach, FL', b: 'Boca Raton, FL', probes: 155774, cite: 'Table 3' },
  { a: 'Lynchburg, VA', b: 'Charlottesville, VA', probes: 155079, cite: 'Table 3' },
  { a: 'Sedona, AZ', b: 'Camp Verde, AZ', probes: 54067, cite: 'Table 3' },
  { a: 'Bozeman, MT', b: 'Billings, MT', probes: 50879, cite: 'Table 3' },
  { a: 'Billings, MT', b: 'Casper, WY', probes: 50818, cite: 'Table 3' },
  { a: 'Casper, WY', b: 'Cheyenne, WY', probes: 50817, cite: 'Table 3' },
  { a: 'White Plains, NY', b: 'Stamford, CT', probes: 25784, cite: 'Table 3' },
  { a: 'Amarillo, TX', b: 'Wichita Falls, TX', probes: 16354, cite: 'Table 3' },
  { a: 'Eugene, OR', b: 'Chico, CA', probes: 12234, cite: 'Table 3' },
  { a: 'Phoenix, AZ', b: 'Dallas, TX', probes: 9725, cite: 'Table 3' },
  { a: 'Salt Lake City, UT', b: 'Provo, UT', probes: 9433, cite: 'Table 3' },
  { a: 'Salt Lake City, UT', b: 'Los Angeles, CA', probes: 8921, cite: 'Table 3' },
  { a: 'Dallas, TX', b: 'Oklahoma City, OK', probes: 8242, cite: 'Table 3' },
  { a: 'Eau Claire, WI', b: 'Madison, WI', probes: 7476, cite: 'Table 3' },
  { a: 'Salt Lake City, UT', b: 'Cheyenne, WY', probes: 7380, cite: 'Table 3' },
  { a: 'Bakersfield, CA', b: 'Los Angeles, CA', probes: 6874, cite: 'Table 3' },
  { a: 'Seattle, WA', b: 'Hillsboro, OR', probes: 6854, cite: 'Table 3' },
  { a: 'Santa Barbara, CA', b: 'Los Angeles, CA', probes: 6641, cite: 'Table 3' },
  { a: 'Kansas City, MO', b: 'Denver, CO', isps: 2, cite: '§2.5 parallel deployments' }
];

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
  var q = '[out:json][timeout:12];(' +
    'nwr["telecom"]' + ar + ';' +
    'nwr["communication"="line"]' + ar + ';' +
    'nwr["communication:fibre_optic"]' + ar + ';' +
    'nwr["office"="telecommunication"]' + ar + ';' +
    ');out center tags 300;';
  var trace = [], i = 0, first = true;
  function attempt() {
    if (i >= OVERPASS.length) return Promise.resolve(null);
    var url = OVERPASS[i++], budget = first ? 12000 : 6000; first = false;
    return getJson(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, budget)
      .then(function (j) {
        var els = (j && j.elements) || [];
        trace.push(url.split('/')[2] + ':' + (els.length ? 'ok(' + els.length + ')' : 'empty'));
        return els.length ? els : attempt();
      }, function (e) { trace.push(url.split('/')[2] + ':' + ((e && e.name === 'AbortError') ? 'timeout' : (e && e.message) || 'err')); return attempt(); });
  }
  return attempt().then(function (els) {
    if (els === null && !trace.some(function (t) { return /empty/.test(t); })) return { status: 'failed', trace: trace, features: [], error: 'no Overpass mirror answered' };
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
   SOURCE 6 · LONG-HAUL CONDUITS — local, no network
   Distance to the straight chord between the two cities. The atlas page
   routes the pair along roads before measuring; a function answering in
   seconds does not, and says so ("direct-line estimate").
   ═══════════════════════════════════════════════════════════════════════════ */
function longhaul(lat, lon) {
  var best = null;
  for (var i = 0; i < LH_CONDUITS.length; i++) {
    var c = LH_CONDUITS[i], A = LH_CITY[c.a], B = LH_CITY[c.b];
    if (!A || !B) continue;
    var d = segDistMi([0, 0], xyMi(lat, lon, A[0], A[1]), xyMi(lat, lon, B[0], B[1]));
    if (!best || d < best.mi) best = { mi: Math.round(d * 10) / 10, conduit: c };
  }
  return best ? { status: 'ok', mi: best.mi, conduit: best.conduit, basis: 'direct-line estimate between the published endpoints, not a routed path' }
              : { status: 'empty' };
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
  if (d.longhaulMi != null) {
    var bonus = clamp(W.longhaulBonus - d.longhaulMi * 0.35, 0, W.longhaulBonus);
    s += bonus; parts.push({ key: 'longhaul', points: Math.round(bonus * 10) / 10, max: W.longhaulBonus,
      note: fmtMi(d.longhaulMi) + ' to ' + d.longhaul.a + ' ↔ ' + d.longhaul.b + (d.longhaul.isps ? ' (' + d.longhaul.isps + ' ISPs)' : '') + ' · bonus, not weighted' });
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
  hard.sort(function (a, b) { return a.mi - b.mi; });
  var nearest = hard[0] || null;
  var fac = d.nearestCarrier ? d.nearestCarrier.mi : null;
  var reasons = [], v;

  if (nearest && nearest.mi <= 1.0) { v = 'likely'; reasons.push(nearest.label + (nearest.mi < 0.05 ? ' runs through the site' : ' ' + fmtMi(nearest.mi) + ' away')); }
  else if (fac != null && fac <= 3) { v = 'likely'; reasons.push('carrier facility ' + d.nearestCarrier.name + ' ' + fmtMi(fac) + ' away with ' + d.nearestCarrier.nets + ' networks'); }
  else if (nearest && nearest.mi <= 5) { v = 'plausible'; reasons.push(nearest.label + ' ' + fmtMi(nearest.mi) + ' away — a lateral, not a build'); }
  else if (fac != null && fac <= 15) { v = 'plausible'; reasons.push('carrier facility ' + fmtMi(fac) + ' away (' + d.nearestCarrier.name + ')'); }
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

function analyse(lat, lon) {
  var t0 = Date.now();
  return Promise.all([
    timed('facilities', function () { return facilities(lat, lon); }),
    timed('fcc',        function () { return fccAtPoint(lat, lon); }),
    timed('osm',        function () { return osmTelecom(lat, lon); }),
    timed('plant',      function () { return surveyedPlant(lat, lon); }),
    timed('harvest',    function () { return harvest(lat, lon); }),
    timed('longhaul',   function () { return longhaul(lat, lon); })
  ]).then(function (r) {
    var fac = r[0], fcc = r[1], osm = r[2], plant = r[3], hv = r[4], lh = r[5];
    var d = {
      nearestCarrier: fac.nearestCarrier || null, nearestMajor: fac.nearestMajor || null,
      netsWithin80: fac.netsWithin80 || 0, ixWithin80: fac.ixWithin80 || 0,
      fccFiber: fcc.fiber == null ? null : fcc.fiber, fccNote: fcc.note || '',
      plantMi: plant.nearest ? plant.nearest.mi : null, plantSource: plant.nearest ? plant.nearest.source : '',
      harvestMi: hv.nearest ? hv.nearest.mi : null, harvestSource: hv.nearest ? hv.nearest.source : '',
      osmLineMi: osm.nearestLine ? osm.nearestLine.mi : null,
      osmExchangeMi: osm.nearestExchange ? osm.nearestExchange.mi : null,
      osmDataCenterMi: osm.nearestDataCenter ? osm.nearestDataCenter.mi : null,
      longhaulMi: lh.status === 'ok' ? lh.mi : null, longhaul: lh.conduit || null
    };
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

    var nm = d.nearestMajor || d.nearestCarrier;
    var summary = vd.verdict === 'likely' ? 'Fiber likely — ' + vd.reasons[0]
                : vd.verdict === 'plausible' ? 'Fiber plausible — ' + vd.reasons[0]
                : vd.verdict === 'unlikely' ? 'Fiber unlikely — ' + vd.reasons[0]
                : 'Fiber uncertain — ' + vd.reasons[0];
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
      longhaul: lh.status === 'ok' ? { mi: lh.mi, conduit: lh.conduit, basis: lh.basis } : null,
      sources: { peeringdb: fac.status, fcc: fcc.status, osm: osm.status, plant: plant.status, harvest: hv.status, longhaul: lh.status },
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
      timed('agol', function () { return getJson(AGOL + '/search?f=json&num=1&q=' + encodeURIComponent(HARVEST_QUERIES[0]), null, 8000).then(function (j) { return { status: j && j.total ? 'ok' : 'empty', total: j && j.total }; }); })
    ]).then(function (p) {
      return res.status(200).json({
        ok: true, build: BUILD, model: MODEL,
        auth: 'Firebase ID token (Bearer) — same as every /api function; verified with Google\'s public keys, no service account',
        sources: {
          peeringdb: 'live, keyless', fcc: process.env.FCC_BB_KEY ? 'FCC_BB_KEY set' : 'NOT CHECKED — set FCC_BB_KEY',
          osm: OVERPASS.length + ' Overpass mirrors, out center', plant: FIBER_PLANT.length + ' verified layers',
          harvest: HARVEST_QUERIES.length + ' AGOL searches, ≤' + HARVEST_MAX_SERVICES + ' services', longhaul: LH_CONDUITS.length + ' published conduits'
        },
        constants: { ROUTE_FACTOR: ROUTE_FACTOR, US_PER_KM: US_PER_KM, CARRIER_NETS: CARRIER_NETS, MAJOR_NETS: MAJOR_NETS, LATERAL_COST_PER_MI: LATERAL_COST_PER_MI, weights: W },
        probe: { peeringdb: p[0], plant: p[1], agol: p[2] }
      });
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST.' });

  return auth.authenticateWithTier(req).then(function (a) {
    if (!a.caller.staff && (a.billing.toolOverrides || {}).gridatlas === false) throw auth.httpError(403, 'Grid Atlas access required.');
    var body = (req.body && typeof req.body === 'object') ? req.body : {};
    var lat = Number(body.lat), lon = Number(body.lng != null ? body.lng : body.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0))
      throw auth.httpError(400, 'lat and lng are required.');
    return analyse(lat, lon).then(function (out) { return res.status(200).json(out); });
  }).catch(function (e) {
    var status = (e && e.status) || 502;
    return res.status(status).json({ build: BUILD, error: status === 502 ? 'Network proximity failed.' : e.message,
                                     detail: status === 502 ? String((e && e.message) || e).slice(0, 300) : undefined });
  });
};

/* Exported for scripts/test-network-proximity.js — pure pieces only. */
module.exports._test = { distMi: distMi, bboxFor: bboxFor, nearestLineMi: nearestLineMi, nearestFrom: nearestFrom, normGeom: normGeom, webMercToWgs: webMercToWgs,
                         longhaul: longhaul, score: score, verdict: verdict, constants: { ROUTE_FACTOR: ROUTE_FACTOR, US_PER_KM: US_PER_KM, W: W, LATERAL_COST_PER_MI: LATERAL_COST_PER_MI } };
