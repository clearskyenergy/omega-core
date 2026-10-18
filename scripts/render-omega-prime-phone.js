#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   render-omega-prime-phone.js — Omega Prime at a phone size, and the
   install page. Signed out. Asserts no horizontal overflow, a desktop
   window still uses the side drawer, the service worker controls the app
   and not the rest of the site, /api/ and /__/ are not answered from
   cache, and Chrome reports the page installable.

   PLAYWRIGHT=/tmp/tools/node_modules/playwright-core node scripts/render-omega-prime-phone.js
   Screenshots: $PRIME_PHONE_SHOTS or /opt/cursor/artifacts/screenshots */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var PW = process.env.PLAYWRIGHT || 'playwright';
var chromium = require(PW).chromium;
var ROOT = path.join(__dirname, '..');
var CHROME = process.env.CHROME || (fs.existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined);
var SHOTS = process.env.PRIME_PHONE_SHOTS || '/opt/cursor/artifacts/screenshots';
var fails = 0, checks = 0;
function ok(name, cond, detail) {
  checks++;
  if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 500) : '')); }
  else console.log('ok   ' + name);
}

var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
var hits = { api: 0, auth: 0 };
var srv = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  if (p.indexOf('/api/') === 0) { hits.api++; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ n: hits.api, marker: 'live-' + hits.api })); }
  if (p.indexOf('/__/') === 0) { hits.auth++; res.setHeader('Content-Type', 'text/plain'); return res.end('auth-live-' + hits.auth); }
  if (p === '/omega-prime') p = '/omega-prime.html';
  if (p === '/omega-prime/install') p = '/omega-prime/install.html';
  var file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(404); return res.end(); }
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('missing ' + p); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(fs.readFileSync(file));
});

var LEAFLET = 'window.L={layerGroup:function(){var g={addLayer:function(){return g},addTo:function(){return g},clearLayers:function(){return g}};return g},map:function(){var m={setView:function(){return m},on:function(){return m},off:function(){return m},invalidateSize:function(){return m},addLayer:function(){return m},remove:function(){return m},getContainer:function(){return document.createElement("div")}};return m},marker:function(){var m={addTo:function(){return m},bindTooltip:function(){return m},on:function(){return m}};return m},polyline:function(){var m={addTo:function(){return m}};return m},tileLayer:function(){var m={addTo:function(){return m}};return m},circleMarker:function(){var m={addTo:function(){return m},on:function(){return m}};return m}};';

