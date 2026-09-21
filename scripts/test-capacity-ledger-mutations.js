/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert');
var vm = require('vm');
var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(__dirname, '..', 'omega-capacity-ledger.js'), 'utf8');
function setup() {
  var ctx = { setTimeout: function () {}, console: console };
  vm.runInNewContext(source, ctx);
  var l = ctx.OmegaLedger, writes = [], listeners = [];
  var db = { collection: function (name) { return {
    doc: function () { return { set: function (doc) {
      return new Promise(function (resolve, reject) { writes.push({ doc: doc, resolve: resolve, reject: reject }); });
    } }; },
    where: function () { return { onSnapshot: function (options, success, error) {
      if (typeof options === 'function') { error = success; success = options; }
      if (name === 'capacityAllocations') listeners.push({ success: success, error: error });
      return function () {};
    } }; }
  }; } };
  function snapshot(rows, metadata) {
    listeners[listeners.length - 1].success({ metadata: metadata || { fromCache: false, hasPendingWrites: false }, forEach: function (fn) {
      rows.forEach(function (r) { fn({ data: function () { return r; } }); });
    } });
  }
  l.setFeeder('f', { nameplate: 100 });
  l.setIdentity('u', 'u@example.com'); l.attach(db, 'example.com');
  return { l: l, writes: writes, listeners: listeners, snapshot: snapshot, db: db };
}
function hold(id, kw, expiry) {
  return { id: 'f__' + id, feederId: 'f', siteId: id, kw: kw, kwh: kw * 2, status: 'reserved', expiresAt: expiry, createdAt: 1 };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
async function run() {
  var t = setup(), l = t.l, error, future = Date.now() + 86400000;
  assert.equal(l.mode(), 'local', 'attach alone is not shared');
  t.snapshot([]); assert.equal(l.mode(), 'shared');
  l.reserve({ feederId: 'f', siteId: 'a', kw: 40 }, function (e, rec) { error = e; if (e) assert.equal(rec, null); });
  assert.equal(l.feederState('f').soft, 40);
  t.snapshot([t.writes[0].doc], { hasPendingWrites: true, fromCache: false });
  t.writes[0].reject(new Error('permission-denied')); await flush();
  assert.ok(error); assert.equal(l.all().length, 0); assert.equal(l.mode(), 'local');
  t.snapshot([]); assert.equal(l.mode(), 'local', 'read success cannot erase a write denial');

  var original = hold('a', 40, future);
  t.snapshot([original]);
  l.release(original.id, function (e) { error = e; });
  assert.equal(original.status, 'reserved', 'release must not mutate previous record');
  assert.equal(l.feederState('f').soft, 0);
  var calls = t.writes.length;
  l.renew(original.id, 2, function (e) { assert.ok(e); });
  assert.equal(t.writes.length, calls, 'overlap must not start another write');
  t.writes[1].reject(new Error('offline')); await flush();
  assert.equal(l.feederState('f').soft, 40);
  l.renew(original.id, 3, function (e) { error = e; });
  assert.ok(l.all()[0].expiresAt > future);
  t.writes[2].reject(new Error('denied')); await flush();
  assert.equal(l.all()[0].expiresAt, future, 'failed renewal restores expiry');

  t.snapshot([hold('a', 80, Date.now() - 1), hold('b', 70, future)]);
  assert.equal(l.feederState('f', 'a').mine, 0);
  assert.equal(l.feederState('f', 'a').lapsed, 80);
  l.renew('f__a', 30, function (e) { assert.equal(e.code, 'OVERSELL'); });
  l.reserve({ feederId: 'f', siteId: 'a', kw: 30 }, function (e) { error = e; });
  assert.equal(l.feederState('f').soft, 100);
  assert.ok(l.allocationsForSite('a')[0].expiresAt > Date.now(), 'resized expired hold gets new expiry');
  t.writes[3].resolve(); await flush(); assert.ifError(error);
  t.snapshot([hold('a', 30, future), hold('b', 70, future)]);
  l.reserve({ feederId: 'f', siteId: 'a', kw: 20 }, function (e) { error = e; });
  assert.equal(l.feederState('f').soft, 90, 'live own hold excluded when resizing');
  t.writes[4].reject(new Error('denied')); await flush();
  assert.equal(l.feederState('f').soft, 100, 'failed resize restores size');

  t.listeners[t.listeners.length - 1].error(new Error('permission-denied'));
  assert.equal(l.mode(), 'local');
  l.setIdentity('', ''); assert.equal(l.mode(), 'local');
  calls = t.writes.length;
  l.release('f__a', function (e) { assert.ok(e); });
  assert.equal(t.writes.length, calls, 'signed out does not write');
  assert.equal(l.allocationsForSite('a')[0].status, 'reserved');

  t = setup(); l = t.l; t.snapshot([]);
  l.reserve({ feederId: 'f', siteId: 'a', kw: 20 }, function (e) { error = e; });
  var oldListener = t.listeners[0];
  l.attach(t.db, 'other.example'); t.snapshot([]);
  oldListener.success({ forEach: function (fn) { fn({ data: function () { return original; } }); } });
  t.writes[0].reject(new Error('late denial')); await flush();
  assert.equal(l.all().length, 0, 'old session callbacks do not restore old tenant claims');

  t = setup(); l = t.l; t.snapshot([]);
  l.reserve({ feederId: 'f', siteId: 'a', kw: 20 }, function () {});
  var remote = hold('a', 15, future);
  t.snapshot([remote]);
  assert.equal(l.all()[0].kw, 20, 'pending overlay survives authoritative snapshots');
  t.writes[0].reject(new Error('denied')); await flush();
  assert.equal(l.all()[0].kw, 15, 'rollback uses newest authoritative record');
  l.renew('f__a', 4, function (e) { error = e; });
  t.writes[1].resolve(); await flush(); assert.ifError(error);
  assert.ok(l.all()[0].expiresAt > future);
  l.release('f__a', function (e) { error = e; });
  t.writes[2].resolve(); await flush(); assert.ifError(error);
  assert.equal(l.feederState('f').soft, 0);
  calls = t.writes.length;
  l.renew('f__a', 1, function (e) { assert.ok(e); });
  assert.equal(t.writes.length, calls, 'released claims cannot be renewed');

  t = setup(); l = t.l; t.snapshot([]);
  var collection = t.db.collection;
  t.db.collection = function (name) {
    if (name === 'capacityAllocations') throw new Error('synchronous SDK failure');
    return collection(name);
  };
  error = null;
  l.reserve({ feederId: 'f', siteId: 'a', kw: 20 }, function (e) { error = e; });
  assert.ok(error); assert.equal(l.all().length, 0, 'synchronous failures roll back too');

  t = setup(); l = t.l; t.snapshot([]);
  l.reserve({ feederId: 'f', siteId: 'a', kw: 20 }, function () {});
  error = null;
  l.reserve({ feederId: 'f', siteId: 'a', kw: 30 }, function (e) { error = e; });
  assert.ok(error); assert.equal(t.writes.length, 1); assert.equal(l.all()[0].kw, 20);
  t.writes[0].resolve(); await flush();
  console.log('Capacity mutation tests passed: rollback, snapshots, identity, expiry, resizing, renewal and session isolation.');
}
run().catch(function (err) { console.error(err); process.exitCode = 1; });
