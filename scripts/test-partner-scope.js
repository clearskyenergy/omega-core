#!/usr/bin/env node
/* The JV boundary gate must refuse what it says it refuses.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE BUG THIS PREVENTS
   scripts/check-partner-scope.js read `%ae` and `%ce` into ONE list, so a
   committer it did not recognise scoped a pull request exactly as an
   unrecognised AUTHOR would. GitHub stamps `noreply@github.com` as the
   committer on every merge made through its web UI, so the first
   UI-merged ClearSky PR to land on main poisoned every later branch that
   merged main forward: an ordinary `git merge main` failed the gate on a
   name nobody typed. PR #53 died on exactly that.

   Splitting the two lists fixes it, and the split is the thing that needs
   guarding — because the easy version of the same fix is to drop
   noreply@github.com into CLEARSKY_GIT_EMAILS, which would also exempt it
   as an AUTHOR. That is a real hole: a commit authored as GitHub is a
   claim about who wrote the content, and this gate is the only machine
   that reads it.

   So these tests build throwaway repositories and run the real checker
   over them. No mocking of git — the parsing IS what broke.

   node scripts/test-partner-scope.js */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHECKER = path.join(__dirname, 'check-partner-scope.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '\n       got: ' + JSON.stringify(got) : ''));
}

/* ── a throwaway repository ───────────────────────────────────────────── */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scopegate-'));
  const git = (cmd, env) => cp.execSync('git ' + cmd, {
    cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null'
    }, env || {})
  });
  git('init -q -b main');
  git('config user.name ClearSky');
  git('config user.email tom@clearsky-usa.com');
  git('config commit.gpgsign false');

  /* commit(files, {author, committer}) — author and committer set
     independently, because that distinction is the whole subject here. */
  function commit(files, who, msg) {
    Object.keys(files).forEach(f => {
      const p = path.join(dir, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, files[f]);
    });
    git('add -A');
    git('commit -q --allow-empty -m "' + (msg || 'change') + '"', {
      GIT_AUTHOR_NAME: 'A', GIT_AUTHOR_EMAIL: (who && who.author) || 'tom@clearsky-usa.com',
      GIT_COMMITTER_NAME: 'C', GIT_COMMITTER_EMAIL: (who && who.committer) || 'tom@clearsky-usa.com'
    });
    return git('rev-parse HEAD').trim();
  }

  return { dir, git, commit, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/* Run the REAL checker inside that repository, the way CI runs it. */
function gate(r, author, base, head) {
  try {
    const out = cp.execSync('node ' + JSON.stringify(CHECKER), {
      cwd: r.dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { PR_AUTHOR: author, BASE_SHA: base, HEAD_SHA: head })
    });
    return { code: 0, out: out };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* ── 1 · the regression: main merged forward through GitHub's UI ───────── */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  r.commit({ 'api/thing.js': 'x\n' }, null, 'work');
  r.git('checkout -q main');
  /* A commit that landed on main through GitHub's web UI: GitHub is the
     COMMITTER, the human is still the author. */
  r.commit({ 'README.md': 'b\n' }, { committer: 'noreply@github.com' }, 'ui merge onto main');
  r.git('checkout -q feature');
  r.git('-c user.email=tom@clearsky-usa.com merge -q --no-ff -m "Merge main" main');
  const head = r.git('rev-parse HEAD').trim();

  const g = gate(r, 'clearskyenergy', base, head);
  ok('a ClearSky PR that merged main forward past a UI merge is unrestricted',
     g.code === 0 && /unrestricted/.test(g.out), g.out.trim().split('\n').slice(0, 4));

  /* And the premise the exemption rests on, asserted rather than assumed. */
  const authored = r.git('log --no-merges --format=%ae ' + base + '..' + head)
    .split('\n').filter(e => e.trim() === 'noreply@github.com');
  ok('  …and no commit in that range was AUTHORED as noreply@github.com',
     authored.length === 0, authored);
  r.rm();
}

/* ── 2 · the hole the easy fix would have opened ───────────────────────── */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  /* Content AUTHORED as GitHub — a claim about who wrote it, not about who
     applied it. This must still scope the PR. */
  const head = r.commit({ 'firestore.rules': 'allow read, write: if true;\n' },
                        { author: 'noreply@github.com' }, 'authored as github');

  const g = gate(r, 'clearskyenergy', base, head);
  ok('a commit AUTHORED as noreply@github.com still scopes the PR',
     g.code !== 0 && !/unrestricted/.test(g.out), g.out.trim().split('\n').slice(0, 6));
  ok('  …and the failure names it as an author, not a committer',
     /noreply@github\.com\s+\(author\)/.test(g.out), g.out.trim().split('\n').slice(0, 6));
  r.rm();
}

/* ── 3 · an unknown identity is still an unknown identity ──────────────── */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = r.commit({ 'firestore.rules': 'x\n' }, { author: 'someone@elsewhere.example' }, 'outside');

  const g = gate(r, 'clearskyenergy', base, head);
  ok('an unrecognised author still scopes the PR',
     g.code !== 0 && /someone@elsewhere\.example/.test(g.out), g.out.trim().split('\n').slice(0, 6));
  r.rm();
}

/* ── 4 · an unrecognised COMMITTER that is not GitHub still scopes it ──── */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = r.commit({ 'firestore.rules': 'x\n' }, { committer: 'someone@elsewhere.example' }, 'applied by a stranger');

  const g = gate(r, 'clearskyenergy', base, head);
  ok('the committer exemption is a named list, not "any committer"',
     g.code !== 0 && /\(committer\)/.test(g.out), g.out.trim().split('\n').slice(0, 6));
  r.rm();
}

/* ── 5 · a partner is still held to their folder ───────────────────────── */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = r.commit({ 'api/orders.js': 'x\n' }, null, 'partner reaches into api/');

  const g = gate(r, 'somepartnerhandle', base, head);
  ok('a non-ClearSky handle touching api/ fails, regardless of git identity',
     g.code !== 0 && /outside the scoped folder/.test(g.out), g.out.trim().split('\n').slice(0, 8));
  r.rm();
}

/* ── 6 · the exemption list is exactly one entry, and it is GitHub's ───── */
{
  const src = fs.readFileSync(CHECKER, 'utf8');
  const m = src.match(/var COMMITTER_ONLY_EMAILS = \[([^\]]*)\]/);
  ok('COMMITTER_ONLY_EMAILS exists', !!m);
  if (m) {
    const entries = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    ok('  …and holds only noreply@github.com — growing it is a boundary decision',
       entries.length === 1 && entries[0] === 'noreply@github.com', entries);
  }
  ok('noreply@github.com was NOT also added to CLEARSKY_GIT_EMAILS',
     !/CLEARSKY_GIT_EMAILS = \[[^\]]*noreply@github\.com/.test(src));
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
