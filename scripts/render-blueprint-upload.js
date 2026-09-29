/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The Blueprint / PDF carries the uploaded site plan exactly as the screen
 * shows it, and a reload brings the plan back.
 *
 * Upload Image puts a site plan / survey under the design as #backdrop,
 * object-fit:cover: scaled to cover the canvas and cropped, never stretched,
 * and the equipment is placed over that crop. html2canvas 1.4.1, which every
 * export captures #sc through, has no object-fit and drew the plan stretched
 * to the canvas box, so the sheet carried the edges the screen had cropped
 * away and everything drawn on it sat off its mark; a project with
 * coordinates restored its live map first on reload, so the plan was gone
 * before any export could carry it; opening an export over a live map wrote
 * a Static Maps image over the plan; and the plot plan's map layer put the
 * export-only satellite grab above the plan (Concord, 2 Vaughan Ave,
 * 2026-09-29: "if we upload a picture and go to download the blueprint it
 * needs to export with that image").
 *
 * Boots the real editor on a legacy billing record with offline adapters,
 * uploads a portrait test plan whose top and bottom bands the landscape
 * canvas crops away, pans, zooms and tilts it as a user would, and fails
 * when:
 *   - _objectFitBox does not place cover / contain as the browser does;
 *   - the Blueprint / PDF sheet's site-map image shows a colour the screen
 *     does not at the same point, or shows a band the screen cropped away;
 *   - the capture leaves the page changed (the stand-in canvas, the hidden
 *     image);
 *   - with a live map under the plan (the satellite raster the map-export
 *     patch installs for every capture), opening the export writes that
 *     raster over the plan (omegaCaptureMapForExport), the sheet no longer
 *     matches the screen, or the plot plan's map layer (_ppMapLayer) hands
 *     the sheet the satellite grab instead of the plan, or places the plan
 *     stretched;
 *   - a save records an upload the live map has replaced on screen, or
 *     forgets one the Hide toggle is hiding (_uploadOnScreen);
 *   - reopening a project saved with coordinates AND an uploaded plan does
 *     not bring the plan back as the backdrop with its scale and placement.
 * html2canvas is served from scripts/_lib (the CDN's 1.4.1, unmodified) in
 * place of the page's own CDN tag, so the check runs offline; the tag is
 * still what asks for it, and the check fails if the page stops asking.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var X = require('../api/_lib/package-access'), P = require('../api/_lib/subscription-pricing'), BOOK = require('../api/_lib/pricebook').proposed();
var ROOT = path.join(__dirname, '..');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var H2C = fs.readFileSync(path.join(__dirname, '_lib', 'html2canvas-1.4.1.min.js'));
var PROJECT = 'upload-plan';
/* --shots DIR keeps every screen and sheet the check compared, with the classes it read. */
var SHOTS = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? process.argv[i + 1] : null; })();
if (SHOTS) { try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {} }
var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
/* A legacy tenant (billing/current has a tier and no `packaged`), and one
   project: saved with coordinates AND an uploaded plan on screen, the plan
   itself cached under the key _loadProject reads. */
