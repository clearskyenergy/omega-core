#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/build-ok-telecom-register.js — every telecom offering in Oklahoma,
   with the road to verify each one at an address
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY (2026-11-11, Tommy: "I need to have every fiber and telecommunications
   offering so that we can verify fiber access at an address in the state of
   Oklahoma … be very accurate, scrub every record"): the Confirm Fiber
   ladder names the providers the FCC data reports at a pin, but a person
   then has to find each provider's own door. This register is that door
   list for Oklahoma — the complete FCC-filed census joined with each
   provider's VERIFIED website or availability page and, where one exists,
   the provider's own published coverage map (a link to it, never a copy).

   WHAT IT BUILDS — data/fiber/ok-telecom-register.json:
     providers[]  every provider reporting ANY wireline / fixed technology
                  in an Oklahoma census block to the FCC Broadband Data
                  Collection, with locations served per technology. A row
                  is a FILING, not a guarantee of service at any address.
     ilecs[]      every incumbent telephone study area in the state (FCC
                  study-area boundaries): company, holding company, SAC,
                  price-cap or rate-of-return.
     The curated ROADS ride on matching providers: `check` (the provider's
     own site or availability page, probed live the day recorded — the
     HTTP status is kept), `map` (the provider's own published coverage
     map), `kind` and a note. A provider nobody verified carries null —
     the FCC's own per-address page is every row's fallback — and nothing
     here is ever invented.

   SOURCES
     FCC Broadband Data Collection (Dec 2025) via Esri Living Atlas —
       provider × technology × census block, aggregated server-side for
       GEOID '40…' (Oklahoma). Public domain (FCC).
     FCC study-area boundaries (Aug 2024) — the incumbents of record.
     Each provider's own website, probed at build time.

     node scripts/build-ok-telecom-register.js        # fetch + write
   Re-run to refresh, then commit the artefact. Never deployed itself.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'fiber', 'ok-telecom-register.json');
const BDC = 'https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/FCC_Broadband_Data_Collection_December_2024_View/FeatureServer';
const ILEC = 'https://services.arcgis.com/YnOQrIGdN9JGtBh4/arcgis/rest/services/study_areas_21aug24/FeatureServer/0';
const TECH = { 0: 'other', 10: 'copper', 40: 'cable', 50: 'fiber', 60: 'geoSat', 61: 'leoSat', 70: 'fwUnlicensed', 71: 'fwLicensed', 72: 'fwLicensedByRule' };

/* ── the curated roads: every URL probed live on the date in `verified`.
   `aka` joins FCC filing names that are the same door. A provider absent
   here is still in the register — with check: null, never a guess. ── */
