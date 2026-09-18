#!/usr/bin/env node
/* The sign-in gate must actually be able to hide the app.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE BUG THIS PREVENTS
   Every gated page hides its workspace with el('app').style.display='none'.
   An inline style LOSES to !important in the author stylesheet, so a single
   `#app{display:flex !important}` — added to marketplace.html during the
   16-repo consolidation to force a sidebar layout — meant the app could never
   be hidden. Signed-out visitors were served the workspace chrome (sidebar,
   nav, Sign Out) rendered underneath the login card. It looked like a flaky
   auth race and was reported as "the marketplace is doing it again"; it was
   CSS beating JavaScript, every time, deterministically.

   Layout properties on #app are fine. A `display` declaration marked
   !important is not, because the gate is JavaScript setting an inline style.

   node scripts/test-auth-gate.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

/* Any page that hides #app from JS is a gated page and must obey the rule. */
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const gated = pages.filter(f => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  return /\bel\('app'\)\.style\.display\s*=\s*'none'|getElementById\('app'\)\.style\.display\s*=\s*'none'/.test(s);
});
ok('at least one gated page was found to check', gated.length > 0, gated.length);

gated.forEach(f => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* Strip comments so the explanation of the bug does not read as the bug. */
  const css = s.replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = [];
  const re = /#app\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[1];
    if (/display\s*:[^;]*!\s*important/i.test(body)) bad.push(m[0].slice(0, 90));
  }
  ok(f + ': #app has no `display` marked !important — the gate must win', bad.length === 0, bad);
  /* And the default must still be hidden, or the gate never had a chance.
     Either mechanism is fine: a CSS rule (marketplace, index) or the inline
     style attribute on the element itself (permit). Checking only the first
     called permit.html broken when it is not. */
  const hiddenByRule = /#app\s*\{[^}]*display\s*:\s*none/.test(css);
  const hiddenByAttr = /<div[^>]*\bid=["']app["'][^>]*style=["'][^"']*display\s*:\s*none/.test(s);
  ok(f + ': #app starts hidden (CSS rule or inline attribute)', hiddenByRule || hiddenByAttr,
     { hiddenByRule, hiddenByAttr });
});

/* The specific regression, named. */
const mkt = fs.readFileSync(path.join(ROOT, 'marketplace.html'), 'utf8');
ok('marketplace.html: the consolidation-era rule is gone',
   !/#app\{display:flex !important/.test(mkt.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('marketplace.html: onAuth still hides the app on the signed-out path',
   /el\('auth-screen'\)\.style\.display='flex';\s*el\('app'\)\.style\.display='none'/.test(mkt));
ok('marketplace.html: and reveals it on success',
   /el\('auth-screen'\)\.style\.display='none';\s*el\('app'\)\.style\.display='flex'/.test(mkt));

console.log((fail ? '✗' : '✓') + ' auth gate: ' + pass + ' passed, ' + fail + ' failed  (' +
            gated.length + ' gated page' + (gated.length === 1 ? '' : 's') + ': ' + gated.join(', ') + ')');
process.exit(fail ? 1 : 0);