function fixture(o) {
  window.__fixtureBilling = o.billing;
  if (o.plan) { try { localStorage.setItem('cs_frozen_map_' + o.project, o.plan); } catch (e) {} }
  var user = { uid: 'legacy-user', email: 'designer@legacy.example', emailVerified: true, displayName: 'Legacy Designer', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? window.__fixtureBilling :
      /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Legacy preview', status: 'active', domains: [location.hostname] } :
      /members\//.test(p) ? { role: 'owner', status: 'active' } :
      (p === 'projects/' + o.project) ? { name: 'Uploaded plan', address: '2 Vaughan Ave, Worcester, MA 01603', orgId: 'legacy.example', elements: [], conduits: [], shapes: [],
        mapState: { address: '2 Vaughan Ave, Worcester, MA 01603', lat: 42.2626, lng: -71.8323, zoom: 19, hasFrozen: true, isUpload: true, pxPerFt: 2.5, unitLabel: 'ft', bgScale: 1.1, bgTx: 12, bgTy: -8, bgRot: 0 } } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () { return Promise.resolve(snapshot(p)); },
      onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; },
      set: function (d) { window.__lastWrite = d; return Promise.resolve(); }, update: function (d) { window.__lastWrite = d; return Promise.resolve(); }, add: function () { return Promise.resolve({ id: 'fixture' }); } };
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
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'legacy.example', name: 'Legacy preview', tier: o.billing.tier, status: 'active' } };
  window.alert = function () {};
}
function answer(route, status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
/* Offline: the legacy answer, the price list, the billing summary; every
   other producer refuses. Off-origin: html2canvas from scripts/_lib, a
   Static Maps tile from the page's own gradient (the map-export patch's
   mosaic, so the satellite layer really is installed under the plan), and
   the Maps JS as a script that only fires the loader's callback. */
function serve(context, base, billing, ext) {
  return context.route('**/*', function (route) {
    var url = new URL(route.request().url()), req = route.request();
    if (url.origin !== base) {
      if (/\/html2canvas\/1\.4\.1\/html2canvas\.min\.js$/.test(url.pathname)) { ext.h2cAsked = true; return route.fulfill({ status: 200, contentType: 'text/javascript', body: H2C }); }
      if (url.hostname === 'maps.googleapis.com' && url.pathname === '/maps/api/staticmap' && ext.tile) { ext.tiles++; return route.fulfill({ status: 200, contentType: 'image/png', body: ext.tile }); }
      if (url.hostname === 'maps.googleapis.com' && url.pathname === '/maps/api/js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'if (window._gmapCB) window._gmapCB();' });
      return route.fulfill({ status: 200, body: '' });
    }
    if (url.pathname === '/api/package-access') return answer(route, 200, X.legacy(billing, Date.now()));
    if (url.pathname === '/api/offerings') return answer(route, 200, { modules: P.catalog(BOOK) });
    if (url.pathname === '/api/plan-change' && req.method() === 'GET') return answer(route, 200, { orgId: 'legacy.example', packaged: false, canManage: true, addOns: null, pending: [] });
    if (url.pathname.indexOf('/api/') === 0) return answer(route, 503, { error: 'Offline producer' });
    return route.continue();
  });
}
var count = 0;
function ok(value, label) { assert(value, label); count++; }
/* The test plan: portrait, a magenta band on top and a cyan band at the
   bottom that a landscape canvas crops away under object-fit:cover, four
   quadrants between them. Made in the page, so the check needs no encoder. */
function makePlan() {
  var c = document.createElement('canvas'); c.width = 600; c.height = 1000; var g = c.getContext('2d');
  g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 600, 150);
  g.fillStyle = '#00ffff'; g.fillRect(0, 850, 600, 150);
  g.fillStyle = '#ff0000'; g.fillRect(0, 150, 300, 350);
  g.fillStyle = '#00ff00'; g.fillRect(300, 150, 300, 350);
  g.fillStyle = '#0000ff'; g.fillRect(0, 500, 300, 350);
  g.fillStyle = '#ffff00'; g.fillRect(300, 500, 300, 350);
  return c.toDataURL('image/png');
}
/* A satellite "tile": a grey gradient, big enough and lit enough for the
   mosaic's own checks (over 2 KB, not blank). */
function makeTile() {
  var c = document.createElement('canvas'); c.width = 1280; c.height = 1280; var g = c.getContext('2d');
  var gr = g.createLinearGradient(0, 0, 1280, 1280); gr.addColorStop(0, '#5a5f66'); gr.addColorStop(1, '#9aa0a8');
  g.fillStyle = gr; g.fillRect(0, 0, 1280, 1280);
  for (var i = 0; i < 1280; i += 64) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(i, 0, 2, 1280); g.fillRect(0, i, 1280, 2); }
  return c.toDataURL('image/png').split(',')[1];
}
/* Which of the plan's colours a pixel is, or 'other' (an overlay, the sheet,
   a blend). Sampled 5 ways around the point so a point on a colour boundary
   reads 'edge' rather than flipping between the two renders. */
