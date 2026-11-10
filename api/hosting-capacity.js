/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/hosting-capacity {lat, lng, unit:{kw,kwh,name}, substation?:{name,kv,km}, mode?:'storage'}
   GET  /api/hosting-capacity?coverage=1

   The circuit step, nationally (DESIGN C6, 2026-10-17). One question: at
   this point, whose wire is it, what does that utility PUBLISH as the room
   on it, and does the unit fit? Answered in four moves:

     1. the serving-utility candidates (api/_lib/utility-territory.js);
     2. each candidate whose published map is wired (api/_lib/hosting-sources.js)
        is asked at the point — a small envelope first, then wider (ComEd at
        its own 46 m rule) — and the one that returns a feature is the wire;
     3. its rows are normalised to kW circuits, nearest first;
     4. the nearest circuit with a figure is judged by THE engine,
        api/_lib/grid-verdict.js, in-process (the same one /api/grid-verdict
        runs; never a second copy).

   Where nothing is published it says so in plain words and hands back the
   utility's own map or process to verify (coverage: none-here,
   no-public-map, account-required, not-wired, unreachable, outside).

   THE GATE is /api/grid-verdict's: a signed-in member of a workspace, or
   staff, holding a module that carries Grid Atlas; a person may ask 30 times
   a minute. Nothing is cached in the browser (no-store).

   THE CACHE. hosting_cache/{sourceKey}__{lat4}_{lng4} (about 11 m): a hit
   for 7 days, an empty answer for 24 hours, an error never — a map that was
   down for eight seconds must not become "nothing published here" for a
   week. Only a WHOLE answer is kept: never a partial reading (a layer, a
   join, a restriction or a season that did not answer), never a search the
   time budget cut short (that is a timeout, not an empty), and an older
   copy read only because the current map failed is kept for an hour. SDG&E's
   terms forbid replicating its map, so it is never cached. The territory
   answer (unless a guess, or missing one of its layers) and a moved
   service's resolved name are cached the same way (_territory__…,
   _resolve_<key>). Admin SDK only; the rules close the collection.

   THE TIME. 20 s in all; the territory gets half, each source 8 s. A
   request with no time left is never sent, and one with a little gets at
   least 250 ms — never the 8-second default.

   WHOSE WIRE. Only the territory's strong candidates are asked while it has
   any: a candidate its layers marked weak (JCP&L inside Butler, where the
   state's own layer names only the borough) is never asked, so its map can
   never become the wire over a strong one. And the answer is confident only
   when nothing else on the territory maps could be the wire (compose()).

   NOTHING UPSTREAM IS ECHOED: not a body, not an error page, not a URL. A
   source is named by its registry key and an outcome word. */
'use strict';
var A = require('./_lib/admin'), GV = require('./_lib/grid-verdict'), HS = require('./_lib/hosting-sources'), UT = require('./_lib/utility-territory');

var MODULES = ['gridatlas', 'siteintel', 'sitefinder', 'compute'];
var VERSION = 'hosting-v1';
var SOURCE_MS = 8000, TOTAL_MS = 20000;
var CACHE = 'hosting_cache';
var HIT_TTL_MS = 7 * 24 * 3600 * 1000, EMPTY_TTL_MS = 24 * 3600 * 1000, RESOLVE_TTL_MS = 24 * 3600 * 1000, STALE_TTL_MS = 3600 * 1000;
var PER_MINUTE = 30;
var MAX_PROBES = 4;
var STATE_LAYER_KEYS = UT.STATE_LAYERS.map(function (l) { return l.key; });
var AREA_FAILED = {};
UT.SERVICE_AREAS.forEach(function (l) { AREA_FAILED[l.key] = l.words.failed; });
var UA = 'ClearSky-OMEGA hosting capacity (https://clearskyomega.com)';

module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') throw A.httpError(405, 'POST or GET only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    if (req.method === 'GET') {
      var q = req.query || {};
      if (String(q.coverage || '') !== '1') throw A.httpError(400, 'GET answers ?coverage=1 only');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return { version: VERSION, sources: HS.VERSION, states: HS.STATES.slice(), coverage: HS.coverage() };
    }
    return require('./_lib/package-access').withCaller(caller, MODULES, { produce: false }).then(function () {
      require('./_lib/embed').rateLimit('hosting:' + (caller.uid || caller.email || caller.orgId), PER_MINUTE);
      var b = req.body && typeof req.body === 'object' ? req.body : {};
      var lat = num(b.lat), lng = num(b.lng);
      if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180)
        throw A.httpError(400, 'lat and lng are required as finite numbers');
      res.setHeader('Cache-Control', 'no-store');
      return run({ lat: lat, lng: lng, unit: b.unit, substation: b.substation, mode: b.mode }, liveDeps(caller));
    });
  });
});

