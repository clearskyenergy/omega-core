/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var auth = require('./_lib/verify-token');
var engine = require('./_lib/bess-design-engine');
var UNITS = require('./_lib/bess-units');

/* The design engine speaks MW because the workbook it was ported from
   does. A 300 kW store is 0.3 in that vocabulary, which is awkward to type
   and easy to mistype by a factor of ten.
   So each MW field has a kW ALIAS. The unit is in the field NAME rather
   than in a separate flag, because a flag that changes what `loadMw` means
   is a trap: the field would still be called Mw while holding kW, and the
   next person to read the payload would have no way to tell.
   Sending both forms of the same quantity is refused rather than resolved
   by precedence - there is no reading of that request that is safely a
   guess. */
var KW_ALIASES = {
  loadKw:          'loadMw',
  unitKwh:         'unitMwh',
  pcsUnitKw:       'pcsUnitMw',
  chargeGridKw:    'chargeGridMw',
  chargeOtherKw:   'chargeOtherMw'
};

/* Every number the design engine reads, with the range it has to sit in.
   A value outside the range is refused rather than clamped: a power factor
   of 8.5 is a typo for 0.85, and silently correcting it hands back a
   schedule the user believes was computed from what they typed. */
var NUMERIC = {
  loadMw:              [0.001, 10000],
  durationH:           [0.1,   48],
  dodPct:              [1,     100],
  rtePct:              [1,     100],
  otherEffPct:         [1,     100],
  cRate:               [0.01,  10],
  unitMwh:             [0.001, 1000],
  pcsUnitMw:           [0.001, 100],
  chargeGridMw:        [0,     10000],
  chargeOtherMw:       [0,     10000],
  chargeWindowH:       [0.1,   24],
  pcsOutputKv:         [0.1,   765],
  systemKv:            [0.1,   765],
  powerFactor:         [0.1,   1],
  transformerBuffer:   [1,     3],
  breakerBuffer:       [1,     3],
  impedancePct:        [0.5,   30],
  cableCa:             [0.1,   1.5],
  cableCg:             [0.1,   1.5],
  cableCi:             [0.1,   1.5],
  cableLengthM:        [1,     20000],
  secondaryCableLengthM:[1,    20000],
  cableVdLimitPct:     [0.1,   20],
  maxCableRuns:        [1,     64],
  busductLengthM:      [1,     5000],
  busductRmOhmPerM:    [0.0001, 100],
  busductXmOhmPerM:    [0.0001, 100],
  faultDurationS:      [0.1,   10],
  transformerXr:       [0.5,   100],
  gridXr:              [0.5,   100],
  gridFaultMva:        [0,     100000],
  inverterFaultMultiple:[0,    5],
  breakingCapacityMargin:[1,   3],
  ctBuffer:            [1,     3],
  ctSecondaryA:        [0.5,   10],
  ctBurdenVa:          [0.1,   100],
  ctLeadLengthM:       [0.1,   2000],
  ctLeadMm2:           [0.5,   500],
  ctLeadTempC:         [-40,   200],
  ctRct:               [0.01,  100],
  ctRl:                [0.001, 100],
  ctRr:                [0.001, 100],
  ctAlf:               [1,     100],
  cyclesPerDay:        [0.1,   10],
  cycleLife:           [100,   30000],
  cycleDaysPerYear:    [1,     366],
  minimumBatteryLifeYears:[1,  40],
  capex:               [0,     5000000000],
  replacementCapex:    [0,     5000000000],
  costPerKwh:          [0,     10000],
  costPerKw:           [0,     10000],
  opexPctOfCapex:      [0,     25],
  discountRate:        [0,     50],
  escalation:          [-10,   25],
  minSohPct:           [1,     100],
  sohFadePctPerYear:   [0,     20],
  auxPct:              [0,     25],
  demandRatePerKw:     [0,     1000],
  onPeakRate:          [0,     10],
  offPeakRate:         [0,     10],
  fuelAdjRate:         [-1,    10],
  utilityTaxPct:       [0,     50],
  peakDaysPerMonth:    [1,     31],
  demandWindowH:       [0.1,   24],
  analysisYears:       [1,     40]
};

var SOLAR_NUMERIC = {
  vdcMaxV:       [50,   2000],
  vocV:          [1,    200],
  vmpV:          [1,    200],
  tMinC:         [-60,  60],
  tMaxC:         [-20,  100],
  kvVocPctPerC:  [-2,   2],
  kvVmpPctPerC:  [-2,   2],
  mpptMinV:      [10,   2000],
  mpptMaxV:      [10,   2000]
};