var CLASSIFY = function (arg) {
  var imgSrc = arg.src, points = arg.points;
  var COLS = { magenta: [255, 0, 255], cyan: [0, 255, 255], red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0] };
  return new Promise(function (resolve) {
    var im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      var g = c.getContext('2d'); g.drawImage(im, 0, 0);
      var k = c.width / 1140;
      function one(x, y) {
        var d = g.getImageData(Math.max(0, Math.min(c.width - 1, Math.round(x))), Math.max(0, Math.min(c.height - 1, Math.round(y))), 1, 1).data, best = 'other', dist = 1e9;
        Object.keys(COLS).forEach(function (n) { var v = COLS[n], dd = Math.abs(d[0] - v[0]) + Math.abs(d[1] - v[1]) + Math.abs(d[2] - v[2]); if (dd < dist) { dist = dd; best = n; } });
        return dist < 90 ? best : 'other';
      }
      resolve({ w: c.width, h: c.height, classes: points.map(function (p) {
        var x = p[0] * c.width, y = p[1] * c.height, r = 6 * k;
        var s = [one(x, y), one(x - r, y), one(x + r, y), one(x, y - r), one(x, y + r)];
        return s.every(function (v) { return v === s[0]; }) ? s[0] : 'edge';
      }) });
    };
    im.onerror = function () { resolve(null); };
    im.src = imgSrc;
  });
};
var POINTS = [];
[0.2, 0.35, 0.5, 0.65, 0.8].forEach(function (x) { [0.06, 0.2, 0.4, 0.6, 0.8, 0.94].forEach(function (y) { POINTS.push([x, y]); }); });
async function boot(browser, base, opts) {
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), billing = { tier: 'pro', addons: [] };
  await context.addInitScript(fixture, { billing: billing, project: PROJECT, plan: opts.plan || null });
  var ext = { h2cAsked: false, tiles: 0, tile: opts.tile || null };
  await serve(context, base, billing, ext);
  var page = await context.newPage(), errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.goto(base + '/editor.html' + (opts.query || ''), { waitUntil: 'domcontentloaded' });
  await page.evaluate(function () { firebase.auth().currentUser = window.__fixtureUser; window.__fixtureListeners.forEach(function (fn) { fn(window.__fixtureUser); }); });
  await page.waitForFunction(function () { return window.OmegaCaps && !!document.body.getAttribute('data-tier'); });
  await page.waitForTimeout(3000);
  return { page: page, context: context, errors: errors, ext: ext };
}
/* The screen and the sheet at the same points. Every point the screen shows
   as a plan colour must read the same colour on the sheet; a band the screen
   crops away must not appear on the sheet at all. */