function num(v) { if (v === null || v === undefined || v === '') return null; var n = +v; return isFinite(n) ? n : null; }

/* ── transport ──────────────────────────────────────────────────────────
   fetchJson(url, {timeoutMs, headers}) → Promise<json>; a 204 is
   {__noContent:true}; anything that is not JSON (a bot wall's HTML) is
   `blocked`; nothing upstream is kept beyond the parsed object.
   timeoutMs is the time the caller has left: absent is the 8-second
   default, 0 (or less) is none — the request is not sent and it is a
   timeout — and a little is at least 250 ms. */
function lateError() { var e = new Error('timeout'); e.timeout = true; return e; }
function liveFetchJson(url, opts) {
  opts = opts || {};
  var ms = opts.timeoutMs != null && isFinite(opts.timeoutMs) ? +opts.timeoutMs : SOURCE_MS;
  if (!(ms > 0)) return Promise.reject(lateError());
  var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, Math.max(250, ms));
  var headers = { Accept: 'application/json', 'User-Agent': UA };
  var k; for (k in (opts.headers || {})) if (opts.headers.hasOwnProperty(k)) headers[k] = opts.headers[k];
  return fetch(url, { method: 'GET', headers: headers, signal: ctl.signal, redirect: 'error' }).then(function (r) {
    if (r.status === 204) return { __noContent: true };
    return r.text().then(function (t) {
      var j; try { j = JSON.parse(t); } catch (e) { var b = new Error('not JSON'); b.blocked = true; b.status = r.status; throw b; }
      if (!r.ok && !(j && j.errors)) { var x = new Error('HTTP ' + r.status); x.status = r.status; throw x; }
      return j;
    });
  }).then(function (j) { clearTimeout(timer); return j; }, function (e) { clearTimeout(timer); throw e; });
}
function liveDeps(caller) {
  return { fetchJson: liveFetchJson, now: Date.now, log: function (m) { console.log('[hosting]', caller && caller.orgId, m); },
    db: function () { return A.isDegraded && A.isDegraded() ? null : A.db(); } };
}
function outcomeOf(err) {
  if (!err) return 'error';
  if (err.name === 'AbortError' || err.timeout) return 'timeout';
  if (err.blocked) return 'blocked';
  if (err.service) return 'service error';
  return err.status ? 'error HTTP ' + err.status : 'error';
}

/* ── the cache (a saving, never a source of errors) ──────────────────── */
function cacheId(key, lat, lng) { return key + '__' + lat.toFixed(4) + '_' + lng.toFixed(4); }
/* A document written by another release of the registry is a miss: its
   circuits were normalised by rules that may since have changed. */
function cacheGet(deps, id) {
  return Promise.resolve().then(function () {
    var db = deps.db && deps.db(); if (!db) return null;
    return db.collection(CACHE).doc(id).get();
  }).then(function (s) {
    var d = s && s.exists ? (typeof s.data === 'function' ? s.data() : s.data) : null;
    if (!d || d.v !== HS.VERSION || !(d.expiresAt > (deps.now ? deps.now() : Date.now()))) return null;
    return d;
  }, function () { return null; });
}
function cachePut(deps, id, doc, ttl) {
  return Promise.resolve().then(function () {
    var db = deps.db && deps.db(); if (!db) return null;
    var now = deps.now ? deps.now() : Date.now();
    doc.v = HS.VERSION; doc.cachedAt = new Date(now).toISOString(); doc.expiresAt = now + ttl;
    return db.collection(CACHE).doc(id).set(doc);
  }).catch(function (e) { if (deps.log) deps.log('cache write failed — ' + (e && e.message)); });
}

