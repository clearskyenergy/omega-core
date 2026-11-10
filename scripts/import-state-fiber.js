#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/import-state-fiber.js — published fiber routes for named states,
 * from a VETTED registry of public layers, into data/usa-fiber.
 *
 * WHY (2026-11-09, Tommy, over a 104-site charging portfolio: "go out and
 * get all the fiber we need for these states"): Oklahoma held three records,
 * Missouri and Arkansas none, New Mexico six — so 93 of 104 sites screened
 * "no route in view". A sweep of public ArcGIS layers found the routes; this
 * file is the part that must not be automatic: WHICH of them may be bundled.
 *
 * THE LINE THE REGISTRY DRAWS — a layer is here only if it is
 *   · published by a public agency (a DOT, a state broadband office, a
 *     county, a city or its utility), or
 *   · a carrier's OWN published network map (its own organisation's layer,
 *     made for wholesale customers or the public).
 * It is NOT here if it is a contractor's working upload, an 811 / locate
 * export, a design-tool export, or a carrier's internal plant records that
 * somebody left shared — several such layers (cable, telco and long-haul
 * plant uploaded by locating and engineering firms) were public when this
 * was written and were deliberately left out. "Reachable without a token"
 * is not "published". Customer DROPS are never imported, from any source.
 *
 * HOW IT STORES
 *   · Geometry is the publisher's, rounded to six decimals (0.1 m — far
 *     inside any published route's positional accuracy). Nothing is routed,
 *     snapped, joined or drawn.
 *   · A high-volume source is TILED: its segments are grouped per carrier,
 *     status and 0.1° cell into one multi-part record, so 60,000 street
 *     segments are a few hundred records the map can filter by viewport.
 *     Every part is still the publisher's own line; publishedLineParts
 *     counts them. A record is not a cable.
 *   · A segment in several states is in each state's file (the inventory's
 *     own rule). A segment in none of the requested states is dropped.
 *   · IDs are the source id + a hash of the geometry: a re-run that finds
 *     the same lines writes the same IDs; a source that changed replaces
 *     only its own records.
 *
 * RUN
 *   node scripts/import-state-fiber.js --cache /tmp/fiber-cache      # fetch + merge
 *   node scripts/import-state-fiber.js --cache DIR --only ok-odot-broadband-lines
 *   node scripts/import-state-fiber.js --cache DIR --dry             # fetch + report, write nothing
 *   node scripts/import-published-fiber.js                           # ALWAYS afterwards: rebuilds
 *                                                                    # overviews, manifest, API shards
 * Then `npm run test:fiber`. docs/FIBER-STATE-EXPANSION.md has the source
 * table, what was left out and why. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../data/usa-fiber');
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const CACHE = opt('--cache') ? path.resolve(String(opt('--cache'))) : null;
const ONLY = opt('--only') ? String(opt('--only')).split(',') : null;
const DRY = !!opt('--dry');
const TARGET = (opt('--states') ? String(opt('--states')) : 'OK,NM,MO,AL,KS,AR,OH,IL').split(',');
const TILE = 0.1, OVERVIEW_TOL = 0.002;
const NOLICENSE = 'No explicit reuse license in item metadata; publisher attribution retained. Verify terms before redistribution.';

/* ── the registry ─────────────────────────────────────────────────────────
   classify(attributes) → null to skip, or { carrier, category, routeStatus,
   networkType?, name? }. category: existing | unknown | planned | inactive —
   'existing' only where the publisher's own status says built. */
const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const S = [];
const UNK = { category: 'unknown', routeStatus: 'Status not established' };

