#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Jarvis reads a plan set (Blueprint to Build, Phase 5: "Jarvis does the
 * whole thing"): the site agent's MCP server (scripts/site-agent/server.js)
 * driving the FULL canonical editor.html over the Chrome DevTools Protocol,
 * the way a person's own Chrome is driven, signed in on an offline Firebase
 * stand-in.
 *
 * omega_read_plans hands the sample plan set (scripts/_lib/plan-fixture.js)
 * to Read Plans' own file input, the dialog reads each sheet through
 * /api/plan-read (the REAL library on the reader's canned answers; only the
 * model is stood in for) and checks them together; the tool returns the
 * review with the words each figure was read from and what the sheets
 * disagree on, and nothing is placed. omega_place_plans places exactly the
 * approved items as one undo step and refuses to place the same read twice;
 * omega_plans_changed reads the comparison after the drawing is edited.
 * pdf.js is the editor's cdnjs build, fetched once into a cache; without it
 * the check says so and stops.
 *   node scripts/render-agent-plans.js [--shots DIR]
 */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert'), cp = require('child_process');
var F = require('./_lib/firestore-double');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var X = require('../api/_lib/package-access'), EC = require('../api/_lib/editor-cost');
var P = require('../api/_lib/plan-read'), FX = require('./_lib/plan-fixture');
var ROOT = path.join(__dirname, '..');
var argShots = process.argv.indexOf('--shots'), output = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : path.join(os.tmpdir(), 'omega-agent-plans');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; }
function eq(a, b, label) { assert.deepEqual(a, b, label); count++; }

var PDFJS = { 'pdf.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdf.worker.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' };
function pdfjsCache() {
  var dir = path.join(os.tmpdir(), 'omega-pdfjs-3.11.174'), have = {};
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  Object.keys(PDFJS).forEach(function (f) {
    var file = path.join(dir, f);
    if (!fs.existsSync(file) || fs.statSync(file).size < 10000) { try { cp.execFileSync('curl', ['-sSfL', '--max-time', '60', '-o', file, PDFJS[f]], { stdio: 'ignore' }); } catch (e) {} }
    if (fs.existsSync(file) && fs.statSync(file).size > 10000) have[f] = fs.readFileSync(file);
  });
  return have['pdf.min.js'] && have['pdf.worker.min.js'] ? have : null;
}
var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

/* the Firebase compat surface the editor touches, offline; a packaged Omega
   Design workspace (the shape render-plan-read.js uses) */
