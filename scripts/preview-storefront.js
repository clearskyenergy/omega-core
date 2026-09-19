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

/* ── THE ORDER QUEUE ──────────────────────────────────────────────────
   An order placed on the storefront has to LAND somewhere, or the demo
   stops halfway through the sentence it is making. api/orders.js and
   orders.html are the real desk; both need Firestore, so this keeps the
   same vocabulary in memory and serves /ops from it.

   IN MEMORY ON PURPOSE. Restarting the server empties the queue, which is
   the right behaviour for a demo you want to run twice in one afternoon.
   The status vocabulary is api/orders.js's, not an invented one, so what
   somebody sees here is what they would see on the real desk. */
var ORDER_N = 0;
var ORDERS = [];

var STATUS_FLOW = ['new', 'confirmed', 'quoted', 'accepted', 'in_fulfilment', 'shipped', 'complete'];
var STATUS_LABEL = {
  'new': 'New', confirmed: 'Confirmed', quoted: 'Quoted', accepted: 'Accepted',
  in_fulfilment: 'In fulfilment', shipped: 'Shipped', complete: 'Complete', cancelled: 'Cancelled'
};

function orderEnergy(items) {
  var kwh = 0, kw = 0;
  (items || []).forEach(function (it) {
    var p = null;
    for (var i = 0; i < STOREFRONT.products.length; i++) {
      if (STOREFRONT.products[i].sku === it.sku) p = STOREFRONT.products[i];
    }
    if (!p) return;
    kwh += (+p.kwh || 0) * (+it.qty || 1);
    kw  += (+p.kw  || 0) * (+it.qty || 1);
  });
  return { kwh: kwh, kw: kw };
}

function embedOrder(res, b) {
  if (b.consent !== true) return fail(res, 400, 'Please confirm you would like us to contact you.');
  if (!b.customer || !b.customer.name) return fail(res, 400, 'Please give us a name to put on the order.');
  if (!b.customer.email) return fail(res, 400, 'Please give us an email address we can reply to.');
  ORDER_N++;
  var no = 'CLEA-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + ('0000' + ORDER_N).slice(-5);
  var items = (b.items || []).map(function (it) {
    var p = null;
    for (var i = 0; i < STOREFRONT.products.length; i++) {
      if (STOREFRONT.products[i].sku === it.sku) p = STOREFRONT.products[i];
    }
    return { sku: it.sku, qty: +it.qty || 1, name: (p && p.name) || it.sku,
             kwh: (p && p.kwh) || null, kw: (p && p.kw) || null };
  });
  var e = orderEnergy(items);
  ORDERS.unshift({
    id: 'preview' + ORDER_N, orderNo: no, status: 'new',
    customer: b.customer, items: items,
    system: b.system || null, address: b.address || '',
    interest: items.length ? 'product' : 'platform',
    energyKwh: e.kwh, powerKw: e.kw,
    at: new Date().toISOString(),
    log: [{ to: 'new', at: new Date().toISOString(), by: 'storefront' }]
  });
  console.log('  [order] ' + no + '  ' + b.customer.email +
              (items.length ? '  items: ' + items.map(function (i) { return i.qty + '\u00d7 ' + i.sku; }).join(', ')
                            : '  (enquiry only)'));
  json(res, 200, { ok: true, orderId: 'preview' + ORDER_N, orderNo: no, message: STOREFRONT.thanks });
}

/* Advance an order. Same one-way ladder api/orders.js enforces: a status
   only moves forward, or to cancelled. A demo that let somebody click an
   order back to 'new' would be teaching the wrong thing about the product. */
