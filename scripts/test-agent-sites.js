#!/usr/bin/env node
/* Regression tests for the agent site API: api/_lib/agent-sites.js, kmz.js,
   agent-auth.js and the three api/agent/* handlers.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   No Firestore, no firebase-admin, no network: the handlers run in a vm
   sandbox whose require() hands them an in-memory Firestore and the real
   libraries. What this proves is the part a deploy cannot: that a partner
   key sees only its own deals, that an upload lands in the shape the OSA
   portfolio reads, that an update never touches attribution or money, and
   that a KMZ link cannot be forged or outlive its expiry.

     node scripts/test-agent-sites.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b }); }

/* ── stand-ins ─────────────────────────────────────────────────────────── */
function httpError(status, msg) { var e = new Error(msg); e.status = status; return e; }
function fakeFirestore(seed) {
  var store = {};
  Object.keys(seed || {}).forEach(function (c) { store[c] = {}; Object.keys(seed[c]).forEach(function (id) { store[c][id] = JSON.parse(JSON.stringify(seed[c][id])); }); });
  var n = 0;
  function snap(id, d) { return { id: id, exists: !!d, data: function () { return d ? JSON.parse(JSON.stringify(d)) : undefined; } }; }
  function applyUpdate(doc, fields) {
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      if (v && v.__arrayUnion) doc[k] = (doc[k] || []).concat(v.__arrayUnion);
      else doc[k] = JSON.parse(JSON.stringify(v));
    });
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
      doc: function (id) {
        return {
          get: function () { return Promise.resolve(snap(id, store[name][id])); },
          set: function (d) { store[name][id] = JSON.parse(JSON.stringify(d)); return Promise.resolve(); },
          update: function (fields) {
            if (!store[name][id]) return Promise.reject(new Error('no doc ' + id));
            applyUpdate(store[name][id], fields); return Promise.resolve();
          }
        };
      },
      add: function (d) { var id = 'auto' + (++n); store[name][id] = JSON.parse(JSON.stringify(d)); return Promise.resolve({ id: id }); }
    };
    return q;
  }
  return { collection: collection, _store: store };
}
var FieldValue = { arrayUnion: function () { return { __arrayUnion: Array.prototype.slice.call(arguments) }; } };

function fakeAdmin(db) {
  return {
    httpError: httpError,
    db: function () { return db; },
    FieldValue: function () { return FieldValue; },
    isStaffEmail: function (e) { return /@(csebuilders|clearsky-usa)\.com$/.test(e); },
    handler: function (fn) {
      return function (req, res) {
        return Promise.resolve().then(function () { return fn(req, res); })
          .then(function (out) { if (out !== undefined && !res.headersSent) res.status(200).json(out); })
          .catch(function (err) { if (!res.headersSent) res.status(err.status || 500).json({ error: err.message }); });
      };
    }
  };
}

/* Load a CommonJS file in a sandbox, resolving './_lib/admin' and friends to
   the stand-ins and everything else to the real file. */
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
  '<Placemark><name>Big Ranch</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-98.0000,32.0000,0 -97.9700,32.0000,0 -97.9700,32.0230,0 -98.0000,32.0230,0 -98.0000,32.0000,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>' +
  '<Placemark><name>345kV PNM</name><LineString><coordinates>-98.01,31.99,0 -97.95,32.03,0</coordinates></LineString></Placemark>' +
  '<Placemark><name>SUB 345kV</name><Point><coordinates>-97.96,32.03,0</coordinates></Point></Placemark>' +
  '</Document></kml>';
var KEYS = { ogi: 'omega_ak_' + 'a'.repeat(48), sun: 'omega_ak_' + 'b'.repeat(48), admin: 'omega_ak_' + 'c'.repeat(48), revoked: 'omega_ak_' + 'd'.repeat(48) };

