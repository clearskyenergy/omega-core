/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Offline integration of the real editor ribbon, Summary, command palette,
 * icon/retirement owners and plan observer. API authorization has separate tests.
 * This deliberately does not represent a full Maps/editor-engine acceptance run.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var X = require('../api/_lib/package-access');
var ROOT = path.join(__dirname, '..'), source = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var output = process.env.PACKAGING_SHOTS || path.join(ROOT, 'docs/screenshots/packaging-phase-2');
fs.mkdirSync(output, { recursive: true });
var markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
function div(id) {
  var start = markup.indexOf('<div id="' + id + '"'); assert(start >= 0, id);
  var tags = /<div\b[^>]*>|<\/div>/g, depth = 0, m; tags.lastIndex = start;
  while ((m = tags.exec(markup))) { depth += /^<\/div/.test(m[0]) ? -1 : 1; if (!depth) return markup.slice(start, tags.lastIndex); }
  throw new Error('Unclosed ' + id);
}
function owner(marker) {
  var at = source.indexOf(marker); assert(at >= 0, marker); var start = source.lastIndexOf('<script', at);
  return source.slice(start, source.indexOf('</script>', at) + 9);
}
var fixture = '<!doctype html><html><head><meta charset="utf-8">' + (markup.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n') + '</head><body>' + div('tb') + div('ribbon') + div('rp') +
  '<div id="fixture-note" style="position:fixed;bottom:20px;left:24px;font:14px system-ui;padding:14px;border:1px solid #60758a;border-radius:8px">Offline editor controls · server package projection</div>' +
  '<script>window.calls=[];function openPlotPlanExport(){calls.push("plot");}function openOneLineExport(){calls.push("one-line");}function openBlueprintExport(){calls.push("blueprint");}function d4Open(){calls.push("documentation");}function openRpPanel(tab){calls.push(tab);rpTab(tab);}function rpTab(tab){document.getElementById("rp").classList.add("rp-open");document.getElementById("rp-cost").style.display=tab==="cost"?"flex":"none";}function rbRun(fn){fn();}function rbTab(key){document.querySelectorAll(".rtab[data-page]").forEach(function(t){t.classList.toggle("active",t.getAttribute("data-page")===key);});document.querySelectorAll(".ribbon-page").forEach(function(p){p.classList.toggle("active",p.getAttribute("data-page")===key);});}function _guidedPick(key){calls.push(key);}window.OmegaAIRender={open:function(){calls.push("render");}};</script>' +
  '<script src="/omega-caps.js"></script>' + owner('id="omega-ribbon-icons-js"') + owner('OMEGA PATCH 52 — SHELF: ONE ADDRESS PER TOOL') + owner('var ck = null, ckIn = null') + owner('/* ── PLAN GATING') + '</body></html>';
var server = http.createServer(function (req, res) {
  if (req.url.split('?')[0] === '/__access') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
  if (req.url === '/omega-caps.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(ROOT, 'omega-caps.js'))); }
  res.writeHead(404); res.end();
});
function init() {
  var user = { uid: 'fixture', email: 'member@example.com', emailVerified: true, getIdToken: function () { return Promise.resolve('offline'); } };
  function ref() { return { collection: ref, doc: ref, get: function () { return Promise.resolve({ exists: true, data: function () { return { packaged: true }; } }); } }; }
  var auth = { currentUser: user, onAuthStateChanged: function (fn) { setTimeout(function () { fn(user); }, 0); } };
  window.firebase = { apps: [1], auth: function () { return auth; }, firestore: function () { return { collection: ref }; } };
  window.alert = function () {};
}
var count = 0;
function ok(value, label) { assert(value, label); count++; }
async function run() {
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  try {
    for (var plan of ['lite', 'paid']) for (var theme of ['light', 'dark']) {
      var modules = plan === 'lite' ? ['lite'] : ['lite', 'estimate', 'plansets', 'compute'];
      var view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', modules: modules }, { status: 'active' }, { role: 'owner', status: 'active' }, Date.now());
      var context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
      await context.addInitScript(init);
      await context.route('**/*', function (route) {
        var u = new URL(route.request().url());
        if (u.pathname === '/api/package-access') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(view) });
        if (u.origin !== base) return route.fulfill({ status: 200, body: '' });
        return route.continue();
      });
      var page = await context.newPage(); var errors = [];
      page.on('pageerror', function (e) { errors.push(e.message); });
      await page.goto(base + '/__access');
      await page.waitForFunction(function () { return window.OmegaCaps && OmegaCaps.packageAccess() && OmegaCaps.packageAccess().modules.length && window.OmegaCommands; });
      await page.waitForFunction(function () { return document.querySelector('#rp-tab-cost').hasAttribute('data-package-hidden') === (OmegaCaps.packageAccess().modules.length === 1); });
      await page.evaluate(function (theme) { document.documentElement.setAttribute('data-theme', theme); document.body.setAttribute('data-theme', theme); document.getElementById('fixture-note').textContent = (OmegaCaps.packageAccess().modules.length === 1 ? 'Lite' : 'Lite + Estimate + Plan Sets + Compute') + ' · ' + theme + ' · offline editor controls'; rbTab('output'); }, theme);
      ok(await page.locator('#rp-tab-cost').evaluate(function (el) { return el.hasAttribute('data-package-hidden'); }) === (plan === 'lite'), 'Summary Cost');
      ok(await page.locator('.rtab[data-page="estimate"]').isVisible() === (plan === 'paid'), 'Estimate tab follows module, not legacy Engineering cap');
      var names = await page.evaluate(function () { return OmegaCommands.list().filter(function (x) { return x.action !== 'view-module'; }).map(function (x) { return x.name; }).join('|'); });
      ok(/Plot Plan/.test(names) === (plan === 'paid'), 'palette/Jarvis list');
      await page.evaluate(function () { openPlotPlanExport(); d4Open(); openRpPanel('cost'); rpTab('cost'); OmegaAIRender.open(); _guidedPick('compute'); });
      var calls = await page.evaluate(function () { return window.calls; });
      ok(plan === 'lite' ? calls.length === 0 : calls.indexOf('render') >= 0 && calls.indexOf('cost') >= 0, 'direct launchers');
      await page.evaluate(function () { var b = document.createElement('button'); b.id = 'ov-airender'; b.className = 'rbtn'; b.setAttribute('onclick', 'OmegaAIRender.open()'); b.innerHTML = '<span class="rb-lbl">AI Render</span>'; document.querySelector('.ribbon-page[data-page="output"]').appendChild(b); });
      await page.waitForFunction(function () { var b = document.getElementById('ov-airender'); return b.hasAttribute('data-package-hidden') === (OmegaCaps.packageAccess().modules.length === 1); });
      ok(await page.locator('#ov-airender').isVisible() === (plan === 'paid'), 'late injected AI Render');
      await page.evaluate(function () { document.getElementById('ov-airender').click(); OmegaCommands.run('Plot Plan E0 / E1.1'); });
      ok(await page.evaluate(function () { return OmegaCaps.packageAccess().modules.length > 1 || window.calls.indexOf('plot') < 0 && window.calls.indexOf('render') < 0; }), 'programmatic hidden click');
      await page.screenshot({ path: path.join(output, plan + '-' + theme + '-output.png') });
      await page.evaluate(function () { document.getElementById('app-menu').classList.add('open'); document.getElementById('app-menu').style.display = 'block'; });
      await page.screenshot({ path: path.join(output, plan + '-' + theme + '-file.png') });
      ok(errors.length === 0, 'browser errors: ' + errors.join('; '));
      await context.close();
    }
    var isolated = await browser.newContext();
    await isolated.addInitScript(init);
    var raw = await isolated.newPage();
    await raw.goto(base + '/__access?customerEngine=1');
    await raw.waitForFunction(function () { return window.OmegaCaps && OmegaCaps.packageAccess(); });
    ok(await raw.evaluate(function () { return !OmegaCaps.allowedCommand('', 'openBlueprintExport()') && OmegaCaps.packageAccess().modules.length === 0; }), 'raw customerEngine is closed');
    await raw.close(); await isolated.close();
    console.log('Packaged editor controls: ' + count + ' passed; 8 screenshots; offline fixture, no live writes.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
