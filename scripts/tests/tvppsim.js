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

/* The prefixes that straddle a market boundary, each pinned so it cannot
   fall back to its state's default market (c24, c26, c27). */
[['88510', 'TX', 'WEST', /El Paso/], ['77701', 'TX', 'MISO', /Entergy Texas/], ['75601', 'TX', 'SPP', /SWEPCO/],
 ['71101', 'LA', 'SPP', /SWEPCO/], ['72701', 'AR', 'SPP', /SWEPCO|OG&E/], ['72901', 'AR', 'SPP', /OG&E/],
 ['46601', 'IN', 'PJM', /Indiana Michigan/], ['46802', 'IN', 'PJM', /Indiana Michigan/], ['47303', 'IN', 'PJM', /Indiana Michigan/],
 ['41101', 'KY', 'PJM', /Kentucky Power/], ['41501', 'KY', 'PJM', /Kentucky Power/], ['41011', 'KY', 'PJM', /Duke Energy Kentucky/],
 ['27954', 'NC', 'PJM', /Dominion/], ['27601', 'NC', 'SE', /Duke/], ['28202', 'NC', 'SE', /Duke/],
 ['20147', 'VA', 'PJM', null], ['20166', 'VA', 'PJM', null], ['20001', 'DC', 'PJM', null], ['00901', 'PR', 'PR', null]].forEach(function (c) {
  var l = S.locate(c[0]);
  ok(c[0] + ' is ' + c[1] + ' / ' + c[2], l.ok && l.state === c[1] && l.market === c[2] && (!c[3] || c[3].test(l.area)), l);
});
ok('Beaumont (Entergy Texas, MISO) is offered no ERCOT 4CP or ERS', (function () {
  var r = S.simulate({ zip: '77701', segment: 'industrial', load: { type: 'profile', annualKwh: 8000000 } });
  return r.ok && !stream(r, 'ercot.4cp') && !stream(r, 'ercot.ers') && !stream(r, 'ercot.ader');
})());
ok('El Paso 885 is offered no ERCOT ADER', !stream(S.simulate({ zip: '88510', segment: 'residential' }), 'ercot.ader'));
/* R10: Dominion NC, I&M Indiana and Kentucky Power (and Duke Energy
   Kentucky) are in PJM, but bundled: no PLC-set capacity charge on the bill,
   and the state has closed PJM demand response to retail customers except
   through the utility (NCUC E-22 Sub 418, IURC 43566, KY PSC 2017-00129).
   Both PJM customer rows are listed with the reason, never priced; a
   business gets the utility's own tariff as a planning row. */
[['27954', /E-22, Sub 418/, /North Carolina has no retail choice/, /Schedule 6C.*500 kW or greater.*peaks at [\d,]+ kW/], ['27909', /E-22, Sub 418/, /North Carolina/, /Schedule 6C/],
 ['46802', /IURC Cause 43566/, /Indiana has no retail choice/, /D\.R\.S\.1.*at least 100 kW.*commits [\d.]+ kW/], ['47303', /IURC Cause 43566/, /Indiana/, /D\.R\.S\.1/],
 ['41101', /2017-00129/, /Kentucky has no retail choice/, /Rider D\.R\.S\. sets .*500 kW.*commits [\d.]+ kW/], ['41011', /2017-00129/, /Kentucky/, /500 kW/]].forEach(function (c) {
  ['commercial', 'industrial', 'residential'].forEach(function (seg) {
    var r = S.simulate({ zip: c[0], segment: seg }), u = stream(r, 'pjm.utility');
    var capWhy = r.missing.filter(function (m) { return /^PJM capacity via curtailment/.test(m); })[0] || '';
    var plcWhy = r.missing.filter(function (m) { return /^Capacity tag \(PLC\)/.test(m); })[0] || '';
    ok(c[0] + ' ' + seg + ': still PJM, but no CSP capacity or PLC saving is priced; both are listed with the dated reason',
       r.ok && r.site.market === 'PJM' && !stream(r, 'pjm.capacity') && !stream(r, 'pjm.plc') && r.totals.tagSavings === 0 &&
       c[1].test(capWhy) && c[2].test(plcWhy) && !stream(r, 'se.dr') && !stream(r, 'miso.dr'), [r.site, capWhy, plcWhy]);
    /* T7: the named tariffs have size floors (Kentucky Power D.R.S. 500 kW
       committed, Dominion NC Schedule 6C 500 kW contracted, I&M D.R.S.1
       100 kW): a default site is far below them, listed with the reason */
    ok(c[0] + ' ' + seg + ': ' + (seg === 'residential' ? 'no utility route for a home battery is priced, and it says so' : 'the utility\'s tariff is below its size floor for a typical site: listed with the tariff\'s own minimum, never priced'),
       seg === 'residential' ? !u && r.missing.some(function (m) { return /^Utility demand-response tariff/.test(m) && /business customers/.test(m); })
                             : !u && r.missing.some(function (m) { return /^Utility demand-response tariff/.test(m) && c[3].test(m) && /below it; not counted/.test(m); }) && r.totals.gridEarnings === 0, u || r.missing);
  });
  var big = S.simulate({ zip: c[0], segment: 'industrial', battery: { kw: 1500, kwh: 6000 }, load: { type: 'profile', annualKwh: 30000000 } }), ub = stream(big, 'pjm.utility');
  ok(c[0] + ' a site above the floor: the utility\'s own tariff is the route, a planning row', !!ub && ub.counted && ub.tier === 'planning' && /Rider D\.R\.S/.test(ub.ref) && ub.committedKw >= 500, ub || big.missing);
});
ok('a PJM state with retail choice still prices CSP capacity and the PLC tag, and never offers the bundled-state utility row', (function () {
  var r = S.simulate({ zip: '19103', segment: 'commercial' }), il = S.simulate({ zip: '60601', segment: 'industrial' });
  return !!stream(r, 'pjm.capacity') && !!stream(r, 'pjm.plc') && !stream(r, 'pjm.utility') && !r.missing.some(function (m) { return /Utility demand-response tariff/.test(m); }) &&
         !!stream(il, 'pjm.plc') && !stream(il, 'pjm.utility');
})());
ok('a bundled-state ZIP moved into PJM by the user is gated the same way (Raleigh, NC)', (function () {
  var r = S.simulate({ zip: '27601', segment: 'industrial', market: 'PJM', battery: { kw: 1500, kwh: 6000 }, load: { type: 'profile', annualKwh: 30000000 } });
  return r.ok && r.site.market === 'PJM' && !stream(r, 'pjm.plc') && !stream(r, 'pjm.capacity') && !!stream(r, 'pjm.utility');
})());
ok('the US Virgin Islands (008) are refused, not priced as Puerto Rico', S.locate('00802').ok === false);
/* R13: Murphy (289) is TVA-distributor country and Rocky Mount / Wilson
   (278) are municipal systems: the label never says they are Duke's. */
ok('Murphy, NC (289) reads TVA distributors, not Duke', /TVA/.test(S.locate('28906').area) && !/^Duke/.test(S.locate('28906').area) && S.locate('28906').market === 'SE' && /^Duke Energy \(North Carolina\)$/.test(S.locate('28801').area), S.locate('28906').area);
ok('Rocky Mount / Wilson (278) are named municipal, not Duke Energy Progress customers', /municipal/.test(S.locate('27804').area) && /Duke Energy Progress area/.test(S.locate('27804').area), S.locate('27804').area);
/* New York by utility (c5, c23): Con Edison's DLM follows its territory,
   the NYC SCR price follows Zone J, Long Island is PSEG Long Island. */
[['10001', true, true, false], ['11201', true, true, false], ['11004', true, true, false], ['10601', true, false, false],
 ['10701', true, false, false], ['11501', false, false, true], ['11530', false, false, true], ['11050', false, false, true],
 ['11691', false, false, true], ['11747', false, false, true], ['14201', false, false, false]].forEach(function (c) {
  var l = S.locate(c[0]);
  ok(c[0] + ': Con Ed ' + c[1] + ', Zone J ' + c[2] + ', Long Island ' + c[3], l.conEd === c[1] && l.zoneJ === c[2] && l.li === c[3] && l.nyc === c[2], l);
});
ok('Long Island reads PSEG Long Island, never Con Edison', /PSEG Long Island/.test(S.locate('11501').area) && !/Con Ed/i.test(S.locate('11691').area));
(function () {
  var li = S.simulate({ zip: '11501', segment: 'commercial', battery: { kw: 100, kwh: 400 } });
  var up = S.simulate({ zip: '12203', segment: 'commercial', battery: { kw: 100, kwh: 400 } });
  var nyc = S.simulate({ zip: '10001', segment: 'commercial', battery: { kw: 100, kwh: 400 } });
  var wch = S.simulate({ zip: '10601', segment: 'commercial', battery: { kw: 100, kwh: 400 } });
  ok('Nassau is not paid Con Edison\'s DLM or NYC\'s SCR rate', stream(li, 'ny.dlm').usd === stream(up, 'ny.dlm').usd && stream(li, 'ny.scr').usd === stream(up, 'ny.scr').usd && /Long Island/.test(stream(li, 'ny.dlm').how));
  ok('the DLM row is named Con Edison only in Con Edison territory', /Con Edison/.test(stream(nyc, 'ny.dlm').name) && !/Con Edison/.test(stream(up, 'ny.dlm').name) && !/Con Edison/.test(stream(li, 'ny.dlm').name));
  ok('Westchester gets Con Edison\'s DLM but not the NYC SCR price', stream(wch, 'ny.dlm').usd === stream(nyc, 'ny.dlm').usd && stream(wch, 'ny.scr').usd === stream(up, 'ny.scr').usd);
})();
ok('a market override that changes the market drops the area label', S.locate('60601', 'MISO').area === null && S.locate('10001', 'PJM').area === null && /ComEd/.test(S.locate('60601', 'PJM').area));

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
/* DSGS Option 3 is closed to a new aggregation for 2026 and unfunded for
   2027 (c22): listed with the reason, never priced or counted. */
ok('DSGS is not priced and is listed as closed', !stream(caRes, 'ca.dsgs') &&
   caRes.missing.some(function (m) { return /^Demand Side Grid Support/.test(m) && /Closed to a new aggregation/.test(m) && /October 2025/.test(m) && /2027/.test(m); }), caRes.missing);
