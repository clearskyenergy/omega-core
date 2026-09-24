/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* ====================================================================== *
 *  WHAT THE SIZING ENGINE MAY BE HANDED
 *  ------------------------------------------------------------------    *
 *  battery-tool-engine.js divides by whatever it is given and swallows a
 *  tariff it cannot read, so every door into it refuses a bad request
 *  BEFORE it runs. There are two doors now - POST /api/bess-size and the
 *  pro forma's sizing bridge (proforma-sizing.js) - and one set of rules.
 *  These checks were inline in bess-size.js; they moved here unchanged,
 *  message for message and in the same order, so the bridge refuses
 *  exactly what the sizer refuses. A second copy is how two screens came
 *  to accept different requests for the same engine.
 *
 *  Each check throws `httpError(400, message)` - the caller's own error
 *  factory, so this file needs no auth module and runs in any test. The
 *  error also carries `field`: the key that failed, or `name(key)` when
 *  the caller passes a `name` function to put a key in its own
 *  vocabulary. bess-size.js passes none, and its responses never include
 *  `field`, so what it says is exactly what it said before.
 * ====================================================================== */

/* A structured tariff is the largest and least trusted thing the engine
   takes, so it is bounded before the engine ever sees it. The shape is
   OpenEI URDB's; the limits are generous against any real schedule and
   tight against a payload meant to exhaust the function. */
var TARIFF_LIMITS = { periods: 24, tiers: 12, months: 12, hours: 24 };

var DURATIONS = [1, 2, 3, 4, 6, 8];
var DT_HOURS = [1 / 12, 1 / 6, 0.25, 0.5, 1];
var INTERVAL_MINUTES = [5, 10, 15, 20, 30, 60];
var MAX_READINGS = 105408;           /* a leap year of five-minute data */

var SETTING_KEYS = ['rte', 'dod', 'cRate', 'otherEff', 'minSoh', 'replKwh', 'dRate', 'ratchet',
  'eRate', 'cKwh', 'cKw', 'itc', 'incent', 'incHair', 'om', 'term', 'disc', 'fade', 'escal',
  'headroom', 'baseFrac', 'pkHrs', 'dayUp', 'subBlock', 'subPrice', 'subMin'];
var EDITOR_TARIFF_KEYS = ['demandChargePerKw', 'energyRate', 'capexPerKwh', 'capexPerKw', 'maxC',
  'targetPaybackYr', 'ratchetPct', 'touSpread', 'dodPct', 'rtePct', 'otherEffPct', 'itcPct',
  'omPerKwYr', 'termYr', 'discountPct', 'fadePctYr', 'escalPctYr'];

function same(k) { return k; }
function fail(httpError, message, field) {
  var e = httpError(400, message);
  if (field) e.field = field;
  return e;
}

/* ---------------------------------------------------------------------- *
 *  The URDB-shaped tariff (either mode)
 * ---------------------------------------------------------------------- */