S.push({
  id: 'ok-odot-broadband-lines', name: 'Oklahoma DOT — Broadband Lines (provider-submitted)',
  publisher: 'Oklahoma Department of Transportation', evidence: 'agency_route', national: false, tile: true,
  url: 'https://services6.arcgis.com/RBtoEUQ2lmN0K3GY/arcgis/rest/services/Broadband_Lines/FeatureServer/0',
  fields: 'ISP,Type,FileName,STATUS,Tier,Proposal',
  note: 'Lines submitted by broadband providers and combined by ODOT. Wireless backhaul links and customer drops are not imported; civil/conduit/path duplicates of one design are not imported. A provider that states no medium (Cox) is labelled so — it may be coaxial plant.',
  classify(a) {
    const file = txt(a.FileName), type = txt(a.Type), isp = txt(a.ISP) || 'Not published';
    if (/wireless/i.test(file) || /wireless/i.test(type)) return null;
    if (/drop/i.test(txt(a.Tier)) || /DROP/.test(file)) return null;
    if (/^(Civil|Conduit|Path)_/.test(file) || file === 'Span') return null;      /* same design, drawn again */
    const planned = /propos|_Fiber_Build|ARPA|Routes_Shapefile/i.test(file) || /^(NEW|Proposed)$/i.test(txt(a.STATUS)) || !!txt(a.Proposal);
    const fiber = /fiber|loose tube/i.test(file + ' ' + type) || /^(UG|DRILL)/.test(type);
    return { carrier: isp,
      category: planned ? 'planned' : 'unknown',
      routeStatus: planned ? 'Proposed or under construction (as submitted to ODOT)' : 'Status not established',
      networkType: fiber ? 'Provider-submitted fiber line (ODOT Broadband Lines)' : 'Provider-submitted broadband line; medium not stated — may be coaxial plant' };
  }
});
S.push({
  id: 'ok-obo-middle-mile-projects', name: 'Oklahoma Broadband Office — Middle Mile Projects',
  publisher: 'Oklahoma Broadband Office', evidence: 'approximate_project_route',
  lookup: ['Middle_Mile_Projects', 'Middle_Mile_Projects'],
  fields: 'provider,project_id,tech',
  classify: a => /fiber/i.test(txt(a.tech) || 'fiber') ? { carrier: txt(a.provider) || 'Not published', category: 'planned', routeStatus: 'Awarded middle-mile project (planned route)', networkType: 'Middle mile', name: txt(a.project_id) } : null
});
S.push({ id: 'ok-ponca-city-fiber', name: 'Ponca City — buried fiber cables', publisher: 'City of Ponca City, Oklahoma', evidence: 'agency_route', tile: true,
  lookup: ['Korterra2', 'Fiber Underround'], fields: 'Layers,Cable_Type',
  classify: a => /fiber/i.test(txt(a.Layers) + txt(a.Cable_Type) + 'fiber') ? Object.assign({ carrier: 'City of Ponca City (municipal)', networkType: 'Municipal fiber plant; network class not specified' }, UNK) : null });
S.push({ id: 'ok-owasso-city-fiber', name: 'City of Owasso — city fiber', publisher: 'City of Owasso, Oklahoma', evidence: 'agency_route',
  lookup: ['IT_Infrastructure_UseThis_WFL1', 'CityOfOwassoFiber'], fields: 'FeatType',
  classify: () => Object.assign({ carrier: 'City of Owasso (municipal)', networkType: 'Municipal fiber; network class not specified' }, UNK) });
S.push({ id: 'fiberlight-published-cable', name: 'FiberLight — fiber cable (publisher external view)', publisher: 'FiberLight, LLC', evidence: 'publisher_route', national: true, tile: true,
  lookup: ['FIBERCABLE_AGOL_View', 'FIBERCABLE_AGOL'], fields: 'INVENTORY_STATUS_CODE',
  classify(a) { const s = txt(a.INVENTORY_STATUS_CODE); if (/retir|remov|abandon/i.test(s)) return { carrier: 'FiberLight', category: 'inactive', routeStatus: s };
    return /complete|built|in.?service/i.test(s) ? { carrier: 'FiberLight', category: 'existing', routeStatus: s + ' (publisher inventory status)' } : { carrier: 'FiberLight', category: /plan|propos|design|construct/i.test(s) ? 'planned' : 'unknown', routeStatus: s || 'Status not established' }; } });
S.push({ id: 'uniti-kinetic-dark-fiber', name: 'Uniti / Kinetic — local network dark fiber (carrier wholesale map)', publisher: 'Uniti (Windstream / Kinetic), as published', evidence: 'publisher_route', national: true, tile: true,
  lookup: ['Uniti Wholesale Map Demo 4_WFL1', 'Kinetic Dark Fiber'], fields: 'Name',
  classify: () => Object.assign({ carrier: 'Uniti / Kinetic (Windstream)', networkType: 'Carrier-published local network; dark fiber availability not confirmed' }, UNK) });
S.push({ id: 'uniti-wholesale-dark-fiber', name: 'Uniti — wholesale dark fiber routes (carrier wholesale map)', publisher: 'Uniti, as published', evidence: 'publisher_route', national: true, tile: true,
  lookup: ['Uniti Wholesale Dark Fiber', 'Uniti Wholesale Dark Fiber'], fields: 'Name,FolderPath',
  classify: a => Object.assign({ carrier: 'Uniti', networkType: 'Carrier-published wholesale dark fiber route' + (/leas|iru/i.test(txt(a.FolderPath)) ? ' (leased / IRU segment)' : '') }, UNK) });
