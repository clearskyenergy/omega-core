/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ═══════════════════════════════════════════════════════════════════════════
   scripts/preview-proforma.js — the BESS Pro Forma, on this machine

   LOCAL PREVIEW ONLY. scripts/ is never deployed, and nothing here reaches
   Firebase or a tenant's data.

   It serves the repo and answers POST /api/proforma with the REAL handler —
   api/proforma.js, and through it the finance engine, the sizing bridge and
   the white-label rule — so every figure the page shows is the one a
   signed-in tenant would get. Three things are stood in for, and only these:

   - verify-token. The page's token names a tenant; the caller is an active
     owner in that tenant's org, and readAsCaller answers from an in-memory
     omega_orgs record built from tenants/<slug>/tenant.json: its name,
     logoUrl, exportBrand, whiteLabel and status, and the tier as billing.
     Never its colours, so a deck's accent comes from exportBrand or the
     logo exactly as it would for a tenant that set none.
   - The Firebase compat SDK and /config.js. A stub signs the page in as
     that tenant's user, with Firestore kept in memory and mirrored to the
     tab's localStorage, so the page boots, saves, reloads and shares its
     reports the way it does live. ?reset=1 empties it.
   - The site lookup's network. The REAL api/_lib/site-lookup.js runs on the
     recorded responses in scripts/tests/fixtures/site-lookup: 22125 Roscoe
     Blvd, Canoga Park, CA 91304 has everything (geocode, PVWatts scaled to
     the array asked for, LADWP tariffs); Hartford CT and Logan WV geocode
     (energy community and low-income from Treasury's tables) with no
     production or tariffs recorded; anything else is "no match". --live
     sends it to the Census geocoder, PVWatts and URDB instead, with
     NREL_API_KEY / OPENEI_API_KEY from the environment or the demo key.

     node scripts/preview-proforma.js [port] [--live]

     http://localhost:<port>/proforma.html?tenant=nextnrg     exportBrand + logo
     http://localhost:<port>/proforma.html?tenant=cleancell   white label, no colours
     http://localhost:<port>/proforma.html                    a workspace with no record

   The handler is loaded once: restart after editing anything under api/.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');

var ROOT = path.resolve(__dirname, '..');
var args = process.argv.slice(2);
var LIVE = args.indexOf('--live') >= 0;
var PORT = +(args.filter(function (a) { return /^\d+$/.test(a); })[0] || 8790);
var FIX = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'site-lookup');
/* A workspace with no omega_orgs record: the gate fails open, and the deck's
   brand is the org id — the path every legacy tenant takes. */
var BARE_ORG = 'example-energy.com';
var MAX_BODY = 6 * 1024 * 1024;

var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json' };

/* ── the tenants ─────────────────────────────────────────────────────────── */

/* ?tenant=<slug> → { slug, orgId, email, uid, org (the omega_orgs record or
   null), billing }. The record carries only what a deck and a white label
   read; a slug with no tenant.json is refused rather than guessed at. */
function tenantOf(slug) {
  slug = String(slug || '').toLowerCase();
  if (!slug) return { slug: '', orgId: BARE_ORG, org: null, billing: { tier: 'standard' }, email: 'preview@' + BARE_ORG, uid: 'preview-' + BARE_ORG };
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  var file = path.join(ROOT, 'tenants', slug, 'tenant.json'), t;
  try { t = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
  var orgId = String(t.orgId || '').toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(orgId)) return null;
  var org = {};
  ['name', 'logoUrl', 'exportBrand', 'whiteLabel', 'status'].forEach(function (k) { if (t[k] !== undefined) org[k] = t[k]; });
  return { slug: slug, orgId: orgId, org: org, billing: { tier: t.tier || 'standard' },
           email: 'preview@' + orgId, uid: 'preview-' + orgId.replace(/[^a-z0-9]/g, '-') };
}
function tenantOfToken(token) {
  var m = /^preview:([a-z0-9-]{0,40})$/.exec(token || '');
  return m ? tenantOf(m[1]) : null;
}

/* ── verify-token, stood in for ──────────────────────────────────────────── */

