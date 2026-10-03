#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Design with AI keeps the build on the parcel, in the FULL editor.html
 * (Thomas, 2026-10-03: "it put the solar on the parcel, which is the right
 * thing and the bess should also be in there").
 *
 * The real page, signed in on an offline Firebase stand-in, with Google's map
 * replaced by a fixed projection of LA County's own ring for 780 W Martin
 * Luther King Jr Blvd (APN 5019-025-063): the parcel the HUD reported, with
 * the walk facing south because the road lookup had failed. Then exactly what
 * the autopilot's stepBuild does - size seeded as stepSize seeds it, the
 * guided build armed, OmegaAutopilot.plan(), the array laid with the plan's
 * keep-outs, OmegaAutopilot.layout(plan) through the real placeBgbAt and
 * _bgbFinishRun - and the drawing read back off S:
 *   solar + storage  every piece the build placed (POI, service transformer,
 *                    switchgear, battery block, inverter, loads) has its
 *                    drawn box inside the parcel with the setback to spare;
 *                    every committed run stays on the lot; the PV step
 *                    snapped to the array; no table of the array sits over
 *                    an equipment box
 *                    at 2, 5 and 8 MWh: the battery block is drawn centred
 *                    where the plan put it, at its rated footprint (it used
 *                    to grow right and down from the default cabinet's
 *                    corner, onto the next piece or over the lot line)
 *   battery chain    the BTM sequence on the same lot stops before the POI
 *                    (still a click) with every piece and run on the lot
 * Fails on a page error. A screenshot of each goes to the shots folder
 * (AUTOPILOT_PARCEL_SHOTS, else the system temp folder). No network.
 */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var ROOT = path.join(__dirname, '..'), output = process.env.AUTOPILOT_PARCEL_SHOTS || path.join(os.tmpdir(), 'omega-autopilot-parcel');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; console.log('ok   ' + label); }
var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

/* LA County's ring for APN 5019-025-063, [lat, lng] as /api/parcel returns it */
var RING = [[34.010982559271476, -118.2860439055719], [34.0108589977247, -118.28604331836235], [34.01083140086672, -118.28604319106375],
  [34.0106236369652, -118.28604225013468], [34.01062198606284, -118.28624022404101], [34.01062001532157, -118.28648020150625],
  [34.01061761767531, -118.2867724440983], [34.01061490453378, -118.28710461146723], [34.010894414148844, -118.28710599908791],
  [34.01090438067213, -118.28710428642779], [34.01091391925248, -118.28710092781556], [34.01092276011597, -118.28709601824083],
  [34.01093065322177, -118.28708969655816], [34.01093737533394, -118.28708214155986], [34.010942736335025, -118.28707356691943],
  [34.010946584603055, -118.28706421514825], [34.01094881129979, -118.28705435073682], [34.01094935344891, -118.28704425267436],
  [34.01096309729385, -118.28677646537463], [34.01096513022767, -118.2867766703196], [34.01097680660271, -118.28677753523988],
  [34.010992682565636, -118.28646791524476], [34.010994592549046, -118.28624196011691], [34.01098088088794, -118.28624188023308]];

/* the Firebase compat surface the editor touches, offline (as render-editor-plan.js) */
function fixture() {
  var user = { uid: 'ap-user', email: 'designer@autopilot.example', emailVerified: true, displayName: 'Autopilot Fixture', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? { tier: 'enterprise' } :
      /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Autopilot preview', status: 'active', domains: [location.hostname] } :
      /members\//.test(p) ? { role: 'owner', status: 'active' } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () { return Promise.resolve(snapshot(p)); },
      onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; },
      set: function () { return Promise.resolve(); }, update: function () { return Promise.resolve(); },
      add: function () { return Promise.resolve({ id: 'fixture-created' }); } };
  }
  var db = { collection: function (n) { return ref(n); }, settings: function () {}, enablePersistence: function () { return Promise.resolve(); } };
  window.__user = user; window.__listeners = [];
  var auth = { currentUser: null, onAuthStateChanged: function (fn) { window.__listeners.push(fn); return function () {}; }, getRedirectResult: function () { return Promise.resolve({}); }, setPersistence: function () { return Promise.resolve(); }, signOut: function () { return Promise.resolve(); } };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp: function () { return 'fixture-time'; } };
  function authentication() { return auth; }
  authentication.Auth = { Persistence: { LOCAL: 'local' } };
  authentication.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var app = { firestore: firestore, auth: authentication };
  window.firebase = { apps: [app], initializeApp: function () { return app; }, app: function () { return app; }, firestore: firestore, auth: authentication };
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'autopilot.example', name: 'Autopilot preview', status: 'active' } };
  window.alert = function () {};
}

/* In the page: stand Google's map in with a fixed projection, put the
   parcel where the autopilot's parcel step puts it, seed the size as
   stepSize does, then run stepBuild's sequence and read the drawing back. */