ok('DSGS cites the adopted 5th-edition guidelines by their number (CEC-300-2026-001-CMF)', caRes.missing.some(function (m) { return /^Demand Side Grid Support/.test(m) && /CEC-300-2026-001-CMF\b/.test(m); }), caRes.missing);
ok('ELRP is never told it lost to the closed DSGS',!caRes.streams.some(function (x) { return x.why && /DSGS/.test(x.why); }));
ok('ELRP on a TOU home battery that already empties into 4–9 pm is listed with the reason, not priced', !stream(caRes, 'ca.elrp') &&
   caRes.missing.some(function (m) { return /^Emergency Load Reduction/.test(m) && /beyond the site's usual load/.test(m); }), caRes.missing);
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
/* ComEd's programme is the approved Rider SDVPP (c21): $10 per kW-Season of
   average smart-inverter injection, metered at the battery (no site cap),
   published — not the withdrawn Rider VPP at a $150 planning rate. */
var cv = stream(com, 'pjm.comedvpp');
ok('ComEd Rider SDVPP is offered in ComEd territory', !!cv && /Rider SDVPP/.test(cv.name) && cv.tier === 'published', cv);
ok('SDVPP is priced at $10/kW-Season on the battery\'s own injection', cv && /\$10\/kW-Season/.test(cv.how) && cv.how.indexOf('Capped at the site') < 0 &&
   Math.abs(cv.usd - Math.min(250, 1000 * 0.9 * Math.sqrt(0.88) / 2) * 10 * 0.9) <= 1, cv && [cv.usd, cv.how]);
ok('its ref names the approval and the withdrawn tariff, dated', cv && /2026-07-16/.test(cv.ref) && /2027-03-01/.test(cv.ref) && /25-0678/.test(cv.ref) && /withdrew/.test(cv.ref) && !/before the ICC/.test(cv.ref));
var plcC = stream(com, 'pjm.plc');
ok('an oversized battery is capped at the site load for a load-reduction programme', plcC && plcC.how.indexOf('Capped at the site') >= 0, plcC && plcC.how);
ok('ComEd VPP is NOT offered outside ComEd', !stream(S.simulate({ zip: '19103', segment: 'commercial' }), 'pjm.comedvpp'));
/* Through a CSP a behind-the-meter battery is a PJM Demand Resource (c29):
   the DR class rating, published beside the storage classes in
   value-stack.js, not a "no storage class" refusal. */
var VS = require(path.join(ROOT, 'api', '_lib', 'value-stack'));
ok('the Demand Resource rating is dated and sourced beside the storage classes', VS.PJM.drElcc === 0.91 && /2028\/2029/.test(VS.PJM.drElccRef) && /Demand Resource 91%/.test(VS.PJM.drElccRef));
var twoHr = S.simulate({ zip: '19103', segment: 'commercial', battery: { kw: 50, kwh: 100 } });
var pc2 = stream(twoHr, 'pjm.capacity');
ok('a two-hour PJM battery is valued as a Demand Resource, at what it holds for four hours (planning)', pc2 && pc2.tier === 'planning' && /Demand Resource/.test(pc2.how) &&
   Math.abs(pc2.usd - 100 * 0.9 * Math.sqrt(0.88) / 4 * 0.91 / 1000 * 325 * 365 * 0.9) <= 1 && !twoHr.missing.some(function (m) { return /storage class/.test(m); }), pc2);
var fourHr = S.simulate({ zip: '19103', segment: 'commercial', battery: { kw: 50, kwh: 250 } });
var pc = stream(fourHr, 'pjm.capacity');
ok('a 4.5-hour PJM battery is its full rating at the published DR rating and clearing price', pc && pc.tier === 'published' && pc.usd > 0 && /91%/.test(pc.how) && /50 kW nominated/.test(pc.how), pc);
/* S4: a kW capped at a summer peak read off an ASSUMED load is not a
   published figure; the same cap on the site's own readings is. */
var bigOnTypical = stream(S.simulate({ zip: '19103', segment: 'commercial', battery: { kw: 500, kwh: 4000 } }), 'pjm.capacity');
ok('an oversized PJM battery capped at an ASSUMED load\'s peak is planning, and says why', bigOnTypical && bigOnTypical.tier === 'planning' &&
   /Capped at the site/.test(bigOnTypical.how) && /load shape/.test(bigOnTypical.how), bigOnTypical);
var flat80 = []; for (var fi = 0; fi < 8760; fi++) flat80.push(80);
var bigOnOwn = stream(S.simulate({ zip: '19103', segment: 'commercial', battery: { kw: 500, kwh: 4000 }, load: { type: 'interval', values: flat80, startDate: '2025-01-01' } }), 'pjm.capacity');
ok('…capped at the site\'s own interval peak it is published', bigOnOwn && bigOnOwn.tier === 'published' && /Capped at the site's 80 kW/.test(bigOnOwn.how) && !/load shape/.test(bigOnOwn.how), bigOnOwn);
var pjmRes = S.simulate({ zip: '19103', segment: 'residential' });
ok('a PJM home battery is no longer refused with a storage-class reason', !!stream(pjmRes, 'pjm.capacity') && !pjmRes.missing.some(function (m) { return /storage class|four hours/.test(m); }), pjmRes.missing);

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

/* ── review fixes: the engine (each case fails without its fix) ────────── */
section('Losses (c1)');
[{ zip: '94110', segment: 'residential' }, { zip: '60601', segment: 'commercial', battery: { kw: 250, kwh: 1000, rte: 0.6 } }].forEach(function (c) {
  var r = S.simulate(c), ratio = r.battery.dischargedKwh / r.battery.chargedKwh;
  ok('delivered / bought over the year is the round trip (' + r.battery.rte + '), not its square root: ' + c.zip,
     r.ok && Math.abs(ratio / r.battery.rte - 1) < 0.01, { ratio: ratio, rte: r.battery.rte });
});
[{ zip: '60601', segment: 'commercial', battery: { kw: 250, kwh: 250 } }, { zip: '30301', segment: 'commercial', battery: { kw: 100, kwh: 100 } }].forEach(function (c) {
  var r = S.simulate(c);
  ok('the demand target the bisection sets is one the dispatch holds, losses included: ' + c.zip + ' ' + c.battery.kw + '/' + c.battery.kwh,
     r.ok && r.monthly.every(function (m) { return m.targetKw == null || m.peakAfterKw <= m.targetKw + 0.01; }), r.monthly.map(function (m) { return [m.peakAfterKw, m.targetKw]; }));
});
/* S1: an over-target stretch that runs past midnight (or past a month's
   end) with no charging hour between is ONE discharge; the day-by-day test
   cannot see it, so the targets are re-checked with the dispatch's own
   reserve across day and month boundaries. */
[{ zip: '96813', segment: 'commercial', battery: { kw: 100, kwh: 200 }, solarKw: 300 },
 { zip: '94110', segment: 'commercial', battery: { kw: 100, kwh: 200 }, solarKw: 300 }].forEach(function (c) {
  var r = S.simulate(c);
  ok('a target held across the 30 Apr → 1 May night (solar site): ' + c.zip,
     r.ok && r.monthly.every(function (m) { return m.targetKw == null || m.peakAfterKw <= m.targetKw + 0.01; }), r.monthly.map(function (m) { return [m.month, m.peakAfterKw, m.targetKw]; }));
});
(function () {
  var nv = []; for (var h = 0; h < 8760; h++) { var dd = Math.floor(h / 24), hh = h % 24; nv.push((dd === 160 && hh >= 20) || (dd === 161 && hh < 4) ? 150 : 50); }
  var r = S.simulate({ zip: '60601', segment: 'commercial', battery: { kw: 100, kwh: 200 }, tariff: { demandCharge: 20, onPeakRate: 0.1, offPeakRate: 0.1 }, load: { type: 'interval', values: nv } });
  var jun = r.monthly[5];
  ok('an over-target night that crosses midnight: June holds its target and the battery lowers June\'s bill',
     r.ok && jun.peakAfterKw <= jun.targetKw + 0.01 && jun.billAfter < jun.billBefore && stream(r, 'bill.demand').usd > 0, [jun, stream(r, 'bill.demand').usd]);
})();

section('Events (c2, c7, c28)');
function hasEvent(r) { return r.sampleDay.hours.some(function (x) { return x.event; }); }
var ev1 = S.simulate({ zip: '94110', segment: 'commercial', battery: { kw: 100, kwh: 400 } });
var el1 = stream(ev1, 'ca.elrp');
ok('ELRP is priced from what the dispatch delivers in the event hours, never more', el1 && el1.deliveredKwh <= el1.eventHoursKwh + 1e-6 &&
   Math.abs(el1.usd - el1.deliveredKwh * 0.9 * 2) <= 1 && /delivered/.test(el1.how), el1);
var ev2 = S.simulate({ zip: '94110', segment: 'residential', battery: { kw: 5, kwh: 13.5 }, tariff: { demandCharge: 15, onPeakRate: 0.3, offPeakRate: 0.3 } });
var el2 = stream(ev2, 'ca.elrp');
ok('where ELRP is counted, the bill streams are the dispatch WITH the events', el2 && el2.counted && ev2.battery.eventKwh >= el2.deliveredKwh - 1 && hasEvent(ev2), el2);
ok('an event takes only what no later over-target hour needs: every month holds its demand target', ev2.monthly.every(function (m) { return m.targetKw == null || m.peakAfterKw <= m.targetKw + 0.01; }),
   ev2.monthly.map(function (m) { return [m.peakAfterKw, m.targetKw]; }));
ok('where ELRP is not counted, no event is drawn', !el1.counted && !hasEvent(ev1));
/* R1: on a day with no price spread every hour is a charging hour, so a
   dispatch free to buy inside a called event would buy there and have it
   taken off the reduction ELRP pays for. */
var flatLoad = [], CUM0 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
for (var fh = 0; fh < 8760; fh++) {
  /* summer weekdays: a midday and an evening stretch over the target, the
     event window between them (a touch higher in July, so July's first
     weekday — the day drawn — is an event day) */
  var fd = Math.floor(fh / 24), fhr = fh % 24, fdw = (3 + fd) % 7, fm = 0, fx = 1;
  while (fm < 11 && fd >= CUM0[fm + 1]) fm++;
  if (fm >= 5 && fm <= 8 && fdw !== 0 && fdw !== 6) fx = fhr >= 12 && fhr < 16 ? 6 : (fhr >= 16 && fhr < 19 ? (fm === 6 ? 3.2 : 3) : (fhr >= 19 && fhr < 22 ? 6 : 1));
  flatLoad.push(fx);
}
var evFlat = S.simulate({ zip: '94110', segment: 'residential', battery: { kw: 5, kwh: 10 }, tariff: { demandCharge: 15, onPeakRate: 0.3, offPeakRate: 0.3 },
  load: { type: 'interval', values: flatLoad, startDate: '2025-01-01' } });
var evFlatHours = evFlat.sampleDay.hours.filter(function (x) { return x.event; });
ok('the battery never charges from the grid inside a called ELRP event (flat energy price)', stream(evFlat, 'ca.elrp').counted && evFlatHours.length > 0 &&
   evFlatHours.every(function (x) { return x.battery >= -1e-9 || x.load - x.solar < 0; }), evFlatHours);
/* T8: a behind-the-meter battery in a VPP is ELRP A.4 whatever the segment
   (SCE's aggregator FAQ: storage "deployed with residential … or
   non-residential … customers"), so a business battery is 7 × 3 h too. */
ok('ELRP: every battery in this VPP is sub-group A.4, 3 h events — a home and a business alike', /× 3 h/.test(el2.how) && /× 3 h/.test(el1.how) && /A\.4/.test(el2.ref) &&
   /non-residential/.test(el2.ref) && !/A\.6/.test(el2.ref) && !/a non-residential site through an aggregator in A\.2/.test(el2.ref), [el1.how, el2.ref]);
/* R12: the planning year is the recent dispatch record (PG&E and SCE PY2024
   evaluations: seven A.4 events, two and three A.2), not twelve. */
ok('ELRP\'s planning year is the 2024 A.4 record: 7 events of 3 h for a home battery and a business', /^7 events × 3 h/.test(el2.how) && /^7 events × 3 h/.test(el1.how) &&
   /2024/.test(el2.ref) && /calmac/.test(el2.ref) && /through 2027/.test(el2.ref) && !/12 events/.test(el2.ref), [el2.how, el1.how]);
/* d3: CBP/DRAM and ELRP are not mutually exclusive (ELRP Group B), only
   the top-up is not modelled. */
var loser = el1.counted ? stream(ev1, 'ca.ra') : el1;
ok('the CBP/DRAM – ELRP loser says they can sit together through ELRP Group B, not "one of the two"', loser && !loser.counted && /Group B/.test(loser.why) && /not modelled/.test(loser.why) && !/one of the two/.test(loser.why), loser && loser.why);

section('Interval files (c3, c6, c11)');
function iso(y, m, d) { return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d; }
function dayAt(y, m, d, k) { var x = new Date(Date.UTC(y, m - 1, d + k)); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()]; }
var CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
/* A year of hourly load on the 2025 calendar: hot summers, weekday offices. */
function loadAt(m, d, hr) {
  var doy = CUM[m - 1] + d - 1, we = (3 + doy) % 7 === 0 || (3 + doy) % 7 === 6;
  return Math.round((60 + 40 * Math.max(0, Math.sin((doy - 100) / 365 * 2 * Math.PI)) + (we ? 0 : 50 * Math.max(0, Math.sin((hr - 6) / 12 * Math.PI)))) * 100) / 100;
}
function csv(y, m, d, days, header) {
  var rows = header ? [header] : [];
  for (var k = 0; k < days; k++) {
    var t = dayAt(y, m, d, k), mm = t[1], dd = t[2] === 29 && t[1] === 2 ? 28 : t[2];
    for (var hr = 0; hr < 24; hr++) rows.push(iso(t[0], t[1], t[2]) + ' ' + (hr < 10 ? '0' : '') + hr + ':00,' + loadAt(mm, dd, hr));
  }
  return rows.join('\n');
}
var jan = S.simulate({ zip: '60601', segment: 'commercial', battery: { kw: 50, kwh: 100 }, load: { type: 'interval', text: csv(2025, 1, 1, 365, 'Timestamp,kW') } });
var jul = S.simulate({ zip: '60601', segment: 'commercial', battery: { kw: 50, kwh: 100 }, load: { type: 'interval', text: csv(2025, 7, 2, 365, 'Timestamp,kW') } });
ok('a trailing-12-month file (from 2 Jul) lands each reading on its own date: the same answer as 1 Jan', jan.ok && jul.ok && jan.totals.gross === jul.totals.gross &&
   jan.monthly[0].peakKw === jul.monthly[0].peakKw && jan.monthly[6].peakKw === jul.monthly[6].peakKw, [jan.totals.gross, jul.totals.gross, jul.monthly[0].peakKw]);
ok('…and says where it started', jul.load.notes.some(function (n) { return /2 Jul 2025/.test(n); }) && jul.load.quality === 'high', jul.load.notes);
var vals = []; for (var vi = 0; vi < 8760; vi++) { var vt = dayAt(2025, 7, 2, Math.floor(vi / 24)); vals.push(loadAt(vt[1], vt[2], vi % 24)); }
var viaStart = S.simulate({ zip: '60601', segment: 'commercial', battery: { kw: 50, kwh: 100 }, load: { type: 'interval', values: vals, startDate: '2025-07-02' } });
ok('a bare list takes a startDate and lands the same way', viaStart.ok && viaStart.totals.gross === jan.totals.gross, viaStart.errors || viaStart.totals.gross);
var undated = S.simulate({ zip: '60601', segment: 'commercial', battery: { kw: 50, kwh: 100 }, load: { type: 'interval', values: vals } });
ok('an undated list is read as starting 1 January, said so, and is not "high" quality', undated.ok && undated.load.quality === 'medium' &&
   undated.load.notes.some(function (n) { return /read as starting on 1 January/.test(n); }), undated.load);
ok('a bad startDate is refused', S.simulate({ zip: '60601', load: { type: 'interval', values: vals, startDate: '2025-13-40' } }).errors[0].field === 'load.startDate');
var leapVals = []; for (vi = 0; vi < 8784; vi++) leapVals.push(Math.floor(vi / 24));
var leap = S.intervalToHourly(leapVals, 'kw', null);
ok('an undated 8784 loses 29 Feb (day 60), not 31 Dec', leap.ok && leap.kw[58 * 24] === 58 && leap.kw[59 * 24] === 60 && leap.kw[364 * 24] === 365, leap.ok && [leap.kw[59 * 24], leap.kw[364 * 24]]);
var leapCsv = [];
for (vi = 0; vi < 366; vi++) { var lt = dayAt(2024, 1, 1, vi); for (var lh = 0; lh < 24; lh++) leapCsv.push(iso(lt[0], lt[1], lt[2]) + 'T' + (lh < 10 ? '0' : '') + lh + ':00,' + (lt[1] === 2 && lt[2] === 29 ? 999 : 5)); }
var leap2 = S.parseInterval(leapCsv.join('\n'), 'kw');
ok('a dated 2024 file drops its 29 Feb readings and says so', leap2.ok && leap2.kw.indexOf(999) < 0 && leap2.notes.some(function (n) { return /29 Feb 2024 was removed/.test(n); }), leap2.ok ? leap2.notes : leap2);
/* Fixtures carry a real year of timestamps: a file whose timestamps repeat is
   refused (U1), so a constant date is no longer a year of readings. */
function tsAt(i, per) { var t = dayAt(2025, 1, 1, Math.floor(i / (24 * per))), mins = (i % (24 * per)) * (60 / per); return [iso(t[0], t[1], t[2]), (mins < 600 ? '0' : '') + Math.floor(mins / 60) + ':' + (mins % 60 < 10 ? '0' : '') + (mins % 60)]; }
var q = [], qi; for (qi = 0; qi < 8760; qi++) q.push('"' + tsAt(qi, 1).join(' ') + '","1,234.5"');
var quoted = S.parseInterval(q.join('\n'), 'kw');
ok('a quoted "1,234.5" is one reading of 1,234.5', quoted.ok && quoted.kw[0] === 1234.5, quoted.ok ? quoted.kw[0] : quoted);
var gb = ['Name,ACCOUNT NAME', 'Address,1 MAIN ST', 'Account Number,12345', 'Service,Service 1', '', 'TYPE,DATE,START TIME,END TIME,USAGE,UNITS,COST,NOTES'];
for (qi = 0; qi < 35040; qi++) { var gt = dayAt(2025, 1, 1, Math.floor(qi / 96)); gb.push('Electric usage,' + iso(gt[0], gt[1], gt[2]) + ',' + tsAt(qi, 4)[1] + ',00:14,0.25,kWh,$0.03,'); }
var green = S.parseInterval(gb.join('\n'), 'kwh');
ok('a utility (Green Button) download reads USAGE, not the $ COST column', green.ok && Math.abs(green.kw[0] - 1) < 1e-9, green.ok ? green.kw[0] : green);
var greenKw = S.parseInterval(gb.join('\n'), 'kw');
ok('…and says so when its kWh column was read as kW', greenKw.ok && greenKw.notes.some(function (n) { return /looks like kWh per interval/.test(n); }), greenKw.notes);
var costRows = ['Start,Usage,Units,Cost']; for (qi = 0; qi < 8760; qi++) costRows.push(tsAt(qi, 1).join(' ') + ',40.0,kWh,$6.00');
var cost = S.parseInterval(costRows.join('\n'), 'kwh');
ok('a trailing $ cost column is never the load', cost.ok && cost.kw[0] === 40, cost.ok ? cost.kw[0] : cost);
var dollarRows = []; for (qi = 0; qi < 8760; qi++) dollarRows.push(tsAt(qi, 1).join(' ') + ',40.0,$6.00');
var dollars = S.parseInterval(dollarRows.join('\n'), 'kw');
ok('a cell with a currency sign is never a reading, header or not', dollars.ok && dollars.kw[0] === 40, dollars.ok ? dollars.kw[0] : dollars);
var twoCol = []; for (qi = 0; qi < 8760; qi++) twoCol.push((qi % 24) + ',5.2');
ok('two numeric columns and no header are refused, not guessed', /more than one column/i.test(S.parseInterval(twoCol.join('\n'), 'kw').error || ''));
var amb = ['Date,Import kWh,Delivered kWh']; for (qi = 0; qi < 8760; qi++) amb.push(tsAt(qi, 1).join(' ') + ',1,2');
ok('two load-named columns the unit cannot tell apart are refused', /more than one load column/i.test(S.parseInterval(amb.join('\n'), 'kwh').error || ''));
var nem = ['TYPE,DATE,START TIME,END TIME,IMPORT (kWh),EXPORT (kWh),COST']; for (qi = 0; qi < 8760; qi++) nem.push('Electric usage,' + tsAt(qi, 1).join(',') + ',00:59,2.5,0.4,$0.50');
var nemR = S.parseInterval(nem.join('\n'), 'kwh');
ok('an IMPORT / EXPORT download reads the imports as the load, and says the export was set aside', nemR.ok && nemR.kw[0] === 2.5 && nemR.notes.some(function (n) { return /export column/.test(n); }), nemR.ok ? nemR.notes : nemR);
var both = ['Date,kWh,kW']; for (qi = 0; qi < 8760; qi++) both.push(tsAt(qi, 1).join(' ') + ',3,7');
/* The load-column contract (round 3): two load columns are never told apart
   by the unit chosen (T1 — a register or a price beside "Usage" won that
   narrowing); the caller names the column, by its header or "#n". */
var bothAsk = S.parseInterval(both.join('\n'), 'kw');
ok('a kWh and a kW column: "Which column is the load?", with both columns, keys and samples', !bothAsk.ok && bothAsk.field === 'load.column' && /^Which column is the load\?/.test(bothAsk.error) &&
   JSON.stringify(bothAsk.columns) === JSON.stringify([{ key: 'kWh', label: 'kWh', sample: ['3', '3', '3'] }, { key: 'kW', label: 'kW', sample: ['7', '7', '7'] }]), bothAsk);
ok('…and read as the caller names it (header text or "#3")', S.parseInterval(both.join('\n'), 'kw', null, 'kW').kw[0] === 7 && S.parseInterval(both.join('\n'), 'kwh', null, 'kWh').kw[0] === 3 &&
   S.parseInterval(both.join('\n'), 'kw', null, '#3').kw[0] === 7 && S.parseInterval(both.join('\n'), 'kw', null, ' kW ').column.chosen === 'caller');
var t0 = Date.now(), big = S.parseInterval(new Array(1000001).join('9') + 'x', 'kw'), ms = Date.now() - t0;
ok('a 1 MB digit run is refused in well under a second (no quadratic regex)', big.ok === false && ms < 1000, ms + ' ms');
var cells = []; for (qi = 0; qi < 10; qi++) cells.push(new Array(20001).join('9') + 'x');
t0 = Date.now(); var dos = S.simulate({ zip: '60601', load: { type: 'interval', text: cells.join(',') } }); ms = Date.now() - t0;
ok('ten 20,000-digit cells cost milliseconds, not seconds', dos.ok === false && ms < 1000, ms + ' ms');
/* R5: the cap admits a real year of 15-minute readings (a Smart Meter
   Texas export: a 22-digit ESIID and a revision stamp on every row, CRLF,
   ~3.1 MB) and is one number with the page's (4,300,000 characters; the page separately
   checks the posted JSON body in bytes against Vercel's 4.5 MB limit); past it the refusal names a size, not a count. */
function smt() {
  var rows = ['ESIID,USAGE_DATE,REVISION_DATE,USAGE_START_TIME,USAGE_END_TIME,USAGE_KWH,ESTIMATED_ACTUAL,CONSUMPTION_SURPLUSGENERATION'];
  function p2(x) { return (x < 10 ? '0' : '') + x; }
  for (var i = 0; i < 35040; i++) {
    var t = dayAt(2025, 1, 1, Math.floor(i / 96)), q = i % 96, e = (q + 1) % 96;
    rows.push('1008901023800000000000,' + p2(t[1]) + '/' + p2(t[2]) + '/' + t[0] + ',01/02/2025 06:25:14, ' + p2(Math.floor(q / 4)) + ':' + p2(q % 4 * 15) +
              ', ' + p2(Math.floor(e / 4)) + ':' + p2(e % 4 * 15) + ',0.198,A,Consumption');
  }
  return rows.join('\r\n');
}
var smtText = smt(), smtRun = S.simulate({ zip: '77002', segment: 'commercial', load: { type: 'interval', text: smtText, unit: 'kwh' } });
ok('a one-year 15-minute Smart Meter Texas export (' + (smtText.length / 1e6).toFixed(2) + ' M characters) is simulated, not refused as "larger than a year"',
   smtText.length > 3000000 && smtText.length < S.MAX_TEXT && smtRun.ok && Math.abs(smtRun.load.annualKwh - 0.198 * 35040) < 1, smtRun.errors || smtRun.load);
ok('…and its CONSUMPTION_SURPLUSGENERATION flag (words, not readings) is not called an export column', smtRun.ok && !smtRun.load.notes.some(function (n) { return /export column/.test(n); }), smtRun.load && smtRun.load.notes);
var capErr = S.simulate({ zip: '60601', load: { type: 'interval', text: new Array(S.MAX_TEXT + 2).join('1') } }).errors[0];
ok('the text cap is 4,300,000 characters — the page\'s number — and its refusal names a size', S.MAX_TEXT === 4300000 && S.options().maxTextChars === 4300000 &&
   capErr.field === 'load.text' && /4\.3 million characters/.test(capErr.message) && !/one year of readings\.$/.test(capErr.message), capErr);
ok('a file at the cap is not refused for its size', !S.validate({ zip: '60601', load: { type: 'interval', text: new Array(S.MAX_TEXT + 1).join('1') } }).some(function (e) { return e.field === 'load.text'; }));

section('Interval files: the load column (R2, R8)');
function rowsOf(head, f) { var out = [head]; for (var i = 0; i < 8760; i++) { var t = dayAt(2025, 1, 1, Math.floor(i / 24)); out.push(f(iso(t[0], t[1], t[2]) + ' ' + (i % 24 < 10 ? '0' : '') + (i % 24) + ':00', i)); } return out.join('\n'); }
[['Date,Usage (kWh),Power Factor', '60.0,0.90', 'kw', 60, true], ['Interval End,Usage,Apparent Power (kVA)', '48,55', 'kw', 48, false],
 ['Interval Start,Usage (kWh),Reactive Power (kVAR)', '60.0,11', 'kw', 60, true], ['Date,Demand (kW),Power Factor', '42,0.95', 'kw', 42, false],
 ['Date,Usage (kWh),Voltage (V),Current (Amps)', '60.0,480,72', 'kwh', 60, false]].forEach(function (c) {
  var p = S.parseInterval(rowsOf(c[0], function (ts) { return ts + ',' + c[1]; }), c[2]);
  ok('"' + c[0] + '" read as ' + c[2] + ': the load is the usage/demand column, never power factor, kVA, kVAR, volts or amps' + (c[4] ? ', with the kWh note' : ''),
     p.ok && p.kw[0] === c[3] && (!c[4] || p.notes.some(function (n) { return /looks like kWh per interval/.test(n); })), p.ok ? [p.kw[0], p.notes] : p);
});
var integ = S.parseInterval(rowsOf('Date,Integrated Demand (kW),kVAR', function (ts) { return ts + ',50,11'; }), 'kw');
ok('"Integrated Demand (kW)" is a load column, not a rate (money words match whole)', integ.ok && integ.kw[0] === 50, integ);
var uhour = S.parseInterval(rowsOf('Usage Date,Usage Hour,Usage (kWh)', function (ts, i) { return ts.slice(0, 10) + ',' + (i % 24 + 1) + ',6.5'; }), 'kwh');
ok('"Usage Hour" (a time part) is never a second load column: "Usage (kWh)" is read', uhour.ok && uhour.kw[0] === 6.5 && uhour.kw[5] === 6.5, uhour);
[['Usage Date,Usage Hour,Usage (kWh)', 'kw'], ['Usage Date,Usage Hour,Usage', 'kwh'], ['Usage Date,Usage Hour,Usage', 'kw']].forEach(function (c) {
  var p = S.parseInterval(rowsOf(c[0], function (ts, i) { return ts.slice(0, 10) + ',' + (i % 24 + 1) + ',6.5'; }), c[1]);
  ok('"' + c[0] + '" read as ' + c[1] + ': the hour column is never the load, in either unit', p.ok && p.kw[0] === 6.5 && p.kw[23] === 6.5, p.ok ? p.kw.slice(0, 3) : p.error);
});
var twoKwhText = rowsOf('Date,Usage,Demand (kW),Power Factor', function (ts) { return ts + ',5,20,0.9'; }), twoKwh = S.parseInterval(twoKwhText, 'kw');
ok('"Usage" beside "Demand (kW)" is asked, not narrowed by the unit; the named column is read', !twoKwh.ok && twoKwh.field === 'load.column' &&
   /"Usage", "Demand \(kW\)"/.test(twoKwh.error) && S.parseInterval(twoKwhText, 'kw', null, 'Demand (kW)').kw[0] === 20, twoKwh);

section('Interval files: rows, footers and gaps (R6, S2)');
function dated(head, f, extra) { var out = [head]; for (var i = 0; i < 8760; i++) { var t = dayAt(2025, 1, 1, Math.floor(i / 24)); out.push(f(iso(t[0], t[1], t[2]), (i % 24 < 10 ? '0' : '') + (i % 24), i)); } return out.concat(extra || []).join('\n'); }
['Total,,,438000.0', 'Total,,,"438,000.0"', ',,,438000'].forEach(function (foot) {
  var p = S.parseInterval(dated('Date,Start Time,End Time,Usage (kWh)', function (d, hh) { return d + ',' + hh + ':00,' + hh + ':59,50.0'; }, [foot]), 'kwh');
  ok('a footer "' + foot + '" is not a reading (8,760, not 8,761)', p.ok && p.readings === 8760, p.ok ? p.readings : p.error);
});
var gaps = S.parseInterval(dated('Date,Time,Usage (kWh)', function (d, hh, i) { return d + ',' + hh + ':00,' + (i >= 100 && i < 103 ? 'N/A' : (i === 200 ? '' : '50.0')); }), 'kwh');
ok('a dated row whose reading is "N/A" or blank is a gap, counted and said (not dropped as a footer)', gaps.ok && gaps.readings === 8760 && gaps.kw[100] === 0 && gaps.kw[200] === 0 &&
   gaps.notes.some(function (n) { return /^4 unreadable readings were read as zero/.test(n); }), gaps.ok ? gaps.notes : gaps.error);
var notes0 = S.parseInterval(dated('Date,Time,kW', function (d, hh) { return d + ',' + hh + ':00,40'; }, ['', 'Report generated by the utility portal', 'Grand total,,350400']), 'kw');
ok('trailing notes and a "Grand total" row are skipped', notes0.ok && notes0.readings === 8760, notes0.ok ? notes0.readings : notes0.error);
var bare = []; for (var bi = 0; bi < 8760; bi++) bare.push(String(5 + bi % 3)); bare.push('Total,52560');
var bareP = S.parseInterval('kW\n' + bare.join('\n'), 'kw');
ok('an undated list ending in "Total,…" is still one year', bareP.ok && bareP.readings === 8760, bareP.ok ? bareP.readings : bareP.error);
function tsv(head, val) {
  var rows = [head];
  for (var i = 0; i < 8760; i++) {
    var dd = Math.floor(i / 24), t = dayAt(2025, 1, 1, dd), hr = i % 24, dow = (3 + dd) % 7, pk = (t[1] === 7 || t[1] === 8) && dow > 0 && dow < 6 && hr >= 14 && hr < 17;
    rows.push(iso(t[0], t[1], t[2]) + '\t' + (head.split('\t').length === 3 ? hr + '\t' : '') + (pk ? val : '600.0'));
  }
  return rows.join('\n');
}
[['Date\tHour\tDemand (kW)'], ['Date\tDemand (kW)']].forEach(function (c) {
  var p = S.parseInterval(tsv(c[0], '1,250.0'), 'kw');
  ok('a tab file\'s unquoted "1,250.0" is 1,250 kW (' + c[0].split('\t').length + ' columns), not a zeroed or dropped peak', p.ok && Math.max.apply(null, p.kw) === 1250 && p.readings === 8760 &&
     !p.notes.some(function (n) { return /unreadable/.test(n); }), p.ok ? [Math.max.apply(null, p.kw), p.notes] : p.error);
});
var amb2 = S.parseInterval(tsv('Date\tHour\tDemand (kW)', '1,250'), 'kw');
ok('a tab file\'s "1,250" (a thousands comma or a decimal comma?) is refused with its row, never zeroed', !amb2.ok && /^Row [\d,]+: the reading "1,250"/.test(amb2.error) && /thousands separator or a decimal point/.test(amb2.error), amb2.error);
var junk = S.parseInterval(dated('Date,Time,kW', function (d, hh, i) { return d + ',' + hh + ':00,' + (i === 5000 ? '12.5 kW' : '40'); }), 'kw');
ok('a reading with digits that is not a number ("12.5 kW") is refused with its row, not read as zero', !junk.ok && /^Row 5,002: the reading "12\.5 kW"/.test(junk.error), junk.error);

section('Interval files: delimiters and line endings (R9)');
var base9 = rowsOf('Timestamp,kW', function (ts) { return ts + ',50'; });
var tabTitle = S.parseInterval('Interval data report\t(generated 2025-10-01)\n' + base9, 'kw');
ok('one tab in a title line does not make a comma file tab-separated', tabTitle.ok && tabTitle.kw[0] === 50, tabTitle.ok ? tabTitle.kw[0] : tabTitle.error);
var crOnly = S.parseInterval(base9.split('\n').join('\r'), 'kw');
ok('CR-only line endings (Excel for Mac "CSV (Macintosh)") are lines', crOnly.ok && crOnly.readings === 8760 && crOnly.kw[0] === 50, crOnly.ok ? crOnly.readings : crOnly.error);
var semi = S.parseInterval(rowsOf('Datum;Verbrauch kWh', function (ts) { return ts + ';0,25'; }), 'kwh');
ok('a semicolon file with decimal commas ("0,25") reads 0.25', semi.ok && Math.abs(semi.kw[0] - 0.25) < 1e-9, semi.ok ? semi.kw[0] : semi.error);
var semiEu = S.parseInterval(rowsOf('Datum;Leistung kW', function (ts, i) { return ts + ';' + (i % 2 ? '1.234,5' : '12,5'); }), 'kw');
ok('…and "1.234,5" there is 1,234.5', semiEu.ok && semiEu.kw[0] === 12.5 && semiEu.kw[1] === 1234.5, semiEu.ok ? semiEu.kw.slice(0, 2) : semiEu.error);

section('Interval files: dates (R3, R4, R7)');
/* a real office: weekdays busy, weekends quiet, by the file's OWN calendar */
function office(y, m, d, days, order) {
  var rows = ['Date,Time,kW'];
  for (var k = 0; k < days; k++) {
    var t = dayAt(y, m, d, k), w = new Date(Date.UTC(t[0], t[1] - 1, t[2])).getUTCDay(), we = w === 0 || w === 6;
    for (var hr = 0; hr < 24; hr++) rows.push((order ? order(t) : iso(t[0], t[1], t[2])) + ',' + (hr < 10 ? '0' : '') + hr + ':00,' + (we ? 50 : (hr >= 8 && hr < 18 ? 150 + (t[1] >= 6 && t[1] <= 9 ? 100 : 0) : 60)));
  }
  return rows;
}
function weekendMisses(kw) {
  var miss = 0;
  for (var d = 0; d < 365; d++) {
    var mx = 0; for (var h = d * 24; h < d * 24 + 24; h++) mx = Math.max(mx, kw[h]);
    var simWe = (3 + d) % 7 === 0 || (3 + d) % 7 === 6;
    if ((mx < 100) !== simWe) miss++;
  }
  return miss;
}
/* the best any shift in −3…+3 can do (26, 16, 35, counted by brute force) — the first-day rule gave 78, 88 and 173 */
[[2025, 10, 1, 365, 26], [2024, 1, 1, 366, 16], [2023, 12, 1, 366, 35]].forEach(function (c) {
  var p = S.parseInterval(office(c[0], c[1], c[2], c[3]).join('\n'), 'kw'), miss = p.ok ? weekendMisses(p.kw) : null;
  ok('a file from ' + iso(c[0], c[1], c[2]) + ': weekends land on the calendar\'s weekends on all but ' + c[4] + ' days (the whole year counted, not the first day)',
     p.ok && miss === c[4] && p.notes.some(function (n) { return new RegExp('all but ' + c[4] + ' of 365 days').test(n); }), p.ok ? [miss, p.notes] : p.error);
});
var asc = office(2025, 1, 1, 365), desc = [asc[0]].concat(asc.slice(1).reverse());
var ascR = S.simulate({ zip: '60601', segment: 'commercial', battery: { kw: 200, kwh: 400 }, load: { type: 'interval', text: asc.join('\n') } });
var descR = S.simulate({ zip: '60601', segment: 'commercial', battery: { kw: 200, kwh: 400 }, load: { type: 'interval', text: desc.join('\n') } });
ok('a newest-first file is read oldest-first: the same answer as the same file ascending, and said', ascR.ok && descR.ok && descR.totals.gross === ascR.totals.gross &&
   descR.monthly[6].peakKw === ascR.monthly[6].peakKw && descR.load.notes.some(function (n) { return /newest reading first/.test(n) && /1 Jan 2025/.test(n); }) && descR.load.quality === 'high',
   [ascR.totals && ascR.totals.gross, descR.totals && descR.totals.gross, descR.load && descR.load.notes]);
function p2d(x) { return (x < 10 ? '0' : '') + x; }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var june = S.parseInterval(office(2025, 6, 5, 365).join('\n'), 'kw');
[['DD/MM/YYYY', function (t) { return p2d(t[2]) + '/' + p2d(t[1]) + '/' + t[0]; }], ['DD-Mon-YYYY', function (t) { return p2d(t[2]) + '-' + MON[t[1] - 1] + '-' + t[0]; }],
 ['"Mon D, YYYY"', function (t) { return '"' + MON[t[1] - 1] + ' ' + t[2] + ', ' + t[0] + '"'; }], ['YYYYMMDD', function (t) { return '' + t[0] + p2d(t[1]) + p2d(t[2]); }],
 ['YY-MM-DD', function (t) { return p2d(t[0] % 100) + '-' + p2d(t[1]) + '-' + p2d(t[2]); }], ['MM/DD/YY', function (t) { return p2d(t[1]) + '/' + p2d(t[2]) + '/' + p2d(t[0] % 100); }]].forEach(function (c) {
  var p = S.parseInterval(office(2025, 6, 5, 365, c[1]).join('\n'), 'kw');
  ok('a file from 5 Jun 2025 dated ' + c[0] + ' starts on 5 Jun 2025 and lands exactly as the ISO file does', p.ok && p.notes.some(function (n) { return /start on 5 Jun 2025/.test(n); }) &&
     p.kw.join() === june.kw.join(), p.ok ? p.notes : p.error);
});
var conflict = S.parseInterval(office(2025, 1, 1, 365, function (t) { return t[1] === 3 ? p2d(t[1]) + '/' + p2d(t[2]) + '/' + t[0] : p2d(t[2]) + '/' + p2d(t[1]) + '/' + t[0]; }).join('\n'), 'kw');
ok('a date column that mixes D/M and M/D is not guessed: read from 1 January and said so', conflict.ok && conflict.notes.some(function (n) { return /mixes day-first and month-first/.test(n); }), conflict.ok ? conflict.notes : conflict.error);
var gibberish = S.parseInterval(office(2025, 6, 5, 365, function (t) { return 'Day' + t[2] + 'of' + t[1]; }).join('\n'), 'kw');
ok('a date column the parser cannot read says so, instead of asking for a date column the file has', gibberish.ok && gibberish.notes.some(function (n) { return /date column \("Date"\) could not be read/.test(n); }) &&
   !gibberish.notes.some(function (n) { return /include the date column/.test(n); }), gibberish.ok ? gibberish.notes : gibberish.error);
var overrode = S.parseInterval(office(2025, 6, 5, 365).join('\n'), 'kw', '2025-01-01');
ok('a file\'s own date wins over a start date given with it, and the note says so', overrode.ok && overrode.notes.some(function (n) { return /own dates were used/.test(n) && /1 Jan 2025/.test(n) && /5 Jun 2025/.test(n); }), overrode.ok ? overrode.notes : overrode.error);

section('Interval files: the load column contract (round 3: T1, T4, R2, R8)');
/* hourly 2025 rows: head, then f(date, 'HH:00', i) per row */
function yr1(head, f) { var out = [head]; for (var i = 0; i < 8760; i++) { var t = tsAt(i, 1); out.push(f(t[0], t[1], i)); } return out.join('\n'); }
function realLoad(i) { return 100 + (i % 24 >= 12 && i % 24 < 18 ? 50 : 0); }   /* 100 kW, 150 kW in the afternoon */
/* T1: a register, a price, a carbon intensity, a contract kW or a credit
   beside the load was preferred for carrying the unit token */
[['Date,Time,Usage,Meter Reading (kWh)', 'kwh', function (i) { return realLoad(i) + ',' + (45000 + i); }],
 ['Read Date,Hour,Consumption,Register (kWh)', 'kwh', function (i) { return realLoad(i) + ',' + (45000 + i); }],
 ['Date,Time,Usage,Cents/kWh', 'kwh', function (i) { return realLoad(i) + ',42.5'; }],
 ['Date,Time,Usage,Carbon Intensity (g/kWh)', 'kwh', function (i) { return realLoad(i) + ',385'; }],
 ['Date,Time,Demand,Contract kW', 'kw', function (i) { return realLoad(i) + ',500'; }],
 ['Date,Time,Usage,kWh Credit', 'kwh', function (i) { return realLoad(i) + ',3.1'; }]].forEach(function (c) {
  var text = c[0].indexOf('Hour') > 0
    ? yr1(c[0], function (d, hh, i) { return d + ',' + (i % 24 + 1) + ',' + c[2](i); })
    : yr1(c[0], function (d, hh, i) { return d + ',' + hh + ',' + c[2](i); });
  var p = S.parseInterval(text, c[1]);
  ok('"' + c[0] + '": the load is the usage / demand column, never the register, price, carbon, contract or credit beside it',
     p.ok && p.kw[10] === 100 && p.kw[14] === 150 && p.column.label === c[0].split(',')[2] && p.column.chosen === 'auto', p.ok ? [p.kw[10], p.column] : p);
});
/* T4: "_" is a separator, so USAGE_HOUR is a time part and KWH_DELIVERED a load */
[['Date,Time,USAGE_HOUR,KWH_DELIVERED', 'KWH_DELIVERED'], ['Date,Time,USAGE_HOUR,INTERVAL_KWH', 'INTERVAL_KWH'], ['USAGE_DATE,USAGE_TIME,USAGE_HOUR,USAGE_KWH', 'USAGE_KWH']].forEach(function (c) {
  var p = S.parseInterval(yr1(c[0], function (d, hh, i) { return d + ',' + hh + ',' + (i % 24 + 1) + ',' + realLoad(i); }), 'kwh');
  ok('"' + c[0] + '": the hour number is never the load; ' + c[1] + ' is read', p.ok && p.kw[10] === 100 && p.column.key === c[1], p.ok ? [p.kw[10], p.column] : p);
});
/* R2 residual: non-load columns spelled another way */
['KVA_DEMAND', 'Demand_kVA', 'DemandKVA', 'Demand (VA)', 'Demand (MVA)', 'Demand Current (A)', 'Demand Multiplier', 'Load (%)', 'Demand Response Event'].forEach(function (h) {
  var p = S.parseInterval(yr1('Date,Usage (kWh),' + h, function (d, hh, i) { return d + ' ' + hh + ',' + realLoad(i) + ',' + (h === 'Demand Multiplier' ? '1.2' : h === 'Demand Response Event' ? '0' : String(realLoad(i) * 1.1)); }), 'kw');
  ok('"' + h + '" beside "Usage (kWh)" under kW is never the load', p.ok && p.kw[10] === 100 && p.column.label === 'Usage (kWh)', p.ok ? [p.kw[10], p.column] : p);
});
/* R8: a load column headed "per <time>" is a load, not a time part */
[['Date,Hour Ending,Usage per Hour', 'kwh'], ['Date,HE,Usage per Interval', 'kwh'], ['Date,Hour,Energy per Period', 'kwh'], ['Date,Hour,Demand per Hour', 'kw']].forEach(function (c) {
  var p = S.parseInterval(yr1(c[0], function (d, hh, i) { return d + ',' + (i % 24 + 1) + ',' + realLoad(i); }), c[1]);
  ok('"' + c[0] + '" reads "' + c[0].split(',')[2] + '" as the load', p.ok && p.kw[10] === 100 && p.readings === 8760, p.ok ? p.kw[10] : p.error);
});
(function () {
  var rows = ['Date,Interval,Usage per Interval'];
  for (var i = 0; i < 35040; i++) rows.push(tsAt(i, 4)[0] + ',' + (i % 96 + 1) + ',25');
  var p = S.parseInterval(rows.join('\n'), 'kwh');
  ok('a 15-minute "Date,Interval,Usage per Interval" file is read (Interval numbered 1–96)', p.ok && p.kw[0] === 100 && p.dated, p.ok ? p.kw[0] : p.error);
})();
/* the contract: "Which column is the load?" with the columns; a named column is read */
var askText = yr1('Date,Time,Reading,Delivered', function (d, hh, i) { return d + ',' + hh + ',' + realLoad(i) + ',' + (realLoad(i) + 1); });
var ask1 = S.parseInterval(askText, 'kw');
ok('two load-ish columns and no explicit one: the parser asks, with each column\'s key, label and sample', !ask1.ok && ask1.field === 'load.column' && /^Which column is the load\?/.test(ask1.error) &&
   ask1.columns.length === 2 && ask1.columns[0].key === 'Reading' && ask1.columns[1].label === 'Delivered' && ask1.columns[0].sample.join() === '100,100,100', ask1);
var one = S.parseInterval(yr1('Timestamp,Reading', function (d, hh, i) { return d + ' ' + hh + ',' + realLoad(i); }), 'kw');
ok('a single column of numbers is read by itself, whatever its header', one.ok && one.kw[10] === 100 && one.column.chosen === 'auto', one.ok ? one.column : one);
var pfOnly = S.parseInterval(yr1('Timestamp,Power Factor', function (d, hh) { return d + ' ' + hh + ',0.95'; }), 'kw');
ok('…unless that one column is excluded (power factor): asked, never read as kW', !pfOnly.ok && pfOnly.field === 'load.column' && pfOnly.columns.length === 1, pfOnly);
var unknown = S.parseInterval(askText, 'kw', null, 'Usage');
ok('an unknown load.column is refused the same way, with the columns', !unknown.ok && unknown.field === 'load.column' && /"Usage" is not a column of numbers/.test(unknown.error) && unknown.columns.length === 2, unknown);
var named = S.parseInterval(askText, 'kw', null, 'Delivered');
ok('the named column is read, and the result says the caller chose it', named.ok && named.kw[10] === 101 && named.column.key === 'Delivered' && named.column.chosen === 'caller', named.ok ? named.column : named);
var headless = []; for (qi = 0; qi < 8760; qi++) headless.push(tsAt(qi, 1).join(' ') + ',' + (qi % 24) + ',' + realLoad(qi));
var hAsk = S.parseInterval(headless.join('\n'), 'kw'), hNamed = S.parseInterval(headless.join('\n'), 'kw', null, '#3');
ok('no header, two columns of numbers: asked with "#2" / "#3" keys; "#3" is read', !hAsk.ok && hAsk.field === 'load.column' && hAsk.columns.map(function (c) { return c.key; }).join() === '#2,#3' &&
   hAsk.columns[1].label === 'Column 3' && hNamed.ok && hNamed.kw[10] === 100 && hNamed.column.key === '#3', [hAsk.columns, hNamed.ok ? hNamed.column : hNamed]);
var simAsk = S.simulate({ zip: '60601', segment: 'commercial', load: { type: 'interval', text: askText, unit: 'kw' } });
ok('simulate answers errors[0] = { field: "load.column", message, columns } — plain JSON', !simAsk.ok && simAsk.errors[0].field === 'load.column' && /^Which column is the load\?/.test(simAsk.errors[0].message) &&
   JSON.stringify(JSON.parse(JSON.stringify(simAsk.errors[0]))) === JSON.stringify(simAsk.errors[0]) && simAsk.errors[0].columns.length === 2, simAsk.errors);
var simNamed = S.simulate({ zip: '60601', segment: 'commercial', load: { type: 'interval', text: askText, unit: 'kw', column: 'Reading' } });
ok('…and with load.column the result\'s load block says which column was read', simNamed.ok && JSON.stringify(simNamed.load.column) === JSON.stringify({ key: 'Reading', label: 'Reading', chosen: 'caller' }), simNamed.load);
ok('a load.column that is not a short string is a field error', S.simulate({ zip: '60601', load: { type: 'interval', text: askText, column: { x: 1 } } }).errors[0].field === 'load.column');

section('Interval files: delimiter, commas and footers (round 3: T2, T5, U2)');
(function () {
  /* T2: two comma preamble lines above a semicolon file with decimal commas */
  var rows = ['Kunde: Muster, Hans', 'Anschrift: Hauptstr. 1, 10115 Berlin', 'Datum;Uhrzeit;Verbrauch (kWh)'];
  for (var i = 0; i < 35040; i++) { var t = tsAt(i, 4), d = t[0].split('-'); rows.push(d[2] + '.' + d[1] + '.' + d[0] + ';' + t[1] + ';0,375'); }
  var p = S.parseInterval(rows.join('\n'), 'kwh');
  ok('a semicolon file with decimal commas under two comma-bearing preamble lines reads 0,375 kWh (1.5 kW), dated', p.ok && Math.abs(p.kw[0] - 1.5) < 1e-9 && p.dated &&
     !p.notes.some(function (n) { return /No dates were found/.test(n); }), p.ok ? [p.kw[0], p.notes] : p.error);
  /* T5: every reading's comma is ambiguous: refused with its row, not "0 found" */
  var amb3 = ['Datum;Uhrzeit;Verbrauch (kWh)'];
  for (i = 0; i < 35040; i++) { t = tsAt(i, 4); amb3.push(t[0] + ';' + t[1] + ';' + (i % 2 ? '15,000' : '37,500')); }
  var a3 = S.parseInterval(amb3.join('\n'), 'kwh');
  ok('a semicolon file whose every reading is "15,000"-shaped is refused with its row, never "0 found"', !a3.ok && /^Row 2: the reading "37,500"/.test(a3.error) && /thousands separator or a decimal point/.test(a3.error), a3.error);
  var tsvAmb = ['Date\tHour Ending\tkW'];
  for (i = 0; i < 8760; i++) { t = tsAt(i, 1); tsvAmb.push(t[0] + '\t' + (i % 24 + 1) + '\t' + (i % 2 ? '600' : '1,500')); }
  var a4 = S.parseInterval(tsvAmb.join('\n'), 'kw');
  ok('a tab file with "1,500" and "600" names the row, not "no header names the load"', !a4.ok && /^Row 2: the reading "1,500"/.test(a4.error) && !/no header names/.test(a4.error), a4.error);
})();
(function () {
  /* U2: a stamped footer (a date range and "Total") is not a reading, even
     where the file is one hour short (daylight saving) */
  var rows = ['Account,Date,Hour Ending,kWh'];
  for (var i = 0; i < 8760; i++) { var t = tsAt(i, 1), dd = t[0].split('-'); if (i === 1633) continue; rows.push('9100123456,' + dd[1] + '/' + dd[2] + '/' + dd[0] + ',' + (i % 24 + 1) + ',50'); }
  rows.push('9100123456,01/01/2025 - 12/31/2025,Total,822490');
  var p = S.parseInterval(rows.join('\n'), 'kwh');
  ok('a stamped "Total" footer with a date range never becomes the 8,760th reading', !p.ok && /8,759/.test(p.error) && p.error.indexOf('822') < 0, p.ok ? Math.max.apply(null, p.kw) : p.error);
  var md = S.parseInterval(yr1('Date,Time,kW', function (d, hh) { return d + ',' + hh + ',40'; }) + '\nMax Demand,2025-07-15 14:00,250', 'kw');
  ok('"Max Demand,2025-07-15 14:00,250" (stamped) is a footer', md.ok && md.readings === 8760 && Math.max.apply(null, md.kw) === 40, md.ok ? md.readings : md.error);
})();

section('Interval files: periods, day rows, clock changes and channels (round 3 recheck)');
(function () {
  function hr(h) { return h === 18 ? 20 : 10; }
  function stamp(k) { var t = dayAt(2025, 1, 1, Math.floor(k / 24)); return [t, k % 24]; }
  /* SCE's Green Button: each reading's cell is its period, "A to B" */
  var sce = ['Name,Someone', '', 'Energy consumption time period,Usage(Real energy in kilowatt-hours),Reading quality'];
  var per = ['Period,kWh'], bp = ['Date,Hour Ending,Billing Period,Rate,kWh'];
  for (var i = 0; i < 8760; i++) {
    var a = stamp(i), b = stamp(i + 1), A = a[0], B = b[0];
    sce.push('"' + iso(A[0], A[1], A[2]) + ' ' + p2d(a[1]) + ':00:00 to ' + iso(B[0], B[1], B[2]) + ' ' + p2d(b[1]) + ':00:00","' + hr(a[1]) + '",""');
    per.push(A[1] + '/' + A[2] + '/' + A[0] + ' ' + a[1] + ':00 - ' + B[1] + '/' + B[2] + '/' + B[0] + ' ' + b[1] + ':00,' + hr(a[1]));
    bp.push(A[1] + '/' + A[2] + '/' + A[0] + ',' + (a[1] + 1) + ',' + p2d(A[1]) + '/01/2025 - ' + p2d(A[1]) + '/28/2025,Max Demand TOU,' + hr(a[1]));
  }
  [['SCE "… to …" periods', sce], ['"… - …" periods', per], ['a Billing Period and a "Max Demand TOU" rate column on every row', bp]].forEach(function (c) {
    var q = S.parseInterval(c[1].join('\n'), 'kwh');
    ok(c[0] + ' are readings, not footers: a dated year with its 18:00 peak', q.ok && q.readings === 8760 && q.dated && q.kw.indexOf(20) === 18, q.ok ? [q.readings, q.dated, q.kw.indexOf(20)] : q.error);
  });
  var bp2 = ['Billing Period,Date,Hour Ending,kWh'];
  for (i = 0; i < 8760; i++) { var a2 = stamp(i), A2 = a2[0]; bp2.push(p2d(A2[1]) + '/01/2025 - ' + p2d(A2[1]) + '/28/2025,' + A2[1] + '/' + A2[2] + '/' + A2[0] + ',' + (a2[1] + 1) + ',' + hr(a2[1])); }
  var qb = S.parseInterval(bp2.join('\n'), 'kwh');
  ok('a Billing Period column BEFORE the Date column is not taken as the date (a month is not a day)', qb.ok && qb.readings === 8760 && qb.dated && qb.kw.indexOf(20) === 18, qb.ok ? [qb.readings, qb.kw.indexOf(20)] : qb.error);
  /* one row per day, 24 hour columns and a total */
  var m = ['Account,Date'], k;
  for (k = 1; k <= 24; k++) m[0] += ',Hour ' + k;
  m[0] += ',Total';
  for (var d = 0; d < 365; d++) { var t = dayAt(2025, 1, 1, d), r = '123,' + t[1] + '/' + t[2] + '/' + t[0]; for (k = 0; k < 24; k++) r += ',' + hr(k); m.push(r + ',250'); }
  var mx = S.parseInterval(m.join('\n'), 'kwh');
  ok('a "Date, Hour 1 … Hour 24" day matrix is read across each day as an hourly year, and says so', mx.ok && mx.readings === 8760 && mx.dated && mx.kw.indexOf(20) === 18 &&
     /one row per day with 24 columns/.test(mx.notes.join(' ')) && mx.column && mx.column.chosen === 'auto', mx.ok ? [mx.readings, mx.notes] : mx);
  var mxp = S.parseInterval(m.join('\n'), 'kwh', null, 'Hour 1');
  ok('a stale column pick on a day matrix does not break it', mxp.ok && mxp.readings === 8760, mxp.ok ? mxp.readings : mxp.error);
  /* a 15-minute local-clock year from 3 Nov 2024 crosses two fall-backs */
  var dst = ['Date,Time,kWh'], f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (i = 0; i < 35040; i++) { var pt = {}; f.formatToParts(new Date(Date.UTC(2024, 10, 3, 5) + i * 9e5)).forEach(function (x) { pt[x.type] = x.value; }); dst.push(pt.month + '/' + pt.day + '/' + pt.year + ',' + pt.hour + ':' + pt.minute + ',2.5'); }
  var q2 = S.parseInterval(dst.join('\n'), 'kwh');
  ok('a 15-minute local-time year that crosses two fall-backs is one meter, not two', q2.ok && q2.readings === 35040, q2.ok ? q2.readings : q2.error);
  /* a date, a channel and no time: delivered and received never repeat a stamp */
  var ch = ['Date,Channel,kWh'];
  for (i = 0; i < 8760; i++) { var c0 = stamp(i)[0], ds = c0[1] + '/' + c0[2] + '/' + c0[0]; ch.push(ds + ',Delivered,' + hr(i % 24)); ch.push(ds + ',Received,40'); }
  var q3 = S.parseInterval(ch.join('\n'), 'kwh');
  ok('"Date,Channel,kWh" with Delivered and Received rows is refused (not read as a half-hourly year)', !q3.ok && /"Channel" column takes turns between/.test(q3.error) && /more than one channel/.test(q3.error), q3.ok ? q3.readings : q3.error);
  var one = S.parseInterval(yr1('Date,Time,Meter,kW', function (dd, hh) { return dd + ',' + hh + ',M-1001,40'; }), 'kw');
  ok('a Meter column with one meter on every row is fine', one.ok && one.readings === 8760, one.ok ? one.readings : one.error);
})();

section('Interval files: the recheck of the recheck (summary periods, day rows, meter columns, re-reads)');
(function () {
  function hr(h) { return h === 18 ? 20 : 10; }
  function D(k) { return dayAt(2025, 1, 1, k); }
  function us(t) { return t[1] + '/' + t[2] + '/' + t[0]; }
  function yr(head, f) { var o = [head]; for (var i = 0; i < 8760; i++) o.push(f(D(Math.floor(i / 24)), i % 24, i)); return o.join('\n'); }
  function good(q) { return q.ok && q.readings === 8760 && q.dated && q.kw.indexOf(20) === 18; }
  function why(q) { return q.ok ? [q.readings, q.kw.indexOf(20), q.notes] : q.error; }
  /* a summary period under per-reading periods: the file's span, far longer than a reading's */
  var sce = yr('Energy Delivered time period,Usage(Real energy in kilowatt-hours),Reading quality', function (t, h, i) { var e = D(Math.floor((i + 1) / 24)); return iso(t[0], t[1], t[2]) + ' ' + p2d(h) + ':00:00 to ' + iso(e[0], e[1], e[2]) + ' ' + p2d((i + 1) % 24) + ':00:00,' + hr(h) + ','; }) +
            '\n2025-01-01 00:00:00 to 2026-01-01 00:00:00,8760.0,';
  var q = S.parseInterval(sce, 'kwh');
  ok('SCE periods with a whole-year summary period: the summary is not a reading', good(q), why(q));
  var bp = yr('Billing Period,Date,Start Time,kWh', function (t, h) { return p2d(t[1]) + '/01/2025 - ' + p2d(t[1]) + '/28/2025,' + us(t) + ',' + p2d(h) + ':00,' + hr(h); }) + '\n01/01/2025 - 12/31/2025,,,8760';
  q = S.parseInterval(bp, 'kwh');
  ok('a Billing Period column with a whole-year summary row: the summary is not a reading', good(q), why(q));
  /* day rows */
  function mx(head, first, ragged) {
    var o = [head];
    for (var d = 0; d < 365; d++) { var t = D(d), v = []; for (var k = 0; k < 24; k++) v.push(hr(k));
      if (ragged && t[1] === 3 && t[2] === 9) v.splice(2, 1);
      if (ragged && t[1] === 11 && t[2] === 2) v.splice(2, 0, 9);
      o.push(first(t) + ',' + v.join(',')); }
    return o.join('\n');
  }
  var h24 = 'Date', he = 'Bill Period,Date', k;
  for (k = 1; k <= 24; k++) { h24 += ',Hour ' + k; he += ',HE' + k + ' kWh'; }
  q = S.parseInterval(mx(h24, function (t) { return iso(t[0], t[1], t[2]) + ' 00:00:00'; }), 'kwh');
  ok('a day matrix whose date cells carry midnight (Excel, MV-90) is read, not refused as repeats', good(q), why(q));
  q = S.parseInterval(mx(h24, us, true), 'kwh');
  ok('a day matrix with 23- and 25-value clock-change rows is read, with the gap and the dropped hour said', good(q) && q.kw[67 * 24 + 2] === 0 && q.kw[67 * 24 + 3] === 10 && /on a clock-change day/.test(q.notes.join(' ')), why(q));
  /* a short or long row on an ordinary day is short or long at its end, never shifted */
  var odd = mx(h24, us).split('\n');
  odd[166] = odd[166].replace(/,10$/, '');            /* 15 Jun: 23 values */
  q = S.parseInterval(odd.join('\n'), 'kwh');
  ok('a 23-value row on an ordinary day keeps its hours in place (the end is the gap)', good(q) && q.kw[165 * 24 + 18] === 20 && q.kw[165 * 24 + 23] === 0, why(q));
  /* a half-hourly day matrix with its clock-change rows (46 and 50 values) */
  var hh48 = 'Date';
  for (k = 1; k <= 48; k++) hh48 += ',Interval ' + k;
  var hm = [hh48];
  for (d = 0; d < 365; d++) { var th = D(d), vh = []; for (k = 0; k < 48; k++) vh.push(hr(Math.floor(k / 2)));
    if (th[1] === 3 && th[2] === 9) vh.splice(4, 2);
    if (th[1] === 11 && th[2] === 2) vh.splice(4, 0, 9, 9);
    hm.push(us(th) + ',' + vh.join(',')); }
  q = S.parseInterval(hm.join('\n'), 'kwh');
  ok('a half-hourly day matrix with 46- and 50-value clock-change rows is read', q.ok && q.readings === 17520 && q.kw.indexOf(40) === 18 && q.kw[67 * 24 + 2] === 0 && q.kw[67 * 24 + 3] === 20 && q.kw[305 * 24 + 2] === 20, why(q));   /* 10 kWh a half-hour is 20 kW */
  q = S.parseInterval(mx(he, function (t) { return p2d(t[1]) + '/01/2025 - ' + p2d(t[1]) + '/28/2025,' + us(t); }), 'kwh');
  ok('"Bill Period, Date, HE1 kWh … HE24 kWh": the Date is the day, not the bill period', good(q), why(q));
  var mxCh = ['Date,Channel'];
  for (k = 1; k <= 24; k++) mxCh[0] += ',Hour ' + k;
  for (var d = 0; d < 365; d++) { var tt = D(d), vv = []; for (k = 0; k < 24; k++) vv.push(hr(k)); mxCh.push(us(tt) + ',Delivered,' + vv.join(',')); mxCh.push(us(tt) + ',Received,' + vv.join(',')); }
  q = S.parseInterval(mxCh.join('\n'), 'kwh');
  ok('a day matrix of Delivered and Received rows is refused on its Channel column, naming a row of the file', !q.ok && /"Channel" column takes turns/.test(q.error) && /row 4\)/.test(q.error), q.ok ? q.readings : q.error);
  /* meter and channel columns */
  q = S.parseInterval(yr('Date,Time,Meter Status,kWh', function (t, h, i) { return us(t) + ',' + p2d(h) + ':00,' + (i % 7 ? 'Actual' : 'Estimated') + ',' + hr(h); }), 'kwh');
  ok('"Meter Status" (Actual / Estimated) describes a reading and is not a second meter', good(q), why(q));
  q = S.parseInterval(yr('Date,Time,UOM,Meter Number,kWh', function (t, h, i) { return us(t) + ',' + p2d(h) + ':00,' + (i < 4000 ? 'KWH' : 'kWh') + ',' + (i % 2 ? 'A123' : '00A123') + ',' + hr(h); }), 'kwh');
  ok('"KWH" and "kWh", "A123" and "00A123" are one value each', good(q), why(q));
  q = S.parseInterval(yr('Date,Time,Meter Number,kWh', function (t, h, i) { return us(t) + ',' + p2d(h) + ':00,' + (i < 5000 ? 'X100' : 'X200') + ',' + hr(h); }), 'kwh');
  ok('a meter replaced mid-year is read on, and said', good(q) && /changes from "X100" to "X200" at row 5,002/.test(q.notes.join(' ')), why(q));
  var nc = ['Date,Channel,kWh'];
  for (var i = 0; i < 8760; i++) { var t0 = us(D(Math.floor(i / 24))); nc.push(t0 + ',1,2'); nc.push(t0 + ',2,2'); }
  q = S.parseInterval(nc.join('\n'), 'kwh');
  ok('channels numbered 1 and 2 are refused too', !q.ok && /"Channel" column takes turns/.test(q.error), q.ok ? q.readings : q.error);
  q = S.parseInterval(yr('Meter Number,Read Date,Read Time,Read Type,Register,kWh', function (t, h, i) { return '123456,' + us(t) + ',' + p2d(h) + ':00,' + (i % 97 ? 'Actual' : 'Estimated') + ',' + (50000 + i * 10) + ',' + hr(h); }), 'kwh');
  ok('"Read Type" (Actual / Estimated) and a cumulative "Register" describe readings, not meters', good(q), why(q));
  var cyc = ['Bill Period,Read Date,Hour,kWh'], cuts = [0, 8, 38, 108, 130, 160, 191, 222, 252, 283, 313, 344, 365];
  for (i = 0; i < 8760; i++) { var dday = Math.floor(i / 24), c = 0; while (cuts[c + 1] <= dday) c++; var a0 = D(cuts[c]), b0 = D(cuts[c + 1] - 1);
    cyc.push(us(a0) + ' - ' + us(b0) + ',' + us(D(dday)) + ',' + (i % 24 + 1) + ',' + hr(i % 24)); }
  q = S.parseInterval(cyc.join('\n'), 'kwh');
  ok('billing cycles of 8 to 70 days on every reading are never summaries', good(q), why(q));
  /* a local-clock half-hourly year of dates 3 Nov 2024 – 2 Nov 2025: two fall-backs, 17,522 readings */
  var f2 = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), fb = ['Date,Time,kWh'];
  for (var ms = Date.UTC(2024, 10, 3, 5); ; ms += 18e5) { var pt = {}; f2.formatToParts(new Date(ms)).forEach(function (x) { pt[x.type] = x.value; }); if (pt.year === '2025' && pt.month === '11' && pt.day === '03') break; fb.push(pt.month + '/' + pt.day + '/' + pt.year + ',' + pt.hour + ':' + pt.minute + ',1'); }
  q = S.parseInterval(fb.join('\n'), 'kwh');
  ok('a half-hourly local year crossing two fall-backs (17,522 rows) is read, the later repeat left out and said', fb.length - 1 === 17522 && q.ok && q.readings === 17520 && /two autumn clock changes/.test(q.notes.join(' ')), q.ok ? [q.readings, q.notes] : q.error);
  /* repeats */
  var sd = ['Date,Time,kWh'];
  for (i = 0; i < 8760; i++) { if (i === 1000 || i === 3000 || i === 5000) continue; var row = us(D(Math.floor(i / 24))) + ',' + p2d(i % 24) + ':00,' + hr(i % 24); sd.push(row); if (i === 999 || i === 2999 || i === 4999) sd.push(row); }
  q = S.parseInterval(sd.join('\n'), 'kwh');
  ok('three scattered re-read intervals are not a second meter (as before)', q.ok && q.readings === 8760, why(q));
  var ov = ['Date,Time,kWh'];
  for (i = 0; i < 8760; i++) { var tr = D(Math.floor(i / 24)), hh = i % 24; ov.push(us(tr) + ',' + p2d(hh) + ':00,' + hr(hh)); if ((tr[1] === 4 && tr[2] === 1 || tr[1] === 8 && tr[2] === 1) && hh >= 10 && hh < 14) ov.push(us(tr) + ',' + p2d(hh) + ':00,0.3'); }
  q = S.parseInterval(ov.join('\n'), 'kwh');
  ok('a second channel for four daytime hours on two days is refused (repeats outside the clock change)', !q.ok && /repeat a date and time/.test(q.error), q.ok ? q.readings : q.error);
})();

section('Interval files: summaries, second tables and clock changes, read honestly (verification pass 4)');
(function () {
  var fmtC = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function localYear() { var o = []; for (var ms = Date.UTC(2025, 0, 1, 6); ; ms += 36e5) { var p = {}; fmtC.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; }); if (p.year === '2026') break; o.push(p.month + '/' + p.day + '/' + p.year + ',' + p.hour + ':00,1'); } return o; }
  function sum(q) { return q.kw.reduce(function (a, b) { return a + b; }, 0); }
  var cal = localYear();
  var q = S.parseInterval(['Date,Time,kWh'].concat(cal, ['12/31/2025,,8760']).join('\n'), 'kwh');
  ok('a calendar year with one fall-back and a dated annual total: refused on the count, never read by dropping the fall-back (17,520 kWh)', !q.ok && /8,761/.test(q.error), q.ok ? [q.readings, sum(q), q.notes] : q.error);
  q = S.parseInterval(['Date,Time,kWh'].concat(cal, ['1/1/2026,00:00,55']).join('\n'), 'kwh');
  ok('one fall-back and a reading too many is refused, not trimmed by dropping the fall-back', !q.ok && /8,761/.test(q.error), q.ok ? [q.readings, q.notes] : q.error);
  var ghost = cal.slice(), at9 = ghost.indexOf('03/09/2025,03:00,1');
  ghost.splice(at9, 0, '03/09/2025,02:00,55');
  q = S.parseInterval(['Date,Time,kWh'].concat(ghost).join('\n'), 'kwh');
  ok('one fall-back and a reading for the hour that never happened: refused, the fall-back is not dropped to make room', !q.ok && /8,761/.test(q.error), q.ok ? [q.readings, Math.max.apply(null, q.kw), q.notes] : q.error);
  var ts = ['Timestamp,kWh'];
  for (var k = 0; k < 8760; k++) { var tk = dayAt(2025, 1, 1, Math.floor(k / 24)); ts.push(tk[1] + '/' + tk[2] + '/' + tk[0] + ' ' + p2d(k % 24) + ':00,1'); }
  q = S.parseInterval(ts.concat(['12/31/2025,8760']).join('\n'), 'kwh');
  ok('a combined timestamp file with a dated, time-less annual total: refused on the count, not misread', !q.ok && /8,761/.test(q.error), q.ok ? [q.readings, q.notes] : q.error);
  /* newest-first, with the meter swapped mid-day */
  var rs = [];
  for (var d = 0; d < 365; d++) { var t = dayAt(2025, 1, 1, d); for (var h = 0; h < 24; h++) { var late = t[1] > 6 || (t[1] === 6 && (t[2] > 15 || (t[2] === 15 && h >= 11))); rs.push({ d: d, l: (late ? '22222222' : '11111111') + ',' + t[1] + '/' + t[2] + '/' + t[0] + ',' + (h + 1) + ',2' }); } }
  rs.sort(function (a, b) { return b.d - a.d; });
  q = S.parseInterval(['Meter Number,Date,Hour,kWh'].concat(rs.map(function (x) { return x.l; })).join('\n'), 'kwh');
  ok('a newest-first file with the meter swapped mid-day is one swap, judged in date order', q.ok && q.readings === 8760 && /changes from "11111111" to "22222222"/.test(q.notes.join(' ')), q.ok ? q.notes : q.error);
  /* billing period on the cycle's first row; monthly subtotals; a second table below */
  var bp = ['Billing Period,Date,Time,kWh'], bs = ['Bill Period,Date,Time,kWh'], tb = ['Date,Time,kWh'];
  for (var i = 0; i < 8760; i++) {
    var u = dayAt(2025, 1, 1, Math.floor(i / 24)), per = p2d(u[1]) + '/01/2025 - ' + p2d(u[1]) + '/28/2025', ds = u[1] + '/' + u[2] + '/2025,' + p2d(i % 24) + ':00,1';
    bp.push((u[2] === 1 && i % 24 === 0 ? per : '') + ',' + ds);
    bs.push(per + ',' + ds);
    var nx = dayAt(2025, 1, 1, Math.floor(i / 24) + 1);
    if (i % 24 === 23 && nx[1] !== u[1]) bs.push(per + ',,,744');
    tb.push(ds);
  }
  tb.push('', 'Billing Period,Start,End,kWh', 'Jan 2025,1/1/2025,1/31/2025,744', 'Feb 2025,2/1/2025,2/28/2025,672');
  var r = S.parseInterval(bp.join('\n'), 'kwh');
  ok('a Billing Period on each cycle\'s first row only: one year, 8,760 kWh', r.ok && r.readings === 8760 && Math.round(sum(r)) === 8760, r.ok ? [r.readings, sum(r)] : r.error);
  /* guessed at once (pass 4) and each guess broke a real export (pass 5): these are refused plainly, never misread */
  r = S.parseInterval(bs.join('\n'), 'kwh');
  ok('monthly subtotal rows with no date or time: refused on the count (8,772), not misread', !r.ok && /8,772/.test(r.error), r.ok ? r.readings : r.error);
  r = S.parseInterval(tb.join('\n'), 'kwh');
  ok('a billing table below the readings: refused naming its row', !r.ok && /^Row 8,764/.test(r.error), r.ok ? r.readings : r.error);
  /* pass 5: what those guesses broke reads again */
  var ie = ['Interval End,kWh'];
  for (i = 1; i <= 35040; i++) { var mins = i * 15, dd0 = dayAt(2025, 1, 1, Math.floor(mins / 1440)), mm = mins % 1440; ie.push(dd0[1] + '/' + dd0[2] + '/' + dd0[0] + (mm ? ' ' + Math.floor(mm / 60) + ':' + p2d(mm % 60) : '') + ',1'); }
  r = S.parseInterval(ie.join('\n'), 'kwh');
  ok('interval-ending 15-minute stamps with midnight written as the date alone are read', r.ok && r.readings === 35040, r.ok ? r.readings : r.error);
  var pg = ['Date,Time,kWh'];
  for (i = 0; i < 8760; i++) { var ud = dayAt(2025, 1, 1, Math.floor(i / 24)); if (i % 24 === 0 && ud[2] === 1 && i) pg.push('ACME Corp,Hourly Usage', 'Date,Time,kWh'); pg.push(ud[1] + '/' + ud[2] + '/2025,' + p2d(i % 24) + ':00,1'); }
  r = S.parseInterval(pg.join('\n'), 'kwh');
  ok('a report title and header repeated on every page do not end the readings', r.ok && r.readings === 8760, r.ok ? r.readings : r.error);
  var rv = ['Date,Revision Date,Time,kWh'];
  for (i = 0; i < 8760; i++) { var uv = dayAt(2025, 1, 1, Math.floor(i / 24)); rv.push(uv[1] + '/' + uv[2] + '/2025,' + (uv[2] === 5 ? '' : uv[1] + '/' + uv[2] + '/2025') + ',' + p2d(i % 24) + ':00,1'); }
  r = S.parseInterval(rv.join('\n'), 'kwh');
  ok('a Revision Date blank on some days does not drop those readings', r.ok && r.readings === 8760, r.ok ? r.readings : r.error);
})();

