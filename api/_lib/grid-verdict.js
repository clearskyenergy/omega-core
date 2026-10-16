/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The grid verdict for ONE site against ONE unit (docs/GUIDED-SITE-FLOW.md,
   2026-10-16, Tommy: "that's how the Grid Atlas should work, and we should
   have the Grid Atlas built into the editor"). Site Map's Grid panel sends
   the nearest substation (from the Grid Atlas service), the circuit at the
   parcel (from the utility's own hosting map, read through
   omega-comed-layers.js probePoint) and the unit chosen in the BESS Guided
   Build; this answers the substation's chip and the circuit's verdict —
   Fits / Fits only smaller / Needs a study — in words a rep can say to a
   client. Pure, ES5, no I/O. Eligibility logic, so it lives here and never
   in the page (CLAUDE.md, IP protection): the distances, voltage classes and
   the smallest unit worth offering do not leave this side.

   What it never does: invent a figure. A circuit with no published hosting
   is a study, never a fit; a substation with no voltage on record says so;
   the queue is SUBTRACTED, because the utility publishes hosting gross of
   the DER already waiting on the feeder. */
'use strict';

var VERSION = 'grid-verdict-v1';
var KM_PER_MILE = 1.609344;

/* A run of a mile or less is a short tap; past five miles the line is a
   cost of its own. Measured straight-line, so these are screening bands. */
var RUN = [
  { maxKm: 1.6, key: 'short', word: 'Short run' },
  { maxKm: 8, key: 'moderate', word: 'Moderate run' },
  { maxKm: Infinity, key: 'long', word: 'Long run' }
];
/* The lowest substation class that usually takes a project this size.
   A distribution-connected unit up to 5 MW rides a feeder out of any
   distribution substation, so any recorded voltage serves it. */
var VOLTAGE = [
  { maxMw: 5, minKv: 0 },
  { maxMw: 20, minKv: 34.5 },
  { maxMw: 100, minKv: 69 },
  { maxMw: Infinity, minKv: 138 }
];
/* Below this a smaller unit is not a product worth offering on this
   circuit; it is a study. */
var SMALLEST_OFFER_KW = 250;
/* A fit that leaves less than this share of the room is said to be thin. */
var THIN_SHARE = 0.10;

function num(v) { if (v === null || v === undefined || v === '') return null; var n = +v; return isFinite(n) ? n : null; }
function round(n) { return n == null ? null : Math.round(n); }
function kwWords(kw) {
  if (kw == null) return '';
  return kw >= 1000 ? (Math.round(kw / 100) / 10).toLocaleString('en-US') + ' MW' : Math.round(kw).toLocaleString('en-US') + ' kW';
}
function kwFull(kw) { return Math.round(kw).toLocaleString('en-US') + ' kW'; }

function unitOf(u) {
  u = u || {};
  var kw = num(u.kw), kwh = num(u.kwh);
  return { kw: kw != null && kw > 0 ? kw : null, kwh: kwh != null && kwh > 0 ? kwh : null,
           name: String(u.name || '').slice(0, 120) };
}

function substation(s, unit) {
  if (!s || typeof s !== 'object') return null;
  var km = num(s.km);
  if (km == null && num(s.miles) != null) km = num(s.miles) * KM_PER_MILE;
  var kv = num(s.kv);
  if (kv != null && kv <= 0) kv = null;
  var out = { name: String(s.name || 'Substation').slice(0, 120), kv: kv,
              km: km == null ? null : Math.round(km * 100) / 100,
              miles: km == null ? null : Math.round(km / KM_PER_MILE * 100) / 100 };
  var run = null, i;
  if (km != null) for (i = 0; i < RUN.length; i++) if (km <= RUN[i].maxKm) { run = RUN[i]; break; }
  var mw = unit.kw != null ? unit.kw / 1000 : null, need = null;
  if (mw != null) for (i = 0; i < VOLTAGE.length; i++) if (mw <= VOLTAGE[i].maxMw) { need = VOLTAGE[i].minKv; break; }
  var volt = kv == null ? 'unknown' : (need == null ? 'unknown' : (kv >= need ? 'right' : 'low'));
  var size = mw != null ? ' for ' + kwWords(unit.kw) : '';
  var parts = [];
  if (run) parts.push(run.word);
  else parts.push('Distance not measured');
  if (volt === 'right') parts.push('right voltage' + size);
  else if (volt === 'low') parts.push(kv + ' kV is light' + size);
  else parts.push(kv == null ? 'voltage not on record' : 'voltage on record, unit not chosen');
  var state = !run || run.key === 'long' || volt === 'low' ? 'risk'
    : (run.key === 'moderate' || volt === 'unknown' ? 'ok' : 'good');
  out.run = run ? run.key : null;
  out.voltage = volt;
  out.state = state;
  out.chip = parts.join(' · ');
  out.why = run && run.key === 'long' ? 'Past five miles the line to the grid is a cost of its own.'
    : (volt === 'low' ? 'A project this size usually connects at ' + need + ' kV or more.'
    : (volt === 'unknown' ? 'Confirm the substation voltage with the utility.' : 'Near is not the same as available: check the circuit.'));
  return out;
}

function circuit(c, unit) {
  var base = { state: 'study', label: 'Needs a study' };
  if (!c || typeof c !== 'object') {
    base.say = 'No hosting map answered at this parcel, so the circuit has to be asked of the utility.';
    base.reason = 'no-circuit';
    return base;
  }
  var published = num(c.publishedKw), queued = num(c.queuedKw);
  if (queued == null || queued < 0) queued = 0;
  var out = { utility: String(c.utility || '').slice(0, 60), id: String(c.id || c.feeder || '').slice(0, 40),
              substation: String(c.substation || c.sub || '').slice(0, 80),
              publishedKw: round(published), queuedKw: round(queued),
              addressResolved: c.addressResolved === true, grain: String(c.grain || '').slice(0, 80) };
  if (published == null) {
    out.state = 'study'; out.label = 'Needs a study'; out.reason = 'no-published-figure';
    out.netKw = null; out.headroomKw = null;
    out.say = 'The utility publishes no hosting figure for this circuit; it needs a study.';
    return out;
  }
  var net = Math.max(0, published - queued);
  out.netKw = round(net);
  out.headroomKw = unit.kw != null ? round(net - unit.kw) : null;
  var circ = out.id ? 'Circuit ' + out.id : 'The circuit';
  /* the room first, the headline after: a rep never reads the oversold number first */
  var room = circ + ' has about ' + kwFull(net) + ' of room: ' + kwFull(published) + ' published, less ' + kwFull(queued) + ' already queued.';
  if (unit.kw == null) {
    out.state = net >= SMALLEST_OFFER_KW ? 'unsized' : 'study';
    out.label = out.state === 'study' ? 'Needs a study' : 'Choose a unit';
    out.say = room + (out.state === 'study' ? ' That is too little to offer a unit without a study.' : ' Choose a unit in the BESS Guided Build to judge it.');
    out.reason = out.state === 'study' ? 'too-little-room' : 'no-unit';
    return out;
  }
  if (net >= unit.kw) {
    out.state = 'fits'; out.label = 'Fits';
    out.thin = (net - unit.kw) < net * THIN_SHARE;
    out.say = room + ' The ' + kwWords(unit.kw) + ' unit fits with ' + kwFull(net - unit.kw) + ' to spare' + (out.thin ? ', a thin margin' : '') + '.';
  } else if (net >= SMALLEST_OFFER_KW) {
    out.state = 'smaller'; out.label = 'Fits only smaller';
    out.maxKw = Math.floor(net / 10) * 10;
    out.say = room + ' The ' + kwWords(unit.kw) + ' unit does not fit; a unit up to about ' + kwFull(out.maxKw) + ' would.';
  } else {
    out.state = 'study'; out.label = 'Needs a study'; out.reason = 'too-little-room';
    out.say = room + ' That is too little for the ' + kwWords(unit.kw) + ' unit; it needs a study or a service upgrade.';
  }
  if (!out.addressResolved) out.say += ' This is the best circuit in the surrounding block, not confirmed for this parcel.';
  return out;
}

function judge(input) {
  input = input || {};
  var unit = unitOf(input.unit);
  var sub = substation(input.substation, unit);
  var circ = circuit(input.circuit, unit);
  var v = { key: circ.state, label: circ.label, say: circ.say };
  if (sub && circ.state === 'fits' && sub.state === 'risk') v.say += ' The substation is a caution: ' + sub.why;
  return { version: VERSION, unit: unit, substation: sub, circuit: circ, verdict: v };
}

module.exports = { judge: judge, VERSION: VERSION, _t: { substation: substation, circuit: circuit } };
