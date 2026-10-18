/* POST /api/funding-v2 — marketplace v2 preview. The live marketplace is untouched.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Scores a package, filters a caller-supplied or illustrative board, plans a
   data room, and — only when FUNDING_V2_PUBLISH is the literal true — writes
   funding_v2_packages. It never writes fin_projects.

   Publishing stays off until Thomas turns that variable on. Interest and
   information requests are returned to the caller and stored only then.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var B = require('./_lib/bankability');
var V = require('./_lib/vdr');
var EX = require('./_lib/funding-v2-examples');

var PUBLISH_FLAG = 'FUNDING_V2_PUBLISH';
var COLLECTION = 'funding_v2_packages';

function publishOn(env) { return env && env[PUBLISH_FLAG] === 'true'; }

function callerStaff(caller) { return !!(caller && caller.staff === true); }

function handle(body, caller, env, deps) {
  body = body || {};
  env = env || {};
  deps = deps || {};
  var action = String(body.action || '');

  if (action === 'model') return B.modelCard();

  if (action === 'score') {
    var pkg = body.package || {};
    if (body.from === 'drawing') pkg = B.fromDrawing(body.package || {});
    if (body.from === 'portfolio') pkg = B.fromPortfolio(body.package || {});
    var result = B.score(pkg, body.threshold != null ? { threshold: body.threshold } : null);
    return { package: { id: pkg.id || null, name: pkg.name || null, illustrative: pkg.illustrative === true }, result: result, summary: B.summary(pkg, result) };
  }

  if (action === 'board') {
    var list = body.examples ? EX.packages() : (Array.isArray(body.packages) ? body.packages : null);
    if (!list) throw A.httpError(400, 'Send examples: true, or your own packages.');
    if (list.length > 12) throw A.httpError(400, 'Score at most 12 packages at once.');
    var crit = B.criteria(body.criteria);
    var deals = [], held = [];
    list.forEach(function (raw) {
      var p = raw || {};
      var result = B.score(p);
      var card = B.summary(p, result);
      card.checklist = result.checklist;
      card.items = result.items.map(function (it) {
        return { id: it.id, label: it.label, points: it.points, earned: it.earned, pass: it.pass, hard: it.hard, missing: it.missing, why: it.why };
      });
      if (!result.visible) held.push(card);
      else if (B.matches(p, result, crit)) deals.push(card);
      else held.push(Object.assign({}, card, { heldByCriteria: true, checklist: ['Outside your minimums.'].concat(result.risks) }));
    });
    var compare = null;
    if (Array.isArray(body.compare) && body.compare.length) {
      var wanted = body.compare.map(String);
      var rows = list.filter(function (p) { return wanted.indexOf(String(p && p.id)) >= 0; }).map(function (p) {
        return { package: p, result: B.score(p) };
      });
      compare = B.compare(rows);
    }
    return { audience: 'preview', live: false, criteria: crit, deals: deals, held: held, compare: compare,
      note: 'Illustrative packages. Not live deals. The live marketplace was not changed.' };
  }

  if (action === 'list') {
    if (!publishOn(env)) {
      return { audience: 'live', live: false, deals: [], held: [], note: 'Marketplace v2 is a preview. No live package is listed until publishing is turned on.' };
    }
    if (!deps.db) throw A.httpError(503, 'Firestore is not available on this call.');
    var liveCrit = B.criteria(body.criteria);
    return deps.db.collection(COLLECTION).where('visible', '==', true).get().then(function (snap) {
      var deals = [];
      snap.docs.forEach(function (doc) {
        var data = doc.data() || {};
        var p = data.package || {};
        var result = data.result || B.score(p);
        if (B.matches(p, result, liveCrit)) deals.push(B.summary(p, result));
      });
      return { audience: 'live', live: true, criteria: liveCrit, deals: deals, held: [], note: 'Listed packages only. A package under the line is not on this list.' };
    });
  }

  if (action === 'interest' || action === 'request-info') {
    var ev = B.eventOf(action, body, caller);
    if (!publishOn(env)) {
      return { ok: true, stored: false, event: ev, note: 'Recorded on this preview. Nothing was written to the live marketplace.' };
    }
    if (!deps.db) throw A.httpError(503, 'Firestore is not available on this call.');
    var ref = deps.db.collection(COLLECTION).doc(ev.packageId);
    return ref.get().then(function (snap) {
      if (!snap.exists) throw A.httpError(404, 'That package is not published.');
      var data = snap.data() || {};
      if (!data.visible) throw A.httpError(409, 'That package is not open to financiers.');
      ev.stored = true;
      var id = ev.type + '-' + Date.now();
      return ref.collection('events').doc(id).set(ev).then(function () {
        return { ok: true, stored: true, event: ev, note: 'Saved on the v2 package. The live marketplace was not changed.' };
      });
    });
  }

  if (action === 'vdr-plan') {
    var planPkg = body.package || {};
    return { plan: V.plan(planPkg), catalog: V.catalog(env) };
  }

  if (action === 'vdr-sync') {
    if (body.confirm !== true) throw A.httpError(400, 'Confirm the sync before any file is sent.');
    if (!callerStaff(caller)) throw A.httpError(403, 'ClearSky staff connect a data room.');
    var provider = String(body.provider || '');
    return V.sync(provider, body.package || {}, env, { fetch: deps.fetch, existing: body.existing || null });
  }

  if (action === 'publish') {
    if (!publishOn(env)) {
      throw A.httpError(409, 'Marketplace v2 is a preview. Publishing to financiers is off until it is approved.');
    }
    if (!callerStaff(caller)) throw A.httpError(403, 'ClearSky staff publish a package.');
    if (!deps.db) throw A.httpError(503, 'Firestore is not available on this call.');
    var pub = body.package || {};
    if (!pub.id || String(pub.id).indexOf('preview-') === 0) throw A.httpError(400, 'An illustrative preview package cannot be published.');
    var pubResult = B.score(pub);
    if (!pubResult.visible) throw A.httpError(409, 'Financiers cannot see this yet. ' + (pubResult.checklist[0] || ''));
    var now = new Date().toISOString();
    var record = {
      visible: true, score: pubResult.score, threshold: pubResult.threshold,
      package: pub, result: pubResult, publishedAt: now, publishedBy: caller.email || null
    };
    return deps.db.collection(COLLECTION).doc(String(pub.id)).set(record).then(function () {
      return { ok: true, id: String(pub.id), collection: COLLECTION, score: pubResult.score, note: 'Published on marketplace v2. fin_projects was not written.' };
    });
  }

  throw A.httpError(400, 'Unknown action.');
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    var database = null;
    try { database = A.db(); } catch (e) { database = null; }
    return handle(req.body || {}, caller, process.env, { fetch: typeof fetch === 'function' ? fetch : null, db: database });
  });
});
module.exports.handle = handle;
module.exports.COLLECTION = COLLECTION;
module.exports.PUBLISH_FLAG = PUBLISH_FLAG;
