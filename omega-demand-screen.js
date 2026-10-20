/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The facility demand screen's savings formula. The editor paints it;
   it does not keep a second copy.

   A month of demand charge is shaved kW times the demand rate. Twelve
   months of that is the case where the new peak becomes the ratchet
   floor, so every month's billed demand falls with it. Adding
   (ratchet − 0.5) times that figure on top counted the ratchet twice
   and in the wrong direction: ComEd's 0.70 ratchet inflated the saving
   by 20 percent. The ratchet is recorded so the screen can say what it
   assumed. It is not a second credit. */
(function (root) {
  'use strict';

  function num(v) {
    var n = +v;
    return isFinite(n) ? n : null;
  }

  /* annualBill, demandRate, energyRate, demandBillPct (0–1). The peak is
     the demand portion of the bill divided by the demand rate. */
  function basis(opts) {
    opts = opts || {};
    var bill = num(opts.annualBill), rate = num(opts.demandRate), energy = num(opts.energyRate);
    var share = num(opts.demandBillPct);
    if (bill == null || bill <= 0 || rate == null || rate <= 0 || share == null || share < 0 || share > 1) return null;
    var annualDemand = bill * share;
    var annualEnergy = (energy != null && energy > 0) ? Math.round((bill * (1 - share)) / energy) : null;
    return {
      annualDemandCharges: annualDemand,
      peakKw: Math.round((annualDemand / 12) / rate),
      annualEnergyKwh: annualEnergy,
      avgLoadKw: annualEnergy != null ? Math.round(annualEnergy / 8760) : null
    };
  }

  /* peakKw, shavePct, demandRate ($/kW-month), peakHours, ratchet (0–1). */
  function savings(opts) {
    opts = opts || {};
    var peak = num(opts.peakKw), rate = num(opts.demandRate), pct = num(opts.shavePct);
    var hrs = num(opts.peakHours), ratchet = num(opts.ratchet);
    if (peak == null || peak < 0 || rate == null || rate < 0 || pct == null || pct < 0) return null;
    var shaveKW = Math.round(peak * pct);
    var annual = Math.round(shaveKW * rate * 12);
    return {
      shavePct: pct,
      shaveKW: shaveKW,
      battKW: shaveKW,
      battKWh: Math.round(shaveKW * (hrs != null && hrs > 0 ? hrs : 0)),
      annualSavingsDemand: annual,
      ratchetSavings: 0,
      totalAnnualSavings: annual,
      newPeak: peak - shaveKW,
      ratchet: ratchet
    };
  }

  var api = { basis: basis, savings: savings };
  root.OmegaDemandScreen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
