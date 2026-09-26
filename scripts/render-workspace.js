#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/render-workspace.js — Omega Workspace (workspace.html), rendered and checked
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Boots the REAL workspace.html in Chromium, signed in, with the Firebase
   compat SDK replaced by scripts/_lib/firebase-double.js and the tenant
   seeded from scripts/_lib/dashboard-fixtures.js — the same four tenants the
   dashboard is checked as (a new trial behind the terms modal, a paying
   Standard tenant with data and a locked tool, a workspace awaiting
   approval, a PACKAGED tenant on Lite alone), on a desktop and a 390px
   phone. Nothing leaves the machine.

     node scripts/render-workspace.js              # a JSON line per scenario
     node scripts/render-workspace.js --shots DIR  # plus screenshots
     npm run check:workspace

   It fails on an uncaught error, a console error, a call to an /api/ route
   it does not answer, a request that would have left the machine, sideways
   scroll, a stray write, and on each product assertion: the hub has Today
   and a ring made only of areas this tenant may open, the greeting, the
   company in the switcher, the locks (a Standard tenant's Enterprise tool
   locked, a Lite tenant's tools outside Lite locked, everything locked while
   approval is pending), the side panel opening from a hub cell, Customize
   saving only to the person's own layout record, the phone rail; and the
   FLOW: the projects and marketplace pages wearing the workspace rail and
   the dashboard sending a workspace-home visit on. Not on the npm test
   chain: needs the pre-installed Chromium.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-workspace: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-workspace: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || os.tmpdir()) : null; })();
if (shotsAt && !fs.existsSync(shotsAt)) fs.mkdirSync(shotsAt, { recursive: true });