section('Interval files: the final pass (sparse cycles, hour-ending clock changes, read dates)');
(function () {
  function sum(q) { return q.kw.reduce(function (a, b) { return a + b; }, 0); }
  /* a Billing Period on each cycle's first row, one cycle 61 days: no reading is dropped */
  var cuts = [0, 31, 59, 90, 120, 151, 212, 243, 273, 304, 334, 365], bp = ['Billing Period,Date,Time,kWh'];
  for (var i = 0; i < 8760; i++) { var dd = Math.floor(i / 24), c = 0; while (cuts[c + 1] <= dd) c++; var a = dayAt(2025, 1, 1, cuts[c]), b = dayAt(2025, 1, 1, cuts[c + 1] - 1), t = dayAt(2025, 1, 1, dd);
    bp.push((dd === cuts[c] && i % 24 === 0 ? a[1] + '/' + a[2] + '/2025 - ' + b[1] + '/' + b[2] + '/2025' : '') + ',' + t[1] + '/' + t[2] + '/2025,' + p2d(i % 24) + ':00,' + (i % 24 === 17 ? 100 : 1)); }
  var q = S.parseInterval(bp.join('\n'), 'kwh');
  ok('a first-row-only Billing Period with a 61-day cycle drops no reading', q.ok && q.readings === 8760 && Math.round(sum(q)) === 365 * 123 && q.kw[151 * 24 + 17] === 100, q.ok ? [q.readings, sum(q)] : q.error);
  /* an EU hour-ending file crossing two fall-backs: the repeated hour ends at 03:00 */
  var fe = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), eu = ['Date,Time,kWh'];
  /* each row stamped at its hour's END, midnight as 24:00 of the same day (27.10.2024 – 26.10.2025) */
  for (var ms = Date.UTC(2024, 9, 26, 22); ; ms += 36e5) { var pt = {}; fe.formatToParts(new Date(ms)).forEach(function (x) { pt[x.type] = x.value; }); if (pt.year === '2025' && pt.month === '10' && pt.day === '27') break; eu.push(pt.day + '.' + pt.month + '.' + pt.year + ',' + p2d(+pt.hour + 1) + ':00,1'); }
  q = S.parseInterval(eu.join('\n'), 'kwh');
  ok('an EU hour-ending year crossing two fall-backs (the repeat stamped 03:00) is read', q.ok && q.readings === 8760 && /two autumn clock changes/.test(q.notes.join(' ')), q.ok ? [q.readings, q.notes] : [eu.length - 1, q.error]);
  /* a day matrix with a whole-year total row */
  var mx = ['Date'], k;
  for (k = 1; k <= 24; k++) mx[0] += ',Hour ' + k;
  for (var d = 0; d < 365; d++) { var u = dayAt(2025, 1, 1, d), v = []; for (k = 0; k < 24; k++) v.push(k === 17 ? 100 : 1); mx.push(u[1] + '/' + u[2] + '/2025,' + v.join(',')); }
  var tot = ['01/01/2025 - 12/31/2025']; for (k = 0; k < 24; k++) tot.push(365); mx.push(tot.join(','));
  q = S.parseInterval(mx.join('\n'), 'kwh');
  ok('a day matrix with a whole-year total row: the total is not a day', q.ok && q.readings === 8760 && Math.max.apply(null, q.kw) === 100, q.ok ? q.readings : q.error);
  /* verification pass 7: a date column is never skipped for its name; one spike, 15 Jul 16:00, must land at hour 4,696 */
  var SPIKE = 195 * 24 + 16;
  function yr(head, f) { var o = [head]; for (var h = 0; h < 8760; h++) { var t = dayAt(2025, 1, 1, Math.floor(h / 24)), n = dayAt(2025, 1, 1, Math.floor(h / 24) + 1); o.push(f(t[1] + '/' + t[2] + '/2025', n[1] + '/' + n[2] + '/' + n[0], h % 24, h === SPIKE ? 300 : 10, h)); } return o.join('\n'); }
  [['Reading Date,Reading Time,End Date,End Time,kWh', function (d, nd, h, v) { return d + ',' + p2d(h) + ':00,' + (h === 23 ? nd : d) + ',' + p2d((h + 1) % 24) + ':00,' + v; }],
   ['Read Date,Read Time,kWh,Received Date', function (d, nd, h, v) { return d + ',' + p2d(h) + ':00,' + v + ',' + nd; }],
   ['Read Time,kWh,Last Updated', function (d, nd, h, v) { return d + ' ' + p2d(h) + ':00,' + v + ',1/5/2026 08:00'; }],
   ['Date,Time,Meter,kWh', function (d, nd, h, v, k) { return d + ',' + p2d(h) + ':00,' + (50000 + k * 7 + k % 3) + ',' + v; }]].forEach(function (c) {
    var r = S.parseInterval(yr(c[0], c[1]), 'kwh');
    ok('"' + c[0] + '": read, the spike at 15 Jul 16:00', r.ok && r.readings === 8760 && r.kw.indexOf(300) === SPIKE, r.ok ? [r.kw.indexOf(300), r.notes] : r.error);
  });
})();

