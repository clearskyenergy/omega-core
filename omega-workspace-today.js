/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-workspace-today.js — what needs this person today, and the four
   numbers over it. PURE: records in, a ranked list and the KPIs out. No
   Firestore, no DOM, so scripts/tests/tworkspacetoday.js can pin every rule.

     OmegaWorkspaceToday.build(input) → { kpis: [4], needs: [≤6], more: n }

   input (every list optional):
     now, me (email, lower), orgId
     pendingApproval, readOnly, billingNotice {text, payUrl}, trialEndsAt (ms)
     projects[]      projects the workspace may read (stage, capex, bessKwh,
                     nextAction, updatedAt, createdAt, ownerEmail)
     todos[]         team_todos (text, assignee, due, done, createdBy)
     rfqsSent[]      rfqs where sourceOrgId is this org, each with its
                     recipients[] (vendorOrgId, status sent|quoted|accepted|rejected)
     rfqsReceived[]  recipients where vendorOrgId is this org (status, projectName)
     referrals[]     referrals where toOrgId is this org (status new|reviewing|…)
     canOpen(toolKey)

   A row is { key, cls (hot|warn|good|''), score, t, s, cta, href?, act? }.
   act is what the page does when there is no address: { kind: 'billing' |
   'team' | 'project' | 'tool', id }. The rules and their ranks:

     100 read-only (unpaid)        90 awaiting approval
      88 trial ends in ≤3 days     85 a to-do of mine is overdue
      80 trial ends in ≤14 days    78 a billing notice
      76 a request for quote waiting for MY price (I am the vendor)
      74 new quote requests in the referral inbox
      72 vendors answered MY request (compare, accept, reveal)
      70 a to-do of mine due within 3 days      60 any other open to-do of mine
      58 a project carrying a nextAction
      55 a project whose site package is complete (ready to submit)
      50 a project in flight that has not moved in 14 days
      45 a candidate with no battery size, when Battery Sizer is open
      40 a request I sent that nobody has answered in 5 days

   Six rows at most, highest first, ties by the older record first; `more`
   says how many were left off. Nothing here is a permission: every address
   leads to a page that checks for itself. ES5. */