var crypto = require('crypto');
function hid(k) { return crypto.createHash('sha256').update(k).digest('hex'); }
var seed = { agent_keys: {}, deals: {}, omega_orgs: { 'sunenergy.example': { status: 'suspended' } } };
seed.agent_keys[hid(KEYS.ogi)] = { orgId: 'ogisolar.com', label: 'CFA/OGI JV GPT', scopes: ['sites:read', 'sites:write'], active: true };
seed.agent_keys[hid(KEYS.sun)] = { orgId: 'sunenergy.example', label: 'SUN bot', scopes: ['sites:read'], active: true };
seed.agent_keys[hid(KEYS.admin)] = { orgId: 'csebuilders.com', label: 'ClearSky', scopes: ['sites:read', 'sites:write'], admin: true, active: true };
seed.agent_keys[hid(KEYS.revoked)] = { orgId: 'ogisolar.com', label: 'old', scopes: ['sites:read'], active: false };
seed.deals.d1 = { name: 'Alpha Yard', address: '1 Main St, Abilene, TX 79601', state: 'TX', stage: 'screening', sizeMw: 50, orgsInvolved: ['ogisolar.com'],
  origination: { partnerOrg: 'ogisolar.com', partnerName: 'OGI Solar', locked: true }, funding: { requestedUsd: 1 }, updatedAt: '2026-09-01T00:00:00.000Z',
  grid: { score: 61, ranAt: '2026-08-01T00:00:00.000Z', source: 'grid-atlas', lat: 32.4, lng: -99.7, summary: 'Grid Atlas' } };
seed.deals.d2 = { name: 'Beta Flats', address: '9 Rd, Lubbock, TX', state: 'TX', stage: 'referred', sizeMw: 200, orgsInvolved: ['ogisolar.com', 'sunenergy.example'],
  origination: { partnerOrg: 'sunenergy.example' }, updatedAt: '2026-09-10T00:00:00.000Z',
  outline: { ring: [[-98, 32], [-97.97, 32], [-97.97, 32.023], [-98, 32.023], [-98, 32]], acres: 1791.6, centroid: [-97.985, 32.0115], source: 'kmz', features: [] } };
seed.deals.d3 = { name: 'Gamma Dead', stage: 'dead', sizeMw: 900, orgsInvolved: ['ogisolar.com'], origination: { partnerOrg: 'ogisolar.com' } };
seed.deals.d4 = { name: 'Other Org', stage: 'referred', sizeMw: 999, orgsInvolved: ['someone-else.com'], origination: { partnerOrg: 'someone-else.com' } };

var db = fakeFirestore(seed);
var admin = fakeAdmin(db);
var stubs = { admin: admin };
var Auth = load('api/_lib/agent-auth.js', stubs); cache['api/_lib/agent-auth.js'] = Auth;
Auth._setLinkSecretForTests('test-secret');
var S = load('api/_lib/agent-sites.js', stubs); cache['api/_lib/agent-sites.js'] = S;
var K = load('api/_lib/kmz.js', stubs); cache['api/_lib/kmz.js'] = K;
var sites = load('api/agent/sites.js', stubs), outline = load('api/agent/site-outline.js', stubs), kmz = load('api/agent/kmz.js', stubs), openapi = load('api/agent/openapi.js', stubs);
function bearer(k) { return { authorization: 'Bearer ' + k, host: 'osa.clearskyomega.com', 'x-forwarded-proto': 'https' }; }

