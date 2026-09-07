#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/check-html-scripts.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Parses every inline <script> in every HTML page and fails if one does not.

   WHY. A single-file app has no build step, which is the whole point — and it
   means nothing ever checks the JavaScript before a browser does. On 2026-09-06
   a patch to index.html deleted 1,384 lines including the auth handler. That
   left a function unclosed, the boot script died with "Unexpected end of
   input", and the deployment served a page that pulsed its loading splash
   forever. Nobody could sign in.

   The splash is what made it expensive: it hides the shell until auth answers,
   so a dead page looked like a slow one. The error was in the console the whole
   time and this check takes under a second.

   It also flags block comments that are never closed — the same bug that
   stopped firestore.rules compiling, where a path written inside a comment
   ended it early — and script tags pointing at root paths that do not exist,
   which is how omega-fleet.js came to 404 on every page load.

     node scripts/check-html-scripts.js            # every page
     node scripts/check-html-scripts.js index.html # one page

   Exit 0 clean, 1 on any finding. Wire it into CI or a pre-push hook.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';


/* ── ES MODULES NEED A FLAG, SO ASK FOR IT AND START AGAIN ──────────────────
   `<script type="module">` can only be compiled through vm.SourceTextModule,
   which Node exposes only under --experimental-vm-modules. Rather than making
   every caller remember that, the checker re-runs itself once with the flag.
   Guarded by an env var so a refused re-exec cannot loop. */
if (typeof require('vm').SourceTextModule !== 'function' && !process.env.OMEGA_CHECK_REEXEC) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath,
    ['--experimental-vm-modules', '--no-warnings', __filename].concat(process.argv.slice(2)),
    { stdio: 'inherit', env: Object.assign({}, process.env, { OMEGA_CHECK_REEXEC: '1' }) });
  process.exit(r.status == null ? 1 : r.status);
}
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', 'docs']);

function htmlFiles(dir, acc) {
  acc = acc || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, acc);
    else if (/\.html?$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

/* A <script> with a type that is not JavaScript holds data, not code —
   templates, JSON-LD and import maps must not be parsed as a program. */
function isJsType(attrs) {
  const m = /type\s*=\s*["']([^"']+)["']/i.exec(attrs);
  if (!m) return true;
  const t = m[1].toLowerCase().trim();
  return t === 'text/javascript' || t === 'application/javascript' ||
         t === 'module' || t === '';
}
function isModule(attrs) { return /type\s*=\s*["']module["']/i.test(attrs); }

const findings = [];

function checkFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const re = /<script([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m, idx = 0;

  while ((m = re.exec(src)) !== null) {
    const attrs = m[1], body = m[2];
    const line = src.slice(0, m.index).split('\n').length;

    /* src= scripts: the file has to exist, or the browser gets a 404 that
       Vercel serves as text/plain and refuses to execute. */
    const srcAttr = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (srcAttr) {
      const u = srcAttr[1];
      if (/^(https?:)?\/\//i.test(u) || u.startsWith('data:')) continue;
      const target = u.startsWith('/')
        ? path.join(ROOT, u.replace(/^\//, '').split(/[?#]/)[0])
        : path.join(path.dirname(file), u.split(/[?#]/)[0]);
      if (!fs.existsSync(target)) {
        findings.push({ file: rel, line, kind: '404',
          msg: 'script src does not exist: ' + u });
      }
      continue;
    }

    idx++;
    if (!isJsType(attrs) || !body.trim()) continue;

    let parseErr = null;
    try {
      /* Compiling is the authoritative answer — it is the same parser the
         browser uses. Nothing is executed. */
      if (isModule(attrs)) {
        /* vm.SourceTextModule only exists under --experimental-vm-modules.
           Without it this threw "not a constructor" and reported every ES
           module as unparseable — a false failure on working code, which is
           worse than no check at all because it trains you to ignore the
           checker. The process re-execs itself with the flag (see the top of
           this file), so reaching here without it means the re-exec was
           refused and the honest answer is "not checked". */
        if (typeof vm.SourceTextModule !== 'function') {
          findings.push({ file: rel, line, kind: 'skip',
            msg: 'inline module #' + idx + ' not checked (node lacks --experimental-vm-modules)' });
          continue;
        }
        new vm.SourceTextModule(body, { identifier: rel });
      }
      else new vm.Script(body, { filename: rel });
    } catch (err) {
      parseErr = String(err.message).split('\n')[0];
    }

    if (parseErr) {
      /* Two hints, offered only once the script is already known broken.
         Both would misfire on their own — a naive comment count sees the
         "/*" inside a string, and a stray closing tag is legitimate when
         escaped — so neither is a finding by itself. */
      const hints = [];

      let d = 0, i = 0;
      while (i < body.length - 1) {
        if (body[i] === '/' && body[i + 1] === '*') { d++; i += 2; continue; }
        if (body[i] === '*' && body[i + 1] === '/') { d--; i += 2; continue; }
        i++;
      }
      if (d > 0) hints.push('a block comment may never be closed');

      /* THE ONE THAT COST A DAY. An unescaped closing script tag inside a JS
         string ends the script THERE — the HTML tokenizer does not know or
         care that it is inside a template literal. Everything after it stops
         running and the remaining source renders as visible page text.
         Write it as <\\/script> in strings. */
      const after = src.slice(m.index + m[0].length);
      if (/<\/script/i.test(after) && /`|'|"/.test(body.slice(-400))) {
        hints.push('this block may have been cut short by an unescaped ' +
                   'closing script tag inside a string — write it as <\\/script>');
      }

      findings.push({ file: rel, line, kind: 'syntax', msg: parseErr,
                      block: idx, hints: hints });
    }
  }
}

const args = process.argv.slice(2);
const files = args.length ? args.map(a => path.resolve(a)) : htmlFiles(ROOT);
files.forEach(checkFile);

if (!findings.length) {
  console.log('✓ ' + files.length + ' HTML file' + (files.length === 1 ? '' : 's') +
              ' — every inline script parses and every script src resolves.');
  process.exit(0);
}

console.error('\n' + findings.length + ' problem' + (findings.length === 1 ? '' : 's') + ':\n');
for (const f of findings) {
  const where = f.file + ':' + f.line;
  if (f.kind === 'syntax') {
    console.error('  ✗ ' + where + '  inline script #' + f.block + ' does not parse');
    console.error('      ' + f.msg);
    console.error('      This script and everything it defines will not run.');
    (f.hints || []).forEach(h => console.error('      hint: ' + h));
  } else {
    console.error('  ✗ ' + where + '  ' + f.msg);
  }
}
console.error('');
process.exit(1);
