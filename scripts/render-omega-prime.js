#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Omega Prime, run end to end in Chromium on the Firebase double
 * (scripts/_lib/firebase-double.js), signed in as a manufacturer's rep:
 *   Site      the address, and the unit list led by the tenant's OWN product
 *             (omega_orgs/{org}/storefront/config.products), then the
 *             CleanCell catalog, then the XXL
 *   Atlas     substations from the public service, the nearest opened
 *   Circuit   ComEd's answer through omega-comed-layers.js probePoint, the
 *             verdict from the REAL engine behind /api/grid-verdict
 *   Load      the utility from the REAL rate book behind /api/utility-rates,
 *             twelve peaks typed off the bill
 *   Map       the project CREATED (orgId, the unit as a battery entry, the
 *             grid answer, the load, the site point), then the area, the
 *             unit, the service, conduit and Run, each UPDATING the project
 *             with no drawing key
 *   Quote     "Open the project in Site Map" is /editor.html?id=…&from=prime
 * Every outside service is answered from a fixture; the one thing fetched
 * is Leaflet, from cdnjs as the page loads it (LEAFLET_DIR serves a local
 * copy, as scripts/test-sitefinder-ui.js does). Fails on a page error, a stray write, or a step that does not
 * land.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var FD = require('./_lib/firebase-double');
var GV = require('../api/_lib/grid-verdict'), UR = require('../api/_lib/utility-rates');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var ROOT = path.join(__dirname, '..'), HOST = '127.0.0.1', fails = 0, checks = 0;
function ok(name, cond, detail) { checks++; if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 600) : '')); } }

var SITE = { lat: 41.81522, lng: -87.62261 };
var ORG = 'cleancell.example';
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
var COMED = { features: [
  { attributes: { Feeder: 'F0297', SS_N: 'Crawford TSS 21', BESS_HC: 15620, PV_HC_kW: 9000, EV_HC_kW: 8000, Feeder_Q: 4895, IN_QUEUE_DATA_REFRESH_DATE: '2026-09-30' } },
  { attributes: { Feeder: 'F0301', SS_N: 'Crawford TSS 21', BESS_HC: 900, Feeder_Q: 100 } }] };
var SUBS = { features: [
  { attributes: { NAME: 'Crawford', MAX_VOLT: 138, MIN_VOLT: 12, LINES: 6, STATUS: 'IN SERVICE', OWNER: 'ComEd' }, geometry: { x: -87.6150, y: 41.8210 } },
  { attributes: { NAME: 'Fisk', MAX_VOLT: 345, STATUS: 'IN SERVICE', OWNER: 'ComEd' }, geometry: { x: -87.6500, y: 41.8500 } }] };
var TX = { features: [{ attributes: { VOLTAGE: 138 }, geometry: { paths: [[[-87.66, 41.80], [-87.60, 41.83]]] } }] };
var RUN = { divisions: [{ name: 'Battery system (planning rate)', base: 900000 }, { name: 'Electrical', base: 180000 }, { name: 'Civil', base: 60000 }],
  total: { base: 1140000, lo: 1000000, hi: 1300000 }, estimateClassPlain: 'Class 4 screening estimate.', pricedBy: 'api/price-site' };
var PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

