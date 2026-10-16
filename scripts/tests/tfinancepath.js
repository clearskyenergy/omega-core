#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Output › Financing › Finance It (omega-finance-path.js), the rule held
   without a browser: what each step says, in order, from what the editor
   holds. Saved and priced come first. Returns show the Results rail's own
   figures, and only for a drawing priced as it stands. The compute case
   appears only with compute on the drawing, and the plans check only with a
   read. The hand-offs open only once the project is saved and the drawing is
   priced as it stands. A command the plan does not open is locked, never
   offered. The panel's own buttons are wired to the steps it draws.
   node scripts/tests/tfinancepath.js */
'use strict';
var assert = require('node:assert/strict'), path = require('path'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var F = require(path.join(ROOT, 'omega-finance-path.js'));
var pass = 0;
function ok(c, m) { assert.ok(c, m); pass++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); pass++; }
function brief(list) { return list.map(function (x) { return [x.key, x.status, x.action, !!x.disabled, !!x.locked]; }); }
function by(list, key) { return list.filter(function (x) { return x.key === key; })[0]; }

var SAVED = { id: 'p1', dirty: false }, PRICED = { ran: true, stale: false, running: false, total: 1234567 };

/* a new drawing: nothing saved, nothing run */
var fresh = F.steps({});
eq(brief(fresh), [['save', 'todo', 'save', false, false], ['run', 'todo', 'run', false, false], ['returns', 'wait', null, false, false],
  ['helios', 'wait', 'helios', true, false], ['market', 'wait', 'market', true, false], ['financing', 'wait', 'financing', true, false]],
  'a new drawing: save and run first; the returns wait on the Run; the hand-offs wait, shut');
ok(/Save the project first/.test(by(fresh, 'save').text) && /Run the design/.test(by(fresh, 'run').text) && /Once the project is saved and priced/.test(by(fresh, 'helios').text), 'each says what it waits on');
eq(F.headline(fresh).tone, 'info', 'and the head says how to get there');

/* saved and priced, no revenue modelled: the Value Stack is the next step, the hand-offs open */
var noIrr = F.steps({ project: SAVED, priced: PRICED, fin: { irr: null, perW: 2.1, payback: null } });
eq(brief(noIrr), [['save', 'done', null, false, false], ['run', 'done', null, false, false], ['returns', 'todo', 'valueStack', false, false],
  ['helios', 'go', 'helios', false, false], ['market', 'go', 'market', false, false], ['financing', 'go', 'financing', false, false]], 'saved and priced: the hand-offs open; returns wait on revenue');
ok(/\$1,234,567/.test(by(noIrr, 'run').text), 'the Run’s own total, as it priced the drawing');
ok(/No revenue is modelled/.test(by(noIrr, 'returns').text), 'no IRR without revenue, and it says so');
var hn = F.headline(noIrr);
ok(hn.tone === 'warn' && /1 step is still open: returns/.test(hn.text), 'the head names what is still open');

/* the rail's figures, current */
var irr = F.steps({ project: SAVED, priced: PRICED, fin: { irr: 11.24, perW: 2.137, payback: 7.46 } });
var r = by(irr, 'returns');
ok(r.status === 'done' && r.action === 'rail' && /10-year IRR 11\.2%/.test(r.text) && /\$2\.14\/W/.test(r.text) && /payback 7\.5 years/.test(r.text), 'IRR, $/W and payback as the rail has them, and Show opens the rail');
eq(F.headline(irr).tone, 'ok', 'everything done: ready to hand over');

/* a drawing changed since the Run: priced no longer, the hand-offs shut again, the rail's figures not shown */
var stale = F.steps({ project: SAVED, priced: { ran: true, stale: true, total: 1234567 }, fin: { irr: 11.2 } });
ok(by(stale, 'run').status === 'todo' && /changed since the last Run/.test(by(stale, 'run').text), 'a changed drawing runs again');
ok(by(stale, 'returns').status === 'wait' && by(stale, 'helios').disabled && by(stale, 'market').disabled && by(stale, 'financing').disabled, 'what goes out is never a stale model');
var running = by(F.steps({ project: SAVED, priced: { ran: true, stale: true, running: true, total: 9 } }), 'run');
ok(running.status === 'wait' && !running.action && /Running/.test(running.text), 'while it runs, no second Run');
ok(/priced nothing/.test(by(F.steps({ project: SAVED, priced: { ran: true, stale: false, total: 0 } }), 'run').text), 'a Run that priced nothing says so, never "$0"');
var dirty = F.steps({ project: { id: 'p1', dirty: true }, priced: PRICED, fin: { irr: 11 } });
ok(by(dirty, 'save').status === 'todo' && /unsaved changes/.test(by(dirty, 'save').text) && by(dirty, 'helios').disabled, 'unsaved work: save first, the hand-offs wait');

