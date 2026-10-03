/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/compute-portfolio.js — THE PORTFOLIO of saved compute sites
   (server only, pure, ES5)

   WHAT IT ANSWERS. "Taken together, what do these sites return?" The person
   picks saved scenarios on the Compute Site Pro Forma; each one runs
   through compute-site.model EXACTLY AS SAVED (its own load, service,
   chargers, pods, battery, deal and term; nothing is re-sized here), and
   the portfolio is the sum of their after-tax cash flows year by year, as
   if every site closed together. Its IRR is the IRR of that sum, not an
   average of the sites' IRRs; its NPV is the sum's at one discount rate;
   its MOIC is years 1–N of the sum over the equity at close.

   Two portfolios are reported: every site picked, and the ones that FIT
   the existing service (compute-site.fitsService, the sizing sweep's own
   rule). A scenario that cannot run (an interval file is never stored with
   a saved scenario; an input the model refuses) is listed with the reason,
   never silently dropped. A lease with no capital is listed with its value
   but is not an investment, so it is not in the sums.

   THE WORKBOOK is written by api/_lib/portfolio/xlsx.js (the one writer):
   Portfolio · After-tax cash flow · Metric verification (each site's IRR,
   NPV, MOIC and net return recomputed by the spreadsheet's own functions
   from the cash flow sheet) · Site inputs · Method & flags. Every total is
   a live formula, and every formula carries the value computed here, so a
   preview that never recalculates still reads right.

   Pure: no I/O, no clock (the caller passes `prepared`, YYYY-MM-DD).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var CS = require('./compute-site');
var PF = require('./proforma-engine');
var XL = require('./portfolio/xlsx');

var VERSION = 'compute-portfolio-1';
var MAX_SITES = 30;
var FIT_RULE = 'no firm compute lost to the service limit, and under 5% of the charging energy unserved (the sizing sweep\'s rule)';
var CF_SHEET = 'After-tax cash flow';
var LEVELS = { critical: 0, warn: 1, info: 2 };
/* A flag shared by several sites cannot carry one site's figures: the
   model's warnings that quote numbers are said in general here, and any
   other that differs from site to site is given as an example. */
var GENERIC = {
  SERVICE_OVERLOAD: 'Some hours need more than the service may carry, so firm GPU-hours are lost and counted as lost revenue. Fewer pods, a larger battery or a service upgrade fixes it.',
  EV_UNSERVED: 'Part of the charging energy drivers want cannot be delivered before they leave, inside what the service has left.',
  NEC_UNMANAGED: 'Every charger at full power plus the building and the compute is more than the service limit: the chargers need an EV energy management system (NEC 625.42).',
  SPOT_CURTAILED: 'Some on-demand GPU-hours are curtailed to hold the peak where that earns more.',
  PLANNING_RATE: 'The electricity is priced on the market\'s planning rate: the utility\'s own tariff (a URDB record) replaces it.'
};

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 160) : ''; }
function r2(n) { return Math.round(n * 100) / 100; }
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function pctText(f, d) { return f == null ? 'n/a' : (f * 100).toFixed(d == null ? 1 : d) + '%'; }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] || 0; return s; }

/* ── ONE SITE ────────────────────────────────────────────────────────────── */
function skip(item, i, reason) {
  return { skip: { id: str(item && item.id, 40), name: str(item && item.name, 120) || ('Scenario ' + (i + 1)), reason: reason } };
}

