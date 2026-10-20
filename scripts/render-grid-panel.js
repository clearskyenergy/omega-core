#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Site Map's Grid panel (Analyze › Grid Check) in the REAL editor.html, on
 * the national door (2026-10-17, Tommy: "it should not just run comed
 * information if its outside of comed it needs to look via api for the
 * utility details"). Chromium, signed in on the Firebase double. The Grid
 * Atlas service answers the nearest substation; /api/hosting-capacity is the
 * REAL door's run() on a fake network, as render-omega-prime.js runs it (the
 * territory layers and the utility's own map are the only things faked).
 *   ComEd   3400 S Federal St: ComEd named, circuit F0297 at 10,725 kW net,
 *           the ComEd sentence byte for byte, the other circuit counted,
 *           ComEd's own map to check, and the answer on S.grid in the record
 *           Omega Prime writes (GV.fromHosting)
 *   Mesa    29 W Main St, Mesa AZ: the city's own electric service area map
 *           (2026-10-20) puts the point inside it, so the City of Mesa is
 *           named with confidence over Salt River Project and APS, "publishes
 *           no hosting capacity" in the server's words, Needs a study, the
 *           city's own page to check, no ComEd word and no map invented;
 *           who serves the point (2026-10-20): the City of Mesa, why, what
 *           it publishes and the city's service-area map, with Salt River
 *           Project and APS folded away with the reason, in Omega Prime's
 *           words and order (its own candidatesBlock, run on the same answer)
 *   map down  the city's map does not answer: all three utilities listed,
 *           each with what it publishes, its route and its own pages
 *   phone   390 px: the panel inside the screen, nothing scrolled sideways,
 *           the list and its fold included, in both Mesa cases
 *   Site Plan  editor-v2.html's Grid Atlas layer on the same door: the
 *           sample parcel in Phoenix names Arizona Public Service, says
 *           what it publishes in the server's words, links its own page,
 *           lists who serves the point with APS's service-area viewer, and
 *           the page loads no ComEd module; at Mesa its card folds SRP and
 *           APS away, in Prime's words, on a desktop and a 390 px phone
 * Fails on a page error, any browser request to the ComEd-only module, its
 * proxy or ComEd's service, or a panel off the screen. SHOT_DIR keeps the
 * screenshots (a temp folder by default).
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var FD = require('./_lib/firebase-double'), F = require('./_lib/firestore-double');
/* the door's run() never reaches Firestore here (db is null), so admin.js
   is a stand-in, as render-omega-prime.js has it: no firebase-admin needed */
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  db: function () { return null; }, isDegraded: function () { return true; } });
var H = require('../api/hosting-capacity')._helpers, CS = require('../api/_lib/comed-service'), HS = require('../api/_lib/hosting-sources');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, vm = require('vm');
var ROOT = path.join(__dirname, '..'), HOST = '127.0.0.1', fails = 0, checks = 0;
var SHOTS = process.env.SHOT_DIR || path.join(os.tmpdir(), 'omega-grid-panel');
function ok(name, cond, detail) {
  checks++;
  if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 900) : '')); }
  else console.log('ok   ' + name);
}

var CHICAGO = { lat: 41.81522, lng: -87.62261, addr: '3400 S Federal St, Chicago, IL 60616',
  sub: { name: 'Crawford', voltageKv: 138, distanceKm: 1.2, owner: 'Commonwealth Edison' } };
var MESA = { lat: 33.4152, lng: -111.8329, addr: '29 W Main St, Mesa, AZ 85201',
  sub: { name: 'Mesa Downtown', voltageKv: 69, distanceKm: 0.62, owner: 'Salt River Project' } };
var XXL = { mfr: 'FENECON', model: 'Industrial XXL', kw: '2508', kwh: '5015', qty: '1' };
var COMED_SAY = 'Circuit F0297 has about 10,725 kW of room: 15,620 kW published, less 4,895 kW already queued. The 2.5 MW unit fits with 8,217 kW to spare.';

function Esri(rows) { return { features: rows.map(function (r) { return { attributes: { NAME: r[1], Utility_ID: r[0], TYPE: r[2], STATE: r[3] || '', HOLDING_CO: r[1], Total_Customer_Count_2024: r[4] || null, Shape__Area: r[5] || null } }; }) }; }
var COMED = { features: [
  { attributes: { Feeder: 'F0297', SS_N: 'Crawford TSS 21', BESS_HC: 15620, PV_HC_kW: 15620, EV_HC_kW: 16100, Feeder_Q: 4895, Queue_RD: '09/30/2026' } },
  { attributes: { Feeder: 'F0301', SS_N: 'Crawford TSS 21', BESS_HC: 900, PV_HC_kW: 900, EV_HC_kW: 2400, Feeder_Q: 100, Queue_RD: '09/30/2026' } }] };
/* the territory layers and the utility's map, as the door asks them:
   Chicago, Mesa, and Site Plan's sample parcel in Phoenix. NET.cityMapDown:
   the City of Mesa's own service-area map does not answer. */