S.push({ id: 'zayo-all-fiber', name: 'Zayo — all fiber (carrier network map)', publisher: 'Zayo Group, as published', evidence: 'publisher_route', national: true, tile: true,
  lookup: ['ZayoAllFiber', 'Zayo All Fiber'], fields: 'ConstructionStatus,MetroLHCombined',
  classify(a) { const c = txt(a.ConstructionStatus), k = txt(a.MetroLHCombined);
    return { carrier: 'Zayo', category: /plan|propos|future|construct/i.test(c) ? 'planned' : 'unknown', routeStatus: c ? 'Publisher status: ' + c : 'Status not established', networkType: k ? 'Carrier network map — ' + k : 'Carrier network map; network class not specified' }; } });
S.push({ id: 'segra-fiber-network', name: 'Segra — fiber network (carrier network map)', publisher: 'Segra, as published', evidence: 'publisher_route', national: true, tile: true,
  lookup: ['Segra_Fiber_Network_Complete', 'Fiber Network'], fields: '',
  classify: () => Object.assign({ carrier: 'Segra (incl. Unite Private Networks)', networkType: 'Carrier network map; network class not specified' }, UNK) });
S.push({ id: 'ks-middle-mile-backbone', name: 'Kansas middle mile — backbone conduit & fiber', publisher: 'Connected Nation (Kansas middle-mile IXP development)', evidence: 'agency_route',
  lookup: ['KS_MiddleMile_IXP', 'Backbone Conduit & Fiber'], fields: 'Segment_Na,Technology',
  classify: a => Object.assign({ carrier: 'Not published', networkType: 'Middle mile — ' + (txt(a.Technology) || 'conduit and fiber'), name: txt(a.Segment_Na) }, UNK) });
S.push({ id: 'ks-middle-mile-lateral', name: 'Kansas middle mile — lateral conduit & fiber', publisher: 'Connected Nation (Kansas middle-mile IXP development)', evidence: 'agency_route',
  lookup: ['KS_MiddleMile_IXP', 'Lateral Conduit & Fiber'], fields: 'Segment_Na,Technology',
  classify: a => Object.assign({ carrier: 'Not published', networkType: 'Middle mile lateral — ' + (txt(a.Technology) || 'conduit and fiber'), name: txt(a.Segment_Na) }, UNK) });
S.push({ id: 'ks-middle-mile-blown-fiber', name: 'Kansas middle mile — backbone blown fiber', publisher: 'Connected Nation (Kansas middle-mile IXP development)', evidence: 'agency_route',
  lookup: ['KS_MiddleMile_IXP', 'Backbone Blow Fiber Only'], fields: 'Segment_Na,Technology',
  classify: a => Object.assign({ carrier: 'Not published', networkType: 'Middle mile — ' + (txt(a.Technology) || 'fiber'), name: txt(a.Segment_Na) }, UNK) });
S.push({ id: 'ks-lawrence-leasable-fiber', name: 'City of Lawrence — fiber network opportunities', publisher: 'Douglas County, Kansas GIS', evidence: 'agency_route',
  lookup: ['Fiber Network', 'Polylines'], fields: 'FolderPath',
  classify: a => Object.assign({ carrier: 'City of Lawrence (municipal)', networkType: /leas/i.test(txt(a.FolderPath)) ? 'Municipal fiber — leasable path' : 'Municipal fiber; network class not specified' }, UNK) });
S.push({ id: 'al-aldot-fiber-utility-lines', name: 'Alabama DOT — fiber utility lines (West Alabama Highway)', publisher: 'Alabama Department of Transportation', evidence: 'agency_route',
  lookup: ['Fiber Optic', 'Fiber'], owner: 'ellista_ALDOT', fields: 'Layer',
  classify(a) { const m = txt(a.Layer).match(/-\s*(.+)$/); return Object.assign({ carrier: m ? m[1] : 'Not published', networkType: 'Utility fiber along a highway project; ' + (txt(a.Layer) || 'placement not stated') }, UNK); } });