/* ── kmz.js ────────────────────────────────────────────────────────────── */
eq('crc32 of the check string is the published value', K.crc32(Buffer.from('123456789')).toString(16), 'cbf43926');
var z = K.zip([{ name: 'doc.kml', data: 'hello' }, { name: 'b.txt', data: Buffer.from('world') }]);
ok('a zip starts with PK', K.isZip(z));
var back = K.unzip(z);
eq('zip round-trips both entries', back.map(function (e) { return e.name + ':' + e.data.toString(); }), ['doc.kml:hello', 'b.txt:world']);
ok('unzip refuses garbage', (function () { try { K.unzip(Buffer.from('not a zip at all, honestly not')); return false; } catch (e) { return /zip/.test(e.message); } })());
var kmlOut = K.buildKML({ name: 'A & B', ring: [[-98, 32], [-97.9, 32], [-97.9, 32.1]], acres: 12, features: [{ type: 'line', kind: 'transmission', name: '345kV', coords: [[-98, 32], [-97, 33]] }, { type: 'point', kind: 'substation', name: 'SUB', coords: [[-97.5, 32.5]] }] });
ok('KML escapes the name', kmlOut.indexOf('A &amp; B') > 0 && kmlOut.indexOf('A & B') < 0);
ok('KML closes the ring', /-98\.000000,32\.000000,0 [^<]* -98\.000000,32\.000000,0<\/coordinates>/.test(kmlOut));
ok('KML carries the line and the pin', /<LineString>/.test(kmlOut) && /<Point>/.test(kmlOut));
var noShape = K.buildKML({ name: 'Pin only', point: [-99, 31] });
ok('a pin-only site is a Point, not a fake polygon', /<Point>/.test(noShape) && !/<Polygon>/.test(noShape));
ok('kmlFromKMZ opens what buildKMZ wrote', /Pin only/.test(K.kmlFromKMZ(K.buildKMZ({ name: 'Pin only', point: [-99, 31] }))));

/* ── agent-sites.js: pure ──────────────────────────────────────────────── */
eq('toRing closes an open [lng,lat] ring', S.toRing([[-98, 32], [-97.9, 32], [-97.9, 32.1]]), [[-98, 32], [-97.9, 32], [-97.9, 32.1], [-98, 32]]);
eq('toRing detects [lat,lng] and swaps', S.toRing([[32, -98], [32, -97.9], [32.1, -97.9]]), [[-98, 32], [-97.9, 32], [-97.9, 32.1], [-98, 32]]);
eq('toRing takes {lat,lng} objects', S.toRing([{ lat: 32, lng: -98 }, { lat: 32, lng: -97.9 }, { lat: 32.1, lng: -97.9 }])[2], [-97.9, 32.1]);
ok('toRing refuses two points', S.toRing([[-98, 32], [-97, 33]]) === null);
ok('toRing refuses a latitude of 95', S.toRing([[-98, 95], [-97.9, 32], [-97.9, 32.1]]) === null);
var o = S.outlineFromKML(KML, 'Big Ranch', { by: 'test', fileName: 'big.kmz', source: 'agent-kmz' });
ok('KML → outline with the parcel ring', o.outline && o.outline.ring.length === 5, o.outline);
ok('outline acreage is geodesic (a 0.03°×0.023° box at 32°N is ~1,790 ac, not 2,100)', Math.abs(o.outline.acres - 1791.6) < 2, o.outline.acres);
eq('the line and the substation ride along as features', o.outline.features.map(function (f) { return f.kind; }), ['transmission', 'substation']);
ok('a file with a line and a sub is scored, source site-intel', o.grid && o.grid.source === 'site-intel' && o.grid.score > 0 && o.grid.score <= 100, o.grid);
ok('the score record carries the substation distance the portfolio shows', o.grid.substations[0].distanceKm != null);
var ringOnly = S.outlineFromKML('<kml><Placemark><name>P</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-98,32,0 -97.97,32,0 -97.97,32.02,0 -98,32,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>', 'P', {});
ok('a parcel with nothing to measure against has an outline and no score', ringOnly.outline && ringOnly.outline.ring && ringOnly.grid === null);
ok('empty KML is an error, not an outline', !!S.outlineFromKML('<kml></kml>', 'x', {}).error);
ok('outlineFromInput with no outline is a no-op', S.outlineFromInput({ name: 'x' }, {}).outline === null);
ok('outlineFromInput with a bad ring is an error', !!S.outlineFromInput({ name: 'x', outline: [[1, 2]] }, {}).error);

