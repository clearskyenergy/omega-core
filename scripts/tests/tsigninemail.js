#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/tests/tsigninemail.js — a sign-in email is compared lower-cased.

   The pages write a person's address lower-cased (index.html _meEmail(),
   the office and customer pages through the API), but a Firebase token
   from a password account carries the address exactly as it was typed, so
   `request.auth.token.email` compared verbatim refused every Team Hub
   write, the terms acceptance and the staff test for anyone who signed up
   with a capital letter. userOrg() and org_members lower-cased already;
   the four team blocks, termsAcceptances and isAdmin() now do too.
     node scripts/tests/tsigninemail.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..'), pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }
var rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function block(name) { var i = rules.indexOf('match /' + name + '/'); var j = rules.indexOf('\n    match /', i + 10); return i < 0 ? '' : rules.slice(i, j < 0 ? undefined : j); }

console.log('\nfirestore.rules compares the sign-in email lower-cased');
['team_members', 'team_messages', 'team_conversations', 'team_convo_messages', 'termsAcceptances'].forEach(function (name) {
  var b = block(name);
  ok(name + ': the block is there', b.length > 0);
  var raw = (b.match(/request\.auth\.token\.email(?!\.lower\(\))/g) || []).length;
  ok('  ' + name + ': every token email is lower-cased (' + (b.match(/request\.auth\.token\.email\.lower\(\)/g) || []).length + ' compares)', raw === 0 && /request\.auth\.token\.email\.lower\(\)/.test(b), raw);
});
var members = block('team_members');
ok('team_members: the document id is orgId + "__" + the lower-cased address, the way the page names it', /memberId == request\.resource\.data\.orgId \+ '__' \+ request\.auth\.token\.email\.lower\(\)/.test(members));
ok('team_members: the stored address is compared lower-cased on both sides', /request\.resource\.data\.email\.lower\(\) == request\.auth\.token\.email\.lower\(\)/.test(members) && /resource\.data\.email\.lower\(\) == request\.auth\.token\.email\.lower\(\)/.test(members));
var convo = block('team_conversations');
ok('team_conversations: membership is the lower-cased address in the members list', (convo.match(/request\.auth\.token\.email\.lower\(\) in /g) || []).length === 3);
var admin = /function isAdmin\(\)\s*\{([\s\S]*?)\n\s*\}/.exec(rules);
ok('isAdmin(): the verified ClearSky address is matched lower-cased, as api/_lib/admin.js does', !!admin && /request\.auth\.token\.email\.lower\(\)\.matches\('\.\*@clearsky-usa\[\.\]com'\)/.test(admin[1]) && /email_verified/.test(admin[1]));
ok('the pages write the address lower-cased (index.html _meEmail)', /function _meEmail\(\)[^\n]*toLowerCase\(\)/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
console.log('\nsign-in email: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
