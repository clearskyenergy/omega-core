/* ═══════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · omega-fiber-confirm.js  (v2 · 2026-11-09)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   How a site's fiber gets CONFIRMED, not just mapped — for one address:
   who the fiber providers are, the telecom facts around it, and everything
   a carrier has to put in writing before the fiber counts as verified.

   WHY: the public route inventory is partial — Oklahoma held three records
   when a 66-site Oklahoma portfolio was screened, so every site read
   "0 / 100, no route in view" and the panel had nothing to say about what to
   do next (2026-11-09, Tommy: "ways we can go and confirm the fiber … I need
   to be able to know on an address the fiber provider and the telecom
   details and all things needed to get fiber verification"). A map with no
   line on it is not a site with no fiber; it is a site nobody has asked a
   carrier about. This file answers "who do we ask, what do we ask, and what
   must come back".

   THE LADDER — four rungs, each a different kind of evidence, never merged:
     1 · MAPPED     published route geometry near the site (the inventory)
     2 · REPORTED   a named provider reports fiber-to-the-premises in the
                    site's census block / H3 hex in the FCC Broadband Data
                    Collection. Self-reported, mass-market availability —
                    it proves plant in the ground nearby and names the
                    carrier; it does NOT prove dedicated symmetrical service.
     3 · QUOTED     the carrier answered the RFI with a written quote
     4 · CONFIRMED  a service order, or the carrier's written confirmation
                    of serviceability at the bandwidth the offtake needs
   Rungs 1–2 are read from public data. Rungs 3–4 are only ever a human's
   evidence; nothing here promotes a site to them.

   PUBLIC SOURCES (all keyless, asked live at the point, never bundled):
     · FCC Broadband Data Collection, December 2025 (Esri Living Atlas):
       census blocks and H3 resolution-8 hexes, each with every provider ×
       technology. Technology 50 = fiber to the premises (the FCC's code).
     · FCC study-area boundaries (published by the FCC, Aug 2024): the
       INCUMBENT local exchange carrier of record at the point — company,
       holding company, study area code, operating company number, and
       whether it is a price-cap or a rate-of-return (rural) carrier.

   ES5 on purpose (CLAUDE.md: no build step). Everything but lookup() is a
   pure function — scripts/tests/tfiberconfirm.js holds it.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SOURCE = {
    name: 'FCC Broadband Data Collection',
    asOf: 'December 2025',
    service: 'https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/FCC_Broadband_Data_Collection_December_2024_View/FeatureServer',
    block: { layer: 4, table: 7, extra: ',CountyName,StateName' },   /* polygon layer → its provider table */
    hex:   { layer: 5, table: 6 },
    ilec: 'https://services.arcgis.com/YnOQrIGdN9JGtBh4/arcgis/rest/services/study_areas_21aug24/FeatureServer/0',
    ilecAsOf: 'August 2024',
    /* The FCC's Form 499 filer database: a carrier's legal name, headquarters
       and customer-inquiry contact. It refuses automated requests, so it is
       a page a person opens, never something fetched. */
    filerSearch: 'https://apps.fcc.gov/cgb/form499/499a.cfm',
    attribution: 'FCC Broadband Data Collection (December 2025) via Esri Living Atlas, and FCC study-area boundaries (August 2024). Provider self-reported, mass-market availability.'
  };
  var FIBER = 50, CABLE = 40, COPPER = 10, NEAR_KM = 1.5;
  var TECH = { 0: 'Other', 10: 'Copper', 40: 'Cable', 50: 'Fiber', 60: 'GEO satellite', 61: 'LEO satellite',
               70: 'Unlicensed fixed wireless', 71: 'Licensed fixed wireless', 72: 'Licensed-by-rule fixed wireless' };
  var REG = { PC: 'price-cap carrier', ROR: 'rate-of-return (rural) carrier' };

  function num(v) { v = +v; return isFinite(v) ? v : 0; }
  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function titleCase(s) {
    s = clean(s); if (s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^|[\s\-\/(.])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
            .replace(/\b(Inc|Llc|Co|Corp)\b\.?/g, function (m) { return m.toUpperCase() === 'LLC' ? 'LLC' : m; })
            .replace(/\bLlc\b/g, 'LLC').replace(/\b(Ok|Mo|Nm|Ks|Ar|Al|Oh|Il|Tx)\b$/g, function (m) { return m.toUpperCase(); })
            .replace(/At&t/g, 'AT&T').replace(/ (Of|And|The) /g, function (m) { return m.toLowerCase(); });
  }
  /* two spellings of one company: "Panhandle Telephone" and "PANHANDLE
     TELEPHONE COOPERATIVE INC." */
  function coKey(s) {
    return clean(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\b(inc|llc|l l c|corp|corporation|company|co|cooperative|coop|association|assn|the|of|dba|d b a|communications|telecommunications|telephone|telecom|services|holdings|technologies)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function sameCo(a, b) {
    var x = coKey(a), y = coKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    var xs = x.split(' '), ys = y.split(' ');
    return xs[0] === ys[0] && (xs.length === 1 || ys.length === 1 || xs[1] === ys[1]);
  }

  /* ── pure: one geography (block or hex) from its polygon + provider rows ── */
  function area(kind, attr, rows) {
    if (!attr) return null;
    var providers = [], fiber = [], seen = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i] || {}, name = clean(r.ProviderName);
      if (!name) continue;
      var p = { name: name, tech: num(r.Technology), techName: TECH[num(r.Technology)] || 'Other',
                totalBsls: num(r.TotalBSLs), servedBsls: num(r.ServedBSLs) };
      providers.push(p);
      /* a fiber record with locations is plant in the ground, whatever speed
         tier it is sold at; one row per provider */
      if (p.tech === FIBER && p.totalBsls > 0 && !seen[name.toLowerCase()]) { seen[name.toLowerCase()] = 1; fiber.push(p); }
    }
    fiber.sort(function (a, b) { return b.totalBsls - a.totalBsls || (a.name < b.name ? -1 : 1); });
    return { kind: kind, geoid: clean(attr.GEOID), county: clean(attr.CountyName), stateName: clean(attr.StateName), totalBsls: num(attr.TotalBSLs),
             fiberServedBsls: num(attr.ServedBSLsFiber), providers: providers, fiber: fiber };
  }
  function ilecOf(a) {
    if (!a) return null;
    var company = titleCase(a.CO_NAME), holding = clean(a.HOCO);
    return { company: company, holding: holding, sac: clean(a.SAC), ocn: clean(a.OCN), state: clean(a.STATE),
             regType: clean(a.REGTYPE), regulation: REG[clean(a.REGTYPE)] || (clean(a.REGTYPE) || 'regulation type not stated'),
             /* the name a person searches or calls: the parent where it is a
                different company, with the operating company beside it */
             label: holding && !sameCo(holding, company) ? holding + ' (' + company + ')' : (company || holding) };
  }
  /* the ring around the site: fiber providers across the hexes within
     ~1.5 km. A site on the edge of town sits in a block or hex with no
     fiber rows while the whole town beside it is served — the ring is what
     keeps that site from reading as empty. rows: provider × hex fiber rows;
     null = the ring was not answered (not looked), [] = looked, none. */
  function ringOf(rows, hexCount) {
    if (!rows) return null;
    var by = {}, out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {}, name = clean(r.ProviderName), n = num(r.TotalBSLs);
      if (!name || num(r.Technology) !== FIBER || n <= 0) continue;
      var k = name.toLowerCase();
      if (!by[k]) { by[k] = { name: name, tech: FIBER, techName: 'Fiber', totalBsls: 0, hexes: 0 }; out.push(by[k]); }
      by[k].totalBsls += n; by[k].hexes++;
    }
    out.sort(function (a, b) { return b.totalBsls - a.totalBsls || (a.name < b.name ? -1 : 1); });
    return { radiusKm: NEAR_KM, hexes: num(hexCount), fiber: out };
  }
  function normalize(blockAttr, blockRows, hexAttr, hexRows, ilecAttr, nearRows, nearHexes) {
    return { asOf: SOURCE.asOf, source: SOURCE.name, attribution: SOURCE.attribution,
             block: area('block', blockAttr, blockRows), hex: area('hex', hexAttr, hexRows), ilec: ilecOf(ilecAttr),
             nearby: ringOf(nearRows, nearHexes) };
  }

  /* ── pure: every wireline / fixed-wireless provider at the point, by
     technology — the "telecom details" beside the fiber answer. Satellite
     is everywhere and says nothing about a site, so it is left out. ───── */
  function byTech(bdc) {
    var a = bdc && (bdc.block || bdc.hex), out = [], order = [FIBER, CABLE, COPPER, 71, 72, 70, 0], got = {};
    if (!a) return out;
    for (var i = 0; i < a.providers.length; i++) {
      var p = a.providers[i];
      if (p.tech === 60 || p.tech === 61 || p.totalBsls <= 0) continue;
      (got[p.tech] = got[p.tech] || []).push(p);
    }
    for (var o = 0; o < order.length; o++) if (got[order[o]]) {
      got[order[o]].sort(function (x, y) { return y.totalBsls - x.totalBsls; });
      out.push({ tech: order[o], techName: TECH[order[o]], scope: a.kind, of: a.totalBsls, providers: got[order[o]] });
    }
    return out;
  }

  /* ── pure: who to ask, best evidence first, each with WHY ──────────────── */
  function carriers(bdc, routes) {
    var out = [];
    function add(name, basis, rank, kind) {
      name = clean(name);
      if (!name || /^(not published|unknown|operator unknown|null|none)$/i.test(name)) return;
      for (var k = 0; k < out.length; k++) if (sameCo(out[k].name, name)) { if (out[k].basis.indexOf(basis) < 0 && out[k].also.length < 2) out[k].also.push(basis); return; }
      out.push({ name: name, basis: basis, rank: rank, kind: kind, also: [] });
    }
    var b = bdc && bdc.block, h = bdc && bdc.hex, il = bdc && bdc.ilec, i;
    for (i = 0; b && i < b.fiber.length; i++)
      add(b.fiber[i].name, 'reports fiber to ' + b.fiber[i].totalBsls + ' of ' + b.totalBsls + ' locations in the site’s census block (FCC BDC, ' + SOURCE.asOf + ')', 1, 'fiber');
    for (i = 0; h && i < h.fiber.length; i++)
      add(h.fiber[i].name, 'reports fiber to ' + h.fiber[i].totalBsls + ' of ' + h.totalBsls + ' locations in the surrounding ~0.7 km² hex (FCC BDC, ' + SOURCE.asOf + ')', 2, 'fiber');
    var nb = bdc && bdc.nearby;
    for (i = 0; nb && i < nb.fiber.length && i < 6; i++)
      add(nb.fiber[i].name, 'reports fiber to ' + nb.fiber[i].totalBsls + ' locations within ~' + nb.radiusKm + ' km of the site (FCC BDC, ' + SOURCE.asOf + ')', 2, 'fiber');
    if (il && il.label)
      add(il.label, 'incumbent telephone company of record here (FCC study area ' + il.sac + ', ' + il.regulation + ') — ask its business / wholesale desk for dedicated fiber', 3, 'incumbent');
    var cab = b || h;
    for (i = 0; cab && i < cab.providers.length; i++) if (cab.providers[i].tech === CABLE && cab.providers[i].totalBsls > 0)
      add(cab.providers[i].name, 'reports cable service here — fiber-fed plant; its business arm usually sells dedicated fiber off it', 4, 'cable');
    for (i = 0; i < (routes || []).length; i++) {
      var r = routes[i] || {};
      add(r.operator || r.carrier, 'operator of a published route ' + (isFinite(+r.km) ? (Math.round(+r.km * 10) / 10) + ' km' : 'near') + ' from the site', 5, 'route');
    }
    return out;
  }

  /* ── pure: the ladder ──────────────────────────────────────────────────
     ev: { mappedMeasured, mappedKm, screenRoutes (count|null),
           bdc (normalize() result | null = looked, none | undefined = not looked),
           bdcError } */
  function names(list) { var a = []; for (var i = 0; i < list.length && i < 4; i++) a.push(list[i].name); return a.join(', ') + (list.length > 4 ? ' and ' + (list.length - 4) + ' more' : ''); }
  function ladder(ev) {
    ev = ev || {};
    var rungs = [], km = ev.mappedKm, mapped;
    if (km != null && isFinite(+km) && +km <= 8) mapped = { status: 'yes', detail: 'Published route geometry ' + (Math.round(+km * 10) / 10) + ' km from the site.' };
    else if (ev.screenRoutes > 0) mapped = { status: 'yes', detail: ev.screenRoutes + ' published route record(s) within the server screen’s radius.' };
    else if (ev.mappedMeasured || ev.screenRoutes === 0) mapped = { status: 'no', detail: 'No published route near the site in the loaded inventory. The inventory is partial — this is not evidence of absence.' };
    else mapped = { status: 'unknown', detail: 'Not looked — enable a fiber layer or run the fiber evidence check.' };
    mapped.key = 'mapped'; mapped.label = 'Mapped'; rungs.push(mapped);

    var rep, b = ev.bdc && ev.bdc.block, h = ev.bdc && ev.bdc.hex, il = ev.bdc && ev.bdc.ilec, nb = ev.bdc && ev.bdc.nearby;
    if (ev.bdc === undefined) rep = { status: 'unknown', detail: ev.bdcError ? 'FCC lookup failed (' + ev.bdcError + '). Not a reading.' : 'FCC lookup not run yet.' };
    else if (b && b.fiber.length) rep = { status: 'yes', detail: b.fiber.length + (b.fiber.length === 1 ? ' provider reports' : ' providers report') + ' fiber in the site’s own census block: ' + names(b.fiber) + '.' };
    else if (h && h.fiber.length) rep = { status: 'near', detail: 'No fiber reported in the site’s block, but ' + names(h.fiber) + ' report' + (h.fiber.length === 1 ? 's' : '') + ' fiber in the surrounding hex.' };
    else if (nb && nb.fiber.length) rep = { status: 'near', detail: (b && !b.totalBsls ? 'The FCC data records no serviceable location in the site’s own block (unaddressed land), so the block is silent. ' : 'No fiber reported in the site’s block or hex. ') + 'Within ~' + nb.radiusKm + ' km: ' + names(nb.fiber) + ' report' + (nb.fiber.length === 1 ? 's' : '') + ' fiber.' };
    else rep = { status: 'no', detail: 'No provider reports fiber in the site’s block, its hex' + (nb ? ' or within ~' + NEAR_KM + ' km' : '') + '. Expect a build; ask ' + (il && il.label ? 'the incumbent (' + il.label + '), ' : '') + 'the nearest route operators and the regional carriers.' };
    rep.key = 'reported'; rep.label = 'Reported (FCC)'; rungs.push(rep);

    rungs.push({ key: 'quoted', label: 'Quoted', status: 'open', detail: 'Send the carrier RFI. A written quote for the lateral and the service moves the site here.' });
    rungs.push({ key: 'confirmed', label: 'Confirmed', status: 'open', detail: 'A service order or the carrier’s written confirmation at the offtake bandwidth. Nothing on a map reaches this rung.' });

    var reached = 0;
    if (mapped.status === 'yes') reached = 1;
    if (rep.status === 'yes' || rep.status === 'near') reached = 2;
    return { rungs: rungs, reached: reached,
             summary: reached === 2 ? 'Reported — named carriers to ask. Serviceability still unconfirmed.'
                    : reached === 1 ? 'Mapped only — route geometry nearby, no carrier named by the FCC data.'
                    : 'Nothing found yet — unconfirmed either way.' };
  }

  /* ── pure: the verification package — what "fiber verified" is made of.
     The first three are read from public data; the rest are documents only
     a carrier can issue, and they are what a lender or an offtaker files. */
  function pack(ev) {
    ev = ev || {};
    var bdc = ev.bdc, lad = ladder(ev), list = carriers(bdc || null, ev.routes || []);
    var fib = 0; for (var i = 0; i < list.length; i++) if (list[i].kind === 'fiber') fib++;
    var il = bdc && bdc.ilec;
    return [
      { key: 'providers', label: 'Fiber providers at the address identified', who: 'public data', done: fib > 0,
        detail: fib ? fib + ' named by the FCC data' : (bdc === undefined ? 'FCC lookup not answered' : 'None reported — the RFI list falls back to the incumbent and route operators') },
      { key: 'incumbent', label: 'Incumbent telephone company of record', who: 'public data', done: !!(il && il.label),
        detail: il && il.label ? il.label + ' · study area ' + il.sac + (il.ocn ? ' · OCN ' + il.ocn : '') + ' · ' + il.regulation : 'Not resolved' },
      { key: 'routes', label: 'Published route evidence near the site', who: 'public data', done: lad.rungs[0].status === 'yes', detail: lad.rungs[0].detail },
      { key: 'serviceability', label: 'Carrier serviceability statement', who: 'carrier', done: false,
        detail: 'On-net or near-net at this address, in writing, naming the serving splice point or lit building and its distance.' },
      { key: 'quote', label: 'Written quote at the offtake bandwidth', who: 'carrier', done: false,
        detail: 'Dedicated symmetrical service: non-recurring (construction) cost, monthly recurring cost, term, and the standard interval to service.' },
      { key: 'lateral', label: 'Lateral route and construction scope', who: 'carrier', done: false,
        detail: 'The carrier’s route for the lateral (KMZ or drawing): length, aerial or underground, permits, make-ready, and who pays.' },
      { key: 'diversity', label: 'Route diversity statement', who: 'carrier', done: false,
        detail: 'Whether a second, physically diverse path and building entrance exist — from which route. Two carrier names do not prove two paths.' },
      { key: 'handoff', label: 'Demarcation, handoff and SLA', who: 'carrier', done: false,
        detail: 'Demarc location on site, handoff type (e.g. 10GBASE-LR), availability SLA, latency to the named PoP or exchange.' },
      { key: 'order', label: 'Service order or letter of commitment', who: 'you + carrier', done: false,
        detail: 'The executed order (or the carrier’s signed serviceability letter where the lender accepts it). This is the document that reads "confirmed".' }
    ];
  }

  /* ── pure: the carrier RFI ─────────────────────────────────────────────
     site: { address, lat, lng, use }   need: { gbps, minGbps }
     Wears no platform or tenant name: the sender signs it. */
  function where(site) { return (site.address ? site.address + ' ' : '') + '(' + (+site.lat).toFixed(5) + ', ' + (+site.lng).toFixed(5) + ')'; }
  function rfi(site, list, need, bdc) {
    site = site || {}; need = need || {};
    var g = need.gbps || 10, mn = need.minGbps || 5, L = [], i;
    L.push('Subject: Fiber service inquiry — ' + (site.address || ((+site.lat).toFixed(5) + ', ' + (+site.lng).toFixed(5))));
    L.push('');
    if (list && list.length) {
      L.push('To (one request per carrier):');
      for (i = 0; i < list.length; i++) L.push('  • ' + list[i].name + ' — ' + list[i].basis);
      L.push('');
    }
    L.push('Hello,');
    L.push('');
    L.push('We are evaluating a site at ' + where(site) + ' for ' + (site.use || 'a commercial facility') + ' and need to confirm fiber service.'
      + (bdc && bdc.block && bdc.block.geoid ? ' For your records the location is in census block ' + bdc.block.geoid + '.' : '') + ' Please advise:');
    L.push('');
    L.push('1. Serviceability — Is this address on-net or near-net? Where is your nearest splice point or lit building, and how far is it from the site?');
    L.push('2. Service — Can you deliver dedicated, symmetrical ' + g + ' Gbps (minimum ' + mn + ' Gbps)? Please note which products apply: dedicated internet, wavelength, Ethernet transport, dark fiber.');
    L.push('3. Construction — What lateral build is required (length, aerial or underground), what is the non-recurring cost, and who bears it?');
    L.push('4. Timeline — Standard interval from order to service, including any permitting or make-ready.');
    L.push('5. Diversity — Is a second, physically diverse path or building entrance available? From which route?');
    L.push('6. Handoff — Demarcation location, handoff type, SLA, and estimated latency to your nearest major PoP or internet exchange.');
    L.push('7. Commercials — Indicative monthly recurring cost and term options.');
    L.push('');
    L.push('A written reply we can keep in the diligence file is appreciated, even if the answer is that the site is not serviceable. A route sketch or KMZ for the lateral would be especially helpful.');
    L.push('');
    L.push('Thank you,');
    L.push('[Name · Company · Phone · Email]');
    return L.join('\n');
  }

  /* ── pure: the verification brief for one address — every fact above on
     one page, for the diligence file or to hand to whoever makes the calls */
  function brief(site, ev, need) {
    site = site || {}; ev = ev || {};
    var bdc = ev.bdc, lad = ladder(ev), list = carriers(bdc || null, ev.routes || []), pk = pack(ev), L = [], i, j;
    L.push('FIBER VERIFICATION BRIEF');
    L.push(where(site));
    if (site.use) L.push('For: ' + site.use);
    L.push('Status: ' + lad.summary);
    L.push('');
    L.push('TELECOM FACTS (public record)');
    if (bdc && bdc.block) L.push('  Census block ' + bdc.block.geoid + ' — ' + bdc.block.totalBsls + ' serviceable location(s), ' + bdc.block.fiberServedBsls + ' fiber-served');
    if (bdc && bdc.hex) L.push('  Surrounding hex ' + bdc.hex.geoid + ' — ' + bdc.hex.totalBsls + ' location(s), ' + bdc.hex.fiberServedBsls + ' fiber-served');
    if (bdc && bdc.nearby && bdc.nearby.fiber.length) { var nf = []; for (j = 0; j < bdc.nearby.fiber.length && j < 6; j++) nf.push(bdc.nearby.fiber[j].name + ' (' + bdc.nearby.fiber[j].totalBsls + ' locations)'); L.push('  Fiber within ~' + bdc.nearby.radiusKm + ' km: ' + nf.join('; ')); }
    if (bdc && bdc.ilec) L.push('  Incumbent telephone company: ' + bdc.ilec.label + ' — study area ' + bdc.ilec.sac + (bdc.ilec.ocn ? ', OCN ' + bdc.ilec.ocn : '') + ', ' + bdc.ilec.regulation);
    if (bdc === undefined) L.push('  FCC lookup not answered' + (ev.bdcError ? ' (' + ev.bdcError + ')' : '') + ' — not a reading.');
    var bt = byTech(bdc);
    for (i = 0; i < bt.length; i++) {
      var row = [];
      for (j = 0; j < bt[i].providers.length && j < 6; j++) row.push(bt[i].providers[j].name + ' (' + bt[i].providers[j].totalBsls + '/' + bt[i].of + ')');
      L.push('  ' + bt[i].techName + ': ' + row.join('; '));
    }
    L.push('');
    L.push('MAPPED ROUTES');
    L.push('  ' + lad.rungs[0].detail);
    for (i = 0; i < (ev.routes || []).length && i < 6; i++) { var r = ev.routes[i]; L.push('  • ' + (clean(r.operator || r.carrier) || 'operator not published') + ' — ' + (isFinite(+r.km) ? (Math.round(+r.km * 10) / 10) + ' km' : 'distance not measured') + (r.note ? ' — ' + r.note : '')); }
    L.push('');
    L.push('CARRIERS TO ASK (in this order)');
    if (!list.length) L.push('  None named by the public record — start with the regional carriers.');
    for (i = 0; i < list.length; i++) L.push('  ' + (i + 1) + '. ' + list[i].name + ' — ' + list[i].basis);
    L.push('  Carrier contact details: FCC Form 499 filer database — ' + SOURCE.filerSearch);
    L.push('');
    L.push('VERIFICATION PACKAGE');
    for (i = 0; i < pk.length; i++) L.push('  [' + (pk[i].done ? 'x' : ' ') + '] ' + pk[i].label + ' (' + pk[i].who + ') — ' + pk[i].detail);
    L.push('');
    L.push('FCC map at this point: ' + fccMapUrl(site.lat, site.lng));
    L.push('Sources: ' + SOURCE.attribution + ' A provider named here has plant nearby; dedicated service is confirmed only by the carrier.');
    if (need !== false) { L.push(''); L.push('──── CARRIER RFI ────'); L.push(rfi(site, list, need || {}, bdc)); }
    return L.join('\n');
  }

  /* The FCC's own map at the same point — a human cross-check of rung 2. */
  function fccMapUrl(lat, lng) {
    return 'https://broadbandmap.fcc.gov/location-summary/fixed?zoom=15.00&vlon=' + (+lng).toFixed(6) + '&vlat=' + (+lat).toFixed(6);
  }

  /* ── network: the lookup. cb(err, bdc|null). null = looked, the point is
     in no block or hex (water, outside the US). ───────────────────────── */
  function getJson(url, cb) {
    if (typeof XMLHttpRequest === 'undefined') {
      if (typeof fetch !== 'function') return cb(new Error('no network client'));
      /* never wait for ever: a hung request is a failed lookup, which is said */
      var o = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? { signal: AbortSignal.timeout(30000) } : undefined;
      return fetch(url, o).then(function (r) { return r.json(); }).then(function (j) { cb(null, j); }, function (e) { cb(e); });
    }
    var x = new XMLHttpRequest(); x.open('GET', url, true); x.timeout = 30000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status >= 200 && x.status < 300) { try { cb(null, JSON.parse(x.responseText)); } catch (e) { cb(e); } }
      else cb(new Error('HTTP ' + x.status));
    };
    x.ontimeout = function () { cb(new Error('timeout')); };
    x.send();
  }
  function atPoint(layerUrl, lat, lng, fields) {
    return layerUrl + '/query?f=json&geometry=' + encodeURIComponent((+lng) + ',' + (+lat))
      + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false'
      + '&outFields=' + encodeURIComponent(fields);
  }
  function one(geo, lat, lng, cb) {
    getJson(atPoint(SOURCE.service + '/' + geo.layer, lat, lng, 'GEOID,TotalBSLs,ServedBSLsFiber,UniqueProvidersFiber' + (geo.extra || '')), function (err, j) {
      if (err || !j || j.error) return cb(err || new Error((j && j.error && j.error.message) || 'query failed'));
      var f = (j.features || [])[0];
      if (!f) return cb(null, null, []);
      var geoid = String(f.attributes.GEOID || '').replace(/'/g, '');
      var t = SOURCE.service + '/' + geo.table + '/query?f=json&where=' + encodeURIComponent("GEOID='" + geoid + "'")
        + '&outFields=' + encodeURIComponent('ProviderName,Technology,TotalBSLs,ServedBSLs') + '&returnGeometry=false';
      getJson(t, function (err2, r) {
        if (err2 || !r || r.error) return cb(err2 || new Error('provider table failed'));
        var rows = []; for (var i = 0; i < (r.features || []).length; i++) rows.push(r.features[i].attributes);
        cb(null, f.attributes, rows);
      });
    });
  }
  function lookup(lat, lng, cb) {
    var done = 0, fail = null, B = null, H = null, I = null, N = null, NH = 0;
    function fin() {
      if (++done < 4) return;
      if (fail && !B && !H && !I) return cb(fail);
      if (!B && !H && !I) return cb(null, null);
      cb(null, normalize(B && B[0], B && B[1], H && H[0], H && H[1], I, N, NH));
    }
    /* the ring: fiber-served hexes whose envelope lies within ~1.5 km, then
       their fiber rows in one request. A bonus like the incumbent: it never
       fails the lookup, and an unanswered ring is null, not empty. */
    var dLat = NEAR_KM / 110.57, dLng = NEAR_KM / (111.32 * Math.cos(lat * Math.PI / 180));
    getJson(SOURCE.service + '/' + SOURCE.hex.layer + '/query?f=json&geometry=' + encodeURIComponent([lng - dLng, lat - dLat, +lng + dLng, +lat + dLat].join(','))
      + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&outFields=GEOID&where=' + encodeURIComponent('ServedBSLsFiber > 0'), function (e, j) {
      if (e || !j || j.error) return fin();
      var ids = [];
      for (var i = 0; i < (j.features || []).length && i < 40; i++) ids.push("'" + String(j.features[i].attributes.GEOID).replace(/[^0-9a-f]/gi, '') + "'");
      if (!ids.length) { N = []; NH = 0; return fin(); }
      getJson(SOURCE.service + '/' + SOURCE.hex.table + '/query?f=json&where=' + encodeURIComponent('GEOID IN (' + ids.join(',') + ') AND Technology = ' + FIBER)
        + '&outFields=' + encodeURIComponent('GEOID,ProviderName,Technology,TotalBSLs') + '&returnGeometry=false', function (e2, r) {
        if (!e2 && r && !r.error) { N = []; NH = ids.length; for (var k = 0; k < (r.features || []).length; k++) N.push(r.features[k].attributes); }
        fin();
      });
    });
    /* the layers are a busy public service: a failed geography is asked once
       more before it is reported as not answered */
    function twice(geo, cb2) { one(geo, lat, lng, function (e, attr, rows) { if (!e) return cb2(null, attr, rows); one(geo, lat, lng, cb2); }); }
    twice(SOURCE.block, function (e, attr, rows) { if (e) fail = e; else if (attr) B = [attr, rows]; fin(); });
    twice(SOURCE.hex, function (e, attr, rows) { if (e) fail = e; else if (attr) H = [attr, rows]; fin(); });
    /* the incumbent is a bonus fact: its failure never fails the lookup */
    var ilecUrl = atPoint(SOURCE.ilec, lat, lng, 'SAC,CO_NAME,HOCO,REGTYPE,STATE,OCN');
    getJson(ilecUrl, function (e, j) {
      if (!e && j && !j.error) { if ((j.features || [])[0]) I = j.features[0].attributes; return fin(); }
      getJson(ilecUrl, function (e2, j2) {                      /* one more try: it is a single small request */
        if (!e2 && j2 && !j2.error && (j2.features || [])[0]) I = j2.features[0].attributes;
        fin();
      });
    });
  }

  var API = { SOURCE: SOURCE, TECH: TECH, FIBER: FIBER, normalize: normalize, byTech: byTech, carriers: carriers,
              ladder: ladder, pack: pack, rfi: rfi, brief: brief, fccMapUrl: fccMapUrl, lookup: lookup, sameCo: sameCo };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.OmegaFiberConfirm = API;
})(typeof window !== 'undefined' ? window : null);
