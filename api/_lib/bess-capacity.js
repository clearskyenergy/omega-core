/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* ====================================================================== *
 *  BESS CAPACITY CHAIN — the one place that converts between the energy
 *  a site needs and the battery that has to be bought.
 *  ------------------------------------------------------------------    *
 *  Three surfaces used to answer this differently, which is how the same
 *  site came back as 3 containers on one screen and 6 on another. This
 *  module is the single source of truth; nothing else may do the
 *  conversion itself.
 *
 *  Ported from Electrical Engineering Design Calculator R3.0i, sheet
 *  "BESS Sizing", cells I5:I8 and E4:E7.
 *
 *  THE CHAIN, and why each step is a DIVISION rather than a multiplication:
 *  each loss applies to the output of the step before it, so they compound.
 *
 *      E_usable     kWh the site actually needs delivered at the meter
 *    / DoD          cells may not be run flat; 90% is a typical warranty
 *    / sqrt(RTE)    the DISCHARGE half of the round trip. Round-trip
 *                   efficiency is the product of both legs, so one leg is
 *                   its square root. Omitting this is the most common
 *                   error in the field and it under-sizes the pack by
 *                   about 6.6% at 88% RTE - small enough to look like
 *                   rounding, large enough to under-price a project.
 *    / other        transformer, auxiliaries, cable; 100% if the RTE
 *                   figure was already measured at the point of connection
 *
 *  Then the C-RATE FLOOR, which is not part of the chain but overrides it.
 *  A 0.5C battery cannot deliver 1 MW out of less than 2 MWh no matter how
 *  little energy the duty needs. When that binds, the battery is bought for
 *  POWER and the extra energy sits unused every cycle - the caller is told
 *  which of the two governed so it can say so rather than presenting a
 *  number with no explanation.
 *
 *  UNITS. Everything internal is MWh, because the workbook is MWh and its
 *  ROUNDUP(.,4) steps are reproduced exactly; kWh callers use the kWh
 *  wrapper rather than converting at the call site.
 * ====================================================================== */

/* Excel ROUNDUP: away from zero at N decimals. The epsilon stops a binary
   float 4.60880000000004 from rounding to 4.6089 and buying a container
   nobody needs. */
function roundUp(v, dp) {
  var f = Math.pow(10, dp || 0), x = v * f;
  return (v < 0 ? Math.floor(x + 1e-9) : Math.ceil(x - 1e-9)) / f;
}
function round(v, dp) {
  var f = Math.pow(10, dp || 0);
  return Math.round(v * f) / f;
}
function num(v, d) {
  var n = Number(v);
  return (v == null || v === '' || !isFinite(n)) ? d : n;
}
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* ---------------------------------------------------------------------- *
 *  chain(usableMwh, powerMw, opts)
 *
 *  usableMwh  energy delivered at the meter in one discharge
 *  powerMw    the discharge power that energy has to come out at; drives
 *             the C-rate floor. Pass 0 to skip the floor entirely.
 *  opts       dodPct, rtePct, otherEffPct, cRate, unitMwh
 *
 *  Returns every intermediate, because "why is the battery bigger than
 *  the number I calculated" is the question this module exists to answer.
 * ---------------------------------------------------------------------- */
