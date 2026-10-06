/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   POST /api/value-stack (api/value-stack.js), offline: the gate, the site
   resolution (ZIP → address → map centre, each labelled), the composition
   (vpp-sim's dispatch, the incentives, the cost fallback, the lifecycle
   IRR) and what must never leave (a rate book, a guessed IRR).

   The handler runs in a vm with verify-token and geocode replaced by stubs
   that record their calls; vpp-sim, value-stack, cost-model and
   package-access are the REAL modules, so a 200 here carries the numbers a
   signed-in tenant gets. An unmapped require fails the run.

   No network, no credentials. Run: node scripts/tests/tvalueapi.js        */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var SRC = fs.readFileSync(path.join(ROOT, 'api', 'value-stack.js'), 'utf8');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
}
function section(t) { console.log('\n' + t); }
function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
function httpError(status, message) { var e = new Error(message); e.status = status; return e; }

var ORG = 'example-energy.com';
var BASE = 'omega_orgs/' + ORG;
var UID = 'u1';
var BILLING = BASE + '/billing/current';
var MEMBER = BASE + '/members/' + UID;

function world(docs, opts) {
  opts = opts || {};
  var w = { reads: [], geocoded: [], reversed: [] };
  w.caller = opts.caller || { uid: UID, email: 'ana@' + ORG, emailVerified: true, orgId: ORG, staff: false, claims: {} };
  w.auth = {
    httpError: httpError,
    verifyIdToken: function (token) {
      if (token !== 'good-token') return Promise.reject(httpError(401, 'token signature does not verify'));
      return Promise.resolve(w.caller);
    },
    readAsCaller: function (token, p) {
      w.reads.push(p);
      var d = docs ? docs[p] : undefined;
      return Promise.resolve(d === undefined ? null : clone(d));
    }
  };
  w.geo = {
    geocode: function (addr) {
      w.geocoded.push(addr);
      return Promise.resolve(opts.geocode === undefined ? null : clone(opts.geocode));
    },
    reverse: function (lat, lng) {
      w.reversed.push([lat, lng]);
      return Promise.resolve(opts.reverse === undefined ? null : clone(opts.reverse));
    }
  };
  return w;
}

function load(w) {
  var box = {
    module: { exports: {} },
    console: { error: function () {}, log: function () {} },
    require: function (n) {
      if (/\/verify-token$/.test(n)) return w.auth;
      if (/\/geocode$/.test(n)) return w.geo;
      if (/\/vpp-sim$/.test(n)) return require(path.join(ROOT, 'api/_lib/vpp-sim'));
      if (/\/value-stack$/.test(n)) return require(path.join(ROOT, 'api/_lib/value-stack'));
      if (/\/cost-model(\.js)?$/.test(n)) return require(path.join(ROOT, 'api/_lib/cost-model.js'));
      if (/\/package-access$/.test(n)) return require(path.join(ROOT, 'api/_lib/package-access'));
      throw new Error('api/value-stack.js required an unstubbed module: ' + n);
    }
  };
  box.exports = box.module.exports;
  vm.runInNewContext(SRC, box, { filename: 'api/value-stack.js' });
  return box.module.exports;
}

function call(handler, req) {
  var out = { status: 0, body: undefined, headers: {} };
  var res = {
    setHeader: function (k, v) { out.headers[k.toLowerCase()] = v; },
    status: function (n) { out.status = n; return res; },
    json: function (j) { out.body = clone(j); return res; }
  };
  return Promise.resolve(handler({
    method: req.method || 'POST',
    headers: req.headers || { authorization: 'Bearer good-token' },
    body: req.body
  }, res)).then(function () { return out; });
}

function post(docs, body, opts) {
  var w = world(docs, opts);
  return call(load(w), { body: body, headers: (opts || {}).headers, method: (opts || {}).method })
    .then(function (r) { r.world = w; return r; });
}

