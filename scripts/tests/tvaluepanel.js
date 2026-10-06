/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The editor's Value Stack panel (editor.html, OMEGA PATCH 41), cut from
   the page and run against stubs: the site comes OFF THE MAP automatically,
   the drawn battery and the run's own cost travel in the request, the
   answer is the server's, and the printable report carries the charts and
   the sources. The rate book must NOT be in this module — moving it to
   /api/value-stack was the point (CLAUDE.md, "where logic lives"; MERGE.md
   2026-10-06).

   Run: node scripts/tests/tvaluepanel.js                                  */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var page = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');

var fails = 0;
function ok(cond, msg, got) {
  if (cond) console.log('  ok   ' + msg);
  else { fails++; console.log('  FAIL ' + msg + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
}

/* ── cut the module ─────────────────────────────────────────────────────── */
var a = page.indexOf('OMEGA PATCH — 41 : VALUE STACK');
var b = page.indexOf('OMEGA PATCH — 42');
ok(a > 0 && b > a, 'Patch 41 is on the page, before Patch 42');
var slice = page.slice(a, b);
var start = slice.indexOf('(function () {');
var end = slice.lastIndexOf('})();');
var MOD = slice.slice(start, end + 5);

/* ── what ships to the browser, statically ──────────────────────────────── */
console.log('\nwhat ships in the browser');
ok(/\/api\/value-stack/.test(MOD), 'the panel posts to /api/value-stack');
ok(/addr-in/.test(MOD) && /_gmap/.test(MOD) && /getCenter/.test(MOD),
  'the site is read off the map: the address box and the map centre');
ok(/_COST_TOTAL/.test(MOD) && /_COST_IS_CONTRACTED/.test(MOD),
  'the project cost is the run\'s own total, contracted flag included');
ok(!/demandLo/.test(MOD) && !/programKwYr/.test(MOD) && !/touSpread\s*:\s*0\./.test(MOD),
  'no regional rate table remains in the browser');
ok(!/keep:\s*0\.\d/.test(MOD), 'no aggregator revenue-share table remains in the browser');
ok(!/'CAISO'|"CAISO"|CAISO:/.test(MOD), 'no market table remains in the browser');
ok(/Planning grade/i.test(MOD), 'the planning-grade warning is still worn');

/* ── run it against stubs ───────────────────────────────────────────────── */
console.log('\nthe panel against stubs');

function mkEl() {
  return { id: '', style: { cssText: '', display: '' }, innerHTML: '', value: '',
           onclick: null, title: '',
           querySelector: function () { return { onclick: null, onchange: null }; },
           appendChild: function () {}, getAttribute: function () { return ''; } };
}
var els = { 'addr-in': mkEl() };
els['addr-in'].value = '100 W Main St, Los Angeles, CA';

var fetched = [];
var RESULT = {
  version: 'value-stack-1',
  resolved: { zip: '90015', how: 'geocoded', label: 'the address, geocoded (census)', address: '100 W Main St, Los Angeles, CA', area: null },
  site: { zip: '90015', state: 'CA', market: 'CAISO', marketName: 'California ISO', segment: 'commercial' },
  load: { label: 'Typical commercial load (assumed)', quality: 'low', annualKwh: 300000, peakKw: 80 },
  solar: null,
  battery: { kw: 380, kwh: 760, usableKwh: 684, rte: 0.88, cyclesPerYear: 300, assumed: false },
  tariff: { source: 'planning', label: 'Planning commercial TOU + demand rate, CAISO', rates: { onPeak: 0.3, offPeak: 0.2, demand: 24 } },
  bill: { before: 90000, after: 62000, savings: 28000 },
  streams: [
    { id: 'bill.demand', name: 'Demand charges avoided', category: 'bill', usd: 20000, tier: 'computed', counted: true, how: 'held down hour by hour', ref: 'the tariff' },
    { id: 'bill.tou', name: 'Time-of-use energy', category: 'bill', usd: 8000, tier: 'computed', counted: true, how: 'charged cheap, discharged dear', ref: 'the tariff' },
    { id: 'ca.elrp', name: 'ELRP', category: 'grid', usd: 15000, tier: 'planning', counted: true, how: '12 events', ref: 'CPUC ELRP' }
  ],
  missing: ['Backup power — paid in avoided outage cost, not a cheque.'],
  totals: { gross: 43000, billSavings: 28000, gridEarnings: 15000, owner: 38500, platform: 3000, installer: 1500, perKw: 113 },
  split: { owner: 0.7, platform: 0.2, installer: 0.1, ref: 'DividendVPP published split' },
  monthly: (function () { var m = [], i; for (i = 0; i < 12; i++) m.push({ month: i, kwh: 25000, peakKw: 80, peakAfterKw: 60, billBefore: 7500, billAfter: 5100 }); return m; })(),
  sampleDay: { day: 200, hours: [] },
  confidence: 'low',
  cost: { capexUsd: 950000, source: 'site-map', note: 'The Site Map run’s own Total install for this drawing.' },
  incentives: { items: [{ id: 'itc', name: 'Federal investment tax credit', usd: 285000, tier: 'published', how: '30% of installed cost.', ref: 'Statutory.' }], total: 285000, flags: [] },
  netCostUsd: 665000,
  bankability: {
    rows: [
      { id: 'bill.demand', name: 'Demand charges avoided', usdYr: 20000, tier: 'computed', grade: 'host-contract',
        paidBy: 'the host customer', vehicle: 'an energy services / shared-savings agreement — without one, these are the host’s own savings, not the project’s revenue', tenor: 'the ESA term you sign; 10–15 years is customary' },
      { id: 'bill.tou', name: 'Time-of-use energy', usdYr: 8000, tier: 'computed', grade: 'host-contract',
        paidBy: 'the host customer', vehicle: 'an energy services / shared-savings agreement', tenor: 'the ESA term you sign' },
      { id: 'ca.elrp', name: 'ELRP', usdYr: 10500, grossYr: 15000, tier: 'planning', grade: 'program',
        paidBy: 'the utility, under the CPUC’s ELRP budget', vehicle: 'enrolment through an A.6 VPP aggregator', tenor: 'programme year; paid per called event',
        note: 'a planning rate — not underwriteable until the programme’s own terms replace it' }
    ],
    totals: { hostYr: 28000, programYr: 10500, totalYr: 38500, underwriteableYr: 28000, planningYr: 10500 },
    contracts: [
      'Energy services / shared-savings agreement with the host — the contract that converts demand and TOU savings into the project’s contracted revenue.',
      'Aggregator / curtailment-service-provider agreement — the route to capacity and programme revenue.',
      'Programme enrolments held in, or assignable to, the project entity.',
      'The ITC is transferable for cash under §6418.'
    ],
    lifecycle: { ok: true, years: 20, rows: [], irr: 0.021, npv: -90000, discountRate: 0.08, paybackYears: null, augmentations: 0, assumptions: [] },
    note: 'A saving is not revenue until a contract makes it one. The bankable case counts computed and published rates only.'
  },
  lifecycle: { ok: true, years: 20, capexUsd: 950000, incentiveUsd: 285000, netCostUsd: 665000,
    rows: (function () { var r = [{ year: 0, capacityPct: 1, revenue: 0, om: 0, augment: 0, net: -665000, cum: -665000 }], c = -665000, y;
      for (y = 1; y <= 20; y++) { c += 20000; r.push({ year: y, capacityPct: 0.98, revenue: 40000, om: 20000, augment: 0, net: 20000, cum: c }); } return r; })(),
    irr: 0.046, npv: -12000, discountRate: 0.08, paybackYears: 17.4, augmentations: 0, omYear1Usd: 23750,
    assumptions: ['An unlevered, pre-tax project IRR; the Pro Forma models tax, depreciation and debt.', 'NREL ATB convention.', 'Programme streams held flat.'] },
  disclaimer: 'Planning grade.'
};

var opened = [];
var box = {
  window: null, document: null, console: { info: function () {}, warn: function () {}, log: function () {}, table: function () {} },
  setInterval: function () { return 1; }, clearInterval: function () {}, setTimeout: function (f) { f(); return 1; },
  alert: function () {},
  fetch: function (url, opts) {
    fetched.push({ url: url, opts: opts });
    return Promise.resolve({ ok: true, status: 200, text: function () {
      return Promise.resolve(JSON.stringify({ ok: true, result: RESULT }));
    } });
  }
};
box.window = box;
box.document = {
  getElementById: function (id) { return els[id] || null; },
  createElement: function () { return mkEl(); },
  body: { appendChild: function (e) { if (e.id) els[e.id] = e; } },
  querySelectorAll: function () { return []; },
  title: ''
};
box.S = { shapes: [], elements: [] };   /* the app's site state: present, empty — the fleet collector answers */
box._currentUser = { getIdToken: function () { return Promise.resolve('tok'); } };
box._gmap = { getCenter: function () { return { lat: function () { return 34.04; }, lng: function () { return -118.26; } }; } };
box._ppCollectFleet = function () { return { units: 2, totalKw: 380, totalKwh: 760 }; };
box._COST_TOTAL = 950000;
box._COST_IS_CONTRACTED = false;
box._billDemandRate = 21.5;

vm.runInNewContext(MOD, box, { filename: 'editor.html#patch41' });
ok(box.OmegaValue && typeof box.OmegaValue.open === 'function' && typeof box.OmegaValue.print === 'function',
  'OmegaValue keeps its public API (open, print)');

box.OmegaValue.open();

setTimeout(function () {
  ok(fetched.length === 1, 'opening the panel with a battery runs the server once', fetched.length);
  var req = fetched.length ? JSON.parse(fetched[0].opts.body) : {};
  ok(fetched.length && fetched[0].url === '/api/value-stack' && fetched[0].opts.method === 'POST'
    && /^Bearer tok$/.test(fetched[0].opts.headers.Authorization), 'POST, with the signed-in token');
  ok(req.site && req.site.address === '100 W Main St, Los Angeles, CA',
    'the address travelled from the map’s own search box', req.site);
  ok(req.site && Math.abs(req.site.lat - 34.04) < 1e-9 && Math.abs(req.site.lng - -118.26) < 1e-9,
    'the map centre travelled beside it', req.site);
  ok(req.battery && req.battery.kw === 380 && req.battery.kwh === 760,
    'the battery is the one actually drawn', req.battery);
  ok(req.cost && req.cost.capexUsd === 950000, 'the run’s cost rode along', req.cost);
  ok(req.tariff && req.tariff.demandCharge === 21.5, 'the imported bill’s demand charge rode along', req.tariff);

  var R = box.OmegaValue.result();
  ok(R && R.totals.owner === 38500, 'the server’s answer is what the panel holds');
  var panel = els['omega-valuestack'];
  ok(panel && /IRR/.test(panel.innerHTML) && /Payback/.test(panel.innerHTML),
    'the panel shows the IRR and payback');
  ok(panel && /planning/i.test(panel.innerHTML), 'the tier of a planning figure is visible');
  ok(panel && /Bankable case/.test(panel.innerHTML) && /underwriteable/.test(panel.innerHTML),
    'the panel states the bankable case beside the all-in IRR');
  ok(panel && /paid by the host customer/i.test(panel.innerHTML),
    'each stream names who pays it');

  /* the report */
  var written = [];
  box.open = function () {
    var w = { document: { open: function () {}, write: function (h) { written.push(h); }, close: function () {} } };
    opened.push(w); return w;
  };
  box.OmegaValue.print();
  var doc = written.join('');
  ok(written.length === 1, 'Print report writes one document');
  ok(/<svg/.test(doc), 'the report carries charts');
  ok(/Value Stack Report/.test(doc) && /100 W Main St/.test(doc), 'the report names the site');
  ok(/Assumptions and sources/.test(doc) && /NREL ATB/.test(doc), 'every assumption travels with its source');
  ok(/NOT counted/i.test(doc), 'what is not counted is on the report, with reasons');
  ok(/Planning grade/i.test(doc), 'the disclaimer is printed, not implied');
  ok(/payback 17\.4/.test(doc), 'the payback year is marked on the cash-flow chart');
  ok(/Revenue quality/.test(doc) && /underwrite/.test(doc), 'the report carries the investor section');
  ok(/Paid by/.test(doc) && /the host customer/.test(doc) && /CPUC/.test(doc),
    'each stream’s counterparty is in the ladder');
  ok(/shared-savings/.test(doc) && /6418/.test(doc),
    'the paperwork list names the ESA and the ITC transfer');
  ok(/not underwriteable/.test(doc), 'a planning rate is flagged as upside, not collateral');
  ok(/Bankable IRR/.test(doc), 'the bankable-case IRR is a headline number');

  console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
  process.exit(fails ? 1 : 0);
}, 20);
