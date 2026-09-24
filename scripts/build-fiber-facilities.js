#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/build-fiber-facilities.js — the places fiber already terminates
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────
   WHY A DATA-CENTER LAYER IS A FIBER LAYER
   ─────────────────────────────────────────────────────────────────────────
   You cannot buy a map of every fiber in the United States, and the ones you
   can buy are licensed per seat. But an operating data center is proof that
   carrier-grade fiber was pulled to that address and that somebody is selling
   capacity on it. For a site five miles away, the nearest operating facility
   is the most useful single fact available for free: it bounds the lateral,
   it names the metro the carriers already serve, and if it is a 300 MW
   campus it says the utility has been through this before.

   PeeringDB — which /api/network-proximity already queries live — is the
   better source where it has coverage, because net_count says how many
   carriers are actually in the building. But PeeringDB only holds facilities
   that chose to register. This fills the rest of the map, including the
   proposed and under-construction sites PeeringDB will never hold and which
   are exactly the comparables a developer is asking about.

   ─────────────────────────────────────────────────────────────────────────
   SOURCES AND THEIR TERMS — read before shipping
   ─────────────────────────────────────────────────────────────────────────
     Compute Atlas            CC BY 4.0. Attribution required and carried on
       (facilities.json)      every feature as `attrib`. 2,014 US records with
                              status, capacity, acreage and per-claim sources.
     Global Data Center Map   "Free to use for research, publications, and
       (datacenters.geojson)  products. Credit required." US subset only.
     CYBR Capstone            University capstone, Great Lakes region. Small,
       (DataCenters.geojson)  but carries street addresses.

   Deduplication is by distance and name, not by id: the three sets have no
   shared key. Compute Atlas wins a tie because its records are source-cited
   and carry capacity.

     node scripts/build-fiber-facilities.js [--src DIR]

   --src defaults to ~/Downloads, where the source repositories were cloned.
   This is a build script; it is never deployed. Re-run it when a source
   dataset is refreshed, then commit the two artefacts it writes.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argSrc = process.argv.indexOf('--src');
const SRC = argSrc > 0 ? process.argv[argSrc + 1]
                       : path.join(process.env.HOME || '', 'Downloads');

const P_ATLAS = path.join(SRC, 'compute-atlas-main', 'data', 'facilities.json');
const P_GLOBAL = path.join(SRC, 'Global-Data-Center-Map-main', 'datacenters.geojson');
const P_CYBR = path.join(SRC, 'CYBRCapstone-PhysicalInfrastructureMap-main', 'GeoJson', 'DataCenters.geojson');
const P_LANDING = path.join(SRC, 'aemkei_submarinecablemap-master', 'public', 'api', 'v2', 'landing-point');

const OUT_GEO = path.join(ROOT, 'data', 'us-datacenters.geojson');
const OUT_LIB = path.join(ROOT, 'api', '_lib', 'datacenters.js');
const OUT_LAND = path.join(ROOT, 'data', 'us-cable-landings.geojson');

/* Continental US plus Alaska and Hawaii, loosely. Keeps a mis-signed longitude
   from planting a Virginia data center in Kazakhstan. */
function inUS(lat, lon) {
  if (!isFinite(lat) || !isFinite(lon)) return false;
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) return true;   /* CONUS */
  if (lat >= 51 && lat <= 72 && lon >= -170 && lon <= -129) return true;  /* AK */
  if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return true;  /* HI */
  return false;
}
/* Sources disagree on how to write a state: Compute Atlas uses "CA", the
   Global Data Center Map uses "California", and some records carry neither.
   Downstream every filter and every count is by state, so normalise once here
   rather than in four places that will drift. */
var STATE_ABBR = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA',
  colorado:'CO', connecticut:'CT', delaware:'DE', 'district of columbia':'DC',
  florida:'FL', georgia:'GA', hawaii:'HI', idaho:'ID', illinois:'IL',
  indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY', louisiana:'LA',
  maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN',
  mississippi:'MS', missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV',
  'new hampshire':'NH', 'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY',
  'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK',
  oregon:'OR', pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC',
  'south dakota':'SD', tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT',
  virginia:'VA', washington:'WA', 'west virginia':'WV', wisconsin:'WI',
  wyoming:'WY', 'puerto rico':'PR'
};
function normState(s) {
  var v = String(s || '').trim();
  if (!v) return '';
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return STATE_ABBR[v.toLowerCase()] || v;
}