var ACTIVE = { name: 'Example Energy', status: 'active' };
var STANDARD = { tier: 'standard' };
var BAT = { kw: 400, kwh: 800 };
function docsWith(org, billing, member) {
  var d = {};
  if (org !== undefined) d[BASE] = org;
  if (billing !== undefined) d[BILLING] = billing;
  if (member !== undefined) d[MEMBER] = member;
  return d;
}
function est(extra) {
  var b = { action: 'estimate', site: { zip: '60601' }, battery: BAT };
  Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; });
  return b;
}

Promise.resolve()

/* ── the gate ──────────────────────────────────────────────────────────── */
.then(function () {
  section('the gate');
  return post(docsWith(ACTIVE, STANDARD), est(), { headers: {} }).then(function (r) {
    ok('no token is 401', r.status === 401, r.status);
  });
})
.then(function () {
  return post(docsWith({ status: 'suspended' }, STANDARD), est()).then(function (r) {
    ok('a suspended workspace is refused', r.status === 403 && /suspended/.test(r.body.error), r.body);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, { tier: 'standard', toolOverrides: { editor: false } }), est()).then(function (r) {
    ok('toolOverrides.editor false refuses', r.status === 403 && /switched off/.test(r.body.error), r.body);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, { tier: 'deluxe', toolAccess: ['gridatlas'] }), est()).then(function (r) {
    ok('a toolAccess allowlist without the editor refuses', r.status === 403, r.status);
  });
})
.then(function () {
  /* every legacy tenant has no omega_orgs record until the seed runs;
     locking them out is the failure CLAUDE.md warns about by name */
  return post({}, est()).then(function (r) {
    ok('a missing omega_orgs record fails OPEN (legacy tenant)', r.status === 200, r.status + ' ' + JSON.stringify(r.body && r.body.error || r.body && r.body.errors));
  });
})

/* ── the drawn system is the subject ───────────────────────────────────── */
.then(function () {
  section('the drawn system');
  return post(docsWith(ACTIVE, STANDARD), { action: 'estimate', site: { zip: '60601' } }).then(function (r) {
    ok('no battery is a 400 that says to draw one', r.status === 400 &&
      /battery on the site map/i.test(r.body.errors[0].message), r.body);
  });
})

/* ── where the site is, three ways, each labelled ──────────────────────── */
.then(function () {
  section('site resolution');
  return post(docsWith(ACTIVE, STANDARD), est()).then(function (r) {
    ok('a given ZIP answers without any geocoding', r.status === 200 &&
      r.body.result.resolved.how === 'given' && r.world.geocoded.length === 0 && r.world.reversed.length === 0,
      r.status === 200 ? r.body.result.resolved : r.body);
    if (r.status !== 200) return;
    var R = r.body.result;
    ok('the market is resolved (ComEd / PJM for 60601)', R.site.market === 'PJM', R.site);
    ok('streams carry a working and a source each', R.streams.length > 0 && R.streams.every(function (s) {
      return s.how && (s.ref || !s.counted);
    }), R.streams.length);
    ok('the totals separate gross from what the owner keeps',
      R.totals.gross >= R.totals.owner && R.totals.owner > 0, R.totals);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD),
    est({ site: { address: '123 W Monroe St, Chicago, IL 60603' } })).then(function (r) {
    ok('a ZIP inside the address answers without geocoding', r.status === 200 &&
      r.body.result.resolved.how === 'address' && r.world.geocoded.length === 0, r.body.result && r.body.result.resolved);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD),
    est({ site: { address: 'Honda of Downtown LA, Los Angeles' } }),
    { geocode: { lat: 34.04, lng: -118.26, matched: '1234 S FIGUEROA ST, LOS ANGELES, CA, 90015', source: 'census' } })
  .then(function (r) {
    ok('an address without a ZIP is geocoded and says so', r.status === 200 &&
      r.body.result.resolved.how === 'geocoded' && r.world.geocoded.length === 1 &&
      r.body.result.resolved.zip === '90015' && r.body.result.site.market === 'CAISO',
      r.body.result ? r.body.result.resolved : r.body);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD),
    est({ site: { lat: 41.88, lng: -87.63 } }),
    { reverse: { state: 'IL', zip: '60601', county: 'Cook County' } })
  .then(function (r) {
    ok('the bare map centre reverse-geocodes and is labelled as such', r.status === 200 &&
      r.body.result.resolved.how === 'map' && /ZCTA|map/i.test(r.body.result.resolved.label),
      r.body.result ? r.body.result.resolved : r.body);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), est({ site: { lat: 41.88, lng: -87.63 } }), { reverse: null })
  .then(function (r) {
    ok('a point that resolves nowhere asks for the ZIP instead of guessing', r.status === 400 &&
      /ZIP/.test(r.body.errors[0].message), r.body);
  });
})

