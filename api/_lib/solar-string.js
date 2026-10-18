/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * String length from NEC 690.7 cold-temperature Voc and the inverter's
 * minimum power-point voltage, then combiner home runs, voltage drop,
 * and a copper conductor.
 *
 * Resistance is NEC Chapter 9, Table 8, uncoated copper, ohms per 1,000 ft
 * at 75°C. Ampacity is Table 310.16, 75°C column. Both are the published
 * code tables, not a vendor's voltage-drop spreadsheet.
 */
'use strict';

/* ohm per 1000 ft at 75°C, then ampacity at 75°C. */
var CU = [
  { awg: '14', ohm: 3.14, amp: 20 },
  { awg: '12', ohm: 1.98, amp: 25 },
  { awg: '10', ohm: 1.24, amp: 35 },
  { awg: '8', ohm: 0.778, amp: 50 },
  { awg: '6', ohm: 0.491, amp: 65 },
  { awg: '4', ohm: 0.308, amp: 85 },
  { awg: '3', ohm: 0.245, amp: 100 },
  { awg: '2', ohm: 0.194, amp: 115 },
  { awg: '1', ohm: 0.154, amp: 130 },
  { awg: '1/0', ohm: 0.122, amp: 150 },
  { awg: '2/0', ohm: 0.0967, amp: 175 },
  { awg: '3/0', ohm: 0.0766, amp: 200 },
  { awg: '4/0', ohm: 0.0608, amp: 230 },
  { awg: '250', ohm: 0.0515, amp: 255 },
  { awg: '350', ohm: 0.0367, amp: 310 },
  { awg: '500', ohm: 0.0258, amp: 380 }
];

function clamp(n, a, b) { return n < a ? a : (n > b ? b : n); }

/* Vmp temperature coefficient is not a CEC column. The published Voc
   coefficient is the voltage one. Subtracting the current coefficient
   from the power coefficient overstates how fast voltage falls, and it
   closes the string window on a 1,500 V-class inverter that a designer
   would actually string. */
function vmpCoeff(mod) {
  return mod.betaVoc;
}

function limits(mod, inv, temps) {
  var tMin = temps.tMin;
  var tCell = temps.tCellHot;
  var vocCold = mod.voc * (1 + mod.betaVoc * (tMin - 25));
  var vmpHot = mod.vmp * (1 + vmpCoeff(mod) * (tCell - 25));
  if (vocCold < mod.voc) vocCold = mod.voc;
  if (!(vmpHot > 1)) vmpHot = mod.vmp * 0.7;
  var nMax = Math.floor(inv.vdcmax / vocCold);
  var nMin = Math.ceil(inv.mpptLow / vmpHot);
  if (nMax < 1) nMax = 1;
  if (nMin < 1) nMin = 1;
  return {
    tMin: tMin,
    tCellHot: tCell,
    vocCold: Math.round(vocCold * 100) / 100,
    vmpHot: Math.round(vmpHot * 100) / 100,
    nMax: nMax,
    nMin: nMin,
    vdcmax: inv.vdcmax,
    mpptLow: inv.mpptLow,
    rule: 'NEC 690.7(A): maximum voltage is Voc at the cold design temperature using the module coefficient. The hot check holds the string above the inverter minimum power-point voltage.'
  };
}

function chooseCount(nMin, nMax, perRow) {
  if (nMin > nMax) return { ok: false, n: 0, reason: 'No string length satisfies both the cold Voc limit and the hot power-point limit. Pick a different inverter or module.' };
  var n = nMax, d;
  if (perRow > nMin) {
    for (d = nMax; d >= nMin; d--) {
      if (perRow % d === 0) { n = d; break; }
    }
  }
  return { ok: true, n: n };
}

function sizeConductor(amps, volts, lengthFt, dropLimit) {
  var i, wire, drop, pct, chosen = null;
  var need = amps;
  for (i = 0; i < CU.length; i++) {
    wire = CU[i];
    if (wire.amp + 1e-6 < need) continue;
    drop = volts > 0 ? (2 * amps * (wire.ohm / 1000) * lengthFt) / volts * 100 : 0;
    pct = Math.round(drop * 100) / 100;
    if (!chosen) chosen = { awg: wire.awg, ampacity: wire.amp, dropPct: pct, ohmPerKft: wire.ohm };
    if (pct <= dropLimit) return { awg: wire.awg, ampacity: wire.amp, dropPct: pct, ohmPerKft: wire.ohm, ok: true };
  }
  if (!chosen) return { awg: null, dropPct: null, ok: false, reason: 'No copper size in the table carries this current.' };
  chosen.ok = false;
  chosen.reason = 'The largest conductor still drops ' + chosen.dropPct + '% at this length. The limit asked for was ' + dropLimit + '%.';
  return chosen;
}

