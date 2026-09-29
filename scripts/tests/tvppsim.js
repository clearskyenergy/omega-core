/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The VPP Earnings Simulator, offline: the engine (api/_lib/vpp-sim.js),
   the provider seam (api/_lib/vpp-provider.js) and the gate on
   POST /api/vpp-estimate (api/vpp-estimate.js).

   The endpoint is loaded in a vm sandbox with verify-token replaced by a
   stub that answers from an in-memory Firestore, as tproformaapi.js does;
   the engine, the provider, package-access and the tariff engine are real.

   No network, no credentials, no npm install.
   Run: node scripts/tests/tvppsim.js
*/
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var S = require(path.join(ROOT, 'api', '_lib', 'vpp-sim'));
var P = require(path.join(ROOT, 'api', '_lib', 'vpp-provider'));

var pass = 0, fail = 0, queue = Promise.resolve();
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
}
function section(t) { console.log('\n' + t); }
function later(fn) { queue = queue.then(fn); }
function stream(r, id) { for (var i = 0; i < r.streams.length; i++) if (r.streams[i].id === id) return r.streams[i]; return null; }

/* ── where ─────────────────────────────────────────────────────────────── */
section('ZIP → state → market');
[['94110', 'CA', 'CAISO'], ['75201', 'TX', 'ERCOT'], ['79901', 'TX', 'WEST'], ['60601', 'IL', 'PJM'],
 ['62701', 'IL', 'MISO'], ['10001', 'NY', 'NYISO'], ['02139', 'MA', 'ISONE'], ['30301', 'GA', 'SE'],
 ['85001', 'AZ', 'WEST'], ['64105', 'MO', 'SPP'], ['19103', 'PA', 'PJM'], ['96813', 'HI', 'HI']].forEach(function (c) {
  var l = S.locate(c[0]);
  ok(c[0] + ' is ' + c[1] + ' / ' + c[2], l.ok && l.state === c[1] && l.market === c[2], l);
});
ok('ComEd ZIP is flagged', S.locate('60601').comed === true && S.locate('62701').comed === false);
ok('NYC ZIP is Con Edison', S.locate('10001').nyc === true && S.locate('14201').nyc === false);
ok('a bad ZIP is refused', S.locate('abc').ok === false && S.locate('00000').ok === false);
ok('a market override wins and is not "inferred"', S.locate('94110', 'ERCOT').market === 'ERCOT' && S.locate('94110', 'ERCOT').marketInferred === false);
ok('an unknown override is ignored', S.locate('94110', 'constructor').market === 'CAISO');

/* ── the load ─────────────────────────────────────────────────────────── */
section('Load intake');
var fit = S.fitMonth([1, 2, 3, 2, 1, 1], 60, 20);
var fsum = fit.reduce(function (a, b) { return a + b; }, 0), fmax = Math.max.apply(null, fit);
ok('fitMonth keeps the kWh', Math.abs(fsum - 60) < 1e-6, fsum);
ok('fitMonth lands the peak', Math.abs(fmax - 20) < 1e-6, fmax);
var hourly = S.parseInterval('ts,kw\n' + new Array(8761).join('x,5\n'));
ok('8760 CSV parses (header skipped)', hourly.ok && hourly.kw.length === 8760 && hourly.kw[0] === 5, hourly.ok ? hourly.kw.length : hourly);
var quarter = S.parseInterval(new Array(35041).join('1.25\n'), 'kwh');
ok('15-minute kWh becomes hourly kW', quarter.ok && quarter.kw.length === 8760 && Math.abs(quarter.kw[0] - 5) < 1e-9, quarter.ok ? quarter.kw[0] : quarter);
ok('a partial file is refused, not padded', S.parseInterval('1\n2\n3').ok === false);
var two = S.billsToMonths([{ month: '2024-07', kwh: 100 }, { month: '2025-07', kwh: 300 }]);
ok('24 months average by calendar month', two.ok && two.months[6].kwh === 200 && two.covered === 1, two.months && two.months[6]);
ok('a bill without a month is refused', S.billsToMonths([{ kwh: 5 }]).ok === false);
ok('more than 24 bills is refused', S.billsToMonths(new Array(25).fill({ month: '2025-01', kwh: 1 })).ok === false);

