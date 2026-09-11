/* ==========================================================================
   omega-listings-source.js  ·  ClearSky-OMEGA shared platform file
   --------------------------------------------------------------------------
   One normalized property shape, several interchangeable sources behind it.

   IMPORTANT, read before wiring PropertyShark:
   PropertyShark does not publish a documented public REST API. What exists
   is (a) enterprise/bulk data agreements negotiated directly, (b) third-party
   scrapers of their site, which will violate their terms and break without
   notice. Do not design around an endpoint that has not been confirmed in
   writing. The adapter below is deliberately thin and the field mapping is
   isolated to ONE function so that swapping to PropertyRadar, Regrid, ATTOM,
   Reonomy — or the Cook County parcel pipeline this platform already runs —
   is an afternoon, not a rewrite.

   Every provider MUST return the shape documented in `NORMALIZED` and MUST
   stamp `src` on each record. A modelled number presented as measured is the
   failure mode that ends up in front of a customer.
   ========================================================================== */
(function (root) {
  "use strict";

  var S = { providers: {}, active: null, name: "" };

  /* ------------------------------------------------------------ the shape
     id            stable per provider; used as the ledger's siteId
     addr          street address, no unit
     city, state, zip
     lat, lon      WGS84 centroid
     sqft          building area
     lotAcres
     type          normalized: Industrial | Warehouse | Office | Retail |
                   Manufacturing | Cold Storage | Data Center | Flex |
                   Multifamily | Institutional | Vacant Land | Other
     subtype       provider's own words, kept verbatim for the rep
     yearBuilt
     owner         { name, mailing, phone, email }
     lastSale      { date, price }
     assessedValue
     photos        [url]  — may be empty
     annualKwh     { value, src: metered|modelled|proxy }
     feederId      circuit this parcel sits on (joined, not from the provider)
     src           provider key
  */
  S.NORMALIZED = ["id","addr","city","state","zip","lat","lon","sqft","lotAcres",
                  "type","subtype","yearBuilt","owner","lastSale","assessedValue",
                  "photos","annualKwh","feederId","src"];

  S.TYPES = ["Industrial","Warehouse","Manufacturing","Cold Storage","Flex",
             "Office","Retail","Data Center","Multifamily","Institutional",
             "Vacant Land","Other"];

  /* ------------------------------------------------------------ energy model
     ONE table, here, because three files were each keeping their own and they
     had drifted: the demo provider modelled cold storage at 140 kBtu/sqft-yr
     and the ComEd provider at 96, so the SAME building switched between
     providers moved its headline kW by 46%. A comment in
     omega-comed-listings.js asserted the two were identical, which made the
     drift invisible to anyone reading rather than measuring.

     These are screening figures — CBECS/ENERGY STAR order-of-magnitude
     medians for the type, not a metered result for a building. Everything
     derived from them carries src "modelled" or "proxy" and the UI says so.
     If a tenant has metered data for a segment, correct it HERE and both
     providers move together. */
  S.EUI = { "Warehouse": 22, "Industrial": 48, "Manufacturing": 68,
            "Cold Storage": 96, "Flex": 38, "Office": 62, "Retail": 54,
            "Data Center": 220, "Institutional": 58, "Multifamily": 44,
            "Vacant Land": 0, "Other": 45 };

  /* Load factor: average demand over peak demand. Turns annual kWh into an
     estimated peak, which is what the demand-charge screen is sized against. */
  S.EUI_LF = { "Warehouse": 0.38, "Industrial": 0.55, "Manufacturing": 0.60,
               "Cold Storage": 0.72, "Flex": 0.50, "Retail": 0.45,
               "Office": 0.50, "Data Center": 0.85, "Institutional": 0.42,
               "Multifamily": 0.55, "Vacant Land": 0, "Other": 0.50 };

  /* ══════════════════════════════════════════════════════════════════════
     PARCEL UNDER A POINT

     Ported from the ComEd Capacity Finder, which had this before the Site
     Finder did. A point-in-polygon query against the county's own live
     assessor service answers "what parcel is this" exactly, where matching
     against records already downloaded only answers "what is the nearest
     thing I happen to hold".

     Note the geometry type: a POINT, not an envelope. ComEd's circuits get
     an envelope because a buffer boundary is approximate and a click on the
     kerb should still find the circuit down the street. A parcel boundary is
     a legal line — the point is either inside it or on the neighbour's land,
     and widening that query would return whichever parcel happened to sort
     first.

     Each county is added only once its endpoint AND field names have been
     read off a live record. Field names are never copied between counties:
     a wrong mapping returns a blank field rather than an error, which is
     indistinguishable from a parcel that genuinely has no owner recorded.
     ══════════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════════
     PARCEL UNDER A POINT

     The county registry lives in the Worker, not here. It exposes it at
     /counties and proxies each county at /parcel/<key>/query, so adding a
     county is a Worker deploy rather than a change to every page that asks
     about parcels. Two tools reading two hardcoded lists is how they end up
     disagreeing about which field holds the owner — which has already
     happened on DuPage.

     Going through the proxy also solves CORS: county servers vary in what
     they allow, and the Worker answers with a permissive header regardless.

     Note the geometry type: a POINT, not an envelope. ComEd's circuits get
     an envelope because a buffer boundary is approximate and a click on the
     kerb should still find the circuit down the street. A parcel boundary is
     a legal line — the point is either inside it or on the neighbour's land,
     and widening that query would return whichever parcel sorted first.
     ══════════════════════════════════════════════════════════════════════ */
  S.PROXY_ROOT = "https://comed-proxy.clearsky-omega.workers.dev";
  var COUNTIES = null, countiesBusy = false, countiesQ = [];

  function getJSONx(url, cb) {
    var x = new XMLHttpRequest();
    try { x.open("GET", url, true); } catch (e) { cb(e); return; }
    x.timeout = 20000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status < 200 || x.status >= 300) { cb(new Error("HTTP " + x.status)); return; }
      var j = null;
      try { j = JSON.parse(x.responseText); } catch (e) { cb(e); return; }
      cb(null, j);
    };
    x.ontimeout = function () { cb(new Error("timed out")); };
    x.onerror = function () { cb(new Error("network error")); };
    x.send();
  }

  S.counties = function (cb) {
    if (COUNTIES) { cb(null, COUNTIES); return; }
    countiesQ.push(cb);
    if (countiesBusy) return;
    countiesBusy = true;
    getJSONx(S.PROXY_ROOT + "/counties", function (err, j) {
      countiesBusy = false;
      COUNTIES = (!err && j && !j.error) ? j : {};
      var qs = countiesQ; countiesQ = [];
      for (var i = 0; i < qs.length; i++) qs[i](err || null, COUNTIES);
    });
  };

  S.parcelAt = function (lat, lon, cb) {
    S.counties(function (err, reg) {
      var keys = [], k;
      for (k in reg) if (reg.hasOwnProperty(k)) keys.push(k);
      /* Regrid last: it is licensed and covers all 102 counties, so it is the
         fallback rather than the first thing asked. A free county answer is
         also the county's own record, which is the one a rep will be quoted
         back at them. */
      keys.sort(function (a, b) { return (a === "regrid") - (b === "regrid"); });
      var i = 0;
      (function next() {
        if (i >= keys.length) { cb(null, null); return; }
        var key = keys[i++], cfg = reg[key];
        var flds = [cfg.idField, cfg.addr, cfg.owner].filter(Boolean).join(",");
        var q = S.PROXY_ROOT + "/parcel/" + key + "/query?" + [
          "geometry=" + lon + "," + lat,
          "geometryType=esriGeometryPoint",
          "inSR=4326",
          "spatialRel=esriSpatialRelIntersects",
          "outFields=" + encodeURIComponent(flds || "*"),
          "returnGeometry=false",
          "f=json"
        ].join("&");
        getJSONx(q, function (e2, j) {
          var f = (!e2 && j && !j.error && j.features && j.features[0])
                    ? j.features[0].attributes : null;
          if (!f) { next(); return; }
          /* Report which field each value came from. When two tools disagree
             about a county's schema — and they have — the card should show
             what it read, not just what it concluded. */
          cb(null, {
            county: cfg.label || key, countyKey: key,
            pin: cfg.idField ? String(f[cfg.idField] || "").trim() : "",
            addr: cfg.addr ? String(f[cfg.addr] || "").trim() : "",
            owner: cfg.owner ? String(f[cfg.owner] || "").trim() : "",
            fields: { pin: cfg.idField || null, addr: cfg.addr || null,
                      owner: cfg.owner || null },
            note: cfg.note || "",
            raw: f, src: "assessor"
          });
        });
      })();
    });
  };

  S.register = function (key, impl) { S.providers[key] = impl; return impl; };

  /* ── CONFIGURATION, NOT A DEPLOY ──────────────────────────────────────
     A provider's endpoint, its credential and its field map are facts about
     an agreement somebody signed, not facts about this codebase. They
     arrive from the organisation's own settings, so the person holding the
     credentials can finish the integration without waiting for a release.

     Credentials are never stored in this module. The route is proxied and
     the key rides on the request the proxy makes, so a browser that can
     read this file cannot read the key. */
  S.configure = function (key, cfg) {
    var p = S.providers[key];
    if (!p || !cfg) return p;
    if (typeof cfg.proxy === "string" && cfg.proxy) p.proxy = cfg.proxy;
    if (cfg.map && typeof cfg.map === "object") p.map = cfg.map;
    if (typeof cfg.enabled === "boolean") p.enabled = cfg.enabled;
    return p;
  };
  S.use = function (key) {
    if (!S.providers[key]) throw new Error("No listing provider registered as '" + key + "'.");
    S.active = S.providers[key]; S.name = key; return S.active;
  };
  S.search = function (bbox, filters, cb) {
    if (!S.active) { cb(new Error("No property source selected.")); return; }
    S.active.search(bbox, filters || {}, cb);
  };
  S.detail = function (id, cb) {
    if (!S.active) { cb(new Error("No property source selected.")); return; }
    if (!S.active.detail) { cb(null, null); return; }
    S.active.detail(id, cb);
  };

  /* ====================================================================
     PROVIDER 1 — PropertyShark (or any keyed commercial source)

     Runs through the same Cloudflare worker the ComEd proxy already uses.
     Two reasons it cannot call the vendor directly from this page:
       1. CORS. A browser origin will be rejected.
       2. The API key would be sitting in client JavaScript, readable by
          anyone with devtools, on a per-record-billed contract.

     Worker contract expected at  {PROXY}/listings/search  and  /listings/detail
     ==================================================================== */
  S.register("propertyshark", {
    label: "PropertyShark",
    ready: false,          /* flipped true once the worker route answers */
    proxy: "",             /* set via S.providers.propertyshark.proxy = "..." */

    search: function (bbox, filters, cb) {
      if (!this.proxy) {
        cb(new Error("PropertyShark is not connected. Set the proxy route, then re-run."));
        return;
      }
      var q = "?minLat=" + bbox.s + "&maxLat=" + bbox.n +
              "&minLon=" + bbox.w + "&maxLon=" + bbox.e +
              "&types=" + encodeURIComponent((filters.types || []).join(",")) +
              "&minSqft=" + (filters.minSqft || 0) +
              "&limit=" + (filters.limit || 300);
      req(this.proxy + "/listings/search" + q, function (err, j) {
        if (err) { cb(err); return; }
        var rows = (j && (j.results || j.properties || j.data)) || [];
        var out = [];
        for (var i = 0; i < rows.length; i++) out.push(fromPropertyShark(rows[i]));
        cb(null, out);
      });
    },

    detail: function (id, cb) {
      if (!this.proxy) { cb(null, null); return; }
      req(this.proxy + "/listings/detail?id=" + encodeURIComponent(id), function (err, j) {
        cb(err, err ? null : fromPropertyShark(j && (j.result || j)));
      });
    }
  });

  /* THE ONLY PLACE PROVIDER FIELD NAMES APPEAR.
     Field names below are PLACEHOLDERS. Confirm every one against a live
     record before trusting this in front of a customer — county and vendor
     schemas do not match their documentation often enough to assume. */
  function fromPropertyShark(r) {
    if (!r) return null;
    var o = r.owner || r.ownerInfo || {};
    return {
      id:      str(r.propertyId || r.id || r.parcelId || r.pin),
      addr:    str(r.address || r.streetAddress || r.situsAddress),
      city:    str(r.city || r.municipality),
      state:   str(r.state),
      /* No "IL" default. These adapters read whatever a vendor or a harvest
         file returns, and this platform has tenants outside Illinois. A
         missing state that renders blank is a gap a rep can see; a missing
         state that renders "IL" is a wrong address that looks complete, and
         it flows into the CSV export and out to a customer. */
      zip:     str(r.zip || r.zipCode),
      lat:     numOr(r.latitude != null ? r.latitude : (r.lat != null ? r.lat : (r.geo && r.geo.lat))),
      lon:     numOr(r.longitude != null ? r.longitude : (r.lon != null ? r.lon : (r.geo && r.geo.lng))),
      sqft:    numOr(r.buildingArea || r.grossArea || r.sqft || r.buildingSqFt),
      lotAcres:numOr(r.lotAcres || (r.lotSqFt ? r.lotSqFt / 43560 : null)),
      type:    normType(r.propertyType || r.landUse || r.buildingClass),
      subtype: str(r.propertyTypeDetail || r.landUse || r.buildingClass),
      yearBuilt: numOr(r.yearBuilt),
      owner: {
        name:    str(o.name || r.ownerName),
        mailing: str(o.mailingAddress || r.ownerAddress),
        phone:   str(o.phone || ""),
        email:   str(o.email || "")
      },
      lastSale: { date: str(r.lastSaleDate || (r.lastSale && r.lastSale.date)),
                  price: numOr(r.lastSalePrice || (r.lastSale && r.lastSale.price)) },
      assessedValue: numOr(r.assessedValue || r.marketValue),
      photos: r.photos || r.images || [],
      annualKwh: null,          /* joined separately — never comes from a listing source */
      feederId: null,           /* joined spatially against hosting capacity */
      src: "propertyshark"
    };
  }

  /* ====================================================================
     PROVIDER 2 — Crexi

     Crexi DOES publish a Listing API, unlike PropertyShark. Two things to
     know before budgeting time against it:

       1. It is a partnership, not a signup. Their help centre routes it
          through integrations@crexi.com and scopes it to brokerages and
          real-estate data providers.
       2. The documented API is oriented at getting listings ONTO Crexi —
          syndication inbound. Pulling their marketplace out is a data
          agreement, and it is a different conversation from the one on the
          Listing API page. Ask for outbound explicitly or the first call
          will be about the wrong product.

     What Crexi is good for here is narrow and worth being clear about: it
     covers what is ON THE MARKET. A for-sale or for-lease listing carries a
     verified address, building size, year built, zoning and a named broker —
     exactly the fields a county parcel file is worst at. It does NOT cover
     the owner-occupied industrial building that has never been listed, which
     is most of the target set. So this is an ENRICHMENT source layered onto
     the parcel pipeline, not a replacement for it.

     A site that is actively listed also changes the sales approach, which is
     why `listed` is surfaced rather than buried: the buyer signs the twenty
     year lease, not the seller.
     ==================================================================== */
  S.register("crexi", {
    label: "Crexi",
    enrichOnly: true,      /* not a primary source — see the note above */
    proxy: "",

    search: function (bbox, filters, cb) {
      if (!this.proxy) { cb(new Error("Crexi is not connected. Set the proxy route, then re-run.")); return; }
      /* `this` does not survive into the callback, and the configured field
         map lives on the provider. */
      var self = this;
      var q = "?minLat=" + bbox.s + "&maxLat=" + bbox.n +
              "&minLon=" + bbox.w + "&maxLon=" + bbox.e +
              "&types=" + encodeURIComponent((filters.types || []).join(",")) +
              "&minSqft=" + (filters.minSqft || 0) +
              "&limit=" + (filters.limit || 300);
      req(this.proxy + "/crexi/search" + q, function (err, j) {
        if (err) { cb(err); return; }
        var rows = (j && (j.results || j.data || j.listings)) || [], out = [], i;
        for (i = 0; i < rows.length; i++) out.push(fromCrexi(rows[i], self.map));
        cb(null, out);
      });
    },

    /* Address-first, because that is the join that matters. The parcel
       pipeline already knows where a building is; what it wants from Crexi
       is whether that building is on the market and who to call about it. */
    detail: function (idOrAddr, cb) {
      if (!this.proxy) { cb(null, null); return; }
      var self = this;
      req(this.proxy + "/crexi/detail?q=" + encodeURIComponent(idOrAddr), function (err, j) {
        cb(err, err ? null : fromCrexi(j && (j.result || j), self.map));
      });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     THE FIELD MAP — WHERE THEIR RECORD BECOMES OURS

     Every Crexi field name in this file is a GUESS. They were written from
     their public documentation before any live record existed, and the
     original note said to confirm every one before it reached a customer.
     That note is the problem: confirming them means editing this file,
     which means a deploy, which means the integration cannot be finished by
     the person who actually has the credentials and the sample payload.

     So the guesses become DEFAULTS and the real names are configuration.
     S.configure("crexi", { map: { addr: "propertyAddress", ... } }) and the
     mapper follows it. Dotted paths work — "location.address" — because
     listing APIs nest, and a map that cannot express nesting would send
     everybody straight back to editing this file.

     WHAT IS NOT CONFIGURABLE is the shape it produces. Every consumer of
     this pipeline — the cards, the ledger, the packet, the estimator —
     reads the same record, so a provider may say where its data lives but
     never what the pipeline is called.
     ══════════════════════════════════════════════════════════════════════ */
  var CREXI_DEFAULT_MAP = {
    id:        ["listingId", "id"],
    addr:      ["address", "streetAddress", "location.address"],
    city:      ["city", "location.city"],
    state:     ["state", "location.state"],
    zip:       ["zip", "zipCode"],
    lat:       ["latitude", "location.lat"],
    lon:       ["longitude", "location.lng"],
    sqft:      ["buildingSize", "squareFeet", "sqft"],
    lotAcres:  ["lotSize", "acres"],
    type:      ["propertyType", "assetType"],
    subtype:   ["propertySubtype", "propertyType"],
    yearBuilt: ["yearBuilt"],
    zoning:    ["zoning"],
    ownerName: ["ownerName"],
    brokerName:  ["broker.name", "listingAgent.name", "broker.fullName"],
    brokerFirm:  ["broker.company", "listingAgent.company", "broker.brokerage"],
    brokerPhone: ["broker.phone", "listingAgent.phone"],
    brokerEmail: ["broker.email", "listingAgent.email"],
    dealType:  ["dealType"],
    askPrice:  ["askingPrice", "price"],
    askRate:   ["askingRate", "leaseRate"],
    capRate:   ["capRate"],
    daysOnMarket: ["daysOnMarket"],
    url:       ["url", "listingUrl"],
    lastSaleDate:  ["lastSaleDate"],
    lastSalePrice: ["lastSalePrice"],
    photos:    ["images", "photos"]
  };

  /* One dotted path, resolved without throwing on a missing branch. */
  function dig(obj, path) {
    if (!obj || !path) return undefined;
    var parts = String(path).split("."), cur = obj, i;
    for (i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  /* First path that yields something. The configured path is tried before
     the defaults, so an organisation overrides one field without having to
     restate the other twenty-five. */
  function pick(rec, cfgMap, key) {
    var tries = [];
    if (cfgMap && cfgMap[key]) tries = tries.concat(cfgMap[key]);
    tries = tries.concat(CREXI_DEFAULT_MAP[key] || []);
    for (var i = 0; i < tries.length; i++) {
      var v = dig(rec, tries[i]);
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  }

  /* Which of our fields their sample actually fills, and by which path.
     The point of the whole exercise: paste one real listing and see what
     lands where, instead of discovering it on a customer's screen. */
  S.mapReport = function (sample, cfgMap) {
    var out = { filled: [], empty: [], unused: [] }, k, i;
    for (k in CREXI_DEFAULT_MAP) {
      if (!CREXI_DEFAULT_MAP.hasOwnProperty(k)) continue;
      var tries = ((cfgMap && cfgMap[k]) || []).concat(CREXI_DEFAULT_MAP[k]);
      var hit = null;
      for (i = 0; i < tries.length; i++) {
        var v = dig(sample, tries[i]);
        if (v !== undefined && v !== null && v !== "") { hit = { path: tries[i], value: v }; break; }
      }
      if (hit) out.filled.push({ field: k, path: hit.path, value: hit.value });
      else out.empty.push({ field: k, tried: tries });
    }
    /* Their fields we are ignoring. Often where the useful thing is hiding. */
    for (k in sample) {
      if (!sample.hasOwnProperty(k)) continue;
      var used = false;
      for (i = 0; i < out.filled.length; i++) {
        if (String(out.filled[i].path).split(".")[0] === k) { used = true; break; }
      }
      if (!used) out.unused.push(k);
    }
    return out;
  };

  function fromCrexi(r, cfgMap) {
    if (!r) return null;
    var P = function (k) { return pick(r, cfgMap, k); };
    return {
      id:      str(P("id")),
      addr:    str(P("addr")),
      city:    str(P("city")),
      state:   str(P("state")),
      zip:     str(P("zip")),
      lat:     numOr(P("lat")),
      lon:     numOr(P("lon")),
      sqft:    numOr(P("sqft")),
      lotAcres:numOr(P("lotAcres")),
      type:    normType(P("type")),
      subtype: str(P("subtype")),
      yearBuilt: numOr(P("yearBuilt")),
      zoning:  str(P("zoning")),
      owner: { name: str(P("ownerName")), mailing: "", phone: "", email: "" },
      /* The broker is the reachable human on a listed building, and often the
         only one. Kept distinct from `owner` because they are not the same
         person and a rep must know which they are calling. */
      broker: { name: str(P("brokerName")), firm: str(P("brokerFirm")),
                phone: str(P("brokerPhone")), email: str(P("brokerEmail")) },
      listed: {
        forSale:  r.forSale === true || /sale/i.test(str(P("dealType"))),
        forLease: r.forLease === true || /lease/i.test(str(P("dealType"))),
        askPrice: numOr(P("askPrice")),
        askRate:  numOr(P("askRate")),
        capRate:  numOr(P("capRate")),
        daysOnMarket: numOr(P("daysOnMarket")),
        url:      str(P("url"))
      },
      lastSale: { date: str(P("lastSaleDate")), price: numOr(P("lastSalePrice")) },
      assessedValue: null,
      photos: P("photos") || [],
      annualKwh: null,
      feederId: null,
      src: "crexi"
    };
  }

  /* ====================================================================
     PROVIDER 3 — Parcel pipeline (the one this platform already runs)

     Reads a finished harvest file rather than joining APIs live. This is
     the production path: the browser reads a table that was built offline,
     which is the only version of this that does not silently truncate.
     ==================================================================== */
  S.register("harvest", {
    label: "Harvest file",
    url: "prospects.json",
    rows: null,
    search: function (bbox, filters, cb) {
      var self = this;
      function done() {
        var out = [], i, r;
        for (i = 0; i < self.rows.length; i++) {
          r = self.rows[i];
          if (r.lat == null || r.lon == null) continue;
          if (r.lat < bbox.s || r.lat > bbox.n || r.lon < bbox.w || r.lon > bbox.e) continue;
          out.push(r);
        }
        cb(null, out);
      }
      if (self.rows) { done(); return; }
      req(self.url, function (err, j) {
        if (err) { cb(new Error("Could not read " + self.url + ". Run the harvest first.")); return; }
        var arr = (j && (j.rows || j)) || [];
        self.rows = [];
        for (var i = 0; i < arr.length; i++) {
          var n = fromHarvest(arr[i]);
          if (n) self.rows.push(n);
        }
        done();
      });
    }
  });

  function fromHarvest(r) {
    if (!r) return null;
    return {
      id: str(r.pin || r.id), addr: str(r.addr || r.address), city: str(r.city), state: str(r.state),
      zip: str(r.zip), lat: numOr(r.lat), lon: numOr(r.lon),
      sqft: numOr(r.sqft || r.buildingSqFt), lotAcres: numOr(r.lotAcres),
      type: normType(r.clsLabel || r.type), subtype: str(r.clsLabel || r.type),
      yearBuilt: numOr(r.yearBuilt),
      owner: { name: str(r.owner || r.ownerName), mailing: str(r.ownerAddr),
               phone: str(r.phone), email: str(r.email) },
      lastSale: { date: str(r.saleDate), price: numOr(r.salePrice) },
      assessedValue: numOr(r.assessedValue),
      photos: r.photos || [],
      annualKwh: r.kwh != null ? { value: numOr(r.kwh), src: r.kwhSrc || "modelled" } : null,
      feederId: str(r.feeder) || null,
      nameplate: numOr(r.bess != null ? r.bess : r.val),
      queue: numOr(r.queue) || 0,
      sub: str(r.sub),
      src: "harvest"
    };
  }

  /* ====================================================================
     PROVIDER 4 — Demo

     Deterministic. The same viewport produces the same properties on every
     reload, because a demo that reshuffles itself looks broken to a
     customer. Seeded off a lat/lon grid, not Math.random().

     This exists so the UI, the sizing math and the ledger can be exercised
     end-to-end before any vendor contract is signed. It is labelled as
     sample data everywhere it surfaces.
     ==================================================================== */
  var DEMO_TYPES = [
    { t: "Warehouse",     sub: "Warehouse, distribution",       lf: 0.38, w: 26 },
    { t: "Industrial",    sub: "Industrial, light",             lf: 0.55, w: 18 },
    { t: "Manufacturing", sub: "Manufacturing plant",           lf: 0.60, w: 12 },
    { t: "Cold Storage",  sub: "Refrigerated warehouse",        lf: 0.72, w: 6  },
    { t: "Flex",          sub: "Flex / R&D",                    lf: 0.50, w: 8  },
    { t: "Retail",        sub: "Retail, big box",               lf: 0.45, w: 9  },
    { t: "Office",        sub: "Office, low-rise",              lf: 0.50, w: 8  },
    /* Deliberately rare. A colocation building is the best demand-charge
       target on any list, so it sorts to the top every time — at realistic
       frequency that is a signal, at demo frequency it is just noise. */
    { t: "Data Center",   sub: "Colocation",                    lf: 0.85, w: 1  },
    { t: "Institutional", sub: "School / campus",               lf: 0.42, w: 6  },
    { t: "Vacant Land",   sub: "Vacant industrial land",        lf: 0,    w: 5  }
  ];
  /* Chicago's address grid: 0/0 is State & Madison, 800 address units to the
     mile on both axes. Encoding it lets a demo address AGREE with the pin it
     is attached to.

     The previous generator picked a street and a house number from a hash of
     the coordinate, independently of each other and of the map. It produced
     "11568 W 47th St, Chicago IL 60630" on a pin sitting on West 19th Street:
     a number roughly five miles past the western city limit, on a street
     4700 South, in a ZIP that is 5300 North. Three mutually exclusive
     locations on one card. Sample data is allowed to be invented; it is not
     allowed to be internally impossible, because the person being shown it
     checks the one address they happen to know. */
  var GRID = { lat0: 41.88190, lon0: -87.62780, latU: 69.0 * 800, lonU: 51.4 * 800 };

  /* Named streets with their grid coordinate. Diagonals (Milwaukee, Elston,
     Archer, Ogden) are deliberately absent — their address number does not
     follow either axis, so one cannot be derived. */
  var EW_STREETS = [   /* east-west; the number runs east-west */
    { n: "W 95th St", g: -9500 }, { n: "W 79th St", g: -7900 },
    { n: "W 63rd St", g: -6300 }, { n: "W 55th St", g: -5500 },
    { n: "W 47th St", g: -4700 }, { n: "W 39th St", g: -3900 },
    { n: "W 31st St", g: -3100 }, { n: "W Cermak Rd", g: -2200 },
    { n: "W 19th St", g: -1900 }, { n: "W Roosevelt Rd", g: -1200 },
    { n: "W Grand Ave", g: 530 }, { n: "W North Ave", g: 1600 },
    { n: "W Fullerton Ave", g: 2400 }, { n: "W Belmont Ave", g: 3200 },
    { n: "W Irving Park Rd", g: 4000 }, { n: "W Lawrence Ave", g: 4800 },
    { n: "W Devon Ave", g: 6400 }
  ];
  var NS_STREETS = [   /* north-south; the number runs north-south */
    { n: "S Halsted St", g: -800 }, { n: "S Ashland Ave", g: -1600 },
    { n: "S Damen Ave", g: -2000 }, { n: "S Western Ave", g: -2400 },
    { n: "S Kedzie Ave", g: -3200 }, { n: "S Pulaski Rd", g: -4000 },
    { n: "S Kostner Ave", g: -4400 }, { n: "S Cicero Ave", g: -4800 },
    { n: "S Central Ave", g: -5600 }, { n: "S Austin Ave", g: -6000 },
    { n: "S Harlem Ave", g: -7200 }
  ];

  function gridNS(lat) { return Math.round((lat - GRID.lat0) * GRID.latU); }
  function gridEW(lon) { return Math.round((lon - GRID.lon0) * GRID.lonU); }

  function nearest(list, g) {
    var best = list[0], bd = Infinity, i, d;
    for (i = 0; i < list.length; i++) {
      d = Math.abs(list[i].g - g);
      if (d < bd) { bd = d; best = list[i]; }
    }
    return best;
  }

  /* The grid is Chicago's and ONLY Chicago's. Outside this box the street
     list is meaningless — nearest() will happily return "W Cermak Rd" for a
     pin in Dallas, because it returns the closest entry in the list rather
     than the closest street to the pin. This tool has tenants outside ComEd
     territory and the demo provider is what they see, so a demo record away
     from Chicago says less rather than saying something false. */
  var GRID_BOX = { s: 41.60, n: 42.10, w: -88.00, e: -87.50 };

  function inGrid(lat, lon) {
    return lat >= GRID_BOX.s && lat <= GRID_BOX.n &&
           lon >= GRID_BOX.w && lon <= GRID_BOX.e;
  }

  /* Address the site off whichever named street it is genuinely closest to,
     and take the number from the perpendicular axis. Picking the axis by a
     hash instead put four different pins on "2258 S Kedzie Ave" — same street,
     same number, four buildings. */
  function demoAddress(lat, lon, h) {
    if (!inGrid(lat, lon)) {
      /* No street name is invented off the map it belongs to. A coordinate
         is true of the pin wherever it is, and reads as sample data rather
         than as an address a rep might try to drive to. */
      return "Sample site " + h.toString(36).toUpperCase() +
             " \u00b7 " + lat.toFixed(4) + ", " + lon.toFixed(4);
    }
    var ns = gridNS(lat), ew = gridEW(lon);
    var ewSt = nearest(EW_STREETS, ns), nsSt = nearest(NS_STREETS, ew);
    var dToEW = Math.abs(ewSt.g - ns), dToNS = Math.abs(nsSt.g - ew);
    var name, num, capped;
    if (dToNS <= dToEW) {
      /* On a north-south street: the number runs north-south. */
      name = nsSt.n.replace(/^S /, ns < 0 ? "S " : "N ");
      num = Math.abs(ns);
      capped = ns < 0 ? 13800 : 7600;   /* the grid runs to 138th St south */
    } else {
      /* On an east-west street: the number runs east-west. */
      name = ewSt.n.replace(/^W /, ew < 0 ? "W " : "E ");
      num = Math.abs(ew);
      capped = ew < 0 ? 7600 : 4000;    /* Harlem west, the lake east */
    }
    /* Position within the block, the way a real address works — otherwise
       every pin on one row of the demo lattice lands on the same number. */
    num += h % 98;
    num = Math.max(100, Math.round(num / 2) * 2 + (h % 2));   /* even/odd side */
    if (num > capped) num = capped - (h % 400);
    return num + " " + name;
  }

  /* The demo record carries NO ZIP. The old one was "606" + a hash, which put
     a Jefferson Park ZIP on a pin in Little Village. A ZIP that disagrees with
     the address is a third contradictory fact on the card, and this project's
     own rule applies to sample data as much as to real: a blank field reads as
     "not known", an invented one reads as data. Chicago + IL is true of every
     demo pin, so that much is said and no more. */

  /* Invented firms. The list here used to be twenty real industrial REITs and
     developers — Prologis, Duke, CenterPoint and so on — attached to invented
     buildings, invented sale prices and invented grid claims. That is a real
     company's name on a fabricated record, sitting in a screenshot that ends
     up in a deck. These are made up on purpose and read as plausible without
     naming anyone. */
  var DEMO_OWNERS = ["Rockwell Yard Partners LP","Blue Island Logistics REIT",
    "Midwest Cold Holdings LLC","Calumet Industrial Trust","Sawgrass Property Group",
    "Ridgeway Industrial LP","Fox Valley Asset Co","Northline Development",
    "Grand Junction Realty LP","Harborlight Industrial","Kinzie Yards LLC",
    "Prairie Gate Properties","Bellwood Asset Partners","Stony Creek Industrial",
    "Copperline Estates LP","Waterman Holdings LLC","Cedar Point Logistics",
    "Union Row Development","Thornton Ridge Partners","Marquette Field Trust"];

  /* xorshift — small, deterministic, no dependencies */
  function seeded(seed) {
    var x = seed | 0 || 88675123;
    return function () {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return ((x >>> 0) % 100000) / 100000;
    };
  }
  function hash(s) {
    var h = 2166136261, i;
    s = String(s);
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }
  function pickWeighted(rnd, arr) {
    var total = 0, i;
    for (i = 0; i < arr.length; i++) total += arr[i].w;
    var r = rnd() * total, acc = 0;
    for (i = 0; i < arr.length; i++) { acc += arr[i].w; if (r <= acc) return arr[i]; }
    return arr[arr.length - 1];
  }

  /* Circuits are assigned by a coarse spatial grid so that NEIGHBOURING
     properties genuinely share a feeder. That is the whole point of the
     ledger and a random assignment would never exercise it. ~0.012 deg is
     roughly a mile, which is the right order for an urban distribution
     circuit's footprint. */
  var CELL = 0.012;
  S.demoFeederFor = function (lat, lon) {
    var gy = Math.floor(lat / CELL), gx = Math.floor(lon / CELL);
    var h = hash(gy + ":" + gx);
    var subN = (h % 40) + 1;
    return { feederId: "F" + (2000 + (h % 7000)), sub: "SUB " + (subN < 10 ? "0" : "") + subN,
             gy: gy, gx: gx, h: h };
  };
  S.demoCapacityFor = function (feederId) {
    var h = hash(feederId), rnd = seeded(h);
    /* Hosting capacity on a real urban feeder is mostly small with a long
       right tail. A uniform draw would make every circuit look sellable. */
    var roll = rnd();
    var nameplate = roll < 0.30 ? Math.round(150 + rnd() * 550)      /* tight     */
                  : roll < 0.72 ? Math.round(700 + rnd() * 2300)     /* workable  */
                  : roll < 0.94 ? Math.round(3000 + rnd() * 5000)    /* good      */
                                : Math.round(8000 + rnd() * 12000);  /* rare, big */
    var queue = rnd() < 0.34 ? Math.round(nameplate * (0.10 + rnd() * 0.55)) : 0;
    return { nameplate: nameplate, queue: queue };
  };

  S.register("demo", {
    label: "Sample data",
    sample: true,
    search: function (bbox, filters, cb) {
      var out = [];
      var latSpan = bbox.n - bbox.s, lonSpan = bbox.e - bbox.w;
      if (latSpan <= 0 || lonSpan <= 0) { cb(null, out); return; }
      /* Walk a fixed grid over the viewport so results are stable as the map
         pans — a property does not move because you scrolled past it. */
      var step = 0.0018;
      var maxCells = 12000, cells = 0;
      var density = filters && filters.density ? filters.density : 0.16;
      var lat, lon;
      for (lat = Math.ceil(bbox.s / step) * step; lat <= bbox.n; lat += step) {
        for (lon = Math.ceil(bbox.w / step) * step; lon <= bbox.e; lon += step) {
          if (++cells > maxCells) { cb(null, out); return; }
          var key = Math.round(lat * 1e5) + ":" + Math.round(lon * 1e5);
          var h = hash(key), rnd = seeded(h);
          if (rnd() > density) continue;
          out.push(makeDemo(lat, lon, h, rnd));
          if (out.length >= (filters.limit || 400)) { cb(null, out); return; }
        }
      }
      cb(null, out);
    }
  });

  function makeDemo(lat, lon, h, rnd) {
    var ty = pickWeighted(rnd, DEMO_TYPES);
    var f = S.demoFeederFor(lat, lon);
    var street = demoAddress(lat, lon, h);
    var sqft = ty.t === "Vacant Land" ? 0
             : ty.t === "Data Center" ? Math.round((30000 + rnd() * 90000) / 500) * 500
             : Math.round((8000 + rnd() * 420000) / 500) * 500;
    var lot = Math.round((sqft / 43560 * (1.6 + rnd() * 2.4) + rnd() * 2) * 100) / 100;

    /* EUI (kBtu/sf/yr) from the shared table, converted to kWh. Modelled, and
       flagged as modelled — never shown as if it came off a meter. It reads
       S.EUI rather than a local copy so a sample record and a real record are
       never scaled differently; a demo that quotes a bigger building than
       production would is a demo that oversells. */
    var EUI = S.EUI[ty.t] != null ? S.EUI[ty.t] : S.EUI.Other;
    var kwh = sqft ? Math.round(sqft * EUI * (0.75 + rnd() * 0.5) / 3.412) : null;

    return {
      id: "D" + h.toString(36).toUpperCase(),
      addr: street,
      /* City and state are only asserted where they are true. A tenant in
         Dallas panning to Dallas got sites labelled "Chicago, IL" — a false
         statement on every card, on the one surface a prospect looks at. */
      city: inGrid(lat, lon) ? "Chicago" : "", state: inGrid(lat, lon) ? "IL" : "", zip: "",
      lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6,
      sqft: sqft || null,
      lotAcres: lot,
      type: ty.t, subtype: ty.sub,
      yearBuilt: ty.t === "Vacant Land" ? null : 1948 + Math.floor(rnd() * 74),
      owner: { name: DEMO_OWNERS[h % DEMO_OWNERS.length],
               mailing: "", phone: "", email: "" },
      lastSale: { date: (2014 + Math.floor(rnd() * 12)) + "-0" + (1 + Math.floor(rnd() * 9)) + "-1" + Math.floor(rnd() * 9),
                  price: sqft ? Math.round(sqft * (38 + rnd() * 95) / 1000) * 1000 : null },
      assessedValue: sqft ? Math.round(sqft * (22 + rnd() * 60) / 1000) * 1000 : null,
      photos: [],
      annualKwh: kwh ? { value: kwh, src: "modelled" } : null,
      loadFactor: ty.lf,
      feederId: f.feederId, sub: f.sub,
      src: "demo", sample: true
    };
  }

  /* ------------------------------------------------------------- helpers */
  function str(v) { return v == null ? "" : String(v).trim(); }
  function numOr(v) { var x = parseFloat(v); return isNaN(x) ? null : x; }

  function normType(v) {
    var t = String(v || "").toLowerCase();
    if (/cold storage|refrigerat/.test(t)) return "Cold Storage";
    if (/data ?cent|colocation|server/.test(t)) return "Data Center";
    if (/warehouse|distribution/.test(t)) return "Warehouse";
    if (/manufactur|plant|foundry/.test(t)) return "Manufacturing";
    if (/flex|r&d|research/.test(t)) return "Flex";
    if (/office|bank/.test(t)) return "Office";
    if (/retail|store|mall|mercantile|shopping/.test(t)) return "Retail";
    if (/apartment|multifamily|residential/.test(t)) return "Multifamily";
    if (/school|college|university|hospital|church|worship|govern/.test(t)) return "Institutional";
    if (/vacant|land/.test(t)) return "Vacant Land";
    if (/industrial/.test(t)) return "Industrial";
    return "Other";
  }
  S.normType = normType;

  /* ══════════════════════════════════════════════════════════════════════
     PROVENANCE AUDIT — what is actually behind the numbers
     ----------------------------------------------------------------------
     Every provider MUST return the NORMALIZED shape. Nothing checked that,
     and the failure mode is silent: one field name guessed wrong against a
     partner's live payload and `sqft` comes back null on every record in a
     bulk load. Nobody notices until a rep sorts by building size and gets an
     empty column — by which point the load has been repeated and shared.

     That is the difference between data and BANKABLE data, and it is not
     precision. It is knowing, per field, how many records carry a real value,
     how many are modelled, and how many are empty — and being able to put
     that in front of somebody who is lending against it.

     audit() answers three questions and nothing else:

       COVERAGE   of N records, how many carry each field
       PROVENANCE which numbers are measured, which are modelled, which are
                  a proxy — annualKwh already declares this and the answer
                  belongs in the report rather than buried per record
       BROKEN     a field that is empty on EVERY record, when some records
                  have it, is a mapping fault rather than missing data. Said
                  plainly, because it is the one that gets shipped.

     No thresholds, no score. A number somebody lends against should be read,
     not graded.
     ══════════════════════════════════════════════════════════════════════ */

  /* Fields a listing genuinely may not have, so their absence is not a fault.
     Everything else empty across the board is a mapping problem. */
  S.OPTIONAL = ["photos","annualKwh","feederId","assessedValue","subtype",
                "yearBuilt","lotAcres","owner","lastSale","broker","listed"];

  function _present(v) {
    if (v == null || v === "") return false;
    if (typeof v === "number") return isFinite(v);
    if (Object.prototype.toString.call(v) === "[object Array]") return v.length > 0;
    if (typeof v === "object") {
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        if (_present(v[k])) return true;
      }
      return false;
    }
    return true;
  }

  S.audit = function (rows, opts) {
    opts = opts || {};
    rows = rows || [];
    var n = rows.length, i, f, v;
    var fields = S.NORMALIZED.concat(["broker","listed"]);
    var cov = {}, faults = [], notes = [];

    for (i = 0; i < fields.length; i++) cov[fields[i]] = 0;
    var kwhSrc = {}, srcMix = {};

    for (i = 0; i < n; i++) {
      var r = rows[i] || {};
      for (f = 0; f < fields.length; f++) {
        if (_present(r[fields[f]])) cov[fields[f]]++;
      }
      /* A modelled figure is fine. A modelled figure nobody labels is not. */
      if (r.annualKwh && _present(r.annualKwh.value)) {
        var ks = r.annualKwh.src || "unlabelled";
        kwhSrc[ks] = (kwhSrc[ks] || 0) + 1;
      }
      var sk = r.src || "unstamped";
      srcMix[sk] = (srcMix[sk] || 0) + 1;
    }

    /* A required field empty on every single record is a mapping fault, not
       an absent value — a real dataset does not lose one column entirely. */
    for (f = 0; f < fields.length; f++) {
      var key = fields[f];
      if (S.OPTIONAL.indexOf(key) >= 0) continue;
      /* src has its own, more precise fault below — saying it twice makes a
         reader wonder whether they are two different problems. */
      if (key === "src") continue;
      if (n > 0 && cov[key] === 0) {
        faults.push(key + " is empty on "
                  + (n === 1 ? "the only record" : "all " + n + " records")
                  + " — the field name is almost certainly mapped wrong, not "
                  + "missing from the source.");
      }
    }
    if (srcMix.unstamped) {
      faults.push(srcMix.unstamped + " record" + (srcMix.unstamped === 1 ? " carries" : "s carry")
                + " no src — nothing downstream can say where they came from.");
    }
    if (kwhSrc.unlabelled) {
      faults.push(kwhSrc.unlabelled + " energy figure" + (kwhSrc.unlabelled === 1 ? " carries" : "s carry")
                + " no provenance. A modelled number presented as measured is the "
                + "failure this file exists to prevent.");
    }
    if (kwhSrc.modelled || kwhSrc.proxy) {
      notes.push("Energy: " + (kwhSrc.metered || 0) + " metered, "
               + (kwhSrc.modelled || 0) + " modelled, " + (kwhSrc.proxy || 0) + " proxy. "
               + "Modelled figures are CBECS-order screening values, not a meter read.");
    }

    return { records: n, coverage: cov, optional: S.OPTIONAL.slice(),
             energySrc: kwhSrc, srcMix: srcMix, faults: faults, notes: notes,
             at: new Date().toISOString() };
  };

  /* One block of plain text, for a data room or an email to a partner's
     integration team. Deliberately not a chart: the useful artefact is the
     sentence "of 4,812 sites, 4,790 carry a building size from the listing". */
  S.auditText = function (rep) {
    if (!rep) return "";
    var out = [], k, pct, i;
    out.push("Records: " + rep.records);
    out.push("");
    out.push("Field coverage");
    for (k in rep.coverage) {
      if (!Object.prototype.hasOwnProperty.call(rep.coverage, k)) continue;
      pct = rep.records ? Math.round((rep.coverage[k] / rep.records) * 100) : 0;
      out.push("  " + (k + "                ").slice(0, 16)
             + (rep.coverage[k] + " / " + rep.records + "  " + pct + "%")
             + (rep.optional.indexOf(k) >= 0 ? "   (optional)" : ""));
    }
    if (rep.faults.length) {
      out.push("");
      out.push("Faults");
      for (i = 0; i < rep.faults.length; i++) out.push("  - " + rep.faults[i]);
    }
    if (rep.notes.length) {
      out.push("");
      for (i = 0; i < rep.notes.length; i++) out.push(rep.notes[i]);
    }
    out.push("");
    out.push("Audited " + rep.at);
    return out.join("\n");
  };

  function req(url, cb) {
    var x = new XMLHttpRequest();
    try { x.open("GET", url, true); } catch (e) { cb(e); return; }
    x.timeout = 25000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status < 200 || x.status >= 300) { cb(new Error("HTTP " + x.status)); return; }
      try { cb(null, JSON.parse(x.responseText)); } catch (e) { cb(e); }
    };
    x.ontimeout = function () { cb(new Error("Timed out")); };
    x.onerror = function () { cb(new Error("Network error")); };
    x.send();
  }

  root.OmegaListings = S;
})(typeof window !== "undefined" ? window : this);
