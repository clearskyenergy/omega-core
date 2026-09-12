/* /api/parcel.js — the pure parts, offline.
   Which county layer a point is asked of, an ArcGIS or GeoJSON ring turned
   into [lat,lng] the editor can draw, acres measured off that ring, and the
   handler's refusals — with fetch stubbed so nothing upstream is ever asked.
   No credential, no network: _lib/admin is stood in for the way
   trfqroute.js does it, because firebase-admin is not the thing under test. */
const path = require('path');

/* The Regrid branch is keyed off the environment. A shell that happens to
   export the token would send the handler to Regrid first and fail the
   "nobody upstream was asked" cases for a reason that is not a bug. */
delete process.env.REGRID_TOKEN;

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function near(a, b, rel) { return typeof a === 'number' && Math.abs(a - b) <= Math.abs(b) * rel; }

/* ── stand in for _lib/admin so no credential is needed ──────────────── */
let AUTH = () => Promise.resolve({ uid: 'u1', email: 'pm@concord.com', orgId: 'concordenergyusa.com', staff: false });
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: req => AUTH(req)
};
const libPath = require.resolve(path.join(__dirname, '..', '..', 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: fakeAdmin };
const parcel = require(path.join(__dirname, '..', '..', 'api', 'parcel.js'));
const H = parcel._helpers;

/* ── a fetch that answers from a script and remembers what was asked ──── */
let CALLS = [];
let SCRIPT = [];   /* one entry per expected call: {json} | {status} | {abort:true} */
global.fetch = function (url) {
  CALLS.push(String(url));
  const step = SCRIPT.shift();
  if (!step) return Promise.reject(new Error('unexpected upstream call: ' + url));
  if (step.abort) { const e = new Error('aborted'); e.name = 'AbortError'; return Promise.reject(e); }
  if (step.status) return Promise.resolve({ ok: false, status: step.status, json: () => Promise.resolve({ leaked: 'INTERNAL SECRET' }) });
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(step.json) });
};
function call(req) {
  CALLS = [];
  try { return Promise.resolve(parcel(req)); } catch (e) { return Promise.reject(e); }
}
function post(body, headers) { return call({ method: 'POST', headers: headers || {}, body }); }

/* ── fixtures ─────────────────────────────────────────────────────────── */
/* A 120 m × 80 m lot at the Loop: 9,600 m² = 2.372 acres. Built from the
   same Earth radius the module uses, so the expected area is the design,
   not a copy of the formula. */
const R = 6371008.8, LAT0 = 41.8781, LNG0 = -87.6298;
const dLat = m => m / (R * Math.PI / 180);
const dLng = (m, lat) => m / (R * Math.PI / 180 * Math.cos(lat * Math.PI / 180));
function lotRings(wM, hM) {
  const n = LAT0 + dLat(hM), e = LNG0 + dLng(wM, LAT0 + dLat(hM) / 2);
  return [[[LNG0, LAT0], [e, LAT0], [e, n], [LNG0, n], [LNG0, LAT0]]];   /* esri: [x,y], closed */
}
const COOK_HIT = { features: [{ attributes: { PIN14_dash: '17-16-244-001-0000', street_address: '4200 W ROOSEVELT RD' },
                                 geometry: { rings: lotRings(120, 80) } }] };
const DUPAGE_HIT = { features: [{ attributes: { PIN: '08-23-100-004', ADDRESS: '1 MAIN ST', BILLNAME: 'ACME HOLDINGS LLC', ACRES: 3.5, ZONING: 'I-1' },
                                   geometry: { rings: lotRings(120, 80) } }] };
const LAKE_HIT = { features: [{ attributes: { pin: '12-34-567-890', situs_address: '9 LAKE RD', taxpayer_name: 'NORTHSHORE LP' },
                                 geometry: { rings: lotRings(120, 80) } }] };