const R_MI = 3958.7613;
function distMi(lat1, lon1, lat2, lon2) {
  const p = Math.PI / 180;
  const s = Math.sin((lat2 - lat1) * p / 2) ** 2 +
            Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin((lon2 - lon1) * p / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}
/* Names arrive as "Equinix DC12", "EQUINIX - DC12 - 21715 Filigree Ct" and
   "Equinix Ashburn DC12". Strip to letters and digits and compare on the
   shorter one being contained in the longer. */
function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function sameFacility(a, b) {
  const d = distMi(a.lat, a.lon, b.lat, b.lon);
  if (d > 0.6) return false;                    /* different campus */
  const na = normName(a.name), nb = normName(b.name);
  if (!na || !nb) return d < 0.1;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 6 && long.indexOf(short) >= 0) return true;
  /* Same operator on the same block is the same campus. */
  const oa = normName(a.operator), ob = normName(b.operator);
  return !!oa && oa === ob && d < 0.25;
}
function round(n, dp) { const f = 10 ** dp; return Math.round(n * f) / f; }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function have(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }

/* ── source 1: Compute Atlas ────────────────────────────────────────────── */
function fromAtlas() {
  if (!have(P_ATLAS)) { console.warn('  skip Compute Atlas — not found at ' + P_ATLAS); return []; }
  const rows = readJson(P_ATLAS), out = [];
  for (const r of rows) {
    const L = r.location || {};
    const lat = Number(L.lat), lon = Number(L.lon);
    if (!inUS(lat, lon)) continue;
    const cap = r.capacityMw || {};
    const mw = cap.operational != null ? Number(cap.operational)
             : cap.planned != null ? Number(cap.planned) : null;
    out.push({
      lat: lat, lon: lon,
      name: r.name || '', operator: r.operator || '',
      city: L.city || '', state: normState(L.state), county: L.county || '',
      street: L.street || '',
      status: r.status || 'unknown',
      confidence: r.confidence || null,
      mw: isFinite(mw) ? mw : null,
      mwBasis: cap.operational != null ? 'operational' : (cap.planned != null ? 'planned' : null),
      acres: r.landAcres != null ? Number(r.landAcres) : null,
      kind: r.facilityType || 'data_center',
      src: 'compute-atlas',
      attrib: 'Compute Atlas (CC BY 4.0)'
    });
  }
  console.log('  Compute Atlas: ' + out.length + ' US records');
  return out;
}

/* ── source 2: Global Data Center Map (ATLAS) ───────────────────────────── */
function fromGlobal() {
  if (!have(P_GLOBAL)) { console.warn('  skip Global Data Center Map — not found'); return []; }
  const fc = readJson(P_GLOBAL), out = [];
  for (const f of fc.features || []) {
    const g = f.geometry, p = f.properties || {};
    if (!g || g.type !== 'Point') continue;
    const lon = Number(g.coordinates[0]), lat = Number(g.coordinates[1]);
    if (!inUS(lat, lon)) continue;
    if (p.country && !/united states|^us$|^usa$/i.test(String(p.country))) continue;
    out.push({
      lat: lat, lon: lon,
      name: p.name || '', operator: p.company || '',
      city: p.city || '', state: normState(p.state), county: '',
      street: p.address || '',
      status: 'operational', confidence: null, mw: null, mwBasis: null, acres: null,
      kind: 'data_center',
      src: 'global-dc-map',
      attrib: 'Global Data Center Map / ATLAS (credit required)'
    });
  }
  console.log('  Global Data Center Map: ' + out.length + ' US records');
  return out;
}

/* ── source 3: CYBR capstone ────────────────────────────────────────────── */
function fromCybr() {
  if (!have(P_CYBR)) { console.warn('  skip CYBR capstone — not found'); return []; }
  const fc = readJson(P_CYBR), out = [];
  for (const f of fc.features || []) {
    const g = f.geometry, p = f.properties || {};
    if (!g) continue;
    /* Points here are sometimes MultiPoint; take the first vertex either way. */
    const c = g.type === 'Point' ? g.coordinates
            : g.type === 'MultiPoint' ? g.coordinates[0] : null;
    if (!c) continue;
    const lon = Number(c[0]), lat = Number(c[1]);
    if (!inUS(lat, lon)) continue;
    out.push({
      lat: lat, lon: lon,
      name: p.Name || p.Company || '', operator: p.Company || '',
      city: p.City || '', state: normState(p.Region), county: '',
      street: p.Address || '',
      status: 'operational', confidence: null, mw: null, mwBasis: null, acres: null,
      kind: 'data_center',
      src: 'cybr-capstone',
      attrib: 'CYBR Capstone Physical Infrastructure Map'
    });
  }
  console.log('  CYBR capstone: ' + out.length + ' US records');
  return out;
}

/* ── merge ──────────────────────────────────────────────────────────────── */
/* A 0.6 mi dedupe radius against 5,000 points is 12.5 M comparisons if done
   naively. Bucket by hundredth of a degree (~0.7 mi) and compare only the
   nine neighbouring buckets. */
