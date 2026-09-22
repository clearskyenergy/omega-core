/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm');
var source = fs.readFileSync(require('node:path').join(__dirname, '../omega-site-saves.js'), 'utf8');
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function fixture() {
  var data = {}, storage = {}, streams = [], requests = [], queryGate = null, rejectWrite = false;
  function snap(id, value) { return { id: id, exists: !!value, data: function () { return clone(value); } }; }
  function query(org) {
    var rows = Object.keys(data).filter(function (k) { return k.indexOf('sites/') === 0 && data[k].orgId === org; });
    return { metadata: { fromCache: false }, forEach: function (fn) {
      rows.forEach(function (k) { fn(snap(k.slice(6), data[k])); });
    } };
  }
  function emit() { streams.forEach(function (s) {
    if (s.closed) return;
    s.fn(s.org ? query(s.org) : snap('sitefinder', data[s.path]));
  }); }
  function ref(path) {
    return {
      path: path,
      collection: function (c) { return collection(path + '/' + c); },
      onSnapshot: function (fn, error) {
        var s = { path: path, fn: fn, error: error }; streams.push(s);
        fn(snap('sitefinder', data[path])); return function () { s.closed = true; };
      }
    };
  }
  function collection(path) {
    return { doc: function (id) { return ref(path + '/' + id); },
      where: function (field, op, org) {
        assert.equal(field, 'orgId'); assert.equal(op, '=='); assert.ok(org);
        return {
          get: function (opts) {
            assert.equal(opts.source, 'server');
            return queryGate ? queryGate.then(function () { return query(org); }) : Promise.resolve(query(org));
          },
          onSnapshot: function (opts, fn, error) {
            assert.equal(opts.includeMetadataChanges, true);
            var s = { org: org, fn: fn, error: error }; streams.push(s); fn(query(org));
            return function () { s.closed = true; };
          }
        };
      }
    };
  }
  var db = {
    app: { options: { projectId: 'test-project' } }, collection: collection,
    runTransaction: function (fn) {
      var writes = [];
      return Promise.resolve().then(function () { return fn({
        get: function (r) {
          if (r.path.indexOf('sites/') === 0 && !data[r.path])
            return Promise.reject(new Error('Rules deny a missing sites document get'));
          return Promise.resolve(snap(r.path, data[r.path]));
        },
        update: function (r, patch) { writes.push(function () { Object.assign(data[r.path], clone(patch)); }); },
        set: function (r, patch) { writes.push(function () {
          var old = data[r.path] || {};
          data[r.path] = Object.assign({}, old, clone(patch), { data: Object.assign({}, old.data, clone(patch.data)) });
        }); }
      }); }).then(function (result) {
        if (rejectWrite) throw new Error('permission-denied');
        writes.forEach(function (w) { w(); }); emit(); return result;
      });
    }
  };
  function decode(v) {
    if ('nullValue' in v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
    var out = {}; Object.keys(v.mapValue.fields).forEach(function (k) { out[k] = decode(v.mapValue.fields[k]); }); return out;
  }
  var root = { console: { error: function () {}, warn: function () {} },
    localStorage: { getItem: function (k) { return storage[k] || null; },
      setItem: function (k, v) { storage[k] = v; } },
    fetch: function (url, opts) {
      requests.push({ url: url, opts: opts });
      assert.equal(opts.headers.Authorization, 'Bearer test-token');
      var id = new URL(url).searchParams.get('documentId'), path = 'sites/' + id;
      if (data[path]) return Promise.resolve({ ok: false, status: 409,
        json: function () { return Promise.resolve({ error: { message: 'ALREADY_EXISTS' } }); } });
      if (rejectWrite) return Promise.resolve({ ok: false, status: 403,
        json: function () { return Promise.resolve({ error: { message: 'permission-denied' } }); } });
      data[path] = decode({ mapValue: JSON.parse(opts.body) }); emit();
      return Promise.resolve({ ok: true });
    }
  };
  vm.runInNewContext(source, { window: root, Promise: Promise, Date: Date });
  return { s: root.OmegaSiteSaves, db: db, data: data, storage: storage, root: root,
    streams: streams, requests: requests, emit: emit,
    gate: function (p) { queryGate = p; }, reject: function (v) { rejectWrite = v; } };
}
function user(uid, org) {
  return { uid: uid || 'u', email: (uid || 'u') + '@' + (org || 'a.com'),
    getIdToken: function () { return Promise.resolve('test-token'); } };
}
function call(obj, method) {
  var args = Array.prototype.slice.call(arguments, 2);
  return new Promise(function (resolve) {
    args.push(function (err, value) { resolve({ err: err, value: value }); });
    obj[method].apply(obj, args);
  });
}
test('explicit legacy restore preserves original bytes and full cards, skips duplicates and foreign scopes', async function () {
  var f = fixture(); await start(f);
  var card = {id:'old-star', lat:41.8, lon:-87.7, addr:'Original building', starred:true,
    sizePick:{kw:250,hours:4}, service:{phase:'3',confirmed:true,src:'visit'},
    customCard:{untouched:['owner','feeder']}, estimate:{total:1234}};
  var raw = JSON.stringify([card, {id:'foreign',orgId:'b.com',starred:true}]);
  f.storage['cs.savedSites'] = raw;
  assert.equal(f.s.list().length, 0);
  assert.equal(f.s.legacyList().length, 1);
  assert.equal((await call(f.s,'restoreLegacy','b.com')).err.code, 'NOT_SCOPED');
  var restored = await call(f.s,'restoreLegacy','a.com');
  assert.equal(restored.err, null); assert.equal(restored.value.created, 1);
  assert.equal(f.storage['cs.savedSites'], raw);
  assert.ok(Object.keys(f.storage).some(function(k){return k.indexOf('cs.savedSites.backup:')===0 && f.storage[k]===raw;}));
  assert.deepEqual(clone(f.s.get('old-star').legacyRecord), card);
  assert.deepEqual(clone(f.s.get('old-star').customCard), card.customCard);
  assert.equal(f.s.get('old-star').sizePick.kw,250);
  assert.equal((await call(f.s,'restoreLegacy','a.com')).value.skipped,1);
  assert.equal(f.s.list().length,1);
});
test('failed backup prevents all legacy recovery writes', async function () {
  var f=fixture(); await start(f);
  f.storage['cs.savedSites']='[{"id":"old","starred":true}]';
  f.root.localStorage.setItem=function(){throw new Error('storage full');};
  assert.ok((await call(f.s,'restoreLegacy','a.com')).err);
  assert.equal(f.requests.length,0);
  assert.equal(f.storage['cs.savedSites'],'[{"id":"old","starred":true}]');
});
async function start(f, org, uid, local) {
  return new Promise(function (resolve) {
    f.s.init(org || 'a.com', user(uid, org), function (err, value) { resolve({ err: err, value: value }); }, local ? null : f.db);
  });
}
test('atomic create succeeds without reading nonexistent document and reload preserves all estimate fields', async function () {
  var f = fixture(); await start(f);
  var estimate = { total: 2, financial: { stack: [{ x: 1 }], netCostUsd: 1, paybackYears: 4 },
    sourcing: { rate: 'quote' }, hours: 4, accuracy: 'screening', exposures: ['x'], estimateClassWhy: 'test' };
  var r = await call(f.s, 'save', { lat: 41, lon: -87, estimate: estimate, owner: { phone: '123' } });
  assert.equal(r.err, null); assert.equal(f.requests.length, 1);
  await start(f); assert.deepEqual(clone(f.s.get('site:41.00000,-87.00000').estimate), estimate);
  assert.equal(f.s.get('site:41.00000,-87.00000').owner.phone, '123');
});
test('existing parcel and arbitrary document IDs are reused; stage, edits, attribution and notes survive', async function () {
  var f = fixture();
  f.data['sites/legacy-key'] = { orgId: 'a.com', pin: '123', status: 'proposal',
    repEmail: 'colleague@a.com', address: 'Human correction', edits: { address: true },
    notes: [{ t: 'before' }] };
  await start(f);
  var r = await call(f.s, 'save', { id: 's', pin: '123', addr: 'Scraped', status: 'target', note: 'after' });
  assert.equal(r.err, null); assert.equal(Object.keys(f.data).length, 1);
  var d = f.data['sites/legacy-key'];
  assert.equal(d.siteId, 's'); assert.equal(d.status, 'proposal'); assert.equal(d.address, 'Human correction');
  assert.equal(d.repEmail, 'colleague@a.com'); assert.equal(d.notes.length, 2);
  await call(f.s, 'patch', 's', { size: { kw: 10, hours: 2 }, note: 'third' });
  assert.equal(d.notes.length, 3); assert.equal(d.size.kw, 10);
  await call(f.s, 'remove', 's', { note: 'unstar' });
  assert.equal(d.saved, false); assert.equal(d.status, 'proposal'); assert.equal(d.notes.length, 4);
});
test('updates read current server state, preserve attribution and explicit nulls without re-starring', async function () {
  var f = fixture(); await start(f); await call(f.s, 'save', { id: 's' });
  await call(f.s, 'remove', 's');
  f.data['sites/a.com__s'].status = 'won';
  var r = await call(f.s, 'patch', 's', { phase: null, size: null, market: { owner: { name: 'A' } } });
  assert.equal(r.err, null); assert.equal(r.value.status, 'won'); assert.equal(r.value.saved, false);
  assert.equal(r.value.service, null); assert.equal(r.value.sizePick, null);
  assert.equal(r.value.market.owner.name, 'A');
  for (var field of ['repEmail', 'orgId', 'siteId', 'createdAt', 'saved', 'notes']) {
    var patch = {}; patch[field] = field === 'notes' ? [] : 'x';
    assert.ok((await call(f.s, 'patch', 's', patch)).err, field);
  }
});
test('ambiguous keys fail closed and never duplicate a CRM parcel', async function () {
  var f = fixture();
  f.data['sites/one'] = { orgId: 'a.com', siteId: 's', status: 'target' };
  f.data['sites/two'] = { orgId: 'a.com', pin: '123', status: 'won' };
  await start(f);
  assert.equal((await call(f.s, 'save', { id: 's', pin: '123' })).err.code, 'AMBIGUOUS_SITE');
  assert.equal(f.requests.length, 0);
});
test('local namespace is org AND uid; legacy unscoped rows are not visible or imported', async function () {
  var f = fixture(); f.storage['cs.savedSites'] = JSON.stringify([{ id: 'secret', starred: true }]);
  await start(f, 'a.com', 'one', true);
  assert.equal(f.s.list().length, 0);
  assert.equal((await call(f.s, 'save', { id: 's' })).err.code, 'LOCAL_ONLY');
  await call(f.s, 'patch', 's', { phase: null, size: null });
  await call(f.s, 'remove', 's', { note: 'offline' });
  assert.equal(f.s.get('s').notes[0].t, 'offline'); assert.equal(f.s.isSaved('s'), false);
  await start(f, 'a.com', 'two', true); assert.equal(f.s.list().length, 0);
  await start(f, 'b.com', 'one', true); assert.equal(f.s.get('s'), null);
  f.s.detach(); assert.equal(f.s.get('s'), null);
  assert.equal((await call(f.s, 'save', { id: 'x' })).err.code, 'NOT_SCOPED');
  await start(f, 'a.com', 'one');
  var migration = await call(f.s, 'migrate');
  assert.equal(migration.value.ignoredLegacy, 1); assert.equal(migration.value.created, 0);
});
test('local storage absence and quota errors never claim persistence', async function () {
  var f = fixture(); await start(f, 'a.com', 'u', true);
  f.root.localStorage.setItem = function () { throw new Error('quota'); };
  assert.equal((await call(f.s, 'save', { id: 's' })).err.code, 'LOCAL_WRITE');
  assert.equal(f.s.list().length, 0);
  delete f.root.localStorage;
  assert.equal((await call(f.s, 'save', { id: 's' })).err.code, 'LOCAL_WRITE');
});
test('late queries, stream callbacks and completions cannot cross auth epochs; callbacks fire once', async function () {
  var f = fixture(); await start(f);
  var old = f.streams.slice(), release, calls = 0, error;
  f.gate(new Promise(function (r) { release = r; }));
  f.s.save({ id: 'old' }, function (e) { calls++; error = e; });
  await start(f, 'b.com', 'other');
  release(); await new Promise(function (r) { setImmediate(r); });
  old.forEach(function (s) { s.fn({ exists: true, data: function () { return { data: { searches: [{ id: 'secret' }] } }; },
    forEach: function (fn) { fn({ id: 'old', data: function () { return { orgId: 'a.com', siteId: 'secret' }; } }); } }); });
  assert.equal(calls, 1); assert.equal(error.code, 'SESSION_CHANGED');
  assert.equal(f.requests.length, 0); assert.equal(f.s.list().length, 0); assert.equal(f.s.searches.list().length, 0);
});
test('throwing consumers do not turn successful persistence into a second callback', async function () {
  var f = fixture(); await start(f); var calls = 0;
  f.s.save({ id: 's' }, function () { calls++; throw new Error('consumer'); });
  await new Promise(function (r) { setImmediate(r); });
  assert.equal(calls, 1); assert.ok(f.data['sites/a.com__s']);
});
test('search transactions preserve other tool data and failures do not update the visible list', async function () {
  var f = fixture();
  f.data['toolData/a.com/tools/sitefinder'] = { data: { filters: { x: 1 }, searches: [{ id: 'old', name: 'Old' }] } };
  await start(f);
  var r = await call(f.s.searches, 'save', { id: 'new', name: 'New', alertFrequency: 'daily' });
  assert.equal(r.err, null); assert.equal(r.value.alert.delivered, false);
  assert.equal(f.s.searches.list().length, 2);
  assert.equal(f.data['toolData/a.com/tools/sitefinder'].data.filters.x, 1);
  f.reject(true);
  assert.ok((await call(f.s.searches, 'remove', 'old')).err);
  assert.equal(f.s.searches.list().length, 2);
});
test('local searches survive reload and stay isolated', async function () {
  var f = fixture(); await start(f, 'a.com', 'u', true);
  assert.equal((await call(f.s.searches, 'save', { id: 's', filters: { x: 1 } })).err.code, 'LOCAL_ONLY');
  await start(f, 'a.com', 'u', true); assert.equal(f.s.searches.get('s').filters.x, 1);
  await start(f, 'a.com', 'other', true); assert.equal(f.s.searches.list().length, 0);
});
test('migration is nondestructive, idempotent, retries failures, and preserves existing records', async function () {
  var f = fixture(); await start(f, 'a.com', 'u', true);
  await call(f.s, 'save', { id: 'local', note: 'keep' }); var before = clone(f.storage);
  await start(f); f.reject(true);
  assert.equal((await call(f.s, 'migrate')).err.code, 'PARTIAL');
  f.reject(false);
  assert.equal((await call(f.s, 'migrate')).value.created, 1);
  f.data['sites/a.com__local'].status = 'won';
  assert.equal((await call(f.s, 'migrate')).value.skipped, 1);
  assert.equal(f.data['sites/a.com__local'].status, 'won'); assert.deepEqual(f.storage, before);
});
test('validation rejects invalid coordinates and path IDs; projections cannot mutate internal state', async function () {
  var f = fixture(); await start(f);
  [Infinity, '12junk', 91, '', null].forEach(function (lat) { assert.equal(f.s.siteIdAt(lat, 0), ''); });
  assert.equal(f.s.siteIdAt(41, -87), 'site:41.00000,-87.00000');
  assert.ok((await call(f.s, 'save', { id: 'a/b' })).err);
  await call(f.s, 'save', { id: 's', estimate: { financial: { netCostUsd: 1 } } });
  f.s.get('s').estimate.financial.netCostUsd = 9;
  assert.equal(f.s.get('s').estimate.financial.netCostUsd, 1);
});
test('create race retries against the winner without stealing its attribution or stage', async function () {
  var f = fixture(); await start(f);
  var fetch = f.root.fetch, first = true;
  f.root.fetch = function (url, opts) {
    if (first) {
      first = false;
      f.data['sites/a.com__s'] = { orgId: 'a.com', siteId: 's', repEmail: 'winner@a.com',
        status: 'qualified', notes: [{ t: 'winner' }] };
    }
    return fetch(url, opts);
  };
  var result = await call(f.s, 'save', { id: 's', note: 'mine' });
  assert.equal(result.err, null);
  assert.equal(result.value.repEmail, 'winner@a.com'); assert.equal(result.value.status, 'qualified');
  assert.equal(result.value.notes.length, 2); assert.equal(Object.keys(f.data).length, 1);
});
test('denied stream clears shared rows and never exposes old unscoped fallback', async function () {
  var f = fixture(); await start(f); await call(f.s, 'save', { id: 's' });
  f.storage['cs.savedSites'] = JSON.stringify([{ id: 'other-account', starred: true }]);
  f.streams.find(function (s) { return s.org; }).error(new Error('permission-denied'));
  assert.equal(f.s.mode(), 'blocked'); assert.equal(f.s.list().length, 0);
  assert.equal((await call(f.s, 'save', { id: 'x' })).err.code, 'NOT_READY');
});
test('failure to write never falls back to an unscoped local save', async function () {
  var f = fixture(); await start(f); f.reject(true);
  var result = await call(f.s, 'save', { id: 's' });
  assert.ok(result.err); assert.equal(f.s.list().length, 0);
  assert.deepEqual(f.storage, {}); assert.equal(result.value, null);
});
