#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * View › Parcel Lines: the ONE list of public parcel layers
 * (omega-parcel-sources.js) and the editor's block that draws it.
 *
 * A customer asked to "have the map show the parcels so they know property
 * lines" (2026-10-02). Google's JavaScript API has no parcel layer, so the
 * lines are county and state ArcGIS layers drawn as tiles, plus the parcel at
 * the map centre from /api/parcel. Held here:
 *   1. the list: every layer well formed, the server's lookup table built
 *      from it unchanged, and no second copy of a county URL in the editor
 *      or in api/parcel.js;
 *   2. the tile maths and URLs: the right tile of the right layer, nothing
 *      asked outside a layer's box or below the zoom it draws at;
 *   3. the editor's own block, cut out of editor.html and run against a
 *      stand-in Google map: on, off, the outline, lookups spent only where
 *      no public line draws and never twice, a rebuilt map followed, and
 *      every other overlay (3DEP) left alone.
 * No network: the layers are verified by hand (see the file's header). */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..');
var PS = require('../../omega-parcel-sources.js');
var n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); n++; }

/* ── 1 · the list ──────────────────────────────────────────────────────── */
var ids = {};
PS.SOURCES.forEach(function (s) {
  ok(/^[a-z]+$/.test(s.id) && !ids[s.id], s.id + ': a unique id'); ids[s.id] = true;
  ok(typeof s.label === 'string' && s.label.length > 3, s.id + ': a label people read');
  ok(/^https:\/\/[^/]+\/.+\/MapServer$/.test(s.service), s.id + ': an https MapServer root');
  ok(s.lineLayer === (s.lineLayer | 0) && s.lineLayer >= 0, s.id + ': a layer id');
  ok(s.minZoom >= 12 && s.minZoom <= 18, s.id + ': draws from a street zoom');
  var b = s.bbox;
  ok(b.length === 4 && b[0] < b[2] && b[1] < b[3] && b[0] > 18 && b[2] < 50 && b[1] > -125 && b[3] < -66,
     s.id + ': a [south, west, north, east] box inside the lower 48');
});
ok(PS.SOURCES.length >= 8, 'eight verified layers');
ok(PS.LOOKUP_ORDER[PS.LOOKUP_ORDER.length - 1] === 'cook', 'the server asks Cook last (its box holds DuPage)');
PS.LOOKUP_ORDER.forEach(function (id) {
  var s = PS.byId(id);
  ok(s && s.lookup && typeof s.lookup.idField === 'string' && s.lookup.county, id + ': a lookup layer for the server');
});
/* what api/parcel.js asked before the list was shared, byte for byte */
eq(PS.lookupLayers(), {
  dupage: { url: 'https://gis.dupageco.org/arcgis/rest/services/DuPage_County_IL/ParcelsWithRealEstateCC/MapServer/0',
            idField: 'PIN', owner: 'BILLNAME', label: 'DuPage County', bbox: [41.63, -88.27, 42.02, -87.90] },
  lake:   { url: 'https://maps.lakecountyil.gov/arcgis/rest/services/GISMapping/WABParcels/MapServer/12',
            idField: 'pin', owner: 'taxpayer_name', label: 'Lake County', bbox: [42.15, -88.20, 42.50, -87.75] },
  cook:   { url: 'https://gis12.cookcountyil.gov/traditional/rest/services/CookViewer3Parcels/MapServer/0',
            idField: 'PIN14_dash', owner: null, label: 'Cook County', bbox: [41.46, -88.27, 42.16, -87.52] }
}, 'the server lookup table is unchanged');
var apiSrc = fs.readFileSync(path.join(ROOT, 'api/parcel.js'), 'utf8');
var edSrc = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
ok(/require\('\.\.\/omega-parcel-sources\.js'\)/.test(apiSrc), 'api/parcel.js reads the one list');
PS.SOURCES.forEach(function (s) {
  var host = s.service.split('/')[2];
  ok(apiSrc.indexOf(host) < 0, 'api/parcel.js carries no copy of ' + host);
  ok(edSrc.indexOf(host) < 0, 'editor.html carries no copy of ' + host);
});

