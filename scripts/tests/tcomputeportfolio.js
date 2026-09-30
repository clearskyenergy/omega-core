/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The Compute Site Pro Forma's portfolio, offline: api/_lib/compute-portfolio.js
   (saved scenarios run as saved, summed year by year) and the workbook it
   writes through api/_lib/portfolio/xlsx.js, the one writer.

   What is held here:
     - every site's figures are compute-site.model's own for its inputs:
       nothing is re-sized, nothing is priced a second way;
     - "fits" is compute-site.fitsService, the sizing sweep's own rule;
     - the portfolio is the SUM of the after-tax cash flows, and its IRR,
       NPV, MOIC and payback are the finance engine's functions on that sum;
     - a scenario that cannot run is listed with the reason, never dropped;
     - the workbook is a well-formed .xlsx whose formulas carry the value
       the spreadsheet will compute (recomputed with LibreOffice while it
       was built: every formula matched to 1e-9).

   No network, no credentials, no npm install.
   Run: node scripts/tests/tcomputeportfolio.js
*/
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var CS = require(path.join(ROOT, 'api', '_lib', 'compute-site'));
var CP = require(path.join(ROOT, 'api', '_lib', 'compute-portfolio'));
var PF = require(path.join(ROOT, 'api', '_lib', 'proforma-engine'));
var XL = require(path.join(ROOT, 'api', '_lib', 'portfolio', 'xlsx'));
var ZIP = require(path.join(ROOT, 'api', '_lib', 'portfolio', 'zip'));
var VS = require(path.join(ROOT, 'api', '_lib', 'vpp-sim'));

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got).slice(0, 400) : '')); }
}
function section(t) { console.log('\n' + t); }
function near(a, b, tol) { return a != null && b != null && Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }
function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function bills(kwhYear, peak, overfullMonth) {
  var shape = [0.95, 0.9, 0.95, 0.97, 1.02, 1.08, 1.15, 1.16, 1.08, 1.0, 0.93, 0.91], s = sum(shape), out = [];
  for (var i = 0; i < 12; i++) {
    var mo = (i + 3) % 12 + 1, yr = i + 3 >= 12 ? 2025 : 2024;
    var kwh = Math.round(kwhYear * shape[i] / s);
    out.push({ month: yr + '-' + (mo < 10 ? '0' : '') + mo, kwh: kwh, peakKw: i === overfullMonth ? Math.round(kwh / 744 * 0.8) : Math.round(peak * (0.85 + 0.15 * shape[i])) });
  }
  return out;
}
function site(name, zip, amps, pods, bkw, bkwh, kwhYear, peak, extra) {
  var o = { site: { name: name, zip: zip, city: name, host: 'Host ' + name, hostType: 'retail' }, service: { amps: amps, volts: 480 },
    ev: { ports: 0 }, compute: { pods: pods }, battery: bkwh ? { kw: bkw, kwh: bkwh } : {}, deal: { structure: 'infra' },
    load: { type: 'bills', bills: bills(kwhYear, peak, extra && extra.overfull) } };
  Object.keys((extra && extra.over) || {}).forEach(function (k) { o[k] = extra.over[k]; });
  return o;
}
var A = { id: 'a', name: 'Alpha', at: '2026-09-30T12:00:00Z', input: site('Alpha', '91405', 800, 5, 200, 800, 1052640, 441.6) };
var B = { id: 'b', name: 'Bravo', at: '2026-09-30T12:01:00Z', input: site('Bravo', '92562', 400, 1, 200, 800, 1588052, 228) };
var C = { id: 'c', name: 'Charlie', at: '2026-09-30T12:02:00Z', input: site('Charlie', '92121', 400, 4, 75, 150, 689259, 146.9) };
var D = { id: 'd', name: 'Delta', input: site('Delta', '98036', 200, 1, 200, 800, 606300, 58.7, { overfull: 5, over: { finance: { years: 15, discountPct: 8 } } }) };
var LEASE = { id: 'l', name: 'Lease site', input: { site: { name: 'Lease site', zip: '78701', hostType: 'multifamily' }, service: { amps: 800, volts: 480 },
  ev: { ports: 0 }, compute: { pods: 2 }, deal: { structure: 'lease' } } };
