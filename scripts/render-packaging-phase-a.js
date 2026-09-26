#!/usr/bin/env node
/* Offline packaging regression screenshots. No live auth, API or billing.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Until Phases 1–3 land, standard/deluxe are legacy capability fixtures,
   NOT a claim that the future Lite/Field module gates are implemented. */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || 'playwright';
var chromium = require(PW).chromium;
var output = process.env.PACKAGING_SHOTS || path.join(ROOT, 'docs', 'screenshots', 'packaging-phase-a');
fs.mkdirSync(output, { recursive: true });
/* Render the real ribbon markup/styles and its actual owner modules in
   isolation. This tests presentation and gates, not Maps or model engines. */
function ribbonFixture() {
  var source = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
  var markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  function div(id) {
    var start = markup.indexOf('<div id="' + id + '"');
    assert(start >= 0, 'fixture must use the real ' + id);
    var tags = /<div\b[^>]*>|<\/div>/g, depth = 0, match;
    tags.lastIndex = start;
    while ((match = tags.exec(markup))) {
      depth += /^<\/div/.test(match[0]) ? -1 : 1;
      if (!depth) return markup.slice(start, tags.lastIndex);
    }
    throw new Error('Unclosed ' + id);
  }
  function owner(marker) {
    var at = source.indexOf(marker), start = source.lastIndexOf('<script', at);
    assert(at >= 0 && start >= 0, 'missing ribbon owner ' + marker);
    return source.slice(start, source.indexOf('</script>', at) + 9);
  }
  return '<!doctype html><html><head><meta charset="utf-8">' + (markup.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n') +
    '</head><body><div style="padding:20px;background:#16202B;color:#fff;font:14px system-ui">OMEGA · offline ribbon fixture · legacy capabilities</div>' + div('tb') + div('ribbon') +
    '<script src="/omega-caps.js"></script>' + owner('id="omega-ribbon-icons-js"') + owner('OMEGA PATCH 52 — SHELF: ONE ADDRESS PER TOOL') +
    '<script>function rbTab(key){document.querySelectorAll("#ribbon-tabs [data-page]").forEach(function(t){t.classList.toggle("active",t.getAttribute("data-page")===key);});document.querySelectorAll(".ribbon-page").forEach(function(p){p.classList.toggle("active",p.getAttribute("data-page")===key);});}OmegaCaps.resolve(firebase.firestore(),firebase.auth().currentUser.email,firebase.auth().currentUser.emailVerified).then(function(t){OmegaCaps.apply(t);window.fixtureTier=t;});</script></body></html>';
}
var server = http.createServer(function (req, res) {
  var pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/__ribbon.html') { res.setHeader('Content-Type', 'text/html'); return res.end(ribbonFixture()); }
  if (pathname === '/__start.html') {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#16202B;font:14px system-ui}.modal-bg{display:none;position:fixed;inset:0;background:#0005;align-items:center;justify-content:center}.modal-bg.on{display:flex}button{font:inherit}</style></head><body><button id="launch" onclick="OmegaNewProject.open(\'bess\')">New project</button><script src="/omega-newproject.js"></script><script>OmegaNewProject.configure({db:firebase.firestore(),auth:firebase.auth(),orgId:function(){return "packaging.example";},afterCreate:function(id){window.createdId=id;}});</script></body></html>');
  }
  var file = path.resolve(ROOT, '.' + pathname);
  if (file.indexOf(ROOT + path.sep) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end();
  }
  var mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
function fixture(tier) {
  window.__fixtureWrites = [];
  var user = { uid:'fixture-user', email:'designer@packaging.example', emailVerified:true, displayName:'Fixture Designer', getIdToken:function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? { tier:tier, addons:[] } :
      /^omega_orgs\/[^/]+$/.test(p) ? { name:'Packaging preview', status:'active', domains:[location.hostname] } :
      /members\//.test(p) ? { role:'owner', status:'active' } : null;
    return { exists:!!data, id:p.split('/').pop(), data:function () { return data; }, docs:[], empty:true, forEach:function () {} };
  }
  function ref(p) {
    return { collection:function (n) { return ref(p + '/' + n); }, doc:function (n) { return ref(p + '/' + n); },
      get:function () { return Promise.resolve(snapshot(p)); },
      onSnapshot:function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where:function () { return this; }, orderBy:function () { return this; }, limit:function () { return this; },
      set:function () { throw new Error('Unexpected fixture write: ' + p); },
      update:function () { throw new Error('Unexpected fixture update: ' + p); },
      add:function (data) { window.__fixtureWrites.push({ path:p, data:data }); return Promise.resolve({ id:'fixture-created' }); }
    };
  }
  var db = { collection:function (n) { return ref(n); }, settings:function () {}, enablePersistence:function () { return Promise.resolve(); } };
  var auth = { currentUser:user, onAuthStateChanged:function (fn) { setTimeout(function () { fn(user); }, 0); return function () {}; }, getRedirectResult:function () { return Promise.resolve({}); }, setPersistence:function () { return Promise.resolve(); }, signOut:function () { return Promise.resolve(); } };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp:function () { return 'fixture-time'; } };
  function authentication() { return auth; }
  authentication.Auth = { Persistence:{ LOCAL:'local' } };
  authentication.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var app = { firestore:firestore, auth:authentication };
  window.firebase = { apps:[app], initializeApp:function () { return app; }, app:function () { return app; }, firestore:firestore, auth:authentication };
  window.CLEARSKY_CONFIG = { firebase:{}, adminDomains:['clearsky-usa.com'], tenant:{ orgId:'packaging.example', name:'Packaging preview', tier:tier, status:'active' } };
  window.alert = function (message) { window.__fixtureAlert = message; };
  localStorage.setItem('omega.ui.mode', 'pro');
}
var checks = 0;
async function run() {
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath:process.env.CHROME || chromium.executablePath() });
  try {
    for (var tier of ['standard', 'deluxe']) for (var theme of ['light', 'dark']) {
      var context = await browser.newContext({ viewport:{ width:1280, height:900 }, colorScheme:theme });
      await context.route('**/*', function (route) {
        var url = new URL(route.request().url());
        if (url.origin !== base) return route.fulfill({ status:200, contentType:'text/javascript', body:'' });
        if (url.pathname.indexOf('/api/') === 0) return route.fulfill({ status:403, contentType:'application/json', body:'{"error":"Offline fixture: no live API"}' });
        if (url.pathname === '/config.js') return route.fulfill({ status:200, contentType:'text/javascript', body:'/* fixture owns configuration */' });
        return route.continue();
      });
      await context.addInitScript(fixture, tier);
      var page = await context.newPage();
      await page.goto(base + '/__ribbon.html', { waitUntil:'domcontentloaded' });
      await page.waitForFunction(function () { return window.fixtureTier; });
      await page.waitForTimeout(2500);
      assert.equal(await page.evaluate(function () { return window.fixtureTier; }), tier, 'normal resolver reads fixture billing'); checks++;
      assert.equal(await page.evaluate(function () { return OmegaCaps.org(); }), 'packaging.example'); checks++;
      assert.equal(await page.locator('#ribbon .rb-ico:not(.omg-svg-ico)').count(), 0, 'every ribbon icon has the common SVG treatment'); checks++;
      var drawIds = ['rb-line','rb-polyline','rb-rect','rb-circle','rb-select2'];
      for (var id of drawIds) { assert.equal(await page.locator('#' + id).count(), 1, id + ' remains in the DOM'); checks++; }
      assert.equal(await page.locator('[onclick*="openViabilityWorkflow"]:visible').count(), 0); checks++;
      await page.evaluate(function () {
        var src = Array.from(document.querySelectorAll('#ribbon .rbtn')).find(function (b) { return /calib/i.test(b.textContent) && !b.hasAttribute('data-shelf-dupe'); });
        var duplicate = src.cloneNode(true); duplicate.id = 'late-scale-copy'; src.parentNode.appendChild(duplicate);
      });
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#late-scale-copy').isVisible(), false, 'a late duplicate remains hidden'); checks++;
      await page.screenshot({ path:path.join(output, tier + '-' + theme + '-editor.png') });
      for (var tab of ['draw','output']) {
        await page.locator('#ribbon-tabs [data-page="' + tab + '"]').click();
        var labels = await page.locator('#ribbon .ribbon-page.active .rb-lbl').evaluateAll(function (nodes) {
          return nodes.filter(function (node) { return node.getClientRects().length && (node.getBoundingClientRect().height > 25 || node.scrollWidth > node.clientWidth + 1); }).map(function (node) { return node.textContent; });
        });
        assert.deepEqual(labels, [], 'labels fit at most two short lines on ' + tab + ': ' + JSON.stringify(labels)); checks++;
        await page.screenshot({ path:path.join(output, tier + '-' + theme + '-' + tab + '.png') });
      }
      await page.goto(base + '/__start.html');
      await page.locator('#launch').click();
      assert.equal(await page.locator('.np-type').count(), 7); checks++;
      await page.locator('[data-k="l2"]').click();
      assert.equal(await page.locator('[data-k="l2"]').getAttribute('aria-pressed'), 'true'); checks++;
      await page.screenshot({ path:path.join(output, tier + '-' + theme + '-start.png') });
      await page.setViewportSize({ width:768, height:1024 });
      assert.equal(await page.evaluate(function () { return document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth; }), true, 'tablet card grid fits'); checks++;
      await page.screenshot({ path:path.join(output, tier + '-' + theme + '-start-tablet.png') });
      await page.locator('#np-name').fill('Mixed storage and charging');
      await page.locator('[data-np="create"]').click();
      await page.waitForFunction(function () { return window.createdId; });
      var saved = await page.evaluate(function () { return window.__fixtureWrites[0].data; });
      assert.deepEqual(saved.siteScopes, ['bess','l2']); checks++;
      assert.equal(saved.orgId, 'packaging.example'); checks++;
      await page.locator('#launch').click();
      await page.locator('.np-type').first().focus();
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('[data-np="create"]').evaluate(function (el) { return el === document.activeElement; }), true, 'dialog wraps keyboard focus'); checks++;
      await page.locator('[data-np="cancel"]').click();
      assert.equal(await page.locator('#launch').evaluate(function (el) { return el === document.activeElement; }), true, 'dialog returns focus to opener'); checks++;
      await context.close();
    }
    console.log('packaging render: ' + checks + ' checks passed; 20 screenshots in ' + output);
    console.log('Real shared start dialog and isolated ribbon owners; current standard/deluxe gates. Future Lite/Field modules and workspace filters are Phase 3.');
  } finally { await browser.close(); }
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () { server.close(); });
