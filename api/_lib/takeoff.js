/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The takeoff by trade: the Run's money, grouped the way a contractor
   buys it, each line with its quantity and the parts of the drawing it
   counts (Blueprint to Build, Phase 3; docs/BLUEPRINT-TO-BUILD.md;
   2026-10-16, Tommy: "Push it and continue with the builds", after a
   Perplexity ad whose right rail reads "Sitework 574 CY $20.4K").

   Pure, ES5, no I/O. api/takeoff.js is the ONE door: it runs the Run's own
   roll-up (api/_lib/editor-cost.js rollup) on the drawing's quantities and
   hands the answer to takeoff() below. The Cost tab draws it
   (omega-takeoff.js); every figure it prints comes from here.

   THE MONEY IS THE RUN'S, TO THE CENT.
     - The lines are the build sequence's (api/_lib/build-sequence.js
       money(): every line the roll-up puts in its total, the Run's
       contingency where the Run applies it, a contracted total spread by
       the estimate's shares, cents by largest remainder). Each goes to
       exactly ONE trade (LINE below); a line with no trade throws, so a
       line added to editor-cost.js one day fails the tests here instead
       of quietly leaving money out.
     - A line's rows (a battery model, a solar mount, a charger model) split
       the line's own cents by the roll-up's own figures for them, again by
       largest remainder, so every level adds up exactly.
     - What the Run keeps out of its total is SHOWN, never added: the
       conduit is a BOM estimate (each run type's BOM figure, marked so), a
       trench or a fence the drawing measures has no price in the Run, and
       the utility's own charges are not in the Run at all.

   THE QUANTITIES ARE READ, NEVER WORKED UP.
     Each quantity is what the drawing or the roll-up counted: units, kWh,
     kW, kW-DC, feet. Nothing is converted into a unit the drawing does not
     carry (no cubic yards without a thickness on file, no tons of steel
     from a kW figure). A lump-sum line says LS.

   WHERE EACH PRICE COMES FROM (Phase 5, "real prices, not model
   guesses"): every line and row says whether the Run priced it from a
   QUOTE (a price entered for this job: a vendor's price typed on the
   cost sheet, an override on a charger, a figure changed from the sheet's
   default, a contracted total), a BOOK (a price on file for that product:
   the catalog, the Autel price book, NextNRG's installed rates, the
   Omega-Core skid's recorded price, ClearSky's controller price, the cost
   sheet's own unit prices) or a BENCHMARK (a screening figure: DOE/NREL,
   NREL storage, EIA, the operator band, the container rate, the charger
   estimator, a budgetary ROM). It is read off the roll-up's own flags and
   the quantities it ran on, never guessed, and it names the kind of
   source, never a rate. `sources` adds the money up by kind, so a
   reviewer sees how much of the total still rests on benchmarks.

   The divisions are CSI MasterFormat's, as the editor's own Takeoff &
   Budget book classes the same things (storage, chargers and gensets in
   26, solar in 48, pads in 03); a trade that spans divisions names both. */
'use strict';

var BS = require('./build-sequence'), EC = require('./editor-cost');

var VERSION = 'takeoff-2';

/* The trades, in the order an estimate runs. */
var TRADES = [
  { key: 'civil',      label: 'Sitework & civil',     div: '31–32' },
  { key: 'concrete',   label: 'Concrete',             div: '03' },
  { key: 'electrical', label: 'Electrical',           div: '26' },
  { key: 'storage',    label: 'Energy storage',       div: '26' },
  { key: 'solar',      label: 'Solar PV',             div: '48' },
  { key: 'ev',         label: 'EV charging',          div: '26' },
  { key: 'generation', label: 'On-site generation',   div: '26 / 48' },
  { key: 'compute',    label: 'Compute',              div: null },
  { key: 'envelope',   label: 'Building envelope',    div: '07–08' },
  { key: 'utility',    label: 'Utility interconnect', div: '33' },
  { key: 'soft',       label: 'Soft costs',           div: '01' },
  { key: 'contracted', label: 'Contracted cost',      div: null }
];
var TRADE_KEYS = TRADES.map(function (t) { return t.key; });

/* Which trade each of the Run's lines (build-sequence lines()) belongs to,
   and what the takeoff calls it: the quantity has its own column here, so
   the name carries no count. */
var LINE = {
  'site.bollards': ['civil', 'Bollards'], 'site.misc': ['civil', 'Misc site hardware'],
  'site.pad': ['concrete', 'Equipment pads'],
  'site.xfmr': ['electrical', 'Transformer'], 'site.panel': ['electrical', 'Panelboards'], 'site.disco': ['electrical', 'Disconnects'],
  'site.meter': ['electrical', 'Meters'], 'site.jbox': ['electrical', 'Junction boxes'],
  controller: ['electrical', 'NextNRG Microgrid Controller'], dc: ['electrical', 'Data-centre electrical package (ROM)'],
  bess: ['storage', 'Battery storage, equipment + install'], 'nextnrg.storage': ['storage', 'NextNRG storage, installed'],
  solar: ['solar', 'Solar PV, installed'], 'nextnrg.solar': ['solar', 'NextNRG solar, installed'],
  ev: ['ev', 'EV chargers, equipment + install'],
  gen: ['generation', 'On-site generation'],
  omegaCore: ['compute', 'Omega-Core skid, as recorded'], compute: ['compute', 'Compute pods'],
  bnz: ['envelope', 'Building envelope measures'],
  'indirect.eng': ['soft', 'Engineering & design'], 'indirect.perm': ['soft', 'Permitting & AHJ'], 'indirect.comm': ['soft', 'Commissioning'],
  'indirect.emsSetup': ['soft', 'EMS setup'],
  contracted: ['contracted', 'Contracted cost']
};

/* What a charger or a generator is called when the drawing names only its
   kind or its book key: the kinds the editor draws, the Autel book's own
   description, the EIA generation classes the roll-up prices by. */
var EV_KIND = { evl2: 'Level 2 charger', evunit: 'DC fast charger', evpost: 'Charging post', evcab: 'Charger cabinet', DCFC: 'DC fast charger' };
var GEN_CLASS = { sofc: 'Fuel cell', gen_ng: 'Natural-gas genset', recip: 'Reciprocating engine', recip_l: 'Large reciprocating engine',
  turbine: 'Gas turbine', turbine_l: 'Large gas turbine', wind: 'Wind turbine', other: 'Generation' };
var AUTEL = EC._tables.AUTEL;
function words(k) { k = String(k).replace(/_/g, ' '); return k.charAt(0).toUpperCase() + k.slice(1); }
function evName(k) {
  if (EV_KIND[k]) return EV_KIND[k];
  if (AUTEL[k]) return 'Autel ' + String(AUTEL[k].note).split(/[,.]/)[0] + ' (' + AUTEL[k].pn + ')';
  return /_/.test(k) ? words(k) : String(k);
}
function genName(g) { return (g.model && g.model !== g.cls) ? String(g.model) : (GEN_CLASS[g.cls] || words(g.cls)); }

/* Where a price comes from: the three kinds, in the order a reviewer
   trusts them. */
var KINDS = ['quote', 'book', 'benchmark'];
var SHEET = EC._tables.SHEET, BENCH = EC._tables.BENCH, EV_OTHER = EC._tables.EV_OTHER;
function src(kind, basis) { return { kind: kind, basis: basis }; }
/* a cost-sheet figure someone changed from the sheet's own default */
function typed(q, k, dflt) { var v = q.sheet && q.sheet[k], x = Number(v); return v !== '' && v != null && isFinite(x) && x !== dflt; }
var SHEET_KEY = { 'site.pad': 'pad', 'site.disco': 'disco', 'site.meter': 'meter', 'site.jbox': 'jbox', 'site.panel': 'panel', 'site.bollards': 'bollards',
  'site.misc': 'misc', 'site.xfmr': 'xfmr', 'indirect.eng': 'eng', 'indirect.perm': 'perm', 'indirect.comm': 'comm', 'indirect.emsSetup': 'emsSetup' };
/* the price of a line with no rows, from the roll-up's flags */
function lineSource(key, out, q) {
  var L = out.lines || {}, comp = L.compute || {}, bess = L.bess || {};
  if (SHEET_KEY[key]) {
    var k = SHEET_KEY[key];
    return typed(q, k, SHEET[k]) ? src('quote', 'Typed on the cost sheet') : src('book', /^site\./.test(key) ? 'The cost sheet’s unit price' : 'The cost sheet’s default');
  }
  switch (key) {
    case 'controller': return src('book', 'ClearSky’s price for the controller');
    case 'omegaCore': return src('book', 'The skid’s recorded price');
    case 'nextnrg.solar': case 'nextnrg.storage': return src('book', 'NextNRG’s installed price');
    case 'dc': return src('benchmark', 'A budgetary ROM (Eaton, April 2026): re-quote before use');
    case 'compute': return comp.entered ? src('quote', 'Entered in Compute Cost') : src('benchmark', 'The operator band per MW');
    case 'bnz': return src('benchmark', 'A screening estimate of the building measures');
    case 'bess':
      if (typed(q, 'bessKwh', BENCH.bessKwh) || typed(q, 'bessKw', BENCH.bessKw)) return src('quote', 'A $/kWh or $/kW typed on the cost sheet');
      return src('benchmark', 'The NREL storage benchmark: no model on the drawing carries a price');
    case 'contracted': return src('quote', 'The contracted cost');
    default: return src('benchmark', 'Not on file');
  }
}
/* a battery model's row: an override, the product's own price, the
   catalog, NextNRG's rate, else the container rate */
function bessSource(r, q) {
  var bm = (q.fleet && q.fleet.byModel && q.fleet.byModel[r.key]) || {}, ov = q.overrides && q.overrides[r.key];
  if (ov != null) return src('quote', 'A vendor’s price entered for this model');
  if (r.nextnrgRate) return src('book', 'NextNRG’s installed price');
  if (bm.mixed && bm.groupCost > 0) return src('book', 'The placed products’ own prices');
  if (bm.cost != null) return src('book', 'The placed product’s own price');
  if (r.catalog) return src('book', 'The catalog price');
  return src('benchmark', 'The container rate per kWh: enter the vendor’s price');
}
/* a charger model's row: an override on any of its chargers, the Autel
   price book, else an estimate */
function evSource(k, idx, out, q) {
  var items = (q.ev && q.ev.items) || [], book = (out.lines && out.lines.ev && out.lines.ev.book) || {}, over = false, other = false;
  idx.forEach(function (p) { var it = items[+String(p).slice(3)] || {}; if (it.eqOverride != null || it.installOverride != null) over = true; if (it.evId && EV_OTHER[it.evId]) other = true; });
  if (over) return src('quote', 'A price entered on the charger');
  if (book[k]) return src('book', 'The Autel price book');
  if (other) return src('benchmark', 'A prior estimate: no price book for this charger');
  return src('benchmark', 'Estimated from the charger’s kW');
}

/* The conduit the BOM carries, by run type, as the Run's schedule names it. */
var CONDUIT = { 'RMC-DC': 'DC power conduit', 'RMC-AC': 'AC power conduit', 'EMT-BMS': 'BMS / data conduit', 'PVC-UG': 'Underground conduit' };

function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
function cnt(v) { var x = Math.floor(num(v)); return x > 0 ? x : 0; }
function fmt(x) { var r = Math.round(x * 10) / 10; return String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function q1(qty, unit) { return qty > 0 ? { qty: Math.round(qty * 100) / 100, unit: unit, text: fmt(qty) + ' ' + unit } : null; }
function ls() { return { qty: 1, unit: 'LS', text: 'LS' }; }

/* What the page may add: what the drawing measures that the Run does not
   price (feet of trench and of fence, the pads' area). Never money. */
function clean(x) {
  x = x && typeof x === 'object' ? x : {};
  function ft(v, cap) { var n = num(v); return n > 0 ? Math.min(n, cap) : 0; }
  return { trenchFt: ft(x.trenchFt, 1000000), fenceFt: ft(x.fenceFt, 1000000), padSf: ft(x.padSf, 10000000) };
}

/* A line's quantity and rows, read off the roll-up. Each row carries the
   roll-up's own figure for it (`weight`) to split the line's cents by, and
   `parts`: the keys the page resolves to what is on the drawing. */
function detail(key, out, q, x) {
  var L = out.lines || {}, site = L.site || {}, c = site.counts || {}, d = { rows: [], parts: [] };
  var bess = L.bess || {}, ev = L.ev || {}, sol = L.solar || {}, nn = L.nextnrg || {}, gen = L.gen || {}, dc = L.dc || {};
  var oc = L.omegaCore || {}, comp = L.compute || {}, ctl = L.controller || {};
  function row(label, qty, weight, parts, source) { d.rows.push({ label: label, qty: qty, weight: num(weight), parts: parts || [], source: source || null }); }
  switch (key) {
    case 'site.pad':
      d.qty = q1(cnt(c.pad), 'EA'); d.parts = ['pad'];
      if (x.padSf > 0 && d.qty) d.qty.text += ' · ' + fmt(x.padSf) + ' SF';
      break;
    case 'site.panel': d.qty = q1(cnt(c.panel), 'EA'); d.parts = ['panel']; break;
    case 'site.disco': d.qty = q1(cnt(c.disco), 'EA'); d.parts = ['disco']; break;
    case 'site.meter': d.qty = q1(cnt(c.meter), 'EA'); d.parts = ['meter']; break;
    case 'site.jbox': d.qty = q1(cnt(c.jbox), 'EA'); d.parts = ['jbox']; break;
    case 'site.bollards': d.qty = q1(cnt(c.bollard), 'EA'); d.parts = ['bollard']; break;
    case 'site.xfmr': d.qty = ls(); d.parts = ['xfmr']; break;
    case 'controller': d.qty = q1(cnt(ctl.qty), 'EA'); d.parts = ['mgc']; break;
    case 'bess': {
      var kwh = 0, units = 0;
      (bess.rows || []).forEach(function (r) {
        if (r.nextnrgRate) return;
        kwh += num(r.kwh) * num(r.qty); units += num(r.qty);
        row(String(r.key) + (r.kwh ? ', ' + fmt(r.kwh) + ' kWh each' : ''), q1(num(r.qty), 'EA'), r.total, ['bess:' + r.key], bessSource(r, q));
      });
      if (!d.rows.length && bess.isBenchmark) {
        var fr = q.fleetRating || {};
        kwh = num(fr.kwh);
        d.note = 'Priced at the storage benchmark: no model on the drawing carries a price.';
      }
      d.qty = q1(kwh, 'kWh'); if (d.qty && units) d.qty.text += ' · ' + fmt(units) + ' EA';
      d.parts = ['bess'];
      break;
    }
    case 'nextnrg.storage': {
      var st = nn.storage || {};
      (bess.rows || []).forEach(function (r) {
        if (!r.nextnrgRate) return;
        row(String(r.key) + (r.kwh ? ', ' + fmt(r.kwh) + ' kWh each' : ''), q1(num(r.qty), 'EA'), r.total, ['bess:' + r.key], src('book', 'NextNRG’s installed price'));
      });
      d.qty = q1(num(st.kwh), 'kWh'); if (d.qty && num(st.kw) > 0) d.qty.text += ' · ' + fmt(st.kw) + ' kW';
      d.parts = ['bess'];
      break;
    }
    case 'solar':
      (sol.rows || []).forEach(function (r) {
        row(r.label, q1(num(r.kwDc), 'kW-DC'), r.total, ['solar:' + r.mount],
          r.isBenchmark ? src('benchmark', r.mount === 'canopy' ? 'The canopy structure rate' : 'The DOE/NREL Q1 2025 PV benchmark') : src('quote', 'A $/W typed on the cost sheet'));
      });
      d.qty = q1(num(sol.kwDc), 'kW-DC'); d.parts = ['solar'];
      break;
    case 'nextnrg.solar': d.qty = q1(num(nn.solarKwDc), 'kW-DC'); d.parts = ['solar:nextnrg']; break;
    case 'ev': {
      /* a row's parts are the charger items it counts, by their place in
         q.ev.items: the roll-up groups them by the same key */
      var by = ev.byModel || {}, at = {};
      ((q.ev && q.ev.items) || []).forEach(function (it, i) { it = it || {}; var k = it.key || it.evId || it.kind; (at[k] = at[k] || []).push('ev#' + i); });
      Object.keys(by).forEach(function (k) {
        var m = by[k] || {}, name = evName(k);
        row(name + (num(m.kw) > 0 && !/\d\s*kW/.test(name) ? ', ' + fmt(m.kw) + ' kW' : ''), q1(num(m.qty), 'EA'), num(m.eq) + num(m.install), at[k] || [], evSource(k, at[k] || [], out, q));
      });
      if (num(ev.futureMakeReady) > 0) row('Make-ready for future chargers', q1(num(ev.futureUnits), 'EA'), ev.futureMakeReady, ['ev:future'], src('benchmark', 'The make-ready estimate for future chargers'));
      d.qty = q1(num(ev.units), 'EA'); d.parts = ['ev'];
      break;
    }
    case 'gen': {
      /* the generators each row counts, by their place in q.gen, grouped by
         the roll-up's own class and model */
      var gat = {};
      (q.gen || []).forEach(function (sh, i) { sh = sh || {}; var cls = EC.genClass(sh), k = cls + '|' + (sh.model || sh.label || cls); (gat[k] = gat[k] || []).push('gen#' + i); });
      (gen.lines || []).forEach(function (g) {
        row(genName(g) + (g.units > 1 ? ' × ' + g.units : ''), q1(num(g.kw), 'kW'), g.cost, gat[g.cls + '|' + g.model] || [],
          g.overridden ? src('quote', 'A $/kW entered for this class') : src('benchmark', 'The EIA AEO2025 class benchmark'));
      });
      d.qty = q1(num(gen.kw), 'kW'); d.parts = ['gen'];
      break;
    }
    case 'dc':
      (dc.lines || []).forEach(function (l) { row(String(l.desc), q1(num(l.qty), 'EA'), l.amount, [], src('benchmark', 'A budgetary ROM (Eaton, April 2026): re-quote before use')); });
      d.qty = q1(num(dc.facilityKw), 'kW'); if (d.qty) d.qty.text += ' facility';
      d.parts = ['dc'];
      break;
    case 'omegaCore':
      (oc.breakdown || []).forEach(function (b) { row(String(b.label), q1(num(oc.skids), 'EA'), b.total, [], src('book', 'The skid’s recorded price')); });
      d.qty = q1(num(oc.skids), 'EA'); d.parts = ['omegaCore'];
      break;
    case 'compute':
      d.qty = q1(num(comp.pods), 'EA'); if (d.qty && num(comp.mw) > 0) d.qty.text += ' · ' + fmt(comp.mw) + ' MW';
      d.parts = ['compute'];
      break;
    case 'bnz': d.qty = ls(); d.parts = ['envelope']; break;
    default:
      d.qty = ls();
  }
  return d;
}

/* What the Run does not price but the trade should see: the conduit on the
   BOM (the Cost tab's own conduit schedule, a row per run type), the trench
   and the fence the drawing measures, the utility's own charges. */
function outside(out, q, x) {
  var L = out.lines || {}, cond = L.conduit || {}, info = { civil: [], electrical: [], utility: [] }, ugFt = 0;
  (cond.schedule || []).forEach(function (r) {
    if (r.type === 'PVC-UG') ugFt = num(r.ft);
    var bom = Math.round(num(r.total) * 100);
    info.electrical.push({ key: 'conduit:' + r.type, label: (CONDUIT[r.type] || r.type) + ' (' + r.size + ')', qty: q1(num(r.ft), 'LF'),
      bomCents: bom, bom: bom / 100, note: 'In the installed prices: on the BOM, not added to the Run total.', parts: ['conduit:' + r.type] });
  });
  if (x.trenchFt > 0) info.civil.push({ key: 'trench', label: 'Trench', qty: q1(x.trenchFt, 'LF'), bomCents: null, bom: null,
    note: 'Dug for the underground conduit: the Run prices the conduit, not the trench.', parts: ['trench'] });
  else if (ugFt > 0) info.civil.push({ key: 'trench', label: 'Trench, along the underground conduit', qty: q1(ugFt, 'LF'), bomCents: null, bom: null,
    note: 'No trench drawn: the underground conduit’s length. The Run prices the conduit, not the trench.', parts: ['conduit:PVC-UG'] });
  if (x.fenceFt > 0) info.civil.push({ key: 'fence', label: 'Fence', qty: q1(x.fenceFt, 'LF'), bomCents: null, bom: null, note: 'Drawn, not priced in the Run.', parts: ['fence'] });
  info.utility.push({ key: 'utility', label: 'Utility interconnection', qty: null, bomCents: null, bom: null, note: 'The utility’s own charges are not in the Run.', parts: [] });
  return info;
}

/* The trade's headline quantity: the one a contractor sizes the trade by,
   saying what it measures when the trade's money is not all of it. */
function headline(key, lines, info) {
  function total(list, unit, k) { var t = 0; list.forEach(function (l) { if (l.qty && l.qty.unit === unit && (!k || k.test(l.key))) t += l.qty.qty; }); return t; }
  function said(q, what) { if (q) q.text += ' ' + what; return q; }
  switch (key) {
    case 'civil': return said(q1(total(info, 'LF', /^trench$/), 'LF'), 'of trench') || said(q1(total(lines, 'EA', /^site\.bollards$/), 'EA'), 'bollards');
    case 'concrete': return said(q1(total(lines, 'EA'), 'EA'), 'pads');
    case 'electrical': return said(q1(total(info, 'LF', /^conduit:/), 'LF'), 'of conduit');
    case 'storage': return q1(total(lines, 'kWh'), 'kWh');
    case 'solar': return q1(total(lines, 'kW-DC'), 'kW-DC');
    case 'ev': return said(q1(total(lines, 'EA'), 'EA'), 'chargers');
    case 'generation': return q1(total(lines, 'kW'), 'kW');
    case 'compute': return said(q1(total(lines, 'EA'), 'EA'), 'pods and skids');
    default: return null;
  }
}

/* takeoff(out, q, extra): `out` is editor-cost rollup(q), `q` the
   quantities it ran on, `extra` what the drawing measures (cleaned here). */
function takeoff(out, q, extra) {
  out = out || {}; q = q || {};
  var x = clean(extra), mo = BS.money(out), info = outside(out, q, x), byTrade = {}, byKind = {};
  mo.lines.forEach(function (l) {
    var t = LINE[l.key] && LINE[l.key][0];
    if (!t) throw new Error('takeoff: the Run’s line ' + l.key + ' has no trade');
    var d = detail(l.key, out, q, x), rows = [];
    var weights = d.rows.map(function (r) { return Math.max(0, r.weight); }), wsum = weights.reduce(function (s, w) { return s + w; }, 0);
    var contracted = mo.spread === 'contracted', cs = src('quote', 'The contracted total, split by the estimate’s shares');
    if (d.rows.length && wsum > 0) {
      var rc = BS.apportion(weights.map(function (w) { return w / wsum * l.cents; }), l.cents);
      rows = d.rows.map(function (r, i) { return { label: r.label, qty: r.qty, cents: rc[i], amount: rc[i] / 100, parts: r.parts, source: contracted ? cs : (r.source || lineSource(l.key, out, q)) }; });
    }
    var kinds = rows.map(function (r) { return r.source.kind; }).filter(function (k, i, a) { return a.indexOf(k) === i; });
    var bases = rows.map(function (r) { return r.source.basis; }).filter(function (k, i, a) { return a.indexOf(k) === i; });
    var source = contracted ? cs : !rows.length ? lineSource(l.key, out, q)
      : kinds.length > 1 ? src('mixed', 'See each row') : bases.length > 1 ? src(kinds[0], 'See each row') : rows[0].source;
    (rows.length ? rows : [{ cents: l.cents, source: source }]).forEach(function (r) { byKind[r.source.kind] = (byKind[r.source.kind] || 0) + r.cents; });
    var parts = [];
    d.rows.forEach(function (r) { r.parts.forEach(function (p) { if (parts.indexOf(p) < 0) parts.push(p); }); });
    var item = { key: l.key, label: LINE[l.key][1], qty: d.qty || null, cents: l.cents, amount: l.cents / 100, contingency: !!(l.contingent && mo.contPct > 0),
      parts: parts.length ? parts : d.parts, rows: rows, source: source };
    if (d.note) item.note = d.note;
    (byTrade[t] = byTrade[t] || []).push(item);
  });

  var trades = [];
  TRADES.forEach(function (t) {
    var ls2 = byTrade[t.key] || [], inf = info[t.key] || [];
    if (!ls2.length && !inf.length) return;
    if (t.key === 'utility' && !ls2.length && !mo.cents) return;   /* nothing priced yet: no trade to carve out */
    var cents = ls2.reduce(function (s, l) { return s + l.cents; }, 0);
    var tr = { key: t.key, label: t.label, div: t.div, cents: cents, amount: cents / 100, pct: mo.cents > 0 ? Math.round(cents / mo.cents * 1000) / 10 : 0,
      qty: headline(t.key, ls2, inf), lines: ls2, info: inf };
    if (!ls2.length) tr.notes = ['No line of the Run’s is this trade’s: ' + (t.key === 'utility' ? 'the utility bills its own work.' : 'what is drawn here is not priced in the Run.')];
    trades.push(tr);
  });
  var notes = mo.spread === 'contracted' ? ['The contracted cost is spread over the trades by the estimate’s shares.']
    : mo.spread === 'contracted-whole' ? ['The contracted cost is not split: nothing on the drawing is priced to split it by.']
    : !mo.cents ? ['Nothing priceable is placed yet.'] : [];
  var sources = KINDS.filter(function (k) { return byKind[k] > 0; }).map(function (k) {
    return { kind: k, cents: byKind[k], amount: byKind[k] / 100, pct: mo.cents > 0 ? Math.round(byKind[k] / mo.cents * 1000) / 10 : 0 };
  });
  return { ok: true, version: VERSION, total: mo.total, cents: mo.cents, contPct: mo.contPct, contracted: mo.contracted, spread: mo.spread,
    notes: notes, trades: trades, sources: sources };
}

module.exports = { VERSION: VERSION, TRADES: TRADES, TRADE_KEYS: TRADE_KEYS, LINE: LINE, CONDUIT: CONDUIT, KINDS: KINDS, clean: clean, takeoff: takeoff };