var ENUMS = {
  phase:               ['Three-Phase', 'Single-Phase'],
  transformerCategory: ['Dry Type', 'Oil-Immersed'],
  vectorGroup:         ['Dyn11', 'Dyn1', 'Yyn0', 'Yzn11', 'Dd0', 'Yy0', 'Dyn5'],
  pcsHasNeutral:       ['Yes', 'No'],
  connectionType:      ['3P4W+E', '3P3W+E (No Neutral)'],
  gridStability:       ['Stable', 'Unstable', 'Off-Grid'],
  blackStart:          ['Not Required', 'Required'],
  cooling:             ['Liquid Cooling System', 'Air Cooling System'],
  ambient:             ['Inland', 'Coastal'],
  faultMethod:         ['rx', 'quick'],
  busArrangement:      ['common', 'separate'],
  ctAccuracyClass:     ['0.2S', '0.5S', '1'],
  application:         ['Peak Shaving', 'Time of Use (TOU) Arbitrage', 'Backup / Resilience',
                        'Renewable Firming', 'Microgrid / Off-Grid']
};

function checkNumbers(obj, spec, where) {
  for (var k in spec) {
    if (!Object.prototype.hasOwnProperty.call(spec, k)) continue;
    var v = obj[k];
    if (v == null || v === '') continue;
    var n = Number(v);
    if (!isFinite(n) || n < spec[k][0] || n > spec[k][1]) {
      throw auth.httpError(400, where + k + ' must be a number between ' +
                                spec[k][0] + ' and ' + spec[k][1] + '.');
    }
    obj[k] = n;
  }
}

function checkEnums(obj) {
  for (var k in ENUMS) {
    if (!Object.prototype.hasOwnProperty.call(ENUMS, k)) continue;
    var v = obj[k];
    if (v == null || v === '') continue;
    if (ENUMS[k].indexOf(String(v)) < 0) {
      throw auth.httpError(400, k + ' must be one of: ' + ENUMS[k].join(', ') + '.');
    }
  }
}

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  return auth.authenticateWithTier(req).then(function (ctx) { return require('./_lib/package-access').withToken(req, ctx, "storage"); }).then(function (a) {
    /* Same gate as /api/bess-size. The engineering schedule is the more
       valuable half of the tool, so it does not get a looser one. */
    var addons = a.billing.addons || [];
    var overrides = a.billing.toolOverrides || {};
    var paidTiers = ['standard', 'deluxe', 'enterprise', 'partner', 'internal'];
    if (!a.caller.staff && !a.packageAccess &&
        (overrides.batterysizer === false ||
         (paidTiers.indexOf(a.tier) < 0 && overrides.batterysizer !== true &&
          addons.indexOf('engineering') < 0))) {
      throw auth.httpError(403, 'The Battery Sizer is not included in the ' + a.tier +
        ' plan. It is available on Standard and above, or with the Engineering add-on.');
    }

    var b = req.body || {};
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      throw auth.httpError(400, 'Design inputs must be an object.');
    }

    /* Fold the kW aliases into the MW fields before anything validates
       ranges, so a kW caller is range-checked against the same bounds. */
    for (var alias in KW_ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(KW_ALIASES, alias)) continue;
      if (b[alias] == null || b[alias] === '') continue;
      var target = KW_ALIASES[alias];
      if (b[target] != null && b[target] !== '') {
        throw auth.httpError(400, 'Send ' + alias + ' or ' + target +
          ', not both - they are the same quantity in different units.');
      }
      var kw = Number(b[alias]);
      if (!isFinite(kw) || kw < 0) {
        throw auth.httpError(400, alias + ' must be a finite nonnegative number.');
      }
      b[target] = kw / 1000;
      delete b[alias];
    }

    checkNumbers(b, NUMERIC, '');
    checkEnums(b);

    if (b.solar && typeof b.solar === 'object' && !Array.isArray(b.solar)) {
      checkNumbers(b.solar, SOLAR_NUMERIC, 'solar.');
    } else if (b.solar != null) {
      delete b.solar;
    }

    /* Two cross-field rules the per-field ranges cannot see. */
    if (Number(b.pcsOutputKv) > 0 && Number(b.systemKv) > 0) {
      var ratio = Number(b.systemKv) / Number(b.pcsOutputKv);
      if (ratio > 500 || ratio < 1 / 500) {
        throw auth.httpError(400, 'The converter and system voltages differ by more than ' +
                                  'a 500:1 turns ratio; check which one is in kV.');
      }
    }
    if (b.minSohPct != null && b.sohFadePctPerYear != null &&
        Number(b.sohFadePctPerYear) === 0 && Number(b.minSohPct) > 100) {
      throw auth.httpError(400, 'Minimum state of health cannot exceed 100%.');
    }

    var out = engine.design(b);
    /* Echo the unit the answer reads best in, so a page that did not state
       one has a sensible default instead of printing 0.3 MW to a customer
       who thinks in kW. Purely presentational: every figure in the payload
       stays in the unit its field name says. */
    var suggested = UNITS.suggest(out.capacity.loadMw * 1000);
    out.units = { suggested: suggested.key, power: suggested.label,
                  energy: suggested.energyLabel };
    return res.status(200).json(out);
  }).catch(function (e) {
    res.status(e.status || 500).json({
      error: e.status ? e.message : 'Design run failed; check the inputs and retry.'
    });
  });
};