S.push({ id: 'al-adeca-awarded-middle-mile', name: 'Alabama (ADECA) — Fiber Utility Network 2022 awarded middle mile', publisher: 'Alabama Department of Economic and Community Affairs', evidence: 'approximate_project_route',
  lookup: ['Fiber Utility Network 2022 Awarded Middle Mile', 'Fiber Utility Network 2022 Awarded Middle Mile'], fields: 'PATH,Status,Terriroty',
  classify: a => ({ carrier: 'Fiber Utility Network (electric cooperatives)', category: 'planned', routeStatus: 'Awarded 2022 — ' + (txt(a.Status) || 'build / buy'), networkType: 'Middle mile', name: txt(a.PATH) }) });
S.push({ id: 'al-flashfiber-rings', name: 'FlashFiber (Joe Wheeler EMC) — fiber rings', publisher: 'Joe Wheeler EMC / FlashFiber', evidence: 'publisher_route',
  lookup: ['FlashFiberFootprintp', 'Fiber Rings'], fields: 'inventory_status_code,placementtype',
  classify: a => ({ carrier: 'FlashFiber (Joe Wheeler EMC)', category: /installed|asbuilt/i.test(txt(a.inventory_status_code)) ? 'existing' : 'unknown', routeStatus: txt(a.inventory_status_code) ? txt(a.inventory_status_code) + ' (publisher inventory status)' : 'Status not established', networkType: 'Backbone ring' }) });
S.push({ id: 'al-flashfiber-distribution', name: 'FlashFiber (Joe Wheeler EMC) — distribution fiber', publisher: 'Joe Wheeler EMC / FlashFiber', evidence: 'publisher_route', tile: true,
  lookup: ['FlashFiberFootprintp', 'Distribution Fiber'], fields: 'inventory_status_code',
  classify: a => ({ carrier: 'FlashFiber (Joe Wheeler EMC)', category: /installed|asbuilt/i.test(txt(a.inventory_status_code)) ? 'existing' : 'unknown', routeStatus: txt(a.inventory_status_code) ? txt(a.inventory_status_code) + ' (publisher inventory status)' : 'Status not established', networkType: 'Distribution fiber' }) });
S.push({ id: 'ar-russellville-fiber-duct', name: 'Russellville (City Corporation) — fiber optic duct', publisher: 'City Corporation, Russellville, Arkansas', evidence: 'agency_route', tile: true,
  lookup: ['Fiber Optic Duct', 'Fiber_Optic_Duct'], fields: 'NAME',
  classify: a => Object.assign({ carrier: txt(a.NAME) || 'Not published', networkType: 'Fiber duct as mapped by the city utility' }, UNK) });
S.push({ id: 'mo-independence-fiber', name: 'City of Independence — fiber optic lines', publisher: 'City of Independence, Missouri', evidence: 'agency_route',
  lookup: ['electric', 'Fiber Optic Lines'], fields: '',
  classify: () => Object.assign({ carrier: 'City of Independence (Independence Power & Light)', networkType: 'Municipal utility fiber' }, UNK) });
S.push({ id: 'mo-monett-fiber', name: 'City of Monett — fiber lines', publisher: 'City of Monett, Missouri', evidence: 'agency_route',
  lookup: ['Fiber_Lines view', 'FiberLines'], fields: '',
  classify: () => Object.assign({ carrier: 'City of Monett (municipal)', networkType: 'Municipal fiber on city poles' }, UNK) });
S.push({ id: 'oh-pickaway-horizon-fiber', name: 'Pickaway County GIS — Horizon fiber lines', publisher: 'Pickaway County GIS, Ohio', evidence: 'agency_route', tile: true,
  lookup: ['Fiber', 'Fiber'], owner: 'jgillow@pickaway.org', fields: 'FolderPath',
  classify: a => ({ carrier: 'Horizon', category: /complete/i.test(txt(a.FolderPath)) ? 'existing' : 'unknown', routeStatus: /complete/i.test(txt(a.FolderPath)) ? 'Backbone build status: complete (as published)' : 'Status not established', networkType: 'Carrier plant as published by the county' }) });
S.push({ id: 'oh-henry-county-telephone-fiber', name: 'Henry County Engineer — telephone fiber optic lines', publisher: 'Henry County Engineer, Ohio', evidence: 'agency_route', tile: true,
  lookup: ['UtilityLayers', 'Telephone Fiber Optic Lines'], fields: 'NAME',
  classify: a => Object.assign({ carrier: txt(a.NAME) || 'Not published', networkType: 'Utility fiber as mapped by the county engineer' }, UNK) });
