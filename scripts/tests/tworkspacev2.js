/* The journey home presents Today's list without the noise.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tworkspacev2.js */
'use strict';
var fs = require('fs'), path = require('path');
var T = require('../../omega-workspace-today.js');
var V = require('../../omega-workspace-v2.js');
var pass = 0, fail = 0, DAY = 86400000, NOW = Date.UTC(2026, 9, 17, 22, 0, 0), ME = 'ann@northstar.example';
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got).slice(0, 400) : '')); }

var ADDR = '4846 S. Michigan Ave, Chicago';
var projects = [];
for (var i = 0; i < 72; i++) projects.push({ id: 'm' + i, name: ADDR, stage: 'candidate', updatedAt: NOW - (40 + i) * DAY, createdAt: NOW - 80 * DAY });
projects.push({ id: 'river', name: 'Riverside BESS', stage: 'interconnect', capex: 3100000, bessKwh: 4000, updatedAt: NOW - DAY });
projects.push({ id: 'river2', name: 'Riverside BESS', stage: 'interconnect', capex: 3100000, bessKwh: 4000, updatedAt: NOW - 2 * DAY });
var finance = [
  { id: 'b1', name: 'S.J Burns LLC (330 roberts)', status: 'review', updatedAt: NOW - 33 * DAY },
  { id: 'b2', name: 'S.J. Burns LLC (330 roberts)', status: 'review', updatedAt: NOW - 33 * DAY },
  { id: 'c1', name: '225 Cesar Chavez Blvd,_TG', status: 'review', updatedAt: NOW - 33 * DAY },
  { id: 'c2', name: '225 Cesar Chavez Blvd,_TG', status: 'review', updatedAt: NOW - 33 * DAY }
];
var built = T.build({ now: NOW, me: ME, orgId: 'northstar.example', trialEndsAt: NOW + 2 * DAY, projects: projects, finance: finance, canOpen: function () { return true; } });
ok('Today still emits the duplicate reviews and the address list (the live page is unchanged)', built.needs.filter(function (r) { return r.key.indexOf('review:') === 0; }).length === 4 && /4846/.test(built.needs.map(function (r) { return r.s; }).join(' ')), built.needs.map(function (r) { return r.t; }));

var home = V.home({
  now: NOW, first: 'Thomas', company: 'ClearSky', plan: 'Trial', trialEndsAt: NOW + 2 * DAY,
  projects: projects, needsSize: 72, needsDesign: 0, pastCandidate: 2, reviews: 2, quotesWaiting: 0,
  needs: built.needs, more: built.more, kpis: built.kpis,
  cards: T.board({ now: NOW, projects: projects, finance: finance, max: 200 }),
  canOpen: function () { return true; }, focus: { id: 'm71', name: ADDR, address: ADDR }
});
var needsText = JSON.stringify(home.groups);
ok('the trial is an account notice, not a work row', home.account.length === 1 && /trial/i.test(home.account[0].title) && !/trial ends/i.test(needsText), home.account);
var reviews = home.groups.filter(function (g) { return g.key === 'reviews'; })[0];
ok('two review titles, each saved twice, are two rows', reviews && reviews.rows.length === 2 && reviews.rows.every(function (r) { return r.count === 2; }), reviews && reviews.rows);
ok('a review row names the deal once', reviews.rows[0].title.indexOf('has been in review') < 0 && /Burns/.test(reviews.rows[0].title) && /records/.test(reviews.rows[0].detail), reviews.rows[0]);
var queue = home.groups.filter(function (g) { return g.key === 'queue'; })[0];
ok('the design queue is a count and does not dump addresses', queue && queue.rows.length === 1 && /72 candidates need a battery size/.test(queue.rows[0].title) && queue.rows[0].detail.indexOf('4846') < 0 && queue.rows[0].href === '/projects.html', queue && queue.rows[0]);
var names = home.track.map(function (c) { return c.name; });
ok('in motion lists Riverside once and says it was saved twice', names.filter(function (n) { return n === 'Riverside BESS'; }).length === 1 && /Saved 2 times/.test(home.track.filter(function (c) { return c.name === 'Riverside BESS'; })[0].why), home.track.map(function (c) { return c.name + ' · ' + c.copies; }));
ok('a large unsized queue makes Design the next step', home.journey.now === 'design', home.journey.now);
ok('a step after the current one is not marked done', home.journey.steps[4].done === false && home.journey.steps[0].done === true && home.journey.steps[2].done === true, home.journey.steps.map(function (s) { return s.label + (s.done ? '+' : s.now ? '*' : ''); }));
var hour = new Date(NOW).getHours(), hello = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + ', Thomas';
ok('the greeting is one line and the status line is not a chip row', home.greet === hello && home.status === 'ClearSky · Trial, 2 days left' && home.status.indexOf('module') < 0, { greet: home.greet, status: home.status, hello: hello });