function runSite(item, i) {
  if (!isObj(item) || !isObj(item.input)) return skip(item, i, 'The saved scenario has no inputs.');
  var input = item.input, L = isObj(input.load) ? input.load : {};
  if (L.type === 'interval' && typeof L.text !== 'string' && !Array.isArray(L.values)) {
    return skip(item, i, 'It was saved with an interval file, and the file is never stored with a scenario: open it, attach the file and save it again.');
  }
  var out;
  try { out = CS.model(input); } catch (e) { return skip(item, i, 'The model could not run this scenario.'); }
  if (!out || out.ok === false) {
    var e0 = out && out.errors && out.errors[0];
    return skip(item, i, 'The model refused its inputs' + (e0 && e0.message ? ': ' + e0.message : '.'));
  }
  var c = CS.read(input).cfg, pf = out.proforma, m = pf ? pf.metrics : null;
  var name = str(item.name, 120) || c.site.name;
  var flows = null, pre = null;
  if (pf) {
    flows = [r2(pf.year0.afterTaxCash)].concat(pf.rows.map(function (r) { return r2(r.afterTaxCash); }));
    pre = [r2(pf.year0.afterTaxCash)].concat(pf.rows.map(function (r) { return r2(r.preTaxCash); }));
  }
  var gpus = out.compute.gpus || 0, byTier = out.compute.gpusByTier;
  return { site: {
    id: str(item.id, 40), name: name, saved: /^\d{4}-\d{2}-\d{2}/.test(str(item.at, 40)) ? str(item.at, 10) : '',
    host: c.site.host, street: c.site.street, city: c.site.city, state: out.site.state || '', zip: out.site.zip,
    utility: c.site.utility, market: out.site.market, marketName: out.site.marketName, hostType: out.site.hostTypeLabel,
    annualKwh: out.load.annualKwh, peakKw: out.load.peakKw,
    loadFactor: out.load.peakKw > 0 ? out.load.annualKwh / (out.load.peakKw * 8760) : null,
    loadSource: out.load.source, loadLabel: out.load.label, loadQuality: out.load.quality, loadNotes: out.load.notes || [],
    tariff: out.tariff.label, tariffSource: out.tariff.source,
    serviceA: out.service.amps, volts: out.service.volts, phases: out.service.phases, serviceKw: out.service.kw,
    loadingPct: out.service.loadingPct, upgradeKw: out.service.upgradeKw || 0, limitKw: out.service.limitKw,
    peakWithKw: out.balance.peakKw, headroomKw: out.balance.headroomKw, overloadHours: out.balance.overloadHours,
    fits: out.balance.fits === true, act: out.verdict.act, verdict: out.verdict.label,
    gpu: out.compute.gpuName, pods: out.compute.pods, gpus: gpus, gpusPerPod: c.compute.gpusPerPod,
    shares: { offtake: c.compute.tiers.offtake.sharePct, edge: c.compute.tiers.edge.sharePct, spot: c.compute.tiers.spot.sharePct },
    prices: out.compute.prices, gpusByTier: byTier,
    evPorts: out.ev.ports, evKwPerPort: out.ev.kwPerPort, evManaged: out.ev.managed, unservedPct: out.ev.unservedPct,
    batteryKw: out.battery.kw || 0, batteryKwh: out.battery.kwh || 0, solarKwdc: out.solar ? out.solar.kwdc : 0,
    structure: out.structure.key, structureLabel: out.structure.label, structureShort: CS.STRUCTURE_SHORT[out.structure.key] || out.structure.label,
    infraSharePct: c.deal.infraSharePct,
    years: c.finance.years, discountPct: pf ? pf.inputs.discountPct : c.finance.discountPct, debt: pf ? pf.sourcesUses.debt || 0 : 0,
    bocMonth: c.site.bocMonth, pisMonth: c.site.pisMonth,
    invested: !!pf,
    capital: pf ? pf.capex.total : 0, equity: pf ? pf.sourcesUses.equity : 0,
    irr: m ? m.afterTaxIrr : null, preTaxIrr: m ? m.preTaxIrr : null, build: m ? m.irrBuild : null,
    npv: m ? m.npv : null, moic: m ? m.moic : null, payback: m ? m.paybackYears : null,
    netReturn: m ? m.totalReturns : null, year1Revenue: pf ? pf.rows[0].revenue : null,
    leaseNpv: !pf && out.lease ? out.lease.npv : null, leaseNoi1: !pf && out.lease ? out.lease.year1 : null,
    warnings: pf ? (pf.warnings || []) : [],
    flows: flows, preFlows: pre
  } };
}

/* ── THE PORTFOLIO ───────────────────────────────────────────────────────── */
/* The rate the most invested sites use (ties go to the first picked). */
function commonRate(sites) {
  var count = {}, best = null, n = 0;
  sites.forEach(function (s) {
    if (!s.invested) return;
    var k = String(s.discountPct);
    count[k] = (count[k] || 0) + 1;
    if (best === null || count[k] > count[best]) best = k;
    n++;
  });
  return { pct: best === null ? 10 : Number(best), mixed: Object.keys(count).length > 1, sites: n };
}

function combine(sites, rate, want) {
  var pick = sites.filter(function (s) { return s.invested && want(s); }), N = 0, t;
  pick.forEach(function (s) { N = Math.max(N, s.flows.length - 1); });
  var flows = [], pre = [];
  for (t = 0; t <= N; t++) { flows.push(0); pre.push(0); }
  pick.forEach(function (s) {
    for (var k = 0; k < s.flows.length; k++) { flows[k] += s.flows[k]; pre[k] += s.preFlows[k]; }
  });
  flows = flows.map(r2); pre = pre.map(r2);
  var equity = sum(pick.map(function (s) { return s.equity; }));
  var later = 0; for (t = 1; t < flows.length; t++) later += flows[t];
  var tot = function (k) { return sum(pick.map(function (s) { return s[k]; })); };
  return {
    sites: pick.length, fit: pick.filter(function (s) { return s.fits; }).length, years: N,
    flows: pick.length ? flows : [], irr: pick.length ? PF.irr(flows) : null, preTaxIrr: pick.length ? PF.irr(pre) : null,
    npv: pick.length ? PF.npv(flows, rate / 100) : null, moic: equity > 0 ? later / equity : null,
    payback: pick.length ? PF.payback(flows) : null, netReturn: pick.length ? sum(flows) : null,
    capital: tot('capital'), equity: equity, debt: tot('debt'), year1Revenue: tot('year1Revenue'),
    pods: tot('pods'), gpus: tot('gpus'), evPorts: tot('evPorts'), batteryKw: tot('batteryKw'), batteryKwh: tot('batteryKwh'),
    annualKwh: tot('annualKwh')
  };
}

/* What needs a look, grouped by what it is: the model's own warnings, the
   load builder's notes, and two names picked twice. */
