/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   A SAMPLE plan set and the reader's answer for it, for the plan-set reader's
   tests and its render check (scripts/tests/tplanread.js,
   scripts/render-plan-read.js). Nothing in it is a real project: the address,
   the companies and the models are made up, every sheet says SAMPLE — NOT FOR
   CONSTRUCTION, and the utility is named only because a plan set names one.

   build() draws three ARCH D sheets with pdf-lib in vector text, so pdf.js
   finds a real text layer, as it does on a CAD-plotted set:
     E-001  cover: the project summary (the facts)
     E-101  site plan: the equipment where it stands, a trench, a fence
     E-601  single-line and the equipment schedule
   answers[page] is what the model returns for that page, in the schema's own
   shape, each box measured from where build() drew the words, so the review
   panel's crops show the right place. Two things in it are deliberate:
   the cover says 1,200 kWh and the schedule 1,290 kWh (a disagreement the
   cross-check must show), and JB-1 is read from a symbol at low confidence
   (left unticked). */
'use strict';
var path = require('path');
var PDF = require(path.join(__dirname, '..', '..', 'vendor', 'pdf-lib', '1.17.1', 'pdf-lib.min.js'));
var W = 2592, H = 1728;   /* ARCH D, 36 x 24 in, in points */

function sheetDrawer(page, font, bold, marks) {
  var ink = PDF.rgb(0.08, 0.08, 0.1), grey = PDF.rgb(0.45, 0.45, 0.5);
  function text(key, s, x, y, size, opts) {
    opts = opts || {};
    var f = opts.bold ? bold : font;
    page.drawText(s, { x: x, y: y, size: size, font: f, color: opts.grey ? grey : ink });
    var w = f.widthOfTextAtSize(s, size);
    if (key) marks[key] = { x: x / W, y: 1 - (y + size) / H, w: w / W, h: (size * 1.35) / H };
    return w;
  }
  function rect(x, y, w, h, opts) {
    opts = opts || {};
    page.drawRectangle({ x: x, y: y, width: w, height: h, borderColor: ink, borderWidth: opts.weight || 2, color: opts.fill ? PDF.rgb(0.93, 0.94, 0.96) : undefined, borderDashArray: opts.dash });
  }
  function mark(key, x1, y, x2, size) { marks[key] = { x: x1 / W, y: 1 - (y + size) / H, w: (x2 - x1) / W, h: (size * 1.35) / H }; }
  function line(x1, y1, x2, y2, opts) { opts = opts || {}; page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: opts.weight || 2, color: ink, dashArray: opts.dash }); }
  return { text: text, rect: rect, line: line, mark: mark };
}
function frame(d, number, title, scale) {
  d.rect(36, 36, W - 72, H - 72, { weight: 4 });
  d.rect(W - 420, 36, 384, H - 72, { weight: 3 });
  d.text(null, 'SAMPLE PLAN SET', W - 400, H - 110, 26, { bold: true });
  d.text(null, 'NOT FOR CONSTRUCTION', W - 400, H - 146, 22, { bold: true });
  d.text(null, 'OMEGA plan-reader fixture.', W - 400, H - 190, 16, { grey: true });
  d.text(null, 'Every name and figure is made up.', W - 400, H - 214, 16, { grey: true });
  d.line(W - 420, 330, W - 36, 330, { weight: 3 });
  d.text('sheet_title', title, W - 400, 280, 24, { bold: true });
  d.text('sheet_scale', 'SCALE: ' + scale, W - 400, 230, 18);
  d.text('sheet_rev', 'REV 0  ISSUED FOR REVIEW', W - 400, 196, 18);
  d.text('sheet_number', number, W - 400, 90, 72, { bold: true });
}

