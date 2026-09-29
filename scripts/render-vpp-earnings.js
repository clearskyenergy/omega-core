#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/render-vpp-earnings.js — the VPP Earnings Simulator, rendered and checked
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Boots the REAL vpp-earnings.html in Chromium, signed in, with the Firebase
   compat SDK replaced by scripts/_lib/firebase-double.js, and answers
   POST /api/vpp-estimate with the REAL endpoint (api/vpp-estimate.js: its
   gate, the real engine behind api/_lib/vpp-provider.js), verify-token
   stubbed to map the double's token to its user and fold the org alias with
   the real orgOf(). Nothing leaves the machine.

   Two things the double does here that the real services do and the double
   alone does not:
     - Firestore refuses an array inside an array, and the compat SDK says so
       by THROWING from DocumentReference.set(); the double's set() is wrapped
       to do the same, so a URDB tariff saved as parsed JSON fails as it does
       in production.
     - the store and the signed-in user survive a reload of the tab (through
       sessionStorage), as Firestore and Firebase Auth do, so a reload is a
       reload and not a fresh tenant.

   What it holds (the review of 2026-09-29, c12–c18, d1/d2), each step in its
   own browser context so one failure never hides the next:
     c18  a stray '%' in a hand-off URL still prefills the ZIP (and the name)
          and the auto-run happens
     c12  a URDB-tariff run saves (the tariff stored as text, no nested
          arrays), a second save works, a refused write says so and does not
          ride along with the next save, and a stored tariff comes back on load
     c17  a partly filled split is refused with a message, nothing is posted
     c13  loading a scenario restores its revenue split, and one saved without
          a split puts back 70 / 20 / 10
     c14  loading an interval scenario restores the unit and clears the file
          picker; the re-run on the same file is the engine's own figure
     c15  bills pasted with US M/D/YYYY dates read the month, not the day;
          a row with no month 1–12 is named, one month three times is said
     c16  another person signing in reloads the page: none of the last
          person's scenarios or result is shown or saved; signing out too
     d1   jo@fenecon.de saves under fenecon.com, the org the server resolved
          (the double refuses toolData/fenecon.de as the rules do)
   and on every page: no uncaught error, no console error, no /api/ call it
   does not answer, no request off the machine, no stray NaN/undefined, and
   no sideways scroll on a desktop or a 390px phone.

     node scripts/render-vpp-earnings.js [--shots DIR]
     npm run check:pages
   Needs the pre-installed Chromium and Playwright; skips cleanly without.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-vpp-earnings: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!CHROME || !fs.existsSync(CHROME)) { console.log('render-vpp-earnings: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || null) : null; })();
if (shotsAt && !fs.existsSync(shotsAt)) fs.mkdirSync(shotsAt, { recursive: true });

/* ── the server: the real endpoint, verify-token stubbed ──────────────── */
var F = require('./_lib/firestore-double');
var VT = require('../api/_lib/verify-token');
var USERS = {
  'u-ana': { email: 'ana@example-energy.com' },
  'u-ben': { email: 'ben@other-power.com' },
  'u-jo': { email: 'jo@fenecon.de' }
};
/* the tenants, as the endpoint's gate reads them (as the caller) and as the
   page's double holds them; the page never writes these */
var ORG_DOCS = {
  'omega_orgs/example-energy.com': { name: 'Example Energy', status: 'active' },
  'omega_orgs/example-energy.com/billing/current': { tier: 'standard' },
  'omega_orgs/other-power.com': { name: 'Other Power', status: 'active' },
  'omega_orgs/other-power.com/billing/current': { tier: 'trial' },
  'omega_orgs/fenecon.com': { name: 'Fenecon', status: 'active' },
  'omega_orgs/fenecon.com/billing/current': { tier: 'enterprise' }
};
F.mock('../api/_lib/verify-token', {
  httpError: VT.httpError, orgOf: VT.orgOf, isStaffEmail: VT.isStaffEmail,
  verifyIdToken: function (token) {
    var m = /^double-token-(.+)$/.exec(String(token || '')), u = m && USERS[m[1]];
    if (!u) return Promise.reject(VT.httpError(401, 'bad token'));
    return Promise.resolve({ uid: m[1], email: u.email, emailVerified: true, orgId: VT.orgOf(u.email), staff: false, claims: {} });
  },
  readAsCaller: function (token, p) { var d = ORG_DOCS[p]; return Promise.resolve(d === undefined ? null : JSON.parse(JSON.stringify(d))); }
});
var ENDPOINT = require('../api/vpp-estimate');
var PROVIDER = require('../api/_lib/vpp-provider');
/* the page's own money(), to read a figure the engine gives as the page draws it */
function money(n) { var v = Math.round(Number(n) || 0); return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US'); }

var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
var apiCalls = [], missing = [], external = [];
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0], post = req.method === 'POST';
  function json(o, status) { res.writeHead(status || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  if (u.indexOf('/api/') === 0) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      var raw = Buffer.concat(chunks).toString('utf8'), body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = raw; }
      apiCalls.push({ route: req.method + ' ' + u, action: body && body.action });
      if (u === '/api/vpp-estimate') {
        var out = { status: 200 };
        var r = {
          setHeader: function (k, v) { res.setHeader(k, v); },
          status: function (n) { out.status = n; return r; },
          json: function (o) { json(o, out.status); return r; }
        };
        return Promise.resolve(ENDPOINT({ method: req.method, headers: req.headers, body: body }, r))
          .catch(function (e) { missing.push('vpp-estimate threw: ' + (e && e.message)); json({ ok: false, error: 'threw' }, 500); });
      }
      /* the shared runtime's own calls: the event layer is off, the workspace is not packaged */
      if (u === '/api/events') return post ? json({ accepted: 0 }, 202) : json({ enabled: false, sampleRate: 0, termsOk: true, excluded: false });
      if (u === '/api/package-access' && !post) return json({ packaged: false });
      missing.push(req.method + ' ' + u);
      json({ error: 'render-vpp-earnings does not answer ' + u }, 404);
    });
    return;
  }
  var f = path.join(ROOT, decodeURIComponent(u === '/' ? '/index.html' : u));
  if (f.indexOf(ROOT + path.sep) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

/* ── fixtures ─────────────────────────────────────────────────────────── */
var DOUBLE_SRC = fs.readFileSync(path.join(__dirname, '_lib', 'firebase-double.js'), 'utf8');
var ANA_DOC = 'toolData/example-energy.com/tools/vppsim';
function withDocs(extra) { var d = JSON.parse(JSON.stringify(ORG_DOCS)); for (var k in extra) d[k] = extra[k]; return d; }
function userOf(uid) { return { uid: uid, email: USERS[uid].email, emailVerified: true, displayName: USERS[uid].email.split('@')[0] }; }
function grid(rows, cols, v) { var g = []; for (var i = 0; i < rows; i++) { var r = []; for (var j = 0; j < cols; j++) r.push(v); g.push(r); } return g; }
function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
function scenario(name, site, gross) { return { name: name, site: site, gross: gross || 1, owner: gross || 1, market: 'PJM', at: '2026-09-29T00:00:00.000Z' }; }
/* an OpenEI URDB record as the engine takes it: arrays inside arrays */
var URDB = { name: 'Render URDB', energyratestructure: [[{ rate: 0.12 }]], energyweekdayschedule: grid(12, 24, 0),
  energyweekendschedule: grid(12, 24, 0), flatdemandstructure: [[{ rate: 18 }]], flatdemandmonths: zeros(12) };
/* one year of fifteen-minute kWh readings: the unit changes the load fourfold */
var INTERVAL_CSV = (function () {
  var out = ['timestamp,kwh'];
  for (var i = 0; i < 35040; i++) { var h = Math.floor(i / 4) % 24; out.push(i + ',' + (h >= 8 && h < 18 ? 14 : 6).toFixed(2)); }
  return out.join('\n');
})();
var US_BILLS = (function () {
  var rows = [];
  for (var m = 1; m <= 12; m++) rows.push(m + '/15/2025\t' + (38000 + m * 900) + '\t' + (150 + (m > 5 && m < 10 ? 40 : 0)) + '\t' + (5200 + m * 110));
  return rows.join('\n');
})();

/* ── the checks ───────────────────────────────────────────────────────── */
var fails = 0, passes = 0;
function ok(name, cond, got) {
  if (cond) { passes++; console.log('  ok   ' + name); }
  else { fails++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got).slice(0, 600) : '')); }
}
function section(t) { console.log('\n' + t); }
function hasNestedArray(v, inArray) {
  if (Array.isArray(v)) { if (inArray) return true; for (var i = 0; i < v.length; i++) if (hasNestedArray(v[i], true)) return true; return false; }
  if (v && typeof v === 'object') { for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k) && hasNestedArray(v[k], false)) return true; }
  return false;
}
function until(fn, ms) {
  var end = Date.now() + (ms || 10000);
  return (function loop() {
    return Promise.resolve().then(fn).then(function (v) {
      if (v) return v;
      if (Date.now() > end) return v;
      return new Promise(function (r) { setTimeout(r, 80); }).then(loop);
    }, function () { if (Date.now() > end) return false; return new Promise(function (r) { setTimeout(r, 80); }).then(loop); });
  })();
}
function parses(v, test) { try { return test(JSON.parse(v)); } catch (e) { return false; } }

