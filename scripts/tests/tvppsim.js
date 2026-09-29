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
ok('Dominion NC gets the PJM rows (PLC), not the Southeast BYOD rate', (function () {
  var r = S.simulate({ zip: '27954', segment: 'commercial' });
  return r.ok && !!stream(r, 'pjm.plc') && !stream(r, 'se.dr');
})());
ok('the US Virgin Islands (008) are refused, not priced as Puerto Rico', S.locate('00802').ok === false);
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
ok('ELRP is never told it lost to the closed DSGS', !caRes.streams.some(function (x) { return x.why && /DSGS/.test(x.why); }));
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
ok('a home battery\'s ELRP events are 3 h (sub-group A.4), a business\'s 4 h (A.2)', /× 3 h/.test(el2.how) && /× 4 h/.test(el1.how) && /A\.4/.test(el2.ref) && /A\.2/.test(el2.ref) && !/A\.6/.test(el2.ref));
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
var q = [], qi; for (qi = 0; qi < 8760; qi++) q.push('"' + iso(2025, 1, 1) + '","1,234.5"');
var quoted = S.parseInterval(q.join('\n'), 'kw');
ok('a quoted "1,234.5" is one reading of 1,234.5', quoted.ok && quoted.kw[0] === 1234.5, quoted.ok ? quoted.kw[0] : quoted);
var gb = ['Name,ACCOUNT NAME', 'Address,1 MAIN ST', 'Account Number,12345', 'Service,Service 1', '', 'TYPE,DATE,START TIME,END TIME,USAGE,UNITS,COST,NOTES'];
for (qi = 0; qi < 35040; qi++) { var gt = dayAt(2025, 1, 1, Math.floor(qi / 96)); gb.push('Electric usage,' + iso(gt[0], gt[1], gt[2]) + ',00:00,00:14,0.25,kWh,$0.03,'); }
var green = S.parseInterval(gb.join('\n'), 'kwh');
ok('a utility (Green Button) download reads USAGE, not the $ COST column', green.ok && Math.abs(green.kw[0] - 1) < 1e-9, green.ok ? green.kw[0] : green);
var greenKw = S.parseInterval(gb.join('\n'), 'kw');
ok('…and says so when its kWh column was read as kW', greenKw.ok && greenKw.notes.some(function (n) { return /looks like kWh per interval/.test(n); }), greenKw.notes);
var costRows = ['Start,Usage,Units,Cost']; for (qi = 0; qi < 8760; qi++) costRows.push(iso(2025, 1, 1) + ' 00:00,40.0,kWh,$6.00');
var cost = S.parseInterval(costRows.join('\n'), 'kwh');
ok('a trailing $ cost column is never the load', cost.ok && cost.kw[0] === 40, cost.ok ? cost.kw[0] : cost);
var dollarRows = []; for (qi = 0; qi < 8760; qi++) dollarRows.push(iso(2025, 1, 1) + ' 00:00,40.0,$6.00');
var dollars = S.parseInterval(dollarRows.join('\n'), 'kw');
ok('a cell with a currency sign is never a reading, header or not', dollars.ok && dollars.kw[0] === 40, dollars.ok ? dollars.kw[0] : dollars);
var twoCol = []; for (qi = 0; qi < 8760; qi++) twoCol.push((qi % 24) + ',5.2');
ok('two numeric columns and no header are refused, not guessed', /more than one column/i.test(S.parseInterval(twoCol.join('\n'), 'kw').error || ''));
var amb = ['Date,Import kWh,Delivered kWh']; for (qi = 0; qi < 8760; qi++) amb.push(iso(2025, 1, 1) + ',1,2');
ok('two load-named columns the unit cannot tell apart are refused', /more than one load column/i.test(S.parseInterval(amb.join('\n'), 'kwh').error || ''));
var nem = ['TYPE,DATE,START TIME,END TIME,IMPORT (kWh),EXPORT (kWh),COST']; for (qi = 0; qi < 8760; qi++) nem.push('Electric usage,' + iso(2025, 1, 1) + ',00:00,00:59,2.5,0.4,$0.50');
var nemR = S.parseInterval(nem.join('\n'), 'kwh');
ok('an IMPORT / EXPORT download reads the imports as the load, and says the export was set aside', nemR.ok && nemR.kw[0] === 2.5 && nemR.notes.some(function (n) { return /export column/.test(n); }), nemR.ok ? nemR.notes : nemR);
var both = ['Date,kWh,kW']; for (qi = 0; qi < 8760; qi++) both.push(iso(2025, 1, 1) + ',3,7');
ok('a kWh and a kW column are told apart by the chosen unit', S.parseInterval(both.join('\n'), 'kw').kw[0] === 7 && S.parseInterval(both.join('\n'), 'kwh').kw[0] === 3);
var t0 = Date.now(), big = S.parseInterval(new Array(1000001).join('9') + 'x', 'kw'), ms = Date.now() - t0;
ok('a 1 MB digit run is refused in well under a second (no quadratic regex)', big.ok === false && ms < 1000, ms + ' ms');
var cells = []; for (qi = 0; qi < 10; qi++) cells.push(new Array(20001).join('9') + 'x');
t0 = Date.now(); var dos = S.simulate({ zip: '60601', load: { type: 'interval', text: cells.join(',') } }); ms = Date.now() - t0;
ok('ten 20,000-digit cells cost milliseconds, not seconds', dos.ok === false && ms < 1000, ms + ' ms');
ok('the text cap is what a year of readings needs (3 MB)', S.simulate({ zip: '60601', load: { type: 'interval', text: new Array(3000002).join('1') } }).errors[0].field === 'load.text');

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
  ['EVERY account: a trial workspace runs it', docs({ status: 'active' }, { tier: 'trial' }), EST, null, function (r) { return r.status === 200; }],
  ['EVERY account: no billing record at all runs it (a trial by default)', docs({ status: 'active' }), EST, null, function (r) { return r.status === 200; }],
  ['EVERY account: a package holding only Omega Design runs it', docs({ status: 'active' }, { packaged: true, packagingState: 'paid', accessUntil: 4102444800000, modules: ['lite'] }, { role: 'member', status: 'active' }), EST, null, function (r) { return r.status === 200; }],
  ['a read-only (unpaid) package does not', docs({ status: 'active' }, { packaged: true, packagingState: 'paid', accessUntil: 1000, modules: ['lite'] }, { role: 'member', status: 'active' }), EST, null, function (r) { return r.status === 403; }],
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
