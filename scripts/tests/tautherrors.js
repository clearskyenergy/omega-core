/* No vendor error string ever reaches a screen, and one rule decides who
   sees the Joint Development nav.

   A customer signing in to silmarillion.clearskyomega.com was shown
   "Firebase: Error (auth/invalid-login-credentials)." That names our
   authentication vendor, exposes an internal code, tells the reader nothing
   they can act on, and reads as a broken product. The rule now is that no
   Firebase code reaches a screen and anything unrecognised says to contact
   the account administrator.

   The JD nav is here too because it failed the same way — a rule copied into
   three shells, where one copy drifted. A tenant set up as a JD partner saw
   "JD Partners" on Projects and Marketplace and not on the Dashboard. */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const root = p => path.join(__dirname, '..', '..', p);
const read = p => fs.readFileSync(root(p), 'utf8');
/* Comments describe these patterns; strip them so prose is never the match. */
const code = p => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const A = require(root('omega-auth-errors.js'));

console.log('the mapper');
ok(A.text({ code: 'auth/invalid-login-credentials' }) === 'That email and password don’t match an account.',
   'the code from the screenshot gets plain language');
ok(!/firebase|auth\//i.test(A.text({ code: 'auth/invalid-login-credentials' })),
   'and no vendor name or code survives in it');
ok(A.text({ code: 'auth/wrong-password' }) === A.text({ code: 'auth/user-not-found' }),
   'wrong password and unknown account read identically, so neither confirms an address exists');
ok(/Contact your account administrator\.$/.test(A.text({ code: 'auth/some-code-invented-in-2027' })),
   'an unrecognised code names the account administrator');
ok(/Contact your account administrator\.$/.test(A.text(null)),
   'so does no error at all');
ok(/Contact your account administrator\.$/.test(A.text(new Error('Firebase: Error (auth/internal-error).'))),
   'so does an internal error');
ok(A.text({ code: 'auth/user-disabled' }).indexOf('Contact your account administrator') > 0,
   'a disabled account says who to contact, because the reader can do nothing else');

/* The trap: a caller that passes err.message as its own fallback. That is
   exactly the bug, so the fallback is refused rather than displayed. */
ok(A.text({ code: 'auth/unknown' }, 'Firebase: Error (auth/unknown).').indexOf('Firebase') < 0,
   'a vendor-shaped fallback is discarded, not shown');
ok(A.text({ code: 'auth/unknown' }, 'Enter your email and password.') === 'Enter your email and password.',
   'but our own wording is kept');
ok(A.scrub('FirebaseError: Missing or insufficient permissions.').indexOf('Firebase') < 0,
   'scrub catches a Firestore message too');
ok(A.scrub('Enter your email and password.') === 'Enter your email and password.',
   'and leaves a real message alone');
ok(A.scrub('') === '', 'an empty message stays empty rather than becoming an error');
ok(!/firebase/i.test(Object.keys(A).map(k => typeof A[k] === 'string' ? A[k] : '').join(' ')),
   'the module exposes no vendor string of its own');

console.log('\nno sign-in surface passes a raw message');
const SURFACES = ['index.html', 'console/index.html', 'tenants/osa/index.html',
                  'tenants/osa/portfolio.html', 'admin/admin-console.js'];
