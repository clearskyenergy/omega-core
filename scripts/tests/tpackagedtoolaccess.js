/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/tests/tpackagedtoolaccess.js — a packaged workspace's STORED
   toolAccess follows the module catalog (scripts/backfill-packaged-toolaccess.js).

   firestore.rules packageWrite(org, tool) lets a browser save
   toolData/{org}/tools/{tool} only while `tool in billing/current.toolAccess`,
   a copy of modules.resolve(modules) the billing engine saves at approval
   and rewrites only when it reconciles an invoice. When `vppsim` joined
   Omega Design (lite), every package provisioned before that deploy kept a
   copy without it: /api/vpp-estimate answered (it resolves modules[] live)
   and the page's Save was permission-denied. This holds:
     1. the pure plan: live packaged states only, lite alone for
        past_due_lite, add never remove, a legacy allowlist never touched;
     2. the run on the Firestore double: a dry run writes nothing; --apply
        writes toolAccess and nothing else, one admin_audit row per change,
        never deletes, and a second run changes nothing;
     3. the rules' own `tool in …toolAccess` clause, cut out of
        firestore.rules, refuses vppsim on a record saved under the previous
        catalog and allows it after the backfill;
     4. the catalog this backfill last covered: a module gaining a tool
        fails here until the backfill is run with that deploy.

   No network, no credentials. Run: node scripts/tests/tpackagedtoolaccess.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var F = require(path.join(ROOT, 'scripts', '_lib', 'firestore-double'));
var M = require(path.join(ROOT, 'api', '_lib', 'modules'));
var B = require(path.join(ROOT, 'scripts', 'backfill-packaged-toolaccess'));

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
}
function section(t) { console.log('\n' + t); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* Omega Design's tools before 2026-09-29 (the review's own reading of
   resolve(['lite']) at the commit before vppsim joined). */
var PREVIOUS_LITE = ['editor', 'sandbox', 'sales', 'intake', 'opportunity', 'financing', 'signal'];
var STORAGE = M.get('storage').tools;
var NOW = Date.parse('2026-09-29T12:00:00Z'), DAY = 86400000;

/* ── 1 · the plan ─────────────────────────────────────────────────────── */
section('Plan');
ok('the catalog change being backfilled: lite = the previous list + vppsim', same(M.resolve(['lite']).toolAccess, PREVIOUS_LITE.concat(['vppsim'])), M.resolve(['lite']).toolAccess);
var trialOld = { packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: PREVIOUS_LITE.slice() };
var p = B.plan(trialOld);
ok('a trial saved under the previous catalog gains vppsim, and only it', p.action === 'add' && same(p.add, ['vppsim']) && same(p.toolAccess, PREVIOUS_LITE.concat(['vppsim'])), p);
ok('a paid package gains it too', B.plan({ packaged: true, packagingState: 'paid', modules: ['lite', 'storage'], toolAccess: PREVIOUS_LITE.concat(STORAGE) }).add.join() === 'vppsim');
var pdl = B.plan({ packaged: true, packagingState: 'past_due_lite', modules: ['lite', 'storage'], toolAccess: PREVIOUS_LITE.slice() });
ok('past_due_lite is Omega Design alone, whatever modules[] says (the engine\'s rule)', pdl.action === 'add' && same(pdl.add, ['vppsim']) && same(pdl.modules, ['lite']), pdl);
['awaiting_payment', 'unpaid', undefined].forEach(function (s) {
  ok('a package in state ' + s + ' is left to the engine', B.plan({ packaged: true, packagingState: s, modules: ['lite'], toolAccess: PREVIOUS_LITE.slice() }).action === 'skip');
});
ok('a legacy allowlist (Clean Cell\'s two-tool product) is never widened', B.plan({ tier: 'standard', toolAccess: ['editor', 'gridatlas'] }).action === 'skip');
ok('a record no longer packaged keeps its allowlist, whatever state it carries', B.plan({ packaged: false, packagingState: 'paid', modules: ['lite'], toolAccess: ['editor', 'gridatlas'] }).action === 'skip');
ok('packaged must be the literal true', B.plan({ packaged: 'true', packagingState: 'trial', modules: ['lite'], toolAccess: [] }).action === 'skip');
ok('no record is a skip', B.plan(null).action === 'skip');
var extra = B.plan({ packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: ['retiredtool'].concat(PREVIOUS_LITE) });
ok('a stored tool the catalog no longer names is kept (add, never remove)', extra.action === 'add' && extra.toolAccess[0] === 'retiredtool' && extra.toolAccess.indexOf('vppsim') > 0, extra.toolAccess);
var none = B.plan({ packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: null });
ok('a record with no stored list gets the whole grant, and says it had none', none.action === 'add' && none.was === null && same(none.toolAccess, M.resolve(['lite']).toolAccess), none);
ok('an up-to-date record needs nothing', B.plan({ packaged: true, packagingState: 'paid', modules: ['lite'], toolAccess: M.resolve(['lite']).toolAccess }).action === 'none');
ok('modules that no longer resolve go to a person', B.plan({ packaged: true, packagingState: 'paid', modules: ['lite', 'retired-module'], toolAccess: [] }).action === 'review');
ok('arguments: dry run by default', same(B.parseArgs([]), { apply: false, org: null }));
ok('arguments: --apply and --org', same(B.parseArgs(['--org', 'Acme.com', '--apply']), { apply: true, org: 'acme.com' }));
var threw = false; try { B.parseArgs(['--aply']); } catch (e) { threw = true; }
ok('arguments: a typo is refused, never a silent dry run or apply', threw);