/* ── the run ──────────────────────────────────────────────────────────── */
section('Simulation');
var caRes = S.simulate({ zip: '94110', segment: 'residential' });
ok('CA residential runs', caRes.ok, caRes.errors);
ok('its load is labelled assumed and low confidence', caRes.load.source === 'profile' && caRes.confidence === 'low');
ok('a home battery is suggested', caRes.battery.kw === 5 && caRes.battery.kwh === 13.5 && caRes.battery.assumed);
ok('no demand charge on a residential rate is not counted', stream(caRes, 'bill.demand').counted === false);
ok('TOU arbitrage earns on a California TOU rate', stream(caRes, 'bill.tou').usd > 0);
var elrp = stream(caRes, 'ca.elrp'), dsgs = stream(caRes, 'ca.dsgs');
ok('ELRP and DSGS are both priced', elrp && dsgs && elrp.usd > 0 && dsgs.usd > 0);
ok('only ONE of the CA DR group is counted', (elrp.counted ? 1 : 0) + (dsgs.counted ? 1 : 0) === 1);
ok('the one not counted says why', (elrp.counted ? dsgs : elrp).why.indexOf('Same hours') === 0);
ok('CA RA is not open to a residential site', !stream(caRes, 'ca.ra') && caRes.missing.some(function (m) { return m.indexOf('Resource Adequacy') === 0; }));
var T = caRes.totals;
ok('gross = bill savings + grid earnings', T.gross === T.billSavings + T.gridEarnings, T);
ok('owner + platform + installer = gross (±$2 rounding)', Math.abs(T.owner + T.platform + T.installer - T.gross) <= 2, T);
ok('the split is DividendVPP\'s 70/20/10', caRes.split.owner === 0.7 && caRes.split.platform === 0.2 && caRes.split.installer === 0.1);
ok('it says it is a simulation, not their quote', /not a Molecule Systems or Lightsmith quote/.test(caRes.disclaimer) && caRes.provider === 'simulated');
ok('a 24-hour day is drawn', caRes.sampleDay.hours.length === 24);
ok('twelve months are reported', caRes.monthly.length === 12);

var com = S.simulate({ zip: '60601', segment: 'commercial', battery: { kw: 250, kwh: 1000 } });
ok('a commercial ComEd site earns demand savings', com.ok && stream(com, 'bill.demand').usd > 0, com.ok && stream(com, 'bill.demand'));
ok('the battery cycles (it can recharge under the demand target)', com.battery.cyclesPerYear > 20, com.battery.cyclesPerYear);
var cv = stream(com, 'pjm.comedvpp');
ok('ComEd VPP is offered in ComEd territory', !!cv);
ok('an oversized battery is capped at the site load for a load-reduction programme', cv && cv.how.indexOf('Capped at the site') >= 0, cv && cv.how);
ok('ComEd VPP is NOT offered outside ComEd', !stream(S.simulate({ zip: '19103', segment: 'commercial' }), 'pjm.comedvpp'));
var twoHr = S.simulate({ zip: '19103', segment: 'commercial', battery: { kw: 50, kwh: 100 } });
ok('a two-hour PJM battery has no capacity class', twoHr.missing.some(function (m) { return /^PJM capacity/.test(m) && /four hours/.test(m); }), twoHr.missing);
var fourHr = S.simulate({ zip: '19103', segment: 'commercial', battery: { kw: 50, kwh: 250 } });
var pc = stream(fourHr, 'pjm.capacity');
ok('a 4.5-hour PJM battery is priced at the published clearing price', pc && pc.tier === 'published' && pc.usd > 0, pc);

var bills = [];
for (var m = 1; m <= 12; m++) bills.push({ month: '2025-' + (m < 10 ? '0' : '') + m, kwh: 40000, peakKw: 160, cost: 7000 });
var byBills = S.simulate({ zip: '30301', segment: 'commercial', load: { type: 'bills', bills: bills } });
ok('bills with peaks and dollars run at medium confidence', byBills.ok && byBills.confidence === 'medium', byBills.confidence);
ok('the planning rate is calibrated to the dollars', byBills.tariff.calibration && byBills.tariff.calibration.factor > 0);
ok('the modelled bill matches the bills within 2%', Math.abs(byBills.bill.before - 84000) / 84000 < 0.02, byBills.bill.before);
ok('the monthly peaks are the billed peaks', Math.abs(byBills.monthly[6].peakKw - 160) < 1, byBills.monthly[6]);

var own = S.simulate({ zip: '30301', segment: 'commercial', tariff: { onPeakRate: 0.3, offPeakRate: 0.1, demandCharge: 20 } });
ok('the caller\'s own rates are used and labelled', own.ok && own.tariff.source === 'user' && own.tariff.rates.demand === 20);
var urdb = S.simulate({ zip: '30301', segment: 'commercial', tariff: { urdb: { name: 'Test URDB', energyratestructure: [[{ rate: 0.1 }]],
  energyweekdayschedule: new Array(12).fill(new Array(24).fill(0)), flatdemandstructure: [[{ rate: 15 }]], flatdemandmonths: new Array(12).fill(0) } } });
