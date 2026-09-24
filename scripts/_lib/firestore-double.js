/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/firestore-double.js — an in-memory Firestore for endpoint tests
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Enough of the Admin SDK surface for the endpoints under test: documents in
   a Map keyed by path; collections as queries with ==, in and <= filters,
   orderBy (including __name__), limit and select; merge sets; create that
   refuses to overwrite; transactions that refuse a read after a write;
   batches; add(). Shared by test-portfolio.js and test-logic-admin.js so
   there is one double to fix when the SDK surface a test needs grows.

   mock(path, exports) plants a module in require.cache before the code
   under test loads it — the way every test here swaps api/_lib/admin.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), path = require('path');
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function get(o, k) { return k.split('.').reduce(function (v, p) { return v == null ? undefined : v[p]; }, o); }
function patch(o, values) { Object.keys(values).forEach(function (key) { var parts = key.split('.'), last = parts.pop(), t = o; parts.forEach(function (p) { t = t[p] || (t[p] = {}); }); t[last] = clone(values[key]); }); return o; }
class DB {
  constructor() { this.data = new Map(); this.seq = 0; }
  collection(p) { return new Query(this, p); }
  doc(p) { return new Ref(this, p); }
  seed(p, v) { this.data.set(p, clone(v)); }
  runTransaction(fn) { var db = this, writes = [], writing = false; var tx = { get: async function (r) { assert.equal(writing, false, 'no reads after writes'); return r.get(); }, create: function (r, v) { writing = true; writes.push(function () { assert(!db.data.has(r.path)); db.seed(r.path, v); }); }, set: function (r, v, o) { writing = true; writes.push(function () { db.seed(r.path, o && o.merge ? Object.assign({}, db.data.get(r.path) || {}, clone(v)) : v); }); }, update: function (r, v) { writing = true; writes.push(function () { assert(db.data.has(r.path)); db.data.set(r.path, patch(clone(db.data.get(r.path)), v)); }); } }; return Promise.resolve(fn(tx)).then(function (out) { writes.forEach(function (w) { w(); }); return out; }); }
}
class Ref {
  constructor(db, p) { this.db = db; this.path = p; this.id = p.split('/').pop(); }
  collection(n) { return new Query(this.db, this.path + '/' + n); }
  async get() { var v = this.db.data.get(this.path), ref = this; return { id: this.id, ref: ref, exists: v !== undefined, data: function () { return clone(v); } }; }
  async set(v, o) { this.db.seed(this.path, o && o.merge ? Object.assign({}, this.db.data.get(this.path) || {}, clone(v)) : v); }
  async update(v) { assert(this.db.data.has(this.path)); this.db.data.set(this.path, patch(clone(this.db.data.get(this.path)), v)); }
  async create(v) { assert(!this.db.data.has(this.path), 'create must not overwrite ' + this.path); this.db.seed(this.path, v); }
}
class Query {
  constructor(db, p, f, s, cap) { this.db = db; this.path = p; this.f = f || []; this.s = s; this.cap = cap || Infinity; }
  doc(id) { return new Ref(this.db, this.path + '/' + (id || 'auto' + (++this.db.seq))); }
  where(k, op, v) { return this.keep(new Query(this.db, this.path, this.f.concat([[k, op, v]]), this.s, this.cap)); }
  orderBy(k, d) { return this.keep(new Query(this.db, this.path, this.f, [k, d], this.cap)); }
  limit(n) { return this.keep(new Query(this.db, this.path, this.f, this.s, n)); }
  /* startAfter(value of the orderBy field, or a doc id for '__name__') */
  startAfter(v) { var q = this.keep(new Query(this.db, this.path, this.f, this.s, this.cap)); q.after = v && v.id !== undefined && typeof v.data === 'function' ? v.id : v; return q; }
  keep(q) { q.after = this.after; return q; }
  select() { return this; }
  async get() { var self = this, docs = []; for (var e of this.db.data.entries()) { var p = e[0], d = e[1]; if (p.split('/').length !== this.path.split('/').length + 1 || p.indexOf(this.path + '/') !== 0) continue; if (!this.f.every(function (f) { return f[1] === '==' ? get(d, f[0]) === f[2] : f[1] === 'in' ? f[2].indexOf(get(d, f[0])) >= 0 : get(d, f[0]) <= f[2]; })) continue; docs.push(await new Ref(this.db, p).get()); } if (this.s) docs.sort(function (a, b) { var av = self.s[0] === '__name__' ? a.id : get(a.data(), self.s[0]), bv = self.s[0] === '__name__' ? b.id : get(b.data(), self.s[0]); return (av < bv ? -1 : av > bv ? 1 : 0) * (self.s[1] === 'desc' ? -1 : 1); }); if (this.after !== undefined && this.after !== null && this.s) { var af = this.after; docs = docs.filter(function (x) { var v = self.s[0] === '__name__' ? x.id : get(x.data(), self.s[0]); return self.s[1] === 'desc' ? v < af : v > af; }); } docs = docs.slice(0, this.cap); return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (fn) { docs.forEach(fn); } }; }
}

/* Additions over the first version: batches, delete, add — what the
   tenant_public mirror and the billing history need. */
DB.prototype.batch = function () { var ops = []; return {
  set: function (r, v, o) { ops.push(function () { return r.set(v, o); }); return this; },
  create: function (r, v) { ops.push(function () { return r.create(v); }); return this; },
  update: function (r, v) { ops.push(function () { return r.update(v); }); return this; },
  delete: function (r) { ops.push(function () { return r.delete(); }); return this; },
  commit: async function () { for (var i = 0; i < ops.length; i++) await ops[i](); return []; } }; };
Ref.prototype.delete = async function () { this.db.data.delete(this.path); };
Query.prototype.add = async function (v) { var r = this.doc(); await r.set(v); return r; };

/* p is relative to scripts/ — the way the tests always wrote it. */
function mock(p, exports) { var full = require.resolve(path.resolve(__dirname, '..', p)); require.cache[full] = { id: full, filename: full, loaded: true, exports: exports }; }

module.exports = { DB: DB, Ref: Ref, Query: Query, clone: clone, get: get, patch: patch, mock: mock };