function build(args) {
  var ppf = args.ppf, ring = args.ring, lat0 = 34.0108, lng0 = -118.2866, k = Math.cos(lat0 * Math.PI / 180);
  var FT = 3.280839895;
  S.pxPerFt = ppf;
  window._latLngToPx = function (lat, lng) {
    return { x: 700 + (lng - lng0) * k * 111319.49 * FT * ppf, y: 420 - (lat - lat0) * 111132.95 * FT * ppf };
  };
  window._liveMapState = function () { return { fixture: true }; };
  window._getCanvasSize = function () { return { w: 1400, h: 900 }; };
  window._plotView = { z: 1, tx: 0, ty: 0 };
  var px = ring.map(function (q) { return _latLngToPx(q[0], q[1]); });

  /* the parcel boundary, drawn as the autopilot's drawRing draws it */
  var sh = { id: uid(), kind: 'polyline', pts: px.concat([px[0]]).map(function (p) { return { x: p.x, y: p.y }; }),
             style: S.shapeStyle, color: SHAPE_STROKE, label: 'Parcel boundary', omegaRole: 'boundary' };
  S.shapes.push(sh); renderShape(sh);

  var ST = OmegaAutopilot.state(), lat = 0, lng = 0;
  ring.forEach(function (q) { lat += q[0]; lng += q[1]; });
  ST.centre = { lat: lat / ring.length, lng: lng / ring.length };      /* centroid(ring), as drawRing sets it */
  ST.parcel = { ring: ring, apn: '5019-025-063' };
  ST.front = null;                                                      /* no roads: the walk faces south */
  ST.buildings = [];

  /* stepSize with mw=1 / mwh=2 */
  var BGB = _bgbState();
  BGB.kw = args.kw; BGB.kwh = args.kwh; BGB.mode = 'BTM'; BGB.sizeLocked = true;
  BGB.cfg = _bgbGenericCfg(BGB.kw, BGB.kwh);
  window.__omegaForceMode = 'BTM'; window.__omegaTieFrom = null;
  _bgbSync();

  /* stepBuild */
  if (args.solar) { window.__omegaForceMode = 'SOLAR_BESS'; window.__omegaSolarEntry = true; }
  _bgbStartPlacing();
  var pl = OmegaAutopilot.plan({ pvPoint: args.solar }), lay = null;
  if (args.solar) {
    lay = computeGroundLayout({ boundary: px, exclusions: pl.keepOut });
    applyGroundLayout(px, lay, pl.keepOut);
  }
  var placed = OmegaAutopilot.layout(pl);

  /* read the drawing back */
  function inPoly(p, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
    }
    return inside;
  }
  function cross(a, b, c, d) {
    function o(p, q, r) { var v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0; }
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }
  function segOnLot(a, b) {
    if (!inPoly(a, px) || !inPoly(b, px)) return false;
    for (var j = 0; j < px.length; j++) if (cross(a, b, px[j], px[(j + 1) % px.length])) return false;
    return true;
  }
  var setback = 5 * ppf, out = { placed: placed, pieces: [], runs: 0, runsOff: [], under: 0, moved: pl.moved, tables: 0,
                                 pvSnapped: false, active: BGB.active, next: _bgbCurKind(), errors: [], offPlan: [],
                                 fp: _bessFootprint(args.kwh, args.kw), bessFt: null };
  var spot = {};
  pl.placed.forEach(function (q) { spot[q.kind] = q.pt; });
  (S.elements || []).forEach(function (el) {
    if (!el || !el.bgbRole) return;
    var x0 = el.x - setback, y0 = el.y - setback, x1 = el.x + el.w + setback, y1 = el.y + el.h + setback;
    var corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    var on = corners.every(function (c) { return inPoly(c, px); });
    for (var e = 0; on && e < 4; e++) for (var j = 0; j < px.length; j++) if (cross(corners[e], corners[(e + 1) % 4], px[j], px[(j + 1) % px.length])) on = false;
    out.pieces.push({ role: el.bgbRole, label: el.label, on: on, box: [Math.round(el.x), Math.round(el.y), Math.round(el.w), Math.round(el.h)] });
    /* drawn where the plan put it: the box centred on the planned spot */
    var want = spot[el.evRole];
    if (want && (Math.abs(el.x + el.w / 2 - want.x) > 1 || Math.abs(el.y + el.h / 2 - want.y) > 1))
      out.offPlan.push(el.evRole + ' centred at ' + Math.round(el.x + el.w / 2) + ',' + Math.round(el.y + el.h / 2)
        + ', planned ' + Math.round(want.x) + ',' + Math.round(want.y));
    if (el.bgbRole === 'bess') out.bessFt = { lf: el.lf, wf: el.wf };
  });
  (S._trenches || []).forEach(function (t) {
    out.runs++;
    for (var i = 1; i < t.pts.length; i++) if (!segOnLot(t.pts[i - 1], t.pts[i])) { out.runsOff.push(t.id); break; }
  });
  (S.shapes || []).forEach(function (s) {
    if (s.kind !== 'dersolar') return;
    out.pvSnapped = out.pvSnapped || !!s._bgbUsedAsPv;
    (s.tables || []).forEach(function (t) {
      out.tables++;
      var c = Math.cos(t.a || 0), sn = Math.sin(t.a || 0), cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      var T = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (q) { var dx = q[0] * t.w / 2, dy = q[1] * t.h / 2; return { x: cx + dx * c - dy * sn, y: cy + dx * sn + dy * c }; });
      var hit = (S.elements || []).some(function (el) {
        if (!el || !el.bgbRole) return false;
        var E = [{ x: el.x, y: el.y }, { x: el.x + el.w, y: el.y }, { x: el.x + el.w, y: el.y + el.h }, { x: el.x, y: el.y + el.h }];
        if (T.some(function (p) { return inPoly(p, E); }) || E.some(function (p) { return inPoly(p, T); })) return true;
        for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) if (cross(T[a], T[(a + 1) % 4], E[b], E[(b + 1) % 4])) return true;
        return false;
      });
      if (hit) out.under++;
    });
  });
  return out;
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  try {
    for (var mode of [{ name: 'solar + storage', solar: true, ppf: 1.45, kw: 1000, kwh: 2000 },
                      { name: 'solar + storage', solar: true, ppf: 3, kw: 1000, kwh: 2000 },
                      { name: 'solar + storage', solar: true, ppf: 1.45, kw: 2500, kwh: 5000 },
                      { name: 'solar + storage', solar: true, ppf: 3, kw: 4000, kwh: 8000 },
                      { name: 'battery chain', solar: false, ppf: 2, kw: 1000, kwh: 2000 }]) {
      var context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      await context.addInitScript(fixture);
      await context.route('**/*', function (route) {
        var url = new URL(route.request().url());
        if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
        if (url.pathname.indexOf('/api/') === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
        return route.continue();
      });
      var page = await context.newPage(), errors = [];
      page.on('pageerror', function (e) { errors.push(e.message); });
      await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(function () { firebase.auth().currentUser = window.__user; window.__listeners.forEach(function (fn) { fn(window.__user); }); });
      await page.waitForFunction(function () {
        return window.OmegaAutopilot && typeof OmegaAutopilot.plan === 'function' && typeof window._bgbState === 'function'
          && typeof window._bgbNode === 'function' && typeof window.placeBgbAt === 'function' && typeof window.computeGroundLayout === 'function'
          && window.computeGroundLayout.__omegaAxisFix;
      }, null, { timeout: 30000 });
      await page.waitForTimeout(2500);
      var tag = mode.name + ' ' + (mode.kwh / 1000) + ' MWh at ' + mode.ppf + ' px/ft';
      var r = await page.evaluate(build, { ppf: mode.ppf, ring: RING, solar: mode.solar, kw: mode.kw, kwh: mode.kwh });
      console.log('  ' + tag + ': ' + r.placed.join(' > ') + (r.moved.length ? '   (turned: ' + r.moved.join(', ') + ')' : ''));
      r.pieces.forEach(function (p) { console.log('     ' + (p.on ? 'on lot ' : 'OFF    ') + p.role.padEnd(9) + ' ' + p.label + ' ' + JSON.stringify(p.box)); });
      var want = mode.solar ? ['service', 'utilxfmr', 'mainswgr', 'bess', 'pvinv', 'loads'] : ['bess', 'xfmr', 'disco', 'panel', 'meter'];
      var roles = r.pieces.map(function (p) { return p.role; });
      ok(want.every(function (w) { return roles.indexOf(w) >= 0; }), tag + ': the build placed ' + want.join(', '));
      ok(r.pieces.length && r.pieces.every(function (p) { return p.on; }), tag + ': every piece\'s drawn box is inside the parcel with 5 ft to spare');
      ok(r.runs >= want.length - 1 && r.runsOff.length === 0, tag + ': all ' + r.runs + ' runs stay on the lot');
      ok(r.offPlan.length === 0, tag + ': every piece is drawn centred where the plan put it' + (r.offPlan.length ? ' - ' + r.offPlan.join('; ') : ''));
      if (mode.solar) ok(r.bessFt && r.bessFt.lf === r.fp.lf && r.bessFt.wf === r.fp.wf,
        tag + ': the battery block keeps its rated ' + r.fp.lf + ' x ' + r.fp.wf + ' ft through a zoom (lf/wf recorded)');
      if (mode.solar) {
        ok(r.tables > 20, tag + ': the array was laid (' + r.tables + ' tables)');
        ok(r.under === 0, tag + ': no table of the array is over an equipment box');
        ok(r.pvSnapped, tag + ': the PV step connected to the array, no second array');
        ok(r.active === false, tag + ': the build finished');
      } else {
        ok(r.active === true && r.next === 'service', tag + ': stopped before the POI, which stays a click');
      }
      ok(errors.length === 0, tag + ': no page error' + (errors.length ? ' - ' + errors.slice(0, 3).join(' | ') : ''));
      await page.screenshot({ path: path.join(output, (mode.solar ? 'solar-storage' : 'battery-chain') + '-' + (mode.kwh / 1000) + 'mwh-' + mode.ppf + '.png') });
      await context.close();
    }
  } finally {
    await browser.close(); server.close();
  }
  console.log('\n' + count + ' checks passed; shots in ' + output);
}
run().catch(function (e) { console.error(e); process.exit(1); });
