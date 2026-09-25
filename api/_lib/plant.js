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

/* A supervisor may record a test station's result by hand when the rig
   cannot post it (api/mes-test-result.js, manual:true). The note is the
   evidence a certificate reader will ask for, so it has a floor. */
var MANUAL_NOTE_MIN = 5;

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
   opts    { machine, open[] }  open = the names of steps still open at the
           unit's CURRENT station (plant-work.js); an advance is refused
           while any remain

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
  /* a serial typed wrong at registration and voided (api/logic-plant.js
     correct-serial): its record is kept, but it is not a unit */
  if (unit.inventoryStatus === 'void') {
    var by = unit.voided && norm(unit.voided.replacedBy);
    return { ok: false, reason: 'voided', say: 'That serial was voided — it was typed wrong at registration.' + (by ? ' The unit is ' + by + '.' : '') };
  }

  var at = norm(unit.at);
  var ai = at ? indexOf(routing, at) : -1;
  if (at && ai < 0) return { ok: false, reason: 'unknown_position', say: 'This unit has an unknown position; supervisor review is required.' };
  if (unit.test && unit.test.result === 'fail' && !opts.machine) {
    return { ok: false, reason: 'retest_required', say: 'A failed test needs a passing retest before this unit can move: the test rig, or a supervisor recording it by hand in the Plant app (Quality → the serial → Record the result by hand).' };
  }

  if (unit.hold) {
    return { ok: false, reason: 'on_hold', at: at, say: 'On hold — ' + (norm(unit.hold) || 'see the supervisor') + '. A scan cannot release it.',
             ncr: norm(unit.ncr) || null };
  }
  if (MACHINE_STATIONS.indexOf(station) >= 0 && !opts.machine) {
    return { ok: false, reason: 'machine_station', say: labelOf(routing, station) + ' is recorded by the test rig, not by a scan. With the rig down, a supervisor records the result by hand in the Plant app (Quality → the serial).' };
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
  if (si === ai + 1 && at && opts.open && opts.open.length) {
    /* The bench it is leaving still has steps open (api/_lib/plant-work.js).
       Refuse here, at the NEXT bench, because that is where the unit turns
       up half-built: the operator reads what is missing and sends it back. */
    return { ok: false, reason: 'work_open', at: at, open: opts.open.slice(0, 8),
             say: 'Not finished at ' + labelOf(routing, at) + ': ' + opts.open.slice(0, 4).join(', ') + (opts.open.length > 4 ? ' and ' + (opts.open.length - 4) + ' more' : '') + '. Complete them there first.' };
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
  var out = { at: verdict.to, done: done, arrivedAt: at, hold: null };
  /* The first arrival is the start of the unit's clock; every later dwell
     is read off done{} (plant-stats.js). */
  if (!verdict.from) out.startedAt = at;
  return out;
}

/* Test-rig payloads are evidence, not a free-form diagnostic dump. Keeping
   the measurement map numeric, named and bounded means one malformed PLC
   response cannot make a traveler exceed Firestore's document limit. The raw
   vendor report can be attached separately; these are the values that explain
   a pass/fail in the OMEGA trace. */
function measurementsOf(raw) {
  if (raw == null) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('measurements must be an object');
  var keys = Object.keys(raw), out = {};
  if (keys.length > 32) throw new Error('too many measurements');
  keys.forEach(function (key) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(key)) throw new Error('invalid measurement name');
    var n = Number(raw[key]);
    if (!isFinite(n) || Math.abs(n) > 1000000000) throw new Error('invalid measurement value');
    out[key] = n;
  });
  return out;
}

/* A test rig may advance only a station marked machine-only. A failed test
   deliberately does NOT advance the unit: it records the result, places the
   unit on hold at its prior station and requires a human disposition.

   opts.open is the same list judgeScan takes: the steps still open at the
   bench the unit is LEAVING (plant-work.js openAt). A pass is an arrival at
   the test station like any other, so it is refused while a step is open —
   a rig's pass (or a supervisor's hand-recorded one, api/mes-test-result.js)
   must never carry a unit past a firmware load nobody confirmed or a part
   nobody issued. The caller persists the refusal with the evidence. */
function judgeMachineResult(unit, station, routing, result, opts) {
  station = norm(station);
  if (MACHINE_STATIONS.indexOf(station) < 0) {
    return { ok: false, reason: 'not_machine_station', say: 'This station does not accept machine results.' };
  }
  var base = judgeScan(unit, station, routing, { machine: true, open: opts && Array.isArray(opts.open) ? opts.open : [] });
  if (!base.ok) return base;
  if (!result || (result.pass !== true && result.pass !== false)) {
    return { ok: false, reason: 'invalid_result', say: 'The test rig did not send a pass or fail result.' };
  }
  /* A duplicate pass is harmless—the original result already moved the
     traveler. A NEW failed test at that same station is not harmless: it
     supersedes the earlier pass and must place the unit on hold. */
  if (result.pass || (base.action !== 'advance' && base.action !== 'duplicate')) return base;
  return {
    ok: false, action: 'hold', reason: 'test_failed', at: norm(unit && unit.at), station: station,
    say: 'Test failed — this unit is on hold for quality review.'
  };
}

function applyMachineResult(unit, verdict, at, record) {
  record = record || {};
  if (verdict && verdict.ok && verdict.action === 'duplicate' && record.result === 'pass' && unit.test && unit.test.result === 'fail') {
    return { test: record, testFailedAt: null };
  }
  if (verdict && verdict.ok && verdict.action === 'advance') {
    var pass = applyScan(unit, verdict, at);
    pass.test = record;
    return pass;
  }
  if (verdict && verdict.action === 'hold') {
    return {
      hold: record.failureCode || (record.source === 'manual' ? 'Test failed (recorded by hand)' : 'Test failed'),
      ncr: record.ncr || null,
      test: record,
      testFailedAt: at
    };
  }
  return null;
}

module.exports = {
  DEFAULT_ROUTING: DEFAULT_ROUTING,
  MACHINE_STATIONS: MACHINE_STATIONS,
  MANUAL_NOTE_MIN: MANUAL_NOTE_MIN,
  routingOf: routingOf,
  indexOf: indexOf,
  labelOf: labelOf,
  serialFrom: serialFrom,
  judgeScan: judgeScan,
  applyScan: applyScan,
  measurementsOf: measurementsOf,
  judgeMachineResult: judgeMachineResult,
  applyMachineResult: applyMachineResult
};