var INTERVAL = { id: 'i', name: 'Interval site', input: { site: { name: 'Interval site', zip: '97005' }, service: { amps: 400 }, load: { type: 'interval', unit: 'kw' } } };
var BAD = { id: 'x', name: 'Bad ZIP', input: { site: { name: 'Bad ZIP', zip: 'nope' }, service: { amps: 400 } } };
var TWICE = clone(A);

/* ── refusals ──────────────────────────────────────────────────────────── */
section('What it refuses');
ok('no scenarios is refused', CP.run([]).ok === false && CP.run(null).ok === false);
var many = []; for (var k = 0; k < CP.MAX_SITES + 1; k++) many.push(A);
ok('more than ' + CP.MAX_SITES + ' is refused before anything runs', CP.run(many).ok === false);

/* ── the run ───────────────────────────────────────────────────────────── */
section('Each site as saved');
var t0 = Date.now();
var R = CP.run([B, A, C, D, LEASE, INTERVAL, BAD, TWICE], { prepared: '2026-09-30', brand: { name: 'Your Company', platformName: 'ClearSky-OMEGA' } });
var ms = Date.now() - t0;
ok('it runs (' + ms + ' ms for 8 picked)', R.ok === true && R.picked === 8 && R.ran === 5, { ran: R.ran, skipped: R.skipped });
function byId(id) { return R.sites.filter(function (s) { return s.id === id; })[0]; }
function skipOf(id) { return R.skipped.filter(function (s) { return s.id === id; })[0]; }
ok('an interval scenario is listed as not run, and why', /interval file/.test((skipOf('i') || {}).reason));
ok('an input the model refuses is listed with the model\'s own words', /ZIP/.test((skipOf('x') || {}).reason), skipOf('x'));
ok('a scenario picked twice is counted once', /picked twice/.test((skipOf('a') || {}).reason) && R.sites.filter(function (s) { return s.id === 'a'; }).length === 1);
['a', 'b', 'c', 'd'].forEach(function (id) {
  var s = byId(id), src = { a: A, b: B, c: C, d: D }[id], m = CS.model(src.input), pf = m.proforma;
  ok(s.name + ': the model\'s own figures, nothing re-sized', near(s.irr, pf.metrics.afterTaxIrr, 1e-12) && near(s.npv, pf.metrics.npv, 1e-6) &&
    s.capital === pf.capex.total && s.pods === m.compute.pods && s.batteryKwh === m.battery.kwh, { irr: s.irr, model: pf.metrics.afterTaxIrr });
  ok(s.name + ': fits is the model\'s one rule', s.fits === m.balance.fits);
  ok(s.name + ': its cash flow is the model\'s, to the cent', s.flows.length === pf.rows.length + 1 &&
    near(s.flows[0], pf.year0.afterTaxCash, 0.006) && pf.rows.every(function (r, i) { return near(s.flows[i + 1], r.afterTaxCash, 0.006); }));
});
var sw = CS.optimize(B.input), cell = sw.grid.filter(function (g) { return g.pods === 1 && g.batteryKwh === 800 && g.batteryKw === 200; })[0];
ok('the sweep and the portfolio read the same fit rule', cell && cell.fits === byId('b').fits && typeof CS.fitsService === 'function', { cell: cell, site: byId('b').fits });
ok('a lease with no capital is listed, not invested', byId('l') && byId('l').invested === false && byId('l').leaseNpv > 0);

section('The portfolio');
var P = R.portfolio.all, inv = R.sites.filter(function (s) { return s.invested; });
ok('the sums are over the sites with capital only', P.sites === inv.length && P.sites === 4);
var N = Math.max.apply(null, inv.map(function (s) { return s.flows.length - 1; }));
ok('the longest term sets the years (15)', P.years === 15 && P.flows.length === 16);
var sumOk = true;
for (var t = 0; t <= N; t++) {
  var want = sum(inv.map(function (s) { return s.flows[t] || 0; }));
  if (!near(P.flows[t], want, 0.01)) sumOk = false;
}
ok('each year is the sum of the sites\' after-tax cash, and a shorter term adds nothing after it ends', sumOk && P.flows[12] === byId('d').flows[12]);
ok('the IRR is the finance engine\'s IRR of the sum', near(P.irr, PF.irr(P.flows), 1e-12));
var irrs = inv.map(function (s) { return s.irr; }), avg = sum(irrs) / irrs.length;
ok('the IRR is not the average of the sites\' IRRs', P.irr > Math.min.apply(null, irrs) && P.irr < Math.max.apply(null, irrs) && Math.abs(P.irr - avg) > 1e-4, { irr: P.irr, avg: avg });
ok('NPV at the rate most sites use; mixed rates are said', R.discountPct === 10 && R.mixedRates === true && near(P.npv, PF.npv(P.flows, 0.10), 1e-6));
ok('equity, capital and net return are sums', near(P.equity, sum(inv.map(function (s) { return s.equity; })), 1e-6) &&
  near(P.capital, sum(inv.map(function (s) { return s.capital; })), 1e-6) && near(P.netReturn, sum(P.flows), 1e-6));
