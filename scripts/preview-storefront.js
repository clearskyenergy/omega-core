#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/preview-storefront.js — see the white-label storefront, locally
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

       node scripts/preview-storefront.js          →  http://localhost:8788/

   WHY THIS EXISTS. The storefront is the one page in the repo that cannot be
   opened by double-clicking it: it is useless until /api/embed-config answers,
   and those functions need Firestore, a service account, an embed key and a
   live tenant. So "what does it look like" was a question nobody could answer
   without deploying, and a feature you cannot look at is a feature nobody
   reviews.

   WHAT IS REAL HERE, AND WHAT IS NOT — the distinction is the whole point:

     REAL · embed/storefront.html and embed/loader.js, served from disk. The
            actual files that ship. Not a mock-up of them.
     REAL · api/_lib/bess-engine.js does the sizing. The kW and kWh on screen
            are the numbers the live endpoint would return.
     REAL · api/_lib/site-fit.js does the site study. The parcel is projected,
            the setback rastered, the yard proposed and the units packed by
            the same code, so the drawing is the drawing.

     STUB · Firestore. The tenant, the catalogue and the storefront config are
            the literals below instead of omega_orgs/{org}/storefront/config.
     STUB · The parcel lookup. A fixed ring stands in for Regrid and the county
            layers, so this costs nothing and works offline.
     STUB · The gates. No embed key is checked, no origin is matched, no lead
            receipt is required and no order is written anywhere. Every one of
            those is enforced in the real endpoints and tested in
            scripts/tests/tembedlayout.js — they are absent HERE so the page
            can be looked at, and their absence is why this is localhost only.

   ⚠ NEVER expose this. It binds to 127.0.0.1 for that reason. It is a
   viewer, not a deployment, and it has no authorisation of any kind.

   Node 18+. No dependencies, no build step — same rule as everything else.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var ROOT = path.join(__dirname, '..');
var engine = require(path.join(ROOT, 'api', '_lib', 'bess-engine.js'));
var FIT = require(path.join(ROOT, 'api', '_lib', 'site-fit.js'));

var PORT = Number(process.argv[2]) || 8788;

/* --products <file.json>: run the preview on a catalogue the IMPORTER
   produced (scripts/import-products.js --out), rather than the literals
   below. That closes the loop — the sheet a manufacturer sent is the thing
   you are looking at, not a hand-kept copy that drifts away from it. */
var PRODUCTS_FILE = (function () {
  var i = process.argv.indexOf('--products');
  return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : '';
})();

/* ── The stand-in tenant ────────────────────────────────────────────────
   Shaped exactly like omega_orgs/{orgId}/storefront/config so that what you
   see here is what seeding that document produces. Two products, both with a
   real footprint, because a product without one is correctly refused a site
   study and the preview should show the working case. */
var TENANT = {
  name: 'Clean Cell',
  accent: '#1F6F4A',
  platformName: 'Clean Cell Power Platform',
  supportEmail: 'orders@example.com',
  supportPhone: '',
  attribution: ''                      /* 'none' on the public surface */
};

var STOREFRONT = {
  headline: 'Size your Clean Cell storage system',
  intro: 'Enter what your utility bill says and we will size a system for your site. '
       + 'No account needed.',
  disclaimer: 'Indicative only. Peak duration is estimated from monthly billing data; '
            + 'interval data from your utility settles the final size. Not a quotation.',
  thanks: 'Thank you — your request is with the Clean Cell team. We will be in touch shortly.',
  cta: 'Request this system',
  requireAddress: true,
  showEconomics: true,
  siteStudy: true,
  designerPitch: true,
  requireContactForLayout: true,
  setbackFt: 15, clearanceFt: 5, aisleFt: 20, rowsPerBlock: 2,
  capexPerKwh: 380, capexPerKw: 240,   /* stub cost basis; never returned */
  products: [
    { sku: 'CC-372', name: 'CleanCell 372 cabinet', kw: 100, kwh: 372,
      widthFt: 8, depthFt: 4, chemistry: 'LFP', warrantyYears: 10,
      leadTimeDays: 120, priceMode: 'quote',
      integrates: { pcs: true, xfmr: false, disco: true },
      blurb: 'Outdoor-rated cabinet. Pad or pier mount.' },
    { sku: 'CC-2000', name: 'CleanCell 2000 container', kw: 500, kwh: 2000,
      widthFt: 20, depthFt: 8, chemistry: 'LFP', warrantyYears: 10,
      leadTimeDays: 180, priceMode: 'quote',
      integrates: { pcs: true, xfmr: true, disco: true },
      blurb: '20 ft container, integrated thermal and fire suppression.' }
  ]
};

