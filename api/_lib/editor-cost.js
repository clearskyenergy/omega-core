/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Site Map's cost engine: what the Run costs a drawing at, and the tables it
   costs it with. It lived in editor.html (updateCostEst and its helpers)
   with the benchmark book, the vendor price book (dealer cost beside list),
   the data-centre ROM, the generation classes, the EV estimators and the
   roll-up rules — scope gate, install ratio, contingency, range, the ITC
   basis — readable by any signed-in user of any tenant (2026-10-13; a
   customer's engineer had proposed building their own editor). The page
   now sends QUANTITIES (what is placed, what the sheet says) and renders
   the LINES this returns. Pure, ES5, no I/O; `rollup(q)` is the one door.
   Every figure here that was a literal in the page is held by
   scripts/tests/teditorcost.js against the numbers the page produced. */
'use strict';

/* ── The benchmark book (NREL/DOE SETO PV 2024; NREL storage 2025; EIA
   AEO2025 generation; an operator's pod figure, Sep 2026) ─────────── */
var BENCH = {
  pvResidential: 3.25, pvCommercial: 1.55, pvUtility: 1.15,   /* $/Wdc by sector, ground and rooftop */
  pvCanopy: 2.75,                                             /* $/Wdc, a solar canopy: the steel structure over the array */
  pvCanopySource: 'Commercial solar canopy (carport), installed: industry range $2.50-3.50/Wdc, the structure premium over a ground or rooftop array; re-quote per structure',
  bessKwh: 241, bessKw: 379,                                   /* energy + power split */
  podAllInPerKw: 30000, podAllInLoPerKw: 20000, podAllInHiPerKw: 40000,
  podSource: 'Operator figure, Sep 2026: $30M +/- $10M per populated 1 MW pod',
  genPerKw: { sofc: 6500, gen_ng: 1200, recip: 2000, recip_l: 1800, turbine: 1500, turbine_l: 1000, wind: 1900, other: 1500 },
  genSource: 'EIA AEO2025 capital cost assumptions, rounded; BoP excluded',
  source: 'NREL/DOE SETO PV benchmark (2024) . NREL utility-scale storage 2025 update'
};
var BESS_EQ_PER_KWH = 85;        /* flat container equipment rate, $/kWh nameplate */
/* The catalog's own unit prices, by catalog key (they rode on the page's
   BESS_CATALOG as `eqcost`; a tenant's product list never carries one). */
var CATALOG_PRICES = { 'GOTION-HOME-5': 558, 'GOTION-EDGE-760': 84740, 'GOTION-GRID-3421': 381486, 'GOTION-GRID-3441': 383627, 'GOTION-HOME-10': 1115, 'GOTION-HOME-15': 1673, 'GOTION-HOME-20': 2230,
  'AUTEL-ESS-256': 180000, 'PYTES-30-60': 34080, 'PYTES-60-120': 56354, 'PYTES-30-60-SE': 44307, 'PYTES-60-120-SE': 77058, 'PYTES-60-193-SEMAX': 80245,
  'CC-R60': 24000 /* the R60 on the Omega-Core skid (Tommy, 2026-10-13; #296) */ };
function catalogPrice(key) { return (key && CATALOG_PRICES.hasOwnProperty(key)) ? CATALOG_PRICES[key] : null; }
var BESS_INSTALL_RATIO = 0.55;   /* install as a share of equipment */
/* The NextNRG Microgrid Controller: the one price (api/_lib/nextnrg.js),
   per unit placed from Draw › Utility on the HOST'S drawing. A controller
   inside an Omega-Core skid is ClearSky's and is never counted here. */
var NEXTNRG = require('./nextnrg');
var MGC_EACH = NEXTNRG.CONTROLLER.priceUsd;
/* NextNRG's solar + storage SYSTEM, $6.00 per W-DC of solar installed with
   the storage beside it and the labor (api/_lib/nextnrg.js SYSTEM_RATE,
   2026-10-14): a NextNRG array (stamped as its product, or any array in
   NextNRG's own workspace, q.vendorOrg) is priced at it instead of the
   benchmark; NextNRG storage beside it is inside the price; NextNRG
   storage alone is the rate on its rated power. A vendor's installed
   price carries no contingency. */
var NN_RATE = NEXTNRG.SYSTEM_RATE;
/* The cost sheet's defaults: applied where a field is blank. */
var SHEET = {
  pad: 4800, disco: 3200, meter: 3850, bollards: 600, jbox: 850, panel: 18500, misc: 0, xfmr: 0,
  rmcMat: 11.5, rmcLabor: 35, emtMat: 8, emtLabor: 35, bmsMat: 3.5, bmsLabor: 18, ugMat: 9, ugLabor: 28,
  emsRate: 12, emsSetup: 4500, eng: 0, perm: 0, comm: 0, contPct: 10
};
/* Data-centre electrical package: Eaton EESS ROM, Flux Core microgrid,
   rev 0.0 (30 Apr 2026) — budgetary, re-quote before use. */
var DC_ROM = {
  xfmrEach: 185000, xfmrKva: 1500, switchgear: 800500, microgridCtrl: 325000,
  upsEach: 450500, upsRatedKw: 750, upsFamily: 'Eaton 9395P', eHouseLow: 3000000, eHouseHigh: 3500000,
  designPctLow: 0.05, designPctHigh: 0.06,
  source: 'Eaton EESS ROM, Flux Core microgrid, rev 0.0 (30 Apr 2026) -- budgetary, re-quote before use'
};
/* The EV price book. Autel: cost = the Lionheart / tier price actually
   paid, msrp = Autel list; `eq` follows the basis ('cost' | 'msrp').
   Install figures are our labour estimates, FOB Greensboro NC. */
var AUTEL = {
  autel_ac_elite:     { cost: 714,    msrp: 1190,   install: 2200,  pn: 'MCC50AHI',         tier: 'T1 40%',    note: 'AC Elite Commercial 50A, in-body holster' },
  autel_single:       { cost: 800,    msrp: 1143,   install: 1800,  pn: 'UW12-J0650CA0002', tier: 'Lionheart', note: 'AC Single 50A LCD, J1772, 19 ft, 5 yr warranty' },
  autel_ac_pro:       { cost: 1119,   msrp: 1599,   install: 2600,  pn: 'UW19L002',         tier: 'Lionheart', note: 'AC Pro 80A commercial, J1772, 25 ft' },
  autel_ac_ultra:     { cost: 5835,   msrp: 7780,   install: 3400,  pn: 'MU38FP7C',         tier: 'Lionheart', note: 'AC Ultra floor-standing dual-port full set: 25 ft cables, pedestal, POS' },
  autel_dc_compact:   { cost: 10725,  msrp: 16500,  install: 16000, pn: 'UW040A2501',       tier: 'T1 35%',    note: 'DC Compact 40 kW, dual CCS. No pedestal/POS/trolley.' },
  autel_fast_disp:    { cost: 63400,  msrp: 79250,  install: 20000, pn: 'UF240A4001',       tier: 'Lionheart', note: 'DC Fast 240 kW, boost cable' },
  autel_fast_cab:     { cost: 63400,  msrp: 79250,  install: 34000, pn: 'UF240A4001',       tier: 'Lionheart', note: 'DC Fast 240 kW large cabinet' },
  autel_dc_fast_aio:  { cost: 63400,  msrp: 79250,  install: 36000, pn: 'UF240A4001',       tier: 'Lionheart', note: 'DC Fast 240 kW all-in-one' },
  autel_dh240:        { cost: 77850,  msrp: 103800, install: 42000, pn: 'UH320',            tier: 'Lionheart', note: 'DH320 air-cooled two-port + POS + CMS (nearest listed to DH240)' },
  autel_dh480:        { cost: 86250,  msrp: 115000, install: 60000, pn: 'UH480',            tier: 'Lionheart', note: 'DH480 air-cooled two-port, 15in screen, POS + CMS' },
  autel_hipower_cab:  { cost: 113600, msrp: 142000, install: 45000, pn: 'HP640',            tier: 'T2 20%',    note: 'HiPower 640 kW power cabinet only' },
  autel_dc_hipower:   { cost: 160800, msrp: 201000, install: 80000, pn: 'HP640+LCD',        tier: 'T2 20%',    note: 'HiPower 640 kW cabinet + liquid-cooled dual-port dispenser' },
  autel_hipower_disp: { cost: 47200,  msrp: 59000,  install: 22000, pn: 'LCDP',             tier: 'T2 20%',    note: 'HiPower liquid-cooled dual-port dispenser (CMS std)' }
};
var EV_OTHER = {   /* no price book for these: prior estimates */
  tesla_v4_post: { eq: 45000, install: 38000 }, tesla_v4_unit: { eq: 45000, install: 38000 },
  tesla_v3_cab: { eq: 70000, install: 30000 }, alpitronic_hyc400: { eq: 165000, install: 70000 }
};

function n(v, d) { var x = Number(v); return (v === '' || v == null || !isFinite(x)) ? d : x; }
function pos(v, d) { var x = Number(v); return (isFinite(x) && x > 0) ? x : d; }
function r0(x) { return Math.round(x); }

/* $/Wdc for an array: a canopy is its own structure at its own rate; ground
   and rooftop follow the sector band of the whole programme's size. */
function pvRate(kwDc, mount) { var k = +kwDc || 0; if (mount === 'canopy') return BENCH.pvCanopy; if (k < 100) return BENCH.pvResidential; if (k < 20000) return BENCH.pvCommercial; return BENCH.pvUtility; }
var SOLAR_MOUNTS = [['ground', 'Solar PV, ground mount'], ['roof', 'Solar PV, rooftop'], ['canopy', 'Solar canopy']];
function bessAuto(kwh, override) { if (override > 0) return override; if (!kwh || kwh <= 0) return 0; return r0(kwh * BESS_EQ_PER_KWH); }

/* Which benchmark a placed prime mover falls under. */
function genClass(sh) {
  var id = String((sh && (sh.altId || sh.genId)) || '').toLowerCase();
  if (sh && sh.kind === 'derwind') return 'wind';
  if (BENCH.genPerKw[id] != null) return id;
  var m = String((sh && (sh.model || sh.label)) || '').toLowerCase();
  if (/fuel\s*cell|sofc|bloom/.test(m)) return 'sofc';
  if (/wind/.test(m)) return 'wind';
  if (/large gas turbine|frame/.test(m)) return 'turbine_l';
  if (/turbine|aero/.test(m)) return 'turbine';
  if (/large recip/.test(m)) return 'recip_l';
  if (/recip|engine/.test(m)) return 'recip';
  if (/genset|generator/.test(m)) return 'gen_ng';
  var kw = +(sh && sh.kw) || 0;
  if (kw >= 40000) return 'turbine_l'; if (kw >= 15000) return 'turbine'; if (kw >= 5000) return 'recip_l'; if (kw >= 1000) return 'recip';
  return 'other';
}
function evBook(basis) {
  var out = {}, k;
  for (k in EV_OTHER) if (EV_OTHER.hasOwnProperty(k)) out[k] = { eq: EV_OTHER[k].eq, install: EV_OTHER[k].install };
  for (k in AUTEL) if (AUTEL.hasOwnProperty(k)) { var a = AUTEL[k]; out[k] = { eq: basis === 'msrp' ? a.msrp : a.cost, install: a.install, pn: a.pn, tier: a.tier, msrp: a.msrp, cost: a.cost, note: a.note }; }
  return out;
}
function evEst(kind, kw) {
  kw = +kw || 0;
  if (kind === 'evl2') { var eqL2 = Math.max(800, r0(kw * 90)); return { eq: eqL2, install: r0(eqL2 * 1.4) }; }
  var eqDc = Math.max(20000, r0(kw * 300)); return { eq: eqDc, install: r0(eqDc * 0.55) };
}

/* ── the roll-up ──────────────────────────────────────────────────── */
function rollup(q) {
  q = q || {};
  var sheet = q.sheet || {}, S = function (k) { return n(sheet[k], SHEET[k]); };
  var out = { ok: true, lines: {}, flags: {}, sources: { bench: BENCH.source, gen: BENCH.genSource, pod: BENCH.podSource, dc: DC_ROM.source } };

  /* BESS: placed fleet by model, else the configured list for display only */
  var fleet = q.fleet || { units: 0, byModel: {} }, overrides = q.overrides || {}, bessTotal = 0, bessRows = [], autoByKwh = {}, k;
  var models = Object.keys(fleet.byModel || {});
  /* NextNRG: every array and battery in NextNRG's own workspace, else the
     arrays and batteries stamped as its product */
  var nnAll = NEXTNRG.isVendorOrg(q.vendorOrg), solarKwAll = +(q.solarKwDc || 0);
  var nnSolarKw = nnAll ? solarKwAll : Math.min(solarKwAll, +((q.solar && q.solar.nextnrgKwDc) || 0));
  var nnStorage = { kw: 0, kwh: 0, units: 0, inside: false, alone: 0 };
  if (fleet.units > 0 && models.length) {
    for (var i = 0; i < models.length; i++) {
      k = models[i]; var bm = fleet.byModel[k] || {}, ov = overrides[k], auto = bessAuto(+(bm.kwh || 0), 0);
      var cat = catalogPrice(bm.catalogKey || k), known = bm.cost != null ? +bm.cost : cat;
      if (bm.kwh > 0) autoByKwh[String(bm.kwh)] = cat != null && bm.cost == null ? cat : auto;
      var isNN = nnAll || bm.nextnrg === true, qty = +bm.qty || 0, inSystem = false, nnRate = false;
      var perUnit = (ov != null) ? +ov : (known != null ? known : auto);
      var eq = (ov == null && bm.mixed && bm.groupCost > 0) ? +bm.groupCost : perUnit * qty;
      var inst = r0(eq * BESS_INSTALL_RATIO);
      if (isNN && ov == null && bm.cost == null) {
        nnStorage.units += qty; nnStorage.kw += (+bm.kw || 0) * qty; nnStorage.kwh += (+bm.kwh || 0) * qty;
        if (nnSolarKw > 0) { inSystem = true; perUnit = 0; eq = 0; inst = 0; nnStorage.inside = true; }
        else { nnRate = true; perUnit = r0((+bm.kw || 0) * 1000 * NN_RATE.storageOnlyPerW); eq = perUnit * qty; inst = 0; nnStorage.alone += eq; }
      }
      var tot = eq + inst;
      bessTotal += tot;
      bessRows.push({ key: k, qty: qty, kwh: +bm.kwh || 0, perUnit: perUnit, eq: eq, install: inst, total: tot, missing: (known == null && ov == null && !isNN), catalog: (bm.cost == null && cat != null),
        nextnrg: isNN, inSystem: inSystem, nextnrgRate: nnRate });
    }
  }
  var cfgRows = [];
  (q.configured || []).forEach(function (b) {
    var cp = (+(b.eqcost || 0) > 0) ? null : catalogPrice(b.catalogKey), eq2 = bessAuto(+(b.kwh || 0), +(b.eqcost || 0) || cp || 0);
    if (b.kwh > 0 && !(b.eqcost > 0)) autoByKwh[String(b.kwh)] = cp != null ? cp : bessAuto(+b.kwh, 0);
    var ins = +(b.installcost || 0) || r0(eq2 * BESS_INSTALL_RATIO), qty = +(b.qty || 1);
    cfgRows.push({ id: b.id, name: b.name, kwh: +b.kwh || 0, mfr: b.mfr || '', qty: qty, eq: eq2, install: ins, total: (eq2 + ins) * qty });
  });
  /* placed but never itemised: the benchmark, so the sheet and the rail agree */
  var rating = q.fleetRating || { kwh: 0, kw: 0 }, benchBess = 0, ratingInside = false, ratingAlone = 0;
  if (bessTotal <= 0 && !nnStorage.inside && ((+rating.kwh || 0) > 0 || (+rating.kw || 0) > 0)) {
    if (nnAll && nnSolarKw > 0) { ratingInside = true; nnStorage.inside = true; nnStorage.kw += +rating.kw || 0; nnStorage.kwh += +rating.kwh || 0; }
    else if (nnAll) { ratingAlone = r0((+rating.kw || 0) * 1000 * NN_RATE.storageOnlyPerW); bessTotal = ratingAlone; nnStorage.alone += ratingAlone; nnStorage.kw += +rating.kw || 0; nnStorage.kwh += +rating.kwh || 0; }
    else {
      benchBess = (+rating.kwh || 0) * pos(sheet.bessKwh, BENCH.bessKwh) + (+rating.kw || 0) * pos(sheet.bessKw, BENCH.bessKw);
      if (benchBess > 0) bessTotal = benchBess;
    }
  }
  out.lines.bess = { total: bessTotal, rows: bessRows, configured: cfgRows, isBenchmark: benchBess > 0, benchmark: benchBess, autoByKwh: autoByKwh, installRatio: BESS_INSTALL_RATIO,
    nextnrg: nnStorage.units > 0 || ratingInside || ratingAlone > 0, inSystem: nnStorage.inside, nextnrgAlone: nnStorage.alone };

  /* site equipment: unit price × what is placed */
  var c = q.counts || {}, cnt = function (x) { return +c[x] || 0; };
  var pad = S('pad') * cnt('pad'), disco = S('disco') * cnt('disco'), meter = S('meter') * cnt('meter'), boll = S('bollards') * cnt('bollard'), jbox = S('jbox') * cnt('jbox'), panel = S('panel') * cnt('panel');
  var siteItems = cnt('pad') + cnt('disco') + cnt('meter') + cnt('bollard') + cnt('jbox') + cnt('panel');
  var misc = siteItems > 0 ? S('misc') : 0, xfmrCost = c.hasXfmr ? S('xfmr') : 0;
  var siteEq = pad + disco + meter + boll + jbox + panel + misc + xfmrCost;
  out.lines.site = { total: siteEq, pad: pad, disco: disco, meter: meter, bollards: boll, jbox: jbox, panel: panel, misc: misc, xfmr: xfmrCost, counts: { pad: cnt('pad'), disco: cnt('disco'), meter: cnt('meter'), bollard: cnt('bollard'), jbox: cnt('jbox'), panel: cnt('panel') } };

  /* the microgrid controller: NextNRG's unit, at ClearSky's price, per unit on the drawing */
  var mgcN = cnt('mgc'), mgcTotal = mgcN * MGC_EACH;
  out.lines.controller = { qty: mgcN, each: MGC_EACH, total: mgcTotal, key: NEXTNRG.CONTROLLER.key, make: NEXTNRG.CONTROLLER.make, model: NEXTNRG.CONTROLLER.model,
    basis: NEXTNRG.CONTROLLER.priceBasis, uplift: { pct: Math.round(NEXTNRG.UPLIFT.pct * 100), appliesTo: NEXTNRG.UPLIFT.appliesTo, caveat: NEXTNRG.UPLIFT.caveat } };

  /* conduit: materials estimate for the BOM, never added to the total */
  var ft = q.conduitFt || {}, runs = q.conduitRuns || {};
  var dcFt = +ft['RMC-DC'] || 0, acFt = +ft['RMC-AC'] || 0, bmsFt = +ft['EMT-BMS'] || 0, ugFt = +ft['PVC-UG'] || 0;
  var rmcMat = S('rmcMat'), rmcLabor = S('rmcLabor'), emtMat = S('emtMat'), emtLabor = S('emtLabor'), bmsMat = S('bmsMat'), bmsLabor = S('bmsLabor');
  var dcMat = dcFt * rmcMat, dcLab = dcFt * rmcLabor, acMat = acFt * emtMat, acLab = acFt * emtLabor, bmsCost = bmsFt * (bmsMat + bmsLabor);
  var condTotal = dcMat + dcLab + acMat + acLab + bmsCost;
  var kwFirst = +(q.firstBessKw || 0) || 380, amps = r0(kwFirst * 1000 / (480 * 1.732));
  var gauge = amps > 300 ? '#350 kcmil' : amps > 200 ? '#2/0 AWG' : amps > 100 ? '#1/0 AWG' : '#2 AWG';
  var sched = [];
  function row(type, size, qty, feet, wire, mr, lr) { sched.push({ type: type, size: size, runs: qty, ft: feet, wire: wire, mat: r0(feet * mr), labor: r0(feet * lr), total: r0(feet * mr) + r0(feet * lr) }); }
  if (dcFt > 0) row('RMC-DC', '2" RMC', +runs['RMC-DC'] || 0, dcFt, '3-' + gauge + ' CU + #6 GND', rmcMat, rmcLabor);
  if (acFt > 0) row('RMC-AC', '2" RMC', +runs['RMC-AC'] || 0, acFt, '3-' + gauge + ' CU + #6 GND', emtMat, emtLabor);
  if (bmsFt > 0) row('EMT-BMS', '3/4" EMT', +runs['EMT-BMS'] || 0, bmsFt, 'Cat6+RS485', bmsMat, bmsLabor);
  if ((+runs['PVC-UG'] || 0) > 0) row('PVC-UG', '2" PVC Sch40', +runs['PVC-UG'], ugFt, '3-' + gauge + ' CU + #6 GND', SHEET.ugMat, SHEET.ugLabor);
  out.lines.conduit = { total: condTotal, dcFt: dcFt, acFt: acFt, bmsFt: bmsFt, dcMat: dcMat, dcLabor: dcLab, acMat: acMat, acLabor: acLab, bms: bmsCost,
    matTotal: dcMat + acMat + r0(bmsFt * bmsMat), laborTotal: dcLab + acLab + r0(bmsFt * bmsLabor), schedule: sched,
    detail: [ { type: 'RMC-DC', label: 'DC Power (2" RMC)', ft: dcFt, matRate: rmcMat, laborRate: rmcLabor, mat: dcMat, labor: dcLab },
              { type: 'RMC-AC', label: 'AC Power (2" RMC)', ft: acFt, matRate: emtMat, laborRate: emtLabor, mat: acMat, labor: acLab },
              { type: 'EMT-BMS', label: 'BMS/Data (3/4" EMT)', ft: bmsFt, matRate: bmsMat, laborRate: bmsLabor, mat: r0(bmsFt * bmsMat), labor: r0(bmsFt * bmsLabor) } ].filter(function (d) { return d.ft > 0; }) };

  /* EMS: per kWh of storage; no storage, no fee. Setup is capex, the annual fee is O&M. */
  var emsOn = !!q.emsOn, kwhTotal = +(q.configuredKwh || 0);
  var emsAnnual = (emsOn && kwhTotal > 0) ? kwhTotal * S('emsRate') : 0, emsSetup = (emsOn && kwhTotal > 0) ? S('emsSetup') : 0;
  out.lines.ems = { on: emsOn, annual: emsAnnual, setup: emsSetup, year1: emsSetup + emsAnnual };

  /* indirects: entered when the job is scoped; blank is zero */
  var eng = S('eng'), perm = S('perm'), comm = S('comm'), indirect = eng + perm + comm + emsSetup;
  out.lines.indirect = { total: indirect, eng: eng, perm: perm, comm: comm, emsSetup: emsSetup };

  /* EV chargers: the book at the basis, estimators where none, overrides on the shape */
  var book = evBook(q.priceBasis === 'msrp' ? 'msrp' : 'cost'), ev = { eq: 0, install: 0, total: 0, units: 0, futureUnits: +(q.ev && q.ev.futureUnits) || 0, futureMakeReady: 0, byModel: {}, book: {} };
  ((q.ev && q.ev.items) || []).forEach(function (it) {
    var bk = it.evId && book[it.evId], cc = bk ? { eq: bk.eq, install: bk.install } : evEst(it.kind, it.kw);
    if (it.eqOverride != null) cc.eq = +it.eqOverride;
    if (it.installOverride != null) cc.install = +it.installOverride;
    var qty = (+it.qty > 0) ? +it.qty : 1, key = it.key || it.evId || it.kind;
    ev.eq += cc.eq * qty; ev.install += cc.install * qty; ev.units += qty;
    if (!ev.byModel[key]) ev.byModel[key] = { qty: 0, eq: 0, install: 0, kw: +it.kw || 0, mfr: it.mfr || '' };
    ev.byModel[key].qty += qty; ev.byModel[key].eq += cc.eq * qty; ev.byModel[key].install += cc.install * qty;
    if (bk && bk.pn) ev.book[key] = { pn: bk.pn, tier: bk.tier, msrp: bk.msrp, cost: bk.cost };
  });
  if (ev.futureUnits > 0 && (+(q.ev && q.ev.futureMakeReady) || 0) > 0) { ev.futureMakeReady = +q.ev.futureMakeReady; ev.install += ev.futureMakeReady; }
  ev.total = ev.eq + ev.install;
  out.lines.ev = ev;

  /* solar: priced per kW-DC by how each array is MOUNTED (a canopy is a
     canopy, never a ground array) and the size of the programme, the
     sheet's $/Wdc winning for every mount; one line per mount. Nothing
     else on the drawing moves it: a compute skid is on its own meter and
     its own line. kW the page could not place by mount (a previewed
     layout) is priced as plain PV at the size band. */
  var solarKw = +(q.solarKwDc || 0), byMount = (q.solar && q.solar.byMount) || null, solarSheet = pos(sheet.pvWdc, 0), solarRows = [], solarTotal = 0, solarPlaced = 0;
  /* NextNRG's system first: its solar at the system rate, with its storage
     and the labor inside; the page keeps NextNRG arrays out of byMount, and
     in NextNRG's own workspace every array is the system */
  var nnTotal = 0, nnLine = null;
  if (nnSolarKw > 0) {
    nnTotal = r0(nnSolarKw * 1000 * NN_RATE.perWdc);
    if (nnAll) byMount = null;
    nnLine = { total: nnTotal, solarKwDc: nnSolarKw, rate: NN_RATE.perWdc, label: NN_RATE.label, includes: NN_RATE.includes.slice(), basis: NN_RATE.basis,
      storage: { kw: nnStorage.kw, kwh: nnStorage.kwh, units: nnStorage.units, inside: nnStorage.inside }, vendor: nnAll ? 'workspace' : 'product', contingency: NN_RATE.contingency };
  } else if (nnStorage.alone > 0) {
    nnLine = { total: 0, solarKwDc: 0, rate: NN_RATE.perWdc, label: 'NextNRG storage, installed', includes: ['the storage', 'installation labor'], basis: NN_RATE.basis,
      storage: { kw: nnStorage.kw, kwh: nnStorage.kwh, units: nnStorage.units, inside: false, total: nnStorage.alone, ratePerW: NN_RATE.storageOnlyPerW }, vendor: nnAll ? 'workspace' : 'product', contingency: NN_RATE.contingency };
  }
  out.lines.nextnrg = nnLine;
  out.sources.nextnrg = nnLine ? NN_RATE.corroboration : undefined;
  if (byMount) SOLAR_MOUNTS.forEach(function (m) {
    var kw = +byMount[m[0]] || 0; if (!(kw > 0)) return;
    var rate = solarSheet > 0 ? solarSheet : pvRate(solarKw, m[0]), tot = kw * 1000 * rate;
    solarRows.push({ mount: m[0], label: m[1], kwDc: kw, rate: rate, total: tot, isBenchmark: !(solarSheet > 0) }); solarTotal += tot; solarPlaced += kw;
  });
  var solarRest = solarKw - nnSolarKw - solarPlaced;
  if (solarRest > 0.05) { var restRate = solarSheet > 0 ? solarSheet : pvRate(solarKw), restTot = solarRest * 1000 * restRate; solarRows.push({ mount: 'unspecified', label: 'Solar PV', kwDc: solarRest, rate: restRate, total: restTot, isBenchmark: !(solarSheet > 0) }); solarTotal += restTot; }
  var solarKwPriced = solarPlaced + Math.max(0, solarRest);
  out.lines.solar = { total: solarTotal, kwDc: solarKwPriced, rate: solarKwPriced > 0 ? solarTotal / (solarKwPriced * 1000) : 0, rows: solarRows, isBenchmark: solarTotal > 0 && !(solarSheet > 0), canopyRate: BENCH.pvCanopy, nextnrgKwDc: nnSolarKw };
  out.sources.pvCanopy = BENCH.pvCanopySource;

  /* building envelope: audited in the page from the assembly catalog; its capex rides through */
  var bnzTotal = +(q.bnzCapex || 0);

  /* compute pods: entered, else the operator band, scaled by IT kW */
  var cq = q.compute || {}, pn = +cq.podsN || 0, pkw = +cq.podKw || 0, shellPer = +cq.shellPerPod || 0, itPer = +cq.itPerPod || 0;
  var shell = shellPer > 0 ? shellPer * pn : 0, itT = itPer > 0 ? itPer * pn : 0, entered = shellPer > 0 || itPer > 0;
  var bMid = pkw * BENCH.podAllInPerKw, bLo = pkw * BENCH.podAllInLoPerKw, bHi = pkw * BENCH.podAllInHiPerKw;
  var allIn = entered ? shell + itT : bMid, allInLo = entered ? allIn : bLo, allInHi = entered ? allIn : bHi;
  var comp = { pods: pn, mw: pkw / 1000, shellTotal: shell, itTotal: itT, entered: entered, excludeIt: !!cq.excludeIt,
    isBenchmark: !entered && pn > 0 && !cq.excludeIt, benchPerPod: pn > 0 ? bMid / pn : BENCH.podAllInPerKw * 1000,
    benchLoPerPod: pn > 0 ? bLo / pn : BENCH.podAllInLoPerKw * 1000, benchHiPerPod: pn > 0 ? bHi / pn : BENCH.podAllInHiPerKw * 1000,
    benchSource: BENCH.podSource, allIn: allIn, allInLo: allInLo, allInHi: allInHi,
    shellPerMw: pkw > 0 && shell > 0 ? shell / (pkw / 1000) : 0, itPerMw: pkw > 0 && itT > 0 ? itT / (pkw / 1000) : 0, allInPerMw: pkw > 0 && allIn > 0 ? allIn / (pkw / 1000) : 0 };
  if (cq.excludeIt) { comp.projectCapex = shell; comp.projectLo = shell; comp.projectHi = shell; }
  else { comp.projectCapex = allIn; comp.projectLo = allInLo; comp.projectHi = allInHi; }
  comp.siteCapex = comp.projectCapex;
  var computeTotal = comp.projectCapex, computeLo = comp.projectLo > 0 ? comp.projectLo : computeTotal, computeHi = comp.projectHi > 0 ? comp.projectHi : computeTotal;
  out.lines.compute = comp;

  /* on-site generation: the EIA class benchmark per prime mover */
  var gen = { total: 0, kw: 0, units: 0, lines: [], gasKw: 0, gasTotal: 0, isBenchmark: true, source: BENCH.genSource }, by = {}, GO = q.genOverrides || {};
  (q.gen || []).forEach(function (sh) {
    var cls = genClass(sh), kw = +sh.kw || 0, rate = (+GO[cls] > 0) ? +GO[cls] : (BENCH.genPerKw[cls] > 0 ? BENCH.genPerKw[cls] : BENCH.genPerKw.other);
    var key = cls + '|' + (sh.model || sh.label || cls);
    if (!by[key]) by[key] = { cls: cls, model: (sh.model || sh.label || cls), units: 0, kw: 0, rate: rate, cost: 0, overridden: (+GO[cls] > 0), fuel: (sh.fuel || (cls === 'wind' ? 'wind' : 'natural gas')) };
    by[key].units++; by[key].kw += kw; by[key].cost += kw * rate;
  });
  Object.keys(by).forEach(function (kk) { var l = by[kk]; gen.lines.push(l); gen.total += l.cost; gen.kw += l.kw; gen.units += l.units; if (l.cls !== 'wind' && l.cls !== 'sofc') { gen.gasKw += l.kw; gen.gasTotal += l.cost; } });
  out.lines.gen = gen;

  /* data-centre electrical package (ROM): N+1 UPS on IT, N+1 transformers at 0.9 pf and 80% loading */
  var d = q.dc || {}, dc = { active: false, lines: [], total: 0, itKw: 0, facilityKw: 0, ups: 0, xfmr: 0, source: DC_ROM.source, xfmrKva: DC_ROM.xfmrKva, upsRatedKw: DC_ROM.upsRatedKw };
  var itKw = 0, pue = 0, facKw = 0;
  if (d.element) { itKw = +d.element.itKw || 0; pue = +d.element.pue || 0; facKw = +d.element.kw || (itKw && pue ? itKw * pue : itKw); }
  else if ((+d.pods || 0) > 0) { itKw = (+d.podKw || 0) || d.pods * 1000; pue = +d.pue || 0; if (!(pue > 0)) pue = 1.3; facKw = itKw * pue; dc.fromDrawing = true; dc.pods = +d.pods; }
  if (facKw > 0) {
    dc.active = true; dc.itKw = itKw; dc.facilityKw = facKw;
    var upsQty = Math.max(1, Math.ceil((itKw || facKw) / DC_ROM.upsRatedKw)) + 1, xfmrQty = Math.max(1, Math.ceil((facKw / 0.9) / (DC_ROM.xfmrKva * 0.8))) + 1;
    dc.ups = upsQty; dc.xfmr = xfmrQty;
    var L = function (desc, qty, each) { dc.lines.push({ desc: desc, qty: qty, each: each, amount: qty * each }); dc.total += qty * each; };
    L(DC_ROM.xfmrKva + ' kVA padmount transformer (N+1)', xfmrQty, DC_ROM.xfmrEach);
    L('480 V LVA switchgear lineup', 1, DC_ROM.switchgear);
    L('UPS ' + DC_ROM.upsFamily + ' ' + DC_ROM.upsRatedKw + ' kW (N+1)', upsQty, DC_ROM.upsEach);
    L('Microgrid control package incl. gen paralleling', 1, DC_ROM.microgridCtrl);
    L('E-house enclosures (all equipment)', 1, DC_ROM.eHouseLow);
    var design = dc.total * DC_ROM.designPctLow;
    dc.lines.push({ desc: 'Electrical engineering design (' + r0(DC_ROM.designPctLow * 100) + '% of equipment)', qty: 1, each: r0(design), amount: r0(design) });
    dc.total = r0(dc.total + design);
  }
  out.lines.dc = dc;
  var dcTotal = dc.active ? dc.total : 0;

  /* scope gate: allowances apply only once something priceable is placed */
  var placedKw = +(q.placedKw || 0);
  var inScope = bessTotal > 0 || ev.total > 0 || placedKw > 0 || solarTotal > 0 || nnTotal > 0 || dcTotal > 0 || bnzTotal > 0 || computeTotal > 0 || pn > 0 || gen.total > 0 || mgcTotal > 0;
  var sub = inScope ? (bessTotal + solarTotal + nnTotal + siteEq + indirect + ev.total + dcTotal + bnzTotal + computeTotal + gen.total + mgcTotal) : 0;
  /* a vendor's installed price (NextNRG's system, its storage alone) carries no contingency */
  var noCont = inScope ? nnTotal + nnStorage.alone : 0;
  var contPct = S('contPct') / 100, cont = (sub - noCont) * contPct, TOTAL = sub + cont;
  var subLo = sub - computeTotal + computeLo, subHi = sub - computeTotal + computeHi;
  var costLow = inScope ? (subLo - noCont) * (1 + contPct) + noCont : 0, costHigh = inScope ? (subHi - noCont) * (1 + contPct) + noCont : 0;
  /* the ITC is on energy property: never pods, gas generation, the compute electrical package or a shell */
  var itcExcluded = computeTotal + dcTotal + bnzTotal + (gen.gasTotal || 0), itcSub = Math.max(0, sub - itcExcluded), itcBasis = (itcSub - noCont) * (1 + contPct) + noCont;
  var bessKW = +(q.configuredKw || 0), totalKW = bessKW + r0((pkw / 1000) * 1000) + r0(gen.kw || 0), costPerKW = totalKW > 0 ? r0(TOTAL / totalKW) : 0;
  /* a contracted number is the truth once it exists */
  var actual = pos(sheet.actualTotal, 0), benchmarkTotal = sub + cont;
  if (actual > 0) { TOTAL = actual; costLow = actual; costHigh = actual; itcBasis = sub > 0 ? actual * (itcSub / sub) : actual; }
  out.totals = { total: TOTAL, sub: sub, cont: cont, contPct: contPct, contPctRound: r0(contPct * 100), low: costLow, high: costHigh,
    itcBasis: itcBasis, itcExcluded: itcExcluded * (1 + contPct), inScope: inScope, contracted: actual > 0, benchmark: benchmarkTotal,
    totalKW: totalKW, costPerKW: costPerKW, bess: bessTotal, solar: solarTotal, ev: ev.total, dc: dcTotal, bnz: bnzTotal, compute: computeTotal, computePods: pn, gen: gen.total,
    siteEq: inScope ? siteEq : 0, siteEqRaw: siteEq, xfmr: xfmrCost, indirect: inScope ? indirect : 0, indirectRaw: indirect, emsSetup: inScope ? emsSetup : 0, conduit: condTotal,
    controller: mgcTotal, controllerUnits: mgcN,
    nextnrg: nnTotal, nextnrgKwDc: nnSolarKw, nextnrgStorageAlone: nnStorage.alone, noContingency: noCont };
  out.flags = { bessBenchmark: benchBess > 0, solarBenchmark: solarTotal > 0, computeBenchmark: comp.isBenchmark, genBenchmark: gen.total > 0,
    benchmarked: benchBess > 0 || solarTotal > 0 || comp.isBenchmark || gen.total > 0, nextnrg: nnTotal > 0 || nnStorage.alone > 0 };
  return out;
}

module.exports = { rollup: rollup, pvRate: pvRate, NN_RATE: NN_RATE, SOLAR_MOUNTS: SOLAR_MOUNTS, bessAuto: bessAuto, genClass: genClass, evBook: evBook, evEst: evEst, catalogPrice: catalogPrice,
  _tables: { BENCH: BENCH, BESS_EQ_PER_KWH: BESS_EQ_PER_KWH, BESS_INSTALL_RATIO: BESS_INSTALL_RATIO, SHEET: SHEET, DC_ROM: DC_ROM, AUTEL: AUTEL, EV_OTHER: EV_OTHER } };