ok('MOIC is years 1 to N over the equity at close', near(P.moic, (sum(P.flows) - P.flows[0]) / P.equity, 1e-9));
ok('payback is the engine\'s on the sum', P.payback === PF.payback(P.flows));
var F = R.portfolio.fits;
ok('the fit portfolio holds only sites that fit', F.sites === inv.filter(function (s) { return s.fits; }).length && F.sites < P.sites && F.sites > 0,
  inv.map(function (s) { return s.name + ':' + s.fits; }));
ok('sites with capital rank first, by after-tax IRR', R.sites[R.sites.length - 1].id === 'l' &&
  inv.every(function (s, i) { return i === 0 || inv[i - 1].irr >= s.irr; }) && R.sites.indexOf(inv[inv.length - 1]) === inv.length - 1);

section('What needs a look');
function flag(code) { return R.flags.filter(function (f) { return f.code === code; })[0]; }
ok('a build that does not fit is flagged critical, by name', flag('NO_FIT') && flag('NO_FIT').level === 'critical' &&
  flag('NO_FIT').sites.length === inv.concat(byId('l')).filter(function (s) { return !s.fits; }).length);
ok('bills whose kWh the billed peak cannot draw are flagged', flag('BILLS_OVERFULL') && flag('BILLS_OVERFULL').sites.indexOf('Delta') >= 0);
ok('the model\'s own warnings are carried (a planning rate)', flag('PLANNING_RATE') && flag('PLANNING_RATE').count >= 3);
ok('critical first', R.flags[0].level === 'critical');
ok('a flag several sites share carries no one site\'s figures', ['SERVICE_OVERLOAD', 'SPOT_CURTAILED', 'PLANNING_RATE'].every(function (c) {
  var f = flag(c); return !f || f.count < 2 || !/\d/.test(f.text.replace(/NEC 625\.42|URDB/g, ''));
}), R.flags.map(function (f) { return f.code + ': ' + f.text.slice(0, 60); }));
var dup = CP.run([A, { id: 'a2', name: 'alpha', input: A.input }], { prepared: '2026-09-30' });
ok('two picked scenarios with one name are flagged', dup.flags.some(function (f) { return f.code === 'DUPLICATE_NAME' && f.count === 2; }));
var L = VS.site.buildLoad({ load: { type: 'bills', bills: bills(606300, 150, 5) } }, VS.locate('98036'), 'commercial');
ok('the one load builder says which month\'s bill is impossible', L.notes.some(function (n) { return /^In Sep, .*load factor above 1\.0.*That month is/.test(n); }), L.notes);
var L3 = VS.site.buildLoad({ load: { type: 'bills', bills: D.input.load.bills } }, VS.locate('98036'), 'commercial');
ok('a building whose every bill is over-full is said once, as every month', L3.notes.some(function (n) { return /^In every month, /.test(n); }), L3.notes);
var L2 = VS.site.buildLoad({ load: { type: 'bills', bills: A.input.load.bills } }, VS.locate('91405'), 'commercial');
ok('ordinary bills get no such note', !L2.notes.some(function (n) { return /load factor above/.test(n); }));

section('What the page is sent');
var page = CP.forPage(R);
ok('rows without their cash flows, warnings as codes', page.sites.every(function (s) { return !s.flows && !s.preFlows && s.warnings.every(function (w) { return typeof w === 'string'; }); }));
ok('the workbook as base64, named for the day', page.workbook && /^Compute-portfolio-5-sites-2026-09-30\.xlsx$/.test(page.workbook.name) &&
  Buffer.from(page.workbook.base64, 'base64').length === page.workbook.bytes, page.workbook && page.workbook.name);
