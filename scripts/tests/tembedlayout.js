/* /api/embed-layout.js — the gate on the one metered call the public can cause.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The geometry has its own suite (scripts/test-site-fit.js). This is about the
   WIRING, which is where money leaks:

     · a lookup without a named lead behind it
     · a lookup that does not count against the daily cap
     · a CACHE HIT that consumes somebody's allowance anyway
     · one tenant's order id unlocking another tenant's lookups
     · a parcel record's OWNER NAME reaching a public page

   _lib/admin is stood in for the way tparcel.js does it, and fetch is
   scripted, so nothing upstream is ever asked and no credential is needed. */
'use strict';
const path = require('path');

let fails = 0;
function ok(c, m, got) {
  if (!c) { fails++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
  else console.log('  ok   ' + m);
}

/* ── a Firestore of plain paths, with transactions ───────────────────── */
let DOCS = {}, WRITES = [];
function fakeDb() {
  const col = base => ({
    doc: id => {
      const p = base + '/' + id;
      return {
        get: () => Promise.resolve({ exists: !!DOCS[p], id, data: () => DOCS[p] }),
        set: (d, o) => { WRITES.push(p); DOCS[p] = (o && o.merge) ? Object.assign({}, DOCS[p], d) : d; return Promise.resolve(); },
        update: d => { WRITES.push(p); DOCS[p] = Object.assign({}, DOCS[p], d); return Promise.resolve(); },
        collection: name => col(p + '/' + name)
      };
    },
    where: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ get: () => Promise.resolve({ empty: true, docs: [] }) }) }) }),
                    orderBy: () => ({ limit: () => ({ get: () => Promise.resolve({ empty: true, docs: [] }) }) }),
                    limit: () => ({ get: () => Promise.resolve({ empty: true, docs: [] }) }) })
  });
  return {
    collection: name => col(name),
    /* Runs the body immediately against the same store — enough to prove the
       counter increments and the cap refuses. */
    runTransaction: fn => Promise.resolve().then(() => fn({
      get: ref => ref.get(),
      set: (ref, d, o) => ref.set(d, o)
    }))
  };
}
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: () => Promise.reject(Object.assign(new Error('not used'), { status: 401 })),
  db: fakeDb,
  isDegraded: () => false,
  FieldValue: () => ({ serverTimestamp: () => 'TS' }),
  billingOf: org => Promise.resolve(DOCS['omega_orgs/' + org + '/billing/current'] || { tier: 'standard' }),
  canActInOrg: () => Promise.resolve(false),
  isTenantAdmin: () => Promise.resolve(false),
  orgOf: e => String(e || '').split('@')[1] || ''
};
const libPath = require.resolve(path.join(__dirname, '..', '..', 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: fakeAdmin };

/* ── a scripted fetch, so no county layer or geocoder is ever asked ──── */
let CALLS = [];
/* A 400 ft square INSIDE COOK COUNTY's bbox. The point matters: api/parcel.js
   only asks a county layer whose extent contains it, and a point in open
   Illinois farmland asks nobody and returns "no parcel" — which looked like a
   broken study rather than a fixture in the wrong place. */
const LAT0 = 41.85, LNG0 = -87.65;
const D_LAT = 400 / 364000;
const D_LNG = 400 / (364000 * Math.cos(LAT0 * Math.PI / 180));
let RING = [[LAT0, LNG0], [LAT0, LNG0 + D_LNG], [LAT0 + D_LAT, LNG0 + D_LNG], [LAT0 + D_LAT, LNG0]];
const CACHE_KEY = 'parcel_cache/' + LAT0.toFixed(5) + '_' + LNG0.toFixed(5);
global.fetch = function (url) {
  CALLS.push(String(url));
  if (/geocoding\.geo\.census\.gov/.test(url)) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      result: { addressMatches: [{ coordinates: { y: LAT0, x: LNG0 }, matchedAddress: '1 TEST DR, SPRINGFIELD, IL' }] }
    }) });
  }
  if (/nominatim/.test(url)) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  /* A county ArcGIS answer carrying an OWNER NAME, which must not come out. */
  return Promise.resolve({ ok: true, json: () => Promise.resolve({
    features: [{
      attributes: { PIN: '99-99-999', OWNER: 'A REAL PERSON WHO DID NOT ASK', ZONING: 'M-1' },
      geometry: { rings: [RING.map(p => [p[1], p[0]])] }
    }]
  }) });
};

