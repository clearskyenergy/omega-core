/* Today is derived, ranked and honest — every rule pinned.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tworkspacetoday.js */
'use strict';
var T = require('../../omega-workspace-today.js');
var pass = 0, fail = 0, DAY = 86400000, NOW = Date.UTC(2026, 8, 26, 15, 0, 0), ME = 'ann@northstar.example';
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
function keys(r) { return r.needs.map(function (x) { return x.key.split(':')[0]; }); }
function b(extra) { var i = { now: NOW, me: ME, orgId: 'northstar.example' }; Object.keys(extra || {}).forEach(function (k) { i[k] = extra[k]; }); return T.build(i); }

/* 1 · nothing */
var e = b({});
ok('an empty workspace needs nothing and counts zero', e.needs.length === 0 && e.more === 0 && e.kpis.map(function (k) { return k.value; }).join() === '0,0,$0,0', e);
ok('with no quotes at all the fourth number is sites online', e.kpis[3].label === 'Sites online');

/* 2 · the account outranks everything */
var acct = b({ readOnly: true, billingNotice: { text: 'Pay to continue.', payUrl: 'https://pay.example/1' }, pendingApproval: true, trialEndsAt: NOW + 2 * DAY, todos: [{ text: 'late', assignee: ME, due: NOW - DAY }] });
ok('read-only first, then approval, then a trial in its last days, then an overdue to-do', keys(acct).join() === 'readonly,approval,trial,todo', keys(acct));
ok('the read-only row pays through the notice\'s link', acct.needs[0].href === 'https://pay.example/1' && acct.needs[0].cta === 'Pay');
ok('a trial in its last three days is hot', acct.needs[2].cls === 'hot' && /2 days/.test(acct.needs[2].t), acct.needs[2]);
var trial = b({ trialEndsAt: NOW + 10 * DAY });
ok('a trial with ten days left is a warning naming the days', trial.needs[0].cls === 'warn' && /10 days/.test(trial.needs[0].t), trial.needs[0]);
ok('a trial with a month left is not on the list', b({ trialEndsAt: NOW + 30 * DAY }).needs.length === 0);
var notice = b({ billingNotice: { text: 'Your trial ends on 2026-10-05.' } });
ok('a billing notice without read-only is a warning that opens the plan', notice.needs[0].key === 'billing' && notice.needs[0].act.kind === 'billing');

/* 3 · my to-dos, not the team's */
var td = b({ todos: [
  { id: 'a', text: 'Order the geotech', assignee: 'raj@northstar.example', due: NOW - DAY },
  { id: 'b', text: 'Send the one-line', assignee: ME, due: NOW - 2 * DAY, createdBy: 'raj@northstar.example' },
  { id: 'c', text: 'Book the crane', assignee: 'ANN@northstar.example', due: NOW + 2 * DAY },
  { id: 'd', text: 'Later', assignee: ME },
  { id: 'e', text: 'Done', assignee: ME, done: true, due: NOW - 9 * DAY } ] });
ok('only my open to-dos: overdue (hot) first, due soon (warn), then undated; a teammate\'s and a done one are not mine', keys(td).join() === 'todo,todo,todo' && td.needs.map(function (x) { return x.cls; }).join() === 'hot,warn,' && /Send the one-line/.test(td.needs[0].t), td.needs);
ok('an overdue to-do says when it was due and who asked', /Was due Sep 24 · from raj/.test(td.needs[0].s), td.needs[0].s);
ok('the assignee is matched case-insensitively', /crane/.test(td.needs[1].t));
ok('Awaiting your review counts the overdue and the due-soon to-do, and names the overdue one', td.kpis[1].value === '2' && td.kpis[1].delta === '1 overdue', td.kpis[1]);

