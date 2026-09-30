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
   And one thing a slow network does: a read or write of toolData/ can be
   held until the check releases it (window.__vppHold, __vppRelease).

   What it holds (the reviews of 2026-09-29, c12–c18, d1/d2, then R15, R16,
   S3 and the size cap), each step in its own browser context so one failure
   never hides the next:
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
     R16  the first-reading date: a malformed one is refused with nothing
          posted, a good one is POSTED with the file and named in the
          result, SAVED with the scenario (never the file) and put back
     R15  loading a profile scenario blanks the date, unit and file, and an
          undated file run after it posts no date
     size the page's file check is the server's cap in the server's measure:
          4,300,000 characters read, one more refused with nothing posted
     T11  what is measured is what is POSTED, the JSON body in UTF-8 bytes,
          against 4,400,000 (under Vercel's 4.5 MB): a quoted CRLF file under
          the character cap, a file of two-byte characters, and a file that
          fits alone with a tariff that tips the body over are each refused
          with the limit named and nothing posted; one under it is posted
     col  "Which column is the load?" (the interval contract): the server's
          refusal (field load.column, with columns) shows a chooser with each
          column's samples; the pick is posted as load.column and named in
          the result; it is saved with the scenario (never the file) and
          put back; a new file clears it; an unknown column asks again.
          The render server STUBS that refusal for one fixture only (its
          header is CHOOSER_HEAD) and answers the pick with the real engine
          on that column; a second case sends a genuinely ambiguous file
          through the REAL engine ('needs the engine's column contract':
          it fails until api/_lib/vpp-sim.js implements the contract)
     S3   Save writes the whole list, so it never writes over a stored list
          it has not read: a refused read is said and read again on Save, a
          slow one makes Save wait (the hand-off's auto-run included), and a
          save still on its way makes the next one wait
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
      /* an estimate's load is kept as it was posted, its file as a length */
      var L = body && body.site && body.site.load, load = null;
      if (L && typeof L === 'object') { load = {}; for (var lk in L) load[lk] = lk === 'text' ? (typeof L.text === 'string' ? L.text.length : L.text) : L[lk]; }
      apiCalls.push({ route: req.method + ' ' + u, action: body && body.action, load: load });
      if (u === '/api/vpp-estimate') {
        var out = { status: 200 }, picked = null;
        /* the chooser fixture (and only it): the refusal the engine gives an
           ambiguous file under the interval contract, then the pick answered
           by the real engine on that one column */
        if (L && L.type === 'interval' && typeof L.text === 'string' && L.text.split(/\r?\n/, 1)[0].indexOf('Date,Main Meter kW,') === 0) {   /* the fixture, or its long-name variant */
          var cols = chooserColumns(L.text);
          picked = null;
          for (var ci = 0; ci < cols.length; ci++) if (cols[ci].key === L.column) picked = cols[ci];
          if (!picked) return json({ ok: false, errors: [{ field: 'load.column', message: 'Which column is the load? This file has two that could be: Main Meter kW and Sub Meter kW.', columns: cols }] }, 400);
          body.site.load.text = oneColumn(L.text, picked.index);
        }
        var r = {
          setHeader: function (k, v) { res.setHeader(k, v); },
          status: function (n) { out.status = n; return r; },
          json: function (o) {
            if (picked && o && o.result && o.result.load && !o.result.load.column) o.result.load.column = { key: picked.key, label: picked.label, chosen: 'caller' };
            json(o, out.status); return r;
          }
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
/* an hourly year, dated, with the given header and a row's cells after the date */
function hourlyCsv(head, cells, eol) {
  var out = [head];
  for (var d = 0; d < 365; d++) for (var h = 0; h < 24; h++) {
    var dt = new Date(Date.UTC(2025, 0, 1 + d, h));
    out.push(dt.toISOString().slice(0, 10) + ' ' + (h < 10 ? '0' : '') + h + ':00,' + cells(h));
  }
  return out.join(eol || '\n');
}
/* the chooser fixture: the render server answers it with the contract's refusal */
var CHOOSER_HEAD = 'Date,Main Meter kW,Sub Meter kW';
var CHOOSER_CSV = hourlyCsv(CHOOSER_HEAD, function (h) { return (h >= 8 && h < 18 ? 80 : 30) + ',' + (h >= 13 && h < 18 ? 22 : 9); });
function chooserColumns(text) {
  var lines = text.split(/\r?\n/), head = lines[0].split(','), out = [];
  for (var c = 1; c < head.length; c++) out.push({ key: head[c], label: head[c], index: c, sample: lines.slice(1, 4).map(function (l) { return l.split(',')[c]; }) });
  return out.map(function (x) { return { key: x.key, label: x.label, sample: x.sample, index: x.index }; });
}
function oneColumn(text, c) { return text.split(/\r?\n/).map(function (l) { var a = l.split(','); return a[0] + ',' + a[c]; }).join('\n'); }
/* genuinely ambiguous, through the REAL engine: two load-named columns */
var AMBIGUOUS_CSV = hourlyCsv('Date,Site kW,Chiller kW', function (h) { return (h >= 8 && h < 18 ? 60 : 25) + ',' + (h >= 12 && h < 17 ? 30 : 5); });
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
  /* A slow network, on the check's say-so: a read or a write of toolData/
     waits while hold.read / hold.write is on (a read from the first page
     load when cfg.holdRead), until window.__vppRelease(); hold.reads counts
     the reads of toolData/ the page started. */
  var hold = window.__vppHold = { read: !!cfg.holdRead, write: false, reads: 0, waiting: [] };
  window.__vppRelease = function () { var w = hold.waiting; hold.waiting = []; hold.read = hold.write = false; w.forEach(function (go) { go(); }); };
  function held(kind, docPath, go) {
    if (String(docPath).indexOf('toolData/') !== 0) return go();
    if (kind === 'read') hold.reads++;
    if (!hold[kind]) return go();
    return new Promise(function (ok) { hold.waiting.push(ok); }).then(go);
  }
  var proto = Object.getPrototypeOf(h.db.doc('probe/x')), set0 = proto.set, get0 = proto.get;
  proto.set = function (data) {
    /* firebase-firestore-compat 9.x validates inside set() and throws before any promise exists */
    if (nested(data, false)) throw new Error('Function DocumentReference.set() called with invalid data. Nested arrays are not supported (found in document ' + this.path + ')');
    var self = this, args = arguments;
    return held('write', this.path, function () { return set0.apply(self, args); });
  };
  proto.get = function () {
    var self = this, args = arguments;
    return held('read', this.path, function () { return get0.apply(self, args); });
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
    await ctx.addInitScript(installDouble, { user: opts.user, docs: opts.docs || ORG_DOCS, failures: opts.failures, holdRead: !!opts.holdRead });
    var page = await ctx.newPage(), errs = [];
    page.on('pageerror', function (e) { errs.push('pageerror: ' + e.message); });
    page.on('console', function (m) {
      if (m.type() !== 'error') return;
      /* a step that expects the estimate refused (400) says so; nothing else is let through */
      var at = (m.location() && m.location().url) || '';
      if (opts.estimate400 && /status of 400/.test(m.text()) && /\/api\/vpp-estimate$/.test(at)) return;
      errs.push('console: ' + m.text().slice(0, 300));
    });
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
  /* the load of the last estimate posted, as the server received it */
  function lastLoad() { var e = apiCalls.filter(function (c) { return c.action === 'estimate'; }); return e.length ? e[e.length - 1].load : null; }
  function storedNames(p) { return doc(p, ANA_DOC).then(function (d) { return d && d.data ? d.data.scenarios.map(function (x) { return x.name; }) : null; }); }
  function writesTo(p, docPath) { return p.evaluate(function (dp) { return window.__firebaseDouble.store.log.filter(function (w) { return w.path === dp; }).length; }, docPath); }
  function readsStarted(p) { return p.evaluate(function () { return window.__vppHold.reads; }); }
  /* press Save and wait for #savemsg to match (its text, or what it held when the wait ran out) */
  async function pressSave(p, re, ms) {
    await p.click('#save');
    return until(function () { return text(p, '#savemsg').then(function (t) { return re.test(t) ? t : null; }); }, ms || 6000)
      .then(function (t) { return t || text(p, '#savemsg'); });
  }
  /* an interval file of exactly n characters (ASCII: as many bytes) */
  function sizedCsv(n, line) {
    var head = 'timestamp,kw,note\n', s;
    /* long rows by default: one escaped line break per 100 characters, so a
       file at the character cap is also under the byte limit once posted */
    line = line || ('1,5.00,' + new Array(93).join('x') + '\n');
    s = head + line.repeat(Math.floor((n - head.length) / line.length));
    return s + 'x'.repeat(n - s.length);
  }
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
    /* an undated file's first day (engine c3): put back on load, cleared by an
       interval scenario without one (a profile scenario, what is posted and
       what is stored: the 'First-reading date' step below) */
    await pick(p, 'Dated interval');
    ok('c3: loading an interval scenario restores the first-reading date of an undated file', (await val(p, '#istart')) === '2025-07-02', await val(p, '#istart'));
    await pick(p, 'Interval kWh');
    ok('c3: an interval scenario without one clears it', (await val(p, '#istart')) === '', await val(p, '#istart'));
  });

  /* ── R15 · R16 · size: the first-reading date sent, saved, put back and
        never carried over; the file-size check is the server's cap ──── */
  await step('First-reading date and file size (desktop)', async function (use) {
    var saved = {}; saved[ANA_DOC] = { data: { v: 1, scenarios: [scenario('Plain site', { zip: '19103', segment: 'commercial', load: { type: 'profile', annualKwh: null } })] } };
    var t = await use({ user: userOf('u-ana'), docs: withDocs(saved) }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await until(function () { return scenNames(p).then(function (n) { return n.length === 2; }); });
    await p.fill('#zip', '60601'); await p.fill('#nm', 'Dated site'); await p.fill('#bkw', '100'); await p.fill('#bkwh', '400');
    await p.click('[data-mode=interval]');
    await p.selectOption('#iunit', 'kwh');
    var file = { name: 'meter-undated.csv', mimeType: 'text/csv', buffer: Buffer.from(INTERVAL_CSV) };
    function rowsRead() { return until(function () { return text(p, '#fileinfo').then(function (x) { return /rows with numbers/.test(x) ? x : null; }); }); }
    await p.setInputFiles('#file', file);
    await rowsRead();
    await p.fill('#istart', '2025/07/02');
    var before = estimates();
    await p.click('#run'); await p.waitForTimeout(400);
    ok('R16: a first-reading date not written YYYY-MM-DD is refused, and nothing is posted', (await text(p, '#formmsg')) === 'The first reading date is YYYY-MM-DD.' && estimates() === before, { msg: await text(p, '#formmsg'), posted: estimates() - before });
    await p.fill('#istart', '2025-07-02');
    await simulate(p);
    var sent = lastLoad();
    ok('R16: the estimate posts the first-reading date with the file and its unit', !!sent && sent.type === 'interval' && sent.startDate === '2025-07-02' && sent.unit === 'kwh' && sent.text === INTERVAL_CSV.length, sent);
    ok('R16: and the result says the readings were laid from 2 Jul 2025', /Your readings start on 2 Jul 2025/.test(await text(p, '#out')), (await text(p, '#out')).slice(0, 200));
    var msg = await saveAs(p);
    var stored = await doc(p, ANA_DOC), s0 = stored && stored.data.scenarios[0];
    ok('R16: Save keeps the date and the unit with the scenario, never the file', /^Saved to your workspace/.test(msg) && !!s0 && s0.name === 'Dated site' && s0.site.load.startDate === '2025-07-02' && s0.site.load.unit === 'kwh' && !('text' in s0.site.load), { msg: msg, load: s0 && s0.site.load });
    ok('the saved list is the new scenario and the one stored before', stored.data.scenarios.map(function (x) { return x.name; }).join() === 'Dated site,Plain site');
    await pick(p, 'Plain site');
    var cleared = { start: await val(p, '#istart'), unit: await val(p, '#iunit'), files: await p.$eval('#file', function (e) { return e.files.length; }), info: await text(p, '#fileinfo') };
    ok('R15: loading a scenario without a file clears the first-reading date, and the unit and file it went with', cleared.start === '' && cleared.unit === 'kw' && cleared.files === 0 && cleared.info === '', cleared);
    await pick(p, 'Dated site');
    ok('R16: loading the saved scenario puts its date and unit back', (await val(p, '#istart')) === '2025-07-02' && (await val(p, '#iunit')) === 'kwh', { start: await val(p, '#istart'), unit: await val(p, '#iunit') });
    await pick(p, 'Plain site');
    await p.click('[data-mode=interval]');
    await p.setInputFiles('#file', file);
    await rowsRead();
    await simulate(p);
    sent = lastLoad();
    ok('R15: an undated file run after it posts no date the person did not give, and is read from 1 January', !!sent && sent.type === 'interval' && !('startDate' in sent) && /read as starting on 1 January/.test(await text(p, '#out')), sent);

    /* the page's file check is the server's cap (vpp-sim MAX_TEXT), in the server's measure: characters.
       The two numbers are read off the sources, so a change to one without the other fails here. */
    var pageCap = /\nvar MAX_TEXT = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'vpp-earnings.html'), 'utf8'));
    ok('size: the page\'s cap is the engine\'s cap (vpp-sim MAX_TEXT)', !!pageCap && +pageCap[1] === require(path.join(ROOT, 'api', '_lib', 'vpp-sim')).MAX_TEXT, pageCap && pageCap[1]);
    await p.setInputFiles('#file', { name: 'at-cap.csv', mimeType: 'text/csv', buffer: Buffer.from(sizedCsv(4300000)) });
    var readAtCap = await rowsRead();
    ok('size: a file of 4,300,000 characters, the server\'s cap, is read and not refused', !!readAtCap, await text(p, '#fileinfo'));
    await p.setInputFiles('#file', { name: 'over-cap.csv', mimeType: 'text/csv', buffer: Buffer.from(sizedCsv(4300001)) });
    var refused = await until(function () { return text(p, '#fileinfo').then(function (x) { return /4,300,000 characters/.test(x) ? x : null; }); });
    before = estimates();
    await p.click('#run'); await p.waitForTimeout(600);
    ok('size: one character more is refused, the limit named, and nothing is posted', !!refused && /4,300,000 characters/.test(await text(p, '#formmsg')) && estimates() === before, { info: await text(p, '#fileinfo'), msg: await text(p, '#formmsg'), posted: estimates() - before });
  });

  /* ── T11: the size is what is POSTED (the JSON body, UTF-8 bytes) ──── */
  await step('Request size is the posted body (desktop)', async function (use) {
    var t = await use({ user: userOf('u-ana'), estimate400: true }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await signedIn(p);
    await p.fill('#zip', '60601');
    await p.click('[data-mode=interval]');
    var pageSrc = fs.readFileSync(path.join(ROOT, 'vpp-earnings.html'), 'utf8');
    ok('T11: the page measures against 4,400,000 bytes', /\nvar MAX_BODY = 4400000;/.test(pageSrc));
    async function refusedUnposted(name, buf, want) {
      await p.setInputFiles('#file', { name: name, mimeType: 'text/csv', buffer: buf });
      await until(function () { return text(p, '#fileinfo').then(function (x) { return x ? x : null; }); });
      var before = estimates();
      await p.click('#run'); await p.waitForTimeout(700);
      return { info: await text(p, '#fileinfo'), msg: await text(p, '#formmsg'), posted: estimates() - before, want: want };
    }
    /* a quoted, CRLF year under the character cap: every quote and line break is escaped in the body */
    var rowQ = '"2025-01-01 00:00","5.00","A","B","C"\r\n', quoted = 'Date,kW,a,b,c\r\n' + rowQ.repeat(Math.floor(4150000 / rowQ.length));
    var q = await refusedUnposted('quoted-crlf.csv', Buffer.from(quoted), quoted.length);
    ok('T11: a quoted CRLF file under 4,300,000 characters (' + quoted.length.toLocaleString('en-US') + ') whose body is over 4.4 MB is refused, the limit named, nothing posted',
      quoted.length <= 4300000 && q.posted === 0 && /4,400,000 bytes/.test(q.msg), q);
    /* two-byte characters: the body has fewer than 4.4 million characters and more than 4.4 million bytes */
    var rowU = '1,5.00,' + 'é'.repeat(10) + '\n', wide = 'timestamp,kw,note\n' + rowU.repeat(Math.floor(3000000 / rowU.length));
    var w = await refusedUnposted('utf8-notes.csv', Buffer.from(wide, 'utf8'), JSON.stringify(wide).length);
    ok('T11: the body is measured in UTF-8 bytes, not characters (' + JSON.stringify(wide).length.toLocaleString('en-US') + ' characters, ' + Buffer.byteLength(JSON.stringify(wide)).toLocaleString('en-US') + ' bytes): refused, nothing posted',
      JSON.stringify(wide).length < 4400000 && w.posted === 0 && /4,400,000 bytes/.test(w.msg), w);
    /* a file that fits alone (4.33 MB escaped), and a pasted tariff that tips the whole body over */
    var fits = sizedCsv(3790000, '1,5.00\n');
    await p.setInputFiles('#file', { name: 'fits-alone.csv', mimeType: 'text/csv', buffer: Buffer.from(fits) });
    var readFits = await until(function () { return text(p, '#fileinfo').then(function (x) { return /rows with numbers/.test(x) ? x : null; }); });
    ok('(the file alone is under the limit once escaped, and is read)', !!readFits && Buffer.byteLength(JSON.stringify(fits)) < 4400000, { info: await text(p, '#fileinfo'), bytes: Buffer.byteLength(JSON.stringify(fits)) });
    await openDetails(p, 'Tariff');
    var bigUrdb = JSON.parse(JSON.stringify(URDB)); bigUrdb.name = 'Padded ' + new Array(120001).join('p');
    await p.fill('#urdb', JSON.stringify(bigUrdb));
    var before = estimates();
    await p.click('#run'); await p.waitForTimeout(700);
    var fm = await text(p, '#formmsg');
    ok('T11: the whole body is measured: the file with a large tariff is over, refused with the limit named, nothing posted', estimates() === before && /4,400,000 bytes/.test(fm), { msg: fm, posted: estimates() - before });
    await p.fill('#urdb', '');
    before = estimates();
    await p.click('#run');
    var posted = await until(function () { return estimates() > before && p.$eval('#run', function (b) { return !b.disabled; }); }, 30000);
    ok('T11: without the tariff the same file is under the limit and is posted', !!posted && lastLoad() && lastLoad().text === fits.length, { posted: estimates() - before, msg: await text(p, '#formmsg') });
  });

  /* ── col: "Which column is the load?" (the interval contract) ─────────── */
  await step('Which column is the load (stubbed refusal, desktop)', async function (use) {
    var subSite = { zip: '60601', segment: 'commercial', battery: { kw: 100, kwh: 400 }, load: { type: 'interval', text: oneColumn(CHOOSER_CSV, 2), unit: 'kw', column: 'Sub Meter kW' } };
    var want = await PROVIDER.estimate(subSite);
    if (!want || want.ok === false) throw new Error('the engine refused the Sub Meter column: ' + JSON.stringify(want && want.errors));
    var saved = {}; saved[ANA_DOC] = { data: { v: 1, scenarios: [
      scenario('Gone column', { zip: '60601', segment: 'commercial', battery: { kw: 100, kwh: 400 }, load: { type: 'interval', unit: 'kw', column: 'Gone kW' } })
    ] } };
    var t = await use({ user: userOf('u-ana'), docs: withDocs(saved), estimate400: true }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await until(function () { return scenNames(p).then(function (n) { return n.length === 2; }); });
    await p.fill('#zip', '60601'); await p.fill('#nm', 'Two meters'); await p.fill('#bkw', '100'); await p.fill('#bkwh', '400');
    await p.click('[data-mode=interval]');
    var fixture = { name: 'two-meters.csv', mimeType: 'text/csv', buffer: Buffer.from(CHOOSER_CSV) };
    function rowsRead() { return until(function () { return text(p, '#fileinfo').then(function (x) { return /rows with numbers/.test(x) ? x : null; }); }); }
    function chooser() { return p.evaluate(function () { var b = document.getElementById('colpick'); return { shown: !b.hidden, text: b.textContent, radios: [].map.call(b.querySelectorAll('input[name=loadcol]'), function (i) { return { v: i.value, on: i.checked }; }) }; }); }
    async function runAndWait() {
      var before = estimates(); await p.click('#run');
      await until(function () { return estimates() > before && p.$eval('#run', function (b) { return !b.disabled; }); }, 20000);
      await p.waitForTimeout(150);
    }
    await p.setInputFiles('#file', fixture); await rowsRead();
    await runAndWait();
    var c1 = await chooser();
    ok('col: the refusal shows "Which column is the load?" in the interval panel, each column with its sample values',
      c1.shown && /Which column is the load\?/.test(c1.text) && c1.radios.map(function (r) { return r.v; }).join() === 'Main Meter kW,Sub Meter kW' && /e\.g\. 30 · 30 · 30/.test(c1.text) && /e\.g\. 9 · 9 · 9/.test(c1.text) && !c1.radios.some(function (r) { return r.on; }), c1);
    ok('col: the first post named no column, and no result is drawn', !('column' in (lastLoad() || {})) && !(await p.$('.kpis')) && /Which column is the load/.test(await text(p, '#formmsg')), { load: lastLoad(), msg: await text(p, '#formmsg') });
    await p.click('input[name=loadcol][value="Sub Meter kW"]');
    var beforePick = estimates();
    /* three taps before the answer: one estimate */
    await p.evaluate(function () { var b = document.querySelector('[data-act=use-column]'); b.click(); b.click(); b.click(); });
    await until(function () { return p.$('.kpis'); }, 20000); await p.waitForTimeout(300);
    ok('col: tapping "Use this column" three times posts one estimate', estimates() === beforePick + 1, { posts: estimates() - beforePick });
    ok('col: the pick is posted as load.column', (lastLoad() || {}).column === 'Sub Meter kW', lastLoad());
    var cDone = await chooser();
    ok('col: once the picked column is read, the question closes to one line naming it', cDone.radios.length === 0 && /Load column: Sub Meter kW\s*Change/.test(cDone.text), cDone.text.slice(0, 120));
    await p.click('[data-act=change-column]');
    var cBack = await chooser();
    ok('col: Change brings the question back with the pick selected', cBack.radios.length === 2 && cBack.radios.some(function (r) { return r.v === 'Sub Meter kW' && r.on; }), cBack);
    /* a pick made while an estimate is on its way is refused, never swapped in silently */
    await p.evaluate(function () { document.getElementById('run').disabled = true; });
    await p.click('input[name=loadcol][value="Main Meter kW"]');
    var beforeBusy = estimates();
    await p.click('[data-act=use-column]');
    ok('col: a pick while simulating is refused with a message, and the page still names the column posted', estimates() === beforeBusy && /Still simulating/.test(await text(p, '#formmsg')) && /load column: Sub Meter kW/.test(await text(p, '#fileinfo')), { posts: estimates() - beforeBusy, msg: await text(p, '#formmsg'), info: await text(p, '#fileinfo') });
    await p.evaluate(function () { document.getElementById('run').disabled = false; });
    /* Change, tick another column, then the main Simulate button: the tick is the column */
    await p.click('input[name=loadcol][value="Main Meter kW"]');
    /* Simulate, then "Use this column" while that estimate is on its way (the warning), then the answer */
    var beforeMain = estimates();
    var midMsg = await p.evaluate(function () { document.getElementById('run').click(); document.querySelector('[data-act=use-column]').click(); return document.getElementById('formmsg').textContent; });
    await until(function () { return estimates() > beforeMain && p.$eval('#run', function (b) { return !b.disabled; }); }, 20000);
    await p.waitForTimeout(150);
    ok('col: "Use this column" during an estimate says it is still simulating', /Still simulating/.test(midMsg) && estimates() === beforeMain + 1, { midMsg: midMsg, posts: estimates() - beforeMain });
    var cMain = await chooser();
    ok('col: after Change, a new tick and Simulate post the ticked column, and the line names it', (lastLoad() || {}).column === 'Main Meter kW' && /Load column: Main Meter kW/.test(cMain.text) &&
       /load column: Main Meter kW/.test(await text(p, '#fileinfo')) && /Column read: Main Meter kW/.test(await text(p, '#out')), { load: lastLoad(), line: cMain.text, info: await text(p, '#fileinfo') });
    ok('col: and the "still simulating" word is gone once the estimate is back', await p.$eval('#formmsg', function (e) { return e.hidden; }), await text(p, '#formmsg'));
    /* back to the scenario's column, by keyboard: focus follows the controls it replaces */
    await p.focus('[data-act=change-column]'); await p.keyboard.press('Enter');
    var focused = await p.evaluate(function () { var a = document.activeElement; return a && a.name === 'loadcol' ? a.value : (a && a.tagName); });
    ok('col: Change by keyboard puts focus on the ticked column', focused === 'Main Meter kW', focused);
    await p.click('input[name=loadcol][value="Sub Meter kW"]');
    await p.focus('[data-act=use-column]'); await p.keyboard.press('Enter');
    await until(function () { return p.$eval('#colpick', function (b) { return /Load column: Sub Meter kW/.test(b.textContent); }); }, 20000);
    var focused2 = await p.evaluate(function () { var a = document.activeElement; return a && a.getAttribute('data-act'); });
    ok('col: "Use this column" by keyboard leaves focus on Change, not the page', focused2 === 'change-column', focused2);
    ok('col: the result says which column was read', /Column read: Sub Meter kW \(your pick\)/.test(await text(p, '#out')), (await text(p, '#out')).slice(0, 300));
    ok('col: and is the engine\'s figure for that column', (await grossOnPage(p)) === money(want.totals.gross), { want: money(want.totals.gross), got: await grossOnPage(p) });
    var msg = await saveAs(p);
    var stored = await doc(p, ANA_DOC), s0 = stored && stored.data.scenarios[0];
    ok('col: Save keeps the column with the scenario, never the file', /^Saved/.test(msg) && !!s0 && s0.name === 'Two meters' && s0.site.load.column === 'Sub Meter kW' && !('text' in s0.site.load), { msg: msg, load: s0 && s0.site.load });
    /* a new file clears the choice */
    await p.setInputFiles('#file', { name: 'one-column.csv', mimeType: 'text/csv', buffer: Buffer.from(INTERVAL_CSV) }); await rowsRead();
    var c2 = await chooser();
    await runAndWait();
    ok('col: a new file clears the choice: the chooser goes and no column is posted', !c2.shown && !('column' in (lastLoad() || {})) && !/your pick/.test(await text(p, '#out')) && /Column read: .*\(picked by its header\)/.test(await text(p, '#out')), { chooser: c2.shown, load: lastLoad(), out: (await text(p, '#out')).slice(0, 200) });
    /* the saved scenario puts the column back, for its file attached again */
    await pick(p, 'Two meters');
    ok('col: loading the scenario names its load column', /load column: Sub Meter kW/.test(await text(p, '#fileinfo')), await text(p, '#fileinfo'));
    await p.setInputFiles('#file', fixture); await rowsRead();
    await runAndWait();
    ok('col: its file attached again is read on that column, with no question asked', (lastLoad() || {}).column === 'Sub Meter kW' && !(await chooser()).radios.length && /Column read: Sub Meter kW/.test(await text(p, '#out')) && (await grossOnPage(p)) === money(want.totals.gross), { load: lastLoad(), gross: await grossOnPage(p) });
    /* a column the file does not have asks again, with nothing picked */
    await pick(p, 'Gone column');
    await p.setInputFiles('#file', fixture); await rowsRead();
    await runAndWait();
    var c3 = await chooser();
    ok('col: a saved column the file does not have is refused the same way, and the chooser asks with nothing picked', (lastLoad() || {}).column === 'Gone kW' && c3.shown && c3.radios.length === 2 && !c3.radios.some(function (r) { return r.on; }), { load: lastLoad(), chooser: c3 });
    ok('col: and the file line no longer names the refused column', !/Gone kW/.test(await text(p, '#fileinfo')) && /rows with numbers/.test(await text(p, '#fileinfo')), await text(p, '#fileinfo'));
    await runAndWait();
    ok('col: and the unknown column is not posted again', !('column' in (lastLoad() || {})), lastLoad());
    ok('no stray NaN / undefined (chooser)', !(await stray(p)), await stray(p));
    await shot(p, 'desktop-chooser');
  });
  await step('Which column is the load (phone, 390px)', async function (use) {
    var t = await use({ user: userOf('u-ana'), phone: true, estimate400: true }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await signedIn(p);
    await p.fill('#zip', '60601');
    await p.click('[data-mode=interval]');
    await p.setInputFiles('#file', { name: 'two-meters.csv', mimeType: 'text/csv', buffer: Buffer.from(CHOOSER_CSV) });
    await until(function () { return text(p, '#fileinfo').then(function (x) { return /rows with numbers/.test(x); }); });
    await p.click('#run');
    var shown = await until(function () { return p.$eval('#colpick', function (b) { return !b.hidden; }); }, 20000);
    ok('col: the chooser shows on a phone', !!shown);
    ok('no sideways scroll on a 390px phone (chooser open)', !(await sideways(p)), await widths(p));
    /* a long column name, read and collapsed to one line, still fits */
    var LONG = 'SubMeterChillerPlantNorthWingConsumptionKilowattHoursRecorded';
    await p.setInputFiles('#file', { name: 'long-names.csv', mimeType: 'text/csv', buffer: Buffer.from(CHOOSER_CSV.replace('Sub Meter kW', LONG)) });
    await until(function () { return text(p, '#fileinfo').then(function (x) { return /rows with numbers/.test(x); }); });
    await p.click('#run');
    await until(function () { return p.$('input[name=loadcol][value="' + LONG + '"]'); }, 20000);
    await p.click('input[name=loadcol][value="' + LONG + '"]');
    await p.click('[data-act=use-column]');
    await until(function () { return p.$('.kpis'); }, 20000);
    var wide = await p.evaluate(function () { return document.documentElement.scrollWidth; });
    ok('no sideways scroll on a 390px phone (a long column name, collapsed)', wide <= 390 && /Load column: SubMeter/.test(await text(p, '#colpick')), { scrollWidth: wide });
  });
  /* The REAL engine on a genuinely ambiguous file. It passes once
     api/_lib/vpp-sim.js implements the interval contract (field load.column
     with columns; result.load.column); until then it fails, by design. */
  await step('Which column is the load (real engine: needs the engine\'s column contract)', async function (use) {
    var site = { zip: '60601', segment: 'commercial', battery: { kw: 50, kwh: 200 }, load: { type: 'interval', text: AMBIGUOUS_CSV, unit: 'kw' } };
    var refusal = await PROVIDER.estimate(site);
    var t = await use({ user: userOf('u-ana'), estimate400: true }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await signedIn(p);
    await p.fill('#zip', '60601'); await p.fill('#bkw', '50'); await p.fill('#bkwh', '200');
    await p.click('[data-mode=interval]');
    await p.setInputFiles('#file', { name: 'site-and-chiller.csv', mimeType: 'text/csv', buffer: Buffer.from(AMBIGUOUS_CSV) });
    await until(function () { return text(p, '#fileinfo').then(function (x) { return /rows with numbers/.test(x); }); });
    var before = estimates();
    await p.click('#run');
    await until(function () { return estimates() > before && p.$eval('#run', function (b) { return !b.disabled; }); }, 20000);
    var shown = await until(function () { return p.$eval('#colpick', function (b) { return !b.hidden; }); }, 3000);
    ok('col [needs the engine\'s column contract]: the real engine refuses an ambiguous file with field load.column and its columns, and the page asks',
      !!shown && refusal && refusal.ok === false && refusal.errors[0].field === 'load.column' && Array.isArray(refusal.errors[0].columns),
      { engine: refusal && refusal.errors, msg: await text(p, '#formmsg') });
    if (!shown) return;
    site.load.column = 'Chiller kW';
    var want = await PROVIDER.estimate(site);
    await p.click('input[name=loadcol][value="Chiller kW"]');
    await p.click('[data-act=use-column]');
    await until(function () { return p.$('.kpis'); }, 20000); await p.waitForTimeout(150);
    ok('col [needs the engine\'s column contract]: the pick is read by the real engine, named in the result, and is its figure',
      (lastLoad() || {}).column === 'Chiller kW' && /Column read: Chiller kW/.test(await text(p, '#out')) && want && want.ok !== false && (await grossOnPage(p)) === money(want.totals.gross),
      { load: lastLoad(), gross: await grossOnPage(p), want: want && want.totals && money(want.totals.gross) });
  });

  /* ── S3: Save writes the WHOLE list, so never before the stored list is read ── */
  function stored3(names) {
    var s = {}; s[ANA_DOC] = { data: { v: 1, scenarios: names.map(function (n) { return scenario(n, { zip: '19103', segment: 'commercial', load: { type: 'profile', annualKwh: null } }); }) } };
    return withDocs(s);
  }
  await step('Saved list refused: Save never writes over it (desktop)', async function (use) {
    var t = await use({ user: userOf('u-ana'), docs: stored3(['Old one', 'Old two', 'Old three']),
      failures: { 'toolData/example-energy.com/tools/vppsim': { op: 'read', message: 'Failed to get document because the client is offline.' } } }), p = t.page;
    await p.goto(base + '/vpp-earnings.html', { waitUntil: 'load' });
    await signedIn(p);
    var said = await until(function () { return text(p, '#savemsg').then(function (x) { return /could not be loaded/.test(x) ? x : null; }); });
    ok('S3: a saved list that could not be read says so, never reads as an empty one', !!said, await text(p, '#savemsg'));
    await p.fill('#zip', '60601'); await p.fill('#nm', 'New one');
    await simulate(p);
    var m1 = await pressSave(p, /Press Save to try again/);
    ok('S3: Save with the list unread is refused, says why, and reads the list again', /^Not saved/.test(m1) && /Press Save to try again/.test(m1) && (await readsStarted(p)) >= 2, { msg: m1, reads: await readsStarted(p) });
    ok('S3: nothing is written: the three stored scenarios are all still there', (await writesTo(p, ANA_DOC)) === 0 && (await storedNames(p)).join() === 'Old one,Old two,Old three', { writes: await writesTo(p, ANA_DOC), names: await storedNames(p) });
    /* the network comes back */
    await p.evaluate(function () { delete window.__firebaseDouble.store.failures['toolData/example-energy.com/tools/vppsim']; });
    var m2 = await pressSave(p, /loaded\. Press Save again/);
    ok('S3: the next Save reads the list first, draws it, and still writes nothing', /loaded\. Press Save again/.test(m2) && (await scenNames(p)).length === 4 && (await writesTo(p, ANA_DOC)) === 0, { msg: m2, list: await scenNames(p) });
    var m3 = await pressSave(p, /^(Saved|Could not)/);
    ok('S3: then Save adds the new scenario to the stored ones', /^Saved/.test(m3) && (await storedNames(p)).join() === 'New one,Old one,Old two,Old three', { msg: m3, names: await storedNames(p) });
  });
  await step('Saved list slow: Save waits for it, and for the last save (hand-off, desktop)', async function (use) {
    var t = await use({ user: userOf('u-ana'), docs: stored3(['Old one', 'Old two']), holdRead: true }), p = t.page;
    await p.goto(base + '/vpp-earnings.html?zip=60601&segment=commercial&name=Handoff%20site', { waitUntil: 'load' });
    await until(function () { return p.$('.kpis'); }, 20000);
    var on = await until(function () { return p.$eval('#save', function (b) { return !b.disabled; }); }, 5000);
    ok('(the hand-off ran, and Save is on while the list is still on its way)', !!on && (await readsStarted(p)) === 1, { on: on, reads: await readsStarted(p) });
    var m1 = await pressSave(p, /still loading/);
    var m1b = await pressSave(p, /still loading/);
    ok('S3: Save while the list is still loading is refused, and says why', /^Not saved/.test(m1) && /still loading/.test(m1b), [m1, m1b]);
    ok('S3: nothing is written, and no second read is started beside the first', (await writesTo(p, ANA_DOC)) === 0 && (await readsStarted(p)) === 1 && (await storedNames(p)).join() === 'Old one,Old two', { writes: await writesTo(p, ANA_DOC), reads: await readsStarted(p), names: await storedNames(p) });
    await p.evaluate(function () { window.__vppRelease(); });
    var landed = await until(function () { return scenNames(p).then(function (n) { return n.length === 3; }); });
    ok('S3: when the list lands it is drawn, and the page says to Save again', !!landed && /loaded\. Press Save again/.test(await text(p, '#savemsg')), { list: await scenNames(p), msg: await text(p, '#savemsg') });
    var m2 = await pressSave(p, /^(Saved|Could not)/);
    ok('S3: Save then keeps what was stored', /^Saved/.test(m2) && (await storedNames(p)).join() === 'Handoff site,Old one,Old two' && (await scenNames(p))[1].indexOf('Handoff site ·') === 0, { msg: m2, names: await storedNames(p), list: await scenNames(p) });
    /* a save still on its way: a second one built beside it would leave it out */
    await p.evaluate(function () { window.__vppHold.write = true; });
    await p.fill('#nm', 'Second'); await simulate(p);
    await p.click('#save');
    await p.fill('#nm', 'Third'); await simulate(p);
    var m3 = await pressSave(p, /still saving/i);
    ok('S3: a Save while the last one is still on its way is refused, and says why', /still saving/i.test(m3), m3);
    await p.evaluate(function () { window.__vppRelease(); });
    await until(function () { return text(p, '#savemsg').then(function (x) { return /^Saved/.test(x); }); });
    var m4 = await pressSave(p, /^(Saved|Could not)/);
    ok('S3: the save that was on its way is kept, and the next Save adds to it', /^Saved/.test(m4) && (await storedNames(p)).join() === 'Third,Second,Handoff site,Old one,Old two', { msg: m4, names: await storedNames(p) });
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
