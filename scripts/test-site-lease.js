/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The battery host lease: the model, and the endpoint's scoping. */
'use strict';
var assert = require('assert'), L = require('../api/_lib/site-lease');
var o = L.offer({ kw: 750, kwh: 3000 });
assert.equal(o.termYears, 15); assert.equal(o.leasedAcres, 0.15); assert.equal(o.acresDerived, true);
assert.equal(o.annual.base, Math.round(0.15 * 4000 + 750 * 35), 'pad rent plus capacity rent');
assert.equal(o.monthly.base, Math.round(o.annual.base / 12));
assert.ok(o.annual.low < o.annual.base && o.annual.base < o.annual.high);
assert.equal(o.termTotal.base, Math.round(L.escalatedTotal(o.annual.base, 0.025, 15)));
assert.ok(o.termTotal.base > o.annual.base * 15, 'escalation adds to a flat sum');
assert.deepEqual(o.floored, []);
var small = L.offer({ kw: 50, kwh: 200 });
assert.deepEqual(small.floored, ['low', 'base', 'high'], 'a 50 kW system floors at $500 a month in every band');
assert.deepEqual(L.offer({ kw: 200, kwh: 800 }).floored, ['low'], 'the floor lifts as the system grows');
assert.equal(small.monthly.low, 500);
var given = L.offer({ kw: 750, kwh: 3000, acres: 0.5, termYears: 20 });
assert.equal(given.leasedAcres, 0.5); assert.equal(given.acresDerived, false); assert.equal(given.termYears, 20);
assert.equal(L.offer({ kw: 1, termYears: 99 }).termYears, 30, 'term is clamped');
assert.equal(L.offer({ kw: 100 }).kwh, 400, 'four hours when no energy is given');
assert.throws(function () { L.offer({ kw: 0 }); }, /kw is required/);
assert.equal(L.escalatedTotal(100, 0, 3), 300);
/* the endpoint: staff see the components, a rep never does; the site is echoed key by key */
var vm = require('vm'), fs = require('fs'), path = require('path');
var caller = { orgId: 'example.com', staff: false }, limits = [];
var box = { module: { exports: {} }, require: function (n) {
  if (n === './_lib/admin') return { httpError: function (s, m) { return Object.assign(Error(m), { status: s }); }, handler: function (f) { return f; },
    safeOrg: function (s) { return /^[a-z.]+$/.test(s) ? s : ''; }, authenticate: async function (req) { if (!req.token) throw Object.assign(Error('auth'), { status: 401 }); return caller; },
    canActInOrg: async function (c, o) { return c.orgId === o; }, db: function () { return { collection: function () { return { doc: function () { return { get: async function () { return { exists: true, data: function () { return { name: 'Example Energy', exportBrand: { logo: '/x.png' }, colors: { accent: '#123456' } }; } }; } }; } }; } }; } };
  if (n === './_lib/embed') return { rateLimit: function (k) { limits.push(k); } };
  if (n === './site-score') return { _helpers: { entitle: async function () {} } };
  return L;
}, Number, Object, Array, Error, isFinite, String, Math, JSON, Promise, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/site-lease.js'), 'utf8'), box);
var api = box.module.exports, res = { setHeader: function () {} };
(async function () {
  await assert.rejects(api({ method: 'POST', body: { kw: 100 } }, res), { status: 401 });
  await assert.rejects(api({ method: 'POST', token: 1, body: { orgId: 'other.com', kw: 100 } }, res), { status: 403 });
  await assert.rejects(api({ method: 'POST', token: 1, body: { kw: 0 } }, res), { status: 400 });
  await assert.rejects(api({ method: 'POST', token: 1, body: { kw: 100, acres: 'lots' } }, res), { status: 400 });
  var r = await api({ method: 'POST', token: 1, body: { kw: 750, kwh: 3000, site: { id: 'crexi:1', addr: '1 Test St', owner: 'Owner LLC', feederId: 'forged-not-echoed?', secret: 'x' } } }, res);
  assert.equal(r.offer.components, undefined, 'a rep never sees the rate components');
  assert.equal(r.offer.rateCard.disclosed, false); assert.equal(r.offer.rateCard.capacityPerKwYear, undefined);
  assert.equal(r.brand.name, 'Example Energy'); assert.equal(r.brand.logoUrl, '/x.png'); assert.equal(r.brand.accent, '#123456');
  assert.equal(r.site.secret, undefined); assert.equal(r.site.owner, 'Owner LLC');
  assert.ok(limits.length && limits.every(function (k) { return k === 'site-lease:example.com'; }), 'rate limited per workspace');
  caller.staff = true;
  var s = await api({ method: 'POST', token: 1, body: { kw: 750 } }, res);
  assert.ok(s.offer.components.base.padAnnual > 0, 'staff see the build-up');
  console.log('site lease: 750 kW / 3 MWh pays ' + o.monthly.base + '/mo, ' + o.termTotal.base + ' over 15 years (base band); endpoint scoping holds.');
})().catch(function (e) { console.error(e); process.exitCode = 1; });