/* ── territory, cached ───────────────────────────────────────────────── */
var TERRITORY_MS = 10000;   /* the territory gets half the time; the maps get the rest */
function territory(lat, lng, deps, t0) {
  var id = cacheId('_territory', lat, lng);
  return cacheGet(deps, id).then(function (hit) {
    if (hit && hit.territory) { hit.territory.tried = [{ source: 'territory', ms: 0, outcome: 'cache' }]; return hit.territory; }
    return UT.at(lat, lng, { fetchJson: deps.fetchJson, timeoutMs: SOURCE_MS, deadline: (t0 || deps.now()) + TERRITORY_MS, now: deps.now }).then(function (t) {
      /* a guess, or an answer missing a layer (NJDEP, the CEC, Census
         places), is used once and never kept: the state's own authority
         missed for eight seconds must not be missed for a week */
      if (t.approximate || t.partial) return t;
      var keep = { candidates: t.candidates, confident: t.confident, caution: t.caution || null, source: t.source, approximate: false, states: t.states };
      return cachePut(deps, id, { territory: keep }, t.candidates.length ? HIT_TTL_MS : EMPTY_TTL_MS).then(function () { return t; });
    });
  });
}

/* ── one source at the point ─────────────────────────────────────────── */
function remaining(budget, deps) { return Math.max(0, budget.until - deps.now()); }
/* One request inside a budget: with no time left it is never sent. */
function within(deps, budget, url, headers) {
  var left = remaining(budget, deps);
  if (left <= 0) return Promise.reject(lateError());
  return deps.fetchJson(url, { timeoutMs: Math.min(SOURCE_MS, left), headers: headers || null });
}
function serviceGone(j) {
  var e = j && j.error; if (!e) return false;
  return e.code === 400 || e.code === 404 || e.code === 499 || /not found|invalid url|does not exist/i.test(String(e.message || ''));
}
/* a moved service, found again through the utility's own web map */
function resolveLayer(entry, layer, deps, budget) {
  if (!layer.resolve) return Promise.resolve(null);
  var id = '_resolve_' + entry.key;
  return cacheGet(deps, id).then(function (hit) {
    if (hit && hit.url) return hit.url;
    return within(deps, budget, HS.webmapData(layer.resolve.webmap)).then(function (j) {
      var url = HS.resolveFromWebmap(j, layer.resolve.match);
      if (!url || url === layer.url) return null;
      return cachePut(deps, id, { url: url }, RESOLVE_TTL_MS).then(function () { return url; });
    }, function () { return null; });
  });
}
function queryLayer(entry, layer, lid, lat, lng, r, geometry, deps, budget) {
  function go(L) {
    var url = layer.comed ? HS.comedQuery(L, lat, lng) : HS.arcgisQuery(L, lid, lat, lng, r, geometry);
    return within(deps, budget, url, layer.comed ? HS.comedHeaders() : null);
  }
  return Promise.resolve().then(function () { return go(layer); }).then(function (j) {
    if (!serviceGone(j)) return j;
    return resolveLayer(entry, layer, deps, budget).then(function (url) {
      if (!url) return j;
      var moved = {}; var k; for (k in layer) if (layer.hasOwnProperty(k)) moved[k] = layer[k];
      moved.url = url;
      return go(moved);
    });
  }).then(function (j) {
    if (!j || typeof j !== 'object' || j.error) { var e = new Error('service error'); e.service = true; throw e; }
    return { layer: layer, features: Array.isArray(j.features) ? j.features : [] };
  });
}
/* Radii widen until a circuit with a published figure is found. Each radius
   asks every layer again, so the answer is the LAST radius asked:
     - out of time before every radius was asked, with no figure yet: a
       timeout, never an "empty" kept for a day;
     - a layer that makes circuits failed there and nothing was found: that
       failure, never "none here";
     - a required join (a restriction, which can only lower the figure)
       failed: that failure, never the figure without it;
     - anything else that failed there (one side, a join): the answer, marked
       `partial` — said, and never kept. */