section('Interval files: timestamps set the interval and the order (round 3: U1, T3, R4, R6, R7)');
function meter(head, f, y) { var out = []; for (var i = 0; i < 8760; i++) { var t = tsAt(i, 1), dd = t[0].split('-'); out.push(f(dd[1] + '/' + dd[2] + '/' + (y || dd[0]), i)); } return out; }
(function () {
  /* U1: two meters stacked, the same year: 17,520 rows spanning one year */
  var a = meter('', function (d, i) { return 'A1,M-1001,' + d + ',' + (i % 24 + 1) + ',' + realLoad(i); });
  var b = meter('', function (d, i) { return 'A1,M-1002,' + d + ',' + (i % 24 + 1) + ',' + realLoad(i); });
  var p = S.parseInterval(['Account,Meter,Date,Hour Ending,kWh'].concat(a, b).join('\n'), 'kwh');
  ok('two meters stacked in one file are refused, saying what was found (not read as a year of half-hours)', !p.ok && /turn back|repeat/.test(p.error) && /more than one meter/.test(p.error), p.ok ? p.readings : p.error);
  /* the same with a date and no time on each row: the dates run on, then start again */
  var a2 = meter('', function (d, i) { return d + ',' + realLoad(i); }), b2 = meter('', function (d, i) { return d + ',' + realLoad(i); });
  var p2 = S.parseInterval(['Date,kWh'].concat(a2, b2).join('\n'), 'kwh');
  ok('two date-only meters stacked are refused where the dates turn back (not read as 48 half-hours a day)', !p2.ok && /run forward and then turn back/.test(p2.error) && /row 8,762/.test(p2.error), p2.ok ? p2.readings : p2.error);
  /* delivered and received rows interleaved each hour */
  var il = ['Date,Hour Ending,Channel,kWh'];
  for (var i = 0; i < 8760; i++) { var t = tsAt(i, 1); il.push(t[0] + ',' + (i % 24 + 1) + ',Delivered,' + realLoad(i)); il.push(t[0] + ',' + (i % 24 + 1) + ',Received,40'); }
  var q = S.parseInterval(il.join('\n'), 'kwh');
  ok('delivered and received rows interleaved each hour are refused as repeated timestamps', !q.ok && /repeat a date and time/.test(q.error) && /8,760 readings/.test(q.error), q.ok ? q.readings : q.error);
  /* two years of hourly readings: 17,520 rows over 730 days */
  var two = ['Date,Time,kWh'];
  for (i = 0; i < 17520; i++) { var d = dayAt(2024, 9, 29, Math.floor(i / 24)); two.push(iso(d[0], d[1], d[2]) + ',' + p2d(i % 24) + ':00,' + realLoad(i)); }
  var r = S.parseInterval(two.join('\n'), 'kwh');
  ok('two years of hourly readings are refused as two years of hourly, not read as one year of half-hours', !r.ok && /hourly readings/.test(r.error) && /17,520 of them over 730 days/.test(r.error), r.ok ? r.readings : r.error);
})();
(function () {
  /* T3 / R4: sorted by the Date column descending, hours ascending within
     each day: an evening-peak home keeps its evening peak */
  function home(h) { return h >= 17 && h < 21 ? 3 : 0.5; }
  var ascRows = ['Date,Time,kWh'], dayDesc = ['Date,Time,kWh'], i, d, h;
  for (d = 0; d < 365; d++) for (h = 0; h < 24; h++) { var t = dayAt(2025, 1, 1, d); ascRows.push(p2d(t[1]) + '/' + p2d(t[2]) + '/' + t[0] + ',' + p2d(h) + ':00,' + home(h)); }
  for (d = 364; d >= 0; d--) for (h = 0; h < 24; h++) { t = dayAt(2025, 1, 1, d); dayDesc.push(p2d(t[1]) + '/' + p2d(t[2]) + '/' + t[0] + ',' + p2d(h) + ':00,' + home(h)); }
  var A = S.parseInterval(ascRows.join('\n'), 'kwh'), D = S.parseInterval(dayDesc.join('\n'), 'kwh');
  ok('a file sorted newest day first with its hours ascending is read in date and time order, no day turned round', A.ok && D.ok && A.kw.join() === D.kw.join() && D.kw[18] === 3 && D.kw[5] === 0.5 &&
     D.notes.some(function (n) { return /newest reading first/.test(n) && /1 Jan 2025/.test(n); }), D.ok ? [D.kw.slice(0, 24), D.notes] : D.error);
  var hd = ['Date,Hour Ending,kW'];
  for (d = 364; d >= 0; d--) for (h = 1; h <= 24; h++) { t = dayAt(2025, 1, 1, d); hd.push(iso(t[0], t[1], t[2]) + ',' + h + ',' + home(h - 1)); }
  var HD = S.parseInterval(hd.join('\n'), 'kw');
  ok('…and so is one with an "Hour Ending" number column (R4)', HD.ok && HD.kw.join() === A.kw.join(), HD.ok ? HD.kw.slice(0, 24) : HD.error);
})();
(function () {
  /* R6: the date only on each day's first row (a merged-cell export) */
  [['Date,Hour Ending,kWh', function (t) { return p2d(t[1]) + '/' + p2d(t[2]) + '/' + t[0]; }], ['Date,Hour Ending,kWh', function (t) { return iso(t[0], t[1], t[2]); }]].forEach(function (c, k) {
    var rows = [c[0]];
    for (var d = 0; d < 365; d++) for (var h = 1; h <= 24; h++) { var t = dayAt(2025, 3, 1, d); rows.push((h === 1 ? c[1](t) : '') + ',' + h + ',' + (40 + h)); }
    var p = S.parseInterval(rows.join('\n'), 'kwh');
    ok('a date on each day\'s first row only (' + (k ? 'ISO' : 'M/D/Y') + ') is a year of dated readings from 1 Mar 2025', p.ok && p.readings === 8760 && p.dated && p.notes.some(function (n) { return /1 Mar 2025/.test(n); }), p.ok ? p.notes : p.error);
  });
  /* R7 / R4(2): a 15-minute file with the date on the day's first row, a time on every row */
  var q = ['Date,Time,kW'];
  for (var i = 0; i < 35040; i++) { var t = dayAt(2025, 6, 5, Math.floor(i / 96)), mm = (i % 96) * 15; q.push((i % 96 ? '' : iso(t[0], t[1], t[2])) + ',' + p2d(Math.floor(mm / 60)) + ':' + p2d(mm % 60) + ',' + (t[1] === 7 ? 100 : 300)); }
  var p = S.parseInterval(q.join('\n'), 'kw');
  ok('a 15-minute file dated on each day\'s first row is placed from 5 Jun 2025, not read as undated', p.ok && p.dated && p.notes.some(function (n) { return /5 Jun 2025/.test(n); }) &&
     !p.notes.some(function (n) { return /No dates were found/.test(n); }) && p.kw[4800] === 100, p.ok ? p.notes : p.error);
})();