async function compare(page, sheetSrc, label) {
  var box = await page.evaluate(function () { var r = document.getElementById('sc').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  var shot = await page.screenshot({ clip: box });
  var screen = await page.evaluate(CLASSIFY, { src: 'data:image/png;base64,' + shot.toString('base64'), points: POINTS });
  var sheet = await page.evaluate(CLASSIFY, { src: sheetSrc, points: POINTS });
  if (SHOTS) {
    var slug = label.replace(/[^a-z0-9]+/gi, '-');
    fs.writeFileSync(path.join(SHOTS, slug + '-screen.png'), shot);
    fs.writeFileSync(path.join(SHOTS, slug + '-sheet.png'), Buffer.from(sheetSrc.split(',')[1], 'base64'));
    console.log(label + ': screen ' + JSON.stringify(screen.classes) + '\n' + label + ': sheet  ' + JSON.stringify(sheet && sheet.classes));
  }
  ok(sheet && sheet.w > 2000, label + ': the sheet carries a print-resolution capture, not ' + (sheet && sheet.w));
  var agreed = 0, wrong = [], bands = [];
  POINTS.forEach(function (p, i) {
    var s = screen.classes[i], e = sheet.classes[i];
    if (e === 'magenta' || e === 'cyan') bands.push(p);
    if (s === 'other' || s === 'edge' || e === 'edge') return;
    if (s === e) agreed++; else wrong.push(p.join(',') + ' screen ' + s + ' sheet ' + e);
  });
  ok(!bands.length, label + ': a band the screen crops away is on the sheet at ' + bands.map(function (p) { return p.join(','); }).join(' '));
  ok(!wrong.length, label + ': the sheet differs from the screen at ' + wrong.join('; '));
  ok(agreed >= 12, label + ': only ' + agreed + ' points could be compared');
  return agreed;
}
async function main() {
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://localhost:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  try {
    var A = await boot(browser, base, {});
    var page = A.page;
    ok(A.ext.h2cAsked, 'the page asks for html2canvas 1.4.1 from the CDN (this check stands its copy in for that tag)');
    ok(await page.evaluate(function () { return typeof html2canvas === 'function'; }), 'html2canvas is on the page');

    /* ── the pure rule ────────────────────────────────────────────────── */
    var fit = await page.evaluate(function () {
      return { cover: _objectFitBox('cover', 1140, 698, 600, 1000), contain: _objectFitBox('contain', 1140, 698, 600, 1000), exact: _objectFitBox('cover', 1140, 698, 570, 349) };
    });
    ok(Math.abs(fit.cover.w - 1140) < 1e-6 && Math.abs(fit.cover.h - 1900) < 1e-6 && Math.abs(fit.cover.x) < 1e-6 && Math.abs(fit.cover.y + 601) < 1e-6, 'cover scales to the larger ratio, centred, cropped: ' + JSON.stringify(fit.cover));
    ok(Math.abs(fit.contain.h - 698) < 1e-6 && Math.abs(fit.contain.w - 418.8) < 1e-6 && Math.abs(fit.contain.y) < 1e-6 && Math.abs(fit.contain.x - 360.6) < 1e-6, 'contain scales to the smaller ratio, centred, letterboxed: ' + JSON.stringify(fit.contain));
    ok(Math.abs(fit.exact.w - 1140) < 1e-6 && Math.abs(fit.exact.h - 698) < 1e-6, 'an image of the box\'s own aspect fills it');

    /* ── upload the plan, then pan, zoom and tilt it as a user would ──── */
    var plan = await page.evaluate(function (src) {
      var url = (new Function('return (' + src + ')()'))();
      var bin = atob(url.split(',')[1]), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      loadBg({ target: { files: [new File([arr], 'plan.png', { type: 'image/png' })] } });
      return url;
    }, makePlan.toString());
    await page.waitForFunction(function () { var b = document.getElementById('backdrop'); return b && b.complete && b.naturalWidth === 600 && getComputedStyle(b).display === 'block'; });
    await page.evaluate(function () { BG.scale = 1.2; BG.tx = 40; BG.ty = -25; BG.rot = 3; applyBg(); });
    var state = await page.evaluate(function () { var b = document.getElementById('backdrop'), cs = getComputedStyle(b); return { fit: cs.objectFit, z: cs.zIndex, isUpload: !!window._isUploadedPhoto, transform: b.style.transform }; });
    ok(state.fit === 'cover' && state.isUpload && /scale\(1\.2\)/.test(state.transform), 'the plan is the cover backdrop, panned, zoomed and tilted: ' + JSON.stringify(state));

    /* ── the Blueprint / PDF, with the PDF step handing back the sheet ── */
    async function blueprint() {
      return page.evaluate(async function () {
        window._bpDeliverPDF = async function (html) { window.__bpHtml = html; return true; };
        openBlueprintExport();
        var ai = document.getElementById('bp-ai-enhance'); if (ai) ai.checked = false;
        await generateBlueprint();
        var m = /<img src="(data:image\/png;base64,[^"]+)"[^>]*alt="Site Map"/.exec(window.__bpHtml || '');
        var left = document.querySelectorAll('#sc canvas[data-capture-fit]').length;
        var bd = document.getElementById('backdrop');
        return { sheet: m ? m[1] : null, status: document.getElementById('bp-status').textContent, standInsLeft: left, backdropShown: bd && getComputedStyle(bd).display === 'block' };
      });
    }
    var bp = await blueprint();
    ok(bp.sheet, 'the Blueprint / PDF captured the site map: ' + bp.status);
    ok(bp.standInsLeft === 0 && bp.backdropShown, 'the capture put the page back: ' + bp.standInsLeft + ' stand-in(s) left, backdrop shown ' + bp.backdropShown);
    await compare(page, bp.sheet, 'no live map');

    /* ── the same over a live map: the map-export patch installs its
          satellite raster under everything for the capture ───────────── */
    A.ext.tile = Buffer.from(await page.evaluate(function (src) { return (new Function('return (' + src + ')()'))(); }, makeTile.toString()), 'base64');
    await page.evaluate(function () {
      var m = { getCenter: function () { return { lat: function () { return 42.2626; }, lng: function () { return -71.8323; } }; }, getZoom: function () { return 19; }, getBounds: function () { return null; } };
      window._gmap = m; try { _gmap = m; } catch (e) {}
    });
    var bp2 = await blueprint();
    ok(bp2.sheet, 'the Blueprint / PDF captured the site map over a live map: ' + bp2.status);
    var installed = await page.evaluate(function () { var l = document.getElementById('omega-export-map'); return { layer: !!l, src: l ? (l.getAttribute('src') || '').slice(0, 15) : '', temp: (window._ppTempMapImg || '').slice(0, 15) }; });
    ok(A.ext.tiles > 0 && installed.layer && installed.temp === 'data:image/jpeg', 'the satellite raster was fetched and installed under the plan for the capture: ' + A.ext.tiles + ' tile(s), ' + JSON.stringify(installed));
    await compare(page, bp2.sheet, 'live map under the plan');

    /* ── the plot plan's map layer names the plan, placed as the screen
          places it, never the satellite grab ───────────────────────────── */
    var pp = await page.evaluate(function () {
      /* the switch is built with the plot plan's dialog; stand one in for the call */
      var cb = document.getElementById('pp-map'), made = false;
      if (!cb) { cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'pp-map'; cb.style.display = 'none'; document.body.appendChild(cb); made = true; }
      var was = cb.checked; cb.checked = true;
      var out = _ppMapLayer(1000, 700, { cxA: 100, cyA: 100, acx: 0, acy: 0, scale: 0.5, cw: 1140, ch: 698 });
      var flat = _ppMapLayer(1000, 700);
      cb.checked = was; if (made) cb.parentNode.removeChild(cb);
      return { plan: out.indexOf('href="data:image/png') >= 0, satellite: out.indexOf('data:image/jpeg') >= 0, slice: /preserveAspectRatio="xMidYMid slice"/.test(out), flatPlan: flat.indexOf('href="data:image/png') >= 0 };
    });
    ok(pp.plan && !pp.satellite, 'the plot plan carries the uploaded plan, not the satellite grab: ' + JSON.stringify(pp));
    ok(pp.slice, 'the plot plan places the plan as the screen does (cover = slice)');
    ok(pp.flatPlan, 'the plain plot plan carries the plan too');

    /* ── what a save records: the upload only while it is on screen ──── */
    var rec = await page.evaluate(function () {
      var bd = document.getElementById('backdrop'), was = bd.style.display, hid = window._mapHidden, r = {};
      r.shown = _uploadOnScreen();
      bd.style.display = 'none'; r.mapInItsPlace = _uploadOnScreen();
      window._mapHidden = true; r.hiddenByToggle = _uploadOnScreen();
      window._mapHidden = hid; bd.style.display = was;
      var up = window._isUploadedPhoto; window._isUploadedPhoto = false; r.noUpload = _uploadOnScreen(); window._isUploadedPhoto = up;
      return r;
    });
    ok(rec.shown === true && rec.mapInItsPlace === false && rec.hiddenByToggle === true && rec.noUpload === false, 'a save records the upload only while it is on screen: ' + JSON.stringify(rec));
    ok(!A.errors.length, 'no page errors: ' + A.errors.slice(0, 3).join(' | '));
    await A.context.close();

    /* ── reopening the project brings the plan back, coordinates or not ── */
    var B = await boot(browser, base, { plan: plan, query: '?id=' + PROJECT });
    var back = null;
    for (var t = 0; t < 40 && !(back && back.shown); t++) {
      await B.page.waitForTimeout(250);
      back = await B.page.evaluate(function (want) {
        var bd = document.getElementById('backdrop');
        return { shown: !!(bd && getComputedStyle(bd).display === 'block' && bd.getAttribute('src') === want), isUpload: !!window._isUploadedPhoto, pxPerFt: S.pxPerFt, scale: BG.scale, tx: BG.tx, transform: bd ? bd.style.transform : '' };
      }, plan);
    }
    ok(back && back.shown, 'reopening a project saved with coordinates and an uploaded plan shows the plan as the backdrop: ' + JSON.stringify(back));
    ok(back.isUpload && back.pxPerFt === 2.5 && back.scale === 1.1 && back.tx === 12 && /scale\(1\.1\)/.test(back.transform), 'and with its calibrated scale and placement: ' + JSON.stringify(back));
    /* what the save writes: the plan on screen is recorded; the map put in
       its place (as _initGMap does, leaving _isUploadedPhoto set) is not */
    var saved = await B.page.evaluate(async function () {
      async function save() { window.__lastWrite = null; await saveProject(); var w = window.__lastWrite; return w && w.mapState ? w.mapState.isUpload : (w ? 'no mapState: ' + Object.keys(w).join(',') : 'nothing written'); }
      var r = { onScreen: await save() };
      var bd = document.getElementById('backdrop'), was = bd.style.display;
      bd.style.display = 'none'; r.mapInItsPlace = await save(); bd.style.display = was;
      r.stillUpload = !!window._isUploadedPhoto;
      return r;
    });
    ok(saved.onScreen === true && saved.mapInItsPlace === false && saved.stillUpload, 'the save records the plan only while it is on screen: ' + JSON.stringify(saved));
    ok(!B.errors.length, 'no page errors on reopen: ' + B.errors.slice(0, 3).join(' | '));
    await B.context.close();
  } finally {
    await browser.close(); server.close();
  }
  console.log('render-blueprint-upload: ' + count + ' checks passed');
}
main().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
