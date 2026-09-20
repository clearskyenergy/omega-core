/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/plant.js — the scan engine: what a scan at a bench is allowed to do
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore, no network, no clock it does not receive. Everything
   here is a function of (unit, station, routing) so the rules that decide
   whether a unit may move can be tested without standing up a plant — see
   scripts/test-plant-scan.js.

   ── A SCAN MEANS "THIS UNIT IS NOW AT MY BENCH" ──────────────────────────
   Arrival, not departure. The operator receives the unit, scans it in, and the
   board shows where things ARE rather than where they last were. The
   difference matters when somebody walks away mid-shift: an un-scanned unit is
   visibly still at the previous bench instead of floating in between.

   ── THE GUN CAN ONLY DO THE HAPPY PATH ───────────────────────────────────
   A scan advances a unit by exactly one station. It cannot skip a station,
   move a unit backwards, release a hold, close an NCR or mark anything
   shipped. Those are decisions with money or a customer on the other end and
   they need a person with an account, not a credential sellotaped to a bench.
   So the worst a stolen scanner achieves is marking units present at one
   bench, in order, which a supervisor looking at the board would see.

   ── OUT OF SEQUENCE IS REFUSED, NOT SILENTLY ACCEPTED ────────────────────
   The tempting shortcut is to set unit.at = station and move on. Then a unit
   scanned at Pack straight from Rack is "packed", the two stations it never
   visited are recorded as done, and the EOL report for it does not exist. A
   floor system that accepts whatever it is told produces a board nobody
   trusts, and people go back to the clipboard. Refusing with a reason the
   operator can act on ("this is at Enclosure — Electrical is next") is the
   entire difference.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* The default BESS routing. A works order carries its own copy, because a
   tenant's stations are theirs and a routing change must not retroactively
   rewrite units already on the floor. */
var DEFAULT_ROUTING = [
  { key: 'kit',    label: 'Kitting' },
  { key: 'module', label: 'Module build' },
  { key: 'rack',   label: 'Rack assembly' },
  { key: 'encl',   label: 'Enclosure' },
  { key: 'elec',   label: 'Electrical' },
  { key: 'bms',    label: 'BMS & firmware' },
  { key: 'eol',    label: 'EOL test' },
  { key: 'qa',     label: 'QA / FAT' },
  { key: 'pack',   label: 'Pack & DG' },
  { key: 'ready',  label: 'Ready to ship' }
];

/* Stations whose record is written by a machine, not a person. A scan at one
   of these is refused: the test rig posts its own results, and a bench that
   can type "pass" makes the certificate worthless. */
var MACHINE_STATIONS = ['eol'];

function norm(v) { return String(v == null ? '' : v).trim(); }

function routingOf(wo) {
  var r = wo && wo.routing;
  if (!r || !r.length) return DEFAULT_ROUTING.slice();
  return r.map(function (s) {
    return typeof s === 'string' ? { key: s, label: s } : { key: norm(s.key), label: norm(s.label) || norm(s.key) };
  }).filter(function (s) { return s.key; });
}

function indexOf(routing, key) {
  key = norm(key);
  for (var i = 0; i < routing.length; i++) if (routing[i].key === key) return i;
  return -1;
}

function labelOf(routing, key) {
  var i = indexOf(routing, key);
  return i < 0 ? norm(key) : routing[i].label;
}

/* The label carries a URL so a supervisor can scan it with a phone camera and
   land on the traveler; the bench only wants the tail. Accept either. The host
   part is never trusted — a gun types whatever is printed on the sticker, and
   a sticker is not a credential. Lives here rather than in the endpoint so the
   bench page and the endpoint cannot drift on what a serial looks like. */
function serialFrom(raw) {
  var s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 300);
  if (!s) return '';
  if (s.indexOf('/') >= 0) {
    var tail = s.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop();
    return /^[A-Za-z0-9][A-Za-z0-9._-]{3,63}$/.test(tail) ? tail.toUpperCase() : '';
  }
  return /^[A-Za-z0-9][A-Za-z0-9._-]{3,63}$/.test(s) ? s.toUpperCase() : '';
}

/* The one rule, in one place.

   unit    { serial, at, hold, done{} }   at === '' means it has not started
   station the station key the SCANNER is bound to
   routing from the works order

   Returns a verdict the endpoint persists and the bench displays. Every
   refusal carries `say` — the sentence the operator reads on the screen —
   because "invalid transition" sends somebody to find a supervisor and
   "this is at Enclosure, Electrical is next" does not. */
function judgeScan(unit, station, routing, opts) {
  opts = opts || {};
  routing = routing && routing.length ? routing : DEFAULT_ROUTING;
  station = norm(station);

  var si = indexOf(routing, station);
  if (si < 0) {
    return { ok: false, reason: 'unknown_station', say: 'This scanner is set to a station that is not on this unit’s routing.' };
  }
  if (!unit) {
    return { ok: false, reason: 'unknown_unit', say: 'That serial is not on any open works order here.' };
  }

  var at = norm(unit.at);
  var ai = at ? indexOf(routing, at) : -1;

  if (unit.hold) {
    return { ok: false, reason: 'on_hold', at: at, say: 'On hold — ' + (norm(unit.hold) || 'see the supervisor') + '. A scan cannot release it.',
             ncr: norm(unit.ncr) || null };
  }
  if (MACHINE_STATIONS.indexOf(station) >= 0 && !opts.machine) {
    return { ok: false, reason: 'machine_station', say: labelOf(routing, station) + ' is recorded by the test rig, not by a scan.' };
  }
  if (ai === si) {
    /* Already here. Guns double-fire and people re-scan when they are unsure;
       neither is an error, and neither should move anything. */
    return { ok: true, action: 'duplicate', at: at, say: 'Already at ' + labelOf(routing, station) + '.' };
  }
  if (ai > si) {
    return { ok: false, reason: 'already_past', at: at,
             say: 'This has already been through here — it is at ' + labelOf(routing, at) + '.' };
  }
  if (ai === routing.length - 1) {
    return { ok: false, reason: 'complete', at: at, say: 'This unit is finished and staged.' };
  }
  if (si !== ai + 1) {
    var expect = routing[ai + 1];
    return { ok: false, reason: 'out_of_sequence', at: at, expected: expect.key,
             say: at ? 'This is at ' + labelOf(routing, at) + ' — ' + expect.label + ' is next.'
                     : 'This has not been kitted yet — ' + routing[0].label + ' is first.' };
  }

  return { ok: true, action: 'advance', from: at || null, to: station,
           say: labelOf(routing, station), last: si === routing.length - 1 };
}

/* Applied by the caller inside its transaction, so the shape of the write
   lives next to the rule that authorised it. */
function applyScan(unit, verdict, at) {
  if (!verdict.ok || verdict.action !== 'advance') return null;
  var done = {};
  for (var k in (unit.done || {})) if (Object.prototype.hasOwnProperty.call(unit.done, k)) done[k] = unit.done[k];
  if (verdict.from) done[verdict.from] = at;
  return { at: verdict.to, done: done, arrivedAt: at, hold: null };
}

module.exports = {
  DEFAULT_ROUTING: DEFAULT_ROUTING,
  MACHINE_STATIONS: MACHINE_STATIONS,
  routingOf: routingOf,
  indexOf: indexOf,
  labelOf: labelOf,
  serialFrom: serialFrom,
  judgeScan: judgeScan,
  applyScan: applyScan
};
