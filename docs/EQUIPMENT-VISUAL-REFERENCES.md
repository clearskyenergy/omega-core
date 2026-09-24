# Equipment appearance references

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Reviewed September 17, 2026. `omega-equipment-visuals.js` uses the following manufacturer enclosure dimensions (width × height × depth, inches):

| Model | Dimensions | Source |
|---|---|---|
| Square D QO24L60NRNM load center | 6.5 × 8.8 × 2.9 | [Schneider product](https://www.se.com/us/en/product/QO24L60NRNM/), [manufacturer datasheet, p. 1](https://assets.rs-online.com/v1731415434/Datasheets/6b95cffdcebb80c766802a9c01590b11.pdf) |
| Milbank U4801-O meter socket | 13 × 19 × 4.844 | [Milbank datasheet](https://www.milbankworks.com/specsheets/1001102_SS.pdf) |
| Square D DU221RB disconnect | 7.75 × 9.63 × 3.75 | [Schneider](https://shop.se.com/pro/us/en/product/safety-switch-general-duty-non-fusible-2-pole-2-wire-240vac-30a-type-3r-with-bolt-on-hub-prov/) |
| Autel MaxiCharger AC Pro | 8.5 × 14.5 × 5.1 | [Autel North America comparison on product page](https://www.autelenergy.com/global/product/ac-pro) |

These are procedural presentation models, not manufacturer CAD. Mounting struts, pedestals, elevation, cable routing, meter glass and face details are illustrative. The Milbank product is a single-position socket; it does not identify the utility-installed meter or establish how many positions an existing meter bank has. Unknown existing equipment is marked as a reference representation. A named Autel AC Pro is matched automatically; an unidentified charger is not silently assigned that brand.

The Product appearance selector persists `_visProduct` only. It does not substitute a BOM item, change electrical ratings, or certify suitability. In particular the QO reference is a 60 A main-lug load center and the DU221RB reference is a 30 A non-fusible switch; neither is a default electrical selection for an 80 A charger. Working clearance and protection pads are separate from enclosure dimensions.

Verification: `node scripts/test-site-visualizer.js`; open `scripts/site-visualizer-product-preview.html` through a local server for the four-product visual check.