S.push({ id: 'oh-dublin-dublink', name: 'City of Dublin — Dublink (leasable conduit and fiber)', publisher: 'City of Dublin, Ohio', evidence: 'agency_route',
  lookup: ['Dublink (Revenue Conduit Only)', 'Dublink Edit'], fields: 'DublinFiber,ConduitOwner',
  classify: a => Object.assign({ carrier: 'City of Dublin — Dublink', networkType: 'Municipal leasable ' + (/yes/i.test(txt(a.DublinFiber)) ? 'conduit and fiber' : 'conduit') }, UNK) });
S.push({ id: 'oh-summit-county-fiber-route', name: 'County of Summit — fiber route', publisher: 'County of Summit GIS, Ohio', evidence: 'agency_route',
  lookup: ['Fiber Route_923', 'Fiber_Route_923'], fields: '',
  classify: () => Object.assign({ carrier: 'Not published', networkType: 'County-published fiber route' }, UNK) });
S.push({ id: 'oh-hamilton-city-overhead-fiber', name: 'City of Hamilton — city-owned overhead fiber', publisher: 'City of Hamilton, Ohio', evidence: 'agency_route',
  lookup: ['FiberOpticCable_Overhead_COHowned', 'Overhead Fiber Optic Cable'], fields: '',
  classify: () => Object.assign({ carrier: 'City of Hamilton (municipal)', networkType: 'Municipal overhead fiber' }, UNK) });
S.push({ id: 'oh-kettering-fiber', name: 'City of Kettering — fiber network', publisher: 'City of Kettering, Ohio', evidence: 'agency_route',
  lookup: ['All Fiber Data', 'All Fiber'], fields: 'InstallStatus',
  classify: a => ({ carrier: 'City of Kettering / Miami Valley partners', category: /^installed$/i.test(txt(a.InstallStatus)) ? 'existing' : 'unknown', routeStatus: txt(a.InstallStatus) ? txt(a.InstallStatus) + ' (as published, 2016)' : 'Status not established', networkType: 'Municipal fiber' }) });
S.push({ id: 'oh-centerville-fiber', name: 'City of Centerville — fiber', publisher: 'City of Centerville, Ohio', evidence: 'agency_route',
  lookup: ['Fiber', 'Fiber'], owner: 'centerville_gis', fields: '',
  classify: () => Object.assign({ carrier: 'City of Centerville (municipal)', networkType: 'Municipal fiber' }, UNK) });
S.push({ id: 'il-kane-county-fiber', name: 'Kane County — fiber network', publisher: 'Kane County, Illinois', evidence: 'agency_route',
  lookup: ['KaneFiber_Fiber_10012018_View_ReadOnly', 'Fiber'], fields: 'FIBER_OWNER,active',
  classify: a => ({ carrier: 'Kane County (' + (txt(a.FIBER_OWNER) || 'county') + ')', category: /^y/i.test(txt(a.active)) ? 'existing' : 'unknown', routeStatus: /^y/i.test(txt(a.active)) ? 'Active (as published)' : 'Status not established', networkType: 'County fiber network' }) });
S.push({ id: 'il-idot-d4-fiber-links', name: 'IDOT District 4 — fiber optic cable links', publisher: 'Tri-County Regional Planning Commission (IDOT District 4 data)', evidence: 'agency_route',
  lookup: ['IDOT Fiber Connections', 'IDOT District 4 Fiber Optic Cable Links'], fields: 'Name',
  classify: a => Object.assign({ carrier: 'Illinois DOT (District 4)', networkType: 'DOT traffic / ITS fiber', name: txt(a.Name) }, UNK) });
S.push({ id: 'il-peru-city-fiber', name: 'City of Peru — fiber', publisher: 'City of Peru, Illinois', evidence: 'agency_route',
  lookup: ['PeruFiber view', 'PeruFiberLine'], fields: 'RunDesc',
  classify: a => Object.assign({ carrier: 'City of Peru (municipal)', networkType: 'Municipal fiber', name: txt(a.RunDesc) }, UNK) });

