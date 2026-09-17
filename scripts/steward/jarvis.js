#!/usr/bin/env node
/* ===========================================================================
   scripts/steward/jarvis.js - the steward reports to Jarvis, not beside him
   (c) 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS FILE EXISTS

   The pass was filing its brief as a GitHub issue, which is the one place
   nobody looks while they are working. Jarvis is where the work is tracked -
   the backlog, "To do - ranked", "Needs you" - so a finding that does not
   reach Jarvis is a finding that competes with Jarvis for attention and loses.

   So this is the bridge, and it is deliberately thin:

     1. run the pass once, in-process (run.pass()), so the brief Jarvis holds
        is the same object the terminal printed - not a second run with its own
        timings and its own answers.
     2. file the brief at POST /api/steward, one document per day, which is what
        Mission Control's Integrity panel and Jarvis in the editor both read.
     3. put each BLOCKING finding on Jarvis's backlog through the twin's /task
        door - the same call the editor's "File with Jarvis" button makes, so a
        steward finding and a person's note land in the same queue and get
        ranked against each other.

   WHY ONLY THE BLOCKING ONES, AND ONLY ONCE

   A backlog that receives 95 known findings every morning is a backlog someone
   mutes in a week, and then the one that mattered arrives muted. So:

     - only findings the pass calls blocking are filed. Advisory items live in
       the brief, where they can be read when there is time for them.
     - before filing, yesterday's brief is read back from /api/steward and
       anything already on it is skipped. A finding reaches the backlog on the
       day it appears and not again. If it is still there a week later that is
       the backlog item's job to say, not this script's.
     - a hard cap either way, so a bad day cannot become fifty tasks.

   DRY RUN IS THE DEFAULT. Nothing is written without --file. The steward's
   whole posture is propose-and-let-a-person-apply (the L2 rung Jarvis already
   runs on), and a publisher that writes the moment it is invoked would be the
   one part of it that does not.

     node scripts/steward/jarvis.js                 what it would file
     node scripts/steward/jarvis.js --file          actually file it
     node scripts/steward/jarvis.js --out brief.md  also write the markdown
     node scripts/steward/jarvis.js --file --offline   skip the network checks

   --out exists so the daily workflow runs the pass ONCE. Calling run.js for the
   markdown and then jarvis.js to file it ran everything twice, including a
   second anonymous probe of every endpoint in production.
   =========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var run = require('./run');
var client = require('./client');

var MAX_TASKS = 8;

/* -- the compact summary the panel and Jarvis read ------------------------- */

/* A finding's identity across days. Same shape as guard.js's key so a repo
   finding filed yesterday is recognised today even if its wording changed. */
function keyOf(f) {
  return (f.check || f.section || '?') + ':' + (f.file || f.path || f.test || '?');
}

function findingsOf(s) {
  var out = [];

  (s.integrity.fresh || []).forEach(function (f) {
    if (f.severity !== 'error') return;
    out.push({
      check: f.check === 'sealed' ? 'sealed file' : f.check,
      file: f.file, detail: f.detail, severity: 'error'
    });
  });

  (s.tests.results || []).forEach(function (t) {
    if (t.passed) return;
    out.push({ check: 'test', file: t.test, detail: 'failing', severity: 'error' });
  });

  if (s.service && s.service.failing) {
    s.service.failing.forEach(function (a) {
      out.push({ check: 'endpoint', file: a.path, detail: a.verdict + '. ' + (a.note || ''), severity: 'error' });
    });
  }

  /* Stale data and a downed upstream are not blocking - nothing is broken,
     something is old - but they belong in the summary so the panel can show
     them without the brief. */
  (s.data.stale || []).forEach(function (l) {
    out.push({
      check: 'data', file: l.file,
      detail: l.missing ? 'missing' : (l.ageDays + ' days old against a ' + l.budgetDays + '-day budget'),
      severity: 'warn'
    });
  });
  (s.data.sourcesDown || []).forEach(function (x) {
    out.push({ check: 'source', file: x.name, detail: 'not answering: ' + (x.error || ('HTTP ' + x.status)), severity: 'warn' });
  });

  return out;
}

function summarise(s) {
  var blockingSections = [];
  if (s.integrity.blocking) blockingSections.push('integrity');
  if (s.tests.blocking) blockingSections.push('tests');
  if (s.service && s.service.blocking) blockingSections.push('service');

  var findings = findingsOf(s);
  var errors = findings.filter(function (f) { return f.severity === 'error'; });

  var headline = blockingSections.length
    ? errors.length + ' blocking finding' + (errors.length === 1 ? '' : 's') + ' in ' + blockingSections.join(', ')
    : (s.data.stale || []).length
      ? 'Nothing blocking; ' + s.data.stale.length + ' data layer(s) past budget'
      : 'Nothing blocking';

  return {
    blocking: blockingSections.length > 0,
    blockingSections: blockingSections,
    headline: headline,
    base: (s.service && s.service.base) || null,
    counts: {
      guardNew: (s.integrity.fresh || []).length,
      guardKnown: (s.integrity.known || []).length,
      testsFailed: (s.tests.results || []).filter(function (t) { return !t.passed; }).length,
      testsRun: (s.tests.results || []).length,
      endpointsRefusing: (s.service && s.service.refusing) || 0,
      endpointsFailing: (s.service && s.service.failing ? s.service.failing.length : 0),
      layersStale: (s.data.stale || []).length,
      uiFindings: (s.ui.findings || []).length
    },
    findings: findings
  };
}

