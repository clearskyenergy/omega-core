#!/usr/bin/env node
/* Regression tests for the shareable site-intake link: api/_lib/intake-links.js,
   api/site-intake.js (the public form's door and the signed-in management) and
   api/agent/intake-links.js (the agent's).
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   No Firestore, no firebase-admin, no network: the handlers run in a vm
   sandbox on an in-memory Firestore, as scripts/test-agent-sites.js does.
   What this proves: only an administrator or a sites:write key makes a link,
   and only for the orgs it may credit; a submission lands as the same deal
   the agent's upload writes (referred, credited to the link's org, channel
   'Intake link') and never touches an existing deal; the public answer names
   no deal; the honeypot, the daily cap, a revoke and an expiry each hold; the
   maker is mailed and the submitter is not.

     node scripts/test-site-intake.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b }); }

/* ── stand-ins ─────────────────────────────────────────────────────────── */
function httpError(status, msg) { var e = new Error(msg); e.status = status; return e; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function fakeFirestore(seed) {
  var store = {};
  Object.keys(seed || {}).forEach(function (c) { store[c] = {}; Object.keys(seed[c]).forEach(function (id) { store[c][id] = clone(seed[c][id]); }); });
  var n = 0;
  function snap(id, d) { return { id: id, exists: !!d, data: function () { return d ? clone(d) : undefined; } }; }
  function applyUpdate(doc, fields) {
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      if (v && v.__arrayUnion) doc[k] = (doc[k] || []).concat(v.__arrayUnion);
      else doc[k] = clone(v);
    });
  }
  function docRef(name, id) {
    return {
      _name: name, _id: id,
      get: function () { return Promise.resolve(snap(id, store[name][id])); },
      set: function (d) { store[name][id] = clone(d); return Promise.resolve(); },
      update: function (fields) {
        if (!store[name][id]) return Promise.reject(new Error('no doc ' + id));
        applyUpdate(store[name][id], fields); return Promise.resolve();
      }
    };
  }
  function collection(name) {
    store[name] = store[name] || {};
    var filters = [], lim = Infinity;
    var q = {
      where: function (f, op, v) { filters.push([f, op, v]); return q; },
      limit: function (k) { lim = k; return q; },
      get: function () {
        var rows = Object.keys(store[name]).map(function (id) { return snap(id, store[name][id]); }).filter(function (s) {
          return filters.every(function (fl) {
            var val = fl[0].split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, s.data());
            if (fl[1] === 'array-contains') return Array.isArray(val) && val.indexOf(fl[2]) >= 0;
            if (fl[1] === '==') return val === fl[2];
            return false;
          });
        }).slice(0, lim);
        return Promise.resolve({ empty: !rows.length, forEach: function (cb) { rows.forEach(cb); } });
      },
      doc: function (id) { return docRef(name, id); },
      add: function (d) { var id = 'auto' + (++n); store[name][id] = clone(d); return Promise.resolve({ id: id }); }
    };
    return q;
  }
  function runTransaction(fn) {
    var tx = {
      get: function (ref) { return ref.get(); },
      update: function (ref, f) { applyUpdate(store[ref._name][ref._id], f); },
      set: function (ref, d) { store[ref._name][ref._id] = clone(d); }
    };
    return Promise.resolve().then(function () { return fn(tx); });
  }
  return { collection: collection, runTransaction: runTransaction, _store: store };
}
var FieldValue = { arrayUnion: function () { return { __arrayUnion: Array.prototype.slice.call(arguments) }; } };

