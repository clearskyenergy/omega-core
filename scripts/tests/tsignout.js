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

/* ── NO PAGE ACTS ON THE FIRST NULL ──────────────────────────────────────
   Firebase reports "no user" before it has finished restoring a session.
   Every page that treated that as final did visible damage: two navigated
   away, two painted a sign-in card — with whatever address the browser had
   saved, which is why somebody on FENECON's dashboard saw a Walters login and
   read it as being signed into the wrong account. */
console.log('no page acts on the first null');
/* Anchored on each page's HANDLER, not on the registration line — index.html
   registers below its handler, so a plain search lands past the guard. */
const PAGES = {
  'index.html':       'var _omegaOnAuth = function',
  'projects.html':    'auth.onAuthStateChanged(user => {',
  'marketplace.html': 'function onAuth(user, tries)',
  'rfq.html':         'auth.onAuthStateChanged(function(u){'
};
Object.keys(PAGES).forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = src.indexOf(PAGES[f]);
  ok(i >= 0, f + ' has the handler this test anchors on');
  const seg = src.slice(Math.max(0, i - 200), i + 1100);
  ok(/auth\.currentUser/.test(seg), f + ' confirms a null against auth.currentUser');
  ok(/setTimeout\(/.test(seg), f + ' gives the SDK time before acting on it');
});

/* The dashboard's splash is the whole point — it must not come down until the
   answer is real. */
{
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '');
  const h = src.indexOf('var _omegaOnAuth');
  const seg = src.slice(h, h + 900);
  ok(seg.indexOf('auth.currentUser') < seg.indexOf("classList.add('auth-ready')"),
     'index.html confirms BEFORE it tears the boot splash down');
}

/* ── NOTHING SIGNS A CUSTOMER OUT BUT THE CUSTOMER ───────────────────────
   Firebase auth state is shared by every tab on the origin, so one page
   calling signOut() from an auth handler empties the session in whatever else
   the person has open. A staff console left in a background tab was logging
   tenants out of the workspace they were actually using — the session died
   "in the background" while the page they were looking at stayed on screen. */
console.log('no page evicts anyone');
const EVICTORS = ['index.html', 'projects.html', 'marketplace.html', 'rfq.html',
                  'console/index.html', 'tenants/osa/index.html',
                  'tenants/osa/portfolio.html', 'tenants/solela/index.html'];
EVICTORS.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* Only inside auth-state handlers; a sign-out BUTTON must survive. */
  let bad = 0;
  const re = /onAuthStateChanged/g;
  let m;
  while ((m = re.exec(src))) {
    let seg = src.slice(m.index, m.index + 2500)
                 .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    /* Stop at the sign-out BUTTON if the window runs into it — index.html
       registers its handler just above function signOut(), and that one is
       the whole point of the rule, not a violation of it. */
    const btn = seg.indexOf('function signOut(');
    if (btn > 0) seg = seg.slice(0, btn);
    if (/\bauth\.signOut\(\)|firebase\.auth\(\)\.signOut\(\)/.test(seg)) bad++;
  }
  ok(bad === 0, f + ' never signs anyone out from an auth handler');
});

/* The hint that makes "loading screen only" possible, and the one place
   allowed to clear it. */
console.log('session hint');
{
  const t = fs.readFileSync(path.join(ROOT, 'omega-tenant.js'), 'utf8');
  ok(/hadSession: hadSession/.test(t) && /endSession: endSession/.test(t),
     'omega-tenant exposes hadSession/endSession');
  ok(/if \(user\) \{ markSession\(\);/.test(t), 'and marks the tab when a user arrives');
}
['index.html', 'projects.html', 'marketplace.html', 'rfq.html'].forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  ok(/OmegaTenant\.hadSession/.test(src), f + ' waits longer when the tab had a session');
});
['index.html', 'projects.html'].forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const i = src.indexOf('function signOut(');
  const seg = src.slice(i, i + 400);
  ok(/OmegaTenant\.endSession/.test(seg), f + "'s sign-out button clears the hint");
});

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