/* 4 · quotes, both ends */
var vend = b({ rfqsReceived: [{ rfqId: 'r1', status: 'sent', projectName: 'Elm St', createdAt: NOW - 3 * DAY }, { rfqId: 'r2', status: 'sent', projectName: 'Harbor', createdAt: NOW - DAY }, { rfqId: 'r3', status: 'quoted', projectName: 'Old', createdAt: NOW - 9 * DAY }] });
ok('as the vendor: two requests waiting for my price, the oldest named in days, to the Quote Desk', vend.needs.length === 1 && /2 requests for quote waiting/.test(vend.needs[0].t) && /Elm St, Harbor · oldest 3 days ago/.test(vend.needs[0].s) && vend.needs[0].href === '/rfq.html', vend.needs[0]);
ok('as the vendor the fourth number is requests to price', vend.kpis[3].label === 'Requests to price' && vend.kpis[3].value === '2' && vend.kpis[3].delta === '1 quoted', vend.kpis[3]);
var cust = b({ rfqsSent: [
  { id: 'f1', projectName: 'Riverside BESS', createdAt: NOW - 4 * DAY, recipients: [{ vendorOrgId: 'a', status: 'quoted', quote: { total: 1 } }, { vendorOrgId: 'b', status: 'sent', quote: null }] },
  { id: 'f2', projectName: 'Maple Yard', createdAt: NOW - 6 * DAY, recipients: [{ vendorOrgId: 'a', status: 'sent' }, { vendorOrgId: 'c', status: 'sent' }] },
  { id: 'f3', projectName: 'Done deal', createdAt: NOW - 20 * DAY, recipients: [{ vendorOrgId: 'a', status: 'accepted', quote: { total: 2 } }] } ] });
ok('as the customer: one vendor answered Riverside (compare), Maple Yard is unanswered after five days, the decided one is quiet', keys(cust).join() === 'quotes,silent' && /1 vendor answered your Riverside BESS request/.test(cust.needs[0].t) && /No vendor has answered Maple Yard yet/.test(cust.needs[1].t) && /6 days ago to 2 vendors/.test(cust.needs[1].s), cust.needs);
ok('Quotes back counts every answered or decided recipient over every recipient sent', cust.kpis[3].label === 'Quotes back' && cust.kpis[3].value === '2' && cust.kpis[3].delta === 'of 5 sent', cust.kpis[3]);
ok('an answered request counts as awaiting review', cust.kpis[1].value === '1', cust.kpis[1]);
var refs = b({ referrals: [{ status: 'new', createdAt: NOW - DAY }, { status: 'quoting' }, { status: 'won' }] });
ok('the referral inbox: one new request, to the inbox on the classic dashboard without changing the browser\'s home', refs.needs.length === 1 && /1 new quote request in your inbox/.test(refs.needs[0].t) && refs.needs[0].href === '/index.html?stay=classic' && refs.kpis[3].value === '1' && refs.kpis[3].delta === '2 open', refs);

/* 5 · projects */
var pr = b({ canOpen: function (k) { return k === 'batterysizer'; }, projects: [
  { id: 'p1', name: 'Riverside', stage: 'interconnect', capex: 3100000, nextAction: 'Review the study', updatedAt: NOW - 2 * DAY, createdAt: NOW - 30 * DAY },
  { id: 'p2', name: 'Maple', stage: 'package', capex: 6400000, updatedAt: NOW - 3 * DAY, createdAt: NOW - 3 * DAY },
  { id: 'p3', name: 'Harbor', stage: 'permitting', capex: 1500000, updatedAt: NOW - 20 * DAY, createdAt: NOW - 40 * DAY },
  { id: 'p4', name: 'Mill', stage: 'online', capex: 900000, updatedAt: NOW - 90 * DAY, createdAt: NOW - 200 * DAY },
  { id: 'p5', name: 'New site', stage: 'candidate', createdAt: NOW - DAY, updatedAt: NOW - DAY },
  { id: 'p6', name: 'Fresh', stage: 'candidate', bessKwh: 2000, createdAt: NOW - 8 * DAY } ] });
ok('projects: a next action, then a package ready to submit, then a stalled one, then a candidate to size; online and sized candidates are quiet', keys(pr).join() === 'next,submit,stalled,size' && /Riverside: Review the study/.test(pr.needs[0].t) && /Maple is ready to submit/.test(pr.needs[1].t) && /Harbor has not moved in 20 days/.test(pr.needs[2].t) && /Size New site/.test(pr.needs[3].t), pr.needs);
ok('a project row opens the project; the size row opens the tool', pr.needs[0].act.kind === 'project' && pr.needs[0].act.id === 'p1' && pr.needs[3].act.kind === 'tool' && pr.needs[3].act.id === 'batterysizer');
ok('the candidate is not offered a sizer the plan does not open', b({ projects: [{ id: 'x', name: 'X', stage: 'candidate' }] }).needs.length === 0);
ok('in flight is the board: every project not yet online, candidates included; created this week is the delta', pr.kpis[0].value === '5' && pr.kpis[0].delta === '+2 this week', pr.kpis[0]);
ok('pipeline capex sums what was priced, leaves online sites out, and counts the projects nobody priced', pr.kpis[2].value === '$11M' && pr.kpis[2].delta === '2 projects not priced yet', pr.kpis[2]);
var old = b({ projects: [
  { id: 'a', name: 'A', stage: 'interconnect', capex: 2000000, createdAt: NOW - 30 * DAY },
  { id: 'b', name: 'B', stage: 'candidate', capex: 500000, createdAt: NOW - 30 * DAY },
  { id: 'c', name: 'C', stage: 'online', capex: 900000, createdAt: NOW - 300 * DAY } ] });
