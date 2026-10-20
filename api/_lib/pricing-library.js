/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The preview price book. Every figure is a number read from a public
   source, with the publication and the day it was read. A line with no
   such number is status 'needs source' and is never given a price here.
   Nothing in this file is the live Site Map or Prime total. */
'use strict';

var Labor = require('./pricing-labor');

/* Reviewed collector output. A later collect writes proposed/ and
   review.json. It does not replace these files. */
var SNAP = {
  ppi: require('../../data/pricing-snapshots/bls-ppi/accepted.json'),
  eia: require('../../data/pricing-snapshots/eia-aeo/accepted.json'),
  atb: require('../../data/pricing-snapshots/nrel-atb/accepted.json'),
  lbnl: require('../../data/pricing-snapshots/lbnl-interconnection/accepted.json'),
  dot: require('../../data/pricing-snapshots/state-dot/accepted.json'),
  utility: require('../../data/pricing-snapshots/utility-unit-cost/accepted.json'),
  lazard: require('../../data/pricing-snapshots/lazard/accepted.json')
};

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

/* BLS PPI from the accepted collector snapshot. An index is not a
   dollar. No base-period index and commodity base were both read, so
   these series do not set $/ft or $/kVA. */
var PPI_URL = SNAP.ppi.url;
function ppiIndex(series) {
  var rows = SNAP.ppi.records || [];
  var i, row;
  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (row.series === series) return { series: row.series, label: row.label, period: row.period, value: row.value };
  }
  return null;
}
var PPI = {
  conductor: ppiIndex('WPU10260314'),
  conduit: ppiIndex('WPU11710216'),
  transformer: ppiIndex('WPU1174'),
  switchgear: ppiIndex('WPU1175')
};

/* EIA AEO 2025 Electricity Market Module, Table 3, from the accepted
   snapshot. Base overnight cost is 2024$/kW. */
var EIA_URL = SNAP.eia.url;
var EIA_GEN = SNAP.eia.records;

var WOOD = {
  title: 'Wood, Borlaug, Moniot, Lee, Ge, Yang, and Liu, The 2030 National Charging Network, National Renewable Energy Laboratory, Table 5, EVSE Capital Cost Assumptions.',
  url: 'https://docs.nlr.gov/docs/fy23osti/85654.pdf',
  published: '2023'
};

function atbValue(id, units) {
  var rows = SNAP.atb.records || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i].id === id && rows[i].units === units) return rows[i].value;
  }
  return null;
}

function txConduit() {
  var rows = (SNAP.dot.records && SNAP.dot.records.txdot) || [];
  var i;
  for (i = 0; i < rows.length; i++) if (rows[i].code === '618-7030') return rows[i];
  return null;
}

function utilityRows(bookLine) {
  var rows = SNAP.utility.records || [];
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) if (rows[i].bookLine === bookLine) out.push(rows[i]);
  return out;
}

function utilityFeet() {
  var rows = SNAP.utility.records || [];
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) if (rows[i].bookLine == null) out.push(rows[i]);
  return out;
}

function isoBand() {
  var rows = SNAP.lbnl.records || [];
  var low = null, high = null, i, v;
  for (i = 0; i < rows.length; i++) {
    v = rows[i].usdPerKw;
    if (low == null || v < low) low = v;
    if (high == null || v > high) high = v;
  }
  return { low: low, high: high };
}

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
    method: partial.method || '',
    fill: partial.fill || '',
    index: partial.index || null,
    table: partial.table || null,
    inTotal: !!partial.inTotal,
    note: partial.note || ''
  };
}

