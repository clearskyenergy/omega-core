/* ═══════════════════════════════════════════════════════════════════════════
   /api/events — the Event Layer's one door (step one)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET   the session's settings: { enabled, sampleRate, excluded, termsOk }.
         omega-events.js asks once per tab and goes quiet on any "no".
   POST  { events: [...] } from omega-events.js → Pub/Sub topic omega-events
         → the twin's eventsIngest → twin_events. Design and catalogue:
         api/_lib/events.js and the vault note "Event Layer — Step One Scope".

   EVERY ONE OF THESE REFUSES QUIETLY — 202 with a reason, nothing published:
     · no current terms acceptance. termsAcceptances/{uid}.version must equal
       TERMS_VERSION. Only index.html shows the terms modal, so a user who
       lives in the editor has not re-accepted; they emit nothing until they
       do. Read failure = not accepted (fail closed, like hasAccepted()).
     · the layer is off. event_config/current {enabled:true} turns it on; a
       missing doc is OFF. Turning it on is a deliberate act.
     · the caller's org or host is excluded. event_exclusions/{orgId} or
       event_exclusions/host:{hostname}. This is where signed-agreement
       tenants (Fenecon, the OSA JV) are held out until counsel clears them:
       a clickwrap bump does not amend a signed MSA. Read failure = excluded.

   Every read goes through the CALLER'S OWN token (verify-token.readAsCaller),
   so firestore.rules decide, and no service account exists on this path. A
   tenant can read its own exclusion doc and the host: docs, never the list.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var auth = require('./_lib/verify-token');
var EV = require('./_lib/events');
var gcp = require('./_lib/gcp-wif');

var TOPIC = process.env.EVENTS_TOPIC || 'projects/clearsky-portal/topics/omega-events';
var CACHE_MS = 60000;
var _cache = {};

function cached(key, ms, fn) {
  var c = _cache[key];
  if (c && Date.now() - c.at < ms) return Promise.resolve(c.v);
  return fn().then(function (v) { _cache[key] = { at: Date.now(), v: v }; return v; });
}

function bearer(req) {
  var m = /^Bearer (.+)$/.exec((req.headers && req.headers.authorization) || '');
  if (!m) throw auth.httpError(401, 'missing bearer token');
  return m[1];
}

/* Each gate resolves true/false and never rejects: a failed read is the
   answer that sends nothing. */
function termsOk(token, uid) {
  /* Only a YES is cached: a user who accepts the new terms a minute after a
     refusal must not wait out a cached no. */
  var c = _cache['t:' + uid];
  if (c && Date.now() - c.at < CACHE_MS * 5) return Promise.resolve(true);
  return auth.readAsCaller(token, 'termsAcceptances/' + encodeURIComponent(uid))
    .then(function (d) {
      var ok = !!(d && d.version === EV.TERMS_VERSION);
      if (ok) _cache['t:' + uid] = { at: Date.now(), v: true };
      return ok;
    })
    ['catch'](function () { return false; });
}
function settings(token) {
  return cached('cfg', CACHE_MS, function () {
    return auth.readAsCaller(token, 'event_config/current')
      .then(function (d) {
        d = d || {};
        var r = Number(d.sampleRate);
        return { enabled: d.enabled === true, sampleRate: r >= 0 && r <= 1 ? r : 0.25 };
      })
      ['catch'](function () { return { enabled: false, sampleRate: 0 }; });
  });
}
function excluded(token, keys) {
  return Promise.all(keys.map(function (k) {
    return cached('x:' + k, CACHE_MS, function () {
      return auth.readAsCaller(token, 'event_exclusions/' + encodeURIComponent(k))
        .then(function (d) { return !!d && d.active !== false; })
        ['catch'](function () { return true; });
    });
  })).then(function (xs) { return xs.some(Boolean); });
}

function gates(req, token, who) {
  return Promise.all([
    termsOk(token, who.uid), settings(token),
    excluded(token, EV.exclusionKeys(who.orgId, who.host))
  ]).then(function (r) { return { termsOk: r[0], cfg: r[1], excluded: r[2] }; });
}

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
  var token;
  try { token = bearer(req); } catch (e) { return res.status(401).json({ error: e.message }); }

  return auth.verifyIdToken(token).then(function (caller) {
    if (!caller.orgId) throw auth.httpError(403, 'that account has no organisation');
    var who = { uid: caller.uid, orgId: caller.orgId, staff: caller.staff,
                host: EV.tenantHost(req.headers), at: new Date().toISOString() };
    return gates(req, token, who).then(function (g) {
      var live = g.termsOk && g.cfg.enabled && !g.excluded && gcp.configured();
      if (req.method === 'GET') {
        return res.status(200).json({ enabled: live, sampleRate: g.cfg.sampleRate,
          termsOk: g.termsOk, excluded: g.excluded, termsVersion: EV.TERMS_VERSION });
      }
      if (!live) {
        var why = !g.termsOk ? 'terms' : g.excluded ? 'excluded' : !g.cfg.enabled ? 'off' : 'unconfigured';
        return res.status(202).json({ accepted: 0, dropped: why });
      }
      var body = req.body || {};
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      var list = Array.isArray(body.events) ? body.events : [];
      if (!list.length) return res.status(400).json({ error: 'no events' });
      if (list.length > EV.BATCH_MAX_EVENTS) return res.status(413).json({ error: 'too many events in one batch' });
      if (EV.bytes(list) > EV.BATCH_MAX_BYTES) return res.status(413).json({ error: 'batch too large' });

      var good = [], rejected = [];
      list.forEach(function (raw, i) {
        var c = EV.clean(raw);
        if (c.error) rejected.push({ i: i, error: c.error });
        else good.push(EV.stamp(c.event, who));
      });
      return gcp.publish(req, TOPIC, good.map(function (e) {
        return { data: e, attributes: { name: e.name, orgId: e.orgId, v: String(e.v) } };
      })).then(function () {
        return res.status(200).json({ accepted: good.length, rejected: rejected });
      });
    });
  })['catch'](function (e) {
    if ((e.status || 500) >= 500) console.error('[events]', e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'events failed' });
  });
};
