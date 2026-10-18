/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ==========================================================================
   omega-prime-project.js  ·  what Omega Prime writes, in one place
   --------------------------------------------------------------------------
   Omega Prime (omega-prime.html) screens one site and then SETS IT UP: a
   real projects/{id} record the rep keeps working in Site Map (Tommy,
   2026-10-16: "it does the set up and system like the artifact sandbox").
   This file is the pure half — no DOM, no Firebase — so the page and
   scripts/tests/tomegaprime.js read the same rules:

     units()       the battery list: the tenant's own products (the ONE
                   product list, omega-bess-products.js) first, then the
                   shipped reference units — CleanCell US's brochure Rev H
                   (omega-cleancell-catalog.js) and the FENECON Industrial
                   XXL; specs only, never a price
     projectDoc()  the record a new project is created with, in the shapes
                   editor.html's _loadProject reads back (bessList, mapState,
                   grid, address, type) — the drawing arrays empty, because
                   placing is the BESS Guided Build's job in Site Map, never
                   a second placement engine here (omega-storefront-handoff.js
                   says why)
     layout()      Prime's own sketch (area, unit, service, conduit) as
                   lat/lng, kept on the record as `prime.layout` for
                   reference — never a drawing key
     zipOf(), peaks()   reading an address and a bill's monthly peaks
     forType()     the unit list for a project type, from the editor's
                   catalogs (omega-site-catalogs.js): chargers, compute
                   units, solar modules and array layouts, and for a
                   microgrid those plus the battery list and the
                   generator / fuel-cell rows. Specs only, never a price.
     linkQuery()   the address, lat/lng, project id and type Site Map
                   puts on /omega-prime

   ES5. Exports for Node.
   ========================================================================== */
