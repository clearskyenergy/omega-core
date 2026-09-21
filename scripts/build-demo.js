#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/build-demo.js — the whole demo as ONE file you can double-click
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

       node scripts/build-demo.js            →  dist/cleancell-demo.html

   ── WHY ───────────────────────────────────────────────────────────────────
   `npm run demo` needs a clone, a terminal and Node. That is a reasonable ask
   of an engineer and an unreasonable one of somebody who wants to look at the
   thing on a phone between meetings, or mail it to a colleague. This emits a
   single self-contained page: no server, no network, no install. Open it from
   Downloads and the whole loop works.

   ── WHAT IS REAL IN IT ────────────────────────────────────────────────────
   More than you would expect, because the three engines are dependency-free
   and were written browser-first:

     api/_lib/bess-engine.js   the sizing. Real.
     api/_lib/site-fit.js      the parcel geometry and unit packing. Real.
     api/_lib/product-fit.js   which products cover a target. Real.
     omega-tools.js            the tool catalogue + isUnlocked(). Real.
     embed/storefront.html     the page that ships. Real, inlined verbatim.

   They are INLINED, not reimplemented. If somebody changes the sizing rules,
   the next build of this file changes with them. A demo with its own private
   copy of the math is a demo that starts lying the week after it is made.

   ── WHAT IS FAKED, AND HOW ────────────────────────────────────────────────
   One thing: the network. A shim replaces window.fetch and answers the four
   /api/embed-* calls in-page from those engines. Firestore, the embed key,
   the origin allowlist, the lead receipt and the Regrid parcel lookup are all
   absent — the parcel is the same fixed ring the local preview uses.

   So this file authorises nothing and reaches nothing. That is what makes it
   safe to mail. It is also why it is not the product: the real storefront
   refuses without a key, and every gate it skips is enforced server-side and
   tested in scripts/tests/tembedlayout.js.

   Orders live in sessionStorage, so the order desk works and a reload clears
   it — the right behaviour for something demonstrated twice in an afternoon.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var P = require(path.join(ROOT, 'scripts', 'preview-storefront.js'));

var OUT = (function () {
  var i = process.argv.indexOf('--out');
  return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1]
                                         : path.join(ROOT, 'dist', 'cleancell-demo.html');
})();

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* ── The storefront, inlined ──────────────────────────────────────────────
   Its <style> and <body> are lifted out and dropped into a panel. The page
   is self-contained by design (CLAUDE.md: single-file HTML tools), which is
   exactly what makes this possible without a bundler. */
/* A surgical rewrite of one line of shipped source, with a hard failure if
   the line ever moves. The storefront takes its publishable key from
   window.location.search, and a file:// URL has none — so offline it would
   stop at "This storefront is missing its key." before reaching the shim.

   This is the ONLY edit the bundler makes to shipped code, and it throws
   rather than warns: a build that quietly emitted a dead storefront would be
   discovered in front of somebody. */
function patch(src, find, replace, what) {
  if (src.indexOf(find) < 0) {
    throw new Error('build-demo: could not find ' + what + ' in embed/storefront.html.\n'
      + 'Looked for: ' + find + '\n'
      + 'The storefront changed. Fix this patch rather than shipping a demo that does not boot.');
  }
  return src.replace(find, replace);
}

function storefrontParts() {
  var html = read('embed/storefront.html');
  html = patch(html,
    "var KEY = qs('k') || qs('key');",
    "var KEY = qs('k') || qs('key') || (window.OMEGA_DEMO && window.OMEGA_DEMO.demoKey) || '';",
    'the key lookup');
  var style = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [, ''])[1];
  var body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, ''])[1];
  /* Scripts are pulled out and re-run after the panel is in the DOM, or they
     would look for elements that do not exist yet. */
  var scripts = [];
  body = body.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, function (_, code) {
    scripts.push(code); return '';
  });
  return { style: style, body: body, script: scripts.join('\n;\n') };
}

var SF = storefrontParts();

/* The catalogue the demo sells from. Same file the setup page publishes. */
var PRODUCTS = (function () {
  try { return JSON.parse(read('tenants/cleancell/products.json')); }
  catch (e) { return P.STOREFRONT.products; }
})();

