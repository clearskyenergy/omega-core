/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Screening electrical takeoff. Conductor ampacity is NEC 2023 Table 310.16,
   75°C copper. Continuous feeder sizing is NEC 215.2(A)(1), 125%. Equipment
   grounding is NEC 250.122. This is not a stamped design. Unit prices are
   not invented: the caller prices only what the library has sourced. */
'use strict';

/* Ampacity, 75°C copper, NEC 2023 Table 310.16. Sizes the takeoff actually
   selects. Not a reproduction of the whole table. */
var AMPACITY = [
  { size: '6 AWG', amps: 65 },
  { size: '4 AWG', amps: 85 },
  { size: '3 AWG', amps: 100 },
  { size: '2 AWG', amps: 115 },
  { size: '1 AWG', amps: 130 },
  { size: '1/0 AWG', amps: 150 },
  { size: '2/0 AWG', amps: 175 },
  { size: '3/0 AWG', amps: 200 },
  { size: '4/0 AWG', amps: 230 },
  { size: '250 kcmil', amps: 255 },
  { size: '300 kcmil', amps: 285 },
  { size: '350 kcmil', amps: 310 },
  { size: '400 kcmil', amps: 335 },
  { size: '500 kcmil', amps: 380 },
  { size: '600 kcmil', amps: 420 },
  { size: '750 kcmil', amps: 475 },
  { size: '1000 kcmil', amps: 545 }
];

/* Standard overcurrent ratings, NEC 240.6(A), the steps this takeoff uses. */
var OCPD = [100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000];

/* Copper equipment grounding conductor, NEC 250.122, for the rating above. */
var EGC = [
  { amps: 100, size: '8 AWG' },
  { amps: 200, size: '6 AWG' },
  { amps: 300, size: '4 AWG' },
  { amps: 400, size: '3 AWG' },
  { amps: 500, size: '2 AWG' },
  { amps: 600, size: '1 AWG' },
  { amps: 800, size: '1/0 AWG' },
  { amps: 1000, size: '2/0 AWG' },
  { amps: 1200, size: '3/0 AWG' },
  { amps: 1600, size: '4/0 AWG' },
  { amps: 2000, size: '250 kcmil' },
  { amps: 2500, size: '350 kcmil' },
  { amps: 3000, size: '400 kcmil' },
  { amps: 4000, size: '500 kcmil' },
  { amps: 5000, size: '700 kcmil' },
  { amps: 6000, size: '800 kcmil' }
];

var SET_SIZE = '500 kcmil';
var SET_AMPS = 380;
var SQRT3 = Math.sqrt(3);
/* Power factor used when the caller does not give one: the Q1 2025 utility
   benchmark describes its transformer at 0.8 pf. */
var PF = 0.8;

function round(x) { return Math.round(x); }

function nextOcpd(amps) {
  var i;
  for (i = 0; i < OCPD.length; i++) if (OCPD[i] >= amps) return OCPD[i];
  return null;
}

function egcSize(ocpd) {
  var i;
  if (ocpd == null) return null;
  for (i = 0; i < EGC.length; i++) if (EGC[i].amps >= ocpd) return EGC[i].size;
  return null;
}

function selectConductor(designA) {
  var i, row;
  if (!(designA > 0)) return { size: null, amps: null, sets: 0 };
  for (i = 0; i < AMPACITY.length; i++) {
    row = AMPACITY[i];
    if (row.amps >= designA) return { size: row.size, amps: row.amps, sets: 1 };
  }
  return { size: SET_SIZE, amps: SET_AMPS, sets: Math.ceil(designA / SET_AMPS) };
}

/* spec: { kw, voltage, phases, pf, trenchFt, hours }
   Low-voltage (600 V class and below) is sized. Above that, the feeder is
   medium voltage and this table does not apply. */
function takeoff(spec) {
  spec = spec || {};
  var kw = +spec.kw || 0;
  var voltage = +spec.voltage || 480;
  var phases = spec.phases == null ? 3 : +spec.phases;
  var pf = spec.pf > 0 ? +spec.pf : PF;
  var trenchFt = spec.trenchFt > 0 ? +spec.trenchFt : 0;
  var out = {
    applies: false,
    voltage: voltage,
    kw: kw,
    pf: pf,
    pfAssumed: !(spec.pf > 0),
    currentA: null,
    designA: null,
    ocpdA: null,
    sets: 0,
    conductor: null,
    conductorAmps: null,
    ground: null,
    trenchFt: trenchFt,
    transformerKva: null,
    notes: []
  };
  if (!(kw > 0)) {
    out.notes.push('No power was given, so no feeder was sized.');
    return out;
  }
  if (voltage > 600) {
    out.notes.push('Service is above 600 V. Table 310.16 does not size the medium-voltage cable. Conductor, conduit, and trench unit prices are needs source.');
    out.transformerKva = round(kw / pf);
    return out;
  }
  var denom = voltage * (phases === 3 ? SQRT3 : 1) * (phases === 1 ? 1 : 1);
  if (phases === 1) denom = voltage;
  var current = (kw * 1000) / denom;
  var design = current * 1.25;
  var pick = selectConductor(design);
  var ocpd = nextOcpd(design);
  out.applies = true;
  out.currentA = round(current);
  out.designA = round(design);
  out.ocpdA = ocpd;
  out.sets = pick.sets;
  out.conductor = pick.size;
  out.conductorAmps = pick.amps;
  out.ground = egcSize(ocpd);
  out.transformerKva = round(kw / pf);
  out.notes.push('Screening takeoff. Feeder sized at 125% of the calculated current for a continuous load (NEC 215.2(A)(1)). Conductor is 75°C copper (NEC 2023 Table 310.16).');
  if (out.pfAssumed) out.notes.push('Power factor 0.8 is the figure named on the Q1 2025 utility benchmark transformer, used because the project did not state one. Transformer dollars are needs source.');
  if (pick.sets > 1) out.notes.push('Above a single 1,000 kcmil, the feeder is parallel sets of 500 kcmil. That set size is a screening choice, not a code maximum.');
  if (!out.ground) out.notes.push('The overcurrent rating is above the grounding sizes loaded from NEC 250.122. Grounding is needs source.');
  if (!(trenchFt > 0)) out.notes.push('No trench length was on the drawing, so trench quantity is zero.');
  return out;
}

module.exports = {
  takeoff: takeoff,
  AMPACITY: AMPACITY,
  OCPD: OCPD,
  EGC: EGC,
  PF: PF
};