/* Firebase ID tokens, as admin.authenticate() would decode them. */
var TOKENS = {
  'tok-owner':   { uid: 'u-owner', email: 'terry@ogisolar.com', staff: false },
  'tok-padmin':  { uid: 'u-padmin', email: 'grant@sunesol.com', staff: false },
  'tok-member':  { uid: 'u-member', email: 'brad@sunesol.com', staff: false },
  'tok-pending': { uid: 'u-pending', email: 'new@sunesol.com', staff: false },
  'tok-nobody':  { uid: 'u-nobody', email: 'stranger@example.com', staff: false },
  'tok-staff':   { uid: 'u-staff', email: 'tom@clearsky-usa.com', staff: true }
};
function orgOf(e) { return String(e || '').split('@')[1] || ''; }
function fakeAdmin(db) {
  return {
    httpError: httpError, orgOf: orgOf,
    db: function () { return db; },
    FieldValue: function () { return FieldValue; },
    isStaffEmail: function (e) { return /@clearsky-usa\.com$/.test(e); },
    authenticate: function (req) {
      var m = /^Bearer\s+(.+)$/i.exec(((req.headers || {}).authorization) || '');
      var t = m && TOKENS[m[1]];
      if (!t) return Promise.reject(httpError(401, 'bad token'));
      return Promise.resolve({ uid: t.uid, email: t.email, orgId: orgOf(t.email), staff: t.staff });
    },
    handler: function (fn) {
      return function (req, res) {
        return Promise.resolve().then(function () { return fn(req, res); })
          .then(function (out) { if (out !== undefined && !res.headersSent) res.status(200).json(out); })
          .catch(function (err) { if (!res.headersSent) res.status(err.status || 500).json({ error: err.message }); });
      };
    }
  };
}
var SENT = [];
var mailStub = {
  esc: function (s) { return String(s == null ? '' : s); }, row: function (k, v) { return k + ':' + v + ';'; },
  layout: function (t, b) { return t + '|' + b; }, button: function (h, l) { return '[' + l + '](' + h + ')'; },
  send: function (to, subject, html, text, opts) { SENT.push({ to: to, subject: subject, html: html, opts: opts || {} }); return Promise.resolve({ ok: true }); }
};
var LIMITS = {};
var embedStub = { rateLimit: function (id, limit) { LIMITS[id] = (LIMITS[id] || 0) + 1; if (LIMITS[id] > limit) throw httpError(429, 'slow down'); } };

var cache = {};
function load(file, stubs) {
  var abs = path.join(ROOT, file), src = fs.readFileSync(abs, 'utf8');
  var module = { exports: {} };
  var sandbox = { module: module, exports: module.exports, Buffer: Buffer, process: process, console: console, __dirname: path.dirname(abs), __filename: abs,
    Promise: Promise, Date: Date, JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number, Int32Array: Int32Array, isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent, RegExp: RegExp, Error: Error, setTimeout: setTimeout, globalThis: {},
    require: function (name) {
      var key = path.basename(name).replace(/\.js$/, '');
      if (stubs[key]) return stubs[key];
      if (/^[./]/.test(name)) {
        var rel = path.relative(ROOT, path.resolve(path.dirname(abs), name));
        if (!/\.js$/.test(rel)) rel += '.js';
        if (!cache[rel]) cache[rel] = load(rel, stubs);
        return cache[rel];
      }
      return require(name);
    } };
  vm.runInNewContext(src, sandbox, { filename: abs });
  return module.exports;
}
function res() {
  var r = { headersSent: false, headers: {}, body: null, status: function (s) { r.code = s; return r; },
    json: function (j) { r.body = j; r.headersSent = true; return r; }, setHeader: function (k, v) { r.headers[k] = v; },
    end: function (b) { r.body = b; r.headersSent = true; return r; } };
  return r;
}
function call(handler, req) { var r = res(); return handler(req, r).then(function () { return r; }); }

/* ── fixtures ──────────────────────────────────────────────────────────── */
var KML = '<?xml version="1.0"?><kml><Document>' +
  '<Placemark><name>Smith Ranch</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-98.0000,32.0000,0 -97.9700,32.0000,0 -97.9700,32.0230,0 -98.0000,32.0230,0 -98.0000,32.0000,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>' +
  '</Document></kml>';
var KEYS = { ogi: 'omega_ak_' + 'a'.repeat(48), ro: 'omega_ak_' + 'b'.repeat(48), admin: 'omega_ak_' + 'c'.repeat(48) };
function hid(k) { return crypto.createHash('sha256').update(k).digest('hex'); }
var seed = { agent_keys: {}, deals: {}, intake_links: {}, omega_orgs: {},
  omega_partner_orgs: { 'ogisolar.com': { name: 'OGI Solar' }, 'sunesol.com': { name: 'SUN Energy Solutions' } },
  omega_users: {
    'u-owner':   { email: 'terry@ogisolar.com', role: 'owner', status: 'active', orgId: 'ogisolar.com' },
    'u-padmin':  { email: 'grant@sunesol.com', role: 'partner_admin', status: 'active', orgId: 'sunesol.com' },
    'u-member':  { email: 'brad@sunesol.com', role: 'member', status: 'active', orgId: 'sunesol.com' },
    'u-pending': { email: 'new@sunesol.com', role: 'partner_admin', status: 'pending', orgId: 'sunesol.com' }
  } };
