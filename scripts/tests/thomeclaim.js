#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/tests/thomeclaim.js — a personal address is homed by the orgId
   claim (2026-10-14). A workspace keyed gmail.com would hold every Gmail
   user, so a workspace made for a person on a public provider is keyed by
   its slug and the person is homed to it by the custom claim set-role
   mints. ONE order everywhere: the claim, else the email domain.
     node scripts/tests/thomeclaim.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..'), pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function fn(src, name) { var m = new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}').exec(src.replace(/\/\*[\s\S]*?\*\//g, '')); return m ? m[1] : ''; }

console.log('\nthe rules read the orgId claim first, then the email domain');
['firestore.rules', 'storage.rules'].forEach(function (f) {
  var u = fn(read(f), 'userOrg');
  ok(f + ': userOrg() reads request.auth.token.orgId when the claim is present', /token\.get\('orgId', ''\) != ''/.test(u) && /token\.orgId/.test(u));
  ok(f + ': and the aliased email domain otherwise', /orgAlias\(request\.auth\.token\.email\.split\('@'\)\[1\]\.lower\(\)\)/.test(u));
  var claimIdx = u.indexOf('token.orgId'), mailIdx = u.indexOf('token.email');
  ok(f + ': the claim is asked before the address', claimIdx >= 0 && mailIdx > claimIdx);
});
var rules = read('firestore.rules').replace(/\/\*[\s\S]*?\*\//g, '');
ok('isAdmin() still judges staff by the verified email, never the claim', /function isAdmin\(\)[\s\S]*?email_verified[\s\S]*?clearsky-usa\[\.\]com/.test(rules) && !/function isAdmin\(\)[\s\S]{0,300}token\.orgId/.test(rules));

console.log('\nthe API reads the same claim first');
var A = require(path.join(ROOT, 'api/_lib/admin.js'));
ok('admin.js authenticate(): dec.orgId || orgOf(email)', /orgId: dec\.orgId \|\| orgOf\(email\)/.test(read('api/_lib/admin.js')));
ok('verify-token.js: body.orgId || orgOf(email)', /orgId: body\.orgId \|\| orgOf\(email\)/.test(read('api/_lib/verify-token.js')));
ok('isPersonalEmail: gmail.com is personal', A.isPersonalEmail('michaelhush6@gmail.com') === true);
ok('isPersonalEmail: a company domain is not', A.isPersonalEmail('jane@concordenergyusa.com') === false);
ok('isPersonalEmail: a staff address is not', A.isPersonalEmail('tom@clearsky-usa.com') === false);
ok('orgOf is unchanged for a company address', A.orgOf('Jane@ConcordEnergyUSA.com') === 'concordenergyusa.com');

console.log('\nthe claim is minted for the tenant\'s own people and for a personal address, nobody else');
var lm = read('api/_lib/logic-members.js');
ok('logic-members.change(): out.claims = own domain || personal address', /out\.claims = A\.orgOf\(m\.email\) === o\.orgId \|\| A\.isPersonalEmail\(m\.email\)/.test(lm));
ok('and the claim is set only when out.claims', /if \(out\.claims\) await auth\.setCustomUserClaims/.test(lm));
var sr = read('api/set-role.js');
ok('set-role: a non-staff owner/admin may give a role to a personal address in their workspace', /!A\.isPersonalEmail\(email\)\) throw A\.httpError\(400, 'target is not in '/.test(sr));
ok('set-role: an address with no account yet goes through by email (the writer makes the account)', /auth\/user-not-found' && targetEmail/.test(sr));
ok('set-role GET ?email= is staff only and says personal / claimOrg', /function home\(req\)[\s\S]*?ClearSky staff only[\s\S]*?personal: A\.isPersonalEmail\(email\)[\s\S]*?claimOrg/.test(sr) && /if \(req\.method === 'GET'\) return home\(req\)/.test(sr));
ok('logic-team admissible(): a personal address is admissible', /A\.orgOf\(email\) === org \|\| A\.isPersonalEmail\(email\)/.test(read('api/logic-team.js')));

console.log('\nthe browser derives the home the same way');
var t = read('omega-tenant.js');
ok('omega-tenant.js: homeOrgOf = claim || email domain', /function homeOrgOf\(user\) \{ return T\.claimOrg \|\| emailOrg\(user\); \}/.test(t));
ok('omega-tenant.js: the claim is read off the token before entitlements load', /readHomeClaim\(user\)\.then\(function \(\) \{ loadEntitlements\(user\); \}\)/.test(t));
ok('omega-tenant.js: orgIdFor, routeFromHub and presence use it', (t.match(/homeOrgOf\(user\)/g) || []).length >= 4);
ok('omega-tenant.js: OmegaTenant.homeOrg is exposed', /homeOrg: function \(user\)/.test(t));
ok('omega-tenant.js: sign-out clears it', /T\.claimOrg = ''/.test(t));
ok('omega-editor-gate.js: decide() reads the claim, then decideFor(user, home || mailOrg)', /decideFor\(user, home \|\| mailOrg\)/.test(read('omega-editor-gate.js')));
var ed = read('editor.html');
ok('editor.html: _projOrgId() returns the claim first', /function _projOrgId\(\) \{[\s\S]{0,400}if \(window\._homeOrgClaim\) return window\._homeOrgClaim;/.test(ed));
ok('editor.html: the claim is read at sign-in', /window\._homeOrgClaim = String\(\(r && r\.claims && r\.claims\.orgId\) \|\| ''\)\.toLowerCase\(\)/.test(ed));
ok('projects.html: _wsFromUser asks OmegaTenant.homeOrg first', /OmegaTenant\.homeOrg\(user\)/.test(read('projects.html')));
ok('omega-tools.js: orgFromUrl asks OmegaTenant.homeOrg before the email', /OmegaTenant\.homeOrg && OmegaTenant\.homeOrg\(\)/.test(read('omega-tools.js')));

console.log('\nthe console makes the workspace and its owner');
var c = read('admin/admin-console.js');
ok('an address typed: the server says whether it is personal (GET /api/set-role?email=)', /_authedGet\('\/api\/set-role\?email=' \+ encodeURIComponent\(email\)\)/.test(c));
ok('personal: the slug is the key', /if \(personal\) domain = slug;/.test(c));
ok('the record says so (personal, ownerEmail)', /personal: personal \|\| null, ownerEmail: email \|\| null/.test(c));
ok('the owner is set through set-role AFTER the three documents', c.indexOf("_authedPost('/api/set-role', { orgId: domain, targetEmail: email, role: 'owner' })") > c.indexOf('return batch.commit();'));
ok('a plain domain still keys the workspace as before', /var domain = email \? email\.split\('@'\)\[1\] : typed;/.test(c));
ok('the host is guessed from the company name when an address is typed', /dom && dom\.indexOf\('@'\) < 0 \? dom\.split\('\.'\)\[0\] : name/.test(c));
ok('the form says an address may be typed', /the person's address/.test(read('admin/index.html')));
ok('admin-shared.js: _authedGet', /function _authedGet\(path\)/.test(read('admin/admin-shared.js')));

console.log('\nhome claim: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
