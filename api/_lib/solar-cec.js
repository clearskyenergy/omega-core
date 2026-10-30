/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * A working slice of the public California Energy Commission module and
 * inverter lists, as distributed in the NREL SAM library
 * (CEC Modules.csv, CEC Inverters.csv), read 2026-10-18.
 * The full list is about 21,000 modules. This file keeps the modules and
 * inverters a commercial design actually starts from. Coefficients stay
 * on the server.
 *
 * gammaPmp, betaVoc and alphaIsc are fractions per °C (CEC publishes
 * gamma as percent and beta/alpha as volts and amps per °C).
 * Frame length and width are derived from the CEC area at 2.1:1 when the
 * list leaves length blank. Area is the CEC figure.
 */
'use strict';

var FT = 3.280839895;

function mod(row) {
  var area = row.areaM2;
  var widthM = Math.sqrt(area / 2.1);
  var lengthM = area / widthM;
  return {
    key: row.key,
    name: row.name,
    manufacturer: row.manufacturer,
    technology: row.technology,
    bifacial: row.bifacial,
    watts: row.stc,
    ptc: row.ptc,
    areaM2: area,
    lengthM: Math.round(lengthM * 1000) / 1000,
    widthM: Math.round(widthM * 1000) / 1000,
    lengthFt: lengthM * FT,
    widthFt: widthM * FT,
    isc: row.isc,
    voc: row.voc,
    imp: row.imp,
    vmp: row.vmp,
    alphaIsc: row.alpha / row.isc,
    betaVoc: row.beta / row.voc,
    gammaPmp: row.gamma / 100,
    noct: row.noct,
    cells: row.ns,
    source: 'CEC via NREL SAM library, read 2026-10-18'
  };
}

var MODULES = [
  mod({ key: 'jinko-jkm640', name: 'JKM640N-66HL4M-BDV', manufacturer: 'Jinko Solar', technology: 'Mono-c-Si', bifacial: true, stc: 640, ptc: 603.7, areaM2: 2.7, isc: 16.32, voc: 49.88, imp: 15.5, vmp: 41.3, alpha: 0.0071808, beta: -0.1281916, gamma: -0.299, noct: 46.03, ns: 22 }),
  mod({ key: 'jinko-jkm650', name: 'JKM650N-66HL4M-BDV', manufacturer: 'Jinko Solar', technology: 'Mono-c-Si', bifacial: true, stc: 650, ptc: 613.4, areaM2: 2.7, isc: 16.44, voc: 50.28, imp: 15.64, vmp: 41.57, alpha: 0.0072336, beta: -0.1292196, gamma: -0.299, noct: 46.03, ns: 66 }),
  mod({ key: 'qcells-675', name: 'Q.PEAK DUO ML-G12S3/BFG 675', manufacturer: 'Qcells', technology: 'Mono-c-Si', bifacial: true, stc: 675, ptc: 635.2, areaM2: 3.03, isc: 18.45, voc: 45.74, imp: 17.56, vmp: 38.43, alpha: 0.0071955, beta: -0.1202962, gamma: -0.347, noct: 43.39, ns: 66 }),
  mod({ key: 'rec-640', name: 'REC640AA Pro M', manufacturer: 'REC Group', technology: 'Mono-c-Si', bifacial: true, stc: 640, ptc: 610.7, areaM2: 2.77, isc: 17.89, voc: 44.9, imp: 17.26, vmp: 37.1, alpha: 0.0075138, beta: -0.103719, gamma: -0.239, noct: 45.97, ns: 60 }),
  mod({ key: 'longi-605', name: 'LR5-78HBD-605M', manufacturer: 'LONGi', technology: 'Mono-c-Si', bifacial: true, stc: 605, ptc: 572, areaM2: 2.72, isc: 14.09, voc: 54.2, imp: 13.25, vmp: 45.67, alpha: 0.0045088, beta: -0.127912, gamma: -0.31, noct: 44.01, ns: 78 }),
  mod({ key: 'csi-600', name: 'CS6W-600TB-AG', manufacturer: 'CSI Solar', technology: 'Mono-c-Si', bifacial: true, stc: 600, ptc: 570.1, areaM2: 2.51, isc: 14.18, voc: 53, imp: 13.68, vmp: 43.9, alpha: 0.0064519, beta: -0.09805, gamma: -0.2908, noct: 44.1, ns: 72 }),
  mod({ key: 'ja-635', name: 'JAM66D45-635/LB', manufacturer: 'JA Solar', technology: 'Mono-c-Si', bifacial: true, stc: 635, ptc: 597.2, areaM2: 2.64, isc: 16.21, voc: 49.1, imp: 15.51, vmp: 40.94, alpha: 0.0066461, beta: -0.121277, gamma: -0.317, noct: 45.95, ns: 66 }),
  mod({ key: 'firstsolar-550', name: 'FS-7550A-FT1', manufacturer: 'First Solar', technology: 'CdTe', bifacial: false, stc: 550, ptc: 512.3, areaM2: 2.8, isc: 3.08, voc: 228.8, imp: 2.89, vmp: 190.4, alpha: 0.001463, beta: -0.6221072, gamma: -0.2947, noct: 48.94, ns: 268 })
];

