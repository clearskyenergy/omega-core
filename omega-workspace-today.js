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
     finance[]       fin_projects this person sent to the finance marketplace
                     (status draft|review|open|exclusive|awarded|closed,
                     sourceProjectId, firstLookUntil, room{state}, updatedAt,
                     offers[] each {status submitted|accepted|declined|withdrawn})
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
      75 offers on a deal I sent to the finance marketplace, waiting for me
      58 a project carrying a nextAction
      56 a deal in ClearSky's review for over a week (follow up)
      55 a project whose site package is complete (ready to submit)
      54 a deal awarded on the marketplace whose room is not done
      50 a project in flight that has not moved in 14 days
      47 a draft on the finance marketplace, never published
      45 candidates with no battery size, when Battery Sizer is open (ONE row)
      42 a deal open on the marketplace with no offer in 10 days
      40 a request I sent that nobody has answered in 5 days

   Six rows at most, highest first, ties by the older record first; `more`
   says how many were left off. Nothing here is a permission: every address
   leads to a page that checks for itself.

     OmegaWorkspaceToday.board(input) → [≤ max cards]

   The In flight board (Tommy, 2026-09-27: "a combo of anything that was
   done last, any undone projects, or anything we have sent to the finance
   marketplace and need to follow up"): every project that is not online,
   the ones that need something first (a next action, a package to submit,
   offers or a stall on the marketplace, a stall), then the most recently
   touched; a deal on the marketplace rides on its project's card (`finance`)
   or, with no project behind it, is a card of its own. Each card says why
   it is there (`why`, `whyCls`). ES5. */
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
  function needsSize(p) { return (!p.stage || p.stage === 'candidate') && !n(p.bessKwh) && !n(p.capex); }
  var PORTAL = '/portals/finance/';
  /* offers on a deal that are still the sponsor's to answer */
  function openOffers(f) { return (f.offers || []).filter(function (o) { return !o.status || o.status === 'submitted' || o.status === 'active'; }); }
  function roomDone(f) { var st = f.room && f.room.state; return st === 'delivered' || st === 'closed' || st === 'done'; }
  /* what a deal on the finance marketplace needs from its sponsor now, or null */
  function financeRow(f, now) {
    var fn = name(f), upd = at(f.updatedAt) || at(f.createdAt), id = f.id || fn, st = f.status || 'draft', open = openOffers(f);
    if (st === 'closed') return null;
    if (open.length) return { key: 'offers:' + id, cls: 'good', score: 75, when: upd, t: plural(open.length, 'offer', 'offers') + ' on ' + fn + ' waiting for your answer', s: 'Capital partners priced it on the finance marketplace. Accept one or decline.', cta: 'Compare', href: PORTAL, finance: id };
    if (st === 'awarded') return roomDone(f) ? null : { key: 'award:' + id, cls: 'good', score: 54, when: upd, t: fn + ' is awarded: finish the deal room', s: 'The partner is waiting on the data room.', cta: 'Open', href: PORTAL, finance: id };
    if (st === 'review') return upd && now - upd >= 7 * DAY ? { key: 'review:' + id, cls: 'warn', score: 56, when: upd, t: fn + ' has been in review for ' + plural(days(upd, now), 'day', 'days'), s: 'Sent to the finance marketplace; ClearSky has not published it yet. Follow up.', cta: 'Follow up', href: PORTAL, finance: id } : null;
    if (st === 'draft') return { key: 'draft:' + id, cls: '', score: 47, when: upd, t: fn + ' is still a draft on the finance marketplace', s: 'Finish it and send it for review.', cta: 'Open', href: PORTAL, finance: id };
    if (st === 'open' && upd && now - upd >= 10 * DAY) return { key: 'nooffer:' + id, cls: '', score: 42, when: upd, t: 'No offer on ' + fn + ' in ' + plural(days(upd, now), 'day', 'days'), s: 'Open on the finance marketplace. Ask ClearSky to field it.', cta: 'Follow up', href: PORTAL, finance: id };
    return null;
  }
  /* the one-line state of a deal, for a card */
  function financeNote(f, now) {
    var st = f.status || 'draft', open = openOffers(f);
    if (open.length) return plural(open.length, 'offer', 'offers') + ' waiting';
    if (st === 'awarded') return 'Awarded';
    if (st === 'exclusive') return f.firstLookUntil && at(f.firstLookUntil) > now ? 'First look until ' + dateOf(at(f.firstLookUntil)) : 'On first look';
    if (st === 'open') return 'Open to capital partners';
    if (st === 'review') return 'In review at ClearSky';
    if (st === 'closed') return 'Closed';
    return 'Draft';
  }

  function build(input) {
    input = input || {};
    var now = input.now || Date.now(), me = low(input.me), rows = [];
    var projects = input.projects || [], todos = input.todos || [], sent = input.rfqsSent || [], received = input.rfqsReceived || [], referrals = input.referrals || [], finance = input.finance || [];
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

    /* the finance marketplace: what I sent there and what it needs now */
    finance.forEach(function (f) {
      var fr = financeRow(f, now); if (fr) push(fr);
    });

    /* projects */
    var unsized = [];
    projects.forEach(function (p) {
      var pn = name(p), upd = at(p.updatedAt) || at(p.createdAt), id = p.id;
      if (p.nextAction && p.stage !== 'online') push({ key: 'next:' + id, cls: 'good', score: 58, when: upd, t: pn + ': ' + p.nextAction, s: (STAGE_LABEL[p.stage] || 'Candidate') + (upd ? ' · updated ' + plural(days(upd, now), 'day', 'days') + ' ago' : ''), cta: 'Open', act: { kind: 'project', id: id } });
      else if (p.stage === 'package') push({ key: 'submit:' + id, cls: 'good', score: 55, when: upd, t: pn + ' is ready to submit to the utility', s: 'Site package complete' + (upd ? ' · ' + plural(days(upd, now), 'day', 'days') + ' ago' : ''), cta: 'Open', act: { kind: 'project', id: id } });
      else if (inFlight(p) && upd && now - upd >= 14 * DAY) push({ key: 'stalled:' + id, cls: '', score: 50, when: upd, t: pn + ' has not moved in ' + plural(days(upd, now), 'day', 'days'), s: STAGE_LABEL[p.stage] || p.stage, cta: 'Open', act: { kind: 'project', id: id } });
      else if (needsSize(p) && canOpen('batterysizer')) unsized.push(p);
    });
    /* ONE row for the candidates with no size, however many (2026-09-27):
       six of them used to fill the whole list and hide a to-do */
    if (unsized.length === 1) push({ key: 'size:' + unsized[0].id, cls: '', score: 45, when: at(unsized[0].updatedAt) || at(unsized[0].createdAt), t: 'Size ' + name(unsized[0]), s: 'No battery size yet. Battery Sizer is open on your plan.', cta: 'Size', act: { kind: 'tool', id: 'batterysizer' }, project: unsized[0].id });
    else if (unsized.length > 1) {
      var oldestU = unsized.reduce(function (m, p) { var a = at(p.updatedAt) || at(p.createdAt); return a && (!m || a < m) ? a : m; }, 0), namedU = unsized.slice(0, 3).map(name);
      push({ key: 'size', cls: '', score: 45, when: oldestU, t: plural(unsized.length, 'candidate has', 'candidates have') + ' no battery size', s: namedU.join(', ') + (unsized.length > 3 ? ' and ' + (unsized.length - 3) + ' more' : '') + '. Battery Sizer is open on your plan.', cta: 'Size', act: { kind: 'tool', id: 'batterysizer' }, projects: unsized.map(function (p) { return p.id; }) });
    }

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
    else if (finance.length) { var offersWaiting = finance.reduce(function (t, f) { return t + (f.status === 'closed' ? 0 : openOffers(f).length); }, 0), live = finance.filter(function (f) { return f.status !== 'closed' && f.status !== 'draft'; }).length; kpis.push({ key: 'finance', value: String(offersWaiting), label: 'Offers waiting', delta: plural(live, 'deal', 'deals') + ' on the marketplace', tone: offersWaiting ? 'up' : '' }); }
    else kpis.push({ key: 'online', value: String(online.length), label: 'Sites online', delta: '', tone: '' });
    return { kpis: kpis, needs: needs, more: more };
  }
  /* the In flight board: what needs something first, then what was touched
     last; never a site that is online; a deal on the marketplace rides on
     its project or stands alone */
  function board(input) {
    input = input || {};
    var now = input.now || Date.now(), max = input.max || 8, projects = input.projects || [], finance = input.finance || [], cards = [], byProject = {};
    finance.forEach(function (f) { var pid = f.sourceProjectId || f.projectId || f.linkedProjectId; if (pid && !byProject[pid]) byProject[pid] = f; });
    projects.forEach(function (p) {
      if (p.stage === 'online') return;
      var upd = at(p.updatedAt) || at(p.createdAt), f = byProject[p.id] || null, why, cls = '', rank;
      var fr = f ? financeRow(f, now) : null;
      if (fr) { why = fr.t; cls = fr.cls || 'good'; rank = fr.score; }
      else if (p.nextAction) { why = 'Next: ' + p.nextAction; cls = 'good'; rank = 58; }
      else if (p.stage === 'package') { why = 'Ready to submit to the utility'; cls = 'good'; rank = 55; }
      else if (inFlight(p) && upd && now - upd >= 14 * DAY) { why = 'Not moved in ' + plural(days(upd, now), 'day', 'days'); cls = 'warn'; rank = 50; }
      else if (needsSize(p)) { why = 'No battery size yet'; cls = ''; rank = 30; }
      else { why = upd ? 'Touched ' + (now - upd < DAY ? 'today' : plural(days(upd, now), 'day', 'days') + ' ago') : 'New'; cls = ''; rank = 10; }
      cards.push({ kind: 'project', id: p.id, name: name(p), stage: p.stage || 'candidate', touched: upd, why: why, whyCls: cls, rank: rank,
        finance: f ? { id: f.id || null, status: f.status || 'draft', note: financeNote(f, now), offers: openOffers(f).length } : null });
    });
    finance.forEach(function (f) {
      var pid = f.sourceProjectId || f.projectId || f.linkedProjectId; if (pid && byProject[pid] === f && projects.some(function (p) { return p.id === pid; })) return;
      if (f.status === 'closed') return;
      var upd = at(f.updatedAt) || at(f.createdAt), fr = financeRow(f, now);
      cards.push({ kind: 'finance', id: f.id || name(f), name: name(f), stage: 'finance', touched: upd, why: fr ? fr.t : financeNote(f, now), whyCls: fr ? (fr.cls || 'good') : '', rank: fr ? fr.score : 20,
        finance: { id: f.id || null, status: f.status || 'draft', note: financeNote(f, now), offers: openOffers(f).length } });
    });
    cards.sort(function (a, b) { return (b.rank > 20 ? 1 : 0) - (a.rank > 20 ? 1 : 0) || (b.rank > 20 && a.rank > 20 ? b.rank - a.rank : 0) || (b.touched || 0) - (a.touched || 0) || String(a.name).localeCompare(String(b.name)); });
    return cards.slice(0, max);
  }
  var API = { build: build, board: board, STAGES: STAGES, STAGE_LABEL: STAGE_LABEL, MAX: MAX, at: at, money: money };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.OmegaWorkspaceToday = API;
})(typeof window !== 'undefined' ? window : null);