/* The init script: the double, strict about nested arrays, persisted across
   a reload of the tab. cfg crosses as JSON. */
function installDouble(cfg) {
  var user = cfg.user, docs = cfg.docs;
  try { var su = window.sessionStorage.getItem('vpp-double:user'); if (su !== null) user = JSON.parse(su); } catch (e) {}
  try { var sd = window.sessionStorage.getItem('vpp-double:docs'); if (sd) docs = JSON.parse(sd); } catch (e) {}
  var h = window.FirebaseDouble.install(window, { user: user, docs: docs, latency: 5, authDomain: '127.0.0.1', failures: cfg.failures || {} });
  function nested(v, inArray) {
    if (Array.isArray(v)) { if (inArray) return true; for (var i = 0; i < v.length; i++) if (nested(v[i], true)) return true; return false; }
    if (v && typeof v === 'object') { for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k) && nested(v[k], false)) return true; }
    return false;
  }
  var proto = Object.getPrototypeOf(h.db.doc('probe/x')), set0 = proto.set;
  proto.set = function (data) {
    /* firebase-firestore-compat 9.x validates inside set() and throws before any promise exists */
    if (nested(data, false)) throw new Error('Function DocumentReference.set() called with invalid data. Nested arrays are not supported (found in document ' + this.path + ')');
    return set0.apply(this, arguments);
  };
  window.addEventListener('pagehide', function () {
    try {
      var me = h.auth.currentUser;
      window.sessionStorage.setItem('vpp-double:docs', JSON.stringify(h.store.docs));
      window.sessionStorage.setItem('vpp-double:user', JSON.stringify(me ? { uid: me.uid, email: me.email, emailVerified: true } : null));
    } catch (e) {}
  });
}