var NET = { cityMapDown: false };
function netFor(lng) {
  var mesa = lng < -100, phoenix = lng < -112;
  return function (url) {
    if (phoenix && /Electricity_Rates_H3_Res5/.test(url)) return Promise.resolve(Esri([['803', 'ARIZONA PUBLIC SERVICE CO', 'INVESTOR OWNED', 'AZ', 1400037, 1.3e11]]));
    if (phoenix && /tigerweb/.test(url)) return Promise.resolve({ features: [{ attributes: { NAME: 'Phoenix city', BASENAME: 'Phoenix' } }] });
    if (/Electricity_Rates_H3_Res5/.test(url)) return Promise.resolve(mesa
      ? Esri([['12351', 'CITY OF MESA - (AZ)', 'MUNICIPAL', 'AZ', 18101, 4.3e9], ['16572', 'SALT RIVER PROJECT', 'POLITICAL SUBDIVISION', 'AZ', 1166094, 3e10], ['803', 'ARIZONA PUBLIC SERVICE CO', 'INVESTOR OWNED', 'AZ', 1400037, 1.3e11]])
      : Esri([['4110', 'COMMONWEALTH EDISON CO', 'INVESTOR OWNED', 'IL', 4130749, 6.1e10]]));
    if (/tigerweb/.test(url)) return Promise.resolve({ features: [{ attributes: { NAME: (mesa ? 'Mesa' : 'Chicago') + ' city', BASENAME: mesa ? 'Mesa' : 'Chicago' } }] });
    /* the City of Mesa's own electric service area: 1.5 km around downtown */
    if (mesa && /GCX_ExploreMesa\/MapServer\/13\/query/.test(url)) {
      if (NET.cityMapDown) return Promise.reject(new Error('the city\'s map is down'));
      return Promise.resolve({ features: [{ attributes: { FACILITYID: 'ELSA2' }, geometry: square(MESA.lat, MESA.lng, 1500) }] });
    }
    if (url.indexOf(CS.SERVICE) === 0) return Promise.resolve(JSON.parse(JSON.stringify(COMED)));
    return Promise.resolve({ features: [] });
  };
}
function square(lat, lng, m) { var a = m / 111320, b = m / (111320 * Math.cos(lat * Math.PI / 180)); return { rings: [[[lng - b, lat - a], [lng + b, lat - a], [lng + b, lat + a], [lng - b, lat + a], [lng - b, lat - a]]] }; }

/* Omega Prime's own candidatesBlock, cut out of the page with its esc and
   safeHref and run on the one client: what each page's list is held to,
   word for word and link for link, on the same answer */
var PRIME = (function () {
  var src = fs.readFileSync(path.join(ROOT, 'omega-prime.html'), 'utf8'), ctx = { window: {} };
  function cut(name) {
    var i = src.indexOf('function ' + name + '('), j = src.indexOf('{', i), d = 0, k;
    if (i < 0) throw new Error('omega-prime.html has no ' + name);
    for (k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) break; }
    return src.slice(i, k + 1);
  }
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'omega-grid-verdict.js'), 'utf8'), ctx, { filename: 'omega-grid-verdict.js' });
  vm.runInContext('var GV = window.OmegaGridVerdict;\n' + cut('esc') + '\n' + cut('safeHref') + '\n' + cut('candidatesBlock'), ctx, { filename: 'omega-prime.html' });
  return ctx;
})();
function primeHtml(res) { return res ? PRIME.candidatesBlock(JSON.parse(JSON.stringify(res))) : ''; }
function primeSays(res) { return primeHtml(res).replace(/<[^>]*>/g, '').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function primeLinks(res) { var out = [], re = /<a href="([^"]*)"/g, h = primeHtml(res), m; while ((m = re.exec(h))) out.push(m[1].replace(/&amp;/g, '&')); return out; }
function sameLinks(links, res) { return JSON.stringify((links || []).map(function (l) { return l.href; })) === JSON.stringify(primeLinks(res)); }

/* the Grid panel's who-serves list, as a person reads it */
function whoIn(p) {
  return p.evaluate(function () {
    var w = document.querySelector('#omega-grid-panel [data-gp="who"]');
    if (!w) return null;
    var d = w.querySelector('[data-gp="who-fold"]');
    return { head: w.querySelector('b').textContent, text: w.textContent,
      items: [].map.call(w.querySelectorAll(':scope > ul > li'), function (li) { return li.textContent; }),
      summary: d ? d.querySelector('summary').textContent : '', open: !!(d && d.open),
      folded: d ? [].map.call(d.querySelectorAll('li'), function (li) { return li.textContent; }) : [],
      links: [].map.call(w.querySelectorAll(':scope > ul > li a'), function (a) { return { href: a.getAttribute('href'), text: a.textContent, target: a.getAttribute('target'), rel: a.getAttribute('rel') }; }) };
  });
}
/* the panel inside the screen, nothing in it wider than it, and every link
   of the list inside it */