const EMPTY = { features: [] };
const ESRI_ERR = { error: { code: 400, message: 'INTERNAL SECRET layer detail' } };
const REGRID_HIT = { parcels: { type: 'FeatureCollection', features: [{
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: lotRings(120, 80) },
  properties: { headline: '4200 W Roosevelt Rd', path: '/us/il/cook/chicago/123',
                fields: { parcelnumb: '16-15-400-001-0000', owner: 'CITY OF CHICAGO', gisacre: 2.41,
                          ll_gisacre: 2.40, zoning: 'M2-3', county: 'Cook', state2: 'IL' } }
}] } };

(async function () {
  /* ── 1 · which county to ask ───────────────────────────────────────── */
  console.log('which county layer to ask');
  ok(same(H.countiesAt(41.8781, -87.6298), ['cook']), 'the Loop is Cook only');
  ok(same(H.countiesAt(41.7508, -88.1535), ['dupage', 'cook']), 'Naperville asks DuPage first, then Cook — Cook\'s box holds DuPage\'s');
  ok(same(H.countiesAt(41.8995, -87.9403), ['dupage', 'cook']), 'Elmhurst, on the county line, is asked of both');
  ok(same(H.countiesAt(42.3636, -87.8448), ['lake']), 'Waukegan is Lake only');
  ok(same(H.countiesAt(42.0334, -88.0834), ['cook']), 'Schaumburg — above DuPage\'s box, below Lake\'s — is Cook');
  ok(same(H.countiesAt(41.8445, -90.1887), []), 'Clinton, Iowa: no layer covers it');
  ok(same(H.countiesAt(43.0389, -87.9065), []), 'Milwaukee: no layer covers it');
  ok(H.COUNTY_ORDER[H.COUNTY_ORDER.length - 1] === 'cook', 'Cook is always asked last');
  ok(Object.keys(H.PARCELS).every(k => { const b = H.PARCELS[k].bbox; return b[0] < b[2] && b[1] < b[3]; }),
     'every bbox is [south, west, north, east] with south < north and west < east');
  ok(Object.keys(H.PARCELS).every(k => /^https:\/\/[^/]+\/.+\/MapServer\/\d+$/.test(H.PARCELS[k].url)),
     'every layer url is a MapServer layer root with no trailing /query');

  /* ── 2 · numbers ───────────────────────────────────────────────────── */
  console.log('coordinates as numbers');
  ok(H.num(41.5) === 41.5 && H.num('41.5') === 41.5 && H.num('-87') === -87, 'a number or a numeric string');
  ok(isNaN(H.num(null)) && isNaN(H.num('')) && isNaN(H.num(undefined)), 'null, empty and undefined are NOT zero');
  ok(isNaN(H.num('abc')) && isNaN(H.num(true)) && isNaN(H.num(NaN)) && isNaN(H.num(Infinity)), 'garbage is NaN');

  /* ── 3 · rings ─────────────────────────────────────────────────────── */
  console.log('rings the editor can draw');
  const rE = H.ringFromEsri({ rings: lotRings(120, 80) });
  ok(rE && rE.length === 4, 'an esri ring comes back with its closing duplicate stripped (4 vertices, not 5)');
  ok(rE && rE[0][0] === LAT0 && rE[0][1] === LNG0, 'and swapped to [lat,lng]');
  ok(H.ringFromEsri({ rings: [] }) === null && H.ringFromEsri(null) === null && H.ringFromEsri({}) === null, 'no rings, no geometry: null');
  ok(H.ringFromEsri({ rings: [[[-87.6, 41.8], [-87.5, 41.8]]] }) === null, 'two vertices is not a polygon');
  ok(H.ringFromEsri({ rings: [[[-87.6, 41.8], [-87.5, 41.8], ['x', 41.9]]] }) === null, 'one bad vertex voids the whole ring — a partial boundary is worse than none');
  ok(H.ringFromEsri({ rings: [[[-87.6, 41.8], [-87.5, 41.8], [-87.5, 91]]] }) === null, 'a vertex off the globe voids it too');
  const rG = H.ringFromGeoJson({ type: 'Polygon', coordinates: lotRings(120, 80) });
  ok(rG && same(rG, rE), 'a GeoJSON Polygon gives the same ring');
  const rM = H.ringFromGeoJson({ type: 'MultiPolygon', coordinates: [lotRings(120, 80), lotRings(10, 10)] });
  ok(rM && same(rM, rE), 'a MultiPolygon gives its first part');
  ok(H.ringFromGeoJson({ type: 'Point', coordinates: [-87.6, 41.8] }) === null, 'a Point is not a parcel');
  const open = [[41.8, -87.6], [41.8, -87.5], [41.9, -87.5]];
  ok(same(H.cleanRing(open), open), 'a ring that was already open is left alone');

  /* ── 4 · acres ─────────────────────────────────────────────────────── */
  console.log('acres off the ring');
  const sq = H.ringFromEsri({ rings: lotRings(1000, 1000) });
  ok(near(H.ringAcres(sq), 1e6 / 4046.8564224, 0.001), 'a 1 km square is 247.1 acres (' + H.ringAcres(sq) + ')');
  ok(near(H.ringAcres(rE), 9600 / 4046.8564224, 0.001), 'the 120 × 80 m lot is 2.372 acres (' + H.ringAcres(rE) + ')');
  ok(H.ringAcres(rE.slice().reverse()) === H.ringAcres(rE), 'orientation does not matter');
  const tri = [rE[0], rE[1], rE[2]];
  ok(near(H.ringAcres(tri), 4800 / 4046.8564224, 0.001), 'half the lot as a triangle is half the acres');
  ok(H.ringAcres([rE[0], rE[1]]) === null && H.ringAcres(null) === null, 'fewer than three vertices: null, not 0');
  const far = [[35.0, -101.0], [35.0, -100.98], [35.02, -100.98], [35.02, -101.0]];
  const farM2 = (0.02 * R * Math.PI / 180) * (0.02 * R * Math.PI / 180 * Math.cos(35.01 * Math.PI / 180));
  ok(near(H.ringAcres(far), farM2 / 4046.8564224, 0.001), 'the projection is centred on the ring, not on Chicago (Texas Panhandle lot)');

  /* ── 5 · attributes: read what is there ────────────────────────────── */
  console.log('fields nobody documented');
  ok(H.acresFromAttrs({ ACRES: 3.5 }) === 3.5 && H.acresFromAttrs({ gis_acres: '2.25' }) === 2.25, 'an acreage field is used when the layer has one');
  ok(H.acresFromAttrs({ ACRES: 0 }) === null && H.acresFromAttrs({ Shape_Area: 9600 }) === null, 'zero or a shape area is not acreage');
  ok(H.acresFromAttrs({ TOTAL_ACRES: 4, ACRES: 3 }) === 3, 'an exact name beats a loose match');
  ok(H.zoningFromAttrs({ ZONING: ' M-1 ' }) === 'M-1' && H.zoningFromAttrs({ zone_class: 'I2' }) === 'I2', 'zoning by either common name');
  ok(H.zoningFromAttrs({ PIN: 'x' }) === null && H.zoningFromAttrs({ ZONING: '' }) === null, 'and null when absent or blank');

  /* ── 6 · a county answer → the contract ────────────────────────────── */
  console.log('a county answer becomes the contract');
  const c = H.fromEsri(COOK_HIT, 'cook');
  ok(c && c.ok === true && c.source === 'cook' && c.county === 'Cook County', 'Cook: ok, source, county label');
  ok(c && c.apn === '17-16-244-001-0000', 'Cook apn is PIN14_dash');
  ok(c && c.owner === null, 'Cook owner is null — the public layer does not carry it');
  ok(c && near(c.acres, 2.372, 0.001), 'Cook acres are measured off the ring');
  ok(c && c.zoning === null, 'Cook zoning is null, not invented');
  const d = H.fromEsri(DUPAGE_HIT, 'dupage');
  ok(d && d.apn === '08-23-100-004' && d.owner === 'ACME HOLDINGS LLC', 'DuPage apn is PIN and owner is BILLNAME');
  ok(d && d.acres === 3.5 && d.zoning === 'I-1', 'DuPage acres come from the field when there is one, and zoning is read');
  const l = H.fromEsri(LAKE_HIT, 'lake');
  ok(l && l.apn === '12-34-567-890' && l.owner === 'NORTHSHORE LP' && l.county === 'Lake County', 'Lake apn is pin and owner is taxpayer_name');
  ok(H.fromEsri(EMPTY, 'cook') === null, 'no feature under the point: null');
  ok(H.fromEsri(ESRI_ERR, 'cook') === null, 'an ArcGIS 200 {error} is a miss, not a parcel');
  ok(H.fromEsri({ features: [{ attributes: { PIN14_dash: 'x' } }] }, 'cook') === null, 'a feature with no geometry is not a parcel');
  ok(H.fromEsri(COOK_HIT, 'kane') === null, 'an unknown county key answers null rather than guessing a schema');

  /* ── 7 · a Regrid answer → the contract (fixture only; no live key) ─── */
  console.log('a Regrid answer becomes the contract');
  const g = H.fromRegrid(REGRID_HIT);
  ok(g && g.ok === true && g.source === 'regrid', 'ok, source regrid');
  ok(g && g.apn === '16-15-400-001-0000' && g.owner === 'CITY OF CHICAGO', 'apn is parcelnumb, owner is owner');
  ok(g && g.acres === 2.41 && g.zoning === 'M2-3' && g.county === 'Cook', 'gisacre, zoning and county from fields');
  ok(g && g.ring.length === 4, 'ring from the GeoJSON polygon, closing duplicate stripped');
  const g2 = H.fromRegrid({ parcels: { features: [{ geometry: REGRID_HIT.parcels.features[0].geometry, properties: { fields: { parcelnumb: 'p' } } }] } });
  ok(g2 && near(g2.acres, 2.372, 0.001) && g2.owner === null, 'no gisacre: measured off the ring; no owner: null');
  ok(H.fromRegrid({ parcels: { features: [] } }) === null && H.fromRegrid(null) === null && H.fromRegrid({}) === null, 'nothing under the point: null');

  /* ── 8 · the query string ──────────────────────────────────────────── */
  console.log('the ArcGIS point query');
  const u = H.countyUrl('cook', 41.8781, -87.6298);
  ok(u.indexOf(H.PARCELS.cook.url + '/query?') === 0, 'layer root + /query');
  ['geometry=-87.6298,41.8781', 'geometryType=esriGeometryPoint', 'inSR=4326', 'spatialRel=esriSpatialRelIntersects',
   'outFields=*', 'returnGeometry=true', 'outSR=4326', 'f=json'].forEach(p => ok(u.indexOf(p) > 0, 'carries ' + p));
  ok(u.indexOf('token') < 0, 'no token on a county query');
  ok(H.TIMEOUT_MS === 8000, 'upstream ceiling is 8 s');

  /* ── 9 · the handler refuses before it asks anyone ─────────────────── */
  console.log('the handler');
  let err = null;
  await call({ method: 'GET', headers: {}, body: {} }).catch(e => { err = e; });
  ok(err && err.status === 405, 'GET is 405');
  err = null;
  AUTH = () => Promise.reject(fakeAdmin.httpError(401, 'invalid token'));
  await post({ lat: 41.8781, lng: -87.6298 }).catch(e => { err = e; });
  ok(err && err.status === 401 && CALLS.length === 0, 'a bad token is 401 and nothing upstream is asked');
  AUTH = () => Promise.resolve({ uid: 'u1', email: 'pm@concord.com', orgId: 'concordenergyusa.com', staff: false });
  for (const body of [{}, { lat: 'abc', lng: 1 }, { lat: null, lng: null }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lng: -87.6 }]) {
    err = null;
    await post(body).catch(e => { err = e; });
    ok(err && err.status === 400 && CALLS.length === 0, '400 and no upstream call for ' + JSON.stringify(body));
  }

  /* ── 10 · outside every layer, with no key: an honest miss, no call ── */
  console.log('outside coverage');
  SCRIPT = [];
  let out = await post({ lat: 41.8445, lng: -90.1887 });
  ok(out && out.ok === false && out.reason === 'no parcel record here', 'Clinton, Iowa: ok:false, reason "no parcel record here"');
  ok(CALLS.length === 0 && same(out.tried, []), 'and nobody upstream was asked (REGRID_TOKEN is not set in this process)');
  ok(!('note' in out), 'no note when nothing was even tried');

  /* ── 11 · a Cook point through the stubbed layer ───────────────────── */
  console.log('a Cook point');
  SCRIPT = [{ json: COOK_HIT }];
  out = await post({ lat: '41.8781', lng: '-87.6298' });
  ok(out && out.ok === true && out.source === 'cook' && out.apn === '17-16-244-001-0000', 'ok:true from the Cook layer (numeric strings accepted)');
  ok(CALLS.length === 1 && CALLS[0].indexOf(H.PARCELS.cook.url) === 0, 'exactly one upstream call, to the Cook layer');
  ok(CALLS[0].indexOf('geometry=-87.6298,41.8781') > 0 && CALLS[0].indexOf('returnGeometry=true') > 0, 'point query with geometry requested');
  ok(same(out.tried, undefined) , 'a hit carries no tried[] — the contract shape only');

  /* ── 12 · DuPage first, Cook second ────────────────────────────────── */
  console.log('a point in both boxes');
  SCRIPT = [{ json: EMPTY }, { json: COOK_HIT }];
  out = await post({ lat: 41.8995, lng: -87.9403 });
  ok(out && out.ok === true && out.source === 'cook', 'DuPage answered empty, so Cook was asked and answered');
  ok(CALLS.length === 2 && CALLS[0].indexOf(H.PARCELS.dupage.url) === 0 && CALLS[1].indexOf(H.PARCELS.cook.url) === 0, 'in that order');
  SCRIPT = [{ json: DUPAGE_HIT }];
  out = await post({ lat: 41.8995, lng: -87.9403 });
  ok(out && out.source === 'dupage' && CALLS.length === 1, 'a DuPage hit stops the chain — Cook is not asked');

  /* ── 13 · upstream failure: skipped, named, never echoed ───────────── */
  console.log('when a layer does not answer');
  SCRIPT = [{ status: 500 }, { abort: true }];
  out = await post({ lat: 41.8995, lng: -87.9403 });
  ok(out && out.ok === false && out.reason === 'no parcel record here', 'both failed: still ok:false with the contract reason');
  ok(same(out.tried, ['dupage', 'cook']), 'tried[] names both');
  ok(/dupage did not answer/.test(out.note) && /cook timed out/.test(out.note), 'note says who failed and how (' + out.note + ')');
  ok(JSON.stringify(out).indexOf('SECRET') < 0 && JSON.stringify(out).indexOf('http') < 0, 'no upstream body and no URL in the reply');
  SCRIPT = [{ json: ESRI_ERR }, { json: COOK_HIT }];
  out = await post({ lat: 41.8995, lng: -87.9403 });
  ok(out && out.ok === true && out.source === 'cook' && JSON.stringify(out).indexOf('SECRET') < 0, 'an ArcGIS {error} on DuPage falls through to Cook, message not echoed');
  SCRIPT = [{ json: { not: 'a feature collection' } }];
  out = await post({ lat: 41.8781, lng: -87.6298 });
  ok(out && out.ok === false && same(out.tried, ['cook']) && !out.note, 'an unexpected 200 shape is a plain miss');

  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  CRASH ' + (e && e.stack || e)); process.exit(1); });
