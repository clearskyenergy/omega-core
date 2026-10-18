#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Push to Prime carries the address Site Map loaded.
 * Chromium: type an address, press Load, clear the ribbon field (a loaded
 * map often leaves it empty and keeps the address on _lastAddr), click
 * Push to Prime, and assert Omega Prime's Site address input holds it,
 * with lat/lng, the project id and the project type on the handoff.
 * Push to Logic is the same handoff. Then the project-type buttons: EV,
 * Solar, Compute and Microgrid are selectable, and each lists the editor's
 * own catalog. An EV site walks Circuit → Load → Quote and reads
 * "Quote required" / "Sized in Site Map" instead of a battery cost run.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var ROOT = path.join(__dirname, '..'), HOST = '127.0.0.1', fails = 0, checks = 0;
function ok(name, cond, detail) {
  checks++;
  if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 700) : '')); }
  else console.log('ok   ' + name);
}
var ADDR = '3400 S Federal St, Chicago, IL 60616';
var SITE = { lat: 41.81522, lng: -87.62261 };
var PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
var SUBS = { features: [
  { attributes: { NAME: 'Crawford', MAX_VOLT: 138, MIN_VOLT: 12, LINES: 6, STATUS: 'IN SERVICE', OWNER: 'ComEd' }, geometry: { x: -87.6150, y: 41.8210 } }] };
var TX = { features: [{ attributes: { VOLTAGE: 138 }, geometry: { paths: [[[-87.66, 41.80], [-87.60, 41.83]]] } }] };

var srv = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  if (p === '/omega-prime') p = '/omega-prime.html';
  if (p === '/editor') p = '/editor.html';
  var file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

