/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), D = require('./_lib/firestore-double');
var count = 0, reads = [], ctx, broken = false;
var caller = { uid: 'member', email: 'member@example.com', orgId: 'example.com', emailVerified: true, staff: false };
var org = { status: 'active' }, member = { role: 'member', status: 'active' };
D.mock('../api/_lib/verify-token', {
  authenticateWithTier: async function () { if (broken) throw Object.assign(new Error('billing unavailable'), { status: 503 }); return ctx; },
  readAsCaller: async function (token, path) { reads.push(path); return /\/members\//.test(path) ? member : org; },
  httpError: function (status, message) { return Object.assign(new Error(message), { status: status }); }
});
function setup(keys) { reads = []; member = { role: 'member', status: 'active' }; org = { status: 'active' }; ctx = { caller: caller, tier: 'enterprise', billing: { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: keys, toolOverrides: {}, addons: [] } }; }
async function call(file, method, body, query) {
  var result = {}, res = { setHeader: function () {}, status: function (n) { result.status = n; return res; }, json: function (data) { result.body = data; return res; } };
  await require('../api/' + file)({ method: method, headers: { authorization: 'Bearer fixture' }, body: body || {}, query: query || {} }, res);
  return result;
}
async function expect(file, method, body, code) { var r = await call(file, method, body); assert.equal(r.status, code, file + ': ' + JSON.stringify(r.body)); count++; return r; }
async function main() {
  var specs = [
    ['bess-size', 'POST', { mode: 'invalid' }, 'storage', 400],
    ['bess-design', 'POST', { loadMw: -1 }, 'storage', 400],
    ['compute-lease', 'POST', {}, 'compute', 400],
    ['network-proximity', 'POST', {}, 'siteintel', 400],
    ['fiber-screen', 'GET', {}, 'gridatlas', 400],
    ['fiber-proxy', 'GET', {}, 'gridatlas', 503],
    ['grid-atlas', 'POST', {}, 'gridatlas', 400],
    ['validation', 'POST', {}, 'engineering', 200]
  ];
  delete process.env.RESEND_API_KEY;
  delete process.env.FIBER_VENDOR_KEY; delete process.env.FIBER_VENDOR_BASE;
  for (var s of specs) {
    setup(['lite']); await expect(s[0], s[1], s[2], 403);
    // Tier/addon/override forgery cannot grant a missing module.
    ctx.billing.toolOverrides = { batterysizer: true, gridatlas: true, computelease: true };
    ctx.billing.addons = ['engineering', 'compute']; await expect(s[0], s[1], s[2], 403);
    setup(['lite', s[3]]); await expect(s[0], s[1], s[2], s[4]);
    ctx.billing.packagingState = 'pending-payment'; await expect(s[0], s[1], s[2], 403);
    ctx.billing.packagingState = 'paid'; member.role = 'viewer'; await expect(s[0], s[1], s[2], 403);
    member.role = 'member'; member.toolAccess = []; await expect(s[0], s[1], s[2], 403);
    member.toolAccess = ['editor']; org.status = 'suspended'; await expect(s[0], s[1], s[2], 403);
  }
  setup(['lite', 'compute']); await expect('compute-lease', 'POST', { rep: {} }, 200);
  setup(['lite']); var p = await expect('package-access', 'GET', {}, 200); assert.deepEqual(p.body.modules, ['lite']); count++;
  assert(reads.every(function (r) { return r.indexOf('omega_orgs/example.com') === 0; })); count++;
  p = await call('package-access', 'GET', {}, { orgId: 'other.com' }); assert.equal(p.status, 403); count++;
  await expect('package-access', 'POST', {}, 403);
  broken = true; await expect('package-access', 'GET', {}, 503); broken = false;
  setup(['lite']); ctx.billing = {}; p = await expect('package-access', 'GET', {}, 200); assert.equal(p.body.packaged, false); count++;
  console.log('Packaged API producers: ' + count + ' passed; no network calls.');
}
main().catch(function (e) { console.error(e); process.exitCode = 1; });
