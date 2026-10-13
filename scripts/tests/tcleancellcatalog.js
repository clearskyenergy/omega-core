/* CleanCell Rev H reference catalog: node scripts/tests/tcleancellcatalog.js */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.resolve(__dirname, '../..');
var code = fs.readFileSync(path.join(root, 'omega-cleancell-catalog.js'), 'utf8');
var api = require(path.join(root, 'omega-cleancell-catalog.js'));
var n = 0;
function check(value, message) { assert.ok(value, message); n++; }
var refs = api.entries(), keys = Object.keys(refs);
check(keys.length === 3, 'three Rev H products');
var cc = refs[keys[0]], lg = refs[keys[1]], sm = refs[keys[2]];
check(cc.kw === 125 && cc.kwh === 289.3, 'CC AC/DC ratings');
check(lg.kw === 1000 && lg.kwh === 2294, 'LG installed DC is NOT 2000');
check(lg.modeledUsableKwh === 2000 && lg.usable === null, 'modeled is not guaranteed usable');
check(sm.kw === 1000 && sm.kwh === 2000 && sm.nominalEnergyApproximate, 'Smart nominal DC is approximate');
check(cc.dcv === '921.6' && cc.dcMinV === 806.4 && cc.dcMaxV === 1036.8, 'CC voltage window');
check(cc.standardDcCurrentA === 157, 'standard reference current, not invented max');
check(cc.dimensionsMm.width === 1200 && cc.dimensionsMm.depth === 1330 && cc.dimensionsMm.height === 2350, 'cabinet dimensions');
check(Math.abs(cc.widthFt * 304.8 - 1200) < 1e-8, 'width conversion');
check(Math.abs(cc.depthFt * 304.8 - 1330) < 1e-8, 'depth conversion');
check(cc.weightKg === 2900 && cc.weightStatus === 'reference', 'weight qualified');
check(!cc._incPCS && lg._incPCS && !sm._incPCS, 'physical PCS arrangement');
check(/SEPARATE AC skid/.test(sm.dims), 'Smart skid footprint retained');
check(/do NOT establish a UL 9540 listing/.test(cc.verification), '9540A testing is not system listing');
check(/UNVERIFIED/.test(lg.verification), 'no verified BABA claim');
keys.forEach(function (k) {
  var p = refs[k];
  check(p.usable === null, k + ' delivered AC remains unknown');
  check(p.ikva === null, k + ' no fabricated kVA');
  check(!p._incXfmr && !p._incDisco, k + ' no assumed integrated site transformer/disconnect');
  check(p.acVoltage === 480 && p.acPhases === 3 && p.acFrequencyHz === 60, k + ' AC basis');
  check(p.sourceRevision === 'H' && p.sourceDate === '2026-10-06' && p.sourcePages.indexOf(19) !== -1, k + ' provenance');
  check(p.durationBasis === 'DC-nameplate-ratio-not-delivered-AC', k + ' DC duration qualified');
  check(p.bomOverview.every(function (x) { return x.quantity === null || x.quantity === 1; }), k + ' no invented module counts');
  check(p.pricingStatus === 'quote-required', k + ' quote required');
  check(!Object.prototype.hasOwnProperty.call(p, '_tenant'), k + ' not a tenant default');
  ['eqcost', 'listPrice', 'dcPerKwh', 'pcsPerKw', 'unitCost', 'price'].forEach(function (field) {
    check(!Object.prototype.hasOwnProperty.call(p, field), k + ' no private ' + field);
  });
});
[lg, sm].forEach(function (p) {
  check(p.widthFt === null && p.depthFt === null && p.heightFt === null, 'unknown footprint stays unknown');
  check(p.weightKg === null && p.dimensionsStatus === 'pending-release', 'unknown engineering is not zero');
});
var old = { model: 'Existing tenant system' }, catalog = { OLD: old };
check(api.mergeInto(catalog).length === 3 && catalog.OLD === old, 'additive merge');
check(api.mergeInto(catalog).length === 3 && Object.keys(catalog).length === 4, 'idempotent merge');
catalog[keys[0]].notes = 'local edit';
check(api.entries()[keys[0]].notes !== 'local edit', 'catalog entries are fresh copies');
var collision = {}; collision[keys[0]] = old;
check(api.mergeInto(collision).length === 2 && collision[keys[0]] === old, 'never overwrite a colliding saved catalog key');
check(api.mergeInto(null).length === 0, 'no catalog is safe');

