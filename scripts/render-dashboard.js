#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/render-dashboard.js — the tenant dashboard, rendered and checked
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Boots the REAL index.html in Chromium, signed in, with the Firebase compat
   SDK replaced by scripts/_lib/firebase-double.js and the tenant seeded from
   scripts/_lib/dashboard-fixtures.js. Nothing leaves the machine: Google's
   SDK and fonts, the chart CDN and every /api/ call are answered here.

     node scripts/render-dashboard.js              # a JSON line per scenario
     node scripts/render-dashboard.js --shots DIR  # plus screenshots
     npm run check:dashboard

   It is the check that a signed-in visit paints, for the three first-run
   shapes the product has (a brand-new trial workspace behind the terms
   modal, a paying Standard tenant with data and a locked tile, a workspace
   awaiting approval), on a desktop and on a 390px phone. It fails on an
   uncaught error, a console error, a call to an /api/ route it does not
   answer, a request that would have left the machine, sideways scroll, and
   on each product assertion below (splash gone, greeting, the tenant's name,
   the tiles, a locked tile's overlay INSIDE its tile, the counts, the terms
   gate recording an acceptance, no stray writes, sign-out).

   Why a double and not the emulator: the emulator answers the SDK's network
   protocol and needs Java and the SDK's own transport; the double answers
   the SDK's API from memory in under a second and can say exactly what the
   page wrote. Rules are not checked here — that is the rules emulator's
   job — and a fixture that the rules would refuse is a fixture bug.
   Not on the npm test chain: needs the pre-installed Chromium, like
   render-logic-pages.js. ES5-ish Node.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-dashboard: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-dashboard: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || os.tmpdir()) : null; })();
if (shotsAt && !fs.existsSync(shotsAt)) fs.mkdirSync(shotsAt, { recursive: true });

var FD = require('./_lib/firebase-double'), FX = require('./_lib/dashboard-fixtures');
var DOUBLE_SRC = FD.source();
var HOST = '127.0.0.1';
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
/* Chart.js as the page expects to find it: a constructor that records what
   it was given. The CDN is not reached; the page's own code is what is
   under test, and it must not throw whether or not a chart draws. */
var CHART_STUB = '(function(){function Chart(el,cfg){this.canvas=el;this.config=cfg||{};this.data=this.config.data||{};this.options=this.config.options||{};Chart.instances.push(this);}Chart.instances=[];Chart.prototype.update=function(){};Chart.prototype.destroy=function(){var i=Chart.instances.indexOf(this);if(i>=0)Chart.instances.splice(i,1);};Chart.prototype.resize=function(){};Chart.prototype.toBase64Image=function(){return "";};Chart.register=function(){};Chart.defaults={font:{},plugins:{}};Chart.getChart=function(){return null;};window.Chart=Chart;})();';

/* what the page called on /api/ and what it would have sent off the machine */
var apiCalls = [], missing = [], external = [];
/* the package projection the scenario's tenant gets (fixture.packageView; an
   unpackaged tenant is told so, as api/package-access.js does) */