if (PRODUCTS_FILE) {
  try {
    var loaded = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    if (Array.isArray(loaded) && loaded.length) {
      STOREFRONT.products = loaded;
      console.log('  catalogue: ' + loaded.length + ' product(s) from ' + PRODUCTS_FILE);
    }
  } catch (e) { console.error('  could not read ' + PRODUCTS_FILE + ': ' + e.message); }
}

/* An irregular industrial parcel — deliberately not a rectangle, because a
   rectangle makes the setback raster and the largest-rectangle search look
   easier than they are. ~2.6 acres off an access road. */
var PARCEL_ACRES_NOTE = 'stub parcel; stands in for Regrid / the county layers';
var LAT0 = 41.8781, LNG0 = -87.6298;
function ll(xFt, yFt) {
  var latFt = 364000, lngFt = 364000 * Math.cos(LAT0 * Math.PI / 180);
  return [LAT0 + yFt / latFt, LNG0 + xFt / lngFt];
}
var PARCEL_RING = [
  ll(0, 0), ll(430, 0), ll(430, 120), ll(360, 190),
  ll(360, 300), ll(150, 300), ll(90, 250), ll(0, 250)
];

/* ── Helpers ───────────────────────────────────────────────────────────── */
function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function json(res, code, obj) { send(res, code, JSON.stringify(obj)); }
function fail(res, code, msg) { json(res, code, { error: msg }); }
function readBody(req) {
  return new Promise(function (resolve) {
    var b = '';
    req.on('data', function (d) { b += d; if (b.length > 2e6) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve({}); } });
  });
}
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
function nOrNull(v) { return (v === undefined || v === null || v === '') ? null : num(v); }

/* ── The four endpoints, answering the shapes the page expects ─────────── */

function embedConfig(res) {
  var products = STOREFRONT.products.map(function (p) {
    return {
      sku: p.sku, name: p.name, blurb: p.blurb, imageUrl: '',
      /* null, not absent — api/embed-config.js builds every key with num(),
         so a product with no footprint still carries widthFt: null. The
         preview emitting nothing at all made the two disagree, which is
         exactly the kind of drift a preview exists to avoid. */
      kw: nOrNull(p.kw), kwh: nOrNull(p.kwh),
      widthFt: nOrNull(p.widthFt), depthFt: nOrNull(p.depthFt),
      chemistry: p.chemistry, warrantyYears: p.warrantyYears,
      integrates: {
        pcs: !!(p.integrates && p.integrates.pcs),
        xfmr: !!(p.integrates && p.integrates.xfmr),
        disco: !!(p.integrates && p.integrates.disco)
      },
      leadTimeDays: p.leadTimeDays, priceMode: p.priceMode,
      listPrice: p.priceMode === 'list' ? p.listPrice : null
    };
  });
  json(res, 200, {
    ok: true,
    brand: {
      orgId: 'cleancell.us',
      name: TENANT.name, platformName: TENANT.platformName, shortName: TENANT.name,
      logoUrl: '', accent: TENANT.accent, ink: '',
      supportEmail: TENANT.supportEmail, supportPhone: TENANT.supportPhone,
      attribution: TENANT.attribution
    },
    copy: {
      headline: STOREFRONT.headline, intro: STOREFRONT.intro,
      disclaimer: STOREFRONT.disclaimer, cta: STOREFRONT.cta
    },
    flow: {
      requireAddress: STOREFRONT.requireAddress, collectBill: true,
      hasCatalog: products.length > 0,
      siteStudy: STOREFRONT.siteStudy && products.some(function (p) { return p.widthFt && p.depthFt; }),
      studyNeedsContact: STOREFRONT.requireContactForLayout !== false,
      designerPitch: STOREFRONT.designerPitch !== false
    },
    products: products,
    config: null
  });
}

