/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/screen.js — the screening disposition, kept apart from
   the sizing status and from the data confidence
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Reads the site, its quality assessment and its sizing result and
   answers ONE thing: does this site pass preliminary platform screening.

     Pass                   sized in detail, electrical limits known, fits
     Conditional            sized, but a limit is unknown, a cap applied, or
                            the size is preliminary / a screening range
     Needs Information      cannot be sized yet
     Hold — Grid Constraint the supplied hosting capacity or interconnection
                            limit is well below what the load calls for
     Not Viable             a hard constraint rules the site out

   "Pass" means the platform's preliminary screen. It is not utility
   approval, a permit, final engineering or interconnection approval, and
   the reasons say so. Nearby-substation or hosting-capacity figures the
   customer supplied are screening inputs, never proof of feeder capacity.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var Q = require('./quality');

var DISPOSITIONS = { pass: 'Pass', conditional: 'Conditional', info: 'Needs Information', hold: 'Hold — Grid Constraint', no: 'Not Viable' };

function screen(site, quality, sizing, opts) {
  opts = opts || {}; var reasons = [], factors = {}, f = site.fields || {};
  factors.address = { ok: Q.has(site, 'address') && Q.has(site, 'city') && Q.has(site, 'state'), note: Q.has(site, 'lat') && Q.has(site, 'lng') ? 'coordinates supplied' : 'address supplied; parcel not verified' };
  factors.utility = { ok: Q.has(site, 'utility'), note: Q.has(site, 'utility') ? Q.val(site, 'utility') : 'utility not stated' };
  factors.tariff = { ok: quality.tariffSupplied, note: quality.tariffSupplied ? 'demand charge and energy rate supplied' : (Q.has(site, 'tariff') ? 'tariff named, rates not supplied' : 'tariff unknown — engine defaults assumed') };
  factors.load = { ok: ['detailed', 'preliminary'].indexOf(quality.level) >= 0, note: quality.loadKind ? quality.loadKind + ' · completeness ' + quality.completeness : 'no load data' };
  factors.electrical = { ok: quality.electricalKnown, note: quality.electricalKnown ? (sizing && sizing.constraints && sizing.constraints.limits.map(function (l) { return l.label; }).join('; ')) : 'service, transformer and interconnection limits unknown' };
  factors.fit = sizing && sizing.fit ? { ok: sizing.fit.fits, note: sizing.fit.neededSqft + ' sq ft needed of ' + sizing.fit.availableSqft + ' available' } : { ok: null, note: Q.has(site, 'areaSqft') ? 'no catalog footprint to check' : 'installation area not supplied' };
  factors.grid = { ok: null, note: Q.has(site, 'hostingCapacityKw') ? 'customer-supplied hosting capacity ' + Q.val(site, 'hostingCapacityKw') + ' kW (screening input, not utility confirmation)' : 'no hosting-capacity or feeder information; utility screening required' };
  factors.interconnection = { ok: Q.has(site, 'interconnectionLimitKw') || Q.has(site, 'exportLimitKw') ? true : null, note: Q.has(site, 'interconnectionLimitKw') ? 'limit ' + Q.val(site, 'interconnectionLimitKw') + ' kW' : (Q.has(site, 'exportLimitKw') ? 'export limit ' + Q.val(site, 'exportLimitKw') + ' kW' : 'not supplied') };
  factors.siteEvidence = { ok: null, note: 'flood, zoning, permitting and setback evidence not evaluated (none supplied)' };
  factors.dataConfidence = { score: sizing && sizing.confidence ? sizing.confidence.score : 0, completeness: quality.completeness };

  var d;
  if (Q.has(site, 'interconnectionLimitKw') && Q.val(site, 'interconnectionLimitKw') <= 0) { d = 'no'; reasons.push('Interconnection limit is zero: no battery can be connected as supplied'); }
  else if (sizing && sizing.fit && sizing.fit.fits === false && sizing.config && sizing.config.qty === 1 && sizing.fit.availableSqft < sizing.fit.neededSqft * 0.5) { d = 'no'; reasons.push('The smallest catalog unit does not fit the available installation area (' + sizing.fit.availableSqft + ' sq ft)'); }
  else if (!sizing || sizing.status === 'unable') { d = 'info'; reasons.push('Cannot be sized yet: ' + (quality.missing.length ? quality.missing.map(function (m) { return m.label; }).slice(0, 3).join('; ') : (sizing && sizing.reason) || 'load data missing')); }
  else {
    var need = sizing.constraints && sizing.constraints.uncappedKw ? sizing.constraints.uncappedKw : sizing.kw;
    if (Q.has(site, 'hostingCapacityKw') && Q.val(site, 'hostingCapacityKw') < need * 0.5) { d = 'hold'; reasons.push('Supplied hosting capacity (' + Q.val(site, 'hostingCapacityKw') + ' kW) is under half of the ' + need + ' kW the load calls for; utility confirmation needed before advancing'); }
    else if (Q.has(site, 'interconnectionLimitKw') && Q.val(site, 'interconnectionLimitKw') < need * 0.25) { d = 'hold'; reasons.push('Interconnection limit (' + Q.val(site, 'interconnectionLimitKw') + ' kW) is under a quarter of the ' + need + ' kW the load calls for'); }
    else if (sizing.status === 'detailed' && quality.electricalKnown && (sizing.fit ? sizing.fit.fits : Q.has(site, 'areaSqft') === false ? false : true) && sizing.fit && sizing.fit.fits) { d = 'pass'; reasons.push('Passed preliminary platform screening: detailed size, electrical limits known, equipment fits the stated area'); }
    else {
      d = 'conditional';
      if (sizing.status !== 'detailed') reasons.push(sizing.statusLabel + ' — ' + (sizing.status === 'screening' ? 'a range, not a size' : 'assumptions apply'));
      if (!quality.electricalKnown) reasons.push('Electrical limits unknown — size is subject to service and utility verification');
      if (sizing.constraints && sizing.constraints.cappedBy.length) reasons.push('Power capped by ' + sizing.constraints.cappedBy.join(', '));
      if (!sizing.fit) reasons.push(Q.has(site, 'areaSqft') ? 'Equipment fit not checked (no footprint on the catalog product)' : 'Installation area not supplied; fit unchecked');
      else if (!sizing.fit.fits) reasons.push('Recommended configuration needs ' + sizing.fit.neededSqft + ' sq ft; ' + sizing.fit.availableSqft + ' available');
      if (!sizing.config) reasons.push('No catalog product covers this size within ' + 6 + ' units');
    }
  }
  var blocker = d === 'pass' ? null : (reasons[0] || null);
  return { disposition: d, label: DISPOSITIONS[d], reasons: reasons, factors: factors, blocker: blocker,
    caveat: d === 'pass' ? 'Preliminary platform screening only — not utility approval, a permit, final engineering or interconnection approval.' : null };
}

/* What the customer does next, in one line. */
function nextAction(disposition, sizing, quality) {
  if (disposition === 'no') return 'Review the constraint; the site is not viable as supplied';
  if (disposition === 'hold') return 'Confirm feeder capacity with the utility before advancing';
  if (disposition === 'info') return 'Provide: ' + (quality.missing.length ? quality.missing.slice(0, 2).map(function (m) { return m.label; }).join('; ') : 'load data');
  if (sizing && sizing.status === 'screening') return 'Provide billed peaks or interval data to size the site';
  if (sizing && sizing.status === 'preliminary') return 'Advance with the preliminary size, or add interval data and tariff to firm it up';
  return 'Ready to advance: add to projects or open in Design Studio';
}

module.exports = { screen: screen, nextAction: nextAction, DISPOSITIONS: DISPOSITIONS };
