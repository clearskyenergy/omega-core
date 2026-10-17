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
                   CleanCell catalog (the R60 and, when the caller passes
                   omega-cleancell-catalog.js, the Rev H units), then the
                   shipped FENECON Industrial XXL. Specs only, never a price.
                   An own-only manufacturer that is not Clean Cell is offered
                   its own batteries only.
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

   ES5. Exports for Node.
   ========================================================================== */
(function (root) {
  'use strict';

  /* editor.html BESS_CATALOG['FENECON-IND-XXL'] and its footprint row —
     FENECON's sheet. The editor re-reads its own entry by catalogKey when
     the project opens (omega-prime-handoff.js), so these are for display. */
  var XXL = { key: 'FENECON-IND-XXL', mfr: 'FENECON', model: 'Industrial XXL', name: 'FENECON Industrial XXL', short: 'XXL',
    kw: 2508, kwh: 5015, usable: 4750, hours: 2, lFt: 20, wFt: 8, hFt: 9.5, wt: '~95,000 lb',
    ac: '480 V 3-ph, UL 1741 SA', xfmr: '3,000 kVA 480/480 V', disco: '4,000 A 480 V',
    chem: 'LFP, liquid-cooled', ems: 'FEMS, open API, VPP-ready', note: '2.508 MW / 5.015 MWh · 20 ft liquid-cooled container' };

  /* editor.html BESS_CATALOG['CC-R60'] and its pad row. Specs only: the
     price lives in api/_lib/editor-cost.js and is not copied here. */
  var R60 = { key: 'CC-R60', mfr: 'Clean Cell', model: 'CleanCell R60', name: 'CleanCell R60', short: 'R60',
    kw: 60, kwh: 61.44, usable: null, hours: 1.02, lFt: 28, wFt: 7.25, hFt: 6.9, wt: '',
    ac: '277/480 VAC', xfmr: '', disco: 'Project-engineered',
    chem: 'LFP', ems: '', note: '60 kW / 61.44 kWh · 28 ft skid' };

  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : null; }

  /* A BESS_CATALOG-shaped entry (what OmegaBessProducts.load() returns) → a unit. */
  function fromEntry(key, e) {
    if (!e || !(num(e.kw) && num(e.kwh))) return null;
    var w = num(e.widthFt), d = num(e.depthFt);
    var mfr = String(e.mfr || ''), model = String(e.model || key);
    return { key: key, mfr: mfr, model: model, name: (mfr && model.indexOf(mfr) !== 0 ? mfr + ' ' : '') + model, short: model,
      kw: num(e.kw), kwh: num(e.kwh), usable: num(e.usable), hours: num(e.dur) || +(num(e.kwh) / num(e.kw)).toFixed(2),
      lFt: w && d ? Math.max(w, d) : null, wFt: w && d ? Math.min(w, d) : null, hFt: null, wt: '',
      ac: '', xfmr: String(e.xfmr || ''), disco: String(e.disco || ''), chem: String(e.chem || ''), ems: '',
      note: num(e.kw).toLocaleString('en-US') + ' kW / ' + num(e.kwh).toLocaleString('en-US') + ' kWh', tenant: true };
  }

  /* A Rev H reference row (omega-cleancell-catalog.js entries()) → a unit.
     The model is the short catalog name. Footprints stay whatever the
     brochure published: a cabinet size is the cabinet, and a missing one
     stays missing. */
  function fromCatalog(key, e) {
    var model = e.sku === 'CC290-125' ? 'CC290/125' : (e.sku === 'CC-LGJP2-1000' ? 'LG JP-2' : (e.sku === 'CC-SM-1000' ? 'Smart Module' : (e.model || key)));
    var u = fromEntry(key, {
      mfr: e.mfr || 'CleanCell US', model: model, kw: e.kw, kwh: e.kwh, usable: e.usable, dur: e.dur,
      widthFt: e.widthFt, depthFt: e.depthFt, chem: e.chem || 'LFP'
    });
    if (!u) return null;
    u.tenant = false;
    if (e.acVoltage) u.ac = e.acVoltage + ' V 3-ph';
    return u;
  }

  function hasKey(out, key) {
    for (var i = 0; i < out.length; i++) if (out[i].key === key) return true;
    return false;
  }

  /* Clean Cell's own workspace still gets this catalog. Any other own-only
     manufacturer does not: their picker is their batteries. */
  function showCleanCell(tenant) {
    if (!tenant || !tenant.ownOnly) return true;
    var owner = tenant.owner || [], i, s;
    for (i = 0; i < owner.length; i++) {
      s = String(owner[i] || '');
      if (s.indexOf('cleancell') === 0) return true;
    }
    return /cleancell/i.test(String(tenant.orgId || '') + ' ' + String(tenant.brand || ''));
  }

  /* The tenant's list first (their own products lead, as they do in the
     Guided Build), then the CleanCell catalog, then the shipped XXL unless
     the list already carries it — or the workspace is OWN-ONLY
     (omega-bess-products.js ownOnlyOf: a white-labelled manufacturer offers
     its own batteries only, 2026-10-16) and has at least one of its own to
     offer, so nobody gets an empty list. */
  function units(tenant, catalog) {
    var out = [], keys = (tenant && tenant.keys) || [], i, u, hasXxl = false, refs, rk;
    for (i = 0; i < keys.length; i++) {
      u = fromEntry(keys[i], tenant.entries[keys[i]]);
      if (!u) continue;
      if (/industrial\s*xxl/i.test(u.name) || u.key === XXL.key) hasXxl = true;
      out.push(u);
    }
    if (showCleanCell(tenant)) {
      if (!hasKey(out, R60.key)) out.push(R60);
      refs = catalog && typeof catalog.entries === 'function' ? catalog.entries() : null;
      if (refs) {
        rk = Object.keys(refs);
        for (i = 0; i < rk.length; i++) {
          u = fromCatalog(rk[i], refs[rk[i]]);
          if (u && !hasKey(out, u.key)) out.push(u);
        }
      }
    }
    if (!hasXxl && !(tenant && tenant.ownOnly && out.length)) out.push(XXL);
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

  /* st: { addr, lat, lng, geoSrc, unit, grid, load, area, unitAt, poi, conduitFt }
     who: { uid, email, name, orgId } */
  function projectDoc(st, who, stamp) {
    var d = {
      uid: who.uid, orgId: who.orgId, ownerEmail: String(who.email || '').toLowerCase(), ownerName: who.name || '',
      name: st.addr, address: st.addr, type: 'bess', siteScopes: ['bess'], stage: 'candidate',
      elements: [], conduits: [], annotations: [],
      bessList: [bessEntry(st.unit)],
      mapState: { lat: +st.lat, lng: +st.lng, zoom: 19 },
      prime: { v: 1, unitKey: st.unit.key, geocode: st.geoSrc || '', layout: layout(st) }
    };
    if (st.grid) d.grid = st.grid;
    if (st.load) d.load = st.load;
    if (stamp) { d.createdAt = stamp; d.updatedAt = stamp; }
    return d;
  }

  var P = { XXL: XXL, R60: R60, fromEntry: fromEntry, units: units, bessEntry: bessEntry, zipOf: zipOf, peaks: peaks,
            layout: layout, projectDoc: projectDoc };
  root.OmegaPrimeProject = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : this);
