/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * prime-fit.js — does this pad hold the unit and its transformer?
 *
 * Omega Prime v2 draws the rectangle the rep dragged. The clearance, the
 * default footprint when a catalog row has none, and where the transformer
 * and disconnect sit beside the container are sizing rules, so they stay
 * here. The page sends feet and draws the answer.
 *
 * The yard is the same clearance live Prime used in the browser
 * (container plus 20 ft on the long side and 12 ft on the short side, the
 * transformer and disconnect stepped out from the container). It moved
 * server-side for v2. A missing footprint is said, and the default
 * container is named, never drawn as if the catalog had measured it.
 *
 * Pure. ES5.
 */
'use strict';

var VERSION = 'prime-fit/1';
var AS_OF = '2026-10-18';
var SOURCE = 'OMEGA Prime pad rule: the container plus yard for its transformer and disconnect';
var CLEAR_LONG_FT = 20;
var CLEAR_SHORT_FT = 12;
var DEFAULT_LONG_FT = 20;
var DEFAULT_SHORT_FT = 8;

function fail(message) {
  var e = new Error(message);
  e.status = 400;
  return e;
}

function num(v) {
  if (v == null || v === '') return null;
  var n = +v;
  return isFinite(n) ? n : null;
}

function feet(v, label, max) {
  var n = num(v);
  if (n == null) throw fail(label + ' is required');
  if (n < 1 || n > max) throw fail(label + ' is out of range');
  return n;
}

function optionalFeet(v, label) {
  var n = num(v);
  if (n == null) return null;
  if (n <= 0 || n > 400) throw fail(label + ' is out of range');
  return n;
}

function fit(body) {
  body = body || {};
  var unit = body.unit || {};
  var area = body.area || {};
  var longFt = optionalFeet(unit.lFt, 'Container length');
  var shortFt = optionalFeet(unit.wFt, 'Container width');
  var known = longFt != null && shortFt != null;
  var useLong = known ? longFt : DEFAULT_LONG_FT;
  var useShort = known ? shortFt : DEFAULT_SHORT_FT;
  var w = feet(area.wFt, 'Pad length', 5000);
  var h = feet(area.hFt, 'Pad width', 5000);
  var needLong = useLong + CLEAR_LONG_FT;
  var needShort = useShort + CLEAR_SHORT_FT;
  var gotLong = Math.max(w, h);
  var gotShort = Math.min(w, h);
  var ok = gotLong + 0.5 >= needLong && gotShort + 0.5 >= needShort;
  var say;
  if (!known) {
    say = 'This unit has no footprint on file. The pad was checked against a ' + DEFAULT_LONG_FT + ' × ' + DEFAULT_SHORT_FT + ' ft container, which is a stand-in, not a measurement.';
    if (!ok) say += ' The pad is still smaller than that stand-in plus its yard.';
  } else if (ok) {
    say = 'The pad holds the ' + Math.round(useLong) + ' × ' + Math.round(useShort) + ' ft container and the yard for its transformer and disconnect.';
  } else {
    say = 'Too small for the container and its transformer. Drag at least about ' + Math.round(needLong) + ' × ' + Math.round(needShort) + ' ft.';
  }
  return {
    version: VERSION,
    ok: ok,
    footprintKnown: known,
    assumedFootprint: !known,
    containerLongFt: useLong,
    containerShortFt: useShort,
    needLongFt: needLong,
    needShortFt: needShort,
    padLongFt: Math.round(gotLong),
    padShortFt: Math.round(gotShort),
    say: say,
    place: {
      xfmrOffsetFt: useLong / 2 + 9,
      discoOffsetFt: useLong / 2 + 18,
      xfmrFt: 8,
      discoLongFt: 3,
      discoShortFt: 4,
      leadGapFt: 4
    },
    source: SOURCE,
    asOf: AS_OF,
    clearance: { longFt: CLEAR_LONG_FT, shortFt: CLEAR_SHORT_FT, asOf: AS_OF }
  };
}

module.exports = { fit: fit, VERSION: VERSION, AS_OF: AS_OF, SOURCE: SOURCE };
