/* Nobody gets signed out because a workspace has not resolved YET.

   People were being logged out simply for navigating between pages. The
   handler resolved a workspace from the email domain and, on a null, called
   auth.signOut(). But resolve() consults the tenant pin that omega-tenant.js
   applies from tenant_public, and that pin lands on its own schedule — so the
   window before it settles looked identical to "this account does not belong
   here", and the page destroyed the credential over it. The next page then had
   nothing to restore, which is what made it look like a session that would not
   stick. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

/* Exactly the unresolved-workspace branch, brace-matched — a fixed window
   swallows the sign-out BUTTON further down the file, which must stay. */
function unresolvedBranch(file) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const r = s.indexOf('resolveWorkspace(');
  if (r < 0) return null;
  const i = s.indexOf('if (!ws)', r);
  if (i < 0) return null;
  let k = s.indexOf('{', i), d = 0;
  for (;; k++) {
    if (k >= s.length) return null;
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (!d) break; }
  }
  /* Comments out — both branches now EXPLAIN that they no longer sign out,
     and a naive search would match the explanation. */
  return s.slice(i, k + 1)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
}

console.log('signed out for navigating');
['index.html', 'marketplace.html'].forEach(file => {
  const b = unresolvedBranch(file);
  ok(!!b, file + ' has an unresolved-workspace branch');
  if (!b) return;
  ok(!/auth\.signOut\(\)/.test(b),
     file + ' does not sign the user out when no workspace resolved');
  ok(/setTimeout\(/.test(b) && /tries/.test(b),
     file + ' waits for the tenant pin before judging');
  ok(/tries > 8/.test(b), file + ' gives up after a bounded number of tries');
});

/* A deliberate sign-out must still exist — this is not "never sign out". */
console.log('deliberate sign-out still available');
['index.html', 'marketplace.html'].forEach(file => {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  ok(/signOut/.test(s), file + ' still has a sign-out the user can choose');
});

/* Whatever else changes, the handler has to be re-runnable — that is what
   makes waiting possible at all. */
console.log('handler is re-runnable');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/var _omegaOnAuth = function \(user, tries\)/.test(idx),
   'index.html names its auth handler so it can retry itself');
ok(/onAuthStateChanged\(function \(user\) \{ _omegaOnAuth\(user, 0\); \}\)/.test(idx),
   'and registers it with a starting count');
const mkt = fs.readFileSync(path.join(ROOT, 'marketplace.html'), 'utf8');
ok(/function onAuth\(user, tries\)/.test(mkt), 'marketplace.html likewise');
ok(/onAuthStateChanged\(function\(u\)\{ onAuth\(u, 0\); \}\)/.test(mkt), 'and registers it too');

/* A page that NAVIGATES AWAY on "no user" cannot correct itself — whatever
   auth reports a moment later lands somewhere else. projects.html did that
   the instant the observer fired null. */
console.log('no page bounces on the first null');
{
  const s = fs.readFileSync(path.join(ROOT, 'projects.html'), 'utf8');
  const i = s.indexOf('auth.onAuthStateChanged(user => {');
  const seg = s.slice(Math.max(0, i - 1400), i + 900)
               .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/if \(!user\) \{ window\.location\.href = '\/'; return; \}/.test(seg),
     'projects.html no longer redirects on the first null');
  ok(/auth\.currentUser/.test(seg), 'it confirms against auth.currentUser before giving up');
  ok(/setTimeout\(/.test(seg), 'and gives the SDK a moment to finish restoring');
}

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