function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
var VT = require.resolve(path.join(ROOT, 'api', '_lib', 'verify-token'));
var realVT = require(VT), stubVT = {};
Object.keys(realVT).forEach(function (k) { stubVT[k] = realVT[k]; });
stubVT.httpError = realVT.httpError || httpError;
stubVT.verifyIdToken = function (token) {
  var t = tenantOfToken(token);
  if (!t) return Promise.reject(httpError(401, 'That is not a preview token.'));
  /* claims is the token's own body, as verify-token hands it over: a
     confirmed work address. */
  return Promise.resolve({ uid: t.uid, email: t.email, emailVerified: true, orgId: t.orgId, staff: false,
    claims: { email: t.email, email_verified: true, user_id: t.uid, firebase: { sign_in_provider: 'password' } } });
};
stubVT.readAsCaller = function (token, p) {
  var t = tenantOfToken(token);
  if (!t) return Promise.reject(httpError(403, 'the rules refused that read'));
  var base = 'omega_orgs/' + encodeURIComponent(t.orgId), out = null;
  if (p === base) out = t.org;
  else if (p === base + '/billing/current') out = t.org ? t.billing : null;
  else if (p === base + '/members/' + encodeURIComponent(t.uid)) out = t.org ? { email: t.email, role: 'owner', status: 'active' } : null;
  return Promise.resolve(out ? JSON.parse(JSON.stringify(out)) : null);
};
stubVT.authenticateWithTier = function () {
  throw new Error('api/proforma.js reads billing itself; authenticateWithTier is not part of the preview.');
};
require.cache[VT].exports = stubVT;

/* ── the site lookup's network, from the recordings ─────────────────────── */

function fixture(name) { return JSON.parse(fs.readFileSync(path.join(FIX, name + '.json'), 'utf8')); }
var PLACES = [
  { re: /canoga|91304|roscoe/i, census: 'census-canoga-park-ca', pv: 'pvwatts-canoga-park-250kw', urdb: 'urdb-ladwp-canoga-park' },
  { re: /hartford|06106|capitol ave/i, census: 'census-hartford-ct' },
  { re: /logan|25601|stratton/i, census: 'census-logan-wv' }
];
PLACES.forEach(function (p) {
  var hit = fixture(p.census).body.result.addressMatches[0];
  p.lat = hit.coordinates.y; p.lon = hit.coordinates.x;
});
function placeNear(url) {
  var lat = +(/[?&]lat=([-\d.]+)/.exec(url) || [])[1], lon = +(/[?&]lon=([-\d.]+)/.exec(url) || [])[1];
  for (var i = 0; i < PLACES.length; i++) {
    if (Math.abs(PLACES[i].lat - lat) < 0.05 && Math.abs(PLACES[i].lon - lon) < 0.05) return PLACES[i];
  }
  return null;
}
function reply(f) {
  return Promise.resolve({ status: f.status, ok: f.status >= 200 && f.status < 300,
    headers: { get: function (h) { return (f.headers || {})[String(h).toLowerCase()] || null; } },
    text: function () { return Promise.resolve(JSON.stringify(f.body)); },
    json: function () { return Promise.resolve(JSON.parse(JSON.stringify(f.body))); } });
}
function recordedFetch(u) {
  var url = String(u), place;
  if (/geocoding\.geo\.census\.gov/.test(url)) {
    var addr = decodeURIComponent(url.replace(/\+/g, ' '));
    for (var i = 0; i < PLACES.length; i++) if (PLACES[i].re.test(addr)) return reply(fixture(PLACES[i].census));
    return reply(fixture('census-no-match'));
  }
  place = placeNear(url);
  if (/pvwatts/.test(url)) {
    if (!place || !place.pv) return Promise.reject(new TypeError('fetch failed: no recorded PVWatts response for this place'));
    /* The recording is 250 kW DC; production scales with the array asked for. */
    var pv = fixture(place.pv), cap = +(/[?&]system_capacity=([\d.]+)/.exec(url) || [0, 250])[1], k = cap / 250;
    pv.body.outputs.ac_annual *= k;
    pv.body.outputs.ac_monthly = pv.body.outputs.ac_monthly.map(function (v) { return v * k; });
    if (pv.body.inputs) pv.body.inputs.system_capacity = String(cap);
    return reply(pv);
  }
  if (/utility_rates/.test(url)) return reply(fixture(place && place.urdb ? place.urdb : 'urdb-empty'));
  return Promise.reject(new TypeError('fetch failed: the preview has no recording for ' + url.split('?')[0]));
}
var SL = require.resolve(path.join(ROOT, 'api', '_lib', 'site-lookup'));
if (!LIVE) {
  var realSL = require(SL), stubSL = {};
  Object.keys(realSL).forEach(function (k) { stubSL[k] = realSL[k]; });
  /* Keys that look like a server's, so the answer reads as it does with
     keys configured (no demo-key warnings); they never leave this process. */
  stubSL.lookup = function (body, opts) {
    var o = {}, k;
    for (k in opts || {}) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    o.fetch = recordedFetch;
    o.env = { NREL_API_KEY: 'PREVIEW-RECORDED-KEY-0000', OPENEI_API_KEY: 'PREVIEW-RECORDED-KEY-0000' };
    return realSL.lookup(body, o);
  };
  require.cache[SL].exports = stubSL;
}

