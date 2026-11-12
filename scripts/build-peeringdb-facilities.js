#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/build-peeringdb-facilities.js — the carrier-hotel layer's data
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS
   ─────────────────────────────────────────────────────────────────────────
   Grid Atlas's "Carrier Hotels" layer (`carrierhotels` in grid-atlas.html)
   has pointed at /data/peeringdb-facilities.geojson since it was written,
   and that file was never built — the layer has been silently empty, the
   same failure the backbone layer had before scripts/build-fiber-backbone.js.
   This builds it.

   The live `ixp` / `colo` layers already ask PeeringDB in the browser, but
   only for the current map view, only while the API answers, and with no
   data committed for the render checks. This is the same facility set as a
   bundled national snapshot: it works offline, it never rate-limits a
   tenant's browser, and `net_count` — how many networks are actually in the
   building — is the one free number that says whether an address is a
   carrier hotel or a closet.

   ─────────────────────────────────────────────────────────────────────────
   SOURCE AND TERMS
   ─────────────────────────────────────────────────────────────────────────
   PeeringDB facilities (https://api.peeringdb.com/api/fac?country=US).
   PeeringDB publishes its database under CC0-1.0 / CC-BY-4.0 terms per its
   Data Ownership Policy (https://docs.peeringdb.com/aup/ and
   https://docs.peeringdb.com/howto/copyright/). Attribution is carried on
   every feature as `attrib` and rendered in the popup. Re-verify the policy
   before any tenant-facing claim beyond the map layer.

   Anonymous calls are rate-limited; set PEERINGDB_API_KEY to authenticate
   (a free account key). Records without coordinates are dropped and counted
   — a facility PeeringDB cannot place is not drawn at 0,0.

     node scripts/build-peeringdb-facilities.js [--dry]

   Writes data/peeringdb-facilities.geojson (committed — re-run to refresh,
   then commit the artefact). This is a build script; it is never deployed.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'peeringdb-facilities.geojson');
const DRY = process.argv.indexOf('--dry') > 0;
const API = 'https://api.peeringdb.com/api/fac?country=US&limit=0';

function get(url) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'omega-core build script', Accept: 'application/json' };
    if (process.env.PEERINGDB_API_KEY) headers.Authorization = 'Api-Key ' + process.env.PEERINGDB_API_KEY;
    https.get(url, { headers }, (res) => {
      if (res.statusCode !== 200) { reject(new Error('PeeringDB answered HTTP ' + res.statusCode)); res.resume(); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

/* One facility record → the feature the carrierhotels layer reads.
   Property names match what grid-atlas.html already reads off this layer
   (name, operator, city, state, networks) — the layer predates the file, so
   the file conforms to the layer, not the other way round. */
function facFeature(r) {
  const lat = parseFloat(r.latitude), lon = parseFloat(r.longitude);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < 17 || lat > 72 || lon < -180 || lon > -60) return null; /* US incl. AK/HI/PR */
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [+lon.toFixed(6), +lat.toFixed(6)] },
    properties: {
      id: 'pdb-fac-' + r.id,
      source: 'peeringdb',
      name: r.name || 'Facility',
      operator: r.org_name || null,
      address: [r.address1, r.address2].filter(Boolean).join(', ') || null,
      city: r.city || null,
      state: r.state || null,
      zip: r.zipcode || null,
      country: r.country || 'US',
      networks: +r.net_count || 0,           /* carriers on-net — the density number */
      ix_count: +r.ix_count || 0,            /* internet exchanges present */
      website: r.website || null,
      updated: r.updated || null,
      attrib: 'PeeringDB'
    }
  };
}

(async function main() {
  console.log('Fetching ' + API + (process.env.PEERINGDB_API_KEY ? ' (authenticated)' : ' (anonymous — set PEERINGDB_API_KEY if throttled)'));
  const json = await get(API);
  const rows = (json && json.data) || [];
  if (!rows.length) throw new Error('PeeringDB returned no facilities — refusing to write an empty layer.');

  let dropped = 0;
  const feats = [];
  for (const r of rows) {
    const f = facFeature(r);
    if (f) feats.push(f); else dropped++;
  }
  if (feats.length < 1000) throw new Error('Only ' + feats.length + ' placeable US facilities — a full pull is thousands. Refusing a partial snapshot.');
  feats.sort((a, b) => (b.properties.networks - a.properties.networks) || (a.properties.id < b.properties.id ? -1 : 1));

  const fc = {
    type: 'FeatureCollection',
    name: 'PeeringDB US facilities (carrier hotels / colo / data centers)',
    omegaSource: {
      source: 'peeringdb',
      api: API,
      as_of: new Date().toISOString().slice(0, 10),
      attribution: 'PeeringDB (https://www.peeringdb.com) — re-verify current data terms before tenant-facing use beyond the map',
      feature_count: feats.length,
      dropped_no_coordinates: dropped,
      note: 'net_count (networks) is how many networks registered presence in the building — a connectivity-density proxy, not a statement of dark-fiber availability. PeeringDB holds facilities that chose to register; absence from this layer is not absence of a facility.'
    },
    features: feats
  };

  console.log(feats.length + ' facilities with coordinates (' + dropped + ' dropped without), top of list: ' +
    feats.slice(0, 3).map((f) => f.properties.name + ' (' + f.properties.networks + ' nets)').join(' · '));
  if (DRY) { console.log('--dry: not writing ' + OUT); return; }
  fs.writeFileSync(OUT, JSON.stringify(fc));
  console.log('Wrote ' + OUT + ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
