'use strict';
// Synthetic emulator fixtures only. Never loads Firebase production credentials.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const T = require('@firebase/rules-unit-testing');
const F = require('firebase/firestore');
const root = process.env.REVIEW_DIR;
const projectId = 'demo-omega-sitecrm';
const org = 'rules.example';
const orgPath = 'omega_orgs/' + org;
const sitePath = orgPath + '/sites/synthetic-site';
const privatePaths = ['contacts', 'activity', 'files', 'proforma'].map(x => sitePath + '/' + x + '/synthetic-record').concat([orgPath + '/sitecrm_followups/synthetic-followup', sitePath]);
const actors = [null, ['member', org], ['owner', org], ['admin', org], ['viewer', org], ['disabled', org], ['outside', 'other.example'], ['staff', 'clearsky-usa.com'], ['unverified', org, false]];
async function checkVersion(version) {
  let env;
  let checks = 0;
  const yes = async promise => { await T.assertSucceeds(promise); checks++; };
  const no = async promise => { await T.assertFails(promise); checks++; };
  try {
    env = await T.initializeTestEnvironment({projectId, firestore: {host: '127.0.0.1', port: 8187, rules: fs.readFileSync(path.join(root, version + '-firestore.rules'), 'utf8')}});
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await F.setDoc(F.doc(db, orgPath), {status: 'active', name: 'Synthetic fixture'});
      for (const role of ['owner', 'admin', 'member', 'viewer', 'disabled']) {
        await F.setDoc(F.doc(db, orgPath + '/members/' + role), {role: role === 'disabled' ? 'member' : role, status: role === 'disabled' ? 'disabled' : 'active'});
      }
      await F.setDoc(F.doc(db, 'projects/synthetic-saved'), {orgId: org, uid: 'member', orgsInvolved: [], name: 'Saved work'});
      await F.setDoc(F.doc(db, 'projects/synthetic-other'), {orgId: 'other.example', uid: 'outside', orgsInvolved: [], name: 'Other workspace'});
      for (const p of privatePaths) await F.setDoc(F.doc(db, p), {orgId: org, name: 'Synthetic record', shared: false, path: 'synthetic-only'});
    });
    for (const actor of actors) {
      const context = actor ? env.authenticatedContext(actor[0], {email: actor[0] + '@' + actor[1], email_verified: actor[2] !== false}) : env.unauthenticatedContext();
      const db = context.firestore();
      for (const p of privatePaths) {
        const colPath = p.slice(0, p.lastIndexOf('/'));
        await no(F.getDoc(F.doc(db, p)));
        await no(F.getDocs(F.collection(db, colPath)));
        await no(F.setDoc(F.doc(db, p + '-new'), {orgId: org, shared: true}));
        await no(F.updateDoc(F.doc(db, p), {shared: true, path: 'other-site'}));
        await no(F.deleteDoc(F.doc(db, p)));
      }
    }
    const member = env.authenticatedContext('member', {email: 'member@' + org, email_verified: true}).firestore();
    const staff = env.authenticatedContext('staff', {email: 'staff@clearsky-usa.com', email_verified: true}).firestore();
    await yes(F.getDoc(F.doc(member, 'projects/synthetic-saved')));
    await yes(F.updateDoc(F.doc(member, 'projects/synthetic-saved'), {name: 'Existing project remains editable'}));
    await no(F.getDoc(F.doc(member, 'projects/synthetic-other')));
    await yes(F.getDoc(F.doc(member, orgPath)));
    await yes(F.getDoc(F.doc(staff, 'projects/synthetic-other')));
    await env.withSecurityRulesDisabled(async context => {
      for (const p of privatePaths) {
        await F.updateDoc(F.doc(context.firestore(), p), {serverUpdated: true});
        assert.equal((await F.getDoc(F.doc(context.firestore(), p))).data().serverUpdated, true);
        checks++;
      }
    });
    console.log('PASS ' + version + ': ' + checks + ' emulator assertions; synthetic demo data only.');
    return checks;
  } finally {
    if (env) await env.cleanup();
  }
}
(async () => {
  const baseline = await checkVersion('baseline');
  const candidate = await checkVersion('candidate');
  assert.equal(candidate, baseline);
  fs.writeFileSync(path.join(root, 'emulator-results.json'), JSON.stringify({baseline_checks: baseline, candidate_checks: candidate, status: 'passed', production_access: false}, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
