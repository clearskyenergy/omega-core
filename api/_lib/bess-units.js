/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* ====================================================================== *
 *  UNITS
 *  ------------------------------------------------------------------    *
 *  A 300 kW grocery store and a 40 MW data-centre campus are the same
 *  arithmetic at a thousand times the scale. Forcing both into kW makes
 *  the large one unreadable; forcing both into MW makes the small one a
 *  string of leading zeros. So the INPUT and the DISPLAY carry a unit and
 *  the ENGINE does not.
 *
 *  The rule this file exists to enforce: normalise once, at the boundary,
 *  into kW and kWh, and never convert again. Every scaling bug in a tool
 *  like this comes from converting twice or converting in the middle, and
 *  a factor of 1000 in a battery size looks entirely plausible on screen -
 *  a 1.2 MW answer and a 1,200 kW answer are the same number, so nothing
 *  looks wrong until somebody orders it.
 *
 *  Energy and power are scaled TOGETHER or not at all. A caller that says
 *  "MW" means MW and MWh; letting them differ is how a 4-hour battery
 *  becomes a 4,000-hour one.
 * ====================================================================== */

var POWER = {
  kw: { key: 'kw', label: 'kW', energyLabel: 'kWh', toKw: 1 },
  mw: { key: 'mw', label: 'MW', energyLabel: 'MWh', toKw: 1000 }
};

/* Accepts 'kw', 'kW', 'MW', 'mwh', 'kWh' - the caller should not have to
   remember whether this field was named for power or for energy. */
function resolve(unit, fallback) {
  var u = String(unit == null ? '' : unit).trim().toLowerCase().replace(/h$/, '');
  if (POWER[u]) return POWER[u];
  return POWER[String(fallback || 'kw').toLowerCase()] || POWER.kw;
}

function factor(unit) { return resolve(unit).toKw; }

/* Value -> kW/kWh. */
function toKw(value, unit) {
  var n = Number(value);
  return isFinite(n) ? n * factor(unit) : NaN;
}
/* kW/kWh -> value in the caller's unit. */
function fromKw(valueKw, unit) {
  var n = Number(valueKw);
  return isFinite(n) ? n / factor(unit) : NaN;
}

/* The unit a number of this magnitude reads best in. Used only to pick a
   DEFAULT for a new session; it never overrides a unit the user chose,
   because a page that silently reunits itself mid-edit is worse than one
   that reads awkwardly. */
function suggest(kw) {
  var n = Number(kw);
  if (!isFinite(n) || n <= 0) return POWER.kw;
  return n >= 10000 ? POWER.mw : POWER.kw;
}

/* Format for display, with the unit that suits the magnitude and enough
   decimals to stay honest: 0.85 MW must not print as "1 MW". */
function format(valueKw, unit, opts) {
  opts = opts || {};
  var u = unit ? resolve(unit) : suggest(valueKw);
  var v = fromKw(valueKw, u.key);
  if (!isFinite(v)) return '--';
  var dp = opts.decimals;
  if (dp == null) dp = u.key === 'mw' ? (Math.abs(v) < 10 ? 3 : 2) : 0;
  var s = Math.abs(v).toFixed(dp);
  var parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (v < 0 ? '-' : '') + parts.join('.') +
         (opts.suffix === false ? '' : ' ' + (opts.energy ? u.energyLabel : u.label));
}

/* Normalise a request that may state its numbers in MW. Returns a SHALLOW
   copy with the named fields converted to kW/kWh and the unit recorded, so
   the answer can be echoed back in the unit the caller asked in.
   Fields not present are left absent rather than defaulted to zero: a
   missing charging power and a charging power of zero mean different
   things to the design engine. */
function normalize(payload, fields, unit) {
  var u = resolve(unit, 'kw'), f = u.toKw, out = {}, k;
  for (k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) out[k] = payload[k];
  if (f !== 1) {
    for (var i = 0; i < fields.length; i++) {
      var key = fields[i];
      if (out[key] == null || out[key] === '') continue;
      var n = Number(out[key]);
      if (!isFinite(n)) continue;
      out[key] = n * f;
    }
  }
  out._unit = u.key;
  return out;
}

module.exports = {
  POWER: POWER,
  resolve: resolve,
  factor: factor,
  toKw: toKw,
  fromKw: fromKw,
  suggest: suggest,
  format: format,
  normalize: normalize
};
