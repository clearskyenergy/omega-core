#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/tests/tfirebasedouble.js — the in-memory Firebase compat double
   behaves like the SDK on the paths the dashboard uses. A double that lies
   makes the render check pass on a page that would fail in production, so
   the semantics are pinned here: merge, sentinels, dotted updates, the
   query operators, listeners that fire on change only, batches,
   transactions, refused reads, auth observers. */
'use strict';
var FD = require('../_lib/firebase-double');
var fails = 0, n = 0;
function ok(name, cond, detail) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); } }
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b }); }
var g = {};
var day = 86400000, now = Date.now();
var D = FD.install(g, {
  user: { uid: 'u1', email: 'ann@northstar.example', displayName: 'Ann Lee' },
  popupUser: { uid: 'u2', email: 'bo@northstar.example' },
  accounts: { 'pw@northstar.example': { uid: 'u3', email: 'pw@northstar.example', password: 'secret' } },
  failures: { 'omega_orgs/other.example': 'Missing or insufficient permissions.' },
  docs: {
    'omega_orgs/northstar.example': { name: 'Northstar', status: 'active', createdAt: FD.ts(now - 30 * day), tags: ['a'] },
    'omega_orgs/northstar.example/billing/current': { tier: 'standard', addons: [] },
    'projects/p1': { orgId: 'northstar.example', name: 'One', kw: 500, stage: 'design', createdAt: FD.ts(now - 3 * day), orgsInvolved: ['northstar.example'] },
    'projects/p2': { orgId: 'northstar.example', name: 'Two', kw: 1500, stage: 'permit', createdAt: FD.ts(now - 1 * day), orgsInvolved: ['northstar.example', 'partner.example'] },
    'projects/p3': { orgId: 'other.example', name: 'Three', kw: 900, stage: 'design', createdAt: FD.ts(now - 2 * day) },
    'omega_orgs/other.example': { name: 'Other' }
  }
});
var fb = g.firebase, db = fb.firestore(), auth = fb.auth();
(async function () {
  /* ── reads ── */
  var s = await db.collection('omega_orgs').doc('northstar.example').get();
  ok('doc get: exists, id, data is a copy with a live Timestamp', s.exists && s.id === 'northstar.example' && s.data().name === 'Northstar' && typeof s.data().createdAt.toDate === 'function' && s.data().createdAt.toMillis() === now - 30 * day);
  s.data().tags.push('mutated');
  ok('data() is a copy: mutating it does not touch the store', (await db.doc('omega_orgs/northstar.example').get()).data().tags.length === 1);
  var m = await db.collection('omega_orgs').doc('nope').get();
  ok('missing doc: exists false, data undefined', !m.exists && m.data() === undefined);
  var bill = await db.collection('omega_orgs').doc('northstar.example').collection('billing').doc('current').get();
  ok('subcollection doc reads', bill.exists && bill.data().tier === 'standard');
  var orgs = await db.collection('omega_orgs').get();
  eq('collection get lists only direct documents, not subcollection documents', orgs.docs.map(function (d) { return d.id; }), ['northstar.example', 'other.example']);
  /* ── queries ── */
  var q1 = await db.collection('projects').where('orgId', '==', 'northstar.example').get();
  eq('where ==', q1.docs.map(function (d) { return d.id; }), ['p1', 'p2']);
  var q2 = await db.collection('projects').where('kw', '>=', 900).orderBy('kw', 'desc').get();
  eq('where >= with orderBy desc', q2.docs.map(function (d) { return d.id; }), ['p2', 'p3']);
  var q3 = await db.collection('projects').where('orgsInvolved', 'array-contains', 'partner.example').get();
  eq('array-contains', q3.docs.map(function (d) { return d.id; }), ['p2']);
  var q4 = await db.collection('projects').where('stage', 'in', ['permit', 'build']).get();
  eq('in', q4.docs.map(function (d) { return d.id; }), ['p2']);
  var q5 = await db.collection('projects').orderBy('createdAt', 'desc').limit(2).get();
  eq('orderBy a Timestamp desc with limit', q5.docs.map(function (d) { return d.id; }), ['p2', 'p3']);
  var q6 = await db.collection('projects').where('orgId', '==', 'northstar.example').where('kw', '<', 1000).get();
  eq('two where clauses AND together', q6.docs.map(function (d) { return d.id; }), ['p1']);
  var q7 = await db.collection('projects').where(fb.firestore.FieldPath.documentId(), 'in', ['p3', 'p1']).get();
  eq('FieldPath.documentId() in', q7.docs.map(function (d) { return d.id; }), ['p1', 'p3']);
  var q8 = await db.collection('projects').orderBy('missingField').get();
  ok('orderBy drops documents without the field, as Firestore does', q8.empty);
  var g1 = await db.collectionGroup('billing').get();
  eq('collectionGroup', g1.docs.map(function (d) { return d.ref.path; }), ['omega_orgs/northstar.example/billing/current']);
  var empty = await db.collection('never').where('x', '==', 1).get();
  ok('an empty query snapshot: empty, size 0, forEach is a no-op', empty.empty && empty.size === 0 && (function () { var c = 0; empty.forEach(function () { c++; }); return c === 0; })());
  /* ── writes ── */
  var FV = fb.firestore.FieldValue, ref = db.collection('projects').doc('p1');
  await ref.set({ stage: 'permit', meta: { touched: FV.serverTimestamp() }, tags: FV.arrayUnion('x', 'y'), n: FV.increment(2) }, { merge: true });
  var p1 = (await ref.get()).data();
  ok('set merge keeps other fields, resolves serverTimestamp, arrayUnion and increment', p1.name === 'One' && p1.stage === 'permit' && typeof p1.meta.touched.toDate === 'function' && JSON.stringify(p1.tags) === '["x","y"]' && p1.n === 2);
  await ref.set({ tags: FV.arrayUnion('x', 'z'), n: FV.increment(3), kw: FV['delete']() }, { merge: true });
  p1 = (await ref.get()).data();
  ok('arrayUnion skips what is there, increment adds, FieldValue.delete removes', JSON.stringify(p1.tags) === '["x","y","z"]' && p1.n === 5 && !('kw' in p1));
  await ref.update({ 'meta.owner': 'ann', tags: FV.arrayRemove('y') });
  p1 = (await ref.get()).data();
  ok('update with a dotted path sets a nested field and keeps siblings; arrayRemove', p1.meta.owner === 'ann' && typeof p1.meta.touched.toDate === 'function' && JSON.stringify(p1.tags) === '["x","z"]');
  await ref.set({ name: 'Replaced' });
  ok('set without merge replaces the document', JSON.stringify((await ref.get()).data()) === '{"name":"Replaced"}');
  var upd = await db.collection('projects').doc('missing').update({ a: 1 }).then(function () { return 'resolved'; }, function (e) { return e.code; });
  ok('update on a missing document rejects (not-found), as Firestore does', upd === 'not-found');
  var added = await db.collection('team_todos').add({ orgId: 'northstar.example', text: 'call', createdAt: FV.serverTimestamp() });
  ok('add returns a ref with a generated id and the doc exists', added.id.length === 20 && (await added.get()).exists);
  await added['delete']();
  ok('delete removes it', !(await added.get()).exists);
  var writes = D.store.log.map(function (w) { return w.op; });
  eq('every write is logged in order', writes, ['set', 'set', 'update', 'set', 'add', 'delete']);
  /* ── listeners ── */
  var fired = [], unsub = db.collection('team_todos').where('orgId', '==', 'northstar.example').onSnapshot(function (snap) { fired.push(snap.size); });
  await new Promise(function (r) { setTimeout(r, 5); });
  eq('a query listener fires once with the current result', fired, [0]);
  var t1 = await db.collection('team_todos').add({ orgId: 'northstar.example', text: 'a' });
  await db.collection('team_todos').add({ orgId: 'someone.else', text: 'b' });
  await new Promise(function (r) { setTimeout(r, 5); });
  eq('it fires again only when its own result changes', fired, [0, 1]);
  await t1.update({ text: 'a2' });
  await new Promise(function (r) { setTimeout(r, 5); });
  eq('a modified document fires it too', fired, [0, 1, 1]);
  unsub();
  await t1['delete']();
  await new Promise(function (r) { setTimeout(r, 5); });
  eq('after unsubscribe nothing fires', fired, [0, 1, 1]);
  var docFired = [], unsub2 = db.doc('omega_orgs/northstar.example').onSnapshot(function (s) { docFired.push(s.data().name); });
  await new Promise(function (r) { setTimeout(r, 5); });
  await db.doc('omega_orgs/northstar.example').update({ status: 'active' });   /* same value: no change */
  await db.doc('omega_orgs/northstar.example').update({ name: 'Northstar Energy' });
  await new Promise(function (r) { setTimeout(r, 5); });
  eq('a document listener fires on the first read and on a real change, not on a no-op write', docFired, ['Northstar', 'Northstar Energy']);
  unsub2();
  /* ── batch and transaction ── */
  var b = db.batch();
  b.set(db.doc('tools/a'), { sort: 2, key: 'a' }); b.set(db.doc('tools/b'), { sort: 1, key: 'b' }); b.update(db.doc('projects/p2'), { stage: 'build' }); b['delete'](db.doc('projects/p3'));
  await b.commit();
  var tools = await db.collection('tools').orderBy('sort').get();
  ok('batch commit applies every op', tools.docs.map(function (d) { return d.id; }).join() === 'b,a' && (await db.doc('projects/p2').get()).data().stage === 'build' && !(await db.doc('projects/p3').get()).exists);
  var tx = await db.runTransaction(function (t) { return t.get(db.doc('projects/p2')).then(function (s) { t.update(db.doc('projects/p2'), { kw: s.data().kw + 1 }); return 'done'; }); });
  ok('runTransaction reads, writes and returns the function\'s value', tx === 'done' && (await db.doc('projects/p2').get()).data().kw === 1501);
  /* ── refusals ── */
  var refused = await db.doc('omega_orgs/other.example').get().then(function () { return 'read'; }, function (e) { return e.code; });
  ok('a path listed under failures rejects like a rules refusal', refused === 'permission-denied');
  var soft = await db.doc('omega_orgs/other.example').get().then(function (s) { return s; }, function () { return { exists: false }; });
  ok('so the soft() pattern in omega-tenant.js sees exists:false', soft.exists === false);
  /* ── auth ── */
  var seen = [];
  auth.onAuthStateChanged(function (u) { seen.push(u ? u.email : null); });
  await new Promise(function (r) { setTimeout(r, 5); });
  eq('an observer is called with the signed-in user', seen, ['ann@northstar.example']);
  ok('the user carries a token, a display name and emailVerified', (await auth.currentUser.getIdToken()).indexOf('double-token') === 0 && auth.currentUser.displayName === 'Ann Lee' && auth.currentUser.emailVerified === true);
  await auth.signOut();
  await new Promise(function (r) { setTimeout(r, 5); });
  eq('signOut clears currentUser and notifies', [auth.currentUser, seen[1]], [null, null]);
  var prov = new fb.auth.GoogleAuthProvider(); prov.setCustomParameters({ prompt: 'select_account' });
  await auth.signInWithPopup(prov);
  await new Promise(function (r) { setTimeout(r, 5); });
  ok('signInWithPopup becomes the popup user and records the provider params', auth.currentUser.email === 'bo@northstar.example' && seen[2] === 'bo@northstar.example' && auth.log.some(function (l) { return l.op === 'popup' && l.params.prompt === 'select_account'; }));
  var bad = await auth.signInWithEmailAndPassword('pw@northstar.example', 'wrong').then(function () { return 'in'; }, function (e) { return e.code; });
  var good = await auth.signInWithEmailAndPassword('pw@northstar.example', 'secret').then(function (r) { return r.user.email; });
  ok('password sign-in refuses a wrong password with the SDK\'s code and admits the right one', bad === 'auth/wrong-password' && good === 'pw@northstar.example');
  ok('EmailAuthProvider.credential and the Persistence constants exist for the sign-in card', typeof fb.auth.EmailAuthProvider.credential === 'function' && fb.auth.Auth.Persistence.LOCAL === 'local');
  /* ── app ── */
  fb.initializeApp({ projectId: 'x' });
  var dup = null; try { fb.initializeApp({ projectId: 'x' }); } catch (e) { dup = e.message; }
  ok('initializeApp twice throws the "already exists" the pages test for', /already exists/.test(dup) && fb.apps.length === 1);
  ok('storage() refuses without throwing at construction', typeof fb.storage().ref('x/y').put === 'function');
  console.log((fails ? fails + ' of ' : 'all ') + n + ' firebase-double checks ' + (fails ? 'FAILED' : 'passed'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