(async function () {
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });

  async function open(opts) {
    var ctx = await browser.newContext({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 },
      isMobile: !!opts.phone, hasTouch: !!opts.phone, deviceScaleFactor: 1 });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, function (route) {
      var url = route.request().url();
      if (/gstatic\.com\/firebasejs\//.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      external.push(url); return route.abort();
    });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(installDouble, { user: opts.user, docs: opts.docs || ORG_DOCS, failures: opts.failures });
    var page = await ctx.newPage(), errs = [];
    page.on('pageerror', function (e) { errs.push('pageerror: ' + e.message); });
    page.on('console', function (m) { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
    page.on('dialog', function (d) { errs.push('dialog: ' + d.message()); d.dismiss().catch(function () {}); });
    return { ctx: ctx, page: page, errs: errs };
  }
  function doc(p, docPath) { return p.evaluate(function (dp) { var s = window.__firebaseDouble.store; return s.has(dp) ? JSON.parse(JSON.stringify(s.docs[dp])) : null; }, docPath); }
  function sideways(p) { return p.evaluate(function () { return document.documentElement.scrollWidth > window.innerWidth + 1; }); }
  function widths(p) { return p.evaluate(function () { return [document.documentElement.scrollWidth, window.innerWidth]; }); }
  function stray(p) { return p.evaluate(function () { var m = /\b(NaN|undefined|\[object Object\])\b/.exec(document.body.innerText); return m ? m[0] : null; }); }
  function val(p, sel) { return p.$eval(sel, function (e) { return e.value; }); }
  function text(p, sel) { return p.$eval(sel, function (e) { return e.textContent; }).catch(function () { return ''; }); }
  function scenNames(p) { return p.$$eval('#scen option', function (os) { return os.map(function (o) { return o.textContent; }); }); }
  function splitNow(p) { return Promise.all([val(p, '#sown'), val(p, '#splat'), val(p, '#sins')]).then(function (a) { return a.join('/'); }); }
  function billMonths(p) { return p.$$eval('#bills input[data-k=month]', function (is) { return is.map(function (i) { return i.value; }); }); }
  function estimates() { return apiCalls.filter(function (c) { return c.action === 'estimate'; }).length; }
  function grossOnPage(p) { return p.$eval('.kpi.hl .v', function (e) { return e.textContent; }).catch(function () { return null; }); }
  async function shot(p, name) { if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'vpp-' + name + '.png'), fullPage: true }); }
  /* Simulate, and wait for the estimate to come back and be drawn */
  async function simulate(p) {
    var before = estimates();
    await p.click('#run');
    var done = await until(function () { return estimates() > before && p.$eval('#run', function (b) { return !b.disabled; }); }, 20000);
    if (!done) throw new Error('Simulate posted no estimate: ' + (await text(p, '#formmsg')));
    await p.waitForTimeout(150);
  }
  /* Save, and what #savemsg settles on ('Saving…' when it never settles) */
  async function saveAs(p) {
    if (await p.$eval('#save', function (b) { return b.disabled; })) return '(Save is disabled)';
    await p.click('#save');
    return until(function () { return text(p, '#savemsg').then(function (t) { return /^(Saved|Could not)/.test(t) ? t : null; }); }, 6000)
      .then(function (t) { return t || text(p, '#savemsg'); });
  }
  async function openDetails(p, summaryText) {
    await p.evaluate(function (s) { [].forEach.call(document.querySelectorAll('details'), function (d) { if (d.querySelector('summary').textContent.indexOf(s) >= 0) d.open = true; }); }, summaryText);
  }
  async function pick(p, name) {
    var i = await p.$$eval('#scen option', function (os, n) { for (var k = 0; k < os.length; k++) if (os[k].textContent.indexOf(n + ' ·') === 0) return os[k].value; return null; }, name);
    if (i == null) throw new Error('no saved scenario named ' + name);
    await p.selectOption('#scen', i);
    await p.waitForTimeout(100);
  }
  async function signedIn(p) { await until(function () { return text(p, '#who').then(function (w) { return !!w; }); }); }
  /* Each step runs in its own browser context; a step that throws is a
     failure with its error, and the run goes on to the next. */
  async function step(name, fn) {
    section(name);
    var t = null;
    try { await fn(function (opts) { return open(opts).then(function (x) { t = x; return x; }); }); }
    catch (e) { ok(name + ': ran to the end', false, String((e && e.message) || e).split('\n')[0]); }
    if (t) {
      ok('no page errors (' + name + ')', !t.errs.length, t.errs);
      await t.ctx.close().catch(function () {});
    }
  }

  /* ── c18 · c12 · c17: the hand-off, a URDB tariff saved twice, the split ── */
  await step('Hand-off, URDB tariff, saving (desktop)', async function (use) {
    var t = await use({ user: userOf('u-ana') }), p = t.page;
    /* c18: a raw '%' the way a link or a person types it; Chromium sends it as 50%%20solar */
    await p.goto(base + '/vpp-earnings.html?zip=60601&segment=commercial&kw=100&kwh=400&name=50% solar', { waitUntil: 'load' });
    var ran = await until(function () { return p.$('.kpis'); }, 20000);
    ok('c18: a stray % in the hand-off URL still fills the ZIP and runs the estimate', !!ran && (await val(p, '#zip')) === '60601', await val(p, '#zip'));
    ok('c18: the name is decoded as far as it can be ("50% solar"), the other fields still apply', (await val(p, '#nm')) === '50% solar' && (await val(p, '#bkw')) === '100', { nm: await val(p, '#nm'), kw: await val(p, '#bkw') });
    await shot(p, 'desktop-handoff');

    /* c12: a URDB tariff run, saved twice */
    await signedIn(p);
    await p.fill('#zip', '60601');
    await openDetails(p, 'Tariff');
    await p.fill('#nm', 'URDB site');
    await p.fill('#urdb', JSON.stringify(URDB));
    await simulate(p);
    var outText = await text(p, '#out');
    ok('c12: the URDB tariff drives the run', /Your tariff: Render URDB/.test(outText), outText.slice(0, 200));
    var msg1 = await saveAs(p);
    var stored = await doc(p, ANA_DOC);
    ok('c12: Save of a URDB-tariff scenario lands (no nested-array throw)', /^Saved to your workspace/.test(msg1) && !!stored, msg1);
    var s0 = stored && stored.data && stored.data.scenarios[0];
    ok('c12: the stored scenario carries the tariff as JSON text, and the document has no array inside an array',
      !!s0 && typeof s0.site.tariff.urdbJson === 'string' && !s0.site.tariff.urdb && parses(s0.site.tariff.urdbJson, function (o) { return o.name === 'Render URDB'; }) && !hasNestedArray(stored, false),
      s0 && s0.site && s0.site.tariff && Object.keys(s0.site.tariff));
    await p.fill('#nm', 'URDB site two');
    await simulate(p);
    var msg2 = await saveAs(p);
    stored = await doc(p, ANA_DOC);
    ok('c12: a second Save in the same session works too', /^Saved to your workspace/.test(msg2) && !!stored && stored.data.scenarios.length === 2, { msg: msg2, n: stored && stored.data.scenarios.length });
    /* a refused write says so and does not ride along with the next save */
    await p.evaluate(function () { window.__firebaseDouble.store.failures['toolData/'] = 'Missing or insufficient permissions.'; });
    await p.fill('#urdb', ''); await p.fill('#nm', 'Refused site');
    await simulate(p);
    var listBefore = (await scenNames(p)).length;
    var msg3 = await saveAs(p);
    await p.evaluate(function () { delete window.__firebaseDouble.store.failures['toolData/']; });
    ok('c12: a refused save says "Could not save right now." and the list is unchanged', msg3 === 'Could not save right now.' && (await scenNames(p)).length === listBefore, { msg: msg3, list: await scenNames(p) });
    await p.fill('#nm', 'After refusal');
    await simulate(p);
    var msg4 = await saveAs(p);
    stored = await doc(p, ANA_DOC);
    var names = stored ? stored.data.scenarios.map(function (x) { return x.name; }) : [];
    ok('c12: the next save stores what was saved before, never the refused record', /^Saved/.test(msg4) && names.indexOf('Refused site') < 0 && names[0] === 'After refusal', { msg: msg4, names: names });

    /* c17: a partly filled split */
    await openDetails(p, 'Revenue split');
    await p.fill('#sown', '80'); await p.fill('#splat', '20'); await p.fill('#sins', '');
    var before17 = estimates();
    await p.click('#run'); await p.waitForTimeout(400);
    var fm = await text(p, '#formmsg'), fmShown = await p.$eval('#formmsg', function (e) { return !e.hidden; });
    ok('c17: a split with a blank share is refused with a message, and nothing is posted', fmShown && /all three revenue shares/i.test(fm) && estimates() === before17, { fm: fm, posted: estimates() - before17 });
    ok('c17: the blank share is marked', await p.$eval('#sins', function (e) { return /\bbad\b/.test(e.className); }));
    await p.fill('#sins', '0');
    await simulate(p);
    ok('c17: filled in (80 / 20 / 0), the split is the one used', /Owner 80%/.test(await text(p, '#out')) && /Installer 0%/.test(await text(p, '#out')));
    ok('no sideways scroll on the desktop', !(await sideways(p)), await widths(p));
    ok('no stray NaN / undefined on the desktop', !(await stray(p)), await stray(p));
  });

  /* ── c13 · c14 · c12 (load): scenarios saved earlier, loaded ─────────── */
  await step('Saved scenarios load their split, unit and tariff (desktop)', async function (use) {
    /* the figure the real engine gives this site: fifteen-minute kWh, split 50 / 40 / 10 */
    var site = { zip: '60601', segment: 'commercial', battery: { kw: 100, kwh: 400 }, load: { type: 'interval', text: INTERVAL_CSV, unit: 'kwh' }, split: { owner: 0.5, platform: 0.4, installer: 0.1 } };
    var asKwSite = JSON.parse(JSON.stringify(site)); asKwSite.load.unit = 'kw';
    var want = await PROVIDER.estimate(site), asKw = await PROVIDER.estimate(asKwSite);
    if (!want || want.ok === false || !asKw || asKw.ok === false) throw new Error('the engine refused the fixture site: ' + JSON.stringify((want && want.errors) || (asKw && asKw.errors)));
    var saved = {}; saved[ANA_DOC] = { data: { v: 1, scenarios: [
      scenario('Interval kWh', { zip: '60601', segment: 'commercial', battery: { kw: 100, kwh: 400 }, load: { type: 'interval', unit: 'kwh' }, split: { owner: 0.5, platform: 0.4, installer: 0.1 } }, want.totals.gross),
      scenario('Plain site', { zip: '19103', segment: 'commercial', load: { type: 'profile', annualKwh: null } }),
      scenario('URDB stored', { zip: '60601', segment: 'commercial', load: { type: 'profile', annualKwh: null }, tariff: { urdbJson: JSON.stringify(URDB) } }),
      scenario('Dated interval', { zip: '60601', segment: 'commercial', load: { type: 'interval', unit: 'kw', startDate: '2025-07-02' } })
    ] } };
    var t = await use({ user: userOf('u-ana'), docs: withDocs(saved) }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await until(function () { return scenNames(p).then(function (n) { return n.length === 5; }); });
    /* the form holds something else first: another split, another unit, a file in the picker */
    await openDetails(p, 'Revenue split');
    await p.fill('#sown', '60'); await p.fill('#splat', '30'); await p.fill('#sins', '10');
    await p.click('[data-mode=interval]');
    await p.selectOption('#iunit', 'kw');
    var file = { name: 'meter-15min.csv', mimeType: 'text/csv', buffer: Buffer.from(INTERVAL_CSV) };
    await p.setInputFiles('#file', file);
    await until(function () { return text(p, '#fileinfo').then(function (x) { return /rows with numbers/.test(x); }); });
    await pick(p, 'Plain site');
    ok('c13: a scenario saved without a split loads 70 / 20 / 10', (await splitNow(p)) === '70/20/10', await splitNow(p));
    await p.fill('#sown', '60'); await p.fill('#splat', '30'); await p.fill('#sins', '10');
    await pick(p, 'Interval kWh');
    ok('c13: loading a scenario restores its revenue split (50 / 40 / 10)', (await splitNow(p)) === '50/40/10', await splitNow(p));
    ok('c14: loading an interval scenario restores the unit (kWh per interval)', (await val(p, '#iunit')) === 'kwh', await val(p, '#iunit'));
    var picker = await p.$eval('#file', function (e) { return { value: e.value, n: e.files ? e.files.length : -1 }; });
    ok('c14: and clears the file picker, so choosing the same file again reads it', picker.value === '' && picker.n === 0, picker);
    await p.setInputFiles('#file', file);
    await until(function () { return text(p, '#fileinfo').then(function (x) { return /rows with numbers/.test(x); }); });
    await simulate(p);
    var rerun = await grossOnPage(p);
    ok('c13/c14: the re-run on the same file is the engine\'s figure for the saved scenario', rerun === money(want.totals.gross), { want: money(want.totals.gross), got: rerun, readAsKw: money(asKw.totals.gross) });
    ok('(the unit matters: read as kW the same file gives another figure)', money(asKw.totals.gross) !== money(want.totals.gross));
    ok('c13: the result shows the saved split', /Owner 50%/.test(await text(p, '#out')) && /Platform 40%/.test(await text(p, '#out')));
    await pick(p, 'URDB stored');
    ok('c12: a URDB tariff stored as text comes back into the form', parses(await val(p, '#urdb'), function (o) { return o.energyratestructure[0][0].rate === 0.12; }), (await val(p, '#urdb')).slice(0, 60));
    await simulate(p);
    ok('c12: and drives the re-run', /Your tariff: Render URDB/.test(await text(p, '#out')));
    /* an undated file's first day (engine c3): saved with the scenario, put back on load, cleared by one without it */
    await pick(p, 'Dated interval');
    ok('c3: loading an interval scenario restores the first-reading date of an undated file', (await val(p, '#istart')) === '2025-07-02', await val(p, '#istart'));
    await pick(p, 'Interval kWh');
    ok('c3: a scenario without one clears it, so it is never sent by mistake', (await val(p, '#istart')) === '', await val(p, '#istart'));
  });

  /* ── c15: bills pasted with US dates ─────────────────────────────────── */
  await step('Bills pasted with US dates (desktop)', async function (use) {
    var t = await use({ user: userOf('u-ana') }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await signedIn(p);
    await p.fill('#zip', '60601');
    await p.click('[data-mode=bills]');
    await openDetails(p, 'Paste from a spreadsheet');
    await p.fill('#paste', US_BILLS);
    await p.click('[data-act=paste]');
    var months = await billMonths(p);
    ok('c15: M/D/YYYY reads the month (1/15/2025 → 2025-01 … 12/15/2025 → 2025-12)', months.join(',') === ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(function (m) { return '2025-' + m; }).join(','), months);
    ok('c15: and says twelve months were read', /^12 month\(s\) read from the paste\.$/.test(await text(p, '#formmsg')), await text(p, '#formmsg'));
    await p.fill('#paste', '7/2025\t41000\t170\t6100\n13/5/2025\t40000\t160\t6000\n2025-08\t42000\t175\t6200\n9/3/25\t43000\t180\t6300');
    await p.click('[data-act=paste]');
    months = await billMonths(p);
    var fm15 = await text(p, '#formmsg');
    ok('c15: a row with no month 1–12 is left out and named; M/YYYY, YYYY-MM and M/D/YY still read', months.join(',') === '2025-07,2025-08,2025-09' && /row 2/.test(fm15) && /13\/5\/2025/.test(fm15), { months: months, msg: fm15 });
    await p.fill('#paste', '5/2025\t41000\t170\t6100\n5/2025\t40000\t160\t6000\n5/2025\t42000\t175\t6200');
    await p.click('[data-act=paste]');
    ok('c15: rows that all land on one month are said', /3 rows cover only 1 month/.test(await text(p, '#formmsg')), await text(p, '#formmsg'));
    await p.fill('#paste', US_BILLS); await p.click('[data-act=paste]');
    await p.fill('#nm', 'Bills site');
    await simulate(p);
    var outText = await text(p, '#out');
    ok('the pasted bills run as twelve months, none filled from the climate curve', /12 month\(s\) of bills/.test(outText) && !/had no bill/.test(outText), outText.slice(0, 200));
    await shot(p, 'desktop-bills');
    ok('no sideways scroll on the desktop (bills)', !(await sideways(p)), await widths(p));
  });

  /* ── c16: another person signs in, in another tab (the session is shared) ── */
  await step('Account switch and sign-out (desktop)', async function (use) {
    var saved = {}; saved[ANA_DOC] = { data: { v: 1, scenarios: [scenario('Ana private site', { zip: '60601', segment: 'commercial', load: { type: 'profile', annualKwh: null } })] } };
    var t = await use({ user: userOf('u-ana'), docs: withDocs(saved) }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await until(function () { return scenNames(p).then(function (n) { return n.length === 2; }); });
    await p.fill('#zip', '60601'); await p.fill('#nm', 'Ana run');
    await simulate(p);
    var anaDoc = JSON.stringify(await doc(p, ANA_DOC));
    var reloaded = p.waitForEvent('load', { timeout: 15000 }).then(function () { return true; }, function () { return false; });
    await p.evaluate(function (u) { window.__firebaseDouble.auth._become(u); }, userOf('u-ben'));
    var didReload = await reloaded;
    await until(function () { return text(p, '#who').then(function (w) { return w === 'ben@other-power.com'; }); });
    await p.waitForTimeout(500);
    var benList = await scenNames(p), benOut = await text(p, '#out');
    ok('c16: another person signing in starts the page again', didReload);
    ok('c16: none of the last person\'s scenarios is listed', benList.length === 1 && !/Ana/.test(benList.join('|')), benList);
    ok('c16: none of the last person\'s result is shown, and Save is off', !/Ana run/.test(benOut) && (await p.$eval('#save', function (b) { return b.disabled; })), benOut.slice(0, 120));
    ok('c16: the market list is drawn once', await p.$$eval('#mkt option', function (os) { var seen = {}, dup = false; os.forEach(function (o) { if (seen[o.value]) dup = true; seen[o.value] = 1; }); return !dup; }));
    await p.fill('#zip', '19103'); await p.fill('#nm', 'Ben site');
    await simulate(p);
    var msgB = await saveAs(p);
    var benDoc = await doc(p, 'toolData/other-power.com/tools/vppsim');
    ok('c16: what the next person saves is theirs alone, under their own org', /^Saved/.test(msgB) && !!benDoc && benDoc.data.scenarios.length === 1 && benDoc.data.scenarios[0].name === 'Ben site', benDoc ? benDoc.data.scenarios.map(function (x) { return x.name; }) : msgB);
    ok('c16: the last person\'s saved list is untouched', JSON.stringify(await doc(p, ANA_DOC)) === anaDoc);
    reloaded = p.waitForEvent('load', { timeout: 15000 }).then(function () { return true; }, function () { return false; });
    await p.evaluate(function () { window.__firebaseDouble.auth.signOut(); });
    ok('c16: signing out starts the page again', await reloaded);
    var out = await until(function () { return text(p, '#out').then(function (x) { return /You are signed out/.test(x) ? x : null; }); }, 15000);
    ok('c16: and it reads signed out, with nothing of the last person on it', !!out && !/Ben site/.test(out) && (await scenNames(p)).length === 1, out || (await text(p, '#out')).slice(0, 120));
  });

  /* ── d1/d2: an aliased address saves under the org the server resolved ── */
  await step('Org alias (fenecon.de → fenecon.com)', async function (use) {
    var t = await use({ user: userOf('u-jo'), failures: { 'toolData/fenecon.de': 'Missing or insufficient permissions.' } }), p = t.page;
    await p.goto(base + '/vpp-earnings.html?zip=02139&segment=commercial&name=Fenecon%20site', { waitUntil: 'load' });
    await until(function () { return p.$('.kpis'); }, 20000);
    await until(function () { return p.$eval('#save', function (b) { return !b.disabled; }); }, 5000);
    var msgJ = await saveAs(p);
    var jDoc = await doc(p, 'toolData/fenecon.com/tools/vppsim');
    ok('d1: jo@fenecon.de saves under fenecon.com, the org the server resolved', /^Saved/.test(msgJ) && !!jDoc && jDoc.data.scenarios[0].name === 'Fenecon site', msgJ);
    ok('d1: nothing is written under the raw email domain', !(await doc(p, 'toolData/fenecon.de/tools/vppsim')));
  });

  /* ── a 390px phone ───────────────────────────────────────────────────── */
  await step('Phone (390px)', async function (use) {
    var t = await use({ user: userOf('u-ana'), phone: true }), p = t.page;
    await p.goto(base + '/vpp-earnings.html?zip=60601&segment=industrial&kw=500&kwh=2000&solar=300&name=Phone%20site', { waitUntil: 'load' });
    await until(function () { return p.$('.kpis'); }, 20000);
    await p.waitForTimeout(300);
    ok('the hand-off runs on a phone', !!(await p.$('.kpis')));
    ok('no sideways scroll on a 390px phone (result drawn)', !(await sideways(p)), await widths(p));
    await p.click('[data-mode=bills]');
    await openDetails(p, 'Paste'); await openDetails(p, 'Tariff'); await openDetails(p, 'Revenue split');
    await p.waitForTimeout(150);
    ok('no sideways scroll on a 390px phone (bills, tariff and split open)', !(await sideways(p)), await widths(p));
    ok('no stray NaN / undefined on the phone', !(await stray(p)), await stray(p));
    await shot(p, 'phone');
  });

  section('Traffic');
  ok('every /api/ call was answered', !missing.length, missing);
  ok('nothing left the machine', !external.length, external.slice(0, 10));

  await browser.close(); srv.close();
  console.log('\n' + passes + ' passed, ' + fails + ' failed');
  console.log(fails ? 'render-vpp-earnings: ' + fails + ' FAILED' : 'render-vpp-earnings: every check passed. No network calls.');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
