#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/guides/site-map-level-2.js — the Site Map guide to trenching both
   ways from the panel in the Level 2 build, as a PDF with screenshots.

   It runs the REAL Level 2 build in Chromium, the way render-editor-plan.js
   boots the editor (the repo served from a local port, the Firebase compat
   surface replaced offline, the package endpoints answered by the real
   projection), clicking the canvas and pressing the keys a designer would:
   meter, feed run, panel, the first branch trench and its chargers, T, the
   second trench off the panel with a bend, its chargers, done. Every
   screenshot is of that run, so a guide can never show a screen the editor
   does not draw; the script asserts the build's state after each step.

     node scripts/guides/site-map-level-2.js                 writes guides/editor/Site-Map-Level-2-Two-Trenches.pdf
   (served: https://silmarillion.clearskyomega.com/guides/editor/Site-Map-Level-2-Two-Trenches.pdf;
   guides/editor/ is the editor's own guides, built here, not by build.js,
   so tguides.js and the kit, which judge guides/*.pdf, leave it alone)
     node scripts/guides/site-map-level-2.js --out FILE.pdf  somewhere else
     node scripts/guides/site-map-level-2.js --shots DIR     keep the screenshots

   It is not part of build.js (whose guides are the Omega Logic apps, taken
   from the sandboxes and held by tguides.js): the editor has no sandbox, so
   this guide is retaken by running this script after a change to the build. */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('../_lib/firestore-double');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var M = require('../../api/_lib/modules'), X = require('../../api/_lib/package-access'), B = require('../../api/_lib/pricebook');
var OFFER = require('../../api/offerings').view(B.proposed(), 'proposed');
var PW = (function () { try { return require.resolve('playwright'); } catch (e) { return process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright'; } })();
var chromium = require(PW).chromium;
var CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : chromium.executablePath();
var ROOT = path.join(__dirname, '..', '..');
function arg(k, d) { var i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
var OUT = path.resolve(arg('--out', path.join(ROOT, 'guides', 'editor', 'Site-Map-Level-2-Two-Trenches.pdf')));
var SHOTS = path.resolve(arg('--shots', path.join(os.tmpdir(), 'omega-site-map-level-2')));

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
var DAY = 86400000;
/* a paid EV starter: the Level 2 build and Omega Design are on it */
var MODULES = M.starters().ev.slice(); if (MODULES.indexOf('lite') < 0) MODULES.push('lite');
var VIEW = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 30 * DAY, modules: MODULES }, { status: 'active' }, { role: 'owner', status: 'active' });

/* the Firebase compat surface the editor touches, offline (as render-editor-plan.js) */
function fixture() {
  var user = { uid: 'guide-user', email: 'designer@packaging.example', emailVerified: true, displayName: 'Guide Fixture', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? { packaged: true, packagingState: 'paid', modules: ['lite'] } :
      /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Packaging preview', status: 'active', domains: [location.hostname] } :
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
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'packaging.example', name: 'Packaging preview', status: 'active' } };
  window.alert = function () {};
}

/* ── the guide's words ─────────────────────────────────────────────── */
var TITLE = 'Site Map · Level 2 build', SUB = 'Trench both ways from the panel: a second trench, drawn point by point, each one dug once. ClearSky-OMEGA';
function guideHtml(img) {
  function fig(name, cap) { return '<figure><img src="' + img[name] + '"><figcaption>' + cap + '</figcaption></figure>'; }
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + TITLE + '</title><style>'
    + 'body{font:10.5pt/1.5 "Liberation Sans",Arial,sans-serif;color:#1c2b36;margin:0}'
    + 'h1{font-size:19pt;color:#0f2e3f;margin:0 0 4px;letter-spacing:-.2px}h2{font-size:12.5pt;color:#0f2e3f;margin:18px 0 6px;page-break-after:avoid}'
    + 'p{margin:0 0 8px}.lead{font-size:11pt;color:#34495e}'
    + 'figure{margin:8px 0 14px;page-break-inside:avoid}figure img{width:100%;border:1px solid #c9d6de;border-radius:6px;display:block}'
    + 'figcaption{font-size:8.8pt;color:#5a7280;margin-top:5px}'
    + '.step{display:flex;gap:10px;align-items:flex-start;margin:10px 0 4px;page-break-after:avoid}'
    + '.n{flex:none;width:24px;height:24px;border-radius:50%;background:#0f2e3f;color:#fff;font-weight:700;text-align:center;line-height:24px;font-size:11pt}'
    + '.step h2{margin:2px 0 0}'
    + 'kbd{font:9.5pt "Liberation Mono",monospace;background:#eef3f6;border:1px solid #c9d6de;border-bottom-width:2px;border-radius:4px;padding:0 5px}'
    + '.break{page-break-before:always}.tips{background:#f3f7f9;border-left:4px solid #0f2e3f;padding:8px 12px;margin:12px 0}.tips p{margin:0 0 5px}'
    + 'ul{margin:0 0 8px 18px;padding:0}li{margin:0 0 4px}'
    + '</style></head><body>'
    + '<h1>Trench both ways from the panel</h1>'
    + '<p class="lead">A Level 2 panel on a wall often feeds stalls to its left <em>and</em> its right, or a second row behind the first. The build now draws a second trench off the first one, point by point, so the two go their own way from the panel. Each trench is dug once and nothing overlaps; every charger’s conduit follows its own trench back to the panel, and the trench total counts each excavation once.</p>'
    + '<p>This guide runs one job from the Build tab to the finished drawing. Keys: <kbd>Enter</kbd> finishes a trench, <kbd>Backspace</kbd> removes its last point, <kbd>T</kbd> starts another trench, <kbd>Esc</kbd> backs out of that second trench. A click on any conduit shows the trench it rides, with points to drag.</p>'

    + '<div class="step"><div class="n">1</div><h2>Start the Level 2 build</h2></div>'
    + '<p>Build tab › <strong>Level 2</strong>. Choose the charger model, how many, and where the service starts, then <strong>Start Placing</strong>. This job has four chargers.</p>'
    + fig('dialog', 'The Level 2 dialog. Four chargers, an existing meter bank as the start.')

    + '<div class="step"><div class="n">2</div><h2>Place the meter, draw the feed, place the panel</h2></div>'
    + '<p>Click the map to drop the meter bank. Draw the feed run to where the outdoor panel goes (click points, <kbd>Enter</kbd>), then click on that run to place the panel. The guide panel on the right tracks each step.</p>'
    + fig('panel', 'The meter, the interior feed (yellow) and the outdoor panel on its end. Next: the branch trench.')

    + '<div class="break"></div>'
    + '<div class="step"><div class="n">3</div><h2>Draw the first trench and drop the chargers on it</h2></div>'
    + '<p>Draw the branch trench from the panel along the first row of stalls, press <kbd>Enter</kbd>, then click on the trench to drop each charger. A click past the end extends the trench to that stall.</p>'
    + fig('first', 'The first trench heads east from the panel with two chargers on it. Two left to place.')

    + '<div class="step"><div class="n">4</div><h2>Press T for another trench</h2></div>'
    + '<p>Press <kbd>T</kbd>, or click <strong>+ Draw another trench</strong> in the guide panel. Move the mouse toward the panel: a ring shows where the new trench will begin. The first click always lands on the trench already drawn — at the panel, or anywhere along it — never beside it.</p>'
    + fig('ring', 'After T the guide panel explains the second trench; the cursor is over the panel.')
    + fig('ringClose', 'Close up: the ring on the panel is where the second trench will begin.')

    + '<div class="break"></div>'
    + '<div class="step"><div class="n">5</div><h2>Route it, with bends, and press Enter</h2></div>'
    + '<p>Click the panel, then each bend along the way. <kbd>Backspace</kbd> takes the last point back; <kbd>Esc</kbd> or <strong>Back to chargers</strong> drops the whole draft. <kbd>Enter</kbd> files the trench.</p>'
    + fig('draft', 'The second trench drawn south from the panel, then west: three points, still a draft (the guide panel counts them).')
    + fig('draftClose', 'Close up: the draft leaves the panel, turns, and runs along the second row. Enter files it.')

    + '<div class="step"><div class="n">6</div><h2>Drop the rest of the chargers on the new trench</h2></div>'
    + '<p>Click on either trench to place the remaining chargers. Each one’s conduit follows the trench it sits on back to the panel. The build finishes on its own when the last charger is down.</p>'
    + fig('done', 'Four chargers on two trenches leaving the same panel. Nothing overlaps, nothing is dug twice.')

    + '<div class="break"></div>'
    + '<div class="step"><div class="n">7</div><h2>Move a trench after it is drawn</h2></div>'
    + '<p>Clicked the chargers first and the trench went the wrong way? Click any conduit on that trench: the trench\u2019s own points appear. Drag a point, or drag a faint midpoint to add a bend, and every conduit laid in that trench follows. Double-click a point to remove it, <kbd>Esc</kbd> to finish, undo takes it back.</p>'
    + fig('handles', 'A click on a conduit shows the trench it rides: its points, and a faint midpoint on each segment.')
    + fig('dragged', 'The midpoint dragged into a bend. Both chargers\u2019 conduits moved with the trench: one line, no ghost. Open a trench whose conduits were dragged apart one by one and they are laid back on it.')
    + '<div class="break"></div>'
    + '<div class="step"><div class="n">8</div><h2>What the totals say</h2></div>'
    + '<p>The legend counts the trench as excavation: each drawn trench once, the first trench only as far as the second one taps it, and the conduit inside them separately. The conduit schedule and the BOM read the same numbers.</p>'
    + fig('legend', 'The legend after the build: the branch conduit runs, and the trench dug once.')

    + '<div class="tips"><p><strong>Good to know</strong></p>'
    + '<ul><li>A charger clicked <em>off</em> the trench still gets a straight spur from the nearest point. Use <kbd>T</kbd> when the route has to bend before the first stall, or should leave from a particular point.</li>'
    + '<li>The second trench can start anywhere on the first one, not only at the panel: a tee off the middle of a row works the same way.</li>'
    + '<li>The surface button (in-ground or sawcut concrete) applies to the trench being drawn.</li>'
    + '<li><kbd>Esc</kbd> while drawing the <em>second</em> trench goes back to the chargers; while drawing the first trench it cancels the build, keeping what was placed.</li>'
    + '<li>A charger clicked across the building makes a straight spur. Click that conduit and drag the trench\u2019s points round the building; both chargers\u2019 conduits follow, and there is only ever one trench for that side.</li>'
    + '<li>The same controls are in the DCFC build.</li></ul></div>'
    + '</body></html>';
}

function dataUri(file) { return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'); }
var MARK = dataUri(path.join(ROOT, 'icons', 'omega-180.png'));
var HEADER = '<div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;width:100%;height:0.8in;margin:0 0 0.15in;background:#0f2e3f;color:#fff;display:flex;align-items:center;gap:12px;padding:0 0.55in;box-sizing:border-box;font-family:Liberation Sans,Arial,sans-serif">'
  + '<img src="' + MARK + '" alt="" style="width:46px;height:46px;border-radius:11px;display:block"><div><div style="font-size:19pt;font-weight:700;letter-spacing:-.2px;line-height:1.1">' + TITLE + '</div><div style="font-size:9.2pt;color:#b9d3dc;margin-top:3px">' + SUB + '</div></div></div>';
var FOOTER = '<div style="width:100%;text-align:center;font:8pt Liberation Sans,Arial,sans-serif;color:#5a7280;padding-bottom:6px">ClearSky Energy Solutions &nbsp;·&nbsp; silmarillion.clearskyomega.com &nbsp;·&nbsp; page <span class="pageNumber"></span> of <span class="totalPages"></span></div>';

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || CHROME });
  try {
    var context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', deviceScaleFactor: 2 });
    await context.addInitScript(fixture);
    await context.route('**/*', function (route) {
      var req = route.request(), url = new URL(req.url());
      function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
      if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
      if (url.pathname === '/api/package-access') return json(200, VIEW);
      if (url.pathname === '/api/offerings') return json(200, OFFER);
      if (url.pathname === '/api/plan-change' && req.method() === 'GET') return json(503, { error: 'Price book not seeded' });
      if (url.pathname.indexOf('/api/') === 0) return json(503, { error: 'Offline producer' });
      return route.continue();
    });
    var page = await context.newPage(), errors = [];
    page.on('pageerror', function (e) { errors.push(e.message); });
    await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(function () { firebase.auth().currentUser = window.__user; window.__listeners.forEach(function (fn) { fn(window.__user); }); });
    await page.waitForFunction(function () { return window.OmegaCaps && OmegaCaps.packageAccess() && OmegaCaps.packageAccess().modules.length && !document.getElementById('omega-editor-gate'); });
    await page.waitForTimeout(2500);

    /* a quiet sheet: the compass, the coordinate and terrain readouts and the
       results badge are not what this guide teaches; a working scale so the
       legend prints feet (a calibrated photo sets the same field) */
    await page.evaluate(function () {
      ['rb-op-o2-coords', 'rb-op-tl-key'].forEach(function (id) { var b = document.getElementById(id); if (b && b.getAttribute('aria-pressed') === 'true') b.click(); });
      var oc = document.getElementById('oc-bar'); for (var n = oc; n; n = n.parentElement) { if (getComputedStyle(n).position === 'fixed' || getComputedStyle(n).position === 'absolute') { n.style.display = 'none'; break; } }
      var badge = document.getElementById('rr-mapbadge'); if (badge) badge.style.display = 'none';
      Array.prototype.forEach.call(document.querySelectorAll('div,span'), function (d) { if (d.children.length === 0 && /^TERRAIN KEY$/i.test(d.textContent.trim())) { for (var m = d; m; m = m.parentElement) { if (getComputedStyle(m).position === 'fixed' || getComputedStyle(m).position === 'absolute') { m.style.display = 'none'; break; } } } });
      Array.prototype.forEach.call(document.querySelectorAll('div'), function (d) { if (d.children.length === 0 && /^Preview — array envelopes/.test(d.textContent.trim())) { for (var m = d; m; m = m.parentElement) { if (getComputedStyle(m).position === 'fixed' || getComputedStyle(m).position === 'absolute') { m.style.display = 'none'; break; } } } });
      S.pxPerFt = 4;
      rbTab('build');
    });
    await page.waitForTimeout(300);

    var state = function () { return page.evaluate(function () { var d = _dcfcState(); return { active: d.active, phase: d.phase, level2: d.level2, left: d.chargersLeft, runs: (S._trenches || []).length, mode: S.mode, draw: (typeof _dcfcDrawState === 'function' && _dcfcDrawState()) ? { n: _dcfcDrawState().pts.length, another: !!_dcfcDrawState().another } : null }; }); };
    async function expect(label, fn) { var s = await state(); assert(fn(s), label + ': ' + JSON.stringify(s)); }
    var sc = await page.locator('#sc').boundingBox();
    var shot = { canvas: { x: sc.x, y: sc.y, width: Math.min(sc.width, 1280 - sc.x), height: Math.min(sc.height, 900 - sc.y) } };
    async function snap(name, clip) { var file = path.join(SHOTS, name + '.png'); await page.waitForTimeout(250); await page.screenshot({ path: file, clip: clip || undefined }); return file; }
    async function click(x, y) { await page.mouse.move(x, y); await page.waitForTimeout(60); await page.mouse.click(x, y); await page.waitForTimeout(180); }

    /* 1. the dialog */
    /* the ribbon's own Level 2 button where it is on screen (the Build tab);
       the dialog itself is the same either way */
    var l2 = page.locator('button[onclick="_guidedPick(\'l2\')"]'), opened = false;
    for (var i = 0; i < await l2.count(); i++) { if (await l2.nth(i).isVisible()) { await l2.nth(i).click(); opened = true; break; } }
    if (!opened) await page.evaluate(function () { openLevel2Build(); });
    await page.locator('#l2-modal').waitFor();
    await page.locator('#dcfc-count').fill('4');
    await page.locator('#dcfc-count').dispatchEvent('input');
    await page.waitForTimeout(200);
    var files = {};
    files.dialog = await snap('1-dialog');
    await page.locator('#l2-modal button[onclick="_l2StartPlacing()"]').click();
    await page.waitForTimeout(300);
    await expect('the build is placing the meter', function (s) { return s.active && s.level2 && s.phase === 'poi' && s.mode === 'dcfcplace'; });

    /* 2. meter, feed, panel — page coordinates on the sheet */
    var meter = { x: 300, y: 440 }, panel = { x: 440, y: 440 };
    await click(meter.x, meter.y);
    await expect('the meter is down and the feed run is being drawn from it', function (s) { return s.phase === 'drawtrench' && s.draw && s.draw.n === 1; });
    await click(panel.x, panel.y);
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    await expect('the feed run is filed; place the panel', function (s) { return s.phase === 'placeon' && s.runs === 1; });
    await click(panel.x, panel.y);
    await expect('the panel is on the run; draw the branch trench', function (s) { return s.phase === 'drawtrench' && s.draw && s.draw.n === 1; });
    await page.mouse.move(1150, 760);
    files.panel = await snap('2-panel');

    /* 3. the first trench east, two chargers on it */
    await click(780, 440);
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    await expect('the first branch trench is filed', function (s) { return s.phase === 'placeon' && s.runs === 2 && s.left === 4; });
    await click(560, 440);
    await click(720, 440);
    await expect('two chargers on the first trench', function (s) { return s.phase === 'placeon' && s.left === 2 && s.runs === 2; });
    await page.mouse.move(1150, 760);
    files.first = await snap('3-first');

    /* 4. T, and the ring on the panel */
    await page.keyboard.press('t'); await page.waitForTimeout(200);
    await expect('T opens another trench', function (s) { return s.phase === 'drawtrench' && s.draw && s.draw.another && s.draw.n === 0; });
    await page.mouse.move(panel.x - 9, panel.y + 12); await page.waitForTimeout(200);
    var ring = await page.evaluate(function () { var d = _dcfcDrawState(); return d && d.tapPreview ? { x: Math.round(d.tapPreview.x), y: Math.round(d.tapPreview.y) } : null; });
    assert(ring, 'the ring shows where the first click lands: ' + JSON.stringify(ring));
    /* the cursor's own crosshair (an overlay) sits on the point being shown; off for the close-ups */
    async function crosshair(on) { await page.evaluate(function (on) { var c = document.getElementById('nn-crosshair'); if (c) c.style.display = on ? '' : 'none'; }, on); }
    await crosshair(false);
    files.ring = await snap('4-ring');
    files.ringClose = await snap('4-ring-close', { x: panel.x - 150, y: panel.y - 90, width: 300, height: 190 });
    await crosshair(true);

    /* 5. the second trench: the panel, south, then west — a draft */
    await click(panel.x - 9, panel.y + 12);
    await expect('the first point landed on the trench', function (s) { return s.draw && s.draw.another && s.draw.n === 1; });
    var tap = await page.evaluate(function () { var p = _dcfcDrawState().pts[0]; return { x: Math.round(p.x), y: Math.round(p.y) }; });
    await click(panel.x, 660);
    await click(200, 660);
    await expect('three points, still a draft', function (s) { return s.draw && s.draw.another && s.draw.n === 3 && s.runs === 2; });
    await page.mouse.move(1150, 760); await page.waitForTimeout(200); await crosshair(false);
    var draftPts = await page.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#dcfc-trenches polyline'), function (p) { return p.getAttribute('points'); }); });
    console.log('draft polylines: ' + JSON.stringify(draftPts));
    files.draft = await snap('5-draft');
    files.draftClose = await snap('5-draft-close', { x: 150, y: 380, width: 700, height: 330 });
    await crosshair(true);
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    await expect('Enter files the second trench and goes back to the chargers', function (s) { return s.phase === 'placeon' && s.runs === 3 && s.left === 2; });
    var spur = await page.evaluate(function () { var t = S._trenches[S._trenches.length - 1]; return { spurOf: t.spurOf, tapFt: t.spurTapFt, pts: t.pts.length }; });
    assert(spur.spurOf && spur.pts === 3, 'the second trench is a spur of the first: ' + JSON.stringify(spur));

    /* 6. the last two chargers on the new trench; the build finishes itself */
    await click(400, 660);
    await click(240, 660);
    await page.waitForTimeout(400);
    await expect('four chargers, the build is done', function (s) { return !s.active && s.left === 0 && s.runs === 3 && s.mode === 'select'; });
    var legs = await page.evaluate(function () {
      var runs = {}; (S._trenches || []).forEach(function (t) { runs[t.id] = t; });
      return S.conduits.filter(function (c) { return /EVSE/.test(c.label || ''); }).map(function (c) { return { run: c.evRun, spur: !!(runs[c.evRun] && runs[c.evRun].spurOf), ends: c.pts[c.pts.length - 1] }; });
    });
    assert(legs.length === 4 && legs.filter(function (l) { return l.spur; }).length === 2, 'two legs on each trench: ' + JSON.stringify(legs));
    legs.forEach(function (l) { assert(Math.abs(l.ends.x - tap.x) < 2 && Math.abs(l.ends.y - tap.y) < 2, 'every leg ends at the panel: ' + JSON.stringify(l.ends) + ' vs ' + JSON.stringify(tap)); });
    await page.mouse.move(1000, 200); await page.waitForTimeout(300);
    files.done = await snap('6-done');
    var totals = await page.evaluate(function () { return { trench: trenchTotals(), legend: (document.getElementById('legend') || document.querySelector('.legend, #legend-box') || {}).textContent || '' }; });
    assert(totals.trench.ft > 0, 'the trench total is dug: ' + JSON.stringify(totals.trench));

    /* 7. move a trench after it is drawn: click a leg on it, drag a point */
    var secondRun = await page.evaluate(function () { var t = S._trenches[S._trenches.length - 1]; return { id: t.id, pts: t.pts.length }; });
    /* on the stretch below the panel's label, where the legs of both chargers run */
    await page.mouse.click(panel.x, 590); await page.waitForTimeout(300);
    var trLayer = await page.evaluate(function () { var l = document.getElementById('trench-verts'); return l ? { forRun: l.getAttribute('data-for'), handles: l.querySelectorAll('[data-trv]').length } : null; });
    assert(trLayer && trLayer.forRun === secondRun.id && trLayer.handles === secondRun.pts, 'a click on a leg opens the trench handles: ' + JSON.stringify(trLayer));
    var histBefore = await page.evaluate(function () { return S.history.length; });
    await crosshair(false);
    files.handles = await snap('7-handles', { x: 150, y: 380, width: 700, height: 360 });
    /* the faint midpoint of the stretch from the panel, pulled east: the trench bends, the chargers stay */
    var ghost = await page.evaluate(function () { var gh = document.querySelector('#trench-verts [data-trmid="0"]'); return { x: +gh.getAttribute('cx'), y: +gh.getAttribute('cy') }; });
    var gx = ghost.x + sc.x, gy = ghost.y + sc.y;
    var sc7 = await page.locator('#sc').boundingBox();                /* the sheet's offset now: the ribbon moved it since the build began */
    var gx = ghost.x + sc7.x, gy = ghost.y + sc7.y;
    await page.mouse.move(gx, gy); await page.mouse.down(); await page.waitForTimeout(80);
    for (var gi = 1; gi <= 8; gi++) { await page.mouse.move(gx + 70 * gi / 8, gy); await page.waitForTimeout(40); }
    await page.mouse.up(); await page.waitForTimeout(400);
    var bent = await page.evaluate(function (id) { var t = S._trenches.filter(function (r) { return r.id === id; })[0]; var legs = S.conduits.filter(function (c) { return c.evRun === id; }); return { pts: t.pts.length, legs: legs.length, hist: S.history.length, through: legs.every(function (c) { return c.pts.some(function (q) { return Math.abs(q.x - t.pts[1].x) < 2 && Math.abs(q.y - t.pts[1].y) < 2; }); }) }; }, secondRun.id);
    assert(bent.pts === secondRun.pts + 1 && bent.legs === 2 && bent.through, 'the bend took both legs with it: ' + JSON.stringify(bent));
    assert(bent.hist === histBefore + 1, 'opening the trench wrote no undo step (its legs were on it); the drag wrote one: ' + histBefore + ' -> ' + bent.hist);
    await page.mouse.move(1150, 760); await page.waitForTimeout(250);
    files.dragged = await snap('7-dragged', { x: 150, y: 380, width: 700, height: 360 });
    await crosshair(true);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    /* 8. the legend, close up */
    await page.evaluate(function () { if (typeof hideBanner === 'function') hideBanner(); }); await page.waitForTimeout(150);
    var lb = await page.locator('#lgd').boundingBox(), legend = lb ? { x: lb.x, y: lb.y, w: lb.width, h: lb.height } : null;
    if (legend) {
      var pad = 6, lx = Math.max(0, legend.x - pad), ly = Math.max(0, legend.y - pad);
      files.legend = await snap('7-legend', { x: lx, y: ly, width: Math.min(legend.w + 2 * pad, 1280 - lx), height: Math.min(legend.h + 2 * pad, 900 - ly) });
    } else {
      files.legend = await snap('7-legend', shot.canvas);
    }
    assert(errors.length === 0, 'no page errors: ' + errors.join(' | '));

    /* the PDF */
    var img = {}; Object.keys(files).forEach(function (k) { img[k] = dataUri(files[k]); });
    var doc = await context.newPage();
    await doc.setContent(guideHtml(img), { waitUntil: 'load' });
    await doc.pdf({ path: OUT, format: 'Letter', printBackground: true, displayHeaderFooter: true, headerTemplate: HEADER, footerTemplate: FOOTER,
      margin: { top: '1.05in', bottom: '0.6in', left: '0.55in', right: '0.55in' } });
    console.log('Site Map Level 2 guide: ' + Object.keys(files).length + ' screenshots of the real build (' + SHOTS + '), trench ' + Math.round(totals.trench.ft) + ' ft dug once across ' + spur.pts + '-point second trench; written ' + path.relative(ROOT, OUT) + ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
