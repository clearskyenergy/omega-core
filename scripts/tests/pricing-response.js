/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Price response fixture for browser transport/rendering tests. Endpoint auth
   and tenant isolation are independently exercised by sitefinder-server.test.js. */
var M = require('../../api/_lib/cost-model');
module.exports = function(input, vendor) {
  var r = M.price(Object.assign({}, input, {rates:M.ratesFromVendor(vendor)}));
  var open = ['volt','poiFt','padArea','soil','ahj','labor','utilityUpgrade','quoteDate','hours']
    .filter(function(k){ return input[k] == null || input[k] === ''; });
  var cls = M.estimateClass({open:open.length, gaps:(input.gaps || []).length,
    voltOpen:!input.volt, upgradeOpen:!input.utilityUpgrade,
    posBad:!!(input.site && input.site.positionIsBuilding === false)}, r);
  r.estimateClass = cls.label;
  r.estimateClassWhy = cls.why;
  r.accuracy = {aace:cls.n,low:cls.lo,high:cls.hi,evidenceShare:cls.evidenceShare,
    rangeLowUsd:Math.round(r.total.base*(1+cls.lo)),rangeHighUsd:Math.round(r.total.base*(1+cls.hi))};
  return r;
};
