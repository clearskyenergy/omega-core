/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/product-fit.js — which products to offer, and how many
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Pure ranking. No Firestore, no network, no dependencies — which is the
   point: api/embed-size.js serves it to the public, and
   scripts/preview-storefront.js needs the SAME answer without dragging in
   firebase-admin. A second implementation would drift, and the drifted one
   would be the one somebody looks at and believes.

   It answers one question: given a sized requirement and a manufacturer's
   product ladder, what should the customer be offered, and how many of each.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ── PRODUCTS ARE SOLD IN MULTIPLES ──────────────────────────────────────
   The first version asked which SINGLE unit covers the requirement. On a real
   manufacturer's ladder that is badly wrong: a 650 kW / 1,350 kWh need
   skipped every cabinet and every 500 kW container — none covers it alone —
   and recommended a 1,700 kW / 3,421 kWh container. Two and a half times the
   power the customer asked for, on the page where they decide whether to
   trust the number.

   So each product is evaluated at the QUANTITY that actually covers the
   requirement, on BOTH axes, and ranked by how little it oversupplies.

   The cap matters as much as the ranking. Without it, the smallest cabinet
   always "wins" on closeness — 7 × C215 fits a 650 kW need almost exactly and
   is an absurd thing to propose. MAX_UNITS is the line between a system and a
   warehouse; over-supply is capped too, so a product that can only be offered
   at 3× the energy needed is not offered at all rather than offered badly. */
var MAX_UNITS = 6;
var MAX_OVERSUPPLY = 2.2;

function fitProducts(products, kw, kwh) {
  var out = [];
  (products || []).forEach(function (p) {
    if (!p) return;
    var pkw = +p.kw || 0, pkwh = +p.kwh || 0;
    if (!(pkw > 0) && !(pkwh > 0)) return;

    /* Enough units to cover BOTH axes. A product that covers the energy and
       not the power is not a fit — that is a battery that cannot discharge
       fast enough, which is the failure a customer discovers in July. */
    var byKw  = pkw  > 0 ? Math.ceil(kw / pkw)   : 1;
    var byKwh = pkwh > 0 ? Math.ceil(kwh / pkwh) : 1;
    var qty = Math.max(1, byKw, byKwh);
    if (qty > MAX_UNITS) return;

    var totKw = pkw * qty, totKwh = pkwh * qty;
    /* How much more than asked for. Measured on whichever axis is worse,
       because oversupplying energy by 3× is as wrong as oversupplying power. */
    var over = Math.max(
      pkw > 0 && kw > 0 ? totKw / kw : 1,
      pkwh > 0 && kwh > 0 ? totKwh / kwh : 1
    );
    if (over > MAX_OVERSUPPLY) return;

    out.push({ p: p, qty: qty, over: over, totKw: totKw, totKwh: totKwh });
  });

  /* Closest first; a tie goes to fewer units, because two containers beat
     five cabinets at the same coverage for every reason that is not
     arithmetic. */
  out.sort(function (a, b) {
    if (Math.abs(a.over - b.over) > 0.02) return a.over - b.over;
    return a.qty - b.qty;
  });
  return out.slice(0, 4);
}

module.exports = { fitProducts: fitProducts, MAX_UNITS: MAX_UNITS, MAX_OVERSUPPLY: MAX_OVERSUPPLY };
