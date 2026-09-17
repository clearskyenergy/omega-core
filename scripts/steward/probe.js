#!/usr/bin/env node
/* ===========================================================================
   scripts/steward/probe.js - is the deployed software actually running, and
   does every endpoint still refuse a stranger?
   (c) 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   TWO QUESTIONS, AND ONLY ONE OF THEM NEEDS A CREDENTIAL

   1. DOES IT REFUSE? Every endpoint that is supposed to require a token gets
      called with no token at all. A 401 or 403 is the pass. A 200 means the
      gate is gone - which is the single most valuable thing this whole
      steward checks, and it needs no identity by definition. It runs on a
      fresh clone with nothing configured.

      The probe sends an EMPTY body, always. It is asking "who do you think I
      am", not "please do this". An endpoint that refuses an anonymous caller
      never sees a request; an endpoint that does not refuse one is the finding,
      and an empty body is the least it could have been handed.

      A 400 is reported separately and is not a failure: it means the function
      parsed what it was sent before deciding who sent it. Usually harmless,
      occasionally the first half of something worse.

   2. IS IT CONFIGURED? /api/health reports which server-side variables are
      present and whether Firestore answers - names and booleans, never values.
      That one needs a staff token, so it runs only when the steward has a
      credential, and is skipped with a note when it does not.

      This is the check that catches the failure api/health.js was written
      for: production ran for weeks with FIREBASE_SERVICE_ACCOUNT unset and
      every Admin-backed function returning 500, discovered by accident.

     node scripts/steward/probe.js
     node scripts/steward/probe.js --json
     OMEGA_API_BASE=https://omega-core-xxxx.vercel.app node scripts/steward/probe.js
   =========================================================================== */
'use strict';

var reg = require('./api-registry');
var client = require('./client');

/* Signature-authenticated endpoints have no token to withhold, so "does it
   refuse an anonymous caller" is not a meaningful question to ask them. The
   Stripe webhook refuses an unsigned body, which is its own check and not
   one worth firing at a payments endpoint every morning. */
var NOT_PROBEABLE = { 'stripe-webhook': 'authenticated by signature, not token' };

/* Several endpoints answer a bare GET with a self-describing banner - build
   id, model version, which upstreams are live - and do the actual work on
   POST. /api/render replies {"ok":true,"build":"2026-09-12.auth-gated"} and
   means it: the gate is on the POST. Reporting that as an open endpoint is
   cry-wolf, and a check nobody believes is worse than no check, so the probe
   asks the method that does the work and recognises a banner when the
   endpoint takes nothing else. */
function looksLikeBanner(body) {
  if (!body || body.length > 800) return false;
  return /"ok"\s*:\s*true/.test(body) && /"(build|model|version|provider)"\s*:/.test(body);
}

function classify(e, res) {
  if (res.status === 0) return { verdict: 'unreachable', severity: 'error', note: res.error || 'no response' };
  if (res.status === 200 && res.method === 'GET' && looksLikeBanner(res.body)) {
    return { verdict: 'status banner', severity: 'ok', note: 'GET returns a build/status document and does no work; the gate is on ' + (e.methods.indexOf('POST') >= 0 ? 'POST' : 'the working method') };
  }
  if (e.intentionallyOpen) {
    return { verdict: 'open by design', severity: 'ok', note: e.openBecause || 'declared intentionally public' };
  }
  if (e.auth === 'open') {
    return {
      verdict: 'answered anonymously',
      severity: e.spendsKeyWhileOpen ? 'error' : 'warn',
      note: e.spendsKeyWhileOpen
        ? 'HTTP ' + res.status + ' with no token, and this endpoint spends a paid vendor key - anyone with the URL can make it cost money'
        : 'HTTP ' + res.status + ' with no token. Declared open in api-registry.js; confirm that is still intended.'
    };
  }
  if (res.status === 401 || res.status === 403) return { verdict: 'refuses', severity: 'ok', note: 'HTTP ' + res.status };
  if (res.status === 405) return { verdict: 'method refused', severity: 'ok', note: 'HTTP 405 before auth - inconclusive but not open' };
  if (res.status === 404) return { verdict: 'not deployed', severity: 'warn', note: 'HTTP 404 - the endpoint is in the repo but not at this host' };
  if (res.status === 400 || res.status === 422) {
    /* Stated as what was seen, not as what it means. A 400 to an anonymous
       caller may be input validation running ahead of the auth check, or the
       platform rejecting the request before the function ran at all. Worth a
       look, not worth an accusation. */
    return { verdict: 'answered 400, not 401', severity: 'warn', note: 'HTTP ' + res.status + ' to a caller with no token - it answered about the request rather than about who sent it' };
  }
  if (res.status >= 500) return { verdict: 'error', severity: 'warn', note: 'HTTP ' + res.status + ' on an anonymous call - it should have refused, not crashed' };
  if (res.status >= 200 && res.status < 300) {
    return { verdict: 'SERVED ANONYMOUSLY', severity: 'error', note: 'HTTP ' + res.status + ' with no token - the gate on ' + e.path + ' is not there' };
  }
  return { verdict: 'HTTP ' + res.status, severity: 'warn', note: '' };
}