ok('nothing new this week: in flight says how many are past candidate; every project priced, the capex names what is online', old.kpis[0].value === '2' && old.kpis[0].delta === '1 past candidate' && old.kpis[2].value === '$2.5M' && old.kpis[2].delta === '$900k online', [old.kpis[0], old.kpis[2]]);
var unsized = b({ projects: [1, 2, 3].map(function (i) { return { id: 'u' + i, name: 'U' + i, stage: 'candidate', createdAt: NOW - 20 * DAY }; }) });
ok('candidates nobody priced are not a $0 pipeline: the capex is a dash and says how many are unpriced', unsized.kpis[0].value === '3' && unsized.kpis[0].delta === 'all candidates' && unsized.kpis[2].value === '—' && unsized.kpis[2].delta === '3 projects not priced yet', [unsized.kpis[0], unsized.kpis[2]]);
var none = b({ projects: [] });
ok('no projects: nothing in flight and a $0 pipeline, with no invented delta', none.kpis[0].value === '0' && !none.kpis[0].delta && none.kpis[2].value === '$0' && !none.kpis[2].delta, [none.kpis[0], none.kpis[2]]);

/* 6 · the cap */
var many = b({ todos: [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return { id: 't' + i, text: 'T' + i, assignee: ME, due: NOW - i * DAY }; }) });
ok('six rows at most, the oldest overdue first, and the rest counted', many.needs.length === 6 && many.more === 2 && /T8/.test(many.needs[0].t) && /T3/.test(many.needs[5].t), { n: many.needs.length, more: many.more, first: many.needs[0].t });
ok('the order is stable for equal scores and dates', JSON.stringify(b({ todos: [{ id: 'b', text: 'B', assignee: ME }, { id: 'a', text: 'A', assignee: ME }] }).needs.map(function (x) { return x.t; })) === '["A","B"]');

/* 7 · candidates with no size are ONE row, however many (2026-09-27) */
var sz = b({ canOpen: function (k) { return k === 'batterysizer'; }, projects: [1, 2, 3, 4, 5].map(function (i) { return { id: 'c' + i, name: 'Site ' + i, stage: 'candidate', createdAt: NOW - i * DAY }; }).concat([{ id: 'o1', name: 'Done', stage: 'online' }]) });
ok('five unsized candidates make one row naming three of them and counting the rest; it opens the sizer', sz.needs.length === 1 && sz.needs[0].key === 'size' && /5 candidates have no battery size/.test(sz.needs[0].t) && /Site 1, Site 2, Site 3 and 2 more/.test(sz.needs[0].s) && sz.needs[0].act.id === 'batterysizer' && sz.needs[0].projects.length === 5, sz.needs);

/* 8 · the finance marketplace: what I sent there and what it needs */
var fin = b({ finance: [
  { id: 'f1', name: 'Riverside', status: 'open', updatedAt: NOW - 2 * DAY, offers: [{ status: 'submitted' }, { status: 'declined' }, { status: 'submitted' }] },
  { id: 'f2', name: 'Maple', status: 'review', updatedAt: NOW - 9 * DAY, offers: [] },
  { id: 'f3', name: 'Harbor', status: 'awarded', updatedAt: NOW - 3 * DAY, room: { state: 'ordered' }, offers: [{ status: 'accepted' }] },
  { id: 'f4', name: 'Mill', status: 'draft', updatedAt: NOW - DAY },
  { id: 'f5', name: 'Quiet', status: 'open', updatedAt: NOW - 12 * DAY, offers: [] },
  { id: 'f6', name: 'Fresh', status: 'open', updatedAt: NOW - 3 * DAY, offers: [] },
  { id: 'f7', name: 'Recent', status: 'review', updatedAt: NOW - 2 * DAY },
  { id: 'f8', name: 'Gone', status: 'closed', updatedAt: NOW - 50 * DAY, offers: [{ status: 'submitted' }] } ] });
