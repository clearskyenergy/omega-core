/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/build-sequence — the 3D Site Visualizer's Build player (Blueprint
   to Build, Phase 2; docs/BLUEPRINT-TO-BUILD.md). The page sends what Site
   Map's Run sends (omegaCostQuantities()) and what the 3D model draws (feet
   of trench dug, how many of each archetype, whether it draws conduit); this
   runs the Run's own roll-up on the quantities (api/_lib/editor-cost.js) and
   answers the steps of the build, each with its share of the Run's money,
   what it puts in place and how long it takes (api/_lib/build-sequence.js).
   The body never carries a price or a total: the money is the roll-up's.

   Who: a signed-in member of an active workspace whose plan opens the 3D
   Site Visualizer (Omega Plans in a package; Site Map on a legacy plan,
   where the visualizer is not behind a tab), or staff. It writes nothing
   and stores nothing: the sequence is derived from the drawing each time. */
'use strict';
var A = require('./_lib/admin'), EC = require('./_lib/editor-cost'), BS = require('./_lib/build-sequence'), M = require('./_lib/modules');
var CLOSED = ['pending', 'suspended', 'cancelled'];

function data(s) { return s && s.exists ? (s.data() || {}) : null; }

/* The editor's own questions before it shows the visualizer's Build button. */
async function entitle(caller) {
  if (caller.staff) return;
  var org = A.safeOrg(caller.orgId);
  if (!org) throw A.httpError(403, 'A workspace sign-in is required.');
  var root = A.db().collection('omega_orgs').doc(org), records;
  try {
    records = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('members').doc(caller.uid).get()]);
  } catch (e) { throw A.httpError(503, 'Could not check this workspace’s plan right now; try again in a minute.'); }
  var rec = data(records[0]), bill = data(records[1]) || {}, member = data(records[2]);
  if (rec && CLOSED.indexOf(rec.status) >= 0) throw A.httpError(403, 'This workspace is not active.');
  if (bill.packaged === true) {
    var access = require('./_lib/package-access');
    try { access.requireModule(access.project(caller, bill, rec, member, Date.now()), 'plansets', { tools: ['editor'] }); }
    catch (e) { throw A.httpError(e.status || 403, (e.message || 'Not in your package') + ' — the build sequence is part of ' + M.get('plansets').name + ', with the 3D Site Visualizer.'); }
    return;
  }
  if (member && member.status && member.status !== 'active') throw A.httpError(403, 'Your membership of this workspace is not active.');
  if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf('editor') < 0) throw A.httpError(403, 'Your account does not include Site Map; ask your workspace admin for access.');
  var AD = require('./_lib/addons'), ctx = AD.judge(org, bill, AD.live(bill, Date.now())).ctx;
  var editor = !ctx.tool || !ctx.tool('editor') || !ctx.canOpen || ctx.canOpen('editor');
  if (!editor) throw A.httpError(403, 'Site Map is not in this workspace’s product.');
}

module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  res.setHeader('Cache-Control', 'no-store');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required.');
    var body = req.body && typeof req.body === 'object' ? req.body : {};
    var q = body.q && typeof body.q === 'object' ? body.q : {};
    if (EC.size(q) > EC.MAX_ITEMS) throw A.httpError(413, 'Too many items for one build sequence.');
    return entitle(caller).then(function () {
      /* whose workspace is pricing, exactly as the Run is priced
         (api/cost-rollup.js): the body never says who */
      q.vendorOrg = caller.orgId || null;
      return BS.sequence(EC.rollup(q), q, body.build);
    });
  });
});
module.exports._entitle = entitle;
