/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Placed equipment stays at its true footprint through a zoom, read off the
 * REAL Site Map in Chromium.
 *
 * Equipment is drawn from its footprint in FEET by omegaRescaleElements
 * (editor.html, ELEMENT ZOOM SCALING). That rescale was a wrapper on
 * window._geoReprojectAll, and the anchor engine's standDown() replaces that
 * chain at boot, so it never ran: 0 calls in Chromium, found by the Omega
 * Prime transfer (clearskyenergy/omega-core#354). A second scaler (OmegaGeo)
 * resized gear instead, from a ground size it read off the PIXELS (a 28 px
 * floor read back as a 10 ft unit, the old zoom's pixels over the new zoom's
 * scale), every unit held at 22 px. BESS, transformer, disconnect, service
 * and chargers were true to scale only at the zoom they were placed at, and
 * zoomed out, neighbouring gear overlapped.
 *
 * Boots the editor offline (the Firebase compat surface as
 * render-legacy-gates.js does, the Maps JavaScript API from
 * scripts/_lib/gmaps-double.js), opens a live map through the editor's own
 * address search, places gear the way its builders do (a guided build's
 * _evAdd; Omega Prime's true-scale gear on its 4 px floor; the Insert
 * palette), zooms the MAP out and in, and fails when:
 *   - an element's on-screen box is not its footprint in feet x pxPerFt
 *     within a pixel, or, where that is smaller, the floor it was placed with
 *     (_evAdd's 28 x 20 / 14 x 12, Prime's 4 px, Insert's 22 x 10);
 *   - a unit's centre leaves its ground anchor, or Prime's gear, 5 ft apart,
 *     overlaps at any zoom where its 4 px floor leaves the gap;
 *   - the size waits for the map's idle instead of moving with the position
 *     (checked two frames after the zoom), or another pass changes it later;
 *   - a size set by hand does not hold through a zoom: a width typed in the
 *     properties panel, a DCFC unit typed in feet (OmegaDCFC.setUnitFt) or
 *     saved before that recorded it, a unit scaled in the 3D site view; or
 *     the selected unit loses its outline when it is redrawn;
 *   - the rescale never runs, or runs twice in one animation frame;
 *   - the ground size the takeoff and the GeoJSON export read (_geoWFt) is
 *     not the footprint;
 *   - a unit with no released footprint (primeFootprint 'none', primeMarkFt
 *     2 ft, from #354) is not a 2 ft marker at every zoom, where this editor
 *     reads one (it says so when it does not);
 *   - what carries no footprint of its own, placed once OmegaGeo has armed
 *     and first moved by a ZOOM, is not drawn from the pixels it was placed
 *     at over the scale they were drawn at: a BESS assembly (400 px, drawn
 *     0.55 deep and centred on that), its ground size and size at every
 *     settled zoom; a charger and a 2 MWh battery saved before _evAdd
 *     recorded footprints are not their kind's (2.9 x 3.1 ft, the rating's
 *     20 x 8 ft) on _evAdd's floors; an Insert charger's own bollard is not
 *     Insert's footprint, or a Level 2 bollard leaves its 14 px;
 *   - a node left for an element the model no longer has is not swept after
 *     the map moves;
 *   - the page throws.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var X = require('../api/_lib/package-access'), P = require('../api/_lib/subscription-pricing'), BOOK = require('../api/_lib/pricebook').proposed();
var G = require('./_lib/gmaps-double');
var ROOT = path.join(__dirname, '..');
var GMAPS = fs.readFileSync(path.join(__dirname, '_lib', 'gmaps-double.js'), 'utf8');
var chromium;
try { chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium; }
catch (e) { console.log('render-element-zoom: playwright is not installed here; skipped.'); process.exit(0); }

var SITE = { lat: 41.8781, lng: -87.6298 };          /* Chicago, as tprimetransfer.js: zoom 20 is 2.74 px/ft */
var ADDRESS = '233 S Wacker Dr, Chicago, IL 60606';
var PLACED_AT = 20;
var ZOOMS = [21, 22, 21, 20, 19, 18, 17, 18, 19, 20];
var INSERT_FLOOR = { w: 22, h: 10 };                  /* what Insert drops a symbol at (OmegaInsert) */
var PRIME_MIN_PX = 4;                                 /* omega-prime-handoff.js MIN_PX */

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

/* An active tenant on a legacy Enterprise plan (nothing gated), signed in,
   the Firebase compat surface offline; and a frame counter that runs first
   in every animation frame, so a rescale can be dated to its frame. */
function fixture(plan) {
  window.__fixtureBilling = plan;
  var user = { uid: 'zoom-user', email: 'designer@zoom.example', emailVerified: true, displayName: 'Zoom Designer', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? window.__fixtureBilling :
      /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Zoom preview', status: 'active', domains: [location.hostname] } :
      /members\//.test(p) ? { role: 'owner', status: 'active' } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () { return Promise.resolve(snapshot(p)); },
      onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; },
      set: function () { return Promise.resolve(); }, update: function () { return Promise.resolve(); }, add: function () { return Promise.resolve({ id: 'fixture' }); } };
  }
  var db = { collection: function (n) { return ref(n); }, settings: function () {}, enablePersistence: function () { return Promise.resolve(); } };
  window.__fixtureUser = user; window.__fixtureListeners = [];
  var auth = { currentUser: null, onAuthStateChanged: function (fn) { window.__fixtureListeners.push(fn); return function () {}; }, getRedirectResult: function () { return Promise.resolve({}); }, setPersistence: function () { return Promise.resolve(); }, signOut: function () { return Promise.resolve(); } };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp: function () { return 'fixture-time'; } };
  function authentication() { return auth; }
  authentication.Auth = { Persistence: { LOCAL: 'local' } };
  authentication.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var app = { firestore: firestore, auth: authentication };
  window.firebase = { apps: [app], initializeApp: function () { return app; }, app: function () { return app; }, firestore: firestore, auth: authentication };
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'zoom.example', name: 'Zoom preview', tier: plan.tier, status: 'active' } };
  window.alert = function () {};
  window.__frame = 0;
  (function tick() { window.__frame++; requestAnimationFrame(tick); })();
}

