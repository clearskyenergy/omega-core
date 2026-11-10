#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/fiber-confirm-portfolio.js — the fiber confirmation of
 * omega-fiber-confirm.js, run down a whole portfolio sheet.
 *
 *   node scripts/fiber-confirm-portfolio.js <portfolio.csv> [--out DIR] [--use "a DC fast-charging site"]
 *
 * For every row: the FCC-named fiber providers at the address (census block,
 * surrounding hex, ~1.5 km ring), the incumbent telephone company of record,
 * the other wireline providers, the nearest published route in the bundled
 * inventory and its operator, the ordered list of carriers to ask, and a
 * verification brief with the RFI. Writes <out>/fiber-confirmation.csv and
 * <out>/fiber-verification-briefs.txt.
 *
 * THE SHEET IS DEAL DATA. Output goes to work/ (never committed) unless
 * --out says otherwise, exactly as an order file is never committed.
 *
 * WHAT LEAVES THE MACHINE: each street address goes to the US Census Bureau
 * geocoder (or, when it has no match, the town name to OpenStreetMap's
 * Nominatim — the row is then marked APPROXIMATE, because a town centre is
 * not the site); each resulting point goes to the public FCC layers. Nothing
 * else, and no account or tenant identity with it. A sheet that already
 * carries Latitude / Longitude columns is never geocoded.
 *
 * It reads; it confirms nothing. Rung 2 names who has fiber plant nearby —
 * the carrier's written answer is still the only verification. */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('../omega-fiber-confirm.js');