function book() {
  var pvNote = 'National overnight installed price. Equipment is not regionalized. The install-labor share is not separated in Table 2, so the state labor factor is not applied to this line.';
  var tx = txConduit();
  var iso = isoBand();
  return [
    item({ id: PV.utility.id, label: 'Utility-scale PV, installed, modeled market price', price: PV.utility.usdPerWdc, unit: '$/Wdc', low: PV.utility.low, high: PV.utility.high, source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: pvNote + ' ' + PV.utility.size + '.' }),
    item({ id: PV.commercial.id, label: 'Commercial rooftop PV, installed, modeled market price', price: PV.commercial.usdPerWdc, unit: '$/Wdc', low: PV.commercial.low, high: PV.commercial.high, source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: pvNote + ' ' + PV.commercial.size + '.' }),
    item({ id: PV.residential.id, label: 'Residential rooftop PV, installed, modeled market price', price: PV.residential.usdPerWdc, unit: '$/Wdc', low: PV.residential.low, high: PV.residential.high, source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: pvNote + ' ' + PV.residential.size + '.' }),
    item({ id: 'pv.utility.om', label: 'Utility PV operation and maintenance', price: PV.utility.omPerKwDcYr, unit: '$/kWdc-yr', source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: false, note: 'Annual O&M from Table 2. Not part of overnight capital.' }),
    item({ id: 'pv.commercial.om', label: 'Commercial PV operation and maintenance', price: PV.commercial.omPerKwDcYr, unit: '$/kWdc-yr', source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: false, note: 'Annual O&M from Table 2. Not part of overnight capital.' }),
    item({ id: 'pv.residential.om', label: 'Residential PV operation and maintenance', price: PV.residential.omPerKwDcYr, unit: '$/kWdc-yr', source: SRC.pv.title, url: SRC.pv.url, published: SRC.pv.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: false, note: 'Annual O&M from Table 2. Not part of overnight capital.' }),
    item({ id: 'pv.canopy', label: 'Solar canopy, installed', price: null, unit: '$/Wdc', source: 'Barbose et al., Tracking the Sun, 2024 Edition, Lawrence Berkeley National Laboratory, September 2024.', url: 'https://eta-publications.lbl.gov/sites/default/files/2024-08/tracking_the_sun_2024_report.pdf', published: '2024-09', dollarYear: 2023, confidence: 'none', status: 'needs source', method: 'direct', fill: 'paid', inTotal: false, note: 'Tracking the Sun 2024 reports residential and nonresidential installed prices and does not publish a carport or canopy price. The live $2.75/Wdc and the $2.50–$3.50 range were not brought forward. A canopy still needs RSMeans or a vendor quote.' }),
    item({ id: 'pv.cross.utility', label: 'Utility PV cross-method installed-price range, 2023', price: null, unit: '$/W', low: 1.0, high: 1.3, source: SRC.pvRange.title, url: SRC.pvRange.url, published: '2024-10', dollarYear: 2023, confidence: 'medium', status: 'range', inTotal: false, note: 'H1 2024 utility figure in the same update is $1.1/W. A range, not the price this library charges.' }),
    item({ id: 'pv.cross.nonresidential', label: 'Nonresidential PV cross-method installed-price range, first half of 2024', price: null, unit: '$/W', low: 1.6, high: 3.4, source: SRC.pvRange.title, url: SRC.pvRange.url, published: '2024-10', dollarYear: 2024, confidence: 'medium', status: 'range', inTotal: false, note: '2023 range in the same update was $1.5–$3.2/W.' }),
    item({ id: 'pv.cross.residential', label: 'Residential PV cross-method installed-price range, first half of 2024', price: null, unit: '$/W', low: 2.7, high: 4.2, source: SRC.pvRange.title, url: SRC.pvRange.url, published: '2024-10', dollarYear: 2024, confidence: 'medium', status: 'range', inTotal: false, note: '2023 range in the same update was $2.3–$4.4/W.' }),

    item({ id: 'bess.utility.energy', label: 'Utility-scale battery, energy component of overnight cost', price: BESS.energyPerKwh, unit: '$/kWh', source: SRC.bess.title, url: SRC.bess.url, published: SRC.bess.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: 'Applies at utility scale. The paper\'s 4-hour bottom-up model is the basis; a 1 MW project has no separate published adder.' }),
    item({ id: 'bess.utility.power', label: 'Utility-scale battery, power component of overnight cost', price: BESS.powerPerKw, unit: '$/kW', source: SRC.bess.title, url: SRC.bess.url, published: SRC.bess.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: true, note: 'Final power cost after the paper\'s $7/kW adjustment. The unadjusted fit was $379/kW, which is what the live Site Map book still uses.' }),
    item({ id: 'bess.utility.4h', label: 'Utility-scale 4-hour battery, overnight capital cost', price: BESS.pointPerKwh, unit: '$/kWh', low: BESS.lowPerKwh, high: BESS.highPerKwh, source: SRC.bess.title, url: SRC.bess.url, published: SRC.bess.published, dollarYear: 2024, confidence: 'high', status: 'sourced', inTotal: false, note: '2024 point is $334/kWh. The band is Table 2 for 2025 (low $295, high $350 per kWh), the same report. Contingency, tax, labor, and profit are already inside the point. Not added a second time.' }),
    item({ id: 'bess.utility.fom', label: 'Utility-scale battery fixed O&M', price: 53.44, unit: '$/kW-yr', source: 'Cole, Ramasamy, et al. 2025, and the 2025 Electricity ATB: fixed O&M is 4% of capital cost in $/kW, including augmentation, and variable O&M is zero. Applied to this book\'s cited 4-hour capital of $1,336/kW.', url: 'https://atb.nlr.gov/electricity/2025/utility-scale_battery_storage', published: '2025', dollarYear: 2024, confidence: 'medium', status: 'sourced', method: 'derived', fill: 'free', inTotal: false, note: '4% of $1,336/kW is $53.44/kW-yr. The workbook stores the same 4% rule (Fixed O&M = 0.04 × overnight $/kW) and does not store a separate dollar. EIA AEO 2025 Electricity Market Module Table 3 states $40.62/kW-yr directly for a 150 MW four-hour battery (2024$, Sargent & Lundy, January 2024). The two figures are not averaged. Neither is added to overnight capital. Lifetime 15 years and round-trip efficiency 85% are in the NREL report and are not prices.' }),
    item({ id: 'bess.small.adder', label: 'Balance-of-plant adder below utility scale', price: null, unit: '$/kWh', source: 'National Laboratory of the Rockies, 2025 Electricity Annual Technology Baseline workbook (2025_v1, OEDI submission 8759) and model-parameters file.', url: SNAP.atb.page, published: '2025', dollarYear: 2023, confidence: 'medium', status: 'partial', method: 'direct', fill: 'partial', table: SNAP.atb.records, inTotal: false, note: 'The commercial Battery Capital Cost Constant is $0 in every scenario and year of the 2025 workbook. The model-parameters file\'s 2024 base case (2023$) is $' + atbValue('utility-60mw', '$/kWh') + '/kWh ($' + atbValue('utility-60mw', '$/kW') + '/kW) for a 60 MW / 240 MWh battery and $' + atbValue('commercial-1800kw', '$/kWh') + '/kWh ($' + atbValue('commercial-1800kw', '$/kW') + '/kW) for a 1,800 kW / 7,200 kWh battery. That gap is two representative systems, not an adder stacked on the $334/kWh (2024$) utility point. No 1 MW adder is charged.' }),

    item({ id: 'ev.install.l2', label: 'Level 2 charger installation', price: null, unit: '$/port', low: 500, high: 6000, source: SRC.ev.title, url: SRC.ev.url, published: '2024', dollarYear: null, region: 'labor', confidence: 'medium', status: 'range', inTotal: false, note: 'Installation only, as stated. Equipment is a separate line and is not added here.' }),
    item({ id: 'ev.install.dcfc', label: 'DC fast charger installation', price: null, unit: '$/port', low: 45800, high: 117900, source: SRC.ev.title, url: SRC.ev.url, published: '2024', dollarYear: null, region: 'labor', confidence: 'medium', status: 'range', inTotal: false, note: 'Installation only, all DCFC power levels in the sentence. Not added on top of a hardware price that was not read.' }),
    item({ id: 'ev.rmi.dcfc.150', label: '150 kW DC fast charger, RMI cost range', price: null, unit: '$/charger', low: 75600, high: 100000, source: 'Nelder and Rogers, Reducing EV Charging Infrastructure Costs, Rocky Mountain Institute, 2019, as cited by the DOE/NREL fueling-infrastructure assessment.', url: 'https://rmi.org/insight/reducing-ev-charging-infrastructure-costs/', published: '2019', dollarYear: 2019, confidence: 'medium', status: 'range', inTotal: false, note: 'The citing sentence does not split hardware from installation. No inflation adjustment was applied. Not used as the preview price.' }),
    item({ id: 'ev.dcfc.150.point', label: '150 kW DC fast charger, installed point price', price: null, unit: '$/port', source: WOOD.title, url: WOOD.url, published: WOOD.published, dollarYear: null, confidence: 'low', status: 'partial', method: 'direct', fill: 'partial', table: { hardwareLow: 66400, hardwareHigh: 102200, installLow: 45800, installHigh: 94000, unit: '$/port', dollarYear: null }, inTotal: false, note: 'Table 5 states DC 150 kW hardware at $66,400–$102,200 per port and installation at $45,800–$94,000 per port. The report does not state a dollar year. The footnote calls the ends optimistic and pessimistic, and the installation scope was not fully verified. The corridor paper\'s $84,300 and $69,900 are the midpoints of those ranges and are not charged. An installed point still needs a vendor quote.' }),
    item({ id: 'ev.l2.equipment', label: 'Level 2 charger equipment', price: null, unit: '$/port', low: 2200, high: 4600, source: WOOD.title, url: WOOD.url, published: WOOD.published, dollarYear: null, confidence: 'low', status: 'range', method: 'direct', fill: 'partial', inTotal: false, note: 'Table 5 commercial Level 2 hardware, per port. It is not a networked charger and it is not charged. No dollar year is stated. A networked point still needs a vendor quote. Installation stays on ev.install.l2. Live Autel dealer costs stay on the live book.' }),

    item({ id: 'el.conductor.ft', label: 'Copper feeder conductor', price: null, unit: '$/ft', source: 'U.S. Bureau of Labor Statistics, Producer Price Index series WPU10260314, copper wire and cable. September 2026 index ' + PPI.conductor.value + '.', url: PPI_URL, published: '2026-09', dollarYear: null, confidence: 'low', status: 'partial', method: 'indexed', fill: 'partial', index: PPI.conductor, inTotal: false, note: 'The index can escalate a base $/ft once one is read. No 500 kcmil base was read. PG&E\'s unit-cost guide does not separate cable size. TxDOT item 620-7008 is #8 AWG and was not used. The PPI is not applied.' }),
    item({ id: 'el.conduit.ft', label: 'Conduit', price: tx.price, unit: '$/ft', source: 'Texas Department of Transportation bid tabulations, item ' + tx.code + ' ' + tx.description + '. Quantity-weighted mean of ' + tx.n + ' rank-1 bids, ' + tx.quantity + ' LF, let ' + tx.firstLet + ' through ' + tx.lastLet + '. Unrounded mean $' + tx.weightedAverage + '/LF, shown as $' + tx.price + '/ft. The September 2026 conduit PPI is ' + PPI.conduit.value + ' and is not applied.', url: SNAP.dot.url, published: tx.lastLet.slice(0, 7), dollarYear: null, region: 'TX', confidence: 'medium', status: 'sourced', method: 'derived', fill: 'free', index: PPI.conduit, inTotal: false, note: 'Item 618 pays installed conduit, including excavation and backfill. It is not escalated and it is not also a trench line. A quote shows this price only when the state is TX. IDOT awarded prices are an email subscription and were not fetched. Caltrans did not return an electrical-conduit weighted average. The 3-inch and 4-inch means stay on the snapshot.' }),
    item({ id: 'el.trench.ft', label: 'Trenching, duct bank, and restoration', price: null, unit: '$/ft', source: 'Texas Department of Transportation item 618 includes excavation, so it was not split into a trench rate. PG&E Unit Cost Guide, March 2026, and ComEd DER Interconnection Guidelines, effective 2024-11-30, state extension rates that were read and not used as a national separable trench.', url: SNAP.utility.url, published: SNAP.utility.pgePublished, dollarYear: null, region: 'labor', confidence: 'low', status: 'partial', method: 'direct', fill: 'partial', table: utilityFeet(), inTotal: false, note: 'PG&E $880/ft is San Francisco trench-and-install of an underground line. ComEd $275/ft is a 12 kV underground extension. Neither is a national duct-bank and restoration rate, and neither is escalated. A separable trench rate still needs RSMeans. The live cost model\'s $58/ft was not brought forward.' }),
    item({ id: 'el.transformer.kva', label: 'Pad-mount transformer', price: null, unit: '$/kVA', source: 'PG&E Unit Cost Guide, March 2026, category 1 (transformer and 100 ft of secondary cable), and ComEd DER Interconnection Guidelines, effective 2024-11-30. PPI WPU1174, September 2026 index ' + PPI.transformer.value + ', is stored and not applied.', url: SNAP.utility.url, published: SNAP.utility.pgePublished, dollarYear: null, confidence: 'low', status: 'partial', method: 'direct', fill: 'partial', index: PPI.transformer, table: utilityRows('el.transformer.kva'), inTotal: false, note: 'The guide prices a package, not a bare $/kVA. ComEd\'s behind-the-meter figure above 500 kW is a transformer upgrade allowance, not a catalog price. No row was escalated. A bare pad-mount price still needs a vendor quote.' }),
    item({ id: 'el.switchgear', label: 'Switchgear', price: null, unit: '$/lineup', source: 'PG&E Unit Cost Guide, March 2026. PPI WPU1175, September 2026 index ' + PPI.switchgear.value + ', is stored and not applied.', url: SNAP.utility.url, published: SNAP.utility.pgePublished, dollarYear: null, confidence: 'low', status: 'partial', method: 'direct', fill: 'partial', index: PPI.switchgear, table: utilityRows('el.switchgear'), inTotal: false, note: 'The guide prices a PME-5 padmount switch and a padmounted visible switch at the point of common coupling. Neither is a switchgear lineup. No row was escalated. A lineup price still needs a vendor quote.' }),
    item({ id: 'el.interconnection', label: 'Interconnection, ISO-queue study costs', price: null, unit: '$/kW', low: iso.low, high: iso.high, source: 'Lawrence Berkeley National Laboratory interconnection cost analyses. Completed-project means, real 2022 dollars: SPP 2020–2022 $57/kW (Seel et al., April 2023 briefing); PJM 2020–2022 mean $84/kW, median $30/kW (Seel et al., January 2023); MISO 2019–2021 mean $102/kW (Seel et al., 2022).', url: SNAP.lbnl.url, published: '2023-04', dollarYear: 2022, confidence: 'low', status: 'range', method: 'direct', fill: 'partial', table: SNAP.lbnl.records, inTotal: false, note: 'These are transmission-queue study costs. Network upgrades are most of the recent increase. They are not a behind-the-meter ComEd or distribution facility cost, and they are not added to the $334/kWh battery point, which already includes permitting and interconnection and excludes network upgrades. Seel et al., June 2023, state that CAISO does not disclose project-level costs and that ERCOT uses connect-and-manage. No ERCOT or CAISO dollar was read. NYISO and ISO-NE means were not transcribed. The three means are not averaged.' }),
    item({ id: 'el.protection', label: 'Protective relaying and metering', price: null, unit: '$/project', source: 'PG&E Unit Cost Guide, March 2026, and ComEd DER Interconnection Guidelines, effective 2024-11-30.', url: SNAP.utility.url, published: SNAP.utility.pgePublished, dollarYear: null, confidence: 'low', status: 'partial', method: 'direct', fill: 'partial', table: utilityRows('el.protection'), inTotal: false, note: 'The figures are a new IPAC relay cabinet, direct transfer trip, and a ComEd substation relay estimate. The two $150,000 figures are different scopes and are not one price. None is a behind-the-meter relaying package, and none is charged. A general protection package still needs RSMeans or a vendor quote.' }),

    item({ id: 'labor.index', label: 'State and metro construction-wage index', price: null, unit: 'factor', source: Labor.SOURCE, url: Labor.URL, published: Labor.PUBLISHED, dollarYear: 2025, region: 'labor', confidence: 'high', status: 'sourced', method: 'indexed', fill: 'free', inTotal: false, note: 'National composite is the employment-weighted mean of the three May 2025 mean hourly wages. A state or metro factor divides that geography\'s composite by the national composite. Electrician-only is stored beside it and is not the factor applied. Equipment stays at 1. ZIP3 is loaded only for 100 (New York), 606 (Chicago), 770 (Houston), 900 (Los Angeles), and 941 (San Francisco). Any other ZIP uses the state. Davis-Bacon county determinations were not read and are not blended. An ECEC benefit-load percent was not confirmed and would cancel in a national ratio. RSMeans city indexes were not copied.' }),
    item({ id: 'gen.eia', label: 'On-site generation capital cost', price: null, unit: '$/kW', source: 'U.S. Energy Information Administration, Assumptions to the Annual Energy Outlook 2025: Electricity Market Module, Table 3, April 2025. Costs from Sargent & Lundy, January 2024.', url: EIA_URL, published: '2025-04', dollarYear: 2024, confidence: 'high', status: 'sourced', method: 'direct', fill: 'free', table: EIA_GEN, inTotal: false, note: 'Each technology keeps its own base overnight cost. There is no single generation price, and none of these rows is added to a battery or PV total. The 150 MW battery row ($1,580/kW, fixed O&M $40.62/kW-yr) is context for the O&M note. The preview battery capital stays the Cole 2025 point. The live book\'s rounded rates were not copied. Table 3 excludes regional multipliers except as its notes describe for wind and solar, which are not in this table.' }),
    item({ id: 'lazard.capex', label: 'Lazard capital cost', price: null, unit: '$/kW', source: 'Lazard Levelized Cost of Energy+ Version 18.0, June 2025, and Version 17.0, June 2024. Capital-cost ranges as printed. No midpoint is taken.', url: SNAP.lazard.url, published: SNAP.lazard.published, dollarYear: null, confidence: 'medium', status: 'sourced', method: 'direct', fill: 'free', table: SNAP.lazard.records, inTotal: false, note: 'No dollar year is printed on the assumption pages. The illustrative $153/kWh on the sample low-case page is not a published range and is not stored. Operating plants at zero capital are not new-build capex. Hybrid storage is stored beside generation and is not added to the Cole point. The PDF is not stored.' })
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

/* State, metro, or ZIP3 labor factor. Equipment lines stay at 1.
   The factor scales a labor line only. All-in NREL capital stays national. */
function laborFactor(state, zip) {
  var hit = Labor.lookup(state, zip);
  var sourced = hit.factor != null;
  var z = zip == null ? '' : String(zip).replace(/\D/g, '');
  return {
    state: hit.state,
    zip: z || null,
    zip3: hit.zip3,
    factor: hit.factor,
    geography: hit.geography,
    name: hit.name,
    code: hit.code,
    composite: hit.composite,
    nationalComposite: Math.round(Labor.NATIONAL_COMPOSITE * 10000) / 10000,
    electricianHourly: hit.electricianHourly,
    electricianFactor: hit.electricianFactor,
    appliesTo: 'labor',
    equipmentFactor: 1,
    status: sourced ? 'sourced' : 'needs source',
    method: 'indexed',
    confidence: sourced ? 'high' : 'none',
    source: Labor.SOURCE,
    url: Labor.URL,
    published: Labor.PUBLISHED,
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