function inv(row) {
  return {
    key: row.key,
    name: row.name,
    manufacturer: row.manufacturer,
    vac: row.vac,
    paco: row.paco,
    pdco: row.pdco,
    vdco: row.vdco,
    pso: row.pso,
    pnt: row.pnt,
    c0: row.c0, c1: row.c1, c2: row.c2, c3: row.c3,
    vdcmax: row.vdcmax,
    idcmax: row.idcmax,
    mpptLow: row.mpptLow,
    mpptHigh: row.mpptHigh,
    kwAc: Math.round(row.paco / 10) / 100,
    source: 'CEC via NREL SAM library, read 2026-10-18'
  };
}

var INVERTERS = [
  inv({ key: 'cps-125', name: 'CPS ECB125KTL-M/US-480', manufacturer: 'Chint Power Systems', vac: 480, paco: 125000, pdco: 128603, vdco: 925, pso: 268.672, pnt: 5.8, c0: -1.01551e-7, c1: 2.04023e-5, c2: 0.00109184, c3: -0.000119302, vdcmax: 1100, idcmax: 139.03, mpptLow: 750, mpptHigh: 1100 }),
  inv({ key: 'sma-125', name: 'SMA SHP 125-US-20', manufacturer: 'SMA', vac: 480, paco: 125000, pdco: 127378, vdco: 830, pso: 135.941, pnt: 5.37, c0: -1.01828e-7, c1: 8.92279e-6, c2: 0.00237026, c3: 0.000131332, vdcmax: 1200, idcmax: 153.468, mpptLow: 705, mpptHigh: 1200 }),
  inv({ key: 'sungrow-125', name: 'Sungrow SG125HV', manufacturer: 'Sungrow', vac: 600, paco: 125000, pdco: 127418, vdco: 945, pso: 97.9892, pnt: 5.59, c0: -8.60718e-8, c1: 1.83602e-5, c2: 0.00417508, c3: 0.0024596, vdcmax: 1200, idcmax: 134.834, mpptLow: 860, mpptHigh: 1200 }),
  inv({ key: 'solaredge-110', name: 'SolarEdge SE110KUS', manufacturer: 'SolarEdge', vac: 480, paco: 109988, pdco: 111889, vdco: 850, pso: 300.458, pnt: 7.3, c0: -8.42229e-8, c1: 2.12272e-5, c2: 0.00406884, c3: 0.00442437, vdcmax: 950, idcmax: 131.635, mpptLow: 795, mpptHigh: 950 }),
  inv({ key: 'huawei-100', name: 'Huawei SUN2000-100KTL-USH0', manufacturer: 'Huawei', vac: 800, paco: 100000, pdco: 101448, vdco: 1120, pso: 180.746, pnt: 2.61, c0: -8.38884e-8, c1: -1.08228e-5, c2: 9.35388e-7, c3: 0.00157648, vdcmax: 1200, idcmax: 90.5781, mpptLow: 880, mpptHigh: 1200 }),
  inv({ key: 'solectria-100', name: 'Solectria PVI-100TL-480', manufacturer: 'Yaskawa Solectria', vac: 480, paco: 100000, pdco: 101978, vdco: 720, pso: 195.947, pnt: 21.54, c0: -9.02014e-8, c1: -2.42851e-5, c2: -0.00113853, c3: -0.000624912, vdcmax: 850, idcmax: 141.636, mpptLow: 340, mpptHigh: 850 }),
  /* 60 kW class, 1,300 V. The 125 kW units are too big for this block.
     CEC measured Paco is 66 kW. Read 2026-10-18. */
  inv({ key: 'sungrow-60', name: 'Sungrow SC60HV', manufacturer: 'Sungrow', vac: 480, paco: 66000, pdco: 67413.2, vdco: 850, pso: 164.592, pnt: 0.26, c0: -1.66958e-7, c1: 1.40636e-5, c2: 0.00190885, c3: 0.000305414, vdcmax: 1300, idcmax: 79.3096, mpptLow: 700, mpptHigh: 1300 })
];

function byKey(list, key) {
  var i;
  for (i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return null;
}
function moduleByKey(key) { return byKey(MODULES, key) || MODULES[0]; }
function inverterByKey(key) { return byKey(INVERTERS, key) || INVERTERS[0]; }

function publicCatalog() {
  return {
    modules: MODULES.map(function (m) {
      return { key: m.key, name: m.name, manufacturer: m.manufacturer, watts: m.watts, voc: m.voc, vmp: m.vmp, isc: m.isc, technology: m.technology };
    }),
    inverters: INVERTERS.map(function (m) {
      return { key: m.key, name: m.name, manufacturer: m.manufacturer, kwAc: m.kwAc, vac: m.vac, vdcmax: m.vdcmax, mpptLow: m.mpptLow, mpptHigh: m.mpptHigh };
    })
  };
}

module.exports = {
  MODULES: MODULES,
  INVERTERS: INVERTERS,
  moduleByKey: moduleByKey,
  inverterByKey: inverterByKey,
  publicCatalog: publicCatalog,
  VERSION: 'solar-cec/1'
};