function probeArcgis(entry, spec, lat, lng, mode, deps, budget) {
  var layers = HS.layersFor(spec, mode), radii = spec.radii || entry.radii || [60, 150, 400];
  var geometry = spec.geometry || entry.geometry, i = 0, last = null, lastCoreErr = null;
  function step() {
    if (i >= radii.length) {
      if ((!last || last.outcome === 'empty') && lastCoreErr) return Promise.reject(lastCoreErr);
      return Promise.resolve(last || { outcome: 'empty', circuits: [] });
    }
    if (remaining(budget, deps) <= 250) return Promise.reject(lateError());
    var r = radii[i++];
    var asks = [];
    layers.forEach(function (layer) { (layer.ids || [0]).forEach(function (lid) {
      asks.push(queryLayer(entry, layer, lid, lat, lng, r, geometry, deps, budget).then(function (x) { return x; }, function (err) { return { layer: layer, err: err }; }));
    }); });
    return Promise.all(asks).then(function (got) {
      var core = got.filter(function (g) { return !g.layer.join; });
      var coreFailed = core.filter(function (g) { return g.err; });
      if (core.length && coreFailed.length === core.length) throw coreFailed[0].err;
      var must = got.filter(function (g) { return g.err && g.layer.join && g.layer.required; })[0];
      if (must) throw must.err;
      var ok = got.filter(function (g) { return !g.err; });
      var circuits = HS.normalize(entry, spec, ok, { lat: lat, lng: lng, mode: mode });
      lastCoreErr = coreFailed.length ? coreFailed[0].err : null;
      last = { outcome: circuits.length ? 'features' : 'empty', circuits: circuits, radiusM: r, partial: got.some(function (g) { return g.err; }) };
      if (circuits.some(function (c) { return c.publishedKw != null; })) return last;
      return step();
    });
  }
  return Promise.resolve().then(step);
}
var OFFSETS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function probeEnvelio(entry, spec, lat, lng, mode, deps, budget) {
  var host = spec.envelio.host, radii = spec.radii || [0, 25];
  var points = [{ lat: lat, lng: lng, off: 0 }];
  radii.slice(1).forEach(function (m) {
    OFFSETS.forEach(function (o) { points.push({ lat: lat + o[0] * m / 111320, lng: lng + o[1] * m / (111320 * Math.cos(lat * Math.PI / 180)), off: m }); });
  });
  var i = 0;
  function parcel() {
    if (i >= points.length) return Promise.resolve(null);
    var p = points[i++];
    if (remaining(budget, deps) <= 250) return Promise.reject(lateError());
    return within(deps, budget, HS.envelioParcel(host, p.lat, p.lng)).then(function (j) {
      var d = j && !j.__noContent ? (j.data || j) : null;
      if (d && d.parcel_id != null) return { id: d.parcel_id, off: p.off, name: d.name };
      return parcel();
    });
  }
  return Promise.resolve().then(parcel).then(function (pc) {
    if (!pc) return { outcome: 'empty', circuits: [] };
    var asks = [];
    ['gen', 'load'].forEach(function (b) { HS.SEASONS.forEach(function (s) { asks.push({ behavior: b, season: s }); }); });
    /* every season of both sides, or it is a partial reading: the smallest
       of fewer seasons is not the published minimum, so it is said and
       never kept; once the budget is spent no further batch is sent */
    var out = [], missed = 0, firstErr = null, stopped = false;
    function batch(k) {
      if (k >= asks.length) return Promise.resolve();
      if (remaining(budget, deps) <= 250) { stopped = true; missed += asks.length - k; return Promise.resolve(); }
      var slice = asks.slice(k, k + 4);
      return Promise.all(slice.map(function (a) {
        return within(deps, budget, HS.envelioSidebar(host, pc.id, a.behavior, a.season))
          .then(function (j) { if (j && j.data) out.push({ behavior: a.behavior, season: a.season, data: j.data }); },
                function (err) { missed++; if (!firstErr) firstErr = err; });
      })).then(function () { return batch(k + 4); });
    }
    return batch(0).then(function () {
      if (!out.length) {
        if (stopped) throw lateError();
        if (firstErr) throw firstErr;
        var e = new Error('service error'); e.service = true; throw e;
      }
      var circuits = HS.normalize(entry, spec, [{ envelio: out }], { lat: lat, lng: lng, mode: mode });
      circuits.forEach(function (c) { c.distanceM = (c.distanceM || 0) + pc.off; });
      return { outcome: circuits.length ? 'features' : 'empty', circuits: circuits, radiusM: pc.off, partial: missed > 0 };
    });
  });
}
function probeSpec(entry, spec, lat, lng, mode, deps, budget) {
  var kind = spec.kind || entry.kind;
  if (kind === 'envelio') return probeEnvelio(entry, spec, lat, lng, mode, deps, budget);
  return probeArcgis(entry, spec, lat, lng, mode, deps, budget);
}
function serviceLabel(spec) {
  var L = (spec.layers || [])[0];
  if (!L) return spec.envelio ? 'parcel navigator' : null;
  if (L.comed) { var m = /services\/([^/]+)\/FeatureServer/.exec(require('./_lib/comed-service').SERVICE); return (m ? m[1] : 'ComEd service') + ' layer ' + L.ids.join(','); }
  var s = /services\/(?:[^/]+\/)*?([^/]+)\/(?:Feature|Map)Server/.exec(L.url);
  return (s ? s[1] : 'service') + ' layer' + (L.ids.length > 1 ? 's ' : ' ') + L.ids.join(',');
}
function sourceOf(entry, spec, result, fellBack) {
  var best = (result.circuits || []).filter(function (c) { return c.publishedKw != null; })[0] || (result.circuits || [])[0] || null;
  var within = spec.resolvedWithinM !== undefined ? spec.resolvedWithinM : entry.resolvedWithinM;
  var grain = spec.grain || entry.grain;
  return {
    key: entry.key, label: entry.display + '\'s published hosting capacity' + (fellBack ? ', from ' + spec.label : ''),
    grain: grain, grainWords: HS.GRAIN_WORDS[grain] || grain,
    addressResolved: !!(best && within != null && (best.distanceM == null ? (spec.kind || entry.kind) === 'comed' : best.distanceM <= within)),
    distanceM: best ? best.distanceM : null, refreshed: best ? best.refreshed : null, units: entry.units || 'kW',
    layer: serviceLabel(spec), radiusM: result.radiusM != null ? result.radiusM : null, stale: !!(fellBack && spec.stale)
  };
}
/* Phase one asks a source's primary map. When that is empty or fails and
   the source has a fallback (a legacy map, an older copy), phase two asks it
   — but only when no other candidate's map answered at the point: a slow
   legacy map is never waited on to confirm what a neighbour already showed. */