var handler = require(path.join(ROOT, 'api', 'proforma.js'));

/* ── the browser side: Firebase and /config.js, stood in for ────────────── */

/* Serialised into the page as it is, so it is written for the browser: ES5.
   Auth reports null first (the SDK restoring a session), then the preview
   user; Firestore is a map of paths with set({merge}), delete sentinels and
   Firestore's refusal of nested arrays and undefined. */
function firebaseStub(P) {
  /* The "database" is localStorage, read afresh by every operation: two tabs
     of the preview then share one workspace document the way two
     colleagues share one in Firestore. */
  var KEY = '__preview_fs', DEL = { __op: 'delete' }, TS = { __op: 'ts' }, store = {};
  function load() { try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; } }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  try { if (/[?&]reset=1\b/.test(location.search)) { localStorage.clear(); sessionStorage.clear(); } } catch (e) {}
  load();
  Object.keys(P.seed).forEach(function (k) { store[k] = P.seed[k]; });
  persist();
  function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v) && v !== DEL && v !== TS; }
  function copy(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function check(v, where) {
    if (v === undefined) throw new Error('Function setDoc() called with invalid data. Unsupported field value: undefined (found in ' + where + ')');
    if (Array.isArray(v)) {
      v.forEach(function (x, i) {
        if (Array.isArray(x)) throw new Error('Function setDoc() called with invalid data. Nested arrays are not supported (found in ' + where + ')');
        if (x === DEL) throw new Error('FieldValue.delete() cannot be used inside an array');
        check(x, where + '.' + i);
      });
    } else if (isPlain(v)) Object.keys(v).forEach(function (k) { check(v[k], where + '.' + k); });
  }
  function mergeInto(target, src) {
    Object.keys(src).forEach(function (k) {
      var v = src[k];
      if (v === DEL) { delete target[k]; return; }
      if (v === TS) { target[k] = new Date().toISOString(); return; }
      if (isPlain(v)) { if (!isPlain(target[k])) target[k] = {}; mergeInto(target[k], v); return; }
      target[k] = copy(v);
    });
  }
  function strip(src) {
    var o = {};
    Object.keys(src).forEach(function (k) {
      var v = src[k];
      if (v === DEL) throw new Error('FieldValue.delete() can only be used with update() and set() with {merge:true}');
      o[k] = v === TS ? new Date().toISOString() : isPlain(v) ? strip(v) : copy(v);
    });
    return o;
  }
  function Doc(p) { this.path = p; this.id = p.split('/').pop(); }
  function snap(p) { load(); var d = store[p]; return { exists: !!d, id: p.split('/').pop(), ref: new Doc(p), data: function () { return d ? copy(d) : undefined; } }; }
  function later(fn) { return new Promise(function (res, rej) { setTimeout(function () { try { res(fn()); } catch (e) { rej(e); } }, 15); }); }
  Doc.prototype.collection = function (n) { return new Col(this.path + '/' + n); };
  Doc.prototype.get = function () { var p = this.path; return later(function () { return snap(p); }); };
  Doc.prototype.onSnapshot = function (cb) { var p = this.path; setTimeout(function () { try { cb(snap(p)); } catch (e) {} }, 15); return function () {}; };
  Doc.prototype.set = function (data, opts) {
    var p = this.path;
    return later(function () {
      check(data, 'document');
      load();
      if (opts && opts.merge) { if (!store[p]) store[p] = {}; mergeInto(store[p], data); } else store[p] = strip(data);
      persist();
    });
  };
  Doc.prototype.update = function (data) { return this.set(data, { merge: true }); };
  Doc.prototype['delete'] = function () { var p = this.path; return later(function () { load(); delete store[p]; persist(); }); };
  function Col(p) { this.path = p; }
  var none = { empty: true, size: 0, docs: [], forEach: function () {}, docChanges: function () { return []; } };
  Col.prototype.doc = function (id) { return new Doc(this.path + '/' + (id || 'auto' + Math.random().toString(36).slice(2, 10))); };
  Col.prototype.add = function (data) { var d = this.doc(); return d.set(data).then(function () { return d; }); };
  Col.prototype.where = Col.prototype.orderBy = Col.prototype.limit = function () { return this; };
  Col.prototype.get = function () { return later(function () { return none; }); };
  Col.prototype.onSnapshot = function (cb) { setTimeout(function () { try { cb(none); } catch (e) {} }, 15); return function () {}; };
  var db = { collection: function (n) { return new Col(n); }, doc: function (p) { return new Doc(p); },
    batch: function () { var ops = []; return { set: function (r, d, o) { ops.push(function () { return r.set(d, o); }); }, update: function (r, d) { ops.push(function () { return r.update(d); }); },
      'delete': function (r) { ops.push(function () { return r['delete'](); }); }, commit: function () { return Promise.all(ops.map(function (f) { return f(); })); } }; } };
  function firestore() { return db; }
  firestore.FieldValue = { 'delete': function () { return DEL; }, serverTimestamp: function () { return TS; },
    increment: function (n) { return n; }, arrayUnion: function () { return [].slice.call(arguments); }, arrayRemove: function () { return []; } };
  var user = { uid: P.uid, email: P.email, displayName: P.email.split('@')[0], emailVerified: true, providerData: [{ providerId: 'password' }],
    getIdToken: function () { return Promise.resolve(P.token); },
    getIdTokenResult: function () { return Promise.resolve({ token: P.token, claims: {} }); } };
  var authObj = {
    currentUser: null,
    onAuthStateChanged: function (cb) {
      setTimeout(function () { cb(authObj.currentUser); }, 5);
      setTimeout(function () { authObj.currentUser = user; cb(user); }, 200);
      return function () {};
    },
    onIdTokenChanged: function (cb) { return authObj.onAuthStateChanged(cb); },
    signOut: function () { return Promise.resolve(); },
    setPersistence: function () { return Promise.resolve(); }
  };
  function auth() { return authObj; }
  auth.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
  auth.GoogleAuthProvider = function () {};
  window.firebase = { apps: [], auth: auth, firestore: firestore,
    initializeApp: function () { if (!this.apps.length) this.apps.push({ name: '[DEFAULT]', options: {} }); return this.apps[0]; },
    app: function () { return this.apps[0]; } };
}
function stubFor(t) {
  var seed = {};
  if (t.org) {
    seed['omega_orgs/' + t.orgId] = t.org;
    seed['omega_orgs/' + t.orgId + '/billing/current'] = t.billing;
    seed['omega_orgs/' + t.orgId + '/members/' + t.uid] = { email: t.email, role: 'owner', status: 'active' };
  }
  return '/* preview stand-in for the Firebase compat SDK (scripts/preview-proforma.js) */\n(' + firebaseStub.toString() + ')(' +
    JSON.stringify({ uid: t.uid, email: t.email, token: 'preview:' + t.slug, seed: seed }) + ');\n';
}
var CONFIG = "window.CLEARSKY_CONFIG={firebase:{apiKey:'preview',authDomain:'localhost',projectId:'preview',appId:'preview'}," +
  "adminDomains:[],platformName:'ClearSky-OMEGA'};";

