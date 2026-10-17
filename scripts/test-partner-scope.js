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

   2026-10-17, the same shape of hole with the opposite bad fix. Cursor's
   cloud agents commit as cursoragent@cursor.com, which is not a ClearSky
   address, so a ClearSky-opened pull request (#334, #336) was scoped to
   tenants/osa/. Adding that address to CLEARSKY_GIT_EMAILS would also
   exempt a partner's agent. The address is neutral: the opener decides,
   and a Co-authored-by this file does not know still scopes the range.

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
    /* One -m per line, so a Co-authored-by trailer is its own paragraph.
       git joins multiple -m with a blank line, which is where a trailer
       has to sit. */
    var cmd = 'commit -q --allow-empty';
    String(msg || 'change').split('\n').forEach(line => {
      cmd += ' -m ' + JSON.stringify(line);
    });
    git(cmd, {
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

/* The array literal, comments and all, up to its closing bracket. */
function arrayEntries(src, name) {
  const m = src.match(new RegExp('var ' + name + ' = \\[([\\s\\S]*?)\\]'));
  if (!m) return null;
  return m[1].split(',').map(s => s.replace(/\/\*[\s\S]*?\*\//g, '').trim()
    .replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

/* A cloud-agent commit, author and committer both the bot. `trailer` is
   the text after `Co-authored-by: `, or omitted. */
function agentCommit(r, files, trailer, msg) {
  var body = msg || 'agent change';
  if (trailer) body += '\nCo-authored-by: ' + trailer;
  return r.commit(files, {
    author: 'cursoragent@cursor.com',
    committer: 'cursoragent@cursor.com'
  }, body);
}

const OUTSIDE = { 'api/orders.js': 'x\n' };
const CS_TRAILER = 'clearskyenergy <clearskyenergy@users.noreply.github.com>';
const PARTNER_TRAILER = 'tjw2021 <tjw2021@users.noreply.github.com>';

/* ── 7a · ClearSky opened it; the bot wrote it; the file is outside ─────
   This is #334 and #336. The bot address must not have to be ClearSky
   for the pull request to be unrestricted. */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = agentCommit(r, OUTSIDE, null, 'agent, no trailer');
  const g = gate(r, 'clearskyenergy', base, head);
  ok('(a) a ClearSky PR of cursoragent commits outside tenants/ is unrestricted',
     g.code === 0 && /unrestricted/.test(g.out), g.out.trim().split('\n').slice(0, 6));
  r.rm();
}

{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = agentCommit(r, OUTSIDE, CS_TRAILER, 'agent, ClearSky co-author');
  const g = gate(r, 'clearskyenergy', base, head);
  ok('(a) the same, with the Co-authored-by Cursor actually writes',
     g.code === 0 && /unrestricted/.test(g.out), g.out.trim().split('\n').slice(0, 6));
  r.rm();
}

{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = agentCommit(r, OUTSIDE,
    'clearskyenergy <206951365+clearskyenergy@users.noreply.github.com>',
    'agent, id-form noreply');
  const g = gate(r, 'clearskyenergy', base, head);
  ok('(a) the id+login GitHub noreply of a ClearSky handle is that handle',
     g.code === 0 && /unrestricted/.test(g.out), g.out.trim().split('\n').slice(0, 6));
  r.rm();
}

{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  /* The GitHub App's noreply, committed by GitHub's UI identity. The id
     is not special — a different id of the same login is the same bot. */
  const head = r.commit(OUTSIDE, {
    author: '999+cursor[bot]@users.noreply.github.com',
    committer: 'noreply@github.com'
  }, 'app squash');
  const g = gate(r, 'clearskyenergy', base, head);
  ok('(a) cursor[bot] noreply is the same kind of neutral identity',
     g.code === 0 && /unrestricted/.test(g.out), g.out.trim().split('\n').slice(0, 6));
  r.rm();
}

/* ── 7b · the partner opened it. The bot does not widen their folder. ── */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = agentCommit(r, OUTSIDE, null, 'partner agent, no trailer');
  const g = gate(r, 'tjw2021', base, head);
  ok('(b) a partner PR of cursoragent commits outside their folder fails',
     g.code !== 0 && /outside the scoped folder/.test(g.out) && !/unrestricted/.test(g.out),
     g.out.trim().split('\n').slice(0, 10));
  r.rm();
}

{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  /* The tempting shape: bot author, ClearSky co-author trailer, partner
     opener. The trailer must not outrank the opener. */
  const head = agentCommit(r, OUTSIDE, CS_TRAILER, 'forged clearsky trailer');
  const g = gate(r, 'tjw2021', base, head);
  ok('(b) a partner opener stays scoped even with a ClearSky co-author trailer',
     g.code !== 0 && /outside the scoped folder/.test(g.out) && !/unrestricted/.test(g.out),
     g.out.trim().split('\n').slice(0, 10));
  r.rm();
}

{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = agentCommit(r, { 'tenants/osa/note.txt': 'ok\n' }, null, 'in folder');
  const g = gate(r, 'tjw2021', base, head);
  ok('(b) a partner PR of cursoragent commits inside tenants/osa/ passes',
     g.code === 0 && /PASS/.test(g.out), g.out.trim().split('\n').slice(0, 8));
  r.rm();
}

/* ── 7c · an unknown person is still unknown, bot commit beside them ──── */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  agentCommit(r, { 'api/one.js': 'a\n' }, CS_TRAILER, 'bot first');
  const head = r.commit({ 'api/two.js': 'b\n' }, { author: 'someone@elsewhere.example' }, 'stranger');
  const g = gate(r, 'clearskyenergy', base, head);
  ok('(c) an unknown identity on a ClearSky PR still scopes it',
     g.code !== 0 && /someone@elsewhere\.example/.test(g.out) && !/unrestricted/.test(g.out),
     g.out.trim().split('\n').slice(0, 8));
  ok('  …and the bot commit did not launder that identity',
     /\(author\)/.test(g.out), g.out.trim().split('\n').slice(0, 8));
  r.rm();
}

/* ── 7d · the hole whitelisting the bot would open ───────────────────────
   ClearSky opened the pull request. The commit is the bot's, which is
   what a partner's agent also produces, and the trailer names the partner.
   Treating cursoragent@cursor.com as a ClearSky email and not reading the
   trailer would call this unrestricted. */
{
  const r = repo();
  const base = r.commit({ 'README.md': 'a\n' }, null, 'base');
  r.git('checkout -q -b feature');
  const head = agentCommit(r, OUTSIDE, PARTNER_TRAILER, 'partner agent on a clearsky branch');
  const g = gate(r, 'clearskyenergy', base, head);
  ok('(d) a partner co-author on a bot commit scopes a ClearSky-opened PR',
     g.code !== 0 && !/unrestricted/.test(g.out)
       && /tjw2021@users\.noreply\.github\.com\s+\(co-author\)/.test(g.out),
     g.out.trim().split('\n').slice(0, 10));
  r.rm();
}

/* ── 8 · the bot is neutral on purpose, not a ClearSky email ──────────── */
{
  const src = fs.readFileSync(CHECKER, 'utf8');
  const clearsky = arrayEntries(src, 'CLEARSKY_GIT_EMAILS');
  const committerOnly = arrayEntries(src, 'COMMITTER_ONLY_EMAILS');
  const neutral = arrayEntries(src, 'NEUTRAL_BOT_EMAILS');
  ok('NEUTRAL_BOT_EMAILS lists cursoragent@cursor.com',
     neutral && neutral.indexOf('cursoragent@cursor.com') >= 0, neutral);
  ok('cursoragent@cursor.com was NOT added to CLEARSKY_GIT_EMAILS',
     clearsky && clearsky.indexOf('cursoragent@cursor.com') < 0, clearsky);
  ok('and NOT to COMMITTER_ONLY_EMAILS, which would exempt it as a committer only',
     committerOnly && committerOnly.indexOf('cursoragent@cursor.com') < 0, committerOnly);
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
