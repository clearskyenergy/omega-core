#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/guides/compute-proforma.js — the Compute Site Pro Forma guide: a
   Letter PDF with the OMEGA mark (omega-logo.png, the product's own icon:
   the favicon and the dashboard's top bar) on every page and screenshots of
   the real page.

   It serves compute-proforma.html against the REAL endpoint
   (api/compute-proforma.js → api/_lib/compute-site.js → proforma-engine.js),
   with verify-token answered from one in-memory workspace and the browser's
   Firebase replaced by a stand-in, as render-compute-proforma.js does. It
   presses Run the example on the empty results, walks the seven steps and
   photographs each card. Every figure the guide quotes is read off the page
   it photographed, and each step's state is asserted, so the guide cannot
   show or say what the page does not.

     node scripts/guides/compute-proforma.js               writes guides/compute/Compute-Site-Pro-Forma.pdf
   (served: https://silmarillion.clearskyomega.com/guides/compute/Compute-Site-Pro-Forma.pdf;
   like guides/editor/, this folder is built here, not by build.js, so
   tguides.js and the kit, which judge guides/*.pdf, leave it alone)
     ... --out FILE.pdf     somewhere else
     ... --shots DIR        keep the screenshots

   Retake it after a change to the page: npm run guide:compute.
   The workspace in the pictures is "Your Company" (a public PDF names no
   tenant). The page is photographed in Liberation Sans, the guides' face. */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var ROOT = path.join(__dirname, '..', '..');
var PW = (function () { try { return require.resolve('playwright'); } catch (e) { return process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright'; } })();
var chromium = require(PW).chromium;
var CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : chromium.executablePath();
function arg(k, d) { var i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
var OUT = path.resolve(arg('--out', path.join(ROOT, 'guides', 'compute', 'Compute-Site-Pro-Forma.pdf')));
var SHOTS = path.resolve(arg('--shots', path.join(os.tmpdir(), 'omega-compute-guide')));

/* ── one workspace: verify-token answers from these records ─────────── */
var ORG = 'yourcompany.com';
var CALLER = { uid: 'guide', email: 'you@' + ORG, orgId: ORG, staff: false, emailVerified: true, claims: { email_verified: true } };
var RECORDS = {};
RECORDS['omega_orgs/' + ORG] = { status: 'active', name: 'Your Company' };
RECORDS['omega_orgs/' + ORG + '/billing/current'] = { tier: 'standard' };
RECORDS['omega_orgs/' + ORG + '/members/guide'] = { role: 'owner', status: 'active' };
var vtPath = require.resolve(path.join(ROOT, 'api/_lib/verify-token'));
require.cache[vtPath] = { id: vtPath, filename: vtPath, loaded: true, exports: {
  httpError: function (status, message) { var e = new Error(message); e.status = status; return e; },
  verifyIdToken: function () { return Promise.resolve(CALLER); },
  readAsCaller: function (token, p) { return Promise.resolve(Object.prototype.hasOwnProperty.call(RECORDS, p) ? JSON.parse(JSON.stringify(RECORDS[p])) : null); }
} };
var handler = require(path.join(ROOT, 'api/compute-proforma'));

var STATIC = { '/compute-proforma.html': 'text/html', '/proforma-logic.js': 'text/javascript', '/omega-tools.js': 'text/javascript', '/omega-splash.js': 'text/javascript' };
var server = http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/compute-proforma') {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      var body = chunks.length ? Buffer.concat(chunks).toString('utf8') : '', code = 200;
      var vres = { setHeader: function (k, v) { res.setHeader(k, v); }, status: function (c) { code = c; return vres; },
        json: function (o) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return vres; } };
      var parsed = null; try { parsed = body ? JSON.parse(body) : null; } catch (e) { parsed = body; }
      handler({ method: req.method, headers: req.headers, body: parsed }, vres);
    });
    return;
  }
  if (url.pathname === '/config.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end('window.CLEARSKY_CONFIG={firebase:{}};'); }
  if (['/omega-brand.js', '/omega-tenant.js', '/omega-whitelabel.js'].indexOf(url.pathname) >= 0) { res.setHeader('Content-Type', 'text/javascript'); return res.end(''); }
  if (!STATIC[url.pathname]) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', STATIC[url.pathname]);
  res.end(fs.readFileSync(path.join(ROOT, url.pathname)));
});

function fixture(email) {
  var user = { uid: 'guide', email: email, getIdToken: function () { return Promise.resolve('guide'); } };
  var auth = { currentUser: user, onAuthStateChanged: function (fn) { setTimeout(function () { fn(user); }, 0); }, signOut: function () { return Promise.resolve(); } };
  var docs = {};
  function doc(p) {
    return { collection: function (c) { return coll(p + '/' + c); },
             get: function () { return Promise.resolve({ exists: !!docs[p], data: function () { return docs[p]; } }); },
             set: function (v) { docs[p] = JSON.parse(JSON.stringify(v, function (k, x) { return k === 'updatedAt' ? 'ts' : x; })); return Promise.resolve(); } };
  }
  function coll(p) { return { doc: function (id) { return doc(p + '/' + id); } }; }
  function firestore() { return { collection: coll }; }
  firestore.FieldValue = { serverTimestamp: function () { return 'ts'; } };
  window.firebase = { apps: [1], initializeApp: function () {}, auth: function () { return auth; }, firestore: firestore };
}
/* the guides' face, and nothing sticky or floating over a card while it is photographed */
var SHOT_CSS = 'body,button,input,select,textarea{font-family:"Liberation Sans",Arial,sans-serif!important}' +
  'html.guide-shots .hdr,html.guide-shots .mstrip,html.guide-shots .stepper,html.guide-shots .rail{position:static!important}' +
  'html.guide-shots #toast{display:none!important}';

/* ── the marks: rendered once, small, on a transparent ground ────────── */
function file64(rel) { return 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, rel)).toString('base64'); }
async function mark(context, rel, heightPx) {
  var p = await context.newPage();
  await p.setContent('<html><body style="margin:0;background:transparent"><img id="m" src="' + file64(rel) + '" style="height:' + heightPx + 'px;display:block"></body></html>');
  await p.waitForFunction(function () { var i = document.getElementById('m'); return i && i.complete && i.naturalWidth > 0; });
  var buf = await p.locator('#m').screenshot({ omitBackground: true });
  await p.close();
  return 'data:image/png;base64,' + buf.toString('base64');
}

