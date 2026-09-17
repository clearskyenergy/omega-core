#!/usr/bin/env node
/* scripts/check-vercelignore.js — .vercelignore must not delete the functions
   vercel.json promises.  node scripts/check-vercelignore.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS EXISTS. A commit added four filenames to .vercelignore to stop the
   repo serving serverless SOURCE as static files — right intent. But
   .vercelignore takes .gitignore semantics, where a pattern carrying no slash
   matches at EVERY depth, so `grid-atlas.js` also matched api/grid-atlas.js
   and `render.js` took api/render.js with it. vercel.json names both under
   `functions`, so the preview build failed:

       The pattern "api/grid-atlas.js" defined in `functions`
       doesn't match any Serverless Functions.

   The failure was the lucky outcome. Drop those two lines from vercel.json
   and the same mistake deploys GREEN, with the Grid Atlas and render
   endpoints simply absent — a 404 on a scoring endpoint that every screening
   run calls, discovered by a customer.

   The check shells out to `git check-ignore` rather than reimplementing the
   matcher. Gitignore semantics have corners (anchoring, negation, `**`,
   trailing slashes) and a hand-rolled approximation that disagrees with the
   real one on a corner is worse than no check — it would have passed this
   exact bug. git already implements it exactly, and Vercel follows it. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IGNORE = path.join(ROOT, '.vercelignore');

function ignored(paths) {
  /* --no-index so files that are not tracked still get judged; core.excludesFile
     points git at .vercelignore instead of .gitignore. Exit code 1 means
     "nothing matched", which is not an error here. */
  if (!paths.length) return new Set();
  try {
    const out = execFileSync('git',
      ['-c', 'core.excludesFile=' + IGNORE, 'check-ignore', '--no-index', '--stdin'],
      { cwd: ROOT, input: paths.join('\n'), encoding: 'utf8' });
    return new Set(out.split('\n').map(s => s.trim()).filter(Boolean));
  } catch (e) {
    if (e.status === 1) return new Set();
    throw e;
  }
}

function walk(dir, out) {
  out = out || [];
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git') continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (n.endsWith('.js')) out.push(path.relative(ROOT, p));
  }
  return out;
}

if (!fs.existsSync(IGNORE)) {
  console.log('✓ no .vercelignore — nothing to check.');
  process.exit(0);
}

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const declared = Object.keys(vercel.functions || {});
/* Literal paths only. A glob like api/**\/*.js is checked by the sweep below,
   where every function it would match is tested individually. */
const literals = declared.filter(p => !/[*?[\]]/.test(p));

const apiFiles = fs.existsSync(path.join(ROOT, 'api')) ? walk(path.join(ROOT, 'api')) : [];
const suspects = Array.from(new Set(literals.concat(apiFiles)));
const bad = ignored(suspects);

const problems = [];
for (const p of literals) {
  if (!fs.existsSync(path.join(ROOT, p))) {
    problems.push(p + '  — named in vercel.json `functions`, but no such file');
  } else if (bad.has(p)) {
    problems.push(p + '  — named in vercel.json `functions`, but .vercelignore excludes it (the build will fail)');
  }
}
for (const p of apiFiles) {
  if (bad.has(p) && !literals.includes(p)) {
    problems.push(p + '  — a serverless function excluded by .vercelignore (it would silently 404)');
  }
}

if (problems.length) {
  console.error('✗ .vercelignore removes functions the deployment needs:\n');
  problems.forEach(p => console.error('   ' + p));
  console.error('\n  A pattern with no slash matches at every depth. Anchor it: /name.js');
  process.exit(1);
}
console.log('✓ .vercelignore — all ' + apiFiles.length + ' serverless functions survive it, '
            + 'including the ' + literals.length + ' named in vercel.json.');
