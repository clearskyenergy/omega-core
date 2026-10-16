#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The 3D Site Visualizer's Build player in the FULL canonical editor.html,
 * signed in on an offline Firebase stand-in, a packaged workspace holding
 * Omega Design and Omega Plans, on a desktop and a 390px phone.
 *
 * A small site is placed with the editor's own tools (Insert's addEl, the EV
 * tools' charger shapes, a DER solar block, a conduit run through
 * finishConduit), the Run prices it through the REAL roll-up, the 3D model
 * is built by the visualizer itself (three.js r128 from assets/vendor, the
 * version the page asks cdnjs for), and /api/build-sequence is answered by
 * the REAL library on the REAL roll-up, exactly as api/build-sequence.js
 * does (the endpoint's gate is held by scripts/tests/tbuildseq.js).
 *
 * Holds: the Build button sits on the visualizer's bar; the page sends the
 * Run's own quantities and what the model draws; played to the end, "in
 * place" IS the Run total to the cent; every step shows exactly its pieces
 * (nothing before its step, everything after it); Explode lifts the gear
 * and puts it back; the schedule and its CSV carry every step; closing puts
 * every piece back exactly as the visualizer drew it; a Refresh under the
 * player is noticed, never animated on a dead model; the bar fits a phone.
 * Fails on a page error after boot, or an /api/ call nobody answers.
 *   node scripts/render-build-sequence.js [--shots DIR]
 */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('./_lib/firestore-double');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var X = require('../api/_lib/package-access'), EC = require('../api/_lib/editor-cost'), ES = require('../api/_lib/editor-score'), BS = require('../api/_lib/build-sequence');
var ROOT = path.join(__dirname, '..'), THREE_JS = path.join(ROOT, 'assets/vendor/three-r128/three.min.js');
var argShots = process.argv.indexOf('--shots'), output = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : (process.env.BUILD_SEQ_SHOTS || path.join(os.tmpdir(), 'omega-build-sequence'));
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; }
function eq(a, b, label) { assert.deepStrictEqual(a, b, label); count++; }

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

/* the offline sign-in, the sample site and the model's pieces, shared with
   render-takeoff.js (scripts/_lib/editor-sample-site.js) */
var SITE = require('./_lib/editor-sample-site'), fixture = SITE.fixture, placeSite = SITE.placeSite, pieces = SITE.pieces;

/* A context on the offline fixture: the editor booted, the site placed and
   Run, the visualizer open and a little closer in. */
