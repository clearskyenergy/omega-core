/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/pod-spec.js — the 1 MW liquid-cooled compute POD as its maker
   specifies it, BY CHIP: the ONE record
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   (2026-11-11, Tommy, of the maker's product overview: "Let's base it off
   the chips this is the first real spec sheet we have received and it's
   very detailed".)

   Until this sheet the site assessment sized a "1 MW pod" as 1 MW of IT at
   an assumed PUE. A real pod is 1 MW of COOLING: what it carries depends on
   the chip racked in it, and so do the GPUs sold, the power at the meter
   and the hours it is capped in the heat. This file is that sheet, and
   nothing else: every figure below is the maker's own, as STATED on a
   document that says of itself it is for information only, not an offer,
   and that any figure may change. Nothing here is a quote.

   WHAT IS NOT HERE, because the sheet does not say it: any price (the
   maker prices per kW of usable IT a month, or a one-time equipment price,
   by proposal), any revenue, and a public price for a chip. A return is
   the contract engine's, on the chip library's public reference price or a
   price the workspace sets; the capital is the engine's estimate until the
   maker quotes. A chip the library does not carry is SIZED and not priced.

   THIS IS THE BASELINE for the compute model's physical figures (POD.baseline):
   an answer sized on it says where the figures come from and what they do
   not cover. A later sheet, or a quote, replaces figures HERE and moves
   VERSION, so every stored answer resting on the old ones reads stale.

   PURE, ES5, server-side. Read only by a workspace whose settings ask for
   the chip basis (portfolio/assess.js, compute.basis 'chips'): the sheet is
   the maker's confidential document, so it is never a default for every
   tenant and never reaches a browser but as an answer.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var VERSION = '2026-11.2';

var POD = {
  key: 'sonic', maker: 'Runware', name: 'Sonic Pod', label: 'Runware Sonic Pod',
  sheet: { title: 'Sonic Pod System, product overview', dated: '2026-11', standing: 'As stated by the maker: for information only, not an offer, and any figure may change' },
  /* THE BASELINE (2026-11-11, Tommy: "We need to note that our baseline data comes from here"): this sheet is where the
     compute model's physical figures come from, and every answer sized on it says so. What it is the baseline FOR is
     named, because it is not the baseline for the money: the sheet carries no price and no revenue. */
  baseline: { covers: ['GPUs a pod', 'usable IT by chip', 'power at the meter (design pPUE)', 'pods a site', 'the pad', 'the feed', 'the heat limits'], notCovered: ['the pod’s price', 'the GPU-hour price', 'the offtake'],
    words: 'Baseline: the pod’s GPUs, usable IT, power at the meter, heat limits and site requirements are Runware’s Sonic Pod System product overview of November 2026, the first maker’s specification on file. It is not the baseline for the money: the sheet carries no pod price, no GPU-hour price and no offtake' },
  coolingKw: 1000,            /* liquid cooling capacity a pod */
  airCoolingKw: 98.5,         /* auxiliary air cooling */
  ppue: 1.091,                /* design pPUE at 1 MW full load, closed loop (liquid loop 1.057 + 34.1 kW of air units) */
  rackPositions: 4, rackKw: 250,
  /* a distributed site: stand-alone pods, each on one feed, no UPS or generator */
  site: { maxPods: 4, feedsPerPod: 1, backupPower: false },
  electrical: { voltage: '480Y/277 V', connectionsPerPod: 12 },
  pad: { lengthFt: 21, widthFt: 9, ratedTonnes: 60, betweenPodsM: 2, betweenPodsFt: 6.56 },
  /* WHAT THE SITE HAS TO GIVE A POD (2026-11-21, Tommy: "Here are site screening requirements for compute"): the maker's
     own site and power requirements sheet (issue 1, September 2026), the figures a site owner or utility needs to quote.
     The one that moves the screen: EVERY pod's connection must carry 1 MW continuous, whatever chip is racked in it, so a
     site is screened on 1,000 kW a pod, never on the chip's own draw. The sheet and the product overview differ on the
     voltage at the pod (415Y/240 V here, 480Y/277 V there): both are kept and the difference is said. */
  siting: { sheet: 'Site and power requirements, issue 1, September 2026', connectionKw: 1000, transformerKva: { min: 1250, max: 1500 },
    supplyUs: '415Y/240 V, 3-phase, 4-wire plus protective earth, 60 Hz, at the pod', typicalKw: [500, 800], loadFactorPct: { low: 50, high: 80, typical: 65 },
    footprintFt: { l: 20, w: 8 }, footprintSqFt: 160, heightFt: 20, weightTonnes: 17, cornerTonnes: [6, 9],
    foundation: 'a level concrete pad or slab, or four ground screws on prepared level ground',
    feed: 'a single radial feed; a second feed from an independent circuit, or batteries, are options', fibre: { minGbps: 10, preferredGbps: 100 } },
  shipping: { sections: 2, container: '20 ft', coolingSectionKg: 8000, computeSectionKg: 12000, commissioningHours: 48 },
  water: false,
  /* outdoor dry bulb: the operating range, and the heat the loop carries at NVIDIA's 45 °C supply ceiling */
  ambient: { minC: -20, maxC: 40, liquidKwAt: [{ outdoorC: 35, kw: 850 }, { outdoorC: 40, kw: 420 }] },
  connectivity: 'two carriers, or one carrier with a physically separate second route',
  operations: { remoteHandsMinutes: 30, utilityAvailabilityPct: 99.9 },
  /* how the maker sells it: stated terms, no figure */
  commercial: { minTermMonths: 60, advancePct: 30, availabilityPct: 99.95, power: 'passed through at cost', priced: false }
};

/* What ONE stand-alone pod carries, by chip. itKw is the usable IT the sheet
   gives for the pod (rated); peakItKw is what the meter must carry. liquidKw
   is the heat to the liquid loop, the figure the thermal table is read
   against. `chipset` is the chip library's key (omega-compute-model.js);
   null where the library does not carry the chip. holdsToC: the outdoor
   temperature to which the 40 °C supply setpoint holds; fullToC: where the
   45 °C ceiling is reached and rack power is capped. */
var PLATFORMS = [
  { key: 'rtx6000', chipset: 'rtx6000', name: 'NVIDIA RTX PRO 6000', short: 'RTX PRO 6000', gpus: 432, itKw: 430, peakItKw: 430, liquidKw: null,
    hardware: '108 four-GPU servers', holdsToC: null, fullToC: null, estimate: 'the pod’s power is the maker’s own estimate (up to 600 W a GPU plus the hosts)' },
  { key: 'gb300', chipset: 'gb300', name: 'NVIDIA GB300 NVL72', short: 'GB300 NVL72', gpus: 288, racks: 4, itKw: 600, peakItKw: 680, liquidKw: 473,
    hardware: '4 NVL72 racks', holdsToC: 34.5, fullToC: 39.4, estimate: null },
  { key: 'vr-maxq', chipset: null, name: 'NVIDIA Vera Rubin NVL72 (Max Q)', short: 'Vera Rubin NVL72, Max Q', gpus: 288, racks: 4, itKw: 748, peakItKw: 748, liquidKw: 718,
    hardware: '4 NVL72 racks at the Max Q power profile', holdsToC: null, fullToC: null, estimate: null },
  { key: 'vr-maxp', chipset: null, name: 'NVIDIA Vera Rubin NVL72 (Max P)', short: 'Vera Rubin NVL72, Max P', gpus: 288, racks: 4, itKw: 908, peakItKw: 908, liquidKw: 872,
    hardware: '4 NVL72 racks at the Max P power profile', holdsToC: 29.9, fullToC: 34.8, estimate: null }
];

function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function platform(key) { key = String(key || '').toLowerCase(); return PLATFORMS.filter(function (p) { return p.key === key; })[0] || null; }
/* the platform a workspace's chip names: its own key, else the first that racks that library chip */
function platformFor(chip) { chip = String(chip || '').toLowerCase(); return platform(chip) || PLATFORMS.filter(function (p) { return p.chipset && p.chipset === chip; })[0] || null; }

/* one pod of a platform at the meter: what must be FREE (its peak) and what it draws (its rated load) */
function atMeter(p) {
  var peak = Math.round(p.peakItKw * POD.ppue), draw = Math.round(p.itKw * POD.ppue * 100) / 100, need = POD.siting.connectionKw;
  /* needKw: the connection the maker asks for, the same for every chip. peakKw: what this chip's pod draws at its peak. */
  return { needKw: need, peakKw: peak, drawKw: draw, overheadKw: need - p.peakItKw };
}
/* WHAT THE MAKER ASKS A SITE TO CONFIRM, so sites are compared on one basis: its own list, in its order */
var QUESTIONS = [
  ['power-price', 'Power price: all-in delivered price a kWh, and any demand charge, standing charge or minimum take'],
  ['facility-charge', 'Facility charge: any ground or facility charge and how it is levied'],
  ['pad', 'Pad: whether a level concrete pad or slab is in place, its size and load rating, or the cost and time to provide one'],
  ['capacity', 'Capacity: firm capacity available now and at full build'],
  ['timing', 'Timing: the energisation date of each tranche of capacity'],
  ['service', 'Service: the utility service voltage and feed configuration'],
  ['site-control', 'Site control: its status, and any permitting or ordinance dependency'],
  ['fibre', 'Fibre: carriers on or near the site, the cost of bringing fibre to the pad, and whether BGP is available'],
  ['security', 'Security: distance to the closest police station'],
  ['remote-hands', 'Remote hands: for the IT load, power, and cleaning the cooling'],
  ['address', 'Address: the exact address of the site'],
  ['map', 'Map location: the exact point on the map']
];

/* THE HEAT. The pod rejects to outdoor air with no chiller, so the hottest
   hours decide what it carries: read off the sheet's own table, never
   interpolated. `share` is the part of the platform's rack power the loop
   still carries at that outdoor temperature (1 = not capped). A platform
   whose heat to liquid the sheet does not give is not judged. */
function thermalOf(p) {
  var rows = POD.ambient.liquidKwAt.map(function (r) {
    var share = p.liquidKw == null ? null : Math.min(1, Math.round(r.kw / p.liquidKw * 100) / 100);
    return { outdoorC: r.outdoorC, loopKw: r.kw, share: share };
  });
  var capped = rows.filter(function (r) { return r.share != null && r.share < 1; });
  var words;
  if (p.liquidKw == null) words = 'This configuration uses under half of the pod’s 1 MW loop, so it holds full power to a higher outdoor temperature than the denser racks; the maker gives no figure for it.';
  else if (!capped.length) words = 'The loop carries this configuration’s ' + fmt(p.liquidKw) + ' kW of heat across the pod’s whole operating range, to ' + POD.ambient.maxC + ' °C outdoor.';
  else words = (p.fullToC != null ? 'Full power to about ' + p.fullToC + ' °C outdoor; above that the racks are capped. ' : 'The maker gives no derate point for this power profile. ') +
    capped.map(function (r) { return 'At ' + r.outdoorC + ' °C the loop carries about ' + fmt(r.loopKw) + ' kW, ' + Math.round(r.share * 100) + '% of this configuration’s ' + fmt(p.liquidKw) + ' kW'; }).join('; ') +
    '. The pod runs from ' + POD.ambient.minC + ' to ' + POD.ambient.maxC + ' °C; the site’s design ambient is not on file, so no capped hours are counted in the return.';
  return { liquidKw: p.liquidKw, holdsToC: p.holdsToC, fullToC: p.fullToC, rows: rows, derates: capped.length > 0, words: words };
}

/* what the site has to provide for a pod, in the maker's terms: words for the card and the report */
function requirements(pods) {
  var n = pods > 1 ? pods : 1;
  return [
    'Power: ' + (n > 1 ? 'a connection a pod, each' : 'a connection') + ' carrying ' + fmt(POD.siting.connectionKw) + ' kW continuous whatever is racked in the pod (it typically runs at ' + POD.siting.typicalKw[0] + ' to ' + POD.siting.typicalKw[1] + ' kW, a load factor near ' + POD.siting.loadFactorPct.typical + '%). The transformer and switchgear above 1 MVA, likely ' + (POD.siting.transformerKva.min / 1000) + ' to ' + (POD.siting.transformerKva.max / 1000) + ' MVA a pod.',
    'Supply: ' + POD.siting.supplyUs + '; any transformation from the utility’s 480Y/277 V or medium voltage is the site’s to provide. The maker’s product overview names ' + POD.electrical.voltage + ' as its standard configuration: confirm which before the one-line is drawn.',
    'Feed: ' + POD.siting.feed + '. With one feed and no backup a utility outage stops the pod, and it restarts when power returns; the maker asks for a utility supply of ' + POD.operations.utilityAvailabilityPct + '% availability or better.',
    'Pad: ' + (n > 1 ? n + ' pods on one prepared area, each' : 'one pod') + ' ' + POD.siting.footprintFt.l + ' × ' + POD.siting.footprintFt.w + ' ft and ' + POD.siting.heightFt + ' ft tall (two stacked containers), ' + POD.siting.weightTonnes + ' metric tons in service on four corners of ' + POD.siting.cornerTonnes[0] + ' to ' + POD.siting.cornerTonnes[1] + ' tons each. On ' + POD.siting.foundation + (n > 1 ? ', ' + POD.pad.betweenPodsM + ' m (' + POD.pad.betweenPodsFt + ' ft) between pods: they are networked together, so scattered positions need the maker’s say' : '') + '. Truck and crane access.',
    'Delivery: each pod ships as two ' + POD.shipping.container + ' container sections (about ' + fmt(POD.shipping.coolingSectionKg / 1000) + ' and up to ' + fmt(POD.shipping.computeSectionKg / 1000) + ' metric tons) and is joined on site, typically within ' + POD.shipping.commissioningHours + ' hours.',
    'Water: none. The loop is closed and rejects heat to outdoor air; coolant is topped up at maintenance.',
    'Fibre: ' + POD.siting.fibre.minGbps + ' Gbps at least, ' + POD.siting.fibre.preferredGbps + ' Gbps or better preferred; ' + POD.connectivity + '. A site with a single provider can work but ranks lower with the maker.',
    'Operations: remote hands within a ' + POD.operations.remoteHandsMinutes + '-minute drive; perimeter fencing and site security.',
    'Commercial, as the maker states it: a minimum term of ' + POD.commercial.minTermMonths + ' months, a ' + POD.commercial.advancePct + '% advance on a managed service, power ' + POD.commercial.power + '. No price is on the sheet.'
  ];
}

module.exports = { VERSION: VERSION, POD: POD, PLATFORMS: PLATFORMS, QUESTIONS: QUESTIONS, platform: platform, platformFor: platformFor, atMeter: atMeter, thermalOf: thermalOf, requirements: requirements };