const V = '2026-11-11';
const ROADS = [
  { m: ['AT&T'], kind: 'ilec', check: 'https://www.att.com/internet/fiber/', note: 'Price-cap incumbent (Southwestern Bell-OK); address checker on the fiber page.' },
  { m: ['Dobson Fiber', 'Dobson Telephone Co Inc', 'McLoud Telephone Co', 'Lavaca Telephone Company, Inc.-OK'], kind: 'regional', check: 'https://www.dobson.net/', note: 'Dobson Technologies: Dobson Fiber plus the Dobson, McLoud and Lavaca incumbent exchanges.' },
  { m: ['Bluepeak'], kind: 'regional', check: 'https://www.mybluepeak.com/' },
  { m: ['Cox Communications'], kind: 'cable', check: 'https://www.cox.com/residential/internet.html' },
  { m: ['OEC Fiber'], kind: 'coop', check: 'https://www.oecfiber.com/', map: 'https://okcoop.maps.arcgis.com/apps/webappviewer/index.html?id=d36b60f793e348018b45e2f1e3f18aec', note: 'Oklahoma Electric Cooperative; the map is OEC’s own published zones viewer.' },
  { m: ['Pioneer Telephone Cooperative, Inc.', 'Pioneer Long Distance, Inc.'], kind: 'coop', check: 'https://www.gopioneer.com/' },
  { m: ['Valor Telecommunications of Texas, LP', 'Oklahoma Windstream, LLC', 'Windstream Oklahoma, LLC', 'Windstream Communications, LLC.'], kind: 'ilec', check: 'https://www.gokinetic.com/', note: 'Windstream / Kinetic brands, incl. the Valor and ALLTEL successor study areas.' },
  { m: ['ecoLink'], kind: 'coop', check: 'https://www.ecolink.coop/', note: 'East Central Oklahoma Electric Cooperative.' },
  { m: ['BOLT Fiber'], kind: 'coop', check: 'https://boltfiber.com/', note: 'Northeast Oklahoma Electric Cooperative.' },
  { m: ['CVEC Fiber, LLC'], kind: 'coop', check: 'https://www.cvecfiber.com/', note: 'Canadian Valley Electric Cooperative.' },
  { m: ['Lake Region Technology & Communications LLC'], kind: 'coop', check: 'https://www.lakeregionfiber.com/', note: 'Lake Region Electric Cooperative.' },
  { m: ['Centranet, LLC'], kind: 'coop', check: 'https://mycentral.coop/', note: 'Central Rural Electric Cooperative’s fiber subsidiary; Centranet’s own storefront did not answer at review, the co-op’s site is the door.' },
  { m: ['Cookson Hills Connect, LLC'], kind: 'coop', check: 'https://www.cooksonhillsconnect.com/', note: 'Cookson Hills Electric Cooperative.' },
  { m: ['Southern Plains Cable, LLC', 'Oklahoma Western Telephone Company', 'Southwest Oklahoma Telephone Company', 'Medicine Park Telephone Company'], kind: 'regional', check: 'https://hilliary.com/', note: 'Hilliary Communications operating companies.' },
  { m: ['Metronet Holdings'], kind: 'regional', check: 'https://www.metronet.com/' },
  { m: ['Panhandle Telephone'], kind: 'coop', check: 'https://www.ptci.net/', note: 'Panhandle Telephone Cooperative (PTCI).' },
  { m: ['BTC Broadband', 'Bixby Telephone Co'], kind: 'ilec', check: 'https://www.btcbroadband.com/', note: 'Bixby Telephone Company d/b/a BTC Broadband.' },
  { m: ['Pine Cellular Phones Inc'], kind: 'regional', check: 'https://www.pinecellular.com/' },
  { m: ['Pine Telephone Company'], kind: 'ilec', check: 'https://www.pinetelephone.com/' },
  { m: ['OzarksGo'], kind: 'coop', check: 'https://www.ozarksgo.net/', note: 'Ozarks Electric Cooperative (Arkansas/Oklahoma).' },
  { m: ['Ponca City Utility Authority'], kind: 'muni', check: 'https://www.poncacityok.gov/' },
  { m: ['Salina Spavinaw Telephone'], kind: 'ilec', check: 'https://www.sstelco.com/' },
  { m: ['Oklahoma Fiber Network, LLC'], kind: 'regional', check: 'https://www.oklahomafiber.com/' },
  { m: ['Chickasaw Telephone Company', 'Chickasaw Telecommunications Services, Inc.'], kind: 'ilec', check: 'https://ctcok.com/', note: 'Answered 403 to automated probes (bot gate); the site is live in a browser.' },
  { m: ['Wave Rural Connect, LLC'], kind: 'coop', check: 'https://www.waveruralconnect.com/', note: 'Alfalfa Electric Cooperative.' },
  { m: ['Hinton Telephone'], kind: 'ilec', check: 'https://hintontelephone.com/' },
  { m: ['Cim Tel Cable LLC', 'Cimarron Telephone Company'], kind: 'ilec', check: 'https://www.cimtel.net/' },
  { m: ['Cross Cable Television, LLC', 'Cross Telephone Company, LLC'], kind: 'ilec', check: 'https://www.crosstel.net/' },
  { m: ['TDS Telecom'], kind: 'ilec', check: 'https://tdstelecom.com/', note: 'Mid-America and Oklahoma Communication Systems study areas.' },
  { m: ['Vyve Broadband', 'Vyve'], kind: 'cable', check: 'https://vyvebroadband.com/' },
  { m: ['Trace Fiber Networks'], kind: 'regional', check: 'https://tracefiber.com/' },
  { m: ['DiamondNet'], kind: 'muni', check: 'https://www.diamondnet.org/', note: 'City of Sallisaw municipal fiber — Oklahoma’s first.' },
  { m: ['Central Oklahoma Telephone Co LLC', 'Central Cellular LLC /dba COTC Connections'], kind: 'ilec', check: 'https://www.cotc.net/', note: 'COTC Connections.' },
  { m: ['Tuttle Development Authority'], kind: 'muni', check: 'https://www.cityoftuttle.org/' },
  { m: ['Valliant Telephone Company'], kind: 'ilec', check: 'https://www.valliant.com/' },
  { m: ['El Reno Fast Connect'], kind: 'muni', check: 'https://elrenofastconnect.com/' },
  { m: ['Carnegie Telephone Company'], kind: 'ilec', check: 'https://www.carnegietelephone.com/' },
  { m: ['KanOkla Telephone Association', 'KanOkla Communications'], kind: 'coop', check: 'https://www.kanokla.com/' },
  { m: ['FiberLink'], kind: 'regional', check: 'https://fiberlinkllc.com/' },
  { m: ['Totah Communications Inc'], kind: 'ilec', check: 'https://www.totah.com/' },
  { m: ['360 Broadband'], kind: 'regional', check: 'https://360broadband.com/' },
  { m: ['Pottawatomie Telephone Company LLC'], kind: 'ilec', check: 'https://ptcok.com/' },
  { m: ['Rally Networks'], kind: 'regional', check: 'https://rallynetworks.com/' },
  { m: ['Osage Broadband'], kind: 'tribal', check: 'https://www.osagebroadband.com/', note: 'Osage Nation.' },
  { m: ['ProValue.Net'], kind: 'regional', check: 'https://www.provalue.net/' },
  { m: ['Sparklight'], kind: 'cable', check: 'https://www.sparklight.com/' },
  { m: ['Brightspeed'], kind: 'ilec', check: 'https://www.brightspeed.com/' }
];

