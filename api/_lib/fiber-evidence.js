/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var fs = require('fs');
var path = require('path');
var R = 6371008.8;
var cached;

function number(value, name, min, max, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === null || typeof value === 'boolean' || Array.isArray(value) ||
      (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new Error('Invalid ' + name);
  var n = Number(value);
  if (!isFinite(n) || n < min || n > max) throw new Error('Invalid ' + name);
  return n;
}
function parseRequest(input) {
  input = input || {};
  return {
    lat: number(input.lat, 'latitude', -90, 90),
    lon: number(input.lon, 'longitude', -180, 180),
    radius_km: number(input.radius_km, 'radius_km (0.1–200)', 0.1, 200, 25),
    limit: Math.floor(number(input.limit, 'limit (1–50)', 1, 50, 10)),
    requested_capacity_gbps: input.requested_capacity_gbps === undefined ? null :
      number(input.requested_capacity_gbps, 'requested_capacity_gbps', 0.001, 100000)
  };
}
function rad(x) { return x * Math.PI / 180; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function angle(a, b) {
  var p = rad(a[1]), q = rad(b[1]), dp = q-p, dl = rad(b[0]-a[0]);
  var h = Math.sin(dp/2)*Math.sin(dp/2)+Math.cos(p)*Math.cos(q)*Math.sin(dl/2)*Math.sin(dl/2);
  return 2*Math.asin(Math.sqrt(clamp(h,0,1)));
}
function bearing(a,b) {
  var p=rad(a[1]),q=rad(b[1]),dl=rad(b[0]-a[0]);
  return Math.atan2(Math.sin(dl)*Math.cos(q), Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(dl));
}
function segmentDistance(p,a,b) {
  var ab=angle(a,b),ap=angle(a,p),bp=angle(b,p);
  if (ab<1e-12 || Math.PI-ab<1e-9) return Math.min(ap,bp)*R;
  var diff=bearing(a,p)-bearing(a,b);
  var along=Math.atan2(Math.sin(ap)*Math.cos(diff),Math.cos(ap));
  if (along<0 || along>ab) return Math.min(ap,bp)*R;
  return Math.abs(Math.asin(clamp(Math.sin(ap)*Math.sin(diff),-1,1)))*R;
}
function geometryDistance(p,g) {
  if (!g) return Infinity;
  if (g.type==='Point') return angle(p,g.coordinates)*R;
  var lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
  var best=Infinity;
  lines.forEach(function(line) {
    for(var i=1;i<line.length;i++) best=Math.min(best,segmentDistance(p,line[i-1],line[i]));
  });
  return best;
}
function load() {
  if(cached) return cached;
  var root=path.join(__dirname,'../../data/fiber');
  function read(name) { return JSON.parse(fs.readFileSync(path.join(root,name),'utf8')); }
  var manifest=read('manifest.json');
  var all=[];
  manifest.datasets.forEach(function(d) {
    var collection=read(d.file);
    if(collection.type!=='FeatureCollection' || collection.features.length!==d.count) throw new Error('Fiber data manifest mismatch');
    all=all.concat(collection.features);
  });
  cached={features:all,manifest:manifest};
  return cached;
}
function summarize(f,d) {
  var p=f.properties;
  return {id:f.id,name:p.name,operator:p.operator,feature_kind:p.feature_kind,
    mapped_distance_m:Math.round(d),distance_basis:'great_circle_distance_to_published_geometry',
    geometry_quality:p.geometry_quality,positional_accuracy_m:p.positional_accuracy_m,
    operational_status:p.operational_status,source_id:p.source_id,source_url:p.source_url,
    source_vintage:p.source_vintage||null,source_last_edited:p.source_last_edited||null,retrieved_at:p.retrieved_at,
    fiber_strands_reported:p.fiber_strands_reported,capacity_evidence:p.capacity_evidence,
    offered_capacity_gbps:null,lit_capacity_gbps:p.lit_capacity_gbps,spare_capacity_gbps:null,
    site_serviceability:'unconfirmed',route_diversity:'unconfirmed',
    notes:p.notes||'Mapped evidence; carrier confirmation required.'};
}
function screen(input,dataset) {
  var request=parseRequest(input);
  /* A caller that supplies its own dataset gets exactly that and nothing
     else — the tests rely on it, and so does any future fixture. Otherwise
     both bundled inventories are consulted, bbox-narrowed to the query. */
  var data=dataset||combined(boxAround(request.lat,request.lon,request.radius_km));
  var point=[request.lon,request.lat];
  var routes=[],facilities=[],planning=[],unknown=[];
  data.features.forEach(function(f) {
    var p=f.properties||{},d=geometryDistance(point,f.geometry);
    if(d>request.radius_km*1000) return;
    var item=summarize(f,d);
    if(p.feature_kind==='fiber_route' && p.proximity_eligible===true) routes.push(item);
    else if(p.feature_kind==='network_design' || (p.feature_kind==='fiber_route' && p.proximity_eligible!==true)) planning.push(item);
    else if(p.feature_kind==='telecom_facility') facilities.push(item);
    else unknown.push(item);
  });
  var counts={routes:routes.length,facilities:facilities.length,planning:planning.length,unknown_medium:unknown.length};
  [routes,facilities,planning,unknown].forEach(function(a){a.sort(function(x,y){return x.mapped_distance_m-y.mapped_distance_m;});});
  return {schema_version:'1.0',query:request,dataset_built_at:data.manifest.built_at,
    datasets:{osm_and_ca:{built_at:data.manifest.built_at},
              published_inventory:{built_at:data.usaBuiltAt||null,
                                   records_in_box:data.usaCount==null?null:data.usaCount}},
    evidence_status:routes.length?'mapped_fiber_route_nearby':facilities.length?'telecom_facility_nearby':'no_route_evidence_in_loaded_sources',
    site_has_fiber:null,site_serviceability:'unconfirmed',available_capacity_gbps:null,
    meets_requested_capacity:null,physical_route_diversity:'unconfirmed',
    complete_national_inventory:false,coverage:'partial_public_evidence',
    counts_in_radius:counts,results_truncated:Object.keys(counts).some(function(k){return counts[k]>request.limit;}),
    routes:routes.slice(0,request.limit),facilities:facilities.slice(0,request.limit),
    planning_routes:planning.slice(0,request.limit),unknown_medium_routes:unknown.slice(0,request.limit),
    limitations:[
      'No evidence in this dataset does not establish absence of fiber.',
      'Distance is to published geometry, not a surveyed cable or constructible lateral.',
      'Nearby fiber, facilities and design routes do not prove serviceability or spare capacity.',
      'Different operator names do not prove physically diverse entrances or conduits.'
    ],
    qualification_needed:['Carrier confirmation for the exact parcel and demarcation point',
      'Service type, committed bandwidth and upgrade capacity',
      'Available strands or wavelengths, splice permission and access point',
      'Diverse physical paths, building entrances and shared-risk groups',
      'Lateral route, construction charge, recurring charge and delivery date',
      'Latency, jitter, packet loss, protection and SLA to required destinations']};
}
module.exports={parseRequest:parseRequest,screen:screen,load:load,geometryDistance:geometryDistance,segmentDistance:segmentDistance};

/* ═══════════════════════════════════════════════════════════════════════════
   SITE BOUNDARY SUPPORT — added for the Site Map Editor
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   screen() above answers for a POINT. The editor works in parcels, and the
   honest distance from a parcel to a cable is not the distance from its
   centroid: a 200-acre site whose north edge touches the road has fiber AT
   the boundary while its centre is half a mile away. Quoting the centroid
   distance there overstates the lateral by half a mile on every row.

   So this measures to the site BOUNDARY, and returns 0 when a route crosses
   the parcel or a facility sits inside it. Both answers carry
   measurement_method so a reader can never mistake one for the other — that
   is the whole reason the field exists.

   Everything else is deliberately shared with screen(): the same classifier,
   the same summarize(), the same nulls. Two code paths that disagree about
   what "confirmed optical route" means would be worse than no boundary
   support at all, because both tools are supposed to agree on one location.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Great-circle distance between two SEGMENTS. For segments that do not cross,
   the minimum separation is always attained at an endpoint of one of them, so
   the four endpoint-to-segment distances cover it. Crossing segments are
   caught before this is called and are 0 by definition. */
function segmentToSegment(a1, a2, b1, b2) {
  return Math.min(
    segmentDistance(a1, b1, b2), segmentDistance(a2, b1, b2),
    segmentDistance(b1, a1, a2), segmentDistance(b2, a1, a2));
}

/* Do two planar segments properly intersect? Used only at parcel scale, where
   a local equirectangular treatment of degrees is accurate to centimetres and
   a spherical formulation buys nothing. */
function ccw(p, q, r) {
  return (r[1] - p[1]) * (q[0] - p[0]) - (q[1] - p[1]) * (r[0] - p[0]);
}
function segmentsCross(p1, p2, p3, p4) {
  var d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  /* Collinear touching counts as crossing: a cable running along the property
     line is not "near" the site, it is on it. */
  function onSeg(a, b, c) {
    return Math.abs(ccw(a, b, c)) < 1e-12 &&
           c[0] >= Math.min(a[0], b[0]) - 1e-12 && c[0] <= Math.max(a[0], b[0]) + 1e-12 &&
           c[1] >= Math.min(a[1], b[1]) - 1e-12 && c[1] <= Math.max(a[1], b[1]) + 1e-12;
  }
  return onSeg(p3, p4, p1) || onSeg(p3, p4, p2) || onSeg(p1, p2, p3) || onSeg(p1, p2, p4);
}
/* Ray casting. The ring may or may not repeat its first vertex last; both are
   handled by walking i/j pairs around the full length. */
function pointInRing(pt, ring) {
  var inside = false, n = ring.length;
  for (var i = 0, j = n - 1; i < n; j = i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-15) + xi)) inside = !inside;
  }
  return inside;
}

