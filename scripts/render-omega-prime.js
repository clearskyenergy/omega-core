#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Omega Prime, run end to end in Chromium on the Firebase double
 * (scripts/_lib/firebase-double.js), signed in as a workspace's rep, with
 * the REAL server doors behind /api/ running on the Firestore double
 * (scripts/_lib/firestore-double.js, api/_lib/admin mocked as the endpoint
 * tests mock it):
 *   Site      the unit list: the workspace's own product, then Clean Cell's
 *             Rev H units and the R60, never FENECON; a unit with no released
 *             footprint asks for the submittal's L × W; the project is
 *             CREATED at Start and the address becomes /omega-prime?id=
 *   Atlas     substations from the public service, the nearest opened, the
 *             serving utility named in the inspector
 *   Circuit   the national door, POST /api/hosting-capacity, the REAL run()
 *             on a network double answering ComEd's service: F0297 and
 *             10,725 kW of room, the utility's own map to check it
 *   Load      the REAL rate book behind /api/utility-rates, asked for the
 *             utility the circuit step named (eia + name), the bill's peaks
 *   Map       the area, the unit and its gear by PP.arrange, the service and
 *             the conduit, the Run on the REAL /api/price-site; every change a
 *             dotted patch with no drawing key; layout v2 with its hash
 *   Site Map  "Open the project in Site Map" writes the pending change
 *             BEFORE it leaves
 *   Resume    /omega-prime?id= brings the whole session back, writing nothing
 *   Proposal  the REAL /api/customer-quote: preview, the workspace's company
 *             details through the REAL /api/tenant-branding, save (linked to
 *             the project and its map), print, send as a link, the design
 *             changed (stale) and saved again, the deck drawn with the plan
 *   Track     the customer opens and approves (the door's public branch);
 *             the order is refused (no Omega Logic) in plain words, retried
 *             once Omega Logic is on; the ladder and the three links
 *   Phone     390 px: the resumed Track and the reopened proposal, its form
 *             filled from the saved quote, no sideways scroll
 *   Mesa      29 W Main St, Mesa AZ: the territory layers name Salt River
 *             Project, Arizona Public Service and the City of Mesa; downtown
 *             Mesa is inside the city, so City of Mesa leads, SRP is named
 *             beside it with its islands caution, nothing is confident, and
 *             no ComEd wording appears anywhere
 * Every outside service is answered from a fixture; the one thing fetched
 * is Leaflet, from cdnjs as the page loads it (LEAFLET_DIR serves a local
 * copy, as scripts/test-sitefinder-ui.js does). PRIME_SHOTS=<dir> saves a
 * screenshot of each screen. Fails on a page error, a stray write, an
 * unexpected server error, or a step that does not land.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ROOT = path.join(__dirname, '..'), HOST = '127.0.0.1', fails = 0, checks = 0;
var SHOTS = process.env.PRIME_SHOTS || '';
function ok(name, cond, detail) { checks++; if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 700) : '')); } }
delete process.env.MAIL_USER; delete process.env.MAIL_PASS; delete process.env.MAIL_FROM; delete process.env.TENANT_WILDCARD_LIVE; delete process.env.PUBLIC_BASE_URL;

/* ── the server: the real doors on the Firestore double ─────────────── */
var FD = require('./_lib/firebase-double'), F = require('./_lib/firestore-double');
var DB = new F.DB(); DB.serial = true;
var ORG = 'cleancell.example';
var REP = { uid: 'rep-1', email: 'rep@cleancell.example', orgId: ORG, staff: false, claims: { email_verified: true, name: 'Clean Cell Rep' } };
function httpError(st, m) { var e = new Error(m); e.status = st; return e; }
function safeOrg(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : ''; }
async function isTenantAdmin(c, org) { if (c.staff) return true; if (c.orgId !== org) return false; var s = await DB.doc('omega_orgs/' + org + '/members/' + c.uid).get(); var d = s.exists ? s.data() : null; return !!d && d.status !== 'disabled' && (d.role === 'owner' || d.role === 'admin'); }
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, httpError: httpError, db: function () { return DB; }, init: function () { return {}; },
  authenticate: function (req) { return /^Bearer double-token-/.test((req.headers || {}).authorization || '') ? Promise.resolve(JSON.parse(JSON.stringify(REP))) : Promise.reject(httpError(401, 'missing bearer token')); },
  safeOrg: safeOrg, orgOf: function (e) { return safeOrg(String(e || '').split('@')[1]); }, isDegraded: function () { return false; }, isTenantAdmin: isTenantAdmin,
  clientAdmin: async function (c, org) { if (!(await isTenantAdmin(c, org))) return false; var s = await DB.doc('omega_orgs/' + org).get(); return s.exists && (s.data() || {}).status === 'active'; },
  canActInOrg: async function (c, org) { return c.staff || c.orgId === org; },
  billingOf: async function (org) { var s = await DB.doc('omega_orgs/' + org + '/billing/current').get(); return s.exists ? s.data() : { tier: 'standard', addons: [], toolOverrides: {} }; },
  FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; } });
var H = require('../api/hosting-capacity')._helpers, CS = require('../api/_lib/comed-service');
var QUOTE = require('../api/customer-quote'), BRANDING = require('../api/tenant-branding'), RATES = require('../api/utility-rates'), PRICE = require('../api/price-site');
var PP = require('../omega-prime-project.js');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;

var PRODUCTS = [
  { sku: 'CC-2000', name: 'CC-2000', kw: 1000, kwh: 2000, usableKwh: 1900, widthFt: 8, depthFt: 20, transformer: '1500 kVA 480/480 V', disconnect: '2000 A 480 V' },
  { sku: 'MOD-1', name: 'Module', kind: 'component', kwh: 5 }];
DB.seed('omega_orgs/' + ORG, { name: 'Clean Cell', slug: 'cleancell', status: 'active', domains: [] });
DB.seed('omega_orgs/' + ORG + '/billing/current', { tier: 'standard' });            /* no Omega Logic yet: the first hand-off is refused */
DB.seed('omega_orgs/' + ORG + '/members/rep-1', { role: 'admin', status: 'active', name: 'Clean Cell Rep', email: REP.email });
DB.seed('omega_orgs/' + ORG + '/storefront/config', { products: PRODUCTS });
DB.seed('omega_orgs/' + ORG + '/fulfillment/config', { enabled: true, accounting: 'tenant' });

var IP = 0;
function door(handler, method, body, query, auth) {
  var req = { method: method, headers: { 'x-forwarded-for': '10.1.0.' + (++IP % 250), 'user-agent': 'render', authorization: auth || '' }, body: body || {}, query: query || {} };
  var res = { setHeader: function () {} };
  return Promise.resolve().then(function () { return handler(req, res); }).then(function (b) { return { status: 200, body: b }; },
    function (e) { if (!e.status) serverErrs.push(String(e && e.stack || e).slice(0, 400)); return { status: e.status || 500, body: { error: e.message } }; });
}
var serverErrs = [];

/* ── the browser's fixtures ─────────────────────────────────────────── */
var SITE = { lat: 41.81522, lng: -87.62261 }, MESA = { lat: 33.4152, lng: -111.8315 };
var FX = {
  user: { uid: 'rep-1', email: REP.email, displayName: 'Clean Cell Rep', emailVerified: true },
  docs: {
    'omega_orgs/cleancell.example': { name: 'Clean Cell', slug: 'cleancell', status: 'active' },
    'omega_orgs/cleancell.example/billing/current': { tier: 'standard' },
    'omega_orgs/cleancell.example/members/rep-1': { role: 'admin', status: 'active', email: REP.email },
    'omega_orgs/cleancell.example/storefront/config': { products: PRODUCTS },
    'termsAcceptances/rep-1': { version: '2026-09-23' }
  }
};
function Esri(rows) { return { features: rows.map(function (r) { return { attributes: { NAME: r[1], Utility_ID: r[0], TYPE: r[2], STATE: r[3] || '', HOLDING_CO: r[1], Total_Customer_Count_2024: r[4] || null, Shape__Area: r[5] || null } }; }) }; }
var COMED = { features: [
  { attributes: { Feeder: 'F0297', SS_N: 'Crawford TSS 21', BESS_HC: 15620, PV_HC_kW: 16000, EV_HC_kW: 16000, Feeder_Q: 4895, Queue_RD: '09/30/2026' } },
  { attributes: { Feeder: 'F0301', SS_N: 'Crawford TSS 21', BESS_HC: 900, Feeder_Q: 100, Queue_RD: '09/30/2026' } }] };
/* the territory layers and the utilities' maps, as the door asks them */
function netFor(lat, lng) {
  var mesa = lng < -100;
  return function (url) {
    if (/Electricity_Rates_H3_Res5/.test(url)) return Promise.resolve(mesa
      ? Esri([['12351', 'CITY OF MESA - (AZ)', 'MUNICIPAL', 'AZ', 18101, 4.3e9], ['16572', 'SALT RIVER PROJECT', 'POLITICAL SUBDIVISION', 'AZ', 1100000, 3e10], ['803', 'ARIZONA PUBLIC SERVICE CO', 'INVESTOR OWNED', 'AZ', 1400037, 1.3e11]])
      : Esri([['4110', 'COMMONWEALTH EDISON CO', 'INVESTOR OWNED', 'IL']]));
    if (/tigerweb/.test(url)) return Promise.resolve(mesa ? { features: [{ attributes: { NAME: 'Mesa city', BASENAME: 'Mesa' } }] } : { features: [] });
    if (url.indexOf(CS.SERVICE) === 0) return Promise.resolve(JSON.parse(JSON.stringify(COMED)));
    return Promise.resolve({ features: [] });
  };
}
var SUBS = { features: [
  { attributes: { NAME: 'Crawford', MAX_VOLT: 138, MIN_VOLT: 12, LINES: 6, STATUS: 'IN SERVICE', OWNER: 'Commonwealth Edison' }, geometry: { x: -87.6150, y: 41.8210 } },
  { attributes: { NAME: 'Fisk', MAX_VOLT: 345, STATUS: 'IN SERVICE', OWNER: 'Commonwealth Edison' }, geometry: { x: -87.6500, y: 41.8500 } }] };