ok('a URDB tariff drives the bill', urdb.ok && urdb.tariff.source === 'urdb' && stream(urdb, 'bill.demand').usd > 0, urdb.errors || urdb.tariff);
ok('flat energy earns no arbitrage beyond losses', urdb.ok && stream(urdb, 'bill.tou').usd <= 0);

var ma = S.simulate({ zip: '02139', segment: 'residential', solarKw: 6 });
ok('MA ConnectedSolutions meters the battery (full rating, no cap)', stream(ma, 'ne.connected').how.indexOf('Capped') < 0);
ok('MA Clean Peak needs solar and gets it', stream(ma, 'ne.cps') && stream(ma, 'ne.cps').usd > 0);
ok('without solar Clean Peak is missing', S.simulate({ zip: '02139', segment: 'residential' }).missing.some(function (x) { return /Clean Peak/.test(x); }));

var tx = S.simulate({ zip: '75201', segment: 'commercial' });
ok('ERCOT 4CP needs an IDR-sized site', !stream(tx, 'ercot.4cp') && tx.missing.some(function (x) { return /4CP/.test(x); }));
var txBig = S.simulate({ zip: '75201', segment: 'industrial', load: { type: 'profile', annualKwh: 6000000 } });
ok('ERCOT 4CP opens above 700 kW', !!stream(txBig, 'ercot.4cp'));

var split = S.simulate({ zip: '94110', segment: 'residential', split: { owner: 0.8, platform: 0.15, installer: 0.05 } });
ok('a custom split is used', split.ok && split.split.owner === 0.8);

section('Validation');
ok('no ZIP → field error', S.simulate({}).errors[0].field === 'zip');
ok('a bad segment is refused', S.simulate({ zip: '94110', segment: 'farm' }).ok === false);
ok('a split that is not 100% is refused', S.simulate({ zip: '94110', split: { owner: 0.5, platform: 0.2, installer: 0.1 } }).ok === false);
ok('more than 12 hours of storage is refused', S.simulate({ zip: '94110', battery: { kw: 1, kwh: 20 } }).ok === false);
ok('a zero-kWh load is refused', S.simulate({ zip: '94110', load: { type: 'interval', values: new Array(8760).fill(0) } }).ok === false);
ok('options expose no rates', JSON.stringify(S.options()).indexOf('perKw') < 0 && JSON.stringify(S.options()).indexOf('0.55') < 0);

/* ── provider seam ────────────────────────────────────────────────────── */
section('Provider');
ok('without env the provider is the simulation only', P.configured() === false && P.describe().live === null);
var req = P.request({}, caRes);
ok('the outbound request names no person or address', JSON.stringify(req).indexOf('@') < 0 && req.site.zip === '94110' && !req.load.text);
ok('readQuote maps a tolerant answer', P.readQuote({ annualEarnings: 812.4, streams: [{ name: 'ELRP', usd: 300 }] }).annualUsd === 812);
ok('readQuote refuses an answer with no total', P.readQuote({ streams: [] }) === null);
later(function () {
  process.env.DIVIDENDVPP_API_URL = 'https://example.invalid/estimate';
  process.env.DIVIDENDVPP_API_KEY = 'k';
  var saved = global.fetch;
  global.fetch = function (u, o) {
    ok('the key goes in the header, never the body', o.headers.Authorization === 'Bearer k' && o.body.indexOf('"k"') < 0);
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ annualEarnings: 900, id: 'q1' }); } });
  };
  return P.estimate({ zip: '94110', segment: 'residential' }).then(function (r) {
    ok('a live quote rides BESIDE the simulation', r.ok && r.provider === 'simulated' && r.providerQuote.ok && r.providerQuote.quote.annualUsd === 900);
    global.fetch = function () { return Promise.reject(new Error('down')); };
    return P.estimate({ zip: '94110', segment: 'residential' });
  }).then(function (r) {
    ok('a provider failure never fails the estimate', r.ok && r.providerQuote.ok === false && /did not answer/.test(r.providerQuote.error));
    global.fetch = saved; delete process.env.DIVIDENDVPP_API_URL; delete process.env.DIVIDENDVPP_API_KEY;
  });
});