/* ── the cost, the incentives and the IRR ──────────────────────────────── */
.then(function () {
  section('cost, incentives, IRR');
  return post(docsWith(ACTIVE, STANDARD),
    est({ cost: { capexUsd: 1200000 } })).then(function (r) {
    if (r.status !== 200) { ok('a priced run returns 200', false, r.body); return; }
    var R = r.body.result;
    ok('the run\'s own cost is used and named', R.cost.capexUsd === 1200000 && R.cost.source === 'site-map', R.cost);
    ok('ComEd territory gets ComEd\'s rebate with the 2026 conditions (SDVPP, not Rate BESH)',
      R.incentives.items.some(function (x) {
        return x.id === 'comed.dg.storage' && /SDVPP/.test(x.conditions || '') && !/Rate BESH/.test(x.conditions || '');
      }),
      R.incentives.items.map(function (x) { return x.id; }));
    ok('the ITC is there at the base rate', R.incentives.items.some(function (x) {
      return x.id === 'itc' && Math.round(x.usd) === Math.round(1200000 * 0.30);
    }), R.incentives.items);
    ok('the lifecycle ran: IRR, NPV, payback and 21 rows', R.lifecycle && R.lifecycle.ok &&
      R.lifecycle.rows.length === 21 && 'irr' in R.lifecycle && 'paybackYears' in R.lifecycle, R.lifecycle && R.lifecycle.ok);
    ok('net cost is capex minus incentives, floored at zero',
      R.netCostUsd === Math.max(0, 1200000 - R.incentives.total), { net: R.netCostUsd, inc: R.incentives.total });
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), est({ site: { zip: '78701' }, cost: { capexUsd: 1200000 } }))
  .then(function (r) {
    var R = r.status === 200 && r.body.result;
    ok('a territory with no programme gets the ITC alone, and SAYS so',
      R && !R.incentives.items.some(function (x) { return x.id !== 'itc'; })
        && /no one-time utility or state storage incentive/i.test(R.incentives.note || ''),
      R ? { items: R.incentives.items.map(function (x) { return x.id; }), note: R.incentives.note } : r.body);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), est({ site: { zip: '90015' }, cost: { capexUsd: 1200000 } }))
  .then(function (r) {
    var R = r.status === 200 && r.body.result;
    var sgip = R && R.incentives.items.filter(function (x) { return x.id === 'ca.sgip.storage'; })[0];
    ok('California gets SGIP at the ITC-adjusted rate ($180/kWh × 800 kWh)',
      sgip && Math.round(sgip.usd) === 180 * 800 && /selfgenca|CPUC/i.test(sgip.ref || ''),
      sgip || (R && R.incentives.items));
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), est({ site: { zip: '10001' }, cost: { capexUsd: 1200000 } }))
  .then(function (r) {
    var R = r.status === 200 && r.body.result;
    var ny = R && R.incentives.items.filter(function (x) { return x.id === 'ny.nyserda.retail'; })[0];
    ok('New York City gets NYSERDA at the NYC block rate ($75/kWh)',
      ny && Math.round(ny.usd) === 75 * 800, ny || (R && R.incentives.items));
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), est({ finance: { rebatePerKwh: 0 }, cost: { capexUsd: 1200000 } }))
  .then(function (r) {
    var R = r.status === 200 && r.body.result;
    ok('rebatePerKwh 0 turns the whole book off, even in ComEd',
      R && !R.incentives.items.some(function (x) { return x.id !== 'itc'; }),
      R ? R.incentives.items : r.body);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), est()).then(function (r) {
    var R = r.status === 200 && r.body.result;
    ok('no priced run falls back to the model and SAYS so', R && R.cost.source === 'model' &&
      R.cost.capexUsd > 0 && /generic/i.test(R.cost.note), R && R.cost);
    ok('the fallback still carries an IRR (against the model cost)', R && R.lifecycle && R.lifecycle.ok, R && R.lifecycle);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), est({ tariff: { demandCharge: 23.5 } })).then(function (r) {
    var R = r.status === 200 && r.body.result;
    ok('an imported bill\'s demand charge replaces the planning rate', R &&
      R.tariff.rates && R.tariff.rates.demand === 23.5 && /your rates/i.test(R.tariff.label), R && R.tariff);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), est({ split: { owner: 0.8, platform: 0.15, installer: 0.05 } }))
  .then(function (r) {
    var R = r.status === 200 && r.body.result;
    ok('the revenue split is the caller\'s when one is sent', R && R.split.owner === 0.8, R && R.split);
  });
})