const ORG = 'cleancell.us';
const KEY = 'omega_pk_live_' + 'a'.repeat(32);
const PRODUCT = { sku: 'CC-500', name: 'CleanCell 500', kw: 250, kwh: 500, widthFt: 20, depthFt: 8, priceMode: 'quote' };

function reset(extra) {
  DOCS = Object.assign({
    ['embed_keys/' + KEY]: { orgId: ORG, active: true, origins: ['https://cleancell.us'], scopes: ['storefront'], label: 'test' },
    ['omega_orgs/' + ORG]: { name: 'Clean Cell', status: 'active', whiteLabel: { enabled: true, embed: {} } },
    ['omega_orgs/' + ORG + '/billing/current']: { tier: 'deluxe', addons: ['whitelabel'], toolOverrides: {} },
    ['omega_orgs/' + ORG + '/storefront/config']: {
      products: [PRODUCT], siteStudy: true, requireContactForLayout: true,
      setbackFt: 20, clearanceFt: 5, aisleFt: 20, rowsPerBlock: 2, dailyParcelCap: 2
    },
    'orders/lead1': { orgId: ORG, status: 'new', customer: { name: 'A', email: 'a@b.com' },
                      createdAt: { toDate: () => new Date() } },
    'orders/otherorg': { orgId: 'someoneelse.com', status: 'new',
                         createdAt: { toDate: () => new Date() } },
    'orders/stale': { orgId: ORG, status: 'new',
                      createdAt: { toDate: () => new Date(Date.now() - 48 * 3600 * 1000) } }
  }, extra || {});
  WRITES = []; CALLS = [];
  /* The limiter's bucket is module state and this suite makes far more calls
     per key than a minute's allowance. Cleared per case so a 429 in the
     output means the case under test asked for one. */
  require(path.join(__dirname, '..', '..', 'api', '_lib', 'embed.js'))._resetLimits();
}

delete process.env.REGRID_TOKEN;
const layout = require(path.join(__dirname, '..', '..', 'api', 'embed-layout.js'));

function call(body, headers) {
  const res = { setHeader: () => {}, headersSent: false, status: () => res, json: () => res, end: () => res };
  return Promise.resolve()
    .then(() => layout({ method: 'POST', body, query: {}, headers: Object.assign({
      'x-omega-embed-key': KEY, 'x-omega-parent': 'https://cleancell.us'
    }, headers || {}) }, res))
    .then(out => ({ ok: true, out }), err => ({ ok: false, status: err.status, msg: err.message }));
}

const BASE = { sku: 'CC-500', address: '1 Test Dr, Springfield IL', system: { kw: 600, kwh: 2400 }, orderId: 'lead1' };