var SUBS_MESA = { features: [
  { attributes: { NAME: 'Mesa Downtown', MAX_VOLT: 69, MIN_VOLT: 12, LINES: 4, STATUS: 'IN SERVICE', OWNER: 'Salt River Project' }, geometry: { x: -111.8270, y: 33.4190 } },
  { attributes: { NAME: 'Kyrene', MAX_VOLT: 230, STATUS: 'IN SERVICE', OWNER: 'Salt River Project' }, geometry: { x: -111.9300, y: 33.3600 } }] };
var TX = { features: [{ attributes: { VOLTAGE: 138 }, geometry: { paths: [[[-87.66, 41.80], [-87.60, 41.83]]] } }] };
var TX_MESA = { features: [{ attributes: { VOLTAGE: 230 }, geometry: { paths: [[[-111.90, 33.40], [-111.80, 33.43]]] } }] };
var PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
var EDITOR_STUB = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Site Map (stub)</title></head><body><p id="stub">Site Map</p></body></html>';

/* a static server with Vercel's cleanUrls (/omega-prime → omega-prime.html) */
var srv = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x'), p = u.pathname;
  var file = path.resolve(ROOT, '.' + p);
  if (!path.extname(file) && fs.existsSync(file + '.html')) file = file + '.html';
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

var DRAWING = ['elements', 'shapes', 'docTabs', 'geoShapes', 'geoElements', 'conduits', 'geoConduits', 'supplyLinks', 'trench', 'annotations'];
/* prime.quote and prime.order are the SERVER's (C3): the browser's copy of a
   project never overwrites them, and what the server wrote comes back */
function serverSeed(k, doc) {
  var cur = DB.data.get(k), d = JSON.parse(JSON.stringify(doc));
  if (cur && cur.prime) { d.prime = d.prime || {}; if (cur.prime.quote) d.prime.quote = cur.prime.quote; if (cur.prime.order) d.prime.order = cur.prime.order; }
  DB.seed(k, d);
}
function pushBack(pg) {
  var back = [];
  DB.data.forEach(function (d, k) { if (/^projects\/[^/]+$/.test(k) && d.prime && (d.prime.quote || d.prime.order)) back.push({ path: k, quote: d.prime.quote || null, order: d.prime.order || null }); });
  return pg.evaluate(function (rows) { var s = window.__firebaseDouble.store; rows.forEach(function (x) { var d = s.docs[x.path]; if (!d) return; d.prime = d.prime || {}; if (x.quote) d.prime.quote = x.quote; if (x.order) d.prime.order = x.order; }); }, back);
}
function storeOf(p) { return p.evaluate(function () { var s = window.__firebaseDouble.store; return JSON.parse(JSON.stringify({ docs: s.docs, log: s.log })); }); }
function projectsIn(st) { return Object.keys(st.docs).filter(function (k) { return /^projects\/[^/]+$/.test(k); }); }
async function shot(p, name) {
  /* the loading mark has faded and every scrolling screen is at its top */
  var gone = await p.waitForFunction(function () { return !document.getElementById('omega-splash'); }, null, { timeout: 6000 }).then(function () { return true; }, function () { return false; });
  ok('the loading mark is gone before ' + name, gone);
  if (!SHOTS) return;
  await p.evaluate(function () { [].forEach.call(document.querySelectorAll('.screen.on'), function (s) { s.scrollTop = 0; }); });
  fs.mkdirSync(SHOTS, { recursive: true }); var f = path.join(SHOTS, name + '.png'); await p.screenshot({ path: f }); shots.push(f);
}
var shots = [];

