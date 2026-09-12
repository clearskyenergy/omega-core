/* The Sky Fund sandbox shim, driven the way the page drives it: fake Firebase
   calls, /api/invest through the overridden fetch, a simulated checkout, a
   fast-forwarded quarter. A dead sandbox on a phone looks like a dead product,
   so the non-DOM half is exercised here before it is published.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var path = require('path');
var B = require(path.join(__dirname, '..', 'build-skyfund-sandbox.js'));
var IM = require(path.join(__dirname, '..', '..', 'api', '_lib', 'invest-math.js'));

var fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function near(a, b, tol) { return Math.abs(Number(a) - Number(b)) <= (tol || 1e-6); }

/* A browser-shaped global: enough for the shim's non-DOM half. */
var LS = {};
global.window = global;
global.localStorage = { getItem: function (k) { return LS.hasOwnProperty(k) ? LS[k] : null; }, setItem: function (k, v) { LS[k] = String(v); }, removeItem: function (k) { delete LS[k]; } };
global.location = { hash: '', pathname: '/', href: '' };
global.SKY_FUND_SAMPLES = require(path.join(__dirname, '..', '..', 'portals', 'skyfund', 'samples.js'));
global.SKYFUND_PROJ = B.buildProj();
require(path.join(__dirname, '..', 'skyfund-sandbox', 'shim.js'));

console.log('build');
var page = B.transformPage(require('fs').readFileSync(path.join(__dirname, '..', '..', 'portals', 'skyfund', 'index.html'), 'utf8'));
ok(page.indexOf('www.gstatic.com/firebasejs') < 0 && page.indexOf('"/config.js"') < 0, 'Firebase SDK and /config.js tags are gone');
ok(page.indexOf('<script src="sandbox.js"></script>') > 0 && page.indexOf('<script src="samples.js"></script>') > 0, 'samples.js and sandbox.js are loaded in that order');
ok(!/(src|href)="\/[^\/]/.test(page), 'no root-relative src or href remains (prose in comments may still name paths)');
ok(/<title>Sky Fund Sandbox<\/title>/.test(page), 'titled as the sandbox');
var P = global.SKYFUND_PROJ['sample-compute-1'];
ok(P.perUnitYears.length === 10 && near(P.perUnitYears[1], 14.4 * 1.02, 1e-9), 'per-unit table is the engine\'s: $14.69 in year 2 for one $100 unit');
ok(near(P.irrPct, IM.headline(global.SKY_FUND_SAMPLES[0]).irrPct, 1e-9), 'IRR carried through unchanged');

var fb = global.firebase, auth = fb.auth(), db = fb.firestore();
function api(body) { return global.fetch('/api/invest', { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); }); }

