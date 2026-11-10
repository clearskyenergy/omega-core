/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Parcel lines in Omega Maximus (omega-editor-v2-parcels.js): the same two
 * sources and doors as Site Map's View › Parcel Lines. The lines are the ONE
 * list's county layers (omega-parcel-sources.js) or Regrid's tiles through
 * /api/parcel-tiles; the parcel under a point is POST /api/parcel, asked
 * once a point and at most LOOKUPS times a page; Use as site boundary puts
 * the ring on the drawing as the lot line. Offline: fetch and the document
 * are stood in for.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');

global.window = global;
var G = require('../../omega-editor-v2-geom.js');
var S = require('../../omega-parcel-sources.js');
global.OmegaParcelSources = S;
var P = require('../../omega-editor-v2-parcels.js');

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }

/* a document just big enough for tile nodes */
function fakeDoc() {
  function node(tag) {
    return { tag: tag, children: [], style: {}, attrs: {},
      appendChild: function (c) { this.children.push(c); return c; },
      setAttribute: function (k, v) { this.attrs[k] = v; }, getContext: function () { return null; } };
  }
  return { createElement: node };
}
global.Image = function () { this.src = ''; };
var store = {};
global.localStorage = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); } };

var MESA = { lat: 33.41541, lng: -111.83264 };
function tileAt(lat, lng, z) {
  var nT = Math.pow(2, z), x = Math.floor((lng + 180) / 360 * nT), r = lat * Math.PI / 180;
  var y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * nT);
  return { z: z, x: x, y: y };
}

/* ── the lines: the ONE list's county layers, or Regrid's ─────────────── */
var t = tileAt(MESA.lat, MESA.lng, 18);
var county = P.tileNode(t, fakeDoc());
var expected = S.SOURCES.map(function (src) { return S.tileUrl(src, t.x, t.y, t.z); }).filter(Boolean);
check(county && county.children.length === expected.length && expected.length >= 1, 'a tile in Maricopa asks each county layer whose box it touches');
check(county.children.every(function (img, i) { return img.tag === 'img' && img.src === expected[i]; }), 'the pictures are the ONE list\'s own tile URLs');
check(P.tileNode(tileAt(0, -150, 18), fakeDoc()) === null, 'a tile no layer covers asks nobody');
check(P.source() === 'county' && P.coverage(MESA.lat, MESA.lng).map(function (c) { return c.label; }).join() === 'Maricopa County, AZ', 'without Regrid the coverage is the county list');

/* ── the doors, stood in for ──────────────────────────────────────────── */
var posted = [], parcelAnswer = null, tilesAnswer = { ok: false, reason: 'not-configured' }, signedIn = true;
global.OmegaEditorV2Auth = { idToken: function () { return Promise.resolve(signedIn ? 'tok' : ''); } };
global.fetch = function (url, opts) {
  var body = opts && opts.body ? JSON.parse(opts.body) : null;
  posted.push({ url: url, body: body, auth: opts && opts.headers && opts.headers.Authorization });
  var j = url === '/api/parcel-tiles' ? tilesAnswer : (typeof parcelAnswer === 'function' ? parcelAnswer(body) : parcelAnswer);
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(j); } });
};

/* A 100 ft square lot at the Mesa point, in lat/lng, closed as ArcGIS closes it. */
var dLat = 100 / 364000, dLng = 100 / (364000 * Math.cos(MESA.lat * Math.PI / 180));
var ring = [[MESA.lat - dLat / 2, MESA.lng - dLng / 2], [MESA.lat - dLat / 2, MESA.lng + dLng / 2], [MESA.lat + dLat / 2, MESA.lng + dLng / 2], [MESA.lat + dLat / 2, MESA.lng - dLng / 2], [MESA.lat - dLat / 2, MESA.lng - dLng / 2]];
parcelAnswer = { ok: true, ring: ring, apn: '138-41-024', owner: 'A Person Who Is Not Shown', acres: 0.23, zoning: 'DC', county: 'Maricopa County, AZ', source: 'maricopa' };

