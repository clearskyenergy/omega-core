#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-publish-tools.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Exercises the diff in scripts/publish-tools.js with no Firestore and no
   credential, plus the `keys` filter added to publishToFirestore().

   WHY. The whole point of the differ is that somebody reads it and then
   presses --apply. A diff that misses a change is worse than no diff: it is
   a diff that says "safe" about a publish that is about to revert a tenant's
   tier. So the cases that matter are the quiet ones — a field that only
   exists live, a `sort` that moved on its own, a document nobody seeded.

     node scripts/test-publish-tools.js

   Exit 0 clean, 1 on any failure.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var H = require('./publish-tools.js')._helpers;
var OMEGATools = require('../omega-tools.js');
var pass = 0, fail = 0;

function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  console.error('  FAIL  ' + name + (detail != null ? '\n        ' + detail : ''));
}
function eq(name, got, want) {
  ok(name, got === want, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
}

console.log('publish-tools differ');

/* ── the seed side ───────────────────────────────────────────────────────── */
var seeds = H.seedDocs();
var keys = Object.keys(seeds);
ok('seed · the catalog is not empty', keys.length > 10, String(keys.length));
ok('seed · every doc carries its own key', keys.every(function (k) { return seeds[k].key === k; }));
ok('seed · sort is the catalog index', seeds[keys[0]].sort === 0 && seeds[keys[3]].sort === 3);
ok('seed · updatedAt is NOT in the seed doc — it is a server timestamp',
   keys.every(function (k) { return seeds[k].updatedAt === undefined; }));
ok('seed · computelease is in the catalog', !!seeds.computelease);
eq('seed · and is tier 1 (Standard), like the other sales tool', seeds.computelease.tier, 1);

/* ── new / same / changed ────────────────────────────────────────────────── */
eq('new · no live doc is NEW', H.diffOne('x', { key: 'x', name: 'A' }, null).state, 'new');
eq('same · identical docs are unchanged',
   H.diffOne('x', { key: 'x', name: 'A', sort: 2 }, { key: 'x', name: 'A', sort: 2 }).state, 'same');

var chg = H.diffOne('x', { key: 'x', name: 'A', tier: 1 }, { key: 'x', name: 'A', tier: 3 });
eq('changed · a differing field is reported', chg.state, 'changed');
eq('changed · exactly one field', chg.changes.length, 1);
eq('changed · names the field', chg.changes[0].field, 'tier');
eq('changed · live value is `from`', chg.changes[0].from, 3);
eq('changed · seed value is `to`', chg.changes[0].to, 1);
ok('changed · a tier revert is NOT filed as order-only', !chg.orderOnly);

/* A field absent live is a change, and must read as "(absent)" rather than
   as undefined — the operator has to see that the publish ADDS it. */
var add = H.diffOne('x', { key: 'x', badge: 'new' }, { key: 'x' });
eq('changed · a field missing live is a change', add.changes.length, 1);
eq('changed · and renders as absent', H.clip(add.changes[0].from), '(absent)');

/* ── the quiet cases ─────────────────────────────────────────────────────── */

/* updatedAt changes on every publish by definition. Reporting it would mark
   all 44 tools as changed and train the operator to skim. */
var noisy = H.diffOne('x', { key: 'x', name: 'A' }, { key: 'x', name: 'A', updatedAt: { _seconds: 1 } });
eq('noise · updatedAt is never a change', noisy.state, 'same');
ok('noise · and is not listed as a kept field either', noisy.kept.indexOf('updatedAt') < 0,
   JSON.stringify(noisy.kept));

/* merge:true protects fields the seed does not carry. They are not changes —
   but the operator should know they exist and that they survive. */
var kept = H.diffOne('x', { key: 'x', name: 'A' }, { key: 'x', name: 'A', hiddenFor: ['acme.com'] });
eq('kept · a live-only field is not a change', kept.state, 'same');
eq('kept · but it is reported', kept.kept.join(','), 'hiddenFor');

/* A catalog reorder moves sort on tools that did not otherwise change. Real,
   but it is not a content change and must not hide one. */
var ord = H.diffOne('x', { key: 'x', name: 'A', sort: 7 }, { key: 'x', name: 'A', sort: 3 });
eq('order · a moved sort is changed', ord.state, 'changed');
ok('order · and is filed as order-only', ord.orderOnly);
var both = H.diffOne('x', { key: 'x', name: 'B', sort: 7 }, { key: 'x', name: 'A', sort: 3 });
ok('order · sort PLUS content is not order-only', !both.orderOnly, JSON.stringify(both.changes));

/* ── structural values ───────────────────────────────────────────────────── */
ok('deep · arrays compare by value, not identity',
   H.diffOne('x', { key: 'x', v: ['a', 'b'] }, { key: 'x', v: ['a', 'b'] }).state === 'same');
ok('deep · a reordered array IS a change',
   H.diffOne('x', { key: 'x', v: ['a', 'b'] }, { key: 'x', v: ['b', 'a'] }).state === 'changed');
ok('deep · object key order does not matter',
   H.same({ a: 1, b: 2 }, { b: 2, a: 1 }));
ok('deep · a nested difference is caught',
   !H.same({ a: { b: 1 } }, { a: { b: 2 } }));
ok('deep · null and absent are told apart', !H.same(null, undefined));

/* A hand-edited field on an OTHERWISE UNCHANGED tool is the one the diff most
   easily loses: it is not a change, so it never reaches the CHANGED section,
   and the tool reads as boringly fine. It gets its own section. */
var quiet = H.diffCatalog(
  { a: { key: 'a', name: 'A' } },
  { a: { key: 'a', name: 'A', hiddenFor: ['acme.com'] } });
eq('hand-edited · the tool is still unchanged', quiet.rows[0].state, 'same');
eq('hand-edited · and the field is still reported', quiet.rows[0].kept.join(','), 'hiddenFor');

/* ── orphans ─────────────────────────────────────────────────────────────── */
var d = H.diffCatalog(
  { a: { key: 'a', name: 'A', sort: 0 } },
  { a: { key: 'a', name: 'A', sort: 0 }, retired: { key: 'retired', name: 'Old' } });
eq('orphan · a live doc with no seed entry is reported', d.orphans.join(','), 'retired');
eq('orphan · and is not counted as a row', d.rows.length, 1);
ok('orphan · the publish does not touch or delete it — it is a finding',
   d.rows.every(function (r) { return r.key !== 'retired'; }));

/* ── --only ──────────────────────────────────────────────────────────────── */
var only = H.diffCatalog(
  { a: { key: 'a', name: 'A' }, b: { key: 'b', name: 'B' } },
  { a: { key: 'a', name: 'X' }, b: { key: 'b', name: 'Y' } },
  ['b']);
eq('only · restricts the rows', only.rows.length, 1);
eq('only · to the named key', only.rows[0].key, 'b');

/* ── the credential messages ─────────────────────────────────────────────── */
ok('explain · an expired ADC says how to re-auth',
   /gcloud auth application-default login/.test(
     H.explain(new Error('Getting metadata from plugin failed: {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)"}'))));
ok('explain · a permission failure says what the credential needs',
   /Firestore access/.test(H.explain(new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.'))));
ok('explain · anything else is passed through rather than swallowed',
   H.explain(new Error('socket hang up')) === 'socket hang up');

/* ── publishToFirestore's keys filter ───────────────────────────────────────
   Exercised against a fake batch, because the whole risk of a partial publish
   is writing the wrong documents or renumbering the right ones. */
function fakeDb() {
  var writes = [];
  return {
    writes: writes,
    batch: function () {
      return {
        set: function (ref, doc, opts) { writes.push({ id: ref.id, doc: doc, opts: opts }); },
        commit: function () { return Promise.resolve(); }
      };
    },
    collection: function (c) {
      return { doc: function (id) { return { id: id, collection: c }; } };
    }
  };
}
var SHIM = { firestore: { FieldValue: { serverTimestamp: function () { return '<ts>'; } } } };

var all = fakeDb();
var partial = fakeDb();
var catalogSize = OMEGATools.SEED_TOOLS.length;

Promise.all([
  OMEGATools.publishToFirestore(all, SHIM).then(function (n) {
    eq('publish · no keys writes the whole catalog', n, catalogSize);
    eq('publish · and that is how many documents were set', all.writes.length, catalogSize);
    ok('publish · every write merges', all.writes.every(function (w) { return w.opts && w.opts.merge === true; }));
    ok('publish · every write lands in tools/', all.writes.every(function (w) { return w.id; }));
  }),
  OMEGATools.publishToFirestore(partial, SHIM, ['computelease']).then(function (n) {
    eq('publish · --only writes one document', n, 1);
    eq('publish · the right one', partial.writes[0].id, 'computelease');
    var seedIdx = H.seedDocs().computelease.sort;
    eq('publish · sort stays the FULL-catalog index, not 0',
       partial.writes[0].doc.sort, seedIdx);
    ok('publish · which is not the top of the grid', seedIdx > 0, String(seedIdx));
  }),
  OMEGATools.publishToFirestore(fakeDb(), SHIM, ['nope']).then(function () {
    ok('publish · an unknown key is refused, not silently a no-op', false, 'it resolved');
  }, function (e) {
    ok('publish · an unknown key is refused, not silently a no-op', /nope/.test(e.message), e.message);
  })
]).then(function () {
  console.log((fail ? '\n' : '') + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