function cover(d) {
  frame(d, 'E-001', 'COVER SHEET', 'NTS');
  d.text('title', '1200 EXAMPLE AVENUE  -  SOLAR + STORAGE + EV CHARGING', 120, H - 200, 48, { bold: true });
  d.text(null, 'PROJECT SUMMARY', 120, H - 320, 30, { bold: true });
  var rows = [
    ['project_name', 'PROJECT:', 'EXAMPLE LOGISTICS CENTER'],
    ['site_address', 'SITE ADDRESS:', '1200 EXAMPLE AVE, NAPERVILLE, IL 60563'],
    ['utility', 'UTILITY:', 'COMMONWEALTH EDISON (COMED)'],
    ['ahj', 'AHJ:', 'CITY OF NAPERVILLE'],
    ['service', 'ELECTRICAL SERVICE:', '480Y/277V 3PH 4W, 800A'],
    ['pv', 'PV SYSTEM:', '315 kW-DC / 250 kW-AC'],
    ['modules', 'PV MODULES:', '(572) 550W MONO PERC MODULES'],
    ['bess', 'ENERGY STORAGE:', '300 kW / 1,200 kWh LITHIUM IRON PHOSPHATE'],
    ['ev', 'EV CHARGING:', '(8) LEVEL 2 19.2 kW, (2) DCFC 180 kW'],
    ['interconnection', 'INTERCONNECTION:', 'SUPPLY-SIDE CONNECTION AHEAD OF MAIN'],
    ['xfmr', 'SERVICE TRANSFORMER:', '500 kVA PAD-MOUNT BY UTILITY']
  ];
  rows.forEach(function (r, i) {
    var y = H - 400 - i * 56;
    var wl = d.text(null, r[1], 140, y, 26, { bold: true });
    var wv = d.text(null, r[2], 140 + wl + 14, y, 26);
    d.mark('c_' + r[0], 140, y, 140 + wl + 14 + wv, 26);   /* the quote spans the label and the value */
  });
  d.text(null, 'SHEET INDEX', 1400, H - 320, 30, { bold: true });
  ['E-001  COVER SHEET', 'E-101  SITE PLAN', 'E-601  ONE-LINE AND SCHEDULES'].forEach(function (s, i) { d.text(null, s, 1420, H - 400 - i * 52, 26); });
  d.text(null, 'GENERAL NOTES', 1400, 760, 30, { bold: true });
  ['1. ALL WORK PER NEC 2023 AND LOCAL AMENDMENTS.', '2. ESS INSTALLATION PER NFPA 855.', '3. UTILITY TRANSFORMER AND METER BY COMED.'].forEach(function (s, i) { d.text(null, s, 1420, 690 - i * 48, 24); });
}

function site(d) {
  frame(d, 'E-101', 'SITE PLAN', '1" = 20\'-0"');
  d.rect(220, 900, 1100, 560, { weight: 4 });
  d.text('bldg', 'EXISTING WAREHOUSE (ROOF ARRAY ABOVE)', 360, 1180, 30, { bold: true });
  d.rect(300, 980, 940, 400, { dash: [18, 10] });
  d.text('pv', 'PV ARRAY A - ROOF MOUNT 315 kW-DC (572 MODULES)', 330, 1000, 24);
  /* the ESS yard, fenced */
  d.rect(1500, 980, 560, 420, { dash: [6, 6] });
  d.text('fence', "6' CHAIN LINK FENCE, 160 LF", 1510, 1410, 22);
  d.rect(1560, 1180, 340, 120, { fill: true });
  d.text('ess', 'ESS-1  300 kW / 1,290 kWh', 1570, 1230, 24, { bold: true });
  d.rect(1560, 1020, 140, 110, { fill: true });
  d.text('t1', 'T-1  500 kVA', 1566, 1060, 22, { bold: true });
  d.rect(1760, 1020, 120, 110, { fill: true });
  d.text('msb', 'MSB 800A', 1770, 1060, 22, { bold: true });
  d.rect(1910, 1040, 60, 60);
  d.text('disc', 'DISC-1', 1900, 1110, 20, { bold: true });
  d.rect(1990, 1040, 50, 50);
  d.text('meter', 'M-1', 1992, 1100, 20, { bold: true });
  d.rect(1640, 1338, 26, 26);
  d.text('jb', 'JB', 1672, 1342, 16, { grey: true });
  /* parking and chargers */
  d.text(null, 'PARKING', 300, 820, 30, { bold: true });
  for (var i = 0; i < 8; i++) { d.rect(300 + i * 110, 560, 90, 220); d.rect(330 + i * 110, 790, 30, 30, { fill: true }); }
  d.text('l2', 'EV-1 THRU EV-8: LEVEL 2 CHARGERS (SEE E-601)', 300, 500, 24, { bold: true });
  d.rect(1300, 560, 120, 220); d.rect(1460, 560, 120, 220);
  d.rect(1340, 790, 40, 40, { fill: true }); d.rect(1500, 790, 40, 40, { fill: true });
  d.text('dcfc', 'DC-1, DC-2: DC FAST CHARGERS', 1290, 500, 24, { bold: true });
  d.line(1620, 980, 1620, 860, { dash: [20, 12], weight: 4 }); d.line(1620, 860, 600, 860, { dash: [20, 12], weight: 4 });
  d.text('trench', 'NEW TRENCH, 240 LF (SEE E-601 FOR CONDUIT)', 900, 870, 22);
  d.text(null, 'N', 2080, 1550, 40, { bold: true });
}

