#!/usr/bin/env node
/* ===========================================================================
   scripts/steward/api-registry.js - what every /api/ endpoint is and who may
   call it, derived from the source rather than maintained beside it.
   (c) 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY DERIVED AND NOT WRITTEN DOWN

   A hand-kept list of endpoints is wrong within a month, and a wrong list is
   worse than none: it is what somebody consults before deciding an endpoint is
   safe. So this reads api/*.js and reports what the code actually does - which
   auth helper it calls, which environment variables it spends, what it sends
   for CORS, which methods it accepts.

   That makes it two things at once:

     - the access model the steward works from. "Give the agent access to all
       our APIs" has to start with knowing what all of them are and what each
       one is allowed to do, or the grant is just a bearer token and a hope.

     - a security check. An endpoint with no token check shows up here as
       auth: 'open'. On 2026-09-17 that was six of thirty-eight, two of them
       spending a paid vendor key behind Access-Control-Allow-Origin: *.

   AUTH CLASSES, in the order the code is tested for them:

     staff        calls an auth helper and then checks caller.staff
     tenant-tier  authenticateWithTier: a token plus billing/current
     signed-in    verifies a token, no tier or staff gate
     signature    no token; authenticity comes from a signed webhook body
     open         nothing. Anyone on the internet with the URL.

   STEWARD_SAFE is the smaller, hand-kept list, and it is deliberately the
   only hand-kept thing in this file: the endpoints the steward may call on a
   schedule because they read and score, and change nothing. Everything else
   needs a human to ask for it. An endpoint does not become safe by being
   listed here; it is listed here because it was read and found to be safe.

     node scripts/steward/api-registry.js           table
     node scripts/steward/api-registry.js --json
   =========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..');
var API_DIR = path.join(ROOT, 'api');

/* Read-only, side-effect-free, safe to call on a schedule. Reviewed by hand.
   Anything not on this list is off limits to the daily run - see client.js. */
var STEWARD_SAFE = {
  'health': 'reports which server-side configuration is present. Staff only, booleans only.',
  'network-proximity': 'fiber and interconnection proximity for a point. Read-only scoring.',
  'grid-atlas': 'grid infrastructure near a point. Read-only scoring.',
  'parcel': 'parcel lookup for an address. Read-only.',
  'push-key': 'returns the public VAPID key. Public by design.'
};

/* Public on purpose, and correct to be. Listed so the probe reports them as
   intended rather than as a hole, and so that "why is this one open" has an
   answer written down instead of being rediscovered every few months. */
var INTENTIONALLY_OPEN = {
  'push-key': 'returns the public half of the VAPID key pair. A push public key is published to every subscriber by design; it authorises nothing.'
};

/* Endpoints that write, spend money, or send mail. Never called by a schedule,
   listed so the report can say what the steward is deliberately not touching. */
var WRITES = /^(set-role|tenant-signup|tenant-approve|tenant-billing|tenant-branding|user-admin|provision-partner|offer|opportunity|rfq|invite-send|dealroom-send|dealroom-refer|dealroom-open|financing-send|push-send|push-subscribe|stripe-|crm-sync|om-integrations|ring)/;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* The first sentence of the header, which in this codebase is always a real
   description of the endpoint rather than a restatement of its name. */