function attemptSpec(entry, spec, fellBack, lat, lng, mode, deps, budget, tried) {
  var s0 = deps.now();
  return probeSpec(entry, spec, lat, lng, mode, deps, budget).then(function (r) {
    tried.push({ source: entry.key + (fellBack ? ':fallback' : ''), ms: deps.now() - s0,
      outcome: (r.outcome === 'features' ? 'features ' + r.circuits.length : 'empty') + (r.partial ? ' (partial)' : '') });
    r.source = sourceOf(entry, spec, r, fellBack);
    return r;
  }, function (err) {
    tried.push({ source: entry.key + (fellBack ? ':fallback' : ''), ms: deps.now() - s0, outcome: outcomeOf(err) });
    return { outcome: outcomeOf(err) === 'timeout' ? 'timeout' : (err && err.blocked ? 'blocked' : 'error'), circuits: [] };
  });
}
function probeKey(entry, mode, lat, lng) { return cacheId(entry.key + (mode !== 'storage' ? '-' + mode : ''), lat, lng); }
/* Only a whole answer is kept: never an error or a timeout, never a partial
   reading. `ttl` shortens it (an older copy standing in for a failed map). */
function remember(entry, mode, lat, lng, deps, r, ttl) {
  if (entry.cache === false || !(r.outcome === 'features' || r.outcome === 'empty') || r.partial) return Promise.resolve(r);
  return cachePut(deps, probeKey(entry, mode, lat, lng), { result: { outcome: r.outcome, circuits: r.circuits, source: r.source || null, radiusM: r.radiusM || null } },
    ttl || (r.outcome === 'features' ? HIT_TTL_MS : EMPTY_TTL_MS)).then(function () { return r; });
}
function probe(entry, lat, lng, mode, deps, deadline, tried) {
  var useCache = entry.cache !== false, t0 = deps.now();
  return (useCache ? cacheGet(deps, probeKey(entry, mode, lat, lng)) : Promise.resolve(null)).then(function (hit) {
    if (hit && hit.result) { tried.push({ source: entry.key, ms: 0, outcome: 'cache (' + hit.result.outcome + ')' }); return hit.result; }
    var budget = { until: Math.min(t0 + SOURCE_MS, deadline) };
    return attemptSpec(entry, entry, false, lat, lng, mode, deps, budget, tried).then(function (r) {
      var why = r.outcome === 'features' ? null : (r.outcome === 'empty' ? 'empty' : 'error');
      if (entry.fallback && why && (entry.fallbackOn || ['error']).indexOf(why) >= 0) { r.pendingFallback = true; return r; }
      return remember(entry, mode, lat, lng, deps, r);
    });
  });
}
function probeFallback(entry, r, lat, lng, mode, deps, deadline, tried) {
  var budget = { until: Math.min(deps.now() + SOURCE_MS, deadline) };
  return attemptSpec(entry, entry.fallback, true, lat, lng, mode, deps, budget, tried).then(function (f) {
    /* the fallback's answer when it has one (its wider search names the
       radius). After the primary FAILED it is an older copy standing in
       (ACE's June publication, SCE's year-old copy): kept an hour, so the
       current map is read again soon, never a week under the primary's key. */
    if (f.outcome === 'features' || f.outcome === 'empty') return remember(entry, mode, lat, lng, deps, f, r.outcome === 'empty' ? null : STALE_TTL_MS);
    /* the fallback did not answer: the primary's "no parcel here" is not
       "none here" (that is why the fallback was asked), so it is the
       fallback's failure, and nothing is kept */
    return f;
  });
}