/* Minimal DOM with real event ordering; no network or Firebase needed. */
function dom() {
  var doc = { readyState: 'loading', events: {} };
  function node(tag) {
    return {
      tagName: tag.toUpperCase(), children: [], style: {}, listeners: {}, value: '',
      appendChild: function (child) { child.parentNode = this; this.children.push(child); return child; },
      insertBefore: function (child, sibling) {
        child.parentNode = this; var i = this.children.indexOf(sibling);
        if (i < 0) this.children.push(child); else this.children.splice(i, 0, child); return child;
      },
      setAttribute: function (k, v) { this[k] = v; },
      addEventListener: function (k, f) { (this.listeners[k] || (this.listeners[k] = [])).push(f); },
      fire: function (k) { (this.listeners[k] || []).forEach(function (f) { f(); }); }
    };
  }
  doc.body = node('body'); doc.head = node('head'); doc.documentElement = node('html');
  doc.documentElement.appendChild(doc.head); doc.documentElement.appendChild(doc.body);
  doc.createElement = node;
  doc.getElementById = function (id) {
    function find(p) { if (p.id === id) return p; for (var i = 0; i < p.children.length; i++) { var r = find(p.children[i]); if (r) return r; } return null; }
    return find(doc.documentElement);
  };
  doc.addEventListener = function (k, f) { (doc.events[k] || (doc.events[k] = [])).push(f); };
  doc.ready = function () { doc.readyState = 'complete'; (doc.events.DOMContentLoaded || []).forEach(function (f) { f(); }); };
  var select = node('select'); select.id = 'bm-catalog'; select.value = 'OLD'; doc.body.appendChild(select);
  var mfr = node('input'); mfr.id = 'bm-mfr'; mfr.value = 'Tenant Brand'; doc.body.appendChild(mfr);
  var preview = node('div'); preview.id = 'bm-catalog-preview'; doc.body.appendChild(preview);
  return doc;
}
var doc = dom(), uiCatalog = { OLD: old };
var originalCalls = 0, sel = doc.getElementById('bm-catalog');
sel.addEventListener('change', function () { originalCalls++; });
api.install(uiCatalog, doc);
check(sel.value === 'OLD', 'install preserves selection');
check(doc.getElementById('bm-mfr').value === 'Tenant Brand', 'install preserves tenant manufacturer');
check(doc.getElementById('bm-cat-cleancell-revh').children.length === 3, 'three actual picker options');
api.install(uiCatalog, doc);
check(doc.getElementById('bm-cat-cleancell-revh').children.length === 3, 'no duplicated options');
check(sel.listeners.change.length === 2, 'one existing and one added listener, not overwritten');
check(doc.getElementById('bm-cleancell-revh-details').hidden, 'other product has no CleanCell panel');
keys.forEach(function (k) {
  sel.value = k; sel.fire('change');
  var panel = doc.getElementById('bm-cleancell-revh-details');
  check(!panel.hidden, k + ' selecting displays specifications');
  check(panel.textContent.indexOf(uiCatalog[k].energyBasis) !== -1, k + ' correct energy basis shown');
  check(panel.textContent.indexOf('NOT a verified installation footprint') !== -1, k + ' footprint warning visible');
  check(panel.textContent.indexOf('Functional package BOM') !== -1, k + ' included package overview');
});
check(originalCalls === 3, 'native catalog change handler still runs');
sel.value = 'OLD'; sel.fire('change');
check(doc.getElementById('bm-cleancell-revh-details').hidden, 'switching back hides panel');

/* Head-loaded script sees the later lexical catalog at DOMContentLoaded. */
var d2 = dom(), sandbox = { window: { document: d2 }, console: console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
check(!d2.getElementById('bm-cat-cleancell-revh'), 'waits for DOM and catalog initialization');
vm.runInContext('const BESS_CATALOG = { OLD: { model: "Old" } };', sandbox);
d2.ready();
check(d2.getElementById('bm-cat-cleancell-revh').children.length === 3, 'boots against actual global lexical binding');
check(vm.runInContext('BESS_CATALOG["CLEANCELL-LGJP2-1000-REV-H"].kw', sandbox) === 1000, 'global catalog receives project AC target');
var empty = { window: {} }; vm.createContext(empty); vm.runInContext(code, empty);
check(!!empty.window.OmegaCleanCellCatalog, 'pages without DOM/Firebase are safe');

/* Check the production loader fragment when the complete repository is present. */
var loaderPath = path.join(root, 'omega-bess-products.js');
var loader = fs.existsSync(loaderPath) ? fs.readFileSync(loaderPath, 'utf8') : fs.readFileSync(path.join(root, 'bootstrap.js'), 'utf8');
var marker = loader.indexOf('/* Public reference specifications extend');
check(marker >= 0, 'loader is wired into the script already loaded by editor.html');
var bootstrap = loader.slice(marker), d3 = dom();
var sb = { window: { document: d3 } }; vm.createContext(sb); vm.runInContext(bootstrap, sb);
check(!d3.getElementById('omega-cleancell-catalog-script'), 'loader waits for DOM');
d3.ready();
var script = d3.getElementById('omega-cleancell-catalog-script');
check(script && script.src === '/omega-cleancell-catalog.js?v=20261010-revh2', 'same-origin versioned loader');
vm.runInContext(bootstrap, sb);
check(d3.head.children.length === 1, 'loader runs once');
console.log('CleanCell catalog: ' + n + ' checks passed');