const Z = require('../omega-zoning-watch.js');
const argv = process.argv.slice(2), file = argv.find(a => !a.startsWith('--'));
const opt = k => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
if (!file) { console.error('usage: node scripts/fiber-confirm-portfolio.js <portfolio.csv> [--out DIR] [--use "<what the site is for>"]'); process.exit(2); }
const OUT = path.resolve(opt('--out') || path.join(__dirname, '../work/fiber-confirm'));
const USE = opt('--use') || 'a commercial facility';
const UA = { 'User-Agent': 'fiber-confirmation/1.0' };

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(c => c !== '')) rows.push(row);
  return rows;
}
const csvCell = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
async function getJson(url, tries) {
  for (let t = 1; ; t++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(40000) }); if (!r.ok) throw Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (t >= (tries || 3)) throw e; await sleep(1200 * t); }
  }
}
let townQueue = Promise.resolve();
async function geocode(s) {
  const one = [s.address, s.city, s.state].filter(Boolean).join(', ');
  try {
    const j = await getJson('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' + new URLSearchParams({ address: one, benchmark: 'Public_AR_Current', format: 'json' }));
    const m = ((j.result || {}).addressMatches || [])[0];
    if (m && m.coordinates) return { lat: +m.coordinates.y, lng: +m.coordinates.x, precision: 'address', matched: m.matchedAddress };
  } catch (e) { /* fall through to the town */ }
  if (s.city && s.state) {
    try {
      /* Nominatim's one request a second, whatever the worker count */
      const turn = townQueue.then(() => sleep(1100)).then(() => getJson('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'us', city: s.city, state: s.state })));
      townQueue = turn.catch(() => null);
      const j = await turn;
      if (j && j[0]) return { lat: +j[0].lat, lng: +j[0].lon, precision: 'APPROXIMATE (town centre)', matched: s.city + ', ' + s.state };
    } catch (e) { /* none */ }
  }
  return null;
}
const lookupOnce = (lat, lng) => new Promise(ok => C.lookup(lat, lng, (err, bdc) => ok({ err: err ? String(err.message || err) : null, bdc: err ? undefined : bdc })));
/* the FCC layers are a busy public service: a failed or half-answered lookup
   (no block AND no hex) is asked again before it is reported as a failure */
async function lookup(lat, lng) {
  let r = null;
  for (let t = 1; t <= 3; t++) {
    r = await lookupOnce(lat, lng);
    if (!r.err && (r.bdc === null || r.bdc.block || r.bdc.hex)) return r;
    await sleep(2500 * t);
  }
  if (!r.err && r.bdc && !r.bdc.block && !r.bdc.hex) return { err: 'the FCC block and hex layers did not answer', bdc: undefined };
  return r;
}

(async function main() {
  const rows = parseCsv(fs.readFileSync(path.resolve(file), 'utf8'));
  const head = rows.shift().map(h => h.trim().toLowerCase());
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const iName = col('site name', 'name', 'site'), iAddr = col('address', 'street', 'street address'), iCity = col('city', 'town'), iState = col('state'),
        iLat = col('latitude', 'lat'), iLng = col('longitude', 'lng', 'lon'), iId = col('external id', 'id', 'site id');
  if (iAddr < 0 && (iLat < 0 || iLng < 0)) throw Error('The sheet needs an Address column, or Latitude and Longitude.');
  let ev = null; try { ev = require('../api/_lib/fiber-evidence'); } catch (e) { console.error('Bundled route inventory unavailable (' + e.message + ') — mapped routes will be blank.'); }
  /* zoning & legislation, as reported, for each site's county — the tracker
     is a file in the repo, so this part asks nobody */
  let zoning = null; try { zoning = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/zoning/measures.json'), 'utf8')); } catch (e) { zoning = null; }
  const zread = (b, city, subject) => {
    const f = b && b.block && b.block.geoid ? Z.fipsOf(b.block.geoid) : null;
    const j = Z.judge(zoning, { state: f && f.state, county: f && f.county, countyName: b && b.block && b.block.county, subject, placeHint: city });
    /* the match is by COUNTY: say whether a measure names the site's own
       city (as the sheet spells it) or only shares its county */
    const own = r => r.level === 'county' ? 'county-wide measure — check unincorporated vs city limits' : new RegExp('(^|[^a-z])' + String(city || '').toLowerCase().replace(/[^a-z0-9 ]/g, '.') + '([^a-z]|$)').test(String(r.jurisdiction).toLowerCase()) && city ? 'names the site\u2019s city' : 'same county only — confirm the site is inside ' + r.jurisdiction;
    const lead = j.local.filter(r => r.effect === 'restrictive').slice(0, 3).map(r => r.jurisdiction + ' — ' + r.title + ' [' + (Z.standing(r, new Date().toISOString()) === 'lapsed?' ? 'expiry date passed' : r.status) + '; ' + own(r) + ']');
    return j.rows.local.value + (lead.length ? ': ' + lead.join('; ') : '');
  };
  fs.mkdirSync(OUT, { recursive: true });

  const sites = rows.map(r => ({ id: iId >= 0 ? r[iId] : '', name: iName >= 0 ? r[iName] : '', address: iAddr >= 0 ? (r[iAddr] || '').trim() : '', city: iCity >= 0 ? (r[iCity] || '').trim() : '',
    state: iState >= 0 ? (r[iState] || '').trim() : '', lat: iLat >= 0 ? +r[iLat] : NaN, lng: iLng >= 0 ? +r[iLng] : NaN }));
  /* a few sites at a time: the FCC layers answer in seconds each, and a
     hundred sites one after another is an hour. Rows keep the sheet's order. */
  const out = new Array(sites.length), briefs = new Array(sites.length);
  let next = 0, finished = 0;
  const worker = async () => { for (;;) { const n = next++; if (n >= sites.length) return; await one(n); finished++; } };
  async function one(n) {
    const s = sites[n];
    let g = Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.lat || s.lng) ? { lat: s.lat, lng: s.lng, precision: 'sheet coordinates' } : await geocode(s);
    const full = [s.address, s.city, s.state].filter(Boolean).join(', ');
    if (!g) { out[n] = { s, note: 'NOT GEOCODED — no reading' }; console.error((finished + 1) + '/' + sites.length + ' ' + s.name + ': not geocoded'); return; }
    const r = await lookup(g.lat, g.lng);
    let routes = [], inRadius = null;
    if (ev) { try { const sc = ev.screen({ lat: g.lat, lon: g.lng, radius_km: 25, limit: 6 }); inRadius = (sc.counts_in_radius || {}).routes; routes = (sc.routes || []).slice(0, 6).map(x => ({ operator: x.operator || x.name, km: (x.mapped_distance_m || 0) / 1000, note: x.notes })); } catch (e) { inRadius = null; } }
    const evd = { mappedMeasured: !!ev, mappedKm: routes.length ? routes[0].km : null, screenRoutes: inRadius, bdc: r.bdc, bdcError: r.err, routes };
    const lad = C.ladder(evd), list = C.carriers(r.bdc || null, routes), b = r.bdc || {};
    const cable = ((b.block || b.hex || {}).providers || []).filter(p => p.tech === 40 && p.totalBsls > 0).map(p => p.name);
    out[n] = { s, g, lad, list, b, cable, routes, inRadius, err: r.err,
      zone: { county: (b.block && b.block.county) || '', dc: zread(b, s.city, 'data-center'), bess: zread(b, s.city, 'bess'), ev: zread(b, s.city, 'ev-charging') } };
    briefs[n] = ('═══════════════════════════════════════════════════════════════════════\n' + (s.id ? s.id + ' · ' : '') + s.name + (g.precision.startsWith('APPROX') ? '   ⚠ ' + g.precision + ' — facts are for the town, not the parcel' : '') + '\n'
      + C.brief({ address: full, lat: g.lat, lng: g.lng, use: USE }, evd, { gbps: 10, minGbps: 5 }));
    console.error((finished + 1) + '/' + sites.length + ' ' + s.name + ' — ' + (r.err ? 'FCC lookup failed' : lad.rungs[1].status + ' · ' + (list[0] ? list[0].name : 'no carrier named')));
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, +opt('--concurrency') || 5)) }, worker));

  const H = ['External ID', 'Site name', 'Address', 'City', 'State', 'Latitude', 'Longitude', 'Location precision', 'Fiber status', 'Fiber providers — site block', 'Fiber providers — surrounding hex',
    'Fiber providers — within 1.5 km', 'Incumbent telephone company', 'Incumbent type', 'Study area code', 'OCN', 'Cable providers', 'Nearest published route (km)', 'Nearest route operator',
    'Published routes within 25 km', 'Carriers to ask (in order)', 'Census block', 'FCC map', 'County', 'Reported local measures — data centers', 'Reported local measures — battery storage', 'Reported local measures — EV charging', 'Note'];
  const names = l => (l || []).map(p => p.name + ' (' + p.totalBsls + ')').join('; ');
  const lines = [H.join(',')];
  for (const o of out) {
    const s = o.s;
    if (!o.g) { lines.push([s.id, s.name, s.address, s.city, s.state, '', '', '', 'No reading', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', o.note].map(csvCell).join(',')); continue; }
    const st = o.err ? 'FCC lookup failed — no reading' : o.lad.rungs[1].status === 'yes' ? 'Reported in the site block' : o.lad.rungs[1].status === 'near' ? 'Reported nearby' : (o.lad.rungs[0].status === 'yes' ? 'Mapped route only' : 'None reported — expect a build');
    const il = o.b.ilec || {};
    lines.push([s.id, s.name, s.address, s.city, s.state, o.g.lat.toFixed(6), o.g.lng.toFixed(6), o.g.precision, st,
      names((o.b.block || {}).fiber), names((o.b.hex || {}).fiber), names((o.b.nearby || {}).fiber),
      il.label || '', il.regulation || '', il.sac || '', il.ocn || '', o.cable.join('; '),
      o.routes.length ? o.routes[0].km.toFixed(2) : '', o.routes.length ? (o.routes[0].operator || 'not published') : '', o.inRadius == null ? '' : o.inRadius,
      o.list.map((c, i) => (i + 1) + '. ' + c.name).join('; '), (o.b.block || {}).geoid || '', C.fccMapUrl(o.g.lat, o.g.lng), o.zone.county, o.zone.dc, o.zone.bess, o.zone.ev,
      o.g.precision.startsWith('APPROX') ? 'Address did not geocode — town-centre reading; re-run with coordinates' : (o.err || '')].map(csvCell).join(','));
  }
  fs.writeFileSync(path.join(OUT, 'fiber-confirmation.csv'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'fiber-verification-briefs.txt'), briefs.filter(Boolean).join('\n\n') + '\n');
  const tally = {}; for (const o of out) { const k = !o.g ? 'not geocoded' : o.err ? 'lookup failed' : o.lad.rungs[1].status; tally[k] = (tally[k] || 0) + 1; }
  console.log(JSON.stringify({ sites: sites.length, reportedStatus: tally, approximate: out.filter(o => o.g && o.g.precision.startsWith('APPROX')).length, out: OUT }, null, 1));
})().catch(e => { console.error(e); process.exitCode = 1; });
