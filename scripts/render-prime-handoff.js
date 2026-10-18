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
 * Push to Logic and the Logic step open the project's org, or the
 * signed-in workspace. A staff user lands in their own org. The all-OEM
 * directory stays the bare /omega-logic link inside that office.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var FD = require('./_lib/firebase-double');
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
  if (p === '/omega-logic') p = '/omega-logic.html';
  var file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

function texts(page) {
  return page.$eval('#unitSel', function (s) { return [].map.call(s.options, function (o) { return o.textContent; }); });
}

/* A logic-office payload small enough for the desktop to draw. owner is
   the ClearSky chrome (the all-OEM link). It does not grant anything the
   page's own request would not already show. */
function officeDoc(org, owner, name) {
  return {
    org: org, name: name, owner: !!owner, active: true, products: true, orders: [],
    links: {
      mission: '/mission?view=logic&org=' + encodeURIComponent(org),
      storefront: null, customer: '/portals/customer/?org=' + encodeURIComponent(org),
      factory: '/plant/?org=' + encodeURIComponent(org), preview: '/editor-lite.html?org=' + encodeURIComponent(org),
      setup: '/whitelabel-setup.html?org=' + encodeURIComponent(org), start: '/customer-start.html?org=' + encodeURIComponent(org)
    },
    brand: { name: name, workspace: name, primary: '#0B1F33', accent: '#4ED4D0', ink: '#102033' },
    config: { terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 }, accounting: 'tenant', enabled: true },
    receivables: {}, access: { parts: [], team: false }
  };
}

/* Signed in, with no project org on the address: Prime's Logic step uses
   the person's own workspace. Staff are not sent to the directory and not
   to an OEM that happens to be first in the list. The directory is still
   the bare /omega-logic link in the ClearSky nav. */
