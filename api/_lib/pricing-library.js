/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The preview price book. Every figure is a number read from a public
   source, with the publication and the day it was read. A line with no
   such number is status 'needs source' and is never given a price here.
   Nothing in this file is the live Site Map or Prime total. */
'use strict';

var VERSION = '2026.10';
var READ = '2026-10-18';

/* DOE / national-lab Q1 2025 PV System Cost Model, PV-only modeled market
   price. Points are DOE Table 2 (2024 USD). Ranges are the MMP comments in
   the Q1 2025 PVSCM text files (program date 13 November 2025). The utility
   file's high is $1.115/Wdc; Table 2 rounds that benchmark to $1.12/Wdc, so
   the cited band runs to the table. */
var PV = {
  utility: {
    id: 'pv.utility.mmp', usdPerWdc: 1.12, low: 0.981, high: 1.12,
    size: '100 MWdc single-axis, representative of 50–200 MWdc',
    omPerKwDcYr: 20
  },
  commercial: {
    id: 'pv.commercial.mmp', usdPerWdc: 1.98, low: 1.435, high: 2.093,
    size: '250 kWdc rooftop, representative of 125–500 kWdc',
    omPerKwDcYr: 40, ilr: 1.20
  },
  residential: {
    id: 'pv.residential.mmp', usdPerWdc: 2.95, low: 2.319, high: 3.248,
    size: '8 kWdc rooftop, representative of 4–16 kWdc',
    omPerKwDcYr: 34, ilr: 1.14
  }
};

/* Cole, Ramasamy, et al., Cost Projections for Utility-Scale Battery
   Storage: 2025 Update. NREL, 2025. https://docs.nrel.gov/docs/fy25osti/93281.pdf
   2024 overnight capital cost, 2024$. The energy and power split is the
   paper's own: $241/kWh and $372/kW ($379/kW fit, minus $7/kW so a 4-hour
   system is exactly $334/kWh). Table 2's 2025 low and high are the
   near-term band around that point. */
var BESS = {
  id: 'bess.utility.4h',
  energyPerKwh: 241,
  powerPerKw: 372,
  pointPerKwh: 334,
  hours: 4,
  lowPerKwh: 295,
  highPerKwh: 350,
  dollarYear: 2024,
  lifetimeYears: 15,
  rte: 0.85,
  vom: 0
};

var SRC = {
  pv: {
    title: 'U.S. Department of Energy, Solar Photovoltaic System Cost Benchmarks, Q1 2025, Table 2 (PV-only modeled market price, 2024 USD)',
    url: 'https://www.energy.gov/cmei/systems/solar-photovoltaic-system-cost-benchmarks',
    file: 'https://data.nlr.gov/system/files/304/1767739491-UPV%202025Q1.txt',
    published: '2025-11-13',
    dollarYear: 2024
  },
  bess: {
    title: 'Cole, Ramasamy, et al. Cost Projections for Utility-Scale Battery Storage: 2025 Update. National Renewable Energy Laboratory. NREL/TP via OSTI 93281.',
    url: 'https://docs.nrel.gov/docs/fy25osti/93281.pdf',
    published: '2025',
    dollarYear: 2024
  },
  pvRange: {
    title: 'NREL Fall 2024 Solar Industry Update (DOE/NREL). Cross-method U.S. installed-price ranges. Cites Barbose et al., Tracking the Sun, 2024 Edition, Lawrence Berkeley National Laboratory, September 2024.',
    url: 'https://docs.nrel.gov/docs/fy25osti/92257.pdf',
    published: '2024-10',
    dollarYear: 2024
  },
  ev: {
    title: 'U.S. Department of Energy / NREL assessment of alternative fueling infrastructure (OSTI record of the costs chapter). Installation ranges stated in the text; 150 kW charger ranges cited to Nelder and Rogers, Rocky Mountain Institute, 2019.',
    url: 'https://www.osti.gov/biblio/2447838',
    published: '2024',
    dollarYear: null
  }
};

function item(partial) {
  return {
    id: partial.id,
    label: partial.label,
    price: partial.price == null ? null : partial.price,
    unit: partial.unit,
    low: partial.low == null ? null : partial.low,
    high: partial.high == null ? null : partial.high,
    source: partial.source,
    url: partial.url || '',
    published: partial.published,
    dollarYear: partial.dollarYear == null ? null : partial.dollarYear,
    read: partial.read || READ,
    region: partial.region || 'national',
    confidence: partial.confidence,
    status: partial.status,
    inTotal: !!partial.inTotal,
    note: partial.note || ''
  };
}

