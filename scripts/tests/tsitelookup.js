/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/_lib/site-lookup.js, offline: the pro forma's "Site facts" — state
   tax, energy community, low income, PVWatts, URDB — for one address.

   Every upstream answer here is a response recorded live on 2026-09-24 and
   trimmed (scripts/tests/fixtures/site-lookup/, each file says how it was
   captured; the few that could not be captured say so). A fake fetch serves
   them, so this runs with no network, no keys and no npm install.

   What it holds the lookup to:
   - each source fails on its own: a hit, a miss, a timeout, a 403, a 429 and
     an unreadable body each land in that source's errors entry, and the
     others still answer;
   - a failure is 'unknown', never 'no';
   - the key order (server env, then the user's, then DEMO_KEY), and that no
     key ever reaches a URL or the result — even when an upstream echoes it;
   - the address validator, and one lookup per request;
   - the shared quota: no lookup without a caller, ten a minute per person
     and thirty an hour per workspace on sliding windows, a refusal charged
     to nobody, and an identical lookup answered from a per-workspace cache
     that keeps only complete answers — all on a fake clock;
   - the bundled Treasury tables, including Connecticut's planning regions;
   - the table builder's spreadsheet reader, on a workbook built here.

   Run: node scripts/tests/tsitelookup.js
*/
'use strict';
var fs = require('fs'), path = require('path'), zlib = require('zlib');
var ROOT = path.join(__dirname, '..', '..');
var LIB = path.join(ROOT, 'api', '_lib', 'site-lookup.js');
var S = require(LIB);
var engine = require(path.join(ROOT, 'api', '_lib', 'proforma-engine'));
var BUILD = require(path.join(ROOT, 'scripts', 'build-energy-communities.js'));
var FIX = path.join(__dirname, 'fixtures', 'site-lookup');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
}
function eq(name, got, want) { ok(name, got === want, got); }
function section(t) { console.log('\n' + t); }
function fixture(name) { return JSON.parse(fs.readFileSync(path.join(FIX, name + '.json'), 'utf8')); }

/* 2026-09-24, the day the fixtures were recorded: staleness is judged
   against the date the tariffs were current, not the day CI runs. */
var NOW = Date.UTC(2026, 8, 24, 12);
/* Short timeouts so a hung upstream costs milliseconds, with enough gap
   between "parallel" (one timeout) and "sequential" (two) that a busy CI
   runner cannot blur them. */
var FAST = { geocodeMs: 150, geocodeBudgetMs: 400, lookupMs: 300, retryFloorMs: 60 };
var NO_ENV = {};

/* ── the fake network ────────────────────────────────────────────────────── */

/* route(url, init) → a fixture name, a fixture object, or one of
   { hang:true } (honours the abort signal), { deaf:true } (ignores it and
   never settles) or { throws:true } (a DNS/socket failure). */
function net(route) {
  var n = { calls: [] };
  n.fetch = function (url, init) {
    n.calls.push({ url: url, headers: (init && init.headers) || {} });
    var r = route(url, init, n.calls.length);
    if (typeof r === 'string') r = fixture(r);
    if (r.hang) {
      return new Promise(function (resolve, reject) {
        if (init && init.signal) init.signal.addEventListener('abort', function () {
          var e = new Error('aborted'); e.name = 'AbortError'; reject(e);
        });
      });
    }
    if (r.deaf) return new Promise(function () {});
    if (r.throws) return Promise.reject(new TypeError('fetch failed'));
    var body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    var headers = r.headers || {};
    return Promise.resolve({ status: r.status, headers: { get: function (k) { return headers[k.toLowerCase()] || null; } },
      text: function () { return Promise.resolve(body); } });
  };
  n.to = function (re) { return n.calls.filter(function (c) { return re.test(c.url); }); };
  return n;
}
function isCensus(u) { return /geocoding\.geo\.census\.gov/.test(u); }
function isPv(u) { return /developer\.nlr\.gov\/api\/pvwatts\/v8\.json/.test(u); }
function isUrdb(u) { return /api\.openei\.org\/utility_rates/.test(u); }

/* The usual world for one address: its geocode, PVWatts and LADWP. */
function world(census, pv, urdb) {
  return net(function (u) {
    if (isCensus(u)) return census || 'census-canoga-park-ca';
    if (isPv(u)) return pv || 'pvwatts-canoga-park-250kw';
    if (isUrdb(u)) return urdb || 'urdb-ladwp-canoga-park';
    throw new Error('unexpected URL ' + u);
  });
}
/* Each run is its own caller with its own guard, so one case's answer is
   never another's cache hit; the quota section shares a guard on purpose. */
var WHO = { orgId: 'example-energy.com', uid: 'u-1' };
function run(body, n, extra) {
  var o = { fetch: n.fetch, env: NO_ENV, now: NOW, timeouts: FAST, who: WHO, guard: S.createGuard() }, k;
  for (k in (extra || {})) o[k] = extra[k];
  return S.lookup(body, o);
}

var CANOGA = { street: '22125 Roscoe Blvd', city: 'Canoga Park', state: 'CA', zip: '91304' };
var LOGAN = { street: '300 Stratton St', city: 'Logan', state: 'WV', zip: '25601' };
var HARTFORD = { street: '165 Capitol Ave', city: 'Hartford', state: 'CT', zip: '06106' };
function body(addr, more) {
  var b = { address: addr }, k;
  for (k in (more || {})) b[k] = more[k];
  return b;
}

/* ── tests ───────────────────────────────────────────────────────────────── */