function opsAdvance(res, b) {
  var o = null;
  for (var i = 0; i < ORDERS.length; i++) if (ORDERS[i].id === b.id) o = ORDERS[i];
  if (!o) return fail(res, 404, 'no such order');
  var to = String(b.to || '');
  if (to === 'cancelled') { o.status = 'cancelled'; }
  else {
    var cur = STATUS_FLOW.indexOf(o.status), nxt = STATUS_FLOW.indexOf(to);
    if (nxt < 0 || nxt <= cur) return fail(res, 409, 'that is not a forward transition');
    o.status = to;
  }
  o.log.push({ to: o.status, at: new Date().toISOString(), by: 'ops' });
  console.log('  [ops]   ' + o.orderNo + '  \u2192 ' + o.status);
  json(res, 200, { ok: true, status: o.status });
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

/* ══════════════════════════════════════════════════════════════════════
   PART 2 — THE DESIGN DESK THEY RESELL
   ──────────────────────────────────────────────────────────────────────
   Thomas: "white label the platform and ONLY use the site map editor and
   grid atlas to sell them a design tool that could be white labeled for
   cleancell and hosted on their site."

   So this is not a mock-up of two tiles. It loads the REAL omega-tools.js
   catalogue and the REAL OMEGATools.isUnlocked(), hands it the workspace a
   Clean Cell design customer actually gets —

       { tierLevel: 2, toolAccess: ['editor','gridatlas'] }

   — and renders whatever comes back. If somebody later adds a tool that
   slips the allowlist, this page shows it, which a hardcoded pair never
   would. The allowlist is billing/current.toolAccess; see docs/WHITE-LABEL.md
   §4b.

   The SIDE-BY-SIDE is the sales point. Same catalogue, same function, two
   workspaces: what Clean Cell's customer buys, and what the full account
   would open up. That second column is the upsell, on screen, honestly
   computed rather than asserted.

   REAL here: the tool catalogue, the entitlement filter, the brand block.
   STUB here: sign-in. Clicking a tool goes nowhere — this is the shape of
   the product, not a signed-in session. Said on the page so nobody
   demonstrating it has to remember to say it. */
var DESIGN_PRODUCT = ['editor', 'gridatlas'];

function deskPage() {
  var TOOLS = require(path.join(ROOT, 'omega-tools.js'));
  var cat = TOOLS.catalog();

  var bought = { tierLevel: 2, addons: ['whitelabel'], toolAccess: DESIGN_PRODUCT };
  var full   = { tierLevel: 3, addons: ['compute', 'parcelscreen', 'engineering',
                                        'schematics', 'exports', 'permitting', 'whitelabel'] };

  function pick(ws) {
    return cat.filter(function (t) { return TOOLS.isUnlocked(t, ws); });
  }
  var mine = pick(bought), theirs = pick(full);

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* The two tools they buy OPEN; everything in the right-hand column is
     greyed and inert, because that column is the upsell and not the
     product. `editor` is the Site Map, so it goes to the layout view. */
  function tile(t, on) {
    var href = on ? (t.key === 'editor' ? '/design' : t.key === 'gridatlas' ? '/design?view=atlas' : '') : '';
    var inner = '<div class="tname">' + esc(t.name) + (href ? ' <span class="go">open \u2192</span>' : '') + '</div>'
      + '<div class="tdesc">' + esc(t.desc || '') + '</div>'
      + '<div class="tkey">' + esc(t.key) + '</div>';
    return href
      ? '<a class="tile live" href="' + href + '">' + inner + '</a>'
      : '<div class="tile' + (on ? '' : ' off') + '">' + inner + '</div>';
  }

  var A = TENANT.accent || '#1F6F4A';
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + esc(TENANT.platformName) + ' — Design Desk</title>',
    '<style>',
    ':root{--a:' + A + ';--ink:#0d1b2a;--mute:#5b6b7c;--line:#dde3ea;--bg:#f4f6f9}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}',
    'header{background:var(--a);color:#fff;padding:22px 24px}',
    'header h1{margin:0;font-size:20px;font-weight:650;letter-spacing:.01em}',
    'header p{margin:6px 0 0;opacity:.9;font-size:14px}',
    'main{max-width:1060px;margin:0 auto;padding:26px 18px 70px}',
    '.note{background:#fdf4e3;border:1px solid #f0dcb0;color:#7a4a00;border-radius:9px;padding:12px 14px;font-size:13px;margin:0 0 22px}',
    '.cols{display:grid;grid-template-columns:1fr 1fr;gap:22px}',
    '@media(max-width:820px){.cols{grid-template-columns:1fr}}',
    'section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px}',
    'section h2{margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)}',
    'section .cnt{font-size:26px;font-weight:700;margin:0 0 14px}',
    '.tile{border:1px solid var(--line);border-radius:9px;padding:11px 12px;margin:0 0 9px;background:#fff;display:block;text-decoration:none;color:inherit}',
    'a.tile.live{border-color:var(--a);box-shadow:0 1px 3px rgba(0,0,0,.06)}',
    'a.tile.live:hover{background:#f7fbf9}',
    '.go{font-size:11px;font-weight:700;color:var(--a);letter-spacing:.02em}',
    '.tile.off{opacity:.42;background:#f8fafc}',
    '.tname{font-weight:650;font-size:14px}',
    '.tdesc{font-size:12.5px;color:var(--mute);margin-top:2px}',
    '.tkey{font:11px ui-monospace,Menlo,monospace;color:#94a3b8;margin-top:5px}',
    '.scroll{max-height:430px;overflow:auto;padding-right:4px}',
    'footer{max-width:1060px;margin:0 auto;padding:0 18px 40px;color:var(--mute);font-size:13px}',
    '</style></head><body>',
    '<header><h1>' + esc(TENANT.platformName) + '</h1>',
    '<p>Design desk — ' + esc(TENANT.name) + '’s own engineering tools, on '
      + esc(TENANT.name) + '’s own site.</p></header>',
    '<main>',
    '<div class="note"><b>This is the product shape, not a signed-in session.</b> '
      + 'The tool list below is produced by the real catalogue and the real entitlement '
      + 'filter (<code>OMEGATools.isUnlocked</code>) against '
      + '<code>toolAccess: [‘editor’,‘gridatlas’]</code> — so it is what a '
      + 'Clean Cell design customer would actually see. Sign-in is stubbed \u2014 the two tools on '
      + 'the left open onto the real layout engine; the greyed column is the upsell and is inert.</div>',
    '<div class="cols">',
    '<section><h2>What a Clean Cell customer buys</h2>',
    '<p class="cnt">' + mine.length + ' tool' + (mine.length === 1 ? '' : 's') + '</p>',
    mine.map(function (t) { return tile(t, true); }).join(''),
    '</section>',
    '<section><h2>What the full account opens up</h2>',
    '<p class="cnt">' + theirs.length + ' tools</p>',
    '<div class="scroll">',
    theirs.map(function (t) { return tile(t, DESIGN_PRODUCT.indexOf(t.key) >= 0); }).join(''),
    '</div></section>',
    '</div></main>',
    '<footer>Left column is the allowlist: <code>billing/current.toolAccess</code>, which wins '
      + 'over the tier, the addons and every override. Right column is the same catalogue with no '
      + 'allowlist — the second sale. Both computed by the same function.</footer>',
    '</body></html>'
  ].join('\n');
}

