/* The partner-scope gate, against the three ways it was bypassable.

   This check is the only machine-enforced part of "write access scoped to
   tenants/osa" — GitHub has no path-scoped write permission, so a partner
   holds write over the whole repository and this is what refuses the merge.
   A control whose bypasses are not pinned by tests is a control that quietly
   stops working, so each vector gets a case.

   Vector C (a pull request editing the gate that judges it) is fixed in
   .github/workflows/partner-scope.yml rather than here — pull_request_target
   plus a base-SHA checkout — so it is asserted against the workflow file. */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const cp = require('child_process');
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'check-partner-scope.js');

function sh(cwd, cmd) { return cp.execSync(cmd, { cwd: cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }

/* Runs the real checker against a throwaway repository and returns
   { code, out }. Never touches the repository the tests live in. */
function run(build, author, head) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partnerscope-'));
  try {
    sh(dir, 'git init -q -b main .');
    sh(dir, 'git config user.email t@example.com && git config user.name T');
    fs.mkdirSync(path.join(dir, 'tenants', 'osa'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.copyFileSync(CHECKER, path.join(dir, 'scripts', 'check-partner-scope.js'));
    fs.writeFileSync(path.join(dir, 'firestore.rules'), "rules_version='2';\n");
    fs.writeFileSync(path.join(dir, 'CODEOWNERS'), '* @clearskyenergy\n');
    fs.writeFileSync(path.join(dir, 'tenants', 'osa', 'index.html'), 'x\n');
    sh(dir, 'git add -A && git commit -qm base');
    build(dir);
    let code = 0, out = '';
    try {
      out = sh(dir, 'node scripts/check-partner-scope.js --author ' + author
                  + ' --base main --head ' + head);
    } catch (e) { code = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
    return { code: code, out: out };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ── Vector A: a rename out of scope must not read as an in-scope edit ─────
   git's default rename detection makes --name-only print ONLY the
   destination, so moving firestore.rules into tenants/osa/ once looked like a
   single in-scope file and PASSED — having deleted the root rules file.
   CODEOWNERS is the same trick against the review requirement itself. */
const a = run(function (d) {
  sh(d, 'git checkout -qb attack');
  sh(d, 'git mv firestore.rules tenants/osa/keep.rules');
  sh(d, 'git mv CODEOWNERS tenants/osa/owners.txt');
  sh(d, 'git commit -qm rename');
}, 'tjw2021', 'attack');
ok(a.code === 1, 'a partner renaming core files into tenants/osa is refused');
ok(/firestore\.rules/.test(a.out), 'and the vanished firestore.rules is named');
ok(/CODEOWNERS/.test(a.out), 'and so is CODEOWNERS');

/* ── Vector B: the opener is not the author of the commits ────────────────
   PR_AUTHOR is github.event.pull_request.user.login, the person who OPENED
   the pull request. Partners hold repo-wide write, so pushing onto a
   ClearSky-authored branch skipped the check entirely. */
const b = run(function (d) {
  sh(d, 'git checkout -qb bpush');
  sh(d, 'git config user.email tj@ogisolar.com');
  fs.appendFileSync(path.join(d, 'firestore.rules'), 'evil\n');
  sh(d, 'git commit -qam "partner commit"');
}, 'clearskyenergy', 'bpush');
ok(b.code === 1, 'an unrecognised identity in the range scopes a ClearSky-opened PR');
ok(/tj@ogisolar\.com/.test(b.out), 'and the unrecognised identity is named');

const c = run(function (d) {
  sh(d, 'git checkout -qb clean');
  sh(d, 'git config user.email tom@clearsky-usa.com');
  fs.appendFileSync(path.join(d, 'firestore.rules'), 'ok\n');
  sh(d, 'git commit -qam "clearsky commit"');
}, 'clearskyenergy', 'clean');
ok(c.code === 0, 'a genuinely ClearSky PR stays unrestricted (no false positive)');

/* ── Vector C: the gate must not be readable from the PR it judges ────────
   Asserted against the workflow, because this one is fixed by how the job is
   triggered rather than by the script. */
const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'partner-scope.yml'), 'utf8');
ok(/on:\s*\n\s*pull_request_target:/.test(wf),
   'the workflow triggers on pull_request_target, so its definition comes from main');
ok(/ref:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha\s*\}\}/.test(wf),
   'and checks out the BASE sha, so the PR cannot rewrite the checker it runs');
ok(!/^\s*on:\s*\n\s*pull_request:/m.test(wf),
   'and is not also on plain pull_request, which would reinstate the hole');

/* `--depth=0` is not "no limit", it is `fatal: depth 0 is not a positive
   number` — which kills the job before the checker runs, so the PR shows a
   red X that means "CI broke" rather than "this diff is out of scope". A
   gate that fails as an error is indistinguishable from a gate that failed
   you, and the first person to see it will assume the check is junk. */
const wfCode = wf.split('\n').filter(function (l) { return !/^\s*#/.test(l); }).join('\n');
ok(!/--depth=0/.test(wfCode), 'no --depth=0 in the workflow\u2019s executable lines');
ok(/fetch-depth:\s*0/.test(wf),
   'the checkout still takes full history, which is what the diff needs');

if (fails) { console.log('tpartnerscope: ' + fails + ' failed'); process.exit(1); }
console.log('tpartnerscope: all passed');
