/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ═══════════════════════════════════════════════════════════════════════════
   api/_lib/nextnrg.js — NextNRG Microgrids, as the platform sells it

   ONE record of what NextNRG specifies and what ClearSky charges for it,
   read off the NextNRG Microgrids brochure (Q4 2026, ten pages) on
   2026-10-13 (Tommy: "i want their battery products and their solar
   products to be in the system as something that can be sold … in the
   microcontrol we want to use their product the cost is 125k/unit … it
   needs to be auto built into the omega core skid … from a value stack
   and energy efficiency it should on average increase the efficiency of
   energy on a site by 7%").

   WHAT LIVES HERE AND WHAT DOES NOT. The brochure's figures are public
   datasheet facts and may ship in a browser, so editor.html carries the
   same specs in its own catalogs (BESS_CATALOG, DER_PV_MODULES,
   UTILITY_CATALOG, DC_CATALOG); scripts/tests/tnextnrg.js holds each of
   them to THIS record figure by figure, so there is one source. The two
   things that never reach a browser are here alone:
     · the CONTROLLER'S PRICE ($125,000 a unit): the Site Map cost engine
       (editor-cost.js) and the Omega-Core skid (omega-core.js) read it;
     · the DISPATCH UPLIFT (the brochure's "6 to 8% modelled ROI uplift",
       carried as the platform's 7%): vpp-sim.js applies it, once, to the
       dispatch-decided bill savings of a site that has the controller.
   Pure, ES5, no I/O.

   THE CAVEAT TRAVELS WITH THE NUMBER. The brochure's own footnote on the
   uplift: "Potential improvement in project return on a site pairing
   photovoltaic generation with storage. Site dependent and subject to
   tariff, load profile, PV output, battery sizing and installed cost.
   Modelled rather than measured, and not a performance guarantee." Every
   stream the uplift touches says so, and the summary says so.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var SOURCE = { what: 'NextNRG Microgrids brochure, Q4 2026 (ten pages)', asOf: '2026-10-13',
               contact: 'info@nextnrg.com', dashboard: 'dashboard.nextnrg.com' };

var VENDOR = { name: 'NextNRG', brand: 'nextnrg', orgId: 'nextnrg.com' };

/* ── SOLAR: the module NextNRG specifies (brochure p. 3–4) ───────────────
   JinkoSolar N-type TOPCon, branded EAGLE in the United States (the Tiger
   Neo name used elsewhere is a different datasheet and is not quoted).
   The brochure's key figure is the 640 W top of the class; the class runs
   615 to 640 W. Density is the module's own nameplate over its own area:
   640 W / (2.382 m × 1.134 m × 10.7639 ft²/m²) = 22.0 W per square foot. */
var SOLAR_MODULE = {
  key: 'nextnrg-eagle-g7b',
  make: 'JinkoSolar', line: 'EAGLE G7B', specifiedBy: VENDOR.name,
  label: 'JinkoSolar EAGLE G7B 640 W (NextNRG-specified)',
  watts: 640, wattsMin: 615, wattsMax: 640, tolerance: '0 / +3%',
  efficiencyPct: 23.69, efficiencyMinPct: 22.77,
  cell: 'N-type TOPCon, bifacial', cells: '132 half cells (2 × 66)', bifacialityPct: 80, bifacialityTolPct: 5,
  maxSystemVdc: 1500, maxSeriesFuseA: 35,
  tempCoeffPmaxPctPerC: -0.29, operatingC: [-40, 85], noctC: 45, noctTolC: 2,
  mechLoadPa: { front: 5400, rear: 2400 },
  widthMm: 1134, heightMm: 2382, depthMm: 30, widthIn: 44.65, heightIn: 93.77, depthIn: 1.18,
  weightKg: 32.4, weightLb: 71.4, fireRating: 'Type 29',
  certs: 'IEC 61215, IEC 61730, UL 61730; manufacturing to ISO 9001, ISO 14001, ISO 45001',
  productWarrantyYears: 12,
  performanceWarranty: { years: 30, firstYearDegradationPct: 1, perYearDegradationPct: 0.4, outputAtYear30Pct: 87.4 },
  forecast: 'Generation forecast from fifteen-minute intervals out to seven days; inverter telemetry to the controller over Modbus TCP through the site PLC',
  alternatives: [
    { line: 'EAGLE G7X', note: 'same electrical class, Type 30 fire rating, hail certified to 55 mm' },
    { line: 'EAGLE G6X', note: '580 to 600 W, 144 half cells, wider −45°C to +70°C range' }
  ],
  source: SOURCE.what + ', p. 3–4'
};
/* W per square foot of module area, from the nameplate and the frame. */
function moduleWpsf(m) {
  m = m || SOLAR_MODULE;
  var areaM2 = (m.widthMm / 1000) * (m.heightMm / 1000);
  return m.watts / (areaM2 * 10.7639);
}
SOLAR_MODULE.wpsf = Math.round(moduleWpsf(SOLAR_MODULE) * 100) / 100;

/* ── STORAGE: the requirement every supplied system is held to (p. 5–6) ──
   NextNRG specifies storage to the site, not to one catalogue product;
   Saft and A123 Systems are the named supply relationships. The entries
   below are ONLY the blocks the brochure names on its specification page,
   each labelled as NextNRG's (Tommy, 2026-10-13: "the only batteries for
   NextNRG that should be showing up as NextNRG is if they've actually
   manually inputted something or it's off of that spec sheet"). Power is
   NOT published per block ("sized to the islanded load and the outage the
   site must survive", 2 to 8 hours), so kW stays null — the PCS is sized
   per site — rather than a figure the sheet does not carry. Anything
   else NextNRG sells enters through their own product list. */
var STORAGE_SPEC = {
  chemistry: 'Lithium iron phosphate (LFP) preferred; advanced NMC where the duty cycle justifies it',
  form: 'Containerised, standard ISO footprint, factory assembled, tested and certified',
  durationHours: [2, 8],
  roundTripEfficiencyAcPct: [85, 90],
  designLifeYears: 20, availabilityPct: 97,
  dailyThroughputPct: 300,
  thermal: 'Liquid cooled, with module and battery management cooling on an integrated heat exchanger circuit',
  siting: 'Thermal insulation permitting back to back and side by side placement',
  safety: 'Smoke detection, fire suppression and alarms, with protection at module, string and container level',
  standards: 'UL 1973 and IEC 62619 at system level, UL 1642 at cell level, IEC 62477, UN 3536 Class 9',
  fireCode: 'Designed to align with NFPA 855 requirements',
  ingress: 'IP54 minimum for the outdoor enclosure',
  cellSupply: 'A123 Systems large format prismatic LFP cells at 587 Ah in a 1P13S 41.6 V module, with Dukosi chip-on-cell monitoring and a Nuvation Energy L2 BMS, UL 1973 Recognized',
  scaleNote: 'Catalogue containerised blocks start at multi megawatt hour scale; C&I sites below that range are specified to the same requirement through the appropriate supply route (not a catalogue product: it enters through NextNRG\'s own product list)',
  source: SOURCE.what + ', p. 5–6'
};
function block(key, model, kwh, chem, extra) {
  var o = { key: key, mfr: VENDOR.name, model: model, chem: chem, kwh: kwh,
            kw: null, dur: null, kwNote: 'not published per block; the PCS is sized per site to a 2-8 hour duty',
            durRange: '2-8 hr', containerFt: 20, source: STORAGE_SPEC.source };
  for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
  return o;
}
var STORAGE = [
  block('NEXTNRG-SAFT-IFLEX-3400', 'NextNRG Microgrid Storage — Saft Intensium Flex 3.4 MWh block (LFP)', 3400, 'LFP',
        { supply: 'Saft Intensium Flex, containerised LFP, with I-Sight cloud monitoring' }),
  block('NEXTNRG-SAFT-IFLEX-4300', 'NextNRG Microgrid Storage — Saft Intensium Flex 4.3 MWh block (LFP)', 4300, 'LFP',
        { supply: 'Saft Intensium Flex, containerised LFP, with I-Sight cloud monitoring' }),
  block('NEXTNRG-SAFT-IFLEX-5100', 'NextNRG Microgrid Storage — Saft Intensium Flex 5.1 MWh block (LFP)', 5100, 'LFP',
        { supply: 'Saft Intensium Flex, containerised LFP, with I-Sight cloud monitoring' }),
  block('NEXTNRG-SAFT-IMAX20-HE', 'NextNRG Microgrid Storage — Saft Intensium Max 20 High Energy 2.5 MWh (NMC, 20 ft)', 2500, 'NMC',
        { supply: 'Saft Intensium Max 20 High Energy, 2.5 MWh NMC per twenty-foot container', rteDcPct: 96 })
];

/* ── THE CONTROLLER (p. 7–8) and what ClearSky charges for it ────────────
   The decision between solar, storage and the grid, every fifteen minutes,
   on a twenty-four-hour horizon. New build or an existing PV-and-storage
   site. The PRICE is ClearSky's (Tommy, 2026-10-13: "the cost is
   125k/unit") and is read by the cost engine and the Omega-Core skid;
   the page never carries it. */
var CONTROLLER = {
  key: 'NEXTNRG-MGC',
  make: VENDOR.name, model: 'NextNRG Microgrid Controller', shortLabel: 'NEXTNRG MICROGRID CONTROLLER', abbr: 'MGC',
  priceUsd: 125000, priceBasis: 'ClearSky, 2026-10-13 ("the cost is 125k/unit"); installed, per unit',
  dispatchIntervalMin: 15, horizonHours: 24,
  modes: ['economic', 'resilience', 'islanded'], blackStart: true,
  architecture: 'Microprocessor based supervisory controller with state machine mode switching; real-time controls and interlocks stay with the site PLC',
  comms: 'Modbus TCP/IP register interface to the site PLC; DNP3 via optional module or gateway',
  ethernetPorts: 10, ethernetSpeed: '100/1000 Mbps auto-negotiation', wan: '100 Mbps local Ethernet, or optional LTE/cellular',
  enclosure: 'Control enclosure, IP55', ingress: 'IP55',
  installation: 'Fixed indoor mounted, outdoor option; wall or pad mounted',
  layout: 'DIN rail mounted components with cable management trays',
  operatingC: [0, 40], cooling: 'Active cooling standard for elevated ambient sites',
  widthMm: 500, heightMm: 750, depthMm: 210, widthIn: 19.69, heightIn: 29.53, depthIn: 8.27,
  weightKg: 40, weightLb: 88,
  /* the footprint the Site Map draws: the enclosure's 750 × 500 mm face on
     a pad, in feet (2.46 × 1.64), rounded to the quarter foot */
  padLf: 2.5, padWf: 1.75,
  standards: 'IEC and UL industrial control requirements, IEEE 1547, IEC 62443',
  cybersecurity: 'NERC CIP aligned architecture, encrypted communications, role based access control',
  patent: 'US Patent 10,326,280 B1 (scope and current status confirmed per project)',
  remote: 'Monitoring and configuration over IP, with alerting, role based access control and remote updates',
  source: SOURCE.what + ', p. 7–8'
};

/* ── THE PRICE OF THE SYSTEM (2026-10-14) ───────────────────────────────
   Tommy: "the cost of the nextnrg bess and the next nrg solar is $6.00 per
   watt … wire that into the site map editor so that is reflected". NextNRG
   sells its solar and its storage as ONE installed system, priced per
   W-DC of solar: the array, the storage beside it and the installation
   labor, all in. NextNRG's own Topanga investor one-pager (Q3 2026) prices
   315 kW DC of solar with a 300 kW / 1.8 MWh battery at $1,780,063
   installed — $5.65/W DC for the whole system — which is what the rate
   describes. The Site Map cost engine (api/_lib/editor-cost.js) prices a
   NextNRG array at this rate, counts the NextNRG storage beside it as
   inside the price, and adds no contingency to it (it is a vendor's
   installed price, like a contracted number). NextNRG storage placed with
   no NextNRG solar beside it is priced at the same rate on its rated
   power, installed. Never a second copy of the figure in a page. */
var SYSTEM_RATE = {
  /* TWO PRICES, EACH ITS OWN LINE (2026-10-14, settled over four tries).
     The storage: $6.00 per W of rated power, installed (Tommy, over the
     Model 1 alone reading $1,500,000: "the battery at 1.5m which is
     probably accurate"). The solar: the industry rate, DOE/NREL Q1 2025
     commercial, $1.98 per W-DC installed (Tommy, the same morning: "make
     sure for solar that the pricing per kW dc is industry standard"; and,
     over 350 kW of solar alone reading $1.98M at a system rate with the
     battery inside: "its showing 1.9m for 350kW of solar...."). A price
     per watt of solar with the battery inside charged for a battery that
     was not on the drawing, so there is no system price: solar alone pays
     for solar, storage alone for storage. NextNRG's own Topanga one-pager
     ($1,780,063 installed for 315 kW DC + 300 kW / 1.8 MWh + controller)
     is kept on the record as what they quoted a whole system at, never as
     the rate. NextNRG's own per-piece prices, when they give them, go here
     and nowhere else. */
  perWdc: 1.98,
  storageOnlyPerW: 6.00,
  label: 'NextNRG solar, installed',
  storageLabel: 'NextNRG storage, installed',
  includes: ['the solar array', 'installation labor'],
  storageIncludes: ['the storage', 'installation labor'],
  basis: 'ClearSky, 2026-10-14: NextNRG solar at the DOE/NREL Q1 2025 commercial rate, $1.98 per W-DC installed; NextNRG storage at $6.00 per W of rated power installed (Tommy: "the battery at 1.5m which is probably accurate"); each its own line',
  quote: { installedUsd: 1780063, investmentSoughtUsd: 1786000, solarKwDc: 315, bessKw: 300, bessKwh: 1800, source: 'NextNRG \u2014 Topanga Solar + Storage investor one-pager, prepared 2026-08-19' },
  corroboration: 'NextNRG — Topanga Solar + Storage investor one-pager, Q3 2026: total installed cost $1,780,063 for 315 kW DC of solar with a 300 kW / 1.8 MWh BESS, $5.65/W DC',
  contingency: false
};
/* Which arrays and batteries are NextNRG's: an array stamped as NextNRG's
   product (the NextNRG Solar — Custom tool; sku NEXTNRG-PV-…, mfr NextNRG),
   a battery from the NextNRG group of the catalog (nextnrg: true) or
   NextNRG's own product list — and, in NextNRG's OWN workspace, every
   array and battery drawn, because what NextNRG draws is what NextNRG
   sells. */
function isVendorOrg(orgId) { return String(orgId || '').toLowerCase() === VENDOR.orgId; }
function isNextnrgSolar(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.nextnrg === true) return true;
  if (/^NEXTNRG-/i.test(String(s.sku || ''))) return true;
  return String(s.mfr || '').toLowerCase() === 'nextnrg';
}

/* ── THE UPLIFT ──────────────────────────────────────────────────────────
   The brochure models a 6 to 8% improvement in project return on a site
   pairing PV with storage, from a controller that solves the next
   twenty-four hours instead of charging and discharging at preset
   trigger points. The platform carries the midpoint, 7%, on the
   DISPATCH-DECIDED savings — the bill streams (demand charges held down,
   time-of-use energy shifted) that a better schedule changes. It is not
   applied to PJM capacity (accreditation does not move), to programme
   rates (a counterparty's rate does not move), or to a one-time incentive. */
var UPLIFT = {
  pct: 0.07, rangePct: [0.06, 0.08],
  appliesTo: 'bill',
  basis: 'NextNRG brochure, Q4 2026, p. 7: "6 to 8% modelled ROI uplift" on a site pairing photovoltaic generation with storage; carried as 7%',
  caveat: 'Modelled rather than measured, site dependent (tariff, load profile, PV output, battery sizing and installed cost), and not a performance guarantee.'
};

/* Apply the uplift to a simulation's streams IN PLACE and return the
   summary; `streams` are vpp-sim's ({id, category, counted, usd, how}).
   Only a counted bill stream with dollars on it moves. */
function applyUplift(streams) {
  var touched = [], total = 0, i;
  for (i = 0; i < (streams || []).length; i++) {
    var s = streams[i];
    if (!s || s.category !== UPLIFT.appliesTo || !s.counted || !(s.usd > 0)) continue;
    var delta = Math.round(s.usd * UPLIFT.pct);
    if (!(delta > 0)) continue;
    s.usd += delta;
    s.controller = { key: CONTROLLER.key, pct: pctRound(), usd: delta };
    s.how = (s.how ? s.how + ' ' : '') + 'Includes +' + Math.round(UPLIFT.pct * 100) + '% ($' + fmt(delta)
          + ') with the ' + CONTROLLER.model + ': modelled, not measured.';
    touched.push(s.id); total += delta;
  }
  return { key: CONTROLLER.key, make: CONTROLLER.make, model: CONTROLLER.model,
           pct: pctRound(), rangePct: [Math.round(UPLIFT.rangePct[0] * 100), Math.round(UPLIFT.rangePct[1] * 100)],
           usdPerYear: total, streams: touched, appliesTo: 'the dispatch-decided bill savings (demand charges held down, time-of-use energy shifted)',
           basis: UPLIFT.basis, caveat: UPLIFT.caveat };
}

/* What a request means by "the controller": true, or its key, or its model. */
function wantsController(v) {
  if (v === true) return true;
  if (typeof v === 'string') { var s = v.trim().toLowerCase(); return s === 'true' || s === CONTROLLER.key.toLowerCase() || s === 'nextnrg' || s === 'nextnrg-mgc'; }
  if (v && typeof v === 'object') return wantsController(v.key) || wantsController(v.model) || v.present === true;
  return false;
}

function pctRound() { return Math.round(UPLIFT.pct * 100); }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

module.exports = {
  SOURCE: SOURCE, VENDOR: VENDOR,
  SOLAR_MODULE: SOLAR_MODULE, moduleWpsf: moduleWpsf,
  STORAGE_SPEC: STORAGE_SPEC, STORAGE: STORAGE,
  CONTROLLER: CONTROLLER,
  SYSTEM_RATE: SYSTEM_RATE, isVendorOrg: isVendorOrg, isNextnrgSolar: isNextnrgSolar,
  UPLIFT: UPLIFT, applyUplift: applyUplift, wantsController: wantsController
};