function validation() {
  section('The address validator');
  var v = S.validate;
  ok('a full address passes', v(body(CANOGA)).ok === true);
  eq('...into one line for the geocoder', v(body(CANOGA)).request.oneLine, '22125 Roscoe Blvd, Canoga Park, CA 91304');
  ok('ZIP is optional', v(body({ street: '22125 Roscoe Blvd', city: 'Canoga Park', state: 'CA' })).ok === true);
  eq('state is upper-cased', v(body({ street: '1 Main St', city: 'Austin', state: 'tx' })).request.address.state, 'TX');
  eq('whitespace is collapsed', v(body({ street: '  1   Main  St ', city: ' Austin ', state: 'TX' })).request.address.street, '1 Main St');
  ok('accents, apostrophes, # and / are an address', v(body({ street: '12 Rue d’Orléans #4/B', city: "Coeur d'Alene", state: 'ID' })).ok === true);
  ok('a ZIP+4 passes', v(body({ street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701-1234' })).ok === true);
  ok('a territory passes', v(body({ street: '1 Calle Luna', city: 'San Juan', state: 'PR' })).ok === true);
  [
    [null, 'address', 'no body'],
    [{}, 'address', 'no address'],
    [{ address: 'one line' }, 'address', 'a string address'],
    [body({ city: 'Austin', state: 'TX' }), 'address.street', 'no street'],
    [body({ street: '1 Main St', state: 'TX' }), 'address.city', 'no city'],
    [body({ street: '1 Main St', city: 'Austin' }), 'address.state', 'no state'],
    [body({ street: '1 Main St', city: 'Austin', state: 'Texas' }), 'address.state', 'a state name'],
    [body({ street: '1 Main St', city: 'Austin', state: 'ZZ' }), 'address.state', 'an unknown code'],
    [body({ street: '1 Main St', city: 'Austin', state: 'TX', zip: '787' }), 'address.zip', 'a short ZIP'],
    [body({ street: '1 Main St', city: 'Austin', state: 'TX', zip: { z: 1 } }), 'address.zip', 'an object ZIP'],
    [body({ street: '1 Main St<script>', city: 'Austin', state: 'TX' }), 'address.street', 'markup in the street'],
    [body({ street: '1 Main St; 2 Elm St', city: 'Austin', state: 'TX' }), 'address.street', 'a second address after ;'],
    [body({ street: '1 Main St\n2 Elm St', city: 'Austin', state: 'TX' }), 'address.street', 'a second address on a new line'],
    [body({ street: '1 "Main" St', city: 'Austin', state: 'TX' }), 'address.street', 'double quotes'],
    [body({ street: new Array(102).join('a'), city: 'Austin', state: 'TX' }), 'address.street', 'a 101-character street'],
    [body({ street: '1 Main St', city: new Array(62).join('a'), state: 'TX' }), 'address.city', 'a 61-character city'],
    [body({ street: '...', city: 'Austin', state: 'TX' }), 'address.street', 'punctuation only'],
    [body({ street: 12, city: 'Austin', state: 'TX' }), 'address.street', 'a number for a street'],
    [{ address: [CANOGA, LOGAN] }, 'address', 'an array of addresses'],
    [{ address: CANOGA, addresses: [LOGAN] }, 'address', 'an addresses list beside one address'],
    [body(CANOGA, { solar: { kwDc: 0 } }), 'solar.kwDc', 'a zero-kW array'],
    [body(CANOGA, { solar: { kwDc: -5 } }), 'solar.kwDc', 'a negative array'],
    [body(CANOGA, { solar: { kwDc: '250' } }), 'solar.kwDc', 'kW as a string'],
    [body(CANOGA, { solar: { kwDc: 600000 } }), 'solar.kwDc', 'over PVWatts\' 500 MW'],
    [body(CANOGA, { solar: { kwDc: NaN } }), 'solar.kwDc', 'NaN kW'],
    [body(CANOGA, { solar: { tilt: 91 } }), 'solar.tilt', 'tilt over 90'],
    [body(CANOGA, { solar: { azimuth: 360 } }), 'solar.azimuth', 'azimuth 360'],
    [body(CANOGA, { solar: 'yes' }), 'solar', 'solar as a string']
  ].forEach(function (c) {
    var r = v(c[0]);
    ok('refused: ' + c[2], r.ok === false && r.field === c[1] && typeof r.error === 'string' && r.error.length > 0, r);
  });
  var many = v({ address: [CANOGA, LOGAN] });
  ok('a list is refused as one-per-request', /one address/i.test(many.error), many.error);
  ok('the refusal never echoes the input back', !/script/.test(JSON.stringify(v(body({ street: '1<script>', city: 'A', state: 'TX' })))));
  eq('solar:false skips production', v(body(CANOGA, { solar: false })).request.solar, false);
  var d = v(body(CANOGA)).request.solar;
  ok('no solar: 1 kW DC at 10° south, flagged per kW', d.kwDc === 1 && d.perKw === true && d.tilt === 10 && d.azimuth === 180, d);
  var k = v(body(CANOGA, { keys: { nrel: 'short', urdb: 'has spaces in it' } })).request;
  eq('malformed user keys are set aside', JSON.stringify(k.keys), '{}');
  eq('...each with a warning', k.keyWarnings.length, 2);
  ok('...that does not repeat the key', !/short|has spaces/.test(k.keyWarnings.join(' ')), k.keyWarnings);
}

function keysPure() {
  section('Key precedence (pure)');
  var p = S._pure.pickKey;
  var user = { nrel: 'USERnrel0123456789abcdef', urdb: 'USERurdb0123456789abcdef' };
  eq('env NREL_API_KEY beats the user\'s', p('nrel', { NREL_API_KEY: 'ENVnrel0123456789' }, user).used, 'env');
  eq('...and is the key sent', p('nrel', { NREL_API_KEY: 'ENVnrel0123456789' }, user).key, 'ENVnrel0123456789');
  eq('NLR_API_KEY (the lab\'s new name) counts as env', p('nrel', { NLR_API_KEY: 'ENVnlr0123456789' }, user).used, 'env');
  eq('env OPENEI_API_KEY beats the user\'s', p('urdb', { OPENEI_API_KEY: 'ENVoei0123456789' }, user).used, 'env');
  eq('an NREL env key is not used for OpenEI', p('urdb', { NREL_API_KEY: 'ENVnrel0123456789' }, user).used, 'user');
  eq('no env: the user\'s', p('nrel', {}, user).key, user.nrel);
  eq('a blank env var is no env var', p('nrel', { NREL_API_KEY: '  ' }, user).used, 'user');
  var dm = p('urdb', {}, {});
  ok('neither: DEMO_KEY, reported as demo', dm.key === 'DEMO_KEY' && dm.used === 'demo', dm);
}

function tablesPure() {
  section('Energy community and low income from the bundled tables (pure)');
  var ec = S._pure.energyCommunity, li = S._pure.lowIncome;

  var la = ec({ countyFips: '06037', tractGeoid: '06037113232' });
  eq('Los Angeles County: statistical area', la.status, 'yes');
  eq('...one category', la.categories.length, 1);
  eq('...of the statistical-area kind', la.categories[0].kind, 'statistical-area');
  eq('...for the 2026 list', la.categories[0].year, 2026);
  eq('...effective 2026-06-10', la.categories[0].effective, '2026-06-10');
  ok('...labelled with the area and the rates', /Los Angeles-Long Beach-Anaheim, CA/.test(la.categories[0].label) &&
    /2025 unemployment 5\.28% against 4\.28%/.test(la.categories[0].label), la.categories[0].label);
  eq('asOf names the notice', la.asOf.notice, 'IRS Notice 2026-39');
  ok('asOf carries the data vintage', /2025 unemployment/.test(la.asOf.dataVintage), la.asOf);
  ok('asOf carries the build date', /^\d{4}-\d{2}-\d{2}$/.test(la.asOf.builtAt), la.asOf.builtAt);
  ok('the note says brownfields cannot be mapped', /brownfield/i.test(la.note) && /cannot be mapped/.test(la.note), la.note);
  ok('...and that the list is re-issued each June', /every June/.test(la.note), la.note);

  var wv = ec({ countyFips: '54045', tractGeoid: '54045956900' });
  eq('Logan WV: both categories', wv.categories.map(function (c) { return c.kind; }).join(','), 'statistical-area,coal-closure');
  var coal = wv.categories[1];
  eq('...coal: eligible since 2023-01-01', coal.since, '2023-01-01');
  eq('...coal: year 2023', coal.year, 2023);
  ok('...coal: labelled with the tract type', /directly adjoining tract/.test(coal.label) && /Jan\. 1, 2023/.test(coal.label), coal.label);

  /* Kemmerer WY: a coal tract that the stale DOE layer misses. */
  var wy = ec({ countyFips: '56023', tractGeoid: '56023978400' });
  eq('Kemmerer WY: coal closure only (the tract DOE\'s 2024 layer misses)', wy.status + ':' + wy.categories.map(function (c) { return c.kind; }).join(), 'yes:coal-closure');
  var later = ec({ countyFips: '01009', tractGeoid: '01009050105' });
  eq('a tract added by Notice 2024-48 carries its own date', later.categories[later.categories.length - 1].since, '2024-06-07');

  var fl = ec({ countyFips: '12011', tractGeoid: '12011090900' });
  eq('Broward FL: not an energy community', fl.status, 'no');
  eq('...no categories', fl.categories.length, 0);
  ok('...and still says a brownfield is not ruled out', /brownfield/i.test(fl.note), fl.note);

  var v1only = ec({ countyFips: '21059', tractGeoid: '21059000100' });
  ok('a vintage-1-only county says which delineation', /vintage 1/.test(v1only.categories[0].label) && v1only.categories[0].vintages.join() === '1', v1only.categories[0]);
  eq('...and uses that vintage\'s rate', v1only.categories[0].unemploymentPct, 4.31);
  var v2only = ec({ countyFips: '12075', tractGeoid: '12075970100' });
  ok('a vintage-2-only county uses the vintage-2 area', /Gainesville, FL/.test(v2only.categories[0].label) && v2only.categories[0].unemploymentPct === 4.5, v2only.categories[0]);

  eq('no location: unknown, never no', ec(null).status, 'unknown');
  eq('no county from the geocoder: unknown', ec({ countyFips: null, tractGeoid: '12011090900' }).status, 'unknown');
  eq('no tract from the geocoder: unknown', ec({ countyFips: '12011', tractGeoid: null }).status, 'unknown');
  eq('...unless the county already qualifies', ec({ countyFips: '06037', tractGeoid: null }).status, 'yes');
  /* Hartford: Notice 2026-39 lists no Connecticut planning region, so a
     vintage-1 miss on the 2020 county is a complete answer. */
  eq('Hartford CT (2020 county 09003): no', ec({ countyFips: '09003', tractGeoid: '09003502100' }).status, 'no');

  var logan = li({ tractGeoid: '54045956900' });
  eq('Logan WV tract: Category 1 low-income', logan.status, 'yes');
  eq('...100% of the tract', logan.tractPct, 100);
  ok('...screening only, allocation required, storage not eligible',
    /Screening only/.test(logan.note) && /allocation/.test(logan.note) && /storage is not eligible/.test(logan.note), logan.note);
  eq('Canoga Park tract: not low-income', li({ tractGeoid: '06037113232' }).status, 'no');
  var part = li({ tractGeoid: '01033020706' });
  eq('a tract only partly in a Category 1 area: unknown', part.status, 'unknown');
  eq('...with its share', part.tractPct, 0.01);
  ok('...and the program map to check', /experience\.arcgis\.com/.test(part.note), part.note);
  var ct = li({ tractGeoid: '09001400101' });
  eq('a Connecticut 2020 tract maps to its planning-region GEOID', ct.tract, '09110400101');
  eq('...and reads its Category 1 status there', ct.status, 'yes');
  var hart = li({ tractGeoid: '09003502100' });
  eq('Hartford 09003502100 → 09110502100', hart.tract, '09110502100');
  eq('...not low-income', hart.status, 'no');
  eq('a Connecticut tract with no 2025 match: unknown', li({ tractGeoid: '09003999999' }).status, 'unknown');
  eq('no tract: unknown', li({ tractGeoid: null }).status, 'unknown');
  eq('no location: unknown', li(null).status, 'unknown');

  var tx = S._pure.tax;
  var ca = tx('CA');
  ok('CA tax is the engine\'s 8.84%', ca.statePct === engine.STATE_TAX.CA && ca.statePct === 8.84, ca);
  eq('...federal 21%', ca.federalPct, 21);
  eq('...combined with state deductible', ca.combinedPct, 27.9836);
  eq('...source named', ca.source, '2026 state corporate rates (engine table)');
  eq('Texas: 0% state', tx('TX').combinedPct, 21);
  var pr = tx('PR');
  ok('a territory: no rate on file, null not 0', pr.statePct === null && pr.combinedPct === null, pr);

  var sr = S._pure.summarizeRate;
  var fpl = sr(fixture('urdb-fpl-hollywood').body.items[0]);
  ok('FPL GSD-1: facility demand only, rate + adj', fpl.hasDemand && fpl.demandChargeMaxPerKw === null && fpl.facilityChargeMaxPerKw === 15.03, fpl);
  var sce = sr(fixture('urdb-sce-torrance').body.items[0]);
  ok('SCE TOU-GS-3: TOU demand max 37.26, facility 23.27', sce.demandChargeMaxPerKw === 37.26 && sce.facilityChargeMaxPerKw === 23.27, sce);
  eq('...its tariff sheet URL', sce.url, 'https://apps.openei.org/IURDB/rate/view/674f726eee1ae368ed02c31a');
  /* A TOU period that no schedule uses is not a charge. */
  var unused = sr({ label: 'x', name: 'Unused period', demandratestructure: [[{ rate: 5 }], [{ rate: 99 }]],
    demandweekdayschedule: [[0, 0, 0]], demandweekendschedule: [[0, 0]] });
  eq('an unscheduled 99 $/kW period is ignored', unused.demandChargeMaxPerKw, 5);
  var noSched = sr({ name: 'No schedule', demandratestructure: [[{ rate: 5 }], [{ rate: 7, adj: 1 }]] });
  eq('with no schedule every period counts', noSched.demandChargeMaxPerKw, 8);
  eq('a label that is not a URDB id gives no link', noSched.url, '');
  var none = sr({ name: 'Energy only', energyratestructure: [[{ rate: 0.1 }]] });
  eq('an energy-only rate has no demand', none.hasDemand, false);
  var junk = sr({ name: 'Junk', demandratestructure: 'nope', flatdemandstructure: [[{ rate: 'x' }], null] });
  eq('malformed structures read as no demand, not a crash', junk.hasDemand, false);
}

function lookups() {
  var n;
  return Promise.resolve()

  .then(function () {
    section('Canoga Park, CA: every source answers');
    n = world();
    return run(body(CANOGA, { solar: { kwDc: 250 } }), n);
  })
  .then(function (r) {
    eq('ok:true', r.ok, true);
    eq('exactly the contract\'s blocks', Object.keys(r).sort().join(','), 'energyCommunity,errors,geo,lowIncome,ok,solar,tax,utility,warnings');
    eq('no errors', JSON.stringify(r.errors), '{}');
    ok('geo: the matched point', Math.abs(r.geo.lat - 34.219674602002) < 1e-9 && Math.abs(r.geo.lon + 118.60876064565) < 1e-9, r.geo);
    eq('geo: 2020 county', r.geo.countyFips, '06037');
    eq('geo: 2020 tract', r.geo.tractGeoid, '06037113232');
    eq('geo: state', r.geo.state, 'CA');
    ok('geo: source names the Census geocoder', /Census Geocoder/.test(r.geo.source), r.geo.source);
    eq('tax: CA', r.tax.statePct, 8.84);
    eq('energy community: yes', r.energyCommunity.status, 'yes');
    eq('low income: no', r.lowIncome.status, 'no');
    eq('solar: kWh/yr for 250 kW DC', r.solar.kwhAnnual, 407042);
    eq('solar: per kW DC', r.solar.kwhPerKwDc, 1628.2);
    eq('solar: twelve months', r.solar.monthly.length, 12);
    eq('solar: months sum to the year (±12 kWh rounding)', Math.abs(r.solar.monthly.reduce(function (a, b) { return a + b; }, 0) - 407042) <= 12, true);
    eq('solar: source', r.solar.source, 'NREL PVWatts v8');
    eq('solar: sized as asked', r.solar.kwDc, 250);
    eq('solar: not a per-kW figure', r.solar.perOneKw, false);
    eq('solar: rooftop tilt 10', r.solar.params.tilt, 10);
    eq('solar: demo key reported', r.solar.keyUsed, 'demo');
    eq('solar: station 1.5 km away', r.solar.station.distanceKm, 1.5);
    eq('utility: LADWP', r.utility.name, 'Los Angeles Department of Water & Power');
    eq('utility: EIA id', r.utility.eiaId, 11208);
    eq('utility: no invented average price', r.utility.avgCommercialRate, null);
    eq('utility: five rates shown', r.utility.rates.length, 5);
    eq('utility: of the fourteen current', r.utility.ratesFound, 14);
    ok('utility: every rate shown has a demand charge', r.utility.rates.every(function (x) { return x.hasDemand; }));
    ok('utility: every rate links to its URDB page', r.utility.rates.every(function (x) { return /^https:\/\/apps\.openei\.org\/IURDB\/rate\/view\/[0-9a-f]{24}$/.test(x.url); }), r.utility.rates);
    ok('utility: contract fields on every rate', r.utility.rates.every(function (x) { return 'label' in x && 'name' in x && 'hasDemand' in x && 'url' in x; }));
    ok('utility: no sort keys leak out', r.utility.rates.every(function (x) { return !('_start' in x) && !('_demand' in x); }));
    eq('utility: newest start', r.utility.newestStart, '2026-04-01');
    eq('utility: demo key reported', r.utility.keyUsed, 'demo');
    ok('warnings: the demo key, once per service', r.warnings.filter(function (w) { return /demo key/.test(w); }).length === 2, r.warnings);
    ok('nothing unrenderable in the result', !/NaN|Infinity|undefined/.test(JSON.stringify(r)));

    var g = n.to(/census/)[0].url;
    ok('geocoder asked for the 2020 vintage', /vintage=Census2020_Current/.test(g), g);
    ok('...on the current benchmark', /benchmark=Public_AR_Current/.test(g), g);
    ok('...for tracts, counties and states only', /layers=Census%20Tracts%2CCounties%2CStates/.test(g), g);
    var pv = n.to(/pvwatts/)[0];
    ok('PVWatts on developer.nlr.gov, v8', /^https:\/\/developer\.nlr\.gov\/api\/pvwatts\/v8\.json\?/.test(pv.url), pv.url);
    ok('...with the rooftop defaults, exactly the request verified live', /\?system_capacity=250&module_type=1&losses=14&array_type=1&tilt=10&azimuth=180&dc_ac_ratio=1\.2&inv_eff=96&lat=34\.219675&lon=-118\.608761&timeframe=monthly$/.test(pv.url), pv.url);
    ok('...monthly', /timeframe=monthly/.test(pv.url));
    eq('...key in the X-Api-Key header', pv.headers['X-Api-Key'], 'DEMO_KEY');
    ok('...and not in the URL', !/api_key|DEMO_KEY/.test(pv.url), pv.url);
    var u = n.to(/openei/)[0];
    ok('URDB v8, full detail, commercial, approved', /version=8/.test(u.url) && /detail=full/.test(u.url) && /sector=Commercial/.test(u.url) && /approved=true/.test(u.url), u.url);
    ok('...effective today', new RegExp('effective_on_date=' + Math.floor(NOW / 1000) + '(&|$)').test(u.url), u.url);
    ok('...newest first', /orderby=startdate&direction=desc/.test(u.url), u.url);
    ok('...key in the header, not the URL', u.headers['X-Api-Key'] === 'DEMO_KEY' && !/api_key|DEMO_KEY/.test(u.url), u);
    eq('three requests in all', n.calls.length, 3);
  })

  .then(function () {
    section('Logan, WV: both energy-community categories and a low-income tract');
    return run(body(LOGAN), world('census-logan-wv'));
  })
  .then(function (r) {
    eq('energy community: yes', r.energyCommunity.status, 'yes');
    eq('...statistical area and coal closure', r.energyCommunity.categories.map(function (c) { return c.kind; }).join(), 'statistical-area,coal-closure');
    eq('low income: yes', r.lowIncome.status, 'yes');
    eq('tax: WV 6.5%', r.tax.statePct, 6.5);
    eq('no solar size asked: 1 kW DC', r.solar.kwDc, 1);
    eq('...marked as a per-kW figure', r.solar.perOneKw, true);
  })

  .then(function () {
    section('Hartford, CT: 2020 geography, planning-region tables');
    return run(body(HARTFORD), world('census-hartford-ct'));
  })
  .then(function (r) {
    eq('geocoder answered the 2020 county, not the planning region', r.geo.countyFips, '09003');
    eq('energy community: no (no Connecticut area qualifies under 2026-39)', r.energyCommunity.status, 'no');
    eq('low income read through the planning-region GEOID', r.lowIncome.tract, '09110502100');
    eq('low income: no', r.lowIncome.status, 'no');
  })

  .then(function () {
    section('No match');
    n = world('census-no-match');
    return run(body({ street: '99999 Nowhere Lane', city: 'Faketown', state: 'TX', zip: '00000' }), n);
  })
  .then(function (r) {
    eq('still ok:true — the call never fails for a source', r.ok, true);
    eq('geo null', r.geo, null);
    ok('errors.geo says no match', /no match/.test(r.errors.geo), r.errors.geo);
    eq('energy community: unknown, not no', r.energyCommunity.status, 'unknown');
    eq('low income: unknown, not no', r.lowIncome.status, 'unknown');
    eq('solar null', r.solar, null);
    eq('utility null', r.utility, null);
    ok('each dependent source says why', /could not be located/.test(r.errors.energyCommunity) && /could not be located/.test(r.errors.lowIncome) &&
      /could not be located/.test(r.errors.solar) && /could not be located/.test(r.errors.utility), r.errors);
    eq('state tax still answers from the address', r.tax.statePct, 0);
    eq('only the geocoder was asked', n.calls.length, 1);
  })

  .then(function () {
    section('The geocoder: 502 then an answer, 502 twice, a gateway page, a hang');
    n = net(function (u, init, i) {
      if (isCensus(u)) return i === 1 ? 'census-502' : 'census-canoga-park-ca';
      return isPv(u) ? 'pvwatts-canoga-park-250kw' : 'urdb-ladwp-canoga-park';
    });
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    eq('a 502 is retried once and the retry is used', r.geo && r.geo.countyFips, '06037');
    eq('...two geocoder calls', n.to(/census/).length, 2);
    n = net(function (u) { return isCensus(u) ? 'census-502' : 'urdb-empty'; });
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('502 twice: errors.geo names the status', /HTTP 502/.test(r.errors.geo), r.errors.geo);
    eq('...retried once, not forever', n.to(/census/).length, 2);
    n = net(function (u) { return isCensus(u) ? 'upstream-html-502' : 'urdb-empty'; });
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('an HTML gateway page is a failure, not a crash', r.geo === null && /HTTP 502/.test(r.errors.geo), r.errors);
    n = net(function (u) { return isCensus(u) ? { hang: true } : 'urdb-empty'; });
    var t0 = Date.now();
    return run(body(CANOGA), n).then(function (r) { r._ms = Date.now() - t0; return r; });
  })
  .then(function (r) {
    ok('a hung geocoder times out into errors.geo', /did not answer in time/.test(r.errors.geo), r.errors.geo);
    ok('...within its budget', r._ms < FAST.geocodeBudgetMs + 200, r._ms);
    eq('...retried inside the budget', n.to(/census/).length, 2);
    eq('energy community unknown', r.energyCommunity.status, 'unknown');
    n = net(function (u) { return isCensus(u) ? { throws: true } : 'urdb-empty'; });
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('a DNS failure is "could not be reached"', /could not be reached/.test(r.errors.geo), r.errors.geo);
    n = net(function (u) { return isCensus(u) ? { status: 403, headers: {}, body: '<html>Access Denied</html>' } : 'urdb-empty'; });
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('a 403 from the geocoder (a WAF block) names the status', /HTTP 403/.test(r.errors.geo), r.errors.geo);
    eq('...and is not retried', n.to(/census/).length, 1);
  })

  .then(function () {
    section('PVWatts failures stay in errors.solar');
    n = world(null, 'pvwatts-403-invalid-key');
    return run(body(CANOGA, { keys: { nrel: 'USERnrel0123456789abcdefABCDEF' } }), n);
  })
  .then(function (r) {
    eq('403: solar null', r.solar, null);
    ok('403: says the user\'s key was refused and where to fix it', /refused your key/.test(r.errors.solar) && /Settings/.test(r.errors.solar), r.errors.solar);
    ok('403: the dead signup link is not passed on', !/nrel\.gov/.test(JSON.stringify(r)), r.errors.solar);
    ok('403: utility still answers', r.utility && r.utility.name === 'Los Angeles Department of Water & Power');
    eq('403: the user\'s key was the one sent', n.to(/pvwatts/)[0].headers['X-Api-Key'], 'USERnrel0123456789abcdefABCDEF');
    eq('403: no retry on a 4xx', n.to(/pvwatts/).length, 1);
    n = world(null, 'pvwatts-429-over-limit');
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('429: over the rate limit, with the wait from Retry-After', /over its rate limit/.test(r.errors.solar) && /about 3 h/.test(r.errors.solar), r.errors.solar);
    ok('429 on the demo key: points at Settings', /own free key in Settings/.test(r.errors.solar), r.errors.solar);
    eq('429: never retried', n.to(/pvwatts/).length, 1);
    ok('429: no demo-key success warning for solar', !r.warnings.some(function (w) { return /^Solar production used/.test(w); }), r.warnings);
    return run(body(CANOGA, { solar: { kwDc: 100 } }), world(null, 'pvwatts-422'));
  })
  .then(function (r) {
    ok('422: PVWatts\' own reason', /PVWatts refused the request: 'tilt' must be between 0 and 90/.test(r.errors.solar), r.errors.solar);
    n = world(null, 'upstream-html-502');
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('an unreadable 502: retried once, then reported', /could not be read \(HTTP 502\)/.test(r.errors.solar) && n.to(/pvwatts/).length === 2, [r.errors.solar, n.to(/pvwatts/).length]);
    n = world(null, { hang: true });
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('a hung PVWatts: timed out', /did not answer within/.test(r.errors.solar), r.errors.solar);
    ok('...and the tariffs still came back', r.utility && r.utility.rates.length === 5);
    n = world(null, { status: 200, body: { errors: [], outputs: {} } });
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('a 200 with no outputs: "no production", not a number', r.solar === null && /no production/.test(r.errors.solar), r.errors.solar);
    n = world(null, { status: 200, body: { errors: [], outputs: { ac_annual: 1000, ac_monthly: [1, 2, 3] } } });
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('eleven months short is refused', r.solar === null, r.solar);
    n = world();
    return run(body(CANOGA, { solar: false }), n);
  })
  .then(function (r) {
    eq('solar:false: PVWatts not called', n.to(/pvwatts/).length, 0);
    eq('...solar null', r.solar, null);
    ok('...and no error for it', !('solar' in r.errors), r.errors);
  })

  .then(function () {
    section('URDB failures stay in errors.utility');
    return run(body(CANOGA), world(null, null, 'urdb-403-invalid-key'));
  })
  .then(function (r) {
    ok('403 invalid: the demo key refused', /refused the shared demo key \(API_KEY_INVALID\)/.test(r.errors.utility), r.errors.utility);
    ok('...solar unaffected', r.solar && r.solar.kwhAnnual > 0);
    return run(body(CANOGA), world(null, null, 'urdb-403-missing-key'));
  })
  .then(function (r) {
    ok('403 missing', /needs an API key/.test(r.errors.utility), r.errors.utility);
    n = world(null, null, 'upstream-html-502');
    return run(body(CANOGA), n);
  })
  .then(function (r) {
    ok('an unreadable URDB 502: retried once, then reported', /could not be read \(HTTP 502\)/.test(r.errors.utility) && n.to(/openei/).length === 2, [r.errors.utility, n.to(/openei/).length]);
    ok('...solar unaffected', r.solar && r.solar.kwhAnnual > 0);
    return run(body(CANOGA), world(null, null, 'urdb-empty'));
  })
  .then(function (r) {
    eq('no current rates: utility null', r.utility, null);
    ok('...said plainly', /no current commercial rates/.test(r.errors.utility), r.errors.utility);
    return run(body(CANOGA), world(null, null, 'urdb-sce-torrance'));
  })
  .then(function (r) {
    eq('SCE: named', r.utility.name, 'Southern California Edison Co');
    ok('SCE: a two-year-old newest tariff is flagged', r.warnings.some(function (w) { return /starts 2024-10-01/.test(w) && /tariff book/.test(w); }), r.warnings);
    return run(body(CANOGA), world(null, null, 'urdb-fpl-hollywood'));
  })
  .then(function (r) {
    ok('FPL: a January 2026 tariff is not flagged stale', !r.warnings.some(function (w) { return /tariff book/.test(w); }), r.warnings);
    var ended = fixture('urdb-ladwp-canoga-park');
    ended.body.items[0].enddate = Math.floor(NOW / 1000) - 86400;
    ended.body.items[1].enddate = Math.floor(NOW / 1000) - 1;
    ended.body.items.push({ label: 'aaaaaaaaaaaaaaaaaaaaaaaa', utility: 'City of Somewhere Electric', name: 'Muni GS',
      startdate: 1767250800, flatdemandstructure: [[{ rate: 3 }]], flatdemandmonths: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    return run(body(CANOGA), world(null, null, ended));
  })
  .then(function (r) {
    eq('rates that have ended are dropped', r.utility.ratesFound, 12);
    eq('the utility with the most current rates is named', r.utility.name, 'Los Angeles Department of Water & Power');
    eq('...and a second utility at the point is listed, not dropped', r.utility.otherUtilities.join(), 'City of Somewhere Electric');
    var energyOnly = { status: 200, body: { items: [{ label: 'bbbbbbbbbbbbbbbbbbbbbbbb', utility: 'Tiny Coop', name: 'GS Energy Only', startdate: 1767250800,
      energyratestructure: [[{ rate: 0.12 }]] }] } };
    return run(body(CANOGA), world(null, null, energyOnly));
  })
  .then(function (r) {
    eq('no demand rates: the energy-only rate is still shown', r.utility.rates.length, 1);
    eq('...marked as having none', r.utility.rates[0].hasDemand, false);
    ok('...with a warning that says so', r.warnings.some(function (w) { return /has a demand charge/.test(w); }), r.warnings);
    return run(body(CANOGA), world(null, null, { status: 200, body: { error: { code: 'SOMETHING', message: 'bad' } } }));
  })
  .then(function (r) {
    ok('an error object on a 200 is a failure, named by its code', r.utility === null && /returned an error \(SOMETHING\)/.test(r.errors.utility), r.errors);
  })

  .then(function () {
    section('Independent and parallel');
    n = world(null, { hang: true }, { hang: true });
    var t0 = Date.now();
    return run(body(CANOGA), n).then(function (r) { r._ms = Date.now() - t0; return r; });
  })
  .then(function (r) {
    ok('both hung: both time out', /did not answer/.test(r.errors.solar) && /did not answer/.test(r.errors.utility), r.errors);
    ok('...in about one timeout, not two (they run in parallel)', r._ms < FAST.lookupMs * 1.8, r._ms);
    ok('...and the location facts are all still there', r.geo && r.energyCommunity.status === 'yes' && r.lowIncome.status === 'no' && r.tax.statePct === 8.84, r);
    n = world(null, { deaf: true }, 'urdb-ladwp-canoga-park');
    var t0 = Date.now();
    return run(body(CANOGA), n).then(function (x) { x._ms = Date.now() - t0; return x; });
  })
  .then(function (r) {
    ok('a fetch that ignores the abort still settles on the timer', /did not answer/.test(r.errors.solar) && r._ms < FAST.lookupMs * 3, [r.errors.solar, r._ms]);
    var saved = global.AbortController;
    global.AbortController = undefined;
    n = world(null, { deaf: true });
    return run(body(CANOGA), n).then(function (x) { global.AbortController = saved; return x; },
      function (e) { global.AbortController = saved; throw e; });
  })
  .then(function (r) {
    ok('with no AbortController at all the timer alone still settles it', /did not answer/.test(r.errors.solar) && r.utility !== null, r.errors);
  })

  .then(function () {
    section('Keys: precedence on the wire, and never in the result');
    n = world();
    return run(body(CANOGA, { keys: { nrel: 'USERnrel0123456789abcdefABCDEF', urdb: 'USERurdb0123456789abcdefABCDEF' } }), n,
      { env: { NREL_API_KEY: 'ENVnrel0123456789abcdefABCDEF', OPENEI_API_KEY: 'ENVoei0123456789abcdefABCDEF' } });
  })
  .then(function (r) {
    eq('env wins for PVWatts', n.to(/pvwatts/)[0].headers['X-Api-Key'], 'ENVnrel0123456789abcdefABCDEF');
    eq('env wins for URDB', n.to(/openei/)[0].headers['X-Api-Key'], 'ENVoei0123456789abcdefABCDEF');
    eq('solar.keyUsed env', r.solar.keyUsed, 'env');
    eq('utility.keyUsed env', r.utility.keyUsed, 'env');
    ok('no demo-key warning with real keys', !r.warnings.some(function (w) { return /demo key/.test(w); }), r.warnings);
    n = world();
    return run(body(CANOGA, { keys: { nrel: 'USERnrel0123456789abcdefABCDEF', urdb: 'USERurdb0123456789abcdefABCDEF' } }), n);
  })
  .then(function (r) {
    eq('no env: the user\'s NREL key', n.to(/pvwatts/)[0].headers['X-Api-Key'], 'USERnrel0123456789abcdefABCDEF');
    eq('no env: the user\'s OpenEI key', n.to(/openei/)[0].headers['X-Api-Key'], 'USERurdb0123456789abcdefABCDEF');
    eq('solar.keyUsed user', r.solar.keyUsed, 'user');
    eq('utility.keyUsed user', r.utility.keyUsed, 'user');
    ok('no key in any URL', !n.calls.some(function (c) { return /USER|ENV|api_key/.test(c.url); }), n.calls.map(function (c) { return c.url; }));
    ok('the geocoder is never sent a key', n.to(/census/).every(function (c) { return !('X-Api-Key' in c.headers); }));
    ok('no key anywhere in the result', !/USERnrel|USERurdb/.test(JSON.stringify(r)));

    /* A hostile or buggy upstream that repeats the key back in every text
       field it has: the result must still not carry it. */
    var KEY = 'LEAKnrel0123456789abcdefABCDEF', OKEY = 'LEAKurdb0123456789abcdefABCDEF';
    n = net(function (u, init) {
      if (isCensus(u)) return 'census-canoga-park-ca';
      if (isPv(u)) return { status: 422, body: { errors: ['bad key ' + init.headers['X-Api-Key'] + ' for you'], outputs: {} } };
      var items = fixture('urdb-ladwp-canoga-park').body.items.slice(0, 2);
      items[0].name = 'Rate for ' + init.headers['X-Api-Key'];
      items[1].utility = items[0].utility;
      return { status: 200, body: { items: items } };
    });
    return run(body(CANOGA, { keys: { nrel: KEY, urdb: OKEY } }), n).then(function (x) { return { r: x, keys: [KEY, OKEY] }; });
  })
  .then(function (x) {
    var s = JSON.stringify(x.r);
    ok('an upstream that echoes the key cannot leak it into the result', s.indexOf(x.keys[0]) < 0 && s.indexOf(x.keys[1]) < 0, s.slice(0, 300));
    ok('...it is replaced, visibly', /\[key removed\]/.test(s));
    n = world();
    return run(body(CANOGA, { keys: { nrel: 'bad key!', urdb: '' } }), n);
  })
  .then(function (r) {
    eq('a malformed user key falls back to the demo key', n.to(/pvwatts/)[0].headers['X-Api-Key'], 'DEMO_KEY');
    ok('...with a warning that does not repeat it', r.warnings.some(function (w) { return /not in the expected format/.test(w); }) && !/bad key!/.test(JSON.stringify(r)), r.warnings);
  })

  .then(function () {
    section('Warnings about the match itself');
    var two = fixture('census-canoga-park-ca');
    two.body.result.addressMatches.push(two.body.result.addressMatches[0]);
    return run(body({ street: '22125 Roscoe Blvd', city: 'Canoga Park', state: 'NV', zip: '91304' }), world(two));
  })
  .then(function (r) {
    ok('two candidates: the first is used and flagged', r.warnings.some(function (w) { return /matched 2 places/.test(w); }), r.warnings);
    ok('a state that disagrees with the match is flagged', r.warnings.some(function (w) { return /matched in CA, not NV/.test(w); }), r.warnings);
    eq('...and the tax follows what was typed', r.tax.state, 'NV');
    return run(body({ street: '1 Calle Luna', city: 'San Juan', state: 'PR' }), world());
  })
  .then(function (r) {
    ok('a territory: a warning to enter the state rate', r.warnings.some(function (w) { return /no state corporate rate on file for PR/.test(w); }), r.warnings);
    return run(body({ street: '1<b>', city: 'X', state: 'CA' }), world());
  })
  .then(function (r) {
    eq('an invalid request resolves ok:false (the handler makes it a 400)', r.ok, false);
    eq('...with the field', r.field, 'address.street');
    return S.lookup(body(CANOGA), { fetch: null, env: NO_ENV, now: NOW, timeouts: FAST, who: WHO, guard: S.createGuard() });
  })
  .then(function (r) {
    ok('no fetch at all: a clean error, not a throw', r.ok === true && typeof r.errors.geo === 'string' && r.energyCommunity.status === 'unknown', r.errors);
  });
}

/* ── the shared quota: per-org and per-person limits, and the cache ──────── */

/* On a fake clock: every call names its own `now`, which is also what the
   guard counts by, so a minute or an hour passes in no time at all. */
function quota() {
  var G, n, n2;
  function q(b, net1, who, g, now) {
    return S.lookup(b, { fetch: net1.fetch, env: NO_ENV, now: now, timeouts: FAST, who: who, guard: g });
  }
  function sized(kw) { return body(CANOGA, { solar: { kwDc: kw } }); }
  /* n lookups by one person at one instant, each a different solar size so
     none is a cache hit; resolves the list of results. */
  function burst(count, from, who, g, now, net1) {
    var p = Promise.resolve(), out = [], i;
    for (i = 0; i < count; i++) {
      (function (kw) {
        p = p.then(function () { return q(sized(kw), net1, who, g, now).then(function (r) { out.push(r); }); });
      })(from + i);
    }
    return p.then(function () { return out; });
  }
  function allOk(rs) { return rs.every(function (r) { return r.ok === true; }); }
  function rejected(p) { return p.then(function () { return 'resolved'; }, function (e) { return e.message; }); }
  var ANA = { orgId: 'example-energy.com', uid: 'ana' }, BEN = { orgId: 'example-energy.com', uid: 'ben' };
  var CY = { orgId: 'example-energy.com', uid: 'cy' }, DEE = { orgId: 'example-energy.com', uid: 'dee' };
  var OLA = { orgId: 'other-power.com', uid: 'ola' };

  return Promise.resolve()

  .then(function () {
    section('Quota: who is asking');
    eq('30 lookups an hour per workspace', S.LIMITS.ORG_PER_HOUR, 30);
    eq('10 a minute per person', S.LIMITS.USER_PER_MINUTE, 10);
    eq('a repeat is cached for an hour', S.LIMITS.CACHE_MS, 3600000);
    n = world();
    return rejected(S.lookup(body(CANOGA), { fetch: n.fetch, env: NO_ENV, now: NOW, timeouts: FAST }));
  })
  .then(function (m) {
    ok('no opts.who: refused, not run uncounted', /needs opts\.who/.test(m), m);
    eq('...and nothing went out', n.calls.length, 0);
    return rejected(S.lookup(body(CANOGA), { fetch: n.fetch, env: NO_ENV, now: NOW, who: { orgId: 'example-energy.com' } }));
  })
  .then(function (m) {
    ok('a who with no uid is refused too', /needs opts\.who/.test(m), m);
    return rejected(S.lookup(body(CANOGA), { fetch: n.fetch, env: NO_ENV, now: NOW, who: { orgId: '', uid: 'u' } }));
  })
  .then(function (m) {
    ok('...and one with an empty orgId', /needs opts\.who/.test(m), m);
    eq('...none of them reached the network', n.calls.length, 0);
  })

  /* ── the cache ── */
  .then(function () {
    section('Quota: an identical lookup is free');
    G = S.createGuard(); n = world();
    return q(sized(250), n, ANA, G, NOW);
  })
  .then(function (r) {
    eq('first lookup: three requests', n.calls.length, 3);
    /* The caller scribbles on its copy; the next caller must not see it. */
    r.solar.kwhAnnual = -1;
    r.warnings.push('scribbled on by the first caller');
    return q(body({ street: ' 22125  roscoe BLVD ', city: 'canoga park', state: 'ca', zip: '91304' }, { solar: { kwDc: 250 } }),
      n, BEN, G, NOW + 1000);
  })
  .then(function (r) {
    eq('the same site (spacing and case aside), by a colleague: no request', n.calls.length, 3);
    eq('...the same answer', r.solar.kwhAnnual, 407042);
    ok('...not the copy the first caller edited', r.warnings.indexOf('scribbled on by the first caller') < 0, r.warnings);
    eq('...in the contract\'s shape', Object.keys(r).sort().join(','), 'energyCommunity,errors,geo,lowIncome,ok,solar,tax,utility,warnings');
    return q(sized(250), n, OLA, G, NOW + 2000);
  })
  .then(function () {
    eq('another workspace, same site: its own lookup (the cache is per workspace)', n.calls.length, 6);
    return q(sized(100), n, ANA, G, NOW + 3000);
  })
  .then(function () {
    eq('a different solar size is a different lookup', n.calls.length, 9);
    return q(body(CANOGA, { solar: { kwDc: 250, tilt: 20 } }), n, ANA, G, NOW + 4000);
  })
  .then(function () {
    eq('...so is a different tilt', n.calls.length, 12);
    return q(body(CANOGA, { solar: false }), n, ANA, G, NOW + 5000);
  })
  .then(function () {
    eq('...and no solar at all (geocoder and URDB only)', n.calls.length, 14);
    return q(sized(250), n, ANA, G, NOW + 3600000 - 1);
  })
  .then(function () {
    eq('still cached a moment before the hour', n.calls.length, 14);
    return q(sized(250), n, ANA, G, NOW + 3600000);
  })
  .then(function () {
    eq('an hour on, looked up afresh', n.calls.length, 17);
    return q(body(CANOGA, { solar: { kwDc: 250 }, keys: { nrel: 'USERnrel0123456789abcdefABCDEF' } }), n, ANA, G, NOW + 3600001);
  })
  .then(function (r) {
    eq('the user\'s own key is not answered from a demo-key result', n.calls.length, 20);
    eq('...and says whose key it used', r.solar.keyUsed, 'user');
    return q(body(CANOGA, { solar: { kwDc: 250 }, keys: { nrel: 'bad key!' } }), n, ANA, G, NOW + 3600002);
  })
  .then(function (r) {
    eq('a malformed key falls to the demo key, so the demo answer is reused', n.calls.length, 20);
    eq('...with THIS request\'s warning about the key, once', r.warnings.filter(function (w) { return /not in the expected format/.test(w); }).length, 1);
    r.utility.name = 'scribbled on by a cache hit';
    return q(sized(250), n, BEN, G, NOW + 3600003);
  })
  .then(function (r) {
    eq('the next hit on the same answer: still no request', n.calls.length, 20);
    ok('...without the last caller\'s key warning', !r.warnings.some(function (w) { return /not in the expected format/.test(w); }), r.warnings);
    ok('...or its edits (every hit is its own copy)', r.utility.name !== 'scribbled on by a cache hit', r.utility.name);
    G = S.createGuard(); n = world();
    return q(body(CANOGA, { solar: { kwDc: 250 }, keys: { nrel: 'bad key!' } }), n, ANA, G, NOW);
  })
  .then(function (r) {
    ok('a lookup made with a malformed key warns about it', r.warnings.some(function (w) { return /not in the expected format/.test(w); }), r.warnings);
    return q(sized(250), n, BEN, G, NOW + 1);
  })
  .then(function (r) {
    eq('...is reused by a colleague', n.calls.length, 3);
    ok('...who does not inherit that warning', !r.warnings.some(function (w) { return /not in the expected format/.test(w); }), r.warnings);
    ok('...but keeps the rest (the demo-key notes)', r.warnings.filter(function (w) { return /demo key/.test(w); }).length === 2, r.warnings);
    G = S.createGuard(); n = world(null, null, 'urdb-empty');
    return q(sized(250), n, ANA, G, NOW);
  })
  .then(function (r) {
    ok('a lookup where one source failed', typeof r.errors.utility === 'string', r.errors);
    n2 = world();
    return q(sized(250), n2, ANA, G, NOW + 1);
  })
  .then(function (r) {
    eq('...is not kept: the repeat asks again', n2.calls.length, 3);
    eq('...and gets the full answer', JSON.stringify(r.errors), '{}');
    G = S.createGuard({ cacheMax: 2 }); n = world();
    return burst(3, 400, ANA, G, NOW, n);
  })
  .then(function () {
    eq('three lookups into a two-answer cache', n.calls.length, 9);
    return q(sized(402), n, ANA, G, NOW + 1);
  })
  .then(function () {
    eq('...the newest is kept', n.calls.length, 9);
    return q(sized(400), n, ANA, G, NOW + 2);
  })
  .then(function () {
    eq('...the oldest went first', n.calls.length, 12);
  })

  /* ── per person ── */
  .then(function () {
    section('Quota: ten a minute per person');
    G = S.createGuard(); n = world();
    return burst(10, 200, ANA, G, NOW, n);
  })
  .then(function (rs) {
    ok('ten different lookups in one minute all run', rs.length === 10 && allOk(rs), rs.map(function (r) { return r.ok; }));
    eq('...thirty requests', n.calls.length, 30);
    return q(sized(300), n, ANA, G, NOW);
  })
  .then(function (r) {
    eq('the eleventh is refused', r.ok, false);
    eq('...as a 429', r.status, 429);
    eq('...retry after the whole minute', r.retryAfter, 60);
    ok('...naming the per-person limit and the wait', /10 site lookups in a minute/.test(r.error) && /60 s/.test(r.error), r.error);
    eq('...and nothing went out', n.calls.length, 30);
    return q(sized(200), n, ANA, G, NOW + 1);
  })
  .then(function (r) {
    eq('a repeat is still answered past the cap (a cache hit spends nothing)', r.ok, true);
    eq('...with no request', n.calls.length, 30);
    return q(body({ street: '1<b>', city: 'X', state: 'CA' }), n, ANA, G, NOW + 2);
  })
  .then(function (r) {
    eq('an invalid request past the cap is still the 400, not a 429', r.field, 'address.street');
    return q(sized(300), n, BEN, G, NOW + 3);
  })
  .then(function (r) {
    eq('a colleague is not held to another person\'s minute', r.ok, true);
    return q(sized(301), n, ANA, G, NOW + 59999);
  })
  .then(function (r) {
    eq('a moment before the minute is up: still refused', r.status, 429);
    eq('...retry in 1 s', r.retryAfter, 1);
    return q(sized(301), n, ANA, G, NOW + 60000);
  })
  .then(function (r) {
    eq('a minute on: allowed again', r.ok, true);
    /* Sliding, not fixed: five at 0 s and five at 30 s; at 60 s only the
       first five have left the window. A fixed minute would reset to ten. */
    G = S.createGuard(); n = world();
    return burst(5, 500, ANA, G, NOW, n);
  })
  .then(function () { return burst(5, 510, ANA, G, NOW + 30000, n); })
  .then(function () { return burst(5, 520, ANA, G, NOW + 60000, n); })
  .then(function (rs) {
    ok('the window slides: five slots free at 60 s', allOk(rs), rs.map(function (r) { return r.ok; }));
    return q(sized(530), n, ANA, G, NOW + 60000);
  })
  .then(function (r) {
    eq('...and no sixth', r.status, 429);
    eq('...until the 30 s ones leave, 30 s later', r.retryAfter, 30);
    G = S.createGuard({ userPerMinute: 1 }); n = world();
    return q(body({ street: '1<b>', city: 'X', state: 'CA' }), n, ANA, G, NOW);
  })
  .then(function () { return q(sized(250), n, ANA, G, NOW); })
  .then(function (r) {
    eq('an invalid request is not charged (the one allowed lookup still runs)', r.ok, true);
    return burst(3, 260, ANA, G, NOW + 30000, n);
  })
  .then(function (rs) {
    ok('retries inside the minute are refused', rs.every(function (r) { return r.status === 429; }), rs.map(function (r) { return r.status; }));
    return q(sized(270), n, ANA, G, NOW + 60000);
  })
  .then(function (r) {
    eq('...and not charged: the minute still ends a minute after the one that ran', r.ok, true);
  })

  /* ── per workspace ── */
  .then(function () {
    section('Quota: thirty an hour per workspace');
    G = S.createGuard(); n = world();
    return burst(10, 600, ANA, G, NOW, n)
      .then(function (a) { return burst(10, 610, BEN, G, NOW, n).then(function (b) { return a.concat(b); }); })
      .then(function (ab) { return burst(10, 620, CY, G, NOW, n).then(function (c) { return ab.concat(c); }); });
  })
  .then(function (rs) {
    ok('three people, ten each: thirty lookups run', rs.length === 30 && allOk(rs), rs.filter(function (r) { return !r.ok; }).length);
    return q(sized(630), n, DEE, G, NOW + 1000);
  })
  .then(function (r) {
    eq('a fourth person\'s first lookup is refused: the workspace is spent', r.status, 429);
    eq('...until the hour turns', r.retryAfter, 3599);
    ok('...naming the workspace limit', /workspace has run 30 site lookups in the last hour/.test(r.error) && /60 min/.test(r.error), r.error);
    return q(sized(630), n, OLA, G, NOW + 1000);
  })
  .then(function (r) {
    eq('another workspace is untouched', r.ok, true);
    return q(sized(600), n, DEE, G, NOW + 2000);
  })
  .then(function (r) {
    eq('a site the workspace already looked up is still answered', r.ok, true);
    return q(sized(631), n, DEE, G, NOW + 3600000);
  })
  .then(function (r) {
    eq('an hour on, the workspace may look up again', r.ok, true);
    /* A refusal is charged to nobody: Ana's refused retries must not eat
       the hour Ben still has. */
    G = S.createGuard({ userPerMinute: 2, orgPerHour: 3 }); n = world();
    return burst(2, 700, ANA, G, NOW, n);
  })
  .then(function () { return burst(4, 710, ANA, G, NOW, n); })
  .then(function (rs) {
    ok('Ana, past her minute, is refused four times', rs.every(function (r) { return r.status === 429; }), rs.map(function (r) { return r.status; }));
    return q(sized(720), n, BEN, G, NOW);
  })
  .then(function (r) {
    eq('...and none of it was charged to the workspace: Ben has the third', r.ok, true);
    return q(sized(721), n, BEN, G, NOW);
  })
  .then(function (r) {
    eq('...and then it is spent', r.status, 429);
    ok('...named as the workspace\'s limit, the longer wait', /workspace/.test(r.error) && r.retryAfter === 3600, [r.retryAfter, r.error]);
  });
}

/* ── the table builder's reader, on a workbook built here ────────────────── */

/* A stored (method 0) or deflated (method 8) zip, by hand: enough to prove
   the reader walks the central directory and inflates, with no fixture
   spreadsheet in the repo. */
function zip(files) {
  var locals = [], centrals = [], offset = 0;
  Object.keys(files).forEach(function (name, i) {
    var data = Buffer.from(files[name], 'utf8');
    var method = i % 2 ? 8 : 0;
    var body = method === 8 ? zlib.deflateRawSync(data) : data;
    var nameBuf = Buffer.from(name, 'utf8');
    var lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    var ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, body);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  });
  var cd = Buffer.concat(centrals);
  var end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([cd, end]));
}
function workbook(rows) {
  var strings = [], index = {};
  function si(s) { if (!(s in index)) { index[s] = strings.length; strings.push(s); } return index[s]; }
  var sheet = rows.map(function (r, ri) {
    return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
      var ref = String.fromCharCode(65 + ci) + (ri + 1);
      if (typeof v === 'number') return '<c r="' + ref + '"><v>' + v + '</v></c>';
      if (v === null) return '<c r="' + ref + '"/>';
      return '<c r="' + ref + '" t="s"><v>' + si(v) + '</v></c>';
    }).join('') + '</row>';
  }).join('');
  return zip({
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="EC_CC_V5" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst>' + strings.map(function (s) {
      return '<si><t>' + s.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</t></si>';
    }).join('') + '</sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' + sheet + '</sheetData></worksheet>'
  });
}

