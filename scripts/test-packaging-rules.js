/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Requires local Firestore + Storage emulators and @firebase/rules-unit-testing.
 * Explicit demo project and localhost endpoints: never contacts a live tenant.
 */
'use strict';
var fs = require('fs'), path = require('path');
var T = require(process.env.RULES_TESTING || '@firebase/rules-unit-testing');
var F = require(process.env.FIREBASE_FIRESTORE || 'firebase/firestore'), S = require(process.env.FIREBASE_STORAGE || 'firebase/storage');
var env, count = 0, now = Date.now(), org = 'rules.example', root = 'omega_orgs/' + org;
async function yes(p) { await T.assertSucceeds(p); count++; }
async function no(p) { await T.assertFails(p); count++; }
function person(uid, domain, role, verified) { return env.authenticatedContext(uid, { email: uid + '@' + (domain || org), email_verified: verified !== false, role: role || 'member' }); }
async function billing(patch) { await env.withSecurityRulesDisabled(async function (ctx) { await F.setDoc(F.doc(ctx.firestore(), root + '/billing/current'), Object.assign({ packaged: true, packagingState: 'paid', modules: ['lite'], toolAccess: ['editor'], accessUntil: now + 86400000 }, patch)); }); }
async function run() {
  env = await T.initializeTestEnvironment({ projectId: 'demo-omega-packaging', firestore: { host: '127.0.0.1', port: 8187, rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8') }, storage: { host: '127.0.0.1', port: 9297, rules: fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8') } });
  await env.clearFirestore(); await env.clearStorage();
  await env.withSecurityRulesDisabled(async function (ctx) {
    var db = ctx.firestore();
    await F.setDoc(F.doc(db, root), { status: 'active' });
    for (var role of ['owner', 'admin', 'member', 'viewer']) await F.setDoc(F.doc(db, root + '/members/' + role), { role: role, status: 'active' });
    await F.setDoc(F.doc(db, root + '/billing/profile'), { email: 'private@rules.example' });
    await F.setDoc(F.doc(db, 'projects/saved'), { orgId: org, uid: 'member', orgsInvolved: ['partner.example'], name: 'Saved work' });
    await F.setDoc(F.doc(db, 'projects/partner'), { orgId: 'partner.example', uid: 'partner', orgsInvolved: [org], name: 'Partner work' });
    await F.setDoc(F.doc(db, root + '/billing/current/history/h1'), { action: 'invoice-paid' });
    await F.setDoc(F.doc(db, 'pricebook/test'), { enabled: false });
  });
  await billing();
  var owner = person('owner', org, 'owner'), member = person('member'), viewer = person('viewer', org, 'viewer'), staff = person('staff', 'clearsky-usa.com');
  var md = member.firestore(), od = owner.firestore(), sd = staff.firestore();
  await yes(F.getDoc(F.doc(od, root + '/billing/profile')));
  await yes(F.getDoc(F.doc(sd, root + '/billing/profile')));
  await no(F.getDoc(F.doc(md, root + '/billing/profile')));
  await no(F.getDoc(F.doc(person('owner', org, 'owner', false).firestore(), root + '/billing/profile')));
  await no(F.getDoc(F.doc(person('outsider', 'other.example').firestore(), root + '/billing/profile')));
  await no(F.setDoc(F.doc(sd, root + '/billing/profile'), { email: 'forged@example.com' }));
  await no(F.updateDoc(F.doc(sd, root + '/billing/current'), { modules: ['lite', 'storage'] }));
  await no(F.deleteDoc(F.doc(sd, root + '/billing/current')));
  await no(F.updateDoc(F.doc(od, root + '/billing/current'), { accessUntil: now + 99999999999 }));
  await no(F.setDoc(F.doc(sd, root + '/billing/current/history/forged'), { action: 'paid' }));
  await no(F.updateDoc(F.doc(sd, 'pricebook/test'), { enabled: true }));
  await yes(F.updateDoc(F.doc(md, 'projects/saved'), { name: 'Paid edit' }));
  await no(F.updateDoc(F.doc(viewer.firestore(), 'projects/saved'), { name: 'Viewer edit' }));
  await yes(F.setDoc(F.doc(md, 'toolData/' + org + '/tools/editor'), { data: 'owned' }));
  await no(F.setDoc(F.doc(md, 'toolData/' + org + '/tools/proforma'), { data: 'unowned' }));
  await yes(F.updateDoc(F.doc(md, 'projects/partner'), { name: 'Paid collaborator edit' }));
  await no(F.updateDoc(F.doc(md, 'projects/partner'), { orgsInvolved: [org, 'other.example'] }));
  await yes(S.uploadBytes(S.ref(member.storage(), 'projects/saved/paid.txt'), new Uint8Array([1]), { contentType: 'text/plain' }));
  await no(S.uploadBytes(S.ref(member.storage(), 'billing-certificates/' + org + '/tax.pdf'), new Uint8Array([1]), { contentType: 'application/pdf' }));
  await yes(S.uploadBytes(S.ref(staff.storage(), 'billing-certificates/' + org + '/tax.pdf'), new Uint8Array([1]), { contentType: 'application/pdf' }));
  await no(S.getBytes(S.ref(owner.storage(), 'billing-certificates/' + org + '/tax.pdf')));
  await no(S.deleteObject(S.ref(staff.storage(), 'billing-certificates/' + org + '/tax.pdf')));
  for (var state of ['pending', 'awaiting_payment', 'unpaid', 'reconciliation_required']) {
    await billing({ packagingState: state });
    await yes(F.getDoc(F.doc(md, 'projects/saved')));
    await no(F.updateDoc(F.doc(md, 'projects/saved'), { name: 'Unpaid edit' }));
    await no(F.setDoc(F.doc(md, 'projects/new-' + state), { orgId: org, uid: 'member' }));
    await no(F.updateDoc(F.doc(md, 'projects/partner'), { name: 'Unpaid collaborator edit' }));
    await no(F.setDoc(F.doc(md, 'toolData/' + org + '/tools/editor'), { data: 'unpaid' }));
    await yes(S.getBytes(S.ref(member.storage(), 'projects/saved/paid.txt')));
    await no(S.uploadBytes(S.ref(member.storage(), 'projects/saved/unpaid.txt'), new Uint8Array([1]), { contentType: 'text/plain' }));
  }
  await billing({ accessUntil: now - 1 }); await no(F.updateDoc(F.doc(md, 'projects/saved'), { name: 'Expired' }));
  await no(S.uploadBytes(S.ref(member.storage(), 'mapimg/' + org + '/saved/image.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  await billing({ packagingState: 'trial', trialStartedAt: now - 86400000, trialEndsAt: now + 13 * 86400000 });
  await yes(F.updateDoc(F.doc(md, 'projects/saved'), { name: 'Trial edit' }));
  await billing({ packagingState: 'trial', trialStartedAt: now - 86400000, trialEndsAt: now + 14 * 86400000 });
  await no(F.updateDoc(F.doc(md, 'projects/saved'), { name: 'Overlong trial' }));
  await billing({ packagingState: 'past_due_lite', paidThrough: '2026-09-01' });
  await yes(F.updateDoc(F.doc(md, 'projects/saved'), { name: 'Paid history Lite fallback' }));
  await billing({ packagingState: 'past_due_lite', modules: ['lite', 'storage'], paidThrough: '2026-09-01' });
  await no(F.updateDoc(F.doc(md, 'projects/saved'), { name: 'Invalid premium fallback' }));
  await env.withSecurityRulesDisabled(async function (ctx) { await F.deleteDoc(F.doc(ctx.firestore(), root + '/billing/current')); });
  await yes(F.updateDoc(F.doc(md, 'projects/saved'), { name: 'Legacy preserved' }));
  console.log('Packaging emulator rules: ' + count + ' checks passed; demo project only.');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(async function () { if (env) await env.cleanup(); });
