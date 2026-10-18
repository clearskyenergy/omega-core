#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Omega Prime v2, run end to end in Chromium on the Firebase double,
 * beside one pass of live Prime for the before pictures.
 *
 *   Site        address, customer, the tenant's own unit first
 *   Atlas       the shared layer list, dark and satellite, nearest card
 *               with its source line; the score from /api/grid-atlas
 *   Circuit     ComEd at the parcel, the real /api/grid-verdict, the
 *               source line. A second pass with no room is Needs a study.
 *   Load        the real rate book, twelve peaks
 *   Map         the pad rule from /api/prime-fit, then place, conduit, Run
 *   Quote       Open in Site Map is /editor.html?id=…&from=prime
 *   Project     set() on the id Prime chose, with the editor-v2 assignment
 *               and a CRM customer link. No drawing key.
 *   Phone       390px still shows the layer and basemap controls
 *
 * Live Prime, its worker and config.js are not the subject. The before
 * shots only prove the live page still opens. Nothing is fetched except a
 * local Leaflet, when LEAFLET_DIR is set.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var FD = require('./_lib/firebase-double');
var GV = require('../api/_lib/grid-verdict'), UR = require('../api/_lib/utility-rates');
var Fit = require('../api/_lib/prime-fit');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var ROOT = path.join(__dirname, '..'), HOST = '127.0.0.1', fails = 0, checks = 0;
var SHOTS = process.env.PRIME_V2_SHOTS || '/opt/cursor/artifacts/prime-v2';
function ok(name, cond, detail) { checks++; if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 700) : '')); } }

var SITE = { lat: 41.81522, lng: -87.62261 };
var ORG = 'cleancell.example';
var mode = { comed: 'fits' };
var FX = {
  user: { uid: 'rep-1', email: 'rep@cleancell.example', displayName: 'Clean Cell Rep', emailVerified: true },
  docs: {
    'omega_orgs/cleancell.example': { name: 'Clean Cell', slug: 'cleancell', status: 'active' },
    'omega_orgs/cleancell.example/billing/current': { tier: 'standard' },
    'omega_orgs/cleancell.example/storefront/config': { products: [
      { sku: 'CC-2000', name: 'CC-2000', kw: 1000, kwh: 2000, usableKwh: 1900, widthFt: 8, depthFt: 20, transformer: '1500 kVA 480/480 V', disconnect: '2000 A 480 V' },
      { sku: 'MOD-1', name: 'Module', kind: 'component', kwh: 5 }] },
    'termsAcceptances/rep-1': { version: '2026-09-23' }
  }
};
function comedBody() {
  if (mode.comed === 'study') {
    return { features: [{ attributes: { Feeder: 'F0297', SS_N: 'Crawford TSS 21', BESS_HC: 80, PV_HC_kW: 40, EV_HC_kW: 20, Feeder_Q: 0, IN_QUEUE_DATA_REFRESH_DATE: '2026-09-30' } }] };
  }
  return { features: [
    { attributes: { Feeder: 'F0297', SS_N: 'Crawford TSS 21', BESS_HC: 15620, PV_HC_kW: 9000, EV_HC_kW: 8000, Feeder_Q: 4895, IN_QUEUE_DATA_REFRESH_DATE: '2026-09-30' } },
    { attributes: { Feeder: 'F0301', SS_N: 'Crawford TSS 21', BESS_HC: 900, Feeder_Q: 100 } }] };
}
var SUBS = { features: [
  { attributes: { NAME: 'Crawford', MAX_VOLT: 138, MIN_VOLT: 12, LINES: 6, STATUS: 'IN SERVICE', OWNER: 'ComEd' }, geometry: { x: -87.6150, y: 41.8210 } },
  { attributes: { NAME: 'Fisk', MAX_VOLT: 345, STATUS: 'IN SERVICE', OWNER: 'ComEd' }, geometry: { x: -87.6500, y: 41.8500 } }] };
var TX = { features: [{ attributes: { VOLTAGE: 138 }, geometry: { paths: [[[-87.66, 41.80], [-87.60, 41.83]]] } }] };
var RUN = { divisions: [{ name: 'Battery system (planning rate)', base: 900000 }, { name: 'Electrical', base: 180000 }, { name: 'Civil', base: 60000 }],
  total: { base: 1140000, lo: 1000000, hi: 1300000 }, estimateClassPlain: 'Class 4 screening estimate.', pricedBy: 'api/price-site' };