var CFG = {
  /* Not a real key and not checked by anything — the shim answers every
     call. It exists so the storefront's own "missing its key" guard, which
     is correct behaviour on the web, does not stop the offline copy. */
  demoKey: 'omega_pk_demo_offline',
  tenant: P.TENANT,
  storefront: (function () {
    var s = {}, k;
    for (k in P.STOREFRONT) if (Object.prototype.hasOwnProperty.call(P.STOREFRONT, k)) s[k] = P.STOREFRONT[k];
    s.products = PRODUCTS;
    /* The cost basis never travels. It is not in the repo and it is certainly
       not in a file somebody mails around. */
    delete s.capexPerKwh; delete s.capexPerKw;
    return s;
  })(),
  parcel: P.PARCEL_RING,
  statusFlow: P.STATUS_FLOW,
  statusLabel: P.STATUS_LABEL
};

/* Panels rendered by the SAME builders the local preview serves, so the two
   cannot drift. Their internal <a href="/..."> links are rewritten to the
   in-page router. */
function panel(html) {
  return String(html)
    .replace(/<!doctype html>[\s\S]*?<body[^>]*>/i, '')
    .replace(/<\/body>\s*<\/html>\s*$/i, '')
    .replace(/href="\/(desk|ops|design|host)(\?[^"]*)?"/g, 'href="#$1"');
}

var PANELS = {
  home:   panel(P.hostPage()).replace(/<script[\s\S]*?<\/script>/gi, '<div id="storefront-mount"></div>'),
  desk:   panel(P.deskPage()),
  design: panel(P.designPage({}))
};

var NAV = [
  ['home',   'Their website'],
  ['store',  'The storefront'],
  ['desk',   'Design desk'],
  ['ops',    'Order desk'],
  ['design', 'Site map']
];

var A = P.TENANT.accent || '#2B5FA8';

