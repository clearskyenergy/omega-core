/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/firebase-double.js — the Firebase compat SDK, in memory
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The dashboard (index.html) and the shared runtime it loads talk to
   Firestore directly from the browser — sixteen collections, live listeners,
   merges, array unions, server timestamps — and to firebase.auth(). Nothing
   checked any of that before a browser did, because the only thing that
   could answer was the real project. This is the answer for a render check:
   enough of the compat API, with real query and write semantics, seeded
   from a fixture, so the REAL page runs unmodified against a tenant that
   exists only for the length of the check.

   What it does: documents and subcollections at any depth; get / set
   (merge) / update (dotted paths) / delete / add; where (==, !=, <, <=, >,
   >=, in, not-in, array-contains, array-contains-any), orderBy, limit;
   onSnapshot on a document or a query, fired on change; batches and
   transactions; FieldValue.serverTimestamp / arrayUnion / arrayRemove /
   increment / delete; Timestamp; FieldPath.documentId. An auth object with
   a signed-in user, observers, sign-out, the popup and password sign-ins,
   and the provider constructors the sign-in card news up. A storage stub
   that refuses politely. Every write is logged, so a check can assert what
   the page wrote and did not write.

   What it is not: security rules (nothing is denied here — the rules
   emulator does that; this checks that the page paints and behaves), and
   not a place to keep data. ES5, one file, runs in Node for its own test
   (scripts/tests/tfirebasedouble.js) and in a page via addInitScript.

   Fixture shape — a flat map of document path to data:
     { 'omega_orgs/acme.example': { name: 'Acme', status: 'active' },
       'omega_orgs/acme.example/billing/current': { tier: 'standard' } }
   A timestamp in a fixture is { __ts: <millis> } (FirebaseDouble.ts(date)),
   revived to a Timestamp on install, because a fixture crosses into the
   browser as JSON.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FirebaseDouble = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Timestamp ────────────────────────────────────────────────────────── */
  function Timestamp(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds || 0; }
  Timestamp.prototype.toDate = function () { return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6)); };
  Timestamp.prototype.toMillis = function () { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); };
  Timestamp.prototype.valueOf = function () { return this.toMillis(); };
  Timestamp.prototype.isEqual = function (o) { return !!o && o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; };
  Timestamp.prototype.toJSON = function () { return { __ts: this.toMillis() }; };
  Timestamp.now = function () { return Timestamp.fromMillis(Date.now()); };
  Timestamp.fromDate = function (d) { return Timestamp.fromMillis(d.getTime()); };
  Timestamp.fromMillis = function (ms) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); };

  /* ── FieldValue sentinels ─────────────────────────────────────────────── */
  function Sentinel(kind, arg) { this.__fv = kind; this.arg = arg; }
  var FieldValue = {
    serverTimestamp: function () { return new Sentinel('serverTimestamp'); },
    arrayUnion: function () { return new Sentinel('arrayUnion', [].slice.call(arguments)); },
    arrayRemove: function () { return new Sentinel('arrayRemove', [].slice.call(arguments)); },
    increment: function (n) { return new Sentinel('increment', n); },
    'delete': function () { return new Sentinel('delete'); }
  };
  function DocumentId() {} /* FieldPath.documentId() */
  var FieldPath = { documentId: function () { return new DocumentId(); } };

  /* ── values ───────────────────────────────────────────────────────────── */
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Sentinel) && !(v instanceof Date); }
  function clone(v) {
    if (v instanceof Timestamp) return new Timestamp(v.seconds, v.nanoseconds);
    if (v instanceof Date) return Timestamp.fromDate(v);          /* Firestore stores a Date as a Timestamp */
    if (Array.isArray(v)) return v.map(clone);
    if (isObj(v)) { var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = clone(v[k]); return o; }
    return v;
  }
  /* { __ts: ms } → Timestamp, at any depth: how a fixture's dates arrive */
  function revive(v) {
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === 'object') {
      if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return Timestamp.fromMillis(v.__ts);
      var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = revive(v[k]); return o;
    }
    return v;
  }
  function same(a, b) {
    if (a instanceof Timestamp && b instanceof Timestamp) return a.isEqual(b);
    if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
    if (isObj(a) && isObj(b)) { var ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false; for (var j = 0; j < ka.length; j++) if (!same(a[ka[j]], b[ka[j]])) return false; return true; }
    return a === b;
  }
  function rank(v) { /* Firestore's type order, enough of it */
    if (v === null || v === undefined) return 0;
    if (typeof v === 'boolean') return 1;
    if (typeof v === 'number') return 2;
    if (v instanceof Timestamp) return 3;
    if (typeof v === 'string') return 4;
    if (Array.isArray(v)) return 6;
    return 7;
  }
  function compare(a, b) {
    var ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (a instanceof Timestamp) { a = a.toMillis(); b = b.toMillis(); }
    if (typeof a === 'boolean') { a = +a; b = +b; }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function getPath(obj, fieldPath) {
    var parts = String(fieldPath).split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) { if (!isObj(cur) || !(parts[i] in cur)) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function setPath(obj, fieldPath, value) {
    var parts = String(fieldPath).split('.'), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) { if (!isObj(cur[parts[i]])) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    var last = parts[parts.length - 1];
    if (value instanceof Sentinel && value.__fv === 'delete') { delete cur[last]; return; }
    cur[last] = resolve(value, cur[last]);
  }
  /* a sentinel against the value it lands on */
  function resolve(v, prev) {
    if (v instanceof Sentinel) {
      if (v.__fv === 'serverTimestamp') return Timestamp.now();
      if (v.__fv === 'increment') return (typeof prev === 'number' ? prev : 0) + v.arg;
      if (v.__fv === 'arrayUnion') { var a = Array.isArray(prev) ? prev.slice() : []; v.arg.forEach(function (x) { if (!a.some(function (y) { return same(x, y); })) a.push(clone(x)); }); return a; }
      if (v.__fv === 'arrayRemove') { var b = Array.isArray(prev) ? prev.slice() : []; return b.filter(function (y) { return !v.arg.some(function (x) { return same(x, y); }); }); }
      return undefined;
    }
    if (Array.isArray(v)) return v.map(function (x) { return resolve(x, undefined); });
    if (isObj(v)) { var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) { if (v[k] instanceof Sentinel && v[k].__fv === 'delete') continue; o[k] = resolve(v[k], isObj(prev) ? prev[k] : undefined); } return o; }
    return clone(v);
  }
  /* set with merge: sentinels resolve against the existing field, nested
     objects merge one level at a time, as Firestore does */
  function mergeInto(target, patch) {
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) {
      var v = patch[k];
      if (v instanceof Sentinel && v.__fv === 'delete') { delete target[k]; continue; }
      if (isObj(v) && isObj(target[k])) { mergeInto(target[k], v); continue; }
      target[k] = resolve(v, target[k]);
    }
  }
  function autoId() { var s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = ''; for (var i = 0; i < 20; i++) out += s.charAt(Math.floor(Math.random() * s.length)); return out; }
  function segs(p) { return String(p).split('/').filter(Boolean); }
  function parentOf(path) { var s = segs(path); s.pop(); return s.join('/'); }
  function idOf(path) { var s = segs(path); return s[s.length - 1]; }

  /* ── the store ────────────────────────────────────────────────────────── */
  function Store(fixture, opts) {
    this.docs = {};          /* path → data */
    this.order = [];         /* paths in insertion order */
    this.listeners = [];     /* { kind:'doc'|'query', key, fire } */
    this.log = [];           /* every write, in order */
    this.latency = opts && typeof opts.latency === 'number' ? opts.latency : 0;
    this.failures = (opts && opts.failures) || {};   /* path prefix → error message: a refused read or write */
    var self = this;
    Object.keys(fixture || {}).forEach(function (p) { self.put(p, revive(fixture[p]), true); });
  }
  Store.prototype.has = function (p) { return Object.prototype.hasOwnProperty.call(this.docs, p); };
  Store.prototype.put = function (p, data, silent) { if (!this.has(p)) this.order.push(p); this.docs[p] = data; if (!silent) this.changed(p); };
  Store.prototype.drop = function (p) { if (!this.has(p)) return; delete this.docs[p]; this.order = this.order.filter(function (x) { return x !== p; }); this.changed(p); };
  Store.prototype.refuses = function (p, op) {
    for (var k in this.failures) if (Object.prototype.hasOwnProperty.call(this.failures, k) && p.indexOf(k) === 0) {
      var f = this.failures[k]; if (!f || (typeof f === 'object' && f.op && f.op !== op)) continue;
      var e = new Error(typeof f === 'string' ? f : (f.message || 'Missing or insufficient permissions.')); e.code = 'permission-denied'; return e;
    }
    return null;
  };
  Store.prototype.later = function (fn) {
    var self = this;
    return new Promise(function (ok, no) { setTimeout(function () { try { ok(fn()); } catch (e) { no(e); } }, self.latency); });
  };
  Store.prototype.write = function (op, p, data) { this.log.push({ op: op, path: p, data: clone(data === undefined ? null : data), at: Date.now() }); };
  /* listeners: a doc listener keyed by its path, a query listener by the
     collection path; re-evaluated after a write and fired when the result
     differs from what it last delivered */
  Store.prototype.changed = function (p) {
    var col = parentOf(p), self = this;
    this.listeners.slice().forEach(function (l) {
      if ((l.kind === 'doc' && l.key === p) || (l.kind === 'query' && l.key === col)) setTimeout(function () { if (l.live) l.fire(); }, self.latency);
    });
  };
  /* every document directly in a collection (not in its subcollections) */
  Store.prototype.inCollection = function (col) {
    var n = segs(col).length, out = [], self = this;
    this.order.forEach(function (p) { if (p.indexOf(col + '/') === 0 && segs(p).length === n + 1) out.push({ path: p, data: self.docs[p] }); });
    return out;
  };
  Store.prototype.inGroup = function (id) {
    var out = [], self = this;
    this.order.forEach(function (p) { var s = segs(p); if (s.length >= 2 && s[s.length - 2] === id) out.push({ path: p, data: self.docs[p] }); });
    return out;
  };

  /* ── references and snapshots ─────────────────────────────────────────── */
  function DocSnap(ref, data) { this.ref = ref; this.id = ref.id; this.exists = data !== undefined && data !== null; this._d = data; this.metadata = { fromCache: false, hasPendingWrites: false }; }
  DocSnap.prototype.data = function () { return this.exists ? clone(this._d) : undefined; };
  DocSnap.prototype.get = function (f) { return this.exists ? clone(getPath(this._d, f)) : undefined; };
  function QuerySnap(docs, prev) {
    this.docs = docs; this.size = docs.length; this.empty = !docs.length; this.metadata = { fromCache: false, hasPendingWrites: false };
    this._prev = prev || null;
  }
  QuerySnap.prototype.forEach = function (fn, ctx) { this.docs.forEach(function (d) { fn.call(ctx, d); }); };
  QuerySnap.prototype.docChanges = function () {
    var prev = this._prev ? this._prev.docs : [], byId = {}, out = [], self = this;
    prev.forEach(function (d) { byId[d.ref.path] = d; });
    this.docs.forEach(function (d, i) {
      var was = byId[d.ref.path];
      if (!was) out.push({ type: 'added', doc: d, oldIndex: -1, newIndex: i });
      else if (!same(was._d, d._d)) out.push({ type: 'modified', doc: d, oldIndex: prev.indexOf(was), newIndex: i });
      delete byId[d.ref.path];
    });
    Object.keys(byId).forEach(function (p) { out.push({ type: 'removed', doc: byId[p], oldIndex: prev.indexOf(byId[p]), newIndex: -1 }); });
    return out;
  };

  function DocRef(db, path) { this.firestore = db; this.path = path; this.id = idOf(path); }
  DocRef.prototype.collection = function (name) { return new Query(this.firestore, this.path + '/' + segs(name).join('/')); };
  DocRef.prototype.isEqual = function (o) { return !!o && o.path === this.path; };
  Object.defineProperty(DocRef.prototype, 'parent', { get: function () { return new Query(this.firestore, parentOf(this.path)); } });
  DocRef.prototype._snap = function () { var s = this.firestore._store; return new DocSnap(this, s.has(this.path) ? s.docs[this.path] : undefined); };
  DocRef.prototype.get = function () { var self = this, s = this.firestore._store; return s.later(function () { var e = s.refuses(self.path, 'read'); if (e) throw e; return self._snap(); }); };
  DocRef.prototype.set = function (data, opts) {
    var self = this, s = this.firestore._store;
    return s.later(function () {
      var e = s.refuses(self.path, 'write'); if (e) throw e;
      if (!isObj(data)) throw new Error('set() needs an object');
      s.write('set', self.path, data);
      if (opts && (opts.merge || opts.mergeFields) && s.has(self.path)) { var cur = clone(s.docs[self.path]); mergeInto(cur, data); s.put(self.path, cur); }
      else s.put(self.path, resolve(data, undefined));
    });
  };
  DocRef.prototype.update = function (a) {
    var self = this, s = this.firestore._store, patch = {};
    if (typeof a === 'string' || a instanceof DocumentId) { var args = arguments; for (var i = 0; i < args.length; i += 2) patch[args[i]] = args[i + 1]; }
    else patch = a;
    return s.later(function () {
      var e = s.refuses(self.path, 'write'); if (e) throw e;
      if (!s.has(self.path)) { var err = new Error('No document to update: ' + self.path); err.code = 'not-found'; throw err; }
      s.write('update', self.path, patch);
      var cur = clone(s.docs[self.path]);
      Object.keys(patch).forEach(function (k) { setPath(cur, k, patch[k]); });
      s.put(self.path, cur);
    });
  };
  DocRef.prototype['delete'] = function () { var self = this, s = this.firestore._store; return s.later(function () { var e = s.refuses(self.path, 'write'); if (e) throw e; s.write('delete', self.path); s.drop(self.path); }); };
  DocRef.prototype.onSnapshot = function (a, b, c) {
    var next = typeof a === 'function' ? a : (a && a.next), onErr = typeof a === 'function' ? b : (a && a.error), self = this, s = this.firestore._store;
    var last, l = { kind: 'doc', key: this.path, live: true, fire: function () {
      var e = s.refuses(self.path, 'read'); if (e) { if (onErr) onErr(e); return; }
      var snap = self._snap(), sig = JSON.stringify(snap._d === undefined ? null : snap._d);
      if (sig === last) return; last = sig; next(snap);
    } };
    s.listeners.push(l); setTimeout(l.fire, s.latency);
    return function () { l.live = false; s.listeners = s.listeners.filter(function (x) { return x !== l; }); };
  };

  function Query(db, path, spec) {
    this.firestore = db; this.path = path; this.id = idOf(path);
    this._spec = spec || { where: [], order: [], limit: null, group: false };
  }
  Query.prototype._with = function (patch) { var sp = { where: this._spec.where.slice(), order: this._spec.order.slice(), limit: this._spec.limit, group: this._spec.group, startAfter: this._spec.startAfter }; for (var k in patch) sp[k] = patch[k]; return new Query(this.firestore, this.path, sp); };
  Query.prototype.doc = function (id) { if (this._spec.group) throw new Error('doc() on a collection group'); return new DocRef(this.firestore, this.path + '/' + (id === undefined ? autoId() : segs(id).join('/'))); };
  Query.prototype.add = function (data) { var ref = this.doc(); return ref.set(data).then(function () { ref.firestore._store.log[ref.firestore._store.log.length - 1].op = 'add'; return ref; }); };
  Query.prototype.where = function (field, op, value) { return this._with({ where: this._spec.where.concat([{ field: field, op: op, value: clone(value) }]) }); };
  Query.prototype.orderBy = function (field, dir) { return this._with({ order: this._spec.order.concat([{ field: field, dir: dir === 'desc' ? -1 : 1 }]) }); };
  Query.prototype.limit = function (n) { return this._with({ limit: n }); };
  Query.prototype.startAfter = function (snap) { return this._with({ startAfter: snap && snap.ref ? snap.ref.path : null }); };
  Object.defineProperty(Query.prototype, 'parent', { get: function () { var p = parentOf(this.path); return p ? new DocRef(this.firestore, p) : null; } });
  Query.prototype.isEqual = function (o) { return !!o && o.path === this.path && JSON.stringify(o._spec) === JSON.stringify(this._spec); };
  function matches(entry, w) {
    var v = w.field instanceof DocumentId ? idOf(entry.path) : getPath(entry.data, w.field), x = w.value;
    switch (w.op) {
      case '==': return same(v, x);
      case '!=': return v !== undefined && !same(v, x);
      case '<': return v !== undefined && rank(v) === rank(x) && compare(v, x) < 0;
      case '<=': return v !== undefined && rank(v) === rank(x) && compare(v, x) <= 0;
      case '>': return v !== undefined && rank(v) === rank(x) && compare(v, x) > 0;
      case '>=': return v !== undefined && rank(v) === rank(x) && compare(v, x) >= 0;
      case 'in': return Array.isArray(x) && x.some(function (y) { return same(v, y); });
      case 'not-in': return v !== undefined && Array.isArray(x) && !x.some(function (y) { return same(v, y); });
      case 'array-contains': return Array.isArray(v) && v.some(function (y) { return same(y, x); });
      case 'array-contains-any': return Array.isArray(v) && Array.isArray(x) && v.some(function (y) { return x.some(function (z) { return same(y, z); }); });
      default: throw new Error('unsupported operator ' + w.op);
    }
  }
  Query.prototype._run = function () {
    var s = this.firestore._store, spec = this._spec, self = this;
    var rows = spec.group ? s.inGroup(this.id) : s.inCollection(this.path);
    spec.where.forEach(function (w) { rows = rows.filter(function (r) { return matches(r, w); }); });
    if (spec.order.length) {
      rows.sort(function (a, b) {
        for (var i = 0; i < spec.order.length; i++) {
          var o = spec.order[i], va = o.field instanceof DocumentId ? idOf(a.path) : getPath(a.data, o.field), vb = o.field instanceof DocumentId ? idOf(b.path) : getPath(b.data, o.field);
          var c = compare(va, vb); if (c) return c * o.dir;
        }
        return 0;
      });
      /* Firestore drops documents that lack the orderBy field */
      rows = rows.filter(function (r) { return spec.order.every(function (o) { return o.field instanceof DocumentId || getPath(r.data, o.field) !== undefined; }); });
    }
    if (spec.startAfter) { var i = -1; rows.some(function (r, k) { if (r.path === spec.startAfter) { i = k; return true; } }); rows = rows.slice(i + 1); }
    if (typeof spec.limit === 'number') rows = rows.slice(0, spec.limit);
    return rows.map(function (r) { return new DocSnap(new DocRef(self.firestore, r.path), r.data); });
  };
  Query.prototype.get = function () { var self = this, s = this.firestore._store; return s.later(function () { var e = s.refuses(self.path, 'read'); if (e) throw e; return new QuerySnap(self._run()); }); };
  Query.prototype.onSnapshot = function (a, b, c) {
    var next = typeof a === 'function' ? a : (a && a.next), onErr = typeof a === 'function' ? b : (a && a.error), self = this, s = this.firestore._store;
    var last, prev = null, l = { kind: 'query', key: this.path, live: true, fire: function () {
      var e = s.refuses(self.path, 'read'); if (e) { if (onErr) onErr(e); return; }
      var docs = self._run(), sig = JSON.stringify(docs.map(function (d) { return [d.ref.path, d._d]; }));
      if (sig === last) return; last = sig;
      var snap = new QuerySnap(docs, prev); prev = snap; next(snap);
    } };
    s.listeners.push(l); setTimeout(l.fire, s.latency);
    return function () { l.live = false; s.listeners = s.listeners.filter(function (x) { return x !== l; }); };
  };

  /* ── batches and transactions ─────────────────────────────────────────── */
  function Batch(db) { this.db = db; this.ops = []; }
  Batch.prototype.set = function (ref, data, opts) { this.ops.push(function () { return ref.set(data, opts); }); return this; };
  Batch.prototype.update = function (ref, a) { var args = [].slice.call(arguments, 1); this.ops.push(function () { return ref.update.apply(ref, args); }); return this; };
  Batch.prototype['delete'] = function (ref) { this.ops.push(function () { return ref['delete'](); }); return this; };
  Batch.prototype.commit = function () { var ops = this.ops; this.ops = []; return ops.reduce(function (p, op) { return p.then(op); }, Promise.resolve()).then(function () {}); };
  function Transaction(db) { this.db = db; this.batch = new Batch(db); }
  Transaction.prototype.get = function (ref) { return ref.get(); };
  Transaction.prototype.set = function (ref, data, opts) { this.batch.set(ref, data, opts); return this; };
  Transaction.prototype.update = function () { this.batch.update.apply(this.batch, arguments); return this; };
  Transaction.prototype['delete'] = function (ref) { this.batch['delete'](ref); return this; };

  /* ── firestore() ──────────────────────────────────────────────────────── */
  function Firestore(store) { this._store = store; this.app = { name: '[DEFAULT]' }; }
  Firestore.prototype.collection = function (path) { return new Query(this, segs(path).join('/')); };
  Firestore.prototype.doc = function (path) { return new DocRef(this, segs(path).join('/')); };
  Firestore.prototype.collectionGroup = function (id) { return new Query(this, id, { where: [], order: [], limit: null, group: true }); };
  Firestore.prototype.batch = function () { return new Batch(this); };
  Firestore.prototype.runTransaction = function (fn) { var t = new Transaction(this); return Promise.resolve().then(function () { return fn(t); }).then(function (r) { return t.batch.commit().then(function () { return r; }); }); };
  Firestore.prototype.settings = function () {};
  Firestore.prototype.enablePersistence = function () { return Promise.resolve(); };
  Firestore.prototype.terminate = function () { return Promise.resolve(); };
  Firestore.prototype.waitForPendingWrites = function () { return Promise.resolve(); };

  /* ── auth() ───────────────────────────────────────────────────────────── */
  function user(u) {
    if (!u) return null;
    var me = {
      uid: u.uid || ('uid-' + String(u.email || 'x').replace(/[^a-z0-9]/gi, '')), email: u.email || null, displayName: u.displayName || null,
      photoURL: u.photoURL || null, emailVerified: u.emailVerified !== false, isAnonymous: false, providerData: [{ providerId: u.providerId || 'google.com' }],
      metadata: { creationTime: u.creationTime || new Date(0).toUTCString(), lastSignInTime: new Date().toUTCString() },
      getIdToken: function () { return Promise.resolve('double-token-' + me.uid); },
      getIdTokenResult: function () { return Promise.resolve({ token: 'double-token-' + me.uid, claims: u.claims || {} }); },
      updateProfile: function (p) { if (p && p.displayName !== undefined) me.displayName = p.displayName; if (p && p.photoURL !== undefined) me.photoURL = p.photoURL; return Promise.resolve(); },
      reload: function () { return Promise.resolve(); },
      sendEmailVerification: function () { return Promise.resolve(); },
      updatePassword: function () { return Promise.resolve(); },
      reauthenticateWithCredential: function () { return Promise.resolve({ user: me }); },
      'delete': function () { return Promise.resolve(); },
      toJSON: function () { return { uid: me.uid, email: me.email }; }
    };
    return me;
  }
  function Auth(store, opts) {
    var self = this, listeners = [];
    this.currentUser = user(opts.user);
    this.app = { options: { authDomain: opts.authDomain || 'localhost' } };
    this.languageCode = null;
    this.log = [];
    function notify() { listeners.slice().forEach(function (fn) { setTimeout(function () { fn(self.currentUser); }, store.latency); }); }
    this._become = function (u) { self.currentUser = user(u); notify(); return Promise.resolve({ user: self.currentUser }); };
    this.onAuthStateChanged = function (fn) { listeners.push(fn); setTimeout(function () { fn(self.currentUser); }, store.latency); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; };
    this.onIdTokenChanged = this.onAuthStateChanged;
    this.signOut = function () { self.log.push({ op: 'signOut' }); self.currentUser = null; notify(); return Promise.resolve(); };
    this.signInWithPopup = function (provider) { self.log.push({ op: 'popup', provider: provider && provider.providerId, params: provider && provider._params }); if (!opts.popupUser) return Promise.reject({ code: 'auth/popup-closed-by-user', message: 'The popup has been closed by the user before finalizing the operation.' }); return self._become(opts.popupUser); };
    this.signInWithRedirect = function () { self.log.push({ op: 'redirect' }); return Promise.resolve(); };
    this.getRedirectResult = function () { return Promise.resolve({ user: null }); };
    this.signInWithEmailAndPassword = function (email, pass) {
      self.log.push({ op: 'password', email: email });
      var acct = (opts.accounts || {})[String(email).toLowerCase()];
      if (!acct) return Promise.reject({ code: 'auth/user-not-found', message: 'There is no user record corresponding to this identifier.' });
      if (acct.password !== pass) return Promise.reject({ code: 'auth/wrong-password', message: 'The password is invalid or the user does not have a password.' });
      return self._become(acct);
    };
    this.createUserWithEmailAndPassword = function (email, pass) { self.log.push({ op: 'create', email: email }); if ((opts.accounts || {})[String(email).toLowerCase()]) return Promise.reject({ code: 'auth/email-already-in-use', message: 'The email address is already in use by another account.' }); return self._become({ email: email, emailVerified: false, providerId: 'password' }); };
    this.sendPasswordResetEmail = function (email) { self.log.push({ op: 'reset', email: email }); return Promise.resolve(); };
    this.signInWithEmailLink = function (email) { return self._become({ email: email, providerId: 'emailLink' }); };
    this.sendSignInLinkToEmail = function (email) { self.log.push({ op: 'link', email: email }); return Promise.resolve(); };
    this.isSignInWithEmailLink = function () { return false; };
    this.setPersistence = function () { return Promise.resolve(); };
    this.useDeviceLanguage = function () {};
  }
  function GoogleAuthProvider() { this.providerId = 'google.com'; this._params = null; this._scopes = []; }
  GoogleAuthProvider.prototype.setCustomParameters = function (p) { this._params = p; return this; };
  GoogleAuthProvider.prototype.addScope = function (s) { this._scopes.push(s); return this; };
  GoogleAuthProvider.credential = function (idToken, accessToken) { return { providerId: 'google.com', idToken: idToken, accessToken: accessToken }; };
  var EmailAuthProvider = { PROVIDER_ID: 'password', credential: function (e, p) { return { providerId: 'password', email: e, password: p }; }, credentialWithLink: function (e, l) { return { providerId: 'emailLink', email: e, link: l }; } };

  /* ── storage(), refusing politely ─────────────────────────────────────── */
  function storageStub() {
    function ref(path) {
      return { fullPath: path || '', child: function (p) { return ref((path ? path + '/' : '') + p); },
        put: function () { var e = new Error('storage is not part of the double'); e.code = 'storage/unauthorized'; var t = Promise.reject(e); t.on = function () { return t; }; t.snapshot = { ref: ref(path) }; return t; },
        putString: function () { return this.put(); },
        getDownloadURL: function () { var e = new Error('storage is not part of the double'); e.code = 'storage/object-not-found'; return Promise.reject(e); },
        'delete': function () { return Promise.resolve(); } };
    }
    return { ref: ref, refFromURL: function () { return ref(''); } };
  }

  /* ── install ──────────────────────────────────────────────────────────── */
  function install(g, cfg) {
    cfg = cfg || {};
    var store = new Store(cfg.docs || {}, { latency: cfg.latency, failures: cfg.failures });
    var db = new Firestore(store), auth = new Auth(store, cfg), apps = [];
    function firestoreFn() { return db; }
    firestoreFn.FieldValue = FieldValue; firestoreFn.Timestamp = Timestamp; firestoreFn.FieldPath = FieldPath;
    firestoreFn.setLogLevel = function () {};
    function authFn() { return auth; }
    authFn.GoogleAuthProvider = GoogleAuthProvider; authFn.EmailAuthProvider = EmailAuthProvider;
    authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
    var st = storageStub(); function storageFn() { return st; }
    var fb = {
      apps: apps, SDK_VERSION: 'double',
      initializeApp: function (options, name) { var app = { name: name || '[DEFAULT]', options: options || {}, auth: authFn, firestore: firestoreFn, storage: storageFn }; if (apps.some(function (a) { return a.name === app.name; })) { var e = new Error('Firebase: Firebase App named \'' + app.name + '\' already exists (app/duplicate-app).'); e.code = 'app/duplicate-app'; throw e; } apps.push(app); return app; },
      app: function (name) { var a = apps.filter(function (x) { return x.name === (name || '[DEFAULT]'); })[0]; if (!a) { var e = new Error('Firebase: No Firebase App \'' + (name || '[DEFAULT]') + '\' has been created - call Firebase App.initializeApp() (app/no-app).'); e.code = 'app/no-app'; throw e; } return a; },
      auth: authFn, firestore: firestoreFn, storage: storageFn,
      analytics: function () { return { logEvent: function () {} }; }
    };
    g.firebase = fb;
    g.__firebaseDouble = { store: store, auth: auth, db: db };
    return g.__firebaseDouble;
  }

  return {
    install: install,
    ts: function (d) { return { __ts: d instanceof Date ? d.getTime() : Number(d) }; },
    Timestamp: Timestamp, FieldValue: FieldValue, FieldPath: FieldPath,
    /* the source of this module, for a page's addInitScript */
    source: typeof __filename === 'string' ? function () { return require('fs').readFileSync(__filename, 'utf8'); } : null
  };
});
