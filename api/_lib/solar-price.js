/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Dollars for a solar design. The shared library is api/_lib/pricing.js
 * quote(), the one preview interface (surface 'editor-v2'). This file
 * does not keep a second price book.
 *
 * On a branch where that module is not present yet, the same call shape
 * is filled from the same public table the library cites: DOE Solar
 * Photovoltaic System Cost Benchmarks, Q1 2025, Table 2, 2024 USD.
 * A carport stays without a price, because that table does not publish
 * one and the library leaves pv.canopy as "needs source".
 * The labor index is quote().region when the library is here. Table 2
 * does not separate install labor, so the all-in $/Wdc is not multiplied
 * by the index. That is the library's rule.
 */
'use strict';

var SOURCE = {
  title: 'U.S. Department of Energy, Solar Photovoltaic System Cost Benchmarks, Q1 2025, Table 2 (PV-only modeled market price, 2024 USD)',
  url: 'https://www.energy.gov/cmei/systems/solar-photovoltaic-system-cost-benchmarks',
  published: '2025-11-13',
  dollarYear: 2024
};

var MMP = {
  residential: { usdPerWdc: 2.95, low: 2.319, high: 3.248, label: 'Residential rooftop PV, installed' },
  commercial: { usdPerWdc: 1.98, low: 1.435, high: 2.093, label: 'Commercial rooftop PV, installed' },
  utility: { usdPerWdc: 1.12, low: 0.981, high: 1.12, label: 'Utility-scale PV, installed' }
};

/* The library's pvSector, kept only so a missing module still sorts
   size the same way. quote() wins when it can be loaded. */
function sectorOf(kw, mount) {
  if (mount === 'canopy' || mount === 'carport') return 'canopy';
  var k = +kw || 0;
  if (k > 0 && k < 25) return 'residential';
  if (k >= 20000) return 'utility';
  return 'commercial';
}

function libMount(byMount) {
  var out = {}, g = 0, r = 0;
  byMount = byMount || {};
  if (byMount.roof > 0) out.roof = byMount.roof;
  if (byMount.ground > 0) g += byMount.ground;
  if (byMount.tracker > 0) g += byMount.tracker;
  if (g > 0) out.ground = g;
  if (byMount.canopy > 0) out.canopy = byMount.canopy;
  if (byMount.carport > 0) out.canopy = (out.canopy || 0) + byMount.carport;
  return out;
}

function loadPricing() {
  try { return require('./pricing'); }
  catch (e) { return null; }
}

function line(id, label, kw, price, note, status) {
  var qty = kw > 0 ? kw * 1000 : null;
  var amount = price != null && qty != null ? Math.round(qty * price) : null;
  return {
    id: id,
    label: label,
    qty: qty,
    qtyUnit: 'Wdc',
    price: price,
    unit: '$/Wdc',
    amount: amount,
    source: SOURCE.title,
    url: SOURCE.url,
    published: SOURCE.published,
    dollarYear: SOURCE.dollarYear,
    regionFactor: 1,
    region: 'national',
    confidence: price == null ? 'none' : 'high',
    status: status || (price == null ? 'needs source' : 'sourced'),
    inTotal: amount != null,
    note: note
  };
}

function fallback(spec) {
  var mounts = spec.byMount || {};
  var keys = Object.keys(mounts);
  var lines = [], i, k, kw, sector, book, note;
  if (!keys.length && spec.kwDc > 0) {
    mounts = {};
    mounts[spec.mount || 'roof'] = spec.kwDc;
    keys = Object.keys(mounts);
  }
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    kw = +mounts[k] || 0;
    if (!(kw > 0)) continue;
    sector = sectorOf(kw, k === 'tracker' ? 'ground' : (k === 'carport' ? 'canopy' : k));
    if (k === 'canopy' || k === 'carport' || sector === 'canopy') {
      lines.push(line('pv.canopy', 'Solar canopy, installed', kw, null,
        'Table 2 does not publish a carport price. The shared library leaves this line as needs source. No figure is invented here.',
        'needs source'));
      continue;
    }
    book = MMP[sector] || MMP.commercial;
    note = 'National overnight price. The install-labor share is not separated in Table 2, so a state labor index is not applied. ';
    if (k === 'tracker') note += 'A tracker uses the same size-based price as ground mount. Table 2 does not publish a separate tracker price. ';
    if (k === 'ground') note += 'Ground mount uses the size-based price. Table 2\'s commercial figure is a rooftop benchmark. ';
    lines.push(line('pv.' + sector + '.mmp', book.label + (k === 'tracker' ? ' (tracker, same benchmark)' : ''), kw, book.usdPerWdc, note, 'sourced'));
  }
  var total = 0, pricedW = 0;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].inTotal && lines[i].amount != null) {
      total += lines[i].amount;
      pricedW += lines[i].qty;
    }
  }
  return {
    ok: true,
    via: 'fallback',
    version: 'pricing-library-unavailable',
    preview: true,
    surface: 'editor-v2',
    region: {
      factor: null,
      geography: 'national',
      status: 'needs source',
      appliesTo: 'labor',
      note: 'api/_lib/pricing.js did not load, so quote().region is not available. The labor index is not guessed.'
    },
    lines: lines,
    totals: {
      usd: total > 0 ? total : null,
      perWdc: pricedW > 0 ? Math.round((total / pricedW) * 1000) / 1000 : null
    },
    needsSource: lines.filter(function (l) { return l.status === 'needs source'; }).map(function (l) { return { id: l.id, label: l.label }; })
  };
}

function quote(spec) {
  spec = spec || {};
  var Pricing = loadPricing();
  var body = {
    preview: true,
    surface: 'editor-v2',
    solarKwDc: spec.kwDc || 0,
    state: spec.state || null,
    zip: spec.zip || null,
    solar: { byMount: libMount(spec.byMount) },
    mount: spec.mount || 'roof'
  };
  if (Pricing && typeof Pricing.quote === 'function') {
    var q = Pricing.quote(body);
    q.via = 'pricing.quote';
    q.requested = body;
    return q;
  }
  var fb = fallback(spec);
  fb.requested = body;
  return fb;
}

module.exports = {
  SOURCE: SOURCE,
  MMP: MMP,
  sectorOf: sectorOf,
  libMount: libMount,
  quote: quote,
  VERSION: 'solar-price/1'
};