function fits(p) {
  return p.evaluate(function () {
    var el = document.getElementById('omega-grid-panel'), r = el.getBoundingClientRect();
    var links = [].map.call(el.querySelectorAll('[data-gp="who"] a'), function (a) { var b = a.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1; });
    var out = { l: r.left, r: r.right, w: innerWidth, sw: el.scrollWidth, cw: el.clientWidth, links: links.length, linksInside: links.every(Boolean) };
    out.ok = out.l >= 0 && out.r <= out.w && out.sw <= out.cw + 1 && out.linksInside;
    return out;
  });
}
function showWho(p) { return p.evaluate(function () { var w = document.querySelector('#omega-grid-panel [data-gp="who"]'); if (w) w.scrollIntoView({ block: 'start' }); }); }
/* Site Plan's card: its who-serves lines, as a person reads them */
function sitePlanWho(p) {
  return p.evaluate(function () {
    var b = document.getElementById('grid-detail-body'), card = document.getElementById('grid-detail');
    if (!b) return null;
    var parts = [].filter.call(b.children, function (n) { return /(^| )who-/.test(n.className); }), d = b.querySelector('details.who-fold'), cr = card.getBoundingClientRect();
    return { text: parts.map(function (n) { return n.textContent; }).join(''),
      head: (b.querySelector('.who-head') || {}).textContent || '',
      bold: [].map.call(b.querySelectorAll('.who-name b'), function (x) { return x.textContent; }),
      names: [].map.call(b.querySelectorAll('.who-name'), function (x) { return x.textContent; }),
      fold: d ? { open: d.open, summary: d.querySelector('summary').textContent, items: [].map.call(d.querySelectorAll('p'), function (x) { return x.textContent; }) } : null,
      links: [].map.call(b.querySelectorAll('.who-link a'), function (a) { return { href: a.getAttribute('href'), target: a.target, rel: a.rel }; }),
      box: { l: cr.left, r: cr.right, w: innerWidth, sw: card.scrollWidth, cw: card.clientWidth } };
  });
}
/* the centre of a public-layer query's envelope */
function centreOf(url) {
  try { var g = JSON.parse(new URL(url).searchParams.get('geometry')); return { lat: (g.ymin + g.ymax) / 2, lng: (g.xmin + g.xmax) / 2 }; } catch (e) { return null; }
}
/* the Grid Atlas service's measurement at the point (the pre-screen's) */
function atlasFor(b) {
  var mesa = +b.lng < -100;
  return { lat: b.lat, lng: b.lng, score: mesa ? 58 : 81, summary: 'render fixture', model: 'render', build: 'render',
    substations: [mesa ? MESA.sub : CHICAGO.sub], lines: [], plants: [], findings: [], criteria: [] };
}

var srv = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  if (p === '/editor') p = '/editor.html';
  var file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

var USER = { uid: 'grid-rep', email: 'rep@clearsky-usa.com', displayName: 'Grid Rep', emailVerified: true };
var DOCS = { 'omega_orgs/clearsky-usa.com': { name: 'ClearSky Energy', status: 'active' },
  'omega_orgs/clearsky-usa.com/members/grid-rep': { role: 'owner', status: 'active', email: USER.email },
  'termsAcceptances/grid-rep': { version: '2026-09-23' } };

async function editor(browser, base, viewport, calls, errs) {
  var ctx = await browser.newContext({ viewport: viewport });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
    var url = r.request().url();
    calls.external.push(url.slice(0, 160));
    if (/gstatic\.com\/firebasejs|maps\.googleapis\.com|maps\.gstatic\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\//.test(url)) return r['continue']();
    return r.abort();
  });
  await ctx.route(base + '/omega-tenant.js', function (r) { return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }); });
  await ctx.route(base + '/omega-brand.js', function (r) { return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }); });
  await ctx.route(base + '/omega-comed-layers.js', function (r) { calls.comedModule++; return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
  await ctx.route(base + '/comed-proxy/**', function (r) { calls.comedProxy++; return r.abort(); });
  await ctx.route(base + '/api/**', async function (r) {
    var req = r.request(), u = new URL(req.url()), body = req.method() === 'POST' ? req.postDataJSON() : null;
    function json(s, o) { return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) }); }
    if (u.pathname === '/api/grid-atlas') { calls.atlas.push(body); return json(200, atlasFor(body || {})); }
    if (u.pathname === '/api/hosting-capacity') {
      var call = { body: body, auth: req.headers().authorization || '', res: null };
      calls.hosting.push(call);
      var res = await H.run({ lat: body.lat, lng: body.lng, unit: body.unit, substation: body.substation, mode: body.mode },
        { db: function () { return null; }, now: Date.now, fetchJson: netFor(body.lng), log: function () {} });
      call.res = JSON.parse(JSON.stringify(res));
      return json(200, call.res);
    }
    if (u.pathname === '/api/grid-verdict') { calls.verdict++; return json(503, { error: 'not asked by the panel' }); }
    calls.other.push(u.pathname);
    return json(503, { error: 'offline' });
  });
  await ctx.addInitScript(FD.source());
  await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: USER, docs: DOCS, latency: 5, authDomain: HOST });
  var p = await ctx.newPage();
  p.on('pageerror', function (e) { errs.push(e.message); });
  await p.goto(base + '/editor.html', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForFunction(function () { return window.OmegaGridPanel && window.OmegaGridVerdict && window.OmegaGridPrescreen && typeof S !== 'undefined' && document.getElementById('rb-grid-panel'); }, null, { timeout: 60000 });
  return { ctx: ctx, page: p };
}

/* the project's site point (the centre a project keeps) and the unit the
   Guided Build placed, then Analyze › Grid Check as a person presses it */