P.setEnabled(true, MESA).then(function (rec) {
  check(P.enabled() && store.omegaMaximusParcels === '1', 'the lines come on and this browser remembers it');
  check(posted[0].url === '/api/parcel-tiles' && posted[0].auth === 'Bearer tok', 'Regrid\'s ticket is asked first, signed in');
  check(posted[1].url === '/api/parcel' && posted[1].body.lat === MESA.lat && posted[1].body.lng === MESA.lng, 'then the parcel under the site point');
  check(rec && rec.apn === '138-41-024' && P.foundAt(MESA.lat, MESA.lng) === rec, 'the parcel is found and held');
  var c = P.card(MESA.lat, MESA.lng);
  var text = c.lines.map(function (l) { return l.text; }).join(' ');
  check(c.visible && c.parcel === rec && /APN 138-41-024/.test(text) && /0\.23 ac/.test(text) && /Maricopa/.test(text), 'the card names the APN, the acres and the county');
  check(/tax map, not a survey/.test(text) && text.indexOf('Not Shown') < 0 && JSON.stringify(rec).indexOf('Not Shown') < 0, 'it says reference only, and the owner is not kept or shown');
  var before = posted.length;
  return P.lookup(MESA.lat + dLat / 4, MESA.lng).then(function (again) {
    check(again === rec && posted.length === before, 'a point inside a parcel already found asks nobody');
  });
}).then(function () {
  /* the lot line */
  var anchor = { lat: MESA.lat, lng: MESA.lng };
  var ent = P.toEntity(P.foundAt(MESA.lat, MESA.lng), anchor);
  check(ent && ent.type === 'polygon' && ent.layer === 'site' && ent.closed === true && ent.pts.length === 4, 'Use as site boundary is a closed polygon on the Site layer, the repeated last point dropped');
  var area = Math.abs(G.area(ent.pts));
  check(Math.abs(area - 10000) < 150, 'it is the lot to scale, in feet from the anchor: ' + Math.round(area) + ' ft²');
  check(ent.parcel.apn === '138-41-024' && ent.parcel.source === 'maricopa' && ent.label === 'Parcel 138-41-024' && !ent.parcel.owner, 'and it says where it came from, without the owner');

  /* the outline on the canvas */
  var ops = [];
  var ctx = { save: function () {}, restore: function () {}, beginPath: function () { ops.push('begin'); }, moveTo: function () { ops.push('move'); },
    lineTo: function () { ops.push('line'); }, closePath: function () {}, fill: function () { ops.push('fill'); }, stroke: function () { ops.push('stroke'); } };
  P.draw(ctx, function (p) { return { x: p.x, y: p.y }; }, anchor);
  check(ops.filter(function (o) { return o === 'stroke'; }).length === 1 && ops.indexOf('move') > 0, 'the parcel found is outlined on the drawing');

  /* signed out: nothing is spent, and it can be asked again */
  signedIn = false;
  var before = posted.length;
  return P.lookup(33.5, -111.9).then(function (r) {
    check(r === null && posted.length === before && /Sign in/.test(P.status()), 'signed out, nobody is asked and it says to sign in');
    signedIn = true;
  });
}).then(function () {
  /* the metered limit: at most LOOKUPS points a page */
  parcelAnswer = { ok: false, reason: 'no parcel record here' };
  var chain = Promise.resolve(), i;
  for (i = 0; i < P.LOOKUPS + 2; i++) (function (k) { chain = chain.then(function () { return P.lookup(34 + k * 0.01, -112); }); })(i);
  var before = posted.filter(function (p) { return p.url === '/api/parcel'; }).length;
  return chain.then(function () {
    var asked = posted.filter(function (p) { return p.url === '/api/parcel'; }).length - before;
    check(asked === P.LOOKUPS - 1, 'a page spends at most ' + P.LOOKUPS + ' parcel lookups (one already spent): ' + asked);
    check(/used its 12 parcel lookups/.test(P.status()), 'and says so after');
  });
}).then(function () {
  /* Regrid: the tiles come from this origin with the ticket, never a token */
  P.reset();
  tilesAnswer = { ok: true, ticket: 'month-ticket', minZoom: 15, source: 'Regrid' };
  parcelAnswer = { ok: false, reason: 'no parcel record here' };
  return P.setEnabled(true, { lat: 34.2, lng: -112 });
}).then(function () {
  check(P.source() === 'regrid' && P.coverage(0, 0)[0].label === 'Regrid (every county)', 'with a ticket, Regrid draws every county');
  var node = P.tileNode(tileAt(MESA.lat, MESA.lng, 18), fakeDoc());
  var cv = node && node.children[0];
  check(cv && cv.tag === 'canvas' && /^\/api\/parcel-tiles\?z=18&x=\d+&y=\d+&t=month-ticket$/.test(cv.attrs['data-src']), 'a Regrid tile is this origin\'s relay with the monthly ticket');
  check(P.tileNode(tileAt(MESA.lat, MESA.lng, 14), fakeDoc()) === null, 'and nothing below Regrid\'s zoom');
  P.setEnabled(false);
  check(!P.enabled() && !P.card(0, 0).visible && store.omegaMaximusParcels === '0', 'off, nothing is drawn and the browser remembers that too');

  /* the browser file names no service and carries no token */
  var src = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-parcels.js'), 'utf8');
  check(src.indexOf('arcgis') < 0 && src.indexOf('regrid.com') < 0 && src.indexOf('REGRID_TOKEN') < 0, 'no county service URL and no Regrid key in the page: the list and the relay hold them');
  var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
  var a = page.indexOf('src="omega-parcel-sources.js"'), b = page.indexOf('src="omega-editor-v2-parcels.js"'), c = page.indexOf('src="omega-editor-v2-app.js"');
  check(a > 0 && b > a && c > b, 'the page loads the ONE list, then parcels, then the app');
  check(page.indexOf('id="map-parcels"') > page.indexOf('id="map"') && page.indexOf('id="parcel-use"') > 0, 'the lines sit over the photo, and the card can make the lot line');
  check(fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8').indexOf('omega-editor-v2-parcels') < 0, 'Site Map is unchanged');
  console.log('teditorv2parcels: ' + n + ' checks passed');
}).catch(function (e) { console.error(e); process.exit(1); });
