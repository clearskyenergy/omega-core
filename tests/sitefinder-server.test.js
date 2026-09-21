/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('fs'), path = require('path'), vm = require('vm');
var admin = require('../api/_lib/admin');
var SS = require('../api/_lib/site-score');
var root = path.resolve(__dirname, '..');
function error(status, message) { var e = new Error(message); e.status = status; return e; }
function harness(file, opts) {
  opts = opts || {};
  var docs = opts.docs || {}, reads = [], writes = [], calls = [], billingReads = 0;
  var caller = { uid: 'u1', orgId: 'example.com', email: 'rep@example.com', staff: !!opts.staff };
  function ref(p) {
    return { path: p, collection: function (k) { return ref(p + '/' + k); },
      doc: function (k) { return ref(p + '/' + k); },
      get: function () {
        reads.push(p);
        if (opts.readFail && p.indexOf(opts.readFail) >= 0) return Promise.reject(new Error('secret internal path'));
        return Promise.resolve({ exists: Object.hasOwn(docs, p), data: function () { return docs[p]; } });
      }, set: function (v) { docs[p] = v; writes.push(p); return Promise.resolve(); } };
  }
  var chain = Promise.resolve();
  var A = { httpError: error, safeOrg: admin.safeOrg,
    authenticate: function (req) { return req.headers.authorization ? Promise.resolve(caller) : Promise.reject(error(401, 'missing bearer token')); },
    canActInOrg: function (c, org) { return Promise.resolve(c.staff || c.orgId === org || opts.granted === org); },
    isDegraded: function () { return !!opts.degraded; }, degradedReason: function () { return 'secret config'; },
    billingOf: function () { billingReads++; return opts.billingFail ? Promise.reject(new Error('secret bill')) : Promise.resolve(opts.bill || {}); },
    FieldValue: function () { return { serverTimestamp: function () { return 'timestamp'; } }; },
    db: function () { return { collection: ref, runTransaction: function (fn) {
      var run = chain.then(function () { return fn({ get: function (r) { return r.get(); }, set: function (r, v) { r.set(v); } }); });
      chain = run.catch(function () {}); return run;
    } }; },
    handler: function (fn) { return async function (req, res) {
      try { var out = await fn(req, res); if (out !== undefined && !res.headersSent) res.status(200).json(out); }
      catch (e) { if (!res.headersSent) res.status(e.status || 500).json({ error: e.message }); }
    }; }
  };
  var sandbox = { module: { exports: {} }, process: { env: opts.env || {} }, Buffer: Buffer,
    URL: URL, AbortController: AbortController, setTimeout: setTimeout, clearTimeout: clearTimeout,
    console: { log: function () {}, warn: function () {}, error: function () {} },
    fetch: async function (url, init) {
      calls.push({ url: url, init: init });
      if (opts.fetchError) throw new Error('secret provider detail');
      return new Response(JSON.stringify(opts.payload === undefined ? [] : opts.payload), { status: 200 });
    }, require: function (name) {
      if (name === './_lib/admin') return A;
      if (name === './_lib/embed') return { rateLimit: function () { if (opts.rateLimited) throw error(429, 'rate limited'); } };
      return require(name[0] === '.' ? path.resolve(root, 'api', name) : name);
    } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'api', file), 'utf8'), sandbox, { filename: file });
  async function request(body, method, noToken) {
    var result = { headers: {} };
    var res = { headersSent: false, setHeader: function (k, v) { result.headers[k] = v; },
      status: function (s) { result.status = s; return res; },
      json: function (j) { result.body = JSON.parse(JSON.stringify(j)); res.headersSent = true; return res; } };
    await sandbox.module.exports({ method: method || 'POST', body: body, query: body,
      headers: noToken ? {} : { authorization: 'Bearer fixture' } }, res);
    return result;
  }
  return { request: request, helpers: sandbox.module.exports._helpers, docs: docs,
    reads: reads, writes: writes, calls: calls, billingReads: function () { return billingReads; } };
}
var row = { id: 'one', type: 'Warehouse', sqft: 100000, lotAcres: 5, serviceKva: 1500,
  annualKwh: { value: 1000000, src: 'metered' }, feederId: 'F1' };