/* ── bankability: the investor's case ──────────────────────────────────── */
.then(function () {
  section('bankability');
  return post(docsWith(ACTIVE, STANDARD), est({
    site: { zip: '60601', segment: 'industrial' },
    load: { type: 'profile', annualKwh: 2400000 },
    cost: { capexUsd: 455000 }
  })).then(function (r) {
    var R = r.status === 200 && r.body.result;
    if (!R) { ok('the ComEd case returns 200', false, r.body); return; }
    var B = R.bankability;
    ok('every counted stream is in the ladder with a counterparty',
      B && B.rows.length > 0 && B.rows.every(function (x) { return x.paidBy && x.vehicle && x.tenor; }),
      B && B.rows);
    var vpp = B.rows.filter(function (x) { return x.id === 'pjm.comedvpp'; })[0];
    ok('the ComEd Rider VPP planning rate is flagged, not underwritten',
      !vpp || (/not underwriteable/.test(vpp.note || '') &&
        B.totals.underwriteableYr < B.totals.totalYr), vpp);
    ok('the bankable lifecycle ran beside the all-in one',
      B.lifecycle && (B.lifecycle.ok === true || B.lifecycle.ok === false), B.lifecycle);
    if (B.lifecycle && B.lifecycle.ok && R.lifecycle && R.lifecycle.ok && B.totals.planningYr > 0) {
      ok('dropping planning streams moves the IRR (same cost, same incentives)',
        B.lifecycle.irr !== R.lifecycle.irr,
        { all: R.lifecycle.irr, bankable: B.lifecycle.irr });
    }
    ok('the paperwork that makes it bankable travels with the answer',
      B.contracts && B.contracts.length >= 3 && /shared-savings/i.test(B.contracts.join(' ')), B.contracts);
  });
})

/* ── the shape of what leaves ──────────────────────────────────────────── */
.then(function () {
  section('what leaves');
  return post(docsWith(ACTIVE, STANDARD), est({ cost: { capexUsd: 1200000 } })).then(function (r) {
    var R = r.status === 200 && r.body.result;
    var text = JSON.stringify(R);
    ok('no rate book leaves: the response carries streams, not tables',
      R && text.indexOf('RATE_BOOK') < 0 && text.indexOf('perKwYearNyc') < 0, undefined);
    ok('the disclaimer and confidence travel with the numbers', R && R.disclaimer && R.confidence, undefined);
    ok('the answer is private and uncached', r.headers['cache-control'] === 'private, no-store', r.headers);
  });
})
.then(function () {
  var w = world(docsWith(ACTIVE, STANDARD));
  return call(load(w), { method: 'GET', headers: {} }).then(function (r) {
    ok('GET answers deployed/version with no auth and no numbers', r.status === 200 &&
      r.body.ok === true && !r.body.result, r.body);
  });
})
.then(function () {
  return post(docsWith(ACTIVE, STANDARD), { action: 'whatever' }).then(function (r) {
    ok('an unknown action is refused by name', r.status === 400 && /action/.test(r.body.error), r.body);
  });
})

.then(function () {
  console.log('\n' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
  process.exit(fail ? 1 : 0);
}, function (e) {
  console.error('test run failed:', e && e.stack || e);
  process.exit(1);
});