ok('offers waiting lead, then a review over a week old, an awarded room to finish, a draft, then a deal with no offer in 10 days; a fresh open deal, a fresh review and a closed one are quiet', keys(fin).join() === 'offers,review,award,draft,nooffer' && /2 offers on Riverside waiting for your answer/.test(fin.needs[0].t) && /Maple has been in review for 9 days/.test(fin.needs[1].t) && /Harbor is awarded/.test(fin.needs[2].t) && /Mill is still a draft/.test(fin.needs[3].t) && /No offer on Quiet in 12 days/.test(fin.needs[4].t), fin.needs.map(function (r) { return r.key + ' ' + r.t; }));
ok('every finance row goes to the finance portal and carries the deal', fin.needs.every(function (r) { return r.href === '/portals/finance/' && r.finance; }));
ok('the fourth number is the offers waiting across the deals on the marketplace', fin.kpis[3].key === 'finance' && fin.kpis[3].value === '2' && /6 deals on the marketplace/.test(fin.kpis[3].delta), fin.kpis[3]);
ok('an awarded deal whose room is delivered needs nothing', b({ finance: [{ id: 'd', name: 'D', status: 'awarded', room: { state: 'delivered' } }] }).needs.length === 0);
ok('offers outrank a project\'s next action, as a quote back does', b({ finance: [{ id: 'f', name: 'F', status: 'open', offers: [{ status: 'submitted' }] }], projects: [{ id: 'p', name: 'P', stage: 'interconnect', nextAction: 'Call' }] }).needs.map(function (r) { return r.key.split(':')[0]; }).join() === 'offers,next');

/* 9 · the In flight board: what needs something first, then what was touched last; never online */
var board = T.board({ now: NOW, projects: [
  { id: 'a', name: 'Alpha', stage: 'candidate', updatedAt: NOW - 1 * DAY, bessKwh: 2000 },
  { id: 'b', name: 'Bravo', stage: 'interconnect', nextAction: 'Review the study', updatedAt: NOW - 5 * DAY },
  { id: 'c', name: 'Charlie', stage: 'package', updatedAt: NOW - 6 * DAY },
  { id: 'd', name: 'Delta', stage: 'permitting', updatedAt: NOW - 20 * DAY },
  { id: 'e', name: 'Echo', stage: 'online', updatedAt: NOW },
  { id: 'f', name: 'Foxtrot', stage: 'candidate', updatedAt: NOW - 3 * DAY },
  { id: 'g', name: 'Golf', stage: 'candidate', updatedAt: NOW - 0.1 * DAY, bessKwh: 500 } ],
  finance: [ { id: 'fa', name: 'Alpha deal', status: 'open', sourceProjectId: 'a', updatedAt: NOW - DAY, offers: [{ status: 'submitted' }] }, { id: 'fz', name: 'Zulu (no project)', status: 'review', updatedAt: NOW - 8 * DAY } ] });
ok('the board leads with what needs something, by weight: offers on Alpha, Bravo\'s next action, Zulu\'s stale review, Charlie ready to submit, Delta stalled, then Foxtrot (no size), then the rest by touch; Echo online is off the board',
  board.map(function (c) { return c.id; }).join() === 'a,b,fz,c,d,f,g', board.map(function (c) { return c.id + ':' + c.rank + ':' + c.why; }));
ok('a deal rides on its project\'s card with its state, and a deal with no project is a card of its own', board[0].kind === 'project' && board[0].finance && board[0].finance.offers === 1 && /1 offer waiting/.test(board[0].finance.note) && board[2].kind === 'finance' && /in review for 8 days/.test(board[2].why), { a: board[0].finance, z: board[2] });
ok('every card says why it is there', board.every(function (c) { return c.why && typeof c.whyCls === 'string'; }), board.map(function (c) { return c.why; }));
ok('the board is capped', T.board({ now: NOW, max: 2, projects: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }, { id: 'z', name: 'Z' }] }).length === 2);