var circuit = { known: true, sellable: 30, feederId: 'F1', nameplate: 1000, queue: 970 };

test('all endpoints require auth, reject foreign orgs and use no-store', async function () {
  for (var file of ['site-score.js', 'price-site.js', 'listings.js']) {
    var h = harness(file), body = { rows: [row], kw: 100, op: 'detail', address: 'fixture' };
    assert.equal((await h.request(body, 'POST', true)).status, 401);
    assert.equal(h.reads.length, 0);
    assert.equal((await h.request(Object.assign({}, body, { orgId: 'foreign.com' }))).status, 403);
    assert.equal((await h.request(body, 'DELETE')).status, 405);
    assert.equal((await h.request(body)).headers['Cache-Control'], 'private, no-store');
    assert.equal(h.calls.length, 0);
  }
});
test('tenant status, membership and billing gates deny before scoring, pricing or spending', async function () {
  for (var file of ['site-score.js', 'price-site.js', 'listings.js']) {
    for (var options of [
      { docs: { 'omega_orgs/example.com': { status: 'pending' } } },
      { docs: { 'omega_orgs/example.com': { status: 'suspended' } } },
      { docs: { 'omega_orgs/example.com/members/u1': { status: 'disabled' } } },
      { docs: { 'omega_orgs/example.com/members/u1': { toolAccess: [] } } },
      { bill: { toolAccess: [] } },
      { bill: { toolOverrides: { sitefinder: false, costestimator: false } } }
    ]) {
      var h = harness(file, options);
      assert.equal((await h.request({ rows: [row], kw: 100, op: 'detail' })).status, 403, file);
      assert.equal(h.calls.length, 0);
    }
  }
});
test('staff override still checks billing and supports validated target org', async function () {
  for (var file of ['site-score.js', 'price-site.js', 'listings.js']) {
    var h = harness(file, { staff: true, bill: { toolAccess: [] } });
    assert.equal((await h.request({ orgId: 'target.com', rows: [row], kw: 100, op: 'detail' })).status, 200);
    assert.equal(h.billingReads(), 1);
    assert.equal((await h.request({ orgId: 'target.com/x/y', rows: [], kw: 100, op: 'detail' })).status, 400);
  }
});
test('entitlement read errors and degraded service fail closed without internal details', async function () {
  for (var file of ['site-score.js', 'price-site.js', 'listings.js']) {
    for (var opts of [{ readFail: '/members/' }, { billingFail: true }, { degraded: true }]) {
      var h = harness(file, opts), r = await h.request({ rows: [row], kw: 100, op: 'detail' });
      assert.equal(r.status, 503, file);
      assert.doesNotMatch(r.body.error, /secret/);
      assert.equal(h.calls.length, 0);
    }
  }
});
test('scores both wire shapes, ignores caller derived size, preserves circuit provenance and load use', async function () {
  var h = harness('site-score.js');
  var a = await h.request({ rows: [row], circuits: { one: circuit }, hours: 4 });
  assert.equal(a.status, 200);
  assert.equal(a.body.scored[0].kw, 30);
  assert.equal(a.body.scored[0].kwh, 120);
  assert.equal(a.body.scores.one.battery.score, a.body.scored[0].score);
  var legacy = Object.assign({}, row, { type: undefined, useType: row.type,
    annualKwh: 1000000, peakSource: 'metered', deliverableKw: 999999,
    circuit: Object.assign({}, circuit, { sellableKw: 30, fromRecord: true }) });
  var b = await h.request({ rows: [legacy], hours: 4, use: 'load' });
  assert.equal(b.body.scored[0].kw, 30);
  assert.equal(b.body.scored[0].score, b.body.scored[0].loadScore);
  assert.equal(b.body.scored[0].circuitSrc, 'record');
  assert.equal(b.body.weightsVersion, a.body.weightsVersion);
  assert.equal(a.body.limit, 500);
});
test('weight changes have stable versioning; invalid weights fall back with a note', async function () {
  var docs = {}, h = harness('site-score.js', { docs: docs });
  var a = (await h.request({ action: 'weights' })).body;
  docs['toolData/example.com/tools/sitefinder'] = { data: { weights: { battery: { deliverable: { pts: 30 } } } } };
  var b = (await h.request({ action: 'weights' })).body;
  assert.equal(b.weightsSource, 'org'); assert.notEqual(a.weightsVersion, b.weightsVersion);
  docs['toolData/example.com/tools/sitefinder'].data.weights.modelledPenalty = -1;
  var c = (await h.request({ action: 'weights' })).body;
  assert.equal(c.weightsSource, 'default'); assert.equal(c.weightsVersion, a.weightsVersion); assert.ok(c.notes.length);
});
test('batch cap, invalid request, unknown rows and prototype-like IDs are explicit', async function () {
  var h = harness('site-score.js');
  assert.equal((await h.request({ rows: [], hours: true })).status, 400);
  assert.equal((await h.request({ rows: [], hours: 25 })).status, 400);
  assert.equal((await h.request({ rows: [], circuits: [] })).status, 400);
  var r = await h.request({ rows: Array.from({ length: 501 }, function (_, i) { return { id: String(i) }; }) });
  assert.equal(r.body.scored.length, 500); assert.equal(r.body.truncated, 1);
  r = await h.request({ rows: [{ id: '__proto__' }, { id: 'constructor' }, null] });
  assert.ok(Object.hasOwn(r.body.scores, '__proto__')); assert.equal(r.body.scored.length, 2);
});
test('zero metered load stays zero and invalid numerical types are unknown', function () {
  var r = SS.scoreRow({ id: 'zero', sqft: 100000, annualKwh: { value: 0, src: 'metered' } }, circuit, SS.mergeWeights());
  assert.equal(r.size.kw, 0); assert.equal(r.load.peakKw, 0);
  assert.equal(SS.modelLoad({ sqft: true }).annualKwh, null);
  assert.equal(SS.circuitCeiling({}, { known: 'false', sellable: 100 }).known, false);
});
test('pricing validates scalars and returns finite price, accuracy and financial outputs', async function () {
  var h = harness('price-site.js');
  for (var b of [{ kw: true }, { kw: [] }, { kw: 1e300 }, { kw: 100, hours: -1 }, { kw: 100, carryUpgrade: 'false' }])
    assert.equal((await h.request(b)).status, 400);
  var r = await h.request({ kw: 100, hours: 4, soil: 'constructor', rates: { malicious: true } });
  assert.equal(r.status, 200); assert.equal(r.body.kwh, 400);
  assert.ok(r.body.total.base > 0); assert.ok(r.body.accuracy.rangeHighUsd > r.body.total.base);
  assert.equal(r.body.rejectedInputs[0].field, 'soil'); assert.equal(r.body.ignoredInputs[0].field, 'rates');
  assert.ok(r.body.financial.stack.perYear > 0); assert.ok(r.body.financial.paybackYears >= 0);
});
test('explicit supplier and installer selection stays on stored own keys', async function () {
  var h = harness('price-site.js', { docs: { 'toolData/example.com/tools/costestimator': { data: {
    sel: 'v', instSel: 'i', vendors: {}, installers: { i: { name: 'Fixture installer' } }
  } } } });
  var p = await h.helpers.orgPricing('example.com', {}); assert.equal(p.installer.name, 'Fixture installer');
  p = await h.helpers.orgPricing('example.com', { supplierKey: '', installerKey: '' }); assert.equal(p.installer, null);
  p = await h.helpers.orgPricing('example.com', { supplierKey: '__proto__', installerKey: 'constructor' }); assert.equal(p.installer, null);
});
test('unconfigured listings are explicitly unspent and staff probe works offline', async function () {
  var h = harness('listings.js');
  var r = await h.request({ op: 'detail', address: 'Fixture' });
  assert.equal(r.status, 200); assert.equal(r.body.ok, false); assert.equal(r.body.spent, false);
  assert.equal(r.body.record, null); assert.equal(r.body.connected, false); assert.ok(r.body.allowance.resetsAt);
  assert.equal(h.calls.length, 0);
  h = harness('listings.js', { staff: true });
  r = await h.request({ op: 'probe', sample: { fixture: true } });
  assert.equal(r.status, 200); assert.equal(r.body.spent, false); assert.equal(h.calls.length, 0);
  assert.equal((await harness('listings.js').request({ op: 'probe', sample: {} })).status, 403);
});
var configured = { env: { CREXI_BASE_URL: 'https://feed.example.com', CREXI_API_KEY: 'fixture-secret' },
  bill: { tier: 'enterprise' }, payload: { id: 'fixture-listing', address: 'Fixture only', latitude: 41, longitude: -87 } };