function oneLine(d) {
  frame(d, 'E-601', 'ONE-LINE AND SCHEDULES', 'NTS');
  d.text(null, 'SINGLE-LINE DIAGRAM', 120, H - 160, 32, { bold: true });
  var boxes = [['UTILITY', 160], ['M-1', 420], ['T-1 500 kVA', 680], ['MSB 800A', 960], ['DISC-1', 1240], ['ESS-1', 1500]];
  boxes.forEach(function (b, i) {
    d.rect(b[1], H - 330, 200, 90);
    d.text(null, b[0], b[1] + 20, H - 295, 22, { bold: true });
    if (i) d.line(boxes[i - 1][1] + 200, H - 285, b[1], H - 285, { weight: 3 });
  });
  d.text('sld_bess', 'ESS-1: 300 kW / 1,290 kWh AC-COUPLED, 480V', 1460, H - 380, 22);
  d.text('sld_service', 'SERVICE: 480Y/277V 3PH 4W, 800A MAIN BREAKER', 160, H - 380, 22);
  d.text(null, 'EQUIPMENT SCHEDULE', 120, 1140, 32, { bold: true });
  var cols = [120, 340, 900, 1260, 1560, 1900], head = ['TAG', 'DESCRIPTION', 'MANUFACTURER', 'MODEL', 'RATING', 'QTY'];
  head.forEach(function (h, i) { d.text(null, h, cols[i], 1080, 22, { bold: true }); });
  d.line(110, 1068, 2100, 1068);
  var rows = [
    ['s_ess', 'ESS-1', 'BATTERY ENERGY STORAGE SYSTEM', 'EXAMPLE STORAGE CO', 'XS-1290', '300 kW / 1,290 kWh', '1'],
    ['s_t1', 'T-1', 'PAD-MOUNT TRANSFORMER 480Y/277V', 'BY UTILITY', '-', '500 kVA', '1'],
    ['s_msb', 'MSB', 'MAIN SWITCHBOARD', 'EXAMPLE GEAR', 'SB-800', '800A, 480Y/277V', '1'],
    ['s_disc', 'DISC-1', 'AC DISCONNECT, FUSED, NEMA 3R', 'EXAMPLE GEAR', 'FD-400', '400A, 600V', '1'],
    ['s_inv', 'INV-1, INV-2', 'PV STRING INVERTER', 'EXAMPLE SOLAR', 'XS-125', '125 kW', '2'],
    ['s_l2', 'EV-1 - EV-8', 'LEVEL 2 CHARGER, DUAL PORT', 'EXAMPLE EV', 'L2-192', '19.2 kW', '8'],
    ['s_dc', 'DC-1, DC-2', 'DC FAST CHARGER', 'EXAMPLE EV', 'DC-180', '180 kW', '2'],
    ['s_m1', 'M-1', 'UTILITY REVENUE METER', 'BY UTILITY', '-', '-', '1']
  ];
  rows.forEach(function (r, i) {
    var y = 1020 - i * 54, end = 0;
    for (var c = 1; c < r.length; c++) end = cols[c - 1] + d.text(null, r[c], cols[c - 1], y, 22);
    d.mark(r[0] + '_row', cols[0], y, end, 22);   /* the schedule row is one quote */
  });
  d.text(null, 'CONDUIT SCHEDULE', 120, 520, 32, { bold: true });
  d.text('c1', 'C-1: (3) 4" PVC SCH 40, ESS-1 TO MSB, 240 LF IN NEW TRENCH', 140, 460, 22);
}