/* ── 2 · tiles ─────────────────────────────────────────────────────────── */
function tileOf(lat, lng, z) {
  var k = Math.pow(2, z), r = lat * Math.PI / 180;
  return [Math.floor((lng + 180) / 360 * k), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * k)];
}
var W = 20037508.342789244;
eq(PS.tileBbox(0, 0, 0).map(Math.round), [-W, -W, W, W].map(Math.round), 'z0 is the whole world');
var CHI = [41.8781, -87.6298], RAL = [35.7796, -78.6382], WHEATON = [41.8661, -88.1070],
    SARATOGA = [43.0831, -73.7846], KANSAS = [38.5, -98.0];
var t = tileOf(CHI[0], CHI[1], 17), box = PS.tileBox(t[0], t[1], 17);
ok(box[0] <= CHI[0] && CHI[0] <= box[2] && box[1] <= CHI[1] && CHI[1] <= box[3], 'a tile\'s box holds the point it was cut for');
var cook = PS.byId('cook'), lake = PS.byId('lake'), nc = PS.byId('nc');
var u = PS.tileUrl(cook, t[0], t[1], 17);
ok(u.indexOf(cook.service + '/export?bbox=') === 0, 'Cook: the export of the layer\'s own service');
ok(/&bboxSR=3857&imageSR=3857&size=256%2C256&/.test(u) && /&format=png32&transparent=true&f=image$/.test(u), 'a transparent 256 px Web Mercator tile');
var dyn = JSON.parse(decodeURIComponent(u.match(/dynamicLayers=([^&]+)/)[1]));
eq(dyn[0].drawingInfo.showLabels, false, 'restyled: no PIN on every lot');
eq(dyn[0].drawingInfo.renderer.symbol.outline.color, PS.LINE_RGBA, 'restyled: the one line colour');
eq(dyn[0].drawingInfo.renderer.symbol.style, 'esriSFSNull', 'restyled: outline only, no fill over the imagery');
eq(dyn[0].id, cook.lineLayer, 'restyled: the line layer');
ok(PS.tileUrl(nc, t[0], t[1], 17) === null, 'a Chicago tile is never asked of North Carolina');
ok(PS.tileUrl(cook, t[0], t[1], 17).indexOf(PS.tileUrl(cook, t[0] + Math.pow(2, 17), t[1], 17).split('?')[0]) === 0
   && PS.tileUrl(cook, t[0] + Math.pow(2, 17), t[1], 17) === u, 'x wraps round the world');
var t15 = tileOf(CHI[0], CHI[1], 15);
ok(PS.tileUrl(cook, t15[0], t15[1], 15) === null, 'Cook draws from z16: nothing asked at z15');
ok(PS.tileUrl(cook, 0, -1, 17) === null && PS.tileUrl(cook, 0, Math.pow(2, 17), 17) === null, 'rows off the world are not asked');
var tl = tileOf(42.3636, -87.8448, 16), lu = PS.tileUrl(lake, tl[0], tl[1], 16);
ok(/&layers=show%3A11&/.test(lu) && lu.indexOf('dynamicLayers') < 0, 'Lake: its own line layer in its own style (no dynamicLayers there)');
eq(PS.at(CHI[0], CHI[1]).map(function (s) { return s.id; }), ['cook'], 'Chicago: Cook');
eq(PS.at(WHEATON[0], WHEATON[1]).map(function (s) { return s.id; }), ['dupage', 'cook'], 'Wheaton: DuPage, and Cook\'s box');
eq(PS.at(RAL[0], RAL[1]).map(function (s) { return s.id; }), ['nc'], 'Raleigh: North Carolina');
eq(PS.at(SARATOGA[0], SARATOGA[1]).map(function (s) { return s.id; }), ['ny'], 'Saratoga: New York\'s box');
eq(PS.at(KANSAS[0], KANSAS[1]), [], 'Kansas: no public layer');
eq(PS.within([41.0, -88.5, 41.5, -88.0]).map(function (s) { return s.id; }), ['cook', 'will'], 'a view touching Cook\'s and Will\'s boxes');
var sq = [[0, 0], [0, 1], [1, 1], [1, 0]];
ok(PS.inRing(sq, 0.5, 0.5) && !PS.inRing(sq, 1.5, 0.5) && !PS.inRing(sq, 0.5, -0.1) && !PS.inRing([[0, 0], [1, 1]], 0.5, 0.5),
   'a point in a ring, and not out of it');