/* Accept what the editor actually has: a bare ring, a ring array, a GeoJSON
   Polygon, or a Feature wrapping one. Returns [outerRing] — holes are ignored
   on purpose. A parcel donut is not a reason to call fiber further away. */
function normalizeRing(boundary) {
  if (!boundary) return null;
  var g = boundary.type === 'Feature' ? boundary.geometry : boundary;
  var coords = g && g.type === 'Polygon' ? g.coordinates
             : g && g.type === 'MultiPolygon' ? g.coordinates[0]
             : Array.isArray(boundary) ? boundary : null;
  if (!coords) return null;
  /* coords is either [[ [x,y], ... ]] (ring array) or [[x,y], ...] (bare ring) */
  var ring = Array.isArray(coords[0]) && Array.isArray(coords[0][0]) ? coords[0] : coords;
  if (!Array.isArray(ring) || ring.length < 3) return null;
  for (var i = 0; i < ring.length; i++) {
    var p = ring[i];
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number' ||
        !isFinite(p[0]) || !isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) return null;
  }
  return ring;
}

function ringBbox(ring) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  for (var i = 0; i < ring.length; i++) {
    if (ring[i][0] < b[0]) b[0] = ring[i][0];
    if (ring[i][1] < b[1]) b[1] = ring[i][1];
    if (ring[i][0] > b[2]) b[2] = ring[i][0];
    if (ring[i][1] > b[3]) b[3] = ring[i][1];
  }
  return b;
}
function geomBbox(g) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  if (!g) return b;
  var pts = g.type === 'Point' ? [g.coordinates]
          : g.type === 'LineString' ? g.coordinates
          : g.type === 'MultiLineString' ? [].concat.apply([], g.coordinates) : [];
  for (var i = 0; i < pts.length; i++) {
    if (pts[i][0] < b[0]) b[0] = pts[i][0];
    if (pts[i][1] < b[1]) b[1] = pts[i][1];
    if (pts[i][0] > b[2]) b[2] = pts[i][0];
    if (pts[i][1] > b[3]) b[3] = pts[i][1];
  }
  return b;
}