function mergeAll(sets) {
  const grid = new Map(), out = [];
  const cell = (lat, lon) => Math.round(lat * 100) + ':' + Math.round(lon * 100);
  let merged = 0;
  for (const rows of sets) {
    for (const r of rows) {
      const ci = Math.round(r.lat * 100), cj = Math.round(r.lon * 100);
      let hit = null;
      for (let di = -1; di <= 1 && !hit; di++) {
        for (let dj = -1; dj <= 1 && !hit; dj++) {
          const bucket = grid.get((ci + di) + ':' + (cj + dj));
          if (!bucket) continue;
          for (const other of bucket) if (sameFacility(r, other)) { hit = other; break; }
        }
      }
      if (hit) {
        merged++;
        /* Keep the richer record; record that a second source saw it, which is
           itself a confidence signal. */
        hit.alsoIn = hit.alsoIn || [];
        if (hit.alsoIn.indexOf(r.src) < 0 && hit.src !== r.src) hit.alsoIn.push(r.src);
        if (hit.mw == null && r.mw != null) { hit.mw = r.mw; hit.mwBasis = r.mwBasis; }
        if (!hit.street && r.street) hit.street = r.street;
        if (!hit.county && r.county) hit.county = r.county;
        if (!hit.state && r.state) hit.state = r.state;
        if (!hit.city && r.city) hit.city = r.city;
        if (!hit.operator && r.operator) hit.operator = r.operator;
        continue;
      }
      out.push(r);
      const k = cell(r.lat, r.lon);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(r);
    }
  }
  console.log('  merged ' + merged + ' duplicate records across sources');
  return out;
}

/* ── submarine cable landing points ─────────────────────────────────────── */
/* Kept in its own file and left OFF by default in the map. The coordinates of
   a landing station are a fact, but this compilation is TeleGeography's
   commercial research product and the repository it came from is a mirror of
   their public API. Confirm redistribution terms before this ships to a
   tenant. It is here because for a site on either coast the nearest landing
   station is the difference between a transit bill and a transport bill. */
function buildLandings() {
  if (!have(P_LANDING)) { console.warn('  skip cable landings — not found'); return 0; }
  const files = fs.readdirSync(P_LANDING).filter(f => /united-states\.json$/.test(f));
  const feats = [];
  for (const f of files) {
    let d; try { d = readJson(path.join(P_LANDING, f)); } catch (e) { continue; }
    const lat = Number(d.latitude), lon = Number(d.longitude);
    if (!inUS(lat, lon)) continue;
    if (String(d.is_tbd) === 'true') continue;          /* announced, no site yet */
    const cables = (d.cables || []).map(c => c.name).filter(Boolean);
    feats.push({
      type: 'Feature',
      properties: {
        id: d.id, name: String(d.name || '').replace(/, United States$/, ''),
        cables: cables.join(', '), cableCount: cables.length,
        meta: cables.length + ' submarine cable' + (cables.length === 1 ? '' : 's') +
              (cables.length ? ' · ' + cables.slice(0, 4).join(', ') +
                               (cables.length > 4 ? ' +' + (cables.length - 4) + ' more' : '') : ''),
        attrib: 'TeleGeography Submarine Cable Map'
      },
      geometry: { type: 'Point', coordinates: [round(lon, 5), round(lat, 5)] }
    });
  }
  feats.sort((a, b) => b.properties.cableCount - a.properties.cableCount);
  fs.writeFileSync(OUT_LAND, JSON.stringify({
    type: 'FeatureCollection',
    name: 'US submarine cable landing points',
    generated: new Date().toISOString().slice(0, 10),
    note: 'Landing stations on US soil. Source: TeleGeography Submarine Cable Map. ' +
          'LICENCE NOT CLEARED for redistribution — this layer is off by default and ' +
          'must not be shipped to a tenant until the terms are confirmed with TeleGeography.',
    features: feats
  }));
  console.log('  cable landings: ' + feats.length + ' US points — LICENCE UNCLEARED, off by default');
  return feats.length;
}

