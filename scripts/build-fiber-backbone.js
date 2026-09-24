#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/build-fiber-backbone.js — turn the corridor tables into geometry
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Reads scripts/fiber-corridors.js and writes two artefacts:

     data/us-longhaul-fiber.geojson    full detail, for the map layer
     api/_lib/longhaul-corridors.js    simplified, for /api/network-proximity

   Two files because they answer different questions. The map wants the bends;
   the function wants "how far is this parcel from the nearest corridor", and
   a 40 m deviation in the drawn line cannot change an answer reported to the
   nearest tenth of a mile. Shipping the full geometry into the serverless
   bundle would cost megabytes to buy nothing.

   HOW A LINK BECOMES A LINE
   Each city pair is routed over the road network by OSRM. Long-haul fiber is
   laid in transportation rights-of-way, so the driving route between two
   cities is a far better proxy for where the conduit runs than the chord
   between them. Where OSRM cannot answer, the chord is used and the feature
   is marked routed:false — visible in the map legend and in the function's
   evidence line, because a straight line across Nevada is a guess and should
   look like one.

   Responses are cached under scripts/.cache/osrm/ (git-ignored). A re-run
   after an edit to the tables costs only the links that changed.

     node scripts/build-fiber-backbone.js            # build, using the cache
     node scripts/build-fiber-backbone.js --fresh    # ignore the cache
     node scripts/build-fiber-backbone.js --offline  # chords only, no network
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const T = require('./fiber-corridors.js');

const ROOT      = path.join(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache', 'osrm');
const OUT_GEO   = path.join(ROOT, 'data', 'us-longhaul-fiber.geojson');
const OUT_LIB   = path.join(ROOT, 'api', '_lib', 'longhaul-corridors.js');

const OSRM      = process.env.OSRM_BASE || 'https://router.project-osrm.org';
const PAUSE_MS  = Number(process.env.OSRM_PAUSE || 1100);  /* be a good citizen */
const TRIES     = 3;

const FRESH   = process.argv.indexOf('--fresh')   >= 0;
const OFFLINE = process.argv.indexOf('--offline') >= 0;

/* ── geometry helpers ───────────────────────────────────────────────────── */
const R_MI = 3958.7613;
function distMi(a, b) {                       /* a,b are [lon,lat] */
  const p = Math.PI / 180;
  const dLat = (b[1] - a[1]) * p, dLon = (b[0] - a[0]) * p;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a[1] * p) * Math.cos(b[1] * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}
function lengthMi(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distMi(coords[i - 1], coords[i]);
  return m;
}
/* Perpendicular distance in degrees, scaled so a degree of longitude counts
   the same as a degree of latitude at this latitude. Good enough for a
   simplification tolerance; nothing downstream measures with it. */
function perpDeg(p, a, b, kx) {
  const px = (p[0] - a[0]) * kx, py = p[1] - a[1];
  const bx = (b[0] - a[0]) * kx, by = b[1] - a[1];
  const len2 = bx * bx + by * by;
  if (!len2) return Math.hypot(px, py);
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - bx * t, py - by * t);
}
function simplify(coords, tolDeg) {
  if (coords.length < 3) return coords.slice();
  const kx = Math.cos(coords[0][1] * Math.PI / 180);
  const keep = new Array(coords.length).fill(false);
  keep[0] = keep[coords.length - 1] = true;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let far = -1, fd = tolDeg;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDeg(coords[i], coords[lo], coords[hi], kx);
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = true; stack.push([lo, far], [far, hi]); }
  }
  return coords.filter((_, i) => keep[i]);
}
function round(coords, dp) {
  const f = 10 ** dp;
  return coords.map(c => [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f]);
}

/* ── dedupe: one line per city pair, the cited source wins ──────────────── */
function mergedLinks() {
  const by = new Map();
  for (const l of T.LINKS) {
    const key = [l.a, l.b].sort().join(' | ');
    const prev = by.get(key);
    if (!prev) { by.set(key, Object.assign({}, l)); continue; }
    /* intertubes carries a citation and a carrier count; corridor carries the
       right-of-way name. Keep the citation, adopt the ROW if we lacked one. */
    const win  = prev.src === 'intertubes' ? prev : l;
    const lose = prev.src === 'intertubes' ? l : prev;
    if (!win.row && lose.row) win.row = lose.row;
    by.set(key, win);
  }
  return Array.from(by.values());
}

/* ── OSRM ───────────────────────────────────────────────────────────────── */
function cacheKey(a, b) {
  return crypto.createHash('sha1').update(a.join(',') + ';' + b.join(',')).digest('hex');
}
function readCache(k) {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, k + '.json'), 'utf8')); }
  catch (e) { return null; }
}
function writeCache(k, v) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, k + '.json'), JSON.stringify(v));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function route(aLL, bLL) {
  /* CITY holds [lat, lon]; OSRM wants lon,lat. */
  const a = [aLL[1], aLL[0]], b = [bLL[1], bLL[0]];
  const key = cacheKey(a, b);
  if (!FRESH) { const c = readCache(key); if (c) return { coords: c, cached: true }; }
  if (OFFLINE) return null;

  const url = OSRM + '/route/v1/driving/' + a.join(',') + ';' + b.join(',') +
              '?overview=full&geometries=geojson&alternatives=false&steps=false';
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 30000);
      let r;
      try { r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'ClearSky-OMEGA fiber-backbone build' } }); }
      finally { clearTimeout(timer); }
      if (r.status === 429) { await sleep(5000 * attempt); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes || !j.routes.length) throw new Error(j.code || 'no route');
      const coords = j.routes[0].geometry.coordinates;
      writeCache(key, coords);
      return { coords: coords, cached: false };
    } catch (e) {
      if (attempt === TRIES) return null;
      await sleep(1500 * attempt);
    }
  }
  return null;
}