/* ── 3 · the editor's block, run ───────────────────────────────────────── */
var a = edSrc.indexOf(' *  PARCEL LINES  (View'), b = edSrc.indexOf("var TT_BASE = 'https://elevation.nationalmap.gov");
ok(a > 0 && b > a, 'the block is in editor.html');
var block = edSrc.slice(edSrc.lastIndexOf('/*', a), b);
ok(edSrc.indexOf('<script src="/omega-parcel-sources.js"></script>') > 0
   && edSrc.indexOf('<script src="/omega-parcel-sources.js"></script>') < a, 'the list loads before the block');
var btn = edSrc.match(/<button class="rbtn" id="rb-parcels"[^>]*>[\s\S]*?<\/button>/);
ok(btn && /onclick="rbRun\(pcToggle\)"/.test(btn[0]) && /Parcel<br>Lines/.test(btn[0]), 'View has a Parcel Lines button');
var viewPage = edSrc.slice(edSrc.indexOf('<div class="ribbon-page" data-page="view">'), edSrc.indexOf('<div class="ribbon-page" data-page="output">'));
ok(viewPage.indexOf('id="rb-parcels"') > 0 && !/id="rb-parcels"[^>]*data-cap=/.test(viewPage), 'on the View page, on every plan');
var panelsGroup = viewPage.slice(viewPage.lastIndexOf('<div class="rpanel">', viewPage.indexOf('id="rb-parcels"')));
panelsGroup = panelsGroup.slice(0, panelsGroup.indexOf('rpanel-cap') + 40);
ok(/rpanel-cap">Panels</.test(panelsGroup), 'in View › Panels, where it was asked for');
var keep = edSrc.slice(edSrc.indexOf('var KEEP = ['), edSrc.indexOf('];', edSrc.indexOf('var KEEP = [')));
ok(/\/pcToggle\//.test(keep), 'Designer mode (every legacy plan\'s default ribbon) keeps it');

function MVC(init) {
  var arr = (init || []).slice();
  return { push: function (x) { arr.push(x); }, getLength: function () { return arr.length; },
           getAt: function (i) { return arr[i]; }, removeAt: function (i) { arr.splice(i, 1); },
           forEach: function (f) { arr.forEach(f); }, all: function () { return arr.slice(); } };
}
function makeMap(lat, lng, z) {
  var m = { lat: lat, lng: lng, z: z, listeners: [], overlayMapTypes: MVC([{ name: 'USGS 3DEP' }]),
            getCenter: function () { return { lat: function () { return m.lat; }, lng: function () { return m.lng; } }; },
            getZoom: function () { return m.z; } };
  return m;
}
var timers, intervals, banners, asks, store, polys, ANSWER, button, ctx;
/* one page: a fresh context with the list and the editor's block loaded */
function page(remembered) {
  timers = []; intervals = []; banners = []; asks = []; store = {}; polys = []; ANSWER = {};
  if (remembered) store.omegaParcelLines = remembered;
  button = { attrs: {}, title: '', setAttribute: function (k, v) { this.attrs[k] = v; } };
  ctx = {
    console: { warn: function () {}, log: function () {}, info: function () {}, table: function () {} },
    Math: Math, JSON: JSON, isFinite: isFinite, parseFloat: parseFloat, Promise: Promise,
    setTimeout: function (f) { timers.push(f); return timers.length; }, clearTimeout: function () {},
    setInterval: function (f) { intervals.push(f); return intervals.length; }, clearInterval: function () {},
    localStorage: { getItem: function (k) { return store[k] == null ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); } },
    document: { readyState: 'complete', getElementById: function (id) { return id === 'rb-parcels' ? button : null; },
                addEventListener: function () {} },
    showBanner: function (type, msg) { banners.push(msg); },
    OmegaAutopilot: { parcel: function (lat, lng) {
      asks.push([lat, lng]);
      var r = ANSWER.next; return r instanceof Error ? Promise.reject(r) : Promise.resolve(r === undefined ? null : r);
    } },
    google: { maps: {
      Size: function (w, h) { this.w = w; this.h = h; },
      ImageMapType: function (o) { this.name = o.name; this.minZoom = o.minZoom; this.getTileUrl = o.getTileUrl; this.setOpacity = function (v) { this.opacity = v; }; },
      Polygon: function (o) { this.opts = o; this.map = o.map; this.setMap = function (mm) { this.map = mm; }; polys.push(this); },
      event: { addListener: function (m, ev, f) { var h = { m: m, ev: ev, f: f }; m.listeners.push(h); return h; },
               removeListener: function (h) { var i = h.m.listeners.indexOf(h); if (i >= 0) h.m.listeners.splice(i, 1); } }
    } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'omega-parcel-sources.js'), 'utf8'), ctx);
  vm.runInContext(block, ctx);
}
page(null);
function settle() { return new Promise(function (r) { setImmediate(r); }); }
function idle(m) { m.listeners.forEach(function (h) { if (h.ev === 'idle') h.f(); }); var t2 = timers.splice(0); t2.forEach(function (f) { f(); }); }
function parcelLayers(m) { return m.overlayMapTypes.all().filter(function (l) { return /^Parcel lines/.test(l.name || ''); }); }
var RING = [[41.8780, -87.6300], [41.8780, -87.6296], [41.8783, -87.6296], [41.8783, -87.6300]];