section('Dispatch: an event hour at zero load (round 3: T6 / R1)');
(function () {
  /* summer weekdays 6 kW at 12–15 and 17–20 over a 1 kW base; the 16:00
     reading on June weekdays is exactly 0 (a gap read as zero, or a
     net-metered hour clamped to zero). The dispatch never grid-charges in a
     called event, so the reserve must not count on it either. */
  function build(zeroAt16) {
    var rows = ['Timestamp,kW'];
    for (var i = 0; i < 8760; i++) {
      var d = Math.floor(i / 24), h = i % 24, dw = (3 + d) % 7, t = dayAt(2025, 1, 1, d), v = 1;
      if (t[1] >= 6 && t[1] <= 9 && dw !== 0 && dw !== 6) {
        if ((h >= 12 && h < 16) || (h >= 17 && h < 21)) v = 6;
        if (h === 16 && t[1] === 6) v = zeroAt16;
      }
      rows.push(iso(t[0], t[1], t[2]) + ' ' + p2d(h) + ':00,' + v);
    }
    return rows.join('\n');
  }
  [['a 0 reading', 0], ['a blank reading', '']].forEach(function (c) {
    var r = S.simulate({ zip: '94110', segment: 'residential', battery: { kw: 5, kwh: 10 },
      tariff: { demandCharge: 15, onPeakRate: 0.30, offPeakRate: 0.15, peakStart: 11, peakEnd: 16 }, load: { type: 'interval', text: build(c[1]), unit: 'kw' } });
    ok('with ' + c[0] + ' inside an ELRP event on a charging hour, every month still holds its demand target', r.ok && r.monthly.every(function (m) { return m.targetKw == null || m.peakAfterKw <= m.targetKw + 0.01; }),
       r.ok ? r.monthly.map(function (m) { return [m.month, m.peakAfterKw, m.targetKw]; }) : r.errors);
  });
  /* the recheck's flat-rate shape: hours 16–19 at 0 kW every day */
  var vals2 = [];
  for (var i = 0; i < 8760; i++) {
    var d = Math.floor(i / 24), h = i % 24, v = 1;
    if (h >= 16 && h < 20) v = 0;
    else if (d % 2 === 0) v = (h >= 12 && h < 16) || h >= 20 ? 3 : 1;
    else v = h < 4 ? 3 : 1;
    vals2.push(v);
  }
  var r2 = S.simulate({ zip: '94110', segment: 'residential', battery: { kw: 5, kwh: 10 }, tariff: { demandCharge: 15, onPeakRate: 0.3, offPeakRate: 0.3 },
    load: { type: 'interval', startDate: '2025-01-01', values: vals2 } });
  ok('flat rates, zero load in every event hour: June holds its target and its bill does not rise', r2.ok && r2.monthly.every(function (m) { return m.targetKw == null || m.peakAfterKw <= m.targetKw + 0.01; }) &&
     r2.monthly[5].billAfter <= r2.monthly[5].billBefore, r2.ok ? r2.monthly[5] : r2.errors);
})();

