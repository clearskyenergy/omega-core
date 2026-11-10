/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   GET /api/maximus-access — does this workspace hold Omega Maximus?

   The editor at /editor-v2 asks once a person is signed in, and shows its
   lock (the price and Opt in) when the answer is no. The answer is the same
   check every Maximus door runs (package-access withModuleAnyPlan: a package
   by its modules, a legacy plan by addons.held), so the page never shows
   open what a door refuses. It grants nothing.

   200 { held:true }
       { held:false, reason, price:'$1,299/month' | null, optIn:'/workspace#module-maximus' }
   401 signed out; 403 no workspace. */
'use strict';
var A = require('./_lib/admin');
var X = require('./_lib/package-access');
var B = require('./_lib/pricebook');
var P = require('./_lib/subscription-pricing');

module.exports = A.handler(function (req, res) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  res.setHeader('Cache-Control', 'no-store');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    return X.withModuleAnyPlan(caller, 'maximus', { produce: false }).then(function () { return { held: true }; }, function (e) {
      if (!e || e.status !== 403) throw e;
      return price().then(function (p) { return { held: false, reason: e.message, price: p, optIn: '/workspace#module-maximus' }; });
    });
  });
});

/* The list price on the release book, or null when that book is not seeded. */
function price() {
  return B.load(A.db(), B.VERSION).then(function (book) {
    return B.sells(book, 'maximus') ? P.money(book.modules.maximus.priceCents) + '/month' : null;
  }, function () { return null; });
}
