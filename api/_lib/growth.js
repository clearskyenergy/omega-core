/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/growth.js — where each workspace stands, and what to do about it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. The sales agent's first rung is to OBSERVE: read the sign-up → trial
   → paying funnel and say, per workspace, what stage it is at and the one
   next action. This module is that judgement, on a record the endpoint
   assembles (api/growth.js) so the rules are testable without Firestore
   and the same answer can be printed by a page, a script or an agent.

   What it deliberately does NOT know: prices, modules, packages. The catalog
   and the price book are the packaging build's (docs/VALUE-LADDER-PACKAGING.md,
   api/_lib/modules.js when it lands) and there is ONE copy of each. An
   action here says "send the proposal"; the proposal tool prices it.

   Input, one workspace (every field optional; dates may be a Firestore
   Timestamp, a Date, an ISO string or millis):
     { orgId, name, vertical, status, createdAt, approvedAt, who,
       billing: { tier, trialEndsAt, lastPaidAt, subscriptionDue, amountDue,
                  paymentProvider, status, paymentFailedAt },
       members, lastSeenAt, projects, lastProjectAt,
       accessRequestPending, nudges }

   Output: { orgId, name, vertical, who, lifecycle, activity, days{}, flags[],
             priority (0 nothing · 1 watch · 2 this week · 3 today),
             action, why }
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var DAY = 86400000;
var TRIAL_ENDING_DAYS = 3;     /* "trial ends in N days" becomes today's work */
var NEVER_SEEN_AFTER_DAYS = 2; /* approved, nobody signed in */
var NO_PROJECT_AFTER_DAYS = 3; /* signed in, drew nothing */
var IDLE_DAYS = 30;            /* a paying workspace nobody opened */
var PENDING_SLOW_DAYS = 1;     /* an approval waiting longer than a business day */

function millis(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  var t = Date.parse(String(v));
  return isNaN(t) ? null : t;
}
function daysSince(v, now) { var m = millis(v); return m == null ? null : (now - m) / DAY; }
function daysUntil(v, now) { var m = millis(v); return m == null ? null : (m - now) / DAY; }
function round1(n) { return n == null ? null : Math.round(n * 10) / 10; }
function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }

/* pending | trial | paying | past-due | suspended | cancelled */
function lifecycleOf(t, now) {
  var status = String(t.status || 'active').toLowerCase();
  var b = t.billing || {};
  if (status === 'cancelled') return 'cancelled';
  if (status === 'suspended') return 'suspended';
  if (status === 'pending' || t.accessRequestPending) return 'pending';
  var tier = String(b.tier || 'trial').toLowerCase();
  var paid = millis(b.lastPaidAt) != null;
  var bStatus = String(b.status || '').toLowerCase();
  if (bStatus === 'past_due' || millis(b.paymentFailedAt) != null) return 'past-due';
  if (tier !== 'trial' || paid) {
    var due = millis(b.subscriptionDue);
    if (n(b.amountDue) > 0 && due != null && due < now) return 'past-due';
    return 'paying';
  }
  return 'trial';
}

/* never-seen | exploring | building | idle */
function activityOf(t, now) {
  var seen = daysSince(t.lastSeenAt, now);
  if (seen == null) return 'never-seen';
  if (seen > IDLE_DAYS) return 'idle';
  return n(t.projects) > 0 ? 'building' : 'exploring';
}