var sum2 = S.summary('d2', seed.deals.d2);
ok('summary takes acres and location from the outline', sum2.acres === 1791.6 && sum2.hasOutline && Math.abs(sum2.lat - 32.0115) < 1e-6, sum2);
var sum1 = S.summary('d1', seed.deals.d1);
ok('summary falls back to the grid location', sum1.lat === 32.4 && !sum1.hasOutline && sum1.acres === null);
var all = [sum1, sum2, S.summary('d3', seed.deals.d3)];
eq('biggest first: the outlined 1,791 ac site before a 50 MW pin', S.filterAndSort(all, {}).sites.map(function (s) { return s.id; }), ['d2', 'd1']);
eq('dead sites are hidden unless asked for', S.filterAndSort(all, { includeDead: 'true' }).total, 3);
eq('minAcres keeps only measured sites', S.filterAndSort(all, { minAcres: 1000 }).sites.map(function (s) { return s.id; }), ['d2']);
eq('minMw keeps sites with the MW on record', S.filterAndSort(all, { minMw: 100 }).sites.map(function (s) { return s.id; }), ['d2']);
eq('limit caps and is bounded', S.filterAndSort(all, { limit: 1 }).sites.length, 1);
eq('since filters on updatedAt', S.filterAndSort(all, { since: '2026-09-05T00:00:00Z' }).sites.map(function (s) { return s.id; }), ['d2']);

ok('validateSite needs a name', !S.validateSite({ address: 'x' }).ok);
ok('validateSite refuses lat without lng', !S.validateSite({ name: 'x', lat: 32 }).ok);
var vs = S.validateSite({ name: '  Delta  ', address: '5 Rd, Odessa, TX 79761', sizeMw: '120', projectType: 'Solar BESS' });
ok('validateSite trims, coerces and derives the state', vs.ok && vs.site.name === 'Delta' && vs.site.sizeMw === 120 && vs.site.state === 'TX' && vs.site.projectType === 'solar_bess', vs);

var caller = { orgId: 'ogisolar.com', label: 'CFA/OGI JV GPT', keyId: 'k' };
var doc = S.newDealDoc(vs.site, caller, o.outline, o.grid, 'agent:1');
ok('new deal starts at referred, originated by the key org, channel Agent', doc.stage === 'referred' && doc.origination.partnerOrg === 'ogisolar.com' && doc.origination.channel === 'Agent' && doc.origination.locked === false);
eq('new deal is on the roster of the key org only', doc.orgsInvolved, ['ogisolar.com']);
ok('new deal has the fields the portfolio normalizes', ['schemaVersion', 'funding', 'build', 'preDev', 'verification', 'stageHistory', 'activity', 'bom', 'notes', 'participants', 'originationHistory'].every(function (k) { return k in doc; }));
ok('new deal carries the outline and the score', doc.outline.ring.length === 5 && doc.grid.source === 'site-intel');
var pinDoc = S.newDealDoc(S.validateSite({ name: 'Pin', lat: 31.5, lng: -99.5 }).site, caller, null, null, 'b');
ok('a pin-only upload stores the location where the portfolio keeps one, unscored', pinDoc.grid.lat === 31.5 && pinDoc.grid.score === null && !pinDoc.outline);