function embedSize(res, b) {
  var months = (b.months || []).map(function (m, i) {
    return { month: m.month != null ? m.month : i, demandKw: num(m.demandKw), kwh: num(m.kwh) };
  });
  if (!months.length) return fail(res, 400, 'Enter at least one month from your utility bill.');

  var tariff = {};
  if (num(b.demandChargePerKw)) tariff.demandChargePerKw = num(b.demandChargePerKw);
  if (num(b.energyRate)) tariff.energyRate = num(b.energyRate);
  tariff.capexPerKwh = STOREFRONT.capexPerKwh;
  tariff.capexPerKw = STOREFRONT.capexPerKw;

  var opts = { tariff: tariff };
  if (num(b.backupHours)) opts.peakHours = Math.min(12, num(b.backupHours));

  var r = engine.sizeFromMonthly(months, opts);
  if (!r || !r.ok) return fail(res, 422, (r && r.error) || 'Those numbers do not size a system.');
  var sum = engine.summarize(r);
  if (!sum) return fail(res, 422, 'Those numbers do not size a system.');

  /* The capex column is dropped here exactly as api/embed-size.js drops it —
     if the preview leaked it, reviewers would review the wrong thing. */
  var band = (r.sensitivity || []).map(function (x) {
    return { hours: x.hours, nameplateKwh: x.nameplateKwh };
  });

  /* THE REAL RANKING, not a copy of it. api/embed-size.js exports fitProducts
     through its _helpers seam; a second implementation here would drift, and
     the drifted one would be the one people look at and believe. */
  var fitProducts = require(path.join(ROOT, 'api', '_lib', 'product-fit.js')).fitProducts;
  var products = fitProducts(STOREFRONT.products, sum.kw, sum.kwh).map(function (f) {
    var p = f.p;
    return { sku: p.sku, name: p.name, kw: p.kw, kwh: p.kwh,
             priceMode: p.priceMode, listPrice: p.priceMode === 'list' ? p.listPrice : null,
             qty: f.qty, totalKw: Math.round(f.totKw), totalKwh: Math.round(f.totKwh) };
  });

  var economics = null;
  if (STOREFRONT.showEconomics) {
    var listed = products.filter(function (f) { return f.priceMode === 'list' && f.listPrice; })[0];
    var price = listed ? listed.listPrice * listed.qty : null;
    economics = {
      savingsYr: Math.round(sum.savingsYr || 0),
      paybackYr: price ? +(price / Math.max(1, sum.savingsYr || 0)).toFixed(1) : null,
      priceBasis: price ? 'published-list-price' : 'none'
    };
  }

  json(res, 200, {
    ok: true,
    system: { kw: sum.kw, kwh: sum.kwh, durationH: sum.durationH, basis: sum.basis,
              confidence: sum.confidence, assumedDuration: sum.assumedDuration, feasible: sum.feasible },
    sensitivity: band,
    products: products,
    economics: economics,
    sizingToken: { kw: sum.kw, kwh: sum.kwh, months: months.length, at: new Date().toISOString() }
  });
}

function embedLayout(res, b) {
  var p = null;
  for (var i = 0; i < STOREFRONT.products.length; i++) {
    if (STOREFRONT.products[i].sku === b.sku) p = STOREFRONT.products[i];
  }
  if (!p) return fail(res, 422, 'That product is not in this catalogue.');
  if (!p.widthFt || !p.depthFt) return fail(res, 422, 'This product has no footprint on file yet.');

  var study;
  try {
    study = FIT.study(PARCEL_RING,
      { model: p.name, widthFt: p.widthFt, depthFt: p.depthFt, kw: p.kw, kwh: p.kwh },
      { kw: num(b.system && b.system.kw), kwh: num(b.system && b.system.kwh) },
      { setbackFt: STOREFRONT.setbackFt, clearanceFt: STOREFRONT.clearanceFt,
        aisleFt: STOREFRONT.aisleFt, rowsPerBlock: STOREFRONT.rowsPerBlock,
        usable: b.usable && num(b.usable.w) ? {
          x: num(b.usable.x) || 0, y: num(b.usable.y) || 0,
          w: num(b.usable.w), h: num(b.usable.h)
        } : null });
  } catch (e) {
    return fail(res, 422, e.message || 'We could not use the parcel record at that address.');
  }

  json(res, 200, {
    ok: true, found: true,
    at: { lat: LAT0, lng: LNG0,
          matched: String(b.address || '').toUpperCase() || '1 INDUSTRIAL DR, CHICAGO, IL' },
    site: { acres: study.parcelAcres, zoning: 'M-1', county: 'Cook', source: PARCEL_ACRES_NOTE },
    parcel: study.parcel, usable: study.usable, packing: study.packing,
    fits: study.fits, reason: study.reason,
    assumptions: study.assumptions, unverified: study.unverified
  });
}