async function logicHome(browser, base, user, expectOrg, name, staff) {
  var ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  var pageErrs = [];
  try {
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\//.test(url)) return r.continue();
      return r.abort();
    });
    await ctx.route(base + '/omega-tenant.js', function (r) { return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }); });
    await ctx.route(base + '/omega-brand.js', function (r) { return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }); });
    await ctx.route(base + '/api/**', function (r) {
      var u = new URL(r.request().url());
      function json(o) { return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) }); }
      if (u.pathname === '/api/logic-office') {
        var org = u.searchParams.get('org') || '';
        if (!org) return json({ owner: true, tenants: [{ orgId: 'cleancell.us', name: 'Clean Cell', status: 'active', links: { office: '/omega-logic?org=cleancell.us' } }] });
        var label = org === 'clearsky-usa.com' ? 'ClearSky Energy' : (org === 'concord.example' ? 'Concord Energy' : org);
        return json(officeDoc(org, staff, label));
      }
      if (u.pathname === '/api/logic-workspaces') {
        if (staff) return json({ email: user.email, owner: true, workspaces: [
          { orgId: 'cleancell.us', name: 'Clean Cell', role: 'clearsky', status: 'active' },
          { orgId: 'clearsky-usa.com', name: 'ClearSky Energy', role: 'clearsky', status: 'active' }
        ] });
        return json({ email: user.email, owner: false, workspaces: [{ orgId: 'concord.example', name: 'Concord Energy', role: 'admin', status: 'active' }] });
      }
      if (u.pathname === '/api/crm') return json({ followUps: [] });
      if (u.pathname === '/api/buyers') return json({ customers: [] });
      return json({});
    });
    await ctx.addInitScript(FD.source());
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: user, docs: {}, latency: 5, authDomain: '127.0.0.1' });
    var p = await ctx.newPage();
    p.on('pageerror', function (e) { pageErrs.push(e.message); });
    await p.goto(base + '/omega-prime.html?step=logic', { waitUntil: 'domcontentloaded', timeout: 60000 });
    var hrefs = await p.waitForFunction(function (org) {
      var a = document.querySelector('#s-logic a[href^="/omega-logic"]');
      var c = document.querySelector('#s-logic a[href^="/logic-custody"]');
      if (!a || !c) return null;
      var ah = a.getAttribute('href'), ch = c.getAttribute('href');
      return ah === '/omega-logic?org=' + org && ch === '/logic-custody.html?org=' + org ? { logic: ah, custody: ch } : null;
    }, expectOrg, { timeout: 10000 }).then(function (h) { return h.jsonValue(); }, function () { return null; });
    ok((staff ? 'staff' : 'tenant') + ' Logic step uses their own org, not the directory or Clean Cell',
      !!hrefs && hrefs.logic.indexOf('cleancell') < 0, hrefs || pageErrs.slice(0, 3));

    await p.goto(base + '/omega-prime.html?step=logic&org=nextnrg.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(function () { return window.__firebaseDouble && window.__firebaseDouble.auth && window.__firebaseDouble.auth.currentUser; }, null, { timeout: 8000 });
    await p.waitForTimeout(400);
    var kept = await p.evaluate(function () {
      var a = document.querySelector('#s-logic a[href^="/omega-logic"]');
      var c = document.querySelector('#s-logic a[href^="/logic-custody"]');
      return { logic: a && a.getAttribute('href'), custody: c && c.getAttribute('href') };
    });
    ok((staff ? 'staff' : 'tenant') + ' project org stays on the Logic link',
      kept.logic === '/omega-logic?org=nextnrg.com' && kept.custody === '/logic-custody.html?org=nextnrg.com', kept);

    await p.goto(base + '/omega-logic?org=' + encodeURIComponent(expectOrg), { waitUntil: 'domcontentloaded', timeout: 60000 });
    var h1 = await p.waitForFunction(function (n) {
      var h = document.querySelector('#content h1');
      return h && h.textContent === n ? h.textContent : null;
    }, name, { timeout: 10000 }).then(function (h) { return h.jsonValue(); }, function () { return null; });
    var snap = await p.evaluate(function () {
      var eye = document.querySelector('#content .eyebrow');
      var sub = document.querySelector('.logic-sub');
      var admin = document.querySelector('a[href="/omega-logic"]');
      return {
        eye: eye ? eye.textContent : '',
        sub: sub ? sub.textContent : '',
        admin: admin ? admin.getAttribute('href') : '',
        body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 800)
      };
    });
    ok((staff ? 'staff' : 'tenant') + ' opens their own Omega Logic workspace',
      h1 === name && snap.body.indexOf('Every white-label customer') < 0 && snap.body.indexOf('Clean Cell') < 0 && snap.sub.indexOf('Clean Cell') < 0 && snap.eye.toLowerCase().indexOf(expectOrg) >= 0, { h1: h1, snap: snap, errs: pageErrs.slice(0, 4) });
    var shotDir = '/opt/cursor/artifacts/screenshots';
    try { fs.mkdirSync(shotDir, { recursive: true }); } catch (eShot) {}
    await p.screenshot({ path: path.join(shotDir, staff ? 'logic-staff-own-org.png' : 'logic-tenant-own-org.png') });
    if (staff) {
      ok('staff still have the ClearSky link to every OEM account', snap.admin === '/omega-logic' && /All OEM customers/.test(snap.eye), snap);
      await p.click('a[href="/omega-logic"]');
      /* The click replaces the document. The first poll can land while body
         is still null; a throw there ends the wait, so a missing body is
         "not yet". */
      var dir = await p.waitForFunction(function () {
        var body = document.body;
        if (!body) return null;
        return /Every white-label customer/.test(body.innerText) ? body.innerText.replace(/\s+/g, ' ').slice(0, 500) : null;
      }, null, { timeout: 10000 }).then(function (h) { return h.jsonValue(); }, function () { return '' });
      ok('that link opens the directory and does not enter Clean Cell',
        /Every white-label customer/.test(dir) && !/[?&]org=/.test(p.url()) && /Clean Cell/.test(dir), { url: p.url(), dir: dir, errs: pageErrs.slice(0, 4) });
    } else {
      ok('a tenant office has no all-OEM link', snap.admin === '' && snap.eye.indexOf('All OEM customers') < 0 && /office workspace/.test(snap.sub), snap);
    }
  } finally {
    await ctx.close();
  }
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
      window._projectOrgId = 'nextnrg.com';
      window._homeOrgClaim = 'clearsky-usa.com';
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
    ok('the handoff carries lat, lng, the project id, the compute type and the project org',
      /[?&]lat=41\.81522(?:&|$)/.test(landed) && /[?&]lng=-87\.62261(?:&|$)/.test(landed) && /[?&]project=proj-handoff(?:&|$)/.test(landed) && /[?&]type=compute(?:&|$)/.test(landed) && /[?&]org=nextnrg\.com(?:&|$)/.test(landed) && !/[?&]org=clearsky-usa\.com(?:&|$)/.test(landed), landed);
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
    var logicCards = await logic.evaluate(function () {
      var a = document.querySelector('#s-logic a[href^="/omega-logic"]');
      var c = document.querySelector('#s-logic a[href^="/logic-custody"]');
      return { logic: a && a.getAttribute('href'), custody: c && c.getAttribute('href') };
    });
    ok('Push to Logic carries the same address and the project org', logicAddr === ADDR && /[?&]step=logic(?:&|$)/.test(logic.url()) && /[?&]org=nextnrg\.com(?:&|$)/.test(logic.url()), logic.url());
    ok('the Logic step opens that org, not the staff directory or a default OEM',
      logicCards.logic === '/omega-logic?org=nextnrg.com' && logicCards.custody === '/logic-custody.html?org=nextnrg.com', logicCards);
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

    await logicHome(browser, base, { uid: 'tom', email: 'tom@clearsky-usa.com', displayName: 'Thomas', emailVerified: true, claims: { orgId: 'clearsky-usa.com', email_verified: true } }, 'clearsky-usa.com', 'ClearSky Energy', true);
    await logicHome(browser, base, { uid: 'ops', email: 'ops@concord.example', displayName: 'Concord Ops', emailVerified: true, claims: {} }, 'concord.example', 'Concord Energy', false);
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