function chain(usableMwh, powerMw, opts) {
  opts = opts || {};
  var dodPct   = clamp(num(opts.dodPct, 90), 1, 100);
  var rtePct   = clamp(num(opts.rtePct, 88), 1, 100);
  var otherPct = clamp(num(opts.otherEffPct, 100), 1, 100);
  var cRate    = num(opts.cRate, 0.5);
  var unitMwh  = num(opts.unitMwh, 0);

  usableMwh = Math.max(0, num(usableMwh, 0));
  powerMw   = Math.max(0, num(powerMw, 0));

  var afterDod   = roundUp(usableMwh / (dodPct / 100), 4);
  var afterRte   = roundUp(afterDod / Math.sqrt(rtePct / 100), 4);
  var afterOther = roundUp(afterRte / (otherPct / 100), 4);

  /* The floor, in MWh. cRate <= 0 is read as "no stated limit", not as a
     battery that cannot discharge - the caller that means the latter
     passes powerMw 0. */
  var cRateFloorMwh = (cRate > 0 && powerMw > 0) ? powerMw / cRate : 0;
  var cRateBound    = cRateFloorMwh > afterOther;
  var requiredMwh   = cRateBound ? cRateFloorMwh : afterOther;

  var out = {
    usableMwh: usableMwh,
    powerMw: powerMw,
    dodPct: dodPct, rtePct: rtePct, otherEffPct: otherPct, cRate: cRate,
    afterDodMwh: afterDod,
    afterRteMwh: afterRte,
    afterOtherMwh: afterOther,
    cRateFloorMwh: round(cRateFloorMwh, 4),
    cRateBound: cRateBound,
    /* The pack that has to be bought, before it is rounded to whole units. */
    nameplateMwh: round(requiredMwh, 4),
    requiredMwh: round(requiredMwh, 4),
    binding: cRateBound ? 'c-rate' : 'energy',
    /* The C the design actually runs at once the pack is this size. Below
       the stated limit by construction; reported so a spec sheet can carry
       it without the reader recomputing. */
    effectiveCRate: requiredMwh > 0 ? round(powerMw / requiredMwh, 4) : 0
  };

  if (unitMwh > 0) {
    out.unitMwh = unitMwh;
    out.units = Math.ceil(requiredMwh / unitMwh - 1e-9);
    out.installedMwh = round(out.units * unitMwh, 4);
    out.spareMwh = round(out.installedMwh - requiredMwh, 4);
  }
  return out;
}

/* kWh face for the sizing engines, which work in kW and kWh throughout.
   Same maths, same rounding; only the units at the boundary differ. */
function chainKwh(usableKwh, powerKw, opts) {
  var r = chain(num(usableKwh, 0) / 1000, num(powerKw, 0) / 1000, opts);
  r.usableKwh = round(r.usableMwh * 1000, 3);
  r.powerKw = round(r.powerMw * 1000, 3);
  r.nameplateKwh = round(r.nameplateMwh * 1000, 3);
  r.cRateFloorKwh = round(r.cRateFloorMwh * 1000, 3);
  if (r.installedMwh != null) {
    r.installedKwh = round(r.installedMwh * 1000, 3);
    r.spareKwh = round(r.spareMwh * 1000, 3);
  }
  return r;
}

/* The inverse: what a pack of this nameplate can actually deliver to the
   meter in one discharge. The lifecycle table needs this to work out how
   much demand a FADED pack can still cut, so it has to be the exact
   inverse of the chain above or the two disagree as the pack ages. */
function usableFromNameplateMwh(nameplateMwh, opts) {
  opts = opts || {};
  var dodPct   = clamp(num(opts.dodPct, 90), 1, 100);
  var rtePct   = clamp(num(opts.rtePct, 88), 1, 100);
  var otherPct = clamp(num(opts.otherEffPct, 100), 1, 100);
  var soh      = clamp(num(opts.sohFraction, 1), 0, 1);
  return Math.max(0, num(nameplateMwh, 0)) * soh *
         (dodPct / 100) * Math.sqrt(rtePct / 100) * (otherPct / 100);
}
function usableFromNameplateKwh(nameplateKwh, opts) {
  return usableFromNameplateMwh(num(nameplateKwh, 0) / 1000, opts) * 1000;
}

/* Grid energy consumed to put one discharge back. Both legs of the round
   trip, which is why it is 1/RTE and not 1/sqrt(RTE): the pack has to be
   refilled to the level it discharged from. */
function rechargeKwh(usableKwh, rtePct) {
  var rte = clamp(num(rtePct, 88), 1, 100) / 100;
  return Math.max(0, num(usableKwh, 0)) / rte;
}
function lossKwh(usableKwh, rtePct) {
  return rechargeKwh(usableKwh, rtePct) - Math.max(0, num(usableKwh, 0));
}

module.exports = {
  chain: chain,
  chainKwh: chainKwh,
  usableFromNameplateMwh: usableFromNameplateMwh,
  usableFromNameplateKwh: usableFromNameplateKwh,
  rechargeKwh: rechargeKwh,
  lossKwh: lossKwh,
  roundUp: roundUp
};
