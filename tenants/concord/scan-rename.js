/* Finds everything in clearsky-portal still pointing at the OLD address.
   READ ONLY — it changes nothing. Run:  node scan-rename.js            */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ credential: applicationDefault(), projectId: 'clearsky-portal' });
const db = getFirestore();

const OLD = 'menachem@concordenergyusa.com';
const NEW = 'malcom@concordenergyusa.com';
const UID = 'xFzIiDA2fNSCfMugbZZ1YL08AFE3';

const hits = [];
function hit(sev, where, why, fix) {
  hits.push({ sev, where, why, fix });
  console.log(`${sev === 'break' ? '✖ BREAKS' : '· stale '}  ${where}\n           ${why}`);
}

(async () => {
  /* 1. org_members — doc id IS the lowercased email. A cross-org grant filed
        under the old address stops resolving entirely. */
  const om = await db.doc(`org_members/${OLD}`).get();
  if (om.exists) {
    hit('break', `org_members/${OLD}`,
        `cross-org grant into "${om.data().orgId}" — canActInOrg() looks this up by token email, so it no longer resolves`,
        'recreate under the new address, then delete the old doc');
  }

  /* 2. team_members — doc id is "<orgId>__<email>", and update requires
        resource.data.email == token email. Old doc becomes unwritable, and
        delete is `false` for everyone. */
  const tm = await db.collection('team_members').where('email', '==', OLD).get();
  tm.forEach(d => hit('break', `team_members/${d.id}`,
      'update requires the stored email to match the token; delete is denied to everyone, so this row is now frozen',
      'admin-side rewrite, or leave it and accept a duplicate row'));

  /* 3. team_conversations — membership is an array of EMAILS. Read, update and
        every message under it all test `token.email in members`. */
  const tc = await db.collection('team_conversations')
    .where('members', 'array-contains', OLD).get();
  tc.forEach(d => hit('break', `team_conversations/${d.id}`,
      'he is a member under the old address only — he can no longer read this thread or its messages',
      'swap the old address for the new one inside members[]'));

  /* 4. team_messages — he can no longer delete his own past messages. */
  const tms = await db.collection('team_messages').where('authorEmail', '==', OLD).get();
  if (!tms.empty) hit('stale', `team_messages (${tms.size} docs)`,
      'authored under the old address; he can still read them but can no longer delete his own',
      'cosmetic unless he needs to retract something');

  /* 5. omega_users — uid-keyed, so access is intact, but the stored email is
        stale and `email` is in accessFields(), so he cannot fix it himself. */
  const ou = await db.doc(`omega_users/${UID}`).get();
  if (ou.exists && (ou.data().email || '').toLowerCase() === OLD) {
    hit('stale', `omega_users/${UID}`,
        'portal access still works (keyed on uid) but shows the old address, and self-update of `email` is blocked by accessFields()',
        'admin update — isPortalAdmin() may write it');
  }

  /* 6. Attribution splits — not access failures, but his numbers now sit
        under two names on the rep board. */
  for (const [col, field] of [['sites', 'repEmail'], ['capacityAllocations', 'repEmail']]) {
    const s = await db.collection(col).where(field, '==', OLD).get();
    if (!s.empty) hit('stale', `${col} (${s.size} docs)`,
        `${field} still says the old address — his board totals will split across two names`,
        'safe to rewrite: neither collection pins repEmail on update');
  }

  /* 7. Anything else, by brute force. */
  console.log('\nsweeping remaining collections…');
  for (const col of await db.listCollections()) {
    const skip = ['org_members','team_members','team_conversations','team_messages',
                  'sites','capacityAllocations','omega_users'];
    if (skip.includes(col.id)) continue;
    const snap = await col.limit(500).get();
    snap.forEach(d => {
      if (d.id.includes('menachem') || JSON.stringify(d.data()).includes('menachem')) {
        hit('stale', `${col.id}/${d.id}`, 'mentions the old address', 'review');
      }
    });
  }

  const breaks = hits.filter(h => h.sev === 'break').length;
  console.log(`\n${hits.length} hit(s), ${breaks} of which break access.`);
  if (!hits.length) console.log(`Nothing references ${OLD}. The rename is clean.`);
  else console.log(`New address for reference: ${NEW}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