console.log('firestore look-alike');
db.collection('cf_campaigns').where('status', 'in', ['live', 'funded']).get().then(function (q) {
  ok(q.size === 4, 'four seeded campaigns answer the storefront query');
  var live = []; q.forEach(function (d) { if (d.data().status === 'live') live.push(d.id); });
  ok(live.length === 3 && !q.docs[0].data().sample, 'three live, none flagged as a sample inside the sandbox');
  return db.collection('cf_campaigns').doc('sample-compute-1').collection('updates').get();
}).then(function (q) {
  ok(q.size === 1, 'a seeded update post');
  return api({ action: 'quote', campaignId: 'sample-compute-1', amount: 5000 });
}).then(function (j) {
  console.log('quote');
  ok(j.__status === 200 && j.units === 50 && near(j.pctOfProject, 0.004), 'anonymous quote: 50 units = 0.4% of the project');
  ok(near(j.years[1].distribution, 734.4, 0.01) && j.paybackYear === 8, 'year 2 pays $734.40 and payback is year 8 — same as the engine');
  ok(j.personalized === false && j.headline && j.headline.targetYieldPct, 'not personalised; headline present');
  return api({ action: 'pledge', campaignId: 'sample-compute-1', amount: 500, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } });
}).then(function (j) {
  ok(j.__status === 401, 'a pledge needs sign-in');
  console.log('auth look-alike');
  var seen = [];
  auth.onAuthStateChanged(function (u) { seen.push(u ? u.email : null); });
  return auth.signInWithEmailAndPassword('tester@example.com', 'anything').then(function (r) {
    ok(r.user.email === 'tester@example.com' && r.user.displayName === 'Tester', 'any email signs in; a display name is made from it');
    return r.user.getIdToken();
  }).then(function (t) { ok(/^sandbox:/.test(t), 'a token the fetch shim recognises'); return new Promise(function (res) { setTimeout(res, 5); }); })
    .then(function () { ok(seen.indexOf('tester@example.com') >= 0, 'listeners are notified'); });
}).then(function () {
  return db.collection('cf_investors').doc(auth.currentUser.uid).set({ uid: auth.currentUser.uid, email: 'tester@example.com', status: 'active', kyc: 'none', accreditedVerified: false, createdAt: fb.firestore.FieldValue.serverTimestamp() });
}).then(function () {
  var d = global.SKYFUND_SANDBOX.store().docs['cf_investors/' + auth.currentUser.uid];
  ok(d && typeof d.createdAt === 'string', 'serverTimestamp resolves to an ISO string the page can parse');
  return api({ action: 'quote', campaignId: 'sample-compute-1', amount: 3000 });
}).then(function (j) {
  ok(j.personalized === true && j.eligible === false && /per year/.test(j.reasons[0]), 'personalised quote applies the annual cap');
  console.log('pledge → checkout → paid');
  return api({ action: 'pledge', campaignId: 'sample-compute-1', amount: 550, attest: { name: 'T. Ester', acceptedRisk: true, acceptedTerms: true, country: 'US' } });
}).then(function (j) {
  ok(j.__status === 200 && j.units === 5 && j.amount === 500 && /^#\/sandbox-checkout\//.test(j.url), '$550 buys 5 units; the page is sent to the sandbox checkout');
  var pid = j.pledgeId;
  var before = global.SKYFUND_SANDBOX.store().docs['cf_campaigns/sample-compute-1'];
  ok(before.raised === 187300 && before.backers === 214, 'nothing moves while pending');
  global.SKYFUND_SANDBOX.pay(pid);
  var after = global.SKYFUND_SANDBOX.store().docs['cf_campaigns/sample-compute-1'];
  ok(after.raised === 187800 && after.unitsSold === 1878 && after.backers === 215, 'paying moves raised, units and backers');
  global.SKYFUND_SANDBOX.pay(pid);
  ok(global.SKYFUND_SANDBOX.store().docs['cf_campaigns/sample-compute-1'].raised === 187800, 'paying twice is a no-op');
  return db.collection('cf_pledges').where('investorUid', '==', auth.currentUser.uid).get();
}).then(function (q) {
  ok(q.size === 1 && q.docs[0].data().status === 'paid' && q.docs[0].data().projectedAnnual > 0, 'the portfolio query finds the paid pledge');
  return api({ action: 'pledge', campaignId: 'sample-compute-1', amount: 300, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } });
}).then(function (j) {
  global.SKYFUND_SANDBOX.cancel(j.pledgeId);
  var p = global.SKYFUND_SANDBOX.store().docs['cf_pledges/' + j.pledgeId];
  ok(p.status === 'cancelled' && global.SKYFUND_SANDBOX.store().docs['cf_campaigns/sample-compute-1'].raised === 187800, 'cancelling a checkout releases it without touching counters');
  return api({ action: 'pledge', campaignId: 'sample-bess-1', amount: 500, attest: { acceptedRisk: true, acceptedTerms: true, country: 'US' } });
}).then(function (j) {
  ok(j.__status === 409, 'a funded campaign refuses new money');
  console.log('fast-forward a quarter');
  var n = global.SKYFUND_SANDBOX.quarter();
  ok(n === 1, 'one held project gets a distribution');
  return db.collection('cf_distributions').where('campaignId', '==', 'sample-compute-1').get();
}).then(function (q) {
  var d = q.docs[0].data();
  ok(q.size === 1 && near(d.distributable, 45000) && near(d.crowdPool, 18000) && near(d.perUnit, 18000 / 1878, 1e-6), 'a quarter of $180k, 40% to the crowd, per unit over 1,878 units');
  ok(global.SKYFUND_SANDBOX.store().docs['cf_campaigns/sample-compute-1'].status === 'funded', 'the campaign is now funded');
  ok(JSON.parse(LS.skyfund_sandbox_v2).docs['cf_distributions/' + q.docs[0].id], 'state persisted to localStorage');
  return auth.signOut();
}).then(function () {
  ok(auth.currentUser === null, 'sign-out');
  global.SKYFUND_SANDBOX.reset();
  ok(Object.keys(global.SKYFUND_SANDBOX.store().docs).filter(function (k) { return k.indexOf('cf_pledges/') === 0; }).length === 0, 'reset clears commitments');
  console.log(fails ? '\n' + fails + ' failing' : '\nall passing');
  process.exit(fails ? 1 : 0);
}).catch(function (e) { console.error('  CRASH', e); process.exit(1); });