function flagsOf(sites) {
  var by = {}, order = [];
  function add(code, level, text, name) {
    var f = by[code];
    if (!f) { f = by[code] = { code: code, level: level, text: text, first: name, same: true, sites: [] }; order.push(f); }
    if (LEVELS[level] < LEVELS[f.level]) f.level = level;
    if (text !== f.text) f.same = false;
    if (f.sites.indexOf(name) < 0) f.sites.push(name);
  }
  sites.forEach(function (s) {
    s.warnings.forEach(function (w) { if (w && w.code) add(w.code, LEVELS[w.level] == null ? 'info' : w.level, w.text, s.label); });
    if (!s.fits) add('NO_FIT', 'critical', 'The build as saved does not fit the existing service: it loses firm compute to the service limit or leaves 5% or more ' +
      'of the charging energy unserved. Read its row as this build, not the site\'s best case; Step 5\'s Find the best size looks for one that fits.', s.label);
    s.loadNotes.forEach(function (n) {
      if (/load factor above 1\.0/.test(n)) {
        add('BILLS_OVERFULL', 'warn', 'Some bills carry more kWh than their billed peak could draw running flat out over the month (a load factor above 1.0): ' +
          'the kWh may be double-billed, the demand line may understate the peak, or the billing period may run longer than the month. The model shapes ' +
          'those months to the kWh, so the site\'s modelled peak, and with it the room on the service, rests on the kWh; check the bills.', s.label);
      }
      else if (/no bill and were filled/.test(n)) add('BILLS_MISSING', 'info', 'Some calendar months had no bill and were filled from the climate curve.', s.label);
    });
  });
  sites.forEach(function (s) {
    if (s.repeats > 1) add('DUPLICATE_NAME', 'warn', 'More than one picked scenario has this name, so each is marked with the day it was saved; check that each belongs in the portfolio.', s.label);
  });
  return order.sort(function (a, b) { return LEVELS[a.level] - LEVELS[b.level] || b.sites.length - a.sites.length; })
    .map(function (f) {
      var text = f.sites.length > 1 && !f.same ? (GENERIC[f.code] || 'For example, ' + f.first + ': ' + f.text) : f.text;
      return { code: f.code, level: f.level, text: text, sites: f.sites, count: f.sites.length };
    });
}

/* A scenario saved twice under one name reads as two different rows: each
   keeps its name and gains the day it was saved (and a number when even
   that is the same). */
function labelSites(sites) {
  var byName = {};
  sites.forEach(function (s) { var k = s.name.toLowerCase(); (byName[k] = byName[k] || []).push(s); });
  Object.keys(byName).forEach(function (k) {
    var same = byName[k], used = {};
    same.forEach(function (s, i) {
      var l = same.length < 2 ? s.name : s.name + ' (saved ' + (s.saved || 'undated') + ')';
      if (used[l]) l += ' #' + (i + 1);
      used[l] = true; s.label = l; s.repeats = same.length;
    });
  });
}

function rank(a, b) {
  var x = a.irr == null ? -Infinity : a.irr, y = b.irr == null ? -Infinity : b.irr;
  if (a.invested !== b.invested) return a.invested ? -1 : 1;
  return y - x || a.name.localeCompare(b.name);
}

/* list: [{ id, name, at, input }] — the saved scenarios picked, as saved.
   opts: { prepared: 'YYYY-MM-DD', brand: { name, platformName } }. */
function run(list, opts) {
  opts = opts || {};
  if (!Array.isArray(list) || !list.length) return { ok: false, errors: [{ field: 'sites', message: 'Pick at least one saved scenario.' }] };
  if (list.length > MAX_SITES) return { ok: false, errors: [{ field: 'sites', message: 'A portfolio holds at most ' + MAX_SITES + ' saved scenarios.' }] };
  var sites = [], skipped = [], seen = {};
  list.forEach(function (item, i) {
    var id = isObj(item) ? str(item.id, 40) : '';
    if (id && seen[id]) { skipped.push(skip(item, i, 'It was picked twice; it is counted once.').skip); return; }
    if (id) seen[id] = true;
    var r = runSite(item, i);
    if (r.skip) skipped.push(r.skip); else sites.push(r.site);
  });
  labelSites(sites);
  sites.sort(rank);
  var rate = commonRate(sites);
  var all = combine(sites, rate.pct, function () { return true; });
  var fits = combine(sites, rate.pct, function (s) { return s.fits; });
  var res = {
    ok: true, version: VERSION, engines: { site: CS.VERSION, finance: PF.VERSION },
    prepared: /^\d{4}-\d{2}-\d{2}$/.test(opts.prepared || '') ? opts.prepared : '',
    picked: list.length, ran: sites.length, discountPct: rate.pct, mixedRates: rate.mixed, fitRule: FIT_RULE,
    sites: sites, skipped: skipped, portfolio: { all: all, fits: fits }, flags: flagsOf(sites)
  };
  res.workbook = { name: fileName(res), bytes: sites.length ? workbookOf(res, opts) : null };
  return res;
}

/* What the page is sent: the rows without their cash flows, the workbook
   as base64. */