function builder() {
  section('scripts/build-energy-communities.js');
  eq('eligibility dates to ISO', BUILD.isoDate('Jan. 1, 2023'), '2023-01-01');
  eq('...June with a period', BUILD.isoDate('Jun. 23, 2025'), '2025-06-23');
  eq('...a spelled-out month', BUILD.isoDate('September 7, 2026'), '2026-09-07');
  eq('...nonsense is null', BUILD.isoDate('N/A'), null);
  eq('the lookup reads dates the same way', S._pure.sinceIso('Jun. 7, 2024'), '2024-06-07');

  var rows = [['Census tracts that have ever had a closed coal mine & more', null, null, null, null],
    ['State Name', 'County', '2020 Census Tract Number FIPS code', 'Tract Type', 'Date of eligibility']];
  for (var i = 0; i < 1000; i++) rows.push(['Alabama', 'Baldwin County', 1003010100 + i, 'Directly adjoining', 'Jan. 1, 2023']);
  rows.push(['West Vi', 'Logan County', '54045956900', 'Mine closure, Directly adjoining', 'Jun. 7, 2024']);
  var book = BUILD.readXlsx(workbook(rows));
  eq('the reader finds the sheet by name', Object.keys(book)[0], 'EC_CC_V5');
  eq('...every row', book.EC_CC_V5.length, 1003);
  eq('...shared strings with entities decoded', book.EC_CC_V5[0][0], 'Census tracts that have ever had a closed coal mine & more');
  var coal = BUILD.buildCoal(book).tracts;
  eq('numeric FIPS are zero-padded to 11', Object.keys(coal)[0], '01003010100');
  eq('a GEOID stored as text is kept', coal['54045956900'].type, 'Mine closure, Directly adjoining');
  eq('the date is kept as Treasury prints it', coal['54045956900'].since, 'Jun. 7, 2024');
  var thrown = null;
  try { BUILD.buildCoal(BUILD.readXlsx(workbook(rows.slice(0, 50)))); } catch (e) { thrown = e.message; }
  ok('a truncated list is refused, not shipped', /only 48 tracts/.test(thrown || ''), thrown);
  var badDate = rows.slice(); badDate.push(['Ohio', 'X', 39001000100, 'Mine closure', 'sometime']);
  thrown = null;
  try { BUILD.buildCoal(BUILD.readXlsx(workbook(badDate))); } catch (e) { thrown = e.message; }
  ok('an unreadable date is refused', /unreadable eligibility date/.test(thrown || ''), thrown);
  thrown = null;
  try { BUILD.readXlsx(Buffer.from('not a zip at all')); } catch (e) { thrown = e.message; }
  ok('a download that is not a spreadsheet is refused', /not a zip/.test(thrown || ''), thrown);

  section('The committed tables');
  var sa = require(path.join(ROOT, 'api', '_lib', 'data', 'ec_statistical_2026.json'));
  var cc = require(path.join(ROOT, 'api', '_lib', 'data', 'ec_coal_tracts_v5.json'));
  var lic = require(path.join(ROOT, 'api', '_lib', 'data', 'lic_cat1_2026.json'));
  eq('867 statistical-area counties (IRS n-26-39 Appendix 1)', Object.keys(sa.counties).length, 867);
  eq('national rate 4.28%', sa.nationalRate2025, 4.28);
  eq('4,477 coal-closure tracts', Object.keys(cc.tracts).length, 4477);
  ok('every coal date parses', Object.keys(cc.tracts).every(function (k) { return !!S._pure.sinceIso(cc.tracts[k].since); }));
  ok('every key is a zero-padded GEOID', Object.keys(sa.counties).every(function (k) { return /^\d{5}$/.test(k); }) &&
    Object.keys(cc.tracts).every(function (k) { return /^\d{11}$/.test(k); }) &&
    Object.keys(lic.pctCategory1).every(function (k) { return /^\d{11}$/.test(k); }));
  eq('36,370 tracts with Category 1 area', Object.keys(lic.pctCategory1).length, 36370);
  eq('879 Connecticut tracts indexed', Object.keys(lic.ctTracts).length, 879);
  ok('each table says which notice, which data, and when it was built', [sa, cc, lic].every(function (t) {
    return t.meta && t.meta.notice && t.meta.dataVintage && /^\d{4}-\d{2}-\d{2}$/.test(t.meta.builtAt) && /^https:\/\//.test(t.meta.source.url) && /^[0-9a-f]{64}$/.test(t.meta.source.sha256);
  }));
  ok('...and when to refresh', /June/.test(sa.meta.refresh), sa.meta.refresh);
}