function probeAuth() {
  var endpoints = reg.registry().filter(function (e) { return !NOT_PROBEABLE[e.id]; });
  var results = [];
  /* Sequential on purpose. This points at production; a burst of 38 parallel
     requests is indistinguishable from something rude. */
  return endpoints.reduce(function (chain, e) {
    return chain.then(function () {
      /* Ask the method that does the work. Where an endpoint accepts both,
         POST is the one carrying the behaviour worth gating. */
      var method = e.methods.indexOf('POST') >= 0 ? 'POST' : e.methods[0];
      return client.callAnonymous(e.id, { body: {}, method: method }).then(function (res) {
        res.method = method;
        var c = classify(e, res);
        results.push({ id: e.id, path: e.path, declared: e.auth, method: method, status: res.status, verdict: c.verdict, severity: c.severity, note: c.note });
      });
    });
  }, Promise.resolve()).then(function () { return results; });
}

function probeHealth() {
  if (!client.haveCredentials()) {
    return Promise.resolve({ skipped: 'no steward credential configured - see scripts/steward/README.md' });
  }
  return client.call('health', {}).then(function (r) {
    if (!r.ok) return { error: 'HTTP ' + r.status, body: r.body };
    var b = r.body || {};
    return {
      firestore: b.firestore,
      summary: b.summary,
      missing: (b.missing || []).map(function (m) { return m.name; }),
      malformed: (b.malformed || []).map(function (m) { return m.name; }),
      defaulted: (b.defaulted || []).map(function (d) { return d.name; }),
      degraded: b.degraded
    };
  }).catch(function (e) { return { error: e.message }; });
}

function main() {
  var asJson = process.argv.indexOf('--json') >= 0;
  return probeAuth().then(function (auth) {
    return probeHealth().then(function (health) {
      var out = { base: client.base(), checkedAt: new Date().toISOString(), auth: auth, health: health };
      if (asJson) { console.log(JSON.stringify(out, null, 2)); }
      else {
        console.log('omega steward - probe - ' + out.base);
        console.log('');
        console.log('  auth posture (anonymous call to every endpoint)');
        var bad = auth.filter(function (a) { return a.severity === 'error'; });
        var warn = auth.filter(function (a) { return a.severity === 'warn'; });
        var ok = auth.filter(function (a) { return a.severity === 'ok'; });
        console.log('    ' + ok.length + ' refuse, ' + warn.length + ' to look at, ' + bad.length + ' failing');
        bad.concat(warn).forEach(function (a) {
          console.log('    ' + (a.severity === 'error' ? 'FAIL' : 'warn') + '  ' + a.path + '  ' + a.verdict);
          if (a.note) console.log('          ' + a.note);
        });
        console.log('');
        console.log('  configuration');
        if (health.skipped) console.log('    skipped: ' + health.skipped);
        else if (health.error) console.log('    could not read /api/health: ' + health.error);
        else {
          console.log('    firestore  ' + health.firestore);
          if (health.missing && health.missing.length) console.log('    missing    ' + health.missing.join(', '));
          if (health.malformed && health.malformed.length) console.log('    malformed  ' + health.malformed.join(', '));
          console.log('    ' + (health.summary || ''));
        }
      }
      var failing = auth.some(function (a) { return a.severity === 'error'; });
      return failing ? 1 : 0;
    });
  }).catch(function (e) {
    console.error('probe failed: ' + (e && e.message));
    return 1;
  });
}

if (require.main === module) {
  Promise.resolve(main()).then(function (c) { process.exit(c); });
}
module.exports = { probeAuth: probeAuth, probeHealth: probeHealth };