var srv = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x'), p = u.pathname;
  if (p === '/comed-proxy' || p.indexOf('/comed-proxy/') === 0) {
    res.setHeader('Content-Type', 'application/json');
    if (p === '/comed-proxy') return res.end(JSON.stringify({ layers: [{ id: 75 }] }));
    return res.end(JSON.stringify(/\/75\/query/.test(p) ? COMED : { features: [] }));
  }
  var file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port, external = [], calls = { verdict: [], rates: [], price: [] };
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var errs = [];
  try {
    var ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      function json(o) { return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) }); }
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.(js|css)/.test(url)) {
        /* the one library fetched as the page fetches it, as
           scripts/test-sitefinder-ui.js does; LEAFLET_DIR serves a local copy */
        var lf = process.env.LEAFLET_DIR && path.join(process.env.LEAFLET_DIR, path.basename(new URL(url).pathname));
        return lf && fs.existsSync(lf) ? r.fulfill({ status: 200, contentType: /\.js$/.test(url) ? 'text/javascript' : 'text/css', body: fs.readFileSync(lf) }) : r['continue']();
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
      if (u.pathname === '/api/grid-verdict') { var b = req.postDataJSON(); calls.verdict.push(b); return json(200, GV.judge(b)); }
      if (u.pathname === '/api/utility-rates') { calls.rates.push(u.searchParams.get('zip')); return json(200, UR.lookup(u.searchParams.get('zip'))); }
      if (u.pathname === '/api/price-site') { calls.price.push(req.postDataJSON()); return json(200, RUN); }
      return json(503, { error: 'offline' });
    });
    await ctx.addInitScript(FD.source());
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: FX.user, docs: FX.docs, latency: 5, authDomain: HOST });
    var p = await ctx.newPage();
    p.on('pageerror', function (e) { errs.push(e.message); });
    p.on('console', function (m) { var t = m.text(); if (m.type() === 'error' && !/^Failed to load resource/.test(t)) errs.push('console: ' + t.slice(0, 240)); });
    await p.goto(base + '/omega-prime.html', { waitUntil: 'domcontentloaded' });

    /* Site: the tenant's own product leads the list */
    var listed = await p.waitForFunction(function () { var s = document.getElementById('unitSel'); if (!s || !s.options.length) return null; var names = [].map.call(s.options, function (o) { return o.textContent; }); return /^Clean Cell CC-2000/.test(names[0]) ? names : null; }, null, { timeout: 10000 }).then(function (h) { return h.jsonValue(); }, function () { return null; });
    ok('the tenant\'s own product leads, the CleanCell catalog is on the list, the XXL is last', listed && /^Clean Cell CC-2000/.test(listed[0]) && listed.some(function (t) { return /CleanCell R60/.test(t); }) && listed.some(function (t) { return /CC290\/125/.test(t); }) && listed.some(function (t) { return /LG JP-2/.test(t); }) && listed.some(function (t) { return /Smart Module/.test(t); }) && /FENECON Industrial XXL/.test(listed[listed.length - 1]), listed);
    await p.fill('#addr', '3400 S Federal St, Chicago, IL 60616');
    await p.click('#go');
    await p.waitForSelector('#s-atlas.on');
    ok('the unit is fixed once the site starts', await p.$eval('#unitSel', function (s) { return s.disabled; }));

    /* Atlas */
    await p.waitForFunction(function () { return /substations within/.test(document.getElementById('gaStat').textContent); }, null, { timeout: 8000 });
    await p.click('#ly-sub');
    await p.click('.subicon.near');
    await p.click('#bm-sat');
    await p.click('#ga-go');

    /* Circuit: the server's verdict */
    await p.waitForFunction(function () { return /Fits|Needs a study|Fits only smaller/.test(document.getElementById('sfRes').textContent); }, null, { timeout: 10000 });
    var circ = await p.$eval('#sfRes', function (e) { return e.textContent; });
    ok('the circuit verdict is the engine\'s, against the chosen unit', calls.verdict.length === 1 && calls.verdict[0].unit.kw === 1000 && calls.verdict[0].circuit.id === 'F0297' && /Fits\./.test(circ) && /10,725 kW/.test(circ), { body: calls.verdict[0], circ: circ.slice(0, 300) });
    ok('the substation goes to the engine in km', calls.verdict[0] && calls.verdict[0].substation && calls.verdict[0].substation.name === 'Crawford' && calls.verdict[0].substation.kv === 138 && calls.verdict[0].substation.km > 0.5 && calls.verdict[0].substation.km < 1.5, calls.verdict[0] && calls.verdict[0].substation);
    await p.click('#sf-tomap');

    /* Load */
    await p.waitForFunction(function () { return /ComEd/.test(document.getElementById('ldRates').textContent); }, null, { timeout: 8000 });
    ok('the rates are the rate book\'s for the address\'s ZIP', calls.rates[0] === '60616', calls.rates);
    await p.fill('#ld-peaks', '1420 1388 1402 1510 1690 1840 1910 1880 1720 1560 1450 1430');
    var ld = await p.$eval('#ldOut', function (e) { return e.textContent; });
    ok('twelve peaks read, the demand charge at the rate book\'s rate', /12 of 12 months/.test(ld) && /peak 1,910 kW/.test(ld) && /about \$381,120 at \$19\.85\/kW/.test(ld), ld);
    await p.click('#ld-tomap');
    await p.waitForSelector('#s-map.on');

    /* The project */
    var made = await p.waitForFunction(function () { var l = window.__firebaseDouble.store.log.filter(function (w) { return w.op === 'add' && /^projects\//.test(w.path); }); return l.length ? l : null; }, null, { timeout: 8000 }).then(function (h) { return h.jsonValue(); }, function () { return []; });
    var doc = made[0] && made[0].data;
    ok('one project is created', made.length === 1, made.length);
    ok('the project is the tenant\'s, homed as the rules home the caller', doc && doc.orgId === ORG && doc.uid === 'rep-1' && doc.type === 'bess', doc && { orgId: doc.orgId, type: doc.type });
    ok('the unit is configured as the editor\'s battery entry by catalog key', doc && doc.bessList && doc.bessList[0].catalogKey === 'CLEANCELL-CC-2000' && doc.bessList[0].kw === '1000', doc && doc.bessList);
    ok('the grid answer and the load ride on the project', doc && doc.grid && doc.grid.verdict.key === 'fits' && doc.grid.circuit.netKw === 10725 && doc.load && doc.load.peakKw === 1910 && doc.load.months === 12, doc && { grid: doc.grid, load: doc.load });
    ok('Site Map opens on the site point', doc && doc.mapState && Math.abs(doc.mapState.lat - SITE.lat) < 1e-6 && doc.mapState.zoom === 19, doc && doc.mapState);
    ok('no drawing is forged on the record', doc && doc.elements.length === 0 && doc.conduits.length === 0 && !doc.shapes && !doc.geoElements);

    /* Map: area, unit, service, conduit, Run */
    var box = await p.$eval('#edMap', function (e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    await p.click('#ed-area');
    await p.evaluate(function (pt) {
      var el = document.getElementById('edMap');
      function fire(type) {
        el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
      }
      fire('pointerdown'); fire('pointerup');
    }, { x: cx, y: cy });
    var tapped = await p.evaluate(function () {
      return { done: document.getElementById('ed-area').classList.contains('done'), place: !document.getElementById('ed-place').classList.contains('dis'), side: document.getElementById('edSide').textContent.indexOf('BESS area') >= 0 };
    });
    ok('a finger tap drops a pad instead of rejecting the draw', tapped.done && tapped.place && tapped.side, tapped);
    await p.click('#ed-area');
    await p.mouse.move(cx - 160, cy - 90); await p.mouse.down(); await p.mouse.move(cx + 40, cy - 10, { steps: 6 }); await p.mouse.move(cx + 160, cy + 90, { steps: 6 }); await p.mouse.up();
    await p.click('#ed-place'); await p.mouse.click(cx - 40, cy);
    await p.click('#ed-poi'); await p.mouse.click(cx + 260, cy + 160);
    await p.click('#ed-conduit');
    await p.click('#ed-run');
    await p.waitForFunction(function () { return document.getElementById('ed-run').classList.contains('done'); }, null, { timeout: 8000 });
    ok('Run prices the chosen unit\'s size on the server', calls.price.length === 1 && calls.price[0].kw === 1000 && calls.price[0].hours === 2, calls.price);
    await p.waitForTimeout(900);
    var ups = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return w.op === 'update' && /^projects\//.test(w.path); }); });
    var last = ups[ups.length - 1] || {}, ld2 = last.data || {};
    var DRAWING = ['elements', 'shapes', 'docTabs', 'geoShapes', 'geoElements', 'conduits', 'geoConduits', 'supplyLinks', 'trench', 'annotations'];
    ok('the sketch and the Run update the project', ups.length >= 1 && ld2['prime.layout'] && ld2['prime.layout'].area && ld2['prime.layout'].unit && ld2['prime.layout'].poi && ld2['prime.layout'].conduitFt > 0 && ld2['prime.run'] && ld2['prime.run'].totalUsd === 1140000, { n: ups.length, last: ld2 });
    ok('no update touches a drawing key', ups.every(function (w) { return Object.keys(w.data || {}).every(function (k) { return DRAWING.indexOf(k.split('.')[0]) < 0; }); }), ups.map(function (w) { return Object.keys(w.data || {}); }));
    var sideLink = await p.$eval('#edSide', function (e) { var a = e.querySelector('a.primary'); return a ? a.getAttribute('href') : ''; });
    ok('the side panel links the saved project into Site Map', /^\/editor\.html\?id=[^&]+&from=prime$/.test(sideLink), sideLink);

    /* Quote */
    await p.click('#ed-quote');
    await p.waitForSelector('#s-quote.on');
    var q = await p.evaluate(function () { return { href: document.getElementById('q-editor').getAttribute('href'), text: document.getElementById('q-editor').textContent, body: document.getElementById('bomBody').textContent }; });
    ok('the quote opens the project in Site Map with the hand-off', /^\/editor\.html\?id=[^&]+&from=prime$/.test(q.href) && /Open the project in Site Map/.test(q.text), q);
    ok('the unit routes to its own maker', /Clean Cell CC-2000/.test(q.body) && /Clean Cell \(full BOM\)/.test(q.body) && !/FENECON/.test(q.body), q.body.slice(0, 300));
    if (process.env.PRIME_SHOTS) {
      fs.mkdirSync(process.env.PRIME_SHOTS, { recursive: true });
      await p.screenshot({ path: path.join(process.env.PRIME_SHOTS, 'prime-quote.png') });
      await p.click('#path button:nth-child(5)'); await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(process.env.PRIME_SHOTS, 'prime-map.png') });
    }
  } catch (e) { fails++; console.log('FAIL the run stopped: ' + (e && e.message)); }
  await browser.close(); srv.close();
  ok('no page error', errs.length === 0, errs);
  ok('nothing reached the network', external.length === 0, external);
  if (fails) { console.log(fails + ' Omega Prime check(s) FAILED'); process.exit(1); }
  console.log('Omega Prime: ' + checks + ' checks passed; site to quote on the Firebase double, the real grid verdict and rate book, the project made and kept, nothing fetched but Leaflet.');
})();
