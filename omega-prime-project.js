/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ==========================================================================
   omega-prime-project.js  ·  what Omega Prime offers, draws and keeps
   --------------------------------------------------------------------------
   Omega Prime (omega-prime.html) screens one site and then SETS IT UP: a
   real projects/{id} record the rep keeps working in Site Map (Tommy,
   2026-10-16: "it does the set up and system like the artifact sandbox").
   This file is the pure half — no DOM, no Firebase — so the page, the
   Site Map hand-off (omega-prime-handoff.js), the server's quote
   (api/_lib/customer-quote.js) and scripts/tests/tomegaprime.js read ONE
   set of rules:

     units()        the battery list (contract C1). Clean Cell's units are
                    Prime's list (Tommy, 2026-10-17): the workspace's own
                    products (the ONE product list, omega-bess-products.js)
                    first, then Clean Cell's Rev H reference units biggest
                    first (omega-cleancell-catalog.js entries()), then the
                    R60. FENECON's Industrial XXL is offered ONLY to
                    FENECON's own workspace, as its own product. Specs only,
                    never a price.
     arrange()      where the unit, its transformer and its disconnect sit
     feed(), conduitPath(), pathFt()
                    the service run and its ground length (the editor's own
                    _groundPolyFt formula), contract C2
     layout()       Prime's drawing as lat/lng, v2, with its hash; upgrade()
                    turns a v1 sketch into it. Never a drawing key.
     projectDoc()   the record a new project is created with (contract C3),
                    in the shapes editor.html's _loadProject reads back
     patch()        the dotted update Prime writes afterwards
     unitFor()      the unit a saved record resumes with: ONE rule for
                    Prime, the server's quote and Site Map's build
     offered()      whether a workspace's list offers the unit a record
                    carries, and which entry it is: ONE rule for the
                    server's quote and the order hand-off
     restore()      a saved record → the state the page resumes from
     runInput()     what /api/price-site is sent, computed ONE way for the
                    page and the server's quote
     zipOf(), peaks()   reading an address and a bill's monthly peaks
     subName()      a substation's name as shown: HIFLD's 'UNKNOWN307104'
                    reads "Unnamed substation (HIFLD 307104)"; the record
                    keeps the raw name
     primeType()    an editor project-type word folded onto Prime's five
                    (bess, ev, solar, compute, microgrid), main #348
     forType()      the unit list for a project type: the battery list
                    above, or the chargers, compute units, solar modules and
                    array layouts of the editor's own catalogs
                    (omega-site-catalogs.js), and for a microgrid the
                    battery list with the solar and the generator /
                    fuel-cell rows. Specs only, never a price.
     screenable()   a battery the circuit check and the cost model can
                    judge and price; every other unit is carried through as
                    "quote required", sized in Site Map
     linkQuery(), orgId()
                    the address, lat/lng, project id, type and org Site Map
                    puts on /omega-prime, and the one safe org id on a link

   ES5. Exports for Node.
   ========================================================================== */