function forPage(res) {
  if (!res || !res.ok) return res;
  var strip = function (s) {
    var o = {}; for (var k in s) if (k !== 'flows' && k !== 'preFlows' && k !== 'warnings' && k !== 'loadNotes') o[k] = s[k];
    o.warnings = s.warnings.map(function (w) { return w.code; });
    return o;
  };
  return {
    ok: true, version: res.version, engines: res.engines, prepared: res.prepared, picked: res.picked, ran: res.ran,
    discountPct: res.discountPct, mixedRates: res.mixedRates, fitRule: res.fitRule,
    sites: res.sites.map(strip), skipped: res.skipped, portfolio: res.portfolio, flags: res.flags,
    workbook: res.workbook.bytes ? { name: res.workbook.name, base64: res.workbook.bytes.toString('base64'), bytes: res.workbook.bytes.length } : null
  };
}

function fileName(res) {
  return 'Compute-portfolio-' + plural(res.ran, 'site').replace(' ', '-') + (res.prepared ? '-' + res.prepared : '') + '.xlsx';
}

/* ── THE WORKBOOK ────────────────────────────────────────────────────────── */
function V(v, s) { return { v: v, s: s }; }
function Fm(f, v, s) { return { f: f, v: v == null ? 'n/a' : v, s: s }; }
function yn(b) { return b ? 'Yes' : 'No'; }
function col(i) { return XL.colName(i); }
function batteryText(kw, kwh) { return kwh > 0 ? fmt(kw) + '/' + fmt(kwh) : ''; }