function checkTariff(t, httpError) {
  if (t == null) return null;
  if (typeof t !== 'object' || Array.isArray(t)) {
    throw fail(httpError, 'tariff must be an object in the OpenEI URDB shape.');
  }
  function rateTable(v, name) {
    if (v == null) return;
    if (!Array.isArray(v) || v.length > TARIFF_LIMITS.periods) {
      throw fail(httpError, name + ' must be an array of at most ' +
                            TARIFF_LIMITS.periods + ' periods.', name);
    }
    v.forEach(function (period, pi) {
      if (!Array.isArray(period) || period.length > TARIFF_LIMITS.tiers) {
        throw fail(httpError, name + ' period ' + pi + ' must be an array of at most ' +
                              TARIFF_LIMITS.tiers + ' tiers.', name);
      }
      period.forEach(function (tier, ti) {
        if (tier == null || typeof tier !== 'object') {
          throw fail(httpError, name + ' period ' + pi + ' tier ' + ti + ' must be an object.', name);
        }
        ['rate', 'adj', 'max'].forEach(function (k) {
          if (tier[k] == null || tier[k] === '') return;
          var n = Number(tier[k]);
          if (!isFinite(n)) throw fail(httpError, name + '[' + pi + '][' + ti + '].' + k +
                                                  ' must be a finite number.', name);
          /* A negative rate is a sell-back price, which this engine does not
             model; a rate above $1000 is a decimal in the wrong place. */
          if (k !== 'max' && (n < 0 || n > 1000)) {
            throw fail(httpError, name + '[' + pi + '][' + ti + '].' + k +
                                  ' must be between 0 and 1000.', name);
          }
          if (k === 'max' && n < 0) {
            throw fail(httpError, name + '[' + pi + '][' + ti + '].max cannot be negative.', name);
          }
        });
      });
    });
  }
  function matrix(v, name, periodCount) {
    if (v == null) return;
    if (!Array.isArray(v) || v.length !== TARIFF_LIMITS.months) {
      throw fail(httpError, name + ' must be a 12-month schedule.', name);
    }
    v.forEach(function (row, ri) {
      if (!Array.isArray(row) || row.length !== TARIFF_LIMITS.hours) {
        throw fail(httpError, name + ' month ' + ri + ' must have 24 hours.', name);
      }
      row.forEach(function (cell, ci) {
        var n = Number(cell);
        if (!isFinite(n) || n < 0 || n !== Math.floor(n)) {
          throw fail(httpError, name + '[' + ri + '][' + ci + '] must be a period index.', name);
        }
        if (periodCount > 0 && n >= periodCount) {
          throw fail(httpError, name + '[' + ri + '][' + ci + '] names period ' + n +
                                ' but only ' + periodCount + ' are defined.', name);
        }
      });
    });
  }
  rateTable(t.energyratestructure, 'energyratestructure');
  rateTable(t.demandratestructure, 'demandratestructure');
  rateTable(t.flatdemandstructure, 'flatdemandstructure');
  matrix(t.energyweekdayschedule, 'energyweekdayschedule', (t.energyratestructure || []).length);
  matrix(t.energyweekendschedule, 'energyweekendschedule', (t.energyratestructure || []).length);
  matrix(t.demandweekdayschedule, 'demandweekdayschedule', (t.demandratestructure || []).length);
  matrix(t.demandweekendschedule, 'demandweekendschedule', (t.demandratestructure || []).length);
  if (t.flatdemandmonths != null) {
    if (!Array.isArray(t.flatdemandmonths) || t.flatdemandmonths.length !== 12) {
      throw fail(httpError, 'flatdemandmonths must be 12 period indices.', 'flatdemandmonths');
    }
    var fl = (t.flatdemandstructure || []).length;
    t.flatdemandmonths.forEach(function (v, i) {
      var n = Number(v);
      if (!isFinite(n) || n < 0 || (fl > 0 && n >= fl)) {
        throw fail(httpError, 'flatdemandmonths[' + i + '] does not name a defined period.',
                   'flatdemandmonths');
      }
    });
  }
  ['fixedchargefirstmeter', 'demandratchetpercentage', 'adderPerKwh', 'taxPct'].forEach(function (k) {
    if (t[k] == null || t[k] === '') return;
    var n = Number(t[k]);
    if (!isFinite(n) || n < 0) throw fail(httpError, 'tariff.' + k + ' must be a nonnegative number.', k);
  });
  if (Number(t.demandratchetpercentage) > 100) {
    throw fail(httpError, 'demandratchetpercentage is a percentage between 0 and 100.',
               'demandratchetpercentage');
  }
  return t;
}

/* ---------------------------------------------------------------------- *
 *  tool-interval / tool-monthly: the engine's own vocabulary
 * ---------------------------------------------------------------------- */
function isDurations(d) {
  return Array.isArray(d) && d.length > 0 && d.length <= 6 &&
         !d.some(function (v) { return DURATIONS.indexOf(v) < 0; });
}

function checkToolRequest(b, httpError) {
  if (!Array.isArray(b.data) || !b.data.length || b.data.length > 24 || !isDurations(b.durations)) {
    throw fail(httpError, 'Invalid months or battery durations.');
  }
}

/* Engine settings, before the engine reads them with its own lenient
   parser - which quietly substitutes a default for anything it cannot
   read, so a typo would otherwise size a different battery. */
function checkToolSettings(cfg, httpError, name) {
  name = name || same;
  SETTING_KEYS.forEach(function (k) {
    if (cfg[k] != null && cfg[k] !== '' && (!isFinite(Number(cfg[k])) || Number(cfg[k]) < 0)) {
      throw fail(httpError, 'Invalid ' + name(k), name(k));
    }
  });
  ['rte', 'dod', 'otherEff'].forEach(function (k) {
    if (cfg[k] != null && (!(Number(cfg[k]) > 0) || Number(cfg[k]) > 100)) {
      throw fail(httpError, name(k) + ' must be greater than zero and at most 100', name(k));
    }
  });
  if (cfg.cRate != null && cfg.cRate !== '' && (!(Number(cfg.cRate) > 0) || Number(cfg.cRate) > 10)) {
    throw fail(httpError, 'C-rate must be greater than zero and at most 10.', name('cRate'));
  }
  ['ratchet', 'itc', 'incHair', 'fade'].forEach(function (k) {
    if (Number(cfg[k]) > 100) throw fail(httpError, name(k) + ' exceeds 100%', name(k));
  });
  if (cfg.minSoh != null && cfg.minSoh !== '' && (!(Number(cfg.minSoh) > 0) || Number(cfg.minSoh) > 100)) {
    throw fail(httpError, 'Minimum state of health must be between 0 and 100%.', name('minSoh'));
  }
  if (cfg.term != null && (!(Number(cfg.term) >= 1) || Number(cfg.term) > 50)) {
    throw fail(httpError, 'Analysis term must be 1 to 50 years.', name('term'));
  }
  if (cfg.subBlock != null && !(Number(cfg.subBlock) > 0)) {
    throw fail(httpError, 'Subscription block must be positive.', name('subBlock'));
  }
}

