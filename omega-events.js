/* ══════════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · EVENT LAYER CLIENT  (omega-events.js)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ------------------------------------------------------
   OmegaEvents.emit(name, props)            one event
   OmegaEvents.run(toolId, calc, inputs, work[, projectId])
                                            time a calculation → tool.run
                                            (work: a function returning a
                                            value or a promise; its result is
                                            returned unchanged)
   OmegaEvents.error(toolId, calc, err)     → tool.error

   Posts batches to /api/events, which stamps who and where from the verified
   token and publishes to Pub/Sub. The catalogue is api/_lib/events.js; an
   event it does not list is refused there, not here.

   THE ONE RULE: THIS FILE MUST NEVER BREAK A PAGE. Telemetry that can throw
   is a bug generator in every tool it touches. Every entry point is wrapped;
   a failure is swallowed and the page carries on. run() returns the work's
   own result (or rethrows the work's own error) whether or not anything was
   recorded.

   IT SENDS NOTHING UNTIL THE SERVER SAYS YES. On the first signed-in load of
   a tab it asks GET /api/events: the layer must be on, this user must have
   accepted the CURRENT terms (omega-terms.js 2026-09-23 or later), and their
   org/host must not be excluded. Any "no" makes this tab a no-op.

   SAMPLING (decided 2026-09-11, rate in event_config/current):
     · by SESSION, not by event — a kept tab keeps every event, so a whole
       calculation sequence survives instead of scattered single runs.
     · tool.error is never sampled.
     · exact counts survive: every event in a kept OR dropped session is
       counted into a per-day tally in localStorage, and yesterday's tally is
       sent unsampled as activity.rollup on the next load.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  if (global.OmegaEvents) return;

  var ENDPOINT = '/api/events';
  var NEVER_SAMPLED = { 'tool.error': 1, 'activity.rollup': 1 };
  var FLUSH_MS = 5000, MAX_BATCH = 20, MAX_QUEUE = 200, MAX_ERRORS = 10;
  var MAX_BYTES = 3 * 1024 * 1024;
  var KEEPALIVE_MAX = 60000;   /* fetch keepalive refuses bodies over 64KB */

  var state = 'waiting';       /* waiting | live | off */
  var cfg = null, queue = [], pending = [], timer = null, errorsSent = 0;
  var sid = null, kept = false;

  function now() { return Date.now(); }
  function safe(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { return undefined; } }; }
  function ss(k, v) { try { if (arguments.length > 1) sessionStorage.setItem(k, v); return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ls(k, v) { try { if (arguments.length > 1) localStorage.setItem(k, v); return localStorage.getItem(k); } catch (e) { return null; } }

  function rid() {
    var a = '', c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var buf = null;
    try { buf = global.crypto.getRandomValues(new Uint8Array(20)); } catch (e) {}
    for (var i = 0; i < 20; i++) a += c.charAt((buf ? buf[i] : Math.floor(Math.random() * 256)) % c.length);
    return a;
  }

  /* FNV-1a → [0,1). The keep decision is a pure function of the session id,
     so it is stable for the life of the tab. */
  function unit(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; }
    return h / 4294967296;
  }

  function session() {
    if (sid) return sid;
    sid = ss('omega-ev-sid') || ss('omega-ev-sid', rid());
    return sid;
  }

  function day(t) {
    var d = new Date(t || now());
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* ── exact counts ─────────────────────────────────────────────────────── */
  function readTally() {
    var t = null; try { t = JSON.parse(ls('omega-ev-tally') || 'null'); } catch (e) {}
    return t && t.day && t.counts ? t : null;
  }
  /* A finished day's tally moves to its own key to be sent; today starts
     fresh. Run on load as well as on each event, or a day with no events on
     the next load would never be sent. */
  function rollover() {
    var t = readTally();
    if (t && t.day !== day()) { ls('omega-ev-rollup', JSON.stringify(t)); t = null; }
    t = t || { day: day(), counts: {} };
    ls('omega-ev-tally', JSON.stringify(t));
    return t;
  }
  function tally(name, tool) {
    var t = rollover(), k = name + (tool ? '|' + tool : '');
    t.counts[k] = (t.counts[k] || 0) + 1;
    ls('omega-ev-tally', JSON.stringify(t));
  }
  function sendRollup() {
    rollover();
    var t = null; try { t = JSON.parse(ls('omega-ev-rollup') || 'null'); } catch (e) {}
    try { localStorage.removeItem('omega-ev-rollup'); } catch (e) {}
    if (t && t.day && t.counts) enqueue('activity.rollup', { day: t.day, counts: t.counts }, true);
  }

  /* Raw inputs are copied AT THE MOMENT OF THE RUN: a tool that mutates its
     state object afterwards must not rewrite history, and something that
     cannot be serialised (a DOM node, a cycle) becomes null here rather than
     breaking the batch it would have travelled in. */
  function snapshot(v) {
    if (v === undefined) return null;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; }
  }

  /* ── the queue ────────────────────────────────────────────────────────── */
  function enqueue(name, props, force) {
    var ev = { id: rid(), sid: session(), name: name, at: now(), props: props || {} };
    if (state === 'off') return;
    if (state === 'waiting') { if (pending.length < MAX_QUEUE) pending.push([ev, force]); return; }
    admit(ev, force);
  }
  function admit(ev, force) {
    if (ev.name !== 'activity.rollup') tally(ev.name, ev.props && ev.props.toolId);
    if (!force && !NEVER_SAMPLED[ev.name] && !kept) return;
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(ev);
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }

  function token() {
    try {
      var u = global.firebase && firebase.auth && firebase.auth().currentUser;
      return u ? u.getIdToken() : Promise.reject(new Error('signed out'));
    } catch (e) { return Promise.reject(e); }
  }

  function post(batch, unloading, attempt) {
    var body;
    try { body = JSON.stringify({ events: batch }); } catch (e) { return Promise.resolve(); }
    return token().then(function (t) {
      return fetch(ENDPOINT, {
        method: 'POST', credentials: 'same-origin',
        keepalive: !!unloading && body.length < KEEPALIVE_MAX,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: body
      });
    }).then(function (r) {
      if (r.status === 202) { state = 'off'; queue = []; return; }  /* the server turned us off */
      if (r.status >= 500 && !unloading && attempt < 3) {
        return new Promise(function (ok) { setTimeout(ok, 2000 * Math.pow(2, attempt)); })
          .then(function () { return post(batch, false, attempt + 1); });
      }
    })['catch'](function () { /* fail silent: telemetry never surfaces to a user */ });
  }

  var flush = safe(function (unloading) {
    clearTimeout(timer); timer = null;
    if (state !== 'live' || !queue.length) return;
    /* Batches by count AND bytes: raw calculation inputs can be large, and
       the server refuses a batch over 4MB whole. */
    while (queue.length) {
      var batch = [], size = 0;
      while (queue.length && batch.length < MAX_BATCH) {
        var n = 0; try { n = JSON.stringify(queue[0]).length; } catch (e) { queue.shift(); continue; }
        if (batch.length && size + n > MAX_BYTES) break;
        batch.push(queue.shift()); size += n;
      }
      if (batch.length) post(batch, unloading === true, 0);
    }
  });

  /* ── going live ───────────────────────────────────────────────────────── */
  function decide(c) {
    cfg = c || { enabled: false };
    if (!cfg.enabled) { state = 'off'; pending = []; return; }
    state = 'live';
    kept = unit(session()) < (Number(cfg.sampleRate) || 0);
    sendRollup();
    var p = pending; pending = [];
    for (var i = 0; i < p.length; i++) admit(p[i][0], p[i][1]);
  }

  function ask() {
    var memo = ss('omega-ev-cfg');
    if (memo) { try { var m = JSON.parse(memo); if (now() - m.at < 600000) return decide(m.c); } catch (e) {} }
    token().then(function (t) {
      return fetch(ENDPOINT, { headers: { Authorization: 'Bearer ' + t }, credentials: 'same-origin' });
    }).then(function (r) { return r.ok ? r.json() : { enabled: false }; })
      .then(function (c) { ss('omega-ev-cfg', JSON.stringify({ at: now(), c: c })); decide(c); })
      ['catch'](function () { decide({ enabled: false }); });
  }

  /* ── automatic events ─────────────────────────────────────────────────── */
  /* tool id from the page path, against OMEGATools' own catalogue when the
     page loaded it; the editor has no `file` there so it is named by hand. */
  function pageTool() {
    var p = String(global.location && location.pathname || '').replace(/\/+$/, '') || '/';
    if (/^\/editor(\.html)?$/.test(p)) return 'editor';
    if (/^\/portals\/finance(\/index\.html)?$/.test(p)) return 'finance';
    try {
      var cat = global.OMEGATools && OMEGATools.catalog && OMEGATools.catalog();
      for (var i = 0; cat && i < cat.length; i++) {
        var f = String(cat[i].file || '').replace(/\.html$/, '');
        if (f && (p === f || p === f + '.html')) return cat[i].id;
      }
    } catch (e) {}
    var m = /^\/([a-z0-9-]+)\.html$/.exec(p);
    return m ? m[1] : null;
  }

  function projectFromUrl() {
    try { return new URLSearchParams(location.search).get('project') || null; } catch (e) { return null; }
  }

  var onSignedIn = safe(function () {
    if (onSignedIn.done) return; onSignedIn.done = true;
    if (!ss('omega-ev-started')) {
      ss('omega-ev-started', '1');
      enqueue('session.started', { referrer: String(document.referrer || '').slice(0, 300), page: location.pathname });
    }
    var tool = pageTool();
    if (tool) enqueue('tool.opened', { toolId: tool, projectId: projectFromUrl() });
    ask();
  });

  function watchAuth(n) {
    try {
      if (global.firebase && firebase.apps && firebase.apps.length && firebase.auth) {
        firebase.auth().onAuthStateChanged(function (u) { if (u) onSignedIn(); });
        return;
      }
    } catch (e) {}
    if (n < 120) setTimeout(function () { watchAuth(n + 1); }, 500);
  }

  var onError = safe(function (msg, stack) {
    if (errorsSent >= MAX_ERRORS) return;
    msg = String(msg || '');
    if (!msg || msg === 'Script error.') return;   /* cross-origin, says nothing */
    errorsSent++;
    enqueue('tool.error', { toolId: pageTool(), calc: 'page', message: msg.slice(0, 500),
                            stack: String(stack || '').slice(0, 4000) });
  });

  try {
    global.addEventListener('error', function (e) { onError(e && e.message, e && e.error && e.error.stack); });
    global.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason; onError(r && r.message || r, r && r.stack);
    });
    global.addEventListener('pagehide', function () { flush(true); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
  } catch (e) {}

  /* ── public API ───────────────────────────────────────────────────────── */
  var emit = safe(function (name, props) { enqueue(String(name), snapshot(props || {}) || {}); });

  function run(toolId, calc, inputs, work, projectId) {
    var t0 = now(), out;
    function rec(ok, result) {
      try {
        enqueue('tool.run', { toolId: toolId, calc: calc, durationMs: now() - t0, ok: ok,
                              projectId: projectId || null, inputs: snapshot(inputs),
                              outputs: ok ? snapshot(result) : null });
      } catch (e) {}
    }
    try { out = work(); } catch (err) { rec(false); error(toolId, calc, err); throw err; }
    if (out && typeof out.then === 'function') {
      return out.then(function (v) { rec(true, v); return v; },
                      function (err) { rec(false); error(toolId, calc, err); throw err; });
    }
    rec(true, out);
    return out;
  }

  var error = safe(function (toolId, calc, err) {
    if (errorsSent >= MAX_ERRORS) return;
    errorsSent++;
    enqueue('tool.error', { toolId: toolId, calc: calc,
      message: String((err && err.message) || err || '').slice(0, 500),
      stack: String((err && err.stack) || '').slice(0, 4000) });
  });

  global.OmegaEvents = { emit: emit, run: run, error: error, flush: function () { flush(); },
                         _state: function () { return { state: state, kept: kept, queued: queue.length, sid: sid }; } };
  watchAuth(0);
})(typeof window !== 'undefined' ? window : this);