var PACKAGE_VIEW = null;
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0], post = req.method === 'POST';
  function json(o, status) { res.writeHead(status || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  if (u.indexOf('/api/') === 0) {
    apiCalls.push(req.method + ' ' + u);
    if (u === '/api/events') return post ? json({ accepted: 0 }, 202) : json({ enabled: false, sampleRate: 0, termsOk: true, excluded: false });
    if (u === '/api/package-access' && !post) return json(PACKAGE_VIEW || { packaged: false });
    missing.push(req.method + ' ' + u); return json({ error: 'render-dashboard does not answer ' + u }, 404);
  }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';
  if (fs.existsSync(f) && fs.statSync(f).isDirectory() && fs.existsSync(path.join(f, 'index.html'))) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

var fails = 0, lines = [];
function ok(name, cond, detail) { if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); } }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
/* a body of visible text carries none of the words a bug prints */
var STRAY = /\b(NaN|undefined|null|\[object Object\])\b/;

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });

  /* One scenario: a fresh browser context (its own storage and double),
     the tenant's fixture installed before any page script runs. */
  async function scenario(name, fx, opts) {
    opts = opts || {};
    PACKAGE_VIEW = fx.packageView || null;
    var errs = [], warns = [], muted = false, ctx = await browser.newContext({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, hasTouch: !!opts.phone, isMobile: !!opts.phone });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* firebase is scripts/_lib/firebase-double.js here */' });
      if (/cdnjs\.cloudflare\.com\/ajax\/libs\/Chart\.js/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: CHART_STUB });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      external.push(name + ': ' + url.slice(0, 120)); return r.abort();
    });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); window.addEventListener('omega:entitlements', function (e) { window.__entitlements = e.detail; }); }, { user: fx.user, docs: fx.docs, latency: 8, authDomain: HOST });
    var p = await ctx.newPage();
    p.on('pageerror', function (e) { if (!muted) errs.push(name + ': ' + e.message); });
    p.on('console', function (m) {
      if (muted) return;
      var t = m.text();
      if (m.type() === 'error' && !/^Failed to load resource/.test(t)) errs.push(name + ' console: ' + t.slice(0, 240));
      if (m.type() === 'warning') warns.push(t.slice(0, 160));
    });
    var t0 = Date.now();
    await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
    /* the splash comes down when auth has answered; the app is the side of it a signed-in user gets */
    var ready = await p.waitForFunction(function () { return document.body.classList.contains('auth-ready'); }, null, { timeout: 8000 }).then(function () { return true; }, function () { return false; });
    var tReady = Date.now() - t0;
    var out = { scenario: name, tenant: fx.org, authReadyMs: tReady };
    ok(name + ': auth answered within 8s (the splash came down)', ready, tReady);
    var steps = opts.steps || function () { return {}; };
    await wait(1400);   /* entitlements, listeners, the tools grid, the widgets */
    var shown = await p.evaluate(function () {
      var g = function (id) { var e = document.getElementById(id); return e ? getComputedStyle(e).display : 'missing'; };
      return { splash: g('boot-splash'), auth: g('auth-screen'), app: g('app'), pending: !!document.getElementById('omega-pending'), terms: !!document.getElementById('ot-modal') };
    });
    out.shown = shown;
    /* what the page believes the plan is: the bound workspace and what omega-tenant.js handed over */
    out.ws = await p.evaluate(function () { function pick(w) { return w ? { tier: w.tierLevel, label: w.accountTier, pending: !!w.pendingApproval, unlocked: Array.isArray(w.unlockedTools) ? w.unlockedTools.length : null, access: w.toolAccess || null } : null; } return { bound: pick(window.OMEGA_WORKSPACE), handed: pick(window.__entitlements), same: !!window.__entitlements && window.__entitlements === window.OMEGA_WORKSPACE }; });
    Object.assign(out, await steps(p, shown, ctx));
    var text = await p.evaluate(function () { var m = document.getElementById('main'); return m ? m.innerText : document.body.innerText; });
    var stray = STRAY.exec(text);
    ok(name + ': the page prints no NaN / undefined / null / [object Object]', !stray, stray && text.slice(Math.max(0, stray.index - 60), stray.index + 40));
    /* sideways scroll at the width the scenario ran at, and at 390px */
    var widths = opts.phone ? [390] : [1366, 390];
    for (var wi = 0; wi < widths.length; wi++) {
      var w = widths[wi];
      await p.setViewportSize({ width: w, height: 844 }); await wait(250);
      var hs = await p.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
      if (hs) out['widest@' + w] = await p.evaluate(function (vw) { var worst = null; Array.prototype.forEach.call(document.querySelectorAll('body *'), function (e) { var r = e.getBoundingClientRect(); if (r.width && r.right > vw + 2 && (!worst || r.right > worst.right)) worst = { right: Math.round(r.right), tag: e.tagName, cls: String(e.className).slice(0, 50), id: e.id }; }); return worst; }, w);
      ok(name + ': no horizontal scroll at ' + w + 'px', !hs, out['widest@' + w]);
      if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '-' + w + '.png'), fullPage: w === 1366 });
    }
    if (opts.after) { await p.setViewportSize(opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }); await wait(250); Object.assign(out, await opts.after(p, ctx, function () { muted = true; })); }
    out.writes = await p.evaluate(function () { return (window.__firebaseDouble ? window.__firebaseDouble.store.log : []).map(function (w) { return w.op + ' ' + w.path; }); }).catch(function () { return ['(page navigated away)']; });
    out.warnings = warns.length;
    if (warns.length) out.firstWarnings = warns.slice(0, 3);
    ok(name + ': no uncaught or console errors', !errs.length, errs);
    console.log(JSON.stringify(out));
    await ctx.close();
    return out;
  }

  /* the rectangle of one element, or null */
  function rect(p, sel) { return p.$eval(sel, function (e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }).catch(function () { return null; }); }
  function inside(a, b, slack) { slack = slack || 2; return !!(a && b && a.x >= b.x - slack && a.y >= b.y - slack && a.r <= b.r + slack && a.b <= b.b + slack); }
  function num(s) { var m = /-?[\d,]+(\.\d+)?/.exec(String(s || '')); return m ? Number(m[0].replace(/,/g, '')) : NaN; }

  /* ── what every signed-in visit must do, whichever tenant ── */
  async function common(p, shown, fx, name) {
    var out = {};
    ok(name + ': the app shell is shown and the sign-in card and splash are not', shown.app === 'flex' && shown.auth === 'none' && shown.splash === 'none', shown);
    var greet = await p.$eval('#welcome-name', function (e) { return e.textContent; }).catch(function () { return ''; });
    var first = fx.user.displayName.split(' ')[0];
    ok(name + ': the greeting uses the person\'s first name', greet.indexOf(first) >= 0, greet);
    var label = await p.$eval('#dash-label', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok(name + ': the header names the tenant, not its domain', label.toUpperCase().indexOf(fx.name.toUpperCase()) >= 0, label);
    var date = await p.$eval('#dash-date', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok(name + ': today\'s date is painted', /\d{4}/.test(date), date);
    out.greeting = greet; out.label = label;
    var quick = await p.$$eval('.quick-row .quick-link', function (r) { return r.map(function (x) { return { title: (x.querySelector('.ql-title') || {}).textContent, tool: x.getAttribute('data-tool'), locked: x.classList.contains('locked') }; }); });
    ok(name + ': the four Quick Access tiles are there', quick.length === 4, quick);
    out.quickLinksOnPage = await p.$$eval('.quick-link', function (r) { return r.length; });
    out.quick = quick.map(function (q) { return q.tool + (q.locked ? ':locked' : ''); });
    var kpis = await p.$$eval('#kpi-grid > *', function (r) { return r.length; });
    ok(name + ': the KPI grid is painted', kpis > 0, kpis);
    var apps = await p.$eval('#dash-grid', function (e) { return { tiles: e.querySelectorAll('.pm-tile').length, text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) }; });
    out.apps = apps;
    var counts = await p.evaluate(function () { function t(id) { var e = document.getElementById(id); return e ? e.textContent.trim() : null; } return { users: t('th-users-count'), todos: t('th-todo-count'), msgs: t('th-msg-count') }; });
    out.team = counts;
    return out;
  }

  /* ══ 1. NEWCO — a brand-new trial workspace, first visit ══ */
  var newco = FX.newco(HOST);
  await scenario('newco', newco, { steps: async function (p, shown) {
    var out = {};
    ok('newco: a first visit is met by the terms modal, blocking', shown.terms, shown);
    if (shown.terms) {
      await p.$eval('#ot-body', function (b) { b.scrollTop = b.scrollHeight; }).catch(function () {});
      await wait(150);
      var enabled = await p.$eval('#ot-accept', function (b) { return !b.hasAttribute('disabled'); }).catch(function () { return false; });
      ok('newco: Accept enables once the terms are scrolled to the end', enabled);
      await p.click('#ot-accept').catch(function () {});
      await wait(300);
      var gone = await p.evaluate(function () { return !document.getElementById('ot-modal'); });
      var rec = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return /^termsAcceptances\//.test(w.path); }).map(function (w) { return w.data; }); });
      ok('newco: accepting records termsAcceptances/{uid} at the current version and closes the modal', gone && rec.length === 1 && rec[0].version === FX.TERMS_VERSION && rec[0].uid === newco.user.uid, [gone, rec]);
      await wait(600);
      shown = await p.evaluate(function () { var g = function (id) { var e = document.getElementById(id); return e ? getComputedStyle(e).display : 'missing'; }; return { splash: g('boot-splash'), auth: g('auth-screen'), app: g('app'), pending: !!document.getElementById('omega-pending'), terms: !!document.getElementById('ot-modal') }; });
    }
    Object.assign(out, await common(p, shown, newco, 'newco'));
    ok('newco: nothing is locked on a trial (trial carries every tool)', out.quick.every(function (q) { return !/locked/.test(q); }) && (await p.$$eval('.locked[data-tool]', function (r) { return r.length; })) === 0, out.quick);
    ok('newco: no "awaiting approval" strip on an approved workspace', !shown.pending);
    /* the empty states a new subscriber reads */
    var kpiZero = await p.$$eval('#kpi-grid .kpi-val, #kpi-grid [class*="val"]', function (r) { return r.map(function (x) { return x.textContent.trim(); }); });
    out.kpiValues = kpiZero.slice(0, 6);
    ok('newco: the team card counts the one person who just arrived (the visit registers them)', num(out.team.users) === 1, out.team);
    /* the New Project modal opens from Quick Access and closes again */
    await p.click('.quick-link[data-tool="editor"]'); await wait(300);
    var modalOpen = await p.$eval('#np-name', function (e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); }).catch(function () { return false; });
    ok('newco: "Open Site Map Tool" opens the New Project form', modalOpen);
    await p.click('.mb-cancel').catch(function () {}); await wait(200);
    var modalClosed = await p.$eval('#np-name', function (e) { return !(e.offsetWidth || e.offsetHeight || e.getClientRects().length); }).catch(function () { return true; });
    ok('newco: Cancel closes it', modalClosed);
    return out;
  }, after: async function (p) {
    var w = await p.evaluate(function () { return window.__firebaseDouble.store.log.map(function (x) { return x.op + ' ' + x.path; }); });
    var stray = w.filter(function (x) { return !/^(set|add) (team_members\/|termsAcceptances\/|dashboard_layouts\/|omega_orgs\/newco\.example\/members\/)/.test(x); });
    ok('newco: a plain visit writes only its own presence, layout and acceptance, never the tenant record or billing', !stray.length, stray);
    return { strayWrites: stray };
  } });

  /* ══ 2. NORTHSTAR — a paying Standard tenant with data and a locked tile ══ */
  var ns = FX.northstar(HOST);
  await scenario('northstar', ns, { steps: async function (p, shown) {
    var out = await common(p, shown, ns, 'northstar');
    ok('northstar: no terms modal for a person who accepted the current version', !shown.terms);
    ok('northstar: the team card shows both teammates, the open to-do and the message', num(out.team.users) === 2 && num(out.team.todos) >= 1 && num(out.team.msgs) === 1, out.team);
    var rows = await p.$$eval('.ptable tbody tr', function (r) { return r.length; });
    ok('northstar: the portfolio table lists the four projects', rows === 4, rows);
    var strip = await p.$eval('#ov-strip', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
    ok('northstar: the overview counts 4 projects managed', /(^|\D)4\s*Projects Managed/.test(strip), strip.slice(0, 200));
    out.pipeline = await p.$$eval('.pipe-track > *', function (r) { return r.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().slice(0, 30); }); }).catch(function () { return null; });
    /* THE LOCKED TILE. Standard does not carry Site Investment Analysis, so
       the Quick Access tile for it is locked: dimmed, badged, its overlay
       INSIDE the tile, and a neighbour still clickable. */
    var lockedSel = '.quick-link.locked[data-tool="' + ns.lockedQuick + '"]';
    await p.$eval('.quick-row', function (e) { e.scrollIntoView({ block: 'center' }); }).catch(function () {}); await wait(200);
    var isLocked = !!(await p.$(lockedSel));
    ok('northstar: the Site Investment Analysis tile is locked on Standard', isLocked, out.quick);
    if (isLocked) {
      var tile = await rect(p, lockedSel), overlay = await rect(p, lockedSel + ' .pm-lock'), badge = await rect(p, lockedSel + ' .pm-lock-badge');
      ok('northstar: the lock overlay and badge sit inside the locked tile, not over the page', inside(overlay, tile) && inside(badge, tile), { tile: tile, overlay: overlay, badge: badge });
      var neighbour = await rect(p, '.quick-link[data-tool="sales"]');
      await p.mouse.move(neighbour.x + neighbour.w / 2, neighbour.y + neighbour.h / 2); await wait(250);
      var under = await p.evaluate(function (pt) { var e = document.elementFromPoint(pt.x, pt.y); var q = e && e.closest('.quick-link'); return q ? q.getAttribute('data-tool') : (e ? e.className : null); }, { x: neighbour.x + neighbour.w / 2, y: neighbour.y + neighbour.h / 2 });
      ok('northstar: the pointer over the neighbouring tile reaches that tile', under === 'sales', under);
      await p.mouse.move(tile.x + tile.w / 2, tile.b - 6); await wait(400);
      var hover1 = await p.$eval(lockedSel + ' .pm-lock', function (e) { var r = e.getBoundingClientRect(); return { op: getComputedStyle(e).opacity, r: { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } }; });
      await wait(400);
      var hover2 = await p.$eval(lockedSel + ' .pm-lock', function (e) { var r = e.getBoundingClientRect(); return { op: getComputedStyle(e).opacity, r: { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } }; });
      var tileNow = await rect(p, lockedSel);
      ok('northstar: hovering the locked tile\'s bottom edge shows the overlay once and it stays put', Number(hover1.op) === 1 && Number(hover2.op) === 1 && inside(hover2.r, tileNow) && Math.abs(hover1.r.y - hover2.r.y) < 1, [hover1, hover2, tileNow]);
      var name = await p.$eval(lockedSel + ' .pm-lock-sub', function (e) { return e.textContent; });
      ok('northstar: the overlay names the tool', /Site Investment Analysis/.test(name), name);
      await p.click(lockedSel + ' .pm-lock-cta'); await wait(200);
      var modal = await p.$eval('#upgrade-modal', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
      ok('northstar: Request access opens the upgrade modal naming the tool', /Unlock Site Investment Analysis/.test(modal), modal.slice(0, 80));
      await p.evaluate(function () { var m = document.getElementById('upgrade-modal'); if (m) m.remove(); });
    }
    return out;
  }, after: async function (p, ctx, mute) {
    /* sign out from the topbar: the session ends and the page goes to the front door.
       What login.html then logs (it imports Google's module SDK, stubbed here) is not the dashboard's. */
    var nav = p.waitForNavigation({ timeout: 4000 }).then(function () { return p.url(); }, function () { return p.url(); });
    await p.click('.tb-user .btn-signout:last-child');
    var url = await nav; mute();
    ok('northstar: Sign Out ends the session and goes to /login.html', /\/login\.html$/.test(url), url);
    return { afterSignOut: url.replace(/^https?:\/\/[^/]+/, '') };
  } });

  /* ══ 3. NORTHSTAR ON A PHONE ══ */
  await scenario('northstar-phone', FX.northstar(HOST), { phone: true, steps: async function (p, shown) {
    var out = await common(p, shown, ns, 'northstar-phone');
    var burger = await p.$('#tb-burger');
    ok('northstar-phone: the topbar has a menu button on a phone', !!burger);
    if (burger) {
      var visible = await p.$eval('#tb-burger', function (b) { var r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none'; });
      ok('northstar-phone: the menu button is visible', visible);
      await p.tap('#tb-burger').catch(function () { return p.click('#tb-burger'); }); await wait(350);
      var open = await p.evaluate(function () { var n = document.querySelector('.tb-nav'); var r = n ? n.getBoundingClientRect() : null; return { expanded: document.getElementById('tb-burger').getAttribute('aria-expanded'), onScreen: !!(r && r.width > 0 && r.left >= -1 && r.left < window.innerWidth), signout: !!document.querySelector('.tb-drawer-actions .btn-signout') }; });
      ok('northstar-phone: the drawer opens on screen with Sign out in it', open.expanded === 'true' && open.onScreen && open.signout, open);
      var inDrawer = await p.evaluate(function () { var n = document.querySelector('.tb-nav'); return { sidebar: !!(n && n.querySelector('#side-nav')), items: n ? n.querySelectorAll('#side-nav .sn-item').length : 0, tabsHidden: n ? Array.prototype.every.call(n.querySelectorAll('.tb-tab'), function (t) { return getComputedStyle(t).display === 'none'; }) : false }; });
      ok('northstar-phone: the workspace sidebar (To-Dos, Team, Feed, Chat, Quote Desk…) rides inside the drawer', inDrawer.sidebar && inDrawer.items >= 8 && inDrawer.tabsHidden, inDrawer);
      /* the labels have to be readable on the drawer: contrast of a sidebar
         label against the first opaque background behind it (WCAG 4.5:1) */
      var contrast = await p.evaluate(function () {
        var e = document.querySelector('.tb-nav #side-nav .sn-item:not(.active) span'); if (!e) return null;
        function rgb(c) { var m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; var v = m[1].split(',').map(Number); return v.length > 3 && v[3] === 0 ? null : v.slice(0, 3); }
        function lum(v) { return v.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce(function (t, x, i) { return t + x * [0.2126, 0.7152, 0.0722][i]; }, 0); }
        var fg = rgb(getComputedStyle(e).color), bg = null, node = e;
        while (node && !bg) { bg = rgb(getComputedStyle(node).backgroundColor); node = node.parentElement; }
        var a = lum(fg), b = lum(bg || [255, 255, 255]);
        return { ratio: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100, text: e.textContent.trim(), visible: !!(e.offsetWidth && e.offsetHeight) };
      });
      ok('northstar-phone: a sidebar label in the drawer reads at 4.5:1 or better', contrast && contrast.visible && contrast.ratio >= 4.5, contrast);
      if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'northstar-phone-drawer.png') });
      await p.keyboard.press('Escape'); await wait(250);
      var closed = await p.evaluate(function () { return document.getElementById('tb-burger').getAttribute('aria-expanded'); });
      ok('northstar-phone: Escape closes it', closed === 'false', closed);
    }
    var tiles = await p.$$eval('.quick-row .quick-link', function (r) { return r.map(function (x) { var b = x.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; }); });
    ok('northstar-phone: Quick Access tiles are full-width, tappable rows', tiles.every(function (t) { return t.w >= 300 && t.h >= 44; }), tiles);
    return out;
  } });

  /* ══ 4. PENDING — signed up, not yet approved ══ */
  var pend = FX.pending(HOST);
  await scenario('pending', pend, { steps: async function (p, shown) {
    var out = await common(p, shown, pend, 'pending');
    ok('pending: the "awaiting approval" strip is shown, and the dashboard behind it', shown.pending && shown.app === 'flex', shown);
    var strip = await p.$eval('#omega-pending', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
    ok('pending: the strip names the workspace and the email that will be told', /Pendingco/.test(strip) && /sam@pendingco\.example/.test(strip), strip.slice(0, 200));
    var locked = await p.$$eval('[data-tool]', function (r) { return { all: r.length, locked: r.filter(function (x) { return x.classList.contains('locked'); }).length }; });
    ok('pending: every tool is locked until approval', locked.all > 0 && locked.locked === locked.all, locked);
    await p.click('#omega-upgrade'); await wait(300);
    var req = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return /^access_requests\//.test(w.path); }).map(function (w) { return { path: w.path, status: w.data.status, upgrade: w.data.upgradeRequested, email: w.data.email }; }); });
    var said = await p.$eval('#omega-upgrade-msg', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok('pending: Upgrade writes the person\'s access request (a record, not an email) and says so', req.length === 1 && req[0].path === 'access_requests/' + pend.user.uid && req[0].upgrade === true && /sent/.test(said), [req, said]);
    return out;
  } });

  /* ══ 5. LITE LABS — a PACKAGED tenant on Lite alone (phases 1–4) ══
     The page reads billing.packaged, asks /api/package-access (answered with
     the real projection) and must open exactly Lite's tools: the Quick
     Access tiles outside Lite locked, the starter set drawn only from Lite,
     every other tool tile locked with the overlay inside it. */
  var lt = FX.lite(HOST);
  await scenario('lite', lt, { steps: async function (p, shown) {
    var out = await common(p, shown, lt, 'lite');
    var handed = await p.evaluate(function () { var w = window.__entitlements; return w ? { packaged: !!w.packaged, access: Array.isArray(w.toolAccess) ? w.toolAccess.slice().sort() : null, modules: w.modules || null } : null; });
    ok('lite: omega-tenant.js handed the page the package: Lite\'s tools as the allowlist, nothing more', !!handed && handed.packaged && handed.access && handed.access.join() === lt.liteTools.slice().sort().join(), handed);
    var tiles = await p.$$eval('[data-tool]', function (r) { return r.map(function (x) { return { tool: x.getAttribute('data-tool'), locked: x.classList.contains('locked') }; }); });
    var wrong = tiles.filter(function (t) { return (lt.liteTools.indexOf(t.tool) >= 0) === t.locked; });
    ok('lite: every tile of a tool outside Lite is locked and every Lite tool is open (' + tiles.length + ' tiles)', tiles.length > 0 && !wrong.length, wrong);
    ok('lite: the Quick Access tiles say the same: Site Map and Sales open, Site Investment Analysis locked', out.quick.indexOf('editor') >= 0 && out.quick.indexOf('sales') >= 0 && out.quick.indexOf('investment:locked') >= 0, out.quick);
    var starter = await p.evaluate(function () { var n = document.querySelector('.pm-starter-note'); return { note: !!n, tools: Array.prototype.map.call(document.querySelectorAll('#dash-grid .pm-tile[data-tool]'), function (t) { return t.getAttribute('data-tool'); }) }; });
    var outside = starter.tools.filter(function (k) { return lt.liteTools.indexOf(k) < 0; });
    ok('lite: the starter set is drawn from Lite alone', starter.note && starter.tools.length > 0 && !outside.length, starter);
    var overlays = await p.$$eval('[data-tool].locked', function (r) { return r.map(function (x) { var o = x.querySelector('.lock-overlay, .tool-lock, [class*="lock"]'); if (!o) return null; var a = x.getBoundingClientRect(), b = o.getBoundingClientRect(); return b.left >= a.left - 2 && b.top >= a.top - 2 && b.right <= a.right + 2 && b.bottom <= a.bottom + 2; }); });
    ok('lite: each lock overlay stays inside its own tile', overlays.every(function (v) { return v !== false; }), overlays);
    return out;
  } });
  PACKAGE_VIEW = null;

  ok('no /api/ route was called that this check does not answer', !missing.length, missing);
  ok('nothing tried to leave the machine', !external.length, external);
  console.log(JSON.stringify({ apiCalls: apiCalls.filter(function (x, i, a) { return a.indexOf(x) === i; }) }));
  await browser.close(); srv.close();
  console.log(fails ? '\n' + fails + ' dashboard render check(s) FAILED' : '\ndashboard render checks: all passed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