async function build() {
  var doc = await PDF.PDFDocument.create(), font = await doc.embedFont(PDF.StandardFonts.Helvetica), bold = await doc.embedFont(PDF.StandardFonts.HelveticaBold);
  doc.setTitle('SAMPLE plan set — not for construction'); doc.setProducer('OMEGA plan-reader fixture');
  var marks = { 1: {}, 2: {}, 3: {} };
  [cover, site, oneLine].forEach(function (draw, i) { var page = doc.addPage([W, H]); draw(sheetDrawer(page, font, bold, marks[i + 1])); });
  return { bytes: await doc.save(), marks: marks };
}

/* What the model returns, page by page (the schema's own shape). */
function answers(marks) {
  function m(p, k) { return marks[p][k] || null; }
  function item(p, k, o) {
    return Object.assign({ kind: 'other', tag: null, description: '', manufacturer: null, model: null, kw: null, kwh: null, kva: null, amps: null, voltage: null,
      quantity: null, length_ft: null, box: m(p, k), source: 'drawing', quote: '', confidence: 'high' }, o);
  }
  function fact(p, k, key, o) { return Object.assign({ key: key, text: null, number: null, box: m(p, k), quote: '', confidence: 'high' }, o); }
  function sheet(p, number, title, discipline, scale) { return { number: number, title: title, discipline: discipline, scale: scale, revision: '0' }; }
  return {
    1: { sheet: sheet(1, 'E-001', 'COVER SHEET', 'title', 'NTS'), items: [], notes: ['Service transformer and meter are by the utility.'], unreadable: null,
      facts: [
        fact(1, 'c_project_name', 'project_name', { text: 'Example Logistics Center', quote: 'PROJECT: EXAMPLE LOGISTICS CENTER' }),
        fact(1, 'c_site_address', 'site_address', { text: '1200 Example Ave, Naperville, IL 60563', quote: 'SITE ADDRESS: 1200 EXAMPLE AVE, NAPERVILLE, IL 60563' }),
        fact(1, 'c_utility', 'utility', { text: 'Commonwealth Edison (ComEd)', quote: 'UTILITY: COMMONWEALTH EDISON (COMED)' }),
        fact(1, 'c_ahj', 'ahj', { text: 'City of Naperville', quote: 'AHJ: CITY OF NAPERVILLE' }),
        fact(1, 'c_service', 'service_voltage', { text: '480Y/277V 3PH 4W', quote: 'ELECTRICAL SERVICE: 480Y/277V 3PH 4W, 800A' }),
        fact(1, 'c_service', 'service_amps', { number: 800, quote: 'ELECTRICAL SERVICE: 480Y/277V 3PH 4W, 800A' }),
        fact(1, 'c_pv', 'pv_kw_dc', { number: 315, quote: 'PV SYSTEM: 315 kW-DC / 250 kW-AC' }),
        fact(1, 'c_pv', 'pv_kw_ac', { number: 250, quote: 'PV SYSTEM: 315 kW-DC / 250 kW-AC' }),
        fact(1, 'c_modules', 'pv_module_count', { number: 572, quote: 'PV MODULES: (572) 550W MONO PERC MODULES' }),
        fact(1, 'c_modules', 'pv_module_watts', { number: 550, quote: 'PV MODULES: (572) 550W MONO PERC MODULES' }),
        fact(1, 'c_bess', 'bess_kw', { number: 300, quote: 'ENERGY STORAGE: 300 kW / 1,200 kWh LITHIUM IRON PHOSPHATE' }),
        fact(1, 'c_bess', 'bess_kwh', { number: 1200, quote: 'ENERGY STORAGE: 300 kW / 1,200 kWh LITHIUM IRON PHOSPHATE' }),
        fact(1, 'c_ev', 'ev_charger_count', { number: 10, quote: 'EV CHARGING: (8) LEVEL 2 19.2 kW, (2) DCFC 180 kW' }),
        fact(1, 'c_interconnection', 'interconnection', { text: 'Supply-side connection ahead of main', quote: 'INTERCONNECTION: SUPPLY-SIDE CONNECTION AHEAD OF MAIN' }),
        fact(1, 'c_xfmr', 'transformer_kva', { number: 500, quote: 'SERVICE TRANSFORMER: 500 kVA PAD-MOUNT BY UTILITY' })
      ] },
    2: { sheet: sheet(2, 'E-101', 'SITE PLAN', 'site', '1" = 20\'-0"'), facts: [], notes: [], unreadable: null,
      items: [
        item(2, 'ess', { kind: 'bess', tag: 'ESS-1', description: 'Battery storage container in the fenced yard', kw: 300, kwh: 1290, quote: 'ESS-1  300 kW / 1,290 kWh' }),
        item(2, 't1', { kind: 'transformer', tag: 'T-1', description: 'Pad-mount transformer', kva: 500, quote: 'T-1  500 kVA' }),
        item(2, 'msb', { kind: 'switchgear', tag: 'MSB', description: 'Main switchboard', amps: 800, quote: 'MSB 800A' }),
        item(2, 'disc', { kind: 'disconnect', tag: 'DISC-1', description: 'AC disconnect', quote: 'DISC-1' }),
        item(2, 'meter', { kind: 'meter', tag: 'M-1', description: 'Utility revenue meter', quote: 'M-1' }),
        item(2, 'jb', { kind: 'junction_box', tag: null, description: 'Small box beside the battery, likely a junction box', quote: 'JB', confidence: 'low' }),
        item(2, 'pv', { kind: 'solar_array', tag: 'PV ARRAY A', description: 'Roof-mount array on the warehouse', kw: 315, quote: 'PV ARRAY A - ROOF MOUNT 315 kW-DC (572 MODULES)' }),
        item(2, 'l2', { kind: 'ev_charger', tag: 'EV-1 THRU EV-8', description: 'Level 2 chargers along the parking row', quantity: 8, quote: 'EV-1 THRU EV-8: LEVEL 2 CHARGERS (SEE E-601)', confidence: 'medium' }),
        item(2, 'dcfc', { kind: 'ev_charger', tag: 'DC-1, DC-2', description: 'DC fast chargers', quantity: 2, quote: 'DC-1, DC-2: DC FAST CHARGERS', confidence: 'medium' }),
        item(2, 'trench', { kind: 'trench', tag: null, description: 'New trench from the yard to the parking row', length_ft: 240, quote: 'NEW TRENCH, 240 LF (SEE E-601 FOR CONDUIT)' }),
        item(2, 'fence', { kind: 'fence', tag: null, description: 'Chain link fence around the storage yard', length_ft: 160, quote: "6' CHAIN LINK FENCE, 160 LF" })
      ] },
    3: { sheet: sheet(3, 'E-601', 'ONE-LINE AND SCHEDULES', 'electrical', 'NTS'), unreadable: null,
      notes: ['The battery reads 1,290 kWh here and 1,200 kWh on the cover.'],
      facts: [
        fact(3, 'sld_bess', 'bess_kwh', { number: 1290, quote: 'ESS-1: 300 kW / 1,290 kWh AC-COUPLED, 480V' }),
        fact(3, 'sld_bess', 'bess_kw', { number: 300, quote: 'ESS-1: 300 kW / 1,290 kWh AC-COUPLED, 480V' }),
        fact(3, 'sld_service', 'service_voltage', { text: '480Y/277V 3PH 4W', quote: 'SERVICE: 480Y/277V 3PH 4W, 800A MAIN BREAKER' }),
        fact(3, 'sld_service', 'main_breaker_amps', { number: 800, quote: 'SERVICE: 480Y/277V 3PH 4W, 800A MAIN BREAKER' })
      ],
      items: [
        item(3, 's_ess_row', { kind: 'bess', tag: 'ESS-1', description: 'Battery energy storage system', manufacturer: 'Example Storage Co', model: 'XS-1290', kw: 300, kwh: 1290, voltage: '480V', quantity: 1, source: 'schedule', quote: 'ESS-1  BATTERY ENERGY STORAGE SYSTEM  EXAMPLE STORAGE CO  XS-1290  300 kW / 1,290 kWh  1' }),
        item(3, 's_t1_row', { kind: 'transformer', tag: 'T-1', description: 'Pad-mount transformer, by utility', kva: 500, voltage: '480Y/277V', quantity: 1, source: 'schedule', quote: 'T-1  PAD-MOUNT TRANSFORMER 480Y/277V  BY UTILITY  -  500 kVA  1' }),
        item(3, 's_msb_row', { kind: 'switchgear', tag: 'MSB', description: 'Main switchboard', manufacturer: 'Example Gear', model: 'SB-800', amps: 800, voltage: '480Y/277V', quantity: 1, source: 'schedule', quote: 'MSB  MAIN SWITCHBOARD  EXAMPLE GEAR  SB-800  800A, 480Y/277V  1' }),
        item(3, 's_disc_row', { kind: 'disconnect', tag: 'DISC-1', description: 'Fused AC disconnect, NEMA 3R', manufacturer: 'Example Gear', model: 'FD-400', amps: 400, voltage: '600V', quantity: 1, source: 'schedule', quote: 'DISC-1  AC DISCONNECT, FUSED, NEMA 3R  EXAMPLE GEAR  FD-400  400A, 600V  1' }),
        item(3, 's_inv_row', { kind: 'inverter', tag: 'INV-1, INV-2', description: 'PV string inverters', manufacturer: 'Example Solar', model: 'XS-125', kw: 125, quantity: 2, source: 'schedule', quote: 'INV-1, INV-2  PV STRING INVERTER  EXAMPLE SOLAR  XS-125  125 kW  2' }),
        item(3, 's_l2_row', { kind: 'ev_charger', tag: 'EV-1 THRU EV-8', description: 'Level 2 charger, dual port', manufacturer: 'Example EV', model: 'L2-192', kw: 19.2, quantity: 8, source: 'schedule', quote: 'EV-1 - EV-8  LEVEL 2 CHARGER, DUAL PORT  EXAMPLE EV  L2-192  19.2 kW  8' }),
        item(3, 's_dc_row', { kind: 'ev_charger', tag: 'DC-1, DC-2', description: 'DC fast charger', manufacturer: 'Example EV', model: 'DC-180', kw: 180, quantity: 2, source: 'schedule', quote: 'DC-1, DC-2  DC FAST CHARGER  EXAMPLE EV  DC-180  180 kW  2' }),
        item(3, 's_m1_row', { kind: 'meter', tag: 'M-1', description: 'Utility revenue meter, by utility', quantity: 1, source: 'schedule', quote: 'M-1  UTILITY REVENUE METER  BY UTILITY  -  -  1' }),
        item(3, 'c1', { kind: 'conduit_run', tag: 'C-1', description: 'Three 4 in PVC conduits, ESS-1 to MSB', length_ft: 240, quantity: 3, source: 'schedule', quote: 'C-1: (3) 4" PVC SCH 40, ESS-1 TO MSB, 240 LF IN NEW TRENCH' })
      ] }
  };
}

module.exports = { build: build, answers: answers, W: W, H: H };