var ATLAS = { score: 72, substations: [{ name: 'Crawford', distanceKm: 0.8, voltageKv: 138 }], lines: [{ voltageKv: 138 }] };
var PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function leafletBody(url) {
  var dir = process.env.LEAFLET_DIR;
  if (!dir) return null;
  var file = path.join(dir, path.basename(new URL(url).pathname));
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

var srv = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x'), p = u.pathname;
  if (p === '/comed-proxy' || p.indexOf('/comed-proxy/') === 0) {
    res.setHeader('Content-Type', 'application/json');
    if (p === '/comed-proxy') return res.end(JSON.stringify({ layers: [{ id: 75 }] }));
    return res.end(JSON.stringify(/\/75\/query/.test(p) ? comedBody() : { features: [] }));
  }
  var file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

function install(ctx) {
  return ctx.addInitScript(FD.source()).then(function () {
    return ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: FX.user, docs: FX.docs, latency: 5, authDomain: HOST });
  });
}
function watch(page, errs) {
  page.on('pageerror', function (e) { errs.push(e.message); });
  page.on('console', function (m) { var t = m.text(); if (m.type() === 'error' && !/^Failed to load resource/.test(t)) errs.push('console: ' + t.slice(0, 240)); });
}
function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, name) });
}
function splashGone(page) {
  return page.waitForFunction(function () { return !document.documentElement.classList.contains('omega-loading'); }, null, { timeout: 10000 });
}

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port, external = [];
  var calls = { verdict: [], rates: [], price: [], fit: [], atlas: [], hosting: [] };
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath(), args: ['--no-sandbox'] });
  var errs = [];
  try {
    async function routeAll(ctx) {
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
        var url = r.request().url();
        function json(o) { return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) }); }
        if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
        if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
        if (/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.(js|css)/.test(url)) {
          var body = leafletBody(url);
          if (!body) { external.push(url.slice(0, 140)); return r.abort(); }
          return r.fulfill({ status: 200, contentType: /\.js$/.test(url) ? 'text/javascript' : 'text/css', body: body });
        }
        if (/geocoding\.geo\.census\.gov/.test(url)) return json({ result: { addressMatches: [{ matchedAddress: '3400 S FEDERAL ST, CHICAGO, IL, 60616', coordinates: { x: SITE.lng, y: SITE.lat } }] } });
        if (/Substations\/FeatureServer\/0\/query|substations\/FeatureServer\/0\/query/i.test(url)) return json(SUBS);
        if (/Transmission_Lines\/FeatureServer\/0\/query/.test(url)) return json(TX);
        if (/arcgisonline\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
        external.push(url.slice(0, 140)); return r.abort();
      });
      await ctx.route(base + '/api/**', function (r) {
        var req = r.request(), u = new URL(req.url());
        function json(s, o) { return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) }); }
        if (u.pathname === '/api/grid-verdict') { calls.verdict.push(req.postDataJSON()); return json(200, GV.judge(req.postDataJSON())); }
        if (u.pathname === '/api/utility-rates') { calls.rates.push(u.searchParams.get('zip')); return json(200, UR.lookup(u.searchParams.get('zip'))); }
        if (u.pathname === '/api/price-site') { calls.price.push(req.postDataJSON()); return json(200, RUN); }
        if (u.pathname === '/api/prime-fit') {
          var body = req.postDataJSON();
          calls.fit.push(body);
          try { return json(200, Fit.fit(body)); }
          catch (e) { return json(e.status || 400, { error: e.message }); }
        }
        if (u.pathname === '/api/grid-atlas') { calls.atlas.push(req.postDataJSON()); return json(200, ATLAS); }
        if (u.pathname === '/api/hosting-capacity') { calls.hosting.push(req.postDataJSON()); return json(200, { covered: false, say: 'should not be asked in Illinois' }); }
        return json(503, { error: 'offline' });
      });
    }

    /* ── before: live Prime still opens ─────────────────────────────── */
    mode.comed = 'fits';
    var liveCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await routeAll(liveCtx);
    await install(liveCtx);
    var live = await liveCtx.newPage();
    watch(live, errs);
    await live.goto(base + '/omega-prime.html', { waitUntil: 'domcontentloaded' });
    await splashGone(live);
    await live.waitForFunction(function () { var s = document.getElementById('unitSel'); return s && s.options.length > 1; }, null, { timeout: 10000 });
    await shot(live, 'before-site.png');
    await live.fill('#addr', '3400 S Federal St, Chicago, IL 60616');
    await live.click('#go');
    await live.waitForFunction(function () { return /substations within/.test(document.getElementById('gaStat').textContent); }, null, { timeout: 8000 });
    await live.click('#ly-sub');
    await live.click('.subicon.near');
    await live.waitForFunction(function () { return /Crawford/.test(document.getElementById('gaInsp').textContent); }, null, { timeout: 4000 });
    await shot(live, 'before-atlas.png');
    await liveCtx.close();

    /* ── v2, the whole path ─────────────────────────────────────────── */
    var ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await routeAll(ctx);
    await install(ctx);
    var p = await ctx.newPage();
    watch(p, errs);
    await p.goto(base + '/omega-prime-v2.html', { waitUntil: 'domcontentloaded' });
    await splashGone(p);
    var listed = await p.waitForFunction(function () {
      var s = document.getElementById('unitSel');
      return s && s.options.length > 1 ? [].map.call(s.options, function (o) { return o.textContent; }) : null;
    }, null, { timeout: 10000 }).then(function (h) { return h.jsonValue(); }, function () { return null; });
    ok('the tenant\'s own product leads, the XXL follows, a component never', listed && /^Clean Cell CC-2000/.test(listed[0]) && /FENECON Industrial XXL/.test(listed[listed.length - 1]) && listed.length === 2, listed);
    ok('the preview names the missing experience helper', /OmegaExperience\.route/.test(await p.$eval('#banner-note', function (e) { return e.textContent; })));
    ok('v2 does not attach the Prime manifest', await p.$eval('head', function (h) { return !h.querySelector('link[rel="manifest"]'); }));
    await shot(p, 'after-site.png');
    await p.fill('#customer', 'Riverside Logistics');
    await p.fill('#addr', '3400 S Federal St, Chicago, IL 60616');
    await p.click('#go');
    await p.waitForSelector('#s-atlas.on');
    await p.waitForFunction(function () {
      var card = document.getElementById('gaInsp');
      return card && /Crawford/.test(card.textContent) && /Source:/.test(card.textContent) && /2026-09-17/.test(card.textContent);
    }, null, { timeout: 8000 });
    ok('layers start on', await p.$eval('#ly-sub', function (b) { return b.classList.contains('on'); }) && await p.$eval('#ly-tx', function (b) { return b.classList.contains('on'); }));
    await p.click('#bm-sat');
    await p.waitForTimeout(200);
    await shot(p, 'after-atlas.png');
    var atlasStat = await p.$eval('#gaStat', function (e) { return e.textContent; });
    ok('substations and transmission both drew', /substations in view/.test(atlasStat) && /Transmission lines: 1/.test(atlasStat), atlasStat);
    await p.click('#ga-go');
    await p.waitForFunction(function () {
      var t = document.getElementById('sfRes').textContent;
      return /Fits|Needs a study|Fits only smaller/.test(t) && /ComEd hosting-capacity service, resolved at the point/.test(t);
    }, null, { timeout: 10000 });
    var circ = await p.$eval('#sfRes', function (e) { return e.textContent; });
    ok('the circuit verdict is the engine\'s, against the chosen unit', calls.verdict.length === 1 && calls.verdict[0].unit.kw === 1000 && calls.verdict[0].circuit.id === 'F0297' && /Fits\./.test(circ) && /10,725 kW/.test(circ), { body: calls.verdict[0], circ: circ.slice(0, 400) });
    ok('the source line names the layer, the queue date and the verdict version', /layer 75/.test(circ) && /BESS_HC/.test(circ) && /Feeder_Q/.test(circ) && /Queue refreshed 2026-09-30/.test(circ) && /OMEGA grid verdict/.test(circ), circ.slice(0, 500));
    ok('Illinois did not ask the non-ComEd hosting route', calls.hosting.length === 0, calls.hosting);
    ok('the substation goes to the engine in km', calls.verdict[0].substation && calls.verdict[0].substation.name === 'Crawford' && calls.verdict[0].substation.kv === 138, calls.verdict[0].substation);
    await shot(p, 'after-circuit.png');
    await p.click('#sf-tomap');

    await p.waitForFunction(function () { return /ComEd/.test(document.getElementById('ldRates').textContent); }, null, { timeout: 8000 });
    ok('the rates are the rate book\'s for the ZIP', calls.rates[0] === '60616', calls.rates);
    await p.fill('#ld-peaks', '1420 1388 1402 1510 1690 1840 1910 1880 1720 1560 1450 1430');
    var ld = await p.$eval('#ldOut', function (e) { return e.textContent; });
    ok('twelve peaks, the demand charge, and the rate book as the source', /12 of 12 months/.test(ld) && /peak 1,910 kW/.test(ld) && /\$381,120/.test(ld) && /rate book/.test(ld), ld);
    await p.click('#ld-go');
    await p.waitForSelector('#s-map.on');

    var made = await p.waitForFunction(function () {
      var l = window.__firebaseDouble.store.log.filter(function (w) { return w.op === 'set' && /^projects\//.test(w.path); });
      return l.length ? l : null;
    }, null, { timeout: 8000 }).then(function (h) { return h.jsonValue(); }, function () { return []; });
    var doc = made[0] && made[0].data;
    ok('one project is written at the id Prime chose', made.length === 1 && made[0].path === 'projects/' + (doc && doc.projectRef && doc.projectRef.projectId), made.map(function (w) { return w.path; }));
    ok('the project is the tenant\'s and the customer\'s', doc && doc.orgId === ORG && doc.client === 'Riverside Logistics' && doc.assignment && doc.assignment.customerId === 'c_riverside_logistics' && doc.assignment.schema === 'omega.assignment/1', doc && { orgId: doc.orgId, client: doc.client, assignment: doc.assignment });
    ok('the CRM link and the project ref point at that customer', doc && doc.projectRef && doc.projectRef.schema === 'omega.project-ref/1' && doc.projectRef.customerId === 'c_riverside_logistics' && doc.crm && doc.crm.links && doc.crm.links[0].role === 'customer' && doc.crm.links[0].accountId === 'c_riverside_logistics', doc && { ref: doc.projectRef, crm: doc.crm });
    ok('prime v2, grid answer and load ride on the record', doc && doc.prime && doc.prime.v === 2 && doc.prime.route === '/omega-prime-v2' && doc.grid && doc.grid.source === 'omega-prime-v2' && doc.grid.verdict.key === 'fits' && doc.load && doc.load.peakKw === 1910, doc && { prime: doc.prime, grid: doc.grid, load: doc.load });
    ok('the unit is the tenant\'s catalog key and no drawing is forged', doc && doc.bessList && doc.bessList[0].catalogKey === 'CLEANCELL-CC-2000' && doc.elements.length === 0 && doc.conduits.length === 0 && !doc.shapes, doc && doc.bessList);

    var box = await p.$eval('#edMap', function (e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    await p.click('#ed-area');
    await p.mouse.move(cx - 160, cy - 90); await p.mouse.down(); await p.mouse.move(cx + 40, cy - 10, { steps: 6 }); await p.mouse.move(cx + 160, cy + 90, { steps: 6 }); await p.mouse.up();
    await p.waitForFunction(function () { return document.getElementById('ed-area').classList.contains('done'); }, null, { timeout: 8000 });
    ok('the pad was judged on the server', calls.fit.length === 1 && calls.fit[0].unit && calls.fit[0].unit.key === 'CLEANCELL-CC-2000' && calls.fit[0].area.wFt > 40, calls.fit);
    await p.click('#ed-place'); await p.mouse.click(cx - 40, cy);
    await p.click('#ed-poi'); await p.mouse.click(cx + 260, cy + 160);
    await p.click('#ed-conduit');
    await p.click('#ed-run');
    await p.waitForFunction(function () { return document.getElementById('ed-run').classList.contains('done'); }, null, { timeout: 8000 });
    ok('Run prices the chosen unit on the server', calls.price.length === 1 && calls.price[0].kw === 1000, calls.price);
    var ready = await p.evaluate(function () {
      return { score: document.getElementById('ready-score').textContent, items: [].map.call(document.querySelectorAll('#ready-list li'), function (li) { return li.className + ' ' + li.textContent; }) };
    });
    ok('readiness is 100 once the price is on the page', ready.score === '100', ready);
    await p.waitForTimeout(900);
    var ups = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return w.op === 'update' && /^projects\//.test(w.path); }); });
    var last = (ups[ups.length - 1] || {}).data || {};
    var DRAWING = ['elements', 'shapes', 'docTabs', 'geoShapes', 'geoElements', 'conduits', 'geoConduits', 'supplyLinks', 'trench', 'annotations'];
    ok('the sketch and the Run update the project', ups.length >= 1 && last['prime.layout'] && last['prime.layout'].area && last['prime.layout'].unit && last['prime.layout'].poi && last['prime.layout'].conduitFt > 0 && last['prime.run'] && last['prime.run'].totalUsd === 1140000, { n: ups.length, keys: Object.keys(last) });
    ok('no update touches a drawing key', ups.every(function (w) { return Object.keys(w.data || {}).every(function (k) { return DRAWING.indexOf(k.split('.')[0]) < 0; }); }), ups.map(function (w) { return Object.keys(w.data || {}); }));
    await shot(p, 'after-map.png');
    await p.click('#ed-quote');
    await p.waitForSelector('#s-quote.on');
    var q = await p.evaluate(function () { return { href: document.getElementById('q-editor').getAttribute('href'), text: document.getElementById('q-editor').textContent, body: document.getElementById('bomBody').textContent, note: document.getElementById('qNote').textContent }; });
    ok('the quote opens the project in Site Map with the hand-off', /^\/editor\.html\?id=[^&]+&from=prime$/.test(q.href) && /Open the project in Site Map/.test(q.text), q);
    ok('the unit routes to its own maker, and the price names its source', /Clean Cell CC-2000/.test(q.body) && /Clean Cell \(full BOM\)/.test(q.body) && !/FENECON/.test(q.body) && /api\/price-site/.test(q.note), q);
    await shot(p, 'after-quote.png');
    var logic = await p.evaluate(function () {
      document.getElementById('q-logic').click();
      return [].map.call(document.querySelectorAll('#s-logic a'), function (a) { return a.getAttribute('href'); });
    });
    ok('Omega Logic is the same three doors', logic.join(',') === '/rfq.html#received,/omega-logic,/logic-custody.html', logic);
    await shot(p, 'after-logic.png');
    await ctx.close();

    /* ── Needs a study, the same source line ────────────────────────── */
    mode.comed = 'study';
    var studyCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await routeAll(studyCtx);
    await install(studyCtx);
    var s = await studyCtx.newPage();
    watch(s, errs);
    await s.goto(base + '/omega-prime-v2.html', { waitUntil: 'domcontentloaded' });
    await splashGone(s);
    await s.waitForFunction(function () { var u = document.getElementById('unitSel'); return u && u.options.length > 1; }, null, { timeout: 10000 });
    await s.fill('#addr', '3400 S Federal St, Chicago, IL 60616');
    await s.click('#go');
    await s.waitForSelector('#ga-go', { timeout: 8000 });
    await s.click('#ga-go');
    await s.waitForFunction(function () {
      var t = document.getElementById('sfRes').textContent;
      return /Needs a study/.test(t) && /resolved at the point \(layer 75\)/.test(t) && /Queue refreshed 2026-09-30/.test(t);
    }, null, { timeout: 10000 });
    await s.evaluate(function () {
      var box = document.getElementById('sfRes');
      var line = box && box.querySelector('.src');
      if (line && line.scrollIntoView) line.scrollIntoView({ block: 'nearest' });
    });
    await shot(s, 'after-study.png');
    await studyCtx.close();

    /* ── a phone still has the layers and both basemaps ─────────────── */
    mode.comed = 'fits';
    var phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await routeAll(phone);
    await install(phone);
    var ph = await phone.newPage();
    watch(ph, errs);
    await ph.goto(base + '/omega-prime-v2.html', { waitUntil: 'domcontentloaded' });
    await splashGone(ph);
    await ph.waitForFunction(function () { var u = document.getElementById('unitSel'); return u && u.options.length > 1; }, null, { timeout: 10000 });
    await shot(ph, 'after-phone-site.png');
    await ph.fill('#addr', '3400 S Federal St, Chicago, IL 60616');
    await ph.click('#go');
    await ph.waitForSelector('#ga-go', { timeout: 8000 });
    var controls = await ph.evaluate(function () {
      function vis(id) { var e = document.getElementById(id); if (!e) return false; var c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden'; }
      return { sub: vis('ly-sub'), tx: vis('ly-tx'), sat: vis('bm-sat') };
    });
    ok('a 390px phone still shows substations, transmission and satellite', controls.sub && controls.tx && controls.sat, controls);
    await shot(ph, 'after-phone-atlas.png');
    await phone.close();
  } catch (e) { fails++; console.log('FAIL the run stopped: ' + (e && e.stack || e)); }
  await browser.close(); srv.close();
  ok('no page error', errs.length === 0, errs);
  ok('nothing reached the network', external.length === 0, external);
  if (fails) { console.log(fails + ' Omega Prime v2 check(s) FAILED'); process.exit(1); }
  console.log('Omega Prime v2: ' + checks + ' checks passed. Shots in ' + SHOTS);
})();