var ORDER_N = 0;
function embedOrder(res, b) {
  if (b.consent !== true) return fail(res, 400, 'Please confirm you would like us to contact you.');
  if (!b.customer || !b.customer.name) return fail(res, 400, 'Please give us a name to put on the order.');
  if (!b.customer.email) return fail(res, 400, 'Please give us an email address we can reply to.');
  ORDER_N++;
  var no = 'CLEA-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + ('0000' + ORDER_N).slice(-5);
  console.log('  [order] ' + no + '  ' + b.customer.email +
              (b.items && b.items.length ? '  items: ' + b.items.map(function (i) { return i.qty + '× ' + i.sku; }).join(', ')
                                         : '  (enquiry only)'));
  json(res, 200, { ok: true, orderId: 'preview' + ORDER_N, orderNo: no, message: STOREFRONT.thanks });
}

/* ── Static + routing ──────────────────────────────────────────────────── */
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
              '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

var HOST_PAGE = [
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>cleancell.us — preview</title><style>',
  'body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1b2a22}',
  '.bar{background:#0E3B27;color:#fff;padding:14px 28px;display:flex;align-items:center;gap:18px}',
  '.bar .logo{font-weight:800;letter-spacing:.02em;font-size:18px}',
  '.bar nav{margin-left:auto;display:flex;gap:22px;font-size:14px;opacity:.85}',
  '.hero{background:#F3F6F4;padding:44px 28px;border-bottom:1px solid #dfe5e1}',
  '.hero h1{margin:0 0 8px;font-size:30px;max-width:620px;line-height:1.2}',
  '.hero p{margin:0;color:#4a5a52;max-width:620px}',
  '.wrap{max-width:900px;margin:0 auto;padding:30px 20px 60px}',
  '.note{background:#FFF4D6;border:1px solid #E6D08A;color:#6B5310;padding:10px 14px;',
  'border-radius:8px;font-size:13px;margin:0 0 22px}',
  '</style></head><body>',
  '<div class="bar"><span class="logo">CLEAN CELL</span>',
  '<nav><span>Products</span><span>Technology</span><span>Support</span></nav></div>',
  '<div class="hero"><h1>Commercial energy storage, built in the USA.</h1>',
  '<p>LFP cabinets and containers for peak shaving, backup and grid services.</p></div>',
  '<div class="wrap">',
  '<p class="note"><b>Local preview.</b> This page stands in for cleancell.us. ',
  'Everything below the line is the real storefront, loaded through embed/loader.js ',
  'exactly as the two-line snippet would load it on their own site.</p>',
  '<div id="storefront"></div>',
  '<script src="/embed/loader.js" data-key="omega_pk_live_preview0000000000000000000000" ',
  'data-target="#storefront" async><\/script>',
  '</div></body></html>'
].join('\n');

/* A page that stands the gate up in one state. The gate is the real file;
   only Firebase is faked, because the whole point is to see what a person in
   that state actually gets. */