var FD = require('./_lib/firebase-double'), FX = require('./_lib/dashboard-fixtures'), HUB = require('../omega-workspace-hub'), M = require('../api/_lib/modules');
var DOUBLE_SRC = FD.source();
var HOST = '127.0.0.1';
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf' };
var apiCalls = [], missing = [], external = [], PACKAGE_VIEW = null;
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0], post = req.method === 'POST';
  function json(o, status) { res.writeHead(status || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  if (u.indexOf('/api/') === 0) {
    apiCalls.push(req.method + ' ' + u);
    if (u === '/api/events') return post ? json({ accepted: 0 }, 202) : json({ enabled: false, sampleRate: 0, termsOk: true, excluded: false });
    if (u === '/api/package-access' && !post) return json(PACKAGE_VIEW || { packaged: false });
    missing.push(req.method + ' ' + u); return json({ error: 'render-workspace does not answer ' + u }, 404);
  }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
var fails = 0;
function ok(name, cond, detail) { if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); } }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var STRAY = /\b(NaN|undefined|null|\[object Object\])\b/;

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });

  async function scenario(name, fx, opts) {
    opts = opts || {}; PACKAGE_VIEW = fx.packageView || null;
    var errs = [], muted = false, ctx = await browser.newContext({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, hasTouch: !!opts.phone, isMobile: !!opts.phone });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* firebase is scripts/_lib/firebase-double.js here */' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      external.push(name + ': ' + url.slice(0, 120)); return r.abort();
    });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: fx.user, docs: fx.docs, latency: 8, authDomain: HOST });
    var p = await ctx.newPage();
    p.on('pageerror', function (e) { if (!muted) errs.push(name + ': ' + e.message); });
    p.on('console', function (m) { if (muted) return; var t = m.text(); if (m.type() === 'error' && !/^Failed to load resource/.test(t)) errs.push(name + ' console: ' + t.slice(0, 240)); });
    var t0 = Date.now();
    await p.goto(base + '/workspace', { waitUntil: 'domcontentloaded' });
    var ready = await p.waitForFunction(function () { return document.body.classList.contains('ready') || !!document.getElementById('ot-modal'); }, null, { timeout: 8000 }).then(function () { return true; }, function () { return false; });
    var out = { scenario: name, tenant: fx.org, readyMs: Date.now() - t0 };
    ok(name + ': the page answered within 8s', ready, out.readyMs);
    await wait(1500);
    Object.assign(out, await (opts.steps || function () { return {}; })(p, ctx));
    var text = await p.evaluate(function () { var m = document.getElementById('main'); return m ? m.innerText : document.body.innerText; });
    var stray = STRAY.exec(text);
    ok(name + ': the page prints no NaN / undefined / null / [object Object]', !stray, stray && text.slice(Math.max(0, stray.index - 60), stray.index + 40));
    var widths = opts.phone ? [390] : [1366, 390];
    for (var wi = 0; wi < widths.length; wi++) {
      var w = widths[wi]; await p.setViewportSize({ width: w, height: 844 }); await wait(250);
      var hs = await p.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
      if (hs) out['widest@' + w] = await p.evaluate(function (vw) { var worst = null; Array.prototype.forEach.call(document.querySelectorAll('body *'), function (e) { var r = e.getBoundingClientRect(); if (r.width && r.right > vw + 2 && (!worst || r.right > worst.right)) worst = { right: Math.round(r.right), tag: e.tagName, cls: String(e.className).slice(0, 50), id: e.id }; }); return worst; }, w);
      ok(name + ': no horizontal scroll at ' + w + 'px', !hs, out['widest@' + w]);
      if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '-' + w + '.png'), fullPage: w === 1366 });
    }
    if (opts.after) { await p.setViewportSize(opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }); await wait(250); Object.assign(out, await opts.after(p, ctx, function () { muted = true; })); }
    out.writes = await p.evaluate(function () { return (window.__firebaseDouble ? window.__firebaseDouble.store.log : []).map(function (w) { return w.op + ' ' + w.path; }); }).catch(function () { return ['(page navigated away)']; });
    var strayW = out.writes.filter(function (x) { return !/^(set|update|add) (team_members\/|termsAcceptances\/|dashboard_layouts\/|team_messages\/|omega_orgs\/[^/]+\/members\/)/.test(x) && x !== '(page navigated away)'; });
    ok(name + ': a visit writes only presence, acceptance, the person\'s own layout, a posted message or self-registration', !strayW.length, strayW);
    ok(name + ': no uncaught or console errors', !errs.length, errs);
    console.log(JSON.stringify(out));
    await ctx.close();
    return out;
  }

  /* every signed-in visit, whichever tenant */
  async function common(p, fx, name) {
    var out = {};
    var shown = await p.evaluate(function () { return { ready: document.body.classList.contains('ready'), refused: document.body.classList.contains('refused'), boot: getComputedStyle(document.getElementById('boot')).display, terms: !!document.getElementById('ot-modal') }; });
    ok(name + ': the workspace is shown and the splash is gone', shown.ready && !shown.refused && shown.boot === 'none' && !shown.terms, shown);
    var greet = await p.$eval('#ows-greet', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok(name + ': the greeting uses the person\'s first name', greet.indexOf(fx.user.displayName.split(' ')[0]) >= 0, greet);
    var co = await p.$eval('#ows-co-name', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok(name + ': the switcher names the company, not its domain', co === fx.name, co);
    var product = await p.$eval('#ows-product', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok(name + ': the rail wears the product name', product === 'Omega Workspace', product);
    var rail = await p.$$eval('#side-nav .sn-item', function (r) { return r.filter(function (a) { return getComputedStyle(a).display !== 'none'; }).map(function (a) { return a.querySelector('span').textContent.trim(); }); });
    ok(name + ': the rail is Home · Projects · All tools · Marketplace · Quote Desk · Team · Feed · Plan & billing · Settings', rail.join('|') === 'Home|Projects|All tools|Marketplace|Quote Desk|Team|Feed|Plan & billing|Settings', rail);
    var hub = await p.$$eval('#hub .hx', function (r) { return r.map(function (g) { return g.getAttribute('data-hub'); }); });
    ok(name + ': the hub has Today in the centre and a ring of at most six', hub[0] === 'today' && hub.length >= 3 && hub.length <= 7, hub);
    out.hub = hub;
    var tiles = await p.$$eval('#tools-body .tool', function (r) { return r.map(function (x) { return { tool: x.getAttribute('data-tool'), locked: x.classList.contains('locked'), soon: x.classList.contains('soon') }; }); });
    ok(name + ': the tools grid is painted from the catalog', tiles.length > 30, tiles.length);
    out.tiles = tiles.length; out.locked = tiles.filter(function (t) { return t.locked; }).length;
    var plan = await p.$eval('#plan', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); }).catch(function () { return ''; });
    ok(name + ': the plan strip says how many tools are open', /\d+ of \d+ tools open/.test(plan), plan);
    out.plan = plan.slice(0, 80);
    return out;
  }
  function expectedRing(ws, extra) {
    var TOOLS = require('../omega-tools.js');
    var c = { canOpen: function (k) { var t = TOOLS.byKey(k); return !!t && !ws.pendingApproval && TOOLS.isUnlocked(t, ws); }, tool: function (k) { return TOOLS.byKey(k); }, modules: ws.modules || [], addons: ws.addons || [], hideMarketplace: false };
    return ['today'].concat(HUB.compose(c).ring.map(function (a) { return a.key; }));
  }

  /* ══ 1. NEWCO — first visit, terms first ══ */
  var newco = FX.newco(HOST);
  await scenario('newco', newco, { steps: async function (p) {
    var out = {};
    var terms = await p.waitForFunction(function () { return !!document.getElementById('ot-modal'); }, null, { timeout: 4000 }).then(function () { return true; }, function () { return false; });
    ok('newco: a first visit is met by the terms modal', terms);
    if (terms) {
      await p.$eval('#ot-body', function (b) { b.scrollTop = b.scrollHeight; }).catch(function () {}); await wait(150);
      await p.click('#ot-accept').catch(function () {}); await wait(900);
      var rec = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return /^termsAcceptances\//.test(w.path); }).map(function (w) { return w.data.version; }); });
      ok('newco: accepting records the current version once', rec.length === 1 && rec[0] === FX.TERMS_VERSION, rec);
    }
    await wait(800);
    Object.assign(out, await common(p, newco, 'newco'));
    ok('newco: nothing is locked on a trial', out.locked === 0, out.locked);
    var empty = await p.$eval('#flight-body', function (e) { return e.textContent; });
    ok('newco: an empty workspace says so in In flight', /No projects yet/.test(empty), empty.slice(0, 60));
    /* + New project opens the one dialog and closes again */
    await p.click('#new-project'); await wait(300);
    var open = await p.$eval('#np-name', function (e) { return !!(e.offsetWidth || e.offsetHeight); }).catch(function () { return false; });
    ok('newco: + New project opens the New Project dialog', open);
    await p.click('.mb-cancel').catch(function () {}); await wait(200);
    /* Customize: a toggle saves to the person's own layout record only */
    await p.click('#customize'); await wait(250);
    await p.click('.tg[data-opt="guides"]'); await wait(900);
    var saved = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return /^dashboard_layouts\//.test(w.path); }).map(function (w) { return { path: w.path, guides: w.data.workspace && w.data.workspace.guides }; }); });
    ok('newco: a Customize toggle writes dashboard_layouts/{org}__{uid}.workspace', saved.length === 1 && saved[0].path === 'dashboard_layouts/' + newco.org + '__' + newco.user.uid && saved[0].guides === true, saved);
    var guides = await p.evaluate(function () { return document.body.innerText.indexOf('Guides') >= 0; });
    ok('newco: the Guides panel appears when switched on', guides);
    await p.keyboard.press('Escape'); await wait(200);
    return out;
  } });

  /* ══ 2. NORTHSTAR — Standard, data, a locked Enterprise tool ══ */
  var ns = FX.northstar(HOST);
  await scenario('northstar', ns, { steps: async function (p) {
    var out = await common(p, ns, 'northstar');
    var wsNow = await p.evaluate(function () { var w = window.OMEGA_WORKSPACE; return { tierLevel: w.tierLevel, toolAccess: w.toolAccess || null, modules: w.modules || null, addons: w.addons || null, packaged: !!w.packaged, pendingApproval: !!w.pendingApproval, toolOverrides: w.toolOverrides || null, unlockedTools: w.unlockedTools || null, requiredTools: w.requiredTools || null }; });
    var want = expectedRing(wsNow);
    ok('northstar: the ring is exactly what omega-workspace-hub composes for this workspace', out.hub.join() === want.join(), { got: out.hub, want: want });
    ok('northstar: Site Investment Analysis (Enterprise) is locked on Standard', await p.$('#tools-body .tool.locked[data-tool="investment"]') !== null);
    ok('northstar: Site Map is live', await p.$('#tools-body .tool.live[data-tool="editor"]') !== null);
    var cards = await p.$$eval('#flight-body .pc', function (r) { return r.map(function (x) { return x.querySelector('b').textContent; }); });
    ok('northstar: In flight lists the four projects', cards.length === 4, cards);
    var kpi = await p.$$eval('#today .kpi .v', function (r) { return r.map(function (x) { return x.textContent; }); });
    var labels = await p.$$eval('#today .kpi', function (r) { return r.map(function (x) { return x.querySelector('.l').textContent + '=' + x.querySelector('.v').textContent + (x.querySelector('.d') ? ' (' + x.querySelector('.d').textContent + ')' : ''); }); });
    ok('northstar: the numbers are 3 in flight (package through construction), the pipeline capex with the online site apart, and 1 quote back of 2 sent', kpi[0] === '3' && /\$\d/.test(kpi[2]) && /online/.test(labels[2]) && labels[3] === 'Quotes back=1 (of 2 sent)', labels);
    var needs = await p.$$eval('#today .next .row', function (r) { return r.map(function (x) { return x.getAttribute('data-key').split(':')[0] + ':' + x.querySelector('b').textContent; }); });
    ok('northstar: Needs you leads with the vendor who answered Riverside (a decision waiting), then Ann\'s to-do due in three days, then the projects with a next action', /^quotes:1 vendor answered your Riverside BESS request/.test(needs[0]) && /^todo:Send the Riverside one-line/.test(needs[1]) && needs.slice(2).every(function (x) { return /^next:/.test(x); }), needs);
    out.needs = needs;
    var people = await p.$$eval('#around .people .pr', function (r) { return r.length; });
    var feed = await p.$eval('#feed', function (e) { return e.textContent; });
    ok('northstar: People lists both teammates and the feed carries Raj\'s message', people === 2 && /interconnection study came back clean/.test(feed), { people: people });
    /* the side panel from a hub cell */
    await p.click('#hub .hx[data-hub="design"]'); await wait(300);
    var drawer = await p.$eval('.ows-drawer', function (e) { return { title: e.querySelector('h2').textContent, rows: e.querySelectorAll('.ows-row').length, locked: e.querySelectorAll('.ows-row.locked').length }; }).catch(function () { return null; });
    ok('northstar: a hub cell opens the side panel with the area\'s tools, Deluxe ones locked', drawer && /Design/.test(drawer.title) && drawer.rows >= 4 && drawer.locked >= 1, drawer);
    await p.keyboard.press('Escape'); await wait(200);
    ok('northstar: Escape closes it', (await p.$('.ows-drawer')) === null);
    /* a locked tile explains instead of opening (locked tiles fold under a per-category line) */
    await p.$$eval('#tools-body details', function (d) { d.forEach(function (x) { x.open = true; }); }); await wait(100);
    await p.click('#tools-body .tool.locked[data-tool="investment"]'); await wait(250);
    var why = await p.$eval('.ows-drawer', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
    ok('northstar: a locked tile says which plan carries it and offers the Marketplace', /Enterprise/.test(why) && /Marketplace/.test(why), why.slice(0, 160));
    await p.keyboard.press('Escape'); await wait(150);
    /* Plan & billing from the rail */
    await p.click('#side-nav .sn-item[data-key="billing"]'); await wait(250);
    var bill = await p.$eval('.ows-drawer', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
    ok('northstar: Plan & billing shows the plan and the next payment', /Plan/.test(bill) && /Next payment/.test(bill), bill.slice(0, 160));
    await p.keyboard.press('Escape'); await wait(150);
    /* post a message */
    await p.fill('#post-text', 'Geotech booked for Maple Yard'); await p.click('#post button[type="submit"]'); await wait(500);
    var posted = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return /^team_messages\//.test(w.path); }).map(function (w) { return w.data.authorEmail + ':' + w.data.text; }); });
    ok('northstar: a post writes one team_messages document as the signed-in person', posted.length === 1 && posted[0] === ns.user.email + ':Geotech booked for Maple Yard', posted);
    return out;
  }, after: async function (p, ctx, mute) {
    var nav = p.waitForNavigation({ timeout: 4000 }).then(function () { return p.url(); }, function () { return p.url(); });
    await p.click('#ows-signout'); var url = await nav; mute();
    ok('northstar: Sign out ends the session and goes to /login.html', /\/login\.html$/.test(url), url);
    return { afterSignOut: url.replace(/^https?:\/\/[^/]+/, '') };
  } });

  /* ══ 3. NORTHSTAR ON A PHONE ══ */
  await scenario('northstar-phone', FX.northstar(HOST), { phone: true, steps: async function (p) {
    var out = await common(p, ns, 'northstar-phone');
    var burger = await p.$eval('#ows-burger', function (b) { var r = b.getBoundingClientRect(); return r.width > 0 && getComputedStyle(b).display !== 'none'; }).catch(function () { return false; });
    ok('northstar-phone: the topbar has a menu button', burger);
    await p.tap('#ows-burger').catch(function () { return p.click('#ows-burger'); }); await wait(350);
    var open = await p.evaluate(function () { var r = document.getElementById('side-nav').getBoundingClientRect(); return { open: document.body.classList.contains('ows-rail-open'), onScreen: r.left >= -1 && r.width > 200 }; });
    ok('northstar-phone: the rail slides in as a drawer', open.open && open.onScreen, open);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'northstar-phone-rail.png') });
    await p.keyboard.press('Escape'); await wait(250);
    ok('northstar-phone: Escape closes it', !(await p.evaluate(function () { return document.body.classList.contains('ows-rail-open'); })));
    var tabs = await p.$$eval('.ows-tabs a', function (r) { return r.filter(function (a) { return a.getBoundingClientRect().height > 0; }).map(function (a) { var t = ''; Array.prototype.forEach.call(a.childNodes, function (n) { if (n.nodeType === 3) t += n.textContent; }); return t.trim(); }); });
    ok('northstar-phone: the tab bar is Home · Projects · Tools · Team · Me', tabs.join('|') === 'Home|Projects|Tools|Team|Me', tabs);
    var hubW = await p.$eval('#hub svg', function (s) { var r = s.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    ok('northstar-phone: the hub draws at phone width', hubW.w > 280 && hubW.h > 200, hubW);
    return out;
  } });

  /* ══ 4. PENDING — not yet approved ══ */
  var pend = FX.pending(HOST);
  await scenario('pending', pend, { steps: async function (p) {
    var out = await common(p, pend, 'pending');
    var notice = await p.$eval('#ows-notice', function (e) { return e.hidden ? '' : e.textContent; });
    ok('pending: the awaiting-approval notice is shown and names the workspace', /Awaiting approval/.test(notice) && /Pendingco/.test(notice), notice.slice(0, 120));
    ok('pending: every tool is locked until approval', out.locked === out.tiles - (await p.$$eval('#tools-body .tool.soon', function (r) { return r.length; })), { locked: out.locked, tiles: out.tiles });
    ok('pending: the ring holds only the always-on areas', out.hub.join() === 'today,projects,market,team', out.hub);
    var needs = await p.$eval('#today .next', function (e) { return e.textContent; });
    ok('pending: Needs you leads with approval', /awaiting approval/.test(needs), needs.slice(0, 80));
    return out;
  } });

  /* ══ 5. LITE LABS — packaged, Lite alone ══ */
  var lt = FX.lite(HOST);
  await scenario('lite', lt, { steps: async function (p) {
    var out = await common(p, lt, 'lite');
    var tiles = await p.$$eval('#tools-body .tool', function (r) { return r.map(function (x) { return { tool: x.getAttribute('data-tool'), locked: x.classList.contains('locked'), soon: x.classList.contains('soon') }; }); });
    var wrong = tiles.filter(function (t) { return !t.soon && (lt.liteTools.indexOf(t.tool) >= 0) === t.locked; });
    ok('lite: every tool outside Lite is locked and every Lite tool is open (' + tiles.length + ' tiles)', tiles.length > 0 && !wrong.length, wrong);
    var wsNow = await p.evaluate(function () { var w = window.OMEGA_WORKSPACE; return { packaged: !!w.packaged, packageAccess: w.packageAccess, modules: w.modules, toolAccess: w.toolAccess, orgId: w.orgId }; });
    ok('lite: the ring is composed from Lite\'s tools alone', out.hub.join() === expectedRing(wsNow).join(), { got: out.hub, want: expectedRing(wsNow) });
    ok('lite: the plan strip names Lite', /Lite/.test(out.plan), out.plan);
    var folded = await p.$$eval('#tools-body details', function (d) { return { n: d.length, closed: d.filter(function (x) { return !x.open; }).length }; });
    ok('lite: locked tools fold under a per-category line and stay out of the way', folded.n >= 5 && folded.closed >= 4, folded);
    var co = await p.$eval('#ows-co-sub', function (e) { return e.textContent; });
    ok('lite: the switcher says Lite, the same word as the plan strip', /Lite/.test(co), co);
    await p.$$eval('#tools-body details', function (d) { d.forEach(function (x) { x.open = true; }); }); await wait(100);
    await p.click('#tools-body .tool.locked[data-tool="gridatlas"]'); await wait(250);
    var why = await p.$eval('.ows-drawer', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
    ok('lite: a locked tile names the module that carries it', /Grid Atlas/.test(why) && /part of/.test(why), why.slice(0, 160));
    await p.keyboard.press('Escape');
    ok('lite: the page asked /api/package-access and nothing it does not answer', apiCalls.some(function (c) { return /package-access/.test(c); }) && !missing.length, { calls: apiCalls, missing: missing });
    return out;
  } });

  /* ══ 6. THE FLOW — Projects and Marketplace with the workspace as home ══
     The legacy pages keep their own topbar and CSS, but their rail becomes
     the workspace rail (adopt), Dashboard points at /workspace, the ground
     is the same grid; and a dashboard visit is sent on to /workspace. */
  async function flow(page, current) {
    var errs = [], ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) { var url = r.request().url(); if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); if (/Chart\.js/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Chart=function(){};window.Chart.register=function(){};' }); return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: ns.user, docs: ns.docs, latency: 8, authDomain: HOST });
    var p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + page + '?home=workspace', { waitUntil: 'domcontentloaded' }); await wait(2500);
    var out = await p.evaluate(function () {
      var items = Array.prototype.filter.call(document.querySelectorAll('#side-nav .sn-item'), function (a) { return getComputedStyle(a).display !== 'none'; }).map(function (a) { return (a.querySelector('span') || a).textContent.trim() + (a.classList.contains('active') ? '*' : ''); });
      var home = document.querySelector('a[data-sn="dashboard"]');
      return { url: location.pathname, items: items, home: home && home.getAttribute('href'), theme: document.body.classList.contains('ows-theme'), grid: /linear-gradient/.test(getComputedStyle(document.body).backgroundImage) };
    });
    var name = 'flow ' + page;
    if (page === '/') ok(name + ': a dashboard visit with the workspace as home lands on /workspace', /\/workspace$/.test(out.url), out.url);
    else {
      ok(name + ': the rail is the workspace rail with this page current', out.items.join('|') === 'Home|Projects|All tools|Marketplace|Quote Desk|Team|Feed|Plan & billing|Settings'.replace(current, current + '*'), out.items);
      ok(name + ': Dashboard points at /workspace and the ground is the blueprint grid', out.home === '/workspace' && out.theme && out.grid, out);
      ok(name + ': no uncaught errors', !errs.length, errs);
    }
    console.log(JSON.stringify({ scenario: name, rail: out.items, url: out.url }));
    await ctx.close();
  }
  await flow('/projects.html', 'Projects'); await flow('/marketplace.html', 'Marketplace'); await flow('/', '');

  await browser.close(); srv.close();
  ok('no request would have left the machine', !external.length, external.slice(0, 5));
  ok('no /api/ route was called that this check does not answer', !missing.length, missing);
  console.log(fails ? 'render-workspace: ' + fails + ' FAILED' : 'render-workspace: ok');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