function book() {
  var pvNote = 'National overnight installed price. Equipment is not regionalized. The install-labor share is not separated in Table 2, so the state labor factor is not applied to this line.';
  return [
    item({ id: PV.utility.id, label: 'Utility-scale PV, installed, modeled market price', price: PV.utility.usdPerWdc, unit: '$/Wdc', low: PV.utility.low, high: PV.utility.high, source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: pvNote + ' ' + PV.utility.size + '.' }),
    item({ id: PV.commercial.id, label: 'Commercial rooftop PV, installed, modeled market price', price: PV.commercial.usdPerWdc, unit: '$/Wdc', low: PV.commercial.low, high: PV.commercial.high, source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: pvNote + ' ' + PV.commercial.size + '.' }),
    item({ id: PV.residential.id, label: 'Residential rooftop PV, installed, modeled market price', price: PV.residential.usdPerWdc, unit: '$/Wdc', low: PV.residential.low, high: PV.residential.high, source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: pvNote + ' ' + PV.residential.size + '.' }),
    item({ id: 'pv.utility.om', label: 'Utility PV operation and maintenance', price: PV.utility.omPerKwDcYr, unit: '$/kWdc-yr', source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: false, note: 'Annual O&M from Table 2. Not part of overnight capital.' }),
    item({ id: 'pv.commercial.om', label: 'Commercial PV operation and maintenance', price: PV.commercial.omPerKwDcYr, unit: '$/kWdc-yr', source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: false, note: 'Annual O&M from Table 2. Not part of overnight capital.' }),
    item({ id: 'pv.residential.om', label: 'Residential PV operation and maintenance', price: PV.residential.omPerKwDcYr, unit: '$/kWdc-yr', source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: false, note: 'Annual O&M from Table 2. Not part of overnight capital.' }),
    item({ id: 'pv.canopy', label: 'Solar canopy, installed', price: null, unit: '$/Wdc', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'The live book uses $2.75/Wdc and calls $2.50–$3.50 an industry range. No public benchmark was read for a canopy, so the preview does not price one.' }),
    item({ id: 'pv.cross.utility', label: 'Utility PV cross-method installed-price range, 2023', price: null, unit: '$/W', low: 1.0, high: 1.3, source: SRC.pvRange.title, url: SRC.pvRange.url, published: '2024-10', dollarYear: 2023, confidence: 'medium', status: 'range', inTotal: false, note: 'H1 2024 utility figure in the same update is $1.1/W. A range, not the price this library charges.' }),
    item({ id: 'pv.cross.nonresidential', label: 'Nonresidential PV cross-method installed-price range, first half of 2024', price: null, unit: '$/W', low: 1.6, high: 3.4, source: SRC.pvRange.title, url: SRC.pvRange.url, published: '2024-10', dollarYear: 2024, confidence: 'medium', status: 'range', inTotal: false, note: '2023 range in the same update was $1.5–$3.2/W.' }),
    item({ id: 'pv.cross.residential', label: 'Residential PV cross-method installed-price range, first half of 2024', price: null, unit: '$/W', low: 2.7, high: 4.2, source: SRC.pvRange.title, url: SRC.pvRange.url, published: '2024-10', dollarYear: 2024, confidence: 'medium', status: 'range', inTotal: false, note: '2023 range in the same update was $2.3–$4.4/W.' }),

    item({ id: 'bess.utility.energy', label: 'Utility-scale battery, energy component of overnight cost', price: BESS.energyPerKwh, unit: '$/kWh', source: SRC.bess.title, url: SRC.bess.url, published: SRC.bess.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: 'Applies at utility scale. The paper\'s 4-hour bottom-up model is the basis; a 1 MW project has no separate published adder.' }),
    item({ id: 'bess.utility.power', label: 'Utility-scale battery, power component of overnight cost', price: BESS.powerPerKw, unit: '$/kW', source: SRC.bess.title, url: SRC.bess.url, published: SRC.bess.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: 'Final power cost after the paper\'s $7/kW adjustment. The unadjusted fit was $379/kW, which is what the live Site Map book still uses.' }),
    item({ id: 'bess.utility.4h', label: 'Utility-scale 4-hour battery, overnight capital cost', price: BESS.pointPerKwh, unit: '$/kWh', low: BESS.lowPerKwh, high: BESS.highPerKwh, source: SRC.bess.title, url: SRC.bess.url, published: SRC.bess.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: false, note: '2024 point is $334/kWh. The band is Table 2 for 2025 (low $295, high $350 per kWh), the same report. Contingency, tax, labor, and profit are already inside the point. Not added a second time.' }),
    item({ id: 'bess.utility.fom', label: 'Utility-scale battery fixed O&M', price: null, unit: '$/kW-yr', source: SRC.bess.title, url: SRC.bess.url, published: SRC.bess.published, dollarYear: 2024, confidence: 'none', status: 'needs source', inTotal: false, note: 'The 2025 update says fixed O&M spans a wide published range and does not state one figure in the text that was read. Variable O&M is stated as zero. Lifetime 15 years and round-trip efficiency 85% are in the report and are not prices.' }),
    item({ id: 'bess.small.adder', label: 'Balance-of-plant adder below utility scale', price: null, unit: '$/kWh', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'The $334/kWh figure is the utility-scale overnight cost (the ATB discussion is a 60 MW system). No published 1 MW adder was read.' }),

    item({ id: 'ev.install.l2', label: 'Level 2 charger installation', price: null, unit: '$/port', low: 500, high: 6000, source: SRC.ev.title, url: SRC.ev.url, published: '2024', dollarYear: null, region: 'labor', confidence: 'medium', status: 'range', inTotal: false, note: 'Installation only, as stated. Equipment is a separate needs-source line.' }),
    item({ id: 'ev.install.dcfc', label: 'DC fast charger installation', price: null, unit: '$/port', low: 45800, high: 117900, source: SRC.ev.title, url: SRC.ev.url, published: '2024', dollarYear: null, region: 'labor', confidence: 'medium', status: 'range', inTotal: false, note: 'Installation only, all DCFC power levels in the sentence. Not added on top of a hardware price that was not read.' }),
    item({ id: 'ev.rmi.dcfc.150', label: '150 kW DC fast charger, RMI cost range', price: null, unit: '$/charger', low: 75600, high: 100000, source: 'Nelder and Rogers, Reducing EV Charging Infrastructure Costs, Rocky Mountain Institute, 2019, as cited by the DOE/NREL fueling-infrastructure assessment.', url: 'https://rmi.org/insight/reducing-ev-charging-infrastructure-costs/', published: '2019', dollarYear: 2019, confidence: 'medium', status: 'range', inTotal: false, note: 'The citing sentence does not split hardware from installation. No inflation adjustment was applied. Not used as the preview price.' }),
    item({ id: 'ev.dcfc.150.point', label: '150 kW DC fast charger, installed point price', price: null, unit: '$/port', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'A single installed price was not stated. The preview will not average the RMI band or the NREL installation band.' }),
    item({ id: 'ev.l2.equipment', label: 'Networked Level 2 charger equipment', price: null, unit: '$/port', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'Live Autel dealer costs stay on the live book. They are not a public index.' }),

    item({ id: 'el.conductor.ft', label: 'Copper feeder conductor', price: null, unit: '$/ft', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'PVSCM states conductor cost per kW, not per foot, and the per-kW figure is a model input under a tariff formula that was not evaluated. No public $/ft was read.' }),
    item({ id: 'el.conduit.ft', label: 'Conduit', price: null, unit: '$/ft', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'No public conduit price per foot was read. RSMeans was not copied.' }),
    item({ id: 'el.trench.ft', label: 'Trenching, duct bank, and restoration', price: null, unit: '$/ft', source: '', published: '', dollarYear: null, region: 'labor', confidence: 'none', status: 'needs source', inTotal: false, note: 'The live cost model uses $58/ft with no citation. That rate was not brought forward.' }),
    item({ id: 'el.transformer.kva', label: 'Pad-mount transformer', price: null, unit: '$/kVA', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'PVSCM lists a 2.8 MVA transformer as $51.08/kWac of the 100 MWdc benchmark (MSP model input), not as a $/kVA catalog price. The Eaton ROM in the live book is a vendor budgetary quote, not this library.' }),
    item({ id: 'el.switchgear', label: 'Switchgear', price: null, unit: '$/lineup', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'No public switchgear price was read. Included inside the PV and 4-hour battery benchmarks when those totals are used.' }),
    item({ id: 'el.interconnection', label: 'Interconnection and point of interconnection', price: null, unit: '$/project', source: SRC.bess.title, url: SRC.bess.url, published: SRC.bess.published, dollarYear: 2024, confidence: 'none', status: 'needs source', inTotal: false, note: 'The battery paper includes permitting and interconnection inside the $334/kWh and excludes network-upgrade equipment. No separate dollar was stated.' }),
    item({ id: 'el.protection', label: 'Protective relaying and metering', price: null, unit: '$/project', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'No public unit price was read.' }),

    item({ id: 'labor.index', label: 'State and metro electrician wage index', price: null, unit: 'factor', source: 'U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics, SOC 47-2111 Electricians. The factor is the state or metro mean hourly wage divided by the national mean. Equipment stays at 1.', url: 'https://www.bls.gov/oes/tables.htm', published: '', dollarYear: null, region: 'labor', confidence: 'none', status: 'needs source', inTotal: false, note: 'The May 2024 and May 2025 state and metro workbooks were not loaded. No wage was guessed. ZIP3 is not priced until a wage is tied to that prefix. RSMeans city cost indexes and Davis-Bacon determinations were not copied.' }),
    item({ id: 'gen.eia', label: 'On-site generation capital cost', price: null, unit: '$/kW', source: '', published: '', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'The live book cites EIA AEO2025, rounded, with no table row. Those rounded rates were not copied.' }),
    item({ id: 'lazard.capex', label: 'Lazard capital cost', price: null, unit: '$/kW', source: 'Lazard Levelized Cost of Energy+ Version 17.0, June 2024, as cited by the NREL 2025 storage update.', url: 'https://www.lazard.com/media/xemfey0k/lazards-lcoeplus-june-2024-_vf.pdf', published: '2024-06', dollarYear: null, confidence: 'none', status: 'needs source', inTotal: false, note: 'The Lazard capex tables were not read into this book. NREL already used that edition in the storage survey. No second capex was taken from it.' })
  ];
}

