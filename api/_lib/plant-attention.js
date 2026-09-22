/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/plant-attention.js — what on the floor needs a person today
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Read off the unit and station records the scan engine already
   writes: a unit that has sat at one bench longer than the threshold, a
   unit on hold and for how long, a failed machine test waiting on a retest,
   a unit recorded off its routing, and a bench that has not reported a scan
   in a working day. Nothing here moves a unit or clears a hold; it names
   where to walk first. A plant with no scans has an empty list, not an
   invented one.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var B = require('./plant-board');

var DEFAULTS = { stuckHours: 24, silentHours: 8, limit: 25 };

function text(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 160); }
function ms(v) { var t = B.iso(v); return t ? Date.parse(t) : NaN; }
function hoursBetween(a, b) { var h = (b - a) / 3600000; return isFinite(h) && h >= 0 && h < 24 * 365 ? Math.round(h * 10) / 10 : null; }
function labelOf(routing, key) { var s = (routing || []).filter(function (r) { return r && r.key === key; })[0]; return s ? s.label : key; }

function attention(units, stations, routing, now, opts) {
  opts = opts || {};
  var nowMs = ms(now) || Date.now(), stuckHours = Number(opts.stuckHours) > 0 ? Number(opts.stuckHours) : DEFAULTS.stuckHours;
  var silentHours = Number(opts.silentHours) > 0 ? Number(opts.silentHours) : DEFAULTS.silentHours, limit = Number(opts.limit) > 0 ? Number(opts.limit) : DEFAULTS.limit;
  routing = (routing || []).filter(function (s) { return s && s.key; });
  var keys = {}; routing.forEach(function (s) { keys[s.key] = true; });
  var last = routing.length ? routing[routing.length - 1].key : 'ready';
  var stuck = [], held = [], failed = [], off = [], counts = { units: 0, notStarted: 0, wip: 0, finished: 0 };
  (Array.isArray(units) ? units : []).forEach(function (u) {
    if (!u) return;
    counts.units++;
    var at = text(u.at, 40), base = { serial: text(u.serial, 100), sku: text(u.sku, 100), unitType: text(u.unitType, 20), shipUnit: !!u.shipUnit,
      woId: text(u.woId, 120) || null, orderNo: text(u.orderNo, 120) || null, at: at, label: at ? labelOf(routing, at) : 'Not started' };
    if (u.hold) {
      var since = ms(u.holdAt) || ms(u.testFailedAt) || ms(u.updatedAt);
      held.push(Object.assign({}, base, { hold: text(u.hold, 240), ncr: text(u.ncr, 80) || null, by: text(u.holdBy, 160) || null,
        hours: isFinite(since) ? hoursBetween(since, nowMs) : null, failedTest: !!(u.test && u.test.result === 'fail') }));
    }
    if (u.test && u.test.result === 'fail') failed.push(Object.assign({}, base, { failureCode: text(u.test.failureCode, 100) || null, testedAt: B.iso(u.test.at), onHold: !!u.hold }));
    if (!at) { counts.notStarted++; return; }
    if (!keys[at]) { off.push(base); return; }
    if (at === last) { counts.finished++; return; }
    counts.wip++;
    if (u.hold) return;
    var arrived = ms(u.arrivedAt) || ms(u.startedAt), h = isFinite(arrived) ? hoursBetween(arrived, nowMs) : null;
    if (h != null && h >= stuckHours) stuck.push(Object.assign({}, base, { hours: h }));
  });
  stuck.sort(function (a, b) { return b.hours - a.hours; });
  held.sort(function (a, b) { return (b.hours || 0) - (a.hours || 0); });
  failed.sort(function (a, b) { return String(b.testedAt || '').localeCompare(String(a.testedAt || '')); });
  /* A bench that has not scanned in a working day, or never: a tablet that
     died, a bench nobody is working, or a station that was never paired. */
  var silent = [];
  (Array.isArray(stations) ? stations : []).forEach(function (s) {
    if (!s || s.active === false) return;
    var seen = ms(s.lastSeenAt), h = isFinite(seen) ? hoursBetween(seen, nowMs) : null;
    if (h == null || h >= silentHours) silent.push({ id: text(s.id, 120), label: text(s.label || s.station, 100), station: text(s.station, 40),
      operation: s.station === '*' ? 'Roaming phone' : labelOf(routing, s.station), lineId: text(s.lineId, 40), machine: !!s.machine, roaming: !!s.roaming,
      hoursSince: h, lastSerial: text(s.lastSerial, 100) || null });
  });
  silent.sort(function (a, b) { return (b.hoursSince == null ? 1e9 : b.hoursSince) - (a.hoursSince == null ? 1e9 : a.hoursSince); });
  return { asOf: new Date(nowMs).toISOString(), thresholds: { stuckHours: stuckHours, silentHours: silentHours },
    counts: Object.assign(counts, { stuck: stuck.length, held: held.length, failed: failed.length, offRouting: off.length, silent: silent.length }),
    stuck: stuck.slice(0, limit), held: held.slice(0, limit), failed: failed.slice(0, limit), offRouting: off.slice(0, limit), silent: silent.slice(0, limit) };
}

module.exports = { attention: attention, DEFAULTS: DEFAULTS };
