#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/guides/omega-maximus.js — the Omega Maximus guide, as a PDF with
   screenshots of the real editor.

   It runs /editor-v2 (Omega Maximus) in Chromium from a local port and walks
   one site the way a designer does: New, the site address, Find on the map,
   the county's parcel lines, Use as site boundary, the building marked as an
   obstruction, View › Icons, Does this site work? → a BESS build in hand,
   put down on the yard it was offered, a DCFC build moved to the frontage,
   turned with R and clicked down, Run, Outputs (the permit set and the
   one-line), 3D, Save to workspace, Funding — and what a workspace without
   the module sees. Everything a screenshot shows comes from the run:
     · the aerial photo (Google's satellite through the Maps JavaScript API on
       the page's own key, Esri World Imagery under it, credited on the page
       as the map credits it), the address search (OpenStreetMap Nominatim),
       the county parcel layer, the permit set's photo (USGS National Map) and
       the 3D ground (USGS 3DEP) are the public services the page itself calls;
     · /api/parcel is the REAL handler, asking the county itself;
     · /api/guided-build is the REAL planner, /api/cost-rollup the REAL cost
       engine, /api/value-stack the REAL handler (scripts/_lib/editor-v2-server.js),
       /api/solar-design the REAL library;
     · sign-in is stood in for (no account is used) and the save goes to an
       in-memory store, never Firestore.
   It asserts the editor's state after each step, and the guide's words take
   their figures from the run (the parcel, the takeoff, Run's cost lines and
   value stack, the sheet count), so a retake can never print a stale number.

     node scripts/guides/omega-maximus.js                 writes guides/editor/Omega-Maximus.pdf
     node scripts/guides/omega-maximus.js --out F.pdf     somewhere else
     node scripts/guides/omega-maximus.js --shots DIR     keep the screenshots there
     node scripts/guides/omega-maximus.js --capture-only  screenshots and facts.json, no PDF

   Like the Site Map guide (site-map-level-2.js) it is not part of build.js:
   it needs the network for the photo, the address and the parcel, so it is
   retaken by running it after a change to the editor. */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var ROOT = path.join(__dirname, '..', '..');
var F = require('../_lib/firestore-double');
var memory = new F.DB();
function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
/* the shared auth module, for the handlers this script runs itself: the
   caller is a verified ClearSky address, the parcel cache is in memory */
F.mock('../api/_lib/admin', {
  handler: function (fn) { return fn; },
  authenticate: function () { return Promise.resolve({ uid: 'guide', email: 'guide@clearsky-usa.com', emailVerified: true, orgId: 'clearsky-usa.com', staff: true, claims: {} }); },
  billingOf: function () { return Promise.resolve({}); },
  db: function () { return memory; },
  isDegraded: function () { return false; },
  httpError: httpError
});
var PARCEL = require('../../api/parcel.js');
var GB = require('../../api/_lib/guided-build');
var SOLAR = require('../../api/_lib/solar-design');
var COMPONENT = require('../../api/_lib/editor-v2-component-cost');
var SOURCES = require('../../omega-parcel-sources.js').SOURCES;
var PW = (function () { try { return require.resolve('playwright'); } catch (e) { return process.env.PLAYWRIGHT || 'playwright'; } })();
var chromium = require(PW).chromium;

