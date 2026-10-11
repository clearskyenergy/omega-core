/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/iqgen.js — the IQGEN compute system economics workbook
   as a HARDWARE-SPECIFIC assumption set option (Phase 4)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE, read-only. Recognised by its sheets (Revenue Model, Chipset Library,
   Dynamic Cash Flow). Produces ONE assumption set, kind 'iqgen-hardware-v1',
   every value with its sheet!cell. It sits ALONGSIDE the WB2 legacy shared
   assumptions; it never replaces them, so legacy parity is unaffected.
   Market prices in it are a dated public reference snapshot, not contracted
   offtake; formula error cells (#VALUE! etc.) are reported, not used.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var SHEETS = ['Revenue Model', 'Chipset Library', 'Dynamic Cash Flow'];
function text(v) { return String(v == null ? '' : v).trim(); }
function num(v) { var s = text(v); if (s === '' || /^#/.test(s)) return null; var n = Number(s.replace(/[$,]/g, '')); return isFinite(n) ? n : null; }
function detect(names) { return SHEETS.every(function (s) { return names.indexOf(s) >= 0; }); }
function pairs(rows, labelCol, valueCol, sheet, letter) { var o = {}; rows.forEach(function (r) { var l = text(r.cells[labelCol]); if (!l) return; var raw = r.cells[valueCol]; o[l] = { value: num(raw) != null ? num(raw) : (text(raw) || null), cell: sheet + '!' + letter + r.r, error: /^#/.test(text(raw)) || undefined }; }); return o; }
function parse(grids, opts) {
  opts = opts || {};
  var rm = grids['Revenue Model'].rows, cl = grids['Chipset Library'].rows, dc = grids['Dynamic Cash Flow'].rows, errors = [];
  var rIn = pairs(rm.filter(function (r) { return r.r >= 5 && r.r <= 20; }), 0, 1, 'Revenue Model', 'B'), rSel = pairs(rm.filter(function (r) { return r.r >= 5 && r.r <= 20; }), 4, 5, 'Revenue Model', 'F');
  var dIn = pairs(dc.filter(function (r) { return r.r >= 5 && r.r <= 22; }), 0, 1, 'Dynamic Cash Flow', 'B'), dCfg = pairs(dc.filter(function (r) { return r.r >= 5 && r.r <= 19; }), 4, 5, 'Dynamic Cash Flow', 'F');
  [rIn, rSel, dIn, dCfg].forEach(function (o) { Object.keys(o).forEach(function (k) { if (o[k].error) errors.push(o[k].cell); }); });
  dc.forEach(function (r) { r.cells.forEach(function (c, i) { if (/^#(VALUE|REF|DIV\/0|N\/A|NAME|NUM)/.test(text(c))) { var cell = 'Dynamic Cash Flow!' + String.fromCharCode(65 + Math.min(i, 25)) + r.r; if (errors.indexOf(cell) < 0) errors.push(cell); } }); });
  var hi = -1; cl.forEach(function (r, i) { if (hi < 0 && /chipset/i.test(text(r.cells[0])) && /node power/i.test(r.cells.map(text).join('|'))) hi = i; });
  var chipsets = [];
  if (hi >= 0) for (var i = hi + 1; i < cl.length; i++) { var c = cl[i].cells, n = text(c[0]); if (!n || cl[i].r !== cl[i - 1].r + 1) break; chipsets.push({ name: n.slice(0, 80), gpusPerNode: num(c[1]), vramGb: num(c[2]), nodeKw: num(c[3]), onDemandPerNodeHr: num(c[4]), spotPerNodeHr: num(c[5]), source: 'Chipset Library!A' + cl[i].r + ':F' + cl[i].r }); }
  function v(o, k) { return o[k] ? o[k].value : null; }
  return {
    kind: 'iqgen-hardware-v1', label: 'IQGEN hardware-specific compute economics', file: opts.file || null,
    itCeilingKw: v(rIn, 'IT load available (kW)'), reservedOverhead: v(rIn, 'Reserved IT overhead'), pue: v(rIn, 'PUE'), utilization: v(rIn, 'Sell-through utilization'), uptime: v(rIn, 'Technical uptime'),
    pricingBasis: v(rIn, 'Pricing basis'), selectedChipset: v(rIn, 'Chipset / platform'), capexLow: v(rSel, 'CAPEX Low'), capexMid: v(rSel, 'CAPEX Midpoint'), capexHigh: v(rSel, 'CAPEX High'),
    cashFlowCase: { chipset: v(dIn, 'Selected chipset'), capexConfiguration: v(dCfg, 'CAPEX configuration'), capexCase: v(dCfg, 'CAPEX case'), pricingBasis: v(dCfg, 'Pricing basis'), selectedCapex: v(dCfg, 'Selected project CAPEX'), electricityPrice: v(dIn, 'Electricity cost ($/kWh)'), residualPct: v(dIn, 'Residual value (% initial CAPEX)') },
    chipsets: chipsets, inputs: { revenueModel: rIn, selected: rSel, cashFlow: dIn, capexConfig: dCfg }, formulaErrors: errors,
    caveats: ['Market GPU prices are a public reference snapshot, not contracted offtake.', 'The workbook\'s levered/debt case is not imported; scenarios here are unlevered unless financing terms are entered.', errors.length ? 'The workbook contains formula error cells; those values are excluded.' : null].filter(Boolean)
  };
}
module.exports = { SHEETS: SHEETS, detect: detect, parse: parse };