function purposeOf(src, id) {
  var lines = src.split('\n').slice(0, 40);
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].replace(/^[\s/*=_-]+/, '').replace(/[\s*]+$/, '');
    if (!l || /ClearSky Energy Solutions|Proprietary|Vercel serverless|^=+$/.test(l)) continue;
    var m = new RegExp(id + '(?:\\.js)?\\s*[-—:]\\s*(.+)$').exec(l);
    if (m) return m[1].trim();
  }
  for (var j = 0; j < lines.length; j++) {
    var t = lines[j].replace(/^[\s/*=_-]+/, '').replace(/[\s*]+$/, '');
    if (t && !/ClearSky Energy|Proprietary|Vercel serverless|^=+$/.test(t) && t.length > 20 && /\s/.test(t)) return t;
  }
  return '';
}

function authOf(code) {
  var staff = /caller\.staff|\.staff\b|isOmegaStaff|staffOnly/.test(code);
  if (/authenticateWithTier/.test(code)) return staff ? 'tenant-tier' : 'tenant-tier';
  if (/constructEvent|stripe-signature/.test(code)) return 'signature';
  if (/\.authenticate\(|A\.handler|verifyIdToken/.test(code)) return staff ? 'staff' : 'signed-in';
  return 'open';
}

/* OPTIONS is never the working method - it is the CORS preflight, and every
   handler answers it 204 before it looks at anything else. A probe that sent
   OPTIONS would get that 204 from an endpoint that is perfectly well gated
   and report it as open, which is exactly the false alarm that gets a check
   ignored. So it is dropped, and an endpoint that tests for nothing else is
   assumed to be a POST endpoint - which every one of them here is. */
function methodsOf(code) {
  var m = {};
  var re = /req\.method\s*(?:!==|!=|===|==)\s*['"]([A-Z]+)['"]/g, x;
  while ((x = re.exec(code))) if (x[1] !== 'OPTIONS') m[x[1]] = true;
  var list = Object.keys(m);
  return list.length ? list.sort() : ['POST'];
}

function corsOf(code) {
  if (/Access-Control-Allow-Origin['"]\s*,\s*['"]\*/.test(code)) return 'open';
  if (/Access-Control-Allow-Origin/.test(code)) return 'reflected';
  return 'none';
}

function envOf(code) {
  var seen = {}, re = /process\.env\.([A-Z0-9_]+)/g, m;
  while ((m = re.exec(code))) seen[m[1]] = true;
  return Object.keys(seen).sort();
}

function registry() {
  var out = [];
  var files;
  try { files = fs.readdirSync(API_DIR); } catch (e) { return out; }
  files.filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) {
    var id = f.replace(/\.js$/, '');
    var src = fs.readFileSync(path.join(API_DIR, f), 'utf8');
    var code = stripComments(src);
    var auth = authOf(code);
    out.push({
      id: id,
      path: '/api/' + id,
      file: 'api/' + f,
      purpose: purposeOf(src, id),
      auth: auth,
      methods: methodsOf(code),
      cors: corsOf(code),
      env: envOf(code),
      writes: WRITES.test(id),
      stewardSafe: Object.prototype.hasOwnProperty.call(STEWARD_SAFE, id),
      safeBecause: STEWARD_SAFE[id] || null,
      intentionallyOpen: Object.prototype.hasOwnProperty.call(INTENTIONALLY_OPEN, id),
      openBecause: INTENTIONALLY_OPEN[id] || null,
      /* An open endpoint that spends a key is the expensive shape: anyone can
         make it cost money. Reported on its own so it cannot be skimmed past. */
      spendsKeyWhileOpen: auth === 'open' && envOf(code).some(function (v) {
        return /(API_KEY|TOKEN|SECRET)$/.test(v);
      })
    });
  });
  return out;
}

function main() {
  var reg = registry();
  if (process.argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify(reg, null, 2));
    return 0;
  }
  console.log('omega steward - API registry - ' + reg.length + ' endpoints');
  console.log('');
  console.log('  ' + pad('endpoint', 24) + pad('auth', 14) + pad('cors', 11) + 'steward');
  console.log('  ' + new Array(62).join('-'));
  reg.forEach(function (e) {
    console.log('  ' + pad(e.path, 24) + pad(e.auth, 14) + pad(e.cors, 11) +
      (e.stewardSafe ? 'read-only' : (e.writes ? 'no (writes)' : 'no')));
  });
  var open = reg.filter(function (e) { return e.auth === 'open' && !e.intentionallyOpen; });
  var costly = reg.filter(function (e) { return e.spendsKeyWhileOpen; });
  console.log('');
  console.log('  ' + open.length + ' endpoint(s) with no token check: ' +
    (open.map(function (e) { return e.id; }).join(', ') || 'none'));
  if (costly.length) {
    console.log('  ' + costly.length + ' of those spend a paid vendor key: ' +
      costly.map(function (e) { return e.id; }).join(', '));
  }
  console.log('  ' + reg.filter(function (e) { return e.stewardSafe; }).length +
    ' endpoint(s) the steward may call on a schedule.');
  return 0;
}

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

if (require.main === module) process.exit(main());
module.exports = { registry: registry, STEWARD_SAFE: STEWARD_SAFE, INTENTIONALLY_OPEN: INTENTIONALLY_OPEN };