var count = 0;
function ok(value, label) { assert(value, label); count++; }

(async function main() {
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch();
  var billing = { tier: 'enterprise', addons: [] };
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(fixture, billing);
  await context.route('**/*', function (route) {
    var url = new URL(route.request().url());
    function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
    if (url.hostname === 'maps.googleapis.com' && url.pathname === '/maps/api/js')
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: G.gmapsScript(GMAPS, url.href, { at: SITE }) });
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/package-access') return json(200, X.legacy(billing, Date.now()));
    if (url.pathname === '/api/offerings') return json(200, { modules: P.catalog(BOOK) });
    if (url.pathname.indexOf('/api/') === 0) return json(503, { error: 'Offline producer' });
    return route.continue();
  });
  var page = await context.newPage(), errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  try {
    await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(function () { firebase.auth().currentUser = window.__fixtureUser; window.__fixtureListeners.forEach(function (fn) { fn(window.__fixtureUser); }); });
    await page.waitForFunction(function () { return window.OmegaCaps && document.body.getAttribute('data-tier') === 'enterprise'; }, null, { timeout: 60000 });
    await page.waitForTimeout(2500);

    /* the live map, through the editor's own address search */
    await page.evaluate(function (a) { document.getElementById('addr-in').value = a; fetchMap(); }, ADDRESS);
    await page.waitForFunction(function () { return window._gmap && S.pxPerFt > 0 && !!_liveMapState(); }, null, { timeout: 30000 });
    var opened = await page.evaluate(function () { return { zoom: _gmap.getZoom(), ppf: S.pxPerFt, double: !!google.maps.__double }; });
    if (opened.zoom !== PLACED_AT) { await page.evaluate(function (z) { _gmap.setZoom(z); }, PLACED_AT); }
    await page.waitForTimeout(2000);            /* standDown, the zoom hold, the 3D guard: every boot-time wrapper lands */
    ok(opened.double, 'the editor runs on the Maps double');

    /* count every run of the rescale, by animation frame */
    await page.evaluate(function () {
      window.__scaleRuns = [];
      var orig = window.omegaRescaleElements;
      window.omegaRescaleElements = function () { window.__scaleRuns.push({ frame: window.__frame, ppf: S.pxPerFt }); return orig.apply(this, arguments); };
    });

    /* place the gear, in a row across the middle of the sheet */
    var placed = await page.evaluate(function (cfg) {
      var ppf = S.pxPerFt, sz = _getCanvasSize(), out = [];
      /* does this editor read Prime's marker (#354)? asked through what the rescale exports */
      var marker = (typeof window.omegaElementFootprint === 'function') && (function () { var f = window.omegaElementFootprint({ type: 'evgear', primeFootprint: 'none', primeMarkFt: 2 }); return !!(f && f.lf === 2 && f.wf === 2); })();
      function rec(el, group, ft, floor) { out.push({ id: el.id, group: group, kind: el.evKind || el.eqId, type: el.type, lf: ft.lf, wf: ft.wf, floorW: floor.w, floorH: floor.h }); return el; }
      /* A. a guided build: _evAdd with its own footprint and floors */
      var y = sz.h / 2 - 90, x = sz.w / 2 - 260;
      var bessFt = _bessFootprint(500, 250);
      [['bess', bessFt, 'BESS 500 kWh'], ['xfmr', null, 'Pad-Mount Transformer'], ['disco', null, 'AC Disconnect'], ['service', null, 'Utility Service (POI)'], ['charger', null, 'DCFC 1']].forEach(function (g) {
        var el = _evAdd(g[0], x, y, g[2], '', null, g[1] || undefined);
        rec(el, 'build', { lf: el.lf, wf: el.wf }, { w: el.minW, h: el.minH });
        x += 120;
      });
      /* B. Omega Prime's gear (omega-prime-handoff.js gear()): true scale on
         a 4 px floor, 5 ft clear between units, the anchor its coordinate */
      var row = [['bess', bessFt, 'Prime BESS'], ['xfmr', { lf: 6, wf: 4 }, 'Prime transformer'], ['disco', { lf: 2, wf: 1.4 }, 'Prime disconnect'], ['service', { lf: 3, wf: 2.5 }, 'Prime service']];
      var fx = -40, gy = sz.h / 2 + 40, cx0 = sz.w / 2;
      row.forEach(function (g) {
        var ft = g[1], c = { x: cx0 + (fx + ft.lf / 2) * ppf, y: gy };
        var el = _evAdd(g[0], c.x, c.y, g[2], '', null, ft);
        var w = Math.max(cfg.minPx, Math.round(ft.lf * ppf)), h = Math.max(cfg.minPx, Math.round(ft.wf * ppf));
        el.w = w; el.h = h; el.aspect = h / w; el.x = c.x - w / 2; el.y = c.y - h / 2;
        el.lf = ft.lf; el.wf = ft.wf; el.minW = cfg.minPx; el.minH = cfg.minPx; el.fromPrime = true;
        var gll = _pxToLatLng(c.x, c.y, _liveMapState(), sz.w, sz.h); el._geoLat = gll.lat; el._geoLng = gll.lng;
        _reRenderEl(el.id);
        rec(el, 'prime', ft, { w: cfg.minPx, h: cfg.minPx });
        fx += ft.lf + 5;
      });
      /* B'. a unit with no released footprint: Prime's 2 ft marker (#354) */
      if (marker) {
        var mc = { x: cx0 + (fx + 1) * ppf, y: gy };
        var me = _evAdd('bess', mc.x, mc.y, 'Prime unit (no released footprint)', '', null, undefined);
        var floor = Math.max(2, Math.min(cfg.minPx, Math.floor(3 * ppf))), m = Math.max(floor, Math.round(2 * ppf));
        delete me.lf; delete me.wf;
        me.w = m; me.h = m; me.aspect = 1; me.x = mc.x - m / 2; me.y = mc.y - m / 2;
        me.minW = floor; me.minH = floor; me.primeFootprint = 'none'; me.primeMarkFt = 2; me.fromPrime = true;
        var mll = _pxToLatLng(mc.x, mc.y, _liveMapState(), sz.w, sz.h); me._geoLat = mll.lat; me._geoLng = mll.lng;
        _reRenderEl(me.id);
        rec(me, 'prime', { lf: 2, wf: 2 }, { w: floor, h: floor });
      }
      /* C. the Insert palette: its drop width (_eqDropW) and addEl, as a click places it */
      [['meter', sz.w / 2 + 200], ['pcs', sz.w / 2 + 300]].forEach(function (g) {
        var dw = _eqDropW(g[0]), cy = sz.h / 2 + 160;
        var el = addEl({ type: 'eq', eqId: g[0], label: g[0], x: g[1] - dw / 2, y: cy - dw / 2, w: dw, rot: 0, spec: '' });
        rec(el, 'insert', { lf: el.lf, wf: el.wf }, cfg.insertFloor);
        out[out.length - 1].dropW = dw;
      });
      /* D. a size set by hand, which is the footprint from then on: a DCFC
         unit typed in feet in its panel (OmegaDCFC.setUnitFt, on 12 x 10 px);
         one saved before that recorded it (evFtL/evFtW only, its pixels as
         the panel drew them); and a transformer scaled x2 in the 3D site view */
      var dy = sz.h / 2 + 260;
      var typed = _evAdd('charger', sz.w / 2 - 300, dy, 'DCFC typed', '');
      OmegaDCFC.setUnitFt(typed, 8, 6);
      rec(typed, 'typed', { lf: 8, wf: 6 }, { w: 12, h: 10 });
      var saved = _evAdd('charger', sz.w / 2 - 180, dy, 'DCFC typed, saved', '');
      var sc0 = { x: saved.x + saved.w / 2, y: saved.y + saved.h / 2 };
      saved.evFtL = 7; saved.evFtW = 5; saved.w = Math.max(12, Math.round(7 * ppf)); saved.h = Math.max(10, Math.round(5 * ppf));
      saved.x = sc0.x - saved.w / 2; saved.y = sc0.y - saved.h / 2;
      _reRenderEl(saved.id);
      rec(saved, 'typed', { lf: 7, wf: 5 }, { w: saved.minW, h: saved.minH });
      var big = _evAdd('xfmr', sz.w / 2 - 40, dy, 'Transformer x2', '');
      OmegaSiteVis.applyModelEdit(big.id, { scale: 2 });
      rec(big, 'scaled', { lf: 12, wf: 8 }, { w: big.minW, h: big.minH });
      return { ppf: ppf, els: out, marker: marker, insertFloor: (window.OmegaInsert && OmegaInsert.floorPx) || null };
    }, { minPx: PRIME_MIN_PX, insertFloor: INSERT_FLOOR });
    var ppf0 = placed.ppf;
    ok(placed.els.length >= 14, 'gear placed: ' + placed.els.length);
    placed.els.filter(function (e) { return e.group === 'insert'; }).forEach(function (e) {
      ok(e.lf > 0 && e.wf > 0, e.kind + ': Insert recorded its footprint (' + e.lf + ' x ' + e.wf + ' ft)');
      ok(Math.abs(e.dropW - Math.max(INSERT_FLOOR.w, Math.round(e.lf * ppf0))) <= 1, e.kind + ': dropped at ' + e.dropW + ' px, its footprint or the 22 px floor');
    });
    placed.els.filter(function (e) { return e.group === 'build'; }).forEach(function (e) {
      ok(e.lf > 0 && e.floorW > 0 && e.floorH > 0, e.kind + ': _evAdd recorded its footprint and floor');
    });
    var byId = {}; placed.els.forEach(function (e) { byId[e.id] = e; });
    var ids = placed.els.map(function (e) { return e.id; });
    var xfmr = placed.els.filter(function (e) { return e.group === 'build' && e.kind === 'xfmr'; })[0];
    /* OmegaGeo arms itself on the first anchored element, within its 30 s
       window from boot; make sure it is in the loop however slow the boot */
    await page.evaluate(function () { if (window.OmegaGeo) OmegaGeo.enableScaling(); });
    await page.waitForTimeout(1200);

    /* E. what carries no footprint of its own, placed AFTER OmegaGeo has
       armed (as everything placed in a session is), and the first map move
       after it is a ZOOM: a BESS assembly (the BESS list's place on canvas,
       400 px, drawn 0.55 deep) is OmegaGeo's, its ground size its pixels over
       the scale they were drawn at; a guided-build charger and a 2 MWh battery
       saved before _evAdd recorded footprints take their kind's; an Insert
       charger's own bollard, pushed past Insert's hook, takes Insert's; a
       Level 2 bollard keeps the 14 px it is placed on. And a node left for an
       element the model no longer has, for the sweep. */
    var freeEls = await page.evaluate(function (cfg) {
      var ppf = S.pxPerFt, sz = _getCanvasSize(), out = [], ey = sz.h / 2 - 230;
      function rec(el, group, ft, floor) { out.push({ id: el.id, group: group, kind: el.evKind || el.eqId || el.type, type: el.type, lf: ft.lf, wf: ft.wf, floorW: floor.w, floorH: floor.h }); return el; }
      var asm = addEl({ type: 'bess-asm', bessId: null, label: 'BESS Assembly', spec: '', x: sz.w / 2 + 160, y: ey - 110, w: 400, rot: 0 });
      out.push({ id: asm.id, group: 'free', kind: 'bess-asm', type: 'bess-asm', w0: 400, ppf0: ppf });
      var oldC = _evAdd('charger', sz.w / 2 - 440, ey, 'DCFC (saved 2026-09)', '');
      delete oldC.lf; delete oldC.wf; delete oldC.minW; delete oldC.minH;
      rec(oldC, 'legacy', { lf: 2.9, wf: 3.1 }, { w: 14, h: 12 });
      var oldB = _evAdd('bess', sz.w / 2 - 340, ey, 'BESS 2 MWh (saved 2026-09)', '');
      delete oldB.lf; delete oldB.wf; delete oldB.minW; delete oldB.minH; oldB.bessKwh = 2000; oldB.bessKw = 1000;
      rec(oldB, 'legacy', { lf: 20, wf: 8 }, { w: 28, h: 20 });
      var dw = _eqDropW('charger');
      var insC = addEl({ type: 'eq', eqId: 'charger', label: 'EV charger', x: sz.w / 2 - 220 - dw / 2, y: ey - dw / 2, w: dw, rot: 0, spec: '' });
      rec(insC, 'insert', { lf: insC.lf, wf: insC.wf }, cfg.insertFloor);
      var auto = S.elements.filter(function (e) { return e._autoFor === insC.id; })[0];
      var bf = OmegaInsert.footprint('bollard');
      if (auto) rec(auto, 'bollard', { lf: bf.lf, wf: bf.wf }, cfg.insertFloor);
      var before = S.elements.length;
      _l2Bollards(oldC, 1);
      var l2 = S.elements.length > before ? S.elements[S.elements.length - 1] : null;
      if (l2) rec(l2, 'bollard', { lf: l2.lf, wf: l2.wf }, { w: 14, h: 14 });
      var orphan = document.createElement('div'); orphan.className = 'cel'; orphan.setAttribute('data-elid', 'gone-from-the-model');
      document.getElementById('els').appendChild(orphan);
      return { els: out, auto: !!auto, l2: !!l2 };
    }, { insertFloor: INSERT_FLOOR });
    ok(freeEls.auto, 'an Insert charger places its own bollard');
    ok(freeEls.l2, 'the Level 2 build places a bollard');
    freeEls.els.forEach(function (e) { placed.els.push(e); byId[e.id] = e; ids.push(e.id); });
    /* one pass of the anchor engine's timer, and no map move: a saved unit
       takes its kind's footprint, and nothing has stamped the assembly yet */
    await page.waitForTimeout(700);
    ok(await page.evaluate(function (id) { var e = S.elements.filter(function (x) { return x.id === id; })[0]; return e._geoWFt == null; }, freeEls.els[0].id), 'the BESS assembly has no ground size yet when the map first moves');

    function want(e, ppf) {
      if (e.group === 'free') {                      /* OmegaGeo: the pixels it was drawn at, over that scale, on its 22 px */
        var fw = Math.max(22, Math.round(e.w0 * ppf / e.ppf0));
        return { w: fw, h: Math.round(fw * 0.55), free: true };
      }
      return { w: Math.max(e.floorW, Math.round(e.lf * ppf)), h: Math.max(e.floorH, Math.round(e.wf * ppf)), trueW: Math.round(e.lf * ppf) >= e.floorW };
    }
    function measure() {
      return page.evaluate(function (ids) {
        var sc = document.getElementById('sc'), sr = sc.getBoundingClientRect(), k = sc.offsetWidth / sr.width;
        var ms = _liveMapState(), sz = _getCanvasSize();
        return { zoom: _gmap.getZoom(), lat: _gmap.getCenter().lat(), ppf: S.pxPerFt, frame: window.__frame, els: ids.map(function (id) {
          var el = S.elements.filter(function (e) { return e.id === id; })[0];
          var n = document.querySelector('#els .cel[data-elid="' + id + '"]');
          var box = n && (el.type === 'eq' ? n.querySelector('.elbody') : n);
          var r = box ? box.getBoundingClientRect() : null, nr = n ? n.getBoundingClientRect() : null;
          var a = _latLngToPx(el._geoLat, el._geoLng, ms, sz.w, sz.h);
          return { id: id, w: el.w, h: el.h, rh: _elRenderSize(el).h, x: el.x, y: el.y,
            domW: r ? r.width * k : null, domH: r ? r.height * k : null,
            left: nr ? (nr.left - sr.left) * k : null, top: nr ? (nr.top - sr.top) * k : null,
            ax: a.x, ay: a.y, nodes: document.querySelectorAll('[data-elid="' + id + '"]').length,
            sel: !!(n && n.classList.contains('sel')), geoW: el._geoWFt, geoH: el._geoHFt };
        }) };
      }, ids);
    }
    function frames(n) { return page.evaluate(function (n) { return new Promise(function (r) { (function go(k) { if (!k) return r(); requestAnimationFrame(function () { go(k - 1); }); })(n); }); }, n); }
    function idle() { return page.evaluate(function () { return new Promise(function (r) { google.maps.event.addListenerOnce(_gmap, 'idle', function () { r(); }); }); }); }

    var trueScale = 0, held = 0, overlaps = 0;
    function check(m, tag, opts) {
      opts = opts || {};
      ok(Math.abs(m.ppf - 1 / (156543.03392 * Math.cos(m.lat * Math.PI / 180) / Math.pow(2, m.zoom) * 3.28084)) < 1e-6, tag + ': the drawing scale is the map’s');
      m.els.forEach(function (d) {
        var e = byId[d.id], w = want(e, m.ppf), name = tag + ' ' + e.group + ' ' + e.kind;
        ok(d.nodes === 1, name + ': one node (' + d.nodes + ')');
        ok(Math.abs(d.x + d.w / 2 - d.ax) <= 1 && Math.abs(d.y + d.rh / 2 - d.ay) <= 1, name + ': centred on its ground anchor (' + (d.x + d.w / 2).toFixed(1) + ',' + (d.y + d.rh / 2).toFixed(1) + ' vs ' + d.ax.toFixed(1) + ',' + d.ay.toFixed(1) + ')');
        ok(Math.abs(d.left - d.x) <= 1 && Math.abs(d.top - d.y) <= 1, name + ': drawn where the model says');
        if (w.free) {
          if (opts.early) return;                    /* OmegaGeo sizes on the map's idle, not on the zoom */
          ok(Math.abs(d.w - w.w) <= 1 && Math.abs(d.domW - w.w) <= 1 && Math.abs(d.domH - w.h) <= 1,
            name + ': ' + d.domW.toFixed(1) + ' x ' + d.domH.toFixed(1) + ' px on screen (model ' + d.w + '), the ' + e.w0 + ' px it was drawn at, at ' + e.ppf0.toFixed(3) + ' px/ft, is ' + w.w + ' x ' + w.h + ' here');
          return;
        }
        ok(Math.abs(d.w - w.w) <= 1 && Math.abs(d.domW - w.w) <= 1,
          name + ': ' + d.domW.toFixed(1) + ' px wide on screen (model ' + d.w + '), its ' + e.lf + ' ft at ' + m.ppf.toFixed(3) + ' px/ft is ' + Math.round(e.lf * m.ppf) + (w.trueW ? '' : ', held at the ' + e.floorW + ' px floor') + ' -> ' + w.w);
        if (e.type !== 'eq')                        /* an Insert icon draws its own aspect; its h is where the anchor centres */
          ok(Math.abs(d.h - w.h) <= 1 && Math.abs(d.domH - w.h) <= 1, name + ': ' + d.domH.toFixed(1) + ' px deep (model ' + d.h + '), want ' + w.h);
        else ok(Math.abs(d.h - w.h) <= 1, name + ': model depth ' + d.h + ', want ' + w.h);
        if (!opts.count) return;
        if (w.trueW) trueScale++; else held++;
      });
      /* Prime's row: 5 ft clear between units, and their 4 px floor leaves it clear down to zoom 18 */
      if (m.zoom >= 18) {
        var row = m.els.filter(function (d) { return byId[d.id].group === 'prime'; }).sort(function (a, b) { return a.x - b.x; });
        for (var i = 1; i < row.length; i++) {
          var gap = row[i].x - (row[i - 1].x + row[i - 1].w);
          if (opts.count && gap < 0) overlaps++;
          ok(gap >= 0, tag + ': Prime’s ' + byId[row[i - 1].id].kind + ' and ' + byId[row[i].id].kind + ' do not overlap (' + gap.toFixed(1) + ' px clear, 5 ft is ' + (5 * m.ppf).toFixed(1) + ')');
        }
      }
    }

    var m0 = await measure();
    check(m0, 'placed at zoom ' + m0.zoom, { count: true });

    for (var zi = 0; zi < ZOOMS.length; zi++) {
      var z = ZOOMS[zi], settled = idle();
      await page.evaluate(function (z) { _gmap.setZoom(z); }, z);
      /* the size moves with the position: two frames on, before the map is idle */
      await frames(2);
      var early = await measure();
      ok(early.zoom === z, 'zoomed to ' + z);
      check(early, 'zoom ' + z + ' (2 frames in)', { early: true });
      await settled; await frames(2);
      var m = await measure();
      check(m, 'zoom ' + z, { count: true });
      if (zi === 0) ok(await page.evaluate(function () { return !document.querySelector('[data-elid="gone-from-the-model"]'); }), 'zoom ' + z + ': a node left for an element the model no longer has is swept');
      /* nothing else changes it afterwards: the timers, OmegaGeo, the idle stamp */
      await page.waitForTimeout(900);
      var late = await measure();
      check(late, 'zoom ' + z + ' (after the timers)');
      late.els.forEach(function (d, i) { ok(d.w === m.els[i].w && d.h === m.els[i].h, 'zoom ' + z + ' ' + byId[d.id].kind + ': stable, ' + m.els[i].w + ' -> ' + d.w); });
    }
    ok(trueScale >= 40, 'true to scale above the floor in ' + trueScale + ' element-zooms');
    ok(held >= 20, 'held at the floor it was placed with in ' + held + ' element-zooms');
    ok(overlaps === 0, 'Prime’s gear never overlapped');

    /* a width typed in the properties panel holds through a zoom (it is the
       footprint now), and the selected unit keeps its outline when redrawn */
    await page.evaluate(function (z) { _gmap.setZoom(z); }, 21); await page.waitForTimeout(1200);
    var typed = await page.evaluate(function (id) {
      selEl(id); var el = S.elements.filter(function (e) { return e.id === id; })[0];
      var w = el.w * 2; uP('w', w); return { w: w, h: el.h, ppf: S.pxPerFt };
    }, xfmr.id);
    /* its footprint is what was typed (uP draws the depth off the unit's aspect) */
    xfmr.lf = typed.w / typed.ppf; xfmr.wf = typed.h / typed.ppf;
    for (var tz of [22, 20, 21]) {
      var s2 = idle();
      await page.evaluate(function (z) { _gmap.setZoom(z); }, tz);
      await s2; await frames(2); await page.waitForTimeout(600);
      var mz = await measure();
      check(mz, 'typed width, zoom ' + tz);
      var tw = mz.els.filter(function (d) { return d.id === xfmr.id; })[0];
      ok(tw.sel, 'zoom ' + tz + ': the selected transformer kept its outline');
    }
    var back = (await measure()).els.filter(function (d) { return d.id === xfmr.id; })[0];
    ok(Math.abs(back.w - typed.w) <= 1, 'back at zoom 21 the transformer is the ' + typed.w + ' px typed (' + back.w + ')');

    /* the ground size the takeoff and the GeoJSON export read is the footprint */
    await page.waitForTimeout(1200);
    var geo = await measure();
    geo.els.forEach(function (d) {
      var e = byId[d.id];
      if (e.group === 'free') {
        ok(Math.abs(d.geoW - e.w0 / e.ppf0) < 0.01, 'the BESS assembly\u2019s ground size is the ' + e.w0 + ' px it was drawn at over ' + e.ppf0.toFixed(3) + ' px/ft (' + (e.w0 / e.ppf0).toFixed(1) + ' ft), not over the zoom after (' + (d.geoW || 0).toFixed(1) + ')');
        return;
      }
      ok(Math.abs(d.geoW - e.lf) < 1e-6 && Math.abs(d.geoH - e.wf) < 1e-6, e.group + ' ' + e.kind + ': ground size ' + (d.geoW || 0).toFixed(2) + ' x ' + (d.geoH || 0).toFixed(2) + ' ft is its footprint ' + e.lf.toFixed(2) + ' x ' + e.wf.toFixed(2));
    });

    /* the rescale ran, from the map, never twice in one frame */
    var runs = await page.evaluate(function () { return window.__scaleRuns; });
    var perFrame = {}, twice = [];
    runs.forEach(function (r) { perFrame[r.frame] = (perFrame[r.frame] || 0) + 1; if (perFrame[r.frame] === 2) twice.push(r.frame); });
    ok(runs.length >= ZOOMS.length, 'the rescale ran ' + runs.length + ' times');
    ok(twice.length === 0, 'never twice in one frame' + (twice.length ? ': frames ' + twice.slice(0, 5).join(', ') : ''));
    assert.deepStrictEqual(placed.insertFloor, INSERT_FLOOR, 'Insert says what it drops at (OmegaInsert.floorPx), 22 x 10 px'); count++;
    ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
    console.log('render-element-zoom: ' + count + ' checks passed. ' + placed.els.length + ' units (guided build, Omega Prime, Insert, set by hand, saved before footprints, bollards, a BESS assembly with none) through zooms '
      + PLACED_AT + ' → ' + ZOOMS.join(' → ') + ': true to scale in ' + trueScale + ' element-zooms, at the placement floor in ' + held
      + '; the rescale ran ' + runs.length + ' times, never twice in a frame. Prime’s 2 ft marker (primeFootprint none, #354): '
      + (placed.marker ? 'held at every zoom.' : 'this editor reads none, not run.'));
  } finally {
    await browser.close(); server.close();
  }
})().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