/* ── the server ──────────────────────────────────────────────────────────── */

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
/* The Vercel response the handler writes to. */
function vercelRes(res) {
  var code = 200, headers = { 'Content-Type': 'application/json; charset=utf-8' };
  return {
    setHeader: function (k, v) { headers[k] = v; },
    status: function (n) { code = n; return this; },
    json: function (o) { res.writeHead(code, headers); res.end(JSON.stringify(o)); return this; }
  };
}
function runHandler(req, res, body) {
  var t0 = Date.now(), action = body && body.action;
  Promise.resolve(handler({ method: req.method, headers: req.headers, body: body }, vercelRes(res))).then(function () {
    console.log('  ' + req.method + ' /api/proforma ' + (action || '') + ' ' + (Date.now() - t0) + ' ms');
  }, function (e) {
    console.error('  /api/proforma threw:', e && e.stack || e);
    if (!res.headersSent) send(res, 500, { ok: false, error: 'The preview handler threw; see the terminal.' });
  });
}
function home() {
  var links = [['', 'a workspace with no omega_orgs record']];
  fs.readdirSync(path.join(ROOT, 'tenants')).forEach(function (slug) { if (tenantOf(slug)) links.push([slug, tenantOf(slug).orgId]); });
  return '<!DOCTYPE html><meta charset="utf-8"><title>BESS Pro Forma preview</title><body style="font:15px/1.6 system-ui;margin:40px;max-width:720px">' +
    '<h1 style="font-size:20px">BESS Pro Forma — local preview</h1><p>The real /api/proforma handler, signed in as the tenant you pick. ' +
    (LIVE ? 'Site lookups go to the live services.' : 'Site lookups answer from the recorded fixtures (try 22125 Roscoe Blvd, Canoga Park, CA 91304).') +
    ' The dashboard is not part of the preview.</p><ul>' + links.map(function (l) {
      var href = '/proforma.html' + (l[0] ? '?tenant=' + l[0] : '');
      return '<li><a href="' + href + '">' + (l[0] || '(no tenant)') + '</a> — ' + l[1] + '</li>';
    }).join('') + '</ul><p><a href="/proforma.html?reset=1">Start over</a> (clears this browser’s preview data)</p></body>';
}

