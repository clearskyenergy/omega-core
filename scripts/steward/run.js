#!/usr/bin/env node
/* ===========================================================================
   scripts/steward/run.js - the daily pass. One brief, in this order.
   (c) 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE ORDER IS THE POINT

     1. integrity   did anything change that should not have?      (guard.js)
     2. tests       does the code still do what it claims?         (npm test)
     3. service     is the deployment up, and does it still refuse
                    a stranger?                                    (probe.js)
     4. data        are the layers current, is fiber connected?    (data-watch.js)
     5. interface   what is mechanically wrong for a user?         (ux-review.js)

   Integrity first because a repo that has been altered makes every later
   answer untrustworthy. Tests before the network because a red test explains
   a failing probe and not the other way round. UX last because it is the only
   section that is advice rather than a fact, and advice belongs after the
   facts.

   WHAT IT WILL NOT DO. It does not commit, push, deploy, or call any endpoint
   that writes. It produces a brief and an exit code. Acting on the brief is
   the agent's job (.claude/agents/omega-steward.md), and every action it takes
   arrives as a pull request a person merges. Nothing here has the authority to
   change production, and that is deliberate: the thing guarding the software
   should not also be the thing with the power to alter it unsupervised.

     node scripts/steward/run.js
     node scripts/steward/run.js --out brief.md
     node scripts/steward/run.js --json
     node scripts/steward/run.js --offline     skip anything that needs network

   Exit 0 clean, 1 if any section is blocking.
   =========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..', '..');
var OFFLINE = process.argv.indexOf('--offline') >= 0;

function runNode(args, timeoutMs) {
  try {
    var out = cp.execFileSync(process.execPath, args, {
      cwd: ROOT, encoding: 'utf8', timeout: timeoutMs || 120000,
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024
    });
    return { code: 0, out: out };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}
function runJson(args) {
  var r = runNode(args);
  try { return { code: r.code, data: JSON.parse(r.out) }; }
  catch (e) { return { code: r.code, data: null, raw: (r.out || '').slice(0, 2000) }; }
}

/* -- 1. integrity ---------------------------------------------------------- */
function integrity() {
  var r = runJson([path.join(__dirname, 'guard.js'), '--json']);
  var d = r.data || { fresh: [], known: [] };
  var sealed = (d.fresh || []).filter(function (f) { return f.check === 'sealed'; });
  return {
    blocking: (d.fresh || []).some(function (f) { return f.severity === 'error'; }),
    fresh: d.fresh || [],
    known: d.known || [],
    sealedChanges: sealed,
    raw: r.raw || null
  };
}

/* -- 2. tests -------------------------------------------------------------- */
/* The repo's own suite, run the way CI runs it. Shelling out to the package
   script rather than reimplementing it means this cannot drift from the gate. */
function tests() {
  var results = [];
  var suite = [
    ['scripts/test-caps.js'], ['scripts/test-bess-sizer.js'], ['scripts/test-site-intel.js'],
    ['scripts/test-network-proximity.js'], ['scripts/check-html-scripts.js'],
    ['scripts/check-rules.js', 'firestore.rules']
  ];
  suite.forEach(function (args) {
    if (!fs.existsSync(path.join(ROOT, args[0]))) return;
    var r = runNode(args.map(function (a, i) { return i === 0 ? path.join(ROOT, a) : a; }));
    results.push({ test: args.join(' '), passed: r.code === 0, tail: r.code === 0 ? null : r.out.slice(-800) });
  });
  return { blocking: results.some(function (t) { return !t.passed; }), results: results };
}

/* -- 3. service ------------------------------------------------------------ */
function service() {
  if (OFFLINE) return { skipped: 'offline' };
  var r = runJson([path.join(__dirname, 'probe.js'), '--json']);
  if (!r.data) return { error: r.raw || 'probe produced no JSON' };
  var auth = r.data.auth || [];
  return {
    base: r.data.base,
    blocking: auth.some(function (a) { return a.severity === 'error'; }),
    failing: auth.filter(function (a) { return a.severity === 'error'; }),
    watch: auth.filter(function (a) { return a.severity === 'warn'; }),
    refusing: auth.filter(function (a) { return a.severity === 'ok'; }).length,
    health: r.data.health || {}
  };
}

