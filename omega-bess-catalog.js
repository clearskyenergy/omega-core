/* ==========================================================================
   omega-bess-catalog.js  ·  ClearSky-OMEGA shared platform file
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   --------------------------------------------------------------------------
   WHAT THE SUPPLIERS ACTUALLY SELL.

   Model numbers and nameplate energies off published product datasheets.
   These are marketing facts a manufacturer puts on its own website, so
   unlike a quotation they ship with the platform and every tenant has them
   without configuring anything.

   THE LINE THIS FILE DOES NOT CROSS IS PRICE. A datasheet is public; a
   quotation is not, and this repository is public. There is no $/kWh
   anywhere in here and there must never be one — pricing lives on the
   organisation's own record, gated by the Firestore rules, loaded from
   their quote file. Specs here, money there.

   That distinction was conflated for a while and cost the site finder its
   product names: because the prices could not ship, the products did not
   either, and a card that had already sized a 3.3 MWh battery could only
   say "no product picked yet".

   An organisation's own product list still wins. A supplier who ships them
   something not in this file, or a revised datasheet, is entered on the
   supplier record and takes precedence over anything here.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = {};

  /* Gotion High-Tech, ESS Product Datasheet V1.0 EN, 15 February 2024.
     Nominal energy as printed. `usableKwh` only where the datasheet states
     it — most entries do not, and an assumed depth of discharge would be an
     invented number sitting in a file whose whole purpose is published
     ones. Containers are 20 ft, 6058 x 2438 x 2896 mm, IP55. */
  C.CATALOG = {
    gotion: {
      name: "Gotion",
      source: "Gotion High-Tech, ESS Product Datasheet V1.0 EN, 15 Feb 2024",
      url: "https://en.gotion.com",
      asOf: "2024-02-15",
      products: [
        { model:"ESD1280-05P5068", kwh:5068,   form:"20 ft liquid-cooled container" },
        { model:"ESD1331-05P5015", kwh:5015,   form:"20 ft liquid-cooled container" },
        { model:"ESD1280-05P4608", kwh:4608,   form:"20 ft liquid-cooled container" },
        { model:"ESD1267-05P3421", kwh:3421,   form:"20 ft liquid-cooled container" },
        { model:"ESD1126-05P2703", kwh:2703.3, usableKwh:2528, form:"20 ft air-cooled container" },
        { model:"ESD1267-05P760-G", kwh:760,   form:"air-cooled cabinet" },
        { model:"ESD768-05P220",   kwh:220,    usableKwh:200, acKw:100, form:"all-in-one cabinet" },
        { model:"ESD832-05P160",   kwh:160,    usableKwh:150, acKw:75,  form:"all-in-one cabinet" }
      ]
    }
  };

  /* The supplier a site is sized against when nobody has chosen one. It is
     a DEFAULT, not a decision: picking a supplier in the cost estimator
     overrides it everywhere, and the card says which one it used either
     way so the default is never mistaken for a selection. */
  C.DEFAULT_KEY = "gotion";

  C.products = function (key) {
    var e = C.CATALOG[key || C.DEFAULT_KEY];
    return e ? e.products.slice() : [];
  };
  C.entry = function (key) { return C.CATALOG[key || C.DEFAULT_KEY] || null; };

  /* One supplier record shaped like the ones an organisation saves, so the
     site finder can treat "nobody has configured anything" and "somebody
     configured this" through exactly one code path. No price: hasPrice()
     is false on it, and every consumer already handles that. */
  C.defaultVendor = function () {
    var e = C.entry(C.DEFAULT_KEY);
    if (!e) return null;
    return { key: C.DEFAULT_KEY, name: e.name, model: "",
             dcPerKwh: null, pcsPerKw: null,
             basis: "", ref: e.source, date: e.asOf,
             products: e.products.slice(),
             fromCatalog: true };
  };

  /* ── WHICH PRODUCT, HOW MANY ─────────────────────────────────────────
     The site finder used to rank every "N × product" by kWh closeness alone,
     which made a stack of the smallest cabinet win almost every time: a
     3 MWh need came back as four 760 kWh cabinets when a single 3.4 MWh
     container was on the same sheet. Four enclosures are four foundations,
     four sets of terminations and four things to maintain, and none of that
     appears in a kWh difference.

     The rule now: FEWEST UNITS FIRST, then closest to the need. One unit of
     the nearest product beats any stack; among stacks of equal count the
     nearest wins. A candidate is the count that just covers the need (and,
     where the product states AC kW, the count that covers the power), or
     one unit fewer when that still reaches `minFill` of the need — a single
     760 kWh cabinet for a 1,000 kWh ask is the closest product, at 3 h
     instead of 4, and the card says so. A candidate that overshoots by more
     than `maxOver` or needs more than `maxUnits` is dropped, except that the
     one smallest overshoot is kept when nothing else qualifies, because you
     cannot buy less than one unit.

     Pure. `products` is any list of {model, kwh, acKw?, form?, usableKwh?};
     the result is sorted best first. */
  C.FIT = { maxUnits: 4, minFill: 0.75, maxOver: 2.2 };
  C.fit = function (products, kw, kwh, opts) {
    opts = opts || {};
    var maxUnits = opts.maxUnits || C.FIT.maxUnits, minFill = opts.minFill != null ? opts.minFill : C.FIT.minFill,
        maxOver = opts.maxOver || C.FIT.maxOver;
    var out = [], spare = [], i, j;
    if (!(kwh > 0)) return out;
    for (i = 0; i < (products || []).length; i++) {
      var P = products[i], unit = +P.kwh, ac = +P.acKw;
      if (!isFinite(unit) || unit <= 0) continue;
      var need = Math.ceil(kwh / unit - 1e-9);
      if (isFinite(ac) && ac > 0 && kw > 0) need = Math.max(need, Math.ceil(kw / ac - 1e-9));
      var counts = [need];
      if (need > 1 && (need - 1) * unit >= kwh * minFill && !(isFinite(ac) && ac > 0 && kw > 0 && (need - 1) * ac < kw)) counts.push(need - 1);
      if (need < 1) counts = [1];
      for (j = 0; j < counts.length; j++) {
        var n = counts[j], tot = n * unit, ratio = tot / kwh;
        var o = { model: P.model || "", units: n, unitKwh: unit, kwh: tot, ratio: ratio,
                  acKw: isFinite(ac) && ac > 0 ? ac * n : null,
                  usableKwh: typeof P.usableKwh === "number" ? P.usableKwh * n : null,
                  form: P.form || "", under: ratio < 1, hours: kw > 0 ? tot / kw : null };
        if (n > maxUnits) continue;
        if (ratio > maxOver) { spare.push(o); continue; }
        out.push(o);
      }
    }
    /* Distance from the need. Covering it is preferred: a shortfall counts
       one and a half times, so a 2.7 MWh container (10% short of 3 MWh)
       ranks behind the 3.4 MWh one (14% over), but a 760 kWh cabinet still
       beats two of them for a 1,000 kWh ask. */
    function dist(o) { return o.ratio >= 1 ? o.ratio - 1 : (1 - o.ratio) * 1.5; }
    function rank(a, b) {
      if (a.units !== b.units) return a.units - b.units;
      var da = dist(a), db = dist(b);
      if (da !== db) return da - db;
      return a.kwh - b.kwh;
    }
    out.sort(rank);
    if (!out.length && spare.length) { spare.sort(rank); out.push(spare[0]); }
    return out;
  };

  root.OmegaBessCatalog = C;
  if (typeof module !== "undefined" && module.exports) module.exports = C;
})(typeof window !== "undefined" ? window : this);