function workbookOf(res, opts) {
  var brand = isObj(opts.brand) ? opts.brand : {};
  var who = str(brand.name, 120), platform = str(brand.platformName, 80) || 'ClearSky-OMEGA';
  var sites = res.sites, inv = sites.filter(function (s) { return s.invested; });
  var A = res.portfolio.all, FT = res.portfolio.fits, rate = res.discountPct / 100;
  var N = A.years, CF = XL.sheetRef(CF_SHEET);

  /* After-tax cash flow: the sites with capital, the two sums, cumulative. */
  var cfHead = 4, cf0 = 5, cfLast = cf0 + inv.length - 1, yr0 = 2, yrN = yr0 + N, totC = yrN + 1;
  var cfAll = cfLast + 2, cfFit = cfLast + 3, cumAll = cfLast + 4, cumFit = cfLast + 5;
  function yrRange(r) { return CF + '!' + col(yr0) + r + ':' + col(yrN) + r; }
  function laterRange(r) { return CF + '!' + col(yr0 + 1) + r + ':' + col(yrN) + r; }
  var cfRows = [
    [V('After-tax cash flow to the investor, Year 0 to ' + N + ' (nominal $), as the model reports it', 'title')],
    [V('Year 0 is the equity at close. Every site starts on its own Year 0, as if all closed together, and keeps its own term. ' +
       'The sums are live formulas; the fit column drives the second one.', 'note')],
    [],
    [V('Site', 'head'), V('Fits', 'head')]
  ];
  for (var t = 0; t <= N; t++) cfRows[3].push(V('Year ' + t, 'headR'));
  cfRows[3].push(V('Total', 'headR'));
  inv.forEach(function (s, i) {
    var r = cf0 + i, row = [V(s.label, 'text'), V(yn(s.fits), 'text')];
    for (var k = 0; k <= N; k++) row.push(k < s.flows.length ? V(s.flows[k], 'money') : null);
    row.push(Fm('SUM(' + col(yr0) + r + ':' + col(yrN) + r + ')', sum(s.flows), 'money'));
    cfRows.push(row);
  });
  if (!inv.length) cfRows.push([V('No site in this selection has capital invested, so there is no investor cash flow.', 'muted')]);
  else {
    cfRows.push([]);
    var rowAll = [V('Portfolio: all ' + plural(A.sites, 'site'), 'textT'), V('', 'textT')];
    var rowFit = [V('Portfolio: the ' + FT.sites + ' that fit', 'textT'), V('', 'textT')];
    var rowCa = [V('Cumulative: all')], rowCf = [V('Cumulative: the ' + FT.sites + ' that fit')];
    rowCa[1] = null; rowCf[1] = null;
    var ca = 0, cfit = 0;
    for (var y = 0; y <= N; y++) {
      var L = col(yr0 + y), fa = A.flows[y] || 0, ff = FT.flows.length ? (FT.flows[y] || 0) : 0;
      ca += fa; cfit += ff;
      rowAll.push(Fm('SUM(' + L + cf0 + ':' + L + cfLast + ')', fa, 'moneyT'));
      rowFit.push(Fm('SUMIF($B$' + cf0 + ':$B$' + cfLast + ',"Yes",' + L + cf0 + ':' + L + cfLast + ')', ff, 'moneyT'));
      rowCa.push(Fm(y === 0 ? L + cfAll : col(yr0 + y - 1) + cumAll + '+' + L + cfAll, r2(ca), 'money'));
      rowCf.push(Fm(y === 0 ? L + cfFit : col(yr0 + y - 1) + cumFit + '+' + L + cfFit, r2(cfit), 'money'));
    }
    rowAll.push(Fm('SUM(' + col(yr0) + cfAll + ':' + col(yrN) + cfAll + ')', A.netReturn, 'moneyT'));
    rowFit.push(Fm('SUM(' + col(yr0) + cfFit + ':' + col(yrN) + cfFit + ')', FT.netReturn == null ? 0 : FT.netReturn, 'moneyT'));
    cfRows.push(rowAll, rowFit, rowCa, rowCf);
  }
  var cfCols = [30, 6]; for (var w = 0; w <= N; w++) cfCols.push(12); cfCols.push(13);

  /* Portfolio: one row per site that ran, then the two portfolios. */
  var H = ['Site', 'Host', 'City', 'ST', 'Utility', 'Market', 'Annual kWh', 'Building peak kW', 'Load factor', 'Service (A)', 'Service kW',
    'Continuous limit kW', 'Peak with project kW', 'Fits existing service', 'Screen', 'Pods', 'GPUs', 'EV ports', 'Battery kW/kWh', 'Structure',
    'Installed cost', 'Equity at close', 'After-tax IRR', 'Pre-tax IRR', 'NPV @ ' + fmtRate(res.discountPct) + (res.mixedRates ? ' (portfolio)' : ''),
    'Net investor return', 'MOIC', 'Payback (yrs)', 'Year-1 revenue'];
  var RIGHT = { 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 15: 1, 16: 1, 17: 1, 18: 1, 20: 1, 21: 1, 22: 1, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 28: 1 };
  /* Sites with capital rank first (rank()), so the sums run over the top
     rows only and a lease with no capital is never in them. */
  var pHead = 5, p0 = 6, pLast = p0 + sites.length - 1, pInv = p0 + inv.length - 1, pAll = pLast + 2, pFit = pLast + 3;
  var fitCol = col(13);
  var pRows = [
    [V((who ? who + ' · ' : '') + 'Compute Site Pro Forma: portfolio of ' + plural(sites.length, 'site'), 'title')],
    [V('Each site exactly as saved (its own load, service, chargers, pods, battery, deal and term), a year of hourly dispatch on its ' +
       'service and the BESS Pro Forma\'s finance engine. The portfolio rows sum the sites\' after-tax cash flows year by year, as if ' +
       'every site closed together: their IRR is the IRR of that sum, not an average. ' + (N ? 'Up to ' + plural(N, 'year') + ' of cash flow; ' : '') +
       'NPV at ' + fmtRate(res.discountPct) + (res.mixedRates ? ' (the rate most sites use)' : '') + '.', 'note')],
    [V('Prepared ' + (res.prepared || '') + (who ? ' by ' + who : '') + ' with ' + platform + ' · ' + plural(res.picked, 'scenario') + ' picked, ' +
       res.ran + ' ran' + (res.skipped.length ? ', ' + res.skipped.length + ' could not (see Method & flags)' : '') + ' · ' +
       A.fit + ' of ' + A.sites + ' with capital fit the existing service.', 'muted')],
    [],
    H.map(function (h, i) { return V(h, i === 13 || i === 14 ? 'headC' : RIGHT[i] ? 'headR' : 'head'); })
  ];
  sites.forEach(function (s) {
    var row = [V(s.label), V(s.host), V(s.city), V(s.state), V(s.utility), V(s.market),
      V(s.annualKwh, 'int'), V(s.peakKw, 'dec1'), V(s.loadFactor, 'dec2'), V(s.serviceA, 'int'), V(s.serviceKw, 'int'),
      V(s.limitKw, 'int'), V(s.peakWithKw, 'int'), V(yn(s.fits), 'center'), V(s.act, 'center'), V(s.pods, 'int'), V(s.gpus, 'int'), V(s.evPorts, 'int'),
      V(batteryText(s.batteryKw, s.batteryKwh), 'textR'), V(s.invested ? s.structureShort : s.structureShort + ', no capital')];
    if (s.invested) {
      row.push(V(s.capital, 'money'), V(s.equity, 'money'), V(s.irr == null ? 'n/a' : s.irr, 'pct'), V(s.preTaxIrr == null ? 'n/a' : s.preTaxIrr, 'pct'),
        V(s.npv, 'money'), V(s.netReturn, 'money'), V(s.moic, 'moic'), V(s.payback == null ? 'never' : s.payback, 'yrs'), V(s.year1Revenue, 'money'));
    }
    pRows.push(row);
  });
  if (sites.length) {
    pRows.push([]);
    var sumCol = function (i, fitOnly, v) {
      if (!inv.length) return V(0, i === 6 || i >= 15 && i <= 17 ? 'intT' : 'moneyT');
      var L = col(i), rng = L + p0 + ':' + L + pInv;
      return Fm(fitOnly ? 'SUMIF($' + fitCol + '$' + p0 + ':$' + fitCol + '$' + pInv + ',"Yes",' + rng + ')' : 'SUM(' + rng + ')', v, i === 6 || i >= 15 && i <= 17 ? 'intT' : 'moneyT');
    };
    [[A, false, pAll, cfAll, 'Portfolio: all ' + plural(A.sites, 'site') + ' with capital'], [FT, true, pFit, cfFit, 'Portfolio: the ' + FT.sites + ' that fit']].forEach(function (d) {
      var P = d[0], fitOnly = d[1], cfr = d[3], blank = V('', 'textT');
      var row = [V(d[4], 'textT'), blank, blank, blank, blank, blank, sumCol(6, fitOnly, P.annualKwh), blank, blank, blank, blank, blank, blank,
        V(fitOnly ? '' : P.fit + ' of ' + P.sites, 'centerT'), blank, sumCol(15, fitOnly, P.pods), sumCol(16, fitOnly, P.gpus), sumCol(17, fitOnly, P.evPorts),
        V(batteryText(P.batteryKw, P.batteryKwh), 'textRT'), blank,
        sumCol(20, fitOnly, P.capital), sumCol(21, fitOnly, P.equity)];
      if (inv.length) {
        row.push(Fm('IFERROR(IRR(' + yrRange(cfr) + '),"n/a")', P.irr, 'pctT'), V(P.preTaxIrr == null ? 'n/a' : P.preTaxIrr, 'pctT'),
          Fm('IFERROR(NPV(' + rate + ',' + laterRange(cfr) + ')+' + CF + '!' + col(yr0) + cfr + ',"n/a")', P.sites ? P.npv : 0, 'moneyT'),
          Fm(CF + '!' + col(totC) + cfr, P.netReturn == null ? 0 : P.netReturn, 'moneyT'),
          Fm('IFERROR(SUM(' + laterRange(cfr) + ')/-' + CF + '!' + col(yr0) + cfr + ',"n/a")', P.moic, 'moicT'),
          V(P.payback == null ? (P.sites ? 'never' : 'n/a') : P.payback, 'yrsT'), sumCol(28, fitOnly, P.year1Revenue));
      }
      pRows.push(row);
    });
  }
  var pCols = [30, 22, 14, 5, 24, 8, 12, 10, 8, 9, 9, 11, 11, 10, 10, 6, 7, 7, 12, 22, 13, 13, 10, 10, 13, 13, 7, 9, 12];

  /* Metric verification: the spreadsheet's own IRR, NPV and SUM. */
  var mv0 = 5, mvLast = mv0 + inv.length - 1;
  var mvRows = [
    [V('Every headline figure recomputed by the spreadsheet from each site\'s after-tax cash flow', 'title')],
    [V('The recomputed columns are live formulas on the ' + CF_SHEET + ' sheet (IRR, NPV and SUM), and each difference is the model\'s figure less ' +
       'the spreadsheet\'s. The IRR build is the model\'s: cash only, then depreciation, then the credit, each rounded to a tenth of a point so ' +
       'the steps add up to the IRR as printed.', 'note')],
    [],
    ['Site', 'IRR (model)', 'IRR (spreadsheet)', 'Δ IRR (bp)', 'NPV (model)', 'NPV (spreadsheet)', 'Δ NPV', 'MOIC (model)', 'MOIC (spreadsheet)',
     'Δ MOIC', 'Net return (model)', 'Σ cash flows', 'Δ net return', 'Cash-only IRR', 'Depreciation', 'ITC', 'IRR build', 'Δ build'].map(function (h, i) {
      return V(h, i ? 'headR' : 'head');
    })
  ];
  /* The spreadsheet's side is what IT computes from the cash flow as written
     (to the cent), so the cached values are worked the same way here and
     each difference is the model's figure less that. */
  var worst = { D: 0, G: 0, J: 0, M: 0, R: 0 };
  function gap(k, d) { if (d != null && Math.abs(d) > worst[k]) worst[k] = Math.abs(d); return d; }
  inv.forEach(function (s, i) {
    var r = mv0 + i, cr = cf0 + i, b = s.build || {};
    var bt = function (x) { return x == null ? 'n/a' : Math.round(x * 10) / 1000; };
    var buildSum = b.cashOnly == null || b.depreciation == null || b.itc == null ? null : Math.round((b.cashOnly + b.depreciation + b.itc) * 10) / 1000;
    var xIrr = PF.irr(s.flows), xNpv = PF.npv(s.flows, s.discountPct / 100), xSum = sum(s.flows);
    var xMoic = s.equity > 0 ? (xSum - s.flows[0]) / -s.flows[0] : null;
    mvRows.push([V(s.label),
      V(s.irr == null ? 'n/a' : s.irr, 'pct'), Fm('IFERROR(IRR(' + yrRange(cr) + '),"n/a")', xIrr, 'pct'),
      Fm('IFERROR((B' + r + '-C' + r + ')*10000,"n/a")', s.irr == null || xIrr == null ? null : gap('D', (s.irr - xIrr) * 10000), 'yrs'),
      V(s.npv, 'money'), Fm('NPV(' + s.discountPct / 100 + ',' + laterRange(cr) + ')+' + CF + '!' + col(yr0) + cr, xNpv, 'money'), Fm('E' + r + '-F' + r, gap('G', s.npv - xNpv), 'cents'),
      V(s.moic, 'moic'), Fm('IFERROR(SUM(' + laterRange(cr) + ')/-' + CF + '!' + col(yr0) + cr + ',"n/a")', xMoic, 'moic'),
      Fm('IFERROR(H' + r + '-I' + r + ',"n/a")', s.moic == null || xMoic == null ? null : gap('J', s.moic - xMoic), 'dec2'),
      V(s.netReturn, 'money'), Fm('SUM(' + yrRange(cr) + ')', xSum, 'money'), Fm('K' + r + '-L' + r, gap('M', s.netReturn - xSum), 'cents'),
      V(bt(b.cashOnly), 'pct1'), V(bt(b.depreciation), 'pct1'), V(bt(b.itc), 'pct1'),
      Fm('IFERROR(N' + r + '+O' + r + '+P' + r + ',"n/a")', buildSum, 'pct1'),
      Fm('IFERROR(Q' + r + '-ROUND(B' + r + ',3),"n/a")', buildSum == null || s.irr == null ? null : gap('R', buildSum - Math.round(s.irr * 1000) / 1000), 'pct1')]);
  });
  if (inv.length) {
    var maxAbs = function (L) { return Fm('MAX(MAX(' + L + mv0 + ':' + L + mvLast + '),-MIN(' + L + mv0 + ':' + L + mvLast + '))', worst[L], L === 'D' ? 'yrsT' : L === 'J' ? 'dec2T' : L === 'R' ? 'pct1T' : 'centsT'); };
    var blankT = V('', 'textT');
    mvRows.push([], [V('Largest difference, either way', 'textT'), blankT, blankT, maxAbs('D'), blankT, blankT, maxAbs('G'), blankT, blankT, maxAbs('J'),
      blankT, blankT, maxAbs('M'), blankT, blankT, blankT, blankT, maxAbs('R')]);
  } else mvRows.push([V('No site in this selection has capital invested.', 'muted')]);

  /* Site inputs: what each row ran on. */
  var inHead = ['Site', 'Saved', 'Host type', 'Street', 'City', 'ST', 'ZIP', 'Utility', 'Market', 'Building load', 'Load quality', 'Tariff',
    'Service (A)', 'Volts', 'Phases', 'Service kW', 'Continuous loading', 'Upgrade kW', 'GPU', 'Pods', 'GPUs per pod',
    'Offtake share', 'Edge share', 'On-demand share', 'Offtake $/GPU-hr', 'Edge $/GPU-hr', 'On-demand $/GPU-hr',
    'EV ports', 'kW per port', 'Charging', 'Battery kW', 'Battery kWh', 'Solar kW-dc', 'Structure', 'Infrastructure share',
    'Term (years)', 'Discount rate', 'Debt', 'Construction begins', 'In service', 'Model warnings'];
  var inRows = [[V('What each site ran on: the saved scenario\'s own inputs, after the model\'s defaults', 'title')], [],
    inHead.map(function (h) { return V(h, 'head'); })];
  sites.forEach(function (s) {
    inRows.push([V(s.label), V(s.saved), V(s.hostType), V(s.street), V(s.city), V(s.state), V(s.zip), V(s.utility), V(s.marketName || s.market),
      V(s.loadLabel), V(s.loadQuality), V(s.tariff), V(s.serviceA, 'int'), V(s.volts, 'int'), V(s.phases, 'int'), V(s.serviceKw, 'dec1'),
      V(s.loadingPct / 100, 'pct1'), V(s.upgradeKw, 'int'), V(s.gpu), V(s.pods, 'int'), V(s.gpusPerPod, 'int'),
      V(s.shares.offtake / 100, 'pct1'), V(s.shares.edge / 100, 'pct1'), V(s.shares.spot / 100, 'pct1'),
      V(s.prices.offtake, 'dec2'), V(s.prices.edge, 'dec2'), V(s.prices.spot, 'dec2'),
      V(s.evPorts, 'int'), V(s.evKwPerPort, 'dec1'), V(s.evPorts ? (s.evManaged ? 'Managed' : 'Unmanaged') : ''),
      V(s.batteryKw, 'int'), V(s.batteryKwh, 'int'), V(s.solarKwdc, 'int'), V(s.structureShort),
      V(s.structure === 'infra' ? s.infraSharePct / 100 : '', 'pct1'), V(s.years, 'int'), V(s.discountPct / 100, 'pct1'),
      V(s.debt > 0 ? 'Yes' : 'No'), V(s.bocMonth), V(s.pisMonth), V(s.warnings.map(function (w) { return w.code; }).join(', '))]);
  });

  /* Method & flags. */
  var mRows = [[V('Method, data-quality flags and what was not run', 'title')], []];
  function sec(t) { mRows.push([V(t, 'section')]); }
  function kv(k, v) { mRows.push([V(k, 'label'), V(v, 'wrap')]); }
  sec('SOURCE');
  kv('Scenarios', plural(res.picked, 'saved scenario') + ' picked on the Compute Site Pro Forma; ' + res.ran + ' ran through the model as saved' +
    (res.skipped.length ? ' and ' + res.skipped.length + ' could not (listed below).' : '.'));
  kv('Prepared', (res.prepared || 'Today') + (who ? ' by ' + who : '') + ' with ' + platform + ' (site model ' + res.engines.site + ', finance engine ' + res.engines.finance + ').');
  mRows.push([]);
  sec('WHAT EACH SITE IS');
  kv('The model', 'Each scenario exactly as saved: its own building load, service, chargers, pods, battery, deal and term, simulated for 8,760 hours on one ' +
    'service limit and carried through the BESS Pro Forma\'s finance engine (NREL SAM\'s single-owner cash flow). Nothing is re-sized here: to size a ' +
    'site, open it, use Step 5\'s Find the best size and save it again.');
  kv('Fits existing service', 'Yes when ' + FIT_RULE + '.');
  kv('Screen', 'ADVANCE, VERIFY or HOLD: the load screen\'s verdict on the service as built (Step 5).');
  kv('Load factor', 'The building\'s annual kWh over its peak kW × 8,760 hours, from the hourly load the model built.');
  mRows.push([]);
  sec('THE PORTFOLIO');
  kv('The sum', 'The sites\' after-tax cash flows added year by year, every site on its own Year 0 as if all closed together, each keeping its own term.');
  kv('IRR', 'The IRR of that sum, not an average of the sites\' IRRs: a large site weighs more than a small one.');
  kv('NPV', 'The sum at ' + fmtRate(res.discountPct) + (res.mixedRates ? ', the rate most of the sites use; each site\'s own NPV is at its own rate (Site inputs).' : ', the rate the sites use.'));
  kv('MOIC and payback', 'MOIC is years 1 to ' + N + ' of the sum over the equity at close; payback is when the sum\'s cumulative cash turns positive for good, interpolated within the year.');
  kv('Two portfolios', 'Every site with capital, and only the sites that fit the existing service.');
  var leases = sites.filter(function (s) { return !s.invested; });
  if (leases.length) {
    kv('Leases', 'A lease with no capital is not an investment, so it is listed and not summed: ' + leases.map(function (s) {
      return s.label + (s.leaseNpv != null ? ' (rent worth ' + money(s.leaseNpv) + ' today)' : '');
    }).join('; ') + '.');
  }
  if (res.skipped.length) {
    mRows.push([]);
    sec('NOT RUN');
    res.skipped.forEach(function (k) { kv(k.name, k.reason); });
  }
  if (res.flags.length) {
    mRows.push([]);
    sec('DATA-QUALITY FLAGS');
    res.flags.forEach(function (f) {
      kv(f.code + ' (' + f.level + ')', f.text + ' ' + plural(f.count, 'site') + ': ' + f.sites.join('; ') + '.');
    });
  }
  mRows.push([]);
  sec('VERIFICATION');
  kv('What to check', 'The Metric verification sheet recomputes each site\'s IRR, NPV, MOIC and net return with the spreadsheet\'s own functions from the ' +
    CF_SHEET + ' sheet. Every total in this workbook is a live formula.');
  mRows.push([]);
  kv('Disclaimer', 'A screening model: one year of hourly load on each existing service and the investor case built on it. It is not a compute operator\'s ' +
    'offer, a utility load study or a tax opinion; planning figures are marked in the model.');

  var inCols = [30, 11, 18, 24, 14, 5, 7, 24, 16, 30, 9, 30, 9, 7, 7, 9, 10, 9, 18, 6, 8, 9, 9, 10, 10, 10, 11, 8, 8, 11, 9, 9, 9, 22, 11, 8, 9, 6, 11, 10, 40];
  return XL.workbook({
    props: { title: 'Compute Site Pro Forma: portfolio of ' + plural(sites.length, 'site'), creator: who || platform,
             created: res.prepared ? res.prepared + 'T12:00:00Z' : '' },
    sheets: [
      { name: 'Portfolio', rows: pRows, cols: pCols, freeze: 'B6', filter: 'A5:' + col(H.length - 1) + Math.max(pHead + 1, pLast), merges: ['A2:' + col(19) + '2', 'A3:' + col(19) + '3'],
        heights: { 2: 48, 3: 30, 5: 46 }, landscape: true },
      { name: CF_SHEET, rows: cfRows, cols: cfCols, freeze: 'C5', merges: ['A2:' + col(Math.max(9, totC)) + '2'], heights: { 2: 32 }, landscape: true },
      { name: 'Metric verification', rows: mvRows, cols: [30, 10, 13, 9, 13, 14, 9, 9, 12, 8, 13, 13, 11, 11, 13, 8, 10, 9], freeze: 'B5',
        merges: ['A2:R2'], heights: { 2: 48, 4: 32 }, landscape: true },
      { name: 'Site inputs', rows: inRows, cols: inCols, freeze: 'B4', filter: 'A3:' + col(inHead.length - 1) + Math.max(4, 3 + sites.length), heights: { 3: 32 }, landscape: true },
      { name: 'Method & flags', rows: mRows, cols: [30, 110], gridlines: false, landscape: true }
    ]
  });
}
function fmtRate(p) { return (Math.round(p * 100) / 100) + '%'; }
function money(n) { return (n < 0 ? '-$' : '$') + fmt(Math.abs(n)); }

module.exports = { VERSION: VERSION, MAX_SITES: MAX_SITES, FIT_RULE: FIT_RULE, run: run, forPage: forPage,
                   _internal: { runSite: runSite, combine: combine, flagsOf: flagsOf, commonRate: commonRate, workbookOf: workbookOf } };