/* 10 · a Level 2 job is not a battery: the card reads the work done on its design (Tommy, 2026-09-29) */
var l2 = { id: 'l', name: '8 Russell St', type: 'l2', stage: 'candidate', createdAt: NOW - 2 * DAY, updatedAt: NOW - DAY };
var d10 = b({ canOpen: function (k) { return k === 'batterysizer'; }, projects: [l2] });
ok('an L2 job is never asked for a battery size; it is asked for a design, and the row opens the project', !d10.needs.some(function (r) { return /^size/.test(r.key); }) && d10.needs[0].key === 'design:l' && /Design 8 Russell St/.test(d10.needs[0].t) && d10.needs[0].cta === 'Design' && d10.needs[0].act.kind === 'project' && d10.needs[0].act.id === 'l', d10.needs);
ok('kinds and labels come off the one type table, the EV wizard\'s mark included', T.kinds({ type: 'evl2' }).join() === 'l2' && T.kinds({ type: 'bess', wizMode: 'L2' }).join() === 'bess,l2' && T.kinds({ type: 'x', siteScopes: ['der', 'bess'] }).join() === 'solarstorage' && T.kindLabels({ type: 'l2' }).join() === 'Level 2 EV' && T.kinds({}).length === 0);
ok('a battery belongs on storage kinds and on a record that declares nothing, never on a Level 2, compute or building job', T.wantsBattery({ type: 'bess' }) && T.wantsBattery({ type: 'dcfc' }) && T.wantsBattery({ type: 'solar' }) && T.wantsBattery({}) && !T.wantsBattery({ type: 'l2' }) && !T.wantsBattery({ wizMode: 'L2' }) && !T.wantsBattery({ type: 'compute' }) && !T.wantsBattery({ type: 'building' }));
var pg0 = T.progress(l2), pg1 = T.progress({ type: 'l2', elements: [{ type: 'evgear', evKind: 'charger' }] }), pg2 = T.progress({ type: 'l2', elements: [{}], capex: 48200, capexAt: NOW, capexSource: 'site-map' });
ok('nothing on the map is 0, designed is 50, designed and run is 100', pg0.pct === 0 && pg0.phrase === 'Nothing on the site map yet' && pg1.pct === 50 && pg1.phrase === 'Designed, not run yet' && !pg1.done && pg2.pct === 100 && pg2.done && pg2.run && pg2.phrase === 'Designed and run', [pg0, pg1, pg2]);
ok('a figure that was not the run\'s reads priced, conduits alone are a design, and a run with nothing placed says so', T.progress({ conduits: [{}], capex: 5000 }).phrase === 'Designed and priced' && T.progress({ capex: 5000 }).phrase === 'Priced, nothing on the site map yet' && T.progress({ capexSource: 'site-map' }).phrase === 'Run, nothing placed on the site map');
ok('a job past candidate reads the further of the design and the stage', T.progress({ stage: 'construction' }).pct === 86 && T.progress({ stage: 'package', elements: [{}], capexAt: NOW }).pct === 100 && T.progress({ stage: 'package', elements: [{}] }).pct === 50);
var cardsL2 = T.board({ now: NOW, projects: [l2, { id: 'm', name: 'Done', type: 'l2', stage: 'candidate', elements: [{}], capexAt: NOW, capexSource: 'site-map', updatedAt: NOW - 3600e3 }, { id: 'n', name: 'Drawn', type: 'l2', stage: 'candidate', elements: [{}], updatedAt: NOW - 2 * DAY }] });
ok('the card says the work done, never a battery: the undesigned job first, the drawn one that needs its run, then the finished one by touch', cardsL2.map(function (c) { return c.id + ':' + c.why + ':' + c.rank; }).join('|') === 'l:Nothing on the site map yet:30|n:Designed, not run yet:28|m:Designed and run · Touched today:10', cardsL2.map(function (c) { return c.id + ':' + c.why; }));
var sizedNotDrawn = T.board({ now: NOW, projects: [{ id: 's', name: 'Sized', stage: 'candidate', bessKwh: 500, updatedAt: NOW }] })[0];
ok('a battery candidate sized but not drawn keeps its place by touch and says so', sizedNotDrawn.why === 'Nothing on the site map yet · Touched today' && sizedNotDrawn.rank === 10, sizedNotDrawn);
var many = b({ projects: [1, 2, 3, 4].map(function (i) { return { id: 'j' + i, name: 'Job ' + i, type: 'l2', stage: 'candidate', createdAt: NOW - i * DAY }; }) });
ok('many undesigned jobs are ONE row naming three, opening the oldest', many.needs.length === 1 && many.needs[0].key === 'design' && /4 projects have nothing on the site map yet/.test(many.needs[0].t) && /Job 1, Job 2, Job 3 and 1 more/.test(many.needs[0].s) && many.needs[0].act.kind === 'project' && many.needs[0].act.id === 'j4' && many.needs[0].projects.length === 4, many.needs);

console.log('tworkspacetoday: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