section('Bills: an assumed peak is only one no bill carries (S4)');
(function () {
  var b11 = []; for (var m = 1; m <= 11; m++) b11.push({ month: '2025-' + p2d(m), kwh: 25000, peakKw: 90 });
  var r = S.simulate({ zip: '19103', segment: 'commercial', battery: { kw: 500, kwh: 4000 }, load: { type: 'bills', bills: b11 } }), pc = stream(r, 'pjm.capacity');
  ok('11 months of bills WITH their billed peaks: the PJM kW capped at the billed summer peak is published, not "read off a load shape"', r.ok && r.load.quality === 'low' && pc && pc.tier === 'published' &&
     /Capped at the site's 90 kW/.test(pc.how) && !/load shape/.test(pc.how), pc);
  var noPk = []; for (m = 1; m <= 12; m++) noPk.push({ month: '2025-' + p2d(m), kwh: 25000 });
  var pn = stream(S.simulate({ zip: '19103', segment: 'commercial', battery: { kw: 500, kwh: 4000 }, load: { type: 'bills', bills: noPk } }), 'pjm.capacity');
  ok('…bills without peaks still say the peak is read off a load shape (planning)', pn && pn.tier === 'planning' && /load shape/.test(pn.how), pn);
})();

section('Bills and the calibration (c4, c10)');
function billRows(f) { var b = []; for (var m = 1; m <= 12; m++) b.push(f(m, '2025-' + (m < 10 ? '0' : '') + m)); return b; }
var allKwh = S.simulate({ zip: '30301', segment: 'commercial', load: { type: 'bills', bills: billRows(function (m, mo) { return { month: mo, kwh: 40000, peakKw: 160, cost: 7000 }; }) } });
var halfKwh = S.simulate({ zip: '30301', segment: 'commercial', load: { type: 'bills', bills: billRows(function (m, mo) { return m <= 6 ? { month: mo, peakKw: 160, cost: 7000 } : { month: mo, kwh: 40000, peakKw: 160, cost: 7000 }; }) } });
ok('a dollars-only month is filled from the climate curve and its dollars never scale the rate', halfKwh.ok &&
   Math.abs(halfKwh.tariff.calibration.factor - allKwh.tariff.calibration.factor) <= 0.05 && halfKwh.totals.billSavings <= allKwh.totals.billSavings * 1.05,
   [halfKwh.tariff.calibration, allKwh.tariff.calibration]);
ok('…said, and the load is low quality', halfKwh.load.quality === 'low' && halfKwh.load.notes.some(function (n) { return /dollars only/.test(n); }), halfKwh.load.notes);
ok('no month is ever left at zero load', halfKwh.monthly.every(function (m) { return m.kwh > 0; }));
var resBills = S.simulate({ zip: '30301', segment: 'residential', load: { type: 'bills', bills: billRows(function (m, mo) { return { month: mo, kwh: 300, cost: 60 }; }) } });
ok('the calibrated bill IS the dollars paid, customer charge included', resBills.ok && !/capped/.test(resBills.tariff.calibration.note) &&
   Math.abs(resBills.bill.before - 720) / 720 < 0.01, [resBills.bill.before, resBills.tariff.calibration]);

section('Tax, duration and the split (c8, c9, c25)');
var taxed = S.simulate({ zip: '30301', segment: 'commercial', battery: { kw: 50, kwh: 200 }, tariff: { urdb: { name: 'Taxed TOU', taxpercentage: 8, fixedchargefirstmeter: 30,
  energyratestructure: [[{ rate: 0.08 }], [{ rate: 0.2 }]],
  energyweekdayschedule: new Array(12).fill([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]),
  energyweekendschedule: new Array(12).fill(new Array(24).fill(0)),
  flatdemandstructure: [[{ rate: 15 }]], flatdemandmonths: new Array(12).fill(0) } } });
ok('with a tax on the tariff, the bill streams add up to the before → after bill', taxed.ok && Math.abs(taxed.totals.tariffSavings - taxed.bill.savings) <= 2 &&
   taxed.totals.billSavings === taxed.totals.tariffSavings, taxed.ok ? [taxed.totals, taxed.bill] : taxed.errors);
var kwhOnly = S.simulate({ zip: '60601', segment: 'commercial', battery: { kwh: 800000 } });
var kwhHome = S.simulate({ zip: '94110', segment: 'residential', battery: { kwh: 100 } });
ok('a kWh-only battery takes a kW that keeps it inside twelve hours', kwhOnly.ok && kwhOnly.battery.kwh / kwhOnly.battery.kw <= 12 && kwhHome.ok && kwhHome.battery.kwh / kwhHome.battery.kw <= 12,
   [kwhOnly.battery && kwhOnly.battery.kw, kwhHome.battery && kwhHome.battery.kw]);
ok('…and only the kW is marked suggested', kwhHome.battery.assumed === false && kwhHome.battery.assumedFields.join() === 'kw' && caRes.battery.assumedFields.join() === 'kw,kwh');
var plcSite = S.simulate({ zip: '19103', segment: 'commercial' }), plc = stream(plcSite, 'pjm.plc');
ok('the PLC tag is a bill saving, kept whole by the owner', plc && plc.counted && plc.category === 'bill' && plcSite.totals.tagSavings === plc.usd &&
   Math.abs(plcSite.totals.owner - (plcSite.totals.billSavings + plcSite.totals.gridEarnings * 0.7)) <= 1, plcSite.totals);
ok('…and the tariff part still equals the before → after bill', Math.abs(plcSite.totals.tariffSavings - plcSite.bill.savings) <= 2, [plcSite.totals.tariffSavings, plcSite.bill.savings]);
ok('ERCOT 4CP is a bill saving too: the owner keeps it whole and 70% of the programmes', stream(txBig, 'ercot.4cp').category === 'bill' && stream(txBig, 'ercot.4cp').counted &&
   txBig.totals.gridEarnings > 0 && Math.abs(txBig.totals.owner - (txBig.totals.billSavings + txBig.totals.gridEarnings * 0.7)) <= 1 &&
   txBig.totals.platform === Math.round(txBig.totals.gridEarnings * 0.2), txBig.totals);

section('Hawaii (c30)');
var hiNo = S.simulate({ zip: '96813', segment: 'residential' }), hiPv = S.simulate({ zip: '96813', segment: 'residential', solarKw: 6 });
ok('BYOD Plus needs a battery paired with solar; without it the row is listed, not priced', !stream(hiNo, 'hi.bb') && hiNo.missing.some(function (m) { return /BYOD Plus/.test(m) && /renewable/.test(m); }), hiNo.missing);
var hb = stream(hiPv, 'hi.bb');
ok('with solar it is BYOD Plus, and Battery Bonus is said to be closed', hb && /BYOD Plus/.test(hb.name) && !/Battery Bonus/.test(hb.name) && /Battery Bonus closed/.test(hb.ref) && /2024-07-01/.test(hb.ref), hb);
/* R11: $400/kW up front over five years is $80/kW-yr, so $60 is no
   annualisation of it; the upfront is one-time and listed as such. */
ok('BYOD Plus: the $60 is a planning figure for the recurring export credit, never an "annualisation" of the one-time upfront', hb && !/annualis/i.test(hb.ref) &&
   /one-time/i.test(hb.ref) && /70% × 2 h × 30 days/.test(hb.ref) && /NEM/.test(hb.ref), hb && hb.ref);
ok('…and its $400/kW upfront is listed with the one-time incentives, on the kW it commits', hiPv.missing.some(function (m) { return /^One-time incentives/.test(m) && /BYOD Plus/.test(m) && /\$2,000 on the 5 kW this estimate commits/.test(m); }) &&
   !caRes.missing.some(function (m) { return /^One-time incentives/.test(m) && /BYOD/.test(m); }), hiPv.missing);

/* T9: Kauai is KIUC's, not Hawaiian Electric's */
var kauai = S.simulate({ zip: '96766', segment: 'residential', solarKw: 6 });
ok('Lihue (Kauai) is Kauai Island Utility Cooperative, and is priced no BYOD Plus and no BYOD upfront', kauai.ok && /KIUC/.test(kauai.site.area) && !stream(kauai, 'hi.bb') &&
   kauai.missing.some(function (m) { return /^Hawaiian Electric Bring Your Own Device Plus/.test(m) && /Kauai Island Utility Cooperative/.test(m) && /Not counted/.test(m); }) &&
   !kauai.missing.some(function (m) { return /^One-time incentives/.test(m) && /BYOD/.test(m); }), [kauai.site, kauai.missing]);
ok('every Kauai County ZIP is KIUC; Honolulu and Maui are not', ['96703', '96705', '96714', '96715', '96716', '96722', '96741', '96746', '96747', '96751', '96752', '96754', '96756', '96765', '96766', '96769', '96796']
   .every(function (z) { return S.locate(z).kiuc === true; }) && S.locate('96813').kiuc === false && S.locate('96793').kiuc === false && !!stream(hiPv, 'hi.bb'));

/* ── included with every account ─────────────────────────────────────── */
section('Base: included with every account');
var MODS = require(path.join(ROOT, 'api', '_lib', 'modules'));
var owners = MODS.catalog().filter(function (m) { return m.tools.indexOf('vppsim') >= 0; }).map(function (m) { return m.key; });
ok('Omega Design (lite), the module every package holds, carries it — and only it', owners.length === 1 && owners[0] === 'lite', owners);
var toolsSrc = fs.readFileSync(path.join(ROOT, 'omega-tools.js'), 'utf8');
ok('the catalog opens it on every tier (TIER.ALL)', /key:'vppsim'[\s\S]{0,400}?tier:TIER\.ALL/.test(toolsSrc));
var page = fs.readFileSync(path.join(ROOT, 'vpp-earnings.html'), 'utf8');
ok('the page sells the next step through the Omega Storage module card', page.indexOf('/workspace#module-storage') >= 0);

/* ── provider seam ────────────────────────────────────────────────────── */
section('Provider');
ok('without env the provider is the simulation only', P.configured() === false && P.describe().live === null);
var req = P.request({}, caRes);
ok('the outbound request names no person or address', JSON.stringify(req).indexOf('@') < 0 && req.site.zip === '94110' && !req.load.text);
ok('readQuote maps a tolerant answer', P.readQuote({ annualEarnings: 812.4, streams: [{ name: 'ELRP', usd: 300 }] }).annualUsd === 812);
ok('readQuote refuses an answer with no total', P.readQuote({ streams: [] }) === null);
/* Number() reads null, '', false and [] as 0 and true as 1: none of them is a figure */
[['{total:null}', { total: null }], ['{annualEarnings:null, annual_usd:null, total:null}', { annualEarnings: null, annual_usd: null, total: null, error: 'ZIP not served' }],
 ['{annualEarnings:""}', { annualEarnings: '' }], ['{annualEarnings:"  "}', { annualEarnings: '  ' }], ['{annualEarnings:false}', { annualEarnings: false }],
 ['{annualEarnings:true}', { annualEarnings: true }], ['{annualEarnings:[]}', { annualEarnings: [] }], ['{annualEarnings:[5]}', { annualEarnings: [5] }],
 ['{annualEarnings:"$812"}', { annualEarnings: '$812' }], ['{annualEarnings:"", total:500} (the first field present decides)', { annualEarnings: '', total: 500 }],
 ['an array answer', [900]]].forEach(function (c) {
  ok('readQuote refuses ' + c[0] + ' (no $0 or $1 quote)', P.readQuote(c[1]) === null, P.readQuote(c[1]));
});
ok('readQuote keeps a real $0 quote', (P.readQuote({ annualEarnings: 0 }) || {}).annualUsd === 0);
ok('readQuote reads a numeric string', (P.readQuote({ annual_usd: ' 812.6 ' }) || {}).annualUsd === 813);
ok('readQuote skips a null field for the next one', (P.readQuote({ annualEarnings: null, total: 500 }) || {}).annualUsd === 500);
var rqs = P.readQuote({ total: 1000, streams: [{ name: 'A', usd: null }, { name: 'B', usd: '' }, { name: 'C', usd: true }, { name: 'D', usd: '300' }, null, { name: 'E', usd: 0 }] });
ok('a stream without a real figure is left out, never $0 or $1', rqs && rqs.streams.length === 2 && rqs.streams[0].name === 'D' && rqs.streams[0].usd === 300 && rqs.streams[1].name === 'E' && rqs.streams[1].usd === 0, rqs && rqs.streams);
later(function () {
  process.env.DIVIDENDVPP_API_URL = 'https://example.invalid/estimate';
  process.env.DIVIDENDVPP_API_KEY = 'k';
  var saved = global.fetch, savedAC = global.AbortController, savedErr = console.error, logged = [];
  function restore() {
    global.fetch = saved; global.AbortController = savedAC; console.error = savedErr;
    delete process.env.DIVIDENDVPP_API_URL; delete process.env.DIVIDENDVPP_API_KEY;
  }
  function answer(body) { return function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); } }); }; }
  function named(name, message) { var e = new Error(message); e.name = name; return e; }
  var EST_IN = { zip: '94110', segment: 'residential' };
  /* R18: the function log carries only words the provider wrote (the
     error's class name, the cause's code, one fixed phrase, the endpoint's
     origin). Every line logged in this section is held to that shape. */
  var every = [];
  var PHRASES = ['no answer before our timeout', 'invalid header value; check DIVIDENDVPP_API_KEY',
    'the URL carries credentials, which fetch refuses; check DIVIDENDVPP_API_URL', 'invalid URL; check DIVIDENDVPP_API_URL',
    'network or TLS failure', 'request failed'];
  var LINE = new RegExp('^\\[vpp-provider\\] quote failed \\([A-Za-z][A-Za-z0-9_]*(, [A-Z][A-Z0-9_]*)?\\): (' +
    PHRASES.map(function (p) { return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') +
    ')\\. Endpoint: (https?://[A-Za-z0-9.\\-]+(:\\d+)?|\\[[A-Za-z ()_]+\\])$');
  function none(line, parts) { return parts.every(function (p) { return line.indexOf(p) < 0; }); }
  /* one failing call with this key, URL and fetch: { r, log, n } */
  function failWith(key, url, f) {
    process.env.DIVIDENDVPP_API_KEY = key; process.env.DIVIDENDVPP_API_URL = url; global.fetch = f; logged = [];
    return P.estimate(EST_IN).then(function (r) { return { r: r, log: logged.join('\n'), n: logged.length }; });
  }
  console.error = function () { var l = [].slice.call(arguments).join(' '); logged.push(l); every.push(l); };
  global.fetch = function (u, o) {
    ok('the key goes in the header, never the body', o.headers.Authorization === 'Bearer k' && o.body.indexOf('"k"') < 0);
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ annualEarnings: 900, id: 'q1' }); } });
  };
  return P.estimate(EST_IN).then(function (r) {
    ok('a live quote rides BESIDE the simulation', r.ok && r.provider === 'simulated' && r.providerQuote.ok && r.providerQuote.quote.annualUsd === 900);
    global.fetch = answer({ annualEarnings: null, annual_usd: null, total: null, error: 'ZIP not served' });
    return P.estimate(EST_IN);
  }).then(function (r) {
    ok('a 200 with no figure is "could not be read", never a $0 quote', r.ok && r.providerQuote.ok === false && /could not be read/.test(r.providerQuote.error), r.providerQuote);
    global.fetch = function () { return Promise.reject(named('AbortError', 'This operation was aborted')); };
    return P.estimate(EST_IN);
  }).then(function (r) {
    ok('a provider failure never fails the estimate', r.ok && r.providerQuote.ok === false);
    ok('OUR timeout (an abort) reads "did not answer in time"', /did not answer in time/.test(r.providerQuote.error), r.providerQuote.error);
    logged = [];
    global.fetch = function () { return Promise.reject(new Error('down-MESSAGE-TEXT')); };
    return P.estimate(EST_IN);
  }).then(function (r) {
    ok('any other failure reads "could not be reached", not a timeout', r.ok && /could not be reached/.test(r.providerQuote.error) && !/in time/.test(r.providerQuote.error), r.providerQuote.error);
    ok('it is logged with the error\'s name, a fixed phrase and the origin, never the runtime\'s message', logged.length === 1
      && /^\[vpp-provider\] quote failed \(Error\): request failed\. Endpoint: https:\/\/example\.invalid$/.test(logged[0]) && logged[0].indexOf('MESSAGE-TEXT') < 0, logged);
    global.fetch = function () { throw new TypeError('Failed to parse URL from api.dividendvpp.com/estimate'); };
    return P.estimate(EST_IN);
  }).then(function (r) {
    ok('a fetch that THROWS (bad URL) still answers the simulation, "could not be reached"', r.ok && r.providerQuote.ok === false && /could not be reached/.test(r.providerQuote.error), r.providerQuote);
    /* Node's fetch quotes a bad header VALUE, key and all, in its message */
    process.env.DIVIDENDVPP_API_KEY = 'partner-key-SECRET\nx';
    logged = [];
    global.fetch = function (u, o) { return Promise.reject(new TypeError('Headers.append: "' + o.headers.Authorization + '" is an invalid header value.')); };
    return P.estimate(EST_IN);
  }).then(function (r) {
    ok('a key with a stray newline reads "could not be reached"', /could not be reached/.test(r.providerQuote.error), r.providerQuote.error);
    ok('the log names the failure but never carries the key', logged.length === 1 && /invalid header value/.test(logged[0]) && none(logged[0], ['SECRET', 'partner-key']), logged);
    /* the key quoted in the message and the cause with no "Bearer" before it */
    return failWith('partner-key-SECRET\nx', 'https://example.invalid/estimate', function () {
      var e = new Error('credential rejected: partner-key-SECRET\nx'); e.cause = { code: 'EKEY partner-key-SECRET\nx', message: 'partner-key-SECRET' }; return Promise.reject(e);
    });
  }).then(function (o) {
    ok('a key quoted anywhere in the message or the cause is never logged', o.n === 1 && none(o.log, ['SECRET', 'partner-key', 'EKEY', 'rejected']), o.log);
    /* the runtime printed the key altered (a control character as a space) */
    return failWith('partner-key-SECRET\nx', 'https://example.invalid/estimate', function () { return Promise.reject(new TypeError('Headers.append: "Bearer partner-key-SECRET x" is an invalid header value.')); });
  }).then(function (o) {
    ok('a key the runtime altered is not logged either', o.n === 1 && /invalid header value/.test(o.log) && none(o.log, ['SECRET', 'partner-key']), o.log);
    /* the review's case: the runtime TRIMS the header value before quoting it, so a key with a quote
       inside and space around it never matches verbatim, and a cut at the first quote leaves its tail */
    return failWith('sk_live_9f3a"7Qz\nXK21 ', 'https://example.invalid/estimate', function (u, o) {
      return Promise.reject(new TypeError('Headers.append: "' + o.headers.Authorization.trim() + '" is an invalid header value.'));
    });
  }).then(function (o) {
    ok('a key with a quote inside and space around it: no part of it is logged', o.n === 1 && none(o.log, ['sk_live', '9f3a', '7Qz', 'XK21']), o.log);
    /* a URL error quotes the whole URL: user:pass@ and ?key= */
    return failWith('k', 'https://vppuser:vpppass1@example.invalid/estimate?key=QSECRETQ&token=TOK12345', function (u) {
      return Promise.reject(new TypeError('Request cannot be constructed from a URL that includes credentials: ' + u));
    });
  }).then(function (o) {
    ok('a credentialed URL: the log names the origin, never the userinfo, the path or the query', o.n === 1 && /credentials/.test(o.log)
      && / Endpoint: https:\/\/example\.invalid$/.test(o.log) && none(o.log, ['vppuser', 'vpppass1', 'QSECRETQ', 'TOK12345', '/estimate', '@']), o.log);
    /* a network failure: the cause's code is kept; its message, which can name the URL, is not */
    return failWith('k', 'https://example.invalid:8443/estimate?key=QSECRETQ', function (u) {
      var e = new TypeError('fetch failed'); e.cause = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED ' + u }; return Promise.reject(e);
    });
  }).then(function (o) {
    ok('a network failure logs its code and the origin with its port, nothing else of the URL', o.n === 1
      && /\(TypeError, ECONNREFUSED\): network or TLS failure\. Endpoint: https:\/\/example\.invalid:8443$/.test(o.log) && none(o.log, ['QSECRETQ', 'estimate']), o.log);
    /* a variable part that carries the key is withheld: the key as the error's name and the cause's code */
    return failWith('SK_LIVE_ABCDEF', 'https://example.invalid/estimate', function () {
      var e = new Error('x'); e.name = 'SK_LIVE_ABCDEF'; e.cause = { code: 'SK_LIVE_ABCDEF' }; return Promise.reject(e);
    });
  }).then(function (o) {
    ok('an error name or cause code that is the key is withheld (the name reads "Error")', o.n === 1 && /quote failed \(Error\): /.test(o.log) && o.log.indexOf('SK_LIVE') < 0, o.log);
    return failWith('livekey-abcdef', 'https://livekey-abcdef.example.invalid/estimate', function () { return Promise.reject(new TypeError('fetch failed')); });
  }).then(function (o) {
    ok('a host that carries the key is withheld', o.n === 1 && /Endpoint: \[endpoint withheld\]$/.test(o.log) && o.log.indexOf('livekey') < 0, o.log);
    /* U3: the URL parser lowercases a host, so a key in the host with any capital came back folded */
    return failWith('Tok3nABCDEF', 'https://Tok3nABCDEF.example.invalid/estimate', function () { return Promise.reject(new TypeError('fetch failed')); });
  }).then(function (o) {
    ok('a host that carries the key in another case is withheld (U3)', o.n === 1 && /Endpoint: \[endpoint withheld\]$/.test(o.log) && o.log.toLowerCase().indexOf('tok3n') < 0, o.log);
    return failWith('Kéy-ÄBCD', 'https://Kéy-ÄBCD.example.invalid/estimate', function () { return Promise.reject(new TypeError('fetch failed')); });
  }).then(function (o) {
    ok('a host that carries a non-ASCII key (printed as punycode) is withheld', o.n === 1 && /Endpoint: \[endpoint withheld\]$/.test(o.log) && none(o.log.toLowerCase(), ['xn--', 'bcd']), o.log);
    return failWith('Tok3nABCDEF', 'https://example.invalid/TOK3NABCDEF/x?k=tok3nabcdef&j=Tok3nABCDEF', function () { return Promise.reject(new TypeError('fetch failed')); });
  }).then(function (o) {
    ok('a key in the path and query, in any case: the origin alone is logged', o.n === 1 && / Endpoint: https:\/\/example\.invalid$/.test(o.log) && o.log.toLowerCase().indexOf('tok3n') < 0, o.log);
    return failWith('sk_live_abcdef', 'https://example.invalid/estimate', function () {
      var e = new Error('x'); e.name = 'SK_LIVE_ABCDEF'; e.cause = { code: 'SK_LIVE_ABCDEF' }; return Promise.reject(e);
    });
  }).then(function (o) {
    ok('an error name or code that is the key in another case is withheld', o.n === 1 && /quote failed \(Error\): /.test(o.log) && o.log.toLowerCase().indexOf('sk_live') < 0, o.log);
    /* R18: a URL error whose quoted URL holds the word "header" is a URL fault, and a header error whose key holds "URL" is a header fault */
    return failWith('k', 'api.headerless.example/estimate', function () { return Promise.reject(new TypeError('Failed to parse URL from api.headerless.example/estimate')); });
  }).then(function (o) {
    ok('a scheme-less URL that holds "header" reads "invalid URL", not the key (R18)', o.n === 1 && /: invalid URL; check DIVIDENDVPP_API_URL\./.test(o.log), o.log);
    return failWith('k', 'https://user:pw12@headers.example.invalid/x', function (u) { return Promise.reject(new TypeError('Request cannot be constructed from a URL that includes credentials: ' + u)); });
  }).then(function (o) {
    ok('a credentialed URL whose host holds "headers" reads the credentials phrase (R18)', o.n === 1 && /: the URL carries credentials/.test(o.log) && none(o.log, ['pw12', 'user']), o.log);
    return failWith('my URL-key\nx', 'https://example.invalid/x', function (u, o2) { return Promise.reject(new TypeError('Headers.append: "' + o2.headers.Authorization + '" is an invalid header value.')); });
  }).then(function (o) {
    ok('a header error whose key holds "URL" reads the header phrase', o.n === 1 && /: invalid header value; check DIVIDENDVPP_API_KEY\./.test(o.log) && o.log.indexOf('URL-key') < 0, o.log);
    return failWith('k', 'https://example.invalid/estimate', function () { var e = new Error('x'); e.name = 'Bad "name" k=QSECRETQ'; return Promise.reject(e); });
  }).then(function (o) {
    ok('an error name that is not an identifier reads "Error"', o.n === 1 && /quote failed \(Error\): /.test(o.log) && none(o.log, ['QSECRETQ', 'Bad']), o.log);
    /* the same faults through the REAL fetch, where the runtime has one: each fails before any network */
    if (typeof saved !== 'function') return null;
    return failWith('partner-key-SECRET\u0000x', 'https://example.invalid/estimate', saved).then(function (o2) {
      ok('real fetch, a NUL in the key: "could not be reached", key not logged', /could not be reached/.test(o2.r.providerQuote.error) && none(o2.log, ['SECRET', 'partner-key']), [o2.r.providerQuote.error, o2.log]);
      return failWith('sk_live_9f3a"7Qz\nXK21 ', 'https://example.invalid/estimate', saved);
    }).then(function (o2) {
      ok('real fetch, the review\'s key (a quote inside, a newline, a trailing space): no part of it logged', o2.n === 1 && /invalid header value/.test(o2.log) && none(o2.log, ['sk_live', '9f3a', '7Qz', 'XK21']), o2.log);
      return failWith('  "sk_live_ABC1\nDEF2"\n', 'https://example.invalid/estimate', saved);
    }).then(function (o2) {
      ok('real fetch, a key pasted with its quotes, wrapped, with a trailing newline: none of it logged', o2.n === 1 && none(o2.log, ['sk_live', 'ABC1', 'DEF2']), o2.log);
      return failWith('k', 'https://vppuser:vpppass1@example.invalid/estimate?key=QSECRETQ', saved);
    }).then(function (o2) {
      ok('real fetch, a URL with user:pass@ and ?key=: "could not be reached", the origin logged and nothing else of it', /could not be reached/.test(o2.r.providerQuote.error)
        && o2.n === 1 && / Endpoint: https:\/\/example\.invalid$/.test(o2.log) && none(o2.log, ['vppuser', 'vpppass1', 'QSECRETQ', '/estimate']), [o2.r.providerQuote.error, o2.log]);
      return failWith('k', 'api.dividendvpp.com/estimate?key=QSECRETQ', saved);
    }).then(function (o2) {
      ok('real fetch, a URL without a scheme: "could not be reached", the log says why and never prints it', /could not be reached/.test(o2.r.providerQuote.error)
        && /invalid URL/.test(o2.log) && none(o2.log, ['QSECRETQ', 'dividendvpp.com', 'estimate']), [o2.r.providerQuote.error, o2.log]);
      return failWith('Tok3nABCDEF', 'https://Tok3nABCDEF.localhost:9/estimate', saved);
    }).then(function (o2) {
      ok('real fetch, the key as a mixed-case host label: withheld, in any case (U3)', o2.n === 1 && /Endpoint: \[endpoint withheld\]$/.test(o2.log) && o2.log.toLowerCase().indexOf('tok3n') < 0, o2.log);
      return failWith('k', 'api.headerless.example/estimate', saved);
    }).then(function (o2) {
      ok('real fetch, a scheme-less URL holding "header": "invalid URL" (R18)', o2.n === 1 && /\(TypeError, ERR_INVALID_URL\): invalid URL; check DIVIDENDVPP_API_URL\./.test(o2.log), o2.log);
      return failWith('k', 'https://user:pw12@headers.example.invalid/x', saved);
    }).then(function (o2) {
      ok('real fetch, a credentialed URL on a "headers" host: the credentials phrase (R18)', o2.n === 1 && /: the URL carries credentials/.test(o2.log) && none(o2.log, ['pw12', 'user@']), o2.log);
      return failWith('my URL-key\nx', 'https://example.invalid/x', saved);
    }).then(function (o2) {
      ok('real fetch, a key holding "URL" and a newline: the header phrase', o2.n === 1 && /: invalid header value; check DIVIDENDVPP_API_KEY\./.test(o2.log) && o2.log.indexOf('URL-key') < 0, o2.log);
    });
  }).then(function () {
    ok('every line the provider logged is the fixed shape: name, code, one phrase, origin', every.length >= 10 && every.every(function (l) { return LINE.test(l); }),
      every.filter(function (l) { return !LINE.test(l); }));
    global.fetch = saved; process.env.DIVIDENDVPP_API_KEY = 'k'; process.env.DIVIDENDVPP_API_URL = 'https://example.invalid/estimate';
  }).then(function () {
    /* our clock runs out while the body is still arriving */
    var made = null;
    global.AbortController = function () { var sig = { aborted: false }; this.signal = sig; this.abort = function () { sig.aborted = true; }; made = this; };
    global.fetch = function () {
      return Promise.resolve({ ok: true, status: 200, json: function () { made.abort(); return Promise.reject(named('AbortError', 'aborted')); } });
    };
    return P.estimate(EST_IN);
  }).then(function (r) {
    ok('a timeout during the body reads "did not answer in time", not "could not be read"', /did not answer in time/.test(r.providerQuote.error), r.providerQuote.error);
    restore();
  }, function (e) { restore(); throw e; });
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
  ['EVERY account: a trial workspace runs it', docs({ status: 'active' }, { tier: 'trial' }), EST, null, function (r) { return r.status === 200; }],
  ['EVERY account: no billing record at all runs it (a trial by default)', docs({ status: 'active' }), EST, null, function (r) { return r.status === 200; }],
  ['EVERY account: a package holding only Omega Design runs it', docs({ status: 'active' }, { packaged: true, packagingState: 'paid', accessUntil: 4102444800000, modules: ['lite'] }, { role: 'member', status: 'active' }), EST, null, function (r) { return r.status === 200; }],
  ['a read-only (unpaid) package does not', docs({ status: 'active' }, { packaged: true, packagingState: 'paid', accessUntil: 1000, modules: ['lite'] }, { role: 'member', status: 'active' }), EST, null, function (r) { return r.status === 403; }],
  ['an unknown tier refuses', docs({ status: 'active' }, { tier: 'free' }), EST, null, function (r) { return r.status === 403; }],
  ['an override lifts an unknown tier', docs({ status: 'active' }, { tier: 'free', toolOverrides: { vppsim: true } }), EST, null, function (r) { return r.status === 200; }],
  ['a billing read that throws is 503, never a pass', docs({ status: 'active' }, { __throws: 502 }), EST, null, function (r) { return r.status === 503; }],
  ['staff skip the entitlement', docs({ status: 'suspended' }), EST, { caller: { uid: 's', email: 'x@clearsky-usa.com', emailVerified: true, orgId: 'clearsky-usa.com', staff: true } }, function (r) { return r.status === 200; }],
  ['bad input is 400 with field errors', docs(undefined, { tier: 'standard' }), { action: 'estimate', site: { zip: 'x' } }, null, function (r) { return r.status === 400 && r.body.errors[0].field === 'zip'; }],
  ['"Which column is the load?" reaches the page as 400 with the columns intact', docs(undefined, { tier: 'standard' }), { action: 'estimate', site: { zip: '60601', segment: 'commercial', load: { type: 'interval', text: askText, unit: 'kw' } } }, null,
    function (r) { var e = r.body.errors && r.body.errors[0]; return r.status === 400 && e.field === 'load.column' && e.columns.length === 2 && e.columns[1].key === 'Delivered' && e.columns[0].sample.length === 3; }],
  ['an estimate with load.column runs and reports the column', docs(undefined, { tier: 'standard' }), { action: 'estimate', site: { zip: '60601', segment: 'commercial', load: { type: 'interval', text: askText, unit: 'kw', column: 'Delivered' } } }, null,
    function (r) { return r.status === 200 && r.body.result.load.column.key === 'Delivered' && r.body.result.load.column.chosen === 'caller'; }],
  ['an unknown action is 400', docs(undefined, { tier: 'standard' }), { action: 'dump' }, null, function (r) { return r.status === 400; }],
  ['options lists markets', docs(undefined, { tier: 'standard' }), { action: 'options' }, null, function (r) { return r.status === 200 && r.body.options.markets.length >= 10; }]
].forEach(function (c) {
  later(function () {
    return call(c[1], c[2], c[3] || {}).then(function (r) { ok(c[0], c[4](r), { status: r.status, body: r.body && (r.body.error || r.body.errors) }); });
  });
});
/* options answers the org the server resolved, which the page saves under:
   the rules fold fenecon.de/.us into fenecon.com, and so does verify-token */
var JO = { uid: 'u2', email: 'jo@fenecon.de', emailVerified: true, orgId: 'fenecon.com', staff: false, claims: {} };
[
  ['options answers the caller\'s org', docs(undefined, { tier: 'standard' }), { action: 'options' }, null, function (r) { return r.status === 200 && r.body.orgId === ORG; }],
  ['options answers the FOLDED org for an aliased address (fenecon.de → fenecon.com)', {}, { action: 'options' }, { caller: JO }, function (r) { return r.status === 200 && r.body.orgId === 'fenecon.com'; }],
  ['an estimate names no org (only options does)', docs(undefined, { tier: 'standard' }), EST, null, function (r) { return r.status === 200 && r.body.orgId === undefined; }]
].forEach(function (c) {
  later(function () {
    return call(c[1], c[2], c[3] || {}).then(function (r) { ok(c[0], c[4](r), { status: r.status, orgId: r.body && r.body.orgId, body: r.body && (r.body.error || r.body.errors) }); });
  });
});

later(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
});
