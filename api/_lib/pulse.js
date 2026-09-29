/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The Omega pulse: what the whole platform did this week, as COUNTS ONLY.
   Pure: api/pulse.js hands it the recent rows it read (capped) and the
   clock; this decides the numbers, the eight-week line and the one
   sentence of insight. No identity crosses: a row is a timestamp, a
   stage, a size and an org id used only to count distinct companies.
   scripts/tests/tpulse.js pins it. ES5. */
'use strict';
var DAY = 86400000, WEEK = 7 * DAY, WEEKS = 8;
function millis(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  var t = Date.parse(v); return isNaN(t) ? null : t;
}
function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : null; }
function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
/* rows: { projects: [{updatedAt, stage, bessKwh, bessKw, orgId}], rfqs: [{createdAt}], members: [{lastSeen}],
           deals: [{status, mw, approvedAt, createdAt}] (open on the finance marketplace),
           filed: [{createdAt}] (the latest deals filed there) }, each the most recent first, capped by the reader.
   The financing counts (2026-09-29, Tommy: the pulse carries "information
   about the financing opportunities" for a capital partner):
   deals open now, their megawatts, how many opened this week and how many
   were filed; never a name, a place or a price. */
function build(rows, now, caps) {
  rows = rows || {}; now = now || Date.now(); caps = caps || {};
  var since = now - WEEK, projects = rows.projects || [], rfqs = rows.rfqs || [], members = rows.members || [];
  var week = projects.filter(function (p) { var t = millis(p.updatedAt); return t != null && t >= since && t <= now + DAY; });
  var orgs = {}; week.forEach(function (p) { if (p.orgId) orgs[p.orgId] = true; });
  var financed = week.filter(function (p) { return ['finance', 'construction', 'online'].indexOf(p.stage) >= 0; }).length;
  var rfqN = rfqs.filter(function (r) { var t = millis(r.createdAt); return t != null && t >= since; }).length;
  var deals = (rows.deals || []).filter(function (d) { return !d.status || d.status === 'open'; }), filed = rows.filed || [];
  var openMw = deals.reduce(function (t, d) { var v = num(d.mw != null ? d.mw : d.sizeMw); return t + (v && v < 10000 ? v : 0); }, 0);
  var openedWeek = deals.filter(function (d) { var t = millis(d.approvedAt) || millis(d.createdAt); return t != null && t >= since; }).length;
  var filedWeek = filed.filter(function (d) { var t = millis(d.createdAt); return t != null && t >= since && t <= now + DAY; }).length;
  var active = members.filter(function (m) { var t = millis(m.lastSeen); return t != null && t >= since; }).length;
  var weeks = []; for (var i = WEEKS - 1; i >= 0; i--) { var a = now - (i + 1) * WEEK, b = now - i * WEEK; weeks.push(projects.filter(function (p) { var t = millis(p.updatedAt); return t != null && t >= a && t < b; }).length); }
  var hours = week.map(function (p) { var kwh = num(p.bessKwh), kw = num(p.bessKw); return kwh && kw ? kwh / kw : null; }).filter(function (h) { return h != null && h > 0 && h < 24; });
  var med = median(hours), band = med == null ? null : med < 1.5 ? [1, 2] : med <= 3 ? [2, 4] : med <= 5 ? [4, 6] : [6, 8];
  var insight = med == null ? 'Not enough sized projects this week to call a trend.'
    : 'Sizing this week leaned to ' + band[0] + ' to ' + band[1] + ' hour duration across the platform (' + hours.length + ' sized project' + (hours.length === 1 ? '' : 's') + ').';
  return {
    since: since, until: now, countsOnly: true,
    stats: { projects: week.length, rfqs: rfqN, financed: financed, designers: active, companies: Object.keys(orgs).length },
    finance: { open: deals.length, openMw: Math.round(openMw * 10) / 10, openedThisWeek: openedWeek, filedThisWeek: filedWeek },
    weeks: weeks, medianHours: med == null ? null : Math.round(med * 10) / 10, band: band, insight: insight,
    caps: { projects: caps.projects || null, rfqs: caps.rfqs || null, members: caps.members || null, deals: caps.deals || null }
  };
}
/* where the reader's own latest sized design sits against the band: 'in' | 'above' | 'below' | null */
function mine(pulse, hours) { if (!pulse || !pulse.band || !(hours > 0)) return null; return hours < pulse.band[0] ? 'below' : hours > pulse.band[1] ? 'above' : 'in'; }
module.exports = { build: build, mine: mine, millis: millis, WEEK: WEEK, WEEKS: WEEKS };
