#!/usr/bin/env node
/* ===========================================================================
   scripts/steward/guard.js - the invariants of omega-core, checked mechanically
   (c) 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS EXISTS

   CLAUDE.md is a list of rules a person has to remember: no ES2015 in the ES5
   files, no server logic served to browsers, no copy of a core file inside a
   tenant folder, one org-alias map mirrored by hand across eight places, every
   source file carrying the copyright header. None of that is enforced by
   anything. A repo with no build step has no compiler to catch it either, so
   the first time a rule breaks is in production, on a kiosk browser, in front
   of a customer.

   This is the check. It is the "protect it from being altered" half of the
   steward: not prevention - a repo cannot prevent its own editing - but
   DETECTION, wired into CI so a breach fails the pull request that introduced
   it and a person has to look.

   THE RATCHET

   The repo has existing debt. Seventeen omega-*.js files have no copyright
   header today; several tool pages fold the org alias their own way. A check
   that fails on all of it is a check somebody turns off in a week.

   So every finding carries a stable key, and baseline.json lists the keys that
   are already known. Guard fails ONLY on a key that is not in the baseline -
   new breakage, introduced by the change under review. Existing debt stays
   visible in the report (and in --json) without blocking anyone. Paying it
   down means deleting lines from baseline.json, which is a normal PR.

     node scripts/steward/guard.js              report + exit 1 on new findings
     node scripts/steward/guard.js --json       machine-readable, for run.js
     node scripts/steward/guard.js --all        show accepted debt too
     node scripts/steward/guard.js --accept     fold today's findings into the
                                                baseline (a reviewed commit,
                                                never something CI runs)

   SEALED FILES are the exception to the ratchet. firestore.rules is the
   security boundary; api/_lib/admin.js decides who every endpoint thinks you
   are; .vercelignore decides what the web serves. A change to one of those is
   not debt, it is the thing most worth a second pair of eyes - so guard prints
   it loudly and fails until the new hash is accepted in the same PR. CODEOWNERS
   then puts a human on that PR. The hash does not stop the edit; it stops the
   edit from being quiet.

   No dependencies, no install step, ES5. It runs anywhere node does.
   =========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.resolve(__dirname, '..', '..');
var BASELINE = path.join(__dirname, 'baseline.json');

/* -- what the rules actually are ------------------------------------------ */

/* Files allowed to use ES2015. CLAUDE.md names these explicitly: the core
   pages and omega-sso.js already shipped that way. Everything else is ES5
   because a field rep's embedded browser has to run it without a transpiler. */
var ES2015_ALLOWED = ['omega-sso.js', 'projects.html', 'marketplace.html'];

/* api/ runs on Node 18 on Vercel, so ES2015 is fine there. The ES5 rule is
   about what a BROWSER downloads. These are the browser-downloaded scripts. */
var ES5_GLOBS = ['omega-*.js'];

/* Changing one of these changes who can reach what. Not debt - a decision. */
var SEALED = [
  'firestore.rules',
  'storage.rules',
  'api/_lib/admin.js',
  'api/_lib/verify-token.js',
  'omega-sso.js',
  'omega-tenant.js',
  'vercel.json',
  '.vercelignore',
  'CODEOWNERS'
];

/* A tenant folder carries extensions, not copies. Core lives at the root. */
var TENANT_FORBIDDEN = /^(omega-.*\.js|projects\.html|marketplace\.html|account-settings\.html|editor\.html|firestore\.rules|storage\.rules)$/;

/* Literal credentials. Shapes taken from api/health.js so the two agree on
   what a real key looks like. A regex that DESCRIBES a key does not match -
   health.js is full of those on purpose, and the character after the prefix
   there is always '[', which is in none of these character classes. */
var SECRET_PATTERNS = [
  { name: 'anthropic key',         re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'stripe secret key',     re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'stripe webhook secret', re: /\bwhsec_[A-Za-z0-9]{16,}/ },
  { name: 'resend key',            re: /\bre_[A-Za-z0-9_]{16,}/ },
  { name: 'google api key',        re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: 'private key block',     re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ }
];

var SKIP_DIRS = { '.git': 1, 'node_modules': 1, '.vercel': 1, 'coverage': 1 };