var upd = S.updateDoc(S.validateSite({ name: 'Alpha Yard', sizeMw: 75, notes: 'seen from the road', externalId: 'CFA-1' }).site, seed.deals.d1, caller, o.outline, o.grid);
ok('update adds the outline, notes and externalId', upd.outline && upd.siteNotes === 'seen from the road' && upd.externalIds.agent === 'CFA-1', upd);
ok('update does not overwrite a size already on record', !('sizeMw' in upd));
ok('update never touches origination, stage or funding', !('origination' in upd) && !('stage' in upd) && !('funding' in upd));
ok('a Grid Atlas score is not overwritten by a traced one', !('grid' in upd));
ok('nothing to change → null', S.updateDoc(S.validateSite({ name: 'Alpha Yard' }).site, seed.deals.d1, caller, null, null) === null);
var existing = [{ id: 'd1', data: seed.deals.d1 }, { id: 'x', data: { name: 'Q', externalIds: { agent: 'E9' } } }];
eq('matchExisting by externalId beats name', S.matchExisting({ externalId: 'E9', name: 'Alpha Yard', address: '1 Main St, Abilene, TX 79601' }, existing).id, 'x');
eq('matchExisting by name|address ignores punctuation and case', S.matchExisting({ name: 'alpha yard', address: '1 MAIN ST ABILENE TX 79601' }, existing).id, 'd1');
ok('matchExisting with no key matches nothing', S.matchExisting({ name: '' }, existing) === null);

/* ── agent-auth.js ─────────────────────────────────────────────────────── */
ok('mintKey has the recognisable prefix and 48 hex', Auth.looksLikeKey(Auth.mintKey()));
ok('two minted keys differ', Auth.mintKey() !== Auth.mintKey());
var link = Auth.signLink('d2', 'ogisolar.com', 1000);
ok('a signed link verifies', Auth.verifyLink('d2', 'ogisolar.com', link.exp, link.sig));
ok('a link for another deal does not', !Auth.verifyLink('d1', 'ogisolar.com', link.exp, link.sig));
ok('a link for another org does not', !Auth.verifyLink('d2', 'someone-else.com', link.exp, link.sig));
ok('a tampered signature does not', !Auth.verifyLink('d2', 'ogisolar.com', link.exp, link.sig.replace(/^./, 'z')));
ok('an expired link does not', !Auth.verifyLink('d2', 'ogisolar.com', Date.now() - 1, Auth.signLink('d2', 'ogisolar.com', -1).sig));
eq('scopes outside the list are dropped', Auth.normScopes(['sites:read', 'admin:*']), ['sites:read']);