function judge(t, now) {
  now = now || Date.now();
  t = t || {};
  var b = t.billing || {};
  var life = lifecycleOf(t, now), act = activityOf(t, now);
  var days = {
    sinceSignup: round1(daysSince(t.createdAt, now)),
    sinceApproval: round1(daysSince(t.approvedAt, now)),
    sinceSeen: round1(daysSince(t.lastSeenAt, now)),
    sinceProject: round1(daysSince(t.lastProjectAt, now)),
    trialLeft: round1(daysUntil(b.trialEndsAt, now))
  };
  var flags = [], priority = 0, action = '', why = '';
  var name = t.name || t.orgId || 'this workspace';

  if (life === 'pending') {
    var waited = days.sinceSignup;
    flags.push('awaiting-approval');
    if (n(t.nudges) > 0) flags.push('asked-again');
    if (waited != null && waited >= PENDING_SLOW_DAYS) {
      priority = 3; action = 'Approve ' + name + ' or call them';
      why = 'Signed up ' + fmtDays(waited) + ' ago and still waiting' + (n(t.nudges) ? ', and they pressed Upgrade ' + n(t.nudges) + (n(t.nudges) === 1 ? ' time' : ' times') : '') + '. A pending workspace shows locked tools; every day here is a day they form an opinion.';
    } else {
      priority = 2; action = 'Approve ' + name + ' today';
      why = 'New signup. Approval starts their trial and the clock on the first invoice.';
    }
  } else if (life === 'trial') {
    var left = days.trialLeft;
    if (left != null && left < 0) {
      flags.push('trial-expired');
      priority = 3; action = 'Trial over, unpaid: send the proposal or close ' + name;
      why = 'The trial ended ' + fmtDays(-left) + ' ago with no payment on record' + (act === 'building' ? ' and they have ' + n(t.projects) + ' project' + (n(t.projects) === 1 ? '' : 's') + ' in it' : '') + '.';
    } else if (left != null && left <= TRIAL_ENDING_DAYS) {
      flags.push('trial-ending');
      priority = 3; action = 'Send ' + name + ' the proposal: trial ends in ' + fmtDays(left);
      why = (act === 'building' ? n(t.projects) + ' project' + (n(t.projects) === 1 ? '' : 's') + ' drawn; they have something to lose.' : act === 'never-seen' ? 'Nobody has signed in yet, so the proposal is the first real touch.' : 'Signed in, nothing built yet: the proposal should lead with a guided build.');
    } else if (act === 'never-seen' && days.sinceApproval != null && days.sinceApproval >= NEVER_SEEN_AFTER_DAYS) {
      flags.push('never-signed-in');
      priority = 3; action = 'Welcome call: ' + name + ' has not signed in since approval';
      why = 'Approved ' + fmtDays(days.sinceApproval) + ' ago; the trial is running with nobody in it.';
    } else if (act === 'exploring' && days.sinceSeen != null && days.sinceSeen >= NO_PROJECT_AFTER_DAYS) {
      flags.push('no-project');
      priority = 2; action = 'Offer ' + name + ' a guided build';
      why = 'Signed in but has not started a project; last seen ' + fmtDays(days.sinceSeen) + ' ago.';
    } else if (act === 'building') {
      priority = 1; action = 'Watch ' + name + ': building on trial';
      why = n(t.projects) + ' project' + (n(t.projects) === 1 ? '' : 's') + (left != null ? ', ' + fmtDays(left) + ' of trial left' : '') + '. Line up the proposal for the last three days.';
    } else {
      priority = 1; action = 'Check in with ' + name;
      why = left != null ? fmtDays(left) + ' of trial left.' : 'On trial with no end date on record.';
    }
  } else if (life === 'past-due') {
    flags.push('past-due');
    priority = 3; action = 'Payment overdue: reach ' + name + ' before access is affected';
    why = n(b.amountDue) > 0 ? '$' + n(b.amountDue).toLocaleString('en-US') + ' due' + (b.subscriptionDue ? ' since ' + fmtDate(b.subscriptionDue) : '') + '.' : 'A payment failed or the account is marked past due.';
  } else if (life === 'paying') {
    if (act === 'idle' || act === 'never-seen') {
      flags.push('idle');
      priority = 2; action = 'Churn risk: nobody at ' + name + ' has opened the workspace' + (days.sinceSeen != null ? ' in ' + fmtDays(days.sinceSeen) : '');
      why = 'A paying workspace nobody uses is the next cancellation. Ask what changed.';
    } else {
      priority = 0; action = 'Healthy: ' + name + ' is paying and active';
      why = n(t.projects) + ' project' + (n(t.projects) === 1 ? '' : 's') + '; raise the next rung at the quarterly right-size.';
    }
  } else if (life === 'suspended') {
    flags.push('suspended');
    priority = 1; action = 'Suspended: decide whether ' + name + ' comes back';
    why = 'Access is off. Either a billing conversation or a clean close.';
  } else {
    priority = 0; action = 'Closed: ' + name;
    why = 'Cancelled. Win-back only if something changed on their side.';
  }
  return { orgId: t.orgId || null, name: t.name || null, vertical: t.vertical || null, who: t.who || null,
    lifecycle: life, activity: act, tier: b.tier || null, members: n(t.members), projects: n(t.projects),
    days: days, flags: flags, priority: priority, action: action, why: why };
}

function fmtDays(d) { if (d == null) return '?'; var r = Math.round(d); if (r < 1) return d < 0.5 && d >= 0 ? 'less than a day' : '1 day'; return r === 1 ? '1 day' : r + ' days'; }
function fmtDate(v) { var m = millis(v); if (m == null) return String(v); var d = new Date(m); return d.toISOString().slice(0, 10); }

/* the board: every workspace judged, most urgent first, with the counts a
   morning glance needs */
function board(tenants, now) {
  now = now || Date.now();
  var rows = (tenants || []).map(function (t) { return judge(t, now); });
  rows.sort(function (a, b) { return (b.priority - a.priority) || String(a.name || a.orgId).localeCompare(String(b.name || b.orgId)); });
  var summary = { total: rows.length, pending: 0, trial: 0, trialEnding: 0, paying: 0, pastDue: 0, idle: 0, today: 0 };
  rows.forEach(function (r) {
    if (r.lifecycle === 'pending') summary.pending++;
    if (r.lifecycle === 'trial') summary.trial++;
    if (r.flags.indexOf('trial-ending') >= 0 || r.flags.indexOf('trial-expired') >= 0) summary.trialEnding++;
    if (r.lifecycle === 'paying') summary.paying++;
    if (r.lifecycle === 'past-due') summary.pastDue++;
    if (r.flags.indexOf('idle') >= 0) summary.idle++;
    if (r.priority === 3) summary.today++;
  });
  return { asOf: new Date(now).toISOString(), summary: summary, tenants: rows,
    today: rows.filter(function (r) { return r.priority === 3; }).map(function (r) { return { orgId: r.orgId, action: r.action, who: r.who }; }) };
}

module.exports = { judge: judge, board: board, lifecycleOf: lifecycleOf, activityOf: activityOf, millis: millis,
  THRESHOLDS: { TRIAL_ENDING_DAYS: TRIAL_ENDING_DAYS, NEVER_SEEN_AFTER_DAYS: NEVER_SEEN_AFTER_DAYS, NO_PROJECT_AFTER_DAYS: NO_PROJECT_AFTER_DAYS, IDLE_DAYS: IDLE_DAYS, PENDING_SLOW_DAYS: PENDING_SLOW_DAYS } };
