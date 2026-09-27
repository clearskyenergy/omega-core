/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Authenticated, org-scoped Site Finder scoring. GET or action:'weights' reads
   metadata; POST rows/circuits computes both plays and server-side load/size.
   Flat scored[] serves omega-site-score.js; scores[id] is a compatibility view.
   See docs/sitefinder-server-config.md for wire contracts and deployment. */
'use strict';
var A = require('./_lib/admin');
var SS = require('./_lib/site-score');
var crypto = require('crypto');
var E = require('./_lib/embed');

/* The catalogue key in omega-tools.js AND the toolData doc id. One word, one
   meaning — the entitlement check and the weights read must not drift apart. */
var TOOL_KEY = 'sitefinder';

/* One screen of the map, generously. A Site Finder viewport carries tens of
   parcels; 500 covers "select the whole county" without letting one request
   become a minute of CPU on a shared serverless runtime. */
var MAX_ROWS = 500;

var BLOCKED_STATUS = ['pending', 'suspended', 'cancelled'];

/* A battery duration nobody types by accident. The DEFAULT duration is the
   library's (COST.DEFAULT_HOURS) and is deliberately not repeated here: an
   absent `hours` is passed as absent, and the effective value comes back in
   the response from the library's own output. */
var MAX_HOURS = 24;

/* How far a tenant may re-weight a play before the document reads as damaged
   rather than tuned. A RATIO against the defaults' own points sum, so this is
   not a second copy of "100" sitting next to the library's table: a play may be
   legitimately rescaled, it may not be zeroed out or fat-fingered by three
   orders of magnitude. */
var SANE_RATIO = 10;

function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

/* The library's own coercion, so this file judges a stored value by exactly the
   rule the merge will apply to it — num('20') is 20 there and must be 20 here,
   or the validator condemns documents the merge accepts. */
