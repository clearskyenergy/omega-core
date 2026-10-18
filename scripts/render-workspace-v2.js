#!/usr/bin/env node
/* The journey home, rendered against the same Firebase double as the live home.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/render-workspace-v2.js
   node scripts/render-workspace-v2.js --shots DIR
   The live workspace.html is rendered once on the same data, as the before. */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-workspace-v2: Playwright not found; skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-workspace-v2: Chromium not found; skipped'); process.exit(0); }
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || os.tmpdir()) : null; })();
if (shotsAt && !fs.existsSync(shotsAt)) fs.mkdirSync(shotsAt, { recursive: true });

var FD = require('./_lib/firebase-double'), FX = require('./_lib/dashboard-fixtures');
var DOUBLE_SRC = FD.source();
var HOST = '127.0.0.1', DAY = 86400000;
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf' };
function ago(days) { return new Date(Date.now() - days * DAY).toISOString(); }
function noisy(host) {
  var fx = FX.northstar(host), org = fx.org, uid = fx.user.uid, docs = fx.docs;
  var bill = docs['omega_orgs/' + org + '/billing/current'];
  bill.tier = 'trial'; bill.trialEndsAt = new Date(Date.now() + 3 * DAY).toISOString();
  delete docs['fin_projects/fin-maple'];
  delete docs['team_todos/t1'];
  delete docs['rfqs/rfq-riverside'];
  delete docs['rfqs/rfq-riverside/recipients/voltacell.example'];
  delete docs['rfqs/rfq-riverside/recipients/cellworks.example'];
  Object.keys(docs).forEach(function (k) {
    if (k.indexOf('projects/') !== 0 || !docs[k] || docs[k].stage === 'online') return;
    docs[k].stage = 'candidate';
    delete docs[k].nextAction;
    if (!docs[k].bessKwh) docs[k].bessKwh = 1000;
  });
  ['a', 'b'].forEach(function (s) {
    docs['fin_projects/fin-burns-' + s] = { name: 'S.J Burns LLC (330 roberts)', status: 'review', developerUid: uid, updatedAt: ago(33), createdAt: ago(40) };
    docs['fin_projects/fin-cesar-' + s] = { name: '225 Cesar Chavez Blvd,_TG', status: 'review', developerUid: uid, updatedAt: ago(33), createdAt: ago(40) };
  });
  for (var i = 0; i < 8; i++) {
    docs['projects/p-mich-' + i] = { orgId: org, orgsInvolved: [org], name: '4846 S. Michigan Ave, Chicago', address: '4846 S. Michigan Ave, Chicago, IL', stage: 'candidate', type: 'bess', createdAt: ago(12 + i), updatedAt: ago(12 + i) };
  }
  return fx;
}
function welcome(host) {
  var fx = FX.newco(host);
  fx.docs['termsAcceptances/' + fx.user.uid] = { uid: fx.user.uid, email: fx.user.email, orgId: fx.org, version: FX.TERMS_VERSION, acceptedAt: ago(0) };
  fx.termsAccepted = true;
  return fx;
}

var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0];
  if (u.indexOf('/api/') === 0) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (u === '/api/package-access') return res.end(JSON.stringify({ packaged: false }));
    if (u === '/api/events') return res.end(JSON.stringify({ accepted: 0 }));
    if (u === '/api/offerings') return res.end(JSON.stringify({ modules: [] }));
    if (u.indexOf('/api/workspace-team') === 0) return res.end(JSON.stringify({ people: [], canManage: false }));
    if (u.indexOf('/api/pulse') === 0) return res.end(JSON.stringify({ windows: [] }));
    if (u.indexOf('/api/site-crm') === 0) return res.end(JSON.stringify({ failed: true }));
    return res.end(JSON.stringify({ ok: true }));
  }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
