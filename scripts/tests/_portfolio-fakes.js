/* scripts/tests/_portfolio-fakes.js — an in-memory Firestore/Storage and an
   HTTP harness for api/portfolio-assets.js. © 2025–2026 ClearSky Energy
   Solutions LLC. Only the calls the gateway makes are implemented; anything
   else throws, so a new call cannot silently pass against a stub. */
'use strict';
var A = require('../../api/_lib/admin');

function store() {
  var data = {}, n = 0;
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function snap(path) { var d = data[path]; return { exists: d !== undefined, id: path.split('/').pop(), data: function () { return clone(d); }, ref: docRef(path) }; }
  function docRef(path) {
    return { id: path.split('/').pop(), path: path,
      get: function () { return Promise.resolve(snap(path)); },
      set: function (v, o) { data[path] = o && o.merge && data[path] ? Object.assign(clone(data[path]), clone(v)) : clone(v); return Promise.resolve(); },
      create: function (v) { if (data[path] !== undefined) return Promise.reject(new Error('ALREADY_EXISTS ' + path)); data[path] = clone(v); return Promise.resolve(); },
      delete: function () { delete data[path]; return Promise.resolve(); },
      collection: function (name) { return colRef(path + '/' + name); } };
  }
  function colRef(path) {
    function q(limit) { return { get: function () { var depth = path.split('/').length + 1, docs = Object.keys(data).filter(function (k) { return k.indexOf(path + '/') === 0 && k.split('/').length === depth; }).sort().slice(0, limit || 1e9).map(snap); return Promise.resolve({ docs: docs, size: docs.length, empty: !docs.length }); } }; }
    return { path: path, doc: function (id) { return docRef(path + '/' + (id || ('auto' + (++n) + Math.random().toString(36).slice(2, 8)))); }, limit: function (k) { return q(k); }, get: q().get };
  }
  var db = { collection: function (name) { return colRef(name); },
    runTransaction: function (fn) { var tx = { get: function (ref) { return ref.get(); }, set: function (ref, v, o) { ref.set(v, o); } }; return Promise.resolve(fn(tx)); } };
  var files = {};
  var bucket = { file: function (p) { return { save: function (b) { files[p] = Buffer.from(b); return Promise.resolve(); }, download: function () { if (!files[p]) return Promise.reject(Object.assign(new Error('No such object'), { code: 404 })); return Promise.resolve([files[p]]); } }; } };
  return { db: db, data: data, files: files, bucket: bucket };
}

/* users: token → { uid, email, orgId, staff } ; billing: org → doc */
function harness(opts) {
  var st = store(), billing = opts.billing || {};
  Object.keys(opts.members || {}).forEach(function (k) { st.data[k] = opts.members[k]; });
  var A2 = Object.assign({}, A, { billingOf: function (org) { return Promise.resolve(billing[org] || { tier: 'standard', addons: [], toolOverrides: {} }); } });
  var handler = require('../../api/portfolio-assets')._make({ A: A2, db: function () { return st.db; }, bucket: function () { return st.bucket; },
    authenticate: function (req) { var u = opts.users[(req.headers.authorization || '').replace('Bearer ', '')]; return u ? Promise.resolve(u) : Promise.reject(A.httpError(401, 'invalid token')); },
    now: function () { return opts.now ? opts.now() : '2026-10-10T15:00:00.000Z'; } });
  function call(method, token, params) {
    return new Promise(function (resolve) {
      var res = { headers: {}, statusCode: 200, headersSent: false, body: null,
        setHeader: function (k, v) { this.headers[k.toLowerCase()] = v; }, status: function (c) { this.statusCode = c; return this; },
        json: function (b) { this.headersSent = true; this.body = b; resolve(this); return this; }, end: function (b) { this.headersSent = true; this.raw = b; resolve(this); return this; } };
      var req = { method: method, headers: { authorization: 'Bearer ' + token }, query: method === 'GET' ? params : {}, body: method === 'POST' ? params : undefined };
      handler(req, res);
    });
  }
  return { store: st, get: function (t, p) { return call('GET', t, p); }, post: function (t, b) { return call('POST', t, b); } };
}
module.exports = { store: store, harness: harness };