async function boot(browser, base, view, mode) {
  var posted = [], unanswered = [];
  var context = await browser.newContext({ viewport: { width: mode.w, height: mode.h }, colorScheme: 'dark', deviceScaleFactor: mode.name === 'phone' ? 2 : 1, acceptDownloads: true, reducedMotion: mode.calm ? 'reduce' : 'no-preference' });
  await context.addInitScript(fixture);
  await context.route('**/*', function (route) {
    var req = route.request(), url = new URL(req.url());
    function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
    if (url.hostname === 'cdnjs.cloudflare.com' && /three\.js\/r128\/three\.min\.js$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(THREE_JS) });
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/package-access') return json(200, view);
    if (url.pathname === '/api/package-catalog') return json(403, { error: 'Pricing is not enabled' });
    if (url.pathname === '/api/plan-change') return json(503, { error: 'Price book not seeded' });
    if (url.pathname === '/api/cost-rollup') { var cq = req.postDataJSON(); cq.vendorOrg = 'sunrise.example'; return json(200, EC.rollup(cq)); }
    if (url.pathname === '/api/editor-score') { var sb = req.postDataJSON(); return json(200, sb.action === 'prequal' ? ES.prequal(sb) : ES.interconnect(sb)); }
    if (url.pathname === '/api/build-sequence') {
      /* exactly what api/build-sequence.js does past its gate */
      var b = req.postDataJSON(), q = b.q || {};
      posted.push(JSON.parse(JSON.stringify(b)));
      q.vendorOrg = 'sunrise.example';
      return new Promise(function (r) { setTimeout(r, 250); }).then(function () { return json(200, BS.sequence(EC.rollup(q), q, b.build)); });
    }
    if (url.pathname.indexOf('/api/') === 0) { unanswered.push(url.pathname); return json(503, { error: 'Offline producer' }); }
    return route.continue();
  });
  var page = await context.newPage(), errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function () { firebase.auth().currentUser = window.__user; window.__listeners.forEach(function (fn) { fn(window.__user); }); });
  await page.waitForFunction(function () { return window.OmegaCaps && OmegaCaps.packageAccess() && OmegaCaps.packageAccess().modules.length && !document.getElementById('omega-editor-gate'); });
  await page.waitForTimeout(2000);
  await page.evaluate(function () { try { rbTab('home'); } catch (e) {} });
  var bootErrors = errors.length;

  /* the site, then the Run */
  await page.evaluate(placeSite);
  await page.waitForTimeout(300);
  await page.evaluate(function () { omegaRunDesign(); });
  await page.waitForFunction(function () { return !S.running; }, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  var run = await page.evaluate(function () { return { total: window._COST_TOTAL, q: JSON.parse(JSON.stringify(omegaCostQuantities())) }; });
  ok(run.total > 0, mode.name + ': the Run priced the site ($' + Math.round(run.total).toLocaleString('en-US') + ')');

  /* the visualizer, with Build on its bar */
  await page.evaluate(function () { OmegaSiteVis.open(); });
  await page.waitForFunction(function () { var V = OmegaSiteVis._V(); return V && V.site && V.layers && document.getElementById('ov-build') && document.getElementById('ov-load').style.display === 'none'; }, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  /* closer in, as a person would look at the yard */
  var cv = await page.locator('#ov-canvas').boundingBox();
  await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
  for (var z = 0; z < 2; z++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  return { context: context, page: page, errors: errors, bootErrors: bootErrors, posted: posted, unanswered: unanswered, run: run };
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  ok(fs.existsSync(THREE_JS), 'three.js r128 is vendored');
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 30 * 86400000, modules: ['lite', 'plansets'] }, { status: 'active' }, { role: 'owner', status: 'active' });
  try {
    for (var mode of [{ name: 'desktop', w: 1440, h: 960 }, { name: 'phone', w: 390, h: 844 }]) {
      var b0 = await boot(browser, base, view, mode), context = b0.context, page = b0.page, errors = b0.errors, bootErrors = b0.bootErrors;
      var posted = b0.posted, unanswered = b0.unanswered, run = b0.run;
      var drawn = await page.evaluate(pieces);
      var archs = {}; drawn.forEach(function (p) { if (p.arch) archs[p.arch] = (archs[p.arch] || 0) + 1; });
      ok(archs['bess-cabinet'] >= 1 || archs['bess-container'] >= 1, mode.name + ': the battery is in the model');
      ok(archs.charger >= 3 && archs.xfmr >= 1 && archs.pad >= 2 && archs.conduit >= 1, mode.name + ': chargers, transformer, pads and the conduit are in the model (' + JSON.stringify(archs) + ')');
      var bar = await page.evaluate(function () {
        var b = document.getElementById('ov-build'), r = b.getBoundingClientRect(), x = document.getElementById('ov-close').getBoundingClientRect();
        return { inBar: !!b.closest('.ov-bar'), before: b.nextElementSibling && b.nextElementSibling.id, w: r.width, right: r.right, closeRight: x.right, vw: innerWidth, module: b.getAttribute('data-module') };
      });
      ok(bar.inBar && bar.before === 'ov-refresh' && bar.module === 'plansets', mode.name + ': Build is on the visualizer’s bar, before Refresh, owned by Omega Plans');
      if (mode.name === 'desktop') await page.locator('#ovis .ov-bar').screenshot({ path: path.join(output, '01-visualizer-bar.png') });

      /* Build: the page sends the Run's own quantities and what the model draws */
      await page.click('#ov-build');
      await page.waitForFunction(function () { var s = OmegaBuildSequence.state(); return s && s.seq; }, null, { timeout: 20000 });
      ok(posted.length === 1, mode.name + ': one request');
      var sent = posted[0], mine = JSON.parse(JSON.stringify(run.q));
      eq(sent.q, mine, mode.name + ': the body carries exactly the Run’s quantities (omegaCostQuantities)');
      ok(!('total' in sent) && !('cents' in sent) && !/"(price|amount|total)"\s*:/.test(JSON.stringify(sent.build)), mode.name + ': no price or total travels from the page');
      ok(sent.build.items.charger === archs.charger && sent.build.items.pad === archs.pad && sent.build.conduit === true, mode.name + ': what the model draws went with it');

      var st = await page.evaluate(function () { var s = OmegaBuildSequence.state(); return { steps: s.steps, cents: s.cents, keys: s.seq.phases.map(function (p) { return p.key; }), pieces: s.pieces, conduit: s.conduit, playing: s.playing }; });
      ok(st.playing, mode.name + ': it starts playing');
      eq(st.keys, ['design', 'survey', 'trench', 'pads', 'equipment', 'solar', 'ev', 'wiring', 'finish', 'utility', 'commission', 'energize'], mode.name + ': the steps of this site, in build order');
      ok(st.cents === Math.round(run.total * 100), mode.name + ': the sequence’s total is the Run total (' + st.cents + ' vs ' + Math.round(run.total * 100) + ')');
      await page.click('#ov-bs .bs-speed button[data-x="4"]');

      var eqIdx = st.keys.indexOf('equipment');

      /* played to the end: in place IS the Run total, to the cent */
      await page.waitForFunction(function () { var s = OmegaBuildSequence.state(); return !s.playing && !s.animating && s.done === s.steps - 1; }, null, { timeout: 60000 });
      await page.waitForTimeout(200);
      var end = await page.evaluate(function () { var ip = document.getElementById('bs-inplace'); return { cents: +ip.getAttribute('data-cents'), text: ip.textContent, of: document.getElementById('bs-of').textContent, play: document.getElementById('bs-play').textContent }; });
      ok(end.cents === Math.round(run.total * 100), mode.name + ': in place after the last step is the Run total to the cent (' + end.cents + ')');
      ok(end.text === '$' + Math.round(run.total).toLocaleString('en-US') && end.of === 'in place of ' + end.text, mode.name + ': it reads ' + end.text + ' of ' + end.text);
      ok(/Replay/.test(end.play), mode.name + ': Play becomes Replay at the end');

      /* one step at 1×, paused part way: the gear going in, held still */
      var offered = await page.evaluate(function (k) {
        OmegaBuildSequence.go(k - 1); OmegaBuildSequence.speed(0.5); OmegaBuildSequence.next();
        var label = document.getElementById('bs-play').textContent;
        /* the page's own button, pressed on a frame part way through the step
           (frames are slow without a GPU, so a timer could overshoot it) */
        return new Promise(function (r) {
          (function look() {
            var s = OmegaBuildSequence.state();
            if (s.animating && s.progress > 0.2 && s.progress < 0.8) { document.getElementById('bs-play').click(); return r(label); }
            if (!s.animating) return r('missed: ' + label);
            requestAnimationFrame(look);
          })();
        });
      }, eqIdx);
      ok(/Pause/.test(offered), mode.name + ': a step in motion offers Pause');
      var held = await page.evaluate(function () {
        var s = OmegaBuildSequence.state(), ph = s.seq.phases, k = s.seq.phases.map(function (p) { return p.key; }).indexOf('equipment'), V = OmegaSiteVis._V(), shown = 0, landing = 0;
        V.layers.storage.children.concat(V.layers.elec.children).forEach(function (w) { if (w.visible) { shown++; if (w.position.y > 0.5) landing++; } });
        return { held: s.held, animating: s.animating, text: document.getElementById('bs-inplace').textContent, play: document.getElementById('bs-play').textContent,
          lo: ph[k - 1].inPlace, hi: ph[k].inPlace, shown: shown, landing: landing };
      });
      var heldUsd = +held.text.replace(/[$,]/g, '');
      ok(held.held && held.animating && /Play/.test(held.play), mode.name + ': Pause holds the step part way, and offers Play ' + JSON.stringify(held));
      ok(heldUsd > held.lo && heldUsd < held.hi, mode.name + ': in place reads part of the step (' + held.text + ')');
      ok(held.landing >= 1, mode.name + ': gear is still coming down when held (' + held.landing + ' of ' + held.shown + ')');
      await page.waitForTimeout(400);
      ok(await page.evaluate(function (t) { return document.getElementById('bs-inplace').textContent === t; }, held.text), mode.name + ': and stays held');
      await page.screenshot({ path: path.join(output, (mode.name === 'phone' ? '07-phone-' : '02-') + 'equipment-going-in.png') });
      await page.click('#bs-play');
      await page.evaluate(function () { OmegaBuildSequence.pause(); });
      await page.evaluate(function () { OmegaBuildSequence.next(); });
      ok(await page.evaluate(function (k) { var s = OmegaBuildSequence.state(); return !s.animating && s.done === k && +document.getElementById('bs-inplace').getAttribute('data-cents') === s.inPlaceCents; }, eqIdx), mode.name + ': Next finishes the held step, on the server’s figure');
      await page.evaluate(function () { OmegaBuildSequence.speed(4); OmegaBuildSequence.go(OmegaBuildSequence.state().steps - 1); });
      var full = await page.evaluate(pieces);
      eq(full, drawn, mode.name + ': at the end every piece stands exactly as the visualizer drew it');

      /* each step shows exactly its own pieces */
      var steps = await page.evaluate(function () {
        var s = OmegaBuildSequence.state(), seq = s.seq, out = [], V = OmegaSiteVis._V(), byId = {};
        V.site.items.forEach(function (it) { byId[it.id] = it; });
        var order = {}; seq.phases.forEach(function (p, i) { order[p.key] = i; });
        for (var k = -1; k < seq.phases.length; k++) {
          OmegaBuildSequence.go(k);
          var wrong = [];
          Object.keys(V.layers).forEach(function (g) {
            (V.layers[g].children || []).forEach(function (w) {
              var arch = g === 'conduit' ? 'conduit' : (byId[w.userData && w.userData.itemId] || {}).arch;
              var ph = arch === 'conduit' ? seq.conduitPhase : seq.reveal[arch], at = ph == null || ph === 'existing' ? -1 : order[ph];
              if (at == null) at = -1;
              var want = at <= k;
              if (w.visible !== want) wrong.push(arch + '@' + k);
            });
          });
          out.push({ k: k, wrong: wrong, cents: +document.getElementById('bs-inplace').getAttribute('data-cents'), want: k < 0 ? 0 : seq.phases[k].inPlaceCents });
        }
        return out;
      });
      steps.forEach(function (x) {
        ok(!x.wrong.length, mode.name + ': step ' + x.k + ' shows exactly what is built by then' + (x.wrong.length ? ' (' + x.wrong.slice(0, 6).join(', ') + ')' : ''));
        ok(x.cents === x.want, mode.name + ': step ' + x.k + ' reads the server’s in-place figure');
      });
      var existing = await page.evaluate(function () {
        OmegaBuildSequence.go(-1);
        var V = OmegaSiteVis._V(), byId = {}, seen = {};
        V.site.items.forEach(function (i) { byId[i.id] = i; });
        Object.keys(V.layers).forEach(function (g) { (V.layers[g].children || []).forEach(function (w) { var it = byId[w.userData && w.userData.itemId]; if (it && (it.arch === 'pole' || it.arch === 'hydrant')) seen[it.arch] = w.visible; }); });
        return seen;
      });
      ok(existing.pole === true && existing.hydrant === true, mode.name + ': the existing pole and hydrant stand from the first frame');
      if (mode.name === 'desktop') {
        await page.evaluate(function () { OmegaBuildSequence.go(OmegaBuildSequence.state().seq.phases.map(function (p) { return p.key; }).indexOf('pads')); });
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(output, '03-pads-and-conduit.png') });
      }

      /* Explode lifts the gear off its pads, and puts it back */
      await page.evaluate(function () { OmegaBuildSequence.go(OmegaBuildSequence.state().steps - 1); });
      await page.click('#bs-explode');
      await page.waitForTimeout(900);
      var lifted = await page.evaluate(pieces);
      var moved = lifted.filter(function (p, i) { return Math.abs(p.y - drawn[i].y - 8) < 0.01; }).map(function (p) { return p.arch; });
      ok(moved.length >= 6 && moved.indexOf('xfmr') >= 0 && moved.indexOf('pad') < 0 && moved.indexOf('solar-ground') < 0, mode.name + ': Explode lifts the gear 8 ft and leaves pads and arrays (' + moved.join(',') + ')');
      if (mode.name === 'desktop') await page.screenshot({ path: path.join(output, '04-explode.png') });
      await page.click('#bs-explode');
      await page.waitForTimeout(900);
      eq(await page.evaluate(pieces), drawn, mode.name + ': Explode off puts every piece back');

      /* the schedule: every step, its days and its money, with a CSV */
      await page.click('#bs-sched');
      await page.waitForSelector('#ov-bsp tr.row');
      var sched = await page.evaluate(function () {
        var p = document.getElementById('ov-bsp'), r = p.getBoundingClientRect(), b = document.getElementById('ov-bs').getBoundingClientRect();
        return { rows: p.querySelectorAll('tr.row').length, text: p.innerText, overlaps: r.bottom > b.top + 1, wide: r.right <= innerWidth + 0.5 && r.left >= -0.5 };
      });
      ok(sched.rows === st.steps, mode.name + ': the schedule lists every step');
      ok(/not on file/.test(sched.text) && /working days/.test(sched.text) && /the Run total/.test(sched.text), mode.name + ': it says what is not on file and that the end is the Run total');
      ok(!sched.overlaps && sched.wide, mode.name + ': the schedule sits above the bar, on the screen');
      var dl = page.waitForEvent('download', { timeout: 5000 }).catch(function () { return null; });
      await page.click('#bsp-csv');
      var download = await dl, csv = await page.evaluate(function () { return OmegaBuildSequence.state().lastCsv; });
      var lines = csv.split('\n');
      ok(lines.length === st.steps + 2 && /^Total,/.test(lines[lines.length - 1]) && lines[lines.length - 1].indexOf((st.cents / 100).toFixed(2)) > 0, mode.name + ': the CSV has every step and the total');
      ok(!!download && /build-sequence\.csv$/.test(download.suggestedFilename()), mode.name + ': Download CSV saves a file');
      if (mode.name === 'desktop') {
        await page.locator('#ov-bsp tr.row').nth(st.keys.indexOf('equipment')).click();
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(output, '05-schedule.png') });
      } else await page.screenshot({ path: path.join(output, '08-phone-schedule.png') });
      await page.click('#bsp-close');

      /* the phone: the bar fits, the page never scrolls sideways */
      var fit = await page.evaluate(function () {
        var b = document.getElementById('ov-bs').getBoundingClientRect(), s = document.getElementById('ov-stage').getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, stageTop: s.top, vw: innerWidth, sx: document.documentElement.scrollWidth };
      });
      ok(fit.left >= 0 && fit.right <= fit.vw + 0.5 && fit.sx <= fit.vw + 1, mode.name + ': the bar fits the screen and nothing scrolls sideways');
      ok(fit.top > fit.stageTop, mode.name + ': the model still shows above the bar');
      if (mode.name === 'desktop') await page.screenshot({ path: path.join(output, '06-built.png') });

      /* close: every piece back exactly as drawn */
      await page.evaluate(function () { OmegaBuildSequence.go(2); });
      await page.click('#bs-close');
      eq(await page.evaluate(pieces), drawn, mode.name + ': closing the player puts every piece back');
      ok(!(await page.locator('#ov-bs').count()), mode.name + ': and the bar is gone');

      /* a Refresh under the player is noticed, never animated on a dead model */
      await page.click('#ov-build');
      await page.waitForFunction(function () { var s = OmegaBuildSequence.state(); return s && s.seq; });
      await page.evaluate(function () { OmegaBuildSequence.pause(); });
      await page.click('#ov-refresh');
      await page.waitForTimeout(400);
      await page.evaluate(function () { OmegaBuildSequence.go(1); });
      var stale = await page.evaluate(function () { return document.getElementById('ov-bs').innerText; });
      ok(/rebuilt/.test(stale), mode.name + ': a Refresh under the player says so');
      await page.click('#bs-close');
      var after = await page.evaluate(pieces);
      ok(after.every(function (p) { return p.vis; }), mode.name + ': the refreshed model is whole');

      /* closing the visualizer ends the player */
      await page.click('#ov-build');
      await page.waitForFunction(function () { var s = OmegaBuildSequence.state(); return s && s.seq; });
      await page.click('#ov-close');
      await page.waitForTimeout(200);
      ok(OmegaBuildSequenceGone(await page.evaluate(function () { return { st: OmegaBuildSequence.state(), bar: !!document.getElementById('ov-bs') }; })), mode.name + ': closing the visualizer ends the player');

      var late = errors.slice(bootErrors);
      ok(!late.length, mode.name + ': no page error after boot' + (late.length ? ': ' + late.join(' | ') : ''));
      ok(unanswered.indexOf('/api/build-sequence') < 0, mode.name + ': /api/build-sequence was answered');
      if (unanswered.length) console.log('  (' + mode.name + ': offline producers the editor asked for: ' + unanswered.filter(function (u, i) { return unanswered.indexOf(u) === i; }).join(', ') + ')');
      await context.close();
    }
    /* a tablet asking for less motion: the bar still fits beside Close, and
       the build opens finished, with steps that change without flying in */
    var c0 = await boot(browser, base, view, { name: 'tablet-calm', w: 768, h: 1024, calm: true }), cp = c0.page;
    var fits = await cp.evaluate(function () {
      var bar = document.querySelector('#ovis .ov-bar'), x = document.getElementById('ov-close').getBoundingClientRect(), b = document.getElementById('ov-build').getBoundingClientRect();
      return { closeIn: x.right <= innerWidth + 0.5 && x.left >= 0, buildIn: b.right <= x.left, word: document.getElementById('ov-build').innerText.trim() };
    });
    ok(fits.closeIn && fits.buildIn && fits.word === 'Build', 'tablet: Build (the word alone under 900 px) sits beside Close, both on screen');
    await cp.click('#ov-build');
    await cp.waitForFunction(function () { var s = OmegaBuildSequence.state(); return s && s.seq; });
    var calm = await cp.evaluate(function () { var s = OmegaBuildSequence.state(); return { done: s.done, steps: s.steps, playing: s.playing, cents: +document.getElementById('bs-inplace').getAttribute('data-cents'), total: s.cents }; });
    ok(calm.done === calm.steps - 1 && !calm.playing && calm.cents === calm.total && calm.total === Math.round(c0.run.total * 100), 'tablet, less motion: the build opens finished, at the Run total, and does not play');
    var flew = await cp.evaluate(function () {
      OmegaBuildSequence.go(3); OmegaBuildSequence.next();
      var V = OmegaSiteVis._V(), s = OmegaBuildSequence.state(), up = 0;
      V.layers.storage.children.concat(V.layers.elec.children).forEach(function (w) { if (w.visible && w.position.y > 0.5) up++; });
      return { up: up, animating: s.animating };
    });
    ok(flew.up === 0, 'tablet, less motion: a step’s pieces appear in place, never flying in');
    ok(!(c0.errors.slice(c0.bootErrors).length), 'tablet: no page error after boot');
    await c0.context.close();
  } finally { await browser.close(); server.close(); }
  console.log('Build sequence render: ' + count + ' checks passed; screenshots in ' + output);
}
function OmegaBuildSequenceGone(x) { return x.st === null && !x.bar; }
run().catch(function (e) { console.error(e); process.exit(1); });