/* the compute case, only with compute on the drawing */
ok(!by(irr, 'compute'), 'no compute, no compute step');
var core = by(F.steps({ project: SAVED, priced: PRICED, compute: { skids: 1, pods: 0, core: null } }), 'compute');
ok(core.status === 'todo' && core.action === 'omegaCore' && /An Omega-Core skid is on the drawing/.test(core.text), 'a skid not yet qualified: Omega-Core');
var done = by(F.steps({ project: SAVED, priced: PRICED, compute: { skids: 2, core: { verdict: 'conditional', at: '2026-10-16T10:00:00Z' } } }), 'compute');
ok(done.status === 'done' && /qualified with conditions \(Oct 16, 2026\)/.test(done.text), 'qualified, in the qualifier’s own words, with its date');
var pods = by(F.steps({ compute: { skids: 0, pods: 3 } }), 'compute');
ok(pods.status === 'info' && pods.action === 'siteScreen', 'compute pods: the Site Screen takes them to the pro forma');

/* the plans check, only with a read */
ok(!by(irr, 'plans'), 'no read, no plans step');
var p0 = by(F.steps({ plans: { fileName: 'Plans.pdf', differ: null } }), 'plans'), p3 = by(F.steps({ plans: { fileName: 'Plans.pdf', differ: 3 } }), 'plans'), pz = by(F.steps({ plans: { fileName: 'Plans.pdf', differ: 0 } }), 'plans');
ok(p0.status === 'todo' && p3.status === 'review' && /3 rows differ from Plans\.pdf/.test(p3.text) && /E0\.1/.test(p3.text) && pz.status === 'done' && p0.action === 'whatChanged', 'not compared yet, rows to review, or a match');
var open = F.headline(F.steps({ project: SAVED, priced: PRICED, fin: { irr: 9 }, plans: { fileName: 'Plans.pdf', differ: 2 } }));
ok(open.tone === 'warn' && /checked against the customer’s plans/.test(open.text), 'rows that differ keep the deal from reading as checked');

/* a command the plan does not open is locked, never offered */
var locked = F.steps({ project: SAVED, priced: PRICED, fin: { irr: null }, allowed: { valueStack: false, helios: false, market: true } });
ok(by(locked, 'returns').locked && by(locked, 'helios').locked && !by(locked, 'market').locked && !by(locked, 'save').locked, 'locked where the plan does not open the command');

/* the order */
eq(F.steps({ project: SAVED, priced: PRICED, compute: { skids: 1 }, plans: { fileName: 'x' } }).map(function (x) { return x.key; }),
  ['save', 'run', 'returns', 'compute', 'plans', 'helios', 'market', 'financing'], 'saved, priced, returns, compute, plans, then the hand-offs');

/* the page: its buttons are the editor's own commands, and a hand-off is never clicked past its step */
var src = fs.readFileSync(path.join(ROOT, 'omega-finance-path.js'), 'utf8');
ok(/openHeliosIntake/.test(src) && /openMarketplacePush/.test(src) && /openFinancingApply/.test(src) && /openOmegaCore/.test(src) && /rb-valuestack/.test(src), 'each action finds the ribbon’s own command');
ok(/step && \(step\.disabled \|\| step\.locked\)\) \{ render\(\); return; \}/.test(src), 'run() refuses a step the panel shows shut, for any caller');
ok(/allowedElement/.test(src), 'and asks the plan before clicking');
var ed = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
ok(/id="rb-finance-path" onclick="rbRun\(openFinancePath\)" data-cap="export"/.test(ed) && ed.indexOf('<script src="/omega-finance-path.js"></script>') > 0, 'the button sits with the financing commands, under their cap, and the panel loads');
var M = require(path.join(ROOT, 'api', '_lib', 'modules.js'));
eq(M.owners('rb-finance-path', 'rbRun(openFinancePath)'), ['finance'], 'Omega Capital owns it, as it owns the hand-offs');

console.log('tfinancepath: ' + pass + ' passed');