/* ── build ──────────────────────────────────────────────────────────────── */
(async function main() {
  const links = mergedLinks();
  console.log('corridors to build: ' + links.length +
              '  (' + links.filter(l => l.src === 'intertubes').length + ' cited, ' +
              links.filter(l => l.src === 'corridor').length + ' corridor)');

  const features = [];
  let routed = 0, chord = 0, fromCache = 0, n = 0;

  for (const l of links) {
    n++;
    const aLL = T.CITY[l.a], bLL = T.CITY[l.b];
    const res = await route(aLL, bLL);
    let coords, isRouted;
    if (res && res.coords && res.coords.length >= 2) {
      coords = res.coords; isRouted = true; routed++;
      if (res.cached) fromCache++; else await sleep(PAUSE_MS);
    } else {
      coords = [[aLL[1], aLL[0]], [bLL[1], bLL[0]]]; isRouted = false; chord++;
      if (!OFFLINE) await sleep(PAUSE_MS);
    }

    const full = round(simplify(coords, 0.0012), 5);   /* ~130 m, for the map */
    const mi   = Math.round(lengthMi(full));

    const props = {
      id: 'lh-' + String(n).padStart(3, '0'),
      a: l.a, b: l.b,
      name: l.a + ' ↔ ' + l.b,
      src: l.src,
      routed: isRouted,
      row: l.row || (isRouted ? 'highway ROW (routed)' : null),
      miles: mi
    };
    if (l.isps   != null) props.isps   = l.isps;
    if (l.probes != null) props.probes = l.probes;
    if (l.cite)           props.cite   = l.cite;

    /* One sentence the map and the report can both show verbatim. */
    props.meta =
      (l.src === 'intertubes'
        ? (l.isps != null
            ? l.isps + ' carrier' + (l.isps === 1 ? '' : 's') + ' share this conduit'
            : 'Published long-haul link')
        : 'Long-haul corridor') +
      ' · ' + mi + ' mi' +
      (props.row ? ' · ' + props.row : '') +
      (isRouted ? '' : ' · straight-line approximation');

    features.push({ type: 'Feature', properties: props,
                    geometry: { type: 'LineString', coordinates: full } });

    if (n % 25 === 0 || n === links.length) {
      process.stdout.write('  ' + n + '/' + links.length +
        '  routed ' + routed + '  chord ' + chord + '  cached ' + fromCache + '\n');
    }
  }

  const fc = {
    type: 'FeatureCollection',
    name: 'US long-haul fiber corridors',
    generated: new Date().toISOString().slice(0, 10),
    note: 'Intercity long-haul corridors routed over the road network, because ' +
          'US long-haul fiber is laid in transportation rights-of-way. src=intertubes ' +
          'features carry a citation from Durairajan et al., SIGCOMM 2015; src=corridor ' +
          'features assert that long-haul capacity runs this way and assert nothing ' +
          'about which carrier is in which ditch. Not a carrier route map, not a survey. ' +
          'Carrier network maps are indexed in data/us-fiber-carriers.json.',
    features: features
  };
  fs.mkdirSync(path.dirname(OUT_GEO), { recursive: true });
  fs.writeFileSync(OUT_GEO, JSON.stringify(fc));
  console.log('wrote ' + path.relative(ROOT, OUT_GEO) + '  ' +
              (fs.statSync(OUT_GEO).size / 1024).toFixed(0) + ' KB');

  /* ── the function's copy: coarser, and only the fields it scores on ───── */
  const compact = features.map(f => ({
    a: f.properties.a, b: f.properties.b,
    src: f.properties.src, routed: f.properties.routed,
    row: f.properties.row, miles: f.properties.miles,
    isps: f.properties.isps != null ? f.properties.isps : null,
    probes: f.properties.probes != null ? f.properties.probes : null,
    cite: f.properties.cite || null,
    g: round(simplify(f.geometry.coordinates, 0.02), 4)   /* ~2 km */
  }));
  const pts = compact.reduce((s, c) => s + c.g.length, 0);
  const lib =
`/* GENERATED by scripts/build-fiber-backbone.js on ${fc.generated} — do not edit.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   US long-haul fiber corridors, simplified to ~2 km for distance measurement
   inside /api/network-proximity. The full-resolution copy the map draws is
   data/us-longhaul-fiber.geojson. Rebuild both together.

   ${compact.length} corridors, ${pts} vertices.
   Geometry is [lon, lat], the GeoJSON order, so it can be measured by the
   same helpers that measure fetched GeoJSON without a second convention. */
'use strict';
module.exports = ${JSON.stringify(compact)};
`;
  fs.mkdirSync(path.dirname(OUT_LIB), { recursive: true });
  fs.writeFileSync(OUT_LIB, lib);
  console.log('wrote ' + path.relative(ROOT, OUT_LIB) + '  ' +
              (fs.statSync(OUT_LIB).size / 1024).toFixed(0) + ' KB  (' + pts + ' vertices)');

  console.log('\ndone: ' + routed + ' routed over the road network, ' +
              chord + ' fell back to a straight chord.');
  if (chord) {
    console.log('chord fallbacks:');
    features.filter(f => !f.properties.routed)
            .forEach(f => console.log('  ' + f.properties.name));
  }
})().catch(e => { console.error(e); process.exit(1); });