ok('the page payload stays small (' + JSON.stringify(page).length + ' bytes)', JSON.stringify(page).length < 120000);
var none = CP.run([INTERVAL], { prepared: '2026-09-30' });
ok('nothing that can run: no workbook, and the reason', none.ok && none.ran === 0 && none.workbook.bytes === null && CP.forPage(none).workbook === null && none.skipped.length === 1);

/* ── the workbook ──────────────────────────────────────────────────────── */
section('The workbook');
var files = {}; ZIP.extract(R.workbook.bytes).forEach(function (f) { files[f.name] = f.bytes.toString('utf8'); });
ok('a ZIP the repo\'s own safe reader opens, deflated', Object.keys(files).length === 12 && R.workbook.bytes.length < 40000, Object.keys(files));
function balanced(xml) {
  var stack = [], re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g, m;
  var body = xml.replace(/<\?xml[^>]*\?>/, '');
  while ((m = re.exec(body))) {
    if (m[4]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
}
ok('every part is well-formed XML', Object.keys(files).every(function (n) { return balanced(files[n]); }), Object.keys(files).filter(function (n) { return !balanced(files[n]); }));
var wbx = files['xl/workbook.xml'];
ok('five sheets, in order', /<sheet name="Portfolio" sheetId="1"[^>]*\/><sheet name="After-tax cash flow" sheetId="2"[^>]*\/><sheet name="Metric verification" sheetId="3"[^>]*\/><sheet name="Site inputs" sheetId="4"[^>]*\/><sheet name="Method &amp; flags" sheetId="5"/.test(wbx));
ok('Excel recalculates on open', /fullCalcOnLoad="1"/.test(wbx));
ok('the content types name every sheet and the styles', [1, 2, 3, 4, 5].every(function (i) { return files['[Content_Types].xml'].indexOf('/xl/worksheets/sheet' + i + '.xml') >= 0; }) &&
  /styles\+xml/.test(files['[Content_Types].xml']));
function cells(xml) {
  var out = {}, re = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, m;
  while ((m = re.exec(xml))) {
    var f = /<f>([\s\S]*?)<\/f>/.exec(m[3] || ''), v = /<v>([\s\S]*?)<\/v>/.exec(m[3] || ''), s = /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[3] || '');
    out[m[1]] = { f: f ? f[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : null,
                  v: v ? v[1] : (s ? s[1].replace(/&amp;/g, '&') : null), t: (/t="(\w+)"/.exec(m[2]) || [])[1] || null };
  }
  return out;
}
var S1 = cells(files['xl/worksheets/sheet1.xml']), S2 = cells(files['xl/worksheets/sheet2.xml']), S3 = cells(files['xl/worksheets/sheet3.xml']);
function findRow(sheet, label) {
  for (var ref in sheet) if (/^A\d+$/.test(ref) && sheet[ref].v === label) return +ref.slice(1);
  return null;
}
var cfAll = findRow(S2, 'Portfolio: all 4 sites'), cfFit = findRow(S2, 'Portfolio: the ' + F.sites + ' that fit');
ok('the cash flow sheet sums each year with a live formula', cfAll && S2['C' + cfAll].f === 'SUM(C5:C8)' && near(+S2['C' + cfAll].v, P.flows[0], 0.01) &&
  near(+S2['R' + cfAll].v, P.flows[15], 0.01), cfAll && S2['C' + cfAll]);
ok('the fit row is a SUMIF on the fit column', cfFit && /^SUMIF\(\$B\$5:\$B\$8,"Yes",D5:D8\)$/.test(S2['D' + cfFit].f) && near(+S2['D' + cfFit].v, F.flows[1], 0.01));
var pAll = findRow(S1, 'Portfolio: all 4 sites with capital');
ok('the portfolio IRR is the spreadsheet\'s IRR of the summed row', pAll && S1['W' + pAll].f === 'IFERROR(IRR(\'After-tax cash flow\'!C' + cfAll + ':R' + cfAll + '),"n/a")' &&
  near(+S1['W' + pAll].v, P.irr, 1e-12), pAll && S1['W' + pAll]);
ok('its NPV is the spreadsheet\'s NPV of the summed row at the portfolio\'s rate', /^IFERROR\(NPV\(0\.1,'After-tax cash flow'!D\d+:R\d+\)\+'After-tax cash flow'!C\d+,"n\/a"\)$/.test(S1['Y' + pAll].f) &&
  near(+S1['Y' + pAll].v, P.npv, 1e-6));
ok('the sums stop above the lease with no capital', S1['P' + pAll].f === 'SUM(P6:P9)' && +S1['P' + pAll].v === P.pods, S1['P' + pAll]);
var worst = { D: 0, G: 0, M: 0 };
for (var r = 5; r < 5 + inv.length; r++) ['D', 'G', 'M'].forEach(function (c) { var x = Math.abs(+S3[c + r].v); if (x > worst[c]) worst[c] = x; });
ok('the model and the spreadsheet agree: IRR within 0.01 bp, NPV and net return within a cent', worst.D < 0.01 && worst.G < 0.01 && worst.M < 0.01, worst);
ok('the recomputation reads the cash flow sheet, never a copied number', /^IFERROR\(IRR\('After-tax cash flow'!C5:R5\),"n\/a"\)$/.test(S3.C5.f) && /^NPV\(0\.1,'After-tax cash flow'!D5:R5\)\+'After-tax cash flow'!C5$/.test(S3.F5.f));
ok('the method sheet names what did not run', files['xl/worksheets/sheet5.xml'].indexOf('Interval site') >= 0 && files['xl/worksheets/sheet5.xml'].indexOf('NOT RUN') >= 0);
ok('no tenant name leaks in from a fixture', !/example-energy|concord|fenecon/i.test(JSON.stringify(files)));

section('The writer');
var tricky = XL.workbook({ sheets: [
  { name: 'A [bad]: name?', rows: [['<b> & "q"', 'x\u0001y'], [{ f: 'IF(A1<>"",1,0)', v: 1 }]] },
  { name: 'A  bad   name', rows: [[1]] },
  { name: 'A  bad   name', rows: [[2]] }] });
var tf = {}; ZIP.extract(tricky).forEach(function (f) { tf[f.name] = f.bytes.toString('utf8'); });
ok('sheet names lose what Excel refuses, and repeats are made unique', /name="A  bad   name 2"/.test(tf['xl/workbook.xml']) && /name="A  bad   name"/.test(tf['xl/workbook.xml']) &&
  !/[\[\]:?]/.test((/<sheet name="([^"]*)" sheetId="1"/.exec(tf['xl/workbook.xml']) || [])[1] || '['));
ok('text and formulas are escaped, control characters dropped', tf['xl/worksheets/sheet1.xml'].indexOf('&lt;b&gt; &amp; &quot;q&quot;') >= 0 &&
  tf['xl/worksheets/sheet1.xml'].indexOf('xy') >= 0 && tf['xl/worksheets/sheet1.xml'].indexOf('<f>IF(A1&lt;&gt;&quot;&quot;,1,0)</f>') >= 0 &&
  Object.keys(tf).every(function (n) { return balanced(tf[n]); }));
var T = require(path.join(ROOT, 'api', '_lib', 'portfolio', 'template'));
var rows = XL.sheetRows(XL.build(T.templateRows()));
ok('the upload template still round-trips through the reader', rows[0][1] === 'Site name' && rows[1][0] === 'S-001');
ok('sheetRef quotes names that need it', XL.sheetRef('After-tax cash flow') === "'After-tax cash flow'" && XL.sheetRef("O'Neil") === "'O''Neil'" && XL.sheetRef('Portfolio') === 'Portfolio');

section('The prepared date');
var EP = require(path.join(ROOT, 'api', 'compute-proforma'));
var noonUtc = Date.parse('2026-10-01T03:00:00Z');
ok('the caller\'s own day within a day and a half is kept (evening in California)', EP._preparedDay('2026-09-30', noonUtc) === '2026-09-30');
ok('a day far away, or nonsense, is today in UTC', EP._preparedDay('2020-01-01', noonUtc) === '2026-10-01' && EP._preparedDay('soon', noonUtc) === '2026-10-01');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