function gatePage(state) {
  var user = state === 'signed-out' ? 'null' : "{ email: 'dana@northgatefoods.com' }";
  var org = 'northgatefoods.com';
  var docs = {
    'pending':   "{ 'omega_orgs/" + org + "': { status: 'pending' } }",
    'suspended': "{ 'omega_orgs/" + org + "': { status: 'suspended' } }",
    'plan':      "{ 'omega_orgs/" + org + "': { status: 'active' }, 'omega_orgs/" + org + "/billing/current': { tier: 'standard', toolOverrides: { editor: false } } }",
    'active':    "{ 'omega_orgs/" + org + "': { status: 'active' } }"
  }[state] || '{}';
  var S = '<' + 'script>', SE = '<' + '/' + 'script>';
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Designer</title><style>body{margin:0;background:#101C2B;color:#9fb;',
    'font:15px system-ui;height:100vh;display:flex;align-items:center;justify-content:center}</style>',
    '</head><body>',
    '<div style="opacity:.3">(the designer would be here)</div>',
    S,
    'window.CLEARSKY_CONFIG = { tenant: { orgId: "cleancell.us", clientName: "Clean Cell",',
    '  whiteLabel: { enabled: true, platformName: "Clean Cell Power Platform",',
    '                shortName: "Clean Cell", accent: "#1F6F4A",',
    '                supportEmail: "orders@example.com" } } };',
    'var DOCS = ' + docs + ';',
    'window.firebase = { apps:[1],',
    '  auth: function(){ return { currentUser: ' + user + ', onAuthStateChanged: function(cb){ cb(' + user + '); } }; },',
    '  firestore: function(){ return { collection: function(c){ return { doc: function(d){',
    '    var key = c + "/" + d;',
    '    return { get: function(){ return Promise.resolve({ exists: !!DOCS[key], data: function(){ return DOCS[key]; } }); },',
    '             collection: function(c2){ return { doc: function(d2){ var k2 = key+"/"+c2+"/"+d2;',
    '               return { get: function(){ return Promise.resolve({ exists: !!DOCS[k2], data: function(){ return DOCS[k2]; } }); } }; } }; } };',
    '  } }; } }; } };',
    SE,
    '<' + 'script src="/omega-brand.js">' + SE,
    '<' + 'script src="/omega-whitelabel.js">' + SE,
    '<' + 'script src="/omega-editor-gate.js">' + SE,
    '</body></html>'
  ].join('\n');
}

var server = http.createServer(function (req, res) {
  var u = url.parse(req.url, true);
  var p = u.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  /* The host page — what a visitor to cleancell.us would see. */
  if (p === '/' || p === '/index.html') return send(res, 200, HOST_PAGE, TYPES['.html']);

  /* The storefront on its own, for looking at it without the frame. */
  if (p === '/embed/storefront' || p === '/embed/storefront.html') {
    return send(res, 200, fs.readFileSync(path.join(ROOT, 'embed', 'storefront.html')), TYPES['.html']);
  }
  if (p === '/embed/loader.js') {
    return send(res, 200, fs.readFileSync(path.join(ROOT, 'embed', 'loader.js')), TYPES['.js']);
  }

  /* ── The editor gate, in each state ──────────────────────────────────
     Serves the REAL omega-editor-gate.js against a stubbed Firebase so the
     refusal screens can be looked at. /gate/signed-out, /gate/pending,
     /gate/suspended, /gate/plan, /gate/active. */
  if (p.indexOf('/gate') === 0) {
    var state = p.split('/')[2] || 'signed-out';
    return send(res, 200, gatePage(state), TYPES['.html']);
  }
  if (p === '/omega-editor-gate.js' || p === '/omega-whitelabel.js' || p === '/omega-brand.js') {
    return send(res, 200, fs.readFileSync(path.join(ROOT, p.slice(1))), TYPES['.js']);
  }

  if (p === '/api/embed-config') return embedConfig(res);

  if (p.indexOf('/api/embed-') === 0) {
    if (req.method !== 'POST') return fail(res, 405, 'POST only');
    return readBody(req).then(function (b) {
      if (p === '/api/embed-size') return embedSize(res, b);
      if (p === '/api/embed-layout') return embedLayout(res, b);
      if (p === '/api/embed-order') return embedOrder(res, b);
      return fail(res, 404, 'no such endpoint');
    });
  }

  send(res, 404, 'not found', 'text/plain');
});

/* 127.0.0.1 ONLY. This server checks no key, no origin and no receipt. */
server.listen(PORT, '127.0.0.1', function () {
  console.log('\n  Storefront preview');
  console.log('  ──────────────────');
  console.log('  On a host page (what cleancell.us would look like):');
  console.log('      http://localhost:' + PORT + '/');
  console.log('  The editor gate, per account state:');
  console.log('      http://localhost:' + PORT + '/gate/signed-out   (also /pending /suspended /plan /active)');
  console.log('  The storefront on its own:');
  console.log('      http://localhost:' + PORT + '/embed/storefront?k=preview');
  console.log('\n  Real: the page, the sizing engine, the site-fit geometry.');
  console.log('  Stub: Firestore, the parcel lookup, and every gate.');
  console.log('  Localhost only — it authorises nothing.\n');
});