/* ── the handlers ──────────────────────────────────────────────────────── */
(async function () {
  var r = await call(sites, { method: 'GET', headers: {}, query: {} });
  eq('no key → 401', r.code, 401);
  r = await call(sites, { method: 'GET', headers: { authorization: 'Bearer nope' }, query: {} });
  eq('a non-key bearer → 401', r.code, 401);
  r = await call(sites, { method: 'GET', headers: bearer('omega_ak_' + 'f'.repeat(48)), query: {} });
  eq('an unknown key → 401', r.code, 401);
  r = await call(sites, { method: 'GET', headers: bearer(KEYS.revoked), query: {} });
  eq('a revoked key → 403', r.code, 403);
  r = await call(sites, { method: 'GET', headers: bearer(KEYS.sun), query: {} });
  ok('a suspended tenant\'s key → 403', r.code === 403 && /suspended/.test(r.body.error), r.body);
  r = await call(sites, { method: 'DELETE', headers: bearer(KEYS.ogi), query: {} });
  eq('DELETE → 405', r.code, 405);

  r = await call(sites, { method: 'GET', headers: bearer(KEYS.ogi), query: {} });
  eq('OGI lists its own live deals, biggest first', r.body.sites.map(function (s) { return s.id; }), ['d2', 'd1']);
  ok('the other org\'s deal is not in the list', r.body.sites.every(function (s) { return s.id !== 'd4'; }));
  ok('each row links to its outline on the host that was called', /^https:\/\/osa\.clearskyomega\.com\/api\/agent\/site-outline\?id=d2$/.test(r.body.sites[0].outlineUrl), r.body.sites[0].outlineUrl);
  r = await call(sites, { method: 'GET', headers: bearer(KEYS.ogi), query: { minAcres: '500' } });
  eq('minAcres from the query string', r.body.sites.map(function (s) { return s.id; }), ['d2']);
  r = await call(sites, { method: 'GET', headers: bearer(KEYS.admin), query: { includeDead: 'true' } });
  eq('an admin key sees every deal', r.body.total, 4);

  r = await call(sites, { method: 'POST', headers: bearer(KEYS.ogi), body: { nope: 1 } });
  eq('POST without sites → 400', r.code, 400);
  r = await call(sites, { method: 'POST', headers: bearer(KEYS.ogi), body: { sites: [
    { name: 'Alpha Yard', address: '1 Main St, Abilene, TX 79601', externalId: 'CFA-1', notes: 'from the JV list', kml: KML },
    { name: 'Epsilon Mesa', address: '77 Ranch Rd, Marfa, TX 79843', sizeMw: 300, externalId: 'CFA-2', kmzBase64: K.kmzFromKML(KML).toString('base64') },
    { name: 'Zeta Pin', lat: 31.1, lng: -100.2, acres: 640 },
    { address: 'no name' },
    { name: 'Bad ring', outline: [[1, 2]] }
  ] } });
  eq('POST → 200', r.code, 200);
  eq('one updated, two created, two errors', [r.body.updated, r.body.created, r.body.errors], [1, 2, 2]);
  var byName = {}; r.body.results.forEach(function (x) { byName[x.name] = x; });
  ok('Alpha Yard matched the existing deal and gained an outline', byName['Alpha Yard'].action === 'updated' && byName['Alpha Yard'].id === 'd1' && byName['Alpha Yard'].changed.indexOf('outline') >= 0, byName['Alpha Yard']);
  var d1 = db._store.deals.d1;
  ok('…stored on the deal, with the score left as Grid Atlas wrote it', d1.outline && d1.outline.ring.length === 5 && d1.grid.source === 'grid-atlas' && d1.origination.locked === true && d1.stage === 'screening');
  ok('…and an activity line naming the key', d1.activity.length === 1 && /CFA\/OGI JV GPT/.test(d1.activity[0].message), d1.activity);
  ok('Epsilon Mesa came in from a KMZ and was scored', byName['Epsilon Mesa'].action === 'created' && byName['Epsilon Mesa'].gridScore > 0 && byName['Epsilon Mesa'].acres > 1700, byName['Epsilon Mesa']);
  var eps = db._store.deals[byName['Epsilon Mesa'].id];
  ok('…as a referred deal originated by OGI', eps.stage === 'referred' && eps.origination.partnerOrg === 'ogisolar.com' && eps.orgsInvolved.join() === 'ogisolar.com' && eps.externalIds.agent === 'CFA-2');
  ok('Zeta Pin created with a location and no outline', byName['Zeta Pin'].action === 'created' && db._store.deals[byName['Zeta Pin'].id].grid.lat === 31.1);
  ok('the nameless row and the bad ring are errors, not writes', byName[''].action === 'error' && byName['Bad ring'].action === 'error');
  r = await call(sites, { method: 'POST', headers: bearer(KEYS.ogi), body: { sites: [{ name: 'Epsilon Mesa', externalId: 'CFA-2', sizeMw: 300 }] } });
  eq('re-uploading the same site is unchanged, not a duplicate', r.body.results[0].action, 'unchanged');
  r = await call(sites, { method: 'POST', headers: bearer(KEYS.sun), body: { sites: [{ name: 'x' }] } });
  eq('a key that cannot read cannot write either', r.code, 403);

  r = await call(outline, { method: 'GET', headers: bearer(KEYS.ogi), query: { id: 'd4' } });
  eq('another org\'s deal is 404, not 403', r.code, 404);
  r = await call(outline, { method: 'GET', headers: bearer(KEYS.ogi), query: { id: 'nope' } });
  eq('a missing deal is 404', r.code, 404);
  r = await call(outline, { method: 'GET', headers: bearer(KEYS.ogi), query: { id: 'd2' } });
  eq('outline → 200', r.code, 200);
  ok('the ring is in the response', r.body.site.outline.ring.length === 5);
  ok('the KML is inline and names the site', /<kml/.test(r.body.kml) && /Beta Flats/.test(r.body.kml));
  ok('the KMZ link is signed for this org on this host', /^https:\/\/osa\.clearskyomega\.com\/api\/agent\/kmz\?id=d2&org=ogisolar\.com&exp=\d+&sig=[0-9a-f]{40}$/.test(r.body.kmzUrl), r.body.kmzUrl);
  var u = new URL(r.body.kmzUrl), q = { id: u.searchParams.get('id'), org: u.searchParams.get('org'), exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') };
  var k = await call(kmz, { method: 'GET', headers: {}, query: q });
  eq('the link downloads without a key', k.code, 200);
  ok('…as a KMZ with the site inside', k.headers['Content-Type'] === 'application/vnd.google-earth.kmz' && K.isZip(k.body) && /Beta Flats/.test(K.kmlFromKMZ(k.body)));
  ok('…named after the site', /Beta_Flats\.kmz/.test(k.headers['Content-Disposition']));
  k = await call(kmz, { method: 'GET', headers: {}, query: Object.assign({}, q, { id: 'd4' }) });
  eq('the same signature on another deal → 403', k.code, 403);
  k = await call(kmz, { method: 'GET', headers: {}, query: Object.assign({}, q, { sig: 'f'.repeat(40) }) });
  eq('a forged signature → 403', k.code, 403);
  k = await call(kmz, { method: 'GET', headers: {}, query: Object.assign({}, q, { org: 'someone-else.com' }) });
  eq('a link re-pointed at another org → 403', k.code, 403);
  r = await call(outline, { method: 'GET', headers: bearer(KEYS.ogi), query: { id: byName['Zeta Pin'].id } });
  ok('a pin-only site says so instead of inventing a ring', r.code === 200 && r.body.site.outline === null && !r.body.site.hasOutline && /no traced outline/.test(r.body.note), r.body.note);
  ok('…and its KML is a Point at the recorded location', /<Point>/.test(r.body.kml) && !/<Polygon>/.test(r.body.kml) && /-100\.200000,31\.100000/.test(r.body.kml));
  r = await call(outline, { method: 'GET', headers: bearer(KEYS.admin), query: { id: 'd4' } });
  ok('an admin link is signed as * and downloads', r.code === 200 && /org=%2A|org=\*/.test(r.body.kmzUrl), r.body.kmzUrl);
  u = new URL(r.body.kmzUrl);
  k = await call(kmz, { method: 'GET', headers: {}, query: { id: 'd4', org: u.searchParams.get('org'), exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') } });
  eq('…on a deal no partner is on', k.code, 200);
  k = await call(kmz, { method: 'GET', headers: {}, query: { id: 'd4', org: '*', exp: q.exp, sig: q.sig } });
  eq('but typing org=* onto a partner link → 403', k.code, 403);

  var spec = res(); openapi({ method: 'GET', headers: { host: 'silmarillion.clearskyomega.com' } }, spec);
  eq('openapi → 200', spec.code, 200);
  eq('servers[0] is the host that was asked', spec.body.servers[0].url, 'https://silmarillion.clearskyomega.com');
  eq('three operations for the GPT', Object.keys(spec.body.paths).map(function (p) { return Object.keys(spec.body.paths[p]).map(function (m) { return spec.body.paths[p][m].operationId; }); }).reduce(function (a, b) { return a.concat(b); }, []).sort(), ['getSiteOutline', 'listSites', 'uploadSites']);
  ok('bearer auth is declared', spec.body.components.securitySchemes.agentKey.scheme === 'bearer');

  console.log((fail ? '✗' : '✓') + ' agent sites: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