seed.agent_keys[hid(KEYS.ogi)] = { orgId: 'ogisolar.com', label: 'OGI JV GPT', scopes: ['sites:read', 'sites:write'], active: true };
seed.agent_keys[hid(KEYS.ro)] = { orgId: 'ogisolar.com', label: 'reader', scopes: ['sites:read'], active: true };
seed.agent_keys[hid(KEYS.admin)] = { orgId: 'clearsky-usa.com', label: 'ClearSky', scopes: ['sites:read', 'sites:write'], admin: true, active: true };
seed.deals.d1 = { name: 'Smith Ranch', address: '1 Ranch Rd, Abilene, TX 79601', state: 'TX', stage: 'screening', sizeMw: 50,
  orgsInvolved: ['ogisolar.com'], origination: { partnerOrg: 'ogisolar.com', partnerName: 'OGI Solar', locked: true }, activity: [] };
seed.intake_links.il_00000000000000000000000000000001 = { orgId: 'ogisolar.com', partnerName: 'OGI Solar', label: 'old', active: true,
  expiresAt: '2020-01-01T00:00:00.000Z', dailyCap: 50, count: 0 };

var db = fakeFirestore(seed);
var stubs = { admin: fakeAdmin(db), mail: mailStub, embed: embedStub };
var Auth = load('api/_lib/agent-auth.js', stubs); cache['api/_lib/agent-auth.js'] = Auth;
var L = load('api/_lib/intake-links.js', stubs); cache['api/_lib/intake-links.js'] = L;
var door = load('api/site-intake.js', stubs), agentDoor = load('api/agent/intake-links.js', stubs), sites = load('api/agent/sites.js', stubs);
var HOST = { host: 'silmarillion.clearskyomega.com', 'x-forwarded-proto': 'https' };
function hdr(auth, extra) { return Object.assign({ authorization: 'Bearer ' + auth }, HOST, extra || {}); }
var ipN = 0;
function submit(body) { return call(door, { method: 'POST', headers: Object.assign({ 'x-forwarded-for': '10.0.0.' + (++ipN) }, HOST), body: body }); }
function form(l, site, who) {
  return { l: l, website: '', submitter: Object.assign({ name: 'Jo Landowner', email: 'Jo@Example.com', company: 'Smith Family LLC', phone: '555-0100' }, who || {}),
           site: Object.assign({ name: 'Smith Ranch', address: '1 Ranch Rd, Abilene, TX 79601' }, site || {}) };
}