function hygiene() {
  section('Source');
  [LIB, path.join(ROOT, 'scripts', 'build-energy-communities.js')].forEach(function (f) {
    var src = fs.readFileSync(f, 'utf8'), name = path.relative(ROOT, f);
    ok(name + ': © header', /© 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\./.test(src.split('\n').slice(0, 6).join('\n')));
    var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
    ok(name + ': ES5 (no arrows, const/let, template literals, classes, async, spread)',
      !/=>|\bconst\s|\blet\s|`|\bclass\s|\basync\s|\.\.\./.test(code));
    ok(name + ': no Object.assign/entries/values, includes/find/startsWith/padStart',
      !/Object\.(assign|entries|values)\b|\.(includes|find|findIndex|startsWith|padStart)\(/.test(code));
    ok(name + ': names no tenant', !/nextnrg|tremco|clean ?cell|fenecon|concord/i.test(src));
  });
  var lib = fs.readFileSync(LIB, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('site-lookup never calls the stale DOE/NETL layers', !/netl\.doe\.gov/.test(lib));
  ok('...nor the retired developer.nrel.gov host', !/developer\.nrel\.gov/.test(lib));
  ok('...and never puts api_key in a query string', !/api_key/.test(lib));
  ok('...and logs nothing', !/console\./.test(lib));
}

validation();
keysPure();
tablesPure();
builder();
hygiene();
lookups().then(quota).then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, function (e) {
  console.error(e);
  process.exit(1);
});