(function (root) {
  'use strict';

  var HAS = Object.prototype.hasOwnProperty;
  var R_EARTH = 6378137;                 /* editor.html _groundPolyFt, google.maps.geometry.spherical */
  var FT_PER_M = 3.280839895;            /* the same file's constant */
  var GAP_FT = 5;                        /* clear gap between bodies in Prime's row */
  var XFMR_FT = { lFt: 8, wFt: 8 };      /* generic symbols, not a maker's spec */
  var DISCO_FT = { lFt: 3, wFt: 4 };     /* 3 ft east–west × 4 ft north–south */
  /* a 20 ft container as this codebase draws one (editor.html's XXL row and
     its 20 ft compute container): the planning size of a unit whose brochure
     names a 20 ft container and releases no figures */
  var CONTAINER_20 = { lFt: 20, wFt: 8 };
  /* how a footprint is known: the maker's released figures, its reference
     figures (not released: confirm on the submittal), or the submittal's,
     typed by the rep; anything else is unknown ('none') */
  var FOOTPRINTS = ['catalog', 'reference', 'rep'];
  var STEPS = ['start', 'atlas', 'circuit', 'load', 'map', 'quote', 'track'];

  /* Clean Cell's reference units, biggest first, the integrated package
     ahead of the split one (omega-cleancell-catalog.js KEYS). */
  var HERO = ['CLEANCELL-LGJP2-1000-REV-H', 'CLEANCELL-SM-1000-REV-H', 'CLEANCELL-CC290-125-REV-H'];

  /* The unit fields, in order (contract C1). snapshot() keeps exactly these,
     so a unit stored on the record can never carry anything else. */
  var UNIT_KEYS = ['key', 'kind', 'sku', 'mfr', 'model', 'name', 'short', 'kw', 'kwh', 'kwhApprox', 'usable', 'hours',
    'lFt', 'wFt', 'hFt', 'footprint', 'weightLb', 'weightBasis', 'ac', 'chem', 'inv', 'incPcs', 'incXfmr', 'incDisco',
    'xfmr', 'disco', 'ems', 'note', 'source', 'sourceDoc', 'sourcePages', 'catalogStatus', 'caveat', 'vendorOrgId'];

  /* ── THE TWO SHIPPED UNITS ────────────────────────────────────────────
     Copied from editor.html, figure by figure, and held there by
     scripts/tests/tomegaprime.js: the R60 from BESS_CATALOG['CC-R60'] and
     its GOTION_CATALOG_DIMS row (the skid drawing's 336 × 87 × 82.75 in),
     and api/_lib/omega-core.js PRODUCT.battery; the XXL from
     BESS_CATALOG['FENECON-IND-XXL'] and its row. The editor re-reads its
     own entry by catalogKey when the project opens, so these are what
     Prime shows and arranges. */

  /* The CleanCell R60: a 60 kW battery and two Autel DC fast chargers on
     one skid (its PCS is integrated and its output native 277/480 V, so no
     step-up transformer is drawn; a site AC disconnect still is). Usable
     kWh, weight and the charger rating are unpublished and stay so. */
  var R60 = { key: 'CC-R60', kind: 'bess', sku: 'CC-R60', mfr: 'Clean Cell',
    model: 'CleanCell R60 — 60 kW / 61.44 kWh skid (BESS + 2 Autel DCFC)', name: 'Clean Cell R60', short: 'R60',
    kw: 60, kwh: 61.44, kwhApprox: false, usable: null, hours: 1.02,
    lFt: 28, wFt: 7.25, hFt: 6.9, footprint: 'catalog', weightLb: null, weightBasis: '',
    ac: '277/480 VAC 4-wire Wye or 480 VAC 3-wire Delta', chem: 'LFP (LiFePO4)',
    inv: 'Sol-Ark 60K-3P hybrid PCS (integrated, side-mounted on the cabinet)', incPcs: true, incXfmr: true, incDisco: false,
    xfmr: 'N/A', disco: 'Project-engineered (72.3 A max AC output)',
    ems: 'CAN BMS to PCS (active BMS comms required); Wi-Fi + Ethernet monitoring; PCS parallel up to 10 units',
    note: '60 kW / 61.44 kWh · EV-charging skid: BESS + 2 Autel DCFC',
    source: 'reference',
    sourceDoc: 'Clean Cell US R60 Product Data Sheet Rev A (Sep 2026); skid 336 x 87 x 82.75 in overall per the skid drawing ClearSky supplied (2026-10-02)',
    sourcePages: [], catalogStatus: 'datasheet',
    caveat: 'An EV-charging skid: the battery adds at most 60 kW through its PCS. Usable kWh, weight and the charger rating are not published; confirm on the submittal.',
    vendorOrgId: null };

  /* FENECON's Industrial XXL, offered only where FENECON is the workspace
     (OmegaBessProducts.isOwn({ mfr: 'FENECON' }, tenant)). Its central PCS
     rides in the container; transformer and disconnect are site gear. */
  var XXL = { key: 'FENECON-IND-XXL', kind: 'bess', sku: 'FENECON-IND-XXL', mfr: 'FENECON', model: 'Industrial XXL',
    name: 'FENECON Industrial XXL', short: 'XXL',
    kw: 2508, kwh: 5015, kwhApprox: false, usable: 4750, hours: 2,
    lFt: 20, wFt: 8, hFt: 9.5, footprint: 'catalog', weightLb: 95000, weightBasis: 'reference',
    ac: '480 V 3-ph, UL 1741 SA', chem: 'LFP, liquid-cooled',
    inv: 'Central Inverter, 2.5 MW class (3-ph 480V AC)', incPcs: true, incXfmr: false, incDisco: false,
    xfmr: '3,000 kVA 480/480 V', disco: '4,000 A 480 V', ems: 'FEMS, open API, VPP-ready',
    note: '2,508 kW / 5,015 kWh · 20 ft liquid-cooled container',
    source: 'own-shipped', sourceDoc: 'FENECON Industrial XXL specification (Site Map catalog)', sourcePages: [],
    catalogStatus: 'datasheet', caveat: 'Usable kWh shown at ~95% DoD; confirm with FENECON.', vendorOrgId: null };

  /* ── small helpers ────────────────────────────────────────────────── */
  function num(v) { var n = Number(v); return v !== null && v !== '' && isFinite(n) && n > 0 ? n : null; }
  function fin(v) { var n = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(n) ? n : null; }
  function str(v) { return v == null ? '' : String(v); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r7(n) { return +(+n).toFixed(7); }
  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function fmtN(n) {
    var p = String(r2(+n)).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  }
  function copy(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  /* Firestore refuses `undefined`; a value that is not there is null. */
  function clean(v) {
    if (v === undefined) return null;
    if (v === null || typeof v !== 'object') return (typeof v === 'number' && !isFinite(v)) ? null : v;
    if (Array.isArray(v)) return v.map(clean);
    if (typeof v.toDate === 'function' || typeof v.isEqual === 'function') return v;   /* a Timestamp or a sentinel */
    var o = {}, k;
    for (k in v) if (HAS.call(v, k)) o[k] = clean(v[k]);
    return o;
  }
  function ll(p) {
    if (!p) return null;
    var lat = fin(p.lat), lng = fin(p.lng);
    return lat == null || lng == null ? null : { lat: r7(lat), lng: r7(lng) };
  }

  /* The readable part of a model string: up to its " - " qualifier, less a
     leading run of words that IS the maker's name ("CleanCell R60" by
     "Clean Cell" → "R60"; "LG JP-2 - 1 MW / 2 MWh class" → "LG JP-2"). A
     remainder with no letter in it ("200") keeps the maker's word. */
  function shortOf(model, mfr) {
    var s = String(model || '').split(/\s+[-–—]\s+/)[0].replace(/^\s+|\s+$/g, '');
    var words = s.split(/\s+/), m = norm(mfr), k, pre, rest;
    if (m) for (k = words.length - 1; k >= 1; k--) {
      pre = norm(words.slice(0, k).join(' '));
      if (pre && (pre === m || (pre.length >= 5 && m.indexOf(pre) === 0))) {
        rest = words.slice(k).join(' ');
        if (/[a-z]/i.test(rest)) return rest;
        break;
      }
    }
    return s;
  }
  function nameOf(mfr, short) {
    return mfr && norm(short).indexOf(norm(mfr)) !== 0 ? mfr + ' ' + short : short;
  }

  /* exactly the C1 keys, nothing undefined */
  function snapshot(u) {
    if (!u || typeof u !== 'object') return null;
    var o = {}, i, k, v;
    for (i = 0; i < UNIT_KEYS.length; i++) {
      k = UNIT_KEYS[i]; v = u[k];
      if (k === 'sourcePages') v = Array.isArray(v) ? v.slice() : [];
      else if (k === 'kind') v = v ? str(v) : 'bess';
      else if (k === 'kwhApprox' || k === 'incPcs' || k === 'incXfmr' || k === 'incDisco') v = v === true;
      else if (v === undefined) v = (k === 'usable' || k === 'lFt' || k === 'wFt' || k === 'hFt' || k === 'weightLb' || k === 'vendorOrgId') ? null : '';
      o[k] = v;
    }
    if (FOOTPRINTS.indexOf(o.footprint) < 0) o.footprint = 'none';
    return o;
  }

  /* ── C1 · A CATALOG-SHAPED ENTRY → A UNIT ─────────────────────────────
     One converter for the workspace's own products (OmegaBessProducts
     .load() entries: toCatalogEntry's shape, plus `integrates{}` if a raw
     product is passed) and Clean Cell's reference entries (entries()). A
     footprint the maker has not released is its REFERENCE footprint, said
     so wherever it is shown; one with no figure at all stays unknown. */
  function fromEntry(key, e, o) {
    o = o || {};
    if (!e || !(num(e.kw) && num(e.kwh))) return null;
    var kw = num(e.kw), kwh = num(e.kwh), ig = e.integrates || {};
    var mfr = str(e.mfr || e.brand), model = str(e.model || e.name || key);
    var short = shortOf(model, mfr);
    var w = num(e.widthFt), d = num(e.depthFt), h = num(e.heightFt);
    /* A footprint the maker has not RELEASED is drawn at its REFERENCE size
       (2026-10-20, Tommy, of a CC290/125 placed as a point where FENECON's
       unit draws a block: "it does it for fenecon unit but not on cleancell
       get that fixed"). The maker's own reference figures — the CC290/125's
       cabinet, its PCS beside it to be confirmed — or, where the brochure
       names only a 20 ft container (the LG JP-2; the Smart Module's
       enclosure), a 20 × 8 ft container. It is 'reference', never
       'catalog': every reader says to confirm it on the submittal, and a
       footprint the rep types from the submittal replaces it. (main #337
       left these unknown, and a point on the map is not a battery.) */
    var fp = 'catalog';
    if (e.dimensionsStatus && e.dimensionsStatus !== 'released') {
      fp = 'reference';
      if (!(w && d) && /\b20\s*ft\b/i.test(str(e.dims))) { w = CONTAINER_20.wFt; d = CONTAINER_20.lFt; }
    }
    var wkg = num(e.weightKg), wlb = num(e.weightLb);
    var weightLb = wlb ? Math.round(wlb) : (wkg ? Math.round(wkg * 2.20462) : null);
    var ac = str(e.ac);
    if (!ac && num(e.acVoltage)) ac = num(e.acVoltage) + ' V' + (num(e.acPhases) ? ' ' + num(e.acPhases) + '-ph' : '') + (num(e.acFrequencyHz) ? ' ' + num(e.acFrequencyHz) + ' Hz' : '');
    if (!ac) ac = str(e.gridConnectV);
    var incPcs = e._incPCS === true || ig.pcs === true;
    var approx = e.nominalEnergyApproximate === true;
    var dc = /\bDC\b/.test(str(e.energyBasis));
    var src = o.source || (e._tenant === true ? 'tenant' : 'reference');
    var caveat = str(e.caveat);
    if (!caveat && src !== 'tenant') {
      caveat = [e.catalogStatus === 'planning-verify' ? 'Planning specification, verify before release.' : '',
        e.energyBasis ? str(e.energyBasis) + '.' : '',
        e.dimensionsStatus && e.dims ? str(e.dims) + '.' : ''].join(' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }
    return {
      key: key, kind: 'bess', sku: str(e.sku) || key, mfr: mfr, model: model, name: nameOf(mfr, short), short: short,
      kw: kw, kwh: kwh, kwhApprox: approx, usable: num(e.usable), hours: num(e.dur) || r2(kwh / kw),
      lFt: w && d ? r2(Math.max(w, d)) : null, wFt: w && d ? r2(Math.min(w, d)) : null, hFt: h ? r2(h) : null,
      footprint: w && d ? fp : 'none',
      weightLb: weightLb, weightBasis: weightLb ? (e.weightStatus === 'reference' ? 'reference' : 'datasheet') : '',
      ac: ac, chem: str(e.chem || e.chemistry), inv: str(e.inv),
      incPcs: incPcs, incXfmr: e._incXfmr === true || ig.xfmr === true, incDisco: e._incDisco === true || ig.disco === true,
      xfmr: str(e.xfmr), disco: str(e.disco), ems: str(e.ems || e.controller),
      note: fmtN(kw) + ' kW / ' + (approx ? '~' : '') + fmtN(kwh) + ' kWh' + (dc ? ' DC' : '') +
        (incPcs ? ' · PCS integrated' : (src === 'tenant' ? '' : ' · separate PCS')),
      source: src, sourceDoc: o.sourceDoc != null ? o.sourceDoc : str(e.source),
      sourcePages: Array.isArray(e.sourcePages) ? e.sourcePages.slice() : [],
      catalogStatus: str(e.catalogStatus) || (src === 'tenant' ? 'workspace-list' : ''),
      caveat: caveat, vendorOrgId: o.vendorOrgId || null
    };
  }

  /* a product slot that is not a datasheet (tenants/cleancell/products.json) */
  function isPlaceholder(e) { return !!e && /PLACEHOLDER SPEC/i.test(str(e.notes) + ' ' + str(e.note)); }

  /* The rep types the submittal's L × W for a unit with none released. */
  function repFootprint(u, a, b) {
    var x = num(a), y = num(b), o = snapshot(u);
    if (!o || !x || !y) return o;
    o.lFt = r2(Math.max(x, y)); o.wFt = r2(Math.min(x, y)); o.footprint = 'rep';
    return o;
  }

  function ownJudge(opts) {
    var f = opts && typeof opts.isOwn === 'function' ? opts.isOwn : null;
    if (!f) { var B = root && root.OmegaBessProducts; if (B && typeof B.isOwn === 'function') f = B.isOwn; }
    return f || function (entry) { return !!entry && (entry._tenant === true || entry.org === true); };
  }

  /* tenant: OmegaBessProducts.load()'s answer { orgId, brand, entries, keys,
       ownOnly, owner[] } or null; refs: OmegaCleanCellCatalog.entries();
     opts.isOwn: OmegaBessProducts.isOwn (found on the page by itself).

     A generic workspace: its own products, then Clean Cell's reference
     units, then the R60. A manufacturer's own-only workspace
     (ownOnlyOf: a white-labelled OEM) sees only what is its own — Clean
     Cell's counts the Rev H units and the R60 — and falls back to the
     reference list when it has none, so nobody gets an empty list.
     FENECON's workspace gets its XXL first. No price on any unit. */
  function units(tenant, refs, opts) {
    var t = tenant || {}, isOwn = ownJudge(opts), org = t.orgId || null;
    var out = [], seenKey = {}, seenSku = {}, i, k, e, u;
    var keys = t.keys || [], entries = t.entries || {};
    function add(unit) {
      if (!unit) return;
      var kk = String(unit.key).toUpperCase(), ss = norm(unit.sku);
      if (seenKey[kk] || (ss && seenSku[ss])) return;
      seenKey[kk] = true; if (ss) seenSku[ss] = true;
      out.push(unit);
    }
    function shipped(unit, entry) {
      var o = snapshot(unit), own = isOwn(entry, t);
      o.source = own ? 'own-shipped' : 'reference';
      o.vendorOrgId = own ? org : null;
      o._own = own;
      return o;
    }

    var mine = [];
    for (i = 0; i < keys.length; i++) {
      e = entries[keys[i]];
      if (!e || isPlaceholder(e)) continue;
      u = fromEntry(keys[i], e, { source: 'tenant', vendorOrgId: org,
        sourceDoc: (t.brand ? t.brand + ' product list' : 'Workspace product list') });
      if (u) { u._own = true; mine.push(u); }
    }
    var fenecon = isOwn({ mfr: XXL.mfr, model: XXL.model }, t);
    var anyXxl = mine.some(function (m) { return /industrial\s*xxl/i.test(m.name) || String(m.key).toUpperCase() === XXL.key; });
    if (fenecon && !anyXxl) add(shipped(XXL, { mfr: XXL.mfr, model: XXL.model }));
    for (i = 0; i < mine.length; i++) add(mine[i]);

    var rk = [], r = refs || {};
    for (i = 0; i < HERO.length; i++) if (HAS.call(r, HERO[i])) rk.push(HERO[i]);
    var extra = [];
    for (k in r) if (HAS.call(r, k) && HERO.indexOf(k) < 0) extra.push(k);
    extra.sort(function (a, b) { return (num(r[b].kw) || 0) - (num(r[a].kw) || 0) || (num(r[b].kwh) || 0) - (num(r[a].kwh) || 0); });
    rk = rk.concat(extra);
    for (i = 0; i < rk.length; i++) {
      e = r[rk[i]];
      if (!e || isPlaceholder(e)) continue;
      u = fromEntry(rk[i], e, { source: 'reference' });
      if (u) add(shipped(u, e));
    }
    add(shipped(R60, { mfr: R60.mfr, model: R60.model }));

    if (t.ownOnly) {
      var own = out.filter(function (x) { return x._own; });
      if (own.length) out = own;
    }
    return out.map(function (x) { return snapshot(x); });
  }

  /* The Site Map battery list entry (saveBess's shape). The catalog key is
     what the editor resolves the rest from; the integration flags ride
     along so the editor knows them before its catalog merges. */
  function bessEntry(u, id) {
    return { id: id || 'prime-1', name: 'BESS-01', mfr: u.mfr || '', model: u.model || u.name || '',
      chem: u.chem || '', kwh: String(u.kwh), usable: u.usable == null ? '' : String(u.usable), kw: String(u.kw),
      dur: u.hours == null ? '' : String(u.hours), acv: '480', inv: u.inv || '', xfmr: u.xfmr || '', disco: u.disco || '',
      qty: '1', catalogKey: u.key, sku: u.sku || '',
      _incPCS: u.incPcs === true, _incXfmr: u.incXfmr === true, _incDisco: u.incDisco === true, _fromPrime: true };
  }

  /* A battery entry read back as a unit (a record whose unit is in no list
     and was never snapshotted). Footprint unknown. */
  function fromBessEntry(b) {
    if (!b || !(num(b.kw) && num(b.kwh))) return null;
    var mfr = str(b.mfr), model = str(b.model), short = shortOf(model, mfr), kw = num(b.kw), kwh = num(b.kwh);
    return snapshot({ key: str(b.catalogKey), sku: str(b.sku) || str(b.catalogKey), mfr: mfr, model: model,
      name: nameOf(mfr, short), short: short, kw: kw, kwh: kwh, usable: num(b.usable), hours: num(b.dur) || r2(kwh / kw),
      footprint: 'none', chem: str(b.chem), inv: str(b.inv), incPcs: b._incPCS === true, incXfmr: b._incXfmr === true,
      incDisco: b._incDisco === true, xfmr: str(b.xfmr), disco: str(b.disco),
      note: fmtN(kw) + ' kW / ' + fmtN(kwh) + ' kWh', source: 'reference', sourceDoc: 'Project battery list',
      catalogStatus: 'project-record', caveat: 'Read back from the project record; the catalog entry was not found.' });
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

  /* ── PROJECT TYPES (main #348) ────────────────────────────────────────
     Editor project-type words folded onto Prime's five. Unknown stays blank
     so a handoff does not invent a battery project. */
  function primeType(key) {
    var k = String(key || '').toLowerCase().replace(/[\s_]+/g, '');
    var map = { bess: 'bess', storage: 'bess', battery: 'bess',
      ev: 'ev', evl2: 'ev', dcfc: 'ev', l2: 'ev', level2: 'ev', 'level-2': 'ev', 'ev-dcfc': 'ev', evdcfc: 'ev',
      solar: 'solar', pv: 'solar', solarpv: 'solar',
      datacenter: 'compute', compute: 'compute', 'data-center': 'compute', datacentre: 'compute',
      der: 'microgrid', microgrid: 'microgrid', solarbess: 'microgrid', 'solar+bess': 'microgrid', 'solar-bess': 'microgrid' };
    return HAS.call(map, k) ? map[k] : '';
  }

  /* The editor's placement catalogs (omega-site-catalogs.js) and Clean
     Cell's reference entries, found on the page or, in Node, beside this
     file. */
  function catOf(src) {
    if (src) return src;
    if (root && root.OmegaSiteCatalogs) return root.OmegaSiteCatalogs;
    if (typeof require === 'function') { try { return require('./omega-site-catalogs.js'); } catch (e) {} }
    return null;
  }
  function ccRefs() {
    var C = root && root.OmegaCleanCellCatalog;
    if (!C && typeof require === 'function') { try { C = require('./omega-cleancell-catalog.js'); } catch (e) { C = null; } }
    try { return C && typeof C.entries === 'function' ? C.entries() : {}; } catch (e2) { return {}; }
  }
  /* A unit that is not a battery: its catalog figures, its footprint when
     the catalog has one, and "quote required" — sized in Site Map. */
  function other(kind, k, e, o) {
    var lf = num(e.lf), wf = num(e.wf);
    var u = { key: k, kind: kind, mfr: str(o.mfr != null ? o.mfr : (e.mfr || e.make)), model: str(o.model || e.model || e.label || k),
      name: str(o.name || e.label || e.model || k), short: str(o.short || e.label || k),
      kw: o.kw === undefined ? num(e.kw) : o.kw, kwh: null, hours: null,
      lFt: lf, wFt: wf, footprint: lf && wf ? 'catalog' : 'none', note: str(o.note), quote: true };
    if (o.group) u.group = o.group;
    if (o.watts) u.watts = o.watts;
    return u;
  }
  function gear(group, table, prefix) {
    var out = [], k, e;
    if (!table) return out;
    for (k in table) {
      if (!HAS.call(table, k)) continue;
      e = table[k];
      if (!e || !num(e.kw)) continue;
      out.push(other('ev', k, e, { group: group, model: e.model || e.label || k,
        name: (prefix ? prefix + ' · ' : '') + (e.label || e.model || k), short: e.label || k,
        note: fmtN(num(e.kw)) + ' kW · quote required' }));
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
      if (!HAS.call(dc, k)) continue;
      e = dc[k];
      if (!e || !num(e.kw)) continue;
      out.push(other('compute', k, e, { mfr: '', note: fmtN(num(e.kw)) + ' kW · quote required' }));
    }
    return out;
  }
  function solarUnits(cat) {
    var out = [], mods = cat && cat.solarModules, arr = cat && cat.solarArrays, k, e;
    if (mods) {
      for (k in mods) {
        if (!HAS.call(mods, k)) continue;
        e = mods[k];
        if (!e || !num(e.watts)) continue;
        /* a module's watts are not a system's kW: the array is sized in Site Map */
        out.push(other('solar', k, { mfr: e.mfr || e.make }, { group: 'module', model: e.label || k, name: e.label || k,
          short: e.line || e.label || k, kw: null, watts: num(e.watts),
          note: fmtN(num(e.watts)) + ' W module · sized in Site Map · quote required' }));
      }
    }
    if (arr) {
      for (k in arr) {
        if (!HAS.call(arr, k)) continue;
        e = arr[k];
        if (!e || !e.label) continue;
        out.push(other('solar', 'array:' + k, {}, { group: 'array', model: e.label, name: e.label, short: e.label, kw: null,
          note: 'array layout · sized in Site Map · quote required' }));
      }
    }
    return out;
  }
  function altUnits(cat) {
    var alt = cat && cat.alt, out = [], k, e;
    if (!alt) return out;
    for (k in alt) {
      if (!HAS.call(alt, k)) continue;
      e = alt[k];
      if (!e || !num(e.kw)) continue;
      out.push(other('gen', k, e, { mfr: '', note: fmtN(num(e.kw)) + ' kW' + (e.fuel ? ' · ' + e.fuel : '') + ' · quote required' }));
    }
    return out;
  }
  /* A battery the circuit check and the cost model can judge and price.
     Anything else is carried through as quote required / sized in Site Map. */
  function screenable(u) { return !!(u && (u.kind === 'bess' || !u.kind) && num(u.kw) && num(u.kwh)); }
  /* The unit list for a project type. A battery or microgrid list is
     units()'s, with Clean Cell's catalog unless the caller hands its own. */
  function forType(type, tenant, cat, refs, opts) {
    var t = primeType(type) || 'bess', c = catOf(cat);
    if (t === 'ev') return evUnits(c);
    if (t === 'solar') return solarUnits(c);
    if (t === 'compute') return dcUnits(c);
    var b = units(tenant, refs == null ? ccRefs() : refs, opts);
    return t === 'microgrid' ? b.concat(solarUnits(c), altUnits(c)) : b;
  }
  /* The type a record (or a state) is: what it says, else its unit's kind,
     else a battery — every Prime record before #348 was one. */
  function typeOf(st) {
    st = st || {};
    var p = st.prime && typeof st.prime === 'object' ? st.prime : null;
    var t = primeType(p ? p.type : st.type) || (p ? primeType(st.type) : '');
    if (t) return t;
    var u = st.unit || (p && p.unit) || null;
    if (u && u.kind && u.kind !== 'bess') return u.kind === 'gen' ? 'microgrid' : (primeType(u.kind) || 'bess');
    return 'bess';
  }

  /* A workspace id safe to put on a link. The office still authorizes it;
     this only refuses a value that is not an org id. The same fenecon fold
     _projOrgId uses. */
  function orgId(v) {
    var s = String(v == null ? '' : v).replace(/^\s+|\s+$/g, '').toLowerCase();
    if (!s || s.length > 253) return '';
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return '';
    if (s === 'fenecon.de' || s === 'fenecon.us') return 'fenecon.com';
    return s;
  }

  /* What Site Map puts on /omega-prime. Blank fields are left off. */
  function linkQuery(f) {
    f = f || {};
    var q = [], addr = String(f.addr || '').replace(/^\s+|\s+$/g, ''), lat = fin(f.lat), lng = fin(f.lng), t, org;
    if (addr) q.push('addr=' + encodeURIComponent(addr));
    if (lat != null && lng != null) {
      q.push('lat=' + encodeURIComponent(String(lat)));
      q.push('lng=' + encodeURIComponent(String(lng)));
    }
    if (f.projectId) q.push('project=' + encodeURIComponent(String(f.projectId)));
    t = primeType(f.type);
    if (t) q.push('type=' + t);
    org = orgId(f.org);
    if (org) q.push('org=' + encodeURIComponent(org));
    if (f.step === 'logic' || f.step === 'quote') q.push('step=' + f.step);
    return q.join('&');
  }

  /* ── C2 · GEOMETRY ────────────────────────────────────────────────── */

  /* Feet → degrees at a latitude, on the same sphere pathFt measures. */
  function ftToDeg(lat, ft) {
    var dLat = (ft * 0.3048) / (R_EARTH * Math.PI / 180);
    return { dLat: dLat, dLng: dLat / Math.cos(lat * Math.PI / 180) };
  }
  function east(c, ft) { return { lat: r7(c.lat), lng: r7(c.lng + ftToDeg(c.lat, ft).dLng) }; }

  /* Ground length in feet: editor.html _groundPolyFt exactly (haversine on
     6378137 m), so Prime's figure and the conduit Site Map draws agree. */
  function pathFt(pts) {
    if (!pts || !pts.length || pts.length < 2) return null;
    var r = Math.PI / 180, d = 0, i, a, b;
    for (i = 1; i < pts.length; i++) {
      a = pts[i - 1]; b = pts[i];
      if (!a || !b || !isFinite(a.lat) || !isFinite(a.lng) || !isFinite(b.lat) || !isFinite(b.lng)) return null;
      var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
      var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      d += 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
    }
    return d * FT_PER_M;
  }

  /* The unit at c, long axis east–west; its transformer and disconnect in a
     row EAST of it, 5 ft clear between bodies. A transformer the unit
     integrates (incXfmr) is not drawn, nor a disconnect it integrates
     (incDisco). A unit with no footprint takes 0 ft for its own extent. A
     unit that is not a battery (a charger, an array, a compute unit, #348)
     is drawn alone: its service gear is sized in Site Map. */
  function arrange(unit, c) {
    var at = ll(c);
    if (!at) return null;
    unit = unit || {};
    var fp = FOOTPRINTS.indexOf(unit.footprint) >= 0 ? unit.footprint
      : (unit.footprint == null && num(unit.lFt) && num(unit.wFt) ? 'catalog' : 'none');
    var lF = fp !== 'none' ? num(unit.lFt) : null, wF = fp !== 'none' ? num(unit.wFt) : null;
    if (!lF || !wF) { lF = null; wF = null; fp = 'none'; }
    var G = { unit: { c: at, lFt: lF, wFt: wF, rotDeg: 0, footprint: fp }, xfmr: null, disco: null };
    var edge = (lF || 0) / 2, bat = !unit.kind || unit.kind === 'bess';
    if (bat && unit.incXfmr !== true) {
      G.xfmr = { c: east(at, edge + GAP_FT + XFMR_FT.lFt / 2), lFt: XFMR_FT.lFt, wFt: XFMR_FT.wFt, rotDeg: 0 };
      edge += GAP_FT + XFMR_FT.lFt;
    }
    if (bat && unit.incDisco !== true) {
      G.disco = { c: east(at, edge + GAP_FT + DISCO_FT.lFt / 2), lFt: DISCO_FT.lFt, wFt: DISCO_FT.wFt, rotDeg: 0 };
    }
    return G;
  }

  /* The gear the service conduit leaves from: the disconnect, else the
     transformer, else the unit itself. */
  function feed(G) { return G ? (G.disco || G.xfmr || G.unit || null) : null; }

  /* L-shaped: along the feed's latitude to the POI's longitude, then to the POI. */
  function conduitPath(from, poi) {
    var a = ll(from), b = ll(poi);
    return a && b ? [a, { lat: a.lat, lng: b.lng }, b] : null;
  }

  /* A north-up box, its sides measured on the ground (south and west edges). */
  function area(a) {
    if (!a) return null;
    var s = fin(a.s), w = fin(a.w), n = fin(a.n), e = fin(a.e);
    if (s == null || w == null || n == null || e == null) return null;
    var S0 = Math.min(s, n), N0 = Math.max(s, n), W0 = Math.min(w, e), E0 = Math.max(w, e);
    var wFt = fin(a.wFt), hFt = fin(a.hFt), sq = fin(a.sqft);
    if (wFt == null) wFt = pathFt([{ lat: S0, lng: W0 }, { lat: S0, lng: E0 }]);
    if (hFt == null) hFt = pathFt([{ lat: S0, lng: W0 }, { lat: N0, lng: W0 }]);
    if (sq == null) sq = wFt * hFt;
    return { s: r7(S0), w: r7(W0), n: r7(N0), e: r7(E0), wFt: Math.round(wFt), hFt: Math.round(hFt), sqft: Math.round(sq) };
  }

  /* FNV-1a, 32 bits, over UTF-8 bytes; hex. ES5 (no Math.imul). */
  function fnv1a(s) {
    var b = unescape(encodeURIComponent(String(s))), h = 0x811c9dc5, i;
    for (i = 0; i < b.length; i++) {
      h ^= b.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  /* Keys sorted at every level, so a record that went through Firestore
     (whose maps do not keep insertion order) hashes the same. */
  function canon(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(canon);
    var o = {}, ks = Object.keys(v).sort(), i;
    for (i = 0; i < ks.length; i++) if (v[ks[i]] !== undefined) o[ks[i]] = canon(v[ks[i]]);
    return o;
  }
  /* The hash of a layout's geometry: everything but `hash` itself. */
  function hash(L) {
    if (!L || typeof L !== 'object') return '';
    var g = {}, k;
    for (k in L) if (HAS.call(L, k) && k !== 'hash') g[k] = L[k];
    return fnv1a(JSON.stringify(canon(g)));
  }

  /* st: { unit, area:{s,w,n,e[,wFt,hFt,sqft]}, unitAt:{lat,lng}, poi:{lat,lng},
           conduit: true (drawn) | the stored conduit, or legacy conduitFt > 0 }
     → layout v2. The editor reads this geometry and never re-derives it. */
  function layout(st) {
    st = st || {};
    var u = st.unit || null;
    var G = st.unitAt ? arrange(u, st.unitAt) : null;
    var poi = ll(st.poi), cond = null;
    var drawn = !!st.conduit || !!num(st.conduitFt);
    if (G && poi && drawn) {
      var pts = conduitPath(feed(G).c, poi), ft = pathFt(pts);
      if (pts && ft != null) cond = { pts: pts, ft: Math.round(ft * 10) / 10, type: 'PVC-UG' };
    }
    var out = { v: 2, unitKey: u && u.key ? String(u.key) : (st.unitKey ? String(st.unitKey) : null), hash: '',
      area: area(st.area), unit: G ? G.unit : null, xfmr: G ? G.xfmr : null, disco: G ? G.disco : null,
      poi: poi, conduit: cond, conduitFt: cond ? cond.ft : null };
    out.hash = hash(out);
    return out;
  }

  /* v1 ({ area, unit:{lat,lng}, poi, conduitFt }, no gear) → v2, by
     replaying arrange(); a v2 layout is returned as it is (its hash filled
     in if missing). */
  function upgrade(L, unit) {
    if (!L || typeof L !== 'object') return null;
    if (L.v === 2) {
      if (L.hash) return L;
      var o = copy(L); o.hash = hash(o); return o;
    }
    var at = L.unit ? (L.unit.c || L.unit) : null;
    return layout({ unit: unit || null, unitKey: L.unitKey || null, area: L.area, unitAt: at, poi: L.poi,
      conduit: !!num(L.conduitFt) });
  }

  /* ── C3 · THE RECORD ──────────────────────────────────────────────── */

  /* What /api/price-site is sent for a unit and a layout — the page's Run
     and the server's quote re-price compute it this ONE way. */
  function runInput(unit, L) {
    if (!unit) return null;
    var kw = num(unit.kw), kwh = num(unit.kwh);
    var ft = L ? (L.conduitFt != null ? fin(L.conduitFt) : (L.conduit ? fin(L.conduit.ft) : null)) : null;
    var sq = L && L.area ? fin(L.area.sqft) : null;
    return { kw: kw, hours: num(unit.hours) || (kw && kwh ? r2(kwh / kw) : null),
      poiFt: ft == null ? null : Math.round(ft), padArea: sq == null ? null : Math.round(sq) };
  }
  function sameInput(a, b) {
    if (!a || !b) return false;
    return ['kw', 'hours', 'poiFt', 'padArea'].every(function (k) {
      var x = a[k] == null ? null : +a[k], y = b[k] == null ? null : +b[k];
      return x === y;
    });
  }

  /* A /api/price-site answer → prime.run. Lines are kept for the side panel
     and the quote; a saved quote snapshots its own copy server-side. */
  function runRecord(j, input, at) {
    if (!j || !j.total) return null;
    return { input: input ? { kw: fin(input.kw), hours: fin(input.hours), poiFt: fin(input.poiFt), padArea: fin(input.padArea) } : null,
      totalUsd: fin(j.total.base), loUsd: fin(j.total.lo), hiUsd: fin(j.total.hi),
      divisions: (Array.isArray(j.divisions) ? j.divisions : []).map(function (d) {
        return { id: str(d && d.id), name: str(d && d.name), base: fin(d && d.base) };
      }),
      estimateClass: str(j.estimateClass), estimateClassPlain: str(j.estimateClassPlain),
      pricedBy: str(j.pricedBy) || 'api/price-site', at: str(j.at || at) };
  }

  function subOf(s) {
    if (!s || !s.name) return null;
    return { name: str(s.name), kv: fin(s.kv), minkv: fin(s.minkv), owner: str(s.owner), status: str(s.status),
      lines: fin(s.lines), lat: fin(s.lat), lng: fin(s.lng), mi: fin(s.mi != null ? s.mi : s.miles) };
  }
  /* A substation's name as Prime shows it. HIFLD names about half its
     records by a number alone (38,479 'UNKNOWN…' of 75,328 on 2026-10-20,
     the nearest to 29 W Main St, Mesa among them): 'UNKNOWN307104' is an
     unnamed substation, 'TAP302679' an unnamed tap on a line (HIFLD's TYPE
     says TAP). They read as words with HIFLD's number kept; a real name,
     even one that starts the same way ('TAPIA 1102'), is shown as it is.
     Display only: the record keeps the name HIFLD gave (subOf). */
  function subName(name) {
    var s = str(name).replace(/^\s+|\s+$/g, ''), m = /^UNKNOWN\s*(\d*)$/i.exec(s);
    if (m) return 'Unnamed substation' + (m[1] ? ' (HIFLD ' + m[1] + ')' : '');
    m = /^TAP\s*(\d*)$/i.exec(s);
    if (m) return 'Unnamed tap' + (m[1] ? ' (HIFLD ' + m[1] + ')' : '');
    return s;
  }
  function siteOf(st) {
    var label = str(st.geoLabel || st.addr);
    return { lat: fin(st.lat), lng: fin(st.lng), label: label, src: str(st.geoSrc),
      zip: str(st.zip) || zipOf(label) || zipOf(st.addr), addr: str(st.addr) };
  }
  function stepOf(s) { return STEPS.indexOf(s) >= 0 ? s : 'start'; }
  function hasLayout(st) { return !!(st.area || st.unitAt || st.poi); }
  function runOf(st, u, L) {
    var r = st.run;
    if (!r) return null;
    if (r.total) return runRecord(r, runInput(u, L));
    return clean(r);
  }

  /* st: { addr, lat, lng, geoSrc, geoLabel, zip, step, unit, sub, hosting,
           grid, load, area, unitAt, poi, conduit, run }
     who: { uid, email, name, orgId }
     Prime v2 from the first write (C3). The drawing arrays start empty
     and Prime never writes one afterwards: placing is Site Map's. */
  function projectDoc(st, who, stamp) {
    st = st || {}; who = who || {};
    var u = st.unit, L = hasLayout(st) ? layout(st) : null, type = typeOf(st);
    var prime = { v: 2, type: type, step: stepOf(st.step), savedAt: stamp || null,
      by: { uid: str(who.uid), email: str(who.email).toLowerCase() },
      site: siteOf(st), unitKey: u.key, unit: snapshot(u),
      sub: subOf(st.sub), hosting: st.hosting ? clean(st.hosting) : null };
    if (L) prime.layout = L;
    var run = runOf(st, u, L);
    if (run) prime.run = run;
    var d = {
      uid: who.uid, orgId: who.orgId, ownerEmail: str(who.email).toLowerCase(), ownerName: who.name || '',
      name: st.addr, address: st.addr, type: type,
      siteScopes: type === 'microgrid' ? ['bess', 'solar', 'der'] : [type], stage: 'candidate',
      elements: [], conduits: [], annotations: [],
      /* a battery list only for a battery: Site Map's BESS tools read it */
      bessList: screenable(u) ? [bessEntry(u)] : [],
      mapState: { lat: +st.lat, lng: +st.lng, zoom: 19 },
      prime: prime
    };
    if (st.grid) d.grid = st.grid;
    if (st.load) d.load = st.load;
    if (stamp) { d.createdAt = stamp; d.updatedAt = stamp; }
    return d;
  }

  /* The dotted update Prime writes after the record exists. Only prime.*,
     the grid parts that changed this session (`grid.<part>`, never the
     whole map: the editor keeps its own lists there), the load, and — until
     Site Map has saved — the battery entry and updatedAt. Once the editor
     has saved (savedBy), bumping updatedAt would make an open editor tab
     refuse its next save, so prime.savedAt carries the time instead.
     prime.quote and prime.order are the server's and never written here.
     opts: { grid:{part:value}, unitChanged:bool, editedInSiteMap:bool } */
  function patch(st, who, stamp, opts) {
    st = st || {}; who = who || {}; opts = opts || {};
    var u = st.unit, L = hasLayout(st) ? layout(st) : null, p = {}, k;
    p['prime.v'] = 2;
    p['prime.type'] = typeOf(st);
    p['prime.step'] = stepOf(st.step);
    p['prime.savedAt'] = stamp || null;
    p['prime.by'] = { uid: str(who.uid), email: str(who.email).toLowerCase() };
    p['prime.site'] = siteOf(st);
    if (u) { p['prime.unitKey'] = u.key; p['prime.unit'] = snapshot(u); }
    p['prime.sub'] = subOf(st.sub);
    p['prime.hosting'] = st.hosting ? clean(st.hosting) : null;
    p['prime.layout'] = L;
    p['prime.run'] = runOf(st, u, L);
    if (opts.grid && typeof opts.grid === 'object') for (k in opts.grid) if (HAS.call(opts.grid, k) && /^[A-Za-z][A-Za-z0-9_]*$/.test(k)) p['grid.' + k] = clean(opts.grid[k]);
    if (st.load) p.load = clean(st.load);
    if (!opts.editedInSiteMap) {
      if (opts.unitChanged && u) p.bessList = screenable(u) ? [bessEntry(u)] : [];
      if (stamp) p.updatedAt = stamp;
    }
    return p;
  }

  var DRAWING_ARRAYS = ['elements', 'shapes', 'conduits', 'geoElements', 'geoShapes', 'geoConduits', 'annotations', 'supplyLinks', 'trench'];
  function editedOf(doc) {
    if (doc.savedBy) return true;
    for (var i = 0; i < DRAWING_ARRAYS.length; i++) {
      var v = doc[DRAWING_ARRAYS[i]];
      if (Array.isArray(v) && v.length) return true;
    }
    return Array.isArray(doc.docTabs) && doc.docTabs.length > 1;
  }
  function stampOf(v) {
    if (!v) return null;
    if (typeof v === 'number' || typeof v === 'string') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    return null;
  }

  /* ── THE UNIT A RECORD RESUMES WITH: ONE RULE ────────────────────────
     Prime's resume (restore(), below), the server's quote (api/customer-
     quote.js priced(), through restore()) and Site Map's build
     (omega-prime-handoff.js, through restore()) all ask THIS, each with the
     list it is offered (units()), so a v1 sketch — whose layout is replayed
     through arrange() with this unit — is drawn the same everywhere
     (review, 2026-10-17: a v1 record on the FENECON XXL, v1's default unit
     for every workspace, was a 20 ft container in Site Map and a point with
     no footprint in Prime and the quote). In order:
       the list's own entry by key   the catalog may have been corrected
                                     since; a footprint the rep typed
                                     survives the swap
       else the snapshot Prime kept  (v2 records; v1 kept none) — a
                                     charger, array or compute unit (#348)
                                     is its snapshot, never a battery
       else a SHIPPED unit by key    the R60 and the XXL are this file's own
                                     constants, whoever's list it is
       else the battery entry        footprint unknown
     units: the list the caller offers (PP.units()), or nothing. */
  var SHIPPED = {};
  SHIPPED[R60.key] = R60; SHIPPED[XXL.key] = XXL;
  function unitFor(doc, units) {
    doc = doc || {};
    var p = doc.prime && typeof doc.prime === 'object' ? doc.prime : {};
    var b0 = doc.bessList && doc.bessList[0];
    var key = p.unitKey || (p.unit && p.unit.key) || (b0 && b0.catalogKey) || '';
    var snap = p.unit ? snapshot(p.unit) : null, hit = null, i;
    var list = Array.isArray(units) ? units : [];
    for (i = 0; i < list.length && !hit; i++) if (list[i] && key && list[i].key === key) hit = list[i];
    if (hit) {
      var o = snapshot(hit);
      /* the submittal's size the rep typed outranks a reference or unknown one */
      var open = o.footprint === 'none' || o.footprint === 'reference';
      if (open && snap && snap.footprint === 'rep') o = repFootprint(o, snap.lFt, snap.wFt);
      else if (open && p.layout && p.layout.unit && p.layout.unit.footprint === 'rep') o = repFootprint(o, p.layout.unit.lFt, p.layout.unit.wFt);
      return o;
    }
    if (snap && ((num(snap.kw) && num(snap.kwh)) || snap.kind !== 'bess')) return snap;
    if (key && HAS.call(SHIPPED, key)) return snapshot(SHIPPED[key]);
    return fromBessEntry(b0);
  }

  /* ── IS IT ON THE LIST? ONE RULE ─────────────────────────────────────
     unitFor() resumes a record with its unit even when the list no longer
     offers it (a saved design keeps its unit; a picker only stops offering
     it). A PROPOSAL is an offer of the unit to a customer, so the server's
     quote prices, and the order hand-off orders, only a unit the
     workspace's own list offers: the list's entry by key, else the same
     product under another key (units() keeps one entry per SKU). Both
     doors ask THIS (api/customer-quote.js, api/_lib/prime-order.js), and
     both take the entry's own figures, never the record's. null: not on
     the list (the FENECON XXL a record carries outside FENECON's own
     workspace, from before 2026-10-17), and the rep chooses the unit to
     quote on the Proposal step, the drawing kept.
     u: the carried unit, or just { key, sku }. */
  function offered(list, u) {
    if (!u || !Array.isArray(list)) return null;
    var key = str(u.key), sku = norm(u.sku), i;
    if (key) for (i = 0; i < list.length; i++) if (list[i] && list[i].key === key) return list[i];
    if (sku) for (i = 0; i < list.length; i++) if (list[i] && norm(list[i].sku) === sku) return list[i];
    return null;
  }

  /* A saved projects/{id} document → what the page needs to resume
     (`/omega-prime?id=`). Pure: it reads the record and decides nothing
     the page has not been told. runFresh: the stored Run was priced for
     exactly the unit and drawing now on screen. editedInSiteMap: the
     editor has saved this project (savedBy) or it carries a drawing. */
  function restore(doc, list) {
    doc = doc || {};
    var p = doc.prime && typeof doc.prime === 'object' ? doc.prime : null, P = p || {};
    var site = P.site || {}, L0 = P.layout || null;
    var at = ll(site) || (L0 && L0.unit ? ll(L0.unit.c || L0.unit) : null) || ll(doc.mapState);
    var addr = str(site.addr || doc.address || doc.name);
    var label = str(site.label) || addr;
    var unit = unitFor(doc, list);
    var L = L0 ? upgrade(L0, unit) : null;
    var run = P.run || null;
    var g = doc.grid && typeof doc.grid === 'object' ? doc.grid : null;
    var sub = subOf(P.sub) || (g && g.substation ? subOf(g.substation) : null);
    var step = STEPS.indexOf(P.step) >= 0 ? P.step : (p ? (P.order ? 'track' : (P.quote ? 'quote' : 'map')) : 'start');
    return {
      isPrime: !!p, v: p ? (P.v || 1) : 0,
      addr: addr, lat: at ? at.lat : null, lng: at ? at.lng : null,
      geoSrc: str(site.src || P.geocode), geoLabel: label, zip: str(site.zip) || zipOf(label) || zipOf(addr),
      type: typeOf(doc), unit: unit, sub: sub, hosting: P.hosting || null, grid: g, load: doc.load || null,
      layout: L, run: run,
      runFresh: !!(run && run.input && L && unit && sameInput(run.input, runInput(unit, L))),
      step: step, quote: P.quote || null, order: P.order || null,
      editedInSiteMap: editedOf(doc), editedAt: doc.savedBy ? stampOf(doc.savedBy.at) : null
    };
  }

  var P = { HERO: HERO, STEPS: STEPS, UNIT_KEYS: UNIT_KEYS, R60: R60, XXL: XXL,
    fromEntry: fromEntry, units: units, snapshot: snapshot, repFootprint: repFootprint, isPlaceholder: isPlaceholder,
    bessEntry: bessEntry, zipOf: zipOf, peaks: peaks, subName: subName,
    primeType: primeType, forType: forType, screenable: screenable, typeOf: typeOf, orgId: orgId, linkQuery: linkQuery,
    FOOTPRINTS: FOOTPRINTS, CONTAINER_20: CONTAINER_20, ftToDeg: ftToDeg, pathFt: pathFt, arrange: arrange, feed: feed, conduitPath: conduitPath, area: area,
    hash: hash, fnv1a: fnv1a, layout: layout, upgrade: upgrade,
    runInput: runInput, runRecord: runRecord, sub: subOf, projectDoc: projectDoc, patch: patch, unitFor: unitFor, offered: offered, restore: restore };
  root.OmegaPrimeProject = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : this);
