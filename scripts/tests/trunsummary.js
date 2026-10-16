#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The Run pinned to Site Map (omega-run-summary.js), held without a browser.

   The rules (decide): a change counts only when the results go from current
   to stale in this tab; the Run re-runs once, a moment after the save of a
   changed drawing, never while the drawing is unsaved again, under a drag
   or while a Run is going, never on a plan that waits (read-only,
   unchecked), never on a project only opened or a new drawing never Run,
   and its own save never re-arms it. What it says (view): the live total,
   the rail's $/W and IRR only when the results are current, and why it
   waits when they are not.

   The editor: omegaRunSave and the re-run ask ONE gate (omegaRunMayWrite),
   which refuses a plan that is read-only or unchecked and a page with no
   project, sign-in or finished load; the rail publishes the figures it
   printed (window._RR_FIN) and the summary only reads them; the readout
   sits beside the Run button, the status bar untouched.
   node scripts/tests/trunsummary.js */
'use strict';
var assert = require('node:assert/strict'), path = require('path'), fs = require('fs'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var R = require(path.join(ROOT, 'omega-run-summary.js'));
var pass = 0;
function ok(v, label) { assert.ok(v, label); pass++; }
function eq(a, b, label) { assert.deepEqual(a, b, label); pass++; }

/* a page, tick by tick */
function page() {
  var p = { st: {}, t: 1000, runs: 0, o: { stale: false, running: false, mayWrite: true, dirty: false, stamp: 1, pressed: false } };
  p.tick = function (ms, change) {
    p.t += ms || 0; if (change) Object.keys(change).forEach(function (k) { p.o[k] = change[k]; });
    var r = R.decide(p.st, Object.assign({}, p.o, { now: p.t })); p.st = r.st;
    if (r.action === 'run') p.runs++;
    return r.action;
  };
  return p;
}
var D = R.DEBOUNCE_MS;

/* ── 1. a loaded project: edit, save, a moment later one Run ── */
var a = page();
a.tick(0);                                              /* opened: current */
a.tick(600, { stale: true, dirty: true });              /* a piece goes down */
ok(a.st.touched && a.st.due == null, 'a change in this tab is noted, nothing runs yet');
a.tick(600, { dirty: false, stamp: 2 });                /* the autosave lands */
ok(a.st.due === a.t + D, 'the save arms the re-run ' + D + ' ms out');
a.tick(D - 600);
eq(a.runs, 0, 'not before the moment passes');
a.tick(600);
eq(a.runs, 1, 'then it runs, once');
a.tick(600, { running: true });
a.tick(600, { running: false, stale: false, dirty: true });   /* the Run ends; omegaRunSave marks unsaved */
a.tick(600, { dirty: false, stamp: 3 });                      /* and saves */
a.tick(D * 4);
eq(a.runs, 1, 'its own save never re-arms it');

/* ── 2. still drawing: the next save re-arms it ── */
var b = page();
b.tick(0); b.tick(600, { stale: true, dirty: true }); b.tick(600, { dirty: false, stamp: 2 });
b.tick(1000, { dirty: true });                          /* another piece before the moment passes */
ok(b.st.due == null && b.st.touched, 'unsaved again: the re-run waits for the next save');
b.tick(D * 2);
eq(b.runs, 0, 'and nothing runs on an unsaved drawing');
b.tick(600, { dirty: false, stamp: 3 }); b.tick(D);
eq(b.runs, 1, 'the next save runs it');

/* ── 3. plans that wait, and a Run by hand ── */
var c = page();
c.tick(0); c.tick(600, { stale: true, dirty: true, mayWrite: false }); c.tick(600, { dirty: false, stamp: 2 }); c.tick(D * 2);
eq(c.runs, 0, 'a read-only or unchecked plan waits for the Run button');
var d = page();
d.tick(0); d.tick(600, { stale: true, dirty: true }); d.tick(600, { dirty: false, stamp: 2 });
d.tick(1000, { stale: false });                         /* someone pressed Run */
d.tick(D * 2);
ok(d.runs === 0 && d.st.due == null, 'a Run by hand takes its place');

/* ── 4. never under a drag or beside a Run ── */
var e = page();
e.tick(0); e.tick(600, { stale: true, dirty: true }); e.tick(600, { dirty: false, stamp: 2 });
e.tick(D, { pressed: true });
ok(e.runs === 0 && e.st.due > e.t, 'a pointer held down puts it off');
e.tick(1000, { pressed: false });
eq(e.runs, 1, 'and it runs once the pointer is up');
var f = page();
f.tick(0); f.tick(600, { stale: true, dirty: true }); f.tick(600, { dirty: false, stamp: 2 });
f.tick(D, { running: true });
ok(f.runs === 0 && f.st.due > f.t, 'a Run already going puts it off');

/* ── 5. opened, never changed; a new drawing never Run ── */
var g = page();
g.tick(0); g.tick(600, { stamp: 2 }); g.tick(600, { stamp: 3 }); g.tick(D * 3);
eq(g.runs, 0, 'a project only opened (saves, no change) is never re-run');
var h = page(); h.o.stale = true;
h.tick(0); h.tick(600, { dirty: true }); h.tick(600, { dirty: false, stamp: 2 }); h.tick(D * 3);
eq(h.runs, 0, 'a new drawing never Run is not re-run: the first Run is the person’s');
var i2 = page(); i2.o.stale = true; i2.o.stamp = 5;
i2.tick(0);
eq(i2.st.stamp, 5, 'the stamp the page loaded with is not a save of this tab’s work');

/* ── 6. what it says ── */
var cur = R.view({ total: 484443.4, fin: { perW: 3.917, irr: 12.06 }, stale: false, mayWrite: true });
ok(cur.show && cur.state === 'current' && cur.perW === 3.917 && cur.irr === 12.06, 'current: the total, the rail’s $/W and IRR');
var noRev = R.view({ total: 100, fin: { perW: 2.5, irr: null }, stale: false });
ok(noRev.irr === null && noRev.perW === 2.5, 'no revenue modelled: no IRR, as the rail');
var st1 = R.view({ total: 500000, fin: { perW: 3.9, irr: 12 }, stale: true, mayWrite: true, due: true });
ok(st1.state === 'stale' && st1.note === 'updating…' && st1.perW === null && st1.irr === null, 'stale: the last Run’s $/W and IRR are never shown beside a changed drawing');
eq(R.view({ total: 1, stale: true, mayWrite: true }).note, 'updates when saved', 'stale, nothing armed: it updates when saved');
eq(R.view({ total: 1, stale: true, mayWrite: false }).note, 'press Run', 'a plan that waits: press Run');
eq(R.view({ total: 1, running: true, stale: true }).state, 'running', 'running');
ok(R.view({ total: 2, pending: true }).pending && !R.view({ total: 0 }).show, 'a drawing being priced says so; nothing priced, nothing shown');

/* ── 7. the editor ── */
var ed = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
function cut(name) { var s = ed.indexOf('function ' + name + '('), e2 = ed.indexOf('\n}\n', s); assert.ok(s > 0 && e2 > s, name); return ed.slice(s, e2 + 3); }
function gate(win, caps) {
  var saves = 0, ctx = { window: win, S: { costRollup: { capex: 1 } }, OmegaCaps: caps, _setSaved: function () {}, saveProject: function () { saves++; } };
  win.OmegaCaps = caps; vm.createContext(ctx);
  vm.runInContext(cut('omegaRunMayWrite') + cut('omegaRunSave') + '\nthis.may = omegaRunMayWrite(); this.saved = omegaRunSave();', ctx);
  return { may: ctx.may, saved: ctx.saved, saves: saves };
}
var OPEN = { _currentUser: {}, _projectId: 'p1', _loadReady: true };
function caps(pk) { return { packageAccess: function () { return pk; } }; }
eq(gate(Object.assign({}, OPEN), caps({ readOnly: false })), { may: true, saved: true, saves: 1 }, 'an open project on a working plan: the priced Run is saved');
eq(gate(Object.assign({}, OPEN), caps({ readOnly: true })), { may: false, saved: false, saves: 0 }, 'read-only: waits');
eq(gate(Object.assign({}, OPEN), caps({ unverified: true })), { may: false, saved: false, saves: 0 }, 'unchecked: waits');
eq(gate(Object.assign({}, OPEN), caps(null)), { may: true, saved: true, saves: 1 }, 'a legacy plan (no package): as before');
eq(gate({ _currentUser: {}, _projectId: null, _loadReady: true }, caps(null)).may, false, 'no project open: waits');
eq(gate({ _currentUser: null, _projectId: 'p1', _loadReady: true }, caps(null)).may, false, 'not signed in: waits');
eq(gate({ _currentUser: {}, _projectId: 'p1', _loadReady: false }, caps(null)).may, false, 'a load not finished: waits');
ok(/if\(!omegaRunMayWrite\(\)\) return false;/.test(cut('omegaRunSave')), 'omegaRunSave asks the one gate');
ok(/omegaRunMayWrite/.test(fs.readFileSync(path.join(ROOT, 'omega-run-summary.js'), 'utf8')), 'and so does the re-run');
var rr = cut('omegaRenderResults');
ok(/window\._RR_FIN = \{ gross: gross, net: net, perW: perW, perKw: perKw \|\| null, payback: payback, irr: irr, npv: npv, fullCost: _fullCost, at: S\.lastRunAt \|\| null \};/.test(rr)
  && rr.indexOf('window._RR_FIN') > rr.indexOf("_omSet('rr-b-fin', fi);"), 'the rail publishes the figures it just printed, after printing them');
var src = fs.readFileSync(path.join(ROOT, 'omega-run-summary.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/irr\s*\(|Math\.pow|\/\s*\(?\s*totKw|DISC|payback\s*=/.test(src), 'the summary works nothing out: no IRR, no discounting, no $/W of its own');
ok(/<div id="rr-run" onclick="omegaRunDesign\(\)"[^\n]*<\/div>\n  <!--[^\n]*-->\n  <div id="rr-sum" role="status" aria-live="polite"><\/div>/.test(ed), 'the readout sits beside the Run button');
ok(ed.indexOf('id="sb-run"') < 0, 'and the status bar is as it was');
ok(ed.indexOf('<script src="/omega-run-summary.js"></script>') > 0, 'the page loads it');

console.log('trunsummary: ' + pass + ' passed');