/* ══════════════════════════════════════════════════════════════════════
   FULFILMENT — the order desk, from the Clean Cell side
   ──────────────────────────────────────────────────────────────────────
   "our software being used to place orders and fulfil orders." Placing was
   already in; this is the other half, and without it the demo stops on the
   thank-you screen.

   Same vocabulary as api/orders.js and orders.html, which are the real desk
   — new, confirmed, quoted, accepted, in fulfilment, shipped, complete. The
   ladder is one-way here too, because a demo that let somebody click an
   order backwards would teach the wrong thing about the product.

   The rows are the orders placed in THIS session. Place one on the
   storefront, come here, move it. That round trip is the whole point. */
function opsPage() {
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var A = TENANT.accent || '#1F6F4A';
  var rows = ORDERS.map(function (o) {
    var i = STATUS_FLOW.indexOf(o.status);
    var next = (i >= 0 && i < STATUS_FLOW.length - 1) ? STATUS_FLOW[i + 1] : null;
    var lines = o.items.length
      ? o.items.map(function (it) {
          return '<div class="ln"><b>' + it.qty + '×</b> ' + esc(it.name)
               + ' <span class="sku">' + esc(it.sku) + '</span></div>';
        }).join('')
      : '<div class="ln enq">Enquiry only — asking about the design platform</div>';
    return '<tr>'
      + '<td><div class="no">' + esc(o.orderNo) + '</div>'
        + '<div class="when">' + esc(o.at.slice(0, 16).replace('T', ' ')) + ' UTC</div></td>'
      + '<td><div><b>' + esc(o.customer.name) + '</b></div>'
        + '<div class="mut">' + esc(o.customer.email) + '</div>'
        + (o.address ? '<div class="mut">' + esc(o.address) + '</div>' : '') + '</td>'
      + '<td>' + lines
        + (o.energyKwh ? '<div class="mut">' + o.energyKwh.toLocaleString() + ' kWh · '
                        + o.powerKw.toLocaleString() + ' kW</div>' : '') + '</td>'
      + '<td><span class="chip s-' + esc(o.status) + '">' + esc(STATUS_LABEL[o.status] || o.status) + '</span></td>'
      + '<td>' + (next
          ? '<button data-id="' + esc(o.id) + '" data-to="' + esc(next) + '">'
            + esc(STATUS_LABEL[next]) + ' →</button>' : '<span class="mut">done</span>')
        + (o.status !== 'complete' && o.status !== 'cancelled'
          ? ' <button class="x" data-id="' + esc(o.id) + '" data-to="cancelled">Cancel</button>' : '')
      + '</td></tr>';
  }).join('');

  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + esc(TENANT.name) + ' — Order Desk</title>',
    '<style>',
    ':root{--a:' + A + ';--ink:#0d1b2a;--mute:#5b6b7c;--line:#dde3ea}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:#f4f6f9;color:var(--ink);font:14px/1.55 system-ui,-apple-system,sans-serif}',
    'header{background:var(--ink);color:#fff;padding:18px 24px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}',
    'header h1{margin:0;font-size:17px}header span{font-size:13px;color:#aebccb}',
    'main{max-width:1100px;margin:0 auto;padding:22px 16px 70px}',
    '.bar{background:#fff;border:1px solid var(--line);border-radius:10px;padding:13px 15px;margin:0 0 16px;font-size:13px;color:var(--mute)}',
    'table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}',
    'th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}',
    'th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);background:#fafbfc}',
    '.no{font:600 13px ui-monospace,Menlo,monospace}.when,.mut{font-size:12px;color:var(--mute)}',
    '.ln{font-size:13px}.ln.enq{font-style:italic;color:var(--mute)}',
    '.sku{font:11px ui-monospace,Menlo,monospace;color:#94a3b8}',
    '.chip{display:inline-block;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid}',
    '.s-new{background:#fdf4e3;color:#7a4a00;border-color:#f0dcb0}',
    '.s-confirmed,.s-quoted,.s-accepted{background:#eef4fb;color:#1c4e80;border-color:#c9dcef}',
    '.s-in_fulfilment,.s-shipped,.s-complete{background:#e8f6ee;color:#0f7b4f;border-color:#bfe4ce}',
    '.s-cancelled{background:#fdecec;color:#a32020;border-color:#f3c6c6}',
    'button{font:650 12px system-ui;padding:7px 11px;border-radius:6px;border:1px solid var(--a);background:var(--a);color:#fff;cursor:pointer}',
    'button.x{background:#fff;color:#a32020;border-color:#f3c6c6}',
    '.empty{padding:34px;text-align:center;color:var(--mute)}',
    '.empty a{color:var(--a);font-weight:650}',
    '</style></head><body>',
    '<header><h1>' + esc(TENANT.name) + ' — Order Desk</h1>',
    '<span>Clean Cell and ClearSky work the same queue. Fulfilment is ours; the customer is theirs.</span></header>',
    '<main>',
    '<div class="bar">Orders placed on the storefront in this session. The status ladder is the one '
      + '<code>api/orders.js</code> enforces, and it only moves forward.</div>',
    ORDERS.length
      ? '<table><thead><tr><th>Order</th><th>Customer</th><th>What they asked for</th><th>Status</th>'
        + '<th>Advance</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : '<div class="empty">No orders yet.<br><br>Place one on the '
        + '<a href="/host">storefront</a> and it lands here.</div>',
    '</main>',
    '<' + 'script>',
    'document.addEventListener("click", function (e) {',
    '  var b = e.target.closest && e.target.closest("button[data-id]"); if (!b) return;',
    '  b.disabled = true;',
    '  fetch("/api/ops-advance", { method:"POST", headers:{"content-type":"application/json"},',
    '    body: JSON.stringify({ id: b.getAttribute("data-id"), to: b.getAttribute("data-to") }) })',
    '    .then(function(r){ return r.json(); })',
    '    .then(function(){ location.reload(); })',
    '    .catch(function(){ b.disabled = false; });',
    '});',
    '</' + 'script></body></html>'
  ].join('\n');
}

