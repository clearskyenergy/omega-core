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
/* A Firestore of plain paths: omega_orgs/<org> is the tenant record the gate
   reads, omega_orgs/<org>/billing/current what billingOf() answers from, and
   parcel_cache/<key> where a hit is kept. WRITES records every set(). */
let DOCS = {};
let WRITES = [];
function fakeDb() {
  const col = base => ({
    doc: id => {
      const p = base + '/' + id;
      return {
        get: () => Promise.resolve({ exists: !!DOCS[p], data: () => DOCS[p] }),
        set: d => { WRITES.push(p); DOCS[p] = d; return Promise.resolve(); },
        collection: name => col(p + '/' + name)
      };
    }
  });
  return { collection: name => col(name) };
}
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: req => AUTH(req),
  db: fakeDb,
  billingOf: org => {
    const d = DOCS['omega_orgs/' + org + '/billing/current'];
    return Promise.resolve(d || { tier: 'standard', addons: [], toolOverrides: {} });
  }
};
const ACTIVE = { 'omega_orgs/concordenergyusa.com': { status: 'active' } };
function reset(docs) { DOCS = Object.assign({}, ACTIVE, docs || {}); WRITES = []; }
reset();
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
  ok(Object.keys(H.PARCELS).every(k => /^https:\/\/[^/]+\/.+\/(?:MapServer|FeatureServer)\/\d+$/.test(H.PARCELS[k].url)),
     'every layer url is an ArcGIS layer root with no trailing /query');

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

  ok(same(H.countiesAt(41.1758, -73.1721), ['ct']), 'Seaview Avenue asks the Connecticut 2025 layer');
  var ctHit = H.fromEsri({ features: [{ attributes: { Parcel_ID: '601-3', Owner: 'TEST OWNER', Land_Acres: 0.1, Zone: 'TEST' },
    geometry: { rings: [[[-73.1723,41.1757],[-73.172,41.1757],[-73.172,41.1759],[-73.1723,41.1757]]] } }] }, 'ct');
  ok(ctHit && ctHit.apn === '601-3' && ctHit.owner === 'TEST OWNER' && ctHit.source === 'ct', 'Connecticut fields become the existing parcel contract');

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
  ok(H.fromEsri(COOK_HIT, 'nowhere') === null, 'an unknown county key answers null rather than guessing a schema');

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
  reset(); SCRIPT = [];
  let out = await post({ lat: 41.8445, lng: -90.1887 });
  ok(out && out.ok === false && out.reason === 'no parcel record here', 'Clinton, Iowa: ok:false, reason "no parcel record here"');
  ok(CALLS.length === 0 && same(out.tried, []), 'and nobody upstream was asked (REGRID_TOKEN is not set in this process)');
  ok(!('note' in out), 'no note when nothing was even tried');
  ok(out.licensed === 'not-configured', 'and the miss says the licensed source was not asked because it is not configured (a word, never the key)');

  /* ── 11 · a Cook point through the stubbed layer ───────────────────── */
  console.log('a Cook point');
  reset(); SCRIPT = [{ json: COOK_HIT }];
  out = await post({ lat: '41.8781', lng: '-87.6298' });
  ok(out && out.ok === true && out.source === 'cook' && out.apn === '17-16-244-001-0000', 'ok:true from the Cook layer (numeric strings accepted)');
  ok(CALLS.length === 1 && CALLS[0].indexOf(H.PARCELS.cook.url) === 0, 'exactly one upstream call, to the Cook layer');
  ok(CALLS[0].indexOf('geometry=-87.6298,41.8781') > 0 && CALLS[0].indexOf('returnGeometry=true') > 0, 'point query with geometry requested');
  ok(same(out.tried, undefined) , 'a hit carries no tried[] — the contract shape only');

  /* ── 12 · DuPage first, Cook second ────────────────────────────────── */
  console.log('a point in both boxes');
  reset(); SCRIPT = [{ json: EMPTY }, { json: COOK_HIT }];
  out = await post({ lat: 41.8995, lng: -87.9403 });
  ok(out && out.ok === true && out.source === 'cook', 'DuPage answered empty, so Cook was asked and answered');
  ok(CALLS.length === 2 && CALLS[0].indexOf(H.PARCELS.dupage.url) === 0 && CALLS[1].indexOf(H.PARCELS.cook.url) === 0, 'in that order');
  reset(); SCRIPT = [{ json: DUPAGE_HIT }];
  out = await post({ lat: 41.8995, lng: -87.9403 });
  ok(out && out.source === 'dupage' && CALLS.length === 1, 'a DuPage hit stops the chain — Cook is not asked');

  /* ── 13 · upstream failure: skipped, named, never echoed ───────────── */
  console.log('when a layer does not answer');
  reset(); SCRIPT = [{ status: 500 }, { abort: true }];
  out = await post({ lat: 41.8995, lng: -87.9403 });
  ok(out && out.ok === false && out.reason === 'no parcel record here', 'both failed: still ok:false with the contract reason');
  ok(same(out.tried, ['dupage', 'cook']), 'tried[] names both');
  ok(/dupage did not answer/.test(out.note) && /cook timed out/.test(out.note), 'note says who failed and how (' + out.note + ')');
  ok(JSON.stringify(out).indexOf('SECRET') < 0 && JSON.stringify(out).indexOf('http') < 0, 'no upstream body and no URL in the reply');
  reset(); SCRIPT = [{ json: ESRI_ERR }, { json: COOK_HIT }];
  out = await post({ lat: 41.8995, lng: -87.9403 });
  ok(out && out.ok === true && out.source === 'cook' && JSON.stringify(out).indexOf('SECRET') < 0, 'an ArcGIS {error} on DuPage falls through to Cook, message not echoed');
  reset(); SCRIPT = [{ json: { not: 'a feature collection' } }];
  out = await post({ lat: 41.8781, lng: -87.6298 });
  ok(out && out.ok === false && same(out.tried, ['cook']) && !out.note, 'an unexpected 200 shape is a plain miss');

  /* ── 14 · the tenant gate: a token is a person, omega_orgs is one of ours */
  console.log('who may ask');
  const COOK = { lat: 41.8781, lng: -87.6298 };
  for (const [label, org] of [['no omega_orgs record', undefined], ['pending', { status: 'pending' }],
                              ['suspended', { status: 'suspended' }], ['cancelled', { status: 'cancelled' }]]) {
    reset({ 'omega_orgs/concordenergyusa.com': org }); SCRIPT = [{ json: COOK_HIT }];
    err = null;
    await post(COOK).catch(e => { err = e; });
    ok(err && err.status === 403 && /not active/.test(err.message) && CALLS.length === 0,
       label + ': 403 "tenant is not active" and nothing upstream is asked');
  }
  reset({ 'omega_orgs/concordenergyusa.com': { name: 'Concord' } }); SCRIPT = [{ json: COOK_HIT }];
  out = await post(COOK);
  ok(out && out.ok === true && CALLS.length === 1, 'a record with no status field is active — the reading omega-tenant.js gives it');
  reset({ 'omega_orgs/concordenergyusa.com': undefined }); SCRIPT = [{ json: COOK_HIT }];
  AUTH = () => Promise.resolve({ uid: 's1', email: 'ops@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true });
  out = await post(COOK);
  ok(out && out.ok === true && CALLS.length === 1, 'staff pass with no tenant record at all');
  AUTH = () => Promise.resolve({ uid: 'u1', email: 'pm@concord.com', orgId: 'concordenergyusa.com', staff: false });
  reset(); SCRIPT = [{ json: COOK_HIT }];
  err = null;
  await post({ lat: 'abc', lng: 1 }).catch(e => { err = e; });
  ok(err && err.status === 400, 'a bad body is still refused before the tenant record is read');

  /* ── 15 · Regrid is metered: only a tier or add-on that carries it ──── */
  console.log('who may spend the Regrid key');
  ok(H.regridEntitled({ tier: 'deluxe' }) && H.regridEntitled({ tier: 'enterprise' }) && H.regridEntitled({ tier: 'internal' }), 'deluxe and up');
  ok(!H.regridEntitled({ tier: 'standard' }) && !H.regridEntitled({ tier: 'trial' }) && !H.regridEntitled({}) && !H.regridEntitled(null), 'not trial, standard or nothing');
  ok(H.regridEntitled({ tier: 'standard', addons: ['parcels'] }), 'the parcels add-on on any tier');
  ok(H.regridEntitled({ tier: 'trial', toolOverrides: { parcel: true } }), 'an override on');
  ok(!H.regridEntitled({ tier: 'enterprise', toolOverrides: { parcel: false } }), 'an override off beats the tier');
  ok(same(H.REGRID_TIERS, ['deluxe', 'enterprise', 'partner', 'internal']) && H.REGRID_ADDON === 'parcels', 'the tier names are tenant-billing.js\'s');
  process.env.REGRID_TOKEN = 'SECRET-REGRID-TOKEN';
  try {
    reset(); SCRIPT = [{ json: COOK_HIT }];                       /* standard tier: no billing doc */
    out = await post(COOK);
    ok(out && out.ok === true && out.source === 'cook' && CALLS.length === 1 && CALLS[0].indexOf('regrid') < 0,
       'a standard tenant with the key set goes to the county layer, never Regrid');
    reset({ 'omega_orgs/concordenergyusa.com/billing/current': { tier: 'deluxe' } }); SCRIPT = [{ json: REGRID_HIT }];
    out = await post(COOK);
    ok(out && out.ok === true && out.source === 'regrid' && CALLS.length === 1 && CALLS[0].indexOf(H.PARCELS.cook.url) < 0,
       'a deluxe tenant is answered by Regrid first');
    ok(JSON.stringify(out).indexOf('SECRET') < 0, 'and the token is not in the answer');
    reset({ 'omega_orgs/concordenergyusa.com/billing/current': { tier: 'standard', addons: ['parcels'] } }); SCRIPT = [{ status: 401 }, { json: COOK_HIT }];
    out = await post(COOK);
    ok(out && out.ok === true && out.source === 'cook' && CALLS.length === 2 && JSON.stringify(out).indexOf('SECRET') < 0,
       'the add-on asks Regrid; a Regrid 401 falls through to the county, body not echoed');
    /* a point no public layer covers: the miss says whether the licensed source was asked */
    reset(); SCRIPT = [];
    out = await post({ lat: 41.8445, lng: -90.1887 });
    ok(out && out.ok === false && out.licensed === 'not-on-plan' && CALLS.length === 0, 'outside every public layer on a plan without it: the miss says the licensed source is not on the plan');
    reset({ 'omega_orgs/concordenergyusa.com/billing/current': { tier: 'internal' } }); SCRIPT = [{ json: { parcels: { type: 'FeatureCollection', features: [] } } }, { status: 404 }];
    out = await post({ lat: 41.8445, lng: -90.1887 });
    ok(out && out.ok === false && out.licensed === 'asked' && same(out.tried, ['regrid', 'regrid-tiles']) && !out.note && JSON.stringify(out).indexOf('SECRET') < 0, 'and on a plan with it: asked, nothing there, the token never in the answer');
    /* ── the lot off the parcel TILES: the key carries the tiles and not the point lookup ── */
    {
      const MVT = require('../../api/_lib/mvt');
      /* a small encoder for the test alone: one layer, polygons in tile units */
      const vint = (n) => { const o = []; while (n > 127) { o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
      const zz = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
      const fld = (f, bytes) => vint(f * 8 + 2).concat(vint(bytes.length), bytes);
      const strb = (t) => Array.from(Buffer.from(t, 'utf8'));
      const geom = (ring) => { const g = [1 * 8 + 1, zz(ring[0][0]), zz(ring[0][1]), (ring.length - 1) * 8 + 2]; for (let k = 1; k < ring.length; k++) g.push(zz(ring[k][0] - ring[k - 1][0]), zz(ring[k][1] - ring[k - 1][1])); g.push(1 * 8 + 7); return g.reduce((a, n) => a.concat(vint(n)), []); };
      const tile = (feats) => {
        let layer = fld(1, strb('parcels')); const keys = ['parcelnumb', 'owner'], vals = [];
        feats.forEach((f) => { const tags = []; [f.apn, f.owner].forEach((v, k) => { tags.push(k, vals.length); vals.push(v); });
          layer = layer.concat(fld(2, fld(2, tags.reduce((a, n) => a.concat(vint(n)), [])).concat(vint(3 * 8), vint(3), fld(4, geom(f.ring))))); });
        keys.forEach((k) => { layer = layer.concat(fld(3, strb(k))); });
        vals.forEach((v) => { layer = layer.concat(fld(4, fld(1, strb(v)))); });
        layer = layer.concat(vint(5 * 8), vint(4096));
        return Buffer.from(fld(3, layer));
      };
      /* Chandler, Oklahoma (no public parcel layer), at the middle of its z16 tile so the test lots sit inside it */
      const mid = MVT.toLatLng(MVT.tileOf(35.7017, -96.8809, 16), 2048, 2048, 4096), OK = { lat: mid[0], lng: mid[1] };
      const at = (z) => { const t = MVT.tileOf(OK.lat, OK.lng, z); return { t, px: Math.round(t.fx * 4096), py: Math.round(t.fy * 4096) }; };
      const z16 = at(16), sq = (c, h) => [[c.px - h, c.py - h], [c.px + h, c.py - h], [c.px + h, c.py + h], [c.px - h, c.py + h]];
      /* pure: the lot under the point, and not its neighbour */
      const whole = tile([{ apn: 'OK-1', owner: 'Lot Owner LLC', ring: sq(z16, 300) }, { apn: 'OK-2', owner: 'Next Door', ring: sq({ px: z16.px + 900, py: z16.py }, 300) }]);
      const got = H.fromTile(whole, z16.t, OK.lat, OK.lng);
      ok(got && got.ok === true && got.apn === 'OK-1' && got.owner === 'Lot Owner LLC' && got.source === 'regrid-tiles' && got.ring.length === 4 && !got.partial,
         'the tile reader finds the polygon under the point (not its neighbour), with the parcel number and owner the tile carries');
      /* a z16 tile is about 500 m across here, so a 600-unit square is about 73 m a side: 1.3 acres or so */
      ok(got.acres > 0.9 && got.acres < 1.8, 'and its acres are measured off the outline (' + got.acres + ')');
      ok(got.ring.every(function (p) { return Math.abs(p[0] - OK.lat) < 0.002 && Math.abs(p[1] - OK.lng) < 0.002; }), 'in latitude and longitude, around the point');
      ok(H.fromTile(tile([{ apn: 'OK-2', owner: 'x', ring: sq({ px: z16.px + 900, py: z16.py }, 300) }]), z16.t, OK.lat, OK.lng) === null, 'no polygon under the point is null, never the nearest one');
      /* through the door: the point lookup is refused, no county covers Oklahoma, the tile answers */
      reset({ 'omega_orgs/concordenergyusa.com/billing/current': { tier: 'internal' } });
      const realFetch = global.fetch; const asked = [];
      global.fetch = function (url) {
        asked.push(String(url));
        if (/tiles\.regrid\.com/.test(url)) return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.length)) });
        return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });
      };
      try {
        out = await post(OK);
        ok(out && out.ok === true && out.source === 'regrid-tiles' && out.apn === 'OK-1' && asked.length === 2 && /\/16\/\d+\/\d+\.mvt\?token=/.test(asked[1]),
           'a key that carries the tiles and not the point lookup: the lot is read off the tile the point is in');
        ok(JSON.stringify(out).indexOf('SECRET') < 0, 'and the token is not in the answer');
        /* a lot cut by the tile edge: a wider tile is asked; whole there, it is the answer */
        const cut = tile([{ apn: 'BIG', owner: 'x', ring: [[-64, z16.py - 300], [z16.px + 300, z16.py - 300], [z16.px + 300, z16.py + 300], [-64, z16.py + 300]] }]);
        const z15 = at(15), wide = tile([{ apn: 'BIG', owner: 'x', ring: sq(z15, 400) }]);
        const body = (b) => ({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) });
        asked.length = 0; reset({ 'omega_orgs/concordenergyusa.com/billing/current': { tier: 'internal' } });
        global.fetch = function (url) { asked.push(String(url)); return Promise.resolve(/\/16\/\d+\/\d+\.mvt/.test(url) ? body(cut) : /\/15\/\d+\/\d+\.mvt/.test(url) ? body(wide) : { ok: false, status: 403, json: () => Promise.resolve({}) }); };
        out = await post({ lat: OK.lat + 0.01, lng: OK.lng });            /* another point: the first is cached */
        ok(out && out.ok === false, 'a point the tile has nothing under is still a miss');
        asked.length = 0;
        global.fetch = function (url) { asked.push(String(url)); return Promise.resolve(/\/16\/\d+\/\d+\.mvt/.test(url) ? body(cut) : /\/15\/\d+\/\d+\.mvt/.test(url) ? body(wide) : { ok: false, status: 403, json: () => Promise.resolve({}) }); };
        const viaLookup = await H.lookup({ orgId: 't' }, { regrid: true }, OK.lat, OK.lng);
        ok(viaLookup.ok === true && viaLookup.apn === 'BIG' && !viaLookup.partial && asked.filter((u) => /\.mvt/.test(u)).length === 2, 'a lot cut by the tile’s edge is asked again on a wider tile, and the whole one is the answer');
        /* cut at every zoom: kept, and said */
        global.fetch = function (url) { return Promise.resolve(/\.mvt/.test(url) ? body(cut) : { ok: false, status: 403, json: () => Promise.resolve({}) }); };
        const stillCut = await H.fromTiles(OK.lat, OK.lng, 'SECRET-REGRID-TOKEN', function (u) { return Promise.resolve(cut); });
        ok(stillCut === null || stillCut.partial === true, 'a lot still cut at the widest tile is marked partial, never passed off as whole');
        /* the refusal is said as a refusal */
        global.fetch = function () { return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }); };
        const refused = await H.lookup({ orgId: 't' }, { regrid: true }, OK.lat + 0.02, OK.lng);
        ok(refused.ok === false && /regrid refused the key \(HTTP 403\)/.test(refused.note || '') && refused.licensed === 'asked' && JSON.stringify(refused).indexOf('SECRET') < 0,
           'a key the service refuses is said as that (the status, never the key): ' + refused.note);
      } finally { global.fetch = realFetch; }
    }
    reset({ 'omega_orgs/concordenergyusa.com': undefined }); SCRIPT = [{ json: REGRID_HIT }];
    AUTH = () => Promise.resolve({ uid: 's1', email: 'ops@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true });
    out = await post(COOK);
    ok(out && out.source === 'regrid', 'staff may spend it');
    AUTH = () => Promise.resolve({ uid: 'u1', email: 'pm@concord.com', orgId: 'concordenergyusa.com', staff: false });
  } finally { delete process.env.REGRID_TOKEN; }

  /* ── 16 · the cache: the same point twice costs nothing ────────────── */
  console.log('the cache');
  ok(H.cacheKey(41.8781, -87.6298) === '41.87810_-87.62980', 'key is lat_lng to five places');
  ok(H.cacheKey(41.878104, -87.629796) === H.cacheKey(41.8781, -87.6298), 'a metre apart is the same key');
  ok(H.cacheKey(41.8782, -87.6298) !== H.cacheKey(41.8781, -87.6298), 'ten metres apart is not');
  ok(H.CACHE === 'parcel_cache' && H.CACHE_TTL_MS === 30 * 24 * 3600 * 1000, 'parcel_cache, thirty days');
  reset(); SCRIPT = [{ json: COOK_HIT }];
  out = await post(COOK);
  ok(out && out.ok === true && CALLS.length === 1 && same(WRITES, ['parcel_cache/41.87810_-87.62980']), 'a hit is written to parcel_cache/{key}');
  const row = DOCS['parcel_cache/41.87810_-87.62980'];
  ok(row && row.hit && row.hit.source === 'cook' && row.expiresAt > Date.now() && row.expiresAt <= Date.now() + H.CACHE_TTL_MS, 'with the hit and an expiry');
  /* Firestore refuses an array inside an array: the ring is kept flat, and comes back as it was */
  ok(row.hit.ring === undefined && Array.isArray(row.hit.ringFlat) && row.hit.ringFlat.length === out.ring.length * 2 && row.hit.ringFlat.every(function (v) { return typeof v === 'number'; }),
     'the ring is stored flat (no array inside an array, which Firestore refuses)');
  const back = H.unpackHit(H.packHit(out));
  ok(same(back.ring, out.ring) && back.apn === out.apn && same(Object.keys(back).sort(), Object.keys(out).sort()), 'and packs and unpacks to the same answer');
  SCRIPT = [];
  const again = await post({ lat: 41.878104, lng: -87.629796 });
  ok(again && again.ok === true && again.apn === out.apn && same(again.ring, out.ring) && CALLS.length === 0,
     'the same point again is served from the cache — nobody upstream is asked');
  ok(same(Object.keys(again).sort(), Object.keys(out).sort()), 'and comes back in the contract shape, nothing extra');
  DOCS['parcel_cache/41.87810_-87.62980'].expiresAt = Date.now() - 1; SCRIPT = [{ json: COOK_HIT }];
  out = await post(COOK);
  ok(out && out.ok === true && CALLS.length === 1, 'an expired row is not served');
  reset(); SCRIPT = [{ json: EMPTY }];
  out = await post(COOK);
  ok(out && out.ok === false && WRITES.length === 0, 'a miss is not cached');
  SCRIPT = [{ json: EMPTY }];
  out = await post(COOK);
  ok(out && out.ok === false && CALLS.length === 1, 'so the same point is asked again');
  reset({ 'omega_orgs/concordenergyusa.com': { status: 'suspended' },
          'parcel_cache/41.87810_-87.62980': { hit: { ok: true, ring: [[1, 1], [1, 2], [2, 2]], source: 'cook' }, expiresAt: Date.now() + 1e6 } });
  err = null;
  await post(COOK).catch(e => { err = e; });
  ok(err && err.status === 403, 'a suspended tenant is refused before the cache is read');
  reset(); SCRIPT = [{ json: COOK_HIT }];
  fakeAdmin.db = () => { throw new Error('no firestore'); };
  err = null; out = null;
  await post(COOK).then(o => { out = o; }, e => { err = e; });
  ok(err && !out && CALLS.length === 0, 'when the tenant record cannot be read the gate fails closed — an error, and nothing upstream is asked');
  fakeAdmin.db = fakeDb;

  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  CRASH ' + (e && e.stack || e)); process.exit(1); });
