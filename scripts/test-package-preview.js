/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), V = require('../api/_lib/verify-token'), handler = require('../api/package-access');
var original = V.authenticateWithTier, reads = V.readAsCaller, count = 0;
var caller = { orgId: 'example.com', emailVerified: true, staff: false }, billing = { packaged: true, modules: ['lite'], packagingState: 'paid', accessUntil: Date.now() + 86400000 };
V.authenticateWithTier = async function () { return { caller: caller, billing: billing }; };
V.readAsCaller = async function () { throw new Error('Preview must not access any tenant record'); };
async function call(body) {
  var response = { setHeader: function () {}, status: function (n) { this.code = n; return this; }, json: function (v) { this.body = v; return this; } };
  await handler({ method: 'POST', body: body, headers: {}, query: {} }, response); return response;
}
function check(value, msg) { assert(value, msg); count++; }
(async function () {
  try {
    var before = JSON.stringify(billing), result = await call({ previewModules: ['lite', 'compute'] });
    check(result.code === 403, 'tenant cannot preview/grant another package');
    caller.staff = true;
    result = await call({ previewModules: ['lite', 'plansets'] });
    check(result.code === 200 && result.body.preview && !result.body.staff, 'staff receives customer-shaped presentation');
    check(result.body.modules.join() === 'lite,plansets', 'exact requested modules');
    check(result.body.canPreview === true && !!result.body.starters.ev, 'staff can leave preview');
    check(JSON.stringify(billing) === before, 'no change to actual billing');
    result = await call({ previewModules: ['lite', 'unknown'] }); check(result.code === 400, 'unknown module rejected');
    result = await call({ previewModules: ['lite'], orgId: 'victim.example' }); check(result.code === 400, 'preview cannot target tenants');
    caller.staff = false; caller.email = 'user@csebuilders.com';
    result = await call({ previewModules: ['lite'] }); check(result.code === 403, 'retired email domain is not staff');
    console.log('Package presentation preview: ' + count + ' passed; no reads or writes.');
  } finally { V.authenticateWithTier = original; V.readAsCaller = reads; }
})().catch(function (e) { console.error(e); process.exitCode = 1; });