(async function () {
  eq(button.attrs['aria-pressed'], 'false', 'off by default: the button is not pressed');
  ok(asks.length === 0 && intervals.length === 0, 'off by default: nothing asked, nothing watched');

  /* on before the map exists: says so, and attaches when one appears */
  ok(vm.runInContext('pcToggle()', ctx) === true, 'on');
  eq(store.omegaParcelLines, '1', 'remembered in this browser');
  ok(/once the site map loads/.test(banners[banners.length - 1]), 'no map yet: says the lines come with it');
  var m1 = makeMap(CHI[0], CHI[1], 19);
  ANSWER.next = { ring: RING, apn: '17-16-222-009', acres: 0.42, county: 'Cook County', source: 'cook' };
  ctx._gmap = m1; intervals[0]();
  await settle();
  eq(parcelLayers(m1).length, PS.SOURCES.length, 'one tile layer per public source');
  ok(m1.overlayMapTypes.getAt(0).name === 'USGS 3DEP', 'the overlay that was there stays first');
  var tt = tileOf(CHI[0], CHI[1], 19);
  var urls = parcelLayers(m1).map(function (l) { return l.getTileUrl({ x: tt[0], y: tt[1] }, 19); }).filter(Boolean);
  ok(urls.length === 1 && urls[0].indexOf(cook.service) === 0, 'a Chicago tile is asked of Cook alone');
  eq(asks.length, 1, 'the parcel at the centre is looked up once');
  ok(polys.length === 1 && polys[0].map === m1 && polys[0].opts.clickable === false, 'and outlined, never in the way of a click');
  var said = banners[banners.length - 1];
  ok(/Lines from Cook County, IL/.test(said) && /APN 17-16-222-009 · 0\.42 ac · Cook County \(cook\)/.test(said) && /not a survey/.test(said),
     'the banner names the source, the parcel and that it is not a survey: ' + said);
  eq(button.attrs['aria-pressed'], 'true', 'the button is pressed');
  ok(/APN 17-16-222-009/.test(button.title), 'and its tooltip says what is drawing');

  /* the map settles: inside the parcel found, and elsewhere where public lines draw */
  var nb = banners.length;
  idle(m1); await settle();
  eq(asks.length, 1, 'inside the parcel already found: nothing asked again');
  m1.lat = 41.90; m1.lng = -87.65; idle(m1); await settle();
  eq(asks.length, 1, 'elsewhere in Cook: the public lines show it, no lookup spent');
  ok(banners.length === nb, 'a pan updates the tooltip, never a banner');

  /* where no public layer draws, the lookup follows the map */
  m1.lat = KANSAS[0]; m1.lng = KANSAS[1];
  ANSWER.next = { ring: [[38.49, -98.01], [38.49, -97.99], [38.51, -97.99], [38.51, -98.01]], apn: 'K-1', acres: 160, county: 'Rice', source: 'regrid' };
  idle(m1); await settle();
  eq(asks.length, 2, 'Kansas: no public layer, the parcel at the centre is looked up');
  ok(polys.length === 2 && /No public parcel layer covers this area/.test(button.title), 'outlined, and the tooltip is honest about coverage');
  m1.lat = 38.505; idle(m1); await settle();
  eq(asks.length, 2, 'inside that parcel: not again');
  m1.z = 12; m1.lat = 38.0; idle(m1); await settle();
  ok(asks.length === 2 && /Zoom in to the site/.test(button.title), 'zoomed out: nothing asked, says zoom in');
  m1.z = 18;

  /* signed out: said plainly, and the point may be asked again later */
  ANSWER.next = new Error('signed out');
  m1.lat = 38.2; idle(m1); await settle();
  ok(asks.length === 3 && /Sign in to look up/.test(button.title), 'signed out: says sign in');
  ANSWER.next = null;
  idle(m1); await settle();
  ok(asks.length === 4 && /No parcel record at the map centre/.test(button.title), 'a refused point is asked again, and a miss is said');

  /* the cap: Regrid is metered */
  for (var i = 0; i < 20; i++) { m1.lat = 37 + i * 0.01; idle(m1); await settle(); }
  eq(asks.length, 12, 'never more than twelve lookups a page');
  ok(/used its 12 parcel lookups/.test(button.title), 'and says so');

  /* off: every parcel layer and outline gone, 3DEP untouched */
  ok(vm.runInContext('pcToggle()', ctx) === false, 'off');
  eq(m1.overlayMapTypes.all().map(function (l) { return l.name; }), ['USGS 3DEP'], 'off: only what was there before');
  ok(polys.every(function (p) { return p.map === null; }) && m1.listeners.length === 0, 'off: outlines and listeners removed');
  eq(store.omegaParcelLines, '0', 'off is remembered');
  eq(button.attrs['aria-pressed'], 'false', 'off: the button is not pressed');

  /* on again on a NEW map: what was found is drawn again without a lookup */
  var m2 = makeMap(CHI[0], CHI[1], 19), before = asks.length;
  ctx._gmap = m2;
  vm.runInContext('pcToggle()', ctx); await settle();
  ok(parcelLayers(m2).length === PS.SOURCES.length && asks.length === before, 'back on: the lines, no lookup for a parcel already found');
  ok(polys.filter(function (p) { return p.map === m2; }).length === 2, 'both parcels found this page outlined again');
  ok(/APN 17-16-222-009/.test(banners[banners.length - 1]), 'and the centre parcel named from what was found');

  /* the map is rebuilt (a new address): followed */
  var m3 = makeMap(RAL[0], RAL[1], 18);
  ctx._gmap = m3; intervals[intervals.length - 1]();
  await settle();
  ok(parcelLayers(m2).length === 0 && parcelLayers(m3).length === PS.SOURCES.length, 'a rebuilt map gets the lines; the old one lets go');
  ok(/Lines from North Carolina/.test(button.title), 'and the tooltip names the new source');

  /* a page opened with the choice remembered comes back on, quietly */
  page('1');
  eq(button.attrs['aria-pressed'], 'true', 'remembered on: the button is pressed at load');
  ok(intervals.length === 1 && banners.length === 0, 'remembered on: watching for the map, no banner');
  var m4 = makeMap(CHI[0], CHI[1], 19);
  ANSWER.next = { ring: RING, apn: '17-16-222-009', acres: 0.42, county: 'Cook County', source: 'cook' };
  ctx._gmap = m4; intervals[0]();
  await settle();
  ok(parcelLayers(m4).length === PS.SOURCES.length && asks.length === 1 && polys.length === 1, 'the map arrives: lines and the centre parcel');
  ok(banners.length === 0 && /APN 17-16-222-009/.test(button.title), 'quietly: the tooltip says it, no banner on a page load');

  /* the list failed to load: the toggle still answers and says why */
  page(null);
  vm.runInContext('delete window.OmegaParcelSources', ctx);
  ctx._gmap = makeMap(CHI[0], CHI[1], 19);
  vm.runInContext('pcToggle()', ctx); await settle();
  ok(parcelLayers(ctx._gmap).length === 0 && /did not load/.test(banners[banners.length - 1]), 'no list: no layers, and it says the list did not load');

  console.log('parcel lines: ' + n + ' checks passed.');
})().catch(function (e) { console.error(e); process.exit(1); });