/* ── the guide's words ───────────────────────────────────────────────── */
var TITLE = 'Compute Site Pro Forma', SUB = 'User guide · Omega Compute · ClearSky-OMEGA';
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/* a PNG's width in pixels, from its header */
function pngWidth(file) { return fs.readFileSync(file).readUInt32BE(16); }
/* every screenshot at one scale: 0.8 of its size on screen (they are taken at
   2x), never wider than the page */
function widthOf(file) { return Math.min(710, Math.round(pngWidth(file) / 2 * 0.8)); }
function guideHtml(img, F, marks) {
  function fig(name, cap) { return '<figure><img src="' + img[name].uri + '" style="width:' + img[name].w + 'px"><figcaption>' + cap + '</figcaption></figure>'; }
  function step(n, t) { return '<div class="step"><div class="n">' + n + '</div><h2>' + t + '</h2></div>'; }
  function row(k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; }
  var css = '@page{size:Letter}@page :first{margin:0}'
    + 'body{font:10.3pt/1.5 "Liberation Sans",Arial,sans-serif;color:#1c2b36;margin:0}'
    + 'h1{font-size:19pt;color:#0f2e3f;margin:22px 0 6px;letter-spacing:-.2px;page-break-after:avoid}h1.first{margin-top:0}h2{font-size:13pt;color:#0f2e3f;margin:16px 0 6px;page-break-after:avoid}'
    + 'h3{font-size:11pt;color:#0f2e3f;margin:14px 0 4px;page-break-after:avoid}'
    + 'p{margin:0 0 8px}.lead{font-size:11pt;color:#34495e}b,strong{color:#0f2e3f}'
    + 'figure{margin:8px 0 14px;page-break-inside:avoid}figure img{max-width:100%;border:1px solid #dfe7ec;border-radius:6px;display:block}'
    + 'figcaption{font-size:8.6pt;color:#5a7280;margin-top:5px;max-width:710px}'
    + '.step{display:flex;gap:10px;align-items:center;margin:22px 0 8px;page-break-after:avoid}'
    + '.n{flex:none;width:26px;height:26px;border-radius:50%;background:#0f2e3f;color:#fff;font-weight:700;text-align:center;line-height:26px;font-size:11pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '.step h2{margin:0}'
    + '.break{page-break-before:always}'
    + '.tips{background:#f1f6f8;border-left:4px solid #0f2e3f;padding:8px 12px;margin:10px 0 12px;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tips p{margin:0 0 5px}.tips ul{margin-bottom:0}'
    + 'ul{margin:0 0 8px 18px;padding:0}li{margin:0 0 4px}'
    + 'table.t{border-collapse:collapse;width:100%;margin:6px 0 12px;font-size:9.6pt;page-break-inside:avoid}table.t th,table.t td{border-bottom:1px solid #dbe5ea;padding:5px 8px;text-align:left;vertical-align:top}'
    + 'table.t th{color:#0f2e3f;width:30%;font-weight:700}table.t.k th{width:24%}'
    + '.side{display:flex;gap:18px;align-items:flex-start;page-break-inside:avoid}.side>div{flex:1 1 0;min-width:0}.side figure{flex:none;margin-top:4px}'
    /* the cover: one navy page, the band Chromium draws over its top is the same navy */
    + '.cover{position:relative;height:11in;box-sizing:border-box;padding:1.45in 0.75in 0;background:#0f2e3f;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden}'
    + '.cover .kick{font-size:9.5pt;letter-spacing:.14em;text-transform:uppercase;color:#7fd3c9;font-weight:700}'
    + '.cover h1{color:#fff;font-size:34pt;line-height:1.08;margin:10px 0 12px;letter-spacing:-.5px}'
    + '.cover .sub{font-size:12.5pt;line-height:1.45;color:#c9dde5;max-width:6.3in;margin:0 0 22px}'
    + '.cover .shot{background:#fff;border-radius:10px;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.35)}.cover .shot img{width:100%;display:block;border-radius:6px}'
    + '.cover .foot{position:absolute;left:0.75in;right:0.75in;bottom:0.85in;display:flex;align-items:center;gap:18px;border-top:1px solid rgba(255,255,255,.18);padding-top:16px}'
    + '.cover .foot img{height:0.95in;display:block}.cover .foot .who{font-size:10pt;color:#c9dde5;line-height:1.45}.cover .foot .who b{color:#fff;font-size:11pt}';

  var ex = F.example;
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + TITLE + ' · User guide</title><style>' + css + '</style></head><body>'

  /* ── cover ── */
  + '<section class="cover">'
  + '<div class="kick">User guide · Omega Compute</div>'
  + '<h1>Compute Site Pro Forma</h1>'
  + '<p class="sub">Screen a building’s existing electrical service for GPU compute pods beside its EV chargers, a battery and its own load. Size it, choose the deal and present the after-tax IRR in your company’s brand.</p>'
  + '<div class="shot"><img src="' + img.cover.uri + '"></div>'
  + '<div class="foot"><img src="' + marks.foot + '" alt="ClearSky-OMEGA"><div class="who"><b>ClearSky-OMEGA</b> · ClearSky Energy Solutions<br>silmarillion.clearskyomega.com · ' + esc(F.month) + '</div></div>'
  + '</section>'

  /* ── what it answers ── */
  + '<h1 class="first">What it answers</h1>'
  + '<p class="lead">Can this building’s existing electrical service carry GPU compute pods beside its EV chargers, a battery and its own load, and what does that return? The Compute Site Pro Forma answers both from one hourly model of the site. It then prices three ways to own the site and prints the investor deck.</p>'
  + '<p>This is the metro-edge model: inference pods placed on power a building already has, often the power built for its EV chargers. The model runs every hour of a year on that one service. The building comes first, then the compute sold under contract, then the charging. The battery and the on-demand GPUs share what is left. Nothing is added up in your browser: every figure comes back from ClearSky’s server.</p>'
  + '<h2>Where to find it</h2>'
  + '<ul><li><b>Omega Workspace › Finance</b> hexagon › <b>Compute Site Pro Forma</b>, right after the VPP Earnings Simulator. It is also in the <b>Compute</b> hexagon.</li>'
  + '<li><b>Site Map</b> (the editor) › <b>Compute</b> tab › <b>Size</b> › <b>Site Screen</b> screens the drawing and opens the pro forma with the site filled in. The last page explains it.</li>'
  + '<li>Direct: <b>silmarillion.clearskyomega.com/compute-proforma</b>. Add <b>?example=1</b> to open it on the example.</li>'
  + '<li>It belongs to <b>Omega Compute</b>. Field and Pro plans and trials include it; on a package, add Omega Compute from the Modules page.</li></ul>'
  + '<h2>The fastest start: run the example</h2>'
  + '<p>Press <b>Run the example</b>. It is on step 1, in the Live summary on the right, and on the empty Load balance and Results. The example fills every step and runs at once. If you had typed anything, <b>Put mine back</b> in the notice at the bottom of the screen restores it.</p>'
  + '<table class="t">'
  + row('The example', 'An illustrative apartment building in ' + esc(ex.city) + ', ZIP ' + esc(ex.zip) + '. Replace any of it with your own.')
  + row('Service', esc(ex.service))
  + row('Compute', esc(ex.compute))
  + row('Charging', esc(ex.charging))
  + row('Battery', esc(ex.battery))
  + row('Deal', esc(ex.deal))
  + row('What it returns', esc(F.verdict) + ' on the site screen, a peak of ' + esc(F.peak) + ' at the meter, and a ' + esc(F.irr) + ' after-tax IRR on ' + esc(F.investment) + '.')
  + '</table>'
  + '<p>The service is tight on purpose: the twelve chargers at full power would overrun it, so managed charging, the battery and the on-demand GPUs all have work to do.</p>'
  + fig('empty', 'Before anything has run, the Results and the Live summary offer the example and step 1.')

  /* ── how the page works ── */
  + '<h1>How the page works</h1>'
  + '<div class="side"><div>'
  + '<p>Seven steps down the left, the Live summary on the right. Every change runs the model again on the server after a short pause. On a phone the steps are Back and Next at the bottom, and the summary is the strip under the header.</p>'
  + '<ol style="margin:0 0 8px 18px;padding:0"><li><b>Site & service:</b> where, and what the panel can carry.</li><li><b>Building load:</b> an 8760, bills or a typical shape, and the tariff.</li><li><b>EV charging:</b> ports, sessions and when cars come.</li><li><b>Compute:</b> GPUs, who buys the hours, prices over time.</li><li><b>Load balance:</b> the battery, the hourly fit and the sizing sweep.</li><li><b>Deal & financing:</b> three ways to own it, tax and debt.</li><li><b>Results & report:</b> the IRR, the investor deck and saved scenarios.</li></ol>'
  + '<p>Once the model has run, a line under each step’s name recaps it. A step with a problem is ringed in red. <b>Save scenario</b> at the top keeps the whole set; <b>Saved scenarios</b> reopens one.</p>'
  + '<p>A grey figure in a field is what a blank field runs on. Type over it to change it.</p>'
  + '</div>' + fig('rail', 'The Live summary.') + '</div>'

  /* ── step 1 ── */
  + step(1, 'Site & service')
  + '<p>The <b>ZIP</b> is the one field the model cannot run without. It sets the market, the climate the typical load follows and the state’s tax rate. <b>Market</b> reads the ZIP unless you pick one. <b>Host type</b> (Multifamily, Office, Retail, Industrial) sets the building’s load shape and rate class. The names and the address go on the deck.</p>'
  + fig('site', 'The site. The name, sponsor and host print on the investor deck.')
  + '<p>The <b>electrical service</b> is the limit everything else is held under. Enter the rating from the main breaker on the panel schedule, in amps with the voltage and phases, or its capacity in kW. The model may load it to the <b>continuous loading limit</b>, 80% by default as the NEC sizes continuous load. A planned <b>service upgrade</b> adds capacity and its cost, capitalised as 15-year property.</p>'
  + fig('service', 'The service. ' + esc(ex.service) + '.')

  /* ── step 2 ── */
  + step(2, 'Building load & tariff')
  + '<p>The building’s own load always comes first on the service. Give the model the best record you have:</p>'
  + '<ul><li><b>8760 / interval:</b> an hourly or 15-minute file, in kWh or kW. The best.</li><li><b>Bills (12–24 mo):</b> each month’s kWh and dollars. Three or more months with dollars calibrate the rate to what the building pays.</li><li><b>Typical:</b> a typical shape for the host type, scaled to the annual kWh if you have it. The results say it was assumed.</li></ul>'
  + fig('load', 'The building load. The example uses the typical shape for an apartment building.')
  + '<p>The <b>tariff</b> is optional. Enter the on-peak and off-peak energy prices, the demand charge and the on-peak hours, or paste an OpenEI URDB tariff record. Without one, the market’s planning rate is used and a warning says so.</p>'
  + fig('tariff', 'The tariff. Blank fields run on the market’s planning rate.')

  /* ── step 3 ── */
  + step(3, 'EV charging')
  + '<p>Charging is placed after the building and the contracted compute, inside what the service has left.</p>'
  + '<ul><li><b>Charging ports</b> and <b>power per port</b>: Level 2 is typically 7.2, 11.5 or 19.2 kW; DC fast 62.5 or 150 kW.</li>'
  + '<li><b>Managed charging</b> (on by default) moves each session into its cheapest hours without setting a new peak. Off, cars charge at full power on arrival, held under the service by the panel’s load management (NEC 625.42).</li>'
  + '<li><b>Who charges, and when</b>: residents overnight, workplace, retail and public, a fleet depot, or a custom arrival window. Sessions per port, weekend sessions, energy per session and the stay follow the pattern; type over any of them.</li>'
  + '<li>Energy a car cannot get before it leaves is reported as <b>not delivered</b>, never assumed away.</li></ul>'
  + fig('ev', 'The chargers. The example has twelve managed 11.5 kW ports for residents charging overnight.')
  + '<p><b>Charging money</b> holds the driver price and its escalator, the installed cost per port, the network fee, O&M, charger efficiency and payment processing. <b>Chargers already installed</b> takes the charger capital out of the model.</p>'

  /* ── step 4 ── */
  + step(4, 'Compute')
  + '<p>Choose the <b>GPU class</b> and the number of <b>pods</b>. The page shows each class’s planning figures: RTX PRO 6000 at 0.60 kW a GPU, H200 at 0.70 kW and B300 at 1.30 kW, with 48, 48 and 32 GPUs a pod. Custom takes your own. Server overhead, cooling (PUE), availability and the serving and idle draw turn a GPU’s rating into its draw at the meter.</p>'
  + fig('hardware', 'The hardware. ' + esc(ex.compute) + '.')
  + '<p><b>Who buys the compute</b> splits the GPUs across three contracts, each with a share and a price per GPU-hour:</p>'
  + '<ul><li><b>Long-term offtake:</b> take-or-pay. These GPUs run every hour and are firm.</li><li><b>Local edge contracts:</b> firm inside their contract hours, at their average use.</li><li><b>On-demand overflow:</b> the one load the model may hold back to keep the peak down, and only where that earns more than the GPU-hours.</li></ul>'
  + fig('buyers', 'Who buys the compute. <b>Use Laitent’s published mix</b> sets 40 / 30 / 30.')
  + '<p><b>The compute schedule</b> decides when on-demand GPUs run: follow the site’s peak (the default), always on, or off-peak hours only. <b>Prices over time</b> sets the yearly GPU-hour price decline, the offtake term, the first-year ramp, the GPU refresh and its cost, and the installed and running costs. The GPU prices are planning figures set below cloud list and marked as such: the compute operator’s contract replaces them.</p>'

  /* ── step 5 ── */
  + step(5, 'Battery & load balance')
  + '<p>Enter the <b>battery</b> power and energy (blank means none) and any <b>solar</b>. Battery details hold the round trip, usable depth, fade, wear, O&M and replacement. The battery holds each month’s peak where that pays, and keeps energy back for any hour the contracted load alone would overrun the service.</p>'
  + fig('battery', 'Battery and solar. ' + esc(ex.battery) + '.')
  + '<h3>The site screen</h3>'
  + '<p>The banner is the verdict, with the next gate after it.</p>'
  + '<table class="t k">'
  + row('ADVANCE', 'Fits the existing service. Above 85% of the limit it reads <i>tight margin</i> and the next gate is a load study.')
  + row('VERIFY', 'More than 5% of the charging is not delivered, or every charger at full power would exceed the service: install load management (an EVEMS).')
  + row('HOLD', 'The building and the contracted compute alone exceed the service, even with the battery.')
  + '</table>'
  + fig('screen', 'The verdict and what the service carries. The bar is the peak at the meter against the limit; the orange mark is every charger at full power plus the firm load.')
  + '<p>The four tiles are the headroom at the peak hour, the firm peak (the building and the contracted compute), the charging energy not delivered, and the on-demand GPU-hours held back.</p>'
  + '<h3>Hour by hour</h3>'
  + '<p>The bars stack every load in each hour: the building, the contracted compute, the on-demand compute, EV charging and battery charging. The black line is the meter. Where the bars rise above the line, the battery is covering the difference. The tabs show the peak summer weekday, the peak winter weekday and the busiest weekend day. Hover any hour for its figures, or open <b>The hours as a table</b>.</p>'
  + fig('day', 'The peak summer weekday. Charging runs overnight. In the evening peak the stack rises above the meter line: the battery is discharging to hold the month’s peak down.')
  + fig('months', 'Monthly peak (grey: without the battery or holding back GPUs; blue: at the meter) and every hour of the year sorted.')
  + '<p><b>Year one on this service</b>, under the charts, lists the GPU-hours and compute revenue, the charging delivered and its revenue, the battery’s cycles and its effect on the bill, and the project’s own electricity.</p>'
  + '<h3>Size it</h3>'
  + '<p><b>Find the best size</b> runs pods against battery sizes, each cell a full year of hourly dispatch and a full pro forma. The best is the highest NPV that fits: no lost contracted compute and no more than 5% of the charging undelivered. Shading follows NPV and a striped cell does not fit. <b>Use this size</b>, or a click on any cell that fits, applies it and runs the model again.</p>'
  + fig('sweep', 'The sizing sweep for the example: pods down the side, battery sizes across the top. ' + esc(F.best))
  + (F.bestNoBattery && F.example.battery ? '<p>Here the sweep prefers no battery: at this site’s planning rate the battery holds the peak but saves less than it costs. That is what the sweep is for, finding it out before the capital is spent.</p>' : '')

  /* ── step 6 ── */
  + step(6, 'Deal & financing')
  + '<p>The same hourly model is priced three ways, side by side. The one you choose gets the full pro forma.</p>'
  + '<ul><li><b>Own and operate:</b> the project owns the GPUs, pods, chargers and battery, and sells compute through an operator’s platform.</li><li><b>Own the power layer:</b> the investor owns the pods, power and chargers but not the GPUs, for a share of gross compute revenue (20% by default).</li><li><b>Lease the power:</b> the host leases the power to a compute operator for fixed rent with the electricity paid. No capital, so it shows the NPV of the rent and the property value it adds, never an IRR.</li></ul>'
  + fig('deals', 'The three structures, each with its IRR, NPV, capital and year-one EBITDA. The example owns the power layer.')
  + '<p><b>Term and rates</b> holds the analysis term, discount rate, utility escalator, inflation and how the GPU refresh is paid. <b>Construction begins</b> and <b>In service</b> are a month and a year each: they decide which tax credits apply. Left blank, the credits are assumed kept and a warning says so.</p>'
  + fig('term', 'Term and rates, with the construction and in-service months the example filled in.')
  + '<p><b>Tax & incentives</b> runs through the BESS Pro Forma’s tax engine: federal and state rates (a blank state rate uses the site’s state), bonus depreciation, the tax appetite, whether the credit is claimed or sold (§6418) and at what price, and the battery credit’s adders. <b>Financing</b> is 100% equity or with project debt, sized on loan-to-cost and coverage.</p>'
  + fig('tax', 'Tax & incentives: the rates, the tax appetite, a credit claimed or sold, and the battery credit’s adders.')

  /* ── step 7 ── */
  + step(7, 'Results & report')
  + '<p>The same returns, IRR build and investor deck as the BESS Pro Forma, from the same finance engine.</p>'
  + fig('headline', '<b>Headline returns:</b> the investment sought, the after-tax IRR over the term, total investor returns and the after-tax payback.')
  + fig('irr', '<b>IRR build:</b> the cash-only return, then the depreciation and credit effects. <b>More metrics:</b> NPV, the year-one distribution, the multiple and the pre-tax IRR.')
  + '<p><b>Warnings & notes</b> say what was assumed and what replaces it. Read them before you send the deck.</p>'
  + fig('cash', 'After-tax cash flow by year, with the cumulative line. <b>Annual table</b> opens every year’s figures.')
  + fig('sens', 'Sensitivity: installed cost, GPU-hour prices, utilisation, electricity rates and charging sessions.')
  + '<p>Below the sensitivity, <b>The operating schedule, year by year</b> shows each revenue and cost line over the term, <b>Deal comparison</b> sets the three structures side by side, and <b>Modelling conventions</b> lists the method.</p>'
  + '<h3>The investor deck</h3>'
  + '<p>The deck is drawn from the result in your company’s brand: a cover, the one-page investor summary, the returns and tax basis, the annual cash flow, the assumptions and a closing page. <b>Print / save as PDF</b> prints it; <b>Download the annual CSV</b> exports the year-by-year figures.</p>'
  + fig('deck', 'The investor one-pager, as printed.')
  + '<p><b>Save scenario</b> at the top keeps every input. Saved scenarios are listed under <b>Compare scenarios</b>, at the foot of the results, with their size, schedule, deal and returns side by side.</p>'

  /* ── the site screen in site map ── */
  + '<h1>From Site Map: the Site Screen</h1>'
  + '<p>In Site Map, open the <b>Compute</b> tab › <b>Size</b> › <b>Site Screen</b>. It reads what the drawing already knows: the ZIP, the service from the behind-the-meter inputs, the chargers placed, the battery and solar, the pods, and the Battery Sizer’s bills. It screens the site on the server and prints ADVANCE, VERIFY or HOLD with the next gate. <b>Open the Compute Site Pro Forma</b> carries the site into this page, filled in.</p>'
  + '<h2>Reading the numbers</h2>'
  + '<table class="t">'
  + row('Service limit', 'The service rating times the continuous loading limit, plus any upgrade. Everything is held under it.')
  + row('Firm load', 'The building and the contracted compute (offtake, and edge contracts in their hours). It is never held back.')
  + row('On-demand compute', 'GPU-hours sold as they are asked for. The only load the model holds back to keep the peak down.')
  + row('Peak at the meter', 'The highest hour of the year the utility sees, after the battery and any held-back GPUs.')
  + row('Every charger at full power', 'The nameplate check (NEC 625.42): all ports at full power plus the firm load. Above the limit, charging needs load management.')
  + row('Not delivered', 'Charging energy a car could not get before it left.')
  + row('After-tax IRR', 'Unlevered with 100% equity; the equity IRR with project debt.')
  + row('Payback', 'After tax: cash, depreciation and the credit.')
  + '</table>'
  + '<div class="tips"><p><b>Good to know</b></p><ul>'
  + '<li>Planning figures are marked on the page and in the deck: the GPU-hour prices, the market’s planning rate and the typical load. The operator’s contract, the utility tariff and 12 months of bills or an 8760 replace them.</li>'
  + '<li>A link can fill the page: <b>?zip=78701&amps=400&pods=4&ports=12</b> (also kw, volts, portkw, bkw, bkwh, solar, annualKwh, hostType, gpu, pattern, name, city, host, street, utility).</li>'
  + '<li>The model is one meter over a typical weather year with a constant PUE. Demand ratchets and solar export credit are not modelled.</li>'
  + '<li>It is a screening model, not a compute operator’s offer, a utility load study or a tax opinion.</li></ul></div>'
  + '</body></html>';
}