var out = [
'<!doctype html><html lang="en"><head><meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1">',
'<title>' + P.TENANT.name + ' \u00d7 ClearSky OMEGA \u2014 demo</title>',
'<style>',
':root{--a:' + A + '}',
'body{margin:0;font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828;background:#f4f6f9}',
'#topnav{position:sticky;top:0;z-index:99;background:#101828;color:#fff;display:flex;align-items:center;gap:4px;padding:0 14px;flex-wrap:wrap}',
'#topnav .brand{font-weight:750;font-size:13px;letter-spacing:.04em;padding:12px 12px 12px 4px;color:#aebccb}',
'#topnav a{color:#cfd9e3;text-decoration:none;font-size:13px;font-weight:600;padding:12px 12px;border-bottom:3px solid transparent}',
'#topnav a.on{color:#fff;border-bottom-color:var(--a)}',
'#topnav a:hover{color:#fff}',
'#offline{margin-left:auto;font-size:11px;color:#7d8b99;padding:12px 4px}',
'.panel{display:none}.panel.on{display:block}',
SF.style,
'</style></head><body>',
'<div id="topnav"><span class="brand">' + P.TENANT.name.toUpperCase() + ' \u00d7 OMEGA</span>',
NAV.map(function (n) { return '<a href="#' + n[0] + '" data-p="' + n[0] + '">' + n[1] + '</a>'; }).join(''),
'<span id="offline">offline demo \u00b7 no server, no network</span></div>',

'<div class="panel" id="p-home">' + PANELS.home + '</div>',
/* ── A BILL THAT LANDS WELL ────────────────────────────────────────────
   The sizer is honest, which means some bills size to a system the
   catalogue cannot cover cleanly — 1400 kW with 4 h of backup comes out at
   125 kW / 450 kWh, and 450 does not divide into a 215 kWh ladder without
   busting the oversupply guard, so the page correctly says "we will come
   back to you". True, and a flat moment in front of a CEO.

   These numbers size to 575 kW / 1,200 kWh and offer three ways to build
   it. Printed on the page so nobody has to remember them under pressure. */
'<div class="panel" id="p-store">',
'<div style="max-width:760px;margin:16px auto 0;padding:10px 14px;background:#eef4fb;',
'border:1px solid #c9dcef;border-radius:9px;font-size:13px;color:#1c4e80">',
'<b>Demo bill that lands well:</b> demand charge <b>18.5</b>, energy rate <b>0.11</b>, ',
'backup <b>2</b> hours, and one month at <b>1400</b> kW / <b>620000</b> kWh. ',
'That sizes 575 kW / 1,200 kWh and offers three builds.',
'</div>',
SF.body + '</div>',
'<div class="panel" id="p-desk">' + PANELS.desk + '</div>',
'<div class="panel" id="p-ops"></div>',
'<div class="panel" id="p-design">' + PANELS.design + '</div>',

'<script>window.OMEGA_DEMO = ' + JSON.stringify(CFG) + ';<\/script>',
'<script>' + read('api/_lib/bess-engine.js').replace(/module\.exports\s*=.*$/m, '') + '<\/script>',
'<script>var module={exports:{}};' + read('api/_lib/site-fit.js') + ';window.OmegaSiteFit=module.exports;<\/script>',
'<script>var module2={exports:{}};(function(module){' + read('api/_lib/product-fit.js')
  + '})(module2);window.OmegaProductFit=module2.exports;<\/script>',
'<script>' + read('omega-tools.js') + '<\/script>',

/* ── The shim. The only fake thing in the file. ───────────────────────── */
'<script>',
'(function () {',
'  var C = window.OMEGA_DEMO, SF = C.storefront, FIT = window.OmegaSiteFit;',
'  var ENG = window.OmegaBessSizerEngine, PF = window.OmegaProductFit;',
'  var N = 0;',
'  function orders() { try { return JSON.parse(sessionStorage.getItem("omega_demo_orders") || "[]"); } catch (e) { return []; } }',
'  function saveOrders(a) { try { sessionStorage.setItem("omega_demo_orders", JSON.stringify(a)); } catch (e) {} }',
'  function bySku(s) { for (var i = 0; i < SF.products.length; i++) if (SF.products[i].sku === s) return SF.products[i]; return null; }',
'  function ok(o) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(o); } }); }',
'  function bad(c, m) { return Promise.resolve({ ok: false, status: c, json: function () { return Promise.resolve({ error: m }); } }); }',
'',
'  function config() {',
'    var t = C.tenant;',
'    return ok({ ok: true,',
'      brand: { orgId: "cleancell.us", name: t.name, platformName: t.platformName, shortName: t.name,',
'               logoUrl: "", accent: t.accent, ink: "", supportEmail: t.supportEmail, supportPhone: "",',
'               attribution: t.attribution || "" },',
'      copy: { headline: SF.headline, intro: SF.intro, disclaimer: SF.disclaimer, cta: SF.cta || "Request this system" },',
'      flow: { requireAddress: !!SF.requireAddress, collectBill: SF.collectBill !== false,',
'              hasCatalog: SF.products.length > 0, siteStudy: SF.siteStudy !== false,',
'              studyNeedsContact: false, designerPitch: SF.designerPitch !== false },',
'      products: SF.products.map(function (p) {',
'        return { sku: p.sku, name: p.name, blurb: p.blurb || "", imageUrl: "", kw: p.kw, kwh: p.kwh,',
'                 widthFt: p.widthFt, depthFt: p.depthFt,',
'                 integrates: p.integrates || { pcs: false, xfmr: false, disco: false },',
'                 chemistry: p.chemistry || "", warrantyYears: p.warrantyYears || null,',
'                 leadTimeDays: p.leadTimeDays || null, priceMode: p.priceMode || "quote", listPrice: null };',
'      }), config: null });',
'  }',
'',
'  function size(b) {',
'    var months = (b.months || []).map(function (m, i) {',
'      return { month: m.month != null ? m.month : i, demandKw: +m.demandKw || null, kwh: +m.kwh || null };',
'    });',
'    if (!months.length) return bad(400, "Enter at least one month from your utility bill.");',
'    var tariff = {};',
'    if (+b.demandChargePerKw) tariff.demandChargePerKw = +b.demandChargePerKw;',
'    if (+b.energyRate) tariff.energyRate = +b.energyRate;',
'    var opts = { tariff: tariff };',
'    if (+b.backupHours) opts.peakHours = Math.min(12, +b.backupHours);',
'    var r = ENG.sizeFromMonthly(months, opts);',
'    if (!r || !r.ok) return bad(422, (r && r.error) || "Those numbers do not size a system.");',
'    var sum = ENG.summarize(r);',
'    if (!sum) return bad(422, "Those numbers do not size a system.");',
'    var fits = PF.fitProducts(SF.products, sum.kw, sum.kwh).map(function (f) {',
'      var p = f.p;',
'      return { sku: p.sku, name: p.name, kw: p.kw, kwh: p.kwh, priceMode: p.priceMode || "quote",',
'               listPrice: null, qty: f.qty, totalKw: Math.round(f.totKw), totalKwh: Math.round(f.totKwh) };',
'    });',
'    return ok({ ok: true,',
'      system: { kw: sum.kw, kwh: sum.kwh, durationH: sum.durationH, basis: sum.basis,',
'                confidence: sum.confidence, assumedDuration: sum.assumedDuration, feasible: sum.feasible },',
'      sensitivity: (r.sensitivity || []).map(function (x) { return { hours: x.hours, nameplateKwh: x.nameplateKwh }; }),',
'      products: fits, economics: null,',
'      sizingToken: { kw: sum.kw, kwh: sum.kwh, months: months.length, at: new Date().toISOString() } });',
'  }',
'',
'  function layout(b) {',
'    var p = bySku(b.sku);',
'    if (!p) return bad(422, "That product is not in this catalogue.");',
'    if (!p.widthFt || !p.depthFt) return bad(422, "This product has no footprint on file yet.");',
'    var study;',
'    try {',
'      study = FIT.study(C.parcel, { model: p.name, widthFt: p.widthFt, depthFt: p.depthFt, kw: p.kw, kwh: p.kwh },',
'        { kw: +(b.system && b.system.kw) || null, kwh: +(b.system && b.system.kwh) || null },',
'        { setbackFt: SF.setbackFt, clearanceFt: SF.clearanceFt, aisleFt: SF.aisleFt,',
'          rowsPerBlock: SF.rowsPerBlock, usable: null });',
'    } catch (e) { return bad(422, e.message || "We could not use the parcel record at that address."); }',
'    return ok({ ok: true, found: true,',
'      at: { lat: 41.8781, lng: -87.6298, matched: String(b.address || "").toUpperCase() || "1 INDUSTRIAL DR, CHICAGO, IL" },',
'      site: { acres: study.parcelAcres, zoning: "M-1", county: "Cook", source: "stub parcel \u2014 offline demo" },',
'      parcel: study.parcel, usable: study.usable, packing: study.packing,',
'      fits: study.fits, reason: study.reason, assumptions: study.assumptions, unverified: study.unverified });',
'  }',
'',
'  function order(b) {',
'    if (b.consent !== true) return bad(400, "Please confirm you would like us to contact you.");',
'    if (!b.customer || !b.customer.name) return bad(400, "Please give us a name to put on the order.");',
'    if (!b.customer.email) return bad(400, "Please give us an email address we can reply to.");',
'    var a = orders(); N = a.length + 1;',
'    var no = "CLEA-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + ("0000" + N).slice(-5);',
'    var items = (b.items || []).map(function (it) {',
'      var p = bySku(it.sku);',
'      return { sku: it.sku, qty: +it.qty || 1, name: (p && p.name) || it.sku, kwh: p && p.kwh, kw: p && p.kw };',
'    });',
'    var kwh = 0, kw = 0;',
'    items.forEach(function (i) { kwh += (+i.kwh || 0) * i.qty; kw += (+i.kw || 0) * i.qty; });',
'    a.unshift({ id: "d" + N, orderNo: no, status: "new", customer: b.customer, items: items,',
'                address: b.address || "", energyKwh: kwh, powerKw: kw, at: new Date().toISOString() });',
'    saveOrders(a);',
'    return ok({ ok: true, orderId: "d" + N, orderNo: no, message: SF.thanks });',
'  }',
'',
'  var real = window.fetch ? window.fetch.bind(window) : null;',
'  window.fetch = function (url, init) {',
'    var u = String(url || ""), b = {};',
'    try { b = JSON.parse((init && init.body) || "{}"); } catch (e) {}',
'    if (u.indexOf("/api/embed-config") >= 0) return config();',
'    if (u.indexOf("/api/embed-size") >= 0) return size(b);',
'    if (u.indexOf("/api/embed-layout") >= 0) return layout(b);',
'    if (u.indexOf("/api/embed-order") >= 0) return order(b);',
'    return real ? real(url, init) : bad(404, "offline demo");',
'  };',
'  window.OMEGA_DEMO_ORDERS = { get: orders, save: saveOrders };',
'})();',
'<\/script>',

/* ── Router + the order desk, which is the one panel that has to be live ── */
'<script>',
'(function () {',
'  var C = window.OMEGA_DEMO;',
'  function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}',
'  function renderOps() {',
'    var a = window.OMEGA_DEMO_ORDERS.get();',
'    var rows = a.map(function (o) {',
'      var i = C.statusFlow.indexOf(o.status);',
'      var next = (i >= 0 && i < C.statusFlow.length - 1) ? C.statusFlow[i + 1] : null;',
'      var lines = o.items.length',
'        ? o.items.map(function (it) { return "<div><b>" + it.qty + "\\u00d7</b> " + esc(it.name) + "</div>"; }).join("")',
'        : "<div style=\\"font-style:italic;color:#5b6b7c\\">Enquiry only \\u2014 asking about the design platform</div>";',
'      return "<tr><td><b style=\\"font-family:ui-monospace,Menlo,monospace;font-size:13px\\">" + esc(o.orderNo) + "</b></td>"',
'        + "<td><b>" + esc(o.customer.name) + "</b><div style=\\"font-size:12px;color:#5b6b7c\\">" + esc(o.customer.email) + "</div></td>"',
'        + "<td>" + lines + (o.energyKwh ? "<div style=\\"font-size:12px;color:#5b6b7c\\">" + o.energyKwh.toLocaleString() + " kWh</div>" : "") + "</td>"',
'        + "<td><span class=\\"st\\">" + esc(C.statusLabel[o.status] || o.status) + "</span></td>"',
'        + "<td>" + (next ? "<button data-id=\\"" + o.id + "\\" data-to=\\"" + next + "\\">" + esc(C.statusLabel[next]) + " \\u2192</button>" : "done") + "</td></tr>";',
'    }).join("");',
'    document.getElementById("p-ops").innerHTML =',
'      "<div style=\\"max-width:1060px;margin:0 auto;padding:24px 18px 70px\\">"',
'      + "<h2 style=\\"font-size:18px;margin:0 0 4px\\">" + esc(C.tenant.name) + " \\u2014 Order Desk</h2>"',
'      + "<p style=\\"color:#5b6b7c;font-size:13px;margin:0 0 18px\\">Orders placed on the storefront in this session. "',
'      + "The ladder only moves forward, the same as <code>api/orders.js</code>.</p>"',
'      + (a.length',
'        ? "<table style=\\"width:100%;border-collapse:collapse;background:#fff;border:1px solid #e4e7ec;border-radius:10px\\">"',
'          + "<thead><tr><th>Order</th><th>Customer</th><th>What they asked for</th><th>Status</th><th>Advance</th></tr></thead>"',
'          + "<tbody>" + rows + "</tbody></table>"',
'        : "<div style=\\"background:#fff;border:1px solid #e4e7ec;border-radius:10px;padding:34px;text-align:center;color:#5b6b7c\\">"',
'          + "No orders yet. Place one on <a href=\\"#store\\">the storefront</a> and it lands here.</div>")',
'      + "</div>";',
'  }',
'  document.addEventListener("click", function (e) {',
'    var b = e.target.closest && e.target.closest("#p-ops button[data-id]"); if (!b) return;',
'    var a = window.OMEGA_DEMO_ORDERS.get();',
'    for (var i = 0; i < a.length; i++) if (a[i].id === b.getAttribute("data-id")) a[i].status = b.getAttribute("data-to");',
'    window.OMEGA_DEMO_ORDERS.save(a); renderOps();',
'  });',
'  function show(name) {',
'    var ps = document.querySelectorAll(".panel");',
'    for (var i = 0; i < ps.length; i++) ps[i].className = "panel" + (ps[i].id === "p-" + name ? " on" : "");',
'    var as = document.querySelectorAll("#topnav a");',
'    for (var j = 0; j < as.length; j++) as[j].className = (as[j].getAttribute("data-p") === name) ? "on" : "";',
'    if (name === "ops") renderOps();',
'    window.scrollTo(0, 0);',
'  }',
'  window.addEventListener("hashchange", function () { show((location.hash || "#home").slice(1)); });',
'  show((location.hash || "#home").slice(1) || "home");',
'  /* The storefront mounts inside the home panel too, so "on their website"',
'     and "the storefront" are the same running instance rather than two. */',
'  var mount = document.getElementById("storefront-mount");',
'  if (mount) mount.innerHTML = "<p style=\\"color:#5b6b7c;font-size:13px\\">The storefront is on "',
'    + "<a href=\\"#store\\">the next tab</a> \\u2014 in the hosted demo it is embedded right here by "',
'    + "<code>embed/loader.js</code>.</p>";',
'})();',
'<\/script>',

/* The storefront's own script, last, once its markup is in the document. */
'<script>' + SF.script + '<\/script>',
'</body></html>'
].join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

var kb = Math.round(out.length / 1024);
console.log('\n  ' + OUT);
console.log('  ' + new Array(58).join('\u2500'));
console.log('  ' + kb + ' KB, one file, no server and no network.');
console.log('  Real: sizing, parcel geometry, product fit, tool catalogue,');
console.log('        and embed/storefront.html inlined verbatim.');
console.log('  Faked: window.fetch. Nothing else \u2014 so it authorises nothing');
console.log('        and reaches nothing, which is what makes it mailable.\n');