function num(v) {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function clone(v) {
  try { return JSON.parse(JSON.stringify(v)); }
  catch (e) { return v; }   /* numbers and strings; unreachable in practice */
}

/* The library is a sibling file and can be deployed without this one. If its
   surface is not what this endpoint was written against, say which export is
   missing: a TypeError deep in a loop names nothing. */
function libCheck() {
  var need = [['WEIGHT_DEFAULTS', 'object'], ['BANDS', 'object'],
              ['mergeWeights', 'function'], ['scoreRow', 'function']], i, v, want;
  for (i = 0; i < need.length; i++) {
    v = SS[need[i][0]]; want = need[i][1];
    if (want === 'function' ? typeof v !== 'function' : !v || typeof v !== 'object')
      throw A.httpError(500, 'api/_lib/site-score.js does not expose ' + need[i][0] +
        '; this endpoint cannot score without it');
  }
}

/* ── WEIGHT VALIDATION ───────────────────────────────────────────────────────
   Walks the DEFAULTS and reads the org's document through them, so this file
   never asserts a weight key the library did not define. See the header for
   what counts as fatal and what is only noted.
   ctx = { notes: [], fatal: [] }. */
function checkGroupValue(store, def, path, ctx) {
  var n = num(store);
  if (n === null) {
    ctx.fatal.push('weights: "' + path + '" is ' + JSON.stringify(store) + ', which is not a number');
    return null;
  }
  if (n < 0) {
    ctx.fatal.push('weights: "' + path + '" is negative (' + n + '); the merge would silently clamp it to 0');
    return null;
  }
  return n;
}

function checkWeights(stored, def, ctx) {
  var g, k, sub, term, defTerm, path, sumOrg, sumDef, v;
  for (g in def) {
    if (!has(def, g)) continue;
    if (typeof def[g] === 'number') {
      /* modelledPenalty — a multiplier, not a points table. */
      if (!has(stored, g)) continue;
      v = checkGroupValue(stored[g], def[g], g, ctx);
      if (v === null) continue;
      if (v <= 0 || v > 1) {
        ctx.fatal.push('weights: "' + g + '" is ' + v + '; it must be greater than 0 and no more than 1, or a ' +
          'modelled load would score at or above a metered one');
      }
      continue;
    }
    if (!isPlain(def[g])) continue;
    if (!has(stored, g)) continue;
    if (!isPlain(stored[g])) {
      ctx.notes.push('weights: "' + g + '" is not an object, so the whole ' + g + ' play was ignored and its defaults used');
      continue;
    }
    sumOrg = 0; sumDef = 0;
    for (k in def[g]) {
      if (!has(def[g], k)) continue;
      defTerm = def[g][k];
      sumDef += num(defTerm.pts) || 0;
      if (!has(stored[g], k) || !isPlain(stored[g][k])) {
        if (has(stored[g], k)) ctx.notes.push('weights: "' + g + '.' + k + '" is not an object, so its defaults were used');
        sumOrg += num(defTerm.pts) || 0;
        continue;
      }
      term = stored[g][k];
      /* pts and cap are the only two the merge reads. `label` and `note` are
         not noted: they are part of the object mergeWeights() hands back, so a
         settings panel that reads the weights and writes them again returns
         them, and a warning fired by round-tripping our own document is noise
         that teaches a reader to ignore the list. They are the library's text
         and a tenant cannot override them — the merge does not look. Anything
         the DEFAULT term does not define at all is still reported. */
      for (sub in term) {
        if (!has(term, sub) || has(defTerm, sub)) continue;
        ctx.notes.push('weights: "' + g + '.' + k + '.' + sub + '" is not something the scorer reads; it was ignored');
      }
      path = g + '.' + k;
      v = has(term, 'pts') ? checkGroupValue(term.pts, defTerm.pts, path + '.pts', ctx) : null;
      sumOrg += v === null ? (num(defTerm.pts) || 0) : v;
      if (has(term, 'cap')) checkGroupValue(term.cap, defTerm.cap, path + '.cap', ctx);
    }
    for (k in stored[g]) {
      if (!has(stored[g], k) || has(def[g], k)) continue;
      ctx.notes.push('weights: "' + g + '.' + k + '" is not a term this scorer reads; it was ignored');
    }
    if (sumDef > 0) {
      if (sumOrg <= 0) {
        ctx.fatal.push('weights: the ' + g + ' play sums to ' + sumOrg + ' points, so every site would score the same');
      } else if (sumOrg > sumDef * SANE_RATIO || sumOrg * SANE_RATIO < sumDef) {
        ctx.fatal.push('weights: the ' + g + ' play sums to ' + sumOrg + ' points against a default of ' + sumDef +
          ' — more than ' + SANE_RATIO + 'x off, which reads as a damaged document rather than a tuned one');
      }
    }
  }
  for (g in stored) {
    if (!has(stored, g) || has(def, g)) continue;
    ctx.notes.push('weights: "' + g + '" is not a play this scorer reads; it was ignored');
  }
}

/* Read the org's weights, or say why the defaults are being used. Never
   rejects: a tool that ranks nothing because a preferences document was
   unreachable is worse than one that ranks with the defaults and names it. */
function weightsFor(orgId, notes) {
  var def = SS.WEIGHT_DEFAULTS;
  return A.db().collection('toolData').doc(orgId).collection('tools').doc(TOOL_KEY).get()
    .then(function (snap) {
      var doc = snap.exists ? (snap.data() || {}) : null;
      if (!doc) return { weights: SS.mergeWeights(null), weightsSource: 'default' };
      /* omega-tool.js wraps tool state as { data: {...} }; a document written
         server-side may not. Accept both, prefer the wrapper. */
      var state = isPlain(doc.data) ? doc.data : doc;
      var stored = state.weights;
      if (stored === undefined || stored === null)
        return { weights: SS.mergeWeights(null), weightsSource: 'default' };
      if (!isPlain(stored)) {
        notes.push('weights: toolData/' + orgId + '/tools/' + TOOL_KEY +
          ' carries a "weights" value that is not an object; the defaults were used');
        return { weights: SS.mergeWeights(null), weightsSource: 'default' };
      }
      var ctx = { notes: [], fatal: [] }, i;
      checkWeights(stored, def, ctx);
      for (i = 0; i < ctx.notes.length; i++) notes.push(ctx.notes[i]);
      if (ctx.fatal.length) {
        for (i = 0; i < ctx.fatal.length; i++) notes.push(ctx.fatal[i]);
        notes.push('weights: this org’s weights were NOT used — every site below was scored with the defaults');
        return { weights: SS.mergeWeights(null), weightsSource: 'default' };
      }
      /* Merged ONCE for the whole page of rows, which is what the library's
         own comment on mergeWeights asks a caller to do. What comes back is
         also what the response reports, so the card and the audit agree. */
      return { weights: SS.mergeWeights(stored), weightsSource: 'org' };
    }, function (e) {
      notes.push('weights could not be read; the defaults were used');
      return { weights: SS.mergeWeights(null), weightsSource: 'default' };
    });
}

/* ── ENTITLEMENT ─────────────────────────────────────────────────────────────
   See the header for why absent is not denied. Staff pass; they are how a
   tenant's screen gets looked at when it is wrong. */
function entitle(caller, orgId) {
  var root = A.db().collection('omega_orgs').doc(orgId);
  return Promise.all([
    root.get(),
    A.billingOf(orgId),
    root.collection('members').doc(caller.uid).get()
  ]).then(function (r) {
    var org = r[0].exists ? (r[0].data() || {}) : null;
    var bill = r[1] || {};
    var member = r[2].exists ? (r[2].data() || {}) : null;
    if (caller.staff) return true;
    var access = require('./_lib/package-access');
    var projection = access.project(caller, bill, org, member, Date.now());
    access.requireModule(projection, 'sitefinder', { tools: ['sitefinder', 'sitediscovery'] });
    if (projection.packaged) return true;

    if (org) {
      var status = String(org.status || 'active');
      if (status !== 'active')
        throw A.httpError(403, 'this workspace is ' + status + '; Site Finder is unavailable until that changes');
    }
    var ov = bill.toolOverrides || {};
    if (ov[TOOL_KEY] === false) throw A.httpError(403, 'Site Finder is switched off for this workspace');
    if (Array.isArray(bill.toolAccess) && bill.toolAccess.indexOf(TOOL_KEY) < 0)
      throw A.httpError(403, 'Site Finder is not part of this workspace’s product');
    if (member) {
      if (member.status && member.status !== 'active') throw A.httpError(403, 'an active membership is required');
      if (Array.isArray(member.toolAccess) && member.toolAccess.indexOf(TOOL_KEY) < 0)
        throw A.httpError(403, 'Site Finder is not in your access list for this workspace');
    }
    return true;
  })['catch'](function (e) {
    if (e && e.status) throw e;
    /* "We refused you" and "we could not find out" are different sentences on
       the rep's screen, so they are different statuses here. */
    throw A.httpError(503, 'Site Finder entitlement could not be checked');
  });
}

/* ── ROW NORMALISATION ───────────────────────────────────────────────────────
   One mapping, and it is a DEFAULT, not a claim: a caller holding a flat
   `serviceKva` gets it read as `service.kva`, and a caller that already sends
   the `service` object the page writes keeps it untouched. Nothing else about
   the row is rewritten — inventing a field the library then scores is how a
   guess becomes a measurement. */
function normalise(row) {
  var out = {}, k;
  for (k in row) if (has(row, k) && k !== '__proto__') out[k] = row[k];
  if (!has(out, 'type')) out.type = row.useType;
  if (typeof row.annualKwh === 'number' || typeof row.annualKwh === 'string')
    out.annualKwh = { value: num(row.annualKwh), src: row.peakSource || 'unstated' };
  if (!out.feederId && isPlain(row.circuit)) out.feederId = row.circuit.feederId;
  var kva = has(row, 'serviceKva') ? num(row.serviceKva) : null;
  if (kva === null || isPlain(row.service)) return out;
  out.service = { kva: kva, src: 'row.serviceKva' };
  return out;
}

function scoreAll(rows, circuits, use, opts, weights, notes, scores) {
  var out = [], noId = 0, failed = 0, unstamped = 0, i, row, key, circuit, r, primary;
  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (!isPlain(row) || (typeof row.id !== 'string' && typeof row.id !== 'number') || String(row.id).trim() === '') { noId++; continue; }
    key = String(row.id);
    circuit = (isPlain(circuits) && has(circuits, key) && isPlain(circuits[key])) ? circuits[key] : null;
    if (!circuit && isPlain(row.circuit)) {
      circuit = Object.assign({}, row.circuit, { sellable: row.circuit.sellableKw });
    }
    /* A missing circuit is NOT a circuit with no capacity. null goes through so
       circuitCeiling() decides what an unknown feeder means, in the one place
       that rule lives. An entry that never says `known` is a caller sending
       something other than feederState(): counted and named below, because the
       library will quietly fall through to the record instead. */
    if (circuit && !has(circuit, 'known')) unstamped++;
    try {
      r = SS.scoreRow(normalise(row), circuit, weights, opts) || {};
      JSON.stringify(r, function (k, v) {
        if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite score');
        return v;
      });
      if (scores) scores[key] = {
        id: r.id, feederId: r.feederId, battery: r.battery, load: r.largeLoad,
        largeLoad: r.largeLoad, size: r.size, loadModel: r.load, band: r.band,
        inputBasis: 'caller-supplied screening inputs; not a capacity reservation'
      };
      primary = (use === 'load' ? r.largeLoad : r.battery) || {};
      var sz = r.size || {}, ld = r.load || {}, bd = r.band || null, lg = r.largeLoad || {};
      out.push({
        id: r.id, feederId: r.feederId,
        score: primary.score, outOf: primary.outOf,
        capped: primary.capped, cappedWhy: primary.cappedWhy, terms: primary.terms,
        loadScore: lg.score, loadOutOf: lg.outOf, loadTerms: lg.terms,
        kw: sz.kw, kwh: sz.kwh,
        loadCeiling: sz.loadCeiling, circuitCeiling: sz.circuitCeiling,
        circuitLimited: sz.circuitLimited, binds: sz.binds,
        /* Provenance rides with every number: circuitSrc 'record' means our own
           holds are not netted out of that headroom, which is the most
           important thing on the line when it is true. */
        circuitSrc: sz.circuitSrc, circuitKnown: sz.circuitKnown, why: sz.why,
        annualKwh: ld.annualKwh, peakKw: ld.peakKw, loadKw: ld.loadKw,
        basis: ld.basis, reason: ld.reason,
        band: bd ? { key: bd.key, label: bd.label } : null,
        hours: sz.hours
      });
    } catch (e) {
      failed++;
      out.push({ id: row.id, error: 'this row could not be scored' });
    }
  }
  if (noId) notes.push('rows: ' + noId + ' row(s) arrived with no id and were not scored — a score has to be attachable to the row it came from');
  if (failed) notes.push('rows: ' + failed + ' row(s) could not be scored; each carries its own "error" and no score, rather than a zero');
  if (unstamped) notes.push('circuits: ' + unstamped + ' entry(s) carried no "known" field, so they were not read as ledger circuits — ' +
    'send the object omega-capacity-ledger.js feederState() returns. Those sites fell back to the record’s own ' +
    'feederId and nameplate, if it had them.');
  return out;
}