/* ══════════════════════════════════════════════════════════════════════
   DESIGNING THE SITE
   ──────────────────────────────────────────────────────────────────────
   "our software being used to ... design sites." The real Site Map is
   editor.html — 160k lines and a Firebase session, so it is not something
   this stub server can host. What it CAN do is run the same geometry the
   editor and the site study run (api/_lib/site-fit.js) and draw the result
   to scale on a parcel: setback, access aisles, unit count, the assumptions
   printed on the plan.

   So this is the real engine and a stand-in canvas, and the page says which
   is which. Somebody watching sees a site being laid out from a system size;
   what they do not get is the full editor's drawing tools. */
function designPage(q) {
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var sku = String((q && q.sku) || '');
  var p = null;
  for (var i = 0; i < STOREFRONT.products.length; i++) {
    if (!sku || STOREFRONT.products[i].sku === sku) { p = STOREFRONT.products[i]; if (sku) break; }
  }
  for (var j = 0; j < STOREFRONT.products.length && !sku; j++) {
    if (STOREFRONT.products[j].widthFt && STOREFRONT.products[j].depthFt) { p = STOREFRONT.products[j]; break; }
  }
  var kwh = Number((q && q.kwh) || 1250) || 1250;
  var kw  = Number((q && q.kw) || 600) || 600;

  var study = null, err = '';
  try {
    study = FIT.study(PARCEL_RING,
      { model: p.name, widthFt: p.widthFt, depthFt: p.depthFt, kw: p.kw, kwh: p.kwh },
      { kw: kw, kwh: kwh },
      { setbackFt: STOREFRONT.setbackFt, clearanceFt: STOREFRONT.clearanceFt,
        aisleFt: STOREFRONT.aisleFt, rowsPerBlock: STOREFRONT.rowsPerBlock, usable: null });
  } catch (e) { err = e.message || String(e); }

  var A = TENANT.accent || '#1F6F4A';
  var svg = '';
  if (study && study.parcel && study.parcel.length) {
    var xs = study.parcel.map(function (pt) { return pt.x; });
    var ys = study.parcel.map(function (pt) { return pt.y; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var pad = 18;
    var W = (maxX - minX) + pad * 2, H = (maxY - minY) + pad * 2;
    var tx = function (v) { return (v - minX + pad).toFixed(1); };
    var ty = function (v) { return (v - minY + pad).toFixed(1); };
    var ring = study.parcel.map(function (pt) { return tx(pt.x) + ',' + ty(pt.y); }).join(' ');
    var u = study.usable;
    var units = (study.packing && study.packing.units) || [];
    svg = '<svg viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" width="100%" '
        + 'style="background:#eef2f6;border-radius:10px;border:1px solid #dde3ea">'
        + '<polygon points="' + ring + '" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>'
        + (u ? '<rect x="' + tx(u.x) + '" y="' + ty(u.y) + '" width="' + u.w.toFixed(1)
             + '" height="' + u.h.toFixed(1) + '" fill="none" stroke="#b6c2cf" '
             + 'stroke-dasharray="5 4" stroke-width="1.2"/>' : '')
        + units.map(function (r) {
            return '<rect x="' + tx(r.x) + '" y="' + ty(r.y) + '" width="' + r.w.toFixed(1)
                 + '" height="' + r.h.toFixed(1) + '" fill="' + A + '" fill-opacity=".9" '
                 + 'stroke="#0d1b2a" stroke-width=".6" rx="1"/>';
          }).join('')
        /* ── THE CALLOUT ───────────────────────────────────────────────
           Six 4.5 ft cabinets on a 2.6-acre lot are four pixels wide, and a
           drawing where the thing being sold is invisible has failed at the
           only job it had. Same fix the storefront's site study carries: a
           pad outline round the cluster, a leader, and a label saying what
           is in there. The units stay at true scale — the callout points at
           them rather than enlarging them, because the honest fact on this
           drawing is exactly how little room the system needs. */
        + (function () {
            if (!units.length) return '';
            var ux = units.map(function (r) { return r.x; });
            var uy = units.map(function (r) { return r.y; });
            var ux2 = units.map(function (r) { return r.x + r.w; });
            var uy2 = units.map(function (r) { return r.y + r.h; });
            var bx = Math.min.apply(null, ux), by = Math.min.apply(null, uy);
            var bw = Math.max.apply(null, ux2) - bx, bh = Math.max.apply(null, uy2) - by;
            var m = 6;
            var px = tx(bx - m), py = ty(by - m);
            var pw = (bw + m * 2).toFixed(1), ph = (bh + m * 2).toFixed(1);
            /* Label parked clear of the pad, with a leader back to it. */
            var lx = (+px + +pw + 26).toFixed(1), ly = (+py - 12).toFixed(1);
            var label = units.length + ' \u00d7 ' + (p ? p.name : 'unit');
            var foot = p ? (p.widthFt + ' \u00d7 ' + p.depthFt + ' ft each') : '';
            return '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" '
                 + 'fill="none" stroke="' + A + '" stroke-width="1.4" stroke-dasharray="3 2" rx="2"/>'
                 + '<line x1="' + (+px + +pw).toFixed(1) + '" y1="' + py + '" x2="' + lx + '" y2="' + ly + '" '
                 + 'stroke="' + A + '" stroke-width="1"/>'
                 + '<text x="' + (+lx + 3).toFixed(1) + '" y="' + (+ly - 1).toFixed(1) + '" '
                 + 'font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="#0d1b2a">'
                 + label + '</text>'
                 + '<text x="' + (+lx + 3).toFixed(1) + '" y="' + (+ly + 9).toFixed(1) + '" '
                 + 'font-family="system-ui,sans-serif" font-size="7.5" fill="#5b6b7c">' + foot + '</text>';
          })()
        + '</svg>';
  }

  var pk = (study && study.packing) || {};
  var as = (study && study.assumptions) || {};
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + esc(TENANT.platformName) + ' — Site Map</title>',
    '<style>',
    ':root{--a:' + A + ';--ink:#0d1b2a;--mute:#5b6b7c;--line:#dde3ea}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:#f4f6f9;color:var(--ink);font:14px/1.55 system-ui,-apple-system,sans-serif}',
    'header{background:var(--a);color:#fff;padding:18px 24px}',
    'header h1{margin:0;font-size:17px}header p{margin:5px 0 0;opacity:.9;font-size:13px}',
    'main{max-width:1060px;margin:0 auto;padding:22px 16px 70px;display:grid;grid-template-columns:1fr 300px;gap:20px}',
    '@media(max-width:840px){main{grid-template-columns:1fr}}',
    'section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}',
    'h2{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)}',
    '.kv{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}',
    '.kv:last-child{border-bottom:0}.kv b{font-weight:650}',
    '.note{background:#fdf4e3;border:1px solid #f0dcb0;color:#7a4a00;border-radius:9px;padding:11px 13px;font-size:12.5px;margin:0 0 16px;grid-column:1/-1}',
    '.asm{font-size:12px;color:var(--mute);margin-top:12px;line-height:1.5}',
    'a{color:var(--a);font-weight:650;text-decoration:none}',
    '</style></head><body>',
    '<header><h1>' + esc(TENANT.platformName) + ' · Site Map</h1>',
    '<p>' + esc(p ? p.name : 'system') + ' laid out to scale on the customer’s parcel.</p></header>',
    '<main>',
    '<div class="note"><b>Real geometry, stand-in canvas.</b> The setback, the access aisles and the '
      + 'unit count come from <code>api/_lib/site-fit.js</code> — the same engine behind the site '
      + 'study and the designer. The full Site Map editor (drawing tools, conduit routing, one-line) '
      + 'needs a signed-in session and is not hosted by this demo server.</div>',
    '<section><h2>Site plan</h2>',
    err ? '<p>Could not lay this out: ' + esc(err) + '</p>' : (svg || '<p>No parcel.</p>'),
    '<p class="asm">' + esc(as.basis || '') + '</p></section>',
    '<section><h2>The system</h2>',
    '<div class="kv"><span>Target</span><b>' + kw.toLocaleString() + ' kW / ' + kwh.toLocaleString() + ' kWh</b></div>',
    '<div class="kv"><span>Unit</span><b>' + esc(p ? p.name : '—') + '</b></div>',
    '<div class="kv"><span>Footprint</span><b>' + (p ? p.widthFt + ' × ' + p.depthFt + ' ft' : '—') + '</b></div>',
    '<div class="kv"><span>Units needed</span><b>' + (pk.unitsNeeded != null ? pk.unitsNeeded : '—') + '</b></div>',
    '<div class="kv"><span>Units drawn</span><b>' + (pk.unitsDrawn != null ? pk.unitsDrawn : '—') + '</b></div>',
    '<div class="kv"><span>Yard would hold</span><b>' + (pk.unitsThatFit != null ? pk.unitsThatFit : '—') + '</b></div>',
    '<div class="kv"><span>Fits</span><b>' + (study ? (study.fits ? 'Yes' : 'No') : '—') + '</b></div>',
    '<h2 style="margin-top:18px">Assumptions</h2>',
    '<div class="kv"><span>Property setback</span><b>' + esc(as.setbackFt) + ' ft</b></div>',
    '<div class="kv"><span>Between units</span><b>' + esc(as.clearanceFt) + ' ft</b></div>',
    '<div class="kv"><span>Access aisle</span><b>' + esc(as.aisleFt) + ' ft every ' + esc(as.rowsPerBlock) + ' rows</b></div>',
    '<p class="asm"><a href="/desk">← back to the design desk</a></p>',
    '</section></main></body></html>'
  ].join('\n');
}

/* The demo, in the order the sale happens. One page to open in front of
   somebody, four links to click left to right. */
function demoIndex() {
  var A = TENANT.accent || '#1F6F4A';
  function row(n, title, body, href, label) {
    return '<li><div class="n">' + n + '</div><div><h3>' + title + '</h3><p>' + body + '</p>'
      + '<a href="' + href + '">' + label + ' →</a></div></li>';
  }
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Clean Cell × OMEGA — demo</title>',
    '<style>',
    ':root{--a:' + A + ';--ink:#0d1b2a;--mute:#5b6b7c;--line:#dde3ea}',
    'body{margin:0;background:#f4f6f9;color:var(--ink);font:15px/1.6 system-ui,-apple-system,sans-serif}',
    'header{background:var(--a);color:#fff;padding:26px 24px}',
    'header h1{margin:0;font-size:21px}header p{margin:6px 0 0;opacity:.9;font-size:14px}',
    'main{max-width:780px;margin:0 auto;padding:26px 18px 70px}',
    'ol{list-style:none;margin:0;padding:0}',
    'li{display:flex;gap:16px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 12px}',
    '.n{flex:0 0 32px;height:32px;border-radius:50%;background:var(--a);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}',
    'h3{margin:2px 0 4px;font-size:16px}p{margin:0 0 8px;color:var(--mute);font-size:14px}',
    'a{color:var(--a);font-weight:650;text-decoration:none}a:hover{text-decoration:underline}',
    '.real{background:#e8f6ee;border:1px solid #bfe4ce;color:#0f7b4f;border-radius:9px;padding:12px 14px;font-size:13px;margin:0 0 20px}',
    '</style></head><body>',
    '<header><h1>Clean Cell × ClearSky OMEGA</h1>',
    '<p>The demo, in the order the sale happens.</p></header><main>',
    '<div class="real"><b>Real:</b> the storefront page and loader that ship, the sizing engine, '
      + 'the site-fit geometry, the tool catalogue and the entitlement filter. '
      + '<b>Stubbed:</b> Firestore, the parcel lookup (a fixed ring stands in for Regrid), '
      + 'sign-in, and every gate. Localhost only.</div>',
    '<ol>',
    row(1, 'Part 1 &middot; On their website',
        'What a visitor to cleancell.us sees — the storefront embedded in their page. '
        + 'Size a system from a utility bill, see it drawn on their own lot, place the order. No account.',
        '/host', 'Open the host page'),
    row(2, 'Part 1 &middot; The storefront alone',
        'The same page without the frame, for looking at it closely.',
        '/embed/storefront?k=preview', 'Open the storefront'),
    row(3, 'Part 2 &middot; The design desk they resell',
        'Site Map + Grid Atlas, Clean Cell-branded — and the full catalogue beside it, '
        + 'so you can show what the next sale unlocks.',
        '/desk', 'Open the design desk'),
    row(4, 'Fulfilment &middot; the order desk',
        'Where the order lands. Clean Cell and ClearSky work the same queue — move an order from '
        + 'new through to shipped. Place one on screen 1 first and it appears here.',
        '/ops', 'Open the order desk'),
    row(5, 'Designing the site',
        'The Site Map laying a system out to scale on the customer’s parcel — setback, access '
        + 'aisles, unit count. Real geometry engine, stand-in canvas.',
        '/design', 'Open the site map'),
    row(6, 'The door',
        'What somebody without an account is told when they reach the designer. '
        + 'The refusal is the pitch. Also /gate/pending, /suspended, /plan, /active.',
        '/gate/signed-out', 'Open the gate'),
    '</ol></main></body></html>'
  ].join('\n');
}