/* ── the words ───────────────────────────────────────────────────────── */
/* Which side a one-sided figure is, for a battery (storage) question only:
   an export or a load question reads one side by design. A side missing
   because its layer did not answer is said so, never "not published". */
function sideWords(entry, ctx) {
  var p = (entry && entry.publishes) || {};
  if (ctx.mode && ctx.mode !== 'storage') return { words: '', partial: false };
  if (ctx.basis === 'gen') return ctx.partial && (p.load || p.storage)
    ? { words: ' Only its generation (export) figure answered here; its charging side did not, so ask again for the storage figure.', partial: true }
    : { words: ' It is published for generation (export) only; the charging side is not published.', partial: false };
  if (ctx.basis === 'load') return ctx.partial && (p.gen || p.storage)
    ? { words: ' Only its load (charging) figure answered here; its export side did not, so ask again for the storage figure.', partial: true }
    : { words: ' It is published for load (charging) only; the export side is not published.', partial: false };
  return { words: '', partial: false };
}
function noteFor(coverage, entry, util, ctx) {
  var who = util ? util.display : 'The serving utility';
  switch (coverage) {
    case 'read':
      var side = sideWords(entry, ctx);
      return who + ' publishes hosting capacity; this is its figure for ' + (ctx.source ? ctx.source.grainWords : 'the nearest circuit') +
        (ctx.source && ctx.source.distanceM ? ', ' + ctx.source.distanceM + ' m from the point' : '') + '.' + side.words +
        (ctx.source && ctx.source.stale ? ' The utility\'s current service did not answer, so an older copy was read; check the date.' : '') +
        (ctx.partial && !side.partial ? ' Part of its map did not answer, so this reading may be incomplete and is not kept; ask again in a minute.' : '') +
        ' A screening figure: ' + who + ' decides in its interconnection review.';
    case 'none-here':
      return who + '\'s hosting capacity map has no circuit within ' + (ctx.radiusM || 400) + ' m of this point. Downtown network areas and unmapped sections read this way; it is not a zero. Ask ' + who + ', or open its map.';
    case 'no-public-map':
      return (ctx.unassigned ? 'This point is unassigned under Georgia\'s Territorial Electric Service Act, so the site may choose its supplier. ' : '') +
        (entry && entry.note ? entry.note : who + ' does not publish hosting capacity; ask its interconnection team.');
    case 'account-required':
      return (entry && entry.note ? entry.note + ' ' : '') + 'OMEGA does not read it; open the utility\'s page to register.';
    case 'not-wired':
      return entry ? who + ': ' + (entry.note || 'a published map that OMEGA has not wired yet.') :
        who + ' is outside the utilities OMEGA has researched (' + HS.STATES.join(', ') + '); the DOE atlas lists the hosting capacity maps utilities publish.';
    case 'unreachable':
      return who + '\'s hosting capacity service did not answer (' + (ctx.why || 'it failed') + '). Try again in a minute, or open its map.';
    default:
      return 'No serving utility is on record at this point.';
  }
}