function arg(k, d) { var i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
var OUT = path.resolve(arg('--out', path.join(ROOT, 'guides', 'editor', 'Omega-Maximus.pdf')));
var SHOTS = path.resolve(arg('--shots', path.join(os.tmpdir(), 'omega-maximus-guide')));
var CAPTURE_ONLY = process.argv.indexOf('--capture-only') > 0;

/* The site: a warehouse on 51st Avenue in west Phoenix, on Maricopa County's
   parcel layer, whose address the search places on its own roof. */
var SITE = { address: '802 S 51st Ave, Phoenix, AZ 85043', zip: '85043', state: 'AZ', at: { lat: 33.4387666, lng: -112.1706532 } };
/* the building, in feet from that point (OpenStreetMap's outline of the
   building the search matched), and where each build goes: the open yard
   north of it, and the lot along 51st Avenue */
var BUILDING = [[-151, -157], [-94, -158], [-92, -71], [146, -75], [145, -145], [195, -146], [197, -45], [147, -44], [149, 46], [218, 44], [221, 195], [152, 196], [152, 179], [-145, 184]];
var YARD = { x: 40, y: 265 }, FRONT = { x: 300, y: 60 };

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

/* a handler of this repo, answered in-process */
function call(fn, method, body) {
  return new Promise(function (resolve) {
    var out = { status: 200, json: null }, done = false;
    var res = {
      statusCode: 200, setHeader: function () {},
      status: function (s) { out.status = s; return res; },
      json: function (j) { out.json = j; done = true; resolve(out); return res; },
      end: function () { if (!done) { done = true; resolve(out); } }
    };
    Promise.resolve().then(function () { return fn({ method: method, headers: { authorization: 'Bearer guide' }, body: body, query: {} }, res); })
      .then(function (v) { if (!done) { out.json = v; resolve(out); } }, function (e) { resolve({ status: e.status || 500, json: { ok: false, error: String(e && e.message || e) } }); });
  });
}
function feetApart(a, b) {
  var dLat = (a.lat - b.lat) * 364000, dLng = (a.lng - b.lng) * 364000 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

async function capture(browser) {
  var facts = { site: SITE, steps: [] }, shots = {}, errors = [], stored = {}, calls = [];
  var base = 'http://127.0.0.1:' + server.address().port;
  var runServer = require('../_lib/editor-v2-server.js').create({ zip: SITE.zip, state: SITE.state });
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, userAgent: 'Mozilla/5.0 (ClearSky-OMEGA guide build; dev@clearsky-usa.com) Chromium' });
  var page = await context.newPage();
  page.on('pageerror', function (e) { errors.push(e.message); });
  function decoded(v) { if (v.mapValue) return unpack(v.mapValue.fields || {}); if (v.arrayValue) return (v.arrayValue.values || []).map(decoded); if ('nullValue' in v) return null; return v.stringValue !== undefined ? v.stringValue : v.doubleValue !== undefined ? v.doubleValue : v.integerValue !== undefined ? +v.integerValue : v.booleanValue; }
  function unpack(v) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = decoded(v[k]); }); return o; }
  await page.route('**/*', async function (route) {
    var req = route.request(), url = req.url(), body = null;
    try { body = req.postDataJSON(); } catch (e) { body = null; }
    /* the page and the public services it calls */
    if (url.startsWith(base) && url.indexOf('/api/') < 0 && url.indexOf('/__workspace') < 0) return route.continue();
    if (/^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\//.test(url)) return route.continue();
    if (/^https:\/\/nominatim\.openstreetmap\.org\/search/.test(url)) { calls.push('nominatim'); return route.continue(); }
    if (/^https:\/\/gis\.mcassessor\.maricopa\.gov\//.test(url)) return route.continue();
    if (/^https:\/\/(basemap|elevation)\.nationalmap\.gov\//.test(url)) return route.continue();
    if (/^https:\/\/services\d*\.arcgis\.com\//.test(url)) return route.continue();
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.continue();
    if (/^https:\/\/(maps\.googleapis\.com|maps\.gstatic\.com|khms\d*\.googleapis\.com|khms\d*\.google\.com)\//.test(url)) return route.continue();
    /* the save: an in-memory store in Firestore's own write shape */
    if (url.indexOf('/__workspace-fixture') >= 0) { var q = new URL(url).searchParams, id = q.get('id'); return route.fulfill({ json: id ? (stored['projects/' + id] || null) : stored }); }
    if (url.indexOf('firestore.googleapis.com') >= 0) {
      var w = body && body.writes && body.writes[0];
      if (!w || !w.update) return route.fulfill({ json: { writeResults: [{}] } });
      stored[w.update.name.split('/documents/')[1]] = unpack(w.update.fields || {});
      return route.fulfill({ json: { writeResults: [{}] } });
    }
    /* the server, in-process */
    var p = url.indexOf('/api/') >= 0 ? new URL(url).pathname : '';
    if (p) calls.push(p);
    if (p === '/api/cost-rollup' || p === '/api/value-stack') { var r = await runServer.answer(url, body); return route.fulfill({ status: r.status, json: r.json }); }
    if (p === '/api/guided-build') { var b = body || {}; return route.fulfill({ json: GB.plan(String(b.builder || ''), b.input || {}) }); }
    if (p === '/api/solar-design') return route.fulfill({ json: req.method() === 'GET' ? { version: SOLAR.VERSION, catalog: SOLAR.catalog() } : SOLAR.design(body || {}) });
    if (p === '/api/editor-v2-component-cost') return route.fulfill({ json: COMPONENT(body || {}) });
    if (p === '/api/editor-v2-3d-config') return route.fulfill({ json: { photorealistic: false } });
    if (p === '/api/parcel-tiles') return route.fulfill({ json: { ok: false, reason: 'not-configured' } });
    if (p === '/api/parcel') { var pr = await call(PARCEL, 'POST', body); facts.parcel = pr.json && { ok: pr.json.ok, apn: pr.json.apn, acres: pr.json.acres, county: pr.json.county, source: pr.json.source }; return route.fulfill({ status: pr.status, json: pr.json }); }
    if (p === '/api/maximus-access') return route.fulfill({ json: { held: true } });
    return route.abort();
  });

  async function photoReady() {
    await page.waitForFunction(function () {
      var d = OmegaEditorV2App.debug();
      if (d.map && d.map.source === 'google') return OmegaEditorV2Satellite.tilesLoaded();
      var imgs = document.querySelectorAll('#map img'); if (!imgs.length) return false;
      for (var i = 0; i < imgs.length; i++) if (imgs[i].style.visibility !== 'hidden' && !imgs[i].complete) return false;
      return true;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(700);
  }
  /* where a point of the drawing is on the page, and a crop around it */
  async function screenOf(pt) {
    var d = await view(), c = await page.locator('#cv').boundingBox();
    return { x: c.x + d.view.w / 2 + (pt.x - d.view.cx) * d.view.pxPerFt, y: c.y + d.view.h / 2 - (pt.y - d.view.cy) * d.view.pxPerFt };
  }
  async function boxAround(pt, w, h) {
    var s = await screenOf(pt), c = await page.locator('#cv').boundingBox();
    return { x: Math.max(c.x, Math.min(c.x + c.width - w, s.x - w / 2)), y: Math.max(c.y, Math.min(c.y + c.height - h, s.y - h / 2)), width: w, height: h };
  }
  /* the wheel over a point of the drawing, to about `target` px a foot; the
     point stays under the pointer, so a build in hand stays where it is */
  async function zoomAt(pt, target) {
    for (var i = 0; i < 40; i++) {
      var d = await view();
      if (Math.abs(Math.log(d.view.pxPerFt / target)) <= Math.log(1.12) / 2) break;
      var s = await screenOf(pt);
      await page.mouse.move(s.x, s.y);
      await page.mouse.wheel(0, d.view.pxPerFt < target ? -100 : 100);
      await page.waitForTimeout(40);
    }
  }
  /* wait for the build to come back from the planner, in hand */
  async function inHand(what) {
    await page.waitForFunction(function () { return (!document.getElementById('dlg-build').open && !!OmegaEditorV2App.debug().held) || !!document.getElementById('build-error').textContent; }, null, { timeout: 15000 });
    var h = (await view()).held;
    assert(h && h.units >= 4, 'the ' + what + ' build is in hand: ' + JSON.stringify(h) + ' ' + await status());
    return h;
  }
  function putDown(st, what) {
    assert(/It is selected: drag to move it\./.test(st) && !/stands? on something|outside the lot line/.test(st), 'the ' + what + ' build is put down, on clear ground on the lot: ' + st);
  }
  async function snap(name, clip, onPage) {
    var file = path.join(SHOTS, name + '.jpg');
    await (onPage || page).screenshot(Object.assign({ path: file, type: 'jpeg', quality: 84 }, clip ? { clip: clip } : {}));
    shots[name] = file; return file;
  }
  async function boxOf(sel, pad) {
    var b = await page.locator(sel).boundingBox(); pad = pad || 0;
    return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad };
  }
  async function canvasBox(w, h) {
    var c = await page.locator('#cv').boundingBox();
    if (!w) return { x: c.x, y: c.y, width: c.width, height: c.height };
    return { x: c.x + (c.width - w) / 2, y: c.y + (c.height - h) / 2, width: w, height: h };
  }
  function status() { return page.evaluate(function () { return document.getElementById('status').textContent; }); }
  async function step(name, fn) { var t = Date.now(); await fn(); facts.steps.push({ name: name, ms: Date.now() - t, status: await status() }); }
  function view() { return page.evaluate(function () { return OmegaEditorV2App.debug(); }); }
  /* the mouse wheel over the middle of the view, out to about `target` px a foot */
  async function zoomOutTo(target) {
    var cv = await page.locator('#cv').boundingBox(), i, d;
    await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
    for (i = 0; i < 20; i++) {
      d = await view();
      if (d.view.pxPerFt <= target) break;
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(40);
    }
    await photoReady();
  }
  /* drag the map with the Pan tool so a point of the drawing is in the middle */
  async function panTo(pt) {
    var d = await view(), cv = await page.locator('#cv').boundingBox();
    var sx = cv.x + d.view.w / 2 + (pt.x - d.view.cx) * d.view.pxPerFt, sy = cv.y + d.view.h / 2 - (pt.y - d.view.cy) * d.view.pxPerFt;
    var tx = cv.x + d.view.w / 2, ty = cv.y + d.view.h / 2, i;
    await page.click('[data-tool="pan"]');
    await page.mouse.move(sx, sy); await page.mouse.down();
    for (i = 1; i <= 12; i++) await page.mouse.move(sx + (tx - sx) * i / 12, sy + (ty - sy) * i / 12);
    await page.mouse.up();
    await page.click('[data-tool="select"]');
    d = await view();
    assert(Math.abs(d.view.cx - pt.x) < 15 && Math.abs(d.view.cy - pt.y) < 15, 'the view is on ' + JSON.stringify(pt) + ': ' + JSON.stringify(d.view));
  }

  await page.goto(base + '/editor-v2.html');
  await page.waitForFunction(function () { return !!window.OmegaEditorV2App && !!window.OmegaEditorV2View3D; });
  await page.waitForFunction(function () { return !document.documentElement.classList.contains('omega-loading'); }, null, { timeout: 8000 });
  /* the sign-in, stood in for: a token for the server calls, a person and an
     in-memory workspace for Save */
  await page.evaluate(function () {
    OmegaEditorV2Auth.idToken = function () { return Promise.resolve('guide-token'); };
    var u = { uid: 'guide-user', email: 'designer@example.com', getIdToken: function () { return Promise.resolve('guide-token'); }, getIdTokenResult: function () { return Promise.resolve({ claims: { orgId: 'example.com' } }); } };
    var db = { collection: function () { return { doc: function (id) { return { get: function () { return fetch('/__workspace-fixture?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (d) { return { exists: !!d, id: id, data: function () { return d; } }; }); } }; },
      where: function () { return { get: function () { return fetch('/__workspace-fixture').then(function (r) { return r.json(); }).then(function (all) { return { forEach: function (fn) { Object.keys(all).forEach(function (k) { fn({ id: k.split('/')[1], data: function () { return all[k]; } }); }); } }; }); } }; } }; } };
    window.firebase = { auth: function () { return { currentUser: u }; }, firestore: function () { return db; } };
    OmegaEditorV2Auth.whenReady = function () { return Promise.resolve(u); };
  });

  /* 1. New: the Site tab, the cursor in the address */
  await step('new', async function () {
    await page.click('#btn-new');
    await page.waitForFunction(function () { return document.getElementById('app').getAttribute('data-section') === 'site' && document.activeElement && document.activeElement.id === 'site-address-go'; });
    await page.keyboard.type(SITE.address, { delay: 6 });
    await snap('01-address-panel', await boxOf('#side-site', 6));
  });
  /* 2. Find on the map: the block around the address, on its photo */
  await step('find', async function () {
    await page.click('#site-address-find');
    await page.waitForFunction(function () { return /Anchor set/.test(document.getElementById('status').textContent); }, null, { timeout: 20000 });
    await photoReady();
    var d = await view();
    assert(d.map && d.map.tiles > 0 && !d.map.note, 'the photo is on: ' + JSON.stringify(d));
    /* the building outline is in feet from this point: a search that moved it would misplace the outline */
    assert(feetApart(d.anchor, SITE.at) < 25, 'the address search still lands where the outline was measured from: ' + JSON.stringify(d.anchor));
    facts.findView = d;
    facts.imagery = await page.evaluate(function () {
      var d = OmegaEditorV2App.debug();
      if (d.map && d.map.source === 'google') { var m = /Imagery ©[^\n]*/.exec(document.getElementById('gsat').innerText || ''); return 'Google satellite' + (m ? ' (' + m[0].replace(/\s+Terms.*$/, '').trim() + ')' : ''); }
      return 'Esri World Imagery';
    });
    await snap('02-found', await canvasBox());
  });
  /* 3. Show parcel lines (the Site tab's switch): the county's lines, and the
     parcel under the site point looked up by the real handler */
  await step('parcels', async function () {
    await page.click('#site-parcels');
    await page.waitForFunction(function () { var c = document.getElementById('parcel-detail'); return c && !c.hidden && /APN/.test(c.innerText) && !document.getElementById('parcel-use').hidden; }, null, { timeout: 30000 });
    await page.waitForFunction(function () { return document.querySelectorAll('#map-parcels .pt').length > 0; }, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    facts.parcelCard = await page.locator('#parcel-detail').innerText();
    await snap('03-parcel', await canvasBox());
  });
  /* 4. Use as site boundary: the lot line, and the view on the lot */
  await step('boundary', async function () {
    await page.click('#parcel-use');
    await page.waitForFunction(function () { return /lot line now/.test(document.getElementById('status').textContent); }, null, { timeout: 5000 });
    facts.boundaryStatus = await status();
    await page.click('#parcel-detail-close');
    await page.keyboard.press('Escape');
    await photoReady();
    facts.lotView = await view();
    await snap('04-boundary', await canvasBox());
  });
  /* the county's lines off again: the lot line stays */
  await page.click('#site-parcels');
  /* 5. Mark the building: Obstruction, its corners typed on the command line
     (a point is x,y in feet from the site point; Enter on an empty line
     closes it), so a guided build keeps off the roof */
  await step('obstruction', async function () {
    await page.click('[data-tool="obstruction"]');
    for (var i = 0; i < BUILDING.length; i++) {
      await page.fill('#cmd', BUILDING[i][0] + ',' + BUILDING[i][1]);
      await page.press('#cmd', 'Enter');
    }
    await page.press('#cmd', 'Enter');
    await page.click('[data-tool="select"]');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await snap('05-obstruction', await canvasBox());
  });
  /* View › Icons: each unit drawn as Site Map's icon on its footprint */
  await page.click('[data-act="icons"]');
  assert((await view()).icons === true, 'Icons is on');
  /* 6. Look at the yard, then Does this site work? Yes: the guided builds */
  await panTo(YARD);
  await step('choose', async function () {
    await page.click('#stages [data-stage="site"]');
    await page.click('#site-yes');
    await page.waitForFunction(function () { return document.getElementById('dlg-build').open && document.querySelectorAll('#build-choices input').length >= 8; }, null, { timeout: 5000 });
    facts.choices = await page.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#build-choices label'), function (l) { return l.innerText.replace(/\s+/g, ' ').trim(); }); });
    await snap('06-choose', await boxOf('#dlg-build', 8));
  });
  /* 7. BESS build: the form, then Place on the site */
  await step('bess', async function () {
    await page.check('#build-choices input[value="bess"]');
    await page.waitForTimeout(300);
    facts.bessLead = await page.innerText('#build-lead');
    facts.bessFields = await page.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#build-fields label'), function (l) { return l.innerText.replace(/\s+/g, ' ').trim(); }); });
    await snap('07-bess-form', await boxOf('#dlg-build', 8));
    await page.click('#build-place');
    var h = await inHand('BESS');
    assert(!h.clash && Math.abs(h.clear.x - YARD.x) < 160 && Math.abs(h.clear.y - YARD.y) < 120, 'it is offered on clear ground in the yard, where the view was: ' + JSON.stringify(h));
    facts.bessHeld = await status();
    /* the pointer on it, so it stays on the spot it was offered */
    var s = await screenOf(h.at);
    await page.mouse.move(s.x, s.y);
    await zoomAt(h.at, 3.4);
    await photoReady();
    h = (await view()).held;
    assert(h && !h.dx && !h.dy, 'it is still on the spot it was offered: ' + JSON.stringify(h));
    await snap('08-bess-held', await boxAround(h.at, 840, 380));
    await page.keyboard.press('Enter');
    var st = await status();
    putDown(st, 'BESS');
    facts.bessStatus = st;
    facts.bessParts = (await view()).selected;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await snap('08-bess-placed', await boxAround(h.at, 840, 380));
  });
  /* 8. Fit, look at the front lot, and a second build from the ribbon: DCFC */
  await page.click('#stages [data-stage="site"]');
  await page.click('[data-act="zoom-ext"]');
  await page.keyboard.press('Escape');
  await panTo(FRONT);
  await step('dcfc', async function () {
    await page.click('[data-build="dcfc"]');
    await page.waitForFunction(function () { return document.getElementById('dlg-build').open; }, null, { timeout: 5000 });
    facts.dcfcLead = await page.innerText('#build-lead');
    facts.dcfcFields = await page.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#build-fields label'), function (l) { return l.innerText.replace(/\s+/g, ' ').trim(); }); });
    await page.click('#build-place');
    var h = await inHand('DCFC');
    /* by hand: to the frontage, then R turns it to run along 51st Avenue */
    var s = await screenOf(FRONT);
    await page.mouse.move(s.x - 80, s.y + 50);
    await page.mouse.move(s.x, s.y, { steps: 8 });
    await page.keyboard.press('r');
    h = (await view()).held;
    assert(h.turns === 1 && Math.abs(h.at.x - FRONT.x) <= 2.6 && Math.abs(h.at.y - FRONT.y) <= 2.6 && !h.clash, 'it follows the pointer to the frontage and turns, standing on nothing: ' + JSON.stringify(h));
    facts.dcfcHeld = await status();
    await zoomAt(FRONT, 2.9);
    await photoReady();
    await snap('09-dcfc-held', await boxAround(FRONT, 840, 420));
    s = await screenOf(FRONT);
    await page.mouse.click(s.x, s.y);
    var st = await status();
    putDown(st, 'DCFC');
    facts.dcfcStatus = st;
    facts.dcfcParts = (await view()).selected;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await snap('09-dcfc-placed', await boxAround(FRONT, 840, 420));
  });
  /* 9. Fit: the whole site */
  await step('fit', async function () {
    await page.click('#stages [data-stage="site"]');
    await page.click('[data-act="zoom-ext"]');
    await page.keyboard.press('Escape');
    await photoReady();
    await page.click('#stages [data-stage="design"]');
    await page.waitForTimeout(300);
    facts.takeoff = await page.evaluate(function () { var k = document.getElementById('takeoff-kv'); return k ? k.innerText : ''; });
    await snap('10-site');
  });
  /* 10. Run: the server prices the drawing and runs the value stack */
  await step('run', async function () {
    await page.click('#btn-run');
    await page.waitForFunction(function () { var h = document.getElementById('run-head'); return h && /^Run on /.test(h.textContent); }, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    facts.analyze = await page.innerText('#analyze-body');
    facts.runStatus = await status();
    await page.setViewportSize({ width: 1440, height: 2700 });
    await page.waitForTimeout(800);
    var folds = await page.evaluate(function () {
      var out = {};
      Array.prototype.forEach.call(document.querySelectorAll('#analyze-body details'), function (d) {
        var s = d.querySelector('summary'), r = d.getBoundingClientRect();
        if (s) out[s.textContent.trim()] = { x: r.left, y: r.top, w: r.width, h: r.height };
      });
      return out;
    });
    var cost = folds['Cost estimate'], value = folds['Value stack'], irr = folds['IRR'];
    assert(cost && value && irr, 'the Analyze folds are there: ' + Object.keys(folds).join());
    await snap('11-run-cost', { x: cost.x - 6, y: cost.y - 6, width: cost.w + 12, height: value.y + value.h - cost.y + 12 });
    await snap('11-run-irr', { x: irr.x - 6, y: irr.y - 6, width: irr.w + 12, height: irr.h + 12 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
  });
  /* 11. Outputs: the panel, the permit set and the one-line */
  await step('outputs', async function () {
    await page.click('#btn-outputs');
    await page.waitForFunction(function () { return !document.getElementById('side-outputs').hidden && !!document.getElementById('btn-permit'); });
    facts.outputs = await page.innerText('#outputs-body');
    await page.setViewportSize({ width: 1440, height: 1800 });
    await page.waitForTimeout(600);
    await snap('12-outputs', await boxOf('#side-outputs', 8));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    await page.click('#btn-permit');
    await page.waitForFunction(function () { return document.getElementById('dlg-outputs').open; }, null, { timeout: 15000 });
    var dlg = page.locator('#dlg-outputs');
    facts.sheetCount = await page.evaluate(function () { var m = /of (\d+)/.exec(document.getElementById('dlg-outputs').innerText); return m ? +m[1] : 0; });
    facts.sheets = [];
    for (var i = 0; i < 12; i++) {
      var t = await page.evaluate(function () { var m = /([A-Z]-\d{3}[^\n]*)/.exec(document.getElementById('dlg-outputs').innerText); return m ? m[1].trim() : ''; });
      facts.sheets.push(t);
      if (/site plan/i.test(t)) break;
      await dlg.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(function () { return !/loading/i.test(document.getElementById('dlg-outputs').innerText); }, null, { timeout: 30000 }).catch(function () {});
    await page.waitForTimeout(1500);
    facts.permitNote = await page.evaluate(function () { var m = /Aerial photo on the site plan\s*([^\n]*)/.exec(document.getElementById('dlg-outputs').innerText); return m ? m[1] : ''; });
    await snap('13-permit', await boxOf('#dlg-outputs', 0));
    await page.evaluate(function () { OmegaEditorV2Outputs.close(); });
    await page.click('#btn-sld');
    await page.waitForFunction(function () { return document.getElementById('dlg-outputs').open; }, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    var sld = await page.evaluate(function () { var v = document.querySelector('#dlg-outputs .out-preview svg'); return v ? v.outerHTML : ''; });
    assert(sld, 'the one-line sheet is an SVG');
    var big = await context.newPage();
    await big.setViewportSize({ width: 2400, height: 1700 });
    await big.setContent('<!doctype html><body style="margin:0;background:#fff">' + sld.replace(/ width="[^"]*" height="[^"]*"/, ' width="2400"') + '</body>');
    await big.waitForTimeout(300);
    /* the diagram sits in the sheet's top-left third (as on E-002) */
    var sheet = await big.locator('svg').first().boundingBox();
    await snap('14-sld', { x: sheet.x, y: sheet.y, width: Math.round(sheet.width * 0.31), height: Math.round(sheet.height * 0.36) }, big);
    await big.close();
    await page.evaluate(function () { OmegaEditorV2Outputs.close(); });
    await page.click('#outputs-close');
  });
  /* 12. 3D */
  await step('3d', async function () {
    await page.click('#btn-3d');
    await page.waitForFunction(function () { return OmegaEditorV2View3D.isOpen() && OmegaEditorV2View3D.debug().triangles > 0; }, null, { timeout: 30000 });
    await page.waitForTimeout(4000);
    facts.view3d = await page.evaluate(function () { var d = OmegaEditorV2View3D.debug(); return { mode: d.mode, triangles: d.triangles, imagery: d.imagery, elevation: d.elevation, civil: d.civil && d.civil.note }; });
    await snap('15-3d', await canvasBox());
    await page.evaluate(function () { OmegaEditorV2View3D.close(); });
  });
  /* 13. Save to workspace (an in-memory store here) */
  await step('save', async function () {
    await page.fill('#project-name', '51st Avenue warehouse');
    await page.press('#project-name', 'Enter');
    await page.click('#btn-save');
    await page.waitForFunction(function () { return document.getElementById('save-state').textContent === 'Saved to workspace'; }, null, { timeout: 15000 });
    var ids = Object.keys(stored);
    assert(ids.length === 1, 'one project saved: ' + ids.join());
    var rec = stored[ids[0]];
    facts.saved = { editor: rec.editor, capex: rec.capex, capexSource: rec.capexSource, bessKw: rec.bessKw, bessKwh: rec.bessKwh, incentive: rec.incentive, annualRevenue: rec.annualRevenue };
    await snap('16-saved', { x: 0, y: 0, width: 1440, height: 64 });
  });
  /* 14. Funding */
  await step('funding', async function () {
    await page.click('#stages [data-stage="funding"]');
    await page.waitForTimeout(400);
    facts.funding = await page.innerText('#funding-body');
    await snap('17-funding', await boxOf('#funding-body', 10));
  });
  assert.deepStrictEqual(errors, [], 'no page error');
  /* 15. A workspace without the module: the price and Opt in */
  await step('lock', async function () {
    var p2 = await context.newPage();
    await p2.addInitScript(function () { var held; Object.defineProperty(window, 'OmegaEditorV2Auth', { configurable: true, get: function () { return held; }, set: function (v) { if (v) v.idToken = function () { return Promise.resolve('lock-token'); }; held = v; } }); });
    await p2.route('**/*', function (route) {
      var url = route.request().url();
      if (url.indexOf('/api/maximus-access') >= 0) return route.fulfill({ json: { held: false, reason: "Omega Maximus is not on this workspace's plan. Opt in on the Modules page.", price: '$1,299/month', optIn: '/workspace#module-maximus' } });
      if (url.startsWith(base) && url.indexOf('/api/') < 0) return route.continue();
      return route.abort();
    });
    await p2.goto(base + '/editor-v2.html');
    await p2.waitForFunction(function () { return !!window.OmegaEditorV2App; });
    await p2.waitForFunction(function () { return !document.documentElement.classList.contains('omega-loading'); }, null, { timeout: 8000 });
    await p2.waitForFunction(function () { return !document.getElementById('maximus-lock').hidden; }, null, { timeout: 8000 });
    await p2.waitForTimeout(600);
    facts.lock = await p2.innerText('#maximus-lock');
    var card = await p2.locator('#maximus-lock .lock-card').boundingBox();
    await snap('18-lock', { x: card.x - 24, y: card.y - 24, width: card.width + 48, height: card.height + 48 }, p2);
    await p2.close();
  });
  facts.calls = calls;
  await context.close();
  return { facts: facts, shots: shots };
}

/* ── the figures the words use, read off what the run showed ─────────── */
function readRun(facts) {
  var a = facts.analyze || '', out = {};
  var m = /Installed estimate \$(\d(?:[\d,]*\d)?)/.exec(a); out.installed = m ? m[1] : '';
  out.lines = [];
  var cost = (a.split('Cost estimate')[1] || '').split('Includes')[0];
  cost.split('\n').forEach(function (l) { var q = /^(.+?) \$(\d(?:[\d,]*\d)?)$/.exec(l.trim()); if (q) out.lines.push({ name: q[1], amount: q[2] }); });
  out.streams = [];
  a.split('\n').forEach(function (l) { var q = /^(.+?) \$(\d(?:[\d,]*\d)?) \/ yr · (\w+)$/.exec(l.trim()); if (q) out.streams.push({ name: q[1], amount: q[2], tier: q[3] }); });
  m = /Gross \$(\d(?:[\d,]*\d)?) a year; the owner keeps \$(\d(?:[\d,]*\d)?)/.exec(a); out.gross = m ? m[1] : ''; out.keeps = m ? m[2] : '';
  out.noIrr = /No IRR/.test(a);
  m = /IRR\s*\n\s*(-?[\d.]+%)/.exec(a); out.irr = m ? m[1] : '';
  m = /NPV \$(-?\d(?:[\d,]*\d)?)/.exec(a); out.npv = m ? m[1] : '';
  m = /Simple payback ([\d.]+) years/.exec(a); out.payback = m ? m[1] : '';
  m = /Project Intelligence\s*\n\s*([^\n]+)\s*\n\s*(\d+) \/ 100/.exec(a); out.decision = m ? m[1].trim() : ''; out.score = m ? m[2] : '';
  return out;
}
function readTakeoff(facts) {
  var t = (facts.takeoff || '').replace(/\s+/g, ' ');
  var s = /Storage (\d(?:[\d,]*\d)?) kW \/ (\d(?:[\d,]*\d)?) kWh/.exec(t), c = /Chargers (\d+) · (\d(?:[\d,]*\d)?) kW/.exec(t);
  function n(v) { return Number(String(v).replace(/,/g, '')).toLocaleString('en-US'); }
  return { kw: s ? n(s[1]) : '', kwh: s ? n(s[2]) : '', chargers: c ? c[1] : '', chargerKw: c ? n(c[2]) : '' };
}
/* the names a build placed, once each, in the order it placed them: 'A, B and C' */
function parts(list) {
  var seen = {}, out = [];
  (list || []).forEach(function (n) { var k = String(n).replace(/\s+\d+$/, function (m) { return ''; }); if (/^DCFC$|^Level 2$/.test(k)) k = k + ' chargers'; if (!seen[k]) { seen[k] = 1; out.push(k); } });
  /* lower-case a word after the first, never an acronym (AC, DCFC, BESS) */
  out = out.map(function (n, i) { return i && /^[A-Z][a-z]/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n; });
  return out.length > 1 ? out.slice(0, -1).join(', ') + ' and ' + out[out.length - 1] : (out[0] || '');
}
function short(n) { n = +String(n).replace(/,/g, ''); return n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + Math.round(n / 1000) + 'k'; }

/* ── the PDF ──────────────────────────────────────────────────────────── */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function uri(file) { var ext = path.extname(file).slice(1).replace('jpg', 'jpeg'); return 'data:image/' + ext + ';base64,' + fs.readFileSync(file).toString('base64'); }

function guideHtml(img, f) {
  var run = readRun(f), take = readTakeoff(f), parcel = f.parcel || {};
  var acres = parcel.acres != null ? (+parcel.acres).toFixed(1) : '';
  var builds = [
    ['DER build', 'Solar, wind, or gas blocks and a collector.'], ['Auto-layout', 'Fill the parcel with solar tables.'],
    ['BESS build', 'Behind the meter, in front of the meter, or with solar.'], ['Full topology', 'From the point of connection out to the utility.'],
    ['Level 2', 'A row of Level 2 stalls and the panel that feeds them.'], ['DCFC build', 'Fast chargers, a transformer, and the service.'],
    ['Compute build', 'A data-center power chain. Radial unless you change it.'], ['Engineering build', 'Interconnection, gear, battery, and the EMS.']
  ];
  var glow = uri(path.join(__dirname, 'assets', 'omega-glow.jpg'));
  var pageNo = 1;
  function page(label, body) {
    pageNo++;
    return '<section class="page"><header class="band"><span>' + esc(label) + '</span><img src="' + glow + '" alt=""></header>' +
      '<div class="content">' + body + '</div><footer class="num">' + pageNo + '</footer></section>';
  }
  function shot(key, caption, cls) {
    return '<figure class="shot ' + (cls || '') + '"><img src="' + img[key] + '" alt=""><figcaption>' + caption + '</figcaption></figure>';
  }
  function cards(list) {
    return '<div class="cards">' + list.map(function (c, i) { return '<div class="card"><b class="n">' + (i + 1) + '</b><h4>' + esc(c[0]) + '</h4><p>' + esc(c[1]) + '</p></div>'; }).join('') + '</div>';
  }
  function callout(html) { return '<div class="callout">' + html + '</div>'; }

  var cover = '<section class="cover"><img class="mark" src="' + glow + '" alt="">' +
    '<h1>Omega Maximus</h1><p class="lede">The editor maximum: from a street address to a priced design and a permit set, on the parcel and the aerial photo, in one place.</p>' +
    '<div class="stats">' +
      '<div><b>' + builds.length + '</b><span>guided builds,<br>planned on the server</span></div>' +
      '<div><b>' + short(run.installed) + '</b><span>installed, priced off<br>the drawing by Run</span></div>' +
      '<div><b>' + (f.sheetCount || 12) + ' sheets</b><span>in the permit set,<br>from the same drawing</span></div>' +
    '</div><p class="foot">ClearSky-OMEGA · Omega Maximus · Guide · October 2026</p></section>';

  var p2 = page('Omega Maximus', '<h1>From an address to a permit set</h1>' +
    '<p>Omega Maximus is the full site editor. You type an address, set the lot line from the county\'s parcel, mark what is in the way, and let a guided build lay out the equipment, then put it down where you want it. Run prices the drawing and works out the value stack and the IRR on the server. Outputs turns the same drawing into a permit set, a one-line, a bill of materials and a 3D view, and Save puts it in your workspace as a project.</p>' +
    '<p>This guide walks one site from start to finish: a warehouse on 51st Avenue in west Phoenix, ' + esc(acres) + ' acres on Maricopa County\'s parcel layer.</p>' +
    cards([['Find', 'Type the address. The editor opens on the block around it, on the aerial photo.'], ['Lot line', 'Show the county\'s parcel lines and use the parcel as the lot line.'],
      ['Mark', 'Draw what is in the way as an obstruction. Builds keep clear of it.'], ['Build', 'Pick a guided build. It comes in hand on clear ground: put it down where you want it.'],
      ['Run', 'Installed cost, value stack and IRR, from the server.'], ['Hand over', 'Permit set, one-line, BOM and 3D. Save it, send it to funding.']]) +
    shot('10-site', 'The site in this guide, built: the warehouse marked as an obstruction (red), a ' + esc(take.kw) + ' kW / ' + esc(take.kwh) + ' kWh battery in the yard to the north, and ' + esc(take.chargers) + ' fast chargers (' + esc(take.chargerKw) + ' kW in all) on the lot along 51st Avenue. The takeoff on the right counts what is on the drawing. Imagery: ' + esc(f.imagery || '') + '.', 'wide'));

  var p3 = page('Step 1 · Find the site', '<h1>Find the site</h1><div class="two narrowpic"><div>' +
    '<p>Open Omega Maximus from your workspace: <b>Design › Omega Maximus</b>, or go to <b>/editor-v2</b>.</p>' +
    '<h3>New starts at the address</h3><p><b>New</b> opens a blank project on the <b>Site</b> tab with the cursor in <b>Site address</b>. Type the street address, or latitude, longitude, and press Enter or <b>Find on the map</b>.</p>' +
    '<p>The map moves there and opens on the block around the point, about 700 feet across, on the aerial photo, scaled to the latitude. The drawing is in feet from that point.</p>' +
    callout('Nothing is saved until you press <b>Save to workspace</b>. A drawing in progress is kept on this computer, and the editor offers it back if the tab closes.') +
    '</div><div>' + shot('01-address-panel', 'The Site tab.', 'panel') + '</div></div>' +
    shot('02-found', 'Find on the map: the block around ' + esc(SITE.address) + ', on the aerial photo (' + esc(f.imagery || '') + ').', 'wide'));

  var p4 = page('Step 2 · Set the lot line', '<h1>Set the lot line</h1>' +
    '<p><b>Show parcel lines</b>, beside Find on the map, draws the county\'s lot lines over the photo and looks up the parcel under the site point. The card names it: <b>APN ' + esc(parcel.apn) + ' · ' + esc(acres) + ' acres · ' + esc(parcel.county) + '</b>. It never shows the owner. The lines come from ' + SOURCES.length + ' public county and state parcel layers, and from Regrid where a workspace has it.</p>' +
    '<p><b>Use as site boundary</b> turns that parcel into the drawing\'s lot line and zooms to it. If the address point is not on the lot you want, move the map until that lot is in the middle and press <b>Look up at the map centre</b>.</p>' +
    '<div class="two">' + shot('03-parcel', 'Parcel lines on (yellow), and the card for the parcel under the address.') + shot('04-boundary', 'Use as site boundary: the lot line (blue), ' + esc(acres) + ' acres, and the view on the lot.') + '</div>' +
    callout('An assessor\'s line is a tax map, not a survey. The card and the status bar both say so: confirm it before you design to it.'));

  var p5 = page('Step 3 · Mark what is in the way', '<h1>Mark what is in the way</h1>' +
    '<p>A guided build cannot see the photo. Draw anything it must not sit on with <b>Obstruction</b> in the Site group: click its corners, and Enter closes it. A building, a pond, an easement. <b>Setback</b> and <b>Fence</b> draw the other limits.</p>' +
    '<p>The command line under the drawing takes points as well as clicks: <b>x,y</b> in feet from the site point, <b>@dx,dy</b> from the last point, or a distance and an angle (<b>40&lt;90</b>). The warehouse here was traced that way, from its outline in OpenStreetMap.</p>' +
    shot('05-obstruction', 'The warehouse marked as an obstruction (red): no build will be placed on it. Imagery: ' + esc(f.imagery || '') + '.', 'wide'));

  var p6 = page('Step 4 · Pick a guided build', '<h1>Pick a guided build</h1>' +
    '<p><b>Does this site work?</b> on the Site tab asks the first question. <b>Yes</b> opens the guided builds. <b>No</b> keeps the drawing and records what is in the way, in your words. Every build is also on the ribbon, on every tab.</p>' +
    '<div class="two">' + shot('06-choose', 'Yes, build it: the eight builds.') + shot('07-bess-form', 'BESS build: the arrangement, the battery kW and the hours.') + '</div>' +
    '<table class="list">' + builds.map(function (b) { return '<tr><td>' + esc(b[0]) + '</td><td>' + esc(b[1]) + '</td></tr>'; }).join('') + '</table>' +
    '<p class="small">The plan is made on the server from the lot line, the obstructions and the numbers in the form. Nothing about how a build is laid out runs in the browser.</p>');

  var p7 = page('Step 4 · Put it down', '<h1>Put it where you want it</h1>' +
    '<p><b>Place on the site</b> hands you the build, laid out as the server planned it, on the clear ground nearest the middle of your view: inside the lot line, clear of the obstructions and of anything already placed. It follows the mouse a grid step at a time. <b>R</b>, or a right-click, turns it a quarter turn. A <b>click</b> puts it down where it is; <b>Enter</b> puts it on the clear spot it was offered; <b>Esc</b> puts it away and nothing is drawn.</p>' +
    '<div class="two">' + shot('08-bess-held', 'In hand: the BESS build on the clear ground it was offered in the yard north of the warehouse (dashed).') +
      shot('08-bess-placed', 'Enter put it there: ' + esc(parts(f.bessParts)) + ', with the conduit between them.') + '</div>' +
    '<div class="two">' + shot('09-dcfc-held', 'The DCFC build moved by hand to the frontage on 51st Avenue and turned with R to run along it. The faint outline is the spot it was offered.') +
      shot('09-dcfc-placed', 'A click put it down: ' + esc(parts(f.dcfcParts)) + '.') + '</div>' +
    callout('The outline turns <b>red</b> when a unit would stand on something already drawn: a building, an array table, other equipment. You can still put it down, and the status bar says so: drag it clear, or <b>Undo</b>.') +
    '<p class="small">Put down, the build is one group and selected: drag it to move it. <b>View › Icons</b>, on here, draws each unit as Site Map\'s icon on its footprint, with its name beside it, in short form (XFMR, SWGR, POI) when space is tight; no name is drawn over another. Aerial imagery: ' + esc(f.imagery || '') + '.</p>');

  var linesHtml = run.lines.map(function (l) { return '<tr><td>' + esc(l.name) + '</td><td class="r">$' + esc(l.amount) + '</td></tr>'; }).join('');
  var streamsHtml = run.streams.map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td class="r">$' + esc(s.amount) + ' / yr</td><td class="tier">' + esc(s.tier) + '</td></tr>'; }).join('');
  var irrLine = run.noIrr ? 'On these streams the project does not return its cost within the term, so Run shows <b>no IRR</b> and says why, with the NPV' + (run.npv ? ' ($' + esc(run.npv) + ')' : '') + (run.payback ? ' and a simple payback of ' + esc(run.payback) + ' years' : '') + ' beside it.'
    : 'The IRR is <b>' + esc(run.irr) + '</b>, with the NPV and the payback beside it.';
  var p8 = page('Step 5 · Run', '<h1>Run</h1><div class="two run"><div>' +
    '<p><b>Run</b> prices the drawing on the platform\'s cost engine, the same one Site Map\'s Run uses, and works out the value stack and the IRR on the server. Nothing is priced in the browser. The answer opens in <b>Analyze</b>.</p>' +
    '<h3>What it costs</h3><p>Installed estimate <b>$' + esc(run.installed) + '</b>:</p><table class="nums">' + linesHtml + '</table>' +
    '<h3>What it earns</h3><table class="nums">' + streamsHtml + '</table>' +
    '<p>Gross <b>$' + esc(run.gross) + '</b> a year; the owner keeps <b>$' + esc(run.keeps) + '</b>. ' + irrLine + '</p>' +
    callout('Every figure is a screening estimate, not a quote, and says so. Each stream is marked <b>computed</b> (from the tariff), <b>published</b> or <b>planning</b> (a lead until the programme\'s own terms replace it). The tariff is a planning rate for the ZIP until the customer\'s bill is imported. Change the drawing and the results are marked stale: Run again.') +
    '<p class="small">Project Intelligence scores the project from the drawing: <b>' + esc(run.decision) + ' · ' + esc(run.score) + ' / 100</b> here, with what is still missing listed under it.</p>' +
    '</div><div>' + shot('11-run-cost', 'Analyze: the cost estimate and the value stack.', 'panel') + shot('11-run-irr', 'Analyze: the IRR, or why there is none.', 'panel') + '</div></div>');

  var p9 = page('Step 6 · Outputs', '<h1>Outputs</h1><div class="two run"><div>' +
    '<p><b>Outputs</b> turns the same drawing into what you hand over:</p>' +
    '<table class="list"><tr><td>Permit set + plot plan</td><td>' + esc(f.sheetCount || 12) + ' sheets: cover, site plan, equipment, single-line, schedules, placards, grounding and the checks. Preview, PDF or DXF.</td></tr>' +
    '<tr><td>One-line</td><td>Sheet E-002 on its own, from the placed equipment.</td></tr>' +
    '<tr><td>Bill of materials</td><td>The placed equipment and conduit, and <b>Request a quote in Logic</b>.</td></tr>' +
    '<tr><td>Drawing file</td><td>PNG, PDF or DXF of the linework; the whole project as a file, and Import to open one.</td></tr>' +
    '<tr><td>Checks</td><td>What the set could not fill, to review. A blank stays blank; nothing is invented.</td></tr>' +
    '<tr><td>Hand off</td><td>The same saved project, opened in OMEGA Prime, in Logic, or pushed to funding.</td></tr></table>' +
    '<p>Under <b>Electrical and sheet details</b> you add the utility, the service and the names that go in the title block; under <b>Sheet size and aerial photo</b>, the paper and whether the photo sits under the site plan.</p>' +
    '</div><div>' + shot('12-outputs', 'The Outputs panel.', 'tall') + '</div></div>');

  var p10 = page('Step 6 · The set, the one-line and 3D', '<h1>The permit set, the one-line and 3D</h1>' +
    shot('13-permit', 'The permit set\'s site plan, on the USGS photo. Previous and Next page through the sheets; Export PDF writes the whole set.', 'wide') +
    '<div class="two">' + shot('14-sld', 'The one-line (E-002), drawn from the placed equipment.') + shot('15-3d', '3D: the site in place on the photo. Close returns to the plan.') + '</div>');

  var p11 = page('Save, reopen and fund', '<h1>Save, reopen and fund</h1>' +
    '<p><b>Save to workspace</b> stores the drawing as a project in your workspace, under the name in the header. A priced Run goes with it: the installed estimate becomes the project\'s capex (' + (f.saved && f.saved.capex ? '$' + Number(f.saved.capex).toLocaleString('en-US') : '') + ' here), with the battery size, the incentives and the year-one revenue, so the workspace shows the same figures Run did. <b>Open</b> lists the workspace\'s projects. <b>Save here</b> keeps a copy on this computer only.</p>' +
    shot('16-saved', 'Saved to workspace.', 'wide strip') +
    '<div class="two"><div><p>The <b>Funding</b> tab scores the project from the drawing, with the same score the financing marketplace uses, and says whether it clears the pursue line. <b>Send to funding</b> submits it to the marketplace, after you confirm on the page.</p>' +
    callout('The drawing is the source of truth. Run, Outputs and Funding all read the one drawing: change it, and Run again before you hand anything over.') + '</div><div>' + shot('17-funding', 'The Funding tab.', 'panel') + '</div></div>');

  var p12 = page('Plan and price', '<h1>Plan and price</h1><div class="two"><div>' +
    '<p>Omega Maximus is a module: <b>$1,299 a month</b>. A workspace holds it when:</p>' +
    '<ul><li>its package includes Omega Maximus;</li><li>it is on an Enterprise plan or a trial;</li><li>a Field or Pro plan adds it with <b>Opt in</b> on the Modules page, billed monthly beside the plan.</li></ul>' +
    '<p>A workspace without it sees the price and <b>Opt in</b> instead of the editor. Site Map stays on every plan, and every Maximus door on the server asks the same question, so nothing is open in the editor that the server would refuse.</p>' +
    '<h3>What it is not, yet</h3><ul><li>Every figure is a screening estimate, not a quote.</li><li>The site screen is not in Run yet, so Project Intelligence leaves out the site-quality points.</li><li>Cut and fill are reported only where USGS elevation loads.</li><li>Fleet operations and the customer value-stack report are not built.</li></ul>' +
    '</div><div>' + shot('18-lock', 'What a workspace without Omega Maximus sees.') + '</div></div>');

  var css = '@page{size:Letter;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}' +
    'body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#23364a;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.page,.cover{width:8.5in;height:11in;position:relative;overflow:hidden;page-break-after:always;break-after:page}' +
    '.cover{background:radial-gradient(ellipse at 50% 32%,#2a4a62 0%,#15283a 45%,#0e1b29 100%);color:#fff;text-align:center;padding-top:2.35in}' +
    '.cover .mark{width:2.75in;height:2.75in;display:block;margin:0 auto;border-radius:2px}' +
    '.cover h1{font-size:38px;margin:.42in 0 .14in;font-weight:700;letter-spacing:-.01em;color:#fff}' +
    '.cover .lede{font-size:15.5px;line-height:1.5;color:#dbe6f0;width:5.9in;margin:0 auto}' +
    '.cover .stats{display:flex;gap:.18in;justify-content:center;margin-top:.45in}' +
    '.cover .stats div{width:2.15in;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);border-radius:10px;padding:.16in .1in}' +
    '.cover .stats b{display:block;font-size:26px;letter-spacing:-.01em}.cover .stats span{display:block;margin-top:6px;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#cfdbe6;line-height:1.55}' +
    '.cover .foot{position:absolute;left:0;right:0;bottom:.7in;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#b9c8d6}' +
    '.band{height:.46in;background:#15283a;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 .14in 0 .6in;font-size:11px;letter-spacing:.1em;text-transform:uppercase}' +
    '.band img{height:.34in;width:.34in;border-radius:3px}' +
    '.content{padding:.42in .6in .5in}.num{position:absolute;right:.6in;bottom:.38in;font-size:10px;color:#8796a5}' +
    'h1{font-size:25px;color:#15283a;margin:0 0 .14in;letter-spacing:-.01em}h3{font-size:14px;color:#15283a;margin:.16in 0 .05in}' +
    'p,li{font-size:12.5px;line-height:1.55;margin:0 0 .1in}ul{margin:0 0 .1in;padding-left:.22in}p.small{font-size:11px;color:#55677a}' +
    '.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:.08in;margin:.16in 0 .2in}' +
    '.card{background:#f2f5f8;border:1px solid #dde4eb;border-radius:8px;padding:.1in .09in}.card .n{color:#2f8a5b;font-size:12px}' +
    '.card h4{margin:.03in 0 .04in;font-size:12.5px;color:#15283a}.card p{font-size:10.5px;line-height:1.4;margin:0}' +
    '.shot{margin:.12in 0;background:#e9edf1;border-radius:8px;padding:.12in}.shot img{width:100%;display:block;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.18)}' +
    '.shot.wide{margin-left:-.6in;margin-right:-.6in;border-radius:0;padding:.14in .6in}' +
    '.shot.strip{padding:.1in .6in}.shot.tall img{max-height:7.3in;width:auto;max-width:100%;margin:0 auto}' +
    'figcaption{font-size:10.5px;line-height:1.45;color:#5c6d7e;margin-top:.07in}' +
    '.two{display:grid;grid-template-columns:1fr 1fr;gap:.25in;align-items:start}.two.run{grid-template-columns:1.12fr .88fr}.two.narrowpic{grid-template-columns:1.25fr .75fr}' +
    '.shot.panel img{max-height:3.6in;width:auto;max-width:100%;margin:0 auto}.two .shot{margin:.06in 0}' +
    '.callout{border-left:4px solid #2f8a5b;background:#eef6f1;padding:.1in .14in;margin:.12in 0;font-size:12px;line-height:1.5;border-radius:0 6px 6px 0}' +
    'table{border-collapse:collapse;width:100%;margin:.04in 0 .1in;font-size:11.5px}td{padding:4px 6px;border-bottom:1px solid #e1e7ed;vertical-align:top}' +
    'table.list td:first-child{font-weight:700;color:#15283a;white-space:nowrap;width:1.45in}td.r{text-align:right;white-space:nowrap}td.tier{color:#2f8a5b;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em}';
  return '<!doctype html><html><head><meta charset="utf-8"><title>Omega Maximus — Guide</title><style>' + css + '</style></head><body>' +
    cover + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p10 + p11 + p12 + '</body></html>';
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    var got = await capture(browser), f = got.facts;
    assert(f.parcel && f.parcel.ok && f.parcel.apn, 'the county answered for the parcel: ' + JSON.stringify(f.parcel));
    fs.writeFileSync(path.join(SHOTS, 'facts.json'), JSON.stringify(f, null, 2));
    var r = readRun(f), t = readTakeoff(f);
    assert(r.installed && r.lines.length >= 2 && r.streams.length >= 1, 'Run\'s figures were read: ' + JSON.stringify(r));
    assert(t.kw && t.chargers, 'the takeoff was read: ' + JSON.stringify(t));
    if (CAPTURE_ONLY) { console.log('captured ' + Object.keys(got.shots).length + ' shots and facts.json in ' + SHOTS); return; }
    var img = {}; Object.keys(got.shots).forEach(function (k) { img[k] = uri(got.shots[k]); });
    var ctx = await browser.newContext(), doc = await ctx.newPage();
    await doc.setContent(guideHtml(img, f), { waitUntil: 'load' });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await doc.pdf({ path: OUT, format: 'Letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    var pages = await doc.evaluate(function () { return document.querySelectorAll('.page,.cover').length; });
    console.log('Omega Maximus guide: ' + pages + ' pages, ' + Object.keys(got.shots).length + ' screenshots of the real editor (' + SHOTS + '); APN ' + f.parcel.apn +
      ', installed $' + r.installed + '; written ' + path.relative(ROOT, OUT) + ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