/* -- tiny filesystem helpers ---------------------------------------------- */

function walk(dir, out) {
  out = out || [];
  var entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i], full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS[e.name]) walk(full, out); }
    else if (e.isFile()) out.push(path.relative(ROOT, full));
  }
  return out;
}
function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; }
}
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16); }
function globToRe(glob) {
  return new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
}
function lineOf(text, index) { return text.slice(0, index).split('\n').length; }

/* -- comment and string stripping -------------------------------------------
   Every syntax check below asks "does this FILE use X", and every one of these
   files is more prose than code - the headers alone discuss const, arrow
   functions and template literals at length. Matching raw text would report
   the documentation. So strip comments and string bodies first, and keep the
   result the same length so reported line numbers still point at the source. */
function stripCode(src) {
  var out = '', i = 0, n = src.length;
  while (i < n) {
    var c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += (src[i] === '\n' ? '\n' : ' '); i++; }
      out += '  '; i = Math.min(i + 2, n); continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      var quote = c;
      out += quote; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        out += (src[i] === '\n' ? '\n' : ' '); i++;
      }
      out += quote; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/* -- findings -------------------------------------------------------------- */

var findings = [];
function report(check, key, file, detail, severity) {
  findings.push({
    check: check,
    key: check + ':' + key,
    file: file,
    detail: detail,
    severity: severity || 'error'
  });
}

/* -- 1. ES5 - the constraint with no compiler behind it -------------------- */