(async function () {
  var r, linkId, url, store = db._store;

  /* ── who may make a link ─────────────────────────────────────────────── */
  r = await call(agentDoor, { method: 'POST', headers: hdr(KEYS.ogi), body: { label: 'Landowner outreach — West Texas' } });
  eq('the agent key makes a link → 200', r.code, 200);
  linkId = r.body.link && r.body.link.id; url = r.body.link && r.body.link.url;
  ok('…an il_ id', L.looksLikeId(linkId), linkId);
  eq('…whose url is the public form on the host that asked', url, 'https://silmarillion.clearskyomega.com/site-intake?l=' + linkId);
  eq('…credited to the key\'s org, named from the registry', [r.body.link.orgId, r.body.link.partnerName], ['ogisolar.com', 'OGI Solar']);
  ok('…open, with the default cap', r.body.link.active === true && r.body.link.dailyCap === 50);
  ok('…and a note telling the agent to give it verbatim', /verbatim/.test(r.body.note));
  eq('…the row is stored', store.intake_links[linkId].createdBy.by, 'agent:OGI JV GPT');
  eq('…an agent-made link mails nobody (no person made it)', store.intake_links[linkId].notify, '');

  r = await call(agentDoor, { method: 'POST', headers: hdr(KEYS.ogi), body: { label: 'x', org: 'sunesol.com' } });
  eq('a partner key cannot credit another org → 403', r.code, 403);
  r = await call(agentDoor, { method: 'POST', headers: hdr(KEYS.ro), body: { label: 'x' } });
  eq('a read-only key cannot make links → 403', r.code, 403);
  r = await call(agentDoor, { method: 'POST', headers: hdr('tok-owner'), body: { label: 'x' } });
  eq('the agent door takes only an agent key → 401', r.code, 401);
  r = await call(agentDoor, { method: 'POST', headers: hdr(KEYS.ogi), body: {} });
  eq('a link needs a label → 400', r.code, 400);
  r = await call(agentDoor, { method: 'POST', headers: hdr(KEYS.admin), body: { label: 'ClearSky for SUN', org: 'sunesol.com' } });
  ok('an admin key may credit any org', r.code === 200 && r.body.link.orgId === 'sunesol.com', r.body);

  r = await call(door, { method: 'POST', headers: hdr('tok-owner'), body: { action: 'create', label: 'Broker list', org: 'sunesol.com', dailyCap: 2 } });
  ok('an OSA owner makes a link for any org', r.code === 200 && r.body.link.orgId === 'sunesol.com' && r.body.link.dailyCap === 2, r.body);
  var capLink = r.body.link.id;
  eq('…and is the one mailed when a site comes in', store.intake_links[capLink].notify, 'terry@ogisolar.com');
  r = await call(door, { method: 'POST', headers: hdr('tok-padmin'), body: { action: 'create', label: 'SUN reps' } });
  ok('a partner administrator makes one for their own org', r.code === 200 && r.body.link.orgId === 'sunesol.com', r.body);
  var sunLink = r.body.link.id;
  r = await call(door, { method: 'POST', headers: hdr('tok-padmin'), body: { action: 'create', label: 'x', org: 'ogisolar.com' } });
  eq('…but not for another org → 403', r.code, 403);
  r = await call(door, { method: 'POST', headers: hdr('tok-member'), body: { action: 'create', label: 'x' } });
  eq('a member cannot make links → 403', r.code, 403);
  r = await call(door, { method: 'POST', headers: hdr('tok-pending'), body: { action: 'create', label: 'x' } });
  eq('an account awaiting approval cannot → 403', r.code, 403);
  r = await call(door, { method: 'POST', headers: hdr('tok-nobody'), body: { action: 'create', label: 'x' } });
  eq('someone with no OSA account cannot → 403', r.code, 403);
  r = await call(door, { method: 'POST', headers: HOST, body: { action: 'create', label: 'x' } });
  eq('no token at all → 401', r.code, 401);
  r = await call(door, { method: 'POST', headers: hdr('tok-staff'), body: { action: 'create', label: 'Staff', org: 'ogisolar.com', expiresAt: '2001-01-01' } });
  eq('an expiry in the past → 400', r.code, 400);
  r = await call(door, { method: 'POST', headers: hdr('tok-staff'), body: { action: 'create', label: 'Staff', org: 'not a domain' } });
  eq('an org that is not a domain → 400', r.code, 400);

  r = await call(door, { method: 'POST', headers: hdr('tok-padmin'), body: { action: 'list' } });
  ok('a partner administrator lists only their own org\'s links', r.code === 200 && r.body.links.length === 3 && r.body.links.every(function (l) { return l.orgId === 'sunesol.com'; }), r.body.links && r.body.links.map(function (l) { return l.orgId; }));
  r = await call(agentDoor, { method: 'GET', headers: hdr(KEYS.ogi) });
  ok('the agent lists its org\'s links, the expired one marked so', r.code === 200 && r.body.links.length === 2 &&
     r.body.links.filter(function (l) { return l.id === 'il_00000000000000000000000000000001'; })[0].active === false, r.body);

  /* ── the public side ─────────────────────────────────────────────────── */
  r = await call(door, { method: 'GET', headers: HOST, query: { l: linkId } });
  eq('an open link answers who it goes to, nothing more', r.body, { ok: true, open: true, to: 'OGI Solar' });
  r = await call(door, { method: 'GET', headers: HOST, query: { l: 'il_' + 'f'.repeat(32) } });
  eq('an unknown link → 404', r.code, 404);
  r = await call(door, { method: 'GET', headers: HOST, query: { l: '../deals' } });
  eq('a malformed link → 404', r.code, 404);
  r = await call(door, { method: 'GET', headers: HOST, query: { l: 'il_00000000000000000000000000000001' } });
  ok('an expired link → 410 that says so', r.code === 410 && /expired/.test(r.body.error), r.body);

  var before = Object.keys(store.deals).length, d1 = JSON.stringify(store.deals.d1);
  SENT.length = 0;
  r = await submit(form(sunLink, { kml: KML, fileName: 'smith.kml', sizeMw: 120, projectType: 'Solar BESS', notes: 'Owner keen; 138 kV line on the east edge',
                                   externalId: 'd1', stage: 'funded', outline: [[0, 0], [1, 0], [1, 1]] }));
  eq('a submission → 200', r.code, 200);
  ok('…answered with a reference, never a deal id', /^[A-Z0-9]{6}$/.test(r.body.reference) && r.body.id === undefined && JSON.stringify(r.body).indexOf('auto') < 0, r.body);
  ok('…and the acreage measured from the file', r.body.outline === true && r.body.acres > 1700 && r.body.acres < 1900, r.body.acres);
  eq('one new deal', Object.keys(store.deals).length, before + 1);
  eq('…the same-named deal already there is untouched', JSON.stringify(store.deals.d1), d1);
  var newId = Object.keys(store.deals).filter(function (k) { return !seed.deals[k]; })[0], nd = store.deals[newId];
  eq('…at referred, whatever the body said', nd.stage, 'referred');
  eq('…credited to the link\'s org and on its roster', [nd.origination.partnerOrg, nd.origination.partnerName, nd.orgsInvolved], ['sunesol.com', 'SUN Energy Solutions', ['sunesol.com']]);
  eq('…channel Intake link', nd.origination.channel, 'Intake link');
  eq('…the submitter is the contact', [nd.origination.contactName, nd.origination.contactEmail], ['Jo Landowner', 'jo@example.com']);
  ok('…attribution unlocked and no money on it', nd.origination.locked === false && nd.funding.requestedUsd === null && nd.capexUsd === null);
  eq('…no externalId from a stranger', nd.externalIds, {});
  ok('…the outline is the file\'s, not a typed ring', nd.outline && nd.outline.source === 'intake-kml' && nd.outline.ring.length === 5, nd.outline && nd.outline.source);
  eq('…size, type and notes kept', [nd.sizeMw, nd.projectType, nd.siteNotes], [120, 'solar_bess', 'Owner keen; 138 kV line on the east edge']);
  eq('…the reference is the one on the deal', nd.intake.reference, r.body.reference);
  ok('…intake{} says which link and who', nd.intake.linkId === sunLink && nd.intake.label === 'SUN reps' && nd.intake.submitter.company === 'Smith Family LLC' && nd.intake.submitter.phone === '555-0100', nd.intake);
  ok('…and the activity line names them and the link', /Jo Landowner \(Smith Family LLC\) <jo@example\.com>.*"SUN reps"/.test(nd.activity[0].message), nd.activity[0].message);
  eq('the link counts it', [store.intake_links[sunLink].count, store.intake_links[sunLink].dayCount], [1, 1]);
  eq('the maker is mailed, once', SENT.map(function (m) { return m.to; }), ['grant@sunesol.com']);
  ok('…with the submitter as Reply-To and the site named', SENT[0].opts.replyTo === 'jo@example.com' && /Smith Ranch/.test(SENT[0].subject) && /SUN reps/.test(SENT[0].subject));

  SENT.length = 0;
  r = await submit(form(linkId, { address: '', lat: 32.1, lng: -99.2, name: 'Pin Only' }));
  ok('coordinates alone are enough', r.code === 200 && r.body.outline === false, r.body);
  var pin = Object.keys(store.deals).map(function (k) { return store.deals[k]; }).filter(function (d) { return d.name === 'Pin Only'; })[0];
  ok('…kept as a point, credited to the agent link\'s org', pin && pin.grid.lat === 32.1 && pin.origination.partnerOrg === 'ogisolar.com', pin && pin.grid);
  eq('…and an agent-made link mails nobody', SENT.length, 0);

  before = Object.keys(store.deals).length;
  r = await submit(Object.assign(form(linkId), { website: 'http://spam.example' }));
  ok('the honeypot gets a plain ok…', r.code === 200 && r.body.ok === true);
  eq('…and nothing is stored', Object.keys(store.deals).length, before);
  r = await submit(form(linkId, {}, { email: 'not-an-email' }));
  eq('a bad email → 400', r.code, 400);
  r = await submit(form(linkId, {}, { name: '' }));
  eq('no name → 400', r.code, 400);
  r = await submit(form(linkId, { address: '' }));
  ok('no address, coordinates or file → 400', r.code === 400 && /address, coordinates or a Google Earth file/.test(r.body.error), r.body);
  r = await submit(form(linkId, { kmzBase64: 'A'.repeat(L.MAX_FILE_B64 + 4) }));
  eq('a file over the limit → 400', r.code, 400);
  r = await submit(form(linkId, { kml: '<kml><Document></Document></kml>' }));
  ok('a file with no shape is still a site, said honestly', r.code === 200 || r.code === 400, r.body);
  eq('nothing invalid was stored', Object.keys(store.deals).length, before + (r.code === 200 ? 1 : 0));

  r = await submit(form(capLink, { name: 'Cap one' }));
  eq('the daily cap: first → 200', r.code, 200);
  r = await submit(form(capLink, { name: 'Cap two' }));
  eq('…second → 200', r.code, 200);
  before = Object.keys(store.deals).length;
  r = await submit(form(capLink, { name: 'Cap three' }));
  ok('…third → 429 and nothing stored', r.code === 429 && Object.keys(store.deals).length === before, r.code);

  LIMITS = {};
  var ip = { 'x-forwarded-for': '10.9.9.9' };
  for (var i = 0; i < 5; i++) await call(door, { method: 'POST', headers: Object.assign({}, HOST, ip), body: form(linkId, {}, { email: '' }) });
  r = await call(door, { method: 'POST', headers: Object.assign({}, HOST, ip), body: form(linkId, {}, { email: '' }) });
  eq('a sixth try in a minute from one address → 429', r.code, 429);

  /* ── closing a link ──────────────────────────────────────────────────── */
  r = await call(door, { method: 'POST', headers: hdr('tok-padmin'), body: { action: 'revoke', id: linkId } });
  eq('a partner administrator cannot close another org\'s link (404, not 403)', r.code, 404);
  r = await call(agentDoor, { method: 'POST', headers: hdr(KEYS.ogi), body: { revoke: linkId } });
  ok('the agent closes its own link', r.code === 200 && r.body.revoked === true, r.body);
  r = await call(door, { method: 'GET', headers: HOST, query: { l: linkId } });
  ok('…which now answers 410', r.code === 410 && /closed/.test(r.body.error), r.body);
  before = Object.keys(store.deals).length;
  r = await submit(form(linkId, { name: 'After close' }));
  ok('…and takes nothing', r.code === 410 && Object.keys(store.deals).length === before, r.code);
  r = await call(door, { method: 'POST', headers: hdr('tok-staff'), body: { action: 'revoke', id: sunLink } });
  eq('staff close any link', r.code, 200);

  /* ── the agent finds what came in ────────────────────────────────────── */
  r = await call(sites, { method: 'GET', headers: hdr(KEYS.admin), query: { channel: 'Intake link', limit: 200 } });
  ok('listSites channel="Intake link" returns only form submissions', r.code === 200 && r.body.sites.length >= 4 &&
     r.body.sites.every(function (s) { return s.channel === 'Intake link'; }), r.body.sites && r.body.sites.map(function (s) { return s.channel; }));
  r = await call(sites, { method: 'GET', headers: hdr(KEYS.ogi), query: { channel: 'intake link' } });
  ok('…case-insensitively, inside the key\'s own org', r.code === 200 && r.body.sites.every(function (s) { return s.partnerOrg === 'ogisolar.com'; }) && r.body.sites.length >= 1, r.body.sites);

  /* ── the static parts ────────────────────────────────────────────────── */
  var rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  ok('firestore.rules closes intake_links explicitly', /match \/intake_links\/\{linkId\} \{\s*allow read, write: if false;\s*\}/.test(rules));
  var vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  ok('vercel.json bundles the site-intel engine with the door', (vj.functions['api/site-intake.js'] || {}).includeFiles === 'omega-site-intel.js');
  var page = fs.readFileSync(path.join(ROOT, 'site-intake.html'), 'utf8');
  ok('the form loads no Firebase and no tenant runtime', !/firebase|omega-tenant|omega-sso/i.test(page.replace(/<!--[\s\S]*?-->/g, '')));
  ok('…keeps the link out of a Referer header', /<meta name="referrer" content="no-referrer">/.test(page));
  ok('…carries the honeypot field', /id="website"/.test(page));
  ok('…and posts to the one door', /'\/api\/site-intake'/.test(page));

  console.log((fail ? '✗' : '✓') + ' site intake: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