var empty = V.journey({ now: NOW, projects: [], canOpen: function () { return true; } });
ok('a new workspace starts at the customer, before a blank project', empty.now === 'customer' && empty.steps[1].href === '/clearsky-sitefinder.html' && empty.steps[1].links[0].href === '/portfolio.html', empty.now);
var office = V.journey({ now: NOW, projects: [], logicOffice: true, canOpen: function () { return true; } });
ok('Omega Logic opens customer accounts', office.steps[1].href === '/portals/customer/admin.html');
var pending = V.journey({ pendingApproval: true, projects: projects, needsSize: 72 });
ok('approval pending keeps the next step on Arrive', pending.now === 'arrive' && /approv/i.test(pending.steps[0].detail), pending.now);
var attached = V.journey({ projects: [{ id: 'p', customerId: 'acme', capex: 1, stage: 'package' }], pastCandidate: 1, canOpen: function () { return true; } });
ok('a project with a customer marks that step done and moves on to tracking', attached.steps[1].done === true && attached.now === 'track', attached.now);
ok('Grid Atlas takes the focus address', /[?&]q=4846/.test(home.journey.steps[4].href), home.journey.steps[4].href);
ok('every step has a real door', home.journey.steps.every(function (s) { return s.href && (s.href.charAt(0) === '/' || s.href.charAt(0) === '#'); }));
ok('eight steps, in order', home.journey.steps.map(function (s) { return s.label; }).join(' · ') === 'Arrive · Customer · Project · Design · Analyze · Propose · Order · Track');

var labels = V.nav({}).filter(function (n) { return n.label && !n.hidden && !n.section; }).map(function (n) { return n.label; });
ok('the preview rail groups the work and does not repeat the old chip labels', labels.join('|') === 'Home|Customers|Projects|Portfolio|Tools|Modules|Marketplace|Quotes|Team|Feed|Plan & billing|Settings|Switch to classic' && labels.indexOf('All tools') < 0 && labels.indexOf('Quote Desk') < 0, labels);
ok('Switch to classic remembers the choice', V.nav({}).some(function (n) { return n.label === 'Switch to classic' && n.href === '/workspace?ui=classic'; }));
ok('joint development and admin ids stay, hidden, for the same reveal', V.nav({}).some(function (n) { return n.id === 'sn-jda' && n.hidden; }) && V.nav({}).some(function (n) { return n.id === 'sn-admin' && n.hidden; }));
ok('the phone bar is five doors', V.tabs({}).length === 5 && V.tabs({ logicOffice: true })[1][3] === '/portals/customer/admin.html');

['grid-atlas.html', 'vpp-earnings.html', 'compute-proforma.html', 'sales-proposal.html', 'proforma.html', 'omega-prime.html', 'clearsky-sitefinder.html', 'portfolio.html', 'projects.html', 'rfq.html', 'workspace.html', 'editor.html'].forEach(function (f) {
  ok(f + ' is a real page', fs.existsSync(path.join(__dirname, '../../', f)));
});
var shell = fs.readFileSync(path.join(__dirname, '../../omega-workspace-shell.js'), 'utf8');
var live = fs.readFileSync(path.join(__dirname, '../../workspace.html'), 'utf8');
ok('the live rail text is untouched', /label: 'All tools'/.test(shell) && /label: 'Quote Desk'/.test(shell));
ok('a page can pass its own rail without changing the default', /opts\.nav \|\| NAV/.test(shell) && /opts\.tabsItems \|\| TABS/.test(shell));
ok('the live home still draws the hex hub', /omega-hexhub\.js/.test(live) && /Where to\?/.test(live));
ok('the live home loads the shared switch and does not send anyone to the journey on its own', /omega-experience\.js/.test(live) && live.indexOf("location.replace('/workspace-v2'") < 0 && live.indexOf("location.assign('/workspace-v2'") < 0);
var returnScript = live.slice(live.indexOf('function returnHome() {'), live.indexOf('function route() {'));
function homeReturn(search) {
  var dest = null;
  require('vm').runInNewContext(returnScript + '; returnHome();', { location: { search: search, assign: function (url) { dest = url; } }, go: function (key) { dest = key; } });
  return dest;
}
ok('Home from a section stays on the classic workspace', homeReturn('') === 'home' && homeReturn('?org=northstar') === 'home' && homeReturn('?ui=v1') === 'home' && homeReturn('?ui=classic') === 'home' && homeReturn('?ui=v2') === 'home');
var v2 = fs.readFileSync(path.join(__dirname, '../../workspace-v2.html'), 'utf8');
ok('the preview does not load the hex hub', v2.indexOf('omega-hexhub.js') < 0 && v2.indexOf('Where to?') < 0);
var hidden = V.home({ projects: [{ id: 'a' }, { id: 'b' }], needsSize: 72, needs: [{ key: 'trial', t: 'Your trial ends in 2 days', s: 'Keep what you use.', cta: 'See plans', href: '/workspace#plans' }], cards: [] });
ok('a design queue that did not fit in Today is still one count, with no addresses', hidden.groups.some(function (g) { return g.key === 'queue' && g.rows[0].title === '72 candidates need a battery size' && g.rows[0].detail.indexOf('4846') < 0; }) && hidden.account.length === 1);
var partial = built.needs.filter(function (r) { return r.key !== 'review:b2' && r.key !== 'review:c2'; });
var folded = V.home({ now: NOW, projects: projects, needsSize: 72, needs: partial, finance: finance, cards: [] });
var foldedReviews = folded.groups.filter(function (g) { return g.key === 'reviews'; })[0];
ok('a review Today cut off is still grouped with its twin', foldedReviews && foldedReviews.rows.length === 2 && foldedReviews.rows.every(function (r) { return r.count === 2; }), foldedReviews && foldedReviews.rows);

if (fail) { console.log(fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('tworkspacev2: ' + pass + ' passed');