async function at(p, site) {
  await p.evaluate(function (s) {
    window._savedMapState = { lat: s.lat, lng: s.lng, zoom: 18 };
    S.siteAddr = s.addr;
    S.bessList = [s.unit];
    var g = document.getElementById('omega-editor-gate');
    if (g && g.parentNode) g.parentNode.removeChild(g);
  }, { lat: site.lat, lng: site.lng, addr: site.addr, unit: XXL });
}
async function pressGridCheck(p) {
  var shown = await p.evaluate(function () {
    if (typeof rbTab === 'function') rbTab('analyze');
    var page = document.querySelector('#ribbon .ribbon-page[data-page="analyze"]');
    var b = document.getElementById('rb-grid-panel');
    if (!page || !b) return false;
    /* the plan's caps are not under test here (tlegacygates.js holds them) */
    page.classList.add('active'); page.style.setProperty('display', 'flex', 'important');
    for (var n = b; n && n !== page; n = n.parentElement) { n.removeAttribute('data-package-hidden'); n.style.setProperty('display', n === b ? 'flex' : (getComputedStyle(n).display === 'none' ? 'flex' : getComputedStyle(n).display), 'important'); n.style.setProperty('visibility', 'visible', 'important'); }
    var rib = document.getElementById('ribbon');
    if (rib) { rib.style.setProperty('display', 'flex', 'important'); rib.style.setProperty('height', '92px', 'important'); }
    b.scrollIntoView({ block: 'center', inline: 'center' });
    var r = b.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  });
  if (!shown) throw new Error('Analyze › Grid Check is not on the ribbon');
  await p.click('#rb-grid-panel', { timeout: 15000 });
}
function answered(p, re, ms) {
  return p.waitForFunction(function (src) {
    var el = document.getElementById('omega-grid-panel');
    if (!el || window.OmegaGridPanel._t.ST.busy) return null;
    return new RegExp(src).test(el.textContent) ? el.textContent : null;
  }, re.source, { timeout: ms || 20000 }).then(function (h) { return h.jsonValue(); }, function () { return null; });
}
/* Site Plan (editor-v2.html): its Grid Atlas layer asks the same door on
   the Site Plan session; the public substation and transmission layers are
   answered here, as the page asks them */