var ES2015_TOKENS = [
  { name: 'const',            re: /(^|[^.\w])const\s+[\w{[]/g },
  { name: 'let',              re: /(^|[^.\w])let\s+[\w{[]/g },
  { name: 'arrow function',   re: /=>/g },
  { name: 'class',            re: /(^|[^.\w])class\s+\w/g },
  { name: 'async',            re: /(^|[^.\w])async[\s(]/g },
  { name: 'await',            re: /(^|[^.\w])await\s+/g },
  { name: 'spread/rest',      re: /\.\.\./g },
  { name: 'template literal', re: /`/g }
];

function checkEs5(files) {
  var targets = files.filter(function (f) {
    if (f.indexOf('/') >= 0) return false;                    /* root only */
    if (ES2015_ALLOWED.indexOf(f) >= 0) return false;
    return ES5_GLOBS.some(function (g) { return globToRe(g).test(f); });
  });
  targets.forEach(function (f) {
    var src = read(f); if (src == null) return;
    var code = stripCode(src);
    ES2015_TOKENS.forEach(function (t) {
      t.re.lastIndex = 0;
      var m = t.re.exec(code);
      if (!m) return;
      report('es5', f + '/' + t.name, f,
        t.name + ' at line ' + lineOf(code, m.index) + ' - this file ships to embedded browsers as-is');
    });
  });
}

/* -- 2. every source file carries the header ------------------------------- */

function checkHeaders(files) {
  files.forEach(function (f) {
    if (!/\.(js|rules)$/.test(f)) return;
    /* scripts/ is never deployed (see .vercelignore), so nothing in it is
       shipped source. The header is an IP marker on what leaves the building. */
    if (/^scripts\//.test(f)) return;
    if (f.indexOf('/') >= 0 && !/^(api|workers|shells|portals|admin|console|tenants)\//.test(f)) return;
    var src = read(f); if (src == null) return;
    var head = src.split('\n').slice(0, 40).join('\n');
    if (head.indexOf('ClearSky Energy Solutions') < 0) {
      report('header', f, f, 'no ClearSky Energy Solutions copyright line in the first 40 lines', 'warn');
    }
  });
}

/* -- 3. no literal credential in a tracked file ---------------------------- */

function checkSecrets(files) {
  files.forEach(function (f) {
    if (!/\.(js|html|json|rules|md|yml|yaml|sh|py)$/.test(f)) return;
    if (/package-lock\.json$/.test(f)) return;
    var src = read(f); if (src == null) return;
    SECRET_PATTERNS.forEach(function (p) {
      var m = p.re.exec(src);
      if (!m) return;
      var ln = lineOf(src, m.index);
      var line = src.split('\n')[ln - 1] || '';
      /* The Firebase web config is public by design and is committed on
         purpose - CLAUDE.md says so. Only flag an AIza that is not one. */
      if (p.name === 'google api key' && /apiKey/.test(line)) return;
      report('secret', f + '/' + p.name, f,
        p.name + ' at line ' + ln + ' - credentials belong in Vercel environment variables, never in the repo', 'error');
    });
  });
}

/* -- 4. what the web actually serves -----------------------------------------
   Vercel serves the repo root. Anything sitting there is a URL whether or not
   a page links to it, which is how four serverless functions - the Grid Atlas
   scoring model among them - came to be downloadable as plain text. */

/* .vercelignore is .gitignore SYNTAX, and the one rule that matters here is
   the one that is easy to forget: A PATTERN WITH NO SLASH IN IT MATCHES A
   BASENAME AT ANY DEPTH. `render.js` does not mean "the render.js at the root",
   it means "every file called render.js anywhere" - api/render.js included.

   This function used to treat a slashless pattern as an exact root path. That
   is a matcher which says a file is deployed when it is not, and on 2026-09-17
   it did exactly that: guard reported the served-server-code findings fixed
   while the same .vercelignore lines had quietly removed api/grid-atlas.js and
   api/render.js from the deployment. vercel.json names both in its `functions`
   block, so the build failed outright. checkVercelFunctions() below is the
   check for that; this is the matcher being right in the first place. */
function vercelIgnoreMatcher() {
  var raw = read('.vercelignore') || '';
  var deny = [], allow = [];
  raw.split('\n').forEach(function (l) {
    l = l.trim();
    if (!l || l[0] === '#') return;
    if (l[0] === '!') allow.push(l.slice(1)); else deny.push(l);
  });

  function globToRegex(glob) {
    var re = '';
    for (var i = 0; i < glob.length; i++) {
      var c = glob[i];
      if (c === '*') {
        if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
        else { re += '[^/]*'; }
      } else if (c === '?') { re += '[^/]';
      } else if ('.+^${}()|[]\\'.indexOf(c) >= 0) { re += '\\' + c;
      } else { re += c; }
    }
    return re;
  }

  function matches(pat, rel) {
    var dirOnly = pat.slice(-1) === '/';
    if (dirOnly) pat = pat.slice(0, -1);
    var anchored = pat.indexOf('/') >= 0;      /* a slash anywhere anchors it */
    if (pat[0] === '/') { pat = pat.slice(1); anchored = true; }
    if (!pat) return false;

    var body = globToRegex(pat);
    /* Anchored: match from the root. Unanchored: match the basename, or any
       path segment run ending at the basename. Either way a directory match
       also covers everything under it. */
    var re = anchored
      ? new RegExp('^' + body + '(?:/.*)?$')
      : new RegExp('(?:^|/)' + body + '(?:/.*)?$');
    return re.test(rel);
  }

  function hit(list, rel) {
    return list.some(function (pat) { return matches(pat, rel); });
  }
  return function served(rel) { return !(hit(deny, rel) && !hit(allow, rel)); };
}

function checkServedServerCode(files) {
  var served = vercelIgnoreMatcher();
  files.forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    if (f.indexOf('api/') === 0) return;                 /* api/ is the function runtime */
    if (!served(f)) return;                              /* excluded from the deployment */
    var src = read(f); if (src == null) return;
    var code = stripCode(src);
    var isServer = /module\.exports\s*=/.test(code) && (/process\.env\./.test(code) || /\brequire\s*\(/.test(code));
    if (!isServer) return;
    report('served-server-code', f, f,
      'serverless-function source served at https://<host>/' + f + ' - pricing, scoring and routing logic must not be downloadable (CLAUDE.md, IP protection). Add it to .vercelignore or move it under api/.');
  });
}

/* -- 4b. every function vercel.json declares still has a file ----------------
   Vercel fails the whole build - not the route, the BUILD - when a key in the
   `functions` block matches no serverless function: "The pattern ... doesn't
   match any Serverless Functions." Two ways to cause it, and this repo found
   the second one the hard way:

     - rename or delete api/<name>.js and leave the key behind
     - exclude the file in .vercelignore without meaning to. On 2026-09-17 a
       bare `render.js` added to hide the root copy also matched api/render.js,
       because .gitignore syntax matches a slashless pattern at any depth. The
       preview deployment failed with a project error, and had it deployed,
       Grid Atlas and the renderer would have been 404s.

   So this asks the question the build asks, before the push. */

function vercelFunctionMatcher(pattern) {
  var re = '';
  for (var i = 0; i < pattern.length; i++) {
    var c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { re += '.*'; i++; if (pattern[i + 1] === '/') i++; }
      else { re += '[^/]*'; }
    } else if ('.+^${}()|[]\\'.indexOf(c) >= 0) { re += '\\' + c; }
    else { re += c; }
  }
  return new RegExp('^' + re + '$');
}

function checkVercelFunctions(files) {
  var raw = read('vercel.json');
  if (!raw) return;
  var cfg;
  try { cfg = JSON.parse(raw); }
  catch (e) { report('vercel', 'unparseable', 'vercel.json', 'vercel.json is not valid JSON: ' + e.message); return; }
  var fns = cfg.functions || {};
  var served = vercelIgnoreMatcher();

  Object.keys(fns).forEach(function (pattern) {
    var re = vercelFunctionMatcher(pattern);
    var all = files.filter(function (f) { return re.test(f); });
    var live = all.filter(served);
    if (live.length) return;
    report('vercel', pattern, 'vercel.json',
      all.length
        ? 'declares a function for "' + pattern + '" but .vercelignore excludes every file it matches (' + all.slice(0, 3).join(', ') + '). Vercel fails the BUILD on a functions pattern that matches nothing - check for a slashless .vercelignore pattern, which matches a basename at any depth.'
        : 'declares a function for "' + pattern + '" and no file in the repo matches it. Vercel fails the BUILD on a functions pattern that matches nothing.');
  });
}

/* -- 5. no browser file reads the server environment ----------------------- */

function checkBrowserEnv(files) {
  var served = vercelIgnoreMatcher();
  files.forEach(function (f) {
    if (!/\.html$/.test(f) || !served(f)) return;
    var src = read(f); if (src == null) return;
    var code = stripCode(src);
    var m = /process\.env\.([A-Z_]+)/.exec(code);
    if (m) {
      report('browser-env', f + '/' + m[1], f,
        'process.env.' + m[1] + ' in a page the browser downloads - it is always undefined there, and naming the variable tells a reader what to go looking for', 'warn');
    }
  });
}

/* -- 6. tenant folders hold extensions, never copies of core --------------- */

function checkCoreCopies(files) {
  files.forEach(function (f) {
    var m = /^tenants\/([^/]+)\/(.+)$/.exec(f);
    if (!m) return;
    var base = path.basename(m[2]);
    if (!TENANT_FORBIDDEN.test(base)) return;
    report('core-copy', f, f,
      'tenants/' + m[1] + '/ carries a copy of core file ' + base + ' - core is never forked per tenant; add an extension point instead (CLAUDE.md, clean core / extension model)');
  });
}

/* -- 7. the org-alias map, mirrored by hand in eight places -------------------
   CLAUDE.md calls this a known wart and says what it costs: adding a tenant
   alias means editing every one of them, and the one you forget is the one
   that silently drops a user's documents. Guard cannot merge them. It can
   count them, and fail when a copy folds a different set of domains than the
   rest - which is the failure that actually happens. */

function checkOrgAlias(files) {
  var sites = [];
  files.forEach(function (f) {
    if (!/\.(js|html|rules)$/.test(f)) return;
    if (/^(docs|scripts)\//.test(f)) return;
    var src = read(f); if (src == null) return;
    /* Raw source, not stripped: the alias map lives INSIDE string literals,
       which is exactly what stripCode() blanks. Requiring the quotes is what
       separates a mirror of the map from the prose about it - and every file
       here is more prose than code, so that distinction carries the check. */
    var de = /['"]fenecon\.de['"]/.test(src), us = /['"]fenecon\.us['"]/.test(src);
    if (!de && !us) return;
    sites.push({ file: f, de: de, us: us });
  });
  sites.forEach(function (s) {
    if (s.de && s.us) return;
    report('org-alias', s.file, s.file,
      'folds ' + (s.de ? 'fenecon.de' : 'fenecon.us') + ' but not ' + (s.de ? 'fenecon.us' : 'fenecon.de') +
      ' - every mirror of orgAlias() must fold the same domains or a user lands in an org with none of their data', 'warn');
  });
  if (sites.length) {
    report('org-alias', 'mirror-count-' + sites.length, '(repo)',
      sites.length + ' independent copies of the org-alias map: ' + sites.map(function (s) { return s.file; }).join(', ') +
      ' - core should expose one map these import (CLAUDE.md). Rules files cannot import and stay hand-mirrored.', 'info');
  }
}

/* -- 8. orgsInvolved is always read with a default ---------------------------
   A bare resource.data.orgsInvolved fails the WHOLE rule evaluation on any
   project written before the field existed - not the clause, the evaluation. */

function checkRosterReads() {
  ['firestore.rules', 'storage.rules'].forEach(function (f) {
    var src = read(f); if (src == null) return;
    var code = stripCode(src);
    var re = /orgsInvolved/g, m;
    while ((m = re.exec(code))) {
      var before = code.slice(Math.max(0, m.index - 12), m.index);
      if (/\.get\(\s*['"]$/.test(before)) continue;
      report('roster-read', f + ':' + lineOf(code, m.index), f,
        'bare orgsInvolved reference at line ' + lineOf(code, m.index) +
        ' - use .get with a [] default; a missing field fails the entire evaluation on older documents');
    }
  });
}

/* -- 9. omega-tenant.js loads directly after omega-brand.js ---------------- */

function checkBootOrder(files) {
  files.forEach(function (f) {
    if (!/\.html$/.test(f) || /^(docs|scripts)\//.test(f)) return;
    var src = read(f); if (src == null) return;
    if (src.indexOf('omega-brand.js') < 0) return;
    if (src.indexOf('omega-sso.js') < 0) return;         /* only pages that sign users in */
    if (src.indexOf('omega-tenant.js') < 0) {
      report('boot-order', f + '/missing', f,
        'loads omega-brand.js and omega-sso.js but never omega-tenant.js - tenant resolution, the hostname lock and the suspension gate are all skipped', 'error');
      return;
    }
    var brand = src.indexOf('omega-brand.js'), tenant = src.indexOf('omega-tenant.js');
    if (tenant < brand) {
      report('boot-order', f + '/order', f,
        'omega-tenant.js loads before omega-brand.js - it wraps OmegaBrand.resolve and must come directly after it', 'error');
    }
  });
}

/* -- 10. every endpoint decides who the caller is -------------------------- */

var AUTH_MARKERS = [
  'authenticateWithTier', '.authenticate(', 'verifyIdToken',
  'constructEvent',            /* stripe webhook: the signature IS the authentication */
  'A.handler'
];

function checkApiAuth(files) {
  files.forEach(function (f) {
    if (!/^api\/[^/]+\.js$/.test(f)) return;
    var src = read(f); if (src == null) return;
    var code = stripCode(src);
    var authed = AUTH_MARKERS.some(function (m) { return code.indexOf(m) >= 0; });
    if (authed) return;
    var open = /Access-Control-Allow-Origin['"]\s*,\s*['"]\*/.test(code);
    var spends = /process\.env\.[A-Z_]*(API_KEY|TOKEN|SECRET)/.test(code);
    report('api-auth', f, f,
      'no token check' + (open ? ', and Access-Control-Allow-Origin: *' : '') +
      (spends ? ', and it spends a paid vendor key' : '') +
      ' - a hidden link is not a gate; a function that refuses is (CLAUDE.md)',
      spends ? 'error' : 'warn');
  });
}

/* -- 11. sealed files ------------------------------------------------------ */

function checkSealed(baseline) {
  var sealed = baseline.sealed || {};
  SEALED.forEach(function (f) {
    if (!exists(f)) { report('sealed', f + '/missing', f, 'sealed file is gone', 'error'); return; }
    var now = sha(read(f));
    var was = sealed[f];
    if (!was) {
      report('sealed', f + '/unsealed', f, 'not yet sealed - run npm run steward:accept to record its hash', 'warn');
      return;
    }
    if (was !== now) {
      report('sealed', f + '/' + now, f,
        'SEALED FILE CHANGED (' + was + ' -> ' + now + '). This file decides who can reach what. Review the diff, then commit the new hash with npm run steward:accept in the same pull request.', 'error');
    }
  });
}

/* -- run ------------------------------------------------------------------- */

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
  catch (e) { return { accepted: {}, sealed: {} }; }
}

function collect() {
  var files = walk(ROOT);
  var baseline = loadBaseline();
  checkEs5(files);
  checkHeaders(files);
  checkSecrets(files);
  checkServedServerCode(files);
  checkVercelFunctions(files);
  checkBrowserEnv(files);
  checkCoreCopies(files);
  checkOrgAlias(files);
  checkRosterReads();
  checkBootOrder(files);
  checkApiAuth(files);
  checkSealed(baseline);
  var acceptedKeys = {};
  Object.keys(baseline.accepted || {}).forEach(function (c) {
    (baseline.accepted[c] || []).forEach(function (k) { acceptedKeys[k] = true; });
  });
  return {
    files: files,
    all: findings,
    fresh: findings.filter(function (f) { return !acceptedKeys[f.key]; }),
    known: findings.filter(function (f) { return acceptedKeys[f.key]; })
  };
}

function main() {
  var argv = process.argv.slice(2);
  var asJson = argv.indexOf('--json') >= 0;
  var showAll = argv.indexOf('--all') >= 0;
  var accept = argv.indexOf('--accept') >= 0;

  var r = collect();

  if (accept) {
    var next = { accepted: {}, sealed: {} };
    r.all.forEach(function (f) {
      if (f.check === 'sealed') return;                  /* sealed is hashes, below */
      (next.accepted[f.check] = next.accepted[f.check] || []).push(f.key);
    });
    Object.keys(next.accepted).forEach(function (c) { next.accepted[c].sort(); });
    SEALED.forEach(function (f) { if (exists(f)) next.sealed[f] = sha(read(f)); });
    fs.writeFileSync(BASELINE, JSON.stringify({
      note: 'Known findings guard.js will not fail on, and the hashes of the files whose change must be reviewed. Generated by npm run steward:accept. Deleting a line here is how debt gets paid down.',
      generated: new Date().toISOString().slice(0, 10),
      sealed: next.sealed,
      accepted: next.accepted
    }, null, 2) + '\n');
    console.log('baseline updated: ' + r.all.length + ' finding(s) accepted, ' +
      Object.keys(next.sealed).length + ' file(s) sealed');
    return 0;
  }

  if (asJson) {
    console.log(JSON.stringify({ fresh: r.fresh, known: r.known, checked: r.files.length }, null, 2));
    return r.fresh.some(function (f) { return f.severity === 'error'; }) ? 1 : 0;
  }

  var show = showAll ? r.all : r.fresh;
  var byCheck = {};
  show.forEach(function (f) { (byCheck[f.check] = byCheck[f.check] || []).push(f); });

  console.log('omega steward - guard - ' + r.files.length + ' files');
  console.log('');
  if (!show.length) {
    console.log('  clean. ' + r.known.length + ' known finding(s) in baseline.json.');
    return 0;
  }
  Object.keys(byCheck).sort().forEach(function (c) {
    console.log('  ' + c);
    byCheck[c].forEach(function (f) {
      var mark = f.severity === 'error' ? 'FAIL' : (f.severity === 'warn' ? 'warn' : 'note');
      console.log('    ' + mark + '  ' + f.file);
      console.log('          ' + f.detail);
    });
    console.log('');
  });
  var errors = r.fresh.filter(function (f) { return f.severity === 'error'; });
  console.log('  ' + r.fresh.length + ' new (' + errors.length + ' blocking), ' + r.known.length + ' known.');
  if (errors.length) {
    console.log('');
    console.log('  A blocking finding is new breakage in this change, not old debt.');
    console.log('  Fix it, or - if it is deliberate - accept it with a reviewed');
    console.log('  npm run steward:accept commit in this same pull request.');
  }
  return errors.length ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { collect: collect, SEALED: SEALED };