/* ── capture ─────────────────────────────────────────────────────────── */
async function run() {
  fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || CHROME });
  try {
    var context = await browser.newContext({ viewport: { width: 1480, height: 1000 }, colorScheme: 'light', deviceScaleFactor: 2 });
    await context.route('**/*', function (r) { return r.request().url().indexOf(base) === 0 ? r.continue() : r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
    await context.addInitScript(fixture, CALLER.email);
    await context.addInitScript(function (css) { document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }); }, SHOT_CSS);
    var page = await context.newPage(), errors = [], files = {};
    page.on('pageerror', function (e) { errors.push(e.message); });
    async function box(loc) { return loc.evaluate(function (e) { var r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }); }
    /* one card, or the span from the first locator's top to the last one's bottom */
    async function snap(name, locs, pad) {
      locs = [].concat(locs); pad = pad == null ? 1 : pad;
      await page.evaluate(function () { document.documentElement.classList.add('guide-shots'); });
      await locs[0].scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
      var a = await box(locs[0]), z = await box(locs[locs.length - 1]);
      var x = Math.min(a.x, z.x) - pad, y = a.y - pad, w = Math.max(a.x + a.w, z.x + z.w) - x + pad, h = z.y + z.h - y + pad;
      var f = path.join(SHOTS, name + '.png');
      await page.screenshot({ path: f, fullPage: true, clip: { x: Math.max(0, x), y: Math.max(0, y), width: w, height: h } });
      files[name] = f;
      return f;
    }
    function card(step, heading) { return page.locator('section.step[data-step="' + step + '"] .card', { has: page.locator('h3', { hasText: heading }) }).first(); }
    async function go(n) { await page.evaluate(function (k) { document.querySelector('#stepper [data-step="' + k + '"]').click(); }, n); await page.waitForTimeout(250); }
    async function upToDate() { await page.waitForFunction(function () { var f = document.querySelector('#rail .rail-foot'); return f && /Up to date/.test(f.textContent); }, null, { timeout: 60000 }); }

    await page.goto(base + '/compute-proforma.html');
    await page.waitForFunction(function () { return document.querySelectorAll('#i-mkt option').length > 5; });

    /* the way in: nothing has run, the results offer the example */
    await go(7);
    assert(await page.locator('#res-body [data-act="example"]').count() === 1, 'the empty results offer the example');
    await page.evaluate(function () { document.documentElement.classList.remove('guide-shots'); window.scrollTo(0, 0); });
    files.empty = path.join(SHOTS, 'empty.png');
    var ebox = await box(page.locator('#res-body .card').first()), rbox = await box(page.locator('#rail .card').first()), top = Math.min(ebox.y, rbox.y);
    await page.screenshot({ path: files.empty, clip: { x: ebox.x - 12, y: top - 12, width: rbox.x + rbox.w - ebox.x + 24, height: Math.max(ebox.y + ebox.h, rbox.y + rbox.h) - top + 24 } });

    await page.locator('#res-body [data-act="example"]').click();
    await page.waitForFunction(function () { return /Headline returns/.test(document.getElementById('res-body').textContent); }, null, { timeout: 60000 });
    await upToDate();
    await page.waitForFunction(function () { return document.querySelectorAll('#deck-box .pf-slide').length >= 3; }, null, { timeout: 30000 });

    /* the figures the guide quotes, read off the page */
    var F = await page.evaluate(function () {
      function t(sel) { var e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }
      function kv(label) { var rows = document.querySelectorAll('#rail .kv'); for (var i = 0; i < rows.length; i++) { var s = rows[i].querySelector('span'); if (s && s.textContent.indexOf(label) === 0) return rows[i].querySelector('b').textContent.replace(/\s+/g, ' ').trim(); } return ''; }
      function v(sel) { var e = document.querySelector(sel); return e ? (e.value || e.placeholder || '') : ''; }
      var deal = document.querySelector('#deals [aria-pressed="true"] b');
      return {
        irr: t('#rail .hero'), investment: kv('Investment sought'), payback: kv('After-tax payback'), npv: kv('NPV'), peak: kv('Peak at the meter'), verdict: t('#rail .pill'),
        zip: v('#i-zip'), city: v('#i-city'), amps: v('#i-amps'), volts: (document.getElementById('i-volts') || {}).value || '480', phases: (document.getElementById('i-ph') || {}).value === '1' ? 'single-phase' : 'three-phase',
        ports: v('#e-ports'), portKw: v('#e-kw'), pods: v('[data-path="compute.pods"]'),
        bkw: v('#b-kw'), bkwh: v('#b-kwh'), gpus: t('#sts4'), limit: t('#sts1'), deal: deal ? deal.textContent : '',
        managed: !!(document.querySelector('[data-path="ev.managed"]') || {}).checked
      };
    });
    assert(/%/.test(F.irr) && /ADVANCE|VERIFY|HOLD/.test(F.verdict) && /kW of/.test(F.peak) && F.zip && F.amps && F.pods && F.deal, 'the example ran and the summary reads: ' + JSON.stringify(F));
    F.example = {
      city: F.city, zip: F.zip,
      service: F.amps + ' A at ' + F.volts + ' V, ' + F.phases + ', carrying up to ' + ((/([\d,]+ kW)/.exec(F.limit) || [])[1] || 'its limit') + ' continuously',
      compute: F.gpus + ' in ' + F.pods + ' pods',
      charging: F.ports + ' ports at ' + F.portKw + ' kW, ' + (F.managed ? 'managed' : 'unmanaged') + ', residents charging overnight',
      battery: F.bkw + ' kW / ' + F.bkwh + ' kWh',
      deal: F.deal
    };
    F.month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

    /* the cover: the finished result, as a person sees it */
    await page.evaluate(function () { document.documentElement.classList.remove('guide-shots'); window.scrollTo(0, 0); });
    await page.waitForTimeout(200);
    files.cover = path.join(SHOTS, 'cover.png');
    var two = await box(page.locator('#res-body .two').first());
    await page.screenshot({ path: files.cover, clip: { x: 0, y: 0, width: 1480, height: two.y + two.h + 18 } });

    /* step 1 */
    await go(1);
    await snap('site', card(1, 'The site'));
    await snap('service', card(1, 'The electrical service'));
    /* step 2 */
    await go(2);
    await snap('load', page.locator('section.step[data-step="2"] > .card').first());
    await snap('tariff', card(2, 'Tariff'));
    /* step 3 */
    await go(3);
    assert(await page.locator('section.step[data-step="3"] label.sw .tr').first().evaluate(function (e) { return e.getBoundingClientRect().width; }) >= 36, 'the charging step\'s switches draw');
    await snap('ev', page.locator('section.step[data-step="3"] > .card').first());
    /* step 4 */
    await go(4);
    await snap('hardware', card(4, 'The hardware'));
    await snap('buyers', card(4, 'Who buys the compute'));
    /* step 5 */
    await go(5);
    await page.locator('#screen-out .verdict').waitFor();
    await snap('battery', card(5, 'Battery and solar'));
    await snap('screen', [page.locator('#screen-out .banner').first(), page.locator('#screen-out .card', { has: page.locator('h3', { hasText: 'What the service carries' }) })]);
    await snap('day', page.locator('#screen-out .card', { has: page.locator('#ch-day') }));
    await snap('months', page.locator('#screen-out .two').first());
    await page.locator('[data-act="optimize"]').click();
    await page.locator('#sweep-out table').waitFor({ timeout: 120000 });
    assert(await page.locator('#sweep-out td.cell').count() >= 8 && await page.locator('#sweep-out td.cell.best').count() === 1, 'the sweep drew its grid with one best cell');
    await snap('sweep', card(5, 'Size it'));
    F.best = (await page.locator('#sweep-out .banner').first().textContent()).replace(/\s*Use this size\s*$/, '').replace(/\s+/g, ' ').trim();
    F.bestNoBattery = /no battery/.test(F.best);
    assert(/^Best: /.test(F.best), 'the sweep names its best size: ' + F.best);
    /* step 6 */
    await go(6);
    await snap('deals', card(6, 'Ownership structure'));
    await snap('term', card(6, 'Term and rates'));
    await snap('tax', card(6, 'Tax'));
    /* step 7 */
    await go(7);
    await page.locator('#ch-cash svg').waitFor();
    await snap('headline', page.locator('#res-body .card', { has: page.locator('h3', { hasText: 'Headline returns' }) }));
    await snap('irr', page.locator('#res-body .two').first());
    await snap('cash', page.locator('#res-body .card', { has: page.locator('#ch-cash') }));
    await snap('sens', page.locator('#res-body .card', { has: page.locator('h3', { hasText: 'Sensitivity' }) }));
    await snap('deck', page.locator('#deck-box .pf-slide').nth(1));
    await page.locator('[data-act="save"]').click();
    await page.waitForFunction(function () { return /Saved/.test(document.getElementById('savemsg').textContent); });
    assert(await page.locator('#compare tbody tr').count() === 1, 'the saved scenario is compared');
    await page.evaluate(function () { document.documentElement.classList.add('guide-shots'); });
    await snap('rail', page.locator('#rail .card').first());
    assert(errors.length === 0, 'no page errors: ' + errors.join(' | '));

    /* the PDF */
    var img = {}; Object.keys(files).forEach(function (k) { img[k] = { uri: 'data:image/png;base64,' + fs.readFileSync(files[k]).toString('base64'), w: widthOf(files[k]) }; });
    var marks = { band: await mark(context, 'omega-logo.png', 96), foot: await mark(context, 'omega-logo.png', 184) };
    /* Chromium pads a header template from the page's top edge; the band runs to the edge */
    var HEADER = '<style>#header{padding:0!important;margin:0!important}html,body{margin:0!important;padding:0!important}</style>'
      + '<div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;width:100%;height:0.8in;margin:0;background:#0f2e3f;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 0.55in;box-sizing:border-box;font-family:Liberation Sans,Arial,sans-serif">'
      + '<div style="display:flex;align-items:center;gap:10px"><img src="' + marks.band + '" alt="ClearSky-OMEGA" style="height:0.52in;display:block"><div style="font-size:14pt;font-weight:700;letter-spacing:-.2px">ClearSky-OMEGA</div></div>'
      + '<div style="text-align:right"><div style="font-size:13pt;font-weight:700;letter-spacing:-.1px">' + TITLE + '</div><div style="font-size:8.6pt;color:#b9d3dc;margin-top:2px">' + SUB + '</div></div></div>';
    var FOOTER = '<div style="width:100%;text-align:center;font:8pt Liberation Sans,Arial,sans-serif;color:#7d93a0;padding-bottom:6px">ClearSky Energy Solutions &nbsp;·&nbsp; silmarillion.clearskyomega.com &nbsp;·&nbsp; page <span class="pageNumber"></span> of <span class="totalPages"></span></div>';
    var doc = await context.newPage();
    await doc.setContent(guideHtml(img, F, marks), { waitUntil: 'load' });
    await doc.pdf({ path: OUT, format: 'Letter', printBackground: true, displayHeaderFooter: true, headerTemplate: HEADER, footerTemplate: FOOTER,
      margin: { top: '1.05in', bottom: '0.6in', left: '0.55in', right: '0.55in' } });
    console.log('Compute Site Pro Forma guide: ' + Object.keys(files).length + ' screenshots of the real page (' + SHOTS + '); the example reads ' + F.verdict + ', ' + F.irr + ' after-tax IRR on ' + F.investment + '; written ' + path.relative(ROOT, OUT) + ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e && e.stack || e); server.close(); process.exit(1); });