function design(opts) {
  opts = opts || {};
  var mod = opts.module, inv = opts.inverter, lay = opts.layout;
  if (!mod || !inv || !lay || !lay.ok) return { ok: false, reason: 'Stringing needs a module, an inverter, and a layout.' };
  var temps = opts.temps || { tMin: -10, tCellHot: 65 };
  var lim = limits(mod, inv, temps);
  var longest = 0, r;
  for (r = 0; r < (lay.rows || []).length; r++) if (lay.rows[r].count > longest) longest = lay.rows[r].count;
  var pick = chooseCount(lim.nMin, lim.nMax, longest || lim.nMax);
  if (!pick.ok) return { ok: false, reason: pick.reason, limits: lim };
  var n = pick.n;
  var modules = lay.modules;
  var strings = Math.ceil(modules / n);
  var dcAc = opts.dcAc > 0 ? opts.dcAc : 1.25;
  var targetAc = (modules * mod.watts) / dcAc;
  var nInv = Math.max(1, Math.ceil(targetAc / inv.paco));
  var pac = nInv * inv.paco;
  var pdc = modules * mod.watts;
  var actual = pac > 0 ? pdc / pac : 0;
  var poles = opts.combinerPoles || 12;
  var combiners = Math.ceil(strings / poles);
  var stringsOn = Math.ceil(strings / combiners);
  var stringFt = opts.stringFt;
  if (!(stringFt > 0)) {
    var along = longest * (lay.acrossFt || 4);
    stringFt = along / 2 + 15;
  }
  var homeFt = opts.homeRunFt > 0 ? opts.homeRunFt : (opts.homeRunFt === 0 ? 30 : (lay.pitchFt || 20) * Math.max(1, lay.rowCount) / 2 + 40);
  var stringV = n * mod.vmp;
  var stringI = 1.25 * mod.isc;
  var homeI = 1.25 * mod.isc * stringsOn;
  var homeV = stringV;
  var dropLimit = opts.dropLimitPct == null ? 2 : opts.dropLimitPct;
  var stringWire = sizeConductor(stringI, stringV, stringFt, dropLimit);
  var homeWire = sizeConductor(homeI, homeV, homeFt, dropLimit);
  var stringDrop = stringWire.dropPct || 0;
  var homeDrop = homeWire.dropPct || 0;
  var wiringLoss = (stringDrop + homeDrop) / 100;
  if (wiringLoss < 0) wiringLoss = 0;
  if (wiringLoss > 0.1) wiringLoss = 0.1;
  var oneLine = [
    modules + ' × ' + mod.manufacturer + ' ' + mod.name + ' (' + mod.watts + ' W)',
    strings + ' strings of ' + n,
    combiners + ' combiner' + (combiners === 1 ? '' : 's') + ' (' + poles + ' poles)',
    'home run ' + (homeWire.awg || '—') + ' Cu, ' + Math.round(homeFt) + ' ft',
    nInv + ' × ' + inv.name + ' (' + inv.kwAc + ' kW)',
    'AC ' + inv.vac + ' V to the point of interconnection'
  ].join(' → ');
  return {
    ok: true,
    modulesPerString: n,
    strings: strings,
    inverters: nInv,
    combiners: combiners,
    poles: poles,
    stringsPerCombiner: stringsOn,
    kwDc: Math.round(pdc / 100) / 10,
    kwAc: Math.round(pac / 100) / 10,
    dcAc: Math.round(actual * 100) / 100,
    dcAcTarget: dcAc,
    limits: lim,
    string: { ft: Math.round(stringFt), amps: Math.round(stringI * 10) / 10, volts: Math.round(stringV), conductor: stringWire },
    homeRun: { ft: Math.round(homeFt), amps: Math.round(homeI * 10) / 10, volts: Math.round(homeV), conductor: homeWire },
    wiringLoss: Math.round(wiringLoss * 10000) / 10000,
    dropPct: Math.round((stringDrop + homeDrop) * 100) / 100,
    oneLine: oneLine
  };
}

module.exports = {
  CU: CU,
  vmpCoeff: vmpCoeff,
  limits: limits,
  chooseCount: chooseCount,
  sizeConductor: sizeConductor,
  design: design,
  VERSION: 'solar-string/1'
};