function fixture() {
  window.__billing = { packaged: true, packagingState: 'paid', modules: ['lite'] };
  var user = { uid: 'agent-reader', email: 'designer@sunrise.example', emailVerified: true, displayName: 'Agent Reader', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? window.__billing : /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Sunrise Solar', status: 'active', domains: [location.hostname] } : /members\//.test(p) ? { role: 'owner', status: 'active' } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () { return Promise.resolve(snapshot(p)); }, onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; },
      set: function () { throw new Error('Unexpected fixture write: ' + p); }, update: function () { throw new Error('Unexpected fixture update: ' + p); },
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
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'sunrise.example', name: 'Sunrise Solar', status: 'active' } };
  window.alert = function () {};
  window.confirm = function () { return true; };
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  var pdfjs = pdfjsCache();
  if (!pdfjs) { console.log('render-agent-plans: pdf.js could not be fetched; nothing was checked.'); return; }
  var built = await FX.build(), answers = FX.answers(built.marks), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-agent-plans-')), pdfPath = path.join(dir, 'sample-plan-set.pdf');
  fs.writeFileSync(pdfPath, built.bytes);
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port, posted = [], unanswered = [];
  var view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 30 * 86400000, modules: ['lite'] }, { status: 'active' }, { role: 'owner', status: 'active' });
  /* the person's own Chrome, with its debugging port open on this machine */
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-agent-profile-'));
  var ctx = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME || chromium.executablePath(), args: ['--remote-debugging-port=0'], viewport: { width: 1440, height: 960 }, colorScheme: 'dark' });
  var errors = [];
  try {
    await ctx.addInitScript(fixture);
    await ctx.route('**/*', function (route) {
      var req = route.request(), url = new URL(req.url());
      function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
      if (url.hostname === 'cdnjs.cloudflare.com' && /pdf\.js\/3\.11\.174\//.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: pdfjs[path.basename(url.pathname)] });
      if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
      if (url.pathname === '/api/package-access') return json(200, view);
      if (url.pathname === '/api/package-catalog') return json(403, { error: 'Pricing is not enabled' });
      if (url.pathname === '/api/plan-change') return json(503, { error: 'Price book not seeded' });
      if (url.pathname === '/api/cost-rollup') return json(200, EC.rollup(req.postDataJSON()));
      if (url.pathname === '/api/plan-read') {
        var b = req.postDataJSON();
        if (b.action === 'check') return json(200, { ok: true, result: P.check(b.sheets.map(P.revive)) });
        if (b.action === 'changes') return json(200, { ok: true, result: P.changes(b.read, b.now) });
        posted.push(b.sheet.page);
        return json(200, { ok: true, cached: false, sheet: P.normalize(answers[((b.sheet.page - 1) % 3) + 1], { page: b.sheet.page }), today: { used: posted.length, of: 80 } });
      }
      if (url.pathname.indexOf('/api/') === 0) { unanswered.push(url.pathname); return json(503, { error: 'Offline producer' }); }
      return route.continue();
    });
    var page = ctx.pages()[0] || await ctx.newPage();
    page.on('pageerror', function (e) { errors.push(e.message); });
    await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(function () { firebase.auth().currentUser = window.__user; window.__listeners.forEach(function (fn) { fn(window.__user); }); });
    await page.waitForFunction(function () { return window.OmegaCaps && OmegaCaps.packageAccess() && OmegaCaps.packageAccess().modules.length && !document.getElementById('omega-editor-gate'); });
    await page.waitForTimeout(2000);

    /* the MCP server, pointed at this tab by its exact address and at the
       browser's local debugging port, as .mcp.json points it */
    var port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
    process.env.OMEGA_EDITOR_URL = page.url(); process.env.OMEGA_CDP_URL = 'http://127.0.0.1:' + port;
    var agent = require('./site-agent/server.js'), id = 0;
    async function tool(name, args) {
      var r = (await agent.respond({ id: ++id, method: 'tools/call', params: { name: name, arguments: args || {} } })).result;
      return { error: r.isError ? r.content[0].text : null, value: r.isError ? null : JSON.parse(r.content[0].text) };
    }

    /* read: the review, nothing placed */
    var before = await page.evaluate(function () { return { els: S.elements.length, shapes: (S.shapes || []).length, read: !!S.planRead }; });
    var rd = await tool('omega_read_plans', { path: pdfPath });
    ok(!rd.error, 'omega_read_plans answered ' + (rd.error || ''));
    var R = rd.value;
    eq(posted.sort(), [1, 2, 3], 'each of the three sheets went to the reader once');
    eq(R.sheets.map(function (s) { return [s.number, s.status]; }), [['E-001', 'done'], ['E-101', 'done'], ['E-601', 'done']], 'every sheet read, by its own number');
    eq([R.review.items.length, R.review.summary.placeable, R.review.items.filter(function (i) { return i.ticked; }).length], [13, 10, 9], 'thirteen items, ten that can be placed, nine ticked');
    var ess = R.review.items.filter(function (i) { return i.tag === 'ESS-1'; })[0];
    ok(ess && ess.model === 'XS-1290' && ess.rating.kwh === 1290 && ess.words && ess.sheets.length, 'the battery comes back with its model, its rating and the words it was read from');
    var kwh = R.review.facts.filter(function (f) { return f.fact === 'Battery energy'; })[0];
    ok(kwh && !kwh.sheetsAgree && kwh.alsoReadAs.length === 1 && kwh.alsoReadAs[0].value === 1290, 'the 1,200 vs 1,290 kWh disagreement is named with both sheets');
    ok(R.review.toCheck.some(function (i) { return /1,290 kWh/.test(i.text); }) && R.review.items.some(function (i) { return i.confidence === 'low' && !i.ticked; }), 'what to check, and the low-confidence read left unticked');
    ok(!/data:image|"box"/.test(JSON.stringify(R)) && /Place only what they approve/.test(R.next), 'no sheet image or box leaves the page; the next step is the person’s review');
    var after = await page.evaluate(function () { return { els: S.elements.length, shapes: (S.shapes || []).length, read: !!S.planRead }; });
    eq(after, before, 'reading placed nothing and wrote no read onto the project');
    await page.screenshot({ path: path.join(output, '01-review-read-by-the-agent.png') });

    /* place: exactly the approved items, once */
    var box = R.review.items.filter(function (i) { return i.kind === 'Junction box'; })[0];
    var approved = R.review.items.filter(function (i) { return i.ticked; }).map(function (i) { return i.index; });
    var bad = await tool('omega_place_plans', { items: [R.review.items.filter(function (i) { return !i.placeable; })[0].index] });
    ok(/Not items that can be placed/.test(bad.error || ''), 'a listed item cannot be placed');
    var pl = await tool('omega_place_plans', { items: approved });
    ok(!pl.error && pl.value.status === 'placed_unsaved' && pl.value.placed === 18, 'the nine approved items are placed: 18 units, unsaved ' + JSON.stringify(pl.error || pl.value.placed));
    var placed = await page.evaluate(function () { return { mine: S.elements.filter(function (e) { return e.planRead; }).length + (S.shapes || []).filter(function (s) { return s.planRead; }).length, v: S.planRead && S.planRead.v, box: (S.planRead.items || []).filter(function (it) { return it.kind === 'junction_box'; })[0] }; });
    ok(placed.mine === 18 && placed.v === 2 && box && placed.box.placed === 0, 'the drawing carries the 18 pieces from the read; the unapproved box was not placed');
    ok(/already on the drawing/.test((await tool('omega_place_plans', {})).error || ''), 'the same read is never placed twice');
    await page.evaluate(function () { OmegaPlanRead.close(); });
    await page.screenshot({ path: path.join(output, '02-placed-by-the-agent.png') });

    /* what changed, after the drawing is edited by hand */
    var same = await tool('omega_plans_changed');
    ok(!same.error && same.value.rows.filter(function (r) { return r.section === 'Placed from the plans' && r.status !== 'As read'; }).map(function (r) { return r.status; }).join() === 'Not placed', 'as placed, every placed item reads as read; the box is not placed');
    await page.evaluate(function () { var b = S.elements.filter(function (e) { return e.planRead && e.eqId === 'bess'; })[0]; b.bessKwh = 1500; b.bgbKwh = 1500; });
    var ch = await tool('omega_plans_changed'), row = ch.value.rows.filter(function (r) { return r.item === 'ESS-1'; })[0];
    ok(row && row.status === 'Changed' && /1,500 kWh/.test(row.drawing) && /1,290 kWh/.test(row.plans), 'the re-rated battery reads as changed, the plans’ figure beside the drawing’s');
    ok(/not an engineering judgement/.test(ch.value.basis), 'with the comparison’s basis');
    ok(!errors.length, 'no page errors ' + JSON.stringify(errors));
    ok(!unanswered.filter(function (p) { return /plan-read/.test(p); }).length, 'every plan-read call was answered');
  } finally { await ctx.close(); server.close(); }
  console.log('render-agent-plans: ' + count + ' checks passed; shots in ' + output);
}
run().then(function () { process.exit(0); }).catch(function (e) { console.error(e); server.close(); process.exit(1); });