/* -- the backlog ----------------------------------------------------------- */

/* One line a person can act on without opening the brief. The check comes
   first so the backlog sorts into kinds on its own. */
function taskTitle(f) {
  return 'steward/' + f.check + ': ' + f.file + ' - ' + String(f.detail || '').replace(/\s+/g, ' ').slice(0, 180);
}

function alreadyFiled(day) {
  /* Yesterday, not the latest: the latest may be today's own earlier run. */
  var d = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  return client.lastBrief(d).then(function (j) {
    var seen = {};
    if (j && j.found && j.summary && j.summary.findings) {
      j.summary.findings.forEach(function (f) { seen[keyOf(f)] = true; });
    }
    return seen;
  })['catch'](function (e) {
    /* Cannot read yesterday: file nothing rather than risk filing everything
       twice. A missed day of tasks is recoverable; a duplicated backlog is
       the thing that gets the whole channel muted. */
    return { __unreadable: String(e.message || e) };
  });
}

function main() {
  var doFile = process.argv.indexOf('--file') >= 0;
  var s = run.pass();
  var sum = summarise(s);
  var md = run.brief(s);
  var day = new Date().toISOString().slice(0, 10);

  var oi = process.argv.indexOf('--out');
  if (oi >= 0 && process.argv[oi + 1]) {
    var dest = path.resolve(process.cwd(), process.argv[oi + 1]);
    fs.writeFileSync(dest, md + '\n');
    console.log('brief written to ' + process.argv[oi + 1]);
  }

  var errors = sum.findings.filter(function (f) { return f.severity === 'error'; });

  console.log('omega steward - reporting to Jarvis' + (doFile ? '' : ' (DRY RUN - nothing will be written)'));
  console.log('');
  console.log('  ' + sum.headline);
  console.log('  brief: ' + md.length + ' characters, ' + sum.findings.length + ' summarised finding(s)');
  console.log('');

  if (!doFile) {
    console.log('  would file at POST /api/steward as omega_steward/' + day);
    console.log('  would put ' + Math.min(errors.length, MAX_TASKS) + ' item(s) on Jarvis\'s backlog:');
    if (!errors.length) console.log('    (none - nothing blocking today)');
    errors.slice(0, MAX_TASKS).forEach(function (f) { console.log('    - ' + taskTitle(f)); });
    console.log('');
    console.log('  pass --file to do it. Needs a steward credential; see scripts/steward/README.md.');
    return Promise.resolve(sum.blocking ? 1 : 0);
  }

  if (!client.haveCredentials()) {
    console.error('  no steward credential, so nothing can be filed. See scripts/steward/README.md.');
    return Promise.resolve(1);
  }

  var payload = {
    day: day, brief: md, blocking: sum.blocking, blockingSections: sum.blockingSections,
    headline: sum.headline, counts: sum.counts, base: sum.base, findings: sum.findings
  };

  return client.publishBrief(payload).then(function (r) {
    console.log('  filed the brief: omega_steward/' + r.day + ' (' + r.findings + ' finding(s))');
    return alreadyFiled(day);
  }).then(function (seen) {
    if (seen.__unreadable) {
      console.log('  backlog: SKIPPED - could not read yesterday\'s brief (' + seen.__unreadable + ').');
      console.log('           Filing nothing rather than risk filing everything twice.');
      return;
    }
    var fresh = errors.filter(function (f) { return !seen[keyOf(f)]; });
    var repeats = errors.length - fresh.length;
    if (!fresh.length) {
      console.log('  backlog: nothing new' + (repeats ? ' (' + repeats + ' already filed yesterday)' : ''));
      return;
    }
    var toFile = fresh.slice(0, MAX_TASKS);
    return toFile.reduce(function (chain, f) {
      return chain.then(function () {
        return client.fileWithJarvis(taskTitle(f), 'queue').then(function () {
          console.log('  backlog + ' + taskTitle(f).slice(0, 110));
        })['catch'](function (e) {
          console.error('  backlog ! could not file ' + keyOf(f) + ': ' + e.message);
        });
      });
    }, Promise.resolve()).then(function () {
      if (fresh.length > MAX_TASKS) console.log('  backlog: ' + (fresh.length - MAX_TASKS) + ' more in the brief, not filed (cap ' + MAX_TASKS + ')');
      if (repeats) console.log('  backlog: ' + repeats + ' finding(s) skipped, already filed yesterday');
    });
  }).then(function () {
    return sum.blocking ? 1 : 0;
  })['catch'](function (e) {
    console.error('  could not report to Jarvis: ' + e.message);
    return 1;
  });
}

if (require.main === module) {
  Promise.resolve(main()).then(function (c) { process.exit(c); });
}
module.exports = { summarise: summarise, findingsOf: findingsOf, taskTitle: taskTitle, keyOf: keyOf };