module.exports = A.handler(function (req, res) {
  /* A prospect list is the tenant's commercial property. Nothing shared caches
     it. */
  if (res && res.setHeader) res.setHeader('Cache-Control', 'private, no-store');

  var isGet = req.method === 'GET';
  if (!isGet && req.method !== 'POST') throw A.httpError(405, 'GET (weights) or POST (scoring) only');
  var body = (!isGet && isPlain(req.body)) ? req.body : {};
  if (body.action != null && body.action !== 'score' && body.action !== 'weights')
    throw A.httpError(400, 'action must be score or weights');
  var weightsOnly = isGet || body.action === 'weights';

  return A.authenticate(req).then(function (caller) {
    /* Identity still verifies without a service account; nothing else does.
       Name the missing variable rather than 500 on the first read. */
    if (typeof A.isDegraded === 'function' && A.isDegraded())
      throw A.httpError(503, 'site scoring is unavailable: ' + A.degradedReason() +
        '. Scores are computed here and never in the browser, so the map has no scores until that is fixed.');
    libCheck();

    var asked = isGet ? (req.query && (req.query.org || req.query.orgId)) : body.orgId;
    var orgId;
    if (asked === undefined || asked === null || asked === '') {
      orgId = A.safeOrg(caller.orgId);
      if (!orgId) throw A.httpError(400, 'your account resolves to no orgId; sign in with your work email');
    } else {
      /* .doc() takes multi-segment paths, so an org from a caller is a
         path-injection primitive until safeOrg() has seen it. */
      orgId = A.safeOrg(asked);
      if (!orgId) throw A.httpError(400, 'orgId must be an email domain');
    }

    return A.canActInOrg(caller, orgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'not your workspace');
      return entitle(caller, orgId);
    }).then(function () {
      E.rateLimit('site-score:' + orgId, 60);
      var notes = [];
      return weightsFor(orgId, notes).then(function (w) {
        var asOf = new Date().toISOString();
        var weightsVersion = crypto.createHash('sha256').update(JSON.stringify(w.weights)).digest('hex');
        /* BANDS travels with the weights: it is the one band table, and the
           filter rail must not grow a second copy of it. */
        if (weightsOnly) {
          return { weights: w.weights, weightsSource: w.weightsSource,
            weightsVersion: weightsVersion, limit: MAX_ROWS,
            bands: clone(SS.BANDS), notes: notes, asOf: asOf };
        }

        if (!Array.isArray(body.rows))
          throw A.httpError(400, 'rows must be an array of sites; send { action:"weights" } or GET to read the weights alone');
        if (body.circuits !== undefined && body.circuits !== null && !isPlain(body.circuits))
          throw A.httpError(400, 'circuits must be an object keyed by row id');

        var use = (body.use === undefined || body.use === null || body.use === '') ? 'bess' : String(body.use);
        if (use !== 'bess' && use !== 'load')
          throw A.httpError(400, 'use must be "bess" or "load" (got "' + use + '"); guessing which one you meant would put a number on a card nobody chose');

        var opts = {};
        if (body.hours !== undefined && body.hours !== null && body.hours !== '') {
          /* A duration off an <input> arrives as a string and means exactly
             what it says, so it is coerced. A weight stored as a string means
             something wrote that document which should not have, which is why
             checkWeights() treats the two differently. */
          var ht = typeof body.hours, h = (ht === 'number' || ht === 'string') ? Number(body.hours) : NaN;
          if (!isFinite(h) || h <= 0 || h > MAX_HOURS)
            throw A.httpError(400, 'hours must be a number of hours greater than 0 and no more than ' + MAX_HOURS);
          opts.hours = h;
        }
        /* hours absent stays absent: the default duration belongs to
           api/_lib/site-score.js and this file keeps no second copy of it. The
           effective value comes back below, read off the library's own output. */

        var rows = body.rows, truncated = 0;
        if (rows.length > MAX_ROWS) {
          truncated = rows.length - MAX_ROWS;
          notes.push('rows: ' + rows.length + ' sites were sent and ' + MAX_ROWS + ' were scored; ' + truncated +
            ' were not. This endpoint scores ' + MAX_ROWS + ' per call — narrow the map, or ask again for the rest.');
          rows = rows.slice(0, MAX_ROWS);
        }

        var scores = Object.create(null);
        var scored = scoreAll(rows, body.circuits, use, opts, w.weights, notes, scores);
        /* The duration actually applied, taken from the library rather than
           restated: null only when nothing scored and the caller sent none. */
        var hoursUsed = opts.hours === undefined ? null : opts.hours;
        for (var i = 0; i < scored.length; i++) {
          if (scored[i].hours !== undefined && scored[i].hours !== null) { hoursUsed = scored[i].hours; break; }
        }
        console.log('[site-score]', orgId, rows.length + ' rows', use, w.weightsSource,
          truncated ? truncated + ' truncated' : '');
        return {
          scored: scored,
          scores: scores, weightsVersion: weightsVersion, limit: MAX_ROWS,
          weights: w.weights,
          weightsSource: w.weightsSource,
          bands: clone(SS.BANDS),
          use: use,
          hours: hoursUsed,
          truncated: truncated,
          notes: notes,
          asOf: asOf
        };
      });
    });
  }).catch(function (err) {
    if (err && err.status && err.status < 500) throw err;
    throw A.httpError(503, 'site scoring is temporarily unavailable');
  });
});

/* Exposed for scripts/tests/ — the shape api/site-plan.js uses, so validation
   and row handling can be asserted without a live Firestore. */
module.exports._helpers = {
  TOOL_KEY: TOOL_KEY, MAX_ROWS: MAX_ROWS, MAX_HOURS: MAX_HOURS, SANE_RATIO: SANE_RATIO,
  BLOCKED_STATUS: BLOCKED_STATUS, checkWeights: checkWeights, normalise: normalise,
  scoreAll: scoreAll, entitle: entitle, weightsFor: weightsFor
};