var server = http.createServer(function (req, res) {
  var u = url.parse(req.url, true);
  var p = u.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  /* The demo walkthrough is the front door now — four links in the order
     the sale happens. The host page moved to /host so the old link still
     works for anyone who bookmarked it. */
  if (p === '/' || p === '/index.html') return send(res, 200, demoIndex(), TYPES['.html']);
  if (p === '/host' || p === '/host.html') return send(res, 200, HOST_PAGE, TYPES['.html']);
  if (p === '/desk' || p === '/desk.html') return send(res, 200, deskPage(), TYPES['.html']);
  if (p === '/ops' || p === '/ops.html') return send(res, 200, opsPage(), TYPES['.html']);
  if (p === '/design' || p === '/design.html') return send(res, 200, designPage(u.query), TYPES['.html']);

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

  if (p === '/api/ops-advance') {
    if (req.method !== 'POST') return fail(res, 405, 'POST only');
    return readBody(req).then(function (b) {
      return opsAdvance(res, b);
    });
  }

  send(res, 404, 'not found', 'text/plain');
});

/* 127.0.0.1 ONLY. This server checks no key, no origin and no receipt. */
server.listen(PORT, '127.0.0.1', function () {
  console.log('\n  Clean Cell \u00d7 OMEGA demo');
  console.log('  ────────────────────────');
  console.log('  START HERE — the walkthrough, in sale order:');
  console.log('      http://localhost:' + PORT + '/');
  console.log('');
  console.log('  Part 1  their website, storefront embedded   /host');
  console.log('  Part 1  the storefront alone                 /embed/storefront?k=preview');
  console.log('  Part 2  the two-tool design desk             /desk');
  console.log('  Fulfil  the order desk (orders land here)    /ops');
  console.log('  Design  a site laid out to scale            /design');
  console.log('  The door, per account state                  /gate/signed-out');
  console.log('          (also /pending /suspended /plan /active)');
  console.log('\n  Real: the page, the sizing engine, the site-fit geometry.');
  console.log('  Stub: Firestore, the parcel lookup, and every gate.');
  console.log('  Localhost only — it authorises nothing.\n');
});