/* Per-month data for the tool modes. Interval months get their peak and
   floor recomputed from the readings: the engine's dispatch search is
   bounded by them, and a caller's own figure is not trusted to match. */
function checkToolMonths(mode, data, httpError) {
  var count = 0;
  data.forEach(function (m) {
    if (mode === 'tool-interval') {
      if (!Array.isArray(m.load) || !m.load.length || DT_HOURS.indexOf(m.dt) < 0) {
        throw fail(httpError, 'Invalid interval data.');
      }
      count += m.load.length;
      checkReadings(m.load, httpError);
      m.peak = Math.max.apply(null, m.load); m.min = Math.min.apply(null, m.load);
    } else if (!(m.peak > 0) || !isFinite(m.peak) || !(m.days > 0) || m.days > 366 ||
               !(m.kwh >= 0) || !isFinite(m.kwh) || !(m.rate >= 0) || !isFinite(m.rate)) {
      throw fail(httpError, 'Invalid monthly bill.');
    }
  });
  if (count > MAX_READINGS) throw fail(httpError, 'Too many interval readings.');
}

/* ---------------------------------------------------------------------- *
 *  interval / monthly: the site-map editor's vocabulary, which is also
 *  what bess-size-adapter.toSettings translates from
 * ---------------------------------------------------------------------- */
function checkEditorRequest(b, httpError) {
  if (['interval', 'monthly'].indexOf(b.mode) < 0 || !Array.isArray(b.data) || !b.data.length ||
      b.data.length > (b.mode === 'interval' ? MAX_READINGS : 12)) {
    throw fail(httpError, 'Invalid sizing request or too many readings.');
  }
}

function checkEditorTariff(tariff, httpError, name) {
  name = name || same;
  EDITOR_TARIFF_KEYS.forEach(function (k) {
    if (tariff[k] == null || tariff[k] === '') return;
    var v = Number(tariff[k]);
    if (!isFinite(v) || v < 0) {
      throw fail(httpError, 'Tariff value ' + name(k) + ' must be a finite nonnegative number.', name(k));
    }
  });
  if (tariff.maxC != null && tariff.maxC !== '' && (!(Number(tariff.maxC) > 0) || Number(tariff.maxC) > 10)) {
    throw fail(httpError, 'Max C-rate must be greater than zero and at most 10.', name('maxC'));
  }
  if (tariff.ratchetPct != null && Number(tariff.ratchetPct) > 1) {
    throw fail(httpError, 'Ratchet is a fraction between 0 and 1.', name('ratchetPct'));
  }
  ['dodPct', 'rtePct', 'otherEffPct', 'itcPct'].forEach(function (k) {
    if (tariff[k] != null && tariff[k] !== '' && Number(tariff[k]) > 100) {
      throw fail(httpError, name(k) + ' cannot exceed 100.', name(k));
    }
  });
}

/* A reading is a number, not a numeric string: a column that parsed as
   text on the client is a parsing bug, and coercing it here would hide it. */
function checkReadings(values, httpError, unitLabel) {
  if (values.some(function (v) { return typeof v !== 'number' || !isFinite(v) || v < 0; })) {
    throw fail(httpError, 'Load readings must be finite nonnegative ' + (unitLabel || 'kW') + '.');
  }
}

function checkIntervalMin(intervalMin, httpError) {
  var iv = Number(intervalMin);
  if (intervalMin != null && INTERVAL_MINUTES.indexOf(iv) < 0) {
    throw fail(httpError, 'Interval length must be 5, 10, 15, 20, 30 or 60 minutes.');
  }
}

function checkMonthlyRows(rows, httpError) {
  if (rows.some(function (r) {
    return !r || !(Number(r.demandKw) > 0) || !isFinite(Number(r.demandKw)) ||
           !(Number(r.kwh) >= 0) || !isFinite(Number(r.kwh));
  })) {
    throw fail(httpError, 'Each month needs a billed demand above zero and a nonnegative usage figure.');
  }
}

module.exports = {
  TARIFF_LIMITS: TARIFF_LIMITS,
  DURATIONS: DURATIONS,
  INTERVAL_MINUTES: INTERVAL_MINUTES,
  MAX_READINGS: MAX_READINGS,
  checkTariff: checkTariff,
  isDurations: isDurations,
  checkToolRequest: checkToolRequest,
  checkToolSettings: checkToolSettings,
  checkToolMonths: checkToolMonths,
  checkEditorRequest: checkEditorRequest,
  checkEditorTariff: checkEditorTariff,
  checkReadings: checkReadings,
  checkIntervalMin: checkIntervalMin,
  checkMonthlyRows: checkMonthlyRows
};
