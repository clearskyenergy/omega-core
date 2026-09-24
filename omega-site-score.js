/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Thin authenticated client for /api/site-score. No scoring or sizing model.
   score(rows, circuitsByRowId|function, {orgId, hours, use}, cb).
   Requests are debounced and batched; cache identity includes user, workspace,
   duration and raw inputs, never the server's derived output. */
(function (root) {
  'use strict';
  var ENDPOINT = '/api/site-score', DEBOUNCE_MS = 350, MAX_ROWS = 250;
  var cache = Object.create(null), queue = [], timer = null, epoch = 0;
  var session = String(Date.now()) + ':' + String(Math.random());
  function user() {
    try { return root.firebase && root.firebase.auth
      ? root.firebase.auth().currentUser : root._currentUser || null; }
    catch (e) { return null; }
  }
  function failure(code, message) {
    var e = new Error(message); e.code = code; e.scored = false; return e;
  }
  function identity(opts) {
    var u = user();
    return [session, u && u.uid || '', opts.orgId || '', opts.hours || '', opts.use || 'bess', epoch].join('|');
  }
  function circuitOf(row, circuits) {
    return typeof circuits === 'function' ? circuits(row) :
      (circuits && (circuits[row.id] || circuits[row.feederId])) || row.circ || null;
  }
  function input(row) {
    return { id: String(row.id), type: row.type || null, sqft: row.sqft,
      /* Only measured annual energy is an input. Server-modelled energy is
         display data; feeding it back would invalidate the input hash. */
      lotAcres: row.lotAcres, annualKwh: row.annualKwh && row.annualKwh.src === 'metered'
        ? { value: row.annualKwh.value, src: row.annualKwh.src } : null,
      loadFactor: row.loadFactor, feederId: row.feederId || null,
      nameplate: row.nameplate, queue: row.queue,
      service: row.service ? { kva: row.service.kva } : null,
      serviceKva: row.serviceKva };
  }
  function circuitInput(row, circuits) {
    var c = circuitOf(row, circuits);
    if (!c) return null;
    return { known: !!c.known, feederId: c.feederId, nameplate: c.nameplate,
      queue: c.queue, firm: c.firm, soft: c.soft, sellable: c.sellable,
      oversubscribed: c.oversubscribed, fromRecord: c.fromRecord };
  }
  function hashFor(row, circuits, opts) {
    return identity(opts || {}) + '|' + JSON.stringify([input(row), circuitInput(row, circuits)]);
  }
  function post(body, cb) {
    var u = user(), completed = false;
    function done(err, value) {
      if (completed) return; completed = true; clearTimeout(deadline); cb(err, value);
    }
    var deadline = setTimeout(function () {
      done(failure('timeout', 'Scoring timed out. Sites remain available; retry scoring in Settings.'));
    }, 20000);
    if (!u || typeof u.getIdToken !== 'function') {
      done(failure('signed-out', 'Sign in to score sites.')); return;
    }
    try { u.getIdToken().then(function (token) {
      if (completed) return;
      if (user() !== u) { done(failure('superseded', 'The signed-in account changed.')); return; }
      var x;
      try {
        x = new root.XMLHttpRequest();
        x.open('POST', ENDPOINT, true); x.timeout = 20000;
        x.setRequestHeader('Content-Type', 'application/json');
        x.setRequestHeader('Authorization', 'Bearer ' + token);
        x.onload = function () {
          var j;
          try { j = JSON.parse(x.responseText); }
          catch (e) { done(failure('malformed', 'The scoring service returned an invalid response.')); return; }
          if (x.status < 200 || x.status >= 300 || j.degraded) {
            done(failure(x.status === 401 || x.status === 403 ? 'denied' : 'unavailable',
              j.error || 'Scoring is unavailable. Sites remain available.')); return;
          }
          done(null, j);
        };
        x.onerror = function () { done(failure('unreachable', 'Scoring could not connect. Sites remain available.')); };
        x.ontimeout = function () { done(failure('timeout', 'Scoring timed out. Sites remain available.')); };
        x.send(JSON.stringify(body));
      } catch (e) { done(failure('unreachable', e.message)); }
    }, function (e) { done(failure('signed-out', e.message || 'Sign in again to score sites.')); }); }
    catch (e) { done(failure('signed-out', e.message)); }
  }
  function flush() {
    timer = null;
    var jobs = queue; queue = [];
    var groups = Object.create(null);
    jobs.forEach(function (job) {
      var group = groups[job.scope];
      if (!group) group = groups[job.scope] = [];
      group.push(job);
    });
    Object.keys(groups).forEach(function (scope) {
      var list = groups[scope], batch = [], ids = Object.create(null);
      list.forEach(function (job) {
        /* A saved copy and a live row can share an id but carry different
           inputs. They must not overwrite one another in a response map. */
        if (batch.length >= MAX_ROWS || (ids[job.row.id] && ids[job.row.id] !== job.hash)) {
          send(batch); batch = []; ids = Object.create(null);
        }
        batch.push(job); ids[job.row.id] = job.hash;
      });
      if (batch.length) send(batch);
    });
  }
  function send(jobs) {
    var opts = jobs[0].opts, rows = [], circuits = Object.create(null);
    jobs.forEach(function (j) { rows.push(j.row); circuits[j.row.id] = j.circuit; });
    post({ action: 'score', orgId: opts.orgId, hours: opts.hours, use: opts.use || 'bess',
      rows: rows, circuits: circuits }, function (err, reply) {
      var byId = Object.create(null);
      if (!err && (!reply || !Array.isArray(reply.scored)))
        err = failure('malformed', 'The scoring service returned no scored rows.');
      if (!err) reply.scored.forEach(function (r) { byId[String(r.id)] = r; });
      jobs.forEach(function (job) {
        var e = err, rec = byId[job.row.id];
        if (identity(job.opts) !== job.scope) e = failure('superseded', 'Scoring inputs or account changed.');
        if (!e && (!rec || rec.error)) e = failure('unscored', rec && rec.error || 'This site was not scored.');
        if (!e) {
          rec.weightsSource = reply.weightsSource || null;
          rec.scoredAt = reply.asOf || null;
          if (Object.keys(cache).length > 4000) cache = Object.create(null);
          cache[job.hash] = rec;
        }
        job.cb(e, e ? null : rec);
      });
    });
  }
  function score(rows, circuits, opts, cb) {
    opts = opts || {}; cb = cb || function () {};
    var remaining = rows.length, byId = Object.create(null), firstError = null;
    if (!remaining) { setTimeout(function () { cb(null, { byId: byId }); }, 0); return; }
    function accept(id, err, rec) {
      if (err && !firstError) firstError = err;
      if (rec) byId[id] = rec;
      if (!--remaining) cb(firstError, { byId: byId });
    }
    rows.forEach(function (r) {
      var h = hashFor(r, circuits, opts);
      if (!opts.force && cache[h]) {
        var hit = cache[h], scope = identity(opts);
        setTimeout(function () {
          accept(r.id, scope === identity(opts) ? null : failure('superseded', 'Account changed.'),
            scope === identity(opts) ? hit : null);
        }, 0);
      } else queue.push({ row: input(r), circuit: circuitInput(r, circuits),
        opts: { orgId: opts.orgId, hours: opts.hours, use: opts.use },
        scope: identity(opts), hash: h, cb: function (err, rec) { accept(r.id, err, rec); } });
    });
    if (queue.length) { if (timer) clearTimeout(timer); timer = setTimeout(flush, DEBOUNCE_MS); }
  }
  function weights(opts, cb) {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    opts = opts || {}; var scope = identity(opts);
    post({ action: 'weights', orgId: opts.orgId }, function (err, result) {
      if (scope !== identity(opts)) { cb(failure('superseded', 'Account changed.')); return; }
      cb(err, result);
    });
  }
  root.OmegaSiteScore = { score: score, weights: weights, hashFor: hashFor,
    cached: function (id, hash) { return cache[hash] || null; },
    reset: function () { epoch++; cache = Object.create(null); },
    ENDPOINT: ENDPOINT, DEBOUNCE_MS: DEBOUNCE_MS, MAX_ROWS_PER_CALL: MAX_ROWS,
    VERSION: 'site-score-client/2.0' };
})(typeof window !== 'undefined' ? window : this);