/* -- 4. data --------------------------------------------------------------- */
function data() {
  var args = [path.join(__dirname, 'data-watch.js'), '--json'];
  if (!OFFLINE) args.push('--sources');
  var r = runJson(args);
  if (!r.data) return { error: r.raw || 'data-watch produced no JSON' };
  return {
    layers: r.data.layers || [],
    stale: (r.data.layers || []).filter(function (l) { return l.stale || l.missing; }),
    fiber: r.data.fiber,
    sources: r.data.sources,
    sourcesDown: (r.data.sources || []).filter(function (s) { return !s.ok; })
  };
}

/* -- 5. interface ---------------------------------------------------------- */
function interfaceReview() {
  var r = runJson([path.join(__dirname, 'ux-review.js'), '--json']);
  if (!r.data) return { error: r.raw || 'ux-review produced no JSON' };
  var byCheck = {};
  (r.data.findings || []).forEach(function (f) { (byCheck[f.check] = byCheck[f.check] || []).push(f); });
  return { pages: r.data.pages, findings: r.data.findings || [], byCheck: byCheck };
}

/* -- the brief ------------------------------------------------------------- */

function brief(s) {
  var L = [];
  var day = new Date().toISOString().slice(0, 10);
  var blocking = [];
  if (s.integrity.blocking) blocking.push('integrity');
  if (s.tests.blocking) blocking.push('tests');
  if (s.service && s.service.blocking) blocking.push('service');

  L.push('# omega steward - ' + day);
  L.push('');
  L.push(blocking.length
    ? '**Blocking: ' + blocking.join(', ') + '.** Everything below is what the daily pass found.'
    : 'Nothing blocking. Everything below is advisory.');
  L.push('');

  /* 1 */
  L.push('## 1. Integrity');
  L.push('');
  if (s.integrity.sealedChanges.length) {
    L.push('**A sealed file changed.** These decide who can reach what.');
    L.push('');
    s.integrity.sealedChanges.forEach(function (f) { L.push('- `' + f.file + '` - ' + f.detail); });
    L.push('');
  }
  var newErrors = s.integrity.fresh.filter(function (f) { return f.severity === 'error' && f.check !== 'sealed'; });
  var newWarn = s.integrity.fresh.filter(function (f) { return f.severity !== 'error' && f.check !== 'sealed'; });
  if (!newErrors.length && !newWarn.length && !s.integrity.sealedChanges.length) {
    L.push('No new findings. ' + s.integrity.known.length + ' known item(s) carried in `scripts/steward/baseline.json`.');
  } else {
    if (newErrors.length) {
      L.push('New, blocking:');
      L.push('');
      newErrors.forEach(function (f) { L.push('- **' + f.check + '** `' + f.file + '` - ' + f.detail); });
      L.push('');
    }
    if (newWarn.length) {
      L.push('New, not blocking:');
      L.push('');
      newWarn.slice(0, 15).forEach(function (f) { L.push('- ' + f.check + ' `' + f.file + '` - ' + f.detail); });
      if (newWarn.length > 15) L.push('- ... and ' + (newWarn.length - 15) + ' more');
      L.push('');
    }
    L.push('Known and accepted: ' + s.integrity.known.length + ' item(s).');
  }
  L.push('');

  /* 2 */
  L.push('## 2. Tests');
  L.push('');
  s.tests.results.forEach(function (t) {
    L.push('- ' + (t.passed ? 'pass' : '**FAIL**') + ' `' + t.test + '`');
    if (!t.passed) { L.push(''); L.push('  ```'); (t.tail || '').split('\n').slice(-12).forEach(function (l) { L.push('  ' + l); }); L.push('  ```'); L.push(''); }
  });
  L.push('');

  /* 3 */
  L.push('## 3. Service');
  L.push('');
  if (s.service.skipped) L.push('Skipped (' + s.service.skipped + ').');
  else if (s.service.error) L.push('Could not probe: ' + s.service.error);
  else {
    L.push(s.service.refusing + ' endpoint(s) correctly refuse an anonymous caller at `' + s.service.base + '`.');
    L.push('');
    if (s.service.failing.length) {
      L.push('**Failing:**');
      L.push('');
      s.service.failing.forEach(function (a) { L.push('- `' + a.path + '` - ' + a.verdict + '. ' + a.note); });
      L.push('');
    }
    if (s.service.watch.length) {
      L.push('To look at:');
      L.push('');
      s.service.watch.slice(0, 10).forEach(function (a) { L.push('- `' + a.path + '` - ' + a.verdict + '. ' + a.note); });
      L.push('');
    }
    var h = s.service.health || {};
    if (h.skipped) L.push('Configuration not read: ' + h.skipped);
    else if (h.error) L.push('`/api/health` said: ' + h.error);
    else {
      L.push('Configuration: Firestore ' + (h.firestore || 'unknown') +
        (h.missing && h.missing.length ? '; missing ' + h.missing.join(', ') : '; nothing missing') +
        (h.malformed && h.malformed.length ? '; **malformed** ' + h.malformed.join(', ') : '') + '.');
    }
  }
  L.push('');

  /* 4 */
  L.push('## 4. Data and fiber');
  L.push('');
  if (s.data.error) L.push('Could not read the layers: ' + s.data.error);
  else {
    if (s.data.stale.length) {
      L.push('Past its budget:');
      L.push('');
      s.data.stale.forEach(function (l) {
        L.push('- `' + l.file + '` - ' + (l.missing ? 'MISSING' : l.ageDays + ' days old against a ' + l.budgetDays + '-day budget') +
          (l.caveats && l.caveats.length ? ' (' + l.caveats.join('; ') + ')' : ''));
      });
      L.push('');
    } else L.push('Every layer is inside its staleness budget.');
    L.push('');
    L.push('Fiber: ' + (s.data.fiber ? s.data.fiber.note : 'unknown'));
    if (s.data.sourcesDown && s.data.sourcesDown.length) {
      L.push('');
      L.push('**Upstream sources not answering:** ' + s.data.sourcesDown.map(function (x) { return x.name; }).join(', ') +
        ' - the siting tools degrade quietly when these are down.');
    }
  }
  L.push('');

  /* 5 */
  L.push('## 5. Interface');
  L.push('');
  if (s.ui.error) L.push('Could not review: ' + s.ui.error);
  else {
    L.push(s.ui.findings.length + ' finding(s) across ' + s.ui.pages + ' page(s), grouped by fix:');
    L.push('');
    Object.keys(s.ui.byCheck).sort(function (a, b) { return s.ui.byCheck[b][0].weight - s.ui.byCheck[a][0].weight; })
      .slice(0, 8).forEach(function (c) {
        var list = s.ui.byCheck[c];
        L.push('- **' + c + '** on ' + list.length + ' page(s) - ' + list[0].fix);
        L.push('  - ' + list.slice(0, 4).map(function (f) { return '`' + f.file + '`'; }).join(', ') +
          (list.length > 4 ? ' and ' + (list.length - 4) + ' more' : ''));
      });
  }
  L.push('');

  /* 6 - the honest section */
  L.push('## 6. What this run did not do');
  L.push('');
  L.push('- It did not write anything, anywhere. No commit, no deploy, no API call that changes state.');
  L.push('- It called only the endpoints marked steward-safe in `scripts/steward/api-registry.js`; every other endpoint refused here, before the network.');
  if (s.service && s.service.health && s.service.health.skipped) {
    L.push('- It had no credential, so it could not read `/api/health`. The anonymous checks above still ran and are the ones that matter most.');
  }
  L.push('- The UX section is mechanical. It finds what is measurably wrong, not what is badly designed.');
  L.push('');

  return L.join('\n');
}

function main() {
  var s = {};
  s.integrity = integrity();
  s.tests = tests();
  s.service = service();
  s.data = data();
  s.ui = interfaceReview();

  if (process.argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify(s, null, 2));
  } else {
    var text = brief(s);
    var oi = process.argv.indexOf('--out');
    if (oi >= 0 && process.argv[oi + 1]) {
      fs.writeFileSync(path.resolve(ROOT, process.argv[oi + 1]), text + '\n');
      console.log('brief written to ' + process.argv[oi + 1]);
    }
    console.log(text);
  }
  return (s.integrity.blocking || s.tests.blocking || (s.service && s.service.blocking)) ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { integrity: integrity, tests: tests, service: service, data: data, interfaceReview: interfaceReview, brief: brief };