/* ── plumbing ──────────────────────────────────────────────────────────── */
async function get(endpoint, params, tries) {
  tries = tries || 4;
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(endpoint + '?' + new URLSearchParams(Object.assign({ f: 'json' }, params)), { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'fiber-inventory-import/1.0' } });
      if (!r.ok) throw Error('HTTP ' + r.status);
      const j = await r.json(); if (j.error) throw Error(JSON.stringify(j.error).slice(0, 200));
      return j;
    } catch (e) { if (t >= tries) throw e; await new Promise(ok => setTimeout(ok, 1500 * t)); }
  }
}
const r6 = v => Math.round(v * 1e6) / 1e6;
function inRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function inPoly(x, y, g) { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const p of polys) { if (inRing(x, y, p[0])) { let hole = false; for (let i = 1; i < p.length; i++) if (inRing(x, y, p[i])) hole = true; if (!hole) return true; } } return false; }
function simplify(line, tol) {           /* Douglas–Peucker, iterative */
  if (line.length <= 2) return line.slice();
  const keep = new Uint8Array(line.length); keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const ax = line[a][0], ay = line[a][1], dx = line[b][0] - ax, dy = line[b][1] - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const px = line[i][0] - ax, py = line[i][1] - ay; let t = l2 ? (px * dx + py * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); const ex = px - t * dx, ey = py - t * dy, d = ex * ex + ey * ey; if (d > md) { md = d; mi = i; } }
    if (mi > 0 && md > tol * tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return line.filter((_, i) => keep[i]);
}
const extent = lines => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const l of lines) for (const q of l) { if (q[0] < a) a = q[0]; if (q[1] < b) b = q[1]; if (q[0] > c) c = q[0]; if (q[1] > d) d = q[1]; } return [a, b, c, d]; };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

async function resolveUrl(src, candidates) {
  if (src.url) return src.url;
  const hit = candidates.filter(r => r.title === src.lookup[0] && r.layer === src.lookup[1] && (!src.owner || r.owner === src.owner));
  if (hit.length !== 1) throw Error(src.id + ': registry lookup matched ' + hit.length + ' layers — pin its url');
  src.item = hit[0].item; return hit[0].url;
}