var server = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://localhost'), p = decodeURIComponent(u.pathname);
  if (p === '/api/proforma') {
    if (req.method !== 'POST') return runHandler(req, res, null);
    var chunks = [], size = 0, over = false;
    req.on('data', function (c) { size += c.length; if (size > MAX_BODY) over = true; else chunks.push(c); });
    req.on('end', function () {
      if (over) return send(res, 413, { ok: false, error: 'Request body too large.' });
      var raw = Buffer.concat(chunks).toString('utf8'), body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = raw; }
      runHandler(req, res, body);
    });
    return;
  }
  if (p === '/api/events' || p === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (p.indexOf('/api/') === 0) return send(res, 404, { ok: false, error: 'Not part of this preview: ' + p });
  if (p === '/' || p === '/index.html') return send(res, 200, home(), TYPES['.html']);
  if (p === '/config.js') return send(res, 200, CONFIG, TYPES['.js']);
  if (p === '/__preview/firebase.js') {
    var t = tenantOf(u.searchParams.get('tenant'));
    return t ? send(res, 200, stubFor(t), TYPES['.js']) : send(res, 404, '/* unknown tenant */', TYPES['.js']);
  }
  if (p === '/proforma') p = '/proforma.html';
  var file = path.normalize(path.join(ROOT, p)), rel = path.relative(ROOT, file);
  /* The repo, not its dotfiles, its server code or anything outside it. */
  if (!rel || rel.indexOf('..') === 0 || path.isAbsolute(rel) || /(^|[\/\\])\./.test(rel) || /^(api|node_modules)([\/\\]|$)/.test(rel)) {
    return send(res, 404, 'Not found', TYPES['.txt']);
  }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) return send(res, 404, 'Not found', TYPES['.txt']);
    var ext = path.extname(file).toLowerCase();
    if (ext !== '.html') return send(res, 200, fs.readFileSync(file), TYPES[ext] || 'application/octet-stream');
    var slug = u.searchParams.get('tenant') || '';
    if (!tenantOf(slug)) return send(res, 404, 'No tenants/' + slug.replace(/[^a-z0-9-]/gi, '') + '/tenant.json to preview as.', TYPES['.txt']);
    /* The Firebase SDK from gstatic becomes the stand-in, signed in as the
       tenant this page was opened for. */
    var html = String(fs.readFileSync(file, 'utf8'));
    var first = true;
    html = html.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>\n?/g, function () {
      if (!first) return '';
      first = false;
      return '<script src="/__preview/firebase.js?tenant=' + encodeURIComponent(slug) + '"></script>\n';
    });
    send(res, 200, html, TYPES['.html']);
  });
});
server.on('error', function (e) { console.error('The preview could not start: ' + e.message); process.exit(1); });
server.listen(PORT, function () {
  console.log('BESS Pro Forma preview — real /api/proforma, ' + (LIVE ? 'LIVE site lookups' : 'recorded site lookups'));
  console.log('  http://localhost:' + PORT + '/proforma.html?tenant=nextnrg');
  console.log('  http://localhost:' + PORT + '/proforma.html?tenant=cleancell');
  console.log('  http://localhost:' + PORT + '/proforma.html            (no tenant record)');
  console.log('  add &reset=1 to start over. Restart after editing anything under api/.');
});