(async function () {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  function arm(ctx) {
    return ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/leaflet\.min\.js/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: LEAFLET });
      if (/leaflet\.min\.css/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (/firebasejs|fonts\.(googleapis|gstatic)/.test(url)) return r.fulfill({ status: 200, contentType: /css/.test(url) ? 'text/css' : 'text/javascript', body: '' });
      return r.abort();
    });
  }
  async function settle(page) {
    await page.evaluate(function () { if (window.OmegaSplash && OmegaSplash.done) OmegaSplash.done(); var s = document.getElementById('omega-splash'); if (s) s.remove(); });
  }
  function measure() {
    var doc = document.documentElement;
    var screens = [].map.call(document.querySelectorAll('.screen'), function (s) {
      var map = s.querySelector('.mapwrap, .edmap');
      var panel = s.querySelector('.drawer, .sfres, .edside');
      var mr = map ? map.getBoundingClientRect() : null;
      var pr = panel ? panel.getBoundingClientRect() : null;
      return { id: s.id, on: s.classList.contains('on'), w: Math.round(s.scrollWidth), mapH: mr ? Math.round(mr.height) : 0, mapW: mr ? Math.round(mr.width) : 0, panelH: pr ? Math.round(pr.height) : 0, panelTop: pr ? Math.round(pr.top) : 0, mapTop: mr ? Math.round(mr.top) : 0 };
    });
    var path = document.querySelector('#path button');
    var go = document.getElementById('go');
    var addr = document.getElementById('addr');
    var drawer = document.querySelector('.drawer');
    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      appOverflow: document.getElementById('app').scrollWidth - document.getElementById('app').clientWidth,
      clientW: doc.clientWidth,
      pathFont: path ? parseFloat(getComputedStyle(path).fontSize) : 0,
      pathH: path ? path.getBoundingClientRect().height : 0,
      goH: go ? go.getBoundingClientRect().height : 0,
      addrFont: addr ? parseFloat(getComputedStyle(addr).fontSize) : 0,
      drawerW: drawer ? Math.round(drawer.getBoundingClientRect().width) : 0,
      screens: screens
    };
  }

  try {
    var phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await arm(phone);
    var errs = [];
    var p = await phone.newPage();
    p.on('pageerror', function (e) { errs.push(e.message); });
    await p.goto(base + '/omega-prime', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#path button', { timeout: 8000 });
    await settle(p);
    var ids = await p.$$eval('.screen', function (list) { return list.map(function (s) { return s.id; }); });
    ok('seven steps are on the page', ids.length >= 7, ids);
    for (var i = 0; i < ids.length; i++) {
      await p.evaluate(function (id) {
        [].forEach.call(document.querySelectorAll('.screen'), function (s) { s.classList.toggle('on', s.id === id); });
      }, ids[i]);
      await p.waitForTimeout(80);
      var m = await p.evaluate(measure);
      var step = ids[i].replace(/^s-/, '');
      ok(step + ' does not overflow horizontally', m.overflow <= 1 && m.appOverflow <= 1, m);
      var scr = m.screens.filter(function (s) { return s.id === ids[i]; })[0];
      if (scr && scr.mapH) ok(step + ' map is full width and has height', scr.mapW >= 370 && scr.mapH >= 180, scr);
      if (scr && scr.panelH && scr.mapTop) ok(step + ' panel sits below the map', scr.panelTop >= scr.mapTop + scr.mapH - 2, scr);
      var gap = await p.evaluate(function () {
        var g = document.getElementById('guide').getBoundingClientRect();
        var s = document.querySelector('.screen.on').getBoundingClientRect();
        return Math.round(g.top - s.bottom);
      });
      ok(step + ' guide sits under the step', gap >= -2, gap);
      await p.screenshot({ path: path.join(SHOTS, 'omega-prime-phone-' + step + '.png') });
    }
    await p.evaluate(function () { [].forEach.call(document.querySelectorAll('.screen'), function (s) { s.classList.toggle('on', s.id === 's-start'); }); });
    var start = await p.evaluate(measure);
    ok('stepper control is a touch target and the address will not zoom the page', start.pathH >= 44 && start.goH >= 44 && start.addrFont >= 16, start);
    ok('no page error while laying out the phone', errs.length === 0, errs);

    var desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await arm(desk);
    var d = await desk.newPage();
    var derrs = [];
    d.on('pageerror', function (e) { derrs.push(e.message); });
    await d.goto(base + '/omega-prime', { waitUntil: 'domcontentloaded' });
    await d.waitForSelector('#path button');
    await settle(d);
    await d.evaluate(function () { [].forEach.call(document.querySelectorAll('.screen'), function (s) { s.classList.toggle('on', s.id === 's-atlas'); }); });
    var dm = await d.evaluate(measure);
    ok('desktop keeps the side drawer and the step labels', dm.drawerW > 200 && dm.drawerW < 400 && dm.pathFont >= 11 && dm.overflow <= 1, dm);
    ok('desktop layout throws nothing', derrs.length === 0, derrs);
    await d.screenshot({ path: path.join(SHOTS, 'omega-prime-desktop-atlas.png') });

    var inst = await phone.newPage();
    await inst.goto(base + '/omega-prime/install', { waitUntil: 'domcontentloaded' });
    await inst.waitForSelector('#qr svg');
    var qrBox = await inst.evaluate(function () {
      var svg = document.querySelector('#qr svg');
      var r = svg.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, url: document.getElementById('url').value, share: /Share/.test(document.body.textContent) && /Add to Home Screen/.test(document.body.textContent) };
    });
    ok('install page fits the phone and shows the Safari steps', qrBox.overflow <= 1 && qrBox.w >= 180 && qrBox.share && /\/omega-prime\/install$/.test(qrBox.url), qrBox);
    var qrPng = path.join(SHOTS, 'omega-prime-qr.png');
    await inst.locator('#qr svg').screenshot({ path: qrPng });
    var decoded = '';
    try {
      function load(name) { try { return require(name); } catch (e) { return require('/tmp/tools/node_modules/' + name); } }
      var PNG = load('pngjs').PNG;
      var jsQR = load('jsqr');
      var img = PNG.sync.read(fs.readFileSync(qrPng));
      var code = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
      decoded = code && code.data;
    } catch (e) { decoded = 'err ' + e.message; }
    ok('the QR code reads as this install page', decoded === base + '/omega-prime/install', decoded);
    await inst.screenshot({ path: path.join(SHOTS, 'omega-prime-phone-install.png') });

    async function installable(url) {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prime-pwa-'));
      var ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, args: ['--no-sandbox'], viewport: { width: 390, height: 844 } });
      await arm(ctx);
      var page = ctx.pages()[0] || await ctx.newPage();
      await page.goto(base + url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(function () { return navigator.serviceWorker.controller; }, null, { timeout: 8000 }).catch(function () {});
      if (!(await page.evaluate(function () { return !!navigator.serviceWorker.controller; }))) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(function () { return navigator.serviceWorker.controller; }, null, { timeout: 8000 });
      }
      var session = await ctx.newCDPSession(page);
      var info = await session.send('Page.getInstallabilityErrors');
      var manifest = await session.send('Page.getAppManifest');
      await ctx.close();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
      return { errors: info.installabilityErrors || info.errors || info, manifest: manifest && manifest.errors, url: manifest && manifest.url };
    }
    var appInst = await installable('/omega-prime');
    ok('Chrome reports Omega Prime installable', !appInst.errors || appInst.errors.length === 0, appInst);
    var landInst = await installable('/omega-prime/install');
    ok('the install page is installable too', !landInst.errors || landInst.errors.length === 0, landInst);

    var swc = await browser.newContext();
    await arm(swc);
    var sw = await swc.newPage();
    await sw.goto(base + '/omega-prime', { waitUntil: 'domcontentloaded' });
    await sw.waitForFunction(function () { return navigator.serviceWorker.controller; }, null, { timeout: 8000 }).catch(function () {});
    if (!(await sw.evaluate(function () { return !!navigator.serviceWorker.controller; }))) await sw.reload({ waitUntil: 'domcontentloaded' });
    await sw.waitForFunction(function () { return navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.indexOf('omega-prime-sw.js') > 0; });
    var scope = await sw.evaluate(function () { return navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL; });
    hits.api = 0; hits.auth = 0;
    var api = await sw.evaluate(async function () {
      var a = await (await fetch('/api/utility-rates?zip=60616', { cache: 'no-store' })).json();
      var b = await (await fetch('/api/utility-rates?zip=60616', { cache: 'no-store' })).json();
      var auth = await (await fetch('/__/auth/iframe', { cache: 'no-store' })).text();
      return { a: a, b: b, auth: auth };
    });
    ok('API and auth are fetched live, not from the shell cache', hits.api >= 2 && hits.auth >= 1 && api.a.n !== api.b.n && /auth-live-/.test(api.auth), { hits: hits, api: api });
    var other = await swc.newPage();
    await other.goto(base + '/config.js', { waitUntil: 'domcontentloaded' });
    var controlled = await other.evaluate(function () { return !!(navigator.serviceWorker.controller); });
    ok('a page outside Omega Prime is not controlled', controlled === false, { script: scope, controlled: controlled });
    await swc.setOffline(true);
    var off = await swc.newPage();
    var offStatus = 'threw';
    try {
      var res = await off.goto(base + '/omega-prime', { waitUntil: 'domcontentloaded', timeout: 8000 });
      offStatus = res ? res.status() : 'no-response';
    } catch (e) { offStatus = e.message.slice(0, 180); }
    var offTitle = '';
    try { offTitle = await off.title(); } catch (e2) {}
    ok('offline, the app shell still opens', offTitle.indexOf('Omega Prime') >= 0, { status: offStatus, title: offTitle });
  } catch (e) {
    fails++;
    console.log('FAIL the phone run stopped: ' + (e && e.stack || e));
  }
  await browser.close();
  srv.close();
  if (fails) { console.log(fails + ' phone check(s) FAILED'); process.exit(1); }
  console.log('Omega Prime phone: ' + checks + ' checks passed. Shots in ' + SHOTS);
})();