test('listing detail wire contract, tenant-isolated cache and atomic daily allowance', async function () {
  var h = harness('listings.js', Object.assign({}, configured));
  var body = { op: 'detail', address: 'Fixture', city: 'A', state: 'IL' };
  var a = await h.request(body), b = await h.request(body);
  assert.equal(a.status, 200); assert.equal(a.body.ok, true); assert.ok(a.body.record);
  assert.equal(a.body.source, 'crexi'); assert.equal(a.body.spent, true); assert.equal(b.body.spent, false);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.redirect, 'error');
  assert.equal(h.calls[0].init.headers.Authorization, 'Bearer fixture-secret');
  assert.match(h.calls[0].url, /Fixture%2C%20A%2C%20IL/);
  var other = harness('listings.js', Object.assign({}, configured, { staff: true, docs: h.docs }));
  assert.equal((await other.request(Object.assign({}, body, { orgId: 'other.com' }))).body.spent, true);
  h = harness('listings.js', Object.assign({}, configured, { bill: { tier: 'enterprise', listingLookupsPerDay: 1 } }));
  var results = await Promise.all([h.request(body), h.request(Object.assign({}, body, { address: 'Other fixture' }))]);
  assert.deepEqual(results.map(function (r) { return r.status; }).sort(), [200, 429]); assert.equal(h.calls.length, 1);
  assert.equal(results.find(function (r) { return r.status === 429; }).body.allowance.remaining, 0);
});
test('no-match, malformed upstream and provider failure remain distinct and account for spend', async function () {
  var h = harness('listings.js', Object.assign({}, configured, { payload: { results: [] } }));
  var r = await h.request({ op: 'detail', address: 'Fixture' });
  assert.equal(r.status, 200); assert.equal(r.body.ok, false); assert.equal(r.body.spent, true);
  h = harness('listings.js', Object.assign({}, configured, { fetchError: true }));
  r = await h.request({ op: 'detail', address: 'Fixture' });
  assert.equal(r.status, 502); assert.equal(r.body.spent, true); assert.doesNotMatch(r.body.error, /secret/);
  h = harness('listings.js', Object.assign({}, configured, { payload: { nonsense: [] } }));
  r = await h.request({ op: 'search', bbox: { n: 42, s: 41, e: -87, w: -88 } });
  assert.equal(r.status, 502); assert.equal(r.body.spent, true);
});
test('server-only connection settings reject SSRF and tenant credential/spend overrides', function () {
  var h = harness('listings.js', configured), H = h.helpers;
  for (var url of ['http://feed.example.com', 'https://127.1', 'https://2130706433', 'https://[::1]',
    'https://user:pass@feed.example.com', 'https://host.internal', 'https://feed.example.com?x=y']) assert.equal(H.safeBase(url), '');
  assert.throws(function () { H.connection({ baseUrl: 'https://attacker.example.com' }); });
  var c = H.connection({ apiKey: 'tenant-secret', searchPath: '@attacker.example.com', authHeader: 'Host', searchBilled: false });
  assert.equal(c.key, 'fixture-secret'); assert.equal(c.searchBilled, true);
  assert.equal(c.searchPath, '/crexi/search'); assert.equal(c.authHeader, 'Authorization');
  assert.equal(H.cleanMap({ id: ['__proto__.secret'] }), null);
  assert.equal(H.dailyCap({ listingLookupsPerDay: 0 }), 0);
});
test('listings source contains no literal NUL bytes', function () {
  assert.equal(fs.readFileSync(path.join(root, 'api/listings.js')).includes(0), false);
});
test('pricing alternative tool needs a paid tier or explicit override', async function () {
  var body = { kw: 100, hours: 4 };
  var h = harness('price-site.js', { bill: { tier: 'standard', toolOverrides: { sitefinder: false } } });
  assert.equal((await h.request(body)).status, 403);
  h = harness('price-site.js', { bill: { tier: 'standard', toolOverrides: { sitefinder: false, costestimator: true } } });
  assert.equal((await h.request(body)).status, 200);
  h = harness('price-site.js', { bill: { tier: 'deluxe', toolOverrides: { sitefinder: false } } });
  assert.equal((await h.request(body)).status, 200);
});
test('explicit listing denial wins over tier and zero quota prevents upstream calls', async function () {
  for (var bill of [{ tier: 'enterprise', toolOverrides: { listings: false } }, { tier: 'enterprise', listingLookupsPerDay: 0 }]) {
    var h = harness('listings.js', Object.assign({}, configured, { bill: bill }));
    assert.ok([403, 429].includes((await h.request({ op: 'detail', address: 'Fixture' })).status));
    assert.equal(h.calls.length, 0);
  }
});
test('missing credential is not connected and approved tenant proxy withholds platform key', function () {
  var h = harness('listings.js', { env: { CREXI_BASE_URL: 'https://feed.example.com' } });
  assert.equal(h.helpers.connection({}).connected, false);
  h = harness('listings.js', { env: Object.assign({}, configured.env, {
    CREXI_ALLOWED_BASE_URLS: 'https://proxy.example.com', CREXI_KEYLESS_PROXY: 'true'
  }) });
  var c = h.helpers.connection({ baseUrl: 'https://proxy.example.com' });
  assert.equal(c.connected, true); assert.equal(c.key, ''); assert.equal(c.keyWithheld, true);
});
test('listing mapping faults and oversized payloads are failures, never empty markets', async function () {
  for (var payload of [{ unexpected: 'field' }, { id: 'fixture', huge: 'x'.repeat(2097152) }]) {
    var h = harness('listings.js', Object.assign({}, configured, { payload: payload }));
    var r = await h.request({ op: 'detail', address: 'Fixture' });
    assert.equal(r.status, 502); assert.equal(r.body.spent, true); assert.equal(h.writes.filter(function (p) { return p.startsWith('listing_cache/'); }).length, 0);
  }
});
test('energy model loads without any browser dependency', function () {
  var source = fs.readFileSync(path.join(root, 'api/_lib/site-score.js'), 'utf8');
  var context = { module: { exports: {} }, require: function (name) {
    assert.equal(name, './cost-model.js'); return require('../api/_lib/cost-model');
  } };
  vm.runInNewContext(source, context);
  var S = context.module.exports;
  assert.equal(S.EUI['Cold Storage'], 96);
  var r = S.modelLoad({ type: 'Warehouse', sqft: 100000 });
  assert.equal(r.annualKwh.src, 'modelled'); assert.equal(r.annualKwh.value, Math.round(100000 * 22 / 3.412));
  ['omega-listings-source.js', 'omega-comed-listings.js'].forEach(function (file) {
    var browser = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(browser, /S\.EUI\s*=|S\.EUI_LF\s*=|function\s+modelKwh\s*\(/);
  });
});
test('actual scoring client batch serializer consumes server response unchanged', async function () {
  var h = harness('site-score.js'), user = { uid: 'fixture', getIdToken: function () { return Promise.resolve('fixture'); } };
  var context = { setTimeout: setTimeout, clearTimeout: clearTimeout, firebase: { auth: function () { return { currentUser: user }; } } };
  context.XMLHttpRequest = function () {
    var xhr = this;
    xhr.open = function () {}; xhr.setRequestHeader = function () {};
    xhr.send = function (body) { h.request(JSON.parse(body)).then(function (r) {
      xhr.status = r.status; xhr.responseText = JSON.stringify(r.body); xhr.onload();
    }); };
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'omega-site-score.js'), 'utf8'), context);
  var result = await new Promise(function (resolve, reject) {
    context.OmegaSiteScore.score([row], { one: circuit }, { hours: 4 }, function (e, r) { if (e) reject(e); else resolve(r); });
  });
  assert.equal(result.byId.one.kw, 30); assert.equal(result.byId.one.kwh, 120);
});