(async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const stateBox = new Map(manifest.states.map(s => [s.code, s.bbox]));
  for (const c of TARGET) if (!stateBox.has(c)) throw Error('Unknown state ' + c);
  if (CACHE) fs.mkdirSync(CACHE, { recursive: true });
  const cached = (name, make) => { const f = CACHE && path.join(CACHE, name); if (f && fs.existsSync(f)) return Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8'))); return make().then(v => { if (f) fs.writeFileSync(f, JSON.stringify(v)); return v; }); };

  /* state polygons — the inventory's own boundary source */
  const bj = await cached('_states.json', async () => (await (await fetch(manifest.boundarySourceUrl + '/query?' + new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', f: 'geojson' }))).json()));
  const states = bj.features.map(f => { const p = f.properties, code = Object.values(p).find(v => typeof v === 'string' && /^[A-Z]{2}$/.test(v) && stateBox.has(v)); return { code, geom: f.geometry, box: stateBox.get(code) }; }).filter(s => s.code);
  if (states.length < 50) throw Error('State boundaries incomplete: ' + states.length);
  const statesOf = lines => { const hit = new Set(); for (const l of lines) for (let i = 0; i < l.length; i += Math.max(1, Math.floor(l.length / 12))) { const q = l[i]; for (const s of states) { if (hit.has(s.code)) continue; const b = s.box; if (q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) continue; if (inPoly(q[0], q[1], s.geom)) hit.add(s.code); } } return [...hit].sort(); };

  /* the discovery snapshot resolves registry lookups to service URLs once; a
     pinned url needs none */
  let candidates = [];
  if (S.some(s => !s.url)) {
    const f = CACHE && path.join(CACHE, 'candidates.json');
    if (!f || !fs.existsSync(f)) throw Error('Registry entries without a pinned url need <cache>/candidates.json (the discovery snapshot).');
    candidates = JSON.parse(fs.readFileSync(f, 'utf8')).filter(r => r.layer);
  }

  const report = [], built = [];
  for (const src of S) {
    if (ONLY && !ONLY.includes(src.id)) continue;
    const url = await resolveUrl(src, candidates);
    const raw = await cached(src.id + '.raw.json', async () => {
      const meta = await get(url, {});
      if (meta.geometryType !== 'esriGeometryPolyline') throw Error(src.id + ': not a line layer');
      const oid = meta.objectIdField || (meta.fields.find(f => f.type === 'esriFieldTypeOID') || {}).name;
      const page = Math.min(meta.maxRecordCount || 1000, 1000);
      const have = new Map(), boxes = src.national ? TARGET.map(c => stateBox.get(c)) : [null];
      const names = new Set(meta.fields.map(f => f.name));
      const outFields = [oid].concat(String(src.fields || '').split(',').filter(f => f && names.has(f))).join(',');
      for (const box of boxes) {
        for (let off = 0; ; off += page) {
          const q = { where: '1=1', outFields, outSR: '4326', returnGeometry: 'true', returnZ: 'false', returnM: 'false', orderByFields: oid, resultOffset: off, resultRecordCount: page };
          if (box) Object.assign(q, { geometry: box.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
          const j = await get(url + '/query', q);
          for (const f of j.features || []) if (f.geometry && f.geometry.paths) have.set(f.attributes[oid], { a: f.attributes, p: f.geometry.paths });
          if (!(j.features || []).length || !j.exceededTransferLimit && (j.features || []).length < page) break;
        }
      }
      let item = null;
      try { if (meta.serviceItemId || src.item) item = await get('https://www.arcgis.com/sharing/rest/content/items/' + (src.item || meta.serviceItemId), {}); } catch (e) { item = null; }
      return { url, retrievedAt: new Date().toISOString(), layerName: meta.name, lastEdit: (meta.editingInfo || {}).lastEditDate || null, copyrightText: meta.copyrightText || '',
        item: item ? { id: item.id, owner: item.owner, modified: item.modified, title: item.title, license: String(item.licenseInfo || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) } : null,
        features: [...have.values()] };
    });

    /* classify → clean → state → dedupe */
    const seen = new Map(); let skipped = 0, outside = 0, invalid = 0, dup = 0;
    for (const f of raw.features) {
      const c = src.classify(f.a || {}); if (!c) { skipped++; continue; }
      const lines = f.p.map(l => { const o = []; for (const q of l) { if (!Number.isFinite(q[0]) || !Number.isFinite(q[1]) || Math.abs(q[0]) > 180 || Math.abs(q[1]) > 90) return null; const x = r6(q[0]), y = r6(q[1]); if (!o.length || o[o.length - 1][0] !== x || o[o.length - 1][1] !== y) o.push([x, y]); } return o.length >= 2 ? o : null; }).filter(Boolean);
      if (!lines.length) { invalid++; continue; }
      const st = statesOf(lines);
      if (!st.some(s => TARGET.includes(s))) { outside++; continue; }
      for (const l of lines) {
        const fwd = JSON.stringify(l), key = sha(fwd < JSON.stringify(l.slice().reverse()) ? fwd : JSON.stringify(l.slice().reverse()));
        const prev = seen.get(key);
        if (prev) { dup++; if (prev.c.carrier !== c.carrier && !prev.also.includes(c.carrier)) prev.also.push(c.carrier); continue; }
        seen.set(key, { line: l, c, st: statesOf([l]), also: [] });
      }
    }
    /* group: a tiled source by carrier · status · 0.1° cell · state set; any
       other source keeps one record per line */
    const groups = new Map();
    for (const [key, s] of seen) {
      if (!s.st.length) continue;
      const carrier = s.also.length ? (s.also.length > 2 ? s.c.carrier + ' and ' + s.also.length + ' other providers (same line, as submitted)' : [s.c.carrier].concat(s.also).join(' / ')) : s.c.carrier;
      const cell = Math.floor(s.line[0][0] / TILE) + ':' + Math.floor(s.line[0][1] / TILE);
      const gk = src.tile ? [carrier, s.c.category, s.c.routeStatus, s.c.networkType || '', cell, s.st.join('+')].join('|') : key;
      let g = groups.get(gk); if (!g) groups.set(gk, g = { carrier, c: s.c, st: new Set(), lines: [] });
      g.lines.push(s.line); s.st.forEach(x => g.st.add(x));
    }
    const features = [], overview = [];
    for (const g of groups.values()) {
      g.lines.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1] || a.length - b.length);
      const geometry = g.lines.length === 1 ? { type: 'LineString', coordinates: g.lines[0] } : { type: 'MultiLineString', coordinates: g.lines };
      const id = src.id + '-' + sha(JSON.stringify(geometry)).slice(0, 16), st = [...g.st].sort();
      features.push({ type: 'Feature', bbox: extent(g.lines), geometry, properties: {
        id, sourceId: src.id, source: src.name, sourceUrl: raw.url, name: g.c.name || src.name, carrier: g.carrier,
        routeStatus: g.c.routeStatus, category: g.c.category, evidence: src.evidence, dataDate: null,
        metadataModified: raw.item && raw.item.modified ? new Date(raw.item.modified).toISOString() : (raw.lastEdit ? new Date(raw.lastEdit).toISOString() : null),
        retrievedAt: raw.retrievedAt, publishedLineParts: g.lines.length,
        networkType: g.c.networkType || 'Published fiber route; network class not specified',
        serviceability: 'Unconfirmed', routeDiversity: 'Unconfirmed', states: st } });
      let simple = g.lines.map(l => simplify(l, OVERVIEW_TOL));
      const big = simple.filter(l => { const e = extent([l]); return (e[2] - e[0]) + (e[3] - e[1]) >= OVERVIEW_TOL; });
      if (big.length) simple = big; else simple = [simple.slice().sort((a, b) => b.length - a.length)[0]];
      overview.push({ type: 'Feature', bbox: extent(g.lines), geometry: simple.length === 1 ? { type: 'LineString', coordinates: simple[0] } : { type: 'MultiLineString', coordinates: simple },
        properties: { id, sourceId: src.id, category: g.c.category, states: st, routeStatus: g.c.routeStatus, carrier: g.carrier } });
    }
    const per = {}; for (const f of features) for (const s of f.properties.states) per[s] = (per[s] || 0) + f.properties.publishedLineParts;
    report.push({ source: src.id, fetched: raw.features.length, skippedByRule: skipped, outsideStates: outside, invalid, duplicateLines: dup, records: features.length, lineParts: seen.size, bytes: JSON.stringify(features).length, partsByState: per });
    built.push({ src, raw, features, overview });
    console.error(src.id + ': ' + raw.features.length + ' fetched → ' + features.length + ' records / ' + seen.size + ' line parts');
  }
  console.log(JSON.stringify(report, null, 1));
  if (DRY) return;

  /* merge: each source replaces only its own records */
  const touched = new Set(), ids = new Set(built.map(b => b.src.id));
  for (const b of built) for (const f of b.features) f.properties.states.forEach(s => touched.add(s));
  for (const s of manifest.states) {
    const file = path.join(ROOT, s.code + '.geojson'), fc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const had = fc.features.some(f => ids.has(f.properties.sourceId));
    if (!had && !touched.has(s.code)) continue;
    fc.features = fc.features.filter(f => !ids.has(f.properties.sourceId));
    for (const b of built) for (const f of b.features) if (f.properties.states.includes(s.code)) fc.features.push(f);
    fs.writeFileSync(file, JSON.stringify(fc));
  }
  const ovFile = path.join(ROOT, 'overview.geojson'), ov = JSON.parse(fs.readFileSync(ovFile, 'utf8'));
  ov.features = ov.features.filter(f => !ids.has(f.properties.sourceId));
  for (const b of built) ov.features.push(...b.overview);
  fs.writeFileSync(ovFile, JSON.stringify(ov));
  manifest.sources = manifest.sources.filter(s => !ids.has(s.id));
  for (const b of built) {
    if (!b.features.length) continue;
    manifest.sources.push({ id: b.src.id, name: b.src.name, url: b.raw.url,
      itemUrl: b.raw.item ? 'https://www.arcgis.com/home/item.html?id=' + b.raw.item.id : null,
      publisher: b.src.publisher, itemModified: b.raw.item && b.raw.item.modified ? new Date(b.raw.item.modified).toISOString() : null,
      license: (b.raw.item && b.raw.item.license) || NOLICENSE, description: b.src.note || null, layerDescription: b.raw.layerName || '',
      status: 'Per record — see routeStatus', count: b.raw.features.length, downloadStatus: 'complete', retrievedAt: b.raw.retrievedAt,
      copyrightText: b.raw.copyrightText, layerLastEditDate: b.raw.lastEdit, includedFeatures: b.features.length,
      includedLineParts: b.features.reduce((n, f) => n + f.properties.publishedLineParts, 0),
      tiled: !!b.src.tile, tileDegrees: b.src.tile ? TILE : null, coordinatePrecision: 6,
      rawSha256: sha(JSON.stringify(b.features.map(f => f.geometry))) });
  }
  manifest.builtAt = new Date().toISOString();
  manifest.stateExpansion = { at: manifest.builtAt, states: TARGET, sources: [...ids], note: 'Vetted agency and carrier-published layers; contractor, locate and internal-plant layers excluded. See docs/FIBER-STATE-EXPANSION.md.' };
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.error('Merged ' + built.length + ' source(s). Now run: node scripts/import-published-fiber.js');
})().catch(e => { console.error(e); process.exitCode = 1; });