(function (root) {
  'use strict';
  var DAY = 86400000, MAX = 6, STAGES = ['candidate', 'package', 'submitted', 'interconnect', 'permitting', 'finance', 'construction', 'online'];
  var STAGE_LABEL = { candidate: 'Candidate', package: 'Site package complete', submitted: 'Submitted to utility', interconnect: 'Interconnection review', permitting: 'Permitting', finance: 'Finance ready', construction: 'Construction', online: 'Online' };
  function at(t) { if (!t) return 0; if (typeof t === 'number') return t; if (t.toDate) return t.toDate().getTime(); if (t.seconds != null) return t.seconds * 1000; var d = new Date(t); return isNaN(d.getTime()) ? 0 : d.getTime(); }
  function low(s) { return String(s || '').toLowerCase(); }
  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function money(v) { v = n(v); if (v >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k'; return '$' + Math.round(v); }
  function plural(k, one, many) { return k + ' ' + (k === 1 ? one : many); }
  function days(ms, now) { return Math.round((now - ms) / DAY); }
  function dateOf(ms) { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function inFlight(p) { var i = STAGES.indexOf(p.stage); return i >= 1 && i < 7; }
  function name(p) { return p.name || p.title || 'Untitled'; }

  function build(input) {
    input = input || {};
    var now = input.now || Date.now(), me = low(input.me), rows = [];
    var projects = input.projects || [], todos = input.todos || [], sent = input.rfqsSent || [], received = input.rfqsReceived || [], referrals = input.referrals || [];
    var canOpen = typeof input.canOpen === 'function' ? input.canOpen : function () { return false; };
    function push(r) { rows.push(r); }

    /* the account */
    if (input.readOnly) push({ key: 'readonly', cls: 'hot', score: 100, when: 0, t: 'This workspace is read-only', s: (input.billingNotice && input.billingNotice.text) || 'Pay to continue creating and exporting. Saved work stays available.', cta: input.billingNotice && input.billingNotice.payUrl ? 'Pay' : 'Plan', href: input.billingNotice && input.billingNotice.payUrl || null, act: { kind: 'billing' } });
    else if (input.billingNotice && input.billingNotice.text) push({ key: 'billing', cls: 'warn', score: 78, when: 0, t: 'A note on your plan', s: input.billingNotice.text, cta: input.billingNotice.payUrl ? 'Pay' : 'Plan', href: input.billingNotice.payUrl || null, act: { kind: 'billing' } });
    if (input.pendingApproval) push({ key: 'approval', cls: 'warn', score: 90, when: 0, t: 'Your workspace is awaiting approval', s: 'Tools stay locked until ClearSky approves it, usually one business day.', cta: 'Plan', act: { kind: 'billing' } });
    var trialEnd = at(input.trialEndsAt);
    if (trialEnd) {
      var left = Math.ceil((trialEnd - now) / DAY);
      if (left <= 14) push({ key: 'trial', cls: left <= 3 ? 'hot' : 'warn', score: left <= 3 ? 88 : 80, when: 0, t: left > 0 ? 'Your trial ends in ' + plural(left, 'day', 'days') : 'Your trial has ended', s: 'Keep what you use, or pick a smaller plan.', cta: 'See plans', href: '/marketplace.html' });
    }

    /* my to-dos */
    var mine = todos.filter(function (x) { return !x.done && low(x.assignee) === me; }), overdue = 0, soon = 0;
    mine.forEach(function (x) {
      var due = at(x.due), late = due && due < now, near = due && !late && due - now <= 3 * DAY;
      if (late) overdue++; else if (near) soon++;
      push({ key: 'todo:' + (x.id || x.text), cls: late ? 'hot' : near ? 'warn' : '', score: late ? 85 : near ? 70 : 60, when: due || at(x.createdAt), t: x.text || 'To-do', s: (due ? (late ? 'Was due ' : 'Due ') + dateOf(due) : 'No date') + (x.createdBy && low(x.createdBy) !== me ? ' · from ' + String(x.createdBy).split('@')[0] : ''), cta: 'Team', act: { kind: 'team' } });
    });

    /* quotes: as the vendor, then as the customer */
    var toPrice = received.filter(function (r) { return r.status === 'sent' || (!r.status && !r.quote); });
    if (toPrice.length) {
      var oldest = toPrice.reduce(function (m, r) { var a = at(r.createdAt); return a && (!m || a < m) ? a : m; }, 0);
      var named = toPrice.map(function (r) { return r.projectName; }).filter(Boolean).slice(0, 2);
      push({ key: 'price', cls: 'warn', score: 76, when: oldest, t: plural(toPrice.length, 'request for quote', 'requests for quote') + ' waiting for your price', s: (named.length ? named.join(', ') + (toPrice.length > named.length ? ' and more' : '') : 'From customers on Omega') + (oldest ? ' · oldest ' + plural(days(oldest, now), 'day', 'days') + ' ago' : ''), cta: 'Quote', href: '/rfq.html' });
    }
    var quotedBack = 0, totalRecipients = 0;
    sent.forEach(function (f) {
      var rec = f.recipients || [], answered = rec.filter(function (r) { return r.status === 'quoted' || (r.quote && r.status !== 'accepted' && r.status !== 'rejected'); }), decided = rec.filter(function (r) { return r.status === 'accepted' || r.status === 'rejected'; });
      totalRecipients += rec.length; quotedBack += rec.filter(function (r) { return r.status === 'quoted' || r.status === 'accepted' || r.status === 'rejected' || r.quote; }).length;
      var pn = f.projectName || 'your project', made = at(f.createdAt);
      if (answered.length) push({ key: 'quotes:' + (f.id || pn), cls: 'good', score: 72, when: made, t: plural(answered.length, 'vendor', 'vendors') + ' answered your ' + pn + ' request', s: 'Compare and accept one to reveal who they are.', cta: 'Compare', href: '/rfq.html' });
      else if (rec.length && !decided.length && made && now - made >= 5 * DAY) push({ key: 'silent:' + (f.id || pn), cls: '', score: 40, when: made, t: 'No vendor has answered ' + pn + ' yet', s: 'Sent ' + plural(days(made, now), 'day', 'days') + ' ago to ' + plural(rec.length, 'vendor', 'vendors') + '.', cta: 'Open', href: '/rfq.html' });
    });
    var newRefs = referrals.filter(function (r) { return r.status === 'new' || !r.status; }), openRefs = referrals.filter(function (r) { return ['new', 'reviewing', 'quoting', 'quoted'].indexOf(r.status || 'new') >= 0; });
    if (newRefs.length) {
      var oldestRef = newRefs.reduce(function (m, r) { var a = at(r.createdAt); return a && (!m || a < m) ? a : m; }, 0);
      push({ key: 'referrals', cls: 'warn', score: 74, when: oldestRef, t: plural(newRefs.length, 'new quote request', 'new quote requests') + ' in your inbox', s: 'A developer or installer sent a site for you to price.', cta: 'Open inbox', href: '/index.html?stay=classic' });
    }

    /* projects */
    projects.forEach(function (p) {
      var pn = name(p), upd = at(p.updatedAt) || at(p.createdAt), id = p.id;
      if (p.nextAction && p.stage !== 'online') push({ key: 'next:' + id, cls: 'good', score: 58, when: upd, t: pn + ': ' + p.nextAction, s: (STAGE_LABEL[p.stage] || 'Candidate') + (upd ? ' · updated ' + plural(days(upd, now), 'day', 'days') + ' ago' : ''), cta: 'Open', act: { kind: 'project', id: id } });
      else if (p.stage === 'package') push({ key: 'submit:' + id, cls: 'good', score: 55, when: upd, t: pn + ' is ready to submit to the utility', s: 'Site package complete' + (upd ? ' · ' + plural(days(upd, now), 'day', 'days') + ' ago' : ''), cta: 'Open', act: { kind: 'project', id: id } });
      else if (inFlight(p) && upd && now - upd >= 14 * DAY) push({ key: 'stalled:' + id, cls: '', score: 50, when: upd, t: pn + ' has not moved in ' + plural(days(upd, now), 'day', 'days'), s: STAGE_LABEL[p.stage] || p.stage, cta: 'Open', act: { kind: 'project', id: id } });
      else if ((!p.stage || p.stage === 'candidate') && !n(p.bessKwh) && !n(p.capex) && canOpen('batterysizer')) push({ key: 'size:' + id, cls: '', score: 45, when: upd, t: 'Size ' + pn, s: 'No battery size yet. Battery Sizer is open on your plan.', cta: 'Size', act: { kind: 'tool', id: 'batterysizer' } });
    });

    rows.sort(function (a, b) { return b.score - a.score || (a.when || Infinity) - (b.when || Infinity) || String(a.key).localeCompare(String(b.key)); });
    var needs = rows.slice(0, MAX), more = rows.length - needs.length;

    /* the numbers */
    var flight = projects.filter(inFlight).length, fresh = projects.filter(function (p) { var c = at(p.createdAt); return c && now - c <= 7 * DAY; }).length;
    var online = projects.filter(function (p) { return p.stage === 'online'; }), pipeline = projects.filter(function (p) { return p.stage !== 'online'; }).reduce(function (s, p) { return s + n(p.capex); }, 0), onlineCapex = online.reduce(function (s, p) { return s + n(p.capex); }, 0);
    var review = overdue + soon + rows.filter(function (r) { return r.key === 'price' || r.key === 'referrals' || /^quotes:/.test(r.key); }).length;
    var kpis = [
      { key: 'flight', value: String(flight), label: 'Projects in flight', delta: fresh ? '+' + fresh + ' this week' : (projects.length ? projects.length + ' total' : ''), tone: fresh ? 'up' : '' },
      { key: 'review', value: String(review), label: 'Awaiting your review', delta: overdue ? plural(overdue, 'overdue', 'overdue') : '', tone: overdue ? 'warn' : '' },
      { key: 'capex', value: money(pipeline), label: 'Pipeline capex', delta: online.length ? money(onlineCapex) + ' online' : '', tone: '' }
    ];
    if (sent.length) kpis.push({ key: 'quotes', value: String(quotedBack), label: 'Quotes back', delta: 'of ' + totalRecipients + ' sent', tone: quotedBack ? 'up' : '' });
    else if (received.length) kpis.push({ key: 'price', value: String(toPrice.length), label: 'Requests to price', delta: (received.length - toPrice.length) + ' quoted', tone: toPrice.length ? 'warn' : '' });
    else if (referrals.length) kpis.push({ key: 'inbox', value: String(newRefs.length), label: 'New quote requests', delta: openRefs.length + ' open', tone: newRefs.length ? 'warn' : '' });
    else kpis.push({ key: 'online', value: String(online.length), label: 'Sites online', delta: '', tone: '' });
    return { kpis: kpis, needs: needs, more: more };
  }
  var API = { build: build, STAGES: STAGES, STAGE_LABEL: STAGE_LABEL, MAX: MAX, at: at, money: money };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.OmegaWorkspaceToday = API;
})(typeof window !== 'undefined' ? window : null);