SURFACES.forEach(f => {
  const s = code(f);
  const leaks = s.match(/showAuthErr\(\s*\(?\s*(err|e)\b[^)]*\.message/g) || [];
  ok(leaks.length === 0, f + ' does not hand showAuthErr a raw message'
     + (leaks.length ? '  → ' + leaks.join(' , ') : ''));
});
['index.html', 'console/index.html', 'tenants/osa/index.html',
 'tenants/osa/portfolio.html', 'admin/index.html'].forEach(f => {
  ok(/omega-auth-errors\.js/.test(read(f)), f + ' loads the mapper');
});

console.log('\none rule for the Joint Development nav');
const J = require(root('omega-jd-nav.js'));
ok(J.isOsaOrg('clearsky-usa.com') === true, 'an OSA org is recognised');
ok(J.isOsaOrg('francisenergy.com') === false, 'a JD partner is not an OSA org');
ok(J.orgOf('a@FENECON.DE') === 'fenecon.com',
   'the org alias matches the one in firestore.rules, so the nav cannot disagree with the rules');
ok(J.orgOf('nobody') === '', 'a malformed address resolves to no org');

['index.html', 'projects.html', 'marketplace.html'].forEach(f => {
  const s = code(f);
  ok(/OmegaJdNav\.reveal\(/.test(s), f + ' delegates to the shared rule');
  ok(!/o\.jdPartner\s*===\s*true/.test(s),
     f + ' keeps no second copy of the flag test');
  ok(!/var OSA_ORGS = \['clearsky-usa\.com'/.test(s),
     f + ' keeps no second copy of the OSA list');
  ok(/omega-jd-nav\.js/.test(read(f)), f + ' loads the shared rule');
});

/* The flag is identity-compared. A stale truthy value in omega_orgs must not
   open the section — that asymmetry is what leaked it to a tenant with no JV
   relationship the last time this was flag-driven. */
const jdSrc = code('omega-jd-nav.js');
ok(/o\.jdPartner === true/.test(jdSrc), 'jdPartner is compared with ===, not coerced');
ok(!/isStaffEmail|staff\s*\|\|/.test(jdSrc),
   'there is no staff fallback — one way in, so a leak has one cause');

console.log('\nthe deal room is a workspace for a financing tenant');
/* Same failure mode as the JD section: a nav item present on one shell and
   absent on another reads as the platform being broken. */
['index.html', 'projects.html', 'marketplace.html'].forEach(f => {
  ok(/id="sn-dealroom"/.test(read(f)), f + ' carries the Deal Room item');
  ok(/id="sn-dealroom"[^>]*style="display:none"/.test(read(f)),
     f + ' hides it by default — it is revealed, never shown to everyone');
});
ok(/dealroom:\s*'sn-dealroom'/.test(jdSrc), 'the shared rule knows the id');
ok(/if \(f\.finance\) show\(IDS\.dealroom\)/.test(jdSrc),
   'and reveals it for a financing tenant');
/* Assert the property, not the phrasing: the key must be a NON-EMPTY STRING.
   A truthy test would let a stray `true` or a 1 open a deal room, and an
   empty-string key would scope a partner's queries to nothing. */
ok(/typeof o\.financeOrgKey === 'string'/.test(jdSrc) && /key !== ''/.test(jdSrc),
   'the finance flag is a non-empty string key, not a truthy switch');
ok(/function readTenantFlags/.test(jdSrc) && !/function readJdFlag/.test(jdSrc),
   'both answers come from one tenant read, not two round trips for one row');
ok(/href="\/portals\/finance\/"/.test(read('index.html')),
   'and it opens the financing portal');

console.log('\na financing account is not a referral inbox');
/* A referral is a quote request. A capital partner is never asked for a
   price — deals are referred to them in their deal room. Helios opened on
   "No referrals yet · Send a referral", inviting them to do the one thing
   that surface is not for. */
const refSrc = code('omega-referrals.js');
ok(/if \(ws\.financeOrgKey\) return false;/.test(refSrc),
   'a tenant with a finance org key never mounts the referral inbox');
ok(/if \(global\.OmegaJdNav && !ws\._tenantFlagsAt\) return 'unknown';/.test(refSrc),
   'and it waits for the flag rather than guessing — mount() only polls while this is unknown');
ok(/_tenantFlagsAt = Date\.now\(\)/.test(jdSrc),
   'the nav read stamps when the tenant flags were answered');
ok(/w\.financeOrgKey = f\.financeOrgKey/.test(jdSrc),
   'and stamps the key itself, so other modules stop guessing');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