async function context(browser, base, calls, external, viewport) {
  var ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
    var url = r.request().url();
    function json(o) { return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) }); }
    function geomMesa() { var g = /[?&]geometry=([^&]+)/.exec(url); try { var j = JSON.parse(decodeURIComponent(g[1])); return j.xmin < -100; } catch (e) { return false; } }
    if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.(js|css)/.test(url)) {
      var lf = process.env.LEAFLET_DIR && path.join(process.env.LEAFLET_DIR, path.basename(new URL(url).pathname));
      return lf && fs.existsSync(lf) ? r.fulfill({ status: 200, contentType: /\.js$/.test(url) ? 'text/javascript' : 'text/css', body: fs.readFileSync(lf) }) : r['continue']();
    }
    if (/geocoding\.geo\.census\.gov/.test(url)) {
      if (/mesa/i.test(decodeURIComponent(url))) return json({ result: { addressMatches: [{ matchedAddress: '29 W MAIN ST, MESA, AZ, 85201', coordinates: { x: MESA.lng, y: MESA.lat } }] } });
      return json({ result: { addressMatches: [{ matchedAddress: '3400 S FEDERAL ST, CHICAGO, IL, 60616', coordinates: { x: SITE.lng, y: SITE.lat } }] } });
    }
    if (/Substations\/FeatureServer\/0\/query|substations\/FeatureServer\/0\/query/i.test(url)) return json(geomMesa() ? SUBS_MESA : SUBS);
    if (/Transmission_Lines\/FeatureServer\/0\/query/.test(url)) return json(geomMesa() ? TX_MESA : TX);
    if (/arcgisonline\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    external.push(url.slice(0, 140)); return r.abort();
  });
  /* calls.onEditor: what the database held at the moment Site Map was asked for */
  await ctx.route(base + '/editor.html**', async function (r) { calls.editor.push(r.request().url()); if (calls.onEditor) await calls.onEditor(); return r.fulfill({ status: 200, contentType: 'text/html', body: EDITOR_STUB }); });
  await ctx.route(base + '/api/**', async function (r) {
    var req = r.request(), u = new URL(req.url()), post = req.method() === 'POST', body = post ? req.postDataJSON() : null, q = {}, out;
    u.searchParams.forEach(function (v, k) { q[k] = v; });
    var auth = req.headers().authorization || '', pg = req.frame().page();
    function json(s, o) { return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) }); }
    if (u.pathname === '/api/hosting-capacity') {
      calls.hosting.push(body);
      var res = await H.run(body, { db: function () { return null; }, now: Date.now, fetchJson: netFor(body.lat, body.lng) });
      return json(200, JSON.parse(JSON.stringify(res)));
    }
    if (u.pathname === '/api/utility-rates') { calls.rates.push(q); out = await door(RATES, 'GET', null, q, auth); return json(out.status, out.body); }
    if (u.pathname === '/api/price-site') { calls.price.push(body); out = await door(PRICE, 'POST', body, null, auth); calls.priced.push(out.body); return json(out.status, out.body); }
    if (u.pathname === '/api/tenant-branding') { calls.branding.push(body); out = await door(BRANDING, 'POST', body, null, auth); return json(out.status, out.body); }
    if (u.pathname === '/api/customer-quote') {
      /* one database: the page's project, as the browser wrote it, is what
         the server reads; what the server mirrors onto it comes back */
      var st = await storeOf(pg);
      projectsIn(st).forEach(function (k) { serverSeed(k, st.docs[k]); });
      calls.quote.push({ method: req.method(), body: body, q: q });
      out = await door(QUOTE, req.method(), body, post ? null : q, auth);
      calls.quoteOut.push({ body: body, q: q, status: out.status, out: out.body });
      await pushBack(pg);
      /* calls.dropSend: the send runs on the server, and its answer never
         reaches the page (a dropped connection) */
      if (calls.dropSend && body && body.action === 'send') { calls.dropSend = false; return r.abort('failed'); }
      return json(out.status, out.body);
    }
    /* Send to the OEM (main's design order): the door's answer stood in;
       what matters here is what the page sends it */
    if (u.pathname === '/api/rfq') { calls.rfq.push(body); return json(200, { ok: true, rfqId: 'rfq-1', recipients: [], orders: [{ orderNo: 'CC-PO-1001', orgName: 'Clean Cell', sameWorkspace: false }], unmatched: [] }); }
    calls.other.push(u.pathname);
    return json(503, { error: 'offline' });
  });
  await ctx.addInitScript(FD.source());
  /* the double survives a reload in the same tab (sessionStorage), as a
     database would: the resume check reloads /omega-prime?id= */
  await ctx.addInitScript(function (cfg) {
    var docs = cfg.docs, saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('__fdDocs') || 'null'); } catch (e) {}
    window.FirebaseDouble.install(window, { user: cfg.user, docs: saved || docs, latency: cfg.latency, authDomain: cfg.authDomain });
    addEventListener('pagehide', function () { try { var s = window.__firebaseDouble.store; sessionStorage.setItem('__fdDocs', JSON.stringify(s.docs)); sessionStorage.setItem('__fdLog', JSON.stringify(s.log)); } catch (e) {} });
  }, { user: FX.user, docs: FX.docs, latency: 5, authDomain: HOST });
  return ctx;
}
function watch(p, errs) {
  p.on('pageerror', function (e) { errs.push(e.message); });
  p.on('console', function (m) { var t = m.text(); if (m.type() === 'error' && !/^Failed to load resource/.test(t)) errs.push('console: ' + t.slice(0, 240)); });
  p.on('dialog', function (d) { errs.push('dialog: ' + d.message()); d.dismiss(); });
}
function text(p, sel) { return p.$eval(sel, function (e) { return e.textContent; }).then(null, function () { return ''; }); }
function until(p, fn, arg, ms) { return p.waitForFunction(fn, arg, { timeout: ms || 10000 }).then(function (h) { return h.jsonValue(); }, function () { return null; }); }

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port, external = [], errs = [];
  var calls = { hosting: [], rates: [], price: [], priced: [], quote: [], quoteOut: [], branding: [], editor: [], other: [], rfq: [], onEditor: null, dropSend: false };
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var pid = '';
  try {
    var ctx = await context(browser, base, calls, external);
    var p = await ctx.newPage(); watch(p, errs);
    await p.goto(base + '/omega-prime.html', { waitUntil: 'domcontentloaded' });

    /* ── Site: the list, the footprint ask, the project made ── */
    var listed = await until(p, function () { var s = document.getElementById('unitSel'); return s && s.options.length >= 5 ? [].map.call(s.options, function (o) { return o.textContent; }) : null; });
    ok('the workspace\'s own product leads the list, then Clean Cell\'s LG JP-2, Smart Module, CC290/125 and the R60; a component never', listed && listed.length === 5 &&
      /^Clean Cell CC-2000/.test(listed[0]) && /LG JP-2/.test(listed[1]) && /Smart Module/.test(listed[2]) && /CC290\/125/.test(listed[3]) && /R60/.test(listed[4]), listed);
    ok('no FENECON anywhere on the list or the page', listed && !listed.some(function (t) { return /fenecon/i.test(t); }) && !/fenecon/i.test(await p.content()));
    await p.selectOption('#unitSel', '1');
    var lg = await p.evaluate(function () { return { fp: !document.getElementById('fpBox').hidden, card: document.getElementById('unitCard').textContent }; });
    ok('a unit whose maker released no footprint is drawn at its reference size (the LG JP-2: a 20 ft container) and still asks for the submittal\'s L × W; its card names the source, the caveat and the pages',
      lg.fp && /20 × 8 ft reference size, confirm on the submittal/.test(lg.card) && /Planning specification/.test(lg.card) && /Rev H/.test(lg.card) && /p\. 4, 8/.test(lg.card), lg);
    await p.fill('#fpL', '40'); await p.fill('#fpW', '10');
    ok('the typed footprint is the unit\'s', /40 × 10 ft from the submittal/.test(await text(p, '#unitCard')), await text(p, '#unitCard'));
    await p.selectOption('#unitSel', '0');
    ok('the workspace\'s product has its own footprint and asks nothing', await p.$eval('#fpBox', function (e) { return e.hidden; }) && /20 × 8 ft/.test(await text(p, '#unitCard')), await text(p, '#unitCard'));
    await p.fill('#addr', '3400 S Federal St, Chicago, IL 60616');
    await shot(p, 'prime-01-start');
    await p.click('#go');
    await p.waitForSelector('#s-atlas.on');
    ok('the unit is fixed once the site starts', await p.$eval('#unitSel', function (s) { return s.disabled; }));
    var url = await until(p, function () { return /^\/omega-prime\?id=[A-Za-z0-9]+$/.test(location.pathname + location.search) ? location.pathname + location.search : null; });
    ok('the address bar becomes the project: /omega-prime?id=', !!url, url);
    var st0 = await storeOf(p), made = st0.log.filter(function (w) { return w.op === 'add' && /^projects\//.test(w.path); }), doc0 = made[0] && made[0].data;
    pid = made[0] ? made[0].path.split('/')[1] : '';
    ok('one project is created at Start', made.length === 1 && url === '/omega-prime?id=' + pid, { n: made.length, url: url });
    ok('it is Prime v2 at step start, the workspace\'s, the unit configured by catalog key, no drawing forged', doc0 && doc0.prime && doc0.prime.v === 2 && doc0.prime.step === 'start' && doc0.orgId === ORG && doc0.uid === 'rep-1' && doc0.type === 'bess' &&
      doc0.bessList[0].catalogKey === 'CLEANCELL-CC-2000' && doc0.prime.unitKey === 'CLEANCELL-CC-2000' && doc0.elements.length === 0 && doc0.conduits.length === 0 && !doc0.shapes && !doc0.geoElements &&
      Math.abs(doc0.mapState.lat - SITE.lat) < 1e-6 && doc0.mapState.zoom === 19, doc0 && { prime: doc0.prime, bessList: doc0.bessList });

    /* ── Atlas ── */
    await until(p, function () { return /substations within/.test(document.getElementById('gaStat').textContent); });
    await p.click('#ly-sub');
    await p.click('.subicon.near');
    await p.click('#bm-sat');
    var inspUtil = await until(p, function () { var e = document.getElementById('gaInspUtil'); return e && /ComEd/.test(e.textContent) ? e.textContent : null; });
    ok('the inspector names the serving utility from the hosting answer', !!inspUtil, inspUtil);
    ok('the guide speaks of the unit, not of another maker\'s container', !/95,000/.test(await p.content()));
    await shot(p, 'prime-02-atlas');
    await p.click('#ga-go');

    /* ── Circuit: the national door ── */
    var circ = await until(p, function () { var t = document.getElementById('sfRes').textContent; return /Fits\.|Needs a study|Fits only smaller/.test(t) ? t : null; });
    var hb = calls.hosting[0] || {};
    ok('one hosting question, for the chosen unit, at the point, storage mode', calls.hosting.length === 1 && hb.unit && hb.unit.kw === 1000 && hb.mode === 'storage' && Math.abs(hb.lat - SITE.lat) < 1e-6, calls.hosting);
    ok('the substation goes to the door in km', hb.substation && hb.substation.name === 'Crawford' && hb.substation.kv === 138 && hb.substation.km > 0.5 && hb.substation.km < 1.5, hb.substation);
    ok('the verdict is the engine\'s: F0297 fits with 10,725 kW of room', circ && /Circuit F0297/.test(circ) && /Fits\./.test(circ) && /10,725 kW/.test(circ) && /ComEd published \(battery\)/.test(circ) && /− 4,895 kW/.test(circ), circ && circ.slice(0, 500));
    ok('where the power comes from, and the provenance', /Where the power comes from/.test(circ) && /Crawford TSS 21/.test(circ) && /refreshed 2026-09-30/.test(circ), circ && circ.slice(0, 900));
    var verify = await p.$eval('#sf-verify', function (a) { return { href: a.getAttribute('href'), text: a.textContent, target: a.target }; }).then(null, function () { return null; });
    ok('"Check it on" the utility\'s own map', verify && verify.href === CS.REFERER && /^Check it on ComEd/.test(verify.text) && verify.target === '_blank', verify);
    ok('the pill names the utility', /^ComEd · hosting capacity$/.test(await text(p, '#utilPill')), await text(p, '#utilPill'));
    await shot(p, 'prime-03-circuit');
    await p.click('#sf-tomap');

    /* ── Load ── */
    await until(p, function () { return /ComEd/.test(document.getElementById('ldRates').textContent); });
    var rq = calls.rates[0] || {};
    ok('the rates are asked for the utility the circuit step named, and the ZIP', rq.zip === '60616' && rq.eia === '4110' && rq.name === 'ComEd', calls.rates);
    await p.fill('#ld-peaks', '1420 1388 1402 1510 1690 1840 1910 1880 1720 1560 1450 1430');
    var ld = await text(p, '#ldOut');
    ok('twelve peaks read, the demand charge at the rate book\'s rate', /12 of 12 months/.test(ld) && /peak 1,910 kW/.test(ld) && /about \$381,120 at \$19\.85\/kW/.test(ld), ld);
    await shot(p, 'prime-04-load');
    await p.click('#ld-tomap');
    await p.waitForSelector('#s-map.on');

    /* ── Map: area, unit, service, conduit, Run ── */
    var box = await p.$eval('#edMap', function (e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    await p.click('#ed-area');
    await p.mouse.move(cx - 180, cy - 90); await p.mouse.down(); await p.mouse.move(cx + 40, cy - 10, { steps: 6 }); await p.mouse.move(cx + 180, cy + 90, { steps: 6 }); await p.mouse.up();
    await p.click('#ed-place'); await p.mouse.click(cx - 60, cy);
    await p.click('#ed-poi'); await p.mouse.click(cx + 260, cy + 160);
    await p.click('#ed-conduit');
    var drawn = await p.evaluate(function () { return ['pr-unit', 'pr-xfmr', 'pr-disco', 'pr-conduit'].map(function (c) { return document.querySelectorAll('#edMap .' + c).length; }); });
    ok('the unit, its transformer, its disconnect and the conduit are drawn (PP.arrange, PP.conduitPath)', drawn.every(function (n) { return n === 1; }), drawn);
    await p.click('#ed-run');
    await until(p, function () { return document.getElementById('ed-run').classList.contains('done'); });
    await p.waitForTimeout(900);
    var st1 = await storeOf(p), d1 = st1.docs['projects/' + pid] || {}, pr = d1.prime || {}, L = pr.layout || {};
    var want = PP.runInput(pr.unit, L), sent = calls.price[0] || {};
    ok('Run sends PP.runInput(unit, layout) of the saved record', calls.price.length === 1 && JSON.stringify(sent) === JSON.stringify(want), { sent: sent, want: want });
    var priced = calls.priced[0] || {}, total = priced.total && priced.total.base;
    ok('the record keeps the Run as PP.runRecord', pr.run && pr.run.totalUsd === total && JSON.stringify(pr.run.input) === JSON.stringify(want) && pr.run.pricedBy === 'api/price-site', pr.run);
    ok('layout v2: area, unit, transformer, disconnect, POI, the PVC-UG conduit, its hash', L.v === 2 && L.unitKey === 'CLEANCELL-CC-2000' && L.area && L.unit && L.unit.lFt === 20 && L.unit.wFt === 8 && L.xfmr && L.disco && L.poi &&
      L.conduit && L.conduit.type === 'PVC-UG' && L.conduit.pts.length === 3 && L.conduitFt === Math.round(PP.pathFt(L.conduit.pts) * 10) / 10 && L.hash === PP.hash(L), L);
    ok('the side panel shows the Run\'s total', new RegExp('\\$' + Math.round(total).toLocaleString('en-US').replace(/,/g, ',')).test(await text(p, '#runSec')), await text(p, '#runSec'));
    ok('the grid answer, the hosting summary and the load ride on the project', d1.grid && d1.grid.verdict && d1.grid.verdict.key === 'fits' && d1.grid.circuit && d1.grid.circuit.netKw === 10725 && d1.grid.circuit.id === 'F0297' &&
      pr.hosting && pr.hosting.utility && pr.hosting.utility.display === 'ComEd' && pr.hosting.coverage === 'read' && pr.hosting.circuit.id === 'F0297' && d1.load && d1.load.peakKw === 1910 && d1.load.months === 12 && pr.step === 'map', { grid: d1.grid, hosting: pr.hosting, step: pr.step });
    var ups = st1.log.filter(function (w) { return w.op === 'update' && /^projects\//.test(w.path); });
    ok('every change after Start is a dotted patch, and none touches a drawing key', ups.length >= 1 && ups.every(function (w) { return Object.keys(w.data || {}).every(function (k) { return DRAWING.indexOf(k.split('.')[0]) < 0 && /^(prime\.[A-Za-z]+|grid\.[A-Za-z]+|load|bessList|updatedAt)$/.test(k); }); }), ups.map(function (w) { return Object.keys(w.data || {}); }));
    var sideLink = await p.$eval('#toEditor', function (a) { return { tag: a.tagName, href: a.getAttribute('href'), to: a.getAttribute('data-href') }; }).then(null, function () { return {}; });
    ok('Site Map opens the saved project, without the Guided Build fallback once a unit is placed', sideLink.to === '/editor.html?id=' + pid, sideLink);
    ok('"Open the project in Site Map" is a button: there is no address a browser could open around the save', sideLink.tag === 'BUTTON' && sideLink.href === null, sideLink);
    await shot(p, 'prime-05-map');

    /* ── a new tab (a middle-click) waits for the save too: a change still
       in the debounce lands before Site Map is even asked for ── */
    await p.click('#ed-conduit');
    var nm = (await storeOf(p)).log.length, atOpen = null;
    /* the last write to the PROJECT since the click: the runtime's own writes
       (the once-per-load presence on team_members) may land beside it */
    calls.onEditor = async function () { if (!atOpen) { var s = await storeOf(p), mine = s.log.slice(nm).filter(function (w) { return /^projects\//.test(w.path || ''); }); atOpen = { n: s.log.length, last: mine[mine.length - 1] || {} }; } };
    var tabP = ctx.waitForEvent('page');
    await p.click('#toEditor', { button: 'middle' });
    var tab = await tabP;
    await tab.waitForURL(/\/editor\.html\?id=/, { timeout: 8000 }).then(null, function () {});
    ok('a middle-click opens Site Map in a new tab only once the pending patch has landed', !!atOpen && atOpen.n > nm && atOpen.last.op === 'update' && 'prime.layout' in (atOpen.last.data || {}) &&
      tab.url() === base + '/editor.html?id=' + pid, { nm: nm, atOpen: atOpen && { n: atOpen.n, op: atOpen.last.op, keys: Object.keys(atOpen.last.data || {}) }, url: tab.url() });
    ok('and Prime stays where it was, its button ready again', /\/omega-prime\?id=/.test(p.url()) && !!(await p.$('#s-map.on')) && await text(p, '#toEditor') === 'Open the project in Site Map', { url: p.url(), btn: await text(p, '#toEditor') });
    calls.onEditor = null; await tab.close();

    /* ── Open in Site Map: the pending change is written first ── */
    await p.click('#ed-run');
    await until(p, function (n) { return document.getElementById('ed-run').lastChild.nodeValue === 'Run' && document.getElementById('ed-run').classList.contains('done') ? true : null; }, null);
    var n0 = (await storeOf(p)).log.length, e0 = calls.editor.length;
    await p.click('#toEditor');
    await p.waitForURL(/\/editor\.html\?id=/, { timeout: 8000 });
    var after = await p.evaluate(function () { try { return JSON.parse(sessionStorage.getItem('__fdLog') || '[]'); } catch (e) { return []; } });
    var lastW = after[after.length - 1] || {};
    ok('"Open the project in Site Map" waits for the pending save', after.length > n0 && lastW.op === 'update' && lastW.data && 'prime.run' in lastW.data, { n0: n0, n: after.length, last: lastW && Object.keys(lastW.data || {}) });
    ok('and goes to /editor.html?id=<id>, in the same tab', calls.editor.length === e0 + 1 && /\/editor\.html\?id=[^&]+$/.test(calls.editor[e0]), calls.editor);
    /* Site Map builds it and saves (omega-prime-handoff.js): savedBy, its
       drawing, prime.builtAt/builtHash — written here as the editor would */
    var builtAt = Date.now();
    await p.evaluate(function (a) { var d = window.__firebaseDouble.store.docs['projects/' + a.id]; d.savedBy = { tab: 'tab-1', at: a.at }; d.elements = [{ id: 'e1', type: 'evgear', fromPrime: true }]; d.prime.builtAt = a.at; d.prime.builtHash = d.prime.layout.hash; }, { id: pid, at: builtAt });

    /* ── Resume: /omega-prime?id= ── */
    await p.goto(base + '/omega-prime?id=' + pid, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#s-map.on', { timeout: 10000 });
    await p.waitForTimeout(1200);
    var rs = await p.evaluate(function () {
      return { unit: document.getElementById('unitSel').selectedOptions[0].textContent, locked: document.getElementById('unitSel').disabled,
        drawn: ['pr-unit', 'pr-xfmr', 'pr-disco', 'pr-conduit'].map(function (c) { return document.querySelectorAll('#edMap .' + c).length; }),
        side: document.getElementById('edSide').textContent, ws: document.getElementById('wsLine').textContent,
        seen: [].map.call(document.querySelectorAll('#path button.seen'), function (b) { return b.getAttribute('data-step'); }),
        writes: window.__firebaseDouble.store.log.filter(function (w) { return w.op !== 'read'; }).length };
    });
    ok('the resumed site is the same unit, locked, on the Site Map step', /^Clean Cell CC-2000/.test(rs.unit) && rs.locked && /3400 S Federal St/.test(rs.ws), rs);
    ok('the drawing comes back on the map', rs.drawn.every(function (n) { return n === 1; }), rs.drawn);
    ok('the Run, the utility and the circuit come back', new RegExp('\\$' + Math.round(total).toLocaleString('en-US')).test(rs.side) && /Serving utilityComEd/.test(rs.side) && /CircuitF0297/.test(rs.side), rs.side.slice(0, 600));
    ok('the path is open to where it was left', ['start', 'atlas', 'circuit', 'load', 'map'].every(function (k) { return rs.seen.indexOf(k) >= 0; }), rs.seen);
    ok('resuming writes nothing', rs.writes === 0, rs.writes);
    var bn = await text(p, '#banner');
    ok('a project Site Map has saved says so: edited in Site Map since, built in Site Map on', /^Edited in Site Map since Oct/.test(bn) && /Built in Site Map on Oct/.test(rs.side) && !/Changed in Prime/.test(rs.side), { banner: bn, side: rs.side.slice(0, 400) });
    await p.click('#path button[data-step="circuit"]');
    var circ2 = await until(p, function () { var t = document.getElementById('sfRes').textContent; return /Circuit F0297/.test(t) ? t : null; });
    ok('the circuit step shows the saved answer without asking again', !!circ2 && /As checked/.test(circ2) && /10,725 kW/.test(circ2) && calls.hosting.length === 1, { calls: calls.hosting.length, circ: circ2 && circ2.slice(0, 200) });
    await p.click('#path button[data-step="map"]');
    await p.click('#ed-quote');
    await p.waitForSelector('#s-quote.on');

    /* ── Proposal ── */
    await until(p, function () { return document.getElementById('pq-line1').value ? true : null; });
    ok('a site with no proposal yet: the latest is asked for, the customer\'s address prefilled from the site', calls.quote.some(function (c) { return c.method === 'GET' && c.q.projectId === pid; }) && await p.$eval('#pq-line1', function (e) { return e.value; }) === '3400 S FEDERAL ST' && await p.$eval('#pq-zip', function (e) { return e.value; }) === '60616');
    await p.fill('#pq-name', 'Dana Ruiz'); await p.fill('#pq-company', 'Riverside Cold Chain'); await p.fill('#pq-email', 'dana@riverside.example'); await p.fill('#pq-phone', '312-555-0110');
    await p.fill('#pq-pay', '30% on order, balance on energisation');
    ok('the margin starts at 20%', await p.$eval('#pq-markup', function (e) { return e.value; }) === '20');
    await p.click('#pq-preview');
    var deck = await until(p, function () { var d = document.querySelector('#pqDeck .oqd'); return d ? d.textContent : null; });
    var pv = calls.quote.filter(function (c) { return c.body && c.body.action === 'preview'; })[0];
    ok('Preview is the door\'s, with the margin as a markup on cost', pv && pv.body.projectId === pid && pv.body.pricing.mode === 'markup' && pv.body.pricing.markupPct === 20 && pv.body.customer.company === 'Riverside Cold Chain' && !pv.body.id, pv && pv.body);
    ok('the deck is the proposal: the customer, the plan, the battery quoted by its maker, a price', deck && /Riverside Cold Chain/.test(deck) && /Quoted by Clean Cell/.test(deck) && /\$[\d,]+/.test(deck) && await p.$$eval('#pqDeck svg', function (s) { return s.length; }) >= 1, deck && deck.slice(0, 400));
    var rep = await text(p, '#pqRep');
    var costWord = '$' + Math.round(total).toLocaleString('en-US');
    ok('the rep\'s panel: the Run\'s cost, the sell price at 20%, the margin, never on the deck', rep.indexOf(costWord) >= 0 && /Margin \$/.test(rep) && deck.indexOf(costWord) < 0 && !/Margin/.test(deck), { rep: rep.slice(0, 500), cost: costWord });
    ok('no company details yet: an administrator is offered the form', /Company details/.test(rep), rep.slice(-400));
    await p.click('#pq-co-open');
    await p.fill('#co-legal', 'Clean Cell Energy LLC'); await p.fill('#co-line1', '100 Battery Way'); await p.fill('#co-city', 'Austin'); await p.fill('#co-state', 'TX'); await p.fill('#co-zip', '78701');
    await p.fill('#co-phone', '512-555-0100'); await p.fill('#co-email', 'sales@cleancell.example'); await p.fill('#co-web', 'https://cleancell.example');
    await p.click('#pq-co-save');
    var deck2 = await until(p, function () { var d = document.querySelector('#pqDeck .oqd'); return d && /100 Battery Way/.test(d.textContent) ? d.textContent : null; });
    var br = calls.branding[0] || {};
    ok('the company details go to /api/tenant-branding as the door takes them', br.orgId === ORG && br.company && br.company.legalName === 'Clean Cell Energy LLC' && br.company.address.line1 === '100 Battery Way' && br.company.address.postalCode === '78701' && br.company.address.country === 'US' && br.company.website === 'https://cleancell.example', br);
    ok('and the proposal\'s letterhead carries them', !!deck2 && /Clean Cell Energy LLC/.test(deck2) && /512-555-0100/.test(deck2), deck2 && deck2.slice(0, 300));
    await p.click('#pq-save');
    var qno = await until(p, function () { var m = /Proposal (\S+-Q-\S+) · revision 1/.exec(document.getElementById('pqNo').textContent); return m ? m[1] : null; });
    var saved = calls.quote.filter(function (c) { return c.body && c.body.action === 'save'; }), qid = '';
    DB.data.forEach(function (v, k) { if (/^customer_quotes\/qt-[a-f0-9]{16}$/.test(k) && v.projectId === pid) qid = k.split('/')[1]; });
    var rec = DB.data.get('customer_quotes/' + qid) || {}, sp = (await storeOf(p)).docs['projects/' + pid].prime;
    ok('Save keeps the proposal, linked to the project and its map', !!qno && saved.length === 1 && !!qid && rec.projectId === pid && rec.orgId === ORG && rec.layoutHash === sp.layout.hash + ':' + sp.unitKey && rec.layout.conduitFt === sp.layout.conduitFt, { qno: qno, qid: qid, hash: rec.layoutHash });
    ok('the project carries the quote\'s mirror (the server\'s write)', sp.quote && sp.quote.id === qid && sp.quote.status === 'draft', sp.quote);
    ok('the sell price is the cost model\'s plus the margin, done on the server', rec.pricing && rec.pricing.sellCents === Math.round(Math.round(total * 100) * 1.2 / 100) * 100, rec.pricing);
    ok('and the rep\'s panel shows that price and that margin', await text(p, '#pqSell') === '$' + (rec.pricing.sellCents / 100).toLocaleString('en-US') && Math.round((await text(p, '#pqMargin')).replace(/[$,]/g, '') * 100) === rec.pricing.marginCents, { sell: await text(p, '#pqSell'), margin: await text(p, '#pqMargin'), rec: rec.pricing });
    await p.click('#pq-print');
    var printed = await until(p, function () { var f = document.getElementById('omega-quote-deck-print'); try { var d = f && f.contentDocument; return d && d.querySelector('.oqd') && d.querySelector('svg') ? d.title : null; } catch (e) { return null; } }, null, 6000);
    ok('Print / Save as PDF prints the same deck, plan included', !!printed && new RegExp(qno).test(printed), printed);
    /* the site map prints on its own page too */
    await p.click('#pq-print-sitemap');
    var printedMap = await until(p, function () { var f = document.getElementById('omega-quote-deck-print'); try { var d = f && f.contentDocument; return d && d.querySelector('.oqd-part-sitemap .oqd-sched') && d.querySelector('svg') ? d.title : null; } catch (e) { return null; } }, null, 6000);
    ok('Site map prints the drawn plan on its own page, with what is on it', !!printedMap && /^Site map /.test(printedMap) && new RegExp(qno).test(printedMap), printedMap);
    await p.click('#pq-link');
    var link1 = await until(p, function () { var i = document.getElementById('pqLink'); return i && i.value ? i.value : null; });
    var sd = calls.quote.filter(function (c) { return c.body && c.body.action === 'send'; })[0] || {};
    ok('Copy a link sends with a fresh send id and shows the link once', /\/quote\?id=qt-[a-f0-9]{16}&key=[a-f0-9]{48}$/.test(link1 || '') && /^snd_[a-z0-9]+$/.test(sd.body && sd.body.sendId || '') && sd.body.deliver === 'link', { link: link1, send: sd.body });
    ok('the proposal reads sent', /Sent · not opened yet/.test(await text(p, '#pqState')), await text(p, '#pqState'));
    /* Send to the OEM (main's design order), on the rep's side of the step */
    ok('Send to the OEM is on the rep\'s side, never on the customer\'s deck', !!(await p.$('#pqRep #q-oem')) && !(await p.$('#pqDeck #q-oem')));
    await p.click('#q-oem');
    var oemMsg = await until(p, function () { var m = document.getElementById('qOemMsg'); return m && /CC-PO-1001/.test(m.textContent) ? m.textContent : null; });
    var rq = calls.rfq[0] || {}, spo = (await storeOf(p)).docs['projects/' + pid].prime;
    ok('it opens the purchase order through /api/rfq: this project, the unit by its maker\'s SKU, the Run\'s estimate, and no customer',
      !!oemMsg && rq.projectId === pid && rq.bom && rq.bom[0].sku === spo.unit.sku && rq.bom[0].manufacturer === spo.unit.mfr && rq.estimateUsd === spo.run.totalUsd &&
      Object.keys(rq).sort().join(',') === 'address,bom,estimateUsd,projectId,toOrgIds,zip' && JSON.stringify(rq).indexOf('Riverside') < 0, { msg: oemMsg, body: rq });
    await shot(p, 'prime-06-proposal');

    /* the design changes: the proposal says so, and is saved again */
    await p.click('#path button[data-step="map"]');
    await p.click('#ed-poi'); await p.mouse.click(cx + 200, cy + 200);
    await p.click('#ed-conduit'); await p.click('#ed-run');
    await until(p, function () { return document.getElementById('ed-run').classList.contains('done') ? true : null; });
    await p.click('#ed-quote');
    ok('changed in Prime after Site Map built it: the side panel says so', /Changed in Prime since it went to Site Map/.test(await text(p, '#edSide')), (await text(p, '#edSide')).slice(0, 400));
    var staleTxt = await until(p, function () { var e = document.getElementById('pqStale'); return e ? e.textContent : null; });
    ok('a proposal priced before the design changed says so plainly and offers Save again', !!staleTxt && /design changed/.test(staleTxt), staleTxt);
    await p.click('#pq-resave');
    await until(p, function () { return /revision 2/.test(document.getElementById('pqNo').textContent) ? true : null; });
    var ups2 = (await storeOf(p)).log.filter(function (w) { return w.op === 'update' && /^projects\//.test(w.path); });
    ok('once Site Map has saved, Prime no longer bumps updatedAt or rewrites the battery list', ups2.length >= 1 && ups2.every(function (w) { var k = Object.keys(w.data || {}); return k.indexOf('updatedAt') < 0 && k.indexOf('bessList') < 0 && k.indexOf('prime.savedAt') >= 0; }), ups2.map(function (w) { return Object.keys(w.data || {}); }));
    ok('saved again: revision 2, re-priced from the new map, the old link withdrawn', !(await p.$('#pqStale')) && DB.data.get('customer_quotes/' + qid).rev === 2 && DB.data.get('customer_quotes/' + qid).status === 'draft', DB.data.get('customer_quotes/' + qid) && DB.data.get('customer_quotes/' + qid).status);
    await p.click('#pq-link');
    var link2 = await until(p, function (prev) { var i = document.getElementById('pqLink'); return i && i.value && i.value !== prev ? i.value : null; }, link1);
    var sends = calls.quote.filter(function (c) { return c.body && c.body.action === 'send'; });
    ok('a second send: a new send id, a new link', !!link2 && sends.length === 2 && sends[1].body.sendId !== sends[0].body.sendId, sends.map(function (c) { return c.body.sendId; }));

    /* ── the customer opens and approves it (the door's public branch) ── */
    var key = /key=([a-f0-9]{48})$/.exec(link2 || '') || [];
    /* the customer's own link, opened where the email's site map link lands
       (#sitemap): the proposal, its quote and its site map are each their
       own document (Tommy, 2026-10-17: "send a site map and a proposal") */
    var cp = await ctx.newPage(); watch(cp, errs);
    await cp.goto(base + '/quote.html?id=' + qid + '&key=' + key[1] + '#sitemap', { waitUntil: 'domcontentloaded' });
    var sm = await until(cp, function () {
      var d = document.getElementById('deck'), k = d && d.querySelector('.oqd-kicker');
      return k ? { kicker: k.textContent, h1: (d.querySelector('.oqd-h1') || {}).textContent, sched: !!d.querySelector('.oqd-sched'), svg: !!d.querySelector('svg'),
        price: /Total price/.test(d.textContent), bar: !document.getElementById('parts').hidden, on: (document.querySelector('#parts button.on') || {}).textContent, print: document.getElementById('print').textContent } : null;
    });
    ok('the customer\'s link opens on the site map it names: the plan and what is on it, no price, the three parts on the bar', !!sm && sm.kicker === 'Site map' && sm.h1 === 'Site map' && sm.sched && sm.svg && !sm.price && sm.bar && sm.on === 'Site map' && sm.print === 'Print the site map', sm);
    await cp.click('#parts button[data-part="quote"]');
    var qv = await until(cp, function () { var k = document.querySelector('#deck .oqd-kicker'); return k && k.textContent === 'Quote' ? { svg: !!document.querySelector('#deck svg'), price: /Total price/.test(document.getElementById('deck').textContent), hash: location.hash, key: /key=[a-f0-9]{48}/.test(location.search), print: document.getElementById('print').textContent } : null; });
    ok('the Quote part: the price without the plan; the key stays in the address', !!qv && !qv.svg && qv.price && qv.hash === '#quote' && qv.key && qv.print === 'Print the quote', qv);
    await cp.close();
    var opened = await door(QUOTE, 'GET', null, { id: qid, key: key[1] });
    var appr = await door(QUOTE, 'POST', { action: 'approve', id: qid, key: key[1], name: 'Dana Ruiz', title: 'COO', agree: true, snapshot: opened.body.quote && opened.body.quote.snapshot });
    await pushBack(p);
    var ho = DB.data.get('customer_quotes/' + qid).handoff || {};
    ok('the customer\'s approval lands; without Omega Logic the order is refused in plain words', opened.status === 200 && appr.status === 200 && DB.data.get('customer_quotes/' + qid).status === 'approved' && /not on Omega Logic/.test(ho.error || ''), { opened: opened.status, appr: appr.body, ho: ho });

    /* ── Track ── */
    await p.click('#pq-track');
    await p.waitForSelector('#s-track.on');
    var tr = await until(p, function () { var e = document.getElementById('trHandErr'); return e ? e.textContent : null; });
    ok('Track shows the refusal in its own words and offers to send it again', !!tr && /not on Omega Logic/.test(tr) && !!(await p.$('#tr-retry')), tr);
    var lad = await p.evaluate(function () { return [].map.call(document.querySelectorAll('#trLadder .st'), function (e) { return e.getAttribute('data-step') + ':' + e.className.replace('st ', ''); }); });
    ok('the ladder: the proposal phase done, the order next', ['saved:done', 'sent:done', 'viewed:done', 'approved:done', 'ordered:current'].every(function (x) { return lad.indexOf(x) >= 0; }) && lad.length === 15, lad);
    /* not on Omega Logic, as the door says (logic {on, canAdd, url}): the
       card, the offer beside the refusal and the guide follow who is asking */
    function logicCard() {
      return p.evaluate(function () {
        var c = document.getElementById('tr-logic'), a = document.getElementById('tr-addlogic'), k = document.getElementById('tr-asklogic');
        return { tag: c && c.tagName, kind: c && c.getAttribute('data-logic'), href: c && c.getAttribute('href'), text: c && c.textContent, add: a ? a.getAttribute('href') : null, ask: k ? k.textContent : '', guide: document.getElementById('gT').textContent };
      });
    }
    var lc1 = await logicCard();
    ok('not on Omega Logic, for an administrator: the card is Add Omega Logic, to the Modules card, saying why', lc1.kind === 'add' && lc1.tag === 'A' && lc1.href === '/workspace#module-logic-office' && /^Add Omega Logic/.test(lc1.text) && /isn’t on .+’s plan yet\. Add it to fulfil approved proposals in your own office\./.test(lc1.text), lc1);
    ok('the same offer stands beside the refusal, and the guide says to add it', lc1.add === '/workspace#module-logic-office' && lc1.guide === 'Add Omega Logic', lc1);
    DB.seed('omega_orgs/' + ORG + '/members/rep-1', { role: 'member', status: 'active', name: 'Clean Cell Rep', email: REP.email });
    await p.click('#tr-refresh');
    var lc2 = await until(p, function () { var c = document.getElementById('tr-logic'); return c && c.getAttribute('data-logic') === 'ask' ? true : null; }) && await logicCard();
    ok('a member who cannot add it is told to ask an owner or administrator, with no purchase link anywhere', !!lc2 && lc2.tag === 'DIV' && lc2.href === null && /Ask an owner or administrator to add it/.test(lc2.text) && /Ask an owner or administrator/.test(lc2.ask) && lc2.add === null &&
      /isn’t on your plan/.test(lc2.guide) && !(await p.$('#trCards a[href*="module-logic"]')), lc2);
    DB.seed('omega_orgs/' + ORG + '/members/rep-1', { role: 'admin', status: 'active', name: 'Clean Cell Rep', email: REP.email });
    DB.seed('omega_orgs/' + ORG + '/billing/current', { tier: 'standard', addons: ['omega-logic'] });
    await p.click('#tr-retry');
    var orderLine = await until(p, function () { var e = document.getElementById('trOrder'); return e ? e.textContent : null; });
    var h2 = DB.data.get('customer_quotes/' + qid).handoff || {}, order = DB.data.get('orders/' + h2.orderId) || {};
    ok('Send to Omega Logic again makes the order in the workspace\'s Omega Logic', !!orderLine && /your workspace’s Omega Logic/.test(orderLine) && order.orgId === ORG && order.status === 'new' && order.source === 'prime' && order.sourceQuoteId === qid && !h2.error, { line: orderLine, h: h2 });
    var links = await p.evaluate(function () { function h(id) { var a = document.getElementById(id); return a ? a.getAttribute('href') : null; } return { desk: h('tr-desk'), logic: h('tr-logic'), teleios: h('tr-teleios') }; });
    ok('the Omega Logic link is the workspace you are in, on the order', links.logic === '/omega-logic?org=' + ORG + '&order=' + encodeURIComponent(h2.orderId) + '#orders', links);
    var lc3 = await logicCard();
    ok('on Omega Logic now: the card opens the order, and no offer is left', lc3.kind === 'open' && lc3.add === null && !lc3.ask && !(await p.$('#tr-addlogic')), lc3);
    ok('the Quote Desk and Omega Teleios links', links.desk === '/rfq.html#customer-' + qid && links.teleios === '/logic-custody.html?org=' + ORG, links);
    var lad2 = await p.evaluate(function () { return [].map.call(document.querySelectorAll('#trLadder .st.current'), function (e) { return e.getAttribute('data-step'); }); });
    ok('the ladder moves on: the order is in, its price is next', lad2.length === 1 && lad2[0] === 'priced' && /In Omega Logic/.test(await text(p, '#gT')), { cur: lad2, guide: await text(p, '#gT') });
    await shot(p, 'prime-07-track');
    await p.waitForTimeout(800);

    /* ── a bought-in battery on site with no warranty on file (2026-10-17):
       the ladder names the unit, the Teleios card opens its passport in
       Omega Logic and the guide says to record the maker's warranty; once
       it is on the unit (custody.js makerWarranty), it is Omega Teleios ── */
    var o0 = DB.data.get('orders/' + h2.orderId), bsku = o0.items[0].sku, dAgo = function (n) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); };
    DB.seed('orders/' + h2.orderId, Object.assign({}, o0, { procure: { mfr: 'CleanCell US', mfrOrgId: null, sku: bsku, model: 'Smart Module' } }));
    var ONSITE = { status: 'assigned', siteId: 'site_lake', siteName: 'Lake St', shippedAt: dAgo(9), deliveredAt: dAgo(7), receivedAt: dAgo(7), assignedAt: dAgo(6) };
    function onSite(custody) { DB.seed('plant_units/' + ORG + '__PRM-0001', { orgId: ORG, orderId: h2.orderId, serial: 'PRM-0001', sku: bsku, shipUnit: true, at: 'ready', custody: custody }); }
    onSite(ONSITE);
    await p.click('#tr-refresh');
    var need = await until(p, function () { var a = document.getElementById('tr-teleios'); return a && a.getAttribute('data-need') === 'maker-warranty' ? { href: a.getAttribute('href'), text: a.textContent, guide: document.getElementById('gT').textContent } : null; });
    ok('a bought-in battery on site, no warranty on file: the Teleios card opens its unit passport, and the guide says to record the maker’s warranty', !!need && need.href === '/logic-custody.html?org=' + ORG + '&serial=PRM-0001#passport' && /bought in from CleanCell US/.test(need.text) && need.guide === 'Put the maker’s warranty on file', need);
    onSite(Object.assign({}, ONSITE, { makerWarranty: { provider: 'CleanCell US', termMonths: 120, trigger: 'ship', capMonths: null, docUrl: '', reference: 'CC-W-2291 by email', recordedBy: REP.email, recordedAt: new Date().toISOString(), orderId: h2.orderId } }));
    await p.click('#tr-refresh');
    var fin = await until(p, function () { var a = document.getElementById('tr-teleios'), c = document.getElementById('trChip'); return a && !a.getAttribute('data-need') && c && c.textContent === 'Omega Teleios' ? { href: a.getAttribute('href'), guide: document.getElementById('gT').textContent } : null; });
    ok('the maker’s warranty on file: Omega Teleios, complete, and the card is the custody record again', !!fin && fin.href === '/logic-custody.html?org=' + ORG && fin.guide === 'Omega Teleios: complete', fin);
    /* the rest of the scenario runs on the order as it was */
    DB.data.delete('plant_units/' + ORG + '__PRM-0001'); DB.seed('orders/' + h2.orderId, o0);
    await p.click('#tr-refresh');
    await until(p, function () { var a = document.getElementById('tr-teleios'), c = document.querySelector('#trLadder .st.current'); return a && !a.getAttribute('data-need') && c && c.getAttribute('data-step') === 'priced' ? true : null; });

    /* ── Phone, resumed: Track, then the proposal reopened ── */
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(base + '/omega-prime?id=' + pid, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#s-track.on', { timeout: 10000 });
    await until(p, function () { return document.querySelectorAll('#trLadder .st').length === 15 ? true : null; });
    var wide = await p.evaluate(function () { return { doc: document.documentElement.scrollWidth, scr: document.getElementById('s-track').scrollWidth }; });
    ok('a 390 px phone resumes on Track with no sideways scroll', wide.doc <= 390 && wide.scr <= 390, wide);
    await shot(p, 'prime-08-phone-track');
    await p.click('#path button[data-step="quote"]');
    await until(p, function () { return document.getElementById('pq-name').value ? true : null; });
    var form = await p.evaluate(function () { function v(id) { return document.getElementById(id).value; } return { name: v('pq-name'), company: v('pq-company'), markup: v('pq-markup'), pay: v('pq-pay'), deck: !!document.querySelector('#pqDeck .oqd'), no: document.getElementById('pqNo').textContent, doc: document.documentElement.scrollWidth, scr: document.getElementById('s-quote').scrollWidth }; });
    ok('reopened, the proposal screen loads the project\'s latest quote into the form', form.name === 'Dana Ruiz' && form.company === 'Riverside Cold Chain' && form.markup === '20' && /balance on energisation/.test(form.pay) && form.deck && /revision 2/.test(form.no), form);
    ok('and fits the phone', form.doc <= 390 && form.scr <= 390, form);
    await shot(p, 'prime-09-phone-proposal');
    await p.setViewportSize({ width: 1440, height: 900 });

    /* ── the start screen lists the site to continue ── */
    await p.goto(base + '/omega-prime', { waitUntil: 'domcontentloaded' });
    var cont = await until(p, function () { var c = document.getElementById('cont'); return c && !c.hidden ? [].map.call(document.querySelectorAll('#contList a'), function (a) { return a.getAttribute('href') + ' ' + a.textContent; }) : null; });
    ok('"Continue a site" lists the workspace\'s Prime projects', cont && cont.length === 1 && cont[0].indexOf('/omega-prime?id=' + pid) === 0 && /3400 S Federal St/.test(cont[0]) && /approved/.test(cont[0]), cont);

    /* ── a second proposal on the site: listed with the first, newest first;
       a total with cents survives a reload and a re-save; &step= and
       &quote= open the right step on the right proposal; a link send whose
       answer is lost is said plainly ── */
    await p.goto(base + '/omega-prime?id=' + pid + '&step=load', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#s-load.on', { timeout: 10000 });
    ok('&step=load opens a step the record has reached', new URL(p.url()).search === '?id=' + pid, p.url());
    await p.goto(base + '/omega-prime?id=' + pid + '&step=quote', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#s-quote.on', { timeout: 10000 });
    await until(p, function () { return document.getElementById('pq-name').value ? true : null; });
    ok('&step=quote opens the Proposal step on the latest proposal; the address keeps only the project', /revision 2/.test(await text(p, '#pqNo')) && /Approved/.test(await text(p, '#pqRep')) && new URL(p.url()).search === '?id=' + pid, { no: await text(p, '#pqNo'), url: p.url() });
    await p.check('#pq-mode-total'); await p.fill('#pq-total', '1,234,567.89');
    await p.click('#pq-save');
    await until(p, function () { return /· revision 1$/.test(document.getElementById('pqNo').textContent) ? true : null; });
    var qid2 = ''; DB.data.forEach(function (v, k) { if (/^customer_quotes\/qt-[a-f0-9]{16}$/.test(k) && v.projectId === pid && k.split('/')[1] !== qid) qid2 = k.split('/')[1]; });
    var rec2 = DB.data.get('customer_quotes/' + qid2) || {};
    ok('an approved proposal is never edited: Save makes a new one, priced at the total typed, to the cent', !!qid2 && rec2.rev === 1 && rec2.pricing && rec2.pricing.mode === 'total' && rec2.pricing.sellCents === 123456789 && DB.data.get('customer_quotes/' + qid).status === 'approved', { qid2: qid2, pricing: rec2.pricing });
    var saveOut = calls.quoteOut.filter(function (c) { return c.body && c.body.action === 'save'; }).pop() || {}, sup = saveOut.out && saveOut.out.quote && saveOut.out.quote.supersedes;
    if (sup) {
      var supTxt = await text(p, '#pqSupersedes');
      ok('the site already has an order: Prime says so before the new proposal is sent', supTxt.indexOf(h2.orderNo) >= 0 && supTxt.indexOf(qno) >= 0 && /will not create a second order/.test(supTxt), { sup: sup, text: supTxt });
    } else console.log('note: the quote door sends no supersedes yet, so the warning before Send was not exercised');
    var rows = await until(p, function () { var r = document.querySelectorAll('#pqList .qrow'); return r.length === 2 ? [].map.call(r, function (e) { return { id: e.getAttribute('data-quote'), on: /\bon\b/.test(e.className), st: e.querySelector('[data-status]').getAttribute('data-status'), text: e.textContent }; }) : null; });
    ok('the Proposal step lists both proposals, newest first, the open one marked, the first with its order', !!rows && rows[0].id === qid2 && rows[0].on && rows[0].st === 'draft' && rows[1].id === qid && !rows[1].on && rows[1].st === 'approved' && rows[1].text.indexOf(h2.orderNo) >= 0, rows);
    ok('each row goes to the Quote Desk on its own quote', await p.$eval('#pq-q1-desk', function (a) { return a.getAttribute('href'); }) === '/rfq.html#customer-' + qid);
    await p.goto(base + '/omega-prime?id=' + pid + '&step=quote', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#s-quote.on', { timeout: 10000 });
    var tot = await until(p, function () { var t = document.getElementById('pq-total'); return t && t.value ? t.value : null; });
    ok('reopened, the total box holds the saved figure to the cent', tot === '1,234,567.89' && await p.$eval('#pq-mode-total', function (e) { return e.checked; }), tot);
    await p.fill('#pq-phone', '312-555-0199');
    await p.click('#pq-save');
    await until(p, function () { return /· revision 2$/.test(document.getElementById('pqNo').textContent) ? true : null; });
    var rec2b = DB.data.get('customer_quotes/' + qid2) || {};
    ok('a re-save for the phone alone leaves the price exactly where it was', rec2b.rev === 2 && rec2b.pricing && rec2b.pricing.sellCents === 123456789 && rec2b.customer.phone === '312-555-0199', rec2b.pricing);
    /* the answer to a link send is lost: the send ran on the server */
    function sendIds() { return calls.quote.filter(function (c) { return c.body && c.body.action === 'send'; }).map(function (c) { return c.body.sendId; }); }
    calls.dropSend = true;
    await p.click('#pq-link');
    var dropped = await until(p, function () { var s = document.getElementById('pqStatus'); return s && s.className === 'err' && s.textContent ? s.textContent : null; });
    var dropId = sendIds().pop();
    await p.click('#pq-link');
    var rep2 = await until(p, function () { var s = document.getElementById('pqStatus'); return s && /shown only once/.test(s.textContent) ? s.textContent : null; });
    ok('the retry is the same send, and Prime says what the server said, with no link to copy', !!dropped && !!rep2 && sendIds().pop() === dropId && !(await p.$('#pqLink')) && !/Link made/.test(rep2) && DB.data.get('customer_quotes/' + qid2).status === 'sent', { dropped: dropped, rep: rep2 });
    await p.click('#pq-link');
    var link3 = await until(p, function () { var i = document.getElementById('pqLink'); return i && i.value ? i.value : null; });
    ok('the next press is a new send, with its own link', !!link3 && sendIds().pop() !== dropId, sendIds());
    /* Track on THE proposal a link names, then the other from its row */
    await p.goto(base + '/omega-prime?id=' + pid + '&step=track&quote=' + qid, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#s-track.on', { timeout: 10000 });
    var trq = await until(p, function (q1) { var on = document.querySelector('#trList .qrow.on'), c = document.querySelector('#trLadder .st.current'); return document.querySelectorAll('#trList .qrow').length === 2 && on && on.getAttribute('data-quote') === q1 && c ? { cur: c.getAttribute('data-step'), sub: document.getElementById('trSub').textContent } : null; }, qid);
    ok('&step=track&quote= opens Track on THAT proposal, not the latest: its ladder, its order awaiting a price', !!trq && trq.cur === 'priced' && trq.sub.indexOf(qno) >= 0, trq);
    await p.setViewportSize({ width: 390, height: 844 });
    var wide2 = await p.evaluate(function () { return { doc: document.documentElement.scrollWidth, scr: document.getElementById('s-track').scrollWidth }; });
    ok('the list fits a 390 px phone', wide2.doc <= 390 && wide2.scr <= 390, wide2);
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.click('#tr-q0-track');
    var trq2 = await until(p, function (q2) { var on = document.querySelector('#trList .qrow.on'); return on && on.getAttribute('data-quote') === q2 ? document.getElementById('trSub').textContent : null; }, qid2);
    ok('Track on a row draws that proposal', !!trq2 && trq2.indexOf(rec2.quoteNo) >= 0 && /rev 2/.test(trq2), trq2);
    await p.click('#tr-q1-open');
    await p.waitForSelector('#s-quote.on');
    var op = await until(p, function (n1) { var t = document.getElementById('pqNo').textContent; return t.indexOf(n1) >= 0 ? { no: t, name: document.getElementById('pq-name').value, markup: document.getElementById('pq-mode-markup').checked, rep: document.getElementById('pqRep').textContent } : null; }, qno);
    ok('Open on a row loads that proposal into the Proposal step: the approved one, a change there a new proposal', !!op && /revision 2/.test(op.no) && op.name === 'Dana Ruiz' && op.markup && /A change now is a new proposal/.test(op.rep), op);
    await p.click('#pq-q0-print');
    var printed2 = await until(p, function (n2) { var f = document.getElementById('omega-quote-deck-print'); try { var d = f && f.contentDocument; return d && d.querySelector('.oqd') && d.title.indexOf(n2) >= 0 ? d.title : null; } catch (e) { return null; } }, rec2.quoteNo, 6000);
    ok('Print on a row prints that proposal', !!printed2, printed2);
    /* the customer approves the second one too: while the first order is
       live no second order is made; then its hand-off record is lost (the
       approval landed, the record of the hand-off did not) */
    var key3 = /key=([a-f0-9]{48})$/.exec(link3 || '') || [];
    var op3 = await door(QUOTE, 'GET', null, { id: qid2, key: key3[1] });
    var ap3 = await door(QUOTE, 'POST', { action: 'approve', id: qid2, key: key3[1], name: 'Dana Ruiz', agree: true, snapshot: op3.body.quote && op3.body.quote.snapshot });
    await pushBack(p);
    var ho3 = DB.data.get('customer_quotes/' + qid2).handoff || {};
    ok('a second approval on the site makes no second order while the first is live, and says why', ap3.status === 200 && DB.data.get('customer_quotes/' + qid2).status === 'approved' && /already has order/.test(ho3.error || ''), { appr: ap3.status, ho: ho3 });
    var lost = JSON.parse(JSON.stringify(DB.data.get('customer_quotes/' + qid2))); lost.handoff = null; DB.seed('customer_quotes/' + qid2, lost);
    await p.goto(base + '/omega-prime?id=' + pid + '&step=track&quote=' + qid2, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#s-track.on', { timeout: 10000 });
    var nh = await until(p, function () { var e = document.getElementById('trHandErr'), b = document.getElementById('tr-retry'); return e && b ? { text: e.textContent, btn: b.textContent, guide: document.getElementById('gT').textContent } : null; });
    ok('an approval with no hand-off on record still offers to send the order, and says it has not reached Omega Logic', !!nh && /has not reached Omega Logic yet/.test(nh.text) && nh.btn === 'Send to Omega Logic' && /has not reached Omega Logic yet/.test(nh.guide), nh);
    await p.click('#tr-retry');
    var nh2 = await until(p, function () { var e = document.getElementById('trHandErr'); return e && /already has order/.test(e.textContent) ? e.textContent : null; });
    ok('sent again, the door answers with the reason in plain words (the first order is live)', !!nh2 && /Cancel or close that order in Omega Logic/.test(nh2), nh2);
    await p.close();

    /* ── Mesa, Arizona: the utility named, never one utility's words ── */
    var mctx = await context(browser, base, calls, external);
    var m = await mctx.newPage(); watch(m, errs);
    await m.goto(base + '/omega-prime.html', { waitUntil: 'domcontentloaded' });
    await until(m, function () { var s = document.getElementById('unitSel'); return s && s.options.length >= 5 ? true : null; });
    /* the unit Tommy placed there (2026-10-20): the CC290/125 */
    var c290i = await m.evaluate(function () { var o = [].filter.call(document.getElementById('unitSel').options, function (x) { return /CC290\/125/.test(x.textContent); })[0]; return o ? o.value : null; });
    await m.selectOption('#unitSel', c290i);
    ok('Mesa: the CC290/125 is offered at its reference cabinet size', /4\.36 × 3\.94( × 7\.71)? ft reference size, confirm on the submittal/.test(await text(m, '#unitCard')), await text(m, '#unitCard'));
    await m.fill('#addr', '29 W Main St, Mesa, AZ 85201');
    await m.click('#go');
    await m.waitForSelector('#s-atlas.on');
    await until(m, function () { return /substations within/.test(document.getElementById('gaStat').textContent); });
    await m.click('#ly-sub'); await m.click('.subicon.near');
    await until(m, function () { var e = document.getElementById('gaInspUtil'); return e && /City of Mesa/.test(e.textContent) ? true : null; });
    await m.click('#ga-go');
    var mc = await until(m, function () { var t = document.getElementById('sfRes').textContent; return /City of Mesa/.test(t) && /Next/.test(t) ? t : null; });
    var mh = calls.hosting[calls.hosting.length - 1] || {};
    ok('Mesa: one question to the national door at the point', Math.abs(mh.lat - MESA.lat) < 1e-6 && mh.substation && mh.substation.name === 'Mesa Downtown', mh);
    ok('Mesa: the city\'s own utility leads, SRP and APS beside it, confirm with the bill', !!mc && /City of Mesa/.test(mc) && /Salt River Project/.test(mc) && /More than one utility is mapped/.test(mc) && /Arizona Public Service/.test(mc) && /encloses Arizona Public Service and City of Mesa islands/.test(mc) && /bill/.test(mc), mc && mc.slice(0, 900));
    ok('Mesa: it says no figure is published, and nothing is judged as if it were', /publishes hosting capacity/.test(mc) && /Needs a study/.test(mc) && /Mesa Downtown/.test(mc), mc && mc.slice(0, 900));
    var mv = await m.$eval('#sf-verify', function (a) { return { href: a.getAttribute('href'), text: a.textContent }; }).then(null, function () { return null; });
    ok('Mesa: no utility map is offered for a city utility that publishes none', mv === null, mv);
    ok('Mesa: the pill names the City of Mesa', /^City of Mesa · publishes no hosting capacity$/.test(await text(m, '#utilPill')), await text(m, '#utilPill'));
    var body1 = await m.evaluate(function () { return document.body.innerText; });
    ok('Mesa: no ComEd wording anywhere, and never "outside … territory"', !/ComEd/i.test(body1) && !/outside .*territory/i.test(body1), (body1.match(/.{0,60}(ComEd|territory).{0,60}/gi) || []));
    await shot(m, 'prime-10-mesa-circuit');
    await m.click('#sf-tomap');
    await until(m, function () { return /City of Mesa/.test(document.getElementById('ldRates').textContent) ? true : null; });
    var mr = calls.rates[calls.rates.length - 1] || {};
    ok('Mesa: the rates are asked for the City of Mesa by its EIA id and name', mr.eia === '12351' && mr.name === 'City of Mesa' && mr.zip === '85201', mr);
    var mnote = await text(m, '#ldNote');
    ok('Mesa: the rate book says whose planning rates stand in', /No rate book for City of Mesa/.test(mnote) && /AZ planning rates/.test(mnote), mnote);
    var body2 = await m.evaluate(function () { return document.body.innerText; });
    ok('Mesa: still no ComEd wording on the load step', !/ComEd/i.test(body2), (body2.match(/.{0,60}ComEd.{0,60}/gi) || []));
    await m.waitForTimeout(800);
    var md = await storeOf(m), mp = projectsIn(md).map(function (k) { return md.docs[k]; })[0] || {};
    ok('Mesa: the project keeps the utility the territory named', mp.prime && mp.prime.hosting && mp.prime.hosting.utility && mp.prime.hosting.utility.display === 'City of Mesa' && mp.prime.hosting.coverage === 'no-public-map', mp.prime && mp.prime.hosting);
    await shot(m, 'prime-11-mesa-load');
    /* Tommy's case (2026-10-20, "it does it for fenecon unit but not on
       cleancell get that fixed"): the CC290/125 placed at 29 W Main St,
       Mesa is a block at its reference cabinet size, never a marked point */
    await m.click('#ld-tomap');
    await m.waitForSelector('#s-map.on');
    var mb = await m.$eval('#edMap', function (e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    var mx0 = mb.x + mb.w / 2, my0 = mb.y + mb.h / 2;
    await m.click('#ed-area');
    await m.mouse.move(mx0 - 180, my0 - 90); await m.mouse.down(); await m.mouse.move(mx0 + 40, my0 - 10, { steps: 6 }); await m.mouse.move(mx0 + 180, my0 + 90, { steps: 6 }); await m.mouse.up();
    await m.click('#ed-place'); await m.mouse.click(mx0 - 60, my0);
    var placed = await until(m, function () { var t = [].map.call(document.querySelectorAll('#edMap .leaflet-tooltip'), function (e) { return e.textContent; }).join(' | '); return /CC290\/125 · /.test(t) ? t : null; });
    ok('Mesa: the CC290/125 is placed as a block at its reference cabinet size, with its transformer and disconnect, never a marked point', !!placed && /CC290\/125 · 4\.36×3\.94 ft \(reference\)/.test(placed) && /XFMR/.test(placed) && /DISC/.test(placed) && !/footprint not/.test(placed), placed);
    await m.waitForTimeout(700);                     /* the zoom to the area settles, and the labels with it */
    await shot(m, 'prime-12-mesa-cc290-block');
    await m.close();

    /* ── a create that failed is made again: as the work goes on, and by
       Save this site; the record then holds everything done so far ── */
    var rctx = await context(browser, base, calls, external);
    async function startRefused(pg) {
      await pg.goto(base + '/omega-prime.html', { waitUntil: 'domcontentloaded' });
      await until(pg, function () { var s = document.getElementById('unitSel'); return s && s.options.length >= 5 ? true : null; });
      await pg.evaluate(function () { window.__firebaseDouble.store.failures['projects/'] = { op: 'write', message: 'The connection dropped.' }; });
      await pg.fill('#addr', '3400 S Federal St, Chicago, IL 60616');
      await pg.click('#go');
      await pg.waitForSelector('#s-atlas.on');
      return until(pg, function () { var b = document.getElementById('banner'); return b && !b.hidden && /not saved yet/.test(b.textContent) ? b.textContent : null; });
    }
    function madeIn(st) { return st.log.filter(function (w) { return w.op === 'add' && /^projects\//.test(w.path); }); }
    /* the step buttons pressed as the DOM does: with the error banner up the
       screen is shorter, and the floating guide covers the circuit panel's
       Next (a layout matter this context does not test) */
    function press(pg, sel) { return pg.waitForSelector(sel).then(function () { return pg.$eval(sel, function (b) { b.click(); }); }); }
    function idUrl(pg) { return until(pg, function () { return /^\/omega-prime\?id=[A-Za-z0-9]+$/.test(location.pathname + location.search) ? location.pathname + location.search : null; }); }
    var ra = await rctx.newPage(); watch(ra, errs);
    var rb1 = await startRefused(ra), sa0 = await storeOf(ra);
    ok('a create that fails says so, and nothing is written', !!rb1 && /The connection dropped/.test(rb1) && projectsIn(sa0).length === 0 && !/[?&]id=/.test(ra.url()), { banner: rb1, n: projectsIn(sa0).length, url: ra.url() });
    await ra.evaluate(function () { delete window.__firebaseDouble.store.failures['projects/']; });
    await until(ra, function () { return /substations within/.test(document.getElementById('gaStat').textContent) ? true : null; });
    await ra.click('#ly-sub'); await ra.click('.subicon.near'); await press(ra, '#ga-go');
    var raUrl = await idUrl(ra), sa1 = await storeOf(ra), aMade = madeIn(sa1);
    ok('the next step makes it again by itself: one record, the address bar resumes it, the banner gone', !!raUrl && aMade.length === 1 && raUrl === '/omega-prime?id=' + aMade[0].path.split('/')[1] && await ra.$eval('#banner', function (b) { return b.hidden; }), { url: raUrl, n: aMade.length });
    await ra.close();
    var rb = await rctx.newPage(); watch(rb, errs);
    await startRefused(rb);
    await until(rb, function () { return /substations within/.test(document.getElementById('gaStat').textContent) ? true : null; });
    await rb.click('#ly-sub'); await rb.click('.subicon.near'); await press(rb, '#ga-go');
    await until(rb, function () { return /Next/.test(document.getElementById('sfRes').textContent) ? true : null; });
    await press(rb, '#sf-tomap');
    await until(rb, function () { return /ComEd/.test(document.getElementById('ldRates').textContent) ? true : null; });
    await press(rb, '#ld-tomap'); await rb.waitForSelector('#s-map.on');
    await rb.waitForTimeout(900);
    var se = await rb.evaluate(function () { var e = document.getElementById('saveErr'); return { err: e ? e.textContent : '', make: !!document.getElementById('pr-make'), editor: !!document.getElementById('toEditor') }; });
    ok('still refused on every step: the side panel says the site is not saved and offers Save this site', /not saved yet/.test(se.err) && /The connection dropped/.test(se.err) && se.make && !se.editor && projectsIn(await storeOf(rb)).length === 0, se);
    await rb.evaluate(function () { delete window.__firebaseDouble.store.failures['projects/']; });
    await press(rb, '#pr-make');
    var rbUrl = await idUrl(rb);
    await rb.waitForTimeout(900);
    var sb1 = await storeOf(rb), bMade = madeIn(sb1), rpid = bMade[0] ? bMade[0].path.split('/')[1] : '', rdoc = sb1.docs['projects/' + rpid] || {};
    ok('Save this site makes it once the refusal clears: one record, the address bar resumes it', !!rbUrl && bMade.length === 1 && rbUrl === '/omega-prime?id=' + rpid, { url: rbUrl, n: bMade.length });
    ok('holding everything done so far: the utility, the load, the step it is on', !!(rdoc.prime && rdoc.prime.hosting && rdoc.prime.hosting.utility && rdoc.prime.hosting.utility.display === 'ComEd' && rdoc.load && rdoc.prime.step === 'map'), rdoc.prime && { step: rdoc.prime.step, hosting: rdoc.prime.hosting && rdoc.prime.hosting.utility });
    var sideR = await rb.evaluate(function () { return { editor: !!document.getElementById('toEditor'), err: !!document.getElementById('saveErr'), banner: document.getElementById('banner').hidden }; });
    ok('the side panel opens Site Map now; the error and the banner are gone', sideR.editor && !sideR.err && sideR.banner, sideR);
    /* a step the record has not reached: the furthest it has */
    await rb.goto(base + '/omega-prime?id=' + rpid + '&step=track', { waitUntil: 'domcontentloaded' });
    await rb.waitForSelector('#s-map.on', { timeout: 10000 });
    ok('&step=track on a site with no proposal opens the furthest step it reached (Site Map)', new URL(rb.url()).search === '?id=' + rpid && !!(await rb.$('#path button.lock[data-step="track"]')), rb.url());
    await rb.close();
  } catch (e) { fails++; console.log('FAIL the run stopped: ' + (e && e.stack || e)); }
  await browser.close(); srv.close();
  ok('no page error', errs.length === 0, errs);
  ok('no unexpected server error', serverErrs.length === 0, serverErrs);
  ok('nothing reached the network', external.length === 0, external);
  if (shots.length) console.log('screenshots:\n  ' + shots.join('\n  '));
  if (fails) { console.log(fails + ' Omega Prime check(s) FAILED'); process.exit(1); }
  console.log('Omega Prime: ' + checks + ' checks passed; site to proposal to Track on the Firebase double and the real doors (hosting capacity, rates, price, quote, branding), resumed, on a phone, and at Mesa AZ; nothing fetched but Leaflet.');
})();
