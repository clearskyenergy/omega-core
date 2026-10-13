/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/ev-price {action:'rates'|'baseline'|'ng'|'dcfc', ...}
   The EV Cost Workbook's price books (api/_lib/ev-pricebook.js): the page
   sends the job's facts — ports, footage, the drawing's counts, the
   programme form, a rep's rate overrides — and gets the rates, the
   baseline lines or the National Grid book's lines back. A signed-in
   member of a workspace, or staff. */
'use strict';
var A = require('./_lib/admin'), EV = require('./_lib/ev-pricebook');
module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    var b = req.body && typeof req.body === 'object' ? req.body : {};
    res.setHeader('Cache-Control', 'no-store');
    if (b.action === 'rates') return EV.rates(b);
    if (b.action === 'baseline') return EV.baseline(b);
    if (b.action === 'ng') return EV.ng(b.q || b);
    if (b.action === 'dcfc') return { stepped: EV.dcfcSteppedLabor(b.ft, b.kind), restoration: EV.dcfcRestorationLabor(b.ft), rebate: EV.dcfcRebate(b.makeReady, b.evseEligible, b.ineligible) };
    throw A.httpError(400, 'Unknown action');
  });
});
