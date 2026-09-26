/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), D = require('./_lib/firestore-double');
var db = new D.DB(), count = 0, unavailable = false;
var caller = { uid: 'member', email: 'member@example.com', orgId: 'example.com', claims: { email_verified: true }, staff: false };
function error(status, message) { return Object.assign(new Error(message), { status: status }); }
D.mock('../api/_lib/admin', {
  handler: function (fn) { return fn; }, authenticate: async function () { return caller; },
  db: function () { if (unavailable) throw error(503, 'unavailable'); return db; },
  billingOf: async function (org) { if (unavailable) throw error(503, 'unavailable'); return (await db.doc('omega_orgs/' + org + '/billing/current').get()).data() || {}; },
  isDegraded: function () { return unavailable; }, httpError: error, FieldValue: function () { return {}; }
});
D.mock('../api/_lib/embed', { rateLimit: function () {} });
var render = require('../api/render'), price = require('../api/price-site')._helpers.gate;
var site = require('../api/site-score')._helpers.entitle, rfq = require('../api/rfq');
function setup(keys) {
  db.seed('omega_orgs/example.com', { status: 'active' });
  db.seed('omega_orgs/example.com/members/member', { role: 'member', status: 'active' });
  db.seed('omega_orgs/example.com/billing/current', { packaged: true, modules: keys, packagingState: 'paid', tier: 'enterprise', toolOverrides: { render: true, sitefinder: true } });
}
async function refused(fn) { await assert.rejects(fn, function (e) { return e.status === 403; }); count++; }
async function renderStatus(expected) {
  var result = {}, res = { setHeader: function () {}, status: function (n) { result.status = n; return res; }, json: function (j) { result.body = j; return res; } };
  await render({ method: 'POST', headers: { authorization: 'Bearer fixture' }, body: {} }, res);
  assert.equal(result.status, expected, JSON.stringify(result)); count++;
}
async function main() {
  setup(['lite']); await renderStatus(403);
  setup(['lite', 'plansets']); await renderStatus(400); // Reaches image validation, no provider called.
  db.seed('omega_orgs/example.com/members/member', { role: 'viewer', status: 'active' }); await renderStatus(403);
  unavailable = true; await renderStatus(503); unavailable = false; // No degraded-mode free rendering.
  setup(['lite']); await refused(function () { return price(caller, 'example.com'); });
  for (var module of ['estimate', 'sitefinder']) { setup(['lite', module]); await price(caller, 'example.com'); count++; }
  setup(['lite']); await refused(function () { return site(caller, 'example.com'); });
  setup(['lite', 'sitefinder']); await site(caller, 'example.com'); count++;
  db.seed('omega_orgs/example.com/members/member', { role: 'member', status: 'active', toolAccess: [] });
  await refused(function () { return site(caller, 'example.com'); });
  setup(['lite']); await refused(function () { return rfq({ method: 'POST', headers: {}, body: {} }); });
  setup(['lite', 'estimate']); await assert.rejects(function () { return rfq({ method: 'POST', headers: {}, body: {} }); }, function (e) { return e.status === 400; }); count++;
  console.log('Admin producer package gates: ' + count + ' passed; no network calls or messages sent.');
}
main().catch(function (e) { console.error(e); process.exitCode = 1; });
