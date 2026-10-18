/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var E = require('./editor-cost');
function number(v) { var n = Number(v || 0); if (!isFinite(n) || n < 0 || n > 1e9) throw new Error('Invalid component quantity'); return n; }
module.exports = function (q) {
  q = q || {};
  var kw = number(q.kw), kwh = number(q.kwh), solar = number(q.solarKw), cost = null;
  if (q.kind === 'array') cost = kw * 1000 * E.pvRate(solar || kw, q.mount === 'carport' ? 'canopy' : q.mount);
  else if (q.key === 'bess') cost = kwh * E._tables.BENCH.bessKwh + kw * E._tables.BENCH.bessKw;
  return { cost: cost, note: 'Screening benchmark. ' + E._tables.BENCH.source + '. Not a quote.' };
};