(function (root) {
  'use strict';

  /* editor.html BESS_CATALOG['FENECON-IND-XXL'] and its footprint row —
     FENECON's sheet. The editor re-reads its own entry by catalogKey when
     the project opens (omega-prime-handoff.js), so these are for display. */
  var XXL = { key: 'FENECON-IND-XXL', kind: 'bess', mfr: 'FENECON', model: 'Industrial XXL', name: 'FENECON Industrial XXL', short: 'XXL',
    kw: 2508, kwh: 5015, usable: 4750, hours: 2, lFt: 20, wFt: 8, hFt: 9.5, wt: '~95,000 lb',
    ac: '480 V 3-ph, UL 1741 SA', xfmr: '3,000 kVA 480/480 V', disco: '4,000 A 480 V',
    chem: 'LFP, liquid-cooled', ems: 'FEMS, open API, VPP-ready', note: '2.508 MW / 5.015 MWh · 20 ft liquid-cooled container' };

  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : null; }

  /* A BESS_CATALOG-shaped entry (what OmegaBessProducts.load() returns) → a unit. */
  function fromEntry(key, e) {
    if (!e || !(num(e.kw) && num(e.kwh))) return null;
    var w = num(e.widthFt), d = num(e.depthFt);
    var mfr = String(e.mfr || ''), model = String(e.model || key);
    return { key: key, kind: 'bess', mfr: mfr, model: model, name: (mfr && model.indexOf(mfr) !== 0 ? mfr + ' ' : '') + model, short: model,
      kw: num(e.kw), kwh: num(e.kwh), usable: num(e.usable), hours: num(e.dur) || +(num(e.kwh) / num(e.kw)).toFixed(2),
      lFt: w && d ? Math.max(w, d) : null, wFt: w && d ? Math.min(w, d) : null, hFt: null, wt: '',
      ac: '', xfmr: String(e.xfmr || ''), disco: String(e.disco || ''), chem: String(e.chem || ''), ems: '',
      note: num(e.kw).toLocaleString('en-US') + ' kW / ' + num(e.kwh).toLocaleString('en-US') + ' kWh', tenant: true };
  }

  /* ── THE SHIPPED REFERENCE UNITS ──────────────────────────────────────
     CleanCell US's brochure Rev H, read from omega-cleancell-catalog.js —
     the SAME entries the editor's battery picker features, never a second
     copy of the specs (2026-10-17, Tommy: "I need the cleancell batteries
     in the omega prime"). The editor loads that file off the picker
     (omega-bess-products.js), which Prime has no element of, so Prime loads
     it itself. Planning specifications: every one is a quote, and a
     footprint the brochure does not release stays unknown rather than being
     drawn as a generic container — drawUnits says Site Map places it. */
  var CC_NAME = { 'CLEANCELL-CC290-125-REV-H': 'CleanCell CC290/125',
                  'CLEANCELL-LGJP2-1000-REV-H': 'CleanCell LG JP-2',
                  'CLEANCELL-SM-1000-REV-H': 'CleanCell Smart Module' };

  function ccCatalog() {
    if (root.OmegaCleanCellCatalog) return root.OmegaCleanCellCatalog;
    if (typeof require === 'function') { try { return require('./omega-cleancell-catalog.js'); } catch (e) {} }
    return null;
  }

  function refs() {
    var C = ccCatalog(), out = [], e, k, u;
    if (!C || typeof C.entries !== 'function') return out;
    try { e = C.entries(); } catch (err) { return out; }
    for (k in e) {
      if (!Object.prototype.hasOwnProperty.call(e, k)) continue;
      u = fromEntry(k, e[k]);
      if (!u) continue;
      u.tenant = false; u.ref = true;
      /* A footprint the brochure has not RELEASED is not a footprint: the
         CC290/125's cabinet figures are the cabinet alone, with the PCS
         beside it to be confirmed, and the other two are pending release.
         Prime leaves all three unknown rather than laying out a pad that
         the system does not fit on; Site Map places it. */
      if (e[k].dimensionsStatus && e[k].dimensionsStatus !== 'released') { u.lFt = null; u.wFt = null; }
      if (CC_NAME[k]) { u.name = CC_NAME[k]; u.short = CC_NAME[k].replace(/^CleanCell /, ''); }
      u.note = u.note + ' DC \u00b7 ' + (e[k]._incPCS === true ? 'integrated container, PCS inside' : 'battery enclosure, separate PCS');
      out.push(u);
    }
    return out;
  }

  /* The tenant's list first (their own products lead, as they do in the
     Guided Build), then the shipped reference units — the CleanCell US
     brochure Rev H, then the FENECON Industrial XXL — each unless the
     tenant's own list already carries it.

     An OWN-ONLY workspace (omega-bess-products.js ownOnlyOf: a
     white-labelled manufacturer offers its own batteries only, 2026-10-16)
     is offered no reference unit at all: a maker's own platform must never
     lay out a competitor's container. It falls back to the XXL alone, and
     only when it has nothing placeable of its own, so nobody gets an empty
     list. */
  function units(tenant) {
    var out = [], keys = (tenant && tenant.keys) || [], i, u, have = {}, ref, hasXxl = false;
    for (i = 0; i < keys.length; i++) {
      u = fromEntry(keys[i], tenant.entries[keys[i]]);
      if (!u) continue;
      if (/industrial\s*xxl/i.test(u.name)) hasXxl = true;
      have[u.key] = true;
      out.push(u);
    }
    if (tenant && tenant.ownOnly) {
      if (!out.length) out.push(XXL);
      return out;
    }
    ref = refs();
    for (i = 0; i < ref.length; i++) if (!have[ref[i].key]) out.push(ref[i]);
    if (!hasXxl && !have[XXL.key]) out.push(XXL);
    return out;
  }

  /* The Site Map battery list entry (saveBess's shape). The catalog key is
     what the editor resolves the rest from. */
  function bessEntry(u, id) {
    return { id: id || 'prime-1', name: 'BESS-01', mfr: u.mfr || '', model: u.model || u.name,
      chem: u.chem || '', kwh: String(u.kwh), usable: u.usable == null ? '' : String(u.usable), kw: String(u.kw),
      dur: u.hours == null ? '' : String(u.hours), acv: '480', xfmr: u.xfmr || '', disco: u.disco || '',
      qty: '1', catalogKey: u.key, _fromPrime: true };
  }

  function zipOf(text) {
    var m = String(text || '').match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/);
    return m ? m[1] : '';
  }

  /* Twelve monthly peaks off a bill, pasted or typed: numbers in order,
     commas, spaces or lines; anything else is ignored. Never filled in. */
  function peaks(text) {
    var out = [], m, re = /(\d[\d,]*(?:\.\d+)?)/g, s = String(text || '');
    while ((m = re.exec(s)) && out.length < 12) {
      var n = parseFloat(m[1].replace(/,/g, ''));
      if (isFinite(n)) out.push(n);
    }
    return out;
  }

  function ll(p) { return p && isFinite(+p.lat) && isFinite(+p.lng) ? { lat: +(+p.lat).toFixed(7), lng: +(+p.lng).toFixed(7) } : null; }

  function layout(st) {
    var a = st.area;
    return {
      area: a ? { s: +a.s.toFixed(7), w: +a.w.toFixed(7), n: +a.n.toFixed(7), e: +a.e.toFixed(7),
                  wFt: Math.round(a.wFt), hFt: Math.round(a.hFt), sqft: Math.round(a.sqft) } : null,
      unit: ll(st.unitAt), poi: ll(st.poi), conduitFt: st.conduitFt ? Math.round(st.conduitFt) : null
    };
  }

  /* Editor project-type words folded onto Prime's five. Unknown stays blank
     so a handoff does not invent a battery project. */
  function primeType(key) {
    var k = String(key || '').toLowerCase().replace(/[\s_]+/g, '');
    var map = { bess: 'bess', storage: 'bess', battery: 'bess',
      ev: 'ev', evl2: 'ev', dcfc: 'ev', l2: 'ev', level2: 'ev', 'level-2': 'ev', 'ev-dcfc': 'ev', evdcfc: 'ev',
      solar: 'solar', pv: 'solar', solarpv: 'solar',
      datacenter: 'compute', compute: 'compute', 'data-center': 'compute', datacentre: 'compute',
      der: 'microgrid', microgrid: 'microgrid', solarbess: 'microgrid', 'solar+bess': 'microgrid', 'solar-bess': 'microgrid' };
    return map[k] || '';
  }

  function catOf(src) { return src || root.OmegaSiteCatalogs || null; }

  function gear(group, table, prefix) {
    var out = [], k, e;
    if (!table) return out;
    for (k in table) {
      if (!Object.prototype.hasOwnProperty.call(table, k)) continue;
      e = table[k];
      if (!e || !num(e.kw)) continue;
      out.push({ key: k, kind: 'ev', group: group, mfr: String(e.mfr || ''), model: String(e.model || e.label || k),
        name: (prefix ? prefix + ' \u00b7 ' : '') + (e.label || e.model || k), short: e.label || k,
        kw: num(e.kw), kwh: null, hours: null, lFt: num(e.lf), wFt: num(e.wf),
        note: num(e.kw).toLocaleString('en-US') + ' kW \u00b7 quote required', quote: true });
    }
    return out;
  }
  function evUnits(cat) {
    var ev = cat && cat.ev;
    if (!ev) return [];
    return gear('post', ev.post, 'DCFC').concat(gear('unit', ev.unit, 'DCFC'), gear('l2', ev.l2, 'Level 2'), gear('cab', ev.cab, 'Power cabinet'));
  }
  function dcUnits(cat) {
    var dc = cat && cat.dc, out = [], k, e;
    if (!dc) return out;
    for (k in dc) {
      if (!Object.prototype.hasOwnProperty.call(dc, k)) continue;
      e = dc[k];
      if (!e || !num(e.kw)) continue;
      out.push({ key: k, kind: 'compute', mfr: '', model: e.label || k, name: e.label || k, short: e.label || k,
        kw: num(e.kw), kwh: null, lFt: num(e.lf), wFt: num(e.wf),
        note: num(e.kw).toLocaleString('en-US') + ' kW \u00b7 quote required', quote: true });
    }
    return out;
  }
  function solarUnits(cat) {
    var out = [], mods = cat && cat.solarModules, arr = cat && cat.solarArrays, k, e;
    if (mods) {
      for (k in mods) {
        if (!Object.prototype.hasOwnProperty.call(mods, k)) continue;
        e = mods[k];
        if (!e || !num(e.watts)) continue;
        out.push({ key: k, kind: 'solar', group: 'module', mfr: String(e.mfr || e.make || ''), model: e.label || k,
          name: e.label || k, short: e.line || e.label || k, kw: null, kwh: null, watts: num(e.watts), lFt: null, wFt: null,
          note: num(e.watts).toLocaleString('en-US') + ' W module \u00b7 sized in Site Map \u00b7 quote required', quote: true });
      }
    }
    if (arr) {
      for (k in arr) {
        if (!Object.prototype.hasOwnProperty.call(arr, k)) continue;
        e = arr[k];
        if (!e || !e.label) continue;
        out.push({ key: 'array:' + k, kind: 'solar', group: 'array', mfr: '', model: e.label, name: e.label, short: e.label,
          kw: null, kwh: null, lFt: null, wFt: null, note: 'array layout \u00b7 sized in Site Map \u00b7 quote required', quote: true });
      }
    }
    return out;
  }
  function altUnits(cat) {
    var alt = cat && cat.alt, out = [], k, e;
    if (!alt) return out;
    for (k in alt) {
      if (!Object.prototype.hasOwnProperty.call(alt, k)) continue;
      e = alt[k];
      if (!e || !num(e.kw)) continue;
      out.push({ key: k, kind: 'gen', mfr: '', model: e.label || k, name: e.label || k, short: e.label || k,
        kw: num(e.kw), kwh: null, lFt: num(e.lf), wFt: num(e.wf),
        note: num(e.kw).toLocaleString('en-US') + ' kW' + (e.fuel ? ' \u00b7 ' + e.fuel : '') + ' \u00b7 quote required', quote: true });
    }
    return out;
  }
  /* Batteries the circuit check and the cost model can price. Anything else
     is carried through with quote required / sized in Site Map. */
  function screenable(u) { return !!(u && (u.kind === 'bess' || !u.kind) && num(u.kw) && num(u.kwh)); }
  function forType(type, tenant, cat) {
    var t = primeType(type) || 'bess', c = catOf(cat), b = units(tenant);
    if (t === 'ev') return evUnits(c);
    if (t === 'solar') return solarUnits(c);
    if (t === 'compute') return dcUnits(c);
    if (t === 'microgrid') return b.concat(solarUnits(c), altUnits(c));
    return b;
  }

  /* What Site Map puts on /omega-prime. Blank fields are left off. */
  function linkQuery(f) {
    f = f || {};
    var q = [], addr = String(f.addr || '').replace(/^\s+|\s+$/g, ''), lat = +f.lat, lng = +f.lng, t;
    if (addr) q.push('addr=' + encodeURIComponent(addr));
    if (isFinite(lat) && isFinite(lng)) {
      q.push('lat=' + encodeURIComponent(String(lat)));
      q.push('lng=' + encodeURIComponent(String(lng)));
    }
    if (f.projectId) q.push('project=' + encodeURIComponent(String(f.projectId)));
    t = primeType(f.type);
    if (t) q.push('type=' + t);
    if (f.step === 'logic' || f.step === 'quote') q.push('step=' + f.step);
    return q.join('&');
  }

  /* st: { addr, lat, lng, geoSrc, unit, grid, load, area, unitAt, poi, conduitFt, type }
     who: { uid, email, name, orgId } */
  function projectDoc(st, who, stamp) {
    var type = primeType(st.type) || 'bess';
    var battery = screenable(st.unit);
    var d = {
      uid: who.uid, orgId: who.orgId, ownerEmail: String(who.email || '').toLowerCase(), ownerName: who.name || '',
      name: st.addr, address: st.addr, type: type,
      siteScopes: type === 'microgrid' ? ['bess', 'solar', 'der'] : [type], stage: 'candidate',
      elements: [], conduits: [], annotations: [],
      bessList: battery ? [bessEntry(st.unit)] : [],
      mapState: { lat: +st.lat, lng: +st.lng, zoom: 19 },
      prime: { v: 1, unitKey: st.unit.key, type: type, geocode: st.geoSrc || '', layout: layout(st) }
    };
    if (st.grid) d.grid = st.grid;
    if (st.load) d.load = st.load;
    if (stamp) { d.createdAt = stamp; d.updatedAt = stamp; }
    return d;
  }

  var P = { XXL: XXL, fromEntry: fromEntry, refs: refs, units: units, forType: forType, screenable: screenable,
            primeType: primeType, linkQuery: linkQuery, bessEntry: bessEntry, zipOf: zipOf, peaks: peaks,
            layout: layout, projectDoc: projectDoc };
  root.OmegaPrimeProject = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : this);