/* Distance from a published geometry to the site polygon, in metres.
   0 means the route crosses the parcel or the facility stands on it. */
function geometryToRing(g, ring) {
  if (!g) return Infinity;
  if (g.type === 'Point') {
    if (pointInRing(g.coordinates, ring)) return 0;
    var bestP = Infinity;
    for (var r = 1; r < ring.length; r++) bestP = Math.min(bestP, segmentDistance(g.coordinates, ring[r - 1], ring[r]));
    bestP = Math.min(bestP, segmentDistance(g.coordinates, ring[ring.length - 1], ring[0]));
    return bestP;
  }
  var lines = g.type === 'LineString' ? [g.coordinates]
            : g.type === 'MultiLineString' ? g.coordinates : [];
  var best = Infinity;
  for (var l = 0; l < lines.length; l++) {
    var line = lines[l];
    for (var i = 0; i < line.length; i++) if (pointInRing(line[i], ring)) return 0;
    for (var s = 1; s < line.length; s++) {
      for (var k = 0; k < ring.length; k++) {
        var r1 = ring[k], r2 = ring[(k + 1) % ring.length];
        if (segmentsCross(line[s - 1], line[s], r1, r2)) return 0;
        var d = segmentToSegment(line[s - 1], line[s], r1, r2);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

function parseAreaRequest(input) {
  input = input || {};
  var ring = normalizeRing(input.boundary);
  if (!ring) throw new Error('Invalid boundary (need a polygon ring of at least 3 WGS84 [lon,lat] points)');
  return {
    boundary_points: ring.length,
    radius_km: number(input.radius_km, 'radius_km (0.1–200)', 0.1, 200, 25),
    limit: Math.floor(number(input.limit, 'limit (1–50)', 1, 50, 10)),
    requested_capacity_gbps: input.requested_capacity_gbps === undefined ? null :
      number(input.requested_capacity_gbps, 'requested_capacity_gbps', 0.001, 100000),
    ring: ring
  };
}

/* The classifier, lifted verbatim from screen() so the two can never drift.
   `distanceOf` is the only thing that differs between point and area mode. */
function classify(data, request, distanceOf, method) {
  var routes = [], facilities = [], planning = [], unknown = [];
  data.features.forEach(function (f) {
    var p = f.properties || {}, d = distanceOf(f);
    if (d > request.radius_km * 1000) return;
    var item = summarize(f, d);
    item.distance_basis = method;
    item.intersects_site = d === 0;
    if (p.feature_kind === 'fiber_route' && p.proximity_eligible === true) routes.push(item);
    else if (p.feature_kind === 'network_design' || (p.feature_kind === 'fiber_route' && p.proximity_eligible !== true)) planning.push(item);
    else if (p.feature_kind === 'telecom_facility') facilities.push(item);
    else unknown.push(item);
  });
  [routes, facilities, planning, unknown].forEach(function (a) {
    a.sort(function (x, y) { return x.mapped_distance_m - y.mapped_distance_m; });
  });
  return { routes: routes, facilities: facilities, planning: planning, unknown: unknown };
}

function screenArea(input, dataset) {
  var request = parseAreaRequest(input);
  var ring = request.ring, rb = ringBbox(ring);
  /* Degrees of longitude shrink with latitude; pad generously rather than
     precisely, because a too-small pad silently drops real evidence. */
  var padLat = request.radius_km / 110.574;
  var padLon = request.radius_km / (111.320 * Math.max(0.15, Math.cos(rb[1] * Math.PI / 180)));
  var box = [rb[0] - padLon, rb[1] - padLat, rb[2] + padLon, rb[3] + padLat];
  /* Built after the box, because the published inventory is narrowed by it. */
  var data = dataset || combined(box);

  var METHOD = 'shortest_distance_from_site_boundary_to_published_geometry';
  var sets = classify(data, request, function (f) {
    var fb = geomBbox(f.geometry);
    if (fb[0] > box[2] || fb[2] < box[0] || fb[1] > box[3] || fb[3] < box[1]) return Infinity;
    return geometryToRing(f.geometry, ring);
  }, METHOD);

  var counts = { routes: sets.routes.length, facilities: sets.facilities.length,
                 planning: sets.planning.length, unknown_medium: sets.unknown.length };
  var intersecting = sets.routes.filter(function (r) { return r.intersects_site; }).length;

  return {
    schema_version: '1.0',
    query: { boundary_points: request.boundary_points, radius_km: request.radius_km,
             limit: request.limit, requested_capacity_gbps: request.requested_capacity_gbps },
    measurement_method: METHOD,
    measurement_note: 'Distance is from the site boundary, not its centroid. Zero means a published ' +
      'route crosses the parcel or a facility stands inside it — it does not mean service is present.',
    dataset_built_at: data.manifest.built_at,
    datasets: { osm_and_ca: { built_at: data.manifest.built_at },
                published_inventory: { built_at: data.usaBuiltAt || null,
                                       records_in_box: data.usaCount == null ? null : data.usaCount } },
    evidence_status: sets.routes.length ? 'mapped_fiber_route_nearby'
                   : sets.facilities.length ? 'telecom_facility_nearby'
                   : 'no_route_evidence_in_loaded_sources',
    routes_intersecting_site: intersecting,
    /* Unchanged from screen(), and they must stay unchanged: crossing the
       parcel is not service, and this dataset holds zero capacity records. */
    site_has_fiber: null, site_serviceability: 'unconfirmed', available_capacity_gbps: null,
    meets_requested_capacity: null, physical_route_diversity: 'unconfirmed',
    complete_national_inventory: false, coverage: 'partial_public_evidence',
    counts_in_radius: counts,
    results_truncated: Object.keys(counts).some(function (k) { return counts[k] > request.limit; }),
    routes: sets.routes.slice(0, request.limit),
    facilities: sets.facilities.slice(0, request.limit),
    planning_routes: sets.planning.slice(0, request.limit),
    unknown_medium_routes: sets.unknown.slice(0, request.limit),
    limitations: [
      'No evidence in this dataset does not establish absence of fiber.',
      'Distance is to published geometry, not a surveyed cable or constructible lateral.',
      'A route crossing the parcel does not establish a splice point, an entrance, or the right to use it.',
      'Nearby fiber, facilities and design routes do not prove serviceability or spare capacity.',
      'Different operator names do not prove physically diverse entrances or conduits.'
    ],
    qualification_needed: [
      'Carrier confirmation for the exact parcel and demarcation point',
      'Service type, committed bandwidth and upgrade capacity',
      'Available strands or wavelengths, splice permission and access point',
      'Diverse physical paths, building entrances and shared-risk groups',
      'Lateral route, construction charge, recurring charge and delivery date',
      'Latency, jitter, packet loss, protection and SLA to required destinations']
  };
}

module.exports.screenArea = screenArea;
module.exports.parseAreaRequest = parseAreaRequest;
module.exports.geometryToRing = geometryToRing;
module.exports.segmentToSegment = segmentToSegment;
module.exports.pointInRing = pointInRing;
module.exports.normalizeRing = normalizeRing;

/* ═══════════════════════════════════════════════════════════════════════════
   THE PUBLISHED ROUTE INVENTORY — 26,371 features, one interpreter
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A second dataset arrived: 26,371 published line features across 30 states
   and DC, sharded one GeoJSON per state. It shipped with its OWN evidence
   library and its own endpoint, which would have given Grid Atlas and the
   Site Map Editor two interpreters and two answers for one coordinate. That
   is the thing this integration exists to prevent, so the data is adapted
   INTO this library instead and every caller keeps the same four buckets,
   the same classifier and the same nulls.

   WHY SHARDED AND LAZY
   68 MB. load() above reads its whole dataset eagerly because 11 MB is
   affordable; this one is not. Each state file is read only when the query
   bbox meets that state's bbox, and every feature carries its own bbox for a
   second, cheaper rejection before any geometry maths. A Chicago lookup
   touches Illinois, Indiana and Wisconsin — not Oregon.

   The cache is bounded. A warm serverless instance answering queries across
   the country would otherwise accumulate all 30 states and hold 68 MB
   resident for the life of the container.
   ═══════════════════════════════════════════════════════════════════════════ */

var USA_ROOT = path.join(__dirname, '../../data/usa-fiber');
var usaManifest = null, usaCache = {}, usaOrder = [];
var USA_CACHE_MAX = 6;

function usaLoadManifest() {
  if (!usaManifest) usaManifest = JSON.parse(fs.readFileSync(path.join(USA_ROOT, 'manifest.json'), 'utf8'));
  return usaManifest;
}
function bboxHit(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }

function usaState(code) {
  if (usaCache[code]) return usaCache[code];
  // Committed gzip shards keep serverless bundles small without changing any
  // coordinates. Plain files remain the static browser/download format.
  var file = path.join(USA_ROOT, code + '.geojson');
  var packed = file + '.gz';
  var raw = fs.existsSync(packed)
    ? require('zlib').gunzipSync(fs.readFileSync(packed)).toString('utf8')
    : fs.readFileSync(file, 'utf8');
  var fc = JSON.parse(raw);
  usaCache[code] = fc.features || [];
  usaOrder.push(code);
  while (usaOrder.length > USA_CACHE_MAX) { delete usaCache[usaOrder.shift()]; }
  return usaCache[code];
}

/* Map the inventory's vocabulary onto this library's schema.

   CATEGORY IS NOT MEDIUM, and conflating the two would be the easy mistake
   here. This dataset's `unknown` means the PUBLISHER did not state whether
   the route is in service — the medium is fiber either way, because every
   source layer is a fiber layer. That is a different claim from the OSM
   `telecom_route_unknown` bucket above, where the medium itself is
   unspecified and the line may be copper. Filing status-unknown fiber under
   "medium unknown" would invent a doubt the source never expressed; filing
   it under confirmed optical with its status shown per record is what the
   source actually supports.

   Planned and inactive routes are NOT proximity-eligible, so the shared
   classifier drops them into planning_routes where they belong. */
function usaAdapt(f) {
  var p = f.properties || {}, cat = p.category;
  var kind = 'fiber_route', eligible = true;
  if (cat === 'planned') { kind = 'network_design'; eligible = false; }
  else if (cat === 'inactive') { eligible = false; }
  if (p.proximityEligible === false) { eligible = false; }
  return {
    type: 'Feature', id: p.id, bbox: f.bbox, geometry: f.geometry,
    properties: {
      source_id: p.sourceId, source_feature_id: p.id,
      feature_kind: kind, proximity_eligible: eligible,
      source_url: p.sourceUrl, retrieved_at: p.retrievedAt,
      geometry_quality: p.geometryQuality || (p.evidence === 'approximate_project_route'
        ? 'generalized_public_design' : 'publisher_geometry_unverified'),
      operational_status: p.routeStatus && p.routeStatus !== 'Unknown'
        ? p.routeStatus : (cat === 'unknown' ? 'not stated by the publisher' : cat),
      serviceability: 'unconfirmed',
      name: p.name || null, operator: p.carrier || null,
      source_vintage: p.dataDate || null,
      source_last_edited: p.metadataModified || null,
      /* This dataset carries no capacity of any kind. Explicit nulls, not
         absent keys, so a consumer reading them gets "unknown" and not
         undefined-coerced-to-zero. */
      fiber_strands_reported: null, lit_capacity_gbps: null,
      spare_capacity_gbps: null, offered_capacity_gbps: null,
      capacity_evidence: null, positional_accuracy_m: null,
      notes: p.networkType || 'Published route; carrier confirmation required.',
      dataset: 'usa-fiber'
    }
  };
}

/* Candidate features whose own bbox meets the query box. */
function usaCandidates(box) {
  var m;
  m = usaLoadManifest(); // A missing bundle is a lookup failure, not zero fiber.
  var out = [], seen = Object.create(null);
  (m.states || []).forEach(function (s) {
    if (!s.segments || !s.bbox || !bboxHit(s.bbox, box)) return;
    var feats;
    feats = usaState(s.code); // Do not silently omit a failed state's evidence.
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i];
      if (f.bbox && !bboxHit(f.bbox, box)) continue;
      // A cross-border source record appears in multiple state shards.
      // Deduplicate its stable ID, never different publishers' geometry.
      var id = f.properties && f.properties.id;
      if (id && seen[id]) continue;
      if (id) seen[id] = true;
      out.push(usaAdapt(f));
    }
  });
  return out;
}

function boxAround(lat, lon, km) {
  var dLat = km / 110.574;
  var dLon = km / (111.320 * Math.max(0.15, Math.cos(lat * Math.PI / 180)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/* One dataset object for the classifier, from both sources. Cross-source
   duplicates are NOT merged: the two inventories publish different records
   from different agencies and silently collapsing them would drop provenance
   the user is entitled to see. They are deduplicated only within a source,
   which each source already guarantees by id. */
function combined(box) {
  var base = load();
  var extra = usaCandidates(box);
  return {
    features: base.features.concat(extra),
    manifest: base.manifest,
    usaCount: extra.length,
    usaBuiltAt: (usaManifest && usaManifest.builtAt) || null
  };
}
module.exports.usaAdapt = usaAdapt;
module.exports.usaCandidates = usaCandidates;
module.exports.combined = combined;
module.exports.boxAround = boxAround;
