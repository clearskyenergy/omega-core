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

  root.OmegaBessCatalog = C;
  if (typeof module !== "undefined" && module.exports) module.exports = C;
})(typeof window !== "undefined" ? window : this);