/* ── the whole question ──────────────────────────────────────────────── */
function modeOf(m) {
  m = String(m || '').toLowerCase();
  if (m === 'non-export' || m === 'load') return 'load';
  if (m === 'export' || m === 'pv' || m === 'gen') return 'export';
  return 'storage';
}
function run(input, deps) {
  deps = deps || {};
  if (!deps.now) deps.now = Date.now;
  var lat = +input.lat, lng = +input.lng, mode = modeOf(input.mode), t0 = deps.now(), deadline = t0 + TOTAL_MS, tried = [];
  return territory(lat, lng, deps, t0).then(function (terr) {
    tried = tried.concat(terr.tried || []);
    var seen = {}, list = [];
    /* only the strong candidates while there are any: a weak one's map
       (JCP&L's transformer points beside Butler) is never asked to decide */
    var strong = terr.candidates.filter(function (c) { return !c.weak; });
    (strong.length ? strong : terr.candidates).forEach(function (c) {
      var e = c.registryKey ? HS.byKey(c.registryKey) : null;
      if (e && e.status === 'verified' && !seen[e.key] && list.length < MAX_PROBES) { seen[e.key] = true; list.push(e); }
    });
    return Promise.all(list.map(function (e) { return probe(e, lat, lng, mode, deps, deadline, tried).then(function (r) { return { entry: e, r: r }; }); }))
      .then(function (probes) {
        var answered = probes.some(function (p) { return p.r.outcome === 'features' && p.r.circuits.length; });
        var pending = probes.filter(function (p) { return p.r.pendingFallback; });
        if (answered || !pending.length) return probes;
        return Promise.all(pending.map(function (p) {
          return probeFallback(p.entry, p.r, lat, lng, mode, deps, deadline, tried).then(function (f) { p.r = f; });
        })).then(function () { return probes; });
      })
      .then(function (probes) { return compose(input, mode, terr, probes, tried, lat, lng); });
  });
}
function compose(input, mode, terr, probes, tried, lat, lng) {
  var strong = terr.candidates.filter(function (c) { return !c.weak; }), strongKey = {};
  strong.forEach(function (c) { if (c.registryKey) strongKey[c.registryKey] = true; });
  /* the wire is a map that answered at the point, and never a weak
     candidate's over a strong one */
  var withWire = probes.filter(function (p) { return p.r.outcome === 'features' && p.r.circuits.length && (!strong.length || strongKey[p.entry.key]); });
  withWire.sort(function (a, b) {
    var da = a.r.circuits[0].distanceM == null ? 0 : a.r.circuits[0].distanceM, db = b.r.circuits[0].distanceM == null ? 0 : b.r.circuits[0].distanceM;
    return da - db;
  });
  var wire = withWire[0] || null, top = null, i;
  if (wire) {
    var mine = terr.candidates.filter(function (c) { return c.registryKey === wire.entry.key; });
    top = mine.filter(function (c) { return !c.weak; })[0] || mine[0] || null;
  }
  if (!top) top = strong[0] || terr.candidates[0] || null;
  var entry = wire ? wire.entry : (top && top.registryKey ? HS.byKey(top.registryKey) : null);
  var util = null;
  if (entry && entry.type !== 'group') util = { key: entry.key, display: entry.display, eiaId: (top && top.eiaId) || entry.eiaIds[0] || null, holding: entry.holding || (top && top.holding) || null };
  else if (top && !top.unassigned) util = { key: entry ? entry.key : null, display: top.display, eiaId: top.eiaId, holding: top.holding };

  var coverage, circuits = [], src = null, why = null;
  if (wire) { coverage = 'read'; circuits = wire.r.circuits; src = wire.r.source; }
  else if (!terr.candidates.length) coverage = 'outside';
  else if (top && top.unassigned) coverage = 'no-public-map';
  else if (!entry) coverage = 'not-wired';
  else if (entry.status === 'verified') {
    var mine = probes.filter(function (p) { return p.entry.key === entry.key; })[0];
    if (mine && mine.r.outcome === 'empty') { coverage = 'none-here'; src = mine.r.source || null; }
    else { coverage = 'unreachable'; why = mine ? (mine.r.outcome === 'timeout' ? 'it timed out' : mine.r.outcome === 'blocked' ? 'it answered with a bot wall, not data' : 'it returned an error') : 'it was not asked in time'; }
  }
  else if (entry.status === 'none') coverage = 'no-public-map';
  else if (entry.status === 'account') coverage = 'account-required';
  else coverage = 'not-wired';

  var best = null;
  for (i = 0; i < circuits.length; i++) if (circuits[i].publishedKw != null) { best = i; break; }
  if (best == null && circuits.length) best = 0;
  var c = best == null ? null : circuits[best];
  if (c) circuits.forEach(function (x) { x.ledgerId = (entry.kind === 'comed' ? x.id : entry.key + ':' + x.id).slice(0, 40); });
  var body = c ? HS.body(entry, src, c, mode) : null;
  /* a one-sided figure because the other side's layer did not answer (not
     because the utility does not publish it): the verdict says so too */
  if (body && wire && wire.r.partial && sideWords(entry, { mode: mode, basis: c.basis, partial: true }).partial) body.sideUnanswered = true;
  var verdict = GV.judge({ unit: input.unit, substation: input.substation, circuit: body });

  /* Confident only when nothing else on the territory maps could be the
     wire: one map answered, the territory carries no caution, the wire's
     candidate is not weak, and every OTHER strong candidate had a map of its
     own that was asked and came back empty. A rival with no map to ask (a
     co-op, a city utility, an account-only or unwired map) could never
     answer, so the one map that did proves nothing about it (Branchville:
     JCP&L's transformer points inside Sussex REC; Lavallette's borough). */
  var rivals = strong.filter(function (x) { return x !== top && !(wire && x.registryKey === wire.entry.key); });
  function provenEmpty(x) {
    var p = x.registryKey ? probes.filter(function (q) { return q.entry.key === x.registryKey; })[0] : null;
    return !!(p && p.r.outcome === 'empty' && !p.r.pendingFallback && !p.r.partial);
  }
  var confident = wire ? !terr.caution && withWire.length === 1 && !!top && !top.weak && rivals.every(provenEmpty) : !!terr.confident;
  var verify = entry && entry.viewerUrl ? { viewerUrl: entry.viewerUrl, label: entry.viewerLabel || entry.display + '\'s map' }
    : (coverage === 'not-wired' && !entry ? { viewerUrl: HS.DOE_ATLAS, label: 'the DOE atlas of utility hosting capacity maps' } : null);
  var partial = !!(wire && wire.r.partial);
  var note = noteFor(coverage, entry, util, { source: src, basis: c && c.basis, radiusM: src && src.radiusM, why: why, unassigned: !!(top && top.unassigned), mode: mode, partial: partial });
  /* the other strong candidates by name; the same utility under a second EIA id is not "another" */
  var others = [];
  strong.forEach(function (x) {
    if (x === top || (entry && entry.type !== 'group' && x.registryKey === entry.key) || others.indexOf(x.display) >= 0) return;
    others.push(x.display);
  });
  if (terr.caution) note += ' ' + terr.caution;
  else if (!confident && others.length) note += ' The territory maps also name ' + others.slice(0, 3).join(', ') + ' here; confirm the utility with a bill.';
  if (terr.approximate) note += ' Every territory layer failed, so the utility is a rough guess.';
  else if (terr.partial && (terr.failed || []).some(function (k) { return STATE_LAYER_KEYS.indexOf(k) >= 0; }))
    note += ' The state\'s own territory layer did not answer, so these candidates are the national layer\'s; confirm the utility with a bill.';
  (terr.failed || []).forEach(function (k) { if (AREA_FAILED[k]) note += ' ' + AREA_FAILED[k]; });

  /* every utility the territory names, with what it publishes (the
     registry's words, its route and its own pages): the list a person reads
     where no figure is read, or where more than one utility is mapped */
  var candidates = terr.candidates.map(function (x) {
    var o = {}, k;
    for (k in x) if (x.hasOwnProperty(k)) o[k] = x[k];
    o.hosting = HS.publication(x.registryKey ? HS.byKey(x.registryKey) : null);
    return o;
  });
  var source = src ? { key: src.key, label: src.label, grain: src.grain, addressResolved: src.addressResolved, distanceM: src.distanceM,
    refreshed: src.refreshed, units: src.units, layer: src.layer } : null;
  return {
    version: VERSION, point: { lat: lat, lng: lng },
    territory: { candidates: candidates, confident: confident, caution: terr.caution || null, source: terr.source, approximate: !!terr.approximate,
                 partial: !!terr.partial, evidence: wire ? 'hosting-layer' : (terr.candidates.length ? 'territory' : null) },
    utility: util, coverage: coverage, mode: mode, source: source,
    circuits: circuits, best: best, body: body, verdict: verdict,
    note: note, verify: verify, tried: tried
  };
}

module.exports._helpers = { run: run, compose: compose, probe: probe, probeFallback: probeFallback, territory: territory, modeOf: modeOf, cacheId: cacheId, noteFor: noteFor,
  liveFetchJson: liveFetchJson, MODULES: MODULES, TERRITORY_MS: TERRITORY_MS, VERSION: VERSION, SOURCE_MS: SOURCE_MS, TOTAL_MS: TOTAL_MS, CACHE: CACHE,
  HIT_TTL_MS: HIT_TTL_MS, EMPTY_TTL_MS: EMPTY_TTL_MS, STALE_TTL_MS: STALE_TTL_MS, PER_MINUTE: PER_MINUTE };