var ITEMS = book();

function byId(id) {
  var i;
  for (i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
  return null;
}

function ageDays(iso, now) {
  var t = Date.parse(iso + 'T00:00:00Z');
  if (!isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}

function freshness(now, staleDays, errorDays) {
  var dated = [], i, age;
  now = now instanceof Date ? now : new Date();
  for (i = 0; i < ITEMS.length; i++) {
    if (!ITEMS[i].read) continue;
    age = ageDays(ITEMS[i].read, now);
    dated.push({ id: ITEMS[i].id, read: ITEMS[i].read, age: age, published: ITEMS[i].published, status: ITEMS[i].status });
  }
  return {
    dated: dated,
    stale: dated.filter(function (d) { return d.age != null && d.age > staleDays; }),
    expired: dated.filter(function (d) { return d.age != null && d.age > errorDays; })
  };
}

function needsSource() {
  return ITEMS.filter(function (it) { return it.status === 'needs source'; });
}

/* State or ZIP3 labor factor. Equipment lines stay at 1. Until a BLS wage
   is loaded, the factor is null and nothing is scaled. */
function laborFactor(state, zip) {
  var z = zip == null ? '' : String(zip).replace(/\D/g, '');
  return {
    state: state ? String(state).toUpperCase() : null,
    zip: z || null,
    zip3: z.length >= 3 ? z.slice(0, 3) : null,
    factor: null,
    appliesTo: 'labor',
    equipmentFactor: 1,
    status: 'needs source',
    source: byId('labor.index').source,
    read: READ
  };
}

function pvSector(kwDc, mount) {
  if (mount === 'canopy') return 'canopy';
  var k = +kwDc || 0;
  if (k > 0 && k < 25) return 'residential';
  if (k >= 20000) return 'utility';
  if (k >= 125 && k <= 500) return 'commercial';
  if (k > 500 && k < 20000) return 'commercial';
  return 'commercial';
}

module.exports = {
  VERSION: VERSION,
  READ: READ,
  PV: PV,
  BESS: BESS,
  SRC: SRC,
  items: function () { return ITEMS.slice(); },
  byId: byId,
  freshness: freshness,
  needsSource: needsSource,
  laborFactor: laborFactor,
  pvSector: pvSector,
  ageDays: ageDays
};