/* ── the gate ─────────────────────────────────────────────────────────── */
var SRC = fs.readFileSync(path.join(ROOT, 'api', 'vpp-estimate.js'), 'utf8');
var ORG = 'example-energy.com', BASE = 'omega_orgs/' + ORG, UID = 'u1';
function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
function load(docs, caller) {
  var stub = {
    httpError: httpError,
    verifyIdToken: function (t) {
      if (t !== 'good') return Promise.reject(httpError(401, 'bad token'));
      return Promise.resolve(caller || { uid: UID, email: 'ana@' + ORG, emailVerified: true, orgId: ORG, staff: false, claims: {} });
    },
    readAsCaller: function (t, p) {
      var d = docs[p];
      if (d && d.__throws) return Promise.reject(httpError(d.__throws, 'x'));
      return Promise.resolve(d === undefined ? null : JSON.parse(JSON.stringify(d)));
    }
  };
  var box = { module: { exports: {} }, console: { error: function () {} }, process: process,
    require: function (n) {
      if (/\/verify-token$/.test(n)) return stub;
      if (/\/package-access$/.test(n)) return require(path.join(ROOT, 'api/_lib/package-access'));
      if (/\/vpp-provider$/.test(n)) return P;
      if (/\/vpp-sim$/.test(n)) return S;
      throw new Error('api/vpp-estimate.js required an unstubbed module: ' + n);
    } };
  vm.runInNewContext(SRC, box, { filename: 'api/vpp-estimate.js' });
  return box.module.exports;
}
function call(docs, body, opts) {
  opts = opts || {};
  var out = { status: 0 };
  var res = { setHeader: function () {}, status: function (n) { out.status = n; return res; }, json: function (j) { out.body = j; return res; } };
  return Promise.resolve(load(docs, opts.caller)({ method: opts.method || 'POST',
    headers: { authorization: 'Bearer ' + (opts.token || 'good') }, body: body }, res)).then(function () { return out; });
}
function docs(org, bill, member) {
  var d = {}; if (org !== undefined) d[BASE] = org; if (bill !== undefined) d[BASE + '/billing/current'] = bill;
  if (member !== undefined) d[BASE + '/members/' + UID] = member; return d;
}
var EST = { action: 'estimate', site: { zip: '94110', segment: 'residential' } };
later(function () { section('Gate'); });
[
  ['GET answers with no auth and no numbers', {}, null, { method: 'GET', token: 'none' }, function (r) { return r.status === 200 && r.body.provider && !r.body.result; }],
  ['a bad token is 401', docs(), EST, { token: 'nope' }, function (r) { return r.status === 401; }],
  ['a missing org record is allowed (legacy tenant)', docs(undefined, { tier: 'standard' }), EST, null, function (r) { return r.status === 200 && r.body.result.totals.gross > 0; }],
  ['pending refuses', docs({ status: 'pending' }, { tier: 'standard' }), EST, null, function (r) { return r.status === 403; }],
  ['suspended refuses', docs({ status: 'suspended' }, { tier: 'standard' }), EST, null, function (r) { return r.status === 403; }],
  ['toolOverrides.vppsim false refuses', docs({ status: 'active' }, { tier: 'enterprise', toolOverrides: { vppsim: false } }), EST, null, function (r) { return r.status === 403; }],
  ['a toolAccess allowlist without it refuses', docs({ status: 'active' }, { tier: 'enterprise', toolAccess: ['editor'] }), EST, null, function (r) { return r.status === 403; }],
  ['a toolAccess allowlist with it passes', docs({ status: 'active' }, { tier: 'enterprise', toolAccess: ['vppsim'] }), EST, null, function (r) { return r.status === 200; }],
  ['a member list narrows it', docs({ status: 'active' }, { tier: 'standard' }, { status: 'active', toolAccess: ['proforma'] }), EST, null, function (r) { return r.status === 403; }],
  ['an unknown tier refuses', docs({ status: 'active' }, { tier: 'free' }), EST, null, function (r) { return r.status === 403; }],
  ['an override lifts an unknown tier', docs({ status: 'active' }, { tier: 'free', toolOverrides: { vppsim: true } }), EST, null, function (r) { return r.status === 200; }],
  ['a billing read that throws is 503, never a pass', docs({ status: 'active' }, { __throws: 502 }), EST, null, function (r) { return r.status === 503; }],
  ['staff skip the entitlement', docs({ status: 'suspended' }), EST, { caller: { uid: 's', email: 'x@clearsky-usa.com', emailVerified: true, orgId: 'clearsky-usa.com', staff: true } }, function (r) { return r.status === 200; }],
  ['bad input is 400 with field errors', docs(undefined, { tier: 'standard' }), { action: 'estimate', site: { zip: 'x' } }, null, function (r) { return r.status === 400 && r.body.errors[0].field === 'zip'; }],
  ['an unknown action is 400', docs(undefined, { tier: 'standard' }), { action: 'dump' }, null, function (r) { return r.status === 400; }],
  ['options lists markets', docs(undefined, { tier: 'standard' }), { action: 'options' }, null, function (r) { return r.status === 200 && r.body.options.markets.length >= 10; }]
].forEach(function (c) {
  later(function () {
    return call(c[1], c[2], c[3] || {}).then(function (r) { ok(c[0], c[4](r), { status: r.status, body: r.body && (r.body.error || r.body.errors) }); });
  });
});

later(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
});