/* ── main ───────────────────────────────────────────────────────────────── */
(function main() {
  console.log('sources under ' + SRC);
  const rows = mergeAll([fromAtlas(), fromGlobal(), fromCybr()]);
  if (!rows.length) { console.error('no records — check --src'); process.exit(1); }

  rows.sort((a, b) => (b.mw || 0) - (a.mw || 0) || a.state.localeCompare(b.state));

  const feats = rows.map((r, i) => {
    const bits = [];
    if (r.operator) bits.push(r.operator);
    if (r.mw != null) bits.push(r.mw + ' MW ' + (r.mwBasis || ''));
    if (r.status && r.status !== 'operational') bits.push(r.status.replace(/_/g, ' '));
    if (r.acres != null) bits.push(r.acres + ' ac');
    return {
      type: 'Feature',
      properties: {
        id: 'dc-' + String(i + 1).padStart(4, '0'),
        name: r.name, operator: r.operator,
        city: r.city, state: r.state, county: r.county, street: r.street,
        status: r.status, mw: r.mw, mwBasis: r.mwBasis, acres: r.acres,
        confidence: r.confidence, kind: r.kind,
        src: r.src, alsoIn: (r.alsoIn || []).join(','), attrib: r.attrib,
        meta: bits.join(' · ') || 'data center'
      },
      geometry: { type: 'Point', coordinates: [round(r.lon, 5), round(r.lat, 5)] }
    };
  });

  fs.mkdirSync(path.dirname(OUT_GEO), { recursive: true });
  fs.writeFileSync(OUT_GEO, JSON.stringify({
    type: 'FeatureCollection',
    name: 'US data centers and compute facilities',
    generated: new Date().toISOString().slice(0, 10),
    note: 'Merged from Compute Atlas (CC BY 4.0), Global Data Center Map (credit ' +
          'required) and the CYBR Capstone infrastructure map. Attribution is on ' +
          'every feature as `attrib` and must be shown wherever the layer is drawn. ' +
          'An operating facility is evidence that carrier fiber terminates there; it ' +
          'is not a statement about spare capacity, and a proposed site is not a built one.',
    features: feats
  }));
  console.log('wrote data/us-datacenters.geojson  ' +
              (fs.statSync(OUT_GEO).size / 1024).toFixed(0) + ' KB  (' + feats.length + ' facilities)');

  /* The function's copy: operating and under-construction only, and only the
     fields the fiber verdict reads. A proposed campus proves nothing about
     fiber being in the ground today.

     KIND MATTERS AND IS NOT COSMETIC. Compute Atlas tracks the generation
     built to feed these campuses alongside the campuses themselves, so a
     232-row slice of this dataset is wind farms and gas peakers. A wind farm
     is evidence about power, not about fiber, and letting one answer "nearest
     operating compute facility" is how a site in Tunica reports a data center
     13 miles away that is a turbine field. Coded as an int because the column
     repeats 3,000 times: 0 data center, 1 crypto mining, 2 power generation. */
  const KIND_CODE = { data_center: 0, crypto_mining: 1, power_generation: 2 };
  const live = rows.filter(r => r.status === 'operational' || r.status === 'under_construction');
  const compact = live.map(r => [
    round(r.lat, 4), round(r.lon, 4),
    (r.name || r.operator || 'Data center').slice(0, 60),
    r.operator.slice(0, 40),
    r.mw != null ? r.mw : null,
    r.status === 'operational' ? 1 : 0,
    KIND_CODE[r.kind] != null ? KIND_CODE[r.kind] : 0
  ]);
  fs.writeFileSync(OUT_LIB,
`/* GENERATED by scripts/build-fiber-facilities.js on ${new Date().toISOString().slice(0, 10)} — do not edit.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Operating and under-construction US compute facilities, for the nearest-
   facility measurement in /api/network-proximity. Proposed sites are excluded:
   an announcement is not fiber in the ground.

   Rows are [lat, lon, name, operator, mw, operational, kind] — an array and
   not an object because there are ${compact.length} of them and the serverless
   bundle pays for every repeated key. kind: 0 data center, 1 crypto mining,
   2 power generation. Callers asking "is there compute here" must exclude 2;
   it is in the set because Compute Atlas tracks the generation built to feed
   these campuses, and that is a power fact, not a fiber one.

   Sources: Compute Atlas (CC BY 4.0); Global Data Center Map (credit required);
   CYBR Capstone. Attribution is carried in ATTRIB and must be rendered wherever
   these records are shown. */
'use strict';
exports.ATTRIB = 'Compute Atlas (CC BY 4.0), Global Data Center Map, CYBR Capstone';
exports.KIND = ['data_center', 'crypto_mining', 'power_generation'];
exports.ROWS = ${JSON.stringify(compact)};
`);
  const kinds = compact.reduce((m, r) => { m[r[6]] = (m[r[6]] || 0) + 1; return m; }, {});
  console.log('wrote api/_lib/datacenters.js  ' +
              (fs.statSync(OUT_LIB).size / 1024).toFixed(0) + ' KB  (' + compact.length + ' live: ' +
              (kinds[0] || 0) + ' data centers, ' + (kinds[1] || 0) + ' crypto, ' +
              (kinds[2] || 0) + ' generation)');

  buildLandings();

  const byState = {};
  rows.forEach(r => { byState[r.state || '??'] = (byState[r.state || '??'] || 0) + 1; });
  const top = Object.keys(byState).sort((a, b) => byState[b] - byState[a]).slice(0, 10);
  console.log('\ntop states: ' + top.map(s => s + ' ' + byState[s]).join(', '));
  console.log('with capacity stated: ' + rows.filter(r => r.mw != null).length);
})();