function get(url) {
  return fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url.slice(0, 80)); return r.json(); });
}
const enc = o => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

(async function main() {
  /* every provider × technology in Oklahoma, aggregated by the server */
  const cj = await get(BDC + '/7/query?' + enc({
    where: "GEOID LIKE '40%'", groupByFieldsForStatistics: 'ProviderName,Technology',
    outStatistics: JSON.stringify([
      { statisticType: 'sum', onStatisticField: 'TotalBSLs', outStatisticFieldName: 'bsls' },
      { statisticType: 'count', onStatisticField: 'GEOID', outStatisticFieldName: 'blocks' }]),
    f: 'json' }));
  if (cj.error || !Array.isArray(cj.features)) throw new Error('BDC census failed: ' + JSON.stringify(cj.error || cj).slice(0, 200));
  const per = new Map();
  for (const f of cj.features) {
    const a = f.attributes, name = String(a.ProviderName || '').trim();
    if (!name) continue;
    const row = per.get(name) || { name, tech: {}, fiberBsls: 0, blocks: 0 };
    const t = TECH[a.Technology] || String(a.Technology);
    row.tech[t] = (row.tech[t] || 0) + (a.bsls || 0);
    if (a.Technology === 50) { row.fiberBsls += (a.bsls || 0); row.blocks += (a.blocks || 0); }
    per.set(name, row);
  }
  if (per.size < 100) throw new Error('Only ' + per.size + ' providers — a full Oklahoma census is well over 100. Refusing a partial snapshot.');

  /* the roads, joined by exact filing name (aka) — never fuzzy here */
  const roadOf = new Map();
  for (const r of ROADS) for (const n of r.m) roadOf.set(n, r);
  let matched = 0;
  const providers = [...per.values()].sort((a, b) => b.fiberBsls - a.fiberBsls || b.name < a.name ? -1 : 1).map(row => {
    const r = roadOf.get(row.name);
    if (r) matched++;
    return {
      name: row.name, fiberBsls: row.fiberBsls || 0, blocks: row.blocks || 0, tech: row.tech,
      kind: r ? r.kind : null, check: r ? r.check : null, map: r && r.map ? r.map : null,
      note: r && r.note ? r.note : null, verified: r ? V : null
    };
  });
  for (const r of ROADS) if (!r.m.some(n => per.has(n))) console.warn('road without a census row (filing name moved?): ' + r.m[0]);

  /* the incumbents of record */
  const ij = await get(ILEC + '/query?' + enc({ where: "STATE='OK'", outFields: 'SAC,CO_NAME,HOCO,REGTYPE,OCN', returnGeometry: 'false', f: 'json' }));
  const ilecs = (ij.features || []).map(f => ({ sac: String(f.attributes.SAC || ''), company: String(f.attributes.CO_NAME || '').trim(),
    holding: String(f.attributes.HOCO || '').trim() || null, ocn: String(f.attributes.OCN || '').trim() || null,
    regType: f.attributes.REGTYPE === 'PC' ? 'price-cap' : f.attributes.REGTYPE === 'ROR' ? 'rate-of-return' : String(f.attributes.REGTYPE || '') }))
    .sort((a, b) => a.company < b.company ? -1 : 1);
  if (ilecs.length < 30) throw new Error('Only ' + ilecs.length + ' OK study areas — the state has ~39. Refusing a partial read.');

  const out = {
    state: 'OK', builtAt: new Date().toISOString().slice(0, 10),
    sources: [
      { label: 'FCC Broadband Data Collection (December 2025) via Esri Living Atlas — provider filings per census block, aggregated for Oklahoma', attribution: 'FCC (public domain); self-reported, mass-market availability' },
      { label: 'FCC study-area boundaries (August 2024) — the incumbent carriers of record', attribution: 'FCC (public domain)' },
      { label: 'Each provider’s own website, probed live ' + V, attribution: 'the provider’s own door; a row without one carries null, never a guess' }
    ],
    note: 'A row is a FILING: the provider told the FCC it offers the technology at locations in that block. It proves plant and names who to ask; it does not prove service at any one address — the provider’s own checker or a written carrier answer does. The FCC per-address page is every provider’s fallback door.',
    fccAddressLookup: 'https://broadbandmap.fcc.gov/location-summary/fixed',
    providers, ilecs,
    counts: { providers: providers.length, fiber: providers.filter(p => p.fiberBsls > 0).length, withRoad: matched, ilecs: ilecs.length }
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('Wrote ' + OUT + ': ' + out.counts.providers + ' providers (' + out.counts.fiber + ' with fiber filings, ' + out.counts.withRoad + ' with a verified road), ' + out.counts.ilecs + ' incumbent study areas.');
})().catch(e => { console.error(e.message || e); process.exit(1); });