async function sitePlan(browser, base, calls, errs) {
  var ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  var p = await ctx.newPage(), mark = calls.hosting.length;
  p.on('pageerror', function (e) { errs.push('site plan: ' + e.message); });
  await p.route('**/*', async function (r) {
    var url = r.request().url();
    if (url.indexOf(base) === 0 && url.indexOf('/api/') < 0) {
      if (/\/omega-comed-layers\.js/.test(url)) calls.comedModule++;
      return r['continue']();
    }
    if (url.indexOf(base + '/api/hosting-capacity') === 0) {
      var b = r.request().postDataJSON(), call = { body: b, auth: r.request().headers().authorization || '', res: null };
      calls.hosting.push(call);
      var res = await H.run({ lat: b.lat, lng: b.lng, unit: b.unit, substation: b.substation, mode: b.mode },
        { db: function () { return null; }, now: Date.now, fetchJson: netFor(b.lng), log: function () {} });
      call.res = JSON.parse(JSON.stringify(res));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
    }
    if (/Substations\/FeatureServer\/0\/query/i.test(url)) {
      /* the public layer's nearest substation: Mesa Downtown when the card
         is asked at Mesa, Ocotillo at the sample parcel in Phoenix */
      var c = centreOf(url), atMesa = !!c && c.lng > -112;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [atMesa
        ? { attributes: { NAME: 'Mesa Downtown', MAX_VOLT: 69, OWNER: 'Salt River Project' }, geometry: { x: -111.8270, y: 33.4190 } }
        : { attributes: { NAME: 'Ocotillo', MAX_VOLT: 69, OWNER: 'Arizona Public Service' }, geometry: { x: -112.068, y: 33.309 } }] }) });
    }
    if (/Transmission_Lines\/FeatureServer\/0\/query/i.test(url)) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ features: [{ attributes: { VOLTAGE: 230, OWNER: 'Arizona Public Service', ID: 'T1' }, geometry: { paths: [[[-112.08, 33.30], [-112.06, 33.31]]] } }] }) });
    if (url.indexOf(base + '/api/editor-v2-3d-config') === 0) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photorealistic: false }) });
    if (url.indexOf(base + '/api/editor-v2-component-cost') === 0) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('../api/_lib/editor-v2-component-cost')(r.request().postDataJSON())) });
    calls.external.push(url.slice(0, 160));
    return r.abort();
  });
  await p.goto(base + '/editor-v2.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(function () { return !!window.OmegaEditorV2Grid && !!window.OmegaEditorV2Auth && !!document.getElementById('layer-grid-atlas-toggle'); }, null, { timeout: 60000 });
  /* the Site Plan session's token, as a signed-in visitor has it */
  var noComEd = await p.evaluate(function () { window.OmegaEditorV2Auth.idToken = function () { return Promise.resolve('site-plan-token'); }; return typeof window.OmegaComEdLayers === 'undefined'; });
  await p.click('#layer-grid-atlas-toggle');
  var text = await p.waitForFunction(function () {
    var d = document.getElementById('grid-detail'), b = document.getElementById('grid-detail-body');
    return d && !d.hidden && b && /Serving utility/.test(b.textContent) ? b.innerText : null;
  }, null, { timeout: 20000 }).then(function (h) { return h.jsonValue(); }, function () { return null; });
  var links = await p.$$eval('#grid-detail-body a', function (as) { return as.map(function (a) { return { href: a.getAttribute('href'), target: a.target, rel: a.rel, text: a.textContent }; }); });
  var h = calls.hosting[mark] || { body: {} };
  ok('Site Plan: the Grid Atlas layer asks the national door once, on the Site Plan session', calls.hosting.length === mark + 1 && h.auth === 'Bearer site-plan-token', calls.hosting.slice(mark));
  ok('Site Plan: at the drawing\'s point, with its battery and the feeding substation',
    Math.abs(h.body.lat - 33.306) < 1e-9 && h.body.unit && h.body.unit.kw > 0 && h.body.substation && h.body.substation.name === 'Ocotillo' && h.body.mode === 'storage', h.body);
  ok('Site Plan: the card names the utility and what it publishes, in the server\'s words', !!text && /Serving utility: Arizona Public Service · publishes no hosting capacity/.test(text) &&
    /R14-2-2616/.test(text) && /Needs a study/.test(text), text);
  var APS_E = HS.byKey('aps');
  ok('Site Plan: its own page and its service-area viewer are links, https, in a new tab', links.length === 2 && links[0].href === APS_E.check.url && links[1].href === 'https://www.aps.com/dg' &&
    links.every(function (l) { return l.target === '_blank' && /noopener/.test(l.rel); }), links);
  /* who serves the point, the list Prime draws: APS, what it publishes and
     its service-area viewer (its page is the Check it on link below) */
  var who = await sitePlanWho(p);
  ok('Site Plan: who serves the point, in Omega Prime\'s words and order, with its links', !!who && who.head === 'Who serves this point' && who.bold.join() === 'Arizona Public Service' &&
    who.text === primeSays(h.res) && sameLinks(who.links, h.res) && !who.fold, { card: who && who.text, prime: primeSays(h.res) });
  ok('Site Plan: no ComEd module and no ComEd word', noComEd && !/comed/i.test(text || ''), { noComEd: noComEd });
  var files = [await shot(p, 'site-plan-grid')];

  /* the same card at Mesa: the City of Mesa by its own map, with the city's
     service-area map; Salt River Project and APS folded with the reason */
  await p.evaluate(function (s) { window.OmegaEditorV2Grid.reload({ anchor: { lat: s.lat, lng: s.lng }, address: s.addr }, { bessKw: 2508, bessKwh: 5015 }); }, { lat: MESA.lat, lng: MESA.lng, addr: MESA.addr });
  var whoM = await p.waitForFunction(function () {
    var b = document.getElementById('grid-detail-body');
    return b && /Serving utility: City of Mesa/.test(b.textContent) && b.querySelector('details.who-fold') ? true : null;
  }, null, { timeout: 20000 }).then(function () { return sitePlanWho(p); }, function () { return null; });
  var hm = calls.hosting[calls.hosting.length - 1] || {}, MESA_E = HS.byKey('mesa');
  ok('Site Plan at Mesa: one more question to the door, at Mesa, with the Mesa substation', calls.hosting.length === mark + 2 && hm.body && Math.abs(hm.body.lat - MESA.lat) < 1e-9 &&
    hm.body.substation && hm.body.substation.name === 'Mesa Downtown', hm.body);
  ok('Site Plan at Mesa: the City of Mesa in bold, why, what it publishes and the city\'s service-area map', !!whoM && whoM.head === 'Who serves this point' && whoM.bold.join() === 'City of Mesa' &&
    /inside its own electric service area \(the city's map\)Publishes no hosting capacity\./.test(whoM.text) && whoM.links.length === 1 && whoM.links[0].href === MESA_E.check.url &&
    whoM.links[0].target === '_blank' && /noopener/.test(whoM.links[0].rel), whoM);
  ok('Site Plan at Mesa: Salt River Project and APS folded until opened, each with the reason', !!whoM && !!whoM.fold && !whoM.fold.open && whoM.fold.summary === 'Also on the territory maps, not this point (2)' &&
    /^Salt River Project \(the point is inside the City of Mesa's own electric service area/.test(whoM.fold.items[0]) && /^Arizona Public Service \(/.test(whoM.fold.items[1]), whoM && whoM.fold);
  ok('Site Plan at Mesa: in Omega Prime\'s words and order, with its links', !!whoM && whoM.text === primeSays(hm.res) && sameLinks(whoM.links, hm.res), { card: whoM && whoM.text, prime: primeSays(hm.res) });
  await p.click('#grid-detail details.who-fold summary');
  await p.evaluate(function () { var d = document.querySelector('#grid-detail details.who-fold'); if (d) d.scrollIntoView({ block: 'center' }); });
  var opened = await sitePlanWho(p);
  ok('Site Plan at Mesa: the fold opens in the card', !!opened && opened.fold && opened.fold.open, opened && opened.fold);
  files.push(await shot(p, 'site-plan-grid-mesa'));

  /* a 390 px phone, the city's map down: the longest list, every utility
     with its route and its pages, inside the card, nothing sideways */
  NET.cityMapDown = true;
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(function (s) { window.OmegaEditorV2Grid.reload({ anchor: { lat: s.lat, lng: s.lng }, address: s.addr }, { bessKw: 2508, bessKwh: 5015 }); }, { lat: MESA.lat, lng: MESA.lng, addr: MESA.addr });
  var whoD = await p.waitForFunction(function () {
    var b = document.getElementById('grid-detail-body');
    return b && /More than one utility is mapped at this point\./.test(b.textContent) ? true : null;
  }, null, { timeout: 20000 }).then(function () { return sitePlanWho(p); }, function () { return null; });
  var hd = calls.hosting[calls.hosting.length - 1] || {};
  NET.cityMapDown = false;
  ok('Site Plan, the city\'s map down: all three, the city first and marked, in Omega Prime\'s words and order', !!whoD && whoD.names.length === 3 &&
    whoD.names[0] === 'City of Mesa — the one read here' && whoD.bold.join() === 'City of Mesa,Salt River Project,Arizona Public Service' &&
    whoD.text === primeSays(hd.res) && sameLinks(whoD.links, hd.res) && whoD.links.length === 5, { card: whoD && whoD.text, prime: primeSays(hd.res) });
  ok('Site Plan on a 390 px phone: the card inside the screen, nothing sideways', !!whoD && whoD.box.l >= 0 && whoD.box.r <= whoD.box.w && whoD.box.sw <= whoD.box.cw + 1, whoD && whoD.box);
  await p.evaluate(function () { var h = document.querySelector('#grid-detail .who-head'); if (h) h.scrollIntoView({ block: 'start' }); });
  files.push(await shot(p, 'site-plan-grid-phone'));
  await ctx.close();
  return files;
}

async function shot(p, name) {
  /* the loading mark has faded, so the shot is of the page */
  var gone = await p.waitForFunction(function () { return !document.getElementById('omega-splash'); }, null, { timeout: 8000 }).then(function () { return true; }, function () { return false; });
  ok('the loading mark is gone before ' + name, gone);
  fs.mkdirSync(SHOTS, { recursive: true });
  var f = path.join(SHOTS, name + '.png');
  await p.screenshot({ path: f });
  return f;
}

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var errs = [], calls = { atlas: [], hosting: [], verdict: 0, other: [], external: [], comedModule: 0, comedProxy: 0 }, shots = [];
  try {
    var e = await editor(browser, base, { width: 1440, height: 900 }, calls, errs), p = e.page;

    /* ── ComEd: the door names ComEd and reads its map, server-side ── */
    await at(p, CHICAGO);
    await pressGridCheck(p);
    var t1 = await answered(p, /ComEd circuit F0297/);
    ok('Grid Check answers at a ComEd site', !!t1, { text: t1, errs: errs.slice(0, 4), other: calls.other.slice(0, 8) });
    var h1 = calls.hosting[0] || { body: {} };
    ok('one question, to the national door, with the point, the placed unit and the nearest substation',
      calls.hosting.length === 1 && Math.abs(h1.body.lat - CHICAGO.lat) < 1e-9 && h1.body.unit && h1.body.unit.kw === 2508 && h1.body.mode === 'storage' &&
      h1.body.substation && h1.body.substation.name === 'Crawford' && /^Bearer /.test(h1.auth), calls.hosting);
    ok('the substation is the Grid Atlas service\'s, asked once', calls.atlas.length === 1, calls.atlas.length);
    ok('nothing asks the ComEd-only module, its proxy or the old verdict door', calls.comedModule === 0 && calls.comedProxy === 0 && calls.verdict === 0,
      { module: calls.comedModule, proxy: calls.comedProxy, verdict: calls.verdict });
    ok('ComEd\'s service is never asked from the browser', !calls.external.some(function (u) { return u.indexOf('utility.arcgis.com') >= 0; }), calls.external.filter(function (u) { return /arcgis/.test(u); }));
    var v1 = await p.evaluate(function () {
      var el = document.getElementById('omega-grid-panel'), g = S.grid || {};
      var util = el.querySelector('a[data-gp="verify"]');
      return { text: el.textContent, verify: util ? { href: util.getAttribute('href'), text: util.textContent, target: util.target } : null,
        grid: JSON.parse(JSON.stringify({ circuit: g.circuit, verdict: g.verdict, substation: g.substation, substations: (g.substations || []).length })) };
    });
    ok('ComEd is named as the serving utility, with what it publishes', /Serving utility\s*ComEd\s*hosting capacity/.test(v1.text), v1.text.slice(0, 400));
    ok('the net is read first: 10,725 kW, room left after the queue', /10,725 kW\s*room left after the queue \(net\)/.test(v1.text) && v1.text.indexOf('10,725 kW') < v1.text.indexOf('15,620 kW'), v1.text.slice(0, 600));
    ok('the queue is subtracted here, as ComEd publishes its figure gross', /− 4,895 kW/.test(v1.text) && /subtracted here; the utility does not/.test(v1.text) && /the utility’s headline, gross of the queue/.test(v1.text));
    ok('the ComEd sentence, byte for byte', v1.text.indexOf(COMED_SAY) >= 0 && v1.grid.verdict && v1.grid.verdict.say === COMED_SAY, v1.grid.verdict);
    ok('two circuits answer; the nearest with a published figure is judged', /2 circuits answer at this point; the nearest with a published figure is judged\./.test(v1.text));
    ok('where the power comes from', /Where the power comes from/.test(v1.text) && /Crawford TSS 21/.test(v1.text));
    ok('ComEd\'s own map, to check it', !!v1.verify && v1.verify.href === CS.REFERER && /Check it on ComEd's hosting capacity map/.test(v1.verify.text) && v1.verify.target === '_blank', v1.verify);
    ok('the answer is on S.grid in the record Prime writes', v1.grid.circuit && v1.grid.circuit.utility === 'ComEd' && v1.grid.circuit.utilityKey === 'comed' && v1.grid.circuit.netKw === 10725 &&
      v1.grid.circuit.coverage === 'read' && v1.grid.verdict.key === 'fits' && v1.grid.substation && v1.grid.substation.name === 'Crawford' && v1.grid.substations === 1, v1.grid);
    var box1 = await p.evaluate(function () { var r = document.getElementById('omega-grid-panel').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, w: innerWidth }; });
    ok('the panel is inside the screen', box1.l >= 0 && box1.r <= box1.w, box1);
    await p.evaluate(function () { var d = document.querySelector('#omega-grid-panel details'); if (d) d.open = true; });
    shots.push(await shot(p, 'grid-panel-comed'));

    /* ── Mesa, Arizona: the real utility, never one utility's words ── */
    await at(p, MESA);
    await p.click('#omega-grid-panel [data-gp="rerun"]');
    var t2 = await answered(p, /City of Mesa/);
    ok('Check again at Mesa answers', !!t2, { errs: errs.slice(0, 4) });
    var h2 = calls.hosting[calls.hosting.length - 1] || { body: {} };
    ok('Mesa: one more question to the door, at the new point, with the Mesa substation',
      calls.hosting.length === 2 && Math.abs(h2.body.lat - MESA.lat) < 1e-9 && h2.body.substation && h2.body.substation.name === 'Mesa Downtown', h2.body);
    var v2 = await p.evaluate(function () {
      var el = document.getElementById('omega-grid-panel'), g = S.grid || {}, a = el.querySelector('a[data-gp="verify"]');
      return { text: el.textContent, html: el.innerHTML, items: [].map.call(el.querySelectorAll('li'), function (li) { return li.textContent; }),
        verify: a ? a.getAttribute('href') : null, grid: JSON.parse(JSON.stringify({ circuit: g.circuit, verdict: g.verdict, lat: g.lat })) };
    });
    ok('Mesa: the City of Mesa is the serving utility, and it publishes no hosting capacity', /Serving utility\s*City of Mesa\s*publishes no hosting capacity/.test(v2.text), v2.text.slice(0, 500));
    ok('Mesa: the city\'s own service-area map settles it: one utility, no SRP caution', !/More than one utility is mapped/.test(v2.text) && !/islands/.test(v2.text), v2.items);
    ok('Mesa: in the server\'s words', /City of Mesa publishes no hosting capacity/.test(v2.text), v2.text.slice(0, 600));
    ok('Mesa: nothing judged as if it were published', /Needs a study/.test(v2.text) && v2.grid.circuit === null && v2.grid.verdict && v2.grid.verdict.key === 'study' && Math.abs(v2.grid.lat - MESA.lat) < 1e-9, v2.grid);
    ok('Mesa: no ComEd word; the link is the city\'s own page, no map invented', !/comed|feeder_q/i.test(v2.text) && v2.verify === HS.byKey('mesa').viewerUrl, { verify: v2.verify, comed: (v2.text.match(/.{0,50}comed.{0,50}/i) || [])[0] });
    ok('Mesa: the substation is the Mesa measurement', /Mesa Downtown/.test(v2.text));
    /* who serves the point (2026-10-20): the City of Mesa by its own map,
       with the city's service-area map to check; Salt River Project and APS
       on the national map but not this point, folded away with the reason */
    var who2 = await whoIn(p), ans2 = h2.res, MESA_E = HS.byKey('mesa');
    ok('Mesa: who serves the point: the City of Mesa, why, and what it publishes', !!who2 && who2.head === 'Who serves this point' && who2.items.length === 1 &&
      /^City of Mesainside its own electric service area \(the city's map\)Publishes no hosting capacity\./.test(who2.items[0]), who2);
    ok('Mesa: the city\'s own service-area map, https, in a new tab; the city\'s page once, as the Check it on link', !!who2 && who2.links.length === 1 &&
      who2.links[0].href === MESA_E.check.url && who2.links[0].target === '_blank' && /noopener/.test(who2.links[0].rel) && v2.verify === MESA_E.viewerUrl, who2 && who2.links);
    ok('Mesa: Salt River Project and APS folded away until opened, each with the reason', !!who2 && !who2.open && who2.summary === 'Also on the territory maps, not this point (2)' &&
      /^Salt River Project \(the point is inside the City of Mesa's own electric service area/.test(who2.folded[0]) && /^Arizona Public Service \(/.test(who2.folded[1]), who2);
    ok('Mesa: the list in Omega Prime\'s words and order, with its links', !!who2 && who2.text === primeSays(ans2) && sameLinks(who2.links, ans2), { panel: who2 && who2.text, prime: primeSays(ans2) });
    await p.click('#omega-grid-panel [data-gp="who-fold"] summary');
    var open2 = await whoIn(p), fit2 = await fits(p);
    ok('Mesa: the fold opens inside the panel', !!open2 && open2.open && fit2.ok, fit2);
    await showWho(p);
    shots.push(await shot(p, 'grid-panel-mesa'));

    /* ── Mesa with the city's own map down: every utility on the national
       map, each with what it publishes, its route and its pages ── */
    NET.cityMapDown = true;
    await p.click('#omega-grid-panel [data-gp="rerun"]');
    var t2d = await answered(p, /More than one utility is mapped/);
    var who3 = await whoIn(p), ans3 = (calls.hosting[calls.hosting.length - 1] || {}).res;
    NET.cityMapDown = false;
    ok('Mesa, the city\'s map down: Check again answers; more than one utility is mapped', !!t2d && !!who3 && who3.head === 'More than one utility is mapped at this point.', who3);
    ok('Mesa, the city\'s map down: all three, the city first and marked, each with what it publishes', !!who3 && who3.items.length === 3 &&
      /^City of Mesa — the one read here/.test(who3.items[0]) && /^Salt River Project/.test(who3.items[1]) && /^Arizona Public Service/.test(who3.items[2]) &&
      who3.items.every(function (t) { return /Publishes no hosting capacity\./.test(t); }), who3 && who3.items);
    ok('Mesa, the city\'s map down: the routes Salt River Project and APS offer instead; the city\'s is in the note', !!who3 && !/Instead:/.test(who3.items[0]) &&
      /Instead: SRP's own review \(Screen A/.test(who3.items[1]) && /Instead: a Pre-Application Report under A\.A\.C\. R14-2-2616/.test(who3.items[2]), who3 && who3.items);
    ok('Mesa, the city\'s map down: each utility\'s own pages, https, in a new tab', !!who3 && who3.links.length === 5 &&
      who3.links.every(function (l) { return /^https:\/\//.test(l.href) && l.target === '_blank' && /noopener/.test(l.rel); }), who3 && who3.links);
    ok('Mesa, the city\'s map down: the bill decides, nothing folded', !!who3 && /Confirm the utility with the customer’s bill\.$/.test(who3.text) && !who3.summary, who3 && who3.text.slice(-90));
    ok('Mesa, the city\'s map down: in Omega Prime\'s words and order, with its links', !!who3 && who3.text === primeSays(ans3) && sameLinks(who3.links, ans3), { panel: who3 && who3.text, prime: primeSays(ans3) });
    await showWho(p);
    shots.push(await shot(p, 'grid-panel-mesa-map-down'));
    await e.ctx.close();

    /* ── a 390 px phone: the panel fits the screen ── */
    var e2 = await editor(browser, base, { width: 390, height: 844 }, calls, errs), q = e2.page;
    await at(q, MESA);
    await q.evaluate(function () { OmegaGridPanel.open(); });
    var t3 = await answered(q, /City of Mesa/);
    var box = await q.evaluate(function () {
      var el = document.getElementById('omega-grid-panel'), r = el.getBoundingClientRect();
      return { l: r.left, r: r.right, w: innerWidth, sw: el.scrollWidth, cw: el.clientWidth };
    });
    ok('phone: the panel answers and sits inside the screen, nothing sideways', !!t3 && box.l >= 0 && box.r <= box.w && box.sw <= box.cw + 1, box);
    shots.push(await shot(q, 'grid-panel-phone'));
    /* the list on the phone: Prime's words, the fold opened inside the panel */
    var whoP = await whoIn(q), ansP = (calls.hosting[calls.hosting.length - 1] || {}).res;
    ok('phone: who serves the point, in Omega Prime\'s words and order', !!whoP && whoP.head === 'Who serves this point' && whoP.text === primeSays(ansP) && sameLinks(whoP.links, ansP), whoP && whoP.text);
    await q.click('#omega-grid-panel [data-gp="who-fold"] summary');
    var fitP = await fits(q);
    ok('phone: the list and its opened fold fit the panel, every link inside it, nothing sideways', fitP.ok && fitP.links === 1, fitP);
    await showWho(q);
    shots.push(await shot(q, 'grid-panel-phone-who'));
    /* the longest list, the city's map down, on the phone */
    NET.cityMapDown = true;
    await q.click('#omega-grid-panel [data-gp="rerun"]');
    var t3d = await answered(q, /More than one utility is mapped/);
    var whoPD = await whoIn(q), ansPD = (calls.hosting[calls.hosting.length - 1] || {}).res, fitPD = await fits(q);
    NET.cityMapDown = false;
    ok('phone, the city\'s map down: all three in Omega Prime\'s words, every link inside the panel, nothing sideways', !!t3d && !!whoPD && whoPD.items.length === 3 &&
      whoPD.text === primeSays(ansPD) && sameLinks(whoPD.links, ansPD) && fitPD.ok && fitPD.links === 5, { fit: fitPD, items: whoPD && whoPD.items });
    await showWho(q);
    shots.push(await shot(q, 'grid-panel-phone-map-down'));
    await e2.ctx.close();

    /* ── Site Plan: the same door, on the Site Plan session ── */
    shots = shots.concat(await sitePlan(browser, base, calls, errs));
    ok('nothing in either editor loaded the ComEd-only module', calls.comedModule === 0, calls.comedModule);

    ok('no page error', errs.length === 0, errs.slice(0, 6));
  } catch (err) {
    fails++; console.log('FAIL ' + (err && err.stack || err));
  } finally {
    await browser.close(); srv.close();
  }
  console.log('\nScreenshots: ' + shots.join(', '));
  console.log('render-grid-panel: ' + (checks - fails) + '/' + checks + ' checks passed');
  process.exit(fails ? 1 : 0);
})();
