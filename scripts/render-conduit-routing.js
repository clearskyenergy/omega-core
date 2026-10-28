/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Guided-build conduit runs survive the site being rearranged, and a moved
 * point STAYS moved — held against the full editor in Chromium, offline.
 *
 * The SAFT site (13575 Waterworks St, 2026-10-28) showed what happens when
 * neither holds: the DER build's collector runs were laid against the gear
 * as FIRST placed, the gear was then dragged to match the real site, and
 * only the bonded ends followed — every interior bend stayed at the old
 * spot, so the runs swept the whole drawing as diagonals. Grabbing a yellow
 * end to fix one did not stick either: the weld pass snapped an explicit
 * elId endpoint back to its equipment's dead centre, discarding the
 * displacement the drag had recorded.
 *
 * This check boots editor.html on the offline Firebase fixture, runs the
 * real DER build (placeDerBuildAt), and fails when:
 *   - moving the DER POI or an XFMR leaves a derCollector run stretched
 *     instead of re-routed at right angles between the gear as placed now
 *     (updateAttached → _orthoRoute);
 *   - Straighten Runs (omegaTidyRuns) cannot untangle a run whose bend was
 *     poisoned, or leaves it non-orthogonal, or keeps the hand-route mark;
 *   - the legacy weld in _geoReprojectAll ignores a recorded _fromOff for
 *     an endpoint that carries its own elId (what the guided builds write),
 *     before or after the equipment moves;
 *   - the unified anchor engine (the live owner of reprojection once a map
 *     exists) moves a freshly restamped run on its next pass;
 *   - a simulated drag of a bonded endpoint (_cvMove/_cvEnd) loses the
 *     bond, fails to record the exit offset in feet, is snapped home by the
 *     next reprojection, or does not mark the run user-routed.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ROOT = path.join(__dirname, '..');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var X = require('../api/_lib/package-access');
var P = require('../api/_lib/subscription-pricing');
var BOOK = require('../api/_lib/pricebook').proposed();

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

/* The same legacy-tenant fixture render-legacy-gates.js boots on. */
function fixture(plan) {
  var tier = plan.tier;
  window.__fixtureBilling = plan;
  var user = { uid: 'u', email: 'designer@legacy.example', emailVerified: true, displayName: 'D', getIdToken: function () { return Promise.resolve('t'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? window.__fixtureBilling :
      /^omega_orgs\/[^/]+$/.test(p) ? { name: 'L', status: 'active', domains: [location.hostname] } :
      /members\//.test(p) ? { role: 'owner', status: 'active' } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () { return Promise.resolve(snapshot(p)); },
      onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; },
      set: function () { return Promise.resolve(); }, update: function () { return Promise.resolve(); }, add: function () { return Promise.resolve({ id: 'f' }); } };
  }
  var db = { collection: function (n) { return ref(n); }, settings: function () {}, enablePersistence: function () { return Promise.resolve(); } };
  window.__fixtureUser = user; window.__fixtureListeners = [];
  var auth = { currentUser: null, onAuthStateChanged: function (fn) { window.__fixtureListeners.push(fn); return function () {}; }, getRedirectResult: function () { return Promise.resolve({}); }, setPersistence: function () { return Promise.resolve(); }, signOut: function () { return Promise.resolve(); } };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp: function () { return 't'; } };
  function authentication() { return auth; }
  authentication.Auth = { Persistence: { LOCAL: 'local' } };
  authentication.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var app = { firestore: firestore, auth: authentication };
  window.firebase = { apps: [app], initializeApp: function () { return app; }, app: function () { return app; }, firestore: firestore, auth: authentication };
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'legacy.example', name: 'L', tier: tier, status: 'active' } };
  window.alert = function () {};
}

var fails = 0, checks = 0;
function ok(cond, label) { checks++; if (!cond) { fails++; console.log('  FAIL ' + label); } else console.log('  ok   ' + label); }

