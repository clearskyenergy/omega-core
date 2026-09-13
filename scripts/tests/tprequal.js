/* /api/site-prequal — the screening rubric, offline.

   The rubric moved out of editor.html in the editable-drawing pass, which is
   where CLAUDE.md says scoring belongs. It moved WITHOUT its endpoint: the
   browser POSTed to a path that did not exist and every screening 404'd.
   This covers the endpoint that closes that hole, and it exists mainly to
   hold two properties that a screening tool loses by default — both of which
   flip a go/no-go answer, and both of which were regressions the incoming
   source would have reintroduced:

     - silence is not confirmation. An unticked zoning box scores zero.
     - a benchmark is not the project. Screening the configured design gives
       a different answer than the published 1 MW pair, and which one ran is
       reported rather than inferred.

   _lib/admin is stood in for the way tparcel.js does it: firebase-admin is
   not the thing under test and no credential should be needed to run this. */
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

let AUTH = () => Promise.resolve({ uid: 'u1', email: 'pm@concord.com', orgId: 'concordenergyusa.com', staff: false });
let DOCS = {};
function fakeDb() {
  const col = base => ({
    doc: id => {
      const p = base + '/' + id;
      return { get: () => Promise.resolve({ exists: !!DOCS[p], data: () => DOCS[p] }),
               collection: name => col(p + '/' + name) };
    }
  });
  return { collection: name => col(name) };
}
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: req => AUTH(req),
  db: fakeDb,
  billingOf: org => Promise.resolve(DOCS['omega_orgs/' + org + '/billing/current']
                                    || { tier: 'standard', addons: [], toolOverrides: {} })
};
const ACTIVE = { 'omega_orgs/concordenergyusa.com': { status: 'active' } };
function reset(d) { DOCS = Object.assign({}, ACTIVE, d || {}); }
reset();
const libPath = require.resolve(path.join(__dirname, '..', '..', 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: fakeAdmin };
const api = require(path.join(__dirname, '..', '..', 'api', 'site-prequal.js'));
const score = api.score;

/* A site that is comfortable on every axis except the one under test. */
const GOOD = { propertyAreaSf: 8000, buildingFootprintSf: 1000, parkingSpaces: 0,
               pins: 1, zoningOk: true, floodOk: true, hostingCapacityKw: 1200 };
function s(over) { return score(Object.assign({}, GOOD, over || {})); }

console.log('silence is not confirmation');
ok(s({ zoningOk: undefined, floodOk: undefined }).breakdown.zoning === 0,
   'an unanswered zoning/flood pair scores zero');
ok(s({ zoningOk: false, floodOk: false }).breakdown.zoning === 0, 'explicitly denied scores zero');
ok(s({ zoningOk: true, floodOk: false }).breakdown.zoning === 5, 'one of two scores half');
ok(s().breakdown.zoning === 10, 'both confirmed scores ten');
ok(s({ zoningOk: 'yes', floodOk: 'yes' }).breakdown.zoning === 0,
   'a truthy string is not a confirmation — only true is');

console.log('\na benchmark is not the project');
const bench = s();
const big = s({ system: { kw: 2400, kwh: 9600, footprintSf: 6000 } });
ok(bench.screenedConfiguredSystem === false, 'no design sent screens the benchmark');
ok(/^Benchmark/.test(bench.systems.full.label), 'and says so in the label');
ok(big.screenedConfiguredSystem === true, 'a design sent screens the design');
ok(big.systems.full.label === 'Configured system', 'and says so in the label');
ok(big.breakdown.area.full < bench.breakdown.area.full,
   'a 9.6 MWh design scores the same parcel lower on area than the 1 MW benchmark');
ok(big.fullScore < bench.fullScore, 'and lower overall at full size');
/* bestScore can legitimately tie: the half-size alternative to a big design
   may still clear its top band on a roomy parcel. The claim is that the
   answer TRACKS the design, so prove it where the parcel is genuinely tight
   rather than asserting a difference that need not exist. */
const tight = { propertyAreaSf: 4200, buildingFootprintSf: 200 };
ok(score(Object.assign({}, GOOD, tight, { system: { kw: 4000, kwh: 16000, footprintSf: 9000 } })).bestScore
   < score(Object.assign({}, GOOD, tight)).bestScore,
   'on a tight parcel a large design scores below the benchmark end to end');
ok(s({ system: { kw: 2400, kwh: 0 } }).screenedConfiguredSystem === false,
   'half a nameplate is not a system — kWh missing falls back to the benchmark');
ok(s({ system: { kw: 0, kwh: 9600 } }).screenedConfiguredSystem === false,
   'kW missing falls back too');

console.log('\ncapacity is three answers');
ok(s({ hostingCapacityKw: null }).capacity.level === 'pending', 'not entered is pending');
ok(s({ hostingCapacityKw: 200 }).capacity.level === 'risk', 'below half-system is risk');
ok(s({ hostingCapacityKw: 600 }).capacity.level === 'ok', 'between the two is ok');
ok(s({ hostingCapacityKw: 5000 }).capacity.level === 'good', 'above full is good');
ok(s({ hostingCapacityKw: 'abc' }).capacity.level === 'pending', 'unparseable is pending, never good');
ok(s({ hostingCapacityKw: 200 }).tier === 'Hold — Grid Constraint',
   'a grid constraint outranks a strong area score');
ok(s({ hostingCapacityKw: null }).tier === 'Conditional — Capacity Pending',
   'an unanswered capacity question caps the answer at conditional');

console.log('\nincomplete input');
ok(s({ propertyAreaSf: 0 }).inputComplete === false, 'no property area is incomplete');
ok(s({ propertyAreaSf: 0 }).tier === 'Incomplete — property area required',
   'and the tier says which input is missing');
ok(s({ buildingFootprintSf: 99999 }).availableSf === 0,
   'a building larger than the parcel yields zero open area, not a negative');

console.log('\nthe endpoint');
function call(req) { try { return Promise.resolve(api(req)); } catch (e) { return Promise.reject(e); } }
const REQ = { method: 'POST', headers: {}, body: GOOD };

Promise.resolve()
  .then(() => call({ method: 'GET', headers: {}, body: {} })
    .then(() => ok(false, 'GET is refused'), e => ok(e.status === 405, 'GET is refused')))
  .then(() => { reset({ 'omega_orgs/concordenergyusa.com': { status: 'suspended' } });
    return call(REQ).then(() => ok(false, 'a suspended tenant is refused'),
                          e => ok(e.status === 403, 'a suspended tenant is refused')); })
  .then(() => { reset({}); DOCS = {};
    return call(REQ).then(() => ok(false, 'an unknown tenant is refused'),
                          e => ok(e.status === 403, 'an unknown tenant is refused')); })
  .then(() => { reset();
    AUTH = () => Promise.reject(fakeAdmin.httpError(401, 'invalid token'));
    return call(REQ).then(() => ok(false, 'an unauthenticated caller is refused'),
                          e => ok(e.status === 401, 'an unauthenticated caller is refused')); })
  .then(() => { AUTH = () => Promise.resolve({ uid: 'u1', email: 'pm@concord.com',
                                               orgId: 'concordenergyusa.com', staff: false });
    return call(REQ).then(r => {
      ok(r && r.tier === 'Priority Go', 'an active tenant gets a scored result');
      ok(r.systems && r.breakdown && r.recommend && r.capacity,
         'the response carries every field editor.html reads');
    }); })
  .then(() => {
    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
  });