function texts(page) {
  return page.$eval('#unitSel', function (s) { return [].map.call(s.options, function (o) { return o.textContent; }); });
}

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var errs = [];
  try {
    var ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      function json(o) { return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) }); }
      if (/gstatic\.com\/firebasejs|maps\.googleapis\.com|maps\.gstatic\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\//.test(url)) return r['continue']();
      if (/geocoding\.geo\.census\.gov/.test(url)) return json({ result: { addressMatches: [{ matchedAddress: ADDR, coordinates: { x: SITE.lng, y: SITE.lat } }] } });
      if (/nominatim\.openstreetmap\.org/.test(url)) return json([]);
      if (/Substations\/FeatureServer\/0\/query|substations\/FeatureServer\/0\/query/i.test(url)) return json(SUBS);
      if (/Transmission_Lines\/FeatureServer\/0\/query/.test(url)) return json(TX);
      if (/arcgisonline\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      return r.abort();
    });
    var ed = await ctx.newPage();
    ed.on('pageerror', function (e) { errs.push('editor: ' + e.message); });
    await ed.goto(base + '/editor.html', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await ed.waitForFunction(function () { return typeof window.omegaPushPrime === 'function' && document.getElementById('omega-addr-in') && document.getElementById('rb-push-prime'); }, null, { timeout: 60000 });
    await ed.evaluate(function () {
      var g = document.getElementById('omega-editor-gate');
      if (g && g.parentNode) g.parentNode.removeChild(g);
      [].forEach.call(document.querySelectorAll('[data-package-hidden]'), function (el) {
        el.style.setProperty('display', 'flex', 'important');
        el.removeAttribute('data-package-hidden');
      });
    });
    await ed.fill('#omega-addr-in', ADDR);
    await ed.click('#omega-addr-go');
    await ed.waitForFunction(function (a) { return window._lastAddr === a; }, ADDR, { timeout: 5000 });
    var vis = await ed.evaluate(function (site) {
      var ids = ['omega-addr-in', 'addr-in', 'prop-address', 'bp-address', 'ps-site-addr', 'pp-street', 'np-addr', 'gps-addr-in'];
      ids.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
      window._projectId = 'proj-handoff';
      window._lastCenter = site;
      if (window.OmegaProjectTypes && typeof OmegaProjectTypes.set === 'function') OmegaProjectTypes.set('datacenter');
      if (window.OmegaMode && typeof OmegaMode.set === 'function') OmegaMode.set('pro');
      document.body.classList.remove('omg-designer');
      if (typeof rbTab === 'function') rbTab('finance');
      /* Designer mode hides Finance commands that are not on its keep
         list, and an unsigned boot can land there. Pro is where Push to
         Prime is on the ribbon. */
      var page = document.querySelector('#ribbon .ribbon-page[data-page="finance"]');
      if (page) {
        page.classList.add('active');
        page.style.setProperty('display', 'flex', 'important');
        [].forEach.call(page.querySelectorAll('.rpanel'), function (panel) {
          panel.classList.remove('omg-empty');
          panel.style.setProperty('display', 'flex', 'important');
        });
      }
      ['rb-push-prime', 'rb-push-logic'].forEach(function (id) {
        var b = document.getElementById(id);
        if (!b) return;
        b.removeAttribute('data-package-hidden');
        b.style.setProperty('display', 'flex', 'important');
        b.style.setProperty('visibility', 'visible', 'important');
      });
      var b = document.getElementById('rb-push-prime');
      var rib = document.getElementById('ribbon');
      if (rib) { rib.style.setProperty('display', 'flex', 'important'); rib.style.setProperty('height', '92px', 'important'); }
      if (b) b.scrollIntoView({ block: 'center', inline: 'center' });
      return true;
    }, SITE);
    if (!vis) throw new Error('Finance ribbon did not open');
    await ed.waitForFunction(function () {
      var b = document.getElementById('rb-push-prime');
      if (!b) return false;
      var r = b.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    }, null, { timeout: 8000 });
    var primeWait = ctx.waitForEvent('page');
    primeWait.catch(function () {});
    await ed.click('#rb-push-prime', { timeout: 15000 });
    var prime = await primeWait;
    prime.on('pageerror', function (e) { errs.push('prime: ' + e.message); });
    await prime.waitForLoadState('domcontentloaded');
    var held = await prime.waitForFunction(function (a) {
      var el = document.getElementById('addr');
      return el && el.value === a ? el.value : null;
    }, ADDR, { timeout: 20000 }).then(function (h) { return h.jsonValue(); }, function () { return null; });
    var landed = prime.url();
    ok('Push to Prime opens with the loaded address in the Site address field', held === ADDR, { url: landed, value: await prime.$eval('#addr', function (el) { return el.value; }).catch(function () { return null; }) });
    ok('the handoff carries lat, lng, the project id and the compute type',
      /[?&]lat=41\.81522(?:&|$)/.test(landed) && /[?&]lng=-87\.62261(?:&|$)/.test(landed) && /[?&]project=proj-handoff(?:&|$)/.test(landed) && /[?&]type=compute(?:&|$)/.test(landed), landed);
    ok('Compute is the selected project type', await prime.$eval('#types button[data-t="compute"]', function (b) { return b.classList.contains('on') && !b.disabled; }));
    var computeUnits = await texts(prime);
    ok('Compute lists the editor data-center catalog, including the Omega-Core skid',
      computeUnits.some(function (t) { return /Omega-Core Skid/.test(t); }) && computeUnits.some(function (t) { return /Compute Container/.test(t); }) && computeUnits.length >= 7, computeUnits);

    var logicWait = ctx.waitForEvent('page');
    logicWait.catch(function () {});
    await ed.click('#rb-push-logic', { timeout: 15000 });
    var logic = await logicWait;
    await logic.waitForLoadState('domcontentloaded');
    var logicAddr = await logic.waitForFunction(function (a) {
      var el = document.getElementById('addr');
      return el && el.value === a ? el.value : null;
    }, ADDR, { timeout: 20000 }).then(function (h) { return h.jsonValue(); }, function () { return null; });
    ok('Push to Logic carries the same address', logicAddr === ADDR && /[?&]step=logic(?:&|$)/.test(logic.url()), logic.url());
    await logic.close();

    async function pick(type) {
      await prime.click('#types button[data-t="' + type + '"]');
      return texts(prime);
    }
    var evUnits = await pick('ev');
    ok('EV charging lists the editor charger catalog', evUnits.some(function (t) { return /Tesla V4 Post/.test(t); }) && evUnits.some(function (t) { return /Level 2/.test(t); }) && evUnits.some(function (t) { return /Autel DH480/.test(t); }), evUnits.slice(0, 8));
    var solarUnits = await pick('solar');
    ok('Solar lists the editor module and array catalog', solarUnits.some(function (t) { return /EAGLE G7B/.test(t); }) && solarUnits.some(function (t) { return /550 W/.test(t); }) && solarUnits.some(function (t) { return /Rooftop/.test(t); }), solarUnits);
    var mgUnits = await pick('microgrid');
    ok('Microgrid combines battery, solar and generator catalogs',
      mgUnits.some(function (t) { return /CleanCell CC290\/125/.test(t); }) && mgUnits.some(function (t) { return /EAGLE G7B/.test(t); }) && mgUnits.some(function (t) { return /Fuel Cell/.test(t); }) && mgUnits.some(function (t) { return /Diesel Genset/.test(t); }) && mgUnits.some(function (t) { return /FENECON Industrial XXL/.test(t); }), mgUnits.filter(function (t) { return /CleanCell|EAGLE|Fuel|Diesel|XXL|Omega-Core/.test(t); }));
    var bat = await pick('bess');
    ok('Battery lists every CleanCell unit and the XXL',
      bat.some(function (t) { return /CleanCell CC290\/125/.test(t); }) && bat.some(function (t) { return /CleanCell LG JP-2/.test(t); }) && bat.some(function (t) { return /CleanCell Smart Module/.test(t); }) && /FENECON Industrial XXL/.test(bat[bat.length - 1]), bat);
    var shotDir = '/opt/cursor/artifacts/screenshots';
    try { fs.mkdirSync(shotDir, { recursive: true }); } catch (e) {}
    await pick('microgrid');
    await prime.screenshot({ path: path.join(shotDir, 'prime-microgrid-units.png') });

    /* EV later steps: quote required, no battery cost run. */
    await pick('ev');
    await prime.click('#go');
    await prime.waitForSelector('#s-atlas.on', { timeout: 15000 });
    await prime.waitForFunction(function () { return /substations within/.test(document.getElementById('gaStat').textContent); }, null, { timeout: 10000 });
    await prime.click('#ly-sub');
    await prime.click('.subicon.near');
    await prime.click('#bm-sat');
    await prime.click('#ga-go');
    await prime.waitForSelector('#s-circuit.on', { timeout: 8000 });
    var circ = await prime.$eval('#sfRes', function (e) { return e.textContent; });
    ok('an EV circuit step says quote required and does not invent a hosting kW', /Quote required/.test(circ) && /Sized in Site Map/.test(circ), circ.slice(0, 400));
    await prime.click('#sf-tomap');
    await prime.waitForSelector('#s-load.on', { timeout: 8000 });
    await prime.fill('#ld-peaks', '1400');
    var ld = await prime.$eval('#ldOut', function (e) { return e.textContent; });
    ok('the load step keeps going and says the unit is sized in Site Map', /Quote required/.test(ld) && /Sized in Site Map/.test(ld), ld.slice(0, 300));
    await prime.click('#ld-tomap');
    await prime.waitForSelector('#s-map.on', { timeout: 8000 });
    await prime.click('#ed-quote');
    await prime.waitForSelector('#s-quote.on', { timeout: 8000 });
    var quote = await prime.$eval('#s-quote', function (e) { return e.textContent; });
    ok('the quote step names the charger and says quote required', /Tesla V4/.test(quote) && /Quote required/.test(quote) && /Sized in Site Map/.test(quote), quote.slice(0, 400));
    await prime.screenshot({ path: path.join(shotDir, 'prime-handoff-quote.png') });
  } catch (e) {
    fails++;
    console.log('FAIL handoff run threw', e && e.stack || e);
  } finally {
    await browser.close();
    srv.close();
  }
  if (errs.length) console.log('page errors (not a failure by themselves): ' + errs.slice(0, 8).join(' | '));
  if (fails) { console.log(fails + ' prime handoff check(s) FAILED'); process.exit(1); }
  console.log('prime handoff: ' + checks + ' checks passed');
})();