(async function () {
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch();
  var context = await browser.newContext({ viewport: { width: 1512, height: 950 } });
  await context.addInitScript(fixture, { tier: 'deluxe', addons: [] });
  await context.route('**/*', function (route) {
    var url = new URL(route.request().url());
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/package-access') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(X.legacy({ tier: 'deluxe', addons: [] }, Date.now())) });
    if (url.pathname === '/api/offerings') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modules: P.catalog(BOOK) }) });
    if (url.pathname.indexOf('/api/') === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    return route.continue();
  });
  var page = await context.newPage(), errors = [];
  page.on('pageerror', function (e) { errors.push((e.stack || e.message || '').split('\n').slice(0, 2).join(' | ')); });
  await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function () { firebase.auth().currentUser = window.__fixtureUser; window.__fixtureListeners.forEach(function (fn) { fn(window.__fixtureUser); }); });
  await page.waitForFunction(function () { return window.OmegaCaps && document.body.getAttribute('data-tier'); });
  await page.waitForTimeout(3500);

  console.log('conduit routing — guided-build runs follow the gear, and a moved point sticks');

  /* the real DER build: 2 PV blocks, inverters, XFMRs, DER POI, no map */
  var built = await page.evaluate(function () {
    S.pxPerFt = 2;
    window._derBuildCfg = { src: 'pv', spec: { label: '250 kW PV', blockKw: 250, wPerSqft: 10 }, mw: 0.5, blocks: 2, cols: 2, xfmr: true };
    placeDerBuildAt({ x: 220, y: 200 });
    return (S.conduits || []).filter(function (c) { return c.derCollector; }).length;
  });
  ok(built >= 4, 'guided build laid collector + PV runs (' + built + ')');

  function geom() {
    return page.evaluate(function () {
      function endsOn(c) {
        var ids = _condEndIds(c); if (!ids.a || !ids.b) return null;
        var ca = _elCenter(ids.a), cb = _elCenter(ids.b), lastI = c.pts.length - 1;
        return { a: Math.hypot(c.pts[0].x - ca.x, c.pts[0].y - ca.y), b: Math.hypot(c.pts[lastI].x - cb.x, c.pts[lastI].y - cb.y) };
      }
      return (S.conduits || []).filter(function (c) { return c.derCollector; }).map(function (c) {
        var orth = true;
        for (var i = 1; i < c.pts.length; i++) {
          if (Math.abs(c.pts[i].x - c.pts[i - 1].x) > 1 && Math.abs(c.pts[i].y - c.pts[i - 1].y) > 1) orth = false;
        }
        return { label: c.runLabel, orth: orth, ends: endsOn(c) };
      });
    });
  }

  /* 1. rearrange the site: runs must re-route, not stretch */
  await page.evaluate(function () {
    var poi = S.elements.find(function (e) { return e.id === S._derPoiId; });
    poi.x += 640; poi.y += 260;
    var dom = document.querySelector('[data-elid="' + poi.id + '"]');
    if (dom) { dom.style.left = poi.x + 'px'; dom.style.top = poi.y + 'px'; }
    updateAttached(poi.id);
    var x1 = S.elements.find(function (e) { return /XFMR 1/.test(e.label || ''); });
    if (x1) {
      x1.x -= 120; x1.y += 180;
      var d2 = document.querySelector('[data-elid="' + x1.id + '"]');
      if (d2) { d2.style.left = x1.x + 'px'; d2.style.top = x1.y + 'px'; }
      updateAttached(x1.id);
    }
  });
  var g1 = await geom();
  var collectors = g1.filter(function (r) { return r.label === 'DER collector'; });
  ok(collectors.length === 2, 'two collector runs (' + collectors.length + ')');
  ok(collectors.every(function (r) { return r.orth; }), 'collector runs re-route at right angles when their equipment moves');
  ok(g1.every(function (r) { return !r.ends || (r.ends.a < 400 && r.ends.b < 400); }), 'run ends stay on their equipment');

  /* 2. a poisoned bend (the SAFT state), then Straighten Runs */
  var tidied = await page.evaluate(function () {
    var c = (S.conduits || []).filter(function (x) { return x.runLabel === 'DER collector'; })[0];
    c.pts.splice(1, 0, { x: 1430, y: 40 });      /* a bend in the woods */
    c._userRouted = true;                        /* worst case: marked hand-routed */
    renderConduit(c);
    var before = c.pts.length, n = omegaTidyRuns(), orth = true;
    for (var i = 1; i < c.pts.length; i++) {
      if (Math.abs(c.pts[i].x - c.pts[i - 1].x) > 1 && Math.abs(c.pts[i].y - c.pts[i - 1].y) > 1) orth = false;
    }
    return { n: n, before: before, after: c.pts.length, orth: orth, userRouted: !!c._userRouted };
  });
  ok(tidied.n >= 4, 'Straighten Runs re-routed the bonded runs (' + tidied.n + ')');
  ok(tidied.orth && tidied.after <= 3, 'poisoned run is a clean elbow again (' + tidied.before + ' pts -> ' + tidied.after + ')');
  ok(!tidied.userRouted, 'an explicit straighten clears the hand-route mark');

  /* 3. the legacy weld honors a recorded end offset; the unified anchor
        engine holds restamped geometry. A stub map stands the engine up,
        synced onto the lexical binding the way publish() does. */
  await page.evaluate(function () {
    window._gmap = { getCenter: function () { return { lat: function () { return 30.27; }, lng: function () { return -81.89; } }; }, getZoom: function () { return 19; }, get: function () { return undefined; } };
    try { (0, eval)('_gmap = window._gmap'); } catch (e) {}
  });
  await page.waitForTimeout(1200);
  var weld = await page.evaluate(function () {
    var legacy = window.__omegaOrigReproject || window._geoReprojectAll;
    legacy();                                    /* stamps _geoPts for every run */
    var c = (S.conduits || []).filter(function (x) { return x.runLabel === 'DER collector'; })[0];
    var ids = _condEndIds(c);
    c._fromOff = { fx: 10, fy: 0 };              /* a deliberate 10 ft exit */
    legacy();                                    /* the legacy weld pass */
    var ca = _elCenter(ids.a);
    var dx = (c.pts[0].x - ca.x) / S.pxPerFt, dy = (c.pts[0].y - ca.y) / S.pxPerFt;
    var el = S.elements.find(function (e) { return e.id === ids.a; });
    el.x += 90; el.y += 44;
    try { if (typeof _geoStampElement === 'function') _geoStampElement(el); } catch (e) {}
    legacy();
    var ca2 = _elCenter(ids.a);
    var dx2 = (c.pts[0].x - ca2.x) / S.pxPerFt, dy2 = (c.pts[0].y - ca2.y) / S.pxPerFt;
    function rnd(pts) { return JSON.stringify(pts.map(function (p) { return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; })); }
    _geoRestampOne(c);
    var snap = rnd(c.pts);
    if (window.OmegaAnchor && OmegaAnchor.run) OmegaAnchor.run();
    return { dx: dx, dy: dy, dx2: dx2, dy2: dy2, held: rnd(c.pts) === snap, engineOwns: !!window.__omegaOrigReproject };
  });
  ok(weld.engineOwns, 'the unified anchor engine owns reprojection once a map exists');
  ok(Math.abs(weld.dx - 10) < 0.5 && Math.abs(weld.dy) < 0.5, 'the legacy weld keeps a recorded 10 ft exit (' + weld.dx.toFixed(1) + ',' + weld.dy.toFixed(1) + ')');
  ok(Math.abs(weld.dx2 - 10) < 0.5 && Math.abs(weld.dy2) < 0.5, 'and keeps it after the equipment moves (' + weld.dx2.toFixed(1) + ',' + weld.dy2.toFixed(1) + ')');
  ok(weld.held, 'the anchor engine holds restamped geometry in place');

  /* 4. a drag of a bonded endpoint sticks */
  var drag = await page.evaluate(function () {
    var c = (S.conduits || []).filter(function (x) { return x.runLabel === 'DER collector'; })[0];
    var ids = _condEndIds(c);
    delete c._fromOff;
    var ca = _elCenter(ids.a);
    window._cvDrag = { cid: c.id, i: 0, ox: 0, oy: 0, moved: false, detach: false };
    _cvMove(ca.x + 16, ca.y + 8);
    _cvEnd();
    var hasBond = !!c.pts[0].elId, off = c._fromOff, ppf = S.pxPerFt;
    _geoReprojectAll();                          /* must NOT snap it home */
    var px = c.pts[0].x - _elCenter(ids.a).x, py = c.pts[0].y - _elCenter(ids.a).y;
    return { hasBond: hasBond, off: off, px: px, py: py, ppf: ppf, userRouted: !!c._userRouted };
  });
  ok(drag.hasBond, 'a dragged yellow end keeps its bond');
  ok(drag.off && Math.abs(drag.off.fx * drag.ppf - 16) < 1 && Math.abs(drag.off.fy * drag.ppf - 8) < 1, 'the drag recorded the exit as an offset in feet');
  ok(Math.abs(drag.px - 16) < 1 && Math.abs(drag.py - 8) < 1, 'reprojection keeps the dragged position (' + drag.px.toFixed(1) + ',' + drag.py.toFixed(1) + ' px)');
  ok(drag.userRouted, 'a hand-moved run is marked user-routed');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); server.close();
  if (fails) { console.log(fails + ' conduit routing check(s) FAILED'); process.exit(1); }
  console.log('conduit routing: ' + checks + ' checks passed');
})().catch(function (e) { console.error(e); process.exit(1); });