(async function () {
  console.log('/api/embed-layout — the gate on the metered call');

  /* ── 1 · the happy path ─────────────────────────────────────────────── */
  reset();
  let r = await call(BASE);
  ok(r.ok, 'a named lead gets a study', r.msg);
  if (r.ok) {
    const o = r.out;
    ok(o.found === true, 'the parcel was found');
    ok(o.packing && o.packing.unitsNeeded === 5, '2400 kWh at 500 kWh/unit needs 5 units', o.packing && o.packing.unitsNeeded);
    ok(o.packing.unitsDrawn === 5, 'and exactly 5 are drawn', o.packing.unitsDrawn);
    ok(Array.isArray(o.parcel) && o.parcel.length >= 3, 'the parcel ring came back for drawing');
    ok(o.usable && o.usable.w > 0, 'a yard was proposed', o.usable);
    ok((o.unverified || []).length >= 5, 'the unverified list is attached');
    ok(o.assumptions.setbackFt === 20, 'the tenant setback was used, not a default', o.assumptions.setbackFt);

    /* THE ONE THAT MATTERS MOST. */
    const blob = JSON.stringify(o);
    ok(!/A REAL PERSON/.test(blob), 'the parcel owner name is NOT echoed to the public page');
    ok(!/99-99-999/.test(blob), 'the APN is NOT echoed either');
    ok(/M-1/.test(blob), 'zoning IS echoed — it is about the land, not the person');

    /* The study must land on the lead, from the server's own numbers, so
       whoever rings this customer knows what they were shown. */
    const lead = DOCS['orders/lead1'];
    ok(lead && lead.siteStudy, 'the study is recorded on the lead', lead && Object.keys(lead));
    if (lead && lead.siteStudy) {
      ok(lead.siteStudy.unitsNeeded === 5, 'and carries the unit count', lead.siteStudy.unitsNeeded);
      ok(lead.siteStudy.fits === true, 'and whether it fit', lead.siteStudy.fits);
      ok(lead.siteStudy.acres > 3 && lead.siteStudy.acres < 4, 'and the lot size', lead.siteStudy.acres);
      ok(lead.siteStudy.setbackFt === 20, 'and the setback it was drawn at', lead.siteStudy.setbackFt);
      ok(!/A REAL PERSON/.test(JSON.stringify(lead.siteStudy)),
         'and STILL no owner name, even on our own internal row');
    }
  }

  /* No receipt, no recording: a study run with the contact gate off has no
     lead to attach to and must not invent one. */
  reset({ ['omega_orgs/' + ORG + '/storefront/config']:
    { products: [PRODUCT], siteStudy: true, requireContactForLayout: false, setbackFt: 20, clearanceFt: 5 } });
  await call({ sku: 'CC-500', address: '1 Test Dr', system: { kwh: 2400 } });
  ok(!DOCS['orders/lead1'].siteStudy, 'with no receipt, nothing is written to any order',
     DOCS['orders/lead1'].siteStudy);

  /* ── 2 · no lead, no lookup ─────────────────────────────────────────── */
  reset();
  r = await call(Object.assign({}, BASE, { orderId: '' }));
  ok(!r.ok && r.status === 403, 'without an enquiry receipt it refuses', r);
  ok(CALLS.length === 0, 'and nothing upstream was asked', CALLS);

  reset();
  r = await call(Object.assign({}, BASE, { orderId: 'otherorg' }));
  ok(!r.ok && r.status === 403, "another tenant's order id does not unlock a lookup", r);
  ok(CALLS.length === 0, 'and nothing upstream was asked for it either', CALLS);

  reset();
  r = await call(Object.assign({}, BASE, { orderId: 'stale' }));
  ok(!r.ok && r.status === 410, 'a day-old receipt is expired', r);

  reset();
  r = await call(Object.assign({}, BASE, { orderId: 'nosuch' }));
  ok(!r.ok && r.status === 403, 'an invented order id refuses', r);

  /* requireContactForLayout: false is the opt-out, and it must actually work. */
  reset({ ['omega_orgs/' + ORG + '/storefront/config']:
    { products: [PRODUCT], siteStudy: true, requireContactForLayout: false, setbackFt: 20, clearanceFt: 5 } });
  r = await call({ sku: 'CC-500', address: '1 Test Dr', system: { kwh: 2400 } });
  ok(r.ok, 'with the contact gate off, no receipt is needed', r.msg);

  /* ── 3 · the daily cap ──────────────────────────────────────────────── */
  reset();
  await call(BASE);
  let counters = DOCS['omega_orgs/' + ORG + '/storefront/counters'];
  ok(counters && counters.parcelLookups === 1, 'a miss counts against the cap', counters);

  /* Cap is 2 in the fixture. A third DISTINCT point must be refused. */
  reset({ ['omega_orgs/' + ORG + '/storefront/counters']:
    { parcelDay: new Date().toISOString().slice(0, 10), parcelLookups: 2 } });
  r = await call(BASE);
  ok(!r.ok && r.status === 429, 'the daily cap refuses once spent', r);
  ok(CALLS.filter(u => !/census|nominatim/.test(u)).length === 0,
     'and no parcel source was asked after the cap', CALLS);

  /* Yesterday's count must not carry over. */
  reset({ ['omega_orgs/' + ORG + '/storefront/counters']:
    { parcelDay: '2020-01-01', parcelLookups: 99 } });
  r = await call(BASE);
  ok(r.ok, "yesterday's count does not spend today's allowance", r.msg);

  /* ── 4 · a cache hit is free ────────────────────────────────────────── */
  reset({ [CACHE_KEY]: {
    hit: { ok: true, ring: RING, zoning: 'M-1', county: 'Test', source: 'cook',
           owner: 'A REAL PERSON WHO DID NOT ASK', apn: '99-99-999' },
    expiresAt: Date.now() + 1e9 } });
  r = await call(BASE);
  ok(r.ok && r.out.found === true, 'a cached parcel still produces a study', r.msg);
  counters = DOCS['omega_orgs/' + ORG + '/storefront/counters'];
  ok(!counters || !counters.parcelLookups, 'a CACHE HIT does not spend the allowance', counters);
  ok(CALLS.filter(u => !/census|nominatim/.test(u)).length === 0,
     'and asks no parcel source', CALLS);
  ok(!/A REAL PERSON/.test(JSON.stringify(r.out)), 'a cached owner name is not echoed either');

  /* A supplied point skips the geocoder entirely. */
  reset({ [CACHE_KEY]: {
    hit: { ok: true, ring: RING, source: 'cook' }, expiresAt: Date.now() + 1e9 } });
  r = await call(Object.assign({}, BASE, { address: undefined, lat: LAT0, lng: LNG0 }));
  ok(r.ok, 'a lat/lng is accepted directly (dragging the yard must not re-geocode)', r.msg);
  ok(CALLS.length === 0, 'and no geocoder was asked', CALLS);

  /* ── 5 · refusals that are about the catalogue, not the customer ────── */
  reset();
  r = await call(Object.assign({}, BASE, { sku: 'NOPE' }));
  ok(!r.ok && r.status === 422 && /not in this catalogue/i.test(r.msg), 'an unknown sku refuses', r);

  reset({ ['omega_orgs/' + ORG + '/storefront/config']:
    { products: [{ sku: 'CC-500', name: 'No footprint', kw: 250, kwh: 500 }],
      siteStudy: true, requireContactForLayout: false } });
  r = await call({ sku: 'CC-500', address: '1 Test Dr', system: { kwh: 2400 } });
  ok(!r.ok && r.status === 422 && /footprint/i.test(r.msg),
     'a product with no footprint refuses rather than drawing a default size', r);

  reset({ ['omega_orgs/' + ORG + '/storefront/config']:
    { products: [PRODUCT], siteStudy: false } });
  r = await call(BASE);
  ok(!r.ok && r.status === 403, 'siteStudy:false switches the whole feature off', r);

  /* ── 6 · a parcel that is not there ─────────────────────────────────── */
  reset();
  const realFetch = global.fetch;
  global.fetch = function (url) {
    CALLS.push(String(url));
    if (/census/.test(url)) return realFetch(url);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ features: [] }) });
  };
  r = await call(BASE);
  ok(r.ok && r.out.found === false, 'no parcel record is an ANSWER, not an error', r);
  ok(r.ok && /could not find a parcel/i.test(r.out.reason || ''), 'and says so plainly', r.out && r.out.reason);
  ok(r.ok && (r.out.unverified || []).length > 0, 'and still carries the unverified list');
  global.fetch = realFetch;

  /* ── 7 · the key still gates everything ─────────────────────────────── */
  reset();
  r = await call(BASE, { 'x-omega-embed-key': '' });
  ok(!r.ok && r.status === 401, 'no key is a 401', r);

  reset();
  r = await call(BASE, { 'x-omega-parent': 'https://evilcleancell.us' });
  ok(!r.ok && r.status === 403, 'a lookalike parent origin is refused', r);

  reset({ ['embed_keys/' + KEY]: { orgId: ORG, active: false, origins: [], scopes: ['storefront'] } });
  r = await call(BASE);
  ok(!r.ok && r.status === 403, 'a disabled key is refused', r);

  reset({ ['omega_orgs/' + ORG + '/billing/current']: { tier: 'standard', addons: [], toolOverrides: { whitelabel: false } } });
  r = await call(BASE);
  ok(!r.ok && r.status === 403, 'an unentitled account is refused', r);

  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