/* ── 2 · the run ──────────────────────────────────────────────────────── */
function seed() {
  var db = new F.DB();
  function org(id, billing, orgDoc) {
    db.seed('omega_orgs/' + id, orgDoc || { name: id, status: 'active' });
    if (billing) db.seed('omega_orgs/' + id + '/billing/current', billing);
  }
  org('trial-old.com', { packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: PREVIOUS_LITE.slice(), caps: ['design', 'view', 'export.blueprint'],
    trialStartedAt: NOW - 3 * DAY, trialEndsAt: NOW + 11 * DAY, accessUntil: NOW + 11 * DAY, monthlyCents: 9900, plan: 'Lite + modules' });
  org('paid-old.com', { packaged: true, packagingState: 'paid', modules: ['lite', 'storage'], toolAccess: PREVIOUS_LITE.concat(STORAGE), accessUntil: NOW + 30 * DAY, paidThrough: '2026-10-15' });
  org('pastdue-old.com', { packaged: true, packagingState: 'past_due_lite', modules: ['lite'], toolAccess: PREVIOUS_LITE.slice(), paidThrough: '2026-09-01', accessUntil: NOW + 5 * DAY });
  org('awaiting.com', { packaged: true, packagingState: 'awaiting_payment', modules: ['lite'], toolAccess: PREVIOUS_LITE.slice(), accessUntil: NOW });
  org('cleancell.us', { tier: 'standard', toolAccess: ['editor', 'gridatlas'] });
  org('current.com', { packaged: true, packagingState: 'paid', modules: ['lite'], toolAccess: M.resolve(['lite']).toolAccess, accessUntil: NOW + 30 * DAY });
  org('kept.com', { packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: ['retiredtool'].concat(PREVIOUS_LITE), trialStartedAt: NOW - DAY, trialEndsAt: NOW + 13 * DAY, accessUntil: NOW + 13 * DAY });
  org('broken.com', { packaged: true, packagingState: 'paid', modules: ['lite', 'retired-module'], toolAccess: PREVIOUS_LITE.slice() });
  org('nobilling.com', null);
  return db;
}
function dump(db) { var o = {}; db.data.forEach(function (v, k) { o[k] = v; }); return JSON.parse(JSON.stringify(o)); }
function audits(db, org) {
  var rows = []; db.data.forEach(function (v, k) { if (k.indexOf('omega_orgs/' + org + '/admin_audit/') === 0) rows.push(v); }); return rows;
}
function allAudits(db) { var n = 0; db.data.forEach(function (v, k) { if (/\/admin_audit\//.test(k)) n++; }); return n; }
function billing(db, org) { return db.data.get('omega_orgs/' + org + '/billing/current'); }
function without(o, k) { var c = JSON.parse(JSON.stringify(o)); delete c[k]; return c; }

var queue = Promise.resolve();
function later(fn) { queue = queue.then(fn); }
var quiet = function () {};

later(function () {
  section('Dry run');
  var db = seed(), before = dump(db), lines = [];
  return B.run(db, { now: NOW, log: function (l) { lines.push(l); } }).then(function (report) {
    ok('a dry run writes nothing at all', same(dump(db), before));
    function row(id) { return report.filter(function (r) { return r.orgId === id; })[0] || {}; }
    ok('it reads every workspace', report.length === 9, report.length);
    ok('it reports what it would add', row('trial-old.com').action === 'add' && row('paid-old.com').action === 'add' && row('pastdue-old.com').action === 'add' && row('kept.com').action === 'add');
    ok('it reports what it leaves', row('awaiting.com').action === 'skip' && row('cleancell.us').action === 'skip' && row('current.com').action === 'none' && row('nobilling.com').action === 'skip' && row('broken.com').action === 'review', report);
    ok('the printed report names each workspace and says nothing was written', lines.some(function (l) { return /trial-old\.com .*would add vppsim/.test(l); }) && lines.some(function (l) { return /REVIEW/.test(l) && /broken\.com/.test(l); }) && /nothing written/.test(lines[lines.length - 1]), lines);
  });
});

later(function () {
  section('Apply');
  var db = seed(), before = dump(db);
  return B.run(db, { apply: true, now: NOW, log: quiet }).then(function (report) {
    var after = dump(db);
    ok('no document was deleted', Object.keys(before).every(function (k) { return Object.prototype.hasOwnProperty.call(after, k); }));
    ok('trial-old.com gains vppsim', same(billing(db, 'trial-old.com').toolAccess, PREVIOUS_LITE.concat(['vppsim'])), billing(db, 'trial-old.com').toolAccess);
    ok('  and nothing else on the record changed', same(without(billing(db, 'trial-old.com'), 'toolAccess'), without(before['omega_orgs/trial-old.com/billing/current'], 'toolAccess')));
    ok('paid-old.com gains vppsim and keeps Omega Storage', same(billing(db, 'paid-old.com').toolAccess, PREVIOUS_LITE.concat(STORAGE, ['vppsim'])), billing(db, 'paid-old.com').toolAccess);
    ok('pastdue-old.com gains vppsim', billing(db, 'pastdue-old.com').toolAccess.indexOf('vppsim') >= 0);
    ok('kept.com keeps its retired tool', billing(db, 'kept.com').toolAccess[0] === 'retiredtool' && billing(db, 'kept.com').toolAccess.indexOf('vppsim') >= 0);
    ['awaiting.com', 'cleancell.us', 'current.com', 'broken.com'].forEach(function (id) {
      ok(id + ' is untouched', same(billing(db, id), before['omega_orgs/' + id + '/billing/current']) && audits(db, id).length === 0);
    });
    ok('nobilling.com gets no record', !db.data.has('omega_orgs/nobilling.com/billing/current'));
    var only = Object.keys(after).filter(function (k) { return !same(after[k], before[k]); });
    ok('the only documents written are the four records and their audit rows', only.length === 8 && only.every(function (k) { return /\/billing\/current$/.test(k) || /\/admin_audit\//.test(k); }), only);
    var a = audits(db, 'trial-old.com');
    ok('one admin_audit row per workspace changed', a.length === 1 && audits(db, 'paid-old.com').length === 1 && audits(db, 'pastdue-old.com').length === 1 && audits(db, 'kept.com').length === 1);
    ok('  it says who, when, what it was and what it became', a[0] && a[0].by === 'scripts/backfill-packaged-toolaccess.js' && a[0].at === NOW && a[0].action === 'package-toolaccess-backfill' && a[0].orgId === 'trial-old.com'
      && same(a[0].was.toolAccess, PREVIOUS_LITE) && same(a[0].changed.toolAccess, PREVIOUS_LITE.concat(['vppsim'])) && same(a[0].changed.added, ['vppsim']) && a[0].packagingState === 'trial', a[0]);
    ok('the report matches what was written', report.filter(function (r) { return r.action === 'add'; }).length === 4);
    var snap = dump(db);
    return B.run(db, { apply: true, now: NOW + 1, log: quiet }).then(function (again) {
      ok('a second run changes nothing and writes no audit row', same(dump(db), snap) && again.every(function (r) { return r.action !== 'add'; }));
    });
  });
});

later(function () {
  section('One workspace');
  var db = seed();
  return B.run(db, { apply: true, org: 'paid-old.com', now: NOW, log: quiet }).then(function (report) {
    ok('--org touches that workspace alone', report.length === 1 && billing(db, 'paid-old.com').toolAccess.indexOf('vppsim') >= 0
      && billing(db, 'trial-old.com').toolAccess.indexOf('vppsim') < 0 && allAudits(db) === 1);
  });
});

/* ── 3 · the rule the browser's Save meets ────────────────────────────── */
var rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
var toolData = /match \/toolData\/\{orgId\}\/tools\/\{toolKey\} \{[\s\S]*?\n    \}/.exec(rules);
var pw = /function packageWrite\(o, tool\) \{([\s\S]*?)\n    \}/.exec(rules);
var clause = pw && /tool in get\(\/databases\/\$\(database\)\/documents\/omega_orgs\/\$\(o\)\/billing\/current\)\.data\.get\('(\w+)', \[\]\)/.exec(pw[1]);
/* the clause as the rules engine evaluates it: a missing field is the
   default []; `in` on anything but a list is an evaluation error, which the
   rules treat as a refusal */
function ruleToolIn(doc, tool) {
  var v = Object.prototype.hasOwnProperty.call(doc, clause[1]) ? doc[clause[1]] : [];
  return Array.isArray(v) && v.indexOf(tool) >= 0;
}
later(function () {
  section('firestore.rules: the tool clause of packageWrite');
  ok('toolData/{org}/tools/{tool} writes go through packageWrite(orgId, toolKey)', !!toolData && /allow write:[^\n]*packageWrite\(orgId, toolKey\)/.test(toolData[0]));
  ok('packageWrite requires the tool in the STORED billing/current.toolAccess', !!clause && clause[1] === 'toolAccess', pw && pw[1]);
  if (!clause) return;
  var page = fs.readFileSync(path.join(ROOT, 'vpp-earnings.html'), 'utf8');
  ok('the VPP page saves under toolData/{org}/tools/vppsim', /TOOL_KEY\s*=\s*'vppsim'/.test(page) && /saveToolData\(/.test(page));
  var db = seed(), rec = JSON.parse(JSON.stringify(billing(db, 'trial-old.com')));
  ok('a record saved under the previous catalog: Save of vppsim is REFUSED', ruleToolIn(rec, 'vppsim') === false);
  ok('  while the tools it had still save', ruleToolIn(rec, 'editor') === true);
  ok('  and no stored list at all refuses everything', ruleToolIn({ packaged: true }, 'editor') === false);
  return B.run(db, { apply: true, now: NOW, log: quiet }).then(function () {
    ok('after the backfill: Save of vppsim is ALLOWED', ruleToolIn(billing(db, 'trial-old.com'), 'vppsim') === true);
    ok('  on every live package it touched', ['paid-old.com', 'pastdue-old.com', 'kept.com'].every(function (id) { return ruleToolIn(billing(db, id), 'vppsim'); }));
  });
});

/* ── 4 · the catalog this backfill last covered ───────────────────────── */
/* A stored toolAccess is a copy, so a module that GAINS a tool strands every
   package saved before the deploy (the rules refuse the new tool's saves).
   When this fails: run `node scripts/backfill-packaged-toolaccess.js`, then
   with `--apply`, with the deploy that changes the catalog, and update this
   list. A tool REMOVED from a module is not taken back by the backfill (it
   only adds); the engine narrows the grant at the next paid reconcile. */
var BACKFILLED = {
  'lite': 'editor sandbox sales intake opportunity financing signal vppsim',
  'gridatlas': 'gridatlas interconnect comedcap',
  'storage': 'batterysizer proforma valuestack isocalc',
  'estimate': 'costestimator',
  'evrebates': 'evcostwb evcloseout',
  'plansets': '',
  'siteintel': '',
  'engineering': 'conductorsizing powerflow siteoptimizer',
  'finance': 'investment dcfc fleet apartment degradation',
  'compute': 'datacenter computepower computelease',
  'ops': 'sitelifecycle omconsole slaintel fieldservice ownerreport fleetcommand',
  'whitelabel': '',
  'permitting': '',
  'sitefinder': 'sitefinder sitediscovery',
  'logic-office': '',
  'logic-plant': '',
  'logic-materials': '',
  'logic-logistics': '',
  'logic-customer': ''
};
later(function () {
  section('The catalog the backfill last covered');
  var now = {};
  M.catalog().forEach(function (m) { now[m.key] = m.tools.join(' '); });
  var gained = [];
  Object.keys(now).forEach(function (k) {
    var was = BACKFILLED[k] == null ? [] : (BACKFILLED[k] ? BACKFILLED[k].split(' ') : []);
    now[k].split(' ').filter(Boolean).forEach(function (t) { if (was.indexOf(t) < 0) gained.push(k + ':' + t); });
  });
  ok('no module has gained a tool since the last backfill (else run scripts/backfill-packaged-toolaccess.js with this deploy and update BACKFILLED)', gained.length === 0, gained);
  ok('BACKFILLED is the catalog as it stands', same(now, BACKFILLED), now);
});

later(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
});
queue.catch(function (e) { console.error(e); process.exit(1); });