var fails = 0;
function ok(name, cond, detail) { if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 500) : '')); } }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });

  async function open(name, pagePath, fx, phone, prime) {
    var errs = [], ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, hasTouch: !!phone, isMobile: !!phone });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* firebase double */' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return r.abort();
    });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: fx.user, docs: fx.docs, latency: 8, authDomain: HOST });
    if (prime) await prime(ctx);
    var p = await ctx.newPage();
    p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.stack || e.message); });
    p.on('console', function (m) { var t = m.text(); if (m.type() === 'error' && !/^Failed to load resource|duplicate-app/.test(t)) errs.push(t.slice(0, 240)); });
    var target = pagePath + (pagePath.indexOf('?') >= 0 ? '&' : '?') + 'home=workspace';
    await p.goto(base + target, { waitUntil: 'domcontentloaded' });
    var ready = await p.waitForFunction(function () { return document.body.classList.contains('ready') || !!document.getElementById('ot-modal'); }, null, { timeout: 8000 }).then(function () { return true; }, function () { return false; });
    ok(name + ': the page answered', ready);
    await p.waitForFunction(function () { var t = document.body.innerText || ''; return /Needs you|Where to|Find the customer|being set up|approv/i.test(t); }, null, { timeout: 8000 }).catch(function () {});
    await wait(400);
    return { p: p, ctx: ctx, errs: errs };
  }
  function shot(p, file) { return shotsAt ? p.screenshot({ path: path.join(shotsAt, file), fullPage: true }) : Promise.resolve(); }
  async function linksOk(p) {
    return p.evaluate(function () {
      var bad = [];
      Array.prototype.forEach.call(document.querySelectorAll('#content a[href], #side-nav a[href], .ows-tabs a[href]'), function (a) {
        if (a.offsetParent === null && a.closest('#side-nav') && getComputedStyle(a).display === 'none') return;
        var href = a.getAttribute('href') || '';
        if (!href || href.charAt(0) === '#' || /^https?:/.test(href)) return;
        bad.push(href);
      });
      return bad;
    });
  }
  function missing(hrefs) {
    var out = [];
    hrefs.forEach(function (h) {
      var pathOnly = h.split('?')[0].split('#')[0];
      if (pathOnly === '/workspace' || pathOnly === '/workspace-v2' || pathOnly === '/finance' || pathOnly === '/osa' || pathOnly === '/logic') return;
      var rel = pathOnly.replace(/^\//, '');
      var file = path.join(ROOT, rel);
      if (fs.existsSync(file) || fs.existsSync(file + '.html') || fs.existsSync(path.join(file, 'index.html'))) return;
      out.push(h);
    });
    return out;
  }

  var live = await open('before', '/workspace', noisy(HOST), false);
  var before = await live.p.evaluate(function () {
    var t = document.body.innerText || '';
    return { path: location.pathname, hex: !!document.querySelector('.hexhub'), where: t.indexOf('Where to?') >= 0, burns: (t.match(/S\.J Burns LLC \(330 roberts\) has been in review/g) || []).length, addr: (t.match(/4846 S\. Michigan Ave, Chicago/g) || []).length };
  });
  ok('before: the live home still has the hex launcher', before.hex && before.where && before.path.indexOf('workspace-v2') < 0, before);
  ok('before: the same review is listed more than once', before.burns >= 2, before);
  await shot(live.p, 'workspace-v1-before.png');
  ok('before: no uncaught errors', !live.errs.length, live.errs);
  await live.ctx.close();

  var desk = await open('after', '/workspace-v2', noisy(HOST), false);
  var after = await desk.p.evaluate(function () {
    var needs = (document.getElementById('needs') || {}).innerText || '';
    var account = (document.getElementById('account') || {}).innerText || '';
    var track = (document.getElementById('track') || {}).innerText || '';
    var steps = Array.prototype.map.call(document.querySelectorAll('#journey .step'), function (s) { return s.getAttribute('data-step'); });
    var sections = [];
    Array.prototype.forEach.call(document.querySelectorAll('#side-nav .sn-section-label'), function (s) { if (getComputedStyle(s).display !== 'none') sections.push(s.textContent); });
    return {
      hex: !!document.querySelector('#hub .hexhub'), where: (document.body.innerText || '').indexOf('Where to?') >= 0,
      cells: Array.prototype.map.call(document.querySelectorAll('#hub [data-hub]'), function (g) { return g.getAttribute('data-hub'); }),
      next: !!document.getElementById('next'),
      steps: steps, now: (document.querySelector('#journey [aria-current="step"]') || {}).getAttribute ? document.querySelector('#journey [aria-current="step"]').getAttribute('data-step') : '',
      burns: (needs.match(/Burns/g) || []).length, addrNeeds: (needs.match(/4846/g) || []).length, addrTrack: (track.match(/4846/g) || []).length,
      account: account, trialInNeeds: /trial/i.test(needs), sections: sections, greet: (document.getElementById('greet') || {}).textContent || '',
      saved: /Saved \d+ times/.test(track), queue: /need a battery size/.test(needs)
    };
  });
  ok('after: the hex sits with the journey and the Next card', after.hex && after.where && after.next && after.cells.join(',') === 'design,customers,projects,prime,quotes,market,orders', after);
  ok('after: eight steps and Design is current for the unsized queue', after.steps.join(',') === 'arrive,customer,project,design,analyze,propose,order,track' && after.now === 'design', after);
  await shot(desk.p, 'workspace-v2-home.png');
  ok('after: each review title once, and the address dump is gone from Needs you', after.burns === 1 && after.addrNeeds === 0 && after.queue, after);
  ok('after: the repeated address is one card', after.addrTrack === 1 && after.saved, after);
  ok('after: the trial sits in the account band, not in the work list', /trial/i.test(after.account) && !after.trialInNeeds, after);
  ok('after: the rail is Work, Library, Desk, Account', after.sections.join('|') === 'Work|Library|Desk|Account', after.sections);
  ok('after: a direct v2 address stays while the default is classic', desk.p.url().indexOf('/workspace-v2') >= 0, desk.p.url());
  var switched = await desk.p.evaluate(function () {
    var href = '';
    Array.prototype.forEach.call(document.querySelectorAll('#side-nav a'), function (a) {
      if ((a.textContent || '').indexOf('Switch to classic') >= 0) href = a.getAttribute('href') || '';
    });
    return href;
  });
  ok('after: Switch to classic is in the rail', /\/workspace\?/.test(switched) && /ui=classic/.test(switched), switched);
  var hrefs = await linksOk(desk.p);
  ok('after: visible links point at pages the site serves', !missing(hrefs).length, missing(hrefs));
  await desk.p.click('#new-project');
  await wait(300);
  var modal = await desk.p.evaluate(function () { var m = document.getElementById('new-proj-modal'); return !!(m && m.classList.contains('on')); });
  ok('after: New project opens the existing dialog over the page', modal);
  await desk.p.keyboard.press('Escape');
  await wait(200);
  var widths = [1366, 390];
  for (var wi = 0; wi < widths.length; wi++) {
    await desk.p.setViewportSize({ width: widths[wi], height: 844 }); await wait(200);
    var hs = await desk.p.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
    ok('after: no horizontal scroll at ' + widths[wi], !hs);
  }
  await desk.p.setViewportSize({ width: 1366, height: 900 });
  await desk.p.goto(base + '/workspace?home=workspace#billing', { waitUntil: 'domcontentloaded' });
  await desk.p.waitForSelector('#billing-body .bh-state');
  await desk.p.click('[data-key="home"]');
  await wait(400);
  var backHome = await desk.p.evaluate(function () {
    return { path: location.pathname, hash: location.hash, hex: !!document.querySelector('.hexhub'), where: (document.body.innerText || '').indexOf('Where to?') >= 0 };
  });
  ok('billing Home stays on the classic hex hub', backHome.hex && backHome.where && backHome.path.indexOf('workspace-v2') < 0 && backHome.hash !== '#billing', backHome);
  await shot(desk.p, 'workspace-v2-after.png');
  ok('after: no uncaught errors', !desk.errs.length, desk.errs);
  await desk.ctx.close();

  var phone = await open('phone', '/workspace-v2', noisy(HOST), true);
  await phone.p.waitForFunction(function () { return document.querySelectorAll('#journey .step').length === 8; }, null, { timeout: 8000 }).catch(function () {});
  var ph = await phone.p.evaluate(function () {
    var tabs = document.querySelector('.ows-tabs'), journey = document.getElementById('journey');
    var jr = journey ? journey.getBoundingClientRect() : { right: 0 };
    return { tabs: !!(tabs && getComputedStyle(tabs).display !== 'none'), steps: document.querySelectorAll('#journey .step').length, journeyRight: Math.round(jr.right), wide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  });
  ok('phone: the journey fits and the tab bar is there', ph.steps === 8 && ph.tabs && !ph.wide && ph.journeyRight <= 390, ph);
  var phHex = await phone.p.evaluate(function () {
    var hub = document.getElementById('hub'), svg = hub ? hub.querySelector('svg') : null;
    var r = svg ? svg.getBoundingClientRect() : { width: 0, right: 0, bottom: 0 };
    var hb = hub ? hub.getBoundingClientRect() : { bottom: 0 };
    var orders = hub ? hub.querySelector('[data-hub="orders"]') : null;
    var ob = orders ? orders.getBoundingClientRect() : { bottom: 0, right: 0 };
    return { cells: hub ? hub.querySelectorAll('[data-hub]').length : 0, width: Math.round(r.width), right: Math.round(r.right), where: !!hub && /Where to\?/.test(hub.textContent || ''), ordersBottom: Math.round(ob.bottom), hubBottom: Math.round(hb.bottom), ordersRight: Math.round(ob.right) };
  });
  ok('phone: the hex is on the page and inside the screen', phHex.cells === 7 && phHex.where && phHex.width > 200 && phHex.right <= 390 && phHex.ordersRight <= 390 && phHex.ordersBottom <= phHex.hubBottom + 1, phHex);
  await shot(phone.p, 'workspace-v2-phone.png');
  await phone.p.click('#hub [data-hub="market"]');
  var market = await phone.p.waitForFunction(function () { return location.pathname.indexOf('marketplace') >= 0 ? location.pathname : null; }, null, { timeout: 8000 }).then(function (h) { return h.jsonValue(); }, function () { return phone.p.url(); });
  ok('phone: the Marketplace cell opens the catalogue', String(market).indexOf('marketplace') >= 0, market);
  ok('phone: no uncaught errors', !phone.errs.length, phone.errs);
  await phone.ctx.close();

  var hello = await open('welcome', '/workspace-v2', welcome(HOST), false);
  var wel = await hello.p.evaluate(function () {
    var now = document.querySelector('#journey [aria-current="step"]');
    var eye = document.querySelector('#next .eyebrow');
    return { now: now ? now.getAttribute('data-step') : '', next: (document.getElementById('next-h') || {}).textContent || '', start: !!(eye && /start here/i.test(eye.textContent || '')) };
  });
  ok('welcome: a new workspace starts at the customer', wel.now === 'customer' && wel.start && /customer/i.test(wel.next), wel);
  await shot(hello.p, 'workspace-v2-welcome.png');
  ok('welcome: no uncaught errors', !hello.errs.length, hello.errs);
  await hello.ctx.close();

  var pend = await open('pending', '/workspace-v2', FX.pending(HOST), false);
  var pe = await pend.p.evaluate(function () {
    var now = document.querySelector('#journey [aria-current="step"]');
    return { now: now ? now.getAttribute('data-step') : '', text: (document.getElementById('next') || {}).innerText || '' };
  });
  ok('pending: Arrive is the step and the copy says the workspace is being set up', pe.now === 'arrive' && /approv|set up/i.test(pe.text), pe);
  await shot(pend.p, 'workspace-v2-pending.png');
  ok('pending: no uncaught errors', !pend.errs.length, pend.errs);
  await pend.ctx.close();

  function flagged(orgExp, userExp) {
    var fx = FX.northstar(HOST);
    if (orgExp) fx.docs['omega_orgs/' + fx.org].experience = orgExp;
    if (userExp) fx.docs['omega_orgs/' + fx.org + '/members/' + fx.user.uid].experience = userExp;
    return fx;
  }
  var asked = await open('switch query v2', '/workspace?ui=v2', FX.northstar(HOST), false);
  var askedTo = await asked.p.waitForFunction(function () { return location.pathname.indexOf('workspace-v2') >= 0; }, null, { timeout: 8000 }).then(function () { return asked.p.url(); }, function () { return asked.p.url(); });
  ok('?ui=v2 opens the journey and a plain /workspace does not', askedTo.indexOf('/workspace-v2') >= 0, askedTo);
  ok('query v2: no uncaught errors', !asked.errs.length, asked.errs);
  await asked.ctx.close();

  var sent = await open('switch org v2', '/workspace', flagged('v2'), false);
  var sentTo = await sent.p.waitForFunction(function () { return location.pathname.indexOf('workspace-v2') >= 0; }, null, { timeout: 8000 }).then(function () { return sent.p.url(); }, function () { return sent.p.url(); });
  var routed = await sent.p.evaluate(function () { return sessionStorage.getItem('omega-experience-routed'); });
  ok('an org on v2 is sent to workspace v2', sentTo.indexOf('/workspace-v2') >= 0, sentTo);
  ok('a tab the router sent is marked so a flip can bring it back', routed === '1', routed);
  ok('org v2: no uncaught errors', !sent.errs.length, sent.errs);
  await sent.ctx.close();

  var held = await open('switch classic override', '/workspace?ui=classic', flagged('v2'), false);
  await wait(1200);
  ok('?ui=classic stays on the classic home while the org is v2', held.p.url().indexOf('/workspace-v2') < 0 && /\/workspace/.test(held.p.url()), held.p.url());
  var remembered = await held.p.evaluate(function () { return localStorage.getItem('omega-experience'); });
  ok('?ui=classic is remembered on this browser', remembered === 'classic', remembered);
  ok('classic override: no uncaught errors', !held.errs.length, held.errs);
  await held.ctx.close();

  var v1 = await open('switch v1 alias', '/workspace?ui=v1', flagged('v2'), false);
  await wait(1200);
  ok('?ui=v1 stays on the classic home', v1.p.url().indexOf('/workspace-v2') < 0, v1.p.url());
  ok('v1 alias: no uncaught errors', !v1.errs.length, v1.errs);
  await v1.ctx.close();

  var person = await open('switch member classic', '/workspace', flagged('v2', 'classic'), false);
  await wait(1200);
  ok('a person set to classic is not sent, even when the org is v2', person.p.url().indexOf('/workspace-v2') < 0, person.p.url());
  ok('member classic: no uncaught errors', !person.errs.length, person.errs);
  await person.ctx.close();

  var back = await open('switch rollback', '/workspace-v2', flagged(''), false, function (ctx) {
    return ctx.addInitScript(function () { sessionStorage.setItem('omega-experience-routed', '1'); });
  });
  var backTo = await back.p.waitForFunction(function () { return location.pathname === '/workspace' || /\/workspace\.html$/.test(location.pathname); }, null, { timeout: 8000 }).then(function () { return back.p.url(); }, function () { return back.p.url(); });
  ok('a routed tab returns to classic when the org flag is unset', backTo.indexOf('/workspace-v2') < 0 && /\/workspace/.test(backTo), backTo);
  ok('rollback: no uncaught errors', !back.errs.length, back.errs);
  await back.ctx.close();

  await browser.close();
  srv.close();
  if (fails) { console.log(fails + ' failed'); process.exit(1); }
  console.log('render-workspace-v2: ok');
})().catch(function (e) { console.error(e); process.exit(1); });
