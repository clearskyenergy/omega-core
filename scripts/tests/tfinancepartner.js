/* Standing up a capital partner: the seed, the provisioning script, and the
   three dashboard panels.

   The thing this guards hardest is that no password ever enters the
   repository. This repo is public, so a credential committed here is a
   credential published — rotating it afterwards does not remove it from the
   history or from any clone. The provisioning script therefore reads the
   initial password from the environment, and this test fails if any of the
   provisioning surface grows a literal one.

   The second thing is scope. A capital partner's board reads fin_projects,
   never projects. A panel that quietly fell back to the project aggregate
   would show a developer's pipeline to an investor. */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const root = p => path.join(__dirname, '..', '..', p);
const read = p => fs.readFileSync(root(p), 'utf8');
const code = p => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .replace(/<!--[\s\S]*?-->/g, ' ');

console.log('no credential is committed');
const PROV = ['scripts/provision-finance-partner.js', 'tenants/helios/tenant.json',
              'docs/finance-partner-setup.md'];
PROV.forEach(f => {
  const s = read(f);
  ok(!/test1234/.test(s), f + ' contains no literal password');
  /* Line-based on purpose. An earlier version stripped string literals with a
     regex and desynchronised on the apostrophe in "partner's" inside a
     comment, which made it flag its own log line. The real question is
     simple: does any line both mention a password and carry a literal long
     enough to BE one, without that literal being an environment variable
     name or an ellipsis in a usage example? */
  const suspect = s.split('\n').filter(l => {
    if (!/password/i.test(l)) return false;
    if (/process\.env|INITIAL_PASSWORD|generatePasswordResetLink/.test(l)) return false;
    /* A literal starting with '-' is a CLI flag ('--reset-password'), not a
       secret. Dropping '-' from the class is what distinguishes them. */
    return /['"][A-Za-z0-9!@#$%^&*_]{6,}['"]/.test(l);
  });
  ok(suspect.length === 0,
     f + ' never puts a password literal on a password line'
     + (suspect.length ? '  → ' + suspect[0].trim().slice(0, 70) : ''));
});
const prov = code('scripts/provision-finance-partner.js');
ok(/process\.env\.INITIAL_PASSWORD/.test(prov), 'the password comes from the environment');
ok(/generatePasswordResetLink/.test(prov),
   'with no password set it issues a reset link instead of inventing one');
ok(/FIREBASE_SERVICE_ACCOUNT/.test(prov), 'it needs a service account, which is not in the repo');

console.log('\nthe script refuses to do damage by default');
ok(/APPLY\s*=\s*flag\('--apply'\)/.test(prov), 'dry run unless --apply');
ok(/auth\.getUserByEmail/.test(prov) && /RESET\s*&&\s*PW/.test(prov),
   'an existing account keeps its password unless --reset-password is given');
ok(/approved:\s*true/.test(prov),
   'provisioned profiles are pre-approved — a self-signed-up one sees nothing');
ok(/merge:\s*true/.test(prov), 'every write merges, so a re-run is idempotent');

console.log('\nthe tenant seed');
const T = JSON.parse(read('tenants/helios/tenant.json'));
ok(T.orgId === 'heliosnrgy.com', 'orgId is the email domain');
ok(T.financePartner && T.financePartner.orgKey === 'helios',
   'it carries the finance orgKey that scopes everything downstream');
ok((T.requiredTools || []).indexOf('financing') >= 0,
   'the financing portal is pinned as a required tool, so it is preloaded');
ok(T.status === 'active', 'the tenant is active');
ok(/orphan/.test(T._note || ''), 'the note warns that renaming orgKey orphans deliveries');

console.log('\nthe dashboard panels');
const idx = code('index.html');
['finroom', 'finoffers', 'fininvest'].forEach(t => {
  ok(new RegExp("type:'" + t + "'").test(idx), t + ' is in the widget palette');
});
ok(/_PANEL_TYPES\s*=\s*\['finroom','finoffers','fininvest'\]/.test(idx),
   'all three are registered as panel widgets, not charts');
ok(/_drawableTypes[\s\S]{0,400}concat\(_PANEL_TYPES\)/.test(idx),
   'and the drawable list includes them, so a saved layout can restore one');
ok(/if\s*\(_isPanelType\(type\)\)/.test(idx),
   'a panel widget gets an HTML shell rather than a canvas it could never draw into');
ok(/if\(!_isPanelType\(a\.type\)\) return;[\s\S]{0,200}_drawPanelInto/.test(idx),
   'panels draw before the Chart.js guard');

/* The bug this prevents: _drawAdded used to return early when the project
   aggregate was empty. A capital partner has no projects, so that is exactly
   the tenant these panels exist for. */
const drawAdded = idx.slice(idx.indexOf('function _drawAdded()'));
const panelBlock = drawAdded.slice(0, drawAdded.indexOf("if(typeof Chart==='undefined'"));
ok(/_drawPanelInto/.test(panelBlock),
   'panels are drawn before the _lastAgg guard — a partner has no projects');

console.log('\nscope: a partner board reads the financing collections only');
/* THE QUERY MUST BE ONE THE RULES ALLOW.
   A partner reads fin_projects three ways — status == 'open', awardedTo, and
   firstLookUids array-contains — and Firestore refuses the WHOLE query the
   moment one returned document fails. The panel asked on room.forOrg, which
   matches none of them: it would have errored or shown nothing on every load,
   for the only tenant it was built for. room.forOrg is the delivery label;
   the uid array is the grant. */
ok(/where\('firstLookUids','array-contains',uid\)/.test(idx),
   'the deal room reads the deals held for this partner');
ok(/where\('awardedTo','==',uid\)/.test(idx), 'and the ones they have won');
ok(!/where\('room\.forOrg'/.test(idx),
   'and never queries room.forOrg, which no rule permits');
/* The uid is now stored as a field, so the group query works and returns
   marketplace offers too. What must never happen is a refusal reading as
   "no offers" — hence the fallback and the scope label. */
ok(/collectionGroup\('offers'\)\.where\('uid','==',uid\)/.test(idx),
   'offers are read with a collection group, so marketplace offers count too');
ok(/\['catch'\]\(function\(\)\{ return _offersPerDeal\(\); \}\)/.test(idx),
   'and a refused group query falls back to the per-deal read rather than reporting zero');
ok(/_FIN\.offersScope\s*=\s*'room'/.test(idx) && /_FIN\.offersScope\s*=\s*'all'/.test(idx),
   'the panel records which of the two scopes it actually got');
ok(/offersScope==='room'/.test(idx),
   'and says so on screen, so a narrower read never passes as the whole picture');

const fin = read('portals/finance/index.html');
ok(/uid:\s*FB\.auth\.currentUser\.uid/.test(fin),
   'the portal stores uid as a field — without it the group query matches nothing');
ok(/dealId:\s*d\.docId/.test(fin) && /dealName:\s*d\.name/.test(fin),
   'and dealId/dealName ride along, since a group query returns no parent');

const rules = read('firestore.rules');
ok(/match \/\{path=\*\*\}\/offers\/\{offerId\}/.test(rules),
   'a collection-group rule exists — the nested match cannot cover a group query');
ok(/allow read: if signedIn\(\) && offerId == request\.auth\.uid;/.test(rules),
   'and it returns a partner exactly their own offers, on any deal');
ok(/match \/\{path=\*\*\}\/offers\/\{offerId\} \{[\s\S]{0,200}allow write: if false;/.test(rules),
   'the group rule is read-only — writing still goes through the nested checks');
ok(/status===['"]accepted['"]/.test(idx),
   'investments count accepted offers only, not pipeline');

/* If the org key cannot be resolved the panel must say so. Rendering an empty
   card would read as "no deals" to somebody who has twelve. */
ok(/_FIN\.err==='nokey'/.test(idx), 'an unresolved org key is reported, not rendered as empty');
ok(/not registered as a capital partner/.test(read('index.html')),
   'and it says why in words');

console.log('\nthe starter board');
/* omega_orgs/{org}/layouts/default has been in CLAUDE.md since the control
   plane was designed and nothing read it, so every tenant fell through to its
   vertical — and a capital partner seeded from 'developer' opens on a project
   pipeline it does not have, which is the same as opening on nothing. */
ok(/collection\('layouts'\)\.doc\('default'\)/.test(idx),
   'the dashboard reads the org-level starter board');
ok(/function _seedStarterBoard/.test(idx), 'through one seeding function');
ok(/byVertical/.test(idx),
   'and still falls back to the vertical, so nothing changes for a tenant without one');
const provApi = code('api/provision-partner.js');
ok(/collection\('layouts'\)\.doc\('default'\)/.test(provApi),
   'provisioning writes that board, so the first sign-in already looks right');
ok(/had\.name \|\| name/.test(provApi),
   'and keeps the name a self-signed-up tenant typed for itself');
ok(/status: 'active'/.test(provApi),
   'provisioning approves the tenant — otherwise it is half a job');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
